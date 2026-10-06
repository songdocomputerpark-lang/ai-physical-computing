/**
 * 가려진 탭에서도 제때 도는 시계(미해결 220 — 판 1.1.5 뒤) — `src/lab/bridge/channels/background-clock.ts`.
 *
 * 확인하는 것
 *  1. 워커 시계: 타이머를 워커에 맡기고(set·clear), 워커의 알림(fired)이 오면 주 스레드에서 일을 한다. 걸린 타이머가 없으면 워커를 닫는다.
 *  2. 워커를 못 쓰면(만들다 던짐·나중에 오류) 주 스레드 타이머로 돈다 — 남은 타이머는 남은 시간대로 옮긴다.
 *  3. 전후(가짜 시계): 가려진 탭의 주 스레드 타이머를 1분 맞춤으로 흉내 내면, 옛 시계(주 스레드 setTimeout 사슬)의 보드 끝은
 *     상대 탭 목록에서 빠졌다 들어왔다 하고, 새 시계(워커)의 보드 끝은 3분 내내 목록에 남는다.
 *  4. 탭 통로는 scheduler를 주지 않으면 이 시계를 쓴다 — 워커가 있는 곳에서는 heartbeat가 주 스레드 타이머를 기다리지 않는다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkerScheduler, type ClockWorkerLike } from '../../../src/lab/bridge/channels/background-clock.ts';
import { createTabChannel, type BridgeScheduler } from '../../../src/lab/bridge/index.ts';
import { FakeBroadcastHub, FakeScheduler, flush } from './helpers/fake.ts';

type Listener = (event: { data: unknown; preventDefault?: () => void }) => void;

/**
 * 시계 워커 흉내. 받은 set·clear를 기록하고, `clock`을 주면 그 가짜 시계로 시간을 재 fired를 보낸다(진짜 워커처럼 — 주 스레드 조절과 상관없이).
 * clock이 없으면 검사가 `fire(id)`로 직접 울린다.
 */
class FakeClockWorker implements ClockWorkerLike {
  readonly posted: unknown[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly handles = new Map<number, unknown>();

  constructor(private readonly clock: BridgeScheduler | null = null) {}

  postMessage(data: unknown): void {
    if (this.terminated) {
      return;
    }
    this.posted.push(data);
    const message = data as { set?: number; ms?: number; clear?: number };
    if (this.clock === null) {
      return;
    }
    if (typeof message.set === 'number') {
      const id = message.set;
      this.handles.set(
        id,
        this.clock.setTimeout(() => {
          this.handles.delete(id);
          this.fire(id);
        }, message.ms ?? 0),
      );
    } else if (typeof message.clear === 'number') {
      const handle = this.handles.get(message.clear);
      if (handle !== undefined) {
        this.clock.clearTimeout(handle);
        this.handles.delete(message.clear);
      }
    }
  }

  addEventListener(type: 'message' | 'error', listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  terminate(): void {
    this.terminated = true;
    for (const handle of this.handles.values()) {
      this.clock?.clearTimeout(handle);
    }
    this.handles.clear();
  }

  /** 워커가 "때가 됐어요"를 보낸 것처럼 */
  fire(id: number): void {
    if (this.terminated) {
      return;
    }
    for (const listener of [...(this.listeners.get('message') ?? [])]) {
      listener({ data: { fired: id } });
    }
  }

  /** 워커가 오류로 멈춘 것처럼(스크립트를 못 받음 등) */
  fail(): void {
    for (const listener of [...(this.listeners.get('error') ?? [])]) {
      listener({ data: undefined, preventDefault: () => undefined });
    }
  }

  /** 지금 워커에 걸려 있다고 알려 준 타이머 id(set 뒤 clear·fired 전) */
  get setIds(): number[] {
    return this.posted.filter((data): data is { set: number } => typeof (data as { set?: unknown }).set === 'number').map((data) => data.set);
  }
}

/**
 * 가려진 탭의 주 스레드 타이머 흉내 — 크롬·엣지가 1분 넘게 가려진 탭의 사슬 타이머를 1분에 한 번 깨우듯, 때가 된 타이머를 다음 1분 경계로 미룬다.
 * 시간은 함께 쓰는 가짜 시계(base)를 따른다(두 탭이 같은 시각을 본다).
 */
class HiddenTabClock implements BridgeScheduler {
  constructor(
    private readonly base: FakeScheduler,
    private readonly alignMs = 60_000,
  ) {}

  now(): number {
    return this.base.now();
  }

  setTimeout(handler: () => void, ms: number): unknown {
    const due = this.base.now() + Math.max(0, ms);
    const aligned = Math.ceil(due / this.alignMs) * this.alignMs;
    return this.base.setTimeout(handler, aligned - this.base.now());
  }

  clearTimeout(handle: unknown): void {
    this.base.clearTimeout(handle);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('워커 시계 — 타이머를 워커에 맡긴다', () => {
  it('set을 보내고, fired가 오면 주 스레드에서 일을 한 뒤, 걸린 타이머가 없으면 워커를 닫는다', () => {
    const workers: FakeClockWorker[] = [];
    const clock = createWorkerScheduler({
      createWorker: () => {
        const worker = new FakeClockWorker();
        workers.push(worker);
        return worker;
      },
    });
    expect(clock.mode).toBe('idle');
    const ran: string[] = [];
    const id = clock.setTimeout(() => ran.push('한 번'), 2000);
    expect(clock.mode).toBe('worker');
    expect(clock.pending).toBe(1);
    expect(workers).toHaveLength(1);
    expect(workers[0]?.posted).toEqual([{ set: id, ms: 2000 }]);

    workers[0]?.fire(id as number);
    expect(ran).toEqual(['한 번']);
    expect(clock.pending).toBe(0);
    // 걸린 타이머가 없으니 워커를 닫았다 — 탭 통로를 모두 닫은 화면에 워커가 남지 않게
    expect(workers[0]?.terminated).toBe(true);
    expect(clock.mode).toBe('idle');

    // 다음에 걸면 새 워커를 띄운다
    clock.setTimeout(() => ran.push('두 번'), 10);
    expect(workers).toHaveLength(2);
    expect(clock.mode).toBe('worker');
  });

  it('일 안에서 다음 타이머를 걸면(heartbeat 사슬) 워커를 닫지 않고 그대로 쓴다', () => {
    const workers: FakeClockWorker[] = [];
    const clock = createWorkerScheduler({
      createWorker: () => {
        const worker = new FakeClockWorker();
        workers.push(worker);
        return worker;
      },
    });
    let beats = 0;
    const beat = (): void => {
      beats += 1;
      clock.setTimeout(beat, 2000);
    };
    clock.setTimeout(beat, 2000);
    for (let index = 0; index < 5; index += 1) {
      const ids = workers[0]?.setIds ?? [];
      workers[0]?.fire(ids[ids.length - 1] as number);
    }
    expect(beats).toBe(5);
    expect(workers).toHaveLength(1);
    expect(workers[0]?.terminated).toBe(false);
    expect(clock.pending).toBe(1);
  });

  it('clearTimeout은 워커에 clear를 보내고, 늦게 온 fired는 무시한다', () => {
    const worker = new FakeClockWorker();
    const clock = createWorkerScheduler({ createWorker: () => worker });
    const ran: string[] = [];
    const keep = clock.setTimeout(() => ran.push('남김'), 5000);
    const gone = clock.setTimeout(() => ran.push('지움'), 1000);
    clock.clearTimeout(gone);
    expect(worker.posted).toContainEqual({ clear: gone });
    worker.fire(gone as number);
    expect(ran).toEqual([]);
    expect(clock.pending).toBe(1);
    worker.fire(keep as number);
    expect(ran).toEqual(['남김']);
  });

  it('워커를 만들다 던지면 주 스레드 타이머로 돈다', async () => {
    const fallback = new FakeScheduler();
    const clock = createWorkerScheduler({
      createWorker: () => {
        throw new Error('워커를 막은 브라우저');
      },
      fallback,
    });
    const ran: number[] = [];
    clock.setTimeout(() => ran.push(clock.now()), 2000);
    expect(clock.mode).toBe('fallback');
    await fallback.advance(1999);
    expect(ran).toEqual([]);
    await fallback.advance(1);
    expect(ran).toEqual([2000]);
  });

  it('워커가 나중에 오류로 멈추면 남은 타이머를 남은 시간대로 주 스레드에 옮기고, 그 뒤로는 주 스레드 타이머를 쓴다', async () => {
    const fallback = new FakeScheduler();
    const worker = new FakeClockWorker();
    const clock = createWorkerScheduler({ createWorker: () => worker, fallback });
    const ran: Array<[string, number]> = [];
    clock.setTimeout(() => ran.push(['heartbeat', clock.now()]), 2000);
    await fallback.advance(500);
    worker.fail();
    expect(worker.terminated).toBe(true);
    expect(clock.mode).toBe('fallback');
    await fallback.advance(1499);
    expect(ran).toEqual([]);
    await fallback.advance(1);
    expect(ran).toEqual([['heartbeat', 2000]]);
    clock.setTimeout(() => ran.push(['다음', clock.now()]), 100);
    await fallback.advance(100);
    expect(ran[1]).toEqual(['다음', 2100]);
  });

  it('워커를 줄 수 없는 곳(Node처럼 Worker가 없음)에서는 처음부터 주 스레드 타이머다', () => {
    const clock = createWorkerScheduler({});
    expect(clock.mode).toBe('fallback');
  });
});

/** 보이는 탭(pc)이 0.5초마다 상대 목록을 본 기록에서 보드가 빠진 표본 수·바뀐 횟수를 센다 */
async function watchPeers(clock: FakeScheduler, pc: ReturnType<typeof createTabChannel>, totalMs: number): Promise<{ missing: number; flips: number; samples: number }> {
  let missing = 0;
  let flips = 0;
  let last: boolean | null = null;
  let samples = 0;
  for (let elapsed = 0; elapsed < totalMs; elapsed += 500) {
    await clock.advance(500);
    const seen = pc.peers.includes('board');
    samples += 1;
    if (!seen) {
      missing += 1;
    }
    if (last !== null && last !== seen) {
      flips += 1;
    }
    last = seen;
  }
  return { missing, flips, samples };
}

describe('전후 — 1분 넘게 가려진 보드 탭(가짜 시계, 미해결 220)', () => {
  it('옛 시계(주 스레드 setTimeout 사슬)면 가려진 보드 탭이 상대 목록에서 빠졌다 들어왔다 한다', async () => {
    const clock = new FakeScheduler();
    const hub = new FakeBroadcastHub();
    const pc = createTabChannel({ from: 'pc', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: clock, requirePeer: false });
    // 가려진 탭의 주 스레드 타이머(1분 맞춤) — 판 1.1.5까지의 탭 통로가 쓰던 시계 자리
    const board = createTabChannel({ from: 'board', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: new HiddenTabClock(clock), requirePeer: false });
    await flush();
    expect(pc.peers).toEqual(['board']);

    const seen = await watchPeers(clock, pc, 180_000);
    expect(seen.missing).toBeGreaterThan(seen.samples / 2);
    expect(seen.flips).toBeGreaterThanOrEqual(4);
    board.close();
    pc.close();
  });

  it('새 시계(워커)면 가려진 보드 탭이 3분 내내 상대 목록에 남는다', async () => {
    const clock = new FakeScheduler();
    const hub = new FakeBroadcastHub();
    const pc = createTabChannel({ from: 'pc', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: clock, requirePeer: false });
    // 워커는 주 스레드 조절과 상관없이 제때 알린다(워커 흉내가 맞춤 없는 시계로 잰다). 일은 가려진 탭의 주 스레드가 받은 알림으로 한다.
    const workerClock = createWorkerScheduler({ createWorker: () => new FakeClockWorker(clock), fallback: new HiddenTabClock(clock) });
    const board = createTabChannel({ from: 'board', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: workerClock, requirePeer: false });
    await flush();
    expect(workerClock.mode).toBe('worker');

    const seen = await watchPeers(clock, pc, 180_000);
    expect(seen).toEqual({ missing: 0, flips: 0, samples: 360 });
    board.close();
    // 보드 끝을 닫으면 워커 시계에 걸린 타이머가 없어 워커도 닫힌다
    expect(workerClock.pending).toBe(0);
    expect(workerClock.mode).toBe('idle');
    pc.close();
  });
});

describe('탭 통로의 기본 시계', () => {
  it('scheduler를 주지 않으면 워커 시계를 쓴다 — heartbeat가 주 스레드 타이머를 기다리지 않는다', async () => {
    const workers: Array<{ url: string; options: unknown; worker: FakeClockWorker }> = [];
    class StubWorker extends FakeClockWorker {
      constructor(url: URL | string, options?: unknown) {
        super();
        workers.push({ url: String(url), options, worker: this });
      }
    }
    vi.stubGlobal('Worker', StubWorker);
    vi.resetModules();
    const fresh = await import('../../../src/lab/bridge/index.ts');
    vi.useFakeTimers();
    const hub = new FakeBroadcastHub();
    const board = fresh.createTabChannel({ from: 'board', prefix: 'abcdefghijkm', factory: hub.factory, requirePeer: false });
    expect(workers).toHaveLength(1);
    expect(workers[0]?.url).toMatch(/background-clock\.worker\.ts$/u);
    expect(workers[0]?.options).toMatchObject({ type: 'module' });

    const heres = (): number => hub.log.filter((entry) => (entry.data as { type?: string }).type === 'bridge.here').length;
    // 주 스레드 타이머를 10초 돌려도(가려진 탭에서 주 스레드 타이머가 멈춘 것과 같다) heartbeat는 워커의 알림만 따른다
    await vi.advanceTimersByTimeAsync(10_000);
    expect(heres()).toBe(0);
    const worker = workers[0]?.worker as FakeClockWorker;
    for (let beat = 1; beat <= 3; beat += 1) {
      const ids = worker.setIds;
      worker.fire(ids[ids.length - 1] as number);
      expect(heres()).toBe(beat);
    }
    board.close();
    expect(worker.terminated).toBe(true);
  });

  it('한 문서의 탭 통로들은 워커 하나를 함께 쓰고, 모두 닫으면 워커도 닫힌다', async () => {
    const workers: FakeClockWorker[] = [];
    class StubWorker extends FakeClockWorker {
      constructor() {
        super();
        workers.push(this);
      }
    }
    vi.stubGlobal('Worker', StubWorker);
    vi.resetModules();
    const fresh = await import('../../../src/lab/bridge/index.ts');
    const hub = new FakeBroadcastHub();
    const uart = fresh.createTabChannel({ from: 'board', prefix: 'abcdefghijkm', type: fresh.TAB_UART_DATA_TYPE, factory: hub.factory, requirePeer: false });
    const dash = fresh.createTabChannel({ from: 'dash', prefix: 'npqrstuvwxyz', factory: hub.factory, requirePeer: false });
    expect(workers).toHaveLength(1);
    uart.close();
    expect(workers[0]?.terminated).toBe(false);
    dash.close();
    expect(workers[0]?.terminated).toBe(true);
  });

  it('워커가 없는 곳(Node)에서는 주 스레드 타이머로 heartbeat를 보낸다(판 1.1.5까지와 같다)', async () => {
    vi.resetModules();
    const fresh = await import('../../../src/lab/bridge/index.ts');
    vi.useFakeTimers();
    const hub = new FakeBroadcastHub();
    const board = fresh.createTabChannel({ from: 'board', prefix: 'abcdefghijkm', factory: hub.factory, requirePeer: false });
    const heres = (): number => hub.log.filter((entry) => (entry.data as { type?: string }).type === 'bridge.here').length;
    await vi.advanceTimersByTimeAsync(6_000);
    expect(heres()).toBe(3);
    board.close();
  });
});
