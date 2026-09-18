/**
 * MQTT 통로가 학생에게 보여 주는 **모든 한국어 문장과 오류 종류**를 여기 한 곳에 모은다(P4-06, PLAN §7.4·PD-29).
 *
 * 왜 브릿지의 `messages.ts`에 넣지 않았나: 브릿지 핵심(`src/lab/bridge/`)은 여러 구역이 함께 쓰는 바닥이라
 * Phase 4 병렬 제작에서는 **읽기만** 한다(src/lab/README.md 5.2 공유 파일). 그래서 브릿지가 이미 가진 문장
 * (`bridgeText.publicBrokerNotice()`·`closed()`·`noPeer()`·`badPrefix()`)은 그대로 가져다 쓰고, MQTT에만 있는 문장은
 * 이 파일 하나에 모은다 — 규칙("같은 상황에 두 문구를 만들지 않는다")은 그대로다.
 *
 * 문장 규칙(SPEC §2 초보자 우선)
 * - 고1이 처음 읽어도 아는 낱말로 쓰고, 무엇을 하면 되는지 한 문장을 붙인다.
 * - "브로커"는 화면에 늘 "중계 서버(브로커)"로 처음 한 번 풀어 준다. "구독·발행"은 "받기로 하기·보내기"로 푼다.
 * - 주소·토픽은 학생이 그대로 읽을 수 있게 따옴표 없이 보여 준다.
 */
import { withParticle } from '../../lib/korean.ts';

/** MQTT 쪽 오류의 뿌리. 실습실 오류 카드가 name으로 풀이를 찾는다(오류 사전 comm 묶음). */
export class MqttError extends Error {
  override readonly name: string = 'MqttError';
  /** 오류 사전·화면이 가르는 데 쓰는 짧은 이름 */
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** 중계 서버에 연결하지 못했다(학교망 차단·브로커 멈춤·주소 오타) */
export class MqttConnectError extends MqttError {
  override readonly name = 'MqttConnectFailed';
  constructor(message: string) {
    super('connect-failed', message);
  }
}

/** 아직 연결하지 않았는데 보내거나 받으려 했다 */
export class MqttNotConnectedError extends MqttError {
  override readonly name = 'MqttNotConnected';
  constructor(message: string) {
    super('not-connected', message);
  }
}

/** 토픽 모양이 규칙에 맞지 않는다 */
export class MqttTopicError extends MqttError {
  override readonly name = 'MqttBadTopic';
  constructor(message: string) {
    super('bad-topic', message);
  }
}

export const mqttText = {
  /** 통로 이름(화면·BridgeChannel.label) */
  channelLabel(via: 'broker' | 'tab' | null): string {
    if (via === 'broker') {
      return '공개 중계 서버(MQTT)';
    }
    if (via === 'tab') {
      return '같은 컴퓨터 탭(MQTT 흉내)';
    }
    return 'MQTT';
  },
  /** 공개 브로커를 고른 화면에 **늘** 보이는 경고(§7.4) — 브릿지의 문장을 그대로 쓴다 */
  brokerWarning(): string {
    return (
      '이 통신은 누구나 보고, 누구나 보낼 수도 있어요. ' +
      '이름·연락처·사진 같은 개인정보를 보내지 말고, 레이저·모터처럼 움직이는 장치는 연결하지 마세요.'
    );
  },
  /** 같은 컴퓨터 탭 통로 안내(PD-17) */
  tabNotice(): string {
    return '같은 컴퓨터의 다른 탭하고만 통해요. 인터넷이 없어도 되고, 주고받는 내용이 이 컴퓨터 밖으로 나가지 않아요.';
  },
  /** 연결 성공 */
  connected(via: 'broker' | 'tab', where: string): string {
    return via === 'broker' ? `중계 서버 ${where}에 연결했어요.` : '같은 컴퓨터 탭 통로를 열었어요.';
  },
  /** 연결 실패 */
  connectFailed(url: string, reason: string): string {
    return `중계 서버 ${url}에 연결하지 못했어요(${reason}). 학교망이 막았거나 서버가 쉬는 중일 수 있어요.`;
  },
  /** 연결 실패 뒤 탭 통로로 스스로 바꿈 */
  switchedToTab(url: string): string {
    return `중계 서버 ${url}에 연결하지 못해서 같은 컴퓨터 탭 통로로 바꿨어요. 받을 화면을 다른 탭에 열어 두면 그대로 실습할 수 있어요.`;
  },
  /** 연결이 끊겨 다시 시도 중 */
  reconnecting(attempt: number, limit: number): string {
    return `연결이 끊겨서 다시 연결해 보는 중이에요(${attempt}/${limit}번째).`;
  },
  /** 다시 연결 한도를 넘음 */
  reconnectGaveUp(limit: number): string {
    return (
      `${limit}번 다시 연결해 봤지만 되지 않았어요. 점검 페이지에서 네트워크를 확인하거나, ` +
      '인터넷이 필요 없는 [같은 컴퓨터 탭]으로 바꿔서 실습해요.'
    );
  },
  /** 연결하지 않고 보내려 함 */
  notConnected(): string {
    return '아직 연결하지 않았어요. 코드에서 connect()를 먼저 부르거나, 화면의 [연결] 단추를 눌러요.';
  },
  /** 주소 모양이 틀림 */
  badUrl(value: string): string {
    return `중계 서버 주소 "${value}"는 쓸 수 없어요. 브라우저에서는 wss://로 시작하는 주소만 쓸 수 있어요(예: wss://broker.emqx.io:8084/mqtt).`;
  },
  /** http 사이트가 아닌데 ws:// 를 넣음 */
  insecureUrl(value: string): string {
    return `"${value}"는 암호화하지 않는 주소(ws://)예요. 이 사이트는 https라서 브라우저가 막아요. wss://로 시작하는 주소를 써요.`;
  },
  /** 토픽이 비었거나 규칙에 안 맞음 */
  badTopic(value: string): string {
    return `토픽 "${value}"는 쓸 수 없어요. 비어 있지 않은 글자여야 하고, 줄바꿈이나 널 문자는 넣을 수 없어요.`;
  },
  /** 토픽이 너무 김 */
  topicTooLong(length: number, limit: number): string {
    return `토픽이 ${length}글자라 ${limit}글자를 넘어요. 더 짧은 이름으로 해요(예: led, temp).`;
  },
  /** 접두어를 앞에 붙였다는 안내(한 번만) */
  prefixAdded(prefix: string): string {
    return (
      `토픽 앞에 이 수업의 통신 접두어를 붙여서 주고받아요: ${prefix}/… ` +
      '공개 중계 서버는 온 세상이 함께 쓰는 곳이라, 접두어가 없으면 다른 사람의 메시지와 섞여요.'
    );
  },
  /** 장치 이름 규칙 */
  badDevice(value: string): string {
    return `보드 이름 "${value}"는 쓸 수 없어요. 영문 소문자·숫자·붙임표만 16글자까지 써요(예: esp32-07). 이름·학번은 넣지 않아요.`;
  },
  /** 허용 목록 밖 메시지를 받아 무시(PD-29 — 실제 보드로 가는 길) */
  ignoredMessage(topic: string, reason: string): string {
    return `${topic}에서 온 메시지를 무시했어요: ${reason}`;
  },
  /** 콘솔·기록에 남기는 보낸 줄 */
  sentLine(topic: string, text: string): string {
    return `보냄 ${topic} ← ${text}`;
  },
  /** 콘솔·기록에 남기는 받은 줄 */
  receivedLine(topic: string, text: string): string {
    return `받음 ${topic} → ${text}`;
  },
  /** 받기로 한 토픽 */
  subscribedLine(topic: string): string {
    return `${withParticle(topic, '을/를')} 받기로 했어요.`;
  },
  /** 브라우저가 WebSocket을 못 쓸 때(거의 없음) */
  noWebSocket(): string {
    return '이 브라우저는 중계 서버 연결(WebSocket)을 쓸 수 없어요. [같은 컴퓨터 탭]으로 실습해요.';
  },
  /** 같은 컴퓨터 탭 통로를 쓸 수 없을 때 */
  noBroadcastChannel(): string {
    return '이 브라우저는 탭끼리 이야기하는 기능(BroadcastChannel)을 쓸 수 없어요. 최신 크롬·엣지에서 다시 열어 보세요.';
  },
} as const;
