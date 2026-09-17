"""가상 ESP32 보드의 machine.I2C·machine.SoftI2C(PLAN §8.3 P3-04, CODE_MAPPING §3.8.1·§3.8.3, src/lab/README.md 7.6).

학생 코드는 실물 ESP32와 똑같이 쓴다(ESP32 실습실에서만 들어온다 — machine.py가 이 확장이 등록한 이름을 내보낸다):

    from machine import Pin, SoftI2C
    i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
    i2c.scan()                           # [32] — 배선도의 문자 LCD(주소 0x20)
    i2c.writeto(0x20, bytearray([0]))    # 장치에 바이트를 보낸다(대답(ACK)한 바이트 수를 돌려준다)

실물과 같게 맞춘 것(MicroPython v1.29.0 extmod/machine_i2c.c·ports/esp32/machine_i2c.c·machine_i2c.h·mphalport.h, py/argcheck.c, 2026-09-18 확인)
- SoftI2C(scl, sda, *, freq=400000, timeout=50000): scl·sda는 Pin 객체나 GPIO 번호(그 밖은 ValueError('invalid pin')).
  freq로 반주기 us_delay = 500000 // freq(0이면 1)를 정하므로 repr은 SoftI2C(scl=22, sda=21, freq=500000)처럼 500000 // us_delay가 찍힌다.
  만들면 두 핀을 오픈 드레인 출력(값 1 = 선을 놓음)으로 정한다.
- I2C(id=0, *, scl, sda, freq=400000, timeout=50000): ESP32 하드웨어 I2C 0·1번(그 밖은 ValueError('I2C(2) doesn't exist')). 번호마다 같은 객체이고
  기본 핀은 0번 SCL 18·SDA 19, 1번 SCL 25·SDA 26. 핀은 오픈 드레인 + 보드 안 풀업. I2C(-1, …)은 경고를 찍고 SoftI2C를 만든다.
  repr I2C(0, scl=22, sda=21, freq=400000, timeout=50000). 하드웨어 I2C에는 init()·start()·stop()·readinto()·write()가 없어
  OSError('I2C operation not supported')를 낸다(v1.29.0 새 ESP-IDF 드라이버: 쓰기는 보낸 바이트 수를 돌려주고, 대답이 없으면 데이터 중간이라도 ENODEV).
- 함수: scan()(0x08~0x77 가운데 대답한 주소 목록), writeto(addr, buf, stop=True) → ACK 수, readfrom(addr, n, stop=True) → bytes,
  readfrom_into(addr, buf, stop=True), writevto(addr, [buf, …], stop=True) → ACK 수, readfrom_mem(addr, memaddr, n, *, addrsize=8),
  readfrom_mem_into(addr, memaddr, buf, *, addrsize=8), writeto_mem(addr, memaddr, buf, *, addrsize=8)(addrsize가 8의 배수가 아니거나 32보다 크면
  ValueError('invalid addrsize')), SoftI2C의 기본 동작 start()·stop()·readinto(buf, nack=True)·write(buf).
- 주소 바이트는 (addr << 1)의 아래 8비트라 SoftI2C는 addr & 0x7F로 부른다(하드웨어 I2C는 0x7F보다 크면 ENODEV).
- 주소에 대답하는 장치가 없으면 OSError: [Errno 19] ENODEV(args (19,)). SoftI2C는 데이터 바이트 중간에 대답이 없으면 오류 없이 거기까지의 ACK 수를 돌려준다.
- 인자 오류 문구: "'scl' argument required", "extra positional arguments given", "extra keyword arguments given",
  "function missing 1 required positional arguments", "function expected at most 4 arguments, got 5", "can't convert float to int",
  "object with buffer protocol required", "object 'int' isn't a tuple or list".

가상 I2C 버스
- 버스 = 코드가 정한 (SCL 핀, SDA 핀) 한 쌍. 배선(board.wiring)에서 역할 scl·sda의 핀이 똑같은 부품 장치가 그 버스에 매달려 있다.
- 부품 흉내(parts/<부품>/apc_part_*.py — register_part의 factory가 돌려주는 장치)에 아래를 두면 I2C 장치가 된다.
    i2c_address        7비트 주소(정수, 필수)
    i2c_start(read)    주소가 맞아 전송이 시작될 때(read: 읽기인지). False를 돌려주면 대답(ACK)하지 않는다. 선택 — 없으면 늘 대답
    i2c_write(data)    받은 바이트들(bytes). 앞에서부터 받다가 대답하지 않을 바이트에서 멈추고, 받은(ACK한) 바이트 수를 돌려준다
    i2c_read(count)    count바이트(bytes)를 돌려준다
    i2c_stop()         STOP(선택). 반복 시작(repeated start)에는 불리지 않는다
    i2c_hint(data)     (선택, 가상 보드 전용) 드라이버 흉내가 버스 객체의 _apc_hint(addr, data)로 보내는 설명(예: OLED에 쓴 글자) — 실물 선에는 없는 통로
- 같은 주소 장치가 한 버스에 둘이면 둘 다 받고, 읽으면 두 값의 AND(선이 0으로 당겨지는 쪽이 이김)예요 — 실물과 같은 뜻.
- 배선의 I2C 장치가 쓰는 핀에는 모듈의 풀업 저항처럼 약한 풀업을 건다(핀 표에서 선이 평소 1로 보이게, apc_board.BOARD.apply_input).
- 입력 확인 지점(PLAN §4.4): 버스를 쓰는 함수(scan·writeto·readfrom…)마다 한 번 apc_board.check_point()를 지난다(실물 scan은 주소마다 쌓인 일을
  처리하고, 읽기는 바깥 장치를 보는 일이라). 16ms마다 한 번 양보하므로 sleep 없는 LCD 반복문도 [정지]·Timer 콜백이 돈다.
- 대답이 없을 때(ENODEV) 콘솔에 왜 못 찾았는지(주소가 다름·SDA/SCL 핀이 배선과 다름·배선에 I2C 장치 없음)를 한국어로 한 번 알린다.

흉내 내지 않는 것(실물과 다른 점 — 부록 B-2에서 실물 확인)
- 선의 전압이 비트마다 바뀌는 모습, 클럭 늘이기와 시간 초과(풀업이 없는 선의 ETIMEDOUT), freq에 따른 전송 시간.
  핀이나 주소가 틀리면 모두 ENODEV로 알린다. 교과서 오류 표의 "OSError: [Errno 5] EIO(SCL/SDA 핀 번호 오류)"는 v1.29.0 SoftI2C 소스에 없는 오류라
  가상 보드는 내지 않는다(실물 키트에서 어떤 오류가 나는지 확인 필요).
- SoftI2C의 freq=0은 실물에서 0으로 나누기로 보드가 다시 켜지는데, 가상 보드는 ZeroDivisionError와 안내로 멈춘다.

동기 진입점 규칙(PROGRESS 미해결 25번): 초기화 훅(_reset)에서는 양보하지 않는다. 라이선스: 사이트 소프트웨어(MIT, PD-26) — MicroPython 코드를
옮기지 않고 동작·문구만 맞췄다.
"""

import apc_board
import apc_runtime

__all__ = ["I2C", "SoftI2C", "i2c_devices_on", "wired_i2c_devices"]

ENODEV = 19
#: SoftI2C 기본값(extmod/machine_i2c.c)
SOFT_DEFAULT_FREQ = 400_000
DEFAULT_TIMEOUT_US = 50_000
#: ESP32 하드웨어 I2C 수(I2C_NUM_MAX)와 기본 핀(ports/esp32/machine_i2c.h, CONFIG_IDF_TARGET_ESP32)
HARDWARE_BUSES = 2
HARDWARE_DEFAULT_PINS = {0: (18, 19), 1: (25, 26)}
#: scan()이 보는 주소(0b0000xxx·0b1111xxx는 예약)
SCAN_FIRST = 0x08
SCAN_END = 0x78
NOT_SUPPORTED = "I2C operation not supported"

_U32 = 0xFFFFFFFF

# ───────────────────────── 인자 읽기(MicroPython 문구) ─────────────────────────

_REQUIRED = 1
_KW_ONLY = 2
_INT = "int"
_OBJ = "obj"


def _machine_int(value):
    """mp_obj_get_int: int·bool만(소수·글자·None은 TypeError), 32비트 보드의 기계 정수에 안 들어가면 OverflowError"""
    number = apc_board.mp_int(value)
    if not -(1 << 31) <= number < (1 << 31):
        raise OverflowError("overflow converting long int to machine word")
    return number


def _check_num(count, kwargs, n_min, n_max):
    """mp_arg_check_num(자기 자신 포함 개수) — 키워드 인자를 받지 않는 함수"""
    if kwargs:
        raise TypeError("function doesn't take keyword arguments")
    if n_min == n_max:
        if count != n_min:
            raise TypeError(f"function takes {n_min} positional arguments but {count} were given")
    elif count < n_min:
        raise TypeError(f"function missing {n_min - count} required positional arguments")
    elif count > n_max:
        raise TypeError(f"function expected at most {n_max} arguments, got {count}")


def _parse_all(positional, keywords, allowed):
    """mp_arg_parse_all: allowed = [(이름, 종류, 표시, 기본값)] → {이름: 값}"""
    values = {}
    used_keywords = 0
    for index, (name, kind, flags, default) in enumerate(allowed):
        if index < len(positional):
            if flags & _KW_ONLY:
                raise TypeError("extra positional arguments given")
            given = positional[index]
        elif name in keywords:
            used_keywords += 1
            given = keywords[name]
        else:
            if flags & _REQUIRED:
                raise TypeError(f"'{name}' argument required")
            values[name] = default
            continue
        values[name] = _machine_int(given) if kind == _INT else given
    if len(positional) > len(allowed):
        raise TypeError("extra positional arguments given")
    if used_keywords < len(keywords):
        raise TypeError("extra keyword arguments given")
    return values


def _read_buffer(value):
    """읽기용 버퍼(MP_BUFFER_READ): bytes·bytearray·memoryview·array·str(UTF-8 바이트)"""
    if isinstance(value, str):
        return value.encode("utf-8")
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    try:
        return memoryview(value).cast("B").tobytes()
    except TypeError:
        raise TypeError("object with buffer protocol required") from None


def _write_buffer(value):
    """쓰기용 버퍼(MP_BUFFER_WRITE): bytearray·memoryview·array처럼 고칠 수 있는 것만(bytes·str은 안 됨)"""
    if isinstance(value, (bytes, str)):
        raise TypeError("object with buffer protocol required")
    try:
        view = memoryview(value)
    except TypeError:
        raise TypeError("object with buffer protocol required") from None
    if view.readonly:
        raise TypeError("object with buffer protocol required")
    return view.cast("B")


def _array_items(value):
    """mp_obj_get_array: 튜플·리스트만"""
    if isinstance(value, (tuple, list)):
        return list(value)
    raise TypeError(f"object '{type(value).__name__}' isn't a tuple or list")


def _memaddr_bytes(memaddr, addrsize):
    """readfrom_mem·writeto_mem의 메모리 주소 바이트(큰 쪽부터). addrsize는 uint8_t로 들어간다."""
    size = addrsize & 0xFF
    if size & 7 or size > 32:
        raise ValueError("invalid addrsize")
    address = memaddr & _U32
    return bytes((address >> shift) & 0xFF for shift in range(size - 8, -1, -8))


def _new_bytes_length(count):
    """vstr_init_len: 음수는 아주 큰 크기로 바뀌어 메모리를 못 잡는다"""
    if count < 0:
        raise MemoryError(f"memory allocation failed, allocating {count & _U32} bytes")
    return count


# ───────────────────────── 가상 I2C 버스 ─────────────────────────


def wired_i2c_devices():
    """이번 실행의 I2C 장치 [(배선 항목, 장치)] — 장치에 i2c_address가 있는 부품만(배선 순서)"""
    return [(entry, device) for entry, device in apc_board.wired_devices() if getattr(device, "i2c_address", None) is not None]


def i2c_devices_on(scl, sda):
    """(SCL, SDA) 핀 쌍에 이어진 I2C 장치 [(배선 항목, 장치)]"""
    return [(entry, device) for entry, device in wired_i2c_devices() if entry["pins"].get("scl") == scl and entry["pins"].get("sda") == sda]


def _device_address(device):
    return int(device.i2c_address) & 0x7F


def _select(scl, sda, address, read):
    """주소 바이트를 보냈을 때 대답(ACK)한 장치 목록"""
    chosen = []
    for _entry, device in i2c_devices_on(scl, sda):
        if _device_address(device) != address:
            continue
        start = getattr(device, "i2c_start", None)
        if start is None or start(bool(read)):
            chosen.append(device)
    return chosen


def _write(devices, data):
    """바이트들을 보낸다 → ACK한 바이트 수(여러 장치면 가장 많이 받은 수 — 하나라도 ACK하면 선이 0이 된다)"""
    if not data:
        return 0
    best = 0
    for device in devices:
        best = max(best, int(device.i2c_write(bytes(data))))
    return max(0, min(best, len(data)))


def _read(devices, count):
    """count바이트를 읽는다. 여러 장치면 AND(0이 이김), 장치가 모자라게 주면 선이 놓인 1(0xFF)로 채운다."""
    if count <= 0:
        return b""
    result = None
    for device in devices:
        got = bytes(device.i2c_read(count))[:count]
        got = got + b"\xff" * (count - len(got))
        result = got if result is None else bytes(a & b for a, b in zip(result, got))
    return result if result is not None else b"\xff" * count


def _stop(devices):
    for device in devices:
        stop = getattr(device, "i2c_stop", None)
        if stop is not None:
            stop()


def _hex(address):
    return f"0x{address:02X}"


def _explain_no_device(scl, sda, address):
    """ENODEV를 낼 때 콘솔에 한 번: 왜 대답이 없는지(주소·핀·배선)"""
    here = i2c_devices_on(scl, sda)
    everywhere = wired_i2c_devices()
    if here:
        names = ", ".join(f"{entry['label']}(주소 {_hex(_device_address(device))})" for entry, device in here)
        text = (
            f"I2C 주소 {_hex(address)}({address})에 대답하는 장치가 없어요(OSError ENODEV). SCL=GPIO{scl}·SDA=GPIO{sda}에 이어진 장치는 {names}예요. "
            "코드에 적은 주소를 장치 주소와 같게 고치거나, i2c.scan()으로 찾은 주소를 적어요."
        )
    elif everywhere:
        entry = everywhere[0][0]
        text = (
            f"코드는 SCL=GPIO{scl}·SDA=GPIO{sda}로 I2C를 열었는데, 배선도의 {entry['label']}은(는) SCL=GPIO{entry['pins'].get('scl')}·"
            f"SDA=GPIO{entry['pins'].get('sda')}에 이어져 있어서 대답하지 않아요(OSError ENODEV). 두 핀 번호가 바뀌지 않았는지 확인하고 배선과 같게 적어요."
        )
    else:
        text = (
            f"I2C 주소 {_hex(address)}({address})에 대답하는 장치가 없어요(OSError ENODEV). 이 예제의 배선도에는 I2C 장치(문자 LCD·OLED)가 없어요. "
            "LCD나 OLED를 쓰는 예제를 골라 배선도가 그려진 상태에서 실행해요."
        )
    apc_board.BOARD.warn_once(("i2c-no-device", scl, sda, address), text)


def _explain_bad_address(scl, sda, address_value):
    """하드웨어 I2C에 7비트 주소(0~127) 밖의 값을 줬을 때(ESP-IDF가 주소를 받지 않아 ENODEV)"""
    apc_board.BOARD.warn_once(
        ("i2c-bad-address", scl, sda, address_value),
        f"I2C 주소는 0~127(0x00~0x7F)이에요. {address_value}은(는) 주소 칸에 들어가지 않아 대답하는 장치가 없어요(OSError ENODEV). "
        "i2c.scan()으로 찾은 주소를 적어요.",
    )


def _prepare_lines(scl, sda, internal_pull_up):
    """버스 핀을 오픈 드레인 출력(값 1 = 선을 놓음)으로 정하고, 배선의 I2C 장치가 쓰는 핀에는 모듈 풀업 저항처럼 약한 풀업을 건다."""
    board = apc_board.BOARD
    # 배선과 핀 모드를 맞춰 보는 안내(P3-02 "배선에 없는 핀을 출력으로")는 I2C 선에서는 끈다 — 장치가 대답하지 않으면 _explain_no_device가
    # 주소·핀·배선을 함께 알려 주므로 같은 일에 안내가 세 줄씩 나오지 않게(configure는 양보하지 않아 잠깐 바꿨다 되돌려도 안전하다).
    wiring_known = board.wiring_known
    board.wiring_known = False
    try:
        for gpio in (scl, sda):
            try:
                board.configure(gpio, mode=apc_board.MODE_OPEN_DRAIN, pull=apc_board.PULL_UP if internal_pull_up else -1, value=1)
            except ValueError:
                # 실물 ESP-IDF는 gpio_set_direction 오류를 기록만 하고 넘어간다(선을 0으로 당길 수 없어 장치가 대답하지 않는다).
                board.warn_once(
                    ("i2c-input-only", gpio),
                    f"{gpio}번 핀(34~39번)은 입력 전용이라 I2C의 SDA·SCL 선으로 쓸 수 없어요. 실물 보드에서도 장치와 주고받지 못해요. 0~33번 가운데 쓸 수 있는 핀을 골라요.",
                )
    finally:
        board.wiring_known = wiring_known
    wired = set()
    for entry, _device in wired_i2c_devices():
        for role in ("scl", "sda"):
            gpio = entry["pins"].get(role)
            if isinstance(gpio, int):
                wired.add(gpio)
    for gpio in (scl, sda):
        if gpio in wired and gpio not in board.drives:
            board.apply_input({"pin": gpio, "drive": "pullup"})


# ───────────────────────── 공통 함수(extmod/machine_i2c.c의 표) ─────────────────────────


class _I2CBase:
    """SoftI2C와 I2C가 함께 쓰는 함수. 전송은 하위 클래스의 _transfer가 맡는다."""

    _scl = 0
    _sda = 0

    # 하위 클래스가 채운다: _transfer(address_value, bufs, read, stop) → 정수(음수면 -errno), _read_mem(…), 기본 동작 여부
    _supports_primitives = False

    def _raise_if_error(self, result):
        if result < 0:
            raise apc_board.board_oserror(-result)
        return result

    def deinit(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 1, 1)
        # SoftI2C·하드웨어 I2C 모두 deinit이 NULL이라 하는 일이 없다.

    def scan(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 1, 1)
        apc_board.check_point()
        found = []
        for address in range(SCAN_FIRST, SCAN_END):
            if self._transfer(address, [b""], False, True, quiet=True) == 0:
                found.append(address)
        return found

    def readfrom(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 3, 4)
        address = _machine_int(args[0])
        count = _new_bytes_length(_machine_int(args[1]))
        stop = True if len(args) < 3 else bool(args[2])
        apc_board.check_point()
        buffer = bytearray(count)
        self._raise_if_error(self._transfer(address, [memoryview(buffer)], True, stop))
        return bytes(buffer)

    def readfrom_into(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 3, 4)
        address = _machine_int(args[0])
        view = _write_buffer(args[1])
        stop = True if len(args) < 3 else bool(args[2])
        apc_board.check_point()
        self._raise_if_error(self._transfer(address, [view], True, stop))

    def writeto(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 3, 4)
        address = _machine_int(args[0])
        data = _read_buffer(args[1])
        stop = True if len(args) < 3 else bool(args[2])
        apc_board.check_point()
        return self._raise_if_error(self._transfer(address, [data], False, stop))

    def writevto(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 3, 4)
        address = _machine_int(args[0])
        items = _array_items(args[1])
        stop = True if len(args) < 3 else bool(args[2])
        buffers = [data for data in (_read_buffer(item) for item in items) if len(data) > 0]
        if not buffers:
            buffers = [b""]
        apc_board.check_point()
        return self._raise_if_error(self._transfer(address, buffers, False, stop))

    def _mem_args(self, args, kwargs):
        # machine_i2c_mem_allowed_args: 세 번째 인자의 이름은 셋 다 arg다(키워드로는 addr=·memaddr=·arg=·addrsize=)
        allowed = (("addr", _INT, _REQUIRED, 0), ("memaddr", _INT, _REQUIRED, 0), ("arg", _OBJ, _REQUIRED, None), ("addrsize", _INT, _KW_ONLY, 8))
        values = _parse_all(args, kwargs, allowed)
        return values["addr"], values["memaddr"], values["arg"], values["addrsize"]

    def readfrom_mem(self, *args, **kwargs):
        address, memaddr, count_value, addrsize = self._mem_args(args, kwargs)
        count = _new_bytes_length(_machine_int(count_value))
        prefix = _memaddr_bytes(memaddr, addrsize)
        apc_board.check_point()
        buffer = bytearray(count)
        self._raise_if_error(self._read_mem(address, prefix, memoryview(buffer)))
        return bytes(buffer)

    def readfrom_mem_into(self, *args, **kwargs):
        address, memaddr, target, addrsize = self._mem_args(args, kwargs)
        view = _write_buffer(target)
        prefix = _memaddr_bytes(memaddr, addrsize)
        apc_board.check_point()
        self._raise_if_error(self._read_mem(address, prefix, view))

    def writeto_mem(self, *args, **kwargs):
        address, memaddr, source, addrsize = self._mem_args(args, kwargs)
        data = _read_buffer(source)
        prefix = _memaddr_bytes(memaddr, addrsize)
        apc_board.check_point()
        self._raise_if_error(self._transfer(address, [prefix, data], False, True, mem_write=True))

    # 가상 보드 전용 통로: 드라이버 흉내(ssd1306.py 등)가 화면 설명을 장치에 넘긴다(실물 버스에는 없는 이름 — getattr로 찾아 쓴다).
    def _apc_hint(self, address, data):
        for _entry, device in i2c_devices_on(self._scl, self._sda):
            if _device_address(device) == (int(address) & 0x7F):
                hint = getattr(device, "i2c_hint", None)
                if hint is not None:
                    hint(data)


class SoftI2C(_I2CBase):
    """machine.SoftI2C(scl, sda, *, freq=400000, timeout=50000) — 소프트웨어(비트뱅잉) I2C"""

    _supports_primitives = True

    def __init__(self, *args, **kwargs):
        self._us_delay = 1
        self._timeout = DEFAULT_TIMEOUT_US
        self._open = None  # start() 뒤 기본 동작 상태: None | 'address' | ('write'|'read', 장치 목록)
        self._configure(args, kwargs)

    def init(self, *args, **kwargs):
        self._configure(args, kwargs)

    def _configure(self, args, kwargs):
        allowed = (("scl", _OBJ, _REQUIRED, None), ("sda", _OBJ, _REQUIRED, None), ("freq", _INT, _KW_ONLY, SOFT_DEFAULT_FREQ), ("timeout", _INT, _KW_ONLY, DEFAULT_TIMEOUT_US))
        values = _parse_all(args, kwargs, allowed)
        scl = apc_board.find_pin(values["scl"])
        sda = apc_board.find_pin(values["sda"])
        # mp_hal_i2c_init(self, uint32_t freq): 음수 freq는 아주 큰 부호 없는 수가 되어 us_delay가 0 → 1이 된다.
        freq = values["freq"] & _U32
        if freq == 0:
            apc_board.BOARD.warn_once(
                ("i2c-freq-zero", scl, sda),
                "SoftI2C의 freq를 0으로 적었어요. 실물 보드에서는 0으로 나누기가 일어나 보드가 멈추고 다시 켜져요. freq=400000처럼 0보다 큰 값을 적어요.",
            )
            raise ZeroDivisionError("divide by zero")
        us_delay = 500_000 // freq
        self._scl = scl
        self._sda = sda
        self._us_delay = us_delay if us_delay != 0 else 1
        self._timeout = values["timeout"] & _U32
        self._open = None
        _prepare_lines(scl, sda, internal_pull_up=False)

    def __repr__(self):
        return f"SoftI2C(scl={self._scl}, sda={self._sda}, freq={500_000 // self._us_delay})"

    def _transfer(self, address_value, bufs, read, stop, quiet=False, mem_write=False):
        """mp_machine_soft_i2c_transfer: 주소 → 데이터(버퍼 차례로) → STOP. 결과: 쓰기는 ACK 수, 읽기는 0, 대답 없으면 -ENODEV"""
        address = address_value & 0x7F
        devices = _select(self._scl, self._sda, address, read)
        if not devices:
            if not quiet:
                _explain_no_device(self._scl, self._sda, address)
            return -ENODEV
        self._open = None
        if read:
            total = sum(len(buf) for buf in bufs)
            data = _read(devices, total)
            offset = 0
            for buf in bufs:
                size = len(buf)
                buf[:size] = data[offset : offset + size]
                offset += size
            result = 0
        else:
            result = 0
            for buf in bufs:
                data = bytes(buf)
                if not data:
                    continue
                acked = _write(devices, data)
                result += acked
                if acked < len(data):
                    break
        if stop:
            _stop(devices)
        return result

    def _read_mem(self, address_value, prefix, view):
        """read_mem(쓰기 한 번 + 반복 시작 읽기 — SoftI2C는 WRITE1 전송이 없어 두 번에 나눈다)"""
        result = self._transfer(address_value, [prefix], False, False)
        if result < 0:
            return result
        if result != len(prefix):
            self._transfer(address_value, [b""], False, True, quiet=True)
            return result
        return self._transfer(address_value, [view], True, True)

    # ── 기본 동작(primitive): start → write(주소 바이트·데이터) / readinto → stop ──

    def start(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 1, 1)
        apc_board.check_point()
        self._open = "address"

    def stop(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 1, 1)
        apc_board.check_point()
        if isinstance(self._open, tuple):
            _stop(self._open[1])
        self._open = None

    def write(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 2, 2)
        data = _read_buffer(args[0])
        apc_board.check_point()
        acks = 0
        for value in data:
            state = self._open
            if state == "address":
                read = bool(value & 1)
                devices = _select(self._scl, self._sda, value >> 1, read)
                if not devices:
                    break
                self._open = ("read" if read else "write", devices)
            elif isinstance(state, tuple) and state[0] == "write":
                if _write(state[1], bytes((value,))) < 1:
                    break
            else:
                # START 없이 보낸 바이트·읽기 중에 보낸 바이트에는 아무도 대답하지 않는다(선이 놓여 NACK)
                break
            acks += 1
        return acks

    def readinto(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 2, 3)
        view = _write_buffer(args[0])
        apc_board.check_point()
        state = self._open
        if isinstance(state, tuple) and state[0] == "read":
            data = _read(state[1], len(view))
        else:
            data = b"\xff" * len(view)
        view[: len(view)] = data


class I2C(_I2CBase):
    """machine.I2C(id=0, *, scl, sda, freq=400000, timeout=50000) — ESP32 하드웨어 I2C(0·1번, 번호마다 같은 객체)"""

    def __new__(cls, *args, **kwargs):
        if args and type(args[0]) is int and args[0] == -1:
            print("Warning: I2C(-1, ...) is deprecated, use SoftI2C(...) instead")
            return SoftI2C(*args[1:], **kwargs)
        allowed = (("id", _INT, 0, 0), ("scl", _OBJ, _KW_ONLY, None), ("sda", _OBJ, _KW_ONLY, None), ("freq", _INT, _KW_ONLY, -1), ("timeout", _INT, _KW_ONLY, -1))
        values = _parse_all(args, kwargs, allowed)
        bus_id = values["id"]
        if not 0 <= bus_id < HARDWARE_BUSES:
            raise ValueError(f"I2C({bus_id}) doesn't exist")
        self = _hardware_buses.get(bus_id)
        if self is None:
            self = object.__new__(cls)
            self._id = bus_id
            self._scl, self._sda = HARDWARE_DEFAULT_PINS[bus_id]
            self._freq = 400_000
            self._timeout = DEFAULT_TIMEOUT_US
            _hardware_buses[bus_id] = self
        if values["scl"] is not None:
            self._scl = apc_board.find_pin(values["scl"])
        if values["sda"] is not None:
            self._sda = apc_board.find_pin(values["sda"])
        if values["freq"] != -1:
            self._freq = values["freq"] & _U32
        if values["timeout"] != -1:
            self._timeout = values["timeout"] & _U32
        _prepare_lines(self._scl, self._sda, internal_pull_up=True)
        return self

    def __init__(self, *args, **kwargs):
        # 설정은 __new__가 모두 했다(번호마다 같은 객체를 돌려준다).
        pass

    def __repr__(self):
        return f"I2C({self._id}, scl={self._scl}, sda={self._sda}, freq={self._freq}, timeout={self._timeout})"

    def init(self, *args, **kwargs):
        raise OSError(NOT_SUPPORTED)

    def start(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 1, 1)
        raise OSError(NOT_SUPPORTED)

    def stop(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 1, 1)
        raise OSError(NOT_SUPPORTED)

    def readinto(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 2, 3)
        raise OSError(NOT_SUPPORTED)

    def write(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 2, 2)
        raise OSError(NOT_SUPPORTED)

    def _transfer(self, address_value, bufs, read, stop, quiet=False, mem_write=False):
        """machine_hw_i2c_transfer(새 ESP-IDF 드라이버): 결과는 보낸·받은 바이트 수, 대답이 없으면 데이터 중간이라도 -ENODEV. STOP은 늘 보낸다."""
        if address_value < 0 or address_value > 0x7F:
            if not quiet:
                _explain_bad_address(self._scl, self._sda, address_value)
            return -ENODEV
        address = address_value
        first = bufs[0] if bufs else b""
        total = sum(len(buf) for buf in bufs)
        if read and len(first) == 0:
            return 0  # 읽을 바이트가 0이면 드라이버가 선을 쓰지 않는다
        devices = _select(self._scl, self._sda, address, read)
        if not devices:
            if not quiet:
                _explain_no_device(self._scl, self._sda, address)
            return -ENODEV
        if read:
            data = _read(devices, total)
            offset = 0
            for buf in bufs:
                size = len(buf)
                buf[:size] = data[offset : offset + size]
                offset += size
        elif len(first) > 0:
            data = b"".join(bytes(buf) for buf in bufs)
            if _write(devices, data) < len(data):
                _stop(devices)
                if not quiet:
                    _explain_no_device(self._scl, self._sda, address)
                return -ENODEV
        else:
            total = 0  # 주소만 보내 대답을 확인한다(scan)
        _stop(devices)
        return total

    def _read_mem(self, address_value, prefix, view):
        """WRITE1 전송: 메모리 주소를 쓰고 반복 시작으로 읽는다(i2c_master_transmit_receive)"""
        if address_value < 0 or address_value > 0x7F:
            _explain_bad_address(self._scl, self._sda, address_value)
            return -ENODEV
        devices = _select(self._scl, self._sda, address_value, False)
        if not devices:
            _explain_no_device(self._scl, self._sda, address_value)
            return -ENODEV
        if prefix and _write(devices, prefix) < len(prefix):
            _stop(devices)
            _explain_no_device(self._scl, self._sda, address_value)
            return -ENODEV
        readers = _select(self._scl, self._sda, address_value, True)
        if not readers:
            _stop(devices)
            _explain_no_device(self._scl, self._sda, address_value)
            return -ENODEV
        data = _read(readers, len(view))
        view[: len(view)] = data
        _stop(readers)
        return len(prefix) + len(view)


_hardware_buses = {}


def _reset():
    """실행을 시작할 때(보드를 새로 켬): 하드웨어 I2C 객체를 새로 만든다(양보 없음)."""
    _hardware_buses.clear()


apc_runtime.register_reset_hook(_reset)
apc_board.register_machine_export("I2C", I2C)
apc_board.register_machine_export("SoftI2C", SoftI2C)
