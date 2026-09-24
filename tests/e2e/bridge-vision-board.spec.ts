// 영상처리 실습실 ↔ 가상 보드 시리얼 선(P4-02, PLAN §8.4 설계 메모) 브라우저 테스트 — 구역 A.
//
// 완료 기준: **원본 f084·f085(컴퓨터 쪽)와 f082(보드 쪽)를 한 글자도 고치지 않고 짝지어 돌린다.**
//  1. 두 탭: ESP32 실습실 탭에서 f082를 돌리고, 영상처리 실습실 탭에서 f084를 돌려 a를 보내면 레이저 핀(GPIO18)이 1이 된다.
//     그 뒤 원본 f082의 결함(import time만 하고 sleep(1)을 부름) 그대로 NameError로 멈춘다 — 실물 보드와 같다(사이드카에 적어 둔 결과).
//  2. 한 화면 모드: [보내기] 패널의 [한 화면에 가상 보드 열기]로 같은 탭 안 iframe에 ESP32 실습실을 띄워도 똑같이 된다.
//  3. 속도 불일치: 컴퓨터가 9600, 보드가 115200이면 실물처럼 글자가 깨져 레이저가 켜지지 않는다(가상 UART의 reframe).
//  4. 보드 → 컴퓨터: 보드가 uart.write()로 보낸 글자가 컴퓨터 코드의 readline()으로 온다.
//
// 실행: PW_BASE_URL=http://localhost:4701/ai-physical-computing/ npx playwright test tests/e2e/bridge-vision-board.spec.ts --project=desktop --output=<저장소 밖>
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { labRoot, setEditorCode, waitDone } from './helpers/lab.ts';

const ROOT = process.cwd();
const VISION_PATH = withBase('labs/vision/');
const ESP32_PATH = withBase('labs/esp32/');
/** 원본 예제 파일(실습실 ?example=이 읽는 경로) */
const PC_KEY_SEND = 'vision/u3/3-1-2-uart-key-send.py';
const BOARD_LASER = 'esp32/u3/3-1-2-uart-laser.py';
/** 원본에서 두 줄(2·5번)만 고친 사이트판(2026-09-24 통합, PROGRESS 미해결 75 규칙) */
const BOARD_LASER_SITE = 'esp32/u3/3-1-2-uart-laser-site.py';
/** 두 화면이 같은 선을 쓰게 하는 접두어(PD-29 — 무작위 12글자와 같은 모양: l·1·o·O·0은 쓰지 않는다) */
const PREFIX = 'zaneabridge3';
const PREFIX_SITE = 'zaneabridge7';
/** 검사마다 선을 나눠 쓰는 접두어(같은 브라우저 문맥 안에서 서로 간섭하지 않게) */
const PREFIX_SPEED = 'zaneabridge4';
const PREFIX_BACK = 'zaneabridge5';
const PREFIX_FACE = 'zaneabridge6';

/**
 * 실습실 두 곳을 한 검사에서 띄운다 — 개발 서버(Vite가 그때그때 옮김)에서는 첫 화면이 느려서 넉넉하게 본다(README 5.2).
 * 공용 도우미 waitVisionReady의 90초(helpers/lab.ts LOAD_TIMEOUT)로는 병렬 제작 중(개발 서버 여섯 개)에 모자라서
 * 이 파일은 같은 것을 확인하되 시간만 길게 본다.
 */
const READY_TIMEOUT = 180_000;
/** OpenCV·MediaPipe 꾸러미까지 받아야 하는 검사(f085)만 쓰는 시간 */
const PACKAGES_TIMEOUT = 180_000;

const example = (relativePath: string): string => fs.readFileSync(path.join(ROOT, 'examples', relativePath), 'utf8');

function bridgePanel(page: Page) {
  return page.locator('[data-bridge-panel]');
}

function pinRow(page: Page, gpio: number) {
  return page.locator(`[data-board-pin="${gpio}"]`);
}

/** ESP32 실습실을 연다(보드 그림이 준비될 때까지) */
async function openBoardLab(page: Page, query: string): Promise<void> {
  const response = await page.goto(`${ESP32_PATH}${query}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
  await expect(page.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: READY_TIMEOUT });
}

/**
 * 영상처리 실습실을 연다. 시리얼만 쓰는 검사는 파이썬만 준비되면 되고(packages: false),
 * 카메라·mediapipe를 쓰는 검사(f085)만 OpenCV 꾸러미까지 기다린다 — 꾸러미는 20MB가 넘어 매번 기다리면 검사가 두 배로 길어진다.
 */
async function openVision(page: Page, query: string, options: { packages?: boolean } = {}): Promise<void> {
  const response = await page.goto(`${VISION_PATH}${query}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
  if (options.packages === true) {
    await expect(labRoot(page)).toHaveAttribute('data-vision-packages', 'ready', { timeout: PACKAGES_TIMEOUT });
    await expect(page.locator('[data-vision-stages]')).toHaveAttribute('data-state', 'done');
  }
}

async function clickRun(page: Page): Promise<void> {
  await page.getByRole('button', { name: '실행', exact: true }).first().click();
}

async function stopRun(page: Page): Promise<void> {
  await page.getByRole('button', { name: '정지', exact: true }).first().click();
}

/** 실행 중인 코드의 input() 입력줄에 한 줄을 넣는다 */
async function typeInput(page: Page, text: string): Promise<void> {
  const form = page.locator('[data-lab-input-form]');
  await expect(form).toBeVisible({ timeout: 60_000 });
  await page.locator('[data-lab-input]').fill(text);
  await page.keyboard.press('Enter');
}

/** 두 화면이 서로를 알아볼 때까지 */
async function waitPeer(page: Page): Promise<void> {
  await expect(bridgePanel(page)).toHaveAttribute('data-bridge-peers', /[1-9]/u, { timeout: 30_000 });
}

test.describe('영상처리 ↔ 가상 보드 시리얼 선(P4-02)', () => {
  test.describe.configure({ timeout: 600_000 });
  test.skip(({ isMobile }) => Boolean(isMobile), '두 화면을 나란히 쓰는 실습이라 데스크톱에서만 본다(휴대폰은 한 화면 모드 안내만).');

  test('두 탭: 원본 f084가 보낸 a가 원본 f082의 레이저를 켜고, 원본 결함 그대로 NameError로 멈춘다', async ({ page, context }) => {
    const board = await openSecondTab(context, `?example=${encodeURIComponent(BOARD_LASER)}&bridge=${PREFIX}`);

    // ① 보드 쪽 원본 예제를 먼저 돌린다(보드가 꺼져 있을 때 온 글자는 실물처럼 사라진다).
    await clickRun(board);
    await expect(board.locator('[data-board-io]')).toHaveAttribute('data-board-phase', /^(run|idle)$/u, { timeout: 60_000 });
    await expect(bridgePanel(board)).toHaveAttribute('data-bridge-state', 'open', { timeout: 30_000 });

    // ② 컴퓨터 쪽 원본 예제(f084)
    await openVision(page, `?example=${encodeURIComponent(PC_KEY_SEND)}&bridge=${PREFIX}`);
    await waitPeer(page);
    // 예제가 그대로 들어와 있다(사이트가 코드를 고치지 않는다 — PD-10)
    await expect(bridgePanel(page)).toBeVisible();
    await clickRun(page);

    // ③ 입력줄에 a를 적으면 보드 레이저(GPIO18)가 켜진다
    await typeInput(page, 'a');
    await expect(pinRow(board, 18)).toHaveAttribute('data-level', '1', { timeout: 60_000 });
    await expect(page.locator('[data-lab-console]')).toContainText('a 문자를 시리얼로 전송했습니다.', { timeout: 15_000 });
    await expect(page.locator('[data-lab-console]')).toContainText('Sent: a');

    // ④ 원본 f082의 결함(import time만 하고 sleep(1)) 그대로 보드가 NameError로 멈춘다 — 실물 보드와 같다
    expect(await waitDone(board, 30_000)).toBe('error');
    await expect(board.locator('[data-lab-console]')).toContainText('NameError');

    // ⑤ 컴퓨터 쪽은 계속 돌고 있다 → q로 끝낸다(원본이 print로 알린다)
    await typeInput(page, 'q');
    expect(await waitDone(page, 30_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).toContainText('프로그램을 종료합니다.');
    await board.close();
  });

  test('사이트판(3-1-2-uart-laser-site.py): 원본과 줄 수가 같고, a·b·a를 받아도 멈추지 않고 레이저를 켜고 끈다', async ({ page, context }) => {
    // 사이트판 규칙(PROGRESS 미해결 75): 머리말 없음 · 원본과 줄 수 같음 · 고친 줄 끝에 # [사이트판] — 이관 목록 밖이라 이 검사가 지킨다.
    const original = example(BOARD_LASER).replace(/\r\n/gu, '\n').split('\n');
    const site = example(BOARD_LASER_SITE).split('\n');
    expect(site.length).toBe(original.length);
    const changed = site.map((line, index) => (line.trimEnd() === original[index]?.trimEnd() ? -1 : index + 1)).filter((line) => line > 0);
    expect(changed).toEqual([2, 5]);
    for (const line of changed) {
      expect(site[line - 1]).toContain('# [사이트판]');
    }

    // [보내기] 패널의 보드 예제 기본값이 사이트판이다(PLAN §7.5 보기 2 — 원본은 목록에 "12번 줄에서 NameError"로 남는다)
    await openVision(page, `?example=${encodeURIComponent(PC_KEY_SEND)}&bridge=${PREFIX_SITE}`);
    await expect(page.locator('[data-bridge-board-example]')).toHaveValue(BOARD_LASER_SITE);

    const board = await openSecondTab(context, `?example=${encodeURIComponent(BOARD_LASER_SITE)}&bridge=${PREFIX_SITE}`);
    // 사이드카 배선(원고 그림: 변환기 TX → GPIO16)대로 변환기와 레이저가 그려지고, 배선 오류가 없다
    await expect(board.locator('[data-board-part][data-part="uart"]')).toHaveCount(1, { timeout: 30_000 });
    await expect(board.locator('[data-board-problems] li[data-code][data-level="error"]')).toHaveCount(0);
    await clickRun(board);
    await expect(board.locator('[data-board-io]')).toHaveAttribute('data-board-phase', /^(run|idle)$/u, { timeout: 60_000 });

    await waitPeer(page);
    await clickRun(page);
    await typeInput(page, 'a');
    await expect(pinRow(board, 18)).toHaveAttribute('data-level', '1', { timeout: 60_000 });
    await typeInput(page, 'b');
    await expect(pinRow(board, 18)).toHaveAttribute('data-level', '0', { timeout: 60_000 });
    await typeInput(page, 'a');
    await expect(pinRow(board, 18)).toHaveAttribute('data-level', '1', { timeout: 60_000 });
    // 원본과 달리 NameError 없이 계속 돈다
    await expect(labRoot(board)).toHaveAttribute('data-state', 'running');
    await expect(board.locator('[data-lab-console]')).not.toContainText('NameError');

    await typeInput(page, 'q');
    expect(await waitDone(page, 30_000)).toBe('ok');
    await stopRun(board);
    expect(await waitDone(board, 30_000)).toBe('stopped');
    await board.close();
  });

  test('한 화면 모드: [한 화면에 가상 보드 열기]로 연 iframe에서도 같은 코드가 짝지어 돈다', async ({ page }) => {
    await openVision(page, `?example=${encodeURIComponent(PC_KEY_SEND)}`);
    const panel = bridgePanel(page);
    await expect(panel).toBeVisible();

    await page.locator('[data-bridge-board-example]').selectOption(BOARD_LASER);
    await page.getByRole('button', { name: '한 화면에 가상 보드 열기' }).click();
    await expect(labRoot(page)).toHaveAttribute('data-bridge-frame', 'on');

    const frame = page.frameLocator('[data-bridge-frame-view]');
    // iframe 안은 ?embed=1이라 머리글·바닥글이 없다(P2-14와 같은 규칙)
    await expect(frame.locator('[data-lab]')).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
    await expect(frame.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: READY_TIMEOUT });
    await frame.getByRole('button', { name: '실행', exact: true }).first().click();
    await expect(frame.locator('[data-board-io]')).toHaveAttribute('data-board-phase', /^(run|idle)$/u, { timeout: 60_000 });
    await waitPeer(page);

    await clickRun(page);
    await typeInput(page, 'a');
    await expect(frame.locator('[data-board-pin="18"]')).toHaveAttribute('data-level', '1', { timeout: 60_000 });

    await stopRun(page);
    expect(await waitDone(page, 30_000)).toBe('stopped');
  });

  test('속도가 다르면 실물처럼 글자가 깨져 레이저가 켜지지 않는다(속도 불일치 실습)', async ({ page, context }) => {
    const board = await openSecondTab(context, `?example=${encodeURIComponent(BOARD_LASER)}&bridge=${PREFIX_SPEED}`);
    await clickRun(board);
    await expect(board.locator('[data-board-io]')).toHaveAttribute('data-board-phase', /^(run|idle)$/u, { timeout: 60_000 });

    await openVision(page, `?bridge=${PREFIX_SPEED}`);
    await waitPeer(page);
    // 보드는 115200bps인데 컴퓨터가 9600bps로 열었다(원본과 같은 사용법, 속도만 다름)
    await setEditorCode(page, ['import serial', '', "uart = serial.Serial('COM10', 9600)", "uart.write(b'a')", 'print("보냈어요")'].join('\n'));
    await clickRun(page);
    expect(await waitDone(page, 60_000)).toBe('ok');

    // 보드에 바이트는 닿지만(변환기 RX 표시가 늘어난다) 글자가 깨져 'a'가 아니라서 레이저는 꺼진 채다
    await expect(bridgePanel(page)).toHaveAttribute('data-bridge-sent', /[1-9]/u);
    await page.waitForTimeout(1500);
    await expect(pinRow(board, 18)).toHaveAttribute('data-level', '0');
    await stopRun(board);
    await board.close();
  });

  test('보드 → 컴퓨터: 보드가 보낸 글자가 컴퓨터 코드의 readline()으로 온다', async ({ page, context }) => {
    const board = await openSecondTab(context, `?bridge=${PREFIX_BACK}`);
    await setEditorCode(
      board,
      [
        // 배선은 예제마다 정해진다(README 7.4). 예제를 고르지 않고 코드만 넣을 때는 머리말 # @part로 알린다 —
        // 변환기 rx(받는 핀) = 보드 TX 17, 변환기 tx(보내는 핀) = 보드 RX 16(원고 배선 그림·INVENTORY §4.4와 같은 교차 결선).
        '# 보드 → 컴퓨터 시리얼 보내기',
        '# @part uart rx=17 tx=16',
        'from machine import UART',
        'import time',
        '',
        'uart = UART(2, baudrate=115200, tx=17, rx=16)',
        'for _ in range(60):',
        "    uart.write(b'hello\\n')",
        '    time.sleep(0.5)',
      ].join('\n'),
    );
    // 머리말대로 USB-UART 변환기가 그려졌는지 먼저 본다(배선이 없으면 보낸 바이트가 어디에도 닿지 않는다).
    await expect(board.locator('[data-board-part][data-part="uart"]')).toHaveCount(1, { timeout: 30_000 });

    // 컴퓨터 쪽을 **먼저** 띄운다 — 실물과 같게, 포트를 연 뒤에 온 바이트만 받는다(보드가 먼저 다 보내 버리면 놓친다).
    await openVision(page, `?bridge=${PREFIX_BACK}`);
    await waitPeer(page);
    await setEditorCode(
      page,
      [
        'import serial',
        '',
        "uart = serial.Serial('COM10', 115200, timeout=8)",
        'line = uart.readline()',
        'print("받은 줄:", line)',
        'uart.close()',
      ].join('\n'),
    );
    await clickRun(board);
    await expect(board.locator('[data-board-io]')).toHaveAttribute('data-board-phase', /^(run|idle)$/u, { timeout: 60_000 });
    await clickRun(page);
    expect(await waitDone(page, 60_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).toContainText("받은 줄: b'hello");
    await stopRun(board);
    await board.close();
  });

  test('원본 f085(얼굴 → a·b)도 고치지 않고 열려 시리얼 포트를 연다', async ({ page, context }) => {
    const board = await openSecondTab(context, `?example=${encodeURIComponent(BOARD_LASER)}&bridge=${PREFIX_FACE}`);
    await clickRun(board);
    await expect(board.locator('[data-board-io]')).toHaveAttribute('data-board-phase', /^(run|idle)$/u, { timeout: 60_000 });

    await openVision(page, `?example=${encodeURIComponent('vision/u3/3-1-2-adv-face-uart.py')}&bridge=${PREFIX_FACE}`, { packages: true });
    await waitPeer(page);
    // 카메라가 없어도 되는 재생 입력(PD-30)으로 얼굴을 만든다
    await page.locator('[data-vision-source-select]').selectOption('replay');
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'replay');
    await clickRun(page);

    // 얼굴이 보이면 원본이 a를 보낸다 → 보드 레이저가 켜진다(그 뒤 원본 f082의 결함으로 NameError)
    await expect(page.locator('[data-lab-console]')).toContainText('Face detected', { timeout: PACKAGES_TIMEOUT });
    await expect(pinRow(board, 18)).toHaveAttribute('data-level', '1', { timeout: 60_000 });
    expect(example('vision/u3/3-1-2-adv-face-uart.py')).toContain("uart.write(b'a')");

    await stopRun(page);
    await board.close();
  });
});

/** ESP32 실습실을 다른 탭(같은 브라우저·같은 출처)에 연다 — 같은 컴퓨터 탭 통로(PD-17)가 두 탭을 잇는다 */
async function openSecondTab(context: BrowserContext, query: string): Promise<Page> {
  const page = await context.newPage();
  await openBoardLab(page, query);
  return page;
}
