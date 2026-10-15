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
    // 끝낸 뒤 주소에서 ?view=slide가 사라져 새로 고쳐도 읽기 화면이다(2026-10-16 화면 검수)
    expect(new URL(page.url()).search).toBe('');
    await page.reload();
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting');
  });

  test('발표를 끝내면 다른 주소 값(?example=)은 그대로 두고 view만 지운다', async ({ page }) => {
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
