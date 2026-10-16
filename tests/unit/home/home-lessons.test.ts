// 홈 차례·차시 목록 자료(src/components/home/home-lessons.ts) — 판 1.4.0, DECISIONS C132.
// 교과서 쪽(book)·웹 차시(lessons)를 가짜로 만들어 넣고, 카드가 어디로 이어지는지·보충 차시·갈 곳 없는 절·차례 그림 링크·좁은 화면 차례 목록을 확인한다.
import { describe, expect, it } from 'vitest';
import { toBookSummary, type BookSummary } from '../../../src/components/book/book-data.ts';
import {
  allCards,
  buildHomeUnits,
  buildTocFigures,
  buildTocList,
  firstPracticeStart,
  firstStart,
  unitStats,
  unitTitleOf,
  type HomeCard,
  type HomeUnit,
} from '../../../src/components/home/home-lessons.ts';
import { publishedLessons } from '../../../src/components/lesson/lesson-data.ts';
import { BOOK_OUTLINE_SECTIONS } from '../../../src/config/book-outline.ts';
import { learnUnits } from '../../../src/config/nav.ts';

function book(id: string, title: string, unit: number, part: string, pages: string, media: readonly string[] = ['board'], lessonLabel?: string): BookSummary {
  return toBookSummary({
    id,
    data: { id, title, unit, part, order: 1, pages, ...(lessonLabel ? { lesson: lessonLabel } : {}), media, draft: false, fidelity_exceptions: [] } as never,
  });
}

function build(books: readonly BookSummary[], lessons: ReturnType<typeof publishedLessons>): HomeUnit[] {
  return buildHomeUnits(learnUnits, books, lessons);
}

function find(units: readonly HomeUnit[], label: string): HomeCard {
  const card = allCards(units).find((candidate) => candidate.label === label);
  if (!card) {
    throw new Error(`카드 ${label}이(가) 없어요`);
  }
  return card;
}

describe('buildHomeUnits — 아무 쪽 파일도 웹 차시도 없을 때(출판본 차례만)', () => {
  const units = build([], []);

  it('대단원 4개이고 이름은 "1단원" 꼴, 대단원 제목은 로마 숫자를 뗀 글이다', () => {
    expect(units.map((unit) => unit.name)).toEqual(['1단원', '2단원', '3단원', '4단원']);
    expect(units.map((unit) => unit.title)).toEqual(learnUnits.map((unit) => unitTitleOf(unit)));
    expect(unitTitleOf({ label: 'II. 피지컬 컴퓨팅' })).toBe('피지컬 컴퓨팅');
  });

  it('출판본의 절 32개가 모두 한 번씩 보이고 갈 곳은 없다(링크 없이 이름만)', () => {
    const sections = allCards(units).filter((card) => card.kind === 'section');
    expect(sections.map((card) => card.label)).toEqual(BOOK_OUTLINE_SECTIONS.map((section) => section.id));
    expect(new Set(sections.map((card) => card.key)).size).toBe(32);
    for (const card of sections) {
      expect(card.target, card.label).toBe('none');
      expect(card.href, card.label).toBeUndefined();
      expect(card.progressId, card.label).toBeUndefined();
      expect(card.pagesLabel, card.label).toMatch(/^교과서 \d+(?:~\d+)?쪽$/u);
    }
  });

  it('중단원 묶음 이름은 출판본 그대로(번호 포함)이고, 교과서 중단원의 "원고가 없어…" 안내는 홈에 붙지 않는다', () => {
    const titles = units.flatMap((unit) => unit.groups.map((group) => group.title));
    expect(titles).toContain('03 페이스 메시');
    expect(titles).toContain('02 인공지능 신호 기반 물리적 피드백 시스템 제작');
    for (const group of units.flatMap((unit) => unit.groups)) {
      if (/^0\d /u.test(group.title)) {
        expect(group.description, group.title).toBeUndefined();
      }
    }
  });

  it('4-2-3(웹 차시 없는 절)은 4-2-2 바로 뒤, 같은 중단원 묶음에 있다', () => {
    const group = units[3]!.groups.find((candidate) => candidate.title.startsWith('02 '))!;
    expect(group.cards.map((card) => card.label)).toEqual(['4-2-1', '4-2-2', '4-2-3']);
  });

  it('대단원 마무리하기 카드가 4개(각 대단원 맨 끝 묶음)이고 쪽 범위는 출판본 그대로다', () => {
    const reviews = allCards(units).filter((card) => card.kind === 'review');
    expect(reviews.map((card) => card.label)).toEqual(['1단원', '2단원', '3단원', '4단원']);
    expect(reviews.map((card) => card.pagesLabel)).toEqual(['교과서 112~113쪽', '교과서 180~181쪽', '교과서 208~209쪽', '교과서 290~291쪽']);
    for (const unit of units) {
      expect(unit.groups.at(-1)!.cards.at(-1)!.kind, unit.name).toBe('review');
    }
  });

  it('차례표의 보충 차시(V1~V5·C1~C3·P1·IV-프로젝트)는 "웹에서 더함"이고 쪽이 없다', () => {
    const webOnly = allCards(units).filter((card) => card.webOnly);
    expect(webOnly.map((card) => card.label)).toEqual(['V1', 'V2', 'V3', 'V4', 'V5', 'P1', 'C1', 'C2', 'C3', 'IV-프로젝트']);
    for (const card of webOnly) {
      expect(card.pagesLabel, card.label).toBeUndefined();
    }
  });
});

describe('buildHomeUnits — 카드가 가는 곳', () => {
  const lessons = publishedLessons([
    { id: 'u2/2-1-2', data: { title: 'LCD 제어하기(웹)', unit: 2, order: 2, kind: 'textbook', label: '2-1-2', pages: '124~131', standards: [], materials: [], examples: [] } as never },
    { id: 'u2/2-1-3', data: { title: 'OLED 제어하기', unit: 2, order: 3, kind: 'textbook', label: '2-1-3', pages: '132~140', standards: [], materials: [], examples: [] } as never },
    { id: 'u1/v1', data: { title: '사진은 숫자다', unit: 1, order: 3.1, kind: 'supplement', label: 'V1', standards: [], materials: [], examples: [] } as never },
    { id: 'u1/review', data: { title: '대단원 마무리', unit: 1, order: 99, kind: 'review', label: 'I-마무리', pages: '112~113', standards: [], materials: [], examples: [] } as never },
    { id: 'u2/2-1-r', data: { title: '인공지능 시대의 OLED 디스플레이', unit: 2, order: 3.5, kind: 'reading', label: '2-1-R', pages: '141', standards: [], materials: [], examples: [] } as never },
  ]);
  const lcdBook = book('2-1-2', 'LCD 제어하기', 2, '01 디스플레이 장치 제어', '116~131', ['board'], '2-1-2');

  it('웹 차시만 있는 절은 풀이·실습(웹 차시)으로, 진도는 그 차시 id로', () => {
    const card = find(build([], lessons), '2-1-3');
    expect(card.target).toBe('lesson');
    expect(card.href).toBe('/ai-physical-computing/learn/u2/2-1-3/');
    expect(card.progressId).toBe('u2/2-1-3');
    expect(card.title).toBe('OLED 제어하기');
  });

  it('교과서 쪽이 있으면 교과서 쪽으로 — 제목·쪽·매체는 쪽 파일 값이 먼저, 진도는 짝 웹 차시 id', () => {
    const card = find(build([lcdBook], lessons), '2-1-2');
    expect(card.target).toBe('book');
    expect(card.href).toBe('/ai-physical-computing/book/2-1-2/');
    expect(card.title).toBe('LCD 제어하기');
    expect(card.pagesLabel).toBe('교과서 116~131쪽');
    expect(card.media).toEqual(['board']);
    expect(card.progressId).toBe('u2/2-1-2');
  });

  it('쪽 파일의 매체가 어림값(차례)보다 먼저다', () => {
    const noMedia = book('2-1-2', 'LCD 제어하기', 2, '01 디스플레이 장치 제어', '124~131', []);
    expect(find(build([noMedia], lessons), '2-1-2').media).toEqual([]);
    expect(find(build([], lessons), '2-1-2').media).toEqual(['board']);
  });

  it('웹 차시 없이 쪽 파일만 있는 절(4-2-3)은 교과서 쪽으로 가고 진도 id는 쪽 전용이다', () => {
    const only = book('4-2-3', '세상과 나를 잇는 인공지능 보조기구', 4, '02 인공지능 신호 기반 물리적 피드백 시스템 제작', '286~289', []);
    const card = find(build([only], lessons), '4-2-3');
    expect(card.target).toBe('book');
    expect(card.href).toBe('/ai-physical-computing/book/4-2-3/');
    expect(card.progressId).toBe('u4/book-4-2-3');
  });

  it('보충 차시는 "웹에서 더함"이고 웹 차시로 간다(교과서 쪽이 없다)', () => {
    const card = find(build([lcdBook], lessons), 'V1');
    expect(card).toMatchObject({ kind: 'supplement', webOnly: true, target: 'lesson', href: '/ai-physical-computing/learn/u1/v1/', progressId: 'u1/v1' });
    expect(card.pagesLabel).toBeUndefined();
  });

  it('읽기 자료(2-1-R)는 "웹에서 더함"이 아니고 교과서 141쪽을 보인다', () => {
    const card = find(build([], lessons), '2-1-R');
    expect(card).toMatchObject({ kind: 'reading', webOnly: false, target: 'lesson', pagesLabel: '교과서 141쪽' });
  });

  it('대단원 마무리: 웹 마무리 차시만 있으면 웹으로, 교과서 마무리 쪽이 생기면 그 쪽으로', () => {
    const onlyWeb = find(build([], lessons), '1단원');
    expect(onlyWeb).toMatchObject({ kind: 'review', target: 'lesson', href: '/ai-physical-computing/learn/u1/review/' });
    const withBook = find(build([book('u1-review', '대단원 마무리하기', 1, '', '112~113', [])], lessons), '1단원');
    expect(withBook).toMatchObject({ target: 'book', href: '/ai-physical-computing/book/u1-review/', progressId: 'u1/review' });
  });

  it('draft가 아닌 쪽만 카드가 된다는 약속은 부르는 쪽(publishedBooks)이 지킨다 — 빈 목록이면 모두 갈 곳 없음', () => {
    expect(allCards(build([], [])).every((card) => card.target === 'none')).toBe(true);
  });
});

describe('단원 진도 id', () => {
  it('중복 없이 카드 차례로 모은다(진도를 셀 차시가 없는 카드는 빠진다)', () => {
    const lessons = publishedLessons([
      { id: 'u2/2-1-1', data: { title: '피지컬 컴퓨팅 및 개발 환경의 이해', unit: 2, order: 1, kind: 'textbook', label: '2-1-1', standards: [], materials: [], examples: [] } as never },
      { id: 'u2/2-1-2', data: { title: 'LCD 제어하기', unit: 2, order: 2, kind: 'textbook', label: '2-1-2', standards: [], materials: [], examples: [] } as never },
    ]);
    const units = build([], lessons);
    expect(units[1]!.progressIds).toEqual(['u2/2-1-1', 'u2/2-1-2']);
    expect(units[0]!.progressIds).toEqual([]);
  });
});

describe('firstStart — [1단원부터 시작]이 가는 곳', () => {
  it('1단원 첫 절의 교과서 쪽(없으면 웹 차시)이다. 갈 곳이 하나도 없으면 undefined', () => {
    const lessons = publishedLessons([
      { id: 'u1/1-1-1', data: { title: '인공지능 응용 프로그램과 에이전트', unit: 1, order: 1, kind: 'textbook', label: '1-1-1', standards: [], materials: [], examples: [] } as never },
    ]);
    expect(firstStart(build([], lessons))).toMatchObject({ label: '1-1-1', href: '/ai-physical-computing/learn/u1/1-1-1/' });
    const first = book('1-1-1', '인공지능 응용 프로그램과 에이전트', 1, '01 인공지능과 인식', '8~12', []);
    expect(firstStart(build([first], lessons))).toMatchObject({ href: '/ai-physical-computing/book/1-1-1/' });
    expect(firstStart(build([], []))).toBeUndefined();
  });
});

describe('firstPracticeStart — [학생 처음부터 배우기]가 가는 곳(판 1.6.0, C172·C173)', () => {
  const lessons = publishedLessons([
    { id: 'u1/1-1-1', data: { title: '인공지능 응용 프로그램과 에이전트', unit: 1, order: 1, kind: 'textbook', label: '1-1-1', standards: [], materials: [], examples: [] } as never },
  ]);

  it('교과서 쪽이 있어도 짝 웹 차시(따라 하기 — 코드·실습이 있는 쪽)로 간다. 카드의 href는 교과서 쪽 그대로', () => {
    const first = book('1-1-1', '인공지능 응용 프로그램과 에이전트', 1, '01 인공지능과 인식', '8~12', []);
    const units = build([first], lessons);
    expect(firstStart(units)).toMatchObject({ href: '/ai-physical-computing/book/1-1-1/' });
    expect(firstPracticeStart(units)).toMatchObject({ label: '1-1-1', href: '/ai-physical-computing/learn/u1/1-1-1/' });
    expect(find(units, '1-1-1')).toMatchObject({ href: '/ai-physical-computing/book/1-1-1/', lessonHref: '/ai-physical-computing/learn/u1/1-1-1/' });
  });

  it('웹 차시가 하나도 없으면(교과서 쪽만) undefined — 부르는 쪽이 교과서 쪽으로 물러난다', () => {
    const first = book('1-1-1', '인공지능 응용 프로그램과 에이전트', 1, '01 인공지능과 인식', '8~12', []);
    expect(firstPracticeStart(build([first], []))).toBeUndefined();
    expect(firstPracticeStart(build([], []))).toBeUndefined();
  });

  it('웹 차시만 있어도 웹 차시 주소다(카드 href와 lessonHref가 같다)', () => {
    const units = build([], lessons);
    expect(firstPracticeStart(units)).toMatchObject({ href: '/ai-physical-computing/learn/u1/1-1-1/' });
    expect(find(units, '1-1-1').lessonHref).toBe('/ai-physical-computing/learn/u1/1-1-1/');
  });
});

describe('unitStats — 단원 카드의 숫자와 처음 할 차시(판 1.6.0)', () => {
  const lessons = publishedLessons([
    { id: 'u1/1-1-1', data: { title: '인공지능 응용 프로그램과 에이전트', unit: 1, order: 1, kind: 'textbook', label: '1-1-1', standards: [], materials: [], examples: [] } as never },
    { id: 'u1/1-1-2', data: { title: '손 인식', unit: 1, order: 2, kind: 'textbook', label: '1-1-2', standards: [], materials: [], examples: [] } as never },
    { id: 'u1/v1', data: { title: '사진은 숫자다', unit: 1, order: 3.1, kind: 'supplement', label: 'V1', standards: [], materials: [], examples: [] } as never },
    { id: 'u1/v2', data: { title: '픽셀', unit: 1, order: 3.2, kind: 'supplement', label: 'V2', standards: [], materials: [], examples: [] } as never },
  ]);

  it('열 수 있는 편(링크가 있는 카드)만 세고, 그 가운데 사이트가 더한 편 수를 따로 센다', () => {
    const stats = unitStats(build([], lessons)[0]!);
    expect(stats.total).toBe(4);
    expect(stats.webOnly).toBe(2);
    expect(stats.first).toEqual({ label: '1-1-1', title: '인공지능 응용 프로그램과 에이전트' });
  });

  it('갈 곳이 없는 카드(링크 없이 이름만)는 세지 않는다 — 아무것도 없으면 0편이고 처음 할 차시도 없다', () => {
    const stats = unitStats(build([], [])[1]!);
    expect(stats).toEqual({ total: 0, webOnly: 0 });
  });

  it('단원 설명은 사이트 지도(nav.ts)의 한 줄 설명이다', () => {
    const units = build([], []);
    expect(units.map((unit) => unit.description)).toEqual(learnUnits.map((unit) => unit.description));
    expect(units[0]!.description).toContain('카메라');
  });
});

describe('buildTocFigures — 차례 그림 위 링크', () => {
  const lessons = publishedLessons([
    { id: 'u2/2-1-2', data: { title: 'LCD 제어하기', unit: 2, order: 2, kind: 'textbook', label: '2-1-2', standards: [], materials: [], examples: [] } as never },
    { id: 'u3/3-1-1', data: { title: '인공지능과 하드웨어 통신의 이해', unit: 3, order: 1, kind: 'textbook', label: '3-1-1', standards: [], materials: [], examples: [] } as never },
  ]);
  const lcdBook = book('2-1-2', 'LCD 제어하기', 2, '01 디스플레이 장치 제어', '124~131');

  it('그림은 둘이고, 갈 곳이 있는 절에만 링크가 생긴다', () => {
    const figures = buildTocFigures(build([lcdBook], lessons));
    expect(figures.map((figure) => figure.image.image)).toEqual([1, 2]);
    expect(figures[0]!.spots.map((spot) => spot.id)).toEqual(['2-1-2']);
    expect(figures[1]!.spots.map((spot) => spot.id)).toEqual(['3-1-1']);
    expect(buildTocFigures(build([], [])).flatMap((figure) => figure.spots)).toEqual([]);
  });

  it('링크는 교과서 쪽(없으면 웹 차시)으로 가고 이름에 번호와 제목이 들어 있다', () => {
    const [first, second] = buildTocFigures(build([lcdBook], lessons));
    expect(first!.spots[0]).toMatchObject({ href: '/ai-physical-computing/book/2-1-2/', label: '2-1-2 LCD 제어하기' });
    expect(second!.spots[0]).toMatchObject({ href: '/ai-physical-computing/learn/u3/3-1-1/', label: '3-1-1 인공지능과 하드웨어 통신의 이해' });
    expect(first!.spots[0]!.style).toMatch(/^left:[\d.]+%;top:[\d.]+%;width:[\d.]+%;height:[\d.]+%$/u);
  });
});

describe('buildTocList — 좁은 화면의 차례 목록', () => {
  it('교과서에 실린 것(절·마무리·읽기 자료)만, 보충 차시는 빠진다', () => {
    const list = buildTocList(build([], []));
    expect(list).toHaveLength(4);
    const labels = list.flatMap((unit) => unit.groups.flatMap((group) => group.items.map((card) => card.label)));
    // 절 32 + 대단원 마무리 4 + 읽기 자료 2-1-R(교과서 141쪽) 하나
    expect(labels).toHaveLength(32 + 4 + 1);
    expect(labels).toContain('2-1-R');
    expect(labels).not.toContain('V1');
    expect(labels).not.toContain('C1');
    expect(list[1]!.groups.map((group) => group.title)).toEqual(['01 디스플레이 장치 제어', '02 출력 장치 제어', '대단원 마무리']);
  });
});
