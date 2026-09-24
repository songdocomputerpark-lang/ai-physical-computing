/**
 * 격자 배치 규칙(P4-07) — **순수 함수만** 둔다. 화면(`grid-view.ts`)은 여기서 정한 자리를 CSS 격자에 그리기만 한다.
 *
 * 규칙
 * - 판은 가로 `DASH_COLUMNS`칸이다. 위젯은 칸 단위로 자리(x·y)와 크기(w·h)를 가진다.
 * - **겹치지 않는다.** 옮기거나 크기를 바꾼 위젯이 다른 위젯 위에 오면, 밀린 쪽이 아래로 내려간다(`resolveCollisions`).
 *   위로 당기지는 않는다 — 학생이 만든 빈 자리를 사이트가 마음대로 메우면 "내가 놓은 자리"가 바뀌어 헷갈린다.
 * - 아래로 갈 수 있는 끝은 **지금 판의 맨 아래 바로 다음 줄**이다(`DASH_MAX_ROWS`도 넘지 않는다).
 *   그래야 방향키로 계속 눌러도 빈 줄만 늘어나지 않고 "판의 끝"을 알려 줄 수 있다.
 * - 키보드(방향키·Shift+방향키)와 끌어 놓기가 **같은 함수**를 쓴다 — 두 길의 결과가 다르면 안 된다(접근성).
 */
import { DASH_COLUMNS, DASH_MAX_ROWS, kindInfo } from './defaults.ts';
import type { DashboardWidget, PlacedItem, WidgetKind, WidgetRect } from './types.ts';

/** 두 자리가 겹치나 */
export function overlaps(a: WidgetRect, b: WidgetRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 이 종류가 가질 수 있는 가장 작은 크기 */
export function minSizeOf(kind: WidgetKind): { minW: number; minH: number } {
  const info = kindInfo(kind);
  return { minW: info?.minW ?? 2, minH: info?.minH ?? 2 };
}

function clampNumber(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) {
    return low;
  }
  return Math.min(high, Math.max(low, Math.round(value)));
}

/** 자리를 판 안으로 들여놓는다(크기가 먼저, 그다음 자리) */
export function clampRect(rect: WidgetRect, kind: WidgetKind): WidgetRect {
  const { minW, minH } = minSizeOf(kind);
  const w = clampNumber(rect.w, minW, DASH_COLUMNS);
  const h = clampNumber(rect.h, minH, DASH_MAX_ROWS);
  const x = clampNumber(rect.x, 0, DASH_COLUMNS - w);
  const y = clampNumber(rect.y, 0, DASH_MAX_ROWS - h);
  return { x, y, w, h };
}

/** 읽는 순서(위 줄부터, 같은 줄이면 왼쪽부터) */
export function sortForReading<T extends PlacedItem>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
}

/**
 * 겹친 것을 푼다. `priorityId`가 자기 자리를 지키고, 나머지는 읽는 순서대로 다시 놓이며 겹치면 아래로 내려간다.
 */
export function resolveCollisions<T extends PlacedItem>(items: readonly T[], priorityId?: string): T[] {
  const rest = sortForReading(items.filter((item) => item.id !== priorityId));
  const first = items.find((item) => item.id === priorityId);
  const order = first === undefined ? rest : [first, ...rest];
  const placed: T[] = [];
  for (const item of order) {
    let y = Math.max(0, item.y);
    while (placed.some((other) => overlaps({ ...item, y }, other))) {
      y += 1;
      if (y > DASH_MAX_ROWS) {
        break;
      }
    }
    placed.push({ ...item, y: Math.min(y, DASH_MAX_ROWS - item.h) });
  }
  return sortForReading(placed);
}

/** 이 위젯이 내려갈 수 있는 가장 아래 줄(지금 판의 맨 아래 바로 다음 줄까지) */
export function maxYFor(widgets: readonly DashboardWidget[], id: string, h: number): number {
  const bottoms = widgets.filter((widget) => widget.id !== id).map((widget) => widget.y + widget.h);
  const bottom = bottoms.length === 0 ? 0 : Math.max(...bottoms);
  return Math.min(DASH_MAX_ROWS - h, bottom);
}

/** 옮기거나 크기를 바꾼 결과 */
export interface LayoutChange {
  /** 바뀐 판 */
  readonly widgets: readonly DashboardWidget[];
  /** 실제로 바뀌었나(끝에 닿아 그대로면 false) */
  readonly changed: boolean;
  /** 움직인 위젯의 새 자리 */
  readonly rect: WidgetRect;
}

function apply(widgets: readonly DashboardWidget[], id: string, rect: WidgetRect): LayoutChange {
  const target = widgets.find((widget) => widget.id === id);
  if (target === undefined) {
    return { widgets, changed: false, rect: { x: 0, y: 0, w: 0, h: 0 } };
  }
  const next = clampRect(rect, target.kind);
  const bounded = { ...next, y: Math.min(next.y, Math.max(0, maxYFor(widgets, id, next.h))) };
  const changed = bounded.x !== target.x || bounded.y !== target.y || bounded.w !== target.w || bounded.h !== target.h;
  if (!changed) {
    return { widgets, changed: false, rect: { x: target.x, y: target.y, w: target.w, h: target.h } };
  }
  const moved = widgets.map((widget) => (widget.id === id ? { ...widget, ...bounded } : widget));
  return { widgets: resolveCollisions(moved, id), changed: true, rect: bounded };
}

/** 위젯을 그 자리로 옮긴다(끌어 놓기) */
export function placeWidget(widgets: readonly DashboardWidget[], id: string, x: number, y: number): LayoutChange {
  const target = widgets.find((widget) => widget.id === id);
  if (target === undefined) {
    return { widgets, changed: false, rect: { x: 0, y: 0, w: 0, h: 0 } };
  }
  return apply(widgets, id, { x, y, w: target.w, h: target.h });
}

/** 위젯을 칸 수만큼 옮긴다(방향키) */
export function moveWidget(widgets: readonly DashboardWidget[], id: string, dx: number, dy: number): LayoutChange {
  const target = widgets.find((widget) => widget.id === id);
  if (target === undefined) {
    return { widgets, changed: false, rect: { x: 0, y: 0, w: 0, h: 0 } };
  }
  return apply(widgets, id, { x: target.x + dx, y: target.y + dy, w: target.w, h: target.h });
}

/** 위젯 크기를 칸 수만큼 바꾼다(Shift+방향키) */
export function resizeWidget(widgets: readonly DashboardWidget[], id: string, dw: number, dh: number): LayoutChange {
  const target = widgets.find((widget) => widget.id === id);
  if (target === undefined) {
    return { widgets, changed: false, rect: { x: 0, y: 0, w: 0, h: 0 } };
  }
  return apply(widgets, id, { x: target.x, y: target.y, w: target.w + dw, h: target.h + dh });
}

/** 위젯 크기를 그 값으로 정한다(모서리 끌기 — 끌기 시작 때 크기에 움직인 칸 수를 더해 넘긴다) */
export function sizeWidget(widgets: readonly DashboardWidget[], id: string, w: number, h: number): LayoutChange {
  const target = widgets.find((widget) => widget.id === id);
  if (target === undefined) {
    return { widgets, changed: false, rect: { x: 0, y: 0, w: 0, h: 0 } };
  }
  return apply(widgets, id, { x: target.x, y: target.y, w, h });
}

/** 새 위젯이 들어갈 빈 자리를 찾는다(위에서부터 왼쪽부터). 자리가 없으면 맨 아래 줄. */
export function findFreeSpot(widgets: readonly DashboardWidget[], w: number, h: number): { x: number; y: number } {
  const width = clampNumber(w, 1, DASH_COLUMNS);
  const height = clampNumber(h, 1, DASH_MAX_ROWS);
  const bottoms = widgets.map((widget) => widget.y + widget.h);
  const limit = Math.min(DASH_MAX_ROWS - height, bottoms.length === 0 ? 0 : Math.max(...bottoms));
  for (let y = 0; y <= limit; y += 1) {
    for (let x = 0; x <= DASH_COLUMNS - width; x += 1) {
      const candidate = { x, y, w: width, h: height };
      if (!widgets.some((widget) => overlaps(candidate, widget))) {
        return { x, y };
      }
    }
  }
  const bottom = bottoms.length === 0 ? 0 : Math.max(...bottoms);
  return { x: 0, y: Math.min(bottom, DASH_MAX_ROWS - height) };
}

/** 판에서 쓰는 줄 수(격자 높이) */
export function rowCount(widgets: readonly DashboardWidget[]): number {
  const bottoms = widgets.map((widget) => widget.y + widget.h);
  return bottoms.length === 0 ? 1 : Math.max(...bottoms);
}
