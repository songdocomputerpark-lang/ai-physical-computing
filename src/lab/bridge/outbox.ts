/**
 * 보낼 차례(outbox) — "언제 보내나"를 정하는 곳(PLAN §7.2 규칙 4·5, §7.6 원본 코드용 병합 규칙, P4-01).
 * 시계·타이머를 인자로 받아 단위 테스트가 가짜 시계로 규칙을 하나씩 확인한다(DOM·통로를 모른다).
 *
 * 규칙이 어떻게 들어갔나
 * - §7.2-4 초당 10회: 보내고 나서 100ms(BRIDGE_MIN_INTERVAL_MS)가 지나야 다음이 나간다. **넘친 메시지는 버리지 않고**
 *   차례에서 기다렸다가 병합된다(밀린 상태 메시지는 최신 값 하나로 줄어든다).
 * - §7.2-5 상태는 최신 값 / 이벤트는 보존: 같은 자리(mergeKey)의 상태 메시지는 새 값 하나로 줄고 **차례 맨 뒤로** 간다.
 *   이벤트(mergeKey === null)는 절대 바뀌지 않아 차례대로 한 번씩 나간다.
 * - §7.6-① 한 번에 하나만 쓴다: 앞 보내기가 끝나야(약속이 풀려야) 다음이 나간다.
 * - §7.6-② 머리말·필드 수가 같으면 바꿔 끼운다 / ③ 클릭 표시가 1인 DATA 5필드는 안 바꾼다 / ④ 같은 한 글자 명령은 합친다
 *   → 셋 다 message.ts의 mergeKey 하나로 표현된다.
 * - §7.6-⑤ 콘솔에 `Sent: …`: onSend로 알려 주고, 화면이 sentLineOf로 한 줄을 만든다.
 *
 * 바꿔 끼우는 자리(2026-09-25 Phase 4 검토 반영 — 전에는 "같은 열쇠면 차례 어디에 있든 그 자리에서" 바꿨다)
 * - 값·필드(§7.6-②, `values:`·`fields:`): 옛 값을 빼고 새 값을 **맨 뒤에** 넣는다. 그 자리에서 바꾸면 앞에 기다리던 클릭 이벤트보다
 *   새 좌표가 먼저 나가, 보드가 마지막에 본 좌표가 이벤트의 옛 좌표가 됐다(§7.2-5 "상태는 최신 값" 위반).
 * - 명령 한 글자·그 밖의 글(§7.6-④, `command:`·`other:`): **차례 맨 뒤가 같은 글일 때만** 합친다("직전과 같으면"). 전에는
 *   a·b·a·b를 잇달아 보내면 마지막 b가 앞의 b 자리로 끼어들어 a·b·a만 나가고 레이저가 켜진 채로 끝났다.
 *
 * 바꿔 끼우기는 **차례에 남아 있는 것끼리만** 한다(CODE_MAPPING §6.4 "대기 중 메시지를 최신값으로 병합").
 * 이미 나간 값과 비교해 "안 바뀌었으면 건너뛰기"(§7.2-4 "값이 바뀔 때만")는 skipUnchangedState로 따로 켠다 —
 * 새 예제의 bridge.send()는 켜고, 원본 PC 코드를 그대로 돌릴 때는 꺼 둔다(보낸 것이 조용히 사라지면 원본과 달라 보인다).
 */
import { sameBytes, sentLineOf } from './message.ts';
import { BRIDGE_MAX_QUEUE, BRIDGE_MIN_INTERVAL_MS, bridgeText, bridgeWarning } from './messages.ts';
import type { BridgeMessage, BridgeWarning } from './types.ts';

/** 시계와 타이머. 테스트는 가짜를 넣어 시간을 마음대로 돌린다. */
export interface BridgeScheduler {
  now(): number;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** 진짜 시계(브라우저·Node 공통) */
export const systemScheduler: BridgeScheduler = {
  now: () => Date.now(),
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

/** send()가 어떻게 됐는지 */
export type BridgeSendResult =
  /** 차례에 들어갔다 */
  | 'queued'
  /** 차례에 있던 같은 자리 메시지를 새 값으로 바꿨다(§7.6-②④) */
  | 'merged'
  /** 앞에 보낸 값과 같아서 건너뛰었다(skipUnchangedState, §7.2-4) */
  | 'skipped'
  /** 차례가 가득 차 버렸다 */
  | 'dropped';

export interface BridgeOutboxOptions {
  /** 보내는 사이 최소 간격(밀리초, 기본 100 = 초당 10회) */
  readonly minIntervalMs?: number;
  /** 차례에 쌓아 둘 수 있는 수(기본 64) */
  readonly maxQueue?: number;
  /** 앞서 **보낸** 상태 메시지와 똑같으면 건너뛴다(기본 false) */
  readonly skipUnchangedState?: boolean;
  readonly scheduler?: BridgeScheduler;
  /** 알림(길이 넘침·차례 가득 참)을 화면에 보여 줄 곳 */
  readonly onWarn?: (warning: BridgeWarning) => void;
  /** 한 개가 나갔다(§7.6-⑤ 콘솔 `Sent: …`) */
  readonly onSend?: (message: BridgeMessage, line: string) => void;
  /** 보내다가 통로가 낸 오류 */
  readonly onError?: (error: unknown, message: BridgeMessage) => void;
  /** 같은 자리 메시지가 바뀌어 끼워졌다(화면이 "밀려서 최신 값만 보냈어요"를 보여 줄 때) */
  readonly onMerge?: (next: BridgeMessage, replaced: BridgeMessage) => void;
}

/** 통로에 실제로 쓰는 함수 */
export type BridgeWrite = (message: BridgeMessage) => Promise<void> | void;

/**
 * 보낼 차례 하나. 통로 하나에 outbox 하나를 붙인다.
 *
 *   const outbox = new BridgeOutbox((message) => channel.send(message.bytes));
 *   outbox.send(textMessage('355,152'));   // 상태 — 밀리면 최신 값만
 *   outbox.send(textMessage('DATA,1,2,1,0'));  // 클릭 이벤트 — 반드시 한 번
 */
export class BridgeOutbox {
  private readonly write: BridgeWrite;
  private readonly options: Required<Pick<BridgeOutboxOptions, 'minIntervalMs' | 'maxQueue' | 'skipUnchangedState'>>;
  private readonly scheduler: BridgeScheduler;
  private readonly hooks: Pick<BridgeOutboxOptions, 'onWarn' | 'onSend' | 'onError' | 'onMerge'>;
  private readonly queue: BridgeMessage[] = [];
  private lastSentAt: number | null = null;
  private lastSentByKey = new Map<string, BridgeMessage>();
  private inFlight = false;
  private timer: unknown = null;
  private closed = false;

  constructor(write: BridgeWrite, options: BridgeOutboxOptions = {}) {
    this.write = write;
    this.options = {
      minIntervalMs: options.minIntervalMs ?? BRIDGE_MIN_INTERVAL_MS,
      maxQueue: options.maxQueue ?? BRIDGE_MAX_QUEUE,
      skipUnchangedState: options.skipUnchangedState ?? false,
    };
    this.scheduler = options.scheduler ?? systemScheduler;
    this.hooks = options;
  }

  /** 지금 차례에서 기다리는 메시지(읽기 전용 — 테스트·화면이 본다) */
  get pending(): readonly BridgeMessage[] {
    return this.queue.slice();
  }

  /** 지금 보내는 중인가 */
  get busy(): boolean {
    return this.inFlight;
  }

  /**
   * 메시지를 차례에 넣는다. 규칙에 따라 바로 나가거나, 기다리거나, 같은 자리 메시지를 바꿔 끼운다.
   * 보내기 자체는 기다리지 않는다(원본 코드가 매 프레임 불러도 막히지 않게).
   */
  send(message: BridgeMessage): BridgeSendResult {
    for (const warning of message.warnings) {
      this.hooks.onWarn?.(warning);
    }
    if (this.closed) {
      const warning = bridgeWarning('closed', bridgeText.closed('보낼 차례'));
      this.hooks.onWarn?.(warning);
      return 'dropped';
    }

    // §7.2-4 "값이 바뀔 때만" — 켜 두면 앞서 보낸 같은 자리 상태 메시지와 똑같을 때 건너뛴다.
    if (this.options.skipUnchangedState && message.mergeKey !== null && this.queue.length === 0) {
      const lastSent = this.lastSentByKey.get(message.mergeKey);
      if (lastSent !== undefined && sameBytes(lastSent.bytes, message.bytes)) {
        return 'skipped';
      }
    }

    // §7.6-②③④ 같은 자리(mergeKey) 메시지를 새 값 하나로 줄인다(머리말 설명). 이벤트(null)는 찾지 않는다.
    if (message.mergeKey !== null) {
      if (message.shape === 'command' || message.shape === 'other') {
        // ④ "직전과 같으면 합친다" — 차례 맨 뒤가 같은 글일 때만(a·b·a·b는 네 개 모두 나간다).
        const last = this.queue[this.queue.length - 1];
        if (last !== undefined && last.mergeKey === message.mergeKey) {
          this.queue[this.queue.length - 1] = message;
          this.hooks.onMerge?.(message, last);
          this.pump();
          return 'merged';
        }
      } else {
        // ② 값·필드는 최신 값 하나만 남기되 맨 뒤로 옮긴다 — 앞에 기다리던 클릭 이벤트가 먼저 나가고, 보드가 마지막에 보는 값이 최신 값이다.
        const index = this.queue.findIndex((waiting) => waiting.mergeKey === message.mergeKey);
        if (index >= 0) {
          const replaced = this.queue[index] as BridgeMessage;
          this.queue.splice(index, 1);
          this.queue.push(message);
          this.hooks.onMerge?.(message, replaced);
          this.pump();
          return 'merged';
        }
      }
    }

    this.queue.push(message);
    this.trim();
    this.pump();
    return 'queued';
  }

  /** 차례가 가득 차면 바꿔 끼울 수 있는 상태 메시지부터 버린다(이벤트는 마지막까지 지킨다). */
  private trim(): void {
    if (this.queue.length <= this.options.maxQueue) {
      return;
    }
    let dropped = 0;
    while (this.queue.length > this.options.maxQueue) {
      const index = this.queue.findIndex((waiting) => waiting.mergeKey !== null);
      this.queue.splice(index >= 0 ? index : 0, 1);
      dropped += 1;
    }
    this.hooks.onWarn?.(bridgeWarning('queue-full', bridgeText.queueFull(dropped)));
  }

  /** 보낼 때가 됐으면 한 개를 보내고, 아직이면 그 시각에 다시 오도록 타이머를 건다. */
  private pump(): void {
    if (this.closed || this.inFlight || this.queue.length === 0) {
      return;
    }
    const now = this.scheduler.now();
    const wait = this.lastSentAt === null ? 0 : Math.max(0, this.options.minIntervalMs - (now - this.lastSentAt));
    if (wait > 0) {
      this.arm(wait);
      return;
    }
    const message = this.queue.shift();
    if (message === undefined) {
      return;
    }
    this.lastSentAt = now;
    if (message.mergeKey !== null) {
      this.lastSentByKey.set(message.mergeKey, message);
    }
    this.inFlight = true;
    let result: Promise<void> | void;
    try {
      result = this.write(message);
    } catch (error) {
      this.inFlight = false;
      this.hooks.onError?.(error, message);
      this.pump();
      return;
    }
    if (result instanceof Promise) {
      // §7.6-① 한 번에 하나만: 이 약속이 풀려야 다음이 나간다.
      result.then(
        () => {
          this.inFlight = false;
          this.hooks.onSend?.(message, sentLineOf(message));
          this.pump();
        },
        (error: unknown) => {
          this.inFlight = false;
          this.hooks.onError?.(error, message);
          this.pump();
        },
      );
      return;
    }
    this.inFlight = false;
    this.hooks.onSend?.(message, sentLineOf(message));
    this.pump();
  }

  private arm(ms: number): void {
    if (this.timer !== null) {
      return;
    }
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      this.pump();
    }, ms);
  }

  /**
   * 차례 **맨 뒤**에 있는 메시지를 다른 메시지로 바꾼다(아직 나가지 않았을 때만 참). 바이트 흐름(보드 UART → 컴퓨터)을
   * 이어 붙일 때 쓴다 — 초당 10회로 나가는 동안 온 조각을 앞 조각에 붙여 한 덩어리로 보내 순서도 바이트도 잃지 않는다.
   */
  replaceTail(current: BridgeMessage, next: BridgeMessage): boolean {
    if (this.closed || this.queue.length === 0 || this.queue[this.queue.length - 1] !== current) {
      return false;
    }
    this.queue[this.queue.length - 1] = next;
    this.pump();
    return true;
  }

  /** 차례에 남은 것을 모두 버린다(실행을 멈출 때). 보낸 기록은 남는다. */
  clear(): void {
    this.queue.length = 0;
  }

  /** 더 받지 않는다. 남은 것도 버린다. */
  close(): void {
    this.closed = true;
    this.clear();
    if (this.timer !== null) {
      this.scheduler.clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
