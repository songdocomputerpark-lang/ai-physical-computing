// 서비스 워커의 "멈춤" 판정 — 느린 회선과 진짜 막힘을 가른다(판 1.2.0, PROGRESS 미해결 215).
//
// 회선 전체 3G 측정에서 numpy·OpenCV 휠이 측정마다 jsDelivr 또는 같은 사이트 예비본에서 왔다. jsDelivr는 HTTP/2 한 연결에 여러 파일을 실어
// 차례로 보내기도 해서, 느린 회선에서는 뒤 파일이 앞 파일을 기다리느라 15초 넘게 제 몫의 바이트가 없을 수 있다 — 예전 판정(파일마다 15초)은 이를
// 막힘으로 보고 예비본으로 바꾼 뒤 5분 동안 예비본 먼저였다. 이제 멈춤은 "그 위치(CDN·같은 사이트)의 받기 모두에 15초 동안 바이트가 하나도 없음"이다.
// 빠른 망·진짜 막힘(머리말이 안 옴·몸통이 멈춤·연결 실패)에서는 예전처럼 예비본으로 바뀌는지도 함께 본다.
// 빌드와 같은 sw.js를 vm 안에서 가짜 시계·손으로 흘리는 fetch로 돌린다(tests/unit/sw/helpers/sw-sandbox.ts).
import { describe, expect, it } from 'vitest';
import { CDN_DOWN_TTL_MS, PYODIDE_STALL_MS, SW_MESSAGE } from '../../../src/lab/loader/constants.ts';
import { pyodideUrls, settle, startServiceWorker, type SwSandbox } from './helpers/sw-sandbox.ts';

const STALL = PYODIDE_STALL_MS;
const A = 'aaa_test-1.0-py3-none-any.whl';
const B = 'bbb_test-1.0-py3-none-any.whl';
const C = 'ccc_test-1.0-py3-none-any.whl';

/** 워커가 CDN 주소로 파일을 달라고 한다 → 서비스 워커의 응답 약속 */
function ask(sw: SwSandbox, name: string): Promise<Response> {
  const responded = sw.request(pyodideUrls(sw, name).cdn);
  if (responded === null) {
    throw new Error(`${name}을(를) 서비스 워커가 맡지 않았어요`);
  }
  return responded;
}

/** 이 파일의 마지막 'done' 메시지가 어디서 받았다고 하는지 */
function doneFrom(sw: SwSandbox, name: string): string | undefined {
  return sw
    .messagesOf('done')
    .filter((message) => message.url === pyodideUrls(sw, name).cdn)
    .at(-1)?.from;
}

function fallbacksOf(sw: SwSandbox, name: string) {
  return sw.messagesOf('fallback').filter((message) => message.url === pyodideUrls(sw, name).cdn);
}

describe('서비스 워커 멈춤 판정 — 빠른 망은 그대로', () => {
  it('바로 오는 CDN 파일은 CDN에서 받고 예비본으로 바꾸지 않는다', async () => {
    const sw = startServiceWorker();
    const response = ask(sw, A);
    await settle();
    const cdn = sw.fetchOf(pyodideUrls(sw, A).cdn)!;
    cdn.headers();
    cdn.chunk(1000);
    cdn.chunk(500);
    cdn.end();
    await settle();
    expect((await response).status).toBe(200);
    expect(doneFrom(sw, A)).toBe('cdn');
    expect(sw.messagesOf('fallback')).toEqual([]);
    expect(sw.fetches.map((pending) => pending.url)).toEqual([pyodideUrls(sw, A).cdn]);
  });

  it('조각 사이가 15초보다 짧으면(느리지만 꾸준한 회선) 몇 분이 걸려도 그대로 받는다', async () => {
    const sw = startServiceWorker();
    const response = ask(sw, A);
    await settle();
    const cdn = sw.fetchOf(pyodideUrls(sw, A).cdn)!;
    await sw.clock.advance(STALL - 1000);
    cdn.headers();
    for (let index = 0; index < 20; index += 1) {
      await sw.clock.advance(STALL - 1000);
      cdn.chunk(1460);
    }
    cdn.end();
    await settle();
    expect((await response).status).toBe(200);
    expect(doneFrom(sw, A)).toBe('cdn');
    expect(cdn.aborted).toBe(false);
    expect(sw.messagesOf('fallback')).toEqual([]);
  });
});

describe('서비스 워커 멈춤 판정 — HTTP/2 한 연결에 차례로 실려 오는 느린 회선(미해결 215)', () => {
  it('앞 파일에 바이트가 오는 동안 뒤 파일이 몸통을 50초 기다려도 막힘으로 보지 않는다', async () => {
    const sw = startServiceWorker();
    const first = ask(sw, A);
    const second = ask(sw, B);
    await settle();
    const a = sw.fetchOf(pyodideUrls(sw, A).cdn)!;
    const b = sw.fetchOf(pyodideUrls(sw, B).cdn)!;
    a.headers();
    b.headers();
    // A만 2초마다 조각을 받는다(같은 연결이 A를 먼저 보냄) — B는 50초 동안 한 바이트도 없다
    for (let index = 0; index < 25; index += 1) {
      await sw.clock.advance(2000);
      a.chunk(1460);
    }
    a.end();
    await settle();
    // A가 끝나자 B 차례
    for (let index = 0; index < 5; index += 1) {
      await sw.clock.advance(2000);
      b.chunk(1460);
    }
    b.end();
    await settle();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect(b.aborted).toBe(false);
    expect(fallbacksOf(sw, B)).toEqual([]);
    expect(doneFrom(sw, A)).toBe('cdn');
    expect(doneFrom(sw, B)).toBe('cdn');
    // 예비본 주소로는 한 번도 가지 않았다
    expect(sw.fetches.some((pending) => pending.url === pyodideUrls(sw, B).site)).toBe(false);
  });

  it('앞 파일에 바이트가 오는 동안 뒤 파일의 응답 머리말이 40초 늦어도 막힘으로 보지 않는다', async () => {
    const sw = startServiceWorker();
    const first = ask(sw, A);
    const second = ask(sw, B);
    await settle();
    const a = sw.fetchOf(pyodideUrls(sw, A).cdn)!;
    const b = sw.fetchOf(pyodideUrls(sw, B).cdn)!;
    a.headers();
    for (let index = 0; index < 20; index += 1) {
      await sw.clock.advance(2000);
      a.chunk(1460);
    }
    b.headers();
    b.chunk(100);
    b.end();
    a.end();
    await settle();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect(b.aborted).toBe(false);
    expect(sw.messagesOf('fallback')).toEqual([]);
    expect(doneFrom(sw, B)).toBe('cdn');
  });

  it('앞 파일이 끝난 뒤에도 뒤 파일에 15초 동안 바이트가 없으면 그때 예비본으로 바꾼다(늦게라도 막힘은 잡는다)', async () => {
    const sw = startServiceWorker();
    const first = ask(sw, A);
    const second = ask(sw, B);
    await settle();
    const a = sw.fetchOf(pyodideUrls(sw, A).cdn)!;
    const b = sw.fetchOf(pyodideUrls(sw, B).cdn)!;
    a.headers();
    b.headers();
    for (let index = 0; index < 10; index += 1) {
      await sw.clock.advance(2000);
      a.chunk(1460);
    }
    a.end();
    await settle();
    // A의 마지막 바이트 뒤 14초: 아직 멈춤이 아니다
    await sw.clock.advance(STALL - 1000);
    expect(b.aborted).toBe(false);
    expect(fallbacksOf(sw, B)).toEqual([]);
    // 15초를 넘으면 B를 끊고 같은 사이트 예비본으로
    await sw.clock.advance(2000);
    expect(b.aborted).toBe(true);
    expect(fallbacksOf(sw, B)).toEqual([expect.objectContaining({ state: 'fallback', from: 'site', reason: 'stalled-body' })]);
    const site = sw.fetchOf(pyodideUrls(sw, B).site)!;
    site.headers();
    site.chunk(10);
    site.end();
    await settle();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect(doneFrom(sw, B)).toBe('site');
  });

  it('같은 사이트 예비본에 바이트가 오는 것은 CDN이 살아 있다는 신호가 아니다(위치마다 따로 센다)', async () => {
    const sw = startServiceWorker();
    // 같은 사이트 주소로 온 요청은 예비본 위치에서 받는다
    const siteResponse = sw.request(pyodideUrls(sw, A).site)!;
    const cdnResponse = ask(sw, B);
    await settle();
    const site = sw.fetchOf(pyodideUrls(sw, A).site)!;
    const cdn = sw.fetchOf(pyodideUrls(sw, B).cdn)!;
    site.headers();
    for (let index = 0; index < 9; index += 1) {
      await sw.clock.advance(2000);
      site.chunk(1460);
    }
    // CDN은 18초 동안 머리말도 없었다 — 막힘
    expect(cdn.aborted).toBe(true);
    expect(fallbacksOf(sw, B)).toEqual([expect.objectContaining({ from: 'site', reason: 'stalled-headers' })]);
    site.end();
    const fallback = sw.fetchOf(pyodideUrls(sw, B).site)!;
    fallback.headers();
    fallback.end();
    await settle();
    expect((await siteResponse).status).toBe(200);
    expect((await cdnResponse).status).toBe(200);
  });
});

describe('서비스 워커 멈춤 판정 — 진짜 막힘은 예전처럼 예비본으로', () => {
  it('CDN 응답 머리말이 15초 동안 오지 않으면 예비본으로 바꾸고(stalled-headers), 5분 동안은 다음 파일도 예비본부터 받는다(누가 막혔다고 봤는지 남김)', async () => {
    const sw = startServiceWorker();
    const response = ask(sw, A);
    await settle();
    const cdn = sw.fetchOf(pyodideUrls(sw, A).cdn)!;
    await sw.clock.advance(STALL - 1);
    expect(cdn.aborted).toBe(false);
    await sw.clock.advance(1);
    expect(cdn.aborted).toBe(true);
    expect(fallbacksOf(sw, A)).toEqual([expect.objectContaining({ from: 'site', reason: 'stalled-headers' })]);
    const site = sw.fetchOf(pyodideUrls(sw, A).site)!;
    site.headers();
    site.chunk(200);
    site.end();
    await settle();
    expect((await response).status).toBe(200);
    expect(doneFrom(sw, A)).toBe('site');

    // 다음 CDN 파일은 곧바로 예비본부터 — start 메시지에 까닭(why)과 누가(downBy) 막혔다고 봤는지
    const next = ask(sw, B);
    await settle();
    expect(sw.fetchOf(pyodideUrls(sw, B).cdn)).toBeUndefined();
    const nextSite = sw.fetchOf(pyodideUrls(sw, B).site)!;
    nextSite.headers();
    nextSite.end();
    await settle();
    expect((await next).status).toBe(200);
    expect(sw.messagesOf('start').find((message) => message.url === pyodideUrls(sw, B).site)).toMatchObject({
      from: 'site',
      why: 'cdn-down',
      downBy: `file:${A}:stalled-headers`,
    });

    // 5분이 지나면 다시 CDN부터
    await sw.clock.advance(CDN_DOWN_TTL_MS);
    const later = ask(sw, C);
    await settle();
    const laterCdn = sw.fetchOf(pyodideUrls(sw, C).cdn)!;
    expect(laterCdn).toBeDefined();
    laterCdn.headers();
    laterCdn.end();
    await settle();
    expect((await later).status).toBe(200);
    expect(doneFrom(sw, C)).toBe('cdn');
  });

  it('머리말 뒤 몸통이 15초 동안 멈추면 예비본으로 바꾼다(stalled-body)', async () => {
    const sw = startServiceWorker();
    const response = ask(sw, A);
    await settle();
    const cdn = sw.fetchOf(pyodideUrls(sw, A).cdn)!;
    cdn.headers();
    cdn.chunk(1000);
    await sw.clock.advance(STALL + 10);
    expect(cdn.aborted).toBe(true);
    expect(fallbacksOf(sw, A)).toEqual([expect.objectContaining({ from: 'site', reason: 'stalled-body' })]);
    const site = sw.fetchOf(pyodideUrls(sw, A).site)!;
    site.headers();
    site.end();
    await settle();
    expect((await response).status).toBe(200);
  });

  it('연결이 실패하면 기다리지 않고 곧바로 예비본으로 바꾼다(error)', async () => {
    const sw = startServiceWorker();
    const response = ask(sw, A);
    await settle();
    sw.fetchOf(pyodideUrls(sw, A).cdn)!.fail();
    await settle();
    expect(fallbacksOf(sw, A)).toEqual([expect.objectContaining({ from: 'site', reason: 'error' })]);
    const site = sw.fetchOf(pyodideUrls(sw, A).site)!;
    site.headers();
    site.end();
    await settle();
    expect((await response).status).toBe(200);
    expect(sw.clock.now).toBe(1_000_000); // 시간이 하나도 흐르지 않았다
  });

  it('HTTP 오류·파일 대신 HTML도 곧바로 바꾸고 까닭을 남긴다(http-403·blocked)', async () => {
    const sw = startServiceWorker();
    const forbidden = ask(sw, A);
    const blockPage = ask(sw, B);
    await settle();
    sw.fetchOf(pyodideUrls(sw, A).cdn)!.headers(403);
    sw.fetchOf(pyodideUrls(sw, B).cdn)!.headers(200, { 'content-type': 'text/html; charset=utf-8' });
    await settle();
    expect(fallbacksOf(sw, A)).toEqual([expect.objectContaining({ reason: 'http-403' })]);
    expect(fallbacksOf(sw, B)).toEqual([expect.objectContaining({ reason: 'blocked' })]);
    for (const name of [A, B]) {
      const site = sw.fetchOf(pyodideUrls(sw, name).site)!;
      site.headers();
      site.end();
    }
    await settle();
    expect((await forbidden).status).toBe(200);
    expect((await blockPage).status).toBe(200);
  });

  it('두 위치가 모두 실패하면 error 메시지에 두 까닭을 잇는다', async () => {
    const sw = startServiceWorker();
    const response = ask(sw, A);
    await settle();
    sw.fetchOf(pyodideUrls(sw, A).cdn)!.fail();
    await settle();
    sw.fetchOf(pyodideUrls(sw, A).site)!.headers(404);
    await settle();
    // 마지막으로 브라우저에 그냥 맡긴다(원래 요청 그대로)
    const passthrough = sw.fetches.at(-1)!;
    expect(passthrough.url).toBe(pyodideUrls(sw, A).cdn);
    expect(sw.messagesOf('error')).toEqual([expect.objectContaining({ reason: 'error+http-404' })]);
    passthrough.fail();
    await settle();
    expect((await response).status).toBe(504);
  });
});

describe('화면의 "CDN이 막혔어요"(apc:cdn-down) 알림', () => {
  it('서비스 워커가 방금 CDN에서 바이트를 받고 있었으면 따르지 않는다(화면의 살핌이 바쁜 연결에 끼어 늦었을 뿐)', async () => {
    const sw = startServiceWorker();
    const first = ask(sw, A);
    await settle();
    const a = sw.fetchOf(pyodideUrls(sw, A).cdn)!;
    a.headers();
    await sw.clock.advance(2000);
    a.chunk(1460);
    await sw.message({ type: SW_MESSAGE.cdnDown });
    const second = ask(sw, B);
    await settle();
    // 다음 파일도 CDN부터
    const b = sw.fetchOf(pyodideUrls(sw, B).cdn)!;
    expect(b).toBeDefined();
    expect(sw.fetchOf(pyodideUrls(sw, B).site)).toBeUndefined();
    for (const pending of [a, b]) {
      pending.headers();
      pending.end();
    }
    await settle();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
  });

  it('CDN에서 15초 넘게 바이트가 없었으면 따른다 — 다음 파일은 예비본부터(downBy page)', async () => {
    const sw = startServiceWorker();
    await sw.message({ type: SW_MESSAGE.cdnDown });
    const response = ask(sw, A);
    await settle();
    expect(sw.fetchOf(pyodideUrls(sw, A).cdn)).toBeUndefined();
    const site = sw.fetchOf(pyodideUrls(sw, A).site)!;
    site.headers();
    site.end();
    await settle();
    expect((await response).status).toBe(200);
    expect(sw.messagesOf('start').find((message) => message.url === pyodideUrls(sw, A).site)).toMatchObject({ why: 'cdn-down', downBy: 'page' });
  });
});

describe('오프라인 배포판', () => {
  it('같은 사이트만 쓴다 — 멈춰도 CDN으로 바꾸지 않는다', async () => {
    const sw = startServiceWorker({ offline: true });
    // 오프라인판의 워커는 같은 사이트 주소로만 달라고 한다(src/lab/runtime/config.ts pyodideIndexUrls)
    const response = sw.request(pyodideUrls(sw, A).site)!;
    await settle();
    const site = sw.fetchOf(pyodideUrls(sw, A).site)!;
    await sw.clock.advance(STALL + 10);
    expect(site.aborted).toBe(true);
    expect(sw.messagesOf('fallback')).toEqual([]);
    expect(sw.messagesOf('error')).toEqual([expect.objectContaining({ reason: 'stalled-headers' })]);
    // 예비 경로가 없으니 브라우저에 맡긴다(같은 주소 그대로)
    const passthrough = sw.fetches.at(-1)!;
    expect(passthrough.url).toBe(pyodideUrls(sw, A).site);
    passthrough.headers();
    passthrough.end();
    await settle();
    expect((await response).status).toBe(200);
    expect(sw.fetches.some((pending) => pending.url.startsWith('https://cdn.jsdelivr.net/'))).toBe(false);
    expect(sw.messagesOf('start').some((message) => message.why === 'cdn-down')).toBe(false);
  });
});
