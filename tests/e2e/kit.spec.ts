// 키트 장치 도감(/labs/esp32/kit/)과 장치 쪽(/labs/esp32/kit/<id>/), 부품 사전의 "예제 보기" 링크, 예제 갤러리의 키트 상자 브라우저 테스트(판 1.5.0 구역 K3b, DECISIONS O19·C155).
// 실행: npx playwright test tests/e2e/kit.spec.ts (빌드 후 미리 보기 서버를 띄운다, playwright.config.ts). desktop(1366×768)과 mobile(375×812) 두 화면에서 돈다.
// 병렬 제작: PW_BASE_URL=http://localhost:4954/ai-physical-computing/ npx playwright test tests/e2e/kit.spec.ts
// 개수·이름·배선·코드는 모두 데이터 파일(content/kit/devices.yaml)과 예제 파일에서 읽으므로 장치를 더해도 이 검사는 그대로다.
// 실습실 쪽 동작(키트 예제를 열어 돌리기)은 K3a의 검사가 맡고, 여기서는 [실습실에서 열기] 링크의 주소와 그 쪽이 열리는지(200)까지만 본다.
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { KIT_FILE, parseKitYaml } from '../../src/components/kit/kit-schema.ts';
import { chapterGroups, deviceTitle, kitCodeLines, kitDeviceHref, kitIndexHref, stepLabHref } from '../../src/components/kit/kit-view.ts';
import { PARTS_FILE, parsePartsYaml } from '../../src/components/parts/parts-schema.ts';
import { getPage } from '../../src/config/nav.ts';
import { closeSideMenuBeforeLoad, menuOutline } from './helpers/side-menu.ts';

const data = parseKitYaml(fs.readFileSync(KIT_FILE, 'utf8'));
const parts = parsePartsYaml(fs.readFileSync(PARTS_FILE, 'utf8'));
const KIT_PAGE = getPage('labs-esp32-kit');
const KIT_URL = `.${KIT_PAGE.path}`;
const groups = chapterGroups(data);
const device = (id: string) => {
  const found = data.devices.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`장치 ${id}이(가) 데이터에 없어요.`);
  }
  return found;
};
/** 쪽 주소(사이트 지도의 쪽 아래 — base 뒤 상대 경로) */
const deviceUrl = (id: string) => `.${KIT_PAGE.path}${id}/`;

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

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('키트 장치 도감 첫 쪽', () => {
  test('200으로 열리고 제목·소개(장치 수)·출처 줄·현재 위치·가로 넘침 없음·스크립트 오류 없음', async ({ page }) => {
    const errors = collectPageErrors(page);
    const response = await page.goto(KIT_URL);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(new RegExp(`^${KIT_PAGE.title} \\| `, 'u'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(KIT_PAGE.title);
    expect(await page.evaluate(() => document.querySelectorAll('h1').length)).toBe(1);
    await expect(page.locator('.lead')).toContainText(`장치 ${data.devices.length}개를 사진, 배선, 회로 그림, 예제 코드로`);
    await expect(page.locator('[data-kit-credit]')).toHaveText('장치 사진·회로 그림·예제 코드: 고릴라셀(브릭셀) 제공, 허락받아 사용');
    // 홈 › 실습실 › ESP32 실습실 › 키트 장치 도감
    await expect(page.getByRole('navigation', { name: '현재 위치' }).locator('li')).toHaveText(['홈', getPage('labs').label, getPage('labs-esp32').label, KIT_PAGE.label]);
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test('범례: 가상 보드 딱지 세 가지(가상 보드로 바로 · 일부만 가상 · 실제 보드에서 해 보세요)가 글자로 풀이와 함께 있다', async ({ page }) => {
    await page.goto(KIT_URL);
    const legend = page.getByRole('region', { name: '카드의 딱지는 이런 뜻이에요' });
    await expect(legend.locator('[data-kit-virtual]')).toHaveCount(3);
    await expect(legend.locator('[data-kit-virtual="full"]')).toHaveText('가상 보드로 바로');
    await expect(legend.locator('[data-kit-virtual="partial"]')).toHaveText('일부만 가상');
    await expect(legend.locator('[data-kit-virtual="real-only"]')).toHaveText('실제 보드에서 해 보세요');
    await expect(legend).toContainText('보드가 없어도 실습실의 가상 보드에서 끝까지 돌려 볼 수 있어요.');
  });

  test('장 칩은 같은 쪽의 장으로 가는 링크이고(JS 없이도), 장마다 장치 카드 수가 맞다', async ({ page }) => {
    await page.goto(KIT_URL);
    const chips = page.getByRole('navigation', { name: '장 목록' }).getByRole('link');
    await expect(chips).toHaveCount(1 + groups.length);
    // 1장 시작하기 — 코드 개수는 데이터에서 센다
    await expect(chips.first()).toContainText(`1장 ${data.chapters[0]!.name}`);
    await expect(chips.first()).toContainText(`${data.intro.length}개`);
    await expect(chips.first()).toHaveAttribute('href', '#ch-1');
    for (const group of groups) {
      const chip = chips.filter({ hasText: `${group.chapter.n}장 ${group.chapter.name}` });
      await expect(chip).toHaveAttribute('href', `#ch-${group.chapter.n}`);
      await expect(chip).toContainText(`${group.devices.length}개`);
      const section = page.locator(`section#ch-${group.chapter.n}`);
      await expect(section.getByRole('heading', { level: 2, name: `${group.chapter.n}장 ${group.chapter.name}` })).toBeVisible();
      await expect(section).toContainText(group.description);
      await expect(section.locator('.kit-card')).toHaveCount(group.devices.length);
    }
    await expect(page.locator('.kit-card')).toHaveCount(data.devices.length);
    // 칩을 누르면 그 장 제목으로 이동한다
    await chips.filter({ hasText: '6장 모터' }).click();
    await expect(page).toHaveURL(/#ch-6$/u);
    await expect(page.locator('section#ch-6')).toBeInViewport();
  });

  test('1장 시작하기: 코드마다 번호·이름·가상 표시와 [실습실에서 열기](?example= 주소)가 있다', async ({ page, request }) => {
    await page.goto(KIT_URL);
    const rows = page.locator('[data-kit-intro]');
    await expect(rows).toHaveCount(data.intro.length);
    for (const [index, item] of data.intro.entries()) {
      const row = rows.nth(index);
      await expect(row).toContainText(item.number);
      await expect(row).toContainText(item.title);
      await expect(row).toContainText(item.sub);
      await expect(row.locator('[data-kit-virtual]')).toHaveAttribute('data-kit-virtual', item.virtual);
      await expect(row.getByRole('link', { name: `실습실에서 열기: ${item.number} ${item.title}, ${item.sub}` })).toHaveAttribute('href', stepLabHref(item.file));
    }
    const first = data.intro[0]!;
    expect((await request.get(stepLabHref(first.file))).status()).toBe(200);
  });

  test('장치 카드: 번호·이름이 한 링크이고 연결 방식·가상 표시가 있다. 카드를 누르면 그 장치 쪽으로 간다', async ({ page }) => {
    await page.goto(KIT_URL);
    const sample = device('d-3-11');
    const card = page.locator('[data-kit-card="d-3-11"]');
    const link = card.getByRole('link', { name: deviceTitle(sample), exact: true });
    await expect(link).toHaveAttribute('href', kitDeviceHref('d-3-11'));
    // 카드에는 괄호 풀이 없는 짧은 연결 방식(장치 쪽 표에는 풀이가 있다)
    await expect(card.locator('.kit-card__connection')).toHaveText('디지털');
    await expect(card.locator('[data-kit-virtual]')).toHaveText('실제 보드에서 해 보세요');
    // 휴대폰에서도 카드 전체가 눌린다(덮개) — 설명 자리를 눌러도 같은 주소
    await card.scrollIntoViewIfNeeded();
    const topmost = await card.locator('.kit-card__connection').evaluate((element) => {
      element.scrollIntoView({ block: 'center' });
      const rect = element.getBoundingClientRect();
      return document.elementFromPoint(rect.left + 4, rect.top + 4)?.closest('a')?.getAttribute('href') ?? '';
    });
    expect(topmost).toBe(kitDeviceHref('d-3-11'));
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${KIT_PAGE.path}d-3-11/$`, 'u'));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('초음파 센서');
  });

  test('열 수: 휴대폰(375px)은 2열, 넓은 화면(1366px)은 5열이고 사진은 모두 칸 안에 들어온다(lazy)', async ({ page, isMobile }) => {
    await page.goto(KIT_URL);
    expect(await columnCountOf(page, '#ch-3 .kit-card')).toBe(isMobile ? 2 : 5);
    const photo = page.locator('[data-kit-card="d-3-01"] img');
    await expect(photo).toHaveAttribute('loading', 'lazy');
    await expect(photo).toHaveAttribute('width', /^\d+$/u);
    await expect(photo).toHaveAttribute('height', /^\d+$/u);
    await photo.scrollIntoViewIfNeeded();
    await expect.poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const outside = await page.evaluate(() =>
      [...document.querySelectorAll('.kit-card__photo img')].filter((image) => {
        const box = image.getBoundingClientRect();
        const card = image.closest('.kit-card')!.getBoundingClientRect();
        return box.right > card.right + 1 || box.left < card.left - 1;
      }).length,
    );
    expect(outside).toBe(0);
  });

  test('사진 파일이 모두 열린다(깨진 그림 없음)', async ({ page, request }) => {
    await page.goto(KIT_URL);
    const sources = await page.locator('.kit-card__photo img').evaluateAll((images) => images.map((image) => (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src));
    expect(sources).toHaveLength(data.devices.length);
    const failures: string[] = [];
    for (const source of new Set(sources)) {
      const response = await request.get(source);
      if (!response.ok() || !(response.headers()['content-type'] ?? '').includes('image/webp')) failures.push(source);
    }
    expect(failures).toEqual([]);
  });

  test('실습실 안내(/labs/)의 ESP32 카드에 "키트 장치 도감" 링크가 있다', async ({ page }) => {
    await page.goto(getPage('labs').href);
    const card = page.locator('.lab-card', { has: page.getByRole('heading', { level: 3, name: getPage('labs-esp32').title }) });
    await expect(card.locator('.lab-card__sub').getByRole('link', { name: KIT_PAGE.title, exact: true })).toHaveAttribute('href', KIT_PAGE.href);
  });
});

test.describe('장치 쪽 — 가상 보드로 바로 되는 장치(2.01 LED)', () => {
  const led = device('d-2-01');

  test('머리: 현재 위치·제목·영어 이름·설명·딱지, 스크립트 오류와 가로 넘침 없음', async ({ page }) => {
    const errors = collectPageErrors(page);
    const response = await page.goto(deviceUrl('d-2-01'));
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(new RegExp(`^${deviceTitle(led)} \\| `, 'u'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(deviceTitle(led));
    expect(await page.evaluate(() => document.querySelectorAll('h1').length)).toBe(1);
    await expect(page.locator('.kit-header__sub')).toContainText(led.nameEn);
    // 같은 부품을 부르는 이름은 하나(부품 사전 이름) — 브릭셀의 원래 이름은 부제로 남는다(판 1.6.0 C176)
    await expect(page.locator('.kit-header__sub [data-kit-brixel-name]')).toHaveText(`브릭셀 이름: ${led.brixelName}`);
    await expect(page.locator('.kit-header__desc')).toContainText(led.description.slice(0, 20));
    await expect(page.locator('.kit-header [data-kit-virtual]')).toHaveText('가상 보드로 바로');
    // 홈 › 실습실 › ESP32 실습실 › 키트 장치 도감 › 2장 디스플레이 › 2.01 LED
    await expect(page.getByRole('navigation', { name: '현재 위치' }).locator('li')).toHaveText([
      '홈',
      getPage('labs').label,
      getPage('labs-esp32').label,
      KIT_PAGE.label,
      `2장 ${data.chapters.find((chapter) => chapter.n === 2)!.name}`,
      deviceTitle(led),
    ]);
    await expect(page.getByRole('navigation', { name: '현재 위치' }).getByRole('link', { name: /^2장 / })).toHaveAttribute('href', kitIndexHref(2));
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });

  test('장치 정보: 사진(alt)·연결 방식·핀·GPIO(내부 부품 번호는 안 보인다), 부품 사전 링크, 같은 코드로 도는 다른 모양 세 가지', async ({ page }) => {
    await page.goto(deviceUrl('d-2-01'));
    const info = page.getByRole('region', { name: '장치 정보' });
    const photo = info.getByRole('img', { name: '빨간 LED 모듈 사진' });
    await expect.poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(info.getByRole('link', { name: '부품 사전에서 보기' })).toHaveAttribute('href', /\/start\/parts\/#part-dis-004-led-red$/u);
    const facts = info.locator('.kit-facts');
    await expect(facts).toContainText('연결 방식');
    await expect(facts).toContainText('디지털 / PWM(밝기·세기 조절)');
    await expect(facts).toContainText('핀 3개 (G, V, S)');
    await expect(facts).toContainText(led.gpio);
    // 내부 부품 번호(dis-004)는 개발자 말이라 장치 정보에서 뺐다(판 1.6.0 C176 — 걷기 보고 walk-kit-user 17)
    await expect(facts).not.toContainText('dis-004');
    await expect(facts).not.toContainText('부품 번호');
    await expect(facts).toContainText('따로 필요하지 않아요');
    const variants = info.locator('.kit-variants__item');
    await expect(variants).toHaveCount(led.partVariants.length);
    await expect(variants.first().getByRole('img', { name: `${led.partVariants[0]!.label} 사진` })).toBeVisible();
  });

  test('배선표(줄 수·열 이름)와 회로 그림(대체 글에 배선, [그림 크게 보기] 링크)', async ({ page }) => {
    await page.goto(deviceUrl('d-2-01'));
    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader')).toHaveText(['장치의 핀', '보드의 핀']);
    await expect(table.locator('tbody tr')).toHaveCount(led.wiring.length);
    await expect(table.locator('tbody tr').nth(0).locator('td')).toHaveText(['G', 'GND']);
    const figure = page.locator('figure.book-circuit');
    const image = figure.getByRole('img');
    // 대체 글도 부품 사전과 같은 이름으로 시작한다(판 1.6.0 C176 — "2.01 빨간 LED 모듈 회로 그림. …")
    await expect(image).toHaveAttribute('alt', `${deviceTitle(led)} 회로 그림. 연결: G는 GND, V는 3V3, S는 GPIO 4.`);
    await expect(image).toHaveAttribute('loading', 'lazy');
    await expect(image).toHaveAttribute('width', /^\d+$/u);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const zoom = figure.getByRole('link', { name: /그림 크게 보기/u });
    await expect(zoom).toBeVisible();
    await expect(zoom).toHaveAttribute('href', /\/images\/kit\/circuits\/third-party\/kit-vendor\/d-2-01\.webp$/u);
    await expect(figure).toContainText('고릴라셀(브릭셀)이 제공한 회로 그림이에요');
  });

  test('코드 두 단계: 브릭셀 코드 그대로·가상 표시·[실습실에서 열기](?example= 주소)', async ({ page, request }) => {
    await page.goto(deviceUrl('d-2-01'));
    for (const step of led.steps) {
      const section = page.locator(`[data-kit-step="${step.n}"]`);
      await expect(section.getByRole('heading', { level: 2 })).toHaveText(`${step.n}단계 · ${step.title}`);
      await expect(section).toContainText(step.kind);
      await expect(section.locator('[data-kit-virtual]')).toHaveText('가상 보드로 바로');
      await expect(section).toContainText('보드가 없어도 [실습실에서 열기]를 누르면 가상 보드에서 이 코드를 끝까지 돌려 볼 수 있어요.');
      await expect(section.locator('.kit-step__reason')).toHaveCount(0);
      for (const point of step.points) {
        await expect(section.locator('.kit-step__points li', { hasText: point.slice(0, 12) })).toHaveCount(1);
      }
      // 코드는 예제 파일 그대로(빈 줄은 빈칸 한 칸으로 그려져 있어 되돌려 견준다)
      const code = fs.readFileSync(path.join('examples', ...step.file.split('/')), 'utf8');
      const shown = await section.locator('pre.kit-code').evaluate((element) => element.textContent ?? '');
      expect(shown.replace(/^ $/gmu, '')).toBe(kitCodeLines(code).join('\n'));
      // 개발자 경로(examples/esp32/kit/…) 대신 파일 이름만(판 1.6.0 C176)
      await expect(section.locator('.kit-step__file')).toHaveText(`코드 파일: ${step.file.split('/').pop()}`);
      const open = section.getByRole('link', { name: `실습실에서 열기: ${deviceTitle(led)} ${step.n}단계` });
      await expect(open).toHaveAttribute('href', stepLabHref(step.file));
      await expect(open).toHaveText('실습실에서 열기');
      await expect(open).toHaveClass(/button--primary/u);
    }
    expect((await request.get(stepLabHref(led.steps[0]!.file))).status()).toBe(200);
  });

  test('이전·다음 장치와 출처 줄', async ({ page }) => {
    await page.goto(deviceUrl('d-2-01'));
    const pager = page.getByRole('navigation', { name: '이전·다음 장치' });
    await expect(pager).toContainText('첫 번째 장치예요.');
    await expect(pager.getByRole('link', { name: /다음 장치/u })).toHaveAttribute('href', kitDeviceHref('d-2-02'));
    await expect(pager.getByRole('link', { name: '키트 장치 도감 첫 쪽으로' })).toHaveAttribute('href', kitIndexHref());
    const source = page.locator('[data-kit-source]');
    await expect(source).toContainText('장치 사진·회로 그림·예제 코드: 고릴라셀(브릭셀) 제공, 허락받아 사용.');
    await expect(source.getByRole('link', { name: /브릭셀의 원래 쪽/u })).toHaveAttribute('href', `${data.source.url}#d-2-01`);
    await expect(page.locator('[data-site-credit]')).toContainText('부품 사진·회로 그림·키트 예제 코드: 고릴라셀(브릭셀, 실습 키트 제조사) 제공, 허락받아 사용.');
  });
});

test.describe('장치 쪽 — 실제 보드에서 해 보는 장치(3.11 초음파 센서)', () => {
  const sonar = device('d-3-11');

  test('딱지·까닭·보드 준비 안내·라이브러리 상태(사이트가 싣고 있어요)', async ({ page }) => {
    await page.goto(deviceUrl('d-3-11'));
    await expect(page.locator('.kit-header [data-kit-virtual]')).toHaveText('실제 보드에서 해 보세요');
    // 딱지가 끝난 문장이고, 첫 화면에 뜻이 한 줄로 풀려 있다(걷기 보고 walk-kit-user 2)
    await expect(page.locator('[data-kit-virtual-explain]')).toContainText('가상 보드에는 아직 이 장치가 없어요');
    // 연결 방식은 부품 사전과 같은 말(판 1.6.0 C176 — 걷기 보고 walk-kit-user B-69)
    await expect(page.locator('.kit-facts')).toContainText('디지털 입출력(TRIG 보내기·ECHO 받기)');
    // "보드 준비하기" 링크는 쪽 한 곳(머리)에만 — 전에는 단계마다·출처 줄에도 있어 한 쪽에 세 번이었다(걷기 보고 walk-kit-user 20, 판 1.6.0 C176)
    const board = getPage('start-board');
    await expect(page.locator('#lesson-article').getByRole('link', { name: board.title, exact: true })).toHaveCount(1);
    await expect(page.locator('.kit-header [data-kit-virtual-explain]').getByRole('link', { name: board.title, exact: true })).toHaveAttribute('href', board.href);
    for (const step of sonar.steps) {
      const section = page.locator(`[data-kit-step="${step.n}"]`);
      await expect(section.locator('[data-kit-virtual]')).toHaveText('실제 보드에서 해 보세요');
      await expect(section).toContainText('이 코드는 실제 키트로 해 봐요.');
      await expect(section.locator('.kit-step__reason')).toContainText(sonar.virtualReason!);
      // 가상으로 끝까지 안 되는 단계는 코드 열기가 보조 단추다
      const open = section.getByRole('link', { name: `실습실에서 코드 열기: ${deviceTitle(sonar)} ${step.n}단계` });
      await expect(open).toHaveAttribute('href', stepLabHref(step.file));
      await expect(open).toHaveClass(/button--secondary/u);
    }
    const libs = page.locator('[data-kit-library]');
    await expect(libs).toHaveCount(sonar.libraries.length);
    await expect(libs.first()).toContainText('hcsr04.py — 이 사이트가 싣고 있어요');
    await expect(page.locator('.kit-info__help')).toContainText('실습실이 저절로 가져다 써요');
    await expect(page.locator('.kit-info__help')).not.toContainText('브릭셀에서 받아');
  });

  test('이전·다음 장치는 3.10과 3.12다', async ({ page }) => {
    await page.goto(deviceUrl('d-3-11'));
    const pager = page.getByRole('navigation', { name: '이전·다음 장치' });
    await expect(pager.getByRole('link', { name: /이전 장치/u })).toHaveAttribute('href', kitDeviceHref('d-3-10'));
    await expect(pager.getByRole('link', { name: /다음 장치/u })).toHaveAttribute('href', kitDeviceHref('d-3-12'));
    await pager.getByRole('link', { name: /다음 장치/u }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(deviceTitle(device('d-3-12')));
  });

  test('사이트가 싣지 않는 라이브러리는 "브릭셀에서 받기" 바깥 링크로 안내한다(3.21 지문 센서)', async ({ page }) => {
    await page.goto(deviceUrl('d-3-21'));
    const item = page.locator('[data-kit-library="pyfingerprint.py"]');
    await expect(item).toContainText('이 사이트에는 없어요');
    const link = item.getByRole('link', { name: /브릭셀에서 받기/u });
    await expect(link).toHaveAttribute('href', /^https:\/\/brixel\.gorillacell\.kr\/07_thonny\/03_esp32\/downloads\/libs\//u);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/u);
    await expect(page.locator('.kit-info__help')).toContainText('브릭셀에서 받아 실제 보드에 올려야 해요');
    await expect(page.locator('.kit-header__note')).toContainText('사용 조건이 사이트에 싣기에 맞지 않아');
  });
});

test.describe('장치 쪽 — 코드가 위, 배선은 아래 · LCD 줄 · 회로 그림 크게 보기(판 1.6.0 C176)', () => {
  const sonar = device('d-3-11');

  test('사진·장치 정보 → 1·2단계 코드와 [실습실에서 열기] → 배선표 → 회로 그림 순서이고, 첫 [실습실에서 열기]가 쪽 위에서 멀지 않다(예전 2,600px)', async ({ page, isMobile }) => {
    await page.goto(deviceUrl('d-3-11'));
    const tops = await page.evaluate(() => {
      const y = (selector: string) => Math.round((document.querySelector(selector)?.getBoundingClientRect().top ?? -1) + window.scrollY);
      return { info: y('#kit-info-title'), open1: y('[data-kit-open="1"]'), open2: y('[data-kit-open="2"]'), wiring: y('#kit-wiring-title'), circuit: y('#kit-circuit-title') };
    });
    expect(tops.info).toBeGreaterThan(0);
    expect(tops.open1).toBeGreaterThan(tops.info);
    expect(tops.open2).toBeGreaterThan(tops.open1);
    expect(tops.wiring).toBeGreaterThan(tops.open2);
    expect(tops.circuit).toBeGreaterThan(tops.wiring);
    expect(tops.open1, `첫 [실습실에서 열기] 위치 ${tops.open1}px`).toBeLessThan(isMobile ? 2300 : 1400);
    // 단추가 그 단계의 코드 상자 위에 있다
    for (const n of [1, 2]) {
      const section = page.locator(`[data-kit-step="${n}"]`);
      const open = await section.locator(`[data-kit-open="${n}"]`).boundingBox();
      const code = await section.locator('pre.kit-code').boundingBox();
      expect(open!.y, `${n}단계 단추가 코드 위`).toBeLessThan(code!.y);
    }
  });

  test('쪽 위 "이 쪽의 차례" 알약 링크: 1단계·2단계 코드·배선표·회로 그림 자리로 간다', async ({ page }) => {
    await page.goto(deviceUrl('d-3-11'));
    const jump = page.getByRole('navigation', { name: '이 쪽의 차례' });
    await expect(jump.getByRole('link')).toHaveText(['1단계 코드', '2단계 코드', '배선표', '회로 그림']);
    await expect(jump.getByRole('link', { name: '1단계 코드' })).toHaveAttribute('href', '#step-1');
    await expect(jump.getByRole('link', { name: '2단계 코드' })).toHaveAttribute('href', '#step-2');
    await expect(jump.getByRole('link', { name: '배선표' })).toHaveAttribute('href', '#kit-wiring-title');
    await expect(jump.getByRole('link', { name: '회로 그림' })).toHaveAttribute('href', '#kit-circuit-title');
    await jump.getByRole('link', { name: '배선표' }).click();
    await expect(page.locator('#kit-wiring-title')).toBeInViewport();
  });

  test('"LCD도 필요해요" 줄: 코드가 I2cLcd를 쓰는 장치(3.11)에만 — LCD 장치(2.05)와 LCD를 안 쓰는 장치에는 없다', async ({ page }) => {
    const usesLcdFile = (file: string) => /\bI2cLcd\b/u.test(fs.readFileSync(path.join('examples', ...file.split('/')), 'utf8'));
    await page.goto(deviceUrl('d-3-11'));
    const line = page.locator('[data-kit-lcd]');
    await expect(line).toBeVisible();
    await expect(line).toContainText('LCD도 필요해요.');
    await expect(line).toContainText('I2cLcd 줄에서 멈춰요');
    // 배선표에 LCD 줄이 있어 "배선표의 LCD 줄"이 맞다
    await expect(page.getByRole('table').locator('tbody tr', { hasText: 'LCD SDA' })).toHaveCount(1);
    // LCD 자신(2.05)은 LCD가 필요하다고 알리지 않는다
    await page.goto(deviceUrl('d-2-05'));
    await expect(page.locator('[data-kit-lcd]')).toHaveCount(0);
    // LCD를 안 쓰는 장치 하나(데이터에서 고른다)
    const noLcd = data.devices.find((item) => item.steps.every((step) => !usesLcdFile(step.file)))!;
    await page.goto(deviceUrl(noLcd.id));
    await expect(page.locator('[data-kit-lcd]')).toHaveCount(0);
  });

  test('회로 그림 아래 선 색 범례(글자)와 [그림 크게 보기]는 파일로 나가지 않고 이 쪽 안의 창이 열린다(닫기 단추·Esc, 초점 돌아옴)', async ({ page }) => {
    await page.goto(deviceUrl('d-3-11'));
    const legend = page.locator('[data-kit-circuit-legend]');
    await expect(legend).toContainText('선 색: 검정 = GND(접지) · 빨강 = VCC(전원) · 노랑·초록 = 신호선');
    const zoom = page.locator('figure.book-circuit').getByRole('link', { name: /그림 크게 보기/u });
    await expect(zoom).toHaveAttribute('data-figure-zoom', '');
    const urlBefore = page.url();
    await zoom.scrollIntoViewIfNeeded();
    await zoom.click();
    const dialog = page.locator('dialog.figure-zoom-dialog');
    await expect(dialog).toBeVisible();
    expect(page.url()).toBe(urlBefore);
    await expect(dialog.locator('img')).toHaveAttribute('src', /\/images\/kit\/circuits\/third-party\/kit-vendor\/d-3-11\.webp$/u);
    await expect(dialog.getByRole('button', { name: '닫기' })).toBeFocused();
    // 창 모양(figure-zoom.css) — 화면 가득
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 2);
    await dialog.getByRole('button', { name: '닫기' }).click();
    await expect(dialog).toBeHidden();
    await expect(zoom).toBeFocused();
    await zoom.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('회로 그림은 넓은 화면에서 더 크게(1366에서 760px 이상), 좁은 화면에서는 [그림 크게 보기]가 큰 단추이고 안내 줄이 있다(판 1.7.0, 미해결 264 #9)', async ({ page }, testInfo) => {
    await page.goto(deviceUrl('d-3-11'));
    await expect(page.locator('[data-kit-circuit-hint]')).toContainText('[그림 크게 보기]');
    const image = page.locator('figure.book-circuit img');
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const zoomBox = await page.locator('figure.book-circuit').getByRole('link', { name: /그림 크게 보기/u }).boundingBox();
    const imageBox = await image.boundingBox();
    if (testInfo.project.name === 'mobile') {
      // 단추는 칸 폭을 다 쓰고(눌러 보라고 눈에 띔) 높이도 손가락 크기(44px 안팎)
      expect(zoomBox!.width).toBeGreaterThanOrEqual(imageBox!.width - 4);
      expect(zoomBox!.height).toBeGreaterThanOrEqual(40);
    } else {
      // 전에는 본문 칸(44rem)에 맞춰 678px — 본문 칸을 52rem까지 넓혀 그림이 더 커졌다
      expect(imageBox!.width).toBeGreaterThanOrEqual(760);
    }
    await expectNoHorizontalOverflow(page);
  });

  test('메뉴판 안 장치 목록: 지금 장치가 메뉴판 칸 안에 보이고, 본문 칸의 같은 목록은 숨는다(판 1.9.0)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', '넓은 화면의 왼쪽 메뉴판');
    await page.goto(deviceUrl('d-3-11'));
    await expect(page.locator('[data-lesson-nav]')).toBeHidden();
    const menu = page.locator('#site-menu');
    const current = menuOutline(page).locator('[aria-current="page"]');
    await expect(current).toBeVisible();
    await expect(current).toHaveText(deviceTitle(device('d-3-11')));
    const menuBox = (await menu.boundingBox())!;
    const currentBox = (await current.boundingBox())!;
    expect(currentBox.y).toBeGreaterThanOrEqual(menuBox.y - 1);
    expect(currentBox.y + currentBox.height).toBeLessThanOrEqual(Math.min(menuBox.y + menuBox.height, page.viewportSize()!.height) + 1);
  });

  test('왼쪽 장치 목록은 맨 위가 잘리지 않고 시작한다: 지금 장치가 든 장 제목이 칸 안에 보인다(판 1.7.0, 미해결 264 #20 — 메뉴판을 접은 넓은 화면)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', '넓은 화면(64rem 이상)의 왼쪽 목록만');
    await closeSideMenuBeforeLoad(page);
    await page.goto(deviceUrl('d-3-11'));
    const scroller = page.locator('[data-lesson-nav-scroll]');
    await expect(scroller).toBeVisible();
    const scrollerBox = await scroller.boundingBox();
    const title = page.locator('#nav-kit-ch-3');
    const current = page.locator('[data-lesson-nav-scroll] [aria-current="page"]');
    await expect(current).toBeVisible();
    const titleBox = await title.boundingBox();
    const currentBox = await current.boundingBox();
    // 장 제목과 지금 장치가 모두 스크롤 칸 안에 들어 있다(칸 위 끝에서 잘리지 않음)
    expect(titleBox!.y).toBeGreaterThanOrEqual(scrollerBox!.y - 1);
    expect(currentBox!.y + currentBox!.height).toBeLessThanOrEqual(scrollerBox!.y + scrollerBox!.height + 1);
  });

  test('3.11 쪽은 가로로 넘치지 않고 스크립트 오류도 없다', async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.goto(deviceUrl('d-3-11'));
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
    expect(sonar.brixelName).toBe('초음파 센서 (HC-SR04)');
    await expect(page.locator('[data-kit-brixel-name]')).toHaveText('브릭셀 이름: 초음파 센서 (HC-SR04)');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('3.11 초음파 센서 V2');
  });
});

test.describe('장치 쪽 — 일부만 가상인 장치(2.14 RGB 매트릭스)', () => {
  test('딱지 "일부만 가상"과 까닭이 보이고 [실습실에서 열기]는 큰 단추다', async ({ page }) => {
    const matrix = device('d-2-14');
    expect(matrix.virtual).toBe('partial');
    await page.goto(deviceUrl('d-2-14'));
    const section = page.locator('[data-kit-step="1"]');
    await expect(section.locator('[data-kit-virtual]')).toHaveText('일부만 가상');
    await expect(section).toContainText('가상 보드에서 이 코드는 돌지만, 그림으로 보이는 모습이 실제와 조금 달라요.');
    await expect(section.locator('.kit-step__reason')).toContainText(matrix.virtualReason!);
    await expect(section.getByRole('link', { name: /^실습실에서 열기: / })).toHaveClass(/button--primary/u);
  });
});

test.describe('장치 쪽 — 왼쪽 장치 목록', () => {
  test('메뉴판을 접은 넓은 화면은 왼쪽에 펼쳐 있고 지금 장치를 가리킨다. 좁은 화면은 접힌 상자(Tab 정지점 하나)이고 펼치면 같은 목록이다', async ({ page, isMobile }) => {
    await closeSideMenuBeforeLoad(page);
    await page.goto(deviceUrl('d-3-11'));
    const nav = page.locator('[data-lesson-nav]');
    const list = page.getByRole('navigation', { name: '키트 장치 목록' });
    if (isMobile) {
      await expect(nav).not.toHaveAttribute('data-wide', '');
      await expect(nav).not.toHaveJSProperty('open', true);
      await expect(nav.locator('summary')).toHaveText(/이 장의 장치 목록 펼치기/u);
      await nav.locator('summary').click();
    } else {
      await expect(nav).toHaveAttribute('data-wide', '');
      await expect(nav).toHaveJSProperty('open', true);
    }
    await expect(list.getByRole('link', { name: deviceTitle(device('d-3-11')), exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(list.getByRole('link', { name: deviceTitle(device('d-3-12')), exact: true })).toHaveAttribute('href', kitDeviceHref('d-3-12'));
    // 지금 장의 장치만 펼쳐 있고 다른 장은 도감 첫 쪽의 그 장으로 간다
    await expect(list.getByRole('link', { name: deviceTitle(device('d-3-01')), exact: true })).toBeVisible();
    await expect(list.getByRole('link', { name: deviceTitle(device('d-4-01')), exact: true })).toHaveCount(0);
    await expect(list.getByRole('link', { name: '4장 아날로그 센서' })).toHaveAttribute('href', kitIndexHref(4));
    await expect(list.getByRole('link', { name: '키트 장치 도감 첫 쪽' })).toHaveAttribute('href', kitIndexHref());
  });

  test('[본문으로 건너뛰기]는 목록을 건너뛰고 본문 글로 간다', async ({ page }) => {
    await page.goto(deviceUrl('d-3-11'));
    await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#lesson-article');
    await expect(page.locator('article#lesson-article')).toHaveAttribute('tabindex', '-1');
  });
});

test.describe('부품 사전의 "예제 보기" 링크', () => {
  test('부품 사진마다 그 사진을 쓰는 장치 쪽으로 가는 링크가 있고, 사진 하나가 두 장치를 쓰면 번호가 붙은 링크 둘이다', async ({ page }) => {
    await page.goto(getPage('start-parts').href);
    const ultrasonic = page.locator('#part-d-009-ultrasonic-sensor-v2');
    const sonarLink = ultrasonic.getByRole('link', { name: `예제 보기: ${deviceTitle(device('d-3-11'))}, 키트 장치 도감` });
    await expect(sonarLink).toHaveAttribute('href', kitDeviceHref('d-3-11'));
    await expect(sonarLink).toHaveText('예제 보기');
    // JDY-33 한 사진을 8.05와 8.06이 함께 쓴다
    const jdy = page.locator('#part-c-001-bluetooth-4-0-jdy33');
    await expect(jdy.getByRole('link', { name: /키트 장치 도감$/u })).toHaveCount(2);
    await expect(jdy.getByRole('link', { name: /^8\.05 예제 보기/u })).toHaveAttribute('href', kitDeviceHref('d-8-05'));
    await expect(jdy.getByRole('link', { name: /^8\.06 예제 보기/u })).toHaveAttribute('href', kitDeviceHref('d-8-06'));
    await expect(jdy.getByRole('link', { name: /^8\.05 예제 보기/u })).toHaveText('8.05 예제 보기');
    // LED 노랑·파랑·초록 사진도 2.01 LED로
    await expect(page.locator('#part-dis-005-led-yellow').getByRole('link', { name: /^예제 보기: 2\.01 / })).toHaveAttribute('href', kitDeviceHref('d-2-01'));
    // 링크가 있는 카드 수 = 장치가 쓰는 사진 수
    const used = new Set(data.devices.flatMap((item) => [item.part, ...item.partVariants.map((variant) => variant.part)]));
    expect(parts.filter((part) => used.has(part.id)).length).toBeGreaterThan(100);
    await expect(page.locator('.parts-card__kit')).toHaveCount(parts.filter((part) => used.has(part.id)).length);
    await expect(page.locator('.parts-help')).toContainText(KIT_PAGE.title);
  });
});

test.describe('예제 갤러리의 키트 상자', () => {
  const GALLERY = getPage('labs-gallery').href;

  async function openGallery(page: Page, query = ''): Promise<void> {
    await page.goto(`${GALLERY}${query}`);
    await expect(page.locator('[data-gallery]')).toHaveAttribute('data-gallery-ready', 'yes');
  }

  test('키트 예제는 맨 끝 접힌 상자 하나에 묶여 있고, 다른 예제 묶음에는 섞이지 않는다', async ({ page }) => {
    await openGallery(page);
    const box = page.locator('[data-gallery-kit]');
    await expect(box).toHaveCount(1);
    await expect(box).not.toHaveJSProperty('open', true);
    await expect(box.locator('summary')).toContainText('키트 장치 도감 예제');
    await expect(box.locator('[data-gallery-card]').first()).not.toBeVisible();
    // 접힌 상자 안의 링크는 접근성 트리에 없으므로 주소로 찾는다
    await expect(box.locator(`a[href="${KIT_PAGE.href}"]`)).toHaveText(KIT_PAGE.title);
    // 키트 파일의 카드는 모두 상자 안에 있다
    const outside = await page.locator('[data-gallery-card]').evaluateAll((cards) =>
      cards.filter((card) => (card.getAttribute('data-file') ?? '').startsWith('esp32/kit/') && !card.closest('[data-gallery-kit]')).length,
    );
    expect(outside).toBe(0);
    // 개수는 상자 안 카드 수와 같다
    const cardCount = await box.locator('[data-gallery-card]').count();
    await expect(box.locator('[data-gallery-kit-count]')).toHaveText(`${cardCount}개`);
    // 직접 열면 카드가 보이고, 닫으면 다시 접힌다
    await box.locator('summary').click();
    await expect(box.locator('[data-gallery-card]').first()).toBeVisible();
    await box.locator('summary').click();
    await expect(box).not.toHaveJSProperty('open', true);
  });

  test('낱말로 찾아 키트 카드가 나오면 저절로 펼쳐지고, 카드가 안 나오면 상자째 숨고, 조건을 지우면 다시 접힌다', async ({ page }) => {
    await openGallery(page);
    const box = page.locator('[data-gallery-kit]');
    const search = page.locator('[data-gallery-search]');
    await search.fill('초음파');
    await expect(box).toHaveJSProperty('open', true);
    await expect(box.locator('[data-gallery-card]:not([hidden])').first()).toBeVisible();
    await expect(box.locator('[data-gallery-card]:not([hidden]) .gallery-card__title').first()).toContainText('초음파');
    // 키트 카드에는 없는 낱말(교과서 1단원 예제)을 찾으면 상자가 사라진다
    await search.fill('1-2-1-flip');
    await expect(box).toBeHidden();
    // 조건을 지우면 처음처럼 접힌 상자
    await page.getByRole('button', { name: /고른 것 모두 지우기/u }).first().click();
    await expect(box).toBeVisible();
    await expect(box).not.toHaveJSProperty('open', true);
  });

  test('주소의 ?q= 로 열면 처음부터 펼쳐지고, 직접 닫으면 거르기가 바뀌어도 사용자 뜻을 따른다', async ({ page }) => {
    await openGallery(page, '?q=%EC%B4%88%EC%9D%8C%ED%8C%8C');
    const box = page.locator('[data-gallery-kit]');
    await expect(box).toHaveJSProperty('open', true);
    await box.locator('summary').click();
    await expect(box).not.toHaveJSProperty('open', true);
    await page.locator('[data-gallery-search]').fill('온습도');
    await expect(box).not.toHaveJSProperty('open', true);
  });

  test('주소의 #카드가 접힌 상자 안이면 펼쳐서 그 카드를 보여 준다', async ({ page }) => {
    await openGallery(page);
    const anchor = await page.locator('[data-gallery-kit] [data-gallery-card] h3[id]').first().getAttribute('id');
    expect(anchor).toBeTruthy();
    await page.goto(`${GALLERY}#${anchor}`);
    await expect(page.locator('[data-gallery]')).toHaveAttribute('data-gallery-ready', 'yes');
    await expect(page.locator('[data-gallery-kit]')).toHaveJSProperty('open', true);
    await expect(page.locator(`#${anchor}`)).toBeVisible();
  });

  test('가로 넘침이 없다', async ({ page }) => {
    await openGallery(page);
    await expectNoHorizontalOverflow(page);
  });
});
