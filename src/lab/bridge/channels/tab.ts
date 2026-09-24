/**
 * 같은 컴퓨터 탭 통로(PD-17, PLAN §7.3 마지막 줄 — P4-01). 인터넷 없이, 이 컴퓨터 밖으로 한 바이트도 나가지 않고
 * **같은 브라우저·같은 출처**의 다른 탭과 통한다(MDN BroadcastChannel: 같은 출처 안에서만).
 *
 * 채널 이름 = `ai-physical-computing:bridge:<접두어>`
 * - 접두어는 PD-29의 무작위 12글자(prefix.ts). 고정 루트를 쓰지 않는다.
 * - 앞의 사이트 이름은 **다른 사이트와 섞이지 않게** 붙인다: 이 사이트는 같은 계정의 다른 GitHub Pages 사이트와
 *   출처(songdocomputerpark-lang.github.io)를 나눠 쓴다(src/lib/storage.ts와 같은 사정). BroadcastChannel 이름은
 *   밖에서 볼 수 없으므로 PD-29가 막으려는 "루트 하나로 남의 토픽 엿보기" 문제와는 상관이 없다.
 *
 * 상대가 있는지 아는 법(BroadcastChannel에는 상대를 세는 기능이 없다)
 * - 열 때 `bridge.hello`를 보내고, 받은 쪽은 `bridge.here`로 답한다. 그 뒤로는 heartbeatMs마다 `bridge.here`를 보낸다.
 * - peerTimeoutMs 동안 소식이 없으면 목록에서 뺀다. 닫을 때는 `bridge.bye`.
 * - `requirePeer`(기본 참)면 상대가 없을 때 보내기가 BridgeNoPeerError를 던진다 — "ESP32 실습실 탭을 열어요" 안내로 이어진다.
 *   보내기 직전에 discoveryMs만큼 한 번 더 기다려 본다(막 열린 탭이 답할 시간).
 */
import { BridgeClosedError, BridgeNoPeerError } from '../messages.ts';
import type { BridgeChannel, BridgeChannelEvents, BridgeChannelState, BridgeParty, BridgeSendOptions } from '../types.ts';
import type { BridgeScheduler } from '../outbox.ts';
import { systemScheduler } from '../outbox.ts';
import { BridgeChannelEmitter } from './emitter.ts';
import { BRIDGE_BYE_TYPE, BRIDGE_HELLO_TYPE, BRIDGE_HERE_TYPE, isPresenceType, makeEnvelope, parseEnvelope } from './envelope.ts';
import { BRIDGE_DATA_TYPE } from './direct.ts';

/** 통로 종류 id */
export const TAB_CHANNEL_ID = 'tab';
/** PLAN §8.4 설계 메모 ②의 UART 통로 봉투 type */
export const TAB_UART_DATA_TYPE = 'uart.data';
/** 선의 한 끝이 실행 상태를 알리는 봉투 type — 정의는 envelope.ts(데이터로 읽는 쪽이 가벼운 파일에서 가져가게) */
export { TAB_UART_STATUS_TYPE } from './envelope.ts';
/** 채널 이름 머리말 */
export const TAB_CHANNEL_NAME_PREFIX = 'ai-physical-computing:bridge:';

/** 진짜 BroadcastChannel과 테스트용 가짜가 함께 따르는 모양 */
export interface BroadcastChannelLike {
  postMessage(data: unknown): void;
  close(): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export interface TabChannelOptions {
  readonly from: BridgeParty;
  /** 통신 접두어(PD-29) */
  readonly prefix: string;
  /** 데이터 봉투 type(기본 'bridge.data', UART 통로는 'uart.data') */
  readonly type?: string;
  readonly label?: string;
  /** 상대가 없으면 보내기가 오류를 낸다(기본 참) */
  readonly requirePeer?: boolean;
  /** 상대를 기다려 보는 시간(밀리초, 기본 500) */
  readonly discoveryMs?: number;
  /** 살아 있다고 알리는 간격(밀리초, 기본 2000) */
  readonly heartbeatMs?: number;
  /** 이 시간 동안 소식이 없으면 상대 목록에서 뺀다(밀리초, 기본 6000) */
  readonly peerTimeoutMs?: number;
  readonly scheduler?: BridgeScheduler;
  /** BroadcastChannel을 만드는 함수(테스트가 가짜를 넣는다) */
  readonly factory?: (name: string) => BroadcastChannelLike;
}

/** 이 브라우저에서 같은 컴퓨터 탭 통로를 쓸 수 있나 */
export function isTabChannelAvailable(): boolean {
  return typeof (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel === 'function';
}

/** 접두어로 채널 이름을 만든다 */
export function tabChannelName(prefix: string): string {
  return `${TAB_CHANNEL_NAME_PREFIX}${prefix}`;
}

function defaultFactory(name: string): BroadcastChannelLike {
  const ctor = (globalThis as { BroadcastChannel?: new (name: string) => unknown }).BroadcastChannel;
  if (ctor === undefined) {
    throw new Error('이 브라우저는 같은 컴퓨터 탭 통로(BroadcastChannel)를 쓸 수 없어요.');
  }
  return new ctor(name) as unknown as BroadcastChannelLike;
}

class TabChannel implements BridgeChannel {
  readonly id = TAB_CHANNEL_ID;
  readonly label: string;
  readonly from: BridgeParty;
  readonly knowsPeers = true;
  readonly name: string;
  private readonly emitter = new BridgeChannelEmitter();
  private readonly options: TabChannelOptions;
  private readonly scheduler: BridgeScheduler;
  private readonly type: string;
  private readonly seen = new Map<BridgeParty, number>();
  private readonly listener: (event: { data: unknown }) => void;
  private readonly channel: BroadcastChannelLike;
  private heartbeat: unknown = null;
  private channelState: BridgeChannelState = 'open';

  constructor(options: TabChannelOptions) {
    this.options = options;
    this.from = options.from;
    this.type = options.type ?? BRIDGE_DATA_TYPE;
    this.label = options.label ?? '같은 컴퓨터 탭';
    this.scheduler = options.scheduler ?? systemScheduler;
    this.name = tabChannelName(options.prefix);
    this.channel = (options.factory ?? defaultFactory)(this.name);
    this.listener = (event) => {
      this.receive(event.data);
    };
    this.channel.addEventListener('message', this.listener);
    this.post(BRIDGE_HELLO_TYPE);
    this.armHeartbeat();
  }

  get state(): BridgeChannelState {
    return this.channelState;
  }

  get peers(): readonly BridgeParty[] {
    this.forgetOld();
    return Array.from(this.seen.keys());
  }

  private get heartbeatMs(): number {
    return this.options.heartbeatMs ?? 2000;
  }

  private get peerTimeoutMs(): number {
    return this.options.peerTimeoutMs ?? 6000;
  }

  private forgetOld(): void {
    const now = this.scheduler.now();
    let changed = false;
    for (const [party, at] of Array.from(this.seen.entries())) {
      if (now - at > this.peerTimeoutMs) {
        this.seen.delete(party);
        changed = true;
      }
    }
    if (changed) {
      this.emitter.emit('peers', Array.from(this.seen.keys()));
    }
  }

  private armHeartbeat(): void {
    this.heartbeat = this.scheduler.setTimeout(() => {
      this.heartbeat = null;
      if (this.channelState !== 'open') {
        return;
      }
      this.post(BRIDGE_HERE_TYPE);
      this.forgetOld();
      this.armHeartbeat();
    }, this.heartbeatMs);
  }

  private post(type: string, bytes?: Uint8Array, options: BridgeSendOptions = {}): void {
    const envelope = makeEnvelope({
      type,
      from: this.from,
      ...(options.to === undefined ? {} : { to: options.to }),
      ...(options.port === undefined ? {} : { port: options.port }),
      ...(options.baud === undefined ? {} : { baud: options.baud }),
      ...(bytes === undefined ? {} : { bytes }),
      at: this.scheduler.now(),
    });
    this.channel.postMessage(envelope);
  }

  private receive(data: unknown): void {
    const envelope = parseEnvelope(data);
    if (envelope === null || envelope.from === this.from) {
      // 같은 이름은 나 자신이다(BroadcastChannel은 자기 탭에 돌려보내지 않지만, 한 탭에 통로가 둘일 수 있다).
      return;
    }
    if (envelope.type === BRIDGE_BYE_TYPE) {
      if (this.seen.delete(envelope.from)) {
        this.emitter.emit('peers', Array.from(this.seen.keys()));
      }
      return;
    }
    const isNew = !this.seen.has(envelope.from);
    this.seen.set(envelope.from, this.scheduler.now());
    if (isNew) {
      this.emitter.emit('peers', Array.from(this.seen.keys()));
    }
    if (envelope.type === BRIDGE_HELLO_TYPE) {
      // 먼저 열려 있던 쪽이 답해 준다.
      this.post(BRIDGE_HERE_TYPE);
      return;
    }
    if (isPresenceType(envelope.type)) {
      return;
    }
    if (envelope.to !== undefined && envelope.to !== this.from) {
      return;
    }
    this.emitter.emit('message', envelope);
  }

  /** 상대가 나타날 때까지 기다린다(최대 ms). 이미 있으면 바로 참. */
  waitForPeer(ms: number): Promise<boolean> {
    if (this.peers.length > 0) {
      return Promise.resolve(true);
    }
    if (this.channelState !== 'open') {
      return Promise.resolve(false);
    }
    // 막 열린 탭이 있을 수 있으니 한 번 더 인사한다.
    this.post(BRIDGE_HELLO_TYPE);
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (found: boolean): void => {
        if (done) {
          return;
        }
        done = true;
        off();
        this.scheduler.clearTimeout(timer);
        resolve(found);
      };
      const off = this.emitter.on('peers', (peers) => {
        if (peers.length > 0) {
          finish(true);
        }
      });
      const timer = this.scheduler.setTimeout(() => {
        finish(this.peers.length > 0);
      }, ms);
    });
  }

  async send(bytes: Uint8Array, options: BridgeSendOptions = {}): Promise<void> {
    if (this.channelState !== 'open') {
      throw new BridgeClosedError(this.label);
    }
    if (this.options.requirePeer !== false && this.peers.length === 0) {
      const found = await this.waitForPeer(this.options.discoveryMs ?? 500);
      if (!found) {
        throw new BridgeNoPeerError(this.label, options.to);
      }
      if (this.channelState !== 'open') {
        throw new BridgeClosedError(this.label);
      }
    }
    this.post(options.type ?? this.type, bytes, options);
  }

  on<K extends keyof BridgeChannelEvents>(event: K, listener: BridgeChannelEvents[K]): () => void {
    return this.emitter.on(event, listener);
  }

  close(reason = '닫음'): void {
    if (this.channelState === 'closed') {
      return;
    }
    this.channelState = 'closed';
    if (this.heartbeat !== null) {
      this.scheduler.clearTimeout(this.heartbeat);
      this.heartbeat = null;
    }
    try {
      this.post(BRIDGE_BYE_TYPE);
    } catch {
      // 이미 닫힌 채널이면 그냥 둔다.
    }
    this.channel.removeEventListener('message', this.listener);
    this.channel.close();
    this.emitter.emit('close', reason);
    this.emitter.clear();
    this.seen.clear();
  }
}

/** 같은 컴퓨터 탭 통로를 연다 */
export function createTabChannel(options: TabChannelOptions): BridgeChannel & { readonly name: string; waitForPeer(ms: number): Promise<boolean> } {
  return new TabChannel(options);
}
