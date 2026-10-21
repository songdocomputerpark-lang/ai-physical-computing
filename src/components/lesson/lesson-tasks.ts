/**
 * 차시 머리 "이 차시에서 할 일" 카드 세 칸(판 1.6.0, DECISIONS C174) — 순수 함수라 Vitest가 검사한다(tests/unit/lesson/lesson-tasks.test.ts).
 *
 * 차시 쪽이 휴대폰에서 16,000px가 넘어 "따라 하기"가 9화면 아래에 있었다(walk-student-first 7). 제목 바로 아래에 ① 읽기 ② 따라 하기 ③ 확인을
 * 한 줄 카드로 두고, 누르면 그 칸으로 간다. 카드의 글은 그 차시 frontmatter와 본문에서 센다(예제 수·퀴즈 문항 수·소요 시간·개념 소제목 수).
 * 해당 칸이 차시에 없으면 그 카드는 빼고, 카드가 둘 미만이면 상자 자체를 그리지 않는다(읽기 자료·대단원 마무리처럼 8칸 틀이 아닌 차시).
 */
import type { IconName } from '../common/icons.ts';
import type { LessonBodyPlan, LessonSectionKey } from './lesson-html.ts';
import { formatDuration } from './lesson-data.ts';

export type TaskKey = 'read' | 'follow' | 'check';

export interface TaskCard {
  readonly key: TaskKey;
  /** 카드 제목 — 읽기 · 따라 하기 · 확인 */
  readonly title: string;
  /** 제목 아래 한 줄(수를 센 글) */
  readonly detail: string;
  /** 같은 쪽 안의 #위치(칸의 ## 제목 id) */
  readonly href: string;
  readonly icon: IconName;
}

export interface LessonTasks {
  readonly heading: string;
  /** "약 50분" — frontmatter duration이 없으면 없다 */
  readonly time?: string;
  readonly cards: readonly TaskCard[];
}

export interface LessonTasksInput {
  readonly plan: Pick<LessonBodyPlan, 'sections' | 'conceptTopics'>;
  /** frontmatter examples 개수 */
  readonly exampleCount: number;
  /** frontmatter quiz 문항 수 */
  readonly quizCount: number;
  /** frontmatter duration(분) */
  readonly duration?: number | undefined;
}

export const TASKS_HEADING = '이 차시에서 할 일';

/** 칸 하나의 ## 제목 id. 칸이 없거나 id가 없으면 undefined */
function sectionId(plan: LessonTasksInput['plan'], key: LessonSectionKey): string | undefined {
  return plan.sections.find((section) => section.key === key && section.id)?.id;
}

/** 이 차시의 할 일 카드. 만들 수 없으면(칸이 둘 미만) undefined */
export function buildLessonTasks(input: LessonTasksInput): LessonTasks | undefined {
  const { plan, exampleCount, quizCount, duration } = input;
  const cards: TaskCard[] = [];

  const reading = sectionId(plan, 'concepts');
  if (reading) {
    const topics = plan.conceptTopics ?? 0;
    cards.push({
      key: 'read',
      title: '읽기',
      detail: topics > 0 ? `개념 ${topics}가지` : '핵심 개념',
      href: `#${reading}`,
      icon: 'book',
    });
  }

  const following = sectionId(plan, 'follow');
  if (following) {
    cards.push({
      key: 'follow',
      title: '따라 하기',
      detail: exampleCount > 0 ? `예제 ${exampleCount}개` : '따라 해 봐요',
      href: `#${following}`,
      icon: 'code',
    });
  }

  const checking = sectionId(plan, 'quiz');
  if (checking) {
    cards.push({
      key: 'check',
      title: '확인',
      detail: quizCount > 0 ? `퀴즈 ${quizCount}문제` : '확인해 봐요',
      href: `#${checking}`,
      icon: 'check-circle',
    });
  }

  if (cards.length < 2) {
    return undefined;
  }
  const minutes = formatDuration(duration);
  return { heading: TASKS_HEADING, ...(minutes ? { time: `약 ${minutes}` } : {}), cards };
}
