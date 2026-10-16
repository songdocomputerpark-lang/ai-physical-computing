// 부품 사전(/start/parts/)과 보드 준비 쪽 키트 표 사진 칸, 3-1-2 변환기 사진 브라우저 테스트(판 1.4.0, DECISIONS O17·C136).
// 실행: npx playwright test tests/e2e/parts.spec.ts (빌드 후 미리 보기 서버를 띄운다, playwright.config.ts). desktop(1366×768)과 mobile(375×812) 두 화면에서 돈다.
// 부품 사전은 사이트 지도(src/config/nav.ts)의 start-parts라 제목·주소는 getPage에서 읽는다(판 1.4.0).
// 카드 수·분류 수는 데이터 파일(content/parts/parts.yaml)에서 읽으므로 사진을 더해도 이 검사는 그대로다.
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PARTS_FILE, PART_CATEGORIES, parsePartsYaml } from '../../src/components/parts/parts-schema.ts';
import { getPage } from '../../src/config/nav.ts';

const parts = parsePartsYaml(fs.readFileSync(PARTS_FILE, 'utf8'));
const PARTS_PAGE = getPage('start-parts');
const PARTS_URL = `.${PARTS_PAGE.path}`;
const KIT_ROW_COUNT = 16;

/** 페이지에서 난 자바스크립트 오류를 모은다. */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/** 첫 줄에서 서로 다른 왼쪽 위치(= 열 수)를 센다. */
async function columnCountOf(page: Page, selector: string): Promise<number> {
  return page.evaluate((cardSelector) => {
    const cards = [...document.querySelectorAll(cardSelector)];
    const firstTop = cards[0]?.getBoundingClientRect().top ?? 0;
    const lefts = new Set(cards.filter((card) => Math.abs(card.getBoundingClientRect().top - firstTop) < 2).map((card) => Math.round(card.getBoundingClientRect().left)));
    return lefts.size;
  }, selector);
}

test.describe('부품 사전 쪽', () => {
  test('200으로 열리고 제목 "부품 사전"·출처 줄·카드 수·가로 넘침 없음·스크립트 오류 없음', async ({ page }) => {
    const errors = collectPageErrors(page);
    const response = await page.goto(PARTS_URL);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(new RegExp(`^${PARTS_PAGE.title} \\| `, 'u'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(PARTS_PAGE.title);
    expect(await page.evaluate(() => document.querySelectorAll('h1').length)).toBe(1);
    await expect(page.getByText('부품 사진: 고릴라셀(브릭셀) 제공, 허락받아 사용')).toBeVisible();
    await expect(page.locator('.parts-card')).toHaveCount(parts.length);
    // 현재 위치: 홈 › 시작하기 › 부품 사전
    await expect(page.getByRole('navigation', { name: '현재 위치' }).locator('li')).toHaveText(['홈', getPage('start').label, PARTS_PAGE.label]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('분류 칩은 같은 쪽의 분류 제목으로 가는 링크이고(JS 없이도), 분류마다 카드 수가 맞다', async ({ page }) => {
    await page.goto(PARTS_URL);
    const chips = page.getByRole('navigation', { name: '부품 분류' }).getByRole('link');
    await expect(chips).toHaveCount(PART_CATEGORIES.length);
    for (const category of PART_CATEGORIES) {
      const expected = parts.filter((part) => part.category === category.id).length;
      const chip = chips.filter({ hasText: category.label });
      await expect(chip).toHaveAttribute('href', `#cat-${category.id}`);
      await expect(chip).toContainText(`${expected}개`);
      const section = page.locator(`section#cat-${category.id}`);
      await expect(section.getByRole('heading', { level: 2, name: category.label })).toBeVisible();
      await expect(section.locator('.parts-card')).toHaveCount(expected);
    }
    // 칩을 누르면 그 분류 제목으로 이동한다
    await chips.filter({ hasText: '모터·구동' }).click();
    await expect(page).toHaveURL(/#cat-motor$/u);
    await expect(page.locator('section#cat-motor')).toBeInViewport();
  });

  test('카드: 사진(alt·크기·lazy)·이름·영어 이름·연결 방식, 교과서 키트 표시, 가상 보드 링크, 안내 한 줄', async ({ page }) => {
    await page.goto(PARTS_URL);
    const ultrasonic = page.locator('#part-d-007-ultrasonic-sensor');
    await expect(ultrasonic.getByRole('heading', { level: 3, name: '초음파 센서(세로형)' })).toBeVisible();
    await expect(ultrasonic.locator('[lang="en"]')).toHaveText('Ultrasonic Sensor (HC-SR04 type)');
    await expect(ultrasonic).toContainText('연결 방식');
    await expect(ultrasonic).toContainText('디지털 입출력');
    const photo = ultrasonic.getByRole('img', { name: '초음파 센서(세로형) 사진' });
    await expect(photo).toHaveAttribute('loading', 'lazy');
    await expect(photo).toHaveAttribute('width', /^\d+$/u);
    await expect(photo).toHaveAttribute('height', /^\d+$/u);
    await photo.scrollIntoViewIfNeeded();
    await expect.poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    // 교과서 키트 표시와 가상 보드 링크는 데이터의 kit_name·site_part를 따른다
    await expect(page.locator('.parts-card__badge')).toHaveCount(parts.filter((part) => part.kitName !== undefined).length);
    const lab = getPage('labs-esp32');
    const tryLinks = page.locator('.parts-card__try a');
    await expect(tryLinks).toHaveCount(parts.filter((part) => part.siteParts.length > 0).length);
    await expect(tryLinks.first()).toHaveAttribute('href', lab.href);
    await expect(page.locator('#part-dis-001-i2c-1602-lcd').getByRole('link', { name: '가상 보드에서 해 보기: 문자 LCD 16×2(I2C)' })).toHaveAttribute('href', lab.href);

    // 판이 다를 수 있는 부품에는 안내가 붙는다
    await expect(page.locator('#part-o-002-mp3-player-kt403a')).toContainText('키트에 따라 모양이 다를 수 있어요');
    await expect(page.locator('#part-board-003-esp32-shield-v3')).toContainText('V3');
  });

  test('열 수: 휴대폰(375px)은 2열, 넓은 화면(1366px)은 5열이고 사진이 모두 칸 안에 들어온다', async ({ page, isMobile }) => {
    await page.goto(PARTS_URL);
    expect(await columnCountOf(page, '#cat-analog-sensor .parts-card')).toBe(isMobile ? 2 : 5);
    const outside = await page.evaluate(() =>
      [...document.querySelectorAll('.parts-card__photo img')].filter((image) => {
        const box = image.getBoundingClientRect();
        const card = image.closest('.parts-card')!.getBoundingClientRect();
        return box.right > card.right + 1 || box.left < card.left - 1;
      }).length,
    );
    expect(outside).toBe(0);
  });

  test('사진 파일이 모두 열린다(깨진 그림 없음)', async ({ page, request }) => {
    await page.goto(PARTS_URL);
    const sources = await page.locator('.parts-card__photo img').evaluateAll((images) => images.map((image) => (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src));
    expect(sources).toHaveLength(parts.length);
    const failures: string[] = [];
    for (const source of sources) {
      const response = await request.get(source);
      if (!response.ok() || !(response.headers()['content-type'] ?? '').includes('image/webp')) failures.push(source);
    }
    expect(failures).toEqual([]);
  });
});

test.describe('보드 준비 쪽 키트 표의 사진 칸', () => {
  test('사진 칸이 있고 줄 수는 16 그대로이며, 사진 없는 줄은 "사진 없음", 부품 사전으로 가는 링크가 있다', async ({ page }) => {
    await page.goto(getPage('start-board').href);
    const details = page.locator('details[data-kit-parts-details]');
    await details.locator('summary').click();
    const table = page.getByRole('table', { name: /키트 부품 이름과 범용 부품 이름/u });
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(KIT_ROW_COUNT);
    await expect(table.getByRole('columnheader', { name: '사진' })).toBeVisible();
    const kitPhotoCount = parts.filter((part) => part.kitName !== undefined).length;
    await expect(table.locator('.kit-table__photo img')).toHaveCount(kitPhotoCount);
    await expect(table.getByText('사진 없음')).toHaveCount(KIT_ROW_COUNT - kitPhotoCount);
    // 사진 하나: alt가 있고, 누르면 부품 사전의 그 카드로 간다
    const lcdRow = table.locator('tbody tr', { has: page.getByRole('rowheader', { name: /^LCD\(2x16\)/u }) });
    const lcdPhoto = lcdRow.getByRole('img', { name: '문자 LCD 16×2(I2C) 사진' });
    await lcdPhoto.scrollIntoViewIfNeeded();
    await expect.poll(() => lcdPhoto.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(lcdRow.getByRole('link', { name: '문자 LCD 16×2(I2C) 사진' })).toHaveAttribute('href', /\/start\/parts\/#part-dis-001-i2c-1602-lcd$/u);
    // 표 가까이의 "부품 사전에서 모두 보기" 링크
    await expect(details.getByRole('link', { name: '부품 사전에서 모두 보기' })).toHaveAttribute('href', /\/start\/parts\/$/u);
  });
});

test.describe('3-1-2 차시의 USB-UART 변환기 사진', () => {
  test('새 부품 사진(c-007)이 뜨고 옛 그림 주소는 없다', async ({ page }) => {
    await page.goto('./learn/u3/3-1-2/');
    // 본문 그림(figure) 하나 + 머리 칸 아래 준비물 사진 줄(판 1.4.0 C4)에도 같은 사진이 작게 있다 — 본문 그림만 본다
    const figure = page.locator('figure', { has: page.locator('img[src$="/images/parts/third-party/kit-vendor/c-007-usb-to-uart-converter.webp"]') });
    const photo = figure.locator('img');
    await expect(figure).toHaveCount(1);
    await expect(photo).toHaveCount(1);
    await expect(photo).toHaveAttribute('alt', /USB-UART 변환기 사진$/u);
    await photo.scrollIntoViewIfNeeded();
    await expect.poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator('img[src*="3-1-2/third-party/kit-vendor/usb-uart-converter"]')).toHaveCount(0);
    // 사진 옆 설명에 "키트에 따라 모양이 다를 수 있어요"
    await expect(figure).toContainText('키트에 따라 모양이 다를 수 있어요');
  });
});

// 준비물 사진 줄(판 1.4.0 C4): 웹 차시와 교과서 쪽 머리에 그 차시가 쓰는 부품의 실제 사진이 줄로 보인다. 부품이 없는 차시(영상 처리)는 줄이 없다.
test.describe('준비물 사진 줄', () => {
  for (const path of ['./learn/u2/2-1-2/', './book/2-1-2/']) {
    test(`${path}: 문자 LCD·터치 센서 사진이 부품 사전 카드로 이어진다`, async ({ page }) => {
      await page.goto(path);
      const strip = page.getByRole('group', { name: '준비물 사진' });
      await expect(strip).toBeVisible();
      const links = strip.getByRole('link');
      expect(await links.count()).toBeGreaterThanOrEqual(2);
      for (const link of await links.all()) {
        await expect(link).toHaveAttribute('href', /\/start\/parts\/#part-[a-z0-9-]+$/u);
        await expect(link.locator('img')).toHaveAttribute('alt', '');
        expect((await link.textContent())?.trim().length, '부품 이름 글자').toBeGreaterThan(0);
      }
      await expect(strip).toContainText('고릴라셀(브릭셀)');
      // 사진을 모두 받았다
      for (const image of await strip.locator('img').all()) {
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }
    });
  }

  test('부품이 없는 차시(영상 처리 1-1-2)에는 줄이 없다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-2/');
    await expect(page.getByRole('group', { name: '준비물 사진' })).toHaveCount(0);
  });

  test('모든 쪽 바닥글에 교과서·부품 사진 출처 줄이 있다(차시·교과서 쪽·부품 사전)', async ({ page }) => {
    for (const path of ['./learn/u2/2-1-2/', './book/2-1-2/', `.${PARTS_PAGE.path}`]) {
      await page.goto(path);
      await expect(page.locator('[data-site-credit]'), path).toContainText('교과서: 「인공지능과 피지컬 컴퓨팅」(금성출판사, 김석전·박상진·김승현·김영준·육동건)');
      await expect(page.locator('[data-site-credit]'), path).toContainText('부품 사진·회로 그림·키트 예제 코드: 고릴라셀(브릭셀) 제공, 허락받아 사용.');
    }
  });
});
