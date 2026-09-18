/**
 * 응답 있는 쓰기(write-with-response)를 **한 번에 하나씩** 내보내는 차례 — PLAN §8.4 P4-04 "응답 있는 쓰기 직렬 대기열",
 * §7.3 "한 번에 하나씩 쓴다". 순수 논리(DOM·navigator 없음)라 단위 테스트가 가짜 쓰기 함수로 그대로 확인한다.
 *
 * 왜 하나씩인가(공식 문서 근거, 2026-09-18 확인):
 *   Chrome 개발자 문서 "Interact with Bluetooth devices on the Web"이 **"Reading and writing to Bluetooth characteristics
 *   in parallel may raise errors depending on the platform. I strongly suggest you manually queue GATT operation requests
 *   when appropriate."**라고 적는다(https://developer.chrome.com/docs/capabilities/bluetooth).
 *   즉 동시에 두 번 쓰면 플랫폼에 따라 오류가 나고, **어떤 조건에서 나는지는 문서에 없다**(PLAN §8.4 예상 위험 "Web Bluetooth
 *   동시 쓰기 오류 조건(미확인)"). 그래서 앞 쓰기의 약속이 끝나야 다음을 보낸다.
 *
 * 브릿지의 보낼 차례(BridgeOutbox, §7.6)와 다른 층이다: 브릿지 차례는 "같은 뜻의 메시지를 최신 값으로 바꿔 끼우고 초당 10회로
 * 내보내는" 규칙이고, 이 차례는 **블루투스 한 줄이 한 번에 하나만 나가게** 하는 마지막 관문이다.
 */

import { bleText } from './text.ts';

/** 차례에 쌓아 둘 수 있는 쓰기 수(넘으면 새 값을 보내지 않고 한국어로 알린다) */
export const BLE_MAX_QUEUE = 32;

export interface BleWriteQueueOptions {
  /** 실제로 한 번 쓰는 함수(보통 characteristic.writeValueWithResponse) */
  readonly write: (bytes: Uint8Array) => Promise<void>;
  /** 차례가 가득 차거나 남은 것을 버릴 때 알린다(학생에게 보이는 한국어 문장) */
  readonly onWarning?: (text: string) => void;
  readonly maxQueue?: number;
}

interface PendingWrite {
  readonly bytes: Uint8Array;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
}

/** 차례가 가득 찼을 때 나는 오류(화면이 code로 가른다) */
export class BleQueueFullError extends Error {
  override readonly name = 'BleQueueFull';
  constructor(message: string) {
    super(message);
  }
}

/** 연결이 끊겨 보내지 못한 채 버려졌을 때 나는 오류 */
export class BleWriteCancelledError extends Error {
  override readonly name = 'BleWriteCancelled';
  constructor(message: string) {
    super(message);
  }
}

export class BleWriteQueue {
  readonly #options: BleWriteQueueOptions;
  readonly #queue: PendingWrite[] = [];
  #busy = false;
  #closed = false;

  constructor(options: BleWriteQueueOptions) {
    this.#options = options;
  }

  /** 아직 보내지 못하고 기다리는 수(보내는 중인 것은 세지 않는다) */
  get size(): number {
    return this.#queue.length;
  }

  /** 지금 하나를 보내는 중인가 */
  get busy(): boolean {
    return this.#busy;
  }

  get maxQueue(): number {
    return this.#options.maxQueue ?? BLE_MAX_QUEUE;
  }

  /**
   * 보낼 것을 차례에 넣는다. 돌려주는 약속은 **실제로 보내진 뒤**에 풀린다(응답 있는 쓰기라 보드가 받았다는 답까지 기다린다).
   * 차례가 가득 차면 BleQueueFullError로 거절한다 — 오래된 것을 버리지 않는 까닭은 블루투스로 나가는 값이
   * 원본 코드가 보낸 바이트 그대로라(§7.2 규칙 8) 어느 것을 버려도 뜻이 달라지기 때문이다. 버릴 것을 고르는 일은
   * 그 위층인 브릿지 차례(BridgeOutbox)가 메시지 뜻을 보고 한다.
   */
  push(bytes: Uint8Array): Promise<void> {
    if (this.#closed) {
      return Promise.reject(new BleWriteCancelledError('블루투스 연결이 닫혀 있어서 보내지 못했어요.'));
    }
    if (this.#queue.length >= this.maxQueue) {
      // 문장은 text.ts 한 곳에서 가져온다(같은 상황에 두 문구가 생기지 않게).
      const error = new BleQueueFullError(bleText.queueFull(this.maxQueue));
      this.#options.onWarning?.(error.message);
      return Promise.reject(error);
    }
    return new Promise<void>((resolve, reject) => {
      this.#queue.push({ bytes, resolve, reject });
      void this.#pump();
    });
  }

  /** 남은 것을 모두 버리고 거절한다(연결이 끊겼을 때). 보내는 중인 것은 그대로 끝난다. */
  cancelAll(reason: string): number {
    const dropped = this.#queue.splice(0, this.#queue.length);
    for (const item of dropped) {
      item.reject(new BleWriteCancelledError(reason));
    }
    return dropped.length;
  }

  /** 다시 쓸 수 없게 닫는다 */
  close(reason: string): number {
    this.#closed = true;
    return this.cancelAll(reason);
  }

  async #pump(): Promise<void> {
    if (this.#busy) {
      return;
    }
    this.#busy = true;
    try {
      for (;;) {
        const next = this.#queue.shift();
        if (next === undefined) {
          return;
        }
        try {
          await this.#options.write(next.bytes);
          next.resolve();
        } catch (error) {
          next.reject(error);
        }
      }
    } finally {
      this.#busy = false;
    }
  }
}
