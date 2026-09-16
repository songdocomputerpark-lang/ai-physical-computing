/**
 * 주소 하나를 실제로 받아 보며 "살아 있는지"를 재는 살핌(probe) — PLAN §5.4 "받은 양이 15초 동안 늘지 않으면"의 화면 쪽 구현.
 *
 * 쓰는 곳
 * - 로딩 모듈(src/lab/modules/loading/): 서비스 워커가 아직 페이지를 맡지 않은 첫 방문에 워커의 Pyodide 받기와 나란히
 *   같은 CDN의 작은 파일(pyodide.mjs 18KB)을 받아 본다. 워커의 받기 진행은 화면이 볼 수 없으므로 이것이 CDN 멈춤의 대리 지표다.
 * - 네트워크 시험 부품(src/components/start/network-check/): [시험하기]를 눌렀을 때만 jsDelivr·같은 사이트 예비본에 접속한다.
 *
 * 판정
 * - ok: 응답이 200이고 본문을 끝까지 받았다(걸린 시간·바이트·속도).
 * - stalled: 머리말(헤더)이나 다음 바이트가 stallMs 동안 오지 않았다(연결은 되지만 데이터가 멈춤 — 느린 망이 아니라 막힘으로 본다).
 * - error: 연결 자체가 실패했다(차단·DNS·오프라인 — 브라우저는 자세한 까닭을 알려 주지 않는다).
 * - http: 200이 아닌 상태 코드(404·403·5xx).
 * - blocked-page: 200인데 HTML이 왔다(학교 차단 안내 페이지가 파일 대신 온 경우).
 *
 * fetch·타이머를 인자로 받아 단위 테스트가 가짜 응답으로 검사한다(tests/unit/loading/probe.test.ts).
 */
import { PYODIDE_STALL_MS } from './constants.ts';

export type ProbeStatus = 'ok' | 'stalled' | 'error' | 'http' | 'blocked-page';

export interface ProbeOutcome {
  readonly status: ProbeStatus;
  readonly url: string;
  /** 시작부터 끝(또는 실패)까지 밀리초 */
  readonly ms: number;
  /** 받은 바이트(압축을 푼 뒤) */
  readonly bytes: number;
  readonly httpStatus?: number;
  readonly contentType?: string;
  readonly message?: string;
}

export interface ProbeTimers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ProbeOptions {
  /** 기본 globalThis.fetch */
  readonly fetchImpl?: typeof fetch;
  readonly timers?: ProbeTimers;
  /** 머리말·다음 바이트를 기다리는 최대 시간(기본 PYODIDE_STALL_MS) */
  readonly stallMs?: number;
  /** GET(기본) 또는 HEAD(같은 사이트 파일이 있는지만 볼 때) */
  readonly method?: 'GET' | 'HEAD';
  /** 브라우저 캐시를 쓰지 않는다(기본 true — 실제 망을 재려고) */
  readonly noStore?: boolean;
}

const DEFAULT_TIMERS: ProbeTimers = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** 파일 대신 온 HTML(차단 안내 페이지)인지 */
export function looksLikeBlockPage(contentType: string | null | undefined, url: string): boolean {
  if (!contentType) {
    return false;
  }
  const isHtml = /text\/html|application\/xhtml/iu.test(contentType);
  const wantsHtml = /\.html?$/iu.test(new URL(url, 'http://x').pathname);
  return isHtml && !wantsHtml;
}

/** 초당 바이트를 사람이 읽는 글자로(0.4MB/초, 380KB/초) */
export function formatSpeed(bytes: number, ms: number): string {
  if (ms <= 0 || bytes <= 0) {
    return '';
  }
  const perSecond = (bytes / ms) * 1000;
  if (perSecond >= 1024 * 1024) {
    return `${(perSecond / (1024 * 1024)).toFixed(1)}MB/초`;
  }
  return `${Math.round(perSecond / 1024)}KB/초`;
}

/**
 * 주소를 받아 보고 판정한다. 절대 예외를 내지 않는다(모든 실패는 ProbeOutcome).
 * 머리말이 stallMs 안에 오지 않거나, 본문을 읽는 동안 stallMs 동안 새 바이트가 없으면 요청을 끊고 stalled로 본다.
 */
export async function probeUrl(url: string, options: ProbeOptions = {}): Promise<ProbeOutcome> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timers = options.timers ?? DEFAULT_TIMERS;
  const stallMs = options.stallMs ?? PYODIDE_STALL_MS;
  const method = options.method ?? 'GET';
  const started = timers.now();
  const elapsed = () => Math.max(0, Math.round(timers.now() - started));

  const controller = new AbortController();
  let stalled = false;
  let timer: unknown = null;
  const arm = () => {
    if (timer !== null) {
      timers.clearTimeout(timer);
    }
    timer = timers.setTimeout(() => {
      stalled = true;
      controller.abort();
    }, stallMs);
  };
  const disarm = () => {
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
  };

  let bytes = 0;
  try {
    arm();
    const response = await fetchImpl(url, {
      method,
      signal: controller.signal,
      ...(options.noStore === false ? {} : { cache: 'no-store' as RequestCache }),
    });
    const contentType = response.headers.get('content-type') ?? undefined;
    if (!response.ok) {
      disarm();
      return { status: 'http', url, ms: elapsed(), bytes: 0, httpStatus: response.status, ...(contentType ? { contentType } : {}) };
    }
    if (looksLikeBlockPage(contentType, url)) {
      disarm();
      controller.abort();
      return { status: 'blocked-page', url, ms: elapsed(), bytes: 0, httpStatus: response.status, contentType: contentType ?? '' };
    }
    if (method === 'HEAD' || !response.body) {
      disarm();
      return { status: 'ok', url, ms: elapsed(), bytes: 0, httpStatus: response.status, ...(contentType ? { contentType } : {}) };
    }
    const reader = response.body.getReader();
    for (;;) {
      arm();
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      bytes += value.byteLength;
    }
    disarm();
    return { status: 'ok', url, ms: elapsed(), bytes, httpStatus: response.status, ...(contentType ? { contentType } : {}) };
  } catch (error) {
    disarm();
    if (stalled) {
      return { status: 'stalled', url, ms: elapsed(), bytes };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'error', url, ms: elapsed(), bytes, message };
  }
}

/** 살핌 결과를 한 문장으로(네트워크 시험·콘솔 안내용) */
export function describeProbe(outcome: ProbeOutcome): string {
  const seconds = (outcome.ms / 1000).toFixed(1);
  switch (outcome.status) {
    case 'ok': {
      const speed = formatSpeed(outcome.bytes, outcome.ms);
      return `접속됐어요(${seconds}초${outcome.bytes > 0 ? `, ${Math.round(outcome.bytes / 1024)}KB${speed ? ` · ${speed}` : ''}` : ''}).`;
    }
    case 'stalled':
      return `연결은 됐지만 ${Math.round((outcome.ms || 0) / 1000)}초 동안 데이터가 오지 않았어요(막힘으로 봐요).`;
    case 'error':
      return '접속하지 못했어요(차단·오프라인·주소 확인 실패 가운데 하나예요. 브라우저는 자세한 까닭을 알려 주지 않아요).';
    case 'http':
      return outcome.httpStatus === 404 ? '주소에 파일이 없어요(404).' : `서버가 ${outcome.httpStatus ?? '?'} 응답을 보냈어요.`;
    case 'blocked-page':
      return '파일 대신 웹 페이지(HTML)가 왔어요. 학교 네트워크의 차단 안내 페이지일 수 있어요.';
    default:
      return '';
  }
}
