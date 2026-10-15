// 그림 설명(circuits.yaml의 한 그림 — 부품 이름과 핀 번호)을 회로 구성 도구가 읽는 `.circuit` 파일 내용으로 바꾼다.
// 순수 함수만 있다(파일을 읽거나 쓰지 않음) — 같은 입력은 늘 같은 출력이라 저장소의 `.circuit` 파일과 대조할 수 있다(tests/unit/circuits/).
//
// 놓는 규칙(선이 서로 덜 엇갈리고 부품을 가로지르지 않게 시험으로 정한 것)
// - 보드는 위, 부품은 보드 아래쪽에 **계단처럼 한 줄로 쌓는다**. 선은 보드 핀 열에서 아래로 내려가 부품 높이에서 옆으로 꺾이는데,
//   연결한 열이 오른쪽에 있는 부품일수록 **더 아래 칸**에 놓으면 이 꺾인 선들이 서로 겹치지 않는다(오른쪽 열 = 아래 칸).
// - 핀이 오른쪽 가장자리인 부품(대부분)은 보드 아래 왼쪽에 쌓고, 핀이 왼쪽 가장자리인 I2C LCD는 맨 아래 오른쪽에 놓아 선이 부품을 감싸지 않게 한다.
// - MP3 플레이어는 스피커를 바로 왼쪽에 놓는다(스피커 선이 모듈 왼쪽 아래 연결단으로 간다).
// - 같은 이름·같은 입력이면 늘 같은 좌표(저장 시각도 고정)라서 파일을 다시 만들어도 바뀌지 않는다.

import {
  BOARD,
  BOARD_PINS,
  COLUMNS,
  COMPANIONS,
  PARTS,
  boardHeight,
  columnFraction,
  columnPrefix,
  partSize,
} from './catalog.mjs';

/** 저장 시각(파일을 다시 만들어도 바뀌지 않게 고정). 도구는 이 값을 쓰지 않는다. */
export const SAVED_AT = '2026-10-15T00:00:00.000Z';

const SIGNAL_WIRE_COLOR = '#FACC15';
const TIER_START = 100; // 보드 아래 가장자리에서 첫 부품 칸까지(보드 이름표와 GPIO 번호 표시 자리)
const TIER_GAP = 50; // 부품 칸 사이(부품 이름표 자리 포함)
const SIDE_GAP = 60; // 부품 핀 쪽 가장자리와 연결한 보드 열 사이
const SPEAKER_GAP = 50;
const MARGIN = 60;

function hasEntry(column, row, gpio) {
  return BOARD_PINS.some(([g, c, r]) => g === gpio && c === column && r === row);
}

function pinId(column, row) {
  return `${columnPrefix(column)}-${row}`;
}

/** GPIO 번호 하나가 놓인 보드 핀(열·행)을 고른다: 먼저 부품이 좋아하는 열, 다음에 S 행, 마지막으로 아무 행. 3핀 부품은 S 행만(실물 3핀 플러그가 꽂히는 줄). */
function pickEntry(gpio, prefer, signalRowOnly) {
  let entries = BOARD_PINS.filter(([g]) => g === gpio).map(([, column, row]) => ({ column, row }));
  if (signalRowOnly && entries.some((entry) => entry.row === 'S')) {
    entries = entries.filter((entry) => entry.row === 'S');
  }
  if (entries.length === 0) {
    return null;
  }
  for (const column of prefer) {
    const found = entries.find((entry) => entry.column === column);
    if (found) {
      return found;
    }
  }
  return entries.find((entry) => entry.row === 'S') ?? entries[0];
}

/**
 * 부품 하나를 보드에 잇는 방법을 정한다.
 * 신호가 둘 이상이고 한 열의 S·S2(·S3)가 정확히 그 번호들이면 그 열에 그대로 꽂는다(실물처럼). 아니면 신호마다 따로 고른다.
 * 돌려주는 값: { signals: [{ role, partRow, column, row, gpio }], powerColumn, plug } — 못 그리는 핀이 있으면 { missing: [gpio…] }.
 */
export function connectPart(def, pins) {
  const used = Object.keys(def.roles).filter((role) => pins[role] !== undefined);
  const missing = used.filter((role) => !BOARD_PINS.some(([g]) => g === pins[role])).map((role) => pins[role]);
  if (missing.length > 0) {
    return { missing };
  }
  const partRows = used.map((role) => def.roles[role]);
  const gpios = used.map((role) => pins[role]);
  const plugColumns = used.length > 1
    ? COLUMNS.filter((column) => partRows.every((row, index) => hasEntry(column, row, gpios[index])))
    : [];
  if (plugColumns.length > 0) {
    const column = def.prefer.find((c) => plugColumns.includes(c)) ?? plugColumns[0];
    return {
      signals: used.map((role, index) => ({ role, partRow: partRows[index], column, row: partRows[index], gpio: gpios[index] })),
      powerColumn: column,
      plug: true,
    };
  }
  const signalRowOnly = used.length === 1;
  const signals = used.map((role, index) => {
    const entry = pickEntry(gpios[index], def.prefer, signalRowOnly);
    return { role, partRow: partRows[index], column: entry.column, row: entry.row, gpio: gpios[index] };
  });
  return { signals, powerColumn: signals[0].column, plug: false };
}

/** 보드 열의 가운데 x(보드 왼쪽 위가 0일 때). */
function columnX(column) {
  return columnFraction(column) * BOARD.width;
}

function round(value) {
  return Math.round(value);
}

/**
 * 그림 하나를 `.circuit` 내용으로 바꾼다.
 * figure = { parts: [{ part: 'rgb-led', pins: { r: 27, g: 32, b: 33 } }, …] }
 * 못 그리는 핀(실드에 없는 번호)이 있으면 오류를 던진다 — circuits.yaml의 `undrawable`에 적어 두고 그림에서는 뺀다.
 */
export function buildCircuit(figure) {
  const items = [];
  for (const spec of figure.parts) {
    const def = PARTS[spec.part];
    if (!def) {
      throw new Error(`[회로] 모르는 부품 이름: ${spec.part}`);
    }
    const connection = connectPart(def, spec.pins ?? {});
    if (connection.missing) {
      throw new Error(`[회로] ${spec.part}: 실드 V3에 없는 핀 ${connection.missing.join(', ')}번 — 이 부품은 그릴 수 없어요.`);
    }
    const speaker = def.companion ? COMPANIONS[def.companion] : null;
    items.push({
      def,
      connection,
      size: partSize(def),
      speaker,
      speakerSize: speaker ? partSize(speaker) : null,
      connectX: columnX(connection.powerColumn),
    });
  }

  // 칸 정하기: 핀이 오른쪽인 부품은 연결한 열이 오른쪽일수록 아래 칸(왼쪽에 쌓음), 핀이 왼쪽인 부품은 맨 아래(오른쪽에 놓음).
  const leftStack = items.filter((item) => item.def.pinSide !== 'left').sort((a, b) => a.connectX - b.connectX);
  const rightStack = items.filter((item) => item.def.pinSide === 'left').sort((a, b) => a.connectX - b.connectX);
  const edgeRight = leftStack.length > 0 ? Math.min(...leftStack.map((item) => item.connectX)) - SIDE_GAP : 0;
  let cursorY = boardHeight() + TIER_START;
  for (const item of leftStack) {
    item.left = edgeRight - item.size.width;
    item.centerY = cursorY + item.size.height / 2;
    cursorY += item.size.height + TIER_GAP;
  }
  for (const item of rightStack) {
    item.left = item.connectX + SIDE_GAP;
    item.centerY = cursorY + item.size.height / 2;
    cursorY += item.size.height + TIER_GAP;
  }

  let minX = 0;
  for (const item of items) {
    const groupLeft = item.left - (item.speakerSize ? item.speakerSize.width + SPEAKER_GAP : 0);
    minX = Math.min(minX, groupLeft);
  }
  const dx = MARGIN - minX;
  const dy = MARGIN;

  const components = [];
  const wires = [];
  const boardId = `${BOARD.toolId}-1`;
  components.push({ id: boardId, partId: BOARD.toolId, x: round(BOARD.width / 2 + dx), y: round(boardHeight() / 2 + dy), rotation: 0 });
  let wireNumber = 1;
  const addWire = (fromCompId, fromPin, toCompId, toPin, color) => {
    wires.push({ id: `wire-${wireNumber++}`, fromCompId, fromPin, toCompId, toPin, color });
  };

  // 만드는 차례(번호)는 칸 차례(위 → 아래)를 따른다 — 같은 입력이면 늘 같은 파일.
  [...leftStack, ...rightStack].forEach((item, index) => {
    const compId = `${item.def.toolId}-${index + 2}`;
    components.push({
      id: compId,
      partId: item.def.toolId,
      x: round(item.left + item.size.width / 2 + dx),
      y: round(item.centerY + dy),
      rotation: 0,
    });
    const { signals, powerColumn } = item.connection;
    const prefix = columnPrefix(powerColumn);
    addWire(boardId, `${prefix}-G`, compId, `${item.def.toolId}-G`, 'black');
    if (!item.def.noPower) {
      addWire(boardId, `${prefix}-V`, compId, `${item.def.toolId}-V`, 'red');
    }
    for (const signal of signals) {
      addWire(boardId, pinId(signal.column, signal.row), compId, `${item.def.toolId}-${signal.partRow}`, SIGNAL_WIRE_COLOR);
    }
    if (item.speaker) {
      const speakerId = `${item.speaker.toolId}-${index + 2}s`;
      components.push({
        id: speakerId,
        partId: item.speaker.toolId,
        x: round(item.left - SPEAKER_GAP - item.speakerSize.width / 2 + dx),
        y: round(item.centerY + dy),
        rotation: 0,
      });
      addWire(speakerId, `${item.speaker.toolId}-G`, compId, `${item.def.toolId}-BOT-G`, 'black');
      addWire(speakerId, `${item.speaker.toolId}-V`, compId, `${item.def.toolId}-BOT-V`, 'red');
    }
  });

  return { version: '1.0', savedAt: SAVED_AT, components, wires };
}

/** 한 그림이 쓰는 GPIO 번호 중 실드 V3에 없는 것(없으면 빈 목록). */
export function undrawablePins(figure) {
  const missing = [];
  for (const spec of figure.parts) {
    const def = PARTS[spec.part];
    if (!def) {
      continue;
    }
    for (const role of Object.keys(def.roles)) {
      const gpio = spec.pins?.[role];
      if (gpio !== undefined && !BOARD_PINS.some(([g]) => g === gpio)) {
        missing.push({ part: spec.part, role, gpio });
      }
    }
  }
  return missing;
}

/** 도구 부품 id → 그림 크기(보드·부품·스피커). 내보내기 스크립트가 창 크기를 정할 때 쓴다. */
function sizeOfTool(toolId) {
  if (toolId === BOARD.toolId) {
    return { width: BOARD.width, height: boardHeight() };
  }
  const part = Object.values(PARTS).find((def) => def.toolId === toolId) ?? Object.values(COMPANIONS).find((def) => def.toolId === toolId);
  return part ? partSize(part) : { width: 150, height: 150 };
}

/** `.circuit` 내용이 차지하는 영역(부품 이름표 자리 +30 포함). { left, top, right, bottom } */
export function circuitBounds(circuit) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const component of circuit.components) {
    const size = sizeOfTool(component.partId);
    left = Math.min(left, component.x - size.width / 2);
    top = Math.min(top, component.y - size.height / 2);
    right = Math.max(right, component.x + size.width / 2);
    bottom = Math.max(bottom, component.y + size.height / 2 + 30);
  }
  return { left, top, right, bottom };
}
