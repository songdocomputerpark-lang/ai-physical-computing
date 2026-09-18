/**
 * 위젯 종류마다 정해 둔 것과 **처음 보이는 판**(P4-07).
 *
 * 처음 판은 교과서 통신 템플릿 3(`examples/esp32/templates/mqtt-pub-sub.py`)과 짝이 맞게 만들었다:
 * 보드가 `esp32-01/tx`로 값을 보내고 `esp32-01/rx`로 명령을 받으므로, 그래프·게이지는 tx를 보고 스위치는 rx로 보낸다.
 * 토픽에 접두어를 적지 않는 까닭은 `src/lab/mqtt/topics.ts` 머리말과 같다(통로가 붙인다 — 실물 보드에 올릴 코드와 글자가 같게).
 */
import { DEFAULT_DEVICE } from '../mqtt/index.ts';
import type { DashboardBoard, DashboardWidget, WidgetKind, WidgetKindInfo, WidgetSpec } from './types.ts';

/** 저장 모양 판 번호(모양을 바꾸면 올린다 — 모르는 번호는 기본 판으로 되돌린다) */
export const BOARD_VERSION = 1;

/** 격자 칸 수(가로). 좁은 화면에서는 CSS가 한 줄에 하나씩 보여 준다. */
export const DASH_COLUMNS = 12;

/** 격자 줄 수 한도(끝없이 아래로 내려가지 않게) */
export const DASH_MAX_ROWS = 24;

/** 위젯 개수 한도(느려지지 않게) */
export const DASH_MAX_WIDGETS = 12;

/** 보드가 값을 보내는 토픽(템플릿과 같은 이름) */
export const VALUE_TOPIC = `${DEFAULT_DEVICE}/tx`;

/** 보드가 명령을 받는 토픽 */
export const COMMAND_TOPIC = `${DEFAULT_DEVICE}/rx`;

/** 위젯 종류 네 가지 */
export const WIDGET_KINDS: readonly WidgetKindInfo[] = Object.freeze([
  Object.freeze({
    kind: 'chart' as const,
    label: '실시간 그래프',
    description: '보드가 보낸 숫자를 시간 순서로 선으로 그려요.',
    defaultW: 6,
    defaultH: 4,
    minW: 3,
    minH: 3,
    defaults: Object.freeze({ title: '보드 값 그래프', topic: VALUE_TOPIC, min: 0, max: 100, unit: '', field: 0, onText: 'on', offText: 'off' }),
  }),
  Object.freeze({
    kind: 'gauge' as const,
    label: '게이지',
    description: '지금 값 하나를 반달 눈금으로 크게 보여 줘요.',
    defaultW: 3,
    defaultH: 4,
    minW: 2,
    minH: 3,
    defaults: Object.freeze({ title: '지금 값', topic: VALUE_TOPIC, min: 0, max: 100, unit: '', field: 0, onText: 'on', offText: 'off' }),
  }),
  Object.freeze({
    kind: 'switch' as const,
    label: '스위치',
    description: '누르면 보드에 켜기·끄기 명령을 보내요.',
    defaultW: 3,
    defaultH: 4,
    minW: 2,
    minH: 2,
    defaults: Object.freeze({ title: 'LED 스위치', topic: COMMAND_TOPIC, min: 0, max: 100, unit: '', field: 0, onText: 'on', offText: 'off' }),
  }),
  Object.freeze({
    kind: 'log' as const,
    label: '텍스트 로그',
    description: '오고 간 메시지를 글자 그대로 쌓아서 보여 줘요.',
    defaultW: 12,
    defaultH: 3,
    minW: 3,
    minH: 2,
    defaults: Object.freeze({ title: '주고받은 메시지', topic: '#', min: 0, max: 100, unit: '', field: 0, onText: 'on', offText: 'off' }),
  }),
]);

/** 종류 정보를 찾는다(모르는 종류면 null) */
export function kindInfo(kind: string): WidgetKindInfo | null {
  return WIDGET_KINDS.find((info) => info.kind === kind) ?? null;
}

/** 종류 이름(화면 글) */
export function kindLabel(kind: WidgetKind): string {
  return kindInfo(kind)?.label ?? kind;
}

/** 이 종류의 기본 설정으로 위젯 하나를 만든다(자리는 `layout.ts`가 정한다) */
export function newWidgetSpec(kind: WidgetKind, id: string): WidgetSpec {
  const info = kindInfo(kind);
  if (info === null) {
    throw new Error(`모르는 위젯 종류예요: ${kind}`);
  }
  return { id, kind, ...info.defaults };
}

/** 처음 보이는 판(그래프·게이지·스위치·로그 하나씩) */
export function defaultBoard(): DashboardBoard {
  const widgets: DashboardWidget[] = [
    { ...newWidgetSpec('chart', 'chart-1'), x: 0, y: 0, w: 6, h: 4 },
    { ...newWidgetSpec('gauge', 'gauge-1'), x: 6, y: 0, w: 3, h: 4 },
    { ...newWidgetSpec('switch', 'switch-1'), x: 9, y: 0, w: 3, h: 4 },
    { ...newWidgetSpec('log', 'log-1'), x: 0, y: 4, w: 12, h: 3 },
  ];
  return { version: BOARD_VERSION, widgets };
}

/** 판에 없는 새 id를 만든다(예: gauge-2) */
export function nextWidgetId(board: DashboardBoard, kind: WidgetKind): string {
  for (let index = 1; index <= DASH_MAX_WIDGETS + 1; index += 1) {
    const id = `${kind}-${index}`;
    if (!board.widgets.some((widget) => widget.id === id)) {
      return id;
    }
  }
  return `${kind}-${Date.now()}`;
}
