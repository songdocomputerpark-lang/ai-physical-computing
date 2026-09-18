/**
 * 브릿지 하나 — 통로(어디로) + 보낼 차례(언제) + 받는 차례(무엇이 왔나)를 묶은 것(P4-01).
 * 화면·흉내 모듈은 통로 종류를 모른 채 이것만 쓴다. 통로를 갈아 끼워도 같은 코드가 돈다(PLAN §7.2 규칙 6).
 *
 *   const bridge = createBridge(channel);
 *   bridge.send('355,152');              // 상태 — 밀리면 최신 값만(§7.2-5)
 *   bridge.event('DATA,10,20,1,0');      // 이벤트 — 반드시 한 번
 *   bridge.sendBytes(Uint8Array.of(3));  // 원시 바이트 — 끝 문자 없음(§7.2-7)
 *   bridge.receive();                    // 받은 한 줄, 없으면 null
 *
 * 파이썬 쪽 `bridge` 모듈(P4-02)과 원본 코드 흉내(`serial`·`bluetooth`)가 모두 이 네 가지로 이어진다.
 * 원본 코드가 보낸 바이트는 `sendBytes`로 들어와 **한 바이트도 바뀌지 않고** 나간다(§7.2-8).
 */
import { BridgeInbox, type BridgeInboundPolicy } from './inbox.ts';
import { rawMessage, sentLineOf, textMessage } from './message.ts';
import { BridgeError } from './messages.ts';
import { BridgeOutbox, type BridgeScheduler, type BridgeSendResult } from './outbox.ts';
import type { BridgeChannel, BridgeEnvelope, BridgeMessage, BridgeParty, BridgeSendOptions, BridgeWarning } from './types.ts';

export interface BridgeOptions {
  /** 보내는 사이 최소 간격(밀리초, 기본 100) */
  readonly minIntervalMs?: number;
  /** 앞서 보낸 상태 메시지와 똑같으면 건너뛴다(§7.2-4 "값이 바뀔 때만"). `bridge.send()`용 기본은 참 */
  readonly skipUnchangedState?: boolean;
  /** 한 메시지 최대 바이트(기본 20) */
  readonly maxBytes?: number;
  /** 끝 문자(기본 '\n'). 붙이지 않으려면 '' */
  readonly terminator?: string;
  /** 받는 쪽 거르기(허용 목록·길이 — PD-29) */
  readonly inbound?: BridgeInboundPolicy;
  /** 보낼 때 함께 넣을 것(포트 이름표·속도 등) */
  readonly send?: BridgeSendOptions;
  readonly scheduler?: BridgeScheduler;
  /** 학생에게 보여 줄 알림(길이 넘침 등) */
  readonly onWarn?: (warning: BridgeWarning) => void;
  /** 한 개가 나갔다 — 콘솔 `Sent: …`(§7.6-⑤) */
  readonly onSend?: (message: BridgeMessage, line: string) => void;
  /** 보내다 난 오류(통로 닫힘·상대 없음) */
  readonly onError?: (error: unknown, message: BridgeMessage) => void;
  /** 한 줄이 왔다 */
  readonly onLine?: (line: string, envelope: BridgeEnvelope) => void;
  /** 거른 줄이 있다(허용 목록 밖·너무 김) */
  readonly onRejected?: (line: string, warning: BridgeWarning) => void;
  /** 상대 목록이 바뀌었다 */
  readonly onPeers?: (peers: readonly BridgeParty[]) => void;
}

export class Bridge {
  readonly channel: BridgeChannel;
  private readonly options: BridgeOptions;
  private readonly outbox: BridgeOutbox;
  private readonly box: BridgeInbox;
  private readonly offs: Array<() => void> = [];
  private lastEnvelope: BridgeEnvelope | null = null;

  constructor(channel: BridgeChannel, options: BridgeOptions = {}) {
    this.channel = channel;
    this.options = options;
    this.box = new BridgeInbox({
      ...(options.inbound ?? {}),
      onLine: (line) => {
        const envelope = this.lastEnvelope;
        if (envelope !== null) {
          options.onLine?.(line, envelope);
        }
      },
      ...(options.onRejected === undefined ? {} : { onRejected: options.onRejected }),
    });
    this.outbox = new BridgeOutbox((message) => this.channel.send(message.bytes, options.send ?? {}), {
      ...(options.minIntervalMs === undefined ? {} : { minIntervalMs: options.minIntervalMs }),
      skipUnchangedState: options.skipUnchangedState ?? false,
      ...(options.scheduler === undefined ? {} : { scheduler: options.scheduler }),
      ...(options.onWarn === undefined ? {} : { onWarn: options.onWarn }),
      ...(options.onSend === undefined ? {} : { onSend: options.onSend }),
      onError: (error, message) => {
        if (error instanceof BridgeError) {
          options.onWarn?.({ code: error.code, text: error.message });
        }
        options.onError?.(error, message);
      },
    });
    this.offs.push(
      this.channel.on('message', (envelope) => {
        this.lastEnvelope = envelope;
        this.box.push(envelope.bytes);
      }),
    );
    if (options.onPeers !== undefined) {
      this.offs.push(this.channel.on('peers', options.onPeers));
    }
  }

  /** 지금 이 통로에 보이는 상대 */
  get peers(): readonly BridgeParty[] {
    return this.channel.peers;
  }

  /** 아직 나가지 않고 차례에서 기다리는 메시지 */
  get pending(): readonly BridgeMessage[] {
    return this.outbox.pending;
  }

  /** 상태 메시지를 보낸다(좌표·개수). 밀리면 최신 값만 나간다. */
  send(text: string): BridgeSendResult {
    return this.outbox.send(this.makeText(text, 'state'));
  }

  /** 이벤트 메시지를 보낸다(클릭·버튼). 밀려도 사라지지 않고 반드시 한 번 나간다. */
  event(text: string): BridgeSendResult {
    return this.outbox.send(this.makeText(text, 'event'));
  }

  /** 바이트를 그대로 보낸다(§7.2-7·8). 끝 문자를 붙이지 않는다. */
  sendBytes(bytes: Uint8Array, category?: 'state' | 'event'): BridgeSendResult {
    return this.outbox.send(
      rawMessage(bytes, {
        ...(category === undefined ? {} : { category }),
        ...(this.options.maxBytes === undefined ? {} : { maxBytes: this.options.maxBytes }),
      }),
    );
  }

  /** 이미 만든 메시지를 보낸다(흉내 모듈이 직접 모양을 정할 때) */
  sendMessage(message: BridgeMessage): BridgeSendResult {
    return this.outbox.send(message);
  }

  private makeText(text: string, category: 'state' | 'event'): BridgeMessage {
    return textMessage(text, {
      category,
      ...(this.options.terminator === undefined ? {} : { terminator: this.options.terminator }),
      ...(this.options.maxBytes === undefined ? {} : { maxBytes: this.options.maxBytes }),
    });
  }

  /** 받은 한 줄을 꺼낸다. 없으면 null(파이썬 `bridge.receive()`가 None으로 바꾼다). */
  receive(): string | null {
    return this.box.take();
  }

  /** 받아 둔 줄을 모두 꺼낸다 */
  receiveAll(): string[] {
    return this.box.takeAll();
  }

  /** 받은 줄 수 */
  get received(): number {
    return this.box.length;
  }

  /** 보낼 것·받은 것을 모두 버린다(실행을 새로 시작할 때) */
  reset(): void {
    this.outbox.clear();
    this.box.clear();
  }

  /** 브릿지를 닫는다(통로도 함께 닫으려면 closeChannel = true) */
  close(closeChannel = true): void {
    for (const off of this.offs) {
      off();
    }
    this.offs.length = 0;
    this.outbox.close();
    this.box.clear();
    if (closeChannel) {
      this.channel.close();
    }
  }
}

/** 브릿지를 만든다 */
export function createBridge(channel: BridgeChannel, options: BridgeOptions = {}): Bridge {
  return new Bridge(channel, options);
}

export { sentLineOf };
