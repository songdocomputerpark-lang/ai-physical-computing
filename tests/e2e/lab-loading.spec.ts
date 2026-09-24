// 로딩 전략과 캐시(P2-05) 브라우저 테스트 — PLAN §5.2~§5.5, PD-02·PD-11·PD-13.
//
// 두 가지 환경에서 돈다.
// - 만들어진 사이트(npm run test:e2e, CI): 서비스 워커(sw.js)가 있어 캐시·오프라인·예비 경로까지 모두 확인한다.
// - 개발 서버(PW_BASE_URL=http://localhost:4401/…): sw.js는 빌드 뒤에 만들어지므로 없다. 서비스 워커가 필요한 검사는
//   스스로 건너뛰고(아래 hasServiceWorkerFile), 진행률 패널·1분 개념 카드·비상구(?sw=off)만 확인한다.
import { expect, test, type Page } from '@playwright/test';
import { findPyodideFile } from '../../src/lab/loader/pyodide-files.ts';
import { PYODIDE_VERSION } from '../../src/lab/runtime/config.ts';
import { withBase } from '../../src/lib/url.ts';
import { LOAD_TIMEOUT, labRoot } from './helpers/lab.ts';
import { PACKAGES_TIMEOUT, VISION_PATH, waitVisionReady } from './helpers/vision.ts';

const SW_PATH = withBase('sw.js');
/** 예비본 표에 적힌 pyodide.mjs의 원본 크기 — 서비스 워커가 바꿔 준 파일이 진짜 그 파일인지 확인하는 데 쓴다. */
const PYODIDE_MJS_BYTES = findPyodideFile('pyodide.mjs')!.size;

/** 빌드된 사이트에만 있는 서비스 워커 파일이 있는지(없으면 서비스 워커 검사는 건너뛴다) */
async function hasServiceWorkerFile(page: Page): Promise<boolean> {
  const response = await page.request.get(SW_PATH, { failOnStatusCode: false });
  if (!response.ok()) {
    return false;
  }
  return (await response.text()).includes('apc-precache');
}

/**
 * 같은 사이트 Pyodide 예비본이 배포물에 들어 있는지.
 * `npm run build`의 prebuild가 `scripts/fetch-pyodide-fallback.mjs`를 부를 때만 있다(.cache/phase2-requests/loading.md 요청 1번).
 */
async function hasSiteFallback(page: Page): Promise<boolean> {
  const response = await page.request.get(withBase(`vendor/pyodide/${PYODIDE_VERSION}/pyodide.mjs`), { failOnStatusCode: false });
  return response.ok();
}

/** 로딩 모듈의 패널 */
function loadingPanel(page: Page) {
  return page.locator('[data-lab-module-panel="loading"]');
}

test.describe('준비 진행률과 1분 개념 카드', () => {
  test('실습실에 진행률 패널·단계·1분 개념 카드가 보이고, 준비가 끝나면 접힌다', async ({ page }) => {
    // 준비(파이썬·OpenCV 받기)가 끝날 때까지 지켜보므로 기본 30초로는 모자랄 수 있다(전체 실행 중 부하가 크면 준비에 30초 넘게 걸림).
    test.setTimeout(4 * 60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(VISION_PATH);
    const panel = loadingPanel(page);
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(labRoot(page)).toHaveAttribute('data-loading-phase', /loading|ready/u, { timeout: LOAD_TIMEOUT });

    // 단계 줄: ① 파이썬 엔진 → ② numpy → ③ OpenCV
    const core = page.locator('[data-loading-stage="core"]');
    await expect(core).toBeVisible();
    await expect(core).toContainText('파이썬 엔진');
    await expect(page.locator('[data-loading-bar]')).toHaveAttribute('role', 'progressbar');

    // 1분 개념 카드 5장이 [이전]·[다음]으로 넘어간다
    await expect(page.locator('[data-loading-counter]')).toHaveText('1 / 5');
    const firstTitle = await page.locator('[data-loading-card-title]').textContent();
    expect(firstTitle?.length ?? 0).toBeGreaterThan(4);
    await page.getByRole('button', { name: '다음 개념 카드' }).click();
    await expect(page.locator('[data-loading-counter]')).toHaveText('2 / 5');
    expect(await page.locator('[data-loading-card-title]').textContent()).not.toBe(firstTitle);
    await page.getByRole('button', { name: '이전 개념 카드' }).click();
    await expect(page.locator('[data-loading-counter]')).toHaveText('1 / 5');
    // 카드에 실습실 코드 한 줄과 용어사전 링크가 있다
    await expect(page.locator('[data-loading-card-code]')).toContainText('frame');
    await expect(page.locator('[data-loading-card-link]')).toHaveAttribute('href', withBase('glossary/#pixel'));

    // 준비가 끝나면 단계가 모두 ✓가 되고 패널이 한 줄로 접힌다
    await waitVisionReady(page);
    await expect(labRoot(page)).toHaveAttribute('data-loading-phase', 'ready', { timeout: PACKAGES_TIMEOUT });
    await expect(core).toHaveAttribute('data-state', 'done');
    await expect(page.locator('[data-loading-stage="opencv-python"]')).toHaveAttribute('data-state', 'done');
    await expect(page.locator('[data-loading-panel]')).toHaveAttribute('data-collapsed', 'true', { timeout: 10_000 });
    // 접힌 뒤에도 [펼치기]로 다시 볼 수 있다
    await page.getByRole('button', { name: '펼치기' }).click();
    await expect(page.locator('[data-loading-panel]')).toHaveAttribute('data-collapsed', 'false');

    expect(errors).toEqual([]);
  });

  test('준비하는 동안 준비 패널이 편집칸 위에 있고, 그때 누른 [실행]은 예약됐다가 준비가 끝나면 돈다(2026-09-17 검토 반영)', async ({ page, context }) => {
    test.skip(test.info().project.name === 'mobile', '배치 순서는 데스크톱에서 잰다(모바일은 같은 규칙으로 세로로 쌓인다).');
    // 빠른 회선·캐시에서도 "준비 중"인 때를 확실히 잡으려고 파이썬 엔진 파일을 몇 초 늦게 준다(워커·서비스 워커 요청도 문맥 경로 규칙을 따른다).
    await context.route(/pyodide\.asm\.wasm$/u, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await route.continue();
    });
    await page.goto(VISION_PATH);
    const root = labRoot(page);
    await expect(root).toHaveAttribute('data-state', /unloaded|loading/u);
    await expect(root).toHaveAttribute('data-loading-intro', 'yes');
    // 준비 패널(진행률·1분 개념 카드)이 편집칸보다 위에 있다(전에는 편집칸·입력/출력 아래라 문서 y≈3,300px였다).
    // 패널은 모듈 스크립트가 붙은 뒤에 열리므로 보일 때까지 기다렸다가 잰다.
    await expect(loadingPanel(page)).toBeVisible({ timeout: 30_000 });
    const panelBox = await loadingPanel(page).boundingBox();
    const editorBox = await page.locator('[data-lab-editor]').boundingBox();
    expect(panelBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(editorBox?.y ?? 0);

    // 준비 중에도 [실행]을 누를 수 있고, 누르면 예약된 것을 글로 알리며 준비 패널이 화면 안으로 온다.
    const run = page.locator('[data-lab-run]');
    await expect(run).toBeEnabled();
    await run.click();
    await expect(run).toHaveAttribute('data-lab-run-pending', 'yes');
    await expect(run).toHaveText('준비되면 실행돼요…');
    await expect(page.locator('[data-lab-message]')).toContainText('준비가 끝나면 바로 실행할게요');
    await expect(loadingPanel(page)).toBeInViewport();

    // 준비가 끝나면 눌러 둔 실행이 한 번 돌고, 준비 패널은 제자리(아래)로 가며, 결과 칸이 화면 안으로 옮겨진다.
    await expect(root).toHaveAttribute('data-run-count', '1', { timeout: PACKAGES_TIMEOUT });
    await expect(run).not.toHaveAttribute('data-lab-run-pending', 'yes');
    await expect(root).toHaveAttribute('data-loading-intro', 'no');
    await expect(page.locator('[data-lab-reveal-on-run]')).toBeInViewport();
    // 사이트가 넣는 작업 파일(mask.png)은 예약 실행보다 먼저 들어간다 — 늦게 들어가면 "코드가 'mask.png'을(를) 저장했어요"로
    // 학생 코드가 만든 파일처럼 보였다(2026-09-25 Phase 4 검토 반영, 실습실 틀의 holdRun).
    await expect(page.locator('[data-lab-console]')).not.toContainText("'mask.png'");
    await page.locator('[data-lab-stop]').click();
    await expect(root).toHaveAttribute('data-outcome', /^(stopped|killed|ok|error)$/u, { timeout: 30_000 });
  });

  // 2026-09-25 Phase 4 검토 반영(사용성 C1 — 실사이트 재현): 준비 중에 누른 [실행]이 보드 라이브러리(i2c_lcd 등)를 다 넣기 전에 돌아
  // `ImportError: no module named 'i2c_lcd'`로 거짓 오류가 났다. 실습실 틀이 모듈의 "준비 뒤 할 일"(holdRun)을 기다린 뒤에 보낸다.
  test('준비 중에 누른 [실행]은 보드 라이브러리를 다 넣은 뒤에 돈다(ESP32 문자 LCD 예제가 거짓 ImportError 없이 끝난다)', async ({ page, context }) => {
    await context.route(/pyodide\.asm\.wasm$/u, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await route.continue();
    });
    await page.goto(`${withBase('labs/esp32/')}?example=${encodeURIComponent('esp32/u2/2-1-2-lcd-text-check.py')}`);
    const root = labRoot(page);
    await expect(root).toHaveAttribute('data-state', /unloaded|loading/u);
    const run = page.locator('[data-lab-run]');
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await run.click();
    await expect(run).toHaveAttribute('data-lab-run-pending', 'yes');
    await expect(root).toHaveAttribute('data-run-count', '1', { timeout: LOAD_TIMEOUT });
    await expect(root).toHaveAttribute('data-outcome', /^(ok|error|stopped)$/u, { timeout: 60_000 });
    const consoleText = (await page.locator('[data-lab-console]').textContent()) ?? '';
    expect(consoleText).not.toContain('ImportError');
    expect(consoleText).not.toContain('i2c_lcd');
    await expect(root).toHaveAttribute('data-outcome', 'ok');
  });

  test('주소에 ?sw=off를 붙이면 오프라인 준비를 끈다(비상구)', async ({ page }) => {
    await page.goto(`${VISION_PATH}?sw=off`);
    await expect(labRoot(page)).toHaveAttribute('data-loading-sw', 'off', { timeout: 20_000 });
    await expect(loadingPanel(page)).toContainText('오프라인 준비를 껐어요');
    const registrations = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length);
    expect(registrations).toBe(0);
  });
});

test.describe('서비스 워커(캐시·오프라인·예비 경로)', () => {
  test('두 번째 방문은 인터넷 없이 실습실이 열린다', async ({ page, context }) => {
    test.skip(!(await hasServiceWorkerFile(page)), '개발 서버에는 sw.js가 없어요(빌드 뒤에 만들어져요).');
    test.slow();

    await page.goto(VISION_PATH);
    await expect(labRoot(page)).toHaveAttribute('data-loading-sw', /ready|controlled/u, { timeout: 20_000 });
    await waitVisionReady(page);
    // 준비가 끝나면 받은 파일을 캐시에 넣어 둔다(warm).
    await expect(labRoot(page)).toHaveAttribute('data-loading-warm', /done|partial/u, { timeout: PACKAGES_TIMEOUT });

    const caches = await page.evaluate(async () => {
      const names = await window.caches.keys();
      const report: Record<string, number> = {};
      for (const name of names.filter((entry) => entry.startsWith('apc-'))) {
        report[name] = (await (await window.caches.open(name)).keys()).length;
      }
      return report;
    });
    expect(Object.keys(caches).some((name) => name.startsWith('apc-pyodide-'))).toBe(true);
    expect(caches['apc-precache-v1'] ?? 0).toBeGreaterThan(0);

    // 인터넷을 끊고 다시 열어도 실습실이 준비된다(파이썬·휠 모두 캐시에서).
    await context.setOffline(true);
    try {
      await page.reload();
      await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
      await expect(labRoot(page)).toHaveAttribute('data-loading-source', 'cache', { timeout: 20_000 });
      await expect(page.locator('[data-vision-stage="opencv"]')).toHaveAttribute('data-state', 'done', { timeout: PACKAGES_TIMEOUT });

      // 한 번도 안 열어 본 주소를 오프라인에서 열면 설치할 때 받아 둔 홈 페이지를 보여 준다(빈 오류 화면이 아니라).
      await page.goto(withBase('learn/u3/'));
      await expect(page.locator('body')).toContainText('AI 피지컬 컴퓨팅');
    } finally {
      await context.setOffline(false);
    }
  });

  test('[이 컴퓨터에 실습 파일 미리 받기]가 파이썬 파일을 저장해 둔다(교실 PC에서 수업 전에)', async ({ page }) => {
    test.skip(!(await hasServiceWorkerFile(page)), '개발 서버에는 sw.js가 없어요(빌드 뒤에 만들어져요).');
    test.slow();

    await page.goto(VISION_PATH);
    await expect(labRoot(page)).toHaveAttribute('data-loading-sw', /ready|controlled/u, { timeout: 20_000 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          if (navigator.serviceWorker.controller) {
            resolve();
            return;
          }
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
          setTimeout(() => resolve(), 10_000);
        }),
    );

    const button = page.getByRole('button', { name: /실습 파일 (미리 받기|다시 받아 두기)/u });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.locator('[data-loading-prefetch-status]')).toContainText('이 컴퓨터에 저장했어요', { timeout: 180_000 });

    // 첫 실습에 필요한 파일 7개(엔진 5 + numpy + OpenCV)가 모두 캐시에 들어 있다.
    const cached = await page.evaluate(async () => {
      const names = (await window.caches.keys()).filter((name) => name.startsWith('apc-pyodide-'));
      const keys = await Promise.all(names.map(async (name) => (await (await window.caches.open(name)).keys()).map((request) => request.url)));
      return keys.flat();
    });
    expect(cached.length).toBe(7);
    expect(cached.filter((url) => url.endsWith('.whl'))).toHaveLength(2);
  });

  test('막힌 jsDelivr 파일을 서비스 워커가 같은 사이트 예비본으로 바꿔 준다', async ({ page, context }) => {
    test.skip(!(await hasServiceWorkerFile(page)), '개발 서버에는 sw.js가 없어요(빌드 뒤에 만들어져요).');
    test.skip(!(await hasSiteFallback(page)), '같은 사이트 Pyodide 예비본이 없어요(prebuild에 fetch-pyodide-fallback.mjs를 넣어 주세요).');

    await page.goto(VISION_PATH);
    await expect(labRoot(page)).toHaveAttribute('data-loading-sw', /ready|controlled/u, { timeout: 20_000 });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      for (const name of await window.caches.keys()) {
        if (name.startsWith('apc-pyodide-')) {
          await window.caches.delete(name);
        }
      }
    });
    // 이 페이지를 서비스 워커가 맡을 때까지 기다린다(첫 방문은 clients.claim 뒤부터).
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          if (navigator.serviceWorker.controller) {
            resolve();
            return;
          }
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
          setTimeout(() => resolve(), 10_000);
        }),
    );

    await context.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
    // 학생 코드 쪽에서 보면 주소는 그대로 jsDelivr인데, 서비스 워커가 같은 사이트 파일로 바꿔 답한다(파일 크기로 확인).
    const result = await page.evaluate(async (version: string) => {
      const response = await fetch(`https://cdn.jsdelivr.net/pyodide/v${version}/full/pyodide.mjs`);
      const body = await response.arrayBuffer();
      return { ok: response.ok, bytes: body.byteLength, controlled: navigator.serviceWorker.controller !== null };
    }, PYODIDE_VERSION);
    expect(result.controlled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.bytes).toBe(PYODIDE_MJS_BYTES);
  });

  test('크기는 같은데 내용이 다른 파이썬 엔진 파일은 서비스 워커가 버리고 예비본을 쓴다(SHA-256 대조, 2026-09-17 검토 반영)', async ({ page, context }) => {
    test.skip(!(await hasServiceWorkerFile(page)), '개발 서버에는 sw.js가 없어요(빌드 뒤에 만들어져요).');
    test.skip(!(await hasSiteFallback(page)), '같은 사이트 Pyodide 예비본이 없어요(prebuild에 fetch-pyodide-fallback.mjs를 넣어 주세요).');

    await page.goto(VISION_PATH);
    await expect(labRoot(page)).toHaveAttribute('data-loading-sw', /ready|controlled/u, { timeout: 20_000 });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      for (const name of await window.caches.keys()) {
        if (name.startsWith('apc-pyodide-')) {
          await window.caches.delete(name);
        }
      }
    });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          if (navigator.serviceWorker.controller) {
            resolve();
            return;
          }
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
          setTimeout(() => resolve(), 10_000);
        }),
    );

    // 차단 장비·중간자가 **같은 크기로** 바꿔치기한 파일을 흉내 낸다(크기만 보면 통과하던 경우). 워커에서 그대로 실행되는 코드라 막아야 한다.
    const forged = Buffer.alloc(PYODIDE_MJS_BYTES, 0x20);
    Buffer.from('/* forged */ export const forged = true;\n').copy(forged);
    await context.route(`https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/pyodide.mjs`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: forged }),
    );

    const result = await page.evaluate(async ({ version, sitePath }) => {
      const hex = async (buffer: ArrayBuffer) =>
        [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const response = await fetch(`https://cdn.jsdelivr.net/pyodide/v${version}/full/pyodide.mjs`);
      const body = await response.arrayBuffer();
      const site = await (await fetch(sitePath, { cache: 'no-store' })).arrayBuffer();
      return {
        ok: response.ok,
        bytes: body.byteLength,
        forged: new TextDecoder().decode(body.slice(0, 12)) === '/* forged */',
        sameAsSite: (await hex(body)) === (await hex(site)),
      };
    }, { version: PYODIDE_VERSION, sitePath: withBase(`vendor/pyodide/${PYODIDE_VERSION}/pyodide.mjs`) });
    expect(result.ok).toBe(true);
    expect(result.bytes).toBe(PYODIDE_MJS_BYTES);
    expect(result.forged, '바꿔치기한 파일이 그대로 학생에게 전달됐어요').toBe(false);
    expect(result.sameAsSite).toBe(true);
  });

  test('jsDelivr가 막혀도 같은 사이트 예비본으로 실습실이 열린다', async ({ page, context }) => {
    test.skip(!(await hasServiceWorkerFile(page)), '개발 서버에는 sw.js가 없어요(빌드 뒤에 만들어져요).');
    test.skip(!(await hasSiteFallback(page)), '같은 사이트 Pyodide 예비본이 없어요(prebuild에 fetch-pyodide-fallback.mjs를 넣어 주세요).');
    test.slow();

    // 서비스 워커를 먼저 켜 둔다(첫 방문에는 아직 페이지를 맡지 않아서 예비 경로로 바꾸지 못한다).
    await page.goto(VISION_PATH);
    await expect(labRoot(page)).toHaveAttribute('data-loading-sw', /ready|controlled/u, { timeout: 20_000 });
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      // 다음 방문이 캐시가 아니라 진짜 예비 경로를 쓰도록 받아 둔 Pyodide 캐시를 비운다.
      for (const name of await window.caches.keys()) {
        if (name.startsWith('apc-pyodide-')) {
          await window.caches.delete(name);
        }
      }
    });

    // jsDelivr로 가는 요청을 모두 끊는다(학교 네트워크가 막은 상황).
    await context.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
    await page.goto(VISION_PATH);
    await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    // 파이썬을 같은 사이트 예비본(public/vendor/pyodide/)에서 받았다.
    await expect(labRoot(page)).toHaveAttribute('data-loading-source', /site|cache/u, { timeout: 20_000 });
    await expect(page.locator('[data-vision-stage="opencv"]')).toHaveAttribute('data-state', 'done', { timeout: PACKAGES_TIMEOUT });
  });
});

test.describe('네트워크 점검(시작하기 > 점검)', () => {
  test('[시험하기]를 누를 때만 접속하고 결과를 한국어로 보여 준다', async ({ page }) => {
    // 점검 페이지는 이 작업 구역 밖이라 통합 때 부품을 붙인다(.cache/phase2-requests/loading.md 요청 2번).
    // 붙기 전에는 같은 부품을 올린 임시 페이지로 시험할 수 있게 주소만 바꿔 준다: PW_CHECK_PATH=labs/dev/network/
    const checkPage = withBase(process.env.PW_CHECK_PATH ?? 'start/check/');
    // 공개 중계 서버(MQTT) 항목은 WebSocket으로 연결만 해 본다(2026-09-24 Phase 4 통합). 시험에서는 진짜 서버에 붙지 않고
    // Playwright가 연결을 가로채 열어 준다 — 메시지가 하나도 오가지 않는지(연결만 하고 닫는지)도 여기서 본다.
    // 가로채기는 **문서를 열기 전에** 건다: Playwright는 새 문서에 넣는 스크립트로 WebSocket을 바꾸므로, 연 뒤에 걸면
    // 그 문서의 연결은 진짜 서버로 나간다(2026-09-24 통합 검사에서 실제로 그렇게 나간 것을 보고 고침).
    const sockets: string[] = [];
    const socketMessages: string[] = [];
    await page.routeWebSocket(/^wss:\/\/(?:broker\.emqx\.io|test\.mosquitto\.org)/u, (socket) => {
      sockets.push(socket.url());
      socket.onMessage((message) => socketMessages.push(String(message)));
    });
    const response = await page.goto(checkPage);
    expect(response?.status()).toBe(200);
    const root = page.locator('[data-network-check]');
    test.skip((await root.count()) === 0, '점검 페이지에 네트워크 항목이 아직 붙지 않았어요(.cache/phase2-requests/loading.md 요청 2번).');

    // 누르기 전에는 사이트 밖으로 나가는 요청이 없다(파일 요청과 WebSocket 모두).
    const outside: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (/^https?:/u.test(url) && !url.startsWith(new URL(checkPage, page.url()).origin)) {
        outside.push(url);
      }
    });
    await page.waitForTimeout(1500);
    expect(outside).toEqual([]);
    expect(sockets).toEqual([]);

    await expect(root).toHaveAttribute('data-state', 'idle');
    await page.getByRole('button', { name: '시험하기' }).click();
    await expect(root).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
    await expect(page.locator('[data-network-item="pyodide-cdn"]')).toHaveAttribute('data-status', /ok|blocked|unknown/u);
    await expect(page.locator('[data-network-item="pyodide-site"]')).toHaveAttribute('data-status', /ok|unknown/u);
    for (const id of ['mqtt-emqx', 'mqtt-mosquitto']) {
      await expect(page.locator(`[data-network-item="${id}"]`)).toHaveAttribute('data-status', 'ok');
    }
    expect(sockets.map((url) => new URL(url).host).sort()).toEqual(['broker.emqx.io:8084', 'test.mosquitto.org:8081']);
    expect(socketMessages).toEqual([]);
    // 누른 뒤에도 파일은 jsDelivr에서만 받았다(그 밖의 사이트로는 나가지 않는다).
    expect(outside.every((url) => url.startsWith('https://cdn.jsdelivr.net/'))).toBe(true);

    const report = await page.locator('[data-network-text]').inputValue();
    expect(report).toContain('[네트워크 점검]');
    expect(report).toContain('파이썬 엔진 받는 곳');
  });
});

test.describe('좁은 화면', () => {
  test('375px에서 진행률 패널이 화면을 넘지 않는다', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', '모바일 프로젝트에서만 잰다.');
    await page.goto(VISION_PATH);
    await expect(loadingPanel(page)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const width = await loadingPanel(page).evaluate((element) => element.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(375);
  });
});
