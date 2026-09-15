// 스모크 테스트(PLAN §8.1 P1-09): 공통 레이아웃의 핵심이 화면에 뜨는지 짧게 확인한다.
// 주소는 baseURL(http://localhost:포트/ai-physical-computing/) 기준 상대 경로('./credits/')로 연다.
// 앞에 /를 붙이면 base가 빠진 주소가 되니 쓰지 않는다. 사이트 지도의 href(base 포함)는 그대로 써도 된다.
import { expect, test } from '@playwright/test';
import { flattenPages, headerNav } from '../../src/config/nav.ts';
import { siteConfig } from '../../src/config/site.ts';
import { withBase } from '../../src/lib/url.ts';

test.describe('공통 레이아웃', () => {
  test('홈이 200으로 열리고 제목·언어·바닥글이 맞다', async ({ page }) => {
    const response = await page.goto('./');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(siteConfig.name);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ko');

    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText(`버전 ${siteConfig.version}`);
    await expect(footer).toContainText(`만든 사람: ${siteConfig.author}`);
    await expect(footer).toContainText(siteConfig.license.content.shortName);
    await expect(footer).toContainText(siteConfig.license.software.shortName);
    await expect(footer).toContainText(siteConfig.license.exclusion);
    await expect(footer.getByRole('link', { name: '출처와 라이선스', exact: true }).first()).toHaveAttribute(
      'href',
      withBase('credits/'),
    );
    await expect(footer.getByRole('link', { name: 'GitHub 저장소' })).toHaveAttribute('href', siteConfig.repositoryUrl);
    await expect(footer.getByRole('link', { name: '문제 알리기(GitHub Issues)' })).toHaveAttribute('href', siteConfig.issuesUrl);
  });

  test('첫 Tab은 본문 건너뛰기 링크이고, 누르면 본문으로 초점이 옮겨진다', async ({ page }) => {
    await page.goto('./credits/');
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: '본문으로 건너뛰기' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  test('출처와 라이선스 페이지가 공통 레이아웃과 현재 위치를 보여 준다', async ({ page }) => {
    const response = await page.goto('./credits/');
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(`출처와 라이선스 | ${siteConfig.name}`);
    await expect(page.getByRole('heading', { level: 1, name: '출처와 라이선스' })).toBeVisible();
    const breadcrumb = page.getByRole('navigation', { name: '현재 위치' });
    await expect(breadcrumb.getByRole('link', { name: '홈' })).toHaveAttribute('href', withBase(''));
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText('출처와 라이선스');
    await expect(page.locator('main[data-pagefind-body]')).toHaveCount(1);
  });

  test('사이트 지도의 모든 주소와 글꼴 파일이 200이다', async ({ request }) => {
    for (const navPage of flattenPages()) {
      const response = await request.get(navPage.href);
      expect(response.status(), navPage.href).toBe(200);
    }
    const fontCss = await request.get(withBase('fonts/pretendard/pretendardvariable-dynamic-subset.css'));
    expect(fontCss.status()).toBe(200);
    const fontChunk = await request.get(withBase('fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.0.woff2'));
    expect(fontChunk.status()).toBe(200);
  });

  test('없는 주소는 사이트 404 페이지를 보여 준다', async ({ page }) => {
    const response = await page.goto('./no-such-page/');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: '페이지를 찾을 수 없어요' })).toBeVisible();
  });

  test('화면보다 넓어져 가로 스크롤이 생기지 않는다', async ({ page }) => {
    for (const path of ['./', './credits/', './start/']) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});

test.describe('좁은 화면 메뉴', () => {
  test.skip(({ isMobile }) => !isMobile, '모바일 화면(375px)에서만 확인한다');

  test('메뉴 버튼으로 열고 닫고, Esc로 닫으면 초점이 버튼으로 돌아온다', async ({ page }) => {
    await page.goto('./');
    const button = page.getByRole('button', { name: '메뉴' });
    const nav = page.getByRole('navigation', { name: '주 메뉴' });

    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).toBeHidden();

    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(nav.getByRole('link', { name: headerNav[0].label, exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: '학생용' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
    await expect(nav).toBeHidden();

    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(nav).toBeVisible();
  });
});

test.describe('넓은 화면 메뉴', () => {
  test.skip(({ isMobile }) => isMobile, '데스크톱 화면(1366px)에서만 확인한다');

  test('주 메뉴가 버튼 없이 보이고 지금 페이지를 표시한다', async ({ page }) => {
    await page.goto('./glossary/');
    await expect(page.getByRole('button', { name: '메뉴' })).toBeHidden();
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    for (const item of headerNav) {
      await expect(nav.getByRole('link', { name: item.label, exact: true })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: '용어사전', exact: true })).toHaveAttribute('aria-current', 'page');
  });
});
