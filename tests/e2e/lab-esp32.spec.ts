// ESP32 실습실(가상 보드 핵심, PLAN §8.3 P3-01) 브라우저 테스트.
// 확인하는 것
//  1. /labs/esp32/이 실제 실습실로 열리고(LabShell labId esp32, 브라우저 권장 환경 안내), 가상 보드 모듈(board)이 붙어 내장 LED·BOOT 버튼을 그린다.
//  2. Pin(2, Pin.OUT).on()을 실행하면 파이썬이 보낸 상태 메시지(board.state)로 내장 LED가 켜지고 핀 표에 GPIO2 = 1이 보인다.
//  3. BOOT 버튼을 마우스로·키보드(Space)로 누르고 있는 동안 파이썬의 Pin(0).value()가 0이 된다(화면 입력 → board.input).
//  4. Timer 예제는 코드가 끝난 뒤에도 LED가 깜빡이고(board.state phase idle) [정지]로 멈춘다 — 멈추면 LED가 꺼진 모습.
//     사이트 예제 01(첫 화면 예제 — 깜빡이기와 interval 조절 막대)·02(BOOT 버튼으로 LED)도 파일 그대로 돌려 본다.
//  5. 가상 보드는 OpenCV·numpy를 받지 않고(PD-04, 준비 모듈의 캐시 채우기 포함), 허용 주소 밖 요청이 없다.
//  6. 보드 흉내는 ESP32 실습실에만 있다: 개발용 시험 페이지에서는 import machine이 없는 모듈이고 time에 sleep_ms가 없다.
//  7. 콘솔이 화면 밖일 때 결과 칸이 "콘솔에 결과가 나왔어요"와 마지막 줄·[콘솔 보기 ↓]를 보인다(2026-09-18 검토 반영).
import { expect, test, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { ALLOWED_REMOTE_ORIGINS } from '../../src/lab/runtime/config.ts';
import { expectEditorToContain, labRoot, LOAD_TIMEOUT, openLabAndWaitReady, runCode, waitDone } from './helpers/lab.ts';
import { collectRequests } from './helpers/vision.ts';

const ESP32_PATH = withBase('labs/esp32/');
const SW_PATH = withBase('sw.js');

function board(page: Page) {
  return page.locator('[data-board-io]');
}

function part(page: Page, id: string) {
  return page.locator(`[data-board-part="${id}"]`);
}

async function consoleText(page: Page): Promise<string> {
  return (await page.locator('[data-lab-console]').textContent()) ?? '';
}

async function openEsp32Lab(page: Page): Promise<void> {
  const response = await page.goto(ESP32_PATH);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
  await expect(board(page)).toHaveAttribute('data-board-ready', 'yes', { timeout: 30_000 });
}

test.describe('ESP32 실습실 — 가상 보드 핵심', () => {
  test.describe.configure({ timeout: 180_000 });

  test('실습실이 열리고, Pin(2, Pin.OUT).on()의 상태 메시지로 내장 LED가 켜지며 OpenCV는 받지 않는다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requests = collectRequests(page);

    await openEsp32Lab(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ESP32 실습실');
    await expect(page.locator('[data-browser-notice]')).toHaveCount(1);
    await expect(labRoot(page)).toHaveAttribute('data-lab-id', 'esp32');
    await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /\bboard\b/u);
    // 영상처리 실습실의 모듈은 붙지 않는다
    expect((await labRoot(page).getAttribute('data-lab-modules')) ?? '').not.toMatch(/mediapipe|desktop|speech/u);
    await expect(labRoot(page)).toHaveAttribute('data-example', '01-first-blink');

    // 보드에 붙은 부품: 내장 LED(꺼짐)와 BOOT 버튼(키보드로 닿는 버튼)
    await expect(part(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'false');
    await expect(part(page, 'boot-button')).toHaveAttribute('role', 'button');
    await expect(part(page, 'boot-button')).toHaveAttribute('aria-pressed', 'false');

    await runCode(page, ['from machine import Pin', 'led = Pin(2, Pin.OUT)', 'led.on()', "print('켰어요', led.value())"].join('\n'));
    expect(await waitDone(page, 60_000)).toBe('ok');
    expect(await consoleText(page)).toContain('켰어요 1');

    // 파이썬이 보낸 board.state(실행 시작 reset → … → 끝 end)가 화면에 반영됐다
    await expect(board(page)).toHaveAttribute('data-board-reason', 'end');
    expect(Number(await board(page).getAttribute('data-board-seq'))).toBeGreaterThanOrEqual(2);
    await expect(board(page)).toHaveAttribute('data-board-phase', 'end');
    await expect(part(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'true');
    const row = page.locator('[data-board-pin="2"]');
    await expect(row).toHaveAttribute('data-level', '1');
    await expect(row).toHaveAttribute('data-mode', 'out');
    await expect(row).toContainText('1 (HIGH)');
    await expect(row).toContainText('내장 LED');

    // 준비 모듈이 캐시를 채우는 단계까지 기다린 뒤(빌드된 사이트에만 서비스 워커가 있다) 받은 파일을 본다.
    const sw = await page.request.get(SW_PATH, { failOnStatusCode: false });
    if (sw.ok() && (await sw.text()).includes('apc-precache')) {
      await expect(labRoot(page)).toHaveAttribute('data-loading-warm', /done|partial|failed/u, { timeout: 60_000 });
    }
    const wheels = requests.urls.filter((url) => /opencv|numpy/u.test(url));
    expect(wheels, '가상 보드는 OpenCV·numpy를 받지 않는다(PD-04)').toEqual([]);
    const siteOrigin = new URL(page.url()).origin;
    for (const origin of requests.origins) {
      expect([siteOrigin, ...ALLOWED_REMOTE_ORIGINS], origin).toContain(origin);
    }
    expect(errors).toEqual([]);
  });

  test('BOOT 버튼을 마우스·키보드로 누르고 있는 동안 Pin(0).value()가 0이 된다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openEsp32Lab(page);
    await runCode(
      page,
      [
        'from machine import Pin',
        'import time',
        'led = Pin(2, Pin.OUT)',
        'button = Pin(0, Pin.IN)',
        'last = None',
        'while True:',
        '    value = button.value()',
        '    if value != last:',
        "        print('버튼', value)",
        '        last = value',
        '    led.value(1 - value)',
        '    time.sleep_ms(20)',
      ].join('\n'),
    );
    await expect(page.locator('[data-lab-console]')).toContainText('버튼 1', { timeout: 60_000 });
    const boot = part(page, 'boot-button');
    const led = part(page, 'builtin-led');
    await expect(led).toHaveAttribute('data-visual-lit', 'false');

    // 마우스로 누르고 있기
    await boot.scrollIntoViewIfNeeded();
    const box = await boot.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 3);
    await page.mouse.down();
    await expect(boot).toHaveAttribute('aria-pressed', 'true');
    await expect(boot).toHaveAttribute('data-visual-pressed', 'true');
    await expect.poll(async () => (await consoleText(page)).split('버튼 0').length - 1, { timeout: 10_000 }).toBe(1);
    await expect(led).toHaveAttribute('data-visual-lit', 'true');
    await page.mouse.up();
    await expect(boot).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => (await consoleText(page)).split('버튼 1').length - 1, { timeout: 10_000 }).toBe(2);
    await expect(led).toHaveAttribute('data-visual-lit', 'false');

    // 키보드: 초점을 옮겨 Space를 누르고 있기
    await boot.focus();
    await page.keyboard.down('Space');
    await expect(boot).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => (await consoleText(page)).split('버튼 0').length - 1, { timeout: 10_000 }).toBe(2);
    await page.keyboard.up('Space');
    await expect.poll(async () => (await consoleText(page)).split('버튼 1').length - 1, { timeout: 10_000 }).toBe(3);

    await page.locator('[data-lab-stop]').click();
    expect(await waitDone(page, 30_000)).toBe('stopped');
    // [정지]로 멈추면 부품은 꺼진 모습
    await expect(board(page)).toHaveAttribute('data-board-phase', 'stopped');
    await expect(led).toHaveAttribute('data-visual-lit', 'false');
    expect(errors).toEqual([]);
  });

  test('Timer 예제: 코드가 끝난 뒤에도 LED가 깜빡이고 [정지]로 멈춘다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '타이머 동작은 화면 크기와 상관없어 데스크톱에서 한 번만 본다.');
    await openEsp32Lab(page);
    await page.locator('[data-lab-example-select]').selectOption('03-timer-blink');
    await page.locator('[data-lab-example-load]').click();
    await expect(labRoot(page)).toHaveAttribute('data-example', '03-timer-blink');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(page.locator('[data-lab-console]')).toContainText('타이머를 켰어요', { timeout: 60_000 });
    await expect(board(page)).toHaveAttribute('data-board-phase', 'idle', { timeout: 10_000 });
    await expect(page.locator('[data-lab-console]')).toContainText('계속 돌고 있어요');
    await expect(labRoot(page)).toHaveAttribute('data-state', 'running');

    // LED 모습이 여러 번 바뀐다(300ms 간격)
    const led = part(page, 'builtin-led');
    const seen: string[] = [];
    for (let index = 0; index < 20; index += 1) {
      const lit = (await led.getAttribute('data-visual-lit')) ?? '';
      if (seen[seen.length - 1] !== lit) {
        seen.push(lit);
      }
      await page.waitForTimeout(100);
    }
    expect(seen.length, `LED 모습 변화: ${seen.join(' → ')}`).toBeGreaterThanOrEqual(3);

    await page.locator('[data-lab-stop]').click();
    expect(await waitDone(page, 30_000)).toBe('stopped');
    await expect(led).toHaveAttribute('data-visual-lit', 'false');
  });

  test('사이트 예제 01·02가 고치지 않고 돈다: LED가 깜빡이고 interval 막대로 빨라지며, BOOT 버튼을 누르는 동안 LED가 켜진다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '예제 동작은 화면 크기와 상관없어 데스크톱에서 한 번만 본다.');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openEsp32Lab(page);
    const led = part(page, 'builtin-led');

    // ① 01-first-blink(실습실을 처음 열면 올라오는 예제): sleep(interval)마다 LED를 켰다 끈다
    await expect(labRoot(page)).toHaveAttribute('data-example', '01-first-blink');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(board(page)).toHaveAttribute('data-board-phase', 'run', { timeout: 60_000 });
    for (const lit of ['true', 'false', 'true']) {
      await expect(led).toHaveAttribute('data-visual-lit', lit, { timeout: 10_000 });
    }
    // 조절 막대 interval 0.5 → 0.1: 코드의 숫자가 바뀌고, 돌고 있는 반복문이 다음 sleep부터 더 자주 켜고 끈다.
    // 켜고 끌 때마다 board.state를 보내므로(README 7.3) 같은 시간 동안 순서 번호가 는 양으로 빠르기를 잰다 — 정해진 시간 창에 기대지 않고 빨라질 때까지 되풀이해 본다.
    const seqIncrease = async (ms: number): Promise<number> => {
      const start = Number(await board(page).getAttribute('data-board-seq'));
      await page.waitForTimeout(ms);
      return Number(await board(page).getAttribute('data-board-seq')) - start;
    };
    const slow = await seqIncrease(1_500);
    await page.locator('[data-lab-param="interval"] input[type="range"]').fill('0.1');
    await expectEditorToContain(page, 'interval = 0.1');
    await expect.poll(() => seqIncrease(1_500), { timeout: 20_000, intervals: [0] }).toBeGreaterThanOrEqual(slow + 5);
    await page.getByRole('button', { name: '정지', exact: true }).click();
    expect(await waitDone(page, 30_000)).toBe('stopped');
    await expect(led).toHaveAttribute('data-visual-lit', 'false');

    // ② 02-boot-button-led: sleep_ms(20)마다 BOOT 버튼(GPIO0)을 읽어, 누르고 있는 동안만 LED를 켠다
    await page.locator('[data-lab-example-select]').selectOption('02-boot-button-led');
    await page.locator('[data-lab-example-load]').click();
    await expect(labRoot(page)).toHaveAttribute('data-example', '02-boot-button-led');
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(board(page)).toHaveAttribute('data-board-phase', 'run', { timeout: 60_000 });
    await expect(page.locator('[data-board-pin="0"]')).toHaveAttribute('data-level', '1', { timeout: 10_000 });
    await expect(led).toHaveAttribute('data-visual-lit', 'false');
    const boot = part(page, 'boot-button');
    await boot.hover(); // 스크롤이 멈춘 뒤 버튼 한가운데로 옮긴다([실행] 뒤 결과 칸으로 화면이 옮겨 갈 수 있음)
    await page.mouse.down();
    await expect(boot).toHaveAttribute('aria-pressed', 'true');
    await expect(led).toHaveAttribute('data-visual-lit', 'true', { timeout: 10_000 });
    await expect(page.locator('[data-board-pin="0"]')).toHaveAttribute('data-level', '0');
    await page.mouse.up();
    await expect(led).toHaveAttribute('data-visual-lit', 'false', { timeout: 10_000 });
    await page.getByRole('button', { name: '정지', exact: true }).click();
    expect(await waitDone(page, 30_000)).toBe('stopped');

    expect(await consoleText(page)).not.toMatch(/Traceback|Error/u);
    expect(errors).toEqual([]);
  });

  test('좁은 화면(375px)에서도 가로로 넘치지 않는다', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', '모바일 프로젝트에서만 잰다.');
    await page.goto(ESP32_PATH);
    await expect(board(page)).toHaveAttribute('data-board-ready', 'yes', { timeout: 60_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

/*
 * 결과가 print()뿐인 예제에서 학생이 "아무 일도 일어나지 않았다"로 읽던 것(2026-09-18 검토 반영, 치명).
 * 콘솔은 결과 칸보다 688px(데스크톱)·696px(휴대폰) 아래에 있어 [실행] 뒤에도 화면에 없다.
 */
test.describe('콘솔이 화면 밖일 때 결과 칸이 알린다(2026-09-18 검토 반영)', () => {
  test('print()만 하는 코드를 실행하면 결과 칸에 마지막 줄과 [콘솔 보기]가 뜨고, 누르면 콘솔이 화면에 들어온다', async ({ page }) => {
    await page.goto(ESP32_PATH);
    await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
    const notice = page.locator('[data-lab-io-output]');
    await expect(notice).toBeHidden();
    // 화면 맨 위에서 시작한다(콘솔은 첫 화면 밖)
    await page.evaluate(() => window.scrollTo(0, 0));
    const consoleBox = page.locator('[data-lab-console]');
    expect(await consoleBox.evaluate((element) => element.getBoundingClientRect().top > window.innerHeight)).toBe(true);
    await runCode(page, ["print('첫 줄')", "print('둘째 줄')", "print('셋째 줄')"].join('\n'));
    expect(await waitDone(page, 60_000)).toBe('ok');
    await expect(notice).toBeVisible();
    await expect(page.locator('[data-lab-io-output-head]')).toHaveText('콘솔에 결과가 나왔어요.');
    await expect(page.locator('[data-lab-io-output-text]')).toContainText('셋째 줄');
    await expect(page.locator('[data-lab-console-new]')).toContainText('새 출력');
    // [콘솔 보기 ↓]를 누르면 콘솔이 화면에 들어오고 알림은 사라진다
    await page.locator('[data-lab-console-jump]').click();
    await expect.poll(async () => consoleBox.evaluate((element) => element.getBoundingClientRect().top < window.innerHeight), { timeout: 10_000 }).toBe(true);
    await expect(notice).toBeHidden();
  });
});

test.describe('보드 흉내는 ESP32 실습실에만 붙는다', () => {
  test('개발용 시험 페이지(labId dev)에서는 import machine이 없고 time은 CPython 그대로다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '실습실 구분은 화면 크기와 상관없다.');
    await openLabAndWaitReady(page);
    await runCode(page, ["import time", "print('sleep_ms' in dir(time))", 'import machine'].join('\n'));
    expect(await waitDone(page, 60_000)).toBe('error');
    const text = await consoleText(page);
    expect(text).toContain('False');
    expect(text).toContain("No module named 'machine'");
    await expect(labRoot(page)).not.toHaveAttribute('data-lab-modules', /\bboard\b/u);
  });
});
