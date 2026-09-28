// 회선 전체를 느린 3G로 둔 시나리오 A 자동 측정(판 1.1.0 — PROGRESS 미해결 210, PLAN §11 위험 31). npm run perf:measure(perf 무리)에서만 돈다.
//
// 무엇을 재나: SPEC §13 시나리오 A(학생, 크롬만, 아무것도 모름) — 홈 → [카메라로 바로 해보기] → 실습실에서 곧바로 [실행](눌러 두면 준비가 끝나는
// 대로 돈다 — scenario-a.spec.ts와 같은 흐름) → (가짜) 웹캠 에지 결과 → 슬라이더로 임계값 변화까지를, **브라우저 문맥의 모든 요청**(페이지·
// 파이썬 워커·서비스 워커)이 한 느린 회선을 지나게 하고 잰다. 회선은 문맥 프록시(scripts/perf-line-proxy.mjs), 조건은 scripts/perf-rules.mjs의
// LINE_PROFILES['3g'](DevTools "3G" 대역폭 400kbit/s 양방향 + 왕복 400ms, 새 연결 2왕복).
// CDP 속도 제한(perf-timing.spec.ts)은 페이지 대상에만 걸려 워커가 받는 파이썬 엔진·패키지(약 20MB)를 느리게 하지 못한다(미해결 36) — 그래서 프록시.
//
// 판정은 **기록용**이다: SPEC의 5분(SCENARIO_A_LIMIT_MS)을 넘으면 넘은 그대로 적고(콘솔·주석·첨부 JSON) PLAN §11 위험 31로 잇는다.
// 검사하는 것은 측정이 성립했는지뿐이다 — 파이썬 엔진·패키지 바이트가 회선을 지났는지(= 워커 요청이 회선을 탔는지), 첫 에지와 슬라이더 효과가 나왔는지.
// 첫 방문과 같게 캐시 없는 새 문맥이고 서비스 워커를 켠다(홈이 등록하고 사전 캐시도 같은 회선을 먹는다). 미리 보기 서버의 응답에는 실사이트
// (GitHub Pages)와 같은 Cache-Control max-age=600을 붙인다(perf-rules.mjs SITE_CACHE_CONTROL — 1.1.0 검토: 미리 보기의 no-cache 때문에 둘째 쪽 글꼴
// CSS가 다시 확인되어 실사이트와 다른 수가 나왔다). 실습실(둘째 쪽)에서 글꼴 CSS를 켠 때가 load 뒤인지도 본다(BaseLayout __apcFontCss — soft 검사).
// 개발 서버는 파일을 묶지 않아(요청 수백 개)
// 뜻이 없어 건너뛴다 — 빌드 결과(npm run perf:measure의 미리 보기 서버)나 실사이트(PW_BASE_URL)로 잰다.
// 1.0.0 사용성 검토가 같은 조건을 손으로 잰 값: 준비됐어요 2분 38초, 첫 에지 7분 9초, 받은 양 20.97MB(.cache/phase6-notes/review-experience.md 5·6).
// 결과: 콘솔 줄 + 테스트 첨부(perf-scenario-a-3g.json).
import fs from 'node:fs';
import { expect, test, type BrowserContext, type Page, type TestInfo } from '@playwright/test';
import { startLineProxy, type LineStats } from '../../scripts/perf-line-proxy.mjs';
import { LINE_PROFILES, SCENARIO_A_LIMIT_MS, SITE_CACHE_CONTROL, lineAllowHosts } from '../../scripts/perf-rules.mjs';
import { ALLOWED_REMOTE_ORIGINS } from '../../src/lab/runtime/config.ts';
import { withBase } from '../../src/lib/url.ts';
import { labRoot } from './helpers/lab.ts';
import { VISION_PATH, averageWhiteRatio, framesShown } from './helpers/vision.ts';

const IS_PERF_GROUP = process.env.APC_E2E_GROUP === 'perf';
/** 한 단계를 기다리는 가장 긴 시간 — 회선 전체 3G에서 첫 에지가 7분쯤이라 넉넉하게 */
const STEP_TIMEOUT = 25 * 60_000;
/** 받는 동안 학생이 보는 글과 받은 양을 적는 간격 */
const SAMPLE_MS = 30_000;
/** 희미한 네모의 테두리가 생기고 사라질 때 흰 픽셀 평균 비율이 이만큼은 달라져야 한다(scenario-a.spec.ts와 같다) */
const MIN_RATIO_CHANGE = 0.0005;

// 재는 동안 추적 기록·화면 찍기를 끈다 — 10분 가까운 기록이 무겁고 렌더러를 바쁘게 한다(perf-timing.spec.ts와 같은 까닭, 파일 맨 위에서만 받는다).
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

/** 페이지 안에서 벽시계(Date.now)로 적는 일 — 실습실 뿌리 속성·첫 에지 장·DOMContentLoaded. 문서마다 새로 적는다. */
function installRecorder(): void {
  type Recorded = { name: string; value: string | null; at: number };
  const events: Recorded[] = [];
  (window as unknown as { __apcScenario: { events: Recorded[]; href: string } }).__apcScenario = { events, href: location.href };
  const log = (name: string, value: string | null) => events.push({ name, value, at: Date.now() });
  document.addEventListener('DOMContentLoaded', () => log('dcl', location.pathname), { once: true });
  window.addEventListener('load', () => log('load', location.pathname), { once: true });
  const seen = new Map<string, string | null>();
  const check = () => {
    // 글꼴 CSS를 켠 때(media print → all — BaseLayout __apcFontCss). 느린 망이면 load 뒤여야 한다.
    const fontLink = document.querySelector('link[href*="pretendardvariable-dynamic-subset.css"][rel="stylesheet"]');
    const fontMedia = fontLink?.getAttribute('media') ?? null;
    if (fontLink && seen.get('font-media') !== fontMedia) {
      seen.set('font-media', fontMedia);
      log('font-media', fontMedia);
    }
    const root = document.querySelector('[data-lab]');
    if (!root) {
      return;
    }
    for (const name of ['data-state', 'data-run-count', 'data-vision-packages', 'data-lab-modules-loaded']) {
      const value = root.getAttribute(name);
      if (seen.get(name) !== value) {
        seen.set(name, value);
        log(name, value);
      }
    }
    const run = document.querySelector('[data-lab-run]');
    const enabled = run instanceof HTMLButtonElement && !run.disabled ? 'enabled' : 'disabled';
    if (seen.get('run-button') !== enabled) {
      seen.set('run-button', enabled);
      log('run-button', enabled);
    }
    if (!seen.has('first-frame')) {
      const status = document.querySelector('[data-vision-output-status]')?.textContent ?? '';
      const frames = /(\d+)장/u.exec(status);
      if (frames && Number(frames[1]) >= 1) {
        seen.set('first-frame', status);
        log('first-frame', status);
      }
    }
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
}

interface Recorded {
  readonly name: string;
  readonly value: string | null;
  readonly at: number;
}

async function recordedEvents(page: Page): Promise<Recorded[]> {
  return page.evaluate(() => (window as unknown as { __apcScenario?: { events: Recorded[] } }).__apcScenario?.events ?? []).catch(() => []);
}

/** 이 문서의 첫 그리기(FCP) 벽시계 시각 — 없으면 기다린다 */
async function fcpWallClock(page: Page): Promise<number> {
  await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0, null, { timeout: STEP_TIMEOUT, polling: 100 });
  return page.evaluate(() => performance.timeOrigin + (performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0));
}

function attachJson(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  const file = testInfo.outputPath(name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return testInfo.attach(name, { path: file, contentType: 'application/json' });
}

/** 문맥 닫기 — 서비스 워커 요청이 남아 붙잡혀도 30초 뒤에는 넘어간다(perf-pages.spec.ts closeQuietly와 같다) */
async function closeQuietly(context: BrowserContext): Promise<void> {
  await Promise.race([context.close().catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 30_000))]);
}

function seconds(ms: number | null): string {
  if (ms === null) {
    return '—';
  }
  const total = Math.round(ms / 1000);
  return total >= 60 ? `${Math.floor(total / 60)}분 ${total % 60}초` : `${(ms / 1000).toFixed(1)}초`;
}

function mb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(2)}MB`;
}

test.describe('회선 전체 3G에서 시나리오 A(미해결 210, perf 무리 — 기록용)', () => {
  test.describe.configure({ timeout: 45 * 60_000 });
  test.skip(({ isMobile }) => Boolean(isMobile), '망 조건 측정은 데스크톱 화면 하나로');
  test.skip(!IS_PERF_GROUP, 'npm run perf:measure에서만 잰다(회선 전체 3G라 10분 가까이 걸린다)');

  test('홈 → [카메라로 바로 해보기] → [실행] → 첫 에지 → 슬라이더 효과(페이지·워커·서비스 워커가 한 회선)', async ({ browser, baseURL, request }, testInfo) => {
    const home = await request.get(withBase(''));
    test.skip((await home.text()).includes('/@vite/client'), '개발 서버는 파일을 묶지 않아 회선 수치가 뜻이 없어요 — 빌드 결과(npm run perf:measure)나 실사이트로 재요');

    const line = LINE_PROFILES['3g'];
    const allowHosts = lineAllowHosts(baseURL ?? '', ALLOWED_REMOTE_ORIGINS);
    // 미리 보기 서버(http)의 응답만 실사이트처럼 max-age=600으로(실사이트로 잴 때는 https 터널이라 그대로)
    const proxy = await startLineProxy({ ...line, allowHosts, cacheControl: SITE_CACHE_CONTROL });
    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1366, height: 768 },
      locale: 'ko-KR',
      timezoneId: 'Asia/Seoul',
      permissions: ['camera'],
      serviceWorkers: 'allow',
      proxy: { server: proxy.server },
    });
    await context.addInitScript(installRecorder);
    const errors: string[] = [];
    const snapshots: Record<string, LineStats> = {};
    const timeline: { at: number; state: string | null; status: string; progress: string; down: number }[] = [];
    let sampler: ReturnType<typeof setInterval> | null = null;
    const t0 = Date.now();
    const since = (wall: number | null | undefined) => (typeof wall === 'number' ? wall - t0 : null);
    try {
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(error.message));

      // 1. 홈 — 첫 그리기 뒤 주요 단추를 누른다(학생은 설명을 읽지 않는다)
      await page.goto(withBase(''), { waitUntil: 'commit', timeout: STEP_TIMEOUT });
      const homeFcp = since(await fcpWallClock(page));
      const button = page.locator('[data-home-action="camera"]');
      await expect(button).toBeVisible({ timeout: STEP_TIMEOUT });
      // 누른 때는 click() 전에 적는다 — click()은 다음 쪽 이동이 시작될 때까지 기다려 그만큼(왕복) 늦게 돌아온다
      const homeClick = Date.now() - t0;
      snapshots.homeClick = proxy.stats();
      await button.click();
      await page.waitForURL((url) => url.pathname === VISION_PATH, { waitUntil: 'commit', timeout: STEP_TIMEOUT });

      // 받는 동안 학생이 보는 글(상태 줄·받는 파일)과 회선으로 받은 양을 30초마다 적는다
      sampler = setInterval(() => {
        void page
          .evaluate(() => ({
            state: document.querySelector('[data-lab]')?.getAttribute('data-state') ?? null,
            status: (document.querySelector('[data-lab-status]')?.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 120),
            progress: (document.querySelector('[data-lab-progress]')?.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 120),
          }))
          .then((seen) => timeline.push({ at: Date.now() - t0, ...seen, down: proxy.stats().down }))
          .catch(() => undefined);
      }, SAMPLE_MS);

      // 2. 실습실 — 첫 그리기, [실행]이 켜지면 곧바로 누른다(눌러 두면 파이썬 준비가 끝나는 대로 돈다)
      const labFcp = since(await fcpWallClock(page));
      const runButton = page.locator('[data-lab-run]');
      await expect(runButton).toBeEnabled({ timeout: STEP_TIMEOUT });
      const runClick = Date.now() - t0;
      await runButton.click();
      snapshots.runClick = proxy.stats();

      // 3. 파이썬 준비가 끝나 눌러 둔 실행이 시작된다(실행 횟수 1)
      await expect(labRoot(page)).toHaveAttribute('data-run-count', '1', { timeout: STEP_TIMEOUT });
      snapshots.runStart = proxy.stats();

      // 4. 첫 에지 장
      await expect.poll(() => framesShown(page), { timeout: STEP_TIMEOUT, intervals: [250] }).toBeGreaterThanOrEqual(1);
      snapshots.firstEdge = proxy.stats();
      const events = await recordedEvents(page);
      const firstAt = (name: string, value?: string) => events.find((event) => event.name === name && (value === undefined || event.value === value))?.at ?? null;
      const labDcl = since(firstAt('dcl'));
      const labLoad = since(firstAt('load'));
      const labFontOn = since(firstAt('font-media', 'all'));
      const runButtonEnabled = since(firstAt('run-button', 'enabled'));
      const runStart = since(firstAt('data-run-count', '1'));
      const packagesReady = since(firstAt('data-vision-packages', 'ready'));
      const firstEdge = since(firstAt('first-frame')) ?? Date.now() - t0;

      // 5. 슬라이더 효과(scenario-a.spec.ts와 같은 판정 — 희미한 네모의 테두리가 threshold 20에서 나타난다)
      const slider = page.locator('[data-lab-param="threshold"] input[type="range"]');
      const base = await averageWhiteRatio(page, 'edges');
      let shown = await framesShown(page);
      await slider.fill('20');
      await expect.poll(() => framesShown(page), { timeout: 120_000 }).toBeGreaterThanOrEqual(shown + 3);
      const low = await averageWhiteRatio(page, 'edges');
      const sliderEffect = Date.now() - t0;
      shown = await framesShown(page);
      await slider.fill('100');
      await expect.poll(() => framesShown(page), { timeout: 120_000 }).toBeGreaterThanOrEqual(shown + 3);
      const back = await averageWhiteRatio(page, 'edges');
      snapshots.end = proxy.stats();

      const final = snapshots.end;
      const byHost = Object.fromEntries(Object.entries(final.hosts).map(([host, value]) => [host, value.down]));
      const overLimit = firstEdge > SCENARIO_A_LIMIT_MS;
      const hostText = Object.entries(byHost)
        .sort((a, b) => b[1] - a[1])
        .map(([host, bytes]) => `${host} ${mb(bytes)}`)
        .join('·');
      const summary =
        `[회선 3G 시나리오 A] 홈 FCP ${seconds(homeFcp)} → [카메라로 바로 해보기] ${seconds(homeClick)} → 실습실 FCP ${seconds(labFcp)}·DCL ${seconds(labDcl)}·load ${seconds(labLoad)}·글꼴 켬 ${seconds(labFontOn)}` +
        ` → [실행] 켜짐 ${seconds(runButtonEnabled)}(누름 ${seconds(runClick)}) → 파이썬 준비·실행 시작 ${seconds(runStart)} → numpy·OpenCV 준비 ${seconds(packagesReady)}` +
        ` → 첫 에지 ${seconds(firstEdge)} → 슬라이더 효과 ${seconds(sliderEffect)} · 회선으로 받은 양 ${mb(final.down)}(${hostText}), 올린 양 ${mb(final.up)}, 연결 ${final.connections}개` +
        ` · 흰 픽셀 100:${(base * 100).toFixed(2)}% → 20:${(low * 100).toFixed(2)}% → 100:${(back * 100).toFixed(2)}%` +
        (overLimit ? ` · SPEC 시나리오 A 5분을 ${seconds(firstEdge - SCENARIO_A_LIMIT_MS)} 넘음 — PLAN §11 위험 31(기록용)` : ' · SPEC 5분 안');
      console.log(summary);
      for (const sample of timeline) {
        console.log(`[회선 3G 시나리오 A]   ${seconds(sample.at)} ${sample.state ?? '-'} | ${sample.status} | ${sample.progress} | 받은 양 ${mb(sample.down)}`);
      }
      testInfo.annotations.push({ type: '회선 전체 3G 시나리오 A', description: summary });
      if (overLimit) {
        testInfo.annotations.push({ type: 'SPEC 5분 넘음(기록용)', description: `첫 에지 ${seconds(firstEdge)} — PLAN §11 위험 31, PROGRESS 미해결 210` });
      }
      await attachJson(testInfo, 'perf-scenario-a-3g.json', {
        measuredAt: new Date().toISOString(),
        baseURL,
        line,
        allowHosts,
        limitMs: SCENARIO_A_LIMIT_MS,
        overLimit,
        cacheControl: SITE_CACHE_CONTROL,
        marksMs: { homeFcp, homeClick, labFcp, labDcl, labLoad, labFontOn, runButtonEnabled, runClick, runStart, packagesReady, firstEdge, sliderEffect },
        whiteRatio: { threshold100: base, threshold20: low, back100: back },
        bytes: { down: final.down, up: final.up, connections: final.connections, byHost, rejected: final.rejected },
        snapshots,
        timeline,
        events: events.map((event) => ({ ...event, at: event.at - t0 })),
        errors,
      });

      // 측정이 성립했는지(판정이 아니라 측정의 조건): 파이썬 엔진·패키지(약 20MB)가 회선을 지났다 = 워커 요청이 회선을 탔다,
      // 사이트 쪽(쪽·스크립트·글꼴 — 1.0.0 빌드 1.44MB)도 회선을 지났다 = localhost 미리 보기가 프록시를 비켜 가지 않았다(Playwright가 넘기는 <-loopback>)
      expect(final.down, `회선으로 받은 양이 ${mb(final.down)}뿐이에요 — 워커가 받는 파이썬 엔진이 프록시를 지나지 않은 것 같아요`).toBeGreaterThan(15_000_000);
      const siteHost = new URL(baseURL ?? 'http://localhost/').hostname;
      expect(byHost[siteHost] ?? 0, `사이트(${siteHost})에서 받은 양이 ${mb(byHost[siteHost] ?? 0)}뿐이에요 — 사이트 요청이 회선을 비켜 간 것 같아요`).toBeGreaterThan(300_000);
      // 둘째 쪽(실습실)도 느린 망이면 글꼴 CSS를 load 뒤에 켠다(BaseLayout __apcFontCss — 쪽 HTML을 받은 시간으로도 느린 망을 안다, 1.1.0 검토 반영)
      expect.soft(labFontOn !== null && labLoad !== null && labFontOn >= labLoad, `실습실 글꼴 켬 ${seconds(labFontOn)}이 load ${seconds(labLoad)} 뒤`).toBe(true);
      expect(low, `threshold 20: ${low} > 100: ${base}`).toBeGreaterThan(base + MIN_RATIO_CHANGE);
      expect(back, `threshold 100 again: ${back} < 20: ${low}`).toBeLessThan(low - MIN_RATIO_CHANGE);
      expect(errors).toEqual([]);
      await page.getByRole('button', { name: '정지', exact: true }).click();
    } finally {
      if (sampler) {
        clearInterval(sampler);
      }
      await closeQuietly(context);
      await proxy.close();
    }
  });
});
