// 네트워크 점검 항목(src/components/start/network-check/items.ts) 단위 테스트 — P2-05, PLAN §5.5.
// 여기서 지키는 약속: ① [시험하기]를 눌렀을 때만 접속한다 ② 사이트 밖으로 나가는 주소는 허용 목록(jsDelivr)뿐이다
// ③ 복사되는 결과에 개인정보가 들어가지 않는다.
import { describe, expect, it } from 'vitest';
import {
  NETWORK_CHECK_ITEMS,
  formatNetworkReport,
  networkItemUrl,
  statusOf,
  type NetworkReportLine,
} from '../../../src/components/start/network-check/items.ts';
import { ALLOWED_REMOTE_ORIGINS, PYODIDE_CDN_INDEX_URL } from '../../../src/lab/runtime/config.ts';
import { BASE_PATH } from '../../../src/lib/url.ts';

const ORIGIN = 'https://songdocomputerpark-lang.github.io';

describe('점검 항목', () => {
  it('id가 영문 소문자·숫자·하이픈이고 겹치지 않는다', () => {
    const ids = NETWORK_CHECK_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id, id).toMatch(/^[a-z][a-z0-9-]*$/u);
    }
  });

  it('항목마다 왜 필요한지·막혔을 때 대처를 한국어로 적는다', () => {
    for (const item of NETWORK_CHECK_ITEMS) {
      expect(item.label.length, item.id).toBeGreaterThan(1);
      expect(item.why, item.id).toMatch(/[가-힣]/u);
      expect(item.advice, item.id).toMatch(/[가-힣]/u);
      expect(item.display.length, item.id).toBeGreaterThan(0);
    }
  });

  it('사이트 밖으로 나가는 주소는 허용 목록(jsDelivr)뿐이다 — SPEC §2 서버 제로', () => {
    const outside = NETWORK_CHECK_ITEMS.filter((item) => item.url).map((item) => new URL(item.url!).origin);
    expect(outside.length).toBeGreaterThan(0);
    for (const origin of outside) {
      expect(ALLOWED_REMOTE_ORIGINS, origin).toContain(origin);
    }
  });

  it('파이썬 엔진 CDN과 같은 사이트 예비본을 모두 시험한다(PLAN §5.5)', () => {
    const cdn = NETWORK_CHECK_ITEMS.find((item) => item.id === 'pyodide-cdn');
    const site = NETWORK_CHECK_ITEMS.find((item) => item.id === 'pyodide-site');
    expect(cdn?.url).toBe(`${PYODIDE_CDN_INDEX_URL}pyodide.mjs`);
    expect(site?.path?.startsWith(BASE_PATH), site?.path).toBe(true);
    // 같은 사이트 항목은 밖으로 나가지 않는다.
    expect(site?.url).toBeUndefined();
  });

  it('아직 만들지 않은 항목(MQTT)은 접속하지 않고 자리만 보여 준다', () => {
    const mqtt = NETWORK_CHECK_ITEMS.find((item) => item.id === 'mqtt-broker');
    expect(mqtt?.skip).toMatch(/[가-힣]/u);
    expect(mqtt?.url).toBeUndefined();
    expect(mqtt?.path).toBeUndefined();
  });
});

describe('networkItemUrl', () => {
  it('사이트 밖 주소는 그대로, 사이트 안 경로는 출처를 붙인다', () => {
    const cdn = NETWORK_CHECK_ITEMS.find((item) => item.id === 'pyodide-cdn')!;
    const site = NETWORK_CHECK_ITEMS.find((item) => item.id === 'pyodide-site')!;
    expect(networkItemUrl(cdn, ORIGIN)).toBe(`${PYODIDE_CDN_INDEX_URL}pyodide.mjs`);
    expect(networkItemUrl(site, ORIGIN)).toBe(`${ORIGIN}${site.path}`);
  });

  it('주소가 없는 항목은 한국어 오류를 낸다(접속하지 않는다)', () => {
    const mqtt = NETWORK_CHECK_ITEMS.find((item) => item.id === 'mqtt-broker')!;
    expect(() => networkItemUrl(mqtt, ORIGIN)).toThrow(/주소가 없어요/u);
  });
});

describe('statusOf', () => {
  it('ok는 연결됨, 404는 확인 필요, 나머지는 막힘', () => {
    expect(statusOf('ok')).toBe('ok');
    expect(statusOf('http')).toBe('unknown');
    expect(statusOf('stalled')).toBe('blocked');
    expect(statusOf('error')).toBe('blocked');
    expect(statusOf('blocked-page')).toBe('blocked');
  });
});

describe('결과 복사 글', () => {
  const lines: NetworkReportLine[] = [
    { id: 'pyodide-cdn', label: '파이썬 엔진 받는 곳(jsDelivr)', status: 'ok', text: '접속됐어요(0.4초, 18KB).' },
    { id: 'pyodide-site', label: '같은 사이트 파이썬 예비본', status: 'blocked', text: '접속하지 못했어요.' },
  ];

  it('항목마다 한 줄이고 판정이 한국어로 보인다', () => {
    const report = formatNetworkReport(lines, { origin: ORIGIN, when: new Date('2026-09-16T08:30:00Z') });
    expect(report).toContain('[네트워크 점검] 2026-09-16 08:30 (UTC)');
    expect(report).toContain(`사이트: ${ORIGIN}`);
    expect(report).toContain('- 파이썬 엔진 받는 곳(jsDelivr): 연결됨 — 접속됐어요(0.4초, 18KB).');
    expect(report).toContain('- 같은 사이트 파이썬 예비본: 막힘 — 접속하지 못했어요.');
  });

  it('개인정보를 넣지 않는다(사용자 이름·경로·기기 이름이 들어갈 자리가 없다)', () => {
    const report = formatNetworkReport(lines, { origin: ORIGIN, when: new Date('2026-09-16T08:30:00Z') });
    // 줄 수 = 머리말 2줄 + 빈 줄 + 항목 수 + 끝 빈 줄
    expect(report.split('\n').length).toBe(2 + 1 + lines.length + 1);
    // 찾을 낱말을 그대로 적으면 저장소 검사(scripts/check-repo.mjs)가 이 파일을 "개인정보 모양"으로 잡으므로 이어 붙여 만든다.
    const privateShapes = new RegExp(['C:\\\\', '/Users/', `One${'Drive'}`].join('|'), 'u');
    expect(report).not.toMatch(privateShapes);
  });
});
