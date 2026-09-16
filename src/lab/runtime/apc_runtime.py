"""파이썬 실행기(워커)의 파이썬 쪽 도우미 — PLAN §4.4(PD-01 JSPI), CODE_MAPPING §3.0.

워커(src/lab/runtime/worker.ts)가 Pyodide를 띄운 뒤 JS 다리(bridge.ts)를 `_apc_bridge` 모듈로 등록하고,
이 파일을 가상 파일시스템에 넣어 불러온 다음 install()을 부른다. 학생 코드가 도는 동안 화면과 값을 주고받는
규칙은 모두 여기 있고, 흉내 모듈(cv2 창·mediapipe·pyautogui 등, P2-03~)도 이 모듈의 함수만 쓴다.

- block_on(promise): JS 약속(Promise)이 끝날 때까지 파이썬을 그 자리에서 멈춘다(pyodide.ffi.run_sync — JSPI).
  기다리는 동안 워커의 이벤트 루프가 돌아서 화면의 메시지([정지], 값)가 들어온다.
  [정지]를 누르면 기다리던 곳에서 바로 KeyboardInterrupt가 난다(정지 1단계). PC에서 Ctrl+C를 누른 것과 같다.
- sleep(초): time.sleep을 대신한다. 아주 짧은 대기는 모아 두었다가 16ms가 넘을 때만 실제로 기다린다(§3.0 규칙 3).
- input(안내글): 화면에 입력줄을 부탁하고 Enter까지 기다린다(대기 지점).
- request(kind, payload): 화면에서만 되는 일(카메라 프레임, 블루투스 등)을 부탁하고 답을 기다린다.
- get(name, default) / poll(channel): 화면이 보낸 최신 값(슬라이더)·쌓인 값(키 입력)을 기다리지 않고 읽는다.
  sleep 없는 반복문을 위해 16ms마다 한 번 양보한다(§3.0 규칙 2). 이 함수들이 "입력 확인 지점"이다.
- 제한 모드(JSPI 없음, PLAN §4.5): 기다리는 함수(input·request·block_on)는 한국어 안내와 함께 RuntimeError를 낸다.
  time.sleep은 브라우저가 멈춘 채 기다리므로(양보 없음) [정지]는 2단계(다시 시작)로만 된다. 한 번 실행되고 끝나는 코드는 그대로 돈다.

정지 표시·값 저장소·요청 번호는 JS 다리가 가지고 있고, 이 파일은 그것을 파이썬 예외·값으로 바꾸기만 한다.
JS 쪽 값이 파이썬으로 올 때는 JsProxy이므로 to_py()로 바꿔 돌려준다.

라이선스: 사이트 소프트웨어(MIT, PD-26). Vite가 이 파일을 글자로 묶어(?raw) 워커에 넣는다.
"""

import builtins
import sys
import time

from pyodide.ffi import JsProxy, run_sync, to_js

import _apc_bridge as _bridge
import js

__all__ = [
    "YIELD_INTERVAL_MS",
    "block_on",
    "can_wait",
    "check_stop",
    "get",
    "input",
    "install",
    "maybe_yield",
    "notice",
    "poll",
    "request",
    "reset_for_run",
    "sleep",
    "stop_requested",
]

# 양보 간격(밀리초). src/lab/runtime/config.ts의 YIELD_INTERVAL_MS와 같아야 한다.
YIELD_INTERVAL_MS = 16

STOP_MESSAGE = "[정지] 버튼으로 멈췄어요."
LIMITED_MESSAGE = (
    "이 브라우저에는 JSPI(파이썬 기다리기 기능)가 없어서 입력이나 카메라를 기다리는 코드는 실행할 수 없어요. "
    "컴퓨터의 Chrome이나 Edge 최신판에서 열어 주세요."
)
CANCELLED_INPUT_MESSAGE = "입력이 취소되었어요."

_real_sleep = time.sleep
_real_input = builtins.input
_pending_sleep_ms = 0.0


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
    """JS 약속이 끝날 때까지 기다렸다가 그 값을 돌려준다. [정지]가 오면 KeyboardInterrupt, 약속이 실패하면 JsException."""
    check_stop()
    if not can_wait():
        raise RuntimeError(LIMITED_MESSAGE)
    result = run_sync(_bridge.raceStop(promise))
    if _bridge.isStopSignal(result):
        raise KeyboardInterrupt(STOP_MESSAGE)
    return result


def maybe_yield() -> None:
    """sleep 없는 반복문을 위해 마지막 양보 뒤 16ms가 지났으면 한 번 양보한다. 정지도 확인한다."""
    check_stop()
    if can_wait() and _bridge.msSinceYield() >= YIELD_INTERVAL_MS:
        block_on(_bridge.sleep(0))


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
        _real_sleep(seconds)
        return
    _pending_sleep_ms += float(seconds) * 1000.0
    if _pending_sleep_ms >= YIELD_INTERVAL_MS or _bridge.msSinceYield() >= YIELD_INTERVAL_MS:
        wait_ms = _pending_sleep_ms
        _pending_sleep_ms = 0.0
        block_on(_bridge.sleep(wait_ms))


def request(kind, payload=None):
    """화면에 kind 일을 부탁하고 답을 기다린다. 흉내 모듈이 쓴다(예: request('camera.read'))."""
    return _to_py(block_on(_bridge.request(str(kind), _to_js(payload))))


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


def get(name, default=None):
    """화면이 보낸 최신 값(예: 슬라이더). 없으면 default. 입력 확인 지점(16ms마다 양보, 정지 확인)."""
    maybe_yield()
    value = _bridge.get(str(name))
    if value is None:
        return default
    return _to_py(value)


def poll(channel):
    """화면이 쌓아 보낸 값(예: 키 입력)을 순서대로 모두 꺼낸다. 없으면 빈 리스트. 입력 확인 지점."""
    maybe_yield()
    return list(_to_py(_bridge.poll(str(channel))))


def notice(text, level="info"):
    """콘솔에 사이트 안내(파이썬 출력이 아닌 것)를 보낸다. level: info·warn·error."""
    _bridge.notice(str(text), str(level))


def reset_for_run() -> None:
    """실행을 시작할 때 모아 둔 짧은 대기를 비운다(워커가 부른다)."""
    global _pending_sleep_ms
    _pending_sleep_ms = 0.0


def install() -> None:
    """time.sleep과 input()을 이 모듈의 것으로 바꾼다(학생 코드가 돌기 전에 워커가 한 번 부른다)."""
    time.sleep = sleep
    builtins.input = input
    reset_for_run()
