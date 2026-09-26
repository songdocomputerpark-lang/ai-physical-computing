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

/**
 * 흰색으로 보는 문턱: 가장 약한 색이 가장 센 색의 이만큼(75 %) 넘게 켜져 있으면 세 빛이 거의 같아 흰색이다
 * (채도 (최대 − 최소) ÷ 최대 < 0.25).
 */
export const WHITE_SATURATION = 0.25;

/**
 * 색상환 각도(0~360도) → 이름. 빛의 삼원색(빨강 0·초록 120·파랑 240)과 둘씩 같게 섞은 색(노랑 60·청록 180·자홍 300) 사이에
 * 주황(30)·연두(90)·보라(270)를 두고, 이웃한 두 이름의 가운데에서 나눈다. 2-1-5 무지개 표(원고 150쪽)의
 * 주황 (255, 94, 0) = 22도, 노랑 (255, 228, 0) = 54도, 보라 (95, 0, 255) = 262도가 저마다 제 이름으로 들어간다.
 */
const HUE_NAMES: readonly (readonly [number, string])[] = [
  [15, '빨강'],
  [45, '주황'],
  [75, '노랑'],
  [105, '연두'],
  [150, '초록'],
  [210, '청록'],
  [255, '파랑'],
  [285, '보라'],
  [345, '자홍'],
  [360, '빨강'],
];

/** 세 색 세기 → 색상환 각도(0 이상 360 미만). 모두 같으면(무채색) null */
export function hueOf(levels: RgbLevels): number | null {
  const { r, g, b } = levels;
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  if (!(chroma > 0)) {
    return null;
  }
  let sector: number;
  if (max === r) {
    sector = (g - b) / chroma;
  } else if (max === g) {
    sector = (b - r) / chroma + 2;
  } else {
    sector = (r - g) / chroma + 4;
  }
  return (((sector * 60) % 360) + 360) % 360;
}

/**
 * 켜진 색의 이름(색만으로 알리지 않게 글자로도): 빨강·주황·노랑·연두·초록·청록·파랑·보라·자홍·흰색·꺼짐.
 * 세 색의 **켜진 세기 비율**로 정한다(2026-09-26 PROGRESS 미해결 176 — 전에는 켜졌는지만 보아 주황 (255, 94, 0)도 "노랑"이었다).
 * 비율이 같으면 밝기와 상관없이 이름이 같다: (255, 0, 0)과 (30, 0, 0)은 모두 "빨강", 남색 (0, 0, 75)도 "파랑"이다 —
 * 밝기는 옆의 세기 글(파랑 29%)과 빛 번짐이 알린다.
 */
export function colorName(levels: RgbLevels): string {
  const max = Math.max(levels.r, levels.g, levels.b);
  if (!(max > 0)) {
    return '꺼짐';
  }
  const min = Math.min(levels.r, levels.g, levels.b);
  const hue = hueOf(levels);
  if (hue === null || (max - min) / max < WHITE_SATURATION) {
    return '흰색';
  }
  return HUE_NAMES.find(([limit]) => hue < limit)?.[1] ?? '빨강';
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
