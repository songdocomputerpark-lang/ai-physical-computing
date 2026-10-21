// @vitest-environment jsdom
// 찾기 공용 부분(src/components/search/search-core.ts) 단위 검사: 쪽 종류 가리기, 위치 표시, 설정 읽기, 결과 모양, 요약 그리기.
import { describe, expect, it } from 'vitest';
import {
  FILTER_KINDS,
  KIND_ICON,
  KIND_LABEL,
  VARIANT_BOOK,
  VARIANT_LEARN,
  appendExcerpt,
  displayTitle,
  isFilterKind,
  isGlossaryGroupAnchor,
  kindMatchesFilter,
  kindOfPath,
  parseSections,
  parseStringList,
  pickAnchoredResult,
  readSearchConfig,
  sectionTrail,
  sitePathOf,
  toResultCard,
  variantOfPath,
  type ResultKind,
  type SearchConfig,
} from '../../../src/components/search/search-core.ts';
import { SEARCH_ICON_NAMES } from '../../../src/components/search/search-icons.ts';
import * as searchPage from '../../../src/components/search/search-page.ts';

const BASE = '/ai-physical-computing/';

const config: SearchConfig = {
  bundlePath: `${BASE}pagefind/`,
  baseUrl: BASE,
  queryParam: 'q',
  anchorPages: ['/glossary/', '/help/errors/', '/labs/gallery/', '/teacher/faq/'],
  sections: [
    { path: '/learn/', label: '배우기' },
    { path: '/learn/u1/', label: 'I단원' },
    { path: '/labs/', label: '실습실' },
    { path: '/labs/esp32/', label: 'ESP32 실습실' },
    { path: '/glossary/', label: '용어사전' },
  ],
};

describe('쪽 종류(kindOfPath)', () => {
  const cases: [string | undefined, ResultKind][] = [
    ['/learn/u1/1-1-1/', 'learn'],
    ['/learn/', 'learn'],
    ['/learn/u1/v4/', 'learn'],
    ['/labs/vision/', 'lab'],
    ['/labs/esp32/check/', 'lab'],
    // 판 1.6.0 R6: 키트 장치 도감(첫 쪽과 장치 쪽)은 "실습실"이 아니라 자기 이름으로(걷기 보고 B-71)
    ['/labs/esp32/kit/', 'kit'],
    ['/labs/esp32/kit/d-3-11/', 'kit'],
    ['/labs/iot/dashboard/', 'lab'],
    ['/labs/gallery/', 'example'],
    ['/glossary/', 'glossary'],
    ['/help/errors/', 'error'],
    ['/help/', 'help'],
    ['/teacher/', 'teacher'],
    ['/teacher/faq/', 'teacher'],
    ['/start/teacher/', 'teacher'],
    ['/start/student/', 'start'],
    ['/start/', 'start'],
    ['/credits/', 'other'],
    ['/', 'other'],
    [undefined, 'other'],
  ];
  it.each(cases)('%s → %s', (path, kind) => {
    expect(kindOfPath(path)).toBe(kind);
  });

  it('오류 사전과 예제 갤러리는 문제 해결·실습실보다 먼저 가려진다(더 구체적인 쪽이 우선)', () => {
    expect(kindOfPath('/help/errors/')).not.toBe('help');
    expect(kindOfPath('/labs/gallery/')).not.toBe('lab');
  });

  it('모든 종류에 이름과 아이콘이 있고, 아이콘은 찾기 화면이 가진 아이콘이다', () => {
    const kinds = Object.keys(KIND_LABEL) as ResultKind[];
    expect(kinds.length).toBeGreaterThanOrEqual(9);
    for (const kind of kinds) {
      expect(KIND_LABEL[kind], kind).not.toBe('');
      expect(SEARCH_ICON_NAMES as readonly string[], kind).toContain(KIND_ICON[kind]);
    }
  });

  it('거르기 종류는 이름이 있는 종류이고 isFilterKind가 알아본다', () => {
    for (const kind of FILTER_KINDS) {
      expect(isFilterKind(kind)).toBe(true);
      expect(KIND_LABEL[kind]).toBeTruthy();
    }
    expect(isFilterKind('all')).toBe(false);
    expect(isFilterKind('start')).toBe(false);
    expect(isFilterKind(undefined)).toBe(false);
    expect(isFilterKind('<script>')).toBe(false);
  });
});

describe('경로·위치', () => {
  it('sitePathOf: base와 #위치를 떼고 사이트 안 경로를 준다', () => {
    expect(sitePathOf(`${BASE}glossary/#pixel`, BASE)).toBe('/glossary/');
    expect(sitePathOf(`${BASE}labs/esp32/check/`, BASE)).toBe('/labs/esp32/check/');
    expect(sitePathOf('/glossary/#pixel', '/')).toBe('/glossary/');
    expect(sitePathOf(`https://example.invalid${BASE}credits/`, BASE)).toBe('/credits/');
  });

  it('sectionTrail: 위 페이지 이름을 얕은 쪽부터 › 로 잇고, 자기 자신·홈은 뺀다', () => {
    expect(sectionTrail('/labs/esp32/check/', config.sections)).toBe('실습실 › ESP32 실습실');
    expect(sectionTrail('/learn/u1/1-1-1/', config.sections)).toBe('배우기 › I단원');
    expect(sectionTrail('/glossary/', config.sections)).toBe('');
    expect(sectionTrail('/credits/', config.sections)).toBe('');
    expect(sectionTrail(undefined, config.sections)).toBe('');
    expect(sectionTrail('/labs/vision/', [{ path: '/', label: '홈' }, ...config.sections])).toBe('실습실');
  });
});

describe('설정 읽기', () => {
  it('parseSections·parseStringList는 깨진 값을 빈 목록으로 거른다', () => {
    expect(parseSections(undefined)).toEqual([]);
    expect(parseSections('{깨짐')).toEqual([]);
    expect(parseSections('{"a":1}')).toEqual([]);
    expect(parseSections('[{"path":"/a/","label":"가"},{"path":1,"label":"나"},3]')).toEqual([{ path: '/a/', label: '가' }]);
    expect(parseStringList('["a",1,"b"]')).toEqual(['a', 'b']);
    expect(parseStringList('"문자"')).toEqual([]);
  });

  it('readSearchConfig: data- 속성에서 읽고, 없으면 기본값', () => {
    const form = document.createElement('form');
    form.dataset.bundlePath = '/x/pagefind/';
    form.dataset.baseUrl = '/x/';
    form.dataset.queryParam = 'word';
    form.dataset.anchorPages = '["/glossary/"]';
    form.dataset.sections = '[{"path":"/a/","label":"가"}]';
    expect(readSearchConfig(form)).toEqual({
      bundlePath: '/x/pagefind/',
      baseUrl: '/x/',
      queryParam: 'word',
      anchorPages: ['/glossary/'],
      sections: [{ path: '/a/', label: '가' }],
    });
    expect(readSearchConfig(null)).toEqual({ bundlePath: '/pagefind/', baseUrl: '/', queryParam: 'q', anchorPages: [], sections: [] });
  });
});

describe('결과 모양(toResultCard)', () => {
  it('일반 쪽: 제목·주소·요약 그대로에 종류와 위치를 붙인다', () => {
    const card = toResultCard(
      { url: `${BASE}learn/u1/1-1-1/`, excerpt: '요약 <mark>픽셀</mark>', meta: { title: '1-1-1 인공지능이란' } },
      '픽셀',
      config,
    );
    expect(card).toEqual({
      title: '1-1-1 인공지능이란',
      url: `${BASE}learn/u1/1-1-1/`,
      excerpt: '요약 <mark>픽셀</mark>',
      kind: 'learn',
      trail: '배우기 › I단원',
      variant: '따라 하기',
    });
  });

  it('제목이 없으면 주소를 제목으로 쓴다', () => {
    expect(toResultCard({ url: `${BASE}credits/`, excerpt: '' }, '라이선스', config).title).toBe(`${BASE}credits/`);
  });

  it('항목 단위 쪽(용어사전)은 가장 맞는 항목으로 이어 주고 종류는 용어사전', () => {
    const card = toResultCard(
      {
        url: `${BASE}glossary/`,
        excerpt: '쪽 요약',
        meta: { title: '용어사전' },
        sub_results: [
          { title: '프레임 Frame', url: `${BASE}glossary/#frame`, excerpt: 'a' },
          { title: '픽셀 Pixel', url: `${BASE}glossary/#pixel`, excerpt: '<mark>픽셀</mark>' },
        ],
      },
      '픽셀',
      config,
    );
    expect(card.title).toBe('픽셀 Pixel — 용어사전');
    expect(card.url).toBe(`${BASE}glossary/#pixel`);
    expect(card.kind).toBe('glossary');
  });

  it('search-page.ts가 예전 이름으로 다시 내보내는 함수는 공용 부분의 것과 같다', () => {
    expect(searchPage.pickAnchoredResult).toBe(pickAnchoredResult);
    expect(searchPage.isGlossaryGroupAnchor).toBe(isGlossaryGroupAnchor);
  });
});

describe('요약 그리기(appendExcerpt)', () => {
  it('글자와 <mark>만 남기고 다른 태그·스크립트는 글자로 만든다', () => {
    const target = document.createElement('p');
    appendExcerpt(target, '앞 <mark>픽셀</mark> 뒤 <b>굵게</b><script>alert(1)</script><img src=x onerror=alert(2)>');
    expect(target.querySelectorAll('mark')).toHaveLength(1);
    expect(target.querySelector('mark')?.textContent).toBe('픽셀');
    expect(target.querySelector('b, script, img')).toBeNull();
    expect(target.textContent).toContain('앞 픽셀 뒤 굵게');
  });
});

describe('키트 장치 도감 종류(판 1.6.0 R6)', () => {
  it('종류 이름은 "키트 장치 도감"이고, [실습실] 거르기 칩에도 함께 걸린다(칩을 따로 늘리지 않는다)', () => {
    expect(KIND_LABEL.kit).toBe('키트 장치 도감');
    expect(kindMatchesFilter('kit', 'lab')).toBe(true);
    expect(kindMatchesFilter('lab', 'lab')).toBe(true);
    expect(kindMatchesFilter('lab', 'example')).toBe(false);
    expect(kindMatchesFilter('kit', 'example')).toBe(false);
    expect(FILTER_KINDS as readonly string[]).not.toContain('kit');
  });
});

describe('같은 제목의 두 쪽 구별(variantOfPath·displayTitle — 판 1.6.0 R6)', () => {
  it('교과서 쪽(/book/<절>/)은 "교과서 원문", 따라 하기 쪽(/learn/<단원>/<차시>/)은 "따라 하기"이고 그 밖의 쪽은 없다', () => {
    expect(variantOfPath('/book/2-1-2/')).toBe('교과서 원문');
    expect(variantOfPath('/learn/u2/2-1-2/')).toBe('따라 하기');
    expect(variantOfPath('/book/')).toBeUndefined();
    expect(variantOfPath('/learn/')).toBeUndefined();
    expect(variantOfPath('/learn/u2/')).toBeUndefined();
    expect(variantOfPath('/labs/vision/')).toBeUndefined();
    expect(variantOfPath(undefined)).toBeUndefined();
  });

  it('이름은 머리글 메뉴 이름(nav.ts)과 같다 — 메뉴 이름이 바뀌면 이 시험이 알려 준다', async () => {
    const { getPage } = await import('../../../src/config/nav.ts');
    expect(VARIANT_BOOK).toBe(getPage('book').label);
    expect(VARIANT_LEARN).toBe(getPage('learn').label);
  });

  it('같은 제목의 두 결과는 제목 뒤 이름으로 갈린다(같은 글자 크기의 한 글 — 작은 회색 보조 글이 아니다)', () => {
    const title = '1-1-1 인공지능 응용 프로그램과 에이전트';
    const book = toResultCard({ url: `${BASE}book/1-1-1/`, excerpt: '', meta: { title } }, '1-1-1', config);
    const learn = toResultCard({ url: `${BASE}learn/u1/1-1-1/`, excerpt: '', meta: { title } }, '1-1-1', config);
    expect(displayTitle(book)).toBe(`${title} (교과서 원문)`);
    expect(displayTitle(learn)).toBe(`${title} (따라 하기)`);
    expect(displayTitle(book)).not.toBe(displayTitle(learn));
    // 이름은 화면에 그릴 때만 붙는다 — 카드의 제목은 그대로라 순서 정하기(tierOf)가 "교과서"라는 낱말에 속지 않는다
    expect(book.title).toBe(title);
  });

  it('차시·절이 아닌 쪽 제목은 그대로다', () => {
    const card = toResultCard({ url: `${BASE}labs/vision/`, excerpt: '', meta: { title: '영상 처리 실습실' } }, '영상', config);
    expect(displayTitle(card)).toBe('영상 처리 실습실');
  });
});
