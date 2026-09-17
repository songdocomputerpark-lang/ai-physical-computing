/**
 * 서보모터 부품의 순수 논리(DOM 없음 — tests/unit/lab/board-part-servo.test.ts). PLAN §6.1 PD-15 "가상 서보 환산", §6.2 "서보모터 2개".
 *
 * duty → 펄스 폭 → 각도: 핀 신호(PWM duty·주파수)로 한 번 켜진 시간(펄스 폭, ms) = duty ÷ 주파수 × 1000을 구하고, 프로필의 0°·180° 펄스 폭 사이를
 * 곧은 비율로 각도로 바꾼다(0° 아래·180° 위는 끝에 멈춘다). 프로필은 50Hz에서 쓰는 10비트 duty(0~1023)로 적는다(duty ÷ 1024 × 20ms).
 *   mg90s(기본)   duty 23 = 0°(0.449ms), 124 = 180°(2.422ms) — mg90s_servo·gorillacell_servo 라이브러리(f012·f003, 4단원) map(angle, 0, 180, 23, 124)
 *   servo40       duty 40 = 0°(0.781ms), 115 = 180°(2.246ms) — 교과서 2-2-4 servo_library(원고 174쪽) int(40 + angle / 180 × 75), 원고 173쪽 표 40·77~78·115
 * 어느 프로필을 쓸지는 파이썬 부품 흉내(apc_part_servo.py)가 이번 실행에서 부른 라이브러리로 알린다(board.device {profile}). 알림이 없으면 mg90s.
 * MG90S 실물의 펄스 폭 ↔ 각도는 확인 전이다(PLAN 부록 B-2 14번 — 두 라이브러리의 0·90·180 duty로 실물 각도 재기).
 *
 * 신호 판단(사이트가 정한 그림 규칙): PWM이 아니거나 duty 0 → 신호 없음(서보는 힘을 빼고 그 자리). 핀이 계속 1·주파수 500Hz 넘음·펄스 폭 0.3ms 미만이나
 * 3ms 초과 → 서보가 알아듣기 어려운 신호(각도를 정하지 않음). 그 밖은 각도.
 */
import { dutyRatioFromU10, roundTo, type PinSignal } from '../../ext/pwm/pwm-signal.ts';
import type { PartDeviceState } from '../../state.ts';

export type ServoProfileId = 'mg90s' | 'servo40';

export interface ServoProfile {
  readonly id: ServoProfileId;
  /** 0°일 때 50Hz 10비트 duty */
  readonly duty0: number;
  /** 180°일 때 50Hz 10비트 duty */
  readonly duty180: number;
  /** 사람이 읽는 설명 */
  readonly label: string;
}

export const SERVO_PROFILES: Readonly<Record<ServoProfileId, ServoProfile>> = Object.freeze({
  mg90s: { id: 'mg90s', duty0: 23, duty180: 124, label: '기본 기준(mg90s_servo 라이브러리: duty 23 = 0°, 124 = 180°)' },
  servo40: { id: 'servo40', duty0: 40, duty180: 115, label: '교과서 servo_library 기준(duty 40 = 0°, 115 = 180°)' },
});

export const SERVO_DEFAULT_PROFILE: ServoProfileId = 'mg90s';
/** 프로필의 duty를 펄스 폭으로 바꿀 때 쓰는 주파수(Hz) */
export const SERVO_REFERENCE_HZ = 50;
export const SERVO_PULSE_MIN_MS = 0.3;
export const SERVO_PULSE_MAX_MS = 3;
export const SERVO_FREQ_MAX_HZ = 500;

/** 50Hz에서 10비트 duty(0~1023)의 펄스 폭(ms) */
export function pulseMsForDuty10(duty10: number, freqHz = SERVO_REFERENCE_HZ): number {
  return (dutyRatioFromU10(duty10) / freqHz) * 1000;
}

/** 펄스 폭(ms) → 각도(0~180, 소수) */
export function angleForPulse(pulseMs: number, profile: ServoProfile): number {
  const p0 = pulseMsForDuty10(profile.duty0);
  const p180 = pulseMsForDuty10(profile.duty180);
  const angle = ((pulseMs - p0) / (p180 - p0)) * 180;
  return Math.min(180, Math.max(0, angle));
}

/** 파이썬 부품 흉내가 알린 장치 상태({ profile })에서 프로필 id(모르거나 없으면 기본) */
export function profileFromDevice(device: PartDeviceState | undefined): ServoProfileId {
  const state = device?.state;
  if (state && typeof state === 'object' && 'profile' in state) {
    const id = (state as { profile?: unknown }).profile;
    if (id === 'mg90s' || id === 'servo40') {
      return id;
    }
  }
  return SERVO_DEFAULT_PROFILE;
}

/** 장치 상태가 알려 준 라이브러리 이름(없으면 null) */
export function libraryFromDevice(device: PartDeviceState | undefined): string | null {
  const state = device?.state;
  if (state && typeof state === 'object' && 'library' in state) {
    const name = (state as { library?: unknown }).library;
    return typeof name === 'string' && name !== '' ? name : null;
  }
  return null;
}

export type ServoSignalState = 'angle' | 'no-signal' | 'unusual';

export interface ServoReading {
  readonly state: ServoSignalState;
  /** 정수로 반올림한 각도(state가 angle일 때만) */
  readonly angle: number | null;
  /** 펄스 폭(ms, 소수 둘째 자리) — PWM이고 주파수를 알 때 */
  readonly pulseMs: number | null;
}

export function servoReading(signal: PinSignal, profile: ServoProfile): ServoReading {
  const pulseMs = signal.pulseMs === null ? null : roundTo(signal.pulseMs, 2);
  if (signal.kind === 'off' || signal.kind === 'low' || (signal.kind === 'pwm' && !(signal.duty > 0))) {
    return { state: 'no-signal', angle: null, pulseMs: signal.kind === 'pwm' ? pulseMs : null };
  }
  if (
    signal.kind === 'high' ||
    signal.duty >= 1 ||
    signal.freq === null ||
    signal.freq > SERVO_FREQ_MAX_HZ ||
    signal.pulseMs === null ||
    signal.pulseMs < SERVO_PULSE_MIN_MS ||
    signal.pulseMs > SERVO_PULSE_MAX_MS
  ) {
    return { state: 'unusual', angle: null, pulseMs };
  }
  return { state: 'angle', angle: Math.round(angleForPulse(signal.pulseMs, profile)), pulseMs };
}

/** 그림·화면 낭독기 글 */
export function servoSummary(reading: ServoReading, profile: ServoProfile): string {
  if (reading.state === 'angle') {
    return `약 ${reading.angle}° — 펄스 ${reading.pulseMs?.toFixed(2)}ms, ${profile.label}`;
  }
  if (reading.state === 'unusual') {
    return '서보가 알아듣기 어려운 신호예요 — 서보는 보통 50Hz PWM의 펄스 폭(0.5~2.5ms쯤)으로 각도를 정해요.';
  }
  return '신호 없음 — 서보가 힘을 빼고 마지막 자리에 있어요.';
}
