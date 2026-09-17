// 블록 전용 호환 모드(PLAN PD-27 — P3-06) 자리(병렬 제작 준비 2026-09-17): 제한 모드(JSPI 없음)에서도 await apc_board.wait_ns_async가
// 가상 시계만큼 기다리며 화면 입력·Timer·[정지]를 받는다. 단계는 tests/unit/lab/helpers/board-steps/async-wait.mjs.
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf } from './helpers/pyodide-board.ts';

describe.skipIf(!boardPyodideReady)('가상 ESP32 보드 — 블록 전용 호환 모드의 기다리기(제한 모드, 실제 Pyodide)', () => {
  const out = runBoardSteps('tests/unit/lab/helpers/board-steps/async-wait.mjs', { limited: true });

  it('JSPI 없이 최상위 await로 기다리는 동안 BOOT 버튼 입력이 들어오고 가상 시계가 잔 만큼 늘어난다', () => {
    const record = stepOf(out, 'async_wait_inputs');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual([1, 0, true, true, false]);
  });

  it('기다리는 동안 Timer 콜백이 주기마다 돈다', () => {
    const record = stepOf(out, 'async_wait_timer');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toBeGreaterThanOrEqual(4);
    expect(record.value).toBeLessThanOrEqual(6);
  });

  it('[정지]는 기다리는 곳에서 곧바로 KeyboardInterrupt로 멈춘다', () => {
    const record = stepOf(out, 'async_wait_stop');
    expect(record.errorType).toBe('KeyboardInterrupt');
    expect(record.ms).toBeLessThan(2000);
  });
});
