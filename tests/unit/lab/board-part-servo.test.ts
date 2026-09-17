// 부품 servo(서보모터) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", PLAN §6.1 PD-15(duty → 펄스 폭 → 각도, 프로필 2종)·§8.3 P3-03.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pinSignal } from '../../../src/lab/modules/board/ext/pwm/pwm-signal.ts';
import { snapshotAfterRun } from '../../../src/lab/modules/board/index.ts';
import { PART_DEFINITIONS, resolveWiring } from '../../../src/lab/modules/board/parts.ts';
import servo from '../../../src/lab/modules/board/parts/servo/part.ts';
import {
  SERVO_PROFILES,
  angleForPulse,
  libraryFromDevice,
  profileFromDevice,
  pulseMsForDuty10,
  servoReading,
  servoSummary,
} from '../../../src/lab/modules/board/parts/servo/servo-model.ts';
import { instanceOf, snapshotWith } from './helpers/board-snapshot.ts';

const instance = instanceOf('servo', { sig: 25 }, { usesDefaultPins: false });

/** 50Hz PWM 10비트 duty를 board.state 핀 항목(duty는 여섯째 자리 반올림 — apc_board.py pin_entry)으로 */
function servoPin(duty10: number, freq = 50) {
  const ratio = duty10 >= 1023 ? 1 : duty10 / 1024;
  return { id: 25, mode: 'pwm', out: 0, level: ratio > 0 ? 1 : 0, driven: true, duty: Math.round(ratio * 1e6) / 1e6, freq };
}

function angleOf(duty10: number, profile: 'mg90s' | 'servo40', freq = 50) {
  return servoReading(pinSignal(snapshotWith([servoPin(duty10, freq)]), 25), SERVO_PROFILES[profile]);
}

describe('부품: 서보모터(servo)', () => {
  it('바깥 출력 부품: 신호 1핀, 기본 핀 없음(25·26·32 — 예제마다), 파이썬 부품 흉내 apc_part_servo가 같은 폴더에 있다', () => {
    expect(servo.pins).toEqual([{ role: 'sig', label: '신호', direction: 'out' }]);
    expect(servo.defaultPins).toBeUndefined();
    expect(servo.python).toBe('apc_part_servo');
    expect(fs.existsSync(path.join(process.cwd(), 'src', 'lab', 'modules', 'board', 'parts', 'servo', 'apc_part_servo.py'))).toBe(true);
  });

  it('PD-15 프로필: mg90s(duty 23 = 0°, 124 = 180°)·servo40(duty 40 = 0°, 115 = 180°), 50Hz 펄스 폭으로 환산', () => {
    expect(SERVO_PROFILES.mg90s).toMatchObject({ duty0: 23, duty180: 124 });
    expect(SERVO_PROFILES.servo40).toMatchObject({ duty0: 40, duty180: 115 });
    expect(pulseMsForDuty10(40)).toBe(0.78125);
    expect(pulseMsForDuty10(1023)).toBe(20);
    expect(angleForPulse(pulseMsForDuty10(40), SERVO_PROFILES.servo40)).toBe(0);
    expect(angleForPulse(pulseMsForDuty10(115), SERVO_PROFILES.servo40)).toBeCloseTo(180, 6);
    expect(angleForPulse(pulseMsForDuty10(77.5), SERVO_PROFILES.servo40)).toBeCloseTo(90, 6);
    // 범위 밖 펄스는 끝에서 멈춘다
    expect(angleForPulse(0.5, SERVO_PROFILES.servo40)).toBe(0);
    expect(angleForPulse(2.5, SERVO_PROFILES.servo40)).toBe(180);
  });

  it('교과서 duty 그대로: servo_library rotate(0·90·180) = duty 40·77·115 → 0°·89°·180°, mg90s_servo map(0·90·180) = 23·73·124 → 0°·89°·180°', () => {
    expect([40, 77, 115].map((duty) => angleOf(duty, 'servo40'))).toEqual([
      { state: 'angle', angle: 0, pulseMs: 0.78 },
      { state: 'angle', angle: 89, pulseMs: 1.5 },
      { state: 'angle', angle: 180, pulseMs: 2.25 },
    ]);
    expect([23, 73, 124].map((duty) => angleOf(duty, 'mg90s').angle)).toEqual([0, 89, 180]);
    // 같은 duty 40이 mg90s 기준으로는 30°쯤 — 프로필이 왜 필요한지
    expect(angleOf(40, 'mg90s').angle).toBe(30);
  });

  it('신호 판단: duty 0·출력 0·입력·[정지]는 신호 없음, 핀이 계속 1·duty 100 %·500Hz 넘음·펄스 0.3ms 미만이나 3ms 초과는 알아듣기 어려운 신호', () => {
    expect(angleOf(0, 'servo40').state).toBe('no-signal');
    const low = snapshotWith([{ id: 25, mode: 'out', out: 0, level: 0, driven: true }]);
    expect(servoReading(pinSignal(low, 25), SERVO_PROFILES.mg90s).state).toBe('no-signal');
    const high = snapshotWith([{ id: 25, mode: 'out', out: 1, level: 1, driven: true }]);
    expect(servoReading(pinSignal(high, 25), SERVO_PROFILES.mg90s).state).toBe('unusual');
    expect(angleOf(1023, 'servo40').state).toBe('unusual');
    expect(angleOf(512, 'servo40').state).toBe('unusual'); // 50Hz duty 50 % = 펄스 10ms(새 PWM의 기본 duty)
    expect(angleOf(77, 'servo40', 1000).state).toBe('unusual');
    expect(angleOf(10, 'servo40').state).toBe('unusual'); // 0.2ms
    const on = snapshotWith([servoPin(77)]);
    expect(servoReading(pinSignal(snapshotAfterRun(on, { outcome: 'stopped' }), 25), SERVO_PROFILES.servo40).state).toBe('no-signal');
  });

  it('프로필은 파이썬이 알린 장치 상태(board.device {profile, library})에서, 없거나 모르면 기본 mg90s', () => {
    expect(profileFromDevice(undefined)).toBe('mg90s');
    expect(profileFromDevice({ seq: 1, state: { profile: 'servo40', library: 'servo_library' } })).toBe('servo40');
    expect(profileFromDevice({ seq: 1, state: { profile: 'nope' } })).toBe('mg90s');
    expect(libraryFromDevice({ seq: 2, state: { profile: 'servo40', library: 'servo_library' } })).toBe('servo_library');
    const snapshot = snapshotWith([servoPin(77)]);
    // 알림이 없으면 기본 mg90s: duty 77(1.50ms)은 mg90s 기준 약 96°
    expect(servo.visual({ snapshot, instance, active: false, reducedMotion: false })).toMatchObject({ signal: 'angle', angle: 96, profile: 'mg90s' });
    expect(servo.visual({ snapshot, instance, active: false, reducedMotion: false, device: { seq: 1, state: { profile: 'servo40', library: 'servo_library' } } })).toEqual({
      signal: 'angle',
      angle: 89,
      pulseMs: 1.5,
      profile: 'servo40',
      summary: `약 89° — 펄스 1.50ms, ${SERVO_PROFILES.servo40.label}`,
    });
    expect(servo.visual({ snapshot: snapshotWith([servoPin(0)]), instance, active: false, reducedMotion: false })).toMatchObject({ signal: 'no-signal', angle: -1 });
    expect(servoSummary({ state: 'unusual', angle: null, pulseMs: 10 }, SERVO_PROFILES.mg90s)).toContain('50Hz');
  });

  it('예제 배선: 원고 2-2-4 서보 1개(GPIO25)·2개(25·26, 배선 이름 servo-1·servo-2)는 문제 없음', () => {
    const one = resolveWiring([{ part: 'servo', pin: 25 }], PART_DEFINITIONS);
    expect(one.issues.filter((issue) => issue.level !== 'info')).toEqual([]);
    const two = resolveWiring(
      [
        { part: 'servo', id: 'servo-1', pin: 25, label: '서보모터 1' },
        { part: 'servo', id: 'servo-2', pin: 26, label: '서보모터 2' },
      ],
      PART_DEFINITIONS,
    );
    expect(two.issues.filter((issue) => issue.level !== 'info')).toEqual([]);
    expect(two.instances.filter((item) => item.part === 'servo').map((item) => [item.id, item.pins.sig, item.label])).toEqual([
      ['servo-1', 25, '서보모터 1'],
      ['servo-2', 26, '서보모터 2'],
    ]);
  });
});
