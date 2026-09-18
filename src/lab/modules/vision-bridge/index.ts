/**
 * 영상처리 실습실 ↔ 가상 보드 선의 화면 쪽(P4-02, PLAN §8.4 설계 메모·§7.3·§7.6).
 *
 * 한 폴더에 두 역할이 들어 있다(manifest.labs = ['vision', 'esp32'] — 선은 양 끝이 있어야 이어진다).
 *  - 영상처리 실습실('pc'): [보내기] 패널(통로 고르기·접두어·손으로 보내기·주고받은 글)과 **한 화면 모드**(iframe으로 ESP32 실습실).
 *    파이썬 serial.py가 보낸 바이트는 serial-pc 모듈이 같은 선(link.ts)에 넣는다.
 *  - ESP32 실습실('board'): 받은 바이트를 가상 USB-UART 변환기 부품에 넣고(채널 'board.device.input'),
 *    보드가 내보낸 바이트를 컴퓨터로 돌려보낸다(이벤트 'board.uart.tx' 또는 부품 상태 'board.device'에서 늘어난 만큼 — board-uart.ts).
 *
 * 한 화면 모드도 두 탭과 **같은 통로**(BroadcastChannel)를 쓴다: iframe은 같은 출처의 다른 문서라 그대로 통한다.
 * 그래서 학생이 보는 코드와 동작이 두 모드에서 똑같다(§7.2 규칙 6).
 *
 * 테스트가 읽는 값: 패널 뿌리 [data-bridge-panel]의 data-bridge-role·data-bridge-state·data-bridge-peers·
 * data-bridge-sent·data-bridge-received, 실습실 뿌리의 data-bridge-frame(한 화면 모드 on/off).
 */
import { listBridgeChannels } from '../../bridge/index.ts';
import { withBase } from '../../../lib/url.ts';
import { showPanelWhenUsed } from '../panel-when-used.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import { deviceInputFor, newBytesFrom, readUartDevice, readUartTxEvent } from './board-uart.ts';
import { PREFIX_QUERY_NAME, dropBridgeLink, getBridgeLink, type LinkStatus, type UartFrame } from './link.ts';
import manifest from './manifest.ts';

/** 보드 쪽 부품 흉내에 값을 넣는 채널(board 모듈이 정한 이름 — manifest.ts 머리말) */
const BOARD_DEVICE_INPUT = 'board.device.input';
/** 보드 부품 상태 이벤트(board 모듈) */
const BOARD_DEVICE_EVENT = 'board.device';
/** 보드가 시리얼 선으로 내보낸 바이트(Phase 4 준비가 이름만 열어 둔 이벤트) */
const BOARD_UART_TX_EVENT = 'board.uart.tx';
/** 보드 핀 상태 이벤트(실행 시작을 알아채는 데 쓴다) */
const BOARD_STATE_EVENT = 'board.state';

/** 한 화면 모드·새 탭에서 열 보드 예제(한 줄 = 짝 하나. 새 짝은 여기에 한 줄 더하면 된다) */
export const BOARD_EXAMPLES: readonly { file: string; label: string }[] = Object.freeze([
  { file: 'esp32/u3/3-1-2-uart-laser.py', label: '3-1-2 기본 — UART로 받은 a·b로 레이저(원본 f082)' },
  { file: 'esp32/u3/3-1-2-uart-laser-boot.py', label: '3-1-2 기본 — boot.py판(원본 f083, 4번 줄에서 멈춤)' },
  { file: '', label: '빈 실습실로 열기' },
]);

/** 코드에 이 낱말이 보이면 패널을 연다(영상처리 실습실) */
const PC_USE_PATTERN = /\bimport\s+serial\b|\bserial\s*\.\s*Serial\b|\blist_ports\b/u;
/** ESP32 실습실 쪽 */
const BOARD_USE_PATTERN = /\bUART\s*\(|\bimport\s+serial\b/u;
/** 주고받은 글 목록에 남길 줄 수 */
const LOG_LIMIT = 40;

/** ESP32 실습실 주소를 만든다(한 화면 모드는 ?embed=1로 머리글·바닥글을 숨긴다 — P2-14와 같은 방식) */
export function boardLabUrl(options: { prefix: string; example?: string; embed?: boolean }): string {
  const params = new URLSearchParams();
  if (options.example !== undefined && options.example !== '') {
    params.set('example', options.example);
  }
  params.set(PREFIX_QUERY_NAME, options.prefix);
  if (options.embed === true) {
    params.set('embed', '1');
  }
  return `${withBase('labs/esp32/')}?${params.toString()}`;
}

/** 글로 보여 줄 수 없는 글자(줄바꿈·탭은 뺀 제어 문자와 깨진 글자 표시) */
function isUnreadable(code: number): boolean {
  const isControl = code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d;
  return isControl || code === 0x7f || code === 0xfffd;
}

/** 바이트를 사람이 읽을 수 있는 한 줄로(글자로 읽히면 글자, 아니면 16진수) */
export function previewBytes(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const readable = Array.from(text).every((char) => !isUnreadable(char.codePointAt(0) ?? 0));
  if (readable) {
    return text.replace(/\r/gu, '\\r').replace(/\n/gu, '\\n');
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function mount(context: LabModuleContext): LabModuleHandle {
  const role: 'pc' | 'board' = context.labId === 'esp32' ? 'board' : 'pc';
  const link = getBridgeLink(context.root, {
    from: role,
    search: typeof location === 'undefined' ? '' : location.search,
  });
  const panel = context.panel;
  const panelGate = showPanelWhenUsed(context, role === 'board' ? BOARD_USE_PATTERN : PC_USE_PATTERN);
  const cleanups: (() => void)[] = [];
  const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void): void => {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };
  const find = <T extends HTMLElement>(selector: string): T | null => panel?.querySelector<T>(selector) ?? null;

  // ── 패널 요소 ──
  const root = find<HTMLElement>('[data-bridge-panel]');
  const channelSelect = find<HTMLSelectElement>('[data-bridge-channel]');
  const statusText = find<HTMLElement>('[data-bridge-status]');
  const noticeText = find<HTMLElement>('[data-bridge-notice]');
  const errorText = find<HTMLElement>('[data-bridge-error]');
  const prefixText = find<HTMLElement>('[data-bridge-prefix]');
  const newPrefixButton = find<HTMLButtonElement>('[data-bridge-new-prefix]');
  const pinCheck = find<HTMLInputElement>('[data-bridge-pin]');
  const prefixInput = find<HTMLInputElement>('[data-bridge-prefix-input]');
  const prefixApply = find<HTMLButtonElement>('[data-bridge-prefix-apply]');
  const exampleSelect = find<HTMLSelectElement>('[data-bridge-board-example]');
  const openFrameButton = find<HTMLButtonElement>('[data-bridge-open-frame]');
  const openTabButton = find<HTMLButtonElement>('[data-bridge-open-tab]');
  const frameHost = find<HTMLElement>('[data-bridge-frame-host]');
  const closeFrameButton = find<HTMLButtonElement>('[data-bridge-close-frame]');
  const practiceBox = find<HTMLElement>('[data-bridge-practice]');
  const practiceSteps = find<HTMLElement>('[data-bridge-practice-steps]');
  const sendForm = find<HTMLFormElement>('[data-bridge-send-form]');
  const sendInput = find<HTMLInputElement>('[data-bridge-send-input]');
  const endingSelect = find<HTMLSelectElement>('[data-bridge-send-ending]');
  const logList = find<HTMLElement>('[data-bridge-log]');

  const showError = (text: string | null): void => {
    if (errorText === null) {
      return;
    }
    errorText.textContent = text ?? '';
    errorText.hidden = text === null;
  };

  /**
   * 예제 사이드카의 "실습 방법"(practice)을 패널 위에 보인다. ESP32 실습실은 보드 그림 위(BoardIo.astro)에 같은 것을 보여 주지만
   * 영상처리 실습실에는 보드 그림이 없어서, 짝 예제를 어떻게 여는지 알려 줄 자리가 여기밖에 없다.
   */
  const showPractice = (steps: readonly string[] | undefined): void => {
    if (practiceBox === null || practiceSteps === null) {
      return;
    }
    practiceSteps.replaceChildren();
    for (const step of steps ?? []) {
      const item = document.createElement('li');
      item.textContent = step;
      practiceSteps.append(item);
    }
    practiceBox.hidden = practiceSteps.childElementCount === 0;
  };

  const addLog = (way: 'in' | 'out', bytes: Uint8Array): void => {
    if (logList === null) {
      return;
    }
    const item = document.createElement('li');
    item.dataset.way = way;
    item.textContent = `${way === 'out' ? '→' : '←'} ${previewBytes(bytes)}`;
    logList.append(item);
    while (logList.childElementCount > LOG_LIMIT) {
      logList.firstElementChild?.remove();
    }
    logList.scrollTop = logList.scrollHeight;
  };

  const statusLine = (status: LinkStatus): string => {
    if (status.state !== 'open') {
      return status.state === 'connecting' ? '통로를 여는 중이에요…' : '아직 잇지 않았어요.';
    }
    if (status.peers.length === 0) {
      return role === 'board'
        ? `${status.label} 통로를 열고 컴퓨터(영상처리 실습실)를 기다려요.`
        : `${status.label} 통로를 열었어요. ESP32 실습실 화면을 열면 이어져요.`;
    }
    return role === 'board' ? '컴퓨터(영상처리 실습실)와 이어졌어요.' : '가상 ESP32 보드와 이어졌어요.';
  };

  const render = (status: LinkStatus): void => {
    if (root !== null) {
      root.dataset.bridgeRole = role;
      root.dataset.bridgeState = status.state;
      root.dataset.bridgePeers = String(status.peers.length);
      root.dataset.bridgeSent = String(status.sentBytes);
      root.dataset.bridgeReceived = String(status.receivedBytes);
      root.dataset.bridgePrefix = status.prefix;
    }
    if (statusText !== null) {
      const text = statusLine(status);
      if (statusText.textContent !== text) {
        statusText.textContent = text;
      }
    }
    if (noticeText !== null) {
      noticeText.textContent = status.notice ?? '';
    }
    if (prefixText !== null) {
      prefixText.textContent = status.prefix;
    }
    if (pinCheck !== null && pinCheck.checked !== status.pinned) {
      pinCheck.checked = status.pinned;
    }
    if (channelSelect !== null && channelSelect.value !== status.channelId) {
      channelSelect.value = status.channelId;
    }
    showError(status.error);
  };

  // ── 통로 목록·접두어 ──
  if (channelSelect !== null) {
    for (const factory of listBridgeChannels(true)) {
      // 같은 탭 직접 연결(direct)은 화면에서 고를 것이 아니다(한 화면 모드도 탭 통로를 쓴다 — 머리말).
      if (factory.id === 'direct') {
        continue;
      }
      const option = document.createElement('option');
      option.value = factory.id;
      option.textContent = factory.label;
      channelSelect.append(option);
    }
    listen(channelSelect, 'change', () => {
      void link.connect(channelSelect.value).then(render);
    });
  }
  if (exampleSelect !== null) {
    for (const example of BOARD_EXAMPLES) {
      const option = document.createElement('option');
      option.value = example.file;
      option.textContent = example.label;
      exampleSelect.append(option);
    }
  }
  if (newPrefixButton !== null) {
    listen(newPrefixButton, 'click', () => {
      void link.newPrefix().then(render);
    });
  }
  if (pinCheck !== null) {
    listen(pinCheck, 'change', () => render(link.setPinned(pinCheck.checked)));
  }
  if (prefixApply !== null && prefixInput !== null) {
    listen(prefixApply, 'click', () => {
      void link.setPrefix(prefixInput.value).then((status) => {
        render(status);
        if (status.error === null) {
          prefixInput.value = '';
        }
      });
    });
  }

  // ── 한 화면 모드(iframe) ──
  let frame: HTMLIFrameElement | null = null;
  const closeFrame = (): void => {
    frame?.remove();
    frame = null;
    if (frameHost !== null) {
      frameHost.hidden = true;
    }
    context.root.dataset.bridgeFrame = 'off';
  };
  const openFrame = (): void => {
    if (frameHost === null) {
      return;
    }
    closeFrame();
    const url = boardLabUrl({ prefix: link.prefix, example: exampleSelect?.value ?? '', embed: true });
    frame = document.createElement('iframe');
    frame.src = url;
    frame.title = 'ESP32 실습실(한 화면 모드)';
    frame.dataset.bridgeFrameView = '';
    frameHost.hidden = false;
    frameHost.append(frame);
    context.root.dataset.bridgeFrame = 'on';
    panelGate.show();
    void link.connect().then(render);
  };
  if (openFrameButton !== null) {
    listen(openFrameButton, 'click', openFrame);
  }
  if (closeFrameButton !== null) {
    listen(closeFrameButton, 'click', closeFrame);
  }
  if (openTabButton !== null) {
    listen(openTabButton, 'click', () => {
      void link.connect().then(render);
      window.open(boardLabUrl({ prefix: link.prefix, example: exampleSelect?.value ?? '' }), '_blank', 'noopener');
    });
  }

  // ── 손으로 보내기 ──
  if (sendForm !== null && sendInput !== null) {
    listen(sendForm, 'submit', (event) => {
      event.preventDefault();
      const text = `${sendInput.value}${endingSelect?.value === 'lf' ? '\n' : ''}`;
      if (text === '') {
        showError('보낼 글자를 적어요.');
        return;
      }
      const bytes = new TextEncoder().encode(text);
      void link.connect().then(() => {
        link.sendBytes(bytes, { baud: 0 });
        addLog('out', bytes);
        sendInput.value = '';
        sendInput.focus();
      });
    });
  }

  // ── 선에서 오는 것 ──
  const offs = [
    link.onStatus(render),
    link.onFrame((frameIn: UartFrame) => {
      if (frameIn.from === role) {
        return;
      }
      addLog('in', frameIn.bytes);
    }),
    link.onWarn((warning) => showError(warning.text)),
  ];

  // ── ESP32 실습실 쪽 잇기 ──
  if (role === 'board') {
    let instanceId: string | null = null;
    let seenTotal = 0;
    let sawTxEvent = false;
    let warnedNoUart = false;
    let warnedMissed = false;

    const uartInstanceId = (): string => {
      if (instanceId !== null) {
        return instanceId;
      }
      const drawn = context.root.querySelector<HTMLElement>('[data-board-part][data-part="uart"]');
      return drawn?.dataset.boardPart ?? 'uart';
    };

    offs.push(
      context.runtime.on('event', (event) => {
        if (event.kind === BOARD_DEVICE_EVENT) {
          const reading = readUartDevice(event.payload);
          if (reading === null) {
            return;
          }
          instanceId = reading.id;
          if (sawTxEvent) {
            seenTotal = reading.rxTotal;
            return;
          }
          const next = newBytesFrom(seenTotal, reading);
          seenTotal = next.total;
          if (next.bytes.length > 0) {
            link.sendBytes(next.bytes, { baud: reading.baud });
            addLog('out', next.bytes);
          }
          if (next.missed > 0 && !warnedMissed) {
            warnedMissed = true;
            context.notice(`보드가 아주 빨리 보내서 ${next.missed}바이트는 컴퓨터로 넘기지 못했어요(화면이 16ms마다 모아서 받기 때문이에요).`);
          }
          return;
        }
        if (event.kind === BOARD_UART_TX_EVENT) {
          const tx = readUartTxEvent(event.payload);
          if (tx === null) {
            return;
          }
          sawTxEvent = true;
          instanceId = tx.id;
          link.sendBytes(tx.bytes, { baud: tx.baud });
          addLog('out', tx.bytes);
          return;
        }
        if (event.kind === BOARD_STATE_EVENT && (event.payload as { reason?: unknown })?.reason === 'reset') {
          seenTotal = 0;
          warnedMissed = false;
          warnedNoUart = false;
        }
      }),
      link.onFrame((frameIn: UartFrame) => {
        if (frameIn.from === 'board' || frameIn.bytes.length === 0) {
          return;
        }
        // 화면 → 파이썬 부품 흉내(board 모듈이 정한 채널). 보드가 도는 동안 보낸 것만 받는다(실물과 같다).
        context.runtime.pushEvent(BOARD_DEVICE_INPUT, deviceInputFor(uartInstanceId(), frameIn.bytes, frameIn.baud));
        if (context.runtime.state !== 'running' && !warnedNoUart) {
          warnedNoUart = true;
          context.notice('컴퓨터가 글자를 보냈지만 보드가 아직 돌지 않아요. ESP32 실습실에서 [실행]을 먼저 눌러요(보드가 꺼져 있을 때 온 글자는 실물처럼 사라져요).');
        }
      }),
    );
  }

  // ── 예제가 바뀌면 실습 방법도 바뀐다 ──
  showPractice(context.lab.currentExample?.practice);
  context.onLab('example', ({ example: loaded }) => showPractice(loaded?.practice));

  // ── 언제 통로를 여나 ──
  const autoConnect = (code: string): void => {
    const wanted = (role === 'board' ? BOARD_USE_PATTERN : PC_USE_PATTERN).test(code);
    if (wanted && link.status.state === 'closed') {
      void link.connect().then(render);
    }
  };
  context.onLab('code', ({ code }) => autoConnect(code));
  context.onLab('run', () => {
    // 실행을 새로 시작하면 지난 실행에서 밀려 있던 것을 버린다.
    link.reset();
    autoConnect(context.lab.getCode());
  });
  // 주소로 접두어를 받았으면(한 화면 모드의 iframe·[새 탭에서 열기]) 코드와 상관없이 바로 연다.
  if (typeof location !== 'undefined' && location.search.includes(`${PREFIX_QUERY_NAME}=`)) {
    panelGate.show();
    void link.connect().then(render);
  } else {
    autoConnect(context.lab.getCode());
  }

  context.root.dataset.bridgeFrame = context.root.dataset.bridgeFrame ?? 'off';
  render(link.status);
  return {
    dispose() {
      for (const off of offs) {
        off();
      }
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
      closeFrame();
      // 선을 닫기만 하면 WeakMap에 닫힌 선이 남아, 같은 화면을 다시 mount했을 때 죽은 선을 받는다.
      dropBridgeLink(context.root);
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
