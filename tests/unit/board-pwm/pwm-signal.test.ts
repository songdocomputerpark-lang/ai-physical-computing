// 구역 A(P3-03) — 출력 핀 신호 읽기(src/lab/modules/board/ext/pwm/pwm-signal.ts). 버저·서보·팬 모터 부품이 함께 쓰는 순수 함수.
import { describe, expect, it } from 'vitest';
import { SIGNAL_OFF, dutyRatioFromU10, pinSignal, roundTo } from '../../../src/lab/modules/board/ext/pwm/pwm-signal.ts';
import { stoppedSnapshot } from '../../../src/lab/modules/board/state.ts';
import { snapshotWith } from '../lab/helpers/board-snapshot.ts';

describe('출력 핀 신호 읽기(pinSignal)', () => {
  it('출력 0·1은 low·high, 입력·정하지 않음·없는 핀·배선에 없는 역할은 off', () => {
    const snapshot = snapshotWith([
      { id: 2, mode: 'out', out: 1, level: 1, driven: true },
      { id: 4, mode: 'out', out: 0, level: 0, driven: true },
      { id: 5, mode: 'in', out: 1, level: 1, driven: false },
    ]);
    expect(pinSignal(snapshot, 2)).toEqual({ kind: 'high', duty: 1, freq: null, pulseMs: null });
    expect(pinSignal(snapshot, 4)).toEqual({ kind: 'low', duty: 0, freq: null, pulseMs: null });
    expect(pinSignal(snapshot, 5)).toBe(SIGNAL_OFF);
    expect(pinSignal(snapshot, 18)).toBe(SIGNAL_OFF);
    expect(pinSignal(snapshot, undefined)).toBe(SIGNAL_OFF);
  });

  it('PWM이면 duty·주파수·펄스 폭(duty ÷ 주파수), [정지] 뒤에는 off', () => {
    const snapshot = snapshotWith([{ id: 25, mode: 'pwm', out: 0, level: 1, driven: true, duty: 0.075195, freq: 50 }]);
    const signal = pinSignal(snapshot, 25);
    expect(signal.kind).toBe('pwm');
    expect(signal.duty).toBe(0.075195);
    expect(signal.freq).toBe(50);
    expect(signal.pulseMs).toBeCloseTo(1.5039, 4);
    expect(pinSignal(stoppedSnapshot(snapshot), 25)).toBe(SIGNAL_OFF);
    // 코드가 스스로 끝나면(end) 마지막 신호가 남는다
    expect(pinSignal(snapshotWith([{ id: 25, mode: 'pwm', out: 0, level: 1, driven: true, duty: 0.5, freq: 50 }], 'end'), 25).kind).toBe('pwm');
  });

  it('duty(0~1023) → 비율: 1023은 100 %(실물이 1024로 바꿔 넣음), 나머지는 ÷ 1024', () => {
    expect(dutyRatioFromU10(0)).toBe(0);
    expect(dutyRatioFromU10(512)).toBe(0.5);
    expect(dutyRatioFromU10(40)).toBe(40 / 1024);
    expect(dutyRatioFromU10(1023)).toBe(1);
    expect(dutyRatioFromU10(-3)).toBe(0);
    expect(roundTo(1.23456, 2)).toBe(1.23);
  });
});
