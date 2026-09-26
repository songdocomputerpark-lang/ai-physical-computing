// 학습 페이지가 느린 3G에서 3초 안에 읽히는지(Phase 6 P6-02 — 구역 A) 브라우저 측정. 규칙·조건 값은 scripts/perf-rules.mjs 한 곳.
//
// npm run perf:measure(perf 무리)에서만 돈다 — 전체 실행(npm run test:e2e)에서는 건너뛴다(느린 망이라 오래 걸리고, 컴퓨터가 바쁘면 값이 흔들린다).
// DevTools "3G"(옛 Slow 3G, 400kbit/s·지연 2,000ms — 판정)와 "Slow 4G"(옛 Fast 3G, 1.44Mbit/s·562.5ms — PLAN §8.1·§8.2 비교용)로 학습 페이지
// (PERF_PAGES의 timed 쪽 — 차시·목록·용어사전·교사용)를 처음 방문처럼 열어 FCP(판정 — PLAN §8.1)·본문 첫 문단(Element Timing)·LCP·DCL·load·
// 받은 양·첫 그리기를 막은 파일을 잰다. 판정 조건은 쪽마다 3번(APC_PERF_RUNS) 재 가운데 값 — 첫 번은 load까지, 나머지는 첫 그리기까지만.
// 재는 동안 추적 기록·화면 찍기는 끄고(이 파일 맨 위 test.use — describe 안에서는 Playwright가 받지 않는다) 서비스 워커는 막는다.
// 개발 서버(PW_BASE_URL=…:4901)에서는 파일을 묶지 않고 압축도 없어 참고값만 적고 판정하지 않는다 — 판정은 빌드 결과로(npm run perf:measure).
// 다른 무거운 일(브라우저 검사·빌드)과 함께 돌리면 값이 흔들린다 — 혼자 돌린다.
//
// 결과: 콘솔 표 + 테스트 첨부(perf-pages-3g.json·perf-pages-slow-4g.json). 보고서는 .cache/phase6-notes/zone-a-perf.md.
import fs from 'node:fs';
import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { JUDGED_PROFILE, PERF_PAGES, READ_BUDGET_MS, THROTTLE_PROFILES, formatTimingRow, type PerfPage } from '../../scripts/perf-rules.mjs';
import { withBase } from '../../src/lib/url.ts';

const IS_PERF_GROUP = process.env.APC_E2E_GROUP === 'perf';

// 재는 동안 추적 기록·화면 찍기를 끈다 — 렌더러를 바쁘게 해 첫 그리기가 늦게 잡힌다(2026-09-26: 켜 둔 채 2.3초짜리 쪽이 한 번 4.8초로 잡힘).
test.use({ trace: 'off', screenshot: 'off' });

/** 개발 서버를 함께 쓰는 동안 Vite가 쪽을 다시 부르지 않게 HMR 웹소켓의 다시 부르기 알림만 버린다(perf-pages.spec.ts와 같다) */
async function freezeDevReloads(target: BrowserContext | Page): Promise<void> {
  await target.routeWebSocket(/\/\?token=/u, (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (typeof message === 'string' && /"type":"(?:full-reload|update|prune)"/u.test(message)) {
        return;
      }
      socket.send(message);
    });
    socket.onMessage((message) => server.send(message));
  });
}

/** 개발 서버인지(Vite 클라이언트가 붙어 있으면) — 시간 판정을 하지 않는다 */
async function isDevServer(page: Page): Promise<boolean> {
  return page.evaluate(() => Boolean(document.querySelector('script[src*="/@vite/client"]')));
}

function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)}KB`;
}

function attachJson(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  const file = testInfo.outputPath(name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return testInfo.attach(name, { path: file, contentType: 'application/json' });
}

interface TimingRow {
  readonly path: string;
  readonly label: string;
  readonly profile: string;
  readonly fcp: number | null;
  readonly firstText: number | null;
  readonly lcp: number | null;
  readonly dcl: number | null;
  readonly load: number | null;
  readonly bytes: number;
  readonly requests: number;
  readonly fontBytes: number;
  readonly htmlBytes: number;
  /** 첫 그리기를 막은 파일 이름(CSS·head의 동기 스크립트) */
  readonly renderBlocking: readonly string[];
}

/**
 * 첫 방문처럼(캐시 없는 새 문맥) 느린 망 조건으로 열어 시간을 잰다.
 * 서비스 워커는 막는다 — 첫 방문은 서비스 워커가 쪽을 맡지 않고(등록은 load 무렵), 사전 캐시 받기가 뒤의 글꼴·스크립트와 대역폭을 나눠 DCL·load만
 * 흔든다(FCP와 상관없음). 그래서 DCL·load는 실제 첫 방문보다 조금 이르게 나올 수 있다.
 * mode 'paint'는 FCP·본문 첫 문단이 잡히면 바로 끝낸다(되풀이 측정용 — 3G에서 load까지 기다리면 한 번에 15~25초라). 이때 DCL·load·받은 양은 비어 있다.
 */
async function measureTiming(
  browser: Browser,
  baseURL: string,
  target: PerfPage,
  profileId: keyof typeof THROTTLE_PROFILES,
  mode: 'full' | 'paint' = 'full',
): Promise<TimingRow & { dev: boolean }> {
  const profile = THROTTLE_PROFILES[profileId];
  const context = await browser.newContext({ baseURL, viewport: { width: 1366, height: 768 }, locale: 'ko-KR', serviceWorkers: 'block' });
  await freezeDevReloads(context);
  const records: { type: string; bytes: number }[] = [];
  const pending: Promise<void>[] = [];
  context.on('requestfinished', (request) => {
    pending.push(
      request
        .sizes()
        .then((sizes) => {
          records.push({ type: request.resourceType(), bytes: Math.max(0, sizes.responseBodySize) + Math.max(0, sizes.responseHeadersSize) });
        })
        .catch(() => undefined),
    );
  });
  const page = await context.newPage();
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', { ...profile.conditions });
  await page.addInitScript(() => {
    const perf = { lcp: 0, firstText: null as number | null };
    (window as unknown as { __apcPerf: typeof perf }).__apcPerf = perf;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          perf.lcp = entry.startTime;
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { identifier?: string; renderTime?: number; loadTime?: number })[]) {
          if (entry.identifier === 'apc-first-paragraph' && perf.firstText === null) {
            perf.firstText = entry.renderTime || entry.loadTime || entry.startTime;
          }
        }
      }).observe({ type: 'element', buffered: true });
    } catch {
      // 이 브라우저에 없는 관찰 종류
    }
    // 본문 첫 문단 = main 안에서 글자가 15자 이상인 첫 <p>(차시는 머리의 단원 이름 줄을 건너뛰고 한 줄 소개 lead가 된다)
    const mark = () => {
      if (document.querySelector('[elementtiming="apc-first-paragraph"]')) {
        return;
      }
      for (const paragraph of document.querySelectorAll('main p')) {
        if ((paragraph.textContent ?? '').trim().length >= 15) {
          paragraph.setAttribute('elementtiming', 'apc-first-paragraph');
          return;
        }
      }
    };
    new MutationObserver(mark).observe(document, { childList: true, subtree: true });
  });
  if (mode === 'full') {
    await page.goto(withBase(target.path), { waitUntil: 'load', timeout: 300_000 });
    await page.waitForTimeout(300);
  } else {
    await page.goto(withBase(target.path), { waitUntil: 'commit', timeout: 300_000 });
    await page
      .waitForFunction(
        () =>
          performance.getEntriesByName('first-contentful-paint').length > 0 &&
          (window as unknown as { __apcPerf?: { firstText: number | null } }).__apcPerf?.firstText !== null,
        null,
        { timeout: 60_000, polling: 100 },
      )
      .catch(() => undefined);
  }
  const dev = await isDevServer(page);
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const perf = (window as unknown as { __apcPerf: { lcp: number; firstText: number | null } }).__apcPerf;
    // 첫 그리기를 막은 파일(Resource Timing의 renderBlockingStatus — Chromium 107부터). 글꼴 CSS를 media로 늦게 붙이면 여기서 빠진다.
    const blocking = (performance.getEntriesByType('resource') as (PerformanceResourceTiming & { renderBlockingStatus?: string })[])
      .filter((entry) => entry.renderBlockingStatus === 'blocking')
      .map((entry) => entry.name.split('/').pop() ?? entry.name);
    return {
      fcp: fcp ? fcp.startTime : null,
      firstText: perf.firstText,
      lcp: perf.lcp || null,
      dcl: nav && nav.domContentLoadedEventEnd > 0 ? nav.domContentLoadedEventEnd : null,
      load: nav && nav.loadEventEnd > 0 ? nav.loadEventEnd : null,
      htmlBytes: nav ? nav.transferSize : 0,
      renderBlocking: blocking,
    };
  });
  if (mode === 'full') {
    await Promise.all(pending);
  }
  await context.close();
  return {
    path: target.path,
    label: target.label,
    profile: profileId,
    ...timing,
    bytes: records.reduce((sum, record) => sum + record.bytes, 0),
    requests: records.length,
    fontBytes: records.filter((record) => record.type === 'font').reduce((sum, record) => sum + record.bytes, 0),
    dev,
  };
}

/** 여러 번 잰 값의 가운데 값(짝수 개면 가운데 둘의 평균). 값이 없으면 null */
function median(values: readonly (number | null)[]): number | null {
  const sorted = values.filter((value): value is number => typeof value === 'number').sort((a, b) => a - b);
  if (sorted.length === 0) {
    return null;
  }
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[middle] ?? null) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * 판정 조건은 쪽마다 여러 번 재 가운데 값을 쓴다(기본 3번 — 환경 변수 APC_PERF_RUNS로 바꿈). 컴퓨터가 바쁘면 한 번 잰 FCP가 2초 넘게
 * 튀는 일이 있었다(2026-09-26 — 다른 검사와 함께 돌 때 2.3초짜리 쪽이 한 번 4.8초). 비교용 조건은 한 번.
 */
const JUDGED_RUNS = Math.max(1, Number.parseInt(process.env.APC_PERF_RUNS ?? '3', 10) || 3);

test.describe('느린 3G에서 학습 페이지가 3초 안에 읽힌다(P6-02, perf 무리)', () => {
  test.describe.configure({ timeout: 3_600_000 });
  test.skip(({ isMobile }) => Boolean(isMobile), '망 조건 측정은 데스크톱 화면 하나로');
  test.skip(!IS_PERF_GROUP, 'npm run perf:measure에서만 잰다(느린 망이라 오래 걸린다)');

  for (const profileId of Object.keys(THROTTLE_PROFILES) as (keyof typeof THROTTLE_PROFILES)[]) {
    const judged = profileId === JUDGED_PROFILE;
    const runs = judged ? JUDGED_RUNS : 1;
    test(`${THROTTLE_PROFILES[profileId].label}${judged ? ' — 판정: FCP 3초 안' : ' — 비교용'}`, async ({ browser, baseURL }, testInfo) => {
      const rows: (TimingRow & { dev: boolean; fcpRuns: (number | null)[] })[] = [];
      for (const target of PERF_PAGES.filter((item) => item.timed)) {
        const samples: (TimingRow & { dev: boolean })[] = [];
        for (let run = 0; run < runs; run += 1) {
          // 첫 번은 load까지(DCL·load·받은 양), 나머지는 첫 그리기까지만(FCP·첫 문단을 되풀이해 가운데 값을 얻으려고)
          samples.push(await measureTiming(browser, baseURL ?? '', target, profileId, run === 0 ? 'full' : 'paint'));
        }
        // DCL·load·받은 양은 첫(전체) 번, FCP·첫 문단·LCP는 가운데 값으로 적는다
        const fcpRuns = samples.map((sample) => sample.fcp);
        const middleFcp = median(fcpRuns);
        const base = samples[0]!;
        const row = {
          ...base,
          fcp: middleFcp,
          firstText: median(samples.map((sample) => sample.firstText)),
          lcp: median(samples.map((sample) => sample.lcp)),
          fcpRuns,
        };
        rows.push(row);
        const runsText = runs > 1 ? ` · FCP ${runs}번 ${fcpRuns.map((value) => (value === null ? '—' : Math.round(value))).join('/')}ms(가운데 값)` : '';
        console.log(
          `[느린 망] ${formatTimingRow(row)} · HTML ${kb(row.htmlBytes)} · 그리기를 막은 파일 ${row.renderBlocking.length}개${row.renderBlocking.length > 0 ? `(${row.renderBlocking.join(', ')})` : ''}${runsText}${row.dev ? ' (개발 서버 — 참고값)' : ''}`,
        );
        if (judged && !row.dev) {
          // 넘으면 까닭(첫 그리기를 막은 파일 — 파일마다 왕복 지연 2초)을 메시지에 함께 적는다
          const why = row.renderBlocking.length > 0 ? ` — 첫 그리기를 막은 파일 ${row.renderBlocking.join(', ')}` : '';
          expect.soft(row.fcp, `/${target.path}(${target.label})의 FCP를 재지 못했어요`).not.toBeNull();
          expect.soft(row.fcp ?? Number.POSITIVE_INFINITY, `/${target.path}(${target.label})의 FCP(${THROTTLE_PROFILES[profileId].label})${why}`).toBeLessThanOrEqual(READ_BUDGET_MS);
        }
      }
      const worst = rows.reduce((max, row) => Math.max(max, row.fcp ?? 0), 0);
      console.log(`[느린 망] ${THROTTLE_PROFILES[profileId].label}: 가장 늦은 FCP ${Math.round(worst)}ms(한도 ${READ_BUDGET_MS}ms${judged ? '' : ' — 비교용'})`);
      testInfo.annotations.push({ type: `FCP 최댓값(${profileId})`, description: `${Math.round(worst)}ms` });
      await attachJson(testInfo, `perf-pages-${profileId}.json`, { measuredAt: new Date().toISOString(), baseURL, profile: THROTTLE_PROFILES[profileId], budgetMs: READ_BUDGET_MS, judged, rows });
    });
  }
});
