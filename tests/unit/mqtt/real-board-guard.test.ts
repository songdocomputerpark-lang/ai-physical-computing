// 실제 보드로 보내는 MQTT 코드의 통신 접두어 검사 — src/lab/mqtt/real-board-guard.ts (2026-09-25 Phase 4 검토 반영, PLAN §7.4 PD-29)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createPrefix } from '../../../src/lab/bridge/index.ts';
import { findPrefixValue, hasTopicPrefix, mqttPrefixProblem, usesMqtt, REAL_BOARD_MQTT_TEXT } from '../../../src/lab/mqtt/index.ts';

const TEMPLATE = readFileSync(fileURLToPath(new URL('../../../examples/esp32/templates/mqtt-pub-sub.py', import.meta.url)), 'utf8');
const DASHBOARD_DEMO = readFileSync(fileURLToPath(new URL('../../../examples/esp32/templates/dashboard-demo.py', import.meta.url)), 'utf8');

describe('실제 보드 MQTT 접두어 검사', () => {
  it('MQTT를 쓰는 코드인지 import 줄·MQTTClient(…)로 알아보고, 주석 속 낱말에는 걸리지 않는다', () => {
    expect(usesMqtt('from umqtt.simple import MQTTClient\n')).toBe(true);
    expect(usesMqtt('import umqtt\n')).toBe(true);
    expect(usesMqtt('client = MQTTClient("a", "b")\n')).toBe(true);
    expect(usesMqtt('# from umqtt.simple import MQTTClient 은 다음 차시에\nprint(1)\n')).toBe(false);
    expect(usesMqtt('from machine import Pin\n')).toBe(false);
  });

  it('사이트 템플릿·대시보드 예제를 그대로 두면(PREFIX = "") 실제 보드로 보내지 않는다', () => {
    expect(mqttPrefixProblem(TEMPLATE)).toBe(REAL_BOARD_MQTT_TEXT.noPrefix());
    expect(mqttPrefixProblem(DASHBOARD_DEMO)).toBe(REAL_BOARD_MQTT_TEXT.noPrefix());
  });

  it('PREFIX 줄에 12글자 접두어를 적거나, 토픽 글자가 접두어로 시작하면 통과한다', () => {
    const prefix = createPrefix();
    const filled = TEMPLATE.replace(/^PREFIX = ""/mu, `PREFIX = "${prefix}"`);
    expect(hasTopicPrefix(filled)).toBe(true);
    expect(mqttPrefixProblem(filled)).toBeNull();
    const literal = `from umqtt.simple import MQTTClient\nclient = MQTTClient("a", "broker.emqx.io")\nclient.publish("${prefix}/esp32-01/tx", "1")\n`;
    expect(mqttPrefixProblem(literal)).toBeNull();
  });

  it('접두어 모양이 아닌 값(짧음·l·o·0·1이 섞임)은 접두어로 보지 않는다', () => {
    const base = 'from umqtt.simple import MQTTClient\n';
    expect(hasTopicPrefix(`${base}PREFIX = "abc"\n`)).toBe(false);
    expect(hasTopicPrefix(`${base}PREFIX = "hello0world1"\n`)).toBe(false);
    expect(hasTopicPrefix(`${base}# PREFIX = "${createPrefix()}"\n`)).toBe(false);
  });

  it('MQTT를 쓰지 않는 코드는 검사하지 않는다', () => {
    expect(mqttPrefixProblem('from machine import Pin\nled = Pin(2, Pin.OUT)\n')).toBeNull();
  });

  it('[코드에 접두어 적기]가 바꿔 쓸 자리(따옴표 안)를 찾는다 — 들여쓴 줄은 보지 않는다', () => {
    const code = 'x = 1\nPREFIX = ""\ndef f():\n    PREFIX = "q"\n';
    const found = findPrefixValue(code);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('PREFIX');
    expect(found?.value).toBe('');
    const prefix = createPrefix();
    const written = `${code.slice(0, found?.from)}${prefix}${code.slice(found?.to)}`;
    expect(written).toBe(`x = 1\nPREFIX = "${prefix}"\ndef f():\n    PREFIX = "q"\n`);
    expect(findPrefixValue('def f():\n    PREFIX = ""\n')).toBeNull();
  });
});
