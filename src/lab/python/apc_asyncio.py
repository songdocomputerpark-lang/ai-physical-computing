"""컴퓨터 쪽 실습실(영상처리·4단원 컴퓨터 칸·개발용 시험 페이지)의 asyncio — 학생 코드에만 주는 얇은 모듈(판 1.2.0, PROGRESS 미해결 223).

왜: 학생 코드의 `asyncio.run(main())` + `while True: … await asyncio.sleep(0.3)` 반복은 [정지]가 1초 안에 먹지 않아 "계산만 하는 반복문"
안내와 함께 파이썬을 다시 시작했다(실사이트 1.1.5 — [정지] 뒤 1,063ms에 killed). GitHub Pages에는 SharedArrayBuffer가 없어 [정지]는
기다리는 곳의 확인으로만 되는데(src/lab/runtime/worker.ts 머리말), 진짜 asyncio.sleep은 그 확인을 하지 않는다. 또 Pyodide의 이벤트
루프(WebLoop)는 늘 돌고 있어서 asyncio.run이 끝나도 main이 만든 작업이 뒤에서 계속 돌았고(진짜 파이썬은 run이 끝날 때 남은 작업을 멈춘다),
loop.run_forever()는 아무것도 하지 않고 곧바로 돌아왔다(Pyodide 314.0.7 pyodide/webloop.py). 같은 원리의 가상 보드 쪽은 판 1.1.5에서
고쳤다(src/lab/modules/board/ext/asyncio/apc_board_asyncio.py, DECISIONS C82) — 이 파일은 그 방식을 컴퓨터 파이썬(CPython 3.14) 규칙으로 옮긴 것이다.

무엇: 이름과 규칙은 진짜 asyncio 그대로이고 아래만 바꿨다. 그 밖의 이름(gather·wait_for·wait·Event·Queue·Lock·Semaphore·TaskGroup·timeout·
current_task·CancelledError·TimeoutError …)은 진짜 asyncio의 것이다(모듈 __getattr__ — PEP 562).
  - sleep(delay, result=None): 진짜와 같은 인자 규칙(0 이하는 한 번 양보, NaN은 ValueError, 수가 아니면 같은 TypeError)으로 기다리되 [정지]와
    경주한다(apc_runtime.wait_async — [정지]면 곧바로 KeyboardInterrupt, 기다린 뒤 조절 패널 값 반영 — time.sleep과 같은 일).
  - run(main)·loop.run_until_complete(aw): 진짜 WebLoop.run_until_complete(JSPI)로 끝날 때까지 기다리되, 옆의 지켜보는 작업이 [정지] 신호를
    기다리다가(apc_runtime.until_stop — 폴링 없음) main을 멈춘다 — Event·Queue만 기다리는 코드도 [정지]가 먹는다. run은 끝나면 이 모듈로 만든
    작업 가운데 남은 것을 멈추고 그 마무리가 끝나기를 기다린다(진짜 asyncio.run의 _cancel_all_tasks처럼).
  - get_event_loop()·get_running_loop()·new_event_loop(): 진짜 루프를 감싼 작은 Loop — create_task를 기억하고, run_forever()는 stop()이나
    [정지]까지 기다린다(진짜 파이썬처럼). 나머지(call_soon·call_later·create_future·time·run_in_executor …)는 진짜 루프의 것.
  - create_task·ensure_future: 진짜 작업을 만들고 기억한다 — 남은 작업은 실행이 끝날 때(마무리 훅)·다음 실행을 시작할 때(초기화 훅)도
    멈춘다(실행이 끝났는데 작업이 뒤에서 콘솔에 쓰지 않게).
  - [정지]로 끝난 작업(KeyboardInterrupt)은 콘솔에 "Unhandled exception in event loop" 트레이스백을 남기지 않는다 — 실행 결과가 이미
    "정지"다. 다른 예외는 그대로 찍고(진짜와 같게), 학생이 loop.set_exception_handler로 정한 처리기는 [정지]가 아닌 예외에 불린다.
어디에: 가상 보드 실습실(ESP32 — /apc에 apc_board가 있음)에서는 아무것도 하지 않는다 — 보드 코드의 asyncio는 보드 확장이 맡는다(C82).
학생 코드(apc_runtime.is_student_code — __main__과 작업 폴더의 파일)에만 apc_runtime.register_student_module로 준다. 사이트 모듈(흉내 모듈)·
Pyodide 안쪽·표준 라이브러리가 import하는 asyncio는 진짜 그대로다(sys.modules['asyncio']를 바꾸지 않는다). 이 파일도 /apc에 있어
학생 코드가 아니므로 아래의 `import asyncio`는 진짜를 받는다.
흉내 내지 않는 것: run(…, loop_factory=…)은 진짜 asyncio.run에 맡긴다. 진짜 루프를 다른 길(asyncio.events·asyncio.tasks 하위 모듈,
asyncio.Runner)로 꺼내 만든 작업은 기억하지 못한다. 실행이 끝나는 순간의 멈춤(cancel)은 작업이 다음에 깨어날 때 일어난다.
제한 모드(JSPI 없는 브라우저): sleep은 최상위 await로 된다. run·run_until_complete·run_forever는 끝날 때까지 기다릴 수 없어
apc_runtime.LIMITED_MESSAGE를 RuntimeError로 알린다(오류 사전 limited-mode — 가상 보드와 같다).
라이선스: 사이트 소프트웨어(MIT, PD-26). CPython 코드를 옮기지 않고 이름·규칙만 맞췄다(asyncio/tasks.py sleep·runners.py run — Pyodide 314.0.7에
든 CPython 3.14 표준 라이브러리로 확인).
"""

import asyncio as _real
import importlib.util
import inspect
import math
import types
import weakref

import apc_runtime

__all__ = ["ASYNCIO_MODULE", "install"]

#: 학생 코드가 이 모듈로 만든 작업(create_task·ensure_future·loop.create_task) — 남은 것을 멈출 때 쓴다(머리말)
_tasks = weakref.WeakSet()

#: 이 모듈이 바꾼 이름 — from asyncio import * 에도 들어가게 진짜 asyncio의 __all__에 더한다
_OWN_NAMES = (
    "create_task",
    "ensure_future",
    "get_event_loop",
    "get_running_loop",
    "new_event_loop",
    "run",
    "set_event_loop",
    "sleep",
)

#: 한 번에 기다리는 가장 긴 시간(초). JS 타이머는 약 24.8일(2**31 - 1 ms)을 넘으면 곧바로 끝나므로 하루씩 나눠 잔다 — sleep(float('inf'))도
#: 진짜처럼 [정지]까지 기다린다.
_MAX_WAIT_S = 86400.0

#: 이 모듈을 처음 불러올 때의 진짜 루프(Pyodide의 WebLoop — 지금 도는 루프를 못 찾을 때 쓴다)
_FIRST_LOOP = _real.get_event_loop()


def _web_loop():
    """지금 도는 진짜 이벤트 루프(Pyodide WebLoop). 학생 코드의 맨 바깥(runPythonAsync)도 그 루프 안에서 돈다."""
    loop = _real._get_running_loop()
    return loop if loop is not None else _FIRST_LOOP


def _unwrap(loop):
    return _web_loop() if isinstance(loop, Loop) else loop


# ───────────────────────── 기다리기(sleep) ─────────────────────────


async def sleep(delay, result=None):
    """asyncio.sleep(초) — 진짜와 같고, 기다리는 동안 [정지]를 받는다(곧바로 KeyboardInterrupt). 예: await asyncio.sleep(0.5)"""
    apc_runtime.check_stop()
    if delay <= 0:
        await _real.sleep(0)
        apc_runtime.check_stop()
        return result
    if math.isnan(delay):
        raise ValueError("Invalid delay: NaN (not a number)")
    remaining = float(delay)
    while remaining > 0:
        step = min(remaining, _MAX_WAIT_S)
        await apc_runtime.wait_async(step)
        remaining -= step
    return result


# ───────────────────────── 작업(create_task·ensure_future) ─────────────────────────


def _remember(task):
    if isinstance(task, _real.Future):
        _tasks.add(task)
    return task


def create_task(coro, **kwargs):
    """asyncio.create_task(coro) — 진짜 작업을 만들고 기억한다(남은 작업 멈추기 — 머리말)."""
    return _remember(_real.create_task(coro, **kwargs))


def ensure_future(coro_or_future, *, loop=None):
    """asyncio.ensure_future(aw) — 진짜와 같고, 새로 만든 작업은 기억한다."""
    return _remember(_real.ensure_future(coro_or_future, loop=_unwrap(loop)))


def _pending_tasks():
    return [task for task in list(_tasks) if not task.done()]


def _cancel_tasks():
    """이 모듈로 만든 작업 가운데 아직 도는 것을 멈춘다(cancel — 다음에 깨어날 때 CancelledError). 양보하지 않는다(동기 훅에서도 부른다)."""
    pending = _pending_tasks()
    for task in pending:
        task.cancel()
    _tasks.clear()
    return pending


# ───────────────────────── 실행(run·run_until_complete) ─────────────────────────


async def _watched(aw):
    """aw를 끝까지 돌리며, 옆의 작업이 [정지] 신호를 기다리다가 aw를 멈춘다(머리말 run)."""
    main = _real.ensure_future(aw)
    stopped = []

    async def watch():
        try:
            await apc_runtime.until_stop()
        except KeyboardInterrupt:
            stopped.append(True)
            main.cancel()

    watcher = _real.ensure_future(watch())
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
    """run·run_until_complete·run_forever의 몸통: 끝날 때까지 기다린다(JSPI). 제한 모드면 기다릴 수 없다고 알린다."""
    if not apc_runtime.can_wait():
        if _real.iscoroutine(aw):
            aw.close()  # "was never awaited" 경고가 콘솔에 남지 않게
        raise RuntimeError(apc_runtime.LIMITED_MESSAGE)
    return _web_loop().run_until_complete(_watched(aw))


async def _wrap_awaitable(awaitable):
    return await awaitable


def run(main, *, debug=None, loop_factory=None):
    """asyncio.run(main()) — main이 끝날 때까지 기다리고, 끝나면 남은 작업을 멈춘다(진짜와 같게). 기다리는 동안 [정지]를 받는다."""
    if loop_factory is not None:
        return _real.run(main, debug=debug, loop_factory=loop_factory)
    if not _real.iscoroutine(main):
        if not inspect.isawaitable(main):
            # 진짜 asyncio.run(Runner.run)과 같은 오류 — 흔한 실수: asyncio.run(main)처럼 괄호를 빠뜨림
            raise TypeError("An asyncio.Future, a coroutine or an awaitable is required")
        main = _wrap_awaitable(main)
    try:
        result = _drive(main)
    except BaseException:
        _cancel_tasks()
        raise
    _finish_leftovers()
    return result


def _finish_leftovers():
    """run이 끝난 뒤 남은 작업을 멈추고 그 마무리(finally 등)가 끝나기를 기다린다 — 진짜 asyncio.run의 _cancel_all_tasks와 같다."""
    pending = _cancel_tasks()
    if not pending:
        return
    _drive(_real.gather(*pending, return_exceptions=True))
    for task in pending:
        if task.cancelled():
            continue
        error = task.exception()
        if error is not None:
            _web_loop().call_exception_handler(
                {"message": "unhandled exception during asyncio.run() shutdown", "exception": error, "task": task}
            )


# ───────────────────────── 루프(get_event_loop·run_forever) ─────────────────────────

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
        _web_loop().set_exception_handler(_exception_handler)
    except Exception as error:  # noqa: BLE001 — 처리기를 못 걸어도 asyncio는 돈다(트레이스백만 더 보인다)
        apc_runtime.notice(f"asyncio 준비 중 오류: {type(error).__name__}: {error}", "warn")


class Loop:
    """get_event_loop()·get_running_loop()·new_event_loop()가 돌려주는 루프 — 진짜 루프(WebLoop)를 감싸 create_task를 기억하고,
    run_until_complete·run_forever가 [정지]를 받는다. run_forever는 stop()이나 [정지]까지 기다린다(WebLoop의 run_forever는 곧바로 돌아온다).
    그 밖의 메서드·속성은 진짜 루프의 것이다."""

    def __init__(self):
        self._stop_event = None

    def create_task(self, coro, **kwargs):
        return _remember(_web_loop().create_task(coro, **kwargs))

    def run_until_complete(self, future):
        if _real.isfuture(future) or _real.iscoroutine(future) or inspect.isawaitable(future):
            return _drive(future)
        raise TypeError("An asyncio.Future, a coroutine or an awaitable is required")

    def run_forever(self):
        if self._stop_event is not None:
            raise RuntimeError("This event loop is already running")
        self._stop_event = _real.Event()
        try:
            _drive(self._stop_event.wait())
        finally:
            self._stop_event = None

    def stop(self):
        if self._stop_event is not None:
            self._stop_event.set()

    def is_running(self):
        return self._stop_event is not None or _web_loop().is_running()

    def close(self):
        pass

    def is_closed(self):
        return False

    def set_exception_handler(self, handler):
        """loop.set_exception_handler(handler) — handler(loop, context)는 [정지]가 아닌 작업 예외에 불린다."""
        global _user_exception_handler
        if handler is not None and not callable(handler):
            raise TypeError(f"A callable object or None is expected, got {handler!r}")
        _user_exception_handler = handler

    def get_exception_handler(self):
        return _user_exception_handler

    def call_exception_handler(self, context):
        _exception_handler(_web_loop(), context)

    def __getattr__(self, name):
        # call_soon·call_later·create_future·time·run_in_executor 같은 나머지는 진짜 루프의 것
        return getattr(_web_loop(), name)

    def __repr__(self):
        return f"<asyncio 루프(사이트판 — 진짜 루프 {_web_loop()!r})>"


_LOOP = Loop()


def get_event_loop():
    """asyncio.get_event_loop() — 늘 같은 루프(진짜 루프를 감싼 것)."""
    return _LOOP


def get_running_loop():
    """asyncio.get_running_loop() — 도는 루프가 없으면 진짜와 같은 RuntimeError, 있으면 그 루프를 감싼 것."""
    _real.get_running_loop()
    return _LOOP


def new_event_loop():
    """asyncio.new_event_loop() — 브라우저에는 루프가 하나뿐이라 같은 루프를 돌려준다."""
    return _LOOP


def set_event_loop(loop):
    """asyncio.set_event_loop(loop) — 이 모듈의 루프면 진짜 루프로 바꿔 넘긴다(Pyodide 정책이 감싼 루프를 기억하지 않게)."""
    _real.set_event_loop(_unwrap(loop))


# ───────────────────────── 모듈 만들기·설치 ─────────────────────────


def _make_module():
    module = types.ModuleType("asyncio", "컴퓨터 쪽 실습실의 asyncio(진짜 asyncio + [정지]를 아는 sleep·run) — src/lab/python/apc_asyncio.py")
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


ASYNCIO_MODULE = _make_module()


def _on_run_end():
    # 실행이 끝날 때(마무리 훅) 남은 작업을 멈춘다 — 동기 진입점이라 양보하지 않는다(cancel만).
    _cancel_tasks()


def _on_run_start():
    # 다음 실행을 시작할 때(초기화 훅): 남은 작업을 멈추고, 루프 상태를 비우고, 예외 처리기를 다시 건다(학생이 진짜 루프에 직접 건 처리기는 그 실행까지만).
    _cancel_tasks()
    _LOOP._stop_event = None
    _install_exception_handler()


def _board_lab():
    """가상 보드 실습실인지(그 실습실의 워커만 /apc에 apc_board를 넣는다 — python/modules.ts pythonModulesForLab)."""
    try:
        return importlib.util.find_spec("apc_board") is not None
    except (ImportError, ValueError):
        return False


_installed = False


def install():
    """워커가 실행 직전마다 부른다(apc_shims SHIMS {asyncio: apc_asyncio} — 동기 진입점, 멱등). 가상 보드 실습실이면 아무것도 하지 않는다."""
    global _installed
    if _installed:
        return
    _installed = True
    if _board_lab():
        return
    apc_runtime.register_student_module("asyncio", ASYNCIO_MODULE)
    apc_runtime.register_reset_hook(_on_run_start)
    apc_runtime.register_finish_hook(_on_run_end)
    _install_exception_handler()
