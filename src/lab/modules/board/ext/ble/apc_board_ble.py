"""가상 ESP32 보드의 블루투스 저수준 흉내 — `bluetooth`·`ubluetooth`(PLAN §6.2 "BLE 주변기기(Nordic UART Service)", §8.4 P4-03,
CODE_MAPPING §3.9 "ESP32 쪽 BLE mock(VB-BLE)", src/lab/README.md 7.6). 화면 쪽은 `src/lab/modules/board/parts/ble/`.

학생 코드는 실물 ESP32와 똑같이 쓴다(자료의 BLE 예제는 모두 보드 라이브러리 ESP32BLE.py나 esp32_ble_util.py를 거친다):

    import ubluetooth                       # 또는 import bluetooth / from bluetooth import BLE
    ble = ubluetooth.BLE()
    ble.active(True)
    ble.irq(handler)                        # handler(event, data)
    ((tx, rx),) = ble.gatts_register_services(((UUID, ((UUID, FLAG_NOTIFY), (UUID, FLAG_WRITE))),))
    ble.gap_advertise(100, adv_data)

이 파일이 맡는 것
1. `BLE` 하나(실물처럼 싱글턴), `UUID`, 특성 플래그 상수. 값은 핸들 하나에 **한 칸**만 있고, 새로 쓰면 앞 값을 덮어쓴다
   (PLAN §7.7 "한 칸 덮어쓰기" — 루프가 LCD·sleep로 막힌 동안 온 값은 마지막 것만 남는다).
2. 특성 값 버퍼 기본 **20바이트**: 상대가 그보다 길게 쓰면 실물처럼 앞 20바이트만 남기고 콘솔에 한국어로 알린다
   (공식 문서: "Characteristics and descriptors have a default maximum size of 20 bytes.",
    "Anything written to them by a client will be truncated to this length." — docs.micropython.org/en/latest/library/bluetooth.html, 2026-09-18 확인).
   `gatts_set_buffer(handle, len)`으로 늘릴 수 있다.
3. 상대 기기(스마트폰·컴퓨터) 흉내: 화면의 조작 칸이 [연결]·[보내기]를 누르면 `RADIO.connect()`·`RADIO.write_from_peer(bytes)`가
   IRQ 이벤트(1 연결·2 끊김·3 쓰기)를 **입력 확인 지점의 콜백 대기열**에 넣는다(Timer 콜백과 같은 자리 — apc_board.Board.schedule).
   실물은 BLE 작업이 따로 돌지만 가상 보드는 입력 확인 지점에서만 콜백이 돈다(P3-00 차이 표 12번, README 7.2).
4. 화면에 상태 알리기: 부품 `ble`(parts/ble/)의 장치가 붙어 있으면 그쪽으로 넘겨 `board.device` 이벤트가 된다(이 파일은 화면 메시지를 모른다).

공식 MicroPython v1.29 문서(docs.micropython.org/en/latest/library/bluetooth.html, 2026-09-18 확인)로 맞춘 것
- `BLE.active([active])`, "The radio must be made active before using any other methods on this class."
- `BLE.config('mac')` → `(addr_type, addr)`. 그 밖에 `gap_name`·`mtu`·`rxbuf`·`addr_mode`를 읽고 쓴다.
- `BLE.irq(handler)` — handler(event, data). 이벤트 번호: 1 `_IRQ_CENTRAL_CONNECT` `(conn_handle, addr_type, addr)`,
  2 `_IRQ_CENTRAL_DISCONNECT` 같은 모양, 3 `_IRQ_GATTS_WRITE` `(conn_handle, attr_handle)`, 21 `_IRQ_MTU_EXCHANGED` `(conn_handle, mtu)`.
  (실물 `bluetooth` 모듈은 이 번호를 내보내지 않는다 — 예제가 `const(1)`처럼 직접 적는다. 가상 보드도 내보내지 않는다.)
- `BLE.gap_advertise(interval_us, adv_data=None, *, resp_data=None, connectable=True)` — 간격은 마이크로초, `None`이면 광고 중지,
  `adv_data`가 `None`이면 지난 번 값을 다시 쓴다.
- `BLE.gatts_register_services(services)` → "a list (one element per service) of tuples (each element is a value handle)",
  "Advertising must be stopped before registering services."
- `BLE.gatts_read(handle)` / `gatts_write(handle, data, send_update=False)` / `gatts_notify(conn, handle, data=None)`
  (`data`가 `None`이면 지금 값을 보낸다) / `gatts_indicate` / `gatts_set_buffer(handle, len, append=False)`.
- `bluetooth.UUID(값)` — 16비트 정수, 2·4·16바이트 버퍼, 128비트 글자.
- 플래그: `FLAG_READ` 0x0002, `FLAG_WRITE_NO_RESPONSE` 0x0004, `FLAG_WRITE` 0x0008, `FLAG_NOTIFY` 0x0010, `FLAG_INDICATE` 0x0020.

실물과 다른 것(흉내 낼 수 없거나 확인하지 못한 것 — 콘솔 안내와 교사용 접기로 알린다)
- **기기 주소는 가상 주소다.** 실행할 때마다 "직접 정한 주소"(locally administered) 규칙으로 새로 만든다. 실물 보드의 주소와 다르고,
  사이트 문서·테스트에는 실제 주소를 적지 않는다(PLAN §10). 4-1-4 차시는 주소 대신 **광고 이름**으로 고르도록 안내한다(PLAN §7.3).
- 연결 핸들은 0부터 준다(자료의 ESP32BLE.py가 `gatts_notify(0, …)`로 0을 못박아 쓴다).
- 켜지 않은(`active(False)`) 상태에서 다른 함수를 부를 때 실물이 내는 오류 번호를 확인하지 못해, 가상 보드는 **콘솔 안내 한 번**만 하고 그대로 한다.
- 연결이 없을 때 `gatts_notify`는 `OSError: [Errno 128] ENOTCONN`으로 막는다(실물도 막지만 번호는 확인 전 — 운영자 확인 목록).
- 페어링·암호화·스캔(중앙 장치 역할)·서비스 탐색은 흉내 내지 않는다. 쓰면 `AttributeError`와 한국어 안내가 난다.

라이선스: 사이트 소프트웨어(MIT, PD-26) — MicroPython 코드를 옮기지 않고 문서에 적힌 동작만 파이썬으로 다시 썼다.
"""

import types

import apc_board
import apc_runtime

__all__ = [
    "BLE",
    "DEFAULT_MTU",
    "DEFAULT_VALUE_BUFFER",
    "EVENT_CENTRAL_CONNECT",
    "EVENT_CENTRAL_DISCONNECT",
    "EVENT_GATTS_WRITE",
    "EVENT_MTU_EXCHANGED",
    "FLAG_INDICATE",
    "FLAG_NOTIFY",
    "FLAG_READ",
    "FLAG_WRITE",
    "FLAG_WRITE_NO_RESPONSE",
    "MODULE",
    "PART_ID",
    "RADIO",
    "UUID",
    "attach_view",
    "advertised_name",
    "to_buffer",
]

#: 화면 쪽 부품 폴더 이름(src/lab/modules/board/parts/ble/)
PART_ID = "ble"

# ── 공식 문서의 상수 ──
FLAG_READ = 0x0002
FLAG_WRITE_NO_RESPONSE = 0x0004
FLAG_WRITE = 0x0008
FLAG_NOTIFY = 0x0010
FLAG_INDICATE = 0x0020

#: IRQ 이벤트 번호(실물 모듈은 내보내지 않는다 — 여기서는 코드를 읽기 쉽게 이름을 두고 학생용 모듈에는 넣지 않는다)
EVENT_CENTRAL_CONNECT = 1
EVENT_CENTRAL_DISCONNECT = 2
EVENT_GATTS_WRITE = 3
EVENT_MTU_EXCHANGED = 21

#: 특성 값의 기본 최대 길이(공식 문서 "default maximum size of 20 bytes")
DEFAULT_VALUE_BUFFER = 20
#: 기본 ATT MTU(23) — 알림으로 한 번에 보낼 수 있는 양은 MTU − 3
DEFAULT_MTU = 23
#: 광고 데이터 안에서 이름을 적는 종류(Bluetooth Core Supplement: 0x08 짧은 이름, 0x09 전체 이름)
ADV_TYPE_NAME_SHORT = 0x08
ADV_TYPE_NAME_COMPLETE = 0x09

_ADDR_TYPE_PUBLIC = 0


def to_buffer(value, what="data"):
    """MicroPython의 "버퍼 객체"와 같게 받는다: bytes·bytearray·memoryview·str(UTF-8)·정수 목록.

    실물 MicroPython은 str도 버퍼 프로토콜을 가져 그대로 쓸 수 있다(py/objstr.c — P3-00 차이 표 8번).
    자료의 ESP32BLE.send(data)가 `data + '\\n'`(글자)을 그대로 넘기므로 가상 보드도 글자를 받아야 원본이 돈다.
    """
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    if isinstance(value, memoryview):
        return bytes(value)
    if isinstance(value, str):
        return value.encode("utf-8")
    if isinstance(value, (bool, int, float)) or value is None:
        # 실물도 숫자는 버퍼가 아니다(bytes(5)처럼 길이로 읽히지 않게 막는다)
        raise TypeError(f"object with buffer protocol required ({what})")
    try:
        return bytes(value)
    except Exception:
        raise TypeError(f"object with buffer protocol required ({what})") from None


def advertised_name(adv_data):
    """광고 데이터(AD 구조 되풀이: 길이 1바이트 · 종류 1바이트 · 내용)에서 기기 이름을 꺼낸다. 없으면 None."""
    if not adv_data:
        return None
    data = bytes(adv_data)
    index = 0
    while index + 1 < len(data):
        length = data[index]
        if length == 0:
            break
        kind = data[index + 1]
        chunk = data[index + 2 : index + 1 + length]
        if kind in (ADV_TYPE_NAME_COMPLETE, ADV_TYPE_NAME_SHORT):
            try:
                return chunk.decode("utf-8")
            except UnicodeDecodeError:
                return None
        index += 1 + length
    return None


class UUID:
    """bluetooth.UUID — 16비트 정수, 2·4·16바이트 버퍼, 128비트 글자('6E400001-B5A3-F393-E0A9-E50E24DCCA9E')."""

    def __init__(self, value):
        if isinstance(value, UUID):
            self._bytes = value._bytes
        elif isinstance(value, bool):
            raise TypeError("UUID needs a 16-bit integer, a string, or a buffer")
        elif isinstance(value, int):
            if not 0 <= value <= 0xFFFF:
                raise ValueError("UUID value out of range")
            self._bytes = bytes((value & 0xFF, (value >> 8) & 0xFF))
        elif isinstance(value, str):
            text = value.strip()
            if text.startswith("{") and text.endswith("}"):
                text = text[1:-1]
            hexed = text.replace("-", "")
            if len(hexed) != 32:
                raise ValueError("invalid UUID string")
            try:
                raw = bytes.fromhex(hexed)
            except ValueError:
                raise ValueError("invalid UUID string") from None
            self._bytes = bytes(reversed(raw))  # 저장은 리틀 엔디언(실물의 bytes(uuid)와 같은 차례)
        else:
            raw = to_buffer(value, "UUID")
            if len(raw) not in (2, 4, 16):
                raise ValueError("UUID needs 2, 4 or 16 bytes")
            self._bytes = raw

    def __bytes__(self):
        return self._bytes

    def __len__(self):
        return len(self._bytes)

    def __eq__(self, other):
        return isinstance(other, UUID) and other._bytes == self._bytes

    def __hash__(self):
        return hash(self._bytes)

    def __str__(self):
        if len(self._bytes) == 2:
            return "UUID(0x%02x%02x)" % (self._bytes[1], self._bytes[0])
        raw = bytes(reversed(self._bytes)).hex()
        if len(self._bytes) == 16:
            groups = (raw[0:8], raw[8:12], raw[12:16], raw[16:20], raw[20:32])
            return "UUID('%s')" % "-".join(groups)
        return "UUID('%s')" % raw

    __repr__ = __str__


class _Value:
    """특성(또는 설명자) 값 한 칸 — 핸들 하나에 값 하나(새로 쓰면 앞 값을 덮어쓴다)"""

    def __init__(self, handle, uuid, flags):
        self.handle = handle
        self.uuid = uuid
        self.flags = int(flags)
        self.max_len = DEFAULT_VALUE_BUFFER
        self.append = False
        self.data = b""
        self.writes = 0

    @property
    def writable(self):
        return bool(self.flags & (FLAG_WRITE | FLAG_WRITE_NO_RESPONSE))

    @property
    def notifiable(self):
        return bool(self.flags & (FLAG_NOTIFY | FLAG_INDICATE))

    def store(self, data):
        """값을 넣는다. 버퍼보다 길면 실물처럼 앞부분만 남긴다(잘린 바이트 수를 돌려준다)."""
        raw = bytes(data)
        if self.append:
            raw = self.data + raw
        dropped = max(0, len(raw) - self.max_len)
        self.data = raw[: self.max_len]
        return dropped


class _Radio:
    """가상 BLE 무선 하나(모듈 전역). 실행마다 초기화된다(reset 훅)."""

    def __init__(self):
        self.reset()

    # ── 실행마다 ──

    def reset(self):
        self.active = False
        self.irq_handler = None
        self.values = {}
        self.services = []
        self.next_handle = 1
        self.advertising = False
        self.adv_data = b""
        self.resp_data = b""
        self.interval_us = None
        self.connectable = True
        self.name = None
        self.gap_name = "MPY"
        self.mtu = DEFAULT_MTU
        self.rxbuf = 512
        self.addr_mode = _ADDR_TYPE_PUBLIC
        self.address = _new_address()
        self.connections = []
        self.next_conn = 0
        self.rx_total = 0
        self.rx_last = b""
        self.rx_truncated = 0
        self.tx_total = 0
        self.tx_last = b""
        self.view = None
        self.notify_listeners = []
        self.dirty = False

    # ── 화면(부품 ble) ──

    def ensure_view(self):
        """배선에 ble 부품이 있으면 장치를 만든다(부품 쪽 apc_part_ble.py가 attach_view로 자기를 알린다)."""
        if self.view is None:
            apc_board.wired_devices(PART_ID)
        return self.view

    def publish(self):
        view = self.ensure_view()
        if view is not None:
            view.publish()
        elif not self.dirty:
            self.dirty = True
            apc_board.BOARD.warn_once(
                ("ble-no-part", ""),
                "블루투스를 켰지만 화면에 블루투스 칸이 없어요. 예제를 불러오거나, 코드 맨 위에 `# @part ble 12` 줄을 넣으면 "
                "보드 그림 아래에 상대 기기(스마트폰·컴퓨터) 조작 칸이 생겨요.",
            )

    def state(self):
        """화면(board.device)에 보낼 상태 — 모양은 parts/ble/ble-state.ts와 같아야 한다."""
        return {
            "v": 1,
            "active": self.active,
            "advertising": self.advertising,
            "connectable": self.connectable,
            "intervalUs": self.interval_us,
            "name": self.name,
            "mac": mac_text(self.address),
            "connections": list(self.connections),
            "mtu": self.mtu,
            "chars": [
                {"handle": value.handle, "write": value.writable, "notify": value.notifiable, "max": value.max_len}
                for value in sorted(self.values.values(), key=lambda item: item.handle)
            ],
            "rxTotal": self.rx_total,
            "rxLast": list(self.rx_last),
            "rxTruncated": self.rx_truncated,
            "txTotal": self.tx_total,
            "txLast": list(self.tx_last),
        }

    # ── IRQ ──

    def fire(self, event, data):
        handler = self.irq_handler
        if handler is None:
            return
        if not apc_board.BOARD.schedule(_call_irq, (handler, event, data)):
            apc_board.BOARD.warn_once(
                ("ble-queue-full", ""),
                "블루투스로 온 것을 처리할 자리가 가득 차서 몇 개를 버렸어요. 실물 보드도 대기열이 넘치면 버려요. "
                "반복문 안에서 sleep으로 조금 쉬어 주면 빠짐없이 받을 수 있어요.",
            )

    # ── 상대 기기 흉내(화면 조작) ──

    def writable_handle(self):
        for value in sorted(self.values.values(), key=lambda item: item.handle):
            if value.writable:
                return value.handle
        return None

    def connect(self):
        """상대 기기(스마트폰·컴퓨터)가 연결했다 — IRQ 1"""
        if not self.active or not self.connectable:
            return None
        # 비어 있는 가장 작은 연결 번호를 준다 — 상대가 하나면 다시 연결해도 늘 0이다(2026-09-25 Phase 4 검토 반영:
        # 1씩 늘리면 두 번째 연결이 1번이 되어, 0번으로 보내는 원본 ESP32BLE.send()가 ENOTCONN으로 멈췄다. 실물 번호는 부록 B-2 31번에서 확인).
        conn = 0
        while conn in self.connections:
            conn += 1
        self.next_conn = conn + 1
        self.connections.append(conn)
        self.advertising = False  # 실물도 연결되면 광고를 멈춘다
        self.fire(EVENT_CENTRAL_CONNECT, (conn, _ADDR_TYPE_PUBLIC, bytes(_new_address())))
        self.publish()
        return conn

    def disconnect(self, conn=None):
        """상대 기기가 연결을 끊었다 — IRQ 2"""
        if not self.connections:
            return None
        target = self.connections[-1] if conn is None else conn
        if target not in self.connections:
            return None
        self.connections.remove(target)
        self.fire(EVENT_CENTRAL_DISCONNECT, (target, _ADDR_TYPE_PUBLIC, bytes(_new_address())))
        self.publish()
        return target

    def write_from_peer(self, data, handle=None):
        """상대 기기가 특성에 값을 썼다 — 값 한 칸에 저장하고 IRQ 3. 돌려주는 값은 잘린 바이트 수."""
        if not self.active:
            return None
        if not self.connections:
            self.connect()
        target = self.writable_handle() if handle is None else int(handle)
        value = self.values.get(target)
        if value is None:
            return None
        raw = to_buffer(data, "write")
        dropped = value.store(raw)
        value.writes += 1
        self.rx_total += 1
        self.rx_last = value.data
        if dropped:
            self.rx_truncated += 1
            apc_board.BOARD.warn_once(
                ("ble-truncated", str(target)),
                f"블루투스로 온 값이 {len(raw)}바이트여서 앞 {value.max_len}바이트만 남고 잘렸어요. "
                "블루투스 특성 한 칸은 기본 20바이트예요(실물도 같아요). 짧게 보내거나 "
                "코드에서 ble.gatts_set_buffer(핸들, 길이)로 칸을 늘려요.",
            )
        conn = self.connections[-1] if self.connections else 0
        self.fire(EVENT_GATTS_WRITE, (conn, target))
        self.publish()
        return dropped

    def notified(self, data):
        """보드가 알림으로 보낸 값(화면·다른 통로가 받는다)"""
        self.tx_total += 1
        self.tx_last = bytes(data)
        for listener in list(self.notify_listeners):
            try:
                listener(self.tx_last)
            except Exception:  # noqa: BLE001 — 듣는 쪽 오류가 학생 코드를 멈추지 않게
                pass
        self.publish()


def _call_irq(payload):
    handler, event, data = payload
    handler(event, data)


def _new_address():
    """가상 기기 주소 6바이트. 첫 바이트를 "직접 정한 주소"(locally administered, 두 번째 비트 1)로 두어 실제 기기 주소와 구분한다."""
    import random

    first = (random.getrandbits(8) & 0xFE) | 0x02
    return bytes([first] + [random.getrandbits(8) for _ in range(5)])


def mac_text(address):
    return ":".join("%02x" % byte for byte in address)


RADIO = _Radio()


def attach_view(view):
    """부품 쪽(apc_part_ble.py)이 자기를 알린다 — 하나만 붙는다(배선에 ble가 여럿이면 첫 번째)"""
    if RADIO.view is None:
        RADIO.view = view


def on_notify(listener):
    """보드가 알림으로 보낸 값을 받을 함수를 등록한다(부품·다음 묶음의 통로). 실행마다 비워진다."""
    RADIO.notify_listeners.append(listener)


class BLE:
    """bluetooth.BLE — 실물처럼 늘 같은 객체(싱글턴)"""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    # ── 켜기 ──

    def active(self, active=None):
        if active is None:
            return RADIO.active
        want = bool(active)
        if want and not RADIO.active:
            RADIO.active = True
            RADIO.publish()
        elif not want and RADIO.active:
            RADIO.active = False
            RADIO.advertising = False
            RADIO.connections = []
            RADIO.publish()
        return RADIO.active

    def _need_active(self, what):
        if RADIO.active:
            return
        apc_board.BOARD.warn_once(
            ("ble-not-active", what),
            f"블루투스를 켜기 전에 {what}을(를) 불렀어요. 실물 보드에서는 먼저 ble.active(True)를 해야 해요. "
            "가상 보드는 그대로 이어서 돌아요.",
        )

    # ── 설정 ──

    def config(self, *args, **kwargs):
        if args and kwargs:
            raise TypeError("can't specify both value and keyword arguments")
        if args:
            if len(args) != 1:
                raise TypeError("can only query one param")
            name = args[0]
            if name == "mac":
                self._need_active("config('mac')")
                return (RADIO.addr_mode, bytes(RADIO.address))
            if name == "gap_name":
                return RADIO.gap_name
            if name == "mtu":
                return RADIO.mtu
            if name == "rxbuf":
                return RADIO.rxbuf
            if name == "addr_mode":
                return RADIO.addr_mode
            raise ValueError("unknown config param")
        if not kwargs:
            raise TypeError("must specify a param to query or set")
        for name, value in kwargs.items():
            if name == "gap_name":
                RADIO.gap_name = value if isinstance(value, str) else to_buffer(value, "gap_name").decode("utf-8")
            elif name == "mtu":
                RADIO.mtu = apc_board.mp_int(value)
            elif name == "rxbuf":
                RADIO.rxbuf = apc_board.mp_int(value)
            elif name == "addr_mode":
                RADIO.addr_mode = apc_board.mp_int(value)
            else:
                raise ValueError("unknown config param")
        RADIO.publish()
        return None

    # ── 이벤트 ──

    def irq(self, handler=None):
        RADIO.irq_handler = handler
        return None

    # ── 광고 ──

    def gap_advertise(self, interval_us, adv_data=None, *, resp_data=None, connectable=True):
        self._need_active("gap_advertise()")
        if interval_us is None:
            RADIO.advertising = False
            RADIO.publish()
            return None
        RADIO.interval_us = apc_board.mp_int(interval_us)
        if adv_data is not None:
            RADIO.adv_data = to_buffer(adv_data, "adv_data")
        if resp_data is not None:
            RADIO.resp_data = to_buffer(resp_data, "resp_data")
        RADIO.connectable = bool(connectable)
        RADIO.advertising = True
        name = advertised_name(RADIO.adv_data) or advertised_name(RADIO.resp_data)
        if name is not None:
            RADIO.name = name
        RADIO.publish()
        return None

    # ── 서비스·특성 ──

    def gatts_register_services(self, services):
        self._need_active("gatts_register_services()")
        if RADIO.advertising:
            RADIO.advertising = False
            apc_board.BOARD.warn_once(
                ("ble-register-while-advertising", ""),
                "광고를 하는 중에 서비스를 등록했어요. 실물 보드는 서비스를 등록하기 전에 광고를 멈춰야 해요"
                "(gap_advertise(None)). 가상 보드는 광고를 멈추고 이어서 돌아요.",
            )
        RADIO.values = {}
        RADIO.services = []
        RADIO.next_handle = 1
        result = []
        for service in services:
            uuid, characteristics = service[0], service[1]
            handles = []
            for characteristic in characteristics:
                char_uuid = characteristic[0]
                flags = characteristic[1] if len(characteristic) > 1 else FLAG_READ
                value = _Value(RADIO.next_handle, char_uuid, flags)
                RADIO.next_handle += 1
                RADIO.values[value.handle] = value
                handles.append(value.handle)
            RADIO.services.append({"uuid": str(uuid), "handles": list(handles)})
            result.append(tuple(handles))
        RADIO.publish()
        # 공식 문서: "The return value is a list (one element per service) of tuples (each element is a value handle)."
        return result

    def _value(self, handle, what):
        value = RADIO.values.get(apc_board.mp_int(handle))
        if value is None:
            raise ValueError(f"invalid handle ({what})")
        return value

    def gatts_read(self, value_handle):
        return self._value(value_handle, "gatts_read").data

    def gatts_write(self, value_handle, data, send_update=False):
        value = self._value(value_handle, "gatts_write")
        dropped = value.store(to_buffer(data, "gatts_write"))
        if dropped:
            apc_board.BOARD.warn_once(
                ("ble-write-truncated", str(value.handle)),
                f"특성에 넣은 값이 {value.max_len}바이트보다 길어 뒷부분이 잘렸어요(실물도 같아요). "
                "ble.gatts_set_buffer(핸들, 길이)로 칸을 늘릴 수 있어요.",
            )
        if send_update and RADIO.connections:
            RADIO.notified(value.data)
        RADIO.publish()
        return None

    def gatts_set_buffer(self, value_handle, length, append=False):
        value = self._value(value_handle, "gatts_set_buffer")
        value.max_len = max(0, apc_board.mp_int(length))
        value.append = bool(append)
        value.data = value.data[: value.max_len]
        RADIO.publish()
        return None

    def _send(self, conn_handle, value_handle, data, what):
        conn = apc_board.mp_int(conn_handle)
        value = self._value(value_handle, what)
        if conn not in RADIO.connections:
            apc_board.BOARD.warn_once(
                ("ble-notconn", str(conn)),
                "연결된 상대 기기가 없는데 보드가 블루투스로 값을 보내려고 했어요. 실물 보드도 이때 오류가 나요. "
                "화면의 블루투스 칸에서 [연결]을 누르거나, 코드에서 연결된 뒤에만 보내도록 고쳐요.",
            )
            raise apc_board.board_oserror(128)  # ENOTCONN
        payload = value.data if data is None else to_buffer(data, what)
        limit = max(0, RADIO.mtu - 3)
        if len(payload) > limit:
            apc_board.BOARD.warn_once(
                ("ble-notify-truncated", str(value.handle)),
                f"보드가 보낸 값이 {len(payload)}바이트여서 앞 {limit}바이트만 갔어요. 블루투스 알림은 한 번에 "
                f"MTU({RADIO.mtu})에서 3을 뺀 만큼만 보낼 수 있어요. 가상 보드는 기본 MTU {RADIO.mtu}로 흉내 내요 — "
                "실물은 연결할 때 컴퓨터·스마트폰과 MTU를 더 크게 정하면 잘리지 않을 수 있어요.",
            )
            payload = payload[:limit]
        RADIO.notified(payload)
        return None

    def gatts_notify(self, conn_handle, value_handle, data=None):
        return self._send(conn_handle, value_handle, data, "gatts_notify")

    def gatts_indicate(self, conn_handle, value_handle, data=None):
        return self._send(conn_handle, value_handle, data, "gatts_indicate")

    def gap_disconnect(self, conn_handle):
        return RADIO.disconnect(apc_board.mp_int(conn_handle)) is not None

    def __repr__(self):
        return "<BLE>"

    def __getattr__(self, name):
        raise AttributeError(
            f"'BLE' object has no attribute '{name}' (가상 보드의 블루투스는 주변기기(광고·연결 받기·특성 읽고 쓰기)만 흉내 내요. "
            "스캔·페어링·중앙 장치 역할은 아직 없어요.)"
        )


def _make_module(name):
    module = types.ModuleType(name)
    module.BLE = BLE
    module.UUID = UUID
    module.FLAG_READ = FLAG_READ
    module.FLAG_WRITE = FLAG_WRITE
    module.FLAG_WRITE_NO_RESPONSE = FLAG_WRITE_NO_RESPONSE
    module.FLAG_NOTIFY = FLAG_NOTIFY
    module.FLAG_INDICATE = FLAG_INDICATE
    module.__all__ = ["BLE", "UUID", "FLAG_READ", "FLAG_WRITE", "FLAG_WRITE_NO_RESPONSE", "FLAG_NOTIFY", "FLAG_INDICATE"]
    return module


#: 학생 코드가 `import bluetooth`·`import ubluetooth`로 받는 모듈(하나를 두 이름으로 — 실물도 같은 모듈이다)
MODULE = _make_module("bluetooth")


def _reset():
    """실행 시작(보드를 새로 켬): 무선을 끄고 값·연결·핸들을 비운다. 동기 진입점이라 양보하지 않는다."""
    RADIO.reset()


#: 코드가 끝난 뒤 블루투스를 기다리며 한 번에 쉬는 양(나노초) — 화면 조작에 20ms 안에 반응한다(apc_board의 IDLE_SLICE_NS와 같다)
IDLE_SLICE_NS = 20_000_000
_IDLE_NOTICE = (
    "코드는 끝났지만 블루투스가 켜져 있어 보드가 계속 돌아요. 실물 보드도 그래요 — 블루투스는 펌웨어가 따로 돌려서, "
    "코드가 끝난 뒤에 연결해도 irq 함수가 불려요. 멈추려면 [정지]를 누르세요."
)
_idle_noticed = False


def _idle():
    """학생 코드가 끝난 뒤에도 블루투스가 켜져 있고 irq 함수가 걸려 있으면 [정지]까지 이어 돈다(비동기 진입점이라 기다려도 된다).

    왜: 실물 ESP32는 스크립트가 끝나도 블루투스 스택이 따로 돌아 연결·쓰기 때 irq 함수가 불린다. 가상 보드의 Timer·핀 인터럽트와 같은 자리다
    (apc_runtime.register_idle_hook). f098처럼 `ESP32BLE.init(...)` 한 줄로 끝나는 예제는 연결되면 상태 LED Timer가 멈추는데,
    그때 보드까지 멈춰 버리면 그 뒤의 [보내기]를 받을 수 없다.
    """
    global _idle_noticed
    if not (RADIO.active and RADIO.irq_handler is not None):
        return False
    if not _idle_noticed:
        _idle_noticed = True
        apc_runtime.notice(_IDLE_NOTICE)
    apc_board.wait_ns(IDLE_SLICE_NS)
    return True


def _reset_idle():
    global _idle_noticed
    _idle_noticed = False


apc_runtime.register_reset_hook(_reset)
apc_runtime.register_reset_hook(_reset_idle)
apc_runtime.register_idle_hook(_idle)
apc_board.register_board_module("bluetooth", MODULE)
apc_board.register_board_module("ubluetooth", MODULE)
