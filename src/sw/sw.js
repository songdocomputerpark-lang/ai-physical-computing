/* eslint-disable no-restricted-globals */
/**
 * 서비스 워커 원본(PLAN §5.3 PD-11, §5.4, §8.2 P2-05). 빌드 뒤 scripts/build-sw.mjs가 이 파일의 `__APC_SW_CONFIG__` 자리를
 * 설정 JSON으로 바꿔 dist/sw.js로 내보낸다. 이 파일 자체는 번들러를 거치지 않으므로 import 없이 혼자 도는 코드만 쓴다
 * (설정 값은 src/lab/loader/constants.ts·pyodide-files.ts에서 빌드 스크립트가 읽어 넣는다 — 두 곳에 같은 숫자를 적지 않는다).
 *
 * 무엇을 하나
 * 1. 사전 캐시(precache): 공통 레이아웃 셸(홈 페이지가 받는 공통 CSS·JS + 글꼴 CSS + 아이콘)만. 수백 KB 이하(PD-11).
 *    Pyodide·휠·MediaPipe·모델은 넣지 않는다 — 실제로 쓸 때 받아서 캐시한다.
 * 2. Pyodide 파일(jsDelivr 또는 같은 사이트 예비본): 캐시 우선 → 없으면 받는다. 받는 동안 진행률을 화면에 알리고
 *    (apc:download), 15초 동안 새 바이트가 오지 않거나 오류·차단 페이지가 오면 같은 파일의 **다른 위치**로 자동으로 바꾼다
 *    (CDN ↔ 같은 사이트 예비본, PLAN §5.4). 파일 이름 하나 = 캐시 하나라 어느 쪽으로 받았든 다음부터는 캐시에서 준다.
 * 3. 그 밖의 같은 사이트 요청: 해시 이름 자산·글꼴·vendor·models는 캐시 우선, HTML과 검색 색인은 네트워크 우선(새 차시가 빨리 보이게),
 *    그림·고지 파일은 캐시를 먼저 주고 뒤에서 새로 받는다. 다른 사이트 요청은 건드리지 않는다.
 * 4. 화면이 보내는 메시지: 미리 받기(apc:prefetch), 이미 받은 것 캐시에 넣기(apc:warm), 캐시 상태(apc:cache-status),
 *    캐시 지우기(apc:clear-caches).
 *
 * 안전 규칙
 * - GET만 다룬다. 요청을 가로채 실패시키는 일이 없게, 모든 처리기는 마지막에 그냥 fetch로 돌아간다.
 * - 압축 전송(content-encoding)된 응답의 Content-Length는 압축된 크기라 진행률에 쓰지 않는다. 아는 파일은 표의 원본 크기를 쓴다.
 * - 캐시에 다시 넣을 때 content-encoding·content-length 머리말은 지운다(브라우저가 이미 푼 바이트라 그대로 두면 깨진다).
 *
 * 오프라인 배포판(PLAN §5.6, P6-07 — `scripts/build-sw.mjs --offline`이 설정에 `offline: true`를 넣는다. 온라인 사이트 설정에는 이 칸이 없다):
 * - Pyodide 파일은 늘 같은 사이트에서만 받는다(jsDelivr로 바꾸지 않는다 — 인터넷이 없는 교실에서 헛되이 기다리지 않게).
 * - 한 번도 안 열어 본 쪽을 서버 없이 열면 "인터넷 연결이 없어요" 대신 "이 컴퓨터의 작은 서버가 꺼져 있어요"를 보여 준다.
 */

const CONFIG = __APC_SW_CONFIG__;

const BASE = CONFIG.base; // 예: /ai-physical-computing/
const CACHES = CONFIG.caches;
const LIMITS = CONFIG.limits;
const TIMING = CONFIG.timing;
const MESSAGE = CONFIG.messages;
const PYODIDE = CONFIG.pyodide;
/** 오프라인 배포판인지(설정에 offline: true가 있을 때만) */
const OFFLINE = CONFIG.offline === true;
const SIZE_HEADER = 'x-apc-size';
/**
 * 캐시에서 찾을 때의 규칙. GitHub Pages가 Vary: Accept-Encoding을 보내므로, 요청 머리말이 조금 달라도(미리 받기와 실제 방문)
 * 같은 주소면 같은 파일로 본다. 검색어(?)는 그대로 구분한다.
 */
const MATCH_OPTIONS = { ignoreVary: true };

/** 이 판이 쓰는 캐시 이름 모두(활성화할 때 나머지 apc- 캐시는 지운다) */
function currentCacheNames() {
  return [CACHES.precache, CACHES.pages, CACHES.search, CACHES.assets, CACHES.fonts, CACHES.vendor, CACHES.static, PYODIDE.cacheName];
}

// ───────────────────────── 설치·활성화 ─────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHES.precache);
      const cached = await cache.keys();
      const have = new Set(cached.map((request) => new URL(request.url).pathname));
      // 해시 이름 파일(revision null)은 이미 있으면 그대로 두고, 이름이 그대로인 파일(글꼴 CSS 등)은 판이 바뀌었으니 다시 받는다.
      const missing = CONFIG.precache.filter((entry) => entry.revision !== null || !have.has(new URL(entry.url, self.location.href).pathname));
      // 하나가 실패해도 나머지는 넣는다(글꼴·아이콘이 빠져도 사이트는 돈다).
      await Promise.all(
        missing.map(async (entry) => {
          try {
            const request = new Request(entry.url, { cache: 'reload', credentials: 'same-origin' });
            const response = await fetch(request);
            if (response.ok) {
              await cache.put(entry.url, await withSizeHeader(response));
            }
          } catch {
            // 오프라인 설치 — 다음 방문에 다시 시도한다.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set(currentCacheNames());
      for (const name of await caches.keys()) {
        if (name.startsWith(CONFIG.cachePrefix) && !keep.has(name)) {
          await caches.delete(name);
        }
      }
      // 사전 캐시에서 이번 판에 없는 항목을 지운다(옛 해시 이름 파일).
      const precache = await caches.open(CACHES.precache);
      const wanted = new Set(CONFIG.precache.map((entry) => new URL(entry.url, self.location.href).pathname));
      for (const request of await precache.keys()) {
        if (!wanted.has(new URL(request.url).pathname)) {
          await precache.delete(request);
        }
      }
      await self.clients.claim();
    })(),
  );
});

// ───────────────────────── 도우미 ─────────────────────────

/** 캐시에 넣을 응답에 크기 머리말을 붙인다(용량 정리·진행률에 쓴다). 몸통을 읽지 않는 복사본을 만든다. */
async function withSizeHeader(response) {
  const clone = response.clone();
  const buffer = await clone.arrayBuffer();
  const headers = cleanHeaders(response.headers);
  headers.set(SIZE_HEADER, String(buffer.byteLength));
  return new Response(buffer, { status: response.status, statusText: response.statusText, headers });
}

/** 다시 만든 응답에 그대로 두면 안 되는 머리말을 지운다. */
function cleanHeaders(source) {
  const headers = new Headers();
  for (const [name, value] of source.entries()) {
    const lower = name.toLowerCase();
    if (lower === 'content-encoding' || lower === 'content-length') {
      continue;
    }
    headers.set(name, value);
  }
  return headers;
}

function cachedSize(response) {
  const header = response.headers.get(SIZE_HEADER);
  const value = header === null ? Number.NaN : Number(header);
  return Number.isFinite(value) ? value : 0;
}

/** 창(window) 클라이언트 모두에게 알린다. 파이썬 워커가 받은 파일도 화면이 진행률로 볼 수 있게. */
async function broadcast(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    try {
      client.postMessage(message);
    } catch {
      // 닫힌 창
    }
  }
}

function postDownload(url, state, from, received, total) {
  return broadcast({ type: MESSAGE.download, url, state, from, received, total: total ?? null });
}

/** 항목 수로 캐시 정리(오래된 것부터 — Cache API의 keys()는 넣은 순서다) */
async function trimEntries(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let index = 0; index < keys.length - maxEntries; index += 1) {
    await cache.delete(keys[index]);
  }
}

/** 바이트 합으로 캐시 정리(오래된 것부터). keep에 든 주소는 남긴다. */
async function trimBytes(cacheName, maxBytes, keep) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const sizes = [];
  let total = 0;
  for (const request of keys) {
    const response = await cache.match(request, MATCH_OPTIONS);
    const size = response ? cachedSize(response) : 0;
    sizes.push({ request, size });
    total += size;
  }
  for (const entry of sizes) {
    if (total <= maxBytes) {
      break;
    }
    if (keep && keep.has(new URL(entry.request.url).pathname)) {
      continue;
    }
    await cache.delete(entry.request);
    total -= entry.size;
  }
}

/** 파일 대신 온 차단 안내 페이지(HTML)인지 */
function looksLikeBlockPage(response, url) {
  const type = response.headers.get('content-type') || '';
  if (!/text\/html|application\/xhtml/iu.test(type)) {
    return false;
  }
  return !/\.html?$/iu.test(new URL(url, self.location.href).pathname);
}

// ───────────────────────── Pyodide 파일 ─────────────────────────

/** 주소가 Pyodide 파일이면 { from, name }. 검색어(?)가 붙은 주소는 살핌·시험용이라 그대로 보낸다. */
function parsePyodideUrl(url) {
  if (url.includes('?') || url.includes('#')) {
    return null;
  }
  if (url.startsWith(PYODIDE.cdnIndex)) {
    const name = url.slice(PYODIDE.cdnIndex.length);
    return name === '' || name.includes('/') ? null : { from: 'cdn', name };
  }
  const siteIndex = new URL(PYODIDE.sitePath, self.location.href).href;
  if (url.startsWith(siteIndex)) {
    const name = url.slice(siteIndex.length);
    return name === '' || name.includes('/') ? null : { from: 'site', name };
  }
  return null;
}

function pyodideCdnUrl(name) {
  return PYODIDE.cdnIndex + name;
}

function pyodideSiteUrl(name) {
  return new URL(PYODIDE.sitePath + name, self.location.href).href;
}

/** 파일 이름 하나에 캐시 항목 하나(어느 위치로 받았든 같은 파일) */
function pyodideCacheKey(name) {
  return new URL(`${PYODIDE.sitePath}${name}`, self.location.href).href;
}

/** CDN이 방금 막혔다면 한동안 예비 경로부터 쓴다(워커가 살아 있는 동안만 기억한다). */
let cdnDownUntil = 0;

function cdnLooksDown() {
  return Date.now() < cdnDownUntil;
}

/** 받은 조각을 이어 붙여 바이트 한 덩어리로 만든다(해시 계산용). */
function mergeChunks(chunks, total) {
  if (chunks.length === 1) {
    return chunks[0];
  }
  const merged = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    merged.set(chunk, at);
    at += chunk.byteLength;
  }
  return merged;
}

/** SHA-256을 16진수 글자로. 이 환경에 crypto.subtle이 없으면 null. */
async function sha256Hex(bytes) {
  const subtle = self.crypto && self.crypto.subtle;
  if (!subtle || typeof subtle.digest !== 'function') {
    return null;
  }
  try {
    const digest = await subtle.digest('SHA-256', bytes);
    let hex = '';
    for (const byte of new Uint8Array(digest)) {
      hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
  } catch {
    return null;
  }
}

/**
 * 주소 하나를 끝까지 받는다(멈춤 감지 + 진행률 알림). 몸통을 모두 메모리에 모은 뒤 새 응답으로 만든다.
 * 스트리밍을 포기하는 대신, 중간에 멈춰도 다른 위치로 통째로 바꿀 수 있다(PLAN §5.4).
 * 돌려주는 값: { ok: true, response, bytes } 또는 { ok: false, reason: 'stalled'|'error'|'http'|'blocked'|'short'|'hash' }
 *
 * expectedSha256을 주면 받은 바이트 전체의 SHA-256을 대조한다(표에 적힌 Pyodide 파일만). 크기만 보면 "잘렸는지"는 알아도
 * "다른 파일인지"는 모르는데, pyodide.asm.mjs·pyodide.mjs는 워커에서 그대로 실행되는 코드라 한 번 더 확인한다
 * (빌드 스크립트 scripts/fetch-pyodide-fallback.mjs가 쓰는 값과 같은 표 — src/lab/loader/pyodide-files.ts, 2026-09-17).
 */
async function downloadBuffered(url, options) {
  const { expectedTotal, expectedSha256, from, stallMs } = options;
  const controller = new AbortController();
  let stalled = false;
  let timer = null;
  const arm = () => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      stalled = true;
      controller.abort();
    }, stallMs);
  };
  const disarm = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  let received = 0;
  try {
    arm();
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: options.cacheMode || 'default' });
    if (!response.ok) {
      disarm();
      return { ok: false, reason: 'http', status: response.status };
    }
    if (looksLikeBlockPage(response, url)) {
      disarm();
      return { ok: false, reason: 'blocked' };
    }
    // 전체 크기: 표에서 아는 값이 먼저다. 표에 없는 파일(학생이 import한 다른 휠)은 Content-Length를 쓰되,
    // **같은 사이트 응답일 때만** 믿는다. 다른 사이트(jsDelivr) 응답은 content-encoding 머리말이 자바스크립트에 보이지 않고
    // (CORS 안전 목록 밖) Content-Length는 압축된 크기라, 그대로 쓰면 "받은 양"이 전체보다 커진다
    // (2026-09-16 실측: pyodide.asm.wasm 9,598,218바이트가 머리말에는 3,438,516으로 온다 — jsDelivr는 .wasm·.whl도 압축해 보낸다).
    const sameOrigin = url.startsWith(self.location.origin);
    const declared = sameOrigin && !response.headers.get('content-encoding') ? Number(response.headers.get('content-length')) : Number.NaN;
    const total = expectedTotal || (Number.isFinite(declared) && declared > 0 ? declared : null);
    await postDownload(url, 'start', from, 0, total);
    const chunks = [];
    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      let lastPost = 0;
      for (;;) {
        arm();
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        chunks.push(value);
        received += value.byteLength;
        const now = Date.now();
        if (now - lastPost > 200) {
          lastPost = now;
          void postDownload(url, 'progress', from, received, total);
        }
      }
    } else {
      const buffer = new Uint8Array(await response.arrayBuffer());
      chunks.push(buffer);
      received = buffer.byteLength;
    }
    disarm();
    if (expectedTotal && received !== expectedTotal) {
      // 표에서 아는 크기와 다르면 잘린 파일이나 다른 파일이다(차단 장비가 보낸 안내문 등).
      return { ok: false, reason: 'short', received };
    }
    let body = chunks;
    if (expectedSha256) {
      const merged = mergeChunks(chunks, received);
      const actual = await sha256Hex(merged);
      if (actual === null) {
        // crypto.subtle이 없는 환경(보안 연결이 아닌 곳)은 서비스 워커가 아예 등록되지 않는다. 그래도 대조를 건너뛰었음을 남긴다.
        console.debug('[apc-sw] SHA-256을 확인할 수 없는 환경이라 크기만 대조했어요:', url);
      } else if (actual !== expectedSha256) {
        return { ok: false, reason: 'hash', received, sha256: actual };
      }
      body = [merged];
    }
    const blob = new Blob(body);
    const headers = cleanHeaders(response.headers);
    headers.set(SIZE_HEADER, String(received));
    return { ok: true, bytes: received, response: new Response(blob, { status: 200, statusText: 'OK', headers }) };
  } catch (error) {
    disarm();
    return { ok: false, reason: stalled ? 'stalled' : 'error', message: String((error && error.message) || error) };
  }
}

async function handlePyodide(request, info) {
  const cache = await caches.open(PYODIDE.cacheName);
  const key = pyodideCacheKey(info.name);
  const hit = await cache.match(key, MATCH_OPTIONS);
  if (hit) {
    void postDownload(request.url, 'cache', 'cache', cachedSize(hit), cachedSize(hit) || null);
    return hit;
  }
  const expectedTotal = PYODIDE.sizes[info.name] || 0;
  const expectedSha256 = (PYODIDE.hashes && PYODIDE.hashes[info.name]) || '';
  const cdnUrl = pyodideCdnUrl(info.name);
  const siteUrl = pyodideSiteUrl(info.name);
  // 보통은 요청이 온 쪽부터 쓰되, 방금 CDN이 막혔다면 예비 경로부터 쓴다. 오프라인 배포판은 같은 사이트만 쓴다(CDN으로 바꾸지 않는다).
  const first = OFFLINE || info.from === 'site' || cdnLooksDown() ? { url: siteUrl, from: 'site' } : { url: cdnUrl, from: 'cdn' };
  const second = OFFLINE ? null : first.from === 'cdn' ? { url: siteUrl, from: 'site' } : { url: cdnUrl, from: 'cdn' };

  let usedFrom = first.from;
  let outcome = await downloadBuffered(first.url, { expectedTotal, expectedSha256, from: first.from, stallMs: TIMING.stallMs });
  if (!outcome.ok && second) {
    if (first.from === 'cdn') {
      cdnDownUntil = Date.now() + TIMING.cdnDownTtlMs;
    }
    void postDownload(request.url, 'fallback', second.from, 0, expectedTotal || null);
    usedFrom = second.from;
    outcome = await downloadBuffered(second.url, { expectedTotal, expectedSha256, from: second.from, stallMs: TIMING.stallMs });
  }
  if (!outcome.ok) {
    void postDownload(request.url, 'error', first.from, 0, expectedTotal || null);
    // 마지막으로 브라우저에 그냥 맡긴다(우리 판단이 틀렸을 수도 있으니 실패를 확정하지 않는다).
    try {
      return await fetch(request);
    } catch {
      return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
  }
  void postDownload(request.url, 'done', usedFrom, outcome.bytes, outcome.bytes);
  if (expectedTotal === 0 || expectedTotal <= LIMITS.pyodideMaxFileBytes) {
    try {
      await cache.put(key, outcome.response.clone());
      await trimBytes(PYODIDE.cacheName, LIMITS.pyodideCacheBytes, new Set(PYODIDE.keepPaths));
    } catch {
      // 저장 공간 부족 — 캐시 없이 그대로 쓴다.
    }
  }
  return outcome.response;
}

// ───────────────────────── 같은 사이트 규칙 ─────────────────────────

/** 설치할 때 미리 받아 둔 셸(precache)에 있는지. 캐시 우선 규칙이 네트워크로 가기 전에 한 번 더 본다. */
async function precacheMatch(request) {
  const cache = await caches.open(CACHES.precache);
  return cache.match(request, MATCH_OPTIONS);
}

async function cacheFirst(request, cacheName, trim) {
  const cache = await caches.open(cacheName);
  const hit = (await cache.match(request, MATCH_OPTIONS)) ?? (await precacheMatch(request));
  if (hit) {
    return hit;
  }
  const response = await fetch(request);
  if (response.ok) {
    try {
      await cache.put(request, await withSizeHeader(response));
      if (trim) {
        await trim();
      }
    } catch {
      // 저장 공간 부족
    }
  }
  return response;
}

/**
 * 네트워크 우선. 캐시본이 **있을 때만** timeoutMs까지 기다리고 넘으면 캐시본을 준다(느린 망의 첫 방문을 끊지 않게 —
 * 캐시본이 없으면 네트워크를 끝까지 기다린다).
 */
async function networkFirst(request, cacheName, timeoutMs, trim) {
  const cache = await caches.open(cacheName);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        try {
          await cache.put(request, await withSizeHeader(response));
          if (trim) {
            await trim();
          }
        } catch {
          // 저장 공간 부족
        }
      }
      return response;
    })
    .catch(() => null);
  const cached = await cache.match(request, MATCH_OPTIONS);
  if (!cached) {
    const response = await network;
    if (response) {
      return response;
    }
    if (request.mode === 'navigate') {
      // 한 번도 안 열어 본 주소를 오프라인에서 열었을 때: 본 적 있는 홈 → 설치할 때 받아 둔 홈 → 마지막으로 안내 쪽지.
      const home = (await cache.match(BASE, MATCH_OPTIONS)) ?? (await precacheMatch(new Request(new URL(BASE, self.location.href).href)));
      return home || offlinePage();
    }
    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }
  const waited = await Promise.race([network, new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs))]);
  return waited || cached;
}

async function staleWhileRevalidate(request, cacheName, trim) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, MATCH_OPTIONS);
  const update = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        try {
          await cache.put(request, await withSizeHeader(response));
          if (trim) {
            await trim();
          }
        } catch {
          // 저장 공간 부족
        }
      }
      return response;
    })
    .catch(() => null);
  if (hit) {
    return hit;
  }
  const response = await update;
  return response || new Response('', { status: 504, statusText: 'Gateway Timeout' });
}

function offlinePage() {
  // 오프라인 배포판은 인터넷이 아니라 이 컴퓨터의 작은 서버(시작하기.bat가 연 창)에서 쪽을 받는다 — 그 창이 닫힌 경우다.
  const title = OFFLINE ? '이 컴퓨터의 작은 서버가 꺼져 있어요' : '인터넷 연결이 없어요';
  const body = OFFLINE
    ? `<p>이 페이지는 아직 이 컴퓨터에 저장되지 않았어요. 오프라인판 폴더의 <strong>시작하기.bat</strong>를 다시 실행한 뒤 새로고침해 주세요.</p>
<p>서버 창(검은 창)을 닫으면 사이트가 멈춰요. 수업하는 동안에는 창을 닫지 말고 작게 줄여 두세요.</p>`
    : `<p>이 페이지는 아직 이 컴퓨터에 저장되지 않았어요. 인터넷에 연결한 뒤 새로고침해 주세요.</p>
<p>한 번 열어 본 페이지와 실습실은 연결 없이도 열려요.</p>`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title>
<style>body{font-family:system-ui,'Malgun Gothic',sans-serif;margin:0;padding:2rem;line-height:1.7;color:#17191c}
h1{font-size:1.4rem}a{color:#0b5cab}</style></head><body>
<h1>${title}</h1>
${body}
</body></html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

/** 같은 사이트 주소를 어느 규칙으로 다룰지 */
function routeFor(url, request) {
  const path = url.pathname;
  if (!path.startsWith(BASE)) {
    return null;
  }
  const rest = path.slice(BASE.length);
  if (rest.startsWith('_astro/')) {
    return 'assets';
  }
  if (rest.startsWith('fonts/') && /\.(?:woff2?|ttf|otf)$/iu.test(rest)) {
    return 'fonts';
  }
  if (rest.startsWith('vendor/') || rest.startsWith('models/') || rest.startsWith('firmware/')) {
    return 'vendor';
  }
  if (rest.startsWith('pagefind/')) {
    return 'search';
  }
  if (request.mode === 'navigate' || /(?:^|\/)$/u.test(path) || rest.endsWith('.html')) {
    return 'pages';
  }
  return 'static';
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }
  const pyodide = parsePyodideUrl(request.url);
  if (pyodide) {
    event.respondWith(handlePyodide(request, pyodide));
    return;
  }
  if (url.origin !== self.location.origin) {
    return; // 다른 사이트(모델 CDN 등)는 건드리지 않는다.
  }
  const route = routeFor(url, request);
  if (!route) {
    return;
  }
  if (route === 'assets') {
    event.respondWith(cacheFirst(request, CACHES.assets, () => trimEntries(CACHES.assets, LIMITS.assetsMaxEntries)));
    return;
  }
  if (route === 'fonts') {
    event.respondWith(cacheFirst(request, CACHES.fonts));
    return;
  }
  if (route === 'vendor') {
    event.respondWith(cacheFirst(request, CACHES.vendor, () => trimBytes(CACHES.vendor, LIMITS.vendorCacheBytes)));
    return;
  }
  if (route === 'search') {
    event.respondWith(networkFirst(request, CACHES.search, TIMING.pageTimeoutMs, () => trimEntries(CACHES.search, LIMITS.searchMaxEntries)));
    return;
  }
  if (route === 'pages') {
    event.respondWith(networkFirst(request, CACHES.pages, TIMING.pageTimeoutMs, () => trimEntries(CACHES.pages, LIMITS.pagesMaxEntries)));
    return;
  }
  event.respondWith(staleWhileRevalidate(request, CACHES.static, () => trimEntries(CACHES.static, LIMITS.staticMaxEntries)));
});

// ───────────────────────── 화면이 보내는 메시지 ─────────────────────────

/** 주소 목록을 받아 캐시에 넣는다. mode 'warm'이면 브라우저 캐시를 먼저 쓴다(보통 네트워크를 쓰지 않는다). */
async function fillCache(urls, mode) {
  let ok = 0;
  let failed = 0;
  let bytes = 0;
  for (const url of urls) {
    const info = parsePyodideUrl(url);
    try {
      if (info) {
        const cache = await caches.open(PYODIDE.cacheName);
        const key = pyodideCacheKey(info.name);
        const hit = await cache.match(key, MATCH_OPTIONS);
        if (hit) {
          ok += 1;
          bytes += cachedSize(hit);
          continue;
        }
        const expectedTotal = PYODIDE.sizes[info.name] || 0;
        const expectedSha256 = (PYODIDE.hashes && PYODIDE.hashes[info.name]) || '';
        // 오프라인 배포판은 CDN 주소가 와도 같은 사이트 파일을 받는다(인터넷을 두드리지 않는다).
        const from = OFFLINE ? 'site' : info.from;
        const fileUrl = OFFLINE ? pyodideSiteUrl(info.name) : url;
        let outcome = await downloadBuffered(fileUrl, {
          expectedTotal,
          expectedSha256,
          from,
          stallMs: TIMING.stallMs,
          cacheMode: mode === 'warm' ? 'force-cache' : 'default',
        });
        if (!outcome.ok && mode === 'warm') {
          // 브라우저 캐시에 없으면 그냥 받는다.
          outcome = await downloadBuffered(fileUrl, { expectedTotal, expectedSha256, from, stallMs: TIMING.stallMs });
        }
        if (!outcome.ok && !OFFLINE) {
          const twin = info.from === 'cdn' ? pyodideSiteUrl(info.name) : pyodideCdnUrl(info.name);
          outcome = await downloadBuffered(twin, { expectedTotal, expectedSha256, from: info.from === 'cdn' ? 'site' : 'cdn', stallMs: TIMING.stallMs });
        }
        if (outcome.ok) {
          await cache.put(key, outcome.response.clone());
          ok += 1;
          bytes += outcome.bytes;
        } else {
          failed += 1;
        }
        continue;
      }
      const request = new Request(url, { credentials: 'same-origin', cache: mode === 'warm' ? 'force-cache' : 'default' });
      const target = new URL(url, self.location.href);
      const route = target.origin === self.location.origin ? routeFor(target, request) : null;
      const cacheName =
        route === 'vendor'
          ? CACHES.vendor
          : route === 'assets'
            ? CACHES.assets
            : route === 'fonts'
              ? CACHES.fonts
              : route === 'pages'
                ? CACHES.pages
                : route === 'search'
                  ? CACHES.search
                  : CACHES.static;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(cacheName);
        const stored = await withSizeHeader(response);
        bytes += cachedSize(stored);
        await cache.put(request, stored);
        ok += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return { ok, failed, bytes };
}

async function cacheReport() {
  const report = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith(CONFIG.cachePrefix)) {
      continue;
    }
    const cache = await caches.open(name);
    const keys = await cache.keys();
    let bytes = 0;
    for (const request of keys) {
      const response = await cache.match(request, MATCH_OPTIONS);
      if (response) {
        bytes += cachedSize(response);
      }
    }
    report.push({ name, count: keys.length, bytes });
  }
  return report;
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data.type !== 'string') {
    return;
  }
  const reply = (message) => {
    if (event.source && typeof event.source.postMessage === 'function') {
      event.source.postMessage(message);
    } else {
      void broadcast(message);
    }
  };
  if (data.type === MESSAGE.prefetch || data.type === MESSAGE.warm) {
    const mode = data.type === MESSAGE.warm ? 'warm' : 'prefetch';
    const replyType = mode === 'warm' ? MESSAGE.warmDone : MESSAGE.prefetchDone;
    event.waitUntil(
      fillCache(Array.isArray(data.urls) ? data.urls : [], mode).then((result) => {
        reply({ type: replyType, ...result });
      }),
    );
    return;
  }
  if (data.type === MESSAGE.cdnDown) {
    // 화면이 살펴본 결과 CDN이 막혔다 — 한동안 예비 경로부터 쓴다(15초 멈춤을 기다리지 않게).
    cdnDownUntil = Date.now() + TIMING.cdnDownTtlMs;
    return;
  }
  if (data.type === MESSAGE.cacheStatus) {
    event.waitUntil(
      cacheReport().then((caches_) => {
        reply({ type: MESSAGE.cacheStatus, version: CONFIG.buildId, caches: caches_ });
      }),
    );
    return;
  }
  if (data.type === MESSAGE.clearCaches) {
    const scope = data.scope === 'all' ? 'all' : 'downloads';
    event.waitUntil(
      (async () => {
        let removed = 0;
        for (const name of await caches.keys()) {
          if (!name.startsWith(CONFIG.cachePrefix)) {
            continue;
          }
          const isDownload = name === PYODIDE.cacheName || name === CACHES.vendor;
          if (scope === 'all' || isDownload) {
            await caches.delete(name);
            removed += 1;
          }
        }
        reply({ type: MESSAGE.cachesCleared, removed });
      })(),
    );
  }
});
