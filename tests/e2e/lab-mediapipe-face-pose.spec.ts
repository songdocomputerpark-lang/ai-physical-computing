// mediapipe 얼굴·자세 흉내 브라우저 테스트(PLAN §8.2 P2-09 완료 기준: "이관한 얼굴·자세 예제가 돌고, 카메라 없이 재생 입력으로도 판정이 바뀐다").
//
// 재생 입력(합성 얼굴 478점·자세 33점, src/lab/modules/mediapipe/synthetic-face.ts·synthetic-pose.ts)을 골라 교과서·교안에서 옮긴 예제 파일을
// **글자 하나 고치지 않고** 실습실에 넣어 돌린다. 카메라가 없어도, 모델(.task)이 아직 없어도 학생이 실습을 끝낼 수 있어야 한다(SPEC §2).
// 학생 영상·좌표가 사이트 밖으로 나가지 않는 것도 여기서 검사한다(허용 주소 밖 요청 0건).
//
// 실행: PW_BASE_URL=http://localhost:4404/ai-physical-computing/ npx playwright test tests/e2e/lab-mediapipe-face-pose.spec.ts --project=desktop --output=.cache/pw-mediapipe-artifacts
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { REPLAY_SEQUENCE_IDS } from '../../src/lab/modules/mediapipe/sequences.ts';
import { ALLOWED_REMOTE_ORIGINS } from '../../src/lab/runtime/config.ts';
import { labRoot, setEditorCode, waitDone } from './helpers/lab.ts';
import { FRAME_TIMEOUT, collectRequests, openVisionLab, waitFrames } from './helpers/vision.ts';

const ROOT = process.cwd();
const example = (relativePath: string): string => fs.readFileSync(path.join(ROOT, 'examples', relativePath), 'utf8');

/** 교안 계단 11(f119): FaceMesh(refine_landmarks=True) + FACEMESH_TESSELATION 그리기. ESC로 끝낸다. */
const FACEMESH_POINTS = example('vision/opmp/11-facemesh-points.py');
/** 교안 계단 14(f122): 눈 감김 판정("Opend"/"Closed"). ESC로 끝낸다. */
const EYE_CLOSED = example('vision/opmp/14-eye-closed.py');
/** 교과서 1-3-2 심화(f037): MAR로 하품 세기. q로 끝낸다. */
const YAWN_MAR = example('vision/u1/1-3-2-adv-yawn-mar.py');
/** 교과서 1-3-1 심화(f035): 고개 방향 세기. q로 끝낸다. */
const HEAD_DIRECTION = example('vision/u1/1-3-1-adv-head-direction.py');
/** 교과서 1-4-2(f042): 어깨 높이 차이. q로 끝낸다. */
const SHOULDER = example('vision/u1/1-4-2-shoulder-balance.py');

async function chooseSource(page: Page, id: string): Promise<void> {
  await page.locator('[data-vision-source-select]').selectOption(id);
  await expect(labRoot(page)).toHaveAttribute('data-vision-source', id);
}

async function chooseSequence(page: Page, id: string): Promise<void> {
  await page.locator('[data-mediapipe-sequence]').selectOption(id);
  await expect(labRoot(page)).toHaveAttribute('data-mediapipe-replay', id);
}

/**
 * 출력 창 캔버스에서 밝은 픽셀 수(120 초과). 재생 화면 바탕은 어두운 회색(최대 43)이라 세지 않고,
 * 재생 뼈대·윤곽선과 학생 코드가 그린 점·선만 센다.
 */
async function brightPixels(page: Page, windowName: string): Promise<number> {
  return page.locator(`canvas[data-vision-window="${windowName}"]`).evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0) {
      return -1;
    }
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let drawn = 0;
    for (let index = 0; index < data.length; index += 4) {
      if ((data[index] ?? 0) > 120 || (data[index + 1] ?? 0) > 120 || (data[index + 2] ?? 0) > 120) {
        drawn += 1;
      }
    }
    return drawn;
  });
}

/**
 * 교안 계단 11~19가 쓰는 선 색(BGR 166,151,18 = 화면 RGB 18,151,166 청록)만 센다.
 * 재생 화면이 스스로 그리는 색(회색 154,163,173 · 하늘색 143,211,255)은 빨강 값이 커서 걸리지 않는다 → 학생 코드가 그린 그물만 센다.
 */
async function tealPixels(page: Page, windowName: string): Promise<number> {
  return page.locator(`canvas[data-vision-window="${windowName}"]`).evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx || canvas.width === 0) {
      return -1;
    }
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let found = 0;
    for (let index = 0; index < data.length; index += 4) {
      if ((data[index] ?? 0) < 90 && (data[index + 1] ?? 0) > 110 && (data[index + 2] ?? 0) > 130) {
        found += 1;
      }
    }
    return found;
  });
}

async function pressStopKey(page: Page, key: string): Promise<void> {
  await page.locator('[data-vision-output-stage]').focus();
  await page.keyboard.press(key);
}

async function consoleText(page: Page): Promise<string> {
  return (await page.locator('[data-lab-console]').textContent()) ?? '';
}

test.describe('얼굴·자세 인식(mediapipe 흉내) — 재생 입력', () => {
  test.skip(({ isMobile }) => isMobile, '워커·JSPI·카메라 동작은 데스크톱 Chromium에서 확인한다');
  test.describe.configure({ timeout: 300_000 });

  // 개발 서버(PW_BASE_URL)로 돌릴 때만: 다른 파일이 바뀌면 Vite HMR이 페이지를 통째로 새로 고쳐 시험 중간에 에디터 내용과 고른 입력이 사라진다.
  test.beforeEach(async ({ page }) => {
    if (process.env.PW_BASE_URL) {
      await page.routeWebSocket(/\?token=|vite-hmr/u, () => {
        // 연결하지 않고 버린다(Vite 클라이언트는 다시 붙기를 기다리기만 한다).
      });
    }
  });

  test('재생 동작 목록에 손·얼굴·자세 묶음이 있고 저사양 모드를 켤 수 있다', async ({ page }) => {
    // 인식 패널은 코드가 mediapipe를 쓸 때만 열리므로(2026-09-17 검토 반영) 얼굴 그물 예제(f034)로 연다.
    await openVisionLab(page, '?example=vision/u1/1-3-1-face-mesh.py');
    const panel = page.locator('[data-lab-module-panel="mediapipe"]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-mediapipe-sequence] optgroup')).toHaveCount(3);
    await expect(panel.locator('[data-mediapipe-sequence] option')).toHaveCount(REPLAY_SEQUENCE_IDS.length);
    await expect(panel.locator('[data-mediapipe-solution]')).toHaveText('손 인식');
    await expect(panel).toContainText('얼굴 478점');

    // 저사양 모드는 이 컴퓨터에만 기억한다(PD-20)
    await panel.locator('[data-mediapipe-low-spec]').check();
    await expect(labRoot(page)).toHaveAttribute('data-mediapipe-low-spec', 'yes');
    expect(await page.evaluate(() => window.localStorage.getItem('ai-physical-computing:module:mediapipe:low-spec'))).toBe('1');
    await panel.locator('[data-mediapipe-low-spec]').uncheck();

    // 얼굴 동작을 고르면 종류가 바뀐다
    await chooseSource(page, 'replay');
    await chooseSequence(page, 'face-yawn');
    await expect(labRoot(page)).toHaveAttribute('data-mediapipe-replay-kind', 'face');
    await expect(panel.locator('[data-mediapipe-sequence-note]')).toContainText('입을');
  });

  test('교안 계단 11(f119)을 고치지 않고 돌리면 얼굴 그물이 그려지고 ESC로 끝난다', async ({ page }) => {
    const requests = collectRequests(page);
    const leaked: string[] = [];
    page.on('pageerror', (error) => leaked.push(error.message));

    await openVisionLab(page);
    await chooseSource(page, 'replay');
    // 손 동작이 골라져 있어도 얼굴 코드를 실행하면 얼굴 동작으로 알아서 바뀐다
    await chooseSequence(page, 'count');
    await setEditorCode(page, FACEMESH_POINTS);
    await page.getByRole('button', { name: '실행', exact: true }).click();

    await expect(labRoot(page)).toHaveAttribute('data-mediapipe-opened', 'face_mesh', { timeout: FRAME_TIMEOUT });
    await expect(labRoot(page)).toHaveAttribute('data-mediapipe-replay-kind', 'face', { timeout: FRAME_TIMEOUT });
    await expect(page.locator('[data-mediapipe-solution]')).toHaveText('얼굴 그물');
    await waitFrames(page, 'Face', 3);

    const mesh = await tealPixels(page, 'Face');
    console.log(`[mediapipe] Face 창에 학생 코드가 그린 그물 픽셀 ${mesh}`);
    test.info().annotations.push({ type: 'face-mesh-pixels', description: String(mesh) });
    expect(mesh).toBeGreaterThan(2000); // 그물 2,556선을 두께 3으로 그린다

    await pressStopKey(page, 'Escape');
    expect(await waitDone(page, 60_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
    await expect(page.locator('[data-lab-console]')).not.toContainText('초기화 중 오류');
    expect(leaked).toEqual([]);

    // 얼굴 좌표·영상은 이 컴퓨터 밖으로 나가지 않는다: 사이트 자신과 jsDelivr(Pyodide·휠) 밖 요청 0건.
    const pageOrigin = new URL(page.url()).origin;
    for (const origin of requests.origins) {
      expect([pageOrigin, ...ALLOWED_REMOTE_ORIGINS], origin).toContain(origin);
    }
    expect(requests.urls.filter((url) => /storage\.googleapis\.com|google-analytics|googleapis\.com/u.test(url))).toEqual([]);
  });

  test('교안 계단 14(f122): 눈 깜빡이기 동작에서 Opend ↔ Closed 판정이 실제로 바뀐다', async ({ page }) => {
    await openVisionLab(page);
    await chooseSource(page, 'replay');
    await chooseSequence(page, 'face-blink');
    // 원본은 putText로만 상태를 보여 주므로, 판정이 바뀌는 것을 콘솔에서도 볼 수 있게 한 줄만 덧붙여 확인한다(원본 코드는 그대로 둔다).
    await setEditorCode(page, `${EYE_CLOSED}\n    print(eye_status)\n`);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await waitFrames(page, 'Face', 3);

    await expect
      .poll(async () => {
        const text = await consoleText(page);
        return text.includes('Closed') && text.includes('Opend');
      }, { timeout: FRAME_TIMEOUT, message: '눈 감김 판정이 바뀌지 않았어요' })
      .toBe(true);

    await pressStopKey(page, 'Escape');
    expect(await waitDone(page, 60_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
  });

  test('교과서 1-3-2 심화(f037): 하품 동작에서 MAR가 0.4를 넘어 하품 횟수가 늘어난다', async ({ page }) => {
    await openVisionLab(page);
    await chooseSource(page, 'replay');
    await chooseSequence(page, 'face-yawn');
    await setEditorCode(page, `${YAWN_MAR.replace('cv2.imshow("Yawn Detection", frame)', 'print("MAR", round(mar, 3), "Yawns", yawn_count)\n    cv2.imshow("Yawn Detection", frame)')}`);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await waitFrames(page, 'Yawn Detection', 3);

    await expect
      .poll(
        async () => {
          const values = [...(await consoleText(page)).matchAll(/MAR ([\d.]+) Yawns (\d+)/gu)].map((match) => [Number(match[1]), Number(match[2])] as const);
          return { max: Math.max(0, ...values.map(([mar]) => mar)), yawns: Math.max(0, ...values.map(([, count]) => count)) };
        },
        { timeout: FRAME_TIMEOUT, message: 'MAR가 0.4를 넘지 않았어요' },
      )
      .toMatchObject({ yawns: 1 });
    const values = [...(await consoleText(page)).matchAll(/MAR ([\d.]+)/gu)].map((match) => Number(match[1]));
    console.log(`[mediapipe] MAR ${Math.min(...values).toFixed(3)} ~ ${Math.max(...values).toFixed(3)} (기준 0.4)`);
    expect(Math.max(...values)).toBeGreaterThan(0.4);
    expect(Math.min(...values)).toBeLessThan(0.4);

    await pressStopKey(page, 'q');
    expect(await waitDone(page, 60_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
  });

  test('교과서 1-3-1 심화(f035): 고개 돌리기 동작에서 Left·Right 횟수가 함께 늘어난다', async ({ page }) => {
    await openVisionLab(page);
    await chooseSource(page, 'replay');
    await chooseSequence(page, 'face-turn');
    await setEditorCode(page, `${HEAD_DIRECTION.replace('cv2.imshow("Head Direction Counter", frame)', 'print("dir", direction, left_count, right_count)\n    cv2.imshow("Head Direction Counter", frame)')}`);
    await page.getByRole('button', { name: '실행', exact: true }).click();
    await waitFrames(page, 'Head Direction Counter', 3);

    await expect
      .poll(
        async () => {
          const found = new Set([...(await consoleText(page)).matchAll(/dir (\w+) /gu)].map((match) => match[1]));
          return [...found].sort().join(',');
        },
        { timeout: FRAME_TIMEOUT, message: '고개 방향 판정이 바뀌지 않았어요' },
      )
      .toBe('Center,Left,Right');

    await pressStopKey(page, 'q');
    expect(await waitDone(page, 60_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
  });

  test('교과서 1-4-2(f042): 자세 동작에서 뼈대가 그려지고 어깨 높이 차이가 40픽셀을 넘는다', async ({ page }) => {
    await openVisionLab(page);
    await chooseSource(page, 'replay');
    await setEditorCode(page, `${SHOULDER.replace("cv2.imshow('Pose Tracking', image)", "print('diff', abs(ly - ry))\n    cv2.imshow('Pose Tracking', image)")}`);
    await page.getByRole('button', { name: '실행', exact: true }).click();

    // 자세 코드라서 재생 동작이 자세로 바뀐다
    await expect(labRoot(page)).toHaveAttribute('data-mediapipe-opened', 'pose', { timeout: FRAME_TIMEOUT });
    await expect(labRoot(page)).toHaveAttribute('data-mediapipe-replay-kind', 'pose', { timeout: FRAME_TIMEOUT });
    await waitFrames(page, 'Pose Tracking', 3);
    expect(await brightPixels(page, 'Pose Tracking')).toBeGreaterThan(500);

    // 어깨 기울이기 동작으로 바꾸면 40픽셀을 넘는다(f043의 경고 기준)
    await chooseSequence(page, 'pose-tilt');
    await expect
      .poll(
        async () => Math.max(0, ...[...(await consoleText(page)).matchAll(/diff (\d+)/gu)].map((match) => Number(match[1]))),
        { timeout: FRAME_TIMEOUT, message: '어깨 높이 차이가 커지지 않았어요' },
      )
      .toBeGreaterThan(40);

    await pressStopKey(page, 'q');
    expect(await waitDone(page, 60_000)).toBe('ok');
    await expect(page.locator('[data-lab-console]')).not.toContainText('Traceback');
  });

  // 이관한 얼굴·자세 예제(PD-33)를 한 페이지에서 차례로 돌린다. 코드 파일은 그대로 읽어 넣고(한 글자도 고치지 않음), 창 이름과 끝내는 키만 표에 적는다.
  const SWEEP: readonly { file: string; id: string; window: string; key: string; sequence?: string; outcome?: 'ok' | 'error'; endsWith?: string }[] = [
    { file: 'vision/u1/1-3-1-face-mesh.py', id: 'f034', window: 'FaceMesh Landmarks', key: 'q', sequence: 'face-turn' },
    { file: 'vision/u1/1-3-2-yawn-mouth.py', id: 'f036', window: 'Mouth Landmarks', key: 'q', sequence: 'face-yawn' },
    { file: 'vision/u1/1-3-3-face-box.py', id: 'f038', window: 'Face Bounding Box', key: 'q' },
    { file: 'vision/opmp/12-facemesh-numbers.py', id: 'f120', window: 'Face', key: 'Escape' },
    { file: 'vision/opmp/17-nose-position.py', id: 'f125', window: 'Face', key: 'Escape' },
    { file: 'vision/u1/1-4-1-pose-skeleton.py', id: 'f040', window: 'Pose Tracking', key: 'q', sequence: 'pose-raise' },
    // 원본 마지막 줄의 오타(cv2.destoyAllWindows)는 PC에서도 AttributeError로 끝난다 — 고치지 않고 그대로 재현하는지 본다(PD-10).
    { file: 'vision/opmp/15-pose-landmarks.py', id: 'f123', window: 'Pose', key: 'Escape', outcome: 'error', endsWith: 'destoyAllWindows' },
  ];

  test('이관한 얼굴·자세 예제 7개가 모두 고치지 않고 돌고 원본의 종료 키로 끝난다', async ({ page }) => {
    const leaked: string[] = [];
    page.on('pageerror', (error) => leaked.push(error.message));
    await openVisionLab(page);
    await chooseSource(page, 'replay');

    for (const item of SWEEP) {
      await page.getByRole('button', { name: '콘솔 지우기', exact: true }).click();
      if (item.sequence) {
        await chooseSequence(page, item.sequence);
      }
      await setEditorCode(page, example(item.file));
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await waitFrames(page, item.window, 3);
      expect(await brightPixels(page, item.window), item.id).toBeGreaterThan(200);
      await pressStopKey(page, item.key);
      expect(await waitDone(page, 60_000), `${item.id} ${item.file}`).toBe(item.outcome ?? 'ok');
      if (item.endsWith) {
        // 원본에 있던 오류를 그대로 재현한다(고쳐서 돌리지 않는다)
        await expect(page.locator('[data-lab-console]'), item.id).toContainText(item.endsWith);
      } else {
        await expect(page.locator('[data-lab-console]'), item.id).not.toContainText('Traceback');
      }
      console.log(`[mediapipe] ${item.id} ${item.file} — 창 "${item.window}" ${item.outcome === 'error' ? `원본 오류(${item.endsWith})까지 그대로` : '정상 종료'}`);
    }
    expect(leaked).toEqual([]);
  });

  test('얼굴 검출(FaceDetection)은 0~1 상자와 점 6개를 주고, 모델이 없으면 한국어로 알린다', async ({ page }) => {
    await openVisionLab(page);
    await chooseSource(page, 'replay');
    await setEditorCode(
      page,
      [
        'import cv2, mediapipe as mp',
        'detector = mp.solutions.face_detection.FaceDetection(min_detection_confidence=0.5)',
        'print("엔진", detector.engine)',
        'cap = cv2.VideoCapture(0)',
        'ret, frame = cap.read()',
        'rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)',
        'result = detector.process(rgb)',
        'box = result.detections[0].location_data.relative_bounding_box',
        'print("상자", round(box.xmin, 2), round(box.ymin, 2), round(box.width, 2), round(box.height, 2))',
        'print("점", len(result.detections[0].location_data.relative_keypoints))',
        'mp.solutions.drawing_utils.draw_detection(frame, result.detections[0])',
        'cv2.imshow("Face Detection", frame)',
        'cv2.waitKey(1)',
        'cap.release()',
      ].join('\n'),
    );
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, 120_000)).toBe('ok');

    const text = await consoleText(page);
    expect(text).toContain('엔진 replay');
    const box = /상자 ([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/u.exec(text);
    expect(box, text).not.toBeNull();
    for (const value of box!.slice(1).map(Number)) {
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(text).toContain('점 6');
    expect(text).not.toContain('Traceback');
  });

  test('모델 파일이 아직 없으면(웹캠 입력) 얼굴·자세도 한국어로 알리고 코드는 멈추지 않는다', async ({ page }) => {
    const requests = collectRequests(page);
    await openVisionLab(page);
    await expect(labRoot(page)).toHaveAttribute('data-vision-source', 'webcam');
    await setEditorCode(
      page,
      [
        'import cv2, mediapipe as mp',
        'face = mp.solutions.face_mesh.FaceMesh(max_num_faces=1)',
        'pose = mp.solutions.pose.Pose()',
        'print("얼굴 엔진", face.engine, "자세 엔진", pose.engine)',
        'cap = cv2.VideoCapture(0)',
        'ret, frame = cap.read()',
        'rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)',
        'print("얼굴", face.process(rgb).multi_face_landmarks)',
        'print("자세", pose.process(rgb).pose_landmarks)',
        'cap.release()',
      ].join('\n'),
    );
    await page.getByRole('button', { name: '실행', exact: true }).click();
    expect(await waitDone(page, 120_000)).toBe('ok');

    const text = await consoleText(page);
    if (text.includes('얼굴 엔진 ready')) {
      // 운영자가 모델을 넣은 뒤: 가짜 카메라 영상에는 사람이 없으므로 None이 나오는 것이 정상이다.
      expect(text).toContain('자세 엔진 ready');
    } else {
      expect(text).toContain('얼굴 엔진 missing-model');
      expect(text).toContain('models/face_landmarker.task');
      expect(text).toContain('models/pose_landmarker_full.task');
      expect(text).toContain('재생 입력');
    }
    expect(text).toContain('얼굴 None');
    expect(text).toContain('자세 None');
    expect(text).not.toContain('Traceback');

    // 엔진·모델은 늘 같은 사이트에서만 받는다(PD-02·PD-03).
    const pageOrigin = new URL(page.url()).origin;
    const engineFiles = requests.urls.filter((url) => /vision_wasm|tasks-vision|landmarker|blaze_face|\.task(\?|$)/u.test(url));
    console.log(`[mediapipe] 엔진·모델 요청 ${engineFiles.length}건: ${engineFiles.map((url) => url.replace(pageOrigin, '')).join(', ')}`);
    for (const url of engineFiles) {
      expect(url.startsWith(pageOrigin), url).toBe(true);
    }
    expect(requests.urls.filter((url) => /storage\.googleapis\.com|googleapis\.com|google-analytics/u.test(url))).toEqual([]);
  });
});
