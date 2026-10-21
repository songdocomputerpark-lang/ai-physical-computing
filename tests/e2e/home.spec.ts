// 홈 화면 브라우저 테스트(PLAN §8.1 P1-05 완료 기준, SPEC §5 홈 화면 요구, 판 1.4.0 출판본 교과서 흐름 — DECISIONS C132, 판 1.6.0 "3초 안에 네 가지" — C172·C173).
// playwright.config.ts의 두 화면 크기(desktop 1366×768, mobile 375×812)에서 모두 돈다.
//   ⓪ 안심 띠: 설치 없음·무료·보드 없어도 됨·카메라 영상은 내 컴퓨터 밖으로 안 나감 — 첫 화면에 보인다
//   ① 스크롤 없이 표지: 안심 띠·제목·한 줄 소개·사람별 큰 단추 3개(학생·선생님·키트)·"누가 만들었나"가 화면 안에 다 보이는지(C109·C172 — 휴대폰은 표지 그림이 단추 아래)
//   ② Tab 키만으로 큰 단추 3개에 닿는지(초점 테두리가 보이고 화면이 밀리지 않는지)
//   ③ 단원 카드(#units): 4장(단원 색·설명·처음 할 차시·편 수·[N단원 열기]), 카드 전체가 눌림, 진도 칠하기, 옛 차시 카드 목록이 없음
//   ④ 차례(#toc): 넓은 화면은 교과서 4·5쪽 그림 위 투명 링크, 좁은 화면은 단원별 접이식 절 목록(그림은 접힘)
//   ⑤ 스크롤 뒤 큰 검색·바로 가기 타일·원칙과 홈의 사이트 안 링크, 쪽 길이(휴대폰 6,000px 이하), 저장된 진도가 있을 때 이어서 하기 띠와 첫 번째 큰 단추
// 주소는 baseURL 기준 상대 경로('./')로 연다(앞에 /를 붙이면 base가 빠진다).
// 글과 주소는 src/components/home/home-content.ts와 출판본 차례(src/config/book-outline.ts)에서 읽으므로, 문구를 바꾸거나 교과서 쪽이 늘어도 이 파일은 고치지 않아도 된다.
import { expect, test, type Page } from '@playwright/test';
import { BOOK_OUTLINE_SECTIONS, bookSectionCount } from '../../src/config/book-outline.ts';
import { homeCover, homePrinciples, homeResume, homeSearch, homeShortcuts, homeToc, homeTrust, homeUnits } from '../../src/components/home/home-content.ts';
import { unitTitleOf } from '../../src/components/home/home-lessons.ts';
import { learnUnits } from '../../src/config/nav.ts';
import { PROGRESS_STORAGE_NAME } from '../../src/lib/progress.ts';
import { storageKey } from '../../src/lib/storage.ts';

/** P1-05 완료 기준 화면 크기. playwright.config.ts의 projects 이름·크기와 같아야 한다. */
const VIEWPORTS: Readonly<Record<string, { width: number; height: number }>> = {
  desktop: { width: 1366, height: 768 },
  mobile: { width: 375, height: 812 },
};

/** "큰 단추"로 보는 최소 높이(px). 사이트의 누르는 곳 최소 크기 44px보다 크게 잡았다. */
const LARGE_BUTTON_MIN_HEIGHT = 56;

/** 큰 단추 셋의 이름·순서(homeCoverActions) — 사람으로 나눈다: 학생 · 선생님 · 키트가 있어요 */
const ACTION_IDS = ['start', 'teacher', 'kit'] as const;
const ACTION_WHO = ['학생', '선생님', '키트가 있어요'] as const;
const ACTION_LABELS = [homeCover.startLabel, '수업 준비', '보드 켜기'] as const;

/** 홈 쪽 길이 한도(px). 판 1.5.0은 휴대폰 15,429px(같은 45편을 차례와 차시 카드로 두 번 보였다) — 판 1.6.0 목표 6,000px 이하(C172) */
const MOBILE_PAGE_MAX = 6000;
const DESKTOP_PAGE_MAX = 4500;

function expectedViewport(projectName: string): { width: number; height: number } {
  const viewport = VIEWPORTS[projectName];
  if (!viewport) {
    throw new Error(`홈 테스트에 없는 화면 크기 이름이에요: ${projectName}. VIEWPORTS에 크기를 적어요.`);
  }
  return viewport;
}

/** 문서가 화면 폭보다 얼마나 넓은지(px) */
function overflowX(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** 저장된 진도를 쪽을 열기 전에 심는다 */
async function seedProgress(page: Page, state: unknown): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        // 저장을 막은 브라우저
      }
    },
    { key: storageKey(PROGRESS_STORAGE_NAME), value: JSON.stringify(state) },
  );
}

/** 단원 카드 하나(1~4) */
function unitCard(page: Page, unit: number) {
  return page.locator('[data-home-unit]').nth(unit - 1);
}

test.describe('홈 안심 띠(맨 위)', () => {
  test('설치 없음 · 무료 · 보드 없어도 됨 · 카메라 영상은 내 컴퓨터 밖으로 안 나감 — 네 칸이 이 순서로 첫 화면에 보인다', async ({ page }, testInfo) => {
    const viewport = expectedViewport(testInfo.project.name);
    await page.goto('./');
    const trust = page.locator('[data-home-trust]');
    await expect(trust).toBeVisible();
    await expect(trust).toHaveAttribute('aria-label', homeTrust.label);
    const items = trust.locator('[data-trust]');
    await expect(items).toHaveCount(4);
    await expect(items).toHaveText(['설치 없음', '무료', '보드 없어도 됨', '카메라 영상은 내 컴퓨터 밖으로 안 나감']);
    for (const item of await items.all()) {
      await expect(item).toBeInViewport({ ratio: 1 });
      expect(await item.locator('svg[aria-hidden="true"]').count(), '아이콘은 꾸밈').toBe(1);
    }
    // 띠가 표지(제목) 바로 위에 있다
    const trustBox = (await trust.boundingBox())!;
    const titleBox = (await page.locator('#home-title').boundingBox())!;
    expect(trustBox.y + trustBox.height, '띠는 제목 위').toBeLessThanOrEqual(titleBox.y);
    expect(trustBox.y + trustBox.height).toBeLessThanOrEqual(viewport.height);
    // 눌리는 곳이 아니라서 초점을 받지 않는다(Tab 정류장 0)
    expect(await trust.locator('a, button, [tabindex]').count()).toBe(0);
  });
});

test.describe('홈 표지(스크롤 없이)', () => {
  test('안심 띠·제목·한 줄 소개·사람별 큰 단추 3개·"누가 만들었나"가 화면 안에 다 보인다', async ({ page }, testInfo) => {
    const viewport = expectedViewport(testInfo.project.name);
    expect(page.viewportSize()).toEqual(viewport);

    const response = await page.goto('./');
    expect(response?.status()).toBe(200);
    // 글꼴(Pretendard)을 다 받은 뒤의 줄 바꿈으로 잰다.
    await page.evaluate(() => document.fonts.ready);
    const main = page.getByRole('main');

    await expect(page.locator('[data-home-trust]')).toBeInViewport({ ratio: 1 });
    const title = main.getByRole('heading', { level: 1 });
    await expect(title).toHaveText(homeCover.titleLines.join(' '));
    await expect(title).toBeInViewport({ ratio: 1 });
    await expect(main.getByText(homeCover.lead)).toBeInViewport({ ratio: 1 });

    const actions = main.locator('[data-home-action]');
    await expect(actions).toHaveCount(ACTION_IDS.length);
    for (const [index, id] of ACTION_IDS.entries()) {
      const link = main.locator(`[data-home-action="${id}"]`);
      await expect(link, id).toContainText(ACTION_WHO[index]!);
      await expect(link, id).toContainText(ACTION_LABELS[index]!);
      await expect(link, id).toBeVisible();
      await expect(link, id).toBeInViewport({ ratio: 1 });
      const box = await link.boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.y, `${id} 단추 위 끝`).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height, `${id} 단추 아래 끝`).toBeLessThanOrEqual(viewport.height);
      expect(box!.height, `${id} 단추 높이`).toBeGreaterThanOrEqual(LARGE_BUTTON_MIN_HEIGHT);
    }
    // 단추가 가는 곳: 학생 = 1단원 첫 절의 따라 하기 쪽(코드·실습이 있는 쪽) · 선생님 = 교사용 시작하기 · 키트 = 보드 준비하기
    await expect(main.locator('[data-home-action="start"]')).toHaveAttribute('href', /\/learn\/u1\/1-1-1\/$/u);
    await expect(main.locator('[data-home-action="teacher"]')).toHaveAttribute('href', /\/start\/teacher\/$/u);
    await expect(main.locator('[data-home-action="kit"]')).toHaveAttribute('href', /\/start\/board\/$/u);

    // "누가 만들었나" 한 줄(저자 5명·금성출판사·부품 출처)이 375에서도 첫 화면 안에 있다
    for (const text of [homeCover.publisher, homeCover.authors.join('·'), homeCover.partsCredit]) {
      const credit = main.getByText(text, { exact: true });
      await expect(credit, text).toBeVisible();
      await expect(credit, text).toBeInViewport({ ratio: 1 });
    }

    expect(await page.evaluate(() => window.scrollY), '스크롤하지 않았다').toBe(0);
  });

  test('채운 파랑 주 단추는 첫 번째(학생) 하나뿐이다', async ({ page }) => {
    await page.goto('./');
    const backgrounds = await page.locator('[data-home-action]').evaluateAll((links) => links.map((link) => getComputedStyle(link).backgroundColor));
    const accent = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--color-accent)';
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    });
    expect(backgrounds.filter((color) => color === accent)).toHaveLength(1);
    expect(backgrounds[0]).toBe(accent);
  });

  test('알약은 데이터에서 센 수이고, 출판사·저자와 표지 그림이 있다', async ({ page }, testInfo) => {
    await page.goto('./');
    const main = page.getByRole('main');
    await expect(main.getByText(new RegExp(`^고등학교 · 교과서 ${bookSectionCount()}절 · 웹 차시 \\d+편$`, 'u'))).toBeVisible();
    // 교과서 절 수는 출판본 차례에서 센다
    expect(bookSectionCount()).toBe(BOOK_OUTLINE_SECTIONS.length);
    await expect(main.getByText(homeCover.publisher, { exact: true })).toHaveCount(1);
    await expect(main.getByText(homeCover.authors.join('·'), { exact: true })).toHaveCount(1);
    const image = main.getByRole('img', { name: homeCover.coverAlt });
    await expect(image).toBeVisible();
    const natural = await image.evaluate((element) => ({ width: (element as HTMLImageElement).naturalWidth, height: (element as HTMLImageElement).naturalHeight }));
    expect(natural.width, '표지 그림을 받았다').toBeGreaterThan(0);
    // 휴대폰은 표지 그림이 단추 아래, 넓은 화면은 단추 왼쪽
    const imageBox = (await image.boundingBox())!;
    const startBox = (await main.locator('[data-home-action="start"]').boundingBox())!;
    if (testInfo.project.name === 'mobile') {
      expect(imageBox.y, '표지 그림은 단추 아래').toBeGreaterThanOrEqual(startBox.y + startBox.height);
    } else {
      expect(imageBox.x + imageBox.width, '표지 그림은 단추 왼쪽').toBeLessThanOrEqual(startBox.x);
    }
  });

  test('Tab 키만으로 큰 단추 3개에 차례로 닿고, 초점 테두리가 보이며 화면이 밀리지 않는다', async ({ page }, testInfo) => {
    const viewport = expectedViewport(testInfo.project.name);
    await page.goto('./');

    const reached: string[] = [];
    for (let press = 0; press < 40 && reached.length < ACTION_IDS.length; press += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement) || !element.closest('main')) {
          return null;
        }
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          action: element.getAttribute('data-home-action'),
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
          top: rect.top,
          bottom: rect.bottom,
        };
      });
      if (!focused?.action) {
        continue;
      }
      reached.push(focused.action);
      expect(focused.outlineStyle, `${focused.action} 초점 테두리`).not.toBe('none');
      expect(focused.outlineWidth, `${focused.action} 초점 테두리 굵기`).toBeGreaterThanOrEqual(2);
      expect(focused.top, `${focused.action} 위 끝`).toBeGreaterThanOrEqual(0);
      expect(focused.bottom, `${focused.action} 아래 끝`).toBeLessThanOrEqual(viewport.height);
    }

    expect(reached, 'Tab으로 닿은 큰 단추(순서대로)').toEqual([...ACTION_IDS]);
    expect(await page.evaluate(() => window.scrollY), '초점이 옮겨 가도 스크롤되지 않았다').toBe(0);
  });
});

test.describe('홈 단원 카드(#units)', () => {
  test('"무엇을 배우나요?" 아래 단원 카드 4장: 단원 색·"N단원 이름"·한 줄 설명·편 수·처음 할 차시·[N단원 열기]', async ({ page }) => {
    await page.goto('./');
    const units = page.locator('[data-home-units]');
    await expect(units.getByRole('heading', { level: 2, name: homeUnits.heading, exact: true })).toBeVisible();
    await expect(units.getByText(homeUnits.lead)).toBeVisible();
    await expect(page.locator('[data-home-unit]')).toHaveCount(learnUnits.length);
    for (const unit of learnUnits) {
      const card = unitCard(page, unit.unit);
      await expect(card.getByRole('heading', { level: 3, name: `${unit.unit}단원 ${unitTitleOf(unit)}`, exact: true }), `${unit.unit}단원`).toBeVisible();
      await expect(card, `${unit.unit}단원`).toContainText(unit.description);
      await expect(card.locator('.units__count'), `${unit.unit}단원 편 수`).toHaveText(/^\d+편$/u);
      await expect(card.locator('.units__first'), `${unit.unit}단원 처음 할 차시`).toContainText(`${homeUnits.firstKicker} ${unit.unit}-1-1`);
      const open = card.getByRole('link', { name: `${unit.unit}단원 ${homeUnits.openLabel}`, exact: true });
      await expect(open, `${unit.unit}단원`).toHaveAttribute('href', new RegExp(`/learn/u${unit.unit}/$`, 'u'));
    }
    // 1단원에는 사이트가 더한 보충 차시가 있어 "그중 웹에서 더함 n편"이 글자로 보인다(알약이 아니다)
    await expect(unitCard(page, 1).locator('.units__extra')).toHaveText(/^그중 웹에서 더함 \d+편$/u);
  });

  test('45편 전체 목록은 홈에 한 번만: 옛 차시 카드 목록(차시 목록 제목·카드 45장·매체 칩)이 없고, 전체 목록 링크는 따라 하기로 간다', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('[data-home-lessons]')).toHaveCount(0);
    await expect(page.locator('[data-home-card]')).toHaveCount(0);
    await expect(page.locator('.hc-chip')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '차시 목록', exact: true })).toHaveCount(0);
    const all = page.locator('[data-home-units-all]');
    await expect(all).toHaveText(homeUnits.allLinkLabel);
    await expect(all).toHaveAttribute('href', /\/learn\/$/u);
  });

  test('카드 전체가 눌린다: 카드 빈 곳을 누르면 그 단원의 따라 하기 목록으로 간다', async ({ page }) => {
    await page.goto('./');
    const card = unitCard(page, 2);
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    // 카드 오른쪽 위 근처(빈 곳)를 누른다 — 단추 링크의 덮개가 카드 전체를 덮는다.
    await page.mouse.click(box.x + box.width - 12, box.y + 12);
    await expect(page).toHaveURL(/\/learn\/u2\/$/u);
  });

  test('Tab 정류장은 카드마다 [N단원 열기] 하나이고, 초점 테두리가 카드 둘레에 보인다', async ({ page }) => {
    await page.goto('./');
    const card = unitCard(page, 1);
    expect(await card.locator('a, button').count()).toBe(1);
    const link = card.getByRole('link');
    await link.focus();
    const outline = await link.evaluate((element) => {
      const after = getComputedStyle(element, '::after');
      return { style: after.outlineStyle, width: Number.parseFloat(after.outlineWidth) };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test('처음 온 사람에게는 진도 글이 보이지 않는다', async ({ page }) => {
    await page.goto('./');
    const head = unitCard(page, 1);
    await expect(head).toHaveAttribute('data-progress-ready', '');
    await expect(head).toHaveAttribute('data-progress-empty', '');
    await expect(head.locator('[data-progress-count]')).toBeHidden();
    await expect(head.getByRole('link')).toHaveText(`1단원 ${homeUnits.openLabel}`);
    await expect(page.locator('html')).not.toHaveAttribute('data-progress-has', '');
  });
});

test.describe('홈 차례(#toc)', () => {
  test('#toc 주소로 열면 같은 쪽의 차례로 간다', async ({ page }) => {
    await page.goto('./#toc');
    await expect(page.getByRole('heading', { level: 2, name: homeToc.heading, exact: true })).toBeInViewport();
  });

  test('넓은 화면: 교과서 차례 그림 두 장 위에 절마다 투명 링크가 있고, 이름(title·aria-label)과 주소가 있다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '그림 위 링크는 넓은 화면(48rem 이상) 전용 — 좁은 화면은 목록이 먼저');
    await page.goto('./');
    const figures = page.locator('[data-home-toc-figures]');
    await expect(figures).toBeVisible();
    // 판 1.6.0(C177): 그림 위 링크는 Tab 차례에서 빠지고, 키보드는 그림 아래 절 목록(단원별 접이식)을 쓴다 — 넓은 화면에도 목록이 보인다
    await expect(page.locator('[data-home-toc-list]')).toBeVisible();
    await expect(page.locator('[data-home-toc-details]')).toBeHidden();
    await expect(figures.locator('.toc__page')).toHaveCount(2);
    for (const image of await figures.getByRole('img').all()) {
      await image.scrollIntoViewIfNeeded();
      expect(await image.evaluate((element) => (element as HTMLImageElement).naturalWidth), '차례 그림을 받았다').toBeGreaterThan(0);
    }

    const spots = figures.locator('[data-toc-spot]');
    const count = await spots.count();
    // 모든 절에 갈 곳이 있으면 32개 — 교과서 쪽도 웹 차시도 없는 절(예: 4-2-3)은 링크를 만들지 않는다
    expect(count).toBeGreaterThanOrEqual(BOOK_OUTLINE_SECTIONS.length - 2);
    expect(count).toBeLessThanOrEqual(BOOK_OUTLINE_SECTIONS.length);
    const base = new URL(page.url()).pathname.replace(/\/$/u, '');
    for (const spot of await spots.all()) {
      const id = await spot.getAttribute('data-toc-spot');
      const label = await spot.getAttribute('aria-label');
      expect(label, `${id} aria-label`).toContain(id!);
      expect(await spot.getAttribute('title'), `${id} title`).toBe(label);
      expect(await spot.getAttribute('href'), `${id} 주소`).toMatch(new RegExp(`^${base}/(?:book|learn/u\\d)/[a-z0-9-]+/$`, 'u'));
      expect(await spot.textContent(), `${id}: 글자는 없다(투명 링크)`).toBe('');
      expect(await spot.getAttribute('tabindex'), `${id}: Tab 차례에서 뺀다(키보드는 절 목록)`).toBe('-1');
    }
  });

  test('넓은 화면: 링크를 올리면 칠과 테두리가 보이고, 키보드 초점도 보이며, 누르면 그 절로 간다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '그림 위 링크는 넓은 화면 전용');
    await page.goto('./');
    const spot = page.locator('[data-home-toc-figures] [data-toc-spot="2-1-2"]');
    await spot.scrollIntoViewIfNeeded();
    const before = await spot.evaluate((link) => ({ border: getComputedStyle(link).borderColor, background: getComputedStyle(link).backgroundColor }));
    expect(before.background, '평소에는 투명').toMatch(/rgba\(0, 0, 0, 0\)|transparent/u);
    await spot.hover();
    await expect
      .poll(async () => spot.evaluate((link) => getComputedStyle(link).backgroundColor), { message: '올리면 칠이 생긴다' })
      .not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/u);
    const hovered = await spot.evaluate((link) => getComputedStyle(link).borderColor);
    expect(hovered).not.toBe(before.border);

    await page.mouse.move(0, 0);
    await spot.focus();
    const outline = await spot.evaluate((link) => ({ style: getComputedStyle(link).outlineStyle, width: Number.parseFloat(getComputedStyle(link).outlineWidth) }));
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);

    await spot.click();
    await expect(page).toHaveURL(/\/(?:book|learn\/u2)\/2-1-2\/$/u);
  });

  test('링크 자리가 그림 속 그 절 글자 위에 있다(좌표가 어긋나지 않았다 — 1-1-1은 첫 줄, 4-1-4는 오른쪽 아래 칸)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '그림 위 링크는 넓은 화면 전용');
    await page.goto('./');
    const geometry = await page.evaluate(() => {
      const read = (id: string) => {
        const spot = document.querySelector(`[data-home-toc-figures] [data-toc-spot="${id}"]`);
        const page = spot?.closest('.toc__page');
        if (!spot || !page) {
          return null;
        }
        const a = spot.getBoundingClientRect();
        const b = page.getBoundingClientRect();
        return { left: (a.left - b.left) / b.width, top: (a.top - b.top) / b.height, width: a.width / b.width, height: a.height / b.height };
      };
      return { first: read('1-1-1'), last: read('4-1-4'), lcd: read('2-1-2') };
    });
    // 그림(1192×1560) 속 줄 위치: 1-1-1은 y 674~712px, 4-1-4는 x 703~1043·y 887~925px, 2-1-2는 x 675~1015·y 716~754px
    expect(geometry.first!.top).toBeCloseTo(674 / 1560, 2);
    expect(geometry.first!.height).toBeCloseTo(38 / 1560, 2);
    expect(geometry.last!.left).toBeCloseTo(703 / 1192, 2);
    expect(geometry.last!.top).toBeCloseTo(887 / 1560, 2);
    expect(geometry.lcd!.left).toBeCloseTo(675 / 1192, 2);
    expect(geometry.lcd!.top).toBeCloseTo(716 / 1560, 2);
  });

  test('좁은 화면: 단원별 접이식 절 목록이 먼저이고(닫힌 채 4줄) 그림은 접혀 있다(눌러 펼치면 그림이 보인다)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '좁은 화면 전용');
    await page.goto('./');
    const list = page.locator('[data-home-toc-list]');
    const details = page.locator('[data-home-toc-details]');
    const units = list.locator('[data-home-toc-unit]');
    await expect(list).toBeVisible();
    await expect(details).toBeVisible();
    await expect(page.locator('[data-home-toc-figures]')).toBeHidden();
    await expect(page.locator('[data-toc-spot]').first()).toBeHidden();
    // 단원마다 닫힌 접이식 4개 — 절 링크는 열기 전에는 보이지 않는다(홈이 짧다)
    await expect(units).toHaveCount(learnUnits.length);
    for (const unit of await units.all()) {
      await expect(unit).not.toHaveAttribute('open', '');
    }
    await expect(list.getByRole('link').first()).toBeHidden();
    const listBox = (await list.boundingBox())!;
    expect(listBox.height, '닫힌 단원 4줄').toBeLessThan(400);
    const detailsBox = (await details.boundingBox())!;
    expect(listBox.y + listBox.height, '목록이 그림 칸보다 먼저').toBeLessThanOrEqual(detailsBox.y);
    // 목록(문서 안): 교과서에 실린 절 모두(+마무리·읽기 자료), 보충 차시는 없다
    expect(await list.locator('a[href]').count()).toBeGreaterThanOrEqual(BOOK_OUTLINE_SECTIONS.length - 1);
    expect(await list.getByText('V1', { exact: true }).count()).toBe(0);
    // 1단원을 펼치면 절 링크가 보이고 손가락이 닿을 만큼 크다
    await units.first().locator('summary').click();
    await expect(units.first()).toHaveAttribute('open', '');
    const firstLink = units.first().getByRole('link').first();
    await expect(firstLink).toBeVisible();
    const box = (await firstLink.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(24);
    // 그림은 눌러 펼친다
    await expect(details).not.toHaveAttribute('open', '');
    await details.getByText(homeToc.figureSummary).click();
    await expect(details).toHaveAttribute('open', '');
    await expect(details.getByRole('img').first()).toBeVisible();
  });
});

test.describe('홈 아래쪽(스크롤 뒤)', () => {
  test('큰 검색·바로 가기·"어떻게 되나요?"가 있고, 홈의 사이트 안 링크가 모두 열린다', async ({ page, request }) => {
    // 링크가 60개쯤이라 개발 서버(쪽마다 처음 열 때 컴파일)에서는 기본 30초를 넘길 수 있다 — 빌드 결과에서는 몇 초다
    test.setTimeout(180_000);
    await page.goto('./');
    const main = page.getByRole('main');

    // 큰 검색: 머리글 "사이트 검색"과 이름이 달라 같은 이름의 랜드마크가 둘이 되지 않는다.
    await expect(main.getByRole('heading', { level: 2, name: homeSearch.heading })).toBeVisible();
    await expect(main.getByRole('search', { name: '배울 것 찾기', exact: true })).toBeVisible();
    await expect(page.getByRole('search', { name: '사이트 검색', exact: true })).toHaveCount(1);

    // 바로 가기 타일 9개
    await expect(main.getByRole('heading', { level: 2, name: homeShortcuts.heading })).toBeVisible();
    // 원칙 아래 안내 줄도 같은 이름('내 컴퓨터 점검', R1-010)이라 바로 가기 칸 안에서 찾는다
    const shortcuts = main.locator('section.shortcuts');
    for (const item of homeShortcuts.items) {
      await expect(shortcuts.getByRole('link', { name: item.label, exact: true })).toHaveAttribute('href', item.href);
    }

    // "어떻게 되나요?" 세 줄(띠의 설치 없음·보드 없어도·무료를 풀어 준다)
    await expect(main.getByRole('heading', { level: 2, name: homePrinciples.heading })).toBeVisible();
    for (const item of homePrinciples.items) {
      await expect(main.getByRole('heading', { level: 3, name: item.title, exact: true })).toBeVisible();
    }
    // 바로 가기 타일도 같은 이름('내 컴퓨터 점검', R1-010)이라 안내 줄 안에서 찾는다
    await expect(main.locator('.principles__note').getByRole('link', { name: homePrinciples.browserNote.linkLabel })).toHaveAttribute(
      'href',
      homePrinciples.browserNote.href,
    );

    // 사이트 안 링크(차례 그림 위 투명 링크·절 목록·단원 카드·타일)가 모두 열린다. 같은 주소는 한 번만 본다.
    const hrefs = await main.locator('a[href]').evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href') ?? ''))]);
    const internal = hrefs.filter((href) => href.startsWith('/'));
    expect(internal.length).toBeGreaterThanOrEqual(BOOK_OUTLINE_SECTIONS.length + homeShortcuts.items.length);
    for (const href of internal) {
      expect((await request.get(href)).status(), href).toBe(200);
    }
  });

  test('쪽 길이: 휴대폰 6,000px 이하·넓은 화면 4,500px 이하(판 1.5.0은 휴대폰 15,429px — 45편을 두 번 보였다)', async ({ page }, testInfo) => {
    await page.goto('./');
    await page.evaluate(() => document.fonts.ready);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(`[홈 쪽 길이] ${testInfo.project.name}: ${height}px`);
    expect(height).toBeLessThanOrEqual(testInfo.project.name === 'mobile' ? MOBILE_PAGE_MAX : DESKTOP_PAGE_MAX);
  });

  test('제목 구조: 본문에 h1이 하나이고 단계를 건너뛰지 않으며, 홈은 사이트 검색 색인에서 빠진다', async ({ page }) => {
    await page.goto('./');
    const main = page.getByRole('main');
    const levels = await main
      .locator('h1, h2, h3, h4, h5, h6')
      .evaluateAll((headings) => headings.filter((heading) => heading.getClientRects().length > 0).map((heading) => Number(heading.tagName.slice(1))));
    expect(levels[0]).toBe(1);
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index]! - levels[index - 1]!, `제목 ${index + 1}번째`).toBeLessThanOrEqual(1);
    }
    await expect(page.locator('main[data-pagefind-body]')).toHaveCount(0);
  });

  test('가로로 넘치지 않는다(화면 폭 그대로와 320px)', async ({ page }) => {
    await page.goto('./');
    expect(await overflowX(page), '기본 폭').toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 320, height: 760 });
    await page.goto('./');
    expect(await overflowX(page), '320px').toBeLessThanOrEqual(0);
  });
});

test.describe('바닥글 출처 줄(모든 쪽)', () => {
  test('홈 바닥글에 교과서와 부품 사진·회로 그림의 출처가 한 줄로 있다', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('[data-site-credit]')).toHaveText(
      '교과서: 「인공지능과 피지컬 컴퓨팅」(금성출판사, 김석전·박상진·김승현·김영준·육동건). 부품 사진·회로 그림·키트 예제 코드: 고릴라셀(브릭셀, 실습 키트 제조사) 제공, 허락받아 사용.',
    );
  });
});

test.describe('홈 진도 표시(이어서 하기)', () => {
  const lesson = { id: 'u1/1-1-1', href: '/ai-physical-computing/learn/u1/1-1-1/', label: '1-1-1', title: '카메라란 무엇일까', at: 1000 };
  const state = {
    version: 1,
    seen: ['u1/1-1-1'],
    done: ['u1/1-1-1'],
    last: lesson,
    lastLab: { path: '/ai-physical-computing/labs/vision/', title: '영상 처리 실습실', at: 2000 },
  };

  // R2-029(판 1.4.0 표지): 돌아온 학생은 스크롤 없이 첫 화면에서 첫 번째 큰 단추(학생)가 "이어서 하기"가 되어 있다.
  test('저장된 진도가 있으면 학생 큰 단추가 "이어서 하기" + 다음에 볼 차시로 바뀐다', async ({ page }) => {
    await seedProgress(page, state);
    await page.goto('./');
    const start = page.locator('[data-home-action="start"]');
    await expect(start).toHaveAttribute('data-resuming', '');
    await expect(start).toContainText('학생');
    await expect(start).toContainText(homeResume.lesson.go);
    await expect(start).not.toContainText(homeCover.startLabel);
    // 1-1-1을 끝냈으니 다음에 볼 차시(1-1-2)로 간다 — 교과서 쪽이 있으면 그 쪽, 없으면 웹 차시
    await expect(start).toHaveAttribute('href', /\/(?:learn\/u1|book)\/1-1-2\/$/u);
    await expect(start.locator('[data-cover-start-name]')).toContainText('1-1-2');
    await expect(start).toBeInViewport({ ratio: 1 });
    // 다른 두 단추는 그대로
    await expect(page.locator('[data-home-action="teacher"]')).toContainText('수업 준비');
    await expect(page.locator('[data-home-action="kit"]')).toContainText('보드 켜기');
  });

  test('처음 온 사람에게는 "처음부터 배우기"이고 이어서 하기 표시가 없다', async ({ page }) => {
    await page.goto('./');
    const start = page.locator('[data-home-action="start"]');
    await expect(start).toContainText(homeCover.startLabel);
    await expect(start).not.toHaveAttribute('data-resuming', '');
    await expect(start.locator('[data-cover-start-name]')).toBeHidden();
  });

  test('저장된 진도가 있으면 이어서 하기 띠, 단원 진도 글·단추, 단원 카드가 나타나고 다음에 볼 차시 안내는 한 번만 보인다', async ({ page }) => {
    await seedProgress(page, state);
    await page.goto('./');
    const band = page.getByRole('region', { name: homeResume.heading });
    await expect(band).toBeVisible();
    // 1-1-1은 이미 끝낸 차시라 "다시 보기"이다(R1-030). 차시 이름은 저장된 글이 아니라 지금 사이트의 것이라 제목은 가리지 않는다.
    await expect(band.getByRole('link', { name: /^1-1-1 .+ 다시 보기$/u })).toHaveAttribute('href', lesson.href);
    await expect(band.getByRole('link', { name: /이어서 하기/u })).toHaveCount(0);
    // R3-007: "다음에 볼 차시"(1-1-2)는 큰 단추가 이미 이어 주므로 띠에서는 같은 칸을 숨긴다 — 같은 안내가 위아래로 두 번 나오지 않는다.
    await expect(band.getByRole('link', { name: /^1-1-2 / })).toHaveCount(0);
    await expect(band.getByRole('link', { name: /영상 처리 실습실 다시 열기/u })).toHaveAttribute('href', state.lastLab.path);

    // 단원 카드: "N차시 중 M차시를 다 했어요" + 막대(낭독기에는 글로만), 단추는 "1단원 이어서 하기" → 안 본 첫 차시(따라 하기 쪽)
    const head = unitCard(page, 1);
    await expect(head.locator('[data-progress-count]')).toContainText(/차시 중 1차시를 다 했어요$/u);
    await expect(head.locator('[data-progress-bar]')).toHaveAttribute('aria-hidden', 'true');
    await expect(head.getByRole('link')).toHaveText(`1단원 ${homeUnits.resumeLabel}`);
    await expect(head.getByRole('link')).toHaveAttribute('href', /\/learn\/u1\/1-1-2\/$/u);
    await expect(unitCard(page, 2)).toHaveAttribute('data-progress-empty', '');
    await expect(unitCard(page, 2).getByRole('link')).toHaveText(`2단원 ${homeUnits.openLabel}`);
  });

  test('교과서 쪽을 연 진도(짝 웹 차시와 같은 진도 id)도 그 단원 카드에 "열어 봤어요"로 센다', async ({ page }) => {
    await seedProgress(page, { version: 1, seen: ['u2/2-1-2'], done: [], last: null, lastLab: null });
    await page.goto('./');
    await expect(unitCard(page, 2).locator('[data-progress-count]')).toContainText(/차시 중 1차시를 열어 봤어요$/u);
    await expect(unitCard(page, 2).getByRole('link')).toHaveText(`2단원 ${homeUnits.resumeLabel}`);
  });

  test('지난번 차시를 아직 안 끝냈으면 큰 단추와 띠가 모두 그 차시 "이어서 하기"다', async ({ page }) => {
    await seedProgress(page, { ...state, done: [] });
    await page.goto('./');
    const start = page.locator('[data-home-action="start"]');
    await expect(start).toHaveAttribute('href', /\/(?:learn\/u1|book)\/1-1-1\/$/u);
    await expect(start).toContainText(homeResume.lesson.go);
    const band = page.getByRole('region', { name: homeResume.heading });
    await expect(band).toBeVisible();
    await expect(band.getByRole('link', { name: /^1-1-1 .+ 이어서 하기$/u })).toHaveAttribute('href', lesson.href);
    await expect(band.getByText(homeResume.next.kicker)).toBeHidden();
  });

  // R1-031: 사이트에 없는 차시·실습실 id가 진도에 있어도 404로 가는 카드를 보이지 않는다.
  test('사이트에 없는 차시·실습실이 진도에 있으면 그 카드를 보이지 않고 큰 단추는 처음 모습이다', async ({ page }) => {
    const stale = {
      version: 1,
      seen: [],
      done: [],
      last: { id: 'u1/9-9-9', href: '/ai-physical-computing/learn/u1/9-9-9/', label: '9-9-9', title: '없는 차시', at: 1000 },
      lastLab: { path: '/ai-physical-computing/labs/nonexistent/', title: '없는 실습실', at: 2000 },
    };
    await seedProgress(page, stale);
    await page.goto('./');
    await expect(unitCard(page, 1)).toHaveAttribute('data-progress-ready', '');
    await expect(page.locator('[data-home-resume]')).toBeHidden();
    await expect(page.locator('a[href*="9-9-9"], a[href*="nonexistent"]')).toHaveCount(0);
    await expect(page.locator('[data-home-action="start"]')).toContainText(homeCover.startLabel);
  });

  test('망가진 저장 값이 있어도 오류 없이 처음 온 사람처럼 보인다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.addInitScript(
      ({ key }) => {
        try {
          localStorage.setItem(key, '{"version":1,"seen":"nope","last":{"href":"//evil.example/x"}}');
        } catch {
          // 저장을 막은 브라우저
        }
      },
      { key: storageKey(PROGRESS_STORAGE_NAME) },
    );
    await page.goto('./');
    await expect(page.locator('[data-home-resume]')).toBeHidden();
    await expect(page.locator('[data-home-action="start"]')).toContainText(homeCover.startLabel);
    expect(errors).toEqual([]);
  });
});
