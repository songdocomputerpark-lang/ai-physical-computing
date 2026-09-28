// 회선 흉내 프록시(scripts/perf-line-proxy.mjs — 판 1.1.0, PROGRESS 미해결 210)의 단위 테스트.
//  - 회선(LineLink): 초당 바이트만큼만 내보내고, 흐름들이 번갈아 나눠 쓰고, 조각은 한쪽 지연(RTT/2) 뒤에 닿고, 흐름 안 차례를 지킨다
//  - 프록시: http 절대 주소 요청(미리 보기 서버 localhost)과 https CONNECT 터널이 같은 회선을 지나고(대역폭·지연·새 연결 왕복),
//    허용 밖 호스트는 403으로 끊고 센다. 조건 값(LINE_PROFILES)은 DevTools "3G"에서 온다. cacheControl을 주면 미리 보기 서버의 no-cache를
//    실사이트(GitHub Pages)처럼 max-age=600으로 바꾼다(1.1.0 검토 반영 — 둘째 쪽 글꼴 CSS가 캐시에서 오는 실사이트와 같게).
// 실제 브라우저가 이 프록시로 워커·서비스 워커까지 지나는지는 tests/e2e/perf-scenario-a.spec.ts(perf 무리)가 jsDelivr 바이트로 본다.
import http from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { LineLink, SEGMENT_BYTES, hostAllowed, startLineProxy, type LineProxy } from '../../../scripts/perf-line-proxy.mjs';
import { LINE_PROFILES, SCENARIO_A_LIMIT_MS, SITE_CACHE_CONTROL, THROTTLE_PROFILES, lineAllowHosts } from '../../../scripts/perf-rules.mjs';

/** 손으로 돌리는 시계: 예약한 일을 모았다가 flush()로 부른다 */
function manualClock() {
  let now = 0;
  const scheduled: { fn: () => void; ms: number }[] = [];
  return {
    now: () => now,
    advance(ms: number) {
      now += ms;
    },
    schedule: (fn: () => void, ms: number) => {
      scheduled.push({ fn, ms });
    },
    scheduled,
    flush() {
      for (const item of scheduled.splice(0)) {
        item.fn();
      }
    },
  };
}

describe('회선 조건 값(LINE_PROFILES)', () => {
  it('DevTools "3G"의 대역폭 그대로, 왕복은 요청 지연 2,000ms를 5로 나눈 targetLatency 400ms', () => {
    const line = LINE_PROFILES['3g'];
    expect(line.downBytesPerSecond).toBe(THROTTLE_PROFILES['3g'].conditions.downloadThroughput);
    expect(line.upBytesPerSecond).toBe(THROTTLE_PROFILES['3g'].conditions.uploadThroughput);
    expect(line.rttMs).toBe(THROTTLE_PROFILES['3g'].conditions.latency / 5);
    expect(line.newConnectionRoundTrips).toBe(2);
    expect(SCENARIO_A_LIMIT_MS).toBe(300_000);
  });

  it('지나갈 호스트: 시험하는 사이트 + 실습실의 바깥 출처(jsDelivr)', () => {
    expect(lineAllowHosts('http://localhost:4329/ai-physical-computing/', ['https://cdn.jsdelivr.net'])).toEqual(['localhost', 'cdn.jsdelivr.net']);
    expect(lineAllowHosts('https://songdocomputerpark-lang.github.io/ai-physical-computing/', ['https://cdn.jsdelivr.net'])).toEqual([
      'songdocomputerpark-lang.github.io',
      'cdn.jsdelivr.net',
    ]);
    expect(hostAllowed('cdn.jsdelivr.net', ['cdn.jsdelivr.net'])).toBe(true);
    expect(hostAllowed('fastly.cdn.jsdelivr.net', ['cdn.jsdelivr.net'])).toBe(true);
    expect(hostAllowed('www.bing.com', ['localhost', 'cdn.jsdelivr.net'])).toBe(false);
    expect(hostAllowed('evil-cdn.jsdelivr.net.example', ['cdn.jsdelivr.net'])).toBe(false);
  });
});

describe('회선(LineLink)', () => {
  it('초당 바이트만큼만 내보내고, 조각은 한쪽 지연 뒤에 닿는다', () => {
    const clock = manualClock();
    const link = new LineLink(100_000, 200, clock);
    let delivered = 0;
    link.enqueue('a', 50_000, { onPiece: (piece) => (delivered += piece) });
    for (let tick = 0; tick < 10; tick += 1) {
      clock.advance(10);
      link.tick();
    }
    // 100ms 동안 100,000바이트/초 → 10,000바이트(± 한 조각)
    expect(Math.abs(link.sent - 10_000)).toBeLessThanOrEqual(SEGMENT_BYTES);
    // 아직 닿지 않았다(한쪽 지연 200ms) — 예약된 조각은 모두 200ms 뒤
    expect(delivered).toBe(0);
    expect(new Set(clock.scheduled.map((item) => item.ms))).toEqual(new Set([200]));
    clock.flush();
    expect(delivered).toBe(link.sent);
    expect(link.pending('a')).toBe(50_000 - link.sent);
  });

  it('흐름들이 번갈아 나눠 쓰고, 흐름 안 차례(머리말 → 몸통 → 끝)를 지킨다', () => {
    const clock = manualClock();
    const link = new LineLink(146_000, 0, clock);
    const log: string[] = [];
    const got = { a: 0, b: 0 };
    link.enqueue('a', 300, { onDone: () => log.push('a:head') });
    link.enqueue('a', 30_000, { onPiece: (piece) => (got.a += piece) });
    link.enqueue('a', 0, { onDone: () => log.push('a:end') });
    link.enqueue('b', 30_000, { onPiece: (piece) => (got.b += piece) });
    for (let tick = 0; tick < 20; tick += 1) {
      clock.advance(10);
      link.tick();
      clock.flush();
    }
    // 200ms × 146,000바이트/초 ≈ 29,200바이트를 둘이 반씩(± 한 조각)
    expect(Math.abs(got.a + 300 - got.b)).toBeLessThanOrEqual(SEGMENT_BYTES * 2);
    expect(log).toEqual(['a:head']);
    for (let tick = 0; tick < 40; tick += 1) {
      clock.advance(10);
      link.tick();
      clock.flush();
    }
    expect(got).toEqual({ a: 30_000, b: 30_000 });
    expect(log).toEqual(['a:head', 'a:end']);
  });

  it('흐름에 쌓인 양이 반 아래로 줄면 onDrain을 한 번 부른다(원 서버 읽기 다시 시작)', () => {
    const clock = manualClock();
    const link = new LineLink(1_000_000, 0, clock);
    let drained = 0;
    link.enqueue('a', 70_000, { onDrain: () => (drained += 1) });
    for (let tick = 0; tick < 5; tick += 1) {
      clock.advance(10);
      link.tick();
    }
    expect(drained).toBe(1);
  });

  it('이상한 값은 한국어 오류로 멈춘다', () => {
    expect(() => new LineLink(0, 10)).toThrow(/회선 값이 이상해요/u);
  });
});

describe('프록시(startLineProxy)', () => {
  let proxy: LineProxy | null = null;
  let upstream: http.Server | null = null;
  let tcp: net.Server | null = null;

  afterEach(async () => {
    await proxy?.close();
    await new Promise((resolve) => (upstream ? upstream.close(() => resolve(undefined)) : resolve(undefined)));
    await new Promise((resolve) => (tcp ? tcp.close(() => resolve(undefined)) : resolve(undefined)));
    proxy = null;
    upstream = null;
    tcp = null;
  });

  const BODY = Buffer.alloc(40_000, 7);

  async function startUpstream(): Promise<number> {
    upstream = http.createServer((req, res) => {
      if (req.url === '/big') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': BODY.length });
        res.end(BODY);
        return;
      }
      if (req.url === '/no-cache') {
        // 미리 보기 서버(astro preview)처럼 no-cache를 주는 파일
        res.writeHead(200, { 'Content-Type': 'text/css', 'Cache-Control': 'no-cache', 'Content-Length': 2 });
        res.end('ok');
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise((resolve) => upstream?.listen(0, '127.0.0.1', () => resolve(undefined)));
    const address = upstream.address();
    return typeof address === 'object' && address ? address.port : 0;
  }

  /** 프록시에 절대 주소로 GET(브라우저가 http 사이트를 프록시로 받는 모양) */
  function viaProxy(port: number, url: string, agent: http.Agent): Promise<{ status: number; body: Buffer; ms: number }> {
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const target = new URL(url);
      const request = http.request({ host: '127.0.0.1', port, path: url, headers: { host: target.host }, agent }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks), ms: Date.now() - started }));
      });
      request.on('error', reject);
      request.end();
    });
  }

  it('http 절대 주소 요청: 몸통이 그대로 오고, 새 연결 2왕복 + 요청 1왕복 + 전송 시간만큼 걸린다', async () => {
    const upstreamPort = await startUpstream();
    proxy = await startLineProxy({ downBytesPerSecond: 200_000, upBytesPerSecond: 200_000, rttMs: 100, newConnectionRoundTrips: 2, allowHosts: ['127.0.0.1'] });
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const first = await viaProxy(proxy.port, `http://127.0.0.1:${upstreamPort}/big`, agent);
    expect(first.status).toBe(200);
    expect(first.body.equals(BODY)).toBe(true);
    // 2왕복(200ms) + 1왕복(100ms) + 40,000/200,000초(200ms) ≈ 500ms. 다만 회선은 쉬는 동안 50ms어치 몫(+ 한 조각, 약 11.5KB)을 모아
    // 두었다가 곧바로 보내므로 전송이 약 143ms로 짧아질 수 있어 가장 짧으면 약 443ms다 — 타이머가 정확한 Linux CI는 그 가까이 나온다
    // (2026-09-29 판 1.1.0 통합: 같은 연결 두 번째 요청이 257ms로 옛 기대 270ms에 못 미쳤다). 그래서 모델이 보장하는 아래 값으로 본다.
    expect(first.ms).toBeGreaterThanOrEqual(420);
    expect(first.ms).toBeLessThan(2_000);
    // 같은 연결을 다시 쓰면 새 연결 왕복이 없다 ≈ 300ms(모아 둔 몫으로 약 243ms까지)
    const second = await viaProxy(proxy.port, `http://127.0.0.1:${upstreamPort}/big`, agent);
    expect(second.body.equals(BODY)).toBe(true);
    expect(second.ms).toBeGreaterThanOrEqual(230);
    expect(second.ms).toBeLessThan(first.ms);
    // 두 요청의 차이는 새 연결을 여는 2왕복(200ms)쯤이다(두 번째 요청 앞에 회선이 몫을 다 모으지 못했어도 120ms는 넘는다)
    expect(first.ms - second.ms).toBeGreaterThanOrEqual(120);
    const stats = proxy.stats();
    expect(stats.requests).toBe(2);
    expect(stats.connections).toBe(1);
    expect(stats.hosts['127.0.0.1']?.down).toBeGreaterThanOrEqual(BODY.length * 2);
    expect(stats.hosts['127.0.0.1']?.up).toBeGreaterThan(0);
    agent.destroy();
  });

  it('동시에 받는 두 요청은 한 회선을 나눠 써서 함께 늦어진다(각자 빠르지 않다)', async () => {
    const upstreamPort = await startUpstream();
    proxy = await startLineProxy({ downBytesPerSecond: 200_000, upBytesPerSecond: 200_000, rttMs: 50, newConnectionRoundTrips: 0, allowHosts: ['127.0.0.1'] });
    const agent = new http.Agent({ keepAlive: false, maxSockets: 4 });
    const [a, b] = await Promise.all([
      viaProxy(proxy.port, `http://127.0.0.1:${upstreamPort}/big`, agent),
      viaProxy(proxy.port, `http://127.0.0.1:${upstreamPort}/big`, agent),
    ]);
    // 80,000바이트 / 200,000바이트/초 = 400ms(+ 왕복) — 혼자 받을 때(200ms + 왕복)의 두 배쯤. 두 연결이 시작하는 때가 조금 어긋나면
    // 먼저 시작한 쪽이 그동안 혼자 회선을 써서 일찍 끝난다(CI Linux에서 먼저 끝난 쪽이 317ms — 2026-09-29 판 1.1.0 통합, 그 전 기대
    // "둘 다 350ms 넘게"가 흔들렸다). 그래서 끝나는 때 하나하나가 아니라 늦게 끝난 쪽(두 배의 바이트를 한 회선으로 보낸 뒤)과 두 시간의
    // 합으로 나눠 쓴 것을 본다 — 나눠 쓰지 않으면 둘 다 약 250ms라 늦은 쪽 380ms·합 700ms에 못 미친다.
    expect(Math.max(a.ms, b.ms)).toBeGreaterThanOrEqual(380);
    expect(a.ms + b.ms).toBeGreaterThanOrEqual(700);
    expect(Math.abs(a.ms - b.ms)).toBeLessThan(250);
    agent.destroy();
  });

  it('cacheControl을 주면 http(미리 보기 서버) 응답의 Cache-Control을 그 값으로 바꾼다 — 실사이트(GitHub Pages)처럼, 주지 않으면 그대로', async () => {
    const upstreamPort = await startUpstream();
    const headerVia = async (options: { cacheControl?: string }) => {
      proxy = await startLineProxy({ downBytesPerSecond: 200_000, upBytesPerSecond: 200_000, rttMs: 10, newConnectionRoundTrips: 0, allowHosts: ['127.0.0.1'], ...options });
      const port = proxy.port;
      const url = `http://127.0.0.1:${upstreamPort}/no-cache`;
      const header = await new Promise<string | undefined>((resolve, reject) => {
        const request = http.request({ host: '127.0.0.1', port, path: url, headers: { host: new URL(url).host }, agent: false }, (response) => {
          response.resume();
          response.on('end', () => resolve(response.headers['cache-control']));
        });
        request.on('error', reject);
        request.end();
      });
      await proxy.close();
      proxy = null;
      return header;
    };
    expect(await headerVia({})).toBe('no-cache');
    expect(await headerVia({ cacheControl: SITE_CACHE_CONTROL })).toBe('max-age=600');
  });

  it('허용 밖 호스트는 403으로 끊고 센다', async () => {
    proxy = await startLineProxy({ downBytesPerSecond: 200_000, upBytesPerSecond: 200_000, rttMs: 10, allowHosts: ['127.0.0.1'] });
    const agent = new http.Agent({ keepAlive: false });
    const response = await viaProxy(proxy.port, 'http://www.bing.com/', agent);
    expect(response.status).toBe(403);
    const connectStatus = await new Promise<number>((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port: proxy?.port, method: 'CONNECT', path: 'edge.microsoft.com:443' });
      request.on('connect', (res, socket) => {
        socket.destroy();
        resolve(res.statusCode ?? 0);
      });
      request.on('response', (res) => resolve(res.statusCode ?? 0));
      request.on('error', reject);
      request.end();
    });
    expect(connectStatus).toBe(403);
    expect(proxy.stats().rejected).toEqual({ 'www.bing.com': 1, 'edge.microsoft.com': 1 });
    expect(proxy.stats().down).toBe(0);
    agent.destroy();
  });

  it('브라우저가 403 뒤·터널 중간에 연결을 끊어도(RST) 프록시가 멈추지 않는다', async () => {
    const upstreamPort = await startUpstream();
    proxy = await startLineProxy({ downBytesPerSecond: 200_000, upBytesPerSecond: 200_000, rttMs: 10, newConnectionRoundTrips: 0, allowHosts: ['127.0.0.1'] });
    // 허용 밖 CONNECT → 403을 받자마자 RST로 끊는다(2026-09-28 실험에서 ECONNRESET이 듣는 곳 없이 나 프로세스가 멈췄다)
    for (const target of ['edge.microsoft.com:443', `127.0.0.1:${upstreamPort}`]) {
      await new Promise<void>((resolve) => {
        const socket = net.connect(proxy?.port ?? 0, '127.0.0.1', () => {
          socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
          setTimeout(() => {
            socket.resetAndDestroy();
            resolve();
          }, 30);
        });
        socket.on('error', () => resolve());
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    // 그 뒤에도 요청을 받는다
    const agent = new http.Agent({ keepAlive: false });
    const response = await viaProxy(proxy.port, `http://127.0.0.1:${upstreamPort}/big`, agent);
    expect(response.status).toBe(200);
    expect(response.body.equals(BODY)).toBe(true);
    agent.destroy();
  });

  it('https CONNECT 터널도 같은 회선을 지난다(새 연결 왕복 + 전송 시간, 바이트는 호스트별로)', async () => {
    tcp = net.createServer((socket) => {
      socket.once('data', () => {
        socket.end(Buffer.concat([Buffer.from('HTTP/1.1 200 OK\r\nContent-Length: 40000\r\nConnection: close\r\n\r\n'), BODY]));
      });
    });
    await new Promise((resolve) => tcp?.listen(0, '127.0.0.1', () => resolve(undefined)));
    const address = tcp.address();
    const tcpPort = typeof address === 'object' && address ? address.port : 0;
    proxy = await startLineProxy({ downBytesPerSecond: 200_000, upBytesPerSecond: 200_000, rttMs: 100, newConnectionRoundTrips: 2, allowHosts: ['127.0.0.1'] });
    const started = Date.now();
    const received = await new Promise<Buffer>((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port: proxy?.port, method: 'CONNECT', path: `127.0.0.1:${tcpPort}` });
      request.on('connect', (_res, socket) => {
        const chunks: Buffer[] = [];
        socket.on('data', (chunk: Buffer) => chunks.push(chunk));
        socket.on('end', () => resolve(Buffer.concat(chunks)));
        socket.on('error', reject);
        socket.write('GET / HTTP/1.1\r\nHost: example\r\n\r\n');
      });
      request.on('error', reject);
      request.end();
    });
    const elapsed = Date.now() - started;
    expect(received.subarray(received.indexOf('\r\n\r\n') + 4).equals(BODY)).toBe(true);
    // 터널 열기 2왕복(200ms) + 요청·응답 1왕복(100ms) + 전송 200ms ≈ 500ms(쉬는 동안 모은 몫으로 가장 짧으면 약 443ms — 위 http 검사와 같은 까닭)
    expect(elapsed).toBeGreaterThanOrEqual(420);
    expect(elapsed).toBeLessThan(2_500);
    const stats = proxy.stats();
    expect(stats.hosts['127.0.0.1']?.down).toBeGreaterThanOrEqual(BODY.length);
    expect(stats.hosts['127.0.0.1']?.connections).toBe(1);
  });
});
