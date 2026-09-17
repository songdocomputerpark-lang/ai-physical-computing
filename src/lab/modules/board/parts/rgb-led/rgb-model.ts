/**
 * RGB LED 부품의 순수 논리(DOM 없음 — tests/unit/lab/board-part-rgb-led.test.ts).
 * 색마다 켜진 세기(0~100 %)는 state.ts outputStrength(HIGH 출력 100, PWM이면 duty, 멈춤·출력 아님 0)에서 온다.
 */
import { outputStrength, type BoardSnapshot } from '../../state.ts';

export type RgbRole = 'r' | 'g' | 'b';

export interface RgbLevels {
  /** 빨강·초록·파랑 세기(0~100 %). 0보다 조금이라도 켜져 있으면 1 이상 */
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** 0~1 세기 → 0~100 %(아주 작은 PWM duty도 0 %로 버리지 않는다 — duty(1)은 1 %) */
export function percentOf(strength: number): number {
  if (!(strength > 0)) {
    return 0;
  }
  return Math.min(100, Math.max(1, Math.round(strength * 100)));
}

/** 스냅샷에서 세 색의 세기를 읽는다(배선에 없는 색은 0) */
export function rgbLevels(snapshot: BoardSnapshot, pins: Readonly<Record<string, number>>): RgbLevels {
  const level = (role: RgbRole) => {
    const gpio = pins[role];
    return gpio === undefined ? 0 : percentOf(outputStrength(snapshot, gpio));
  };
  return { r: level('r'), g: level('g'), b: level('b') };
}

function channel(percent: number): string {
  // 눈에 보이는 밝기에 가깝게(어두운 PWM도 알아보게) 제곱근으로 펴서 0~255
  const value = percent <= 0 ? 0 : Math.round(255 * Math.sqrt(percent / 100));
  return value.toString(16).padStart(2, '0');
}

/** 세 색을 섞은 화면 색(#rrggbb). 모두 꺼지면 #000000 */
export function mixedColor(levels: RgbLevels): string {
  return `#${channel(levels.r)}${channel(levels.g)}${channel(levels.b)}`;
}

/** 켜진 색의 이름(색만으로 알리지 않게 글자로도): 빨강·초록·파랑·노랑·자홍·청록·흰색·꺼짐 */
export function colorName(levels: RgbLevels): string {
  const on = [levels.r > 0, levels.g > 0, levels.b > 0] as const;
  const key = on.map((value) => (value ? '1' : '0')).join('');
  const names: Readonly<Record<string, string>> = {
    '000': '꺼짐',
    '100': '빨강',
    '010': '초록',
    '001': '파랑',
    '110': '노랑',
    '101': '자홍',
    '011': '청록',
    '111': '흰색',
  };
  return names[key] ?? '꺼짐';
}

/** 부품 모습: 색마다 %, lit(하나라도 켜짐), brightness(가장 밝은 색 %), color(섞인 색), name(색 이름), summary(화면 낭독기 글) */
export function rgbVisual(levels: RgbLevels): { r: number; g: number; b: number; lit: boolean; brightness: number; color: string; name: string; summary: string } {
  const brightness = Math.max(levels.r, levels.g, levels.b);
  const name = colorName(levels);
  return {
    r: levels.r,
    g: levels.g,
    b: levels.b,
    lit: brightness > 0,
    brightness,
    color: mixedColor(levels),
    name,
    summary: `${name} — 빨강 ${levels.r}% · 초록 ${levels.g}% · 파랑 ${levels.b}%`,
  };
}
