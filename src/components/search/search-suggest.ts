/**
 * 검색칸 자동 완성(판 1.3.0 구역 B) — 머리글·홈·404의 검색 폼이 함께 쓴다. HeaderSearch.astro의 <script>가 bootSuggest()를 부른다.
 *
 * 폼에 data-suggest를 달면 켜진다(설정은 머리글 폼의 data-suggest-config 속성들에서 읽는다). 자바스크립트가 안 되면 아무 일도 없고
 * 폼은 그대로 /search/?q=검색어 로 간다(점진적 향상) — 그래서 combobox 역할도 이 스크립트가 붙인다.
 *
 * 동작(WAI-ARIA 1.2 combobox, 목록은 listbox/option)
 * - 쪽을 열 때는 아무것도 받지 않는다. 입력칸에 초점이 가면 Pagefind를 미리 받고(search-core.ts loadPagefind), 입력을 멈추고 200ms 뒤 결과 6개를 보인다.
 * - 비어 있을 때 초점을 주면 "많이 찾는 낱말" 칩을 보인다. 결과가 없으면 "찾지 못했어요" + 추천 칩.
 * - ↑↓ 로 고르고(aria-activedescendant — 초점은 입력칸에 그대로), 고른 뒤 Enter는 그 쪽으로 간다. 고르지 않은 Enter는 폼 제출(/search/?q=)이다.
 * - Esc는 목록을 닫고, 닫힌 채 한 번 더 누르면 입력을 비운다. 바깥을 누르거나 Tab으로 나가면 닫는다. 목록 항목은 Tab 정지점이 아니다(tabindex=-1).
 * - 낭독: 결과 개수("추천 6개가 있어요.")만 안 보이는 안내 줄(aria-live=polite)로 알린다. 입력마다 말하지 않고, 결과가 그려진 뒤에만 바꾼다.
 *   키 쓰는 법("위아래 화살표로 고르고 엔터")은 입력칸의 aria-describedby 설명으로 한 번만 읽힌다(R1-018).
 * - 거르기·순서: 낱말 앞부분에 우연히 걸린 엉뚱한 글은 빼고(검색어를 거의 덮지 못하는 글), 용어사전·오류 사전 항목을 앞에 둔다(search-rank.ts, R1-011~013).
 * - 자리: 목록은 입력칸 아래에 열리되 아래 자리가 모자라면(휴대폰 메뉴 맨 아래 검색칸) 위로 열고, 높이는 화면 안으로 제한해 안에서 스크롤한다.
 *   "전체 결과 보기" 줄은 목록 맨 아래에 붙어 늘 보인다(R1-015·016).
 * - 한글 조합 중(isComposing)의 화살표·Enter·Esc는 건드리지 않는다.
 *
 * 항목은 <a role="option" tabindex="-1"> 이다 — 링크이면서 option이라(ARIA in HTML이 허용) 가운데·오른쪽 단추나 Ctrl+클릭도 되고,
 * option 안에 따로 초점 받는 요소가 없어 nested-interactive 위반이 아니다.
 */
import { createSearchIcon, type SearchIconName } from './search-icons.ts';
import {
  KIND_ICON,
  KIND_LABEL,
  evaluateResult,
  loadPagefind,
  orderEvaluated,
  parseStringList,
  planSearch,
  prefetchPagefindFiles,
  readSearchConfig,
  searchPlanned,
  type ResultCard,
  type SearchConfig,
} from './search-core.ts';
import { didYouMean, normalizeVocabulary, restoreCase } from './search-hint.ts';

/** 목록에 보이는 결과 수 */
export const MAX_ITEMS = 6;
/** 걸러 내고 순서를 바로잡으려고 내용을 받아 보는 결과 수(목록에는 MAX_ITEMS개만 보인다) */
export const RANK_WINDOW = 10;
/** 목록과 입력칸 사이 간격(px). --space-2와 같다 */
const PANEL_GAP = 8;
/** 화면 가장자리에 남길 여유(px) */
const PANEL_MARGIN = 12;
/** 아래 자리가 이보다 좁고 위가 더 넓으면 목록을 위로 연다(px) */
const MIN_ROOM_BELOW = 220;
/** 목록 높이의 아래 한도(px): 이보다 작게는 줄이지 않는다 */
const MIN_PANEL_HEIGHT = 120;
/** 입력을 멈추고 이만큼 기다린 뒤 찾는다(밀리초) */
export const INPUT_DELAY_MS = 200;
/** 찾는 글 길이 한도(아주 긴 붙여넣기가 색인 검색을 느리게 하지 않게) */
const MAX_TERM_LENGTH = 80;
/** 추천 칩 수(결과 없음) */
const EMPTY_CHIPS = 5;

export interface SuggestShared {
  config: SearchConfig;
  /** 많이 찾는 낱말(서버가 data-popular로 넘김) */
  popular: string[];
  /** 고른 항목으로 가는 방법(시험에서 바꿔 끼운다). 기본은 주소 이동 */
  navigate?: (href: string) => void;
}

/** 입력칸 글에서 찾을 낱말을 뽑는다: 앞뒤 공백을 떼고 너무 길면 자른다. */
export function normalizeTerm(raw: string): string {
  return raw.trim().replace(/\s+/gu, ' ').slice(0, MAX_TERM_LENGTH);
}

/** 키 쓰는 법: 입력칸의 aria-describedby로 이어 한 번만 읽히게 한다(상태 줄에 되풀이하지 않는다) */
export const KEY_HINT = '위아래 화살표로 고르고 엔터를 눌러요.';

/**
 * 결과 개수 안내 글(상태 줄): 타이핑마다 읽히므로 짧게 "추천 N개"만 알린다. "전체 보기" 줄은 개수에 세지 않는다(그 줄은 이름과 개수를 스스로 말한다).
 * total은 0인지 가르는 데만 쓴다(전과 같은 호출 모양을 지키려고 남겼다).
 */
export function describeSuggestCount(term: string, shown: number, total = shown): string {
  if (total === 0 || shown === 0) {
    return `"${term}"에 맞는 글을 찾지 못했어요. 추천 낱말이 있어요.`;
  }
  return `추천 ${shown}개가 있어요.`;
}

/**
 * 목록의 둘째 줄("위치")에 쓸 글: 종류 이름 + 위 페이지 이름들. 예: "차시 · 배우기 › II. 피지컬 컴퓨팅", "용어사전", "예제 · 실습실".
 * 위 페이지 이름에 종류 이름이 이미 들어 있으면("실습실 › ESP32 실습실") 종류는 되풀이하지 않는다.
 */
export function suggestWhere(card: Pick<ResultCard, 'kind' | 'trail'>): string {
  const kind = KIND_LABEL[card.kind];
  if (!card.trail) {
    return kind;
  }
  return card.trail.includes(kind) ? card.trail : `${kind} · ${card.trail}`;
}

let counter = 0;

export function attachSuggest(form: HTMLFormElement, shared: SuggestShared): void {
  const input = form.querySelector<HTMLInputElement>('input[type="search"]');
  if (!input || form.dataset.suggestReady === 'true') {
    return;
  }
  form.dataset.suggestReady = 'true';
  const { config, popular } = shared;
  const popularVocabulary = normalizeVocabulary(popular);
  const navigate = shared.navigate ?? ((href: string) => window.location.assign(href));

  counter += 1;
  const base = `${input.id || 'suggest'}-${counter}`;
  const listId = `${base}-listbox`;

  const panel = document.createElement('div');
  panel.className = 'suggest';
  panel.hidden = true;
  const note = document.createElement('p');
  note.className = 'suggest__note';
  note.hidden = true;
  const list = document.createElement('div');
  list.className = 'suggest__list';
  list.id = listId;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', '검색 추천');
  panel.append(note, list);
  const live = document.createElement('div');
  live.className = 'visually-hidden';
  // role=status로 하지 않는다: 검색 쪽·404의 안내 줄(role=status)과 이름 없는 상태 줄이 한 쪽에 여럿이 되지 않게 aria-live만 단다.
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  // 키 쓰는 법은 입력칸 설명으로 둔다(보이지 않는 글). 이미 설명이 달려 있으면 뒤에 잇는다.
  const hint = document.createElement('span');
  hint.className = 'visually-hidden';
  hint.id = `${base}-hint`;
  hint.textContent = KEY_HINT;
  form.append(panel, live, hint);

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-haspopup', 'listbox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', listId);
  input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), hint.id].filter(Boolean).join(' '));

  let options: HTMLAnchorElement[] = [];
  let active = -1;
  let timer: number | undefined;
  /** 늦게 도착한 옛 결과를 버리기 위한 번호 */
  let generation = 0;
  /** 지금 목록이 어떤 낱말의 결과인가(같은 낱말이면 다시 찾지 않는다). 비어 있으면 "많이 찾는 낱말" 목록 */
  let shownTerm: string | undefined;
  /** 입력이 바뀌어 새 결과를 기다리는 중인가. 기다리는 동안 목록은 묵은 것이라 화살표로 고르지 못하게 한다(고른 줄이 곧 바뀌어 엉뚱한 곳으로 가지 않게). */
  let pending = false;

  const searchHref = (term: string): string => {
    const url = new URL(form.action, window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set(config.queryParam, term);
    return `${url.pathname}${url.search}`;
  };

  const setActive = (index: number) => {
    options[active]?.setAttribute('aria-selected', 'false');
    active = index;
    const option = options[index];
    if (option) {
      option.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', option.id);
      // 목록 안에서 스크롤되는 높이일 때 고른 줄이 보이게 한다
      if (typeof option.scrollIntoView === 'function') {
        option.scrollIntoView({ block: 'nearest' });
      }
    } else {
      active = -1;
      input.removeAttribute('aria-activedescendant');
    }
  };

  /**
   * 목록의 자리와 높이를 화면에 맞춘다. 입력칸 아래 자리가 모자라고 위가 더 넓으면 위로 열고(휴대폰 메뉴 맨 아래 검색칸),
   * 높이는 남는 자리 안으로 제한해 안에서 스크롤하게 한다(200% 확대처럼 화면이 낮을 때 "전체 결과 보기" 줄이 접히지 않게).
   */
  const place = () => {
    if (panel.hidden) {
      return;
    }
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const rect = form.getBoundingClientRect();
    const below = viewportHeight - rect.bottom - PANEL_GAP - PANEL_MARGIN;
    const above = rect.top - PANEL_GAP - PANEL_MARGIN;
    const opensUp = below < MIN_ROOM_BELOW && above > below;
    panel.classList.toggle('suggest--up', opensUp);
    panel.style.maxHeight = `${Math.max(MIN_PANEL_HEIGHT, Math.floor(opensUp ? above : below))}px`;
  };

  let placementListening = false;
  const listenPlacement = (on: boolean) => {
    if (on === placementListening) {
      return;
    }
    placementListening = on;
    if (on) {
      window.addEventListener('resize', place);
      window.addEventListener('scroll', place, { passive: true });
    } else {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place);
    }
  };

  const show = () => {
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    place();
    listenPlacement(true);
  };

  const hide = () => {
    pending = false;
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    listenPlacement(false);
    setActive(-1);
  };

  const announce = (text: string) => {
    live.textContent = text;
  };

  const makeOption = (iconName: SearchIconName, className: string): HTMLAnchorElement => {
    const link = document.createElement('a');
    link.id = `${base}-o${options.length + 1}`;
    link.className = `suggest__option ${className}`;
    link.tabIndex = -1;
    link.setAttribute('role', 'option');
    link.setAttribute('aria-selected', 'false');
    link.append(createSearchIcon(iconName));
    return link;
  };

  const heading = (text: string): HTMLSpanElement => {
    const span = document.createElement('span');
    span.className = 'suggest__heading';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = text;
    return span;
  };

  const chipOptions = (words: readonly string[]): HTMLAnchorElement[] =>
    words.map((word) => {
      const link = makeOption('search', 'suggest__chip');
      link.href = searchHref(word);
      link.append(word);
      options.push(link);
      return link;
    });

  const makeGroup = (label: string, children: readonly Node[]): HTMLDivElement => {
    const group = document.createElement('div');
    group.className = 'suggest__group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    group.append(heading(label), ...children);
    return group;
  };

  /** 마지막 줄: 검색 쪽에서 전체 결과 보기 */
  const fullSearchOption = (term: string, total: number | undefined): HTMLAnchorElement => {
    const link = makeOption('search', 'suggest__option--all');
    link.href = searchHref(term);
    const label = document.createElement('span');
    label.className = 'suggest__title';
    label.textContent = `"${term}" 전체 검색 결과 보기`;
    link.append(label);
    if (total !== undefined && total > 0) {
      const count = document.createElement('span');
      count.className = 'suggest__count';
      count.textContent = ` 총 ${total}건`;
      link.append(count);
    }
    options.push(link);
    return link;
  };

  /** 목록을 비운다. 빈 listbox는 "option이 있어야 한다"는 규칙에 걸리므로 채울 때까지 숨겨 둔다. */
  const resetList = () => {
    options = [];
    setActive(-1);
    list.replaceChildren();
    list.hidden = true;
  };

  const showPopular = () => {
    pending = false;
    shownTerm = undefined;
    resetList();
    note.hidden = true;
    if (popular.length === 0) {
      hide();
      return;
    }
    list.append(makeGroup('많이 찾는 낱말', chipOptions(popular)));
    list.hidden = false;
    announce('');
    show();
  };

  /** total이 undefined이면 전체 개수를 알 수 없다(걸러 낸 글이 있어 Pagefind의 개수가 맞지 않음) — 개수를 보이지 않는다 */
  const showResults = (term: string, cards: readonly ResultCard[], total: number | undefined) => {
    pending = false;
    shownTerm = term;
    resetList();
    note.hidden = true;
    if (cards.length === 0) {
      const message = '찾지 못했어요 — 이런 낱말은 어때요?';
      // 오타 같으면 가장 가까운 추천 낱말을 맨 앞에 둔다(예: 임게값 → 임계값)
      const guess = didYouMean(term, popularVocabulary);
      const suggested = guess === undefined ? undefined : restoreCase(guess, popular);
      const words = [...(suggested === undefined ? [] : [suggested]), ...popular.filter((word) => word !== term && word !== suggested)].slice(
        0,
        EMPTY_CHIPS,
      );
      list.append(makeGroup(message, chipOptions(words)));
      list.append(fullSearchOption(term, undefined));
    } else {
      for (const card of cards) {
        const link = makeOption(KIND_ICON[card.kind], 'suggest__item');
        link.href = card.url;
        const text = document.createElement('span');
        text.className = 'suggest__text';
        const title = document.createElement('span');
        title.className = 'suggest__title';
        title.textContent = card.title;
        const where = document.createElement('span');
        where.className = 'suggest__where';
        where.textContent = suggestWhere(card);
        // 이름이 "제목위치"로 붙지 않게 두 줄 사이에 글자 공백을 둔다
        text.append(title, ' ', where);
        link.append(text);
        options.push(link);
        list.append(link);
      }
      list.append(fullSearchOption(term, total));
    }
    list.hidden = false;
    announce(describeSuggestCount(term, cards.length, cards.length === 0 ? 0 : (total ?? cards.length)));
    show();
  };

  /** 찾는 도구를 못 받았을 때(오프라인·개발 서버): 전체 검색으로 가는 줄만 보인다. 폼 제출은 그대로 된다. */
  const showFallback = (term: string) => {
    pending = false;
    shownTerm = term;
    resetList();
    note.hidden = true;
    list.append(fullSearchOption(term, undefined));
    list.hidden = false;
    announce('');
    show();
  };

  const run = async (term: string, mine: number) => {
    if (panel.hidden) {
      // 닫혀 있던 목록의 묵은 내용은 지우고 시작한다
      shownTerm = undefined;
      resetList();
    }
    if (list.childElementCount === 0) {
      note.textContent = '찾는 중이에요…';
      note.hidden = false;
      show();
    }
    try {
      const pagefind = await loadPagefind(config);
      const plan = planSearch(term);
      const results = plan ? await searchPlanned(pagefind, plan.terms) : [];
      if (mine !== generation) {
        return;
      }
      // 앞에서 RANK_WINDOW개의 내용을 받아 엉뚱하게 걸린 글을 빼고 순서를 바로잡은 뒤 MAX_ITEMS개를 보인다
      const windowResults = results.slice(0, RANK_WINDOW);
      const dataList = plan ? await Promise.all(windowResults.map((result) => result.data())) : [];
      if (mine !== generation) {
        return;
      }
      const ordered = plan ? orderEvaluated(dataList.map((data) => evaluateResult(data, plan, config, window.location.origin))) : [];
      const dropped = dataList.length - ordered.length;
      // 처음 묶음이 모두 걸러지면 나머지도 엉뚱한 글이라고 본다. 걸러 낸 글이 있으면 전체 개수는 알 수 없어 보이지 않는다.
      showResults(term, ordered.slice(0, MAX_ITEMS), dropped > 0 ? undefined : results.length);
    } catch {
      if (mine === generation) {
        showFallback(term);
      }
    }
  };

  /** 입력칸 글에 맞게 목록을 새로 그린다. immediate면 기다리지 않는다(초점·화살표로 열 때). */
  const refresh = (immediate: boolean) => {
    window.clearTimeout(timer);
    generation += 1;
    const mine = generation;
    const term = normalizeTerm(input.value);
    if (term === '') {
      showPopular();
      return;
    }
    if (term === shownTerm && options.length > 0) {
      pending = false;
      note.hidden = true;
      show();
      return;
    }
    pending = true;
    if (shownTerm === undefined) {
      // 많이 찾는 낱말 칩은 입력을 시작하면 소용이 없다 — 곧바로 치우고 결과를 기다린다
      resetList();
      note.textContent = '찾는 중이에요…';
      note.hidden = false;
      show();
    }
    if (immediate) {
      void run(term, mine);
    } else {
      timer = window.setTimeout(() => {
        void run(term, mine);
      }, INPUT_DELAY_MS);
    }
  };

  input.addEventListener('focus', () => {
    // 초점이 가면 검색 도구를 미리 받는다(쪽을 열 때는 받지 않는다). 실패하면 찾을 때 다시 시도한다.
    loadPagefind(config).catch(() => undefined);
    refresh(true);
  });

  // 마우스를 올리면 이름을 아는 검색 파일(wasm·메타)을 미리 받기 시작한다: 입력 직후 첫 검색이 파일을 줄줄이 기다리지 않게(R1-023)
  form.addEventListener(
    'pointerenter',
    () => {
      prefetchPagefindFiles(config);
    },
    { once: true },
  );

  input.addEventListener('click', () => {
    if (panel.hidden) {
      refresh(true);
    }
  });

  input.addEventListener('input', () => {
    setActive(-1);
    refresh(false);
  });

  input.addEventListener('keydown', (event) => {
    // 한글 조합 중에는 isComposing이 true이고, 일부 브라우저는 조합 끝 키를 'Process'로 알린다
    if (event.isComposing || event.key === 'Process') {
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (panel.hidden) {
          refresh(true);
          return;
        }
        if (pending || options.length === 0) {
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        // 입력칸(-1)에서 한 칸 위로 가면 맨 끝으로, 맨 끝에서 한 칸 아래로 가면 입력칸으로 돌아온다.
        const next = active + step;
        if (next < -1) {
          setActive(options.length - 1);
        } else if (next >= options.length) {
          setActive(-1);
        } else {
          setActive(next);
        }
        break;
      }
      case 'Enter': {
        const option = options[active];
        if (!panel.hidden && option) {
          event.preventDefault();
          navigate(option.href);
        } else if (normalizeTerm(input.value) === '') {
          // 아무것도 쓰지 않고 누른 Enter는 빈 검색 쪽을 열 뿐이라 막는다: 입력칸에 초점을 두어 바로 쓸 수 있게 한다(R1-019)
          event.preventDefault();
        }
        break;
      }
      case 'Escape': {
        if (!panel.hidden) {
          event.preventDefault();
          event.stopPropagation();
          window.clearTimeout(timer);
          generation += 1;
          hide();
        } else if (input.value !== '') {
          event.preventDefault();
          event.stopPropagation();
          input.value = '';
          shownTerm = undefined;
        }
        break;
      }
      case 'Tab': {
        hide();
        break;
      }
      default:
        break;
    }
  });

  // 목록을 누르는 동안에도 초점은 입력칸에 둔다(초점이 옮겨 가 목록이 닫히지 않게).
  panel.addEventListener('mousedown', (event) => {
    event.preventDefault();
  });

  form.addEventListener('focusout', (event) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !form.contains(next)) {
      window.clearTimeout(timer);
      generation += 1;
      hide();
    }
  });

  document.addEventListener('pointerdown', (event) => {
    if (!panel.hidden && event.target instanceof Node && !form.contains(event.target)) {
      hide();
    }
  });

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      hide();
    }
  });
}

/** 쪽의 data-suggest 폼을 모두 켠다. 설정은 data-suggest-config가 달린 요소(머리글 검색 폼)에서 읽는다. */
export function bootSuggest(root: ParentNode = document): void {
  const forms = root.querySelectorAll<HTMLFormElement>('form[data-suggest]');
  if (forms.length === 0) {
    return;
  }
  const configElement = root.querySelector<HTMLElement>('[data-suggest-config]');
  const shared: SuggestShared = {
    config: readSearchConfig(configElement),
    popular: parseStringList(configElement?.dataset.popular),
  };
  forms.forEach((form) => {
    attachSuggest(form, shared);
  });
}
