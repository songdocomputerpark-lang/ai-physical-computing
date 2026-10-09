/**
 * 실습실 구역 화면 개편(판 1.3.0 "설명 없이 쓰는 사이트" X 구역) 브라우저 테스트.
 *
 * 무엇을 보나
 *   1. 실습실 안내(/labs/): 맨 위 "무엇을 할까요?" 고르기 3개가 첫 화면에 보이고, 카드는 어디를 눌러도 열리며, 안의 작은 링크는 따로 눌린다.
 *   2. 영상 처리·ESP32 실습실: 긴 설명은 접혀 있고(Tab 정지점 하나), [실행]·코치 줄이 첫 화면 위쪽에 들어온다. 코치 줄(① 예제를 골라요 → ② [실행]을 눌러요 → ③ 결과를 봐요)이
 *      Tab 정지점 없이 조작 줄 묶음 아래에 있고, 실행 횟수(data-run-count)로만 단계가 칠해진다. [실행] 접근 이름은 "실행" 그대로.
 *   3. 4단원 통합 화면: 틀이 둘이어도 코치 줄은 한 번만.
 *   4. 차시 안 임베드(?embed=1)에서는 코치 줄과 긴 설명이 숨는다.
 *   5. 실습실 쪽을 열면 마지막 실습실이 기억된다(홈 "이어서 하기"용) — 임베드는 기억하지 않는다.
 *   6. 예제 갤러리: 단원 색 띠, 카드 전체가 눌림, 카드 안 다른 링크는 따로 눌림.
 *   7. 320px에서 가로 넘침 0.
 *
 * 돌리는 법: PW_BASE_URL=http://localhost:5305/ai-physical-computing/ npx playwright test tests/e2e/labs-ui.spec.ts --project=desktop
 */
import { expect, test, type Page } from '@playwright/test';
import { getPage } from '../../src/config/nav.ts';
import { withBase } from '../../src/lib/url.ts';
import { expectNoHorizontalOverflow, REFLOW_VIEWPORT } from './helpers/reflow.ts';

/** 개발 서버가 파일이 바뀔 때 쪽을 다시 불러오지 않게 한다(다른 구역이 같은 폴더에서 고치는 중에도 시험이 흔들리지 않게). */
async function freezeDevReloads(page: Page): Promise<void> {
  await page.routeWebSocket(/\/\?token=/u, (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (typeof message === 'string' && /"type":"(?:full-reload|update|prune)"/u.test(message)) {
        return;
      }
      socket.send(message);
    });
    socket.onMessage((message) => server.send(message));
  });
}

/** 저장된 진도(학습 진도 저장 이름이 progress:v1로 끝나는 칸)를 읽는다 */
async function readStoredProgress(page: Page): Promise<{ lastLab?: { path: string; title: string } | null } | null> {
  return page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) ?? '';
      if (key.endsWith('progress:v1')) {
        return JSON.parse(localStorage.getItem(key) ?? 'null');
      }
    }
    return null;
  });
}

test.describe('실습실 안내(/labs/)', () => {
  test('"무엇을 할까요?" 고르기 3개가 첫 화면에 보이고 각각 실습실로 간다', async ({ page }) => {
    await page.goto(withBase('labs/'));
    await expect(page.getByRole('heading', { level: 2, name: '무엇을 할까요?' })).toBeVisible();
    const choose = page.locator('.choose__item');
    await expect(choose).toHaveCount(3);
    const targets = ['labs-vision', 'labs-esp32', 'labs-iot'];
    for (let index = 0; index < targets.length; index += 1) {
      const target = getPage(targets[index]!);
      const link = choose.nth(index).locator('a.card__link');
      await expect(link).toHaveAttribute('href', target.href);
      // 링크 글에는 실습실 이름이 없고, 이름은 보조 설명(aria-describedby)으로 읽힌다
      await expect(link).not.toContainText(target.title);
      await expect(choose.nth(index)).toContainText(target.title);
      await expect(link).toHaveAccessibleDescription(new RegExp(target.title, 'u'));
      // 첫 화면(스크롤 0)에 모두 들어온다
      await expect(choose.nth(index)).toBeInViewport();
    }
    // 셋째 칸은 4단원 통합 실습실로 가는 작은 링크도 있다
    await expect(choose.nth(2).getByRole('link', { name: getPage('labs-unit4').title, exact: true })).toHaveAttribute('href', getPage('labs-unit4').href);
  });

  test('카드는 어디를 눌러도 열리고, 카드 안의 작은 링크는 따로 눌린다', async ({ page }) => {
    await page.goto(withBase('labs/'));
    const esp32 = getPage('labs-esp32');
    const card = page.locator('.lab-card', { has: page.getByRole('heading', { level: 3, name: esp32.title }) });
    // 제목이 아닌 설명 글 자리를 눌러도 카드의 큰 링크로 간다(덮개). 화면 밖은 elementFromPoint가 비므로 먼저 화면 안으로 굴린다.
    await card.scrollIntoViewIfNeeded();
    const topmost = await card.locator('.lab-card__description').evaluate((element) => {
      element.scrollIntoView({ block: 'center' });
      const rect = element.getBoundingClientRect();
      return document.elementFromPoint(rect.left + 4, rect.top + 4)?.closest('a')?.getAttribute('href') ?? '';
    });
    expect(topmost).toBe(esp32.href);
    // 작은 링크(실물 점검 도우미)는 덮개 위에서 자기 주소로 간다
    const check = getPage('labs-esp32-check');
    const sub = card.locator('.lab-card__sub').getByRole('link', { name: check.title, exact: true });
    await expect(sub).toHaveAttribute('href', check.href);
    const subTop = await sub.evaluate((element) => {
      element.scrollIntoView({ block: 'center' });
      const rect = element.getBoundingClientRect();
      return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('a')?.getAttribute('href') ?? '';
    });
    expect(subTop).toBe(check.href);
  });

  test('카드마다 "이럴 때 써요"와 필요한 것 칩이 있다', async ({ page }) => {
    await page.goto(withBase('labs/'));
    const cards = page.locator('.lab-card');
    const count = await cards.count();
    for (let index = 0; index < count; index += 1) {
      await expect(cards.nth(index).locator('.lab-card__use')).toContainText('이럴 때 써요');
      expect(await cards.nth(index).locator('.lab-need').count()).toBeGreaterThanOrEqual(1);
    }
  });

  test('320px에서 가로로 넘치지 않는다', async ({ page }) => {
    await page.setViewportSize(REFLOW_VIEWPORT);
    await page.goto(withBase('labs/'));
    await expectNoHorizontalOverflow(page, '실습실 안내(320px)');
  });
});

for (const lab of [
  { path: 'labs/vision/', name: '영상 처리 실습실', intro: '.vision-intro' },
  { path: 'labs/esp32/', name: 'ESP32 실습실', intro: '.esp32-intro' },
]) {
  test.describe(`${lab.name} 첫 화면`, () => {
    test.describe.configure({ timeout: 120_000 });

    test('긴 설명은 접혀 있고 코치 줄은 조작 줄 아래에 Tab 정지점 없이 있다', async ({ page }) => {
      await freezeDevReloads(page);
      await page.goto(withBase(lab.path));
      const more = page.locator(`${lab.intro} details.more`);
      await expect(more).toHaveCount(1);
      await expect(more).not.toHaveAttribute('open', /.*/u);
      await expect(more.locator('summary')).toHaveText('처음 쓰는 법 자세히');

      const coach = page.getByRole('list', { name: '처음 쓰는 방법' });
      await expect(coach).toBeVisible();
      await expect(coach.getByRole('listitem')).toHaveText(['예제를 골라요', '[실행]을 눌러요', '결과를 봐요']);
      // Tab 정지점이 없다
      expect(await coach.locator('a, button, input, select, textarea, summary, [tabindex]').count()).toBe(0);
      // 조작 줄 묶음(조작 줄 + 상태 줄 — 넓은 화면에서는 화면 위에 붙는 묶음, R1-096) 바로 아래. 코치 줄은 묶음 밖이라 붙지 않는다
      const order = await page.evaluate(() => {
        const bar = document.querySelector('[data-lab-bar]')!.getBoundingClientRect();
        const toolbar = document.querySelector('[data-lab-toolbar]')!.getBoundingClientRect();
        const coachBox = document.querySelector('[data-lab-coach]')!.getBoundingClientRect();
        const status = document.querySelector('.lab__status')!.getBoundingClientRect();
        return { barBottom: bar.bottom, toolbarBottom: toolbar.bottom, coachTop: coachBox.top, statusBottom: status.bottom };
      });
      expect(order.coachTop).toBeGreaterThanOrEqual(order.barBottom - 1);
      expect(order.coachTop).toBeGreaterThanOrEqual(order.toolbarBottom);
      expect(order.coachTop).toBeGreaterThanOrEqual(order.statusBottom - 1);
      // 준비 칸 자리는 비어 있다(준비 칸 전용)
      await expect(page.locator('[data-lab-coach]').locator('xpath=ancestor::*[@data-lab-intro]')).toHaveCount(0);
    });

    test('[실행] 접근 이름은 "실행" 그대로이고, 코치 줄 단계는 실행 횟수로 칠해진다', async ({ page }) => {
      await freezeDevReloads(page);
      await page.goto(withBase(lab.path));
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: '정지', exact: true })).toBeVisible();
      const weights = () =>
        page.evaluate(() => [...document.querySelectorAll('[data-lab-coach] > li')].map((item) => Number.parseInt(getComputedStyle(item).fontWeight, 10)));
      // 아직 실행 전: ② [실행] 누르기가 지금 할 일
      const before = await weights();
      expect(before[1]).toBeGreaterThanOrEqual(700);
      expect(before[0]).toBeLessThan(700);
      expect(before[2]).toBeLessThan(700);
      // 실행 횟수가 1 이상이면 ③ 결과 보기가 지금 보는 곳(실행 횟수 속성은 실습실 틀이 적는 값 — 여기서는 칠하는 CSS만 본다)
      await page.locator('[data-lab]').first().evaluate((root) => {
        (root as HTMLElement).dataset.runCount = '1';
      });
      const after = await weights();
      expect(after[2]).toBeGreaterThanOrEqual(700);
      expect(after[1]).toBeLessThan(700);
    });

    test('[실행]은 채운 단추로 ▶ 표시가 있고 조금 더 크다', async ({ page }) => {
      await freezeDevReloads(page);
      await page.goto(withBase(lab.path));
      const run = page.locator('[data-lab-run]');
      const info = await run.evaluate((button) => {
        const before = getComputedStyle(button, '::before');
        return { height: button.getBoundingClientRect().height, borderStyle: before.borderTopStyle, content: before.content };
      });
      expect(info.height).toBeGreaterThanOrEqual(47);
      expect(info.borderStyle).toBe('solid');
      // 아이콘은 글자가 아니다(빈 글)
      expect(['""', "''", 'none']).toContain(info.content === 'normal' ? 'none' : info.content);
    });

    test('[실행]과 코치 줄이 첫 화면(스크롤 0)의 위쪽 절반에 들어온다 — 긴 설명이 먼저 자리를 차지하지 않는다', async ({ page, isMobile }) => {
      test.skip(isMobile, '넓은 화면(1366×768)에서 본다. 휴대폰은 같은 계약을 아래 반응형 검사가 본다.');
      await freezeDevReloads(page);
      await page.goto(withBase(lab.path));
      const run = page.locator('[data-lab-run]');
      await expect(run).toBeInViewport();
      await expect(page.locator('[data-lab-coach]')).toBeInViewport({ ratio: 1 });
      const runBox = await run.boundingBox();
      expect(runBox).not.toBeNull();
      // 긴 설명(예전에는 약 200~300px)이 접혀서 [실행] 줄이 화면 높이(768)의 가운데보다 위에서 시작한다
      expect(runBox!.y).toBeLessThan(768 / 2);
    });

    test('차시 안 임베드(?embed=1)에서는 코치 줄과 긴 설명이 숨는다', async ({ page }) => {
      await freezeDevReloads(page);
      await page.goto(`${withBase(lab.path)}?embed=1`);
      await expect(page.locator('[data-lab-coach]')).toBeHidden();
      await expect(page.locator(lab.intro)).toBeHidden();
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeVisible();
    });

    test('320px에서 가로로 넘치지 않는다', async ({ page }) => {
      await freezeDevReloads(page);
      await page.setViewportSize(REFLOW_VIEWPORT);
      await page.goto(withBase(lab.path));
      await expect(page.locator('[data-lab-coach]')).toBeVisible();
      await expectNoHorizontalOverflow(page, `${lab.name}(320px)`);
    });

    // R1-096: [실행] 뒤 화면이 결과 칸으로 내려가면 [정지]·상태 줄이 화면 밖으로 나갔다 — 넓은 화면에서는 조작 줄 묶음이 화면 위에 붙는다.
    test('넓은 화면에서는 조작 줄 묶음이 화면 위에 붙어, 화면을 한참 내려도 [정지]와 상태 줄이 보인다', async ({ page, isMobile }) => {
      test.skip(isMobile, '붙는 줄은 넓고 높은 화면(틀 폭 72rem 이상)에서만 — 휴대폰은 아래 시험이 붙지 않음을 본다');
      await freezeDevReloads(page);
      await page.goto(withBase(lab.path));
      await page.evaluate(() => window.scrollTo(0, 1500));
      await expect(page.getByRole('button', { name: '정지', exact: true })).toBeInViewport();
      await expect(page.getByRole('button', { name: '실행', exact: true })).toBeInViewport();
      await expect(page.locator('[data-lab-status]')).toBeInViewport();
      const info = await page.locator('[data-lab-bar]').evaluate((bar) => ({ top: bar.getBoundingClientRect().top, height: bar.getBoundingClientRect().height, position: getComputedStyle(bar).position }));
      expect(info.position).toBe('sticky');
      expect(info.top).toBeLessThanOrEqual(1);
      // 붙는 높이는 [실행] 줄 하나 안팎이다(화면 높이 768의 1/6 안쪽 — 붙은 줄이 결과 칸을 먹지 않는다)
      expect(info.height).toBeLessThan(768 / 6);
    });

    test('휴대폰 폭에서는 조작 줄 묶음이 붙지 않고, [실행]·[정지]·[초기화]가 한 줄이며 예제 선택 상자가 한 줄 전체 폭이다', async ({ page }) => {
      await freezeDevReloads(page);
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto(withBase(lab.path));
      expect(await page.locator('[data-lab-bar]').evaluate((bar) => getComputedStyle(bar).position)).not.toBe('sticky');
      const tops = await Promise.all(
        ['실행', '정지', '초기화'].map((name) => page.getByRole('button', { name, exact: true }).evaluate((button) => Math.round(button.getBoundingClientRect().top))),
      );
      expect(new Set(tops).size, `세 단추의 위쪽 위치 ${tops.join(', ')}`).toBe(1);
      const select = await page.locator('[data-lab-example-select]').evaluate((element) => element.getBoundingClientRect().width);
      expect(select).toBeGreaterThanOrEqual(260);
      // R3-005: 라벨 [예제]는 선택 상자 위에 있어 상자가 전체 폭을 쓰고, 고른 예제 이름 전체가 줄바꿈되어 아래에 보인다(선택 상자는 긴 이름을 자른다)
      const label = await page.locator('.lab__examples-label').first().evaluate((element) => Math.round(element.getBoundingClientRect().bottom));
      const selectTop = await page.locator('[data-lab-example-select]').evaluate((element) => Math.round(element.getBoundingClientRect().top));
      expect(label, '라벨이 선택 상자 위에 있다').toBeLessThanOrEqual(selectTop);
      const name = page.locator('[data-lab-example-name]');
      await expect(name).toBeVisible();
      expect((await name.textContent())?.trim().length ?? 0).toBeGreaterThan(0);
      await expectNoHorizontalOverflow(page, `${lab.name}(375px 조작 줄)`);
    });

    // R1-102: 넓은 쪽(실습실)의 빵부스러기·제목이 머리글 칸(76rem)에 맞고, 편집기·패널 칸은 그보다 넓되 1600px에서 멈춘다.
    test('1920 폭에서 빵부스러기·제목이 머리글 로고와 같은 줄에서 시작하고, 실습실 칸은 100rem(1600px)에서 멈춘다', async ({ page, isMobile }) => {
      test.skip(isMobile, '넓은 화면에서만 본다');
      await freezeDevReloads(page);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto(withBase(lab.path));
      const box = await page.evaluate(() => {
        const left = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().left ?? Number.NaN;
        const lab = document.querySelector('.lab')!.getBoundingClientRect();
        return { logo: left('.site-header__brand'), crumb: left('.breadcrumb'), title: left('h1.page-title'), lab: lab.left, labWidth: lab.width };
      });
      expect(Math.abs(box.title - box.logo), `제목 ${box.title} · 로고 ${box.logo}`).toBeLessThanOrEqual(2);
      expect(Math.abs(box.crumb - box.logo), `빵부스러기 ${box.crumb} · 로고 ${box.logo}`).toBeLessThanOrEqual(2);
      expect(box.lab).toBeLessThan(box.title); // 편집기·패널 칸은 제목보다 넓은 칸을 쓴다
      expect(box.labWidth).toBeLessThanOrEqual(1601);
    });

    // R1-108: 칸 배치는 화면 폭(@media)이 아니라 틀 폭(rem)으로 정한다 — html 글자 크기를 200%로 키우면 같은 화면에서도 한 열로 쌓인다.
    test('글자를 200%로 키우면 칸이 좁은 세 칸이 아니라 한 열로 쌓이고 가로로 넘치지 않는다', async ({ page, isMobile }) => {
      test.skip(isMobile, '데스크톱 화면(1366×768)에서 글자만 키워 본다');
      await freezeDevReloads(page);
      await page.goto(withBase(lab.path));
      await page.addStyleTag({ content: 'html { font-size: 200% }' });
      const columns = await page.locator('.lab__grid').evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length);
      expect(columns).toBe(1);
      await expectNoHorizontalOverflow(page, `${lab.name}(글자 200%)`);
    });
  });
}

test.describe('Tab 차례', () => {
  test.skip(({ isMobile }) => isMobile, '키보드 걷기는 데스크톱에서 본다.');
  test.describe.configure({ timeout: 120_000 });

  test('영상 처리 실습실: 설명 접힘 칸이 조작 줄 앞에 하나 늘 뿐, 코치 줄에는 멈추지 않고 [실행]에 닿는다', async ({ page }) => {
    await freezeDevReloads(page);
    await page.goto(withBase('labs/vision/'));
    const trail: string[] = [];
    let onRun = false;
    for (let press = 0; press < 30 && !onRun; press += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const active = document.activeElement;
        return {
          inCoach: active?.closest('[data-lab-coach]') !== null && active?.closest('[data-lab-coach]') !== undefined,
          label: (active?.getAttribute('aria-label') ?? active?.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 20),
          run: active?.hasAttribute('data-lab-run') ?? false,
        };
      });
      trail.push(info.label);
      expect(info.inCoach, `코치 줄에 멈췄다 — ${trail.join(' > ')}`).toBe(false);
      onRun = info.run;
    }
    expect(onRun, `Tab으로 [실행]에 닿는다 — ${trail.join(' > ')}`).toBe(true);
    // "처음 쓰는 법 자세히"가 [실행]보다 앞 차례다
    expect(trail.indexOf('처음 쓰는 법 자세히')).toBeGreaterThanOrEqual(0);
  });
});

test.describe('4단원 통합 화면', () => {
  test.describe.configure({ timeout: 120_000 });

  test('틀이 둘이어도 코치 줄은 한 번만 보인다', async ({ page }) => {
    await freezeDevReloads(page);
    await page.goto(withBase('labs/unit4/'));
    await expect(page.locator('[data-lab]')).toHaveCount(2);
    await expect(page.locator('[data-lab-coach]')).toHaveCount(1);
    await expect(page.getByRole('list', { name: '처음 쓰는 방법' })).toHaveCount(1);
  });
});

test.describe('실습실 기억하기', () => {
  test.describe.configure({ timeout: 120_000 });

  test('실습실 쪽을 열면 마지막 실습실로 기억되고, 임베드는 기억하지 않는다', async ({ page }) => {
    await freezeDevReloads(page);
    await page.goto(withBase('labs/iot/'));
    await expect.poll(async () => (await readStoredProgress(page))?.lastLab?.path ?? '').toBe(withBase('labs/iot/'));
    const stored = await readStoredProgress(page);
    expect(stored?.lastLab?.title).toBe(getPage('labs-iot').title);

    // 임베드로 연 다른 실습실은 마지막 실습실을 바꾸지 않는다
    await page.goto(`${withBase('labs/vision/')}?embed=1`);
    await expect(page.locator('[data-lab-run]')).toBeVisible();
    await page.waitForTimeout(500);
    expect((await readStoredProgress(page))?.lastLab?.path).toBe(withBase('labs/iot/'));
  });
});

test.describe('예제 갤러리', () => {
  test('카드에 단원 색 띠가 있고, 카드 전체가 [실습실에서 열기]로 눌리며, 안의 다른 링크는 따로 눌린다', async ({ page }) => {
    await page.goto(withBase('labs/gallery/'));
    const card = page.locator('[data-gallery-card][data-unit="1"]').first();
    await expect(card).toBeAttached();
    await card.scrollIntoViewIfNeeded();
    // 1단원 카드의 왼쪽 띠는 1단원 색(#1f5bd6)
    const band = await card.evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.borderInlineStartWidth, color: style.borderInlineStartColor };
    });
    expect(band.width).toBe('4px');
    expect(band.color).toBe('rgb(31, 91, 214)');
    // 카드 제목 위치를 눌러도 [실습실에서 열기] 링크가 맨 위다(덮개)
    const open = card.locator('.gallery-card__open');
    const href = await open.getAttribute('href');
    const topmost = await card.locator('.gallery-card__title').evaluate((title) => {
      const rect = title.getBoundingClientRect();
      return document.elementFromPoint(rect.left + 6, rect.top + rect.height / 2)?.closest('a')?.getAttribute('href') ?? '';
    });
    expect(topmost).toBe(href);
    // 차시 링크는 덮개 위에서 자기 주소로 간다(있는 카드만)
    const lessonLink = card.locator('.gallery-card__lesson').first();
    if ((await lessonLink.count()) > 0) {
      const lessonHref = await lessonLink.getAttribute('href');
      const lessonTop = await lessonLink.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('a')?.getAttribute('href') ?? '';
      });
      expect(lessonTop).toBe(lessonHref);
    }
  });

  test('320px에서 가로로 넘치지 않는다', async ({ page }) => {
    await page.setViewportSize(REFLOW_VIEWPORT);
    await page.goto(withBase('labs/gallery/'));
    await expectNoHorizontalOverflow(page, '예제 갤러리(320px)');
  });
});

// R1-097(판 1.3.0 검수): 실습실을 열자마자 12.9MB 엔진을 받기 시작해, 데이터를 아끼는 중인 휴대폰에서도 학생이 정하기 전에 데이터를 썼다.
test.describe('실습실 — 데이터 절약 모드에서는 [실행]을 눌러야 받는다', () => {
  test.describe.configure({ timeout: 180_000 });
  test.skip(({ isMobile }) => isMobile, '받는 일을 지켜보는 검사라 데스크톱 프로젝트에서만 돈다');

  test('Save-Data면 열어도 파이썬을 받지 않고 크기를 알리며, [실행]을 누르면 받기 시작하고 [정지]로 예약을 거둘 수 있다', async ({ page }) => {
    await freezeDevReloads(page);
    const requested: string[] = [];
    page.context().on('request', (request) => {
      if (/\/pyodide(?:\.asm)?\.(?:mjs|js|wasm)(?:$|\?)/u.test(request.url())) {
        requested.push(request.url());
      }
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { value: { saveData: true, type: 'cellular', effectiveType: '4g' }, configurable: true });
    });
    await page.goto(withBase('labs/vision/'));
    const root = page.locator('[data-lab]').first();
    await expect(root).toHaveAttribute('data-load-deferred', 'yes');
    await expect(root).toHaveAttribute('data-state', 'unloaded');
    await expect(page.locator('[data-lab-status]')).toHaveText('[실행]을 누르면 시작해요.');
    await expect(page.locator('[data-lab-message]')).toContainText('처음 한 번만');
    await expect(page.locator('[data-lab-message]')).toContainText('MB');
    await page.waitForTimeout(4000);
    expect(requested, `받기 전에 요청한 파일: ${requested.join(', ')}`).toEqual([]);

    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(root).toHaveAttribute('data-load-deferred', 'started');
    await expect.poll(() => requested.length, { timeout: 60_000 }).toBeGreaterThan(0);
    await page.getByRole('button', { name: '정지', exact: true }).click();
  });
});

// R1-112(판 1.3.0 검수): 실행 중에 코드를 고치고 Ctrl+Enter를 눌러도 아무 안내 없이 무시돼 고친 코드가 적용된 줄 알았다.
test.describe('실습실 — 실행 중에 다시 실행하면', () => {
  test.describe.configure({ timeout: 240_000 });
  test.skip(({ isMobile }) => isMobile, '가상 보드를 돌리는 검사라 데스크톱 프로젝트에서만 돈다');

  test('Ctrl+Enter를 눌러도 새 코드가 돌지 않는다는 것과 먼저 [정지]를 누르라는 안내가 나온다', async ({ page }) => {
    await freezeDevReloads(page);
    await page.goto(withBase('labs/esp32/'));
    const root = page.locator('[data-lab]').first();
    await expect(root).toHaveAttribute('data-state', 'idle', { timeout: 180_000 });
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(root).toHaveAttribute('data-state', 'running', { timeout: 60_000 });
    await page.locator('[data-lab-editor] .cm-content').click();
    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(page.locator('[data-lab-message]')).toContainText('먼저 [정지]를 누르고');
    // 안내만 하고 실행을 다시 시작하지 않는다(실행 횟수가 그대로)
    await expect(root).toHaveAttribute('data-run-count', '1');
    await page.getByRole('button', { name: '정지', exact: true }).click();
    await expect(root).toHaveAttribute('data-state', 'idle', { timeout: 60_000 });
  });
});
