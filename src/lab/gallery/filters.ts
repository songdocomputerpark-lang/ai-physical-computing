/**
 * 예제 갤러리(P4-11)의 **거르기 규칙** — 빌드(카드 만들기·단위 테스트)와 브라우저(화면에서 고르기)가 **같은 함수**를 쓴다.
 *
 * 화면은 카드마다 값을 `data-*`로 적어 두고(`ExampleCard.astro`), 브라우저 쪽(`gallery-page.ts`)은 그 값을 이 파일의 모양으로 읽어
 * `matchesFilter`로 보인다·숨긴다를 정한다. 그래서 "빌드에서 세어 본 개수"와 "화면에서 걸러진 개수"가 어긋날 수 없다.
 *
 * 규칙
 * - 고른 것이 없는 칸은 **거르지 않는다**(모두 보임).
 * - 한 칸 안에서 여러 개를 고르면 **또는**(1단원 또는 2단원), 칸끼리는 **그리고**(1단원 **이면서** 블루투스).
 * - 값을 모르는 카드(`unit: null` 등)는 그 칸을 고른 순간 빠진다 — 빈 값은 "해당 없음"이 아니라 "아직 모름"이기 때문이다(facets.ts 규칙).
 * - 낱말 찾기는 띄어쓰기로 나눈 낱말이 **모두** 들어 있어야 통과한다(한국어는 조사를 떼지 않고 앞부분으로 찾는다 — 검색 페이지와 같은 방식).
 *
 * 이 파일은 브라우저 번들에 들어간다. DOM·빌드 전용 패키지(yaml 등)를 import하지 않는다.
 */
import { EXAMPLE_COMM_KINDS } from './facets.ts';

/** 갤러리가 다루는 실습실(카드에서 예제를 열 수 있는 곳) */
export const GALLERY_LAB_IDS = ['vision', 'esp32'] as const;
export type GalleryLabId = (typeof GALLERY_LAB_IDS)[number];

/** 실습실 이름(화면 글자). 사이트 지도의 이름과 같다. */
export const GALLERY_LAB_LABELS: Readonly<Record<GalleryLabId, string>> = Object.freeze({
  vision: '영상처리 실습실',
  esp32: 'ESP32 실습실',
});

/** 거르기에 쓰는 카드 값(카드 한 장에서 뽑은 것) */
export interface FilterableCard {
  readonly lab: string;
  readonly unit: number | null;
  readonly difficulty: number | null;
  readonly virtualOk: boolean | null;
  readonly comm: readonly string[];
  readonly parts: readonly string[];
  /** 낱말 찾기에 쓰는 글자(제목·설명·태그·파일 이름을 이어 소문자로 만든 것) */
  readonly keywords: string;
}

/** 지금 고른 거르기 */
export interface GalleryFilterState {
  readonly lab: readonly string[];
  readonly unit: readonly number[];
  readonly comm: readonly string[];
  readonly parts: readonly string[];
  readonly difficulty: readonly number[];
  /** 하드웨어 없이 끝까지 되는 예제만 */
  readonly virtualOnly: boolean;
  readonly query: string;
}

/** 아무것도 고르지 않은 상태(= 전부 보임) */
export const EMPTY_FILTER: GalleryFilterState = Object.freeze({
  lab: Object.freeze([]),
  unit: Object.freeze([]),
  comm: Object.freeze([]),
  parts: Object.freeze([]),
  difficulty: Object.freeze([]),
  virtualOnly: false,
  query: '',
});

/** 주소에 싣는 이름(?unit=1,2&comm=ble) */
export const FILTER_PARAMS = Object.freeze({
  lab: 'lab',
  unit: 'unit',
  comm: 'comm',
  parts: 'part',
  difficulty: 'level',
  virtualOnly: 'virtual',
  query: 'q',
});

/** 고른 것이 하나라도 있나 */
export function hasAnyFilter(state: GalleryFilterState): boolean {
  return (
    state.lab.length > 0 ||
    state.unit.length > 0 ||
    state.comm.length > 0 ||
    state.parts.length > 0 ||
    state.difficulty.length > 0 ||
    state.virtualOnly ||
    state.query.trim() !== ''
  );
}

/** 찾는 글자를 견줄 수 있게 다듬는다(소문자·앞뒤 공백 없이·사이 공백 한 칸). */
export function normalizeKeywords(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, ' ').trim();
}

/** 찾는 말을 낱말로 나눈다(모두 들어 있어야 통과). */
export function searchWords(query: string): string[] {
  return normalizeKeywords(query)
    .split(' ')
    .filter((word) => word !== '');
}

function someOf(selected: readonly string[], values: readonly string[]): boolean {
  return selected.length === 0 || values.some((value) => selected.includes(value));
}

/** 카드 한 장이 지금 거르기에 맞나 */
export function matchesFilter(card: FilterableCard, state: GalleryFilterState): boolean {
  if (state.lab.length > 0 && !state.lab.includes(card.lab)) {
    return false;
  }
  if (state.unit.length > 0 && (card.unit === null || !state.unit.includes(card.unit))) {
    return false;
  }
  if (state.difficulty.length > 0 && (card.difficulty === null || !state.difficulty.includes(card.difficulty))) {
    return false;
  }
  if (state.virtualOnly && card.virtualOk !== true) {
    return false;
  }
  if (!someOf(state.comm, card.comm) || !someOf(state.parts, card.parts)) {
    return false;
  }
  const words = searchWords(state.query);
  return words.every((word) => card.keywords.includes(word));
}

/** 거른 카드만 돌려준다(순서는 그대로). */
export function filterCards<T extends FilterableCard>(cards: readonly T[], state: GalleryFilterState): T[] {
  return cards.filter((card) => matchesFilter(card, state));
}

function uniqueStrings(values: readonly string[], allowed?: readonly string[]): string[] {
  const seen: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed !== '' && !seen.includes(trimmed) && (!allowed || allowed.includes(trimmed))) {
      seen.push(trimmed);
    }
  }
  return seen;
}

function uniqueNumbers(values: readonly string[], min: number, max: number): number[] {
  const seen: number[] = [];
  for (const value of values) {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed >= min && parsed <= max && !seen.includes(parsed)) {
      seen.push(parsed);
    }
  }
  return seen.sort((a, b) => a - b);
}

function listOf(params: URLSearchParams, name: string): string[] {
  return params
    .getAll(name)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter((value) => value !== '');
}

/**
 * 주소의 물음표 뒤(?unit=1,2&comm=ble&q=lcd)를 거르기로 바꾼다. 모르는 값은 버린다.
 * `partIds`를 주면 있는 부품 이름만 받는다(없는 부품을 적은 주소로 빈 화면이 되지 않게).
 */
export function filterStateFromQuery(search: string, partIds?: readonly string[]): GalleryFilterState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const virtual = params.get(FILTER_PARAMS.virtualOnly);
  return {
    lab: uniqueStrings(listOf(params, FILTER_PARAMS.lab), GALLERY_LAB_IDS),
    unit: uniqueNumbers(listOf(params, FILTER_PARAMS.unit), 1, 4),
    comm: uniqueStrings(listOf(params, FILTER_PARAMS.comm), EXAMPLE_COMM_KINDS),
    parts: uniqueStrings(listOf(params, FILTER_PARAMS.parts), partIds),
    difficulty: uniqueNumbers(listOf(params, FILTER_PARAMS.difficulty), 1, 3),
    virtualOnly: virtual === '1' || virtual === 'true',
    query: (params.get(FILTER_PARAMS.query) ?? '').trim(),
  };
}

/** 거르기를 주소 글자로 바꾼다(아무것도 고르지 않았으면 빈 글자). 순서는 늘 같다. */
export function filterQueryString(state: GalleryFilterState): string {
  const params = new URLSearchParams();
  if (state.lab.length > 0) {
    params.set(FILTER_PARAMS.lab, [...state.lab].join(','));
  }
  if (state.unit.length > 0) {
    params.set(FILTER_PARAMS.unit, [...state.unit].join(','));
  }
  if (state.comm.length > 0) {
    params.set(FILTER_PARAMS.comm, [...state.comm].join(','));
  }
  if (state.parts.length > 0) {
    params.set(FILTER_PARAMS.parts, [...state.parts].join(','));
  }
  if (state.difficulty.length > 0) {
    params.set(FILTER_PARAMS.difficulty, [...state.difficulty].join(','));
  }
  if (state.virtualOnly) {
    params.set(FILTER_PARAMS.virtualOnly, '1');
  }
  const query = state.query.trim();
  if (query !== '') {
    params.set(FILTER_PARAMS.query, query);
  }
  return params.toString();
}
