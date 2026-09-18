/**
 * 이 탭의 MQTT 연결 하나(P4-06) — 화면 패널·파이썬 흉내(`umqtt.simple`)·브릿지 통로가 **같은 연결**을 나눠 쓴다.
 *
 * 왜 하나인가: 탭마다 중계 서버 연결을 여러 개 열면 학교 와이파이에서 쓸데없이 느려지고, 학생이 보는 기록도
 * 두 군데로 갈라진다. 접두어·통로·주소가 바뀌면 `update()`가 연결을 닫고 다음 `connect()`에서 새로 연다.
 */
import { ensurePrefix } from '../bridge/index.ts';
import { MqttConnection, type MqttConnectionOptions } from './connection.ts';
import { readMqttSettings } from './settings.ts';

let current: MqttConnection | null = null;

/** 이 탭의 MQTT 연결을 얻는다(없으면 저장된 설정으로 만든다) */
export function getMqttSession(overrides: Partial<MqttConnectionOptions> = {}): MqttConnection {
  if (current === null) {
    const settings = readMqttSettings();
    current = new MqttConnection({
      prefix: overrides.prefix ?? ensurePrefix(),
      mode: settings.mode,
      brokerUrl: settings.brokerUrl,
      ...overrides,
    });
  } else if (Object.keys(overrides).length > 0) {
    current.update(overrides);
  }
  return current;
}

/** 지금 연결이 있으면 돌려준다(만들지 않는다 — 화면이 "연결 안 함" 상태를 볼 때) */
export function peekMqttSession(): MqttConnection | null {
  return current;
}

/** 테스트·페이지를 떠날 때 연결을 버린다 */
export function resetMqttSession(reason = '연결을 닫았어요.'): void {
  if (current !== null) {
    current.close(reason);
    current = null;
  }
}
