/**
 * 용어 툴팁 위치 계산(순수 함수) — tooltip.ts가 브라우저에서 쓰고, Vitest가 검사한다(tests/unit/glossary/tooltip-position.test.ts).
 * 좌표는 모두 화면(뷰포트) 기준 CSS 픽셀이다(툴팁의 position: fixed와 같은 기준).
 *
 * 규칙
 * - 용어 바로 위에 놓는다(위 자리가 넉넉할 때). 읽고 있는 문장의 다음 줄을 가리지 않고, 이미 읽은 앞 줄만 가리기 때문이다
 *   (2026-09-16 검토 반영 — 아래에 놓으면 그 용어가 든 문장의 다음 두 줄이 가려져 Esc를 눌러야 마저 읽을 수 있었다).
 * - 위 자리가 모자라면 아래에 놓고, 둘 다 모자라면 더 넓은 쪽에 놓는다.
 * - 단, 위에 놓으면 바로 위 소제목(avoid — h2·h3 등의 세로 범위)을 덮을 때는, 아래 자리가 넉넉하고 아래에는 소제목이 없으면 아래에 놓는다
 *   (판 1.3.0 검수 R2-022 — "핵심 개념" 같은 제목은 지금 읽는 자리를 알려 주는 글이라 가리지 않는다. 다음 줄을 안 가리는 규칙은 제목이 없을 때 그대로).
 * - 왼쪽 끝은 용어의 왼쪽 끝에 맞추되, 화면 가장자리에서 margin만큼 안쪽으로 밀어 넣는다(좁은 휴대폰 화면에서 잘리지 않게).
 */

export interface AnchorRect {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface BoxSize {
  readonly width: number;
  readonly height: number;
}

/** 덮지 말아야 할 글(소제목)의 세로 범위 */
export interface VerticalBand {
  readonly top: number;
  readonly bottom: number;
}

export interface TooltipPosition {
  readonly top: number;
  readonly left: number;
  readonly placement: 'below' | 'above';
}

/** 용어와 툴팁 사이 틈 */
export const TOOLTIP_GAP = 8;
/** 화면 가장자리와 툴팁 사이의 최소 여백 */
export const VIEWPORT_MARGIN = 8;

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

/** 툴팁을 놓을 자리를 계산한다. */
export function computeTooltipPosition(
  anchor: AnchorRect,
  tip: BoxSize,
  viewport: BoxSize,
  gap: number = TOOLTIP_GAP,
  margin: number = VIEWPORT_MARGIN,
  avoid: readonly VerticalBand[] = [],
): TooltipPosition {
  const spaceBelow = viewport.height - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - gap - margin;
  const covers = (top: number, bottom: number): boolean => avoid.some((band) => band.top < bottom && band.bottom > top);
  const aboveCoversHeading = covers(anchor.top - gap - tip.height, anchor.top - gap);
  const belowCoversHeading = covers(anchor.bottom + gap, anchor.bottom + gap + tip.height);
  let placement: TooltipPosition['placement'];
  if (tip.height <= spaceAbove && aboveCoversHeading && tip.height <= spaceBelow && !belowCoversHeading) {
    placement = 'below';
  } else if (tip.height <= spaceAbove) {
    placement = 'above';
  } else if (tip.height <= spaceBelow) {
    placement = 'below';
  } else {
    placement = spaceAbove >= spaceBelow ? 'above' : 'below';
  }
  const preferredTop = placement === 'below' ? anchor.bottom + gap : anchor.top - gap - tip.height;
  return {
    top: Math.round(clamp(preferredTop, margin, viewport.height - margin - tip.height)),
    left: Math.round(clamp(anchor.left, margin, viewport.width - margin - tip.width)),
    placement,
  };
}

/** 용어가 화면 안에 조금이라도 보이는지(모두 벗어나면 툴팁을 닫는다) */
export function isAnchorVisible(anchor: AnchorRect, viewport: BoxSize): boolean {
  return anchor.bottom > 0 && anchor.top < viewport.height && anchor.right > 0 && anchor.left < viewport.width;
}
