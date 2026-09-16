// 1분 개념 카드(src/lab/loader/cards.ts)와 네트워크 점검 항목(src/components/start/network-check/items.ts) 단위 테스트 — P2-05.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONCEPT_CARDS, cardCounterText, nextCardIndex } from '../../../src/lab/loader/cards.ts';
import { NETWORK_CHECK_ITEMS, formatNetworkReport, networkItemUrl, statusOf } from '../../../src/components/start/network-check/items.ts';
import { BASE_PATH } from '../../../src/lib/url.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');

describe('1분 개념 카드', () => {
  it('3~5장이고 id가 겹치지 않는다', () => {
    expect(CONCEPT_CARDS.length).toBeGreaterThanOrEqual(3);
    expect(CONCEPT_CARDS.length).toBeLessThanOrEqual(5);
    expect(new Set(CONCEPT_CARDS.map((card) => card.id)).size).toBe(CONCEPT_CARDS.length);
    for (const card of CONCEPT_CARDS) {
      expect(card.id).toMatch(/^[a-z][a-z0-9-]*$/u);
    }
  });

  it('제목과 두세 문장이 있고 한 문장이 너무 길지 않다(고1이 읽는 글)', () => {
    for (const card of CONCEPT_CARDS) {
      expect(card.title.length, card.id).toBeGreaterThan(4);
      expect(card.title.length, card.id).toBeLessThanOrEqual(30);
      expect(card.body.length, card.id).toBeGreaterThanOrEqual(2);
      expect(card.body.length, card.id).toBeLessThanOrEqual(4);
      for (const sentence of card.body) {
        expect(sentence.length, `${card.id}: ${sentence}`).toBeLessThanOrEqual(70);
        expect(sentence.endsWith('.') || sentence.endsWith('요') || sentence.endsWith('다'), sentence).toBe(true);
      }
    }
  });

  it('용어 링크는 base가 붙은 사이트 안 주소이고 실제 용어사전 항목을 가리킨다', () => {
    for (const card of CONCEPT_CARDS) {
      if (!card.link) {
        continue;
      }
      expect(card.link.href.startsWith(`${BASE_PATH}glossary/#`), card.link.href).toBe(true);
      const slug = card.link.href.split('#')[1]!;
      expect(fs.existsSync(path.join(rootDir, 'content', 'glossary', `${slug}.md`)), `용어사전에 ${slug}이(가) 없어요`).toBe(true);
    }
  });

  it('카드 번호는 처음과 끝이 이어진다', () => {
    expect(nextCardIndex(0, 1, 5)).toBe(1);
    expect(nextCardIndex(4, 1, 5)).toBe(0);
    expect(nextCardIndex(0, -1, 5)).toBe(4);
    expect(nextCardIndex(2, 0, 5)).toBe(2);
    expect(nextCardIndex(0, 1, 0)).toBe(0);
    expect(cardCounterText(0, 5)).toBe('1 / 5');
    expect(cardCounterText(4, 5)).toBe('5 / 5');
  });
});

describe('네트워크 점검 항목', () => {
  it('항목마다 id·설명·대처가 있고 주소를 화면에 그대로 보여 준다', () => {
    expect(NETWORK_CHECK_ITEMS.length).toBeGreaterThanOrEqual(3);
    for (const item of NETWORK_CHECK_ITEMS) {
      expect(item.id).toMatch(/^[a-z][a-z0-9-]*$/u);
      expect(item.label.length).toBeGreaterThan(2);
      expect(item.why.length).toBeGreaterThan(5);
      expect(item.advice.length).toBeGreaterThan(5);
      expect(item.display.length).toBeGreaterThan(5);
    }
  });

  it('접속하는 곳은 jsDelivr와 이 사이트뿐이다(SPEC §2 서버 제로)', () => {
    for (const item of NETWORK_CHECK_ITEMS.filter((entry) => !entry.skip)) {
      const url = networkItemUrl(item, 'https://songdocomputerpark-lang.github.io');
      const origin = new URL(url).origin;
      expect(['https://cdn.jsdelivr.net', 'https://songdocomputerpark-lang.github.io']).toContain(origin);
    }
  });

  it('아직 만들지 않은 항목(MQTT)은 접속하지 않는다', () => {
    const mqtt = NETWORK_CHECK_ITEMS.find((item) => item.id === 'mqtt-broker')!;
    expect(mqtt.skip).toBeTruthy();
    expect(mqtt.url).toBeUndefined();
    expect(mqtt.path).toBeUndefined();
    expect(() => networkItemUrl(mqtt, 'https://x.test')).toThrow();
  });

  it('살핌 결과를 점검 표시로 바꾼다', () => {
    expect(statusOf('ok')).toBe('ok');
    expect(statusOf('stalled')).toBe('blocked');
    expect(statusOf('error')).toBe('blocked');
    expect(statusOf('blocked-page')).toBe('blocked');
    expect(statusOf('http')).toBe('unknown');
  });

  it('복사할 결과에는 사이트 주소와 판정만 들어간다(개인정보 없음)', () => {
    const report = formatNetworkReport(
      [
        { id: 'pyodide-cdn', label: '파이썬 엔진 받는 곳(jsDelivr)', status: 'ok', text: '접속됐어요(0.4초, 18KB).' },
        { id: 'pyodide-site', label: '같은 사이트 파이썬 예비본', status: 'blocked', text: '접속하지 못했어요.' },
      ],
      { origin: 'https://songdocomputerpark-lang.github.io', when: new Date('2026-09-16T07:00:00Z') },
    );
    expect(report).toContain('[네트워크 점검] 2026-09-16 07:00 (UTC)');
    expect(report).toContain('- 파이썬 엔진 받는 곳(jsDelivr): 연결됨');
    expect(report).toContain('- 같은 사이트 파이썬 예비본: 막힘');
    expect(report).not.toMatch(/@|010-|\.kr\b/u);
  });
});
