/**
 * 첫 방문 전송량·시간 측정(P2-14, PLAN §8.2 표의 완료 기준 "첫 방문 총 전송량(사전 캐시 포함)과 시간이 기록돼 있고
 * 사전 캐시가 PD-11 범위(셸만)를 넘지 않는다", 미해결 10번).
 *
 * 무엇을 재나: 캐시가 빈 새 브라우저에서 홈 → [카메라로 바로 해보기] → 실습실 준비 → [실행] → 첫 에지 화면까지
 * **실제로 내려받은 바이트**를 모두 더한다. 파이썬 워커·서비스 워커가 받는 것까지 세려고
 * 브라우저 문맥 단위 이벤트(context.on('requestfinished'))와 `request.sizes()`(압축된 본문 + 머리말 크기)를 쓴다.
 * CDP(Network.loadingFinished)는 **페이지 대상에만** 붙어서 워커가 받는 Pyodide 20MB를 놓친다(2026-09-16 실측: 0.31MB로 나옴).
 *
 * 속도 제한에 대해(정직하게 적는다)
 *   - 같은 이유로 CDP의 Network.emulateNetworkConditions도 페이지 대상에만 걸린다. 워커가 받는 Pyodide는 느려지지 않는다.
 *   - 그래서 **Fast 3G에서 잰 값은 "홈 화면(셸)이 뜨는 시간"까지가 실측**이고, Pyodide·휠 부분은 잰 바이트를
 *     Fast 3G 대역폭으로 나눈 **계산값**으로 함께 적는다(계산식도 함께 남긴다).
 *
 * 돌리는 법: npx playwright test tests/e2e/first-visit.spec.ts --project=desktop
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ALLOWED_REMOTE_ORIGINS } from '../../src/lab/runtime/config.ts';
import { withBase } from '../../src/lib/url.ts';
import { labRoot } from './helpers/lab.ts';
import { PACKAGES_TIMEOUT, waitVisionReady } from './helpers/vision.ts';

/** Chrome DevTools "Fast 3G" 값(내려받기 1.6Mbit/s, 올리기 750kbit/s, 지연 562.5ms) */
const FAST_3G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8),
  uploadThroughput: Math.round((750 * 1024) / 8),
};

interface Usage {
  total: number;
  site: number;
  cdn: number;
  other: number;
  requests: number;
}

/** 브라우저 문맥이 받은 바이트를 주소별로 모은다(페이지·워커·서비스 워커 모두). */
function trackBytes(context: BrowserContext, siteOrigin: string): () => Usage {
  let site = 0;
  let cdn = 0;
  let other = 0;
  let requests = 0;

  context.on('requestfinished', (request) => {
    void request
      .sizes()
      .then((sizes) => {
        const url = request.url();
        if (!/^https?:/u.test(url)) {
          return;
        }
        const bytes = Math.max(0, sizes.responseBodySize) + Math.max(0, sizes.responseHeadersSize);
        requests += 1;
        const origin = new URL(url).origin;
        if (origin === siteOrigin) {
          site += bytes;
        } else if (ALLOWED_REMOTE_ORIGINS.includes(origin)) {
          cdn += bytes;
        } else {
          other += bytes;
        }
      })
      .catch(() => undefined);
  });

  return () => ({ total: site + cdn + other, site, cdn, other, requests });
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

/** 잰 바이트를 Fast 3G 대역폭으로 나눈 계산값(초). 요청마다 왕복 지연이 한 번씩 붙는다고 본다. */
function estimateSeconds(bytes: number, requests: number): number {
  return bytes / FAST_3G.downloadThroughput + (requests * FAST_3G.latency) / 1000;
}

/** 홈 → [카메라로 바로 해보기] → 준비 → [실행] → 첫 에지 화면까지. 구간별 경과 시간(ms)을 돌려준다. */
async function firstVisitFlow(page: Page): Promise<{ toLab: number; toReady: number; toEdge: number }> {
  const started = Date.now();
  await page.goto(withBase(''));
  await page.getByRole('link', { name: /카메라로 바로 해보기/u }).click();
  await expect(page).toHaveURL(/labs\/vision\//u);
  const toLab = Date.now() - started;

  await waitVisionReady(page);
  const toReady = Date.now() - started;

  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(page.locator('canvas[data-vision-window="edges"]')).toBeVisible({ timeout: PACKAGES_TIMEOUT });
  await expect.poll(async () => (await page.locator('[data-vision-output-status]').textContent()) ?? '', { timeout: PACKAGES_TIMEOUT }).toMatch(/[1-9]\d*장/u);
  const toEdge = Date.now() - started;

  await page.locator('[data-lab-stop]').click();
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: 30_000 });
  return { toLab, toReady, toEdge };
}

test.describe('첫 방문 전송량·시간(P2-14)', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), '전송량은 화면 크기와 무관하다 — 데스크톱에서 한 번만 잰다.');

  test('일반 회선: 홈 → 첫 에지 화면까지 받은 바이트와 걸린 시간', async ({ page, baseURL }) => {
    test.setTimeout(8 * 60_000);
    const siteOrigin = new URL(baseURL ?? 'http://localhost:4329').origin;
    const usage = trackBytes(page.context(), siteOrigin);

    // 홈만 열었을 때(= 서비스 워커가 셸을 사전 캐시하는 시점)를 먼저 본다 — PD-11 "셸만" 확인.
    await page.goto(withBase(''));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const home = usage();

    const times = await firstVisitFlow(page);
    await page.waitForTimeout(2000); // 준비가 끝난 뒤 서비스 워커가 캐시를 채우는 몫까지 센다
    const all = usage();

    console.log(`[첫 방문·전송량] 홈만(사전 캐시 포함): ${mb(home.total)} — 사이트 ${mb(home.site)}, 요청 ${home.requests}건`);
    console.log(`[첫 방문·전송량] 홈 → 첫 에지 화면까지 합계: ${mb(all.total)} = 사이트 ${mb(all.site)} + jsDelivr ${mb(all.cdn)} + 그 밖 ${mb(all.other)}, 요청 ${all.requests}건`);
    console.log(`[첫 방문·시간] 홈 → 실습실 ${(times.toLab / 1000).toFixed(1)}초 → 준비 끝 ${(times.toReady / 1000).toFixed(1)}초 → 첫 에지 ${(times.toEdge / 1000).toFixed(1)}초`);
    console.log(
      `[첫 방문·Fast 3G 계산값] 같은 바이트를 1.6Mbit/s·지연 562.5ms로 받으면 약 ${estimateSeconds(all.total, all.requests).toFixed(0)}초` +
        ` (셸만이면 약 ${estimateSeconds(home.total, home.requests).toFixed(0)}초)`,
    );

    // 사이트 밖으로 나간 곳은 허용 목록(jsDelivr)뿐이어야 한다(SPEC §2 서버 제로).
    expect(all.other, '허용 주소 밖에서 받은 바이트').toBe(0);
    // 첫 화면 + 사전 캐시(셸)는 PD-11 "수백 KB 이하" 범위. 모델·Pyodide가 사전 캐시에 섞이면 여기서 크게 튄다.
    expect(home.total, '홈만 열었을 때 전송량(사전 캐시 포함)').toBeLessThan(3 * 1024 * 1024);
    // 시나리오 A의 5분 기준(SPEC §13)
    expect(times.toEdge, '홈에서 첫 에지 화면까지').toBeLessThan(5 * 60_000);
  });

  test('Fast 3G: 느린 학교 네트워크에서 홈 화면과 실습실 열기', async ({ page, baseURL }) => {
    test.slow();
    test.setTimeout(8 * 60_000);
    const siteOrigin = new URL(baseURL ?? 'http://localhost:4329').origin;
    const usage = trackBytes(page.context(), siteOrigin);
    const client = await page.context().newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', FAST_3G);

    const started = Date.now();
    await page.goto(withBase(''));
    await page.waitForLoadState('load');
    const homeShown = Date.now() - started;

    await page.getByRole('link', { name: /카메라로 바로 해보기/u }).click();
    await expect(page).toHaveURL(/labs\/vision\//u);
    await expect(labRoot(page)).toBeVisible();
    const labShown = Date.now() - started;

    await waitVisionReady(page);
    const ready = Date.now() - started;
    const all = usage();

    console.log(
      `[Fast 3G·실측] 홈 화면 ${(homeShown / 1000).toFixed(1)}초 → 실습실 화면 ${(labShown / 1000).toFixed(1)}초` +
        ` → 준비 끝 ${(ready / 1000).toFixed(1)}초 (속도 제한은 페이지 대상에만 걸린다 — 워커가 받는 Pyodide는 제한 밖)`,
    );
    console.log(`[Fast 3G·전송량] 합계 ${mb(all.total)} = 사이트 ${mb(all.site)} + jsDelivr ${mb(all.cdn)}, 요청 ${all.requests}건`);

    expect(all.other, '허용 주소 밖에서 받은 바이트').toBe(0);
    // 느린 회선에서도 홈 화면(셸)은 30초 안에 보여야 한다(글꼴·CSS·HTML만 받는다).
    expect(homeShown, 'Fast 3G에서 홈 화면이 뜨는 시간').toBeLessThan(30_000);
  });
});
