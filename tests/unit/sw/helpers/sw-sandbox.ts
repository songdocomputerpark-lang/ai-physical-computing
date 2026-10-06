// 서비스 워커(src/sw/sw.js)를 Node의 vm 안에서 돌리는 시험 도구 — 가짜 시계·손으로 흘리는 fetch·가짜 Cache Storage(판 1.2.0, PROGRESS 미해결 215).
// 빌드와 같은 방법(renderServiceWorker + buildConfig)으로 만든 sw.js 글을 그대로 돌린다. 시계는 sw.js 안의 Date.now·setTimeout만 가짜로 바꾼다
// (vm 문맥의 전역 칸이 내장 Date보다 먼저 읽힌다). 응답은 시험이 머리말·몸통 조각·끝을 원하는 때에 보낸다 — 느린 회선·HTTP/2 한 연결에 차례로
// 실려 오는 파일·진짜 막힘을 시간 그대로 흉내 낸다. tests/unit/loading/sw-page-cache-keys.test.ts의 가짜 Cache Storage와 같은 모양이다.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { buildConfig, renderServiceWorker } from '../../../../scripts/build-sw.mjs';
import { BASE_PATH } from '../../../../src/lib/url.ts';

export const ORIGIN = 'https://example.test';
export const SITE = `${ORIGIN}${BASE_PATH}`;

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..', '..');

type Listener = (event: Record<string, unknown>) => void;
type RequestLike = string | { url: string };

function urlOf(request: RequestLike): string {
  return new URL(typeof request === 'string' ? request : request.url, SITE).href;
}

/** Cache API의 필요한 만큼만(열쇠는 주소 글자 그대로) */
class FakeCache {
  readonly entries = new Map<string, Response>();

  async put(request: RequestLike, response: Response): Promise<void> {
    this.entries.set(urlOf(request), response.clone());
  }

  async match(request: RequestLike): Promise<Response | undefined> {
    return this.entries.get(urlOf(request))?.clone();
  }

  async keys(): Promise<{ url: string }[]> {
    return [...this.entries.keys()].map((url) => ({ url }));
  }

  async delete(request: RequestLike): Promise<boolean> {
    return this.entries.delete(urlOf(request));
  }
}

class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>();

  async open(name: string): Promise<FakeCache> {
    if (!this.caches.has(name)) {
      this.caches.set(name, new FakeCache());
    }
    return this.caches.get(name)!;
  }

  async keys(): Promise<string[]> {
    return [...this.caches.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }
}

/** 가짜 시계: sw.js의 Date.now·setTimeout·clearTimeout. advance(ms)로 시간을 흘린다(그 사이 때가 된 타이머를 차례로 돌림). */
export class FakeClock {
  now = 1_000_000;
  #nextId = 1;
  readonly #timers = new Map<number, { due: number; fn: () => void }>();

  setTimeout = (fn: () => void, ms?: number): number => {
    const id = this.#nextId;
    this.#nextId += 1;
    this.#timers.set(id, { due: this.now + Math.max(0, Number(ms) || 0), fn });
    return id;
  };

  clearTimeout = (id: unknown): void => {
    this.#timers.delete(Number(id));
  };

  /** 아직 남은 타이머 수 */
  get pending(): number {
    return this.#timers.size;
  }

  /** ms만큼 시간을 흘린다. 때가 된 타이머를 시각 차례로 돌리고, 돌릴 때마다 약속(Promise) 일을 모두 끝낸다. */
  async advance(ms: number): Promise<void> {
    const target = this.now + ms;
    await settle();
    for (;;) {
      let nextId: number | null = null;
      let nextDue = Number.POSITIVE_INFINITY;
      for (const [id, timer] of this.#timers) {
        if (timer.due <= target && timer.due < nextDue) {
          nextDue = timer.due;
          nextId = id;
        }
      }
      if (nextId === null) {
        break;
      }
      const timer = this.#timers.get(nextId)!;
      this.#timers.delete(nextId);
      this.now = Math.max(this.now, timer.due);
      timer.fn();
      await settle();
    }
    this.now = target;
    await settle();
  }
}

/** 약속 일(마이크로태스크)과 그 뒤에 이어지는 일을 모두 끝낸다(vm 문맥도 같은 대기열을 쓴다) */
export async function settle(rounds = 8): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** 손으로 흘리는 응답 하나(시험이 머리말·조각·끝을 보낸다). 서비스 워커가 끊으면(abort) aborted가 true. */
export class PendingFetch {
  readonly url: string;
  aborted = false;
  #resolveHeaders: ((response: Response) => void) | null = null;
  #rejectHeaders: ((error: unknown) => void) | null = null;
  #stream: ReadableStreamDefaultController<Uint8Array> | null = null;
  #headersSent = false;
  readonly response: Promise<Response>;

  constructor(url: string, signal: AbortSignal | undefined) {
    this.url = url;
    this.response = new Promise<Response>((resolve, reject) => {
      this.#resolveHeaders = resolve;
      this.#rejectHeaders = reject;
    });
    signal?.addEventListener('abort', () => {
      this.aborted = true;
      const error = new DOMException('The operation was aborted.', 'AbortError');
      if (!this.#headersSent) {
        this.#rejectHeaders?.(error);
      } else {
        try {
          this.#stream?.error(error);
        } catch {
          // 이미 끝난 몸통
        }
      }
    });
  }

  /** 응답 머리말을 보낸다(몸통은 뒤에 조각으로) */
  headers(status = 200, headers: Record<string, string> = { 'content-type': 'application/octet-stream' }): void {
    if (this.#headersSent || this.aborted) {
      return;
    }
    this.#headersSent = true;
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.#stream = controller;
      },
    });
    this.#resolveHeaders?.(new Response(status === 204 ? null : body, { status, headers }));
  }

  /** 몸통 조각 하나(bytes 바이트) */
  chunk(bytes: number): void {
    if (!this.#stream || this.aborted) {
      return;
    }
    this.#stream.enqueue(new Uint8Array(bytes).fill(0x41));
  }

  /** 몸통 끝 */
  end(): void {
    if (!this.#stream || this.aborted) {
      return;
    }
    try {
      this.#stream.close();
    } catch {
      // 이미 끝남
    }
  }

  /** 연결 실패(차단·DNS 실패처럼) */
  fail(): void {
    if (this.#headersSent) {
      this.#stream?.error(new TypeError('network error'));
      return;
    }
    this.#rejectHeaders?.(new TypeError('Failed to fetch'));
  }
}

export interface SwMessage {
  readonly type?: string;
  readonly url?: string;
  readonly state?: string;
  readonly from?: string;
  readonly received?: number;
  readonly total?: number | null;
  readonly reason?: string;
  readonly why?: string;
  readonly downBy?: string;
}

export interface SwSandbox {
  readonly clock: FakeClock;
  /** 서비스 워커가 보낸 fetch 차례대로(응답은 시험이 흘린다) */
  readonly fetches: PendingFetch[];
  /** 서비스 워커가 화면에 알린 메시지 */
  readonly messages: SwMessage[];
  readonly config: Record<string, unknown>;
  /** 페이지(워커)가 보낸 요청 하나를 서비스 워커에 넘긴다 — 서비스 워커가 맡지 않으면 null */
  request(url: string): Promise<Response> | null;
  /** 화면이 보내는 메시지(apc:cdn-down 등) */
  message(data: Record<string, unknown>): Promise<void>;
  /** 이 주소로 간 fetch(가장 최근) */
  fetchOf(url: string): PendingFetch | undefined;
  /** state가 맞는 메시지 */
  messagesOf(state: string): SwMessage[];
}

/**
 * Pyodide 표(크기·SHA-256)를 비운 설정 — 시험 파일은 아무 크기로 흘려도 된다.
 * 환경 변수 APC_SW_SOURCE_FOR_TEST에 다른 sw.js 경로를 주면 그 글로 돈다(고치기 전 판이 이 검사에서 실패하는지 확인할 때 —
 * 예: git show 7775b6a:src/sw/sw.js > .cache/old-sw.js 뒤 APC_SW_SOURCE_FOR_TEST=.cache/old-sw.js npx vitest run tests/unit/sw).
 */
export function startServiceWorker(options: { offline?: boolean } = {}): SwSandbox {
  const sourcePath = process.env.APC_SW_SOURCE_FOR_TEST ? path.resolve(rootDir, process.env.APC_SW_SOURCE_FOR_TEST) : path.join(rootDir, 'src', 'sw', 'sw.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const config = buildConfig([{ url: BASE_PATH, revision: 'test' }], options.offline ? { offline: true } : {}) as unknown as Record<string, unknown> & {
    pyodide: { sizes: Record<string, number>; hashes: Record<string, string>; cdnIndex: string; sitePath: string };
  };
  config.pyodide.sizes = {};
  config.pyodide.hashes = {};
  const code = renderServiceWorker(source, config) as string;
  const clock = new FakeClock();
  const listeners = new Map<string, Listener>();
  const fetches: PendingFetch[] = [];
  const messages: SwMessage[] = [];
  const fakeFetch = (request: RequestLike, init?: { signal?: AbortSignal }) => {
    const pending = new PendingFetch(urlOf(request), init?.signal);
    fetches.push(pending);
    return pending.response;
  };
  const sandbox: Record<string, unknown> = {
    console,
    URL,
    Request,
    Response,
    Headers,
    Blob,
    AbortController,
    DOMException,
    Date: { now: () => clock.now },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    crypto: globalThis.crypto,
    caches: new FakeCacheStorage(),
    fetch: fakeFetch,
    location: { href: `${SITE}sw.js`, origin: ORIGIN },
    clients: {
      claim: async () => undefined,
      matchAll: async () => [{ postMessage: (message: SwMessage) => messages.push(message) }],
    },
    skipWaiting: async () => undefined,
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  sandbox.self = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'sw.js' });

  const dispatch = (type: string, extra: Record<string, unknown>) => {
    const box: { responded: Promise<Response> | null; waits: Promise<unknown>[] } = { responded: null, waits: [] };
    const listener = listeners.get(type);
    if (!listener) {
      throw new Error(`sw.js에 ${type} 처리기가 없어요`);
    }
    listener({
      ...extra,
      waitUntil: (promise: Promise<unknown>) => box.waits.push(promise),
      respondWith: (promise: Promise<Response>) => {
        box.responded = promise;
      },
    });
    return box;
  };

  return {
    clock,
    fetches,
    messages,
    config,
    request(url: string) {
      return dispatch('fetch', { request: { url, method: 'GET', mode: 'cors' } }).responded;
    },
    async message(data: Record<string, unknown>) {
      const box = dispatch('message', { data, source: { postMessage: () => undefined } });
      await Promise.all(box.waits);
      await settle();
    },
    fetchOf(url: string) {
      return [...fetches].reverse().find((pending) => pending.url === url);
    },
    messagesOf(state: string) {
      return messages.filter((message) => message.state === state);
    },
  };
}

/** Pyodide 파일의 CDN 주소·같은 사이트 예비본 주소 */
export function pyodideUrls(sandbox: SwSandbox, name: string): { cdn: string; site: string } {
  const pyodide = (sandbox.config as { pyodide: { cdnIndex: string; sitePath: string } }).pyodide;
  return { cdn: `${pyodide.cdnIndex}${name}`, site: new URL(`${pyodide.sitePath}${name}`, SITE).href };
}
