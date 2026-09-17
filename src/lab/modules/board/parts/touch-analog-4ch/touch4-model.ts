/**
 * 4채널 아날로그 터치 부품의 순수 논리(DOM 없음 — tests/unit/lab/board-part-touch-analog-4ch.test.ts, Node 실제 Pyodide 단계 pwm-adc.mjs도 import).
 *
 * 패드 값(PLAN §6.1 "4채널 터치 값", INVENTORY §4.4): 교과서 원고 139쪽 측정값 — ATTN_11DB·WIDTH_12BIT로 읽은 값이 패드 1~4에서 약 688·1535·2381·3263,
 * 누르지 않으면 0. 부품은 핀에 전압(밀리볼트, state.ts analogDrive)을 걸고, 가상 보드의 ADC(src/lab/modules/board/ext/adc/apc_board_adc.py)가
 * 값(12비트) = 내림(전압 × 4095 ÷ 3300)으로 읽는다(ATTN_11DB의 끝 전압 3300mV — 교과서 138쪽 주석 "최대 3.3 V"). 전압은 정수 mV로만 보낼 수 있어
 * 값 하나에 0.81mV꼴이라, 패드 값이 그대로 읽히도록 "그 값이 읽히는 가장 작은 정수 mV" = 올림(값 × 3300 ÷ 4095)을 건다(688 → 555mV 등).
 * 판정 구간(사이트판 기준, PD — f066·원고 152쪽): 500~800 / 1000~1700 / 2000~2500 / 3000~3500. 원본 f058·f059의 구간은 고치지 않는다(PD-10 — 교사용).
 */
import { BOARD_MAX_MV } from '../../state.ts';

/** 12비트 ADC의 최댓값 */
export const RAW12_MAX = 4095;
/** ATTN_11DB에서 12비트 값 4095에 닿는 전압(mV) — apc_board_adc.py FULL_SCALE_MV[3]와 같다 */
export const ATTN_11DB_FULL_SCALE_MV = 3300;

export interface Touch4Pad {
  /** 패드 번호 1~4 */
  readonly number: 1 | 2 | 3 | 4;
  /** ATTN_11DB·WIDTH_12BIT로 읽히는 값(원고 139쪽 측정값) */
  readonly raw: number;
}

export const TOUCH4_PADS: readonly Touch4Pad[] = Object.freeze([
  { number: 1, raw: 688 },
  { number: 2, raw: 1535 },
  { number: 3, raw: 2381 },
  { number: 4, raw: 3263 },
]);

/** 사이트판 판정 구간(원고 152쪽·f066) — 설명·실습 방법 글에만 쓴다 */
export const TOUCH4_SITE_RANGES: readonly (readonly [number, number])[] = Object.freeze([
  [500, 800],
  [1000, 1700],
  [2000, 2500],
  [3000, 3500],
]);

/** 전압(mV) → ATTN_11DB·12비트로 읽히는 값: 내림(전압 × 4095 ÷ 3300), 0~4095 */
export function raw12FromMillivolts(millivolts: number): number {
  if (!Number.isFinite(millivolts)) {
    return 0;
  }
  const value = Math.floor((millivolts * RAW12_MAX) / ATTN_11DB_FULL_SCALE_MV);
  return Math.min(RAW12_MAX, Math.max(0, value));
}

/** 값(0~4095)이 읽히는 가장 작은 정수 전압(mV): 올림(값 × 3300 ÷ 4095). 몇몇 값은 정수 mV로 정확히 못 만들어 1 큰 값이 읽힌다 */
export function millivoltsForRaw12(raw: number): number {
  const clamped = Math.min(RAW12_MAX, Math.max(0, Math.round(Number.isFinite(raw) ? raw : 0)));
  return Math.min(BOARD_MAX_MV, Math.ceil((clamped * ATTN_11DB_FULL_SCALE_MV) / RAW12_MAX));
}

/** 지금 누르는 것: 패드 번호(0 = 누르지 않음)와 손을 뗐을 때 둘 값(막대) */
export interface Touch4Input {
  readonly pad: 0 | 1 | 2 | 3 | 4;
  /** 패드를 누르지 않을 때 핀에 걸 값(0~4095, 조작 칸의 "직접 값 정하기" 막대) */
  readonly rest: number;
}

export const TOUCH4_IDLE: Touch4Input = Object.freeze({ pad: 0, rest: 0 });

/** 지금 입력이 핀에 거는 값(0~4095) — 패드를 누르고 있으면 그 패드 값, 아니면 막대 값 */
export function touch4Raw(input: Touch4Input): number {
  const pad = TOUCH4_PADS.find((item) => item.number === input.pad);
  return pad ? pad.raw : Math.min(RAW12_MAX, Math.max(0, Math.round(input.rest)));
}

/** 지금 입력이 핀에 거는 전압(mV) */
export function touch4Millivolts(input: Touch4Input): number {
  return millivoltsForRaw12(touch4Raw(input));
}

/** 부품 모습(visual) — pad(0~4), value(ATTN_11DB·12비트로 읽힐 값), pressed(패드를 누르고 있는지), summary(화면 낭독기·툴팁 글) */
export function touch4Visual(input: Touch4Input): { pad: number; value: number; pressed: boolean; summary: string } {
  const value = raw12FromMillivolts(touch4Millivolts(input));
  const summary = input.pad > 0 ? `패드 ${input.pad} 누름 · 값 약 ${value}` : value > 0 ? `패드 누르지 않음 · 막대로 정한 값 약 ${value}` : '패드 누르지 않음 · 값 0';
  return { pad: input.pad, value, pressed: input.pad > 0, summary };
}
