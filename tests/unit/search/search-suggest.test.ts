// @vitest-environment jsdom
// 검색칸 자동 완성(src/components/search/search-suggest.ts) — 진짜 DOM(jsdom)에서 ARIA combobox 규약과 키보드 동작을 본다.
// Pagefind는 가짜로 바꿔 끼운다(loadPagefind). 빌드한 색인으로 실제 결과가 나오는지는 tests/e2e/search-suggest.spec.ts가 본다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadPagefindMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/components/search/search-core.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/components/search/search-core.ts')>();
  return { ...actual, loadPagefind: loadPagefindMock };
});

import {
  INPUT_DELAY_MS,
  KEY_HINT,
  MAX_ITEMS,
  attachSuggest,
  bootSuggest,
  describeSuggestCount,
  normalizeTerm,
  suggestWhere,
} from '../../../src/components/search/search-suggest.ts';
import type { PagefindResultData, SearchConfig } from '../../../src/components/search/search-core.ts';

const BASE = '/ai-physical-computing/';
const config: SearchConfig = {
  bundlePath: `${BASE}pagefind/`,
  baseUrl: BASE,
  queryParam: 'q',
  anchorPages: ['/glossary/'],
  sections: [
    { path: '/learn/', label: '배우기' },
    { path: '/learn/u1/', label: 'I단원' },
  ],
};
const POPULAR = ['손 인식', '임계값', 'LED', '서보', '블루투스', 'NameError', '카메라가 안 켜져요'];

function fakeResults(count: number): PagefindResultData[] {
  return Array.from({ length: count }, (_, index) => ({
    url: `${BASE}learn/u1/1-1-${index + 1}/`,
    excerpt: `요약 ${index + 1}`,
    meta: { title: `1-1-${index + 1} 제목 ${index + 1}` },
  }));
}

/** 가짜 Pagefind: 검색어마다 results를 돌려준다. calls에 검색어가 쌓인다. */
function installPagefind(resultsByTerm: Record<string, PagefindResultData[]>) {
  const calls: string[] = [];
  const pagefind = {
    search: vi.fn(async (term: string) => {
      calls.push(term);
      const found = resultsByTerm[term] ?? [];
      return { results: found.map((data, index) => ({ id: String(index), data: async () => data })) };
    }),
  };
  loadPagefindMock.mockResolvedValue(pagefind);
  return { pagefind, calls };
}

let navigate: ReturnType<typeof vi.fn<(href: string) => void>>;

function mount(): { form: HTMLFormElement; input: HTMLInputElement; panel: HTMLElement; list: HTMLElement; live: HTMLElement } {
  document.body.innerHTML = `
    <form id="f" role="search" aria-label="사이트 검색" action="${BASE}search/" method="get" data-suggest>
      <label for="in">사이트 검색어</label>
      <input id="in" type="search" name="q">
      <button type="submit" aria-label="검색">검색</button>
    </form>
    <a id="outside" href="#x">바깥</a>`;
  const form = document.querySelector<HTMLFormElement>('#f')!;
  navigate = vi.fn<(href: string) => void>();
  attachSuggest(form, { config, popular: POPULAR, navigate });
  const input = form.querySelector<HTMLInputElement>('input')!;
  return {
    form,
    input,
    panel: form.querySelector<HTMLElement>('.suggest')!,
    list: form.querySelector<HTMLElement>('[role="listbox"]')!,
    live: form.querySelector<HTMLElement>('[aria-live]')!,
  };
}

const options = (list: HTMLElement): HTMLAnchorElement[] => Array.from(list.querySelectorAll<HTMLAnchorElement>('[role="option"]'));

/** 글자를 입력칸에 넣고 input 이벤트를 낸다 */
function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function press(input: HTMLInputElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  input.dispatchEvent(event);
  return event;
}

/** 입력 지연 + 비동기 결과까지 흘려보낸다 */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(INPUT_DELAY_MS + 10);
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  loadPagefindMock.mockReset();
  installPagefind({});
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('순수 도우미', () => {
  it('normalizeTerm: 공백을 다듬고 너무 길면 자른다', () => {
    expect(normalizeTerm('  손   인식  ')).toBe('손 인식');
    expect(normalizeTerm('가'.repeat(200)).length).toBe(80);
    expect(normalizeTerm('   ')).toBe('');
  });

  it('describeSuggestCount: 타이핑마다 읽히므로 짧게 "추천 N개"만 알린다(키 쓰는 법·전체 개수는 넣지 않는다, R1-018)', () => {
    expect(describeSuggestCount('서보', 3, 3)).toBe('추천 3개가 있어요.');
    expect(describeSuggestCount('서보', 6, 23)).toBe('추천 6개가 있어요.');
    expect(describeSuggestCount('서보', 6, 23)).not.toContain('화살표');
    expect(describeSuggestCount('뷁', 0, 0)).toBe('"뷁"에 맞는 글을 찾지 못했어요. 추천 낱말이 있어요.');
  });

  it('suggestWhere: 종류 + 위치, 위치에 종류 이름이 이미 있으면 위치만, 위치가 없으면 종류만', () => {
    expect(suggestWhere({ kind: 'learn', trail: '배우기 › I단원' })).toBe('차시 · 배우기 › I단원');
    expect(suggestWhere({ kind: 'example', trail: '실습실' })).toBe('예제 · 실습실');
    expect(suggestWhere({ kind: 'lab', trail: '실습실 › ESP32 실습실' })).toBe('실습실 › ESP32 실습실');
    expect(suggestWhere({ kind: 'glossary', trail: '' })).toBe('용어사전');
  });
});

describe('붙이기와 ARIA 약속', () => {
  it('입력칸이 combobox가 되고 목록과 이어진다. 처음엔 닫혀 있고 Pagefind를 부르지 않는다', () => {
    const { input, panel, list } = mount();
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-haspopup')).toBe('listbox');
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    expect(document.getElementById(list.id)).toBe(list);
    expect(list.getAttribute('role')).toBe('listbox');
    expect(list.getAttribute('aria-label')).toBeTruthy();
    expect(panel.hidden).toBe(true);
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    expect(loadPagefindMock).not.toHaveBeenCalled();
  });

  it('키 쓰는 법은 입력칸의 aria-describedby로 이어진 보이지 않는 글이다(상태 줄에 되풀이하지 않는다, R1-018)', () => {
    const { form, input, live } = mount();
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    const hint = document.getElementById(describedBy.split(' ').at(-1) ?? '');
    expect(hint?.textContent).toBe(KEY_HINT);
    expect(hint?.classList.contains('visually-hidden')).toBe(true);
    expect(form.contains(hint)).toBe(true);
    expect(live.textContent).not.toContain('화살표');
  });

  it('입력칸에 이미 설명이 달려 있으면 그 뒤에 잇는다', () => {
    document.body.innerHTML = `<form id="f" action="${BASE}search/" data-suggest><input id="in" type="search" name="q" aria-describedby="help"><p id="help">도움말</p></form>`;
    const form = document.querySelector<HTMLFormElement>('#f')!;
    attachSuggest(form, { config, popular: POPULAR });
    expect(form.querySelector('input')?.getAttribute('aria-describedby')).toMatch(/^help \S+-hint$/u);
  });

  it('안내 줄은 aria-live=polite이고 role=status가 아니다(쪽의 검색 안내 줄과 겹치지 않게)', () => {
    const { live, form } = mount();
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.hasAttribute('role')).toBe(false);
    expect(form.querySelectorAll('[role="status"]')).toHaveLength(0);
  });

  it('두 번 붙여도 한 번만 붙는다', () => {
    const { form } = mount();
    attachSuggest(form, { config, popular: POPULAR });
    expect(form.querySelectorAll('.suggest')).toHaveLength(1);
  });

  it('bootSuggest: data-suggest 폼만 켜고 설정은 data-suggest-config 요소에서 읽는다', () => {
    document.body.innerHTML = `
      <form id="a" action="/s/" data-suggest data-suggest-config data-bundle-path="/p/pagefind/" data-base-url="/p/" data-popular='["하나","둘"]'>
        <input type="search" name="q">
      </form>
      <form id="b" action="/s/"><input type="search" name="q"></form>
      <form id="c" action="/s/" data-suggest><input type="search" name="q"></form>`;
    bootSuggest();
    expect(document.querySelector('#a input')?.getAttribute('role')).toBe('combobox');
    expect(document.querySelector('#b input')?.getAttribute('role')).toBeNull();
    expect(document.querySelector('#c input')?.getAttribute('role')).toBe('combobox');
  });
});

describe('초점·빈 칸·많이 찾는 낱말', () => {
  it('초점을 주면 Pagefind를 미리 받고, 빈 칸이면 많이 찾는 낱말 칩을 보인다', async () => {
    const { input, panel, list } = mount();
    input.dispatchEvent(new Event('focus'));
    await settle();
    expect(loadPagefindMock).toHaveBeenCalledTimes(1);
    expect(panel.hidden).toBe(false);
    expect(input.getAttribute('aria-expanded')).toBe('true');
    const chips = options(list);
    expect(chips.map((chip) => chip.textContent)).toEqual(POPULAR);
    expect(chips[0]?.getAttribute('href')).toBe(`${BASE}search/?q=${encodeURIComponent('손 인식').replace(/%20/gu, '+')}`);
    expect(list.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('많이 찾는 낱말');
    // 항목은 Tab 정지점이 아니다
    expect(chips.every((chip) => chip.tabIndex === -1)).toBe(true);
  });

  it('아이콘은 꾸밈(aria-hidden)이다', () => {
    const { input, list } = mount();
    input.dispatchEvent(new Event('focus'));
    expect(list.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('입력하면 결과를 보인다', () => {
  it('입력을 멈추고 200ms 뒤에 찾고, 결과 6개 + 전체 검색 줄을 보인다(그 전에는 찾지 않는다)', async () => {
    const { calls } = installPagefind({ 서보: fakeResults(23) });
    const { input, panel, list, live } = mount();
    input.dispatchEvent(new Event('focus'));
    type(input, '서');
    type(input, '서보');
    await vi.advanceTimersByTimeAsync(INPUT_DELAY_MS - 20);
    expect(calls).toEqual([]);
    await settle();
    expect(calls).toEqual(['서보']);
    expect(panel.hidden).toBe(false);
    const all = options(list);
    expect(all).toHaveLength(MAX_ITEMS + 1);
    expect(all[0]?.textContent).toContain('1-1-1 제목 1');
    expect(all[0]?.textContent).toContain('차시 · 배우기 › I단원');
    expect(all[0]?.getAttribute('href')).toBe(`${BASE}learn/u1/1-1-1/`);
    const last = all.at(-1);
    expect(last?.textContent).toContain('"서보" 전체 검색 결과 보기');
    expect(last?.textContent).toContain('23개');
    expect(last?.getAttribute('href')).toBe(`${BASE}search/?q=${encodeURIComponent('서보')}`);
    expect(live.textContent).toBe(describeSuggestCount('서보', MAX_ITEMS, 23));
  });

  it('낱말 앞부분에 우연히 걸린 엉뚱한 글은 빼서 "추천 N개"로 세지 않는다(R1-011: asdfgh → 코드 속 as)', async () => {
    const stray: PagefindResultData[] = fakeResults(3).map((data) => ({ ...data, excerpt: 'import mediapipe <mark>as</mark> mp' }));
    installPagefind({ asdfgh: stray });
    const { input, list, live } = mount();
    type(input, 'asdfgh');
    await settle();
    const group = list.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toContain('찾지 못했어요');
    expect(options(list).every((o) => !o.classList.contains('suggest__item'))).toBe(true);
    expect(live.textContent).toContain('찾지 못했어요');
  });

  it('같은 글자만 되풀이한 입력(zzzz)은 찾지도 않고 "찾지 못했어요"', async () => {
    const { calls } = installPagefind({ zzzz: fakeResults(5) });
    const { input, live } = mount();
    type(input, 'zzzz');
    await settle();
    expect(calls).toEqual([]);
    expect(live.textContent).toContain('찾지 못했어요');
  });

  it('걸러 낸 글이 있으면 전체 개수는 알 수 없어 "전체 검색 결과 보기" 줄에 개수를 쓰지 않는다', async () => {
    const mixed: PagefindResultData[] = fakeResults(8).map((data, index) => ({
      ...data,
      excerpt: index % 2 === 0 ? '<mark>서보모터</mark>를 돌려요' : 'import <mark>as</mark> x',
    }));
    installPagefind({ 서보모터: mixed });
    const { input, list } = mount();
    type(input, '서보모터');
    await settle();
    const items = options(list).filter((o) => o.classList.contains('suggest__item'));
    expect(items).toHaveLength(4);
    expect(options(list).at(-1)?.textContent).not.toMatch(/\d+개/u);
  });

  it('오타(임게값)로 결과가 없으면 가장 가까운 추천 낱말(임계값)을 맨 앞 칩으로 보인다(R1-012)', async () => {
    installPagefind({ 임게값: [] });
    const { input, list } = mount();
    type(input, '임게값');
    await settle();
    expect(options(list)[0]?.textContent).toBe('임계값');
  });

  it('옵션 이름이 제목과 위치 사이에 공백을 둔다("제목위치"로 붙지 않는다)', async () => {
    installPagefind({ 서보: fakeResults(2) });
    const { input, list } = mount();
    type(input, '서보');
    await settle();
    expect(options(list)[0]?.textContent).toBe('1-1-1 제목 1 차시 · 배우기 › I단원');
  });

  it('결과가 없으면 "찾지 못했어요" + 추천 칩(검색어와 같은 것은 뺀다) + 전체 검색 줄', async () => {
    installPagefind({ 뷁쿍퓽: [] });
    const { input, list, live } = mount();
    type(input, '뷁쿍퓽');
    await settle();
    const group = list.querySelector('[role="group"]');
    expect(group?.getAttribute('aria-label')).toContain('찾지 못했어요');
    const all = options(list);
    expect(all.slice(0, 5).map((o) => o.textContent)).toEqual(POPULAR.slice(0, 5));
    expect(all.at(-1)?.textContent).toContain('"뷁쿍퓽" 전체 검색 결과 보기');
    expect(live.textContent).toContain('찾지 못했어요');
  });

  it('검색 도구를 못 받으면 전체 검색 줄만 보이고, 폼 제출은 그대로 된다', async () => {
    loadPagefindMock.mockRejectedValue(new Error('색인 없음'));
    const { input, list } = mount();
    type(input, '서보');
    await settle();
    const all = options(list);
    expect(all).toHaveLength(1);
    expect(all[0]?.textContent).toContain('"서보" 전체 검색 결과 보기');
    const submit = new Event('submit', { cancelable: true });
    expect(input.form?.dispatchEvent(submit)).toBe(true); // 막지 않는다
  });

  it('늦게 도착한 옛 결과는 버린다', async () => {
    let releaseFirst: (value: { results: never[] }) => void = () => undefined;
    const slow = new Promise<{ results: never[] }>((resolve) => {
      releaseFirst = resolve;
    });
    const fast = fakeResults(1);
    loadPagefindMock.mockResolvedValue({
      search: vi.fn((term: string) =>
        term === '느림' ? slow : Promise.resolve({ results: fast.map((data) => ({ id: '1', data: async () => data })) }),
      ),
    });
    const { input, list } = mount();
    type(input, '느림');
    await settle();
    type(input, '빠름');
    await settle();
    releaseFirst({ results: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(options(list)[0]?.textContent).toContain('1-1-1 제목 1');
    expect(options(list).at(-1)?.textContent).toContain('"빠름"');
  });

  it('입력을 시작하면 많이 찾는 낱말 칩은 곧바로 치우고 "찾는 중이에요…"를 보인다', async () => {
    const { input, list, panel } = mount();
    input.dispatchEvent(new Event('focus'));
    expect(options(list)).toHaveLength(POPULAR.length);
    type(input, '서');
    expect(options(list)).toHaveLength(0);
    expect(list.hidden).toBe(true);
    expect(panel.querySelector('.suggest__note')?.textContent).toBe('찾는 중이에요…');
    expect((panel.querySelector('.suggest__note') as HTMLElement).hidden).toBe(false);
    await settle();
    expect((panel.querySelector('.suggest__note') as HTMLElement).hidden).toBe(true);
    expect(list.hidden).toBe(false);
  });

  it('새 결과를 기다리는 동안에는 화살표로 고르지 못한다(묵은 목록으로 엉뚱한 곳에 가지 않게)', async () => {
    installPagefind({ 서보: fakeResults(3), 서보모: fakeResults(2) });
    const { input } = mount();
    type(input, '서보');
    await settle();
    type(input, '서보모'); // 기다리는 중: 목록은 아직 '서보'의 것
    const down = press(input, 'ArrowDown');
    expect(down.defaultPrevented).toBe(true);
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    await settle();
    press(input, 'ArrowDown');
    expect(input.hasAttribute('aria-activedescendant')).toBe(true);
  });

  it('칸을 비우면 곧바로 많이 찾는 낱말로 돌아간다', async () => {
    installPagefind({ 서보: fakeResults(1) });
    const { input, list } = mount();
    type(input, '서보');
    await settle();
    type(input, '');
    expect(options(list).map((o) => o.textContent)).toEqual(POPULAR);
  });
});

describe('키보드', () => {
  async function withResults() {
    installPagefind({ 서보: fakeResults(3) });
    const view = mount();
    type(view.input, '서보');
    await settle();
    return view;
  }

  it('↓↑로 고르면 aria-activedescendant가 따라가고 초점은 입력칸에 그대로다', async () => {
    const { input, list } = await withResults();
    input.focus();
    const all = options(list);
    press(input, 'ArrowDown');
    expect(input.getAttribute('aria-activedescendant')).toBe(all[0]?.id);
    expect(all[0]?.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(input);
    press(input, 'ArrowDown');
    expect(all[0]?.getAttribute('aria-selected')).toBe('false');
    expect(input.getAttribute('aria-activedescendant')).toBe(all[1]?.id);
    press(input, 'ArrowUp');
    expect(input.getAttribute('aria-activedescendant')).toBe(all[0]?.id);
    // 첫 항목에서 위로 가면 입력칸으로 돌아오고, 입력칸에서 한 번 더 위로 가면 맨 끝으로 간다
    press(input, 'ArrowUp');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    press(input, 'ArrowUp');
    expect(input.getAttribute('aria-activedescendant')).toBe(all.at(-1)?.id);
    press(input, 'ArrowDown');
    // 맨 끝에서 아래로 가면 입력칸으로
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('아무것도 쓰지 않은 Enter는 빈 검색 쪽을 열지 않게 막는다(R1-019)', () => {
    const { input } = mount();
    input.dispatchEvent(new Event('focus'));
    expect(press(input, 'Enter').defaultPrevented).toBe(true);
    input.value = '   ';
    expect(press(input, 'Enter').defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('고른 뒤 Enter는 그 쪽으로 가고(폼 제출을 막는다), 고르지 않은 Enter는 폼 제출 그대로다', async () => {
    const { input, list } = await withResults();
    const plain = press(input, 'Enter');
    expect(plain.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    press(input, 'ArrowDown');
    press(input, 'ArrowDown');
    const chosen = press(input, 'Enter');
    expect(chosen.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith(options(list)[1]?.href);
  });

  it('입력을 다시 치면 고른 항목이 풀린다(묵은 항목으로 가지 않게)', async () => {
    const { input } = await withResults();
    press(input, 'ArrowDown');
    type(input, '서보모');
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    expect(press(input, 'Enter').defaultPrevented).toBe(false);
  });

  it('Esc: 목록을 닫고, 닫힌 채 한 번 더 누르면 입력을 비운다. 닫을 것이 없으면 건드리지 않는다', async () => {
    const { input, panel } = await withResults();
    const first = press(input, 'Escape');
    expect(first.defaultPrevented).toBe(true);
    expect(panel.hidden).toBe(true);
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.value).toBe('서보');
    const second = press(input, 'Escape');
    expect(second.defaultPrevented).toBe(true);
    expect(input.value).toBe('');
    const third = press(input, 'Escape');
    expect(third.defaultPrevented).toBe(false);
  });

  it('Esc는 문서의 다른 Esc 처리(좁은 화면 메뉴 닫기)까지 번지지 않는다', async () => {
    const { input } = await withResults();
    const onDocument = vi.fn();
    document.addEventListener('keydown', onDocument);
    press(input, 'Escape');
    expect(onDocument).not.toHaveBeenCalled();
    document.removeEventListener('keydown', onDocument);
  });

  it('Tab은 목록을 닫는다', async () => {
    const { input, panel } = await withResults();
    press(input, 'Tab');
    expect(panel.hidden).toBe(true);
  });

  it('↓는 닫힌 목록을 연다', async () => {
    const { input, panel } = await withResults();
    press(input, 'Escape');
    expect(panel.hidden).toBe(true);
    press(input, 'ArrowDown');
    await settle();
    expect(panel.hidden).toBe(false);
  });

  it('한글 조합 중에는 화살표·Enter·Esc를 건드리지 않는다', async () => {
    const { input, panel } = await withResults();
    const down = press(input, 'ArrowDown', { isComposing: true });
    expect(down.defaultPrevented).toBe(false);
    expect(input.hasAttribute('aria-activedescendant')).toBe(false);
    const esc = press(input, 'Escape', { isComposing: true });
    expect(esc.defaultPrevented).toBe(false);
    expect(panel.hidden).toBe(false);
  });
});

describe('목록의 자리와 높이(R1-015·016)', () => {
  /** jsdom에는 자리 계산이 없어, 입력칸 폼의 위치를 가짜로 정하고 화면 높이를 바꿔 끼운다 */
  function fakeLayout(form: HTMLFormElement, rect: { top: number; bottom: number }, viewportHeight: number) {
    vi.spyOn(form, 'getBoundingClientRect').mockReturnValue({ ...rect, left: 0, right: 300, width: 300, height: rect.bottom - rect.top, x: 0, y: rect.top, toJSON: () => ({}) });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewportHeight });
  }

  it('아래 자리가 넉넉하면 아래로 열고, 높이를 남는 자리 안으로 제한한다(낮은 화면에서도 전체 보기 줄이 접히지 않게)', async () => {
    installPagefind({ 서보: fakeResults(6) });
    const { form, input, panel } = mount();
    fakeLayout(form, { top: 60, bottom: 100 }, 384);
    type(input, '서보');
    await settle();
    expect(panel.classList.contains('suggest--up')).toBe(false);
    expect(parseInt(panel.style.maxHeight, 10)).toBe(384 - 100 - 8 - 12);
  });

  it('아래 자리가 모자라고 위가 넓으면 위로 연다(휴대폰 메뉴 맨 아래 검색칸)', async () => {
    installPagefind({ 서보: fakeResults(6) });
    const { form, input, panel } = mount();
    fakeLayout(form, { top: 640, bottom: 690 }, 812);
    type(input, '서보');
    await settle();
    expect(panel.classList.contains('suggest--up')).toBe(true);
    expect(parseInt(panel.style.maxHeight, 10)).toBe(640 - 8 - 12);
  });

  it('닫으면 화면 크기 감시를 멈춘다(목록이 닫힌 채 계산하지 않는다)', async () => {
    installPagefind({ 서보: fakeResults(2) });
    const { form, input, panel } = mount();
    fakeLayout(form, { top: 60, bottom: 100 }, 800);
    type(input, '서보');
    await settle();
    press(input, 'Escape');
    expect(panel.hidden).toBe(true);
    const before = panel.style.maxHeight;
    fakeLayout(form, { top: 60, bottom: 100 }, 400);
    window.dispatchEvent(new Event('resize'));
    expect(panel.style.maxHeight).toBe(before);
  });
});

describe('닫기', () => {
  it('바깥을 누르면 닫히고, 칸 안을 누르면 닫히지 않는다', async () => {
    installPagefind({ 서보: fakeResults(1) });
    const { form, input, panel } = mount();
    type(input, '서보');
    await settle();
    expect(panel.hidden).toBe(false);
    form.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(panel.hidden).toBe(false);
    document.querySelector('#outside')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(panel.hidden).toBe(true);
  });

  it('초점이 폼 밖으로 나가면 닫히고, 폼 안의 단추로 가면 닫히지 않는다', async () => {
    installPagefind({ 서보: fakeResults(1) });
    const { form, input, panel } = mount();
    type(input, '서보');
    await settle();
    const button = form.querySelector('button') as HTMLButtonElement;
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: button }));
    expect(panel.hidden).toBe(false);
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.querySelector('#outside') }));
    expect(panel.hidden).toBe(true);
  });

  it('목록을 누르는 동안 입력칸에서 초점이 떠나지 않게 mousedown을 막는다', async () => {
    installPagefind({ 서보: fakeResults(1) });
    const { input, panel } = mount();
    type(input, '서보');
    await settle();
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    panel.querySelector('[role="option"]')?.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });
});
