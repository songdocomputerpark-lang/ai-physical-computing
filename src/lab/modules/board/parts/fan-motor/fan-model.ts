/**
 * 팬 모터 부품의 순수 논리(DOM 없음 — tests/unit/lab/board-part-fan-motor.test.ts). PLAN §6.2 "팬 모터 | INA·INB 디지털 진리표, PWM duty → 속도".
 *
 * 진리표(원고 168~169쪽 "팬 모터의 회전 방향" 표): INA 1·INB 0 = 정회전(시계 방향), INA 0·INB 1 = 역회전(반시계 방향), 0·0 = 정지.
 * 두 핀이 모두 1이면 모터 양쪽 전압이 같아 멈춘다(브레이크 — 모터 드라이버의 흔한 동작, 키트 모듈에서는 확인 전).
 * PWM(원고 169쪽 gorillacell_dcmotors PWM판: 한 핀 duty, 다른 핀 0): 핀마다 켜진 시간 비율(0~1)을 전압 비율로 보고
 * 속도 = |INA 비율 − INB 비율| × 100 %, 방향 = 큰 쪽. 실물 팬은 속도가 너무 낮으면 멈춰 있을 수 있다(가상 팬은 비율 그대로 돈다 — 교사용).
 * 출력이 아닌 핀(입력·정하지 않음·[정지])은 0으로 본다.
 */
import type { PinSignal } from '../../ext/pwm/pwm-signal.ts';

export type FanDirection = 'cw' | 'ccw' | 'stop';

export interface FanDrive {
  readonly direction: FanDirection;
  /** 속도(0~100 %). 조금이라도 돌면 1 이상 */
  readonly speed: number;
  /** 두 핀이 모두 켜져 멈춘 것(브레이크)인지 */
  readonly brake: boolean;
}

function levelOf(signal: PinSignal): number {
  return signal.kind === 'off' ? 0 : Math.min(1, Math.max(0, signal.duty));
}

export function fanDrive(ina: PinSignal, inb: PinSignal): FanDrive {
  const a = levelOf(ina);
  const b = levelOf(inb);
  const net = a - b;
  const magnitude = Math.abs(net);
  const speed = magnitude > 0 ? Math.min(100, Math.max(1, Math.round(magnitude * 100))) : 0;
  const direction: FanDirection = speed === 0 ? 'stop' : net > 0 ? 'cw' : 'ccw';
  return { direction, speed, brake: speed === 0 && a > 0 && b > 0 };
}

const DIRECTION_TEXT: Readonly<Record<FanDirection, string>> = Object.freeze({ cw: '정회전', ccw: '역회전', stop: '멈춤' });

/** 그림 글: "정회전 70%" · "역회전" · "멈춤" */
export function fanStateText(drive: FanDrive): string {
  if (drive.direction === 'stop') {
    return drive.brake ? '멈춤(둘 다 1)' : '멈춤';
  }
  return `${DIRECTION_TEXT[drive.direction]}${drive.speed < 100 ? ` ${drive.speed}%` : ''}`;
}

/** 화면 낭독기 글 */
export function fanSummary(drive: FanDrive): string {
  if (drive.direction === 'stop') {
    return drive.brake ? '멈춤 — INA와 INB가 모두 1이라 모터 양쪽 전압이 같아요.' : '멈춤';
  }
  const way = drive.direction === 'cw' ? '시계 방향' : '반시계 방향';
  return `${DIRECTION_TEXT[drive.direction]}(${way}) 속도 ${drive.speed}%`;
}
