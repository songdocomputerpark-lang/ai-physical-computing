/**
 * MQTT 토픽 규칙(PLAN §7.4, PD-29) — 순수 함수만 둔다(단위 테스트가 이 파일로 규칙을 지킨다).
 *
 * 규칙
 * - **고정 루트를 쓰지 않는다.** 토픽은 무작위 12글자 접두어(`src/lab/bridge/prefix.ts`)로 시작한다.
 *   `apc/…` 같은 고정 루트가 있으면, 와일드카드 구독을 허용하는 공개 브로커에서 루트 하나로 이 사이트를 쓰는
 *   모든 사람의 메시지가 보인다.
 * - 모양: `<접두어>/<장치>/rx`(보드가 받음) · `<접두어>/<장치>/tx`(보드가 보냄) · `<접두어>/dash/<위젯>`(대시보드).
 * - 학생 코드가 `client.publish("led", "on")`처럼 짧은 토픽을 쓰면 **앞에 접두어를 붙여** 보내고 한 번 알려 준다.
 *   실물 보드에 올릴 코드와 글자가 같아야 하므로(원칙: 같은 코드) 코드를 고치지 않고 통로가 붙인다.
 * - 받은 토픽은 학생이 쓴 모양으로 돌려준다(접두어를 붙여 보냈으면 떼고 준다) — `topic == b"led"` 비교가 그대로 되게.
 * - 장치 이름에 개인정보를 넣지 않는다(이름·학번 금지, 자리 번호만 — PLAN §10).
 */
import { mqttText, MqttTopicError } from './messages.ts';

/** 토픽 한 개의 최대 길이(글자). 실물 제약이 아니라 학생이 읽을 수 있게 두는 한도다. */
export const MAX_TOPIC_LENGTH = 96;

/** 장치 이름 규칙: 영문 소문자·숫자·붙임표 16글자까지(예: esp32-07) */
export const DEVICE_PATTERN = /^[a-z0-9][a-z0-9-]{0,15}$/u;

/** 기본 장치 이름 — 교실에서 자리 번호로 바꿔 쓴다(PLAN §7.3 "보드·자리 번호") */
export const DEFAULT_DEVICE = 'esp32-01';

/** 장치 이름이 규칙에 맞나 */
export function isValidDevice(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_PATTERN.test(value);
}

/** 장치 이름을 다듬는다(대문자·공백·밑줄을 받아 준다). 규칙에 못 맞추면 한국어 이유. */
export function parseDevice(value: string): { ok: true; device: string } | { ok: false; reason: string } {
  const cleaned = value.trim().toLowerCase().replace(/[\s_]+/gu, '-');
  if (!isValidDevice(cleaned)) {
    return { ok: false, reason: mqttText.badDevice(value) };
  }
  return { ok: true, device: cleaned };
}

/** 토픽 글자가 쓸 수 있는 모양인가(MQTT는 UTF-8 한 글자 이상, 널 문자 금지) */
export function checkTopic(topic: string): void {
  if (typeof topic !== 'string' || topic === '' || /[\u0000\n\r]/u.test(topic)) {
    throw new MqttTopicError(mqttText.badTopic(String(topic)));
  }
  if (topic.length > MAX_TOPIC_LENGTH) {
    throw new MqttTopicError(mqttText.topicTooLong(topic.length, MAX_TOPIC_LENGTH));
  }
}

/** 보드가 받는 토픽 `<접두어>/<장치>/rx` */
export function deviceRxTopic(prefix: string, device: string = DEFAULT_DEVICE): string {
  return `${prefix}/${device}/rx`;
}

/** 보드가 보내는 토픽 `<접두어>/<장치>/tx` */
export function deviceTxTopic(prefix: string, device: string = DEFAULT_DEVICE): string {
  return `${prefix}/${device}/tx`;
}

/** 대시보드 토픽 `<접두어>/dash/<위젯>`(P4-07이 쓴다) */
export function dashTopic(prefix: string, widget: string): string {
  return `${prefix}/dash/${widget}`;
}

/** 이 접두어 아래 모든 토픽을 받는 필터 `<접두어>/#` */
export function prefixFilter(prefix: string): string {
  return `${prefix}/#`;
}

export interface PrefixedTopic {
  /** 실제로 브로커에 보내는 토픽 */
  readonly topic: string;
  /** 접두어를 우리가 붙였나(받을 때 떼려고 기억한다) */
  readonly added: boolean;
}

/**
 * 학생이 쓴 토픽에 접두어를 붙인다. 이미 접두어로 시작하면 그대로 둔다.
 * 맨 앞의 `/`는 뗀다(`"/led"`와 `"led"`를 같게 — 실물에서는 다른 토픽이지만 초보자가 헷갈리는 자리라 붙임표를 정리한다).
 */
export function withTopicPrefix(prefix: string, topic: string): PrefixedTopic {
  checkTopic(topic);
  const cleaned = topic.replace(/^\/+/u, '');
  if (cleaned === '') {
    throw new MqttTopicError(mqttText.badTopic(topic));
  }
  if (cleaned === prefix || cleaned.startsWith(`${prefix}/`)) {
    return { topic: cleaned, added: false };
  }
  return { topic: `${prefix}/${cleaned}`, added: true };
}

/** 접두어를 뗀다(붙여 보낸 토픽을 학생 코드에 돌려줄 때) */
export function stripTopicPrefix(prefix: string, topic: string): string {
  return topic.startsWith(`${prefix}/`) ? topic.slice(prefix.length + 1) : topic;
}

/**
 * MQTT 와일드카드 맞추기(`+` 한 칸, `#` 나머지 전부 — MQTT 3.1.1 규칙).
 * 같은 컴퓨터 탭 통로는 중계 서버가 없어서 이 함수로 직접 고른다.
 */
export function topicMatches(filter: string, topic: string): boolean {
  if (filter === topic) {
    return true;
  }
  const filterParts = filter.split('/');
  const topicParts = topic.split('/');
  for (let index = 0; index < filterParts.length; index += 1) {
    const part = filterParts[index];
    if (part === '#') {
      // '#'은 마지막에만 올 수 있고 그 자리부터 끝까지 모두 맞는다(단, 비어 있으면 안 된다).
      return index === filterParts.length - 1 && topicParts.length >= index;
    }
    if (index >= topicParts.length) {
      return false;
    }
    if (part !== '+' && part !== topicParts[index]) {
      return false;
    }
  }
  return filterParts.length === topicParts.length;
}

/** 토픽이 이 접두어 아래 것인가(남의 접두어로 온 메시지를 버릴 때) */
export function isUnderPrefix(prefix: string, topic: string): boolean {
  return topic === prefix || topic.startsWith(`${prefix}/`);
}
