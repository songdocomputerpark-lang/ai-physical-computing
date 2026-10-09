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
  test('배우기 첫 쪽은 "처음이면 1단원 1-1-1부터" 주 단추 하나이고, 진도 글·막대는 숨어 있으며, 진도를 저장하지 않는다', async ({ page }) => {
    await page.goto('./learn/');
    const start = page.getByRole('link', { name: '처음이면 1단원 1-1-1부터' });
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
    // 링크 이름에 가는 차시가 들어간다(R1-092) — 보이는 글 "이어서 하기"가 이름 끝에 그대로 든다
    await expect(resume).toHaveAccessibleName(/^1-1-2 .+ 이어서 하기$/u);
    await expect(page.locator('[data-start-title]')).toContainText('1-1-2');
    await expect(page.locator('[data-learn-start]')).toHaveAttribute('data-start-mode', 'resume');
    const card = page.locator(`[data-progress-lesson="${LESSON_2}"]`);
    await expect(card).toHaveAttribute('data-progress-state', 'seen');
    await expect(card.locator('[data-progress-badge]')).toHaveText('열어 봤어요');
    // 링크 접근 이름은 진도 글 때문에 바뀌지 않는다
    await expect(card.getByRole('link')).toHaveAccessibleName('1-1-2 인공지능 영상 인식 기술의 원리');
    // 단원 진도 글·막대가 나타난다
    const unit = page.locator('[data-progress-unit]').first();
    await expect(unit.locator('[data-progress-count]')).toHaveText('18차시 중 1차시를 열어 봤어요');
    // 막대는 글(위 줄)과 같은 말이라 화면 낭독기에서는 숨기고(aria-hidden), 이름만 달아 둔다
    await expect(unit.locator('[data-progress-bar]')).toHaveAttribute('aria-hidden', 'true');
    await expect(unit.locator('[data-progress-bar]')).toHaveAttribute('aria-label', /1단원 18차시 중 1차시를 열어 봤어요/u);
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

    // 대단원 쪽: 카드는 "다 했어요", 진도 글은 "N차시를 다 했어요"
    await page.goto(`.${learnUnits[0]!.path}`);
    const card = page.locator(`[data-progress-lesson="${LESSON_2}"]`);
    await expect(card.locator('[data-progress-badge]')).toHaveText('다 했어요');
    await expect(page.locator('[data-progress-unit] [data-progress-count]').first()).toHaveText('18차시 중 1차시를 다 했어요');

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
  test('지난번 차시를 다 했으면 그 뒤 안 본 차시에 "다음에 볼 차시" 표와 시작 카드("시작하기")가 붙는다', async ({ page }) => {
    await seed(page, { version: 1, seen: [LESSON_1], done: [LESSON_1], last: { ...LAST, id: LESSON_1, label: '1-1-1', href: withBase('learn/u1/1-1-1/') }, lastLab: null });
    await page.goto(`.${learnUnits[0]!.path}`);
    const next = page.locator('.lesson-card[data-next]');
    await expect(next).toHaveCount(1);
    await expect(next).toHaveAttribute('data-progress-lesson', LESSON_2);
    await expect(next.locator('[data-next-flag]')).toHaveText('다음에 볼 차시');
    // 처음 하는 차시라 "이어서 하기"가 아니라 "시작하기"(R2-021)
    const start = page.locator('[data-learn-start]').getByRole('link', { name: /시작하기$/u });
    await expect(start).toHaveAttribute('href', withBase('learn/u1/1-1-2/'));
    await expect(page.locator('[data-learn-start]')).toHaveAttribute('data-start-mode', 'next');
  });

  test('1-1-3을 다 했으면 안 본 1-1-1이 아니라 1-2-1을 권하고, 선택 보충 V1은 권하지 않는다(R2-020·R2-021)', async ({ page }) => {
    await seed(page, {
      version: 1,
      seen: ['u1/1-1-3'],
      done: ['u1/1-1-3'],
      last: { ...LAST, id: 'u1/1-1-3', label: '1-1-3', href: withBase('learn/u1/1-1-3/') },
      lastLab: null,
    });
    await page.goto(`.${learnUnits[0]!.path}`);
    const next = page.locator('.lesson-card[data-next]');
    await expect(next).toHaveCount(1);
    await expect(next).toHaveAttribute('data-progress-lesson', 'u1/1-2-1');
    await expect(page.locator('[data-progress-lesson="u1/v1"]')).not.toHaveAttribute('data-next', /.*/u);
    await expect(page.locator('[data-learn-start] [data-start-button]')).toHaveAttribute('href', withBase('learn/u1/1-2-1/'));
    await expect(page.locator('[data-learn-start] [data-start-button-text]')).toHaveText('시작하기');
    // 배우기 첫 쪽도 같은 규칙과 같은 말이다
    await page.goto('./learn/');
    await expect(page.locator('[data-learn-start] [data-start-kicker]')).toHaveText('다음에 볼 차시');
    await expect(page.locator('[data-learn-start] [data-start-button-text]')).toHaveText('시작하기');
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
    // 마친 차시는 "다 했어요" 글이 따라 읽힌다(링크 밖)
    await expect(page.locator(`[data-lesson-nav] [data-progress-lesson="${LESSON_1}"] [data-progress-badge]`)).toHaveText('다 했어요');
    // 단원 진도 글: 펼친 머리와 접힌 요약 줄(좁은 화면에서 펼치지 않아도 보인다 — R1-087) 둘 다
    const counts = page.locator('[data-lesson-nav] [data-progress-count]');
    await expect(counts).toHaveCount(2);
    await expect(counts.first()).toContainText('18차시 중 1차시를 다 했어요');
    await expect(counts.last()).toContainText('18차시 중 1차시를 다 했어요');
    if (isMobile) {
      // 접힌 목록의 요약 줄에 진도 글이 보인다(목록을 펼치기 전)
      await expect(page.locator('[data-lesson-nav] > summary [data-progress-count]')).toBeVisible();
    }
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
    await expect(page.locator('.lesson__where')).toContainText('이 단원의 2번째 차시');
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

test.describe('판 1.3.0 검수 R1 — 다 했어요 뒤 다음 할 일 · 건너뛰기 · 단원 소개 · 다음 단원', () => {
  test('[이 차시 다 했어요]를 누르면 칭찬과 다음 차시로 가는 링크가 나타나고, 끄면 사라진다(R1-081)', async ({ page }) => {
    await page.goto('./learn/u1/1-1-2/');
    const next = page.locator('[data-lesson-done-next]');
    await expect(next).toBeHidden();
    await expect(page.locator('.lesson-done__title-on')).toBeHidden();
    await page.getByRole('button', { name: '이 차시 다 했어요' }).click();
    await expect(next).toBeVisible();
    await expect(next).toHaveAttribute('href', withBase('learn/u1/1-1-3/'));
    await expect(next).toContainText('다음 차시 1-1-3');
    // 퀴즈를 몇 개 맞혔는지와 상관없는 중립적인 말, 되돌리는 법 안내(R2-019)
    await expect(page.locator('.lesson-done__title-on')).toContainText('1-1-2 다 했다고 표시했어요');
    await expect(page.locator('.lesson-done__hint-on')).toBeVisible();
    await expect(page.locator('.lesson-done__hint-on')).toContainText('한 번 더 눌러요');
    await expect(page.locator('.lesson-done__hint-off')).toBeHidden();
    await expect(page.locator('[data-lesson-done-status]')).toContainText('한 번 더 누르면 풀려요');
    await expect(page.locator('[data-lesson-done-status]')).toContainText('다음 차시: 1-1-3');
    // 다시 열어도(이미 다 했다고 표시한 차시) 링크가 보인다
    await page.reload();
    await expect(page.locator('[data-lesson-done-next]')).toBeVisible();
    await page.getByRole('button', { name: '이 차시 다 했어요' }).click();
    await expect(page.locator('[data-lesson-done-next]')).toBeHidden();
  });

  test('1-1-3에서 [이 차시 다 했어요]를 누르면 선택 보충 V1이 아니라 1-2-1을 권하고, 아래 카드에는 V1이 "건너뛰어도 돼요"와 함께 남는다(R2-020)', async ({ page }) => {
    await page.goto('./learn/u1/1-1-3/');
    await page.getByRole('button', { name: '이 차시 다 했어요' }).click();
    const next = page.locator('[data-lesson-done-next]');
    await expect(next).toHaveAttribute('href', withBase('learn/u1/1-2-1/'));
    await expect(next).toContainText('다음 차시 1-2-1');
    const pagerNext = page.getByRole('navigation', { name: '이전·다음 차시' }).getByRole('link', { name: /다음 차시/u });
    await expect(pagerNext).toHaveAttribute('href', withBase('learn/u1/v1/'));
    await expect(pagerNext).toContainText('건너뛰어도 돼요');
  });

  test('[본문으로 건너뛰기]는 차시 목록을 건너뛰고 본문으로 간다(R1-080)', async ({ page, isMobile }) => {
    test.skip(isMobile, '키보드 조작은 데스크톱에서 본다');
    await page.goto('./learn/u1/1-1-2/');
    await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#lesson-article');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: '본문으로 건너뛰기' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#lesson-article')).toBeFocused();
    await page.keyboard.press('Tab');
    // 다음 Tab은 단원 차시 목록이 아니라 본문 안의 조작이다
    expect(await page.evaluate(() => document.activeElement?.closest('[data-lesson-nav]') !== null)).toBe(false);
    expect(await page.evaluate(() => document.activeElement?.closest('#lesson-article') !== null)).toBe(true);
  });

  test('대단원 쪽에는 "마치면 할 수 있는 것" 3줄·큰 그림 속 자리·걸리는 시간이 있고, 처음에는 진도 자리가 비어 있지 않다(R1-083·R1-089)', async ({ page }) => {
    await page.goto(`.${learnUnits[0]!.path}`);
    await expect(page.getByRole('heading', { level: 2, name: '이 단원을 마치면 할 수 있어요' })).toBeVisible();
    await expect(page.locator('.unit-about__list li')).toHaveCount(3);
    await expect(page.locator('.unit-about .flow-position__stage')).toHaveCount(3);
    await expect(page.locator('.unit-about .flow-position__stage[data-on="true"]')).toHaveCount(2);
    await expect(page.locator('.unit-about__time')).toContainText('17차시 × 50분 = 14시간 10분(시간이 정해지지 않은 1차시는 빼고 셌어요)');
    // 본 차시가 없으면 진도 막대 자리는 사라진다(머리띠 아래에 빈 칸이 남지 않는다)
    await expect(page.locator('.unit-head__progress')).toBeHidden();
    const head = await page.locator('.unit-head').boundingBox();
    const about = await page.locator('.unit-about').boundingBox();
    expect(head!.y + head!.height - (about!.y + about!.height), '소개 상자 아래의 여백').toBeLessThan(40);
  });

  test('차시 머리에 큰 그림 속 단원 자리가 있고, 위치 글은 "이 단원의 N번째 차시"이며 마무리 이전 버튼은 읽히는 이름이다(R1-067·R1-082·R1-084)', async ({ page }) => {
    await page.goto('./learn/u1/1-1-1/');
    await expect(page.locator('.lesson__header .flow-position__stage[data-on="true"]')).toHaveCount(2);
    await expect(page.locator('.lesson__where')).toContainText('이 단원의 1번째 차시');
    await expect(page.locator('.lesson__where')).not.toContainText('차시 중');
    await page.goto('./learn/u2/2-1-1/');
    await expect(page.getByRole('navigation', { name: '차시 이동' }).getByRole('link', { name: /^이전/u })).toContainText('1단원 마무리');
    await page.goto('./learn/u3/3-1-1/');
    await expect(page.getByRole('navigation', { name: '차시 이동' }).getByRole('link', { name: /^이전/u })).toContainText('2단원 마무리');
  });

  test('보충 차시는 묶음 제목에 "(선택)"이, 차시 목록에 "보충" 칩이 붙는다(R1-086)', async ({ page, isMobile }) => {
    await page.goto(`.${learnUnits[0]!.path}`);
    await expect(page.getByRole('heading', { level: 2, name: '보충: 영상 처리 기초 (선택)' })).toBeVisible();
    await page.goto('./learn/u1/1-1-3/');
    if (isMobile) {
      await page.getByText('이 단원 차시 목록 펼치기').click();
    }
    const nav = page.getByRole('navigation', { name: '단원 차시 목록' });
    const v1 = nav.getByRole('link', { name: /^V1 보충 /u });
    await expect(v1).toBeVisible();
    await expect(v1.locator('.lesson-nav__kind')).toHaveText('보충');
    await expect(nav.getByRole('link', { name: /^1-1-3 / }).locator('.lesson-nav__kind')).toHaveCount(0);
  });

  test('이 단원을 모두 봤으면 시작 카드가 다음 대단원으로 이어 주고 "처음부터 다시 보기"는 보조 링크가 된다(R1-088)', async ({ page }) => {
    await page.goto(`.${learnUnits[0]!.path}`);
    const ids = await page.locator('[data-progress-lesson]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-progress-lesson') ?? ''));
    expect(ids.length).toBeGreaterThan(10);
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key as string, value as string),
      [KEY, JSON.stringify({ version: 1, seen: ids, done: ids, last: null, lastLab: null })],
    );
    await page.reload();
    const start = page.locator('[data-learn-start]');
    await expect(start).toHaveAttribute('data-start-mode', 'review');
    await expect(start).toHaveAttribute('data-start-next', 'first');
    const primary = start.locator('.button--primary');
    await expect(primary).toHaveCount(1);
    await expect(primary).toContainText('2단원 시작하기');
    await expect(primary).toHaveAttribute('href', withBase('learn/u2/2-1-1/'));
    const again = start.getByRole('link', { name: '처음부터 다시 보기' });
    await expect(again).toBeVisible();
    await expect(again).toHaveAttribute('href', withBase('learn/u1/1-1-1/'));
    await expect(page.locator('main .button--primary')).toHaveCount(1);
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
    await expect(page.getByRole('link', { name: '처음이면 1단원 1-1-1부터' })).toBeVisible();
    await page.goto('./learn/u1/1-1-2/');
    await expect(page.getByRole('button', { name: '이 차시 다 했어요' })).toHaveAttribute('aria-pressed', 'false');
    expect(errors).toEqual([]);
  });

  test('자바스크립트가 꺼져 있으면 시작 카드는 처음 상태, 다 했어요 상자는 숨고, 차시 목록은 접힌 details로 쓸 수 있다', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    await page.goto('./learn/');
    await expect(page.getByRole('link', { name: '처음이면 1단원 1-1-1부터' })).toBeVisible();
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
