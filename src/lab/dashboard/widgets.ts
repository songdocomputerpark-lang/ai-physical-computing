/**
 * 위젯 네 가지의 화면(P4-07) — 게이지·실시간 그래프·스위치·텍스트 로그.
 *
 * 이 파일이 하는 일은 **DOM 만들기와 값 넣기**뿐이다. 자리 계산은 `layout.ts`, 숫자 꺼내기는 `values.ts`,
 * 그림 계산은 `chart.ts`·`gauge.ts`, 통신은 `source.ts`에 있다(바꿀 때 한 곳만 보면 되게).
 *
 * 테스트가 읽는 표시
 *   [data-dash-widget="<id>"]  위젯 하나. data-dash-kind·data-dash-x·y·w·h
 *   [data-dash-value]          게이지의 지금 값 글
 *   [data-dash-last]           그래프의 마지막 값 글, data-dash-points = 점 개수
 *   [data-dash-switch]         스위치 단추(aria-pressed)
 *   [data-dash-log] li         로그 줄
 */
import { kindLabel } from './defaults.ts';
import { colorsFrom, drawChart } from './chart.ts';
import { gaugeRatio, needleTip, trackPath, valuePath } from './gauge.ts';
import { dashText } from './messages.ts';
import { SEND_TEXT_MAX, TITLE_MAX, TOPIC_MAX } from './store.ts';
import type { DashboardWidget, SourceMessage, WidgetSpec } from './types.ts';
import { axisRange, formatValue, logLine, parseNumber, Series, widgetWants } from './values.ts';

/** 로그 위젯이 들고 있는 줄 수 */
const LOG_LIMIT = 60;

/** 게이지 SVG 크기(viewBox 단위) */
const GAUGE_VIEW = { width: 120, height: 78, cx: 60, cy: 62, radius: 44 } as const;

export interface WidgetHandlers {
  /** 설정이 바뀌었다(제목·토픽·눈금) */
  onChange(spec: WidgetSpec): void;
  /** 이 위젯을 지운다 */
  onRemove(id: string): void;
  /** 스위치를 눌렀다(켜기면 true) */
  onToggle(spec: WidgetSpec, on: boolean): void;
  /** 손잡이에서 키를 눌렀다(옮기기·크기) — 처리했으면 true */
  onGrabKey(id: string, event: KeyboardEvent): boolean;
  /** 손잡이를 끌기 시작했다 */
  onGrabPointer(id: string, event: PointerEvent): void;
  /** 모서리를 끌어 크기를 바꾸기 시작했다 */
  onResizePointer(id: string, event: PointerEvent): void;
}

export interface WidgetView {
  readonly id: string;
  readonly element: HTMLElement;
  /** 설정·자리가 바뀌었을 때 화면을 맞춘다 */
  update(widget: DashboardWidget): void;
  /** 메시지가 왔다(내 토픽이 아니면 스스로 거른다) */
  receive(message: SourceMessage): boolean;
  /** 크기가 바뀌었을 때 다시 그린다(그래프) */
  redraw(): void;
  /** 값 기억을 비운다 */
  clear(): void;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, className?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  if (className !== undefined) {
    node.setAttribute('class', className);
  }
  return node;
}

interface FieldOptions {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly type?: 'text' | 'number';
  readonly maxLength?: number;
  readonly hint?: string;
  readonly name: keyof WidgetSpec;
}

function buildField(options: FieldOptions): { row: HTMLElement; input: HTMLInputElement } {
  const row = el('div', 'dash-field');
  const label = el('label', 'dash-field__label', options.label);
  label.htmlFor = options.id;
  const input = el('input', 'dash-field__input');
  input.id = options.id;
  input.type = options.type ?? 'text';
  input.value = options.value;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.dataset.dashField = options.name;
  if (options.maxLength !== undefined) {
    input.maxLength = options.maxLength;
  }
  row.append(label, input);
  if (options.hint !== undefined) {
    const hint = el('p', 'dash-field__hint', options.hint);
    hint.id = `${options.id}-hint`;
    input.setAttribute('aria-describedby', hint.id);
    row.append(hint);
  }
  return { row, input };
}

/**
 * 위젯 하나를 만든다. 종류에 따라 몸통만 다르고 머리(손잡이·설정·지우기)와 설정 칸은 같다.
 */
export function createWidgetView(widget: DashboardWidget, handlers: WidgetHandlers, helpId: string): WidgetView {
  let spec: DashboardWidget = widget;
  const series = new Series();
  const cleanups: Array<() => void> = [];

  const root = el('article', 'dash-widget');
  root.dataset.dashWidget = widget.id;
  root.dataset.dashKind = widget.kind;

  // ── 머리 줄 ──────────────────────────────────────────────────────────────
  const bar = el('header', 'dash-widget__bar');
  const grab = el('button', 'dash-widget__grab');
  grab.type = 'button';
  grab.dataset.dashGrab = '';
  grab.setAttribute('aria-describedby', helpId);
  const grabIcon = el('span', 'dash-widget__grab-icon', '⠿');
  grabIcon.setAttribute('aria-hidden', 'true');
  const titleText = el('span', 'dash-widget__title', widget.title);
  grab.append(grabIcon, titleText);

  const kindText = el('span', 'dash-widget__kind', kindLabel(widget.kind));
  const settingsButton = el('button', 'dash-widget__small', '설정');
  settingsButton.type = 'button';
  settingsButton.dataset.dashSettings = '';
  settingsButton.setAttribute('aria-expanded', 'false');
  const removeButton = el('button', 'dash-widget__small', '지우기');
  removeButton.type = 'button';
  removeButton.dataset.dashRemove = '';
  bar.append(grab, kindText, settingsButton, removeButton);

  // ── 몸통 ────────────────────────────────────────────────────────────────
  const body = el('div', 'dash-widget__body');
  let canvas: HTMLCanvasElement | null = null;
  let valueText: HTMLElement | null = null;
  let lastText: HTMLElement | null = null;
  let logList: HTMLElement | null = null;
  let switchButton: HTMLButtonElement | null = null;
  let switchState: HTMLElement | null = null;
  let gaugeValuePath: SVGPathElement | null = null;
  let gaugeNeedle: SVGLineElement | null = null;
  let gaugeScale: HTMLElement | null = null;

  if (widget.kind === 'chart') {
    canvas = el('canvas', 'dash-widget__canvas');
    canvas.dataset.dashCanvas = '';
    // 캔버스 그림은 낭독기가 읽을 수 없으므로 마지막 값을 글로도 둔다(접근성).
    // 값이 오기 전에는 비워 둔다 — 캔버스 가운데에 이미 "아직 값이 오지 않았어요"가 보이기 때문이다(같은 말 두 번 금지).
    canvas.setAttribute('role', 'img');
    lastText = el('p', 'dash-widget__last', '');
    lastText.dataset.dashLast = '';
    body.append(canvas, lastText);
  } else if (widget.kind === 'gauge') {
    const svg = svgEl('svg', 'dash-widget__gauge');
    svg.setAttribute('viewBox', `0 0 ${GAUGE_VIEW.width} ${GAUGE_VIEW.height}`);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const track = svgEl('path', 'dash-gauge__track');
    track.setAttribute('d', trackPath(GAUGE_VIEW.cx, GAUGE_VIEW.cy, GAUGE_VIEW.radius));
    gaugeValuePath = svgEl('path', 'dash-gauge__value');
    gaugeValuePath.setAttribute('d', valuePath(GAUGE_VIEW.cx, GAUGE_VIEW.cy, GAUGE_VIEW.radius, 0));
    gaugeNeedle = svgEl('line', 'dash-gauge__needle');
    gaugeNeedle.setAttribute('x1', String(GAUGE_VIEW.cx));
    gaugeNeedle.setAttribute('y1', String(GAUGE_VIEW.cy));
    const tip = needleTip(GAUGE_VIEW.cx, GAUGE_VIEW.cy, GAUGE_VIEW.radius - 8, 0);
    gaugeNeedle.setAttribute('x2', String(tip.x));
    gaugeNeedle.setAttribute('y2', String(tip.y));
    svg.append(track, gaugeValuePath, gaugeNeedle);
    valueText = el('p', 'dash-widget__value', '—');
    valueText.dataset.dashValue = '';
    valueText.setAttribute('role', 'status');
    gaugeScale = el('p', 'dash-widget__scale', `${widget.min} ~ ${widget.max}`);
    body.append(svg, valueText, gaugeScale);
  } else if (widget.kind === 'switch') {
    switchButton = el('button', 'dash-switch');
    switchButton.type = 'button';
    switchButton.dataset.dashSwitch = '';
    switchButton.setAttribute('aria-pressed', 'false');
    const knob = el('span', 'dash-switch__knob');
    knob.setAttribute('aria-hidden', 'true');
    const label = el('span', 'dash-switch__label', '켜기');
    switchButton.append(knob, label);
    switchState = el('p', 'dash-widget__hint', `${widget.topic} → ${widget.onText} / ${widget.offText}`);
    switchState.dataset.dashSwitchState = '';
    body.append(switchButton, switchState);
  } else {
    logList = el('ul', 'dash-widget__log');
    logList.dataset.dashLog = '';
    logList.setAttribute('aria-live', 'polite');
    logList.setAttribute('aria-label', `${widget.title} 목록`);
    body.append(logList);
  }

  // ── 설정 칸 ─────────────────────────────────────────────────────────────
  const settings = el('div', 'dash-widget__settings');
  settings.dataset.dashSettingsPanel = '';
  settings.hidden = true;
  const settingsId = `dash-settings-${widget.id}`;
  settings.id = settingsId;
  settingsButton.setAttribute('aria-controls', settingsId);

  const fields: HTMLInputElement[] = [];
  const addField = (options: FieldOptions): void => {
    const { row, input } = buildField(options);
    settings.append(row);
    fields.push(input);
  };
  addField({ id: `${settingsId}-title`, label: '제목', value: widget.title, maxLength: TITLE_MAX, name: 'title' });
  addField({
    id: `${settingsId}-topic`,
    label: widget.kind === 'switch' ? '보낼 토픽' : '받을 토픽',
    value: widget.topic,
    maxLength: TOPIC_MAX,
    hint: dashText.topicHint(),
    name: 'topic',
  });
  if (widget.kind === 'gauge' || widget.kind === 'chart') {
    addField({ id: `${settingsId}-min`, label: '눈금 아래', value: String(widget.min), type: 'number', name: 'min' });
    addField({ id: `${settingsId}-max`, label: '눈금 위', value: String(widget.max), type: 'number', name: 'max' });
    addField({ id: `${settingsId}-unit`, label: '단위', value: widget.unit, maxLength: 6, name: 'unit' });
    addField({ id: `${settingsId}-field`, label: '몇 번째 값', value: String(widget.field), type: 'number', hint: dashText.fieldHint(), name: 'field' });
  }
  if (widget.kind === 'switch') {
    addField({ id: `${settingsId}-on`, label: '켤 때 보낼 말', value: widget.onText, maxLength: SEND_TEXT_MAX, name: 'onText' });
    addField({ id: `${settingsId}-off`, label: '끌 때 보낼 말', value: widget.offText, maxLength: SEND_TEXT_MAX, name: 'offText' });
  }

  const resize = el('button', 'dash-widget__resize');
  resize.type = 'button';
  resize.dataset.dashResize = '';
  resize.setAttribute('aria-label', `${widget.title} 크기 바꾸기`);
  resize.setAttribute('aria-describedby', helpId);
  const resizeIcon = el('span', 'dash-widget__resize-icon', '⤡');
  resizeIcon.setAttribute('aria-hidden', 'true');
  resize.append(resizeIcon);

  root.append(bar, body, settings, resize);

  // ── 조작 ────────────────────────────────────────────────────────────────
  const onSettingsClick = (): void => {
    const open = settings.hidden;
    settings.hidden = !open;
    settingsButton.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      fields[0]?.focus();
    }
  };
  settingsButton.addEventListener('click', onSettingsClick);
  cleanups.push(() => settingsButton.removeEventListener('click', onSettingsClick));

  const onRemoveClick = (): void => handlers.onRemove(spec.id);
  removeButton.addEventListener('click', onRemoveClick);
  cleanups.push(() => removeButton.removeEventListener('click', onRemoveClick));

  const readFields = (): WidgetSpec => {
    const next: Record<string, unknown> = { ...spec };
    for (const input of fields) {
      const name = input.dataset.dashField ?? '';
      if (name === '') {
        continue;
      }
      next[name] = input.type === 'number' ? Number(input.value) : input.value;
    }
    return next as unknown as WidgetSpec;
  };
  const onFieldChange = (): void => {
    handlers.onChange(readFields());
  };
  for (const input of fields) {
    input.addEventListener('change', onFieldChange);
    cleanups.push(() => input.removeEventListener('change', onFieldChange));
  }

  const onGrabKeyDown = (event: KeyboardEvent): void => {
    if (handlers.onGrabKey(spec.id, event)) {
      event.preventDefault();
    }
  };
  grab.addEventListener('keydown', onGrabKeyDown);
  resize.addEventListener('keydown', onGrabKeyDown);
  cleanups.push(() => grab.removeEventListener('keydown', onGrabKeyDown));
  cleanups.push(() => resize.removeEventListener('keydown', onGrabKeyDown));

  const onGrabPointerDown = (event: PointerEvent): void => handlers.onGrabPointer(spec.id, event);
  grab.addEventListener('pointerdown', onGrabPointerDown);
  cleanups.push(() => grab.removeEventListener('pointerdown', onGrabPointerDown));

  const onResizePointerDown = (event: PointerEvent): void => handlers.onResizePointer(spec.id, event);
  resize.addEventListener('pointerdown', onResizePointerDown);
  cleanups.push(() => resize.removeEventListener('pointerdown', onResizePointerDown));

  let switchOn = false;
  if (switchButton !== null) {
    const button = switchButton;
    const onSwitchClick = (): void => {
      switchOn = !switchOn;
      applySwitch();
      handlers.onToggle(spec, switchOn);
    };
    button.addEventListener('click', onSwitchClick);
    cleanups.push(() => button.removeEventListener('click', onSwitchClick));
  }

  function applySwitch(): void {
    if (switchButton === null) {
      return;
    }
    switchButton.setAttribute('aria-pressed', switchOn ? 'true' : 'false');
    const label = switchButton.querySelector('.dash-switch__label');
    if (label !== null) {
      label.textContent = switchOn ? '끄기' : '켜기';
    }
    root.dataset.dashOn = switchOn ? 'true' : 'false';
  }

  function paintChart(): void {
    if (canvas === null) {
      return;
    }
    drawChart(canvas, {
      points: series.points,
      range: axisRange(spec, series),
      colors: colorsFrom(canvas),
      emptyText: dashText.waiting(),
    });
    canvas.setAttribute('aria-label', `${spec.title} 그래프. ${series.last === null ? dashText.waiting() : `마지막 값 ${formatValue(series.last.value, spec.unit)}`}`);
  }

  function paintGauge(): void {
    if (gaugeValuePath === null || gaugeNeedle === null) {
      return;
    }
    const last = series.last;
    const ratio = last === null ? 0 : gaugeRatio(last.value, spec.min, spec.max);
    gaugeValuePath.setAttribute('d', valuePath(GAUGE_VIEW.cx, GAUGE_VIEW.cy, GAUGE_VIEW.radius, ratio));
    const tip = needleTip(GAUGE_VIEW.cx, GAUGE_VIEW.cy, GAUGE_VIEW.radius - 8, ratio);
    gaugeNeedle.setAttribute('x2', String(tip.x));
    gaugeNeedle.setAttribute('y2', String(tip.y));
    if (valueText !== null) {
      valueText.textContent = last === null ? '—' : formatValue(last.value, spec.unit);
    }
    if (gaugeScale !== null) {
      gaugeScale.textContent = `${spec.min} ~ ${spec.max}`;
    }
    root.dataset.dashRatio = ratio.toFixed(3);
  }

  function addLogLine(message: SourceMessage): void {
    if (logList === null) {
      return;
    }
    const item = el('li', 'dash-widget__log-item', logLine(message));
    logList.append(item);
    while (logList.childElementCount > LOG_LIMIT) {
      logList.firstElementChild?.remove();
    }
    logList.scrollTop = logList.scrollHeight;
  }

  function markValue(value: number | null, message: SourceMessage): void {
    if (value === null) {
      root.dataset.dashLastText = message.text.slice(0, 40);
      if (lastText !== null) {
        lastText.textContent = dashText.notNumber(message.text.slice(0, 20));
      }
      return;
    }
    series.push(value, message.at);
    root.dataset.dashPoints = String(series.length);
    root.dataset.dashLastValue = String(value);
    if (lastText !== null) {
      lastText.textContent = `마지막 값 ${formatValue(value, spec.unit)} (${series.length}개)`;
    }
  }

  const view: WidgetView = {
    id: widget.id,
    element: root,
    update(next: DashboardWidget): void {
      spec = next;
      titleText.textContent = next.title;
      // 위젯 하나가 낱낱이 이름을 가져야 낭독기가 "지금 값 게이지, 위젯"처럼 읽어 준다.
      root.setAttribute('aria-label', `${next.title} ${kindLabel(next.kind)} 위젯`);
      resize.setAttribute('aria-label', `${next.title} 크기 바꾸기`);
      logList?.setAttribute('aria-label', `${next.title} 목록`);
      root.dataset.dashX = String(next.x);
      root.dataset.dashY = String(next.y);
      root.dataset.dashW = String(next.w);
      root.dataset.dashH = String(next.h);
      root.style.gridColumn = `${next.x + 1} / span ${next.w}`;
      root.style.gridRow = `${next.y + 1} / span ${next.h}`;
      if (switchState !== null) {
        switchState.textContent = `${next.topic} → ${next.onText} / ${next.offText}`;
      }
      for (const input of fields) {
        const name = input.dataset.dashField ?? '';
        const value = (next as unknown as Record<string, unknown>)[name];
        if (value !== undefined && document.activeElement !== input) {
          input.value = String(value);
        }
      }
      if (next.kind === 'chart') {
        paintChart();
      }
      if (next.kind === 'gauge') {
        paintGauge();
      }
    },
    receive(message: SourceMessage): boolean {
      if (!widgetWants(spec, message)) {
        return false;
      }
      if (spec.kind === 'log') {
        addLogLine(message);
        return true;
      }
      if (spec.kind === 'switch') {
        // 다른 탭·보드가 같은 토픽에 보낸 말이면 스위치 모습도 맞춘다(두 탭이 같은 상태를 보게).
        const text = message.text.trim();
        if (text === spec.onText || text === spec.offText) {
          switchOn = text === spec.onText;
          applySwitch();
          return true;
        }
        return false;
      }
      const value = parseNumber(message.text, spec.field);
      markValue(value, message);
      if (spec.kind === 'chart') {
        paintChart();
      } else {
        paintGauge();
      }
      return true;
    },
    redraw(): void {
      if (spec.kind === 'chart') {
        paintChart();
      }
    },
    clear(): void {
      series.clear();
      root.dataset.dashPoints = '0';
      if (logList !== null) {
        logList.textContent = '';
      }
      if (spec.kind === 'chart') {
        paintChart();
      }
      if (spec.kind === 'gauge') {
        paintGauge();
      }
    },
    dispose(): void {
      for (const off of cleanups.splice(0)) {
        off();
      }
      root.remove();
    },
  };

  view.update(widget);
  if (widget.kind === 'switch') {
    applySwitch();
  }
  return view;
}
