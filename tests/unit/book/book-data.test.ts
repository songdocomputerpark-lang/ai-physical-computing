// 교과서 쪽 데이터(src/components/book/book-data.ts, 판 1.4.0 — DECISIONS C131): 쪽 범위·차례·이웃·웹 차시와의 짝·진도 id
import { describe, expect, it } from 'vitest';
import {
  bookAsLesson,
  bookBreadcrumb,
  bookDocumentTitle,
  bookKindOf,
  bookLabel,
  bookNameParts,
  bookPageList,
  bookPagesLabel,
  bookPartAnchor,
  bookProgressId,
  bookUnitAnchor,
  buildBookToc,
  findBookNeighbors,
  findPairedBook,
  findPairedLesson,
  parseBookPages,
  publishedBooks,
  toBookSummary,
  type BookEntryLike,
} from '../../../src/components/book/book-data.ts';
import { isLessonId } from '../../../src/lib/progress.ts';
import { bookSchema } from '../../../src/config/content-schemas.ts';

function entry(id: string, fields: Record<string, unknown>): BookEntryLike {
  const data = bookSchema.parse({ id, title: `${id} 제목`, order: 1, pages: '1', ...fields });
  return { id, data };
}

const ENTRIES: BookEntryLike[] = [
  entry('2-1-2', { title: 'LCD 제어하기', unit: 2, part: '01 디스플레이 장치 제어', order: 2, pages: '124~131', lesson: '2-1-2', media: ['board'] }),
  entry('2-1-1', { title: '피지컬 컴퓨팅 및 개발 환경의 이해', unit: 2, part: '01 디스플레이 장치 제어', order: 1, pages: '116~123', lesson: '2-1-1' }),
  entry('u2-intro', { title: '피지컬 컴퓨팅', unit: 2, order: 0, pages: '114~115' }),
  entry('2-2-1', { title: '버저 제어하기', unit: 2, part: '02 출력 장치 제어', order: 1, pages: '154~160', lesson: '2-2-1' }),
  entry('u2-review', { title: '대단원 마무리하기', unit: 2, order: 9, pages: '180~181', lesson: 'review' }),
  entry('1-1-1', { title: '인공지능 응용 프로그램과 에이전트', unit: 1, part: '01 인공지능과 인식', order: 1, pages: '8~12', lesson: '1-1-1', media: ['camera'] }),
  entry('front', { title: '머리말과 구성', order: 0, pages: '2~3' }),
  entry('1-1-2', { title: '초안 쪽', unit: 1, part: '01 인공지능과 인식', order: 2, pages: '13~18', draft: true }),
];

describe('쪽 범위', () => {
  it('"124~131"과 한 쪽 "8"을 읽고, 틀린 모양은 null이다', () => {
    expect(parseBookPages('124~131')).toEqual({ start: 124, end: 131 });
    expect(parseBookPages('8')).toEqual({ start: 8, end: 8 });
    expect(parseBookPages('131~124')).toBeNull();
    expect(parseBookPages('0~3')).toBeNull();
    expect(parseBookPages('124-131')).toBeNull();
    expect(parseBookPages('')).toBeNull();
  });

  it('쪽 번호 목록과 배지 글', () => {
    expect(bookPageList('124~126')).toEqual([124, 125, 126]);
    expect(bookPageList('8')).toEqual([8]);
    expect(bookPageList('abc')).toEqual([]);
    expect(bookPagesLabel('124~131')).toBe('교과서 124~131쪽');
  });
});

describe('쪽 id와 요약', () => {
  it('id로 종류를 안다', () => {
    expect(bookKindOf('2-1-2')).toBe('section');
    expect(bookKindOf('u2-intro')).toBe('intro');
    expect(bookKindOf('u2-review')).toBe('review');
    expect(bookKindOf('front')).toBe('front');
  });

  it('쪽 요약: 주소는 /book/<id>/ + base, 쪽 범위가 숫자로 풀린다', () => {
    const summary = toBookSummary(ENTRIES[0]!);
    expect(summary).toMatchObject({ id: '2-1-2', kind: 'section', unit: 2, pageStart: 124, pageEnd: 131, path: '/book/2-1-2/', href: '/ai-physical-computing/book/2-1-2/', media: ['board'] });
  });

  it('번호 이름과 문서 제목', () => {
    const books = publishedBooks(ENTRIES);
    const byId = (id: string) => books.find((book) => book.id === id)!;
    expect(bookLabel(byId('2-1-2'))).toBe('2-1-2');
    expect(bookLabel(byId('u2-intro'))).toBe('2단원 시작');
    expect(bookLabel(byId('u2-review'))).toBe('2단원 마무리');
    expect(bookLabel(byId('front'))).toBe('머리말');
    expect(bookDocumentTitle(byId('2-1-2'))).toBe('2-1-2 LCD 제어하기 — 교과서 124~131쪽');
    expect(bookDocumentTitle(byId('u2-review'))).toBe('2단원 마무리 — 교과서 180~181쪽');
  });
});

describe('제목 앞 번호 이름(bookNameParts) — 같은 말이 겹치면 한 번만', () => {
  const books = publishedBooks(ENTRIES);
  const byId = (id: string) => books.find((book) => book.id === id)!;

  it('절은 번호와 제목을 그대로, 대단원 시작은 "2단원 시작" + 제목', () => {
    expect(bookNameParts(byId('2-1-2'))).toEqual({ label: '2-1-2', title: 'LCD 제어하기' });
    expect(bookNameParts(byId('u2-intro'))).toEqual({ label: '2단원 시작', title: '피지컬 컴퓨팅' });
  });

  it('제목이 번호 이름의 끝 낱말을 이미 말하면(머리말·마무리) 번호 이름은 비고 출판본 제목은 그대로다', () => {
    expect(bookNameParts({ ...byId('front'), title: '머리말과 이 책의 구성과 특징' })).toEqual({ label: '', title: '머리말과 이 책의 구성과 특징' });
    expect(bookNameParts(byId('u2-review'))).toEqual({ label: '', title: '대단원 마무리하기' });
    // 제목이 다른 말이면 번호 이름이 남는다
    expect(bookNameParts({ ...byId('front'), title: '이 책의 구성' })).toEqual({ label: '머리말', title: '이 책의 구성' });
    expect(bookNameParts({ ...byId('u2-review'), title: '정리 문제' })).toEqual({ label: '2단원 마무리', title: '정리 문제' });
  });
});

describe('공개 쪽 목록과 이웃', () => {
  it('초안은 빼고 쪽 번호 순서로 늘어놓는다', () => {
    const books = publishedBooks(ENTRIES);
    expect(books.map((book) => book.id)).toEqual(['front', '1-1-1', 'u2-intro', '2-1-1', '2-1-2', '2-2-1', 'u2-review']);
  });

  it('이전·다음 쪽은 대단원이 달라도 이어진다', () => {
    const books = publishedBooks(ENTRIES);
    expect(findBookNeighbors(books, '2-1-2')).toMatchObject({ previous: { id: '2-1-1' }, next: { id: '2-2-1' } });
    expect(findBookNeighbors(books, 'front').previous).toBeUndefined();
    expect(findBookNeighbors(books, 'u2-review').next).toBeUndefined();
    expect(findBookNeighbors(books, '1-1-1')).toMatchObject({ previous: { id: 'front' }, next: { id: 'u2-intro' } });
    expect(findBookNeighbors(books, 'nope')).toEqual({});
  });
});

describe('교과서 차례(대단원 > 중단원 > 절)', () => {
  const toc = buildBookToc(publishedBooks(ENTRIES));

  it('앞 부속, 쪽이 있는 대단원만, 중단원은 처음 나온 쪽 순서', () => {
    expect(toc.front?.id).toBe('front');
    expect(toc.units.map((unit) => unit.unit)).toEqual([1, 2]);
    const two = toc.units[1]!;
    expect(two.intro?.id).toBe('u2-intro');
    expect(two.review?.id).toBe('u2-review');
    expect(two.parts.map((part) => [part.index, part.title, part.items.map((item) => item.id)])).toEqual([
      [1, '01 디스플레이 장치 제어', ['2-1-1', '2-1-2']],
      [2, '02 출력 장치 제어', ['2-2-1']],
    ]);
  });

  it('#위치 이름과 빵부스러기: 홈 › 교과서 › 2단원 › 중단원 › 절', () => {
    expect(bookUnitAnchor(2)).toBe('unit-2');
    expect(bookPartAnchor(2, 1)).toBe('unit-2-part-1');
    const crumbs = bookBreadcrumb(publishedBooks(ENTRIES).find((book) => book.id === '2-1-2')!, toc);
    expect(crumbs.map((crumb) => crumb.label)).toEqual(['홈', '교과서', '2단원', '01 디스플레이 장치 제어', '2-1-2 LCD 제어하기']);
    expect(crumbs[1]?.href).toBe('/ai-physical-computing/book/');
    expect(crumbs[2]?.href).toBe('/ai-physical-computing/book/#unit-2');
    expect(crumbs[3]?.href).toBe('/ai-physical-computing/book/#unit-2-part-1');
    expect(crumbs[4]?.href).toBeUndefined();
  });
});

describe('웹 차시(풀이·실습)와의 짝', () => {
  const lessons = [
    { id: 'u2/2-1-2', unit: 2 as const, label: '2-1-2', slug: '2-1-2' },
    { id: 'u2/2-1-1', unit: 2 as const, label: '2-1-1', slug: '2-1-1' },
    { id: 'u1/review', unit: 1 as const, label: 'I-마무리', slug: 'review' },
    { id: 'u2/review', unit: 2 as const, label: 'II-마무리', slug: 'review' },
    { id: 'u1/v1', unit: 1 as const, label: 'V1', slug: 'v1' },
  ];
  const books = publishedBooks(ENTRIES);

  it('lesson 칸은 차시 번호나 파일 이름과 같은 대단원 안에서만 짝이 된다(대소문자 무시)', () => {
    expect(findPairedLesson(books.find((book) => book.id === '2-1-2')!, lessons)?.id).toBe('u2/2-1-2');
    expect(findPairedLesson(books.find((book) => book.id === 'u2-review')!, lessons)?.id).toBe('u2/review');
    expect(findPairedLesson(books.find((book) => book.id === 'front')!, lessons)).toBeUndefined();
    expect(findPairedLesson({ unit: 1, lesson: 'v1' }, lessons)?.id).toBe('u1/v1');
    expect(findPairedLesson({ unit: 3, lesson: 'v1' }, lessons)).toBeUndefined();
  });

  it('웹 차시에서 교과서 쪽을 찾는다 — 짝이 없으면(보충 차시) undefined', () => {
    expect(findPairedBook(lessons[0]!, books)?.id).toBe('2-1-2');
    expect(findPairedBook(lessons[3]!, books)?.id).toBe('u2-review');
    expect(findPairedBook(lessons[2]!, books)).toBeUndefined();
    expect(findPairedBook(lessons[4]!, books)).toBeUndefined();
  });

  it('진도 id: 짝이 있으면 그 차시 id(두 화면이 한 진도), 없으면 쪽 전용 id — 둘 다 progress.ts가 받는 모양', () => {
    const [lcd, review4] = [books.find((book) => book.id === '2-1-2')!, { id: 'u4-review', unit: 4 as const }];
    expect(bookProgressId(lcd, lessons[0])).toBe('u2/2-1-2');
    expect(bookProgressId(review4)).toBe('u4/book-u4-review');
    expect(isLessonId(bookProgressId(review4))).toBe(true);
    expect(bookProgressId({ id: 'front', unit: undefined })).toBeUndefined();
    expect(isLessonId('u4/book-4-2-3')).toBe(true);
  });

  it('[이 차시 다 했어요]용 요약: 주소는 쪽 주소, 앞 부속은 없다', () => {
    const lcd = books.find((book) => book.id === '2-1-2')!;
    const summary = bookAsLesson(lcd, lessons[0]);
    expect(summary).toMatchObject({ id: 'u2/2-1-2', unit: 2, label: '2-1-2', href: '/ai-physical-computing/book/2-1-2/', kind: 'textbook' });
    expect(bookAsLesson(books.find((book) => book.id === 'u2-review')!)?.kind).toBe('review');
    expect(bookAsLesson(books.find((book) => book.id === 'front')!)).toBeUndefined();
  });
});
