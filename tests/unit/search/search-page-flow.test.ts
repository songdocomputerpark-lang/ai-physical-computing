// @vitest-environment jsdom
// 검색 쪽의 흐름(src/components/search/search-page.ts, 판 1.3.0 검수 R1-011·012·019·020·021·022·024) — 진짜 DOM(jsdom)에서 상태와 안내 글을 본다.
// Pagefind는 가짜로 바꿔 끼운다(loadPagefind). 빌드한 색인으로 실제 결과가 맞게 나오는지는 tests/e2e/search.spec.ts가 본다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadPagefindMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/components/search/search-core.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/components/search/search-core.ts')>();
  return { ...actual, loadPagefind: loadPagefindMock };
});

import { PAGE_SIZE, VIEW_STATE_KEY, describeResults, readSavedView, setupSearchPage } from '../../../src/components/search/search-page.ts';
import type { PagefindResultData } from '../../../src/components/search/search-core.ts';

const BASE = '/ai-physical-computing/';

function page(index: number, excerpt: string): PagefindResultData {
  return { url: `${BASE}learn/u1/1-1-${index}/`, excerpt, meta: { title: `1-1-${index} 제목 ${index}` } };
}

/** 가짜 Pagefind: 검색어마다 결과를 돌려준다 */
function installPagefind(byTerm: Record<string, PagefindResultData[]>) {
  const calls: string[] = [];
  loadPagefindMock.mockResolvedValue({
    search: vi.fn(async (term: string) => {
      calls.push(term);
      return { results: (byTerm[term] ?? []).map((data, index) => ({ id: `${term}-${index}`, data: async () => data })) };
    }),
  });
  return calls;
}

function mountPage(vocabulary: string[] = []) {
  document.body.innerHTML = `
    <div data-search-root data-state="idle" data-bundle-path="${BASE}pagefind/" data-base-url="${BASE}" data-query-param="q"
      data-anchor-pages='["/glossary/"]' data-sections="[]" data-vocab='${JSON.stringify(vocabulary)}'>
      <form data-search-form><input data-search-input type="search"><button type="submit">검색</button></form>
      <p data-search-status role="status"></p>
      <div data-search-types hidden><button type="button" data-type="all"></button><button type="button" data-type="glossary"></button></div>
      <div data-search-empty hidden>
        <div data-search-didyou hidden><ul data-search-didyou-list></ul></div>
      </div>
      <div data-search-error-links hidden></div>
      <section data-search-results-section hidden><ol data-search-results></ol><button type="button" data-search-more hidden>더</button></section>
      <div data-search-suggestions></div>
    </div>`;
  const root = document.querySelector<HTMLElement>('[data-search-root]')!;
  setupSearchPage(root);
  const q = (selector: string) => root.querySelector<HTMLElement>(selector)!;
  return {
    root,
    input: root.querySelector<HTMLInputElement>('[data-search-input]')!,
    status: q('[data-search-status]'),
    items: () => root.querySelectorAll('[data-search-results] > li'),
    emptyBox: q('[data-search-empty]'),
    didYou: q('[data-search-didyou]'),
    didYouLinks: () => Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-search-didyou-list] a')),
    errorLinks: q('[data-search-error-links]'),
    suggestions: q('[data-search-suggestions]'),
  };
}

const state = (root: HTMLElement) => root.dataset.state;
const open = (search: string, historyState: unknown = null) => window.history.replaceState(historyState, '', `${BASE}search/${search}`);

beforeEach(() => {
  loadPagefindMock.mockReset();
  window.scrollTo = vi.fn();
  open('');
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('엉뚱한 낱말은 "검색 결과 N개"가 아니라 "찾지 못했어요" (R1-011)', () => {
  it('asdfgh: Pagefind가 코드 속 as에 맞춘 글 23개를 모두 걸러 낸다', async () => {
    installPagefind({ asdfgh: Array.from({ length: 23 }, (_v, index) => page(index + 1, 'import mediapipe <mark>as</mark> mp')) });
    open('?q=asdfgh');
    const view = mountPage();
    await vi.waitFor(() => expect(state(view.root)).toBe('empty'));
    expect(view.status.textContent).toBe('"asdfgh"에 맞는 글을 찾지 못했어요.');
    expect(view.items()).toHaveLength(0);
    expect(view.emptyBox.hidden).toBe(false);
  });

  it('같은 글자만 되풀이한 말(zzzz)은 Pagefind를 부르지 않고 "찾지 못했어요"', async () => {
    const calls = installPagefind({ zzzz: [page(1, '<mark>z</mark>')] });
    open('?q=zzzz');
    const view = mountPage();
    await vi.waitFor(() => expect(state(view.root)).toBe('empty'));
    expect(calls).toEqual([]);
  });

  it('진짜 맞는 글은 그대로 보이고 개수 안내가 나온다', async () => {
    installPagefind({ 서보: [page(1, '<mark>서보모터</mark>를 돌려요'), page(2, '<mark>서보</mark>')] });
    open('?q=서보');
    const view = mountPage();
    await vi.waitFor(() => expect(state(view.root)).toBe('results'));
    expect(view.status.textContent).toBe('"서보" 검색 결과 2개예요.');
    expect(view.items()).toHaveLength(2);
  });

  it('걸러 낸 글이 섞이면 개수는 걸러 낸 만큼 뺀다', async () => {
    installPagefind({ 서보모터: [page(1, '<mark>서보모터</mark>'), page(2, 'import <mark>as</mark> x'), page(3, '<mark>서보모터</mark>')] });
    open('?q=서보모터');
    const view = mountPage();
    await vi.waitFor(() => expect(state(view.root)).toBe('results'));
    expect(view.status.textContent).toBe('"서보모터" 검색 결과 2개예요.');
  });
});

describe('오타는 "혹시 이 낱말인가요?" (R1-012)', () => {
  it('임게값 → 임계값 링크를 보인다', async () => {
    installPagefind({ 임게값: Array.from({ length: 75 }, (_v, index) => page(index + 1, '브라우저에만 <mark>이</mark> 컴퓨터에서')) });
    open('?q=임게값');
    const view = mountPage(['임계값', 'Threshold', '픽셀']);
    await vi.waitFor(() => expect(state(view.root)).toBe('empty'));
    expect(view.didYou.hidden).toBe(false);
    const [link] = view.didYouLinks();
    expect(link?.textContent).toBe('임계값');
    expect(link?.getAttribute('href')).toBe(`${BASE}search/?q=${encodeURIComponent('임계값')}`);
  });

  it('가까운 낱말이 없으면 제안 칸은 숨겨 둔다', async () => {
    installPagefind({});
    open('?q=뷁쿍퓽');
    const view = mountPage(['임계값']);
    await vi.waitFor(() => expect(state(view.root)).toBe('empty'));
    expect(view.didYou.hidden).toBe(true);
  });
});

describe('낱말이 여럿인데 통째로는 없으면 줄여서 찾는다 (R1-021)', () => {
  it('웹캠 permission denied → 웹캠', async () => {
    installPagefind({ 웹캠: [page(1, '<mark>웹캠</mark>이 필요해요'), page(2, '<mark>웹캠</mark>')] });
    open(`?q=${encodeURIComponent('웹캠 permission denied')}`);
    const view = mountPage();
    await vi.waitFor(() => expect(state(view.root)).toBe('results'));
    expect(view.status.textContent).toContain('"웹캠 permission denied"에 꼭 맞는 글은 없어서 낱말을 줄여 찾았어요.');
    expect(view.status.textContent).toContain('"웹캠" 검색 결과 2개예요.');
  });
});

describe('찾는 동안과 실패했을 때의 안내 (R1-022·024)', () => {
  it('0.5초가 지나도 안 오면 "찾는 중이에요…", 8초가 지나면 인터넷이 느리다고 알린다. 추천 낱말은 치운다', async () => {
    vi.useFakeTimers();
    loadPagefindMock.mockReturnValue(new Promise(() => undefined));
    open('?q=모터');
    const view = mountPage();
    expect(state(view.root)).toBe('loading');
    expect(view.suggestions.hidden).toBe(true);
    expect(view.status.textContent).toBe('');
    await vi.advanceTimersByTimeAsync(600);
    expect(view.status.textContent).toBe('찾는 중이에요…');
    await vi.advanceTimersByTimeAsync(8000);
    expect(view.status.textContent).toContain('인터넷이 느려서');
  });

  it('검색을 불러오지 못하면 안내와 함께 갈 곳(링크 칸)을 보인다', async () => {
    loadPagefindMock.mockRejectedValue(new Error('색인 없음'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    open('?q=모터');
    const view = mountPage();
    await vi.waitFor(() => expect(state(view.root)).toBe('error'));
    expect(view.status.textContent).toContain('검색을 불러오지 못했어요');
    expect(view.errorLinks.hidden).toBe(false);
    expect(view.suggestions.hidden).toBe(true);
    warn.mockRestore();
  });

  it('쪽을 다 읽었다고 알린다(HTML 끝의 안내 스크립트가 "불러오지 못했어요"를 내지 않게)', () => {
    installPagefind({});
    const view = mountPage();
    expect(view.root.dataset.ready).toBe('true');
  });
});

describe('빈 검색으로 왔을 때 (R1-019)', () => {
  it('/search/?q= 로 열면 입력칸에 초점을 둔다', () => {
    installPagefind({});
    open('?q=');
    const view = mountPage();
    expect(state(view.root)).toBe('idle');
    expect(document.activeElement).toBe(view.input);
  });

  it('q 없이 열면 초점을 가져가지 않는다', () => {
    installPagefind({});
    open('');
    mountPage();
    expect(document.activeElement).toBe(document.body);
  });
});

describe('뒤로 왔을 때 펼친 만큼 되살린다 (R1-020)', () => {
  const many = (): PagefindResultData[] => Array.from({ length: 25 }, (_v, index) => page(index + 1, '<mark>LED</mark>를 켜요'));

  it('저장한 화면의 모양을 읽는다. 모양이 틀리면 무시한다', () => {
    expect(readSavedView({ [VIEW_STATE_KEY]: { term: 'LED', filter: 'all', shown: 20, scrollY: 433 } })).toEqual({
      term: 'LED',
      filter: 'all',
      shown: 20,
      scrollY: 433,
    });
    expect(readSavedView(null)).toBeUndefined();
    expect(readSavedView({ [VIEW_STATE_KEY]: { term: 'LED' } })).toBeUndefined();
    expect(readSavedView('문자열')).toBeUndefined();
  });

  it('같은 검색어·종류의 저장된 화면이 있으면 20개까지 펼치고 내려갔던 자리로 돌아간다', async () => {
    installPagefind({ LED: many() });
    open('?q=LED', { [VIEW_STATE_KEY]: { term: 'LED', filter: 'all', shown: 20, scrollY: 433 } });
    const view = mountPage();
    await vi.waitFor(() => expect(state(view.root)).toBe('results'));
    expect(view.items()).toHaveLength(20);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 433);
  });

  it('검색어가 다르면 되살리지 않고 처음 10개만 보인다', async () => {
    installPagefind({ LED: many() });
    open('?q=LED', { [VIEW_STATE_KEY]: { term: '서보', filter: 'all', shown: 20, scrollY: 433 } });
    const view = mountPage();
    await vi.waitFor(() => expect(state(view.root)).toBe('results'));
    expect(view.items()).toHaveLength(PAGE_SIZE);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('결과를 누르면 펼친 개수와 자리를 history.state에 적어 둔다', async () => {
    installPagefind({ LED: many() });
    open('?q=LED');
    const view = mountPage();
    await vi.waitFor(() => expect(state(view.root)).toBe('results'));
    view.root.querySelector<HTMLElement>('[data-search-results]')!.dispatchEvent(new Event('click', { bubbles: true }));
    expect(readSavedView(window.history.state)).toMatchObject({ term: 'LED', filter: 'all', shown: PAGE_SIZE });
  });
});

describe('개수 안내 글(describeResults)', () => {
  it('걸러 낼 글이 더 있을 수 있으면 "약"을 붙인다', () => {
    expect(describeResults('LED', 41, 10, 'all', true, true)).toBe('"LED" 검색 결과 약 41개예요. 그중 10개를 보여 주고 있어요.');
    expect(describeResults('LED', 3, 3, 'all', false)).toBe('"LED" 검색 결과 3개예요.');
  });
});
