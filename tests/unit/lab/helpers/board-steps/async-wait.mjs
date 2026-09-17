// 블록 전용 호환 모드(PLAN PD-27 — P3-06) 자리(병렬 제작 준비 2026-09-17): JSPI 없이(제한 모드) runPythonAsync의 최상위 await로
// apc_board.wait_ns_async가 가상 시계만큼 기다리고, 기다리는 동안 화면 입력·[정지]를 받는지 확인하는 단계.
// tests/unit/lab/pyodide-board-async-wait.test.ts가 `--limited --steps=이 파일`로 돌린다.

export default async function asyncWaitSteps({ step, bridge }) {
  // 기다리는 동안 BOOT 버튼(GPIO0)을 누른다 — 표시(mark)를 받은 뒤에 넣어 부하에 흔들리지 않게
  await step(
    'async_wait_inputs',
    [
      'import apc_board, apc_runtime, time',
      'from machine import Pin',
      'b = Pin(0, Pin.IN)',
      'first = b.value()',
      't0 = time.ticks_ms()',
      "apc_runtime.emit('board.device', {'mark': 'waiting'})",
      'await apc_board.wait_ns_async(150_000_000)',
      'second = b.value()',
      'elapsed = time.ticks_diff(time.ticks_ms(), t0)',
      'await apc_board.wait_ns_async(0)',
      '[first, second, elapsed >= 150, elapsed < 1000, apc_runtime.can_wait()]',
    ].join('\n'),
    {
      inputs: { pins: { 0: 'pullup' } },
      onMark: () => bridge.pushEvent('board.input', { pin: 0, drive: 0 }),
    },
  );

  // Timer 콜백도 기다리는 동안 제시간에 돈다
  await step(
    'async_wait_timer',
    [
      'import apc_board',
      'from machine import Timer',
      'hits = []',
      't = Timer(0)',
      't.init(period=20, mode=Timer.PERIODIC, callback=lambda timer: hits.append(1))',
      'await apc_board.wait_ns_async(110_000_000)',
      't.deinit()',
      'len(hits)',
    ].join('\n'),
  );

  // [정지]: 끝없는 반복도 기다리는 곳에서 곧바로 KeyboardInterrupt
  await step('async_wait_stop', ['import apc_board', 'while True:', '    await apc_board.wait_ns_async(10_000_000)'].join('\n'), { stopAfterMs: 80 });
}
