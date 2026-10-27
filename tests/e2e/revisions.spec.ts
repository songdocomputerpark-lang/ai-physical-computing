// 판 1.8.0(DECISIONS C234): 원본(교과서·교안)과 달라진 곳을 고친 날과 함께 보인다 — 차시 위 상자·실습실 예제 설명 아래 줄·교과서 원문 쪽 안내 상자.
// 파이썬 엔진(Pyodide)을 띄우지 않고 쪽의 글만 본다(실습실은 예제를 고르기만 한다).
import { expect, test } from '@playwright/test';
import { PC_VERSIONS_CHECKED, koreanDate } from '../../src/config/pc-versions.ts';

test.describe('교과서와 다른 곳 — 고친 날', () => {
  test('최신 판으로 다시 쓴 예제를 싣는 차시(1-1-2)는 머리 끝에 고친 날·판·요약과 판 번호를 다시 확인한 날을 보인다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-2/');
    const box = page.locator('[data-lesson-revisions]');
    await expect(box).toBeVisible();
    await expect(box).toContainText('교과서와 다른 곳');
    await expect(box.locator('time[datetime="2026-10-26"]')).toHaveText('2026년 10월 26일');
    await expect(box).toContainText('사이트 판 1.8.0');
    // 요약 속 `…`은 코드 모양으로
    await expect(box.locator('li code').first()).toBeVisible();
    await expect(box.locator(`time[datetime="${PC_VERSIONS_CHECKED}"]`)).toHaveText(koreanDate(PC_VERSIONS_CHECKED));
    const link = box.getByRole('link', { name: '지금 판 번호 보기' });
    await link.click();
    await expect(page).toHaveURL(/\/teacher\/real-pc\/#/u);
    await expect(page.getByRole('heading', { name: '판 번호 한눈에 보기' })).toBeVisible();
  });

  test('교과서 그대로인 차시(1-1-1)에는 상자가 없다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('[data-lesson-revisions]')).toHaveCount(0);
  });

  test('실습실: 다시 쓴 예제를 고르면 설명 아래에 "원본 코드와 달라요 — 고친 날"이, 그대로인 예제에는 아무것도 없다', async ({ page }) => {
    await page.goto('./labs/vision/?example=vision/u1/1-1-2-hands-first.py');
    const revised = page.locator('[data-lab-example-revised]');
    await expect(revised).toBeVisible();
    await expect(revised).toContainText('원본 코드와 달라요 — 2026년 10월 26일 고침(사이트 판 1.8.0)');
    await expect(revised).toContainText('mediapipe 1.1.1');

    await page.goto('./labs/vision/?example=vision/first-edge.py');
    await expect(page.locator('[data-lab-example-description]')).toBeVisible();
    await expect(page.locator('[data-lab-example-revised]')).toBeHidden();
  });

  test('교안(opmp)에서 온 예제는 "교과서"가 아니라 "수업 교안 코드"라고 적는다', async ({ page }) => {
    await page.goto('./labs/vision/?example=vision/opmp/09-folded-fingers.py');
    const revised = page.locator('[data-lab-example-revised]');
    await expect(revised).toContainText('수업 교안 코드는');
    await expect(revised).not.toContainText('교과서');
  });

  test('교과서 원문 쪽(1-1-2)의 안내 상자 제목에 고친 날이 있다', async ({ page }) => {
    await page.goto('./book/1-1-2/');
    await expect(page.getByText('이 사이트에서는 최신 MediaPipe(1.1.1)로 — 2026년 10월 26일 고침').first()).toBeVisible();
  });
});
