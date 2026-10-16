/**
 * 범용 디지털 출력 부품의 순수 논리(DOM 없음 — tests/unit/lab/board-part-output-digital.test.ts, Node 실제 Pyodide 단계 generic-parts.mjs도 import).
 *
 * 신호 핀 1개가 1(HIGH)이면 켜지는 장치(LED·릴레이·전자석·펌프 …)를 한 부품으로 흉내 낸다. 화면 이름은 배선의 label이다.
 * 종류(kind): led(색 있는 표시등, 기본) · relay(딸깍 하는 릴레이 — 소리는 내지 않고 접점 그림만) · load(전자석·펌프처럼 켜고 끄는 장치 — 켜짐/꺼짐 표시만).
 * PWM으로 켠 핀은 켜진 비율만큼의 밝기로 보인다(state.ts outputStrength). 소리는 내지 않는다(버저는 buzzer 부품).
 */
import { outputStrength, type BoardSnapshot } from '../../state.ts';
import { readOptions, type OptionRule } from '../../part-options.ts';
import type { PartOptions } from '../../part-types.ts';
import { percentOf } from '../rgb-led/rgb-model.ts';

export const OUTPUT_KINDS = ['led', 'relay', 'load'] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

export const OUTPUT_COLORS = ['red', 'yellow', 'green', 'blue', 'white'] as const;
export type OutputColor = (typeof OUTPUT_COLORS)[number];

/** 색 이름(글자로도 알린다 — 색만으로 알리지 않음) */
export const OUTPUT_COLOR_NAMES: Readonly<Record<OutputColor, string>> = Object.freeze({ red: '빨강', yellow: '노랑', green: '초록', blue: '파랑', white: '흰색' });

/** 켜졌을 때·꺼졌을 때의 불빛 색 */
export const OUTPUT_COLOR_PALETTE: Readonly<Record<OutputColor, { readonly on: string; readonly off: string; readonly glow: string }>> = Object.freeze({
  red: { on: '#ef4444', off: '#7f1d1d', glow: '#fca5a5' },
  yellow: { on: '#facc15', off: '#713f12', glow: '#fde68a' },
  green: { on: '#22c55e', off: '#14532d', glow: '#86efac' },
  blue: { on: '#3b82f6', off: '#1e3a8a', glow: '#93c5fd' },
  white: { on: '#f8fafc', off: '#475569', glow: '#e2e8f0' },
});

/** 쓸 수 있는 설정 */
export const OUTPUT_DIGITAL_OPTION_RULES: readonly OptionRule[] = Object.freeze([
  { key: 'kind', type: 'choice', fallback: 'led', choices: OUTPUT_KINDS },
  { key: 'color', type: 'choice', fallback: 'red', choices: OUTPUT_COLORS },
]);

export interface OutputDigitalSettings {
  readonly kind: OutputKind;
  readonly color: OutputColor;
}

export function outputDigitalSettings(options: PartOptions | undefined): { readonly settings: OutputDigitalSettings; readonly problems: readonly string[] } {
  const { values, problems } = readOptions(options, OUTPUT_DIGITAL_OPTION_RULES);
  return { settings: { kind: values.kind as OutputKind, color: values.color as OutputColor }, problems };
}

/** 종류 이름(그림 아래 작은 글·낭독 설명) */
export function outputKindName(settings: OutputDigitalSettings): string {
  if (settings.kind === 'relay') {
    return '릴레이';
  }
  if (settings.kind === 'load') {
    return '출력 장치';
  }
  return `${OUTPUT_COLOR_NAMES[settings.color]} LED`;
}

export interface OutputDigitalVisual {
  readonly lit: boolean;
  /** 켜진 세기(0~100 %, PWM이면 켜진 비율) */
  readonly brightness: number;
  readonly kind: OutputKind;
  readonly color: OutputColor;
  readonly summary: string;
  [key: string]: string | number | boolean;
}

/** 스냅샷 → 모습: 핀이 1이면(또는 PWM이면 켜진 비율만큼) 켜짐, [정지]·입력·0이면 꺼짐 */
export function outputDigitalVisual(snapshot: BoardSnapshot, gpio: number | undefined, settings: OutputDigitalSettings): OutputDigitalVisual {
  const brightness = gpio === undefined ? 0 : percentOf(outputStrength(snapshot, gpio));
  const lit = brightness > 0;
  const partial = brightness > 0 && brightness < 100 ? `(세기 ${brightness}%)` : '';
  let summary: string;
  if (settings.kind === 'relay') {
    summary = lit ? `켜짐${partial} · 접점이 붙었어요` : '꺼짐 · 접점이 떨어졌어요';
  } else {
    summary = lit ? `켜짐${partial}` : '꺼짐';
  }
  return { lit, brightness, kind: settings.kind, color: settings.color, summary };
}
