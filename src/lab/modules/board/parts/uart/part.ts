/**
 * 부품: USB-UART 변환기와 컴퓨터 시리얼 창 — 보드 UART2와 가상 선으로 이어진 "컴퓨터 쪽"(PLAN §6.2 "UART2 상대 장치 — 송신 패널", §7.3 USB 시리얼,
 * CODE_MAPPING §2.3 f001·f007, INVENTORY §4.1 "USB-UART 변환기", src/lab/README.md 7.5·7.10 "조작 칸").
 * 파이썬 쪽은 같은 폴더의 apc_board_uart.py(machine.UART·가상 선)·apc_part_uart.py(변환기 흉내), 창의 순수 논리는 serial-window.ts.
 *
 * 핀(역할 이름은 변환기 쪽 — 교차 연결): rx = 변환기가 받는 핀 ← 보드 TX(기본 GPIO17), tx = 변환기가 보내는 핀 → 보드 RX(기본 GPIO16).
 * 기본 핀은 f001·f007 `UART(2, baudrate=9600, tx=17, rx=16)`과 MP3 예제(f070~f072)와 같은 교차 결선이다(INVENTORY §4.2·§4.4).
 * 전원: 실물 변환기는 자기 USB로 전원을 받고 보드와는 TX·RX·GND만 잇는다(INVENTORY S84 "TX/RX/GND"). 그래서 전원 다리를
 * `power: { gnd, vcc: false }`로 적어 GND만 그린다(P3-11 통합에서 부품 규약에 vcc: false를 더했다). 조작 칸 안내에도
 * "GND끼리 잇고 VCC는 잇지 않아요"를 적는다.
 *
 * 모습은 변환기 흉내가 보낸 상태('board.device' state — serial-window.ts parseTerminalState)로 그린다.
 * 모습 값: data-visual-phase(보드 단계), connected(이 선을 쓰는 보드 UART가 있음), baud(창 속도, 모르면 0), board-baud(보드 UART 속도, 없으면 0),
 * rx(보드에서 받은 바이트 수), tx(보드로 보낸 바이트 수), mismatch(속도가 달라 깨짐), reached(마지막으로 보낸 것을 받은 UART 수, 보낸 적 없으면 -1).
 * 조작 칸(시리얼 창) 테스트 표시: [data-uart-status] 상태 줄, textarea[data-uart-received] 받은 글자(16진수 보기면 16진수),
 * form[data-uart-send-form] 안의 input[data-uart-send-input]·select[data-uart-mode|ending|baud]·button[data-uart-send]·[data-uart-send-error],
 * 칸 뿌리의 data-uart-sent(보낸 횟수)·data-uart-received-total(받은 바이트 수).
 * 그림: 사이트가 그린 변환기 기판(브랜드 중립)·USB 단자·노트북. 받거나 보낼 때 RX·TX 표시등이 켜진다(계속 오가면 켜진 채 — 깜빡임 없음).
 */
import { readItem, writeItem } from '../../../../../lib/storage.ts';
import type { PartDefinition, PartVisual } from '../../part-types.ts';
import { isLive, type BoardPhase, type BoardSnapshot, type PartDeviceState } from '../../state.ts';
import {
  BAUD_CHOICES,
  ReceiveLog,
  displayText,
  encodeSend,
  parseBaudChoice,
  parseLineEnding,
  parseTerminalState,
  terminalCountsText,
  terminalStatusText,
  type BaudChoice,
  type LineEnding,
  type SendMode,
  type TerminalState,
} from './serial-window.ts';

const WIDTH = 126;
const HEIGHT = 70;
const PCB_WIDTH = 80;
/** 표시등이 켜져 있는 시간(마지막으로 바이트가 오간 뒤) */
const ACTIVITY_MS = 180;

export function uartVisual(snapshot: BoardSnapshot, device: PartDeviceState | undefined): PartVisual {
  const state = isLive(snapshot) ? parseTerminalState(device?.state) : null;
  return {
    phase: snapshot.phase,
    connected: state !== null && state.boardBaud !== null,
    baud: state?.baud ?? 0,
    boardBaud: state?.boardBaud ?? 0,
    rx: state?.rxTotal ?? 0,
    tx: state?.txTotal ?? 0,
    mismatch: state !== null && (state.mismatch || (state.baud !== null && state.boardBaud !== null && state.baud !== state.boardBaud)),
    reached: state?.lastSend ? state.lastSend.reached : -1,
  };
}

/** 그림 속 짧은 상태 글: "9600bps"·"속도 다름"·"UART 기다림"·"멈춤" */
export function uartShortText(visual: PartVisual): string {
  if (visual.phase === 'stopped') {
    return '멈춤';
  }
  if (visual.connected !== true) {
    return 'UART 기다림';
  }
  if (visual.mismatch === true) {
    return '속도 다름';
  }
  return `${String(visual.boardBaud)}bps`;
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

/** 이름 칸(작은 글자) + 고르기 */
function labeled(caption: string, control: HTMLElement): HTMLLabelElement {
  const label = element('label');
  label.style.display = 'grid';
  label.style.gap = 'var(--space-1)';
  label.style.flex = '1 1 9rem';
  label.style.minWidth = '0';
  label.append(element('span', {}, caption), control);
  return label;
}

const definition: PartDefinition = {
  id: 'uart',
  title: 'USB-UART 변환기',
  description: '컴퓨터 USB와 보드 UART 핀(TX·RX)을 잇는 변환기예요. 조작 칸의 시리얼 창에서 글자를 보내면 보드 RX 핀으로 가고, 보드가 보낸 글자는 시리얼 창에 나와요.',
  pins: [
    { role: 'rx', label: 'RX 받기', direction: 'out' },
    { role: 'tx', label: 'TX 보내기', direction: 'in' },
  ],
  defaultPins: { rx: 17, tx: 16 },
  size: { width: WIDTH, height: HEIGHT },
  power: { gnd: { x: 45, y: HEIGHT }, vcc: false },
  visual({ snapshot, device }) {
    return uartVisual(snapshot, device);
  },
  render(target, { svg, instance }) {
    const board = svg('rect', { x: 0, y: 0, width: PCB_WIDTH, height: HEIGHT, rx: 5, fill: '#3b2f63', stroke: '#221a3d', 'stroke-width': 1.2 });
    const marks = [9, 27].map((x) => svg('rect', { x: x - 4, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 }));
    const pinText = svg('text', { x: 5, y: 12, class: 'board-part__label board-part__label--small' }, [`RX IO${instance.pins.rx ?? ''} TX IO${instance.pins.tx ?? ''}`]);
    const title = svg('text', { x: 5, y: 25, class: 'board-part__title' }, ['USB-UART']);
    const state = svg('text', { x: 5, y: 40, class: 'board-part__state' }, ['멈춤']);
    const led = (x: number, label: string) => {
      const light = svg('circle', { cx: x, cy: 56, r: 4, fill: '#4b5563', stroke: '#111827', 'stroke-width': 0.8 });
      const text = svg('text', { x: x + 7, y: 59, class: 'board-part__label board-part__label--small' }, [label]);
      return { light, text };
    };
    const rxLed = led(10, 'RX');
    const txLed = led(42, 'TX');
    // USB 단자·선·노트북(컴퓨터 쪽 — 시리얼 창)
    const usb = svg('rect', { x: PCB_WIDTH - 2, y: 27, width: 11, height: 16, rx: 1.5, fill: '#9ca3af', stroke: '#4b5563', 'stroke-width': 1 });
    const cable = svg('path', { d: `M ${PCB_WIDTH + 9} 35 C 94 35 94 29 99 29`, stroke: '#1f2937', 'stroke-width': 2, fill: 'none' });
    const screen = svg('rect', { x: 99, y: 14, width: 26, height: 20, rx: 2, fill: '#1f2937', stroke: '#111827', 'stroke-width': 1 });
    const glass = svg('rect', { x: 101.5, y: 16.5, width: 21, height: 15, rx: 1, fill: '#dbeafe' });
    const lines = [20.5, 24.5, 28.5].map((y, index) =>
      svg('path', { d: `M 104 ${y} L ${index === 2 ? 113 : 119} ${y}`, stroke: '#1e3a8a', 'stroke-width': 1.3, 'stroke-linecap': 'round' }),
    );
    const base = svg('path', { d: 'M 96 36 L 126 36 L 124 40 L 98 40 Z', fill: '#374151', stroke: '#111827', 'stroke-width': 0.8 });
    const computer = svg('text', { x: 111, y: 52, 'text-anchor': 'middle', fill: '#1f2937', 'font-size': 8, 'font-weight': 700 }, ['컴퓨터']);
    target.append(board, ...marks, pinText, title, state, rxLed.light, rxLed.text, txLed.light, txLed.text, usb, cable, screen, glass, ...lines, base, computer);

    let lastRx = 0;
    let lastTx = 0;
    const timers = new Map<SVGCircleElement, ReturnType<typeof setTimeout>>();
    const flash = (light: SVGCircleElement, color: string) => {
      light.setAttribute('fill', color);
      const previous = timers.get(light);
      if (previous !== undefined) {
        clearTimeout(previous);
      }
      timers.set(
        light,
        setTimeout(() => {
          light.setAttribute('fill', '#4b5563');
          timers.delete(light);
        }, ACTIVITY_MS),
      );
    };
    return (visual) => {
      const text = uartShortText(visual);
      state.textContent = text;
      const rx = typeof visual.rx === 'number' ? visual.rx : 0;
      const tx = typeof visual.tx === 'number' ? visual.tx : 0;
      if (rx > lastRx) {
        flash(rxLed.light, '#f59e0b');
      }
      if (tx > lastTx) {
        flash(txLed.light, '#22c55e');
      }
      lastRx = rx;
      lastTx = tx;
      target.parentElement?.setAttribute('aria-description', `${text}. 보드에서 받은 바이트 ${rx}개, 보드로 보낸 바이트 ${tx}개`);
    };
  },
  controls(host, api) {
    const { instance } = api;
    const idBase = `board-uart-${instance.id}`;
    const names = { mode: api.storageName('mode'), ending: api.storageName('ending'), baud: api.storageName('baud'), hex: api.storageName('hex') };
    let mode: SendMode = readSetting(names.mode) === 'bytes' ? 'bytes' : 'text';
    let ending: LineEnding = parseLineEnding(readSetting(names.ending));
    let baud: BaudChoice = parseBaudChoice(readSetting(names.baud));
    let showHex = readSetting(names.hex) === '1';
    let phase: BoardPhase = 'stopped';
    let terminal: TerminalState | null = null;
    let settingsSent = false;
    let sent = 0;
    const log = new ReceiveLog();

    host.style.gap = 'var(--space-2)';
    // Pretendard는 숫자 사이의 x를 곱하기 기호로 바꿔 그린다(0x33 → 0×33). 바이트 값 예시·16진수가 그대로 보이게 합자·문맥 대체를 끈다
    host.style.fontVariantLigatures = 'none';
    const intro = element(
      'p',
      {},
      '컴퓨터의 시리얼 프로그램 역할이에요. 아래 칸에 적어 [보내기]를 누르면 변환기 TX → 보드 RX 핀으로 가고, 보드가 uart.write()로 보낸 글자는 "보드가 보낸 글자" 칸에 나와요.',
    );
    const status = element('p', { role: 'status', 'data-uart-status': '' });
    // 자주 바뀌는 바이트 수는 화면 낭독기가 매번 읽지 않게 상태 줄 밖에 둔다
    const counts = element('p', { 'data-uart-counts': '' });
    for (const node of [intro, status, counts]) {
      node.style.margin = '0';
    }
    status.style.fontWeight = 'var(--weight-semibold)';
    counts.style.color = 'var(--color-text-muted)';

    // 받은 글자
    const receivedHead = element('div');
    receivedHead.style.display = 'flex';
    receivedHead.style.flexWrap = 'wrap';
    receivedHead.style.alignItems = 'center';
    receivedHead.style.justifyContent = 'space-between';
    receivedHead.style.gap = 'var(--space-1) var(--space-2)';
    const receivedLabel = element('label', { for: `${idBase}-received` }, '보드가 보낸 글자');
    receivedLabel.style.fontWeight = 'var(--weight-semibold)';
    const tools = element('div');
    tools.style.display = 'flex';
    tools.style.flexWrap = 'wrap';
    tools.style.gap = 'var(--space-1)';
    const hexButton = element('button', { type: 'button', class: 'lab-button lab-button--small', 'data-uart-hex': '', 'aria-pressed': String(showHex) }, '16진수로 보기');
    const clearButton = element('button', { type: 'button', class: 'lab-button lab-button--small', 'data-uart-clear': '' }, '지우기');
    tools.append(hexButton, clearButton);
    receivedHead.append(receivedLabel, tools);
    const received = element('textarea', { id: `${idBase}-received`, readonly: '', rows: '4', spellcheck: 'false', 'data-uart-received': '' });
    Object.assign(received.style, {
      width: '100%',
      boxSizing: 'border-box',
      minHeight: '5.5rem',
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

    // 보내기
    const form = element('form', { 'data-uart-send-form': '', novalidate: '' });
    form.style.display = 'grid';
    form.style.gap = 'var(--space-2)';
    const inputLabel = element('label', { for: `${idBase}-send` });
    inputLabel.style.fontWeight = 'var(--weight-semibold)';
    const sendRow = element('div');
    sendRow.style.display = 'flex';
    sendRow.style.flexWrap = 'wrap';
    sendRow.style.gap = 'var(--space-2)';
    const input = element('input', {
      id: `${idBase}-send`,
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      enterkeyhint: 'send',
      'aria-describedby': `${idBase}-send-error`,
      'data-uart-send-input': '',
    });
    Object.assign(input.style, {
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
    const sendButton = element('button', { type: 'submit', class: 'lab-button', 'data-uart-send': '' }, '보내기');
    sendRow.append(input, sendButton);
    const options = element('div');
    options.style.display = 'flex';
    options.style.flexWrap = 'wrap';
    options.style.gap = 'var(--space-2)';
    const modeSelect = selectOf(
      [
        ['text', '글자(UTF-8)'],
        ['bytes', '바이트 값(예: 1, 2, 0x33)'],
      ],
      mode,
      'data-uart-mode',
    );
    const endingSelect = selectOf(
      [
        ['none', '없음'],
        ['lf', '줄바꿈 \\n'],
        ['crlf', '\\r\\n'],
      ],
      ending,
      'data-uart-ending',
    );
    const baudSelect = selectOf([['auto', '보드와 같게'], ...BAUD_CHOICES.map((value) => [String(value), `${value}bps`] as const)], String(baud), 'data-uart-baud');
    options.append(labeled('보내는 모양', modeSelect), labeled('끝에 붙일 문자', endingSelect), labeled('속도', baudSelect));
    const error = element('p', { id: `${idBase}-send-error`, role: 'alert', 'data-uart-send-error': '' });
    error.hidden = true;
    error.style.margin = '0';
    error.style.color = 'var(--color-danger-text)';
    form.append(inputLabel, sendRow, options, error);
    const wiring = element(
      'p',
      { 'data-uart-wiring': '' },
      `실물 연결: 변환기 TX → GPIO${instance.pins.tx ?? '?'}(보드 RX), 변환기 RX → GPIO${instance.pins.rx ?? '?'}(보드 TX), GND끼리 이어요. 변환기는 자기 USB로 전원을 받으니 VCC는 잇지 않아요.`,
    );
    wiring.style.margin = '0';
    wiring.style.color = 'var(--color-text-muted)';
    host.append(intro, status, counts, receivedHead, received, form, wiring);

    const showError = (message: string | null) => {
      error.textContent = message ?? '';
      error.hidden = message === null;
      input.setAttribute('aria-invalid', String(message !== null));
    };

    const renderReceived = () => {
      const atBottom = received.scrollTop + received.clientHeight >= received.scrollHeight - 4;
      received.value = showHex ? log.hex : displayText(log.text);
      if (atBottom) {
        received.scrollTop = received.scrollHeight;
      }
      host.dataset.uartReceivedTotal = String(log.total);
    };

    const render = () => {
      const running = isRunning(phase);
      const statusText = terminalStatusText(terminal, phase);
      if (status.textContent !== statusText) {
        status.textContent = statusText;
      }
      counts.textContent = terminalCountsText(terminal);
      inputLabel.textContent = mode === 'bytes' ? '보낼 바이트 값(쉼표로 나눠요)' : '보낼 글자';
      input.placeholder = mode === 'bytes' ? '예: 1, 2, 0x33' : '예: 1';
      // 실행 전에도 초점은 받게(aria-disabled) 두고, 누르면 까닭을 알린다. 흐린 모양은 조작할 수 없다는 표시(대비 기준 예외)
      sendButton.setAttribute('aria-disabled', String(!running));
      sendButton.style.opacity = running ? '' : '0.55';
      hexButton.setAttribute('aria-pressed', String(showHex));
      host.dataset.uartSent = String(sent);
      host.dataset.uartRunning = String(running);
    };

    /** 이어진 변환기 흉내가 고른 속도와 이 창의 선택이 다르면 한 번 알린다(새 실행은 '보드와 같게'로 시작하므로) */
    const syncSettings = () => {
      if (!isRunning(phase) || terminal === null || settingsSent || terminal.choice === baud) {
        return;
      }
      settingsSent = true;
      api.sendToDevice({ kind: 'settings', baud });
    };

    const cleanups: (() => void)[] = [];
    const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
      target.addEventListener(type, handler);
      cleanups.push(() => target.removeEventListener(type, handler));
    };

    listen(form, 'submit', (event) => {
      event.preventDefault();
      if (!isRunning(phase)) {
        showError('먼저 [실행]을 눌러요. 보드가 코드를 돌리는 동안 보낸 것만 보드가 받아요.');
        return;
      }
      const encoded = encodeSend(input.value, mode, ending);
      if ('error' in encoded) {
        showError(encoded.error);
        return;
      }
      showError(terminal === null ? '보냈지만 받을 곳이 아직 없어요: 보드 코드가 UART를 만들기 전에 보낸 바이트는 사라져요(실물과 같아요).' : null);
      api.sendToDevice({ kind: 'send', bytes: encoded.bytes, baud });
      sent += 1;
      input.value = '';
      input.focus();
      render();
    });
    listen(modeSelect, 'change', () => {
      mode = modeSelect.value === 'bytes' ? 'bytes' : 'text';
      writeSetting(names.mode, mode);
      showError(null);
      render();
    });
    listen(endingSelect, 'change', () => {
      ending = parseLineEnding(endingSelect.value);
      writeSetting(names.ending, ending);
      render();
    });
    listen(baudSelect, 'change', () => {
      baud = parseBaudChoice(baudSelect.value);
      writeSetting(names.baud, String(baud));
      settingsSent = false;
      if (isRunning(phase) && terminal !== null) {
        settingsSent = true;
        api.sendToDevice({ kind: 'settings', baud });
      }
      render();
    });
    listen(hexButton, 'click', () => {
      showHex = !showHex;
      writeSetting(names.hex, showHex ? '1' : '0');
      renderReceived();
      render();
    });
    listen(clearButton, 'click', () => {
      log.clearText();
      renderReceived();
    });

    render();
    renderReceived();
    return {
      update(_visual, extra) {
        const nextPhase = extra.snapshot.phase;
        let changed = false;
        if (nextPhase === 'run' && !isRunning(phase)) {
          // 보드를 새로 켰다: 지난 실행에서 받은 글자를 비우고 속도 선택을 다시 알린다
          log.clear();
          settingsSent = false;
          showError(null);
          changed = true;
        }
        phase = nextPhase;
        terminal = parseTerminalState(extra.device?.state);
        if (terminal && terminal.choice === baud) {
          settingsSent = false;
        }
        if (log.update(terminal).length > 0) {
          changed = true;
        }
        if (changed) {
          renderReceived();
        }
        syncSettings();
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
