/**
 * 통로 약속 — "토픽에 바이트를 보내고, 토픽을 받기로 하고, 오면 알려 준다"만 있는 작은 약속(P4-06).
 *
 * 구현이 둘이다.
 *   broker-transport.ts  진짜 공개 중계 서버(MQTT.js 5.15.2, WebSocket)
 *   tab-transport.ts     같은 컴퓨터의 다른 탭(BroadcastChannel, PD-17 — 학교망이 막아도 된다)
 *
 * 두 구현이 같은 약속을 따르므로 `connection.ts`가 **연결이 안 되면 탭 통로로 스스로 바꾼다**. 화면·파이썬 흉내
 * (`umqtt.simple`)는 어느 쪽인지 모른 채 같은 코드로 돈다(PLAN §7.2 규칙 6 "같은 문자열을 모든 통로에").
 */

/** 통로 종류 */
export type MqttVia = 'broker' | 'tab';

/** 받은 메시지 하나 */
export interface MqttIncoming {
  /** 브로커에 실린 토픽 그대로(접두어 포함) */
  readonly topic: string;
  readonly bytes: Uint8Array;
  readonly retain: boolean;
}

/** 보낼 때 붙일 수 있는 것 — QoS 0·retain 끔이 기본이다(PLAN §7.4 "전송 옵션") */
export interface MqttPublishOptions {
  readonly qos?: 0 | 1 | 2;
  readonly retain?: boolean;
}

/** 통로가 알리는 일 */
export interface MqttTransportEvents {
  /** 메시지가 왔다 */
  message: (message: MqttIncoming) => void;
  /** 연결됐다(다시 연결된 것도 포함) */
  connect: () => void;
  /** 연결이 끊겨 다시 시도한다(몇 번째인지) */
  reconnect: (attempt: number) => void;
  /** 통로가 닫혔다(한국어 이유) */
  close: (reason: string) => void;
  /** 학생에게 보여 줄 안내(한국어) */
  notice: (text: string) => void;
}

/** 통로 하나 */
export interface MqttTransport {
  readonly via: MqttVia;
  /** 화면에 보여 줄 자리(주소 또는 "이 컴퓨터의 탭") */
  readonly where: string;
  readonly connected: boolean;
  publish(topic: string, bytes: Uint8Array, options?: MqttPublishOptions): Promise<void>;
  /** 이 토픽(또는 와일드카드 필터)을 받기로 한다 */
  subscribe(filter: string): Promise<void>;
  on<K extends keyof MqttTransportEvents>(event: K, listener: MqttTransportEvents[K]): () => void;
  close(reason?: string): void;
}

/** 통로를 열 때 주는 값 */
export interface MqttTransportOptions {
  /** 통신 접두어(PD-29 무작위 12글자) */
  readonly prefix: string;
  /** 중계 서버 주소(브로커 통로만) */
  readonly url?: string;
  /** 클라이언트 이름 — 개인정보를 넣지 않는다(자리 이름·무작위 꼬리표만) */
  readonly clientId?: string;
  /** 연결을 기다리는 시간(밀리초) */
  readonly connectTimeoutMs?: number;
  /** 다시 연결해 보는 횟수(넘으면 닫고 안내, PLAN §7.4) */
  readonly reconnectLimit?: number;
}

/**
 * 이벤트 듣는이를 모아 두는 작은 도우미(통로 구현이 함께 쓴다).
 * 일 이름마다 묶음을 따로 두는 모양은 브릿지의 `channels/emitter.ts`와 같다 — Map 하나에 담으면 값 종류를 잃는다.
 */
export class MqttEmitter {
  private readonly listeners: { [K in keyof MqttTransportEvents]: Set<MqttTransportEvents[K]> } = {
    message: new Set(),
    connect: new Set(),
    reconnect: new Set(),
    close: new Set(),
    notice: new Set(),
  };

  on<K extends keyof MqttTransportEvents>(event: K, listener: MqttTransportEvents[K]): () => void {
    const set = this.listeners[event] as Set<MqttTransportEvents[K]>;
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  emit<K extends keyof MqttTransportEvents>(event: K, ...args: Parameters<MqttTransportEvents[K]>): void {
    const set = this.listeners[event] as Set<(...values: Parameters<MqttTransportEvents[K]>) => void>;
    for (const listener of [...set]) {
      try {
        listener(...args);
      } catch (error) {
        // 듣는이 하나가 실패해도 통로는 계속 돈다.
        console.error('[MQTT] 통로 알림 처리 중 오류', error);
      }
    }
  }

  clear(): void {
    for (const set of Object.values(this.listeners) as Array<Set<unknown>>) {
      set.clear();
    }
  }
}

/** 개인정보가 들어가지 않는 클라이언트 이름을 만든다(자리 이름 + 무작위 6글자) */
export function makeClientId(role = 'apc'): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  let tail = '';
  const bytes = new Uint8Array(6);
  const crypto = (globalThis as { crypto?: Crypto }).crypto;
  if (crypto?.getRandomValues !== undefined) {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  for (const value of bytes) {
    tail += alphabet[value % alphabet.length];
  }
  return `${role}-${tail}`;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 글자를 바이트로 */
export function toBytes(value: string | Uint8Array | readonly number[]): Uint8Array {
  if (typeof value === 'string') {
    return encoder.encode(value);
  }
  if (value instanceof Uint8Array) {
    return value;
  }
  return Uint8Array.from(value);
}

/** 바이트를 화면에 보일 글자로(글자로 읽히지 않으면 16진수) */
export function previewBytes(bytes: Uint8Array, limit = 40): string {
  const text = decoder.decode(bytes).replace(/\r/gu, '\\r').replace(/\n/gu, '\\n');
  // 제어 문자가 섞였으면 16진수로 보여 준다(원시 바이트 메시지 — PLAN §7.2 규칙 7).
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) {
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
    return hex.length <= limit ? hex : `${hex.slice(0, limit)}…`;
  }
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}
