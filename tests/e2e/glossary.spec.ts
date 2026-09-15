// 용어사전과 용어 툴팁(PLAN §8.1 P1-07·P1-09): 용어에 초점을 두면 풀이가 뜨고, Esc로 닫히며, 링크가 맞는 항목으로 간다.
// /glossary/ 안의 예시 문단(src/components/glossary/glossary-example.md)·항목 본문과, 샘플 차시 1-1-1 본문(P1-07 완료 기준)으로 시험한다.
// 주소는 baseURL 기준 상대 경로('./glossary/')로 연다(smoke.spec.ts 머리말 참고).
import fs from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { parse } from 'yaml';
import { withBase } from '../../src/lib/url.ts';

/** content/glossary/<id>.md의 한 줄 풀이(summary) */
function glossarySummary(id: string): string {
  const text = fs.readFileSync(`content/glossary/${id}.md`, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text);
  return String((parse(match?.[1] ?? '') as { summary?: string }).summary ?? '');
}

/** PLAN §8.1 P1-07 용어 20개의 항목 id(파일 이름) */
const PLAN_TERM_IDS = [
  'pixel',
  'frame',
  'bgr-rgb',
  'landmark',
  'normalized-coordinates',
  'library',
  'agent',
  'sensor',
  'actuator',
  'micropython',
  'esp32',
  'gpio',
  'pwm',
  'i2c',
  'uart',
  'ble',
  'firmware',
  'driver',
  'threshold',
  'edge',
];

function exampleBox(page: Page): Locator {
  return page.getByRole('note').filter({ hasText: '차시 글에서는 이렇게 보여요' });
}

async function tooltipOf(page: Page, term: Locator): Promise<Locator> {
  const id = await term.getAttribute('aria-describedby');
  expect(id, '용어 링크에 aria-describedby가 있어야 해요').toBeTruthy();
  return page.locator(`[id="${id}"]`);
}

async function pressTabUntilFocused(page: Page, target: Locator, maxPresses = 80): Promise<void> {
  for (let count = 0; count < maxPresses; count += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
  }
  throw new Error(`Tab 키를 ${maxPresses}번 눌러도 용어 링크에 초점이 가지 않았어요.`);
}

async function expectInsideViewport(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) {
    throw new Error('툴팁이나 화면 크기를 알 수 없어요.');
  }
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

test.describe('용어사전 페이지', () => {
  test('항목이 모두 있고, 표시 자리 태그가 남지 않으며, id가 겹치지 않고, 가로 스크롤이 없다', async ({ page }) => {
    const response = await page.goto('./glossary/');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: '용어사전' })).toBeVisible();
    for (const id of PLAN_TERM_IDS) {
      await expect(page.locator(`h3[id="${id}"]`), id).toHaveCount(1);
    }
    await expect(page.locator('glossary-term')).toHaveCount(0);
    const duplicateIds = await page.evaluate(() => {
      const seen = new Set<string>();
      const duplicates: string[] = [];
      for (const element of document.querySelectorAll('[id]')) {
        if (seen.has(element.id)) {
          duplicates.push(element.id);
        }
        seen.add(element.id);
      }
      return duplicates;
    });
    expect(duplicateIds).toEqual([]);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('가나다 묶음이 ABC 묶음보다 먼저 오고, 색인 링크를 누르면 그 묶음으로 간다', async ({ page }) => {
    await page.goto('./glossary/');
    const index = page.getByRole('navigation', { name: '가나다·ABC로 찾기' });
    const labels = await index
      .locator('a')
      .evaluateAll((links) => links.map((link) => link.firstChild?.textContent?.trim() ?? ''));
    expect(labels.length).toBeGreaterThanOrEqual(10);
    const firstLatin = labels.findIndex((label) => /^[A-Z]$/u.test(label));
    expect(firstLatin).toBeGreaterThan(0);
    expect(labels.slice(0, firstLatin).every((label) => /^[ㄱ-ㅎ]$/u.test(label))).toBe(true);

    await index.getByRole('link', { name: /^ㅍ/u }).click();
    await expect(page).toHaveURL(/#index-pieup$/u);
    await expect(page.locator('#index-pieup')).toBeInViewport();
  });
});

test.describe('용어 툴팁', () => {
  test('Tab 키로 용어에 초점을 두면 풀이가 뜨고, Esc로 닫히며, Enter로 그 항목에 간다', async ({ page }) => {
    await page.goto('./glossary/');
    const term = exampleBox(page).getByRole('link', { name: '픽셀', exact: true });
    await expect(term, '같은 글의 같은 낱말은 첫 번째만 링크').toHaveCount(1);
    await expect(term).toHaveAttribute('href', withBase('glossary/#pixel'));
    const tooltip = await tooltipOf(page, term);
    await expect(tooltip).toBeHidden();

    await pressTabUntilFocused(page, term);
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveAttribute('role', 'tooltip');
    await expect(tooltip).toContainText('디지털 사진을 이루는 가장 작은 네모 칸이에요.');
    await expect(term).toHaveAccessibleDescription(/디지털 사진을 이루는 가장 작은 네모 칸이에요/u);
    await expectInsideViewport(page, tooltip);

    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await expect(term).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/glossary\/#pixel$/u);
    await expect(page.locator('h3#pixel')).toBeInViewport();
  });

  test('항목 본문 속 용어도 다른 항목으로 이어지고, 툴팁이 화면 안에 뜨며 가로 스크롤을 만들지 않는다', async ({ page }) => {
    await page.goto('./glossary/');
    const body = page.locator('article[aria-labelledby="edge"] .glossary-entry__body');
    const term = body.getByRole('link', { name: '임계값', exact: true });
    await expect(term).toHaveAttribute('href', withBase('glossary/#threshold'));
    const tooltip = await tooltipOf(page, term);
    await term.focus();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('값을 둘로 나누는 기준이 되는 값이에요.');
    await expectInsideViewport(page, tooltip);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });

  test('마우스를 올리면 뜨고, 툴팁 위로 옮겨도 남아 있으며, Esc로 닫고 다시 올리면 또 뜬다', async ({ page, isMobile }) => {
    test.skip(isMobile, '마우스 동작은 데스크톱 화면에서 확인한다');
    await page.goto('./glossary/');
    const term = exampleBox(page).getByRole('link', { name: '프레임', exact: true });
    const tooltip = await tooltipOf(page, term);

    await term.hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('영상을 이루는 사진 한 장이에요.');

    const box = await tooltip.boundingBox();
    if (!box) {
      throw new Error('툴팁 크기를 알 수 없어요.');
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
    await page.waitForTimeout(500);
    await expect(tooltip, '툴팁 위에 마우스가 있으면 닫히지 않아요').toBeVisible();

    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();

    await page.mouse.move(2, 2);
    await term.hover();
    await expect(tooltip).toBeVisible();
    await page.mouse.move(2, 2);
    await expect(tooltip).toBeHidden();
  });

  test('샘플 차시 1-1-1 본문의 용어에 Tab으로 초점을 두면 풀이가 뜨고, Enter로 용어사전의 그 항목에 간다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    await expect(page.locator('glossary-term'), '표시 자리 태그가 남지 않아요').toHaveCount(0);
    const body = page.locator('.lesson-body');
    const term = body.getByRole('link', { name: '에이전트', exact: true });
    await expect(term, '같은 글의 같은 낱말은 첫 번째만 링크').toHaveCount(1);
    await expect(term).toHaveAttribute('href', withBase('glossary/#agent'));
    const tooltip = await tooltipOf(page, term);
    await expect(tooltip).toBeHidden();

    await pressTabUntilFocused(page, term, 150);
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText(glossarySummary('agent'));
    await expect(term).toHaveAccessibleDescription(new RegExp(glossarySummary('agent').slice(0, 20), 'u'));
    await expectInsideViewport(page, tooltip);

    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/glossary\/#agent$/u);
    await expect(page.locator('h3#agent')).toBeInViewport();
  });

  test('용어사전 항목의 "나오는 차시" 링크가 그 낱말을 쓴 차시 페이지로 간다', async ({ page }) => {
    await page.goto('./glossary/');
    const entry = page.locator('article[aria-labelledby="agent"]');
    const lessonLink = entry.getByRole('link', { name: /^1-1-1 /u });
    await expect(lessonLink).toHaveAttribute('href', withBase('learn/u1/1-1-1/'));
    await lessonLink.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/1-1-1/u);
  });

  test('터치 화면에서 용어를 누르면 바로 그 항목으로 간다', async ({ page, isMobile }) => {
    test.skip(!isMobile, '터치는 모바일 화면에서 확인한다');
    await page.goto('./glossary/');
    const term = exampleBox(page).getByRole('link', { name: '센서', exact: true });
    await term.tap();
    await expect(page).toHaveURL(/\/glossary\/#sensor$/u);
    await expect(page.locator('h3#sensor')).toBeInViewport();
  });
});
