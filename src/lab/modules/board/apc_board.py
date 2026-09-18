"""가상 ESP32 보드의 핵심(PLAN §8.3 P3-01, PD-04, CODE_MAPPING §3.8, src/lab/README.md 7절). 화면 쪽은 같은 폴더의 index.ts.

학생 코드는 이 모듈을 import하지 않는다. 학생은 실물 보드와 똑같이 쓴다:

    from machine import Pin, Timer      # 같은 폴더의 machine.py
    from time import sleep, sleep_ms    # 가상 시계(apc_board_time.py) — ESP32 실습실의 학생 코드에서만 MicroPython판 time이 된다
    from micropython import const       # 같은 폴더의 micropython.py

이 파일이 맡는 것
1. 보드 상태: 핀마다 모드(IN·OUT·OPEN_DRAIN)·풀업/풀다운·출력 값·인터럽트, 가상 시계, Timer, 콜백 대기열(스케줄러 깊이 8).
   핀 번호·"pin can only be input"·Timer 번호 규칙은 MicroPython v1.29.0 ESP32 포트 소스(ports/esp32/machine_pin.c·machine_pin.h·
   machine_timer.c, 2026-09-17 확인)와 같다. 오류 문구도 실물과 같게 두고, 한국어 풀이는 오류 사전(content/help/errors/errors.yaml
   "board" 묶음)과 콘솔 안내가 맡는다.
2. 가상 시계: 가상 시각 = 학생 코드가 계산한 실제 시간 + sleep한 양. sleep이 실제로 기다린 시간(브라우저 타이머의 오차 포함)은 빼고
   sleep한 양만 더하므로 ticks_ms()가 실물처럼 "잔 만큼" 늘어난다. 실행마다 0에서 시작한다(보드를 새로 켠 것처럼).
   짧은 sleep은 apc_runtime.sleep이 모아서(16ms) 기다린다(f060의 sleep(0.001) 2048번).
3. 입력 확인 지점(PLAN §4.4): time.sleep*, 입력 핀의 value() 읽기, ticks_*()에서 화면이 보낸 입력(버튼·센서)을 반영하고
   Timer·핀 인터럽트 콜백을 돌린다. 실물은 콜백이 바이트코드 사이 어디서나 끼어들지만 가상 보드는 이 지점에서만 돈다(P3-00 차이 표 12번).
   sleep 중에는 Timer가 울릴 시각마다 깨어 콜백을 제시간에 돌린다. 계산만 하는 반복문 동안 밀린 주기는 한 번만 부른다.
4. 화면에 핀 상태 보내기: 바뀐 상태를 모아 두었다가 ① 파이썬이 실제로 기다리기 직전(대기 전 훅) ② 마지막으로 보낸 뒤 16ms가 지난 쓰기
   ③ 실행 시작·끝에 'board.state' 이벤트로 보낸다(메시지 형식은 README 7절). 16ms 안에 켰다 끈 것은 한 번에 합쳐진다(사람 눈에 안 보임).
5. 코드가 끝난 뒤: Timer나 핀 인터럽트가 남아 있으면 실물처럼 계속 돈다(apc_runtime.run_idle — [정지]까지).
6. MicroPython 이름: ESP32 실습실의 학생 코드(__main__과 작업 폴더·보드 라이브러리 폴더의 파일)에서만 import 훅이
   time·utime을 가상 시계판으로, errno·uerrno를 실물 번호(newlib)로, bluetooth·ubluetooth를 자리 안내로, ustruct·umachine 같은
   u-이름을 원래 모듈로 바꿔 준다. 표준 라이브러리·Pyodide 안쪽이 import하는 time은 진짜 그대로다(sys.modules를 바꾸지 않는다).
   왜 import 훅인가: time은 CPython의 붙박이 모듈이라 파일로 가릴 수 없고, 진짜 time의 time()·localtime()을 2000년 기준·8칸으로
   바꾸면 표준 라이브러리(logging·asyncio 등)가 깨질 수 있다(P3-00 구현 메모). C 코드가 부르는 PyImport_Import는 __import__의
   돌려준 값이 아니라 sys.modules를 쓰므로 영향을 받지 않는다(CPython 소스 확인).
7. 확장: /apc의 apc_board_*.py(machine의 PWM·ADC·UART 같은 주변장치, P3-03~)와 apc_part_*.py(부품 흉내, parts/<부품>/)를
   첫 실행 직전(install) 한 번 불러온다. 확장은 register_machine_export·register_board_module·register_part로 자기를 등록하고 machine을 import하지 않는다.
8. 배선과 코드 맞춰 보기(P3-02): 화면이 넣은 배선('board.wiring' — 부품·핀·방향)과 코드가 핀을 쓰는 모양이 어긋나면 실행마다 핀 하나에 한 번
   콘솔에 한국어로 알린다 — 값을 보내는 부품(터치 센서·버튼)이 이어진 핀을 출력으로 정함, 보드가 움직이는 부품(LED·진동 모터)이 이어진 핀을
   입력으로 정하거나 출력으로 정하지 않고 값을 씀, 배선에 부품이 없는 핀을 출력으로 정함. 실물처럼 오류를 내지는 않는다(실물도 코드는 돈다).
   배선을 받지 못한 실행(단위 테스트의 일부 단계)에서는 알리지 않는다.
   같은 글을 'board.notice' 이벤트로도 보내 보드 그림 아래 "배선 확인" 칸에 넣는다(2026-09-18 검토 반영 — 콘솔은 결과 칸보다
   688px 아래여서 정작 필요한 학생이 못 봤다).

9. 부품 단계(P3-03~P3-05) 확장 자리(병렬 제작 준비 2026-09-17 — 여러 구역이 이 파일을 고치지 않게 미리 둔 것, README 7.6·7.9):
   - PWM: BOARD.set_pwm(gpio, duty 0~1, freq Hz)·clear_pwm(gpio)·pwm_of(gpio). PWM이 켜진 핀은 모드와 상관없이 전기를 내보내고
     board.state 핀 항목에 mode 'pwm'·duty·freq가 실린다(화면 state.ts outputStrength가 LED 밝기·진동 세기로). Pin(…, 인자)로 핀을 다시 정하면
     실물처럼 PWM 출력이 끊긴다(v1.29.0 machine_pin.c의 init이 늘 esp_rom_gpio_pad_select_gpio — 2026-09-17 확인).
   - 아날로그 입력: 화면이 핀에 {'mv': 0~3300}(AnalogDrive)을 걸면 BOARD.read_millivolts(gpio)가 그 전압을 돌려준다(ADC 흉내가 쓴다).
     디지털로 읽으면 DIGITAL_HIGH_MV(1.65V) 문턱으로 0·1.
   - 부품 장치: register_part로 등록한 factory를 이번 실행의 배선마다 한 번 불러 wired_devices()로 돌려준다(실행마다 새로).
     장치 상태는 set_device_state(배선 id, 부품 id, 상태)로 알리면 16ms마다 핀 상태와 함께 'board.device' 이벤트로 나간다(최신 값만).
     화면 조작(부품 조작 칸·송신 패널)이 보낸 'board.device.input'은 on_device_input(배선 id, 처리 함수)로 받는다(입력 확인 지점에서, 양보 금지).
   - 아직 없는 모듈: neopixel·i2c_lcd·ssd1306·sh1106·servo_library·gorillacell_dcmotors는 파일이 생기기 전까지 한국어 안내가 든
     ModuleNotFoundError로 멈춘다(NOT_YET_MODULES — 파일이 생기면 저절로 그 파일이 import된다). P3-11 통합에서 이 여섯 개는
     모두 파일이 생겼지만(부품 폴더·examples/esp32/lib), 파일이 빠지면 예전 안내로 돌아가는 안전망이라 표는 그대로 둔다.
   - 블록 전용 호환 모드(PD-27, P3-06): JSPI가 없는 브라우저에서 블록 생성기의 실행판이 `await wait_ns_async(ns)`로 기다린다
     (apc_runtime.sleep_async — runPythonAsync의 최상위 await, 기다리는 동안 입력·[정지]를 받는다).

동기 진입점 규칙(PROGRESS 미해결 25번): _reset·_tick·_before_wait·_finish 훅에서는 양보하는 함수(sleep·request·get·poll)를 부르지 않는다
(peek·drain·emit·notice만). 콜백은 학생 코드 자리(입력 확인 지점·대기 훅)에서만 돌린다.

라이선스: 사이트 소프트웨어(MIT, PD-26). MicroPython(MIT) 코드는 옮기지 않고 동작·문구만 맞췄다 — 날짜 계산(timeutils)은 같은 결과가 나오게
파이썬으로 다시 썼다(shared/timeutils/timeutils.c v1.29.0의 알고리즘).
"""

import builtins
import importlib
import math
import os
import struct
import sys
import time as _host_time
import traceback
import types
from collections import deque

import apc_runtime

__all__ = [
    "BOARD",
    "BOARD_LIB_DIR",
    "BOARD_MAX_MV",
    "CHANNEL_DEVICE_INPUT",
    "CHANNEL_INPUT",
    "CHANNEL_INPUTS",
    "CHANNEL_WIRING",
    "DIGITAL_HIGH_MV",
    "EVENT_DEVICE",
    "EVENT_STATE",
    "EVENT_UART_TX",
    "NOT_YET_MODULES",
    "VALID_GPIOS",
    "WORK_DIR",
    "AnalogDrive",
    "board_oserror",
    "check_point",
    "find_pin",
    "float32",
    "install",
    "load_extensions",
    "machine_exports",
    "mktime_2000",
    "mp_float",
    "mp_int",
    "on_device_input",
    "part_factory",
    "register_board_module",
    "register_machine_export",
    "register_part",
    "set_device_state",
    "struct_time_2000",
    "wait_ns",
    "wait_ns_async",
    "wired_devices",
]

# ── 화면 쪽(manifest.ts·state.ts)과 같아야 하는 이름 ──
EVENT_STATE = "board.state"
EVENT_DEVICE = "board.device"
EVENT_NOTICE = "board.notice"
#: 보드가 시리얼 선으로 내보낸 바이트(화면이 탭 통로·브릿지로 넘긴다) — Phase 4 준비 2026-09-18, PLAN §8.4 설계 메모 ②.
#: 보내는 쪽은 UART 부품(parts/uart/)이고 모양은 {"id": 배선 id, "port": UART 번호, "bytes": [..], "baud": 속도}다.
EVENT_UART_TX = "board.uart.tx"
CHANNEL_INPUTS = "board.inputs"
CHANNEL_INPUT = "board.input"
CHANNEL_WIRING = "board.wiring"
CHANNEL_DEVICE_INPUT = "board.device.input"
STATE_VERSION = 1
DEVICE_VERSION = 1
NOTICE_VERSION = 1

#: 보드 전원 전압(밀리볼트) — ESP32 GPIO·ADC의 3.3V
BOARD_MAX_MV = 3300
#: 아날로그 전압이 걸린 핀을 디지털로 읽을 때 1로 보는 문턱(밀리볼트). 실물 ESP32의 입력 문턱은 데이터시트의 VIH(0.75×VDD)와
#: VIL(0.25×VDD) 사이에서 정해지지 않아 들쭉날쭉하고, 가상 보드는 가운데(1.65V)를 문턱으로 단순하게 둔다.
DIGITAL_HIGH_MV = 1650

#: 학생 파일이 있는 작업 폴더(Pyodide 기본 현재 폴더)와, 사이트가 보드 라이브러리(i2c_lcd.py 등, P3-04)를 넣을 폴더
WORK_DIR = "/home/pyodide"
BOARD_LIB_DIR = "/board/lib"

# ── ESP32(ESP32_GENERIC 펌웨어, MicroPython v1.29.0) 사실 — ports/esp32/machine_pin.h의 CONFIG_IDF_TARGET_ESP32 목록 ──
VALID_GPIOS = frozenset(list(range(0, 24)) + [25, 26, 27, 32, 33, 34, 35, 36, 37, 38, 39])
FIRST_INPUT_ONLY_GPIO = 34  # GPIO_FIRST_NON_OUTPUT: 34~39는 입력 전용(출력 모드면 ValueError, 내부 풀업·풀다운 없음)
FLASH_GPIOS = frozenset(range(6, 12))  # 모듈 안 SPI 플래시에 연결(표에는 있지만 실물에서 쓰면 보드가 멈춤)
UART0_GPIOS = frozenset((1, 3))  # USB로 PC와 주고받는 통로(REPL)
UNBONDED_GPIOS = frozenset((20,))  # ESP32-WROOM-32 모듈 핀으로 나와 있지 않음

# Pin 상수(ESP-IDF hal/gpio_types.h 값 — MicroPython이 그대로 내보낸다)
MODE_DEF_INPUT = 1
MODE_DEF_OUTPUT = 2
MODE_DEF_OD = 4
MODE_IN = 1
MODE_OUT = 3
MODE_OPEN_DRAIN = 7
PULL_DOWN = 1
PULL_UP = 2
IRQ_RISING = 1
IRQ_FALLING = 2
WAKE_LOW = 4
WAKE_HIGH = 5
DEFAULT_DRIVE = 2

#: MicroPython ESP32 포트의 스케줄러 깊이(mpconfigport.h MICROPY_SCHEDULER_DEPTH) — 밀린 콜백은 이만큼만 쌓이고 나머지는 버려진다
SCHEDULER_DEPTH = 8
#: ticks_ms()·ticks_us() 주기(32비트 보드, MICROPY_PY_TIME_TICKS_PERIOD = 2**30)
TICKS_PERIOD = 1 << 30
TICKS_MAX = TICKS_PERIOD - 1
TICKS_HALF = TICKS_PERIOD // 2
#: 하드웨어 타이머 수(ESP32 SOC_TIMER_GROUP_TOTAL_TIMERS)와 타이머 해상도(APB 80MHz / 분주 8, 가상 타이머는 1MHz)
HARDWARE_TIMERS = 4
HARDWARE_TIMER_HZ = 10_000_000
VIRTUAL_TIMER_HZ = 1_000_000

#: 화면에 상태를 보내는 최소 간격(초). apc_runtime.YIELD_INTERVAL_MS와 같다.
FLUSH_INTERVAL_S = 0.016
#: 코드가 끝난 뒤 Timer·인터럽트를 이어 돌릴 때 한 번에 기다리는 양(나노초) — 입력 반응 20ms
IDLE_SLICE_NS = 20_000_000
SECONDS_1970_TO_2000 = 946_684_800
_U32 = 0xFFFFFFFF
_U64 = (1 << 64) - 1

_host_monotonic = _host_time.monotonic


# ───────────────────────── MicroPython 값 바꾸기 ─────────────────────────


def mp_int(value):
    """mp_obj_get_int와 같은 규칙: int·bool만 받는다. float·None·str이면 MicroPython과 같은 문구의 TypeError."""
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    raise TypeError(f"can't convert {type(value).__name__} to int")


def mp_float(value):
    """mp_obj_get_float와 같은 규칙: int·bool·float만 받는다."""
    if isinstance(value, (bool, int, float)):
        return float(value)
    raise TypeError(f"can't convert {type(value).__name__} to float")


def float32(value):
    """ESP32 MicroPython의 float(단정밀도)로 반올림한 값(P3-00 차이 표 7번). 담을 수 없는 크기면 무한대."""
    try:
        return struct.unpack("f", struct.pack("f", float(value)))[0]
    except OverflowError:
        return float("inf") if value > 0 else float("-inf")


def board_oserror(number, name=None):
    """실물 보드와 같은 모양의 OSError: `OSError: [Errno 19] ENODEV`, args == (19,)(P3-00 차이 표 10번).
    Pyodide의 errno 모듈은 번호가 다르고 OSError(2, …)는 하위 클래스로 바뀌므로 번호를 숫자로 적어 이 도우미로 만든다."""
    error = OSError()
    error.errno = int(number)
    error.strerror = name if name is not None else ERRNO_NAMES.get(int(number), str(number))
    error.args = (int(number),)
    return error


#: MicroPython errno 모듈의 이름(py/moderrno.c 기본 목록)과 ESP32(newlib) 번호 — espressif/newlib-esp32 sys/errno.h에서 확인(2026-09-17)
ERRNO_NUMBERS = {
    "EPERM": 1,
    "ENOENT": 2,
    "EIO": 5,
    "EBADF": 9,
    "EAGAIN": 11,
    "ENOMEM": 12,
    "EACCES": 13,
    "EEXIST": 17,
    "ENODEV": 19,
    "EISDIR": 21,
    "EINVAL": 22,
    "EOPNOTSUPP": 95,
    "EADDRINUSE": 112,
    "ECONNABORTED": 113,
    "ECONNRESET": 104,
    "ENOBUFS": 105,
    "ENOTCONN": 128,
    "ETIMEDOUT": 116,
    "ECONNREFUSED": 111,
    "EHOSTUNREACH": 118,
    "EALREADY": 120,
    "EINPROGRESS": 119,
}
ERRNO_NAMES = {number: name for name, number in ERRNO_NUMBERS.items()}


# ───────────────────────── 날짜 계산(epoch 2000, 32비트 보드) ─────────────────────────

_DAYS_SINCE_JAN1 = (0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365)
_MONTH_DAYS_FROM_MARCH = (31, 30, 31, 30, 31, 31, 30, 31, 30, 31, 31, 29)


def _is_leap_year(year):
    # 32비트 ESP32는 1970~2099년만 맞게 다루도록 4년마다 윤년으로 센다(MICROPY_TIME_SUPPORT_Y2100_AND_BEYOND 꺼짐).
    return year % 4 == 0


def _days_in_month(year, month):
    days = _DAYS_SINCE_JAN1[month] - _DAYS_SINCE_JAN1[month - 1]
    if month == 2 and _is_leap_year(year):
        days += 1
    return days


def _year_day(year, month, date):
    yday = _DAYS_SINCE_JAN1[month - 1] + date
    if month >= 3 and _is_leap_year(year):
        yday += 1
    return yday


def struct_time_2000(seconds):
    """2000-01-01부터 센 초 → (year, month, mday, hour, minute, second, weekday(월=0), yearday) 8칸(time.localtime·gmtime).
    실물처럼 1970년 기준 32비트 부호 없는 수로 바꿔 센다(1970~2099년 밖은 실물과 같은 엉뚱한 값)."""
    t = (int(seconds) + SECONDS_1970_TO_2000) & _U32
    days = t // 86400
    t %= 86400
    hour = t // 3600
    minute = t // 60 % 60
    second = t % 60
    weekday = (days + 3) % 7  # 1970-01-01은 목요일(3)
    days += 365 + 366 - (31 + 29)  # 1968-02-29(앞선 윤날)부터
    cycles = days // (365 * 4 + 1)
    days -= cycles * (365 * 4 + 1)
    years = days // 365
    if years == 4:
        years -= 1
    days -= years * 365
    year = 1968 + years + 4 * cycles
    month = 0
    while _MONTH_DAYS_FROM_MARCH[month] <= days:
        days -= _MONTH_DAYS_FROM_MARCH[month]
        month += 1
    month += 2
    if month >= 12:
        month -= 12
        year += 1
    mday = days + 1
    month += 1
    return (year, month, mday, hour, minute, second, weekday, _year_day(year, month, mday))


def _c_div(a, b):
    """C의 정수 나눗셈(0 쪽으로 버림)"""
    quotient = abs(a) // abs(b)
    return quotient if (a >= 0) == (b >= 0) else -quotient


def _c_mod(a, b):
    return a - b * _c_div(a, b)


def _seconds_since_1970(year, month, date, hour, minute, second):
    res = ((year - 1970) * 365) & _U32
    res = (res + (((year - 1969) & _U32) // 4)) & _U32
    res = (res + _year_day(year, month, date) - 1) & _U32
    res = (res * 86400) & _U32
    return (res + hour * 3600 + minute * 60 + second) & _U32


def mktime_2000(year, month, mday, hours, minutes, seconds):
    """time.mktime: 8칸(또는 9칸) 날짜 → 2000년부터 센 초. 넘친 값(13월, 0일, 25시…)은 실물처럼 앞뒤로 넘겨 맞춘다(timeutils_mktime)."""
    year &= _U32
    minutes += _c_div(seconds, 60)
    seconds = _c_mod(seconds, 60)
    if seconds < 0:
        seconds += 60
        minutes -= 1
    hours += _c_div(minutes, 60)
    minutes = _c_mod(minutes, 60)
    if minutes < 0:
        minutes += 60
        hours -= 1
    mday += _c_div(hours, 24)
    hours = _c_mod(hours, 24)
    if hours < 0:
        hours += 24
        mday -= 1
    month -= 1
    year = (year + _c_div(month, 12)) & _U32
    month = _c_mod(month, 12)
    if month < 0:
        month += 12
        year = (year - 1) & _U32
    month += 1
    while mday < 1:
        month -= 1
        if month == 0:
            month = 12
            year = (year - 1) & _U32
        mday += _days_in_month(year, month)
    while mday > _days_in_month(year, month):
        mday -= _days_in_month(year, month)
        month += 1
        if month == 13:
            month = 1
            year = (year + 1) & _U32
    return _seconds_since_1970(year, month, mday, hours, minutes, seconds) - SECONDS_1970_TO_2000


def _local_now_ns_since_2000():
    """이 컴퓨터의 지금 시각(현지 시간)을 2000-01-01부터 센 나노초로. 가상 보드의 RTC가 이 값에서 시작한다
    (Thonny가 보드에 연결할 때 PC 시각을 맞춰 주는 것과 같게 — 실물의 전원 직후 값은 부록 B-2 6번에서 확인)."""
    now = _host_time.time()
    try:
        offset = _host_time.localtime(now).tm_gmtoff
    except (AttributeError, OverflowError, ValueError):
        offset = -_host_time.timezone
    return int((now + (offset or 0) - SECONDS_1970_TO_2000) * 1_000_000_000)


# ───────────────────────── 가상 시계 ─────────────────────────


class Clock:
    """가상 시각(나노초). 기준점(anchor) 뒤로 흐른 실제 시간을 더하고, sleep이 끝나면 "잔 만큼"으로 기준점을 다시 잡는다.
    sleep이 기다리는 동안(begin_wait ~ anchor)에는 그 sleep이 끝날 시각을 넘지 않는다 — 기다리는 도중에 도는 틱 훅(입력 반영·타이머)이
    브라우저 타이머의 늦음까지 센 시각을 보면 Timer 주기를 건너뛰거나 시각이 거꾸로 가기 때문이다(2026-09-17 Node 실측에서 발견)."""

    def __init__(self):
        self._anchor_ns = 0
        self._anchor_real = _host_monotonic()
        self._cap_ns = None
        self.rtc_offset_ns = 0

    def reset(self, rtc_offset_ns=None):
        self._anchor_ns = 0
        self._anchor_real = _host_monotonic()
        self._cap_ns = None
        self.rtc_offset_ns = _local_now_ns_since_2000() if rtc_offset_ns is None else int(rtc_offset_ns)

    def now_ns(self):
        elapsed = _host_monotonic() - self._anchor_real
        value = self._anchor_ns + (int(elapsed * 1_000_000_000) if elapsed > 0 else 0)
        if self._cap_ns is not None and value > self._cap_ns:
            return self._cap_ns
        return value

    def begin_wait(self, target_ns):
        """sleep을 시작할 때: 기다리는 동안 가상 시각이 target_ns를 넘지 않게 한다."""
        self._cap_ns = int(target_ns)

    def end_wait(self):
        self._cap_ns = None

    def anchor(self, virtual_ns):
        """sleep이 끝났을 때: 가상 시각을 virtual_ns로 두고 실제 시간 기준점을 지금으로 옮긴다(기다린 실제 시간은 세지 않는다)."""
        self._anchor_ns = max(int(virtual_ns), self._anchor_ns)
        self._anchor_real = _host_monotonic()
        self._cap_ns = None

    def rtc_ns(self):
        """RTC 시각(2000년부터 센 나노초)"""
        return self.rtc_offset_ns + self.now_ns()


# ───────────────────────── 보드 상태 ─────────────────────────


class PinState:
    __slots__ = ("gpio", "mode", "pull", "out", "drive", "hold", "irq_handler", "irq_trigger", "irq_wake", "pwm")

    def __init__(self, gpio):
        self.gpio = gpio
        self.mode = None  # None = 아직 정하지 않음(전원 직후)
        self.pull = None  # None = 정하지 않음, 0 = 끔, 1 = 풀다운, 2 = 풀업, 3 = 둘 다
        self.out = 0
        self.drive = DEFAULT_DRIVE
        self.hold = False
        self.irq_handler = None
        self.irq_trigger = 0
        self.irq_wake = None
        self.pwm = None  # None = PWM 아님, (duty 0~1, freq Hz) = PWM 출력 중(set_pwm)


class AnalogDrive:
    """부품이 핀에 거는 아날로그 전압(밀리볼트 0~3300) — 화면의 {'mv': 1234}(가변저항·아날로그 터치 같은 부품, P3-03).
    ADC 흉내는 BOARD.read_millivolts(gpio)로 읽고, 디지털로 읽으면 DIGITAL_HIGH_MV 문턱으로 0·1이 된다."""

    __slots__ = ("mv",)

    def __init__(self, mv):
        self.mv = min(float(BOARD_MAX_MV), max(0.0, float(mv)))

    def __eq__(self, other):
        return isinstance(other, AnalogDrive) and other.mv == self.mv

    def __hash__(self):
        return hash(("mv", self.mv))

    def __repr__(self):
        return f"AnalogDrive({self.mv:g}mV)"

    def level(self):
        return 1 if self.mv >= DIGITAL_HIGH_MV else 0


class TimerCore:
    """켜진 Timer 하나의 가상 시계 일정"""

    __slots__ = ("owner", "period_ns", "repeat", "callback", "next_due_ns", "started_ns", "active")

    def __init__(self, owner, period_ns, repeat, callback, now_ns):
        self.owner = owner
        self.period_ns = max(1, int(period_ns))
        self.repeat = bool(repeat)
        self.callback = callback
        self.started_ns = now_ns
        self.next_due_ns = now_ns + self.period_ns
        self.active = True


class Board:
    def __init__(self):
        self.clock = Clock()
        self.pins = {}
        self.pin_objects = {}
        self.hw_timers = {}
        self.timers = []
        self.pending = deque()
        self.drives = {}
        self.wiring = []
        self.wiring_known = False
        self.wired = {}
        self.dirty = False
        self.seq = 0
        self.phase = "stopped"
        self.last_flush = -1.0
        self.warned = set()
        self.in_callback = False
        self.callback_errors = set()
        # 부품 장치(P3-03~ 확장 자리): 배선 id → (부품 id, 상태), 화면에 아직 안 보낸 배선 id, 이번 실행의 장치 목록, 화면 조작을 받을 함수
        self.device_states = {}
        self.dirty_devices = set()
        self.devices = None
        self.device_input_handlers = {}

    # ── 실행 시작·끝 ──

    def reset(self):
        """실행을 시작할 때(보드를 새로 켠 것처럼): 핀·타이머·콜백을 비우고 시계를 0으로, 화면이 넣어 둔 배선·입력 상태를 읽는다."""
        for core in self.timers:
            core.active = False
        self.timers = []
        self.hw_timers = {}
        self.pending.clear()
        self.pins = {}
        self.pin_objects = {}
        self.warned = set()
        self.callback_errors = set()
        self.in_callback = False
        self.clock.reset()
        self.phase = "run"
        self.drives = parse_drives(apc_runtime.peek(CHANNEL_INPUTS, None))
        raw_wiring = apc_runtime.peek(CHANNEL_WIRING, None)
        self.wiring = parse_wiring(raw_wiring)
        self.wiring_known = isinstance(raw_wiring, dict)
        self.wired = wired_pins(self.wiring)
        apc_runtime.drain(CHANNEL_INPUT)  # 실행 전에 쌓인 입력 변화는 위 상태에 이미 들어 있다
        apc_runtime.drain(CHANNEL_DEVICE_INPUT)  # 실행 전에 보낸 부품 조작(송신 패널 등)은 실물처럼 사라진다
        self.device_states = {}
        self.dirty_devices = set()
        self.devices = None
        self.device_input_handlers = {}
        # 화면이 실행 사이에 /board/lib에 넣은 라이브러리(i2c_lcd.py 등)를 import가 찾게 파일 목록 캐시를 비운다(양보 없음)
        importlib.invalidate_caches()
        self.seq = 0
        self.dirty = True
        self.flush("reset")

    def finish(self):
        """실행이 끝날 때: 타이머를 멈추고 마지막 상태를 보낸다."""
        for core in self.timers:
            core.active = False
        self.timers = []
        self.pending.clear()
        self.phase = "end"
        self.dirty = True
        self.flush("end")

    # ── 핀 ──

    def state(self, gpio):
        state = self.pins.get(gpio)
        if state is None:
            state = PinState(gpio)
            self.pins[gpio] = state
        return state

    def output_enabled(self, state):
        """핀이 지금 전기를 내보내는지(PWM 출력 중, OUT, 또는 OPEN_DRAIN에서 0을 낼 때)"""
        if state is None:
            return False
        if state.pwm is not None:
            return True
        if state.mode is None or not (state.mode & MODE_DEF_OUTPUT):
            return False
        return not (state.mode & MODE_DEF_OD) or state.out == 0

    def output_level(self, state):
        """전기를 내보내는 핀의 값(0·1): PWM이면 켜진 시간이 있을 때 1, 아니면 출력 값"""
        if state.pwm is not None:
            return 1 if state.pwm[0] > 0 else 0
        return state.out

    def pad_level(self, gpio, *, warn=False):
        """핀의 실제 전압(0·1). 부품이 세게 누르는 값(0·1·아날로그 전압) > 출력 > 부품의 약한 풀업·풀다운 > 내부 풀업·풀다운 > 떠 있음(0)."""
        state = self.pins.get(gpio)
        drive = self.drives.get(gpio)
        if self.output_enabled(state):
            out = self.output_level(state)
            if drive in (0, 1) and drive != out:
                if warn:
                    self.warn_once(
                        ("short", gpio),
                        f"{gpio}번 핀: 출력으로 {out}을 내보내는 동안 연결된 부품이 이 핀을 {drive}로 누르고 있어요(합선). "
                        "실물 보드에서는 핀이 상할 수 있어요. 이 핀을 입력(Pin.IN)으로 바꾸거나 부품을 다른 핀에 이어요.",
                    )
                return drive
            return out
        if drive in (0, 1):
            return drive
        if isinstance(drive, AnalogDrive):
            return drive.level()
        if drive == "pullup":
            return 1
        if drive == "pulldown":
            return 0
        pull = state.pull if state is not None else None
        if pull and gpio < FIRST_INPUT_ONLY_GPIO:
            if pull & PULL_UP:
                return 1
            if pull & PULL_DOWN:
                return 0
        if warn and state is not None and state.mode is not None and (state.mode & MODE_DEF_INPUT):
            outputs = self.wired_labels(gpio, "out")
            if outputs:
                hint = f" 이 핀에는 {outputs}이(가) 이어져 있는데, 이 부품은 값을 보내지 않고 보드가 움직이는 부품이에요."
            elif self.wiring_known and gpio not in self.wired:
                hint = " 이 예제의 배선도에도 이 핀에 이은 부품이 없어요. 코드의 핀 번호가 배선도와 같은지 확인해요."
            else:
                hint = ""
            self.warn_once(
                ("floating", gpio),
                f"{gpio}번 핀을 읽었지만 아무 부품도 연결되지 않았고 풀업·풀다운도 없어요(떠 있는 핀). "
                "실물에서는 0과 1이 들쭉날쭉하게 읽히고, 가상 보드는 0으로 읽어요. 부품을 잇거나 Pin(번호, Pin.IN, Pin.PULL_UP)처럼 풀업을 켜요." + hint,
            )
        return 0

    def read(self, gpio):
        """Pin.value() 읽기(gpio_get_level): 입력이 꺼진 모드(OUT 전용 2번 모드)면 0, 아니면 핀 전압"""
        state = self.pins.get(gpio)
        if state is not None and state.mode is not None and not (state.mode & MODE_DEF_INPUT):
            return 0
        return self.pad_level(gpio, warn=True)

    def reads_outside_world(self, gpio):
        """이 핀을 읽는 것이 바깥 세상(부품·버튼)을 보는 것인지 — 그렇다면 입력 확인 지점이다(출력 중인 핀 읽기는 빠른 길)."""
        return not self.output_enabled(self.pins.get(gpio))

    def read_millivolts(self, gpio):
        """핀 전압(밀리볼트, 0~3300) — ADC 흉내(apc_board_adc.py, P3-03)가 읽는다. 입력 확인 지점(check_point)은 부르는 쪽이 먼저 지난다.
        순서는 pad_level과 같다: 출력(부품이 반대 값으로 세게 누르면 그 값, PWM이면 켜진 시간 비율만큼의 평균 전압) > 부품의 아날로그 전압·
        세게 누르는 값(0·1) > 부품의 약한 풀업·풀다운 > 내부 풀업·풀다운 > 떠 있음(0 — 실물은 들쭉날쭉)."""
        state = self.pins.get(gpio)
        drive = self.drives.get(gpio)
        if self.output_enabled(state):
            if drive in (0, 1) and drive != self.output_level(state):
                return float(drive * BOARD_MAX_MV)
            if state.pwm is not None:
                return float(state.pwm[0] * BOARD_MAX_MV)
            return float(state.out * BOARD_MAX_MV)
        if isinstance(drive, AnalogDrive):
            return drive.mv
        if drive in (0, 1):
            return float(drive * BOARD_MAX_MV)
        if drive == "pullup":
            return float(BOARD_MAX_MV)
        if drive == "pulldown":
            return 0.0
        pull = state.pull if state is not None else None
        if pull and gpio < FIRST_INPUT_ONLY_GPIO:
            if pull & PULL_UP:
                return float(BOARD_MAX_MV)
            if pull & PULL_DOWN:
                return 0.0
        return 0.0

    def set_pwm(self, gpio, duty=None, freq=None):
        """PWM 확장(apc_board_pwm.py, P3-03)이 핀의 PWM 출력을 켜거나 바꾼다. duty = 켜진 시간 비율(0~1), freq = 주파수(Hz, 정수).
        None인 값은 그대로 둔다. 실물 LEDC처럼 핀 모드와 상관없이 전기를 내보낸다. 값 검사·오류 문구(MicroPython 그대로)는 확장이 맡는다.
        바뀌면 board.state 핀 항목에 mode 'pwm'·duty·freq가 실린다(화면 state.ts outputStrength)."""
        state = self.state(gpio)
        before = self.pad_level(gpio)
        current_duty, current_freq = state.pwm if state.pwm is not None else (0.0, 0)
        new_duty = current_duty if duty is None else min(1.0, max(0.0, float(duty)))
        new_freq = current_freq if freq is None else int(freq)
        previous = state.pwm
        state.pwm = (new_duty, new_freq)
        after = self.pad_level(gpio)
        if after != before:
            self.edge(gpio, before, after)
        if previous != state.pwm or after != before:
            self.mark_dirty()

    def clear_pwm(self, gpio):
        """PWM 출력을 끈다(PWM.deinit() 등). 핀은 PWM 전의 모드·값으로 돌아간다."""
        state = self.pins.get(gpio)
        if state is None or state.pwm is None:
            return
        before = self.pad_level(gpio)
        state.pwm = None
        after = self.pad_level(gpio)
        if after != before:
            self.edge(gpio, before, after)
        self.mark_dirty()

    def pwm_of(self, gpio):
        """PWM 출력 중이면 (duty 0~1, freq Hz), 아니면 None"""
        state = self.pins.get(gpio)
        return None if state is None else state.pwm

    def configure(self, gpio, mode=None, pull=-1, value=None, drive=None, hold=None):
        """Pin(id, mode, pull, *, value, drive, hold)·pin.init(…) — machine_pin_obj_init_helper와 같은 순서(값 → 세기 → 모드 → 풀 → 유지).
        실물의 init은 늘 핀을 GPIO 기능으로 되돌리므로(esp_rom_gpio_pad_select_gpio) 켜져 있던 PWM 출력이 끊긴다."""
        state = self.state(gpio)
        before = self.pad_level(gpio)
        previous = (state.mode, state.pull, state.out, state.pwm)
        state.pwm = None
        if value is not None:
            if gpio >= FIRST_INPUT_ONLY_GPIO:
                self.warn_input_only_write(gpio)
            else:
                state.out = 1 if value else 0
        if drive is not None and gpio < FIRST_INPUT_ONLY_GPIO:
            strength = mp_int(drive)
            if 0 <= strength < 4:
                state.drive = strength
        if mode is not None:
            mode_value = mp_int(mode)
            if gpio >= FIRST_INPUT_ONLY_GPIO and (mode_value & MODE_DEF_OUTPUT):
                raise ValueError("pin can only be input")
            state.mode = mode_value
            if mode_value & MODE_DEF_OUTPUT:
                self.warn_special_output(gpio)
            self.check_mode_against_wiring(gpio, mode_value)
        if pull != -1:
            bits = 0 if pull is None else mp_int(pull)
            if bits and gpio >= FIRST_INPUT_ONLY_GPIO:
                self.warn_once(
                    ("no-pull", gpio),
                    f"34~39번 핀에는 보드 안의 풀업·풀다운 저항이 없어요. {gpio}번 핀의 풀업·풀다운은 실물에서도 켜지지 않아요. 필요하면 바깥에 저항을 달아요.",
                )
                bits = 0
            state.pull = bits
        if hold is not None and gpio < FIRST_INPUT_ONLY_GPIO:
            state.hold = bool(hold)
        after = self.pad_level(gpio)
        if after != before:
            self.edge(gpio, before, after)
        if previous != (state.mode, state.pull, state.out, state.pwm) or after != before:
            self.mark_dirty()

    def write(self, gpio, value):
        """pin.on()·off()·value(v)·pin(v) — gpio_set_level. 모드와 상관없이 출력 값을 적는다(출력이 꺼져 있으면 핀 전압은 그대로)."""
        state = self.state(gpio)
        if gpio >= FIRST_INPUT_ONLY_GPIO:
            self.warn_input_only_write(gpio)
            return
        new = 1 if value else 0
        if self.wiring_known and not self.output_enabled(state) and (state.mode is None or not (state.mode & MODE_DEF_OUTPUT)):
            outputs = self.wired_labels(gpio, "out")
            if outputs:
                self.warn_once(
                    ("write-without-output", gpio),
                    f"{gpio}번 핀에 {outputs}이(가) 이어져 있지만 핀을 출력(Pin.OUT)으로 정하지 않아서 값을 써도 신호가 나가지 않아요. "
                    f"Pin({gpio}, Pin.OUT)으로 정해요.",
                )
        if state.out == new:
            return
        before = self.pad_level(gpio)
        state.out = new
        if self.output_enabled(state):
            self.warn_special_output(gpio)
        after = self.pad_level(gpio)
        if after != before:
            self.edge(gpio, before, after)
        self.mark_dirty()

    def set_irq(self, gpio, handler, trigger, wake):
        state = self.state(gpio)
        if handler is None:
            state.irq_handler = None
            state.irq_trigger = 0
        else:
            state.irq_handler = handler
            state.irq_trigger = trigger
        state.irq_wake = wake
        self.mark_dirty()

    def edge(self, gpio, before, after):
        """핀 전압이 바뀌었을 때 그 핀의 인터럽트(IRQ_RISING·IRQ_FALLING)를 콜백 대기열에 넣는다."""
        state = self.pins.get(gpio)
        if state is None or state.irq_handler is None or state.irq_trigger not in (1, 2, 3):
            return
        rising = before == 0 and after == 1
        if (rising and state.irq_trigger & IRQ_RISING) or (not rising and state.irq_trigger & IRQ_FALLING):
            self.schedule(state.irq_handler, self.pin_objects.get(gpio, gpio))

    def service_level_irqs(self):
        """레벨 인터럽트(WAKE_LOW 4·WAKE_HIGH 5를 trigger로 쓴 것): 그 레벨인 동안 확인 지점마다 한 번씩 부른다(실물은 계속 불려 대기열이 넘친다)."""
        for gpio, state in self.pins.items():
            if state.irq_handler is None or state.irq_trigger not in (WAKE_LOW, WAKE_HIGH) or state.irq_wake is not None:
                continue
            level = self.pad_level(gpio)
            if (state.irq_trigger == WAKE_LOW and level == 0) or (state.irq_trigger == WAKE_HIGH and level == 1):
                self.schedule(state.irq_handler, self.pin_objects.get(gpio, gpio))

    # ── 화면에서 온 입력 ──

    def apply_input(self, event):
        """{'pin': 0, 'drive': 0 | 1 | 'pullup' | 'pulldown' | {'mv': 0~3300} | None} 하나를 반영한다(버튼을 누름·뗌, 아날로그 전압을 바꿈)."""
        if not isinstance(event, dict):
            return
        gpio = event.get("pin")
        if isinstance(gpio, bool) or not isinstance(gpio, int) or gpio not in VALID_GPIOS:
            return
        drive = normalize_drive(event.get("drive"))
        before = self.pad_level(gpio)
        if drive is None:
            self.drives.pop(gpio, None)
        else:
            self.drives[gpio] = drive
        after = self.pad_level(gpio)
        if after != before:
            self.edge(gpio, before, after)
            if gpio in self.pins:
                self.mark_dirty()

    def drain_inputs(self):
        for event in apc_runtime.drain(CHANNEL_INPUT):
            self.apply_input(event)

    # ── 부품 장치(P3-03~ 확장 자리) ──

    def wired_devices(self, part_id=None):
        """이번 실행의 부품 장치 [(배선 항목, 장치)]. register_part로 등록한 factory를 배선(board.wiring)의 부품마다 처음 부를 때 한 번 만든다
        (실행마다 새로 — reset이 비운다). part_id를 주면 그 부품만. 배선 항목: {'part','id','label','pins':{role: GPIO},'directions','known'}."""
        if self.devices is None:
            self.devices = []
            load_extensions()
            for entry in self.wiring:
                factory = _parts.get(entry["part"])
                if factory is None:
                    continue
                try:
                    device = factory(entry)
                except Exception as error:  # noqa: BLE001 — 부품 하나를 못 만들어도 보드는 돈다
                    self.warn_once(
                        ("device-error", entry["id"]),
                        f"가상 부품 {entry['label']}을(를) 준비하지 못했어요({type(error).__name__}: {error}). 사이트 문제라면 오류 알리기로 알려 주세요.",
                    )
                    continue
                if device is not None:
                    self.devices.append((entry, device))
        return [(entry, device) for entry, device in self.devices if part_id is None or entry["part"] == part_id]

    def set_device_state(self, device_id, part, state):
        """부품 흉내가 화면에 보일 상태를 알린다(최신 값만 — 16ms 안의 변화는 합쳐져 'board.device' 이벤트 하나로 나간다).
        device_id = 배선 id(entry['id']), part = 부품 id, state = JSON으로 보낼 수 있는 값(사전·목록·글자·숫자·bytes → Uint8Array)."""
        key = str(device_id)
        self.device_states[key] = (str(part), state)
        self.dirty_devices.add(key)
        if _host_monotonic() - self.last_flush >= FLUSH_INTERVAL_S:
            self.flush()

    def on_device_input(self, device_id, handler):
        """화면이 이 배선 id의 부품에 보낸 값('board.device.input' {id, data})을 받을 함수 handler(data)를 등록한다(실행마다 — reset이 비운다).
        입력 확인 지점에서 불리므로 양보하는 함수(sleep·get·poll·request)를 부르지 않는다. 실행 중이 아닐 때 보낸 값은 사라진다(실물 UART와 같음)."""
        self.device_input_handlers[str(device_id)] = handler

    def drain_device_inputs(self):
        for event in apc_runtime.drain(CHANNEL_DEVICE_INPUT):
            if not isinstance(event, dict):
                continue
            handler = self.device_input_handlers.get(str(event.get("id")))
            if handler is None:
                continue
            try:
                handler(event.get("data"))
            except (KeyboardInterrupt, SystemExit):
                raise
            except Exception as error:  # noqa: BLE001 — 부품 흉내의 오류가 학생 코드를 멈추지 않게
                self.warn_once(("device-input-error", str(event.get("id"))), f"가상 부품이 화면 조작을 처리하지 못했어요({type(error).__name__}: {error}).")

    # ── 타이머·콜백 ──

    def add_timer(self, core):
        self.timers.append(core)

    def remove_timer(self, core):
        core.active = False
        if core in self.timers:
            self.timers.remove(core)

    def next_timer_due_ns(self):
        due = None
        for core in self.timers:
            if core.active and (due is None or core.next_due_ns < due):
                due = core.next_due_ns
        return due

    def service_timers(self):
        if not self.timers:
            return
        now = self.clock.now_ns()
        for core in list(self.timers):
            if not core.active or now < core.next_due_ns:
                continue
            if core.callback is not None:
                self.schedule(core.callback, core.owner)
            if core.repeat:
                missed = (now - core.next_due_ns) // core.period_ns
                core.next_due_ns += (missed + 1) * core.period_ns
                core.started_ns = core.next_due_ns - core.period_ns
            else:
                self.remove_timer(core)

    def schedule(self, function, argument):
        """mp_sched_schedule: 대기열이 가득 차면(8개) 넣지 않고 False"""
        if len(self.pending) >= SCHEDULER_DEPTH:
            return False
        self.pending.append((function, argument))
        return True

    def run_pending(self):
        """쌓인 콜백을 차례로 부른다. 콜백 안에서 또 콜백이 끼어들지 않는다(실물 스케줄러와 같음)."""
        if self.in_callback:
            return
        while self.pending:
            function, argument = self.pending.popleft()
            self.in_callback = True
            try:
                function(argument)
            except (KeyboardInterrupt, SystemExit):
                raise
            except Exception as error:  # noqa: BLE001 — 실물처럼 오류를 보여 주고 보드는 계속 돈다
                self.report_callback_error(function, error)
            finally:
                self.in_callback = False

    def report_callback_error(self, function, error):
        frames = [frame for frame in traceback.extract_tb(error.__traceback__) if not frame.filename.startswith("/apc/")]
        text = "Traceback (most recent call last):\n" + "".join(traceback.format_list(frames)) + "".join(traceback.format_exception_only(type(error), error))
        sys.stderr.write(text)
        key = getattr(function, "__qualname__", repr(function))
        if key not in self.callback_errors:
            self.callback_errors.add(key)
            apc_runtime.notice(
                "Timer나 핀 인터럽트의 콜백 함수에서 오류가 났어요. 실물 보드처럼 오류를 보여 주고 프로그램은 계속 돌아요. 위 트레이스백의 줄을 고쳐요.",
                "warn",
            )

    def has_irq_handlers(self):
        return any(state.irq_handler is not None and state.irq_trigger for state in self.pins.values())

    def has_background_work(self):
        """코드가 끝나도 계속 돌 것이 있는지: 켜진 타이머, 등록된 핀 인터럽트, 쌓인 콜백"""
        if self.pending:
            return True
        if any(core.active for core in self.timers):
            return True
        return self.has_irq_handlers()

    def service(self, run_callbacks):
        """입력 확인 지점에서 하는 일: 화면 입력 반영(핀·부품 조작) → 레벨 인터럽트 → 울릴 타이머 → (학생 코드 자리면) 콜백 실행"""
        self.drain_inputs()
        self.drain_device_inputs()
        self.service_level_irqs()
        self.service_timers()
        if run_callbacks:
            self.run_pending()

    # ── 화면에 상태 보내기 ──

    def mark_dirty(self):
        self.dirty = True
        if _host_monotonic() - self.last_flush >= FLUSH_INTERVAL_S:
            self.flush()

    def flush(self, reason="change"):
        """모아 둔 변화를 화면에 보낸다: 핀이 바뀌었으면 'board.state'(핀 전체 목록) 하나, 그다음 바뀐 부품마다 'board.device' 하나(최신 상태)."""
        if not self.dirty and not self.dirty_devices:
            return
        self.last_flush = _host_monotonic()
        if self.dirty:
            self.dirty = False
            self.seq += 1
            apc_runtime.emit(EVENT_STATE, self.snapshot(reason))
        if self.dirty_devices:
            keys = sorted(self.dirty_devices)
            self.dirty_devices = set()
            for key in keys:
                part, state = self.device_states[key]
                apc_runtime.emit(EVENT_DEVICE, {"v": DEVICE_VERSION, "id": key, "part": part, "state": state})

    def pin_entry(self, gpio):
        state = self.pins[gpio]
        entry = {
            "id": gpio,
            "mode": mode_name(state.mode),
            "pull": pull_name(state.pull),
            "out": state.out,
            "level": self.pad_level(gpio),
            "driven": self.output_enabled(state),
            "irq": state.irq_handler is not None and bool(state.irq_trigger),
        }
        if state.pwm is not None:
            entry["mode"] = "pwm"
            entry["duty"] = round(state.pwm[0], 6)
            entry["freq"] = state.pwm[1]
        return entry

    def snapshot(self, reason):
        return {
            "v": STATE_VERSION,
            "reason": reason,
            "phase": self.phase,
            "seq": self.seq,
            "t_us": self.clock.now_ns() // 1000,
            "pins": [self.pin_entry(gpio) for gpio in sorted(self.pins)],
            "timers": sum(1 for core in self.timers if core.active),
        }

    # ── 안내 ──

    def wired_labels(self, gpio, direction=None):
        """그 핀에 이어진 (가상 보드가 아는) 부품 이름들을 "터치 센서, BOOT 버튼"처럼. direction을 주면 그 방향('in'·'out') 핀만"""
        names = [entry["label"] for entry in self.wired.get(gpio, ()) if entry["known"] and (direction is None or entry["direction"] == direction)]
        return ", ".join(dict.fromkeys(names))

    def check_mode_against_wiring(self, gpio, mode_value):
        """Pin(…, mode)가 배선과 맞는지(P3-02): 입력 부품 핀을 출력으로, 출력 부품 핀을 입력으로, 부품 없는 핀을 출력으로 정하면 한 번 알린다."""
        if not self.wiring_known:
            return
        if mode_value & MODE_DEF_OUTPUT:
            inputs = self.wired_labels(gpio, "in")
            if inputs:
                self.warn_once(
                    ("wired-input-as-output", gpio),
                    f"{gpio}번 핀에는 {inputs}(값을 보내는 부품)이(가) 이어져 있는데 출력(Pin.OUT)으로 정했어요. "
                    f"부품이 보내는 값을 읽으려면 Pin({gpio}, Pin.IN)으로 정해요. 실물에서는 핀과 부품이 서로 다른 값을 내면 부딪혀(합선) 상할 수 있어요.",
                )
            elif gpio not in self.wired:
                self.warn_once(
                    ("unwired-output", gpio),
                    f"{gpio}번 핀을 출력으로 정했는데, 이 예제의 배선도에는 {gpio}번 핀에 이은 부품이 없어요. "
                    "핀 값은 핀 상태 표에 보이지만 화면에서 움직이는 부품은 없어요. 코드의 핀 번호가 배선도와 같은지 확인해요.",
                )
        elif mode_value & MODE_DEF_INPUT:
            outputs = self.wired_labels(gpio, "out")
            if outputs and not self.wired_labels(gpio, "in"):
                self.warn_once(
                    ("wired-output-as-input", gpio),
                    f"{gpio}번 핀에는 {outputs}(보드가 움직이는 부품)이(가) 이어져 있는데 입력(Pin.IN)으로 정했어요. "
                    f"부품을 움직이려면 Pin({gpio}, Pin.OUT)으로 정해요.",
                )

    def warn_once(self, key, text):
        if key in self.warned:
            return
        self.warned.add(key)
        apc_runtime.notice(text, "warn")
        # 같은 글을 보드 그림 아래 "배선 확인" 칸에도 보낸다(2026-09-18 검토 반영 — 콘솔은 결과 칸보다 한참 아래라
        # 코드와 배선이 어긋났다는 가장 쓸모 있는 안내를 학생이 못 봤다). 화면 쪽은 index.ts가 받아 [data-board-problems]에 넣는다.
        code = key[0] if isinstance(key, tuple) and key else str(key)
        gpio = key[1] if isinstance(key, tuple) and len(key) > 1 and isinstance(key[1], int) else None
        payload = {"v": NOTICE_VERSION, "code": str(code), "level": "warning", "text": str(text)}
        if gpio is not None:
            payload["gpio"] = gpio
        apc_runtime.emit(EVENT_NOTICE, payload)

    def warn_input_only_write(self, gpio):
        self.warn_once(
            ("input-only-write", gpio),
            f"{gpio}번 핀은 입력 전용(34~39번)이라 값을 내보낼 수 없어요. 실물 보드도 오류 기록만 남기고 무시해요. 출력은 0~33번 가운데 쓸 수 있는 핀을 골라요.",
        )

    def warn_special_output(self, gpio):
        if gpio in FLASH_GPIOS:
            self.warn_once(
                ("flash", gpio),
                f"{gpio}번 핀(6~11번)은 보드 안의 플래시 메모리에 연결돼 있어요. 실물 보드에서 이 핀으로 신호를 내보내면 보드가 멈추거나 다시 켜질 수 있어요. 다른 핀을 골라요.",
            )
        elif gpio in UART0_GPIOS:
            self.warn_once(
                ("uart0", gpio),
                f"{gpio}번 핀(1번·3번)은 USB로 컴퓨터와 주고받는 통로(UART0)예요. 실물에서 출력으로 쓰면 코드 올리기와 출력 보기가 끊길 수 있어요.",
            )
        elif gpio in UNBONDED_GPIOS:
            self.warn_once(
                ("unbonded", gpio),
                f"{gpio}번 핀은 이 보드(ESP32-WROOM-32 모듈)의 핀으로 나와 있지 않아 부품을 이을 수 없어요.",
            )


def mode_name(mode):
    if mode is None:
        return None
    return {MODE_IN: "in", MODE_OUT: "out", MODE_OPEN_DRAIN: "open_drain", 0: "off", MODE_DEF_OUTPUT: "out_only"}.get(mode, "other")


def pull_name(pull):
    if not pull:
        return None
    return {PULL_UP: "up", PULL_DOWN: "down"}.get(pull, "both")


def normalize_drive(value):
    """화면이 보낸 누르는 값 → 0·1·'pullup'·'pulldown'·AnalogDrive·None"""
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, AnalogDrive):
        return value
    if isinstance(value, dict):
        mv = value.get("mv")
        if isinstance(mv, (int, float)) and not isinstance(mv, bool) and math.isfinite(mv):
            return AnalogDrive(mv)
        return None
    if value in (0, 1, "pullup", "pulldown"):
        return value
    return None


def parse_drives(value):
    """화면의 입력 상태 {'pins': {'0': 'pullup', '17': 0}} → {0: 'pullup', 17: 0}"""
    drives = {}
    pins = value.get("pins") if isinstance(value, dict) else None
    if not isinstance(pins, dict):
        return drives
    for key, drive in pins.items():
        try:
            gpio = int(key)
        except (TypeError, ValueError):
            continue
        normalized = normalize_drive(drive)
        if gpio in VALID_GPIOS and normalized is not None:
            drives[gpio] = normalized
    return drives


def parse_wiring(value):
    """화면의 배선 {'parts': [{'part': 'touch-digital', 'id': 'touch', 'label': '터치 센서', 'pins': {'sig': 17},
    'directions': {'sig': 'in'}, 'known': True}, …]} → 목록(모르는 모양은 버림, 빠진 label·directions·known은 기본값)"""
    parts = value.get("parts") if isinstance(value, dict) else None
    if not isinstance(parts, list):
        return []
    result = []
    for item in parts:
        if isinstance(item, dict) and isinstance(item.get("part"), str) and isinstance(item.get("id"), str):
            pins = item.get("pins") if isinstance(item.get("pins"), dict) else {}
            directions = item.get("directions") if isinstance(item.get("directions"), dict) else {}
            label = item.get("label") if isinstance(item.get("label"), str) and item.get("label") else item["part"]
            result.append(
                {
                    "part": item["part"],
                    "id": item["id"],
                    "label": label,
                    "pins": {str(role): gpio for role, gpio in pins.items() if isinstance(gpio, int) and not isinstance(gpio, bool)},
                    "directions": {str(role): direction for role, direction in directions.items() if direction in ("in", "out")},
                    "known": item.get("known") is not False,
                }
            )
    return result


def wired_pins(wiring):
    """배선 목록 → {GPIO: [{'label', 'direction'('in'|'out'|None), 'known'}]} — 코드와 배선을 맞춰 볼 때 쓴다"""
    wired = {}
    for entry in wiring:
        for role, gpio in entry["pins"].items():
            wired.setdefault(gpio, []).append({"label": entry["label"], "direction": entry["directions"].get(role), "known": entry["known"]})
    return wired


BOARD = Board()


def find_pin(value):
    """machine_pin_find: Pin 객체면 그 핀, 정수면 ESP32에 있는 번호인지 확인한다(bool·float·글자는 안 됨). 없으면 ValueError('invalid pin')."""
    gpio = getattr(value, "_apc_gpio", None)
    if isinstance(gpio, int):
        return gpio
    if type(value) is int and value in VALID_GPIOS:
        return value
    raise ValueError("invalid pin")


# ───────────────────────── 기다리기·입력 확인 지점 ─────────────────────────


def _sleep_virtual(ns):
    clock = BOARD.clock
    before = clock.now_ns()
    clock.begin_wait(before + ns)
    try:
        apc_runtime.sleep(ns / 1_000_000_000)
    except BaseException:
        clock.end_wait()
        raise
    clock.anchor(before + ns)


#: 핀 인터럽트가 걸려 있을 때 긴 sleep을 나눠 자는 조각(나노초) — 버튼을 누르면 20ms 안에 콜백이 돈다(실물은 곧바로)
IRQ_SLICE_NS = 20_000_000


def wait_ns(total_ns):
    """가상 시계로 total_ns만큼 잔다(time.sleep*). 자는 동안 Timer가 울릴 시각마다 깨어 콜백을 돌리고,
    핀 인터럽트가 걸려 있으면 20ms 조각으로 나눠 자며 입력을 반영한다. [정지]면 KeyboardInterrupt."""
    board = BOARD
    # (P3-11) 16ms 안의 변화는 합친다 — 실제로 기다리기 직전에는 대기 전 훅(_before_wait)이 보내고, 기다리지 않는 짧은 sleep은
    # 틱 훅(_tick)이 16ms마다 보낸다. 늘 보내면 `duty(i); sleep(0.001)` 반복문(f060)이 board.state를 초당 수백 개 보낸다.
    if _host_monotonic() - board.last_flush >= FLUSH_INTERVAL_S:
        board.flush()
    apc_runtime.check_stop()
    total = max(0, int(total_ns))
    end = board.clock.now_ns() + total
    board.service(run_callbacks=True)
    if total == 0:
        apc_runtime.maybe_yield()
        board.service(run_callbacks=True)
        return
    while True:
        now = board.clock.now_ns()
        remaining = end - now
        if remaining <= 0:
            break
        chunk = remaining
        due = board.next_timer_due_ns()
        if due is not None:
            chunk = min(chunk, max(0, due - now))
        if board.has_irq_handlers():
            chunk = min(chunk, IRQ_SLICE_NS)
        _sleep_virtual(chunk)
        board.service(run_callbacks=True)


def check_point():
    """입력 확인 지점(입력 핀 읽기·ticks_*): 16ms마다 한 번 양보해 [정지]·화면 입력을 받고, 밀린 콜백을 돌린다."""
    apc_runtime.maybe_yield()
    BOARD.service(run_callbacks=True)


async def _sleep_virtual_async(ns):
    clock = BOARD.clock
    before = clock.now_ns()
    clock.begin_wait(before + ns)
    try:
        await apc_runtime.sleep_async(ns / 1_000_000_000)
    except BaseException:
        clock.end_wait()
        raise
    clock.anchor(before + ns)


async def wait_ns_async(total_ns):
    """(병렬 제작 준비 2026-09-17) 블록 전용 호환 모드(PLAN PD-27 — P3-06)용 wait_ns: JSPI가 없어도 runPythonAsync의 최상위 await로
    가상 시계만큼 잔다. wait_ns와 같은 일(Timer·핀 인터럽트·화면 입력·[정지])을 하고 기다리기는 apc_runtime.sleep_async로 한다.
    사이트의 블록 생성기가 만든 실행판(화면에 보이는 코드는 time.sleep)이 `await apc_board.wait_ns_async(ns)`로 부른다 — 학생 코드용 이름이 아니다."""
    board = BOARD
    if _host_monotonic() - board.last_flush >= FLUSH_INTERVAL_S:  # wait_ns와 같은 16ms 규칙
        board.flush()
    apc_runtime.check_stop()
    total = max(0, int(total_ns))
    end = board.clock.now_ns() + total
    board.service(run_callbacks=True)
    if total == 0:
        await apc_runtime.sleep_async(0)
        board.service(run_callbacks=True)
        return
    while True:
        now = board.clock.now_ns()
        remaining = end - now
        if remaining <= 0:
            break
        chunk = remaining
        due = board.next_timer_due_ns()
        if due is not None:
            chunk = min(chunk, max(0, due - now))
        if board.has_irq_handlers():
            chunk = min(chunk, IRQ_SLICE_NS)
        await _sleep_virtual_async(chunk)
        board.service(run_callbacks=True)


# ───────────────────────── 훅(apc_runtime) ─────────────────────────


def _reset():
    BOARD.reset()


def _tick():
    BOARD.service(run_callbacks=False)
    if (BOARD.dirty or BOARD.dirty_devices) and _host_monotonic() - BOARD.last_flush >= FLUSH_INTERVAL_S:
        BOARD.flush()


def _before_wait():
    BOARD.flush()


def _finish():
    BOARD.finish()


_IDLE_NOTICE = (
    "코드는 끝났지만 Timer나 핀 인터럽트(irq)가 계속 돌고 있어요. 실물 보드도 그래요. 멈추려면 [정지]를 누르세요."
)


def _idle():
    if not BOARD.has_background_work():
        return False
    if BOARD.phase != "idle":
        BOARD.phase = "idle"
        BOARD.dirty = True
        BOARD.flush("idle")
        apc_runtime.notice(_IDLE_NOTICE)
    wait_ns(IDLE_SLICE_NS)
    return True


# ───────────────────────── import 훅과 등록표 ─────────────────────────

_board_modules = {}
_machine_exports = {}
_parts = {}
_extensions_loaded = False

#: u-이름 → 원래 모듈(MicroPython v1.29.0: 확장 가능한 붙박이 모듈과 usys는 u-이름으로도 import된다 — py/objmodule.c 확인)
U_ALIASES = {
    "umachine": "machine",
    "ustruct": "struct",
    "usys": "sys",
    "ujson": "json",
    "urandom": "random",
    "uos": "os",
    "uarray": "array",
    "ucollections": "collections",
    "ubinascii": "binascii",
    "uio": "io",
    "ure": "re",
    "uhashlib": "hashlib",
    "uheapq": "heapq",
    "uselect": "select",
    "usocket": "socket",
    "uplatform": "platform",
}


def register_board_module(name, module):
    """ESP32 실습실의 학생 코드가 `import <name>`하면 받을 모듈(모듈 객체 또는 모듈을 돌려주는 함수)을 등록한다. 뒤에 등록한 것이 이긴다."""
    _board_modules[str(name)] = module


def register_machine_export(name, value):
    """machine 모듈에 이름을 더한다(확장 파일 apc_board_*.py가 PWM·ADC 같은 주변장치를 더할 때). machine을 import하지 않고 이것만 부른다."""
    _machine_exports[str(name)] = value


def machine_exports():
    load_extensions()
    return dict(_machine_exports)


def register_part(part_id, factory):
    """부품 흉내(parts/<부품>/apc_part_*.py)가 자기를 등록한다. factory(배선 항목 dict) → 장치 객체. 배선에 그 부품이 있으면 보드가 부른다(P3-04~)."""
    _parts[str(part_id)] = factory


def part_factory(part_id):
    load_extensions()
    return _parts.get(str(part_id))


def wired_devices(part_id=None):
    """이번 실행의 부품 장치 [(배선 항목, 장치)] — Board.wired_devices(I2C 버스·UART가 자기 핀에 이어진 장치를 찾을 때)"""
    return BOARD.wired_devices(part_id)


def set_device_state(device_id, part, state):
    """부품 상태를 화면에 알린다 — Board.set_device_state('board.device' {v, id, part, state}, 16ms 병합)"""
    BOARD.set_device_state(device_id, part, state)


def on_device_input(device_id, handler):
    """화면 조작('board.device.input' {id, data})을 받을 함수를 등록한다 — Board.on_device_input(실행마다, 양보 금지)"""
    BOARD.on_device_input(device_id, handler)


def load_extensions():
    """/apc의 apc_board_*.py·apc_part_*.py를 한 번씩 불러온다(자기를 등록하게). 동기 진입점에서 불러도 양보하지 않는다."""
    global _extensions_loaded
    if _extensions_loaded:
        return
    _extensions_loaded = True
    here = os.path.dirname(os.path.abspath(__file__))
    try:
        names = sorted(os.listdir(here))
    except OSError:
        names = []
    for file_name in names:
        if file_name.endswith(".py") and (file_name.startswith("apc_board_") or file_name.startswith("apc_part_")):
            try:
                importlib.import_module(file_name[:-3])
            except Exception as error:  # noqa: BLE001 — 확장 하나의 오류가 보드 전체를 막지 않게
                apc_runtime.notice(f"가상 보드 확장 {file_name}을(를) 불러오지 못했어요: {type(error).__name__}: {error}", "warn")


#: 실물 펌웨어에 들어 있거나(firmware) 사이트가 부품 라이브러리로 주는데(library) 가상 보드에 아직 없는 모듈(병렬 제작 준비 2026-09-17).
#: 학생 코드가 import했는데 파일이 없으면 한국어 안내가 든 ModuleNotFoundError를 낸다. 부품 구역이 같은 이름의 파일(부품 폴더의 .py 또는
#: examples/esp32/lib/의 라이브러리)을 더하면 그 파일이 그대로 import되므로 이 표를 고치지 않아도 된다. 안내 문구에는 오류 사전
#: board-not-emulated가 찾는 "가상 보드에 아직 없어요"가 들어 있다.
NOT_YET_MODULES = {
    "neopixel": "firmware",
    "i2c_lcd": "library",
    "ssd1306": "library",
    "sh1106": "library",
    "servo_library": "library",
    "gorillacell_dcmotors": "library",
    # 통신 실습실(Phase 4) 자리 — 파일이 생기면 저절로 그 파일이 import된다.
    "umqtt": "firmware",  # 펌웨어에 굳혀 둔 umqtt.simple — P4-06이 흉내를 더한다
    "esp32_ble_util": "library",  # micropython 저장소 examples/bluetooth의 BLESimplePeripheral — P4-03이 더한다
}


def not_yet_module_message(name):
    if NOT_YET_MODULES.get(name) == "firmware":
        return (
            f"No module named '{name}' (가상 보드에 아직 없어요 — 실물 ESP32 펌웨어에는 들어 있는 모듈이에요. "
            "가상 보드에 부품을 더하는 다음 단계에서 들어와요.)"
        )
    return (
        f"No module named '{name}' (가상 보드에 아직 없어요 — 사이트가 주는 부품 라이브러리 {name}.py는 가상 보드에 부품을 더하는 "
        "다음 단계에서 들어와요. 실물 보드에서는 이 파일을 보드에 올려야 import할 수 있어요.)"
    )


def _bluetooth_placeholder(name):
    def factory():
        raise ModuleNotFoundError(
            f"No module named '{name}' (가상 보드의 블루투스는 아직 흉내 내지 않아요 — 통신 실습실을 만드는 단계에서 더해져요. "
            "실물 ESP32에는 있는 모듈이에요.)",
            name=name,
        )

    return factory


def _network_placeholder(name):
    """와이파이(network.WLAN) 자리 — Phase 4 준비 2026-09-18. 확장 ext/network/apc_board_network.py가 같은 이름을 다시 등록하면 그것이 이긴다."""

    def factory():
        raise ModuleNotFoundError(
            f"No module named '{name}' (가상 보드의 와이파이는 아직 흉내 내지 않아요 — 통신 실습실을 만드는 단계에서 더해져요. "
            "실물 ESP32에는 있는 모듈이에요.)",
            name=name,
        )

    return factory


def _make_errno_module():
    module = types.ModuleType("errno")
    for name, number in ERRNO_NUMBERS.items():
        setattr(module, name, number)
    module.errorcode = dict(ERRNO_NAMES)
    return module


def is_board_code(namespace):
    """import하는 쪽이 학생 코드인지: 실행 중인 main.py(__main__), 작업 폴더·보드 라이브러리 폴더의 파일"""
    if not isinstance(namespace, dict):
        return False
    if namespace.get("__name__") == "__main__":
        return True
    file_name = namespace.get("__file__")
    if not isinstance(file_name, str) or file_name == "":
        return False
    if not file_name.startswith("/"):
        return True
    return file_name.startswith(WORK_DIR + "/") or file_name.startswith(BOARD_LIB_DIR + "/")


_host_import = None


def _board_import(name, globals=None, locals=None, fromlist=(), level=0):  # noqa: A002 — builtins.__import__와 같은 인자 이름
    if level == 0 and is_board_code(globals):
        if name in _board_modules:
            target = _board_modules[name]
            return target() if callable(target) and not isinstance(target, types.ModuleType) else target
        alias = U_ALIASES.get(name)
        if alias is not None:
            return _host_import(alias, globals, locals, fromlist, 0)
        # 점이 든 이름(from umqtt.simple import …)도 맨 앞 이름으로 본다 — 학생이 보는 안내가 같아야 한다(Phase 4 준비 2026-09-18).
        head = name.partition(".")[0]
        if head in NOT_YET_MODULES:
            try:
                return _host_import(name, globals, locals, fromlist, level)
            except ModuleNotFoundError as error:
                if error.name not in (name, head):
                    raise
                raise ModuleNotFoundError(not_yet_module_message(head), name=error.name or head) from None
    return _host_import(name, globals, locals, fromlist, level)


_installed = False


def install():
    """ESP32 실습실 워커에서 실행 직전마다 불린다(manifest shims {time: apc_board} — 동기 진입점, 멱등).
    import 훅·실행 훅을 한 번만 걸고, 보드 라이브러리 폴더를 만들고, 확장 파일을 불러온다."""
    global _installed, _host_import
    if _installed:
        return
    _installed = True
    register_board_module("errno", _make_errno_module())
    register_board_module("uerrno", _board_modules["errno"])
    register_board_module("bluetooth", _bluetooth_placeholder("bluetooth"))
    register_board_module("ubluetooth", _bluetooth_placeholder("ubluetooth"))
    register_board_module("network", _network_placeholder("network"))
    load_extensions()  # 확장(ext/ble·ext/network)이 위 자리 안내를 진짜 흉내로 바꿀 수 있고, apc_board_time.py가 time·utime을 등록한다
    _host_import = builtins.__import__
    builtins.__import__ = _board_import
    try:
        os.makedirs(BOARD_LIB_DIR, exist_ok=True)
    except OSError:
        pass
    if BOARD_LIB_DIR not in sys.path:
        sys.path.append(BOARD_LIB_DIR)
    apc_runtime.register_reset_hook(_reset)
    apc_runtime.register_tick_hook(_tick)
    apc_runtime.register_wait_hook(_before_wait)
    apc_runtime.register_finish_hook(_finish)
    apc_runtime.register_idle_hook(_idle)
