// 시작하기·점검 브라우저 테스트(PLAN §8.1 P1-08).
// 실행: npx playwright test tests/e2e/start.spec.ts (빌드 후 미리 보기 서버를 띄운다, playwright.config.ts)
// 주소는 사이트 지도의 href(base 포함)로 연다. desktop(1366×768)과 mobile(Pixel 5, 375×812) 두 화면에서 돈다.
import { expect, test, type Page } from '@playwright/test';
import { getPage } from '../../src/config/nav.ts';
import { siteConfig } from '../../src/config/site.ts';
import { BROWSER_NOTICE_DISMISS_KEY, CHECK_ITEMS } from '../../src/lib/capabilities.ts';
import { STORAGE_KEY_PREFIX } from '../../src/lib/storage.ts';

const HANGUL = /[가-힣]/u;
const START_PAGE_IDS = ['start', 'start-student', 'start-board', 'start-teacher', 'start-check'] as const;
const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0';

/** 페이지에서 난 자바스크립트 오류를 모은다. */
function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function waitForCheckReport(page: Page) {
  await expect(page.locator('[data-check-report]')).toHaveAttribute('data-state', 'done', { timeout: 15_000 });
}

function checkRow(page: Page, id: string) {
  return page.locator(`[data-check-row="${id}"]`);
}

test.describe('시작하기 페이지', () => {
  for (const id of START_PAGE_IDS) {
    test(`${id}: 200으로 열리고 제목이 하나이며 가로로 넘치지 않고 스크립트 오류가 없다`, async ({ page }) => {
      const navPage = getPage(id);
      const errors = collectPageErrors(page);
      const response = await page.goto(navPage.href);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(navPage.title);
      // 쪽 문서의 제목만 센다 — Playwright의 'h1'은 그림자 DOM까지 들어가 개발 서버의 Astro 개발 도구 막대(astro-dev-toolbar) 속 제목 4개도
      // 세었다(개발 서버로 돌리면 늘 "기대 1·받음 5" — 1.1.0 검토 지적, 빌드 결과엔 막대가 없다). querySelectorAll은 그림자 DOM에 들어가지 않는다.
      expect(await page.evaluate(() => document.querySelectorAll('h1').length)).toBe(1);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }

  test('개요는 학생용·보드 준비·교사용·점검으로 연결된다', async ({ page }) => {
    await page.goto(getPage('start').href);
    const main = page.locator('main');
    for (const id of ['start-student', 'start-board', 'start-teacher', 'start-check']) {
      const target = getPage(id);
      await expect(main.locator(`a[href="${target.href}"]`).first()).toBeVisible();
    }
  });

  test('학생용: 세 단계, 카메라 허용 그림의 대체 글, 짧은 점검 결과가 보인다', async ({ page, isMobile }) => {
    await page.goto(getPage('start-student').href);
    for (const name of ['① 브라우저 확인하기', '② 카메라 허용하기', '③ 첫 실습 해 보기']) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeVisible();
    }
    await expect(page.getByRole('img', { name: '카메라 허락 창에서 허용 누르기' })).toBeVisible();
    await expect(page.getByRole('img', { name: '실수로 차단했을 때 카메라를 다시 허용하기' })).toBeVisible();

    const quick = page.locator('[data-quick-check]');
    await expect(quick).toHaveAttribute('data-state', 'done', { timeout: 15_000 });
    await expect(quick.locator('[data-quick-row]')).toHaveCount(3);
    await expect(quick.locator('[data-quick-row="jspi"]')).toHaveAttribute('data-status', 'supported');
    await expect(quick.locator('[data-quick-row="browser"]')).toHaveAttribute('data-status', isMobile ? 'unknown' : 'supported');
    await expect(quick.locator('[data-quick-verdict]')).toHaveText(HANGUL);
  });

  test('보드 준비: 부품 대응표, 충전 전용 케이블 경고, 드라이버 공식 링크, Linux 안내', async ({ page }) => {
    await page.goto(getPage('start-board').href);
    const kitTable = page.getByRole('table', { name: /키트 부품 이름과 범용 부품 이름/u });
    await expect(kitTable).toBeVisible();
    await expect(kitTable.locator('tbody tr')).toHaveCount(16);
    await expect(page.getByRole('img', { name: '데이터 케이블과 충전 전용 케이블 비교' })).toBeVisible();
    await expect(page.getByText('충전 전용 케이블로는 연결되지 않아요')).toBeVisible();

    const help = page.locator('details#port-not-found');
    await expect(help).not.toHaveAttribute('open', '');
    await page.getByText('포트 선택 창에 보드가 안 보여요').click();
    await expect(help).toHaveAttribute('open', '');
    await expect(help.getByRole('link', { name: /CH341SER\.EXE/u })).toHaveAttribute(
      'href',
      'https://www.wch-ic.com/downloads/CH341SER_EXE.html',
    );
    await expect(help.getByRole('link', { name: /CP210x/u })).toHaveAttribute(
      'href',
      'https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers',
    );
    await expect(help).toContainText('sudo usermod -a -G dialout $USER');
    await expect(help).toContainText('sudo apt remove brltty');
    await expect(help).toContainText('Windows 10·11');
  });

  test('보드 준비: 주소에 #port-not-found를 붙이면 안내가 펼쳐지고, 키보드로도 접고 펼 수 있다', async ({ page }) => {
    await page.goto(`${getPage('start-board').href}#port-not-found`);
    const help = page.locator('details#port-not-found');
    await expect(help).toHaveAttribute('open', '');

    const summary = help.locator('summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(help).not.toHaveAttribute('open', '');
    await page.keyboard.press('Enter');
    await expect(help).toHaveAttribute('open', '');
  });

  test('교사용: 외부 연결 표에 네 곳과 처리방침 링크, 성취기준 영역 표(자료실로 가는 링크), 공용 컴퓨터 안내가 있다', async ({ page }) => {
    await page.goto(getPage('start-teacher').href);
    const connections = page.getByRole('table', { name: '외부로 연결되는 곳과 보내지는 것' });
    const rows = connections.locator('tbody tr');
    await expect(rows).toHaveCount(4);
    for (const [index, where] of ['GitHub Pages', 'jsDelivr', 'MQTT', '음성 인식'].entries()) {
      const row = rows.nth(index);
      await expect(row.locator('th')).toContainText(where);
      const links = row.locator('a[href^="https://"]');
      expect(await links.count()).toBeGreaterThan(0);
    }
    // Phase 5 통합(2026-09-25): "준비 중" 틀이던 표가 영역마다 교사용 자료실 성취기준 쪽(#std-area-N)으로 가는 표가 됐다.
    const standards = page.getByRole('table', { name: '성취기준 영역과 평가 방향' });
    const areaRows = standards.locator('tbody tr');
    await expect(areaRows).toHaveCount(4);
    await expect(standards).toContainText('[12인피01-01]');
    for (let area = 1; area <= 4; area += 1) {
      await expect(areaRows.nth(area - 1).getByRole('link', { name: '성취기준과 평가 방향' })).toHaveAttribute(
        'href',
        new RegExp(`/teacher/standards/#std-area-${area}$`, 'u'),
      );
    }
    await expect(page.getByText('[이 컴퓨터에서 내 기록 지우기]')).toBeVisible();
    await expect(page.getByRole('table', { name: /학교 네트워크 체크리스트/u })).toBeVisible();
  });
});

test.describe('점검 페이지', () => {
  test('10개 항목마다 결과(지원·미지원·확인 필요)와 한국어 설명이 채워진다', async ({ page }) => {
    await page.goto(getPage('start-check').href);
    await waitForCheckReport(page);
    const rows = page.locator('[data-check-row]');
    await expect(rows).toHaveCount(CHECK_ITEMS.length);
    for (const item of CHECK_ITEMS) {
      const row = checkRow(page, item.id);
      await expect(row.locator('th')).toContainText(item.label);
      const status = await row.getAttribute('data-status');
      expect(['supported', 'unsupported', 'unknown'], item.id).toContain(status);
      await expect(row.locator('[data-check-status]')).toHaveText(/^(지원|미지원|확인 필요)$/u);
      await expect(row.locator('[data-check-summary]')).toHaveText(HANGUL);
      if (status !== 'supported' && item.id !== 'screen') {
        await expect(row.locator('[data-check-advice]'), item.id).toHaveText(HANGUL);
      }
    }
    await expect(page.locator('[data-check-counts]')).toContainText('지원');
  });

  test('컴퓨터 화면의 Chromium 계열에서 핵심 기능이 지원으로 나온다', async ({ page, isMobile }) => {
    test.skip(isMobile, '데스크톱 화면(1366px)에서만 확인한다');
    await page.goto(getPage('start-check').href);
    await waitForCheckReport(page);
    for (const id of ['browser', 'secure-context', 'webassembly', 'jspi', 'camera-api', 'web-serial', 'local-storage', 'screen']) {
      await expect(checkRow(page, id), id).toHaveAttribute('data-status', 'supported');
    }
  });

  test('휴대폰 화면에서는 브라우저·Web Serial·화면 크기가 확인 필요로 나온다', async ({ page, isMobile }) => {
    test.skip(!isMobile, '모바일 화면(375px)에서만 확인한다');
    await page.goto(getPage('start-check').href);
    await waitForCheckReport(page);
    for (const id of ['browser', 'web-serial', 'screen']) {
      await expect(checkRow(page, id), id).toHaveAttribute('data-status', 'unknown');
    }
    await expect(checkRow(page, 'jspi')).toHaveAttribute('data-status', 'supported');
  });

  test('기능이 없는 브라우저면 미지원과 대처 안내를 보여 준다', async ({ page }) => {
    await page.addInitScript(() => {
      const wasm = WebAssembly as unknown as Record<string, unknown>;
      delete wasm.Suspending;
      delete wasm.promising;
      const navigatorPrototype = Navigator.prototype as unknown as Record<string, unknown>;
      delete navigatorPrototype.serial;
      delete navigatorPrototype.bluetooth;
    });
    await page.goto(getPage('start-check').href);
    await waitForCheckReport(page);
    await expect(checkRow(page, 'jspi')).toHaveAttribute('data-status', 'unsupported');
    await expect(checkRow(page, 'jspi').locator('[data-check-advice]')).toContainText('Chrome이나 Edge');
    await expect(checkRow(page, 'web-serial')).toHaveAttribute('data-status', 'unsupported');
    await expect(checkRow(page, 'web-serial').locator('[data-check-advice]')).toContainText('가상 보드');
    await expect(checkRow(page, 'web-bluetooth')).toHaveAttribute('data-status', 'unsupported');
    await expect(page.locator('[data-check-report]')).toHaveAttribute('data-level', 'blocked');
  });

  test('[결과 복사]를 누르면 점검 결과 글이 클립보드에 들어가고, [다시 점검]으로 다시 점검한다', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(getPage('start-check').href);
    await waitForCheckReport(page);

    // 점검 페이지에는 [결과 복사]가 둘이다(브라우저 점검·네트워크 점검, P2-05) — 브라우저 점검 쪽만 누른다.
    await page.locator('[data-check-copy]').click();
    await expect(page.locator('[data-check-copy-status]')).toContainText('복사했어요');
    // Windows 클립보드는 줄바꿈을 \r\n으로 바꿔 돌려주므로 \n으로 맞춰 비교한다.
    const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/gu, '\n');
    expect(copied.split('\n')[0]).toBe(`[${siteConfig.name}] 브라우저 점검 결과`);
    expect(copied).toContain(`사이트 버전: ${siteConfig.version}`);
    for (const item of CHECK_ITEMS) {
      expect(copied).toContain(`- ${item.label}: `);
    }
    expect(copied).toMatch(/요약: 지원 \d+개 · 미지원 \d+개 · 확인 필요 \d+개/u);
    await expect(page.locator('[data-check-text]')).toHaveValue(copied);

    await page.getByRole('button', { name: '다시 점검' }).click();
    await waitForCheckReport(page);
    await expect(page.locator('[data-check-copy-status]')).toHaveText('');
  });
});

test.describe('브라우저 권장 환경 안내', () => {
  test('컴퓨터용 Chrome·Edge에서는 안내가 보이지 않는다', async ({ page, isMobile }) => {
    test.skip(isMobile, '데스크톱 화면에서만 확인한다');
    await page.goto(getPage('start-student').href);
    const notice = page.locator('[data-browser-notice]');
    await expect(notice).toHaveAttribute('data-state', 'not-needed');
    await expect(notice).toBeHidden();
  });

  test('휴대폰에서는 안내가 보이고, 닫으면 다른 페이지와 새로고침 뒤에도 보이지 않는다', async ({ page, isMobile }) => {
    test.skip(!isMobile, '모바일 화면에서만 확인한다');
    await page.goto(getPage('start-student').href);
    const notice = page.locator('[data-browser-notice]');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('실습실은 컴퓨터의 Chrome이나 Edge에서 열어 주세요');
    await expect(notice.getByRole('link', { name: '이 브라우저로 무엇이 되는지 점검하기' })).toHaveAttribute(
      'href',
      getPage('start-check').href,
    );

    await notice.getByRole('button', { name: '안내 닫기' }).click();
    await expect(notice).toBeHidden();
    await expect(page.locator('#main-content')).toBeFocused();
    expect(await page.evaluate((key) => localStorage.getItem(key), BROWSER_NOTICE_DISMISS_KEY)).toBe('other-browser');

    await page.reload();
    await expect(page.locator('[data-browser-notice]')).toHaveAttribute('data-state', 'dismissed');
    await expect(page.locator('[data-browser-notice]')).toBeHidden();
    await page.goto(getPage('start-board').href);
    await expect(page.locator('[data-browser-notice]')).toHaveAttribute('data-state', 'dismissed');
  });

  test('JSPI가 없는 Chrome·Edge에서는 업데이트 안내가 보인다', async ({ page, isMobile }) => {
    test.skip(isMobile, '데스크톱 화면에서만 확인한다');
    await page.addInitScript(() => {
      const wasm = WebAssembly as unknown as Record<string, unknown>;
      delete wasm.Suspending;
    });
    await page.goto(getPage('start-board').href);
    const notice = page.locator('[data-browser-notice]');
    await expect(notice).toHaveAttribute('data-variant', 'update-browser');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('브라우저를 최신판으로 업데이트해 주세요');
  });
});

test.describe('다른 브라우저로 열었을 때', () => {
  // Playwright는 userAgent를 바꿔도 userAgentData(브랜드 정보)를 그대로 두므로, Firefox처럼 userAgentData도 없앤다.
  test.use({ userAgent: FIREFOX_UA });

  test('Firefox로 열면 다른 브라우저 안내가 보이고 점검 표의 브라우저 줄이 확인 필요다', async ({ page, isMobile }) => {
    test.skip(isMobile, '데스크톱 화면에서만 확인한다');
    await page.addInitScript(() => {
      delete (Navigator.prototype as unknown as Record<string, unknown>).userAgentData;
    });
    await page.goto(getPage('start-student').href);
    const notice = page.locator('[data-browser-notice]');
    await expect(notice).toHaveAttribute('data-variant', 'other-browser');
    await expect(notice).toBeVisible();

    await page.goto(getPage('start-check').href);
    await waitForCheckReport(page);
    await expect(checkRow(page, 'browser')).toHaveAttribute('data-status', 'unknown');
    await expect(checkRow(page, 'browser').locator('[data-check-summary]')).toContainText('Firefox(Windows)');
  });
});

// ── 판 1.3.0 "설명 없이 쓰는 사이트": 시작하기 개요의 "누구세요?" 카드·단계 칩, 학생용의 단계 칩·끝 표시·큰 주 단추 ──
test.describe('시작하기 새 모양(판 1.3.0)', () => {
  test('개요: "누구세요?" 카드 네 장이 통째로 눌리고, 학생 카드가 "처음이면 여기부터"로 먼저 보인다', async ({ page }) => {
    await page.goto(getPage('start').href);
    const expected = [
      ['student', getPage('start-student').href],
      ['teacher', getPage('start-teacher').href],
      ['board', getPage('start-board').href],
      ['check', getPage('start-check').href],
    ] as const;
    const cards = page.locator('[data-start-who]');
    await expect(cards).toHaveCount(expected.length);
    for (const [key, href] of expected) {
      const card = page.locator(`[data-start-who="${key}"]`);
      await expect(card.locator('a.card__link')).toHaveAttribute('href', href);
      await expect(card.locator('svg[data-icon]')).toHaveCount(1);
    }
    await expect(page.locator('[data-start-who="student"]')).toContainText('처음이면 여기부터');
    // 카드의 글자(링크가 아닌 설명 줄)를 눌러도 그 쪽으로 간다
    await page.locator('[data-start-who="teacher"] .start-who__text').click({ force: true });
    await expect(page).toHaveURL(new RegExp(`${getPage('start-teacher').href}$`, 'u'));
  });

  test('개요: 처음이라면 이 순서(점검 → 첫 실습 → 보드) 단계 칩이 차례대로 있다', async ({ page }) => {
    await page.goto(getPage('start').href);
    const links = page.locator('.start-steps > li a');
    await expect(links).toHaveCount(3);
    await expect(links.nth(0)).toHaveAttribute('href', getPage('start-check').href);
    await expect(links.nth(1)).toHaveAttribute('href', getPage('start-student').href);
    await expect(links.nth(2)).toHaveAttribute('href', getPage('start-board').href);
  });

  test('학생용: 세 단계 칩이 있고 눌러서 그 단계로 가며, 채운 파랑 주 단추는 [첫 실습 시작] 하나뿐이다', async ({ page }) => {
    await page.goto(getPage('start-student').href);
    const steps = page.locator('[data-student-steps] > li');
    await expect(steps).toHaveCount(3);
    for (const [index, id] of ['step-browser', 'step-camera', 'step-first-lab'].entries()) {
      await expect(steps.nth(index).locator('a')).toHaveAttribute('href', `#${id}`);
    }
    const primary = page.locator('main .button--primary');
    await expect(primary).toHaveCount(1);
    await expect(primary).toHaveText(/첫 실습 시작/u);
    await expect(primary).toHaveAttribute('href', getPage('labs-vision').href);
  });

  test('학생용: ①이 끝나면 "끝"이 붙고 지금 단계(aria-current)가 아직 안 끝낸 첫 단계로 간다(휴대폰은 브라우저 줄이 "확인 필요"라 ①이 남는다)', async ({ page, isMobile }) => {
    await page.goto(getPage('start-student').href);
    await expect(page.locator('[data-quick-check]')).toHaveAttribute('data-state', 'done', { timeout: 15_000 });
    const browserStep = page.locator('[data-student-step="browser"]');
    if (isMobile) {
      await expect(browserStep).not.toHaveAttribute('data-done', '');
      await expect(browserStep).toHaveAttribute('aria-current', 'step');
    } else {
      await expect(browserStep).toHaveAttribute('data-done', '');
      await expect(browserStep.locator('[data-student-step-done]')).toBeVisible();
      await expect(browserStep.locator('[data-student-step-done]')).toContainText('끝');
      await expect(browserStep).not.toHaveAttribute('aria-current', 'step');
    }
    // 시험 설정이 카메라 허용을 미리 줘 둬서(playwright.config.ts) ②가 끝나 있을 수 있다 — 어느 단계가 끝났든 "지금 단계"는 끝나지 않은 첫 단계 하나다
    const state = await page.evaluate(() =>
      [...document.querySelectorAll('[data-student-step]')].map((item) => ({ done: item.hasAttribute('data-done'), current: item.getAttribute('aria-current') === 'step' })),
    );
    const firstOpen = state.findIndex((item) => !item.done);
    expect(state.filter((item) => item.current)).toHaveLength(firstOpen === -1 ? 0 : 1);
    if (firstOpen !== -1) {
      expect(state[firstOpen]?.current).toBe(true);
    }
  });

  test('학생용: 카메라 허용을 이미 한 브라우저면 ②에 "끝"이 붙는다(허락 창을 띄우지 않고 물어본다)', async ({ page, context, isMobile }) => {
    test.skip(isMobile, '카메라 허용 질문은 데스크톱 Chromium에서 확인한다');
    await context.grantPermissions(['camera']);
    await page.goto(getPage('start-student').href);
    await expect(page.locator('[data-student-step="camera"]')).toHaveAttribute('data-done', '', { timeout: 10_000 });
  });

  test('학생용: 영상처리 실습실을 연 적이 있으면(학습 진도의 마지막 실습실) ③에 "끝"이 붙는다', async ({ page }) => {
    await page.goto(getPage('start-student').href);
    await expect(page.locator('[data-student-step="lab"]')).not.toHaveAttribute('data-done', '');
    await page.evaluate(
      ([key, path]) => {
        localStorage.setItem(
          key as string,
          JSON.stringify({ version: 1, seen: [], done: [], last: null, lastLab: { path, title: '영상처리 실습실', at: 1700000000000 } }),
        );
        window.dispatchEvent(new StorageEvent('storage', { key: key as string }));
      },
      [`${STORAGE_KEY_PREFIX}progress:v1`, getPage('labs-vision').href],
    );
    await expect(page.locator('[data-student-step="lab"]')).toHaveAttribute('data-done', '');
  });
});
