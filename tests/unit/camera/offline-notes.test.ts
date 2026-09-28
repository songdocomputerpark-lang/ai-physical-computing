// 오프라인판 안내 글(판 1.1.0, PROGRESS 미해결 199 요청 E-10) 단위 테스트.
// ① 점검 페이지 네트워크 점검: 오프라인판에서만 "인터넷 항목은 막힘으로 나와도 정상" 한 줄(src/components/start/network-check/items.ts)
// ② 준비 칸: 오프라인판은 인터넷(jsDelivr) 이야기 대신 "이 컴퓨터의 작은 서버(검은 창)" 안내(src/lab/modules/loading/offline-note.ts) —
//    서비스 워커의 "이 컴퓨터의 작은 서버가 꺼져 있어요" 쪽(src/sw/sw.js)과 같은 낱말을 쓴다.
// 오프라인판 빌드 전체(npm run build:offline → npm run test:offline)는 깨끗한 작업 폴더에서만 돌아 이 구역에서는 돌리지 않았다 — 통합 몫.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { offlineNetworkNote } from '../../../src/components/start/network-check/items.ts';
import { OFFLINE_SERVER_DOWN_NOTE, OFFLINE_SERVER_SLOW_NOTE } from '../../../src/lab/modules/loading/offline-note.ts';
import { OFFLINE_BUILD } from '../../../src/lab/runtime/config.ts';

describe('점검 페이지 네트워크 점검의 오프라인판 한 줄', () => {
  it('오프라인판에서만 보이고, 인터넷 항목이 막힘으로 나와도 정상이라고 알린다', () => {
    const note = offlineNetworkNote(true);
    expect(note).toContain('오프라인판');
    expect(note).toContain('"막힘"으로 나와도 정상');
    expect(note).toContain('이 컴퓨터의 작은 서버(검은 창)');
    expect(offlineNetworkNote(false)).toBeNull();
  });

  it('온라인 사이트·Node에서는 OFFLINE_BUILD가 false라 그 줄이 없다', () => {
    expect(OFFLINE_BUILD).toBe(false);
    expect(offlineNetworkNote(OFFLINE_BUILD)).toBeNull();
  });

  it('점검 화면은 빌드 때 OFFLINE_BUILD 표시로 그 줄을 넣는다', () => {
    const source = fs.readFileSync('src/components/start/network-check/NetworkCheck.astro', 'utf8');
    expect(source).toContain('offlineNetworkNote(OFFLINE_BUILD)');
    expect(source).toContain('data-network-offline-note');
  });
});

describe('준비 칸의 오프라인판 안내', () => {
  it('서버가 꺼졌을 때: 검은 창·시작하기.bat 다시 실행·새로고침(인터넷 이야기는 없다)', () => {
    expect(OFFLINE_SERVER_DOWN_NOTE).toContain('이 컴퓨터의 작은 서버(검은 창)');
    expect(OFFLINE_SERVER_DOWN_NOTE).toContain('시작하기.bat');
    expect(OFFLINE_SERVER_DOWN_NOTE).toContain('새로고침');
    expect(OFFLINE_SERVER_DOWN_NOTE).not.toMatch(/인터넷|jsDelivr/u);
    expect(OFFLINE_SERVER_SLOW_NOTE).toContain('켜져 있어요');
    expect(OFFLINE_SERVER_SLOW_NOTE).not.toMatch(/인터넷|jsDelivr/u);
  });

  it('서비스 워커의 오프라인판 쪽과 같은 낱말("이 컴퓨터의 작은 서버")을 쓴다', () => {
    const sw = fs.readFileSync('src/sw/sw.js', 'utf8');
    expect(sw).toContain('이 컴퓨터의 작은 서버');
    expect(sw).toContain('시작하기.bat');
  });

  it('준비 모듈은 오프라인판에서 인터넷을 살피지 않고 작은 서버만 살핀다', () => {
    const source = fs.readFileSync('src/lab/modules/loading/index.ts', 'utf8');
    // 오프라인판 갈래: "if (OFFLINE_BUILD) {"부터 온라인 살핌이 시작하는 주석("검색어를 붙여") 앞까지
    const start = source.indexOf('if (OFFLINE_BUILD) {');
    const branch = source.slice(start, source.indexOf('// 검색어를 붙여', start));
    expect(start).toBeGreaterThan(0);
    expect(branch.length).toBeGreaterThan(100);
    expect(branch).toContain('pyodideSiteUrl');
    expect(branch).not.toContain('pyodideCdnUrl');
    expect(branch).toContain('OFFLINE_SERVER_DOWN_NOTE');
  });
});
