// 대시보드 격자 배치 규칙(P4-07) — 구역 D 2차.
// 지키는 것: ① 위젯은 겹치지 않는다(밀린 쪽이 아래로) ② 판 밖으로 나가지 않는다 ③ 가장 작은 크기보다 작아지지 않는다
// ④ **키보드(방향키)와 끌어 놓기가 같은 함수를 쓴다** — 두 길의 결과가 같아야 접근성이 말뿐이 아니게 된다.
import { describe, expect, it } from 'vitest';
import { DASH_COLUMNS, defaultBoard, kindInfo } from '../../../src/lab/dashboard/defaults.ts';
import {
  clampRect,
  findFreeSpot,
  maxYFor,
  moveWidget,
  overlaps,
  placeWidget,
  resizeWidget,
  resolveCollisions,
  rowCount,
  sizeWidget,
  sortForReading,
} from '../../../src/lab/dashboard/layout.ts';
import type { DashboardWidget } from '../../../src/lab/dashboard/types.ts';

function widgets(): DashboardWidget[] {
  return [...defaultBoard().widgets];
}

function at(list: readonly DashboardWidget[], id: string): DashboardWidget {
  const found = list.find((widget) => widget.id === id);
  expect(found, `${id} 위젯이 있어야 해요`).toBeDefined();
  return found as DashboardWidget;
}

describe('겹침 판정', () => {
  it('맞닿기만 하면 겹친 것이 아니다', () => {
    expect(overlaps({ x: 0, y: 0, w: 3, h: 3 }, { x: 3, y: 0, w: 3, h: 3 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, w: 3, h: 3 }, { x: 0, y: 3, w: 3, h: 3 })).toBe(false);
    expect(overlaps({ x: 0, y: 0, w: 3, h: 3 }, { x: 2, y: 2, w: 3, h: 3 })).toBe(true);
  });
});

describe('판 안으로 들여놓기', () => {
  it('가장 작은 크기와 판 너비를 지킨다', () => {
    const rect = clampRect({ x: 20, y: -4, w: 1, h: 1 }, 'chart');
    const info = kindInfo('chart');
    expect(rect.w).toBe(info?.minW);
    expect(rect.h).toBe(info?.minH);
    expect(rect.x).toBe(DASH_COLUMNS - rect.w);
    expect(rect.y).toBe(0);
  });

  it('너비가 판보다 크면 판 너비까지만 준다', () => {
    expect(clampRect({ x: 0, y: 0, w: 99, h: 3 }, 'log').w).toBe(DASH_COLUMNS);
  });
});

describe('겹침 풀기', () => {
  it('자리를 지키는 위젯 밑으로 밀린다', () => {
    const list: DashboardWidget[] = widgets().map((widget) => (widget.id === 'gauge-1' ? { ...widget, x: 0, y: 0 } : widget));
    const resolved = resolveCollisions(list, 'gauge-1');
    expect(at(resolved, 'gauge-1')).toMatchObject({ x: 0, y: 0 });
    // 같은 자리에 있던 그래프가 게이지 아래로 내려간다(위로 당겨 올리지는 않는다).
    expect(at(resolved, 'chart-1').y).toBeGreaterThanOrEqual(4);
    for (const a of resolved) {
      for (const b of resolved) {
        if (a.id !== b.id) {
          expect(overlaps(a, b), `${a.id}와 ${b.id}가 겹쳐요`).toBe(false);
        }
      }
    }
  });

  it('읽는 순서는 위 줄부터, 같은 줄이면 왼쪽부터다', () => {
    const sorted = sortForReading(widgets());
    expect(sorted.map((widget) => widget.id)).toEqual(['chart-1', 'gauge-1', 'switch-1', 'log-1']);
  });
});

describe('옮기기·크기 바꾸기', () => {
  it('방향키 한 번은 한 칸이다', () => {
    const change = moveWidget(widgets(), 'chart-1', 1, 0);
    expect(change.changed).toBe(true);
    expect(change.rect).toMatchObject({ x: 1, y: 0 });
  });

  it('왼쪽 끝에서 더 왼쪽으로 가면 바뀌지 않는다(화면이 "판의 끝"을 알릴 수 있게)', () => {
    const change = moveWidget(widgets(), 'chart-1', -1, 0);
    expect(change.changed).toBe(false);
    expect(change.rect).toMatchObject({ x: 0, y: 0 });
  });

  it('맨 아래 줄 다음까지만 내려간다', () => {
    const list = widgets();
    const limit = maxYFor(list, 'gauge-1', 4);
    const change = moveWidget(list, 'gauge-1', 0, 99);
    expect(change.rect.y).toBe(limit);
  });

  it('Shift+방향키로 크기를 바꾸면 가장 작은 크기보다 작아지지 않는다', () => {
    const info = kindInfo('gauge');
    const once = resizeWidget(widgets(), 'gauge-1', -1, 0);
    expect(once.rect.w).toBe(info?.minW);
    const twice = resizeWidget(once.widgets, 'gauge-1', -1, 0);
    expect(twice.changed).toBe(false);
    expect(twice.rect.w).toBe(info?.minW);
  });

  it('끌어 놓기(자리 지정)와 방향키(칸 더하기)가 같은 결과를 낸다', () => {
    const byKey = moveWidget(moveWidget(widgets(), 'switch-1', -1, 0).widgets, 'switch-1', -1, 0);
    const byDrag = placeWidget(widgets(), 'switch-1', 7, 0);
    expect(byKey.rect).toEqual(byDrag.rect);
    expect(sortForReading(byKey.widgets).map((widget) => `${widget.id}:${widget.x},${widget.y}`)).toEqual(
      sortForReading(byDrag.widgets).map((widget) => `${widget.id}:${widget.x},${widget.y}`),
    );
  });

  it('모서리 끌기(크기 지정)와 Shift+방향키가 같은 결과를 낸다', () => {
    const byKey = resizeWidget(resizeWidget(widgets(), 'chart-1', 1, 0).widgets, 'chart-1', 1, 0);
    const byDrag = sizeWidget(widgets(), 'chart-1', 8, 4);
    expect(byKey.rect).toEqual(byDrag.rect);
  });
});

describe('새 위젯 자리 찾기', () => {
  it('빈 자리를 위에서부터 찾는다', () => {
    const list = widgets().filter((widget) => widget.id !== 'switch-1');
    expect(findFreeSpot(list, 3, 4)).toEqual({ x: 9, y: 0 });
  });

  it('빈 자리가 없으면 맨 아래 줄에 놓는다', () => {
    const list = widgets();
    expect(findFreeSpot(list, 12, 3)).toEqual({ x: 0, y: rowCount(list) });
  });
});
