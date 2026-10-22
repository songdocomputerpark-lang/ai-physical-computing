/**
 * 차시 페이지의 실습실 임베드(P2-14, SPEC §7.2 4번 "실습실 임베드 — 예제가 미리 로드된 상태").
 *
 * 확인하는 것
 *   1. [이 자리에서 실습실 열기]를 **누르기 전에는** 실습실 파일(실습실 스크립트·Pyodide)을 하나도 받지 않는다.
 *   2. 누르면 그 자리에 <iframe>이 생기고, 안의 실습실이 그 차시의 예제를 **미리 올린 채로** 열린다.
 *   3. 임베드 안에서는 머리글·바닥글이 숨고(?embed=1), 실습실 틀은 그대로 보인다.
 *   4. [실습실에서 열기]는 "(준비 중)" 없이 같은 예제로 실습실 페이지를 연다.
 *   5. 좁은 화면에서 가로로 넘치지 않는다. 틀 높이는 안쪽 문서 높이에 맞춰 스크롤이 차시 쪽 하나뿐이고(판 1.7.0 — 예전에는 화면 높이를 넘지 않게 해
 *      틀 안 스크롤에 갇히지 않게 했다), 틀 바로 아래에 [실습실 접기]가 있다. [실행]해도 [실행]과 코드가 화면에 남는다(미해결 261 #13·#14).
 *   6. 실습실 페이지로 넘어간 학생에게는 "이 예제가 나오는 차시" 링크가 보여 차시로 돌아갈 수 있다. 없는 예제 이름이면 조용히 넘기지 않고 알린다.
 */
import { expect, test } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { LOAD_TIMEOUT } from './helpers/lab.ts';

const LESSON_PATH = withBase('learn/u1/v4/');
const EXAMPLE_FILE = 'vision/supplement/v4-blur-edge.py';

test.describe('차시 페이지의 실습실 임베드', () => {
  test('누르기 전에는 받지 않고, 누르면 예제가 올라간 실습실이 그 자리에 열린다', async ({ page }) => {
    test.setTimeout(4 * 60_000);
    const labRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (/cdn\.jsdelivr\.net/u.test(url) || /labs\/vision\//u.test(url)) {
        labRequests.push(url);
      }
    });

    const response = await page.goto(LESSON_PATH);
    expect(response?.status()).toBe(200);
    await page.waitForLoadState('networkidle');

    // 누르면 글자가 '실습실 접기'로 바뀌므로 이름이 아니라 표시로 찾는다.
    const openButton = page.locator('[data-lesson-lab-open]').first();
    await expect(openButton).toBeVisible();
    await expect(openButton).toHaveText('이 자리에서 실습실 열기');
    await expect(openButton).toHaveAttribute('aria-expanded', 'false');
    // "(준비 중)"이 붙은 링크는 더 없다.
    await expect(page.getByRole('link', { name: /^실습실에서 크게 열기/u }).first()).toBeVisible();
    expect(await page.getByText('실습실은 아직 만들고 있어요.').count()).toBe(0);
    // 아직 iframe도, 실습실·Pyodide 요청도 없다.
    expect(await page.locator('iframe').count()).toBe(0);
    expect(labRequests, '누르기 전에는 실습실 파일을 받지 않는다').toEqual([]);
    // R2-017: 누르기 전 안내에는 "처음 한 번은 … 시간이 걸려요"가 없다(본문 따라 하기 문단이 같은 말을 하므로 낭독기로 연달아 두 번 들렸다).
    // 그 말은 실습실이 열린 뒤 실습실 위에 한 번만 보인다.
    await expect(page.locator('.lesson-example__note').first()).not.toContainText('시간이 걸려요');
    await expect(page.locator('.lesson-example__wait')).toHaveCount(0);

    // 키보드(Enter)로 연다 — 연 뒤에도 초점이 있는 단추가 화면 안에 있다(틀만 보이게 옮기면 단추가 화면 위로 밀려나
    // 초점 표시가 보이지 않았다 — 2026-09-26 Phase 6 사용성 검토 지적 10).
    await openButton.focus();
    await page.keyboard.press('Enter');
    await expect(openButton).toHaveAttribute('aria-expanded', 'true');
    await expect(openButton).toHaveText('실습실 접기');
    await expect(openButton).toBeFocused();
    await expect(openButton).toBeInViewport();
    await expect(page.locator('.lesson-example__wait').first()).toContainText('시간이 걸려요');

    const frame = page.frameLocator('iframe.lesson-example__frame');
    const labRoot = frame.locator('[data-lab]');
    await expect(labRoot).toBeVisible({ timeout: LOAD_TIMEOUT });
    // 차시 쪽과 실습실 문서에 기본 영역(main)이 둘이 되므로 안쪽 것에 다른 이름을 준다(axe landmark-unique — 2026-09-26 Phase 6 완료 기준 검토 지적 4).
    await expect(frame.locator('main#main-content')).toHaveAttribute('aria-label', '차시 안 실습실');
    // 그 차시의 예제가 미리 올라간다(파일 이름 → 예제 id).
    await expect(labRoot).toHaveAttribute('data-example', 'supplement-v4-blur-edge', { timeout: LOAD_TIMEOUT });
    await expect(frame.locator('[data-lab-editor] .cm-content')).toContainText('Canny', { timeout: LOAD_TIMEOUT });
    // 임베드 안에서는 머리글·바닥글이 숨는다.
    await expect(frame.locator('.site-header')).toBeHidden();
    await expect(frame.locator('.site-footer')).toBeHidden();
    // 조작 줄은 그대로 보인다.
    await expect(frame.getByRole('button', { name: '실행', exact: true })).toBeVisible();
    // 같은 차시 안이라 "이 예제가 나오는 차시" 줄은 임베드에서 숨는다.
    await expect(frame.locator('[data-lab-lesson]')).toBeHidden();

    // 판 1.7.0(미해결 261 #13 — walk-student-first: 375에서 342×650 틀 안 문서 3,146px, 쪽·틀·코드 칸·콘솔이 겹쳐 스크롤):
    // 틀이 읽히면 틀 높이를 안쪽 문서 높이에 맞춰 스크롤은 차시 쪽 하나뿐이다(안쪽 뿌리 data-embed-fit, 틀 data-fit).
    // (예전 규칙 "틀은 화면 높이를 넘지 않는다"는 틀 안 스크롤에 갇히지 않게 하려던 것 — 틀이 스스로 스크롤하지 않으니 이제 필요 없다)
    const iframe = page.locator('iframe.lesson-example__frame');
    await expect(iframe).toHaveAttribute('data-fit', '', { timeout: LOAD_TIMEOUT });
    await expect(frame.locator('html')).toHaveAttribute('data-embed-fit', '');
    await expect
      .poll(async () => {
        const outer = await iframe.evaluate((element) => element.getBoundingClientRect().height);
        const inner = await frame.locator('html').evaluate((html) => ({ height: html.getBoundingClientRect().height, scroll: html.scrollHeight, client: html.clientHeight }));
        // 틀 높이 = 안쪽 문서 높이(올림 1px 안), 안쪽은 스스로 스크롤할 것이 없다
        return Math.abs(outer - inner.height) <= 1.5 && inner.scroll <= inner.client + 1;
      }, { message: '틀 높이가 안쪽 문서 높이와 같고 틀 안이 스크롤되지 않는다', timeout: 15_000 })
      .toBe(true);
    const fitted = await iframe.evaluate((element) => element.getBoundingClientRect().height);
    expect(fitted, '실습실 전체가 틀 안에 들어간다(편집칸 + 입력·출력 + 콘솔)').toBeGreaterThan(600);
    // 편집칸 높이는 예전처럼 바깥 화면 높이로 잰다(틀 안 vh는 문서 전체라 쓰지 않는다 — global.css --embed-vh): 화면보다 크지 않다
    const editorHeight = await frame.locator('[data-lab-editor]').evaluate((element) => element.getBoundingClientRect().height);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(editorHeight, '편집칸 높이').toBeLessThan(viewportHeight);
    // 넓은 화면(왼쪽에 단원 차시 목록이 붙는 64rem 이상)에서는 실습실 칸이 본문 칸 안에 들어간다 — 목록 밑으로 들어가거나 오른쪽이 잘려
    // 가로 스크롤이 생기던 것(1443 > 1366)을 고쳤다(R1-079).
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      const placement = await page.evaluate(() => {
        const lab = document.querySelector('.lesson-example__lab')?.getBoundingClientRect();
        const article = document.querySelector('#lesson-article')?.getBoundingClientRect();
        const nav = document.querySelector('[data-lesson-nav]')?.getBoundingClientRect();
        return { labLeft: lab?.left ?? 0, labRight: lab?.right ?? 0, articleLeft: article?.left ?? 0, articleRight: article?.right ?? 0, navRight: nav?.right ?? 0 };
      });
      expect(placement.labLeft, '실습실 왼쪽이 본문 칸 왼쪽보다 나가지 않는다').toBeGreaterThanOrEqual(placement.articleLeft - 1);
      expect(placement.labRight, '실습실 오른쪽이 본문 칸 오른쪽보다 나가지 않는다').toBeLessThanOrEqual(placement.articleRight + 1);
      expect(placement.labLeft, '실습실이 왼쪽 차시 목록 밑으로 들어가지 않는다').toBeGreaterThanOrEqual(placement.navRight);
    }
    // 틀 바로 아래에도 [실습실 접기]와 [실습실에서 크게 열기]가 있다.
    const bar = page.locator('.lesson-example__lab-bar').first();
    await expect(bar.getByRole('button', { name: '실습실 접기' })).toBeVisible();
    await expect(bar.getByRole('link', { name: /^실습실에서 크게 열기/u })).toHaveAttribute('href', /\/labs\/vision\/\?example=/u);

    // 아래 줄의 [실습실 접기]로 접으면 사라지고, 위 단추로 다시 펼 수 있다(iframe은 남겨 두어 다시 받지 않는다).
    await bar.getByRole('button', { name: '실습실 접기' }).click();
    await expect(openButton).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[data-lesson-lab-slot]').first()).toBeHidden();
    await openButton.click();
    await expect(openButton).toHaveAttribute('aria-expanded', 'true');
    expect(await page.locator('iframe.lesson-example__frame').count()).toBe(1);
    await openButton.click();
    await expect(openButton).toHaveAttribute('aria-expanded', 'false');

    const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    expect(overflow, '가로 넘침').toBe(0);
  });

  test('가장 좁은 휴대폰(320px)에서도 차시 안 실습실의 조작 줄이 틀 안에 들어간다(통합 확인, R3-005 뒤)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', '휴대폰 화면에서만');
    test.setTimeout(3 * 60_000);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(LESSON_PATH);
    await page.locator('[data-lesson-lab-open]').first().click();
    const frame = page.frameLocator('iframe.lesson-example__frame');
    await expect(frame.locator('[data-lab]')).toBeVisible({ timeout: LOAD_TIMEOUT });
    await expect(frame.locator('[data-lab-example-name]')).toBeVisible();
    // 틀 안 실습실 폭은 약 254px — [실행]의 넓은 옆 여백 때문에 세 단추(275px)가 틀을 넘어 [초기화]가 잘렸다
    const inner = await frame.locator('html').evaluate(() => ({
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      actionsRight: document.querySelector('.lab__actions')?.getBoundingClientRect().right ?? 0,
      width: document.documentElement.clientWidth,
    }));
    expect(inner.overflow, '실습실 안 가로 넘침').toBe(0);
    expect(inner.actionsRight, '[실행]·[정지]·[초기화] 오른쪽 끝').toBeLessThanOrEqual(inner.width);
    const outer = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
    expect(outer, '차시 페이지 가로 넘침').toBe(0);
  });

  // 판 1.7.0(미해결 261 #14 — walk-student-first): [실행] 뒤 틀 안이 결과 칸(빈 영상 칸)으로 내려가 코드와 [실행]이 사라졌다.
  // 높이 맞춤 틀에서는 실습실의 "화면 안으로 옮기기"가 바깥 쪽 화면으로 재고 바깥 쪽을 굴리며, 보이는 조작 줄을 화면 밖으로 밀지 않는다(src/lab/controls/reveal.ts).
  test('차시 안 실습실에서 [실행]해도 [실행] 단추와 코드가 화면에 남고, 틀 안은 스크롤되지 않는다', async ({ page }) => {
    test.setTimeout(4 * 60_000);
    await page.goto(withBase('learn/u1/1-1-1/'));
    await page.locator('[data-lesson-lab-open]').first().click();
    const iframe = page.locator('iframe.lesson-example__frame');
    const frame = page.frameLocator('iframe.lesson-example__frame');
    const lab = frame.locator('[data-lab]');
    await expect(lab).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    await expect(iframe).toHaveAttribute('data-fit', '', { timeout: LOAD_TIMEOUT });
    const run = frame.getByRole('button', { name: '실행', exact: true });
    await run.scrollIntoViewIfNeeded();
    await run.click();
    await expect(lab).toHaveAttribute('data-outcome', 'ok', { timeout: LOAD_TIMEOUT });
    await expect(frame.locator('[data-lab-console]')).toContainText('사진1');
    // 결과 알림이 뜨고 화면 옮기기(부드럽게)가 끝날 때까지
    await page.waitForTimeout(1_000);
    await expect(run).toBeInViewport();
    await expect(frame.locator('[data-lab-editor]')).toBeInViewport({ ratio: 0.25 });
    // 스크롤은 바깥 쪽 하나 — 틀 안 문서는 굴러가 있지 않다
    expect(await frame.locator('html').evaluate(() => window.scrollY)).toBe(0);
  });

  test('[실습실에서 열기]는 그 예제를 고른 채 실습실 페이지를 연다', async ({ page }) => {
    await page.goto(LESSON_PATH);
    const link = page.getByRole('link', { name: /^실습실에서 크게 열기/u }).first();
    const href = await link.getAttribute('href');
    expect(href).toContain('labs/vision/');
    expect(decodeURIComponent(href ?? '')).toContain(EXAMPLE_FILE);
    expect(href).not.toContain('embed=1');
  });

  test('실습실 페이지에서 "이 예제가 나오는 차시" 링크로 돌아가고, 없는 예제 이름은 알려 준다', async ({ page }) => {
    await page.goto(`${withBase('labs/vision/')}?example=${encodeURIComponent(EXAMPLE_FILE)}`);
    const lab = page.locator('[data-lab]');
    await expect(lab).toHaveAttribute('data-example', 'supplement-v4-blur-edge', { timeout: LOAD_TIMEOUT });
    const lessonLink = page.locator('[data-lab-lesson-link]');
    await expect(lessonLink).toBeVisible();
    await expect(lessonLink).toHaveAttribute('href', LESSON_PATH);
    await expect(lessonLink).toContainText('V4');

    // 링크에 적힌 예제가 없으면 첫 예제를 열되, 그 사실을 한국어로 알린다(2026-09-17 검토 반영).
    await page.goto(`${withBase('labs/vision/')}?example=${encodeURIComponent('vision/없는-예제.py')}`);
    await expect(lab).toHaveAttribute('data-example-missing', 'vision/없는-예제.py', { timeout: LOAD_TIMEOUT });
    await expect(page.locator('[data-lab-message]')).toContainText('찾지 못해서');
  });
});
