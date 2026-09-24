// USB 데이터 포트(PLAN §8.4 P4-05) 브라우저 테스트 — 실제 변환기 대신 모의 시리얼(tests/e2e/helpers/serial.ts, README 8절)을 쓴다.
// 모의에서 된다는 것은 실물의 증거가 아니다(실제 송수신은 부록 B-2 8번 — 운영자 확인).
// 확인하는 것
//  1. 모듈이 실습실에 붙고(data-lab-modules), 패널은 코드가 시리얼을 쓸 때만 열린다.
//  2. [데이터 포트 연결]이 포트 선택 창(클릭 안에서만)을 열어 변환기 포트를 **보드 REPL 포트와 따로** 연다 — 칩·속도·이름표가 보인다.
//  3. 시험 보내기가 변환기로 나가고, 되돌아온 바이트가 패널(글자·16진수)과 실습실 콘솔에 보인다.
//  4. 속도를 바꾸면 같은 포트를 새 속도로 다시 연다. [연결 끊기] → 연결 전으로.
//  5. 선택 창을 닫으면 까닭을 알리고, **보드 REPL 포트를 잘못 고르면** MicroPython 자국을 보고 한국어로 알린다.
//  6. 이름표는 이 컴퓨터의 브라우저에만 저장된다(기록 지우기 대상 이름).
import { expect, test, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { labRoot, setEditorCode } from './helpers/lab.ts';
import { installSerialMock, serialMock, USB_IDS } from './helpers/serial.ts';

const DEV_LAB = withBase('labs/dev/runtime/');
/** 개발 서버가 페이지를 처음 옮기는 시간(Vite 변환)까지 넉넉히 */
const MODULE_TIMEOUT = 120_000;
const PORT_TIMEOUT = 20_000;

/** 변환기(CP2102 — 보드의 CH340과 눈으로 가려지게)와 보드 REPL 포트 둘 */
const TWO_PORTS = {
  ports: [
    { id: 'converter', label: 'USB-UART 변환기', usb: 'cp2102' as const, device: 'echo' as const },
    { id: 'board', label: 'ESP32(CH340)', usb: 'ch340' as const, device: 'micropython' as const },
  ],
};

function panel(page: Page) {
  return page.locator('[data-data-port]');
}

async function openLab(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installSerialMock(page, TWO_PORTS);
  const response = await page.goto(DEV_LAB);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /(^|\s)data-port(\s|$)/u, { timeout: MODULE_TIMEOUT });
  return errors;
}

/** 편집칸에 시리얼을 쓰는 코드를 넣어 패널을 연다 */
async function showPanel(page: Page): Promise<void> {
  await setEditorCode(page, "import serial\n\nuart = serial.Serial('COM10', 115200)\n");
  await expect(panel(page)).toBeVisible({ timeout: 20_000 });
}

async function connect(page: Page, portId: string): Promise<void> {
  await serialMock(page, portId).chooseNext(portId);
  await panel(page).getByRole('button', { name: '데이터 포트 연결' }).click();
  await expect(panel(page)).toHaveAttribute('data-data-port-state', 'open', { timeout: PORT_TIMEOUT });
}

test.describe('USB 데이터 포트(모의 시리얼)', () => {
  test.describe.configure({ timeout: 240_000 });

  test('패널은 코드가 시리얼을 쓸 때만 열리고, 변환기 포트를 두 번째 포트로 연다', async ({ page }) => {
    const errors = await openLab(page);
    // 처음 예제(print)에는 시리얼이 없으므로 패널이 닫혀 있다
    await expect(panel(page)).toBeHidden();
    await showPanel(page);
    await expect(panel(page)).toHaveAttribute('data-data-port-state', 'idle');

    await connect(page, 'converter');
    const converter = serialMock(page, 'converter');
    const board = serialMock(page, 'board');
    expect(await converter.isOpen()).toBe(true);
    // 보드 REPL 포트는 건드리지 않았다
    expect(await board.isOpen()).toBe(false);
    expect((await converter.openLog())[0]?.baudRate).toBe(115200);
    await expect(panel(page).locator('[data-data-port-chip]')).toContainText('CP210x');
    await expect(panel(page).locator('[data-data-port-status]')).toContainText('115200 bps');
    expect(errors).toEqual([]);
  });

  test('시험 보내기가 변환기로 나가고 되돌아온 바이트가 패널·콘솔에 보인다', async ({ page }) => {
    await openLab(page);
    await showPanel(page);
    await connect(page, 'converter');
    const converter = serialMock(page, 'converter');

    await panel(page).getByLabel('시험 보내기').fill('a');
    await panel(page).getByRole('button', { name: '보내기' }).click();
    await expect.poll(() => converter.writtenText(), { timeout: PORT_TIMEOUT }).toBe('a\n');
    // 에코 장치라 그대로 돌아온다 — 받은 줄과 16진수가 보인다
    await expect(panel(page).locator('[data-data-port-lines]')).toContainText('a');
    await expect(panel(page).locator('[data-data-port-hex]')).toContainText('61 0a');
    await expect(panel(page).locator('[data-data-port-count]')).toContainText('받은 2바이트 · 보낸 2바이트');
    // 콘솔에도 한 줄 남는다(결과를 한 곳에서 보게)
    await expect(page.locator('[data-lab-console]')).toContainText('데이터 포트에서 받음: a');
  });

  test('속도를 바꾸면 같은 포트를 새 속도로 다시 열고, [연결 끊기]는 연결 전으로 되돌린다', async ({ page }) => {
    await openLab(page);
    await showPanel(page);
    await connect(page, 'converter');
    const converter = serialMock(page, 'converter');

    await panel(page).getByLabel('통신 속도').selectOption('9600');
    await expect(panel(page).locator('[data-data-port-status]')).toContainText('9600 bps', { timeout: PORT_TIMEOUT });
    await expect.poll(async () => (await converter.openLog()).map((item) => item.baudRate)).toEqual([115200, 9600]);

    await panel(page).getByRole('button', { name: '연결 끊기' }).click();
    await expect(panel(page)).toHaveAttribute('data-data-port-state', 'idle', { timeout: PORT_TIMEOUT });
    await expect.poll(() => converter.isOpen()).toBe(false);
  });

  test('선택 창을 닫거나 보드 REPL 포트를 고르면 한국어로 알린다', async ({ page }) => {
    await openLab(page);
    await showPanel(page);

    // ① 창을 닫음
    await serialMock(page).chooseNext(null);
    await panel(page).getByRole('button', { name: '데이터 포트 연결' }).click();
    await expect(panel(page).locator('[data-data-port-problem-text]')).toContainText('포트를 고르지 않았어요', { timeout: PORT_TIMEOUT });
    await expect(panel(page)).toHaveAttribute('data-data-port-state', 'idle');

    // ② 보드 REPL 포트를 골랐다 — 보드가 다시 켜지면서 보낸 MicroPython 시작 글을 보고 알려 준다
    await connect(page, 'board');
    await serialMock(page, 'board').reset('soft');
    await expect(panel(page)).toHaveAttribute('data-data-port-repl-suspect', 'yes', { timeout: PORT_TIMEOUT });
    await expect(panel(page).locator('[data-data-port-status]')).toContainText('보드 포트를 고른 것 같아요');
  });

  test('영상처리·ESP32 실습실에도 붙지만 패널은 닫혀 있고 다른 화면을 건드리지 않는다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await installSerialMock(page, TWO_PORTS);
    for (const path of [withBase('labs/vision/'), withBase('labs/esp32/')]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /(^|\s)data-port(\s|$)/u, { timeout: MODULE_TIMEOUT });
      // 처음 예제는 시리얼을 쓰지 않으므로 칸이 닫혀 있다(README 4.3 "패널은 쓸 때만 연다")
      await expect(page.locator('[data-lab-module-panel="data-port"]')).toBeHidden();
    }
    expect(errors).toEqual([]);
  });

  test('ESP32 실습실에서 보드 REPL 포트와 데이터 포트를 **나란히** 연다(3-1-2 실습 모양)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await installSerialMock(page, TWO_PORTS);
    const response = await page.goto(withBase('labs/esp32/'));
    expect(response?.status()).toBe(200);
    await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /(^|\s)data-port(\s|$)/u, { timeout: MODULE_TIMEOUT });
    await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /(^|\s)real-board(\s|$)/u, { timeout: MODULE_TIMEOUT });

    // ① 코드를 보내는 보드 포트(P3-07)
    await page.getByRole('tab', { name: '실제 보드' }).click();
    await serialMock(page, 'board').chooseNext('board');
    await page.locator('[data-real-board]').getByRole('button', { name: '보드 연결' }).click();
    await expect(page.locator('[data-real-board]')).toHaveAttribute('data-real-board-state', 'ready', { timeout: 30_000 });

    // ② 데이터가 오가는 변환기 포트(P4-05) — 코드에 UART가 보이면 칸이 열린다
    await setEditorCode(page, "from machine import UART\n\nuart = UART(2, 115200, tx=17, rx=16)\n");
    await expect(panel(page)).toBeVisible({ timeout: 20_000 });
    await connect(page, 'converter');

    // 두 포트가 동시에 열려 있다
    expect(await serialMock(page, 'board').isOpen()).toBe(true);
    expect(await serialMock(page, 'converter').isOpen()).toBe(true);
    await expect(page.locator('[data-real-board]')).toHaveAttribute('data-real-board-state', 'ready');

    // 변환기로 보낸 글자는 보드 REPL 포트로 가지 않는다
    const boardBefore = await serialMock(page, 'board').writtenText();
    await panel(page).getByLabel('시험 보내기').fill('a');
    await panel(page).getByRole('button', { name: '보내기' }).click();
    await expect.poll(() => serialMock(page, 'converter').writtenText(), { timeout: PORT_TIMEOUT }).toBe('a\n');
    expect(await serialMock(page, 'board').writtenText()).toBe(boardBefore);
    expect(errors).toEqual([]);
  });

  test('이름표는 이 컴퓨터의 브라우저에만 저장된다', async ({ page }) => {
    await openLab(page);
    await showPanel(page);
    await connect(page, 'converter');

    await panel(page).getByLabel('포트 이름표').fill('변환기 1');
    await expect.poll(() =>
      page.evaluate(() => window.localStorage.getItem('ai-physical-computing:module:data-port:labels')),
    ).toContain('변환기 1');
    // USB 번호가 열쇠다(개인정보 없음)
    const saved = await page.evaluate(() => window.localStorage.getItem('ai-physical-computing:module:data-port:labels'));
    expect(saved).toContain(`usb:${USB_IDS.cp2102.usbVendorId.toString(16).padStart(4, '0')}`);
  });
});
