/**
 * AI→피지컬 브릿지의 값 모양 한 곳(PLAN §7.2 PD-06·§7.3·§7.6, P4-01). 순수 타입·상수만 두고 DOM·워커를 모르게 한다.
 *
 * 브릿지는 "영상처리 실습실이 알아낸 값(손가락 개수·좌표·클릭)을 ESP32로 보내는 다리"다. 같은 글자 한 줄이
 * 같은 페이지 가상 보드·같은 컴퓨터 탭(BroadcastChannel)·USB 시리얼·블루투스·MQTT 어느 통로로도 나간다(§7.2 규칙 6).
 * 그래서 이 파일의 이름·모양은 통로가 무엇이든 바뀌지 않는다.
 *
 * 세 층으로 나뉜다.
 *   ① 메시지(BridgeMessage) — 무엇을 보내나. 만들기·검사는 message.ts
 *   ② 보내는 차례(BridgeOutbox) — 언제 보내나(초당 10회·병합·이벤트 보존). outbox.ts
 *   ③ 통로(BridgeChannel) — 어디로 보내나. channels/
 *
 * 브릿지 메시지와 보드 메시지(board.state 같은 '핀 전압')는 다른 것이다 — 보드 메시지는 워커 ↔ 화면 사이의
 * 핀 상태이고(src/lab/modules/board/state.ts), 브릿지 메시지는 기기와 기기 사이로 오가는 글자 한 줄이다.
 */

/** 메시지를 보낸 쪽·받을 쪽 이름. 통로 안에서 서로를 가르는 이름이라 개인정보(학생 이름·기기 주소)를 넣지 않는다(PLAN §10). */
export type BridgeParty = string;

/** 자주 쓰는 이름과 화면에 보일 한국어 이름. 새 이름은 여기에 더하지 않아도 되지만(자유 문자열) 여기 있으면 화면이 한국어로 부른다. */
export const BRIDGE_PARTY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  pc: '컴퓨터(영상처리 실습실)',
  board: 'ESP32 보드(실습실)',
  phone: '스마트폰 앱',
  dash: '대시보드',
});

/** 이름을 화면에 보일 한국어로. 모르는 이름은 그대로 돌려준다. */
export function partyLabel(party: BridgeParty): string {
  return BRIDGE_PARTY_LABELS[party] ?? party;
}

/**
 * 메시지 갈래(PLAN §7.2 규칙 5)
 * - 'state'  상태: 좌표·개수처럼 **최신 값만 뜻이 있는 것**. 밀리면 대기열에서 새 값으로 바뀌어 끼워진다.
 * - 'event'  이벤트: 클릭·버튼 눌림처럼 **한 번 일어난 일**. 절대 바뀌어 끼워지지 않고 반드시 한 번 나간다.
 */
export type BridgeCategory = 'state' | 'event';

/**
 * 메시지 모양(PLAN §7.2 규칙 1)
 * - 'command'  명령 한 글자: `a`, `b`, `c`
 * - 'values'   값 목록: `3`, `355,152`
 * - 'fields'   머리말 + 필드: `DATA,120,80`, `DATA,1920,1080,1,0`
 * - 'bytes'    원시 바이트(글자로 읽을 수 없음, §7.2 규칙 7)
 * - 'other'    위 셋 어디에도 안 맞는 글자 줄(보내기는 하되 새 예제에는 권하지 않음)
 */
export type BridgeShape = 'command' | 'values' | 'fields' | 'bytes' | 'other';

/** 검사에서 나온 알림 종류 — 한국어 문장은 messages.ts가 만든다(문구를 한 곳에 모으려고 code만 둔다). */
export type BridgeWarningCode =
  /** 끝 문자까지 20바이트를 넘음(§7.2 규칙 3) */
  | 'too-long'
  /** 글 가운데에 줄바꿈이 있어 받는 쪽에서 두 줄로 쪼개짐 */
  | 'newline-inside'
  /** 빈 메시지 */
  | 'empty'
  /** 대기열이 가득 차 오래된 것을 버림 */
  | 'queue-full'
  /** 통로가 닫혀 보내지 못함 */
  | 'closed'
  /** 받는 쪽이 아무도 없음 */
  | 'no-peer'
  /** 허용 목록에 없는 메시지를 받아 무시함(PD-29) */
  | 'not-allowed';

/** 알림 하나 — code로 가르고 text는 학생이 그대로 읽는 한국어 문장이다. */
export interface BridgeWarning {
  readonly code: BridgeWarningCode;
  readonly text: string;
}

/**
 * 보낼 메시지 하나. `bytes`가 통로에 실제로 나가는 바이트고 나머지는 판단에 쓰는 정보다.
 * **bytes는 만든 뒤 고치지 않는다** — 원본 PC 코드가 보낸 바이트를 그대로 전달해야 하기 때문이다(§7.2 규칙 8).
 */
export interface BridgeMessage {
  /** 통로로 나가는 바이트 그대로(끝 문자 포함 여부까지) */
  readonly bytes: Uint8Array;
  /** 글자 메시지면 끝 문자를 뺀 글, 글자로 읽을 수 없으면 null */
  readonly text: string | null;
  readonly category: BridgeCategory;
  readonly shape: BridgeShape;
  /**
   * 대기열에서 바꿔 끼울 수 있는 자리 이름(§7.6 규칙 ②④). 같은 열쇠끼리만 바뀐다.
   * null이면 절대 바뀌지 않는다(이벤트 메시지·원시 바이트).
   */
  readonly mergeKey: string | null;
  /** 만들 때 찾은 알림(길이 넘침 등). 보내는 쪽이 화면·콘솔에 보여 준다. */
  readonly warnings: readonly BridgeWarning[];
}

/**
 * 통로를 오가는 봉투. 통로 구현(BroadcastChannel·MQTT·BLE·Web Serial)이 이 모양으로 싣고 푼다.
 * PLAN §8.4 설계 메모 ②의 `{type: 'uart.data', from, port, bytes, baud}`와 같은 자리다.
 */
export interface BridgeEnvelope {
  readonly v: 1;
  /** 무엇을 싣고 있나. 데이터는 통로가 정한 이름(기본 'bridge.data', UART 통로는 'uart.data'), 인사는 'bridge.hello'·'bridge.here' */
  readonly type: string;
  /** 보낸 쪽 이름 */
  readonly from: BridgeParty;
  /** 받을 쪽 이름(없으면 모두에게) */
  readonly to?: BridgeParty;
  /** 통로 안에서 선을 여럿 쓸 때의 이름표(UART 포트 이름 등) */
  readonly port?: string;
  /** 시리얼 속도(bps) — 받는 쪽이 다르면 실물처럼 글자가 깨진다 */
  readonly baud?: number;
  /** 실린 바이트 */
  readonly bytes: Uint8Array;
  /** 보낸 시각(밀리초) */
  readonly at: number;
}

/** 통로 상태 */
export type BridgeChannelState = 'open' | 'closed';

/** 통로가 알리는 일 */
export interface BridgeChannelEvents {
  /** 봉투가 왔다 */
  message: (envelope: BridgeEnvelope) => void;
  /** 이 통로에 보이는 상대 목록이 바뀌었다(아는 통로만 알린다) */
  peers: (peers: readonly BridgeParty[]) => void;
  /** 통로가 닫혔다 */
  close: (reason: string) => void;
}

/**
 * 통로 하나(§7.3). 보내기·받기·닫기와 "누가 보냈는지"만 있는 작은 약속이라
 * 같은 컴퓨터 탭·같은 탭 직접 연결·MQTT·BLE·Web Serial을 갈아 끼울 수 있다.
 */
export interface BridgeChannel {
  /** 통로 종류 id('direct'·'tab'·'mqtt'·'ble'·'serial') */
  readonly id: string;
  /** 화면에 보일 한국어 이름 */
  readonly label: string;
  /** 이 끝이 보낼 때 붙는 이름 — "누가 보냈는지" */
  readonly from: BridgeParty;
  readonly state: BridgeChannelState;
  /** 지금 보이는 상대 목록. 알 수 없는 통로는 빈 목록을 돌려주고 knowsPeers가 false다. */
  readonly peers: readonly BridgeParty[];
  /** 상대가 있는지 알 수 있는 통로인가(BroadcastChannel은 인사로 알고, MQTT·BLE는 연결 여부로 안다) */
  readonly knowsPeers: boolean;
  /** 바이트를 보낸다. 통로가 닫혔으면 BridgeClosedError, 상대가 없다고 알 수 있으면 BridgeNoPeerError를 던진다. */
  send(bytes: Uint8Array, options?: BridgeSendOptions): Promise<void>;
  /** 일을 듣는다. 돌려주는 함수를 부르면 그만 듣는다. */
  on<K extends keyof BridgeChannelEvents>(event: K, listener: BridgeChannelEvents[K]): () => void;
  close(reason?: string): void;
}

/** 보낼 때 붙일 수 있는 것 */
export interface BridgeSendOptions {
  readonly to?: BridgeParty;
  readonly port?: string;
  readonly baud?: number;
  readonly type?: string;
}

/** 통로를 열 때 주는 값 */
export interface BridgeChannelOpenOptions {
  /** 이 끝의 이름 */
  readonly from: BridgeParty;
  /** 통로를 가르는 접두어(PD-29 무작위 12글자). 탭 통로의 채널 이름·MQTT 토픽 접두어가 된다. */
  readonly prefix?: string;
  /** 봉투 type(기본 'bridge.data') */
  readonly type?: string;
  /** 통로마다 다른 나머지 값(브로커 주소·포트 등) */
  readonly extra?: Readonly<Record<string, unknown>>;
}

/**
 * 통로 구현 등록표의 한 줄(channels/registry.ts). MQTT(P4-06)·BLE(P4-04)·Web Serial(P4-05)은
 * 이 모양을 만들어 `registerBridgeChannel`로 끼운다 — 공유 파일을 고치지 않는다.
 */
export interface BridgeChannelFactory {
  readonly id: string;
  readonly label: string;
  /** 화면에 늘 보일 주의 글(공개 브로커의 "누구나 보고 보낼 수 있어요" 같은 것, §7.4) */
  readonly notice?: string;
  /** 이 브라우저에서 쓸 수 있나(없는 API를 쓰는 통로는 false를 돌려준다) */
  available(): boolean;
  open(options: BridgeChannelOpenOptions): Promise<BridgeChannel>;
}
