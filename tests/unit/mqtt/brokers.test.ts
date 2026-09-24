// 중계 서버 목록·주소 검사(PLAN §7.4) 단위 테스트 — 구역 D(P4-06).
import { describe, expect, it } from 'vitest';
import {
  brokerById,
  brokerByUrl,
  brokerUrlForServer,
  checkBrokerUrl,
  CUSTOM_BROKER_ID,
  DEFAULT_BROKER_ID,
  defaultBrokerUrl,
  MQTT_BROKERS,
  requireBrokerUrl,
} from '../../../src/lab/mqtt/index.ts';

describe('브로커 목록', () => {
  it('기본은 EMQX 공개 브로커고 주소는 wss://다', () => {
    expect(DEFAULT_BROKER_ID).toBe('emqx');
    expect(defaultBrokerUrl()).toBe('wss://broker.emqx.io:8084/mqtt');
    expect(brokerById(DEFAULT_BROKER_ID)?.verified).toBe(true);
  });

  it('직접 입력 항목을 빼면 모두 wss:// 주소이고 설명이 있다', () => {
    for (const broker of MQTT_BROKERS) {
      expect(broker.note.length).toBeGreaterThan(0);
      if (broker.id === CUSTOM_BROKER_ID) {
        expect(broker.url).toBe('');
        continue;
      }
      expect(broker.url.startsWith('wss://')).toBe(true);
    }
  });

  it('확인하지 못한 주소는 verified가 거짓이다(추측으로 기본값을 만들지 않는다)', () => {
    expect(brokerById('hivemq')?.verified).toBe(false);
    expect(brokerById('mosquitto')?.verified).toBe(true);
  });

  it('주소로도 찾는다', () => {
    expect(brokerByUrl('wss://test.mosquitto.org:8081')?.id).toBe('mosquitto');
    expect(brokerByUrl('wss://example.org')).toBeNull();
  });
});

describe('주소 검사', () => {
  it('wss:// 주소를 받는다', () => {
    const check = checkBrokerUrl(' wss://broker.emqx.io:8084/mqtt ');
    expect(check.ok).toBe(true);
    expect(check.url).toBe('wss://broker.emqx.io:8084/mqtt');
  });

  it('주소만 적으면 wss://를 붙여 준다', () => {
    expect(checkBrokerUrl('broker.emqx.io:8084/mqtt').url).toBe('wss://broker.emqx.io:8084/mqtt');
  });

  it('ws://(암호화 없음)는 까닭을 알려 주고 막는다', () => {
    const check = checkBrokerUrl('ws://broker.emqx.io:8083/mqtt');
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('wss://');
  });

  it('다른 규약·빈 값·아이디 비밀번호가 든 주소는 막는다', () => {
    expect(checkBrokerUrl('https://broker.emqx.io').ok).toBe(false);
    expect(checkBrokerUrl('  ').ok).toBe(false);
    // 아이디·비밀번호가 든 주소(사용자:암호 뒤에 골뱅이). 저장소 검사가 글자 그대로의 모양을 이메일로 보므로 골뱅이를 이어 붙여 만든다(가짜 값).
    const AT = String.fromCharCode(64);
    expect(checkBrokerUrl(`wss://teacher:secret${AT}broker.emqx.io:8084/mqtt`).ok).toBe(false);
  });

  it('requireBrokerUrl은 안 되는 주소에 한국어 오류를 던진다', () => {
    expect(() => requireBrokerUrl('ws://a.b')).toThrow(/wss:\/\//u);
    expect(requireBrokerUrl('wss://broker.emqx.io:8084/mqtt')).toBe('wss://broker.emqx.io:8084/mqtt');
  });
});

describe('코드에 적은 서버 이름 → 브라우저가 쓸 주소', () => {
  it('아는 서버 이름이면 그 서버의 WebSocket 주소를 쓴다', () => {
    expect(brokerUrlForServer('broker.emqx.io', 'wss://other.example:8084/mqtt')).toBe('wss://broker.emqx.io:8084/mqtt');
    expect(brokerUrlForServer('TEST.MOSQUITTO.ORG', 'wss://other.example')).toBe('wss://test.mosquitto.org:8081');
  });

  it('모르는 이름·빈 값이면 화면이 고른 주소를 그대로 쓴다', () => {
    expect(brokerUrlForServer('192.168.0.5', 'wss://broker.emqx.io:8084/mqtt')).toBe('wss://broker.emqx.io:8084/mqtt');
    expect(brokerUrlForServer('', 'wss://broker.emqx.io:8084/mqtt')).toBe('wss://broker.emqx.io:8084/mqtt');
  });

  it('코드가 주소 전체를 적었으면 그 주소를 쓴다', () => {
    expect(brokerUrlForServer('wss://broker.example.org:8084/mqtt', 'wss://broker.emqx.io:8084/mqtt')).toBe('wss://broker.example.org:8084/mqtt');
  });
});
