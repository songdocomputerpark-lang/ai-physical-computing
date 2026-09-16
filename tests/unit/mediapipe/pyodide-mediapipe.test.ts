// mediapipe 흉내 모듈의 파이썬 쪽(src/lab/modules/mediapipe/{mediapipe,apc_mediapipe}.py)을 Node.js의 실제 Pyodide 314.0.7 + opencv-python으로
// 검사한다(PLAN §8.2 P2-08 손 · P2-09 얼굴·자세, CODE_MAPPING §3.2, src/lab/README.md 4.6절). 학생 코드가 PC에서 쓰던 레거시 mp.solutions 모양 그대로 도는지를 본다.
//   - JSPI 있음(--experimental-wasm-jspi): Hands()·FaceMesh()·Pose()·FaceDetection()의 process()·draw_landmarks가 실제로 화면과 값을 주고받는다.
//   - JSPI 없음(--no-experimental-wasm-jspi, 제한 모드): 기다릴 수 없으니 아무것도 못 찾은 것(None)으로 답하고 한국어로 안내한다.
// 추론 결과는 합성 좌표로 흉내 낸다(PD-30): 손은 tests/fixtures/landmarks/hands.json, 얼굴·자세는 생성기(synthetic-face.ts·synthetic-pose.ts)를 바로 부른다.
// opencv 휠은 .cache/pyodide-packages/에 저장된다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

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
  const result = spawnSync(process.execPath, [jspi ? '--experimental-wasm-jspi' : '--no-experimental-wasm-jspi', SCRIPT, ROOT], {
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

  it('모듈 파일이 /apc에 들어가고 흉내 표에 mediapipe가 등록된다', () => {
    expect(out.duplicate).toBeUndefined();
    if (skipped) return;
    expect(out.files).toEqual(expect.arrayContaining(['apc_runtime.py', 'apc_shims.py', 'apc_mediapipe.py', 'mediapipe.py']));
    expect(JSON.parse(out.shimTable)).toMatchObject({ cv2: 'apc_cv2', mediapipe: 'apc_mediapipe' });
    expect(out.jspi).toBe(true);
  });

  it('import mediapipe as mp: 판·관절 번호·연결표·이름 공간이 레거시와 같다', () => {
    if (skipped) return;
    const [version, indexTip, thumbTip, connections, firstThree, sameDrawing, sameHands, styleType] = out.steps.import!.value as [
      string,
      number,
      number,
      number,
      number[][],
      boolean,
      boolean,
      string,
    ];
    expect(version).toBe('0.10.35-apc');
    expect(indexTip).toBe(8); // CODE_MAPPING §3.2.2
    expect(thumbTip).toBe(4);
    expect(connections).toBe(21);
    expect(firstThree).toEqual([
      [0, 1],
      [0, 5],
      [0, 17],
    ]);
    expect(sameDrawing).toBe(true); // from mediapipe.solutions import drawing_utils
    expect(sameHands).toBe(true); // import mediapipe.solutions.hands as …
    expect(styleType).toBe('DrawingSpec');
  });

  it('제공하지 않는 하위 모듈(Tasks API)은 평범한 ModuleNotFoundError', () => {
    if (skipped) return;
    expect(out.steps.missing_submodule).toMatchObject({ errorType: 'ModuleNotFoundError' });
    expect(out.steps.missing_submodule!.errorMessage).toContain("No module named 'mediapipe.tasks'");
  });

  it('DrawingSpec 기본값이 레거시와 같다(흰색 224·두께 2·반지름 2, RED는 BGR)', () => {
    if (skipped) return;
    expect(out.steps.drawing_spec_defaults!.value).toEqual([[224, 224, 224], 2, 2, [166, 151, 18], 3, 2, [0, 0, 255], [224, 224, 224]]);
  });

  it('Hands(): 인자가 없으면 레거시 기본값(손 2개)을 화면에 보낸다 — Tasks 기본 1개와 다르다', () => {
    if (skipped) return;
    const opens = out.requests.filter((request) => request.kind === 'mediapipe.open');
    expect(opens[0]!.options).toEqual({ staticImageMode: false, maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    expect(opens[0]!.solution).toBe('hands');
    expect(out.steps.open_default!.value).toBe('replay');
  });

  it('Hands(이름 붙인 인자)를 그대로 옮긴다(f029·계단 10의 max_num_hands=3 포함)', () => {
    if (skipped) return;
    expect(out.requests[1]!.options).toEqual({
      staticImageMode: true,
      maxNumHands: 3,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.3,
    });
  });

  it('잘못된 인자는 한국어 설명이 붙은 오류', () => {
    if (skipped) return;
    expect(out.steps.open_bad_arg).toMatchObject({ errorType: 'ValueError' });
    expect(out.steps.open_bad_arg!.errorMessage).toContain('1 이상이어야 해요');
  });

  it('process(rgb): 결과가 레거시 모양이다(multi_hand_landmarks[i].landmark[j].x·multi_handedness[i].classification[0].label)', () => {
    if (skipped) return;
    const [hands, points, x, y, z, first, second, score, index, world, byEnum, typeName] = out.steps.process_two_hands!.value as [
      number,
      number,
      number,
      number,
      number,
      string,
      string,
      number,
      number,
      unknown,
      number,
      string,
    ];
    expect(hands).toBe(2);
    expect(points).toBe(21);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(1);
    expect(y).toBeGreaterThan(0);
    expect(Number.isFinite(z)).toBe(true);
    expect([first, second]).toEqual(['Right', 'Left']);
    expect(score).toBeGreaterThan(0.5);
    expect(index).toBe(1);
    expect(world).toBeNull(); // 재생 입력에는 월드 좌표가 없다
    expect(byEnum).toBe(x); // HandLandmark.INDEX_FINGER_TIP == 8
    expect(typeName).toBe('SolutionOutputs');
  });

  it('process()가 화면에 넘기는 것은 RGBA 바이트(Uint8Array)이고 RGB 순서가 지켜진다', () => {
    if (skipped) return;
    const detect = out.requests.find((request) => request.kind === 'mediapipe.detect')!;
    expect(detect.dataType).toBe('Uint8Array');
    expect(detect.bytes).toBe(detect.width! * detect.height! * 4);
    // BGR (0,0,200) → RGB (200,0,0) → RGBA 첫 픽셀
    expect(detect.firstPixel).toEqual([200, 0, 0, 255]);
  });

  it('손이 없으면 빈 리스트가 아니라 None이다(if result.multi_hand_landmarks: 가 원본과 같게 동작)', () => {
    if (skipped) return;
    expect(out.steps.process_none!.value).toEqual([true, true, false]);
  });

  it('max_num_hands=1이면 한 손만 온다(교안 계단 3~9와 같게)', () => {
    if (skipped) return;
    expect(out.steps.max_num_hands_one!.value).toBe(1);
  });

  it('print(landmark)가 protobuf 글자 형식처럼 보인다(f133)', () => {
    if (skipped) return;
    expect(out.steps.landmark_text!.stdout).toMatch(/^x: [\d.-]+\ny: [\d.-]+\nz: [\d.-]+\n/u);
    expect(out.steps.landmark_text!.stdout).toContain('classification {');
    expect(out.steps.landmark_text!.stdout).toContain('label: "Right"');
  });

  it('회색(2차원) 이미지·닫힌 객체는 한국어 설명이 붙은 오류', () => {
    if (skipped) return;
    expect(out.steps.process_gray!.errorMessage).toContain('Input image must contain three channel rgb data');
    expect(out.steps.process_gray!.errorMessage).toContain('cv2.COLOR_BGR2RGB');
    expect(out.steps.process_closed!.errorMessage).toContain('이미 close()한');
  });

  it('with Hands(...) as hands: 문맥 관리자가 된다(f093·f094 방식)', () => {
    if (skipped) return;
    expect(out.steps.context_manager!.value).toEqual([2, true]);
  });

  it('draw_landmarks가 진짜 cv2로 프레임에 그리고, 위치 인자 4번째=점·5번째=선이다(f131)', () => {
    if (skipped) return;
    const [lineColorPixels, dotColorPixels, drawn, defaultDrawn, withoutDots] = out.steps.draw_landmarks!.value as number[];
    expect(lineColorPixels).toBeGreaterThan(0); // 5번째 인자 색(파랑)으로 그린 이음선
    expect(dotColorPixels).toBeGreaterThan(0); // 4번째 인자 색(초록)으로 그린 점
    expect(drawn).toBeGreaterThan(lineColorPixels + dotColorPixels); // 점의 흰 테두리까지
    expect(defaultDrawn).toBeGreaterThan(0); // 스타일을 안 주면 기본 빨강 점·흰 선
    expect(withoutDots).toBeLessThan(drawn); // landmark_drawing_spec=None이면 점을 안 그림(f093)
  });

  it('draw_landmarks의 첫 인자가 3채널 BGR이 아니면 오류(캔버스 덮개가 아니라 배열에 직접 그린다)', () => {
    if (skipped) return;
    expect(out.steps.draw_bad_image!.errorMessage).toContain('three channel bgr data');
  });

  it('drawing_styles의 손가락별 스타일 표로도 그려진다', () => {
    if (skipped) return;
    expect(out.steps.styles!.value as number).toBeGreaterThan(0);
  });

  it('합성 좌표로 교안 f136(접힌 손가락)이 주먹 00000·편 손 11111로 나온다', () => {
    if (skipped) return;
    expect(out.steps.folded_fingers_fist!.value).toBe('00000');
    expect(out.steps.folded_fingers_open!.value).toBe('11111');
  });

  it('합성 핀치 동작에서 엄지·검지 거리(f032)가 손가락이 닿을 만큼 가까워진다', () => {
    if (skipped) return;
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
    expect(out.importsWithoutNumpy).toBe('0.10.35-apc');
  });

  // ── 얼굴 그물(P2-09) ──

  it('face_mesh 이름 공간·연결표가 레거시와 같다(그물 2,556쌍·윤곽 124쌍·점 468/478, 자세 연결 35쌍)', () => {
    if (skipped) return;
    const value = out.steps.face_import!.value as unknown[];
    expect(value[0]).toBe(true); // from mediapipe.solutions import face_mesh
    expect(value[1]).toBe(2556);
    expect(value[2]).toBe(124);
    expect(value[3]).toBe(468);
    expect(value[4]).toBe(478);
    expect(value[5]).toBe('DrawingSpec'); // 그물 기본 스타일은 DrawingSpec 하나
    expect(value[6]).toBe(124); // 윤곽 스타일은 연결마다 하나씩
    expect(value[7]).toBe(11); // PoseLandmark.LEFT_SHOULDER
    expect(value[8]).toBe(15); // PoseLandmark.LEFT_WRIST
    expect(value[9]).toBe(35); // POSE_CONNECTIONS
  });

  it('FaceMesh(max_num_faces=1).process가 468점을 주고 코(1)는 가운데, 33번 눈은 263번보다 왼쪽이다', () => {
    if (skipped) return;
    const value = out.steps.face_process!.value as unknown[];
    expect(value[0]).toBe(1);
    expect(value[1]).toBe(468); // refine_landmarks=False → 앞 468점만(레거시와 같은 개수)
    expect(value[2]).toBeCloseTo(0.5, 2);
    expect(value[4]).toBe(true);
    expect(value[5]).toBe('SolutionOutputs');
    const request = out.requests.filter((item) => item.solution === 'face_mesh' && item.kind === 'mediapipe.detect')[0];
    expect(request?.dataType).toBe('Uint8Array');
    expect(request?.bytes).toBe(480 * 640 * 4);
  });

  it('refine_landmarks=True면 눈동자까지 478점이고 with 문으로 닫힌다', () => {
    if (skipped) return;
    expect(out.steps.face_refine!.value).toEqual([478, true, true]);
    const opened = out.requests.filter((item) => item.kind === 'mediapipe.open' && item.solution === 'face_mesh');
    expect(opened.some((item) => item.options?.refineLandmarks === true)).toBe(true);
    expect(opened.some((item) => item.options?.refineLandmarks === false)).toBe(true);
  });

  it('refine_landmarks 없이 468번을 찾으면 레거시처럼 IndexError가 난다(교과서 f094 재현)', () => {
    if (skipped) return;
    expect(out.steps.face_index_error!.errorType).toBe('IndexError');
  });

  it('얼굴을 못 찾으면 multi_face_landmarks가 None이다(빈 리스트가 아니다)', () => {
    if (skipped) return;
    expect(out.steps.face_none!.value).toEqual([true, false]);
  });

  it('draw_landmarks가 FACEMESH_TESSELATION·FACEMESH_CONTOURS를 진짜 cv2로 그린다', () => {
    if (skipped) return;
    const [mesh, contours] = out.steps.face_draw!.value as number[];
    expect(mesh).toBeGreaterThan(10_000); // 그물 2,556선
    expect(contours).toBeGreaterThan(500);
    expect(contours).toBeLessThan(mesh);
  });

  it('입을 벌린 장에서는 교과서 1-3-2 심화(f037)의 MAR가 0.4를 넘는다', () => {
    if (skipped) return;
    expect(out.steps.face_yawn_mar!.value as number).toBeGreaterThan(0.4);
  });

  // ── 얼굴 검출(P2-09) ──

  it('FaceDetection이 0~1 상자와 점 6개를 주고 draw_detection이 상자를 그린다', () => {
    if (skipped) return;
    const value = out.steps.face_detection!.value as unknown[];
    expect(value[0]).toBe(1);
    for (const index of [1, 2, 3, 4]) {
      expect(value[index] as number).toBeGreaterThan(0);
      expect(value[index] as number).toBeLessThanOrEqual(1);
    }
    expect(value[5] as number).toBeGreaterThan(0.5); // score[0]
    expect(value[6]).toBe(6); // relative_keypoints
    expect(value[7] as number).toBeCloseTo(0.5, 1); // 코끝 x
    expect(value[8]).toBe(true); // 상자가 그려졌다
  });

  it('얼굴을 못 찾으면 detections가 None이다(f085가 쓰는 판정)', () => {
    if (skipped) return;
    expect(out.steps.face_detection_none!.value).toEqual([true, false]);
  });

  // ── 자세(P2-09) ──

  it('Pose().process가 한 사람 33점을 주고 PoseLandmark 번호·visibility가 레거시와 같다', () => {
    if (skipped) return;
    const value = out.steps.pose_process!.value as unknown[];
    expect(value[0]).toBe(33);
    expect(value[1] as number).toBeLessThan(0.3); // 손 들기 장의 LEFT_WRIST.y — 교과서 f041의 Success! 조건
    expect(value[2] as number).toBeGreaterThan(0.4); // LEFT_SHOULDER.y
    expect(value[3] as number).toBeLessThan(0.5); // 화면 밖 무릎의 visibility
    expect(value[4]).toBe(true); // HasField('visibility')
    expect(value[5]).toBe(true); // pose_world_landmarks는 재생 입력에서 None
    expect(value[6]).toBe(true); // segmentation_mask None
    expect(value[7]).toBe('NormalizedLandmarkList'); // 단수 객체(여러 사람 목록이 아니다)
  });

  it('사람을 못 찾으면 pose_landmarks가 None이다', () => {
    if (skipped) return;
    expect(out.steps.pose_none!.value).toEqual([true, false]);
  });

  it('draw_landmarks가 visibility 0.5 미만인 점과 그 선을 건너뛴다(레거시 규칙)', () => {
    if (skipped) return;
    const [drawn, hidden, all] = out.steps.pose_draw!.value as number[];
    expect(drawn).toBeGreaterThan(1000);
    expect(hidden).toBeLessThan(drawn!); // 팔꿈치를 잘 안 보이게 하면 점·선이 줄어든다
    expect(all).toBe(drawn); // 화면 밖(0~1 밖) 다리는 visibility를 올려도 그려지지 않는다
  });

  it('model_complexity가 화면에 그대로 전해지고 2(heavy)는 한국어로 알린다(PD-20), 3은 오류다', () => {
    if (skipped) return;
    const opens = out.requests.filter((item) => item.kind === 'mediapipe.open' && item.solution === 'pose');
    expect(opens.map((item) => item.options?.modelComplexity)).toContain(2);
    expect(opens.map((item) => item.options?.modelComplexity)).toContain(0);
    expect(out.notices.some((text) => text.includes('30MB') && text.includes('model_complexity=1'))).toBe(true);
    expect(out.steps.pose_bad_arg!.errorType).toBe('ValueError');
    expect(out.steps.pose_bad_arg!.errorMessage).toContain('0·1·2');
  });
});

describe.skipIf(!pyodideInstalled || !nodeHasJspi || !fixtureExists)('mediapipe 흉내 모듈 — 제한 모드(JSPI 없음)', () => {
  const out = run(false);

  it('JSPI 없이도 import·상수는 그대로 되고 process()는 손 없음(None)으로 답하며 한국어로 안내한다', () => {
    if (out.skipped) return;
    expect(out.jspi).toBe(false);
    expect((out.steps.import!.value as unknown[])[1]).toBe(8);
    expect(out.steps.limited_process!.value).toEqual(['limited', true]);
    expect(out.notices.some((text) => text.includes('JSPI') && text.includes('process()'))).toBe(true);
  });
});
