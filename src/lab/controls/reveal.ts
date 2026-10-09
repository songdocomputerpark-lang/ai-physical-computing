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
  /**
   * 화면 위쪽을 덮고 있는 붙은 줄의 높이(px, 기본 0). 0보다 크면 scrollIntoView 대신 직접 옮겨, 칸을 그 밑에 놓는다 —
   * scrollIntoView는 붙은 줄을 몰라서 큰 칸을 가운데 맞추면 칸의 제목과 맨 위 단추가 붙은 줄 밑으로 들어갔다(R2-004).
   * 칸이 붙은 줄 밑의 보이는 자리보다 크면 가운데 대신 칸의 위쪽(제목)을 보이는 자리의 맨 위에 맞춘다.
   */
  inset?: number;
  /** inset을 쓸 때 붙은 줄 밑에 남길 여백(px, 기본 8) */
  margin?: number;
}

/** 붙은 줄(위에 붙은 조작 줄 묶음)이 가린 높이를 뺀 보이는 자리에서, 이 요소가 화면에 충분히 보이는지 */
export function isMostlyVisible(element: Element, viewportHeight: number, inset = 0): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.height === 0 && rect.width === 0) {
    return true; // 숨어 있는 칸은 옮기지 않는다
  }
  const covered = Math.max(0, inset);
  const visible = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, covered);
  if (visible <= 0) {
    return false;
  }
  return visible >= Math.min(rect.height, Math.max(0, viewportHeight - covered) * 0.5);
}

/** 이 칸(root) 안의 조작 줄 묶음이 화면 위에 붙어 있으면 그 높이(px), 아니면 0 */
export function stickyBarInset(root: ParentNode): number {
  const bar = root.querySelector<HTMLElement>('[data-lab-bar]');
  if (!bar) {
    return 0;
  }
  try {
    if (getComputedStyle(bar).position !== 'sticky') {
      return 0;
    }
  } catch {
    return 0;
  }
  return Math.ceil(bar.getBoundingClientRect().height);
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
  const inset = Math.max(0, options.inset ?? 0);
  if (viewportHeight === 0 || isMostlyVisible(element, viewportHeight, inset)) {
    return false;
  }
  if (inset > 0 && typeof window.scrollTo === 'function') {
    const rect = element.getBoundingClientRect();
    const margin = options.margin ?? 8;
    const room = viewportHeight - inset; // 붙은 줄 밑의 보이는 자리
    const block = options.block ?? 'start';
    let top: number; // 옮긴 뒤 칸 위 끝이 화면(뷰포트)에서 있을 자리
    if (block === 'center' && rect.height + margin * 2 <= room) {
      top = inset + (room - rect.height) / 2;
    } else if (block === 'end' && rect.height + margin * 2 <= room) {
      top = viewportHeight - margin - rect.height;
    } else {
      top = inset + margin; // 시작 맞춤이거나 칸이 보이는 자리보다 크면: 제목이 보이게 위 끝을 붙은 줄 밑에
    }
    const target = Math.max(0, Math.round((window.scrollY || 0) + rect.top - top));
    try {
      window.scrollTo({ top: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    } catch {
      window.scrollTo(0, target);
    }
    return true;
  }
  try {
    element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: options.block ?? 'start' });
  } catch {
    element.scrollIntoView();
  }
  return true;
}

export interface RevealTogetherOptions {
  /** 화면 위쪽에 남길 여백(px, 기본 8) */
  margin?: number;
  /** 옮긴 뒤 칸이 조금 늘어나도(첫 결과가 오며 안내 줄이 생김) 함께 보이도록 남겨 둘 여유(px, 기본 0) */
  slack?: number;
  /**
   * 화면 위쪽을 덮고 있는 붙은 줄의 높이(px, 기본 0) — 실습실 조작 줄 묶음이 넓은 화면에서 화면 위에 붙는다(sticky, R1-096).
   * 칸을 그 밑에 놓는다(margin에 더함). 그렇게 하면 둘이 한 화면에 안 들어갈 때는 남겨 둘 여유(slack)를 8px까지 줄여 한 번 더 본다 —
   * 붙은 줄 때문에 [실행] 뒤 결과 칸과 조절 막대를 함께 보이던 것(시나리오 A)이 깨지지 않게.
   */
  inset?: number;
  /** 둘을 함께 보일 수 없어 첫 칸만 보일 때 화면 어디에 붙일지(기본 'start') */
  block?: ScrollLogicalPosition;
  /**
   * 함께 보일 수 없을 때 대신 보일 칸(기본: primary의 마지막 후보). 둘째 칸이 더 중요할 때 준다 —
   * 예: 콘솔에 결과가 나왔다는 알림은 보드 그림과 함께 보이면 좋지만, 못 넣으면 알림을 보여야 한다(2026-09-18 검토 반영).
   */
  fallback?: Element | null;
}

/**
 * 두 칸을 한 화면에 함께 보이게 옮긴다 — 예: [실행] 뒤 결과 창과 그 결과를 바꾸는 첫 조절 막대(시나리오 A: 결과를 보면서 막대를 움직인다).
 * primary는 후보 여러 개를 줄 수 있다(넓은 것부터: 출력 칸 전체 → 출력 화면만). 둘째 칸과 합친 높이가 화면에 들어가는 첫 후보를 쓴다.
 * - 그 후보와 둘째 칸이 이미 보이면(여유 포함) 움직이지 않는다.
 * - 어느 후보도 둘째 칸과 함께 화면에 들어가지 않으면(아주 좁은 화면 등) 마지막 후보만 revealElement로 보인다.
 * - 둘째 칸이 없거나 숨어 있으면 첫 후보만 보인다.
 * 1366×768에서 첫 실습의 출력 칸 전체(제목~키 단추, 입력 칸 높이만큼 늘어남)는 threshold 막대와 함께 들어가지 않지만 출력 화면(캔버스 틀)은 들어간다
 * (2026-09-17 브라우저 실측: 출력 칸 317~889, 캔버스 틀 393~609, 막대 978~1,091). 375×812에서는 출력 칸 전체와 막대가 함께 들어간다.
 */
export function revealTogether(
  primary: Element | null | undefined | readonly (Element | null | undefined)[],
  secondary: Element | null | undefined,
  options: RevealTogetherOptions = {},
): boolean {
  const candidates = (Array.isArray(primary) ? primary : [primary]).filter((element): element is Element => Boolean(element));
  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  if (!first || !last) {
    return false;
  }
  const fallbackOptions: RevealOptions = {
    ...(options.block ? { block: options.block } : {}),
    ...(options.inset !== undefined && options.inset > 0 ? { inset: options.inset } : {}),
  };
  if (!secondary || typeof window === 'undefined') {
    return revealElement(first, fallbackOptions);
  }
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const second = secondary.getBoundingClientRect();
  if (viewportHeight === 0 || (second.width === 0 && second.height === 0)) {
    return revealElement(first, fallbackOptions);
  }
  const inset = Math.max(0, options.inset ?? 0);
  const margin = (options.margin ?? 8) + inset;
  const slack = options.slack ?? 0;
  // 붙은 줄이 있으면 먼저 여유를 두고, 안 들어가면 여유를 줄여 다시 본다(앞 칸부터 — 넓은 칸이 우선)
  const slacks = inset > 0 && slack > 8 ? [slack, 8] : [slack];
  for (const trySlack of slacks) {
    for (const candidate of candidates) {
      const box = candidate.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) {
        continue;
      }
      const top = Math.min(box.top, second.top);
      const bottom = Math.max(box.bottom, second.bottom);
      if (bottom - top + margin + trySlack > viewportHeight) {
        continue;
      }
      if (top >= inset && bottom + trySlack <= viewportHeight) {
        return false;
      }
      if (typeof window.scrollTo !== 'function') {
        return false;
      }
      // 붙은 줄이 있으면 남는 자리를 위쪽에 쓴다 — 둘째 칸의 아래 끝(+여유)을 화면 아래에 맞춰, 칸 위의 제목·[입력 끄기]가
      // 붙은 줄 밑에 덜 가리게 한다(R2-004 통합 확인: 1366×768 영상 처리 첫 실습에서 남는 110px가 화면 아래에 비어 있었다).
      const topTarget = (window.scrollY || 0) + top - margin;
      const bottomTarget = (window.scrollY || 0) + bottom + trySlack - viewportHeight;
      // 위로 옮길 때(칸이 화면 위쪽에 가려짐)는 덜 움직이는 위 끝 맞춤 그대로.
      const target = Math.max(0, Math.round(inset > 0 && topTarget > (window.scrollY || 0) ? Math.min(topTarget, bottomTarget) : topTarget));
      try {
        window.scrollTo({ top: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      } catch {
        window.scrollTo(0, target);
      }
      return true;
    }
  }
  // 붙은 줄 밑에 둘을 다 넣을 수 없으면(붙은 줄이 [실행] 직후 안내 글로 두세 줄이 된 때 등) 둘째 칸의 아래 끝을 화면 아래에 맞춘다 —
  // 첫 칸의 윗부분만 붙은 줄에 조금 가리고 둘 다 화면에 남는다(통합 확인: 1366×768 시나리오 A에서 붙은 줄 높이 때문에 막대가 화면 밖에 남았다).
  if (inset > 0 && typeof window.scrollTo === 'function') {
    const edge = options.margin ?? 8;
    for (const candidate of candidates) {
      const box = candidate.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) {
        continue;
      }
      const top = Math.min(box.top, second.top);
      const bottom = Math.max(box.bottom, second.bottom);
      if (bottom - top + edge * 2 > viewportHeight) {
        continue;
      }
      if (top >= 0 && bottom + edge <= viewportHeight) {
        return false;
      }
      const target = Math.max(0, Math.round((window.scrollY || 0) + bottom + edge - viewportHeight));
      try {
        window.scrollTo({ top: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      } catch {
        window.scrollTo(0, target);
      }
      return true;
    }
  }
  // 둘을 함께 못 넣으면 붙은 줄 밑 보이는 자리에 통째로 들어가는 가장 넓은 후보를 보인다(제목·[입력 끄기]까지 — R2-004 통합 확인:
  // 1366×768 영상 처리 첫 실습에서 출력 칸 전체(497px)는 들어가는데 마지막 후보(출력 화면 틀)만 보여 제목이 붙은 줄 밑에 가렸다).
  const room = viewportHeight - inset - (options.margin ?? 8) * 2;
  const roomy = candidates.find((candidate) => {
    const box = candidate.getBoundingClientRect();
    return !(box.width === 0 && box.height === 0) && box.height <= room;
  });
  return revealElement(options.fallback ?? roomy ?? last, fallbackOptions);
}
