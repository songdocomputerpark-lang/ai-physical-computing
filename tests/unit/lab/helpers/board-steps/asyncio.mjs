// 가상 보드의 asyncio·uasyncio(src/lab/modules/board/ext/asyncio/apc_board_asyncio.py — 2026-10-02 최종 전수 점검 3바퀴 LB3-01, 판 1.1.5).
// 전에는 학생 코드의 asyncio가 컴퓨터 파이썬 asyncio 그대로라 `await asyncio.sleep_ms(100)`이 AttributeError였고, `await asyncio.sleep` 무한 반복은
// [정지]가 1초 안에 먹지 않아 파이썬을 다시 시작했으며(실사이트 1.1.4: 3,013~3,260ms 뒤 killed), run_forever()는 곧바로 돌아와 작업만 뒤에서 돌았다.
// tests/unit/lab/pyodide-board-asyncio.test.ts가 공유 도우미(pyodide-board-run.mjs --steps=이 파일)로 돌린다(src/lab/README.md 7.9).
// 받는 도구: step(이름, 코드, { … }), bridge, pyodide, out, rootDir. 실행을 멈추는 때는 실제 시간이 아니라 진행(stopWhen — C74 ②)으로 정하고
// stopAfterMs는 안전망으로만 둔다. 진행 표시는 파이썬이 보내는 이벤트 'test.tick'({ n }) — 도우미가 out.events에 모은다.

/** 'test.tick' 이벤트가 n번째에 이르면 [정지] */
const stopAtTick = (n) => ({ kind, payload }) => kind === 'test.tick' && Number(payload?.n) >= n;

/** 이 단계 뒤로 온 'test.tick' 이벤트 수(실행이 끝난 뒤에도 작업이 뒤에서 도는지 본다) */
function ticksSince(out, index) {
  return out.events.slice(index).filter((event) => event.kind === 'test.tick').length;
}

export default async function asyncioSteps({ step, bridge, out }) {
  // ⓐ r3-labs-01 첫 코드 그대로: import uasyncio as asyncio + await asyncio.sleep_ms(100) 세 번 + asyncio.run
  await step(
    'blink_sleep_ms',
    [
      'import uasyncio as asyncio',
      'from machine import Pin',
      'import time',
      'led = Pin(2, Pin.OUT)',
      'states = []',
      'async def blink():',
      '    for _ in range(3):',
      '        led.value(not led.value())',
      '        states.append(led.value())',
      '        await asyncio.sleep_ms(100)',
      't0 = time.ticks_ms()',
      'asyncio.run(blink())',
      '[states, time.ticks_diff(time.ticks_ms(), t0), asyncio.__name__]',
    ].join('\n'),
  );

  // ⓑ 이름: from uasyncio import sleep_ms, asyncio의 MicroPython 이름과 진짜 asyncio의 이름(gather·Event)이 함께 있다
  await step(
    'names',
    [
      'from uasyncio import sleep_ms, sleep',
      'import asyncio, uasyncio',
      "[sleep_ms.__name__, sleep.__name__, asyncio is uasyncio, callable(asyncio.gather), asyncio.Event.__name__, hasattr(asyncio, 'ThreadSafeFlag'),",
      " 'sleep_ms' in asyncio.__all__, 'gather' in dir(asyncio)]",
    ].join('\n'),
  );

  // 값 규칙(실물 core.py): sleep_ms는 정수만(소수면 TypeError), 음수는 기다리지 않음, 2**29 ms 이상은 OverflowError — 값 검사는 부를 때
  await step(
    'sleep_ms_rules',
    [
      'import asyncio',
      'r = []',
      'for value in (0.5, 1 << 29):',
      '    try:',
      '        asyncio.sleep_ms(value)',
      "        r.append('ok')",
      '    except Exception as error:',
      '        r.append(type(error).__name__ + ": " + str(error))',
      'await asyncio.sleep_ms(-5)',
      'await asyncio.sleep(-1)',
      "r.append(await asyncio.sleep(0, 'done'))",
      'r',
    ].join('\n'),
  );

  // 가상 시계: 맨 바깥 await(지켜보는 작업 없음)는 멈춘 시계에서 잔 만큼 정확히(100 + 250ms)
  await step(
    'top_level_exact',
    ['import asyncio, time', 't0 = time.ticks_ms()', 'await asyncio.sleep_ms(100)', 'await asyncio.sleep(0.25)', 'time.ticks_diff(time.ticks_ms(), t0)'].join(
      '\n',
    ),
    { frozenClock: true },
  );

  // ⓒ 무한 반복 + await asyncio.sleep(0.3): [정지]가 곧바로 KeyboardInterrupt(전에는 1초 넘게 안 먹어 파이썬을 다시 시작)
  await step(
    'stop_sleep_loop',
    [
      'import asyncio, apc_runtime',
      'from machine import Pin',
      'led = Pin(2, Pin.OUT)',
      'async def main():',
      '    n = 0',
      '    while True:',
      '        n += 1',
      '        led.value(n % 2)',
      "        apc_runtime.emit('test.tick', {'n': n})",
      '        await asyncio.sleep(0.3)',
      'asyncio.run(main())',
    ].join('\n'),
    { stopWhen: stopAtTick(2), stopAfterMs: 20_000 },
  );

  // [정지]는 학생 코드가 진짜 Event만 기다려도 먹는다(run의 지켜보는 작업)
  await step(
    'stop_event_wait',
    [
      'import asyncio, apc_runtime',
      'async def main():',
      '    flag = asyncio.Event()',
      "    apc_runtime.emit('test.tick', {'n': 1})",
      '    await flag.wait()',
      'asyncio.run(main())',
    ].join('\n'),
    { stopWhen: stopAtTick(1), stopAfterMs: 20_000 },
  );

  // ⓓ 두 작업이 함께 잔다(gather, 100ms·30ms): 둘 다 끝나고 가상 시계(ticks_ms)가 거꾸로 가지 않는다
  await step(
    'gather_two',
    [
      'import asyncio, time',
      'log = []',
      'async def worker(name, period, count):',
      '    for _ in range(count):',
      '        await asyncio.sleep_ms(period)',
      '        log.append((name, time.ticks_ms()))',
      'async def main():',
      "    await asyncio.gather(worker('a', 100, 3), worker('b', 30, 10))",
      't0 = time.ticks_ms()',
      'asyncio.run(main())',
      'ticks = [time.ticks_diff(t, t0) for _, t in log]',
      "[len([1 for name, _ in log if name == 'a']), len([1 for name, _ in log if name == 'b']), all(b >= a for a, b in zip(ticks, ticks[1:])), max(ticks)]",
    ].join('\n'),
  );

  // 작업 넷이 서로 다른 주기로 함께 잘 때도 가상 시계는 거꾸로 가지 않는다(apc_board.Clock.begin_wait·_sleep_virtual_async — 판 1.1.5).
  // 고치기 전 시계로는 같은 코드가 3번 가운데 1번 ticks_ms를 1ms씩 4번 되돌렸다(72 → 71 …, 2026-10-02 Node 실측 — fix-all-r3 보고).
  await step(
    'clock_monotonic_stress',
    [
      'import asyncio, time',
      'samples = []',
      'async def worker(period, count):',
      '    for _ in range(count):',
      '        await asyncio.sleep_ms(period)',
      '        samples.append(time.ticks_ms())',
      'async def main():',
      '    await asyncio.gather(worker(7, 60), worker(13, 30), worker(29, 15), worker(50, 8))',
      'for _ in range(2):',
      '    asyncio.run(main())',
      'back = [(a, b) for a, b in zip(samples, samples[1:]) if b < a]',
      '[len(samples), back[:5]]',
    ].join('\n'),
  );

  // ⓔ asyncio로 자는 동안 Timer 콜백이 주기마다 돈다(보드 time.sleep과 같음)
  await step(
    'timer_during_sleep',
    [
      'import asyncio',
      'from machine import Timer',
      'hits = []',
      't = Timer(0)',
      't.init(period=20, mode=Timer.PERIODIC, callback=lambda timer: hits.append(1))',
      'async def main():',
      '    await asyncio.sleep_ms(110)',
      'asyncio.run(main())',
      't.deinit()',
      'len(hits)',
    ].join('\n'),
    // 가상 시각 계산을 보는 단계는 멈춘 시계로 정확히(C74 ②) — 20·40·60·80·100ms에 다섯 번
    { frozenClock: true },
  );

  // 핀 인터럽트 → ThreadSafeFlag → 작업 깨우기(MicroPython에만 있는 이름) — 표시(mark)를 받은 뒤 BOOT 버튼(GPIO0)을 누른다
  await step(
    'thread_safe_flag',
    [
      'import asyncio, apc_runtime',
      'from machine import Pin',
      'flag = asyncio.ThreadSafeFlag()',
      'button = Pin(0, Pin.IN)',
      'button.irq(trigger=Pin.IRQ_FALLING, handler=lambda pin: flag.set())',
      'async def main():',
      "    apc_runtime.emit('board.device', {'mark': 'waiting'})",
      '    await flag.wait()',
      "    return 'woke'",
      'asyncio.run(main())',
    ].join('\n'),
    {
      inputs: { pins: { 0: 'pullup' } },
      onMark: () => setTimeout(() => bridge.pushEvent('board.input', { pin: 0, drive: 0 }), 0),
      stopAfterMs: 20_000,
    },
  );

  // ② MicroPython 교재에 흔한 모양: get_event_loop() + create_task + run_forever() — [정지]까지 기다린다(전에는 곧바로 돌아와 작업만 뒤에서 돌았다)
  await step(
    'run_forever',
    [
      'import uasyncio as asyncio, apc_runtime',
      'from machine import Pin',
      'led = Pin(2, Pin.OUT)',
      'async def blink():',
      '    n = 0',
      '    while True:',
      '        n += 1',
      '        led.value(n % 2)',
      "        apc_runtime.emit('test.tick', {'n': n})",
      '        await asyncio.sleep_ms(50)',
      'loop = asyncio.get_event_loop()',
      'loop.create_task(blink())',
      'loop.run_forever()',
    ].join('\n'),
    { stopWhen: stopAtTick(3), stopAfterMs: 20_000 },
  );

  // 아무도 기다리지 않는 작업이 [정지] 말고 다른 예외로 끝나면 그대로 stderr에 알린다(실물의 "Task exception wasn't retrieved"처럼) — [정지]만 조용히
  await step(
    'task_error_reported',
    [
      'import asyncio',
      'async def bad():',
      '    await asyncio.sleep_ms(10)',
      '    1 / 0',
      'async def main():',
      '    asyncio.create_task(bad())',
      '    await asyncio.sleep_ms(80)',
      'asyncio.run(main())',
      "'main done'",
    ].join('\n'),
    { stopAfterMs: 20_000 },
  );

  // 학생이 정한 예외 처리기(MicroPython Loop.set_exception_handler)는 작업 예외에 불린다
  await step(
    'user_exception_handler',
    [
      'import asyncio',
      'seen = []',
      'loop = asyncio.get_event_loop()',
      "loop.set_exception_handler(lambda l, context: seen.append(type(context['exception']).__name__))",
      'async def bad():',
      '    1 / 0',
      'async def main():',
      '    asyncio.create_task(bad())',
      '    await asyncio.sleep_ms(30)',
      'asyncio.run(main())',
      '[seen, loop.get_exception_handler() is not None]',
    ].join('\n'),
    { stopAfterMs: 20_000 },
  );

  // loop.stop()으로 run_forever가 끝난다
  await step(
    'run_forever_stop',
    [
      'import asyncio',
      'loop = asyncio.get_event_loop()',
      'async def stopper():',
      '    await asyncio.sleep_ms(60)',
      '    loop.stop()',
      'loop.create_task(stopper())',
      'loop.run_forever()',
      "'stopped by loop.stop()'",
    ].join('\n'),
    { stopAfterMs: 20_000 },
  );

  // run(main)이 끝나면 main이 만든 작업도 멈춘다 — 실행이 끝난 뒤 뒤에서 더 돌지 않는다(실물은 루프가 멈춰 작업이 더 돌지 않는다)
  await step(
    'leftover_task',
    [
      'import asyncio, apc_runtime',
      'async def blink():',
      '    n = 0',
      '    while True:',
      '        n += 1',
      "        apc_runtime.emit('test.tick', {'n': n})",
      '        await asyncio.sleep_ms(20)',
      'async def main():',
      '    asyncio.create_task(blink())',
      '    await asyncio.sleep_ms(100)',
      'asyncio.run(main())',
      "'main done'",
    ].join('\n'),
    { stopAfterMs: 20_000 },
  );
  const afterLeftover = out.events.length;
  await new Promise((resolve) => setTimeout(resolve, 400));
  out.steps.leftover_after = { ms: 400, value: ticksSince(out, afterLeftover), stdout: '', stderr: '', events: [], notices: [] };

  // 맨 바깥에서 create_task만 하고 끝난 코드 — 실행이 끝나면(마무리 훅) 그 작업도 멈춘다
  await step(
    'top_level_task',
    [
      'import asyncio, apc_runtime',
      'async def blink():',
      '    n = 0',
      '    while True:',
      '        n += 1',
      "        apc_runtime.emit('test.tick', {'n': n})",
      '        await asyncio.sleep_ms(20)',
      'asyncio.create_task(blink())',
      'await asyncio.sleep_ms(60)',
      "'code done'",
    ].join('\n'),
    { stopAfterMs: 20_000 },
  );
  const afterTopLevel = out.events.length;
  await new Promise((resolve) => setTimeout(resolve, 400));
  out.steps.top_level_after = { ms: 400, value: ticksSince(out, afterTopLevel), stdout: '', stderr: '', events: [], notices: [] };

  // (판 1.2.1 — 판 1.2.0 적대적 검토 C1·C7) gather가 만든 자식도 남은 작업이다: 한 자식이 예외로 끝나 run이 끝나면 남은 자식(blink)도 멈춘다.
  // 판 1.1.5~1.2.0은 create_task로 만든 작업만 기억해 blink가 실행이 끝난 뒤에도 돌았다(같은 설계의 컴퓨터 쪽 asyncio에서 찾음).
  await step(
    'gather_leftover',
    [
      'import asyncio, apc_runtime',
      'async def blink():',
      '    n = 0',
      '    while True:',
      '        n += 1',
      "        apc_runtime.emit('test.tick', {'n': n})",
      '        await asyncio.sleep_ms(20)',
      'async def bad():',
      '    await asyncio.sleep_ms(70)',
      "    raise ValueError('센서 오류')",
      'async def main():',
      '    await asyncio.gather(blink(), bad())',
      'try:',
      '    asyncio.run(main())',
      'except ValueError as error:',
      "    result = 'caught ' + str(error)",
      'result',
    ].join('\n'),
    { stopAfterMs: 20_000 },
  );
  const afterGather = out.events.length;
  await new Promise((resolve) => setTimeout(resolve, 400));
  out.steps.gather_after = { ms: 400, value: ticksSince(out, afterGather), stdout: '', stderr: '', events: [], notices: [] };

  // 실행 사이에 멈춘 작업은 다음 실행에 끼어들지 않는다 — 다음 실행의 보드는 깨끗하다(LED 2번 핀 그대로 0)
  await step('next_run_clean', ['from machine import Pin', 'import time', 'led = Pin(2, Pin.OUT)', 'time.sleep_ms(100)', 'led.value()'].join('\n'));
}
