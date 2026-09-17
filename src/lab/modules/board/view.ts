/**
 * 가상 보드 화면(DOM) — 보드 그림·부품·핀 표를 그리고 입력 부품의 마우스·터치·키보드 조작을 공통으로 처리한다(PLAN §8.3 P3-01).
 * HTML 틀은 src/components/lab/BoardIo.astro(ESP32 실습실 io 슬롯), 상태 모양은 state.ts, 부품은 parts/<부품>/part.ts.
 *
 * 테스트가 읽는 값
 *   [data-board-stage]의 data-board-phase(stopped·run·idle·end)
 *   부품 [data-board-part="<배선 id>"]: data-part(부품 id), data-visual-<이름>(부품 visual 값), 입력 부품은 aria-pressed
 *   핀 표 행 [data-board-pin="<GPIO>"]: data-mode·data-level(0|1)·data-driven(true|false)
 *
 * 접근성: 입력 부품은 role="button"·tabindex=0·aria-pressed이고 Space·Enter를 누르고 있는 동안 눌린다(초점을 잃으면 뗀다).
 * 출력 부품은 role="img"와 상태가 든 이름(예: "내장 LED(GPIO2): 켜짐")을 갖는다. 핀 값은 표에 글자(1 (HIGH))로도 있다 — 색만으로 알리지 않는다.
 * 보드 그림은 사이트가 직접 그린 브랜드 중립 도형이다(P3-02가 핀 머리·배선도를 더한다).
 */
import type { PartDefinition, PartInstance, PartVisual } from './part-types.ts';
import { partsByGpio } from './parts.ts';
import { levelText, modeText, phaseText, type BoardSnapshot } from './state.ts';
import { svgElement } from './svg.ts';

export interface BoardViewElements {
  /** 그림이 들어갈 자리 */
  readonly stage: HTMLElement;
  readonly pinRows: HTMLElement | null;
  readonly pinsEmpty: HTMLElement | null;
  readonly phaseText: HTMLElement | null;
  readonly problems: HTMLElement | null;
}

export interface BoardViewOptions {
  readonly definitions: ReadonlyMap<string, PartDefinition>;
  /** 입력 부품의 눌림이 바뀔 때(눌린 배선 id 모음) */
  onActiveChange(activeIds: ReadonlySet<string>): void;
  readonly reducedMotion?: () => boolean;
}

export interface BoardView {
  setWiring(instances: readonly PartInstance[], problems: readonly string[]): void;
  update(snapshot: BoardSnapshot): void;
  readonly activeIds: ReadonlySet<string>;
  destroy(): void;
}

/** 보드 그림 크기(SVG 단위) */
export const BOARD_WIDTH = 330;
export const BOARD_HEIGHT = 214;
/** 보드에 붙은 부품의 자리(부품 그림 왼쪽 위) */
export const ONBOARD_ANCHORS: Readonly<Record<string, { readonly x: number; readonly y: number }>> = Object.freeze({
  'builtin-led': { x: 40, y: 46 },
  'boot-button': { x: 40, y: 110 },
});
/** 바깥 부품을 놓는 칸 */
const EXTERNAL_COLUMN_X = BOARD_WIDTH + 16;
const EXTERNAL_GAP = 14;

function reducedMotionDefault(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 브랜드 중립 개발 보드 그림(PCB·금속 모듈·USB·핀 머리) */
function drawBoard(): SVGGElement {
  const group = svgElement('g', { class: 'board-drawing', 'aria-hidden': 'true' });
  group.append(
    svgElement('rect', { x: 8, y: 22, width: 314, height: 170, rx: 10, fill: '#1f3b4d', stroke: '#0f2230', 'stroke-width': 2 }),
    // USB 단자(왼쪽 끝)
    svgElement('rect', { x: 0, y: 92, width: 30, height: 30, rx: 3, fill: '#c3c9d1', stroke: '#6b7480', 'stroke-width': 1.2 }),
    svgElement('rect', { x: 4, y: 100, width: 16, height: 14, rx: 2, fill: '#8a939f' }),
    // 금속 덮개 모듈(오른쪽)
    svgElement('rect', { x: 150, y: 48, width: 150, height: 118, rx: 5, fill: '#cfd5dc', stroke: '#8a939f', 'stroke-width': 1.5 }),
    svgElement('text', { x: 225, y: 104, 'text-anchor': 'middle', class: 'board-drawing__module' }, ['ESP32']),
    svgElement('text', { x: 225, y: 124, 'text-anchor': 'middle', class: 'board-drawing__caption' }, ['가상 보드']),
  );
  // 핀 머리(위·아래 두 줄)
  for (let index = 0; index < 19; index += 1) {
    const x = 18 + index * 16;
    group.append(
      svgElement('rect', { x, y: 27, width: 9, height: 9, rx: 1.5, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 }),
      svgElement('rect', { x, y: 178, width: 9, height: 9, rx: 1.5, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 }),
    );
  }
  return group;
}

function visualChanged(before: PartVisual | undefined, after: PartVisual): boolean {
  if (!before) {
    return true;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (before[key] !== after[key]) {
      return true;
    }
  }
  return false;
}

function visualSummary(definition: PartDefinition, instance: PartInstance, visual: PartVisual): string {
  const pins = Object.values(instance.pins)
    .map((gpio) => `GPIO${gpio}`)
    .join('·');
  const state = typeof visual.lit === 'boolean' ? (visual.lit ? '켜짐' : '꺼짐') : typeof visual.pressed === 'boolean' ? (visual.pressed ? '누름' : '뗌') : '';
  return `${instance.label}(${pins})${state ? `: ${state}` : ''} — ${definition.description}`;
}

interface MountedPart {
  readonly instance: PartInstance;
  readonly definition: PartDefinition;
  readonly element: SVGGElement;
  readonly apply: (visual: PartVisual) => void;
  visual: PartVisual | undefined;
  cleanup: (() => void)[];
}

export function createBoardView(elements: BoardViewElements, options: BoardViewOptions): BoardView {
  const { stage } = elements;
  const reducedMotion = options.reducedMotion ?? reducedMotionDefault;
  const active = new Set<string>();
  let mounted: MountedPart[] = [];
  let instances: readonly PartInstance[] = [];
  let snapshot: BoardSnapshot | null = null;
  let lastPinsHtml = '';

  const svg = svgElement('svg', {
    class: 'board-stage__svg',
    viewBox: `0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`,
    role: 'group',
    'aria-label': '가상 ESP32 보드',
    focusable: 'false',
  });
  const partsLayer = svgElement('g', { class: 'board-parts' });
  svg.append(drawBoard(), partsLayer);
  stage.replaceChildren(svg);

  const notify = () => options.onActiveChange(new Set(active));

  const mountPart = (instance: PartInstance, position: { x: number; y: number }): MountedPart | null => {
    const definition = options.definitions.get(instance.part);
    if (!definition) {
      return null;
    }
    const element = svgElement('g', {
      class: `board-part board-part--${definition.id}`,
      transform: `translate(${position.x} ${position.y})`,
      'data-board-part': instance.id,
      'data-part': definition.id,
    });
    const apply = definition.render(element, { instance, definition, svg: svgElement });
    const part: MountedPart = { instance, definition, element, apply, visual: undefined, cleanup: [] };
    const interaction = definition.interaction;
    if (interaction) {
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      element.setAttribute('aria-pressed', 'false');
      element.classList.add('board-part--interactive');
      const id = instance.id;
      const listen = <K extends keyof SVGElementEventMap>(type: K, handler: (event: SVGElementEventMap[K]) => void) => {
        element.addEventListener(type, handler);
        part.cleanup.push(() => element.removeEventListener(type, handler));
      };
      const press = () => {
        if (!active.has(id)) {
          active.add(id);
          notify();
        }
      };
      const release = () => {
        if (active.delete(id)) {
          notify();
        }
      };
      const toggle = () => {
        if (active.has(id)) {
          active.delete(id);
        } else {
          active.add(id);
        }
        notify();
      };
      listen('pointerdown', (event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        element.focus({ preventScroll: true });
        if (interaction.kind === 'toggle') {
          toggle();
          return;
        }
        try {
          element.setPointerCapture(event.pointerId);
        } catch {
          // 포인터 붙잡기를 못 해도 pointerup·pointerleave로 뗀다.
        }
        press();
      });
      if (interaction.kind === 'momentary') {
        listen('pointerup', release);
        listen('pointercancel', release);
        listen('lostpointercapture', release);
        listen('blur', release);
      }
      listen('keydown', (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') {
          return;
        }
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        if (interaction.kind === 'toggle') {
          toggle();
        } else {
          press();
        }
      });
      if (interaction.kind === 'momentary') {
        listen('keyup', (event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            release();
          }
        });
      }
    } else {
      element.setAttribute('role', 'img');
    }
    partsLayer.append(element);
    return part;
  };

  const renderPins = (current: BoardSnapshot) => {
    const { pinRows, pinsEmpty } = elements;
    if (!pinRows) {
      return;
    }
    const connected = partsByGpio(instances, options.definitions);
    const pins = [...current.pins.values()].sort((a, b) => a.id - b.id);
    const key = JSON.stringify([current.phase, pins, [...connected.entries()]]);
    if (key === lastPinsHtml) {
      return;
    }
    lastPinsHtml = key;
    const rows = pins.map((pin) => {
      const row = document.createElement('tr');
      row.dataset.boardPin = String(pin.id);
      row.dataset.mode = pin.mode ?? '';
      row.dataset.level = String(pin.level);
      row.dataset.driven = String(pin.driven);
      const name = document.createElement('th');
      name.scope = 'row';
      name.textContent = `GPIO${pin.id}`;
      const mode = document.createElement('td');
      mode.textContent = modeText(pin) + (pin.irq ? ' · 인터럽트' : '');
      const level = document.createElement('td');
      const dot = document.createElement('span');
      dot.className = `board-pins__dot board-pins__dot--${pin.level === 1 ? 'high' : 'low'}`;
      dot.setAttribute('aria-hidden', 'true');
      level.append(dot, levelText(pin.level));
      const parts = document.createElement('td');
      parts.textContent = (connected.get(pin.id) ?? []).join(', ') || '—';
      row.append(name, mode, level, parts);
      return row;
    });
    pinRows.replaceChildren(...rows);
    if (pinsEmpty) {
      pinsEmpty.hidden = rows.length > 0;
    }
  };

  const view: BoardView = {
    get activeIds() {
      return active;
    },
    setWiring(nextInstances, problems) {
      for (const part of mounted) {
        for (const cleanup of part.cleanup.splice(0)) {
          cleanup();
        }
        part.element.remove();
      }
      mounted = [];
      instances = nextInstances;
      for (const id of [...active]) {
        if (!nextInstances.some((instance) => instance.id === id)) {
          active.delete(id);
        }
      }
      let externalY = 24;
      let width = BOARD_WIDTH;
      for (const instance of nextInstances) {
        const definition = options.definitions.get(instance.part);
        if (!definition) {
          continue;
        }
        const anchor = definition.onboard ? ONBOARD_ANCHORS[definition.id] : undefined;
        const position = anchor ?? { x: EXTERNAL_COLUMN_X, y: externalY };
        if (!anchor) {
          externalY += definition.size.height + EXTERNAL_GAP;
          width = Math.max(width, EXTERNAL_COLUMN_X + definition.size.width + 8);
        }
        const part = mountPart(instance, position);
        if (part) {
          mounted.push(part);
        }
      }
      svg.setAttribute('viewBox', `0 0 ${width} ${Math.max(BOARD_HEIGHT, externalY)}`);
      if (elements.problems) {
        elements.problems.replaceChildren(
          ...problems.map((problem) => {
            const item = document.createElement('li');
            item.textContent = problem;
            return item;
          }),
        );
        elements.problems.hidden = problems.length === 0;
      }
      lastPinsHtml = '';
      if (snapshot) {
        view.update(snapshot);
      }
    },
    update(next) {
      snapshot = next;
      stage.dataset.boardPhase = next.phase;
      if (elements.phaseText) {
        const text = phaseText(next);
        if (elements.phaseText.textContent !== text) {
          elements.phaseText.textContent = text;
        }
      }
      for (const part of mounted) {
        const isActive = active.has(part.instance.id);
        if (part.definition.interaction) {
          part.element.setAttribute('aria-pressed', String(isActive));
        }
        const visual = part.definition.visual({ snapshot: next, instance: part.instance, active: isActive, reducedMotion: reducedMotion() });
        if (!visualChanged(part.visual, visual)) {
          continue;
        }
        part.visual = visual;
        part.apply(visual);
        for (const [name, value] of Object.entries(visual)) {
          part.element.setAttribute(`data-visual-${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`, String(value));
        }
        const pins = Object.values(part.instance.pins)
          .map((gpio) => `GPIO${gpio}`)
          .join('·');
        if (part.definition.interaction) {
          const how = part.definition.interaction.kind === 'toggle' ? '누를 때마다 켜짐과 꺼짐이 바뀌어요' : '누르고 있는 동안 눌려요';
          part.element.setAttribute('aria-label', `${part.definition.interaction.label}(${pins}) — ${how}`);
        } else {
          part.element.setAttribute('aria-label', visualSummary(part.definition, part.instance, visual));
        }
      }
      renderPins(next);
    },
    destroy() {
      for (const part of mounted) {
        for (const cleanup of part.cleanup.splice(0)) {
          cleanup();
        }
      }
      mounted = [];
      svg.remove();
    },
  };
  return view;
}
