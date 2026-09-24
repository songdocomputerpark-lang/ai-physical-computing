// 응답 있는 쓰기 직렬 대기열 — src/lab/ble/write-queue.ts (PLAN §8.4 P4-04 "응답 있는 쓰기 직렬 대기열", §7.3 "한 번에 하나씩 쓴다").
// 근거: Chrome 공식 문서가 "블루투스 특성을 동시에 읽고 쓰면 플랫폼에 따라 오류가 날 수 있으니 직접 차례를 만들라"고 적는다.
import { describe, expect, it, vi } from 'vitest';
import { BleConnection, BleQueueFullError, BleWriteCancelledError, BleWriteQueue } from '../../../src/lab/ble/index.ts';
import { createMockBluetooth } from '../../../src/lab/ble/mock/index.ts';

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (error: unknown) => void } {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('BleWriteQueue', () => {
  it('앞의 쓰기가 끝나야 다음이 나간다(한 번에 하나)', async () => {
    const gates = [deferred(), deferred()];
    const started: number[] = [];
    let index = 0;
    const queue = new BleWriteQueue({
      write: async () => {
        const current = index;
        index += 1;
        started.push(current);
        await gates[current]?.promise;
      },
    });
    const first = queue.push(Uint8Array.of(1));
    const second = queue.push(Uint8Array.of(2));
    await Promise.resolve();
    expect(started).toEqual([0]); // 둘째는 아직 시작하지 않았다
    expect(queue.size).toBe(1);
    gates[0]?.resolve();
    await first;
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    gates[1]?.resolve();
    await second;
    expect(queue.size).toBe(0);
    expect(queue.busy).toBe(false);
  });

  it('보낸 차례대로 나간다', async () => {
    const order: number[] = [];
    const queue = new BleWriteQueue({
      write: async (bytes) => {
        await Promise.resolve();
        order.push(bytes[0] ?? -1);
      },
    });
    await Promise.all([queue.push(Uint8Array.of(1)), queue.push(Uint8Array.of(2)), queue.push(Uint8Array.of(3))]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('하나가 실패해도 다음 것은 그대로 나간다', async () => {
    const done: number[] = [];
    const queue = new BleWriteQueue({
      write: async (bytes) => {
        if (bytes[0] === 2) {
          throw new Error('보내기 실패');
        }
        done.push(bytes[0] ?? -1);
      },
    });
    const results = await Promise.allSettled([queue.push(Uint8Array.of(1)), queue.push(Uint8Array.of(2)), queue.push(Uint8Array.of(3))]);
    expect(results.map((item) => item.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(done).toEqual([1, 3]);
  });

  it('차례가 가득 차면 새 값을 거절하고 한국어로 알린다', async () => {
    const gate = deferred();
    const warnings: string[] = [];
    const queue = new BleWriteQueue({
      write: async () => {
        await gate.promise;
      },
      onWarning: (text) => warnings.push(text),
      maxQueue: 2,
    });
    const running = queue.push(Uint8Array.of(0));
    const waiting = [queue.push(Uint8Array.of(1)), queue.push(Uint8Array.of(2))];
    await expect(queue.push(Uint8Array.of(3))).rejects.toBeInstanceOf(BleQueueFullError);
    expect(warnings[0]).toContain('밀려서');
    gate.resolve();
    await running;
    await Promise.allSettled(waiting);
  });

  it('연결이 끊기면 남은 것을 버리고 한국어 오류로 거절한다', async () => {
    const gate = deferred();
    const queue = new BleWriteQueue({
      write: async () => {
        await gate.promise;
      },
    });
    const running = queue.push(Uint8Array.of(0));
    const dropped = queue.push(Uint8Array.of(1));
    const count = queue.cancelAll('연결이 끊겼어요.');
    expect(count).toBe(1);
    await expect(dropped).rejects.toBeInstanceOf(BleWriteCancelledError);
    gate.resolve();
    await running;
  });

  it('닫은 뒤에는 새 값을 받지 않는다', async () => {
    const queue = new BleWriteQueue({ write: async () => undefined });
    queue.close('닫음');
    await expect(queue.push(Uint8Array.of(1))).rejects.toBeInstanceOf(BleWriteCancelledError);
  });
});

describe('연결에서 쓰는 차례', () => {
  it('빠르게 여러 번 보내도 기기에 겹쳐 들어가지 않는다(최대 동시 쓰기 1)', async () => {
    const bluetooth = createMockBluetooth({ devices: [{ name: 'ESP32-07', writeDelayMs: 2 }] });
    const connection = new BleConnection({ bluetooth: bluetooth as unknown as Bluetooth });
    await connection.connect();
    const encoder = new TextEncoder();
    await Promise.all([1, 2, 3, 4, 5].map((value) => connection.write(encoder.encode(`${value}\n`))));
    expect(bluetooth.first.maxConcurrentWrites).toBe(1);
    expect(bluetooth.first.written.map((item) => item[0])).toEqual([49, 50, 51, 52, 53]);
  });

  it('연결이 끊기면 못 보낸 값을 버리고 기록에 남긴다', async () => {
    const bluetooth = createMockBluetooth({ devices: [{ name: 'ESP32-07', writeDelayMs: 5 }] });
    const connection = new BleConnection({ bluetooth: bluetooth as unknown as Bluetooth });
    await connection.connect();
    const encoder = new TextEncoder();
    const sends = [connection.write(encoder.encode('a')), connection.write(encoder.encode('b')), connection.write(encoder.encode('c'))];
    const caught = sends.map((item) => item.catch((error: unknown) => error));
    bluetooth.first.drop();
    const results = await Promise.all(caught);
    expect(results.some((item) => item instanceof BleWriteCancelledError)).toBe(true);
    expect(connection.snapshot.lines.join('\n')).toContain('버렸어요');
  });

  it('쓰기가 실패하면 한국어 풀이가 기록에 남고 오류가 그대로 온다', async () => {
    const bluetooth = createMockBluetooth({ devices: [{ name: 'ESP32-07', writeFails: true }] });
    const connection = new BleConnection({ bluetooth: bluetooth as unknown as Bluetooth });
    await connection.connect();
    const failure = vi.fn();
    await connection.write(new TextEncoder().encode('a')).catch(failure);
    expect(failure).toHaveBeenCalledTimes(1);
    expect(connection.snapshot.lines.join('\n')).toContain('보내지 못했어요');
  });
});
