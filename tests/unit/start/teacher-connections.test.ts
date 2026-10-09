// 교사용 시작하기의 "외부로 연결되는 곳과 보내지는 것" 표(src/pages/start/teacher/_connections.ts)가 실습실이 고를 수 있는
// 공개 중계 서버 목록(src/lab/mqtt/brokers.ts의 MQTT_BROKERS)과 어긋나지 않는지 본다.
// 2026-09-30 최종 점검 PM-01: 판 1.1.0에서 HiveMQ를 목록에 더할 때 이 표만 빠져, 교사가 학생 IP·메시지가 갈 수 있는 곳을 모두 알 수 없었다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BROKER_ID, MQTT_BROKERS, type MqttBrokerOption } from '../../../src/lab/mqtt/brokers.ts';
import { BROKER_PRIVACY, brokerConnection, connections, listedBrokers } from '../../../src/pages/start/teacher/_connections.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');

describe('교사용 개인정보 안내 표 ↔ 공개 중계 서버 목록', () => {
  const listed = MQTT_BROKERS.filter((broker) => broker.url !== '');

  it('실습실이 고를 수 있는 서버마다 운영하는 곳과 처리방침이 적혀 있다(서버를 더하면 여기에도 더한다)', () => {
    expect(listed.length).toBeGreaterThan(0);
    for (const broker of listed) {
      expect(BROKER_PRIVACY[broker.id], `${broker.id}(${broker.url})의 운영하는 곳·처리방침이 _connections.ts에 없어요`).toBeDefined();
    }
  });

  it('처리방침 표에만 있고 서버 목록에는 없는 id가 없다(서버를 빼면 여기서도 뺀다)', () => {
    const ids = new Set(listed.map((broker) => broker.id));
    for (const id of Object.keys(BROKER_PRIVACY)) {
      expect(ids.has(id), `${id}는 MQTT_BROKERS에 없어요`).toBe(true);
    }
  });

  it('표의 중계 서버 줄에 서버마다 운영하는 곳 이름과 처리방침 링크가 들어간다 — HiveMQ 포함', () => {
    const row = connections.find((connection) => connection.where.includes('MQTT'));
    expect(row).toBeDefined();
    for (const broker of listed) {
      const privacy = BROKER_PRIVACY[broker.id]!;
      expect(row!.who).toContain(privacy.operator);
      expect(row!.links).toContainEqual(privacy.link);
    }
    expect(row!.who).toContain('HiveMQ');
    expect(row!.links.map((link) => link.url)).toContain('https://www.hivemq.com/legal/privacy-policy/');
    // 기본 서버가 "기본:"으로 맨 앞, [주소 직접 입력]도 알린다
    expect(row!.who).toContain(`기본: ${BROKER_PRIVACY[DEFAULT_BROKER_ID]!.operator}`);
    expect(row!.who).toContain('[주소 직접 입력]');
    for (const link of row!.links) {
      expect(link.url).toMatch(/^https:\/\//u);
    }
  });

  it('처리방침을 아직 적지 않은 서버를 더해도 표에서 이름이 빠지지 않는다(링크만 없음 — 위 검사가 실패로 알린다)', () => {
    const extra: MqttBrokerOption = { id: 'new-broker', label: '새 공개 브로커', url: 'wss://broker.example:8084/mqtt', verified: true, note: '' };
    const row = brokerConnection([...MQTT_BROKERS, extra]);
    expect(row.who).toContain('새 공개 브로커');
    expect(listedBrokers([...MQTT_BROKERS, extra]).map((broker) => broker.id)[0]).toBe(DEFAULT_BROKER_ID);
    expect(row.links).toHaveLength(listed.length);
  });

  it('표에는 네 곳(GitHub Pages·jsDelivr·공개 MQTT 브로커·서버 음성 인식)이 있고 개발 중 표현이 없다', () => {
    expect(connections.map((connection) => connection.where)).toEqual([
      expect.stringContaining('GitHub Pages'),
      expect.stringContaining('jsDelivr'),
      expect.stringContaining('MQTT'),
      expect.stringContaining('음성 인식'),
    ]);
    for (const connection of connections) {
      expect(`${connection.when} ${connection.who}`).not.toMatch(/생긴 뒤|준비 중|생겨요/u);
    }
  });

  it('교사용 시작하기 쪽이 이 표 데이터를 그대로 그린다', () => {
    const page = fs.readFileSync(path.join(rootDir, 'src', 'pages', 'start', 'teacher', 'index.astro'), 'utf8');
    expect(page).toContain("import { connections, listedBrokers } from './_connections.ts';");
    expect(page).toContain('connections.map((row)');
  });
});
