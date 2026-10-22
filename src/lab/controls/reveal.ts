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
 *
 * 차시 안 실습실(판 1.7.0 — PROGRESS 미해결 261 #13·#14, 차시 쪽 src/components/lesson/LessonExamples.astro):
 * 차시 쪽은 실습실 틀(iframe)의 높이를 안쪽 문서 높이에 맞추고 안쪽 뿌리에 `data-embed-fit`을 붙인다 — 스크롤은 바깥 쪽 하나뿐이다.
 * 그때 이 틀의 창 높이(window.innerHeight)는 문서 전체 높이라 "화면에 보이는가"를 그것으로 재면 모든 칸이 보인다고 잘못 본다.
 * 그래서 높이 맞춤이면 (1) 보이는 자리를 **바깥 쪽 화면과 틀이 겹치는 띠**로 재고(embedFitView) (2) 옮길 때 **바깥 쪽 창을 굴리며**
 * (3) [실행] 뒤 결과를 보이는 옮기기(revealTogether)는 **조작 줄([실행]·[정지]·상태 줄)이 보이고 있으면 화면 밖으로 밀지 않는다** —
 * 차시 안 실습실은 코드를 고쳐 다시 [실행]하는 자리라, 예전처럼 상자 안이 결과 칸으로 내려가 코드와 [실행]이 사라지면 안 됐다(walk-student-first #14).
 * 결과가 조작 줄과 한 화면에 안 들어가면 조작 줄을 화면 위 끝까지만 올리고 나머지는 학생이 바깥 쪽을 굴려 본다(스크롤이 한 겹이라 쉽다).
 * 높이 맞춤이 아니면(실습실 쪽, 수업 화면 속 실습실) 예전과 똑같이 움직인다.
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

/**
 * 화면 띠 — 이 문서의 화면 좌표(getBoundingClientRect와 같은 기준)로 잰, 학생이 보는 화면의 위·아래 끝.
 * 보통 쪽은 [0, 창 높이]. 높이 맞춤 틀이면 바깥 쪽 화면을 틀 안 좌표로 옮긴 것이라 틀 위 끝이 화면 아래에 있으면 top이 음수다.
 */
interface VisibleBand {
  readonly top: number;
  readonly bottom: number;
}

/** 높이 맞춤 틀이면: 화면 띠(틀 안 좌표)와 화면을 굴릴 바깥 창 */
export interface EmbedFitView extends VisibleBand {
  /** 굴릴 창(차시 쪽) */
  readonly outer: Window;
}

/** 안쪽 뿌리 표시 — 차시 쪽이 틀 높이를 안쪽 문서에 맞춘 동안만 붙인다(LessonExamples.astro) */
export const EMBED_FIT_ATTRIBUTE = 'data-embed-fit';

/**
 * 높이 맞춤 틀 안이면 바깥 쪽 화면(위·아래 끝)을 이 문서 좌표로 옮긴 띠와 바깥 창. 아니면(보통 쪽·테스트 대역·다른 사이트 틀) undefined.
 * 띠를 틀 안쪽으로 자르지 않는다 — "얼마나 굴릴까"는 화면 기준이어야 해서다(틀 위 끝이 화면 가운데 있을 때 틀 안 보이는 부분 기준으로 재면 덜 굴러
 * 칸이 화면 아래에 남았다). 칸은 늘 틀 안에 있으니 "보이는가"도 이 띠와 겹치는지로 잰다.
 */
export function embedFitView(): EmbedFitView | undefined {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return undefined;
  }
  const root = document.documentElement as Element | null | undefined;
  if (!root || typeof root.hasAttribute !== 'function' || !root.hasAttribute(EMBED_FIT_ATTRIBUTE)) {
    return undefined;
  }
  let frame: Element | null = null;
  let outer: Window | null = null;
  try {
    frame = window.frameElement;
    outer = window.parent;
  } catch {
    return undefined; // 다른 사이트 틀은 바깥을 볼 수 없다
  }
  if (!frame || !outer || outer === window) {
    return undefined;
  }
  const rect = frame.getBoundingClientRect();
  // 틀 테두리만큼 안쪽 문서가 아래에 있다(clientTop — 지금 틀은 테두리 0)
  const contentTop = rect.top + ((frame as HTMLElement).clientTop || 0);
  const outerHeight = outer.innerHeight || outer.document?.documentElement?.clientHeight || 0;
  return { top: -contentTop, bottom: outerHeight - contentTop, outer };
}

/** 화면 띠: 높이 맞춤 틀이면 바깥 화면(틀 안 좌표), 아니면 [0, 창 높이] */
function visibleBand(viewportHeight: number, fit: EmbedFitView | undefined = embedFitView()): VisibleBand {
  return fit ? { top: fit.top, bottom: fit.bottom } : { top: 0, bottom: viewportHeight };
}

/**
 * 붙은 줄(위에 붙은 조작 줄 묶음)이 가린 높이를 뺀 보이는 자리에서, 이 요소가 화면에 충분히 보이는지.
 * 차시 안 실습실(높이 맞춤)이면 "화면"은 바깥 쪽 화면과 틀이 겹치는 띠다 — 부르는 쪽은 그대로 window.innerHeight를 넘겨도 된다.
 */
export function isMostlyVisible(element: Element, viewportHeight: number, inset = 0): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.height === 0 && rect.width === 0) {
    return true; // 숨어 있는 칸은 옮기지 않는다
  }
  const band = visibleBand(viewportHeight);
  const covered = band.top + Math.max(0, inset); // 붙은 줄 밑(보통 쪽은 0 + 붙은 줄, 높이 맞춤 틀은 화면 위 끝)
  const bottom = band.bottom;
  const visible = Math.min(rect.bottom, bottom) - Math.max(rect.top, covered);
  if (visible <= 0) {
    return false;
  }
  return visible >= Math.min(rect.height, Math.max(0, bottom - covered) * 0.5);
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

/** 화면을 delta(px, + = 아래로)만큼 굴린다 — 높이 맞춤 틀이면 바깥 창을. 굴릴 수 없으면 false */
function scrollByDelta(delta: number, fit: EmbedFitView | undefined): boolean {
  const view: Window | undefined = fit ? fit.outer : typeof window === 'undefined' ? undefined : window;
  if (!view || typeof view.scrollTo !== 'function') {
    return false;
  }
  const target = Math.max(0, Math.round((view.scrollY || 0) + delta));
  try {
    view.scrollTo({ top: target, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  } catch {
    view.scrollTo(0, target);
  }
  return true;
}

/**
 * 높이 맞춤 틀에서 이 요소(조작 줄)가 보이고 있으면, 화면을 아래로 굴릴 수 있는 한도(px) — 그 요소의 위 끝이 띠 위 끝 + 여백까지만 올라간다.
 * 보이지 않거나 없으면 한도 없음(Infinity).
 */
function keepVisibleLimit(keep: Element | null | undefined, band: VisibleBand, edge: number): number {
  if (!keep) {
    return Number.POSITIVE_INFINITY;
  }
  const rect = keep.getBoundingClientRect();
  if ((rect.width === 0 && rect.height === 0) || rect.bottom <= band.top || rect.top >= band.bottom) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, rect.top - band.top - edge);
}

/** 굴릴 양에 한도를 씌운다(아래로만 — 위로 굴리는 것은 막지 않는다) */
function clampDown(delta: number, limit: number): number {
  return delta > 0 ? Math.min(delta, limit) : delta;
}

/** revealElement 몸통 — keep(높이 맞춤 틀에서 화면에 남길 요소)을 revealTogether가 넘긴다 */
function revealElementWithin(element: Element | null | undefined, options: RevealOptions, keep: Element | null | undefined): boolean {
  if (!element || typeof window === 'undefined' || typeof element.scrollIntoView !== 'function') {
    return false;
  }
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const inset = Math.max(0, options.inset ?? 0);
  if (viewportHeight === 0 || isMostlyVisible(element, viewportHeight, inset)) {
    return false;
  }
  const fit = embedFitView();
  if ((inset > 0 && typeof window.scrollTo === 'function') || fit) {
    const band = visibleBand(viewportHeight, fit);
    const rect = element.getBoundingClientRect();
    const margin = options.margin ?? 8;
    const top0 = band.top + inset; // 붙은 줄 밑(높이 맞춤이면 바깥 화면 위 끝)
    const room = band.bottom - top0; // 보이는 자리
    const block = options.block ?? 'start';
    let top: number; // 옮긴 뒤 칸 위 끝이 화면(뷰포트)에서 있을 자리
    if (block === 'center' && rect.height + margin * 2 <= room) {
      top = top0 + (room - rect.height) / 2;
    } else if (block === 'end' && rect.height + margin * 2 <= room) {
      top = band.bottom - margin - rect.height;
    } else if (block === 'nearest' && fit && rect.height + margin * 2 <= room) {
      // 높이 맞춤 틀에서 "가까운 쪽": 아래에 있으면 아래 끝을, 위에 있으면 위 끝을 띠 가장자리에 붙인다(scrollIntoView nearest와 같은 뜻)
      top = rect.top > top0 ? band.bottom - margin - rect.height : top0 + margin;
    } else {
      top = top0 + margin; // 시작 맞춤이거나 칸이 보이는 자리보다 크면: 제목이 보이게 위 끝을 붙은 줄 밑에
    }
    const delta = clampDown(rect.top - top, keepVisibleLimit(keep, band, margin));
    if (fit && Math.abs(delta) < 1) {
      return false; // 조작 줄을 지키느라 굴릴 수 없다(또는 이미 그 자리)
    }
    return scrollByDelta(delta, fit);
  }
  try {
    element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: options.block ?? 'start' });
  } catch {
    element.scrollIntoView();
  }
  return true;
}

/** 화면 밖이면 화면 안으로 옮긴다. 옮겼으면 true. */
export function revealElement(element: Element | null | undefined, options: RevealOptions = {}): boolean {
  return revealElementWithin(element, options, undefined);
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
  /**
   * (판 1.7.0) 차시 안 실습실(높이 맞춤 틀)에서 화면 밖으로 밀지 않을 요소. 주지 않으면 이 문서의 조작 줄 묶음([data-lab-bar]).
   * null이면 지키지 않는다. 높이 맞춤이 아닌 쪽에서는 쓰지 않는다.
   */
  keep?: Element | null;
}

/** 높이 맞춤 틀에서 화면에 남길 요소(기본 — 실습실 조작 줄 묶음) */
function keepElementOf(options: RevealTogetherOptions, fit: EmbedFitView | undefined): Element | null {
  if (!fit) {
    return null;
  }
  if (options.keep !== undefined) {
    return options.keep;
  }
  try {
    return document.querySelector('[data-lab-bar]');
  } catch {
    return null;
  }
}

/**
 * 두 칸을 한 화면에 함께 보이게 옮긴다 — 예: [실행] 뒤 결과 창과 그 결과를 바꾸는 첫 조절 막대(시나리오 A: 결과를 보면서 막대를 움직인다).
 * primary는 후보 여러 개를 줄 수 있다(넓은 것부터: 출력 칸 전체 → 출력 화면만). 둘째 칸과 합친 높이가 화면에 들어가는 첫 후보를 쓴다.
 * - 그 후보와 둘째 칸이 이미 보이면(여유 포함) 움직이지 않는다.
 * - 어느 후보도 둘째 칸과 함께 화면에 들어가지 않으면(아주 좁은 화면 등) 마지막 후보만 revealElement로 보인다.
 * - 둘째 칸이 없거나 숨어 있으면 첫 후보만 보인다.
 * - 차시 안 실습실(높이 맞춤 틀)에서는 보이는 띠를 바깥 쪽 화면으로 재고, 아래로 굴리는 양을 조작 줄이 화면에 남는 데까지로 줄인다(머리말).
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
  const fit = typeof window === 'undefined' ? undefined : embedFitView();
  const keep = keepElementOf(options, fit);
  const fallbackOptions: RevealOptions = {
    ...(options.block ? { block: options.block } : {}),
    ...(options.inset !== undefined && options.inset > 0 ? { inset: options.inset } : {}),
  };
  if (!secondary || typeof window === 'undefined') {
    return revealElementWithin(first, fallbackOptions, keep);
  }
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const second = secondary.getBoundingClientRect();
  if (viewportHeight === 0 || (second.width === 0 && second.height === 0)) {
    return revealElementWithin(first, fallbackOptions, keep);
  }
  const inset = Math.max(0, options.inset ?? 0);
  const band = visibleBand(viewportHeight, fit);
  const top0 = band.top + inset; // 붙은 줄 밑(높이 맞춤이면 바깥 화면 위 끝)
  const room = band.bottom - top0;
  const edge = options.margin ?? 8;
  const slack = options.slack ?? 0;
  const keepLimit = keepVisibleLimit(keep, band, edge);
  const currentScroll = fit ? fit.outer.scrollY || 0 : window.scrollY || 0;
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
      if (bottom - top + edge + trySlack > room) {
        continue;
      }
      if (top >= top0 && bottom + trySlack <= band.bottom) {
        return false;
      }
      if (!fit && typeof window.scrollTo !== 'function') {
        return false;
      }
      // 붙은 줄이 있으면 남는 자리를 위쪽에 쓴다 — 둘째 칸의 아래 끝(+여유)을 화면 아래에 맞춰, 칸 위의 제목·[입력 끄기]가
      // 붙은 줄 밑에 덜 가리게 한다(R2-004 통합 확인: 1366×768 영상 처리 첫 실습에서 남는 110px가 화면 아래에 비어 있었다).
      // 높이 맞춤 틀도 아래로 굴릴 때는 덜 굴리는 아래 끝 맞춤이다 — 위쪽의 코드와 [실행]이 화면에 더 오래 남는다.
      const topDelta = top - (top0 + edge);
      const bottomDelta = bottom + trySlack - band.bottom;
      // 위로 옮길 때(칸이 화면 위쪽에 가려짐)는 덜 움직이는 위 끝 맞춤 그대로.
      const wanted = (inset > 0 || fit) && topDelta > 0 ? Math.min(topDelta, bottomDelta) : topDelta;
      // 문서 맨 위보다 위로는 못 굴린다(예전과 같은 계산 — scrollTo가 0 밑을 0으로 둔다)
      const delta = Math.max(-currentScroll, clampDown(wanted, keepLimit));
      if (fit && Math.abs(delta) < 1) {
        return false;
      }
      return scrollByDelta(delta, fit);
    }
  }
  // 붙은 줄 밑에 둘을 다 넣을 수 없으면(붙은 줄이 [실행] 직후 안내 글로 두세 줄이 된 때 등) 둘째 칸의 아래 끝을 화면 아래에 맞춘다 —
  // 첫 칸의 윗부분만 붙은 줄에 조금 가리고 둘 다 화면에 남는다(통합 확인: 1366×768 시나리오 A에서 붙은 줄 높이 때문에 막대가 화면 밖에 남았다).
  if (inset > 0 && typeof window.scrollTo === 'function') {
    for (const candidate of candidates) {
      const box = candidate.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) {
        continue;
      }
      const top = Math.min(box.top, second.top);
      const bottom = Math.max(box.bottom, second.bottom);
      if (bottom - top + edge * 2 > band.bottom - band.top) {
        continue;
      }
      if (top >= band.top && bottom + edge <= band.bottom) {
        return false;
      }
      return scrollByDelta(Math.max(-currentScroll, clampDown(bottom + edge - band.bottom, keepLimit)), fit);
    }
  }
  // 둘을 함께 못 넣으면 붙은 줄 밑 보이는 자리에 통째로 들어가는 가장 넓은 후보를 보인다(제목·[입력 끄기]까지 — R2-004 통합 확인:
  // 1366×768 영상 처리 첫 실습에서 출력 칸 전체(497px)는 들어가는데 마지막 후보(출력 화면 틀)만 보여 제목이 붙은 줄 밑에 가렸다).
  const roomForOne = room - edge * 2;
  const roomy = candidates.find((candidate) => {
    const box = candidate.getBoundingClientRect();
    return !(box.width === 0 && box.height === 0) && box.height <= roomForOne;
  });
  return revealElementWithin(options.fallback ?? roomy ?? last, fallbackOptions, keep);
}
