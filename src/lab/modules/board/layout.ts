/**
 * 가상 ESP32 보드 그림의 자리 계산(순수 논리 — DOM 없음, tests/unit/lab/board-layout.test.ts). PLAN §8.3 P3-02, src/lab/README.md 7.4.
 *
 * 보드: 교과서 키트와 같은 30핀 개발 보드(ESP32 DevKit 모양, 원고 118쪽 사진의 핀 순서)를 사이트가 직접 그린다(브랜드 이름·로고 없음).
 *   USB 단자가 왼쪽, 핀 머리 두 줄(위 15개·아래 15개, 18 간격). 위 줄: 5V GND 13 12 14 27 26 25 33 32 35 34 39(VN) 36(VP) EN,
 *   아래 줄: 3V3 GND 15 2 4 16 17 5 18 19 21 RX(3) TX(1) 22 23. GPIO0은 핀 머리가 없고 BOOT 버튼이 쓴다. 6~11(플래시)·20·37·38도 핀 머리가 없다.
 * 배선도: 바깥 부품은 보드 아래 브레드보드 칸에 한 줄로 놓고, 핀 머리에서 부품 신호 자리까지 꺾은선을 긋는다.
 *   - 아래 줄 핀: 핀 → 아래로 → 자기 가로 길(보드 밑) → 부품 위 → 부품.
 *   - 위 줄 핀: 핀 → 위로 → 자기 가로 길(보드 위) → 오른쪽 세로 길(보드 오른쪽 밖) → 보드 밑 가로 길 → 부품.
 *   - 전원: 보드 3V3·GND 핀 → 왼쪽 세로 길 → 브레드보드 아래 레일(GND −, 3V3 +). 부품의 GND·VCC 다리는 아랫변에서 레일로.
 *   세로선이 같은 x에 겹치지 않게 칸을 나눈다: 핀 머리 x ≡ 6(18로 나눈 나머지), 부품 신호 자리 x ≡ 15, 오른쪽 세로 길은 보드 오른쪽 밖(6 간격),
 *   왼쪽 세로 길은 보드 왼쪽 밖. 가로 길은 선마다 6씩 떨어진 y. 선끼리 엇갈리는 곳은 생길 수 있지만(흰 테두리로 위아래가 보이게 그림)
 *   아래 줄은 핀 x 순서, 위 줄은 반대 순서로 길을 주어 흔한 배선(부품 1~3개)은 엇갈리지 않는다.
 */
import { FIRST_INPUT_ONLY_GPIO, isStrappingGpio } from './state.ts';

export const PIN_PITCH = 18;
/** 보드 기판(SVG 단위) */
export const PCB = Object.freeze({ x: 40, y: 40, width: 380, height: 150 });
export const PCB_RIGHT = PCB.x + PCB.width;
export const PCB_BOTTOM = PCB.y + PCB.height;
/** 핀 머리 첫 핀(왼쪽 끝)의 x와 두 줄의 y(핀 가운데) */
export const HEADER_FIRST_X = 150;
export const HEADER_TOP_Y = 51;
export const HEADER_BOTTOM_Y = 179;
/** 핀 이름 글자의 기준선 y */
export const HEADER_TOP_LABEL_Y = 68;
export const HEADER_BOTTOM_LABEL_Y = 167;
/** 금속 덮개 모듈(오른쪽) */
export const MODULE_BOX = Object.freeze({ x: 236, y: 84, width: 172, height: 64 });
/** USB 단자(왼쪽 끝, 기판 밖으로 조금 나옴) */
export const USB_BOX = Object.freeze({ x: 16, y: 98, width: 36, height: 34 });
/** 보드에 붙은 부품의 자리(부품 그림 왼쪽 위) — 부품 그림 크기와 함께 맞춘다 */
export const ONBOARD_ANCHORS: Readonly<Record<string, { readonly x: number; readonly y: number }>> = Object.freeze({
  'builtin-led': { x: 86, y: 80 },
  'boot-button': { x: 52, y: 128 },
});

export type HeaderRow = 'top' | 'bottom';
export type HeaderKind = 'gpio' | 'power' | 'ground' | 'enable';

export interface HeaderPin {
  /** 'top-0' … 'bottom-14' */
  readonly key: string;
  readonly row: HeaderRow;
  readonly index: number;
  /** 그림에 적는 이름: '5V', 'GND', '13', 'RX' */
  readonly label: string;
  readonly gpio: number | null;
  readonly kind: HeaderKind;
  readonly x: number;
  readonly y: number;
  /** 마우스를 올리면 보이는 설명의 앞부분(상태는 화면이 뒤에 붙인다) */
  readonly note: string;
  readonly strapping: boolean;
  readonly inputOnly: boolean;
}

type RowSpec = number | { readonly label: string; readonly kind: HeaderKind; readonly note: string; readonly gpio?: number };

const TOP_ROW: readonly RowSpec[] = [
  { label: '5V', kind: 'power', note: '5V — USB에서 오는 5V 전원' },
  { label: 'GND', kind: 'ground', note: 'GND — 0V(접지)' },
  13,
  12,
  14,
  27,
  26,
  25,
  33,
  32,
  35,
  34,
  { label: '39', kind: 'gpio', gpio: 39, note: 'GPIO39(VN)' },
  { label: '36', kind: 'gpio', gpio: 36, note: 'GPIO36(VP)' },
  { label: 'EN', kind: 'enable', note: 'EN — 보드를 다시 켜는(리셋) 핀' },
];

const BOTTOM_ROW: readonly RowSpec[] = [
  { label: '3V3', kind: 'power', note: '3V3 — 3.3V 전원' },
  { label: 'GND', kind: 'ground', note: 'GND — 0V(접지)' },
  15,
  2,
  4,
  16,
  17,
  5,
  18,
  19,
  21,
  { label: 'RX', kind: 'gpio', gpio: 3, note: 'GPIO3(RX) — USB로 컴퓨터와 주고받는 통로(UART0)' },
  { label: 'TX', kind: 'gpio', gpio: 1, note: 'GPIO1(TX) — USB로 컴퓨터와 주고받는 통로(UART0)' },
  22,
  23,
];

function headerRow(row: HeaderRow, specs: readonly RowSpec[]): HeaderPin[] {
  return specs.map((spec, index) => {
    const gpio = typeof spec === 'number' ? spec : (spec.gpio ?? null);
    const label = typeof spec === 'number' ? String(spec) : spec.label;
    const kind = typeof spec === 'number' ? 'gpio' : spec.kind;
    let note = typeof spec === 'number' ? `GPIO${spec}` : spec.note;
    const strapping = gpio !== null && isStrappingGpio(gpio);
    const inputOnly = gpio !== null && gpio >= FIRST_INPUT_ONLY_GPIO;
    if (strapping) {
      note += ' · 스트래핑 핀(전원을 켤 때 부팅 방식을 정해요)';
    }
    if (inputOnly) {
      note += ' · 입력 전용';
    }
    return {
      key: `${row}-${index}`,
      row,
      index,
      label,
      gpio,
      kind,
      x: HEADER_FIRST_X + index * PIN_PITCH,
      y: row === 'top' ? HEADER_TOP_Y : HEADER_BOTTOM_Y,
      note,
      strapping,
      inputOnly,
    };
  });
}

/** 핀 머리 30개(위 줄 15 + 아래 줄 15) */
export const HEADER_PINS: readonly HeaderPin[] = Object.freeze([...headerRow('top', TOP_ROW), ...headerRow('bottom', BOTTOM_ROW)]);

const BY_GPIO = new Map<number, HeaderPin>(HEADER_PINS.filter((pin) => pin.gpio !== null).map((pin) => [pin.gpio as number, pin]));

/** 그 GPIO의 핀 머리(없으면 null — GPIO0·6~11·20·37·38) */
export function headerPinForGpio(gpio: number): HeaderPin | null {
  return BY_GPIO.get(gpio) ?? null;
}

/** 보드 전원 핀(바깥 부품이 있으면 브레드보드 레일로 잇는다) */
export const HEADER_3V3 = HEADER_PINS.find((pin) => pin.row === 'bottom' && pin.label === '3V3') as HeaderPin;
export const HEADER_GND = HEADER_PINS.find((pin) => pin.row === 'bottom' && pin.label === 'GND') as HeaderPin;

// ── 배선도 계획 ──

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** 계획에 필요한 부품 정의의 일부(part-types.ts PartDefinition과 같은 이름) */
export interface LayoutDefinition {
  readonly onboard?: boolean;
  readonly size: { readonly width: number; readonly height: number };
  readonly pins: readonly { readonly role: string }[];
  readonly anchors?: Readonly<Record<string, Point>>;
  readonly power?: { readonly gnd: Point; readonly vcc?: Point | false } | false;
}

export interface LayoutInstance {
  readonly id: string;
  readonly part: string;
  readonly pins: Readonly<Record<string, number>>;
}

export interface PlannedPart {
  readonly id: string;
  readonly part: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly onboard: boolean;
}

export type WireKind = 'signal' | 'gnd' | 'vcc';

export interface PlannedWire {
  /** 'signal:<배선 id>:<role>' 또는 'power:gnd'·'power:vcc'·'leg:<배선 id>:gnd' */
  readonly key: string;
  readonly kind: WireKind;
  readonly instanceId: string | null;
  readonly role: string | null;
  readonly gpio: number | null;
  readonly color: string;
  readonly points: readonly Point[];
}

export interface PlannedBreadboard {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly gndRailY: number;
  readonly vccRailY: number;
  readonly railStartX: number;
  readonly railEndX: number;
}

export interface BoardDrawingPlan {
  readonly viewBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly parts: readonly PlannedPart[];
  readonly wires: readonly PlannedWire[];
  /** 선이 레일에 닿는 점(연결 표시 동그라미) */
  readonly junctions: readonly Point[];
  readonly breadboard: PlannedBreadboard | null;
  /** 핀 머리가 없어 선을 긋지 못한 신호(배선 검사가 따로 알린다) */
  readonly unplaced: readonly { readonly instanceId: string; readonly role: string; readonly gpio: number }[];
}

/** 선 색(흰 테두리 위에 그린다) — 흰 바탕·베이지 브레드보드에서 모두 대비 3:1 이상인 짙은 색 */
export const WIRE_COLORS: readonly string[] = Object.freeze(['#c2410c', '#6d28d9', '#0e7490', '#be185d', '#4d7c0f', '#1d4ed8', '#a16207', '#9f1239']);
export const WIRE_COLOR_GND = '#1f2937';
export const WIRE_COLOR_VCC = '#b91c1c';

const LANE_GAP = 6;
const TOP_LANE_START_Y = PCB.y - 10;
const RIGHT_LANE_START_X = PCB_RIGHT + 12;
const BOTTOM_LANE_START_Y = PCB_BOTTOM + 12;
const LEFT_LANE_GND_X = PCB.x - 14;
const LEFT_LANE_VCC_X = PCB.x - 20;
const PART_GAP = 18;
const BREADBOARD_PAD = 16;

/** 부품 신호 자리(부품 그림 안): anchors가 없으면 윗변에 pins 순서대로 9, 27, 45… */
export function partAnchors(definition: LayoutDefinition): Record<string, Point> {
  const anchors: Record<string, Point> = {};
  definition.pins.forEach((pin, index) => {
    anchors[pin.role] = definition.anchors?.[pin.role] ?? { x: 9 + index * PIN_PITCH, y: 0 };
  });
  return anchors;
}

/** 부품 전원 다리 자리(부품 그림 안). power가 false면 null, vcc가 false면 GND만, 없으면 아랫변 가운데 양옆 */
export function partPowerLegs(definition: LayoutDefinition): { gnd: Point; vcc: Point | null } | null {
  if (definition.power === false) {
    return null;
  }
  if (definition.power) {
    const vcc = definition.power.vcc;
    return { gnd: definition.power.gnd, vcc: vcc === false || vcc === undefined ? null : vcc };
  }
  const middle = Math.round(definition.size.width / 2);
  return { gnd: { x: middle - 9, y: definition.size.height }, vcc: { x: middle + 9, y: definition.size.height } };
}

/** x 이상에서 18로 나눈 나머지가 6인 가장 작은 값(부품 왼쪽 끝 — 신호 자리 9, 27…가 나머지 15 칸에 오게) */
function snapPartX(x: number): number {
  const remainder = ((x % PIN_PITCH) + PIN_PITCH) % PIN_PITCH;
  const wanted = 6;
  return x + ((wanted - remainder + PIN_PITCH) % PIN_PITCH);
}

interface WireDraft {
  readonly instance: LayoutInstance;
  readonly role: string;
  readonly gpio: number;
  readonly header: HeaderPin;
}

/**
 * 배선(검사를 마친 부품 목록)으로 보드 그림의 자리·선을 계산한다.
 * 보드에 붙은 부품은 ONBOARD_ANCHORS 자리에 두고 선을 긋지 않는다. 정의가 없는 부품은 건너뛴다.
 */
export function planBoardDrawing(instances: readonly LayoutInstance[], definitions: ReadonlyMap<string, LayoutDefinition>): BoardDrawingPlan {
  const parts: PlannedPart[] = [];
  const wires: PlannedWire[] = [];
  const junctions: Point[] = [];
  const unplaced: { instanceId: string; role: string; gpio: number }[] = [];

  const external: { instance: LayoutInstance; definition: LayoutDefinition; drafts: WireDraft[] }[] = [];
  for (const instance of instances) {
    const definition = definitions.get(instance.part);
    if (!definition) {
      continue;
    }
    if (definition.onboard) {
      const anchor = ONBOARD_ANCHORS[instance.part] ?? { x: 60, y: 60 };
      parts.push({ id: instance.id, part: instance.part, x: anchor.x, y: anchor.y, width: definition.size.width, height: definition.size.height, onboard: true });
      continue;
    }
    const drafts: WireDraft[] = [];
    for (const pin of definition.pins) {
      const gpio = instance.pins[pin.role];
      if (gpio === undefined) {
        continue;
      }
      const header = headerPinForGpio(gpio);
      if (!header) {
        unplaced.push({ instanceId: instance.id, role: pin.role, gpio });
        continue;
      }
      drafts.push({ instance, role: pin.role, gpio, header });
    }
    external.push({ instance, definition, drafts });
  }

  if (external.length === 0) {
    return {
      viewBox: { x: 10, y: PCB.y - 8, width: PCB_RIGHT + 8 - 10, height: PCB.height + 16 },
      parts,
      wires,
      junctions,
      breadboard: null,
      unplaced,
    };
  }

  // 부품 놓는 순서: 아래 줄만 쓰는 부품(핀 x 작은 것부터) → 두 줄을 섞어 쓰는 부품 → 위 줄만 쓰는 부품(핀 x 큰 것부터)
  const groupOf = (drafts: readonly WireDraft[]): 0 | 1 | 2 => {
    const rows = new Set(drafts.map((draft) => draft.header.row));
    return rows.size === 0 || (rows.size === 1 && rows.has('bottom')) ? 0 : rows.size === 1 ? 2 : 1;
  };
  const orderKey = (drafts: readonly WireDraft[]): number => {
    if (drafts.length === 0) {
      return Number.MAX_SAFE_INTEGER;
    }
    const xs = drafts.map((draft) => draft.header.x);
    return groupOf(drafts) === 2 ? -Math.max(...xs) : Math.min(...xs);
  };
  const ordered = external
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => groupOf(a.drafts) - groupOf(b.drafts) || orderKey(a.drafts) - orderKey(b.drafts) || a.index - b.index);

  const bottomDrafts = ordered.flatMap((entry) => entry.drafts.filter((draft) => draft.header.row === 'bottom')).sort((a, b) => a.header.x - b.header.x);
  const topDrafts = ordered.flatMap((entry) => entry.drafts.filter((draft) => draft.header.row === 'top')).sort((a, b) => b.header.x - a.header.x);
  const powerLanes = 2;
  const laneCount = powerLanes + bottomDrafts.length + topDrafts.length;
  const lastLaneY = BOTTOM_LANE_START_Y + (laneCount - 1) * LANE_GAP;
  const breadboardY = lastLaneY + 10;
  const partsTop = breadboardY + BREADBOARD_PAD;

  // 부품 자리(한 줄, 왼쪽부터)
  let cursor = PCB.x + BREADBOARD_PAD;
  const placed = new Map<string, PlannedPart>();
  let tallest = 0;
  for (const entry of ordered) {
    const x = snapPartX(cursor);
    const planned: PlannedPart = {
      id: entry.instance.id,
      part: entry.instance.part,
      x,
      y: partsTop,
      width: entry.definition.size.width,
      height: entry.definition.size.height,
      onboard: false,
    };
    placed.set(entry.instance.id, planned);
    parts.push(planned);
    cursor = x + entry.definition.size.width + PART_GAP;
    tallest = Math.max(tallest, entry.definition.size.height);
  }
  const partsRight = cursor - PART_GAP;

  const anchorOf = (draft: WireDraft): Point => {
    const part = placed.get(draft.instance.id) as PlannedPart;
    const definition = definitions.get(draft.instance.part) as LayoutDefinition;
    const anchor = partAnchors(definition)[draft.role] ?? { x: 9, y: 0 };
    return { x: part.x + anchor.x, y: part.y + anchor.y };
  };

  let colorIndex = 0;
  const nextColor = () => WIRE_COLORS[colorIndex++ % WIRE_COLORS.length] as string;

  bottomDrafts.forEach((draft, index) => {
    const laneY = BOTTOM_LANE_START_Y + (powerLanes + index) * LANE_GAP;
    const end = anchorOf(draft);
    wires.push({
      key: `signal:${draft.instance.id}:${draft.role}`,
      kind: 'signal',
      instanceId: draft.instance.id,
      role: draft.role,
      gpio: draft.gpio,
      color: nextColor(),
      points: [
        { x: draft.header.x, y: draft.header.y },
        { x: draft.header.x, y: laneY },
        { x: end.x, y: laneY },
        end,
      ],
    });
  });

  topDrafts.forEach((draft, index) => {
    const topLaneY = TOP_LANE_START_Y - index * LANE_GAP;
    const rightLaneX = RIGHT_LANE_START_X + index * LANE_GAP;
    const laneY = BOTTOM_LANE_START_Y + (powerLanes + bottomDrafts.length + index) * LANE_GAP;
    const end = anchorOf(draft);
    wires.push({
      key: `signal:${draft.instance.id}:${draft.role}`,
      kind: 'signal',
      instanceId: draft.instance.id,
      role: draft.role,
      gpio: draft.gpio,
      color: nextColor(),
      points: [
        { x: draft.header.x, y: draft.header.y },
        { x: draft.header.x, y: topLaneY },
        { x: rightLaneX, y: topLaneY },
        { x: rightLaneX, y: laneY },
        { x: end.x, y: laneY },
        end,
      ],
    });
  });

  const rightLanesEnd = topDrafts.length > 0 ? RIGHT_LANE_START_X + (topDrafts.length - 1) * LANE_GAP + 8 : PCB_RIGHT + 8;
  const partsBottom = partsTop + tallest;
  const gndRailY = partsBottom + 16;
  const vccRailY = gndRailY + 12;
  const breadboardX = PCB.x;
  const breadboardRight = Math.max(PCB_RIGHT, partsRight + BREADBOARD_PAD, rightLanesEnd);
  const breadboard: PlannedBreadboard = {
    x: breadboardX,
    y: breadboardY,
    width: breadboardRight - breadboardX,
    height: vccRailY + 12 - breadboardY,
    gndRailY,
    vccRailY,
    railStartX: breadboardX + 8,
    railEndX: breadboardRight - 8,
  };

  // 전원: 보드 3V3·GND → 왼쪽 세로 길 → 레일
  const vccLaneY = BOTTOM_LANE_START_Y;
  const gndLaneY = BOTTOM_LANE_START_Y + LANE_GAP;
  wires.push(
    {
      key: 'power:vcc',
      kind: 'vcc',
      instanceId: null,
      role: null,
      gpio: null,
      color: WIRE_COLOR_VCC,
      points: [
        { x: HEADER_3V3.x, y: HEADER_3V3.y },
        { x: HEADER_3V3.x, y: vccLaneY },
        { x: LEFT_LANE_VCC_X, y: vccLaneY },
        { x: LEFT_LANE_VCC_X, y: vccRailY },
        { x: breadboard.railStartX, y: vccRailY },
      ],
    },
    {
      key: 'power:gnd',
      kind: 'gnd',
      instanceId: null,
      role: null,
      gpio: null,
      color: WIRE_COLOR_GND,
      points: [
        { x: HEADER_GND.x, y: HEADER_GND.y },
        { x: HEADER_GND.x, y: gndLaneY },
        { x: LEFT_LANE_GND_X, y: gndLaneY },
        { x: LEFT_LANE_GND_X, y: gndRailY },
        { x: breadboard.railStartX, y: gndRailY },
      ],
    },
  );
  junctions.push({ x: breadboard.railStartX, y: vccRailY }, { x: breadboard.railStartX, y: gndRailY });

  // 부품 전원 다리: 아랫변 → 레일
  for (const entry of ordered) {
    const legs = partPowerLegs(entry.definition);
    const part = placed.get(entry.instance.id) as PlannedPart;
    if (!legs) {
      continue;
    }
    const gnd = { x: part.x + legs.gnd.x, y: part.y + legs.gnd.y };
    wires.push({ key: `leg:${entry.instance.id}:gnd`, kind: 'gnd', instanceId: entry.instance.id, role: null, gpio: null, color: WIRE_COLOR_GND, points: [gnd, { x: gnd.x, y: gndRailY }] });
    junctions.push({ x: gnd.x, y: gndRailY });
    if (legs.vcc) {
      const vcc = { x: part.x + legs.vcc.x, y: part.y + legs.vcc.y };
      wires.push({ key: `leg:${entry.instance.id}:vcc`, kind: 'vcc', instanceId: entry.instance.id, role: null, gpio: null, color: WIRE_COLOR_VCC, points: [vcc, { x: vcc.x, y: vccRailY }] });
      junctions.push({ x: vcc.x, y: vccRailY });
    }
  }

  const minY = topDrafts.length > 0 ? TOP_LANE_START_Y - (topDrafts.length - 1) * LANE_GAP - 8 : PCB.y - 8;
  const minX = LEFT_LANE_VCC_X - 8;
  const maxX = Math.max(PCB_RIGHT + 8, breadboardRight + 4, rightLanesEnd);
  const maxY = breadboard.y + breadboard.height + 4;
  return {
    viewBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    parts,
    wires,
    junctions,
    breadboard,
    unplaced,
  };
}
