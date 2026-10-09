// 스모크 테스트(PLAN §8.1 P1-09): 공통 레이아웃의 핵심이 화면에 뜨는지 짧게 확인한다.
// 주소는 baseURL(http://localhost:포트/ai-physical-computing/) 기준 상대 경로('./credits/')로 연다.
// 앞에 /를 붙이면 base가 빠진 주소가 되니 쓰지 않는다. 사이트 지도의 href(base 포함)는 그대로 써도 된다.
import { expect, test } from '@playwright/test';
import { flattenPages, getPage, headerNav } from '../../src/config/nav.ts';
import { siteConfig } from '../../src/config/site.ts';
import { footerColumns } from '../../src/layouts/partials/footer-columns.ts';
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

// ── 판 1.3.0 공통 틀(구역 A): 머리글 검색·아이콘 메뉴·바닥글 다섯 묶음·404 주 경로 카드 ──

test.describe('머리글 — 어느 화면에서나 검색 상자가 보인다', () => {
  test('검색 상자는 메뉴 상자 밖에 있고, 메뉴를 열지 않아도 화면에 보인다', async ({ page, isMobile }) => {
    await page.goto('./');
    const search = page.getByRole('search', { name: '사이트 검색', exact: true });
    await expect(search).toBeVisible();
    await expect(search).toBeInViewport({ ratio: 1 });
    // 입력칸의 역할은 검색 자동 완성이 켜지면 searchbox에서 combobox로 바뀔 수 있어 id와 이름(label)으로 본다.
    await expect(search.locator('#header-search-input')).toBeVisible();
    await expect(search.getByLabel('사이트 검색어')).toBeVisible();
    // 검색 폼은 #site-menu(펼치고 접는 메뉴) 안에 들어 있지 않다 — 접혀도 보이는 까닭
    await expect(page.locator('#site-menu').getByRole('search')).toHaveCount(0);
    if (isMobile) {
      await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeHidden();
    }
  });

  test('머리글은 화면에 붙어 있지 않다(스크롤하면 위로 올라간다)', async ({ page }) => {
    await page.goto('./start/');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bottom = await page.locator('.site-header').evaluate((header) => header.getBoundingClientRect().bottom);
    expect(bottom).toBeLessThanOrEqual(0);
  });

  test('Tab 차례 = 보이는 차례: 이름 → [메뉴]/주 메뉴 → 검색 상자(위에서 아래, 왼쪽에서 오른쪽)', async ({ page }) => {
    await page.goto('./learn/');
    await page.keyboard.press('Tab'); // 본문으로 건너뛰기
    const stops: { name: string; top: number; left: number }[] = [];
    for (let press = 0; press < 14; press += 1) {
      await page.keyboard.press('Tab');
      const stop = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || !active.closest('.site-header')) {
          return null;
        }
        const rect = active.getBoundingClientRect();
        return { name: active.getAttribute('aria-label') ?? (active.textContent ?? '').trim().slice(0, 20), top: rect.top, left: rect.left };
      });
      if (!stop) {
        break;
      }
      stops.push(stop);
    }
    expect(stops.length, '머리글 안의 Tab 정지점').toBeGreaterThanOrEqual(3);
    for (let index = 1; index < stops.length; index += 1) {
      const before = stops[index - 1];
      const now = stops[index];
      // 같은 줄(위 끝이 24px 이내)이면 왼쪽에서 오른쪽으로, 아니면 아래로 내려간다.
      const sameRow = Math.abs(now.top - before.top) < 24;
      const ok = sameRow ? now.left >= before.left - 1 : now.top > before.top;
      expect(ok, `${before.name}(${Math.round(before.left)},${Math.round(before.top)}) → ${now.name}(${Math.round(now.left)},${Math.round(now.top)})`).toBe(true);
    }
  });
});

test.describe('머리글 주 메뉴 — 아이콘과 낱말(넓은 화면)', () => {
  test.skip(({ isMobile }) => isMobile, '데스크톱 화면(1366px)에서만 확인한다');

  test('메뉴 칸마다 꾸밈 아이콘이 있고, 이름은 낱말 그대로이며, 머리글은 한 줄이다', async ({ page }) => {
    await page.goto('./');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    await expect(nav.locator('a.site-nav__link svg[aria-hidden="true"]')).toHaveCount(headerNav.length);
    for (const item of headerNav) {
      await expect(nav.getByRole('link', { name: item.label, exact: true })).toBeVisible();
    }
    // 하위 메뉴(학생용 등)는 넓은 화면에서 숨는다 — 드롭다운 없음(Tab 정지점이 늘지 않게)
    await expect(nav.getByRole('link', { name: '학생용' })).toBeHidden();
    const height = await page.locator('.site-header').evaluate((header) => header.getBoundingClientRect().height);
    expect(height, '머리글 한 줄 높이').toBeLessThanOrEqual(80);
  });

  test('지금 있는 곳은 data-active와 막대로 표시한다(색만으로 알리지 않는다)', async ({ page }) => {
    await page.goto('./labs/gallery/');
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    const labs = nav.getByRole('link', { name: '실습실', exact: true });
    await expect(labs).toHaveAttribute('data-active', 'true');
    await expect(labs).not.toHaveAttribute('aria-current', 'page');
    const shadow = await labs.evaluate((link) => getComputedStyle(link).boxShadow);
    expect(shadow, '지금 있는 곳 막대').not.toBe('none');
  });
});

test.describe('머리글 주 메뉴 — 좁은 화면 동작', () => {
  test.skip(({ isMobile }) => !isMobile, '모바일 화면(375px)에서만 확인한다');

  test('메뉴 줄은 아이콘 + 낱말이고 누르기 쉬운 높이(44px 이상)이며, 하위 메뉴가 함께 보인다', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: '메뉴' }).click();
    const nav = page.getByRole('navigation', { name: '주 메뉴' });
    for (const item of headerNav) {
      const link = nav.getByRole('link', { name: item.label, exact: true });
      await expect(link).toBeVisible();
      await expect(link.locator('svg[aria-hidden="true"]')).toHaveCount(1);
      const box = await link.boundingBox();
      expect(box?.height ?? 0, item.label).toBeGreaterThanOrEqual(44);
    }
    for (const label of ['학생용', '보드 준비', '영상 처리 실습실', '파이썬 오류 사전']) {
      const box = await nav.getByRole('link', { name: label, exact: true }).boundingBox();
      expect(box?.height ?? 0, label).toBeGreaterThanOrEqual(44);
    }
    // 열린 메뉴 아래에도 검색 상자가 있다(DOM·보이는 차례가 같다)
    await expect(page.getByRole('search', { name: '사이트 검색', exact: true })).toBeVisible();
  });

  test('머리글 바깥을 누르면 닫히고, 화면이 넓어지면 닫힌 상태로 돌아간다', async ({ page }) => {
    await page.goto('./start/');
    const button = page.getByRole('button', { name: '메뉴' });
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page.locator('main h1').click();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeHidden();

    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(button).toBeHidden();
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeHidden();
  });

  test('메뉴 안 링크를 누르면 메뉴가 닫힌다(같은 쪽에 머무는 이동도)', async ({ page }) => {
    await page.goto('./start/');
    const button = page.getByRole('button', { name: '메뉴' });
    await button.click();
    // 주소 이동 없이 닫힘만 보려고 이동을 막는다(링크 누름 처리는 이동을 막아도 돈다).
    await page.evaluate(() => {
      document.querySelector('#site-menu')?.addEventListener('click', (event) => event.preventDefault());
    });
    await page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name: '용어사전', exact: true }).click();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('바닥글 사이트 지도 — 다섯 묶음', () => {
  test('묶음 제목과 모든 링크가 있고 주소가 맞다', async ({ page }) => {
    await page.goto('./');
    const map = page.getByRole('navigation', { name: '사이트 지도' });
    await expect(map.locator('.site-footer__section')).toHaveCount(footerColumns.length);
    for (const column of footerColumns) {
      await expect(map.getByText(column.title, { exact: true }).first()).toBeVisible();
      for (const link of column.links) {
        await expect(map.locator(`a[href="${link.href}"]`).first(), `${column.title} › ${link.label}`).toHaveText(link.label);
      }
    }
  });

  test('모든 링크를 누르는 곳이 24px 이상이다(WCAG 2.5.8)', async ({ page }) => {
    await page.goto('./');
    const heights = await page.locator('.site-footer a').evaluateAll((links) => links.map((link) => [link.textContent?.trim(), link.getBoundingClientRect().height]));
    for (const [label, height] of heights) {
      expect(height as number, String(label)).toBeGreaterThanOrEqual(24);
    }
  });
});

test.describe('현재 위치(빵부스러기)', () => {
  test('홈 칸은 집 아이콘과 함께, 이름은 "홈" 그대로이고 지금 쪽은 aria-current다', async ({ page }) => {
    await page.goto('./start/student/');
    const breadcrumb = page.getByRole('navigation', { name: '현재 위치' });
    const home = breadcrumb.getByRole('link', { name: '홈', exact: true });
    await expect(home.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    await expect(home).toHaveAttribute('href', withBase(''));
    await expect(breadcrumb.locator('[aria-current="page"]')).toHaveText(getPage('start-student').label);
    // 칸 사이 화살표는 꾸밈이라 목록 항목 수는 칸 수와 같다
    await expect(breadcrumb.getByRole('listitem')).toHaveCount(3);
  });
});

test.describe('404 — 길을 잃은 사람을 다시 데려간다', () => {
  test.skip(({ isMobile }) => isMobile, '404 동작은 데스크톱에서 확인한다');

  test('주 경로 카드 넷(시작하기·배우기·실습실·문제 해결)이 있고 카드 어디를 눌러도 이동한다', async ({ page }) => {
    await page.goto('./no-such-page/');
    const routes = page.locator('.not-found__route');
    await expect(routes).toHaveCount(4);
    for (const [index, id] of ['start', 'learn', 'labs', 'help'].entries()) {
      const target = getPage(id);
      const card = routes.nth(index);
      await expect(card.getByRole('link', { name: target.label, exact: true })).toHaveAttribute('href', target.href);
      await expect(card.locator('svg[aria-hidden="true"]')).toHaveCount(1);
    }
    // 카드의 설명 글자 자리를 눌러도 링크가 눌린다(덮개) — 요소가 아니라 화면 좌표를 눌러 실제로 닿는 곳을 본다
    const box = await routes.nth(0).locator('p').boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
    await expect(page).toHaveURL(new RegExp(`${getPage('start').href}$`));
  });

  test('검색 상자는 큰 입력칸이고, 폼 이름·입력칸 이름이 그대로이며 자동 완성이 붙는 폼이다', async ({ page }) => {
    await page.goto('./no-such-page/');
    const form = page.getByRole('search', { name: '사이트에서 찾아보기' });
    // 자동 완성 스크립트가 입력칸에 combobox 역할을 붙인다(자바스크립트가 안 되면 searchbox 그대로 — 폼 제출은 같다).
    const input = form.getByRole('combobox', { name: '검색어' });
    await expect(input).toBeVisible();
    const height = await input.evaluate((element) => element.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(56);
    await expect(form).toHaveAttribute('data-suggest', '');
    // 머리글 폼과 이름이 겹치지 않는다
    await expect(page.getByRole('search')).toHaveCount(2);
  });
});

// 판 1.3.0 검수 1차 고침(R1-003·R1-007·R1-009): 같은 영역 쪽은 제목 왼쪽선이 같고, 카드 격자에 홀로 남는 카드가 없고, 바닥글이 얇다.
test.describe('쪽 틀 정렬·카드 격자·바닥글 높이', () => {
  test.skip(({ isMobile }) => isMobile, '넓은 화면(1366×768)에서 본다');

  test('교사용 자료실·도움·시작하기·용어사전: 쪽 제목의 왼쪽선이 모두 같다', async ({ page }) => {
    const lefts = new Map<string, number>();
    for (const path of ['./teacher/', './teacher/guides/', './teacher/standards/', './teacher/corrections/', './teacher/faq/', './teacher/real-pc/', './help/', './glossary/', './settings/', './credits/', './start/']) {
      await page.goto(path);
      const box = await page.locator('main h1').first().boundingBox();
      lefts.set(path, Math.round(box?.x ?? -1));
    }
    expect(new Set(lefts.values()).size, JSON.stringify([...lefts])).toBe(1);
  });

  test('글줄은 글 읽기 폭(44rem = 704px)을 넘지 않는다', async ({ page }) => {
    await page.goto('./teacher/faq/');
    const widths = await page.locator('main > p.lead, main > .prose').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width));
    for (const width of widths) {
      expect(width).toBeLessThanOrEqual(705);
    }
  });

  for (const target of [
    { path: './learn/u1/', selector: '.unit-outline__cards' },
    { path: './teacher/', selector: '.teacher-cards' },
    { path: './learn/', selector: '.unit-outline__cards' },
  ]) {
    test(`${target.path} ${target.selector}: 마지막 줄에 카드가 하나만 남지 않는다`, async ({ page }) => {
      await page.goto(target.path);
      const grids = await page.locator(target.selector).evaluateAll((lists) =>
        lists.map((list) => {
          const tops = [...list.children].map((child) => Math.round(child.getBoundingClientRect().top));
          const last = tops[tops.length - 1];
          return { count: tops.length, inLastRow: tops.filter((top) => top === last).length, rows: new Set(tops).size };
        }),
      );
      for (const grid of grids) {
        if (grid.count >= 4 && grid.rows > 1) {
          expect(grid.inLastRow, JSON.stringify(grid)).toBeGreaterThanOrEqual(2);
        }
      }
    });
  }

  test('바닥글은 얇다(홈 1366×768에서 420px 이하)', async ({ page }) => {
    await page.goto('./');
    const height = await page.locator('footer.site-footer').evaluate((element) => element.getBoundingClientRect().height);
    expect(height).toBeLessThanOrEqual(420);
  });
});
