"""블록 전용 호환 모드(PLAN PD-27, §8.3 P3-06)의 실행판 도우미 — JSPI가 없는 브라우저에서 블록이 만든 코드를 가상 보드에서 돌린다.

학생이 import하는 모듈이 아니다. 블록 생성기(src/lab/blocks/generator.ts)가 만든 **실행판**만 부른다. 화면(편집칸)에는 보통 코드가 보인다.

    화면 코드(실제 보드와 같음)          실행판(JSPI 없는 브라우저의 가상 보드)
    sleep(0.5)                          await __import__('apc_blocks').sleep(0.5)
    sleep_ms(20)                        await __import__('apc_blocks').sleep_ms(20)
    while True:                         while await __import__('apc_blocks').tick(True):
    for count in range(3):              async for count in __import__('apc_blocks').each(range(3)):

왜 되나: 워커는 학생 코드를 runPythonAsync로 돌린다(src/lab/runtime/worker.ts). Pyodide는 이 경로에서 맨 바깥 코드의 await·async for를
허용하므로(최상위 await) JSPI(run_sync)가 없어도 JS 약속을 기다릴 수 있다. 기다리는 동안 워커의 이벤트 루프가 돌아 화면이 보낸
입력(터치 센서·BOOT 버튼 — board.input)과 [정지]가 들어온다. 기다리기는 가상 보드의 비동기 대기(apc_board.wait_ns_async — Timer·핀 인터럽트·
입력 반영·[정지])를 그대로 쓴다.

지키는 것
- sleep·sleep_ms·sleep_us의 계산·오류는 MicroPython판 time(apc_board_time.py)과 같다: sleep은 (1000 × 초)를 단정밀도로 계산해 밀리초로 버리고
  음수면 ValueError, sleep_ms·sleep_us는 정수만(소수면 TypeError) 받고 sleep_ms는 음수면, sleep_us는 0 이하면 기다리지 않는다.
- 반복문 한 바퀴마다 tick(): 마지막 양보 뒤 16ms가 지났으면 한 번 양보한다(JSPI 판의 maybe_yield와 같은 간격) — 기다리는 블록이 없는
  반복문(계속 반복: 만약 터치 → LED)도 입력·[정지]를 받는다. 16ms가 안 지났으면 [정지]만 확인한다.
- 양보는 가상 보드가 모아 둔 핀 상태를 화면에 보낸 뒤에 한다(wait_ns_async가 BOARD.flush → 기다리기).

라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import time as _host_time

import apc_board
import apc_runtime

__all__ = ["each", "sleep", "sleep_ms", "sleep_us", "tick"]

#: 반복문이 스스로 양보하는 간격(초) — apc_runtime.YIELD_INTERVAL_MS(16ms)와 같다
YIELD_INTERVAL_S = apc_runtime.YIELD_INTERVAL_MS / 1000

_last_yield = _host_time.monotonic()


def _mark_yield():
    global _last_yield
    _last_yield = _host_time.monotonic()


async def _wait_ns(total_ns):
    try:
        await apc_board.wait_ns_async(total_ns)
    finally:
        _mark_yield()


async def sleep(seconds):
    """time.sleep과 같은 계산(apc_board_time.sleep)으로 가상 시계만큼 기다린다."""
    value = apc_board.mp_float(seconds)
    if value < 0:
        raise ValueError("sleep length must be non-negative")
    milliseconds = int(apc_board.float32(1000.0 * apc_board.float32(value)))
    await _wait_ns(milliseconds * 1_000_000)


async def sleep_ms(milliseconds):
    """time.sleep_ms: 정수만, 음수면 기다리지 않는다."""
    value = apc_board.mp_int(milliseconds)
    if value >= 0:
        await _wait_ns(value * 1_000_000)


async def sleep_us(microseconds):
    """time.sleep_us: 정수만, 0 이하면 기다리지 않는다."""
    value = apc_board.mp_int(microseconds)
    if value > 0:
        await _wait_ns(value * 1_000)


async def tick(value=True):
    """반복문 조건 자리: 16ms가 지났으면 한 번 양보하고(입력·[정지]) 조건 값을 그대로 돌려준다."""
    apc_runtime.check_stop()
    if _host_time.monotonic() - _last_yield >= YIELD_INTERVAL_S:
        await _wait_ns(0)
    return value


async def each(iterable):
    """for 반복문: 한 바퀴마다 tick()을 거쳐 값을 하나씩 준다."""
    for item in iterable:
        await tick()
        yield item
