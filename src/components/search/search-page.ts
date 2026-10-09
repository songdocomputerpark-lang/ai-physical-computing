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
 * 거르기·순서(판 1.3.0 검수 R1-011~014): Pagefind는 낱말이 정확히 없으면 낱말의 앞부분으로 물러서서 맞추므로 엉뚱한 글이 "검색 결과 N개"로 나왔다.
 * 그래서 결과 내용을 받을 때마다 요약에 맞은 낱말이 검색어를 충분히 덮는 글만 남기고(search-rank.ts), 처음 받는 20개 안에서는 용어사전·오류 사전 항목,
 * 제목에 낱말이 있는 글을 앞에 둔다. 처음 20개가 모두 걸러지면 "맞는 글 없음"이다. 맞는 글이 없으면 낱말을 하나씩 빼 다시 찾고(R1-021),
 * 그래도 없으면 오타 같은 낱말을 "혹시 이 낱말인가요?"로 알린다(R1-012, search-hint.ts).
 *
 * 화면 상태는 뿌리 요소의 data-state로 알린다(테스트가 기다리는 기준): idle · loading · results · empty · error
 */
import { createSearchIcon } from './search-icons.ts';
import {
  KIND_ICON,
  KIND_LABEL,
  appendExcerpt,
  evaluateResult,
  isFilterKind,
  loadPagefind,
  orderEvaluated,
  parseStringList,
  planSearch,
  readSearchConfig,
  searchPlanned,
  type FilterKind,
  type PagefindResult,
  type ResultCard,
  type SearchPlan,
} from './search-core.ts';
import { didYouMean, fallbackTerms, normalizeVocabulary, restoreCase } from './search-hint.ts';

export { isGlossaryGroupAnchor, pickAnchoredResult } from './search-core.ts';

type SearchState = 'idle' | 'loading' | 'results' | 'empty' | 'error';
type TypeFilter = 'all' | FilterKind;

/** 한 번에 보여 주는 결과 수 */
export const PAGE_SIZE = 10;
/** 처음에 한꺼번에 내용을 받아 걸러 내고 순서를 바로잡는 결과 수(받는 파일은 작고 함께 받는다) */
export const RANK_WINDOW = 20;
/** "찾는 중이에요"를 알리기 전에 기다리는 시간(밀리초): 빠른 컴퓨터에서는 알리지 않고 결과만 알리게 */
const LOADING_NOTE_DELAY_MS = 500;
/** 이만큼 지나도 결과가 없으면 느린 인터넷 안내를 덧붙인다(밀리초) */
const SLOW_NOTE_DELAY_MS = 8000;
/** history.state에 결과를 얼마나 펼쳤는지 적어 두는 이름 — 결과를 열었다 뒤로 오면 같은 만큼 펼친다(R1-020) */
export const VIEW_STATE_KEY = 'apcSearchView';

/** 뒤로 왔을 때 되살릴 화면: 어떤 검색어·종류에서, 몇 개 펼쳤고, 어디까지 내려갔는지 */
export interface SavedView {
  term: string;
  filter: string;
  shown: number;
  scrollY: number;
}

/** history.state에서 저장한 화면을 읽는다(모양이 맞지 않으면 undefined) */
export function readSavedView(state: unknown): SavedView | undefined {
  if (typeof state !== 'object' || state === null) {
    return undefined;
  }
  const saved = (state as Record<string, unknown>)[VIEW_STATE_KEY];
  if (typeof saved !== 'object' || saved === null) {
    return undefined;
  }
  const { term, filter, shown, scrollY } = saved as Record<string, unknown>;
  if (typeof term !== 'string' || typeof filter !== 'string' || typeof shown !== 'number' || typeof scrollY !== 'number') {
    return undefined;
  }
  return { term, filter, shown, scrollY };
}
/** 입력을 멈추고 이만큼 기다린 뒤 찾는다(밀리초). Pagefind 기본 화면의 기본값과 같다. */
const INPUT_DELAY_MS = 300;
/** 주소에서 결과 종류를 싣는 이름 */
export const TYPE_PARAM = 'type';

/** 종류 거르기 칩 아래의 안내 글(상태 줄). approximate면 걸러 낼 글이 더 있을 수 있어 "약"을 붙인다. */
export function describeResults(
  term: string,
  total: number,
  shown: number,
  filter: TypeFilter,
  hasMore: boolean,
  approximate = false,
): string {
  if (filter === 'all') {
    const part = shown < total ? ` 그중 ${shown}개를 보여 주고 있어요.` : '';
    return `"${term}" 검색 결과 ${approximate ? '약 ' : ''}${total}개예요.${part}`;
  }
  const label = KIND_LABEL[filter];
  if (shown === 0) {
    return `"${term}" 검색 결과 중 "${label}"에 맞는 글은 없어요. 다른 종류를 눌러 보세요.`;
  }
  return `"${term}" 검색 결과 중 "${label}" ${shown}개를 보여 주고 있어요.${hasMore ? ' 더 있어요.' : ''}`;
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
  // 쪽 HTML 끝의 작은 안내 스크립트가 "검색 화면이 아직 안 떴다"고 말하지 않도록 알린다
  root.dataset.ready = 'true';
  // 없어도 검색은 된다(오래된 쪽 HTML): 오타 제안 칸, 불러오기 실패 때의 길 안내 칸
  const didYouMeanBox = root.querySelector<HTMLElement>('[data-search-didyou]');
  const didYouMeanList = root.querySelector<HTMLElement>('[data-search-didyou-list]');
  const errorLinks = root.querySelector<HTMLElement>('[data-search-error-links]');

  const config = readSearchConfig(root);
  const vocabularyItems = parseStringList(root.dataset.vocab);
  const vocabulary = normalizeVocabulary(vocabularyItems);
  const typeButtons = Array.from(typeGroup.querySelectorAll<HTMLButtonElement>('[data-type]'));

  /** 늦게 도착한 옛 검색 결과를 버리기 위한 번호 */
  let generation = 0;
  let inputTimer: number | undefined;
  let loadingTimer: number | undefined;
  let slowTimer: number | undefined;
  let currentTerm = '';
  /** 낱말을 줄여 다시 찾았을 때 실제로 찾은 말(줄이지 않았으면 undefined) */
  let reducedTerm: string | undefined;
  let activePlan: SearchPlan | undefined;
  let filter: TypeFilter = parseTypeFilter(new URL(window.location.href).searchParams.get(TYPE_PARAM));
  let currentResults: PagefindResult[] = [];
  /** 지금까지 내용을 받아 걸러 낸 뒤 남은 결과(앞에서부터 차례대로) */
  let cards: ResultCard[] = [];
  /** 내용을 받아 본 Pagefind 결과 수(걸러 낸 것 포함) */
  let scanned = 0;
  /** 받아 보니 검색어와 맞지 않아 뺀 결과 수 */
  let dropped = 0;
  let shownCount = 0;

  const setState = (state: SearchState) => {
    root.dataset.state = state;
    // 종류 칩은 결과가 있을 때만 보인다(다시 찾는 동안에는 그대로 둔다 — 칩이 깜박이며 화면이 밀리지 않게)
    if (state !== 'loading') {
      typeGroup.hidden = state !== 'results';
    }
  };

  const matched = (): ResultCard[] => (filter === 'all' ? cards : cards.filter((card) => card.kind === filter));
  const hasUnscanned = (): boolean => scanned < currentResults.length;

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

  /** 지금 화면(검색어·종류·펼친 개수·내려간 자리)을 history.state에 적어 둔다 — 결과를 열었다가 뒤로 오면 되살린다(R1-020) */
  const saveView = () => {
    if (currentTerm === '' || root.dataset.state !== 'results') {
      return;
    }
    try {
      const previous: Record<string, unknown> =
        typeof window.history.state === 'object' && window.history.state !== null ? (window.history.state as Record<string, unknown>) : {};
      const view: SavedView = { term: currentTerm, filter, shown: shownCount, scrollY: Math.round(window.scrollY) };
      window.history.replaceState({ ...previous, [VIEW_STATE_KEY]: view }, '', window.location.href);
    } catch {
      // 기록을 못 남겨도 검색은 된다
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
    const more = hasUnscanned() || shownCount < matched().length;
    // 걸러 낸 글이 있고 아직 다 안 살폈으면 개수는 어림이다
    const total = Math.max(cards.length, currentResults.length - dropped);
    const approximate = dropped > 0 && hasUnscanned();
    if (reducedTerm !== undefined) {
      status.textContent = `"${currentTerm}"에 꼭 맞는 글은 없어서 낱말을 줄여 찾았어요. ${describeResults(reducedTerm, total, shownCount, filter, more, approximate)}`;
      return;
    }
    status.textContent = describeResults(currentTerm, total, shownCount, filter, more, approximate);
  };

  const clearLoadingNotes = () => {
    window.clearTimeout(loadingTimer);
    window.clearTimeout(slowTimer);
  };

  /** 찾는 동안의 안내: 잠깐 걸리면 "찾는 중이에요", 오래 걸리면 인터넷이 느려서 그렇다고 알린다(R1-022) */
  const startLoadingNotes = (searchGeneration: number) => {
    clearLoadingNotes();
    const stillLoading = () => searchGeneration === generation && root.dataset.state === 'loading';
    loadingTimer = window.setTimeout(() => {
      if (stillLoading() && status.textContent === '') {
        status.textContent = '찾는 중이에요…';
      }
    }, LOADING_NOTE_DELAY_MS);
    slowTimer = window.setTimeout(() => {
      if (stillLoading()) {
        status.textContent = '찾는 중이에요… 인터넷이 느려서 조금 걸려요. 잠시만 기다려 주세요.';
      }
    }, SLOW_NOTE_DELAY_MS);
  };

  const hideHelpBoxes = () => {
    emptyTips.hidden = true;
    if (didYouMeanBox) {
      didYouMeanBox.hidden = true;
    }
    if (errorLinks) {
      errorLinks.hidden = true;
    }
  };

  const showIdle = () => {
    clearLoadingNotes();
    setState('idle');
    status.textContent = '';
    list.replaceChildren();
    resultsSection.hidden = true;
    moreButton.hidden = true;
    hideHelpBoxes();
    suggestions.hidden = false;
  };

  const showError = (error: unknown) => {
    clearLoadingNotes();
    setState('error');
    status.textContent = '검색을 불러오지 못했어요. 인터넷 연결을 확인하고 페이지를 새로고침해 보세요.';
    resultsSection.hidden = true;
    hideHelpBoxes();
    suggestions.hidden = true;
    // 검색이 안 되어도 갈 곳이 있게 배우기·홈 링크를 보인다(R1-024)
    if (errorLinks) {
      errorLinks.hidden = false;
    }
    // 개발 서버(npm run dev)에는 검색 색인(dist/pagefind/)이 없다. npm run build 뒤 미리 보기에서 확인한다.
    console.warn('[사이트 검색] Pagefind를 불러오지 못했어요. 개발 서버라면 npm run build 뒤 npm run preview로 확인하세요.', error);
  };

  /** 결과 내용을 size개 받아 검색어와 맞는 글만 남기고 차례를 바로잡아 cards 뒤에 붙인다. false면 그동안 새 검색이 시작됐다. */
  const scanBatch = async (size: number, searchGeneration: number): Promise<boolean> => {
    const plan = activePlan;
    if (!plan) {
      return true;
    }
    const batch = currentResults.slice(scanned, scanned + size);
    const dataList = await Promise.all(batch.map((result) => result.data()));
    if (searchGeneration !== generation) {
      return false;
    }
    const isFirst = scanned === 0;
    scanned += batch.length;
    const kept = orderEvaluated(dataList.map((data) => evaluateResult(data, plan, config, window.location.origin)));
    dropped += batch.length - kept.length;
    cards.push(...kept);
    if (isFirst && kept.length === 0) {
      // 처음 묶음이 모두 우연히 걸린 글이면 나머지도 그렇다고 보고 더 받지 않는다("asdfgh" 같은 엉뚱한 낱말)
      dropped += currentResults.length - scanned;
      scanned = currentResults.length;
    }
    return true;
  };

  /** 거르기에 맞는 결과가 target개가 될 때까지(또는 결과가 바닥날 때까지) 결과 내용을 받아 모은다. 처음에는 RANK_WINDOW개를 한꺼번에 받는다. false면 그동안 새 검색이 시작됐다. */
  const scanUntil = async (target: number, searchGeneration: number): Promise<boolean> => {
    while (matched().length < target && hasUnscanned()) {
      if (!(await scanBatch(scanned === 0 ? RANK_WINDOW : PAGE_SIZE, searchGeneration))) {
        return false;
      }
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

  /** 맞는 글이 없을 때: 안내 글, 바꿔 찾는 방법, 오타 같으면 "혹시 이 낱말인가요?" */
  const showEmpty = (term: string) => {
    clearLoadingNotes();
    resultsSection.hidden = true;
    moreButton.hidden = true;
    hideHelpBoxes();
    emptyTips.hidden = false;
    status.textContent = `"${term}"에 맞는 글을 찾지 못했어요.`;
    const rawGuess = didYouMean(term, vocabulary);
    const guess = rawGuess === undefined ? undefined : restoreCase(rawGuess, vocabularyItems);
    if (didYouMeanBox && didYouMeanList) {
      didYouMeanList.replaceChildren();
      if (guess !== undefined) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.className = 'search-chip';
        link.href = `${window.location.pathname}?${config.queryParam}=${encodeURIComponent(guess)}`;
        link.textContent = guess;
        item.append(link);
        didYouMeanList.append(item);
        didYouMeanBox.hidden = false;
      }
    }
    setState('empty');
  };

  /** 한 번 찾아 본다: 결과가 있고 진짜 맞는 글이 하나라도 있으면 true. 이 말로는 맞는 글이 없으면 false. 새 검색이 시작됐으면 'stale'. */
  const tryPlan = async (
    plan: SearchPlan,
    pagefind: { search: (term: string) => Promise<{ results: PagefindResult[] }> },
    searchGeneration: number,
  ): Promise<boolean | 'stale'> => {
    const results = await searchPlanned(pagefind, plan.terms);
    if (searchGeneration !== generation) {
      return 'stale';
    }
    if (results.length === 0) {
      return false;
    }
    currentResults = results;
    cards = [];
    scanned = 0;
    dropped = 0;
    activePlan = plan;
    if (!(await scanUntil(PAGE_SIZE, searchGeneration))) {
      return 'stale';
    }
    return cards.length > 0;
  };

  const runSearch = async (rawTerm: string, restore?: SavedView) => {
    const term = rawTerm.trim();
    generation += 1;
    const searchGeneration = generation;
    updateAddress(term);
    if (term === '') {
      showIdle();
      return;
    }

    setState('loading');
    startLoadingNotes(searchGeneration);
    // 찾는 동안에는 추천 낱말을 치운다: 결과가 오기 전에 눌러 엉뚱한 곳으로 가지 않게
    suggestions.hidden = true;
    if (errorLinks) {
      errorLinks.hidden = true;
    }
    try {
      const pagefind = await loadPagefind(config);
      if (searchGeneration !== generation) {
        return;
      }
      currentTerm = term;
      reducedTerm = undefined;
      activePlan = undefined;
      currentResults = [];
      cards = [];
      scanned = 0;
      dropped = 0;
      shownCount = 0;
      list.replaceChildren();

      const plan = planSearch(term);
      let found = false;
      if (plan) {
        const attempts: SearchPlan[] = [plan, ...fallbackTerms(plan.display).map((words) => ({ display: plan.display, terms: [words] }))];
        for (const [index, attempt] of attempts.entries()) {
          const outcome = await tryPlan(attempt, pagefind, searchGeneration);
          if (outcome === 'stale') {
            return;
          }
          if (outcome) {
            found = true;
            reducedTerm = index > 0 ? attempt.terms[0] : undefined;
            break;
          }
        }
      }

      if (!found) {
        currentResults = [];
        cards = [];
        showEmpty(term);
        return;
      }

      hideHelpBoxes();
      resultsSection.hidden = false;
      paintTypeButtons();
      await appendNextResults(searchGeneration, false);
      // 결과를 열었다가 뒤로 왔으면 펼쳤던 만큼 다시 펼치고 내려갔던 자리로 돌아간다
      const restoring = restore !== undefined && restore.term === term && restore.filter === filter;
      if (restoring) {
        while (searchGeneration === generation && shownCount < restore.shown && (shownCount < matched().length || hasUnscanned())) {
          await appendNextResults(searchGeneration, false);
        }
      }
      if (searchGeneration === generation) {
        clearLoadingNotes();
        setState('results');
        if (restoring) {
          window.scrollTo(0, restore.scrollY);
        }
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

  // 결과를 열기 직전에 펼친 개수·내려간 자리를 적어 둔다(뒤로 가기 때 되살림). 쪽을 떠날 때도 한 번 더 적는다.
  list.addEventListener('click', saveView);
  window.addEventListener('pagehide', saveView);

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
  const startParams = new URL(window.location.href).searchParams;
  const initialTerm = startParams.get(config.queryParam) ?? '';
  if (initialTerm.trim() !== '') {
    input.value = initialTerm;
    void runSearch(initialTerm, readSavedView(window.history.state));
  } else {
    showIdle();
    // 빈 검색(/search/?q=)으로 왔으면 바로 쓸 수 있게 입력칸에 초점을 둔다(R1-019: 전에는 초점이 쪽 맨 위로 사라졌다)
    if (startParams.has(config.queryParam)) {
      input.focus();
    }
  }
}
