// 가상 보드 콜백 대기열과 Timer.deinit(2026-09-25, PROGRESS 미해결 181) — 콜백 안에서 Timer를 멈추면 그 Timer가 이미 쌓아 둔
// 콜백은 돌지 않는다(블루투스 연결 뒤 상태 LED가 다시 꺼지던 것). 단계는 helpers/board-steps/timer-queue.mjs, 실행은 Node의 실제 Pyodide(JSPI).
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf } from './helpers/pyodide-board.ts';

describe.skipIf(!boardPyodideReady)('가상 ESP32 보드 — 콜백 대기열과 Timer.deinit(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/lab/helpers/board-steps/timer-queue.mjs');

  it('콜백 안에서 deinit하면 그 Timer의 쌓인 콜백만 빠지고 다른 콜백은 돈다', () => {
    const record = stepOf(out, 'deinit_in_callback_drops_queued');
    expect(record.errorType).toBeUndefined();
    const [led, other, pending, valueOk] = record.value as [number, string[], number, boolean];
    expect(led).toBe(1);
    expect(other).toEqual(['irq']);
    expect(pending).toBe(0);
    expect(valueOk).toBe(true);
  });

  it('콜백 밖(학생 코드)에서 deinit하면 대기열을 건드리지 않는다', () => {
    const record = stepOf(out, 'deinit_outside_callback_keeps_queue');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([1, 1]);
  });

  it('ESP32BLE.py 모양: 연결 콜백이 깜빡임 콜백보다 먼저 쌓여도 상태 LED는 켜진 채로 남는다', () => {
    const record = stepOf(out, 'esp32ble_connected_keeps_led_on');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([1, 1]);
  });
});
