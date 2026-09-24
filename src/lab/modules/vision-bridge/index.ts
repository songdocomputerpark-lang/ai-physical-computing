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
 * data-bridge-sent·data-bridge-received·data-bridge-board-run(컴퓨터 쪽이 아는 보드 실행 상태 idle·running),
 * 실습실 뿌리의 data-bridge-frame(한 화면 모드 on/off), 보드 쪽 역할 띠 [data-bridge-role-band]의 data-running·data-peer.
 *
 * 실행 상태 되알림(2026-09-25 Phase 4 검토 반영): 보드 쪽은 컴퓨터 쪽이 나타날 때·[실행]이 시작되고 끝날 때·돌지 않는데 글자가
 * 왔을 때 'idle'·'running'을 알린다(link.sendState — 같은 컴퓨터 탭 통로에서만). 컴퓨터 쪽은 상태 줄에 적고, 코드가 도는 중에
 * 'idle'을 받으면 콘솔에도 한 번 안내한다 — 전에는 "보드가 아직 돌지 않아요"가 보드 탭 콘솔에만 있었다.
 */
import { listBridgeChannels, onBridgeChannelsChanged } from '../../bridge/index.ts';
import { registerMqttChannel } from '../../mqtt/index.ts';
import { withBase } from '../../../lib/url.ts';
import { revealElement } from '../../controls/reveal.ts';
import { showPanelWhenUsed } from '../panel-when-used.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import { deviceInputFor, newBytesFrom, readUartDevice, readUartTxEvent } from './board-uart.ts';
import { PREFIX_QUERY_NAME, dropBridgeLink, getBridgeLink, type LinkStatus, type PeerRunState, type UartFrame } from './link.ts';
import manifest from './manifest.ts';

/** 보드 쪽 부품 흉내에 값을 넣는 채널(board 모듈이 정한 이름 — manifest.ts 머리말) */
const BOARD_DEVICE_INPUT = 'board.device.input';
/** 보드 부품 상태 이벤트(board 모듈) */
const BOARD_DEVICE_EVENT = 'board.device';
/** 보드가 시리얼 선으로 내보낸 바이트(USB-UART 변환기 부품 apc_part_uart.py가 보낸다 — 2026-09-24 통합. 오기 전까지는 부품 상태의 꼬리로 받는다) */
const BOARD_UART_TX_EVENT = 'board.uart.tx';
/** 보드 핀 상태 이벤트(실행 시작을 알아채는 데 쓴다) */
const BOARD_STATE_EVENT = 'board.state';
/**
 * 가상 BLE 부품에 값을 넣는 창 이벤트(P4-03 — src/lab/modules/board/parts/ble/part.ts의 BLE_WRITE_EVENT와 같은 이름).
 * 배선에 USB-UART 변환기가 없고 블루투스만 있으면(보드가 ESP32BLE.read()로 받는 예제) 선으로 온 바이트를 이 길로 넣는다(2026-09-24 통합, 구역 G 요청 7).
 */
const BLE_WRITE_EVENT = 'apc:ble-write';

/**
 * 한 화면 모드·새 탭에서 열 보드 예제(한 줄 = 짝 하나. 새 짝은 여기에 한 줄 더하면 된다).
 * 첫 줄이 기본값이고, 영상처리 예제가 짝을 알면(BOARD_PAIR_OF) 그 짝을 먼저 고른다(2026-09-24 통합 — 구역 G 요청 1).
 * 3-1-2의 기본 짝은 사이트판이다(PLAN §7.5 예시 2 "가상 보드 f082(사이트판)") — 원본 f082는 a를 한 번 받으면 NameError로 멈춰서
 * 두 화면이 이어지는 것을 끝까지 보기 어렵다. 원본은 바로 아래 줄에서 고를 수 있다(교과서 그대로 확인할 때).
 */
export const BOARD_EXAMPLES: readonly { file: string; label: string }[] = Object.freeze([
  { file: 'esp32/u3/3-1-2-uart-laser-site.py', label: '3-1-2 기본 — UART로 받은 a·b로 레이저 켜고 끄기(사이트판)' },
  { file: 'esp32/u3/3-1-2-uart-laser.py', label: '3-1-2 기본 — 원본 파일(f082, a를 받으면 12번 줄에서 NameError)' },
  { file: 'esp32/u3/3-1-2-uart-laser-boot.py', label: '3-1-2 기본 — boot.py판(원본 f083, 4번 줄에서 멈춤)' },
  { file: 'esp32/u4/c3-neopixel-count-rx.py', label: '보충 C3 — 받은 숫자만큼 네오픽셀 켜기(시나리오 F)' },
  { file: 'esp32/u4/c3-neopixel-count-rx-ble.py', label: '보충 C3 — 블루투스판(ESP32BLE.read()로 받기)' },
  { file: '', label: '빈 실습실로 열기' },
]);

/** 영상처리 예제 → 한 화면 모드·새 탭에서 먼저 고를 보드 짝 예제(예제가 바뀌면 목록 선택을 맞춘다 — 구역 G 요청 1) */
export const BOARD_PAIR_OF: Readonly<Record<string, string>> = Object.freeze({
  'vision/u3/3-1-2-uart-key-send.py': 'esp32/u3/3-1-2-uart-laser-site.py',
  'vision/u3/3-1-2-adv-face-uart.py': 'esp32/u3/3-1-2-uart-laser-site.py',
  'vision/u4/c3-finger-count-send.py': 'esp32/u4/c3-neopixel-count-rx.py',
});

/**
 * 코드에 이 낱말이 보이면 패널을 연다(영상처리 실습실). pyserial 흉내(serial)와 새 예제용 bridge 모듈(P4-08)이 같은 선을 쓴다 —
 * bridge만 쓴 예제도 받을 쪽이 없으면 BridgeNoPeer가 "[보내기] 패널의 …"을 가리키므로 패널이 보여야 한다(2026-09-24 통합).
 */
const PC_USE_PATTERN = /\bimport\s+serial\b|\bserial\s*\.\s*Serial\b|\blist_ports\b|\bimport\s+bridge\b|\bfrom\s+bridge\s+import\b/u;
/** ESP32 실습실 쪽 */
const BOARD_USE_PATTERN = /\bUART\s*\(|\bimport\s+serial\b/u;
/** 주고받은 글 목록에 남길 줄 수 */
const LOG_LIMIT = 40;
/**
 * 통로를 고르면 그 통로의 연결 칸을 연다(칸 모듈이 듣는 창 이벤트 — src/lab/ble/channel.ts BLE_SHOW_EVENT, data-port 모듈 머리말).
 * 두 칸은 코드에 그 이름이 없으면 닫혀 있어서, 원본 f084(시리얼)를 연 학생이 "블루투스(실제 보드)"를 골라도 [연결] 단추를 찾을 수 없었다
 * (2026-09-25 Phase 4 검토 반영). 이름만 적어 두고 모듈을 import하지 않는다 — 그 모듈이 이 실습실에 없으면 아무 일도 없다.
 */
const CHANNEL_PANEL: Readonly<Record<string, { event: string; panel: string }>> = Object.freeze({
  ble: { event: 'apc:web-bluetooth-show', panel: 'web-bluetooth' },
  serial: { event: 'apc:data-port-show', panel: 'data-port' },
});
/** 보드가 돌지 않는데 글자가 올 때 'idle'을 되알리는 최소 간격(밀리초) — 글자마다 보내지 않게 */
const IDLE_ECHO_MS = 2000;

/** 컴퓨터 쪽 콘솔에 남기는 안내(보드 쪽이 돌지 않는다고 알려 왔을 때) */
export const BOARD_NOT_RUNNING_NOTICE =
  '가상 보드(ESP32 실습실)가 돌고 있지 않아요. 보드 쪽 화면에서 [실행]을 눌러야 보낸 글자를 받아요(보드가 꺼져 있을 때 온 글자는 실물처럼 사라져요).';

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
  const sendForm = find<HTMLFormElement>('[data-bridge-send-form]');
  const sendInput = find<HTMLInputElement>('[data-bridge-send-input]');
  const endingSelect = find<HTMLSelectElement>('[data-bridge-send-ending]');
  const logList = find<HTMLElement>('[data-bridge-log]');
  const roleBand = find<HTMLElement>('[data-bridge-role-band]');
  /** 컴퓨터 쪽이 아는 보드의 실행 상태(보드가 알려 온 것. 모르면 null) */
  let boardRun: PeerRunState | null = null;
  /** 주소에 ?bridge=가 있으면 선의 한 끝으로 열린 화면이다(새 탭·한 화면 모드) */
  const openedAsPeer = typeof location !== 'undefined' && location.search.includes(`${PREFIX_QUERY_NAME}=`);
  const embedded = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-embed');
  const boardRunning = (): boolean => context.runtime.state === 'running' || context.runtime.state === 'stopping';

  /** 보드 쪽 역할 띠: 조작 줄 위로 옮겨 보인다(보드 쪽 화면을 ?bridge=로 열었을 때만) */
  function renderRoleBand(status: LinkStatus): void {
    if (roleBand === null || role !== 'board' || !openedAsPeer) {
      return;
    }
    if (roleBand.hidden) {
      const toolbar = context.root.querySelector('[data-lab-toolbar]');
      if (toolbar !== null && toolbar.parentElement !== null) {
        toolbar.parentElement.insertBefore(roleBand, toolbar);
      }
      const who = roleBand.querySelector('[data-bridge-role-who]');
      if (who !== null) {
        who.textContent = embedded ? '이 칸은 보드 쪽이에요' : '이 탭은 보드 쪽이에요';
      }
      roleBand.hidden = false;
    }
    const running = boardRunning();
    const peer = status.state === 'open' && status.peers.length > 0;
    roleBand.dataset.running = running ? 'yes' : 'no';
    roleBand.dataset.peer = peer ? 'yes' : 'no';
    const runText = roleBand.querySelector('[data-bridge-role-run]');
    const nextRun = running ? '보드가 돌고 있어요. 컴퓨터 쪽이 보낸 글자를 받아요.' : '먼저 [실행]을 눌러 두어요. 그래야 컴퓨터 쪽이 보낸 글자를 받아요.';
    if (runText !== null && runText.textContent !== nextRun) {
      runText.textContent = nextRun;
    }
    const peerText = roleBand.querySelector('[data-bridge-role-peer-text]');
    const nextPeer = peer ? '컴퓨터 쪽(영상처리 실습실)과 이어졌어요.' : '컴퓨터 쪽(영상처리 실습실)을 기다려요.';
    if (peerText !== null && peerText.textContent !== nextPeer) {
      peerText.textContent = nextPeer;
    }
  }

  const showError = (text: string | null): void => {
    if (errorText === null) {
      return;
    }
    errorText.textContent = text ?? '';
    errorText.hidden = text === null;
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
    if (role === 'board') {
      return '컴퓨터(영상처리 실습실)와 이어졌어요.';
    }
    if (boardRun === 'idle') {
      return '가상 ESP32 보드와 이어졌지만, 보드가 돌고 있지 않아요. 보드 쪽 화면에서 [실행]을 눌러요.';
    }
    return boardRun === 'running' ? '가상 ESP32 보드와 이어졌어요. 보드가 돌고 있어요.' : '가상 ESP32 보드와 이어졌어요.';
  };

  const render = (status: LinkStatus): void => {
    if (root !== null) {
      root.dataset.bridgeRole = role;
      root.dataset.bridgeState = status.state;
      root.dataset.bridgePeers = String(status.peers.length);
      root.dataset.bridgeSent = String(status.sentBytes);
      root.dataset.bridgeReceived = String(status.receivedBytes);
      root.dataset.bridgePrefix = status.prefix;
      root.dataset.bridgeBoardRun = boardRun ?? '';
    }
    renderRoleBand(status);
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
  // MQTT 통로도 두 실습실 모두에서 고를 수 있게 한다(PLAN §7.6 "같은 코드로 가상 보드·실제 보드·MQTT" — 2026-09-25 Phase 4 검토 반영:
  // 전에는 MQTT 모듈이 붙는 ESP32 실습실에만 있어 영상처리 실습실의 [보내기] 패널에는 MQTT가 없었다). 두 번 불러도 한 번만 등록된다.
  registerMqttChannel();
  /**
   * 통로 목록을 (다시) 그린다. 흉내 모듈이 붙는 차례는 매번 달라서(블루투스·USB 데이터 포트가 이 패널보다 늦게 붙을 수 있다)
   * 등록표가 바뀔 때마다, 그리고 목록을 열기 전(초점)에 다시 그린다 — 고른 값은 그대로 둔다(2026-09-25 Phase 4 검토 반영).
   */
  const renderChannelOptions = (): void => {
    if (channelSelect === null) {
      return;
    }
    const wanted = listBridgeChannels(true).filter((factory) => factory.id !== 'direct');
    const current = JSON.stringify([...channelSelect.options].map((option) => [option.value, option.textContent ?? '']));
    const next = JSON.stringify(wanted.map((factory) => [factory.id, factory.label]));
    if (current === next) {
      return;
    }
    const selected = link.status.channelId;
    channelSelect.replaceChildren(
      // 같은 탭 직접 연결(direct)은 화면에서 고를 것이 아니다(한 화면 모드도 탭 통로를 쓴다 — 머리말).
      ...wanted.map((factory) => {
        const option = document.createElement('option');
        option.value = factory.id;
        option.textContent = factory.label;
        return option;
      }),
    );
    if ([...channelSelect.options].some((option) => option.value === selected)) {
      channelSelect.value = selected;
    }
    if (root !== null) {
      root.dataset.bridgeChannels = wanted.map((factory) => factory.id).join(' ');
    }
  };
  if (channelSelect !== null) {
    renderChannelOptions();
    cleanups.push(onBridgeChannelsChanged(renderChannelOptions));
    listen(channelSelect, 'focus', renderChannelOptions);
    listen(channelSelect, 'change', () => {
      const wanted = CHANNEL_PANEL[channelSelect.value];
      if (wanted !== undefined) {
        window.dispatchEvent(new CustomEvent(wanted.event));
        // 칸이 열린 다음 그 칸으로 옮겨 [연결] 단추가 보이게 한다(이미 보이면 움직이지 않는다)
        requestAnimationFrame(() => revealElement(context.root.querySelector(`[data-lab-module-panel="${wanted.panel}"]`), { block: 'nearest' }));
      }
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
  // 영상처리 예제가 짝을 알면 보드에서 열 예제를 그 짝으로 맞춘다(학생이 목록을 고치면 그대로 둔다 — 예제를 바꿀 때만 다시 맞춘다).
  const selectPair = (file: string | undefined): void => {
    const pair = file === undefined ? undefined : BOARD_PAIR_OF[file];
    if (exampleSelect !== null && pair !== undefined && [...exampleSelect.options].some((option) => option.value === pair)) {
      exampleSelect.value = pair;
    }
  };
  if (role === 'pc') {
    selectPair(context.lab.currentExample?.file);
    context.onLab('example', ({ example: loaded }) => selectPair(loaded?.file));
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
    /*
     * 한 화면 모드의 보드 틀은 [보내기] 패널(실습실 아래쪽 넓은 줄)이 아니라 **입력·출력 칸 바로 아래**에 둔다 — 카메라 결과와
     * 가상 보드가 가까이 있어야 손가락을 펴면 링이 켜지는 것을 함께 본다(2026-09-25 Phase 4 검토 반영: 둘이 2,300px 떨어져 있었다).
     */
    const ioSection = context.root.querySelector<HTMLElement>('[data-lab-io]');
    const ioNotice = ioSection?.querySelector('[data-lab-io-output]') ?? null;
    if (ioSection !== null && frameHost.parentElement !== ioSection) {
      ioSection.insertBefore(frameHost, ioNotice);
      frameHost.dataset.bridgeFramePlace = 'io';
    }
    frameHost.hidden = false;
    frameHost.append(frame);
    context.root.dataset.bridgeFrame = 'on';
    panelGate.show();
    void link.connect().then(render);
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    frameHost.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
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
    let lastPeers = 0;
    let lastIdleEcho = -Infinity;
    const runState = (): PeerRunState => (boardRunning() ? 'running' : 'idle');
    offs.push(
      // 컴퓨터 쪽이 새로 보이면 지금 상태를 알린다(한 화면 모드는 iframe이 뜨자마자 'idle'을 받아 상태 줄에 적는다).
      link.onStatus((status) => {
        if (status.peers.length > lastPeers) {
          link.sendState(runState());
        }
        lastPeers = status.peers.length;
      }),
      // [실행]이 시작되고 끝날 때
      context.runtime.on('state', ({ state, previous }) => {
        const wasRunning = previous === 'running' || previous === 'stopping';
        const isRunning = state === 'running' || state === 'stopping';
        if (wasRunning !== isRunning) {
          link.sendState(isRunning ? 'running' : 'idle');
        }
        renderRoleBand(link.status);
      }),
    );
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
            // 보드 → 컴퓨터는 바이트 흐름이다 — 합치지 않고 이어 붙여 보낸다(link.sendStream, 2026-09-25 Phase 4 검토 반영).
            link.sendStream(next.bytes, { baud: reading.baud });
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
          link.sendStream(tx.bytes, { baud: tx.baud });
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
        // 배선에 USB-UART 변환기가 없고 블루투스 칸만 있으면(보충 C3 블루투스판처럼 ESP32BLE.read()로 받는 보드) 선으로 온 바이트를
        // 가상 BLE의 "상대 기기가 쓴 값"으로 넣는다 — 블루투스 칸이 연결까지 해 주고 20바이트 자르기도 실물처럼 한다.
        const drawnUart = context.root.querySelector('[data-board-part][data-part="uart"]');
        const drawnBle = context.root.querySelector('[data-board-part][data-part="ble"]');
        if (drawnUart === null && drawnBle !== null) {
          window.dispatchEvent(new CustomEvent(BLE_WRITE_EVENT, { detail: { bytes: Array.from(frameIn.bytes) } }));
          return;
        }
        // 화면 → 파이썬 부품 흉내(board 모듈이 정한 채널). 보드가 도는 동안 보낸 것만 받는다(실물과 같다).
        context.runtime.pushEvent(BOARD_DEVICE_INPUT, deviceInputFor(uartInstanceId(), frameIn.bytes, frameIn.baud));
        if (context.runtime.state !== 'running') {
          // 보낸 쪽(컴퓨터 탭)에도 알린다 — 그쪽 화면에는 "이어졌어요"만 보인다(2026-09-25 Phase 4 검토 반영).
          const now = Date.now();
          if (now - lastIdleEcho >= IDLE_ECHO_MS) {
            lastIdleEcho = now;
            link.sendState('idle');
          }
          if (!warnedNoUart) {
            warnedNoUart = true;
            context.notice('컴퓨터가 글자를 보냈지만 보드가 아직 돌지 않아요. ESP32 실습실에서 [실행]을 먼저 눌러요(보드가 꺼져 있을 때 온 글자는 실물처럼 사라져요).');
          }
        }
      }),
    );
  }

  // ── 컴퓨터 쪽: 보드가 알려 온 실행 상태 ──
  if (role === 'pc') {
    let noticedThisRun = false;
    offs.push(
      link.onPeerState((state, from) => {
        if (from !== 'board') {
          return;
        }
        boardRun = state;
        render(link.status);
        const pcRunning = context.runtime.state === 'running';
        if (state === 'idle' && pcRunning && !noticedThisRun) {
          noticedThisRun = true;
          context.notice(BOARD_NOT_RUNNING_NOTICE);
        }
      }),
      link.onStatus((status) => {
        // 보드가 사라지면 알던 상태도 버린다
        if (boardRun !== null && !status.peers.includes('board')) {
          boardRun = null;
          render(status);
        }
      }),
    );
    context.onLab('run', () => {
      noticedThisRun = false;
    });
  }

  // 예제의 "실습 방법"은 이 패널이 아니라 입력·출력 칸 위(영상처리 — VisionIo)와 보드 그림 위(ESP32 — BoardIo)에 보인다
  // (2026-09-24 Phase 4 통합: 두 곳에 같은 글이 겹쳐 보이던 것을 한 곳으로).

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
  if (openedAsPeer) {
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
