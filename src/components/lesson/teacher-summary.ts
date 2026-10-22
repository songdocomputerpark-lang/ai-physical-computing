/**
 * 교사용 접기 맨 위 "한눈에 보기" 줄(판 1.6.0, DECISIONS C175)의 글을 만드는 순수 함수 — tests/unit/lesson/teacher-summary.test.ts가 검사한다.
 *
 * 교사는 접기를 열자마자 ① 확인 퀴즈의 정답 ② 평가 포인트·채점 기준·지도안 요약으로 가는 길을 한 곳에서 본다
 * (조사에서 교과서 쪽→퀴즈 정답·평가 포인트까지 길이 없어 목표에 못 닿았다 — walk-teacher-new B2·C1).
 * 접기 안에 있는 ### 제목만 바로 가기로 만든다("있는 것만"). 정답 글은 학생 화면의 정답 줄(quiz.ts answerText)과 같은 모양이다.
 */
import type { TeacherHeading } from './lesson-html.ts';
import { choiceMark } from './quiz.ts';

/** 바로 가기로 보이는 교사용 ### 제목 — 요약 줄에서 보이는 차례와 이름. startsWith로 알아본다("지도안 요약(50분, …)"도 된다). */
export const TEACHER_SUMMARY_LINKS: readonly { readonly match: string; readonly label: string }[] = Object.freeze([
  { match: '평가포인트', label: '평가 포인트' },
  { match: '채점기준', label: '채점 기준' },
  { match: '지도안요약', label: '지도 요약' },
  { match: '자주막히는곳', label: '자주 막히는 곳' },
]);

export interface TeacherSummaryLink {
  readonly label: string;
  /** 같은 쪽 안의 #위치(교사용 접기 안 ### 제목 id) */
  readonly href: string;
}

function squash(text: string): string {
  return text.normalize('NFC').replace(/\s+/gu, '');
}

/** 접기 안 ### 제목에서 요약 줄의 바로 가기를 고른다. 위 표의 차례대로, 있는 것만 */
export function teacherSummaryLinks(headings: readonly TeacherHeading[]): TeacherSummaryLink[] {
  return TEACHER_SUMMARY_LINKS.flatMap((entry) => {
    const found = headings.find((heading) => squash(heading.title).startsWith(entry.match));
    return found ? [{ label: entry.label, href: `#${found.id}` }] : [];
  });
}

/**
 * 접기 안 "### 채점 기준" 제목의 id(없으면 undefined) — [표 인쇄]·[표 복사] 단추 줄(RubricTools.astro)이 이 제목 다음의 표를 가져간다(판 1.7.0 Z3).
 * 제목 글자를 찾는 규칙은 바로 가기와 같다(teacherSummaryLinks의 '채점기준').
 */
export function rubricTargetId(headings: readonly TeacherHeading[]): string | undefined {
  return headings.find((heading) => squash(heading.title).startsWith('채점기준'))?.id || undefined;
}

export interface QuizAnswerLike {
  readonly choices: readonly string[];
  readonly answer: number;
}

export interface QuizAnswerEntry {
  /** 문항 번호(1부터) */
  readonly number: number;
  /** ①②③ 정답 기호 */
  readonly mark: string;
  /** 정답 보기 글 */
  readonly text: string;
}

/** 확인 퀴즈의 정답표 — 문항 번호, 정답 기호, 정답 보기 글 */
export function quizAnswerKey(quiz: readonly QuizAnswerLike[]): QuizAnswerEntry[] {
  return quiz.map((item, index) => ({ number: index + 1, mark: choiceMark(item.answer), text: item.choices[item.answer] ?? '' }));
}
