// 시나리오 F(손가락 개수 → LED 개수) 브라우저 테스트 — P4-08, 구역 scenario-f.
//
// 완료 기준(PLAN §8.4 P4-08): **손가락 개수에 따라 가상 네오픽셀 링의 켜진 개수가 바뀐다.**
// 그리고 **카메라 없이 합성 랜드마크 재생 입력(손가락 0~5개)만으로 통과해야 한다**(PD-30) — 웹캠이 없는 교실 PC에서도
// 실습이 끝나야 하기 때문이다. 아래 검사는 모두 재생 입력('replay' + 'count' 동작)만 쓴다.
//
//  1. 시나리오 F(가상): 두 탭 — ESP32 실습실이 보드 쪽 예제를, 영상처리 실습실이 컴퓨터 쪽 예제를 돌린다.
//     재생 입력의 손가락이 하나씩 펴지는 동안 링의 켜진 LED 수(data-visual-count)가 0에서 늘어난다.
//  2. 한 화면 모드: [보내기] 패널의 [한 화면에 가상 보드 열기]로 연 iframe에서도 같은 코드가 그대로 짝지어 돈다.
//  3. bridge 모듈 규칙: 값이 바뀔 때만 보낸다(§7.2 규칙 4·§7.5), 끝 문자 \n 한 개(§7.2 규칙 2), 보드 → 컴퓨터 receive().
//  4. 여러 손 고침: 손 두 개가 보이면 두 손의 손가락을 **더해서** 센다(교안 f136은 마지막 손만 셌다).
//  5. 받을 쪽 화면이 없으면 한국어 BridgeError로 알려 준다.
//
// 실행: PW_BASE_URL=http://localhost:4707/ai-physical-computing/ npx playwright test tests/e2e/scenario-f.spec.ts --project=desktop
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { labRoot, setEditorCode, waitDone } from './helpers/lab.ts';

const ROOT = process.cwd();
const VISION_PATH = withBase('labs/vision/');
const ESP32_PATH = withBase('labs/esp32/');

/** 짝을 이루는 두 예제(실습실 ?example=이 읽는 경로) */
const PC_FINGER_COUNT = 'vision/u4/c3-finger-count-send.py';
const BOARD_NEOPIXEL = 'esp32/u4/c3-neopixel-count-rx.py';

/** 두 화면이 같은 선을 쓰게 하는 접두어(PD-29의 무작위 12글자와 같은 모양 — l·1·o·O·0은 쓰지 않는다) */
const PREFIX_TWO_TABS = 'zangfinger21';
const PREFIX_FRAME = 'zangfinger22';
const PREFIX_RULES = 'zangfinger23';
const PREFIX_HANDS = 'zangfinger24';

/**
 * 실습실 두 곳을 한 검사에서 띄운다 — 개발 서버(Vite가 그때그때 옮김)에서는 첫 화면이 느려서 넉넉하게 본다.
 * 구역 A의 bridge-vision-board.spec.ts와 같은 까닭·같은 값이다(README 5.2).
 */
const READY_TIMEOUT = 180_000;
/** OpenCV·MediaPipe 꾸러미(20MB 넘음)까지 받아야 하는 검사 */
const PACKAGES_TIMEOUT = 240_000;

const example = (relativePath: string): string => fs.readFileSync(path.join(ROOT, 'examples', relativePath), 'utf8');

function bridgePanel(page: Page) {
  return page.locator('[data-bridge-panel]');
}

/** 네오픽셀 링 부품(보드 그림 안) */
function ring(page: Page) {
  return page.locator('[data-board-part="neopixel"]');
}

/** 지금 켜져 있는 LED 수 */
async function litCount(page: Page): Promise<number> {
  const value = await ring(page).getAttribute('data-visual-count');
  return Number(value ?? '0');
}

/** ESP32 실습실을 연다(보드 그림이 준비될 때까지) */
async function openBoardLab(page: Page, query: string): Promise<void> {
  const response = await page.goto(`${ESP32_PATH}${query}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
  await expect(page.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: READY_TIMEOUT });
}

/**
 * 영상처리 실습실을 연다. 손 인식을 쓰는 검사만 OpenCV·MediaPipe 꾸러미까지 기다린다 —
 * bridge 모듈만 쓰는 검사는 파이썬만 준비되면 된다(꾸러미를 매번 기다리면 검사가 두 배로 길어진다).
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

async function openSecondTab(context: BrowserContext, query: string): Promise<Page> {
  const page = await context.newPage();
  await openBoardLab(page, query);
  return page;
}

async function clickRun(page: Page): Promise<void> {
  await page.getByRole('button', { name: '실행', exact: true }).first().click();
}

async function stopRun(page: Page): Promise<void> {
  await page.getByRole('button', { name: '정지', exact: true }).first().click();
}

/** 카메라 없이 손을 만든다(PD-30) — 입력 소스를 재생 입력으로, 동작을 고른다. */
async function useReplay(page: Page, sequence: string): Promise<void> {
  await page.locator('[data-vision-source-select]').selectOption('replay');
  await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'replay');
  await page.locator('[data-mediapipe-sequence]').selectOption(sequence);
}

/** 두 화면이 서로를 알아볼 때까지 */
async function waitPeer(page: Page): Promise<void> {
  await expect(bridgePanel(page)).toHaveAttribute('data-bridge-peers', /[1-9]/u, { timeout: 60_000 });
}

/** 켜진 LED 수가 조건에 맞을 때까지 지켜본다(재생 입력은 1초마다 손가락을 하나씩 편다). */
async function waitLit(page: Page, matches: (count: number) => boolean, what: string, timeout = 90_000): Promise<number> {
  const until = Date.now() + timeout;
  let seen = await litCount(page);
  while (!matches(seen)) {
    expect(Date.now(), `${what}: 마지막으로 본 켜진 LED 수 ${seen}개`).toBeLessThan(until);
    await page.waitForTimeout(250);
    seen = await litCount(page);
  }
  return seen;
}

/** 콘솔에 남은 `Sent: …` 줄의 값만 차례대로 */
async function sentValues(page: Page): Promise<string[]> {
  const text = (await page.locator('[data-lab-console]').textContent()) ?? '';
  return text
    .split('\n')
    .map((line) => /Sent:\s*(.*)$/u.exec(line.trim())?.[1]?.trim())
    .filter((value): value is string => value !== undefined && value !== '');
}

test.describe('시나리오 F — 손가락 개수만큼 네오픽셀 켜기(P4-08)', () => {
  test.describe.configure({ timeout: 600_000 });
  test.skip(({ isMobile }) => Boolean(isMobile), '두 화면을 나란히 쓰는 실습이라 데스크톱에서만 본다(워커·JSPI도 데스크톱에서 확인).');

  // 개발 서버(PW_BASE_URL)로 돌릴 때만: 다른 구역이 파일을 저장하면 Vite HMR이 페이지를 통째로 새로 고쳐
  // 실행 중인 코드와 고른 입력이 사라진다. HMR 웹소켓을 잇지 않아 새로 고침을 막는다(빌드한 사이트·CI에는 없다).
  test.beforeEach(async ({ page }) => {
    if (process.env.PW_BASE_URL) {
      await page.routeWebSocket(/\?token=|vite-hmr/u, () => {
        // 연결하지 않고 버린다(Vite 클라이언트는 다시 붙기를 기다리기만 한다).
      });
    }
  });

  test('두 탭: 재생 입력의 손가락이 펴지는 만큼 가상 링의 켜진 LED가 늘어난다(카메라 없음)', async ({ page, context }) => {
    const board = await openSecondTab(context, `?example=${encodeURIComponent(BOARD_NEOPIXEL)}&bridge=${PREFIX_TWO_TABS}`);
    if (process.env.PW_BASE_URL) {
      await board.routeWebSocket(/\?token=|vite-hmr/u, () => {});
    }

    // ① 보드 쪽을 먼저 돌린다(보드가 꺼져 있을 때 온 글자는 실물처럼 사라진다).
    await expect(board.locator('[data-board-practice]')).toContainText('USB-UART 변환기 조작');
    await clickRun(board);
    await expect(board.locator('[data-lab-console]')).toContainText('기다리는 중', { timeout: 60_000 });
    await expect(ring(board)).toHaveAttribute('data-visual-count', '0');

    // ② 컴퓨터 쪽 — 카메라 없이 재생 입력(손가락 0~5개)으로 손을 만든다.
    await openVision(page, `?example=${encodeURIComponent(PC_FINGER_COUNT)}&bridge=${PREFIX_TWO_TABS}`, { packages: true });
    await waitPeer(page);
    await useReplay(page, 'count');
    await clickRun(page);

    // ③ 손가락이 하나씩 펴지면서 켜진 LED가 늘어난다(재생 동작은 1초마다 한 개씩, 6초에 0~5개).
    const grew = await waitLit(page, (count) => count >= 3, '손가락 3개 이상');
    console.log(`[시나리오 F] 켜진 네오픽셀 ${grew}개`);
    test.info().annotations.push({ type: 'scenario-f-lit', description: String(grew) });
    expect(grew).toBeGreaterThanOrEqual(3);
    expect(grew).toBeLessThanOrEqual(5);

    // ④ 보드 콘솔에도 개수가 글로 남는다(색만으로 알리지 않는다).
    await expect(board.locator('[data-lab-console]')).toContainText(`손가락 ${grew} 개`, { timeout: 30_000 });

    // ⑤ 주먹으로 돌아오면(되풀이) 다시 0개가 된다 — 끝과 처음이 이어지는 재생 동작이라 곧 0이 온다.
    await waitLit(page, (count) => count === 0, '다시 주먹(0개)', 60_000);

    // ⑥ 값이 바뀔 때만 보낸다(§7.2 규칙 4) — 1초에 15장을 보면서도 같은 값을 잇달아 보내지 않는다.
    const sent = await sentValues(page);
    console.log(`[시나리오 F] 보낸 값 ${sent.length}개: ${sent.join(' ')}`);
    expect(sent.length).toBeGreaterThan(2);
    expect(sent.filter((value, index) => index > 0 && value === sent[index - 1]), '같은 값을 잇달아 보냈어요').toEqual([]);

    await stopRun(page);
    expect(await waitDone(page, 30_000)).toBe('stopped');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
    await board.close();
  });

  test('한 화면 모드: [한 화면에 가상 보드 열기]로 연 iframe에서도 같은 코드가 짝지어 돈다', async ({ page }) => {
    await openVision(page, `?example=${encodeURIComponent(PC_FINGER_COUNT)}&bridge=${PREFIX_FRAME}`, { packages: true });
    const panel = bridgePanel(page);
    await expect(panel).toBeVisible();

    // 짝 예제를 고르고 한 화면에 연다(패널의 예제 목록에 없으면 직접 값을 넣는다 — 구역 A의 BOARD_EXAMPLES는 공유 파일이다).
    const select = panel.locator('[data-bridge-board-example]');
    const hasPair = (await select.locator(`option[value="${BOARD_NEOPIXEL}"]`).count()) > 0;
    if (hasPair) {
      await select.selectOption(BOARD_NEOPIXEL);
    }
    await panel.locator('[data-bridge-open-frame]').click();
    await expect(labRoot(page)).toHaveAttribute('data-bridge-frame', 'on');

    const frame = page.frameLocator('[data-bridge-frame-view]');
    await expect(frame.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: READY_TIMEOUT });
    if (!hasPair) {
      // 목록에 짝이 없으면 iframe 안 실습실에서 예제를 골라 불러온다(학생이 목록에서 고르는 것과 같은 길).
      await frame.locator('[data-lab-example-select]').selectOption('u4-c3-neopixel-count-rx');
      await frame.locator('[data-lab-example-load]').click();
    }
    await frame.getByRole('button', { name: '실행', exact: true }).first().click();
    await expect(frame.locator('[data-lab-console]')).toContainText('기다리는 중', { timeout: 60_000 });

    await waitPeer(page);
    await useReplay(page, 'count');
    await clickRun(page);

    await expect
      .poll(async () => Number((await frame.locator('[data-board-part="neopixel"]').getAttribute('data-visual-count')) ?? '0'), { timeout: 90_000, intervals: [250] })
      .toBeGreaterThanOrEqual(3);

    await stopRun(page);
    expect(await waitDone(page, 30_000)).toBe('stopped');
  });

  test('bridge 모듈: 값이 바뀔 때만 보내고 끝 문자는 \\n 한 개, 보드가 보낸 줄은 receive()로 온다', async ({ page, context }) => {
    const board = await openSecondTab(context, `?bridge=${PREFIX_RULES}`);
    if (process.env.PW_BASE_URL) {
      await board.routeWebSocket(/\?token=|vite-hmr/u, () => {});
    }
    // 보드 쪽: 온 바이트를 그대로 글로 찍고, 한 줄을 돌려보낸다(배선은 머리말로 알린다).
    await setEditorCode(
      board,
      [
        '# @part uart rx=17 tx=16',
        'from machine import UART',
        'from time import sleep',
        'uart = UART(2, baudrate=9600, tx=17, rx=16, timeout=200)',
        'seen = []',
        'for _ in range(200):',
        '    line = uart.readline()',
        '    if line:',
        '        seen.append(line)',
        '        print("받음", line)',
        '        uart.write(b"OK-" + line)',
        '    sleep(0.05)',
        'print("모두", seen)',
      ].join('\n'),
    );
    await clickRun(board);
    await expect(board.locator('[data-board-io]')).toHaveAttribute('data-board-phase', /^(run|idle)$/u, { timeout: 60_000 });

    await openVision(page, `?bridge=${PREFIX_RULES}`);
    await waitPeer(page);
    await setEditorCode(
      page,
      [
        'import bridge',
        'from time import sleep',
        'print("첫 보내기", bridge.send("3"))',
        'print("같은 값", bridge.send("3"))',
        'print("바뀐 값", bridge.send("4"))',
        'print("마지막", bridge.last_sent())',
        'for _ in range(40):',
        '    line = bridge.receive()',
        '    if line is not None:',
        '        print("보드에서", line)',
        '    sleep(0.1)',
      ].join('\n'),
    );
    await clickRun(page);
    expect(await waitDone(page, 90_000)).toBe('ok');

    const console_ = page.locator('[data-lab-console]');
    await expect(console_).toContainText('첫 보내기 True');
    await expect(console_).toContainText('같은 값 False'); // §7.2 규칙 4 — 값이 바뀔 때만
    await expect(console_).toContainText('바뀐 값 True');
    await expect(console_).toContainText('마지막 4');
    // 끝 문자는 \n 한 개(§7.2 규칙 2) — 보드가 읽은 바이트 그대로 보인다.
    await expect(board.locator('[data-lab-console]')).toContainText("받음 b'3\\n'", { timeout: 30_000 });
    await expect(board.locator('[data-lab-console]')).toContainText("받음 b'4\\n'", { timeout: 30_000 });
    // 보드 → 컴퓨터(receive())
    await expect(console_).toContainText('보드에서 OK-3');

    await board.close();
  });

  test('여러 손 고침: 손이 두 개면 두 손의 손가락을 더해서 센다(교안 f136은 마지막 손만 셌다)', async ({ page }) => {
    await openVision(page, `?example=${encodeURIComponent(PC_FINGER_COUNT)}&bridge=${PREFIX_HANDS}`, { packages: true });
    await useReplay(page, 'two-hands');

    // 예제의 세는 함수만 그대로 떼어 내, 두 손 좌표에 쓰면 손마다 따로 세는지 본다(통신 없이 계산만 확인).
    const source = example(PC_FINGER_COUNT);
    const helper = source.slice(source.indexOf('COMPARE = ['), source.indexOf('cap = cv2.VideoCapture(0)'));
    await setEditorCode(
      page,
      [
        'import cv2',
        'import mediapipe as mp',
        helper.trimEnd(),
        'hands = mp.solutions.hands.Hands(max_num_hands=2)',
        'cap = cv2.VideoCapture(0)',
        'seen = 0',
        'for _ in range(40):',
        '    ret, frame = cap.read()',
        '    result = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))',
        '    if result.multi_hand_landmarks and len(result.multi_hand_landmarks) == 2:',
        '        counts = [count_fingers(h.landmark) for h in result.multi_hand_landmarks]',
        '        print("손마다", counts, "합", sum(counts))',
        '        seen = sum(counts)',
        '        break',
        'cap.release()',
        'print("두 손 합계", seen)',
      ].join('\n'),
    );
    await clickRun(page);
    expect(await waitDone(page, 120_000)).toBe('ok');
    // 두 손 모두 편 손이라 5 + 5 = 10이다(한 손만 세던 교안 코드는 5에서 멈춘다).
    await expect(page.locator('[data-lab-console]')).toContainText('두 손 합계 10');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
  });

  test('받을 쪽 화면이 없으면 한국어로 무엇을 눌러야 하는지 알려 준다', async ({ page }) => {
    await openVision(page, '');
    await setEditorCode(page, ['import bridge', 'bridge.send("3")'].join('\n'));
    await clickRun(page);
    expect(await waitDone(page, 90_000)).toBe('error');
    const console_ = page.locator('[data-lab-console]');
    await expect(console_).toContainText('BridgeError');
    await expect(console_).toContainText('ESP32 실습실 탭을 찾지 못했어요');
    await expect(console_).toContainText('[보내기] 패널');
  });
});
