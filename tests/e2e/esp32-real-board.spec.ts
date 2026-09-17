// ESP32 실습실 [실제 보드] 탭 브라우저 테스트(PLAN §8.3 P3-07 실제 보드 ① 연결·raw REPL). 실제 보드 대신 모의 시리얼(tests/e2e/helpers/serial.ts)을 쓴다 —
// 모의 보드에서 된다는 것은 실물의 증거가 아니다(부록 B-2·운영자 할 일 2번).
// 확인하는 것
//  1. [가상 보드]/[실제 보드] 탭이 입력·출력 칸의 가상 보드 위에 있고, 키보드(←·→)로 고르면 칸이 바뀌고 실행 대상이 실제 보드가 된다.
//  2. [보드 연결](클릭 안의 포트 선택 창) → Ctrl-C·Enter·Ctrl-B로 받은 배너에서 MicroPython v1.29.0, USB 칩 CH340을 보인다.
//  3. 같은 [실행]이 raw-paste로 보드에 가서 출력이 콘솔에, 오류는 결과 줄·풀이 카드로, [정지]는 Ctrl-C로 멈춘다. 실행 중에는 탭을 바꾸지 않는다.
//  4. 대답 없는 보드 → [펌웨어 굽기] 안내(보드 준비 페이지 #firmware), 선택 창 닫기 → 포트 고르기 안내, 선 뽑기 → 끊김 → 다시 꽂고 [다시 연결](선택 창 없이).
//  5. 연결 전에 [실행]을 누르면 선택 창 → 연결 → 곧바로 실행. Web Serial이 없는 브라우저 → 안내. 휴대폰 폭에서 가로 넘침 없음.
import { expect, test, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { labRoot, setEditorCode } from './helpers/lab.ts';
import { installSerialMock, serialMock, type SerialMockConfig } from './helpers/serial.ts';

const ESP32_PATH = withBase('labs/esp32/');
/** 개발 서버가 실습실 페이지를 처음 옮기는 시간까지(Vite 변환) 넉넉히 */
const MODULE_TIMEOUT = 120_000;
/** 판별(대답 없는 보드는 두 번 물어본다)·실행 */
const BOARD_TIMEOUT = 20_000;

function realPanel(page: Page) {
  return page.locator('[data-real-board]');
}

function consoleBox(page: Page) {
  return page.locator('[data-lab-console]');
}

async function openLab(page: Page, config?: SerialMockConfig): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (config) {
    await installSerialMock(page, config);
  }
  const response = await page.goto(ESP32_PATH);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /(^|\s)real-board(\s|$)/u, { timeout: MODULE_TIMEOUT });
  await expect(page.locator('[data-lab-module-panel="real-board"]')).toHaveAttribute('data-real-board-placement', 'io');
  return errors;
}

async function chooseRealTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '실제 보드' }).click();
  await expect(realPanel(page)).toBeVisible();
  await expect(labRoot(page)).toHaveAttribute('data-run-target', '실제 보드');
}

async function connect(page: Page, state = 'ready'): Promise<void> {
  await realPanel(page).getByRole('button', { name: '보드 연결' }).click();
  await expect(realPanel(page)).toHaveAttribute('data-real-board-state', state, { timeout: BOARD_TIMEOUT });
}

async function run(page: Page, code: string, outcome: string): Promise<void> {
  await setEditorCode(page, code);
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(labRoot(page)).toHaveAttribute('data-outcome', outcome, { timeout: BOARD_TIMEOUT });
}

test.describe('ESP32 실습실 — 실제 보드 ① 연결·raw REPL(모의 시리얼)', () => {
  test.describe.configure({ timeout: 240_000 });

  test('탭 → [보드 연결] → 배너·칩 → 같은 [실행]으로 출력·오류·정지', async ({ page, isMobile }) => {
    test.skip(isMobile, '연결·실행 흐름은 데스크톱에서 본다(휴대폰 폭 배치는 아래 검사).');
    const errors = await openLab(page, { ports: [{ id: 'board', label: 'ESP32(CH340)' }] });

    // 1. 탭은 입력·출력 칸 안, 가상 보드 칸 바로 위
    const placement = await page.evaluate(() => {
      const io = document.querySelector('[data-lab-io]');
      const tabs = io?.querySelector('[data-board-target-tablist]');
      const boardIo = io?.querySelector('[data-board-io]');
      return tabs && boardIo ? Boolean(tabs.compareDocumentPosition(boardIo) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
    });
    expect(placement).toBe(true);
    const virtualTab = page.getByRole('tab', { name: '가상 보드' });
    const realTab = page.getByRole('tab', { name: '실제 보드' });
    await expect(virtualTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-board-io]')).toBeVisible();
    await expect(page.locator('[data-board-io]')).toHaveAttribute('role', 'tabpanel');
    await expect(realPanel(page)).toBeHidden();
    // 실행 대상을 끼우기 전에는 셸이 data-run-target을 적지 않는다(없거나 빈 값)
    expect((await labRoot(page).getAttribute('data-run-target')) ?? '').toBe('');

    // 키보드: 탭에서 → 누르면 [실제 보드]가 골라지고 초점도 옮겨 간다
    await virtualTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(realTab).toHaveAttribute('aria-selected', 'true');
    await expect(realTab).toBeFocused();
    await expect(realTab).toHaveAttribute('tabindex', '0');
    await expect(virtualTab).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('[data-board-io]')).toBeHidden();
    await expect(realPanel(page)).toBeVisible();
    await expect(labRoot(page)).toHaveAttribute('data-run-target', '실제 보드');
    await expect(page.locator('[data-lab-status]')).toHaveText('실제 보드에서 실행할 수 있어요. [실행]을 누르세요.');
    await expect(realPanel(page).locator('[data-real-board-title]')).toHaveText('실제 보드가 연결되지 않았어요');

    // 2. 연결과 배너 판별
    await connect(page);
    await expect(realPanel(page)).toHaveAttribute('data-real-board-version', 'v1.29.0');
    await expect(realPanel(page)).toHaveAttribute('data-real-board-chip', 'CH340');
    await expect(realPanel(page).locator('[data-real-board-title]')).toHaveText('실제 보드가 연결됐어요');
    await expect(realPanel(page).locator('[data-real-board-firmware]')).toHaveText('MicroPython v1.29.0 (2026-08-24)');
    await expect(realPanel(page).locator('[data-real-board-machine]')).toHaveText('Generic ESP32 module with ESP32');
    await expect(realPanel(page).locator('[data-real-board-chip-text]')).toHaveText('CH340(WCH) · USB 1a86:7523');
    const board = serialMock(page);
    expect(await board.writtenText()).toBe('\x03\x03\r\x02');
    expect(await board.requests()).toEqual([{}]);
    expect(await board.mode()).toBe('friendly');

    // 3. 같은 [실행] — raw-paste로 보내고 출력이 콘솔에
    await run(page, "print('안녕', 1 + 2)", 'ok');
    await expect(consoleBox(page)).toContainText('안녕 3');
    await expect(page.locator('[data-lab-result]')).toHaveText('실행이 끝났어요.');
    expect((await board.executed()).at(-1)).toEqual({ via: 'raw-paste', code: "print('안녕', 1 + 2)" });
    expect(await board.softResets()).toBe(1);
    expect(await board.flowControlOverrun()).toBe(0);

    // 오류: 결과 줄과 풀이 카드, 트레이스백은 콘솔에 한 번
    await run(page, "print('before')\nx = 1/0", 'error');
    await expect(page.locator('[data-lab-result]')).toHaveText('오류로 끝났어요: ZeroDivisionError: divide by zero');
    const consoleText = (await consoleBox(page).textContent()) ?? '';
    expect(consoleText).toContain('before');
    expect(consoleText.split('ZeroDivisionError: divide by zero').length - 1).toBeGreaterThanOrEqual(1);
    await expect(page.locator('[data-lab-module-panel="errors"]')).toBeVisible();
    await expect(page.locator('[data-lab-module-panel="errors"]')).toContainText('ZeroDivisionError');
    // 보드 트레이스백의 "<stdin>" 줄을 학생 코드 줄로 읽는다
    await expect(page.locator('[data-errors-where-text]')).toHaveText('내 코드 2번째 줄');
    await expect(page.locator('[data-lab-message]')).toContainText('2번째 줄');

    // [정지]: 도는 코드에 Ctrl-C, 실행 중에는 탭을 바꾸지 않는다
    await setEditorCode(page, "import time\nwhile True:\n    print('tick')\n    time.sleep(0.2)");
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await expect(consoleBox(page)).toContainText('tick', { timeout: BOARD_TIMEOUT });
    await expect(realPanel(page)).toHaveAttribute('data-real-board-state', 'running');
    await virtualTab.click();
    await expect(realTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-lab-message]')).toHaveText('실행 중에는 실행할 곳을 바꿀 수 없어요. [정지]한 뒤에 바꿔요.');
    const writtenBeforeStop = (await board.writtenText()).length;
    await page.getByRole('button', { name: '정지', exact: true }).click();
    await expect(labRoot(page)).toHaveAttribute('data-outcome', 'stopped', { timeout: BOARD_TIMEOUT });
    await expect(page.locator('[data-lab-result]')).toHaveText('[정지]를 눌러 멈췄어요(KeyboardInterrupt).');
    expect((await board.writtenText()).slice(writtenBeforeStop)).toMatch(/^\x03+$/u);
    await expect(realPanel(page)).toHaveAttribute('data-real-board-state', 'ready');

    // [가상 보드]로 돌아가면 실행 대상이 빠지고 가상 보드 칸이 보인다(연결은 그대로)
    await virtualTab.click();
    await expect.poll(async () => (await labRoot(page).getAttribute('data-run-target')) ?? '').toBe('');
    await expect(page.locator('[data-board-io]')).toBeVisible();
    await expect(realPanel(page)).toBeHidden();
    await expect(realPanel(page)).toHaveAttribute('data-real-board-state', 'ready');
    expect(errors).toEqual([]);
  });

  test('대답 없는 보드 → 펌웨어 굽기 안내, 선택 창을 닫으면 포트 고르기 안내', async ({ page, isMobile }) => {
    test.skip(isMobile, '데스크톱에서 본다.');
    const errors = await openLab(page, { ports: [{ id: 'board', device: 'silent' }] });
    await chooseRealTab(page);

    // 선택 창을 닫음
    await serialMock(page).chooseNext(null);
    await realPanel(page).getByRole('button', { name: '보드 연결' }).click();
    await expect(realPanel(page)).toHaveAttribute('data-real-board-problem', 'not-selected');
    await expect(realPanel(page).locator('[data-real-board-title]')).toHaveText('포트를 고르지 않았어요');
    await expect(realPanel(page).locator('[data-real-board-port-help]')).toHaveAttribute('open', '');

    // 대답 없는 보드
    await connect(page, 'no-micropython');
    await expect(realPanel(page)).toHaveAttribute('data-real-board-verdict', 'silent');
    await expect(realPanel(page).locator('[data-real-board-title]')).toHaveText('보드가 대답하지 않아요');
    const guide = realPanel(page).locator('[data-real-board-guide]');
    await expect(guide).toBeVisible();
    await expect(guide.getByRole('link', { name: '펌웨어 굽기 안내(보드 준비 페이지)' })).toHaveAttribute('href', withBase('start/board/#firmware'));
    await expect(realPanel(page).getByRole('button', { name: '다시 확인' })).toBeVisible();
    await expect(realPanel(page).getByRole('button', { name: '보드 다시 시작' })).toBeVisible();

    // 이 상태에서 [실행]: 다시 확인한 뒤 MicroPython이 없다고 알린다
    await run(page, "print('x')", 'error');
    await expect(page.locator('[data-lab-result]')).toHaveText('오류로 끝났어요: 보드에서 MicroPython을 찾지 못했어요.');
    await expect(consoleBox(page)).toContainText('펌웨어를 구운 뒤 [다시 확인]');
    expect(errors).toEqual([]);
  });

  test('선을 뽑으면 끊김 안내, 다시 꽂고 [다시 연결]은 선택 창 없이 같은 보드', async ({ page, isMobile }) => {
    test.skip(isMobile, '데스크톱에서 본다.');
    const errors = await openLab(page, { ports: [{ id: 'board' }] });
    await chooseRealTab(page);
    // 키보드만으로 연결: Enter도 사용자 조작이라 선택 창이 열리고, 누른 단추가 사라지면 초점이 상태 글로 옮겨 간다
    await realPanel(page).getByRole('button', { name: '보드 연결' }).focus();
    await page.keyboard.press('Enter');
    await expect(realPanel(page)).toHaveAttribute('data-real-board-state', 'ready', { timeout: BOARD_TIMEOUT });
    await expect(realPanel(page).locator('[data-real-board-status]')).toBeFocused();
    const board = serialMock(page);
    await board.unplug();
    await expect(realPanel(page)).toHaveAttribute('data-real-board-state', 'lost');
    await expect(realPanel(page).locator('[data-real-board-title]')).toHaveText('보드 연결이 끊겼어요');
    // 강조 단추([다시 연결])가 단추 줄 맨 앞
    await expect(realPanel(page).locator('[data-real-board-actions] > button:not([hidden])').first()).toHaveText('다시 연결');
    await board.plug();
    await expect(realPanel(page).locator('[data-real-board-detail]')).toHaveText('보드가 다시 꽂혔어요. [다시 연결]을 눌러요.');
    await realPanel(page).getByRole('button', { name: '다시 연결' }).click();
    await expect(realPanel(page)).toHaveAttribute('data-real-board-state', 'ready', { timeout: BOARD_TIMEOUT });
    expect(await board.requests()).toHaveLength(1);
    await run(page, "print('again')", 'ok');
    await expect(consoleBox(page)).toContainText('again');

    // [연결 끊기]: 포트를 닫고 보드는 보통 REPL로
    await realPanel(page).getByRole('button', { name: '연결 끊기' }).click();
    await expect(realPanel(page)).toHaveAttribute('data-real-board-state', 'idle', { timeout: BOARD_TIMEOUT });
    expect(await board.isOpen()).toBe(false);
    expect(await board.mode()).toBe('friendly');
    expect(errors).toEqual([]);
  });

  test('연결 전에 [실행]: 선택 창 → 연결 → 곧바로 실행', async ({ page, isMobile }) => {
    test.skip(isMobile, '데스크톱에서 본다.');
    const errors = await openLab(page, { ports: [{ id: 'board', usb: 'cp2102' }] });
    await chooseRealTab(page);
    await run(page, "for i in range(3):\n    print('줄', i)", 'ok');
    await expect(consoleBox(page)).toContainText('실제 보드가 아직 연결되지 않아 포트 선택 창을 열어요');
    await expect(consoleBox(page)).toContainText('줄 2');
    await expect(realPanel(page)).toHaveAttribute('data-real-board-state', 'ready');
    await expect(realPanel(page)).toHaveAttribute('data-real-board-chip', 'CP210x');
    expect(errors).toEqual([]);
  });

  test('Web Serial이 없는 브라우저: 안내만 보이고 [실행]은 [가상 보드] 안내로 끝난다', async ({ page, isMobile }) => {
    test.skip(isMobile, '데스크톱에서 본다.');
    await page.addInitScript(() => {
      try {
        delete (Navigator.prototype as unknown as { serial?: unknown }).serial;
      } catch {
        // 지울 수 없으면 아래에서 가린다
      }
      Object.defineProperty(navigator, 'serial', { configurable: true, value: undefined });
    });
    const errors = await openLab(page);
    await chooseRealTab(page);
    await expect(realPanel(page)).toHaveAttribute('data-real-board-state', 'unsupported');
    await expect(realPanel(page).locator('[data-real-board-title]')).toHaveText('이 브라우저에서는 실제 보드를 연결할 수 없어요');
    await expect(realPanel(page).getByRole('button', { name: '보드 연결' })).toBeHidden();
    await expect(realPanel(page).locator('[data-real-board-port-help]')).toBeHidden();
    await run(page, "print('x')", 'error');
    await expect(page.locator('[data-lab-result]')).toHaveText('오류로 끝났어요: 이 브라우저에서는 실제 보드를 연결할 수 없어요.');
    await expect(consoleBox(page)).toContainText('[가상 보드] 탭에서 같은 코드를 실행할 수 있어요');
    expect(errors).toEqual([]);
  });

  test('휴대폰 폭: 탭과 실제 보드 칸이 넘치지 않고 탭 높이 44px 이상', async ({ page, isMobile }) => {
    test.skip(!isMobile, '휴대폰 폭에서 본다.');
    const errors = await openLab(page, { ports: [{ id: 'board' }] });
    await chooseRealTab(page);
    await connect(page);
    for (const name of ['가상 보드', '실제 보드']) {
      const box = await page.getByRole('tab', { name }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const panelBox = await realPanel(page).boundingBox();
    expect((panelBox?.x ?? 0) + (panelBox?.width ?? 0)).toBeLessThanOrEqual(375);
    expect(errors).toEqual([]);
  });
});
