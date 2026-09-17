// 한 페이지 안에서 보드 포트를 넘겨주는 약속(src/lab/firmware/port-release.ts) — 보드 준비 페이지의 [보드 연결]과 [펌웨어 굽기 시작]이 쓴다(P3-10).
import { describe, expect, it } from 'vitest';
import { onSerialPortReleaseRequest, requestSerialPortRelease, SERIAL_PORT_RELEASE_EVENT } from '../../../src/lab/firmware/port-release.ts';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('requestSerialPortRelease · onSerialPortReleaseRequest', () => {
  it('듣는 곳이 없으면 곧바로 0을 돌려준다(창이 없는 곳도 막지 않음)', async () => {
    const target = new EventTarget();
    const started = Date.now();
    expect(await requestSerialPortRelease('firmware', { target })).toBe(0);
    expect(await requestSerialPortRelease('firmware', { target: null })).toBe(0);
    expect(Date.now() - started).toBeLessThan(200);
  });

  it('포트를 쥔 쪽이 돌려준 닫기 약속이 끝날 때까지 기다리고, 이유(reason)를 넘긴다', async () => {
    const target = new EventTarget();
    const order: string[] = [];
    const reasons: string[] = [];
    const stop = onSerialPortReleaseRequest(async (detail) => {
      reasons.push(detail.reason);
      await sleep(80);
      order.push('closed');
    }, target);
    const count = await requestSerialPortRelease('firmware', { target });
    order.push('opened');
    expect(count).toBe(1);
    expect(order).toEqual(['closed', 'opened']);
    expect(reasons).toEqual(['firmware']);
    stop();
    expect(await requestSerialPortRelease('firmware', { target })).toBe(0);
  });

  it('닫기가 한도보다 오래 걸리면 기다리기를 그만둔다(여는 쪽이 끝없이 멈추지 않게)', async () => {
    const target = new EventTarget();
    onSerialPortReleaseRequest(() => new Promise(() => undefined), target);
    const started = Date.now();
    expect(await requestSerialPortRelease('firmware', { target, timeoutMs: 120 })).toBe(1);
    const waited = Date.now() - started;
    expect(waited).toBeGreaterThanOrEqual(100);
    expect(waited).toBeLessThan(1000);
  });

  it('놓아 주다 오류가 나도(던지거나 거절) 여는 쪽은 계속한다', async () => {
    const target = new EventTarget();
    onSerialPortReleaseRequest(() => {
      throw new Error('닫기 실패');
    }, target);
    onSerialPortReleaseRequest(() => Promise.reject(new Error('닫기 실패')), target);
    expect(await requestSerialPortRelease('firmware', { target })).toBe(1);
  });

  it('약속을 돌려주지 않는 듣는 쪽은 기다리지 않는다', async () => {
    const target = new EventTarget();
    let heard = 0;
    onSerialPortReleaseRequest(() => {
      heard += 1;
    }, target);
    expect(await requestSerialPortRelease('firmware', { target })).toBe(0);
    expect(heard).toBe(1);
  });

  it('모양이 다른 같은 이름의 이벤트는 무시한다', () => {
    const target = new EventTarget();
    let heard = 0;
    onSerialPortReleaseRequest(() => {
      heard += 1;
    }, target);
    target.dispatchEvent(new CustomEvent(SERIAL_PORT_RELEASE_EVENT, { detail: { reason: 'x' } }));
    target.dispatchEvent(new Event(SERIAL_PORT_RELEASE_EVENT));
    expect(heard).toBe(0);
  });
});
