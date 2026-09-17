"""파이썬 실행기(워커)의 파이썬 쪽 도우미 — PLAN §4.4(PD-01 JSPI), CODE_MAPPING §3.0.

워커(src/lab/runtime/worker.ts)가 Pyodide를 띄운 뒤 JS 다리(bridge.ts)를 `_apc_bridge` 모듈로 등록하고,
이 폴더(src/lab/python/)의 파일을 가상 파일시스템 /apc에 넣어 불러온 다음 install()을 부른다. 학생 코드가 도는 동안
화면과 값을 주고받는 규칙은 모두 여기 있고, 흉내 모듈(apc_cv2 등, src/lab/python/modules.ts 머리말)도 이 모듈의 함수만 쓴다.

- block_on(promise): JS 약속(Promise)이 끝날 때까지 파이썬을 그 자리에서 멈춘다(pyodide.ffi.run_sync — JSPI).
  기다리는 동안 워커의 이벤트 루프가 돌아서 화면의 메시지([정지], 값)가 들어온다.
  [정지]를 누르면 기다리던 곳에서 바로 KeyboardInterrupt가 난다(정지 1단계). PC에서 Ctrl+C를 누른 것과 같다.
- sleep(초): time.sleep을 대신한다. 아주 짧은 대기는 모아 두었다가 16ms가 넘을 때만 실제로 기다린다(§3.0 규칙 3).
- input(안내글): 화면에 입력줄을 부탁하고 Enter까지 기다린다(대기 지점).
- request(kind, payload, raw=False): 화면에서만 되는 일(카메라 프레임, 블루투스 등)을 부탁하고 답을 기다린다.
  raw=True면 JS 값을 파이썬 값으로 바꾸지 않고 JsProxy 그대로 돌려준다(큰 바이트 배열을 assign_to로 복사할 때).
- emit(kind, payload, transfer): 답을 기다리지 않고 화면에 알린다(cv2.imshow 영상). 제한 모드에서도 된다.
  transfer에 넣은 JS ArrayBuffer는 복사 없이 옮겨져 그 뒤 워커 쪽에서는 비어 있다.
- get(name, default, raw=False) / poll(channel): 화면이 보낸 최신 값(슬라이더)·쌓인 값(키 입력)을 기다리지 않고 읽는다.
  sleep 없는 반복문을 위해 16ms마다 한 번 양보한다(§3.0 규칙 2). 이 함수들이 "입력 확인 지점"이다.
- register_reset_hook(fn): 실행을 시작할 때마다 부를 함수를 등록한다(흉내 모듈이 창·키 목록을 비우는 데 쓴다).
- register_tick_hook(fn): 입력 확인 지점(block_on이 끝난 뒤·maybe_yield)마다 부를 함수를 등록한다(흉내 모듈이 화면에서 온 결과를
  자기 상태에 옮기거나 가상 타이머 콜백을 돌리는 데 쓴다, src/lab/README.md 4절). 훅 안에서는 양보하는 함수를 부르지 않는다.
- register_wait_hook(fn): 파이썬이 실제로 기다리기 직전(block_on이 약속을 기다리기 전·제한 모드의 sleep 전)마다 부를 함수를 등록한다
  (가상 보드가 모아 둔 핀 상태를 기다리기 전에 화면에 보내는 데 쓴다 — Phase 3 P3-01). 양보 금지.
- register_idle_hook(fn) / run_idle(): 학생 코드가 끝까지 돈 뒤에도 흉내 모듈이 "계속 돌 일"(가상 보드의 Timer·핀 인터럽트)이
  있으면 워커가 run_idle()로 이어 간다. fn()은 할 일이 있으면 한 번 기다린 뒤 True, 없으면 False. [정지]로 끝난다(P3-01).
- peek(name, default): get과 같지만 양보·정지 확인을 하지 않는다(초기화 함수·틱 훅 같은 동기 진입점에서 최신 값을 읽을 때).
- 조절 패널 값 반영(P2-04, 슬라이더 규약): 화면의 조절 패널(src/lab/params/panel.ts)이 값을 바꾸면 'lab.params' 채널에
  {name, value, type}을 쌓는다(runtime.pushEvent). sync_params()가 입력 확인 지점(block_on이 끝난 뒤, maybe_yield)마다 그 값을
  실행 중인 학생 코드의 전역 변수에 넣는다. 그 전역 사전은 워커가 코드를 돌리기 직전에 bind_run_globals(globals())로 알려 준다.
  값은 "바뀔 때 한 번"만 넣으므로(쌓인 값을 꺼내 씀) 학생 코드가 반복문 안에서 같은 변수를 스스로 바꾸는 것을 방해하지 않는다.
  실행 전에 쌓인 값은 bind_run_globals가 버린다(코드에 적힌 값이 시작값이다 — 패널이 코드의 숫자도 함께 고쳐 둔다).
- 제한 모드(JSPI 없음, PLAN §4.5): 기다리는 함수(input·request·block_on)는 한국어 안내와 함께 RuntimeError를 낸다.
  time.sleep은 브라우저가 멈춘 채 기다리므로(양보 없음) [정지]는 2단계(다시 시작)로만 된다. 한 번 실행되고 끝나는 코드는 그대로 돈다.
  조절 값은 get·poll 같은 입력 확인 지점에서 들어온다(양보하지 않아도 넣을 수 있다).

정지 표시·값 저장소·요청 번호는 JS 다리가 가지고 있고, 이 파일은 그것을 파이썬 예외·값으로 바꾸기만 한다.
JS 쪽 값이 파이썬으로 올 때는 JsProxy이므로 to_py()로 바꿔 돌려준다(raw=True가 아니면).

라이선스: 사이트 소프트웨어(MIT, PD-26). Vite가 이 파일을 글자로 묶어(?raw) 워커에 넣는다.
"""

import builtins
import keyword
import sys
import time

from pyodide.ffi import JsProxy, can_run_sync, run_sync, to_js

import _apc_bridge as _bridge
import js

__all__ = [
    "PARAMS_CHANNEL",
    "YIELD_INTERVAL_MS",
    "bind_run_globals",
    "block_on",
    "can_wait",
    "check_stop",
    "drain",
    "emit",
    "get",
    "input",
    "install",
    "maybe_yield",
    "notice",
    "peek",
    "poll",
    "register_finish_hook",
    "register_idle_hook",
    "register_reset_hook",
    "register_tick_hook",
    "register_wait_hook",
    "request",
    "reset_for_run",
    "run_idle",
    "sleep",
    "sleep_async",
    "stop_requested",
    "sync_params",
    "unbind_run_globals",
]

# 양보 간격(밀리초). src/lab/runtime/config.ts의 YIELD_INTERVAL_MS와 같아야 한다.
YIELD_INTERVAL_MS = 16

# 조절 패널 값이 쌓이는 채널. src/lab/params/parse.ts의 PARAMS_CHANNEL과 같아야 한다.
PARAMS_CHANNEL = "lab.params"

STOP_MESSAGE = "[정지] 버튼으로 멈췄어요."
LIMITED_MESSAGE = (
    "이 브라우저에는 JSPI(파이썬 기다리기 기능)가 없어서 입력이나 카메라를 기다리는 코드는 실행할 수 없어요. "
    "컴퓨터의 Chrome이나 Edge 최신판에서 열어 주세요."
)
CANCELLED_INPUT_MESSAGE = "입력이 취소되었어요."

_real_sleep = time.sleep
_real_input = builtins.input
_pending_sleep_ms = 0.0
_reset_hooks = []
_tick_hooks = []
_finish_hooks = []
_wait_hooks = []
_idle_hooks = []
_in_tick_hooks = False
_in_wait_hooks = False
# 학생 코드를 돌리는 동안만 True(bind_run_globals ~ unbind_run_globals). 마무리 훅을 실행이 끝날 때만 부르려고 쓴다.
_run_bound = False
# 실행 중인 학생 코드의 전역 사전(globals()). 워커가 bind_run_globals로 넣고 실행이 끝나면 unbind_run_globals로 비운다.
_run_globals = None

# 조절 값의 형 이름(src/lab/params/parse.ts의 ParamValueType) → 파이썬 값으로 바꾸는 함수
_PARAM_CONVERTERS = {
    "int": lambda value: int(round(float(value))),
    "float": float,
    "str": str,
    "bool": bool,
}


def _to_py(value):
    """JS에서 온 값을 파이썬 값으로 바꾼다(숫자·글자는 이미 파이썬 값이다)."""
    return value.to_py() if isinstance(value, JsProxy) else value


def _to_js(value):
    """파이썬 값을 postMessage로 보낼 수 있는 JS 값으로 바꾼다(dict → 평범한 객체)."""
    return to_js(value, dict_converter=js.Object.fromEntries)


def can_wait() -> bool:
    """기다리기(block_on)를 쓸 수 있는지: JSPI가 있고 제한 모드가 아니다."""
    return bool(_bridge.canWait())


def stop_requested() -> bool:
    """[정지]가 눌렸는지(예외를 내지 않고 확인만)."""
    return bool(_bridge.stopRequested())


def check_stop() -> None:
    """[정지]가 눌렸으면 KeyboardInterrupt를 낸다. 입력 확인 지점마다 부른다."""
    if _bridge.stopRequested():
        raise KeyboardInterrupt(STOP_MESSAGE)


def block_on(promise):
    """JS 약속이 끝날 때까지 기다렸다가 그 값을 돌려준다. [정지]가 오면 KeyboardInterrupt, 약속이 실패하면 JsException.
    기다리는 동안 화면이 보낸 조절 값은 약속이 끝난 뒤 전역 변수에 넣는다(sync_params)."""
    check_stop()
    if not can_wait():
        raise RuntimeError(LIMITED_MESSAGE)
    _run_wait_hooks()
    result = run_sync(_bridge.raceStop(promise))
    if _bridge.isStopSignal(result):
        raise KeyboardInterrupt(STOP_MESSAGE)
    sync_params()
    _run_tick_hooks()
    return result


def _sync_allowed() -> bool:
    """지금 이 자리에서 run_sync(스택 전환)를 쓸 수 있는지. JSPI가 있어도 runPython(동기)으로 들어온 호출 안에서는 안 된다
    (Pyodide: "Cannot stack switch because the Python entrypoint was a synchronous function" — 2026-09-16 실사이트 첫 실행에서 확인).
    can_run_sync()는 호출 문맥까지 본다."""
    try:
        return bool(can_run_sync())
    except Exception:
        return False


def maybe_yield() -> None:
    """sleep 없는 반복문을 위해 마지막 양보 뒤 16ms가 지났으면 한 번 양보한다. 정지도 확인하고 조절 값도 넣는다(양보 없이도).
    동기 진입점(워커의 runPython — reset_for_run 등)에서 불리면 양보하지 않고 넘어간다."""
    check_stop()
    if can_wait() and _bridge.msSinceYield() >= YIELD_INTERVAL_MS and _sync_allowed():
        # 실제로 양보한다. 조절 값 반영·틱 훅은 block_on이 약속이 끝난 뒤 한 번 처리한다(여기서 또 부르면 한 지점에서 두 번 불린다).
        block_on(_bridge.sleep(0))
    else:
        sync_params()
        _run_tick_hooks()


def sleep(seconds):
    """time.sleep 대체. 짧은 대기는 모아서 기다리고, 기다리는 동안 화면 메시지를 받는다."""
    global _pending_sleep_ms
    check_stop()
    if not isinstance(seconds, (int, float)):
        raise TypeError(f"'{type(seconds).__name__}' object cannot be interpreted as an integer or float")
    if seconds < 0:
        raise ValueError("sleep length must be non-negative")
    if not can_wait():
        # 제한 모드: CPython 그대로(브라우저가 멈춘 채 기다린다). [정지]는 2단계로만 된다.
        _run_wait_hooks()
        _real_sleep(seconds)
        return
    _pending_sleep_ms += float(seconds) * 1000.0
    if _pending_sleep_ms >= YIELD_INTERVAL_MS or _bridge.msSinceYield() >= YIELD_INTERVAL_MS:
        wait_ms = _pending_sleep_ms
        _pending_sleep_ms = 0.0
        block_on(_bridge.sleep(wait_ms))


async def sleep_async(seconds):
    """(병렬 제작 준비 2026-09-17) 블록 전용 호환 모드(PLAN PD-27 — P3-06)용 sleep: JSPI가 없어도 runPythonAsync의 최상위 await로 기다린다.
    sleep과 같은 일(정지 확인·대기 전 훅·조절 값·틱 훅)을 하고, 기다리기만 JS 약속(_bridge.sleep)을 await한다 — 기다리는 동안 워커가
    화면 메시지(입력·[정지])를 받는다. 학생이 쓰는 이름이 아니라 사이트 생성기가 만든 실행판이 부른다(가상 보드는 apc_board.wait_ns_async)."""
    check_stop()
    if not isinstance(seconds, (int, float)):
        raise TypeError(f"'{type(seconds).__name__}' object cannot be interpreted as an integer or float")
    if seconds < 0:
        raise ValueError("sleep length must be non-negative")
    _run_wait_hooks()
    result = await _bridge.raceStop(_bridge.sleep(float(seconds) * 1000.0))
    if _bridge.isStopSignal(result):
        raise KeyboardInterrupt(STOP_MESSAGE)
    sync_params()
    _run_tick_hooks()


def request(kind, payload=None, *, raw=False):
    """화면에 kind 일을 부탁하고 답을 기다린다. 흉내 모듈이 쓴다(예: request('camera.read')). raw=True면 JsProxy 그대로."""
    value = block_on(_bridge.request(str(kind), _to_js(payload)))
    return value if raw else _to_py(value)


def emit(kind, payload=None, transfer=None):
    """답을 기다리지 않고 화면에 알린다(예: emit('window.show', {...}, transfer=[data.buffer])). 제한 모드에서도 된다."""
    buffers = _to_js(list(transfer)) if transfer else None
    _bridge.emit(str(kind), _to_js(payload), buffers)


def input(prompt=""):
    """builtins.input 대체. 안내글을 콘솔에 쓰고 화면의 입력줄에서 한 줄을 기다린다."""
    text = str(prompt)
    check_stop()
    if not can_wait():
        raise RuntimeError(LIMITED_MESSAGE)
    if text:
        sys.stdout.write(text)
    sys.stdout.flush()
    value = block_on(_bridge.request("input", _to_js({"prompt": text})))
    if value is None:
        raise EOFError(CANCELLED_INPUT_MESSAGE)
    return str(_to_py(value))


def get(name, default=None, *, raw=False):
    """화면이 보낸 최신 값(예: 슬라이더). 없으면 default. 입력 확인 지점(16ms마다 양보, 정지 확인). raw=True면 JsProxy 그대로."""
    maybe_yield()
    value = _bridge.get(str(name))
    if value is None:
        return default
    return value if raw else _to_py(value)


def peek(name, default=None, *, raw=False):
    """get과 같지만 양보·정지 확인·틱 훅을 하지 않는다(입력 확인 지점이 아님). 흉내 모듈의 초기화 함수·틱 훅(동기 진입점)에서
    화면이 실행 직전에 넣어 둔 최신 값(예: 가상 보드의 배선·입력 상태)을 읽을 때 쓴다."""
    value = _bridge.get(str(name))
    if value is None:
        return default
    return value if raw else _to_py(value)


def poll(channel):
    """화면이 쌓아 보낸 값(예: 키 입력)을 순서대로 모두 꺼낸다. 없으면 빈 리스트. 입력 확인 지점."""
    maybe_yield()
    return list(_to_py(_bridge.poll(str(channel))))


def drain(channel):
    """poll과 같지만 양보·정지 확인을 하지 않는다(입력 확인 지점이 아님). 흉내 모듈의 초기화 함수(reset_for_run, 동기 진입점)에서
    이전 실행에 쌓인 값을 버릴 때 쓴다."""
    return list(_to_py(_bridge.poll(str(channel))))


def notice(text, level="info"):
    """콘솔에 사이트 안내(파이썬 출력이 아닌 것)를 보낸다. level: info·warn·error."""
    _bridge.notice(str(text), str(level))


def register_reset_hook(hook) -> None:
    """실행을 시작할 때마다 부를 함수를 등록한다(같은 함수는 한 번만). 흉내 모듈이 자기 상태를 비우는 데 쓴다."""
    if hook not in _reset_hooks:
        _reset_hooks.append(hook)


def register_tick_hook(hook) -> None:
    """입력 확인 지점(block_on이 끝난 뒤·maybe_yield)마다 부를 함수를 등록한다(같은 함수는 한 번만).
    흉내 모듈이 화면에서 온 값(poll·get은 양보 없이 drain·_bridge로 읽기)을 자기 상태에 옮기거나 가상 타이머 콜백을 돌리는 데 쓴다.
    훅 안에서는 양보하는 함수(sleep·request·input·block_on·get·poll)를 부르지 않는다 — 동기 진입점 규칙(PROGRESS 미해결 25번)과
    같은 이유이고, 훅이 도는 동안 다시 훅이 불리지도 않는다. 오류는 콘솔 알림으로 바꾸고 실행은 계속한다."""
    if hook not in _tick_hooks:
        _tick_hooks.append(hook)


def _run_tick_hooks() -> None:
    global _in_tick_hooks
    if _in_tick_hooks or len(_tick_hooks) == 0:
        return
    _in_tick_hooks = True
    try:
        for hook in list(_tick_hooks):
            try:
                hook()
            except KeyboardInterrupt:
                raise
            except Exception as error:  # 한 모듈의 훅 오류가 실행을 막지 않게 한다.
                notice(f"흉내 모듈 훅 오류: {type(error).__name__}: {error}", "warn")
    finally:
        _in_tick_hooks = False


def register_wait_hook(hook) -> None:
    """파이썬이 실제로 기다리기 직전(block_on이 약속을 기다리기 전, 제한 모드 sleep 전)마다 부를 함수를 등록한다(같은 함수는 한 번만).
    흉내 모듈이 모아 둔 상태(가상 보드의 핀 변화 등)를 기다리기 전에 화면에 보내는 데 쓴다 — 기다리는 동안 화면이 그 상태를 그릴 수 있게.
    훅 안에서는 양보하는 함수(sleep·request·input·block_on·get·poll)를 부르지 않는다(emit·notice·drain·peek는 된다).
    훅이 도는 동안 다시 훅이 불리지 않고, 오류는 콘솔 알림으로 바꾸고 기다리기는 계속한다."""
    if hook not in _wait_hooks:
        _wait_hooks.append(hook)


def _run_wait_hooks() -> None:
    global _in_wait_hooks
    if _in_wait_hooks or len(_wait_hooks) == 0:
        return
    _in_wait_hooks = True
    try:
        for hook in list(_wait_hooks):
            try:
                hook()
            except KeyboardInterrupt:
                raise
            except Exception as error:  # 한 모듈의 훅 오류가 기다리기를 막지 않게 한다.
                notice(f"흉내 모듈 대기 전 훅 오류: {type(error).__name__}: {error}", "warn")
    finally:
        _in_wait_hooks = False


def register_idle_hook(hook) -> None:
    """학생 코드가 끝까지 돈 뒤에도 흉내 모듈이 "계속 돌 일"이 있는지 물을 함수를 등록한다(같은 함수는 한 번만).
    가상 보드의 Timer·핀 인터럽트처럼 실물에서는 코드가 끝나도 계속 도는 것을 흉내 내는 데 쓴다(PLAN §4.4 "스크립트가 끝난 뒤의 대기").
    hook()은 할 일이 있으면 기다리기(sleep 등)를 한 번 한 뒤 True를, 없으면 False를 돌려준다. run_idle()이 비동기 진입점에서 부르므로
    이 훅에서는 기다려도 된다."""
    if hook not in _idle_hooks:
        _idle_hooks.append(hook)


def run_idle() -> None:
    """워커가 학생 코드가 오류 없이 끝난 뒤 부른다(runPythonAsync — 비동기 진입점). 등록된 대기 훅 가운데 하나라도 True를 돌려주는 동안
    되풀이한다. 할 일이 없으면 곧바로 끝난다(영상처리 실습실처럼 대기 훅이 없으면 아무 일도 하지 않는다). [정지]를 누르면 KeyboardInterrupt로 끝난다.
    오류를 낸 훅은 콘솔에 알리고 빼서 같은 알림이 되풀이되지 않게 한다."""
    if len(_idle_hooks) == 0:
        return
    while True:
        check_stop()
        busy = False
        for hook in list(_idle_hooks):
            try:
                if hook():
                    busy = True
            except (KeyboardInterrupt, SystemExit):
                raise
            except Exception as error:  # noqa: BLE001 — 훅 하나의 오류로 실행 결과를 바꾸지 않는다
                notice(f"흉내 모듈 대기 훅 오류: {type(error).__name__}: {error}", "warn")
                if hook in _idle_hooks:
                    _idle_hooks.remove(hook)
        if not busy:
            return
        # 훅이 기다리지 않고 True만 돌려줘도 브라우저가 멈추지 않게 한 번 양보한다(16ms 규칙).
        maybe_yield()


# ── 조절 패널 값(P2-04) ──


def register_finish_hook(hook) -> None:
    """실행이 끝날 때(워커가 unbind_run_globals를 부를 때) 한 번 부를 함수를 등록한다(같은 함수는 한 번만).
    흉내 모듈이 마지막 상태를 화면에 올릴 때 쓴다(예: 마지막 줄에서 저장하고 끝나는 코드의 파일).
    동기 진입점이라 양보하는 함수(sleep·request·input·block_on·get·poll)를 쓰지 않는다 — PROGRESS 미해결 25번.
    오류는 콘솔 알림으로 바꾸고 나머지 훅은 계속 돈다."""
    if hook not in _finish_hooks:
        _finish_hooks.append(hook)


def bind_run_globals(namespace) -> None:
    """워커가 학생 코드를 돌리기 직전에 부른다(runPython('…bind_run_globals(globals())', {globals}) — 동기 진입점).
    조절 값을 넣을 전역 사전을 기억하고, 실행 전에 쌓인 값은 버린다(코드에 적힌 값이 시작값)."""
    global _run_globals, _run_bound
    _run_globals = namespace if isinstance(namespace, dict) else None
    _run_bound = True
    drain(PARAMS_CHANNEL)


def unbind_run_globals() -> None:
    """실행이 끝나면 워커가 부른다. 그 뒤에 온 값은 다음 실행에서 버려진다.
    실행 중이었을 때만 마무리 훅(register_finish_hook)을 부른다 — reset_for_run이 부를 때는 돌지 않는다."""
    global _run_globals, _run_bound
    if _run_bound:
        _run_bound = False
        for hook in list(_finish_hooks):
            try:
                hook()
            except Exception as error:  # noqa: BLE001 — 마무리 훅의 오류로 실행 결과를 바꾸지 않는다
                notice(f"실행 마무리 훅 오류: {type(error).__name__}: {error}", "warn")
    _run_globals = None


def _convert_param(value, type_name):
    convert = _PARAM_CONVERTERS.get(str(type_name)) if type_name is not None else None
    return convert(value) if convert else value


def sync_params() -> int:
    """조절 패널에서 바꾼 값을 실행 중인 학생 코드의 전역 변수에 넣는다. 넣은 개수를 돌려준다.
    입력 확인 지점(block_on이 끝난 뒤, maybe_yield)마다 불린다. 양보하지 않으므로 동기 진입점에서 불려도 안전하다.
    이름이 파이썬 변수 이름이 아니거나 예약어면 버리고, 값을 바꿀 수 없으면 콘솔에 알린다."""
    updates = _bridge.poll(PARAMS_CHANNEL)
    if _run_globals is None or len(updates) == 0:
        return 0
    applied = 0
    for update in _to_py(updates):
        if not isinstance(update, dict):
            continue
        name = str(update.get("name", ""))
        if not name.isidentifier() or keyword.iskeyword(name):
            continue
        try:
            _run_globals[name] = _convert_param(update.get("value"), update.get("type"))
            applied += 1
        except (TypeError, ValueError) as error:
            notice(f"조절 값 {name}을(를) 넣지 못했어요: {error}", "warn")
    return applied


def reset_for_run() -> None:
    """실행을 시작할 때 모아 둔 짧은 대기를 비우고 등록된 초기화 함수를 부른다(워커가 부른다)."""
    global _pending_sleep_ms
    _pending_sleep_ms = 0.0
    unbind_run_globals()
    for hook in list(_reset_hooks):
        try:
            hook()
        except Exception as error:  # 한 모듈의 초기화 실패가 실행을 막지 않게 한다.
            notice(f"흉내 모듈 초기화 중 오류: {type(error).__name__}: {error}", "warn")


def install() -> None:
    """time.sleep과 input()을 이 모듈의 것으로 바꾼다(학생 코드가 돌기 전에 워커가 한 번 부른다)."""
    time.sleep = sleep
    builtins.input = input
    reset_for_run()
