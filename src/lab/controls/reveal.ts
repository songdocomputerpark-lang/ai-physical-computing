/**
 * 화면 밖에 있는 칸을 화면 안으로 옮긴다(실습실 공통, 2026-09-17 Phase 2 검토 반영).
 *
 * 왜 필요한가: 실습실은 세로로 길다(1366×768에서 문서 5,000px, 375×812에서 7,900px). [실행]을 눌러도 화면이 그대로면
 * 결과 화면(y≈678)과 조절 막대(y≈1,359)가 첫 화면 밖이라 학생이 스스로 찾아 내려가야 하고, 오류 풀이 카드(y≈2,900)는
 * 아예 보이지 않는다. 그래서 "방금 생긴 것"만 화면 안으로 옮긴다.
 *
 * 규칙
 * - 이미 충분히 보이면 아무것도 하지 않는다 — 화면이 까닭 없이 움직이지 않게. "충분히"는 작은 칸(화면 절반보다 낮은 오류 카드 등)이면
 *   끝까지 다 보일 때, 큰 칸(입력·출력 칸 등)이면 화면의 절반 이상을 차지할 때다.
 * - 움직임 줄이기(prefers-reduced-motion: reduce)면 부드럽게 넘기지 않고 바로 옮긴다(SPEC 접근성).
 * - scrollIntoView를 쓸 수 없는 환경(옛 브라우저·테스트 대역)에서는 조용히 넘어간다.
 */

export interface RevealOptions {
  /** 화면 어디에 붙일지(기본 'start' — 칸의 제목이 화면 위쪽에 오게) */
  block?: ScrollLogicalPosition;
}

/** 이 요소가 화면에 충분히 보이는지 */
export function isMostlyVisible(element: Element, viewportHeight: number): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.height === 0 && rect.width === 0) {
    return true; // 숨어 있는 칸은 옮기지 않는다
  }
  const visible = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
  if (visible <= 0) {
    return false;
  }
  return visible >= Math.min(rect.height, viewportHeight * 0.5);
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 화면 밖이면 화면 안으로 옮긴다. 옮겼으면 true. */
export function revealElement(element: Element | null | undefined, options: RevealOptions = {}): boolean {
  if (!element || typeof window === 'undefined' || typeof element.scrollIntoView !== 'function') {
    return false;
  }
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  if (viewportHeight === 0 || isMostlyVisible(element, viewportHeight)) {
    return false;
  }
  try {
    element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: options.block ?? 'start' });
  } catch {
    element.scrollIntoView();
  }
  return true;
}
