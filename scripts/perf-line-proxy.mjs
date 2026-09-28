// 느린 회선 흉내 프록시(판 1.1.0 — PROGRESS 미해결 210). 브라우저 문맥의 **모든 요청**(페이지·파이썬 워커·서비스 워커)이 한 회선을 지나게 한다.
//
// 왜 프록시인가: CDP Network.emulateNetworkConditions는 **페이지 대상에만** 걸려 파이썬 워커가 받는 Pyodide·numpy·OpenCV(약 20MB)는
// 느려지지 않는다(PROGRESS 미해결 36 — 실측). Playwright의 문맥 프록시(browser.newContext({ proxy }))는 그 문맥의 네트워크 전체에 걸려
// 워커·서비스 워커 요청도 지난다(Playwright가 Chromium에 `<-loopback>`을 넘겨 localhost 미리 보기 서버도 프록시를 지난다).
// 쓰는 곳: tests/e2e/perf-scenario-a.spec.ts(npm run perf:measure — 회선 전체 3G의 시나리오 A). 조건 값은 scripts/perf-rules.mjs의 LINE_PROFILES.
//
// 회선 모양(1.0.0 사용성 검토 도구 .cache/phase6-reviews/experience-logs/throttle-proxy.mjs를 옮겨 다듬음 — 같은 조건이면 같은 수가 나오게)
// - 대역폭: 내려받기·올리기 각각 한 줄의 병목. 모든 연결이 나눠 쓴다(연결마다 번갈아 1,460바이트씩 — 공평 큐).
// - 지연: 모든 조각이 한쪽 방향 RTT/2 늦게 닿는다. 새 연결은 newConnectionRoundTrips 왕복(DNS·TCP) 뒤에 열린다.
//   TLS 악수·HTTP 요청·응답 왕복은 조각이 오가며 저절로 생긴다(요청마다 지연을 한 번 붙이는 DevTools 흉내와 다르다 — perf-rules.mjs LINE_PROFILES).
// - 버퍼: 한 흐름에 64KB가 쌓이면 원 서버 쪽 읽기를 멈춘다(끝없는 버퍼 부풀림 없이 — 흐름 조절이 원 서버까지 전해진다).
// - https: CONNECT 터널(암호를 풀지 않는다 — 내용은 보지 않고 바이트만 센다). http(미리 보기 서버 localhost): 절대 주소 요청을 받아 원 서버로 넘긴다.
// - 허용한 호스트만 지난다. 나머지(브라우저 자체의 검색·보안 검사·업데이트 같은 배경 통신)는 403으로 끊고 센다 — 그 바이트가 같은 회선을
//   먹어 사이트 수치를 흐리지 않게(검토 첫 측정은 Edge 배경 통신 704KB 때문에 FCP가 3.3초로 잡혔다).
// 흉내 내지 않는 것: TCP 느린 시작·패킷 손실·실제 학교망의 공유(여러 학생) — 수치는 "한 사람이 3G 회선을 혼자 쓸 때"다.
import http from 'node:http';
import net from 'node:net';

/** 한 흐름(연결 한 방향)에 쌓아 둘 수 있는 바이트 — 넘으면 보내는 쪽 읽기를 멈춘다 */
export const FLOW_BUFFER_BYTES = 64 * 1024;
/** 한 번에 보내는 조각 크기(이더넷 한 패킷의 TCP 몸통 크기) */
export const SEGMENT_BYTES = 1460;
/** 회선 시계 간격(밀리초) */
export const TICK_MS = 10;
/** 연결 헤더 가운데 원 서버로 넘기지 않는 것(hop-by-hop — RFC 9110 7.6.1) */
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-connection', 'proxy-authorization', 'proxy-authenticate', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

/**
 * 한 방향의 병목 회선. 흐름(연결 한 방향)마다 줄을 두고, 시계마다 쌓인 몫(초당 바이트 × 지난 시간)만큼 흐름을 번갈아 1,460바이트씩 내보낸다.
 * 내보낸 조각은 halfRttMs 뒤에 닿는다(setTimeout — 같은 지연이라 흐름 안 차례가 지켜진다).
 */
export class LineLink {
  /**
   * @param {number} bytesPerSecond
   * @param {number} halfRttMs
   * @param {{ now?: () => number, schedule?: (fn: () => void, ms: number) => unknown }} [clock] 단위 테스트용
   */
  constructor(bytesPerSecond, halfRttMs, clock = {}) {
    if (!(bytesPerSecond > 0) || !(halfRttMs >= 0)) {
      throw new Error(`회선 값이 이상해요: 초당 ${bytesPerSecond}바이트, 한쪽 지연 ${halfRttMs}ms`);
    }
    this.rate = bytesPerSecond;
    this.half = halfRttMs;
    this.now = clock.now ?? (() => Date.now());
    this.schedule = clock.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    /** @type {Map<string, { items: { bytes: number, sent: number, onPiece?: (piece: number, start: number) => void, onDone?: () => void }[], queued: number, onDrain?: () => void }>} */
    this.flows = new Map();
    /** @type {string[]} */
    this.order = [];
    this.credit = 0;
    this.last = this.now();
    this.cursor = 0;
    /** 이 회선으로 보낸 바이트 합 */
    this.sent = 0;
  }

  /**
   * 흐름 하나에 바이트 덩어리를 줄 세운다. onPiece(조각 바이트, 덩어리 안 시작 위치)는 조각이 닿을 때마다, onDone은 마지막 조각이 닿은 뒤.
   * @param {string} flowId
   * @param {number} bytes
   * @param {{ onPiece?: (piece: number, start: number) => void, onDone?: () => void, onDrain?: () => void }} [handlers]
   * @returns {number} 이 흐름에 쌓인 바이트
   */
  enqueue(flowId, bytes, handlers = {}) {
    let flow = this.flows.get(flowId);
    if (!flow) {
      flow = { items: [], queued: 0 };
      this.flows.set(flowId, flow);
      this.order.push(flowId);
    }
    if (handlers.onDrain) {
      flow.onDrain = handlers.onDrain;
    }
    if (bytes <= 0) {
      // 몸통 없는 덩어리(빈 응답 끝 등)도 차례를 지켜 halfRtt 뒤에 끝낸다
      flow.items.push({ bytes: 0, sent: 0, onPiece: handlers.onPiece, onDone: handlers.onDone });
    } else {
      flow.items.push({ bytes, sent: 0, onPiece: handlers.onPiece, onDone: handlers.onDone });
      flow.queued += bytes;
    }
    return flow.queued;
  }

  /** @param {string} flowId */
  pending(flowId) {
    return this.flows.get(flowId)?.queued ?? 0;
  }

  /** @param {string} flowId */
  remove(flowId) {
    this.flows.delete(flowId);
    this.order = this.order.filter((id) => id !== flowId);
  }

  /** 시계 한 번: 쌓인 몫만큼 흐름을 번갈아 보낸다 */
  tick() {
    const now = this.now();
    // 몫은 50ms어치 + 한 조각까지만 모은다(오래 쉬었다가 한꺼번에 쏟지 않게)
    this.credit = Math.min(this.credit + ((now - this.last) / 1000) * this.rate, this.rate * 0.05 + SEGMENT_BYTES);
    this.last = now;
    let progressed = true;
    while (progressed) {
      progressed = false;
      const count = this.order.length;
      for (let step = 0; step < count; step += 1) {
        const flowId = this.order[(this.cursor + step) % count];
        const flow = flowId === undefined ? undefined : this.flows.get(flowId);
        const item = flow?.items[0];
        if (!flow || !item) {
          continue;
        }
        if (item.bytes === 0) {
          // 빈 덩어리는 몫을 쓰지 않는다
          flow.items.shift();
          const done = item.onDone;
          if (done) {
            this.schedule(done, this.half);
          }
          progressed = true;
          continue;
        }
        if (this.credit < 1) {
          return;
        }
        const piece = Math.min(item.bytes - item.sent, SEGMENT_BYTES, Math.floor(this.credit));
        if (piece <= 0) {
          return;
        }
        const start = item.sent;
        item.sent += piece;
        flow.queued -= piece;
        this.credit -= piece;
        this.sent += piece;
        const onPiece = item.onPiece;
        if (onPiece) {
          this.schedule(() => onPiece(piece, start), this.half);
        }
        if (item.sent >= item.bytes) {
          flow.items.shift();
          const done = item.onDone;
          if (done) {
            this.schedule(done, this.half);
          }
        }
        if (flow.queued < FLOW_BUFFER_BYTES / 2 && flow.onDrain) {
          const drain = flow.onDrain;
          flow.onDrain = undefined;
          drain();
        }
        progressed = true;
        this.cursor = (this.cursor + step + 1) % Math.max(1, this.order.length);
        break;
      }
    }
  }
}

/**
 * @typedef {object} LineHostStats
 * @property {number} down 브라우저 쪽으로 보낸 바이트(몸통 + 머리말 어림, 압축된 그대로)
 * @property {number} up 원 서버 쪽으로 보낸 바이트
 * @property {number} connections
 * @property {number} requests http 요청 수(https 터널 안 요청은 셀 수 없다)
 */

/**
 * @typedef {object} LineStats
 * @property {number} down
 * @property {number} up
 * @property {number} connections
 * @property {number} requests
 * @property {Record<string, LineHostStats>} hosts
 * @property {Record<string, number>} rejected 허용 밖이라 끊은 호스트와 횟수
 */

/**
 * @typedef {object} LineProxyOptions
 * @property {number} downBytesPerSecond
 * @property {number} upBytesPerSecond
 * @property {number} rttMs
 * @property {number} [newConnectionRoundTrips] 새 연결을 여는 데 드는 왕복 수(기본 2 — DNS 1 + TCP 1)
 * @property {readonly string[]} allowHosts 지나갈 수 있는 호스트 이름(같거나 그 아래 이름)
 * @property {number} [port] 기본 0(빈 포트)
 */

/**
 * @typedef {object} LineProxy
 * @property {number} port
 * @property {string} server Playwright proxy.server에 넣을 주소
 * @property {() => LineStats} stats 지금까지 센 값(복사본)
 * @property {() => Promise<void>} close
 */

/** @param {string} host @param {readonly string[]} allowHosts */
export function hostAllowed(host, allowHosts) {
  const name = host.replace(/^\[|\]$/gu, '').toLowerCase();
  return allowHosts.some((allowed) => {
    const want = allowed.toLowerCase();
    return name === want || name.endsWith(`.${want}`);
  });
}

/** 요청 머리말이 회선에서 차지하는 바이트 어림(요청 줄 + 머리말 줄 + 빈 줄) @param {http.IncomingMessage} req */
function requestHeadBytes(req) {
  let bytes = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`.length + 2;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    bytes += Buffer.byteLength(`${req.rawHeaders[index]}: ${req.rawHeaders[index + 1]}\r\n`);
  }
  return bytes;
}

/** 응답 머리말 바이트 어림 @param {http.IncomingMessage} res */
function responseHeadBytes(res) {
  let bytes = `HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage ?? ''}\r\n`.length + 2;
  for (let index = 0; index < res.rawHeaders.length; index += 2) {
    bytes += Buffer.byteLength(`${res.rawHeaders[index]}: ${res.rawHeaders[index + 1]}\r\n`);
  }
  return bytes;
}

/**
 * 회선 흉내 프록시를 띄운다(127.0.0.1만).
 * @param {LineProxyOptions} options
 * @returns {Promise<LineProxy>}
 */
export async function startLineProxy(options) {
  const { downBytesPerSecond, upBytesPerSecond, rttMs, allowHosts } = options;
  const newConnectionRoundTrips = options.newConnectionRoundTrips ?? 2;
  const half = rttMs / 2;
  const setupMs = newConnectionRoundTrips * rttMs;
  const down = new LineLink(downBytesPerSecond, half);
  const up = new LineLink(upBytesPerSecond, half);
  const timer = setInterval(() => {
    down.tick();
    up.tick();
  }, TICK_MS);
  /** @type {LineStats} */
  const stats = { down: 0, up: 0, connections: 0, requests: 0, hosts: {}, rejected: {} };
  /** @param {string} host */
  const hostStats = (host) => {
    stats.hosts[host] ??= { down: 0, up: 0, connections: 0, requests: 0 };
    return /** @type {LineHostStats} */ (stats.hosts[host]);
  };
  /** @param {string} host @param {'down' | 'up'} direction @param {number} bytes */
  const count = (host, direction, bytes) => {
    stats[direction] += bytes;
    hostStats(host)[direction] += bytes;
  };
  /** @param {string} host */
  const reject = (host) => {
    stats.rejected[host] = (stats.rejected[host] ?? 0) + 1;
  };
  let flowCounter = 0;
  const nextFlow = () => {
    flowCounter += 1;
    return `f${flowCounter}`;
  };
  /** 브라우저 ↔ 프록시 연결이 처음 쓰이는지(새 연결 비용을 한 번만 붙이려고) */
  const warmSockets = new WeakSet();
  const upstreamAgent = new http.Agent({ keepAlive: true, maxSockets: 64 });
  /** @type {Set<net.Socket>} */
  const sockets = new Set();
  let closed = false;

  const server = http.createServer((req, res) => {
    let target;
    try {
      target = new URL(req.url ?? '');
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('절대 주소 요청만 받아요(프록시)');
      return;
    }
    if (target.protocol !== 'http:' || !hostAllowed(target.hostname, allowHosts)) {
      reject(target.hostname);
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' }).end('회선 흉내 프록시: 허용하지 않은 호스트');
      return;
    }
    const host = target.hostname;
    stats.requests += 1;
    hostStats(host).requests += 1;
    const isNewSocket = !warmSockets.has(req.socket);
    if (isNewSocket) {
      warmSockets.add(req.socket);
      stats.connections += 1;
      hostStats(host).connections += 1;
    }
    const upFlow = nextFlow();
    const downFlow = nextFlow();
    /** @type {Buffer[]} */
    const body = [];
    req.on('data', (chunk) => body.push(chunk));
    req.on('end', () => {
      const bodyBuffer = Buffer.concat(body);
      const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) => !HOP_BY_HOP.has(name)));
      const send = () => {
        if (closed) {
          return;
        }
        const upstream = http.request(
          { host: target.hostname, port: target.port || 80, method: req.method, path: `${target.pathname}${target.search}`, headers, agent: upstreamAgent },
          (upRes) => {
            const head = responseHeadBytes(upRes);
            const responseHeaders = Object.fromEntries(Object.entries(upRes.headers).filter(([name]) => !HOP_BY_HOP.has(name)));
            let ended = false;
            down.enqueue(downFlow, head, {
              onPiece: (piece) => count(host, 'down', piece),
              onDone: () => {
                if (!res.headersSent && !res.destroyed) {
                  res.writeHead(upRes.statusCode ?? 502, upRes.statusMessage, responseHeaders);
                }
              },
            });
            upRes.on('data', (chunk) => {
              const queued = down.enqueue(downFlow, chunk.length, {
                onPiece: (piece, start) => {
                  count(host, 'down', piece);
                  if (!res.destroyed) {
                    res.write(chunk.subarray(start, start + piece));
                  }
                },
                onDrain: () => upRes.resume(),
              });
              if (queued > FLOW_BUFFER_BYTES) {
                upRes.pause();
              }
            });
            upRes.on('end', () => {
              ended = true;
              down.enqueue(downFlow, 0, {
                onDone: () => {
                  down.remove(downFlow);
                  if (!res.destroyed) {
                    res.end();
                  }
                },
              });
            });
            upRes.on('error', () => {
              if (!ended) {
                down.remove(downFlow);
                res.destroy();
              }
            });
          },
        );
        upstream.on('error', () => {
          down.remove(downFlow);
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }).end('회선 흉내 프록시: 원 서버에 닿지 못했어요');
          } else {
            res.destroy();
          }
        });
        upstream.end(bodyBuffer);
      };
      // 요청 머리말·몸통이 올리기 회선을 지나 원 서버에 닿은 뒤에 원 서버로 보낸다. 새 연결이면 DNS·TCP 왕복을 먼저.
      const transmit = () =>
        up.enqueue(upFlow, requestHeadBytes(req) + bodyBuffer.length, {
          onPiece: (piece) => count(host, 'up', piece),
          onDone: () => {
            up.remove(upFlow);
            send();
          },
        });
      if (isNewSocket && setupMs > 0) {
        setTimeout(transmit, setupMs);
      } else {
        transmit();
      }
    });
    res.on('close', () => {
      down.remove(downFlow);
      up.remove(upFlow);
    });
  });

  server.on('connect', (req, clientSocket, head) => {
    const [rawHost = '', rawPort = '443'] = (req.url ?? '').split(/:(?=\d+$)/u);
    const host = rawHost.replace(/^\[|\]$/gu, '');
    clientSocket.on('error', () => undefined);
    if (!hostAllowed(host, allowHosts)) {
      reject(host);
      clientSocket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    stats.connections += 1;
    hostStats(host).connections += 1;
    const downFlow = nextFlow();
    const upFlow = nextFlow();
    const origin = net.connect(Number(rawPort) || 443, host);
    sockets.add(origin);
    origin.on('close', () => sockets.delete(origin));
    let finished = false;
    let established = false;
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      down.remove(downFlow);
      up.remove(upFlow);
      setTimeout(() => {
        clientSocket.destroy();
        origin.destroy();
      }, half + 50);
    };
    origin.on('error', finish);
    clientSocket.on('error', finish);
    // 터널을 열기 전에 브라우저가 연결을 닫으면(요청 취소) 원 서버 연결도 닫는다
    clientSocket.on('close', () => {
      if (!established) {
        finish();
      }
    });
    origin.on('connect', () => {
      // DNS·TCP 왕복을 흉내 낸 뒤 터널을 연다
      setTimeout(() => {
        if (finished || clientSocket.destroyed) {
          finish();
          return;
        }
        established = true;
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        /** @param {LineLink} link @param {string} flow @param {Buffer} chunk @param {net.Socket} to @param {net.Socket} from @param {'down' | 'up'} direction */
        const forward = (link, flow, chunk, to, from, direction) => {
          const queued = link.enqueue(flow, chunk.length, {
            onPiece: (piece, start) => {
              count(host, direction, piece);
              if (!to.destroyed) {
                to.write(chunk.subarray(start, start + piece));
              }
            },
            onDrain: () => from.resume(),
          });
          if (queued > FLOW_BUFFER_BYTES) {
            from.pause();
          }
        };
        if (head && head.length > 0) {
          forward(up, upFlow, head, origin, clientSocket, 'up');
        }
        origin.on('data', (chunk) => forward(down, downFlow, chunk, clientSocket, origin, 'down'));
        clientSocket.on('data', (chunk) => forward(up, upFlow, chunk, origin, clientSocket, 'up'));
        // 한쪽이 끝나면 회선 안에 남은 조각을 모두 보낸 뒤 다른 쪽을 닫는다
        origin.on('end', () => down.enqueue(downFlow, 0, { onDone: () => !clientSocket.destroyed && clientSocket.end() }));
        clientSocket.on('end', () => up.enqueue(upFlow, 0, { onDone: () => !origin.destroyed && origin.end() }));
        origin.on('close', () => down.enqueue(downFlow, 0, { onDone: finish }));
        clientSocket.on('close', () => up.enqueue(upFlow, 0, { onDone: finish }));
      }, setupMs);
    });
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    // 브라우저가 연결을 끊으면(RST — 403 뒤·탭 닫기) ECONNRESET이 난다. 듣는 곳이 없으면 프로세스가 멈추므로 조용히 받는다(2026-09-28 실험에서 겪음).
    socket.on('error', () => undefined);
  });
  server.on('clientError', (_error, socket) => {
    socket.destroy();
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => resolve(undefined));
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    port,
    server: `http://127.0.0.1:${port}`,
    stats: () => structuredClone(stats),
    close: async () => {
      closed = true;
      clearInterval(timer);
      for (const socket of sockets) {
        socket.destroy();
      }
      upstreamAgent.destroy();
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    },
  };
}
