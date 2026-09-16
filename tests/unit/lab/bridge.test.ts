// 파이썬 ↔ JS 다리(src/lab/runtime/bridge.ts) 단위 테스트 — 가짜 host(post 모으기, 시계, JSPI 유무)로 검사한다.
import { describe, expect, it } from 'vitest';
import { STOP_SIGNAL, createBridge, type BridgeHost } from '../../../src/lab/runtime/bridge.ts';
import type { FromWorkerMessage } from '../../../src/lab/runtime/protocol.ts';

function makeHost(overrides: Partial<BridgeHost> = {}) {
  const posted: FromWorkerMessage[] = [];
  const clock = { now: 1000 };
  const scheduled: { fn: () => void; ms: number }[] = [];
  const host: BridgeHost = {
    post: (message) => {
      posted.push(message);
    },
    now: () => clock.now,
    canRunSync: () => true,
    schedule: (fn, ms) => {
      scheduled.push({ fn, ms });
    },
    ...overrides,
  };
  return { host, posted, clock, scheduled };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('기다릴 수 있는지·정지 표시', () => {
  it('JSPI가 있고 제한 모드가 아닐 때만 기다릴 수 있다', () => {
    const { host } = makeHost();
    const bridge = createBridge(host);
    expect(bridge.api.canWait()).toBe(true);
    bridge.setLimited(true);
    expect(bridge.api.canWait()).toBe(false);
    expect(bridge.isLimited()).toBe(true);
    bridge.setLimited(false);
    const noJspi = createBridge(makeHost({ canRunSync: () => false }).host);
    expect(noJspi.api.canWait()).toBe(false);
  });

  it('실행 중이 아니면 정지 요청을 무시하고, 실행이 끝나면 정지 표시를 지운다', () => {
    const bridge = createBridge(makeHost().host);
    expect(bridge.requestStop()).toBe(false);
    expect(bridge.api.stopRequested()).toBe(false);
    bridge.beginRun();
    expect(bridge.isRunning()).toBe(true);
    expect(bridge.requestStop()).toBe(true);
    expect(bridge.api.stopRequested()).toBe(true);
    expect(bridge.endRun()).toEqual({ stopped: true });
    expect(bridge.isRunning()).toBe(false);
    expect(bridge.api.stopRequested()).toBe(false);
    bridge.beginRun();
    expect(bridge.endRun()).toEqual({ stopped: false });
  });
});

describe('raceStop(약속과 정지 신호의 경주)', () => {
  it('약속이 먼저 끝나면 그 값을 돌려주고 양보 시각을 갱신한다', async () => {
    const { host, clock } = makeHost();
    const bridge = createBridge(host);
    bridge.beginRun();
    clock.now = 1500;
    expect(bridge.api.msSinceYield()).toBe(500);
    await expect(bridge.api.raceStop(Promise.resolve(42))).resolves.toBe(42);
    expect(bridge.api.msSinceYield()).toBe(0);
    await expect(bridge.api.raceStop(7)).resolves.toBe(7);
  });

  it('기다리는 동안 정지가 오면 즉시 정지 신호로 끝나고, 정지 뒤의 raceStop도 바로 정지 신호다', async () => {
    const bridge = createBridge(makeHost().host);
    bridge.beginRun();
    const never = new Promise<never>(() => {});
    const waiting = bridge.api.raceStop(never);
    let settled = false;
    void waiting.then(() => {
      settled = true;
    });
    await tick();
    expect(settled).toBe(false);
    bridge.requestStop();
    await expect(waiting).resolves.toBe(STOP_SIGNAL);
    expect(bridge.api.isStopSignal(STOP_SIGNAL)).toBe(true);
    expect(bridge.api.isStopSignal({ apcStop: true })).toBe(false);
    await expect(bridge.api.raceStop(never)).resolves.toBe(STOP_SIGNAL);
  });

  it('약속이 실패하면 오류로 전한다(Error가 아니어도 Error로 감싼다)', async () => {
    const bridge = createBridge(makeHost().host);
    bridge.beginRun();
    await expect(bridge.api.raceStop(Promise.reject(new Error('막힘')))).rejects.toThrow('막힘');
    await expect(bridge.api.raceStop(Promise.reject('글자 오류'))).rejects.toThrow('글자 오류');
  });
});

describe('sleep과 양보 시각', () => {
  it('sleep은 host.schedule로 기다리고, 0이나 이상한 값은 0ms 양보다', async () => {
    const { host, scheduled } = makeHost();
    const bridge = createBridge(host);
    const sleeping = bridge.api.sleep(120);
    expect(scheduled.map((item) => item.ms)).toEqual([120]);
    scheduled[0].fn();
    await expect(sleeping).resolves.toBeUndefined();
    void bridge.api.sleep(0);
    void bridge.api.sleep(-5);
    void bridge.api.sleep(Number.NaN);
    expect(scheduled.slice(1).map((item) => item.ms)).toEqual([0, 0, 0]);
  });
});

describe('화면에 부탁하기(request)와 답(reply)', () => {
  it('request는 번호를 붙여 화면에 보내고 resolveRequest로 끝난다', async () => {
    const { host, posted } = makeHost();
    const bridge = createBridge(host);
    bridge.beginRun();
    const answer = bridge.api.request('input', { prompt: '이름: ' });
    expect(posted).toEqual([{ type: 'request', requestId: 1, kind: 'input', payload: { prompt: '이름: ' } }]);
    expect(bridge.pendingRequestCount()).toBe(1);
    expect(bridge.resolveRequest(99, 'x')).toBe(false);
    expect(bridge.resolveRequest(1, '민수')).toBe(true);
    await expect(answer).resolves.toBe('민수');
    expect(bridge.pendingRequestCount()).toBe(0);
    expect(bridge.resolveRequest(1, '두 번')).toBe(false);
  });

  it('rejectRequest는 한국어 설명을 오류로 전하고, 실행이 끝나면 남은 요청을 취소한다', async () => {
    const bridge = createBridge(makeHost().host);
    bridge.beginRun();
    const first = bridge.api.request('camera.read', null);
    expect(bridge.rejectRequest(1, '카메라가 없어요')).toBe(true);
    await expect(first).rejects.toThrow('카메라가 없어요');
    const second = bridge.api.request('input', {});
    bridge.endRun();
    await expect(second).rejects.toThrow('실행이 끝나서');
    expect(bridge.pendingRequestCount()).toBe(0);
  });

  it('요청 번호는 실행이 바뀌어도 계속 늘어난다(늦게 온 답이 새 요청과 섞이지 않게)', () => {
    const { host, posted } = makeHost();
    const bridge = createBridge(host);
    bridge.beginRun();
    void bridge.api.request('a', null).catch(() => undefined);
    bridge.endRun();
    bridge.beginRun();
    void bridge.api.request('b', null).catch(() => undefined);
    expect(posted.map((message) => (message.type === 'request' ? message.requestId : -1))).toEqual([1, 2]);
    bridge.endRun();
  });
});

describe('값 저장소(set·get, push·poll)와 안내', () => {
  it('beginRun은 실행 전에 쌓인 값(push)을 버리고 최신 값(set)은 남긴다', () => {
    const bridge = createBridge({ post: () => undefined, now: () => 0, canRunSync: () => true });
    bridge.setValue('camera.info', { ok: true });
    bridge.pushEvent('hello.clicks', 1);
    bridge.pushEvent('cv2.keys', 113);
    bridge.beginRun();
    expect(bridge.api.poll('hello.clicks')).toEqual([]);
    expect(bridge.api.poll('cv2.keys')).toEqual([]);
    expect(bridge.api.get('camera.info')).toEqual({ ok: true });
    bridge.pushEvent('hello.clicks', 2);
    expect(bridge.api.poll('hello.clicks')).toEqual([2]);
    bridge.endRun();
  });

  it('get은 최신 값, poll은 쌓인 값을 순서대로 꺼내고 비운다', () => {
    const bridge = createBridge(makeHost().host);
    expect(bridge.api.get('threshold')).toBeUndefined();
    bridge.setValue('threshold', 100);
    bridge.setValue('threshold', 120);
    expect(bridge.api.get('threshold')).toBe(120);
    expect(bridge.api.poll('keys')).toEqual([]);
    bridge.pushEvent('keys', 113);
    bridge.pushEvent('keys', 27);
    expect(bridge.api.poll('keys')).toEqual([113, 27]);
    expect(bridge.api.poll('keys')).toEqual([]);
  });

  it('notice는 안내 메시지를 화면에 보낸다(기본 info)', () => {
    const { host, posted } = makeHost();
    const bridge = createBridge(host);
    bridge.api.notice('안녕');
    bridge.api.notice('조심', 'warn');
    expect(posted).toEqual([
      { type: 'notice', level: 'info', text: '안녕' },
      { type: 'notice', level: 'warn', text: '조심' },
    ]);
  });
});
