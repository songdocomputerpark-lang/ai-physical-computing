/**
 * 가상 보드 그림의 DOM(PLAN §8.3 P3-02) — 보드 기판·핀 머리·핀 이름·스트래핑 핀 표시를 한 번 그리고, 배선 계획(layout.ts planBoardDrawing)대로
 * 브레드보드·레일·선을 다시 그리며, 핀 상태(board.state)에 맞춰 핀 머리를 강조한다. 부품 그림은 view.ts가 partsLayer에 붙인다.
 *
 * 모두 사이트가 직접 그린 도형이다(브랜드 이름·로고·다른 저작물 그림 없음 — PLAN §9, SPEC §8).
 * 테스트가 읽는 값
 *   핀 머리 [data-board-header="top-2"]: data-label, data-gpio(있으면), data-used(true|false), data-level(0|1), data-high(true|false), data-wired(true|false)
 *   선 [data-board-wire="signal:<배선 id>:<role>"|"power:gnd"|…]: data-kind(signal|gnd|vcc), data-gpio(신호선)
 *   브레드보드 [data-board-breadboard]
 * 색만으로 알리지 않는다: 쓰는 핀은 흰 고리, 1(HIGH)인 핀은 노란 빛(+ 고리), 핀 이름·상태는 마우스를 올리면 나오는 설명(<title>)과 핀 표 글자에도 있다.
 */
import type { BoardDrawingPlan, HeaderPin } from './layout.ts';
import { HEADER_BOTTOM_LABEL_Y, HEADER_PINS, HEADER_TOP_LABEL_Y, MODULE_BOX, PCB, USB_BOX } from './layout.ts';
import { isLive, levelText, modeText, type BoardSnapshot } from './state.ts';
import { svgElement } from './svg.ts';

export interface HeaderPinView {
  readonly pin: HeaderPin;
  readonly group: SVGGElement;
  readonly title: SVGTitleElement;
  readonly pad: SVGRectElement;
  readonly ring: SVGCircleElement;
  readonly glow: SVGCircleElement;
}

export interface BoardDrawing {
  readonly svg: SVGSVGElement;
  /** 부품 그림을 붙이는 층(보드·선 위) */
  readonly partsLayer: SVGGElement;
  /** 배선 계획대로 브레드보드·선을 다시 그리고 보기 영역을 맞춘다(바깥 부품 신호선이 닿은 핀 머리에 data-wired) */
  applyPlan(plan: BoardDrawingPlan): void;
  /** 핀 머리 강조와 설명을 핀 상태에 맞춘다. connected = GPIO → 이어진 부품 이름 */
  updatePins(snapshot: BoardSnapshot, connected: ReadonlyMap<number, readonly string[]>): void;
  readonly headerPins: readonly HeaderPinView[];
}

let drawingCount = 0;

/** 스트래핑 핀 표시(▲)의 경로. (x, y)는 삼각형 위 꼭짓점 */
export function strappingMarkPath(x: number, y: number): string {
  return `M ${x} ${y} L ${x + 4} ${y + 6.5} L ${x - 4} ${y + 6.5} Z`;
}

function drawStaticBoard(): SVGGElement {
  const group = svgElement('g', { class: 'board-drawing', 'aria-hidden': 'true' });
  const right = PCB.x + PCB.width;
  group.append(
    // USB 단자(기판 왼쪽 밖으로 나옴)
    svgElement('rect', { x: USB_BOX.x, y: USB_BOX.y, width: USB_BOX.width, height: USB_BOX.height, rx: 3, fill: '#c3c9d1', stroke: '#6b7480', 'stroke-width': 1.2 }),
    svgElement('rect', { x: PCB.x, y: PCB.y, width: PCB.width, height: PCB.height, rx: 10, fill: '#1f3b4d', stroke: '#0f2230', 'stroke-width': 2 }),
    svgElement('rect', { x: USB_BOX.x + 4, y: USB_BOX.y + 9, width: 18, height: 16, rx: 2, fill: '#8a939f' }),
    svgElement('text', { x: USB_BOX.x + USB_BOX.width + 12, y: USB_BOX.y + USB_BOX.height / 2 + 3, class: 'board-drawing__small' }, ['USB']),
    // EN(리셋) 버튼 — 그림만(가상 보드의 리셋은 [정지] 뒤 [실행])
    svgElement('rect', { x: 58, y: 46, width: 20, height: 16, rx: 2.5, fill: '#d5dbe3', stroke: '#4a5361', 'stroke-width': 1 }),
    svgElement('circle', { cx: 68, cy: 54, r: 5, fill: '#2b2f36' }),
    svgElement('text', { x: 84, y: 58, class: 'board-drawing__small' }, ['EN']),
    // USB-시리얼 칩(장식)
    svgElement('rect', { x: 160, y: 98, width: 44, height: 30, rx: 2, fill: '#15232e', stroke: '#0b141b', 'stroke-width': 1 }),
    // 금속 덮개 모듈
    svgElement('rect', { x: MODULE_BOX.x, y: MODULE_BOX.y, width: MODULE_BOX.width, height: MODULE_BOX.height, rx: 5, fill: '#cfd5dc', stroke: '#8a939f', 'stroke-width': 1.5 }),
    svgElement('text', { x: MODULE_BOX.x + MODULE_BOX.width / 2, y: MODULE_BOX.y + 30, 'text-anchor': 'middle', class: 'board-drawing__module' }, ['ESP32']),
    svgElement('text', { x: MODULE_BOX.x + MODULE_BOX.width / 2, y: MODULE_BOX.y + 48, 'text-anchor': 'middle', class: 'board-drawing__caption' }, ['가상 보드']),
    svgElement('rect', { x: right - 10, y: PCB.y + 30, width: 4, height: PCB.height - 60, rx: 1, fill: '#2d5268' }),
  );
  // 핀 이름과 스트래핑 핀 표시
  for (const pin of HEADER_PINS) {
    const labelY = pin.row === 'top' ? HEADER_TOP_LABEL_Y : HEADER_BOTTOM_LABEL_Y;
    const labelClass = pin.kind === 'gpio' ? 'board-drawing__pin-label' : 'board-drawing__pin-label board-drawing__pin-label--power';
    group.append(svgElement('text', { x: pin.x, y: labelY, 'text-anchor': 'middle', class: labelClass }, [pin.label]));
    if (pin.strapping) {
      const markY = pin.row === 'top' ? labelY + 3 : labelY - 16;
      group.append(svgElement('path', { d: strappingMarkPath(pin.x, markY), fill: '#ffd24a', stroke: '#0f2230', 'stroke-width': 0.6, class: 'board-strap-mark' }));
    }
  }
  return group;
}

function drawHeaderPins(layer: SVGGElement): HeaderPinView[] {
  return HEADER_PINS.map((pin) => {
    const title = svgElement('title', {}, [pin.note]);
    const glow = svgElement('circle', { cx: pin.x, cy: pin.y, r: 8.5, fill: '#ffe066', opacity: 0, class: 'board-pin__glow' });
    const pad = svgElement('rect', { x: pin.x - 4.5, y: pin.y - 4.5, width: 9, height: 9, rx: 1.5, fill: '#d9b44a', stroke: '#7a5b12', 'stroke-width': 0.9 });
    const ring = svgElement('circle', { cx: pin.x, cy: pin.y, r: 7, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.6, opacity: 0, class: 'board-pin__ring' });
    const group = svgElement(
      'g',
      {
        class: 'board-pin',
        'data-board-header': pin.key,
        'data-label': pin.label,
        'data-gpio': pin.gpio === null ? null : String(pin.gpio),
        'data-used': 'false',
        'data-level': '0',
        'data-high': 'false',
        'data-wired': 'false',
      },
      [title, glow, pad, ring],
    );
    layer.append(group);
    return { pin, group, title, pad, ring, glow };
  });
}

export function createBoardDrawing(): BoardDrawing {
  drawingCount += 1;
  const patternId = `board-holes-${drawingCount}`;
  const svg = svgElement('svg', {
    class: 'board-stage__svg',
    viewBox: '10 32 418 166',
    role: 'group',
    'aria-label': '가상 ESP32 보드와 배선도',
    focusable: 'false',
  });
  const defs = svgElement('defs', {}, [
    svgElement('pattern', { id: patternId, width: 9, height: 9, patternUnits: 'userSpaceOnUse' }, [svgElement('circle', { cx: 4.5, cy: 4.5, r: 1.1, fill: '#d3cab6' })]),
  ]);
  const breadboardLayer = svgElement('g', { class: 'board-breadboard-layer' });
  const boardLayer = drawStaticBoard();
  // 핀 머리의 설명(<title>)은 마우스를 올린 사람을 위한 것이다. 같은 내용이 "핀 상태" 표에 글자로 있어 화면 낭독기에는 30개를 읽히지 않는다.
  const pinsLayer = svgElement('g', { class: 'board-pins-layer', 'aria-hidden': 'true' });
  const wiresLayer = svgElement('g', { class: 'board-wires-layer', 'aria-hidden': 'true' });
  const partsLayer = svgElement('g', { class: 'board-parts' });
  svg.append(defs, breadboardLayer, boardLayer, pinsLayer, wiresLayer, partsLayer);
  const headerPins = drawHeaderPins(pinsLayer);

  return {
    svg,
    partsLayer,
    headerPins,
    applyPlan(plan) {
      breadboardLayer.replaceChildren();
      wiresLayer.replaceChildren();
      const { viewBox } = plan;
      svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
      if (plan.breadboard) {
        const board = plan.breadboard;
        breadboardLayer.append(
          svgElement('g', { 'data-board-breadboard': '', 'aria-hidden': 'true' }, [
            svgElement('rect', { x: board.x, y: board.y, width: board.width, height: board.height, rx: 6, fill: '#f4efe3', stroke: '#c9bfa8', 'stroke-width': 1.2 }),
            svgElement('rect', { x: board.x + 4, y: board.y + 4, width: board.width - 8, height: board.height - 8, rx: 4, fill: `url(#${patternId})` }),
            svgElement('text', { x: board.railEndX, y: board.y + 11, 'text-anchor': 'end', class: 'board-drawing__bb-label' }, ['브레드보드']),
            svgElement('line', { x1: board.railStartX, y1: board.gndRailY, x2: board.railEndX, y2: board.gndRailY, stroke: '#1f2937', 'stroke-width': 2 }),
            svgElement('line', { x1: board.railStartX, y1: board.vccRailY, x2: board.railEndX, y2: board.vccRailY, stroke: '#b91c1c', 'stroke-width': 2 }),
            svgElement('text', { x: board.railEndX, y: board.gndRailY - 3, 'text-anchor': 'end', class: 'board-drawing__rail-label' }, ['− GND']),
            svgElement('text', { x: board.railEndX, y: board.vccRailY + 9, 'text-anchor': 'end', class: 'board-drawing__rail-label board-drawing__rail-label--vcc' }, ['+ 3V3']),
          ]),
        );
      }
      const wired = new Set<number>();
      for (const wire of plan.wires) {
        const points = wire.points.map((point) => `${point.x},${point.y}`).join(' ');
        const group = svgElement(
          'g',
          { 'data-board-wire': wire.key, 'data-kind': wire.kind, 'data-gpio': wire.gpio === null ? null : String(wire.gpio) },
          [
            svgElement('polyline', { points, fill: 'none', stroke: '#ffffff', 'stroke-width': 4.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
            svgElement('polyline', { points, fill: 'none', stroke: wire.color, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
          ],
        );
        const start = wire.points[0];
        if (wire.kind === 'signal' || wire.key.startsWith('power:')) {
          if (start) {
            group.append(svgElement('circle', { cx: start.x, cy: start.y, r: 2.8, fill: wire.color, stroke: '#ffffff', 'stroke-width': 1 }));
          }
        }
        if (wire.gpio !== null) {
          wired.add(wire.gpio);
        }
        wiresLayer.append(group);
      }
      for (const junction of plan.junctions) {
        wiresLayer.append(svgElement('circle', { cx: junction.x, cy: junction.y, r: 2.4, fill: '#374151', stroke: '#ffffff', 'stroke-width': 0.8 }));
      }
      for (const view of headerPins) {
        const isWired = view.pin.gpio !== null && wired.has(view.pin.gpio);
        view.group.setAttribute('data-wired', String(isWired));
      }
    },
    updatePins(snapshot, connected) {
      const live = isLive(snapshot);
      for (const view of headerPins) {
        const gpio = view.pin.gpio;
        if (gpio === null) {
          continue;
        }
        const state = snapshot.pins.get(gpio);
        const used = state !== undefined;
        const level = state?.level ?? 0;
        const high = used && live && (state.duty !== undefined ? state.driven && state.duty > 0 : level === 1);
        const names = connected.get(gpio) ?? [];
        view.group.setAttribute('data-used', String(used));
        view.group.setAttribute('data-level', String(level));
        view.group.setAttribute('data-high', String(high));
        view.ring.setAttribute('opacity', used ? '1' : '0');
        view.glow.setAttribute('opacity', high ? '0.6' : '0');
        view.pad.setAttribute('fill', high ? '#ffe066' : '#d9b44a');
        const parts = names.length > 0 ? ` · 연결: ${names.join(', ')}` : '';
        const status = used ? ` — ${modeText(state)} · ${levelText(level)}` : ' — 코드가 아직 쓰지 않았어요';
        const text = `${view.pin.note}${status}${parts}`;
        if (view.title.textContent !== text) {
          view.title.textContent = text;
        }
      }
    },
  };
}
