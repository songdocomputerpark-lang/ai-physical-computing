// 예제 갤러리 거르기 규칙(빌드와 브라우저가 함께 쓰는 함수) — src/lab/gallery/filters.ts
import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTER,
  filterCards,
  filterQueryString,
  filterStateFromQuery,
  hasAnyFilter,
  matchesFilter,
  normalizeKeywords,
  searchWords,
  type FilterableCard,
  type GalleryFilterState,
} from '../../../src/lab/gallery/filters.ts';

function card(overrides: Partial<FilterableCard> = {}): FilterableCard {
  return {
    lab: 'esp32',
    unit: 2,
    difficulty: null,
    virtualOk: null,
    comm: [],
    parts: ['touch-digital'],
    keywords: '터치 센서를 누르면 led가 켜져요 esp32/u2/2-1-1-touch-led.py',
    ...overrides,
  };
}

function filter(overrides: Partial<GalleryFilterState> = {}): GalleryFilterState {
  return { ...EMPTY_FILTER, ...overrides };
}

describe('고르지 않은 칸은 거르지 않는다', () => {
  it('아무것도 고르지 않으면 모두 통과한다', () => {
    expect(matchesFilter(card(), EMPTY_FILTER)).toBe(true);
    expect(matchesFilter(card({ unit: null, parts: [], comm: [] }), EMPTY_FILTER)).toBe(true);
    expect(hasAnyFilter(EMPTY_FILTER)).toBe(false);
  });

  it('한 칸에서 여러 개를 고르면 그 가운데 하나만 맞아도 된다', () => {
    expect(matchesFilter(card({ unit: 2 }), filter({ unit: [1, 2] }))).toBe(true);
    expect(matchesFilter(card({ unit: 3 }), filter({ unit: [1, 2] }))).toBe(false);
  });

  it('칸이 다르면 모두 맞아야 한다', () => {
    const state = filter({ unit: [2], lab: ['esp32'] });
    expect(matchesFilter(card({ unit: 2, lab: 'esp32' }), state)).toBe(true);
    expect(matchesFilter(card({ unit: 2, lab: 'vision' }), state)).toBe(false);
  });
});

describe('값을 모르는 카드', () => {
  it('그 칸을 고른 순간 빠진다(빈 값은 “해당 없음”이 아니라 “아직 모름”이라서)', () => {
    expect(matchesFilter(card({ unit: null }), filter({ unit: [2] }))).toBe(false);
    expect(matchesFilter(card({ difficulty: null }), filter({ difficulty: [1] }))).toBe(false);
    expect(matchesFilter(card({ virtualOk: null }), filter({ virtualOnly: true }))).toBe(false);
    expect(matchesFilter(card({ virtualOk: false }), filter({ virtualOnly: true }))).toBe(false);
    expect(matchesFilter(card({ virtualOk: true }), filter({ virtualOnly: true }))).toBe(true);
  });

  it('통신 방식·부품은 목록 가운데 하나라도 겹치면 통과한다', () => {
    expect(matchesFilter(card({ comm: ['ble', 'uart'] }), filter({ comm: ['uart'] }))).toBe(true);
    expect(matchesFilter(card({ comm: [] }), filter({ comm: ['uart'] }))).toBe(false);
    expect(matchesFilter(card({ parts: ['lcd-i2c', 'touch-digital'] }), filter({ parts: ['lcd-i2c'] }))).toBe(true);
    expect(matchesFilter(card({ parts: [] }), filter({ parts: ['lcd-i2c'] }))).toBe(false);
  });
});

describe('낱말로 찾기', () => {
  it('띄어 쓴 낱말이 모두 들어 있어야 한다', () => {
    expect(matchesFilter(card(), filter({ query: '터치' }))).toBe(true);
    expect(matchesFilter(card(), filter({ query: '터치 led' }))).toBe(true);
    expect(matchesFilter(card(), filter({ query: '터치 서보' }))).toBe(false);
  });

  it('대소문자와 앞뒤 공백을 가리지 않는다', () => {
    expect(matchesFilter(card(), filter({ query: '  LED  ' }))).toBe(true);
    expect(normalizeKeywords('  Touch   LED\n')).toBe('touch led');
    expect(searchWords(' 손가락   개수 ')).toEqual(['손가락', '개수']);
  });

  it('파일 이름으로도 찾힌다', () => {
    expect(matchesFilter(card(), filter({ query: '2-1-1-touch-led' }))).toBe(true);
  });
});

describe('주소에 싣고 다시 읽기', () => {
  it('고른 것을 주소 글자로 바꾸고 그대로 되읽는다', () => {
    const state = filter({ lab: ['esp32'], unit: [2, 3], comm: ['ble'], parts: ['lcd-i2c'], difficulty: [1], virtualOnly: true, query: 'lcd' });
    const query = filterQueryString(state);
    expect(query).toBe('lab=esp32&unit=2%2C3&comm=ble&part=lcd-i2c&level=1&virtual=1&q=lcd');
    expect(filterStateFromQuery(query, ['lcd-i2c'])).toEqual(state);
  });

  it('아무것도 고르지 않으면 주소가 비어 있다', () => {
    expect(filterQueryString(EMPTY_FILTER)).toBe('');
  });

  it('모르는 값은 버린다(없는 단원·없는 부품·없는 실습실)', () => {
    const state = filterStateFromQuery('?unit=9,2&lab=iot&comm=zigbee&part=없는부품&level=7', ['lcd-i2c']);
    expect(state.unit).toEqual([2]);
    expect(state.lab).toEqual([]);
    expect(state.comm).toEqual([]);
    expect(state.parts).toEqual([]);
    expect(state.difficulty).toEqual([]);
  });

  it('부품 목록을 주지 않으면 부품 이름을 그대로 받는다(시험·문서용)', () => {
    expect(filterStateFromQuery('?part=lcd-i2c,buzzer').parts).toEqual(['lcd-i2c', 'buzzer']);
  });
});

describe('여러 장 거르기', () => {
  it('맞는 카드만 차례를 지켜 돌려준다', () => {
    const cards = [
      card({ keywords: 'a', unit: 1 }),
      card({ keywords: 'b', unit: 2 }),
      card({ keywords: 'c', unit: 2 }),
    ];
    expect(filterCards(cards, filter({ unit: [2] })).map((item) => item.keywords)).toEqual(['b', 'c']);
  });
});
