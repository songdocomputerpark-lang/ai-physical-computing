"""가상 ESP32 보드의 micropython 모듈(PLAN §8.3 P3-01, P3-00 차이 표 4번). ESP32 실습실 워커에만 들어간다.

학생 코드(자료 f009·f013·f087 계열):

    from micropython import const
    _IRQ_CENTRAL_CONNECT = const(1)

실물과 같게 맞춘 것(MicroPython v1.29.0 py/modmicropython.c, 2026-09-17 확인)
- const(x)는 x를 그대로 돌려준다(실물은 컴파일할 때 상수로 바꾼다). `_`로 시작하는 const 이름이 모듈 밖에서 안 보이는 실물 규칙은 흉내 내지 않는다.
- schedule(함수, 인자): 콜백 대기열(깊이 8)에 넣고, 가득 차면 RuntimeError('schedule queue full'). 입력 확인 지점에서 불린다.
- micropython은 u-이름이 없는 모듈이라 `import umicropython`은 실물처럼 안 된다.
- opt_level·alloc_emergency_exception_buf·heap_lock·heap_unlock·heap_locked·kbd_intr는 부를 수 있지만 가상 보드에서는 하는 일이 없다.
- mem_info·qstr_info·stack_use는 보드 메모리를 흉내 내지 않아 안내만 한다(실물의 작은 메모리와 MemoryError는 교사용 안내 — P3-00 차이 표 13번).
- @micropython.native·@micropython.viper 장식자는 함수를 그대로 돌려준다.
라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import apc_board
import apc_runtime

_opt_level = 0


def const(value):
    return value


def opt_level(level=None):
    global _opt_level
    if level is None:
        return _opt_level
    _opt_level = apc_board.mp_int(level)
    return None


def alloc_emergency_exception_buf(size):
    apc_board.mp_int(size)


def heap_lock():
    return 0


def heap_unlock():
    return 0


def heap_locked():
    return 0


def kbd_intr(chr):  # noqa: A002 — MicroPython 인자 이름
    apc_board.mp_int(chr)


def schedule(function, arg):
    if not apc_board.BOARD.schedule(function, arg):
        raise RuntimeError("schedule queue full")


def _memory_notice():
    apc_runtime.notice("가상 보드는 보드 메모리를 흉내 내지 않아요. 실물 ESP32의 메모리 정보는 실물 보드에서 확인해요.")


def mem_info(*args):
    _memory_notice()


def qstr_info(*args):
    _memory_notice()


def stack_use():
    _memory_notice()
    return 0


def native(function):
    return function


def viper(function):
    return function


#: 실물 micropython 모듈에 있는 이름(v1.29.0 py/modmicropython.c) — dir()이 사이트 안쪽 이름(apc_board 등)을 보여 주지 않게 한다
__all__ = [
    "const",
    "opt_level",
    "alloc_emergency_exception_buf",
    "heap_lock",
    "heap_unlock",
    "heap_locked",
    "kbd_intr",
    "schedule",
    "mem_info",
    "qstr_info",
    "stack_use",
    "native",
    "viper",
]


def __dir__():
    return sorted(__all__)
