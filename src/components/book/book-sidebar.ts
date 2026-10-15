/**
 * 교과서 쪽 왼쪽 "교과서 차례"(판 1.4.0) — 쪽 목록으로 만든 교과서 차례(book-data.ts buildBookToc)를 LessonSidebar가 그리는 모양
 * (src/components/lesson/sidebar-outline.ts)으로 바꾼다. 대단원(1~4) 안에 중단원 묶음, 묶음 안에 절이 차례로 들어간다.
 * 대단원 시작·마무리 쪽은 그 대단원의 첫 중단원 앞과 마지막 중단원 뒤에 한 줄짜리 묶음("2단원 시작"·"2단원 마무리")으로 둔다.
 * 순수 함수라 Vitest로 검사한다(tests/unit/book/book-sidebar.test.ts).
 */
import { withBase } from '../../lib/url.ts';
import type { LessonSummary } from '../lesson/lesson-data.ts';
import type { SidebarGroup, SidebarItem, SidebarOutline } from '../lesson/sidebar-outline.ts';
import {
  bookNameParts,
  bookProgressId,
  bookUnitName,
  buildBookToc,
  findPairedLesson,
  type BookSummary,
} from './book-data.ts';

/** 차례 한 항목: 짝 웹 차시가 있으면 그 차시의 진도 id를 쓴다 */
function toItem(book: BookSummary, lessons: readonly LessonSummary[]): SidebarItem {
  const paired = findPairedLesson(book, lessons);
  const progressId = bookProgressId(book, paired);
  // 제목이 번호 이름과 같은 말을 하면 번호 이름은 비운다("머리말 머리말과 …" 방지 — bookNameParts). 묶음 제목이 이미 "2단원 마무리"를 말한다
  const { label, title } = bookNameParts(book);
  return {
    id: book.id,
    ...(progressId ? { progressId } : {}),
    href: book.href,
    label,
    title,
  };
}

/** 교과서 차례 전체를 한 목록으로. current는 지금 쪽의 id */
export function bookSidebarOutline(books: readonly BookSummary[], lessons: readonly LessonSummary[], current: BookSummary): SidebarOutline {
  const toc = buildBookToc(books);
  const groups: SidebarGroup[] = [];
  if (toc.front) {
    groups.push({ key: 'book-front', title: '시작', items: [toItem(toc.front, lessons)] });
  }
  for (const unit of toc.units) {
    const name = bookUnitName(unit.unit);
    if (unit.intro) {
      groups.push({ key: `book-u${unit.unit}-intro`, title: `${name} 시작`, items: [toItem(unit.intro, lessons)] });
    }
    for (const part of unit.parts) {
      groups.push({
        key: `book-u${unit.unit}-p${part.index}`,
        title: `${name} · ${part.title}`,
        items: part.items.map((book) => toItem(book, lessons)),
      });
    }
    if (unit.review) {
      groups.push({ key: `book-u${unit.unit}-review`, title: `${name} 마무리`, items: [toItem(unit.review, lessons)] });
    }
  }
  return {
    navLabel: '교과서 차례',
    summaryLabel: '교과서 차례 펼치기',
    title: '교과서 차례',
    titleHref: withBase('book/'),
    unit: current.unit ?? 1,
    currentId: current.id,
    groups,
    showProgress: false,
  };
}
