// 가상 블루투스(BLE) — 값이 보드가 처리하는 것보다 빨리 올 때의 알림 글(판 1.1.1 최종 점검, fix-plan R-CT10). Node의 실제 Pyodide(JSPI).
// 단계는 steps/ble-irq-overflow.mjs, 도구는 tests/unit/lab/helpers/pyodide-board.ts(공유 도우미는 고치지 않는다).
//
// 전에는 "처리할 자리가 가득 차 앞의 몇 개를 버렸어요. 실물 보드도 자리가 차면 버려요"라 값이 사라진 것처럼 읽혔고, 실물 쪽 말은 확인하지 않은 말이었다.
// 실제로 버려지는 것은 IRQ 알림(콜백 부름)뿐이고, 값은 한 칸에 덮어써져 나중에 읽으면 가장 새 값이 나온다 — 그 사실을 이 검사가 함께 본다.
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf } from '../lab/helpers/pyodide-board.ts';

/** steps/ble-irq-overflow.mjs가 한 번에 몰아 쓰는 값 개수 */
const FLOOD_COUNT = 12;
/** 콜백 대기열 칸 수(apc_board.SCHEDULER_DEPTH — 실물 micropython.schedule 대기열과 같은 8) */
const SCHEDULER_DEPTH = 8;

describe.skipIf(!boardPyodideReady)('가상 블루투스(BLE) — 알림이 넘칠 때(실제 Pyodide)', () => {
  const out = runBoardSteps('tests/unit/board-ble/steps/ble-irq-overflow.mjs');

  it('대기열이 차면 IRQ 알림 몇 개만 건너뛰고, 값은 한 칸에 덮어써져 읽으면 가장 새 값이 나온다', () => {
    const record = stepOf(out, 'ble_irq_overflow');
    expect(record.errorType).toBeUndefined();
    const [calls, last] = record.value as [string[], string];
    // 콜백은 대기열 칸 수만큼만 불렸다(나머지 알림은 건너뜀)
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.length).toBeLessThan(FLOOD_COUNT);
    expect(calls.length).toBeLessThanOrEqual(SCHEDULER_DEPTH);
    // 값은 사라지지 않았다 — 한 칸에 마지막 값이 남아 있고, 콜백도 읽으면 가장 새 값을 읽는다
    expect(last).toBe(`v${FLOOD_COUNT}`);
    expect(calls.at(-1)).toBe(`v${FLOOD_COUNT}`);
  });

  it('알림 글은 버려진 것이 "값이 왔어요" 알림이라고 말하고, 값이 사라졌다거나 확인하지 않은 실물 이야기를 하지 않는다', () => {
    const record = stepOf(out, 'ble_irq_overflow');
    const notices = record.notices.filter((text) => text.includes('보드가 처리하는 것보다 빨리 와서'));
    // 한 번만 알린다(warn_once)
    expect(notices).toHaveLength(1);
    const text = notices[0] ?? '';
    // 차시 3-1-3이 인용하는 앞부분("[알림] 블루투스… 보드가 처리하는 것보다 빨리 와서…") — 글을 바꿀 때 차시와 함께 본다
    expect(text.startsWith('블루투스')).toBe(true);
    expect(text).toContain("'값이 왔어요' 알림 몇 개를 건너뛰었어요");
    expect(text).toContain('가장 새 값');
    expect(text).not.toContain('앞의 몇 개를 버렸어요');
    expect(text).not.toContain('실물 보드도');
  });
});
