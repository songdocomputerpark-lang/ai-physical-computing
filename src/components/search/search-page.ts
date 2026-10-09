/**
 * 사이트 검색 화면의 동작(PLAN §8.1 P1-11, 판 1.3.0 종류 거르기). SearchPage.astro의 <script>가 부른다.
 *
 * Pagefind 기본 화면(pagefind-ui.js) 대신 Pagefind 브라우저 API(pagefind.js)로 가벼운 화면을 직접 만든 이유
 * - Pagefind 1.5.0부터 기본 화면(Default UI)은 새 부품형 화면(Component UI)으로 바뀌는 중이다(pagefind.app/docs/ui/, 2026-09-16 확인).
 * - 안내 문구를 모두 한국어로 쓰고, 사이트 디자인 토큰·초점 표시·44px 누르는 곳을 그대로 쓰기 위해서다.
 * - 주소의 검색어(?q=)를 읽고, 검색어가 바뀌면 주소도 바꿔 공유·뒤로 가기가 되게 한다.
 * - 더 받는 코드가 적다: pagefind.js(약 45KB)와 WebAssembly(약 68KB)만 받는다(기본 화면은 pagefind-ui.js 약 120KB가 더 든다).
 *
 * Pagefind를 부르고 결과를 고르고 요약을 그리는 공용 부분은 search-core.ts에 있다(머리글 자동 완성 search-suggest.ts와 함께 쓴다).
 * pickAnchoredResult·isGlossaryGroupAnchor는 예전 자리에서도 불러 쓸 수 있게 여기서 다시 내보낸다(tests/unit/search-page.test.ts).
 *
 * 종류 거르기(판 1.3.0): 결과 위의 칩(전체·차시·실습실·용어사전·오류·예제·교사용)이 결과를 쪽 종류로 거른다. 주소에는 &type=이 붙는다.
 * Pagefind 색인에 종류 정보가 없어서(쪽 주소로 가린다) 거를 때는 결과 내용을 10개씩 받아 가며 맞는 것을 모은다 — 맞는 것이 10개 찰 때까지만 받는다.
 *
 * 화면 상태는 뿌리 요소의 data-state로 알린다(테스트가 기다리는 기준): idle · loading · results · empty · error
 */
import { createSearchIcon } from './search-icons.ts';
import {
  KIND_ICON,
  KIND_LABEL,
  appendExcerpt,
  isFilterKind,
  loadPagefind,
  readSearchConfig,
  toResultCard,
  type FilterKind,
  type PagefindResult,
  type ResultCard,
} from './search-core.ts';

export { isGlossaryGroupAnchor, pickAnchoredResult } from './search-core.ts';

type SearchState = 'idle' | 'loading' | 'results' | 'empty' | 'error';
type TypeFilter = 'all' | FilterKind;

/** 한 번에 보여 주는 결과 수 */
export const PAGE_SIZE = 10;
/** 입력을 멈추고 이만큼 기다린 뒤 찾는다(밀리초). Pagefind 기본 화면의 기본값과 같다. */
const INPUT_DELAY_MS = 300;
/** 주소에서 결과 종류를 싣는 이름 */
export const TYPE_PARAM = 'type';

/** 종류 거르기 칩 아래의 안내 글(상태 줄) */
export function describeResults(term: string, total: number, shown: number, filter: TypeFilter, hasMore: boolean): string {
  if (filter === 'all') {
    const part = shown < total ? ` 그중 ${shown}개를 보여 주고 있어요.` : '';
    return `"${term}" 검색 결과 ${total}개예요.${part}`;
  }
  const label = KIND_LABEL[filter];
  if (shown === 0) {
    return `"${term}" 검색 결과 중 '${label}'에 맞는 글은 없어요. 다른 종류를 눌러 보세요.`;
  }
  return `"${term}" 검색 결과 중 '${label}' ${shown}개를 보여 주고 있어요.${hasMore ? ' 더 있어요.' : ''}`;
}

/** 주소의 type 값을 거르기 값으로 바꾼다. 모르는 값은 전체. */
export function parseTypeFilter(value: string | null | undefined): TypeFilter {
  return isFilterKind(value) ? value : 'all';
}

export function setupSearchPage(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('[data-search-form]');
  const input = root.querySelector<HTMLInputElement>('[data-search-input]');
  const status = root.querySelector<HTMLElement>('[data-search-status]');
  const resultsSection = root.querySelector<HTMLElement>('[data-search-results-section]');
  const list = root.querySelector<HTMLOListElement>('[data-search-results]');
  const moreButton = root.querySelector<HTMLButtonElement>('[data-search-more]');
  const emptyTips = root.querySelector<HTMLElement>('[data-search-empty]');
  const suggestions = root.querySelector<HTMLElement>('[data-search-suggestions]');
  const typeGroup = root.querySelector<HTMLElement>('[data-search-types]');
  if (!form || !input || !status || !resultsSection || !list || !moreButton || !emptyTips || !suggestions || !typeGroup) {
    return;
  }

  const config = readSearchConfig(root);
  const typeButtons = Array.from(typeGroup.querySelectorAll<HTMLButtonElement>('[data-type]'));

  /** 늦게 도착한 옛 검색 결과를 버리기 위한 번호 */
  let generation = 0;
  let inputTimer: number | undefined;
  let currentTerm = '';
  let filter: TypeFilter = parseTypeFilter(new URL(window.location.href).searchParams.get(TYPE_PARAM));
  let currentResults: PagefindResult[] = [];
  /** 지금까지 내용을 받아 본 결과(앞에서부터 차례대로) */
  let cards: ResultCard[] = [];
  let shownCount = 0;

  const setState = (state: SearchState) => {
    root.dataset.state = state;
    // 종류 칩은 결과가 있을 때만 보인다(다시 찾는 동안에는 그대로 둔다 — 칩이 깜박이며 화면이 밀리지 않게)
    if (state !== 'loading') {
      typeGroup.hidden = state !== 'results';
    }
  };

  const matched = (): ResultCard[] => (filter === 'all' ? cards : cards.filter((card) => card.kind === filter));
  const hasUnscanned = (): boolean => cards.length < currentResults.length;

  const paintTypeButtons = () => {
    for (const button of typeButtons) {
      const selected = button.dataset.type === filter;
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
  };

  const updateAddress = (term: string) => {
    const url = new URL(window.location.href);
    if (term) {
      url.searchParams.set(config.queryParam, term);
    } else {
      url.searchParams.delete(config.queryParam);
    }
    if (term && filter !== 'all') {
      url.searchParams.set(TYPE_PARAM, filter);
    } else {
      url.searchParams.delete(TYPE_PARAM);
    }
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, '', url);
    }
  };

  const buildResultItem = (card: ResultCard): HTMLLIElement => {
    const item = document.createElement('li');
    item.className = 'search-result card card--link';
    item.dataset.kind = card.kind;

    const icon = document.createElement('span');
    icon.className = 'search-result__icon card__icon';
    icon.append(createSearchIcon(KIND_ICON[card.kind]));
    item.append(icon);

    const body = document.createElement('div');
    body.className = 'search-result__body';

    const kind = document.createElement('p');
    kind.className = 'search-result__kind';
    kind.textContent = KIND_LABEL[card.kind];
    body.append(kind);

    const heading = document.createElement('h3');
    heading.className = 'search-result__title';
    const link = document.createElement('a');
    link.className = 'card__link';
    link.href = card.url;
    link.textContent = card.title;
    heading.append(link);
    body.append(heading);

    if (card.trail) {
      const trailText = document.createElement('p');
      trailText.className = 'search-result__trail';
      trailText.textContent = `위치: ${card.trail}`;
      body.append(trailText);
    }

    const excerpt = document.createElement('p');
    excerpt.className = 'search-result__excerpt';
    appendExcerpt(excerpt, card.excerpt);
    body.append(excerpt);

    item.append(body);
    return item;
  };

  const describeCount = () => {
    status.textContent = describeResults(currentTerm, currentResults.length, shownCount, filter, hasUnscanned() || shownCount < matched().length);
  };

  const showIdle = () => {
    setState('idle');
    status.textContent = '';
    list.replaceChildren();
    resultsSection.hidden = true;
    moreButton.hidden = true;
    emptyTips.hidden = true;
    suggestions.hidden = false;
  };

  const showError = (error: unknown) => {
    setState('error');
    status.textContent = '검색을 불러오지 못했어요. 인터넷 연결을 확인하고 페이지를 새로고침해 보세요.';
    resultsSection.hidden = true;
    emptyTips.hidden = true;
    suggestions.hidden = true;
    // 개발 서버(npm run dev)에는 검색 색인(dist/pagefind/)이 없다. npm run build 뒤 미리 보기에서 확인한다.
    console.warn('[사이트 검색] Pagefind를 불러오지 못했어요. 개발 서버라면 npm run build 뒤 npm run preview로 확인하세요.', error);
  };

  /** 거르기에 맞는 결과가 target개가 될 때까지(또는 결과가 바닥날 때까지) 결과 내용을 10개씩 받아 모은다. false면 그동안 새 검색이 시작됐다. */
  const scanUntil = async (target: number, searchGeneration: number): Promise<boolean> => {
    while (matched().length < target && hasUnscanned()) {
      const batch = currentResults.slice(cards.length, cards.length + PAGE_SIZE);
      const dataList = await Promise.all(batch.map((result) => result.data()));
      if (searchGeneration !== generation) {
        return false;
      }
      cards.push(...dataList.map((data) => toResultCard(data, currentTerm, config, window.location.origin)));
    }
    return true;
  };

  /** 다음 결과 묶음을 붙인다. focusFirstNew면 새로 붙은 첫 결과 링크로 초점을 옮긴다([결과 더 보기]를 누른 경우). */
  const appendNextResults = async (searchGeneration: number, focusFirstNew: boolean) => {
    if (!(await scanUntil(shownCount + PAGE_SIZE, searchGeneration))) {
      return;
    }
    const batch = matched().slice(shownCount, shownCount + PAGE_SIZE);
    const items = batch.map(buildResultItem);
    list.append(...items);
    shownCount += batch.length;
    moreButton.hidden = shownCount >= matched().length && !hasUnscanned();
    describeCount();
    if (focusFirstNew) {
      items[0]?.querySelector('a')?.focus();
    }
  };

  /** 결과 목록을 처음부터 다시 그린다(종류를 바꿨을 때) */
  const repaintResults = async (searchGeneration: number) => {
    list.replaceChildren();
    shownCount = 0;
    await appendNextResults(searchGeneration, false);
  };

  const runSearch = async (rawTerm: string) => {
    const term = rawTerm.trim();
    generation += 1;
    const searchGeneration = generation;
    updateAddress(term);
    if (term === '') {
      showIdle();
      return;
    }

    setState('loading');
    try {
      const pagefind = await loadPagefind(config);
      const response = await pagefind.search(term);
      if (searchGeneration !== generation) {
        return;
      }
      currentTerm = term;
      currentResults = response.results;
      cards = [];
      shownCount = 0;
      list.replaceChildren();
      suggestions.hidden = true;

      if (currentResults.length === 0) {
        resultsSection.hidden = true;
        moreButton.hidden = true;
        emptyTips.hidden = false;
        status.textContent = `"${term}"에 맞는 글을 찾지 못했어요.`;
        setState('empty');
        return;
      }

      emptyTips.hidden = true;
      resultsSection.hidden = false;
      paintTypeButtons();
      await appendNextResults(searchGeneration, false);
      if (searchGeneration === generation) {
        setState('results');
      }
    } catch (error) {
      if (searchGeneration === generation) {
        showError(error);
      }
    }
  };

  const selectType = (next: TypeFilter, moveFocus: boolean) => {
    if (next === filter) {
      return;
    }
    filter = next;
    paintTypeButtons();
    if (moveFocus) {
      typeButtons.find((button) => button.dataset.type === next)?.focus();
    }
    if (currentTerm === '' || root.dataset.state !== 'results') {
      return;
    }
    updateAddress(currentTerm);
    generation += 1;
    const searchGeneration = generation;
    repaintResults(searchGeneration).catch((error: unknown) => {
      if (searchGeneration === generation) {
        showError(error);
      }
    });
  };

  input.addEventListener('input', () => {
    window.clearTimeout(inputTimer);
    inputTimer = window.setTimeout(() => {
      void runSearch(input.value);
    }, INPUT_DELAY_MS);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    window.clearTimeout(inputTimer);
    void runSearch(input.value);
  });

  moreButton.addEventListener('click', () => {
    const searchGeneration = generation;
    appendNextResults(searchGeneration, true).catch((error: unknown) => {
      if (searchGeneration === generation) {
        showError(error);
      }
    });
  });

  // 종류 칩(라디오 모임): 화살표로 옮기면 바로 골라진다. 탭 정지점은 고른 칩 하나뿐이다.
  for (const button of typeButtons) {
    button.addEventListener('click', () => {
      const value = button.dataset.type;
      selectType(value === 'all' || isFilterKind(value) ? value : 'all', false);
    });
  }
  typeGroup.addEventListener('keydown', (event) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    const values = typeButtons.map((button) => button.dataset.type ?? 'all');
    const at = Math.max(0, values.indexOf(filter));
    let to = at;
    if (event.key === 'Home') {
      to = 0;
    } else if (event.key === 'End') {
      to = values.length - 1;
    } else {
      const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      to = (at + step + values.length) % values.length;
    }
    const value = values[to];
    selectType(value === 'all' || isFilterKind(value) ? value : 'all', true);
  });

  // 입력칸에 처음 초점이 가면 검색 도구를 미리 받아 첫 검색을 빠르게 한다(실패해도 검색할 때 다시 시도한다).
  input.addEventListener(
    'focus',
    () => {
      loadPagefind(config).catch(() => undefined);
    },
    { once: true },
  );

  paintTypeButtons();
  const initialTerm = new URL(window.location.href).searchParams.get(config.queryParam) ?? '';
  if (initialTerm.trim() !== '') {
    input.value = initialTerm;
    void runSearch(initialTerm);
  } else {
    showIdle();
  }
}
