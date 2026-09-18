/**
 * 같은 탭 안 직접 연결 통로(P4-01, PLAN §7.3 "같은 페이지 가상 보드").
 * 한 화면에 영상처리와 가상 보드를 함께 놓는 모드(P4-02·P4-09)와 단위 테스트가 쓴다 — 브라우저 API를 하나도 쓰지 않는다.
 *
 *   const [pc, board] = createDirectPair({ a: 'pc', b: 'board' });
 *   board.on('message', (envelope) => …);
 *   await pc.send(new TextEncoder().encode('a\n'));
 *
 * 여럿이 함께 쓰려면 통로 묶음(hub)에 이름표를 달고 들어온다 — 같은 컴퓨터 탭 통로와 모양이 같아
 * 화면 코드를 고치지 않고 통로만 갈아 끼울 수 있다.
 *
 *   const hub = createDirectHub();
 *   const pc = hub.join('pc');
 *   const board = hub.join('board');
 *
 * 전달은 실물 통로처럼 **다음 차례에**(마이크로태스크) 간다 — 보내자마자 같은 줄에서 받아지면
 * 다른 통로로 바꿔 끼웠을 때 동작이 달라지기 때문이다.
 */
import { BridgeClosedError, BridgeNoPeerError } from '../messages.ts';
import type { BridgeChannel, BridgeChannelEvents, BridgeChannelState, BridgeParty, BridgeSendOptions } from '../types.ts';
import { BridgeChannelEmitter } from './emitter.ts';
import { makeEnvelope } from './envelope.ts';

/** 통로 종류 id */
export const DIRECT_CHANNEL_ID = 'direct';
/** 기본 봉투 type */
export const BRIDGE_DATA_TYPE = 'bridge.data';

export interface DirectHubOptions {
  readonly label?: string;
  readonly type?: string;
  /** 상대가 없으면 보내기가 오류를 낸다(기본 거짓 — 한 화면 모드는 상대가 늘 같이 생긴다) */
  readonly requirePeer?: boolean;
  readonly now?: () => number;
}

class DirectChannel implements BridgeChannel {
  readonly id = DIRECT_CHANNEL_ID;
  readonly label: string;
  readonly from: BridgeParty;
  readonly knowsPeers = true;
  readonly emitter = new BridgeChannelEmitter();
  private readonly hub: DirectHub;
  private channelState: BridgeChannelState = 'open';

  constructor(hub: DirectHub, from: BridgeParty, label: string) {
    this.hub = hub;
    this.from = from;
    this.label = label;
  }

  get state(): BridgeChannelState {
    return this.channelState;
  }

  get peers(): readonly BridgeParty[] {
    return this.hub.partiesExcept(this);
  }

  async send(bytes: Uint8Array, options: BridgeSendOptions = {}): Promise<void> {
    if (this.channelState !== 'open') {
      throw new BridgeClosedError(this.label);
    }
    if (this.hub.requirePeer && this.peers.length === 0) {
      throw new BridgeNoPeerError(this.label, options.to);
    }
    const envelope = makeEnvelope({
      type: options.type ?? this.hub.type,
      from: this.from,
      ...(options.to === undefined ? {} : { to: options.to }),
      ...(options.port === undefined ? {} : { port: options.port }),
      ...(options.baud === undefined ? {} : { baud: options.baud }),
      bytes,
      at: this.hub.now(),
    });
    await Promise.resolve();
    this.hub.deliver(this, envelope);
  }

  on<K extends keyof BridgeChannelEvents>(event: K, listener: BridgeChannelEvents[K]): () => void {
    return this.emitter.on(event, listener);
  }

  close(reason = '닫음'): void {
    if (this.channelState === 'closed') {
      return;
    }
    this.channelState = 'closed';
    this.hub.leave(this);
    this.emitter.emit('close', reason);
    this.emitter.clear();
  }
}

/** 같은 탭 안에서 통로를 나눠 쓰는 묶음 */
export class DirectHub {
  private readonly members: DirectChannel[] = [];
  private readonly options: DirectHubOptions;

  constructor(options: DirectHubOptions = {}) {
    this.options = options;
  }

  get type(): string {
    return this.options.type ?? BRIDGE_DATA_TYPE;
  }

  get requirePeer(): boolean {
    return this.options.requirePeer === true;
  }

  now(): number {
    return this.options.now?.() ?? Date.now();
  }

  /** 이름표를 달고 들어온다 */
  join(from: BridgeParty): BridgeChannel {
    const channel = new DirectChannel(this, from, this.options.label ?? '같은 화면 연결');
    this.members.push(channel);
    for (const member of this.members) {
      member.emitter.emit('peers', this.partiesExcept(member));
    }
    return channel;
  }

  partiesExcept(channel: DirectChannel): readonly BridgeParty[] {
    return this.members.filter((member) => member !== channel && member.state === 'open').map((member) => member.from);
  }

  leave(channel: DirectChannel): void {
    const index = this.members.indexOf(channel);
    if (index >= 0) {
      this.members.splice(index, 1);
    }
    for (const member of this.members) {
      member.emitter.emit('peers', this.partiesExcept(member));
    }
  }

  deliver(sender: DirectChannel, envelope: ReturnType<typeof makeEnvelope>): void {
    for (const member of this.members) {
      if (member === sender || member.state !== 'open') {
        continue;
      }
      if (envelope.to !== undefined && envelope.to !== member.from) {
        continue;
      }
      member.emitter.emit('message', envelope);
    }
  }
}

/** 통로 묶음을 만든다 */
export function createDirectHub(options: DirectHubOptions = {}): DirectHub {
  return new DirectHub(options);
}

/** 서로 이어진 통로 두 개를 만든다. 앞쪽이 a, 뒤쪽이 b다. */
export function createDirectPair(options: { a: BridgeParty; b: BridgeParty } & DirectHubOptions): [BridgeChannel, BridgeChannel] {
  const hub = createDirectHub(options);
  return [hub.join(options.a), hub.join(options.b)];
}
