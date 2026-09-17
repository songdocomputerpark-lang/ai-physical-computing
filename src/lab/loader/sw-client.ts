/**
 * 화면 쪽에서 서비스 워커를 등록하고 이야기하는 곳(PLAN §5.3 PD-11, §8.2 P2-05).
 *
 * 서비스 워커 파일은 빌드 뒤 scripts/build-sw.mjs가 사이트 뿌리(<base>/sw.js)에 만든다. 개발 서버에는 없으므로
 * 등록이 404로 실패하고, 이 파일은 그것을 "없음"으로 조용히 다룬다(실습실은 그대로 돈다).
 *
 * 규칙
 * - 등록은 실습실 로딩 모듈(src/lab/modules/loading/)에서 한 번만 부른다. 레이아웃은 고치지 않는다.
 *   (사이트 전체 첫 방문부터 셸을 미리 받으려면 BaseLayout에서도 부르면 된다 — .cache/phase2-requests/loading.md 요청 3번)
 * - updateViaCache: 'none' — GitHub Pages가 모든 파일에 max-age=600을 주므로, sw.js만은 늘 새로 확인하게 한다.
 * - 주소에 ?sw=off 를 붙이면 등록을 풀고 캐시를 지운다(비상구). 학생에게 알려 줄 수 있는 유일한 되돌리기 방법이다.
 * - 서비스 워커가 보내는 파일 받기 진행(apc:download)은 onDownload()로 받는다.
 */
import { withBase } from '../../lib/url.ts';
import {
  CONTROLLER_WAIT_MS,
  SW_MESSAGE,
  SW_QUERY_NAME,
  SW_QUERY_OFF,
  SW_QUERY_ON,
  SW_SCRIPT_NAME,
  type CacheStatusMessage,
  type DownloadMessage,
} from './constants.ts';

export type ServiceWorkerState =
  /** 이 브라우저에 서비스 워커가 없다(또는 보안 컨텍스트가 아니다) */
  | 'unsupported'
  /** ?sw=off 로 껐다 */
  | 'off'
  /** 등록하는 중 */
  | 'registering'
  /** 등록은 됐지만 아직 이 페이지를 맡지 않았다(첫 방문) */
  | 'ready'
  /** 이 페이지를 맡았다 — 여기서부터 캐시·예비 경로가 동작한다 */
  | 'controlled'
  /** 등록하지 못했다(개발 서버처럼 파일이 없거나 브라우저가 막음) */
  | 'failed';

export interface ServiceWorkerResult {
  readonly state: ServiceWorkerState;
  readonly registration: ServiceWorkerRegistration | null;
  readonly message: string;
}

/** 서비스 워커 파일의 사이트 안 주소(<base>/sw.js) */
export function serviceWorkerUrl(): string {
  return withBase(SW_SCRIPT_NAME);
}

/** 서비스 워커의 범위(사이트 하위 경로 전체) */
export function serviceWorkerScope(): string {
  return withBase('');
}

function supported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof window !== 'undefined' && window.isSecureContext;
}

/** 주소의 ?sw= 값 */
export function swQuery(search: string): string | null {
  try {
    return new URLSearchParams(search).get(SW_QUERY_NAME);
  } catch {
    return null;
  }
}

/** 이 사이트가 만든 캐시를 모두 지우고 등록을 푼다(?sw=off, 문제 해결용). 지운 캐시 수를 돌려준다. */
export async function unregisterServiceWorker(): Promise<number> {
  let removed = 0;
  if (!supported()) {
    return removed;
  }
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      if (registration.scope.startsWith(new URL(serviceWorkerScope(), location.origin).href)) {
        await registration.unregister();
      }
    }
  } catch {
    // 등록을 못 푸는 브라우저면 캐시만 지운다.
  }
  try {
    if (typeof caches !== 'undefined') {
      for (const name of await caches.keys()) {
        if (name.startsWith('apc-')) {
          await caches.delete(name);
          removed += 1;
        }
      }
    }
  } catch {
    // 저장 공간이 막힌 곳
  }
  return removed;
}

/**
 * 서비스 워커를 등록한다. 실패해도 예외를 던지지 않는다(실습실은 서비스 워커 없이도 그대로 돈다).
 * 이미 맡고 있으면 바로 'controlled', 처음 등록이면 'ready'를 주고 뒤에서 맡기를 기다린다(onControlled).
 */
export async function registerServiceWorker(options: { readonly search?: string } = {}): Promise<ServiceWorkerResult> {
  const search = options.search ?? (typeof location !== 'undefined' ? location.search : '');
  const query = swQuery(search);
  if (query === SW_QUERY_OFF) {
    const removed = await unregisterServiceWorker();
    return { state: 'off', registration: null, message: `이 브라우저에서 오프라인 준비를 껐어요(캐시 ${removed}개 지움). 주소에서 ?sw=off를 빼면 다시 켜져요.` };
  }
  if (!supported()) {
    return { state: 'unsupported', registration: null, message: '이 브라우저에서는 오프라인 준비(서비스 워커)를 쓸 수 없어요. 실습은 그대로 돼요.' };
  }
  try {
    const registration = await navigator.serviceWorker.register(serviceWorkerUrl(), {
      scope: serviceWorkerScope(),
      type: 'classic',
      updateViaCache: 'none',
    });
    if (query === SW_QUERY_ON) {
      await registration.update();
    }
    const controlled = navigator.serviceWorker.controller !== null;
    return {
      state: controlled ? 'controlled' : 'ready',
      registration,
      message: controlled ? '' : '처음 방문이라 다음부터 더 빨라져요.',
    };
  } catch (error) {
    // 브라우저가 주는 실패 사유는 영어 문장이라(예: "A bad HTTP response code (404) was received when fetching the script.")
    // 학생 화면에는 넣지 않는다. 화면에는 loading 모듈의 SW_NOTES.failed(한국어)를 쓰고, 원문은 개발자 콘솔에만 남긴다
    // (시크릿 창·학교 정책·보안 연결 아님처럼 교실에서 실제로 일어나는 실패에서도 영어가 새지 않게 — 2026-09-17 검토 반영).
    console.debug('[apc] 서비스 워커 등록 실패:', error);
    return { state: 'failed', registration: null, message: '' };
  }
}

/**
 * 답을 기다리지 않는 알림을 서비스 워커에 보낸다. 아직 이 페이지를 맡지 않았어도(첫 방문) 등록된 워커에 보낸다.
 * 예: "CDN이 막혔어요"(apc:cdn-down) — 다시 불러온 뒤 15초 멈춤을 기다리지 않고 바로 예비 경로를 쓰게 한다.
 */
export function tellServiceWorker(registration: ServiceWorkerRegistration | null, message: { type: string; [key: string]: unknown }): boolean {
  const target =
    (typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker.controller : null) ??
    registration?.active ??
    registration?.waiting ??
    null;
  if (!target) {
    return false;
  }
  try {
    target.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

/** 서비스 워커가 이 페이지를 맡을 때까지 기다린다(이미 맡았으면 바로 true). 시간이 지나면 false. */
export function waitForController(timeoutMs = CONTROLLER_WAIT_MS): Promise<boolean> {
  if (!supported()) {
    return Promise.resolve(false);
  }
  if (navigator.serviceWorker.controller) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: boolean) => {
      if (done) {
        return;
      }
      done = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      clearTimeout(timer);
      resolve(value);
    };
    const onChange = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
  });
}

/** 서비스 워커가 보내는 파일 받기 진행을 받는다. 해제 함수를 돌려준다. */
export function onDownload(handler: (message: DownloadMessage) => void): () => void {
  if (!supported()) {
    return () => {};
  }
  const listener = (event: MessageEvent) => {
    const data = event.data as { type?: string } | null;
    if (data && data.type === SW_MESSAGE.download) {
      handler(data as unknown as DownloadMessage);
    }
  };
  navigator.serviceWorker.addEventListener('message', listener);
  return () => navigator.serviceWorker.removeEventListener('message', listener);
}

/** 맡고 있는 서비스 워커에 메시지를 보내고 같은(또는 지정한) 이름의 답을 기다린다. 없으면 null. */
export async function askServiceWorker<T>(message: { type: string; [key: string]: unknown }, replyType: string, timeoutMs = 60_000): Promise<T | null> {
  if (!supported() || !navigator.serviceWorker.controller) {
    return null;
  }
  const controller = navigator.serviceWorker.controller;
  return new Promise<T | null>((resolve) => {
    let done = false;
    const finish = (value: T | null) => {
      if (done) {
        return;
      }
      done = true;
      navigator.serviceWorker.removeEventListener('message', listener);
      clearTimeout(timer);
      resolve(value);
    };
    const listener = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data && data.type === replyType) {
        finish(data as unknown as T);
      }
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    navigator.serviceWorker.addEventListener('message', listener);
    try {
      controller.postMessage(message);
    } catch {
      finish(null);
    }
  });
}

export interface PrefetchResult {
  readonly type: string;
  readonly ok: number;
  readonly failed: number;
  readonly bytes: number;
}

/** 이미 받아 둔 파일을 캐시에 넣어 둔다(브라우저 캐시에서 가져오므로 보통 네트워크를 쓰지 않는다). */
export function warmCache(urls: readonly string[], timeoutMs?: number): Promise<PrefetchResult | null> {
  return askServiceWorker<PrefetchResult>({ type: SW_MESSAGE.warm, urls: [...urls] }, SW_MESSAGE.warmDone, timeoutMs);
}

/** 실습 파일을 미리 받아 캐시에 넣는다(교실 PC에서 수업 전에 한 번). */
export function prefetchFiles(urls: readonly string[], timeoutMs?: number): Promise<PrefetchResult | null> {
  return askServiceWorker<PrefetchResult>({ type: SW_MESSAGE.prefetch, urls: [...urls] }, SW_MESSAGE.prefetchDone, timeoutMs);
}

/** 캐시에 무엇이 얼마나 들어 있는지 묻는다. */
export function cacheStatus(timeoutMs = 10_000): Promise<CacheStatusMessage | null> {
  return askServiceWorker<CacheStatusMessage>({ type: SW_MESSAGE.cacheStatus }, SW_MESSAGE.cacheStatus, timeoutMs);
}

/** 받아 둔 실습 파일 캐시를 지운다(scope 'downloads'면 Pyodide·모델만, 'all'이면 사이트 캐시 전부). */
export function clearDownloadCaches(scope: 'downloads' | 'all' = 'downloads', timeoutMs = 20_000): Promise<{ removed: number } | null> {
  return askServiceWorker<{ removed: number }>({ type: SW_MESSAGE.clearCaches, scope }, SW_MESSAGE.cachesCleared, timeoutMs);
}
