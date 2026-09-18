/**
 * 브릿지 단위 테스트가 쓰는 가짜 시계·가짜 BroadcastChannel(P4-01).
 * 시간 규칙(초당 10회)과 탭 통로를 실제 시간을 기다리지 않고 확인한다.
 */
import type { BridgeScheduler } from '../../../../src/lab/bridge/outbox.ts';
import type { BroadcastChannelLike } from '../../../../src/lab/bridge/channels/tab.ts';
import type { KeyedStorageLike } from '../../../../src/lib/storage.ts';

/** 약속(Promise)이 풀릴 틈을 준다 */
export async function flush(times = 8): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

interface FakeTimer {
  readonly at: number;
  readonly fn: () => void;
}

/** 시간을 마음대로 돌리는 시계 */
export class FakeScheduler implements BridgeScheduler {
  private time = 0;
  private nextId = 1;
  private readonly timers = new Map<number, FakeTimer>();

  now(): number {
    return this.time;
  }

  setTimeout(handler: () => void, ms: number): unknown {
    const id = this.nextId;
    this.nextId += 1;
    this.timers.set(id, { at: this.time + Math.max(0, ms), fn: handler });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }

  /** 지금 걸려 있는 타이머 수 */
  get pendingTimers(): number {
    return this.timers.size;
  }

  /**
   * ms만큼 시간을 보낸다. 그 사이에 새로 걸린 타이머도 때가 되면 돈다.
   * **먼저 약속을 풀어 준다** — 실제 브라우저에서는 보내기 약속이 지금 시각에 풀리면서 다음 타이머를 걸기 때문이다.
   * 이 줄이 없으면 가짜 시계만 먼저 뛰어 "지금 풀린 약속"이 미래 시각에 걸린 것처럼 보인다.
   */
  async advance(ms: number): Promise<void> {
    const target = this.time + ms;
    await flush();
    for (;;) {
      let dueId: number | null = null;
      let due: FakeTimer | null = null;
      for (const [id, timer] of this.timers) {
        if (timer.at <= target && (due === null || timer.at < due.at)) {
          dueId = id;
          due = timer;
        }
      }
      if (dueId === null || due === null) {
        break;
      }
      this.timers.delete(dueId);
      this.time = due.at;
      due.fn();
      await flush();
    }
    this.time = target;
    await flush();
  }
}

/** 같은 이름끼리 이어지는 가짜 BroadcastChannel 묶음(자기 자신에게는 오지 않는다) */
export class FakeBroadcastHub {
  private readonly groups = new Map<string, Set<FakeBroadcastChannel>>();
  /** 오간 값(순서대로) — 검사용 */
  readonly log: Array<{ name: string; data: unknown }> = [];

  create(name: string): BroadcastChannelLike {
    const channel = new FakeBroadcastChannel(this, name);
    const group = this.groups.get(name) ?? new Set<FakeBroadcastChannel>();
    group.add(channel);
    this.groups.set(name, group);
    return channel;
  }

  /** createTabChannel의 factory로 그대로 넘길 수 있는 함수 */
  get factory(): (name: string) => BroadcastChannelLike {
    return (name: string) => this.create(name);
  }

  post(sender: FakeBroadcastChannel, name: string, data: unknown): void {
    this.log.push({ name, data });
    const group = this.groups.get(name);
    if (group === undefined) {
      return;
    }
    for (const member of Array.from(group)) {
      if (member === sender || member.closed) {
        continue;
      }
      // 진짜 BroadcastChannel처럼 값을 복사해 다음 차례에 전한다.
      queueMicrotask(() => {
        member.deliver(clone(data));
      });
    }
  }

  remove(channel: FakeBroadcastChannel, name: string): void {
    this.groups.get(name)?.delete(channel);
  }
}

function clone(data: unknown): unknown {
  if (data === null || typeof data !== 'object') {
    return data;
  }
  const record = data as Record<string, unknown>;
  const copy: Record<string, unknown> = { ...record };
  if (record['bytes'] instanceof Uint8Array) {
    copy['bytes'] = new Uint8Array(record['bytes']);
  }
  return copy;
}

class FakeBroadcastChannel implements BroadcastChannelLike {
  closed = false;
  private readonly listeners = new Set<(event: { data: unknown }) => void>();

  constructor(
    private readonly hub: FakeBroadcastHub,
    private readonly name: string,
  ) {}

  postMessage(data: unknown): void {
    if (this.closed) {
      return;
    }
    this.hub.post(this, this.name, data);
  }

  addEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: { data: unknown }) => void): void {
    this.listeners.delete(listener);
  }

  deliver(data: unknown): void {
    if (this.closed) {
      return;
    }
    for (const listener of Array.from(this.listeners)) {
      listener({ data });
    }
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
    this.hub.remove(this, this.name);
  }
}

/** 값을 기억하는 가짜 저장 공간(localStorage 모양 — src/lib/storage.ts의 KeyedStorageLike) */
export class FakeStorage implements KeyedStorageLike {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/** 글자를 바이트로(테스트에서 자주 쓴다) */
export function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** 바이트를 글자로 */
export function textOf(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}
