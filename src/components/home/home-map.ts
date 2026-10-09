/**
 * 홈 "배움 지도"의 대단원 카드 자료를 만든다(판 1.3.0 — 순수 함수, 단위 테스트 tests/unit/home/home-map.test.ts).
 *
 * 입력은 공개 차시 목록(publishedLessons의 결과)과 대단원 목록(nav.ts의 learnUnits)이다.
 * 카드마다 차시 수, 첫 차시(시작하기 단추의 목적지), 진도를 셀 차시 id 목록(data-progress-unit)을 낸다.
 * 진도는 HTML에 굽지 않는다 — 브라우저에서 progress-paint.ts가 칠한다.
 */
import type { LearnUnit } from '../../config/nav.ts';
import type { IconName } from '../common/icons.ts';
import type { LessonSummary } from '../lesson/lesson-data.ts';

/** 카드가 쓰는 차시 정보(전체 LessonSummary가 아니라 필요한 것만) */
export type HomeMapLesson = Pick<LessonSummary, 'id' | 'unit' | 'label' | 'title' | 'href'>;

export interface HomeMapUnit {
  readonly unit: 1 | 2 | 3 | 4;
  readonly numeral: string;
  /** 대단원 이름 전체(예: "I. 영상 처리 인공지능") */
  readonly label: string;
  readonly description: string;
  /** 대단원 차시 목록 쪽 */
  readonly href: string;
  readonly icon: IconName;
  /** 공개된 차시 수 */
  readonly count: number;
  /** 시작하기 단추가 가는 첫 차시. 공개 차시가 하나도 없으면 null이고, 그때 카드는 단원 쪽으로 보낸다. */
  readonly first: { readonly id: string; readonly label: string; readonly title: string; readonly href: string } | null;
  /** 진도를 셀 차시 id(쉼표로 이어 data-progress-unit에 쓴다) */
  readonly lessonIds: readonly string[];
}

/** 대단원 카드 자료. 차시는 이미 단원·order 순으로 정렬돼 있다고 본다(publishedLessons). */
export function buildHomeMapUnits(
  units: readonly LearnUnit[],
  lessons: readonly HomeMapLesson[],
  icons: Readonly<Record<1 | 2 | 3 | 4, IconName>>,
): HomeMapUnit[] {
  return units.map((unit) => {
    const own = lessons.filter((lesson) => lesson.unit === unit.unit);
    const first = own[0];
    return Object.freeze({
      unit: unit.unit,
      numeral: unit.numeral,
      label: unit.label,
      description: unit.description,
      href: unit.href,
      icon: icons[unit.unit],
      count: own.length,
      first: first ? Object.freeze({ id: first.id, label: first.label, title: first.title, href: first.href }) : null,
      lessonIds: Object.freeze(own.map((lesson) => lesson.id)),
    });
  });
}

/**
 * 시작하기 단추가 진도에 따라 바뀔 때 쓰는 주소. 차시 id("u1/1-2-1")와 /learn/ 주소(base 포함, 끝 /)로 만든다.
 * 차시 주소 규칙(lessonPath: /learn/u{단원}/{이름}/)이 id와 같은 모양이라 id만 있으면 된다.
 */
export function lessonHrefFromId(learnBase: string, id: string): string {
  const base = learnBase.endsWith('/') ? learnBase : `${learnBase}/`;
  return `${base}${id}/`;
}
