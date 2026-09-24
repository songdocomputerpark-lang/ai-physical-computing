// 시나리오 F(손가락 개수 → LED 개수) 브라우저 테스트 — P4-08, 구역 G(scenario-f).
//
// 완료 기준(PLAN §8.4 P4-08, §8.7 F): **손가락 개수에 따라 가상 네오픽셀 링의 켜진 개수가 바뀐다.**
// 그리고 **카메라 없이 합성 랜드마크 재생 입력(손가락 0~5개)만으로 통과해야 한다**(PD-30) — 웹캠이 없는 교실 PC에서도
// 실습이 끝나야 하기 때문이다. 손 인식을 쓰는 검사는 모두 재생 입력('replay' + 동작 'count'·'two-hands')만 쓴다.
//
//  1. 시나리오 F(가상): 두 탭 — ESP32 실습실이 보드 쪽 예제를, 영상처리 실습실이 컴퓨터 쪽 예제를 돌린다.
//     재생 입력의 손가락이 하나씩 펴지는 동안 링의 켜진 LED 수(data-visual-count)가 늘고, 주먹이 되면 0으로 돌아간다.
//  2. 한 화면 모드: [보내기] 패널의 [한 화면에 가상 보드 열기]로 연 iframe에서도 같은 코드가 그대로 짝지어 돈다.
//  3. bridge 모듈 규칙(§7.2·§7.6): 값이 바뀔 때만 보낸다, 끝 문자 \n 한 개, event는 같은 값도 보낸다, send_bytes는 그대로, 보드 → 컴퓨터 receive().
//  4. 여러 손 고침: 손 두 개가 보이면 두 손의 손가락을 **더해서** 센다(교안 계단 9 방식은 마지막 손만 센다).
//  5. 받을 쪽 화면이 없으면 BridgeNoPeer(오류 사전 comm-no-peer)로 무엇을 눌러야 하는지 한국어로 알린다.
//  6. 블루투스판 보드 예제(PLAN §7.5 예시 1 "ESP32BLE.read()"): 보드 아래 블루투스 칸에서 보낸 숫자만큼 켜진다.
//  7. ESP32 실습실(가상 보드)에서 import bridge는 실물 MicroPython처럼 ModuleNotFoundError + 한국어 안내.
//  8. (공유 파일 요청 1번이 반영된 뒤) import bridge만 쓴 예제도 [보내기] 패널이 저절로 열린다 — 반영 전에는 스스로 건너뛴다.
//
// 실행: PW_BASE_URL=http://localhost:4707/ai-physical-computing/ npx playwright test tests/e2e/scenario-f.spec.ts --project=desktop --output=<저장소 밖>
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { withBase } from '../../src/lib/url.ts';
import { ALLOWED_REMOTE_ORIGINS } from '../../src/lab/runtime/config.ts';
import { labRoot, setEditorCode, waitDone } from './helpers/lab.ts';
import { collectRequests } from './helpers/vision.ts';

const ROOT = process.cwd();
const VISION_PATH = withBase('labs/vision/');
const ESP32_PATH = withBase('labs/esp32/');

/** 짝을 이루는 두 예제(실습실 ?example=이 읽는 경로) */
const PC_FINGER_COUNT = 'vision/u4/c3-finger-count-send.py';
const BOARD_NEOPIXEL = 'esp32/u4/c3-neopixel-count-rx.py';
/** ESP32 실습실 예제 목록의 id(폴더-파일 이름) */
const BOARD_NEOPIXEL_ID = 'u4-c3-neopixel-count-rx';
/** 선 없는 판(블루투스로 받기 — PLAN §7.5 예시 1) */
const BOARD_NEOPIXEL_BLE = 'esp32/u4/c3-neopixel-count-rx-ble.py';

/**
 * 두 화면이 같은 선을 쓰게 하는 접두어 — PD-29의 무작위 12글자와 같은 모양이어야 주소(?bridge=)로 받아들여진다.
 * 글자는 src/lab/bridge/prefix.ts의 PREFIX_ALPHABET(l·o·0·1 없음)에서만 고른다. 검사마다 따로 써서 서로 간섭하지 않게 한다.
 */
const PREFIX_TWO_TABS = 'zangfinger2a';
const PREFIX_FRAME = 'zangfinger2b';
const PREFIX_RULES = 'zangfinger2c';
const PREFIX_HANDS = 'zangfinger2d';
const PREFIX_BLE = 'zangfinger2e';

/**
 * 실습실 두 곳을 한 검사에서 띄운다 — 개발 서버(Vite가 그때그때 옮김)에서는 첫 화면이 느려서 넉넉하게 본다.
 * 구역 A의 bridge-vision-board.spec.ts와 같은 까닭·같은 값이다(README 5.2).
 */
const READY_TIMEOUT = 180_000;
/** OpenCV 꾸러미(20MB 넘음)까지 받아야 하는 검사 */
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

/** 개발 서버(PW_BASE_URL)로 돌릴 때만: 다른 구역이 파일을 저장하면 Vite HMR이 페이지를 통째로 새로 고쳐 실행 중인 코드가 사라진다. */
async function blockHmr(page: Page): Promise<void> {
  if (process.env.PW_BASE_URL) {
    await page.routeWebSocket(/\?token=|vite-hmr/u, () => {
      // 연결하지 않고 버린다(Vite 클라이언트는 다시 붙기를 기다리기만 한다). 빌드한 사이트·CI에는 이 소켓이 없다.
    });
  }
}

/** ESP32 실습실을 연다(보드 그림이 준비될 때까지) */
async function openBoardLab(page: Page, query: string): Promise<void> {
  const response = await page.goto(`${ESP32_PATH}${query}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
  await expect(page.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: READY_TIMEOUT });
}

/**
 * 영상처리 실습실을 연다. 손 인식을 쓰는 검사만 OpenCV 꾸러미까지 기다린다 —
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
  await blockHmr(page);
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
async function useReplay(page: Page, sequence: 'count' | 'two-hands'): Promise<void> {
  await page.locator('[data-vision-source-select]').selectOption('replay');
  await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'replay');
  await page.locator('[data-mediapipe-sequence]').selectOption(sequence);
}

/** 두 화면이 서로를 알아볼 때까지 */
async function waitPeer(page: Page): Promise<void> {
  await expect(bridgePanel(page)).toHaveAttribute('data-bridge-peers', /[1-9]/u, { timeout: 60_000 });
}

/** 켜진 LED 수가 조건에 맞을 때까지 지켜본다(재생 동작 'count'는 1초마다 손가락을 하나씩 편다). */
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

/** 콘솔에 남은 `Sent: …` 줄의 값만 차례대로(§7.6 규칙 ⑤ — 실제로 선에 나간 것만 적힌다) */
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

  test.beforeEach(async ({ page }) => {
    await blockHmr(page);
  });

  test('두 탭: 재생 입력의 손가락이 펴지는 만큼 가상 링의 켜진 LED가 늘고, 주먹이면 꺼진다(카메라 없음)', async ({ page, context }) => {
    const board = await openSecondTab(context, `?example=${encodeURIComponent(BOARD_NEOPIXEL)}&bridge=${PREFIX_TWO_TABS}`);

    // ① 보드 쪽을 먼저 돌린다(보드가 꺼져 있을 때 온 글자는 실물처럼 사라진다). 배선도와 실습 방법이 보드 그림 위에 보이고,
    //    배선(변환기 RX 17·TX 16, 네오픽셀 DIN 23)에는 고칠 것이 없다.
    await expect(board.locator('[data-board-practice]')).toContainText('USB-UART 변환기');
    await expect(ring(board)).toBeVisible();
    await expect(board.locator('[data-board-part="uart"]')).toBeVisible();
    await expect(board.locator('[data-board-problems] li[data-code]')).toHaveCount(0);
    await clickRun(board);
    await expect(board.locator('[data-lab-console]')).toContainText('기다리는 중', { timeout: 60_000 });
    await expect(ring(board)).toHaveAttribute('data-visual-count', '0');

    // ② 컴퓨터 쪽 — 카메라 없이 재생 입력(손가락 0~5개)으로 손을 만든다. 손 좌표·영상은 사이트 밖으로 나가지 않는다(요청을 모두 센다).
    const requests = collectRequests(page);
    await openVision(page, `?example=${encodeURIComponent(PC_FINGER_COUNT)}&bridge=${PREFIX_TWO_TABS}`, { packages: true });
    await waitPeer(page);
    await useReplay(page, 'count');
    await clickRun(page);

    // ③ 손가락이 하나씩 펴지면서 켜진 LED가 늘어난다(재생 동작은 1초마다 한 개씩, 6초에 0~5개).
    const grew = await waitLit(board, (count) => count >= 3, '손가락 3개 이상');
    console.log(`[시나리오 F] 켜진 네오픽셀 ${grew}개`);
    test.info().annotations.push({ type: 'scenario-f-lit', description: String(grew) });
    expect(grew).toBeLessThanOrEqual(5);

    // ④ 보드 콘솔에도 개수가 글로 남는다(색만으로 알리지 않는다).
    await expect(board.locator('[data-lab-console]')).toContainText(`LED ${grew}개를 켰어요`, { timeout: 30_000 });

    // ⑤ 다섯 개까지 편 뒤 주먹으로 돌아오면(재생 동작이 되풀이된다) 다시 0개가 된다.
    await waitLit(board, (count) => count === 5, '손가락 5개');
    await waitLit(board, (count) => count === 0, '다시 주먹(0개)', 60_000);

    // ⑥ 값이 바뀔 때만 보낸다(§7.2 규칙 4) — 1초에 15장을 보면서도 같은 값을 잇달아 보내지 않는다.
    const sent = await sentValues(page);
    console.log(`[시나리오 F] 보낸 값 ${sent.length}개: ${sent.join(' ')}`);
    expect(sent.length).toBeGreaterThanOrEqual(6);
    expect(sent.every((value) => /^[0-5]$/u.test(value)), `보낸 값은 손가락 개수(0~5)뿐이어야 해요: ${sent.join(' ')}`).toBe(true);
    expect(sent.filter((value, index) => index > 0 && value === sent[index - 1]), '같은 값을 잇달아 보냈어요').toEqual([]);
    // 컴퓨터 쪽 화면에는 어떤 통로로 보내는지 한 번 알린다(통로는 코드가 아니라 [보내기] 패널에서 고른다 — §7.6).
    await expect(page.locator('[data-lab-console]')).toContainText("bridge: '같은 컴퓨터 탭' 통로로 보내요");

    await stopRun(page);
    expect(await waitDone(page, 30_000)).toBe('stopped');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
    await stopRun(board);
    expect(await waitDone(board, 30_000)).toBe('stopped');
    await expect(board.locator('[data-lab-console]')).not.toContainText('Traceback');
    // 같은 컴퓨터 탭 통로(BroadcastChannel)는 네트워크를 쓰지 않는다 — 사이트 자신과 파이썬 엔진 CDN 밖으로 나간 요청이 없다(SPEC §2, PLAN §10).
    const pageOrigin = new URL(page.url()).origin;
    for (const origin of requests.origins) {
      expect([pageOrigin, ...ALLOWED_REMOTE_ORIGINS], origin).toContain(origin);
    }
    await board.close();
  });

  test('한 화면 모드: [한 화면에 가상 보드 열기]로 연 iframe에서도 같은 코드가 짝지어 돈다', async ({ page }) => {
    await openVision(page, `?example=${encodeURIComponent(PC_FINGER_COUNT)}&bridge=${PREFIX_FRAME}`, { packages: true });
    const panel = bridgePanel(page);
    await expect(panel).toBeVisible();

    // 짝 예제를 고르고 한 화면에 연다. 패널의 목록(구역 A의 BOARD_EXAMPLES — 공유 파일, 요청 1번)에 짝이 아직 없으면
    // iframe 안 실습실의 예제 목록에서 고른다(학생이 목록에서 고르는 것과 같은 길).
    const select = panel.locator('[data-bridge-board-example]');
    const hasPair = (await select.locator(`option[value="${BOARD_NEOPIXEL}"]`).count()) > 0;
    if (hasPair) {
      await select.selectOption(BOARD_NEOPIXEL);
    }
    await panel.locator('[data-bridge-open-frame]').click();
    await expect(labRoot(page)).toHaveAttribute('data-bridge-frame', 'on');

    const frame = page.frameLocator('[data-bridge-frame-view]');
    await expect(frame.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: READY_TIMEOUT });
    await expect(frame.locator('[data-lab]')).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
    if (!hasPair) {
      await frame.locator('[data-lab-example-select]').selectOption(BOARD_NEOPIXEL_ID);
      await frame.locator('[data-lab-example-load]').click();
      await expect(frame.locator('[data-lab]')).toHaveAttribute('data-example', BOARD_NEOPIXEL_ID);
    }
    await frame.getByRole('button', { name: '실행', exact: true }).first().click();
    await expect(frame.locator('[data-lab-console]')).toContainText('기다리는 중', { timeout: 60_000 });

    await waitPeer(page);
    await useReplay(page, 'count');
    await clickRun(page);

    await expect
      .poll(async () => Number((await frame.locator('[data-board-part="neopixel"]').getAttribute('data-visual-count')) ?? '0'), {
        timeout: 90_000,
        intervals: [250],
      })
      .toBeGreaterThanOrEqual(3);
    await expect(frame.locator('[data-lab-console]')).toContainText('개를 켰어요');

    await stopRun(page);
    expect(await waitDone(page, 30_000)).toBe('stopped');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
  });

  test('bridge 모듈: 값이 바뀔 때만 보내고 끝 문자는 \\n 한 개, event·send_bytes 규칙, 보드가 보낸 줄은 receive()로 온다', async ({ page, context }) => {
    const board = await openSecondTab(context, `?bridge=${PREFIX_RULES}`);
    // 보드 쪽: 온 줄을 그대로 찍고 "OK-"를 붙여 돌려보낸다(배선은 머리말로 알린다 — 편집칸 코드의 # @part도 배선도를 그린다).
    await setEditorCode(
      board,
      [
        '# @part uart rx=17 tx=16',
        'from machine import UART',
        'from time import sleep',
        'uart = UART(2, baudrate=9600, tx=17, rx=16, timeout=200)',
        'for _ in range(400):',
        '    line = uart.readline()',
        '    if line:',
        '        print("받음", line)',
        '        uart.write(b"OK-" + line)',
        '    sleep(0.05)',
      ].join('\n'),
    );
    await clickRun(board);
    await expect(board.locator('[data-board-io]')).toHaveAttribute('data-board-phase', /^(run|idle)$/u, { timeout: 60_000 });

    await openVision(page, `?bridge=${PREFIX_RULES}`);
    await waitPeer(page);
    // 한 번 보낼 때마다 0.3초씩 쉰다 — 보낼 차례(초당 10회)에 두 개가 함께 밀려 있지 않게 해서, 모듈의 규칙만 본다.
    await setEditorCode(
      page,
      [
        'import bridge',
        'from time import sleep',
        'print("첫 보내기", bridge.send("3"))',
        'sleep(0.3)',
        'print("같은 값", bridge.send("3"))',
        'print("끝 문자를 붙여도 같은 값", bridge.send("3\\n"))',
        'print("바뀐 값", bridge.send(4))',
        'sleep(0.3)',
        'print("이벤트", bridge.event("4"))',
        'sleep(0.3)',
        'print("이벤트 뒤 같은 상태", bridge.send("4"))',
        'print("바이트", bridge.send_bytes(b"AB\\n"))',
        'sleep(0.3)',
        'print("바이트 뒤 같은 상태", bridge.send("4"))',
        'print("마지막", bridge.last_sent())',
        'got = []',
        'for _ in range(60):',
        '    line = bridge.receive()',
        '    if line is not None:',
        '        got.append(line)',
        '    if len(got) >= 5:',
        '        break',
        '    sleep(0.1)',
        'print("보드에서", got)',
      ].join('\n'),
    );
    await clickRun(page);
    expect(await waitDone(page, 90_000)).toBe('ok');

    const console_ = page.locator('[data-lab-console]');
    await expect(console_).toContainText('첫 보내기 True');
    await expect(console_).toContainText('같은 값 False'); // §7.2 규칙 4 — 값이 바뀔 때만
    await expect(console_).toContainText('끝 문자를 붙여도 같은 값 False'); // 규칙 2 — 끝 문자는 한 개
    await expect(console_).toContainText('바뀐 값 True'); // 숫자도 글자로 바꿔 보낸다
    await expect(console_).toContainText('이벤트 True'); // 규칙 5 — 이벤트는 같은 값도 보낸다
    await expect(console_).toContainText('이벤트 뒤 같은 상태 False'); // 이벤트가 상태 기억을 바꾸지 않는다
    await expect(console_).toContainText('바이트 3'); // 규칙 7 — 바이트 그대로(끝 문자를 더하지 않는다)
    await expect(console_).toContainText('바이트 뒤 같은 상태 True');
    await expect(console_).toContainText('마지막 4');
    // 끝 문자는 \n 한 개 — 보드가 읽은 바이트 그대로 보인다(실제로 선에 나간 차례).
    const boardConsole = board.locator('[data-lab-console]');
    await expect(boardConsole).toContainText("받음 b'3\\n'", { timeout: 30_000 });
    await expect(boardConsole).toContainText("받음 b'AB\\n'", { timeout: 30_000 });
    await expect.poll(async () => ((await boardConsole.textContent()) ?? '').split("받음 b'4\\n'").length - 1, { timeout: 30_000 }).toBe(3);
    // 보드 → 컴퓨터(receive()) — 한 줄씩, 줄바꿈을 뗀 글자
    await expect(console_).toContainText("보드에서 ['OK-3', 'OK-4', 'OK-4', 'OK-AB', 'OK-4']");
    // 콘솔의 Sent: 줄도 원본 PC 코드처럼 남는다(§7.6 ⑤)
    expect(await sentValues(page)).toEqual(['3', '4', '4', 'AB', '4']);

    await board.close();
  });

  test('여러 손 고침: 손이 두 개면 두 손의 손가락을 더해서 센다(교안 계단 9 방식은 마지막 손만 센다)', async ({ page }) => {
    await openVision(page, `?example=${encodeURIComponent(PC_FINGER_COUNT)}&bridge=${PREFIX_HANDS}`, { packages: true });
    await useReplay(page, 'two-hands');

    // 예제의 세는 함수를 그대로 떼어 내 두 손 좌표에 쓴다(통신 없이 계산만 확인). 교안 계단 9(f136)처럼 반복문이 끝난 뒤
    // 마지막 손으로만 세면 5, 예제처럼 손마다 세어 더하면 10이다.
    const source = example(PC_FINGER_COUNT);
    const helper = source.slice(source.indexOf('COMPARE = ['), source.indexOf('cap = cv2.VideoCapture(0)'));
    expect(helper).toContain('def count_fingers');
    await setEditorCode(
      page,
      [
        'import cv2',
        'import mediapipe as mp',
        helper.trimEnd(),
        'hands = mp.solutions.hands.Hands(max_num_hands=2)',
        'cap = cv2.VideoCapture(0)',
        'for _ in range(60):',
        '    ret, frame = cap.read()',
        '    result = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))',
        '    if result.multi_hand_landmarks and len(result.multi_hand_landmarks) == 2:',
        '        total = 0',
        '        for hand_landmarks in result.multi_hand_landmarks:',
        '            total += count_fingers(hand_landmarks.landmark)',
        '        print("마지막 손만", count_fingers(hand_landmarks.landmark), "두 손 합계", total)',
        '        break',
        'cap.release()',
      ].join('\n'),
    );
    await clickRun(page);
    expect(await waitDone(page, 120_000)).toBe('ok');
    // 재생 동작 '두 손'은 두 손 모두 편 손이다.
    await expect(page.locator('[data-lab-console]')).toContainText('마지막 손만 5 두 손 합계 10');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
  });

  test('받을 쪽 화면이 없으면 BridgeNoPeer로 무엇을 눌러야 하는지 한국어로 알려 준다', async ({ page }) => {
    await openVision(page, '');
    await setEditorCode(page, ['import bridge', 'bridge.send("3")'].join('\n'));
    await clickRun(page);
    expect(await waitDone(page, 90_000)).toBe('error');
    const console_ = page.locator('[data-lab-console]');
    await expect(console_).toContainText('BridgeNoPeer');
    await expect(console_).toContainText('ESP32 실습실 탭을 찾지 못했어요');
    await expect(console_).toContainText('[한 화면에 가상 보드 열기]');
    // 오류 풀이 카드는 오류 사전의 comm-no-peer 항목(준비 단계가 bridge.send 예시로 적어 둔 것 — 공유 파일을 고치지 않고 맞춘다)
    await expect(page.locator('[data-errors-card]')).toHaveAttribute('data-errors-entry', 'comm-no-peer', { timeout: 30_000 });
    await expect(page.locator('[data-errors-title]')).toHaveText('받을 쪽을 찾지 못했어요');
  });

  test('블루투스판 보드 예제: 블루투스로 받은 숫자만큼 켜고, 숫자가 아니면 그대로 둔다(PLAN §7.5 예시 1)', async ({ page }) => {
    await openBoardLab(page, `?example=${encodeURIComponent(BOARD_NEOPIXEL_BLE)}`);
    await expect(ring(page)).toBeVisible();
    await expect(page.locator('[data-board-part="ble"]')).toBeVisible();
    await clickRun(page);
    await expect(page.locator('[data-lab-console]')).toContainText('기다리는 중', { timeout: 60_000 });

    // 보드 아래 블루투스 조작 칸이 상대 기기(컴퓨터·스마트폰) 노릇을 한다 — 연결한 뒤 글자를 보낸다.
    const ble = page.locator('[data-board-part-controls][data-part="ble"]');
    await expect(ble).toHaveAttribute('data-ble-running', 'true', { timeout: 30_000 });
    await ble.getByRole('button', { name: '연결', exact: true }).click();
    await expect(ble).toHaveAttribute('data-ble-connected', 'true', { timeout: 15_000 });
    await ble.locator('[data-ble-text]').fill('3');
    await ble.getByRole('button', { name: '보내기', exact: true }).click();
    await expect(ring(page)).toHaveAttribute('data-visual-count', '3', { timeout: 30_000 });
    await expect(page.locator('[data-lab-console]')).toContainText('LED 3개를 켰어요');

    await ble.locator('[data-ble-text]').fill('x');
    await ble.getByRole('button', { name: '보내기', exact: true }).click();
    await expect(page.locator('[data-lab-console]')).toContainText('숫자가 아니라서 그냥 두었어요: x', { timeout: 30_000 });
    await expect(ring(page)).toHaveAttribute('data-visual-count', '3');

    await stopRun(page);
    expect(await waitDone(page, 30_000)).toBe('stopped');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
  });

  test('블루투스판을 두 탭으로: 선이 받은 숫자를 가상 블루투스에 넣어 링이 켜진다(2026-09-24 통합 — 요청 7번)', async ({ page, context }) => {
    // 보드 쪽에 USB-UART 변환기가 없고 블루투스 부품만 있으면, 선(vision-bridge)이 받은 바이트를 가상 블루투스(apc:ble-write)로 넣는다.
    const board = await openSecondTab(context, `?example=${encodeURIComponent(BOARD_NEOPIXEL_BLE)}&bridge=${PREFIX_BLE}`);
    await expect(board.locator('[data-board-part="ble"]')).toBeVisible();
    await expect(board.locator('[data-board-part="uart"]')).toHaveCount(0);
    await clickRun(board);
    await expect(board.locator('[data-lab-console]')).toContainText('기다리는 중', { timeout: 60_000 });

    await openVision(page, `?example=${encodeURIComponent(PC_FINGER_COUNT)}&bridge=${PREFIX_BLE}`, { packages: true });
    await waitPeer(page);
    await useReplay(page, 'count');
    await clickRun(page);

    const grew = await waitLit(board, (count) => count >= 3, '손가락 3개 이상(블루투스판)');
    expect(grew).toBeLessThanOrEqual(5);
    // 가상 블루투스는 먼저 이어지고(상대 기기 노릇) 받은 숫자는 ESP32BLE.read()로 간다
    await expect(board.locator('[data-board-part-controls][data-part="ble"]')).toHaveAttribute('data-ble-connected', 'true');
    await expect(board.locator('[data-lab-console]')).toContainText('개를 켰어요');

    await stopRun(page);
    expect(await waitDone(page, 30_000)).toBe('stopped');
    await stopRun(board);
    expect(await waitDone(board, 30_000)).toBe('stopped');
    await expect(board.locator('[data-lab-console]')).not.toContainText('Traceback');
    await board.close();
  });

  test('ESP32 실습실(가상 보드)에서 import bridge는 실물처럼 모듈이 없다고 알린다', async ({ page }) => {
    await openBoardLab(page, '');
    await setEditorCode(page, ['import bridge', 'bridge.send("3")'].join('\n'));
    await clickRun(page);
    expect(await waitDone(page, 90_000)).toBe('error');
    const console_ = page.locator('[data-lab-console]');
    await expect(console_).toContainText("ModuleNotFoundError: No module named 'bridge'");
    await expect(console_).toContainText('컴퓨터(영상처리 실습실)에서 쓰는 사이트 모듈');
  });

  test('import bridge만 쓴 예제도 [보내기] 패널이 저절로 열린다(요청 1번 반영 뒤)', async ({ page }) => {
    // 패널을 여는 코드 모양(PC_USE_PATTERN)은 구역 A의 공유 파일에 있다 — 요청(.cache/phase4-requests/scenario-f.md 1번)이
    // 반영되기 전에는 이 검사를 건너뛰고, 반영되면 저절로 돈다.
    const moduleSource = fs.readFileSync(path.join(ROOT, 'src', 'lab', 'modules', 'vision-bridge', 'index.ts'), 'utf8');
    const patternLine = moduleSource.split('\n').find((line) => line.includes('const PC_USE_PATTERN')) ?? '';
    test.skip(!/bridge/u.test(patternLine), 'vision-bridge의 PC_USE_PATTERN에 bridge가 아직 없다(공유 파일 변경 요청 1번 반영 전).');

    await openVision(page, `?example=${encodeURIComponent(PC_FINGER_COUNT)}`);
    await expect(page.locator('[data-lab-module-panel="vision-bridge"]')).toBeVisible({ timeout: 30_000 });
    await expect(bridgePanel(page).locator('[data-bridge-open-frame]')).toBeVisible();
  });
});
