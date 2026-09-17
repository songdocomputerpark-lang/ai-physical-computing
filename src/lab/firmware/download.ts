/**
 * 같은 사이트의 펌웨어 파일을 살피고(HEAD) 받는다(GET, 진행률) — PLAN §8.3 P3-09, PD-02(펌웨어는 사이트에 직접 둔다).
 *
 * - 살피기(probeFirmware): 페이지를 열 때 HEAD 한 번으로 "파일이 있는지"만 본다(1.7MB를 미리 받지 않는다).
 *   404면 "펌웨어 파일 준비 중", 200이면 준비됨. 그 밖(오프라인·차단·HEAD를 받지 않는 서버)은 "모름" — 굽기를 누르면 받아 본다.
 *   서비스 워커(src/sw/sw.js)는 GET만 맡으므로 HEAD는 늘 네트워크로 간다. 오프라인이어도 캐시에 있으면 GET은 된다.
 * - 받기(downloadFirmware): 받은 양을 알리며 끝까지 받는다. 404 → missing, 그 밖 HTTP 오류 → http,
 *   HTML이 오면(학교 인터넷 차단 안내 페이지가 200으로 오는 경우) → blocked, 적힌 크기보다 많이 오면 → too-large로 멈춘다.
 *   크기·SHA-256 대조는 verify.ts가 한다.
 * fetch는 인자로 바꿔 넣을 수 있어 단위 테스트가 가짜 응답으로 검사한다(tests/unit/firmware/download.test.ts).
 */

export type FirmwareFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type FirmwareDownloadErrorKind = 'missing' | 'http' | 'network' | 'blocked' | 'too-large' | 'aborted';

export class FirmwareDownloadError extends Error {
  readonly kind: FirmwareDownloadErrorKind;
  readonly status: number | null;

  constructor(kind: FirmwareDownloadErrorKind, message: string, status: number | null = null, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FirmwareDownloadError';
    this.kind = kind;
    this.status = status;
  }
}

export type FirmwareProbeState = 'available' | 'missing' | 'unknown';

export interface FirmwareProbe {
  readonly state: FirmwareProbeState;
  /** 응답 상태 코드(네트워크 오류면 null) */
  readonly status: number | null;
  /** 서버가 알려 준 크기(Content-Length). 모르면 null */
  readonly size: number | null;
  /** 알려 준 크기가 목록의 크기와 다른지(다르면 받아도 검증에서 멈춘다) */
  readonly sizeMismatch: boolean;
}

export interface DownloadProgress {
  readonly loaded: number;
  readonly total: number;
}

function defaultFetch(): FirmwareFetch {
  return (input, init) => globalThis.fetch(input, init);
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

function contentLength(response: Response): number | null {
  const raw = response.headers.get('content-length');
  if (raw === null || !/^\d+$/u.test(raw.trim())) {
    return null;
  }
  return Number(raw.trim());
}

function looksLikeHtml(response: Response): boolean {
  return /\btext\/html\b/iu.test(response.headers.get('content-type') ?? '');
}

/** HEAD로 파일이 있는지 살핀다(오류를 던지지 않는다) */
export async function probeFirmware(
  url: string,
  expectedSize: number,
  options: { readonly fetchImpl?: FirmwareFetch; readonly signal?: AbortSignal } = {},
): Promise<FirmwareProbe> {
  const fetchImpl = options.fetchImpl ?? defaultFetch();
  try {
    const response = await fetchImpl(url, { method: 'HEAD', cache: 'no-store', ...(options.signal ? { signal: options.signal } : {}) });
    const size = contentLength(response);
    if (response.status === 404 || response.status === 410) {
      return { state: 'missing', status: response.status, size: null, sizeMismatch: false };
    }
    if (response.ok && !looksLikeHtml(response)) {
      return { state: 'available', status: response.status, size, sizeMismatch: size !== null && size !== expectedSize };
    }
    return { state: 'unknown', status: response.status, size, sizeMismatch: false };
  } catch {
    return { state: 'unknown', status: null, size: null, sizeMismatch: false };
  }
}

/** 펌웨어 파일을 끝까지 받는다. 받은 양을 onProgress로 알린다 */
export async function downloadFirmware(
  url: string,
  expectedSize: number,
  options: {
    readonly fetchImpl?: FirmwareFetch;
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: DownloadProgress) => void;
  } = {},
): Promise<Uint8Array> {
  const fetchImpl = options.fetchImpl ?? defaultFetch();
  let response: Response;
  try {
    response = await fetchImpl(url, options.signal ? { signal: options.signal } : {});
  } catch (error) {
    if (isAbort(error)) {
      throw new FirmwareDownloadError('aborted', '펌웨어 파일 받기를 멈췄어요.', null, { cause: error });
    }
    throw new FirmwareDownloadError('network', '펌웨어 파일을 받지 못했어요(인터넷 연결이 끊겼거나 막혔어요).', null, { cause: error });
  }
  if (response.status === 404 || response.status === 410) {
    throw new FirmwareDownloadError('missing', '사이트에 펌웨어 파일이 아직 없어요.', response.status);
  }
  if (!response.ok) {
    throw new FirmwareDownloadError('http', `펌웨어 파일을 받지 못했어요(서버 응답 ${response.status}).`, response.status);
  }
  if (looksLikeHtml(response)) {
    await response.body?.cancel().catch(() => undefined);
    throw new FirmwareDownloadError('blocked', '펌웨어 파일 대신 웹 페이지가 왔어요(학교 인터넷 차단 안내일 수 있어요).', response.status);
  }
  const announced = contentLength(response);
  const total = expectedSize > 0 ? expectedSize : (announced ?? 0);
  const report = (loaded: number) => options.onProgress?.({ loaded, total: Math.max(total, loaded) });
  if (!response.body) {
    const whole = new Uint8Array(await response.arrayBuffer());
    if (expectedSize > 0 && whole.length > expectedSize) {
      throw new FirmwareDownloadError('too-large', `펌웨어 파일이 적힌 크기(${expectedSize}바이트)보다 커요.`, response.status);
    }
    report(whole.length);
    return whole;
  }
  const reader = response.body.getReader();
  let buffer = new Uint8Array(total > 0 ? total : 1 << 20);
  let loaded = 0;
  report(0);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.length === 0) {
        continue;
      }
      if (expectedSize > 0 && loaded + value.length > expectedSize) {
        await reader.cancel().catch(() => undefined);
        throw new FirmwareDownloadError('too-large', `펌웨어 파일이 적힌 크기(${expectedSize}바이트)보다 커요.`, response.status);
      }
      if (loaded + value.length > buffer.length) {
        const grown = new Uint8Array(Math.max(buffer.length * 2, loaded + value.length));
        grown.set(buffer.subarray(0, loaded));
        buffer = grown;
      }
      buffer.set(value, loaded);
      loaded += value.length;
      report(loaded);
    }
  } catch (error) {
    if (error instanceof FirmwareDownloadError) {
      throw error;
    }
    if (isAbort(error) || options.signal?.aborted) {
      throw new FirmwareDownloadError('aborted', '펌웨어 파일 받기를 멈췄어요.', null, { cause: error });
    }
    throw new FirmwareDownloadError('network', '펌웨어 파일을 받는 도중에 연결이 끊겼어요.', null, { cause: error });
  } finally {
    reader.releaseLock();
  }
  return loaded === buffer.length ? buffer : buffer.slice(0, loaded);
}
