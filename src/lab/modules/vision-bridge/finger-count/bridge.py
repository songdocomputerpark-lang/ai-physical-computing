"""새 예제용 통신 모듈 `bridge` — PLAN §7.6 "새 예제용 bridge 모듈(사이트 제공)"(P4-08, 구역 scenario-f).

무엇을 하나
    bridge.send(text)        상태를 보낸다. **값이 바뀔 때만** 나간다(§7.2 규칙 4·§7.5 "3\\n(값이 바뀔 때만)").
    bridge.event(text)       한 번만 일어난 일(클릭·윙크)을 보낸다. 같은 값이어도 늘 나간다.
    bridge.send_bytes(data)  바이트를 그대로 보낸다(끝 문자를 붙이지 않는다 — §7.2 규칙 7).
    bridge.receive()         상대가 보낸 한 줄(끝의 \\r\\n을 뗀 글자). 아직 한 줄이 다 오지 않았으면 None.

**통로는 코드에 적지 않는다.** 같은 컴퓨터 탭·한 화면 모드·블루투스·MQTT 가운데 무엇으로 보낼지는 화면의
[보내기] 패널에서 고른다(§7.6). 그래서 이 파일에는 포트 이름도, 기기 주소도, 브로커 주소도 없다.

어디로 이어지나(구역 A가 만든 길을 그대로 쓴다 — 이 모듈은 새 이름을 만들지 않는다)
    bridge.send("3")
      → 이벤트 'serial-pc.tx'  { bytes: [51, 10] }
      → src/lab/modules/serial-pc/index.ts  → vision-bridge의 선(link.ts)
      → 브릿지 통로(BroadcastChannel 등)  → ESP32 실습실의 가상 USB-UART 변환기  → 보드 UART2
    보드 uart.write(...)  → 그 반대 길 → 채널 'serial-pc.rx' → bridge.receive()

왜 pyserial 흉내(serial.py)와 따로 있나: `serial.Serial("COM10", 9600).write(b"3\\n")`은 **원본 자료의 코드가 그대로 돌게**
하는 자리이고, 이 모듈은 **사이트가 새로 쓰는 예제**가 쓰는 짧은 자리다. 둘은 같은 선을 쓰므로 받는 쪽 코드는 똑같다.

규칙(PROGRESS 미해결 25번): 초기화 함수(_reset)는 동기 진입점이라 양보하는 함수(get·poll·sleep·request)를 쓰지 않고 drain만 쓴다.
라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import apc_runtime

__all__ = [
    "BridgeError",
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
#: 통로를 쓸 때 속도를 적지 않는다(0 = 보드와 같은 속도로 맞춤). 속도는 UART 실습(3-1-2)에서만 뜻이 있다.
_AUTO_BAUD = 0

_open = False
_last = None
_buffer = bytearray()


class BridgeError(RuntimeError):
    """통신 통로를 열지 못했거나 보내지 못했을 때(한국어 까닭이 들어 있다)"""


def _info():
    """화면이 넣어 둔 선 상태 { 'ready': bool, 'peers': [...], 'label': str }(입력 확인 지점)"""
    value = apc_runtime.get(VALUE_INFO)
    return value if isinstance(value, dict) else {}


def info():
    """지금 선 상태를 사전으로 돌려준다(받을 쪽이 있는지 보고 싶을 때)."""
    return dict(_info())


def is_open():
    """통로가 열려 있나"""
    return _open


def connect():
    """통로를 연다. 보통은 처음 보낼 때 저절로 열리므로 부르지 않아도 된다.

    받을 쪽 화면(ESP32 실습실 탭·한 화면 모드)이 없으면 BridgeError + 한국어 안내를 낸다.
    """
    global _open, _last
    if _open:
        return True
    try:
        reply = apc_runtime.request(REQUEST_OPEN, {"port": None, "baudrate": _AUTO_BAUD, "timeout": None})
    except Exception as error:  # 화면이 이 요청을 모르는 실습실(예: ESP32 실습실)
        raise BridgeError(
            "이 실습실에서는 bridge를 쓸 수 없어요. 영상처리 실습실에서 써요(보드 쪽은 UART·블루투스로 받아요). — {}".format(error)
        )
    reply = reply if isinstance(reply, dict) else {}
    if not reply.get("ok"):
        raise BridgeError(str(reply.get("error") or "통신 통로를 열지 못했어요."))
    _open = True
    _last = None
    for text in reply.get("notices") or []:
        apc_runtime.notice(str(text))
    return True


def close():
    """통로를 닫는다(보통은 실행이 끝날 때 저절로 정리된다)."""
    global _open, _last
    if not _open:
        return
    _open = False
    _last = None
    apc_runtime.emit(EVENT_CONTROL, {"kind": "close"})


def _wire(text):
    """끝 문자 \\n 한 개를 붙인다(이미 있으면 그대로 — §7.2 규칙 2)."""
    body = text[: -len(TERMINATOR)] if text.endswith(TERMINATOR) else text
    return body + TERMINATOR


def _push(payload):
    if not _open:
        connect()
    apc_runtime.emit(EVENT_TX, {"bytes": list(payload), "baud": _AUTO_BAUD})


def send(value):
    """상태(지금 값)를 보낸다. 앞에 보낸 값과 **같으면 보내지 않고** False를 돌려준다.

    예) bridge.send(str(count))를 매 장마다 불러도, 손가락 개수가 바뀔 때만 통신이 일어난다.
    """
    global _last
    text = value if isinstance(value, str) else str(value)
    if _last is not None and text == _last:
        return False
    _push(_wire(text).encode("utf-8"))
    _last = text
    return True


def event(value):
    """한 번만 일어난 일을 보낸다(클릭·윙크처럼 사라지면 안 되는 것). 같은 값이어도 늘 나간다."""
    global _last
    text = value if isinstance(value, str) else str(value)
    _push(_wire(text).encode("utf-8"))
    # 이벤트를 보낸 뒤에는 같은 글자를 상태로 다시 보낼 수 있게 기억을 비운다.
    _last = None
    return True


def send_bytes(data):
    """바이트를 그대로 보낸다(끝 문자를 붙이지 않는다). 보낸 바이트 수를 돌려준다."""
    global _last
    if isinstance(data, str):
        raise TypeError("글자가 아니라 바이트로 주세요. 예: bridge.send_bytes(bytes([3])) — 글자는 bridge.send(\"3\")")
    payload = bytes(data)
    if payload:
        _push(payload)
        _last = None
    return len(payload)


def last_sent():
    """마지막으로 보낸 상태 글자(아직 없으면 None) — 학생이 "왜 안 나가지?"를 볼 때 쓴다."""
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
    """상대가 보낸 한 줄(끝의 줄바꿈을 뗀 글자). 아직 한 줄이 다 오지 않았으면 None.

    실물 시리얼처럼 바이트가 나뉘어 올 수 있어서, 줄바꿈(\\n)이 올 때까지 모았다가 한 줄씩 준다.
    """
    _fill()
    at = _buffer.find(0x0A)
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
    global _open, _last
    _open = False
    _last = None
    del _buffer[:]
    apc_runtime.drain(CHANNEL_RX)


apc_runtime.register_reset_hook(_reset)
