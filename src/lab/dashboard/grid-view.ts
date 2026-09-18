/**
 * 위젯 판 화면(P4-07) — 위젯을 격자에 그리고, **끌어서도 키보드로도** 옮기고 크기를 바꾼다.
 *
 * 접근성(SPEC §2·§9)
 * - 위젯 손잡이와 크기 단추는 **진짜 단추**라 Tab으로 갈 수 있다. 방향키로 옮기고 Shift+방향키로 크기를 바꾼다.
 * - 옮긴 결과는 `aria-live` 칸에 한국어로 알린다(화면을 못 보는 학생도 어디로 갔는지 안다).
 * - 끌기는 포인터 이벤트 하나로 마우스·손가락·펜을 함께 받는다(`setPointerCapture`).
 * - 움직임 줄이기: 자리를 옮기는 애니메이션이 없다. 바뀐 자리를 바로 그린다(CSS 전환 시간은 `--duration-*` 토큰이라
 *   `tokens.css`의 움직임 줄이기에서 0ms가 된다).
 *
 * 배치는 바뀔 때마다 이 브라우저에 저장한다(`store.ts`). 저장이 막혀 있으면 한 번만 알린다.
 */
import type { StorageSource } from '../../lib/storage.ts';
import { DASH_COLUMNS, DASH_MAX_WIDGETS, defaultBoard, kindInfo, kindLabel, newWidgetSpec, nextWidgetId } from './defaults.ts';
import { findFreeSpot, moveWidget, placeWidget, resizeWidget, resolveCollisions, rowCount, sizeWidget, sortForReading } from './layout.ts';
import { dashText } from './messages.ts';
import { readBoard, sanitizeWidget, writeBoard } from './store.ts';
import type { DashboardBoard, DashboardWidget, SourceMessage, WidgetKind, WidgetSpec } from './types.ts';
import { createWidgetView, type WidgetView } from './widgets.ts';

export interface DashboardViewOptions {
  /** 위젯이 들어갈 격자 요소 */
  readonly grid: HTMLElement;
  /** 낭독기에 알리는 칸(aria-live) */
  readonly announce?: HTMLElement | null;
  /** 손잡이 설명 글의 id(키보드 안내) */
  readonly helpId: string;
  /** 저장 공간(테스트가 가짜를 넣는다) */
  readonly storage?: StorageSource;
  /** 스위치를 눌렀다 — 페이지가 통로로 보낸다 */
  onToggle?(spec: WidgetSpec, on: boolean): void;
  /** 화면 아래 안내 줄에 적을 글 */
  onStatus?(text: string): void;
}

interface DragState {
  readonly id: string;
  readonly kind: 'move' | 'resize';
  readonly startX: number;
  readonly startY: number;
  readonly stepX: number;
  readonly stepY: number;
  readonly origin: { x: number; y: number; w: number; h: number };
  readonly target: HTMLElement;
  readonly pointerId: number;
}

export class DashboardView {
  readonly #options: DashboardViewOptions;
  readonly #views = new Map<string, WidgetView>();
  #board: DashboardBoard;
  #drag: DragState | null = null;
  /** 저장이 막혀 배치를 기억하지 못했나 */
  #storageBlocked = false;
  /** 그 사실을 학생에게 한 번 알렸나 */
  #storageWarned = false;

  constructor(options: DashboardViewOptions) {
    this.#options = options;
    this.#board = readBoard(options.storage);
    this.#options.grid.style.setProperty('--dash-cols', String(DASH_COLUMNS));
    this.render();
  }

  get board(): DashboardBoard {
    return this.#board;
  }

  /** 지금 판을 그린다(없던 위젯은 만들고, 사라진 위젯은 버린다) */
  render(): void {
    const widgets = sortForReading(this.#board.widgets);
    const alive = new Set(widgets.map((widget) => widget.id));
    for (const [id, view] of [...this.#views]) {
      if (!alive.has(id)) {
        view.dispose();
        this.#views.delete(id);
      }
    }
    // 읽는 순서대로 놓는다(좁은 화면에서는 DOM 순서가 곧 보이는 순서다).
    // **자리가 맞는 위젯은 건드리지 않는다**: 이미 붙어 있는 요소를 다시 append하면 브라우저가 그 요소를 뺐다가 넣어서
    // 안에 있던 초점(키보드로 옮기던 손잡이)과 포인터 잡기(끌던 중)가 풀린다(2026-09-18 브라우저 테스트에서 찾음).
    const active = document.activeElement;
    widgets.forEach((widget, index) => {
      let view = this.#views.get(widget.id);
      if (view === undefined) {
        view = createWidgetView(widget, this.#handlers(), this.#options.helpId);
        this.#views.set(widget.id, view);
      } else {
        view.update(widget);
      }
      const current = this.#options.grid.children[index];
      if (current !== view.element) {
        this.#options.grid.insertBefore(view.element, current ?? null);
      }
    });
    // 순서가 정말 바뀌어 초점이 풀렸으면 되돌려 준다(방향키로 계속 옮길 수 있게).
    if (active instanceof HTMLElement && document.activeElement !== active && this.#options.grid.contains(active)) {
      active.focus({ preventScroll: true });
    }
    this.#options.grid.style.setProperty('--dash-rows', String(rowCount(widgets)));
    this.#options.grid.dataset.dashCount = String(widgets.length);
  }

  #handlers() {
    return {
      onChange: (spec: WidgetSpec): void => this.updateWidget(spec),
      onRemove: (id: string): void => this.removeWidget(id),
      onToggle: (spec: WidgetSpec, on: boolean): void => {
        this.#options.onToggle?.(spec, on);
      },
      onGrabKey: (id: string, event: KeyboardEvent): boolean => this.#onKey(id, event),
      onGrabPointer: (id: string, event: PointerEvent): void => this.#startDrag(id, event, 'move'),
      onResizePointer: (id: string, event: PointerEvent): void => this.#startDrag(id, event, 'resize'),
    };
  }

  /** 판을 바꾸고 저장한다 */
  #setBoard(widgets: readonly DashboardWidget[]): void {
    this.#board = { version: this.#board.version, widgets };
    this.render();
    if (!writeBoard(this.#board, this.#options.storage)) {
      this.#storageBlocked = true;
    }
  }

  /**
   * 화면 아래 안내 줄과 낭독기 칸에 같은 글을 적는다.
   * 저장이 막힌 브라우저라면 **그 사실을 한 번 덧붙인다**(따로 적으면 바로 다음 안내가 덮어써서 아무도 못 본다).
   */
  #status(text: string): void {
    let full = text;
    if (this.#storageBlocked && !this.#storageWarned) {
      this.#storageWarned = true;
      full = text === '' ? dashText.storageBlocked() : `${text} ${dashText.storageBlocked()}`;
    }
    this.#options.onStatus?.(full);
    const box = this.#options.announce;
    if (box !== null && box !== undefined) {
      box.textContent = full;
    }
  }

  /** 설정(제목·토픽·눈금)을 바꾼다 */
  updateWidget(spec: WidgetSpec): void {
    const current = this.#board.widgets.find((widget) => widget.id === spec.id);
    if (current === undefined) {
      return;
    }
    const merged = sanitizeWidget({ ...current, ...spec });
    if (merged === null) {
      return;
    }
    this.#setBoard(this.#board.widgets.map((widget) => (widget.id === merged.id ? merged : widget)));
  }

  /** 새 위젯을 더한다(빈 자리에 놓는다) */
  addWidget(kind: WidgetKind): boolean {
    if (this.#board.widgets.length >= DASH_MAX_WIDGETS) {
      this.#status(`위젯은 ${DASH_MAX_WIDGETS}개까지 둘 수 있어요. 쓰지 않는 위젯을 지우고 더해요.`);
      return false;
    }
    const info = kindInfo(kind);
    if (info === null) {
      return false;
    }
    const id = nextWidgetId(this.#board, kind);
    const spot = findFreeSpot(this.#board.widgets, info.defaultW, info.defaultH);
    const widget: DashboardWidget = { ...newWidgetSpec(kind, id), ...spot, w: info.defaultW, h: info.defaultH };
    this.#setBoard(resolveCollisions([...this.#board.widgets, widget], id));
    this.#status(dashText.added(kindLabel(kind)));
    this.#views.get(id)?.element.querySelector<HTMLElement>('[data-dash-grab]')?.focus();
    return true;
  }

  /** 위젯을 지운다 */
  removeWidget(id: string): void {
    const target = this.#board.widgets.find((widget) => widget.id === id);
    if (target === undefined) {
      return;
    }
    this.#setBoard(this.#board.widgets.filter((widget) => widget.id !== id));
    this.#status(dashText.removed(target.title));
  }

  /** 배치를 처음 모습으로 */
  resetLayout(): void {
    this.#setBoard(defaultBoard().widgets);
    this.#status(dashText.reset());
  }

  /** 저장된 값을 다시 읽어 그린다([기록 지우기] 뒤) */
  reload(): void {
    this.#board = readBoard(this.#options.storage);
    for (const view of this.#views.values()) {
      view.dispose();
    }
    this.#views.clear();
    this.render();
  }

  /** 메시지를 위젯들에 넘긴다. 받아 간 위젯 수를 돌려준다. */
  receive(message: SourceMessage): number {
    let taken = 0;
    for (const view of this.#views.values()) {
      if (view.receive(message)) {
        taken += 1;
      }
    }
    return taken;
  }

  /** 모든 위젯의 값 기억을 비운다(새 실습을 시작할 때) */
  clearValues(): void {
    for (const view of this.#views.values()) {
      view.clear();
    }
  }

  /** 창 크기가 바뀌었을 때 그래프를 다시 그린다 */
  redraw(): void {
    for (const view of this.#views.values()) {
      view.redraw();
    }
  }

  // ── 키보드 ───────────────────────────────────────────────────────────────
  #onKey(id: string, event: KeyboardEvent): boolean {
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = deltas[event.key];
    if (delta === undefined || event.altKey || event.ctrlKey || event.metaKey) {
      return false;
    }
    const widget = this.#board.widgets.find((item) => item.id === id);
    if (widget === undefined) {
      return false;
    }
    const [dx, dy] = delta;
    const change = event.shiftKey ? resizeWidget(this.#board.widgets, id, dx, dy) : moveWidget(this.#board.widgets, id, dx, dy);
    if (!change.changed) {
      this.#status(dashText.edge());
      return true;
    }
    this.#setBoard(change.widgets);
    this.#status(event.shiftKey ? dashText.resized(widget.title, change.rect.w, change.rect.h) : dashText.moved(widget.title, change.rect.x, change.rect.y));
    // 다시 그린 뒤에도 같은 단추에 초점이 남게 한다(요소를 그대로 쓰므로 초점은 유지된다).
    return true;
  }

  // ── 끌기 ─────────────────────────────────────────────────────────────────
  #startDrag(id: string, event: PointerEvent, kind: 'move' | 'resize'): void {
    if (event.button !== 0 && event.pointerType === 'mouse') {
      return;
    }
    const widget = this.#board.widgets.find((item) => item.id === id);
    const view = this.#views.get(id);
    if (widget === undefined || view === undefined) {
      return;
    }
    const rect = view.element.getBoundingClientRect();
    const style = globalThis.getComputedStyle(this.#options.grid);
    const columnGap = Number.parseFloat(style.columnGap) || 0;
    const rowGap = Number.parseFloat(style.rowGap) || 0;
    const stepX = (rect.width + columnGap) / Math.max(1, widget.w);
    const stepY = (rect.height + rowGap) / Math.max(1, widget.h);
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : view.element;
    this.#drag = {
      id,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      stepX: stepX > 1 ? stepX : 1,
      stepY: stepY > 1 ? stepY : 1,
      origin: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
      target,
      pointerId: event.pointerId,
    };
    view.element.dataset.dashDragging = 'true';
    try {
      // 손가락으로 끌 때 화면이 함께 스크롤되지 않게 포인터를 잡아 둔다.
      target.setPointerCapture(event.pointerId);
    } catch {
      // 포인터를 잡지 못해도(옛 브라우저) 아래 창 이벤트로 따라간다.
    }
    // **듣는 자리는 창(window)이다.** 끌고 가는 동안 위젯 차례가 바뀌면 그 요소가 DOM에서 잠깐 빠졌다 들어가는데,
    // 그때 포인터 잡기가 풀려서 요소에 건 듣기로는 나머지 움직임과 손 뗌을 놓친다(2026-09-18 브라우저 테스트에서 찾음).
    globalThis.addEventListener('pointermove', this.#onPointerMove);
    globalThis.addEventListener('pointerup', this.#onPointerUp);
    globalThis.addEventListener('pointercancel', this.#onPointerUp);
    event.preventDefault();
  }

  readonly #onPointerMove = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (drag === null || event.pointerId !== drag.pointerId) {
      return;
    }
    const dx = Math.round((event.clientX - drag.startX) / drag.stepX);
    const dy = Math.round((event.clientY - drag.startY) / drag.stepY);
    const change =
      drag.kind === 'move'
        ? placeWidget(this.#board.widgets, drag.id, drag.origin.x + dx, drag.origin.y + dy)
        : sizeWidget(this.#board.widgets, drag.id, drag.origin.w + dx, drag.origin.h + dy);
    if (!change.changed) {
      return;
    }
    this.#board = { version: this.#board.version, widgets: change.widgets };
    this.render();
  };

  readonly #onPointerUp = (event: PointerEvent): void => {
    const drag = this.#drag;
    if (drag === null || event.pointerId !== drag.pointerId) {
      return;
    }
    globalThis.removeEventListener('pointermove', this.#onPointerMove);
    globalThis.removeEventListener('pointerup', this.#onPointerUp);
    globalThis.removeEventListener('pointercancel', this.#onPointerUp);
    try {
      drag.target.releasePointerCapture(drag.pointerId);
    } catch {
      // 이미 놓였으면 그만
    }
    const view = this.#views.get(drag.id);
    if (view !== undefined) {
      delete view.element.dataset.dashDragging;
    }
    this.#drag = null;
    const widget = this.#board.widgets.find((item) => item.id === drag.id);
    this.#setBoard(this.#board.widgets);
    if (widget !== undefined) {
      this.#status(drag.kind === 'move' ? dashText.moved(widget.title, widget.x, widget.y) : dashText.resized(widget.title, widget.w, widget.h));
    }
  };

  dispose(): void {
    // 끌던 중에 화면을 떠나도 창에 건 듣기를 남기지 않는다.
    globalThis.removeEventListener('pointermove', this.#onPointerMove);
    globalThis.removeEventListener('pointerup', this.#onPointerUp);
    globalThis.removeEventListener('pointercancel', this.#onPointerUp);
    this.#drag = null;
    for (const view of this.#views.values()) {
      view.dispose();
    }
    this.#views.clear();
  }
}
