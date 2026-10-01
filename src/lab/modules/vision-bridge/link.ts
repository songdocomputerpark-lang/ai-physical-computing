/**
 * 영상처리 실습실 ↔ 가상 보드 시리얼 선(P4-02, PLAN §8.4 설계 메모 ②·§7.3 "같은 컴퓨터 탭"). **DOM을 모르는 순수 논리**라
 * 단위 테스트(tests/unit/bridge-serial/)가 진짜 BroadcastChannel로 그대로 검사한다.
 *
 * 무엇을 하나
 * - 브릿지 핵심(src/lab/bridge/index.ts)의 통로를 열고, 보내는 차례(BridgeOutbox — §7.2 규칙 4·5, §7.6 병합)를 붙인다.
 * - 봉투 type은 PLAN §8.4 설계 메모 ②의 `uart.data`다: { type: 'uart.data', from: 'pc' | 'board', port, baud, bytes }.
 *   같은 접두어에 나중에 다른 줄기(브릿지 새 예제의 'bridge.data')가 들어와도 받는 쪽이 type으로 가른다(README 9.1).
 * - 접두어(PD-29)는 ① 주소의 ?bridge=… ② [이 접두어 고정](localStorage) ③ 이 탭(sessionStorage) 순서로 정한다.
 *   두 탭 실습은 ①(패널의 [ESP32 실습실 새 탭에서 열기]가 주소에 붙인다)이나 ②로 맞춘다.
 *
 * 왜 브릿지의 `Bridge` 클래스 대신 `BridgeOutbox`를 직접 쓰나
 * - 시리얼은 **글자 줄이 아니라 바이트 흐름**이다. 받는 쪽에서 줄로 모으면(BridgeInbox) 원본 f084의 `write(b'a')`처럼
 *   줄바꿈이 없는 바이트를 파이썬에 그대로 줄 수 없다. 그래서 받기는 바이트 그대로 올리고, 보내기만 차례(병합 규칙)를 쓴다.
 * - 속도(baud)는 메시지마다 다를 수 있어(학생이 9600으로 열면 그대로 보내야 속도 불일치 실습이 된다) 메시지별 정보를
 *   WeakMap으로 들고 있다가 실제로 나갈 때 봉투에 싣는다.
 *
 * 같은 선의 다른 줄기(판 1.1.0, PROGRESS 미해결 137): 컴퓨터 쪽 `bluetooth` 흉내(ble-pc)가 **다른 탭의 가상 보드**로 보낼 때도
 * 이 선(같은 접두어·같은 통로)을 쓴다. 바이트는 봉투 type `ble.data`(BLE_ENVELOPE_TYPE)로 실어 UART 줄기(`uart.data`)와 섞이지 않고,
 * 받는 쪽(ESP32 실습실의 vision-bridge)이 type을 보고 가상 블루투스에 넣는다. `subChannel(type)`은 그 줄기를 BridgeChannel 모양으로
 * 내주어 흉내 모듈이 자기 Bridge(보낼 차례·병합)를 그대로 끼우게 한다 — 접두어를 바꾸거나 선을 다시 열어도 따라간다.
 *
 * `Sent: …` 콘솔 줄(§7.6 ⑤)은 선 하나에 한 번만 건다(`shareSentPrinter`) — 같은 선을 쓰는 serial·bridge 흉내가 둘 다 붙어도 줄이 겹치지 않게.
 *
 * 라이선스: 사이트 소프트웨어(MIT, PD-26).
 */
import {
  BridgeClosedError,
  BridgeOutbox,
  TAB_BLE_DATA_TYPE,
  TAB_CHANNEL_ID,
  TAB_UART_DATA_TYPE,
  TAB_UART_STATUS_TYPE,
  bridgeText,
  createPrefix,
  ensurePrefix,
  isPinned,
  isValidPrefix,
  listBridgeChannels,
  openBridgeChannel,
  parsePrefix,
  pinPrefix,
  rawMessage,
  registerBuiltinChannels,
  streamMessage,
  unpinPrefix,
  writeSessionPrefix,
  type BridgeCategory,
  type BridgeChannel,
  type BridgeChannelEvents,
  type BridgeEnvelope,
  type BridgeMessage,
  type BridgeParty,
  type BridgeSendResult,
  type BridgeWarning,
  type PrefixStores,
} from '../../bridge/index.ts';

/** 봉투 type — PLAN §8.4 설계 메모 ②(`{type: 'uart.data', from, port, bytes, baud}`). 값은 브릿지 핵심이 정한 이름을 그대로 쓴다. */
export const UART_ENVELOPE_TYPE = TAB_UART_DATA_TYPE;
/** 같은 선의 블루투스 줄기(판 1.1.0, 미해결 137 — 머리말). 컴퓨터 쪽 bluetooth 흉내 ↔ 다른 탭의 가상 보드 블루투스 */
export const BLE_ENVELOPE_TYPE = TAB_BLE_DATA_TYPE;

/**
 * 받을 쪽 화면(ESP32 실습실 탭·한 화면 모드)을 찾지 못했을 때의 한국어 안내 — 같은 선을 쓰는 serial·bridge 흉내가 함께 쓴다
 * (파이썬 SerialException·BridgeNoPeer에 실린다. 오류 사전 comm-serial-no-peer가 앞 문장으로 알아본다).
 */
export function noPeerMessage(prefix: string): string {
  return [
    'ESP32 실습실 탭을 찾지 못했어요.',
    '[보내기] 패널의 [ESP32 실습실 새 탭에서 열기]나 [한 화면에 가상 보드 열기]를 누른 뒤 다시 [실행]해요.',
    `두 화면의 통신 접두어가 ${prefix}로 같아야 해요.`,
  ].join(' ');
}
/** 선 이름표(한 통로에 선이 여럿일 때 가른다. 지금은 USB-UART 변환기 한 줄) */
export const DEFAULT_PORT_LABEL = 'uart';
/** 주소에서 접두어를 받는 이름: /labs/esp32/?bridge=7kq2m9xd4hpt */
export const PREFIX_QUERY_NAME = 'bridge';
/** 상대가 나타나기를 기다리는 기본 시간(밀리초) — 한 화면 모드의 iframe이 뜨는 데 쓰는 시간 */
export const PEER_WAIT_MS = 4000;
/**
 * 끝의 실행 상태를 알리는 봉투 type(2026-09-25 Phase 4 검토 반영). 보드 탭이 [실행] 전인데 컴퓨터 탭이 글자를 보내면
 * 보드 탭 콘솔에만 안내가 있어, 컴퓨터 탭은 "이어졌어요"만 보였다. 보드 쪽이 'idle'을 되알리면 컴퓨터 쪽도 안내한다.
 * 바이트 줄기('uart.data')와 섞이지 않게 type을 따로 두고, **같은 컴퓨터 탭 통로에서만** 보낸다(MQTT·블루투스·실물 포트에는
 * 바이트만 흘러야 한다 — 받는 쪽 코드가 이 글자를 데이터로 읽으면 안 된다).
 */
export const UART_STATUS_TYPE = TAB_UART_STATUS_TYPE;

/** 끝의 실행 상태: 'idle' = [실행] 전(받은 글자가 사라진다), 'running' = 도는 중 */
export type PeerRunState = 'idle' | 'running';

/**
 * 상대에게 실행 상태를 묻는 말(UART_STATUS_TYPE 봉투의 글자 — 'idle'·'running'과 섞이지 않는다, 판 1.1.1 최종 점검).
 * 상대 탭이 6초 넘게 멈칫하면(느린 PC·바쁜 탭) 이 끝의 상대 목록에서 빠졌다가 다시 보이는데, 상대 쪽은 이 끝을 계속 보고 있어
 * "상대가 늘 때" 보내는 상태 알림이 다시 오지 않는다 — 그래서 상대가 (다시) 보이면 이 끝이 먼저 묻고, 상태를 가진 끝(보드 쪽,
 * answerStateWith)이 지금 상태로 답한다. 전에는 두 탭 블루투스가 한 번 끊기면 컴퓨터 쪽 connected가 거짓으로 굳었다.
 */
export const STATE_QUERY_TEXT = 'query';

/** 선을 지나온 바이트 한 덩어리 */
export interface UartFrame {
  /** 보낸 쪽 이름('pc'·'board') */
  readonly from: BridgeParty;
  readonly bytes: Uint8Array;
  /** 보낸 쪽이 쓴 속도(bps). 모르면 0 */
  readonly baud: number;
  readonly port: string;
  readonly at: number;
  /** 봉투 type(없으면 UART 줄기 'uart.data') */
  readonly type?: string;
}

export type LinkState = 'closed' | 'connecting' | 'open';

/** 화면(패널)이 그리는 데 필요한 것 전부 */
export interface LinkStatus {
  readonly state: LinkState;
  readonly channelId: string;
  readonly label: string;
  /** 화면에 늘 보여야 하는 주의 글(공개 브로커 경고 등, §7.4). 없으면 null */
  readonly notice: string | null;
  readonly prefix: string;
  readonly pinned: boolean;
  readonly peers: readonly BridgeParty[];
  /** 마지막 오류(한국어). 없으면 null */
  readonly error: string | null;
  readonly sentBytes: number;
  readonly receivedBytes: number;
}

export interface BridgeLinkOptions {
  /** 이 끝의 이름 — 개인정보를 넣지 않는다(README 9.1) */
  readonly from: BridgeParty;
  /** 접두어 저장 공간(테스트가 가짜를 넣는다) */
  readonly stores?: PrefixStores;
  /** 주소 글자(테스트가 넣는다). 없으면 location.search */
  readonly search?: string;
  /** 처음 쓸 접두어(테스트·한 화면 모드) */
  readonly prefix?: string;
  /** 통로 id(기본 'tab') */
  readonly channelId?: string;
  /** 보내는 사이 최소 간격(밀리초, 기본 100 — §7.2 규칙 4) */
  readonly minIntervalMs?: number;
}

/** 메시지마다 다른 봉투 값(속도·선 이름표) — 메시지는 얼어 있어 WeakMap으로 들고 있는다 */
interface FrameMeta {
  readonly baud: number;
  readonly port: string;
}

/** 주소(?bridge=…)에서 접두어를 읽는다. 없거나 모양이 틀리면 null */
export function prefixFromSearch(search: string | undefined): string | null {
  if (typeof search !== 'string' || search === '') {
    return null;
  }
  try {
    const value = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get(PREFIX_QUERY_NAME);
    return value !== null && isValidPrefix(value.trim().toLowerCase()) ? value.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/** 지금 이 화면이 쓸 접두어: 주소 → 고정해 둔 것·이 탭의 것 → 새로 만들기 */
export function resolvePrefix(options: { search?: string; stores?: PrefixStores; prefix?: string }): string {
  const given = options.prefix !== undefined && isValidPrefix(options.prefix) ? options.prefix : null;
  const fromUrl = prefixFromSearch(options.search);
  const prefix = given ?? fromUrl ?? ensurePrefix(options.stores ?? {});
  if (given !== null || fromUrl !== null) {
    // 주소로 받은 접두어는 이 탭에도 적어 둔다 — 새로고침해도 같은 선을 쓴다.
    writeSessionPrefix(prefix, options.stores ?? {});
  }
  return prefix;
}

/**
 * 영상처리 실습실과 가상 보드를 잇는 선 하나. 한 화면(iframe)이든 다른 탭이든 **같은 코드**로 쓴다(§7.2 규칙 6).
 */
export class BridgeLink {
  private readonly options: BridgeLinkOptions;
  private readonly outbox: BridgeOutbox;
  private readonly metaOf = new WeakMap<BridgeMessage, FrameMeta>();
  private readonly frameListeners = new Set<(frame: UartFrame) => void>();
  private readonly statusListeners = new Set<(status: LinkStatus) => void>();
  private readonly sentListeners = new Set<(line: string, message: BridgeMessage) => void>();
  private readonly warnListeners = new Set<(warning: BridgeWarning) => void>();
  private readonly peerStateListeners = new Set<(state: PeerRunState, from: BridgeParty) => void>();
  /** 같은 선의 다른 줄기(봉투 type → 듣는 곳) — 블루투스 줄기 등(미해결 137) */
  private readonly envelopeListeners = new Map<string, Set<(frame: UartFrame) => void>>();
  /** 다른 줄기로 실제로 나간 것을 듣는 곳([보내기] 패널의 "주고받은 글" — 판 1.1.1 최종 점검) */
  private readonly envelopeSentListeners = new Set<(type: string, bytes: Uint8Array) => void>();
  /** 상대가 실행 상태를 물을 때 답할 값(보드 쪽이 건다 — STATE_QUERY_TEXT). 없으면 답하지 않는다 */
  private stateProvider: (() => PeerRunState) | null = null;
  /** 지난번에 본 상대들(새로 보인 상대를 가려 실행 상태를 묻는다) */
  private knownPeers = new Set<BridgeParty>();
  private channel: BridgeChannel | null = null;
  private offMessage: (() => void) | null = null;
  private offPeers: (() => void) | null = null;
  private channelId: string;
  private linkState: LinkState = 'closed';
  private prefixValue: string;
  private errorText: string | null = null;
  private sent = 0;
  private received = 0;
  private opening: Promise<LinkStatus> | null = null;
  /** sendStream이 마지막으로 차례에 넣은 조각(아직 안 나갔으면 다음 조각을 여기에 이어 붙인다) */
  private streamTail: BridgeMessage | null = null;

  constructor(options: BridgeLinkOptions) {
    this.options = options;
    this.channelId = options.channelId ?? TAB_CHANNEL_ID;
    registerBuiltinChannels();
    this.prefixValue = resolvePrefix(options);
    this.outbox = new BridgeOutbox((message) => this.write(message), {
      ...(options.minIntervalMs === undefined ? {} : { minIntervalMs: options.minIntervalMs }),
      onWarn: (warning) => {
        for (const listener of this.warnListeners) {
          listener(warning);
        }
      },
      onSend: (message, line) => {
        this.sent += message.bytes.length;
        for (const listener of this.sentListeners) {
          listener(line, message);
        }
        this.emitStatus();
      },
      onError: (error) => {
        this.errorText = error instanceof Error ? error.message : String(error);
        this.emitStatus();
      },
    });
  }

  get status(): LinkStatus {
    const factory = listBridgeChannels().find((item) => item.id === this.channelId) ?? null;
    return {
      state: this.linkState,
      channelId: this.channelId,
      label: this.channel?.label ?? factory?.label ?? this.channelId,
      notice: factory?.notice ?? null,
      prefix: this.prefixValue,
      pinned: isPinned(this.options.stores ?? {}),
      peers: this.channel?.peers ?? [],
      error: this.errorText,
      sentBytes: this.sent,
      receivedBytes: this.received,
    };
  }

  get prefix(): string {
    return this.prefixValue;
  }

  /** 이 끝의 이름('pc'·'board') */
  get from(): BridgeParty {
    return this.options.from;
  }

  /** 지금 이 선에 보이는 상대가 있나 */
  get hasPeer(): boolean {
    return (this.channel?.peers.length ?? 0) > 0;
  }

  /** 바이트가 올 때마다 부른다. 돌려주는 함수를 부르면 그만 듣는다. */
  onFrame(listener: (frame: UartFrame) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  /** 상태(연결·상대·오류·바이트 수)가 바뀔 때마다 */
  onStatus(listener: (status: LinkStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** 한 덩어리가 실제로 나갔을 때(§7.6 규칙 ⑤ 콘솔 `Sent: …`) */
  onSent(listener: (line: string, message: BridgeMessage) => void): () => void {
    this.sentListeners.add(listener);
    return () => this.sentListeners.delete(listener);
  }

  /** 학생에게 보일 알림(길이 넘침·받을 쪽 없음·통로 닫힘) */
  onWarn(listener: (warning: BridgeWarning) => void): () => void {
    this.warnListeners.add(listener);
    return () => this.warnListeners.delete(listener);
  }

  /** 상대 끝이 실행 상태를 알려 올 때(UART_STATUS_TYPE) */
  onPeerState(listener: (state: PeerRunState, from: BridgeParty) => void): () => void {
    this.peerStateListeners.add(listener);
    return () => this.peerStateListeners.delete(listener);
  }

  /**
   * 같은 선의 **다른 줄기**(봉투 type이 UART·실행 상태가 아닌 것 — 블루투스 줄기 BLE_ENVELOPE_TYPE 등)로 온 바이트를 듣는다.
   * UART 줄기(onFrame)·바이트 셈(sentBytes·receivedBytes)과는 따로다. 돌려주는 함수를 부르면 그만 듣는다.
   */
  onEnvelope(type: string, listener: (frame: UartFrame) => void): () => void {
    const set = this.envelopeListeners.get(type) ?? new Set<(frame: UartFrame) => void>();
    set.add(listener);
    this.envelopeListeners.set(type, set);
    return () => {
      set.delete(listener);
      if (set.size === 0 && this.envelopeListeners.get(type) === set) {
        this.envelopeListeners.delete(type);
      }
    };
  }

  /**
   * 같은 선의 다른 줄기로 바이트를 **곧바로** 보낸다(이 선의 보낼 차례를 거치지 않는다 — 차례·병합은 부르는 쪽 Bridge가 맡는다).
   * 선이 열려 있지 않으면 BridgeClosedError. 통로가 상대를 알고 아무도 없으면 통로 규칙대로(BridgeNoPeerError 등) 던진다.
   */
  async sendEnvelope(type: string, bytes: Uint8Array): Promise<void> {
    const channel = this.channel;
    if (channel === null || this.linkState !== 'open' || channel.state !== 'open') {
      throw new BridgeClosedError(this.status.label);
    }
    await channel.send(bytes, { type });
    for (const listener of [...this.envelopeSentListeners]) {
      listener(type, bytes);
    }
  }

  /**
   * 다른 줄기(sendEnvelope)로 한 덩어리가 실제로 나갔을 때 — UART 줄기의 onSent와 짝. [보내기] 패널이 블루투스 줄기로 오간 글도
   * "주고받은 글"에 남기려고 듣는다(판 1.1.1 최종 점검: 코드가 보낸 글이 칸에 남지 않았다). 돌려주는 함수를 부르면 그만 듣는다.
   */
  onEnvelopeSent(listener: (type: string, bytes: Uint8Array) => void): () => void {
    this.envelopeSentListeners.add(listener);
    return () => this.envelopeSentListeners.delete(listener);
  }

  /**
   * 같은 선의 한 줄기를 **BridgeChannel 모양**으로 내준다 — 흉내 모듈이 자기 Bridge(보낼 차례·§7.6 병합)를 그대로 끼우게.
   * 선을 다시 열거나 접두어를 바꿔도 이 모양은 그대로 따라간다(지금의 선에 보낸다). close()는 선을 닫지 않는다(선은 여럿이 함께 쓴다).
   */
  subChannel(type: string, label?: string): BridgeChannel {
    return new LinkSubChannel(this, type, label);
  }

  /** 지금 선의 통로(없으면 null) — 부분 통로(LinkSubChannel)가 상대 목록을 읽는다 */
  get currentChannel(): BridgeChannel | null {
    return this.channel;
  }

  /**
   * 이 끝의 실행 상태를 상대에게 알린다. 같은 컴퓨터 탭 통로가 열려 있고 상대가 보일 때만 보내고(기다리지 않는다),
   * 보내지 못해도 조용히 넘어간다 — 안내를 돕는 신호일 뿐 실습 데이터가 아니다.
   */
  sendState(state: PeerRunState): boolean {
    const channel = this.channel;
    if (channel === null || this.linkState !== 'open' || this.channelId !== TAB_CHANNEL_ID || !this.hasPeer) {
      return false;
    }
    void channel.send(new TextEncoder().encode(state), { type: UART_STATUS_TYPE }).catch(() => undefined);
    return true;
  }

  /**
   * 상대에게 지금 실행 상태를 묻는다(STATE_QUERY_TEXT — 같은 컴퓨터 탭 통로가 열려 있고 상대가 보일 때만, 기다리지 않는다).
   * 상대가 새로 보이면 이 선이 스스로 묻고(상태를 듣는 곳이 있을 때), 흉내 모듈은 상대가 보이는데 상태를 모를 때 부른다.
   */
  queryState(): boolean {
    const channel = this.channel;
    if (channel === null || this.linkState !== 'open' || this.channelId !== TAB_CHANNEL_ID || !this.hasPeer) {
      return false;
    }
    void channel.send(new TextEncoder().encode(STATE_QUERY_TEXT), { type: UART_STATUS_TYPE }).catch(() => undefined);
    return true;
  }

  /** 상대가 실행 상태를 물으면 이 함수의 값으로 답한다(보드 쪽 — null이면 답하지 않는다) */
  answerStateWith(provider: (() => PeerRunState) | null): void {
    this.stateProvider = provider;
  }

  /** 통로를 연다(이미 열려 있으면 그대로). 통로 id를 주면 그 통로로 바꿔 연다. */
  async connect(channelId?: string): Promise<LinkStatus> {
    if (channelId !== undefined && channelId !== this.channelId) {
      this.disconnect();
      this.channelId = channelId;
    }
    if (this.channel !== null && this.linkState === 'open') {
      return this.status;
    }
    if (this.opening !== null) {
      return this.opening;
    }
    this.linkState = 'connecting';
    this.errorText = null;
    this.emitStatus();
    this.opening = (async () => {
      try {
        const channel = await openBridgeChannel(this.channelId, { from: this.options.from, prefix: this.prefixValue, type: UART_ENVELOPE_TYPE });
        this.attach(channel);
        this.linkState = 'open';
      } catch (error) {
        this.errorText = error instanceof Error ? error.message : String(error);
        this.linkState = 'closed';
      }
      this.opening = null;
      this.emitStatus();
      return this.status;
    })();
    return this.opening;
  }

  /** 통로를 닫는다(보낼 차례에 남은 것은 버린다) */
  disconnect(): void {
    this.offMessage?.();
    this.offPeers?.();
    this.offMessage = null;
    this.offPeers = null;
    this.channel?.close();
    this.channel = null;
    this.linkState = 'closed';
    this.knownPeers = new Set();
    this.emitStatus();
  }

  /** 접두어를 바꾼다(친구 접두어 입력·새로 만들기). 열려 있으면 새 접두어로 다시 연다. */
  async setPrefix(value: string): Promise<LinkStatus> {
    const parsed = parsePrefix(value);
    if (!parsed.ok) {
      this.errorText = parsed.reason;
      this.emitStatus();
      return this.status;
    }
    if (parsed.prefix === this.prefixValue) {
      return this.status;
    }
    const wasOpen = this.linkState === 'open';
    this.disconnect();
    this.prefixValue = parsed.prefix;
    writeSessionPrefix(this.prefixValue, this.options.stores ?? {});
    if (isPinned(this.options.stores ?? {})) {
      pinPrefix(this.prefixValue, this.options.stores ?? {});
    }
    this.errorText = null;
    this.emitStatus();
    return wasOpen ? this.connect() : this.status;
  }

  /** 새 접두어를 만들어 쓴다(§7.4 "연결할 때마다 [새 접두어 만들기]") */
  async newPrefix(): Promise<LinkStatus> {
    return this.setPrefix(createPrefix());
  }

  /** [이 접두어 고정]·고정 풀기(localStorage — [기록 지우기]가 함께 지운다) */
  setPinned(pinned: boolean): LinkStatus {
    if (pinned) {
      pinPrefix(this.prefixValue, this.options.stores ?? {});
    } else {
      unpinPrefix(this.options.stores ?? {});
    }
    this.emitStatus();
    return this.status;
  }

  /** 상대가 나타날 때까지 기다린다(최대 ms). 이미 있으면 바로 참. */
  async waitForPeer(ms = PEER_WAIT_MS): Promise<boolean> {
    if (this.hasPeer) {
      return true;
    }
    if (this.linkState !== 'open') {
      return false;
    }
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (found: boolean): void => {
        if (done) {
          return;
        }
        done = true;
        off();
        clearTimeout(timer);
        resolve(found);
      };
      const off = this.onStatus((status) => {
        if (status.peers.length > 0) {
          finish(true);
        }
      });
      const timer = setTimeout(() => finish(this.hasPeer), ms);
      // 통로가 상대를 셀 수 없으면(MQTT·BLE 같은 통로) 기다리지 않는다.
      if (this.channel !== null && !this.channel.knowsPeers) {
        finish(true);
      }
    });
  }

  /**
   * 바이트를 선으로 보낸다(§7.2 규칙 7·8 — 원본 코드가 준 바이트를 한 바이트도 고치지 않는다).
   * 보내기 자체는 기다리지 않는다: 차례가 초당 10회로 고르게 내보내고, 밀린 상태 메시지는 최신 값으로 바꿔 끼운다(§7.6).
   */
  sendBytes(bytes: Uint8Array, meta: { baud?: number; port?: string; category?: BridgeCategory } = {}): BridgeSendResult {
    // category는 새 예제용 bridge 모듈이 싣는다(bridge.event → 'event' — §7.2 규칙 5, 차례에서 바꿔 끼우지 않는다).
    // 원본 PC 코드(serial.py)는 싣지 않으므로 모양으로 판정한다(§7.6 병합 규칙 그대로).
    const message = rawMessage(bytes, meta.category === undefined ? {} : { category: meta.category });
    this.metaOf.set(message, { baud: meta.baud ?? 0, port: meta.port ?? DEFAULT_PORT_LABEL });
    return this.outbox.send(message);
  }

  /**
   * **바이트 흐름**을 보낸다 — 보드의 UART가 내보낸 바이트(보드 → 컴퓨터). 원본 PC 코드용 병합(§7.6)을 하지 않는다:
   * 실물 UART·pyserial은 바이트를 잃지도 순서를 바꾸지도 않는다(2026-09-25 Phase 4 검토 반영 — 전에는 보드가 `0\n`…`4\n`을
   * 따로 쓰면 값 모양으로 합쳐져 1·2·3줄이 사라졌다). 초당 10회 차례는 그대로 쓰되, 아직 나가지 않은 앞 조각에 이어 붙여
   * 한 덩어리로 보낸다(속도·선 이름표가 같을 때만).
   */
  sendStream(bytes: Uint8Array, meta: { baud?: number; port?: string } = {}): BridgeSendResult {
    const baud = meta.baud ?? 0;
    const port = meta.port ?? DEFAULT_PORT_LABEL;
    const tail = this.streamTail;
    if (tail !== null) {
      const tailMeta = this.metaOf.get(tail);
      if (tailMeta !== undefined && tailMeta.baud === baud && tailMeta.port === port) {
        const joinedBytes = new Uint8Array(tail.bytes.length + bytes.length);
        joinedBytes.set(tail.bytes, 0);
        joinedBytes.set(bytes, tail.bytes.length);
        const joined = streamMessage(joinedBytes);
        this.metaOf.set(joined, { baud, port });
        if (this.outbox.replaceTail(tail, joined)) {
          this.streamTail = joined;
          return 'merged';
        }
      }
    }
    const message = streamMessage(bytes);
    this.metaOf.set(message, { baud, port });
    this.streamTail = message;
    return this.outbox.send(message);
  }

  /** 보낼 차례에 남은 것을 버린다(실행을 새로 시작할 때) */
  reset(): void {
    this.streamTail = null;
    this.outbox.clear();
    this.sent = 0;
    this.received = 0;
    this.errorText = null;
    this.emitStatus();
  }

  /** 선을 닫고 듣던 것을 모두 푼다 */
  close(): void {
    this.outbox.close();
    this.disconnect();
    this.frameListeners.clear();
    this.statusListeners.clear();
    this.sentListeners.clear();
    this.warnListeners.clear();
    this.peerStateListeners.clear();
    this.envelopeListeners.clear();
    this.envelopeSentListeners.clear();
    this.stateProvider = null;
  }

  private attach(channel: BridgeChannel): void {
    this.channel = channel;
    this.offMessage = channel.on('message', (envelope) => {
      if (envelope.type === UART_STATUS_TYPE) {
        const text = envelope.bytes instanceof Uint8Array ? new TextDecoder().decode(envelope.bytes) : '';
        if (text === STATE_QUERY_TEXT) {
          // 상대가 이 끝의 실행 상태를 물었다 — 상태를 가진 끝(answerStateWith를 건 보드 쪽)만 답한다
          const provider = this.stateProvider;
          if (provider !== null) {
            this.sendState(provider());
          }
          return;
        }
        if (text === 'idle' || text === 'running') {
          for (const listener of this.peerStateListeners) {
            listener(text, envelope.from);
          }
        }
        return;
      }
      if (envelope.type !== UART_ENVELOPE_TYPE) {
        // 같은 접두어의 다른 줄기: 듣는 곳(onEnvelope — 블루투스 줄기 등)이 있으면 그리로, 없으면 그냥 둔다.
        const listeners = this.envelopeListeners.get(envelope.type);
        if (listeners !== undefined && listeners.size > 0) {
          const frame = this.frameOf(envelope);
          for (const listener of [...listeners]) {
            listener(frame);
          }
        }
        return;
      }
      const bytes = envelope.bytes instanceof Uint8Array ? envelope.bytes : new Uint8Array(0);
      if (bytes.length === 0) {
        return;
      }
      this.received += bytes.length;
      const frame = this.frameOf(envelope);
      for (const listener of this.frameListeners) {
        listener(frame);
      }
      this.emitStatus();
    });
    this.knownPeers = new Set(channel.peers);
    this.offPeers = channel.on('peers', (peers) => {
      const appeared = peers.some((party) => !this.knownPeers.has(party));
      this.knownPeers = new Set(peers);
      if (appeared && this.peerStateListeners.size > 0) {
        // 새로 보인(또는 잠깐 끊겼다 다시 보인) 상대에게 실행 상태를 묻는다 — STATE_QUERY_TEXT 머리말
        this.queryState();
      }
      this.emitStatus();
    });
  }

  /** 봉투 → 받은 덩어리(바이트는 Uint8Array로) */
  private frameOf(envelope: BridgeEnvelope): UartFrame {
    return {
      from: envelope.from,
      bytes: envelope.bytes instanceof Uint8Array ? envelope.bytes : new Uint8Array(0),
      baud: typeof envelope.baud === 'number' ? envelope.baud : 0,
      port: envelope.port ?? DEFAULT_PORT_LABEL,
      at: envelope.at,
      type: envelope.type,
    };
  }

  private async write(message: BridgeMessage): Promise<void> {
    const channel = this.channel;
    if (channel === null) {
      throw new Error(bridgeText.closed(this.status.label));
    }
    const meta = this.metaOf.get(message) ?? { baud: 0, port: DEFAULT_PORT_LABEL };
    await channel.send(message.bytes, { type: UART_ENVELOPE_TYPE, baud: meta.baud, port: meta.port });
  }

  private emitStatus(): void {
    const status = this.status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}

/**
 * 선의 한 줄기를 BridgeChannel 모양으로(BridgeLink.subChannel). 흉내 모듈의 Bridge가 `setChannel`로 끼워 쓴다.
 * 상태·상대는 선의 지금 통로를 그대로 비춘다. 받기는 onEnvelope(type), 보내기는 sendEnvelope(type)이다.
 */
class LinkSubChannel implements BridgeChannel {
  readonly from: BridgeParty;
  readonly label: string;
  readonly #link: BridgeLink;
  readonly #type: string;
  readonly #offs = new Set<() => void>();

  constructor(link: BridgeLink, type: string, label?: string) {
    this.#link = link;
    this.#type = type;
    this.from = link.from;
    this.label = label ?? link.status.label;
  }

  get id(): string {
    return this.#link.status.channelId;
  }

  get state(): 'open' | 'closed' {
    const channel = this.#link.currentChannel;
    return this.#link.status.state === 'open' && channel !== null && channel.state === 'open' ? 'open' : 'closed';
  }

  get peers(): readonly BridgeParty[] {
    return this.state === 'open' ? this.#link.status.peers : [];
  }

  get knowsPeers(): boolean {
    return this.#link.currentChannel?.knowsPeers ?? true;
  }

  send(bytes: Uint8Array): Promise<void> {
    return this.#link.sendEnvelope(this.#type, bytes);
  }

  on<K extends keyof BridgeChannelEvents>(event: K, listener: BridgeChannelEvents[K]): () => void {
    let off: () => void;
    if (event === 'message') {
      const onMessage = listener as BridgeChannelEvents['message'];
      off = this.#link.onEnvelope(this.#type, (frame) => {
        onMessage({ v: 1, type: this.#type, from: frame.from, bytes: frame.bytes, at: frame.at, port: frame.port, ...(frame.baud > 0 ? { baud: frame.baud } : {}) });
      });
    } else if (event === 'peers') {
      const onPeers = listener as BridgeChannelEvents['peers'];
      let last = '';
      off = this.#link.onStatus((status) => {
        const key = status.state === 'open' ? status.peers.join(' ') : '';
        if (key !== last) {
          last = key;
          onPeers(status.state === 'open' ? status.peers : []);
        }
      });
    } else {
      const onClose = listener as BridgeChannelEvents['close'];
      let wasOpen = this.state === 'open';
      off = this.#link.onStatus((status) => {
        if (wasOpen && status.state !== 'open') {
          onClose('선이 닫혔어요.');
        }
        wasOpen = status.state === 'open';
      });
    }
    this.#offs.add(off);
    return () => {
      off();
      this.#offs.delete(off);
    };
  }

  /** 듣던 것만 푼다 — 선 자체는 여럿이 함께 쓰므로 닫지 않는다 */
  close(): void {
    for (const off of [...this.#offs]) {
      off();
    }
    this.#offs.clear();
  }
}

/** 선마다 `Sent: …` 줄을 적는 곳 하나(shareSentPrinter) — 쓰는 모듈 수를 센다 */
const sentPrinters = new WeakMap<BridgeLink, { users: number; off: () => void }>();

/**
 * 선으로 실제로 나간 줄을 콘솔에 `Sent: …`로 한 번씩 적는다(§7.6 ⑤). **같은 선에 흉내 모듈이 여럿 붙어도(serial·bridge) 한 번만** 건다 —
 * 먼저 부른 모듈의 write가 적고, 부른 모듈이 모두 풀면 멈춘다. 돌려주는 함수를 부르면 그 모듈 몫을 푼다.
 */
export function shareSentPrinter(link: BridgeLink, write: (line: string) => void): () => void {
  const found = sentPrinters.get(link);
  if (found !== undefined) {
    found.users += 1;
  } else {
    sentPrinters.set(link, { users: 1, off: link.onSent((line) => write(`${line}\n`)) });
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    const entry = sentPrinters.get(link);
    if (entry === undefined) {
      return;
    }
    entry.users -= 1;
    if (entry.users <= 0) {
      entry.off();
      sentPrinters.delete(link);
    }
  };
}

/** 실습실 화면 하나에 선 하나(영상처리의 serial 흉내와 [보내기] 패널이 같은 선을 쓴다) */
const links = new WeakMap<object, BridgeLink>();

/**
 * 이 실습실 화면의 선을 얻는다(없으면 만든다). 먼저 부른 쪽의 이름(from)으로 만들어지므로
 * 영상처리 실습실은 'pc', ESP32 실습실은 'board'을 넘긴다.
 */
export function getBridgeLink(key: object, options: BridgeLinkOptions): BridgeLink {
  const found = links.get(key);
  if (found !== undefined) {
    return found;
  }
  const link = new BridgeLink(options);
  links.set(key, link);
  return link;
}

/** 테스트·페이지 떠남 정리용 */
export function dropBridgeLink(key: object): void {
  const found = links.get(key);
  if (found !== undefined) {
    found.close();
    links.delete(key);
  }
}
