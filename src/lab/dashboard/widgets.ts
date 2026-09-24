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

/**
 * 게이지 SVG 크기(viewBox 단위). 원호는 12시에서 ±125도라 양끝이 가운데보다 아래로 내려간다 — 끝점 y = cy + r·cos(55°) ≈ 87,
 * 선 두께 절반(5)까지 더해 높이 94는 있어야 끝이 잘리지 않는다(2026-09-25 Phase 4 검토 반영 — 높이 78이라 0·100 근처가 잘렸다).
 */
const GAUGE_VIEW = { width: 120, height: 96, cx: 60, cy: 62, radius: 44 } as const;

export interface WidgetHandlers {
  /** 설정이 바뀌었다(제목·토픽·눈금) */
  onChange(spec: WidgetSpec): void;
  /** 이 위젯을 지운다 */
  onRemove(id: string): void;
  /**
   * 스위치를 눌렀다(켜기면 true). false(또는 false로 풀리는 약속)를 돌려주면 보내지 못한 것이라 스위치 모양을 바꾸지 않는다
   * (2026-09-25 Phase 4 검토 반영 — 전에는 연결 전에도 켜진 모양이 됐다). 그 밖의 값은 보낸 것으로 본다.
   */
  onToggle(spec: WidgetSpec, on: boolean): unknown;
  /** 스위치가 보내지 못했을 때 위젯 안에 적을 까닭 */
  switchProblem?(): string;
  /** 손잡이·크기 단추에서 키를 눌렀다(옮기기·크기) — 처리했으면 true. from이 'resize'면 방향키만으로 크기를 바꾼다 */
  onGrabKey(id: string, event: KeyboardEvent, from: 'grab' | 'resize'): boolean;
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
  /** (스위치) 스위치 아래 한 줄 알림 — 보내지 못한 까닭(warn)·보드가 받았는지(info). 빈 글이면 지운다 */
  note(text: string, level?: 'info' | 'warn'): void;
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
  let switchProblem: HTMLElement | null = null;
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
    // 값마다 낭독기가 읽지 않게 알림 칸(role=status)으로 두지 않는다 — 초당 몇 번씩 알림이 쏟아졌다(2026-09-25 Phase 4 검토 반영).
    // 지금 값은 이 글을 읽으면 된다(Tab·가상 커서로 위젯에 가면 들린다).
    gaugeScale = el('p', 'dash-widget__scale', `${widget.min} ~ ${widget.max}`);
    body.append(svg, valueText, gaugeScale);
  } else if (widget.kind === 'switch') {
    switchButton = el('button', 'dash-switch');
    switchButton.type = 'button';
    switchButton.dataset.dashSwitch = '';
    switchButton.setAttribute('aria-pressed', 'false');
    // 토글 단추의 이름은 바뀌지 않게 위젯 제목으로 고정하고, 상태는 aria-pressed와 보이는 글(켜짐·꺼짐)로 알린다
    // (이름이 켜기↔끄기로 바뀌면 낭독기가 "끄기, 눌림"처럼 모순되게 읽었다 — 2026-09-25 Phase 4 검토 반영).
    switchButton.setAttribute('aria-label', widget.title);
    const knob = el('span', 'dash-switch__knob');
    knob.setAttribute('aria-hidden', 'true');
    const label = el('span', 'dash-switch__label', '꺼짐');
    label.setAttribute('aria-hidden', 'true');
    switchButton.append(knob, label);
    switchState = el('p', 'dash-widget__hint', `${widget.topic} → ${widget.onText} / ${widget.offText}`);
    switchState.dataset.dashSwitchState = '';
    switchProblem = el('p', 'dash-widget__problem', '');
    switchProblem.dataset.dashSwitchProblem = '';
    switchProblem.dataset.level = 'warn';
    switchProblem.setAttribute('role', 'status');
    body.append(switchButton, switchState, switchProblem);
  } else {
    logList = el('ul', 'dash-widget__log');
    logList.dataset.dashLog = '';
    // 메시지마다 낭독기가 읽지 않게 알림 칸으로 두지 않는다(값이 흐르면 초당 몇 번씩 읽었다 — 2026-09-25 Phase 4 검토 반영)
    logList.setAttribute('aria-live', 'off');
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

  // 그래프는 캔버스가 판에 붙어 크기를 얻은 뒤에 그려야 보인다 — 만들 때(크기 0) 한 번 그리고 말면 첫 화면이 빈 흰 칸이었다
  // (2026-09-25 Phase 4 검토 반영). 크기가 바뀔 때마다 다시 그린다(창 크기·위젯 크기 바꾸기 포함).
  if (canvas !== null && typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(() => paintChart());
    observer.observe(canvas);
    cleanups.push(() => observer.disconnect());
  }

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
    if (handlers.onGrabKey(spec.id, event, 'grab')) {
      event.preventDefault();
    }
  };
  // 크기 단추(⤡)에서는 방향키만으로 크기를 바꾼다 — 이름이 "크기 바꾸기"인 단추에서 방향키가 위치를 옮겼다(2026-09-25 Phase 4 검토 반영)
  const onResizeKeyDown = (event: KeyboardEvent): void => {
    if (handlers.onGrabKey(spec.id, event, 'resize')) {
      event.preventDefault();
    }
  };
  grab.addEventListener('keydown', onGrabKeyDown);
  resize.addEventListener('keydown', onResizeKeyDown);
  cleanups.push(() => grab.removeEventListener('keydown', onGrabKeyDown));
  cleanups.push(() => resize.removeEventListener('keydown', onResizeKeyDown));

  const onGrabPointerDown = (event: PointerEvent): void => handlers.onGrabPointer(spec.id, event);
  grab.addEventListener('pointerdown', onGrabPointerDown);
  cleanups.push(() => grab.removeEventListener('pointerdown', onGrabPointerDown));

  const onResizePointerDown = (event: PointerEvent): void => handlers.onResizePointer(spec.id, event);
  resize.addEventListener('pointerdown', onResizePointerDown);
  cleanups.push(() => resize.removeEventListener('pointerdown', onResizePointerDown));

  let switchOn = false;
  if (switchButton !== null) {
    const button = switchButton;
    /** 보낸 결과에 따라 모양을 바꾼다 — 보내지 못했으면(false) 그대로 두고 위젯 안에 까닭을 적는다 */
    const settle = (wanted: boolean, result: unknown): void => {
      if (result === false) {
        if (switchProblem !== null) {
          switchProblem.textContent = handlers.switchProblem?.() ?? '';
          switchProblem.dataset.level = 'warn';
        }
        return;
      }
      if (switchProblem !== null) {
        switchProblem.textContent = '';
      }
      switchOn = wanted;
      applySwitch();
    };
    const onSwitchClick = (): void => {
      if (button.getAttribute('aria-busy') === 'true') {
        return;
      }
      const wanted = !switchOn;
      const result = handlers.onToggle(spec, wanted);
      if (result instanceof Promise) {
        button.setAttribute('aria-busy', 'true');
        result.then(
          (value: unknown) => {
            button.removeAttribute('aria-busy');
            settle(wanted, value);
          },
          () => {
            button.removeAttribute('aria-busy');
            settle(wanted, false);
          },
        );
        return;
      }
      settle(wanted, result);
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
      label.textContent = switchOn ? '켜짐' : '꺼짐';
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
      switchButton?.setAttribute('aria-label', next.title);
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
    note(text: string, level: 'info' | 'warn' = 'info'): void {
      if (switchProblem === null) {
        return;
      }
      switchProblem.textContent = text;
      switchProblem.dataset.level = level;
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
