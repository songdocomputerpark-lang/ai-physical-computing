/**
 * 출력 핀 하나의 신호 읽기(순수 논리 — DOM 없음). 구역 A(P3-03)의 부품(버저·서보·팬 모터)이 board.state 핀 항목에서 "지금 핀에 무엇이 나가는지"를
 * 같은 규칙으로 읽으려고 둔다. 파이썬 쪽 PWM 흉내는 같은 폴더의 apc_board_pwm.py(BOARD.set_pwm → 핀 항목 mode 'pwm'·duty·freq, README 7.3).
 *
 * 신호 종류
 *   off   보드가 멈췄거나(phase stopped) 핀이 전기를 내보내지 않음(입력·정하지 않음·Pin(…, Pin.IN))
 *   low   출력 0(LOW)
 *   high  출력 1(HIGH) — 계속 켜짐
 *   pwm   PWM 출력: duty(켜진 시간 비율 0~1)·freq(Hz). duty 0이면 low와 같은 전압, 1이면 high와 같은 전압이지만 종류는 pwm으로 둔다
 */
import { isLive, type BoardSnapshot } from '../../state.ts';

export type PinSignalKind = 'off' | 'low' | 'high' | 'pwm';

export interface PinSignal {
  readonly kind: PinSignalKind;
  /** 켜진 시간 비율(0~1): off·low는 0, high는 1, pwm은 duty */
  readonly duty: number;
  /** PWM 주파수(Hz) — pwm이 아니거나 모르면 null */
  readonly freq: number | null;
  /** 한 번 켜진 시간(밀리초, 펄스 폭 = duty ÷ 주파수) — pwm이고 주파수를 알 때만 */
  readonly pulseMs: number | null;
}

export const SIGNAL_OFF: PinSignal = Object.freeze({ kind: 'off', duty: 0, freq: null, pulseMs: null });

/** 스냅샷에서 한 GPIO의 신호를 읽는다(gpio가 없으면 off) */
export function pinSignal(snapshot: BoardSnapshot, gpio: number | undefined): PinSignal {
  if (gpio === undefined || !isLive(snapshot)) {
    return SIGNAL_OFF;
  }
  const pin = snapshot.pins.get(gpio);
  if (!pin || !pin.driven) {
    return SIGNAL_OFF;
  }
  if (pin.duty !== undefined) {
    const freq = pin.freq !== undefined && pin.freq > 0 ? pin.freq : null;
    return { kind: 'pwm', duty: pin.duty, freq, pulseMs: freq === null ? null : (pin.duty / freq) * 1000 };
  }
  return pin.level === 1 ? { kind: 'high', duty: 1, freq: null, pulseMs: null } : { kind: 'low', duty: 0, freq: null, pulseMs: null };
}

/** duty(0~1023) → 켜진 시간 비율: 1023은 100%(MicroPython ESP32 machine_pwm.c가 1024로 바꿔 넣음), 나머지는 ÷ 1024 */
export function dutyRatioFromU10(duty: number): number {
  if (!Number.isFinite(duty) || duty <= 0) {
    return 0;
  }
  return duty >= 1023 ? 1 : duty / 1024;
}

/** 소수 자리 반올림(표시용) */
export function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
