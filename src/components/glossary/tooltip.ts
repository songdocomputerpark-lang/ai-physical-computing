/**
 * 용어 툴팁 동작(브라우저) — GlossaryScope.astro의 <script>가 불러온다. 한 페이지에 한 번만 이벤트를 건다.
 *
 * WCAG 2.2 1.4.13(마우스를 올리거나 초점을 받을 때 나타나는 내용)과 ARIA 툴팁 패턴을 따른다.
 * - 키보드: 용어 링크에 초점이 오면 바로 뜨고, 초점이 떠나면 닫힌다.
 * - 마우스: 올리고 잠깐(SHOW_DELAY_MS) 머물면 뜬다. 툴팁 위로 옮겨도 닫히지 않는다(hoverable).
 * - Esc: 초점이나 마우스를 옮기지 않고도 닫는다(dismissible). 초점을 다시 주거나, 마우스를 밖으로 뺐다가 다시 올리면 또 뜬다.
 * - 터치: 처음 누르면 풀이 말풍선을 띄우고(아래에 "한 번 더 누르면 용어사전에서 자세히 봐요"), 한 번 더 누르면 용어사전으로 간다.
 *   다른 곳을 누르면 닫힌다(2026-09-25 Phase 5 검토 사소 11 — 휴대폰에서 누르자마자 용어사전으로 넘어가 읽던 차시를 떠났다).
 *   누를 때 링크가 초점을 받아도(안드로이드) 말풍선은 click이 연다 — 초점으로 먼저 열리면 첫 누름에 바로 넘어가 버리기 때문이다.
 * - 링크를 누르면 닫는다. 스크롤·화면 크기가 바뀌면 위치를 다시 맞추고, 용어가 화면 밖으로 나가면 닫는다.
 * 툴팁 글은 HTML에 미리 들어 있고(hidden) 링크의 aria-describedby가 가리킨다. 그래서 화면 낭독기는 이 스크립트 없이도 풀이를 읽는다.
 *
 * 마우스가 "떠났는지"는 pointerout 대신 용어·툴팁이 아닌 요소에 pointerover가 일어났는지로 판단한다.
 * Esc로 툴팁이 사라지면 그 아래 요소로 바로 pointerout이 오지 않기 때문이다.
 */
import { computeTooltipPosition, isAnchorVisible } from './tooltip-position.ts';

const LINK_SELECTOR = '.glossary-term__link';
const TIP_SELECTOR = '.glossary-term__tip';

/** 마우스를 올린 뒤 툴팁이 뜨기까지(글을 읽다가 마우스가 스쳐 지나갈 때 깜빡이지 않게) */
export const SHOW_DELAY_MS = 120;
/** 마우스가 떠난 뒤 툴팁이 닫히기까지(용어에서 툴팁으로 마우스를 옮길 틈) */
export const HIDE_DELAY_MS = 200;

interface OpenTooltip {
  readonly link: HTMLAnchorElement;
  readonly tip: HTMLElement;
}

let initialized = false;
let open: OpenTooltip | null = null;
/** 마우스가 올라가 있는 용어(그 툴팁 위에 있을 때도 이 용어) */
let hoveredLink: HTMLAnchorElement | null = null;
/** 키보드 초점이 있는 용어 */
let focusedLink: HTMLAnchorElement | null = null;
/** Esc나 클릭으로 닫은 용어(초점이 떠나거나 마우스가 밖으로 나갈 때까지 다시 띄우지 않는다) */
let dismissedLink: HTMLAnchorElement | null = null;
let showTimer: number | undefined;
let hideTimer: number | undefined;
let frame: number | undefined;
/** 마지막으로 누른 포인터 종류(touch·mouse·pen) — click이 터치에서 왔는지 안다 */
let lastPointerType = '';
/** 터치로 누르기 시작한 용어(그 누름으로 초점이 와도 focusin이 말풍선을 열지 않게) */
let touchPressedLink: HTMLAnchorElement | null = null;
/** 누르기 시작할 때 이미 열려 있던 말풍선의 용어(두 번째 누름인지 안다) */
let openAtPress: HTMLAnchorElement | null = null;

function closestElement<T extends Element>(target: EventTarget | null, selector: string): T | null {
  return target instanceof Element ? target.closest<T>(selector) : null;
}

function tipFor(link: HTMLAnchorElement): HTMLElement | null {
  const id = link.getAttribute('aria-describedby');
  const tip = id ? document.getElementById(id) : null;
  return tip?.matches(TIP_SELECTOR) ? tip : null;
}

function clearShowTimer(): void {
  window.clearTimeout(showTimer);
  showTimer = undefined;
}

function clearHideTimer(): void {
  window.clearTimeout(hideTimer);
  hideTimer = undefined;
}

function scheduleHide(): void {
  if (hideTimer === undefined) {
    hideTimer = window.setTimeout(closeTooltip, HIDE_DELAY_MS);
  }
}

function place(): void {
  frame = undefined;
  if (!open) {
    return;
  }
  const { link, tip } = open;
  const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight };
  const anchor = link.getBoundingClientRect();
  if (!isAnchorVisible(anchor, viewport)) {
    closeTooltip();
    return;
  }
  // 왼쪽 위에 둔 채로 크기를 재야, 오른쪽 가장자리 때문에 줄어든 폭으로 재지 않는다.
  tip.style.left = '0px';
  tip.style.top = '0px';
  const size = tip.getBoundingClientRect();
  const position = computeTooltipPosition(anchor, size, viewport);
  tip.style.left = `${position.left}px`;
  tip.style.top = `${position.top}px`;
  tip.dataset.placement = position.placement;
}

function schedulePlace(): void {
  if (open && frame === undefined) {
    frame = window.requestAnimationFrame(place);
  }
}

function openTooltip(link: HTMLAnchorElement): void {
  const tip = tipFor(link);
  if (!tip) {
    return;
  }
  clearShowTimer();
  clearHideTimer();
  if (open && open.link !== link) {
    closeTooltip();
  }
  open = { link, tip };
  tip.hidden = false;
  link.dataset.tooltip = 'open';
  place();
}

function closeTooltip(): void {
  clearShowTimer();
  clearHideTimer();
  if (!open) {
    return;
  }
  open.tip.hidden = true;
  delete open.tip.dataset.openedBy;
  delete open.link.dataset.tooltip;
  open = null;
}

function onFocusIn(event: FocusEvent): void {
  const link = closestElement<HTMLAnchorElement>(event.target, LINK_SELECTOR);
  if (!link) {
    return;
  }
  focusedLink = link;
  dismissedLink = null;
  if (link === touchPressedLink) {
    return; // 터치로 누른 순간의 초점 — 말풍선은 click이 연다
  }
  openTooltip(link);
}

function onFocusOut(event: FocusEvent): void {
  const link = closestElement<HTMLAnchorElement>(event.target, LINK_SELECTOR);
  if (!link || link !== focusedLink) {
    return;
  }
  focusedLink = null;
  if (dismissedLink === link && hoveredLink !== link) {
    dismissedLink = null;
  }
  if (open?.link === link && hoveredLink !== link) {
    closeTooltip();
  }
}

function onPointerOver(event: PointerEvent): void {
  if (event.pointerType === 'touch') {
    return;
  }
  const tip = closestElement<HTMLElement>(event.target, TIP_SELECTOR);
  const link =
    closestElement<HTMLAnchorElement>(event.target, LINK_SELECTOR) ?? (tip !== null && open?.tip === tip ? open.link : null);

  if (!link) {
    // 용어도 툴팁도 아닌 곳에 들어왔다: 마우스로 띄운 툴팁은 잠시 뒤 닫고, 닫아 둔 표시는 푼다.
    hoveredLink = null;
    clearShowTimer();
    if (dismissedLink !== null && dismissedLink !== focusedLink) {
      dismissedLink = null;
    }
    if (open && open.link !== focusedLink) {
      scheduleHide();
    }
    return;
  }

  const enteredFromOutside = hoveredLink !== link;
  hoveredLink = link;
  clearHideTimer();
  if (open?.link === link) {
    return;
  }
  if (dismissedLink === link) {
    if (!enteredFromOutside) {
      return;
    }
    dismissedLink = null;
  }
  clearShowTimer();
  showTimer = window.setTimeout(
    () => {
      if (hoveredLink === link) {
        openTooltip(link);
      }
    },
    open ? 0 : SHOW_DELAY_MS,
  );
}

function onPointerOut(event: PointerEvent): void {
  // 브라우저 창 밖으로 나갈 때만 처리한다(창 안에서 옮겨 다니는 것은 onPointerOver가 맡는다).
  if (event.pointerType === 'touch' || event.relatedTarget !== null) {
    return;
  }
  hoveredLink = null;
  clearShowTimer();
  if (open && open.link !== focusedLink) {
    scheduleHide();
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !open) {
    return;
  }
  dismissedLink = open.link;
  closeTooltip();
}

function onPointerDown(event: PointerEvent): void {
  lastPointerType = event.pointerType;
  if (event.pointerType !== 'touch') {
    touchPressedLink = null;
    return;
  }
  const link = closestElement<HTMLAnchorElement>(event.target, LINK_SELECTOR);
  touchPressedLink = link;
  openAtPress = open?.link ?? null;
  // 용어·말풍선이 아닌 곳을 누르면 닫는다.
  if (open && !link && !closestElement(event.target, TIP_SELECTOR)) {
    closeTooltip();
  }
}

function onClick(event: MouseEvent): void {
  const link = closestElement<HTMLAnchorElement>(event.target, LINK_SELECTOR);
  if (!link) {
    return;
  }
  if (lastPointerType === 'touch') {
    touchPressedLink = null;
    if (openAtPress !== link) {
      // 첫 누름: 넘어가지 않고 풀이 말풍선을 띄운다.
      event.preventDefault();
      dismissedLink = null;
      openTooltip(link);
      if (open?.link === link) {
        open.tip.dataset.openedBy = 'touch';
      }
      openAtPress = null;
      return;
    }
    openAtPress = null;
  }
  if (open?.link !== link) {
    return;
  }
  dismissedLink = link;
  closeTooltip();
}

/** 페이지의 모든 용어 툴팁을 켠다(여러 번 불러도 한 번만 건다). */
export function initGlossaryTooltips(): void {
  if (initialized) {
    return;
  }
  initialized = true;
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('pointerover', onPointerOver);
  document.addEventListener('pointerout', onPointerOut);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  document.addEventListener('click', onClick);
  window.addEventListener('scroll', schedulePlace, { capture: true, passive: true });
  window.addEventListener('resize', schedulePlace, { passive: true });
}
