"""컴퓨터 쪽 실습실(영상 처리·4단원 컴퓨터 칸·개발용 시험 페이지)의 asyncio — 학생 코드에만 주는 얇은 모듈(판 1.2.0, PROGRESS 미해결 223).

왜: 학생 코드의 `asyncio.run(main())` + `while True: … await asyncio.sleep(0.3)` 반복은 [정지]가 1초 안에 먹지 않아 "계산만 하는 반복문"
안내와 함께 파이썬을 다시 시작했다(실사이트 1.1.5 — [정지] 뒤 1,063ms에 killed). GitHub Pages에는 SharedArrayBuffer가 없어 [정지]는
기다리는 곳의 확인으로만 되는데(src/lab/runtime/worker.ts 머리말), 진짜 asyncio.sleep은 그 확인을 하지 않는다. 또 Pyodide의 이벤트
루프(WebLoop)는 늘 돌고 있어서 asyncio.run이 끝나도 main이 만든 작업이 뒤에서 계속 돌았고(진짜 파이썬은 run이 끝날 때 남은 작업을 멈춘다),
loop.run_forever()는 아무것도 하지 않고 곧바로 돌아왔다(Pyodide 314.0.7 pyodide/webloop.py). 같은 원리의 가상 보드 쪽은 판 1.1.5에서
고쳤다(src/lab/modules/board/ext/asyncio/apc_board_asyncio.py, DECISIONS C82) — 이 파일은 그 방식을 컴퓨터 파이썬(CPython 3.14) 규칙으로 옮긴 것이다.

무엇: 이름과 규칙은 진짜 asyncio 그대로이고 아래만 바꿨다. 그 밖의 이름(gather·wait_for·wait·Event·Queue·Lock·Semaphore·TaskGroup·timeout·
create_task·current_task·CancelledError·TimeoutError …)은 진짜 asyncio의 것이다(모듈 __getattr__ — PEP 562).
  - sleep(delay, result=None): 진짜와 같은 인자 규칙(0 이하는 한 번 양보, NaN은 ValueError, 수가 아니면 같은 TypeError)으로 기다리되 [정지]와
    경주한다(apc_runtime.wait_async — [정지]면 곧바로 KeyboardInterrupt, 기다린 뒤 조절 패널 값 반영 — time.sleep과 같은 일).
  - run(main)·loop.run_until_complete(aw): 진짜 WebLoop.run_until_complete(JSPI)로 끝날 때까지 기다리되, 옆의 지켜보는 작업이 [정지] 신호를
    기다리다가(apc_runtime.until_stop — 폴링 없음) main을 멈춘다 — Event·Queue만 기다리는 코드도 [정지]가 먹는다.
  - 남은 작업 멈추기(판 1.2.1 — 판 1.2.0 적대적 검토 C1·C2): 학생 실행 동안 진짜 루프에 생긴 작업은 누가 만들었든(create_task뿐 아니라
    gather·wait·shield·TaskGroup·as_completed가 만든 자식, 맨 바깥 `asyncio.gather(...)`까지) 학생 작업으로 본다(_student_tasks — 진짜
    asyncio.all_tasks에서 사이트 작업·맨 바깥 작업·처음부터 있던 작업을 뺀 것). 판 1.2.0은 이 모듈의 create_task로 만든 작업만 기억해서
    `asyncio.run(main())` 안 `await asyncio.gather(tick(), bad())`의 bad가 예외로 끝나면 tick이 실행이 끝난 뒤에도·다음 실행에도 계속 돌았다.
    · run이 끝나면(결과든 예외든) 남은 학생 작업을 멈추고 그 마무리(finally)가 끝나기를 기다린 뒤 돌아온다 — 진짜 asyncio.run의
      _cancel_all_tasks처럼, 예외는 마무리가 끝난 뒤에 학생의 except에 닿는다. [정지]로 끝날 때는 기다릴 수 없어(정지 신호가 서 있다) 멈추기만 한다.
    · 실행이 끝날 때(마무리 훅)·다음 실행을 시작할 때(초기화 훅)도 남은 학생 작업을 멈춘다(실행이 끝났는데 작업이 뒤에서 콘솔에 쓰지 않게).
  - get_event_loop()·get_running_loop()·new_event_loop(): 진짜 루프를 감싼 작은 Loop(asyncio.AbstractEventLoop) — run_forever()는 stop()이나
    [정지]까지 기다린다(진짜 파이썬처럼). close() 뒤에는 is_closed()가 True이고 run_until_complete·run_forever·create_task는 진짜처럼
    "Event loop is closed". new_event_loop()는 새 Loop를 준다. 나머지(call_soon·call_later·create_future·time·run_in_executor …)는 진짜 루프의 것.
  - 도는 루프 안에서 부른 asyncio.run·run_until_complete·run_forever(학생 코루틴 안, 또는 이 모듈이 기다리는 동안 불린 콜백)는 PC처럼
    RuntimeError다("asyncio.run() cannot be called from a running event loop" — 판 1.2.0은 그대로 돌아서 사이트에서 되던 코드가 PC에서 깨졌다).
    맨 바깥 코드는 브라우저에서도 루프 안에서 돌지만(runPythonAsync) PC의 스크립트 맨 바깥과 같게 본다.
  - all_tasks(): 진짜와 같되 사이트가 스스로 만든 작업(맨 바깥 작업·지켜보는 작업·run이 감싼 작업)은 빼서 PC에서 세는 수와 같다.
  - [정지]로 끝난 작업(KeyboardInterrupt)은 콘솔에 "Unhandled exception in event loop" 트레이스백을 남기지 않는다 — 실행 결과가 이미
    "정지"다. 다른 예외는 그대로 찍고(진짜와 같게), 학생이 loop.set_exception_handler로 정한 처리기는 [정지]가 아닌 예외에 불린다.
어디에: 가상 보드 실습실(ESP32 — /apc에 apc_board가 있음)에서는 아무것도 하지 않는다 — 보드 코드의 asyncio는 보드 확장이 맡는다(C82).
학생 코드(apc_runtime.is_student_code — __main__과 작업 폴더의 파일)에만 apc_runtime.register_student_module로 준다. 사이트 모듈(흉내 모듈)·
Pyodide 안쪽·표준 라이브러리가 import하는 asyncio는 진짜 그대로다(sys.modules['asyncio']를 바꾸지 않는다). 이 파일도 /apc에 있어
학생 코드가 아니므로 아래의 `import asyncio`는 진짜를 받는다.
사이트 모듈 규칙: 컴퓨터 쪽 실습실의 사이트 모듈(/apc의 .py)은 오래 도는 asyncio 작업을 만들지 않는다(2026-10-07 기준 하나도 없음) — 학생 실행
동안 생긴 작업은 실행이 끝나면 멈추므로, 만들어야 하면 _site_tasks에 넣는 길을 함께 더한다.
흉내 내지 않는 것: run(…, loop_factory=…)은 진짜 asyncio.run에 맡긴다. asyncio.Runner는 진짜 그대로다. 실행이 끝나는 순간의 멈춤(cancel)은
작업이 다음에 깨어날 때 일어난다.
제한 모드(JSPI 없는 브라우저): sleep은 최상위 await로 된다. run·run_until_complete·run_forever는 끝날 때까지 기다릴 수 없어
apc_runtime.LIMITED_MESSAGE를 RuntimeError로 알린다(오류 사전 limited-mode — 가상 보드와 같다).
라이선스: 사이트 소프트웨어(MIT, PD-26). CPython 코드를 옮기지 않고 이름·규칙만 맞췄다(asyncio/tasks.py sleep·runners.py run·base_events.py
_check_closed·_check_running — Pyodide 314.0.7에 든 CPython 3.14 표준 라이브러리로 확인).
"""

import asyncio as _real
import importlib.util
import inspect
import math
import types
import weakref

import apc_runtime

__all__ = ["ASYNCIO_MODULE", "install"]

try:
    # Pyodide가 학생 코드(맨 바깥)를 돌리는 코루틴(runPythonAsync → eval_code_async) — 그 작업은 학생 작업으로 세지 않는다
    from _pyodide._base import eval_code_async as _eval_code_async

    _TOP_LEVEL_CODE = _eval_code_async.__code__
except Exception:  # noqa: BLE001 — Pyodide 안쪽 이름이 바뀌면 맨 바깥 작업을 이름으로 가리지 못할 뿐(멈추는 쪽은 current_task로 지킨다)
    _TOP_LEVEL_CODE = None

#: 이 모듈이 바꾼 이름 — from asyncio import * 에도 들어가게 진짜 asyncio의 __all__에 더한다
_OWN_NAMES = (
    "all_tasks",
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

#: PC에서 도는 루프 안에서 asyncio.run을 부를 때와 같은 오류 글(CPython asyncio/runners.py)
_RUN_IN_LOOP_MESSAGE = "asyncio.run() cannot be called from a running event loop"

#: 이 모듈을 처음 불러올 때의 진짜 루프(Pyodide의 WebLoop — 지금 도는 루프를 못 찾을 때 쓴다)
_FIRST_LOOP = _real.get_event_loop()

#: 사이트가 스스로 만든 작업(run 옆의 지켜보는 작업, run_until_complete가 감싼 작업, run_forever가 기다리는 작업) — 학생 작업이 아니다
_site_tasks = weakref.WeakSet()
#: 이 모듈을 처음 설치할 때(첫 학생 실행 직전) 이미 있던 작업 — 사이트·Pyodide 안쪽의 것이라 건드리지 않는다
_baseline = weakref.WeakSet()
#: 지금 이 모듈이 루프를 돌리며 기다리는 겹 수(run·run_until_complete·run_forever — 0이 아니면 "도는 루프 안")
_driving = 0


def _web_loop():
    """지금 도는 진짜 이벤트 루프(Pyodide WebLoop). 학생 코드의 맨 바깥(runPythonAsync)도 그 루프 안에서 돈다."""
    loop = _real._get_running_loop()
    return loop if loop is not None else _FIRST_LOOP


def _unwrap(loop):
    return _web_loop() if isinstance(loop, Loop) else loop


def _current_task():
    """지금 도는 작업(없으면 None — 동기 훅처럼 작업 밖에서 불릴 때). 도는 루프가 없어도 오류를 내지 않는다."""
    try:
        return _real.current_task(_web_loop())
    except RuntimeError:
        return None


def _is_top_level(task):
    """Pyodide가 학생 코드의 맨 바깥을 돌리는 작업(eval_code_async)인지."""
    if task is None or _TOP_LEVEL_CODE is None:
        return False
    coro = task.get_coro()
    return getattr(coro, "cr_code", None) is _TOP_LEVEL_CODE


def _in_running_loop():
    """PC라면 도는 이벤트 루프 안인 자리인지: 이 모듈이 루프를 돌리는 중이거나, 맨 바깥이 아닌 작업(학생 코루틴) 안."""
    if _driving > 0:
        return True
    if _TOP_LEVEL_CODE is None:
        return False  # 맨 바깥 작업을 가리지 못하면 코루틴 안인지 따지지 않는다(멀쩡한 맨 바깥 asyncio.run을 막지 않는 쪽)
    current = _current_task()
    return current is not None and not _is_top_level(current)


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


# ───────────────────────── 작업(학생 작업 찾기·멈추기) ─────────────────────────


def ensure_future(coro_or_future, *, loop=None):
    """asyncio.ensure_future(aw) — 진짜와 같다(이 모듈의 Loop를 넘겨도 진짜 루프로 바꿔 넘긴다)."""
    return _real.ensure_future(coro_or_future, loop=_unwrap(loop))


def _student_tasks():
    """진짜 루프에 있는 아직 끝나지 않은 작업 가운데 학생 코드의 것 — 사이트 작업·맨 바깥 작업·처음부터 있던 작업을 뺀다(머리말 "남은 작업 멈추기")."""
    try:
        tasks = _real.all_tasks(_web_loop())
    except Exception:  # noqa: BLE001 — 작업 목록을 못 읽으면 멈출 것이 없다고 본다
        return []
    return [task for task in tasks if task not in _site_tasks and task not in _baseline and not _is_top_level(task)]


def _cancel_tasks():
    """남은 학생 작업을 멈춘다(cancel — 다음에 깨어날 때 CancelledError). 지금 도는 작업(부른 쪽)은 빼고, 양보하지 않는다(동기 훅에서도 부른다).
    멈춘 작업 목록을 돌려준다."""
    current = _current_task()
    pending = [task for task in _student_tasks() if task is not current and not task.done()]
    for task in pending:
        task.cancel()
    return pending


def all_tasks(loop=None):
    """asyncio.all_tasks() — 진짜와 같되 사이트가 스스로 만든 작업은 뺀다(PC에서 세는 수와 같게). 도는 루프가 없으면 진짜와 같은 RuntimeError."""
    if loop is None:
        _real.get_running_loop()
    return set(_student_tasks())


# ───────────────────────── 실행(run·run_until_complete) ─────────────────────────


async def _watched(aw, site_main=False):
    """aw를 끝까지 돌리며, 옆의 작업이 [정지] 신호를 기다리다가 aw를 멈춘다(머리말 run). site_main이면 aw의 작업도 사이트 작업이다(run_forever)."""
    wrapper = _real.current_task()
    if wrapper is not None:
        _site_tasks.add(wrapper)  # run_until_complete가 이 코루틴을 감싼 작업
    main = _real.ensure_future(aw)
    if site_main:
        _site_tasks.add(main)
    stopped = []

    async def watch():
        try:
            await apc_runtime.until_stop()
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


def _close_awaitable(aw):
    if _real.iscoroutine(aw):
        aw.close()  # "was never awaited" 경고가 콘솔에 남지 않게


def _drive(aw, site_main=False):
    """run·run_until_complete·run_forever의 몸통: 끝날 때까지 기다린다(JSPI). 제한 모드면 기다릴 수 없다고 알린다."""
    global _driving
    if not apc_runtime.can_wait():
        _close_awaitable(aw)
        raise RuntimeError(apc_runtime.LIMITED_MESSAGE)
    _driving += 1
    try:
        return _web_loop().run_until_complete(_watched(aw, site_main))
    finally:
        _driving -= 1


async def _wrap_awaitable(awaitable):
    return await awaitable


def run(main, *, debug=None, loop_factory=None):
    """asyncio.run(main()) — main이 끝날 때까지 기다리고, 끝나면 남은 작업을 멈추고 그 마무리를 기다린다(진짜와 같게). 기다리는 동안 [정지]를 받는다."""
    if loop_factory is not None:
        return _real.run(main, debug=debug, loop_factory=loop_factory)
    if _in_running_loop():
        _close_awaitable(main)
        raise RuntimeError(_RUN_IN_LOOP_MESSAGE)
    if not _real.iscoroutine(main):
        if not inspect.isawaitable(main):
            # 진짜 asyncio.run(Runner.run)과 같은 오류 — 흔한 실수: asyncio.run(main)처럼 괄호를 빠뜨림
            raise TypeError("An asyncio.Future, a coroutine or an awaitable is required")
        main = _wrap_awaitable(main)
    global _LOOP
    previous_loop = _LOOP
    # 진짜 asyncio.run처럼 새 루프에서 돈다(CPython Runner가 new_event_loop) — 앞에서 close()한 루프를 run 안의 get_running_loop()가 돌려주지 않게.
    # 끝나면 앞의 루프로 되돌린다(CPython은 None으로 비우지만, 브라우저에서는 맨 바깥도 루프 안이라 너그럽게 둔다).
    _LOOP = Loop()
    try:
        try:
            result = _drive(main)
        except BaseException:
            if apc_runtime.stop_requested():
                # [정지]: 정지 신호가 서 있어 더 기다릴 수 없다 — 멈추기만 한다(작업은 곧 깨어나 KeyboardInterrupt·CancelledError로 끝난다)
                _cancel_tasks()
            else:
                # 진짜처럼 남은 작업의 마무리(finally)가 끝난 뒤에 예외가 학생 코드(except)에 닿는다(판 1.2.1 — 검토 C2)
                _finish_leftovers()
            raise
        _finish_leftovers()
        return result
    finally:
        _LOOP = previous_loop


def _finish_leftovers():
    """run이 끝난 뒤 남은 학생 작업을 멈추고 그 마무리(finally 등)가 끝나기를 기다린다 — 진짜 asyncio.run의 _cancel_all_tasks와 같다."""
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


class Loop(_real.AbstractEventLoop):
    """get_event_loop()·get_running_loop()·new_event_loop()가 돌려주는 루프 — 진짜 루프(WebLoop)를 감싸 run_until_complete·run_forever가
    [정지]를 받는다. run_forever는 stop()이나 [정지]까지 기다린다(WebLoop의 run_forever는 곧바로 돌아온다). close() 뒤에는 닫힌 루프다.
    asyncio.AbstractEventLoop를 이어받아 isinstance 검사가 PC와 같고, 여기 적지 않은 메서드는 진짜 루프의 것이다(아래 _delegate)."""

    def __init__(self):
        self._stop_event = None
        self._closed = False

    def _check_closed(self):
        if self._closed:
            raise RuntimeError("Event loop is closed")

    def _check_running(self):
        # PC: 이 루프가 이미 돌고 있거나(run_forever 중) 다른 루프가 도는 중이면 RuntimeError(base_events.py _check_running)
        if self._stop_event is not None or _in_running_loop():
            raise RuntimeError("This event loop is already running")

    def create_task(self, coro, **kwargs):
        if self._closed:
            _close_awaitable(coro)
        self._check_closed()
        return _web_loop().create_task(coro, **kwargs)

    def run_until_complete(self, future):
        if not (_real.isfuture(future) or _real.iscoroutine(future) or inspect.isawaitable(future)):
            raise TypeError("An asyncio.Future, a coroutine or an awaitable is required")
        if self._closed or self._stop_event is not None or _in_running_loop():
            _close_awaitable(future)
        self._check_closed()
        self._check_running()
        return _drive(future)

    def run_forever(self):
        self._check_closed()
        self._check_running()
        self._stop_event = _real.Event()
        try:
            _drive(self._stop_event.wait(), site_main=True)
        finally:
            self._stop_event = None

    def stop(self):
        if self._stop_event is not None:
            self._stop_event.set()

    def is_running(self):
        return self._stop_event is not None or _web_loop().is_running()

    def close(self):
        if self._stop_event is not None:
            raise RuntimeError("Cannot close a running event loop")
        self._closed = True

    def is_closed(self):
        return self._closed

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
        # WebLoop에만 있는 나머지 이름은 진짜 루프의 것
        return getattr(_web_loop(), name)

    def __repr__(self):
        state = "닫힘" if self._closed else "열림"
        return f"<asyncio 루프(사이트판, {state} — 진짜 루프 {_web_loop()!r})>"


def _delegate(name):
    def method(self, *args, **kwargs):
        return getattr(_web_loop(), name)(*args, **kwargs)

    method.__name__ = name
    method.__qualname__ = f"Loop.{name}"
    return method


# AbstractEventLoop의 메서드 가운데 Loop가 따로 적지 않은 것(call_soon·call_later·create_future·time·run_in_executor·shutdown_asyncgens …)은
# 진짜 루프의 것을 부른다 — 이어받은 빈 메서드(NotImplementedError)가 __getattr__보다 먼저 찾아지므로 이름마다 잇는다.
for _name, _value in list(vars(_real.AbstractEventLoop).items()):
    if callable(_value) and not _name.startswith("__") and _name not in vars(Loop):
        setattr(Loop, _name, _delegate(_name))
del _name, _value


_LOOP = Loop()


def get_event_loop():
    """asyncio.get_event_loop() — 지금 쓰는 루프(처음에는 진짜 루프를 감싼 것, set_event_loop로 바꾼 것이 있으면 그것)."""
    return _LOOP


def get_running_loop():
    """asyncio.get_running_loop() — 도는 루프가 없으면 진짜와 같은 RuntimeError, 있으면 지금 쓰는 루프."""
    _real.get_running_loop()
    return _LOOP


def new_event_loop():
    """asyncio.new_event_loop() — 새 루프(브라우저의 진짜 루프는 하나라 모두 그 루프를 감싼다. 닫는 것은 루프마다 따로)."""
    return Loop()


def set_event_loop(loop):
    """asyncio.set_event_loop(loop) — 이 모듈의 루프면 get_event_loop()가 그것을 돌려준다. 진짜 루프 정책에는 진짜 루프만 넘긴다
    (None이면 브라우저의 진짜 루프를 비우지 않는다 — 사이트 모듈·Pyodide가 그 루프를 쓴다)."""
    global _LOOP
    if isinstance(loop, Loop):
        _LOOP = loop
        return
    if loop is not None:
        _real.set_event_loop(loop)


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
    # 실행이 끝날 때(마무리 훅) 남은 학생 작업을 멈춘다 — 동기 진입점이라 양보하지 않는다(cancel만).
    _cancel_tasks()


def _on_run_start():
    # 다음 실행을 시작할 때(초기화 훅): 남은 학생 작업을 멈추고, 루프를 새로(닫힌 루프·run_forever 상태를 남기지 않게), 예외 처리기를 다시 건다
    # (학생이 진짜 루프에 직접 건 처리기는 그 실행까지만).
    global _LOOP, _driving
    _cancel_tasks()
    _LOOP = Loop()
    _driving = 0
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
    try:
        # 첫 학생 실행 전에 이미 있던 작업(사이트·Pyodide 안쪽)은 학생 작업으로 세지 않는다
        _baseline.update(_real.all_tasks(_web_loop()))
    except Exception:  # noqa: BLE001 — 목록을 못 읽으면 비워 둔다
        pass
    apc_runtime.register_student_module("asyncio", ASYNCIO_MODULE)
    apc_runtime.register_reset_hook(_on_run_start)
    apc_runtime.register_finish_hook(_on_run_end)
    _install_exception_handler()
