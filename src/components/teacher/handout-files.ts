/**
 * 가린 편집본 교안 PDF(PD-31)가 public/에 있는지 빌드 때 본다 — **빌드 전용**(node:fs). 페이지 프런트매터에서만 import한다.
 * 파일 이름은 src/components/lesson/handouts.ts 한 곳(HANDOUT_DOCS)에 있다. 편집본을 만드는 쪽이 그 자리에 파일을 넣으면
 * 차시 교사용 접기(LessonTeacherInfo.astro)와 교사용 자료실의 링크가 함께 저절로 열린다(같은 규칙: 저장소 뿌리의 public/ 기준).
 */
import fs from 'node:fs';
import path from 'node:path';
import { HANDOUT_DOCS, handoutPath, type HandoutDocId } from '../lesson/handouts.ts';
import type { TeacherLesson } from './teacher-lessons.ts';

/** 편집본 파일이 public/ 아래에 있는지 */
export function handoutFileExists(doc: HandoutDocId): boolean {
  return fs.existsSync(path.resolve('public', ...HANDOUT_DOCS[doc].file.split('/')));
}

/** 편집본 파일 크기(바이트). 없으면 undefined */
export function handoutFileSize(doc: HandoutDocId): number | undefined {
  try {
    return fs.statSync(path.resolve('public', ...HANDOUT_DOCS[doc].file.split('/'))).size;
  } catch {
    return undefined;
  }
}

/** 차시 한 개의 편집본 쪽 줄(GuideLessonMeta.astro의 handouts) */
export function handoutLinesOf(lesson: TeacherLesson): { title: string; pages: string; note?: string; path?: string }[] {
  // Astro 콘텐츠 캐시가 옛 값을 되살리면 handouts 칸이 없을 수 있다(PROGRESS 미해결 169).
  return (lesson.data.handouts ?? []).map((handout) => ({
    title: HANDOUT_DOCS[handout.doc].title,
    pages: handout.pages,
    note: handout.note,
    path: handoutFileExists(handout.doc) ? handoutPath(handout.doc, handout.pages) : undefined,
  }));
}
