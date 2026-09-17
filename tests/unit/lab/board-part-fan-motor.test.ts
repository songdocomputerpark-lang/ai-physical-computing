// 부품 fan-motor(팬 모터) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", PLAN §6.2 "팬 모터 | INA·INB 디지털 진리표, PWM duty → 속도"·§8.3 P3-03.
import { describe, expect, it } from 'vitest';
import { pinSignal, type PinSignal } from '../../../src/lab/modules/board/ext/pwm/pwm-signal.ts';
import { snapshotAfterRun } from '../../../src/lab/modules/board/index.ts';
import { partAnchors } from '../../../src/lab/modules/board/layout.ts';
import { PART_DEFINITIONS, resolveWiring } from '../../../src/lab/modules/board/parts.ts';
import { fanDrive, fanStateText, fanSummary } from '../../../src/lab/modules/board/parts/fan-motor/fan-model.ts';
import fan from '../../../src/lab/modules/board/parts/fan-motor/part.ts';
import { instanceOf, snapshotWith } from './helpers/board-snapshot.ts';

const instance = instanceOf('fan-motor', { ina: 25, inb: 26 });

const HIGH: PinSignal = { kind: 'high', duty: 1, freq: null, pulseMs: null };
const LOW: PinSignal = { kind: 'low', duty: 0, freq: null, pulseMs: null };
const OFF: PinSignal = { kind: 'off', duty: 0, freq: null, pulseMs: null };
const pwm = (duty: number): PinSignal => ({ kind: 'pwm', duty, freq: 1000, pulseMs: duty });

function digital(ina: 0 | 1, inb: 0 | 1) {
  return snapshotWith([
    { id: 25, mode: 'out', out: ina, level: ina, driven: true },
    { id: 26, mode: 'out', out: inb, level: inb, driven: true },
  ]);
}

describe('부품: 팬 모터(fan-motor)', () => {
  it('바깥 출력 부품: INA·INB 2핀, 기본 핀 25·26(원고 168~172쪽), 신호 자리는 윗변 9·27', () => {
    expect(fan.pins).toEqual([
      { role: 'ina', label: 'INA', direction: 'out' },
      { role: 'inb', label: 'INB', direction: 'out' },
    ]);
    expect(fan.defaultPins).toEqual({ ina: 25, inb: 26 });
    expect(partAnchors(fan)).toEqual({ ina: { x: 9, y: 0 }, inb: { x: 27, y: 0 } });
  });

  it('원고 진리표: (1,0) 정회전, (0,1) 역회전, (0,0) 정지, (1,1)도 멈춤(브레이크) — 출력이 아닌 핀은 0', () => {
    expect(fanDrive(HIGH, LOW)).toEqual({ direction: 'cw', speed: 100, brake: false });
    expect(fanDrive(LOW, HIGH)).toEqual({ direction: 'ccw', speed: 100, brake: false });
    expect(fanDrive(LOW, LOW)).toEqual({ direction: 'stop', speed: 0, brake: false });
    expect(fanDrive(HIGH, HIGH)).toEqual({ direction: 'stop', speed: 0, brake: true });
    expect(fanDrive(HIGH, OFF)).toEqual({ direction: 'cw', speed: 100, brake: false });
    expect(fanStateText(fanDrive(HIGH, HIGH))).toBe('멈춤(둘 다 1)');
    expect(fanSummary(fanDrive(LOW, HIGH))).toBe('역회전(반시계 방향) 속도 100%');
  });

  it('PWM(원고 gorillacell_dcmotors PWM판: 한 핀 duty·다른 핀 0): 속도 = duty 차이 %, 방향 = 큰 쪽', () => {
    expect(fanDrive(pwm(307 / 1024), pwm(0))).toEqual({ direction: 'cw', speed: 30, brake: false });
    expect(fanDrive(pwm(0), pwm(716 / 1024))).toEqual({ direction: 'ccw', speed: 70, brake: false });
    expect(fanDrive(pwm(0.004), LOW)).toMatchObject({ direction: 'cw', speed: 1 });
    expect(fanDrive(pwm(0.5), pwm(0.5))).toEqual({ direction: 'stop', speed: 0, brake: true });
    expect(fanStateText(fanDrive(pwm(0.7), LOW))).toBe('정회전 70%');
    expect(fanStateText(fanDrive(HIGH, LOW))).toBe('정회전');
  });

  it('모습 값: 방향·속도·브레이크, 돌면 spin(움직임 줄이기면 still), [정지]면 멈춤', () => {
    expect(fan.visual({ snapshot: digital(1, 0), instance, active: false, reducedMotion: false })).toEqual({
      direction: 'cw',
      speed: 100,
      brake: false,
      motion: 'spin',
      summary: '정회전(시계 방향) 속도 100%',
    });
    expect(fan.visual({ snapshot: digital(0, 1), instance, active: false, reducedMotion: true })).toMatchObject({ direction: 'ccw', motion: 'still' });
    expect(fan.visual({ snapshot: digital(0, 0), instance, active: false, reducedMotion: false })).toMatchObject({ direction: 'stop', motion: 'still' });
    expect(fan.visual({ snapshot: snapshotAfterRun(digital(1, 0), { outcome: 'stopped' }), instance, active: false, reducedMotion: false })).toMatchObject({ direction: 'stop', speed: 0 });
    const signal = pinSignal(digital(1, 0), 25);
    expect(signal.kind).toBe('high');
  });

  it('예제 배선: 원고 f073(INA 25·INB 26)은 문제 없음, 핀을 적지 않으면 기본 핀, 핀 하나 줄임 표기는 오류', () => {
    const f073 = resolveWiring([{ part: 'fan-motor', pins: { ina: 25, inb: 26 } }], PART_DEFINITIONS);
    expect(f073.issues.filter((issue) => issue.level !== 'info')).toEqual([]);
    const defaults = resolveWiring([{ part: 'fan-motor' }], PART_DEFINITIONS);
    expect(defaults.instances.find((item) => item.part === 'fan-motor')).toMatchObject({ pins: { ina: 25, inb: 26 }, usesDefaultPins: true });
    expect(defaults.issues.filter((issue) => issue.code === 'site-assigned')).toEqual([]);
    const shorthand = resolveWiring([{ part: 'fan-motor', pin: 25 }], PART_DEFINITIONS);
    expect(shorthand.issues.map((issue) => issue.code)).toContain('pin-shorthand');
  });
});
