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

export interface BrokerTransportOptions extends MqttTransportOptions {
  /** 테스트가 가짜 클라이언트를 넣는 자리 */
  readonly connectFn?: MqttConnectFn;
}

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

/** 오류 값에서 학생에게 보여 줄 짧은 까닭을 뽑는다 */
export function reasonOf(error: unknown): string {
  if (error instanceof Error && error.message !== '') {
    return error.message;
  }
  if (typeof error === 'string' && error !== '') {
    return error;
  }
  return '까닭을 알 수 없음';
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
    return new Promise((resolve, reject) => {
      this.client.publish(topic, bytes, { qos: options.qos ?? 0, retain: options.retain ?? false }, (error) => {
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

/**
 * 중계 서버에 연결한다. 연결될 때까지 기다렸다가 통로를 돌려주고, 실패하면 `MqttConnectError`(한국어)를 던진다.
 * 처음 연결에 실패하면 클라이언트를 닫아 뒤에서 몰래 다시 붙지 않게 한다(학생이 "연결 안 됨"을 보고 탭 통로로 바꾸게).
 */
export async function openBrokerTransport(options: BrokerTransportOptions): Promise<MqttTransport> {
  if (options.connectFn === undefined && !isBrokerAvailable()) {
    throw new MqttConnectError(mqttText.noWebSocket());
  }
  const url = requireBrokerUrl(options.url ?? '');
  const timeoutMs = options.connectTimeoutMs ?? 8000;
  const reconnectLimit = options.reconnectLimit ?? 5;
  const clientOptions: Record<string, unknown> = {
    clientId: options.clientId ?? makeClientId('apc'),
    protocolVersion: 4,
    clean: true,
    keepalive: 30,
    reconnectPeriod: 3000,
    connectTimeout: timeoutMs,
    resubscribe: true,
    queueQoSZero: false,
  };
  const client = options.connectFn ? options.connectFn(url, clientOptions) : await defaultConnect(url, clientOptions);
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
      reject(new MqttConnectError(mqttText.connectFailed(url, `${Math.round(timeoutMs / 1000)}초 동안 답이 없음`)));
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
      reject(new MqttConnectError(mqttText.connectFailed(url, reasonOf(error))));
    }) as unknown as (...args: never[]) => void);
  });
}
