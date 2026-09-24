/**
 * 컴퓨터 쪽 블루투스(bluetooth 흉내)의 화면 쪽(PLAN §8.4 P4-02의 남은 자리 — P4-09 4단원 통합 화면이 쓴다).
 * 파이썬 bluetooth.py와 짝이다.
 *
 * 하는 일
 * - `bluetooth.init(주소)` → 요청 'ble-pc.open' → 같은 화면(문서)에 가상 보드의 블루투스 조작 칸이 있는지 보고 답한다.
 *   상대가 없어도 **실패로 보지 않는다**(자료의 f100·f089·f158은 init을 try 없이 부른다 — 예외를 내면 카메라도 못 켜 본다).
 *   대신 connected가 거짓이고 콘솔에 "보드 화면을 열고 [연결]을 눌러요" 안내가 나간다.
 * - `bridge.send("DATA,…")` → 이벤트 'ble-pc.tx' → P4-01의 보내는 차례(초당 10회·상태 병합·클릭 이벤트 보존, §7.2 4·5 §7.6)
 *   → 통로 → 창 이벤트 `apc:ble-write`(구역 B가 연 자리) → 가상 보드의 BLE 특성.
 * - 보드가 알림으로 보낸 값(`apc:ble-notify`) → 채널 'ble-pc.rx' → 파이썬이 원본처럼 콘솔에 찍는다.
 * - 이어짐 여부는 보드 조작 칸이 DOM에 적어 두는 data-ble-connected를 250ms마다 보고 채널 'ble-pc.info'에 넣는다.
 *
 * 통로를 왜 P4-01의 direct(같은 탭)로 두었나: 지금 쓰는 자리(4단원 통합 화면)는 컴퓨터 쪽과 보드 쪽이 **같은 문서**에 있고,
 * 구역 B의 자리(`apc:ble-write`)도 같은 문서의 창 이벤트다. 통로를 갈아 끼울 수 있는 모양으로 두었으니 다른 탭·실제 보드로 넓힐 때는
 * `setChannel`에 tab·ble 통로를 넣으면 된다(README 9.6, 남긴 일).
 *
 * 테스트가 읽는 값: 실습실 뿌리 [data-lab]의 data-ble-pc(닫힘 closed / 열림 open), data-ble-pc-connected,
 * data-ble-pc-sent(실제로 나간 줄 수), data-ble-pc-received(받은 바이트 수).
 */
import { createBridge, createDirectPair, textMessage, type Bridge, type BridgeChannel, type BridgeMessage } from '../../bridge/index.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import manifest from './manifest.ts';

/** 구역 B(P4-03)가 연 자리 — 가상 보드의 블루투스에 값을 넣는 창 이벤트 */
export const BLE_WRITE_EVENT = 'apc:ble-write';
/** 구역 B(P4-03)가 연 자리 — 가상 보드가 알림으로 내보낸 값 */
export const BLE_NOTIFY_EVENT = 'apc:ble-notify';

/** 보드 조작 칸이 이어짐 여부를 적어 두는 자리 */
const BLE_HOST_SELECTOR = '[data-ble-connected]';

/** 이어짐 여부를 다시 보는 간격(ms) */
export const STATUS_POLL_MS = 250;

/**
 * 상대가 아직 없을 때 콘솔에 한 번 내는 안내.
 * present: 같은 화면에 가상 보드의 블루투스 조작 칸이 있나(4단원 통합 화면) — 없으면(영상처리 실습실 단독) 어디서 되는지 알려 준다.
 * 이 흉내는 **같은 문서**의 가상 보드에만 닿는다(창 이벤트). 다른 탭의 ESP32 실습실·실제 보드로는 아직 보내지 않으므로 그렇게 약속하지 않는다.
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
    '블루투스로 이을 보드가 이 화면에 없어요.',
    '컴퓨터 칸과 가상 보드 칸이 한 화면에 있는 "4단원 통합 실습실"에서 이 코드를 돌리면 좌표가 보드로 가요.',
    '여기서는 카메라와 가상 데스크톱만 움직이고 좌표는 보내지 않아요(원본 코드도 연결이 없으면 보내지 않아요).',
  ].join(' ');
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

function mount(context: LabModuleContext): LabModuleHandle {
  const root = context.root;
  const cleanups: (() => void)[] = [];

  let boardEnd: BridgeChannel | null = null;
  let bridge: Bridge | null = null;
  let sent = 0;
  let received = 0;
  let open = false;
  let toldNoPeer = false;
  let timer: number | null = null;

  root.dataset.blePc = 'closed';
  root.dataset.blePcConnected = 'false';
  root.dataset.blePcSent = '0';
  root.dataset.blePcReceived = '0';

  /** 같은 문서에 보드 블루투스 조작 칸이 있나 / 이어져 있나 */
  const look = (): { present: boolean; connected: boolean } => {
    const host = document.querySelector<HTMLElement>(BLE_HOST_SELECTOR);
    return { present: host !== null, connected: host?.dataset.bleConnected === 'true' };
  };

  const publish = () => {
    const state = look();
    root.dataset.blePcConnected = String(state.connected);
    context.setValue('ble-pc.info', {
      connected: state.connected,
      present: state.present,
      label: state.present ? '가상 ESP32 보드' : null,
    });
    if (open && !state.connected && !toldNoPeer) {
      toldNoPeer = true;
      context.notice(noPeerNotice(state.present));
    }
    if (state.connected) {
      toldNoPeer = false;
    }
  };

  /** 통로를 만든다 — 한쪽은 파이썬이 쓰고, 반대쪽은 창 이벤트로 가상 보드에 닿는다. */
  const openLink = () => {
    if (bridge) {
      return;
    }
    const [a, b] = createDirectPair({ a: 'pc', b: 'board', label: '같은 화면 블루투스', requirePeer: false });
    boardEnd = b;
    bridge = createBridge(a, {
      // 자료의 원본은 data.encode()만 하고 끝 문자를 붙이지 않는다(§7.2 규칙 2의 예외 — 보내는 쪽 원본을 고치지 않는다).
      terminator: '',
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

  const onNotify = (event: Event) => {
    const detail = (event as CustomEvent<{ bytes?: unknown }>).detail;
    const bytes = Array.isArray(detail?.bytes) ? detail.bytes.filter((one): one is number => typeof one === 'number') : [];
    if (bytes.length === 0) {
      return;
    }
    received += bytes.length;
    root.dataset.blePcReceived = String(received);
    context.pushEvent('ble-pc.rx', { bytes });
  };
  window.addEventListener(BLE_NOTIFY_EVENT, onNotify);
  cleanups.push(() => window.removeEventListener(BLE_NOTIFY_EVENT, onNotify));

  context.onRequest('ble-pc.open', (request) => {
    const address = String((request.payload as { address?: unknown } | null)?.address ?? '');
    openLink();
    open = true;
    root.dataset.blePc = 'open';
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
    publish();
    request.reply({ ok: true, connected: state.connected, label: state.present ? '가상 ESP32 보드' : null, notices });
  });

  context.onRequest('ble-pc.close', (request) => {
    open = false;
    root.dataset.blePc = 'closed';
    bridge?.reset();
    request.reply({ ok: true, label: look().present ? '가상 ESP32 보드' : null });
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
      bridge?.close();
      bridge = null;
      boardEnd = null;
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
