// 로딩 전략과 캐시(P2-05) 브라우저 테스트 — PLAN §5.2~§5.5, PD-02·PD-11·PD-13.
//
// 두 가지 환경에서 돈다.
// - 만들어진 사이트(npm run test:e2e, CI): 서비스 워커(sw.js)가 있어 캐시·오프라인·예비 경로까지 모두 확인한다.
// - 개발 서버(PW_BASE_URL=http://localhost:4401/…): sw.js는 빌드 뒤에 만들어지므로 없다. 서비스 워커가 필요한 검사는
//   스스로 건너뛰고(아래 hasServiceWorkerFile), 진행률 패널·1분 개념 카드·비상구(?sw=off)만 확인한다.
import { expect, test, type Page } from '@playwright/test';
import { findPyodideFile } from '../../src/lab/loader/pyodide-files.ts';
import { MQTT_BROKERS } from '../../src/lab/mqtt/brokers.ts';
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

/**
 * 개발 서버의 Vite 새로 고침 신호(full-reload·update)를 거른다 — a11y-keyboard.spec.ts·a11y-states.spec.ts와 같은 방법. 빌드 결과에는 이 연결이 없다.
 * 여러 작업이 한 작업 폴더에서 함께 돌 때 다른 사람이 실습실 모듈(.ts·.py)을 고치면 Vite가 열린 실습실을 다시 불러 파이썬 준비가 처음부터
 * 다시 시작했고, 이 파일의 검사가 "90초 안에 준비되지 않음"으로 흔들렸다(판 1.2.0 구역 B 확인 — 호출 기록의 "navigation to finish").
 */
async function freezeDevReloads(page: Page): Promise<void> {
  await page.routeWebSocket(/\/\?token=/u, (socket) => {
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

test.beforeEach(async ({ page }) => {
  await freezeDevReloads(page);
});

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
    // 마우스로 누른 카드 단추의 초점은 칸이 숨을 때 문서(body)로 사라지지 않고 [펼치기]로 옮겨 간다(판 1.1.1 최종 점검)
    expect(await page.evaluate(() => document.activeElement !== document.body && document.activeElement !== null)).toBe(true);
    // 접힌 뒤에도 [펼치기]로 다시 볼 수 있다
    await page.getByRole('button', { name: '펼치기' }).click();
    await expect(page.locator('[data-loading-panel]')).toHaveAttribute('data-collapsed', 'false');

    expect(errors).toEqual([]);
  });

  // 판 1.1.1 최종 점검(PROGRESS 미해결 216 — CI에서 한 번 흔들린 키보드 걷기의 원인): 준비가 끝나 칸이 저절로 접히며 맨 위에서 제자리
  // (입력·출력 아래)로 옮겨 가면, 키보드 초점이 칸의 [접기]에 있었을 때는 화면 밖에 남고 카드 단추에 있었을 때는 문서(body)로 사라졌다.
  // 이제 키보드 초점이 칸 안에 있으면 접기를 미루고, 초점이 칸을 떠날 때 접으며 초점 요소는 화면 안에 둔다.
  for (const target of [
    { label: '[접기]', selector: '[data-loading-toggle]' },
    { label: '1분 개념 카드 [다음 →]', selector: '[data-loading-next]' },
  ]) {
    test(`키보드 초점이 준비 칸의 ${target.label}에 있는 채로 준비가 끝나도 초점이 화면 안에 남고, 칸을 떠나면 그때 접힌다`, async ({ page, context }) => {
      test.setTimeout(4 * 60_000);
      // 초점을 옮길 시간을 벌려고 파이썬 엔진 파일을 몇 초 늦게 준다
      await context.route(/pyodide\.asm\.wasm$/u, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await route.continue();
      });
      await page.goto(VISION_PATH);
      const box = page.locator('[data-loading-panel]');
      await expect(loadingPanel(page)).toBeVisible({ timeout: 30_000 });
      await expect(labRoot(page)).toHaveAttribute('data-loading-intro', 'yes');

      // 키보드로 그 단추에 초점을 둔다(뒤로 한 번 갔다가 다시 앞으로 — 키보드 초점 표시가 켜지게)
      const button = page.locator(target.selector);
      await button.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(button).toBeFocused();

      // 준비가 끝나고 저절로 접힐 때(1.5초 뒤)가 지나도 초점이 칸 안이라 접지 않는다 — 초점은 그 단추에, 화면 안에 있다
      await waitVisionReady(page);
      await expect(labRoot(page)).toHaveAttribute('data-loading-phase', 'ready', { timeout: PACKAGES_TIMEOUT });
      await page.waitForTimeout(2500);
      await expect(box).toHaveAttribute('data-collapsed', 'false');
      await expect(button).toBeFocused();
      await expect(button).toBeInViewport();

      // 초점이 칸을 떠나면 그때 접히고, 새 초점 요소는 화면 안에 있다(문서 body로 사라지지 않는다)
      const run = page.locator('[data-lab-run]');
      await run.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(run).toBeFocused();
      await expect(box).toHaveAttribute('data-collapsed', 'true', { timeout: 5_000 });
      await expect(labRoot(page)).toHaveAttribute('data-loading-intro', 'no');
      await expect(run).toBeFocused();
      await expect(run).toBeInViewport();
    });
  }

  // 판 1.2.0(PROGRESS 미해결 218 — WCAG 2.4.3 초점 차례): 예전에는 CSS로 보이게만 올려 준비 칸의 Tab 차례가 편집칸·입력/출력·조절 패널 뒤였다.
  // 이제 준비 칸이 DOM째 편집칸 앞 자리([data-lab-intro])로 옮겨 오고(src/lab/modules/loading/intro.ts), 접히면 제자리(넓은 모듈 줄)로 돌아간다.
  // Tab으로 걸어 보는 검사는 a11y-keyboard.spec.ts(데스크톱) — 여기서는 두 화면 폭 모두 DOM 차례·자리를 본다.
  test('첫 준비 동안 준비 칸은 DOM째 편집칸 앞 자리에 있고(보이는 차례 = Tab 차례), 접히면 제자리(입력·출력 아래)로 돌아간다', async ({ page, context }) => {
    test.setTimeout(4 * 60_000);
    await context.route(/pyodide\.asm\.wasm$/u, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    await page.goto(VISION_PATH);
    const root = labRoot(page);
    await expect(loadingPanel(page)).toBeVisible({ timeout: 30_000 });
    await expect(root).toHaveAttribute('data-loading-intro', 'yes');
    await expect(page.locator('[data-lab-intro] > [data-lab-module-panel="loading"]')).toHaveCount(1);
    const order = () =>
      page.evaluate(() => {
        const panel = document.querySelector('[data-lab-module-panel="loading"]')!;
        const follows = (a: Element, selector: string) => (a.compareDocumentPosition(document.querySelector(selector)!) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        return { beforeEditor: follows(panel, '[data-lab-editor]'), beforeIo: follows(panel, '[data-lab-io]'), beforeConsole: follows(panel, '[data-lab-console]') };
      });
    expect(await order()).toEqual({ beforeEditor: true, beforeIo: true, beforeConsole: true });
    // 보이는 자리도 편집칸 위(두 화면 폭 모두)
    const panelTop = (await loadingPanel(page).boundingBox())?.y ?? Number.POSITIVE_INFINITY;
    const editorTop = (await page.locator('[data-lab-editor]').boundingBox())?.y ?? 0;
    expect(panelTop).toBeLessThan(editorTop);

    // 준비가 끝나 접히면 제자리(넓은 모듈 줄 — 입력·출력·조절 패널 뒤, 콘솔 앞)로 DOM째 돌아가고 맨 위 자리는 비어 숨는다
    await waitVisionReady(page);
    await expect(page.locator('[data-loading-panel]')).toHaveAttribute('data-collapsed', 'true', { timeout: PACKAGES_TIMEOUT });
    await expect(root).toHaveAttribute('data-loading-intro', 'no');
    await expect(page.locator('.lab__modules > [data-lab-module-panel="loading"]')).toHaveCount(1);
    await expect(page.locator('[data-lab-intro] > *')).toHaveCount(0);
    await expect(page.locator('[data-lab-intro]')).toBeHidden();
    expect(await order()).toEqual({ beforeEditor: false, beforeIo: false, beforeConsole: true });
  });

  test('4단원 통합 화면(한 문서에 실습실 틀 둘): 두 칸의 준비 칸이 각자 자기 틀의 맨 위 자리로 간다', async ({ page, context }) => {
    test.skip(test.info().project.name === 'mobile', '틀 둘의 자리는 데스크톱에서 본다(같은 코드).');
    test.setTimeout(3 * 60_000);
    await context.route(/pyodide\.asm\.wasm$/u, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 8000));
      await route.continue();
    });
    await page.goto(withBase('labs/unit4/'));
    const roots = page.locator('[data-lab]');
    await expect(roots).toHaveCount(2);
    for (const index of [0, 1]) {
      const root = roots.nth(index);
      await expect(root.locator('[data-lab-module-panel="loading"]')).toBeVisible({ timeout: 60_000 });
      await expect(root).toHaveAttribute('data-loading-intro', 'yes');
      // 자기 틀의 자리에 — 다른 칸의 자리로 가지 않는다
      await expect(root.locator(':scope > [data-lab-intro] > [data-lab-module-panel="loading"]')).toHaveCount(1);
    }
  });

  // 판 1.2.1(판 1.2.0 적대적 검토 E14): 첫 준비 동안 맨 위 칸의 [접기]를 누르면 칸이 제자리(입력·출력 아래)로 옮겨 가며 브라우저가 초점 단추를
  // 따라 화면을 굴려(moveBefore — Edge 154 실측 데스크톱 scrollY 0 → 1,485px, 375px 폭 3,152px) 편집칸·조작 줄이 화면 밖으로 사라졌다.
  // 이제 학생이 누른 [접기]는 그 자리에서 접히고(옮기지 않음) [실행] 때 제자리로 간다 — 마우스·키보드 모두 화면이 뛰지 않는다.
  for (const how of ['마우스', '키보드'] as const) {
    test(`첫 준비 동안 ${how}로 준비 칸 [접기]를 누르면 그 자리에서 접히고 화면이 뛰지 않으며, [펼치기]가 화면 안에 있다`, async ({ page, context }) => {
      test.setTimeout(4 * 60_000);
      // 저절로 접히기 전에 누르려고 파이썬 엔진 파일을 늦게 준다
      await context.route(/pyodide\.asm\.wasm$/u, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 6000));
        await route.continue().catch(() => undefined);
      });
      await page.goto(VISION_PATH);
      await expect(loadingPanel(page)).toBeVisible({ timeout: 30_000 });
      await expect(labRoot(page)).toHaveAttribute('data-loading-intro', 'yes');
      const toggle = page.locator('[data-loading-toggle]');
      await expect(toggle).toHaveText('접기');
      // 누르기 전 화면 위치는 [접기]가 화면 안에 들어온 뒤에 잰다 — 휴대폰 폭에서는 칸이 첫 화면 아래(약 950px)라 클릭·초점이 먼저 굴린다
      if (how === '마우스') {
        await toggle.scrollIntoViewIfNeeded();
      } else {
        await toggle.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        await expect(toggle).toBeFocused();
      }
      const before = await page.evaluate(() => Math.round(window.scrollY));
      if (how === '마우스') {
        await toggle.click();
      } else {
        await page.keyboard.press('Enter');
        await expect(toggle).toBeFocused();
      }
      await expect(page.locator('[data-loading-panel]')).toHaveAttribute('data-collapsed', 'true');
      await expect(toggle).toHaveText('펼치기');
      await page.waitForTimeout(300);
      const after = await page.evaluate(() => Math.round(window.scrollY));
      expect(Math.abs(after - before), `[접기] 전 scrollY ${before} → 뒤 ${after}`).toBeLessThan(100);
      // 칸은 맨 위 자리에 접힌 채 남고(편집칸 앞), 첫 준비 표시도 그대로다
      await expect(labRoot(page)).toHaveAttribute('data-loading-intro', 'yes');
      await expect(page.locator('[data-lab-intro] > [data-lab-module-panel="loading"]')).toHaveCount(1);
      await expect(toggle).toBeInViewport();
    });
  }

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

  // 판 1.2.1(판 1.2.0 적대적 검토 E15): 준비 중 키보드로 누른 [실행]이 "준비되면 실행돼요…"로 바뀌며 disabled가 되어 초점이 문서(body)로 빠졌고,
  // [정지]도 꺼져 있어 예약을 거둘 수 없었다. 이제 예약된 [실행]은 aria-disabled(초점은 남음)이고 [정지]로 예약을 거둔다.
  test('준비 중 키보드로 누른 [실행]은 초점이 그대로 남고(aria-disabled), [정지]로 예약을 거둘 수 있다', async ({ page, context }) => {
    test.skip(test.info().project.name === 'mobile', '키보드 초점은 데스크톱에서 본다.');
    test.setTimeout(4 * 60_000);
    await context.route(/pyodide\.asm\.wasm$/u, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 8000));
      await route.continue().catch(() => undefined);
    });
    await page.goto(VISION_PATH);
    const root = labRoot(page);
    const run = page.locator('[data-lab-run]');
    const stop = page.locator('[data-lab-stop]');
    await expect(root).toHaveAttribute('data-state', /unloaded|loading/u);
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await run.focus();
    await page.keyboard.press('Enter');
    await expect(run).toHaveAttribute('data-lab-run-pending', 'yes');
    await expect(run).toHaveAttribute('aria-disabled', 'true');
    await expect(run).toBeFocused();
    await expect(stop).toBeEnabled();
    // 한 번 더 눌러도 예약은 하나(실행 번호가 늘지 않는다)
    await page.keyboard.press('Enter');
    await expect(run).toHaveAttribute('data-lab-run-pending', 'yes');
    // [정지]로 예약을 거둔다 — 단추는 다시 "실행", 초점은 문서로 빠지지 않는다
    await stop.focus();
    await page.keyboard.press('Enter');
    await expect(run).not.toHaveAttribute('data-lab-run-pending', 'yes');
    await expect(run).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('[data-lab-message]')).toContainText('눌러 둔 [실행]을 거뒀어요');
    expect(await page.evaluate(() => document.activeElement !== document.body && document.activeElement !== null)).toBe(true);
    // 준비가 끝나도 거둔 실행은 돌지 않는다
    await expect(root).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    await page.waitForTimeout(1500);
    await expect(root).not.toHaveAttribute('data-run-count', /^[1-9]/u);
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

  // 2026-09-26 Phase 6 사용성 검토 지적 4·5: 파이썬은 "준비됐어요"인데 numpy·OpenCV를 아직 받는 중에 [실행]하면 ① 콘솔과 "콘솔에 결과가
  // 나왔어요" 칸에 영어 "Loading numpy, opencv-python"이 결과처럼 나오고 ② 입력·출력 칸이 "[실행]을 누르면 입력이 켜져요"만 보여
  // 느린 망에서 몇 분 동안 멈춘 것처럼 보였다.
  test('파이썬 준비 뒤 OpenCV를 받는 중에 [실행]하면 받는 중이라고 알리고 다 받은 뒤 저절로 시작하며, 콘솔에 영어 로딩 줄이 없다', async ({ page, context }) => {
    test.skip(test.info().project.name === 'mobile', '데스크톱에서 잰다(같은 코드).');
    test.setTimeout(LOAD_TIMEOUT + PACKAGES_TIMEOUT);
    // OpenCV 휠을 15초 늦게 준다 — 파이썬 엔진은 준비됐고 실습 파일은 아직 받는 때를 확실히 잡는다(워커 요청도 문맥 경로 규칙을 따른다).
    await context.route(/opencv_python[^/]*\.whl$/u, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      await route.continue();
    });
    await page.goto(VISION_PATH);
    const root = labRoot(page);
    await expect(root).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    await expect(root).toHaveAttribute('data-vision-packages', 'loading');
    // 판 1.2.1(검토 E1): 파이썬은 준비됐고 실습 파일만 받는 동안 준비 칸 제목이 "파이썬을 준비하고 있어요"로 남지 않는다
    await expect(page.locator('[data-loading-title]')).toHaveText('파이썬은 준비됐어요 — 실습 파일을 더 받고 있어요');
    // 판 1.2.1(검토 E13): 받은 양이 바뀌는 진행 줄은 낭독하지 않고, 낭독 줄(role=status)이 단계만 알린다
    // (실습실 뿌리에도 data-loading-text 값이 있어 준비 칸 안의 진행 줄만 고른다)
    await expect(page.locator('[data-loading-panel] [data-loading-text]')).toHaveAttribute('aria-live', 'off');
    await expect(page.locator('[data-lab-progress]')).toHaveAttribute('aria-live', 'off');
    const announce = page.locator('[data-loading-announce]');
    await expect(announce).toHaveAttribute('role', 'status');
    await expect(announce).toContainText('파이썬은 준비됐고, 실습 파일(');
    await page.locator('[data-lab-run]').click();
    await expect(root).toHaveAttribute('data-vision-package-wait', 'yes');
    await expect(announce).toContainText('실행 전에 필요한 파일(');
    await expect(announce).toContainText('다 받으면 코드가 저절로 시작해요');
    await expect(page.locator('[data-vision-output-empty]')).toContainText('필요한 파일을 받는 중이에요');
    await expect(page.locator('[data-vision-output-empty]')).toContainText('다 받으면 코드가 저절로 시작');
    await expect(page.locator('[data-vision-input-status]')).toContainText('필요한 파일을 다 받으면 켜져요');
    await expect(page.locator('[data-lab-progress]')).toContainText('다 받으면 코드가 저절로 시작해요');
    // 다 받으면 코드가 저절로 시작하고 안내는 원래대로 돌아간다
    await expect(root).toHaveAttribute('data-vision-packages', 'ready', { timeout: PACKAGES_TIMEOUT });
    await expect(root).toHaveAttribute('data-vision-package-wait', 'no');
    await expect(page.locator('[data-vision-input-status]')).not.toContainText('필요한 파일');
    await expect(root).toHaveAttribute('data-state', 'running');
    // Pyodide의 영어 패키지 알림이 콘솔로 새지 않는다(실행의 패키지 받기와 미리 받기를 줄 세움 — src/lab/runtime/package-queue.ts)
    await expect(page.locator('[data-lab-console]')).not.toContainText('Loading');
    await page.locator('[data-lab-stop]').click();
    await expect(root).toHaveAttribute('data-outcome', /^(stopped|killed|ok)$/u, { timeout: 30_000 });
    await expect(page.locator('[data-lab-console]')).not.toContainText('Loading');
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

      // 한 번도 안 열어 본 주소를 오프라인에서 열면 "인터넷 연결이 없어요" 안내 쪽을 보인다(빈 오류 화면도, 그 주소에 홈 내용도 아니라 —
      // 2026-09-26 Phase 6 사용성 검토 지적 3: 전에는 주소창은 /learn/u3/인데 화면은 홈이라 링크가 고장 난 것처럼 보였다).
      // 안내 쪽의 [홈으로 가기]는 설치할 때 받아 둔 홈을 연다.
      await page.goto(withBase('learn/u3/'));
      await expect(page.locator('h1')).toHaveText('인터넷 연결이 없어요');
      await expect(page.locator('[data-home-action="camera"]')).toHaveCount(0);
      await page.getByRole('link', { name: '홈으로 가기' }).click();
      await expect(page.locator('[data-home-action="camera"]')).toBeVisible();
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
    // 가로챌 서버는 brokers.ts에서 공식 안내로 확인한(verified) wss:// 주소 전부 — 새 서버가 확인되면 이 검사도 저절로 따라간다
    // (판 1.1.0에서 HiveMQ가 더해졌을 때 옛 정규식이 HiveMQ를 가로채지 않아 진짜 서버에 붙을 뻔했다 — 미해결 135·146).
    const checkedBrokers = MQTT_BROKERS.filter((broker) => broker.verified && broker.url.startsWith('wss://'));
    const checkedHosts = checkedBrokers.map((broker) => new URL(broker.url).host);
    await page.routeWebSocket((url) => url.protocol === 'wss:' && checkedHosts.includes(url.host), (socket) => {
      sockets.push(socket.url());
      socket.onMessage((message) => socketMessages.push(String(message)));
    });
    const response = await page.goto(checkPage);
    expect(response?.status()).toBe(200);
    // 네트워크 항목은 점검 페이지에 붙어 있다(통합 뒤 — 없으면 건너뛰지 않고 실패한다: 기능이 사라지는 회귀가 초록으로 보이지 않게, 판 1.1.1 최종 점검)
    const root = page.locator('[data-network-check]');
    await expect(root).toHaveCount(1);

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
    for (const id of checkedBrokers.map((broker) => `mqtt-${broker.id}`)) {
      await expect(page.locator(`[data-network-item="${id}"]`)).toHaveAttribute('data-status', 'ok');
    }
    expect(checkedBrokers.map((broker) => broker.id)).toEqual(expect.arrayContaining(['emqx', 'mosquitto', 'hivemq']));
    expect(sockets.map((url) => new URL(url).host).sort()).toEqual([...checkedHosts].sort());
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
