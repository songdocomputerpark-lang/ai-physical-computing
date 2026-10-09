// 검색칸 자동 완성과 검색 쪽 종류 거르기 확인(판 1.3.0 구역 B). 색인은 빌드 뒤 Pagefind가 만든다(개발 서버에서는 이전 빌드의 dist/pagefind를 대신 쓴다 — helpers/search-index.ts).
//
// 약속(설계서 B절)
// - 쪽을 열 때(홈·차시·문제 해결 …)는 pagefind 요청이 0이다. 검색칸에 초점을 주거나 입력할 때만 받는다.
// - 머리글·홈 큰 검색칸은 ARIA combobox다: aria-expanded·aria-controls·aria-activedescendant, 목록은 listbox/option.
// - ↑↓로 고르고 Enter는 그 쪽으로, 고르지 않은 Enter는 /search/?q= 로 간다. Esc는 닫기(한 번 더 누르면 비우기).
// - 빈 칸에 초점을 주면 "많이 찾는 낱말" 칩, 결과가 없으면 "찾지 못했어요" + 추천 칩.
// - 검색 쪽: 결과 위 종류 칩(라디오 모임)이 쪽 종류로 거르고 주소에 &type=이 붙는다.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { searchConfig } from '../../src/config/search.ts';
import { ensureSearchIndex } from './helpers/search-index.ts';

const SEVERE = new Set(['critical', 'serious']);
/** 첫 검색은 Pagefind(약 110KB)와 색인 조각을 받아야 해서 느린 컴퓨터·개발 서버에서는 몇 초 걸린다 */
const FIRST_RESULTS = { timeout: 20_000 };

const headerForm = (page: Page) => page.getByRole('search', { name: '사이트 검색', exact: true });
const headerBox = (page: Page) => headerForm(page).getByRole('combobox', { name: '사이트 검색어' });
const searchRoot = (page: Page) => page.locator('[data-search-root]');
const typeGroup = (page: Page) => page.getByRole('radiogroup', { name: '결과 종류' });
const resultItems = (page: Page) => page.locator('[data-search-results] > li');

/** 스크립트가 combobox 역할을 붙일 때까지 기다린 뒤, 머리글 검색칸이 안 보이면(좁은 화면에서 메뉴 안에 있다면) 메뉴를 연다 */
async function prepareHeaderBox(page: Page): Promise<Locator> {
  await page.locator('#header-search-input[role="combobox"]').waitFor({ state: 'attached' });
  const box = headerBox(page);
  if (!(await box.isVisible())) {
    await page.getByRole('button', { name: '메뉴' }).click();
  }
  await expect(box).toBeVisible();
  return box;
}

/** 입력칸이 가리키는 목록(aria-controls) */
async function listboxOf(box: Locator): Promise<Locator> {
  const id = await box.getAttribute('aria-controls');
  expect(id, 'aria-controls').toBeTruthy();
  return box.page().locator(`[id="${id}"]`);
}

/** 결과 목록이 다 그려질 때까지(마지막 줄 "전체 검색 결과 보기"가 나올 때까지) 기다린다 — 그 전에는 "찾는 중이에요…"나 묵은 목록이다 */
async function waitForResults(box: Locator): Promise<Locator> {
  const listbox = await listboxOf(box);
  await expect(listbox.getByRole('option').last()).toContainText('전체 검색 결과 보기', FIRST_RESULTS);
  return listbox;
}

test.describe('자동 완성: 쪽을 열 때는 검색 도구를 받지 않는다', () => {
  for (const path of ['./', './learn/u1/1-1-1/', './help/', './labs/']) {
    test(`${path} — 열고 가만히 있으면 pagefind 요청 0, 초점을 주면 그때 받는다`, async ({ page }) => {
      await ensureSearchIndex(page);
      const requests: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/pagefind/')) {
          requests.push(request.url());
        }
      });
      await page.goto(path);
      await page.waitForLoadState('load');
      await page.locator('#header-search-input[role="combobox"]').waitFor({ state: 'attached' });
      await page.waitForTimeout(800);
      expect(requests, '쪽을 열기만 했는데 검색 도구를 받았어요').toEqual([]);

      const box = await prepareHeaderBox(page);
      await box.focus();
      await expect.poll(() => requests.some((url) => url.endsWith('/pagefind.js'))).toBe(true);
    });
  }
});

test.describe('머리글 자동 완성', () => {
  test('combobox 약속: 처음엔 닫혀 있고, 입력하면 listbox가 열리며 결과 + 전체 검색 줄이 나온다', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./help/');
    const box = await prepareHeaderBox(page);
    await expect(box).toHaveAttribute('aria-expanded', 'false');
    await expect(box).toHaveAttribute('aria-autocomplete', 'list');
    await expect(box).toHaveAttribute('aria-haspopup', 'listbox');
    const listbox = await listboxOf(box);
    await expect(listbox).toHaveAttribute('role', 'listbox');

    await box.fill('서보');
    await expect(box).toHaveAttribute('aria-expanded', 'true');
    const options = listbox.getByRole('option');
    await waitForResults(box);
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(7); // 결과 6 + 전체 검색 줄
    await expect(options.last()).toContainText('‘서보’ 전체 검색 결과 보기');
    // 항목은 Tab 정지점이 아니다
    expect(await options.evaluateAll((items) => items.every((item) => (item as HTMLElement).tabIndex === -1))).toBe(true);
    // 결과 주소는 사이트 안의 실제 주소다
    const hrefs = await options.evaluateAll((items) => items.map((item) => item.getAttribute('href') ?? ''));
    for (const href of hrefs) {
      expect(href.startsWith(searchConfig.baseUrl), href).toBe(true);
    }
  });

  test('↓로 고르면 aria-activedescendant가 따라가고, 고른 뒤 Enter는 그 쪽으로 간다', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./help/');
    const box = await prepareHeaderBox(page);
    await box.fill('서보');
    const listbox = await waitForResults(box);
    const options = listbox.getByRole('option');

    await box.press('ArrowDown');
    const firstId = await options.first().getAttribute('id');
    await expect(box).toHaveAttribute('aria-activedescendant', firstId ?? '');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await expect(box).toBeFocused();
    await box.press('ArrowDown');
    await expect(options.first()).toHaveAttribute('aria-selected', 'false');
    await box.press('ArrowUp');
    await expect(box).toHaveAttribute('aria-activedescendant', firstId ?? '');

    const href = await options.first().getAttribute('href');
    await box.press('Enter');
    await expect.poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).hash}`).toBe(href);
  });

  test('고르지 않은 Enter는 폼 제출이다: /search/?q=서보 로 가서 결과를 보여 준다', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./help/');
    const box = await prepareHeaderBox(page);
    await box.fill('서보');
    await waitForResults(box);
    await box.press('Enter');
    await expect(page.getByRole('heading', { level: 1, name: '사이트 검색' })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get(searchConfig.queryParam)).toBe('서보');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
  });

  test('Esc는 목록을 닫고, 한 번 더 누르면 입력을 비운다. 바깥을 누르면 닫힌다', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./help/');
    const box = await prepareHeaderBox(page);
    await box.fill('서보');
    await expect(box).toHaveAttribute('aria-expanded', 'true');
    await box.press('Escape');
    await expect(box).toHaveAttribute('aria-expanded', 'false');
    await expect(box).toHaveValue('서보');
    await box.press('Escape');
    await expect(box).toHaveValue('');

    await box.fill('서보');
    await expect(box).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('main').click({ position: { x: 5, y: 5 }, force: true });
    await expect(box).toHaveAttribute('aria-expanded', 'false');
  });

  test('빈 칸에 초점을 주면 "많이 찾는 낱말" 칩이 뜨고, 칩은 /search/?q= 로 간다', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./help/');
    const box = await prepareHeaderBox(page);
    await box.focus();
    const listbox = await listboxOf(box);
    const options = listbox.getByRole('option');
    await expect(options).toHaveCount(searchConfig.popularWords.length);
    await expect(options).toHaveText([...searchConfig.popularWords]);
    await expect(listbox.getByRole('group', { name: '많이 찾는 낱말' })).toBeVisible();
    const first = options.first();
    await expect(first).toHaveAttribute('href', new RegExp(`/search/\\?q=`, 'u'));
    await first.click();
    await expect.poll(() => new URL(page.url()).searchParams.get(searchConfig.queryParam)).toBe(searchConfig.popularWords[0]);
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
  });

  test('맞는 글이 없으면 "찾지 못했어요" 와 추천 칩을 보인다(전체 검색 줄은 그대로)', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./help/');
    const box = await prepareHeaderBox(page);
    await box.fill('뷁쿍퓽');
    const listbox = await listboxOf(box);
    await expect(listbox.getByRole('group', { name: /찾지 못했어요/u })).toBeVisible(FIRST_RESULTS);
    const options = listbox.getByRole('option');
    await expect(options.first()).toHaveText(searchConfig.popularWords[0]);
    await expect(options.last()).toContainText('‘뷁쿍퓽’ 전체 검색 결과 보기');
  });

  test('낭독 줄(aria-live)은 결과가 그려진 뒤에만 한 번 바뀐다', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./help/');
    const box = await prepareHeaderBox(page);
    const live = headerForm(page).locator('[aria-live="polite"]');
    await expect(live).toHaveText('');
    await box.fill('서보');
    await expect(live).toContainText('추천', FIRST_RESULTS);
    await expect(live).toContainText('위아래 화살표');
  });

  test('목록이 떠 있는 머리글·쪽에 axe 심각한 위반이 없다', async ({ page }) => {
    test.setTimeout(120_000);
    await ensureSearchIndex(page);
    await page.goto('./help/');
    const box = await prepareHeaderBox(page);
    await box.fill('서보');
    await waitForResults(box);
    await box.press('ArrowDown');
    const results = await new AxeBuilder({ page }).exclude('astro-dev-toolbar').analyze();
    const severe = results.violations.filter((violation) => SEVERE.has(violation.impact ?? ''));
    expect(severe.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
  });

  test('목록은 화면 밖으로 나가지 않고 가로 넘침을 만들지 않는다', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./help/');
    const box = await prepareHeaderBox(page);
    await box.fill('서보');
    const listbox = await waitForResults(box);
    const panel = listbox.locator('xpath=..');
    const rect = await panel.evaluate((element) => {
      const { left, right } = element.getBoundingClientRect();
      return { left, right, viewport: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth };
    });
    expect(rect.left).toBeGreaterThanOrEqual(-0.5);
    expect(rect.right).toBeLessThanOrEqual(rect.viewport + 0.5);
    expect(rect.scroll).toBeLessThanOrEqual(rect.viewport);
  });
});

test.describe('홈 큰 검색칸', () => {
  test('"배울 것 찾기" 폼에도 같은 자동 완성이 켜지고, 아래 추천 칩은 /search/?q= 링크다', async ({ page, isMobile }) => {
    test.setTimeout(60_000);
    await ensureSearchIndex(page);
    await page.goto('./');
    const form = page.getByRole('search', { name: '배울 것 찾기', exact: true });
    await expect(form).toBeVisible();
    const box = form.getByRole('combobox', { name: '찾을 낱말' });
    await expect(box).toBeVisible();
    await box.fill('서보');
    await expect(box).toHaveAttribute('aria-expanded', 'true');
    const listbox = await waitForResults(box);
    await expect(listbox.getByRole('option').last()).toContainText('‘서보’ 전체 검색 결과 보기');

    // 추천 칩: 좁은 화면은 앞의 넷만 보인다
    const chips = page.locator('[data-home-search]').locator('xpath=..').getByRole('link');
    const visible = await chips.evaluateAll((links) => links.filter((link) => (link as HTMLElement).offsetParent !== null).length);
    expect(visible).toBe(isMobile ? 4 : searchConfig.popularWords.length);
    await expect(chips.first()).toHaveAttribute('href', new RegExp(`/search/\\?q=${encodeURIComponent(searchConfig.popularWords[0]).replace(/%/gu, '%')}`, 'u'));
  });

  test('홈에서 Enter로 보내면 /search/?q= 로 가서 결과를 보여 준다', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./');
    const form = page.getByRole('search', { name: '배울 것 찾기', exact: true });
    const box = form.getByRole('combobox', { name: '찾을 낱말' });
    await box.fill('카메라');
    await box.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get(searchConfig.queryParam)).toBe('카메라');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
  });
});

test.describe('많이 찾는 낱말은 모두 실제 결과가 있다', () => {
  test.skip(({ isMobile }) => isMobile, '색인 내용은 화면 크기와 상관없어 데스크톱에서 한 번만 확인한다');

  test('추천 칩 낱말마다 검색 결과가 1개 이상이다', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./');
    const counts = await page.evaluate(
      async ({ bundlePath, baseUrl, words }) => {
        const pagefind = await import(/* @vite-ignore */ `${bundlePath}pagefind.js`);
        await pagefind.options({ baseUrl });
        const found: Record<string, number> = {};
        for (const word of words) {
          found[word] = (await pagefind.search(word)).results.length;
        }
        return found;
      },
      { bundlePath: searchConfig.bundlePath, baseUrl: searchConfig.baseUrl, words: [...searchConfig.popularWords] },
    );
    for (const word of searchConfig.popularWords) {
      expect(counts[word], `"${word}"로 찾은 결과 수`).toBeGreaterThan(0);
    }
  });
});

test.describe('검색 쪽 종류 거르기', () => {
  test.skip(({ isMobile }) => isMobile, '화면 조작은 데스크톱에서 확인한다(휴대폰은 axe·넘침만 아래에서 본다)');

  test('결과가 나오면 종류 칩이 보이고(라디오 모임), 처음엔 "전체"가 골라져 있다', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./search/');
    await expect(typeGroup(page)).toBeHidden();
    await page.goto('./search/?q=카메라');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    const radios = typeGroup(page).getByRole('radio');
    await expect(radios).toHaveText(['전체', '차시', '실습실', '용어사전', '오류', '예제', '교사용']);
    await expect(typeGroup(page).getByRole('radio', { name: '전체' })).toBeChecked();
  });

  test('"용어사전"을 고르면 용어사전 결과만 남고 주소에 &type=이 붙는다. "전체"로 돌아오면 사라진다', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./search/?q=픽셀');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    const all = await resultItems(page).count();
    await typeGroup(page).getByRole('radio', { name: '용어사전' }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('type')).toBe('glossary');
    await expect(typeGroup(page).getByRole('radio', { name: '용어사전' })).toBeChecked();
    await expect(resultItems(page).first()).toBeVisible();
    const kinds = await resultItems(page).evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.kind));
    expect(kinds.length).toBeGreaterThan(0);
    expect(new Set(kinds)).toEqual(new Set(['glossary']));
    await expect(page.getByRole('status')).toContainText("'용어사전'");
    expect(kinds.length).toBeLessThanOrEqual(all);

    await typeGroup(page).getByRole('radio', { name: '전체' }).click();
    await expect.poll(() => new URL(page.url()).searchParams.has('type')).toBe(false);
    await expect.poll(() => resultItems(page).count()).toBe(all);
  });

  test('주소의 &type=을 읽어 처음부터 그 종류로 보여 준다', async ({ page }) => {
    test.setTimeout(60_000);
    await ensureSearchIndex(page);
    await page.goto('./search/?q=픽셀&type=glossary');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    await expect(typeGroup(page).getByRole('radio', { name: '용어사전' })).toBeChecked();
    const kinds = await resultItems(page).evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.kind));
    expect(new Set(kinds)).toEqual(new Set(['glossary']));
    // 모르는 종류는 전체로
    await page.goto('./search/?q=픽셀&type=nope');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    await expect(typeGroup(page).getByRole('radio', { name: '전체' })).toBeChecked();
  });

  test('맞는 종류가 없으면 그렇다고 알리고 다른 종류를 눌러 보라고 한다', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./search/?q=라이선스&type=error');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    await expect(page.getByRole('status')).toContainText("'오류'에 맞는 글은 없어요");
    await expect(resultItems(page)).toHaveCount(0);
  });

  test('종류 칩은 Tab 정지점이 하나이고 화살표로 옮기면 바로 골라진다', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./search/?q=카메라');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    const radios = typeGroup(page).getByRole('radio');
    const tabStops = await radios.evaluateAll((items) => items.filter((item) => (item as HTMLElement).tabIndex === 0).length);
    expect(tabStops).toBe(1);

    await radios.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(typeGroup(page).getByRole('radio', { name: '차시' })).toBeChecked();
    await expect(typeGroup(page).getByRole('radio', { name: '차시' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(typeGroup(page).getByRole('radio', { name: '교사용' })).toBeChecked();
    await page.keyboard.press('ArrowRight');
    await expect(typeGroup(page).getByRole('radio', { name: '전체' })).toBeChecked();
  });

  test('결과 카드: 종류 아이콘·이름이 있고 카드 어디를 눌러도 그 쪽으로 간다', async ({ page }) => {
    await ensureSearchIndex(page);
    await page.goto('./search/?q=픽셀&type=glossary');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    const card = resultItems(page).first();
    await expect(card).toHaveClass(/card--link/u);
    await expect(card.locator('.search-result__icon svg[aria-hidden="true"]')).toHaveCount(1);
    await expect(card.locator('.search-result__kind')).toHaveText('용어사전');
    const href = await card.locator('h3 a').getAttribute('href');
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) - 12, (box?.y ?? 0) + (box?.height ?? 0) / 2);
    await expect.poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).hash}`).toBe(href);
  });
});

test.describe('검색 쪽 접근성·넘침', () => {
  test('결과가 나온 검색 쪽에 axe 심각한 위반이 없고 가로 넘침이 없다', async ({ page }) => {
    test.setTimeout(120_000);
    await ensureSearchIndex(page);
    await page.goto('./search/?q=카메라');
    await expect(searchRoot(page)).toHaveAttribute('data-state', 'results', { timeout: 15_000 });
    const results = await new AxeBuilder({ page }).exclude('astro-dev-toolbar').analyze();
    const severe = results.violations.filter((violation) => SEVERE.has(violation.impact ?? ''));
    expect(severe.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('처음 화면과 결과 없음 화면에도 axe 심각한 위반이 없다', async ({ page }) => {
    test.setTimeout(150_000);
    await ensureSearchIndex(page);
    for (const address of ['./search/', './search/?q=뷁쿍퓽']) {
      await page.goto(address);
      if (address.includes('q=')) {
        await expect(searchRoot(page)).toHaveAttribute('data-state', 'empty', { timeout: 15_000 });
      }
      const results = await new AxeBuilder({ page }).exclude('astro-dev-toolbar').analyze();
      const severe = results.violations.filter((violation) => SEVERE.has(violation.impact ?? ''));
      expect(severe.map((violation) => `${address} ${violation.id}`)).toEqual([]);
    }
  });
});
