// ESP32 실습실(가상 보드 핵심, PLAN §8.3 P3-01) 브라우저 테스트.
// 확인하는 것
//  1. /labs/esp32/이 실제 실습실로 열리고(LabShell labId esp32, 브라우저 권장 환경 안내), 가상 보드 모듈(board)이 붙어 내장 LED·BOOT 버튼을 그린다.
//  2. Pin(2, Pin.OUT).on()을 실행하면 파이썬이 보낸 상태 메시지(board.state)로 내장 LED가 켜지고 핀 표에 GPIO2 = 1이 보인다.
//  3. BOOT 버튼을 마우스로·키보드(Space)로 누르고 있는 동안 파이썬의 Pin(0).value()가 0이 된다(화면 입력 → board.input).
//  4. Timer 예제는 코드가 끝난 뒤에도 LED가 깜빡이고(board.state phase idle) [정지]로 멈춘다 — 멈추면 LED가 꺼진 모습.
//     사이트 예제 01(첫 화면 예제 — 깜빡이기와 interval 조절 막대)·02(BOOT 버튼으로 LED)도 파일 그대로 돌려 본다.
//  5. 가상 보드는 OpenCV·numpy를 받지 않고(PD-04, 준비 모듈의 캐시 채우기 포함), 허용 주소 밖 요청이 없다.
//     보드 코드가 import numpy를 해도 실행 때 받지 않고 실물처럼 ImportError로 알린다(판 1.1.3 — 펌웨어 모듈 안내·점 이름도 함께).
//     실물 펌웨어에 없는 모듈(datetime 등)은 막지 않고 콘솔 [알림]으로 실행마다 한 번 알린다(미해결 222 — 보드 라이브러리·사이트 흉내는 알리지 않음).
//  6. 보드 흉내는 ESP32 실습실에만 있다: 개발용 시험 페이지에서는 import machine이 없는 모듈이고 time에 sleep_ms가 없다.
//  7. 콘솔이 화면 밖일 때 결과 칸이 "콘솔에 결과가 나왔어요"와 마지막 줄·[콘솔 보기 ↓]를 보인다(2026-09-18 검토 반영).
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { ALLOWED_REMOTE_ORIGINS } from '../../src/lab/runtime/config.ts';
import { expectEditorToContain, labRoot, LOAD_TIMEOUT, openLabAndWaitReady, runCode, runCodeAndWait, waitDone } from './helpers/lab.ts';
import { expectNoHorizontalOverflow, expectParamsHelpReflows, REFLOW_VIEWPORT } from './helpers/reflow.ts';
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
    // 영상 처리 실습실의 모듈은 붙지 않는다
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

  // 판 1.1.1 최종 점검: [정지] 뒤 그림의 내장 LED는 꺼진 모습인데 핀 상태 표는 "GPIO2 출력 1 (HIGH)"라 서로 달라 보였다.
  test('[정지] 뒤 핀 상태 표 위에 "멈추기 전 마지막 값이에요"가 보이고, 다시 [실행]하면 사라진다', async ({ page }) => {
    await openEsp32Lab(page);
    await runCode(page, ['from machine import Pin', 'from time import sleep', 'led = Pin(2, Pin.OUT)', 'led.on()', 'while True:', '    sleep(0.2)'].join('\n'));
    const row = page.locator('[data-board-pin="2"]');
    await expect(row).toHaveAttribute('data-level', '1', { timeout: 60_000 });
    const note = page.locator('[data-board-pins-stopped]');
    await expect(note).toBeHidden();
    await page.locator('[data-lab-stop]').click();
    expect(await waitDone(page, 30_000)).toBe('stopped');
    await expect(part(page, 'builtin-led')).toHaveAttribute('data-visual-lit', 'false');
    await expect(note).toBeVisible();
    await expect(note).toContainText('멈추기 전 마지막 값이에요');
    // 표의 값은 지우지 않는다(실물도 [정지] 뒤 핀이 마지막 값에 남는다) — 흐린 모양 표시만
    await expect(row).toContainText('1 (HIGH)');
    await expect(page.locator('table.board-pins')).toHaveAttribute('data-stopped', 'true');
    // 다시 [실행]하면 안내가 사라진다
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-state', 'running', { timeout: 60_000 });
    await expect(note).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('table.board-pins')).toHaveAttribute('data-stopped', 'false');
    await page.locator('[data-lab-stop]').click();
    expect(await waitDone(page, 30_000)).toBe('stopped');
  });

  // 판 1.1.1 최종 점검(PROGRESS 미해결 51 보강): 부품이 많은 예제는 보기 영역이 넓어 [그림 크게 보기]를 눌러도 핀 번호가 5~6px였다.
  test('부품이 많은 예제도 [그림 크게 보기]를 누르면 보드 그림의 가장 작은 글자가 11px 이상이고, 쪽이 가로로 넘치지 않는다', async ({ page }) => {
    const response = await page.goto(`${ESP32_PATH}?example=${encodeURIComponent('esp32/u4/4-2-2-explore-rgb-buzzer-site.py')}`);
    expect(response?.status()).toBe(200);
    await expect(board(page)).toHaveAttribute('data-board-ready', 'yes', { timeout: LOAD_TIMEOUT });
    const smallestText = () =>
      page.evaluate(() => {
        const sizes: number[] = [];
        for (const element of document.querySelectorAll('[data-board-stage-wrap] text, [data-board-stage-wrap] tspan')) {
          const own = [...element.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim() !== '');
          const box = element.getBoundingClientRect();
          if (!own || box.width === 0) {
            continue;
          }
          const matrix = (element as SVGGraphicsElement).getScreenCTM();
          const scale = matrix ? Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c)) : 1;
          sizes.push(parseFloat(getComputedStyle(element).fontSize) * scale);
        }
        return sizes.length === 0 ? 0 : Math.min(...sizes);
      });
    const zoom = page.getByRole('button', { name: '그림 크게 보기' }).first();
    await zoom.click();
    await expect(page.locator('[data-board-zoom-level]').first()).toHaveAttribute('data-board-zoom-level', 'large');
    await expect.poll(smallestText, { timeout: 10_000 }).toBeGreaterThanOrEqual(11);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // 원래 크기로 되돌린다(다음 방문에 남지 않게)
    await page.getByRole('button', { name: '원래 크기로' }).first().click();
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

  // 판 1.1.3(최종 전수 점검 2바퀴 LB2-01·LB2-02): 전에는 보드 칸의 `import numpy`가 실행 때 jsDelivr에서 numpy 휠을 받아 그대로 돌았고
  // (실물 ESP32에는 없는 모듈), 실물 펌웨어에 있는 esp32는 "오타이거나 설치되지 않았어요" 카드, umqtt.robust는 "umqtt가 없다"로 읽혔다.
  test('보드 코드의 컴퓨터용 패키지(import numpy)는 실행 때도 받지 않고 실물처럼 알리며, 펌웨어 모듈은 "아직 없는 기능"으로 알린다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '실행 결과·요청은 화면 크기와 상관없어 데스크톱에서 한 번만 본다.');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const requests = collectRequests(page);
    await openEsp32Lab(page);
    const card = page.locator('[data-errors-card]');

    // 같은 쪽에서 실행을 이어 하므로 이번 실행의 결과를 기다린다(runCodeAndWait — 앞 실행의 결과를 읽지 않게)
    expect(await runCodeAndWait(page, ['import numpy as np', 'print(np.zeros(3))'].join('\n'))).toBe('error');
    await expect(card).toHaveAttribute('data-errors-entry', 'board-import-no-module');
    await expect(page.locator('[data-errors-title]')).toHaveText('보드에 그 모듈이 없어요');
    let text = await consoleText(page);
    expect(text).toContain("ImportError: no module named 'numpy'");
    expect(text).not.toContain('micropip');
    // 휠(.whl)을 하나도 받지 않았다 — 워커가 받는 jsDelivr·같은 사이트 예비본 모두(42행 검사와 같은 요청 기록)
    expect(requests.urls.filter((url) => /\.whl(?:[?#]|$)/u.test(url))).toEqual([]);

    // 실물 펌웨어에 들어 있는 모듈은 "가상 보드에 아직 없는 기능이에요"(전에는 "오타이거나 설치되지 않았어요")
    expect(await runCodeAndWait(page, 'import esp32')).toBe('error');
    await expect(card).toHaveAttribute('data-errors-entry', 'board-not-emulated');
    await expect(page.locator('[data-errors-title]')).toHaveText('가상 보드에 아직 없는 기능이에요');

    // 점 이름은 오류가 난 이름 그대로(umqtt.robust) — 바로 다음 실행의 umqtt.simple은 된다
    expect(await runCodeAndWait(page, 'import umqtt.robust')).toBe('error');
    text = await consoleText(page);
    expect(text).toContain("No module named 'umqtt.robust'");
    expect(await runCodeAndWait(page, ['from umqtt.simple import MQTTClient', "print('MQTT', MQTTClient.__name__)"].join('\n'))).toBe('ok');
    expect(await consoleText(page)).toContain('MQTT MQTTClient');
    expect(requests.urls.filter((url) => /\.whl(?:[?#]|$)/u.test(url))).toEqual([]);
    expect(errors).toEqual([]);
  });

  // 미해결 222(2026-10-06): 가상 보드는 컴퓨터 파이썬(Pyodide) 위에서 돌아 datetime·threading처럼 실물 MicroPython v1.29.0 ESP32_GENERIC에는
  // 없는 모듈도 불러와진다. 막지 않고(DECISIONS C76 ④) 학생 코드의 import 문마다 실행에 한 번 콘솔 "[알림]"으로 알린다 — 보드 라이브러리
  // (/board/lib)·사이트 흉내(/apc)·실물에도 있는 모듈(u-이름·얼린 꾸러미 포함)은 알리지 않는다. 표는 apc_board.py FIRMWARE_*_MODULES.
  test('실물 펌웨어에 없는 모듈(datetime·threading)은 실행을 막지 않고 콘솔 [알림]으로 실행마다 한 번 알리고, 실물에 있는 모듈·보드 라이브러리는 알리지 않는다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '실행 결과는 화면 크기와 상관없어 데스크톱에서 한 번만 본다.');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openEsp32Lab(page);
    const card = page.locator('[data-errors-card]');
    const datetimeNotice =
      '[알림] datetime 모듈은 실물 ESP32 보드(MicroPython)에는 없어요. 가상 보드에서만 돌아가고, 실물 보드에서는 ImportError(no module named \'datetime\')가 나요. 실물 보드에서도 돌릴 코드면 오류 사전 "가상 보드에서만 되는 모듈이에요"에서 바꿀 방법을 봐요(가상 보드에서만 연습하면 그대로 둬도 돼요).';
    const countOf = (text: string, part: string) => text.split(part).length - 1;

    const first = await runCodeAndWait(
      page,
      ['import datetime', 'import json', 'from datetime import date', 'import threading', "print('YEAR', date(2026, 10, 6).year)"].join('\n'),
    );
    expect(first).toBe('ok');
    let text = await consoleText(page);
    expect(text).toContain('YEAR 2026');
    expect(countOf(text, datetimeNotice), '같은 실행에서 datetime을 두 번 불러도 알림은 한 번').toBe(1);
    expect(text).toContain('[알림] threading 모듈은 실물 ESP32 보드(MicroPython)에는 없어요.');
    expect(text).not.toContain('json 모듈은');
    await expect(card).toBeHidden();

    // 다음 실행(보드를 새로 켬)에서는 다시 알린다
    expect(await runCodeAndWait(page, ['import datetime', "print('AGAIN')"].join('\n'))).toBe('ok');
    text = await consoleText(page);
    expect(text).toContain('AGAIN');
    expect(countOf(text, datetimeNotice)).toBe(2);

    // 실물에도 있는 모듈·u-이름·얼린 꾸러미, 사이트 흉내(ssd1306·neopixel), 보드 라이브러리(i2c_lcd·servo_library·gorillacell_dcmotors)는 알리지 않는다
    const before = countOf(await consoleText(page), '[알림]');
    const quiet = await runCodeAndWait(
      page,
      [
        'from machine import Pin, SoftI2C, PWM',
        'import time, utime, ujson, ustruct, micropython, uasyncio',
        'from umqtt.simple import MQTTClient',
        'import ssd1306, neopixel',
        'from i2c_lcd import I2cLcd',
        'from servo_library import ServoMotor',
        'from gorillacell_dcmotors import GORILLACELL_DCMOTORS',
        "print('LIBS OK')",
      ].join('\n'),
    );
    expect(quiet).toBe('ok');
    text = await consoleText(page);
    expect(text).toContain('LIBS OK');
    expect(countOf(text, '[알림]'), text.slice(-600)).toBe(before);
    expect(errors).toEqual([]);
  });

  // 거짓 알림 0(미해결 222): examples/esp32/의 모든 예제가 쓰는 import 줄을 실습실에서 한 번에 다시 돌려도(실패하는 줄은 넘김) 알림이 없다.
  // 브라우저 워커의 실제 자리(/apc 흉내·화면이 넣은 /board/lib 라이브러리)로 본다 — 예제마다·차시 코드 블록·블록 모드는
  // tests/unit/lab/pyodide-board-module-notices.test.ts가 Node 실제 Pyodide로 하나씩 본다.
  test('ESP32 예제 전부의 import 줄을 한 번에 돌려도 "실물 펌웨어에 없는 모듈" 알림이 하나도 나오지 않는다(미해결 222)', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '실행 결과는 화면 크기와 상관없어 데스크톱에서 한 번만 본다.');
    const examplesDir = path.join(process.cwd(), 'examples', 'esp32');
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === 'lib' ? [] : walk(full);
        return entry.name.endsWith('.py') ? [full] : [];
      });
    const statements = [
      ...new Set(
        walk(examplesDir).flatMap((file) =>
          fs
            .readFileSync(file, 'utf8')
            .split(/\r?\n/u)
            .map((line) => line.replace(/#.*$/u, '').trim())
            .filter((line) => /^(?:import|from)\s+[A-Za-z_]/u.test(line) && !line.includes('(')),
        ),
      ),
    ].sort();
    expect(statements.length, 'examples/esp32/의 import 줄').toBeGreaterThan(15);
    await openEsp32Lab(page);
    const code = [
      `_apc_statements = ${JSON.stringify(statements)}`,
      '_apc_failed = []',
      'for _apc_statement in _apc_statements:',
      '    try:',
      '        exec(_apc_statement)',
      '    except Exception:',
      '        _apc_failed.append(_apc_statement)',
      "print('IMPORTS', len(_apc_statements), 'FAILED', _apc_failed)",
    ].join('\n');
    expect(await runCodeAndWait(page, code)).toBe('ok');
    const text = await consoleText(page);
    expect(text).toContain(`IMPORTS ${statements.length} FAILED`);
    expect(text, text.slice(-800)).not.toContain('실물 ESP32 보드(MicroPython)에는 없어요');
    // 실패한 줄은 일부러 오류인 예제(ESP32BLE_LIB — 차시 4-2-2의 "라이브러리 이름 바꾸기" 실습)뿐
    const failed = /FAILED \[(.*)\]/u.exec(text)?.[1] ?? '';
    expect(failed.split(',').filter((item) => item.trim() !== '' && !item.includes('ESP32BLE_LIB'))).toEqual([]);
  });

  test('좁은 화면(375px)에서도 가로로 넘치지 않는다', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', '모바일 프로젝트에서만 잰다.');
    await page.goto(ESP32_PATH);
    await expect(board(page)).toHaveAttribute('data-board-ready', 'yes', { timeout: 60_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  // 판 1.1.5(최종 전수 점검 3바퀴 LB3-02): 320px(WCAG 2.1 1.4.10 재배치 기준 폭)에서 조절 패널 "조절 값 쓰는 법"을 펼치면 쪽이 28px 넘쳐
  // 조절 막대 오른쪽 값이 잘렸다(규약 보기 코드가 줄을 바꾸지 않아 패널을 넓힘 — 375px 검사는 넘치지 않아 놓쳤다).
  test('가장 좁은 휴대폰(320px)에서도 조절 패널 도움말을 펼쳐도 가로로 넘치지 않는다', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', '모바일 프로젝트에서만 잰다.');
    await page.setViewportSize(REFLOW_VIEWPORT);
    await openEsp32Lab(page);
    await expectNoHorizontalOverflow(page, 'ESP32 실습실 320px');
    await expectParamsHelpReflows(page, 'ESP32 실습실 320px');
  });

  // 판 1.1.5(최종 전수 점검 3바퀴 LB3-01): 전에는 가상 보드의 asyncio가 컴퓨터 파이썬 asyncio 그대로라 `await asyncio.sleep_ms(100)`이
  // "오타일 때가 많아요" 카드였고, `await asyncio.sleep` 무한 반복은 [정지]가 1초 안에 먹지 않아 "계산만 하는 반복문" 안내와 함께
  // 파이썬을 다시 시작했다(결과 killed). 이제 보드 확장 ext/asyncio가 sleep·sleep_ms를 가상 시계·[정지]를 아는 판으로 준다.
  test('MicroPython식 asyncio(uasyncio + sleep_ms)가 오류 없이 돌고, await asyncio.sleep 무한 반복도 [정지]로 곧바로 멈춘다', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', '실행 결과는 화면 크기와 상관없어 데스크톱에서 한 번만 본다.');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openEsp32Lab(page);
    const card = page.locator('[data-errors-card]');

    const blinkOutcome = await runCodeAndWait(
      page,
      [
        'import uasyncio as asyncio',
        'from machine import Pin',
        'led = Pin(2, Pin.OUT)',
        'async def blink():',
        '    for _ in range(3):',
        '        led.value(not led.value())',
        '        await asyncio.sleep_ms(100)',
        'asyncio.run(blink())',
        "print('END', led.value())",
      ].join('\n'),
    );
    expect(blinkOutcome).toBe('ok');
    expect(await consoleText(page)).toContain('END 1');
    await expect(card).toBeHidden();

    await runCode(
      page,
      [
        'import asyncio',
        'from machine import Pin',
        'led = Pin(2, Pin.OUT)',
        'async def main():',
        '    n = 0',
        '    while True:',
        '        n += 1',
        '        led.value(n % 2)',
        "        print('tick', n)",
        '        await asyncio.sleep(0.3)',
        'asyncio.run(main())',
      ].join('\n'),
    );
    await expect(page.locator('[data-lab-console]')).toContainText('tick 2', { timeout: 60_000 });
    await page.locator('[data-lab-stop]').click();
    expect(await waitDone(page, 30_000)).toBe('stopped');
    const text = await consoleText(page);
    expect(text).not.toContain('계산만 하는 반복문');
    expect(text).not.toContain('Unhandled exception');
    expect(errors).toEqual([]);
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
    // 알림은 DOM에 있는 것으로 끝이 아니라 **화면 안에** 있어야 한다(결과가 print()뿐이면 이 알림이 곧 결과다)
    await expect
      .poll(() => notice.evaluate((element) => { const box = element.getBoundingClientRect(); return box.top < window.innerHeight && box.bottom > 0; }), { timeout: 10_000 })
      .toBe(true);
    /*
     * [콘솔 보기 ↓]를 누르면 콘솔이 화면에 들어오고 알림은 사라진다.
     * 단, 단추가 멈추기를 기다리는 사이에 **콘솔이 스스로 화면에 들어오면** 알림은 규칙대로(IntersectionObserver) 사라져
     * 누를 단추가 없어진다 — 휴대폰 화면(375×812)의 CI에서 되풀이해 걸렸다(2026-09-18 P4-01에서 고침,
     * 로그: "element is not stable" 몇 번 뒤 "element is not visible" 47번 → 30초 제한).
     * 그래서 "눌렀거나, 누를 필요가 없었거나" 둘 중 하나면 통과로 보고, 끝 모습(콘솔이 화면 안·알림 사라짐)은 그대로 확인한다.
     */
    const jump = page.locator('[data-lab-console-jump]');
    const clicked = await jump.click({ timeout: 10_000 }).then(
      () => true,
      () => false,
    );
    const consoleAlreadyInView = await consoleBox.evaluate((element) => element.getBoundingClientRect().top < window.innerHeight);
    expect(clicked || consoleAlreadyInView).toBe(true);
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
