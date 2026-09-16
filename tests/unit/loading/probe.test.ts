// 주소 살핌(src/lab/loader/probe.ts) 단위 테스트 — P2-05.
// 진짜 네트워크를 쓰지 않는다: fetch와 타이머를 인자로 넣어 "멈춤"까지 흉내 낸다.
import { describe, expect, it } from 'vitest';
import { describeProbe, formatSpeed, looksLikeBlockPage, probeUrl, type ProbeTimers } from '../../../src/lab/loader/probe.ts';

/** 밀리초를 손으로 넘기는 가짜 타이머 */
function fakeTimers(): ProbeTimers & { fire(): void; pending: number } {
  const handlers = new Map<number, () => void>();
  let next = 1;
  let clock = 0;
  return {
    now: () => (clock += 10),
    setTimeout(fn) {
      const id = next++;
      handlers.set(id, fn);
      return id;
    },
    clearTimeout(handle) {
      handlers.delete(handle as number);
    },
    get pending() {
      return handlers.size;
    },
    /** 아직 살아 있는 타이머를 모두 울린다(= stallMs가 지난 것) */
    fire() {
      for (const [id, fn] of [...handlers]) {
        handlers.delete(id);
        fn();
      }
    },
  };
}

function bodyOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return {
    getReader() {
      return {
        read: async () => (index < chunks.length ? { done: false, value: chunks[index++]! } : { done: true, value: undefined }),
      };
    },
  } as unknown as ReadableStream<Uint8Array>;
}

function responseOf(options: { status?: number; type?: string; chunks?: Uint8Array[] }): Response {
  return {
    ok: (options.status ?? 200) < 400,
    status: options.status ?? 200,
    headers: new Headers(options.type ? { 'content-type': options.type } : {}),
    body: options.chunks ? bodyOf(options.chunks) : null,
  } as unknown as Response;
}

describe('probeUrl', () => {
  it('끝까지 받으면 ok와 받은 바이트를 알려 준다', async () => {
    const timers = fakeTimers();
    const outcome = await probeUrl('https://cdn.test/pyodide.mjs', {
      timers,
      fetchImpl: async () => responseOf({ type: 'text/javascript', chunks: [new Uint8Array(1000), new Uint8Array(500)] }),
    });
    expect(outcome.status).toBe('ok');
    expect(outcome.bytes).toBe(1500);
    expect(timers.pending).toBe(0); // 타이머를 남기지 않는다
  });

  it('200이 아니면 http로 본다', async () => {
    const outcome = await probeUrl('https://cdn.test/none.mjs', { timers: fakeTimers(), fetchImpl: async () => responseOf({ status: 404 }) });
    expect(outcome.status).toBe('http');
    expect(outcome.httpStatus).toBe(404);
    expect(describeProbe(outcome)).toContain('404');
  });

  it('파일 대신 HTML이 오면 차단 안내 페이지로 본다', async () => {
    const outcome = await probeUrl('https://cdn.test/pyodide.mjs', {
      timers: fakeTimers(),
      fetchImpl: async () => responseOf({ type: 'text/html; charset=utf-8', chunks: [new Uint8Array(10)] }),
    });
    expect(outcome.status).toBe('blocked-page');
    expect(describeProbe(outcome)).toContain('차단');
  });

  it('데이터가 멈추면(stallMs 지남) stalled로 본다', async () => {
    const timers = fakeTimers();
    const promise = probeUrl('https://cdn.test/pyodide.mjs', {
      timers,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          // 머리말조차 오지 않는 상태: 정지 신호가 오면 거절한다(브라우저와 같은 동작).
          (init?.signal as AbortSignal | undefined)?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    });
    timers.fire();
    const outcome = await promise;
    expect(outcome.status).toBe('stalled');
    expect(describeProbe(outcome)).toContain('막힘');
  });

  it('연결 자체가 실패하면 error로 본다', async () => {
    const outcome = await probeUrl('https://cdn.test/pyodide.mjs', {
      timers: fakeTimers(),
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    expect(outcome.status).toBe('error');
    expect(outcome.message).toContain('Failed to fetch');
    expect(describeProbe(outcome)).toContain('접속하지 못했어요');
  });

  it('HEAD는 몸통을 읽지 않는다', async () => {
    const outcome = await probeUrl('https://site.test/vendor/pyodide/pyodide.mjs', {
      timers: fakeTimers(),
      method: 'HEAD',
      fetchImpl: async (_url, init) => {
        expect((init as RequestInit).method).toBe('HEAD');
        return responseOf({ type: 'text/javascript' });
      },
    });
    expect(outcome.status).toBe('ok');
    expect(outcome.bytes).toBe(0);
  });
});

describe('도우미', () => {
  it('HTML 판정은 .html 주소에는 걸리지 않는다', () => {
    expect(looksLikeBlockPage('text/html', 'https://x.test/a.whl')).toBe(true);
    expect(looksLikeBlockPage('text/html', 'https://x.test/a.html')).toBe(false);
    expect(looksLikeBlockPage('application/wasm', 'https://x.test/a.wasm')).toBe(false);
    expect(looksLikeBlockPage(null, 'https://x.test/a.whl')).toBe(false);
  });

  it('속도를 사람이 읽는 글자로 바꾼다', () => {
    expect(formatSpeed(1024 * 1024, 1000)).toBe('1.0MB/초');
    expect(formatSpeed(512 * 1024, 1000)).toBe('512KB/초');
    expect(formatSpeed(0, 1000)).toBe('');
  });
});
