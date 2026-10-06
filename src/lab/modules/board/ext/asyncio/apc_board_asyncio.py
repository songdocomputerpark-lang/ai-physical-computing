"""가상 ESP32 보드의 asyncio·uasyncio — ESP32 실습실의 학생 코드에만 주는 얇은 모듈(2026-10-02 최종 전수 점검 3바퀴 LB3-01, 판 1.1.5).

왜: 전에는 학생 코드의 `import asyncio`·`import uasyncio`(판 1.1.3 통합의 옛 이름 별칭)가 컴퓨터 파이썬(CPython)의 asyncio를 그대로 받아
MicroPython식 코드가 어긋났다.
  - `await asyncio.sleep_ms(100)` → AttributeError("오타일 때가 많아요" 카드). 실물 MicroPython의 asyncio에는 sleep_ms가 있다.
  - `while True: … await asyncio.sleep(0.3)` → [정지]가 1초 안에 먹지 않아 "계산만 하는 반복문" 안내와 함께 파이썬을 다시 시작했다.
    GitHub Pages에는 SharedArrayBuffer가 없어 [정지]는 기다리는 곳의 확인으로만 된다(src/lab/runtime/worker.ts 머리말) — CPython의
    asyncio.sleep은 그 확인을 하지 않는다.
  - Pyodide의 이벤트 루프(WebLoop)는 asyncio.run(main)이 끝나도 main이 만든 작업을 멈추지 않고, loop.run_forever()는 아무것도 하지 않고
    곧바로 돌아온다. 그래서 실행은 끝났는데 작업만 뒤에서 돌아 LED를 바꾸고, [정지]도 누를 수 없었다(실물은 루프가 멈추면 작업도 더 돌지 않는다).

무엇: 이름은 MicroPython v1.29.0 extmod/asyncio(core.py — https://raw.githubusercontent.com/micropython/micropython/v1.29.0/extmod/asyncio/core.py,
2026-10-02 확인)에 맞추고, 일은 진짜 asyncio(WebLoop)에 맡긴다. 모듈 하나를 `asyncio`·`uasyncio` 두 이름으로 보드 모듈 등록표에 올린다
(apc_board.register_board_module — import 훅이 학생 코드(is_board_code)에만 준다. 등록표가 U_ALIASES의 uasyncio 줄보다 먼저다).
sys.modules['asyncio']는 바꾸지 않는다 — Pyodide webloop·표준 라이브러리·영상처리 실습실·4단원 컴퓨터 칸은 진짜 asyncio 그대로다.
이 파일은 /apc에 있어 학생 코드가 아니므로 아래의 `import asyncio`는 진짜 asyncio를 받는다.
  - sleep(초)·sleep_ms(ms): apc_board.wait_ns_async로 잔다 — 보드의 time.sleep과 같은 일(가상 시계가 잔 만큼 늘어남·Timer·핀 인터럽트·화면 입력·
    [정지]면 곧바로 KeyboardInterrupt, 블록 전용 호환 모드가 쓰는 그 함수). 실물처럼 sleep(t)는 sleep_ms(int(t * 1000))(ESP32의 float는
    단정밀도 — 보드 time.sleep과 같은 계산)이고, sleep_ms(t)는 max(0, t)를 정수로만 받는다(소수면 TypeError, 2**29 ms 이상이면 OverflowError
    "ticks interval overflow" — ticks_add 규칙). 값 검사는 부를 때 한다(실물처럼 await 전에).
  - run(main)·loop.run_until_complete(aw): 진짜 WebLoop.run_until_complete(JSPI로 끝날 때까지 기다림)로 돌리되, 옆에서 지켜보는 작업이
    IDLE_SLICE_NS마다 가상 보드를 돌보며(입력·Timer·핀 인터럽트) [정지]를 받는다 — 학생 코드가 Event만 기다려도 [정지]가 먹는다.
    끝나면 남은 작업을 멈춘다(cancel — 실물은 루프가 멈춰 그 작업이 더 돌지 않는다). 남은 작업은 학생 실행 동안 진짜 루프에 생긴 작업
    전부다(create_task뿐 아니라 gather·wait·shield가 만든 자식까지 — _student_tasks. 판 1.2.1: 판 1.1.5~1.2.0은 이 모듈의 create_task로 만든
    작업만 기억해서 gather의 한 자식이 예외로 끝나면 다른 자식이 실행이 끝난 뒤에도 돌았다 — 판 1.2.0 적대적 검토 C1·C7).
  - get_event_loop()·new_event_loop(): MicroPython의 Loop처럼 쓰는 작은 객체 — run_forever()는 stop()이나 [정지]까지 기다린다.
  - create_task·ensure_future: 진짜 작업을 만든다(MicroPython 이름 규칙 — create_task(coro)). 남은 작업은 run이 끝날 때·실행이 끝날 때
    (apc_runtime 마무리 훅)·다음 실행을 시작할 때(초기화 훅) 멈춘다.
  - wait_for_ms(aw, ms)·ThreadSafeFlag: MicroPython에만 있는 이름 — 진짜 wait_for(초)·Event로 흉내(ThreadSafeFlag.wait()는 끝나면 저절로
    지운다. 가상 보드의 핀 인터럽트·Timer 콜백은 입력 확인 지점에서 돌므로 set()을 그대로 불러도 된다).
  - 그 밖의 이름(gather·Event·Lock·wait_for·current_task·CancelledError·TimeoutError …)은 진짜 asyncio의 것(모듈 __getattr__ — PEP 562).
  - [정지]로 끝난 작업(KeyboardInterrupt)은 콘솔에 "Unhandled exception in event loop" 트레이스백을 남기지 않는다 — 아무도 기다리지 않는 작업이
    예외로 끝나면 WebLoop가 그 트레이스백을 stderr에 찍는데, [정지]는 실행 결과가 이미 "정지"로 알린다(실물 MicroPython도 Ctrl-C는 작업 예외
    처리기를 거치지 않고 루프 밖으로 나간다). 다른 예외는 그대로 찍는다(실물의 "Task exception wasn't retrieved"처럼). 학생이
    loop.set_exception_handler로 정한 처리기는 [정지]가 아닌 예외에 그대로 불린다.
제한 모드(JSPI 없는 브라우저): sleep·sleep_ms는 최상위 await로 된다(wait_ns_async). run·run_until_complete·run_forever는 끝날 때까지
기다릴 수 없어 apc_runtime.LIMITED_MESSAGE를 RuntimeError로 알린다(오류 사전 limited-mode).
가상 시계: 작업 여럿이 함께 자도 거꾸로 가지 않는다(apc_board.Clock.begin_wait·_sleep_virtual_async 머리말 — 판 1.1.5).
라이선스: 사이트 소프트웨어(MIT, PD-26) — MicroPython 코드를 옮기지 않고 이름·규칙만 맞췄다.
"""

import asyncio as _real
import types
import weakref

import apc_board
import apc_runtime

__all__ = ["ASYNCIO_MODULE"]

try:
    # Pyodide가 학생 코드(맨 바깥)를 돌리는 코루틴(runPythonAsync → eval_code_async) — 그 작업은 학생 작업으로 세지 않는다
    from _pyodide._base import eval_code_async as _eval_code_async

    _TOP_LEVEL_CODE = _eval_code_async.__code__
except Exception:  # noqa: BLE001 — Pyodide 안쪽 이름이 바뀌면 맨 바깥 작업을 이름으로 가리지 못할 뿐(멈추는 쪽은 current_task로 지킨다)
    _TOP_LEVEL_CODE = None

#: 사이트가 스스로 만든 작업(run 옆의 지켜보는 작업, run_until_complete가 감싼 작업) — 학생 작업이 아니다(머리말 run)
_site_tasks = weakref.WeakSet()
#: 이 모듈을 불러올 때(첫 학생 실행 전) 이미 있던 작업 — 사이트·Pyodide 안쪽의 것이라 건드리지 않는다
_baseline = weakref.WeakSet()

#: MicroPython에만 있거나 이 모듈이 바꾼 이름 — from asyncio import * 에도 들어가게 진짜 asyncio의 __all__에 더한다
_OWN_NAMES = (
    "Loop",
    "ThreadSafeFlag",
    "create_task",
    "ensure_future",
    "get_event_loop",
    "new_event_loop",
    "run",
    "sleep",
    "sleep_ms",
    "wait_for_ms",
)


def _web_loop():
    """지금 도는 진짜 이벤트 루프(Pyodide WebLoop). 학생 코드의 맨 바깥(runPythonAsync)도 그 루프 안에서 돈다."""
    try:
        return _real.get_running_loop()
    except RuntimeError:
        return _real.get_event_loop()


# ───────────────────────── 기다리기(sleep·sleep_ms) ─────────────────────────


def _ms_of_seconds(t):
    """MicroPython sleep(t)의 int(t * 1000) — ESP32의 float는 단정밀도라 보드 time.sleep과 같은 계산(apc_board.float32)."""
    if isinstance(t, (bool, int)):
        return int(t) * 1000
    if isinstance(t, float):
        return int(apc_board.float32(1000.0 * apc_board.float32(t)))
    raise TypeError(f"unsupported types for __mul__: '{type(t).__name__}', 'int'")


def _checked_ms(t):
    """MicroPython sleep_ms(t)의 ticks_add(ticks(), max(0, t)) — 정수만 받고(mp_obj_get_int), 2**29 이상이면 OverflowError."""
    value = apc_board.mp_int(max(0, t))
    if value >= apc_board.TICKS_HALF:
        raise OverflowError("ticks interval overflow")
    return value


async def _sleep_ms_awaitable(ms, result=None):
    await apc_board.wait_ns_async(ms * 1_000_000)
    return result


def sleep_ms(t):
    """asyncio.sleep_ms(ms) — 가상 시계로 ms만큼 잔다. await와 함께 써요(예: await asyncio.sleep_ms(100))."""
    return _sleep_ms_awaitable(_checked_ms(t))


def sleep(t, result=None):
    """asyncio.sleep(초) — 실물처럼 sleep_ms(int(초 × 1000)). result는 컴퓨터 파이썬 asyncio처럼 다 잔 뒤 돌려준다."""
    return _sleep_ms_awaitable(_checked_ms(_ms_of_seconds(t)), result)


# ───────────────────────── 작업과 실행(run·run_until_complete) ─────────────────────────


def create_task(coro):
    """asyncio.create_task(coro) — 진짜 작업을 만든다(남은 작업은 run·실행이 끝날 때 멈춘다 — 머리말)."""
    return _web_loop().create_task(coro)


def ensure_future(aw):
    """asyncio.ensure_future(aw) — 진짜와 같다."""
    return _real.ensure_future(aw, loop=_web_loop())


def _current_task():
    """지금 도는 작업(없으면 None — 동기 훅처럼 작업 밖에서 불릴 때)."""
    try:
        return _real.current_task(_web_loop())
    except RuntimeError:
        return None


def _is_top_level(task):
    """Pyodide가 학생 코드의 맨 바깥을 돌리는 작업(eval_code_async — 실행·대기 훅)인지."""
    if task is None or _TOP_LEVEL_CODE is None:
        return False
    return getattr(task.get_coro(), "cr_code", None) is _TOP_LEVEL_CODE


def _student_tasks():
    """진짜 루프에 있는 아직 끝나지 않은 작업 가운데 학생 코드의 것 — 사이트 작업·맨 바깥 작업·처음부터 있던 작업을 뺀다(머리말 run)."""
    try:
        tasks = _real.all_tasks(_web_loop())
    except Exception:  # noqa: BLE001 — 작업 목록을 못 읽으면 멈출 것이 없다고 본다
        return []
    return [task for task in tasks if task not in _site_tasks and task not in _baseline and not _is_top_level(task)]


def _cancel_tasks():
    """남은 학생 작업을 멈춘다(cancel — 다음에 깨어날 때 CancelledError). 지금 도는 작업(부른 쪽)은 빼고, 양보하지 않는다(동기 훅에서도 부른다)."""
    current = _current_task()
    for task in _student_tasks():
        if task is not current and not task.done():
            task.cancel()


async def _watched(aw):
    """aw를 끝까지 돌리며, 옆의 작업이 가상 보드를 돌보고 [정지]를 받는다(머리말 run)."""
    wrapper = _real.current_task()
    if wrapper is not None:
        _site_tasks.add(wrapper)  # run_until_complete가 이 코루틴을 감싼 작업
    main = _real.ensure_future(aw)
    stopped = []

    async def watch():
        try:
            while not main.done():
                await apc_board.wait_ns_async(apc_board.IDLE_SLICE_NS)
        except KeyboardInterrupt:
            stopped.append(True)
            main.cancel()

    watcher = _real.ensure_future(watch())
    _site_tasks.add(watcher)
    try:
        return await main
    except _real.CancelledError:
        if stopped:
            raise KeyboardInterrupt(apc_runtime.STOP_MESSAGE) from None
        raise
    finally:
        if not watcher.done():
            watcher.cancel()


def _drive(aw):
    """run·run_until_complete·run_forever의 몸통: 끝날 때까지 기다리고(JSPI), 끝나면 남은 작업을 멈춘다."""
    if not apc_runtime.can_wait():
        if _real.iscoroutine(aw):
            aw.close()  # "was never awaited" 경고가 콘솔에 남지 않게
        raise RuntimeError(apc_runtime.LIMITED_MESSAGE)
    try:
        return _web_loop().run_until_complete(_watched(aw))
    finally:
        _cancel_tasks()


def run(main):
    """asyncio.run(main) — MicroPython: run_until_complete(create_task(main)). main이 끝날 때까지 기다린다."""
    return _drive(main)


class ThreadSafeFlag:
    """MicroPython asyncio.ThreadSafeFlag — 핀 인터럽트(irq)·Timer 콜백이 set()으로 기다리는 작업을 깨운다. wait()가 끝나면 저절로 지운다."""

    def __init__(self):
        self._event = _real.Event()

    def set(self):
        self._event.set()

    def clear(self):
        self._event.clear()

    async def wait(self):
        await self._event.wait()
        self._event.clear()


def wait_for_ms(aw, timeout):
    """MicroPython asyncio.wait_for_ms(aw, ms) — 진짜 wait_for(aw, ms / 1000)."""
    return _real.wait_for(aw, None if timeout is None else timeout / 1000)


#: 학생이 loop.set_exception_handler로 정한 처리기(없으면 None — WebLoop 기본 처리기). 실행마다 비운다.
_user_exception_handler = None


def _exception_handler(loop, context):
    """WebLoop의 예외 처리기(머리말): [정지]로 끝난 작업(KeyboardInterrupt)은 조용히, 나머지는 학생 처리기나 WebLoop 기본 처리기로."""
    if isinstance(context.get("exception"), KeyboardInterrupt):
        return
    if _user_exception_handler is not None:
        _user_exception_handler(_LOOP, context)
    else:
        loop.default_exception_handler(context)


def _install_exception_handler():
    global _user_exception_handler
    _user_exception_handler = None
    try:
        _real.get_event_loop().set_exception_handler(_exception_handler)
    except Exception as error:  # noqa: BLE001 — 처리기를 못 걸어도 asyncio는 돈다(트레이스백만 더 보인다)
        apc_runtime.notice(f"가상 보드 asyncio 준비 중 오류: {type(error).__name__}: {error}", "warn")


class Loop:
    """get_event_loop()가 돌려주는 루프 — MicroPython의 Loop처럼 쓴다(create_task·run_until_complete·run_forever·stop·close·예외 처리기).
    WebLoop의 run_forever는 아무것도 하지 않고 곧바로 돌아오므로, 이 run_forever는 stop()이나 [정지]까지 기다린다."""

    def __init__(self):
        self._stop_event = None

    def create_task(self, coro):
        return create_task(coro)

    def run_until_complete(self, aw):
        return _drive(aw)

    def run_forever(self):
        self._stop_event = _real.Event()
        try:
            return _drive(self._stop_event.wait())
        finally:
            self._stop_event = None

    def stop(self):
        if self._stop_event is not None:
            self._stop_event.set()

    def close(self):
        pass

    def set_exception_handler(self, handler):
        """MicroPython Loop.set_exception_handler(handler) — handler(loop, context)는 [정지]가 아닌 작업 예외에 불린다."""
        global _user_exception_handler
        _user_exception_handler = handler

    def get_exception_handler(self):
        return _user_exception_handler

    def default_exception_handler(self, loop, context):
        _web_loop().default_exception_handler(context)

    def call_exception_handler(self, context):
        _exception_handler(_web_loop(), context)

    def __getattr__(self, name):
        # set_exception_handler·call_soon·time 같은 나머지는 진짜 루프의 것
        return getattr(_web_loop(), name)


_LOOP = Loop()


def get_event_loop(runq_len=0, waitq_len=0):
    """asyncio.get_event_loop() — MicroPython처럼 늘 같은 루프(인자는 실물과 같게 받기만 한다)."""
    return _LOOP


def new_event_loop():
    """asyncio.new_event_loop() — 실물처럼 그동안의 작업을 버리고(멈추고) 루프를 돌려준다."""
    _cancel_tasks()
    return _LOOP


# ───────────────────────── 모듈 만들기·등록 ─────────────────────────


def _make_module():
    module = types.ModuleType("asyncio", "가상 ESP32 보드의 asyncio(MicroPython 이름 + 진짜 asyncio) — src/lab/modules/board/ext/asyncio/")
    namespace = globals()
    for name in _OWN_NAMES:
        setattr(module, name, namespace[name])

    def module_getattr(name):
        # PEP 562: 이 모듈에 없는 이름은 진짜 asyncio의 것. 특수 이름(__path__ 등)은 넘기지 않는다 — 이 모듈을 패키지로 보이지 않게.
        if not (name.startswith("__") and name.endswith("__")):
            try:
                return getattr(_real, name)
            except AttributeError:
                pass
        raise AttributeError(f"module 'asyncio' has no attribute '{name}'")

    def module_dir():
        return sorted(set(dir(_real)) | set(_OWN_NAMES))

    module.__getattr__ = module_getattr
    module.__dir__ = module_dir
    module.__all__ = sorted(set(getattr(_real, "__all__", ())) | set(_OWN_NAMES))
    return module


def _on_run_end():
    # 실행이 끝날 때(마무리 훅) 남은 작업을 멈춘다 — 동기 진입점이라 양보하지 않는다(cancel만).
    _cancel_tasks()


def _on_run_start():
    # 다음 실행을 시작할 때(초기화 훅): 남은 작업을 멈추고, 예외 처리기를 다시 건다(학생이 진짜 루프에 직접 건 처리기는 그 실행까지만).
    _cancel_tasks()
    _install_exception_handler()


ASYNCIO_MODULE = _make_module()
try:
    # 이 모듈을 불러올 때 이미 있던 작업(사이트·Pyodide 안쪽)은 학생 작업으로 세지 않는다
    _baseline.update(_real.all_tasks(_web_loop()))
except Exception:  # noqa: BLE001 — 목록을 못 읽으면 비워 둔다
    pass
apc_board.register_board_module("asyncio", ASYNCIO_MODULE)
apc_board.register_board_module("uasyncio", ASYNCIO_MODULE)
_install_exception_handler()
apc_runtime.register_reset_hook(_on_run_start)
apc_runtime.register_finish_hook(_on_run_end)
