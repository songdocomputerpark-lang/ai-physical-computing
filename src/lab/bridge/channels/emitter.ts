/**
 * 통로 구현이 함께 쓰는 아주 작은 알림 도우미(P4-01). 통로마다 같은 코드를 쓰지 않으려고 둔다.
 * 듣는 함수 하나가 오류를 내도 나머지는 계속 듣는다(통로가 그 때문에 끊기지 않게).
 */
import type { BridgeChannelEvents } from '../types.ts';

type Listeners = {
  [K in keyof BridgeChannelEvents]: Set<BridgeChannelEvents[K]>;
};

export class BridgeChannelEmitter {
  private readonly listeners: Listeners = { message: new Set(), peers: new Set(), close: new Set() };

  on<K extends keyof BridgeChannelEvents>(event: K, listener: BridgeChannelEvents[K]): () => void {
    const set = this.listeners[event] as Set<BridgeChannelEvents[K]>;
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  emit<K extends keyof BridgeChannelEvents>(event: K, ...args: Parameters<BridgeChannelEvents[K]>): void {
    const set = this.listeners[event] as Set<(...values: Parameters<BridgeChannelEvents[K]>) => void>;
    for (const listener of Array.from(set)) {
      try {
        listener(...args);
      } catch {
        // 듣는 쪽 잘못으로 통로가 멈추지 않게 한다. 오류는 그 쪽에서 다룬다.
      }
    }
  }

  clear(): void {
    this.listeners.message.clear();
    this.listeners.peers.clear();
    this.listeners.close.clear();
  }
}
