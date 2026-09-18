// MQTT 토픽 규칙(PLAN §7.4, PD-29) 단위 테스트 — 구역 D(P4-06).
// 지키는 것: ① 고정 루트 없이 무작위 접두어로 시작한다 ② 학생이 쓴 짧은 토픽에 접두어를 붙이고 받을 때 떼어 준다
// ③ 와일드카드(+·#)를 브로커와 같은 규칙으로 고른다 ④ 보드 이름에 개인정보를 넣지 못하게 막는다.
import { describe, expect, it } from 'vitest';
import { createPrefix, PREFIX_LENGTH } from '../../../src/lab/bridge/index.ts';
import {
  checkTopic,
  dashTopic,
  DEFAULT_DEVICE,
  deviceRxTopic,
  deviceTxTopic,
  isUnderPrefix,
  isValidDevice,
  MAX_TOPIC_LENGTH,
  parseDevice,
  prefixFilter,
  stripTopicPrefix,
  topicMatches,
  withTopicPrefix,
} from '../../../src/lab/mqtt/index.ts';

const PREFIX = '7kq2m9xd4hpt';

describe('토픽 모양(PLAN §7.4)', () => {
  it('보드가 받는·보내는 토픽은 <접두어>/<장치>/rx·tx다', () => {
    expect(deviceRxTopic(PREFIX, 'esp32-07')).toBe('7kq2m9xd4hpt/esp32-07/rx');
    expect(deviceTxTopic(PREFIX, 'esp32-07')).toBe('7kq2m9xd4hpt/esp32-07/tx');
    expect(dashTopic(PREFIX, 'gauge1')).toBe('7kq2m9xd4hpt/dash/gauge1');
    expect(deviceRxTopic(PREFIX)).toBe(`7kq2m9xd4hpt/${DEFAULT_DEVICE}/rx`);
  });

  it('PD-29: 고정 루트가 없다 — 모든 토픽이 무작위 접두어로 시작한다', () => {
    const prefix = createPrefix();
    expect(prefix).toHaveLength(PREFIX_LENGTH);
    for (const topic of [deviceRxTopic(prefix), deviceTxTopic(prefix), dashTopic(prefix, 'w'), prefixFilter(prefix)]) {
      expect(topic.startsWith(`${prefix}/`)).toBe(true);
      // 'apc/…'처럼 사이트를 가리키는 고정 낱말이 앞에 붙지 않는다.
      expect(topic.split('/')[0]).toBe(prefix);
    }
  });

  it('쓸 수 없는 토픽은 한국어 이유와 함께 막는다', () => {
    expect(() => checkTopic('')).toThrow(/쓸 수 없어요/u);
    expect(() => checkTopic('a\nb')).toThrow(/쓸 수 없어요/u);
    expect(() => checkTopic('x'.repeat(MAX_TOPIC_LENGTH + 1))).toThrow(/글자를 넘어요/u);
    expect(() => checkTopic('led/red')).not.toThrow();
  });
});

describe('접두어 붙이기·떼기', () => {
  it('학생이 쓴 짧은 토픽에는 접두어를 붙인다', () => {
    expect(withTopicPrefix(PREFIX, 'led')).toEqual({ topic: '7kq2m9xd4hpt/led', added: true });
    expect(withTopicPrefix(PREFIX, '/led')).toEqual({ topic: '7kq2m9xd4hpt/led', added: true });
  });

  it('이미 접두어로 시작하면 그대로 둔다', () => {
    expect(withTopicPrefix(PREFIX, '7kq2m9xd4hpt/esp32-01/rx')).toEqual({ topic: '7kq2m9xd4hpt/esp32-01/rx', added: false });
  });

  it('받은 토픽에서 접두어를 뗀다(학생 코드의 topic == b"led" 비교가 되게)', () => {
    expect(stripTopicPrefix(PREFIX, '7kq2m9xd4hpt/led')).toBe('led');
    expect(stripTopicPrefix(PREFIX, 'other/led')).toBe('other/led');
  });

  it('접두어 아래인지 본다(남의 접두어로 온 메시지를 버릴 때)', () => {
    expect(isUnderPrefix(PREFIX, '7kq2m9xd4hpt/led')).toBe(true);
    expect(isUnderPrefix(PREFIX, '7kq2m9xd4hpt')).toBe(true);
    expect(isUnderPrefix(PREFIX, 'abcdefghjkmn/led')).toBe(false);
  });
});

describe('와일드카드 맞추기(MQTT 3.1.1 규칙)', () => {
  it('+는 한 칸, #은 나머지 전부', () => {
    expect(topicMatches('a/b', 'a/b')).toBe(true);
    expect(topicMatches('a/+', 'a/b')).toBe(true);
    expect(topicMatches('a/+', 'a/b/c')).toBe(false);
    expect(topicMatches('a/#', 'a/b/c')).toBe(true);
    expect(topicMatches('a/#', 'a/b')).toBe(true);
    expect(topicMatches('#', 'a/b/c')).toBe(true);
    expect(topicMatches('a/b', 'a/c')).toBe(false);
    expect(topicMatches('a/b/c', 'a/b')).toBe(false);
  });

  it('접두어 아래 전체 받기(<접두어>/#)가 그 접두어의 토픽만 고른다', () => {
    const filter = prefixFilter(PREFIX);
    expect(topicMatches(filter, `${PREFIX}/led`)).toBe(true);
    expect(topicMatches(filter, `${PREFIX}/esp32-01/rx`)).toBe(true);
    expect(topicMatches(filter, 'abcdefghjkmn/led')).toBe(false);
  });
});

describe('보드 이름(PLAN §10 — 개인정보를 넣지 않는다)', () => {
  it('영문 소문자·숫자·붙임표 16글자까지만 받는다', () => {
    expect(isValidDevice('esp32-07')).toBe(true);
    expect(isValidDevice('ESP32')).toBe(false);
    expect(isValidDevice('학생이름')).toBe(false);
    expect(isValidDevice('a'.repeat(17))).toBe(false);
  });

  it('대문자·공백·밑줄은 다듬어 받고, 못 맞추면 한국어 이유를 준다', () => {
    expect(parseDevice(' ESP32 07 ')).toEqual({ ok: true, device: 'esp32-07' });
    expect(parseDevice('2학년 3반 홍길동')).toEqual({ ok: false, reason: expect.stringContaining('쓸 수 없어요') });
    const failed = parseDevice('!!');
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.reason).toContain('이름·학번은 넣지 않아요');
    }
  });
});
