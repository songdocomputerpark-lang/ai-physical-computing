/**
 * 새 예제용 통신 모듈 `bridge`의 화면 쪽(PLAN §7.6, P4-08 → 판 1.1.0 PROGRESS 미해결 139에서 자기 폴더로). 파이썬 bridge.py와 짝이고,
 * 실제 선은 vision-bridge의 link.ts가 들고 있다(serial 흉내·[보내기] 패널과 같은 선).
 *
 * 하는 일(serial-pc/index.ts와 같은 얼개 — 이름만 bridge-pc.)
 * - bridge.send(…) 첫 호출·bridge.connect() → 요청 'bridge-pc.open' → 선을 열고 **상대(ESP32 실습실 탭·한 화면 모드)가 보일 때까지**
 *   잠깐 기다린 뒤 답한다. 상대가 없으면 { ok: false, reason: 'no-peer', error: 한국어 안내 } → 파이썬 BridgeNoPeer(오류 사전 comm-no-peer).
 * - 'bridge-pc.tx' { bytes, category } → 선의 보낼 차례(§7.2 규칙 4·5, §7.6 병합 — event는 절대 바꿔 끼우지 않는다) → 통로.
 * - 보드가 보낸 바이트 → 'bridge-pc.rx' → bridge.receive(). **통로를 연 동안만** 넣는다(아무도 꺼내지 않는 칸에 쌓이지 않게).
 * - `Sent: …` 콘솔 줄은 선 하나에 한 번만 적는다(link.ts shareSentPrinter — serial-pc와 나눠 쓴다).
 *
 * ESP32 실습실에서는 아무것도 하지 않는다: manifest.labs의 'esp32'는 bridge.py를 그 워커에 넣어 `import bridge`가 한국어 안내와 함께
 * ModuleNotFoundError로 끝나게 하려는 것뿐이다(실물 MicroPython에도 bridge가 없다).
 *
 * 테스트가 읽는 값: 실습실 뿌리 [data-lab]의 data-bridge-pc(닫힘 closed / 열림 open).
 */
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import { PEER_WAIT_MS, getBridgeLink, noPeerMessage, shareSentPrinter, type UartFrame } from '../vision-bridge/link.ts';
import manifest from './manifest.ts';

function bytesOf(payload: unknown): Uint8Array {
  const raw = (payload as { bytes?: unknown })?.bytes;
  if (raw instanceof Uint8Array) {
    return raw;
  }
  if (Array.isArray(raw)) {
    return Uint8Array.from(raw.map((value) => (typeof value === 'number' ? value & 0xff : 0)));
  }
  return new Uint8Array(0);
}

function mount(context: LabModuleContext): LabModuleHandle {
  if (context.labId !== 'vision') {
    // ESP32 실습실: 파이썬 파일만 필요하다(머리말).
    return {};
  }
  const link = getBridgeLink(context.root, {
    from: 'pc',
    search: typeof location === 'undefined' ? '' : location.search,
  });
  let open = false;

  const mark = (): void => {
    context.root.dataset.bridgePc = open ? 'open' : 'closed';
  };

  const pushInfo = (): void => {
    const status = link.status;
    context.setValue('bridge-pc.info', {
      ready: status.state === 'open' && status.peers.length > 0,
      label: status.label,
      prefix: status.prefix,
      peers: status.peers.slice(),
    });
    mark();
  };

  const offs = [
    link.onStatus(pushInfo),
    shareSentPrinter(link, (line) => context.lab.appendConsole(line, 'notice')),
    link.onFrame((frame: UartFrame) => {
      if (frame.from === 'pc' || !open) {
        return;
      }
      context.pushEvent('bridge-pc.rx', { bytes: Array.from(frame.bytes), baud: frame.baud, port: frame.port });
    }),
  ];

  context.onRequest('bridge-pc.open', (request) => {
    void (async () => {
      try {
        const status = await link.connect();
        if (status.state !== 'open') {
          request.reply({ ok: false, reason: 'closed', error: status.error ?? '통신 통로를 열지 못했어요.' });
          return;
        }
        const found = await link.waitForPeer(PEER_WAIT_MS);
        if (!found) {
          request.reply({ ok: false, reason: 'no-peer', error: noPeerMessage(status.prefix) });
          return;
        }
        open = true;
        pushInfo();
        request.reply({ ok: true, label: status.label, notices: [] });
      } catch (error) {
        request.reply({ ok: false, reason: 'closed', error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });

  context.onEvent('bridge-pc.tx', (payload) => {
    const bytes = bytesOf(payload);
    if (bytes.length === 0) {
      return;
    }
    const category = (payload as { category?: unknown })?.category;
    // 속도는 싣지 않는다(0 = 받는 보드와 같은 속도로 맞춤 — bridge.py _AUTO_BAUD). 값은 'state', 클릭·윙크는 'event'(§7.2 규칙 5).
    link.sendBytes(bytes, { baud: 0, ...(category === 'event' || category === 'state' ? { category } : {}) });
  });

  context.onEvent('bridge-pc.control', (payload) => {
    if ((payload as { kind?: unknown })?.kind === 'close') {
      open = false;
      mark();
    }
  });

  // 실행을 새로 시작하면 지난 실행의 열림을 되돌린다(파이썬 쪽은 bridge.py의 초기화 함수가 받은 칸을 비운다).
  context.onLab('run', () => {
    open = false;
    pushInfo();
  });

  pushInfo();
  return {
    dispose() {
      for (const off of offs) {
        off();
      }
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
