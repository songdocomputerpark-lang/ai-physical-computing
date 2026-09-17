// mediapipe 손 인식 흉내 모듈 브라우저 테스트(PLAN §8.2 P2-08 완료 기준: "이관한 손 예제가 수정 없이 돈다", PD-03·PD-30).
//
// 재생 입력(합성 손 좌표, src/lab/modules/mediapipe/synthetic-hands.ts)을 골라 교과서·교안에서 옮긴 예제 파일을 **글자 하나 고치지 않고**
// 실습실에 넣어 돌린다. 카메라가 없어도, 손 모델(.task)이 아직 없어도 학생이 실습을 끝낼 수 있어야 한다(SPEC §2 하드웨어 없이 100%).
// 학생 영상·손 좌표가 사이트 밖으로 나가지 않는 것도 여기서 검사한다(허용 주소 밖 요청 0건).
//
// 실행: PW_BASE_URL=http://localhost:4404/ai-physical-computing/ npx playwright test tests/e2e/lab-mediapipe-hands.spec.ts --project=desktop
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ALLOWED_REMOTE_ORIGINS } from '../../src/lab/runtime/config.ts';
import { labRoot, setEditorCode, waitDone } from './helpers/lab.ts';
import { FRAME_TIMEOUT, collectRequests, openVisionLab, waitFrames } from './helpers/vision.ts';

const ROOT = process.cwd();
const example = (relativePath: string): string => fs.readFileSync(path.join(ROOT, 'examples', relativePath), 'utf8');

/** 교과서 1-1-2(f026): Hands() 기본값, BGR을 그대로 process()에 넣고 draw_landmarks로 그린 뒤 q로 끝낸다. */
const HANDS_FIRST = example('vision/u1/1-1-2-hands-first.py');
/** 교안 계단 9(f136): max_num_hands=1, 스타일 지정, 검지 끝 좌표 출력, 접힌 손가락 문자열. ESC로 끝낸다. */
const FOLDED_FINGERS = example('vision/opmp/09-folded-fingers.py');
/** 교안 계단 10(f118): max_num_hands=3, multi_handedness와 zip. ESC로 끝낸다. */
const BOTH_HANDS = example('vision/opmp/10-both-hands.py');

/** 입력 소스를 고른다(실습실 화면의 <select>). */
async function chooseSource(page: Page, id: string): Promise<void> {
  await page.locator('[data-vision-source-select]').selectOption(id);
  await expect(labRoot(page)).toHaveAttribute('data-vision-source', id);
}

/** 출력 창 캔버스에서 학생 코드가 그린 빨간 점(레거시 기본 색 RED_COLOR)의 픽셀 수 */
async function redPixels(page: Page, windowName: string): Promise<number> {
  return page.locator(`canvas[data-vision-window="${windowName}"]`).evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0) {
      return -1;
    }
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let red = 0;
    for (let index = 0; index < data.length; index += 4) {
      if ((data[index] ?? 0) > 180 && (data[index + 1] ?? 0) < 90 && (data[index + 2] ?? 0) < 90) {
        red += 1;
      }
    }
    return red;
  });
}

/** 출력 창 캔버스에서 색이 있는(검지 않은) 픽셀 수 */
async function drawnPixels(page: Page, windowName: string): Promise<number> {
  return page.locator(`canvas[data-vision-window="${windowName}"]`).evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0) {
      return -1;
    }
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let drawn = 0;
    for (let index = 0; index < data.length; index += 4) {
      if ((data[index] ?? 0) > 40 || (data[index + 1] ?? 0) > 40 || (data[index + 2] ?? 0) > 40) {
        drawn += 1;
      }
    }
    return drawn;
  });
}

/** 출력 화면에 초점을 두고 키를 눌러 예제의 반복문을 끝낸다. */
async function pressStopKey(page: Page, key: string): Promise<void> {
  await page.locator('[data-vision-output-stage]').focus();
  await page.keyboard.press(key);
}

test.describe('손 인식(mediapipe 흉내) — 재생 입력', () => {
  test.skip(({ isMobile }) => isMobile, '워커·JSPI·카메라 동작은 데스크톱 Chromium에서 확인한다');
  test.describe.configure({ timeout: 300_000 });

  // 개발 서버(PW_BASE_URL)로 돌릴 때만: 다른 파일이 바뀌면 Vite HMR이 페이지를 통째로 새로 고쳐 시험 중간에 에디터 내용과 고른 입력이
  // 사라진다(여럿이 동시에 만드는 동안 자주 일어난다). HMR 웹소켓을 잇지 않아 새로 고침을 막는다. 빌드한 사이트(CI)에는 이 소켓이 없다.
  test.beforeEach(async ({ page }) => {
    if (process.env.PW_BASE_URL) {
      await page.routeWebSocket(/\?token=|vite-hmr/u, () => {
        // 연결하지 않고 버린다(Vite 클라이언트는 다시 붙기를 기다리기만 한다).
      });
    }
  });

  test('모듈이 영상처리 실습실에 붙고, 패널과 재생 입력 선택지가 생긴다', async ({ page }) => {
    await openVisionLab(page, '?example=vision/first-edge.py');
    await expect(labRoot(page)).toHaveAttribute('data-lab-modules', /(^|\s)mediapipe(\s|$)/u);

    // 에지 검출 첫 실습처럼 mediapipe를 쓰지 않는 코드에서는 인식 패널이 닫혀 있다(2026-09-17 검토 반영 — 한 페이지 한 개념).
    const panel = page.locator('[data-lab-module-panel="mediapipe"]');
    await expect(panel).toBeHidden();
    // 손 인식 예제를 불러오면 열린다.
    await page.locator('[data-lab-example-select]').selectOption('u1-1-1-2-hands-first');
    await page.locator('[data-lab-example-load]').click();
    await expect(labRoot(page)).toHaveAttribute('data-example', 'u1-1-1-2-hands-first');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-mediapipe-engine]')).toHaveText('대기');
    // 재생 동작은 손 4개 + 얼굴 3개 + 자세 2개(P2-09에서 늘어남), 묶음(optgroup)으로 보인다
    await expect(panel.locator('[data-mediapipe-sequence] option')).toHaveCount(9);
    await expect(panel.locator('[data-mediapipe-sequence] optgroup[label="손"] option')).toHaveCount(4);
    await expect(panel).toContainText('사람 영상이 아니라');

    // 입력 소스 목록에 재생 입력이 있고 고를 수 있다(카메라가 없는 PC용).
    const select = page.locator('[data-vision-source-select]');
    await expect(select.locator('option[value="replay"]')).toHaveCount(1);
    await chooseSource(page, 'replay');
    await expect(page.locator('[data-vision-source-description]')).toContainText('사람 영상 없음');

    // 손 좌표·영상은 브라우저 저장소에 남기지 않는다(PLAN §10). 재생 동작 기억만 남는다.
    await panel.locator('[data-mediapipe-sequence]').selectOption('pinch');
    const keys = await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.includes('mediapipe')));
    expect(keys).toEqual(['ai-physical-computing:module:mediapipe:replay-sequence']);
    expect(await page.evaluate(() => window.localStorage.getItem('ai-physical-computing:module:mediapipe:replay-sequence'))).toBe('pinch');
  });

  test('교과서 1-1-2(f026)를 고치지 않고 돌리면 합성 손 위에 관절 점이 그려지고 q 키로 끝난다', async ({ page }) => {
    const requests = collectRequests(page);
    const leaked: string[] = [];
    page.on('pageerror', (error) => leaked.push(error.message));

    await openVisionLab(page);
    await chooseSource(page, 'replay');
    await setEditorCode(page, HANDS_FIRST);
    await page.getByRole('button', { name: '실행', exact: true }).click();

    await expect(labRoot(page)).toHaveAttribute('data-vision-input-state', 'open', { timeout: FRAME_TIMEOUT });
    await expect(labRoot(page)).toHaveAttribute('data-mediapipe-opened', 'hands', { timeout: FRAME_TIMEOUT });
    // 재생 입력에서는 엔진·모델을 받지 않는다(모델 파일이 없어도 실습이 끝난다).
    await expect(page.locator('[data-mediapipe-status]')).toContainText('재생 입력이 켜져 있어');
    await waitFrames(page, 'Hand', 5);

    const red = await redPixels(page, 'Hand');
    const drawn = await drawnPixels(page, 'Hand');
    console.log(`[mediapipe] Hand 창의 빨간 관절 점 ${red}픽셀 / 그려진 픽셀 ${drawn}`);
    test.info().annotations.push({ type: 'hand-landmark-pixels', description: String(red) });
    expect(red).toBeGreaterThan(20); // 21개 관절 × 기본 반지름 2
    expect(drawn).toBeGreaterThan(red);

    await pressStopKey(page, 'q');
    expect(await waitDone(page, 30_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).not.toContainText('초기화 중 오류');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Cannot stack switch');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
    expect(leaked).toEqual([]);

    // 손 좌표·영상은 이 컴퓨터 밖으로 나가지 않는다: 사이트 자신과 jsDelivr(Pyodide·휠) 밖 요청 0건.
    const pageOrigin = new URL(page.url()).origin;
    for (const origin of requests.origins) {
      expect([pageOrigin, ...ALLOWED_REMOTE_ORIGINS], origin).toContain(origin);
    }
    // MediaPipe 공식 CDN·사용 지표 주소로는 한 번도 가지 않는다(PD-03).
    expect(requests.urls.filter((url) => /storage\.googleapis\.com|google-analytics|googleapis\.com/u.test(url))).toEqual([]);
  });

  test('교안 계단 9(f136)를 고치지 않고 돌리면 검지 끝 좌표가 출력되고 ESC로 끝난다', async ({ page }) => {
    await openVisionLab(page);
    await chooseSource(page, 'replay');
    await page.locator('[data-mediapipe-sequence]').selectOption('count');
    await setEditorCode(page, FOLDED_FINGERS);
    await page.getByRole('button', { name: '실행', exact: true }).click();

    await waitFrames(page, 'Hand Tracking', 5);
    // print(finger_x, finger_y) — 두 정수가 콘솔에 찍힌다
    await expect(page.locator('[data-lab-console]')).toContainText(/\n?\d+ \d+\n/u, { timeout: FRAME_TIMEOUT });
    // 스타일을 준 예제라 선은 (166,151,18) BGR = 하늘색 계열로 그려진다(빨간 기본 점이 아니다)
    expect(await drawnPixels(page, 'Hand Tracking')).toBeGreaterThan(100);

    await pressStopKey(page, 'Escape');
    expect(await waitDone(page, 30_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
  });

  test('교안 계단 10(f118)의 두 손 예제가 돌고, 손 좌우 이름(Left·Right)이 레거시 모양으로 온다', async ({ page }) => {
    await openVisionLab(page);
    await chooseSource(page, 'replay');
    await page.locator('[data-mediapipe-sequence]').selectOption('two-hands');
    await setEditorCode(page, BOTH_HANDS);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await waitFrames(page, 'Hand Tracking', 5);
    await pressStopKey(page, 'Escape');
    expect(await waitDone(page, 30_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');

    // 결과 객체를 직접 확인한다(레거시 mp.solutions 모양 그대로).
    await setEditorCode(
      page,
      [
        'import cv2, mediapipe as mp',
        'hands = mp.solutions.hands.Hands()',
        'cap = cv2.VideoCapture(0)',
        'ret, frame = cap.read()',
        'rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)',
        'result = hands.process(rgb)',
        'print("손", len(result.multi_hand_landmarks), "관절", len(result.multi_hand_landmarks[0].landmark))',
        'print("좌우", sorted(h.classification[0].label for h in result.multi_handedness))',
        'print("검지끝", round(result.multi_hand_landmarks[0].landmark[8].x, 3) > 0)',
        'cap.release()',
      ].join('\n'),
    );
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, 60_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).toContainText('손 2 관절 21');
    await expect(page.locator('[data-lab-console]')).toContainText("좌우 ['Left', 'Right']");
    await expect(page.locator('[data-lab-console]')).toContainText('검지끝 True');
  });

  test('cv2.flip으로 뒤집으면 재생 입력의 좌표·좌우 이름도 함께 뒤집힌다(뼈대가 손 위에 그려지도록)', async ({ page }) => {
    await openVisionLab(page);
    await chooseSource(page, 'replay');
    // 두 손 동작은 손이 화면 양쪽(0.29·0.71)에 있어 뒤집힘이 좌표에 뚜렷하게 보인다.
    await page.locator('[data-mediapipe-sequence]').selectOption('two-hands');
    await setEditorCode(
      page,
      [
        'import cv2, mediapipe as mp',
        'hands = mp.solutions.hands.Hands(max_num_hands=1)',
        'cap = cv2.VideoCapture(0)',
        'ret, frame = cap.read()',
        'plain = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))',
        'flipped = hands.process(cv2.cvtColor(cv2.flip(frame, 1), cv2.COLOR_BGR2RGB))',
        'a = plain.multi_hand_landmarks[0].landmark[0].x',
        'b = flipped.multi_hand_landmarks[0].landmark[0].x',
        'print("그대로", round(a, 3), plain.multi_handedness[0].classification[0].label)',
        'print("뒤집음", round(b, 3), flipped.multi_handedness[0].classification[0].label)',
        'print("합", round(a + b, 2))',
        'cap.release()',
      ].join('\n'),
    );
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, 90_000)).toBe('ok');

    const consoleText = (await page.locator('[data-lab-console]').textContent()) ?? '';
    const plain = /그대로 ([\d.]+) (\w+)/u.exec(consoleText);
    const flipped = /뒤집음 ([\d.]+) (\w+)/u.exec(consoleText);
    console.log(`[mediapipe] ${plain?.[0]} / ${flipped?.[0]}`);
    expect(plain, consoleText).not.toBeNull();
    expect(flipped, consoleText).not.toBeNull();
    const plainX = Number(plain![1]);
    const flippedX = Number(flipped![1]);
    expect(plainX).toBeGreaterThan(0.55); // 그린 그대로: 오른쪽 손
    expect(flippedX).toBeLessThan(0.45); // 뒤집은 영상: 왼쪽으로 옮겨진다
    expect(Math.abs(plainX + flippedX - 1)).toBeLessThan(0.1); // x → 1 - x
    expect([plain![2], flipped![2]]).toEqual(['Right', 'Left']); // 좌우 이름도 반대로
    await expect(labRoot(page)).toHaveAttribute('data-mediapipe-mirrored', 'yes');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
  });

  test('손 모델 파일이 아직 없으면(웹캠 입력) 한국어로 알리고 코드는 멈추지 않는다', async ({ page }) => {
    const requests = collectRequests(page);
    await openVisionLab(page);
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'webcam');
    await setEditorCode(
      page,
      [
        'import cv2, mediapipe as mp',
        'hands = mp.solutions.hands.Hands()',
        'print("엔진", hands.engine)',
        'cap = cv2.VideoCapture(0)',
        'ret, frame = cap.read()',
        'rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)',
        'result = hands.process(rgb)',
        'print("손", result.multi_hand_landmarks)',
        'cap.release()',
      ].join('\n'),
    );
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, 90_000)).toBe('ok');

    const engine = await page.locator('[data-mediapipe-engine]').textContent();
    const console_ = page.locator('[data-lab-console]');
    if (engine === '준비됨') {
      // 운영자가 모델을 넣은 뒤: 가짜 카메라 영상에는 손이 없으므로 None이 나오는 것이 정상이다.
      await expect(console_).toContainText('엔진 ready');
    } else {
      expect(engine).toBe('모델 없음');
      await expect(console_).toContainText('엔진 missing-model');
      await expect(console_).toContainText('models/hand_landmarker.task');
      await expect(console_).toContainText('재생 입력');
    }
    await expect(console_).toContainText('손 None');
    await expect(console_).not.toContainText('Traceback');

    // 엔진·모델은 늘 같은 사이트에서만 받는다(PD-02·PD-03). 모델을 넣은 뒤에도 이 검사는 그대로 지켜져야 한다.
    const pageOrigin = new URL(page.url()).origin;
    for (const origin of requests.origins) {
      expect([pageOrigin, ...ALLOWED_REMOTE_ORIGINS], origin).toContain(origin);
    }
    const engineFiles = requests.urls.filter((url) => /vision_wasm|tasks-vision|hand_landmarker|\.task(\?|$)/u.test(url));
    console.log(`[mediapipe] 엔진·모델 요청 ${engineFiles.length}건: ${engineFiles.map((url) => url.replace(pageOrigin, '')).join(', ')}`);
    for (const url of engineFiles) {
      expect(url.startsWith(pageOrigin), url).toBe(true);
    }
    expect(requests.urls.filter((url) => /storage\.googleapis\.com|googleapis\.com|google-analytics/u.test(url))).toEqual([]);
  });

  // 이관한 손 예제(PD-33)를 한 페이지에서 차례로 돌린다. 코드 파일은 그대로 읽어 넣고(한 글자도 고치지 않음), 창 이름과 끝내는 키만
  // 표에 적는다. 각 예제가 ① 오류 없이 돌고 ② 출력 창에 그림이 생기고 ③ 원본의 종료 키로 정상적으로 끝나는지 본다.
  const SWEEP: readonly { file: string; id: string; window: string; key: string }[] = [
    { file: 'vision/opmp/01-cam-window.py', id: 'f128', window: 'Hand Tracking', key: 'Escape' },
    { file: 'vision/opmp/02-cam-size.py', id: 'f129', window: 'Hand Tracking', key: 'Escape' },
    { file: 'vision/opmp/03-hands-model.py', id: 'f130', window: 'Hand Tracking', key: 'Escape' },
    { file: 'vision/opmp/04-drawing-style.py', id: 'f131', window: 'Hand Tracking', key: 'Escape' },
    { file: 'vision/opmp/05-flip.py', id: 'f132', window: 'Hand Tracking', key: 'Escape' },
    { file: 'vision/opmp/06-finger-coords.py', id: 'f133', window: 'Hand Tracking', key: 'Escape' },
    { file: 'vision/opmp/07-finger-pixels.py', id: 'f134', window: 'Hand Tracking', key: 'Escape' },
    { file: 'vision/opmp/08-finger-circle.py', id: 'f135', window: 'Hand Tracking', key: 'Escape' },
    { file: 'vision/u1/1-2-1-adv-hand-settings.py', id: 'f029', window: 'Hand Tracking', key: 'q' },
    { file: 'vision/u1/1-2-2-finger-sketch.py', id: 'f030', window: 'Draw', key: 'q' },
    { file: 'vision/u1/1-2-2-adv-sketch-keys.py', id: 'f031', window: 'Draw with Index Finger (Toggle: d)', key: 'q' },
    { file: 'vision/u1/1-2-3-finger-distance.py', id: 'f032', window: 'Hand Tracking', key: 'q' },
    { file: 'vision/u1/1-2-3-adv-distance-circle.py', id: 'f033', window: 'Circle with Distance', key: 'q' },
  ];

  test('이관한 손 예제 13개가 모두 고치지 않고 돌고 원본의 종료 키로 끝난다', async ({ page }) => {
    const leaked: string[] = [];
    page.on('pageerror', (error) => leaked.push(error.message));
    await openVisionLab(page);
    await chooseSource(page, 'replay');

    for (const item of SWEEP) {
      await page.getByRole('button', { name: '콘솔 지우기', exact: true }).click();
      await setEditorCode(page, example(item.file));
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await waitFrames(page, item.window, 3);
      expect(await drawnPixels(page, item.window), item.id).toBeGreaterThan(100);
      await pressStopKey(page, item.key);
      expect(await waitDone(page, 30_000), `${item.id} ${item.file}`).toBe('ok');
      await expect(page.locator('[data-lab-console]'), item.id).not.toContainText('Traceback');
      console.log(`[mediapipe] ${item.id} ${item.file} — 창 "${item.window}" 정상 종료`);
    }
    expect(leaked).toEqual([]);
  });

  test('카메라가 없는 PC(샘플 입력)에서는 손 인식 코드가 스스로 재생 입력으로 바꾼다', async ({ page }) => {
    await openVisionLab(page);
    await chooseSource(page, 'sample');
    await setEditorCode(
      page,
      [
        'import cv2, mediapipe as mp',
        'hands = mp.solutions.hands.Hands(max_num_hands=1)',
        'cap = cv2.VideoCapture(0)',
        'ret, frame = cap.read()',
        'result = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))',
        'print("손", len(result.multi_hand_landmarks))',
        'cap.release()',
      ].join('\n'),
    );
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, 90_000)).toBe('ok');
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'replay');
    await expect(page.locator('[data-lab-console]')).toContainText('입력 소스를');
    await expect(page.locator('[data-lab-console]')).toContainText('손 1');
  });
});
