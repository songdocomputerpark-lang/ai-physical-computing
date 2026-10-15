/**
 * 홈의 "차례"(HomeToc)와 "차시 목록"(HomeLessons)이 함께 쓰는 자료를 만든다(판 1.4.0 — DECISIONS C132). 순수 함수라 Vitest로 검사한다(tests/unit/home/home-lessons.test.ts).
 *
 * 재료
 *  - 출판본 차례(src/config/book-outline.ts): 절 32개·중단원 9개·대단원 마무리 4개의 이름과 쪽 — 쪽 파일이 아직 없어도 홈이 모든 절을 보이게 한다.
 *  - 교과서 쪽(content/book/<id>.md → BookSummary): 있으면 **카드가 그 쪽(/book/<id>/)으로** 이어지고, 이름·쪽·매체도 쪽 파일 값이 먼저다.
 *  - 웹 차시(content/lessons → LessonSummary, 차례표 curriculum.ts): 쪽 파일이 없는 절은 짝 웹 차시(/learn/…)로 이어진다. 책에 없는 보충 차시(V1~V5·P1·C1~C3·IV-프로젝트)는 "웹에서 더함" 카드로 웹 차시에 이어진다.
 *  → 새 교과서 md(또는 새 웹 차시 md)를 넣으면 코드를 고치지 않아도 카드가 바뀌거나 늘어난다.
 *
 * 카드가 가는 곳(target): 'book'(교과서 쪽) → 'lesson'(웹 차시) → 'none'(둘 다 없음 — 링크 없이 이름만).
 * 진도(다 했어요·열어 봤어요)는 HTML에 굽지 않는다 — 카드의 progressId를 data-progress-lesson에 달면 progress-paint.ts가 칠한다.
 */
import {
  BOOK_OUTLINE_REVIEWS,
  BOOK_OUTLINE_SECTIONS,
  findOutlinePart,
  findOutlineSection,
  type OutlineMedia,
  type OutlineUnit,
} from '../../config/book-outline.ts';
import { BOOK_TOC_IMAGES, BOOK_TOC_SPOTS, spotStyle, type BookTocImage } from '../../config/book-toc-spots.ts';
import type { LearnUnit } from '../../config/nav.ts';
import { bookPagesLabel, bookProgressId, type BookSummary } from '../book/book-data.ts';
import { buildUnitOutline, type LessonSummary, type OutlineItem, type OutlineSection } from '../lesson/lesson-data.ts';

export type HomeCardKind = 'section' | 'review' | 'reading' | 'supplement';
export type HomeCardTarget = 'book' | 'lesson' | 'none';

export interface HomeCard {
  /** 쪽 안에서 겹치지 않는 이름 */
  readonly key: string;
  readonly kind: HomeCardKind;
  /** 카드의 번호 글자: 절 "2-1-2", 대단원 마무리하기 "1단원", 보충 "V1" */
  readonly label: string;
  readonly title: string;
  /** "교과서 124~131쪽". 책에 없는 보충 차시는 없다 */
  readonly pagesLabel?: string;
  readonly media: readonly OutlineMedia[];
  /** 카드가 가는 곳(base 포함). target이 'none'이면 없다 */
  readonly href?: string;
  readonly target: HomeCardTarget;
  /** 진도 칠하기에 쓰는 차시 id(u2/2-1-2). 웹 차시나 교과서 쪽이 하나도 없으면 없다 */
  readonly progressId?: string;
  /** 책에 없고 사이트가 더한 차시("웹에서 더함" 알약) */
  readonly webOnly: boolean;
}

export interface HomeGroup {
  readonly key: string;
  /** 중단원 이름(번호 포함 — 출판본 그대로)이나 보충 묶음 이름 */
  readonly title: string;
  readonly description?: string;
  readonly cards: readonly HomeCard[];
}

export interface HomeUnit {
  readonly unit: OutlineUnit;
  /** "1단원" */
  readonly name: string;
  /** 로마 숫자를 뗀 대단원 이름 */
  readonly title: string;
  /** 대단원 차시 목록(배우기 쪽) */
  readonly href: string;
  readonly groups: readonly HomeGroup[];
  /** 단원 진도를 셀 차시 id(중복 없음, 카드 차례) */
  readonly progressIds: readonly string[];
}

/** 큰 제목 앞 로마 숫자 번호를 뗀 대단원 이름: "II. 피지컬 컴퓨팅" → "피지컬 컴퓨팅" */
export function unitTitleOf(unit: Pick<LearnUnit, 'label'>): string {
  return unit.label.replace(/^[IV]+\.\s*/u, '');
}

function sectionNo(id: string): number {
  return Number(id.split('-')[2] ?? 0);
}

/** 차례표 묶음 key "u1-02" → 중단원 번호 2. 보충·마무리 묶음은 undefined */
function partIndexOfKey(key: string): number | undefined {
  const match = /^u\d-(\d{2})$/u.exec(key);
  return match ? Number(match[1]) : undefined;
}

interface CardSources {
  readonly booksById: ReadonlyMap<string, BookSummary>;
}

function sectionCard(id: string, sources: CardSources, lesson: LessonSummary | undefined): HomeCard {
  const outline = findOutlineSection(id);
  const book = sources.booksById.get(id);
  const title = book?.title ?? outline?.title ?? lesson?.title ?? id;
  const pages = book?.pages ?? outline?.pages;
  const target: HomeCardTarget = book ? 'book' : lesson ? 'lesson' : 'none';
  const href = book?.href ?? lesson?.href;
  const progressId = book ? bookProgressId(book, lesson) : lesson?.id;
  return {
    key: `sec-${id}`,
    kind: 'section',
    label: id,
    title,
    ...(pages ? { pagesLabel: bookPagesLabel(pages) } : {}),
    media: book ? book.media : (outline?.media ?? []),
    ...(href ? { href } : {}),
    target,
    ...(progressId ? { progressId } : {}),
    webOnly: false,
  };
}

function reviewCard(unit: OutlineUnit, sources: CardSources, lesson: LessonSummary | undefined): HomeCard {
  const outline = BOOK_OUTLINE_REVIEWS.find((candidate) => candidate.unit === unit);
  const book = sources.booksById.get(`u${unit}-review`);
  const pages = book?.pages ?? outline?.pages ?? lesson?.pages;
  const target: HomeCardTarget = book ? 'book' : lesson ? 'lesson' : 'none';
  const href = book?.href ?? lesson?.href;
  const progressId = book ? bookProgressId(book, lesson) : lesson?.id;
  return {
    key: `review-u${unit}`,
    kind: 'review',
    label: `${unit}단원`,
    title: book?.title ?? outline?.title ?? '대단원 마무리하기',
    ...(pages ? { pagesLabel: bookPagesLabel(pages) } : {}),
    media: book ? book.media : [],
    ...(href ? { href } : {}),
    target,
    ...(progressId ? { progressId } : {}),
    webOnly: false,
  };
}

/** 웹 차시 md만 있는 카드: 보충(책에 없음 → "웹에서 더함")·읽기 자료(책의 한 쪽을 따로 뗀 것) */
function webOnlyCard(item: OutlineItem): HomeCard {
  const lesson = item.lesson;
  const isSupplement = item.kind === 'supplement' || (item.kind === 'reading' && item.source === 'supplement');
  const pages = isSupplement ? undefined : (lesson?.pages ?? item.pages);
  const hasLesson = lesson !== undefined;
  return {
    key: `web-${item.key}`,
    kind: isSupplement ? 'supplement' : 'reading',
    label: item.label,
    title: lesson?.title ?? item.title,
    ...(pages && /^\d/u.test(pages) ? { pagesLabel: bookPagesLabel(pages.replace(/^0+/u, '').replace(/~0+/u, '~')) } : {}),
    media: [],
    ...(lesson ? { href: lesson.href } : {}),
    target: hasLesson ? 'lesson' : 'none',
    ...(lesson ? { progressId: lesson.id } : {}),
    webOnly: isSupplement,
  };
}

/** 대단원 하나의 묶음 목록(웹 차시 뼈대 + 교과서 쪽·출판본 차례를 덧댄다) */
function buildUnitGroups(unit: OutlineUnit, lessons: readonly LessonSummary[], sources: CardSources): HomeGroup[] {
  const outline: OutlineSection[] = buildUnitOutline(unit, lessons);
  const consumed = new Set<string>();
  interface WorkingGroup {
    key: string;
    title: string;
    description?: string;
    partIndex?: number;
    cards: HomeCard[];
  }
  const groups: WorkingGroup[] = outline.map((section) => {
    const partIndex = partIndexOfKey(section.key);
    const part = partIndex ? findOutlinePart(unit, partIndex) : undefined;
    const cards: HomeCard[] = section.items.map((item) => {
      const sectionId = findOutlineSection(item.label)?.id;
      if (sectionId) {
        consumed.add(sectionId);
        return sectionCard(sectionId, sources, item.lesson);
      }
      if (item.kind === 'review') {
        consumed.add(`u${unit}-review`);
        return reviewCard(unit, sources, item.lesson);
      }
      return webOnlyCard(item);
    });
    return {
      key: section.key,
      title: part?.title ?? section.title,
      // 보충 묶음의 설명("건너뛰어도 돼요")만 보인다. 교과서 중단원의 설명은 "원고가 없어 사이트가 썼다"는 배우기 쪽 안내라 교과서 흐름의 홈에서는 뺀다.
      ...(section.description && !partIndex ? { description: section.description } : {}),
      ...(partIndex ? { partIndex } : {}),
      cards,
    };
  });

  // 출판본 차례에는 있는데 웹 차시가 없는 절(예: 4-2-3) — 같은 중단원 묶음의 제 자리에 끼운다
  for (const entry of BOOK_OUTLINE_SECTIONS.filter((candidate) => candidate.unit === unit && !consumed.has(candidate.id))) {
    const card = sectionCard(entry.id, sources, undefined);
    let group = groups.find((candidate) => candidate.partIndex === entry.part);
    if (!group) {
      const part = findOutlinePart(unit, entry.part);
      group = { key: `u${unit}-0${entry.part}`, title: part?.title ?? `0${entry.part}`, partIndex: entry.part, cards: [] };
      const at = groups.findIndex((candidate) => (candidate.partIndex ?? 99) > entry.part || candidate.key.endsWith('-review'));
      groups.splice(at < 0 ? groups.length : at, 0, group);
    }
    const insertAfter = group.cards.reduce((found, existing, index) => (existing.kind === 'section' && sectionNo(existing.label) < sectionNo(entry.id) ? index : found), -1);
    group.cards.splice(insertAfter + 1, 0, card);
  }

  // 대단원 마무리하기 — 웹 마무리 차시가 없는 대단원(4단원)도 교과서 쪽만으로 카드를 둔다
  if (!consumed.has(`u${unit}-review`)) {
    const card = reviewCard(unit, sources, undefined);
    groups.push({ key: `u${unit}-review`, title: '대단원 마무리', cards: [card] });
  }

  return groups.filter((group) => group.cards.length > 0);
}

/**
 * 홈의 대단원 4개 자료. books는 draft가 아닌 교과서 쪽(publishedBooks), lessons는 공개 차시(publishedLessons), units는 nav.ts의 learnUnits.
 */
export function buildHomeUnits(units: readonly LearnUnit[], books: readonly BookSummary[], lessons: readonly LessonSummary[]): HomeUnit[] {
  const sources: CardSources = { booksById: new Map(books.map((book) => [book.id, book])) };
  return units.map((unit) => {
    const groups = buildUnitGroups(unit.unit, lessons, sources);
    const ids: string[] = [];
    for (const group of groups) {
      for (const card of group.cards) {
        if (card.progressId && !ids.includes(card.progressId)) {
          ids.push(card.progressId);
        }
      }
    }
    return Object.freeze({
      unit: unit.unit,
      name: `${unit.unit}단원`,
      title: unitTitleOf(unit),
      href: unit.href,
      groups: Object.freeze(groups.map((group) => Object.freeze({ ...group, cards: Object.freeze(group.cards) }))),
      progressIds: Object.freeze(ids),
    });
  });
}

/** 모든 카드를 한 줄로 */
export function allCards(units: readonly HomeUnit[]): HomeCard[] {
  return units.flatMap((unit) => unit.groups.flatMap((group) => group.cards));
}

/** 첫 시작 단추가 가는 곳: 1단원의 첫 카드(링크가 있는 첫 절) */
export function firstStart(units: readonly HomeUnit[]): { readonly href: string; readonly label: string; readonly title: string } | undefined {
  const first = units[0]?.groups.flatMap((group) => group.cards).find((card) => card.kind === 'section' && card.href);
  return first?.href ? { href: first.href, label: first.label, title: first.title } : undefined;
}

/* ───────────── 차례 그림 위 링크 ───────────── */

export interface HomeTocSpot {
  readonly id: string;
  readonly image: 1 | 2;
  /** CSS 한 줄(left·top·width·height — %) */
  readonly style: string;
  readonly href: string;
  /** 눈에 보이지 않는 링크의 이름(스크린 리더가 읽음): "2-1-2 LCD 제어하기" */
  readonly label: string;
}

export interface HomeTocFigure {
  readonly image: BookTocImage;
  readonly spots: readonly HomeTocSpot[];
}

/** 차례 그림 둘과 그 위의 링크. 갈 곳이 없는 절(쪽 파일도 웹 차시도 없음)의 링크는 만들지 않는다. */
export function buildTocFigures(units: readonly HomeUnit[]): HomeTocFigure[] {
  const bySectionId = new Map(allCards(units).filter((card) => card.kind === 'section').map((card) => [card.label, card]));
  return BOOK_TOC_IMAGES.map((image) => ({
    image,
    spots: BOOK_TOC_SPOTS.filter((spot) => spot.image === image.image).flatMap((spot) => {
      const card = bySectionId.get(spot.id);
      if (!card?.href) {
        return [];
      }
      // 쪽은 그림 속 차례에 인쇄돼 있고 HTML 크기를 줄이려고 이름(title·aria-label)에는 번호와 제목만 둔다(홈 HTML 사전 캐시 한도 160KB)
      const label = `${card.label} ${card.title}`;
      return [{ id: spot.id, image: spot.image, style: spotStyle(spot), href: card.href, label }];
    }),
  }));
}

/* ───────────── 좁은 화면의 차례 목록 ───────────── */

export interface HomeTocListGroup {
  readonly title: string;
  readonly items: readonly HomeCard[];
}

export interface HomeTocListUnit {
  readonly unit: OutlineUnit;
  readonly name: string;
  readonly title: string;
  readonly groups: readonly HomeTocListGroup[];
}

/** 차례 목록: 교과서에 실린 절·마무리·읽기 자료만(사이트가 더한 보충 차시는 아래 차시 목록에서 본다) */
export function buildTocList(units: readonly HomeUnit[]): HomeTocListUnit[] {
  return units.map((unit) => ({
    unit: unit.unit,
    name: unit.name,
    title: unit.title,
    groups: unit.groups
      .map((group) => ({ title: group.title, items: group.cards.filter((card) => !card.webOnly) }))
      .filter((group) => group.items.length > 0),
  }));
}
