// 준비 칸의 CDN 살핌 판단(src/lab/loader/fallback-plan.ts — 판 1.2.0, PROGRESS 미해결 215).
// 화면의 살핌(pyodide.mjs 18KB)은 워커가 받는 큰 파일과 같은 HTTP/2 연결에 실려 느린 회선에서는 첫 바이트가 한참 늦을 수 있다 —
// 살핌의 "멈춤"(바이트를 하나도 못 받음)만으로는 막혔다고 하지 않는다. 연결 실패·HTTP 오류·차단 안내 쪽·실행기 실패는 예전처럼 바꾼다.
import { describe, expect, it } from 'vitest';
import { PROBE_AFTER_IDLE_MS, PROBE_STALL_MS, PYODIDE_STALL_MS } from '../../../src/lab/loader/constants.ts';
import { SLOW_LINE_NOTE, isDecisiveProbeFailure, planFallback, shouldProbeOnIdle, type FallbackInput } from '../../../src/lab/loader/fallback-plan.ts';
import type { ProbeStatus } from '../../../src/lab/loader/probe.ts';

const base: FallbackInput = { trigger: 'idle', cdn: 'ok', controlled: false, reloadAllowed: true };

describe('살핌 결과 가운데 막힘의 확실한 증거', () => {
  it('연결 실패·HTTP 오류·파일 대신 HTML만 — 멈춤(stalled)은 느린 회선일 수 있어 넣지 않는다', () => {
    const decisive: ProbeStatus[] = ['error', 'http', 'blocked-page'];
    for (const status of decisive) {
      expect(isDecisiveProbeFailure(status), status).toBe(true);
    }
    expect(isDecisiveProbeFailure('stalled')).toBe(false);
    expect(isDecisiveProbeFailure('ok')).toBe(false);
  });

  it('살핌의 멈춤 기준은 서비스 워커와 같은 15초다(예전 5초 — 큰 파일 뒤에 줄을 선 살핌을 막힘으로 봤다)', () => {
    expect(PROBE_STALL_MS).toBe(PYODIDE_STALL_MS);
    expect(PYODIDE_STALL_MS).toBe(15_000);
  });
});

describe('planFallback — 받는 중인데 15초 동안 진행이 없을 때(idle)', () => {
  it('CDN 살핌이 되면 느린 것뿐이다(아무것도 바꾸지 않음)', () => {
    expect(planFallback({ ...base, cdn: 'ok' })).toEqual({ tellServiceWorker: false, needSiteProbe: false, action: 'none', reason: 'idle:cdn-ok' });
  });

  it('CDN 살핌이 멈추기만 했으면 느린 회선으로 본다 — 서비스 워커에 알리지 않고, 다시 불러오지 않고, 예비본 살핌도 하지 않는다', () => {
    for (const controlled of [true, false]) {
      for (const reloadAllowed of [true, false]) {
        expect(planFallback({ ...base, cdn: 'stalled', controlled, reloadAllowed })).toEqual({
          tellServiceWorker: false,
          needSiteProbe: false,
          action: 'slow',
          reason: 'idle:cdn-stalled',
        });
      }
    }
  });

  it('연결 실패면(막힘의 증거) 곧바로 서비스 워커에 알리고 예비본이 살아 있는지 본다', () => {
    expect(planFallback({ ...base, cdn: 'error' })).toEqual({ tellServiceWorker: true, needSiteProbe: true, action: 'none', reason: 'idle:cdn-error' });
  });

  it('예비본이 살아 있으면 — 서비스 워커가 맡은 쪽은 그대로 예비본으로, 맡지 않은 쪽은 한 번 다시 불러온다(예전과 같음)', () => {
    expect(planFallback({ ...base, cdn: 'http', site: 'ok', controlled: true })).toMatchObject({ action: 'site', tellServiceWorker: true, reason: 'idle:cdn-http:site-ok' });
    expect(planFallback({ ...base, cdn: 'blocked-page', site: 'ok', controlled: false, reloadAllowed: true })).toMatchObject({ action: 'reload', tellServiceWorker: true });
    expect(planFallback({ ...base, cdn: 'error', site: 'ok', controlled: false, reloadAllowed: false })).toMatchObject({ action: 'blocked-no-reload' });
  });

  it('예비본도 받을 수 없으면 막혔다고 알린다', () => {
    for (const site of ['stalled', 'error', 'http', 'blocked-page'] as ProbeStatus[]) {
      expect(planFallback({ ...base, cdn: 'error', site })).toMatchObject({ action: 'blocked', reason: `idle:cdn-error:site-${site}` });
    }
  });
});

describe('planFallback — 실행기가 준비에 실패했을 때(failed)', () => {
  it('실행기 실패 뒤에는 CDN 살핌의 멈춤도 막힘으로 본다(워커가 이미 CDN·예비본 주소를 해 봄 — 예전과 같음)', () => {
    expect(planFallback({ ...base, trigger: 'failed', cdn: 'stalled' })).toMatchObject({ tellServiceWorker: true, needSiteProbe: true, reason: 'failed:cdn-stalled' });
    expect(planFallback({ ...base, trigger: 'failed', cdn: 'stalled', site: 'ok', controlled: false, reloadAllowed: true })).toMatchObject({ action: 'reload' });
    expect(planFallback({ ...base, trigger: 'failed', cdn: 'stalled', site: 'stalled' })).toMatchObject({ action: 'blocked' });
  });

  it('실행기가 실패했어도 CDN 살핌이 되면 바꾸지 않는다', () => {
    expect(planFallback({ ...base, trigger: 'failed', cdn: 'ok' })).toMatchObject({ action: 'none', tellServiceWorker: false });
  });
});

describe('shouldProbeOnIdle — "받는 중인데 진행 없음"으로 살필 때', () => {
  const idle = { runtimeState: 'loading', phase: 'loading', quietMs: PROBE_AFTER_IDLE_MS, probing: false, swDeliveringPyodide: false };

  it('파이썬 엔진을 받는 중이고 15초 동안 진행 신호가 없으면 살핀다', () => {
    expect(shouldProbeOnIdle(idle)).toBe(true);
    expect(shouldProbeOnIdle({ ...idle, runtimeState: 'unloaded' })).toBe(true);
    expect(shouldProbeOnIdle({ ...idle, quietMs: PROBE_AFTER_IDLE_MS - 1 })).toBe(false);
  });

  it('서비스 워커가 이 쪽의 파이썬 파일을 맡아 받기 메시지를 보냈으면 살피지 않는다(바이트로 판단하는 것은 서비스 워커 몫)', () => {
    expect(shouldProbeOnIdle({ ...idle, swDeliveringPyodide: true, quietMs: 10 * 60_000 })).toBe(false);
  });

  it('이미 살피는 중이거나 엔진 준비가 끝났거나(패키지만 받는 중) 받는 중이 아니면 살피지 않는다', () => {
    expect(shouldProbeOnIdle({ ...idle, probing: true })).toBe(false);
    for (const runtimeState of ['idle', 'running', 'stopping', 'failed']) {
      expect(shouldProbeOnIdle({ ...idle, runtimeState }), runtimeState).toBe(false);
    }
    expect(shouldProbeOnIdle({ ...idle, phase: 'ready' })).toBe(false);
  });
});

describe('느린 회선 안내 글(학생 글)', () => {
  it('해요체 한두 문장이고 내부 결정 번호·영어 기술 낱말이 없다', () => {
    expect(SLOW_LINE_NOTE).toMatch(/요\.$/u);
    expect(SLOW_LINE_NOTE).not.toMatch(/\b(?:PD|C|O)-?\d+\b|CDN|probe|stall/iu);
    expect(SLOW_LINE_NOTE.split(/(?<=[.!?])\s+/u).length).toBeLessThanOrEqual(2);
  });
});
