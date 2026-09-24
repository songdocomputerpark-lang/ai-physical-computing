"""컴퓨터 쪽 시리얼(pyserial 3.5) 흉내 — 교과서 3-1-2의 PC 코드(f084·f085)가 **한 글자도 고치지 않고** 도는 자리(P4-02,
PLAN §7.3 "USB 시리얼"·§7.6 "원본 코드는 그대로"·§8.4 설계 메모 ③, CODE_MAPPING §6). 화면 쪽은 같은 폴더의 index.ts.

왜 파일 이름이 serial.py인가: Pyodide에는 pyserial 패키지가 아예 없다(진짜 패키지를 덮어쓰는 shims 방식이 아니라,
speech_recognition.py와 같이 **파일 이름이 곧 import 이름**이다 — src/lab/python/modules.ts 머리말).

원본 코드가 쓰는 것(pyserial 3.5 공식 소스로 확인, 2026-09-18 — 이 PC에 설치된 pyserial 3.5의 serialutil.py·serialwin32.py)
    serial.Serial("COM10", 115200)      포트 이름과 속도. 포트 이름은 브라우저에서 뜻이 없어 무시하고 안내만 한다(§7.6).
    uart.write(b'a')                    바이트를 보낸다. str을 주면 진짜 pyserial처럼 TypeError.
    uart.read(n) · uart.readline()      보드가 보낸 바이트. timeout 규칙은 진짜와 같다(None이면 끝까지 기다림, 0이면 바로 돌아옴).
    uart.in_waiting · reset_input_buffer() · close() · is_open · with 문
    serial.tools.list_ports.comports()  붙어 있는 포트 목록(사이트는 "ESP32 실습실 탭" 하나를 돌려준다)

선은 어디로 가나: write() → 화면(index.ts) → 브릿지 통로(같은 컴퓨터 탭 BroadcastChannel 또는 한 화면 iframe) →
ESP32 실습실의 USB-UART 변환기 부품 → 보드 UART2. 반대 방향은 보드 uart.write() → 변환기 → 통로 → 이 파일의 받을 칸.
속도(baudrate)는 그대로 실려 가서 보드와 다르면 **실물처럼 글자가 깨진다**(속도 불일치 실습, §8.4 설계 메모 ④).

규칙(PROGRESS 미해결 25번): 초기화 함수(_reset)는 동기 진입점이라 양보하는 함수(get·poll·sleep·request)를 쓰지 않고 drain만 쓴다.
라이선스: 사이트 소프트웨어(MIT, PD-26). pyserial 자체를 옮겨 오지 않고 **같은 사용법만** 흉내 낸다.
"""

import apc_runtime

__all__ = [
    "EIGHTBITS",
    "FIVEBITS",
    "PARITY_EVEN",
    "PARITY_NAMES",
    "PARITY_NONE",
    "PARITY_ODD",
    "PortNotOpenError",
    "SEVENBITS",
    "SIXBITS",
    "STOPBITS_ONE",
    "STOPBITS_ONE_POINT_FIVE",
    "STOPBITS_TWO",
    "Serial",
    "SerialBase",
    "SerialException",
    "SerialTimeoutException",
    "VERSION",
    "to_bytes",
    "tools",
]

#: 흉내 내는 pyserial 판(공식 3.5와 같은 사용법)
VERSION = "3.5"

REQUEST_OPEN = "serial-pc.open"
EVENT_TX = "serial-pc.tx"
EVENT_CONTROL = "serial-pc.control"
CHANNEL_RX = "serial-pc.rx"
VALUE_INFO = "serial-pc.info"

# pyserial 3.5 serialutil.py의 상수 이름·값 그대로
FIVEBITS, SIXBITS, SEVENBITS, EIGHTBITS = 5, 6, 7, 8
PARITY_NONE, PARITY_EVEN, PARITY_ODD, PARITY_MARK, PARITY_SPACE = "N", "E", "O", "M", "S"
STOPBITS_ONE, STOPBITS_ONE_POINT_FIVE, STOPBITS_TWO = 1, 1.5, 2
PARITY_NAMES = {PARITY_NONE: "None", PARITY_EVEN: "Even", PARITY_ODD: "Odd", PARITY_MARK: "Mark", PARITY_SPACE: "Space"}
LF = b"\n"

#: 값을 기다리며 도는 동안 쉬는 시간(초). 이 사이에 화면 메시지·[정지]가 들어온다.
_POLL_SLEEP = 0.01


class SerialException(IOError):
    """시리얼 포트 오류(pyserial 3.5와 같은 이름·같은 부모 — IOError는 OSError와 같다)"""


class SerialTimeoutException(SerialException):
    """보내기가 시간 안에 끝나지 않음"""


class PortNotOpenError(SerialException):
    """열지 않은 포트를 쓰려고 함"""

    def __init__(self):
        super().__init__("Attempting to use a port that is not open")


def to_bytes(seq):
    """pyserial 3.5 serialutil.to_bytes와 같다 — str을 주면 TypeError로 "bytes로 바꿔서 주세요"라고 알려 준다."""
    if isinstance(seq, bytes):
        return seq
    if isinstance(seq, bytearray):
        return bytes(seq)
    if isinstance(seq, memoryview):
        return seq.tobytes()
    if isinstance(seq, str):
        raise TypeError("unicode strings are not supported, please encode to bytes: {!r}".format(seq))
    return bytes(bytearray(seq))


def _info():
    """화면이 넣어 둔 선 상태 { 'ready': bool, 'peers': [...], 'label': str, 'ports': [...] }(입력 확인 지점)"""
    value = apc_runtime.get(VALUE_INFO)
    return value if isinstance(value, dict) else {}


class Serial:
    """pyserial 3.5의 serial.Serial과 같은 사용법. 실제로는 브릿지 통로(같은 컴퓨터 탭·한 화면)로 나간다."""

    def __init__(
        self,
        port=None,
        baudrate=9600,
        bytesize=EIGHTBITS,
        parity=PARITY_NONE,
        stopbits=STOPBITS_ONE,
        timeout=None,
        xonxoff=False,
        rtscts=False,
        write_timeout=None,
        dsrdtr=False,
        inter_byte_timeout=None,
        exclusive=None,
        **kwargs
    ):
        self.is_open = False
        self.portstr = None
        self.name = None
        self._port = port
        self._baudrate = int(baudrate)
        self._bytesize = bytesize
        self._parity = parity
        self._stopbits = stopbits
        self._timeout = timeout
        self._write_timeout = write_timeout
        self._xonxoff = xonxoff
        self._rtscts = rtscts
        self._dsrdtr = dsrdtr
        self._inter_byte_timeout = inter_byte_timeout
        self._exclusive = exclusive
        self._rx = bytearray()
        if kwargs:
            raise ValueError("unexpected keyword arguments: {!r}".format(kwargs))
        if port is not None:
            self.open()

    # ── 설정값(pyserial은 property로 읽고 쓴다) ──

    @property
    def port(self):
        return self._port

    @port.setter
    def port(self, value):
        self._port = value
        if value is not None and not self.is_open:
            self.open()

    @property
    def baudrate(self):
        return self._baudrate

    @baudrate.setter
    def baudrate(self, value):
        self._baudrate = int(value)

    @property
    def timeout(self):
        return self._timeout

    @timeout.setter
    def timeout(self, value):
        self._timeout = value

    @property
    def bytesize(self):
        return self._bytesize

    @property
    def parity(self):
        return self._parity

    @property
    def stopbits(self):
        return self._stopbits

    @property
    def write_timeout(self):
        return self._write_timeout

    # ── 열기·닫기 ──

    def open(self):
        """통로를 연다. ESP32 실습실 탭이 없으면 SerialException + 한국어 안내(§8.4 설계 메모 ③)."""
        if self.is_open:
            raise SerialException("Port is already open.")
        reply = apc_runtime.request(
            REQUEST_OPEN,
            {"port": None if self._port is None else str(self._port), "baudrate": self._baudrate, "timeout": self._timeout},
        )
        reply = reply if isinstance(reply, dict) else {}
        if not reply.get("ok"):
            raise SerialException(str(reply.get("error") or "시리얼 통로를 열지 못했어요."))
        self.portstr = str(reply.get("portstr") or self._port or "")
        self.name = self.portstr
        self.is_open = True
        self._rx = bytearray()
        for text in reply.get("notices") or []:
            apc_runtime.notice(str(text))

    def close(self):
        if not self.is_open:
            return
        self.is_open = False
        apc_runtime.emit(EVENT_CONTROL, {"kind": "close"})

    def __enter__(self):
        if self._port is not None and not self.is_open:
            self.open()
        return self

    def __exit__(self, *args, **kwargs):
        self.close()

    def __repr__(self):
        return (
            "Serial<id=0x{id:x}, open={p.is_open}>(port={p.portstr!r}, baudrate={p.baudrate!r}, bytesize={p.bytesize!r}, "
            "parity={p.parity!r}, stopbits={p.stopbits!r}, timeout={p.timeout!r}, xonxoff={p.xonxoff!r}, rtscts={p.rtscts!r}, "
            "dsrdtr={p.dsrdtr!r})".format(id=id(self), p=self)
        )

    @property
    def xonxoff(self):
        return self._xonxoff

    @property
    def rtscts(self):
        return self._rtscts

    @property
    def dsrdtr(self):
        return self._dsrdtr

    # ── 보내기 ──

    def write(self, data):
        """바이트를 보드로 보낸다. 보낸 바이트 수를 돌려준다(진짜 pyserial과 같다)."""
        if not self.is_open:
            raise PortNotOpenError()
        payload = to_bytes(data)
        if payload:
            apc_runtime.emit(EVENT_TX, {"bytes": list(payload), "baud": self._baudrate})
        return len(payload)

    def flush(self):
        """보낼 것이 다 나갈 때까지 기다린다(차례가 초당 10회로 내보낸다 — §7.2 규칙 4)."""
        if not self.is_open:
            raise PortNotOpenError()
        apc_runtime.sleep(_POLL_SLEEP)

    @property
    def out_waiting(self):
        return 0

    def reset_output_buffer(self):
        if not self.is_open:
            raise PortNotOpenError()

    # ── 받기 ──

    def _pump(self):
        """화면이 쌓아 둔 바이트를 받을 칸으로 옮긴다(입력 확인 지점 — 여기서 [정지]도 확인된다)."""
        for item in apc_runtime.poll(CHANNEL_RX):
            if isinstance(item, dict):
                item = item.get("bytes")
            if isinstance(item, (list, tuple)):
                self._rx += bytes(int(value) & 0xFF for value in item)
            elif isinstance(item, (bytes, bytearray)):
                self._rx += bytes(item)
        return len(self._rx)

    @property
    def in_waiting(self):
        """받을 칸에 들어 있는 바이트 수"""
        if not self.is_open:
            raise PortNotOpenError()
        return self._pump()

    def _take(self, count):
        chunk = bytes(self._rx[:count])
        del self._rx[:count]
        return chunk

    def read(self, size=1):
        """size 바이트를 읽는다. timeout이 None이면 다 올 때까지, 0이면 지금 있는 것만, 숫자면 그 시간까지(pyserial과 같다)."""
        if not self.is_open:
            raise PortNotOpenError()
        size = int(size)
        if size <= 0:
            return b""
        deadline = None if self._timeout is None else float(self._timeout)
        waited = 0.0
        while True:
            if self._pump() >= size:
                return self._take(size)
            if deadline is not None and waited >= deadline:
                # 시간이 다 됐으면 지금까지 온 것만 준다(진짜 pyserial도 적게 준다).
                return self._take(len(self._rx))
            apc_runtime.sleep(_POLL_SLEEP)
            waited += _POLL_SLEEP

    def read_until(self, expected=LF, size=None):
        """expected가 나올 때까지(기본 줄바꿈) 읽는다 — pyserial 3.5 serialutil.SerialBase.read_until과 같은 규칙."""
        expected = to_bytes(expected)
        line = bytearray()
        while True:
            char = self.read(1)
            if char:
                line += char
                if line[-len(expected) :] == expected:
                    break
                if size is not None and len(line) >= size:
                    break
            else:
                break
        return bytes(line)

    def readline(self, size=-1):
        """한 줄을 읽는다(줄바꿈까지). timeout이 0이면 **줄바꿈이 없어도** 지금까지 온 바이트를 준다."""
        return self.read_until(LF, None if size is None or size < 0 else size)

    def readlines(self, hint=-1):
        lines = []
        while True:
            line = self.readline()
            if not line:
                break
            lines.append(line)
            if hint is not None and hint > 0 and sum(len(item) for item in lines) >= hint:
                break
        return lines

    def read_all(self):
        """지금 받을 칸에 있는 것을 모두 읽는다"""
        if not self.is_open:
            raise PortNotOpenError()
        self._pump()
        return self._take(len(self._rx))

    def reset_input_buffer(self):
        """받을 칸을 비운다"""
        if not self.is_open:
            raise PortNotOpenError()
        self._pump()
        self._rx = bytearray()

    # 옛 이름(pyserial 3.5도 남겨 둔 것)
    def inWaiting(self):
        return self.in_waiting

    def flushInput(self):
        self.reset_input_buffer()

    def flushOutput(self):
        self.reset_output_buffer()


#: pyserial은 Serial이 SerialBase를 물려받는다. 이름으로 검사하는 코드가 있어 같은 이름을 둔다.
SerialBase = Serial


class _ListPortInfo:
    """serial.tools.list_ports.comports()가 돌려주는 항목(pyserial 3.5 list_ports_common.ListPortInfo와 같은 칸)"""

    def __init__(self, device, description="n/a", hwid="n/a"):
        self.device = device
        self.name = device
        self.description = description
        self.hwid = hwid
        self.vid = None
        self.pid = None
        self.serial_number = None
        self.location = None
        self.manufacturer = None
        self.product = None
        self.interface = None

    def __str__(self):
        return "{} - {}".format(self.device, self.description)

    def __repr__(self):
        return "<ListPortInfo {!r}>".format(self.device)

    def __getitem__(self, index):
        # pyserial은 (device, description, hwid) 세 칸으로도 풀 수 있게 해 둔다.
        return (self.device, self.description, self.hwid)[index]


def _comports(include_links=False):
    """붙어 있는 포트 목록. 사이트에서는 ESP32 실습실 탭(가상 USB-UART 변환기) 하나다."""
    ports = _info().get("ports")
    items = ports if isinstance(ports, list) else []
    found = []
    for item in items:
        if isinstance(item, dict):
            found.append(_ListPortInfo(str(item.get("device") or "?"), str(item.get("description") or "n/a"), str(item.get("hwid") or "n/a")))
    return found


class _ListPortsModule:
    """serial.tools.list_ports 자리"""

    comports = staticmethod(_comports)
    ListPortInfo = _ListPortInfo


class _ToolsModule:
    """serial.tools 자리"""

    list_ports = _ListPortsModule()


tools = _ToolsModule()


def _register_submodules():
    """`import serial.tools.list_ports`와 `from serial.tools import list_ports`가 되게 sys.modules에 자리를 만든다.

    파이썬은 점이 든 이름을 sys.modules에서 먼저 찾으므로, 여기서 넣어 두면 진짜 꾸러미(package) 폴더가 없어도 import된다.
    """
    import sys
    import types

    this = sys.modules[__name__]
    tools_module = types.ModuleType("serial.tools")
    list_ports_module = types.ModuleType("serial.tools.list_ports")
    list_ports_module.comports = _comports
    list_ports_module.ListPortInfo = _ListPortInfo
    tools_module.list_ports = list_ports_module
    sys.modules["serial.tools"] = tools_module
    sys.modules["serial.tools.list_ports"] = list_ports_module
    this.tools = tools_module


_register_submodules()


def _reset():
    """실행이 시작될 때 지난 실행에 쌓인 바이트를 버린다(동기 진입점 — drain만 쓴다)."""
    apc_runtime.drain(CHANNEL_RX)


apc_runtime.register_reset_hook(_reset)
