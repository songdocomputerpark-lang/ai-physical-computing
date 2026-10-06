/**
 * 공개 중계 서버(브로커) 통로 — MQTT.js 5.15.2를 WebSocket(wss://)으로 쓴다(PLAN §7.3·§7.4, P4-06).
 *
 * 확인한 것(설치된 패키지의 공식 타입 선언 `node_modules/mqtt/build/lib/client.d.ts`, 2026-09-18)
 * - `mqtt.connect(url, options)` → `MqttClient`. 옵션 `clientId`·`clean`·`keepalive`·`reconnectPeriod`·`connectTimeout`·
 *   `protocolVersion`·`resubscribe`·`queueQoSZero`.
 * - 이벤트 `connect`·`message(topic, payload, packet)`·`error`·`close`·`reconnect`·`offline`.
 * - `publish(topic, message, opts, cb)`·`subscribe(topic, opts, cb)`·`end(force, opts, cb)`.
 * 브라우저는 `package.json` exports의 `browser` 조건으로 미리 묶인 한 파일(`dist/mqtt.esm.js`)을 받는다.
 *
 * 규칙
 * - QoS 0, retain 끔(PLAN §7.4). 보관되는 값이 없어야 다음 반 학생이 지난 시간 메시지를 보지 않는다.
 * - 다시 연결은 `reconnectLimit`(기본 5)번까지. 넘으면 닫고 "탭 통로로 바꿔요" 안내(§7.4 "끊김").
 * - `clientId`에 개인정보를 넣지 않는다(무작위 꼬리표만 — PLAN §10).
 * - MQTT.js는 **처음 필요할 때** import한다(`await import('mqtt')`) — 실습실을 열기만 한 학생은 받지 않는다.
 */
import { mqttText, MqttConnectError, MqttError } from './messages.ts';
import { requireBrokerUrl } from './brokers.ts';
import { MqttEmitter, makeClientId, type MqttPublishOptions, type MqttTransport, type MqttTransportEvents, type MqttTransportOptions } from './transport.ts';

/** MQTT.js 클라이언트에서 우리가 쓰는 부분만(테스트가 가짜를 넣을 수 있게 우리 말로 적어 둔다) */
export interface MqttClientLike {
  connected?: boolean;
  on(event: string, listener: (...args: never[]) => void): unknown;
  publish(topic: string, message: Uint8Array | string, options: { qos: 0 | 1 | 2; retain: boolean }, callback: (error?: Error | null) => void): unknown;
  subscribe(topic: string, options: { qos: 0 | 1 | 2 }, callback: (error?: Error | null) => void): unknown;
  end(force?: boolean, options?: unknown, callback?: () => void): unknown;
}

/** 주소·옵션으로 클라이언트를 만드는 함수(기본은 MQTT.js) */
export type MqttConnectFn = (url: string, options: Record<string, unknown>) => MqttClientLike;

/** 브라우저 WebSocket에서 우리가 보는 부분(열림·닫힘 — 테스트가 가짜를 넣는다) */
export interface WebSocketLike {
  addEventListener(type: 'open' | 'close', listener: () => void): void;
}

/** WebSocket을 만드는 함수(기본은 브라우저 WebSocket — MQTT.js 선택 `createWebsocket`으로 넘긴다) */
export type WebSocketFactory = (url: string, protocols: string[]) => WebSocketLike;

export interface BrokerTransportOptions extends MqttTransportOptions {
  /** 테스트가 가짜 클라이언트를 넣는 자리 */
  readonly connectFn?: MqttConnectFn;
  /** 테스트가 가짜 WebSocket을 넣는 자리(없으면 브라우저 WebSocket) */
  readonly socketFactory?: WebSocketFactory;
}

/** MQTT.js connectTimeout을 우리 연결 타이머보다 이만큼 길게 둔다(밀리초 — openBrokerTransport) */
export const CONNECT_TIMEOUT_MARGIN_MS = 2000;

/**
 * 연결 실패 까닭(짧은 한국어 — 연결 안내 한 줄의 괄호 안에 들어간다). 같은 상황에는 같은 낱말을 쓴다(README 9.7) —
 * MQTT.js 영어 문구를 바꾼 까닭(KNOWN_REASONS)과 우리가 WebSocket을 지켜보고 고른 까닭(openBrokerTransport)이 이 값을 함께 쓴다.
 */
export const CONNECT_REASONS = Object.freeze({
  /** WebSocket은 열렸는데(서버에 닿았는데) MQTT 연결 확인(CONNACK) 전에 서버 쪽에서 닫았다 */
  serverClosed: '서버가 연결을 닫음',
  /** WebSocket이 열리지도 못했다(주소·포트가 틀렸거나, 학교망이 막았거나, 서버가 꺼짐) */
  unreachable: '서버에 닿지 못함',
  /** 정해진 시간 동안 아무 답이 없었다(열린 채 MQTT 답이 없거나, 여는 중에 멈춰 열리지도 닫히지도 않음) */
  noAnswer: (seconds: number): string => `${seconds}초 동안 답이 없음`,
});

/** 브라우저에서 중계 서버 연결(WebSocket)을 쓸 수 있나 */
export function isBrokerAvailable(): boolean {
  return typeof (globalThis as { WebSocket?: unknown }).WebSocket === 'function';
}

async function defaultConnect(url: string, options: Record<string, unknown>): Promise<MqttClientLike> {
  const loaded = (await import('mqtt')) as unknown as { connect?: MqttConnectFn; default?: { connect?: MqttConnectFn } };
  const connect = loaded.connect ?? loaded.default?.connect;
  if (typeof connect !== 'function') {
    throw new MqttError('no-library', 'MQTT 라이브러리를 불러오지 못했어요. 새로 고침한 뒤 다시 해 보세요.');
  }
  return connect(url, options);
}

/**
 * MQTT.js가 내는 영어 오류 문구 → 학생에게 보일 짧은 한국어 까닭(설치된 mqtt 5.15.2의 build/lib 원문에서 찾은 것, 2026-09-30).
 * 판 1.1.1 최종 점검: 연결 실패 안내에 영어 "(connack timeout)"가 그대로 보였다.
 */
const KNOWN_REASONS: readonly (readonly [RegExp, string])[] = Object.freeze([
  [/^connack timeout$/iu, '서버가 답하지 않음'],
  [/^WebSocket error$/iu, CONNECT_REASONS.unreachable],
  [/^Connection refused\b/iu, '서버가 연결을 거절함'],
  [/^Connection closed$/iu, CONNECT_REASONS.serverClosed],
  [/^Keepalive timeout$/iu, '서버와 한동안 소식이 끊김'],
  [/^No connection to broker$/iu, '서버와 이어지지 않음'],
  [/^client disconnecting$/iu, '연결을 끝내는 중'],
] as const);

/** 한글이 든 글(사이트가 만든 한국어 까닭)인가 */
const HANGUL = /[가-힣]/u;

/**
 * 오류 값에서 학생에게 보여 줄 짧은 한국어 까닭을 뽑는다. 알려진 MQTT.js 문구는 한국어로 바꾸고, 사이트가 만든 한국어 글은 그대로,
 * 모르는 영어 글은 "까닭을 알 수 없음"으로 한다(학생 화면에 영어 문구가 새지 않게).
 */
export function reasonOf(error: unknown): string {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const trimmed = text.trim();
  if (trimmed === '') {
    return '까닭을 알 수 없음';
  }
  for (const [pattern, korean] of KNOWN_REASONS) {
    if (pattern.test(trimmed)) {
      return korean;
    }
  }
  return HANGUL.test(trimmed) ? trimmed : '까닭을 알 수 없음';
}

class BrokerTransport implements MqttTransport {
  readonly via = 'broker' as const;
  readonly where: string;
  private readonly emitter = new MqttEmitter();
  private readonly client: MqttClientLike;
  private readonly reconnectLimit: number;
  private reconnects = 0;
  private open = true;
  private ready = false;

  constructor(client: MqttClientLike, url: string, reconnectLimit: number, alreadyConnected = true) {
    this.client = client;
    this.where = url;
    this.reconnectLimit = reconnectLimit;
    // 이 통로는 'connect'가 온 **뒤에** 만들어진다(openBrokerTransport가 연결을 기다린다) — 그 한 번을 여기서 이어받는다.
    this.ready = alreadyConnected;
    client.on('message', ((topic: string, payload: Uint8Array, packet?: { retain?: boolean }) => {
      this.emitter.emit('message', { topic, bytes: Uint8Array.from(payload), retain: packet?.retain === true });
    }) as unknown as (...args: never[]) => void);
    client.on('connect', (() => {
      this.ready = true;
      this.reconnects = 0;
      this.emitter.emit('connect');
    }) as unknown as (...args: never[]) => void);
    client.on('reconnect', (() => {
      this.reconnects += 1;
      if (this.reconnects > this.reconnectLimit) {
        this.emitter.emit('notice', mqttText.reconnectGaveUp(this.reconnectLimit));
        this.close(mqttText.reconnectGaveUp(this.reconnectLimit));
        return;
      }
      this.ready = false;
      this.emitter.emit('reconnect', this.reconnects);
      this.emitter.emit('notice', mqttText.reconnecting(this.reconnects, this.reconnectLimit));
    }) as unknown as (...args: never[]) => void);
    client.on('error', ((error: unknown) => {
      this.emitter.emit('notice', mqttText.connectFailed(this.where, reasonOf(error)));
    }) as unknown as (...args: never[]) => void);
    client.on('close', (() => {
      this.ready = false;
    }) as unknown as (...args: never[]) => void);
  }

  get connected(): boolean {
    return this.open && (this.ready || this.client.connected === true);
  }

  publish(topic: string, bytes: Uint8Array, options: MqttPublishOptions = {}): Promise<void> {
    if (!this.open) {
      return Promise.reject(new MqttError('closed', mqttText.notConnected()));
    }
    // 부른 쪽이 무엇을 주든 공개 중계 서버에는 늘 QoS 0·retain 끔으로 보낸다(PLAN §7.4 — 값이 서버에 남아 다음 사람에게 가지 않게).
    // 2026-09-25 Phase 4 검토 반영: 전에는 학생 코드의 retain=True가 그대로 서버에 나갔다(PUBLISH 머리 0x31).
    void options;
    return new Promise((resolve, reject) => {
      this.client.publish(topic, bytes, { qos: 0, retain: false }, (error) => {
        if (error) {
          reject(new MqttError('publish-failed', mqttText.connectFailed(this.where, reasonOf(error))));
          return;
        }
        resolve();
      });
    });
  }

  subscribe(filter: string): Promise<void> {
    if (!this.open) {
      return Promise.reject(new MqttError('closed', mqttText.notConnected()));
    }
    return new Promise((resolve, reject) => {
      this.client.subscribe(filter, { qos: 0 }, (error) => {
        if (error) {
          reject(new MqttError('subscribe-failed', mqttText.connectFailed(this.where, reasonOf(error))));
          return;
        }
        resolve();
      });
    });
  }

  on<K extends keyof MqttTransportEvents>(event: K, listener: MqttTransportEvents[K]): () => void {
    return this.emitter.on(event, listener);
  }

  close(reason = '중계 서버 연결을 닫았어요.'): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.ready = false;
    try {
      this.client.end(true);
    } catch {
      // 이미 닫힌 클라이언트
    }
    this.emitter.emit('close', reason);
    this.emitter.clear();
  }
}

/** 연결을 기다리는 동안 WebSocket이 어떻게 됐는지(openBrokerTransport — 미해결 221) */
export interface SocketWatch {
  /** 열린 뒤(서버에 닿은 뒤) 닫힌 소켓 수 */
  closedAfterOpen: number;
  /** 열리지도 못하고 끝난 소켓 수(만들 때 막힘 포함) */
  failedBeforeOpen: number;
}

/**
 * 연결 확인(CONNACK)을 기다리다 시간이 다 됐을 때의 까닭을 고른다(미해결 221). 서버에 닿았다가 닫혔으면 "서버가 연결을 닫음",
 * 열리지도 못했으면 "서버에 닿지 못함", 아무 일도 없었으면 "N초 동안 답이 없음". 둘 다 있었으면 서버에 닿았던 쪽이 더 많은 것을 알려 준다.
 */
export function timeoutReasonOf(watch: Readonly<SocketWatch>, timeoutMs: number): string {
  if (watch.closedAfterOpen > 0) {
    return CONNECT_REASONS.serverClosed;
  }
  if (watch.failedBeforeOpen > 0) {
    return CONNECT_REASONS.unreachable;
  }
  return CONNECT_REASONS.noAnswer(Math.round(timeoutMs / 1000));
}

/** 브라우저 WebSocket으로 소켓을 만드는 함수(없으면 null — 그때는 MQTT.js가 스스로 만든다) */
function browserSocketFactory(): WebSocketFactory | null {
  const ctor = (globalThis as { WebSocket?: new (url: string, protocols: string[]) => WebSocketLike }).WebSocket;
  return typeof ctor === 'function' ? (url, protocols) => new ctor(url, protocols) : null;
}

/**
 * 중계 서버에 연결한다. 연결될 때까지 기다렸다가 통로를 돌려주고, 실패하면 `MqttConnectError`(한국어)를 던진다.
 * 처음 연결에 실패하면 클라이언트를 닫아 뒤에서 몰래 다시 붙지 않게 한다(학생이 "연결 안 됨"을 보고 탭 통로로 바꾸게).
 *
 * 실패 까닭 고르기(미해결 221 — 판 1.1.5 뒤): MQTT.js 5.15.2는 브라우저 WebSocket 오류를 'error'로 내지 않는다(code가 없는 오류는
 * 삼킨다 — `node_modules/mqtt/build/lib/client.js`의 `streamErrorHandler`). 소켓이 닫히면 'close' 뒤 `reconnectPeriod`(3초)마다 다시
 * 붙으므로, 받자마자 닫는 서버도 닿지 못하는 서버도 우리 타이머가 끝날 때 "N초 동안 답이 없음"이 됐다. 그래서 MQTT.js의 문서화된 선택
 * `createWebsocket`(README "Customize Websockets with createWebsocket")으로 **우리가 WebSocket을 만들어** 열렸는지·닫혔는지를 보고
 * 까닭을 고른다(`timeoutReasonOf`). 기다리는 시간(timeoutMs)과 다시 붙는 동작은 그대로다 — 한 번 닫혔어도 다음 시도에 붙을 수 있다.
 */
export async function openBrokerTransport(options: BrokerTransportOptions): Promise<MqttTransport> {
  if (options.connectFn === undefined && !isBrokerAvailable()) {
    throw new MqttConnectError(mqttText.noWebSocket());
  }
  const url = requireBrokerUrl(options.url ?? '');
  const timeoutMs = options.connectTimeoutMs ?? 8000;
  const reconnectLimit = options.reconnectLimit ?? 5;
  const watch: SocketWatch = { closedAfterOpen: 0, failedBeforeOpen: 0 };
  const makeSocket = options.socketFactory ?? browserSocketFactory();
  const clientOptions: Record<string, unknown> = {
    clientId: options.clientId ?? makeClientId('apc'),
    protocolVersion: 4,
    clean: true,
    keepalive: 30,
    reconnectPeriod: 3000,
    // 아래 우리 타이머(timeoutMs — "N초 동안 답이 없음")가 먼저 끝나게 MQTT.js 쪽은 조금 길게 둔다. 같으면 MQTT.js의
    // 'connack timeout'이 먼저 올 때가 있어 까닭이 들쭉날쭉했다(판 1.1.1 최종 점검).
    connectTimeout: timeoutMs + CONNECT_TIMEOUT_MARGIN_MS,
    resubscribe: true,
    queueQoSZero: false,
  };
  if (makeSocket !== null) {
    // MQTT.js가 소켓을 만들 때마다(처음과 다시 붙을 때) 부른다 — 하위 규약(['mqtt'])은 MQTT.js가 준 그대로, binaryType은 MQTT.js가 정한다.
    clientOptions['createWebsocket'] = (socketUrl: string, protocols: string[]): WebSocketLike => {
      let socket: WebSocketLike;
      try {
        socket = makeSocket(socketUrl, protocols);
      } catch (error) {
        // 만들 때부터 막혔다(브라우저가 막는 포트 등) — 열리지도 못한 소켓으로 센다
        watch.failedBeforeOpen += 1;
        throw error;
      }
      let opened = false;
      socket.addEventListener('open', () => {
        opened = true;
      });
      socket.addEventListener('close', () => {
        if (opened) {
          watch.closedAfterOpen += 1;
        } else {
          watch.failedBeforeOpen += 1;
        }
      });
      return socket;
    };
  }
  let client: MqttClientLike;
  try {
    client = options.connectFn ? options.connectFn(url, clientOptions) : await defaultConnect(url, clientOptions);
  } catch (error) {
    if (watch.failedBeforeOpen > 0) {
      // 첫 소켓을 만들다 막혀 MQTT.js가 클라이언트를 돌려주지 못했다(다시 붙는 타이머도 없다)
      const reason = CONNECT_REASONS.unreachable;
      throw new MqttConnectError(mqttText.connectFailed(url, reason), reason);
    }
    throw error;
  }
  return new Promise<MqttTransport>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        client.end(true);
      } catch {
        // 무시
      }
      const reason = timeoutReasonOf(watch, timeoutMs);
      reject(new MqttConnectError(mqttText.connectFailed(url, reason), reason));
    }, timeoutMs);
    client.on('connect', ((): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(new BrokerTransport(client, url, reconnectLimit));
    }) as unknown as (...args: never[]) => void);
    client.on('error', ((error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        client.end(true);
      } catch {
        // 무시
      }
      const reason = reasonOf(error);
      reject(new MqttConnectError(mqttText.connectFailed(url, reason), reason));
    }) as unknown as (...args: never[]) => void);
  });
}
