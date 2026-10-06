// 공개 중계 서버 통로(MQTT.js 5.15.2를 감싼 부분) 단위 테스트 — 구역 D(P4-06).
// 진짜 브로커에 붙지 않고 **MQTT.js와 같은 모양의 가짜 클라이언트**로 규칙을 확인한다
// (공식 타입 선언 node_modules/mqtt/build/lib/client.d.ts의 이벤트·함수 이름을 그대로 쓴다).
import { describe, expect, it, vi } from 'vitest';
import {
  CONNECT_REASONS,
  MqttConnectError,
  openBrokerTransport,
  reasonOf,
  timeoutReasonOf,
  toBytes,
  type MqttClientLike,
  type MqttIncoming,
  type WebSocketLike,
} from '../../../src/lab/mqtt/index.ts';
import { CONNECT_TIMEOUT_MARGIN_MS } from '../../../src/lab/mqtt/broker-transport.ts';

const URL_OK = 'wss://broker.example:8084/mqtt';

/** MQTT.js 클라이언트 흉내 */
class FakeClient implements MqttClientLike {
  connected = false;
  readonly published: Array<{ topic: string; message: string; qos: number; retain: boolean }> = [];
  readonly subscribed: string[] = [];
  ended = false;
  publishError: Error | null = null;
  subscribeError: Error | null = null;
  private readonly handlers = new Map<string, Array<(...args: never[]) => void>>();

  on(event: string, listener: (...args: never[]) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(listener);
    this.handlers.set(event, list);
    return this;
  }

  fire(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.handlers.get(event) ?? [])]) {
      (listener as (...values: unknown[]) => void)(...args);
    }
  }

  publish(topic: string, message: Uint8Array | string, options: { qos: 0 | 1 | 2; retain: boolean }, callback: (error?: Error | null) => void): this {
    if (this.publishError) {
      callback(this.publishError);
      return this;
    }
    this.published.push({
      topic,
      message: typeof message === 'string' ? message : new TextDecoder().decode(message),
      qos: options.qos,
      retain: options.retain,
    });
    callback(null);
    return this;
  }

  subscribe(topic: string, _options: { qos: 0 | 1 | 2 }, callback: (error?: Error | null) => void): this {
    if (this.subscribeError) {
      callback(this.subscribeError);
      return this;
    }
    this.subscribed.push(topic);
    callback(null);
    return this;
  }

  end(): this {
    this.ended = true;
    this.connected = false;
    return this;
  }
}

/** 연결이 바로 되는 가짜 클라이언트를 내주는 함수 */
function connectFnOf(client: FakeClient, behaviour: 'connect' | 'error' | 'silent' = 'connect', error = new Error('ECONNREFUSED')) {
  return (_url: string, _options: Record<string, unknown>): MqttClientLike => {
    setTimeout(() => {
      if (behaviour === 'connect') {
        client.connected = true;
        client.fire('connect');
      } else if (behaviour === 'error') {
        client.fire('error', error);
      }
    }, 0);
    return client;
  };
}

describe('연결', () => {
  it('connect 이벤트가 오면 통로가 열린다', async () => {
    const client = new FakeClient();
    const transport = await openBrokerTransport({ prefix: '7kq2m9xd4hpt', url: URL_OK, connectFn: connectFnOf(client) });
    expect(transport.via).toBe('broker');
    expect(transport.where).toBe(URL_OK);
    expect(transport.connected).toBe(true);
  });

  it('error 이벤트가 오면 한국어 까닭과 함께 실패하고 클라이언트를 닫는다(모르는 영어 문구는 학생 화면에 내지 않는다)', async () => {
    const client = new FakeClient();
    await expect(openBrokerTransport({ prefix: '7kq2m9xd4hpt', url: URL_OK, connectFn: connectFnOf(client, 'error') })).rejects.toThrow(
      /연결하지 못했어요\(까닭을 알 수 없음\)/u,
    );
    expect(client.ended).toBe(true);
  });

  // 판 1.1.1 최종 점검: 연결 실패 안내에 MQTT.js의 영어 "(connack timeout)"이 그대로 보였다.
  it('MQTT.js의 알려진 영어 오류 문구는 짧은 한국어 까닭으로 바꾸고, 오류 값에 그 까닭을 싣는다', async () => {
    expect(reasonOf(new Error('connack timeout'))).toBe('서버가 답하지 않음');
    expect(reasonOf(new Error('WebSocket error'))).toBe('서버에 닿지 못함');
    expect(reasonOf(new Error('Connection refused: Not authorized'))).toBe('서버가 연결을 거절함');
    expect(reasonOf(new Error('Connection closed'))).toBe('서버가 연결을 닫음');
    expect(reasonOf(new Error('Keepalive timeout'))).toBe('서버와 한동안 소식이 끊김');
    expect(reasonOf(new Error('something odd'))).toBe('까닭을 알 수 없음');
    expect(reasonOf(new Error('연결 끊김'))).toBe('연결 끊김');
    expect(reasonOf(undefined)).toBe('까닭을 알 수 없음');

    const client = new FakeClient();
    const failed = await openBrokerTransport({ prefix: '7kq2m9xd4hpt', url: URL_OK, connectFn: connectFnOf(client, 'error', new Error('connack timeout')) }).catch(
      (error: unknown) => error,
    );
    expect(failed).toBeInstanceOf(MqttConnectError);
    expect((failed as MqttConnectError).message).toContain('(서버가 답하지 않음)');
    expect((failed as MqttConnectError).message).not.toContain('connack');
    expect((failed as MqttConnectError).reason).toBe('서버가 답하지 않음');
  });

  it('MQTT.js의 연결 제한 시간은 우리 타이머보다 조금 길다(한국어 "N초 동안 답이 없음"이 먼저 나오게)', async () => {
    const client = new FakeClient();
    let seen: Record<string, unknown> = {};
    await openBrokerTransport({
      prefix: '7kq2m9xd4hpt',
      url: URL_OK,
      connectTimeoutMs: 8000,
      connectFn: (url, options) => {
        seen = options;
        return connectFnOf(client)(url, options);
      },
    });
    expect(seen.connectTimeout).toBe(8000 + CONNECT_TIMEOUT_MARGIN_MS);
    expect(CONNECT_TIMEOUT_MARGIN_MS).toBeGreaterThan(0);
  });

  it('답이 없으면 정해진 시간 뒤에 포기한다', async () => {
    vi.useFakeTimers();
    try {
      const client = new FakeClient();
      const promise = openBrokerTransport({ prefix: '7kq2m9xd4hpt', url: URL_OK, connectTimeoutMs: 1000, connectFn: connectFnOf(client, 'silent') });
      const assertion = expect(promise).rejects.toThrow(/1초 동안 답이 없음/u);
      await vi.advanceTimersByTimeAsync(1100);
      await assertion;
      expect(client.ended).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('주소가 wss://가 아니면 열기 전에 막는다', async () => {
    const client = new FakeClient();
    await expect(openBrokerTransport({ prefix: '7kq2m9xd4hpt', url: 'ws://broker.example:8083', connectFn: connectFnOf(client) })).rejects.toThrow(/wss:\/\//u);
  });
});

/** 브라우저 WebSocket 흉내 — 열림·닫힘만(우리가 보는 부분) */
class FakeSocket implements WebSocketLike {
  private readonly listeners = new Map<string, Array<() => void>>();

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {}

  addEventListener(type: 'open' | 'close', listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  emit(type: 'open' | 'close'): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener();
    }
  }
}

/**
 * MQTT.js 5.15.2가 브라우저에서 하는 대로 흉내 낸 연결 함수: `createWebsocket`(우리가 넘긴 선택)으로 소켓을 만들고, 소켓이 닫히면
 * 'error'는 내지 않고(브라우저 WebSocket 오류는 code가 없어 삼킨다 — build/lib/client.js streamErrorHandler) 'close' 뒤
 * reconnectPeriod(3초)마다 다시 붙는다. 클라이언트를 end()하면 그만 붙는다.
 */
function browserLikeConnect(client: FakeClient, server: 'close-after-open' | 'unreachable', sockets: FakeSocket[]) {
  return (url: string, options: Record<string, unknown>): MqttClientLike => {
    const create = options['createWebsocket'] as (socketUrl: string, protocols: string[]) => WebSocketLike;
    const attempt = (): void => {
      if (client.ended) {
        return;
      }
      const socket = create(url, ['mqtt']) as FakeSocket;
      sockets.push(socket);
      setTimeout(() => {
        if (server === 'close-after-open') {
          socket.emit('open');
        }
        socket.emit('close');
        client.fire('close');
        setTimeout(() => {
          if (!client.ended) {
            client.fire('reconnect');
            attempt();
          }
        }, 3000);
      }, 50);
    };
    attempt();
    return client;
  };
}

// 미해결 221(판 1.1.5 뒤): 받자마자 닫는 서버도, 닿지 못하는 서버도 까닭이 "8초 동안 답이 없음"이었다.
describe('연결 실패 까닭 고르기(미해결 221)', () => {
  it('서버가 WebSocket을 받자마자 닫으면 다시 붙어 보다가 "서버가 연결을 닫음"으로 알린다', async () => {
    vi.useFakeTimers();
    try {
      const client = new FakeClient();
      const sockets: FakeSocket[] = [];
      const promise = openBrokerTransport({
        prefix: '7kq2m9xd4hpt',
        url: URL_OK,
        connectTimeoutMs: 8000,
        connectFn: browserLikeConnect(client, 'close-after-open', sockets),
        socketFactory: (socketUrl, protocols) => new FakeSocket(socketUrl, protocols),
      });
      const failed = promise.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(8100);
      const error = await failed;
      expect(error).toBeInstanceOf(MqttConnectError);
      expect((error as MqttConnectError).reason).toBe(CONNECT_REASONS.serverClosed);
      expect((error as MqttConnectError).message).toContain('(서버가 연결을 닫음)');
      expect((error as MqttConnectError).message).not.toContain('답이 없음');
      // 기다리는 시간·다시 붙기는 그대로 — 8초 동안 0·3·6초에 세 번 붙어 봤다(한 번 닫혀도 다음 시도에 붙을 수 있다)
      expect(sockets).toHaveLength(3);
      expect(sockets[0]?.url).toBe(URL_OK);
      expect(sockets[0]?.protocols).toEqual(['mqtt']);
      expect(client.ended).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('WebSocket이 열리지도 못하면(주소·포트·학교망 차단) "서버에 닿지 못함"으로 알린다', async () => {
    vi.useFakeTimers();
    try {
      const client = new FakeClient();
      const sockets: FakeSocket[] = [];
      const promise = openBrokerTransport({
        prefix: '7kq2m9xd4hpt',
        url: URL_OK,
        connectTimeoutMs: 8000,
        connectFn: browserLikeConnect(client, 'unreachable', sockets),
        socketFactory: (socketUrl, protocols) => new FakeSocket(socketUrl, protocols),
      });
      const failed = promise.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(8100);
      const error = (await failed) as MqttConnectError;
      expect(error.reason).toBe(CONNECT_REASONS.unreachable);
      expect(error.message).toContain('(서버에 닿지 못함)');
    } finally {
      vi.useRealTimers();
    }
  });

  it('소켓이 열린 채 아무 답이 없으면 전처럼 "N초 동안 답이 없음"', async () => {
    vi.useFakeTimers();
    try {
      const client = new FakeClient();
      const sockets: FakeSocket[] = [];
      const promise = openBrokerTransport({
        prefix: '7kq2m9xd4hpt',
        url: URL_OK,
        connectTimeoutMs: 8000,
        connectFn: (url, options) => {
          const socket = (options['createWebsocket'] as (u: string, p: string[]) => WebSocketLike)(url, ['mqtt']) as FakeSocket;
          sockets.push(socket);
          setTimeout(() => socket.emit('open'), 50);
          return client;
        },
        socketFactory: (socketUrl, protocols) => new FakeSocket(socketUrl, protocols),
      });
      const failed = promise.catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(8100);
      expect(((await failed) as MqttConnectError).reason).toBe('8초 동안 답이 없음');
    } finally {
      vi.useRealTimers();
    }
  });

  it('첫 소켓을 만들다 막히면(브라우저가 막는 포트 등) 기다리지 않고 "서버에 닿지 못함"', async () => {
    const client = new FakeClient();
    const started = Date.now();
    const failed = await openBrokerTransport({
      prefix: '7kq2m9xd4hpt',
      url: URL_OK,
      connectTimeoutMs: 8000,
      connectFn: (url, options) => {
        (options['createWebsocket'] as (u: string, p: string[]) => WebSocketLike)(url, ['mqtt']);
        return client;
      },
      socketFactory: () => {
        throw new Error('SecurityError: The port 9 is not allowed.');
      },
    }).catch((error: unknown) => error);
    expect(failed).toBeInstanceOf(MqttConnectError);
    expect((failed as MqttConnectError).reason).toBe(CONNECT_REASONS.unreachable);
    expect((failed as MqttConnectError).message).not.toContain('port');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('붙으면 그 뒤 소켓 일은 연결 결과를 바꾸지 않는다(createWebsocket은 다시 붙을 때도 쓰인다)', async () => {
    const client = new FakeClient();
    const transport = await openBrokerTransport({
      prefix: '7kq2m9xd4hpt',
      url: URL_OK,
      connectFn: (url, options) => {
        const socket = (options['createWebsocket'] as (u: string, p: string[]) => WebSocketLike)(url, ['mqtt']) as FakeSocket;
        setTimeout(() => {
          socket.emit('open');
          client.connected = true;
          client.fire('connect');
          socket.emit('close');
        }, 0);
        return client;
      },
      socketFactory: (socketUrl, protocols) => new FakeSocket(socketUrl, protocols),
    });
    expect(transport.via).toBe('broker');
  });

  it('까닭 고르기는 서버에 닿았던 일 → 닿지 못한 일 → 시간 순서', () => {
    expect(timeoutReasonOf({ closedAfterOpen: 1, failedBeforeOpen: 2 }, 8000)).toBe('서버가 연결을 닫음');
    expect(timeoutReasonOf({ closedAfterOpen: 0, failedBeforeOpen: 1 }, 8000)).toBe('서버에 닿지 못함');
    expect(timeoutReasonOf({ closedAfterOpen: 0, failedBeforeOpen: 0 }, 8000)).toBe('8초 동안 답이 없음');
    expect(timeoutReasonOf({ closedAfterOpen: 0, failedBeforeOpen: 0 }, 1000)).toBe('1초 동안 답이 없음');
    // MQTT.js 영어 문구를 바꾼 까닭과 같은 낱말이다(같은 상황에 두 문구를 만들지 않는다 — README 9.7)
    expect(reasonOf(new Error('Connection closed'))).toBe(CONNECT_REASONS.serverClosed);
    expect(reasonOf(new Error('WebSocket error'))).toBe(CONNECT_REASONS.unreachable);
  });
});

describe('보내기·받기', () => {
  it('QoS 0, retain 끔으로 보낸다(PLAN §7.4)', async () => {
    const client = new FakeClient();
    const transport = await openBrokerTransport({ prefix: '7kq2m9xd4hpt', url: URL_OK, connectFn: connectFnOf(client) });
    await transport.publish('7kq2m9xd4hpt/led', toBytes('on'));
    expect(client.published).toEqual([{ topic: '7kq2m9xd4hpt/led', message: 'on', qos: 0, retain: false }]);
  });

  it('부른 쪽이 retain·QoS를 달라고 해도 공개 중계 서버에는 retain 끔·QoS 0으로 보낸다(2026-09-25 검토 — 값이 서버에 남지 않게)', async () => {
    const client = new FakeClient();
    const transport = await openBrokerTransport({ prefix: '7kq2m9xd4hpt', url: URL_OK, connectFn: connectFnOf(client) });
    await transport.publish('7kq2m9xd4hpt/temp', toBytes('42'), { retain: true, qos: 1 });
    expect(client.published).toEqual([{ topic: '7kq2m9xd4hpt/temp', message: '42', qos: 0, retain: false }]);
  });

  it('브로커가 보낸 메시지를 바이트로 올려 준다', async () => {
    const client = new FakeClient();
    const transport = await openBrokerTransport({ prefix: '7kq2m9xd4hpt', url: URL_OK, connectFn: connectFnOf(client) });
    const got: MqttIncoming[] = [];
    transport.on('message', (message) => got.push(message));
    await transport.subscribe('7kq2m9xd4hpt/led');

    client.fire('message', '7kq2m9xd4hpt/led', toBytes('on'), { retain: false });

    expect(client.subscribed).toEqual(['7kq2m9xd4hpt/led']);
    expect(got).toHaveLength(1);
    expect(new TextDecoder().decode(got[0]?.bytes)).toBe('on');
  });

  it('보내기·받기로 하기가 실패하면 한국어 오류', async () => {
    const client = new FakeClient();
    const transport = await openBrokerTransport({ prefix: '7kq2m9xd4hpt', url: URL_OK, connectFn: connectFnOf(client) });
    client.publishError = new Error('연결 끊김');
    await expect(transport.publish('7kq2m9xd4hpt/led', toBytes('on'))).rejects.toThrow(/연결하지 못했어요/u);
    client.publishError = null;
    client.subscribeError = new Error('거부');
    await expect(transport.subscribe('7kq2m9xd4hpt/led')).rejects.toThrow(/연결하지 못했어요/u);
  });
});

describe('다시 연결(PLAN §7.4 — 5번까지)', () => {
  it('다시 연결할 때마다 알리고, 한도를 넘으면 닫으며 탭 통로를 안내한다', async () => {
    const client = new FakeClient();
    const transport = await openBrokerTransport({ prefix: '7kq2m9xd4hpt', url: URL_OK, reconnectLimit: 2, connectFn: connectFnOf(client) });
    const notices: string[] = [];
    const closes: string[] = [];
    transport.on('notice', (text) => notices.push(text));
    transport.on('close', (reason) => closes.push(reason));

    client.fire('reconnect');
    client.fire('reconnect');
    expect(notices.filter((text) => text.includes('다시 연결해 보는 중'))).toHaveLength(2);
    expect(closes).toHaveLength(0);

    client.fire('reconnect');

    expect(notices.some((text) => text.includes('같은 컴퓨터 탭'))).toBe(true);
    expect(closes).toHaveLength(1);
    expect(transport.connected).toBe(false);
    expect(client.ended).toBe(true);
  });
});

// 판 1.2.1(판 1.2.0 적대적 검토 E11): 까닭은 셋으로 갈렸는데 뒷글이 모두 "학교망이 막았거나 서버가 쉬는 중일 수 있어요"라서 차이가 남지 않았다.
describe('연결 실패 까닭마다 뜻과 할 일 한 문장(reasonHint)', () => {
  it('닿지 못함은 학교망·주소, 닫음·거절은 다른 서버, 답 없음은 잠시 뒤, 모르는 까닭은 예전 글', async () => {
    const { reasonHint, mqttText } = await import('../../../src/lab/mqtt/messages.ts');
    expect(reasonHint(CONNECT_REASONS.unreachable)).toBe('학교망이 막았거나 주소가 틀렸을 수 있어요.');
    expect(reasonHint(CONNECT_REASONS.serverClosed)).toBe('서버까지는 닿았는데 서버가 연결을 받아 주지 않았어요 — 다른 중계 서버를 골라 봐요.');
    expect(reasonHint('서버가 연결을 거절함')).toBe(reasonHint(CONNECT_REASONS.serverClosed));
    expect(reasonHint(CONNECT_REASONS.noAnswer(8))).toBe('서버가 느리거나 쉬는 중일 수 있어요 — 잠시 뒤 다시 해 봐요.');
    expect(reasonHint('서버가 답하지 않음')).toBe(reasonHint(CONNECT_REASONS.noAnswer(8)));
    expect(reasonHint(null)).toBe('학교망이 막았거나 서버가 쉬는 중일 수 있어요.');
    expect(reasonHint('까닭을 알 수 없음')).toBe('학교망이 막았거나 서버가 쉬는 중일 수 있어요.');
    // 안내 한 줄에 그대로 들어간다(연결 실패·공개 중계 서버만 고른 실패)
    expect(mqttText.connectFailed(URL_OK, CONNECT_REASONS.serverClosed)).toBe(
      `중계 서버 ${URL_OK}에 연결하지 못했어요(서버가 연결을 닫음). 서버까지는 닿았는데 서버가 연결을 받아 주지 않았어요 — 다른 중계 서버를 골라 봐요.`,
    );
    expect(mqttText.brokerFailed(URL_OK, CONNECT_REASONS.unreachable)).toContain('(서버에 닿지 못함). 학교망이 막았거나 주소가 틀렸을 수 있어요. 같은 컴퓨터에서');
  });
});
