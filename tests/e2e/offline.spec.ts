// 오프라인 배포판 브라우저 확인(PLAN §5.6·§8.6 P6-07 — 완료 기준 "인터넷 없이 첫 실습·가상 보드·같은 컴퓨터 탭 통신이 된다").
//
// 무엇을: npm run build:offline이 만든 zip을 풀어 시작하기.bat(PowerShell 작은 웹 서버, scripts/offline/serve.ps1)로 띄운 사이트를
// **인터넷을 막은** 브라우저로 연다. 막는 법은 두 겹이다.
//   ① Chromium 실행 인자 --host-resolver-rules: localhost 말고는 주소 풀이(DNS)를 모두 실패시킨다 — 서비스 워커·워커의 요청까지.
//   ② 문맥(BrowserContext) 가로채기: localhost·127.0.0.1이 아닌 주소는 모두 끊고(internetdisconnected) 기록한다. 문맥의 request 사건도
//      함께 듣는다(서비스 워커가 스스로 내는 요청까지 — tests/e2e/helpers/vision.ts collectRequests와 같은 까닭).
//   검사마다 끝에 "사이트 밖으로 나가려던 요청 0건"을 확인한다.
// 확인하는 것
//   1. 홈·차시·검색·출처 쪽이 열리고, 서비스 워커가 사이트 뿌리에서 오프라인 설정으로 쪽을 맡는다.
//      작은 서버에 닿지 못하면 연 적 있는 쪽은 저장본, 안 연 쪽은 "작은 서버가 꺼져 있어요" 안내 쪽(홈 내용을 그 주소로 보이지 않음).
//   2. 시나리오 A 오프라인: 홈 → [카메라로 바로 해보기] → (가짜 카메라 — 카메라 권한이 localhost에서 된다) 에지 결과 →
//      조절 막대로 결과가 바뀐다 → 입력을 "샘플 입력"으로 바꿔도 에지 결과. 파이썬 엔진은 같은 사이트에서 받는다.
//   3. ESP32 가상 보드 첫 예제(내장 LED 깜빡이기)와 [실제 보드] 탭(Web Serial이 localhost에서 "지원").
//   4. 같은 컴퓨터 두 탭 통신(시나리오 D 두 탭판): 대시보드 기본 통로가 "같은 컴퓨터 탭"(공개 중계 서버 아님 — §5.6)이고,
//      새 탭의 가상 보드 값이 그래프로 오고 스위치가 그 보드의 LED를 켠다.
//   5. 오프라인판에만 더 넣은 휠(Pillow)도 같은 사이트에서 받아 import된다.
//   6. 음성 예제는 글자 입력으로 돈다(서버 인식 선택지 없음).
//   7. 점검 페이지가 localhost를 보안 연결로 보고 카메라·Web Serial·JSPI를 "지원"으로 보인다.
//
// 돌리는 법: node scripts/offline/verify-offline.mjs(zip 풀기 → 시작하기.bat → 이 파일, 데스크톱·워커 1).
//   직접 돌릴 때(서버를 따로 띄운 뒤): APC_E2E_GROUP=offline APC_BASE=/ PW_BASE_URL=http://localhost:8080/ npx playwright test tests/e2e/offline.spec.ts --project=desktop
//   (Git Bash는 앞에 MSYS_NO_PATHCONV=1 — APC_BASE=/가 Windows 경로로 바뀌지 않게)
// CI에서 건너뛰는 까닭: "테스트" 워크플로(npm run test:e2e)는 오프라인판 zip을 만들지 않고(빌드·압축 약 40초 + 검사), 이 검사의 요점인
//   Windows PowerShell 서버가 Linux 러너에 없다. 그래서 APC_E2E_GROUP이 offline일 때만 돌고, 보통 실행에서는 모두 건너뛴다.
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { searchConfig } from '../../src/config/search.ts';
import { withBase } from '../../src/lib/url.ts';
import { TEST_VIDEO_PATH } from './global-setup.ts';
import { labRoot, LOAD_TIMEOUT, runCode, waitDone } from './helpers/lab.ts';
import { PACKAGES_TIMEOUT, VISION_PATH, averageWhiteRatio, framesShown, waitFrames, whiteRatio } from './helpers/vision.ts';

/**
 * 오프라인판 zip을 풀어 띄운 작은 서버를 시험할 때만 돈다: 무리 이름(APC_E2E_GROUP=offline)과 그 서버 주소(PW_BASE_URL)가 함께 있어야 한다.
 * PW_BASE_URL 없이 무리 명령만 돌리면 Playwright가 보통 빌드(공개 사이트 모양)를 띄우므로 오프라인판 검사가 뜻이 없다.
 */
const OFFLINE_GROUP = process.env.APC_E2E_GROUP === 'offline' && Boolean(process.env.PW_BASE_URL?.trim());

test.skip(!OFFLINE_GROUP, '오프라인판 zip을 풀어 띄운 작은 서버에서만 돌아요 — node scripts/offline/verify-offline.mjs(CI는 zip을 만들지 않아 건너뜀)');

test.use({
  launchOptions: {
    args: [
      // playwright.config.ts의 가짜 카메라 인자(설정의 launchOptions를 통째로 바꾸므로 다시 적는다)
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-video-capture=${TEST_VIDEO_PATH}`,
      // 인터넷 끊기: localhost 말고는 주소 풀이를 모두 실패시킨다(서비스 워커·워커 요청 포함)
      '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost',
    ],
  },
});

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLocalUrl(url: URL): boolean {
  return LOCAL_HOSTS.has(url.hostname) || !/^https?:$/u.test(url.protocol);
}

interface NetworkLog {
  /** 사이트 밖으로 나가려던 요청(끊음) */
  readonly external: string[];
  /** 이 컴퓨터의 작은 서버로 간 요청 주소 */
  readonly local: string[];
}

/** 인터넷을 막고(사이트 밖 주소는 끊음) 모든 요청을 기록한다 */
async function guardNetwork(context: BrowserContext): Promise<NetworkLog> {
  const log: NetworkLog = { external: [], local: [] };
  const noteExternal = (url: string) => {
    if (!log.external.includes(url)) {
      log.external.push(url);
    }
  };
  await context.route(
    (url) => !isLocalUrl(url),
    async (route) => {
      noteExternal(route.request().url());
      await route.abort('internetdisconnected');
    },
  );
  context.on('request', (request) => {
    const url = request.url();
    if (!/^https?:/u.test(url)) {
      return;
    }
    if (isLocalUrl(new URL(url))) {
      log.local.push(url);
    } else {
      noteExternal(url);
    }
  });
  return log;
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** 측정값을 콘솔·보고서에 남긴다 */
function note(label: string, text: string): void {
  console.log(`[offline] ${label}: ${text}`);
  test.info().annotations.push({ type: label, description: text });
}

test.describe('오프라인 배포판 — 인터넷 없이', () => {
  test.skip(({ isMobile }) => isMobile, '오프라인판은 교실 컴퓨터(데스크톱 Chromium)에서 확인한다');

  test('검사 도구 확인: 이 브라우저에서는 인터넷이 정말 막혀 있고, 사이트 밖으로 나가려던 요청이 기록된다', async ({ page, context }) => {
    const network = await guardNetwork(context);
    await page.goto(withBase(''));
    // Pyodide 주소(…/pyodide/v314.0.7/full/…)는 쓰지 않는다: 오프라인판 서비스 워커가 그 주소를 같은 사이트 파일로 대신 답해
    // (src/sw/sw.js — 막힘을 시험할 수 없다, 2026-09-26 파이썬 서버 실행에서 서비스 워커가 먼저 페이지를 맡아 'ok'가 됨) 다른 주소로 본다.
    const outside = 'https://cdn.jsdelivr.net/npm/lz-string@1.5.0/package.json';
    const result = await page.evaluate(
      (url) =>
        fetch(url, { cache: 'no-store' }).then(
          () => 'ok',
          () => 'failed',
        ),
      outside,
    );
    expect(result, 'jsDelivr가 열리면 이 검사는 인터넷 없이를 흉내 내지 못한 것').toBe('failed');
    expect(network.external).toContain(outside);
    // 이 컴퓨터의 작은 서버는 열린다
    expect((await page.request.get(withBase(''))).status()).toBe(200);
  });

  test('사이트: 홈·차시·검색·출처가 열리고, 서비스 워커가 사이트 뿌리에서 오프라인 설정으로 쪽을 맡는다', async ({ page, context }) => {
    test.setTimeout(120_000);
    const network = await guardNetwork(context);
    const errors = collectErrors(page);

    const home = await page.goto(withBase(''));
    expect(home?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.locator('[data-home-action="camera"]')).toBeVisible();

    // 서비스 워커: localhost는 보안 연결이라 등록되고, 설정은 오프라인판(Pyodide를 같은 사이트에서만 받음)
    const sw = await page.request.get(withBase('sw.js'));
    expect(sw.status()).toBe(200);
    const swText = await sw.text();
    expect(swText).toContain('"offline":true');
    expect(swText).toContain('"base":"/"');
    await expect
      .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? 'none'), { timeout: 30_000 })
      .toBe('activated');
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15_000 }).toBe(true);
    expect(await page.evaluate(() => window.isSecureContext)).toBe(true);

    // 차시 한 쪽: 본문과 원고 그림이 뜬다
    const lesson = await page.goto(withBase('learn/u1/1-1-1/'));
    expect(lesson?.status()).toBe(200);
    await expect(page.locator('main h1')).toBeVisible();
    const images = page.locator('main img');
    expect(await images.count()).toBeGreaterThan(0);
    await images.first().scrollIntoViewIfNeeded();
    await expect
      .poll(() => images.evaluateAll((list) => list.filter((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0).length))
      .toBeGreaterThan(0);

    // 사이트 검색(Pagefind 색인도 같은 사이트)
    await page.goto(withBase(`search/?${searchConfig.queryParam}=${encodeURIComponent('픽셀')}`));
    await expect(page.locator('[data-search-root]')).toHaveAttribute('data-state', 'results', { timeout: 30_000 });
    await expect(page.locator('[data-search-results] > li').first()).toBeVisible();
    const firstHref = await page.locator('[data-search-results] > li h3 a').first().getAttribute('href');
    expect(firstHref?.startsWith('/')).toBe(true);

    // 출처와 라이선스, 고지 전문 파일(오프라인판에도 들어 있어야 하는 것 — 구역 C 목록)
    const credits = await page.goto(withBase('credits/'));
    expect(credits?.status()).toBe(200);
    for (const file of ['licenses/pyodide-wheels-3rd-party.txt', 'licenses/pagefind-wasm-3rd-party.txt', 'firmware/v1.29.0/NOTICE.txt']) {
      const response = await page.request.get(withBase(file));
      expect(response.status(), file).toBe(200);
      expect(response.headers()['content-type'], file).toContain('text/plain');
    }

    note('사이트 요청', `이 컴퓨터 ${network.local.length}건, 사이트 밖 ${network.external.length}건`);
    expect(network.external, '사이트 밖으로 나가려던 요청').toEqual([]);
    expect(errors).toEqual([]);
  });

  // 2026-09-26 Phase 6 사용성 검토 지적 3: 서버(검은 창)를 닫은 뒤 한 번도 안 연 쪽을 열면 주소창은 그 쪽인데 화면은 **홈**이 떴다
  // (서비스 워커가 어느 주소든 사전 캐시된 홈을 줬다). 이제 홈 주소일 때만 홈이고, 나머지는 "작은 서버가 꺼져 있어요" 안내 쪽이다.
  // 서버를 끄는 대신 브라우저 문맥을 오프라인으로 두어 같은 상황(이 컴퓨터의 작은 서버에 닿지 못함)을 만든다.
  test('작은 서버가 꺼지면: 연 적 있는 쪽은 저장본으로, 안 연 쪽은 "작은 서버가 꺼져 있어요" 안내 쪽과 [홈으로 가기]', async ({ page, context }) => {
    test.setTimeout(120_000);
    await guardNetwork(context);
    await page.goto(withBase(''));
    await expect
      .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? 'none'), { timeout: 30_000 })
      .toBe('activated');
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15_000 }).toBe(true);
    await page.goto(withBase('learn/u1/1-1-1/'));
    await expect(page.locator('main h1')).toBeVisible();

    await context.setOffline(true);
    try {
      // 연 적 있는 차시는 저장본으로 뜬다
      await page.goto(withBase('learn/u1/1-1-1/'));
      await expect(page.locator('main h1')).toBeVisible();
      // 안 연 쪽은 안내 쪽(홈 내용이 그 주소로 뜨지 않는다)
      await page.goto(withBase('learn/u2/2-1-1/'));
      await expect(page.locator('h1')).toHaveText('이 컴퓨터의 작은 서버가 꺼져 있어요');
      await expect(page.locator('[data-home-action="camera"]')).toHaveCount(0);
      await expect(page.locator('body')).toContainText('시작하기.bat');
      // [홈으로 가기]는 저장해 둔 홈을 연다
      await page.getByRole('link', { name: '홈으로 가기' }).click();
      await expect(page.locator('[data-home-action="camera"]')).toBeVisible();
      expect(new URL(page.url()).pathname).toBe('/');
    } finally {
      await context.setOffline(false);
    }
  });

  test('시나리오 A: 홈 → [카메라로 바로 해보기] → 가짜 카메라 에지 결과 → 조절 막대 → 샘플 입력으로 바꿔도 에지 결과', async ({ page, context }) => {
    test.setTimeout(LOAD_TIMEOUT + PACKAGES_TIMEOUT + 120_000);
    const network = await guardNetwork(context);
    const errors = collectErrors(page);
    const startedAt = Date.now();
    const seconds = () => ((Date.now() - startedAt) / 1000).toFixed(1);

    await page.goto(withBase(''));
    await page.locator('[data-home-action="camera"]').click();
    await expect(page).toHaveURL((url) => url.pathname === VISION_PATH);
    await expect(labRoot(page)).toHaveAttribute('data-example', 'first-edge');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-run-count', '1', { timeout: LOAD_TIMEOUT + PACKAGES_TIMEOUT });
    const readyAt = seconds();

    // 파이썬 엔진은 같은 사이트(이 컴퓨터의 작은 서버)에서 받았다 — jsDelivr를 두드리지 않았다
    await expect(labRoot(page)).toHaveAttribute('data-loading-source', /^(site|cache)$/u);
    await expect(labRoot(page)).toHaveAttribute('data-loading-fallback', '');
    expect(network.local.some((url) => url.includes('/vendor/pyodide/314.0.7/'))).toBe(true);

    // 웹캠(가짜 카메라) — localhost에서 카메라 권한이 된다
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'webcam');
    await waitFrames(page, 'edges', 4);
    const edgeAt = seconds();
    expect(await whiteRatio(page, 'edges')).toBeGreaterThan(0);
    const base = await averageWhiteRatio(page, 'edges');

    // 조절 막대 → 다음 장부터 결과가 바뀐다(시나리오 A와 같은 판정: 희미한 네모의 테두리가 생김)
    let shown = await framesShown(page);
    await page.locator('[data-lab-param="threshold"] input[type="range"]').fill('20');
    await waitFrames(page, 'edges', shown + 3);
    const low = await averageWhiteRatio(page, 'edges');
    expect(low, `threshold 20: ${low} > 100: ${base}`).toBeGreaterThan(base + 0.0005);

    // 멈추고 입력을 샘플 입력(코드로 그린 도형)으로 바꿔 다시 실행해도 에지 결과가 나온다
    // (실행 중에 입력 소스를 바꾸면 그 입력이 닫혀 cap.read()가 빈 답을 받는다 — 온라인 사이트와 같은 동작이라 멈춘 뒤 바꾼다)
    await page.getByRole('button', { name: '정지', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-outcome', /^(stopped|killed)$/u, { timeout: 10_000 });
    await page.locator('[data-vision-source-select]').selectOption('sample');
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'sample');
    shown = await framesShown(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-run-count', '2', { timeout: 30_000 });
    await waitFrames(page, 'edges', shown + 4);
    expect(await whiteRatio(page, 'edges')).toBeGreaterThan(0);

    await page.getByRole('button', { name: '정지', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-outcome', /^(stopped|killed)$/u, { timeout: 10_000 });

    note('시나리오 A(오프라인)', `준비 끝 ${readyAt}초, 첫 에지 ${edgeAt}초, 흰 픽셀 100:${(base * 100).toFixed(2)}% → 20:${(low * 100).toFixed(2)}%`);
    expect(network.external, '사이트 밖으로 나가려던 요청').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('ESP32 가상 보드 첫 예제: 내장 LED가 깜빡이고 [정지]로 멈추며, [실제 보드] 탭이 Web Serial을 쓸 수 있다고 본다', async ({ page, context }) => {
    test.setTimeout(LOAD_TIMEOUT + 90_000);
    const network = await guardNetwork(context);
    const errors = collectErrors(page);
    const startedAt = Date.now();

    const response = await page.goto(withBase('labs/esp32/'));
    expect(response?.status()).toBe(200);
    await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    await expect(page.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: 30_000 });
    const readySeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    await expect(labRoot(page)).toHaveAttribute('data-example', '01-first-blink');
    await expect(labRoot(page)).toHaveAttribute('data-loading-source', /^(site|cache)$/u);

    const led = page.locator('[data-board-part="builtin-led"]');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(led).toHaveAttribute('data-visual-lit', 'true', { timeout: 60_000 });
    await expect(led).toHaveAttribute('data-visual-lit', 'false', { timeout: 10_000 });
    await expect(led).toHaveAttribute('data-visual-lit', 'true', { timeout: 10_000 });
    await page.locator('[data-lab-stop]').click();
    expect(await waitDone(page, 30_000)).toBe('stopped');

    // 가상 보드는 OpenCV·numpy를 받지 않는다(PD-04)
    expect(network.local.filter((url) => /opencv|numpy/u.test(url))).toEqual([]);

    // [실제 보드] 탭: localhost는 보안 연결이라 Web Serial을 쓸 수 있다(보드를 꽂으면 연결할 수 있는 상태 "idle")
    await page.getByRole('tab', { name: '실제 보드' }).click();
    await expect(page.locator('[data-real-board]')).toBeVisible();
    await expect(page.locator('[data-real-board]')).toHaveAttribute('data-real-board-state', 'idle');
    expect(await page.evaluate(() => 'serial' in navigator)).toBe(true);

    note('ESP32(오프라인)', `실습실 준비 ${readySeconds}초`);
    expect(network.external, '사이트 밖으로 나가려던 요청').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('같은 컴퓨터 두 탭 통신(시나리오 D 두 탭판): 기본 통로가 "같은 컴퓨터 탭"이고, 새 탭 가상 보드의 값이 오며 스위치가 LED를 켠다', async ({ page, context }) => {
    test.setTimeout(LOAD_TIMEOUT + 240_000);
    const network = await guardNetwork(context);
    const errors = collectErrors(page);
    const dash = page.locator('[data-dash-page]');

    const response = await page.goto(withBase('labs/iot/dashboard/'));
    expect(response?.status()).toBe(200);
    await expect(dash).toHaveAttribute('data-dash-ready', 'yes');
    // §5.6: 오프라인판에서 MQTT 공개 중계 서버는 기본값이 아니다 — 기본은 인터넷이 필요 없는 같은 컴퓨터 탭
    await expect(dash).toHaveAttribute('data-dash-mode-value', 'tab');
    await expect(page.locator('[data-dash-warning]')).toContainText('같은 컴퓨터의 다른 탭하고만 통해요');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.locator('[data-dash-connect]').click();
      if ((await dash.getAttribute('data-dash-state')) === 'open') {
        break;
      }
      try {
        await expect(dash).toHaveAttribute('data-dash-state', 'open', { timeout: 20_000 });
        break;
      } catch {
        continue;
      }
    }
    await expect(dash).toHaveAttribute('data-dash-state', 'open');
    await expect(dash).toHaveAttribute('data-dash-via', 'tab');

    // [새 탭에서 ESP32 실습실 열기] — 같은 예제·같은 접두어로 열린다
    const [labTab] = await Promise.all([context.waitForEvent('page'), page.locator('[data-dash-lab-link]').click()]);
    const labErrors = collectErrors(labTab);
    await expect(labRoot(labTab)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    await expect(labTab.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: 60_000 });
    const prefix = ((await page.locator('[data-dash-prefix]').textContent()) ?? '').trim();
    await expect(labTab.locator('[data-mqtt-prefix]')).toHaveText(prefix, { timeout: 30_000 });
    await labTab.getByRole('button', { name: '실행', exact: true }).click();

    const chart = page.locator('[data-dash-widget="chart-1"]');
    await expect(chart).toHaveAttribute('data-dash-points', /^([3-9]|\d{2,})$/u, { timeout: 120_000 });
    await expect(page.locator('[data-dash-widget="gauge-1"] [data-dash-value]')).toHaveText(/^\d+$/u);

    await page.locator('[data-dash-switch]').click();
    await expect(labTab.locator('[data-board-part="builtin-led"]')).toHaveAttribute('data-visual-lit', 'true', { timeout: 30_000 });
    await page.locator('[data-dash-switch]').click();
    await expect(labTab.locator('[data-board-part="builtin-led"]')).toHaveAttribute('data-visual-lit', 'false', { timeout: 30_000 });

    await labTab.getByRole('button', { name: '정지', exact: true }).click();
    note('두 탭 통신(오프라인)', `그래프 점 ${await chart.getAttribute('data-dash-points')}개, 통로 ${await dash.getAttribute('data-dash-via')}`);
    await labTab.close();
    expect(network.external, '사이트 밖으로 나가려던 요청').toEqual([]);
    expect(errors).toEqual([]);
    expect(labErrors).toEqual([]);
  });

  test('오프라인판에만 더 넣은 휠(Pillow)도 같은 사이트에서 받아 import된다', async ({ page, context }) => {
    test.setTimeout(LOAD_TIMEOUT + PACKAGES_TIMEOUT);
    const network = await guardNetwork(context);
    const errors = collectErrors(page);
    // 개발용 시험 페이지(사이트 지도에 없음 — 실습실 틀만 있는 쪽)에서 PIL을 import한다(pyautogui 스크린숏·한글 쓰기 예제가 쓰는 패키지)
    const response = await page.goto(withBase('labs/dev/runtime/'));
    expect(response?.status()).toBe(200);
    await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    await runCode(page, ['import PIL', 'from PIL import Image', "image = Image.new('RGB', (4, 3), (255, 0, 0))", "print('PIL', PIL.__version__, image.size)"].join('\n'));
    expect(await waitDone(page, PACKAGES_TIMEOUT)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).toContainText('PIL 12.2.0 (4, 3)');
    expect(network.local.some((url) => url.includes('/vendor/pyodide/314.0.7/pillow-12.2.0-'))).toBe(true);
    expect(network.external, '사이트 밖으로 나가려던 요청').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('음성 예제는 글자 입력으로 돈다(서버 인식 선택지 없음)', async ({ page, context }) => {
    test.setTimeout(LOAD_TIMEOUT + PACKAGES_TIMEOUT + 60_000);
    const network = await guardNetwork(context);
    const errors = collectErrors(page);
    const speech = page.locator('[data-lab-module-panel="speech"]');

    const response = await page.goto(`${VISION_PATH}?example=vision/u1/1-4-3-speech-once.py`);
    expect(response?.status()).toBe(200);
    await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    await expect(labRoot(page)).toHaveAttribute('data-example', 'u1-1-4-3-speech-once');
    await expect(speech).toBeVisible();
    await expect(speech).toHaveAttribute('data-speech-server-allowed', 'no');
    await expect(speech.locator('option[value="server"]')).toHaveCount(0);
    await expect(speech.locator('[data-speech-mode-select]')).toHaveValue('text');

    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(speech).toHaveAttribute('data-speech-state', 'listening', { timeout: PACKAGES_TIMEOUT });
    await speech.locator('[data-speech-input]').fill('오프라인 교실');
    await speech.getByRole('button', { name: '보내기', exact: true }).click();
    expect(await waitDone(page, 60_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).toContainText('인식된 내용: 오프라인 교실');

    expect(network.external, '사이트 밖으로 나가려던 요청').toEqual([]);
    expect(errors).toEqual([]);
  });

  test('점검 페이지: localhost를 보안 연결로 보고 카메라·Web Serial·JSPI를 지원으로 보인다', async ({ page, context }) => {
    const network = await guardNetwork(context);
    const errors = collectErrors(page);
    const response = await page.goto(withBase('start/check/'));
    expect(response?.status()).toBe(200);
    await expect(page.locator('[data-check-report]')).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
    for (const id of ['secure-context', 'webassembly', 'jspi', 'camera-api', 'web-serial', 'local-storage']) {
      await expect(page.locator(`[data-check-row="${id}"]`), id).toHaveAttribute('data-status', 'supported');
    }
    expect(network.external, '사이트 밖으로 나가려던 요청(점검 페이지의 인터넷 항목은 누를 때만 접속)').toEqual([]);
    expect(errors).toEqual([]);
  });
});
