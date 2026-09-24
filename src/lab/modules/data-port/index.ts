/**
 * USB 데이터 포트 모듈의 화면 쪽(PLAN §8.4 P4-05, 규약은 src/lab/README.md 4.3).
 * 논리는 `src/lab/serial/data-port/`(연결·이름표·바이트 기록·브릿지 통로)에 있고, 이 파일은 그것을 패널 DOM에 잇기만 한다.
 *
 * 하는 일
 * 1. 연결 객체 하나(`DataPortConnection`)를 만들고 [데이터 포트 연결]·[연결 끊기]·속도 고르기·시험 보내기·이름표를 잇는다.
 *    **보드 REPL 포트(P3-07의 real-board 모듈)는 건드리지 않는다** — 서로 다른 포트를 따로 연다.
 * 2. 브릿지 통로 `serial`을 등록표에 끼운다(registerDataPortChannel). P4-02의 [보내기] 패널이 이 통로를 고르면
 *    `serial.Serial(…).write(b'a')`가 진짜 변환기로 나간다.
 * 3. 받은 줄은 패널과 **실습실 콘솔**에 보여 준다(원칙: 학생이 결과를 한 곳에서 본다).
 * 4. 패널은 코드가 시리얼을 쓸 때만 연다(README 4.3). 다른 모듈이 열고 싶으면 창 이벤트 `apc:data-port-show`를 보낸다.
 *
 * 저장하는 것(이 컴퓨터의 브라우저에만, [기록 지우기]가 함께 지운다): 포트 이름표(`module:data-port:labels`)와
 * 고른 속도(`module:data-port:baud`). 개인정보는 넣지 않는다(이름표 칸에 안내 문구가 있다 — PLAN §10).
 */
import { readItem, writeItem } from '../../../lib/storage.ts';
import { RECORDS_CLEARED_EVENT } from '../../controls/records.ts';
import {
  DataPortConnection,
  PortLabelStore,
  SINGLE_USB_TEMPLATE,
  baudLabel,
  dataPortText,
  normalizeBaud,
  registerDataPortChannel,
  visibleText,
  type DataPortSnapshot,
} from '../../serial/data-port/index.ts';
import { showPanelWhenUsed } from '../panel-when-used.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import manifest from './manifest.ts';

/** 다른 모듈·페이지가 데이터 포트 칸을 열고 싶을 때 보내는 창 이벤트 */
export const DATA_PORT_SHOW_EVENT = 'apc:data-port-show';

/** 코드에 이런 이름이 보이면 패널을 연다(영상처리는 pyserial, ESP32는 UART) */
export const DATA_PORT_CODE_PATTERN = /\bimport\s+serial\b|\bserial\s*\.\s*Serial\b|\bfrom\s+serial\b|\bmachine\s*\.\s*UART\b|\bUART\s*\(/u;

/** 이 페이지의 연결 하나(브릿지 통로가 나중에 찾아 쓴다) */
let current: DataPortConnection | null = null;

/** 브릿지 통로 등록은 페이지에 한 번만 */
let registered = false;

function textOf(element: HTMLElement | null, value: string): void {
  if (element) {
    element.textContent = value;
  }
}

function mount(context: LabModuleContext): LabModuleHandle | void {
  const panel = context.panel;
  const root = panel?.querySelector<HTMLElement>('[data-data-port]') ?? null;
  if (!panel || !root) {
    return;
  }
  const lab = context.lab;
  const cleanups: (() => void)[] = [];
  const find = <T extends HTMLElement>(selector: string): T | null => root.querySelector<T>(selector);
  const listen = <T extends EventTarget, K extends string>(target: T, type: K, handler: (event: Event) => void): void => {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };

  const labels = new PortLabelStore({
    read: () => readItem(`module:${manifest.id}:labels`),
    write: (value) => {
      writeItem(`module:${manifest.id}:labels`, value);
    },
  });
  const savedBaud = normalizeBaud(readItem(`module:${manifest.id}:baud`));

  const connection = new DataPortConnection({ baudRate: savedBaud });
  current = connection;
  if (!registered) {
    registerDataPortChannel(() => current);
    registered = true;
  }

  const badge = find<HTMLElement>('[data-data-port-badge]');
  const status = find<HTMLElement>('[data-data-port-status]');
  const problem = find<HTMLElement>('[data-data-port-problem]');
  const problemText = find<HTMLElement>('[data-data-port-problem-text]');
  const problemAdvice = find<HTMLElement>('[data-data-port-problem-advice]');
  const info = find<HTMLElement>('[data-data-port-info]');
  const chip = find<HTMLElement>('[data-data-port-chip]');
  const labelInput = find<HTMLInputElement>('[data-data-port-label]');
  const baudSelect = find<HTMLSelectElement>('[data-data-port-baud]');
  const lines = find<HTMLElement>('[data-data-port-lines]');
  const hex = find<HTMLElement>('[data-data-port-hex]');
  const count = find<HTMLElement>('[data-data-port-count]');
  const form = find<HTMLFormElement>('[data-data-port-form]');
  const sendText = find<HTMLInputElement>('[data-data-port-text]');
  const newline = find<HTMLInputElement>('[data-data-port-newline]');
  const connectButton = find<HTMLButtonElement>('[data-data-port-action="connect"]');
  const disconnectButton = find<HTMLButtonElement>('[data-data-port-action="disconnect"]');
  const clearButton = find<HTMLButtonElement>('[data-data-port-action="clear"]');
  const templateButton = find<HTMLButtonElement>('[data-data-port-action="template"]');

  if (baudSelect) {
    baudSelect.value = String(savedBaud);
  }

  const BADGE: Readonly<Record<string, string>> = {
    unsupported: '쓸 수 없음',
    idle: '연결 전',
    choosing: '포트 고르는 중',
    opening: '여는 중',
    open: '연결됨',
    closing: '닫는 중',
    error: '문제 있음',
  };

  /** 포트가 바뀌었을 때만 저장해 둔 이름표를 넣으려고 마지막 열쇠를 기억한다 */
  let lastKey = '';

  const render = (snapshot: DataPortSnapshot): void => {
    root.dataset.dataPortState = snapshot.state;
    root.dataset.dataPortBaud = String(snapshot.baudRate);
    root.dataset.dataPortReplSuspect = snapshot.boardReplSuspect ? 'yes' : '';
    textOf(badge, BADGE[snapshot.state] ?? snapshot.state);
    const stateLine = dataPortText.state(snapshot.state, snapshot.labelText, snapshot.baudRate);
    textOf(status, snapshot.boardReplSuspect ? `${stateLine} ${dataPortText.boardReplSuspect()}` : stateLine);
    if (problem) {
      problem.hidden = snapshot.problem === null;
      textOf(problemText, snapshot.problem?.text ?? '');
      textOf(problemAdvice, snapshot.problem?.advice ?? '');
    }
    if (info) {
      info.hidden = snapshot.identity === null;
    }
    textOf(chip, snapshot.identity?.text ?? '');
    if (labelInput && document.activeElement !== labelInput) {
      labelInput.value = snapshot.label;
    }
    if (connectButton) {
      connectButton.hidden = snapshot.state === 'open';
      connectButton.disabled = snapshot.state === 'unsupported' || snapshot.state === 'choosing' || snapshot.state === 'opening';
      connectButton.textContent = snapshot.state === 'error' ? '다시 연결' : '데이터 포트 연결';
    }
    if (disconnectButton) {
      disconnectButton.hidden = snapshot.state !== 'open';
    }
    if (lines) {
      const view = snapshot.rx;
      const body = [...view.lines.map((line) => visibleText(line)), view.partial === '' ? '' : `${visibleText(view.partial)} …`].filter((item) => item !== '');
      lines.textContent = body.length === 0 ? '아직 받은 것이 없어요.' : body.join('\n');
    }
    textOf(hex, snapshot.rx.hex === '' ? '—' : snapshot.rx.hex);
    textOf(count, `받은 ${snapshot.received}바이트 · 보낸 ${snapshot.sent}바이트 · ${baudLabel(snapshot.baudRate)}`);

    // 포트를 새로 열었으면 저장해 둔 이름표를 넣는다(같은 포트에서는 학생이 지운 이름표를 되살리지 않는다)
    const key = snapshot.identity?.key ?? '';
    if (key !== '' && key !== lastKey) {
      lastKey = key;
      const saved = labels.get(key);
      if (saved !== '' && snapshot.label === '') {
        connection.setLabel(saved);
      }
    }
  };

  cleanups.push(connection.subscribe(render));

  /**
   * 받은 줄을 실습실 콘솔에도 적는다(콘솔이 결과를 모으는 곳이다).
   * 끊임없이 오는 데이터로 콘솔이 덮이지 않게 연결마다 CONSOLE_LINE_LIMIT줄까지만 적고, 그 뒤에는 한 번만 알린다.
   */
  const CONSOLE_LINE_LIMIT = 200;
  const decoder = new TextDecoder('utf-8');
  let consoleLines = 0;
  let consoleStopped = false;
  let partial = '';
  cleanups.push(
    connection.onData((bytes) => {
      partial += decoder.decode(bytes, { stream: true });
      const parts = partial.replace(/\r\n?/gu, '\n').split('\n');
      partial = parts.pop() ?? '';
      for (const line of parts) {
        if (consoleStopped) {
          return;
        }
        consoleLines += 1;
        if (consoleLines > CONSOLE_LINE_LIMIT) {
          consoleStopped = true;
          lab.appendConsole('[안내] 받은 줄이 많아 콘솔에는 더 적지 않아요. 데이터 포트 칸에서 볼 수 있어요.\n', 'notice');
          return;
        }
        lab.appendConsole(`${dataPortText.receivedLine(visibleText(line))}\n`, 'notice');
      }
    }),
  );

  // 패널은 코드가 시리얼을 쓸 때만 연다. 다른 모듈이 열고 싶으면 창 이벤트로 알린다.
  const gate = showPanelWhenUsed(context, DATA_PORT_CODE_PATTERN);
  listen(window, DATA_PORT_SHOW_EVENT, () => gate.show());

  if (connectButton) {
    listen(connectButton, 'click', () => {
      gate.show();
      // 클릭 처리기 안에서 곧바로 부른다(requestPort는 사용자 조작 안에서만 된다)
      void connection.connect();
    });
  }
  if (disconnectButton) {
    listen(disconnectButton, 'click', () => {
      void connection.disconnect();
    });
  }
  if (clearButton) {
    listen(clearButton, 'click', () => {
      consoleLines = 0;
      consoleStopped = false;
      partial = '';
      connection.clearLog();
    });
  }
  if (baudSelect) {
    listen(baudSelect, 'change', () => {
      const rate = normalizeBaud(baudSelect.value);
      writeItem(`module:${manifest.id}:baud`, String(rate));
      void connection.setBaudRate(rate);
    });
  }
  if (labelInput) {
    listen(labelInput, 'input', () => {
      // 저장을 먼저 한다 — 지운 이름표를 다시 읽어 되살리지 않게
      const key = connection.snapshot.identity?.key;
      const snapshot = connection.setLabel(labelInput.value);
      if (key !== undefined) {
        labels.set(key, snapshot.label);
      }
    });
  }
  if (form) {
    listen(form, 'submit', (event) => {
      event.preventDefault();
      const value = sendText?.value ?? '';
      const text = newline?.checked === false ? value : `${value}\n`;
      const bytes = new TextEncoder().encode(text);
      connection
        .write(bytes)
        .then(() => {
          lab.appendConsole(`${dataPortText.sentLine(visibleText(text))}\n`, 'notice');
        })
        .catch((error: unknown) => {
          lab.showMessage(error instanceof Error ? error.message : String(error));
        });
    });
  }
  if (templateButton) {
    // 쓰던 코드를 말없이 덮어쓰지 않는다 — 코드가 남아 있으면 한 번 더 물어본다(단추 글이 바뀐다)
    const askText = '쓰던 코드를 덮어쓸까요? 한 번 더 누르기';
    const normalText = templateButton.textContent ?? '편집칸에 이 코드 넣기';
    let asking: ReturnType<typeof setTimeout> | null = null;
    const stopAsking = () => {
      if (asking !== null) {
        clearTimeout(asking);
        asking = null;
      }
      templateButton.textContent = normalText;
    };
    cleanups.push(stopAsking);
    listen(templateButton, 'click', () => {
      const code = lab.getCode().trim();
      const confirmed = asking !== null;
      if (code !== '' && code !== SINGLE_USB_TEMPLATE.trim() && !confirmed) {
        templateButton.textContent = askText;
        asking = setTimeout(stopAsking, 6000);
        return;
      }
      stopAsking();
      lab.setCode(SINGLE_USB_TEMPLATE);
      lab.showMessage('보드에 올릴 실험 코드를 편집칸에 넣었어요. [실제 보드]에서 실행한 뒤 입력줄로 a·b를 보내 보세요.');
    });
  }

  const onRecordsCleared = () => {
    connection.setLabel('');
    if (baudSelect) {
      baudSelect.value = String(normalizeBaud(null));
    }
    void connection.setBaudRate(normalizeBaud(null));
  };
  document.addEventListener(RECORDS_CLEARED_EVENT, onRecordsCleared);
  cleanups.push(() => document.removeEventListener(RECORDS_CLEARED_EVENT, onRecordsCleared));

  return {
    dispose() {
      for (const cleanup of cleanups.splice(0)) {
        try {
          cleanup();
        } catch {
          // 이미 풀린 훅
        }
      }
      if (current === connection) {
        current = null;
      }
      void connection.dispose();
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
