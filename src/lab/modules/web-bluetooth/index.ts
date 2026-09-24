/**
 * 실제 블루투스(Web Bluetooth) 모듈의 화면 쪽(PLAN §8.4 P4-04, 규약은 src/lab/README.md 4.3).
 * 논리는 `src/lab/ble/`(연결·쓰기 차례·브릿지 통로·이름 규칙)에 있고, 이 파일은 그것을 패널 DOM에 잇기만 한다.
 *
 * 하는 일
 * 1. 연결 객체 하나(`BleConnection`)를 만들고 [블루투스 보드 연결]·[다시 연결]·[연결 끊기]·보내기·이름 앞부분을 잇는다.
 *    **선택 창은 클릭 처리기 안에서 곧바로 연다**(`void connection.connect()`) — 사용자 조작 밖에서는 브라우저가 열어 주지 않는다.
 * 2. 브릿지 통로 `ble`을 등록표에 끼운다(registerBleChannel). P4-02의 [보내기] 패널이 이 통로를 고르면
 *    `bluetooth.init(...).send("355,152")`가 진짜 보드로 나간다.
 * 3. 보드가 보낸 값(알림)은 패널과 **실습실 콘솔**에 줄 단위로 보여 준다(학생이 결과를 한 곳에서 본다).
 * 4. 이 브라우저에서 안 되면(아이폰·Firefox 등) 한국어로 까닭을 적고 **가상 블루투스로 이어 가는 길**을 보여 준다.
 * 5. 패널은 코드가 블루투스를 쓸 때만 연다(README 4.3). 다른 모듈이 열고 싶으면 창 이벤트 `apc:web-bluetooth-show`.
 *
 * 저장하는 것(이 컴퓨터의 브라우저에만, [기록 지우기]가 함께 지운다): 선택 창의 이름 앞부분(`module:web-bluetooth:prefix`)과
 * [가까운 기기 모두 보기](`module:web-bluetooth:accept-all`). **기기 주소·기기 이름은 저장하지 않는다**(PLAN §10).
 */
import { readItem, writeItem } from '../../../lib/storage.ts';
import {
  BLE_SHOW_EVENT,
  BleConnection,
  DEFAULT_NAME_PREFIX,
  bleText,
  checkPrefix,
  detectBleSupport,
  initLineFor,
  longValueNotice,
  normalizePrefix,
  registerBleChannel,
  suggestBoardName,
  tooLongForOneWrite,
  type BleSnapshot,
} from '../../ble/index.ts';
import { RECORDS_CLEARED_EVENT } from '../../controls/records.ts';
import { showPanelWhenUsed } from '../panel-when-used.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import manifest from './manifest.ts';

/** 다른 모듈·페이지가 블루투스 칸을 열고 싶을 때 보내는 창 이벤트(이름은 통로 파일 한 곳에 있다) */
export const BLE_REAL_SHOW_EVENT: string = BLE_SHOW_EVENT;

/**
 * 코드에 이런 이름이 보이면 패널을 연다.
 * - ESP32 실습실: 보드 코드가 쓰는 `ESP32BLE`·`ubluetooth`·`bluetooth`
 * - 영상처리 실습실: 컴퓨터 쪽 원본이 쓰는 `import bluetooth`·`bluetooth_lib`
 */
export const BLE_CODE_PATTERN = /\bESP32BLE\b|\bu?bluetooth\b|\bbluetooth_lib\b/u;

/** 콘솔에 적는 줄 수 제한(끊임없이 오는 값으로 실행 결과가 덮이지 않게 — 데이터 포트와 같은 규칙) */
const CONSOLE_LINE_LIMIT = 200;

/** 이 페이지의 연결 하나(브릿지 통로가 나중에 찾아 쓴다) */
let current: BleConnection | null = null;
/** 브릿지 통로 등록은 페이지에 한 번만 */
let registered = false;

const BADGE: Readonly<Record<string, string>> = {
  unsupported: '쓸 수 없음',
  idle: '연결 전',
  choosing: '기기 고르는 중',
  connecting: '잇는 중',
  open: '연결됨',
  error: '문제 있음',
};

function textOf(element: HTMLElement | null, value: string): void {
  if (element) {
    element.textContent = value;
  }
}

function mount(context: LabModuleContext): LabModuleHandle | void {
  const panel = context.panel;
  const root = panel?.querySelector<HTMLElement>('[data-ble-real]') ?? null;
  if (!panel || !root) {
    return;
  }
  const lab = context.lab;
  const cleanups: (() => void)[] = [];
  const find = <T extends HTMLElement>(selector: string): T | null => root.querySelector<T>(selector);
  const listen = <T extends EventTarget>(target: T, type: string, handler: (event: Event) => void): void => {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };

  const prefixName = `module:${manifest.id}:prefix`;
  const acceptAllName = `module:${manifest.id}:accept-all`;
  const savedPrefix = normalizePrefix(readItem(prefixName));
  const savedAcceptAll = readItem(acceptAllName) === 'yes';

  const connection = new BleConnection({
    ...(savedPrefix === '' ? {} : { namePrefix: savedPrefix }),
    acceptAll: savedAcceptAll,
  });
  current = connection;
  if (!registered) {
    registerBleChannel(() => current);
    registered = true;
  }

  const badge = find<HTMLElement>('[data-ble-real-badge]');
  const status = find<HTMLElement>('[data-ble-real-status]');
  const device = find<HTMLElement>('[data-ble-real-device]');
  const problem = find<HTMLElement>('[data-ble-real-problem]');
  const problemText = find<HTMLElement>('[data-ble-real-problem-text]');
  const problemAdvice = find<HTMLElement>('[data-ble-real-problem-advice]');
  const unsupported = find<HTMLElement>('[data-ble-real-unsupported]');
  const unsupportedText = find<HTMLElement>('[data-ble-real-unsupported-text]');
  const unsupportedAdviceNode = find<HTMLElement>('[data-ble-real-unsupported-advice]');
  const fallback = find<HTMLElement>('[data-ble-real-fallback]');
  const prefixInput = find<HTMLInputElement>('[data-ble-real-prefix]');
  const acceptAllInput = find<HTMLInputElement>('[data-ble-real-accept-all]');
  const nameIssues = find<HTMLElement>('[data-ble-real-name-issues]');
  const seatInput = find<HTMLInputElement>('[data-ble-real-seat]');
  const initLine = find<HTMLElement>('[data-ble-real-init-line]');
  const log = find<HTMLElement>('[data-ble-real-log]');
  const hex = find<HTMLElement>('[data-ble-real-hex]');
  const counts = find<HTMLElement>('[data-ble-real-counts]');
  const form = find<HTMLFormElement>('[data-ble-real-form]');
  const sendText = find<HTMLInputElement>('[data-ble-real-text]');
  const newline = find<HTMLInputElement>('[data-ble-real-newline]');
  const warning = find<HTMLElement>('[data-ble-real-warning]');
  const connectButton = find<HTMLButtonElement>('[data-ble-real-action="connect"]');
  const reconnectButton = find<HTMLButtonElement>('[data-ble-real-action="reconnect"]');
  const disconnectButton = find<HTMLButtonElement>('[data-ble-real-action="disconnect"]');
  const clearButton = find<HTMLButtonElement>('[data-ble-real-action="clear"]');
  const virtualButton = find<HTMLButtonElement>('[data-ble-real-action="virtual"]');

  if (prefixInput && savedPrefix !== '') {
    prefixInput.value = savedPrefix;
  }
  if (acceptAllInput) {
    acceptAllInput.checked = savedAcceptAll;
  }

  const showWarning = (text: string | null): void => {
    if (!warning) {
      return;
    }
    warning.textContent = text ?? '';
    warning.hidden = text === null;
  };

  const showNameIssues = (value: string): void => {
    if (!nameIssues) {
      return;
    }
    const issues = checkPrefix(value);
    nameIssues.textContent = issues.map((issue) => issue.text).join(' ');
    nameIssues.hidden = issues.length === 0;
  };

  const render = (snapshot: BleSnapshot): void => {
    root.dataset.bleRealState = snapshot.state;
    root.dataset.bleRealConnected = String(snapshot.state === 'open');
    root.dataset.bleRealSent = String(snapshot.sent);
    root.dataset.bleRealReceived = String(snapshot.received);
    textOf(badge, BADGE[snapshot.state] ?? snapshot.state);
    textOf(status, bleText.state(snapshot.state, snapshot.deviceName));
    if (device) {
      device.hidden = snapshot.deviceName === '' && snapshot.state !== 'open';
      device.textContent = device.hidden ? '' : bleText.deviceLine(snapshot.deviceName);
    }
    if (problem) {
      const show = snapshot.problem !== null && snapshot.problem.code !== 'unsupported';
      problem.hidden = !show;
      textOf(problemText, show ? snapshot.problem?.text ?? '' : '');
      textOf(problemAdvice, show ? snapshot.problem?.advice ?? '' : '');
    }
    if (connectButton) {
      connectButton.hidden = snapshot.state === 'open';
      connectButton.disabled = !snapshot.supported || snapshot.state === 'choosing' || snapshot.state === 'connecting';
      connectButton.textContent = snapshot.hasDevice ? '다른 보드 고르기' : '블루투스 보드 연결';
    }
    if (reconnectButton) {
      reconnectButton.hidden = !snapshot.hasDevice || snapshot.state === 'open' || !snapshot.supported;
      reconnectButton.disabled = snapshot.state === 'choosing' || snapshot.state === 'connecting';
    }
    if (disconnectButton) {
      disconnectButton.hidden = snapshot.state !== 'open';
    }
    textOf(counts, bleText.counts(snapshot.sent, snapshot.received, snapshot.queued));
    if (log) {
      log.textContent = snapshot.lines.length === 0 ? '아직 주고받은 것이 없어요.' : snapshot.lines.join('\n');
    }
    textOf(hex, snapshot.lastHex === '' ? '—' : snapshot.lastHex);
    if (prefixInput && document.activeElement !== prefixInput && prefixInput.value !== snapshot.namePrefix) {
      prefixInput.value = snapshot.namePrefix;
    }
  };

  cleanups.push(connection.subscribe(render));

  // ── 보드가 보낸 값을 실습실 콘솔에도 줄 단위로 ──
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
          lab.appendConsole('[안내] 받은 줄이 많아 콘솔에는 더 적지 않아요. 블루투스 칸에서 볼 수 있어요.\n', 'notice');
          return;
        }
        lab.appendConsole(`${bleText.receivedLine(line)}\n`, 'notice');
      }
    }),
  );

  // ── 이 브라우저에서 되는지 ──
  const gate = showPanelWhenUsed(context, BLE_CODE_PATTERN);
  listen(window, BLE_REAL_SHOW_EVENT, () => gate.show());

  if (fallback) {
    fallback.textContent = bleText.fallbackToVirtual(context.labId);
  }
  if (virtualButton) {
    virtualButton.hidden = context.labId !== 'esp32';
  }
  if (!connection.supported && unsupported) {
    unsupported.hidden = false;
  }
  void detectBleSupport()
    .then((support) => {
      if (support.level === 'supported') {
        return;
      }
      if (unsupported) {
        unsupported.hidden = false;
        // 권하는 브라우저인데 기능이 꺼진·막힌 경우는 학생이 고칠 것이 없는 안내라 파랑(안내) 상자로(2026-09-25 Phase 4 검토 반영)
        unsupported.dataset.kind = support.recommended && support.level === 'unsupported' ? 'blocked' : 'browser';
      }
      textOf(unsupportedText, support.summary);
      textOf(unsupportedAdviceNode, support.advice);
    })
    .catch(() => undefined);

  // ── 조작 ──
  if (connectButton) {
    listen(connectButton, 'click', () => {
      gate.show();
      showWarning(null);
      // ⚠ 클릭 처리기 안에서 **기다리지 않고 바로** 부른다(requestDevice는 사용자 조작 안에서만 열린다).
      void connection.connect();
    });
  }
  if (reconnectButton) {
    listen(reconnectButton, 'click', () => {
      showWarning(null);
      void connection.reconnect();
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
  if (virtualButton) {
    listen(virtualButton, 'click', () => {
      // 가상 보드의 블루투스 조작 칸(P4-03)으로 데려간다 — 같은 값을 같은 코드로 보내 볼 수 있다.
      const target = document.querySelector<HTMLElement>('[data-ble-connect]');
      if (target === null) {
        lab.showMessage(bleText.noVirtualPanel());
        return;
      }
      target.scrollIntoView({ block: 'center', behavior: 'auto' });
      target.focus();
      lab.showMessage(bleText.movedToVirtual());
    });
  }
  if (prefixInput) {
    listen(prefixInput, 'input', () => {
      const value = normalizePrefix(prefixInput.value);
      connection.setNamePrefix(value);
      writeItem(prefixName, value);
      showNameIssues(prefixInput.value);
    });
    showNameIssues(prefixInput.value);
  }
  if (acceptAllInput) {
    listen(acceptAllInput, 'change', () => {
      connection.setAcceptAll(acceptAllInput.checked);
      writeItem(acceptAllName, acceptAllInput.checked ? 'yes' : 'no');
    });
  }
  if (seatInput && initLine) {
    listen(seatInput, 'input', () => {
      const seat = Number(seatInput.value);
      initLine.textContent = initLineFor(suggestBoardName(Number.isFinite(seat) ? seat : 1));
    });
  }
  if (form) {
    listen(form, 'submit', (event) => {
      event.preventDefault();
      const value = sendText?.value ?? '';
      const text = newline?.checked === false ? value : `${value}\n`;
      const bytes = new TextEncoder().encode(text);
      // 20바이트가 넘으면 미리 알리되 **막지는 않는다** — 실물 보드가 앞부분만 받는 것을 보는 것이 실습 내용이다(§7.7).
      showWarning(tooLongForOneWrite(bytes) ? longValueNotice(text, bytes.length) : null);
      connection
        .write(bytes)
        .then(() => {
          lab.appendConsole(`${bleText.sentLine(text.replace(/\n$/u, '\\n'))}\n`, 'notice');
        })
        .catch((error: unknown) => {
          lab.showMessage(error instanceof Error ? error.message : String(error));
        });
    });
  }

  const onRecordsCleared = (): void => {
    // [이 컴퓨터에서 내 기록 지우기]는 저장을 이미 지웠다 — 화면도 처음 값으로 되돌린다.
    connection.setNamePrefix(DEFAULT_NAME_PREFIX);
    connection.setAcceptAll(false);
    if (prefixInput) {
      prefixInput.value = DEFAULT_NAME_PREFIX;
    }
    if (acceptAllInput) {
      acceptAllInput.checked = false;
    }
    showNameIssues('');
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
      connection.dispose();
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
