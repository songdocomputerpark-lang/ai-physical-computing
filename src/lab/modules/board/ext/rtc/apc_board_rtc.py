"""가상 ESP32 보드의 machine.RTC(내장 실시간 시계, PLAN §6.2 "내장 RTC | 2-1-2 기본 2 (f051)", §8.3 P3-04, CODE_MAPPING §3.8.1).

학생 코드는 실물 ESP32와 똑같이 쓴다:

    from machine import RTC
    rtc = RTC()
    rtc.datetime((2025, 6, 21, 6, 11, 0, 0, 0))   # (년, 월, 일, 요일, 시, 분, 초, 마이크로초) — 요일은 읽기만 하고 맞출 때는 쓰지 않는다
    t = rtc.datetime()                            # (2025, 6, 21, 5, 11, 0, 3, 120000) — 요일은 월요일이 0(2025-06-21은 토요일 5)

실물과 같게 맞춘 것(MicroPython v1.29.0 ports/esp32/machine_rtc.c, shared/timeutils/timeutils.c·timeutils.h, py/obj.c·argcheck.c, 2026-09-18 확인)
- RTC()는 인자를 받지 않고(RTC(0)은 TypeError "function takes 0 positional arguments but 1 were given") 늘 같은 객체를 돌려준다.
- datetime(): (year, month, day, weekday(월=0), hours, minutes, seconds, subseconds(마이크로초)) 8칸 튜플.
- datetime(날짜): 튜플·리스트 8칸만(아니면 TypeError "object 'int' isn't a tuple or list", 칸 수가 다르면 ValueError "requested length 8 but
  object has length 7"). 요일 칸은 쓰지 않고 년·월·일·시·분·초로 2000-01-01부터 센 초를 계산해 시계를 맞춘다(넘친 값을 앞뒤로 넘기지 않는 계산이라
  25시·61분은 그만큼 더한 시각이 된다). 마이크로초 칸은 그대로 더한다.
- init(날짜): 칸 순서가 datetime과 달리 (year, month, day, hours, minutes, seconds, subseconds, tzinfo)다(소스의 hour_index 3). 마이크로초는 여전히 8번째 칸.
- memory([bytes]): RTC 사용자 메모리(최대 2048바이트, 넘으면 ValueError "buffer too long"). 읽으면 마지막에 쓴 만큼의 bytes.
- 시계는 time.time()·time.localtime()과 같은 시계다(settimeofday) — RTC를 맞추면 time.time()도 따라 바뀐다.

가상 보드의 시계(src/lab/README.md 7.2): 실행을 시작할 때 이 컴퓨터의 현지 시각에서 출발해 가상 시계(계산한 시간 + sleep한 양)만큼 흐른다.
실행마다 보드를 새로 켜므로 맞춘 시각과 RTC 메모리는 다음 [실행]에서 처음으로 돌아간다(실물은 전원을 끄기 전까지 남는다 — 부록 B-2 6번).
달이 1~12가 아니면 콘솔에 알린다 — 13월은 실물처럼 다음 해 1월로 계산하고, 0월·14월 이상은 실물이 표 밖의 값을 읽어 엉뚱한 날짜가 되는데 가상 보드는 그 달까지의 날 수를 0으로 계산한다.
라이선스: 사이트 소프트웨어(MIT, PD-26) — MicroPython 코드를 옮기지 않고 같은 결과가 나오게 파이썬으로 다시 썼다.
"""

import apc_board
import apc_runtime

__all__ = ["RTC", "RTC_USER_MEMORY_MAX", "seconds_since_2000"]

#: MICROPY_HW_RTC_USER_MEM_MAX(ports/esp32/mpconfigport.h)
RTC_USER_MEMORY_MAX = 2048

_U32 = 0xFFFFFFFF
_DAYS_SINCE_JAN1 = (0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365)
_NANOS = 1_000_000_000


def _warn_month(month, in_table):
    if in_table:
        # 13월: 소스의 표(days_since_jan1)에 13번째 칸(365일)이 있어 다음 해 1월로 계산된다 — 실물과 같은 결과
        detail = "13월은 다음 해 1월로 계산돼요."
    else:
        detail = "실물 보드는 표 밖의 값을 읽어 엉뚱한 날짜가 되니 1~12로 적어요."
    apc_board.BOARD.warn_once(("rtc-month", month), f"RTC 날짜의 달(월)을 {month}(으)로 적었어요. 달은 1~12예요. {detail}")


def _year_day(year, month, date):
    """timeutils_year_day(32비트 보드 — 4년마다 윤년). 표 밖의 달은 0으로 센다(실물은 표 밖 메모리를 읽음)."""
    index = (month - 1) & _U32
    if index < len(_DAYS_SINCE_JAN1):
        base = _DAYS_SINCE_JAN1[index]
        if index == 12:
            _warn_month(month, True)
    else:
        _warn_month(month, False)
        base = 0
    yday = base + date
    if (month & _U32) >= 3 and (year & _U32) % 4 == 0:
        yday += 1
    return yday


def seconds_since_2000(year, month, date, hour, minute, second):
    """timeutils_seconds_since_epoch(epoch 2000): 32비트 부호 없는 계산(timeutils_seconds_since_1970) 뒤 1970→2000을 뺀다."""
    res = ((year - 1970) * 365) & _U32
    res = (res + (((year - 1969) & _U32) // 4)) & _U32
    res = (res + _year_day(year, month, date) - 1) & _U32
    res = (res * 86400) & _U32
    res = (res + hour * 3600 + minute * 60 + second) & _U32
    return res - apc_board.SECONDS_1970_TO_2000


def _date_items(value):
    """mp_obj_get_array_fixed_n(값, 8)"""
    if not isinstance(value, (tuple, list)):
        raise TypeError(f"object '{type(value).__name__}' isn't a tuple or list")
    if len(value) != 8:
        raise ValueError(f"requested length 8 but object has length {len(value)}")
    return list(value)


def _set_clock(value, hour_index):
    items = _date_items(value)
    year = apc_board.mp_int(items[0])
    month = apc_board.mp_int(items[1])
    day = apc_board.mp_int(items[2])
    hour = apc_board.mp_int(items[hour_index])
    minute = apc_board.mp_int(items[hour_index + 1])
    second = apc_board.mp_int(items[hour_index + 2])
    micro = apc_board.mp_int(items[7])
    seconds = seconds_since_2000(year, month, day, hour, minute, second)
    target_ns = (seconds * 1_000_000 + micro) * 1000
    clock = apc_board.BOARD.clock
    clock.rtc_offset_ns = target_ns - clock.now_ns()


def _read_clock():
    ns = apc_board.BOARD.clock.rtc_ns()
    seconds = ns // _NANOS
    micro = (ns - seconds * _NANOS) // 1000
    year, month, mday, hour, minute, second, weekday, _yday = apc_board.struct_time_2000(seconds)
    return (year, month, mday, weekday, hour, minute, second, micro)


def _check_num(count, kwargs, n_min, n_max):
    if kwargs:
        raise TypeError("function doesn't take keyword arguments")
    if n_min == n_max:
        if count != n_min:
            raise TypeError(f"function takes {n_min} positional arguments but {count} were given")
    elif count < n_min:
        raise TypeError(f"function missing {n_min - count} required positional arguments")
    elif count > n_max:
        raise TypeError(f"function expected at most {n_max} arguments, got {count}")


def _read_buffer(value):
    if isinstance(value, str):
        return value.encode("utf-8")
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    try:
        return memoryview(value).cast("B").tobytes()
    except TypeError:
        raise TypeError("object with buffer protocol required") from None


class RTC:
    """machine.RTC() — ESP32 내장 실시간 시계(늘 같은 객체)"""

    def __new__(cls, *args, **kwargs):
        _check_num(len(args), kwargs, 0, 0)
        global _instance
        if _instance is None:
            _instance = object.__new__(cls)
        return _instance

    def __init__(self, *args, **kwargs):
        # 인자 검사는 __new__가 했다.
        pass

    def datetime(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 1, 2)
        if not args:
            return _read_clock()
        _set_clock(args[0], 4)
        return None

    def init(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 2, 2)
        _set_clock(args[0], 3)
        return None

    def memory(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 1, 2)
        global _memory
        if not args:
            return bytes(_memory)
        data = _read_buffer(args[0])
        if len(data) > RTC_USER_MEMORY_MAX:
            raise ValueError("buffer too long")
        _memory = data
        return None


_instance = None
_memory = b""


def _reset():
    """실행을 시작할 때(보드를 새로 켬): RTC 사용자 메모리를 비운다(양보 없음). 시계는 apc_board의 Clock.reset이 현지 시각으로 맞춘다."""
    global _memory
    _memory = b""


apc_runtime.register_reset_hook(_reset)
apc_board.register_machine_export("RTC", RTC)
