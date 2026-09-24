/**
 * 부품: 보드 안 블루투스(BLE)와 상대 기기(스마트폰·컴퓨터) 조작 칸 — PLAN §6.2 "BLE 주변기기(Nordic UART Service)", §8.4 P4-03,
 * CODE_MAPPING §3.9, src/lab/README.md 7.5. 파이썬 쪽은 같은 폴더의 apc_part_ble.py와 ../../ext/ble/apc_board_ble.py, 순수 논리는 ble-state.ts.
 *
 * **블루투스는 ESP32 안에 들어 있어 따로 모듈을 달지 않는다.** 배선에 적는 핀(`led`, 기본 GPIO12)은 보드 라이브러리 ESP32BLE.py가
 * 연결 상태를 보여 주려고 켜는 LED다(원본 `self.led = Pin(12, Pin.OUT)`), 그래서 그림에도 "무선은 보드 안, 선은 상태 LED"라고 적는다.
 * GPIO12는 스트래핑 핀이라 배선 검사가 주의를 알린다(PLAN §6.1 "스트래핑 핀 경고 — f087 계열 상태 LED"). 그것이 이 예제의 실제 사정이다.
 *
 * 모습 값: data-visual-phase, active(무선 켜짐), advertising(광고 중), connected(상대 기기 연결), name(광고 이름), lit(상태 LED 켜짐),
 *   brightness(0~100), used(코드가 상태 LED 핀을 썼는지), rx·tx(주고받은 수), summary(화면 낭독기용 상태 글).
 * 조작 칸 테스트 표시: [data-ble-status]·[data-ble-counts]·[data-ble-rx-last](보드가 받아 둔 값 — 20바이트를 넘으면 잘린 값)·[data-ble-mac],
 *   단추 [data-ble-connect]·[data-ble-disconnect],
 *   글자 form[data-ble-text-form](input[data-ble-text]·select[data-ble-ending]·button[data-ble-send]), 명령 button[data-ble-command="a"],
 *   좌표 input[data-ble-x]·[data-ble-y]·select[data-ble-shape]·[data-ble-range]·button[data-ble-send-xy]·[data-ble-click]·[data-ble-preview],
 *   가상 스마트폰 앱 button[data-ble-app="1"], 기록 textarea[data-ble-log], 경고 [data-ble-warning],
 *   칸 뿌리의 data-ble-connected·data-ble-advertising·data-ble-rx·data-ble-tx·data-ble-sent.
 * 다른 묶음(실제 Web Bluetooth·브릿지)이 쓰는 창 이벤트: `apc:ble-write`(detail {bytes})로 값을 넣고, 보드가 알림을 보내면 `apc:ble-notify`가 난다.
 */
import { readItem, writeItem } from '../../../../../lib/storage.ts';
import type { PartDefinition, PartVisual } from '../../part-types.ts';
import { isLive, outputStrength, type BoardPhase, type BoardSnapshot, type PartDeviceState } from '../../state.ts';
import {
  COORDINATE_RANGES,
  COORDINATE_SHAPES,
  bleCountsText,
  bleLastReceivedText,
  bleStatusText,
  coordinateMessage,
  encodeText,
  logLine,
  parseBleState,
  phoneAppFrame,
  previewOf,
  rangeById,
  type BleDeviceState,
  type CoordinateShape,
  type LineEnding,
} from './ble-state.ts';

const WIDTH = 126;
const HEIGHT = 74;
/** 기록 칸에 남기는 줄 수 */
const LOG_LINES = 40;

/** 다른 묶음이 가상 블루투스에 값을 넣을 때 쓰는 창 이벤트(detail: { bytes: number[] }) */
export const BLE_WRITE_EVENT = 'apc:ble-write';
/** 보드가 알림(gatts_notify)으로 보낸 값(detail: { bytes: number[] }) */
export const BLE_NOTIFY_EVENT = 'apc:ble-notify';

export function bleVisual(snapshot: BoardSnapshot, device: PartDeviceState | undefined, gpio: number | undefined): PartVisual {
  const state = isLive(snapshot) ? parseBleState(device?.state) : null;
  const brightness = gpio === undefined || !isLive(snapshot) ? 0 : Math.round(outputStrength(snapshot, gpio) * 100);
  const connected = state !== null && state.connections.length > 0;
  const summary = state === null || !state.active ? '꺼짐' : connected ? '연결됨' : state.advertising ? '광고 중' : '켜짐';
  return {
    phase: snapshot.phase,
    active: state !== null && state.active,
    advertising: state !== null && state.advertising,
    connected,
    name: state?.name ?? '',
    lit: brightness > 0,
    brightness,
    used: gpio !== undefined && snapshot.pins.has(gpio),
    rx: state?.rxTotal ?? 0,
    tx: state?.txTotal ?? 0,
    summary,
  };
}

/**
 * "이름표: 값" 글을 이름표는 보통 글꼴, 값은 고정폭 글꼴(<code>)로 나눠 넣는다. 글 전체(textContent)는 그대로라 테스트·화면 낭독기가 같은 글을 읽는다.
 * 한글 이름표까지 고정폭 글꼴로 그리면 글자 사이가 벌어져 읽기 어렵다(2026-09-24 통합 화면 확인).
 */
function showLabeledValue(target: HTMLElement, text: string): void {
  if (target.textContent === text) {
    return;
  }
  const cut = text.indexOf(': ');
  if (cut < 0) {
    target.textContent = text;
    return;
  }
  const value = document.createElement('code');
  value.textContent = text.slice(cut + 2);
  target.replaceChildren(text.slice(0, cut + 2), value);
}

function isRunning(phase: BoardPhase): boolean {
  return phase === 'run' || phase === 'idle';
}

function readSetting(name: string): string | null {
  try {
    return readItem(name);
  } catch {
    return null;
  }
}

function writeSetting(name: string, value: string): void {
  try {
    writeItem(name, value);
  } catch {
    // 저장하지 못하면 이번 방문에만 쓴다.
  }
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function selectOf(options: readonly (readonly [string, string])[], value: string, data: string): HTMLSelectElement {
  const select = element('select', { class: 'lab__select', [data]: '' });
  for (const [optionValue, label] of options) {
    select.append(element('option', { value: optionValue }, label));
  }
  select.value = value;
  select.style.minHeight = 'var(--target-min)';
  return select;
}

function labeled(caption: string, control: HTMLElement, basis = '9rem'): HTMLLabelElement {
  const label = element('label');
  label.style.display = 'grid';
  label.style.gap = 'var(--space-1)';
  label.style.flex = `1 1 ${basis}`;
  label.style.minWidth = '0';
  label.append(element('span', {}, caption), control);
  return label;
}

/** 제목이 있는 작은 묶음(키보드·화면 낭독기가 묶어 읽게 role=group) */
function groupBox(title: string): HTMLElement {
  const box = element('div', { role: 'group', 'aria-label': title });
  box.style.display = 'grid';
  box.style.gap = 'var(--space-2)';
  box.style.padding = 'var(--space-2)';
  box.style.border = '1px solid var(--color-border)';
  box.style.borderRadius = 'var(--radius-md)';
  const heading = element('p', {}, title);
  heading.style.margin = '0';
  heading.style.fontWeight = 'var(--weight-semibold)';
  box.append(heading);
  return box;
}

function rowOf(...children: HTMLElement[]): HTMLElement {
  const row = element('div');
  row.style.display = 'flex';
  row.style.flexWrap = 'wrap';
  row.style.gap = 'var(--space-2)';
  row.style.alignItems = 'end';
  row.append(...children);
  return row;
}

const definition: PartDefinition = {
  id: 'ble',
  title: '블루투스(BLE)',
  description:
    '블루투스는 ESP32 보드 안에 들어 있어서 따로 모듈을 달지 않아요. 그림의 LED는 ESP32BLE 라이브러리가 연결 상태를 보여 주려고 켜는 LED예요. ' +
    '조작 칸에서 상대 기기(스마트폰·컴퓨터)가 되어 보드에 값을 보낼 수 있어요.',
  pins: [{ role: 'led', label: '상태 LED', direction: 'out' }],
  defaultPins: { led: 12 },
  defaultPinsNotice:
    '블루투스 무선은 ESP32 안에 있어서 선이 필요 없어요. 그림의 선은 보드 라이브러리 ESP32BLE.py가 연결 상태를 보여 주려고 쓰는 LED(GPIO12)예요. ' +
    'LED를 달지 않아도 코드는 그대로 돌아요.',
  size: { width: WIDTH, height: HEIGHT },
  python: 'apc_part_ble',
  visual({ snapshot, instance, device }) {
    return bleVisual(snapshot, device, instance.pins.led);
  },
  render(target, { svg, instance }) {
    const board = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 5, fill: '#15304a', stroke: '#0b1d2e', 'stroke-width': 1.2 });
    const pinMark = svg('rect', { x: 5, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 });
    const pinLabel = svg('text', { x: 17, y: 12, class: 'board-part__label board-part__label--small' }, [`IO${instance.pins.led ?? ''} 상태 LED`]);
    const title = svg('text', { x: WIDTH - 6, y: 12, 'text-anchor': 'end', class: 'board-part__title' }, ['블루투스']);
    // 무선 표시(사이트가 그린 도형 — 상표 모양을 쓰지 않는다): 작은 탑과 퍼지는 물결
    const tower = svg('path', { d: 'M 22 46 L 28 26 L 34 46 Z', fill: '#60a5fa', stroke: '#1e3a8a', 'stroke-width': 1 });
    const waves = svg('g', { fill: 'none', stroke: '#60a5fa', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.25 }, [
      svg('path', { d: 'M 40 28 Q 47 36 40 44' }),
      svg('path', { d: 'M 46 23 Q 56 36 46 49' }),
    ]);
    const led = svg('circle', { cx: 12, cy: 34, r: 5, fill: '#374151', stroke: '#111827', 'stroke-width': 0.8 });
    const ledLabel = svg('text', { x: 12, y: 48, 'text-anchor': 'middle', class: 'board-part__label board-part__label--small' }, ['LED']);
    const nameText = svg('text', { x: 60, y: 30, class: 'board-part__label' }, ['']);
    const state = svg('text', { x: 60, y: 46, class: 'board-part__state' }, ['멈춤']);
    const inside = svg('text', { x: WIDTH / 2, y: HEIGHT - 6, 'text-anchor': 'middle', class: 'board-part__label board-part__label--small' }, ['무선은 보드 안에 있어요']);
    target.append(board, pinMark, pinLabel, title, tower, waves, led, ledLabel, nameText, state, inside);
    return (visual) => {
      const connected = visual.connected === true;
      const advertising = visual.advertising === true;
      const brightness = typeof visual.brightness === 'number' ? visual.brightness : 0;
      led.setAttribute('fill', visual.lit === true ? '#fbbf24' : '#374151');
      led.setAttribute('opacity', visual.lit === true ? String(0.45 + 0.55 * (brightness / 100)) : '1');
      waves.setAttribute('opacity', connected ? '1' : advertising ? '0.55' : '0.15');
      const name = typeof visual.name === 'string' ? visual.name : '';
      nameText.textContent = name === '' ? '' : `이름 ${name}`;
      state.textContent = typeof visual.summary === 'string' ? visual.summary : '멈춤';
      target.parentElement?.setAttribute(
        'aria-description',
        `${String(visual.summary ?? '')}. 보드가 받은 값 ${String(visual.rx ?? 0)}개, 보드가 보낸 값 ${String(visual.tx ?? 0)}개`,
      );
    };
  },
  controls(host, api) {
    const { instance } = api;
    const idBase = `board-ble-${instance.id}`;
    const names = { ending: api.storageName('ending'), shape: api.storageName('shape'), range: api.storageName('range') };
    let ending: LineEnding = readSetting(names.ending) === 'none' ? 'none' : 'lf';
    let shape: CoordinateShape = (COORDINATE_SHAPES.find(([id]) => id === readSetting(names.shape))?.[0] ?? 'plain') as CoordinateShape;
    let range = rangeById(readSetting(names.range));
    let phase: BoardPhase = 'stopped';
    let state: BleDeviceState | null = null;
    let sent = 0;
    let lastTxTotal = 0;
    const lines: string[] = [];

    host.style.gap = 'var(--space-2)';
    host.style.fontVariantLigatures = 'none';

    const intro = element(
      'p',
      {},
      '블루투스는 ESP32 안에 들어 있어요(따로 모듈을 달지 않아요). 이 칸은 상대 기기(스마트폰·컴퓨터)예요 — [연결]을 누른 뒤 값을 보내면 보드가 받아요.',
    );
    const status = element('p', { role: 'status', 'data-ble-status': '' });
    const counts = element('p', { 'data-ble-counts': '' });
    const received = element('p', { 'data-ble-rx-last': '' });
    const mac = element('p', { 'data-ble-mac': '' });
    for (const node of [intro, status, counts, received, mac]) {
      node.style.margin = '0';
    }
    status.style.fontWeight = 'var(--weight-semibold)';
    counts.style.color = 'var(--color-text-muted)';
    received.style.overflowWrap = 'anywhere';
    mac.style.color = 'var(--color-text-muted)';

    const connectButton = element('button', { type: 'button', class: 'lab-button lab-button--small', 'data-ble-connect': '' }, '연결');
    const disconnectButton = element('button', { type: 'button', class: 'lab-button lab-button--small', 'data-ble-disconnect': '' }, '연결 끊기');
    const linkRow = rowOf(connectButton, disconnectButton);

    // ① 글자 보내기
    const textBox = groupBox('글자 보내기');
    const textForm = element('form', { 'data-ble-text-form': '', novalidate: '' });
    textForm.style.display = 'grid';
    textForm.style.gap = 'var(--space-2)';
    const textInput = element('input', {
      id: `${idBase}-text`,
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      enterkeyhint: 'send',
      placeholder: '예: a 또는 355,152',
      'data-ble-text': '',
    });
    Object.assign(textInput.style, {
      flex: '1 1 10rem',
      minWidth: '0',
      minHeight: 'var(--target-min)',
      padding: 'var(--space-2) var(--space-3)',
      border: '1px solid var(--color-border-strong)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-base)',
    });
    const sendButton = element('button', { type: 'submit', class: 'lab-button', 'data-ble-send': '' }, '보내기');
    const endingSelect = selectOf(
      [
        ['lf', '줄바꿈 \\n'],
        ['none', '없음'],
      ],
      ending,
      'data-ble-ending',
    );
    textForm.append(rowOf(labeled('보낼 글자', textInput, '12rem'), sendButton), rowOf(labeled('끝에 붙일 문자', endingSelect, '8rem')));
    const commandRow = rowOf();
    commandRow.append(element('span', {}, '자주 쓰는 명령:'));
    for (const command of ['a', 'b', 'c']) {
      const button = element('button', { type: 'button', class: 'lab-button lab-button--small', 'data-ble-command': command }, command);
      commandRow.append(button);
      button.addEventListener('click', () => send(encodeText(command, ending)));
    }
    textBox.append(textForm, commandRow);

    // ② 좌표 보내기
    const xyBox = groupBox('좌표 보내기');
    const xInput = element('input', { id: `${idBase}-x`, type: 'range', min: '0', max: String(range.width), step: '1', value: '320', 'data-ble-x': '' });
    const yInput = element('input', { id: `${idBase}-y`, type: 'range', min: '0', max: String(range.height), step: '1', value: '240', 'data-ble-y': '' });
    for (const input of [xInput, yInput]) {
      input.style.width = '100%';
      input.style.minHeight = 'var(--target-min)';
    }
    const shapeSelect = selectOf(
      COORDINATE_SHAPES.map(([id, label]) => [id, label] as const),
      shape,
      'data-ble-shape',
    );
    const rangeSelect = selectOf(
      COORDINATE_RANGES.map((item) => [item.id, item.label] as const),
      range.id,
      'data-ble-range',
    );
    const preview = element('p', { 'data-ble-preview': '' });
    preview.style.margin = '0';
    const sendXy = element('button', { type: 'button', class: 'lab-button', 'data-ble-send-xy': '' }, '좌표 보내기');
    const sendClick = element('button', { type: 'button', class: 'lab-button lab-button--small', 'data-ble-click': '' }, '클릭 보내기');
    xyBox.append(
      rowOf(labeled('보내는 모양', shapeSelect, '14rem'), labeled('좌표 범위', rangeSelect, '12rem')),
      rowOf(labeled('x', xInput, '12rem'), labeled('y', yInput, '12rem')),
      preview,
      rowOf(sendXy, sendClick),
    );

    // ③ 가상 스마트폰 앱
    const appBox = groupBox('가상 스마트폰 앱');
    const appNote = element('p', {}, '스마트폰 앱처럼 이진 프레임(FF 02 01 01 …)을 보내요. 보드 확인 예제(스마트폰 앱 → RGB LED)에 쓰는 칸이에요.');
    appNote.style.margin = '0';
    appNote.style.color = 'var(--color-text-muted)';
    const appRow = rowOf();
    for (const digit of ['1', '2', '3'] as const) {
      const button = element('button', { type: 'button', class: 'lab-button lab-button--small', 'data-ble-app': digit }, `버튼 ${digit}`);
      appRow.append(button);
      button.addEventListener('click', () => send(phoneAppFrame(digit)));
    }
    appBox.append(appNote, appRow);

    // ④ 주고받은 기록
    const logLabel = element('label', { for: `${idBase}-log` }, '주고받은 값');
    logLabel.style.fontWeight = 'var(--weight-semibold)';
    const log = element('textarea', { id: `${idBase}-log`, readonly: '', rows: '4', spellcheck: 'false', 'data-ble-log': '' });
    Object.assign(log.style, {
      width: '100%',
      boxSizing: 'border-box',
      minHeight: '5rem',
      resize: 'vertical',
      padding: 'var(--space-2)',
      border: '1px solid var(--color-border-strong)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-sm)',
      overflowWrap: 'anywhere',
    });
    const warning = element('p', { role: 'alert', 'data-ble-warning': '' });
    warning.hidden = true;
    warning.style.margin = '0';
    warning.style.color = 'var(--color-danger-text)';

    host.append(intro, status, counts, received, mac, linkRow, textBox, xyBox, appBox, warning, logLabel, log);

    const appendLog = (line: string) => {
      lines.push(line);
      if (lines.length > LOG_LINES) {
        lines.splice(0, lines.length - LOG_LINES);
      }
      const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 4;
      log.value = lines.join('\n');
      if (atBottom) {
        log.scrollTop = log.scrollHeight;
      }
    };

    const showWarning = (message: string | null) => {
      warning.textContent = message ?? '';
      warning.hidden = message === null;
    };

    function send(bytes: readonly number[]): void {
      if (!isRunning(phase)) {
        showWarning('먼저 [실행]을 눌러요. 보드가 코드를 돌리는 동안 보낸 값만 보드가 받아요.');
        return;
      }
      const { warning: tooLong, text } = previewOf(bytes);
      showWarning(tooLong);
      api.sendToDevice({ kind: 'write', bytes: [...bytes] });
      sent += 1;
      appendLog(logLine('send', bytes));
      host.dataset.bleSent = String(sent);
      host.dataset.bleLastSend = text;
      render();
    }

    const previewText = () => {
      const message = coordinateMessage(shape, Number(xInput.value), Number(yInput.value));
      showLabeledValue(preview, `보낼 값: ${message}${ending === 'lf' ? '\\n' : ''}`);
    };

    const render = () => {
      const running = isRunning(phase);
      const statusText = bleStatusText(state, running);
      if (status.textContent !== statusText) {
        status.textContent = statusText;
      }
      counts.textContent = bleCountsText(state);
      showLabeledValue(received, bleLastReceivedText(state));
      mac.textContent = state?.mac === undefined || state?.mac === null ? '' : `가상 블루투스 주소: ${state.mac} (가상 보드가 만든 주소예요. 실물 보드의 주소와 달라요.)`;
      const connected = state !== null && state.connections.length > 0;
      connectButton.setAttribute('aria-disabled', String(!running || connected));
      disconnectButton.setAttribute('aria-disabled', String(!running || !connected));
      for (const button of [connectButton, disconnectButton]) {
        button.style.opacity = button.getAttribute('aria-disabled') === 'true' ? '0.55' : '';
      }
      host.dataset.bleConnected = String(connected);
      host.dataset.bleAdvertising = String(state?.advertising === true);
      host.dataset.bleActive = String(state?.active === true);
      host.dataset.bleRx = String(state?.rxTotal ?? 0);
      host.dataset.bleTx = String(state?.txTotal ?? 0);
      host.dataset.bleRunning = String(running);
    };

    const cleanups: (() => void)[] = [];
    const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
      target.addEventListener(type, handler);
      cleanups.push(() => target.removeEventListener(type, handler));
    };

    listen(connectButton, 'click', () => {
      if (!isRunning(phase)) {
        showWarning('먼저 [실행]을 눌러요. 보드가 코드를 돌리는 동안에만 연결할 수 있어요.');
        return;
      }
      showWarning(null);
      api.sendToDevice({ kind: 'connect' });
    });
    listen(disconnectButton, 'click', () => {
      if (!isRunning(phase)) {
        return;
      }
      api.sendToDevice({ kind: 'disconnect' });
    });
    listen(textForm, 'submit', (event) => {
      event.preventDefault();
      send(encodeText(textInput.value, ending));
      textInput.value = '';
      textInput.focus();
    });
    listen(endingSelect, 'change', () => {
      ending = endingSelect.value === 'none' ? 'none' : 'lf';
      writeSetting(names.ending, ending);
      previewText();
    });
    listen(shapeSelect, 'change', () => {
      shape = (COORDINATE_SHAPES.find(([id]) => id === shapeSelect.value)?.[0] ?? 'plain') as CoordinateShape;
      writeSetting(names.shape, shape);
      previewText();
    });
    listen(rangeSelect, 'change', () => {
      range = rangeById(rangeSelect.value);
      writeSetting(names.range, range.id);
      xInput.max = String(range.width);
      yInput.max = String(range.height);
      xInput.value = String(Math.min(Number(xInput.value), range.width));
      yInput.value = String(Math.min(Number(yInput.value), range.height));
      previewText();
    });
    listen(xInput, 'input', previewText);
    listen(yInput, 'input', previewText);
    listen(sendXy, 'click', () => send(encodeText(coordinateMessage(shape, Number(xInput.value), Number(yInput.value)), ending)));
    listen(sendClick, 'click', () => send(encodeText(coordinateMessage(shape === 'data5' ? 'data5' : shape, Number(xInput.value), Number(yInput.value), 1), ending)));

    // 다른 묶음(실제 Web Bluetooth·브릿지)이 값을 넣을 수 있는 자리
    const onExternalWrite = (event: Event) => {
      const detail = (event as CustomEvent<{ bytes?: unknown }>).detail;
      const bytes = Array.isArray(detail?.bytes) ? detail.bytes.filter((item): item is number => typeof item === 'number') : [];
      if (bytes.length > 0) {
        send(bytes);
      }
    };
    window.addEventListener(BLE_WRITE_EVENT, onExternalWrite);
    cleanups.push(() => window.removeEventListener(BLE_WRITE_EVENT, onExternalWrite));

    previewText();
    render();
    return {
      update(_visual, extra) {
        const nextPhase = extra.snapshot.phase;
        if (nextPhase === 'run' && !isRunning(phase)) {
          lines.splice(0, lines.length);
          log.value = '';
          sent = 0;
          lastTxTotal = 0;
          showWarning(null);
        }
        phase = nextPhase;
        state = parseBleState(extra.device?.state);
        if (state !== null && state.txTotal > lastTxTotal) {
          lastTxTotal = state.txTotal;
          appendLog(logLine('receive', state.txLast));
          window.dispatchEvent(new CustomEvent(BLE_NOTIFY_EVENT, { detail: { bytes: [...state.txLast] } }));
        }
        render();
      },
      destroy() {
        for (const cleanup of cleanups.splice(0)) {
          cleanup();
        }
      },
    };
  },
};

export default definition;
