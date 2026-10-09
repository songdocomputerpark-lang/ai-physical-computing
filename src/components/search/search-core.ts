/**
 * 찾기의 공용 부분(판 1.3.0 구역 B) — 검색 쪽(search-page.ts)과 자동 완성(search-suggest.ts)이 함께 쓴다.
 *
 * - Pagefind 불러오기: 쪽에서 한 번만 받는다(자동 완성이 미리 받아 두면 검색 쪽이 그대로 쓴다). 쪽을 열 때는 받지 않는다 —
 *   사용자가 검색칸에 초점을 주거나 입력할 때 부른다(성능 규칙: 검색 도구는 쓸 때만 받는다).
 * - 결과 고르기: 한 쪽에 항목이 많은 쪽(용어사전·오류 사전·예제 갤러리·자주 묻는 질문)은 항목 단위 결과로 바꾼다(pickAnchoredResult).
 * - 쪽 종류: 주소로 차시·실습실·용어사전·오류·예제·교사용을 가려 아이콘과 이름을 붙인다.
 * - 요약 그리기: Pagefind 요약(HTML)에서 글자와 <mark>만 골라 새로 만든다(innerHTML을 쓰지 않음).
 *
 * 이 파일은 모든 쪽이 받는 스크립트(머리글 자동 완성)에 들어가므로 작게 유지한다. 공용 설정(site.ts)과 아이콘 표 전체는 불러오지 않는다 —
 * 설정은 data- 속성으로 받는다(SearchPage.astro·HeaderSearch.astro 머리말).
 *
 * 쓰는 Pagefind API(pagefind.app/docs/api/): options({ baseUrl, excerptLength }), init(), search(검색어)
 * → results[].data() → { url, excerpt, meta.title, sub_results[] }. excerpt는 Pagefind가 글자를 이스케이프한 뒤 <mark>만 붙인 HTML이다.
 */

import {
  MIN_PARTIAL_LENGTH,
  anchorKey,
  coreWords,
  isRelevant,
  markPieces,
  planSearch,
  tierOf,
  type SearchPlan,
} from './search-rank.ts';

/** 제목(id가 있는 h1~h6) 단위의 결과 */
export interface PagefindSubResult {
  title: string;
  url: string;
  excerpt: string;
}

/** 검색 결과 한 건의 내용(쓰는 필드만) */
export interface PagefindResultData {
  url: string;
  excerpt: string;
  meta?: { title?: string };
  sub_results?: PagefindSubResult[];
}

/** 화면에 그릴 결과 한 건 */
export interface ResultView {
  title: string;
  url: string;
  excerpt: string;
}

export interface PagefindResult {
  id: string;
  data: () => Promise<PagefindResultData>;
}

export interface PagefindApi {
  options: (options: Record<string, unknown>) => Promise<void>;
  init: () => Promise<void>;
  search: (term: string) => Promise<{ results: PagefindResult[] }>;
}

/** 결과 주소 → 위 페이지 이름을 찾는 표(사이트 지도에서 만든다) */
export interface SectionLabel {
  path: string;
  label: string;
}

/** 쪽마다 서버가 data- 속성으로 넘기는 설정 */
export interface SearchConfig {
  bundlePath: string;
  baseUrl: string;
  queryParam: string;
  anchorPages: string[];
  sections: SectionLabel[];
}

/** 결과 요약 글자 수(낱말 수). Pagefind 기본값과 같다. */
export const EXCERPT_LENGTH = 30;

/**
 * 용어사전 쪽의 가나다·ABC 색인 묶음 머리(h2#index-…)로 가는 주소인가 — 항목 결과로 고르지 않는다(2026-10-02 최종 전수 점검 3바퀴 ST3-02:
 * `uasyncio` → "U — 용어사전", `숫자` → "숫자·기호"로 이어 주어 학생이 엉뚱한 자리로 갔다). 묶음 id는 src/components/glossary/glossary.ts
 * glossaryGroupOf가 만든다(index-giyeok~index-hieut, index-a~index-z, index-etc — 브라우저 번들에 그 파일을 끌어오지 않게 규칙만 여기 둔다,
 * 단위 테스트가 둘을 맞춰 본다). 경로까지 보는 까닭: 같은 anchorPages의 오류 사전 IndexError 항목 id가 `index-error`다(/help/errors/#index-error).
 * 묶음 머리 글자는 색인에서도 뺐다(src/pages/glossary/index.astro data-pagefind-ignore) — 이 함수는 빌드 없이 지키는 안전망이다.
 */
export function isGlossaryGroupAnchor(url: string): boolean {
  const hashAt = url.indexOf('#');
  if (hashAt < 0) {
    return false;
  }
  const pathPart = url.slice(0, hashAt).split('?')[0] ?? '';
  return /(?:^|\/)glossary\/(?:index\.html)?$/u.test(pathPart) && url.slice(hashAt + 1).startsWith('index-');
}

/**
 * 항목 단위 페이지의 결과를 가장 잘 맞는 항목으로 바꾼다.
 * 제목이 검색어로 시작하는 항목(예: "픽셀" → "픽셀 Pixel")을 먼저 고르고, 없으면 검색어가 든 첫 항목, 그다음엔 항목 id에 검색어가 든 항목, 요약에 검색어가 <mark>로 맞은 첫 항목
 * (오류 사전: "NameError"는 제목이 한글 풀이라 제목으로는 못 찾고 항목 id(#name-error)나 요약의 맞은 낱말로 찾는다 — 전에는 엉뚱한 첫 항목 "오류 메시지 읽는 법"으로 이어졌다), 그것도 없으면 첫 항목.
 * 검색어에 "임계값 뜻"처럼 뜻 묻는 말투가 섞여 있으면 그 말은 빼고 본다(coreWords).
 * 용어사전의 색인 묶음 머리(isGlossaryGroupAnchor)는 항목으로 보지 않는다.
 * 항목이 없으면(제목 앞의 글에서만 맞음) 페이지 결과를 그대로 쓴다. 순수 함수라 단위 테스트가 검사한다.
 */
export function pickAnchoredResult(data: PagefindResultData, term: string): ResultView {
  const pageTitle = data.meta?.title?.trim() || data.url;
  const anchored = (data.sub_results ?? []).filter(
    (sub) => sub.url.includes('#') && sub.title.trim() !== '' && !isGlossaryGroupAnchor(sub.url),
  );
  if (anchored.length === 0) {
    return { title: pageTitle, url: data.url, excerpt: data.excerpt };
  }
  const words = coreWords(term);
  const needle = term.trim().toLowerCase();
  const titleOf = (sub: PagefindSubResult) => sub.title.trim().toLowerCase();
  const startsWith =
    anchored.find((sub) => titleOf(sub).startsWith(needle)) ?? anchored.find((sub) => words.some((word) => titleOf(sub).startsWith(word)));
  const includes =
    anchored.find((sub) => titleOf(sub).includes(needle)) ?? anchored.find((sub) => words.some((word) => titleOf(sub).includes(word)));
  const byId = anchored.find((sub) => words.some((word) => word.length >= MIN_PARTIAL_LENGTH && anchorKey(sub.url).includes(word)));
  const marked = anchored.find((sub) => {
    const pieces = markPieces(sub.excerpt);
    return words.some((word) => word.length >= MIN_PARTIAL_LENGTH && pieces.some((piece) => piece.startsWith(word)));
  });
  const chosen = startsWith ?? includes ?? byId ?? marked ?? anchored[0];
  return { title: `${chosen.title.trim()} — ${pageTitle}`, url: chosen.url, excerpt: chosen.excerpt };
}

// ---------------------------------------------------------------------------------------------------------------------
// 쪽 종류

/** 결과가 어떤 종류의 쪽인가 */
export type ResultKind = 'learn' | 'lab' | 'glossary' | 'error' | 'example' | 'teacher' | 'start' | 'help' | 'other';

/** 종류의 한국어 이름(칩·카드·목록에 보인다) */
export const KIND_LABEL: Readonly<Record<ResultKind, string>> = {
  learn: '차시',
  lab: '실습실',
  glossary: '용어사전',
  error: '오류',
  example: '예제',
  teacher: '교사용',
  start: '시작하기',
  help: '문제 해결',
  other: '안내',
};

/** 종류 → 아이콘 이름(search-icons.ts) */
export const KIND_ICON = {
  learn: 'book',
  lab: 'flask',
  glossary: 'glossary',
  error: 'alert',
  example: 'grid',
  teacher: 'teacher',
  start: 'flag',
  help: 'lifebuoy',
  other: 'list',
} as const satisfies Record<ResultKind, string>;

/** 검색 쪽에서 거를 수 있는 종류(칩 차례). 나머지(시작하기·문제 해결·안내)는 "전체"에만 보인다. */
export const FILTER_KINDS = ['learn', 'lab', 'glossary', 'error', 'example', 'teacher'] as const satisfies readonly ResultKind[];
export type FilterKind = (typeof FILTER_KINDS)[number];

export function isFilterKind(value: unknown): value is FilterKind {
  return typeof value === 'string' && (FILTER_KINDS as readonly string[]).includes(value);
}

/** 사이트 안 경로(base 없음, 예: /labs/gallery/)로 쪽 종류를 가린다. 순수 함수. */
export function kindOfPath(path: string | undefined): ResultKind {
  if (path === undefined) {
    return 'other';
  }
  if (path.startsWith('/glossary/')) {
    return 'glossary';
  }
  if (path.startsWith('/help/errors/')) {
    return 'error';
  }
  if (path.startsWith('/labs/gallery/')) {
    return 'example';
  }
  if (path.startsWith('/labs/')) {
    return 'lab';
  }
  if (path.startsWith('/teacher/') || path.startsWith('/start/teacher/')) {
    return 'teacher';
  }
  if (path.startsWith('/learn/')) {
    return 'learn';
  }
  if (path.startsWith('/start/')) {
    return 'start';
  }
  if (path.startsWith('/help/')) {
    return 'help';
  }
  return 'other';
}

// ---------------------------------------------------------------------------------------------------------------------
// 설정 읽기

function parseJsonList<T>(json: string | undefined, accept: (item: unknown) => item is T): T[] {
  if (!json) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter(accept) : [];
  } catch {
    return [];
  }
}

function isSectionLabel(item: unknown): item is SectionLabel {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as SectionLabel).path === 'string' &&
    typeof (item as SectionLabel).label === 'string'
  );
}

function isString(item: unknown): item is string {
  return typeof item === 'string';
}

export function parseSections(json: string | undefined): SectionLabel[] {
  return parseJsonList(json, isSectionLabel);
}

export function parseStringList(json: string | undefined): string[] {
  return parseJsonList(json, isString);
}

/** 요소의 data- 속성에서 설정을 읽는다. 요소가 없거나 속성이 빠지면 기본값. */
export function readSearchConfig(element: HTMLElement | null | undefined): SearchConfig {
  const data = element?.dataset ?? {};
  return {
    bundlePath: data.bundlePath ?? '/pagefind/',
    baseUrl: data.baseUrl ?? '/',
    queryParam: data.queryParam ?? 'q',
    anchorPages: parseStringList(data.anchorPages),
    sections: parseSections(data.sections),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Pagefind 불러오기

const loaders = new Map<string, Promise<PagefindApi>>();
const prefetched = new Set<string>();

/**
 * Pagefind가 차례로 받는 파일(pagefind.js → entry.json → pf_meta·wasm → 색인 → 조각)을 줄줄이 기다리지 않게, 이름을 이미 아는 파일을 미리 함께 받아 둔다
 * (판 1.3.0 검수 R1-023: 지연 1500ms에서 첫 검색이 파일 일곱 번 왕복에 12초 넘게 걸렸다). 받아 둔 파일은 브라우저 캐시에서 Pagefind가 그대로 쓴다.
 * - wasm(wasm.<언어>.pagefind, 언어 표시가 없으면 unknown)은 처음부터 알 수 있다.
 * - pf_meta(pagefind.<언어>_<해시>.pf_meta)는 pagefind-entry.json의 해시를 읽어 바로 받는다.
 * 이름 규칙이 달라지거나 받기가 실패해도 아무 일 없다 — Pagefind가 제 방식대로 받는다. 같은 폴더는 한 번만 한다.
 */
export function prefetchPagefindFiles(config: Pick<SearchConfig, 'bundlePath'>): void {
  const base = config.bundlePath;
  if (prefetched.has(base) || typeof fetch !== 'function') {
    return;
  }
  prefetched.add(base);
  const quiet = (name: string): Promise<Response | undefined> => fetch(`${base}${name}`).catch(() => undefined);
  void quiet('wasm.unknown.pagefind');
  void quiet('pagefind-entry.json')
    .then((response) => response?.json() as Promise<{ languages?: Record<string, { hash?: string; wasm?: string | null }> }> | undefined)
    .then((entry) => {
      for (const language of Object.values(entry?.languages ?? {})) {
        if (language.hash) {
          void quiet(`pagefind.${language.hash}.pf_meta`);
        }
        if (language.wasm) {
          void quiet(`wasm.${language.wasm}.pagefind`);
        }
      }
    })
    .catch(() => undefined);
}

/**
 * Pagefind를 한 번만 불러온다(같은 쪽의 자동 완성과 검색 화면이 함께 쓴다). 실패하면 비워서 다음에 다시 시도할 수 있다.
 * 개발 서버(npm run dev)에는 검색 색인(dist/pagefind/)이 없어 실패한다 — 빌드 뒤 미리 보기에서 확인한다.
 */
export function loadPagefind(config: Pick<SearchConfig, 'bundlePath' | 'baseUrl'>): Promise<PagefindApi> {
  const key = config.bundlePath;
  let promise = loaders.get(key);
  if (!promise) {
    prefetchPagefindFiles(config);
    promise = (async () => {
      const pagefind = (await import(/* @vite-ignore */ `${config.bundlePath}pagefind.js`)) as PagefindApi;
      await pagefind.options({ baseUrl: config.baseUrl, excerptLength: EXCERPT_LENGTH });
      await pagefind.init();
      return pagefind;
    })().catch((error: unknown) => {
      loaders.delete(key);
      throw error;
    });
    loaders.set(key, promise);
  }
  return promise;
}

// ---------------------------------------------------------------------------------------------------------------------
// 결과 모양 만들기

/** 결과 주소의 사이트 안 경로(base·#위치 제외). 예: /ai-physical-computing/glossary/#pixel → /glossary/ */
export function sitePathOf(resultUrl: string, baseUrl: string, origin = 'https://example.invalid'): string | undefined {
  let path: string;
  try {
    path = new URL(resultUrl, origin).pathname;
  } catch {
    return undefined;
  }
  return baseUrl !== '/' && path.startsWith(baseUrl) ? `/${path.slice(baseUrl.length)}` : path;
}

/** 결과 주소의 위 페이지 이름들. 예: /labs/esp32/check/ → "실습실 › ESP32 실습실" */
export function sectionTrail(path: string | undefined, sections: readonly SectionLabel[]): string {
  if (path === undefined) {
    return '';
  }
  return sections
    .filter((section) => section.path !== '/' && section.path !== path && path.startsWith(section.path))
    .sort((a, b) => a.path.length - b.path.length)
    .map((section) => section.label)
    .join(' › ');
}

/** 화면에 그릴 결과 한 건: 글(제목·주소·요약)에 종류와 위치를 붙인 것 */
export interface ResultCard extends ResultView {
  kind: ResultKind;
  /** 위 페이지 이름들("배우기 › I단원"). 없으면 빈 글 */
  trail: string;
}

/** Pagefind 결과 한 건을 화면에 그릴 모양으로 바꾼다. 항목 단위 쪽(anchorPages)은 가장 맞는 항목으로 이어 준다. */
export function toResultCard(data: PagefindResultData, term: string, config: SearchConfig, origin?: string): ResultCard {
  const path = sitePathOf(data.url, config.baseUrl, origin);
  const view: ResultView =
    path !== undefined && config.anchorPages.includes(path)
      ? pickAnchoredResult(data, term)
      : { title: data.meta?.title?.trim() || data.url, url: data.url, excerpt: data.excerpt };
  return { ...view, kind: kindOfPath(path), trail: sectionTrail(path, config.sections) };
}

// ---------------------------------------------------------------------------------------------------------------------
// 거르기·순서 (판 1.3.0 검수 R1-011~014 — 규칙은 search-rank.ts)

/** 검색어를 찾을 계획으로 바꾸는 함수(search-rank.ts)를 다시 내보낸다 — 화면 코드가 이 파일 하나만 불러도 되게 */
export { planSearch, type SearchPlan };

/**
 * 계획의 말들로 모두 찾아 결과를 하나로 합친다: 본 검색 결과가 앞, 같은 뜻 말로 찾은 결과가 뒤. 같은 쪽은 한 번만.
 * 색인은 한 번만 받는다(search는 같은 색인을 쓴다).
 */
export async function searchPlanned(pagefind: Pick<PagefindApi, 'search'>, terms: readonly string[]): Promise<PagefindResult[]> {
  const responses = await Promise.all(terms.map((term) => pagefind.search(term)));
  const seen = new Set<string>();
  const merged: PagefindResult[] = [];
  for (const response of responses) {
    for (const result of response.results) {
      if (!seen.has(result.id)) {
        seen.add(result.id);
        merged.push(result);
      }
    }
  }
  return merged;
}

/** 결과 한 건을 그리기 전에 살핀 것: 그릴 모양, 진짜 맞는 글인가, 앞에 둘 차례(낮을수록 앞) */
export interface EvaluatedResult {
  card: ResultCard;
  relevant: boolean;
  tier: number;
}

/** Pagefind가 낱말의 앞부분으로 물러서서 맞춘 글(요약에 맞은 낱말이 검색어를 거의 덮지 못함)인지 살피고, 앞에 둘 차례를 정한다. */
export function evaluateResult(data: PagefindResultData, plan: SearchPlan, config: SearchConfig, origin?: string): EvaluatedResult {
  const card = toResultCard(data, plan.terms.join(' '), config, origin);
  const pieces = [...markPieces(data.excerpt), ...(data.sub_results ?? []).flatMap((sub) => markPieces(sub.excerpt))];
  return { card, relevant: isRelevant(plan.terms, pieces), tier: tierOf(card, plan.terms, plan.display) };
}

/** 진짜 맞는 글만 남기고 차례(tier)대로 늘어 놓는다. 차례가 같으면 Pagefind가 준 순서를 지킨다(안정 정렬). */
export function orderEvaluated(list: readonly EvaluatedResult[]): ResultCard[] {
  return list
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.relevant)
    .sort((a, b) => a.item.tier - b.item.tier || a.index - b.index)
    .map(({ item }) => item.card);
}

/** Pagefind 요약(HTML)에서 글자와 <mark>만 골라 target에 붙인다. 다른 태그는 글자만 남긴다. */
export function appendExcerpt(target: HTMLElement, excerpt: string): void {
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
