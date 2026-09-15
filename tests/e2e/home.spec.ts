// 홈 화면 브라우저 테스트(PLAN §8.1 P1-05 완료 기준, SPEC §5 홈 화면 요구).
// playwright.config.ts의 두 화면 크기(desktop 1366×768, mobile 375×812)에서 모두 돈다.
//   ① 스크롤 없이 제목·한 문장 소개·큰 버튼 3개가 화면 안에 다 보이는지
//   ② Tab 키만으로 큰 버튼 3개에 닿는지(초점 테두리가 보이고 화면이 밀리지 않는지)
//   ③ 흐름 그림의 화면 낭독기 설명, 동작 줄이기 설정, 멈춤 버튼
//   ④ 스크롤 뒤 카드·원칙과 홈의 사이트 안 링크
// 주소는 baseURL 기준 상대 경로('./')로 연다(앞에 /를 붙이면 base가 빠진다).
// 글과 주소는 src/components/home/home-content.ts에서 읽으므로, 문구를 바꿔도 이 파일은 고치지 않아도 된다.
import { expect, test, type Page } from '@playwright/test';
import { FLOW_TOGGLE_LABELS } from '../../src/components/home/flow-motion.ts';
import {
  flowFigure,
  homeActions,
  homeFeatures,
  homeHero,
  homePrinciples,
} from '../../src/components/home/home-content.ts';

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
  test('할 수 있는 것 카드와 설치 없이 원칙이 있고, 홈의 사이트 안 링크가 모두 열린다', async ({ page, request }) => {
    await page.goto('./');
    const main = page.getByRole('main');

    await expect(main.getByRole('heading', { level: 2, name: homeFeatures.heading })).toBeVisible();
    for (const card of homeFeatures.cards) {
      const cardLink = main.getByRole('heading', { level: 3, name: card.title, exact: true }).getByRole('link');
      await expect(cardLink).toHaveAttribute('href', card.href);
    }

    await expect(main.getByRole('heading', { level: 2, name: homePrinciples.heading })).toBeVisible();
    for (const item of homePrinciples.items) {
      await expect(main.getByRole('heading', { level: 3, name: item.title, exact: true })).toBeVisible();
    }
    await expect(main.getByRole('link', { name: homePrinciples.browserNote.linkLabel })).toHaveAttribute(
      'href',
      homePrinciples.browserNote.href,
    );

    const hrefs = await main
      .locator('a[href]')
      .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute('href') ?? ''))]);
    const internal = hrefs.filter((href) => href.startsWith('/'));
    expect(internal.length).toBeGreaterThanOrEqual(homeActions.length + homeFeatures.cards.length);
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
});
