// 공개 중계 서버 통로(MQTT.js 5.15.2를 감싼 부분) 단위 테스트 — 구역 D(P4-06).
// 진짜 브로커에 붙지 않고 **MQTT.js와 같은 모양의 가짜 클라이언트**로 규칙을 확인한다
// (공식 타입 선언 node_modules/mqtt/build/lib/client.d.ts의 이벤트·함수 이름을 그대로 쓴다).
import { describe, expect, it, vi } from 'vitest';
import { openBrokerTransport, toBytes, type MqttClientLike, type MqttIncoming } from '../../../src/lab/mqtt/index.ts';

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

  it('error 이벤트가 오면 한국어 까닭과 함께 실패하고 클라이언트를 닫는다', async () => {
    const client = new FakeClient();
    await expect(openBrokerTransport({ prefix: '7kq2m9xd4hpt', url: URL_OK, connectFn: connectFnOf(client, 'error') })).rejects.toThrow(
      /연결하지 못했어요.*ECONNREFUSED/su,
    );
    expect(client.ended).toBe(true);
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
