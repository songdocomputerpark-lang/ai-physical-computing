/**
 * 같은 컴퓨터 탭 MQTT 통로(PD-17) — 중계 서버 없이 **같은 브라우저·같은 출처**의 탭끼리 토픽으로 주고받는다.
 *
 * 왜 필요한가: 학교망이 WebSocket 포트를 막아도 통신 실습이 끝까지 되어야 한다(SPEC §2 "하드웨어 없어도 100%"와 같은 뜻).
 * 인터넷이 없어도 되고, 주고받는 내용이 이 컴퓨터 밖으로 한 바이트도 나가지 않는다.
 *
 * 채널 이름 = `ai-physical-computing:mqtt:<접두어>`(`src/lib/storage.ts`의 이름 규칙과 같은 머리말).
 * 브릿지의 탭 통로(`ai-physical-computing:bridge:<접두어>`)와 **다른 채널**이다 — 그쪽은 "글자 한 줄"을 나르고
 * 이쪽은 "토픽 + 바이트"를 나른다. 이름이 겹치지 않아 한 탭에서 둘을 함께 써도 섞이지 않는다.
 *
 * 중계 서버와 같게 맞춘 것
 * - 보낸 탭도 자기가 받기로 한 토픽이면 **자기 메시지를 받는다**(MQTT 3.1.1은 noLocal이 없다). 그래서 한 탭에서
 *   publish와 subscribe를 함께 써 보는 첫 실습이 브로커와 같은 결과를 낸다.
 * - 와일드카드(`+`·`#`)는 `topics.ts`의 `topicMatches`로 여기서 직접 고른다.
 * - retain은 쓰지 않는다(PLAN §7.4 "retain 끔").
 */
import { storageKey } from '../../lib/storage.ts';
import { mqttText, MqttError } from './messages.ts';
import { topicMatches } from './topics.ts';
import { MqttEmitter, makeClientId, type MqttIncoming, type MqttPublishOptions, type MqttTransport, type MqttTransportEvents, type MqttTransportOptions } from './transport.ts';

/** 진짜 BroadcastChannel과 테스트용 가짜가 함께 따르는 모양(브릿지의 것과 같은 모양) */
export interface BroadcastChannelLike {
  postMessage(data: unknown): void;
  close(): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

/** 탭 사이로 오가는 봉투 */
export interface TabMqttEnvelope {
  readonly v: 1;
  readonly type: 'mqtt.publish';
  readonly topic: string;
  /** 바이트(구조화 복제로 그대로 간다) */
  readonly bytes: Uint8Array;
  readonly from: string;
  readonly at: number;
}

/** 채널 이름 머리말 */
export const TAB_MQTT_NAME = 'mqtt';

/** 접두어로 채널 이름을 만든다 */
export function tabMqttChannelName(prefix: string): string {
  return storageKey(`${TAB_MQTT_NAME}:${prefix}`);
}

/** 이 브라우저에서 탭 통로를 쓸 수 있나 */
export function isTabMqttAvailable(): boolean {
  return typeof (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel === 'function';
}

function defaultFactory(name: string): BroadcastChannelLike {
  const ctor = (globalThis as { BroadcastChannel?: new (name: string) => unknown }).BroadcastChannel;
  if (ctor === undefined) {
    throw new MqttError('no-broadcast-channel', mqttText.noBroadcastChannel());
  }
  return new ctor(name) as unknown as BroadcastChannelLike;
}

/** 받은 봉투가 우리 것인지 보고 다듬는다(깨진 봉투는 버린다 — 밖에서 온 값은 믿지 않는다) */
export function parseTabEnvelope(data: unknown): TabMqttEnvelope | null {
  if (data === null || typeof data !== 'object') {
    return null;
  }
  const value = data as Partial<TabMqttEnvelope>;
  if (value.v !== 1 || value.type !== 'mqtt.publish' || typeof value.topic !== 'string' || value.topic === '') {
    return null;
  }
  const bytes = value.bytes;
  if (!(bytes instanceof Uint8Array)) {
    return null;
  }
  return {
    v: 1,
    type: 'mqtt.publish',
    topic: value.topic,
    bytes,
    from: typeof value.from === 'string' ? value.from : '',
    at: typeof value.at === 'number' ? value.at : Date.now(),
  };
}

export interface TabMqttTransportOptions extends MqttTransportOptions {
  /** BroadcastChannel을 만드는 함수(테스트가 가짜를 넣는다) */
  readonly factory?: (name: string) => BroadcastChannelLike;
  /** 자기 메시지를 스스로 받을 때 한 박자 늦추는 함수(테스트가 즉시 실행으로 바꾼다) */
  readonly defer?: (run: () => void) => void;
}

class TabMqttTransport implements MqttTransport {
  readonly via = 'tab' as const;
  readonly where = '이 컴퓨터의 다른 탭';
  private readonly emitter = new MqttEmitter();
  private readonly filters = new Set<string>();
  private readonly channel: BroadcastChannelLike;
  private readonly clientId: string;
  private readonly defer: (run: () => void) => void;
  private open = true;

  constructor(options: TabMqttTransportOptions) {
    const factory = options.factory ?? defaultFactory;
    this.clientId = options.clientId ?? makeClientId('tab');
    this.defer = options.defer ?? ((run) => setTimeout(run, 0));
    this.channel = factory(tabMqttChannelName(options.prefix));
    this.channel.addEventListener('message', this.onMessage);
  }

  get connected(): boolean {
    return this.open;
  }

  private readonly onMessage = (event: { data: unknown }): void => {
    const envelope = parseTabEnvelope(event.data);
    if (envelope === null || !this.open) {
      return;
    }
    this.deliver({ topic: envelope.topic, bytes: envelope.bytes, retain: false });
  };

  private deliver(message: MqttIncoming): void {
    for (const filter of this.filters) {
      if (topicMatches(filter, message.topic)) {
        this.emitter.emit('message', message);
        return;
      }
    }
  }

  publish(topic: string, bytes: Uint8Array, _options: MqttPublishOptions = {}): Promise<void> {
    if (!this.open) {
      return Promise.reject(new MqttError('closed', mqttText.notConnected()));
    }
    const envelope: TabMqttEnvelope = { v: 1, type: 'mqtt.publish', topic, bytes: bytes.slice(), from: this.clientId, at: Date.now() };
    this.channel.postMessage(envelope);
    // 중계 서버와 같게: 내가 받기로 한 토픽이면 내 메시지도 나에게 온다(BroadcastChannel은 보낸 탭에 오지 않으므로 직접 넣는다).
    this.defer(() => {
      if (this.open) {
        this.deliver({ topic, bytes: envelope.bytes, retain: false });
      }
    });
    return Promise.resolve();
  }

  subscribe(filter: string): Promise<void> {
    if (!this.open) {
      return Promise.reject(new MqttError('closed', mqttText.notConnected()));
    }
    this.filters.add(filter);
    return Promise.resolve();
  }

  on<K extends keyof MqttTransportEvents>(event: K, listener: MqttTransportEvents[K]): () => void {
    return this.emitter.on(event, listener);
  }

  close(reason = '탭 통로를 닫았어요.'): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.channel.removeEventListener('message', this.onMessage);
    try {
      this.channel.close();
    } catch {
      // 이미 닫힌 채널
    }
    this.emitter.emit('close', reason);
    this.emitter.clear();
  }
}

/** 같은 컴퓨터 탭 통로를 연다(바로 열린다 — 기다릴 것이 없다) */
export function openTabTransport(options: TabMqttTransportOptions): MqttTransport {
  if (options.factory === undefined && !isTabMqttAvailable()) {
    throw new MqttError('no-broadcast-channel', mqttText.noBroadcastChannel());
  }
  return new TabMqttTransport(options);
}
