/**
 * 왼쪽 차례(LessonSidebar.astro)가 그리는 값의 모양(판 1.4.0). 웹 차시 쪽은 "이 단원 차시 목록"을, 교과서 쪽(src/components/book)은
 * "교과서 차례"를 같은 모양으로 넘겨 한 부품이 둘을 그린다(링크·진도 표시·펼치기·초점 규칙이 하나라서 두 화면이 어긋나지 않는다).
 * 순수 함수라 Vitest로 검사한다(tests/unit/lesson/ · tests/unit/book/).
 */
import type { LearnUnit } from '../../config/nav.ts';
import { buildUnitOutline, kindBadge, type LessonSummary } from './lesson-data.ts';

export interface SidebarItem {
  /** 지금 쪽인지 가릴 때 쓰는 id(쪽마다 다르다) */
  readonly id: string;
  /** 진도(data-progress-lesson)에 쓰는 차시 id. 없으면 진도 표시를 그리지 않는다 */
  readonly progressId?: string;
  readonly href: string;
  readonly label: string;
  readonly title: string;
  /** 제목 앞의 작은 칩(보충·읽기 자료 등) */
  readonly badge?: string;
}

export interface SidebarGroup {
  readonly key: string;
  readonly title: string;
  readonly items: readonly SidebarItem[];
}

export interface SidebarOutline {
  /** 목록 nav의 이름(aria-label) */
  readonly navLabel: string;
  /** 좁은 화면에서 접힌 요약 줄의 글 */
  readonly summaryLabel: string;
  /** 목록 머리의 제목과 그 링크 */
  readonly title: string;
  readonly titleHref: string;
  /** 단원 색(.card--uN) */
  readonly unit: 1 | 2 | 3 | 4;
  readonly currentId: string;
  readonly groups: readonly SidebarGroup[];
  /** 단원 진도 글·막대를 그릴지(웹 차시 쪽만 — 교과서 차례는 항목별 표시만) */
  readonly showProgress: boolean;
  /** 진도 막대 낭독 이름 앞에 붙는 말("1단원") */
  readonly progressLabel?: string;
}

/** 웹 차시 쪽의 "이 단원 차시 목록" */
export function unitSidebarOutline(unit: LearnUnit, lessons: readonly LessonSummary[], currentId: string): SidebarOutline {
  const groups = buildUnitOutline(unit.unit, lessons)
    .filter((section) => section.items.some((item) => item.lesson))
    .map((section) => ({
      key: section.key,
      title: section.title,
      items: section.items.flatMap((item): SidebarItem[] =>
        item.lesson
          ? [{ id: item.lesson.id, progressId: item.lesson.id, href: item.lesson.href, label: item.label, title: item.title, badge: kindBadge(item.kind) }]
          : [],
      ),
    }));
  return {
    navLabel: '단원 차시 목록',
    summaryLabel: '이 단원 차시 목록 펼치기',
    title: unit.title,
    titleHref: unit.href,
    unit: unit.unit,
    currentId,
    groups,
    showProgress: true,
    progressLabel: `${unit.unit}단원`,
  };
}
