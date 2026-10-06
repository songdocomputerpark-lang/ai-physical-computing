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
- import 훅(판 1.2.0 — PROGRESS 미해결 219·223): 필요할 때만 builtins.__import__를 감싼다(받는 중인 패키지가 생기거나 학생 전용 모듈이
  등록될 때 — 가상 보드 실습실은 둘 다 없어 걸리지 않는다). 하는 일 둘:
  ① 받는 중인 패키지 문지기: 워커가 numpy·OpenCV를 미리 받는 동안 그것과 상관없는 코드는 기다리지 않고 시작한다(worker.ts·package-loads.ts).
    그 코드가 흉내 모듈·작업 폴더의 내 모듈을 거쳐 받는 중인 패키지(파일은 풀렸지만 .so는 아직 — import하면 ImportError)를 import하면,
    기다릴 수 있는 자리(학생 코드 실행)에서는 다 받을 때까지 그 자리에서 기다리고([정지]면 KeyboardInterrupt) 미뤄 둔 흉내 모듈을 설치한 뒤
    이어 가고, 기다릴 수 없는 자리(동기 진입점 — 흉내 모듈 설치)에서는 PackageStillLoading을 낸다(apc_shims가 그 흉내를 미룬다).
    받는 중인 이름은 워커가 set_packages_loading으로 알려 주고(늘어날 때만), 이름이 걸리면 그때 정확한 값을 워커에 묻는다.
  ② 학생 코드에만 주는 모듈(register_student_module): 학생 코드(__main__·작업 폴더의 파일 — is_student_code)가 그 이름을 import하면
    sys.modules의 진짜 대신 등록한 모듈을 준다. 컴퓨터 쪽 asyncio(apc_asyncio.py — [정지]를 아는 sleep·run)가 쓴다. 가상 보드 실습실은
    보드의 import 훅(apc_board._board_import)이 먼저라 보드 코드의 asyncio는 보드 확장이 맡는다.

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
    "PackageStillLoading",
    "WORK_DIR",
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
    "is_student_code",
    "maybe_yield",
    "notice",
    "package_loading",
    "packages_loading",
    "peek",
    "poll",
    "register_finish_hook",
    "register_idle_hook",
    "register_reset_hook",
    "register_student_module",
    "register_tick_hook",
    "register_wait_hook",
    "request",
    "reset_for_run",
    "run_idle",
    "set_deferred_shims",
    "set_packages_loading",
    "sleep",
    "sleep_async",
    "stop_requested",
    "sync_params",
    "unbind_run_globals",
    "until_stop",
    "wait_async",
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

# 학생 작업 폴더(Pyodide 기본 홈 — runtime-extras의 apc_files.WORK_DIR, 가상 보드의 apc_board.WORK_DIR와 같다)
WORK_DIR = "/home/pyodide"

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
    await _wait_ms_async(float(seconds) * 1000.0)


async def wait_async(seconds):
    """(판 1.2.0, PROGRESS 미해결 223) [정지]를 아는 비동기 기다리기 — 컴퓨터 쪽 asyncio.sleep(apc_asyncio.py)이 쓴다.
    sleep_async와 같은 일(정지 확인·대기 전 훅·조절 값·틱 훅)을 하되 인자 검사는 하지 않는다 — 0보다 큰 초를 부르는 쪽이 진짜 asyncio
    규칙(0 이하는 한 번 양보, NaN은 ValueError)으로 걸러 넘긴다. 기다리는 동안 [정지]가 오면 곧바로 KeyboardInterrupt. JSPI가 없어도 된다
    (runPythonAsync 안의 await)."""
    check_stop()
    await _wait_ms_async(float(seconds) * 1000.0)


async def _wait_ms_async(ms):
    _run_wait_hooks()
    result = await _bridge.raceStop(_bridge.sleep(ms))
    if _bridge.isStopSignal(result):
        raise KeyboardInterrupt(STOP_MESSAGE)
    sync_params()
    _run_tick_hooks()


async def until_stop():
    """(판 1.2.0, PROGRESS 미해결 223) [정지]가 올 때까지 기다렸다가 KeyboardInterrupt를 낸다 — 컴퓨터 쪽 asyncio의 run이 옆에 두는
    지켜보는 작업(학생 코드가 Event·Queue만 기다려도 [정지]가 먹게)이 쓴다. 폴링하지 않는다(JS 다리의 정지 신호 약속을 기다림).
    [정지] 없이 실행이 끝나면 끝나지 않으므로, 부르는 쪽이 일이 끝나면 그 작업을 멈춘다(cancel)."""
    check_stop()
    await _bridge.stopSignal()
    raise KeyboardInterrupt(STOP_MESSAGE)


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


# ── import 훅(판 1.2.0 — 받는 중인 패키지 문지기·학생 전용 모듈, 머리말) ──


class PackageStillLoading(Exception):
    """받는 중인 Pyodide 패키지를 기다릴 수 없는 자리(동기 진입점 — 흉내 모듈 설치)에서 import하려 했다(판 1.2.0, PROGRESS 미해결 219).

    ImportError가 아니다 — `try: import numpy except ImportError: np = None`처럼 대체값을 굳히는 모듈이 반쯤 받은 패키지를 '없음'으로
    기억하지 않게 한다(그 모듈의 import 자체가 실패해 sys.modules에 남지 않고, 다 받은 뒤 다시 불러온다).
    apc_shims.install_available()이 받아 그 흉내 모듈을 미룬다."""


#: 받는 중인 패키지의 import 이름(맨 앞 이름) — 워커가 받기를 줄에 세울 때 늘린다. 줄어든 것은 이름이 걸렸을 때 정확한 값을 물어 고친다.
_packages_loading = frozenset()
#: 학생 코드에만 주는 모듈(import 이름 → 모듈)
_student_modules = {}
#: import 훅을 걸기 전의 builtins.__import__(훅을 걸지 않았으면 None)
_host_import = None
#: 미룬 흉내 모듈을 설치하는 중인지(그 설치가 다시 문지기를 거쳐 되풀이되지 않게)
_installing_deferred = False
#: 지금 import 훅 안에서 몇 겹 import하는 중인지(맨 바깥 import가 끝나면 0)
_import_depth = 0
#: 받기를 기다린 뒤 맨 바깥 import가 끝나면 미룬 흉내를 다시 설치해야 하는지 — 기다린 자리가 흉내 모듈 자신의 import 도중이면
#: (학생 코드 `import mediapipe` → apc_mediapipe의 맨 위 `import numpy`) 그 흉내는 덜 만들어져 그때 설치할 수 없다(apc_shims._initializing).
_retry_deferred = False
#: 이번 실행 직전에 받는 중이라 미룬 흉내 모듈의 패키지 이름(apc_shims가 set_deferred_shims로 알려 준다 — 판 1.2.1, 판 1.2.0 적대적 검토 C4).
#: 받기가 실행 도중에 끝난 뒤 학생 코드가 그 이름을 import하면(작업 폴더의 내 모듈이 `import cv2`처럼 import 문으로 드러나지 않게 닿아도)
#: 기다릴 일이 없어 문지기를 거치지 않으므로, 그 import가 끝나는 자리에서 미룬 흉내를 설치한다 — 전에는 그 실행 내내 진짜 cv2.imshow였다.
_deferred_heads = frozenset()


def set_deferred_shims(names) -> None:
    """apc_shims가 미룬 흉내 모듈의 패키지 이름을 알려 준다(동기 진입점 — install_available·install_deferred 끝). 비어 있지 않으면 import 훅을 건다."""
    global _deferred_heads
    _deferred_heads = frozenset(str(name) for name in (_to_py(names) or ()))
    if _deferred_heads:
        _ensure_import_hook()


def set_packages_loading(names) -> None:
    """워커가 받기를 줄에 세울 때 부른다(동기 진입점): 받는 중인 패키지의 import 이름 목록. 비어 있지 않으면 import 훅을 건다."""
    global _packages_loading
    _packages_loading = frozenset(str(name) for name in (_to_py(names) or ()))
    if _packages_loading:
        _ensure_import_hook()


def packages_loading() -> frozenset:
    """받는 중인 패키지의 import 이름(정확한 지금 값). 받는 중으로 알려진 것이 있을 때만 워커에 묻는다(없으면 묻지 않고 빈 집합)."""
    global _packages_loading
    if _packages_loading:
        _packages_loading = frozenset(str(name) for name in (_to_py(_bridge.packagesLoading()) or ()))
    return _packages_loading


def package_loading(name) -> bool:
    """name(점이 든 이름이면 맨 앞 이름)이 받는 중인 패키지의 import 이름인지(정확한 값). apc_shims가 흉내 설치를 미룰 때 쓴다."""
    head = str(name).partition(".")[0]
    return head in _packages_loading and head in packages_loading()


def is_student_code(namespace) -> bool:
    """import하는 쪽이 학생 코드인지: 실행 중인 main.py(__main__)와 작업 폴더(WORK_DIR)의 파일. 사이트 모듈(/apc)·표준 라이브러리·
    받은 패키지(site-packages)는 아니다(가상 보드의 apc_board.is_board_code와 같은 규칙 — 보드 라이브러리 폴더만 빠짐)."""
    if not isinstance(namespace, dict):
        return False
    if namespace.get("__name__") == "__main__":
        return True
    file_name = namespace.get("__file__")
    if not isinstance(file_name, str) or file_name == "":
        return False
    if not file_name.startswith("/"):
        return True
    return file_name.startswith(WORK_DIR + "/")


def register_student_module(name, module) -> None:
    """학생 코드(is_student_code)가 `import <name>`하면 sys.modules의 진짜 대신 받을 모듈을 등록하고 import 훅을 건다(뒤에 등록한 것이 이긴다).
    컴퓨터 쪽 asyncio(apc_asyncio.py)가 쓴다. 사이트 모듈·표준 라이브러리가 import하는 같은 이름은 진짜 그대로다."""
    _student_modules[str(name)] = module
    _ensure_import_hook()


def _wait_for_package(head) -> None:
    """받는 중인 패키지 head를 import하려는 자리. 정확한 값으로 다시 보고, 아직이면 기다릴 수 있는 자리(학생 코드 실행 — JSPI)에서는
    다 받을 때까지 기다린 뒤(그사이 [정지]면 KeyboardInterrupt) 미뤄 둔 흉내 모듈을 설치하고, 기다릴 수 없는 자리면 PackageStillLoading.
    지금 import되는 중이라 덜 만들어진 흉내(apc_mediapipe 등)는 apc_shims가 다시 미루고, 맨 바깥 import가 끝날 때 설치한다(_apc_import)."""
    global _packages_loading, _retry_deferred
    if head not in packages_loading():
        return
    if not (can_wait() and _sync_allowed()):
        raise PackageStillLoading(f"'{head}' 패키지를 아직 받는 중이에요 — 다 받은 뒤에 불러와요.")
    value = block_on(_bridge.whenPackagesLoaded(head))
    _packages_loading = frozenset(str(name) for name in (_to_py(value) or ()))
    _install_deferred_shims()
    _retry_deferred = True


def _install_deferred_shims() -> None:
    """받는 중이라 이번 실행 직전에 미룬 흉내 모듈(apc_shims.install_deferred)을 설치한다 — 이 실행이 import하는 패키지의 흉내(cv2 창 함수 등)."""
    global _installing_deferred
    if _installing_deferred:
        return
    shims = sys.modules.get("apc_shims")
    install_deferred = getattr(shims, "install_deferred", None)
    if not callable(install_deferred):
        return
    _installing_deferred = True
    try:
        install_deferred()
    finally:
        _installing_deferred = False


def _apc_import(name, globals=None, locals=None, fromlist=(), level=0):  # noqa: A002 — builtins.__import__와 같은 인자 이름
    global _import_depth, _retry_deferred
    _import_depth += 1
    try:
        result = _apc_import_inner(name, globals, locals, fromlist, level)
    finally:
        _import_depth -= 1
    if _deferred_heads and not _installing_deferred and level == 0 and isinstance(name, str):
        head = name.partition(".")[0]
        if head in _deferred_heads and not package_loading(head):
            # 미룬 흉내의 패키지를 방금 불러왔고 받기는 끝났다 — 이 import 문 다음 줄이 그 이름을 쓰기 전에 설치한다(머리말 _deferred_heads, 검토 C4).
            # 그 패키지가 아직 만들어지는 중이면 apc_shims가 다시 미루고, 맨 바깥 import가 끝날 때(아래) 또는 다음 import에서 다시 본다.
            _install_deferred_shims()
            if _deferred_heads:
                _retry_deferred = True
    if _import_depth == 0 and _retry_deferred and not _installing_deferred:
        # 받기를 기다린 import가 모두 끝났다 — 그 import 도중이라 덜 만들어져 미룬 흉내를 이제 설치한다(_wait_for_package 머리말)
        _retry_deferred = False
        _install_deferred_shims()
    return result


def _apc_import_inner(name, globals, locals, fromlist, level):  # noqa: A002 — builtins.__import__와 같은 인자 이름
    if level == 0 and isinstance(name, str):
        head = name.partition(".")[0]
        if head in _packages_loading:
            _wait_for_package(head)
        module = _student_modules.get(head)
        if module is not None and is_student_code(globals):
            if name == head:
                return module
            # asyncio.tasks처럼 점이 든 이름: 진짜 하위 모듈을 불러오고, `import asyncio.tasks`가 묶는 맨 앞 이름에는 학생용 모듈을 준다
            # (from asyncio.tasks import … 는 진짜 하위 모듈에서 꺼낸다).
            result = _host_import(name, globals, locals, fromlist, level)
            return result if fromlist else module
    return _host_import(name, globals, locals, fromlist, level)


def _ensure_import_hook() -> None:
    """builtins.__import__를 한 번만 감싼다. C 코드가 부르는 PyImport_Import도 이 훅을 거치지만 돌려준 값이 아니라 sys.modules를 쓰므로
    학생용 모듈은 학생 코드의 import 문에만 간다(apc_board 머리말 6과 같은 까닭)."""
    global _host_import
    if _host_import is not None:
        return
    _host_import = builtins.__import__
    builtins.__import__ = _apc_import


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
