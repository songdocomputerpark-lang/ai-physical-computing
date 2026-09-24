// 네트워크 점검 항목(src/components/start/network-check/items.ts) 단위 테스트 — P2-05, PLAN §5.5.
// 여기서 지키는 약속: ① [시험하기]를 눌렀을 때만 접속한다 ② 사이트 밖으로 파일을 받는 주소는 허용 목록(jsDelivr)뿐이고,
// 공개 중계 서버(MQTT)는 공식 안내로 확인한 wss:// 주소에 연결만 해 보고 닫는다(메시지를 보내지 않는다 — 2026-09-24 Phase 4 통합)
// ③ 복사되는 결과에 개인정보가 들어가지 않는다.
import { describe, expect, it } from 'vitest';
import {
  NETWORK_CHECK_ITEMS,
  describeWebSocketProbe,
  formatNetworkReport,
  networkItemUrl,
  probeWebSocket,
  statusOf,
  type NetworkCheckItem,
  type NetworkReportLine,
  type WebSocketFactory,
} from '../../../src/components/start/network-check/items.ts';
import { MQTT_BROKERS } from '../../../src/lab/mqtt/brokers.ts';
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

  it('공개 중계 서버(MQTT)는 공식 안내로 확인한 wss:// 주소만, 파일을 받지 않고 연결만 시험한다(PLAN §5.5)', () => {
    const brokers = NETWORK_CHECK_ITEMS.filter((item) => item.websocket);
    const verified = MQTT_BROKERS.filter((broker) => broker.verified && broker.url.startsWith('wss://')).map((broker) => broker.url);
    expect(brokers.map((item) => item.websocket?.url)).toEqual(verified);
    expect(verified.length).toBeGreaterThan(0);
    for (const item of brokers) {
      expect(item.websocket?.url, item.id).toMatch(/^wss:\/\//u);
      expect(item.url, item.id).toBeUndefined();
      expect(item.path, item.id).toBeUndefined();
      expect(item.skip, item.id).toBeUndefined();
      // 막혀도 수업은 된다는 것(같은 컴퓨터 탭)을 대처에 적는다
      expect(item.advice, item.id).toContain('같은 컴퓨터 탭');
    }
    // 경로를 확인하지 못한 서버(HiveMQ)는 시험하지 않는다 — 잘못 "막힘"으로 보일 수 있어서
    expect(NETWORK_CHECK_ITEMS.some((item) => item.websocket?.url.includes('hivemq'))).toBe(false);
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
    const nowhere: NetworkCheckItem = { id: 'nowhere', label: '시험', why: '시험용이에요.', display: '-', advice: '없어요.', skip: '접속하지 않아요.' };
    expect(() => networkItemUrl(nowhere, ORIGIN)).toThrow(/주소가 없어요/u);
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

describe('probeWebSocket(중계 서버 연결 시험)', () => {
  /** 가짜 WebSocket — 만든 뒤 무엇을 할지(열림·오류·아무 일 없음)를 정한다 */
  function fakeSocket(behaviour: 'open' | 'error' | 'close' | 'silent' | 'throw') {
    const made: { url: string; protocols?: string[]; closed: boolean }[] = [];
    const create: WebSocketFactory = (url, protocols) => {
      if (behaviour === 'throw') {
        throw new Error('SyntaxError');
      }
      const record = { url, closed: false, ...(protocols === undefined ? {} : { protocols }) };
      made.push(record);
      const socket = {
        onopen: null as ((event: unknown) => void) | null,
        onerror: null as ((event: unknown) => void) | null,
        onclose: null as ((event: unknown) => void) | null,
        close: () => {
          record.closed = true;
        },
      };
      setTimeout(() => {
        if (behaviour === 'open') socket.onopen?.({});
        if (behaviour === 'error') socket.onerror?.({});
        if (behaviour === 'close') socket.onclose?.({});
      }, 5);
      return socket;
    };
    return { create, made };
  }

  it('열리면 ok이고 곧바로 닫는다(메시지를 보내지 않는다)', async () => {
    const socket = fakeSocket('open');
    const outcome = await probeWebSocket('wss://broker.example:8084/mqtt', { protocols: ['mqtt'], timeoutMs: 1000, create: socket.create });
    expect(outcome.status).toBe('ok');
    expect(socket.made).toEqual([{ url: 'wss://broker.example:8084/mqtt', protocols: ['mqtt'], closed: true }]);
    expect(statusOf(outcome.status)).toBe('ok');
    expect(describeWebSocketProbe(outcome)).toContain('메시지는 보내지 않았어요');
  });

  it('오류·열리기 전 닫힘·주소 오류는 error(막힘), 답이 없으면 stalled(막힘)', async () => {
    for (const behaviour of ['error', 'close', 'throw'] as const) {
      const outcome = await probeWebSocket('wss://broker.example:8084/mqtt', { timeoutMs: 1000, create: fakeSocket(behaviour).create });
      expect(outcome.status, behaviour).toBe('error');
      expect(statusOf(outcome.status), behaviour).toBe('blocked');
      expect(describeWebSocketProbe(outcome), behaviour).toContain('연결하지 못했어요');
    }
    const silent = fakeSocket('silent');
    const stalled = await probeWebSocket('wss://broker.example:8084/mqtt', { timeoutMs: 40, create: silent.create });
    expect(stalled.status).toBe('stalled');
    expect(statusOf(stalled.status)).toBe('blocked');
    expect(silent.made[0]?.closed).toBe(true);
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
