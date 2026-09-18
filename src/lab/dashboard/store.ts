/**
 * 위젯 배치·설정을 **이 브라우저에 저장**한다(P4-07, PLAN §10 "브라우저 저장: 코드, 설정, 고정한 MQTT 접두어, 대시보드 배치만").
 *
 * - 저장 이름은 `dashboard:board` 하나다. 머리말(`ai-physical-computing:`)은 `src/lib/storage.ts`가 붙이므로
 *   [이 컴퓨터에서 내 기록 지우기]가 함께 지운다(공용 PC 규칙).
 * - **읽은 값은 믿지 않는다.** 판이 다르거나 모양이 깨졌으면 그 위젯만 빼고, 남는 게 없으면 처음 판으로 돌아간다
 *   (다른 사이트·옛 판이 남긴 값, 손으로 고친 값, 용량 초과로 잘린 값까지 생각한 것).
 * - 저장이 막힌 브라우저(사생활 보호 모드)에서도 오류로 멈추지 않는다 — 읽기는 기본 판, 쓰기는 false.
 */
import { readItem, writeItem, type StorageSource } from '../../lib/storage.ts';
import { BOARD_VERSION, DASH_COLUMNS, DASH_MAX_WIDGETS, defaultBoard, kindInfo } from './defaults.ts';
import { clampRect, resolveCollisions } from './layout.ts';
import type { DashboardBoard, DashboardWidget, WidgetKind } from './types.ts';

/** 저장 이름(머리말 없는 이름) */
export const BOARD_STORAGE_NAME = 'dashboard:board';

/** 글자 칸 길이 한도(학생이 아무리 길게 적어도 화면·통신이 망가지지 않게) */
export const TITLE_MAX = 24;
export const TOPIC_MAX = 96;
/** 보낼 말은 §7.2 규칙 3(20바이트)을 넘지 않게 */
export const SEND_TEXT_MAX = 20;
export const UNIT_MAX = 6;

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,23}$/u;

function asText(value: unknown, limit: number, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const cleaned = value.replace(/[\u0000-\u001f]/gu, ' ').trim();
  return cleaned === '' ? fallback : cleaned.slice(0, limit);
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 아무 값이나 받아 쓸 수 있는 위젯으로 다듬는다(모르는 종류·깨진 id면 null) */
export function sanitizeWidget(value: unknown): DashboardWidget | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;
  const info = typeof kind === 'string' ? kindInfo(kind) : null;
  if (info === null) {
    return null;
  }
  const id = typeof raw.id === 'string' && ID_PATTERN.test(raw.id) ? raw.id : '';
  if (id === '') {
    return null;
  }
  const spec = {
    id,
    kind: info.kind as WidgetKind,
    title: asText(raw.title, TITLE_MAX, info.defaults.title),
    topic: asText(raw.topic, TOPIC_MAX, info.defaults.topic),
    min: asNumber(raw.min, info.defaults.min),
    max: asNumber(raw.max, info.defaults.max),
    unit: typeof raw.unit === 'string' ? raw.unit.replace(/[\u0000-\u001f]/gu, '').slice(0, UNIT_MAX) : info.defaults.unit,
    field: Math.min(9, Math.max(0, Math.trunc(asNumber(raw.field, info.defaults.field)))),
    onText: asText(raw.onText, SEND_TEXT_MAX, info.defaults.onText),
    offText: asText(raw.offText, SEND_TEXT_MAX, info.defaults.offText),
  };
  const rect = clampRect(
    {
      x: Math.trunc(asNumber(raw.x, 0)),
      y: Math.trunc(asNumber(raw.y, 0)),
      w: Math.trunc(asNumber(raw.w, info.defaultW)),
      h: Math.trunc(asNumber(raw.h, info.defaultH)),
    },
    info.kind,
  );
  return { ...spec, ...rect };
}

/** 판 전체를 다듬는다(겹침 풀기·개수 한도·같은 id 빼기). 쓸 만한 위젯이 없으면 null. */
export function sanitizeBoard(value: unknown): DashboardBoard | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const raw = value as { version?: unknown; widgets?: unknown };
  if (raw.version !== BOARD_VERSION || !Array.isArray(raw.widgets)) {
    return null;
  }
  const seen = new Set<string>();
  const widgets: DashboardWidget[] = [];
  for (const item of raw.widgets) {
    const widget = sanitizeWidget(item);
    if (widget === null || seen.has(widget.id) || widgets.length >= DASH_MAX_WIDGETS) {
      continue;
    }
    seen.add(widget.id);
    widgets.push(widget);
  }
  if (widgets.length === 0) {
    return null;
  }
  return { version: BOARD_VERSION, widgets: resolveCollisions(widgets) };
}

/** 저장된 판을 읽는다(없거나 깨졌으면 처음 판) */
export function readBoard(source?: StorageSource): DashboardBoard {
  const text = readItem(BOARD_STORAGE_NAME, source);
  if (text === null) {
    return defaultBoard();
  }
  try {
    return sanitizeBoard(JSON.parse(text)) ?? defaultBoard();
  } catch {
    return defaultBoard();
  }
}

/** 판을 저장한다. 저장하지 못하면(막힘·용량 초과) false. */
export function writeBoard(board: DashboardBoard, source?: StorageSource): boolean {
  try {
    return writeItem(BOARD_STORAGE_NAME, JSON.stringify({ version: BOARD_VERSION, widgets: board.widgets }), source);
  } catch {
    return false;
  }
}

/** 판이 쓰는 가로 칸 수(화면이 CSS 격자에 넘긴다) */
export const BOARD_COLUMNS = DASH_COLUMNS;
