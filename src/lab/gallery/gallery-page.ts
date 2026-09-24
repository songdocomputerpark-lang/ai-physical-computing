/**
 * 예제 갤러리 화면 논리(P4-11) — 카드를 **고르고 찾는** 부분만 맡는다.
 *
 * 카드는 빌드 때 이미 HTML로 다 그려져 있다(자바스크립트가 없어도 전부 보인다). 이 코드가 하는 일은
 * ① 거르기 단추·찾기 칸을 읽어 `matchesFilter`(filters.ts — 빌드와 같은 함수)로 카드를 보이거나 숨기고,
 * ② 몇 개가 보이는지 알리고(화면 낭독기도 듣도록 aria-live),
 * ③ 고른 것을 주소에 실어(?unit=2&comm=ble) 링크로 나눌 수 있게 하고,
 * ④ "비교해 보기"로 건너뛸 카드가 거르기에 걸려 숨어 있으면 거르기를 먼저 푼다.
 *
 * 카드 값은 카드 요소의 `data-*`에만 있다(같은 값을 JSON으로 한 번 더 싣지 않는다 — 목록이 길어져도 받는 양이 늘지 않게).
 * 화면을 건드리는 것은 카드의 `hidden` 속성뿐이라, 예제가 수백 개가 되어도 거르기 한 번은 속성 바꾸기 몇 번으로 끝난다.
 */
import {
  EMPTY_FILTER,
  FILTER_PARAMS,
  filterQueryString,
  filterStateFromQuery,
  hasAnyFilter,
  matchesFilter,
  type FilterableCard,
  type GalleryFilterState,
} from './filters.ts';

interface CardEntry extends FilterableCard {
  readonly element: HTMLElement;
}

function numberOrNull(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(' ')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function readCard(element: HTMLElement): CardEntry {
  const virtual = element.dataset.virtual;
  return {
    element,
    lab: element.dataset.lab ?? '',
    unit: numberOrNull(element.dataset.unit),
    difficulty: numberOrNull(element.dataset.difficulty),
    virtualOk: virtual === undefined || virtual === '' ? null : virtual === 'yes',
    comm: list(element.dataset.comm),
    parts: list(element.dataset.parts),
    keywords: element.dataset.keywords ?? '',
  };
}

/** 거르기 단추(체크박스)에서 지금 고른 값을 읽는다. */
function readControls(root: HTMLElement): GalleryFilterState {
  const checked = (key: string): string[] =>
    [...root.querySelectorAll<HTMLInputElement>(`input[data-gallery-filter="${key}"]`)]
      .filter((input) => input.checked)
      .map((input) => input.value);
  const search = root.querySelector<HTMLInputElement>('[data-gallery-search]');
  const virtual = root.querySelector<HTMLInputElement>('[data-gallery-virtual]');
  return {
    lab: checked('lab'),
    unit: checked('unit').map(Number).filter(Number.isInteger),
    comm: checked('comm'),
    parts: checked('parts'),
    difficulty: checked('difficulty').map(Number).filter(Number.isInteger),
    virtualOnly: virtual?.checked === true,
    query: search?.value ?? '',
  };
}

/** 주소에서 읽은 거르기를 단추·입력칸에 반영한다. */
function writeControls(root: HTMLElement, state: GalleryFilterState): void {
  const values: Record<string, string[]> = {
    lab: [...state.lab],
    unit: state.unit.map(String),
    comm: [...state.comm],
    parts: [...state.parts],
    difficulty: state.difficulty.map(String),
  };
  for (const input of root.querySelectorAll<HTMLInputElement>('input[data-gallery-filter]')) {
    const key = input.dataset.galleryFilter ?? '';
    input.checked = (values[key] ?? []).includes(input.value);
  }
  const search = root.querySelector<HTMLInputElement>('[data-gallery-search]');
  if (search) {
    search.value = state.query;
  }
  const virtual = root.querySelector<HTMLInputElement>('[data-gallery-virtual]');
  if (virtual) {
    virtual.checked = state.virtualOnly;
  }
}

function clearControls(root: HTMLElement): void {
  writeControls(root, EMPTY_FILTER);
}

export interface GalleryController {
  /** 지금 보이는 카드 수 */
  readonly visible: number;
  apply(): void;
  reset(): void;
}

/** 갤러리 화면을 움직이게 한다. `[data-gallery]`가 없으면 아무 일도 하지 않는다(null). */
export function mountGallery(root: HTMLElement | null): GalleryController | null {
  if (!root) {
    return null;
  }
  const cards = [...root.querySelectorAll<HTMLElement>('[data-gallery-card]')].map(readCard);
  const sections = [...root.querySelectorAll<HTMLElement>('[data-gallery-section]')];
  const countText = root.querySelector<HTMLElement>('[data-gallery-count]');
  const emptyBox = root.querySelector<HTMLElement>('[data-gallery-empty]');
  const resetButtons = [...root.querySelectorAll<HTMLElement>('[data-gallery-reset]')];
  const partIds = [...new Set(cards.flatMap((card) => card.parts))];
  let visible = cards.length;

  const render = (state: GalleryFilterState): void => {
    visible = 0;
    for (const card of cards) {
      const show = matchesFilter(card, state);
      card.element.hidden = !show;
      if (show) {
        visible += 1;
      }
    }
    for (const section of sections) {
      const shown = section.querySelectorAll('[data-gallery-card]:not([hidden])').length;
      section.hidden = shown === 0;
      const badge = section.querySelector<HTMLElement>('[data-gallery-section-count]');
      if (badge) {
        badge.textContent = `${shown}개`;
      }
    }
    const filtering = hasAnyFilter(state);
    if (countText) {
      countText.textContent = filtering ? `예제 ${visible}개를 골랐어요(전체 ${cards.length}개).` : `예제 ${cards.length}개가 모두 보여요.`;
    }
    if (emptyBox) {
      emptyBox.hidden = visible > 0;
    }
    for (const button of resetButtons) {
      button.hidden = !filtering;
    }
    root.dataset.galleryVisible = String(visible);
    root.dataset.galleryFiltered = filtering ? 'yes' : 'no';
  };

  const syncUrl = (state: GalleryFilterState): void => {
    const query = filterQueryString(state);
    const url = `${window.location.pathname}${query === '' ? '' : `?${query}`}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', url);
  };

  const apply = (): void => {
    const state = readControls(root);
    render(state);
    syncUrl(state);
  };

  const reset = (): void => {
    clearControls(root);
    apply();
    root.querySelector<HTMLInputElement>('[data-gallery-search]')?.focus();
  };

  root.addEventListener('change', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.matches('input[data-gallery-filter], [data-gallery-virtual]')) {
      apply();
    }
  });
  root.addEventListener('input', (event) => {
    if ((event.target as HTMLElement | null)?.matches('[data-gallery-search]')) {
      apply();
    }
  });
  for (const button of resetButtons) {
    button.addEventListener('click', reset);
  }
  // 찾기 칸에서 Enter를 눌러도 페이지가 다시 열리지 않게 한다(거르기는 이미 글자를 칠 때마다 된다).
  root.querySelector('[data-gallery-search-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    apply();
  });
  // "비교해 보기"로 건너뛸 카드가 거르기에 걸려 숨어 있으면 거르기를 먼저 푼다(빈 화면으로 건너뛰지 않게).
  root.addEventListener('click', (event) => {
    const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[data-gallery-jump]');
    if (!link) {
      return;
    }
    const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (target?.closest<HTMLElement>('[data-gallery-card]')?.hidden) {
      reset();
    }
  });

  root.dataset.galleryTotal = String(cards.length);
  const initial = filterStateFromQuery(window.location.search, partIds);
  writeControls(root, initial);
  render(initial);
  root.dataset.galleryReady = 'yes';

  return {
    get visible() {
      return visible;
    },
    apply,
    reset,
  };
}

/** 주소 이름(테스트·문서에서 참고) */
export { FILTER_PARAMS };
