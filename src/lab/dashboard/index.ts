/**
 * 대시보드 공개 자리(P4-07, 시나리오 D). **다른 코드는 이 파일에서만 가져다 쓴다**(브릿지·MQTT와 같은 규칙).
 *
 * 쓰는 법
 *   import { mountDashboard } from '../../lab/dashboard/index.ts';
 *   mountDashboard(document.querySelector('[data-dash-page]'));
 *
 * 규약 근거: `docs/PLAN.md` §8.4 P4-07·§7.4(토픽 `<접두어>/dash/<위젯>`)·PD-29, SPEC §6.3(위젯 네 가지·끌어다 배치).
 */
export type { DashboardBoard, DashboardSource, DashboardWidget, PlacedItem, SourceMessage, WidgetKind, WidgetKindInfo, WidgetRect, WidgetSpec } from './types.ts';
export {
  BOARD_VERSION,
  COMMAND_TOPIC,
  DASH_COLUMNS,
  DASH_MAX_ROWS,
  DASH_MAX_WIDGETS,
  VALUE_TOPIC,
  WIDGET_KINDS,
  defaultBoard,
  kindInfo,
  kindLabel,
  newWidgetSpec,
  nextWidgetId,
} from './defaults.ts';
export {
  clampRect,
  findFreeSpot,
  maxYFor,
  minSizeOf,
  moveWidget,
  overlaps,
  placeWidget,
  resizeWidget,
  resolveCollisions,
  rowCount,
  sizeWidget,
  sortForReading,
  type LayoutChange,
} from './layout.ts';
export { BOARD_STORAGE_NAME, SEND_TEXT_MAX, TITLE_MAX, TOPIC_MAX, readBoard, sanitizeBoard, sanitizeWidget, writeBoard } from './store.ts';
export { SERIES_LIMIT, Series, axisRange, formatValue, logLine, parseNumber, widgetWants, type SamplePoint } from './values.ts';
export { CHART_PADDING, axisTicks, chartPointsOf, colorsFrom, drawChart, pointAt, tickLabel, type ChartBox, type ChartColors, type ChartPoint } from './chart.ts';
export { GAUGE_END_DEG, GAUGE_START_DEG, arcPath, gaugeAngle, gaugeRatio, needleTip, polar, trackPath, valuePath } from './gauge.ts';
export { bridgeLinesOf, bridgeTopicOf, createMqttSource, decodeText, listenBridge } from './source.ts';
export { dashText } from './messages.ts';
export { createWidgetView, type WidgetHandlers, type WidgetView } from './widgets.ts';
export { DashboardView, type DashboardViewOptions } from './grid-view.ts';
export { DASHBOARD_DEMO_FILE, DEMO_COMMAND_TOPIC, DEMO_VALUE_TOPIC } from './demo-code.ts';
export { embedLabSrc, labTabHref, mountDashboard, type DashboardPage } from './dashboard-page.ts';
