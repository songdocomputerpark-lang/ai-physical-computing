/**
 * 컴퓨터 쪽 bluetooth 흉내(ble-pc)가 **다른 탭의 ESP32 실습실(가상 보드)**로 보낸다 — 판 1.1.0, PROGRESS 미해결 137 브라우저 검사.
 *
 * 전에는 같은 문서의 가상 보드(4단원 통합 화면)나 블루투스 칸으로 이은 실제 보드에만 닿았다. 이제 같은 문서에 보드가 없으면
 * [보내기] 패널과 같은 선(같은 접두어·같은 컴퓨터 탭 통로 — BroadcastChannel)의 블루투스 줄기(봉투 type `ble.data`)로 보내고,
 * 받는 쪽 ESP32 실습실의 vision-bridge가 가상 블루투스에 넣는다(`apc:ble-write`). 보드의 알림(notify)은 같은 줄기로 돌아온다.
 *
 * 확인하는 것(두 탭 — 진짜 BroadcastChannel)
 *  1. 보드 탭(?bridge=<접두어>)에서 블루투스로 받는 교안 예제를 돌리고, 영상처리 탭(같은 접두어)에서 교과서 모양 코드
 *     `bluetooth.init(주소)` → `connected` → `send("x,y")`를 돌리면 보드 콘솔에 받은 값이 찍힌다. 이어진 곳은 data-ble-pc-target=tab,
 *     원본처럼 `Connected to …`가 한 번, 나간 줄은 `Sent: …`.
 *  2. 보드가 `ble.send()`(알림)로 보낸 값이 컴퓨터 탭 콘솔에 원본처럼 찍힌다(bluetooth.py _notification_handler 자리).
 *  3. 보드 탭이 [실행] 전이면 이어지지 않는다(실물 보드도 코드가 돌아야 광고한다) — connected가 거짓이고 보내지 않는다.
 *  4. 영상처리 실습실에서 bluetooth 코드를 열면(같은 문서에 보드가 없으니) [보내기] 패널이 열려 [ESP32 실습실 새 탭에서 열기]가 보인다.
 *     패널 소개·예제 설명·실습 방법은 두 탭 블루투스 흐름을 말하고 "가상 USB-UART 변환기"를 말하지 않는다(1.1.0 교실 사용성 검토 지적 3).
 *  (3번) 이어지기 전에는 출력 화면 아래에 "블루투스: 아직 이을 보드가 없어서…" 줄이 남는다(지적 10), 이어지면(1번) 없다.
 *
 * 돌리는 법(개발 서버): PW_BASE_URL=http://localhost:5002/ai-physical-computing/ npx playwright test tests/e2e/ble-pc-tab.spec.ts --project=desktop --workers=1
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { labRoot, setEditorCode, waitDone } from './helpers/lab.ts';

const VISION_PATH = withBase('labs/vision/');
const ESP32_PATH = withBase('labs/esp32/');
const READY_TIMEOUT = 180_000;

/** 두 탭을 잇는 접두어 — PD-29 모양(12글자, l·o·0·1 없음 — 틀리면 주소 ?bridge=를 버리고 새 접두어를 만든다). 검사마다 따로 쓴다 */
const PREFIX_SEND = 'zangbtpcsnd2';
const PREFIX_NOTIFY = 'zangbtpcnty2';
const PREFIX_IDLE = 'zangbtpcidy2';

/** 블루투스로 받는 교안 예제(0.1초마다 read()해 "수신 데이터: …"를 찍는다 — 배선은 사이드카의 ble 12) */
const BOARD_RECEIVE = 'esp32/bt/b1-ble-receive-print.py';

/** 받은 값에 알림(notify)으로 답하는 보드 코드(머리말의 @part로 블루투스 부품을 그린다) */
const BOARD_ECHO = [
  '# @part ble 12',
  'import ESP32BLE',
  'import time',
  'ble = ESP32BLE.init("ESP32")',
  'while True:',
  '    data = ble.read()',
  '    if data:',
  '        print("got", data)',
  '        ble.send("OK" + data)',
  '    time.sleep(0.05)',
  '',
].join('\n');

/** 교과서 컴퓨터 쪽 모양(f089·f158처럼 init은 try 없이, 이어졌을 때만 보낸다) */
function pcCode(values: number, pause = 0.15): string {
  return [
    'import bluetooth, time',
    'b = bluetooth.init("XX:XX:XX:XX:XX:XX")',
    `for i in range(${values}):`,
    '    if b.connected:',
    '        b.send(f"{i},{i * 2}")',
    `    time.sleep(${pause})`,
    'print("connected at end:", b.connected)',
    '',
  ].join('\n');
}

/** 개발 서버로 돌릴 때만: 다른 구역이 파일을 저장해도 Vite가 쪽을 새로 고치지 않게(scenario-f.spec.ts와 같은 방법) */
async function blockHmr(page: Page): Promise<void> {
  if (process.env.PW_BASE_URL) {
    await page.routeWebSocket(/\?token=|vite-hmr/u, () => {
      // 연결하지 않고 버린다 — 빌드한 사이트·CI에는 이 소켓이 없다.
    });
  }
}

async function openBoard(context: BrowserContext, query: string): Promise<Page> {
  const page = await context.newPage();
  await blockHmr(page);
  const response = await page.goto(`${ESP32_PATH}${query}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
  await expect(page.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: READY_TIMEOUT });
  return page;
}

async function openVision(page: Page, query: string): Promise<void> {
  await blockHmr(page);
  const response = await page.goto(`${VISION_PATH}${query}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
}

async function run(page: Page): Promise<void> {
  await page.getByRole('button', { name: '실행', exact: true }).first().click();
}

async function stop(page: Page): Promise<void> {
  await page.getByRole('button', { name: '정지', exact: true }).first().click();
}

function consoleOf(page: Page) {
  return page.locator('[data-lab-console]');
}

test.describe('컴퓨터 쪽 bluetooth 흉내 → 다른 탭의 ESP32 실습실(미해결 137)', () => {
  test.describe.configure({ mode: 'default', timeout: 420_000 });
  test.skip(({ isMobile }) => Boolean(isMobile), '두 탭·파이썬 두 벌 검사라 데스크톱에서만');

  test('보드 탭이 블루투스로 받는 코드를 돌리면, 영상처리 탭의 bluetooth.send가 그 가상 보드에 닿는다', async ({ page, context }) => {
    const board = await openBoard(context, `?example=${encodeURIComponent(BOARD_RECEIVE)}&bridge=${PREFIX_SEND}`);
    await expect(board.locator('[data-board-part="ble"]')).toBeVisible();
    await run(board);
    const bleHost = board.locator('[data-board-part-controls][data-part="ble"]');
    await expect(bleHost).toHaveAttribute('data-ble-running', 'true', { timeout: 60_000 });

    await openVision(page, `?bridge=${PREFIX_SEND}`);
    await setEditorCode(page, pcCode(40));
    await run(page);
    expect(await waitDone(page, 120_000)).toBe('ok');

    // 이어진 곳은 다른 탭(ESP32 실습실)이고, 원본처럼 이어졌을 때 한 번 "Connected to …"
    await expect(labRoot(page)).toHaveAttribute('data-ble-pc-target', 'tab');
    const pcText = (await consoleOf(page).textContent()) ?? '';
    expect(pcText.match(/Connected to ESP32 실습실의 가상 보드/gu)?.length ?? 0).toBe(1);
    expect(pcText).toMatch(/Sent: \d+,\d+/u);
    expect(pcText).toContain('connected at end: True');
    expect(pcText).not.toContain('Unable to send data');
    const sent = Number(await labRoot(page).getAttribute('data-ble-pc-sent'));
    expect(sent).toBeGreaterThan(5);
    // 초당 10줄 제한(§7.2 규칙 4) — 0.15초마다 40번(약 6초) 보내도 넘치지 않는다
    expect(sent).toBeLessThanOrEqual(40);

    // 보드 탭: 가상 블루투스가 이어지고(상대 기기 노릇), 받은 값이 ESP32BLE.read()로 콘솔에 찍힌다
    await expect(bleHost).toHaveAttribute('data-ble-connected', 'true');
    await expect(consoleOf(board)).toContainText(/수신 데이터: \d+,\d+/u, { timeout: 30_000 });
    await expect(board.locator('[data-bridge-role-band]')).toHaveAttribute('data-peer', 'yes');

    await stop(board);
    expect(await waitDone(board, 30_000)).toBe('stopped');
    await expect(consoleOf(board)).not.toContainText('Traceback');
    await board.close();
  });

  test('보드가 알림(ble.send)으로 보낸 값이 컴퓨터 탭 콘솔에 원본처럼 찍힌다', async ({ page, context }) => {
    const board = await openBoard(context, `?bridge=${PREFIX_NOTIFY}`);
    await setEditorCode(board, BOARD_ECHO);
    await expect(board.locator('[data-board-part="ble"]')).toBeVisible({ timeout: 30_000 });
    await run(board);
    await expect(board.locator('[data-board-part-controls][data-part="ble"]')).toHaveAttribute('data-ble-running', 'true', { timeout: 60_000 });

    await openVision(page, `?bridge=${PREFIX_NOTIFY}`);
    await setEditorCode(
      page,
      [
        'import bluetooth, time',
        'b = bluetooth.init("XX:XX:XX:XX:XX:XX")',
        'for i in range(30):',
        '    if b.connected:',
        '        b.send("7")',
        '    time.sleep(0.1)',
        'print()',
        'print("끝")',
        '',
      ].join('\n'),
    );
    await run(page);
    expect(await waitDone(page, 120_000)).toBe('ok');
    await expect(consoleOf(board)).toContainText('got 7', { timeout: 30_000 });
    // 보드의 ESP32BLE.send는 끝에 줄바꿈을 붙여 알린다 — 컴퓨터 쪽 흉내가 받은 글을 그대로 찍는다
    await expect(consoleOf(page)).toContainText('OK7');
    expect(Number(await labRoot(page).getAttribute('data-ble-pc-received'))).toBeGreaterThan(0);

    await stop(board);
    expect(await waitDone(board, 30_000)).toBe('stopped');
    await board.close();
  });

  test('보드 탭이 [실행] 전이면 이어지지 않는다(실물도 코드가 돌아야 광고한다) — 보내지 않고 안내만 한다', async ({ page, context }) => {
    const board = await openBoard(context, `?example=${encodeURIComponent(BOARD_RECEIVE)}&bridge=${PREFIX_IDLE}`);
    await openVision(page, `?bridge=${PREFIX_IDLE}`);
    await setEditorCode(page, pcCode(12, 0.1));
    await run(page);
    expect(await waitDone(page, 120_000)).toBe('ok');
    const pcText = (await consoleOf(page).textContent()) ?? '';
    expect(pcText).toContain('connected at end: False');
    expect(pcText).not.toContain('Connected to');
    await expect(labRoot(page)).toHaveAttribute('data-ble-pc-sent', '0');
    // 보드가 없다고 한 번 알리고(보드 쪽을 여는 길을 알려 준다), 연결 전 보내기는 원본처럼 한 줄
    expect(pcText).toContain('[ESP32 실습실 새 탭에서 열기]');
    // 콘솔 안내는 print 줄 사이에 묻히므로 출력 화면 아래에도 한 줄 — 코드가 끝나도 이어진 적이 없으면 남는다
    const waiting = page.locator('[data-ble-pc-waiting]');
    await expect(waiting).toBeVisible();
    await expect(waiting).toContainText('블루투스: 아직 이을 보드가 없어서 값을 보내지 않아요');
    await expect(waiting).toContainText('[ESP32 실습실 새 탭에서 열기]');
    await expect(consoleOf(board)).not.toContainText('수신 데이터');
    await board.close();
  });

  test('영상처리 실습실에서 bluetooth 코드를 열면 [보내기] 패널이 열린다(같은 문서에 보드가 없을 때 — 보드 쪽을 여는 길)', async ({ page }) => {
    await openVision(page, `?example=${encodeURIComponent('vision/u3/3-1-3-hand-ble-xy.py')}`);
    await expect(page.locator('[data-lab-module-panel="vision-bridge"]')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-bridge-open-tab]')).toBeVisible();
    // 짝 보드 예제를 먼저 골라 둔다(3-1-3 블루투스 보드 쪽)
    await expect(page.locator('[data-bridge-board-example]')).toHaveValue('esp32/u3/3-1-3-ble-xy-rgb.py');
    // 패널 소개·도움말은 선이 실어 나르는 것(가상 블루투스)에 맞춘다 — 블루투스를 배우는 화면에서 "USB-UART"·uart.readline()을 말하지 않는다
    const panel = page.locator('[data-bridge-panel]');
    await expect(panel).toHaveAttribute('data-bridge-carry', 'ble');
    const intro = panel.locator('.bridge__intro:visible');
    await expect(intro).toHaveCount(1);
    await expect(intro).toContainText('블루투스 코드');
    await expect(intro).toContainText('ESP32BLE.read()');
    await expect(intro).not.toContainText('USB-UART');
    await expect(panel.locator('.bridge__hint:visible')).not.toContainText('uart.readline()');
    // 예제 설명 한 줄과 실습 방법 상자도 두 탭 흐름([ESP32 실습실 새 탭에서 열기])을 말한다
    await expect(page.locator('[data-lab-example-description]')).toContainText('[ESP32 실습실 새 탭에서 열기]');
    await expect(page.locator('[data-lab-example-description]')).not.toContainText('영상처리 실습실에서만 돌리면');
    await expect(page.locator('[data-vision-practice-steps] li').first()).toContainText('[ESP32 실습실 새 탭에서 열기]');
  });
});
