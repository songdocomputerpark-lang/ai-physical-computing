// 영상처리 실습실 브라우저 테스트(PLAN §8.2 P2-03 완료 기준 "가짜 카메라로 출력 캔버스에 에지 영상이 그려진다"):
// /labs/vision/ 을 열어 Pyodide·numpy·OpenCV 준비 단계가 끝나고, 첫 예제(examples/vision/first-edge.py)를 [실행]하면
// 가짜 카메라(playwright.config.ts의 합성 영상 640×480)의 프레임이 파이썬으로 가서 cv2.Canny 결과가 출력 창에 그려진다
// (흰 에지 픽셀 비율 > 0). 출력 화면에서 q 키 → 정상 종료, [정지] → 1초 안에 멈춤, 카메라 거부 → 샘플 입력으로 자동 전환,
// 제한 모드(?limited=1)에서 한 장 읽기, 사이트 밖 요청은 jsDelivr뿐(SPEC §2 서버 제로 — 영상이 밖으로 나가지 않는다).
// 실행: npx playwright test tests/e2e/lab-vision.spec.ts — Pyodide(약 6MB)와 numpy·OpenCV 휠(약 14MB)을 jsDelivr에서 받는다.
import { expect, test, type Page } from '@playwright/test';
import { ALLOWED_REMOTE_ORIGINS, STOP_GRACE_MS } from '../../src/lab/runtime/config.ts';
import { withBase } from '../../src/lib/url.ts';
import { LOAD_TIMEOUT, labRoot, setEditorCode, waitDone } from './helpers/lab.ts';

const VISION_PATH = withBase('labs/vision/');
/** OpenCV 휠(10.7MB)까지 받는 시간 */
const PACKAGES_TIMEOUT = 150_000;
const FRAME_TIMEOUT = 60_000;

function collectRequests(page: Page): { origins: Set<string>; urls: string[] } {
  const origins = new Set<string>();
  const urls: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/^https?:/u.test(url)) {
      origins.add(new URL(url).origin);
      urls.push(url);
    }
  });
  return { origins, urls };
}

/** 실습실을 열고 파이썬·OpenCV가 준비될 때까지 기다린다. */
async function openVisionLab(page: Page, query = ''): Promise<void> {
  const response = await page.goto(`${VISION_PATH}${query}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
  await expect(labRoot(page)).toHaveAttribute('data-vision-packages', 'ready', { timeout: PACKAGES_TIMEOUT });
  await expect(page.locator('[data-vision-stages]')).toHaveAttribute('data-state', 'done');
}

/** 출력 창 캔버스에서 밝은(200 초과) 픽셀 비율을 잰다. */
async function whiteRatio(page: Page, windowName: string): Promise<number> {
  return page.locator(`canvas[data-vision-window="${windowName}"]`).evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0) {
      return -1;
    }
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let white = 0;
    for (let index = 0; index < data.length; index += 4) {
      if ((data[index] ?? 0) > 200) {
        white += 1;
      }
    }
    return white / (canvas.width * canvas.height);
  });
}

/** 출력 창에 장이 n장 이상 그려질 때까지 기다린다(출력 상태 글의 "n장"). */
async function waitFrames(page: Page, windowName: string, count: number): Promise<void> {
  await expect(page.locator(`canvas[data-vision-window="${windowName}"]`)).toBeVisible({ timeout: FRAME_TIMEOUT });
  await expect
    .poll(async () => {
      const text = (await page.locator('[data-vision-output-status]').textContent()) ?? '';
      const match = /(\d+)장/u.exec(text);
      return match ? Number(match[1]) : 0;
    }, { timeout: FRAME_TIMEOUT })
    .toBeGreaterThanOrEqual(count);
}

test.describe('영상처리 실습실(가짜 카메라)', () => {
  test.skip(({ isMobile }) => isMobile, '워커·JSPI·카메라 동작은 데스크톱 Chromium에서 확인한다');
  test.describe.configure({ timeout: 300_000 });

  test('첫 실습: 준비 단계가 끝나고 [실행]하면 웹캠 프레임의 에지 영상이 출력 창에 그려지며, q 키로 끝나고, 영상은 사이트 밖으로 나가지 않는다', async ({ page }) => {
    const requests = collectRequests(page);
    const leaked: string[] = [];
    page.on('pageerror', (error) => leaked.push(error.message));
    await openVisionLab(page);
    await expect(page.locator('[data-browser-notice]')).toHaveCount(1);
    await expect(labRoot(page)).toHaveAttribute('data-jspi', 'yes');
    await expect(labRoot(page)).toHaveAttribute('data-example', 'first-edge');
    await expect(page.locator('[data-lab-editor] .cm-content')).toContainText('cv2.Canny');
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'webcam');

    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-vision-input-state', 'open', { timeout: FRAME_TIMEOUT });
    await waitFrames(page, 'edges', 5);

    // 가짜 카메라의 합성 영상은 640×480이고, 파이썬이 받는 크기·출력 창 크기가 같다.
    await expect(page.locator('[data-vision-input-status]')).toContainText('640×480');
    await expect(page.locator('[data-vision-input-status]')).toContainText('fps');
    await expect(page.locator('[data-vision-output-status]')).toContainText('edges 640×480');
    const ratio = await whiteRatio(page, 'edges');
    console.log(`[lab-vision] edges 창의 흰 에지 픽셀 비율 ${(ratio * 100).toFixed(2)}%`);
    test.info().annotations.push({ type: 'edge-ratio', description: ratio.toFixed(4) });
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(0.5);
    // 입력 미리 보기는 웹캠 <video>, 출력 상태에 fps가 적힌다.
    await expect(page.locator('[data-vision-preview] video')).toBeVisible();

    // 출력 화면에 초점을 두고 q 키 → cv2.waitKey가 ord('q')를 받아 반복이 끝난다(정상 종료).
    await page.locator('[data-vision-output-stage]').focus();
    await page.keyboard.press('q');
    expect(await waitDone(page, 20_000)).toBe('ok');
    await expect(page.locator('[data-lab-result]')).toHaveText('실행이 끝났어요.');
    // 창은 결과 확인용으로 남고, 입력(카메라)도 켜진 채 남는다.
    await expect(page.locator('canvas[data-vision-window="edges"]')).toBeVisible();
    await expect(labRoot(page)).toHaveAttribute('data-vision-input-state', 'open');
    expect(leaked).toEqual([]);

    // 사이트 밖으로 간 요청은 jsDelivr(Pyodide·휠)뿐이다.
    const pageOrigin = new URL(page.url()).origin;
    for (const origin of requests.origins) {
      expect([pageOrigin, ...ALLOWED_REMOTE_ORIGINS], origin).toContain(origin);
    }
    expect(requests.urls.some((url) => url.includes('opencv_python-4.11.0.86'))).toBe(true);
  });

  test('[정지]: 카메라 프레임을 기다리는 반복문이 1초 안에 멈추고, 화면 키 버튼으로도 끝낼 수 있다', async ({ page }) => {
    await openVisionLab(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await waitFrames(page, 'edges', 3);
    await page.getByRole('button', { name: '정지', exact: true }).click();
    expect(await waitDone(page, STOP_GRACE_MS + 5_000)).toBe('stopped');
    const stopMs = Number(await labRoot(page).getAttribute('data-stop-ms'));
    expect(stopMs).toBeLessThan(STOP_GRACE_MS);
    console.log(`[lab-vision] 카메라 대기 중 정지: ${stopMs}ms`);

    await page.getByRole('button', { name: '실행', exact: true }).click();
    await waitFrames(page, 'edges', 2);
    await page.locator('[data-vision-key="113"]').click();
    expect(await waitDone(page, 20_000)).toBe('ok');
  });

  test('카메라를 거부하면 한국어 이유를 알리고 샘플 입력으로 바꿔 실습이 이어진다', async ({ page }) => {
    await page.addInitScript(() => {
      const mediaDevices = navigator.mediaDevices;
      if (mediaDevices) {
        mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      }
    });
    await openVisionLab(page);
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'webcam');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(page.locator('[data-lab-console]')).toContainText('카메라 사용을 허용하지 않았어요', { timeout: FRAME_TIMEOUT });
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'sample');
    await expect(page.locator('[data-vision-source-select]')).toHaveValue('sample');
    await waitFrames(page, 'edges', 3);
    await expect(page.locator('[data-vision-input-status]')).toContainText('샘플 입력');
    await expect(page.locator('[data-vision-preview-canvas]')).toBeVisible();
    expect(await whiteRatio(page, 'edges')).toBeGreaterThan(0);
    await page.getByRole('button', { name: '정지', exact: true }).click();
    expect(await waitDone(page, STOP_GRACE_MS + 5_000)).toBe('stopped');
  });

  test('제한 모드(?limited=1): 샘플 입력을 켜 두면 cap.read()가 한 장을 받아 한 번 실행되는 코드가 돈다', async ({ page }) => {
    await openVisionLab(page, '?limited=1');
    await expect(labRoot(page)).toHaveAttribute('data-limited', 'yes');
    await page.locator('[data-vision-source-select]').selectOption('sample');
    await page.getByRole('button', { name: '입력 켜기', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-vision-input-state', 'open');
    await setEditorCode(
      page,
      [
        'import cv2',
        'cap = cv2.VideoCapture(0)',
        'ok, frame = cap.read()',
        "print('읽음', ok, frame.shape)",
        'gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)',
        "cv2.imshow('one', cv2.Canny(gray, 100, 200))",
        '',
      ].join('\n'),
    );
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, FRAME_TIMEOUT)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).toContainText('읽음 True (480, 640, 3)');
    await expect(page.locator('canvas[data-vision-window="one"]')).toBeVisible();
    expect(await whiteRatio(page, 'one')).toBeGreaterThan(0);
  });
});

test.describe('좁은 화면', () => {
  test.skip(({ isMobile }) => !isMobile, '모바일 화면(375px)에서만 확인한다');

  test('영상처리 실습실이 화면보다 넓어지지 않고 입력 칸 아래에 출력 칸이 온다', async ({ page }) => {
    const response = await page.goto(VISION_PATH);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('영상처리 실습실');
    await expect(page.locator('[data-lab-editor] .cm-editor')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const tops = await page.evaluate(() =>
      ['.vision-io__input', '.vision-io__output'].map((selector) => document.querySelector(selector)?.getBoundingClientRect().top ?? -1),
    );
    expect(tops[0]).toBeLessThan(tops[1]);
  });
});
