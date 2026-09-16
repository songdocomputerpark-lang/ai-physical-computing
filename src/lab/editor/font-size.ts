/**
 * 코드 에디터 글자 크기(PLAN §8.2 P2-02, SPEC §9 "글자 크기 조절").
 *
 * 글자 크기는 몇 단계 가운데 하나만 고를 수 있고(13·15·17·20·24px), 고른 값은 이 사이트의 저장 이름 규칙(src/lib/storage.ts)으로
 * 브라우저에 남아 다른 실습실 페이지에서도 같은 크기로 보인다. 화면에는 rem으로 적용해 브라우저 글자 크기 설정과 함께 커진다.
 *
 *   readFontSize()            → 저장된 단계(없거나 이상하면 기본 15)
 *   stepFontSize(15, 1)       → 17,  stepFontSize(13, -1) → 13(끝에서는 그대로)
 *   fontSizeCss(15)           → '0.9375rem'
 *
 * Node.js(Vitest)가 이 파일을 그대로 읽으므로 브라우저 전역을 직접 쓰지 않는다.
 */
import { readItem, writeItem, type StorageSource } from '../../lib/storage.ts';

/** 고를 수 있는 글자 크기(px, 브라우저 기본 16px 기준). 가장 작은 13px도 본문 최소 크기(text-xs)와 같다. */
export const FONT_SIZE_STEPS_PX: readonly number[] = Object.freeze([13, 15, 17, 20, 24]);

/** 기본 글자 크기(px). 본문 작은 글자(text-sm)와 같다. */
export const DEFAULT_FONT_SIZE_PX = 15;

/** 저장 이름(src/lib/storage.ts 규칙, 머리말 없이). 실습실 전체가 함께 쓴다. */
export const FONT_SIZE_STORAGE_NAME = 'editor:font-size';

/** 단계 밖의 값을 가장 가까운 단계로 맞춘다. 숫자가 아니면 기본값. */
export function clampFontSize(px: number): number {
  if (typeof px !== 'number' || !Number.isFinite(px)) {
    return DEFAULT_FONT_SIZE_PX;
  }
  let nearest = FONT_SIZE_STEPS_PX[0];
  for (const step of FONT_SIZE_STEPS_PX) {
    if (Math.abs(step - px) < Math.abs(nearest - px)) {
      nearest = step;
    }
  }
  return nearest;
}

/** 한 단계 키우거나(direction 1) 줄인다(-1). 끝 단계에서는 그대로다. */
export function stepFontSize(current: number, direction: -1 | 1): number {
  const index = FONT_SIZE_STEPS_PX.indexOf(clampFontSize(current));
  const next = Math.min(FONT_SIZE_STEPS_PX.length - 1, Math.max(0, index + direction));
  return FONT_SIZE_STEPS_PX[next];
}

/** 더 키울 수 있는지 / 더 줄일 수 있는지 */
export function canStepFontSize(current: number, direction: -1 | 1): boolean {
  return stepFontSize(current, direction) !== clampFontSize(current);
}

/** CSS 값(rem). 브라우저 글자 크기 설정을 키우면 함께 커진다. */
export function fontSizeCss(px: number): string {
  return `${clampFontSize(px) / 16}rem`;
}

/** 저장된 글자 크기를 읽는다. 없거나 못 읽거나 이상한 값이면 기본값. */
export function readFontSize(source?: StorageSource): number {
  const stored = readItem(FONT_SIZE_STORAGE_NAME, source);
  if (stored === null) {
    return DEFAULT_FONT_SIZE_PX;
  }
  const parsed = Number(stored);
  return FONT_SIZE_STEPS_PX.includes(parsed) ? parsed : DEFAULT_FONT_SIZE_PX;
}

/** 글자 크기를 저장한다. 저장하지 못하면 false(화면에는 그대로 적용한다). */
export function saveFontSize(px: number, source?: StorageSource): boolean {
  return writeItem(FONT_SIZE_STORAGE_NAME, String(clampFontSize(px)), source);
}
