/**
 * 실습실 구역 화면 개편(판 1.3.0 "설명 없이 쓰는 사이트" X 구역) 브라우저 테스트.
 *
 * 무엇을 보나
 *   1. 실습실 안내(/labs/): 맨 위 "무엇을 할까요?" 고르기 3개가 첫 화면에 보이고, 카드는 어디를 눌러도 열리며, 안의 작은 링크는 따로 눌린다.
 *   2. 영상처리·ESP32 실습실: 긴 설명은 접혀 있고(Tab 정지점 하나), [실행]·코치 줄이 첫 화면 위쪽에 들어온다. 코치 줄(① 예제 고르기 → ② [실행] → ③ 결과 보기)이
 *      Tab 정지점 없이 조작 줄 아래에 있고, 실행 횟수(data-run-count)로만 단계가 칠해진다. [실행] 접근 이름은 "실행" 그대로.
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
    const card = page.locator('.lab-card', { has: page.getByRole('heading', { level: 2, name: esp32.title }) });
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
  { path: 'labs/vision/', name: '영상처리 실습실', intro: '.vision-intro' },
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
      await expect(coach.getByRole('listitem')).toHaveText(['예제 고르기', '[실행] 누르기', '결과 보기']);
      // Tab 정지점이 없다
      expect(await coach.locator('a, button, input, select, textarea, summary, [tabindex]').count()).toBe(0);
      // 조작 줄 바로 아래, 상태 줄 위
      const order = await page.evaluate(() => {
        const toolbar = document.querySelector('[data-lab-toolbar]')!.getBoundingClientRect();
        const coachBox = document.querySelector('[data-lab-coach]')!.getBoundingClientRect();
        const status = document.querySelector('.lab__status')!.getBoundingClientRect();
        return { toolbarBottom: toolbar.bottom, coachTop: coachBox.top, coachBottom: coachBox.bottom, statusTop: status.top };
      });
      expect(order.coachTop).toBeGreaterThanOrEqual(order.toolbarBottom);
      expect(order.coachBottom).toBeLessThanOrEqual(order.statusTop);
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
  });
}

test.describe('Tab 차례', () => {
  test.skip(({ isMobile }) => isMobile, '키보드 걷기는 데스크톱에서 본다.');
  test.describe.configure({ timeout: 120_000 });

  test('영상처리 실습실: 설명 접힘 칸이 조작 줄 앞에 하나 늘 뿐, 코치 줄에는 멈추지 않고 [실행]에 닿는다', async ({ page }) => {
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
