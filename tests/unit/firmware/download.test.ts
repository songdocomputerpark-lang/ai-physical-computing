// 펌웨어 파일 살피기(HEAD)·받기(GET, 진행률) — src/lab/firmware/download.ts. 가짜 fetch로 404·차단 페이지·잘림·크기 초과를 본다.
import { describe, expect, it } from 'vitest';
import { downloadFirmware, FirmwareDownloadError, probeFirmware, type FirmwareFetch } from '../../../src/lab/firmware/download.ts';

const URL = '/ai-physical-computing/firmware/v1.29.0/ESP32_GENERIC-20260824-v1.29.0.bin';

function chunked(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + size));
      offset += size;
    },
  });
}

function fakeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): { fetchImpl: FirmwareFetch; calls: { url: string; init?: RequestInit }[] } {
  const calls: { url: string; init?: RequestInit }[] = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, ...(init ? { init } : {}) });
      return handler(url, init);
    },
  };
}

async function caught(promise: Promise<unknown>): Promise<FirmwareDownloadError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(FirmwareDownloadError);
    return error as FirmwareDownloadError;
  }
  throw new Error('오류가 나야 해요');
}

describe('probeFirmware(HEAD)', () => {
  it('200이면 available, 크기를 읽고 목록 크기와 다른지 알린다', async () => {
    const same = fakeFetch(() => new Response(null, { status: 200, headers: { 'content-length': '1790544', 'content-type': 'application/octet-stream' } }));
    expect(await probeFirmware(URL, 1_790_544, { fetchImpl: same.fetchImpl })).toEqual({ state: 'available', status: 200, size: 1_790_544, sizeMismatch: false });
    expect(same.calls[0]!.init).toMatchObject({ method: 'HEAD', cache: 'no-store' });
    const other = fakeFetch(() => new Response(null, { status: 200, headers: { 'content-length': '100' } }));
    expect(await probeFirmware(URL, 1_790_544, { fetchImpl: other.fetchImpl })).toMatchObject({ state: 'available', sizeMismatch: true });
  });

  it('404·410이면 missing, HTML(차단 안내)·500·네트워크 오류면 unknown', async () => {
    expect((await probeFirmware(URL, 10, { fetchImpl: fakeFetch(() => new Response(null, { status: 404 })).fetchImpl })).state).toBe('missing');
    expect((await probeFirmware(URL, 10, { fetchImpl: fakeFetch(() => new Response(null, { status: 410 })).fetchImpl })).state).toBe('missing');
    expect((await probeFirmware(URL, 10, { fetchImpl: fakeFetch(() => new Response(null, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })).fetchImpl })).state).toBe('unknown');
    expect((await probeFirmware(URL, 10, { fetchImpl: fakeFetch(() => new Response(null, { status: 500 })).fetchImpl })).state).toBe('unknown');
    const offline: FirmwareFetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await probeFirmware(URL, 10, { fetchImpl: offline })).toEqual({ state: 'unknown', status: null, size: null, sizeMismatch: false });
  });
});

describe('downloadFirmware(GET)', () => {
  it('조각으로 받으며 진행률을 알리고 바이트를 그대로 돌려준다', async () => {
    const bytes = new Uint8Array(10_000).map((_, index) => index % 251);
    const { fetchImpl } = fakeFetch(() => new Response(chunked(bytes, 1_500), { status: 200, headers: { 'content-type': 'application/octet-stream' } }));
    const progress: [number, number][] = [];
    const result = await downloadFirmware(URL, bytes.length, { fetchImpl, onProgress: ({ loaded, total }) => progress.push([loaded, total]) });
    expect(Array.from(result)).toEqual(Array.from(bytes));
    expect(progress[0]).toEqual([0, 10_000]);
    expect(progress.at(-1)).toEqual([10_000, 10_000]);
    expect(progress.length).toBeGreaterThan(5);
  });

  it('404는 missing, 503은 http, HTML은 blocked', async () => {
    expect((await caught(downloadFirmware(URL, 10, { fetchImpl: fakeFetch(() => new Response('없음', { status: 404 })).fetchImpl }))).kind).toBe('missing');
    const http = await caught(downloadFirmware(URL, 10, { fetchImpl: fakeFetch(() => new Response('', { status: 503 })).fetchImpl }));
    expect(http.kind).toBe('http');
    expect(http.status).toBe(503);
    const blocked = await caught(
      downloadFirmware(URL, 10, { fetchImpl: fakeFetch(() => new Response('<html>차단</html>', { status: 200, headers: { 'content-type': 'text/html' } })).fetchImpl }),
    );
    expect(blocked.kind).toBe('blocked');
    expect(blocked.message).toContain('학교 인터넷 차단 안내일 수 있어요');
  });

  it('적힌 크기보다 많이 오면 받기를 멈추고 too-large', async () => {
    const { fetchImpl } = fakeFetch(() => new Response(chunked(new Uint8Array(5_000), 1_000), { status: 200 }));
    const error = await caught(downloadFirmware(URL, 3_000, { fetchImpl }));
    expect(error.kind).toBe('too-large');
  });

  it('덜 오면 받은 만큼만 돌려준다(크기 대조는 verify가 한다)', async () => {
    const { fetchImpl } = fakeFetch(() => new Response(chunked(new Uint8Array(2_000).fill(7), 700), { status: 200 }));
    const result = await downloadFirmware(URL, 3_000, { fetchImpl });
    expect(result.length).toBe(2_000);
  });

  it('연결이 끊기면 network, 멈추면 aborted', async () => {
    const offline: FirmwareFetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect((await caught(downloadFirmware(URL, 10, { fetchImpl: offline }))).kind).toBe('network');
    const broken = fakeFetch(() => {
      let sent = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!sent) {
            sent = true;
            controller.enqueue(new Uint8Array(100));
            return;
          }
          controller.error(new TypeError('network error'));
        },
      });
      return new Response(stream, { status: 200 });
    });
    expect((await caught(downloadFirmware(URL, 1_000, { fetchImpl: broken.fetchImpl }))).kind).toBe('network');
    const controller = new AbortController();
    controller.abort();
    const aborting: FirmwareFetch = async (_url, init) => {
      if (init?.signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      return new Response(null, { status: 200 });
    };
    expect((await caught(downloadFirmware(URL, 10, { fetchImpl: aborting, signal: controller.signal }))).kind).toBe('aborted');
  });
});
