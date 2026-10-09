// 홈 화면 브라우저 테스트(PLAN §8.1 P1-05 완료 기준, SPEC §5 홈 화면 요구).
// playwright.config.ts의 두 화면 크기(desktop 1366×768, mobile 375×812)에서 모두 돈다.
//   ① 스크롤 없이 제목·한 문장 소개·큰 버튼 3개가 화면 안에 다 보이는지
//   ② Tab 키만으로 큰 버튼 3개에 닿는지(초점 테두리가 보이고 화면이 밀리지 않는지)
//   ③ 흐름 그림의 화면 낭독기 설명, 동작 줄이기 설정, 멈춤 버튼
//   ④ 스크롤 뒤 큰 검색·배움 지도(대단원 4장)·바로 가기 타일·원칙과 홈의 사이트 안 링크
//   ⑤ 배움 지도 카드가 통째로 눌리고 키보드로 닿는지, 저장된 진도가 있을 때 이어서 하기 띠와 단추(판 1.3.0)
// 주소는 baseURL 기준 상대 경로('./')로 연다(앞에 /를 붙이면 base가 빠진다).
// 글과 주소는 src/components/home/home-content.ts에서 읽으므로, 문구를 바꿔도 이 파일은 고치지 않아도 된다.
import { expect, test, type Page } from '@playwright/test';
import { FLOW_TOGGLE_LABELS } from '../../src/components/home/flow-motion.ts';
import {
  flowFigure,
  homeActions,
  homeHero,
  homeMap,
  homePrinciples,
  homeResume,
  homeSearch,
  homeShortcuts,
} from '../../src/components/home/home-content.ts';
import { learnUnits } from '../../src/config/nav.ts';
import { PROGRESS_STORAGE_NAME } from '../../src/lib/progress.ts';
import { storageKey } from '../../src/lib/storage.ts';

/** P1-05 완료 기준 화면 크기. playwright.config.ts의 projects 이름·크기와 같아야 한다. */
const VIEWPORTS: Readonly<Record<string, { width: number; height: number }>> = {
  desktop: { width: 1366, height: 768 },
  mobile: { width: 375, height: 812 },
};

/** "큰 버튼"으로 보는 최소 높이(px). 사이트의 누르는 곳 최소 크기 44px보다 크게 잡았다. */
const LARGE_BUTTON_MIN_HEIGHT = 56;

function expectedViewport(projectName: string): { width: number; height: number } {
  const viewport = VIEWPORTS[projectName];
  if (!viewport) {
    throw new Error(`홈 테스트에 없는 화면 크기 이름이에요: ${projectName}. VIEWPORTS에 크기를 적어요.`);
  }
  return viewport;
}

/** 흐름 그림 안에 붙어 있는 애니메이션 수 */
function countFlowAnimations(page: Page): Promise<number> {
  return page.locator('[data-flow]').evaluate((figure) => figure.getAnimations({ subtree: true }).length);
}

test.describe('홈 첫 화면(스크롤 없이)', () => {
  test('제목·한 문장 소개·큰 버튼 3개가 화면 안에 다 보인다', async ({ page }, testInfo) => {
    const viewport = expectedViewport(testInfo.project.name);
    expect(page.viewportSize()).toEqual(viewport);

    const response = await page.goto('./');
    expect(response?.status()).toBe(200);
    // 글꼴(Pretendard)을 다 받은 뒤의 줄 바꿈으로 잰다.
    await page.evaluate(() => document.fonts.ready);
    const main = page.getByRole('main');

    const title = main.getByRole('heading', { level: 1 });
    await expect(title).toHaveText(homeHero.titleLines.join(' '));
    await expect(title).toBeInViewport({ ratio: 1 });
    await expect(main.getByText(homeHero.lead)).toBeInViewport({ ratio: 1 });

    for (const action of homeActions) {
      const link = main.getByRole('link', { name: action.label });
      await expect(link).toHaveAttribute('href', action.href);
      await expect(link).toBeVisible();
      await expect(link).toBeInViewport({ ratio: 1 });
      const box = await link.boundingBox();
      expect(box, action.label).not.toBeNull();
      expect(box!.y, `${action.label} 버튼 위 끝`).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height, `${action.label} 버튼 아래 끝`).toBeLessThanOrEqual(viewport.height);
      expect(box!.height, `${action.label} 버튼 높이`).toBeGreaterThanOrEqual(LARGE_BUTTON_MIN_HEIGHT);
      const hintLines = await link
        .locator('.hero__action-hint')
        .evaluate((hint) => hint.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(hint).lineHeight));
      expect(hintLines, `${action.label} 버튼 설명 줄 수`).toBeLessThan(1.5);
    }

    expect(await page.evaluate(() => window.scrollY), '스크롤하지 않았다').toBe(0);
  });

  test('Tab 키만으로 큰 버튼 3개에 차례로 닿고, 초점 테두리가 보이며 화면이 밀리지 않는다', async ({ page }, testInfo) => {
    const viewport = expectedViewport(testInfo.project.name);
    await page.goto('./');

    const targets = homeActions.map((action) => action.href);
    const reached: string[] = [];

    for (let press = 0; press < 40 && reached.length < targets.length; press += 1) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement) || !element.closest('main')) {
          return null;
        }
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          href: element.getAttribute('href'),
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
          top: rect.top,
          bottom: rect.bottom,
        };
      });
      if (!focused?.href || !targets.includes(focused.href)) {
        continue;
      }
      reached.push(focused.href);
      expect(focused.outlineStyle, `${focused.href} 초점 테두리`).not.toBe('none');
      expect(focused.outlineWidth, `${focused.href} 초점 테두리 굵기`).toBeGreaterThanOrEqual(2);
      expect(focused.top, `${focused.href} 위 끝`).toBeGreaterThanOrEqual(0);
      expect(focused.bottom, `${focused.href} 아래 끝`).toBeLessThanOrEqual(viewport.height);
    }

    expect(reached, 'Tab으로 닿은 큰 버튼(순서대로)').toEqual(targets);
    expect(await page.evaluate(() => window.scrollY), '초점이 옮겨 가도 스크롤되지 않았다').toBe(0);
  });
});

test.describe('홈 흐름 그림', () => {
  test('화면 낭독기용 이름·설명이 있고, 글자는 그림 밖 HTML에 있다', async ({ page }) => {
    await page.goto('./');
    const figure = page.locator('[data-flow]');

    const image = figure.getByRole('img', { name: flowFigure.title });
    await expect(image).toBeVisible();
    await expect(image).toHaveAccessibleDescription(flowFigure.description);
    await expect(figure.locator('svg text')).toHaveCount(0);

    const steps = figure.locator('figcaption li');
    await expect(steps).toHaveCount(flowFigure.steps.length);
    for (const [index, step] of flowFigure.steps.entries()) {
      await expect(steps.nth(index)).toContainText(step.label);
      await expect(steps.nth(index)).toContainText(step.detail);
    }
  });

  // R1-025: 그림의 세 단계가 배움 지도의 길잡이다 — 각 단계가 그 단계를 배우는 대단원으로 이어진다.
  test('단계마다 그 단계를 배우는 대단원 링크가 있고, 배움 지도 카드의 단계 칩과 말이 이어진다', async ({ page }) => {
    await page.goto('./');
    const steps = page.locator('[data-flow] figcaption li');
    for (const [index, step] of flowFigure.steps.entries()) {
      const unit = learnUnits.find((candidate) => candidate.unit === step.unit)!;
      const link = steps.nth(index).getByRole('link');
      await expect(link, step.label).toHaveAttribute('href', unit.href);
      await expect(link, step.label).toContainText(`${unit.unit}단원 ${flowFigure.unitLinkLabel}`);
      await expect(link, step.label).toHaveAccessibleName(new RegExp(`${unit.unit}단원 ${flowFigure.unitLinkLabel}.*${step.label}`, 'u'));
      const box = await link.boundingBox();
      expect(box!.height, `${step.label} 링크 높이`).toBeGreaterThanOrEqual(44);
    }
    // 배움 지도 카드마다 단원 이름 위에 단계 칩이 있다(색이 아니라 글로)
    for (const unit of learnUnits) {
      const card = page.locator('[data-home-unit]').nth(unit.unit - 1);
      await expect(card.locator('.map__stage')).toContainText(homeMap.stages[unit.unit]);
    }
  });

  // R2-030: 오른쪽 그림 카드의 위·아래 선이 왼쪽 글 칸과 맞고, 단원 링크 셋은 같은 모양·같은 줄이다.
  test('넓은 화면에서 그림 카드의 위·아래 선이 왼쪽 글 칸과 맞고, 단원 링크 셋이 한 줄에 같은 크기로 있다', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '두 칸 가로 배치는 넓은 화면에서만');
    await page.goto('./');
    await page.evaluate(() => document.fonts.ready);
    const intro = await page.locator('.hero__intro').boundingBox();
    const card = await page.locator('[data-flow]').boundingBox();
    expect(Math.abs(card!.y - intro!.y), '카드 위 끝').toBeLessThanOrEqual(1);
    expect(Math.abs(card!.y + card!.height - (intro!.y + intro!.height)), '카드 아래 끝').toBeLessThanOrEqual(1);
    const links = await page.locator('[data-flow] .flow__go').evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { top: Math.round(rect.top), height: Math.round(rect.height) };
      }),
    );
    expect(links).toHaveLength(flowFigure.steps.length);
    expect(new Set(links.map((item) => item.top)).size, '링크 위 끝').toBe(1);
    expect(new Set(links.map((item) => item.height)).size, '링크 높이').toBe(1);
  });

  test.describe('움직여도 되는 설정이면(멈춤 단추 자리)', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('[그림 멈추기]는 카드 안 맨 아래 가운데에 있고 윗선으로 카드에 붙는다', async ({ page }) => {
      await page.goto('./');
      const figure = page.locator('[data-flow]');
      const toggle = figure.getByRole('button', { name: FLOW_TOGGLE_LABELS.pause });
      await expect(toggle).toBeVisible();
      const card = (await figure.boundingBox())!;
      const button = (await toggle.boundingBox())!;
      expect(Math.abs(button.x + button.width / 2 - (card.x + card.width / 2)), '가운데').toBeLessThanOrEqual(4);
      expect(button.y + button.height, '카드 안').toBeLessThanOrEqual(card.y + card.height);
      expect(card.y + card.height - (button.y + button.height), '카드 바닥에서 떨어진 거리').toBeLessThanOrEqual(24);
    });
  });

  test.describe('운영체제의 동작 줄이기 설정이면', () => {
    test.use({ reducedMotion: 'reduce' });

    test('움직이지 않는 완성 그림(켜진 LED 2개)으로 보이고 멈춤 버튼은 숨는다', async ({ page }) => {
      await page.goto('./');
      const figure = page.locator('[data-flow]');
      await expect(figure).toHaveAttribute('data-state', 'static');
      expect(await countFlowAnimations(page)).toBe(0);
      await expect(figure.locator('[data-flow-toggle]')).toBeHidden();

      const accent = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--color-accent)';
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      });
      const litFills = await figure.locator('.fl-led--on').evaluateAll((leds) => leds.map((led) => getComputedStyle(led).fill));
      expect(litFills).toEqual([accent, accent]);
      const countFills = await figure.locator('.fl-count--on').evaluateAll((slots) => slots.map((slot) => getComputedStyle(slot).fill));
      expect(countFills).toEqual([accent, accent]);
    });
  });

  test.describe('움직여도 되는 설정이면', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('그림이 움직이고 [그림 멈추기]로 멈추며, 키보드로 [그림 다시 보기]를 누르면 다시 움직인다', async ({ page }) => {
      await page.goto('./');
      const figure = page.locator('[data-flow]');

      await expect(figure).toHaveAttribute('data-state', 'playing');
      const pause = figure.getByRole('button', { name: FLOW_TOGGLE_LABELS.pause });
      await expect(pause).toBeVisible();
      expect(await countFlowAnimations(page)).toBeGreaterThan(0);

      await pause.click();
      await expect(figure).toHaveAttribute('data-state', 'paused');
      const replay = figure.getByRole('button', { name: FLOW_TOGGLE_LABELS.replay });
      await expect(replay).toBeVisible();
      expect(await countFlowAnimations(page)).toBe(0);

      await replay.focus();
      await page.keyboard.press('Enter');
      await expect(figure).toHaveAttribute('data-state', 'playing');
      await expect(figure.getByRole('button', { name: FLOW_TOGGLE_LABELS.pause })).toBeFocused();
      expect(await countFlowAnimations(page)).toBeGreaterThan(0);
    });
  });
});

test.describe('홈 아래쪽(스크롤 뒤)', () => {
  test('큰 검색·배움 지도·바로 가기·원칙이 있고, 홈의 사이트 안 링크가 모두 열린다', async ({ page, request }) => {
    await page.goto('./');
    const main = page.getByRole('main');

    // 큰 검색: 머리글 "사이트 검색"과 이름이 달라 같은 이름의 랜드마크가 둘이 되지 않는다.
    await expect(main.getByRole('heading', { level: 2, name: homeSearch.heading })).toBeVisible();
    await expect(main.getByRole('search', { name: '배울 것 찾기', exact: true })).toBeVisible();
    await expect(page.getByRole('search', { name: '사이트 검색', exact: true })).toHaveCount(1);

    // 배움 지도: 대단원 4장(제목 링크는 단원 쪽, [시작하기]는 첫 차시)
    await expect(main.getByRole('heading', { level: 2, name: homeMap.heading })).toBeVisible();
    for (const unit of learnUnits) {
      const titleLink = main.getByRole('heading', { level: 3, name: unit.label, exact: true }).getByRole('link');
      await expect(titleLink).toHaveAttribute('href', unit.href);
      // 단추 글에 단원 이름이 들어 있다(머리글 메뉴 [시작하기]와 겹치지 않음, R1-027)
      const start = main.getByRole('link', { name: `${unit.unit}단원 ${homeMap.startLabel}`, exact: true });
      await expect(start).toHaveAttribute('href', new RegExp(`${unit.path}[a-z0-9-]+/$`, 'u'));
    }

    // 바로 가기 타일 9개
    await expect(main.getByRole('heading', { level: 2, name: homeShortcuts.heading })).toBeVisible();
    // 원칙 아래 안내 줄도 같은 이름('내 컴퓨터 점검', R1-010)이라 바로 가기 칸 안에서 찾는다
    const shortcuts = main.locator('section.shortcuts');
    for (const item of homeShortcuts.items) {
      await expect(shortcuts.getByRole('link', { name: item.label, exact: true })).toHaveAttribute('href', item.href);
    }

    await expect(main.getByRole('heading', { level: 2, name: homePrinciples.heading })).toBeVisible();
    for (const item of homePrinciples.items) {
      await expect(main.getByRole('heading', { level: 3, name: item.title, exact: true })).toBeVisible();
    }
    // 바로 가기 타일도 같은 이름('내 컴퓨터 점검', R1-010)이라 안내 줄 안에서 찾는다
    await expect(main.locator('.principles__note').getByRole('link', { name: homePrinciples.browserNote.linkLabel })).toHaveAttribute(
      'href',
      homePrinciples.browserNote.href,
    );

    const hrefs = await main
      .locator('a[href]')
      .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href') ?? ''))]);
    const internal = hrefs.filter((href) => href.startsWith('/'));
    expect(internal.length).toBeGreaterThanOrEqual(homeActions.length + learnUnits.length + homeShortcuts.items.length);
    for (const href of internal) {
      expect((await request.get(href)).status(), href).toBe(200);
    }
  });

  test('제목 구조: 본문에 h1이 하나이고 단계를 건너뛰지 않으며, 홈은 사이트 검색 색인에서 빠진다', async ({ page }) => {
    await page.goto('./');
    const main = page.getByRole('main');
    const levels = await main
      .locator('h1, h2, h3, h4, h5, h6')
      .evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));
    expect(levels[0]).toBe(1);
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index] - levels[index - 1], `제목 ${index + 1}번째`).toBeLessThanOrEqual(1);
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

test.describe('홈 배움 지도·바로 가기(키보드와 눌리는 곳)', () => {
  test('카드 전체가 눌린다: 카드 빈 곳을 누르면 대단원 쪽으로, [시작하기]는 첫 차시로 간다', async ({ page }) => {
    await page.goto('./');
    const unit = learnUnits[1]!;
    const card = page.locator('[data-home-unit]').nth(1);
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    // 카드 왼쪽 위 근처(아이콘 둘레 빈 곳)를 누른다 — 제목 링크의 덮개가 카드 전체를 덮는다.
    await page.mouse.click(box!.x + box!.width - 12, box!.y + 12);
    await expect(page).toHaveURL(new RegExp(`${unit.path}$`, 'u'));
  });

  // R2-028: 화면 낭독기가 '18차시'·단계 칩보다 제목을 먼저 읽게 마크업은 제목부터이고, 눈에 보이는 차례는 CSS order로 그대로 둔다.
  test('낭독 순서는 제목 → 설명 → 차시 수 → 단계이고, 눈에 보이는 차례(차시 수 → 단계 → 제목 → 설명 → 단추)는 그대로다', async ({ page }) => {
    await page.goto('./');
    const cards = await page.locator('[data-home-unit]').evaluateAll((nodes) =>
      nodes.map((card) => {
        const part = (selector: string): HTMLElement => card.querySelector(selector) as HTMLElement;
        const parts = ['.map__name', '.map__description', '.map__count', '.map__stage', '[data-unit-start]'].map(part);
        const domOrdered = parts.every((node, index) => index === 0 || (parts[index - 1]!.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
        const [name, description, count, stage, start] = parts.map((node) => node.getBoundingClientRect());
        return {
          domOrdered,
          visual: count!.top < stage!.top && stage!.top < name!.top && name!.top < description!.top && description!.top < start!.top,
        };
      }),
    );
    expect(cards).toHaveLength(learnUnits.length);
    for (const [index, card] of cards.entries()) {
      expect(card.domOrdered, `${index + 1}번째 카드 마크업 차례`).toBe(true);
      expect(card.visual, `${index + 1}번째 카드 보이는 차례`).toBe(true);
    }
    // 낭독용 글: 차시 수에는 "단원 전체"가, 단계에는 "큰 그림에서 맡은 단계"가 숨은 글로 붙어 있다
    const first = page.locator('[data-home-unit]').first();
    await expect(first.locator('.map__count')).toContainText(/^단원 전체 \d+차시$/u);
    await expect(first.locator('.map__stage')).toContainText('큰 그림에서 맡은 단계:');
  });

  // R2-031: 본 차시가 없는 단원은 진도 자리까지 없애 카드가 낮고, 설명 줄 수가 달라도 [단원 배우기] 네 개의 높이는 같다.
  test('처음 온 사람의 카드는 진도 자리 없이 낮고, 설명과 단추 사이가 비지 않는다', async ({ page }, testInfo) => {
    await page.goto('./');
    const cards = page.locator('[data-home-unit]');
    await expect(cards.first()).toHaveAttribute('data-progress-ready', '');
    await expect(cards.first().locator('.map__progress')).toBeHidden();
    const gaps = await cards.evaluateAll((nodes) =>
      nodes.map((card) => {
        const description = card.querySelector('.map__description')!.getBoundingClientRect();
        const start = card.querySelector('[data-unit-start]')!.getBoundingClientRect();
        return { gap: start.top - description.bottom, startBottom: start.bottom, cardBottom: card.getBoundingClientRect().bottom };
      }),
    );
    // 설명이 가장 긴 카드는 설명 바로 아래에 단추가 온다(진도 자리 약 60px가 비지 않는다)
    expect(Math.min(...gaps.map((item) => item.gap)), '설명과 단추 사이').toBeLessThanOrEqual(24);
    if (testInfo.project.name === 'desktop') {
      // 가로 한 줄(4칸)에서는 단추 아래 끝이 모두 같다
      const bottoms = gaps.map((item) => Math.round(item.startBottom));
      expect(new Set(bottoms).size, `단추 아래 끝 ${bottoms.join('·')}`).toBe(1);
    }
  });

  test('Tab으로 지도의 제목 링크 → [시작하기] 차례로 닿고, 초점 테두리가 카드 둘레에 보인다', async ({ page }) => {
    await page.goto('./');
    const card = page.locator('[data-home-unit]').first();
    const title = card.getByRole('heading', { level: 3 }).getByRole('link');
    const start = card.locator('[data-unit-start]');

    await title.focus();
    // 덮개(::after)에 그린 초점 테두리: 링크 글자가 아니라 카드 전체를 두른다.
    const outline = await title.evaluate((link) => {
      const after = getComputedStyle(link, '::after');
      return { style: after.outlineStyle, width: Number.parseFloat(after.outlineWidth) };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);

    await page.keyboard.press('Tab');
    await expect(start).toBeFocused();
    const startOutline = await start.evaluate((link) => Number.parseFloat(getComputedStyle(link).outlineWidth));
    expect(startOutline).toBeGreaterThanOrEqual(2);
  });

  test('화살표와 진도 막대는 Tab 정지점이 아니고 처음 온 사람에게는 진도 글이 보이지 않는다', async ({ page }) => {
    await page.goto('./');
    const card = page.locator('[data-home-unit]').first();
    await expect(card).toHaveAttribute('data-progress-empty', '');
    await expect(card.locator('[data-progress-count]')).toBeHidden();
    await expect(card.locator('[data-progress-bar]')).toBeHidden();
    await expect(page.locator('[data-home-resume]')).toBeHidden();
    await expect(page.locator('html')).not.toHaveAttribute('data-progress-has', '');
    // 지도 안에서 초점을 받는 것은 제목 링크 4개와 [시작하기] 4개뿐이다.
    const focusables = await page
      .locator('[data-home-map] a[href], [data-home-map] button, [data-home-map] [tabindex]')
      .count();
    expect(focusables).toBe(learnUnits.length * 2);
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

  // R2-029: 돌아온 학생은 스크롤 없이 첫 화면에서 "지난번 이어서"를 보고, "처음이라면…" 길잡이는 사라진다.
  test('저장된 진도가 있으면 첫 화면 큰 버튼 아래에 지난번 이어서 한 줄이 보이고 처음이라면 길잡이는 숨는다', async ({ page }) => {
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
    await page.goto('./');
    const resume = page.locator('[data-hero-resume]');
    await expect(resume).toBeVisible();
    await expect(resume).toBeInViewport({ ratio: 1 });
    // 1-1-1을 끝냈으니 다음에 볼 차시(1-1-2)로 간다. 큰 버튼 셋 뒤에 오므로 Tab 차례(= 보이는 차례)가 그대로다.
    const link = resume.getByRole('link');
    await expect(link).toHaveAttribute('href', /\/learn\/u1\/1-1-2\/$/u);
    await expect(link).toContainText(homeResume.next.kicker);
    await expect(page.locator('[data-hero-guide]')).toBeHidden();
    await expect(page.getByText(homeHero.guide)).toBeHidden();
    const lastAction = (await page.locator('[data-home-action]').last().boundingBox())!;
    const resumeBox = (await resume.boundingBox())!;
    expect(resumeBox.y, '큰 버튼 아래').toBeGreaterThanOrEqual(lastAction.y + lastAction.height);
    expect(resumeBox.height, '누르는 곳 높이').toBeGreaterThanOrEqual(44);
  });

  test('처음 온 사람에게는 지난번 이어서 한 줄이 없고 처음이라면 길잡이가 보인다', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('[data-hero-resume]')).toBeHidden();
    await expect(page.getByText(homeHero.guide)).toBeVisible();
  });

  test('저장된 진도가 있으면 이어서 하기 띠, 단원 진도 글, 다음 차시 [시작하기] 단추가 나타난다', async ({ page }) => {
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
    await page.goto('./');
    const band = page.getByRole('region', { name: homeResume.heading });
    await expect(band).toBeVisible();
    // 1-1-1은 이미 끝낸 차시라 "다시 보기"이고(R1-030), 같은 대단원의 안 연 첫 차시(1-1-2)가 "다음에 볼 차시"로 나온다.
    // 차시 이름은 저장된 글이 아니라 지금 사이트의 것이라 제목은 가리지 않는다.
    await expect(band.getByRole('link', { name: /^1-1-1 .+ 다시 보기$/u })).toHaveAttribute('href', lesson.href);
    // 다음에 볼 차시는 아직 안 연 차시라 배우기 쪽과 같은 말 [시작하기](R2-021)
    await expect(band.getByRole('link', { name: /이어서 하기/u })).toHaveCount(0);
    await expect(band.getByRole('link', { name: /^1-1-2 .+ 시작하기$/u })).toHaveAttribute('href', /\/learn\/u1\/1-1-2\/$/u);
    await expect(band.getByRole('link', { name: /영상 처리 실습실 다시 열기/u })).toHaveAttribute('href', state.lastLab.path);

    const card = page.locator('[data-home-unit]').first();
    await expect(card.locator('[data-progress-count]')).toContainText('1차시를 다 했어요');
    // 진도 막대는 같은 말이 글로 읽히므로 화면 낭독기에서 숨긴다(R1-032): 그림(role=img)으로 한 번 더 읽히지 않는다.
    await expect(card.locator('[data-progress-bar]')).toHaveAttribute('aria-hidden', 'true');
    await expect(card.getByRole('img', { name: /차시 중/u })).toHaveCount(0);
    await expect(page.locator('[data-home-unit]').nth(1)).toHaveAttribute('data-progress-empty', '');
    const resume = card.locator('[data-unit-start]');
    await expect(resume).toHaveAccessibleName(`1단원 ${homeMap.resumeLabel}`);
    await expect(resume).toHaveAttribute('href', /\/learn\/u1\/1-1-2\/$/u);
  });

  test('지난번 차시를 아직 안 끝냈으면 "이어서 하기" 하나뿐이고 다음 차시 칸은 없다', async ({ page }) => {
    const openState = { ...state, done: [] };
    await page.addInitScript(
      ({ key, value }) => {
        try {
          localStorage.setItem(key, value);
        } catch {
          // 저장을 막은 브라우저
        }
      },
      { key: storageKey(PROGRESS_STORAGE_NAME), value: JSON.stringify(openState) },
    );
    await page.goto('./');
    const band = page.getByRole('region', { name: homeResume.heading });
    await expect(band).toBeVisible();
    await expect(band.getByRole('link', { name: /^1-1-1 .+ 이어서 하기$/u })).toHaveAttribute('href', lesson.href);
    await expect(band.getByText(homeResume.next.kicker)).toBeHidden();
  });

  // R1-031: 사이트에 없는 차시·실습실 id가 진도에 있어도 404로 가는 카드를 보이지 않는다.
  test('사이트에 없는 차시·실습실이 진도에 있으면 그 카드를 보이지 않는다', async ({ page }) => {
    const stale = {
      version: 1,
      seen: [],
      done: [],
      last: { id: 'u1/9-9-9', href: '/ai-physical-computing/learn/u1/9-9-9/', label: '9-9-9', title: '없는 차시', at: 1000 },
      lastLab: { path: '/ai-physical-computing/labs/nonexistent/', title: '없는 실습실', at: 2000 },
    };
    await page.addInitScript(
      ({ key, value }) => {
        try {
          localStorage.setItem(key, value);
        } catch {
          // 저장을 막은 브라우저
        }
      },
      { key: storageKey(PROGRESS_STORAGE_NAME), value: JSON.stringify(stale) },
    );
    await page.goto('./');
    await expect(page.locator('[data-home-unit]').first()).toHaveAttribute('data-progress-ready', '');
    await expect(page.locator('[data-home-resume]')).toBeHidden();
    await expect(page.locator('a[href*="9-9-9"], a[href*="nonexistent"]')).toHaveCount(0);
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
    expect(errors).toEqual([]);
  });
});

/** 문서가 화면 폭보다 얼마나 넓은지(px) */
function overflowX(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}
