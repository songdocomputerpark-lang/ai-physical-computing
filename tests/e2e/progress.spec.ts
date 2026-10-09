// 배우기 학습 진도·단원 차시 목록(판 1.3.0, 구역 L): 차시를 열면 "봤어요", [이 차시 다 했어요] 토글, 퀴즈를 모두 맞히면 저절로 다 했어요,
// 배우기 첫 쪽 "이어서 하기", 대단원 쪽 "다음에 볼 차시", 차시 쪽 단원 차시 목록(넓은 화면 옆 목록 / 좁은 화면 접힘), 발표 모드에서 새 요소 숨김.
// 진도는 이 컴퓨터(localStorage)에만 저장한다. 데스크톱(1366×768)·휴대폰(375×812) 모두에서 돈다.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { learnUnits } from '../../src/config/nav.ts';
import { REFLOW_VIEWPORT, expectNoHorizontalOverflow } from './helpers/reflow.ts';
import { PROGRESS_STORAGE_NAME } from '../../src/lib/progress.ts';
import { storageKey, STORAGE_KEY_PREFIX } from '../../src/lib/storage.ts';
import { withBase } from '../../src/lib/url.ts';

const KEY = storageKey(PROGRESS_STORAGE_NAME);

/** 개발 서버에서 돌 때 다른 사람이 파일을 고칠 때마다 쪽이 새로 고쳐지는 신호만 거른다(빌드 결과에는 이 연결이 없어 아무 일도 하지 않는다 — a11y-keyboard.spec.ts와 같은 방법) */
test.beforeEach(async ({ page }) => {
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
});
const LESSON_1 = 'u1/1-1-1';
const LESSON_2 = 'u1/1-1-2';

async function readState(page: Page): Promise<{ seen: string[]; done: string[]; last: { id: string } | null }> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{"seen":[],"done":[],"last":null}'), KEY);
}

/** 쪽을 열기 전에 진도를 심는다(이 쪽 주소를 열 때마다 같은 값으로 시작하지 않게 한 번만) */
async function seed(page: Page, state: object): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(key as string, value as string);
        sessionStorage.setItem('seeded', '1');
      }
    },
    [KEY, JSON.stringify(state)],
  );
}

const LAST = {
  id: LESSON_2,
  href: withBase('learn/u1/1-1-2/'),
  label: '1-1-2',
  title: '인공지능 영상 인식 기술의 원리',
  at: 1_760_000_000_000,
};

test.describe('처음 온 사람: 진도 글이 보이지 않는다', () => {
  test('배우기 첫 쪽은 "처음이면 I단원 1-1-1부터" 주 단추 하나이고, 진도 글·막대는 숨어 있으며, 진도를 저장하지 않는다', async ({ page }) => {
    await page.goto('./learn/');
    const start = page.getByRole('link', { name: '처음이면 I단원 1-1-1부터' });
    await expect(start).toBeVisible();
    await expect(start).toHaveAttribute('href', withBase('learn/u1/1-1-1/'));
    // 채운 파랑 주 단추는 본문에 이것 하나뿐
    await expect(page.locator('main .button--primary')).toHaveCount(1);
    // 진도 글("N차시 중 M개")은 숨어 있다(자리는 남아 쪽이 밀리지 않는다)
    for (const unit of await page.locator('[data-progress-unit]').all()) {
      await expect(unit.locator('[data-progress-count]')).toBeHidden();
      await expect(unit.locator('[data-progress-bar]')).toBeHidden();
    }
    await expect(page.locator('[data-progress-badge]:not(:empty)')).toHaveCount(0);
    expect(await page.evaluate((prefix) => Object.keys(localStorage).filter((key) => key.startsWith(prefix) && key.includes('progress')), STORAGE_KEY_PREFIX)).toEqual([]);
  });

  test('대단원 쪽은 안 본 첫 차시에 "여기서 시작" 표가 붙는다', async ({ page }) => {
    await page.goto(`.${learnUnits[1]!.path}`);
    const first = page.locator('.lesson-card[data-progress-lesson]').first();
    await expect(first).toHaveAttribute('data-next', '');
    await expect(first.locator('[data-next-flag]')).toHaveText('여기서 시작');
    await expect(page.locator('.lesson-card[data-next]')).toHaveCount(1);
  });
});

test.describe('차시를 열고 닫는 흐름', () => {
  test('차시를 열면 봤어요가 저장되고, 배우기 첫 쪽이 "이어서 하기"로 바뀌며 카드에 "봤어요"가 붙는다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-2/');
    await expect.poll(async () => (await readState(page)).seen).toEqual([LESSON_2]);
    const state = await readState(page);
    expect(state.last?.id).toBe(LESSON_2);

    await page.goto('./learn/');
    const resume = page.getByRole('link', { name: '이어서 하기' });
    await expect(resume).toHaveAttribute('href', withBase('learn/u1/1-1-2/'));
    await expect(page.locator('[data-start-title]')).toContainText('1-1-2');
    await expect(page.locator('[data-learn-start]')).toHaveAttribute('data-start-mode', 'resume');
    const card = page.locator(`[data-progress-lesson="${LESSON_2}"]`);
    await expect(card).toHaveAttribute('data-progress-state', 'seen');
    await expect(card.locator('[data-progress-badge]')).toHaveText('봤어요');
    // 링크 접근 이름은 진도 글 때문에 바뀌지 않는다
    await expect(card.getByRole('link')).toHaveAccessibleName('1-1-2 인공지능 영상 인식 기술의 원리');
    // 단원 진도 글·막대가 나타난다
    const unit = page.locator('[data-progress-unit]').first();
    await expect(unit.locator('[data-progress-count]')).toHaveText('18차시 중 1개 봤어요');
    // 막대는 글(위 줄)과 같은 말이라 화면 낭독기에서는 숨기고(aria-hidden), 이름만 달아 둔다
    await expect(unit.locator('[data-progress-bar]')).toHaveAttribute('aria-hidden', 'true');
    await expect(unit.locator('[data-progress-bar]')).toHaveAttribute('aria-label', /I단원 18차시 중 1개 봤어요/u);
  });

  test('[이 차시 다 했어요]: 켜고 끄면 aria-pressed·저장·낭독 글이 바뀌고, 다시 열어도 켜져 있다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-2/');
    const toggle = page.getByRole('button', { name: '이 차시 다 했어요' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-lesson-done-status]')).toContainText('다 했다고 표시했어요');
    expect((await readState(page)).done).toEqual([LESSON_2]);
    // 단추 이름은 바뀌지 않는다(토글은 aria-pressed로 알린다)
    await expect(page.getByRole('button', { name: '이 차시 다 했어요' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: '이 차시 다 했어요' })).toHaveAttribute('aria-pressed', 'true');

    // 대단원 쪽: 카드는 "다 했어요", 진도 글은 "끝냄"
    await page.goto(`.${learnUnits[0]!.path}`);
    const card = page.locator(`[data-progress-lesson="${LESSON_2}"]`);
    await expect(card.locator('[data-progress-badge]')).toHaveText('다 했어요');
    await expect(page.locator('[data-progress-unit] [data-progress-count]').first()).toHaveText('18차시 중 1개 끝냄');

    await page.goBack();
    await page.getByRole('button', { name: '이 차시 다 했어요' }).click();
    await expect(page.getByRole('button', { name: '이 차시 다 했어요' })).toHaveAttribute('aria-pressed', 'false');
    expect((await readState(page)).done).toEqual([]);
    expect((await readState(page)).seen).toContain(LESSON_2);
  });

  test('확인 퀴즈를 모두 맞히면 저절로 "다 했어요"가 켜지고, 틀리면 켜지지 않는다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    const items = page.locator('[data-quiz-item]');
    const count = await items.count();
    expect(count).toBeGreaterThan(1);
    const toggle = page.getByRole('button', { name: '이 차시 다 했어요' });
    const answerOf = async (index: number): Promise<number> => Number(await items.nth(index).getAttribute('data-answer'));
    const choose = async (index: number, choice: number): Promise<void> => {
      await items.nth(index).getByRole('radio').nth(choice).check();
      await items.nth(index).getByRole('button', { name: '답 확인하기' }).click();
    };
    // 하나만 틀리게 풀고 나머지는 맞힌다 → 아직 켜지지 않는다
    const firstAnswer = await answerOf(0);
    await choose(0, firstAnswer === 0 ? 1 : 0);
    for (let index = 1; index < count; index += 1) {
      await choose(index, await answerOf(index));
    }
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    // 틀린 것을 고쳐 맞히면 켜진다
    await choose(0, firstAnswer);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-lesson-done-status]')).toContainText('퀴즈를 모두 맞혀서');
    expect((await readState(page)).done).toContain(LESSON_1);
  });
});

test.describe('대단원 쪽: 다음에 볼 차시', () => {
  test('안 본 첫 차시에 "다음에 볼 차시" 표와 시작 카드("이어서 하기")가 붙는다', async ({ page }) => {
    await seed(page, { version: 1, seen: [LESSON_1], done: [LESSON_1], last: { ...LAST, id: LESSON_1, label: '1-1-1', href: withBase('learn/u1/1-1-1/') }, lastLab: null });
    await page.goto(`.${learnUnits[0]!.path}`);
    const next = page.locator('.lesson-card[data-next]');
    await expect(next).toHaveCount(1);
    await expect(next).toHaveAttribute('data-progress-lesson', LESSON_2);
    await expect(next.locator('[data-next-flag]')).toHaveText('다음에 볼 차시');
    const start = page.getByRole('link', { name: '이어서 하기' });
    await expect(start).toHaveAttribute('href', withBase('learn/u1/1-1-2/'));
    await expect(page.locator('[data-learn-start]')).toHaveAttribute('data-start-mode', 'next');
  });
});

test.describe('차시 쪽 단원 차시 목록', () => {
  test('넓은 화면은 옆에 펼쳐져 있고 지금 차시가 aria-current이며, 좁은 화면은 접힌 details이다', async ({ page, isMobile }) => {
    await seed(page, { version: 1, seen: [LESSON_1], done: [LESSON_1], last: null, lastLab: null });
    await page.goto('./learn/u1/1-1-2/');
    const nav = page.getByRole('navigation', { name: '단원 차시 목록' });
    const summary = page.getByText('이 단원 차시 목록 펼치기');
    if (isMobile) {
      await expect(summary).toBeVisible();
      await expect(nav).toBeHidden();
      // 목록의 링크는 펼치기 전에는 Tab 차례에 없다
      expect(await page.locator('[data-lesson-nav] a:visible').count()).toBe(0);
      await summary.click();
      await expect(nav).toBeVisible();
    } else {
      await expect(summary).toBeHidden();
      await expect(nav).toBeVisible();
      // 본문 옆(왼쪽)에 있다
      const navBox = await nav.boundingBox();
      const articleBox = await page.locator('#lesson-article').boundingBox();
      expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(articleBox!.x + 1);
      // 본문 폭은 그대로 44rem 이하다(그림·표·실습실 칸 폭을 지킨다)
      const rem = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
      expect(articleBox!.width).toBeLessThanOrEqual(44 * rem + 1);
    }
    const current = nav.locator('a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toContainText('1-1-2');
    // 다 한 차시는 "다 했어요" 글이 따라 읽힌다(링크 밖)
    await expect(page.locator(`[data-lesson-nav] [data-progress-lesson="${LESSON_1}"] [data-progress-badge]`)).toHaveText('다 했어요');
    // 단원 진도 글
    await expect(page.locator('[data-lesson-nav] [data-progress-count]')).toContainText('18차시 중 1개 끝냄');
    // 목록의 차시 링크 수 = 이 단원의 공개 차시 수
    expect(await nav.locator('li[data-progress-lesson] a').count()).toBe(18);
  });

  test('목록에서 다른 차시로 가면 그 차시가 aria-current이고 본 차시가 늘어난다', async ({ page, isMobile }) => {
    await page.goto('./learn/u1/1-1-2/');
    if (isMobile) {
      await page.getByText('이 단원 차시 목록 펼치기').click();
    }
    const nav = page.getByRole('navigation', { name: '단원 차시 목록' });
    await nav.getByRole('link', { name: /^1-1-3/u }).click();
    await expect(page).toHaveURL(new RegExp(`${withBase('learn/u1/1-1-3/')}$`, 'u'));
    await expect.poll(async () => (await readState(page)).seen).toEqual([LESSON_2, 'u1/1-1-3']);
  });

  test('위쪽 "몇 번째" 줄과 [이전]·[다음] 링크(차시 이동)가 있고, 아래쪽 이전·다음 카드 이름은 그대로다', async ({ page }) => {
    await page.goto('./learn/u1/1-1-2/');
    const where = page.getByRole('navigation', { name: '차시 이동' });
    await expect(page.locator('.lesson__where')).toContainText('18차시 중 2번째');
    await expect(where.getByRole('link', { name: /^이전/u })).toHaveAttribute('href', withBase('learn/u1/1-1-1/'));
    await expect(where.getByRole('link', { name: /^다음/u })).toHaveAttribute('href', withBase('learn/u1/1-1-3/'));
    const pager = page.getByRole('navigation', { name: '이전·다음 차시' });
    await expect(pager.getByRole('link', { name: /이전 차시/u })).toHaveAttribute('href', withBase('learn/u1/1-1-1/'));
    await expect(pager.getByRole('link', { name: /다음 차시/u })).toHaveAttribute('href', withBase('learn/u1/1-1-3/'));
    // 첫 차시에는 이전 링크가 없다
    await page.goto('./learn/u1/1-1-1/');
    await expect(page.getByRole('navigation', { name: '차시 이동' }).getByRole('link', { name: /^이전/u })).toHaveCount(0);
  });

  test('발표 모드에서는 단원 차시 목록·위쪽 줄·다 했어요 상자가 숨고, 끝내면 돌아온다', async ({ page, isMobile }) => {
    test.skip(isMobile, '발표 모드는 데스크톱에서 본다(휴대폰은 lesson-template.spec이 본다)');
    await page.goto('./learn/u1/1-1-2/');
    await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
    await expect(page.getByRole('navigation', { name: '단원 차시 목록' })).toBeVisible();
    await page.getByRole('button', { name: '발표 모드' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-presenting', '');
    await expect(page.getByRole('navigation', { name: '단원 차시 목록' })).toBeHidden();
    await expect(page.getByRole('navigation', { name: '차시 이동' })).toBeHidden();
    await expect(page.locator('[data-lesson-done]')).toBeHidden();
    // 본문은 한 열(목록 자리가 비지 않는다)
    const articleBox = await page.locator('#lesson-article').boundingBox();
    const width = page.viewportSize()!.width;
    expect(articleBox!.x).toBeGreaterThan(width * 0.05);
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-presenting', '');
    await expect(page.getByRole('navigation', { name: '단원 차시 목록' })).toBeVisible();
  });
});

test.describe('저장이 막히거나 깨진 값이어도 쪽은 멀쩡하다', () => {
  test('깨진 진도 값이 들어 있어도 목록·차시가 열리고 빈 진도로 시작한다', async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, '{"version":1,"seen":"x","done":[1,2],"last":{"href":"https://example.org/"}}');
    }, KEY);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./learn/');
    await expect(page.getByRole('link', { name: '처음이면 I단원 1-1-1부터' })).toBeVisible();
    await page.goto('./learn/u1/1-1-2/');
    await expect(page.getByRole('button', { name: '이 차시 다 했어요' })).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]);
  });

  test('자바스크립트가 꺼져 있으면 시작 카드는 처음 상태, 다 했어요 상자는 숨고, 차시 목록은 접힌 details로 쓸 수 있다', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    await page.goto('./learn/');
    await expect(page.getByRole('link', { name: '처음이면 I단원 1-1-1부터' })).toBeVisible();
    await page.goto('./learn/u1/1-1-2/');
    await expect(page.locator('[data-lesson-done]')).toBeHidden();
    await expect(page.getByText('이 단원 차시 목록 펼치기')).toBeVisible();
    await page.getByText('이 단원 차시 목록 펼치기').click();
    await expect(page.getByRole('navigation', { name: '단원 차시 목록' })).toBeVisible();
    await context.close();
  });
});

test.describe('접근성(axe) — 진도가 있을 때와 없을 때', () => {
  // 차시 쪽은 DOM이 커서 axe가 느린 컴퓨터에서 20초 넘게 걸린다(기본 30초 제한에 걸려 거짓으로 실패했다)
  test.describe.configure({ timeout: 120_000 });
  const PAGES = ['./learn/', `.${learnUnits[0]!.path}`, './learn/u1/1-1-2/'];
  for (const withProgress of [false, true]) {
    for (const address of PAGES) {
      test(`${address} ${withProgress ? '(진도 있음)' : '(처음)'}: critical·serious 0, 가로 넘침 0`, async ({ page, isMobile }) => {
        if (withProgress) {
          await seed(page, { version: 1, seen: [LESSON_1, LESSON_2], done: [LESSON_1], last: LAST, lastLab: null });
        }
        await page.goto(address);
        await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
        if (isMobile && address.includes('1-1-2')) {
          await page.getByText('이 단원 차시 목록 펼치기').click();
        }
        await page.waitForTimeout(300);
        const results = await new AxeBuilder({ page }).exclude('astro-dev-toolbar').analyze();
        const severe = results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
        expect(severe.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      });
    }
  }
});

test.describe('320px 재배치(WCAG 1.4.10) — 진도가 있어도 가로로 넘치지 않는다', () => {
  test('배우기·대단원·차시(목록을 펼친 채) 모두 320px에서 넘치지 않는다', async ({ page }) => {
    await seed(page, { version: 1, seen: [LESSON_1, LESSON_2], done: [LESSON_1], last: LAST, lastLab: null });
    await page.setViewportSize(REFLOW_VIEWPORT);
    for (const address of ['./learn/', `.${learnUnits[0]!.path}`, './learn/u1/1-1-2/']) {
      await page.goto(address);
      await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
      if (address.includes('1-1-2')) {
        await page.getByText('이 단원 차시 목록 펼치기').click();
      }
      await page.waitForTimeout(300);
      await expectNoHorizontalOverflow(page, address);
    }
  });
});
