/**
 * 용어 툴팁 위치 계산(순수 함수) — tooltip.ts가 브라우저에서 쓰고, Vitest가 검사한다(tests/unit/glossary/tooltip-position.test.ts).
 * 좌표는 모두 화면(뷰포트) 기준 CSS 픽셀이다(툴팁의 position: fixed와 같은 기준).
 *
 * 규칙
 * - 용어 바로 아래에 놓는다. 아래 자리가 모자라고 위 자리가 더 넓으면 위에 놓는다.
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
): TooltipPosition {
  const spaceBelow = viewport.height - anchor.bottom - gap - margin;
  const spaceAbove = anchor.top - gap - margin;
  const placement = tip.height <= spaceBelow || spaceBelow >= spaceAbove ? 'below' : 'above';
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
