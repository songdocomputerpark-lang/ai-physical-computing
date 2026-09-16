/**
 * 차시 페이지의 실습실 임베드(P2-14, SPEC §7.2 4번 "실습실 임베드 — 예제가 미리 로드된 상태").
 *
 * 확인하는 것
 *   1. [이 자리에서 실습실 열기]를 **누르기 전에는** 실습실 파일(실습실 스크립트·Pyodide)을 하나도 받지 않는다.
 *   2. 누르면 그 자리에 <iframe>이 생기고, 안의 실습실이 그 차시의 예제를 **미리 올린 채로** 열린다.
 *   3. 임베드 안에서는 머리글·바닥글이 숨고(?embed=1), 실습실 틀은 그대로 보인다.
 *   4. [실습실에서 열기]는 "(준비 중)" 없이 같은 예제로 실습실 페이지를 연다.
 *   5. 좁은 화면에서 가로로 넘치지 않는다.
 */
import { expect, test } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { LOAD_TIMEOUT } from './helpers/lab.ts';

const LESSON_PATH = withBase('learn/u1/v4/');
const EXAMPLE_FILE = 'vision/supplement/v4-blur-edge.py';

test.describe('차시 페이지의 실습실 임베드', () => {
  test('누르기 전에는 받지 않고, 누르면 예제가 올라간 실습실이 그 자리에 열린다', async ({ page }) => {
    test.setTimeout(4 * 60_000);
    const labRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (/cdn\.jsdelivr\.net/u.test(url) || /labs\/vision\//u.test(url)) {
        labRequests.push(url);
      }
    });

    const response = await page.goto(LESSON_PATH);
    expect(response?.status()).toBe(200);
    await page.waitForLoadState('networkidle');

    // 누르면 글자가 '실습실 접기'로 바뀌므로 이름이 아니라 표시로 찾는다.
    const openButton = page.locator('[data-lesson-lab-open]').first();
    await expect(openButton).toBeVisible();
    await expect(openButton).toHaveText('이 자리에서 실습실 열기');
    await expect(openButton).toHaveAttribute('aria-expanded', 'false');
    // "(준비 중)"이 붙은 링크는 더 없다.
    await expect(page.getByRole('link', { name: /실습실에서 열기$/u }).first()).toBeVisible();
    expect(await page.getByText('실습실은 아직 만들고 있어요.').count()).toBe(0);
    // 아직 iframe도, 실습실·Pyodide 요청도 없다.
    expect(await page.locator('iframe').count()).toBe(0);
    expect(labRequests, '누르기 전에는 실습실 파일을 받지 않는다').toEqual([]);

    await openButton.click();
    await expect(openButton).toHaveAttribute('aria-expanded', 'true');
    await expect(openButton).toHaveText('실습실 접기');

    const frame = page.frameLocator('iframe.lesson-example__frame');
    const labRoot = frame.locator('[data-lab]');
    await expect(labRoot).toBeVisible({ timeout: LOAD_TIMEOUT });
    // 그 차시의 예제가 미리 올라간다(파일 이름 → 예제 id).
    await expect(labRoot).toHaveAttribute('data-example', 'supplement-v4-blur-edge', { timeout: LOAD_TIMEOUT });
    await expect(frame.locator('[data-lab-editor] .cm-content')).toContainText('Canny', { timeout: LOAD_TIMEOUT });
    // 임베드 안에서는 머리글·바닥글이 숨는다.
    await expect(frame.locator('.site-header')).toBeHidden();
    await expect(frame.locator('.site-footer')).toBeHidden();
    // 조작 줄은 그대로 보인다.
    await expect(frame.getByRole('button', { name: '실행', exact: true })).toBeVisible();

    // 접으면 사라지고 다시 펼 수 있다(iframe은 남겨 두어 다시 받지 않는다).
    await openButton.click();
    await expect(openButton).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[data-lesson-lab-slot]').first()).toBeHidden();

    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    expect(overflow, '가로 넘침').toBe(0);
  });

  test('[실습실에서 열기]는 그 예제를 고른 채 실습실 페이지를 연다', async ({ page }) => {
    await page.goto(LESSON_PATH);
    const link = page.getByRole('link', { name: /실습실에서 열기$/u }).first();
    const href = await link.getAttribute('href');
    expect(href).toContain('labs/vision/');
    expect(decodeURIComponent(href ?? '')).toContain(EXAMPLE_FILE);
    expect(href).not.toContain('embed=1');
  });
});
