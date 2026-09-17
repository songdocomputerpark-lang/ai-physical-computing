"""가상 ESP32 보드의 MicroPython판 time 모듈(PLAN §8.3 P3-01, P3-00 차이 표 1~3번). 보드 핵심은 같은 폴더의 apc_board.py.

ESP32 실습실의 학생 코드가 `import time`·`import utime`·`from time import sleep_ms`를 하면 apc_board의 import 훅이 이 모듈이 만든
`time` 모듈 객체를 돌려준다(진짜 CPython time은 표준 라이브러리·Pyodide가 그대로 쓴다). 들어 있는 이름은 MicroPython v1.29.0
ESP32 포트와 같다(extmod/modtime.c·ports/esp32/modtime.c 확인, 2026-09-17):

    sleep(초)            소수도 된다. 1000을 곱해 밀리초로 버림(단정밀도 float) — sleep(0.0005)는 0ms
    sleep_ms(ms)         정수만(소수면 TypeError). 음수면 기다리지 않는다
    sleep_us(us)         정수만. 0 이하면 기다리지 않는다
    ticks_ms() ticks_us() ticks_cpu()   가상 시각을 2**30으로 돈 값(약 12.4일마다 0으로). ticks_cpu는 실물은 CPU 사이클 수, 가상 보드는 마이크로초
    ticks_diff(끝, 시작)  넘친 값도 맞게 뺀 차이(−2**29 ~ 2**29−1)
    ticks_add(ticks, 차이)  차이가 ±2**29 이상이면 OverflowError('ticks interval overflow')
    time()               2000-01-01부터 센 정수 초(실물 ESP32의 기준점). 가상 보드의 시계는 실행을 시작할 때 이 컴퓨터의 현지 시각에서 출발한다
    time_ns()            같은 기준의 나노초
    localtime([초]) gmtime([초])   8칸 (년, 월, 일, 시, 분, 초, 요일(월=0), 연중 일(1~366)). ESP32는 둘이 같은 함수다
    mktime(8칸 또는 9칸)   localtime의 반대. 13월·0일처럼 넘친 값은 앞뒤로 넘겨 맞춘다

sleep·sleep_ms·sleep_us·ticks_*는 입력 확인 지점이다: [정지]가 여기서 멈추고, 화면의 버튼·센서 값과 Timer·핀 인터럽트 콜백이 여기서 반영된다.
라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import types

import apc_board

_TIME_NAMES = (
    "gmtime",
    "localtime",
    "mktime",
    "sleep",
    "sleep_ms",
    "sleep_us",
    "ticks_add",
    "ticks_cpu",
    "ticks_diff",
    "ticks_ms",
    "ticks_us",
    "time",
    "time_ns",
)


def sleep(seconds):
    """time.sleep: MicroPython처럼 (1000 × 초)를 단정밀도로 계산해 밀리초로 버린다."""
    value = apc_board.mp_float(seconds)
    if value < 0:
        # 실물은 음수를 부호 없는 수로 바꿔 아주 오래 잔다(멈춘 것처럼 보임). 가상 보드는 바로 알려 준다.
        raise ValueError("sleep length must be non-negative")
    milliseconds = int(apc_board.float32(1000.0 * apc_board.float32(value)))
    apc_board.wait_ns(milliseconds * 1_000_000)


def sleep_ms(milliseconds):
    value = apc_board.mp_int(milliseconds)
    if value >= 0:
        apc_board.wait_ns(value * 1_000_000)


def sleep_us(microseconds):
    value = apc_board.mp_int(microseconds)
    if value > 0:
        apc_board.wait_ns(value * 1_000)


def _ticks_value(value, what):
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"can't convert {type(value).__name__} to int")
    return value


def ticks_ms():
    apc_board.check_point()
    return (apc_board.BOARD.clock.now_ns() // 1_000_000) & apc_board.TICKS_MAX


def ticks_us():
    apc_board.check_point()
    return (apc_board.BOARD.clock.now_ns() // 1_000) & apc_board.TICKS_MAX


def ticks_cpu():
    apc_board.check_point()
    return (apc_board.BOARD.clock.now_ns() // 1_000) & apc_board.TICKS_MAX


def ticks_diff(ticks1, ticks2):
    end = _ticks_value(ticks1, "ticks1")
    start = _ticks_value(ticks2, "ticks2")
    return ((end - start + apc_board.TICKS_HALF) & apc_board.TICKS_MAX) - apc_board.TICKS_HALF


def ticks_add(ticks, delta):
    base = _ticks_value(ticks, "ticks")
    step = apc_board.mp_int(delta)
    if step <= -apc_board.TICKS_HALF or step >= apc_board.TICKS_HALF:
        raise OverflowError("ticks interval overflow")
    return (base + step) & apc_board.TICKS_MAX


def time():
    return apc_board.BOARD.clock.rtc_ns() // 1_000_000_000


def time_ns():
    return apc_board.BOARD.clock.rtc_ns()


def gmtime(secs=None):
    if secs is None:
        seconds = time()
    elif isinstance(secs, bool):
        seconds = int(secs)
    elif isinstance(secs, int):
        seconds = secs
    else:
        raise TypeError(f"can't convert {type(secs).__name__} to int")
    return apc_board.struct_time_2000(seconds)


def mktime(date_tuple):
    try:
        items = list(date_tuple)
    except TypeError:
        raise TypeError(f"object '{type(date_tuple).__name__}' isn't a tuple or list") from None
    if len(items) < 8 or len(items) > 9:
        raise TypeError("mktime needs a tuple of length 8 or 9")
    year, month, mday, hour, minute, second = (apc_board.mp_int(value) for value in items[:6])
    return apc_board.mktime_2000(year, month, mday, hour, minute, second)


def _make_module():
    module = types.ModuleType("time")
    namespace = globals()
    for name in _TIME_NAMES:
        if name == "localtime":
            continue
        setattr(module, name, namespace[name])
    # ESP32 포트는 gmtime과 localtime이 같은 함수 객체다(extmod/modtime.c의 표)
    module.localtime = module.gmtime
    module.__all__ = list(_TIME_NAMES)
    return module


TIME_MODULE = _make_module()
apc_board.register_board_module("time", TIME_MODULE)
apc_board.register_board_module("utime", TIME_MODULE)
