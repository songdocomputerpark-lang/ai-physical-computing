/**
 * 컴퓨터 쪽 블루투스(bluetooth 흉내)의 화면 쪽(PLAN §8.4 P4-02의 남은 자리 — P4-09 4단원 통합 화면이 쓴다).
 * 파이썬 bluetooth.py와 짝이다.
 *
 * 하는 일
 * - `bluetooth.init(주소)` → 요청 'ble-pc.open' → 이을 보드(아래 세 곳)를 찾아보고 답한다.
 *   상대가 없어도 **실패로 보지 않는다**(자료의 f100·f089·f158은 init을 try 없이 부른다 — 예외를 내면 카메라도 못 켜 본다).
 *   대신 connected가 거짓이고 콘솔에 어디서 보드를 여는지 안내가 한 번 나간다.
 * - `bridge.send("DATA,…")` → 이벤트 'ble-pc.tx' → P4-01의 보내는 차례(초당 10회·상태 병합·클릭 이벤트 보존, §7.2 4·5 §7.6)
 *   → 지금 고른 통로 → 보드의 BLE 특성.
 * - 보드가 알림으로 보낸 값 → 채널 'ble-pc.rx' → 파이썬이 원본처럼 콘솔에 찍는다(bluetooth.init을 부른 뒤에만 — 진짜로도 연결 전 알림은 못 받는다).
 * - 이어짐 여부는 250ms마다 다시 보고 채널 'ble-pc.info'에 넣는다.
 *
 * 보내는 곳(먼저 맞는 것 하나 — 통로를 Bridge.setChannel로 갈아 끼운다, README 9.6)
 *  1. **같은 문서의 가상 보드**(4단원 통합 화면): 보드 블루투스 조작 칸(data-ble-connected)이 있으면 direct 통로 → 창 이벤트 `apc:ble-write`.
 *     알림은 창 이벤트 `apc:ble-notify`로 받는다.
 *  2. **실제 보드**(2026-09-25 Phase 4 검토 반영): 같은 문서에 가상 보드가 없고 블루투스 칸(web-bluetooth 모듈, 통로 'ble')으로 실제 ESP32가
 *     이어져 있으면 그 통로 — f089·f100·f104·f158 원본이 고치지 않고 실제 보드로 간다(부록 B-2 15번).
 *  3. **다른 탭(또는 한 화면 모드 iframe)의 ESP32 실습실 가상 보드**(판 1.1.0, PROGRESS 미해결 137): 같은 문서에 가상 보드가 없고
 *     실제 보드도 없으면 [보내기] 패널과 같은 선(vision-bridge link.ts — 같은 접두어·같은 컴퓨터 탭 통로)의 블루투스 줄기(`ble.data`)로 보낸다.
 *     받는 쪽 ESP32 실습실의 vision-bridge가 그 바이트를 가상 블루투스에 넣고(`apc:ble-write`), 보드의 알림을 같은 줄기로 돌려보낸다.
 *     "이어짐"은 그 탭이 선에 보이고 보드 코드가 **돌고 있을 때**(보드 탭이 알려 오는 실행 상태)다 — 보드가 멈춰 있으면 실물처럼 이어지지 않는다.
 *
 * 이어지기 전 안내 줄(1.1.0 검토 반영): bluetooth.init 뒤 아직 이어지지 않았으면 입력·출력 칸 아래에 "블루투스: 아직 이을 보드가 없어요 — …"
 * 한 줄([data-ble-pc-waiting], role=status)을 이어질 때까지 보인다. 콘솔 안내는 한 번뿐이라, 원본 코드가 매 장 찍는 print("Sent: …") 사이에
 * 묻혀 보내는 중처럼 보였다. 이어지면·다음 [실행]을 시작하면 숨는다(코드가 끝나도 이어진 적이 없으면 남겨 까닭을 알린다).
 *
 * 테스트가 읽는 값: 실습실 뿌리 [data-lab]의 data-ble-pc(닫힘 closed / 열림 open), data-ble-pc-connected,
 * data-ble-pc-sent(실제로 나간 줄 수), data-ble-pc-received(받은 바이트 수), data-ble-pc-target(virtual·real·tab), 안내 줄 [data-ble-pc-waiting].
 */
import {
  TAB_CHANNEL_ID,
  createBridge,
  createDirectPair,
  getBridgeChannelFactory,
  openBridgeChannel,
  textMessage,
  type Bridge,
  type BridgeChannel,
  type BridgeMessage,
} from '../../bridge/index.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import { BLE_ENVELOPE_TYPE, getBridgeLink, type PeerRunState } from '../vision-bridge/link.ts';
import manifest from './manifest.ts';

/** 구역 B(P4-03)가 연 자리 — 가상 보드의 블루투스에 값을 넣는 창 이벤트 */
export const BLE_WRITE_EVENT = 'apc:ble-write';
/** 구역 B(P4-03)가 연 자리 — 가상 보드가 알림으로 내보낸 값 */
export const BLE_NOTIFY_EVENT = 'apc:ble-notify';

/** 보드 조작 칸이 이어짐 여부를 적어 두는 자리 */
const BLE_HOST_SELECTOR = '[data-ble-connected]';

/** 실제 보드와 잇는 블루투스 통로 id(src/lab/ble/channel.ts BLE_CHANNEL_ID — 공개 자리만 쓰는 규약이라 이름만 맞춘다) */
const REAL_BLE_CHANNEL_ID = 'ble';

/** 같은 문서의 가상 보드에 이어졌을 때 원본이 찍는 `Connected to …`의 이름 */
export const VIRTUAL_BOARD_LABEL = '가상 ESP32 보드';
/** 실제 보드에 이어졌을 때 원본이 찍는 `Connected to …`의 이름 */
export const REAL_BOARD_LABEL = '실제 ESP32 보드(블루투스)';
/** 다른 탭(또는 한 화면 모드)의 ESP32 실습실 가상 보드에 이어졌을 때의 이름(판 1.1.0, 미해결 137) */
export const TAB_BOARD_LABEL = 'ESP32 실습실의 가상 보드';

/** 이어짐 여부를 다시 보는 간격(ms) */
export const STATUS_POLL_MS = 250;
/**
 * bluetooth.init 때 다른 탭(한 화면 모드)의 ESP32 실습실을 찾아보는 시간(ms). 열려 있는 탭은 인사에 몇 ms 안에 답한다.
 * 없으면 코드 시작이 이만큼 늦는다 — 원본은 연결을 뒤에서 하므로 길게 기다리지 않는다.
 */
export const TAB_PEER_WAIT_MS = 1000;
/** 그 탭이 보드 코드가 도는지(실행 상태)를 알려 오기를 기다리는 시간(ms) */
export const TAB_STATE_WAIT_MS = 800;

/** 지금 보내는 곳 */
export type BlePcTarget = 'virtual' | 'real' | 'tab';

/**
 * 상대가 아직 없을 때 콘솔에 한 번 내는 안내.
 * present: 같은 화면에 가상 보드의 블루투스 조작 칸이 있나(4단원 통합 화면) — 없으면(영상 처리 실습실 단독) 어디서 되는지 알려 준다.
 */
export function noPeerNotice(present = true): string {
  if (present) {
    return [
      '블루투스로 이을 보드를 아직 찾지 못했어요.',
      '같은 화면의 보드 칸에서 보드 코드를 [실행]하고 블루투스 조작 칸의 [연결]을 누르면',
      '그때부터 좌표가 나가요. 그 전까지는 카메라와 가상 데스크톱만 움직여요.',
    ].join(' ');
  }
  return [
    '블루투스로 이을 보드가 아직 없어요.',
    '보드가 없으면 아래 [보내기] 패널의 [ESP32 실습실 새 탭에서 열기]로 보드 쪽 예제를 열고 [실행]해요. 그러면 이 코드의 좌표가 그 가상 보드로 가요.',
    '실제 ESP32 보드가 있으면 이 화면의 블루투스 칸에서 [블루투스 보드 연결]로 보드를 골라요.',
    '두 칸을 한 화면에서 함께 보려면 "4단원 통합 실습실"에서 돌려요.',
    '이어지기 전에는 좌표를 보내지 않아요(원본 코드도 연결이 없으면 보내지 않아요).',
  ].join(' ');
}

/**
 * 이어지기 전 안내 줄의 글(입력·출력 칸 아래 — 머리말). present: 같은 화면에 가상 보드의 블루투스 조작 칸이 있나(4단원 통합 화면).
 */
export function waitingLineText(present: boolean): string {
  return present
    ? '블루투스: 아직 보드와 이어지지 않았어요 — 보드 칸에서 보드 코드를 [실행]하고 블루투스 조작 칸의 [연결]을 누르면 그때부터 값이 나가요.'
    : '블루투스: 아직 이을 보드가 없어서 값을 보내지 않아요 — [보내기] 패널의 [ESP32 실습실 새 탭에서 열기]로 보드 탭을 열고 그 탭에서 [실행]을 눌러요.';
}

/** 기기 주소를 적은 코드에 내는 안내(§7.3 — 브라우저는 주소로 연결하지 않는다) */
export function addressNotice(address: string): string | null {
  const text = String(address ?? '').trim();
  if (text === '') {
    return null;
  }
  return `브라우저는 기기 주소(${text})로 연결하지 않아요. 화면에서 고른 보드가 상대예요 — 실제 컴퓨터에서는 그 자리에 보드 주소를 적어요.`;
}

/** 파이썬이 보낸 {text} 또는 {bytes}를 바이트로 */
export function payloadBytes(payload: unknown): { bytes: Uint8Array | null; text: string | null } {
  const value = payload as { text?: unknown; bytes?: unknown } | null;
  if (typeof value?.text === 'string') {
    return { bytes: null, text: value.text };
  }
  if (Array.isArray(value?.bytes)) {
    return { bytes: Uint8Array.from(value.bytes.map((one) => (typeof one === 'number' ? one & 0xff : 0))), text: null };
  }
  return { bytes: null, text: null };
}

/** 지금 보이는 상대들로 보낼 곳을 고른다(순수 함수 — 먼저 맞는 것 하나, 머리말 1·2·3) */
export function chooseTarget(state: { present: boolean; real: boolean; tab: boolean }): BlePcTarget {
  if (state.present) {
    return 'virtual';
  }
  if (state.real) {
    return 'real';
  }
  return state.tab ? 'tab' : 'virtual';
}

/** 조건이 참이 될 때까지(최대 ms) 기다린다 */
function waitUntil(check: () => boolean, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (check()) {
      resolve(true);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (check()) {
        window.clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started >= ms) {
        window.clearInterval(timer);
        resolve(false);
      }
    }, 50);
  });
}

function mount(context: LabModuleContext): LabModuleHandle {
  const root = context.root;
  const cleanups: (() => void)[] = [];

  let boardEnd: BridgeChannel | null = null;
  /** 파이썬 쪽 끝(같은 문서의 가상 보드로 가는 direct 통로) — 다른 곳으로 바꿨다가 되돌릴 때 쓴다 */
  let pcEnd: BridgeChannel | null = null;
  let bridge: Bridge | null = null;
  /** 실제 보드 블루투스 통로(블루투스 칸이 이어 둔 연결을 감싼 것 — 필요할 때 한 번 연다) */
  let realChannel: BridgeChannel | null = null;
  let realOpening = false;
  /**
   * 다른 탭(한 화면 모드)의 ESP32 실습실로 가는 길 — [보내기] 패널과 같은 선의 블루투스 줄기(판 1.1.0, 미해결 137).
   * 선은 이 실습실 화면에 하나(vision-bridge link.ts). 접두어를 바꾸거나 다시 열어도 줄기가 따라간다.
   */
  const link = getBridgeLink(root, { from: 'pc', search: typeof location === 'undefined' ? '' : location.search });
  const tabChannel = link.subChannel(BLE_ENVELOPE_TYPE, TAB_BOARD_LABEL);
  /** 선 건너편 보드 탭이 알려 온 실행 상태(모르면 null) */
  let boardRun: PeerRunState | null = null;
  /** 지금 보내는 곳 */
  let target: BlePcTarget = 'virtual';
  let sent = 0;
  let received = 0;
  let open = false;
  let toldNoPeer = false;
  /** 이어지기 전 안내 줄을 보이는 중인가(bluetooth.init 뒤 아직 안 이어짐 — 코드가 끝나도 다음 [실행]까지 남는다) */
  let waitingShown = false;
  let timer: number | null = null;

  root.dataset.blePc = 'closed';
  root.dataset.blePcConnected = 'false';
  root.dataset.blePcSent = '0';
  root.dataset.blePcReceived = '0';
  root.dataset.blePcTarget = 'virtual';

  /** 이어지기 전 안내 줄(머리말) — 처음 쓸 때 만들어 출력 화면 바로 아래에 둔다 */
  let waitingLine: HTMLElement | null = null;
  const renderWaiting = (show: boolean, present: boolean): void => {
    if (!show && waitingLine === null) {
      return;
    }
    if (waitingLine === null) {
      const io = root.querySelector<HTMLElement>('[data-lab-io]');
      if (io === null) {
        return;
      }
      waitingLine = document.createElement('p');
      waitingLine.className = 'lab__module-note';
      waitingLine.setAttribute('role', 'status');
      waitingLine.dataset.blePcWaiting = '';
      waitingLine.hidden = true;
      // 출력 화면 바로 아래(io 슬롯이 알려 주는 자리 — 실습실 틀의 "콘솔에 결과가 나왔어요" 칸도 이 뒤로 온다), 없으면 입력·출력 칸 끝
      const anchor = io.querySelector<HTMLElement>('[data-lab-io-output-anchor]');
      if (anchor !== null) {
        anchor.after(waitingLine);
      } else {
        io.append(waitingLine);
      }
      cleanups.push(() => waitingLine?.remove());
    }
    const text = waitingLineText(present);
    if (show && waitingLine.textContent !== text) {
      waitingLine.textContent = text;
    }
    if (waitingLine.hidden === show) {
      waitingLine.hidden = !show;
    }
  };

  /** 보드가 알림으로 보낸 바이트 — 지금 보내는 곳(from)에서 온 것만, 그리고 bluetooth.init을 부른 뒤에만 파이썬에 넘긴다 */
  const noteReceived = (from: BlePcTarget, bytes: readonly number[]) => {
    if (bytes.length === 0 || from !== target || !open) {
      return;
    }
    received += bytes.length;
    root.dataset.blePcReceived = String(received);
    context.pushEvent('ble-pc.rx', { bytes: [...bytes] });
  };

  /** 실제 보드 블루투스 통로를 연다(블루투스 칸 모듈이 이 실습실에 붙어 통로를 등록했을 때만, 한 번) */
  const ensureRealChannel = () => {
    if (realChannel !== null || realOpening || getBridgeChannelFactory(REAL_BLE_CHANNEL_ID) === null) {
      return;
    }
    realOpening = true;
    openBridgeChannel(REAL_BLE_CHANNEL_ID, { from: 'pc' }).then(
      (channel) => {
        realOpening = false;
        realChannel = channel;
        cleanups.push(channel.on('message', (envelope) => noteReceived('real', [...envelope.bytes])));
        publish();
      },
      () => {
        realOpening = false;
      },
    );
  };

  /** 선 건너편에 ESP32 실습실(보드)이 보이나 — 같은 컴퓨터 탭 통로일 때만(MQTT·실물 포트 통로에는 블루투스 줄기가 없다) */
  const tabPeerVisible = (): boolean => {
    const status = link.status;
    return status.state === 'open' && status.channelId === TAB_CHANNEL_ID && status.peers.includes('board');
  };

  /** 같은 문서에 보드 블루투스 조작 칸이 있나 / 이어져 있나 / 실제 보드·다른 탭 보드가 이어져 있나 */
  const look = (): { present: boolean; connected: boolean; real: boolean; tab: boolean; tabPeer: boolean } => {
    const host = document.querySelector<HTMLElement>(BLE_HOST_SELECTOR);
    const real = host === null && realChannel !== null && realChannel.state === 'open' && realChannel.peers.length > 0;
    const tabPeer = host === null && !real && tabPeerVisible();
    // 보드 탭이 "돌고 있어요"라고 알려 온 뒤에만 이어진 것으로 본다(멈춘 보드는 광고하지 않는다 — 실물처럼)
    const tab = tabPeer && boardRun === 'running';
    return { present: host !== null, connected: host?.dataset.bleConnected === 'true' || real || tab, real, tab, tabPeer };
  };

  const labelOf = (state: { present: boolean; real: boolean; tab: boolean; tabPeer: boolean }): string | null => {
    if (state.present) {
      return VIRTUAL_BOARD_LABEL;
    }
    if (state.real) {
      return REAL_BOARD_LABEL;
    }
    return state.tab || state.tabPeer ? TAB_BOARD_LABEL : null;
  };

  const publish = () => {
    const state = look();
    const wanted = chooseTarget(state);
    if (bridge !== null && wanted !== target) {
      const next = wanted === 'real' ? realChannel : wanted === 'tab' ? tabChannel : pcEnd;
      if (next !== null) {
        bridge.setChannel(next);
        target = wanted;
        root.dataset.blePcTarget = wanted;
      }
    }
    root.dataset.blePcConnected = String(state.connected);
    context.setValue('ble-pc.info', {
      connected: state.connected,
      present: state.present || state.real || state.tabPeer,
      label: labelOf(state),
    });
    if (open && !state.connected && !toldNoPeer) {
      toldNoPeer = true;
      context.notice(noPeerNotice(state.present));
    }
    if (state.connected) {
      toldNoPeer = false;
      waitingShown = false;
    } else if (open) {
      waitingShown = true;
    }
    renderWaiting(waitingShown && !state.connected, state.present);
  };

  /** 통로를 만든다 — 한쪽은 파이썬이 쓰고, 반대쪽은 창 이벤트로 같은 문서의 가상 보드에 닿는다. */
  const openLink = () => {
    if (bridge) {
      return;
    }
    const [a, b] = createDirectPair({ a: 'pc', b: 'board', label: '같은 화면 블루투스', requirePeer: false });
    boardEnd = b;
    pcEnd = a;
    target = 'virtual';
    bridge = createBridge(a, {
      // 자료의 원본은 data.encode()만 하고 끝 문자를 붙이지 않는다(§7.2 규칙 2의 예외 — 보내는 쪽 원본을 고치지 않는다).
      terminator: '',
      // 받은 바이트는 통로마다 따로 받아 파이썬에 넘긴다(noteReceived) — 브릿지의 받는 차례에 쌓지 않는다(아무도 꺼내지 않으므로)
      receive: false,
      onSend: (_message: BridgeMessage, line: string) => {
        sent += 1;
        root.dataset.blePcSent = String(sent);
        context.lab.appendConsole(`${line}\n`, 'stdout');
      },
      onWarn: (warning) => {
        context.notice(warning.text);
      },
      onError: (error) => {
        context.notice(`블루투스로 보내지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
      },
    });
    cleanups.push(
      boardEnd.on('message', (envelope) => {
        window.dispatchEvent(new CustomEvent(BLE_WRITE_EVENT, { detail: { bytes: [...envelope.bytes] } }));
      }),
    );
  };

  /**
   * 다른 탭(한 화면 모드)의 ESP32 실습실로 가는 선을 연다(같은 문서에 가상 보드가 없을 때만 — bluetooth.init 때).
   * 선이 막 열렸거나 상대가 아직 안 보이면 잠깐 찾아보고, 보이면 보드가 도는지 알려 올 때까지 조금 더 기다린다 —
   * 그래야 이미 열어 둔 보드 탭이 있는데도 "보드가 없어요" 안내가 먼저 나가지 않는다.
   */
  const prepareTabRoute = async (): Promise<void> => {
    // 블루투스 줄기는 같은 컴퓨터 탭 통로에만 싣는다 — [보내기] 패널에서 다른 통로(MQTT 등)를 골라 두었으면 그 통로를 대신 열지 않는다
    if (link.status.channelId !== TAB_CHANNEL_ID) {
      return;
    }
    if (link.status.state === 'closed') {
      await link.connect();
    }
    if (link.status.state !== 'open') {
      return;
    }
    if (!tabPeerVisible()) {
      await link.waitForPeer(TAB_PEER_WAIT_MS);
    }
    if (tabPeerVisible() && boardRun === null) {
      // 보드 탭은 보이는데 실행 상태를 모르면(앞서 잠깐 끊겼다 다시 보인 경우 등) 물어본다 — 다시 [실행]만으로도 되살아나게(판 1.1.1 최종 점검)
      link.queryState();
      await waitUntil(() => boardRun !== null, TAB_STATE_WAIT_MS);
    }
  };

  const onNotify = (event: Event) => {
    const detail = (event as CustomEvent<{ bytes?: unknown }>).detail;
    const bytes = Array.isArray(detail?.bytes) ? detail.bytes.filter((one): one is number => typeof one === 'number') : [];
    noteReceived('virtual', bytes);
  };
  window.addEventListener(BLE_NOTIFY_EVENT, onNotify);
  cleanups.push(() => window.removeEventListener(BLE_NOTIFY_EVENT, onNotify));
  cleanups.push(tabChannel.on('message', (envelope) => noteReceived('tab', [...envelope.bytes])));
  cleanups.push(
    link.onPeerState((state, from) => {
      if (from === 'board') {
        boardRun = state;
        publish();
      }
    }),
  );
  cleanups.push(
    link.onStatus((status) => {
      // 보드 탭이 사라지면 알던 실행 상태도 버린다. 다시 보이면 선(link.ts)이 실행 상태를 물어 보드가 답한다 — 보드 탭이 6초 넘게
      // 멈칫해 목록에서 잠깐 빠졌던 때도 저절로 다시 이어진다(판 1.1.1 최종 점검: 전에는 보드 쪽이 다시 알리지 않아 끊긴 채 굳었다).
      if (boardRun !== null && !status.peers.includes('board')) {
        boardRun = null;
      }
    }),
  );

  context.onRequest('ble-pc.open', (request) => {
    const address = String((request.payload as { address?: unknown } | null)?.address ?? '');
    openLink();
    void (async () => {
      // 같은 문서에 가상 보드가 없으면 실제 보드 블루투스 통로를 먼저 보고(이어져 있으면 그리로), 아니면 다른 탭으로 가는 선을 연다(publish가 고른다)
      if (document.querySelector(BLE_HOST_SELECTOR) === null) {
        ensureRealChannel();
        await waitUntil(() => !realOpening, 500);
        if (!look().real) {
          try {
            await prepareTabRoute();
          } catch {
            // 선을 못 열어도 bluetooth.init은 실패로 보지 않는다(머리말) — 이어지지 않은 채 안내만 나간다.
          }
        }
      }
      open = true;
      root.dataset.blePc = 'open';
      publish();
      const state = look();
      const notices: string[] = [];
      const hint = addressNotice(address);
      if (hint) {
        notices.push(hint);
      }
      if (!state.connected) {
        notices.push(noPeerNotice(state.present));
        toldNoPeer = true;
      }
      request.reply({
        ok: true,
        connected: state.connected,
        label: labelOf(state),
        notices,
      });
    })();
  });

  context.onRequest('ble-pc.close', (request) => {
    open = false;
    root.dataset.blePc = 'closed';
    bridge?.reset();
    request.reply({ ok: true, label: labelOf(look()) });
  });

  context.onEvent('ble-pc.tx', (payload) => {
    if (!bridge) {
      return;
    }
    const { bytes, text } = payloadBytes(payload);
    if (text !== null) {
      // 갈래(상태·이벤트)를 못 박지 않는다 — classifyText가 `DATA,x,y,1,0`처럼 클릭 표시가 1인 줄을 **이벤트**로 보고
      // 차례에서 절대 바꿔 끼우지 않게 한다(§7.2 규칙 5, §7.6 ③). bridge.send()는 늘 'state'로 못 박으므로 쓰지 않는다.
      bridge.sendMessage(textMessage(text, { terminator: '' }));
    } else if (bytes !== null && bytes.length > 0) {
      bridge.sendBytes(bytes);
    }
  });

  // 실행을 시작할 때마다 지난 실행의 차례·셈을 비운다(워커가 새로 떠도 화면 값이 남아 있지 않게).
  context.onLab('run', () => {
    sent = 0;
    received = 0;
    open = false;
    toldNoPeer = false;
    waitingShown = false;
    root.dataset.blePc = 'closed';
    root.dataset.blePcSent = '0';
    root.dataset.blePcReceived = '0';
    bridge?.reset();
    publish();
  });

  publish();
  timer = window.setInterval(publish, STATUS_POLL_MS);

  return {
    dispose() {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
      // 통로만 닫는다 — 블루투스 연결 자체는 블루투스 칸의 [연결 끊기]가 끊는다(src/lab/ble/channel.ts close)
      realChannel?.close('실습실을 떠났어요.');
      realChannel = null;
      // 선(link)은 [보내기] 패널과 함께 쓰므로 닫지 않는다 — 줄기에서 듣던 것만 푼다
      tabChannel.close();
      bridge?.close(false);
      pcEnd?.close();
      bridge = null;
      boardEnd = null;
      pcEnd = null;
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
