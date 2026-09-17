"""보드 콘솔 input() — ESP32 실습실의 input()을 실물 MicroPython 보드처럼(PLAN §6.2 "보드 콘솔 입력", §8.3 P3-05, CODE_MAPPING §3.3 input()·§6.1 R1).
화면 쪽은 같은 폴더의 index.ts. 가상 보드(apc_board.py)가 첫 실행 직전에 이 파일을 불러온다(이름이 apc_board_로 시작 — load_extensions).

학생 코드는 교과서 그대로다(f049·f056·f076·f077·f081 — Thonny 셸에 적은 한 줄이 보드로 간다):

    cmd = input('입력(1/0/q):')

실물 보드(MicroPython v1.29.0 ESP32 — 2026-09-18 원문 확인)
- input([prompt]): 인자는 0~1개, 키워드 인자는 받지 않는다(py/modbuiltins.c mp_builtin_input — MP_DEFINE_CONST_FUN_OBJ_VAR_BETWEEN 0, 1).
  안내글은 str()로 찍고(PRINT_STR), REPL 표준 입력에서 한 줄(줄바꿈은 빼고)을 받는다. 빈 줄에서 Ctrl-D면 EOFError, Ctrl-C면 KeyboardInterrupt.
- 한 줄을 기다리는 동안에도 Timer·핀 인터럽트 콜백이 돈다: mp_hal_stdin_rx_chr가 글자가 올 때까지 MICROPY_EVENT_POLL_HOOK
  (mp_handle_pending — ports/esp32/mphalport.c·mpconfigport.h)을 되풀이하고, UART·PWM 같은 주변장치도 계속 일한다.

가상 보드
- 러너 공통 input()(apc_runtime.input)은 화면 입력줄의 답을 block_on으로 기다려 그동안 파이썬이 멈춘다 → Timer·핀 인터럽트 콜백·UART 받기·부품 조작이
  input()이 끝날 때까지 밀린다(README 7.2의 차이).
- 이 파일은 builtins.input을 바꿔 (1) 인자 규칙을 실물과 같게 하고, (2) 화면이 보드 콘솔을 지원하면('board-console.ready' — 실습실 틀의
  lab.prompt가 있을 때, 공유 파일 변경 요청) 'board-console.prompt' 이벤트 {id, prompt}로 입력줄을 열게 한 뒤 apc_board.wait_ns(20ms) 조각으로
  기다리며 'board-console.line' {id, value: 글자}를 받는다 — 기다리는 동안 보드가 실물처럼 계속 돈다. (3) 지원하지 않거나 제한 모드(JSPI 없음)면
  러너 공통 input()을 그대로 쓴다(지금까지의 동작).
- 화면이 답 대신 {id, cancelled: true}를 주면(입력줄이 닫힘) 러너 공통과 같게 EOFError('입력이 취소되었어요.').
동기 진입점 규칙: 초기화 훅(_reset)은 양보하지 않는다(drain만). 라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import builtins
import sys

import apc_board
import apc_runtime

__all__ = ["CHANNEL_LINE", "CHANNEL_READY", "EVENT_PROMPT", "board_input", "install"]

#: 이름(manifest.ts와 같아야 한다)
EVENT_PROMPT = "board-console.prompt"
CHANNEL_LINE = "board-console.line"
CHANNEL_READY = "board-console.ready"
#: 한 줄을 기다리며 한 번에 자는 양(나노초) — 입력·[정지]에 20ms 안에 반응
WAIT_SLICE_NS = 20_000_000
CANCELLED_MESSAGE = "입력이 취소되었어요."

_state = {"next_id": 0}


def _reset():
    _state["next_id"] = 0
    apc_runtime.drain(CHANNEL_LINE)  # 지난 실행의 입력줄 답은 버린다


def _console_ready():
    return bool(apc_runtime.peek(CHANNEL_READY, False)) and apc_runtime.can_wait()


def board_input(*args, **kwargs):
    """MicroPython input([prompt]) — 기다리는 동안 가상 보드가 계속 돈다(화면이 보드 콘솔을 지원할 때)."""
    if kwargs:
        raise TypeError("function doesn't take keyword arguments")
    if len(args) > 1:
        raise TypeError(f"function expected at most 1 arguments, got {len(args)}")
    prompt = str(args[0]) if args else ""
    if not _console_ready():
        return apc_runtime.input(prompt)
    apc_runtime.check_stop()
    if prompt:
        sys.stdout.write(prompt)
    sys.stdout.flush()
    _state["next_id"] += 1
    request_id = _state["next_id"]
    apc_runtime.emit(EVENT_PROMPT, {"id": request_id, "prompt": prompt})
    while True:
        for item in apc_runtime.drain(CHANNEL_LINE):
            if not isinstance(item, dict) or item.get("id") != request_id:
                continue
            # 화면이 입력줄을 닫으면 {id, cancelled: true} — JS null은 Pyodide에서 None이 아닌 jsnull로 올 수 있어 따로 적는다
            value = item.get("value")
            if item.get("cancelled") or not isinstance(value, str):
                raise EOFError(CANCELLED_MESSAGE)
            return value
        apc_board.wait_ns(WAIT_SLICE_NS)


_installed = False


def install():
    """builtins.input을 보드 콘솔판으로 바꾼다(멱등). 이 파일을 불러올 때 한 번 불린다 — ESP32 실습실 워커에서만."""
    global _installed
    if _installed:
        return
    _installed = True
    builtins.input = board_input
    apc_runtime.register_reset_hook(_reset)


install()
