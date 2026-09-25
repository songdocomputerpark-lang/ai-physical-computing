/**
 * 교사용 자료실(PLAN §8.5 P5-14)이 모든 차시에서 모으는 값 — 차시 md(content/lessons/**)만 읽고, 손으로 적은 목록은 두지 않는다.
 * 새 차시 md를 넣으면 코드 수정 없이 지도 요약·성취기준 표·편집본 쪽 목록·바꾼 곳 모음·생성형 AI 과제 모음에 따라 들어온다.
 *
 * 순수 함수라 Astro 없이도 돈다(페이지가 getCollection('lessons')로 받은 항목을 넘긴다). 파일이 있는지는 부르는 쪽이 알려 준다.
 * 차시 틀 쪽 모듈(src/components/lesson/**)과 성취기준 표(src/config/standards.ts)는 읽기만 한다.
 */
import type { LessonData } from '../../config/content-schemas.ts';
import { findStandard, standardAreaName, STANDARDS, type Standard } from '../../config/standards.ts';
import type { LessonSource } from '../lesson/curriculum.ts';
import { HANDOUT_DOCS, handoutPath, type HandoutDocId } from '../lesson/handouts.ts';
import { lessonSource } from '../lesson/lesson-rules.ts';
import { compareLessons, pagesText, toLessonSummary, type LessonSummary } from '../lesson/lesson-data.ts';
import { extractTeacherGuide, genAiTasks, guideIdPrefix, isChangeSection, type GenAiTask, type TeacherGuide } from './teacher-guides.ts';

/** getCollection('lessons') 항목에서 쓰는 부분 */
export interface TeacherLessonEntry {
  readonly id: string;
  readonly data: LessonData;
  readonly filePath?: string;
  readonly rendered?: { readonly html?: string } | undefined;
}

export interface TeacherLesson {
  readonly summary: LessonSummary;
  readonly data: LessonData;
  /** 원천(차례표 → frontmatter source → 보충). 알 수 없으면 undefined */
  readonly source: LessonSource | undefined;
  /** 저장소 안 파일 경로(예: content/lessons/u1/1-1-1.md) */
  readonly file: string;
  /** 모음 페이지 id 앞머리 */
  readonly idPrefix: string;
  /** 교사용 접기(없으면 undefined) */
  readonly guide?: TeacherGuide;
  /** 생성형 AI 활용 탐구 상자 */
  readonly genai: readonly GenAiTask[];
}

/** 교사용 자료실 페이지 주소(base 없음) */
export const TEACHER_PATHS = Object.freeze({
  home: '/teacher/',
  guides: '/teacher/guides/',
  standards: '/teacher/standards/',
  corrections: '/teacher/corrections/',
  realPc: '/teacher/real-pc/',
  faq: '/teacher/faq/',
});

/** 대단원별 지도 요약 페이지 주소(base 없음). 예: /teacher/guides/u1/ */
export function guidesUnitPath(unit: number): string {
  return `${TEACHER_PATHS.guides}u${unit}/`;
}

/** 차시 하나를 모음용 값으로 바꾼다 */
export function toTeacherLesson(entry: TeacherLessonEntry): TeacherLesson {
  const summary = toLessonSummary(entry);
  const html = entry.rendered?.html ?? '';
  const idPrefix = guideIdPrefix(summary.unit, summary.slug);
  return {
    summary,
    data: entry.data,
    source: lessonSource(entry.data, summary.slug),
    file: entry.filePath ?? `content/lessons/${entry.id}.md`,
    idPrefix,
    guide: extractTeacherGuide(html, { idPrefix, lessonHref: summary.href }),
    genai: genAiTasks(html),
  };
}

/** 목록에 내보내는 차시(draft 제외)를 대단원 → 순서대로 */
export function buildTeacherLessons(entries: readonly TeacherLessonEntry[]): TeacherLesson[] {
  return entries
    .filter((entry) => !entry.data.draft)
    .map(toTeacherLesson)
    .sort((a, b) => compareLessons(a.summary, b.summary));
}

/** 원천 뱃지 */
export interface SourceBadge {
  readonly text: string;
  /** manuscript 원고를 옮김 · no-manuscript 원고 없음(코드 기준) · supplement 사이트가 새로 씀 · unknown 모름 */
  readonly tone: 'manuscript' | 'no-manuscript' | 'supplement' | 'unknown';
}

/** 원천을 짧은 글로(차시 목록·지도 요약 머리에 쓴다). 교사용 접기의 긴 문장은 teacher-info.ts가 만든다 */
export function sourceBadge(source: LessonSource | undefined, pages: string | undefined): SourceBadge {
  const where = pagesText(pages);
  switch (source) {
    case 'manuscript-code':
      return { text: `원고와 코드${where ? ` · 교과서 ${where}` : ''}`, tone: 'manuscript' };
    case 'manuscript':
      return { text: `원고${where ? ` · 교과서 ${where}` : ''}`, tone: 'manuscript' };
    case 'code-only':
      return { text: `원고 없음(코드 기준)${where ? ` · ${where}` : ''}`, tone: 'no-manuscript' };
    case 'supplement':
      return { text: '사이트가 새로 쓴 차시', tone: 'supplement' };
    default:
      return { text: '원천 확인 전', tone: 'unknown' };
  }
}

/** 성취기준 코드의 자료실 안 위치 이름. '12인피01-02' → 'std-01-02' */
export function standardAnchor(code: string): string {
  return `std-${code.replace(/^12인피/u, '')}`;
}

/** 성취기준 코드마다 이어지는 차시(frontmatter standards 기준, 차시 순서대로) */
export function lessonsByStandard(lessons: readonly TeacherLesson[]): Map<string, TeacherLesson[]> {
  const map = new Map<string, TeacherLesson[]>(STANDARDS.map((standard) => [standard.code, []]));
  for (const lesson of lessons) {
    for (const code of lesson.summary.standards) {
      const list = map.get(code);
      if (list) {
        list.push(lesson);
      } else {
        map.set(code, [lesson]);
      }
    }
  }
  return map;
}

/** 성취기준을 비워 둔 차시(보충·선택·대단원 마무리 등) */
export function lessonsWithoutStandards(lessons: readonly TeacherLesson[]): TeacherLesson[] {
  return lessons.filter((lesson) => lesson.summary.standards.length === 0);
}

/** 15개 표에 없는 코드(frontmatter 오타 등) */
export function unknownStandardCodes(lessons: readonly TeacherLesson[]): string[] {
  const codes = new Set(lessons.flatMap((lesson) => lesson.summary.standards));
  return [...codes].filter((code) => !findStandard(code)).sort();
}

export interface StandardRow {
  readonly standard: Standard;
  readonly areaName: string;
  readonly anchor: string;
  readonly lessons: readonly TeacherLesson[];
}

/** 성취기준 표의 줄(15개, 영역 순서) */
export function standardRows(lessons: readonly TeacherLesson[]): StandardRow[] {
  const byCode = lessonsByStandard(lessons);
  return STANDARDS.map((standard) => ({
    standard,
    areaName: standardAreaName(standard.area),
    anchor: standardAnchor(standard.code),
    lessons: byCode.get(standard.code) ?? [],
  }));
}

/** 가린 편집본 교안 한 쪽 묶음을 쓰는 차시 */
export interface HandoutUse {
  readonly lesson: TeacherLesson;
  readonly doc: HandoutDocId;
  readonly pages: string;
  readonly note?: string;
  /** 편집본 파일이 있으면 그 쪽으로 바로 가는 주소(base 없음), 없으면 undefined */
  readonly path?: string;
}

/** 편집본마다 어느 차시가 몇 쪽을 쓰는지(frontmatter handouts 기준) */
export function handoutUses(lessons: readonly TeacherLesson[], exists: (doc: HandoutDocId) => boolean): Map<HandoutDocId, HandoutUse[]> {
  const map = new Map<HandoutDocId, HandoutUse[]>(
    (Object.keys(HANDOUT_DOCS) as HandoutDocId[]).map((doc) => [doc, [] as HandoutUse[]]),
  );
  for (const lesson of lessons) {
    // Astro 콘텐츠 캐시가 옛 값을 되살리면 handouts 칸이 없을 수 있다(PROGRESS 미해결 169) — 빈 목록으로 본다.
    for (const handout of lesson.data.handouts ?? []) {
      map.get(handout.doc)?.push({
        lesson,
        doc: handout.doc,
        pages: handout.pages,
        note: handout.note,
        path: exists(handout.doc) ? handoutPath(handout.doc, handout.pages) : undefined,
      });
    }
  }
  return map;
}

/** 차시 교사용 접기의 "…바꾼 곳" 부분만 */
export function changeSectionsOf(lesson: TeacherLesson): TeacherGuide['sections'] {
  return lesson.guide?.sections.filter((section) => isChangeSection(section.title)) ?? [];
}

/** 대단원 번호로 묶는다(1~4 순서, 차시가 없는 대단원은 빈 목록) */
export function lessonsByUnit(lessons: readonly TeacherLesson[]): Map<1 | 2 | 3 | 4, TeacherLesson[]> {
  const map = new Map<1 | 2 | 3 | 4, TeacherLesson[]>([
    [1, []],
    [2, []],
    [3, []],
    [4, []],
  ]);
  for (const lesson of lessons) {
    map.get(lesson.summary.unit)?.push(lesson);
  }
  return map;
}

/** 모음 페이지에서 차시 제목으로 쓰는 글. 예: "1-1-1 인공지능 응용 프로그램과 에이전트", "V1 (보충) 사진은 숫자다" */
export function lessonHeading(lesson: TeacherLesson): string {
  const { label, title, kind } = lesson.summary;
  const badge = kind === 'supplement' ? ' (보충)' : kind === 'reading' ? ' (읽기 자료)' : '';
  return `${label}${badge} ${title}`;
}
