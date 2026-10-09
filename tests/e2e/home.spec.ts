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
      const start = main.getByRole('link', { name: `${unit.numeral}단원 ${homeMap.startLabel}`, exact: true });
      await expect(start).toHaveAttribute('href', new RegExp(`${unit.path}[a-z0-9-]+/$`, 'u'));
    }

    // 바로 가기 타일 9개
    await expect(main.getByRole('heading', { level: 2, name: homeShortcuts.heading })).toBeVisible();
    for (const item of homeShortcuts.items) {
      await expect(main.getByRole('link', { name: item.label, exact: true })).toHaveAttribute('href', item.href);
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
    lastLab: { path: '/ai-physical-computing/labs/vision/', title: '영상처리 실습실', at: 2000 },
  };

  test('저장된 진도가 있으면 이어서 하기 띠, 단원 진도 글, [이어서 하기] 단추가 나타난다', async ({ page }) => {
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
    await expect(band.getByRole('link', { name: /1-1-1 카메라란 무엇일까 이어서 하기/u })).toHaveAttribute('href', lesson.href);
    await expect(band.getByRole('link', { name: /영상처리 실습실 다시 열기/u })).toHaveAttribute('href', state.lastLab.path);

    const card = page.locator('[data-home-unit]').first();
    await expect(card.locator('[data-progress-count]')).toContainText('1개 끝냄');
    await expect(page.locator('[data-home-unit]').nth(1)).toHaveAttribute('data-progress-empty', '');
    const resume = card.locator('[data-unit-start]');
    await expect(resume).toHaveAccessibleName('I단원 이어서 하기');
    await expect(resume).toHaveAttribute('href', /\/learn\/u1\/1-1-2\/$/u);
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
