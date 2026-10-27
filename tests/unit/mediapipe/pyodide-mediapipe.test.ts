// mediapipe 흉내 모듈의 파이썬 쪽(src/lab/modules/mediapipe/{mediapipe,apc_mediapipe}.py)을 Node.js의 실제 Pyodide 314.0.7 + opencv-python으로
// 검사한다(PLAN §8.2 P2-08 손 · P2-09 얼굴·자세, src/lab/README.md 4.6절). 판 1.8.0부터 학생 코드는 토니 5.0 + mediapipe 1.1.1의 Tasks API 모양이다
// (vision.HandLandmarker 등 — 옛 mp.solutions는 진짜처럼 AttributeError). 단계 목록은 helpers/tasks-steps.mjs 한 곳이고, 같은 단계를 진짜 CPython에서
// 돌려 본 값과 기댓값이 같다(판 1.8.0 통합 기록).
//   - JSPI 있음(--experimental-wasm-jspi): HandLandmarker·FaceLandmarker·PoseLandmarker·FaceDetector의 detect·draw_landmarks가 실제로 화면과 값을 주고받는다.
//   - JSPI 없음(제한 모드 — JSPI 없는 브라우저를 tests/unit/helpers/no-jspi.mjs로 흉내 냄): 기다릴 수 없으니 아무것도 못 찾은 결과(빈 리스트)로 답하고
//     한국어로 안내한다. 전에는 --no-experimental-wasm-jspi로 껐는데 새 Node(CI 24.20 이상)는 그 플래그로 끌 수 없어 CI에서 조용히 건너뛰어졌다
//     (2026-09-30 최종 점검 TD-05). 흉내를 못 내면 건너뛰지 않고 실패한다.
// 추론 결과는 합성 좌표로 흉내 낸다(PD-30): 손은 tests/fixtures/landmarks/hands.json, 얼굴·자세는 생성기(synthetic-face.ts·synthetic-pose.ts)를 바로 부른다.
// 손·얼굴 개수는 진짜 화면처럼 연 객체의 maxNumHands·maxNumFaces로 도우미가 자른다.
// opencv 휠은 .cache/pyodide-packages/에 저장된다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NO_JSPI_NODE_ARGS, nodeCanHideJspi, noJspiProblem } from '../helpers/no-jspi.ts';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'tests', 'unit', 'mediapipe', 'helpers', 'pyodide-mediapipe-run.mjs');

const nodeJspi = spawnSync(process.execPath, ['--experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
  encoding: 'utf8',
  timeout: 20_000,
});
const nodeHasJspi = nodeJspi.status === 0 && nodeJspi.stdout === 'function';
const pyodideInstalled = fs.existsSync(path.join(ROOT, 'node_modules', 'pyodide', 'pyodide.mjs'));
const fixtureExists = fs.existsSync(path.join(ROOT, 'tests', 'fixtures', 'landmarks', 'hands.json'));

interface StepRecord {
  ms: number;
  value?: unknown;
  errorType?: string;
  errorMessage?: string;
  stdout: string;
  requests: string[];
}

interface DetectRequest {
  kind: string;
  solution?: string;
  id?: number;
  options?: Record<string, unknown>;
  width?: number;
  height?: number;
  dataType?: string;
  bytes?: number;
  firstPixel?: number[] | null;
}

interface Result {
  jspi: boolean;
  skipped?: string;
  duplicate?: string;
  files: string[];
  shimTable: string;
  steps: Record<string, StepRecord>;
  notices: string[];
  requests: DetectRequest[];
  syncEntrypointReset: string;
  installIdempotent: number;
  importsWithoutNumpy: string;
}

function run(jspi: boolean): Result {
  if (!jspi && !nodeCanHideJspi) {
    // 흉내를 못 내면 묶음을 건너뛰지 않고 까닭과 함께 실패한다(묶음을 모으는 동안 부르므로 expect 대신 오류)
    throw new Error(noJspiProblem);
  }
  const flags = jspi ? ['--experimental-wasm-jspi'] : NO_JSPI_NODE_ARGS;
  const result = spawnSync(process.execPath, [...flags, SCRIPT, ROOT], {
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`도우미 스크립트 실패(${result.status}): ${result.stderr.slice(-2000)}`);
  }
  const lines = result.stdout.trim().split('\n');
  return JSON.parse(lines[lines.length - 1] ?? '{}') as Result;
}

describe.skipIf(!pyodideInstalled || !nodeHasJspi || !fixtureExists)('mediapipe 흉내 모듈의 파이썬 쪽(실제 Pyodide + OpenCV)', () => {
  const out = run(true);
  const skipped = Boolean(out.skipped);
  // 휠을 받지 못한 컴퓨터(jsDelivr가 막힘)에서는 단계를 건너뛰되 소리 없이 지나가지 않게 알리고,
  // CI(GitHub Actions — 이 시험을 실제로 돌리는 유일한 곳)에서는 건너뛰기를 실패로 본다(판 1.8.0 검토 반영).
  if (skipped) {
    console.warn(`[pyodide-mediapipe] 건너뜀: ${out.skipped}`);
  }
  it('CI에서는 휠을 받아 모든 단계를 실제로 돌린다(건너뛰지 않는다)', () => {
    if (process.env.CI === 'true') {
      expect(out.skipped).toBeUndefined();
    }
  });
  const value = (name: string) => out.steps[name]!.value as unknown[];
  const opensOf = (solution: string) => out.requests.filter((request) => request.kind === 'mediapipe.open' && request.solution === solution);

  it('모듈 파일이 /apc에 들어가고 흉내 표에 mediapipe가 등록된다', () => {
    expect(out.duplicate).toBeUndefined();
    if (skipped) return;
    expect(out.files).toEqual(expect.arrayContaining(['apc_runtime.py', 'apc_shims.py', 'apc_mediapipe.py', 'apc_mp_tables.py', 'mediapipe.py']));
    expect(JSON.parse(out.shimTable)).toMatchObject({ cv2: 'apc_cv2', mediapipe: 'apc_mediapipe' });
    expect(out.jspi).toBe(true);
  });

  it('import: 판·관절 번호·연결표·이름 공간이 mediapipe 1.1.1과 같다', () => {
    if (skipped) return;
    const [version, indexTip, thumbTip, connections, firstThree, sameDrawing, sameTasks, sameStyles, styleType, topNames, connectionRepr, baseRepr, landmarkRepr, mode, srgb] =
      value('import');
    expect(version).toBe('1.1.1-apc');
    expect(indexTip).toBe(8);
    expect(thumbTip).toBe(4);
    expect(connections).toBe(21);
    // 진짜 파이썬 판의 차례(손바닥 → 엄지 → … — 그리기 결과가 같도록)
    expect(firstThree).toEqual([
      [0, 1],
      [0, 5],
      [9, 13],
    ]);
    expect(sameDrawing).toBe(true); // from mediapipe.tasks.python.vision import drawing_utils
    expect(sameTasks).toBe(true); // from mediapipe.tasks import python → mp.tasks
    expect(sameStyles).toBe(true);
    expect(styleType).toBe('DrawingSpec');
    expect(topNames).toEqual(['Image', 'ImageFormat', 'tasks']); // 진짜 1.1.1의 맨 위 이름 셋
    expect(connectionRepr).toBe('HandLandmarksConnections.Connection(start=0, end=1)');
    expect(baseRepr).toBe("BaseOptions(model_asset_path='x.task', model_asset_buffer=None, delegate=None)");
    expect(landmarkRepr).toBe('NormalizedLandmark(x=0.5, y=0.25, z=None, visibility=None, presence=None, name=None)');
    expect(mode).toBe('VIDEO');
    expect(srgb).toBe(1);
  });

  it('옛 사용법(mp.solutions)은 진짜 1.x처럼 오류가 나고 한국어로 한 번 안내한다', () => {
    if (skipped) return;
    expect(out.steps.legacy_solutions).toMatchObject({ errorType: 'AttributeError' });
    expect(out.steps.legacy_solutions!.errorMessage).toContain("module 'mediapipe' has no attribute 'solutions'");
    expect(out.steps.legacy_from_import).toMatchObject({ errorType: 'ImportError' });
    expect(out.steps.legacy_from_import!.errorMessage).toContain("cannot import name 'solutions' from 'mediapipe'");
    expect(out.steps.legacy_submodule).toMatchObject({ errorType: 'ModuleNotFoundError' });
    expect(out.steps.legacy_submodule!.errorMessage).toContain("No module named 'mediapipe.solutions'");
    expect(out.notices.some((text) => text.includes('mp.solutions') && text.includes('vision.HandLandmarker'))).toBe(true);
  });

  it('DrawingSpec 기본값이 진짜와 같다(흰색 224·두께 2·반지름 2, RED는 BGR)', () => {
    if (skipped) return;
    expect(out.steps.drawing_spec_defaults!.value).toEqual([[224, 224, 224], 2, 2, [166, 151, 18], 3, 2, [0, 0, 255], [224, 224, 224]]);
  });

  it('mp.Image: 크기·형식·읽기 전용 배열, 잘못된 배열은 진짜와 같은 문구의 오류', () => {
    if (skipped) return;
    const [width, height, channels, format, writeable, errors] = value('image_checks') as [number, number, number, number, boolean, string[]];
    expect([width, height, channels, format, writeable]).toEqual([64, 48, 3, 1, false]);
    expect(errors).toEqual([
      'ValueError: Pixel data size is too small: 3072 (expected 9216)',
      'ValueError: Unsupported image format: SRGB (expected VEC32F1, VEC32F2, or VEC32F4 for float data)',
      "AttributeError: 'list' object has no attribute 'ndim'",
    ]);
  });

  it('HandLandmarker 설정을 화면 옵션으로 옮긴다(Tasks 기본 손 1개, IMAGE·VIDEO 모드)', () => {
    if (skipped) return;
    const opens = opensOf('hands');
    expect(opens[0]!.options).toEqual({
      maxNumHands: 1,
      minDetectionConfidence: 0.5,
      minPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      runningMode: 'IMAGE',
      staticImageMode: true,
    });
    expect(opens[1]!.options).toEqual({
      maxNumHands: 3,
      minDetectionConfidence: 0.7,
      minPresenceConfidence: 0.6,
      minTrackingConfidence: 0.3,
      runningMode: 'VIDEO',
      staticImageMode: false,
    });
    expect(out.steps.open_default!.value).toBe('replay');
    expect(out.steps.open_bad_num_hands).toMatchObject({ errorType: 'RuntimeError' });
    expect(out.steps.open_bad_num_hands!.errorMessage).toContain('1 이상이어야 해요');
  });

  it('detect_for_video 결과가 진짜와 같은 모양이다(hand_landmarks[i][j].x·handedness[i][0].category_name, Right=0·Left=1)', () => {
    if (skipped) return;
    const [hands, points, x, y, z, first, second, score, firstIndex, secondIndex, displayName, worldPaired, byEnum, typeName, noVisibility, listType] =
      value('detect_two_hands');
    expect(hands).toBe(2);
    expect(points).toBe(21);
    expect(x as number).toBeGreaterThan(0);
    expect(x as number).toBeLessThan(1);
    expect(y as number).toBeGreaterThan(0);
    expect(Number.isFinite(z as number)).toBe(true);
    expect([first, second]).toEqual(['Right', 'Left']);
    expect(score as number).toBeGreaterThan(0.5);
    expect([firstIndex, secondIndex]).toEqual([0, 1]); // 2026-10-26 진짜 1.1.1: Right index 0, Left index 1
    expect(displayName).toBe('Right');
    expect(worldPaired).toBe(true); // 재생 입력에도 hand_world_landmarks가 손마다 21점(근삿값)
    expect(byEnum).toBe(x); // HandLandmark.INDEX_FINGER_TIP == 8
    expect(typeName).toBe('HandLandmarkerResult');
    expect(noVisibility).toBe(true); // 손 점은 visibility·presence가 None(진짜와 같음 — draw_landmarks가 건너뛰지 않는다)
    expect(listType).toBe('list');
  });

  it('detect가 화면에 넘기는 것은 RGBA 바이트(Uint8Array)이고 RGB 순서가 지켜진다', () => {
    if (skipped) return;
    const detect = out.requests.find((request) => request.kind === 'mediapipe.detect')!;
    expect(detect.dataType).toBe('Uint8Array');
    expect(detect.bytes).toBe(detect.width! * detect.height! * 4);
    // BGR (0,0,200) → RGB (200,0,0) → RGBA 첫 픽셀
    expect(detect.firstPixel).toEqual([200, 0, 0, 255]);
  });

  it('손이 없으면 None이 아니라 빈 리스트다(진짜 1.x와 같음), num_hands=1이면 한 손만 온다', () => {
    if (skipped) return;
    expect(out.steps.detect_none!.value).toEqual([true, true, true, false]);
    expect(out.steps.num_hands_one!.value).toBe(1);
  });

  it('print(점)·print(분류)가 진짜와 같은 dataclass 글자다', () => {
    if (skipped) return;
    expect(out.steps.result_repr!.stdout).toMatch(/^NormalizedLandmark\(x=[\d.]+, y=[\d.]+, z=[-\d.]+, visibility=None, presence=None, name=None\)\n/u);
    expect(out.steps.result_repr!.stdout).toContain("Category(index=0, score=0.98, display_name='Right', category_name='Right')");
  });

  it('잘못 쓰면 진짜와 같은 오류 문구(+ 한국어 힌트)', () => {
    if (skipped) return;
    const expectError = (name: string, type: string, text: string) => {
      expect(out.steps[name], name).toMatchObject({ errorType: type });
      expect(out.steps[name]!.errorMessage, name).toContain(text);
    };
    expectError('err_numpy_image', 'AttributeError', "'numpy.ndarray' object has no attribute '_image_ptr'");
    expectError('err_gray_image', 'ValueError', 'mp.ImageFormat.SRGB');
    expectError('err_same_timestamp', 'ValueError', 'Input timestamp must be monotonically increasing.');
    expectError('err_float_timestamp', 'TypeError', "'float' object cannot be interpreted as an integer");
    expectError('err_wrong_mode', 'ValueError', 'Task is not initialized with the image mode. Current running mode:video mode');
    expectError('err_wrong_model', 'FileNotFoundError', 'No file with name: hand_detector.tflite. All files in the model asset bundle are: face_landmarks_detector.tflite');
    expectError('err_typo_model', 'FileNotFoundError', 'Unable to open file at hand.task');
    expectError('err_mode_string', 'AttributeError', "'str' object has no attribute 'ctype'");
    expectError('err_live_without_callback', 'ValueError', 'a user-defined result callback must be provided');
    expectError('err_unsupported_task', 'NotImplementedError', 'GestureRecognizer');
    expectError('err_task_for_detector', 'ValueError', 'The model is not a valid Flatbuffer buffer');
  });

  it('판 1.8.0 검토 반영: mp.Image가 아닌 것으로 실패해도 시각을 쓰지 않고, 윈도우 경로의 모델 이름도 알아본다', () => {
    if (skipped) return;
    expect(out.steps.bad_image_keeps_timestamp).toMatchObject({ value: 2 });
    expect(out.steps.windows_model_path!.errorType).toBeUndefined();
    expect(out.steps.windows_model_path!.value).not.toBe('missing-model');
  });

  it('닫은 뒤에는 빈 결과(진짜와 같음), with 문으로 닫히고, LIVE_STREAM은 result_callback으로 결과를 준다', () => {
    if (skipped) return;
    expect(out.steps.after_close!.value).toBe(0);
    expect(out.steps.context_manager!.value).toEqual([1, true]);
    expect(out.steps.live_stream!.value).toEqual([[2, 'Image', 42]]);
  });

  it('draw_landmarks가 진짜 cv2로 그리고, 위치 인자 4번째=점·5번째=선이다(교안 계단 4)', () => {
    if (skipped) return;
    const [lineColorPixels, dotColorPixels, drawn, plainDrawn, withoutDots, styled] = value('draw_landmarks') as number[];
    expect(lineColorPixels).toBeGreaterThan(0); // 5번째 인자 색(파랑)으로 그린 이음선
    expect(dotColorPixels).toBeGreaterThan(0); // 4번째 인자 색(초록)으로 그린 점
    expect(drawn).toBeGreaterThan(lineColorPixels! + dotColorPixels!); // 점의 흰 테두리까지
    expect(plainDrawn).toBeGreaterThan(0); // 스타일을 안 주면 기본 빨강 점·흰 선
    expect(withoutDots).toBeLessThan(drawn!); // landmark_drawing_spec=None이면 점을 안 그림
    expect(styled).toBeGreaterThan(0); // drawing_styles 손가락별 색
  });

  it('손 목록 전체·숫자 짝 연결표를 넘기면 진짜와 같은 AttributeError(오류 사전 풀이로 이어짐)', () => {
    if (skipped) return;
    expect(out.steps.draw_whole_list).toMatchObject({ errorType: 'AttributeError' });
    expect(out.steps.draw_whole_list!.errorMessage).toContain("'list' object has no attribute 'visibility'");
    expect(out.steps.draw_tuple_connections).toMatchObject({ errorType: 'AttributeError' });
    expect(out.steps.draw_tuple_connections!.errorMessage).toContain("'tuple' object has no attribute 'start'");
  });

  it('합성 좌표로 교안 계단 9(접힌 손가락)가 주먹 00000·편 손 11111, 핀치 거리(1-2-3)가 20픽셀 안이다', () => {
    if (skipped) return;
    expect(out.steps.folded_fingers_fist!.value).toBe('00000');
    expect(out.steps.folded_fingers_open!.value).toBe('11111');
    expect(out.steps.pinch_distance!.value as number).toBeLessThan(20);
  });

  it('동기 진입점(install_available·reset_for_run)에서 양보를 시도하지 않고 install()은 멱등이다', () => {
    if (skipped) return;
    expect(out.syncEntrypointReset).toBe('ok');
    expect(out.installIdempotent).toBe(1);
    expect(out.notices.filter((text) => text.includes('초기화 중 오류'))).toEqual([]);
  });

  it('numpy를 아직 받지 않은 순간에도 import·install()이 된다(install은 패키지 받기 전에도 불린다)', () => {
    if (skipped) return;
    expect(out.importsWithoutNumpy).toBe('1.1.1-apc');
  });

  // ── 얼굴 그물(FaceLandmarker) ──

  it('얼굴·자세 연결표와 스타일이 진짜 1.1.1과 같다(그물 2,556쌍·윤곽 124쌍·코 25쌍, 자세 연결 35쌍)', () => {
    if (skipped) return;
    expect(out.steps.face_import!.value).toEqual([2556, 124, 25, 4, 'DrawingSpec', 124, 149, 8, 11, 15, 35, false]);
  });

  it('FaceLandmarker는 늘 478점(눈동자 포함)을 주고, 표정 점수는 부탁할 때만 52개다', () => {
    if (skipped) return;
    const [faces, points, noseX, , leftOfRight, iris, typeName, blendshapes, matrixes] = value('face_detect');
    expect(faces).toBe(1);
    expect(points).toBe(478);
    expect(noseX as number).toBeCloseTo(0.5, 2);
    expect(leftOfRight).toBe(true); // 33번 눈은 263번보다 왼쪽
    expect(iris).toBe(true); // 473번(왼 눈동자)이 468번보다 오른쪽 — refine 옵션 없이도 있다
    expect(typeName).toBe('FaceLandmarkerResult');
    expect(blendshapes).toEqual([]);
    expect(matrixes).toEqual([]);
    expect(out.steps.face_blendshapes!.value).toEqual([52, 'eyeBlinkLeft', 9, 'jawOpen', true, '_neutral']);
    expect(out.notices.some((text) => text.includes('face_blendshapes') && text.includes('근삿값'))).toBe(true);
    const detect = out.requests.filter((item) => item.solution === 'face_mesh' && item.kind === 'mediapipe.detect')[0];
    expect(detect?.bytes).toBe(480 * 640 * 4);
    expect(opensOf('face_mesh')[0]!.options).toMatchObject({ maxNumFaces: 1, refineLandmarks: true, runningMode: 'VIDEO' });
  });

  it('얼굴이 없으면 빈 리스트, 그물·윤곽을 진짜 cv2로 그리고, 입 벌린 장의 MAR(1-3-2 심화)가 0.4를 넘는다', () => {
    if (skipped) return;
    expect(out.steps.face_none!.value).toEqual([true, false]);
    const [mesh, contours] = value('face_draw') as number[];
    expect(mesh).toBeGreaterThan(10_000);
    expect(contours).toBeGreaterThan(500);
    expect(contours).toBeLessThan(mesh!);
    expect(out.steps.face_yawn_mar!.value as number).toBeGreaterThan(0.4);
  });

  // ── 얼굴 상자(FaceDetector) ──

  it('FaceDetector는 픽셀 정수 상자와 점 6개를 주고 draw_detection이 그린다(진짜와 같음)', () => {
    if (skipped) return;
    const [count, originX, originY, width, height, allInt, score, keypoints, noseX, drawn, typeName] = value('face_detector');
    expect(count).toBe(1);
    for (const number of [originX, originY, width, height]) {
      expect(number as number).toBeGreaterThan(0);
      expect(number as number).toBeLessThan(640);
    }
    expect(allInt).toBe(true);
    expect(score as number).toBeGreaterThan(0.5);
    expect(keypoints).toBe(6);
    expect(noseX as number).toBeCloseTo(0.5, 1);
    expect(drawn).toBe(true);
    expect(typeName).toBe('DetectionResult');
    expect(out.steps.face_detector_none!.value).toEqual([true, false]);
    expect(opensOf('face_detection')[0]!.options).toMatchObject({ minDetectionConfidence: 0.5, minSuppressionThreshold: 0.3 });
  });

  // ── 자세(PoseLandmarker) ──

  it('PoseLandmarker는 사람 목록(첫 사람 33점)과 visibility·presence를 주고, 사람이 없으면 빈 리스트다', () => {
    if (skipped) return;
    const [points, wristY, shoulderY, kneeVisibility, presenceSame, worlds, noMask, listType] = value('pose_detect');
    expect(points).toBe(33);
    expect(wristY as number).toBeLessThan(0.3); // 손 들기 장의 LEFT_WRIST.y — 교과서 1-4-1 심화의 Success! 조건
    expect(shoulderY as number).toBeGreaterThan(0.4);
    expect(kneeVisibility as number).toBeLessThan(0.5); // 화면 밖 무릎
    expect(presenceSame).toBe(true);
    expect(worlds).toBe(1);
    expect(noMask).toBe(true);
    expect(listType).toBe('list');
    expect(out.steps.pose_none!.value).toEqual([true, false]);
  });

  it('draw_landmarks가 visibility 0.5 미만인 점과 그 선을 건너뛴다(진짜 규칙)', () => {
    if (skipped) return;
    const [drawn, hidden, plain, styled] = value('pose_draw') as [number, number, number, boolean];
    expect(drawn).toBeGreaterThan(1000);
    expect(hidden).toBeLessThan(drawn);
    expect(plain).toBe(drawn); // 화면 밖(0~1 밖) 다리는 visibility를 올려도 그려지지 않는다
    expect(styled).toBe(true);
  });

  it('자세 모델 파일 이름으로 lite·full을 고르고 heavy는 full로 돌리며 한국어로 알린다(PD-20)', () => {
    if (skipped) return;
    const complexities = opensOf('pose').map((item) => item.options?.modelComplexity);
    expect(complexities).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(out.notices.some((text) => text.includes('pose_landmarker_heavy.task') && text.includes('30MB'))).toBe(true);
    expect(out.notices.some((text) => text.includes('모델 파일') && text.includes('같은 폴더'))).toBe(true);
  });
});

describe.skipIf(!pyodideInstalled || !nodeHasJspi || !fixtureExists)('mediapipe 흉내 모듈 — 제한 모드(JSPI 없음)', () => {
  const out = run(false);

  it('JSPI 없이도 import·상수는 그대로 되고 detect()는 빈 결과로 답하며 한국어로 안내한다', () => {
    if (out.skipped) return;
    expect(out.jspi).toBe(false);
    expect((out.steps.import!.value as unknown[])[1]).toBe(8);
    expect(out.steps.limited_detect!.value).toEqual(['limited', true]);
    expect(out.notices.some((text) => text.includes('JSPI') && text.includes('detect()'))).toBe(true);
  });
});
