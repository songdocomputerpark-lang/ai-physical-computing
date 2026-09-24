/**
 * 대시보드 ↔ 통신 통로 잇기(P4-07). 대시보드는 **MQTT를 직접 모르고** `DashboardSource` 약속만 쓴다
 * (단위 테스트는 가짜 통로를 넣고, 화면은 이 파일이 만든 진짜 통로를 넣는다).
 *
 * 규칙
 * - 위젯마다 따로 받기로 하지 않고 **접두어 아래 전부**(`<접두어>/#`)를 한 번 받기로 한다. 위젯이 늘어도 통신이 늘지 않고,
 *   학생이 토픽을 고쳐도 다시 받기로 할 필요가 없다. 어느 위젯이 볼지는 화면에서 토픽을 맞춰 고른다(`values.ts`).
 * - **접두어가 바뀌면 받기로 한 기억을 비우고 다시 받기로 한다**(`forgetSubscriptions`) — 안 그러면 옛 접두어가 앞에
 *   한 번 더 붙는다(`src/lab/mqtt/connection.ts`의 `resubscribe`).
 * - 보내는 글은 §7.2 규칙대로 **UTF-8 글자 한 줄**이다. 끝 문자는 붙이지 않는다(받는 쪽이 `strip()` 한다).
 */
import type { BridgeChannel, BridgeEnvelope } from '../bridge/index.ts';
import { prefixFilter, type MqttConnection } from '../mqtt/index.ts';
import type { DashboardSource, SourceMessage } from './types.ts';

/** 바이트를 글자로(못 읽는 바이트는 16진수로 보여 준다 — 로그 위젯이 깨진 글자 대신 보여 줄 것) */
export function decodeText(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.replace(/[\r\n]+$/u, '');
  } catch {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
  }
}

/**
 * 브릿지(P4-01)로 온 글이 대시보드에서 쓰는 토픽 이름 — `bridge/<보낸 쪽>`.
 * 예: 영상처리 실습실의 [보내기] 패널이 보낸 값은 `bridge/pc`, 가상 보드가 보낸 값은 `bridge/board`.
 * 브릿지 메시지에는 토픽이 없어서(글자 한 줄만 나른다) 위젯이 고를 수 있게 이 자리에서 이름을 붙인다.
 */
export function bridgeTopicOf(from: string): string {
  const cleaned = from.trim().toLowerCase().replace(/[^a-z0-9-]+/gu, '-');
  return `bridge/${cleaned === '' ? 'unknown' : cleaned}`;
}

/**
 * 봉투 하나에서 줄을 꺼낸다. 브릿지는 `bridge.send()` 한 번이 봉투 하나라서 보통 한 줄이지만,
 * 원본 코드처럼 끝 문자가 없거나 여러 줄이 한 번에 올 수도 있어 줄바꿈으로 나눈다(빈 줄은 버린다).
 */
export function bridgeLinesOf(bytes: Uint8Array): string[] {
  return decodeText(bytes)
    .split('\n')
    .map((line) => line.replace(/\r$/u, '').trim())
    .filter((line) => line !== '');
}

/**
 * 브릿지 통로에서 오는 글을 대시보드 메시지로 바꿔 넘긴다(인사 봉투 같은 빈 봉투는 버린다).
 * 돌려주는 함수를 부르면 그만 듣는다.
 */
export function listenBridge(channel: BridgeChannel, listener: (message: SourceMessage) => void): () => void {
  return channel.on('message', (envelope: BridgeEnvelope) => {
    const topic = bridgeTopicOf(envelope.from);
    for (const text of bridgeLinesOf(envelope.bytes)) {
      listener({ topic, text, at: envelope.at === 0 ? Date.now() : envelope.at });
    }
  });
}

/** MQTT 연결 하나를 대시보드 통로로 감싼다 */
export function createMqttSource(session: MqttConnection): DashboardSource {
  let listening = '';
  return {
    get prefix(): string {
      return session.prefix;
    },
    get state(): DashboardSource['state'] {
      return session.state;
    },
    async listen(): Promise<void> {
      const filter = prefixFilter(session.prefix);
      if (listening !== '' && listening !== filter) {
        // 접두어가 바뀌었다 — 옛 토픽 기억을 버리고 새 접두어로 다시 받기로 한다.
        session.forgetSubscriptions();
      }
      await session.subscribe(filter);
      listening = filter;
    },
    async send(topic: string, text: string): Promise<void> {
      await session.publish(topic, new TextEncoder().encode(text), { qos: 0, retain: false });
    },
    onMessage(listener: (message: SourceMessage) => void): () => void {
      return session.on('message', (message) => {
        listener({ topic: message.studentTopic, text: decodeText(message.bytes), at: Date.now() });
      });
    },
  };
}
