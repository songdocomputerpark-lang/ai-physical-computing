/**
 * MQTT 연결 하나 — 통로 고르기(중계 서버 / 같은 컴퓨터 탭), 접두어 붙이기, 기록 남기기를 한곳에서 한다(P4-06).
 *
 * 화면(`src/lab/modules/mqtt/index.ts`)과 파이썬 흉내(`umqtt.simple`)와 브릿지 통로(`channel.ts`)가 모두 이것을 쓴다.
 *
 * 규칙(PLAN §7.4, PD-29)
 * - 토픽은 늘 **무작위 접두어 아래**에만 만든다. 학생이 짧은 토픽을 쓰면 통로가 접두어를 붙이고 한 번 알려 준다.
 * - 중계 서버에 연결되지 않으면 **한국어로 알리고 같은 컴퓨터 탭 통로로 스스로 바꾼다**(학교망 차단 대비 — PD-17).
 * - 접두어 밖에서 온 메시지는 버린다. 허용 목록(`allow`)을 주면 목록에 없는 글은 버리고 까닭을 알린다(실제 보드로 가는 길).
 */
import { checkInbound, type BridgeInboundPolicy } from '../bridge/index.ts';
import { defaultBrokerUrl } from './brokers.ts';
import { mqttText, MqttConnectError, MqttNotConnectedError } from './messages.ts';
import { isUnderPrefix, stripTopicPrefix, withTopicPrefix } from './topics.ts';
import { openBrokerTransport, type BrokerTransportOptions } from './broker-transport.ts';
import { openTabTransport, type TabMqttTransportOptions } from './tab-transport.ts';
import { previewBytes, type MqttPublishOptions, type MqttTransport, type MqttVia } from './transport.ts';

/** 어떤 통로를 쓸지: 'tab' 같은 컴퓨터 탭만 · 'broker' 중계 서버(안 되면 탭으로) · 'auto' 중계 서버를 먼저 해 보고 안 되면 탭 */
export type MqttMode = 'tab' | 'broker' | 'auto';

/** 연결 상태 */
export type MqttConnectionState = 'idle' | 'connecting' | 'open' | 'closed';

/** 받은 메시지 하나(학생 코드가 보는 모양까지 함께) */
export interface MqttReceived {
  /** 브로커에 실린 토픽(접두어 포함) */
  readonly topic: string;
  /** 학생 코드가 쓴 모양의 토픽(접두어를 우리가 붙였으면 떼고 준다) */
  readonly studentTopic: string;
  readonly bytes: Uint8Array;
}

/** 화면 기록 한 줄 */
export interface MqttLogEntry {
  readonly at: number;
  readonly kind: 'sent' | 'received' | 'notice' | 'ignored';
  readonly text: string;
}

export interface MqttConnectionOptions {
  /** 통신 접두어(PD-29 무작위 12글자) */
  readonly prefix: string;
  readonly mode?: MqttMode;
  /** 중계 서버 주소(비우면 기본 브로커) */
  readonly brokerUrl?: string;
  readonly clientId?: string;
  readonly connectTimeoutMs?: number;
  readonly reconnectLimit?: number;
  /** 받는 메시지 거르기(허용 목록·길이 — PD-29). 실제 보드로 가는 길은 반드시 준다. */
  readonly inbound?: BridgeInboundPolicy;
  /** 기록에 남길 줄 수(기본 40) */
  readonly maxLog?: number;
  /** 테스트·다른 구역이 통로 구현을 갈아 끼우는 자리 */
  readonly openBroker?: (options: BrokerTransportOptions) => Promise<MqttTransport>;
  readonly openTab?: (options: TabMqttTransportOptions) => MqttTransport;
}

export interface MqttConnectionEvents {
  message: (message: MqttReceived) => void;
  state: (state: MqttConnectionState, via: MqttVia | null) => void;
  notice: (text: string) => void;
  log: (entry: MqttLogEntry) => void;
}

interface Subscription {
  /** 실제로 받기로 한 토픽(접두어 포함) */
  readonly full: string;
  /** 접두어를 우리가 붙였나 */
  readonly added: boolean;
}

export class MqttConnection {
  private options: MqttConnectionOptions;
  private transport: MqttTransport | null = null;
  private offs: Array<() => void> = [];
  private readonly subscriptions = new Map<string, Subscription>();
  /** 일 이름마다 듣는 함수 묶음(값 종류를 잃지 않으려고 Map 대신 쓴다 — 브릿지 `channels/emitter.ts`와 같은 모양) */
  private readonly listeners: { [K in keyof MqttConnectionEvents]: Set<MqttConnectionEvents[K]> } = {
    message: new Set(),
    state: new Set(),
    notice: new Set(),
    log: new Set(),
  };
  private readonly entries: MqttLogEntry[] = [];
  private currentState: MqttConnectionState = 'idle';
  private prefixNoticed = false;
  private connecting: Promise<{ via: MqttVia; where: string }> | null = null;

  constructor(options: MqttConnectionOptions) {
    this.options = options;
  }

  get state(): MqttConnectionState {
    return this.currentState;
  }

  get via(): MqttVia | null {
    return this.transport?.via ?? null;
  }

  get where(): string {
    return this.transport?.where ?? '';
  }

  get prefix(): string {
    return this.options.prefix;
  }

  get mode(): MqttMode {
    return this.options.mode ?? 'tab';
  }

  get log(): readonly MqttLogEntry[] {
    return this.entries;
  }

  /** 지금 받기로 한 토픽(학생이 쓴 모양) */
  get topics(): readonly string[] {
    return [...this.subscriptions.keys()];
  }

  on<K extends keyof MqttConnectionEvents>(event: K, listener: MqttConnectionEvents[K]): () => void {
    const set = this.listeners[event] as Set<MqttConnectionEvents[K]>;
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  private emit<K extends keyof MqttConnectionEvents>(event: K, ...args: Parameters<MqttConnectionEvents[K]>): void {
    const set = this.listeners[event] as Set<(...values: Parameters<MqttConnectionEvents[K]>) => void>;
    for (const listener of [...set]) {
      try {
        listener(...args);
      } catch (error) {
        console.error('[MQTT] 알림 처리 중 오류', error);
      }
    }
  }

  private addLog(kind: MqttLogEntry['kind'], text: string): void {
    const entry: MqttLogEntry = { at: Date.now(), kind, text };
    this.entries.push(entry);
    const limit = this.options.maxLog ?? 40;
    while (this.entries.length > limit) {
      this.entries.shift();
    }
    this.emit('log', entry);
  }

  /** 학생에게 보여 줄 안내(콘솔·패널 기록 양쪽에) */
  notice(text: string): void {
    this.addLog('notice', text);
    this.emit('notice', text);
  }

  private setState(state: MqttConnectionState): void {
    if (this.currentState === state) {
      return;
    }
    this.currentState = state;
    this.emit('state', state, this.via);
  }

  /** 설정을 바꾼다(접두어·주소·통로). 열려 있으면 닫는다 — 다음 connect()에서 새 설정으로 연다. */
  update(options: Partial<MqttConnectionOptions>): void {
    const changed =
      (options.prefix !== undefined && options.prefix !== this.options.prefix) ||
      (options.mode !== undefined && options.mode !== this.options.mode) ||
      (options.brokerUrl !== undefined && options.brokerUrl !== this.options.brokerUrl);
    this.options = { ...this.options, ...options };
    if (changed && this.transport !== null) {
      this.closeTransport('설정이 바뀌어 연결을 닫았어요.');
    }
    if (options.prefix !== undefined) {
      this.prefixNoticed = false;
    }
  }

  /** 연결한다(이미 열려 있으면 그대로). 중계 서버가 안 되면 같은 컴퓨터 탭으로 바꾼다. */
  async connect(): Promise<{ via: MqttVia; where: string }> {
    if (this.transport !== null && this.transport.connected) {
      return { via: this.transport.via, where: this.transport.where };
    }
    if (this.connecting !== null) {
      return this.connecting;
    }
    this.connecting = this.openTransport().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async openTransport(): Promise<{ via: MqttVia; where: string }> {
    this.setState('connecting');
    const mode = this.mode;
    if (mode !== 'tab') {
      const url = this.options.brokerUrl === undefined || this.options.brokerUrl === '' ? defaultBrokerUrl() : this.options.brokerUrl;
      try {
        const open = this.options.openBroker ?? openBrokerTransport;
        const transport = await open({
          prefix: this.options.prefix,
          url,
          ...(this.options.clientId === undefined ? {} : { clientId: this.options.clientId }),
          ...(this.options.connectTimeoutMs === undefined ? {} : { connectTimeoutMs: this.options.connectTimeoutMs }),
          ...(this.options.reconnectLimit === undefined ? {} : { reconnectLimit: this.options.reconnectLimit }),
        });
        this.useTransport(transport);
        this.notice(mqttText.connected('broker', transport.where));
        await this.resubscribe();
        return { via: 'broker', where: transport.where };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.notice(reason);
        this.notice(mqttText.switchedToTab(url));
      }
    }
    try {
      const open = this.options.openTab ?? openTabTransport;
      const transport = open({
        prefix: this.options.prefix,
        ...(this.options.clientId === undefined ? {} : { clientId: this.options.clientId }),
      });
      this.useTransport(transport);
      this.notice(mqttText.connected('tab', transport.where));
      await this.resubscribe();
      return { via: 'tab', where: transport.where };
    } catch (error) {
      this.setState('closed');
      const reason = error instanceof Error ? error.message : String(error);
      this.notice(reason);
      throw error instanceof Error ? error : new MqttConnectError(reason);
    }
  }

  private useTransport(transport: MqttTransport): void {
    this.detach();
    this.transport = transport;
    this.offs.push(transport.on('message', (message) => this.onMessage(message.topic, message.bytes)));
    this.offs.push(transport.on('notice', (text) => this.notice(text)));
    this.offs.push(
      transport.on('close', (reason) => {
        if (this.transport === transport) {
          this.detach();
          this.transport = null;
          this.setState('closed');
          this.notice(reason);
        }
      }),
    );
    this.setState('open');
  }

  private detach(): void {
    for (const off of this.offs.splice(0)) {
      try {
        off();
      } catch {
        // 이미 풀린 훅
      }
    }
  }

  private async resubscribe(): Promise<void> {
    const transport = this.transport;
    if (transport === null) {
      return;
    }
    for (const student of [...this.subscriptions.keys()]) {
      // 접두어가 바뀌었을 수 있으니 다시 만든다.
      const next = withTopicPrefix(this.options.prefix, student);
      this.subscriptions.set(student, { full: next.topic, added: next.added });
      await transport.subscribe(next.topic);
    }
  }

  private onMessage(topic: string, bytes: Uint8Array): void {
    if (!isUnderPrefix(this.options.prefix, topic)) {
      // 우리 접두어가 아닌 토픽은 버린다(공개 브로커에서 남의 메시지가 섞여 오지 않게).
      return;
    }
    const text = previewBytes(bytes);
    const policy = this.options.inbound;
    if (policy !== undefined) {
      const decoded = new TextDecoder().decode(bytes).replace(/[\r\n]+$/u, '');
      const check = checkInbound(decoded, policy);
      if (!check.ok) {
        this.addLog('ignored', mqttText.ignoredMessage(topic, check.warning?.text ?? '허용하지 않은 메시지'));
        return;
      }
    }
    const studentTopic = this.studentTopicOf(topic);
    this.addLog('received', mqttText.receivedLine(studentTopic, text));
    this.emit('message', { topic, studentTopic, bytes });
  }

  /** 브로커 토픽 → 학생 코드가 쓴 모양 */
  private studentTopicOf(topic: string): string {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.full === topic) {
        return subscription.added ? stripTopicPrefix(this.options.prefix, topic) : topic;
      }
    }
    // 와일드카드로 받았거나 모르는 토픽이면 접두어만 뗀다.
    return stripTopicPrefix(this.options.prefix, topic);
  }

  private requireTransport(): MqttTransport {
    if (this.transport === null || !this.transport.connected) {
      throw new MqttNotConnectedError(mqttText.notConnected());
    }
    return this.transport;
  }

  /** 토픽에 보낸다(학생이 쓴 토픽 그대로 넘긴다 — 접두어는 여기서 붙인다). 보낸 실제 토픽을 돌려준다. */
  async publish(topic: string, bytes: Uint8Array, options: MqttPublishOptions = {}): Promise<string> {
    const transport = this.requireTransport();
    const target = withTopicPrefix(this.options.prefix, topic);
    this.noticePrefixOnce(target.added);
    await transport.publish(target.topic, bytes, options);
    this.addLog('sent', mqttText.sentLine(target.topic, previewBytes(bytes)));
    return target.topic;
  }

  /** 토픽을 받기로 한다. 받기로 한 실제 토픽을 돌려준다. */
  async subscribe(topic: string): Promise<string> {
    const transport = this.requireTransport();
    const target = withTopicPrefix(this.options.prefix, topic);
    this.noticePrefixOnce(target.added);
    this.subscriptions.set(topic, { full: target.topic, added: target.added });
    await transport.subscribe(target.topic);
    this.addLog('notice', mqttText.subscribedLine(target.topic));
    return target.topic;
  }

  private noticePrefixOnce(added: boolean): void {
    if (added && !this.prefixNoticed) {
      this.prefixNoticed = true;
      this.notice(mqttText.prefixAdded(this.options.prefix));
    }
  }

  /** 받기로 한 토픽을 모두 잊는다(새 실행을 시작할 때 — 브로커 쪽 구독은 그대로 두고 기억만 비운다) */
  forgetSubscriptions(): void {
    this.subscriptions.clear();
  }

  private closeTransport(reason: string): void {
    const transport = this.transport;
    this.detach();
    this.transport = null;
    if (transport !== null) {
      transport.close(reason);
    }
    this.setState('closed');
  }

  /** 연결을 닫는다 */
  close(reason = '연결을 닫았어요.'): void {
    this.closeTransport(reason);
    this.notice(reason);
  }
}
