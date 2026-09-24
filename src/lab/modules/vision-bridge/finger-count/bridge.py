"""컴퓨터 쪽 통신 모듈 `bridge` — 새 예제가 보드로 글자 한 줄을 보낼 때 쓴다(PLAN §7.6 "새 예제용 bridge 모듈", P4-08 구역 G).

학생 코드에서 쓰는 법(영상처리 실습실)
    import bridge

    bridge.send(str(count))        # 상태(지금 값). 앞에 보낸 값과 **같으면 보내지 않는다**(§7.2 규칙 4). 끝에 줄바꿈(\\n) 한 개를 붙인다.
    bridge.event("CLICK")          # 한 번 일어난 일(클릭·윙크). 같은 값이어도 늘 보낸다(§7.2 규칙 5).
    bridge.send_bytes(bytes([3]))  # 바이트 그대로(끝 문자를 붙이지 않는다 — §7.2 규칙 7)
    line = bridge.receive()        # 보드가 보낸 한 줄(끝의 줄바꿈을 뗀 글자). 아직 한 줄이 다 오지 않았으면 None

- **통로는 코드에 적지 않는다.** 같은 컴퓨터 탭·한 화면 모드·블루투스(실제 보드)·USB 데이터 포트·MQTT 가운데 무엇으로 보낼지는
  화면의 [보내기] 패널에서 고른다(§7.6). 그래서 이 파일에는 포트 이름도, 기기 주소도, 브로커 주소도 없다 — 같은 코드가 모든 통로에서 돈다.
- 처음 보낼 때(또는 receive()를 처음 부를 때) 통로가 저절로 열린다. 받을 쪽 화면(ESP32 실습실)이 없으면 **BridgeNoPeer**,
  통로를 열지 못했으면 **BridgeClosed**를 낸다. 둘 다 BridgeError의 한 갈래라 `except bridge.BridgeError:`로 한꺼번에 잡을 수 있다.
  두 이름은 오류 사전(content/help/errors/errors.yaml)의 comm-no-peer·comm-closed 항목이 한국어로 풀어 준다.
- 보내는 빈도(초당 10회)·밀린 상태 값 바꿔 끼우기·20바이트 경고·콘솔의 `Sent: …` 줄은 화면 쪽 보낼 차례가 맡는다(P4-01 BridgeOutbox).
- 한 코드에서 `serial`(pyserial 흉내)과 `bridge`를 함께 쓰지 않는다 — 둘은 같은 선을 나눠 써서 받은 바이트를 서로 가져간다.

어디로 이어지나(구역 A가 만든 선을 그대로 쓴다 — 이 모듈은 새 요청·이벤트 이름을 만들지 않는다)
    bridge.send("3") → 이벤트 'serial-pc.tx' { bytes: [51, 10], baud: 0, category: 'state' }
      → src/lab/modules/serial-pc/index.ts → vision-bridge의 선(link.ts, 보낼 차례) → 브릿지 통로(BroadcastChannel 등)
      → ESP32 실습실의 가상 USB-UART 변환기 → 보드 UART2의 readline()
    보드 uart.write(…) → 그 반대 길 → 채널 'serial-pc.rx' → bridge.receive()
  이름을 serial-pc 모듈의 것으로 쓰는 까닭: 이 파일의 자리(src/lab/modules/vision-bridge/finger-count/)는 폴더 모듈이 아니라
  manifest를 가질 수 없고, 같은 선을 써야 통로를 바꿔도 받는 쪽 코드가 같다(§7.2 규칙 6). 자기 이름을 갖게 옮기는 것은 통합 단계의 몫이다
  (요청서 .cache/phase4-requests/scenario-f.md). category는 지금 화면 쪽이 읽지 않지만(모든 바이트를 모양으로 판정) 요청이 반영되면
  event()가 보낸 것이 병합되지 않는다(§7.2 규칙 5).

ESP32 실습실(가상 보드)에서는 import부터 막는다: 실물 ESP32에는 bridge 모듈이 없어서(`ImportError`) 가상 보드도 같게 한다.
보드는 컴퓨터가 보낸 줄을 UART(`uart.readline()`)나 블루투스(`ESP32BLE.read()`)로 받는다(보충 C3 보드 쪽 예제).

규칙(src/lab/README.md 4.4, PROGRESS 미해결 25번): 초기화 함수 _reset은 동기 진입점이라 양보하는 함수(get·poll·sleep·request)를 쓰지 않고 drain만 쓴다.
라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import sys

if "apc_board" in sys.modules:
    # ESP32 실습실 워커(가상 보드 흉내가 들어 있다) — 실물 MicroPython처럼 모듈이 없는 것으로 알린다.
    raise ModuleNotFoundError(
        "No module named 'bridge' (bridge는 컴퓨터(영상처리 실습실)에서 쓰는 사이트 모듈이라 ESP32 보드에는 없어요. "
        "보드는 컴퓨터가 보낸 줄을 UART(uart.readline())나 블루투스(ESP32BLE.read())로 받아요.)",
        name="bridge",
    )

import apc_runtime

__all__ = [
    "BridgeClosed",
    "BridgeError",
    "BridgeNoPeer",
    "MAX_BYTES",
    "TERMINATOR",
    "close",
    "connect",
    "event",
    "info",
    "is_open",
    "last_sent",
    "receive",
    "receive_bytes",
    "send",
    "send_bytes",
]

#: 화면 쪽(구역 A, src/lab/modules/serial-pc/manifest.ts)이 정해 둔 이름 — 이 모듈은 새 이름을 만들지 않는다.
REQUEST_OPEN = "serial-pc.open"
EVENT_TX = "serial-pc.tx"
EVENT_CONTROL = "serial-pc.control"
CHANNEL_RX = "serial-pc.rx"
VALUE_INFO = "serial-pc.info"

#: 메시지 끝 문자 한 개(§7.2 규칙 2)
TERMINATOR = "\n"
#: 한 번에 보내기 좋은 크기(§7.2 규칙 3). 넘으면 화면이 한국어로 알려 주고, 블루투스에서는 실물처럼 잘린다.
MAX_BYTES = 20
#: 속도를 적지 않는다(0 = 받는 보드와 같은 속도로 맞춤). 속도는 UART 실습(3-1-2)의 pyserial 흉내에서만 뜻이 있다.
_AUTO_BAUD = 0
#: 화면이 "받을 쪽 없음"을 알릴 때 쓰는 글(구역 A serial-pc/index.ts noPeerMessage) — 답에 reason이 없을 때만 이 글로 가른다.
_NO_PEER_MARK = "찾지 못했어요"

_open = False
_last = None
_label = ""
_buffer = bytearray()


class BridgeError(RuntimeError):
    """bridge 통신이 되지 않을 때의 공통 갈래(한국어 까닭이 들어 있다). `except bridge.BridgeError:`로 아래 둘을 함께 잡는다."""


class BridgeNoPeer(BridgeError):
    """받을 쪽 화면(ESP32 실습실 탭·한 화면 모드)을 찾지 못했다 — 오류 사전 comm-no-peer"""


class BridgeClosed(BridgeError):
    """통로를 열지 못했거나 닫혀 있다 — 오류 사전 comm-closed"""


def _info():
    """화면이 넣어 둔 선 상태 { 'ready': bool, 'peers': [...], 'label': str, 'prefix': str }(입력 확인 지점)"""
    value = apc_runtime.get(VALUE_INFO)
    return value if isinstance(value, dict) else {}


def info():
    """지금 선 상태를 사전으로 돌려준다(받을 쪽이 이어졌는지 보고 싶을 때 — 예: bridge.info()["ready"])."""
    return dict(_info())


def is_open():
    """통로가 열려 있나(이번 실행에서 한 번이라도 보냈거나 connect()를 불렀으면 참)"""
    return _open


def connect():
    """통로를 연다. 처음 보낼 때 저절로 열리므로 보통은 부르지 않아도 된다. 열리면 True.

    받을 쪽 화면이 없으면 BridgeNoPeer, 통로를 열지 못했으면 BridgeClosed를 낸다(한국어 까닭과 함께).
    """
    global _open, _last, _label
    if _open:
        return True
    try:
        reply = apc_runtime.request(REQUEST_OPEN, {"port": None, "baudrate": _AUTO_BAUD, "timeout": None})
    except Exception:  # 화면이 이 요청을 모르는 곳(흉내 모듈이 붙지 않은 화면)
        raise BridgeError(
            "이 화면에서는 bridge로 보낼 수 없어요. 영상처리 실습실에서 [보내기] 패널이 있는 화면으로 열어요."
        ) from None
    reply = reply if isinstance(reply, dict) else {}
    if not reply.get("ok"):
        text = str(reply.get("error") or "통신 통로를 열지 못했어요.")
        reason = reply.get("reason")
        if reason == "no-peer" or (reason is None and _NO_PEER_MARK in text):
            raise BridgeNoPeer(text)
        raise BridgeClosed(text)
    _open = True
    _last = None
    _label = str(reply.get("label") or "")
    for text in reply.get("notices") or []:
        apc_runtime.notice(str(text))
    if _label:
        apc_runtime.notice(f"bridge: '{_label}' 통로로 보내요. 통로는 [보내기] 패널에서 바꿔요.")
    return True


def close():
    """통로를 닫는다(보통은 실행이 끝날 때 저절로 정리된다). 다시 보내면 다시 열린다."""
    global _open, _last
    if not _open:
        return
    _open = False
    _last = None
    apc_runtime.emit(EVENT_CONTROL, {"kind": "close"})


def _as_text(value, name):
    """보낼 값을 글자로. 숫자는 str()로 바꾸고, 바이트는 UTF-8 글자로 읽는다(못 읽으면 send_bytes를 쓰라고 알린다)."""
    if isinstance(value, str):
        return value
    if isinstance(value, (bytes, bytearray)):
        try:
            return bytes(value).decode("utf-8")
        except UnicodeDecodeError:
            raise TypeError(
                f"bridge.{name}()에 준 바이트를 글자로 읽을 수 없어요. 바이트를 그대로 보내려면 bridge.send_bytes()를 써요."
            ) from None
    return str(value)


def _body(text):
    """끝 문자 \\n 한 개를 뗀 글(이미 붙여 보냈어도 같은 값으로 본다 — §7.2 규칙 2)"""
    return text[: -len(TERMINATOR)] if text.endswith(TERMINATOR) else text


def _push(payload, category=None):
    """바이트를 선에 넣는다. category는 'state'·'event'(P4-01 BridgeCategory) — 원시 바이트는 적지 않아 화면이 모양으로 판정한다."""
    if not _open:
        connect()
    message = {"bytes": list(payload), "baud": _AUTO_BAUD}
    if category is not None:
        message["category"] = category
    apc_runtime.emit(EVENT_TX, message)


def send(value):
    """상태(지금 값)를 보낸다. 앞에 보낸 값과 **같으면 보내지 않고** False, 보냈으면 True를 돌려준다.

    예) 반복문에서 bridge.send(str(count))를 매 장마다 불러도, 손가락 개수가 바뀔 때만 통신이 일어난다.
    """
    global _last
    body = _body(_as_text(value, "send"))
    if _last is not None and body == _last:
        return False
    _push((body + TERMINATOR).encode("utf-8"), "state")
    _last = body
    return True


def event(value):
    """한 번만 일어난 일을 보낸다(클릭·윙크처럼 사라지면 안 되는 것). 같은 값이어도 늘 보내고 True를 돌려준다.

    상태 기억(send가 비교하는 값)은 바꾸지 않는다 — 이벤트가 끼어도 같은 상태를 다시 보내지 않는다.
    """
    body = _body(_as_text(value, "event"))
    _push((body + TERMINATOR).encode("utf-8"), "event")
    return True


def send_bytes(data):
    """바이트를 그대로 보낸다(끝 문자를 붙이지 않는다). 보낸 바이트 수를 돌려준다."""
    global _last
    if isinstance(data, str):
        raise TypeError('글자가 아니라 바이트로 주세요. 예: bridge.send_bytes(bytes([3])) — 글자는 bridge.send("3")')
    payload = bytes(data)
    if payload:
        _push(payload)
        # 바이트는 어떤 뜻이든 될 수 있어서, 다음 send()는 앞 값과 같아도 다시 보낸다.
        _last = None
    return len(payload)


def last_sent():
    """마지막으로 보낸 상태 글자(아직 없으면 None) — "왜 안 나가지?"를 볼 때 쓴다(값이 같으면 send가 보내지 않는다)."""
    return _last


def _fill():
    """화면이 쌓아 둔 바이트를 받을 칸에 옮긴다(입력 확인 지점). 통로가 아직 안 열렸으면 먼저 연다."""
    if not _open:
        connect()
    for item in apc_runtime.poll(CHANNEL_RX):
        if not isinstance(item, dict):
            continue
        chunk = item.get("bytes")
        if isinstance(chunk, (list, tuple)):
            _buffer.extend(int(value) & 0xFF for value in chunk)
        elif isinstance(chunk, (bytes, bytearray)):
            _buffer.extend(chunk)


def receive():
    """보드가 보낸 한 줄(끝의 줄바꿈을 뗀 글자). 아직 한 줄이 다 오지 않았으면 None.

    실물 시리얼처럼 바이트가 나뉘어 올 수 있어서, 줄바꿈(\\n)이 올 때까지 모았다가 한 줄씩 준다.
    """
    _fill()
    at = _buffer.find(b"\n")
    if at < 0:
        return None
    line = bytes(_buffer[:at])
    del _buffer[: at + 1]
    return line.decode("utf-8", "replace").rstrip("\r")


def receive_bytes():
    """지금까지 온 바이트를 그대로 꺼낸다(줄로 모으지 않는다). 없으면 빈 bytes."""
    _fill()
    data = bytes(_buffer)
    del _buffer[:]
    return data


def _reset():
    """실행이 시작될 때 지난 실행의 상태를 버린다(동기 진입점 — drain만 쓴다)."""
    global _open, _last, _label
    _open = False
    _last = None
    _label = ""
    del _buffer[:]
    apc_runtime.drain(CHANNEL_RX)


apc_runtime.register_reset_hook(_reset)
