/**
 * 공개 중계 서버(브로커) 목록과 주소 검사 — 설정은 이 파일 한 곳(PLAN §7.4 "브로커 목록(설정 한 곳)", P4-06).
 *
 * 공개 브로커는 **학습·시험용**이다. 누구나 접속해 아무 토픽이나 보고 보낼 수 있고 가동을 보장하지 않는다(§7.4 경고).
 * 그래서 화면은 늘 경고를 보이고(`mqttText.brokerWarning()`), 수업에서는 같은 컴퓨터 탭 통로를 먼저 안내한다(PLAN §10).
 *
 * 주소를 여기 적을 때 지킨 것
 * - 브라우저는 **WebSocket(wss://)** 으로만 MQTT를 쓴다. 사이트가 https라서 ws://(암호화 없음)는 브라우저가 막는다.
 * - 경로(`/mqtt`)가 필요한 브로커가 있다. 공식 안내로 확인한 것만 `verified: true`로 두고, 확인하지 못한 것은
 *   `verified: false`와 까닭을 적는다(추측으로 기본값을 만들지 않는다 — CLAUDE.md 작업 규칙).
 * - 목록에 없는 주소는 [주소 직접 입력]으로 넣는다.
 */
import { mqttText, MqttError } from './messages.ts';

export interface MqttBrokerOption {
  /** 화면·저장에 쓰는 id */
  readonly id: string;
  /** 화면에 보일 이름 */
  readonly label: string;
  /** WebSocket 주소(빈 값이면 직접 입력) */
  readonly url: string;
  /** 공식 안내로 주소를 확인했나 */
  readonly verified: boolean;
  /** 학생·교사에게 보일 한 줄 설명 */
  readonly note: string;
}

/** [주소 직접 입력] 항목의 id */
export const CUSTOM_BROKER_ID = 'custom';

/**
 * 고를 수 있는 중계 서버. 기본은 EMQX 공개 브로커다(PLAN §7.4 — EMQ 공식 안내로 주소 확인).
 * 주소를 바꾸려면 이 표만 고친다.
 */
export const MQTT_BROKERS: readonly MqttBrokerOption[] = Object.freeze([
  Object.freeze({
    id: 'emqx',
    label: 'EMQX 공개 브로커',
    url: 'wss://broker.emqx.io:8084/mqtt',
    verified: true,
    note: '가장 많이 쓰는 학습용 공개 서버예요. 주소는 EMQ 공식 안내로 확인했어요.',
  }),
  Object.freeze({
    id: 'mosquitto',
    label: 'Mosquitto 시험 서버',
    url: 'wss://test.mosquitto.org:8081',
    verified: true,
    note: '누구나 쓰는 시험 서버예요. 인증이 없어서 아무나 어느 토픽에나 보낼 수 있다고 안내하고 있어요.',
  }),
  Object.freeze({
    id: 'hivemq',
    label: 'HiveMQ 공개 브로커',
    url: 'wss://broker.hivemq.com:8884/mqtt',
    verified: false,
    note: '연결되지 않으면 다른 서버를 골라요(경로 /mqtt는 아직 공식 문서로 확인하지 못했어요).',
  }),
  Object.freeze({
    id: CUSTOM_BROKER_ID,
    label: '주소 직접 입력',
    url: '',
    verified: false,
    note: '선생님이 알려 준 wss:// 주소를 넣어요.',
  }),
]);

/** 기본으로 고르는 중계 서버 */
export const DEFAULT_BROKER_ID = 'emqx';

/** id로 찾기(없으면 null) */
export function brokerById(id: string): MqttBrokerOption | null {
  return MQTT_BROKERS.find((broker) => broker.id === id) ?? null;
}

/** 주소로 찾기(직접 입력한 주소가 목록에 있는지 볼 때) */
export function brokerByUrl(url: string): MqttBrokerOption | null {
  const trimmed = url.trim();
  return MQTT_BROKERS.find((broker) => broker.url !== '' && broker.url === trimmed) ?? null;
}

/** 기본 주소 */
export function defaultBrokerUrl(): string {
  return brokerById(DEFAULT_BROKER_ID)?.url ?? MQTT_BROKERS[0]?.url ?? '';
}

export interface BrokerUrlCheck {
  readonly ok: boolean;
  /** 다듬은 주소(ok일 때) */
  readonly url: string;
  /** 왜 안 되는지(한국어, ok가 아닐 때) */
  readonly reason: string;
}

/**
 * 중계 서버 주소를 다듬고 검사한다.
 * - `wss://`만 받는다(사이트가 https라 브라우저가 ws://를 막는다 — 혼합 콘텐츠).
 * - 주소만 적으면(`broker.emqx.io:8084/mqtt`) 앞에 `wss://`를 붙여 본다.
 * - 비밀번호·아이디가 들어간 주소(`wss://user:pw@…`)는 받지 않는다(개인정보·공유 링크 사고 방지).
 */
export function checkBrokerUrl(value: string): BrokerUrlCheck {
  const trimmed = value.trim();
  if (trimmed === '') {
    return { ok: false, url: '', reason: mqttText.badUrl(value) };
  }
  // 다른 규약(https://·mqtt:// 등)은 그대로 막는다. `broker.emqx.io:8084/mqtt`처럼 포트만 붙은 주소는 규약이 아니므로
  // `://`가 있을 때만 규약으로 본다.
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed) && !/^wss?:\/\//iu.test(trimmed)) {
    return { ok: false, url: '', reason: mqttText.badUrl(trimmed) };
  }
  const withScheme = /^wss?:\/\//iu.test(trimmed) ? trimmed : `wss://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, url: '', reason: mqttText.badUrl(trimmed) };
  }
  if (parsed.protocol === 'ws:') {
    return { ok: false, url: '', reason: mqttText.insecureUrl(trimmed) };
  }
  if (parsed.protocol !== 'wss:') {
    return { ok: false, url: '', reason: mqttText.badUrl(trimmed) };
  }
  if (parsed.username !== '' || parsed.password !== '') {
    return { ok: false, url: '', reason: mqttText.badUrl(trimmed) };
  }
  if (parsed.hostname === '') {
    return { ok: false, url: '', reason: mqttText.badUrl(trimmed) };
  }
  return { ok: true, url: parsed.toString(), reason: '' };
}

/** 검사에 통과한 주소만 돌려주고, 아니면 한국어 오류를 던진다 */
export function requireBrokerUrl(value: string): string {
  const check = checkBrokerUrl(value);
  if (!check.ok) {
    throw new MqttError('bad-url', check.reason);
  }
  return check.url;
}

/**
 * 파이썬 `MQTTClient("client", "broker.emqx.io")`처럼 **호스트 이름만** 준 경우에 쓸 주소를 만든다.
 * 목록에 같은 호스트가 있으면 그 주소(포트·경로 포함)를 쓰고, 없으면 화면이 고른 주소를 그대로 쓴다.
 * 근거: MicroPython `umqtt.simple`은 TCP 1883으로 붙지만 브라우저는 WebSocket만 쓸 수 있어(§7.3) 포트·경로가 다르다.
 */
export function brokerUrlForServer(server: string, fallbackUrl: string): string {
  const host = server.trim().toLowerCase();
  if (host === '') {
    return fallbackUrl;
  }
  if (/^wss?:\/\//iu.test(host)) {
    const check = checkBrokerUrl(host);
    return check.ok ? check.url : fallbackUrl;
  }
  const found = MQTT_BROKERS.find((broker) => {
    if (broker.url === '') {
      return false;
    }
    try {
      return new URL(broker.url).hostname.toLowerCase() === host;
    } catch {
      return false;
    }
  });
  return found?.url ?? fallbackUrl;
}
