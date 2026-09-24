"""가상 보드의 MQTT — micropython-lib `umqtt.simple` 흉내(PLAN §6.3·§7.4, P4-06).

학생 코드에서(실물 보드에 올리는 코드와 글자가 같다):
    from umqtt.simple import MQTTClient

    def on_message(topic, msg):
        print(topic, msg)

    client = MQTTClient("board-01", "broker.emqx.io")
    client.set_callback(on_message)
    client.connect()
    client.subscribe(b"led")
    client.publish(b"led", b"on")
    while True:
        client.check_msg()        # 온 것이 있으면 콜백을 부른다(없으면 바로 돌아온다)
        time.sleep(0.1)

흉내 낸 것: `MQTTClient(client_id, server, port, user, password, keepalive, ssl, ssl_params)` ·
`set_callback` · `set_last_will` · `connect` · `disconnect` · `ping` · `publish` · `subscribe` · `check_msg` · `wait_msg`
(micropython-lib umqtt.simple의 공개 함수와 같은 이름·차례).

가상 보드에서 달라지는 것(학생에게도 화면에서 알려 준다)
- 브라우저는 TCP 1883 포트를 쓸 수 없어 **WebSocket(wss://)** 으로 중계 서버에 붙는다(PLAN §7.3). 그래서 `server`에 적은
  이름이 같아도 실제 주소·포트는 화면이 고른 것이다. 학교망이 막으면 **같은 컴퓨터 탭 통로**로 스스로 바뀐다(PD-17).
- 토픽 앞에는 이 수업의 **무작위 접두어**가 붙는다(PD-29 — 공개 서버에서 남의 메시지와 섞이지 않게). 콜백에는 학생이
  쓴 토픽 그대로 돌려준다.
- QoS는 0, retain은 쓰지 않는다(PLAN §7.4).
- 실제 보드로 보내는 길에는 화면이 **허용 명령 목록과 길이 검사**를 건다(PD-29: 레이저·모터는 공개 서버에 잇지 않는다).

규칙(src/lab/README.md 4.4): `apc_runtime`의 request·poll·drain·sleep·notice만 쓰고, 이 파일을 불러올 때(동기 진입점)는 양보하지 않는다.
라이선스: 사이트 소프트웨어(MIT, PD-26). umqtt.simple의 코드를 옮기지 않고 **API 모양만** 같게 새로 썼다.
"""

import sys
import types

import apc_board
import apc_runtime

REQUEST_CONNECT = "mqtt.connect"
REQUEST_PUBLISH = "mqtt.publish"
REQUEST_SUBSCRIBE = "mqtt.subscribe"
REQUEST_DISCONNECT = "mqtt.disconnect"
CHANNEL_INBOX = "mqtt.inbox"

#: check_msg·wait_msg가 아직 꺼내지 않은 메시지(화면이 보낸 것을 poll로 받아 여기에 쌓는다).
#: 이 통은 **모듈 하나에 하나**다 — 화면 연결도 탭마다 하나(src/lab/mqtt/session.ts)라 통도 하나면 맞다.
#: 한 코드에서 MQTTClient를 둘 만들면 먼저 check_msg를 부른 쪽이 가져간다(교과서 예제는 하나만 쓴다).
_inbox = []


class MQTTException(Exception):
    """umqtt.simple과 같은 이름의 오류(프로토콜 문제)."""


def _text(value, default=""):
    if value is None:
        return default
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).decode("utf-8", "replace")
    return str(value)


def _as_bytes(value):
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    if isinstance(value, str):
        return value.encode("utf-8")
    if isinstance(value, (list, tuple)):
        return bytes(bytearray(value))
    return str(value).encode("utf-8")


#: JS 쪽 거절이 파이썬으로 올 때 앞에 붙는 말들(학생이 읽을 글에서는 뗀다)
_ERROR_PREFIXES = ("PythonError:", "pyodide.ffi.JsException:", "JsException:", "Error:", "OSError:")


def _clean_message(error):
    """JS 거절 메시지에서 학생이 읽을 한 줄만 남긴다."""
    text = str(error).strip()
    lines = [line.strip() for line in text.split("\n") if line.strip() != ""]
    text = lines[-1] if lines else ""
    changed = True
    while changed:
        changed = False
        for prefix in _ERROR_PREFIXES:
            if text.startswith(prefix):
                text = text[len(prefix) :].strip()
                changed = True
    return text


def _ask(kind, payload):
    """화면에 부탁하고 답을 기다린다. 화면이 거절하면 한국어가 든 OSError로 바꿔 준다(실물의 소켓 오류 자리)."""
    try:
        return apc_runtime.request(kind, payload)
    except KeyboardInterrupt:
        raise
    except Exception as error:  # noqa: BLE001 — JS 쪽 거절은 JsException으로 온다
        message = _clean_message(error)
        if message == "":
            message = "MQTT 요청을 처리하지 못했어요."
        raise OSError(message) from None


def _drain_inbox():
    """화면이 보낸 메시지를 받아 둔다(입력 확인 지점)."""
    for item in apc_runtime.poll(CHANNEL_INBOX):
        if isinstance(item, dict):
            _inbox.append(item)


class MQTTClient:
    """umqtt.simple.MQTTClient와 같은 모양의 가상 클라이언트."""

    def __init__(self, client_id, server, port=0, user=None, password=None, keepalive=0, ssl=False, ssl_params=None):
        self.client_id = _text(client_id, "board")
        self.server = _text(server)
        self.port = int(port or 0)
        self.user = user
        self.keepalive = int(keepalive or 0)
        self.ssl = ssl
        self.ssl_params = ssl_params
        self.cb = None
        self.lw_topic = None
        self.lw_msg = None
        self._connected = False
        self._where = ""
        self._via = ""

    def set_callback(self, f):
        """메시지가 오면 부를 함수를 정한다 — f(topic: bytes, msg: bytes)"""
        self.cb = f

    def set_last_will(self, topic, msg, retain=False, qos=0):
        """연결이 끊겼을 때 중계 서버가 대신 보낼 메시지. 가상 보드는 받아만 두고 쓰지 않는다."""
        self.lw_topic = _as_bytes(topic)
        self.lw_msg = _as_bytes(msg)

    def connect(self, clean_session=True, timeout=None):
        """중계 서버(또는 같은 컴퓨터 탭 통로)에 붙는다. umqtt처럼 0을 돌려준다(이어 쓰던 session 없음)."""
        answer = _ask(
            REQUEST_CONNECT,
            {
                "clientId": self.client_id,
                "server": self.server,
                "port": self.port,
                "keepalive": self.keepalive,
                "ssl": bool(self.ssl),
                "clean": bool(clean_session),
            },
        )
        if not isinstance(answer, dict):
            answer = {}
        self._connected = True
        self._where = _text(answer.get("where"))
        self._via = _text(answer.get("via"))
        return 0

    def disconnect(self):
        if not self._connected:
            return None
        self._connected = False
        _ask(REQUEST_DISCONNECT, {"clientId": self.client_id})
        return None

    def ping(self):
        """살아 있는지 알리는 신호. 가상 보드는 연결 여부만 본다."""
        self._check_connected()
        return None

    def _check_connected(self):
        if not self._connected:
            raise OSError("MQTT에 아직 연결하지 않았어요. client.connect()를 먼저 불러요.")

    def publish(self, topic, msg, retain=False, qos=0):
        """토픽에 메시지를 보낸다(QoS 0, retain 끔)."""
        self._check_connected()
        _ask(
            REQUEST_PUBLISH,
            {
                "topic": _text(topic),
                "bytes": list(_as_bytes(msg)),
                "retain": bool(retain),
                "qos": int(qos or 0),
            },
        )
        return None

    def subscribe(self, topic, qos=0):
        """이 토픽을 받기로 한다."""
        self._check_connected()
        _ask(REQUEST_SUBSCRIBE, {"topic": _text(topic), "qos": int(qos or 0)})
        return None

    def _handle(self, item):
        topic = _as_bytes(item.get("topic", ""))
        payload = item.get("bytes", [])
        if isinstance(payload, (list, tuple)):
            message = bytes(bytearray(int(value) & 0xFF for value in payload))
        else:
            message = _as_bytes(payload)
        if self.cb is not None:
            self.cb(topic, message)
        return message

    def check_msg(self):
        """온 메시지가 있으면 하나만 콜백에 넘기고 돌아온다. 없으면 바로 None(umqtt와 같다)."""
        self._check_connected()
        _drain_inbox()
        if not _inbox:
            return None
        self._handle(_inbox.pop(0))
        return None

    def wait_msg(self):
        """메시지가 올 때까지 기다렸다가 콜백에 넘긴다. [정지]를 누르면 여기서 멈춘다."""
        self._check_connected()
        while True:
            _drain_inbox()
            if _inbox:
                self._handle(_inbox.pop(0))
                return None
            # 기다리는 동안 화면 메시지를 받는다(0.02초마다 확인 — 실물의 블로킹 소켓과 같은 자리).
            apc_runtime.sleep(0.02)


def _reset():
    """실행이 시작될 때 지난 실행에서 온 메시지를 버린다(동기 진입점 — drain만 쓴다)."""
    _inbox.clear()
    apc_runtime.drain(CHANNEL_INBOX)


apc_runtime.register_reset_hook(_reset)


def _make_package():
    """`import umqtt` · `from umqtt.simple import MQTTClient` 두 모양을 모두 받는다(ext/network/README.md)."""
    umqtt = types.ModuleType("umqtt")
    simple = types.ModuleType("umqtt.simple")
    simple.MQTTClient = MQTTClient
    simple.MQTTException = MQTTException
    umqtt.simple = simple
    umqtt.MQTTClient = MQTTClient
    sys.modules.setdefault("umqtt", umqtt)
    sys.modules.setdefault("umqtt.simple", simple)
    return umqtt


UMQTT_PACKAGE = _make_package()
apc_board.register_board_module("umqtt", UMQTT_PACKAGE)
