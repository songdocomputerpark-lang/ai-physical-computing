"""컴퓨터 쪽 블루투스 다리 흉내 — 교과서 3·4단원과 교안의 PC 코드(f089·f100·f104·f114·f158)가 **한 글자도 고치지 않고**
도는 자리(PLAN §7.3 "블루투스"·§7.6 "원본 코드는 그대로"·§8.4 P4-02, CODE_MAPPING §6.4·B5). 화면 쪽은 같은 폴더의 index.ts.

왜 파일 이름이 bluetooth.py인가: 자료의 `bluetooth.py`는 PyPI 패키지가 아니라 교안이 함께 나눠 준 파일이고, 그 안에서 쓰는
bleak는 브라우저에서 돌지 않는다(운영체제의 블루투스 스택을 직접 쓴다). 사이트는 같은 이름·같은 사용법의 파일을 /apc에 넣어
`import bluetooth`가 이것을 불러오게 한다(serial.py와 같은 방식 — src/lab/python/modules.ts 머리말).
원본 파일은 `examples/vision/lib/bluetooth.py`에 그대로 두었다("진짜 컴퓨터에서 돌리기"용).

원본이 주는 것과 같은 것(examples/vision/lib/bluetooth.py 대조)
    bluetooth.init("XX:XX:XX:XX:XX:XX")  →  BLEUARTBridge 하나
    bridge.connected                     →  지금 이어져 있나(참·거짓)
    bridge.send("DATA,1920,1080,0,0")    →  글자를 그대로 보낸다(끝 문자를 붙이지 않는다 — 원본이 data.encode()만 한다)
    bridge.disconnect()                  →  끊는다
    UART_SERVICE_UUID · UART_RX_UUID · UART_TX_UUID  →  Nordic UART Service UUID(원본과 같은 값)

원본과 다른 것(브라우저의 사실, §7.3)
    · **기기 주소로 연결하지 않는다.** 브라우저는 주소를 알려 주지도, 주소로 잇게 해 주지도 않는다. 주소 인자는 받아 두기만 하고
      화면에서 고른 상대(같은 화면의 가상 보드 또는 실제 보드)와 잇는다. 그래서 주소가 `XX:XX:XX:XX:XX:XX`(가린 값)여도 그대로 돈다.
    · **보내기를 기다리지 않는다.** 원본은 쓰기마다 응답을 기다려 루프가 느려진다(CODE_MAPPING §1.3). 사이트는 화면 쪽 보내는 차례가
      초당 10회로 내보내며 같은 자리 상태는 최신 값으로 바꿔 끼우고 **클릭 표시가 1인 메시지는 절대 버리지 않는다**(§7.2 규칙 4·5, §7.6).
      실제로 나간 줄은 콘솔에 `Sent: …`로 한 번씩 보인다(§7.6 ⑤) — 원본이 print(f"Sent: {data}")로 적던 그 줄이다.
    · 보드가 알림으로 보낸 값은 원본처럼 그대로 콘솔에 찍는다(_notification_handler와 같은 자리).

규칙(PROGRESS 미해결 25번): 초기화 함수(_reset)는 동기 진입점이라 양보하는 함수(get·poll·sleep·request)를 쓰지 않고 drain만 쓴다.
`connected`는 매 프레임 읽히므로 양보하지 않는 peek으로만 본다.
라이선스: 사이트 소프트웨어(MIT, PD-26). 원본 파일을 옮겨 오지 않고 **같은 사용법만** 흉내 낸다.
"""

import time

import apc_runtime

__all__ = [
    "BLEUARTBridge",
    "UART_RX_UUID",
    "UART_SERVICE_UUID",
    "UART_TX_UUID",
    "init",
]

# 원본 파일과 같은 값(Nordic UART Service — 구역 B·C가 공식 문서로 확인한 것과 같다)
UART_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
UART_RX_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
UART_TX_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

#: 연결 전 send()의 "Unable to send data" 줄을 다시 찍기까지(초)
UNABLE_NOTICE_SECONDS = 2.0

REQUEST_OPEN = "ble-pc.open"
REQUEST_CLOSE = "ble-pc.close"
EVENT_TX = "ble-pc.tx"
VALUE_INFO = "ble-pc.info"
CHANNEL_RX = "ble-pc.rx"


def _info():
    """화면이 넣어 둔 최신 상태({'connected': …, 'label': …}). 양보하지 않는다(매 프레임 읽힌다)."""
    value = apc_runtime.peek(VALUE_INFO)
    return value if isinstance(value, dict) else {}


def _drain_received():
    """보드가 알림으로 보낸 바이트를 꺼내 원본처럼 콘솔에 그대로 찍는다(원본 _notification_handler).

    원본은 백그라운드 스레드가 알림을 받아 아무 때나 찍는다. 사이트에는 스레드가 없어 `connected`를 볼 때마다 꺼내 찍는다.
    양보하지 않는 drain을 쓴다 — `connected`는 얼굴이 보이는 매 프레임 읽히는 자리라 여기서 기다리면 영상이 끊긴다.
    """
    for item in apc_runtime.drain(CHANNEL_RX):
        data = item.get("bytes") if isinstance(item, dict) else item
        if not data:
            continue
        try:
            text = bytes(bytearray(data)).decode("utf-8")
        except (UnicodeDecodeError, TypeError, ValueError):
            text = " ".join("%02X" % int(one) for one in data)
        print(text, end="")


class BLEUARTBridge:
    """원본 examples/vision/lib/bluetooth.py의 BLEUARTBridge와 같은 사용법."""

    def __init__(self, address):
        self.address = address
        self._closed = False
        self._label = None
        self._announced = False
        self._unable_at = None
        reply = apc_runtime.request(REQUEST_OPEN, {"address": str(address)})
        reply = reply if isinstance(reply, dict) else {}
        for text in reply.get("notices") or []:
            apc_runtime.notice(str(text))
        if reply.get("error"):
            # 화면이 "이 브라우저에서는 아예 안 돼요"라고 알릴 때만 예외를 낸다(원본도 실패하면 예외를 냈다).
            # **상대가 아직 없는 것은 실패가 아니다** — 자료의 예제 가운데 f100·f089·f158은 init을 try 없이 부르기 때문에
            # 여기서 예외를 내면 카메라도 못 켜 본다(절대 원칙 3 "하드웨어 없어도 100%"). 대신 connected가 거짓이고
            # 화면 안내(notices)가 "보드 칸에서 [연결]을 눌러요"라고 알려 준다.
            self._closed = True
            raise ConnectionError(str(reply.get("error")))
        self._label = reply.get("label")
        if reply.get("connected"):
            self._announce()

    def _announce(self):
        """원본이 연결에 성공했을 때 찍는 줄(`Connected to …`)을 한 번만 찍는다.

        원본은 백그라운드 스레드가 연결을 마치면 찍는다. 사이트는 이어진 것을 처음 알아챈 때(init 또는 `connected`를 읽을 때) 찍는다.
        이어지지 않았는데 찍으면 거짓말이 되므로(앞 판은 보드 칸이 있기만 해도 찍었다) 이어졌을 때만 찍는다.
        """
        if not self._announced:
            self._announced = True
            print("Connected to %s" % (self._label or self.address))

    def __repr__(self):
        return "<BLEUARTBridge %s>" % ("connected" if self.connected else "disconnected")

    # ── 원본과 같은 API ──

    @property
    def connected(self):
        """지금 이어져 있나.

        원본은 백그라운드 스레드가 값을 바꾸는 **속성**이라 예제가 프레임마다 다시 읽는다(f104의
        `if ble_device and ble_device.connected:`). 사이트도 읽을 때마다 화면이 넣어 둔 최신 값을 본다 —
        그래야 코드를 돌린 뒤에 보드를 [연결]해도 그 다음 프레임부터 값이 나간다. 양보하지 않는다.
        """
        if self._closed:
            return False
        _drain_received()
        info = _info()
        now = bool(info.get("connected"))
        if now:
            self._label = info.get("label") or self._label
            self._announce()
        return now

    def send(self, data):
        """글자(또는 바이트)를 상대에게 보낸다. 원본처럼 끝 문자를 붙이지 않는다."""
        if not self.connected:
            # 원본도 연결 전에는 보내지 않고 이 줄을 찍는다(connection_event.wait가 10초를 넘긴 갈래). 원본은 그 10초 동안 루프가
            # 멈추지만 사이트는 기다리지 않으므로, 매 장마다 찍어 콘솔을 덮지 않게 2초에 한 번만 찍는다(f089·f158은 손이 보이는 매 장 send).
            now = time.monotonic()
            if self._unable_at is None or now - self._unable_at >= UNABLE_NOTICE_SECONDS:
                self._unable_at = now
                print("Unable to send data: Not connected.")
            return
        if isinstance(data, (bytes, bytearray)):
            apc_runtime.emit(EVENT_TX, {"bytes": list(bytearray(data))})
        else:
            apc_runtime.emit(EVENT_TX, {"text": str(data)})

    def disconnect(self):
        if self._closed:
            return
        self._closed = True
        reply = apc_runtime.request(REQUEST_CLOSE, {})
        reply = reply if isinstance(reply, dict) else {}
        # 원본은 이어져 있었을 때만 이 줄을 찍는다(`if self.connected:`).
        if self._announced:
            label = reply.get("label") or self._label
            print("Disconnected from %s" % (label or self.address))


def init(address):
    """원본과 같은 만들기 함수 — `bluetooth.init(주소)`."""
    return BLEUARTBridge(address)


def _reset():
    """실행을 시작할 때마다 지난 실행에 쌓인 값을 버린다(동기 진입점 — 양보 금지)."""
    apc_runtime.drain(CHANNEL_RX)


apc_runtime.register_reset_hook(_reset)
