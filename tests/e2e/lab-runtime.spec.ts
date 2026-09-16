// 파이썬 실행기 브라우저 테스트(PLAN §8.2 P2-01 완료 기준): 개발용 시험 페이지(/labs/dev/runtime/)에서
// Pyodide 314.0.7을 jsDelivr에서 받아 print('안녕') 출력, 정지 1단계(1초 안), 정지 2단계(워커 재시작 뒤 다시 실행),
// input() 대기 지점에 값 넣기, 제한 모드 안내, 패키지(numpy) 불러오기, 허용 주소 밖 요청 0건을 확인한다.
// 실행: npx playwright test tests/e2e/lab-runtime.spec.ts — Pyodide를 CDN에서 받으므로 인터넷이 필요하다(약 6MB, 브라우저 캐시).
// JSPI가 있는 데스크톱 Chromium에서만 돈다(모바일 화면은 페이지가 뜨는지만 본다).
import { expect, test, type Page } from '@playwright/test';
import { ALLOWED_REMOTE_ORIGINS, PYODIDE_VERSION, STOP_GRACE_MS } from '../../src/lab/runtime/config.ts';
import { withBase } from '../../src/lib/url.ts';

const PAGE_PATH = withBase('labs/dev/runtime/');
const LOAD_TIMEOUT = 90_000;

function root(page: Page) {
  return page.locator('[data-runtime]');
}

/** 페이지와 워커가 접속한 사이트 밖 출처를 모은다(data:·blob:은 뺀다). */
function collectOrigins(page: Page): Set<string> {
  const origins = new Set<string>();
  page.on('request', (request) => {
    const url = request.url();
    if (/^https?:/u.test(url)) {
      origins.add(new URL(url).origin);
    }
  });
  return origins;
}

async function openAndWaitReady(page: Page, query = ''): Promise<void> {
  const response = await page.goto(`${PAGE_PATH}${query}`);
  expect(response?.status()).toBe(200);
  await expect(root(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
}

async function runCode(page: Page, code: string): Promise<void> {
  await page.locator('[data-runtime-code]').fill(code);
  await page.getByRole('button', { name: '실행', exact: true }).click();
}

async function waitDone(page: Page, timeout = 60_000): Promise<string> {
  await expect(root(page)).toHaveAttribute('data-outcome', /^(ok|error|stopped|killed)$/u, { timeout });
  return (await root(page).getAttribute('data-outcome')) ?? '';
}

test.describe('파이썬 실행기(개발용 시험 페이지)', () => {
  test.skip(({ isMobile }) => isMobile, '워커·JSPI 동작은 데스크톱 Chromium에서 확인한다');
  test.describe.configure({ timeout: 180_000 });

  test('Pyodide를 받아 준비되고, JSPI 감지 결과를 보이며, print("안녕")이 콘솔에 나오고 오류는 트레이스백과 함께 보인다', async ({ page }) => {
    const origins = collectOrigins(page);
    await openAndWaitReady(page);
    const box = root(page);
    await expect(box).toHaveAttribute('data-jspi', 'yes');
    await expect(box).toHaveAttribute('data-limited', 'no');
    await expect(page.locator('[data-runtime-jspi]')).toContainText('워커 쪽(can_run_sync): 있음');
    await expect(page.locator('[data-runtime-engine]')).toContainText(`Pyodide ${PYODIDE_VERSION}`);
    await expect(page.locator('[data-runtime-engine]')).toContainText('Python 3.14');
    await expect(page.locator('[data-runtime-limited-notice]')).toBeHidden();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('main[data-pagefind-body]')).toHaveCount(0);

    await runCode(page, "print('안녕')\nprint('두 번째 줄', end='')\n");
    expect(await waitDone(page)).toBe('ok');
    const consoleBox = page.locator('[data-runtime-console]');
    await expect(consoleBox).toContainText('안녕');
    await expect(consoleBox).toContainText('두 번째 줄');
    await expect(page.locator('[data-runtime-result]')).toHaveText('실행이 끝났어요.');

    await runCode(page, 'print(undefined_name)\n');
    expect(await waitDone(page)).toBe('error');
    await expect(page.locator('[data-runtime-result]')).toContainText("NameError: name 'undefined_name' is not defined");
    await expect(consoleBox).toContainText('File "main.py", line 1');

    await runCode(page, 'print(\n');
    expect(await waitDone(page)).toBe('error');
    await expect(page.locator('[data-runtime-result]')).toContainText('SyntaxError');

    // exit()는 정상 종료로 다루고 그 뒤 줄은 실행되지 않는다. SystemExit가 워커 밖으로 새어 브라우저 콘솔에
    // "Uncaught (in promise)" 오류로 찍히지 않는지도 본다(worker.ts가 삼킨다 — 2026-09-16 Node 확인 사항의 브라우저 확인).
    const leaked: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') leaked.push(message.text());
    });
    page.on('pageerror', (error) => leaked.push(error.message));
    await runCode(page, "print('앞')\nexit()\nprint('뒤')\n");
    expect(await waitDone(page)).toBe('ok');
    await expect(page.locator('[data-runtime-result]')).toHaveText('exit()로 끝났어요(종료 코드 없음).');
    await expect(consoleBox).toContainText('앞');
    await expect(consoleBox).not.toContainText('뒤');
    await runCode(page, "print('exit 뒤에도')\n");
    expect(await waitDone(page)).toBe('ok');
    await expect(consoleBox).toContainText('exit 뒤에도');
    expect(leaked).toEqual([]);

    // 실습 중 브라우저가 접속한 곳은 사이트 자신과 허용 목록(jsDelivr)뿐이다(SPEC §2 서버 제로).
    const pageOrigin = new URL(page.url()).origin;
    for (const origin of origins) {
      expect([pageOrigin, ...ALLOWED_REMOTE_ORIGINS], origin).toContain(origin);
    }
    expect([...origins]).toContain('https://cdn.jsdelivr.net');
  });

  test('정지 1단계: time.sleep으로 기다리는 반복문이 [정지] 뒤 1초 안에 KeyboardInterrupt로 멈추고 다시 실행할 수 있다', async ({ page }) => {
    await openAndWaitReady(page);
    await runCode(page, "import time\ncount = 0\nwhile True:\n    count += 1\n    print('돌고 있어요', count)\n    time.sleep(0.1)\n");
    await expect(root(page)).toHaveAttribute('data-state', 'running');
    await expect(page.locator('[data-runtime-console]')).toContainText('돌고 있어요 3', { timeout: 10_000 });

    await page.getByRole('button', { name: '정지', exact: true }).click();
    expect(await waitDone(page, 5_000)).toBe('stopped');
    const stopMs = Number(await root(page).getAttribute('data-stop-ms'));
    expect(stopMs).toBeLessThan(STOP_GRACE_MS);
    // 실측값을 기록에 남긴다(PROGRESS 판정표). 목록 보고서(list)에 그대로 찍힌다.
    console.log(`[lab-runtime] 정지 1단계: [정지]부터 멈출 때까지 ${stopMs}ms`);
    test.info().annotations.push({ type: 'stop-1-ms', description: String(stopMs) });
    await expect(page.locator('[data-runtime-result]')).toContainText('멈췄어요(KeyboardInterrupt)');
    await expect(root(page)).toHaveAttribute('data-state', 'idle');

    await runCode(page, "print('다시')\n");
    expect(await waitDone(page)).toBe('ok');
    await expect(page.locator('[data-runtime-console]')).toContainText('다시');
  });

  test('정지 2단계: 계산만 하는 반복문은 파이썬을 다시 시작해서 멈추고, 그 뒤 다시 실행할 수 있다', async ({ page }) => {
    await openAndWaitReady(page);
    await runCode(page, 'while True:\n    pass\n');
    await expect(root(page)).toHaveAttribute('data-state', 'running');
    await page.waitForTimeout(300);

    await page.getByRole('button', { name: '정지', exact: true }).click();
    expect(await waitDone(page, STOP_GRACE_MS + 5_000)).toBe('killed');
    await expect(page.locator('[data-runtime-console]')).toContainText('파이썬을 다시 시작했어요');
    await expect(page.locator('[data-runtime-result]')).toContainText('정지 2단계');
    await expect(root(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });

    await runCode(page, "print('재시작 뒤')\n");
    expect(await waitDone(page)).toBe('ok');
    await expect(page.locator('[data-runtime-console]')).toContainText('재시작 뒤');
  });

  test('대기 지점: input()이 입력줄을 띄우고 화면이 넣은 값을 받으며, 기다리는 동안 [정지]하면 바로 멈춘다', async ({ page }) => {
    await openAndWaitReady(page);
    await runCode(page, "name = input('이름: ')\nprint('안녕, ' + name)\n");
    const form = page.locator('[data-runtime-input-form]');
    await expect(form).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-runtime-input-label]')).toHaveText('이름: ');
    await expect(page.locator('[data-runtime-input]')).toBeFocused();
    await page.locator('[data-runtime-input]').fill('민수');
    await page.keyboard.press('Enter');
    expect(await waitDone(page)).toBe('ok');
    await expect(page.locator('[data-runtime-console]')).toContainText('안녕, 민수');
    await expect(form).toBeHidden();

    await runCode(page, "answer = input('기다림: ')\n");
    await expect(form).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: '정지', exact: true }).click();
    expect(await waitDone(page, 5_000)).toBe('stopped');
    expect(Number(await root(page).getAttribute('data-stop-ms'))).toBeLessThan(STOP_GRACE_MS);
    await expect(form).toBeHidden();
  });

  test('제한 모드(?limited=1): 안내가 보이고, 한 번 실행되는 코드는 돌지만 input()은 한국어 설명과 함께 오류가 난다', async ({ page }) => {
    await openAndWaitReady(page, '?limited=1');
    await expect(root(page)).toHaveAttribute('data-limited', 'yes');
    await expect(page.locator('[data-runtime-limited-notice]')).toBeVisible();
    await expect(page.locator('[data-runtime-console]')).toContainText('제한 모드로 실행해요');

    await runCode(page, 'print(1 + 1)\n');
    expect(await waitDone(page)).toBe('ok');
    await expect(page.locator('[data-runtime-console]')).toContainText('2');

    await runCode(page, "input('x')\n");
    expect(await waitDone(page)).toBe('error');
    await expect(page.locator('[data-runtime-result]')).toContainText('RuntimeError');
    await expect(page.locator('[data-runtime-result]')).toContainText('JSPI');
  });

  test('패키지: import numpy를 쓰면 Pyodide 패키지를 받아 실행되고, 진행 상황이 보인다', async ({ page }) => {
    const origins = collectOrigins(page);
    await openAndWaitReady(page);
    await runCode(page, 'import numpy as np\nprint(np.arange(3).sum())\n');
    expect(await waitDone(page, 120_000)).toBe('ok');
    await expect(page.locator('[data-runtime-console]')).toContainText('3');
    const pageOrigin = new URL(page.url()).origin;
    for (const origin of origins) {
      expect([pageOrigin, ...ALLOWED_REMOTE_ORIGINS], origin).toContain(origin);
    }
  });
});

test.describe('좁은 화면', () => {
  test.skip(({ isMobile }) => !isMobile, '모바일 화면(375px)에서만 확인한다');

  test('시험 페이지가 화면보다 넓어지지 않는다', async ({ page }) => {
    const response = await page.goto(PAGE_PATH);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('파이썬 실행기 시험(개발용)');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
