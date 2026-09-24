/**
 * ESP32 실습실 — 구역 B(PLAN §8.4 P4-03 가상 BLE) 브라우저 테스트.
 * 규약은 src/lab/README.md 7.5·7.9, 코드는 src/lab/modules/board/ext/ble/(저수준 bluetooth 흉내)와 parts/ble/(화면·조작 칸).
 *
 * 완료 기준 "f098·f099·f137·f147~f149·f002가 돈다 · 한 칸 덮어쓰기가 원본과 같다"를 **원본 예제 파일 그대로**(?example=) 열어 확인한다.
 *  1. f098: 주소를 콘솔에 찍고 상태 LED(GPIO12)가 깜빡이다가 [연결]에서 계속 켜진다(ESP32BLE.py 원본의 Timer).
 *  2. f137: 글자를 보내면 콘솔에 찍히고, 20바이트가 넘으면 실물처럼 잘리며 경고가 보인다.
 *  3. f099: "DATA,x,y"를 보내면 LCD 글자 칸이 바뀌고, 머리말이 다른 값은 버려진다.
 *  4. f147: [a]·[b] 단추 → LCD left·right.
 *  5. f148: [a] → 빨강, [c] → 초록(빨강은 상태 LED와 핀이 같은 원본 그대로).
 *  6. f149: [a] → 서보 0도, [b] → 180도.
 *  7. f002: "가상 스마트폰 앱" 버튼 → 이진 프레임 → RGB LED 색.
 *  8. 배선: 블루투스 칸이 그려지고 스트래핑 핀(GPIO12) 주의가 보인다. 휴대폰 폭에서 가로로 넘치지 않는다.
 *
 * 뒤쪽 "사이트판 예제" 묶음은 PD-23(레이저 끄기)·핀 겹침 사이트판 5개를 지킨다 — 이 파일들은 이관 목록에 없어서
 * 예제 스모크(tests/e2e/examples-smoke.spec.ts)가 돌리지 않으므로 여기가 유일한 안전망이다.
 *
 * 기기 주소는 실행마다 새로 만드는 가상 주소라 값이 아니라 모양만 본다(PLAN §10 — 저장소에 실제 주소를 적지 않는다).
 */
import { expect, test, type Locator, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { LOAD_TIMEOUT, labRoot, waitDone } from './helpers/lab.ts';

const ESP32_PATH = withBase('labs/esp32/');
/** 빈 글자 칸에 넣는 줄바꿈 없는 공백(U+00A0) */
const NBSP = String.fromCharCode(0xa0);

function board(page: Page): Locator {
  return page.locator('[data-board-io]');
}

function blePanel(page: Page): Locator {
  return page.locator('[data-board-part-controls][data-part="ble"]');
}

function part(page: Page, id: string): Locator {
  return page.locator(`[data-board-part="${id}"]`);
}

async function consoleText(page: Page): Promise<string> {
  return (await page.locator('[data-lab-console]').textContent()) ?? '';
}

/** RGB LED 부품이 지금 보이는 색 이름(빨강·초록·파랑·꺼짐 — rgb-model.ts colorName. 색만으로 알리지 않으려고 글자로도 적는 값이다) */
async function colorName(page: Page): Promise<string | null> {
  return part(page, 'rgb-led').getAttribute('data-visual-name');
}

async function lcdRow(page: Page, row: number): Promise<string> {
  const cells = await part(page, 'lcd').locator(`[data-lcd-line="${row}"] [data-lcd-cell]`).allTextContents();
  return cells.map((text) => text.replaceAll(NBSP, ' ')).join('');
}

async function openExample(page: Page, file: string): Promise<void> {
  const response = await page.goto(`${ESP32_PATH}?example=${encodeURIComponent(file)}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
  await expect(board(page)).toHaveAttribute('data-board-ready', 'yes', { timeout: 30_000 });
}

async function run(page: Page): Promise<void> {
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(board(page)).toHaveAttribute('data-board-phase', /^(run|idle|end)$/u, { timeout: 60_000 });
}

async function stop(page: Page): Promise<void> {
  await page.getByRole('button', { name: '정지', exact: true }).click();
  expect(await waitDone(page, 30_000)).toBe('stopped');
}

/**
 * 상대 기기로 연결한다(조작 칸의 [연결]).
 * 누르기 전에 조작 칸이 "보드가 도는 중"임을 알고 있는지 먼저 본다 — 모르는 동안 누르면 칸이 보내지 않고 안내만 띄운다(part.ts의 send).
 */
async function connect(page: Page): Promise<void> {
  const panel = blePanel(page);
  await expect(panel).toHaveAttribute('data-ble-running', 'true', { timeout: 30_000 });
  await panel.getByRole('button', { name: '연결', exact: true }).click();
  await expect(panel).toHaveAttribute('data-ble-connected', 'true', { timeout: 15_000 });
}

/** 글자를 보낸다(조작 칸의 "보낼 글자" + [보내기]) */
async function sendText(page: Page, text: string): Promise<void> {
  const panel = blePanel(page);
  await panel.locator('[data-ble-text]').fill(text);
  await panel.getByRole('button', { name: '보내기', exact: true }).click();
}

/** 좌표를 보낸다(조작 칸의 "좌표 보내기" — 모양·범위를 고르고 [좌표 보내기]나 [클릭 보내기]) */
async function sendCoordinate(page: Page, shape: 'plain' | 'data3' | 'data5', click = false): Promise<void> {
  const panel = blePanel(page);
  await panel.locator('[data-ble-shape]').selectOption(shape);
  await panel.locator('[data-ble-range]').selectOption('screen');
  await panel.locator(click ? '[data-ble-click]' : '[data-ble-send-xy]').click();
}

test.describe('가상 블루투스(BLE)', () => {
  // 실습실 하나하나가 브라우저에서 Pyodide를 띄우므로 기본 30초로는 모자라다(다른 실습실 spec과 같은 값).
  test.describe.configure({ timeout: 240_000 });

  test('f098: 주소를 찍고 상태 LED가 깜빡이다가 연결되면 계속 켜진다', async ({ page }) => {
    await openExample(page, 'esp32/u4/4-1-4-ble-address-check.py');
    // 배선에 블루투스 칸이 그려지고, GPIO12가 스트래핑 핀이라는 주의가 함께 보인다
    await expect(part(page, 'ble')).toBeVisible();
    await expect(board(page).locator('[data-board-problems] li[data-code="strapping"]')).toContainText('GPIO12');
    await run(page);

    // ESP32BLE.py 원본이 주소를 찍는다(가상 주소 — 값이 아니라 모양만 본다)
    await expect
      .poll(async () => (/ESP32 블루투스 주소: (?:[0-9a-f]{2}:){5}[0-9a-f]{2}/u.test(await consoleText(page)) ? 'yes' : 'no'), { timeout: 30_000 })
      .toBe('yes');

    // 코드가 끝나도 Timer가 남아 상태 LED가 0.1초마다 뒤집힌다(실습실은 [정지]까지 이어 돈다)
    const blink = await page.locator('[data-board-part="ble"]').evaluate(async (element) => {
      const seen = new Set<string>();
      const stop = Date.now() + 3000;
      while (Date.now() < stop && seen.size < 2) {
        seen.add(String(element.getAttribute('data-visual-lit')));
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      return [...seen].sort();
    });
    expect(blink).toEqual(['false', 'true']);

    await expect(blePanel(page)).toHaveAttribute('data-ble-advertising', 'true');
    await expect(blePanel(page).locator('[data-ble-status]')).toContainText('광고 중');
    await connect(page);
    await expect(blePanel(page).locator('[data-ble-status]')).toContainText('연결됨');
    // 연결되면 원본이 Timer를 멈추고 LED를 켜 둔다
    await expect(part(page, 'ble')).toHaveAttribute('data-visual-lit', 'true');
    await page.waitForTimeout(400);
    await expect(part(page, 'ble')).toHaveAttribute('data-visual-lit', 'true');
    // 가상 주소 안내가 조작 칸에도 있다
    await expect(blePanel(page).locator('[data-ble-mac]')).toContainText('가상 보드가 만든 주소');
    await stop(page);
  });

  test('f137: 보낸 글자가 콘솔에 찍히고, 20바이트가 넘으면 실물처럼 잘린다', async ({ page }) => {
    await openExample(page, 'esp32/bt/b1-ble-receive-print.py');
    await run(page);
    await connect(page);
    await sendText(page, 'hello');
    await expect.poll(async () => consoleText(page), { timeout: 20_000 }).toContain('수신 데이터: hello');

    // 20바이트를 넘겨 보내면 보내기는 되지만(§7.7) 앞 20바이트만 보드에 남는다
    await sendText(page, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    await expect(blePanel(page).locator('[data-ble-warning]')).toContainText('20바이트');
    await expect.poll(async () => consoleText(page), { timeout: 20_000 }).toContain('수신 데이터: ABCDEFGHIJKLMNOPQRST');
    expect(await consoleText(page)).not.toContain('ABCDEFGHIJKLMNOPQRSTU');
    // 콘솔에 찍지 않는 예제에서도 보이게, 조작 칸이 "보드가 받아 둔 값"을 따로 보인다(잘린 값 그대로)
    await expect(blePanel(page).locator('[data-ble-rx-last]')).toHaveText('보드가 받아 둔 값: ABCDEFGHIJKLMNOPQRST');
    await expect(blePanel(page).locator('[data-ble-counts]')).toContainText('20바이트가 넘어 잘린 값 1개');
    await stop(page);
  });

  test('f099: DATA,x,y를 보내면 LCD에 좌표가 보이고 머리말이 다르면 버린다', async ({ page }) => {
    await openExample(page, 'esp32/u4/4-1-4-ble-lcd-rx.py');
    await run(page);
    await expect.poll(async () => lcdRow(page, 0), { timeout: 30_000 }).toContain('BLE Waiting');
    await connect(page);
    await sendText(page, 'DATA,120,80');
    await expect.poll(async () => lcdRow(page, 0), { timeout: 20_000 }).toContain('X:120');
    expect(await lcdRow(page, 0)).toContain('Y:80');

    // 머리말·칸 수가 다르면 그대로 둔다(예제가 len(parts) == 3과 "DATA"를 검사한다)
    await sendText(page, '999,999');
    await page.waitForTimeout(500);
    expect(await lcdRow(page, 0)).toContain('X:120');
    await stop(page);
  });

  test('f147: [a]·[b] 단추로 LCD에 left·right가 보인다', async ({ page }) => {
    await openExample(page, 'esp32/bt/b7-finger-lcd.py');
    await run(page);
    await connect(page);
    // 원본은 글자를 1초만 보여 주고 지운다(sleep(1) 뒤 lcd.clear()) — 기본 간격(점점 1초까지 벌어짐)으로 보면 그 1초를 놓칠 수 있어
    // 0.1초마다 본다(2026-09-24 CI에서 한 번 놓침).
    await blePanel(page).locator('[data-ble-command="a"]').click();
    await expect.poll(async () => lcdRow(page, 0), { timeout: 20_000, intervals: [100] }).toContain('left');
    await blePanel(page).locator('[data-ble-command="b"]').click();
    await expect.poll(async () => lcdRow(page, 0), { timeout: 20_000, intervals: [100] }).toContain('right');
    await stop(page);
  });

  test('f148: [a]는 빨강, [c]는 초록 — 빨강은 상태 LED와 핀이 같은 원본 그대로다', async ({ page }) => {
    await openExample(page, 'esp32/bt/b8-finger-rgb.py');
    // 상태 LED(GPIO12)와 빨강이 같은 핀이라 "한 핀에 출력 부품 여럿"을 알린다
    await expect(board(page).locator('[data-board-problems] li[data-code="shared-output"]')).toContainText('GPIO12');
    await run(page);
    await connect(page);
    // 원본의 else 분기가 1초마다 세 색을 모두 꺼서, 아무 명령도 없으면 꺼진 상태로 가라앉는다
    await expect.poll(async () => colorName(page), { timeout: 20_000 }).toBe('꺼짐');
    await blePanel(page).locator('[data-ble-command="a"]').click();
    await expect.poll(async () => colorName(page), { timeout: 20_000 }).toBe('빨강');
    await blePanel(page).locator('[data-ble-command="c"]').click();
    await expect.poll(async () => colorName(page), { timeout: 20_000 }).toBe('초록');
    await stop(page);
  });

  test('f149: [a]는 0도, [b]는 180도로 서보가 돈다', async ({ page }) => {
    await openExample(page, 'esp32/bt/b9-finger-servo.py');
    await run(page);
    await connect(page);
    await blePanel(page).locator('[data-ble-command="a"]').click();
    await expect.poll(async () => part(page, 'servo').getAttribute('data-visual-angle'), { timeout: 20_000 }).toBe('0');
    await blePanel(page).locator('[data-ble-command="b"]').click();
    await expect.poll(async () => part(page, 'servo').getAttribute('data-visual-angle'), { timeout: 20_000 }).toBe('180');
    await stop(page);
  });

  test('f002: 가상 스마트폰 앱 버튼이 이진 프레임을 보내 RGB LED 색을 바꾼다', async ({ page }) => {
    await openExample(page, 'esp32/hw/ble-dabble-rgb.py');
    await run(page);
    await connect(page);
    await expect.poll(async () => consoleText(page), { timeout: 20_000 }).toContain('New connection 0');
    await blePanel(page).locator('[data-ble-app="2"]').click();
    // 칸이 프레임을 정말 내보냈는지 먼저 본다(못 내보냈으면 색이 안 바뀌는 까닭이 보드가 아니라 칸이다)
    await expect(blePanel(page)).toHaveAttribute('data-ble-sent', '1');
    await expect.poll(async () => colorName(page), { timeout: 20_000 }).toBe('초록');
    await blePanel(page).locator('[data-ble-app="3"]').click();
    await expect(blePanel(page)).toHaveAttribute('data-ble-sent', '2');
    await expect.poll(async () => colorName(page), { timeout: 20_000 }).toBe('파랑');
    // 프레임을 푼 글자가 콘솔에 찍힌다(원본의 print(buf))
    expect(await consoleText(page)).toContain('blu');
    await stop(page);
  });

  test('조작 칸은 키보드로 다루고 보낸 값이 기록에 남는다', async ({ page }) => {
    await openExample(page, 'esp32/bt/b1-ble-receive-print.py');
    await run(page);
    const panel = blePanel(page);
    // 탭으로 [연결]까지 갈 수 있고 Enter로 눌린다
    await panel.getByRole('button', { name: '연결', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(panel).toHaveAttribute('data-ble-connected', 'true', { timeout: 15_000 });
    await panel.locator('[data-ble-text]').fill('abc');
    await page.keyboard.press('Enter');
    await expect(panel.locator('[data-ble-log]')).toHaveValue(/→ 보냄 {2}abc/u);
    await expect(panel).toHaveAttribute('data-ble-rx', /^[1-9]/u, { timeout: 20_000 });
    await stop(page);
  });
});

/**
 * 사이트판 예제(PLAN PD-10·PD-23). 원본은 그대로 두고 `…-site.py`를 따로 두는 파일들이라 예제 스모크(이관 목록 기준)에 들어가지 않는다 —
 * 그래서 만든 구역이 여기서 지킨다(scripts/examples-manifest.yaml 머리말의 약속).
 */
test.describe('가상 블루투스 — 사이트판 예제', () => {
  // 실습실 하나하나가 브라우저에서 Pyodide를 띄우므로 기본 30초로는 모자라다(다른 실습실 spec과 같은 값).
  test.describe.configure({ timeout: 240_000 });

  test.skip(({ viewport }) => (viewport?.width ?? 1366) <= 500, '데스크톱에서만(같은 파이썬·같은 흉내라 결과가 같다)');

  test('f148 사이트판: RGB를 27·32·33으로 옮겨 상태 LED와 겹치지 않는다', async ({ page }) => {
    await openExample(page, 'esp32/bt/b8-finger-rgb-site.py');
    // 원본에 있던 "한 핀에 출력 부품 여럿"(GPIO12)이 사라진다
    await expect(board(page).locator('[data-board-problems] li[data-code="shared-output"]')).toHaveCount(0);
    await run(page);
    // 연결 전에도 RGB는 꺼진 채다(원본은 상태 LED 타이머 때문에 빨강이 저절로 깜빡였다)
    await page.waitForTimeout(1200);
    expect(await colorName(page)).toBe('꺼짐');
    await connect(page);
    await blePanel(page).locator('[data-ble-command="a"]').click();
    await expect.poll(async () => colorName(page), { timeout: 20_000 }).toBe('빨강');
    await blePanel(page).locator('[data-ble-command="c"]').click();
    await expect.poll(async () => colorName(page), { timeout: 20_000 }).toBe('초록');
    await stop(page);
  });

  test('f110 사이트판: 값을 받으면 LCD가 바뀌고, 더 오지 않으면 레이저가 꺼진다(PD-23)', async ({ page }) => {
    await openExample(page, 'esp32/u4/4-2-2-adv-ble-servo-rgb-laser-buzzer-site.py');
    await run(page);
    await expect.poll(async () => lcdRow(page, 0), { timeout: 30_000 }).toContain('BLE Waiting');
    await connect(page);
    await sendCoordinate(page, 'data5');
    // 값이 왔다(LCD가 좌표로 바뀜). 둘째 줄의 19글자가 넘쳐 첫 줄 앞 3칸(X:와 첫 숫자)을 덮는 원본 그대로라(CODE_MAPPING f105 비고)
    // 'X:'는 잠깐만 보인다 — 끝 상태에도 남는 'Y:'로 본다(2026-09-24 CI에서 'X:'를 놓침, unit4.spec.ts와 같은 방법).
    await expect.poll(async () => lcdRow(page, 0), { timeout: 20_000 }).toContain('Y:');
    // 그런데 레이저는 계속 켜져 있지 않다 — 주석을 푼 else 분기가 끈다
    await expect.poll(async () => part(page, 'laser').getAttribute('data-visual-lit'), { timeout: 10_000 }).toBe('false');
    await stop(page);
  });

  test('f113 사이트판: 이름을 고쳐 돌고, 레이저가 2초 뒤에 저절로 꺼진다(PD-23)', async ({ page }) => {
    await openExample(page, 'esp32/u4/4-2-2-explore-rgb-buzzer-site.py');
    await run(page);
    // 원본은 1번 줄 ESP32BLE_LIB에서 ModuleNotFoundError로 멈춘다 — 사이트판은 LCD 첫 글자까지 간다
    await expect.poll(async () => lcdRow(page, 0), { timeout: 30_000 }).toContain('BLE Waiting');
    await connect(page);
    await sendCoordinate(page, 'data5', true);
    await expect.poll(async () => part(page, 'laser').getAttribute('data-visual-lit'), { timeout: 20_000 }).toBe('true');
    await expect.poll(async () => part(page, 'laser').getAttribute('data-visual-lit'), { timeout: 15_000 }).toBe('false');
    await stop(page);
  });

  test('f111·f115 사이트판이 파이썬 오류 없이 돈다', async ({ page }) => {
    for (const file of ['esp32/u4/4-2-2-adv-ble-mount-site.py', 'esp32/u4/4-2-3-ble-servo-rgb-laser-buzzer-site.py']) {
      await openExample(page, file);
      await run(page);
      await expect.poll(async () => lcdRow(page, 0), { timeout: 30_000 }).toContain('BLE Waiting');
      await connect(page);
      await sendCoordinate(page, 'data5');
      await expect.poll(async () => lcdRow(page, 0), { timeout: 20_000 }).toContain('Y:'); // 'X:'는 둘째 줄이 덮는다(위 f110 검사와 같음)
      await expect(part(page, 'laser')).toHaveAttribute('data-visual-lit', 'false', { timeout: 10_000 });
      expect(await consoleText(page), file).not.toContain('Traceback');
      await stop(page);
    }
  });
});

test.describe('가상 블루투스 — 휴대폰 폭', () => {
  // 실습실 하나하나가 브라우저에서 Pyodide를 띄우므로 기본 30초로는 모자라다(다른 실습실 spec과 같은 값).
  test.describe.configure({ timeout: 240_000 });

  test.skip(({ viewport }) => (viewport?.width ?? 1366) > 500, '휴대폰 화면에서만');

  test('조작 칸이 가로로 넘치지 않는다', async ({ page }) => {
    await openExample(page, 'esp32/bt/b1-ble-receive-print.py');
    await expect(blePanel(page)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
