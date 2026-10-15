// 교과서 쪽(판 1.4.0, DECISIONS C131~C134) — 기준 쪽 /book/2-1-2/(LCD 제어하기, 교과서 124~131쪽)와 /book/ 첫 화면, 두 화면 전환 줄, ?view=slide 발표 모드.
// 데스크톱·휴대폰 두 프로젝트에서 돈다. 글자가 출판본과 같은지는 npm run book:fidelity(원본 PDF가 있는 운영자 PC)가 본다.
import { expect, test, type Page } from '@playwright/test';

async function hideDevToolbar(page: Page) {
  // 개발 서버에만 있는 Astro 개발 도구 막대가 아래쪽 단추를 가리는 것을 막는다(빌드 결과에는 없다 — lesson-template.spec.ts와 같은 까닭)
  await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
}

test.describe('교과서 쪽 /book/2-1-2/', () => {
  test('머리: 빵부스러기·제목·쪽 배지·매체·전환 줄이 있고, 쪽 표지 #p125가 쪽 번호대로 이어진다', async ({ page }) => {
    await page.goto('./book/2-1-2/');
    await hideDevToolbar(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('2-1-2 LCD 제어하기');
    const crumbs = page.getByRole('navigation', { name: '현재 위치' });
    await expect(crumbs).toContainText('교과서');
    await expect(crumbs.getByRole('link', { name: '2단원' })).toHaveAttribute('href', /\/book\/#unit-2$/u);
    await expect(crumbs).toContainText('01 디스플레이 장치 제어');
    await expect(page.locator('.book-badge').first()).toContainText('교과서 124~131쪽');
    await expect(page.locator('.book-badge', { hasText: '보드' })).toBeVisible();

    // 쪽 표지: 124~131쪽이 차례대로 하나씩
    const marks = await page.locator('.book-page-mark').evaluateAll((elements) => elements.map((element) => [element.id, element.textContent?.trim()]));
    expect(marks).toEqual([124, 125, 126, 127, 128, 129, 130, 131].map((page) => [`p${page}`, `교과서 ${page}쪽`]));
    await page.goto('./book/2-1-2/#p128');
    await expect(page.locator('#p128')).toBeInViewport();
  });

  test('본문: 학습 목표 → 번호 제목 → 단계 칩 → 코드(줄 번호) → 코드 설명·상자, 실습실은 누를 때만 열린다', async ({ page }) => {
    await page.goto('./book/2-1-2/');
    await hideDevToolbar(page);
    const headings = await page.locator('.lesson-body h2').evaluateAll((elements) => elements.map((element) => element.textContent?.replace(/\s+/gu, ' ').trim()));
    expect(headings.slice(0, 5)).toEqual(['학습 목표', '1 LCD의 이해', '2 프로그램 개요', '3 회로 구성하기', '4 동작 테스트']);
    expect(headings.slice(5)).toEqual(['기본 실습 형식에 맞는 변숫값 출력하기', '기본 실습 RTC 출력하기', '심화 실습 터치 센서로 출력값 제어하기']);
    await expect(page.locator('h3[data-kind="step"]').first()).toContainText('단계 1');
    await expect(page.locator('h2[data-kind="basic"] .book-tag').first()).toHaveText('기본 실습');

    // 상자: 이름이 늘 글자로 보인다
    await expect(page.locator('.box--term .box__title').first()).toHaveText('투과율');
    await expect(page.locator('.box--recipe .box__title').first()).toHaveText('센서 연결 레시피');
    await expect(page.locator('.box--errcheck .box__title')).toHaveText('LCD 출력 에러 체크 포인트');
    await expect(page.locator('.box--think .box__title')).toHaveText('GenAI와 함께 탐구하기');
    await expect(page.locator('.box--webfix .box__title').first()).toHaveText('웹에서 바로잡은 곳: cd.hide_cursor()');
    await expect(page.locator('.box--bubble .box__title').first()).toHaveText('말풍선');

    // 코드 줄 번호: 시작값 없는 블록은 1부터, {start=12}는 12부터(CSS 카운터 시작값 — 화면이 붙이는 번호라 복사해도 따라가지 않는다)
    const resets = await page.locator('pre.astro-code code').evaluateAll((blocks) => blocks.map((block) => getComputedStyle(block).counterReset));
    expect(resets[0]).toBe('book-line 0');
    expect(resets[1]).toBe('book-line 11');
    await expect(page.locator('pre.astro-code[data-line-start="12"]').first()).toBeAttached();

    // 실습실: 누르기 전에는 iframe이 없다
    await expect(page.locator('iframe')).toHaveCount(0);
    const open = page.getByRole('button', { name: '이 자리에서 실습실 열기' }).first();
    await expect(open).toBeVisible();
    await expect(open).toHaveAttribute('data-embed-src', /labs\/esp32\/\?example=esp32%2Fu2%2F2-1-2-lcd-text-check\.py&embed=1/u);
  });

  test('그림은 모두 받아지고 대체 글이 있다', async ({ page }) => {
    await page.goto('./book/2-1-2/');
    await hideDevToolbar(page);
    await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach((image) => ((image as HTMLImageElement).loading = 'eager')));
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.lesson-body img')].every((image) => image.complete));
    const images = await page.locator('.lesson-body img').evaluateAll((elements) =>
      elements.map((element) => ({ ok: (element as HTMLImageElement).naturalWidth > 0, alt: element.getAttribute('alt') ?? '' })),
    );
    expect(images.length).toBeGreaterThanOrEqual(10);
    for (const image of images) {
      expect(image.ok).toBe(true);
      expect(image.alt.length).toBeGreaterThan(8);
    }
  });

  test('이전·다음 절 카드와 [이 차시 다 했어요]가 있다', async ({ page }) => {
    await page.goto('./book/2-1-2/');
    await expect(page.getByRole('navigation', { name: '이전·다음 절' })).toBeVisible();
    await expect(page.getByRole('button', { name: '이 차시 다 했어요' })).toBeVisible();
  });
});

test.describe('전환 줄: 교과서 쪽 ↔ 풀이·실습(웹 차시)', () => {
  test('두 방향으로 오갈 수 있고 지금 쪽은 aria-current="page"다', async ({ page }) => {
    await page.goto('./book/2-1-2/');
    const switchBar = page.getByRole('navigation', { name: '같은 내용을 보는 방법' });
    await expect(switchBar.getByRole('link', { name: '교과서 124~131쪽' })).toHaveAttribute('aria-current', 'page');
    await expect(switchBar.getByRole('link', { name: '풀이·실습' })).not.toHaveAttribute('aria-current', 'page');
    await switchBar.getByRole('link', { name: '풀이·실습' }).click();
    await expect(page).toHaveURL(/\/learn\/u2\/2-1-2\/$/u);

    const back = page.getByRole('navigation', { name: '같은 내용을 보는 방법' });
    await expect(back.getByRole('link', { name: '풀이·실습' })).toHaveAttribute('aria-current', 'page');
    await back.getByRole('link', { name: '교과서 124~131쪽' }).click();
    await expect(page).toHaveURL(/\/book\/2-1-2\/$/u);
  });

  test('짝 교과서 쪽이 없는 웹 차시(보충)에는 전환 줄이 없다', async ({ page }) => {
    await page.goto('./learn/u1/v1/');
    await expect(page.getByRole('navigation', { name: '같은 내용을 보는 방법' })).toHaveCount(0);
  });
});

test.describe('?view=slide 발표 모드', () => {
  test('교과서 쪽에 ?view=slide로 들어가면 발표 모드로 열리고 Esc로 끝낸다', async ({ page }) => {
    await page.goto('./book/2-1-2/?view=slide');
    await hideDevToolbar(page);
    await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
    const total = Number(await page.locator('[data-lesson-present]').getAttribute('data-present-total'));
    expect(total).toBeGreaterThan(8);
    await expect(page.locator('[data-present-status]')).toHaveText(new RegExp(`^1 / ${total} · `, 'u'));
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('[data-lesson-present]')).toHaveAttribute('data-present-step', '2');
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting');
  });

  test('주소에 view=slide가 없으면 읽기 화면이고, 웹 차시도 ?view=slide를 받는다', async ({ page }) => {
    await page.goto('./book/2-1-2/');
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting');
    await page.goto('./learn/u2/2-1-2/?view=slide');
    await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
  });

  test('[수업 화면으로] 단추로도 열린다', async ({ page }) => {
    await page.goto('./book/2-1-2/');
    await hideDevToolbar(page);
    await page.getByRole('button', { name: '수업 화면으로' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
  });
});

test.describe('차례: 왼쪽 교과서 차례(좁은 화면은 접힘) · /book/ 첫 화면', () => {
  test('넓은 화면은 차례가 펼쳐져 있고 지금 쪽이 표시되며, 좁은 화면은 <details>로 접혀 있다', async ({ page }) => {
    await page.goto('./book/2-1-2/');
    const nav = page.locator('details[data-lesson-nav]');
    const width = page.viewportSize()?.width ?? 0;
    if (width >= 1024) {
      await expect(nav).toHaveJSProperty('open', true);
      await expect(nav.getByRole('navigation', { name: '교과서 차례' })).toBeVisible();
    } else {
      await expect(nav).toHaveJSProperty('open', false);
      await nav.getByText('교과서 차례 펼치기').click();
      await expect(nav).toHaveJSProperty('open', true);
    }
    await expect(nav.getByRole('link', { name: /2-1-2 LCD 제어하기/u })).toHaveAttribute('aria-current', 'page');
  });

  test('/book/ 첫 화면: 대단원 > 중단원 > 절 목록과 쪽 범위·풀이·실습 링크', async ({ page }) => {
    await page.goto('./book/');
    await expect(page.getByRole('heading', { level: 1, name: '교과서' })).toBeVisible();
    const lcd = page.locator('.book-toc__item', { hasText: 'LCD 제어하기' });
    await expect(lcd.getByRole('link', { name: /2-1-2 LCD 제어하기/u })).toHaveAttribute('href', /\/book\/2-1-2\/$/u);
    await expect(lcd).toContainText('교과서 124~131쪽');
    await expect(lcd.getByRole('link', { name: '2-1-2 풀이·실습' })).toHaveAttribute('href', /\/learn\/u2\/2-1-2\/$/u);
    await expect(page.locator('#unit-2')).toBeAttached();
    await expect(page.locator('#unit-2-part-1')).toBeAttached();
  });

  test('머리글 메뉴에 "교과서"가 배우기 앞에 있다', async ({ page }) => {
    await page.goto('./book/');
    const labels = await page.locator('.site-header nav a').allTextContents();
    const compact = labels.map((label) => label.replace(/\s+/gu, ' ').trim());
    const book = compact.indexOf('교과서');
    expect(book).toBeGreaterThanOrEqual(0);
    expect(compact.indexOf('배우기')).toBeGreaterThan(book);
  });
});

test('가로로 넘치지 않는다(교과서 쪽·첫 화면)', async ({ page }) => {
  for (const path of ['./book/2-1-2/', './book/']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
