/**
 * 교과서 쪽 데이터(판 1.4.0 — DECISIONS C131) — 순수 함수라 Vitest로 검사한다(tests/unit/book/).
 *
 * - 쪽 md(content/book/<id>.md) 하나 → BookSummary(주소·쪽 범위·매체·짝 웹 차시 이름)
 * - 교과서 차례(대단원 → 중단원 → 절): 같은 데이터를 /book/ 첫 화면·왼쪽 차례(LessonSidebar)·이전/다음 절이 함께 쓴다.
 *   차례의 순서는 **쪽 번호**가 정한다(출판본 차례와 같은 순서 — order는 보조 값).
 * - 웹 차시 "풀이·실습"(/learn/uN/<label>/)과의 짝: frontmatter lesson(차시 번호나 파일 이름)으로 잇는다. 양쪽 쪽의 전환 줄(ViewSwitch)이 쓴다.
 *
 * 주소 규칙: /book/<id>/ — content/book/2-1-2.md → /book/2-1-2/ (id는 파일 이름, 절 번호·u2-intro·u2-review·front).
 */
import type { BookData } from '../../config/content-schemas.ts';
import { getPage, type BreadcrumbItem } from '../../config/nav.ts';
import { withBase } from '../../lib/url.ts';
import type { LessonSummary } from '../lesson/lesson-data.ts';

export type BookKind = 'section' | 'intro' | 'review' | 'front';
export type BookUnitNumber = 1 | 2 | 3 | 4;
export type BookMedia = BookData['media'][number];

/** 콘텐츠 컬렉션 항목에서 쓰는 부분(astro:content의 CollectionEntry<'book'>이 이 모양을 만족한다) */
export interface BookEntryLike {
  readonly id: string;
  readonly data: BookData;
  readonly filePath?: string;
}

export interface BookSummary {
  readonly id: string;
  readonly kind: BookKind;
  /** 앞 부속(front)은 없다 */
  readonly unit?: BookUnitNumber;
  readonly title: string;
  /** 중단원(번호 포함). 절만 있다 */
  readonly part?: string;
  readonly order: number;
  /** frontmatter의 쪽 범위 글. 예: "124~131" */
  readonly pages: string;
  readonly pageStart: number;
  readonly pageEnd: number;
  /** 짝 웹 차시의 차시 번호나 파일 이름 */
  readonly lesson?: string;
  readonly media: readonly BookMedia[];
  /** 사이트 안 경로(base 없음). 예: /book/2-1-2/ */
  readonly path: string;
  /** base를 붙인 링크 */
  readonly href: string;
}

/** 쪽 id → 종류: 절 번호(2-1-2)·u2-intro·u2-review·front */
export function bookKindOf(id: string): BookKind {
  if (id === 'front') {
    return 'front';
  }
  if (id.endsWith('-intro')) {
    return 'intro';
  }
  if (id.endsWith('-review')) {
    return 'review';
  }
  return 'section';
}

/** "124~131" → { start: 124, end: 131 }, "8" → { start: 8, end: 8 }. 모양이 틀리면 null */
export function parseBookPages(pages: string): { start: number; end: number } | null {
  const match = /^([1-9]\d{0,2})(?:~([1-9]\d{0,2}))?$/u.exec(pages.trim());
  if (!match) {
    return null;
  }
  const start = Number(match[1]);
  const end = match[2] === undefined ? start : Number(match[2]);
  return end >= start ? { start, end } : null;
}

/** 쪽 범위의 모든 쪽 번호. 예: "124~126" → [124, 125, 126] */
export function bookPageList(pages: string): number[] {
  const range = parseBookPages(pages);
  return range ? Array.from({ length: range.end - range.start + 1 }, (_, index) => range.start + index) : [];
}

/** 배지·단추 글: "교과서 124~131쪽", 한 쪽이면 "교과서 8쪽" */
export function bookPagesLabel(pages: string): string {
  return `교과서 ${pages}쪽`;
}

/** 쪽 주소(base 없음) */
export function bookPath(id: string): string {
  return `/book/${id}/`;
}

export function toBookSummary(entry: BookEntryLike): BookSummary {
  const { data } = entry;
  const range = parseBookPages(data.pages) ?? { start: 0, end: 0 };
  const path = bookPath(entry.id);
  return {
    id: entry.id,
    kind: bookKindOf(entry.id),
    unit: data.unit,
    title: data.title,
    part: data.part,
    order: data.order,
    pages: data.pages,
    pageStart: range.start,
    pageEnd: range.end,
    lesson: data.lesson,
    media: data.media,
    path,
    href: withBase(path),
  };
}

/** 차례·주소에 내보낼 쪽(draft: true 제외)을 쪽 번호 순서로 */
export function publishedBooks(entries: readonly BookEntryLike[]): BookSummary[] {
  return entries
    .filter((entry) => !entry.data.draft)
    .map(toBookSummary)
    .sort((a, b) => a.pageStart - b.pageStart || a.order - b.order || a.id.localeCompare(b.id));
}

/** 순서대로 늘어놓은 쪽에서 앞뒤 쪽을 찾는다(대단원이 달라도 이어진다) */
export function findBookNeighbors(sorted: readonly BookSummary[], id: string): { previous?: BookSummary; next?: BookSummary } {
  const index = sorted.findIndex((book) => book.id === id);
  if (index < 0) {
    return {};
  }
  return { previous: sorted[index - 1], next: sorted[index + 1] };
}

/* ───────────── 교과서 차례 ───────────── */

export interface BookTocPart {
  /** 중단원 이름(번호 포함). 예: "01 디스플레이 장치 제어" */
  readonly title: string;
  /** 같은 대단원 안 몇 번째 중단원인지(1부터) — 쪽 안 #위치(unit-2-part-1)에 쓴다 */
  readonly index: number;
  readonly items: readonly BookSummary[];
}

export interface BookTocUnit {
  readonly unit: BookUnitNumber;
  /** 대단원 시작 쪽(u2-intro) */
  readonly intro?: BookSummary;
  readonly parts: readonly BookTocPart[];
  /** 대단원 마무리 쪽(u2-review) */
  readonly review?: BookSummary;
}

export interface BookToc {
  /** 앞 부속(머리말·구성과 특징) */
  readonly front?: BookSummary;
  readonly units: readonly BookTocUnit[];
}

/** 쪽 목록(쪽 번호 순서)으로 교과서 차례를 만든다. 대단원은 1~4 가운데 쪽이 있는 것만, 중단원은 처음 나온 쪽 순서 */
export function buildBookToc(books: readonly BookSummary[]): BookToc {
  const sorted = [...books].sort((a, b) => a.pageStart - b.pageStart);
  const units: BookTocUnit[] = [];
  for (const unit of [1, 2, 3, 4] as const) {
    const inUnit = sorted.filter((book) => book.unit === unit);
    if (inUnit.length === 0) {
      continue;
    }
    const parts: { title: string; index: number; items: BookSummary[] }[] = [];
    for (const book of inUnit.filter((candidate) => candidate.kind === 'section')) {
      const title = book.part ?? '';
      let part = parts.find((candidate) => candidate.title === title);
      if (!part) {
        part = { title, index: parts.length + 1, items: [] };
        parts.push(part);
      }
      part.items.push(book);
    }
    units.push({
      unit,
      intro: inUnit.find((book) => book.kind === 'intro'),
      parts,
      review: inUnit.find((book) => book.kind === 'review'),
    });
  }
  return { front: sorted.find((book) => book.kind === 'front'), units };
}

/** 대단원 번호가 정해진 쪽의 대단원 이름: "2단원"(로마 숫자는 큰 제목 앞 번호에만 — nav.ts 약속) */
export function bookUnitName(unit: number): string {
  return `${unit}단원`;
}

/** 차례·카드·이전/다음에 쓰는 짧은 번호: 절은 절 번호, 그 밖은 읽히는 이름 */
export function bookLabel(book: Pick<BookSummary, 'id' | 'kind' | 'unit'>): string {
  switch (book.kind) {
    case 'intro':
      return `${book.unit}단원 시작`;
    case 'review':
      return `${book.unit}단원 마무리`;
    case 'front':
      return '머리말';
    default:
      return book.id;
  }
}

/** 브라우저 탭·검색 결과 제목. 예: "2-1-2 LCD 제어하기 — 교과서 124~131쪽", "2단원 시작 — 교과서 114~115쪽" */
export function bookDocumentTitle(book: BookSummary): string {
  const name = book.kind === 'section' ? `${bookLabel(book)} ${book.title}` : bookLabel(book);
  return `${name} — ${bookPagesLabel(book.pages)}`;
}

/** 쪽 안 차례 #위치 이름 */
export function bookUnitAnchor(unit: number): string {
  return `unit-${unit}`;
}
export function bookPartAnchor(unit: number, partIndex: number): string {
  return `unit-${unit}-part-${partIndex}`;
}

/** 빵부스러기: 홈 › 교과서 › 2단원 › 01 디스플레이 장치 제어 › LCD 제어하기 */
export function bookBreadcrumb(book: BookSummary, toc?: BookToc): BreadcrumbItem[] {
  const home = getPage('home');
  const bookHome = withBase('book/');
  const items: BreadcrumbItem[] = [
    { label: home.label, href: home.href },
    { label: '교과서', href: bookHome },
  ];
  if (book.unit !== undefined) {
    items.push({ label: bookUnitName(book.unit), href: `${bookHome}#${bookUnitAnchor(book.unit)}` });
    if (book.part) {
      const partIndex = toc?.units.find((unit) => unit.unit === book.unit)?.parts.find((part) => part.title === book.part)?.index;
      items.push({ label: book.part, ...(partIndex ? { href: `${bookHome}#${bookPartAnchor(book.unit, partIndex)}` } : {}) });
    }
  }
  items.push({ label: book.kind === 'section' ? `${bookLabel(book)} ${book.title}` : bookLabel(book) });
  return items;
}

/* ───────────── 웹 차시(풀이·실습)와의 짝 ───────────── */

type LessonKey = Pick<LessonSummary, 'unit' | 'label' | 'slug'>;

/** 쪽의 lesson 값이 이 웹 차시를 가리키는지(차시 번호나 파일 이름, 대소문자 무시, 같은 대단원 안에서만) */
export function lessonMatchesBook(book: Pick<BookSummary, 'unit' | 'lesson'>, lesson: LessonKey): boolean {
  if (!book.lesson || book.unit !== lesson.unit) {
    return false;
  }
  const wanted = book.lesson.trim().toLowerCase();
  return lesson.label.toLowerCase() === wanted || lesson.slug.toLowerCase() === wanted;
}

/** 이 쪽의 짝 웹 차시(없으면 undefined) */
export function findPairedLesson<T extends LessonKey>(book: Pick<BookSummary, 'unit' | 'lesson'>, lessons: readonly T[]): T | undefined {
  return lessons.find((lesson) => lessonMatchesBook(book, lesson));
}

/** 이 웹 차시의 짝 쪽(없으면 undefined) */
export function findPairedBook(lesson: LessonKey, books: readonly BookSummary[]): BookSummary | undefined {
  return books.find((book) => lessonMatchesBook(book, lesson));
}

/**
 * 진도에 쓰는 id. 짝 웹 차시가 있으면 그 차시 id(u2/2-1-2 — 두 화면이 한 진도를 나눠 쓴다),
 * 없으면 쪽 전용 id(u4/book-4-2-3). src/lib/progress.ts의 모양(u1~u4 / 소문자·숫자·하이픈, 40자 안)을 지킨다.
 * 앞 부속(front)은 대단원이 없어 진도가 없다(undefined).
 */
export function bookProgressId(book: Pick<BookSummary, 'id' | 'unit'>, paired?: Pick<LessonSummary, 'id'>): string | undefined {
  if (paired) {
    return paired.id;
  }
  return book.unit === undefined ? undefined : `u${book.unit}/book-${book.id}`;
}

/**
 * 쪽을 LessonSummary 모양으로 바꾼다 — [이 차시 다 했어요]·이전/다음 부품(LessonDone)이 이 모양을 읽는다.
 * href는 쪽 주소(진도의 "이어서 하기"가 책 화면으로 돌아오게), id는 진도 id.
 */
export function bookAsLesson(book: BookSummary, paired?: Pick<LessonSummary, 'id'>): LessonSummary | undefined {
  const id = bookProgressId(book, paired);
  if (!id || book.unit === undefined) {
    return undefined;
  }
  return {
    id,
    unit: book.unit,
    slug: book.id,
    label: bookLabel(book),
    title: book.title,
    order: book.order,
    kind: book.kind === 'review' ? 'review' : 'textbook',
    description: undefined,
    pages: book.pages,
    duration: undefined,
    difficulty: undefined,
    virtualOk: undefined,
    lab: undefined,
    standards: [],
    materials: [],
    path: book.path,
    href: book.href,
  };
}
