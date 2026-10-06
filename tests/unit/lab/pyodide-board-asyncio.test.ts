// 가상 ESP32 보드의 asyncio·uasyncio(src/lab/modules/board/ext/asyncio/apc_board_asyncio.py) — Node의 실제 Pyodide(JSPI).
// 2026-10-02 최종 전수 점검 3바퀴 LB3-01(판 1.1.5): 전에는 학생 코드의 asyncio가 컴퓨터 파이썬 asyncio 그대로라
//   ① `await asyncio.sleep_ms(100)`이 AttributeError("오타일 때가 많아요" 카드) — 실물 MicroPython v1.29.0 extmod/asyncio/core.py에는 있다
//   ② `await asyncio.sleep` 무한 반복은 [정지]가 1초 안에 먹지 않아 파이썬을 다시 시작(실사이트 1.1.4: 3,013~3,260ms 뒤 killed)
//   ③ loop.run_forever()는 곧바로 돌아오고, run(main)이 끝나도 작업이 뒤에서 계속 돌았다(HEAD 코드로 Node에서 재현 — 400ms 동안 6번 더 돎).
// 단계는 tests/unit/lab/helpers/board-steps/asyncio.mjs. 가상 시각은 하한만 보거나 멈춘 시계로 정확히, [정지]는 진행(stopWhen)으로(C74 ②).
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf } from './helpers/pyodide-board.ts';

describe.skipIf(!boardPyodideReady)('가상 ESP32 보드 — asyncio·uasyncio(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/lab/helpers/board-steps/asyncio.mjs');

  it('MicroPython식 코드(import uasyncio as asyncio + await asyncio.sleep_ms)가 오류 없이 돌고, 가상 시계가 잔 만큼 늘어난다', () => {
    const record = stepOf(out, 'blink_sleep_ms');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    const [states, elapsed, name] = record.value as [number[], number, string];
    expect(states).toEqual([1, 0, 1]);
    expect(elapsed).toBeGreaterThanOrEqual(300);
    expect(name).toBe('asyncio');
  });

  it('이름: sleep_ms·sleep(MicroPython)과 진짜 asyncio의 이름(gather·Event)이 함께 있고, asyncio와 uasyncio는 같은 모듈이다', () => {
    const record = stepOf(out, 'names');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual(['sleep_ms', 'sleep', true, true, 'Event', true, true, true]);
  });

  it('값 규칙은 실물 core.py와 같다: sleep_ms는 정수만(소수면 TypeError)·2**29 ms 이상은 OverflowError·음수는 기다리지 않음, sleep(0, 값)은 그 값', () => {
    const record = stepOf(out, 'sleep_ms_rules');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual(["TypeError: can't convert float to int", 'OverflowError: ticks interval overflow', 'done']);
  });

  it('맨 바깥 await asyncio.sleep_ms(100)·sleep(0.25)는 멈춘 시계에서 정확히 350ms', () => {
    const record = stepOf(out, 'top_level_exact');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.thawError).toBeUndefined();
    expect(record.value).toBe(350);
  });

  it('await asyncio.sleep 무한 반복도 [정지]가 곧바로 KeyboardInterrupt — 콘솔에 트레이스백을 남기지 않는다', () => {
    const record = stepOf(out, 'stop_sleep_loop');
    expect(record.errorType).toBe('KeyboardInterrupt');
    expect(record.stopLatencyMs).toBeDefined();
    expect(record.stopLatencyMs!).toBeLessThan(2000);
    expect(record.stderr).not.toContain('Unhandled exception');
  });

  it('학생 코드가 진짜 Event만 기다려도 [정지]가 먹는다(run의 지켜보는 작업)', () => {
    const record = stepOf(out, 'stop_event_wait');
    expect(record.errorType).toBe('KeyboardInterrupt');
    expect(record.stopLatencyMs!).toBeLessThan(2000);
  });

  it('두 작업이 함께 자도(gather — 100ms×3, 30ms×10) 둘 다 끝나고 가상 시계가 거꾸로 가지 않는다', () => {
    const record = stepOf(out, 'gather_two');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    const [aCount, bCount, monotonic, last] = record.value as [number, number, boolean, number];
    expect([aCount, bCount, monotonic]).toEqual([3, 10, true]);
    expect(last).toBeGreaterThanOrEqual(300);
  });

  it('작업 넷이 서로 다른 주기(7·13·29·50ms)로 함께 자도 가상 시계(ticks_ms)가 한 번도 거꾸로 가지 않는다', () => {
    const record = stepOf(out, 'clock_monotonic_stress');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    const [count, back] = record.value as [number, [number, number][]];
    expect(count).toBe(226);
    expect(back, '앞 값보다 작아진 ticks_ms (앞, 뒤)').toEqual([]);
  });

  it('asyncio로 자는 동안 Timer 콜백이 주기마다 돈다(멈춘 시계 — 20ms 주기로 110ms 동안 다섯 번)', () => {
    const record = stepOf(out, 'timer_during_sleep');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.thawError).toBeUndefined();
    expect(record.value).toBe(5);
  });

  it('핀 인터럽트가 ThreadSafeFlag(MicroPython에만 있는 이름)로 기다리는 작업을 깨운다', () => {
    const record = stepOf(out, 'thread_safe_flag');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toBe('woke');
  });

  it('get_event_loop() + create_task + run_forever()는 [정지]까지 기다리고, [정지]로 끝나도 콘솔에 트레이스백을 남기지 않는다', () => {
    const record = stepOf(out, 'run_forever');
    // 전에는 run_forever가 곧바로 돌아와 실행이 'ok'로 끝나고 작업만 뒤에서 돌았다
    expect(record.errorType).toBe('KeyboardInterrupt');
    expect(record.stopLatencyMs!).toBeLessThan(2000);
    expect(record.stderr).not.toContain('Unhandled exception');
    expect(record.stderr).not.toContain('KeyboardInterrupt');
  });

  it('loop.stop()으로 run_forever가 끝난다', () => {
    const record = stepOf(out, 'run_forever_stop');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toBe('stopped by loop.stop()');
  });

  it('run(main)이 끝나면 main이 만든 작업도 멈추고, 맨 바깥에서 만든 작업도 실행이 끝나면 멈춘다 — 다음 실행에 끼어들지 않는다', () => {
    expect(stepOf(out, 'leftover_task').value).toBe('main done');
    expect(stepOf(out, 'leftover_after').value, 'run(main)이 끝난 뒤 400ms 동안 작업이 더 돌았어요').toBe(0);
    expect(stepOf(out, 'top_level_task').value).toBe('code done');
    expect(stepOf(out, 'top_level_after').value, '실행이 끝난 뒤 400ms 동안 작업이 더 돌았어요').toBe(0);
    // gather가 만든 자식도(판 1.2.1 — 검토 C1·C7): 한 자식이 예외로 끝나 run이 끝나면 남은 자식도 멈춘다
    const gathered = stepOf(out, 'gather_leftover');
    expect(gathered.errorType, gathered.errorMessage).toBeUndefined();
    expect(gathered.value).toBe('caught 센서 오류');
    expect(stepOf(out, 'gather_after').value, 'gather 자식이 run이 끝난 뒤 400ms 동안 더 돌았어요').toBe(0);
    const next = stepOf(out, 'next_run_clean');
    expect(next.errorType, next.errorMessage).toBeUndefined();
    expect(next.value).toBe(0);
  });

  it('[정지]가 아닌 작업 예외는 그대로 알리고(stderr — 실물의 "Task exception wasn\'t retrieved"처럼), 학생이 정한 예외 처리기에 간다', () => {
    const reported = stepOf(out, 'task_error_reported');
    expect(reported.value).toBe('main done');
    expect(reported.stderr).toContain('ZeroDivisionError');
    const handled = stepOf(out, 'user_exception_handler');
    expect(handled.errorType, handled.errorMessage).toBeUndefined();
    expect(handled.value).toEqual([['ZeroDivisionError'], true]);
  });
});

describe.skipIf(!boardPyodideReady)('가상 ESP32 보드 — asyncio(제한 모드 — JSPI 없는 브라우저, 실제 Pyodide)', () => {
  const out = runBoardSteps('tests/unit/lab/helpers/board-steps/asyncio-limited.mjs', { limited: true });

  it('맨 바깥 await asyncio.sleep_ms는 된다(블록 전용 호환 모드와 같은 wait_ns_async)', () => {
    const record = stepOf(out, 'limited_top_level_sleep');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toBeGreaterThanOrEqual(50);
  });

  it('asyncio.run은 끝날 때까지 기다릴 수 없어 제한 모드 안내(RuntimeError — 오류 사전 limited-mode)로 알린다', () => {
    const record = stepOf(out, 'limited_run');
    expect(record.errorType).toBe('RuntimeError');
    expect(record.errorMessage).toContain('JSPI');
    expect(record.stderr).not.toContain('never awaited');
  });
});
