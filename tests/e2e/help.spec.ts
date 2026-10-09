// 문제 해결(/help/)과 오류 사전(/help/errors/)의 판 1.3.0 새 모양 — "무엇이 안 되나요?" 증상 타일, 오류 글 붙여 넣어 찾기(?q=).
// 기존 질문 목록·오류 사전 항목 단정은 pages.spec.ts에 있다. 주소는 baseURL 기준 상대 경로로 연다.
import { expect, test } from '@playwright/test';
import { getPage } from '../../src/config/nav.ts';

test.describe('문제 해결: 증상 타일과 오류 붙여 넣기 칸', () => {
  test('"무엇이 안 되나요?" 타일 여섯 개가 있고 각각 그 질문 자리나 오류 사전으로 간다', async ({ page }) => {
    await page.goto('./help/');
    const tiles = page.locator('[data-help-symptom] a.card__link');
    await expect(tiles).toHaveCount(6);
    const hrefs = await tiles.evaluateAll((links) => links.map((link) => link.getAttribute('href')));
    for (const target of ['#camera', '#camera-black', '#board-port', '#school-network', '#clear-data', getPage('help-errors').href]) {
      expect(hrefs, target).toContain(target);
    }
    // 모든 #링크가 가리키는 자리가 있다
    for (const href of hrefs.filter((value): value is string => value?.startsWith('#') === true)) {
      await expect(page.locator(`[id="${href.slice(1)}"]`), href).toHaveCount(1);
    }
  });

  test('타일은 카드 어디를 눌러도 그 질문으로 간다(보드가 안 잡혀요 → #board-port)', async ({ page }) => {
    await page.goto('./help/');
    await page.locator('[data-help-symptom]', { hasText: '연결할 포트가 보이지 않아요' }).locator('.card__icon').click({ force: true }); // 덮개 링크가 카드 위를 덮어 Playwright의 "눌릴 수 있나" 검사는 막으므로 force — 실제 마우스는 덮개를 눌러 이동한다
    await expect(page).toHaveURL(/#board-port$/u);
    await expect(page.locator('h2[id="board-port"]')).toBeInViewport();
  });

  test('오류 메시지를 넣고 [오류 풀이 찾기]를 누르면 오류 사전이 열려 그 항목만 남는다', async ({ page }) => {
    await page.goto('./help/');
    const form = page.getByRole('search', { name: '오류 사전에서 찾기' });
    await form.getByRole('searchbox', { name: '오류 메시지나 낱말' }).fill('NameError');
    await form.getByRole('button', { name: '오류 풀이 찾기' }).click();
    await expect(page).toHaveURL(/\/help\/errors\/\?q=NameError$/u);
    await expect(page.getByRole('searchbox', { name: /오류 이름이나 낱말로 찾기/u })).toHaveValue('NameError');
    await expect(page.locator('[data-errors-entry-item="name-error"]')).toBeVisible();
    const shown = await page.locator('[data-errors-entry-item]:not([hidden])').count();
    const total = await page.locator('[data-errors-entry-item]').count();
    expect(shown).toBeGreaterThanOrEqual(1);
    expect(shown).toBeLessThan(total);
  });

  test('오류 글을 통째로 붙여 넣어도 그 안의 오류 이름으로 찾아 준다', async ({ page }) => {
    const pasted = `Traceback (most recent call last): File "main.py", line 5, in <module> NameError: name 'total' is not defined`;
    await page.goto(`./help/errors/?q=${encodeURIComponent(pasted)}`);
    await expect(page.locator('[data-errors-entry-item="name-error"]')).toBeVisible();
    await expect(page.locator('[data-errors-find-count]')).toContainText('붙여 넣은 글의 오류 이름으로');
    // 이름 글자가 다른 풀이의 설명에 들어 있다고 같이 보이지 않는다 — 실습실 카드와 같은 규칙으로 맞는 항목만(R1-054)
    await expect(page.locator('[data-errors-entry-item]:not([hidden])')).toHaveCount(1);
  });

  test('모듈 오류를 붙여 넣으면 메시지가 맞는 풀이만 남고, 다른 모듈용 풀이는 숨는다(R1-054)', async ({ page }) => {
    const pasted = `Traceback (most recent call last): File "main.py", line 1, in <module> ModuleNotFoundError: No module named 'cv2'`;
    await page.goto(`./help/errors/?q=${encodeURIComponent(pasted)}`);
    await expect(page.locator('[data-errors-entry-item="module-not-found"]')).toBeVisible();
    await expect(page.locator('[data-errors-entry-item="module-not-found-site"]')).toBeHidden();
  });

  test('오류 이름을 한두 글자 틀리게 치면 가장 비슷한 이름의 풀이를 보여 준다(R1-054)', async ({ page }) => {
    await page.goto('./help/errors/');
    await page.getByRole('searchbox', { name: /오류 이름이나 낱말로 찾기/u }).fill('IndentationEror');
    await expect(page.locator('[data-errors-find-count]')).toContainText('IndentationError');
    await expect(page.locator('[data-errors-entry-item]:not([hidden])')).not.toHaveCount(0);
  });

  test('문제 해결: 증상 타일 글이 질문 제목과 같고, 긴 답은 먼저 해 볼 것 하나와 접힌 "그래도 안 되면"으로 나뉜다(R1-052)', async ({ page }) => {
    await page.goto('./help/');
    for (const id of ['camera', 'camera-black', 'board-port', 'school-network', 'clear-data']) {
      const title = await page.locator(`h2[id="${id}"]`).innerText();
      await expect(page.locator(`[data-help-symptom] a[href="#${id}"]`)).toHaveText(title);
    }
    await expect(page.locator('details[data-faq-toc-details]')).not.toHaveAttribute('open', '');
    const first = page.locator('section[aria-labelledby="camera-black"] [data-faq-first]');
    await expect(first).toContainText('먼저 해 볼 것');
    await expect(page.locator('section[aria-labelledby="camera-black"] details.faq-more-steps').first()).not.toHaveAttribute('open', '');
    // 운영자 말투와 번호로 가리키는 말이 남지 않는다(R1-055)
    await expect(page.getByRole('main')).not.toContainText('운영자 컴퓨터에서');
    await expect(page.getByRole('main')).not.toContainText('2번이나 4번');
  });

  test('오류 사전: ?q= 없이 열면 모두 보이고, "오류 메시지 읽는 법"은 접혀 있다', async ({ page }) => {
    await page.goto('./help/errors/');
    const total = await page.locator('[data-errors-entry-item]').count();
    await expect(page.locator('[data-errors-entry-item]:not([hidden])')).toHaveCount(total);
    const more = page.locator('[data-errors-how-more]');
    await expect(more).not.toHaveAttribute('open', '');
    await more.locator('summary').click();
    await expect(more).toHaveAttribute('open', '');
    await expect(more).toContainText('맨 아래 줄부터');
  });

  test('개인정보 안내(공용 컴퓨터 질문)에 본 차시와 "다 했어요" 표시가 어떻게 남는지 적혀 있다', async ({ page }) => {
    await page.goto('./help/');
    await expect(page.locator('section[aria-labelledby="clear-data"]')).toContainText('본 차시와 "다 했어요" 표시');
  });
});
