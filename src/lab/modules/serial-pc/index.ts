/**
 * 컴퓨터 쪽 시리얼(pyserial 흉내)의 화면 쪽(P4-02). 파이썬 serial.py와 짝이고, 실제 선은 vision-bridge의 link.ts가 들고 있다.
 *
 * 하는 일
 * - serial.Serial(...) → 요청 'serial-pc.open' → 통로를 열고 **상대(ESP32 실습실 탭)가 보일 때까지** 잠깐 기다린 뒤 답한다.
 *   상대가 없으면 { ok: false, error: 한국어 안내 } → 파이썬이 SerialException을 낸다(§8.4 설계 메모 ③).
 * - uart.write(b'a') → 이벤트 'serial-pc.tx' → 보낼 차례(§7.2 규칙 4·5, §7.6 병합 규칙) → 통로 → 보드 RX 핀.
 * - 보드가 uart.write()로 보낸 바이트 → 통로 → 채널 'serial-pc.rx' → 파이썬의 read()·readline()·in_waiting.
 * - 포트 이름(COM10)은 브라우저에서 뜻이 없어 **무시하고 안내만** 한다(§7.6). 실제 상대는 화면에서 고른 통로다.
 *
 * 테스트가 읽는 값: 실습실 뿌리 [data-lab]의 data-serial-pc(닫힘 closed / 열림 open), data-serial-pc-sent(보낸 바이트 수),
 * data-serial-pc-received(받은 바이트 수).
 */
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import { PEER_WAIT_MS, getBridgeLink, type UartFrame } from '../vision-bridge/link.ts';
import manifest from './manifest.ts';

/** 파이썬이 보는 포트 이름(실물 COM 번호 대신 쓰는 이름 — 화면이 고른 통로가 진짜 상대다) */
export const VIRTUAL_PORT_NAME = 'ESP32-LAB';

/** 화면에 보일 포트 목록 한 줄(serial.tools.list_ports.comports()) */
export function portList(connected: boolean): { device: string; description: string; hwid: string }[] {
  return [
    {
      device: VIRTUAL_PORT_NAME,
      description: connected ? 'ESP32 실습실(가상 USB-UART 변환기) — 이어짐' : 'ESP32 실습실(가상 USB-UART 변환기) — 아직 이어지지 않음',
      hwid: 'APC:VIRTUAL-UART',
    },
  ];
}

/** 학생이 적은 포트 이름을 브라우저에서는 쓰지 않는다는 안내(§7.6) */
export function portNotice(port: string | null): string | null {
  if (port === null || port.trim() === '') {
    return null;
  }
  return `브라우저에서는 포트 이름(${port})을 쓰지 않아요. 아래 [보내기] 패널에서 고른 통로가 상대예요 — 실제 컴퓨터에서는 장치 관리자에 보이는 COM 번호를 적어요.`;
}

/** 상대(ESP32 실습실 탭)가 없을 때 파이썬 SerialException에 실을 한국어 안내 */
export function noPeerMessage(prefix: string): string {
  return [
    'ESP32 실습실 탭을 찾지 못했어요.',
    '[보내기] 패널의 [ESP32 실습실 새 탭에서 열기]나 [한 화면에 가상 보드 열기]를 누른 뒤 다시 [실행]해요.',
    `두 화면의 통신 접두어가 ${prefix}로 같아야 해요.`,
  ].join(' ');
}

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
  const link = getBridgeLink(context.root, {
    from: 'pc',
    search: typeof location === 'undefined' ? '' : location.search,
  });
  let open = false;

  const mark = (): void => {
    const status = link.status;
    context.root.dataset.serialPc = open ? 'open' : 'closed';
    context.root.dataset.serialPcSent = String(status.sentBytes);
    context.root.dataset.serialPcReceived = String(status.receivedBytes);
  };

  const pushInfo = (): void => {
    const status = link.status;
    const connected = status.state === 'open' && status.peers.length > 0;
    context.setValue('serial-pc.info', {
      ready: connected,
      label: status.label,
      prefix: status.prefix,
      peers: status.peers.slice(),
      ports: portList(connected),
    });
    mark();
  };

  const offs = [
    link.onStatus(pushInfo),
    link.onSent((line) => {
      // §7.6 규칙 ⑤ — 원본 코드처럼 콘솔에 `Sent: …`를 남긴다.
      context.lab.appendConsole(`${line}\n`, 'notice');
    }),
    link.onWarn((warning) => {
      context.notice(warning.text);
    }),
    link.onFrame((frame: UartFrame) => {
      if (frame.from === 'pc') {
        return;
      }
      context.pushEvent('serial-pc.rx', { bytes: Array.from(frame.bytes), baud: frame.baud, port: frame.port });
      mark();
    }),
  ];

  context.onRequest('serial-pc.open', (request) => {
    const payload = (request.payload ?? {}) as { port?: unknown; baudrate?: unknown };
    const port = typeof payload.port === 'string' ? payload.port : null;
    void (async () => {
      try {
        const status = await link.connect();
        if (status.state !== 'open') {
          request.reply({ ok: false, error: status.error ?? '시리얼 통로를 열지 못했어요.' });
          return;
        }
        const found = await link.waitForPeer(PEER_WAIT_MS);
        if (!found) {
          request.reply({ ok: false, error: noPeerMessage(status.prefix) });
          return;
        }
        open = true;
        pushInfo();
        const notices = [portNotice(port)].filter((text): text is string => text !== null);
        request.reply({ ok: true, portstr: VIRTUAL_PORT_NAME, label: status.label, notices });
      } catch (error) {
        request.reply({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();
  });

  context.onEvent('serial-pc.tx', (payload) => {
    const bytes = bytesOf(payload);
    if (bytes.length === 0) {
      return;
    }
    const baud = (payload as { baud?: unknown })?.baud;
    link.sendBytes(bytes, { baud: typeof baud === 'number' ? baud : 0 });
    mark();
  });

  context.onEvent('serial-pc.control', (payload) => {
    if ((payload as { kind?: unknown })?.kind === 'close') {
      open = false;
      mark();
    }
  });

  // 실행을 새로 시작하면 지난 실행에서 밀려 있던 것을 버린다(파이썬 쪽은 serial.py의 초기화 함수가 버린다).
  context.onLab('run', () => {
    open = false;
    link.reset();
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
