// 교과서 쪽(판 1.4.0, DECISIONS C131~C134) — 기준 쪽 /book/2-1-2/(LCD 제어하기, 교과서 124~131쪽)와 /book/ 첫 화면, 두 화면 전환 줄, ?view=slide 수업 화면.
// 판 1.6.0(C173): 두 쪽 이름은 "교과서 원문"·"따라 하기", 쪽 범위는 전환 줄에 한 번, 프로젝터 화면 이름은 "수업 화면"(단계 주소 #slide=N).
// 데스크톱·휴대폰 두 프로젝트에서 돈다. 글자가 출판본과 같은지는 npm run book:fidelity(원본 PDF가 있는 운영자 PC)가 본다.
import { expect, test, type Page } from '@playwright/test';
import { ZOOM_150, openPresentationByButton, walkAllSteps } from './helpers/present.ts';
import { closeSideMenuBeforeLoad, menuOutline } from './helpers/side-menu.ts';

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
    // 쪽 범위는 한 번만(판 1.6.0, B-90): 짝 웹 차시가 있는 쪽은 배지가 아니라 전환 줄 [교과서 원문 124~131쪽]이 말한다
    await expect(page.locator('[data-book-pages]')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '같은 내용을 보는 방법' })).toContainText('교과서 원문 124~131쪽');
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

test.describe('전환 줄: 교과서 원문 ↔ 따라 하기(판 1.6.0 이름 — C173)', () => {
  test('두 방향으로 오갈 수 있고, 지금 쪽은 링크가 아닌 글자(aria-current="page")다', async ({ page }) => {
    await page.goto('./book/2-1-2/');
    const switchBar = page.getByRole('navigation', { name: '같은 내용을 보는 방법' });
    // 지금 쪽은 자기 자신으로 가는 링크가 아니다(Tab 정류장을 늘리지 않는다 — walk-a11y-keyboard 13)
    const here = switchBar.locator('[aria-current="page"]');
    await expect(here).toHaveText('교과서 원문 124~131쪽');
    await expect(here).not.toHaveAttribute('href', /.*/u);
    await expect(switchBar.getByRole('link')).toHaveCount(1);
    await switchBar.getByRole('link', { name: '따라 하기' }).click();
    await expect(page).toHaveURL(/\/learn\/u2\/2-1-2\/$/u);

    const back = page.getByRole('navigation', { name: '같은 내용을 보는 방법' });
    await expect(back.locator('[aria-current="page"]')).toHaveText('따라 하기');
    await back.getByRole('link', { name: '교과서 원문 124~131쪽' }).click();
    await expect(page).toHaveURL(/\/book\/2-1-2\/$/u);
  });

  test('따라 하기 쪽 머리의 칩 줄에는 교과서 쪽 칸이 없다(쪽 범위는 전환 줄에 한 번 — B-90)', async ({ page }) => {
    await page.goto('./learn/u2/2-1-2/');
    await expect(page.locator('[data-meta="pages"]')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '같은 내용을 보는 방법' })).toContainText('교과서 원문 124~131쪽');
  });

  test('짝 교과서 쪽이 없는 웹 차시(보충)에는 전환 줄이 없다', async ({ page }) => {
    await page.goto('./learn/u1/v1/');
    await expect(page.getByRole('navigation', { name: '같은 내용을 보는 방법' })).toHaveCount(0);
  });
});

test.describe('?view=slide·#slide=N 수업 화면', () => {
  test('교과서 쪽에 ?view=slide로 들어가면 수업 화면으로 열리고 Esc로 끝낸다', async ({ page }) => {
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
    // 끝낸 뒤 주소에서 ?view=slide가 사라져 새로 고쳐도 읽기 화면이다(2026-10-16 화면 검수)
    expect(new URL(page.url()).search).toBe('');
    await page.reload();
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting');
  });

  test('수업 화면을 끝내면 다른 주소 값(?example=)과 열 때의 #위치는 그대로 두고 view·#slide만 지운다', async ({ page }) => {
    await page.goto('./book/2-1-2/?foo=1&view=slide#p124');
    await hideDevToolbar(page);
    await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting');
    const url = new URL(page.url());
    expect(url.search).toBe('?foo=1');
    expect(url.hash).toBe('#p124');
  });

  test('주소에 view=slide가 없으면 읽기 화면이고, 웹 차시도 ?view=slide를 받는다', async ({ page }) => {
    await page.goto('./book/2-1-2/');
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting');
    await page.goto('./learn/u2/2-1-2/?view=slide');
    await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
  });

  test('[수업 화면] 단추로도 열린다 — 웹 차시 쪽과 같은 이름·같은 부품(판 1.6.0 C173)', async ({ page }) => {
    await page.goto('./book/2-1-2/');
    await hideDevToolbar(page);
    await expect(page.getByRole('button', { name: '수업 화면으로' })).toHaveCount(0);
    await page.getByRole('button', { name: '수업 화면', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
  });

  test('단계 주소 #slide=N: 넘길 때마다 주소 끝이 바뀌고, 그 주소로 열면 그 단계, 끝내면 지운다(walk-teacher-new A3)', async ({ page }) => {
    await page.goto('./book/2-1-2/#slide=3');
    await hideDevToolbar(page);
    await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
    const present = page.locator('[data-lesson-present]');
    await expect(present).toHaveAttribute('data-present-step', '3');
    const total = await present.getAttribute('data-present-total');
    await page.keyboard.press('ArrowRight');
    await expect(present).toHaveAttribute('data-present-step', '4');
    await expect.poll(() => new URL(page.url()).hash).toBe('#slide=4');
    // 총수는 넘기는 동안 바뀌지 않는다(B-39)
    await page.keyboard.press('ArrowRight');
    await expect(present).toHaveAttribute('data-present-total', total ?? '');
    // 새로 고쳐도 그 단계
    await page.reload();
    await hideDevToolbar(page);
    await expect(present).toHaveAttribute('data-present-step', '5');
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting');
    expect(new URL(page.url()).hash).toBe('');
  });

  test('수업 화면 중 [실습실에서 크게 열기]는 새 탭 + ?from=slide&n=단계로 열리고, 실습실 맨 위에 "← 수업 화면으로"가 그 단계로 돌아간다', async ({ page, context, isMobile }) => {
    test.skip(isMobile, '프로젝터(넓은 화면) 시험');
    await page.goto('./book/2-1-2/?view=slide');
    await hideDevToolbar(page);
    const present = page.locator('[data-lesson-present]');
    await expect(present).toHaveAttribute('data-present-total', /\d+/u);
    const bigOpen = page.locator('a[data-lab-big-open]');
    for (let press = 0; press < 80 && !(await bigOpen.first().isVisible()); press += 1) {
      await page.keyboard.press('ArrowRight');
    }
    const link = bigOpen.filter({ visible: true }).first();
    await expect(link).toBeVisible();
    const step = await present.getAttribute('data-present-step');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('href', new RegExp(`[?&]from=slide&n=${step}$`, 'u'));
    const [lab] = await Promise.all([context.waitForEvent('page'), link.click()]);
    await lab.waitForLoadState('domcontentloaded');
    const back = lab.locator('[data-lab-slide-return] a');
    await expect(back).toBeVisible({ timeout: 30_000 });
    await expect(back).toHaveText(/수업 화면으로/u);
    await expect(back).toHaveAttribute('href', new RegExp(`/book/2-1-2/#slide=${step}$`, 'u'));
    await lab.close();
    // 끝내면 링크가 원래 주소·같은 탭으로 돌아온다
    await page.keyboard.press('Escape');
    await expect(bigOpen.first()).not.toHaveAttribute('target', /.*/u);
    await expect(bigOpen.first()).not.toHaveAttribute('href', /from=slide/u);
  });
});

test.describe('차례: 왼쪽 교과서 차례(좁은 화면은 접힘) · /book/ 첫 화면', () => {
  test('넓은 화면은 메뉴판 안 "교과서 원문" 아래에 차례가 있고 지금 쪽이 표시된다(판 1.9.0 — 본문 칸의 같은 차례는 숨는다)', async ({ page, isMobile }) => {
    test.skip(isMobile, '넓은 화면의 왼쪽 메뉴판');
    await page.goto('./book/2-1-2/');
    await expect(page.locator('details[data-lesson-nav]')).toBeHidden();
    const outline = menuOutline(page);
    await expect(outline).toBeVisible();
    await expect(outline.getByRole('link', { name: /2-1-2 LCD 제어하기/u })).toHaveAttribute('aria-current', 'page');
    await expect(outline.getByRole('link', { name: /2-1-2 LCD 제어하기/u })).toBeInViewport();
  });

  test('메뉴판을 접은 넓은 화면은 본문 칸에 차례가 펼쳐져 있고 지금 쪽이 표시되며, 좁은 화면은 <details>로 접혀 있다', async ({ page }) => {
    await closeSideMenuBeforeLoad(page);
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

  test('/book/ 첫 화면: 대단원 > 중단원 > 절 목록과 쪽 범위·[따라 하기] 링크', async ({ page }) => {
    await page.goto('./book/');
    await expect(page.getByRole('heading', { level: 1, name: '교과서' })).toBeVisible();
    const lcd = page.locator('.book-toc__item', { hasText: 'LCD 제어하기' });
    await expect(lcd.getByRole('link', { name: /2-1-2 LCD 제어하기/u })).toHaveAttribute('href', /\/book\/2-1-2\/$/u);
    await expect(lcd).toContainText('교과서 124~131쪽');
    await expect(lcd.getByRole('link', { name: '2-1-2 따라 하기' })).toHaveAttribute('href', /\/learn\/u2\/2-1-2\/$/u);
    await expect(page.locator('#unit-2')).toBeAttached();
    await expect(page.locator('#unit-2-part-1')).toBeAttached();
  });

  test('메뉴판에 "교과서 원문"이 "따라 하기" 앞에 있다(판 1.6.0 이름 — C173, 판 1.9.0부터 왼쪽 메뉴판)', async ({ page }) => {
    await page.goto('./book/');
    const labels = await page.locator('#site-menu a').allTextContents();
    const compact = labels.map((label) => label.replace(/\s+/gu, ' ').trim());
    const book = compact.indexOf('교과서 원문');
    expect(book).toBeGreaterThanOrEqual(0);
    expect(compact.indexOf('따라 하기')).toBeGreaterThan(book);
  });
});

test('가로로 넘치지 않는다(교과서 쪽·첫 화면)', async ({ page }) => {
  for (const path of ['./book/2-1-2/', './book/']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

// 회로 그림(판 1.4.0 C5): ::회로[번호] 지시자가 키트 회로 구성 도구로 그린 배선 그림(scripts/circuits/circuits.yaml)을 연결 레시피 바로 뒤에 놓는다.
test.describe('회로 그림(::회로)', () => {
  test('/book/2-1-2/: 연결 레시피 뒤에 회로 그림 두 장이 캡션·고정 문장·[그림 크게 보기]와 함께 보이고 그림이 받아진다', async ({ page }) => {
    await page.goto('./book/2-1-2/');
    await hideDevToolbar(page);
    const figures = page.locator('figure.book-circuit');
    await expect(figures).toHaveCount(2);
    // 연결 레시피 상자 바로 뒤에 놓인다
    await expect(page.locator('.box--recipe + figure.book-circuit')).toHaveCount(2);
    await expect(figures.nth(0)).toHaveAttribute('data-circuit', '2-1-2-1');
    await expect(figures.nth(1)).toHaveAttribute('data-circuit', '2-1-2-2');

    const first = figures.first();
    await first.scrollIntoViewIfNeeded();
    const image = first.locator('img');
    await expect(image).toHaveAttribute('alt', /^ESP32 실드 V3 보드 아래에 LCD가 있어요\./u);
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const caption = first.locator('figcaption');
    await expect(caption).toContainText('회로 그림');
    await expect(caption).toContainText('LCD를 21번(SDA)·22번(SCL) 핀에 연결해요.');
    await expect(caption).toContainText('브릭셀 회로 구성 도구로 그린 배선(ESP32 실드 V3). 교과서 사진의 보드와 모양이 달라도 같은 번호 핀에 꽂아요.');
    // 핀 번호 글자가 작아 [그림 크게 보기]는 모든 화면 폭에서 보인다(눌러 열리는 곳은 그림 파일)
    const zoom = caption.getByRole('link', { name: /그림 크게 보기/u });
    await expect(zoom).toBeVisible();
    await expect(zoom).toHaveAttribute('href', /\/images\/circuits\/third-party\/kit-vendor\/2-1-2-1\.webp$/u);
    // 가로로 넘치지 않는다
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('/book/4-2-2/: 그림이 두 장이고, 그리지 못한 버저 연결은 안내 문장으로 알린다', async ({ page }) => {
    await page.goto('./book/4-2-2/');
    await hideDevToolbar(page);
    await expect(page.locator('figure.book-circuit')).toHaveCount(2);
    await expect(page.locator('figure.book-circuit[data-circuit="4-2-2-2"] figcaption')).toContainText('이 그림에 없는 연결: 버저(2번 핀)');
    await expect(page.locator('figure.book-circuit[data-circuit="4-2-2-1"] figcaption')).not.toContainText('이 그림에 없는 연결');
  });
});

test.describe('화면 검수 반영(2026-10-16): 캡션 겹침·준비물 사진·제목 중복·묶음 나누기', () => {
  // 좁은 화면에서만 보이는 [그림 크게 보기] 단추가 바로 아래 캡션(▲ …)을 가리지 않는다 — 단추 상자와 캡션 상자가 겹치지 않아야 한다(휴대폰 375·태블릿 768)
  for (const width of [375, 768]) {
    for (const id of ['2-1-3', '1-2-2', '2-2-2']) {
      test(`/book/${id}/ 폭 ${width}: [그림 크게 보기] 단추가 그림 캡션과 겹치지 않는다`, async ({ page }) => {
        await page.setViewportSize({ width, height: 812 });
        await page.goto(`./book/${id}/`);
        await hideDevToolbar(page);
        const captions = page.locator('.book-caption');
        const count = await captions.count();
        expect(count).toBeGreaterThan(0);
        for (let index = 0; index < count; index += 1) {
          const caption = captions.nth(index);
          await caption.scrollIntoViewIfNeeded();
          const gap = await caption.evaluate((element) => {
            // 캡션 바로 앞 문단의 [그림 크게 보기]가 단추로 보이는 곳(≤48rem)이면 두 상자의 세로 간격(겹치면 음수)을 잰다
            const zoom = element.previousElementSibling?.querySelector<HTMLElement>('.figure-zoom');
            if (!zoom || zoom.getClientRects().length === 0) {
              return null;
            }
            return element.getBoundingClientRect().top - zoom.getBoundingClientRect().bottom;
          });
          if (gap !== null) {
            expect(gap, `${id} 캡션 ${index + 1}번이 단추와 겹쳐요`).toBeGreaterThanOrEqual(0);
          }
        }
      });
    }
  }

  test('/book/2-1-3/ 준비물 사진 줄은 교과서 키트의 OLED 1.3인치(SH1106)를 보여 준다(0.96인치 SSD1306이 아님)', async ({ page }) => {
    await page.goto('./book/2-1-3/');
    const strip = page.getByRole('group', { name: '준비물 사진' });
    await expect(strip).toContainText('OLED 1.3인치(SH1106)');
    await expect(strip).not.toContainText('SSD1306');
    await expect(strip.locator('a[href$="#part-dis-012-oled-1-3-sh1106"]')).toHaveCount(1);
  });

  test('1단원 "실행 결과" 상자는 제목이 한 번만 나온다', async ({ page }) => {
    await page.goto('./book/1-2-3/');
    const boxes = page.locator('.box--result');
    expect(await boxes.count()).toBeGreaterThan(0);
    for (let index = 0; index < (await boxes.count()); index += 1) {
      const box = boxes.nth(index);
      await expect(box.locator('.box__title')).toHaveText('실행 결과');
      // 상자 안 본문에 같은 낱말의 굵은 글이 또 없다
      await expect(box.locator('strong', { hasText: /^실행 결과$/u })).toHaveCount(0);
    }
  });

  test('/book/3-1-2/ 연결 레시피의 두 묶음(레이저 / UART 변환기)은 목록 둘이다', async ({ page }) => {
    await page.goto('./book/3-1-2/');
    const recipe = page.locator('.box--recipe').first();
    const lists = recipe.locator('ul');
    await expect(lists).toHaveCount(2);
    await expect(lists.nth(0).locator('li')).toHaveText(['GND', 'VCC', 'GPIO 18번 핀']);
    await expect(lists.nth(1).locator('li')).toHaveText(['GND', 'VCC', 'GPIO 16번 핀', 'GPIO 17번 핀']);
    // 묶음 사이가 한 칸 이상 벌어져 있다(목록 안 줄 간격보다 크다)
    const [firstBottom, secondTop, lineGap] = await recipe.evaluate((element) => {
      const [first, second] = Array.from(element.querySelectorAll('ul')).map((list) => list.getBoundingClientRect());
      const items = Array.from(element.querySelectorAll('ul')[0]!.querySelectorAll('li')).map((item) => item.getBoundingClientRect());
      return [first!.bottom, second!.top, items[1]!.top - items[0]!.bottom];
    });
    expect(secondTop - firstBottom).toBeGreaterThan(lineGap + 4);
  });

  test('/book/3-1-3/ 용어풀이 속 바이트 출력(b로 시작하는 글)은 곧은 따옴표 코드로 보인다', async ({ page }) => {
    await page.goto('./book/3-1-3/');
    const code = page.locator('code', { hasText: "b'\\xXX" });
    await expect(code).toHaveCount(1);
    await expect(code).toHaveText("b'\\xXX\\xXX\\xXX\\xXX\\xXX\\xXX'");
  });

  test('머리말·마무리 쪽 제목은 같은 말을 되풀이하지 않는다(쪽 머리와 왼쪽 차례 모두)', async ({ page }) => {
    await page.goto('./book/front/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('머리말과 이 책의 구성과 특징');
    await page.goto('./book/u1-review/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('대단원 마무리하기');
    const nav = page.locator('nav[aria-label="교과서 차례"]');
    // 상자가 접혀 있는 좁은 화면에서도 글은 문서에 있으므로 textContent로 본다
    const text = (await nav.first().evaluate((element) => element.textContent ?? '')).replace(/\s+/gu, ' ');
    expect(text).not.toContain('머리말 머리말과');
    expect(text).not.toContain('1단원 마무리 대단원 마무리하기');
    expect(text).toContain('머리말과 이 책의 구성과 특징');
    expect(text).toContain('대단원 마무리하기');
    // 제목이 번호 이름과 다른 말이면 번호 이름이 그대로 남는다
    await page.goto('./book/u2-intro/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('2단원 시작 피지컬 컴퓨팅');
  });

  test('웹 차시 왼쪽 차례의 마무리 항목은 로마 숫자 대신 "2단원 마무리"로 보인다', async ({ page }) => {
    await page.goto('./learn/u2/2-2-1/');
    const nav = page.locator('nav[aria-label="단원 차시 목록"]');
    const text = (await nav.first().evaluate((element) => element.textContent ?? '')).replace(/\s+/gu, ' ');
    expect(text).toContain('2단원 마무리');
    expect(text).not.toContain('II-마무리');
    // 주소는 그대로다
    await expect(nav.first().locator('a[href$="/learn/u2/review/"]')).toHaveCount(1);
  });
});

test.describe('교과서 쪽 /book/2-1-1/ — 설치 단락 앞 "이 사이트에서는 설치 없이" 안내(판 1.6.0 C176)', () => {
  test('"4 피지컬 컴퓨팅 개발 환경 설정" 제목 바로 아래, 출판본 "드라이버 설치" 앞에 안내 상자가 있고 보드 준비하기·ESP32 실습실로 가는 링크가 있다', async ({ page }) => {
    await page.goto('./book/2-1-1/');
    await hideDevToolbar(page);
    const box = page.locator('.box--webnote');
    await expect(box).toHaveCount(1);
    await expect(box.locator('.box__title')).toHaveText('이 사이트에서는 설치 없이');
    await expect(box).toContainText('드라이버와 토니(Thonny) 설치는 이 사이트에서는 하지 않아도 돼요');
    await expect(box.getByRole('link', { name: 'ESP32 실습실 열기' })).toHaveAttribute('href', /\/labs\/esp32\/$/u);
    await expect(box.getByRole('link', { name: '보드 준비하기' })).toHaveAttribute('href', /\/start\/board\/$/u);
    // 위치: 4 제목 → 안내 상자 → **드라이버 설치**(출판본 원문은 그대로 이어진다)
    const order = await page.evaluate(() => {
      const heading = [...document.querySelectorAll('.lesson-body h2')].find((element) => element.textContent?.includes('피지컬 컴퓨팅 개발 환경 설정'));
      const note = document.querySelector('.box--webnote');
      const driver = [...document.querySelectorAll('.lesson-body strong')].find((element) => element.textContent?.trim() === '드라이버 설치');
      if (!heading || !note || !driver) return null;
      const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return [before(heading, note), before(note, driver)];
    });
    expect(order).toEqual([true, true]);
    // 출판본 쪽 표지는 그대로(120쪽 안, 쪽 번호 표지가 상자보다 앞)
    await expect(page.locator('#p120')).toBeAttached();
    // 파랑 안내 상자 모양(출판본 꼭지와 구별) — 제목이 늘 글자로 보인다
    await expect(box).toHaveAttribute('data-box', 'webnote');
  });
});

// 판 1.7.0(PROGRESS 미해결 261 #21 — walk-student-first): 375에서 /book/1-1-1/ 인식·학습·추론 표(4칸)가 451px로 넘쳐 "추론" 열이 잘렸다.
// 교과서 쪽의 4칸 표는 칸 최소 폭(차시 쪽 규칙 7.5em)을 풀고 칸 옆 여백을 줄여 화면 폭에 들어간다(src/styles/book.css). 출판본 글은 그대로다.
test.describe('교과서 쪽 4칸 표가 휴대폰 폭에 들어간다(판 1.7.0)', () => {
  for (const id of ['1-1-1', '3-1-1']) {
    test(`/book/${id}/ 375: 4칸 표가 옆으로 넘치지 않고 마지막 열 글이 화면 안에 있다`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(`./book/${id}/`);
      const tables = page.locator('.lesson-body table:has(tr > :nth-child(4)):not(:has(tr > :nth-child(5)))');
      expect(await tables.count(), '4칸 표').toBeGreaterThan(0);
      for (const table of await tables.all()) {
        await table.scrollIntoViewIfNeeded();
        const size = await table.evaluate((element) => {
          const lastHeader = element.querySelector('tr > :last-child');
          return {
            scroll: element.scrollWidth,
            client: element.clientWidth,
            lastRight: lastHeader?.getBoundingClientRect().right ?? 0,
            viewport: document.documentElement.clientWidth,
            // 어절(띄어 쓴 낱말) 가운데서 끊긴 줄이 없다(keep-all 그대로) — 칸마다 가장 긴 낱말 폭이 칸 안쪽 폭보다 작거나 같다
            cramped: [...element.querySelectorAll('th, td')].some((cell) => cell.scrollWidth > cell.clientWidth + 1),
          };
        });
        expect(size.scroll, '표가 옆으로 넘치지 않는다').toBeLessThanOrEqual(size.client + 1);
        expect(size.lastRight, '마지막 열(예: 추론)이 화면 안').toBeLessThanOrEqual(size.viewport + 1);
        expect(size.cramped, '칸 안 글이 칸 밖으로 넘치지 않는다').toBe(false);
      }
      await expect(tables.first().locator('tr').first()).toContainText(id === '1-1-1' ? '추론' : '설명');
    });
  }
});

// 판 1.7.0(PROGRESS 미해결 260·270 — 다시 걷기 walk-a11y-keyboard 4·N3): 150%에서 교과서 쪽 수업 화면 11/20단계의 글이 막대 밑으로 넘치고
// 알림 알약이 마지막 글줄을 덮었으며, 7/20단계는 그림 설명 한 줄뿐인 거의 빈 단계였다.
test.describe('교과서 쪽 수업 화면 — 150% 확대(911×512)', () => {
  test.skip(({ isMobile }) => isMobile, '데스크톱 창을 150%로 키운 화면을 본다');
  test.use(ZOOM_150);

  test('/book/1-1-1/: 모든 단계가 막대 위에서 끝나고, 그림 설명 "▲ 인공지능의 핵심 요소별 구현 예시"는 그 표와 같은 단계에 있다', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('./book/1-1-1/');
    await openPresentationByButton(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await walkAllSteps(page, '/book/1-1-1/ 150%');
    // 그림 설명이 보이는 단계에는 표도 보인다(설명 한 줄만 따로 있는 거의 빈 단계가 없다)
    const caption = page.locator('.lesson-body p', { hasText: '▲ 인공지능의 핵심 요소별 구현 예시' });
    const present = page.locator('[data-lesson-present]');
    const total = Number(await present.getAttribute('data-present-total'));
    await page.keyboard.press('Home');
    let seen = 0;
    for (let step = 1; step <= total; step += 1) {
      await expect(present).toHaveAttribute('data-present-step', String(step));
      if (await caption.isVisible()) {
        seen += 1;
        const tableShown = await caption.evaluate((element) => {
          const section = element.closest('section');
          return [...(section?.querySelectorAll('table') ?? [])].some((table) => !table.closest('[data-present-off]') && table.getClientRects().length > 0);
        });
        expect(tableShown, `${step}/${total}단계: 그림 설명과 표가 같은 단계`).toBe(true);
      }
      if (step < total) {
        await page.keyboard.press('ArrowRight');
      }
    }
    expect(seen, '그림 설명이 보이는 단계').toBeGreaterThan(0);
  });
});
