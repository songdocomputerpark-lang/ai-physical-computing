/**
 * 영상 처리 실습실 — 패키지를 받는 동안의 [실행](판 1.2.0, PROGRESS 미해결 219)과 받는 중 안내.
 *
 * 실습실은 준비 직후 numpy·OpenCV(약 13MB)를 미리 받는다. 판 1.1.5까지는 받을 패키지가 없는 코드(3-1-1 바이트 변환기, 시리얼만 쓰는 3-1-2
 * 컴퓨터 쪽 등)도 그 받기가 끝날 때까지 시작하지 않았다(느린 학교망 첫 방문에 몇 분 — LC-06·U34-03). 이제는
 *   ① 받을 것이 없는 코드는 곧바로 돌고 "받는 중" 안내가 뜨지 않는다(data-vision-package-wait는 no 그대로),
 *   ② 그런 코드가 흉내 모듈을 거쳐 받는 중인 패키지(numpy)에 닿으면 그 import 줄에서 기다리며 "다 받으면 코드가 이어서 돌아요"라고 알린다,
 *   ③ OpenCV를 쓰는 코드는 예전처럼 "다 받으면 코드가 저절로 시작해요"로 기다리고, 기다리는 동안 [정지]하면 곧바로 멈춘다(예전엔 1초 뒤
 *     파이썬을 다시 시작하며 미리 받기도 끊겼다 — 이제 미리 받기는 그대로 이어진다).
 * 받는 때를 확실히 잡으려고 휠 응답을 문(gate)으로 붙들었다가 검사가 연다(실제 시간에 기대지 않는다 — DECISIONS C74 ②).
 * 워커가 받는 요청도 문맥 경로 규칙을 따른다(lab-loading.spec.ts와 같은 방법). 데스크톱만.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { STOP_GRACE_MS } from '../../src/lab/runtime/config.ts';
import { withBase } from '../../src/lib/url.ts';
import { LOAD_TIMEOUT, labRoot, runCode, waitDone } from './helpers/lab.ts';
import { PACKAGES_TIMEOUT } from './helpers/vision.ts';

const BYTES_EXAMPLE = withBase(`labs/vision/?example=${encodeURIComponent('vision/u3/3-1-1-bytes-converter.py')}`);
const FIRST_EDGE = withBase('labs/vision/');

/** 이름이 pattern에 맞는 휠 응답을 열 때까지 붙든다. 돌려준 함수를 부르면 연다. */
async function holdWheels(context: BrowserContext, pattern: RegExp): Promise<() => void> {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await context.route(pattern, async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}

/** 실습실 뿌리의 data-vision-package-wait 값이 바뀔 때마다 페이지 안에 적는다(짧은 창을 순간 expect로 잡지 않게 — C74 ②) */
async function recordPackageWait(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-lab]');
    const log: string[] = [];
    (window as unknown as { __apcWaitLog: string[] }).__apcWaitLog = log;
    if (!root) {
      return;
    }
    log.push(root.dataset.visionPackageWait ?? '');
    new MutationObserver(() => log.push(root.dataset.visionPackageWait ?? '')).observe(root, { attributes: true, attributeFilter: ['data-vision-package-wait'] });
  });
}

async function packageWaitLog(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __apcWaitLog?: string[] }).__apcWaitLog ?? []);
}

test.describe('영상 처리 실습실 — 패키지를 받는 동안의 [실행](미해결 219)', () => {
  test.skip(({ isMobile }) => isMobile, '데스크톱에서 잰다(같은 코드).');
  test.describe.configure({ timeout: LOAD_TIMEOUT + PACKAGES_TIMEOUT + 60_000 });

  test('받을 것이 없는 예제(3-1-1 바이트 변환기)는 OpenCV를 받는 중에도 곧바로 돌고 받는 중 안내가 뜨지 않으며, numpy에 닿는 코드는 import 줄에서 기다렸다가 이어 간다', async ({ page, context }) => {
    const releaseOpencv = await holdWheels(context, /opencv_python[^/]*\.whl$/u);
    const releaseNumpy = await holdWheels(context, /numpy-[^/]*\.whl$/u);
    await page.goto(BYTES_EXAMPLE);
    const root = labRoot(page);
    await expect(root).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    await expect(root).toHaveAttribute('data-vision-packages', 'loading');
    await recordPackageWait(page);

    // ① 곧바로 돈다 — 휠은 아직 붙들려 있다(미리 받기 그대로 'loading')
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, 30_000)).toBe('ok');
    const consoleBox = page.locator('[data-lab-console]');
    await expect(consoleBox).toContainText('④ 할 일: 파란 LED를 켜요');
    await expect(root).toHaveAttribute('data-vision-packages', 'loading');
    expect(await packageWaitLog(page)).not.toContain('yes');
    await expect(page.locator('[data-vision-output-empty]')).not.toContainText('필요한 파일을 받는 중이에요');
    await expect(consoleBox).not.toContainText('Loading');

    // ② 흉내 모듈(mediapipe)을 거쳐 받는 중인 numpy에 닿는 코드 — 코드는 곧바로 시작해 앞줄을 찍고, import 줄에서 기다린다
    await runCode(page, "print('앞줄')\nimport mediapipe as mp\nprint('mediapipe', mp.__version__)\n");
    await expect(consoleBox).toContainText('앞줄', { timeout: 30_000 });
    await expect(root).toHaveAttribute('data-vision-package-wait', 'yes', { timeout: 30_000 });
    await expect(page.locator('[data-vision-output-empty]')).toContainText('다 받으면 코드가 이어서 돌아요');
    await expect(page.locator('[data-lab-progress]')).toContainText('다 받으면 이어서 돌아요');
    await expect(root).toHaveAttribute('data-state', 'running');
    // 휠을 놓으면 다 받은 뒤 그 줄부터 이어 간다
    releaseNumpy();
    releaseOpencv();
    expect(await waitDone(page, PACKAGES_TIMEOUT)).toBe('ok');
    await expect(consoleBox).toContainText('mediapipe 0.10.35-apc');
    await expect(root).toHaveAttribute('data-vision-package-wait', 'no');
    await expect(root).toHaveAttribute('data-vision-packages', 'ready', { timeout: PACKAGES_TIMEOUT });
    await expect(consoleBox).not.toContainText('Loading');
    await expect(consoleBox).not.toContainText('흉내 모듈');

    // 다 받은 뒤에는 cv2도 그대로(흉내가 설치돼 창 함수가 사이트 것)
    await runCode(page, "import cv2\nprint('cv2', cv2.__version__, cv2.imshow.__module__)\n");
    expect(await waitDone(page, 60_000)).toBe('ok');
    await expect(consoleBox).toContainText('cv2 4.11.0 apc_cv2');
  });

  test('OpenCV를 쓰는 코드는 받는 중 안내와 함께 기다리고, 기다리는 동안 [정지]하면 곧바로 멈추며 미리 받기는 끊기지 않는다', async ({ page, context }) => {
    const releaseOpencv = await holdWheels(context, /opencv_python[^/]*\.whl$/u);
    await page.goto(FIRST_EDGE);
    const root = labRoot(page);
    await expect(root).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    await expect(root).toHaveAttribute('data-vision-packages', 'loading');

    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(root).toHaveAttribute('data-vision-package-wait', 'yes');
    await expect(page.locator('[data-vision-output-empty]')).toContainText('다 받으면 코드가 저절로 시작하고, 영상이 여기에 나와요');
    await expect(page.locator('[data-lab-progress]')).toContainText('다 받으면 코드가 저절로 시작해요');

    await page.getByRole('button', { name: '정지', exact: true }).click();
    expect(await waitDone(page, 10_000)).toBe('stopped');
    const stopMs = Number(await root.getAttribute('data-stop-ms'));
    expect(stopMs).toBeLessThan(STOP_GRACE_MS);
    console.log(`[lab-vision-package-wait] 받기를 기다리는 동안 [정지]: ${stopMs}ms`);
    test.info().annotations.push({ type: 'stop-ms while waiting for packages', description: String(stopMs) });
    await expect(page.locator('[data-lab-console]')).not.toContainText('파이썬을 다시 시작했어요');
    await expect(root).toHaveAttribute('data-vision-package-wait', 'no');
    // 파이썬을 다시 띄우지 않았으니 미리 받기는 그대로 — 실패 안내도 없다
    await expect(root).toHaveAttribute('data-vision-packages', 'loading');
    await expect(page.locator('[data-lab-console]')).not.toContainText('미리 받지 못했어요');

    releaseOpencv();
    await expect(root).toHaveAttribute('data-vision-packages', 'ready', { timeout: PACKAGES_TIMEOUT });
    // 다 받은 뒤 같은 예제가 기다림 없이 돈다(첫 에지 창이 뜬다)
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(root).toHaveAttribute('data-state', 'running');
    await expect(page.locator('canvas[data-vision-window="edges"]')).toBeVisible({ timeout: 60_000 });
    await expect(root).toHaveAttribute('data-vision-package-wait', 'no');
    await page.getByRole('button', { name: '정지', exact: true }).click();
    expect(await waitDone(page, 10_000)).toMatch(/^(stopped|ok)$/u);
    await expect(page.locator('[data-lab-console]')).not.toContainText('Loading');
  });
});
