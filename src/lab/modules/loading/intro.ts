/**
 * 첫 준비 동안 준비 칸을 실습실 맨 위 자리로 **DOM째** 옮기고, 준비가 끝나면(저절로 접힘·[실행]) 제자리로 돌려놓는다
 * (판 1.2.0 — PROGRESS 미해결 218, 최종 전수 점검 LV-02, WCAG 2.4.3 초점 차례). 학생이 첫 준비 동안 [접기]를 누르면 칸은 맨 위 자리에서
 * 접히고 [실행] 때 제자리로 간다(판 1.2.1 — index.ts setCollapsed stayInPlace, 판 1.2.0 적대적 검토 E14).
 *
 * 왜 DOM째인가: 예전에는 CSS(grid-template-areas)로 넓은 모듈 줄(.lab__modules)을 맨 위에 **보이게만** 했다. 그래서 준비 칸은 편집칸 위에
 * 보이는데 Tab 차례는 편집칸·입력/출력·조절 패널을 다 지난 뒤(약 32번째)였다. 이제 실습실 틀(LabShell.astro)이 편집칸 바로 앞에 빈 자리
 * `[data-lab-intro]`를 그려 두고, 준비 칸(loading 모듈)이 붙을 때 자기 칸을 거기로 옮긴다 — 보이는 차례와 Tab 차례가 같다.
 * 그 자리에는 준비 칸만 간다: 첫 준비 동안 열린 가상 데스크톱·MQTT·[보내기] 칸은 제자리(입력·출력 아래)에 그대로 있다
 * (예전 CSS는 넓은 모듈 줄 전체를 올려 그 칸들도 보이는 차례와 Tab 차례가 어긋났다).
 *
 * 제자리로 돌려놓기(endLoadingIntro)는 **곧바로(동기)** 한다: [실행]을 누르면 실습실 틀(lab-shell.ts #beginRun)이 이 함수를 부른 바로 다음 줄에서
 * 결과 칸 위치를 재서 화면을 옮긴다(revealTogether). 옮길 때 초점은 지킨다 — `moveBefore`(초점·상태를 지키는 원자 이동, Chrome·Edge 133+)가
 * 있으면 그것, 없으면 insertBefore 뒤 초점을 그 요소에 되돌린다(preventScroll). 칸을 접을 때 키보드 초점을 지키는 규칙(DECISIONS C67 ①)은
 * 준비 칸(index.ts)이 그대로 맡는다(초점이 칸 안이면 접기를 미루고, 접은 뒤 화면 밖이면 화면 안으로).
 *
 * 테스트가 읽는 값: 실습실 뿌리의 data-loading-intro(yes|no — 실습실 틀이 그린 처음 값은 yes), 준비 칸이 어느 부모 안에 있는지
 * ([data-lab-intro] 또는 .lab__modules — tests/e2e/lab-loading.spec.ts·a11y-keyboard.spec.ts).
 */

/** 실습실 틀이 그린 "첫 준비 동안 맨 위 칸 자리"(LabShell.astro) */
export const LOADING_INTRO_SLOT_SELECTOR = '[data-lab-intro]';

/**
 * 맨 위 자리에 있는 동안 준비 칸의 제목 단계(판 1.3.0 검수 R1-104). 칸 제목은 제자리(입력·출력 아래)에서 h3이 맞지만, 맨 위 자리는 쪽 제목(h1) 바로 다음이라
 * 제목 단계가 h1 → h3으로 건너뛰었다(axe heading-order). 맨 위에 있는 동안만 aria-level로 실습실 칸 제목(.lab__heading)과 같은 단계로 올리고,
 * 그 안 카드 제목은 한 단계 아래로 한다. 제자리로 돌아가면 지운다(태그의 원래 단계가 맞다).
 */
function setIntroHeadingLevels(root: Element, panel: Element, on: boolean): void {
  const title = panel.querySelector('[data-loading-title]');
  const card = panel.querySelector('[data-loading-card-title]');
  if (!on) {
    title?.removeAttribute('aria-level');
    card?.removeAttribute('aria-level');
    return;
  }
  const level = Number.parseInt(/^H([1-6])$/u.exec(root.querySelector('.lab__heading')?.tagName ?? '')?.[1] ?? '2', 10);
  title?.setAttribute('aria-level', String(level));
  card?.setAttribute('aria-level', String(Math.min(level + 1, 6)));
}

/** 옮긴 칸 → 제자리 표시(빈 주석 노드). 칸을 되돌릴 때 그 자리 바로 앞에 넣고 표시는 지운다. */
const homes = new WeakMap<Element, Comment>();

/** 노드에 원자 이동(moveBefore)이 있으면 그 함수 */
type MoveBefore = (node: Node, child: Node | null) => void;

/**
 * element를 parent 안 before 앞으로 옮기며 초점을 지킨다. moveBefore가 있으면 초점·상태가 그대로 남고(초점 잃음·blur 없음),
 * 없거나 실패하면 insertBefore로 옮긴 뒤 안에 있던 초점 요소에 초점을 되돌린다(화면은 움직이지 않게 preventScroll).
 * 화면 위치는 옮기기 전 그대로 둔다(판 1.2.1 — 판 1.2.0 적대적 검토 E14): 브라우저는 초점 요소가 든 칸을 moveBefore로 옮기면 그 요소를
 * 화면 안으로 곧바로(동기) 굴린다 — 마우스로 누른 [접기]도 그래서 화면이 칸의 제자리(입력·출력 아래)로 뛰었다(Edge 154 실측 scrollY 0 → 1,485px,
 * 375px 폭 3,152px). 키보드 초점을 화면 안에 둘지는 부르는 쪽(준비 칸 index.ts keepFocusInView)이, [실행] 뒤 결과 칸으로 옮길지는 실습실 틀이 정한다.
 */
export function moveKeepingFocus(element: Element, parent: Node, before: Node | null): void {
  const doc = element.ownerDocument;
  const view = doc?.defaultView ?? null;
  const active = doc?.activeElement ?? null;
  /** 옮기는 칸 안에 있던 초점 요소(없으면 null) */
  const focused = active instanceof HTMLElement && active !== doc?.body && element.contains(active) ? active : null;
  const scrollBefore = focused && view ? { x: view.scrollX, y: view.scrollY } : null;
  const atomic = (parent as unknown as { moveBefore?: MoveBefore }).moveBefore;
  let moved = false;
  if (typeof atomic === 'function') {
    try {
      atomic.call(parent, element, before);
      moved = true;
    } catch {
      moved = false; // 원자 이동을 할 수 없는 경우(다른 문서 등) — 아래에서 보통 방법으로 옮긴다
    }
  }
  if (!moved) {
    parent.insertBefore(element, before);
  }
  if (focused && focused.isConnected && doc?.activeElement !== focused) {
    try {
      focused.focus({ preventScroll: true });
    } catch {
      // 초점을 받을 수 없게 된 요소 — 그대로 둔다
    }
  }
  if (scrollBefore && view && (view.scrollX !== scrollBefore.x || view.scrollY !== scrollBefore.y)) {
    view.scrollTo({ left: scrollBefore.x, top: scrollBefore.y, behavior: 'instant' as ScrollBehavior });
  }
}

/**
 * 첫 준비 중이면(root data-loading-intro="yes") 준비 칸을 맨 위 자리로 옮긴다. 옮겼으면 true.
 * 자리가 없는 쪽(실습실 틀을 쓰지 않는 시험 쪽 등)·이미 옮긴 칸·준비가 끝난 뒤에는 아무것도 하지 않는다.
 */
export function placeInLoadingIntro(root: HTMLElement, panel: HTMLElement): boolean {
  if (root.dataset.loadingIntro !== 'yes' || homes.has(panel)) {
    return false;
  }
  const slot = root.querySelector<HTMLElement>(LOADING_INTRO_SLOT_SELECTOR);
  const parent = panel.parentNode;
  if (!slot || !parent || slot.contains(panel) || panel.contains(slot)) {
    return false;
  }
  const marker = (root.ownerDocument ?? document).createComment(' 준비 칸 제자리(첫 준비가 끝나면 여기로 돌아와요) ');
  parent.insertBefore(marker, panel);
  homes.set(panel, marker);
  moveKeepingFocus(panel, slot, null);
  setIntroHeadingLevels(root, panel, true);
  return true;
}

/**
 * 첫 준비를 끝낸다: 뿌리 data-loading-intro를 'no'로 바꾸고, 맨 위 자리에 옮겨 둔 칸을 모두 제자리로 돌려놓는다(곧바로 — 동기).
 * 여러 번 불러도 된다(두 번째부터는 할 일이 없다).
 */
export function endLoadingIntro(root: HTMLElement): void {
  root.dataset.loadingIntro = 'no';
  const slot = root.querySelector<HTMLElement>(LOADING_INTRO_SLOT_SELECTOR);
  if (!slot) {
    return;
  }
  for (const element of [...slot.children]) {
    const marker = homes.get(element);
    if (!marker || !marker.parentNode) {
      continue; // 제자리를 모르는 칸은 건드리지 않는다
    }
    moveKeepingFocus(element, marker.parentNode, marker);
    marker.remove();
    homes.delete(element);
    setIntroHeadingLevels(root, element, false);
  }
}

/** 이 칸이 지금 맨 위 자리에 옮겨져 있는지(시험·화면 논리용) */
export function isInLoadingIntro(panel: Element): boolean {
  return homes.has(panel) && panel.parentElement?.matches(LOADING_INTRO_SLOT_SELECTOR) === true;
}
