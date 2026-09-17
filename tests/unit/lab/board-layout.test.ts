// 가상 보드 그림 자리 계산(src/lab/modules/board/layout.ts) 단위 테스트 — P3-02.
// 핀 머리 30개가 교과서 키트 보드(원고 118쪽 사진)의 순서와 같은지, 배선도 선이 서로 겹쳐 그려지지 않는지(같은 x의 세로선·같은 y의 가로선)를 본다.
import { describe, expect, it } from 'vitest';
import {
  HEADER_PINS,
  ONBOARD_ANCHORS,
  PCB,
  PCB_BOTTOM,
  PCB_RIGHT,
  headerPinForGpio,
  planBoardDrawing,
  type BoardDrawingPlan,
  type LayoutDefinition,
  type LayoutInstance,
  type Point,
} from '../../../src/lab/modules/board/layout.ts';
import { PART_DEFINITIONS, resolveWiring } from '../../../src/lab/modules/board/parts.ts';
import { STRAPPING_GPIOS, VALID_GPIOS } from '../../../src/lab/modules/board/state.ts';

const module = (width = 90, height = 68, pins = ['sig']): LayoutDefinition => ({ size: { width, height }, pins: pins.map((role) => ({ role })) });

interface Segment {
  readonly key: string;
  readonly a: Point;
  readonly b: Point;
}

function segments(plan: BoardDrawingPlan): Segment[] {
  return plan.wires.flatMap((wire) => wire.points.slice(1).map((point, index) => ({ key: wire.key, a: wire.points[index] as Point, b: point })));
}

/** 서로 다른 선의 세로선이 같은 x에서 겹치거나, 가로선이 같은 y에서 겹치는 곳(그림에서 한 줄로 보여 헷갈리는 곳) */
function overlaps(plan: BoardDrawingPlan): string[] {
  const found: string[] = [];
  const list = segments(plan);
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const s = list[i] as Segment;
      const t = list[j] as Segment;
      if (s.key === t.key) {
        continue;
      }
      const vertical = (seg: Segment) => seg.a.x === seg.b.x;
      const horizontal = (seg: Segment) => seg.a.y === seg.b.y;
      if (vertical(s) && vertical(t) && s.a.x === t.a.x) {
        const [s1, s2] = [Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y)];
        const [t1, t2] = [Math.min(t.a.y, t.b.y), Math.max(t.a.y, t.b.y)];
        if (Math.min(s2, t2) - Math.max(s1, t1) > 0) {
          found.push(`세로 x=${s.a.x}: ${s.key} / ${t.key}`);
        }
      }
      if (horizontal(s) && horizontal(t) && s.a.y === t.a.y) {
        const [s1, s2] = [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x)];
        const [t1, t2] = [Math.min(t.a.x, t.b.x), Math.max(t.a.x, t.b.x)];
        if (Math.min(s2, t2) - Math.max(s1, t1) > 0) {
          found.push(`가로 y=${s.a.y}: ${s.key} / ${t.key}`);
        }
      }
    }
  }
  return found;
}

/** 두 선이 엇갈리는 곳의 수(가로·세로 선분이 끝점이 아닌 곳에서 만남) */
function crossings(plan: BoardDrawingPlan, kind: 'signal' | 'all' = 'signal'): number {
  const list = segments({ ...plan, wires: plan.wires.filter((wire) => kind === 'all' || wire.kind === 'signal') });
  let count = 0;
  for (const s of list) {
    for (const t of list) {
      if (s.key === t.key || !(s.a.x === s.b.x && t.a.y === t.b.y)) {
        continue;
      }
      const x = s.a.x;
      const y = t.a.y;
      if (x > Math.min(t.a.x, t.b.x) && x < Math.max(t.a.x, t.b.x) && y > Math.min(s.a.y, s.b.y) && y < Math.max(s.a.y, s.b.y)) {
        count += 1;
      }
    }
  }
  return count;
}

describe('핀 머리(30핀 개발 보드)', () => {
  it('위 줄 5V·GND·13…EN, 아래 줄 3V3·GND·15…23 — 원고 118쪽 키트 사진과 같은 순서, 18 간격', () => {
    expect(HEADER_PINS).toHaveLength(30);
    expect(HEADER_PINS.filter((pin) => pin.row === 'top').map((pin) => pin.label)).toEqual(['5V', 'GND', '13', '12', '14', '27', '26', '25', '33', '32', '35', '34', '39', '36', 'EN']);
    expect(HEADER_PINS.filter((pin) => pin.row === 'bottom').map((pin) => pin.label)).toEqual(['3V3', 'GND', '15', '2', '4', '16', '17', '5', '18', '19', '21', 'RX', 'TX', '22', '23']);
    expect(headerPinForGpio(3)).toMatchObject({ label: 'RX', row: 'bottom' });
    expect(headerPinForGpio(39)?.note).toContain('GPIO39(VN)');
    expect(headerPinForGpio(36)).toMatchObject({ inputOnly: true });
    const xs = HEADER_PINS.filter((pin) => pin.row === 'top').map((pin) => pin.x);
    expect(xs.slice(1).map((x, index) => x - (xs[index] as number))).toEqual(Array(14).fill(18));
    expect(xs.every((x) => x % 18 === 6)).toBe(true);
    // 핀 머리가 없는 GPIO: 0(BOOT 버튼)·6~11(플래시)·20·37·38
    const missing = VALID_GPIOS.filter((gpio) => headerPinForGpio(gpio) === null);
    expect(missing).toEqual([0, 6, 7, 8, 9, 10, 11, 20, 37, 38]);
  });

  it('스트래핑 핀 표시(0·2·5·12·15): 핀 머리가 있는 2·5·12·15에 붙고, GPIO0은 BOOT 버튼 그림이 표시한다', () => {
    expect(HEADER_PINS.filter((pin) => pin.strapping).map((pin) => pin.gpio).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([2, 5, 12, 15]);
    expect(STRAPPING_GPIOS).toEqual([0, 2, 5, 12, 15]);
    expect(headerPinForGpio(12)?.note).toContain('스트래핑 핀');
  });
});

describe('배선도 계획(planBoardDrawing)', () => {
  it('바깥 부품이 없으면 보드만: 브레드보드·선이 없고 보드에 붙은 부품은 제자리', () => {
    const resolved = resolveWiring([]);
    const plan = planBoardDrawing(resolved.instances, PART_DEFINITIONS);
    expect(plan.breadboard).toBeNull();
    expect(plan.wires).toEqual([]);
    expect(plan.parts.map((part) => [part.part, part.x, part.y])).toEqual(
      expect.arrayContaining([
        ['builtin-led', ONBOARD_ANCHORS['builtin-led']?.x, ONBOARD_ANCHORS['builtin-led']?.y],
        ['boot-button', ONBOARD_ANCHORS['boot-button']?.x, ONBOARD_ANCHORS['boot-button']?.y],
      ]),
    );
    // 보드에 붙은 부품은 기판 안에 들어간다
    for (const part of plan.parts) {
      expect(part.x).toBeGreaterThanOrEqual(PCB.x);
      expect(part.x + part.width).toBeLessThanOrEqual(HEADER_PINS[0]!.x - 6);
      expect(part.y + part.height).toBeLessThanOrEqual(PCB_BOTTOM);
    }
  });

  it('진동 알림 예제(터치 17 + 진동 모터 19): 선이 겹치거나 엇갈리지 않고, 전원 레일과 부품 다리가 있다', () => {
    const resolved = resolveWiring([
      { part: 'touch-digital', pin: 17 },
      { part: 'vibration-motor', pin: 19 },
    ]);
    const plan = planBoardDrawing(resolved.instances, PART_DEFINITIONS);
    expect(plan.breadboard).not.toBeNull();
    const signal = plan.wires.filter((wire) => wire.kind === 'signal');
    expect(signal.map((wire) => [wire.key, wire.gpio])).toEqual([
      ['signal:touch-digital:sig', 17],
      ['signal:vibration-motor:sig', 19],
    ]);
    expect(overlaps(plan)).toEqual([]);
    expect(crossings(plan)).toBe(0);
    // 신호선은 핀 머리에서 시작해 부품 윗변(신호 자리)에서 끝난다
    const touchPart = plan.parts.find((part) => part.id === 'touch-digital')!;
    const touchWire = signal[0]!;
    expect(touchWire.points[0]).toEqual({ x: headerPinForGpio(17)!.x, y: headerPinForGpio(17)!.y });
    expect(touchWire.points.at(-1)).toEqual({ x: touchPart.x + 9, y: touchPart.y });
    expect(touchPart.x % 18).toBe(6);
    // 부품은 보드 아래 브레드보드 안, 왼쪽에서 오른쪽으로 핀 순서대로
    const motorPart = plan.parts.find((part) => part.id === 'vibration-motor')!;
    expect(motorPart.x).toBeGreaterThan(touchPart.x + touchPart.width);
    expect(touchPart.y).toBeGreaterThan(PCB_BOTTOM);
    expect(plan.wires.filter((wire) => wire.kind !== 'signal').map((wire) => wire.key).sort()).toEqual([
      'leg:touch-digital:gnd',
      'leg:touch-digital:vcc',
      'leg:vibration-motor:gnd',
      'leg:vibration-motor:vcc',
      'power:gnd',
      'power:vcc',
    ]);
    expect(plan.junctions).toHaveLength(6);
    const board = plan.breadboard!;
    expect(board.gndRailY).toBeGreaterThan(touchPart.y + touchPart.height);
    expect(board.vccRailY).toBeGreaterThan(board.gndRailY);
    // 보기 영역이 모든 선과 부품을 담는다
    const { viewBox } = plan;
    for (const point of plan.wires.flatMap((wire) => wire.points)) {
      expect(point.x).toBeGreaterThanOrEqual(viewBox.x);
      expect(point.x).toBeLessThanOrEqual(viewBox.x + viewBox.width);
      expect(point.y).toBeGreaterThanOrEqual(viewBox.y);
      expect(point.y).toBeLessThanOrEqual(viewBox.y + viewBox.height);
    }
  });

  it('위 줄 핀(보드 위로 돌아 오른쪽으로 내려옴)과 여러 핀 부품도 겹쳐 그려지지 않는다', () => {
    const definitions = new Map<string, LayoutDefinition>([
      ['one', module()],
      ['rgb', module(126, 60, ['r', 'g', 'b'])],
      ['wide', module(160, 70, ['sda', 'scl'])],
    ]);
    const instances: LayoutInstance[] = [
      { id: 'a', part: 'one', pins: { sig: 25 } },
      { id: 'b', part: 'one', pins: { sig: 32 } },
      { id: 'c', part: 'rgb', pins: { r: 27, g: 5, b: 4 } },
      { id: 'd', part: 'wide', pins: { sda: 21, scl: 22 } },
      { id: 'e', part: 'one', pins: { sig: 13 } },
    ];
    const plan = planBoardDrawing(instances, definitions);
    expect(overlaps(plan)).toEqual([]);
    const top = plan.wires.find((wire) => wire.key === 'signal:a:sig')!;
    expect(top.points[1]!.y).toBeLessThan(PCB.y);
    expect(top.points[2]!.x).toBeGreaterThan(PCB_RIGHT);
    // 위 줄만 쓰는 부품끼리는 엇갈리지 않게 놓인다(핀 x가 큰 것이 왼쪽)
    const onlyTop = planBoardDrawing(
      [
        { id: 'a', part: 'one', pins: { sig: 13 } },
        { id: 'b', part: 'one', pins: { sig: 32 } },
        { id: 'c', part: 'one', pins: { sig: 26 } },
      ],
      definitions,
    );
    expect(overlaps(onlyTop)).toEqual([]);
    expect(crossings(onlyTop)).toBe(0);
    expect(onlyTop.parts.map((part) => part.id)).toEqual(['b', 'c', 'a']);
    // 아래 줄만 쓰는 부품 셋도 엇갈리지 않는다
    const onlyBottom = planBoardDrawing(
      [
        { id: 'x', part: 'one', pins: { sig: 23 } },
        { id: 'y', part: 'one', pins: { sig: 15 } },
        { id: 'z', part: 'one', pins: { sig: 18 } },
      ],
      definitions,
    );
    expect(crossings(onlyBottom)).toBe(0);
    expect(onlyBottom.parts.map((part) => part.id)).toEqual(['y', 'z', 'x']);
  });

  it('핀 머리가 없는 GPIO(0·6~11·20·37·38)의 신호는 선을 긋지 않고 따로 알린다', () => {
    const plan = planBoardDrawing([{ id: 'hidden', part: 'one', pins: { sig: 37 } }], new Map([['one', module()]]));
    expect(plan.unplaced).toEqual([{ instanceId: 'hidden', role: 'sig', gpio: 37 }]);
    expect(plan.wires.filter((wire) => wire.kind === 'signal')).toEqual([]);
    expect(plan.parts).toHaveLength(1);
  });
});
