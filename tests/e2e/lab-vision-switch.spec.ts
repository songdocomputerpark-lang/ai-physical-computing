// 실행 중에 입력 소스 바꾸기(판 1.1.0, PROGRESS 미해결 200) 브라우저 테스트 — 실제 Pyodide + OpenCV, 가짜 카메라(playwright.config.ts).
//
// 전에는 실행 중에 입력 소스를 바꾸면 화면이 기다리던 cap.read()에 빈 답(None)을 줘서, `ok`를 확인하지 않는 코드(교과서 opmp 예제 등)는
// AttributeError·cv2.error로 멈췄다. 이제는 새 소스를 열 때까지 cap.read()를 붙들어 두었다가 새 소스의 장으로 답한다(src/lab/vision/vision-lab.ts).
// [입력 끄기]는 전처럼 빈 답(False, None)을 주고(카메라를 뽑은 것과 같다) 콘솔에 까닭을 한 줄 남긴다.
// 실행: PW_BASE_URL=http://localhost:5001/ai-physical-computing/ npx playwright test tests/e2e/lab-vision-switch.spec.ts --project=desktop
import { expect, test, type Page } from '@playwright/test';
import { labRoot, setEditorCode, waitDone } from './helpers/lab.ts';
import { FRAME_TIMEOUT, framesShown, openVisionLab, waitFrames } from './helpers/vision.ts';

/** `ok`를 확인하지 않고 받은 장을 바로 쓰는 코드(교과서 opmp 예제와 같은 모양) — 빈 답을 받으면 바로 오류가 난다 */
const NO_CHECK_CODE = [
  'import cv2',
  'cap = cv2.VideoCapture(0)',
  'count = 0',
  'while True:',
  '    frame = cap.read()[1]',
  '    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)',
  '    count += 1',
  '    if count % 20 == 0:',
  "        print('장', count, frame.shape)",
  "    cv2.imshow('gray', gray)",
  "    if cv2.waitKey(1) & 0xFF == ord('q'):",
  '        break',
  "print('끝', count)",
  '',
].join('\n');

/** 출력 창에 지금보다 n장 더 그려질 때까지 기다린다(코드가 멈추지 않고 이어서 돈다는 증거) */
async function expectMoreFrames(page: Page, windowName: string, more: number): Promise<void> {
  const start = await framesShown(page);
  await waitFrames(page, windowName, start + more);
}

async function consoleText(page: Page): Promise<string> {
  return (await page.locator('[data-lab-console]').textContent()) ?? '';
}

test.describe('실행 중에 입력 소스 바꾸기(미해결 200)', () => {
  test.skip(({ isMobile }) => isMobile, '워커·JSPI·카메라 동작은 데스크톱 Chromium에서 확인한다');
  test.describe.configure({ timeout: 300_000 });

  test('웹캠 → 샘플 → 웹캠으로 바꿔도 ok를 확인하지 않는 코드가 오류 없이 이어서 돌고, q로 끝난다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openVisionLab(page);
    await setEditorCode(page, NO_CHECK_CODE);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-vision-input-state', 'open', { timeout: FRAME_TIMEOUT });
    await waitFrames(page, 'gray', 5);
    await expect(page.locator('[data-vision-output-status]')).toContainText('gray 640×480');

    // 실행 중에 샘플로 바꾼다 → 코드는 멈추지 않고 샘플 장면을 받는다.
    await page.locator('[data-vision-source-select]').selectOption('sample');
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'sample');
    await expect(labRoot(page)).toHaveAttribute('data-vision-input-state', 'open');
    await expectMoreFrames(page, 'gray', 8);
    await expect(labRoot(page)).toHaveAttribute('data-state', 'running');
    await expect(page.locator('[data-vision-preview-canvas]')).toBeVisible();
    await expect(page.locator('[data-vision-input-status]')).toContainText('샘플 입력');

    // 다시 웹캠으로 → 이어서 돈다.
    await page.locator('[data-vision-source-select]').selectOption('webcam');
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'webcam');
    await expectMoreFrames(page, 'gray', 8);
    await expect(page.locator('[data-vision-preview] video')).toBeVisible();
    await expect(labRoot(page)).toHaveAttribute('data-state', 'running');

    await page.locator('[data-vision-key="113"]').click();
    expect(await waitDone(page, 20_000)).toBe('ok');
    const text = await consoleText(page);
    expect(text).toContain('끝');
    expect(text).not.toContain('Traceback');
    expect(text).not.toContain('AttributeError');
    expect(text).not.toContain('cv2.error');
    expect(errors).toEqual([]);
  });

  test('실행 중에 "내 그림 파일"을 고르면 그림을 고를 때까지 기다렸다가(코드는 쉰다) 그 그림으로 이어 가고, [정지]도 된다', async ({ page }) => {
    await openVisionLab(page);
    await setEditorCode(page, NO_CHECK_CODE);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await waitFrames(page, 'gray', 5);

    await page.locator('[data-vision-source-select]').selectOption('file');
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'file');
    await expect(labRoot(page)).toHaveAttribute('data-vision-hold-reads', 'yes');
    await expect(page.locator('[data-vision-input-message]')).toContainText('[그림 파일 고르기]로 그림을 고르면 그 그림으로 이어서 실행돼요');
    // 기다리는 동안에는 장이 늘지 않고, 코드는 오류 없이 실행 중이다.
    const paused = await framesShown(page);
    await page.waitForTimeout(1_500);
    expect(await framesShown(page)).toBeLessThanOrEqual(paused + 1);
    await expect(labRoot(page)).toHaveAttribute('data-state', 'running');

    // 그림 파일(코드로 그린 320×240 PNG — 사진 아님)을 고른다 → 그 그림으로 이어서 돈다.
    const png = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(100, 60, 120, 120);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), 'image/png'));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    await page.locator('[data-vision-file-input]').setInputFiles({ name: 'square.png', mimeType: 'image/png', buffer: Buffer.from(png) });
    await expect(labRoot(page)).toHaveAttribute('data-vision-hold-reads', 'no', { timeout: 15_000 });
    await expectMoreFrames(page, 'gray', 5);
    await expect(page.locator('[data-vision-output-status]')).toContainText('gray 320×240');
    await expect(page.locator('[data-vision-input-message]')).toContainText('고른 그림으로 이어서 실행해요');

    await page.getByRole('button', { name: '정지', exact: true }).click();
    expect(await waitDone(page, 10_000)).toBe('stopped');
    expect(await consoleText(page)).not.toContain('Traceback');
  });

  test('[입력 끄기]는 카메라를 뽑은 것처럼 cap.read()에 빈 답을 주고, 콘솔에 까닭을 남긴다(ok를 확인하는 첫 예제는 정상 종료)', async ({ page }) => {
    await openVisionLab(page);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await waitFrames(page, 'edges', 3);
    await page.getByRole('button', { name: '입력 끄기', exact: true }).click();
    expect(await waitDone(page, 20_000)).toBe('ok');
    await expect(labRoot(page)).toHaveAttribute('data-vision-input-state', 'closed');
    await expect(page.locator('[data-lab-console]')).toContainText('실행 중에 [입력 끄기]를 눌러서 cap.read()가 빈 답(False, None)을 받았어요');
  });
});
