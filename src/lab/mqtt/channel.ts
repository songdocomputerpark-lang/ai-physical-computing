/**
 * 브릿지 통로 "mqtt"(P4-06) — 영상처리 실습실이 알아낸 값을 MQTT로 보내는 길(src/lab/README.md 9.6).
 *
 * `channels/registry.ts`를 고치지 않고 여기서 `registerBridgeChannel`로 끼운다. 같은 글자 한 줄이 같은 컴퓨터 탭·
 * USB·블루투스·MQTT 어느 통로로도 나가는 규칙(PLAN §7.2 규칙 6)을 그대로 따른다.
 *
 * 토픽(PLAN §7.4)
 * - 보드 쪽(`from: 'board'`): `<접두어>/<보드 이름>/rx`를 받고, `<접두어>/<보드 이름>/tx`로 보낸다.
 * - 컴퓨터·대시보드 쪽: 반대로 `rx`로 보내고 `tx`를 받는다.
 * - 싣는 것은 **바이트 그대로**다(봉투 JSON이 아니다). 그래야 실물 보드의 `umqtt` 코드가 같은 메시지를 읽는다.
 *
 * 상대가 있는지는 알 수 없다(중계 서버는 누가 듣는지 알려 주지 않는다) → `knowsPeers = false`.
 * 그래서 브릿지가 "받을 쪽이 없어요" 오류를 내지 않는다(대시보드처럼 듣는 사람이 없어도 보내는 화면과 같은 처리).
 */
import {
  BridgeClosedError,
  makeEnvelope,
  registerBridgeChannel,
  type BridgeChannel,
  type BridgeChannelEvents,
  type BridgeChannelState,
  type BridgeEnvelope,
  type BridgeInboundPolicy,
  type BridgeParty,
  type BridgeSendOptions,
} from '../bridge/index.ts';
import type { MqttConnection, MqttMode } from './connection.ts';
import { mqttText } from './messages.ts';
import { getMqttSession } from './session.ts';
import { readMqttSettings } from './settings.ts';
import { deviceRxTopic, deviceTxTopic, isValidDevice, DEFAULT_DEVICE } from './topics.ts';

/** 통로 id(저장소 전체에서 하나 — README 9.6) */
export const MQTT_CHANNEL_ID = 'mqtt';

/** 봉투 type 기본값 */
export const MQTT_DATA_TYPE = 'bridge.data';

/** `openBridgeChannel('mqtt', { extra })`로 넘길 수 있는 것 */
export interface MqttChannelExtra {
  /** 보드 이름(토픽 가운데 칸). 기본은 저장된 설정 또는 esp32-01 */
  readonly device?: string;
  readonly mode?: MqttMode;
  readonly brokerUrl?: string;
  /** 받는 메시지 거르기(허용 목록·길이 — PD-29). 실제 보드로 가는 길은 반드시 준다. */
  readonly inbound?: BridgeInboundPolicy;
  /** 테스트가 연결을 직접 넣는 자리 */
  readonly connection?: MqttConnection;
}

class MqttBridgeChannel implements BridgeChannel {
  readonly id = MQTT_CHANNEL_ID;
  readonly from: BridgeParty;
  readonly knowsPeers = false;
  readonly peers: readonly BridgeParty[] = [];
  private readonly connection: MqttConnection;
  private readonly publishTopic: string;
  private readonly listenTopic: string;
  private readonly peerName: BridgeParty;
  private readonly type: string;
  /** 일 이름마다 듣는 함수 묶음(브릿지 `channels/emitter.ts`와 같은 모양 — 값 종류를 잃지 않으려고 Map 대신 쓴다) */
  private readonly listeners: { [K in keyof BridgeChannelEvents]: Set<BridgeChannelEvents[K]> } = {
    message: new Set(),
    peers: new Set(),
    close: new Set(),
  };
  private readonly offs: Array<() => void> = [];
  private open = true;

  constructor(options: {
    connection: MqttConnection;
    from: BridgeParty;
    publishTopic: string;
    listenTopic: string;
    peerName: BridgeParty;
    type: string;
  }) {
    this.connection = options.connection;
    this.from = options.from;
    this.publishTopic = options.publishTopic;
    this.listenTopic = options.listenTopic;
    this.peerName = options.peerName;
    this.type = options.type;
    this.offs.push(
      this.connection.on('message', (message) => {
        if (message.topic !== this.listenTopic && message.studentTopic !== this.listenTopic) {
          return;
        }
        this.emit('message', makeEnvelope({ type: this.type, from: this.peerName, bytes: message.bytes, at: Date.now() }));
      }),
    );
    this.offs.push(
      this.connection.on('state', (state) => {
        if (state === 'closed' && this.open) {
          this.open = false;
          this.emit('close', '연결이 닫혔어요.');
        }
      }),
    );
  }

  get label(): string {
    return mqttText.channelLabel(this.connection.via);
  }

  get state(): BridgeChannelState {
    return this.open && this.connection.state === 'open' ? 'open' : 'closed';
  }

  async send(bytes: Uint8Array, _options: BridgeSendOptions = {}): Promise<void> {
    if (this.state !== 'open') {
      throw new BridgeClosedError(this.label);
    }
    await this.connection.publish(this.publishTopic, bytes);
  }

  on<K extends keyof BridgeChannelEvents>(event: K, listener: BridgeChannelEvents[K]): () => void {
    const set = this.listeners[event] as Set<BridgeChannelEvents[K]>;
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  private emit<K extends keyof BridgeChannelEvents>(event: K, ...args: Parameters<BridgeChannelEvents[K]>): void {
    const set = this.listeners[event] as Set<(...values: Parameters<BridgeChannelEvents[K]>) => void>;
    for (const listener of [...set]) {
      try {
        listener(...args);
      } catch (error) {
        console.error('[MQTT] 브릿지 통로 알림 처리 중 오류', error);
      }
    }
  }

  close(reason = '연결을 닫았어요.'): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    for (const off of this.offs.splice(0)) {
      off();
    }
    this.emit('close', reason);
    this.listeners.message.clear();
    this.listeners.peers.clear();
    this.listeners.close.clear();
    // 연결 자체는 닫지 않는다 — 같은 탭의 패널·파이썬 흉내가 함께 쓰는 연결이다(session.ts).
  }
}

/** 받은 봉투를 화면이 읽기 좋게(테스트가 쓴다) */
export function envelopeTextOf(envelope: BridgeEnvelope): string {
  return new TextDecoder().decode(envelope.bytes);
}

let registered = false;

/**
 * 브릿지 등록표에 MQTT 통로를 끼운다(두 번 불러도 괜찮다).
 * 화면 모듈이 붙을 때(`src/lab/modules/mqtt/index.ts`) 부르고, 다른 구역(영상처리 [보내기] 패널 등)도
 * `import { registerMqttChannel } from '../../mqtt/index.ts'`로 부르면 그 실습실에서 통로 목록에 나온다.
 */
export function registerMqttChannel(): void {
  if (registered) {
    return;
  }
  registered = true;
  registerBridgeChannel({
    id: MQTT_CHANNEL_ID,
    label: mqttText.channelLabel('broker'),
    notice: mqttText.brokerWarning(),
    available: () => true,
    open: async (options) => {
      const extra = (options.extra ?? {}) as MqttChannelExtra;
      const settings = readMqttSettings();
      const device = isValidDevice(extra.device) ? extra.device : settings.device || DEFAULT_DEVICE;
      const connection =
        extra.connection ??
        getMqttSession({
          ...(options.prefix === undefined ? {} : { prefix: options.prefix }),
          ...(extra.mode === undefined ? {} : { mode: extra.mode }),
          ...(extra.brokerUrl === undefined ? {} : { brokerUrl: extra.brokerUrl }),
          ...(extra.inbound === undefined ? {} : { inbound: extra.inbound }),
        });
      await connection.connect();
      const prefix = connection.prefix;
      const isBoard = options.from === 'board';
      const publishTopic = isBoard ? deviceTxTopic(prefix, device) : deviceRxTopic(prefix, device);
      const listenTopic = isBoard ? deviceRxTopic(prefix, device) : deviceTxTopic(prefix, device);
      await connection.subscribe(listenTopic);
      return new MqttBridgeChannel({
        connection,
        from: options.from,
        publishTopic,
        listenTopic,
        peerName: isBoard ? 'pc' : 'board',
        type: options.type ?? MQTT_DATA_TYPE,
      });
    },
  });
}

/** 테스트에서만 — 다시 등록할 수 있게 표시를 지운다(등록표 비우기는 `clearBridgeChannels`) */
export function forgetMqttChannelRegistration(): void {
  registered = false;
}
