/**
 * 대단원마다 다른 색·아이콘(판 1.3.0 — 길 찾기용). 색은 tokens.css의 --unit-1~4, 카드 클래스는 global.css의 .card--u1~4.
 * 단원은 늘 글자("I단원")로도 적는다 — 색만으로 알리지 않는다.
 */
import type { IconName } from '../common/icons.ts';

export type LessonUnitNumber = 1 | 2 | 3 | 4;

const UNIT_ICONS: Readonly<Record<LessonUnitNumber, IconName>> = Object.freeze({
  1: 'camera',
  2: 'chip',
  3: 'signal',
  4: 'lightbulb',
});

const UNIT_NUMERALS: Readonly<Record<LessonUnitNumber, string>> = Object.freeze({ 1: 'I', 2: 'II', 3: 'III', 4: 'IV' });

/** 단원 아이콘 이름 */
export function unitIcon(unit: LessonUnitNumber): IconName {
  return UNIT_ICONS[unit];
}

/** 단원 색 카드 클래스(.card--u1 …) */
export function unitCardClass(unit: LessonUnitNumber): string {
  return `card--u${unit}`;
}

/** "I단원" 같은 짧은 이름 */
export function unitShortName(unit: LessonUnitNumber): string {
  return `${UNIT_NUMERALS[unit]}단원`;
}

/** 차시 id 목록(u1/1-1-1 …)을 data-progress-unit 값으로 */
export function progressIds(ids: readonly string[]): string {
  return ids.join(',');
}

/**
 * 대단원 안에서 몇 번째 차시인지 — "18차시 중 3번째". 차시가 목록에 없으면 undefined.
 * lessons는 대단원 → order 순서로 정렬된 공개 차시(lesson-data.ts publishedLessons).
 */
export function lessonPosition(
  lessons: readonly { readonly id: string; readonly unit: number }[],
  lesson: { readonly id: string; readonly unit: number },
): { index: number; total: number } | undefined {
  const inUnit = lessons.filter((candidate) => candidate.unit === lesson.unit);
  const index = inUnit.findIndex((candidate) => candidate.id === lesson.id);
  return index < 0 ? undefined : { index: index + 1, total: inUnit.length };
}
