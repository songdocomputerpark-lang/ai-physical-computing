/**
 * 옆으로(또는 아래로) 넘치는 칸을 키보드로도 밀어 볼 수 있게 한다 — 넘치는 동안만 Tab 차례에 넣는다(WCAG 2.1.1 키보드).
 *
 * 왜: 글 읽기(.prose)의 표는 좁은 화면에서 "표만 옆으로 밀어 보는 칸"이 된다(src/styles/global.css). 마우스·손가락은 밀 수 있지만
 * 키보드만 쓰는 학생은 그 칸에 초점을 줄 수 없어 오른쪽 열을 볼 방법이 없었다(2026-09-26 Phase 6 접근성 점검 — axe
 * scrollable-region-focusable, 휴대폰 폭 차시·교사용 자료실 10쪽). 가상 보드 그림 칸([그림 크게 보기]·휴대폰)·기록 칸도 같다.
 * 넘칠 때만 tabindex="0"을 붙여서, 넘치지 않는 넓은 화면에서는 Tab 차례가 늘지 않는다. 초점을 받은 칸은 방향키로 밀린다(브라우저 기본).
 *
 * 대상
 * - `.prose table`: 표는 역할을 바꾸지 않는다(초점을 받아도 표로 읽힌다).
 * - `[data-scroll-focus="칸 이름"]`: 넘치는 동안 이름(aria-label)도 붙인다. 역할이 없는 칸(div·pre·span)은 role="region"도 붙여 이름이 읽히게 하고,
 *   목록·표처럼 제 역할이 있거나 role이 이미 있는 칸(role="log" 등)은 역할을 그대로 둔다. 이름이 이미 있으면(aria-label·aria-labelledby) 두고 쓴다.
 * 처음부터 tabindex가 있는 요소(차시 코드 칸·실습실 콘솔 등)는 건드리지 않는다. 판단은 DOM 없이 도는 순수 함수(`planScrollFocus`)이고,
 * 브라우저 동작(좁은 화면에서 넘치는 표만 초점을 받음·넓히면 뗌)은 tests/e2e/a11y-keyboard.spec.ts가 본다.
 *
 * 쓰는 곳: BaseLayout.astro의 스크립트가 모든 쪽에서 한 번 부른다. 새 스크롤 칸은 마크업에 data-scroll-focus="이름"만 붙인다.
 */

/** 이 도구가 붙인 것(뗄 때 이것만 뗀다): 공백으로 이은 'tabindex'·'role'·'label' */
const ADDED_ATTRIBUTE = 'data-scroll-focus-added';
const TABLE_SELECTOR = '.prose table';
const MARKED_SELECTOR = '[data-scroll-focus]';
/** 역할이 없어 role="region"을 붙여야 이름이 읽히는 태그 */
const GENERIC_TAGS: ReadonlySet<string> = new Set(['DIV', 'PRE', 'SPAN', 'P']);
/** 제 역할이 있어 이름(aria-label)만 붙이면 되는 태그 */
const NAMEABLE_TAGS: ReadonlySet<string> = new Set(['UL', 'OL', 'TABLE', 'SECTION']);

/** 크기 비교에 쓰는 값 */
export interface ScrollBox {
  readonly scrollWidth: number;
  readonly clientWidth: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

/** 칸이 넘쳐서 밀어 볼 것이 있는지(가로·세로). 브라우저가 반올림해 생기는 1px 차이는 넘친 것으로 보지 않는다 */
export function needsScrollFocus(box: ScrollBox): boolean {
  return box.scrollWidth - box.clientWidth > 1 || box.scrollHeight - box.clientHeight > 1;
}

/** 칸 하나의 지금 모습(순수 함수 입력) */
export interface ScrollFocusState {
  readonly tagName: string;
  readonly overflowing: boolean;
  /** 이 도구가 전에 붙인 것 */
  readonly added: readonly ('tabindex' | 'role' | 'label')[];
  readonly hasTabindex: boolean;
  readonly hasRole: boolean;
  readonly hasName: boolean;
  /** data-scroll-focus 값(표시한 칸의 이름) */
  readonly name?: string;
}

/** 할 일: 붙일 것·뗄 것 */
export interface ScrollFocusPlan {
  readonly add: readonly ('tabindex' | 'role' | 'label')[];
  readonly remove: readonly ('tabindex' | 'role' | 'label')[];
}

/** 지금 모습 → 붙이거나 뗄 것(순수 함수) */
export function planScrollFocus(state: ScrollFocusState): ScrollFocusPlan {
  const tag = state.tagName.toUpperCase();
  if (state.added.length === 0 && state.hasTabindex) {
    return { add: [], remove: [] }; // 처음부터 초점을 받는 칸
  }
  if (!state.overflowing) {
    return { add: [], remove: [...state.added] };
  }
  if (state.added.length > 0) {
    return { add: [], remove: [] }; // 이미 붙였다
  }
  const add: ('tabindex' | 'role' | 'label')[] = ['tabindex'];
  const name = state.name?.trim();
  if (name && !state.hasName) {
    if (!state.hasRole && GENERIC_TAGS.has(tag)) {
      add.push('role', 'label');
    } else if (state.hasRole || NAMEABLE_TAGS.has(tag)) {
      add.push('label');
    }
  }
  return { add, remove: [] };
}

/** 요소 하나를 지금 크기에 맞춘다 */
export function syncScrollFocus(element: HTMLElement): void {
  const added = (element.getAttribute(ADDED_ATTRIBUTE) ?? '').split(/\s+/u).filter(Boolean) as ('tabindex' | 'role' | 'label')[];
  const plan = planScrollFocus({
    tagName: element.tagName,
    overflowing: needsScrollFocus(element),
    added,
    hasTabindex: element.hasAttribute('tabindex'),
    hasRole: element.hasAttribute('role'),
    hasName: element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby'),
    name: element.dataset.scrollFocus,
  });
  if (plan.add.length === 0 && plan.remove.length === 0) {
    return;
  }
  for (const item of plan.remove) {
    element.removeAttribute(item === 'label' ? 'aria-label' : item);
  }
  for (const item of plan.add) {
    if (item === 'tabindex') {
      element.tabIndex = 0;
    } else if (item === 'role') {
      element.setAttribute('role', 'region');
    } else {
      element.setAttribute('aria-label', element.dataset.scrollFocus?.trim() ?? '');
    }
  }
  const now = plan.remove.length > 0 ? [] : [...added, ...plan.add];
  if (now.length > 0) {
    element.setAttribute(ADDED_ATTRIBUTE, now.join(' '));
  } else {
    element.removeAttribute(ADDED_ATTRIBUTE);
  }
}

let installed = false;

/** 쪽의 표·표시한 칸을 지켜본다(여러 번 불러도 한 번만). 칸의 크기나 안의 내용이 바뀌면 다시 잰다 */
export function installScrollFocus(doc: Document = document): void {
  if (installed || typeof ResizeObserver === 'undefined' || typeof MutationObserver === 'undefined') {
    return;
  }
  installed = true;
  const selector = `${TABLE_SELECTOR}, ${MARKED_SELECTOR}`;
  const resize = new ResizeObserver((entries) => {
    for (const entry of entries) {
      // 표시한 칸의 안쪽 요소(가상 보드 그림 SVG·기록 줄)가 커져도 그 칸을 다시 잰다.
      const target = entry.target.closest<HTMLElement>(selector);
      if (target) {
        syncScrollFocus(target);
      }
    }
  });
  // 표시한 칸은 안의 그림·줄이 바뀌어도(그림을 새로 그리거나 [그림 크게 보기]로 넓힐 때, 기록이 쌓일 때) 칸 크기는 그대로라 안쪽도 지켜본다.
  const watchChildren = (element: Element) => {
    for (const child of element.children) {
      resize.observe(child);
    }
  };
  // 기록 칸은 줄이 초당 여러 번 늘 수 있어, 바뀐 칸을 모아 화면 그리기 한 번에 한 번만 잰다(크기를 읽으면 배치를 다시 계산하므로).
  const touched = new Set<HTMLElement>();
  let frame: number | null = null;
  const flush = () => {
    frame = null;
    for (const target of touched) {
      watchChildren(target);
      syncScrollFocus(target);
    }
    touched.clear();
  };
  const inner = new MutationObserver((records) => {
    for (const record of records) {
      const node = record.target instanceof Element ? record.target : record.target.parentElement;
      const target = node?.closest<HTMLElement>(MARKED_SELECTOR);
      if (target) {
        touched.add(target);
      }
    }
    if (touched.size > 0 && frame === null) {
      frame = requestAnimationFrame(flush);
    }
  });
  const registered = new WeakSet<Element>();
  const register = (element: HTMLElement) => {
    if (registered.has(element)) {
      return;
    }
    registered.add(element);
    resize.observe(element);
    if (element.matches(MARKED_SELECTOR)) {
      watchChildren(element);
      inner.observe(element, { childList: true, characterData: true, subtree: true });
    }
    syncScrollFocus(element);
  };
  const scan = (root: Element | Document) => {
    if (root instanceof HTMLElement && root.matches(selector)) {
      register(root);
    }
    for (const element of root.querySelectorAll<HTMLElement>(selector)) {
      register(element);
    }
  };
  scan(doc);
  // 나중에 스크립트가 만드는 칸(대시보드 위젯 기록·점검 도우미 출력·실습실 모듈 패널)도 생기는 대로 지켜본다.
  const added = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) {
          scan(node);
        }
      }
    }
  });
  added.observe(doc.documentElement, { childList: true, subtree: true });
}
