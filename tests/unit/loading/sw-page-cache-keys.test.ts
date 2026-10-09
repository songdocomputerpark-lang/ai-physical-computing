// 서비스 워커(src/sw/sw.js)의 쪽(HTML)·사이트 검색 파일 캐시 열쇠 — 2026-09-30 최종 점검 SP-01(+ 같은 때 찾은 연결 없을 때 검색).
// 학생이 친 검색어(/search/?q=…)와 통신 접두어(?bridge=·?prefix=)가 캐시 열쇠에 남아 [이 컴퓨터에서 내 기록 지우기] 뒤에도 공용 PC에 남았다.
// 빌드한 sw.js와 같은 글(renderServiceWorker)을 Node의 vm 안에서 가짜 Cache Storage·fetch로 돌려 실제 동작을 본다.
// 브라우저에서의 확인(서비스 워커를 켠 문맥의 Cache Storage 열쇠)은 tests/e2e/sw-page-keys.spec.ts가 한다.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildConfig, renderServiceWorker } from '../../../scripts/build-sw.mjs';
import { PAGES_CACHE, SEARCH_CACHE, STATIC_CACHE, SW_MESSAGE } from '../../../src/lab/loader/constants.ts';
import { BASE_PATH } from '../../../src/lib/url.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
const ORIGIN = 'https://example.test';
const SITE = `${ORIGIN}${BASE_PATH}`;

type Listener = (event: Record<string, unknown>) => void;
type RequestLike = string | { url: string };

/** Cache API의 필요한 만큼만(열쇠는 주소 글자 그대로 — 검색어도 구분한다, 실제 Cache API와 같게) */
class FakeCache {
  readonly entries = new Map<string, Response>();

  static keyOf(request: RequestLike): string {
    return new URL(typeof request === 'string' ? request : request.url, SITE).href;
  }

  async put(request: RequestLike, response: Response): Promise<void> {
    this.entries.set(FakeCache.keyOf(request), response.clone());
  }

  async match(request: RequestLike): Promise<Response | undefined> {
    return this.entries.get(FakeCache.keyOf(request))?.clone();
  }

  async keys(): Promise<{ url: string }[]> {
    return [...this.entries.keys()].map((url) => ({ url }));
  }

  async delete(request: RequestLike): Promise<boolean> {
    return this.entries.delete(FakeCache.keyOf(request));
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

interface Worker {
  readonly storage: FakeCacheStorage;
  online: boolean;
  /** 받은 요청 주소(서버로 간 것만) */
  readonly fetched: string[];
  navigate(url: string): Promise<Response>;
  /** 쪽 안의 스크립트가 보내는 요청(예: Pagefind 파일) */
  get(url: string): Promise<Response>;
  activate(): Promise<void>;
  message(data: Record<string, unknown>): Promise<Record<string, unknown>>;
  pageKeys(): Promise<string[]>;
  searchKeys(): Promise<string[]>;
}

/** 빌드와 같은 방법으로 만든 sw.js를 가짜 서비스 워커 전역에서 돌린다 */
function startWorker(): Worker {
  const source = fs.readFileSync(path.join(rootDir, 'src', 'sw', 'sw.js'), 'utf8');
  const code = renderServiceWorker(source, buildConfig([{ url: BASE_PATH, revision: 'test' }])) as string;
  const listeners = new Map<string, Listener>();
  const storage = new FakeCacheStorage();
  const fetched: string[] = [];
  const state = { online: true };
  const fakeFetch = async (request: RequestLike) => {
    const url = FakeCache.keyOf(request);
    if (!state.online) {
      throw new TypeError('Failed to fetch');
    }
    fetched.push(url);
    const pathname = new URL(url).pathname;
    return new Response(`<!doctype html><title>${pathname}</title><h1>${pathname}</h1>`, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  };
  const sandbox: Record<string, unknown> = {
    console,
    URL,
    Request,
    Response,
    Headers,
    Blob,
    AbortController,
    setTimeout,
    clearTimeout,
    crypto: globalThis.crypto,
    caches: storage,
    fetch: fakeFetch,
    location: { href: `${SITE}sw.js`, origin: ORIGIN },
    clients: { claim: async () => undefined, matchAll: async () => [] },
    skipWaiting: async () => undefined,
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  sandbox.self = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'sw.js' });

  const dispatch = async (type: string, extra: Record<string, unknown>): Promise<Promise<Response> | null> => {
    const waits: Promise<unknown>[] = [];
    // respondWith는 처리기 안에서 불리므로 값은 이 상자에 담아 꺼낸다
    const box: { responded: Promise<Response> | null } = { responded: null };
    const event = {
      ...extra,
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      respondWith: (promise: Promise<Response>) => {
        box.responded = promise;
      },
    };
    const listener = listeners.get(type);
    if (!listener) {
      throw new Error(`sw.js에 ${type} 처리기가 없어요`);
    }
    listener(event);
    await Promise.all(waits);
    return box.responded;
  };

  return {
    storage,
    fetched,
    get online() {
      return state.online;
    },
    set online(value: boolean) {
      state.online = value;
    },
    async navigate(url: string) {
      // 탐색 요청: Request 생성자로는 mode 'navigate'를 만들 수 없어(명세) 필요한 칸만 가진 물건을 넘긴다.
      const responded = await dispatch('fetch', { request: { url, method: 'GET', mode: 'navigate' } });
      if (responded === null) {
        throw new Error(`${url}을 서비스 워커가 맡지 않았어요`);
      }
      return responded;
    },
    async get(url: string) {
      const responded = await dispatch('fetch', { request: { url, method: 'GET', mode: 'cors' } });
      if (responded === null) {
        throw new Error(`${url}을 서비스 워커가 맡지 않았어요`);
      }
      return responded;
    },
    async activate() {
      await dispatch('activate', {});
    },
    async message(data: Record<string, unknown>) {
      let reply: Record<string, unknown> = {};
      await dispatch('message', {
        data,
        source: {
          postMessage: (message: Record<string, unknown>) => {
            reply = message;
          },
        },
      });
      return reply;
    },
    async pageKeys() {
      const cache = await storage.open(PAGES_CACHE);
      return (await cache.keys()).map((request) => request.url);
    },
    async searchKeys() {
      const cache = await storage.open(SEARCH_CACHE);
      return (await cache.keys()).map((request) => request.url);
    },
  };
}

describe('서비스 워커 — 쪽 캐시 열쇠에 검색어를 남기지 않는다(SP-01)', () => {
  it('검색어·통신 접두어가 붙은 주소로 열어도 쪽 캐시 열쇠는 검색어를 뗀 주소다', async () => {
    const worker = startWorker();
    const search = await worker.navigate(`${SITE}search/?q=${encodeURIComponent('우리반비밀검색어')}`);
    expect(await search.text()).toContain(`${BASE_PATH}search/`);
    await worker.navigate(`${SITE}labs/esp32/?bridge=ABCDEFGHJKMN`);
    await worker.navigate(`${SITE}labs/iot/dashboard/?prefix=PQRSTUVWXYZ2&device=esp32-01`);
    const keys = await worker.pageKeys();
    expect(keys.sort()).toEqual([`${SITE}labs/esp32/`, `${SITE}labs/iot/dashboard/`, `${SITE}search/`]);
    for (const key of keys) {
      expect(key).not.toContain('?');
    }
    // 서버에는 원래 주소(검색어 포함) 그대로 요청한다 — 쪽 스크립트가 읽는 값이라 바꾸지 않는다
    expect(worker.fetched).toContain(`${SITE}labs/esp32/?bridge=ABCDEFGHJKMN`);
  });

  it('연결이 없을 때 검색어만 다른 주소로 열어도 저장해 둔 쪽을 준다(안내 쪽이 아니라)', async () => {
    const worker = startWorker();
    await worker.navigate(`${SITE}labs/vision/`);
    worker.online = false;
    const offline = await worker.navigate(`${SITE}labs/vision/?example=${encodeURIComponent('vision/first-edge.py')}&embed=1`);
    const html = await offline.text();
    expect(html).toContain(`<h1>${BASE_PATH}labs/vision/</h1>`);
    expect(html).not.toContain('data-apc-offline-page');
    // 한 번도 안 연 쪽은 그대로 안내 쪽
    const unknown = await worker.navigate(`${SITE}learn/u3/?x=1`);
    const unknownHtml = await unknown.text();
    expect(unknownHtml).toContain('data-apc-offline-page');
    // 판 1.3.0(검토 R1-094): 안내문은 "한 번 열어 본 페이지"만 열린다고 말한다 — 열어 본 적 없는 실습실까지 열린다고 하지 않는다
    expect(unknownHtml).toContain('한 번 열어 본 페이지</strong>뿐');
    expect(unknownHtml).not.toContain('실습실은 연결 없이도 열려요');
  });

  it('활성화할 때 옛 판이 쪽 캐시에 검색어째 넣은 열쇠를 검색어 없는 열쇠로 옮기고 지운다(다른 캐시는 그대로)', async () => {
    const worker = startWorker();
    const pages = await worker.storage.open(PAGES_CACHE);
    await pages.put(`${SITE}search/?q=old-secret`, new Response('search page'));
    await pages.put(`${SITE}labs/esp32/?bridge=OLDPREFIX234`, new Response('old esp32 page'));
    await pages.put(`${SITE}labs/esp32/`, new Response('newer esp32 page'));
    await pages.put(`${SITE}learn/`, new Response('keep'));
    const other = await worker.storage.open(STATIC_CACHE);
    await other.put(`${SITE}images/site/flow.svg?v=1`, new Response('keep'));
    await worker.activate();
    expect((await worker.pageKeys()).sort()).toEqual([`${SITE}labs/esp32/`, `${SITE}learn/`, `${SITE}search/`]);
    // 검색어로만 열어 본 쪽은 옮겨져 연결 없이도 열리고, 검색어 없는 열쇠가 이미 있으면 그쪽을 남긴다
    expect(await (await pages.match(`${SITE}search/`))!.text()).toBe('search page');
    expect(await (await pages.match(`${SITE}labs/esp32/`))!.text()).toBe('newer esp32 page');
    expect((await other.keys()).map((request) => request.url)).toEqual([`${SITE}images/site/flow.svg?v=1`]);
  });

  it('미리 받기(apc:prefetch)로 넣는 쪽도 같은 열쇠(검색어를 뗀 주소)로 넣는다', async () => {
    const worker = startWorker();
    const reply = await worker.message({ type: SW_MESSAGE.prefetch, urls: [`${SITE}labs/unit4/?pair=4-2-1`] });
    expect(reply).toMatchObject({ type: SW_MESSAGE.prefetchDone, ok: 1, failed: 0 });
    expect(await worker.pageKeys()).toEqual([`${SITE}labs/unit4/`]);
  });
});

describe('서비스 워커 — 사이트 검색 파일(Pagefind)도 검색어를 뗀 열쇠로(연결이 없을 때 검색)', () => {
  // Pagefind는 pagefind-entry.json에 ?ts=<지금 시각>을 붙여 받는다(pagefind.js loadEntry). 방문마다 열쇠가 달라 연결이 없으면
  // 한 번 해 본 검색도 "검색을 불러오지 못했어요"로 끝났다(2026-09-30 최종 점검 중 Edge로 확인).
  const entry = `${SITE}pagefind/pagefind-entry.json`;

  it('방문마다 붙는 ?ts=는 열쇠에 남지 않고(하나만 쌓임), 연결이 없을 때 다른 ?ts=로 물어도 저장해 둔 파일을 준다', async () => {
    const worker = startWorker();
    await worker.get(`${entry}?ts=1790743735992`);
    await worker.get(`${entry}?ts=1790743799999`);
    expect(await worker.searchKeys()).toEqual([entry]);
    // 서버에는 원래 주소 그대로 요청한다(HTTP 캐시를 피하는 Pagefind 동작은 그대로)
    expect(worker.fetched).toContain(`${entry}?ts=1790743799999`);
    worker.online = false;
    const offline = await worker.get(`${entry}?ts=1790744000000`);
    expect(offline.status).toBe(200);
  });

  it('활성화할 때 옛 판이 쌓아 둔 ?ts= 열쇠를 지운다(검색 조각 파일은 그대로)', async () => {
    const worker = startWorker();
    const search = await worker.storage.open(SEARCH_CACHE);
    await search.put(`${entry}?ts=1`, new Response('{}'));
    await search.put(`${entry}?ts=2`, new Response('{}'));
    await search.put(`${SITE}pagefind/fragment/ko_e3b2364.pf_fragment`, new Response('fragment'));
    await worker.activate();
    expect(await worker.searchKeys()).toEqual([`${SITE}pagefind/fragment/ko_e3b2364.pf_fragment`]);
  });
});
