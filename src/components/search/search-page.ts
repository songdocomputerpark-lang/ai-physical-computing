/**
 * 사이트 검색 화면의 동작(PLAN §8.1 P1-11). SearchPage.astro의 <script>가 부른다.
 *
 * Pagefind 기본 화면(pagefind-ui.js) 대신 Pagefind 브라우저 API(pagefind.js)로 가벼운 화면을 직접 만든 이유
 * - Pagefind 1.5.0부터 기본 화면(Default UI)은 새 부품형 화면(Component UI)으로 바뀌는 중이다(pagefind.app/docs/ui/, 2026-09-16 확인).
 * - 안내 문구를 모두 한국어로 쓰고, 사이트 디자인 토큰·초점 표시·44px 누르는 곳을 그대로 쓰기 위해서다.
 * - 주소의 검색어(?q=)를 읽고, 검색어가 바뀌면 주소도 바꿔 공유·뒤로 가기가 되게 한다.
 * - 더 받는 코드가 적다: pagefind.js(약 45KB)와 WebAssembly(약 68KB)만 받는다(기본 화면은 pagefind-ui.js 약 120KB가 더 든다).
 *
 * 쓰는 Pagefind API(pagefind.app/docs/api/, 2026-09-16 확인): options({ baseUrl, excerptLength }), init(), search(검색어)
 * → results[].data() → { url, excerpt, meta.title, sub_results[] }. excerpt는 Pagefind가 글자를 이스케이프한 뒤 <mark>만 붙인 HTML이다.
 * 그래도 이 화면은 excerpt를 innerHTML로 넣지 않고 글자와 <mark>만 골라 새로 만든다.
 * sub_results는 id가 있는 제목(h1~h6) 단위의 결과로 { title(제목 글자), url(#id가 붙은 주소), excerpt }를 준다.
 * 용어사전처럼 한 페이지에 항목이 많은 페이지(src/config/search.ts의 anchorPages)는 이 값을 써서 항목으로 바로 이어 준다.
 *
 * 화면 상태는 뿌리 요소의 data-state로 알린다(테스트가 기다리는 기준): idle · loading · results · empty · error
 */

/** 제목(id가 있는 h1~h6) 단위의 결과 */
interface PagefindSubResult {
  title: string;
  url: string;
  excerpt: string;
}

/** 검색 결과 한 건의 내용(쓰는 필드만) */
interface PagefindResultData {
  url: string;
  excerpt: string;
  meta?: { title?: string };
  sub_results?: PagefindSubResult[];
}

/** 화면에 그릴 결과 한 건 */
interface ResultView {
  title: string;
  url: string;
  excerpt: string;
}

/**
 * 항목 단위 페이지의 결과를 가장 잘 맞는 항목으로 바꾼다.
 * 제목이 검색어로 시작하는 항목(예: "픽셀" → "픽셀 Pixel")을 먼저 고르고, 없으면 검색어가 든 첫 항목, 그것도 없으면 첫 항목.
 * 항목이 없으면(제목 앞의 글에서만 맞음) 페이지 결과를 그대로 쓴다. 순수 함수라 단위 테스트가 검사한다.
 */
export function pickAnchoredResult(data: PagefindResultData, term: string): ResultView {
  const pageTitle = data.meta?.title?.trim() || data.url;
  const anchored = (data.sub_results ?? []).filter((sub) => sub.url.includes('#') && sub.title.trim() !== '');
  if (anchored.length === 0) {
    return { title: pageTitle, url: data.url, excerpt: data.excerpt };
  }
  const needle = term.trim().toLowerCase();
  const startsWith = anchored.find((sub) => sub.title.trim().toLowerCase().startsWith(needle));
  const includes = anchored.find((sub) => sub.title.toLowerCase().includes(needle));
  const chosen = startsWith ?? includes ?? anchored[0];
  return { title: `${chosen.title.trim()} — ${pageTitle}`, url: chosen.url, excerpt: chosen.excerpt };
}

interface PagefindResult {
  id: string;
  data: () => Promise<PagefindResultData>;
}

interface PagefindApi {
  options: (options: Record<string, unknown>) => Promise<void>;
  init: () => Promise<void>;
  search: (term: string) => Promise<{ results: PagefindResult[] }>;
}

/** 결과 주소 → 위 페이지 이름을 찾는 표(사이트 지도에서 만든다) */
interface SectionLabel {
  path: string;
  label: string;
}

type SearchState = 'idle' | 'loading' | 'results' | 'empty' | 'error';

/** 한 번에 보여 주는 결과 수 */
const PAGE_SIZE = 10;
/** 입력을 멈추고 이만큼 기다린 뒤 찾는다(밀리초). Pagefind 기본 화면의 기본값과 같다. */
const INPUT_DELAY_MS = 300;
/** 결과 요약 글자 수(낱말 수). Pagefind 기본값과 같다. */
const EXCERPT_LENGTH = 30;

function parseSections(json: string | undefined): SectionLabel[] {
  if (!json) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value)
      ? value.filter(
          (item): item is SectionLabel =>
            typeof item === 'object' && item !== null && typeof item.path === 'string' && typeof item.label === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

function parseStringList(json: string | undefined): string[] {
  if (!json) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Pagefind 요약(HTML)에서 글자와 <mark>만 골라 target에 붙인다. 다른 태그는 글자만 남긴다. */
function appendExcerpt(target: HTMLElement, excerpt: string): void {
  const parsed = new DOMParser().parseFromString(`<body>${excerpt}</body>`, 'text/html');
  parsed.body.childNodes.forEach((node) => {
    const text = node.textContent ?? '';
    if (node.nodeName === 'MARK') {
      const mark = document.createElement('mark');
      mark.textContent = text;
      target.append(mark);
    } else {
      target.append(text);
    }
  });
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
  if (!form || !input || !status || !resultsSection || !list || !moreButton || !emptyTips || !suggestions) {
    return;
  }

  const bundlePath = root.dataset.bundlePath ?? '/pagefind/';
  const baseUrl = root.dataset.baseUrl ?? '/';
  const queryParam = root.dataset.queryParam ?? 'q';
  const sections = parseSections(root.dataset.sections);
  const anchorPages = parseStringList(root.dataset.anchorPages);

  let pagefindPromise: Promise<PagefindApi> | undefined;
  /** 늦게 도착한 옛 검색 결과를 버리기 위한 번호 */
  let generation = 0;
  let inputTimer: number | undefined;
  let currentTerm = '';
  let currentResults: PagefindResult[] = [];
  let shownCount = 0;

  const setState = (state: SearchState) => {
    root.dataset.state = state;
  };

  const loadPagefind = (): Promise<PagefindApi> => {
    pagefindPromise ??= (async () => {
      const pagefind = (await import(/* @vite-ignore */ `${bundlePath}pagefind.js`)) as PagefindApi;
      await pagefind.options({ baseUrl, excerptLength: EXCERPT_LENGTH });
      await pagefind.init();
      return pagefind;
    })().catch((error: unknown) => {
      // 다음에 다시 시도할 수 있게 비운다.
      pagefindPromise = undefined;
      throw error;
    });
    return pagefindPromise;
  };

  const updateAddress = (term: string) => {
    const url = new URL(window.location.href);
    if (term) {
      url.searchParams.set(queryParam, term);
    } else {
      url.searchParams.delete(queryParam);
    }
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, '', url);
    }
  };

  /** 결과 주소의 사이트 안 경로(base·#위치 제외). 예: /ai-physical-computing/glossary/#pixel → /glossary/ */
  const sitePathOf = (resultUrl: string): string | undefined => {
    let path: string;
    try {
      path = new URL(resultUrl, window.location.origin).pathname;
    } catch {
      return undefined;
    }
    return baseUrl !== '/' && path.startsWith(baseUrl) ? `/${path.slice(baseUrl.length)}` : path;
  };

  /** 결과 주소의 위 페이지 이름들. 예: /ai-physical-computing/labs/esp32/check/ → "실습실 › ESP32 실습실" */
  const sectionTrail = (resultUrl: string): string => {
    const path = sitePathOf(resultUrl);
    if (path === undefined) {
      return '';
    }
    return sections
      .filter((section) => section.path !== '/' && section.path !== path && path.startsWith(section.path))
      .sort((a, b) => a.path.length - b.path.length)
      .map((section) => section.label)
      .join(' › ');
  };

  const buildResultItem = (data: PagefindResultData): HTMLLIElement => {
    const path = sitePathOf(data.url);
    const view: ResultView =
      path !== undefined && anchorPages.includes(path)
        ? pickAnchoredResult(data, currentTerm)
        : { title: data.meta?.title?.trim() || data.url, url: data.url, excerpt: data.excerpt };

    const item = document.createElement('li');
    item.className = 'search-result';

    const heading = document.createElement('h3');
    heading.className = 'search-result__title';
    const link = document.createElement('a');
    link.href = view.url;
    link.textContent = view.title;
    heading.append(link);
    item.append(heading);

    const trail = sectionTrail(data.url);
    if (trail) {
      const trailText = document.createElement('p');
      trailText.className = 'search-result__trail';
      trailText.textContent = `위치: ${trail}`;
      item.append(trailText);
    }

    const excerpt = document.createElement('p');
    excerpt.className = 'search-result__excerpt';
    appendExcerpt(excerpt, view.excerpt);
    item.append(excerpt);
    return item;
  };

  const describeCount = () => {
    const total = currentResults.length;
    const shown = shownCount < total ? ` 그중 ${shownCount}개를 보여 주고 있어요.` : '';
    status.textContent = `"${currentTerm}" 검색 결과 ${total}개예요.${shown}`;
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

  /** 다음 결과 묶음을 붙인다. focusFirstNew면 새로 붙은 첫 결과 링크로 초점을 옮긴다([결과 더 보기]를 누른 경우). */
  const appendNextResults = async (searchGeneration: number, focusFirstNew: boolean) => {
    const batch = currentResults.slice(shownCount, shownCount + PAGE_SIZE);
    const dataList = await Promise.all(batch.map((result) => result.data()));
    if (searchGeneration !== generation) {
      return;
    }
    const items = dataList.map(buildResultItem);
    list.append(...items);
    shownCount += batch.length;
    moreButton.hidden = shownCount >= currentResults.length;
    describeCount();
    if (focusFirstNew) {
      items[0]?.querySelector('a')?.focus();
    }
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
      const pagefind = await loadPagefind();
      const response = await pagefind.search(term);
      if (searchGeneration !== generation) {
        return;
      }
      currentTerm = term;
      currentResults = response.results;
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

  // 입력칸에 처음 초점이 가면 검색 도구를 미리 받아 첫 검색을 빠르게 한다(실패해도 검색할 때 다시 시도한다).
  input.addEventListener(
    'focus',
    () => {
      loadPagefind().catch(() => undefined);
    },
    { once: true },
  );

  const initialTerm = new URL(window.location.href).searchParams.get(queryParam) ?? '';
  if (initialTerm.trim() !== '') {
    input.value = initialTerm;
    void runSearch(initialTerm);
  } else {
    showIdle();
  }
}
