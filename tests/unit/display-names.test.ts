// 화면 표기 한 곳(src/lib/display-names.ts, 판 1.6.0 C173 — 걷기 조사 T4 "같은 것에 이름·숫자가 둘 이상").
// 쪽 범위는 앞 0 없이 "8~12쪽"(C137 누락 고침), 단원 이름은 "1단원 영상 처리 인공지능"(로마 숫자는 큰 제목 앞 번호에만 — C127),
// 같은 절의 두 쪽 이름은 머리글 메뉴와 같은 "교과서 원문"·"따라 하기".
import { describe, expect, it } from 'vitest';
import { getPage } from '../../src/config/nav.ts';
import {
  bookViewLabel,
  bookViewName,
  formatPageRange,
  lessonViewName,
  pageRangeText,
  reviewUnitOf,
  textbookPagesText,
  unitName,
  unitNumberName,
  unitTopic,
  unitTrailSections,
} from '../../src/lib/display-names.ts';
import { suggestSections } from '../../src/components/search/suggest-attrs.ts';

describe('쪽 범위(formatPageRange·pageRangeText·textbookPagesText)', () => {
  it('앞 0을 떼고 사이 글 앞뒤 공백을 걷는다 — 옛 원고 표기 "008~012"도 "8~12"', () => {
    expect(formatPageRange('008~012')).toBe('8~12');
    expect(formatPageRange(' 124 ~ 131 ')).toBe('124~131');
    expect(formatPageRange('141')).toBe('141');
    expect(formatPageRange('053~062')).toBe('53~62');
    expect(formatPageRange('12·15')).toBe('12·15');
  });

  it('숫자가 아닌 표기("파일명 p55·p58")는 그대로 둔다', () => {
    expect(formatPageRange('파일명 p55·p58')).toBe('파일명 p55·p58');
    expect(pageRangeText('파일명 p55·p58')).toBe('파일명 p55·p58');
  });

  it('pageRangeText: 숫자면 "쪽"을 붙이고, 비었으면 undefined', () => {
    expect(pageRangeText('008~012')).toBe('8~12쪽');
    expect(pageRangeText('141')).toBe('141쪽');
    expect(pageRangeText(undefined)).toBeUndefined();
    expect(pageRangeText('  ')).toBeUndefined();
  });

  it('textbookPagesText: 교과서 쪽 알약·홈 카드·교과서 차례의 "교과서 8~12쪽"', () => {
    expect(textbookPagesText('8~12')).toBe('교과서 8~12쪽');
    expect(textbookPagesText('008~012')).toBe('교과서 8~12쪽');
    expect(textbookPagesText('8')).toBe('교과서 8쪽');
  });
});

describe('같은 절의 두 쪽 이름(메뉴 이름과 같다)', () => {
  it('교과서 원문(/book/)·따라 하기(/learn/) — 옛 이름 "교과서"·"풀이·실습"·"배우기"가 아니다', () => {
    expect(bookViewName()).toBe(getPage('book').label);
    expect(lessonViewName()).toBe(getPage('learn').label);
    expect(bookViewName()).toBe('교과서 원문');
    expect(lessonViewName()).toBe('따라 하기');
  });

  it('bookViewLabel: 전환 줄의 교과서 쪽 칸 "교과서 원문 8~12쪽"(쪽을 모르면 이름만)', () => {
    expect(bookViewLabel('8~12')).toBe('교과서 원문 8~12쪽');
    expect(bookViewLabel('124~131')).toBe('교과서 원문 124~131쪽');
    expect(bookViewLabel(undefined)).toBe('교과서 원문');
  });
});

describe('단원 이름(C127 — 로마 숫자는 큰 제목 앞 번호에만)', () => {
  it('unitNumberName·unitTopic·unitName: "1단원"·"영상 처리 인공지능"·"1단원 영상 처리 인공지능"', () => {
    expect(unitNumberName(1)).toBe('1단원');
    expect(unitTopic(1)).toBe('영상 처리 인공지능');
    expect(unitName(1)).toBe('1단원 영상 처리 인공지능');
    expect(unitName(2)).toBe('2단원 피지컬 컴퓨팅');
    expect(unitName(4)).toBe('4단원 지능화 사물 개발 프로젝트');
    for (const unit of [1, 2, 3, 4] as const) {
      expect(unitName(unit)).not.toMatch(/\b[IVX]+\./u);
    }
  });

  it('unitTrailSections: 검색 결과·자동 완성 위치 줄의 대단원 이름도 숫자로("따라 하기 › 2단원 피지컬 컴퓨팅" — B-50)', () => {
    expect(unitTrailSections()).toEqual([
      { path: '/learn/u1/', label: '1단원 영상 처리 인공지능' },
      { path: '/learn/u2/', label: '2단원 피지컬 컴퓨팅' },
      { path: '/learn/u3/', label: '3단원 인공지능과 피지컬 컴퓨팅' },
      { path: '/learn/u4/', label: '4단원 지능화 사물 개발 프로젝트' },
    ]);
    const sections = suggestSections();
    expect(sections.find((section) => section.path === '/learn/u2/')?.label).toBe('2단원 피지컬 컴퓨팅');
    expect(sections.some((section) => /^[IVX]+\./u.test(section.label))).toBe(false);
  });

  it('reviewUnitOf: 대단원 마무리 번호 "I-마무리"~"IV-마무리"가 몇 단원인지, 아니면 undefined', () => {
    expect(reviewUnitOf('I-마무리')).toBe(1);
    expect(reviewUnitOf('II-마무리')).toBe(2);
    expect(reviewUnitOf(' III-마무리 ')).toBe(3);
    expect(reviewUnitOf('IV-마무리')).toBe(4);
    expect(reviewUnitOf('V-마무리')).toBeUndefined();
    expect(reviewUnitOf('1-1-1')).toBeUndefined();
  });
});
