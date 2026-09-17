// Node.js에서 실제 Pyodide 314.0.7 + opencv-python으로 mediapipe 흉내 모듈의 파이썬 쪽(src/lab/modules/mediapipe/{mediapipe,apc_mediapipe}.py)을
// 검사하는 도우미 스크립트(PLAN §8.2 P2-08, src/lab/README.md 4.6절). tests/unit/mediapipe/pyodide-mediapipe.test.ts가
// `node [--experimental-wasm-jspi|--no-experimental-wasm-jspi] 이 파일 <저장소 뿌리>`로 띄우고 마지막 줄의 JSON 한 줄을 읽는다.
//
// 워커(src/lab/runtime/worker.ts)와 같은 순서로 준비한다: 다리 등록 → 붙박이 .py와 모듈 폴더의 .py를 /apc에 쓰기 → apc_runtime.install()
// → apc_shims.register_shims(모듈 폴더 표) → 실행마다 install_available()·reset_for_run().
// 화면 흉내: 'mediapipe.open'에는 {ok, engine}으로, 'mediapipe.detect'에는 tests/fixtures/landmarks/hands.json의 합성 손 좌표로 답한다
// (PD-30 — 사람 손 데이터가 아니라 코드가 만든 좌표라 테스트에 그대로 쓴다).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { finishJson } from '../../helpers/finish-json.mjs';

const rootDir = process.argv[2] ?? process.cwd();
const cacheDir = path.join(rootDir, '.cache', 'pyodide-packages');
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);
const { createBridge } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'bridge.ts')).href);

const fixture = JSON.parse(fs.readFileSync(path.join(rootDir, 'tests', 'fixtures', 'landmarks', 'hands.json'), 'utf8'));
const sequenceOf = (id) => fixture.sequences.find((sequence) => sequence.id === id);
/** 합성 손 한 장 → 화면이 파이썬에 주는 답(index.ts의 detectedFromSynthetic과 같은 모양) */
const replyHands = (frame, limit = 2) =>
  frame.hands.slice(0, limit).map((hand) => ({ landmarks: hand.landmarks.map((point) => [...point]), worldLandmarks: null, handedness: { ...hand.handedness } }));

// 얼굴·자세는 한 장이 커서 픽스처에 전부 적지 않고(얼굴 478점) 생성기를 그대로 불러 쓴다(Node 24는 .ts를 실행한다).
const faceModule = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'modules', 'mediapipe', 'synthetic-face.ts')).href);
const poseModule = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'modules', 'mediapipe', 'synthetic-pose.ts')).href);
const faceSequence = (id) => faceModule.generateFaceSequence(id);
const poseSequence = (id) => poseModule.generatePoseSequence(id);
/** 합성 얼굴 한 장 → 답(index.ts의 facesFromSynthetic과 같은 모양) */
const replyFaces = (frame) => frame.faces.map((face) => face.landmarks.map((point) => [...point]));
const replyPoses = (frame) => frame.poses.map((body) => body.landmarks.map((point) => [...point]));
/** 합성 얼굴 → 얼굴 검출 답(index.ts의 detectionsFromSynthetic과 같은 모양) */
const replyDetections = (frame) =>
  frame.faces.map((face) => ({
    score: face.score,
    box: { ...face.box },
    keypoints: [468, 473, 1, 13, 234, 454].map((index) => [face.landmarks[index][0], face.landmarks[index][1]]),
  }));

const out = { steps: {}, events: [], notices: [], requests: [], files: [] };

function isRethrownRunError(error) {
  return Boolean(error) && typeof error.type === 'string' && (error.type === 'SystemExit' || error.type === 'KeyboardInterrupt');
}
process.on('uncaughtException', (error) => {
  if (isRethrownRunError(error)) return;
  console.error(error);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  if (isRethrownRunError(reason)) return;
  console.error(reason);
  process.exit(1);
});

function finish() {
  // 결과 JSON이 파이프 버퍼(64KB)보다 크면 다 나가기 전에 끝나 버린다 → 공통 함수로 기다린 뒤 끝낸다.
  finishJson(out);
}

fs.mkdirSync(cacheDir, { recursive: true });
const pyodide = await loadPyodide({ packageCacheDir: cacheDir });
try {
  await pyodide.loadPackage('opencv-python');
} catch (error) {
  out.skipped = `opencv-python 휠을 받지 못했어요(네트워크?): ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
  finish();
}

let jspi = false;
let stdout = '';
/** 다음 mediapipe.detect 요청에 줄 답. null·빈 목록이면 "못 찾음"이다. */
let nextHands = [];
let nextFaces = [];
let nextPoses = [];
let nextDetections = [];
let detectSource = 'replay';

const bridge = createBridge({
  post: (message) => {
    if (message.type === 'request') {
      const payload = message.payload;
      if (message.kind === 'mediapipe.open') {
        out.requests.push({ kind: message.kind, solution: payload.solution, id: payload.id, options: { ...payload.options } });
        setTimeout(() => bridge.resolveRequest(message.requestId, { ok: true, engine: 'replay', message: null }), 2);
      } else if (message.kind === 'mediapipe.detect') {
        const data = payload.data;
        out.requests.push({
          kind: message.kind,
          solution: payload.solution,
          id: payload.id,
          width: payload.width,
          height: payload.height,
          dataType: data ? data.constructor.name : typeof data,
          bytes: data ? data.byteLength : 0,
          // RGBA 첫 픽셀(파이썬이 넘긴 RGB 순서가 지켜지는지)
          firstPixel: data ? [data[0], data[1], data[2], data[3]] : null,
        });
        // solution마다 답의 모양이 다르다(index.ts와 같게)
        const answer =
          payload.solution === 'face_mesh'
            ? { ok: true, faces: nextFaces ?? [], source: detectSource }
            : payload.solution === 'face_detection'
              ? { ok: true, detections: nextDetections ?? [], source: detectSource }
              : payload.solution === 'pose'
                ? { ok: true, poses: nextPoses ?? [], poseWorlds: null, source: detectSource }
                : { ok: true, hands: nextHands ?? [], source: detectSource };
        setTimeout(() => bridge.resolveRequest(message.requestId, answer), 2);
      } else {
        setTimeout(() => bridge.rejectRequest(message.requestId, `화면이 "${message.kind}" 요청을 처리하지 못해요.`), 2);
      }
    } else if (message.type === 'event') {
      out.events.push({ kind: message.kind });
    } else if (message.type === 'notice') {
      out.notices.push(message.text);
    }
  },
  now: () => performance.now(),
  canRunSync: () => jspi,
});
pyodide.setStdout({
  write: (buffer) => {
    stdout += new TextDecoder().decode(buffer);
    return buffer.length;
  },
});
pyodide.registerJsModule('_apc_bridge', bridge.api);
pyodide.FS.mkdirTree('/apc');

// 붙박이 + 모듈 폴더의 .py (src/lab/python/modules.ts와 같은 규칙)
const pythonFiles = new Map();
for (const file of fs.readdirSync(path.join(rootDir, 'src', 'lab', 'python'))) {
  if (file.endsWith('.py')) pythonFiles.set(file, path.join(rootDir, 'src', 'lab', 'python', file));
}
const modulesDir = path.join(rootDir, 'src', 'lab', 'modules');
for (const folder of fs.readdirSync(modulesDir, { withFileTypes: true })) {
  if (!folder.isDirectory()) continue;
  for (const file of fs.readdirSync(path.join(modulesDir, folder.name))) {
    if (!file.endsWith('.py')) continue;
    if (pythonFiles.has(file)) {
      out.duplicate = file;
      finish();
    }
    pythonFiles.set(file, path.join(modulesDir, folder.name, file));
  }
}
for (const [file, fullPath] of pythonFiles) {
  pyodide.FS.writeFile(`/apc/${file}`, fs.readFileSync(fullPath, 'utf8'));
  out.files.push(file);
}
out.files.sort();

jspi = await pyodide.runPythonAsync(
  ['import sys', "sys.path.insert(0, '/apc')", 'import apc_runtime', 'apc_runtime.install()', 'from pyodide.ffi import can_run_sync', 'can_run_sync()'].join('\n'),
);
bridge.setLimited(!jspi);
out.jspi = jspi;

// 워커가 하는 일: 모듈 폴더의 shims 표를 등록한다(src/lab/modules/mediapipe/manifest.ts의 shims와 같은 값)
out.shimTable = pyodide.runPython("import json, apc_shims\njson.dumps(apc_shims.register_shims({'mediapipe': 'apc_mediapipe'}))");

async function step(name, code, { setup, hands, limit, faces, poses, detections } = {}) {
  stdout = '';
  nextHands = hands === undefined ? replyHands(sequenceOf('two-hands').frames[0], limit ?? 2) : hands;
  nextFaces = faces === undefined ? replyFaces(faceSequence('face-turn').frames[0]) : faces;
  nextPoses = poses === undefined ? replyPoses(poseSequence('pose-raise').frames[0]) : poses;
  nextDetections = detections === undefined ? replyDetections(faceSequence('face-turn').frames[0]) : detections;
  const requestsBefore = out.requests.length;
  const record = { ms: 0, stdout: '' };
  const startedAt = performance.now();
  bridge.beginRun();
  pyodide.runPython('import apc_shims\napc_shims.install_available()');
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  if (setup) setup();
  try {
    const globals = pyodide.toPy({ __name__: '__main__' });
    try {
      const value = await pyodide.runPythonAsync(code, { globals, filename: 'main.py' });
      record.value = value && typeof value.toJs === 'function' ? value.toJs({ dict_converter: Object.fromEntries }) : value;
    } finally {
      globals.destroy();
    }
  } catch (error) {
    record.errorType = error && error.type ? error.type : 'JsError';
    record.errorMessage = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
  } finally {
    bridge.endRun();
  }
  record.ms = Math.round(performance.now() - startedAt);
  record.stdout = stdout;
  record.requests = out.requests.slice(requestsBefore).map((request) => request.kind);
  out.steps[name] = record;
}

// ── 어느 모드에서나 되는 것: import·상수·기본값 ──
await step(
  'import',
  [
    'import mediapipe as mp',
    'from mediapipe.solutions import drawing_utils as du',
    'import mediapipe.solutions.hands as hands_module',
    'mp_hands = mp.solutions.hands',
    '[',
    '  mp.__version__,',
    '  int(mp_hands.HandLandmark.INDEX_FINGER_TIP),',
    '  int(mp_hands.HandLandmark.THUMB_TIP),',
    '  len(mp_hands.HAND_CONNECTIONS),',
    '  sorted(sorted(pair) for pair in mp_hands.HAND_CONNECTIONS)[:3],',
    '  du is mp.solutions.drawing_utils,',
    '  hands_module is mp_hands,',
    '  type(mp.solutions.drawing_styles.get_default_hand_landmarks_style()[0]).__name__,',
    ']',
  ].join('\n'),
);
await step('missing_submodule', 'import mediapipe.tasks');
await step(
  'drawing_spec_defaults',
  [
    'import mediapipe as mp',
    'du = mp.solutions.drawing_utils',
    'spec = du.DrawingSpec()',
    'custom = du.DrawingSpec(color=(166, 151, 18), thickness=3)',
    '[list(spec.color), spec.thickness, spec.circle_radius, list(custom.color), custom.thickness, custom.circle_radius, list(du.RED_COLOR), list(du.WHITE_COLOR)]',
  ].join('\n'),
);

if (jspi) {
  // ── Hands(...) 인자 → 화면에 보내는 옵션 ──
  await step('open_default', 'import mediapipe as mp\nhands = mp.solutions.hands.Hands()\nhands.engine');
  await step(
    'open_named',
    'import mediapipe as mp\nhands = mp.solutions.hands.Hands(static_image_mode=True, max_num_hands=3, min_detection_confidence=0.7, min_tracking_confidence=0.3)\nhands.engine',
  );
  await step('open_bad_arg', 'import mediapipe as mp\nmp.solutions.hands.Hands(max_num_hands=0)');

  // ── process() 결과 객체 모양(레거시와 같게) ──
  await step(
    'process_two_hands',
    [
      'import cv2, numpy as np, mediapipe as mp',
      'hands = mp.solutions.hands.Hands()',
      'frame = np.zeros((48, 64, 3), dtype=np.uint8)',
      'frame[:, :, 2] = 200',  // BGR의 빨강 → RGB로 바꾸면 R이 200
      'rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)',
      'result = hands.process(rgb)',
      'hand = result.multi_hand_landmarks[0]',
      '[',
      '  len(result.multi_hand_landmarks),',
      '  len(hand.landmark),',
      '  round(hand.landmark[8].x, 4), round(hand.landmark[8].y, 4), round(hand.landmark[8].z, 4),',
      '  result.multi_handedness[0].classification[0].label,',
      '  result.multi_handedness[1].classification[0].label,',
      '  round(result.multi_handedness[0].classification[0].score, 2),',
      '  result.multi_handedness[0].classification[0].index,',
      '  result.multi_hand_world_landmarks,',
      '  round(hand.landmark[mp.solutions.hands.HandLandmark.INDEX_FINGER_TIP].x, 4),',
      '  type(result).__name__,',
      ']',
    ].join('\n'),
  );
  await step(
    'process_none',
    [
      'import numpy as np, mediapipe as mp',
      'hands = mp.solutions.hands.Hands()',
      'result = hands.process(np.zeros((8, 8, 3), dtype=np.uint8))',
      '[result.multi_hand_landmarks is None, result.multi_handedness is None, bool(result.multi_hand_landmarks)]',
    ].join('\n'),
    { hands: [] },
  );
  await step(
    'max_num_hands_one',
    [
      'import numpy as np, mediapipe as mp',
      'hands = mp.solutions.hands.Hands(max_num_hands=1)',
      'result = hands.process(np.zeros((8, 8, 3), dtype=np.uint8))',
      'len(result.multi_hand_landmarks)',
    ].join('\n'),
    { limit: 1 },
  );
  await step(
    'landmark_text',
    [
      'import numpy as np, mediapipe as mp',
      'hands = mp.solutions.hands.Hands()',
      'result = hands.process(np.zeros((8, 8, 3), dtype=np.uint8))',
      'print(result.multi_hand_landmarks[0].landmark[0])',
      'print(result.multi_handedness[0])',
      '"ok"',
    ].join('\n'),
  );

  // ── 잘못된 입력·닫힌 객체 ──
  await step(
    'process_gray',
    'import numpy as np, mediapipe as mp\nhands = mp.solutions.hands.Hands()\nhands.process(np.zeros((8, 8), dtype=np.uint8))',
  );
  await step(
    'process_closed',
    'import numpy as np, mediapipe as mp\nhands = mp.solutions.hands.Hands()\nhands.close()\nhands.process(np.zeros((8, 8, 3), dtype=np.uint8))',
  );
  await step(
    'context_manager',
    [
      'import numpy as np, mediapipe as mp',
      'with mp.solutions.hands.Hands(max_num_hands=1) as hands:',
      '    result = hands.process(np.zeros((8, 8, 3), dtype=np.uint8))',
      '[len(result.multi_hand_landmarks), hands._closed]',
    ].join('\n'),
  );

  // ── draw_landmarks: 진짜 cv2로 프레임에 그린다(위치 인자 4번째 점·5번째 선 — 교안 계단 4 f131) ──
  await step(
    'draw_landmarks',
    [
      'import numpy as np, mediapipe as mp',
      'mp_hands = mp.solutions.hands',
      'du = mp.solutions.drawing_utils',
      'hands = mp_hands.Hands(max_num_hands=1)',
      'frame = np.zeros((240, 320, 3), dtype=np.uint8)',
      'result = hands.process(np.zeros((240, 320, 3), dtype=np.uint8))',
      'hand = result.multi_hand_landmarks[0]',
      'line_style = du.DrawingSpec(color=(255, 0, 0), thickness=3)',
      'circle_style = du.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=3)',
      'du.draw_landmarks(frame, hand, mp_hands.HAND_CONNECTIONS, circle_style, line_style)',
      'blue = int(np.count_nonzero((frame[:, :, 0] > 200) & (frame[:, :, 1] < 50) & (frame[:, :, 2] < 50)))',
      'green = int(np.count_nonzero((frame[:, :, 1] > 200) & (frame[:, :, 0] < 50) & (frame[:, :, 2] < 50)))',
      'drawn = int(np.count_nonzero(frame.any(axis=2)))',
      'empty = np.zeros((240, 320, 3), dtype=np.uint8)',
      'du.draw_landmarks(empty, hand, mp_hands.HAND_CONNECTIONS)',
      'default_drawn = int(np.count_nonzero(empty.any(axis=2)))',
      'no_dots = np.zeros((240, 320, 3), dtype=np.uint8)',
      'du.draw_landmarks(no_dots, hand, mp_hands.HAND_CONNECTIONS, None, line_style)',
      '[blue, green, drawn, default_drawn, int(np.count_nonzero(no_dots.any(axis=2)))]',
    ].join('\n'),
    { limit: 1 },
  );
  await step(
    'draw_bad_image',
    [
      'import numpy as np, mediapipe as mp',
      'hands = mp.solutions.hands.Hands(max_num_hands=1)',
      'result = hands.process(np.zeros((16, 16, 3), dtype=np.uint8))',
      'mp.solutions.drawing_utils.draw_landmarks(np.zeros((16, 16), dtype=np.uint8), result.multi_hand_landmarks[0])',
    ].join('\n'),
    { limit: 1 },
  );
  await step(
    'styles',
    [
      'import numpy as np, mediapipe as mp',
      'mp_hands = mp.solutions.hands',
      'du = mp.solutions.drawing_utils',
      'styles = mp.solutions.drawing_styles',
      'hands = mp_hands.Hands(max_num_hands=1)',
      'result = hands.process(np.zeros((240, 320, 3), dtype=np.uint8))',
      'frame = np.zeros((240, 320, 3), dtype=np.uint8)',
      'du.draw_landmarks(frame, result.multi_hand_landmarks[0], mp_hands.HAND_CONNECTIONS, styles.get_default_hand_landmarks_style(), styles.get_default_hand_connections_style())',
      'int(np.count_nonzero(frame.any(axis=2)))',
    ].join('\n'),
    { limit: 1 },
  );

  // ── 교안 f136(계단 9) 접힌 손가락 판별이 합성 좌표에서 뜻대로 나온다 ──
  const countSequence = sequenceOf('count');
  await step(
    'folded_fingers_fist',
    [
      'import numpy as np, mediapipe as mp',
      'hands = mp.solutions.hands.Hands(max_num_hands=1)',
      'result = hands.process(np.zeros((8, 8, 3), dtype=np.uint8))',
      'h1 = result.multi_hand_landmarks[0].landmark',
      'compare = [(2, 4, 17), (5, 8, 0), (9, 12, 0), (13, 16, 0), (17, 20, 0)]',
      'folding = ""',
      'for mcp, tip, comp in compare:',
      '    tip_dist = (h1[comp].x - h1[tip].x) ** 2 + (h1[comp].y - h1[tip].y) ** 2',
      '    mcp_dist = (h1[comp].x - h1[mcp].x) ** 2 + (h1[comp].y - h1[mcp].y) ** 2',
      '    folding += "01"[tip_dist > mcp_dist]',
      'folding',
    ].join('\n'),
    { hands: replyHands(countSequence.frames[0], 1) },
  );
  await step(
    'folded_fingers_open',
    [
      'import numpy as np, mediapipe as mp',
      'hands = mp.solutions.hands.Hands(max_num_hands=1)',
      'result = hands.process(np.zeros((8, 8, 3), dtype=np.uint8))',
      'h1 = result.multi_hand_landmarks[0].landmark',
      'compare = [(2, 4, 17), (5, 8, 0), (9, 12, 0), (13, 16, 0), (17, 20, 0)]',
      'folding = ""',
      'for mcp, tip, comp in compare:',
      '    tip_dist = (h1[comp].x - h1[tip].x) ** 2 + (h1[comp].y - h1[tip].y) ** 2',
      '    mcp_dist = (h1[comp].x - h1[mcp].x) ** 2 + (h1[comp].y - h1[mcp].y) ** 2',
      '    folding += "01"[tip_dist > mcp_dist]',
      'folding',
    ].join('\n'),
    { hands: replyHands(countSequence.frames[countSequence.frames.length - 1], 1) },
  );

  // ── 교과서 f032(1-2-3) 엄지·검지 거리: 핀치 동작에서 가까워진다 ──
  const pinchFrames = sequenceOf('pinch').frames;
  const closest = pinchFrames.reduce((best, frame, index) => {
    const [tx, ty] = frame.hands[0].landmarks[4];
    const [ix, iy] = frame.hands[0].landmarks[8];
    const distance = Math.hypot(tx - ix, ty - iy);
    return distance < best.distance ? { index, distance } : best;
  }, { index: 0, distance: Infinity });
  await step(
    'pinch_distance',
    [
      'import math, numpy as np, mediapipe as mp',
      'hands = mp.solutions.hands.Hands()',
      'result = hands.process(np.zeros((480, 640, 3), dtype=np.uint8))',
      'hand = result.multi_hand_landmarks[0]',
      'thumb, index = hand.landmark[4], hand.landmark[8]',
      'int(math.hypot((index.x - thumb.x) * 640, (index.y - thumb.y) * 480))',
    ].join('\n'),
    { hands: replyHands(pinchFrames[closest.index], 1) },
  );

  // ── 얼굴 그물(FaceMesh) ──
  const yawnFrames = faceSequence('face-yawn').frames;
  const gapOf = (frame) => frame.faces[0].landmarks[14][1] - frame.faces[0].landmarks[13][1];
  const openFrame = yawnFrames.reduce((best, frame) => (gapOf(frame) > gapOf(best) ? frame : best), yawnFrames[0]);
  await step(
    'face_import',
    [
      'import mediapipe as mp',
      'from mediapipe.solutions import face_mesh as fm',
      'styles = mp.solutions.drawing_styles',
      '[',
      '  fm is mp.solutions.face_mesh,',
      '  len(mp.solutions.face_mesh.FACEMESH_TESSELATION),',
      '  len(mp.solutions.face_mesh.FACEMESH_CONTOURS),',
      '  mp.solutions.face_mesh.FACEMESH_NUM_LANDMARKS,',
      '  mp.solutions.face_mesh.FACEMESH_NUM_LANDMARKS_WITH_IRISES,',
      '  type(styles.get_default_face_mesh_tesselation_style()).__name__,',
      '  len(styles.get_default_face_mesh_contours_style()),',
      '  int(mp.solutions.pose.PoseLandmark.LEFT_SHOULDER),',
      '  int(mp.solutions.pose.PoseLandmark.LEFT_WRIST),',
      '  len(mp.solutions.pose.POSE_CONNECTIONS),',
      ']',
    ].join('\n'),
  );
  await step(
    'face_process',
    [
      'import numpy as np, mediapipe as mp',
      'face = mp.solutions.face_mesh.FaceMesh(max_num_faces=1)',
      'result = face.process(np.zeros((480, 640, 3), dtype=np.uint8))',
      'lm = result.multi_face_landmarks[0]',
      '[',
      '  len(result.multi_face_landmarks),',
      '  len(lm.landmark),',
      '  round(lm.landmark[1].x, 4), round(lm.landmark[1].y, 4),',
      '  round(lm.landmark[33].x, 4) < round(lm.landmark[263].x, 4),',
      '  type(result).__name__,',
      ']',
    ].join('\n'),
  );
  await step(
    'face_refine',
    [
      'import numpy as np, mediapipe as mp',
      'with mp.solutions.face_mesh.FaceMesh(refine_landmarks=True) as face:',
      '    result = face.process(np.zeros((16, 16, 3), dtype=np.uint8))',
      'lm = result.multi_face_landmarks[0]',
      '[len(lm.landmark), round(lm.landmark[473].x, 4) > round(lm.landmark[468].x, 4), face._closed]',
    ].join('\n'),
  );
  await step(
    'face_index_error',
    [
      'import numpy as np, mediapipe as mp',
      'face = mp.solutions.face_mesh.FaceMesh(max_num_faces=1)',
      'result = face.process(np.zeros((16, 16, 3), dtype=np.uint8))',
      'result.multi_face_landmarks[0].landmark[468]',
    ].join('\n'),
  );
  await step(
    'face_none',
    [
      'import numpy as np, mediapipe as mp',
      'face = mp.solutions.face_mesh.FaceMesh()',
      'result = face.process(np.zeros((8, 8, 3), dtype=np.uint8))',
      '[result.multi_face_landmarks is None, bool(result.multi_face_landmarks)]',
    ].join('\n'),
    { faces: [] },
  );
  await step(
    'face_draw',
    [
      'import numpy as np, mediapipe as mp',
      'mp_face = mp.solutions.face_mesh',
      'du = mp.solutions.drawing_utils',
      'face = mp_face.FaceMesh(refine_landmarks=True)',
      'result = face.process(np.zeros((480, 640, 3), dtype=np.uint8))',
      'lm = result.multi_face_landmarks[0]',
      'line_style = du.DrawingSpec(color=(166, 151, 18), thickness=3)',
      'circle_style = du.DrawingSpec(color=(166, 114, 81), thickness=2)',
      'frame = np.zeros((480, 640, 3), dtype=np.uint8)',
      'du.draw_landmarks(frame, lm, mp_face.FACEMESH_TESSELATION, line_style, circle_style)',
      'mesh = int(np.count_nonzero(frame.any(axis=2)))',
      'contours = np.zeros((480, 640, 3), dtype=np.uint8)',
      'du.draw_landmarks(contours, lm, mp_face.FACEMESH_CONTOURS, None, mp.solutions.drawing_styles.get_default_face_mesh_contours_style())',
      '[mesh, int(np.count_nonzero(contours.any(axis=2)))]',
    ].join('\n'),
  );
  await step(
    'face_yawn_mar',
    [
      'import math, numpy as np, mediapipe as mp',
      'face = mp.solutions.face_mesh.FaceMesh(max_num_faces=1)',
      'result = face.process(np.zeros((480, 640, 3), dtype=np.uint8))',
      'lm = result.multi_face_landmarks[0].landmark',
      'pts = [(int(lm[i].x * 640), int(lm[i].y * 480)) for i in [13, 14, 19, 18, 78, 308]]',
      'd = lambda a, b: math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)',
      'round((d(pts[0], pts[2]) + d(pts[1], pts[3])) / (2.0 * d(pts[4], pts[5])), 3)',
    ].join('\n'),
    { faces: replyFaces(openFrame) },
  );

  // ── 얼굴 검출(FaceDetection) ──
  await step(
    'face_detection',
    [
      'import numpy as np, mediapipe as mp',
      'detector = mp.solutions.face_detection.FaceDetection(min_detection_confidence=0.5)',
      'result = detector.process(np.zeros((480, 640, 3), dtype=np.uint8))',
      'box = result.detections[0].location_data.relative_bounding_box',
      'key = mp.solutions.face_detection.get_key_point(result.detections[0], mp.solutions.face_detection.FaceKeyPoint.NOSE_TIP)',
      'frame = np.zeros((480, 640, 3), dtype=np.uint8)',
      'mp.solutions.drawing_utils.draw_detection(frame, result.detections[0])',
      '[',
      '  len(result.detections),',
      '  round(box.xmin, 3), round(box.ymin, 3), round(box.width, 3), round(box.height, 3),',
      '  round(result.detections[0].score[0], 2),',
      '  len(result.detections[0].location_data.relative_keypoints),',
      '  round(key[0], 3),',
      '  int(np.count_nonzero(frame.any(axis=2))) > 100,',
      ']',
    ].join('\n'),
  );
  await step(
    'face_detection_none',
    [
      'import numpy as np, mediapipe as mp',
      'detector = mp.solutions.face_detection.FaceDetection()',
      'result = detector.process(np.zeros((8, 8, 3), dtype=np.uint8))',
      '[result.detections is None, bool(result.detections)]',
    ].join('\n'),
    { detections: [] },
  );

  // ── 자세(Pose) ──
  const raiseFrames = poseSequence('pose-raise').frames;
  const raisedFrame = raiseFrames.reduce((best, frame) => (frame.poses[0].landmarks[15][1] < best.poses[0].landmarks[15][1] ? frame : best), raiseFrames[0]);
  await step(
    'pose_process',
    [
      'import numpy as np, mediapipe as mp',
      'mp_pose = mp.solutions.pose',
      'pose = mp_pose.Pose()',
      'result = pose.process(np.zeros((480, 640, 3), dtype=np.uint8))',
      'lm = result.pose_landmarks.landmark',
      '[',
      '  len(lm),',
      '  round(lm[mp_pose.PoseLandmark.LEFT_WRIST.value].y, 3),',
      '  round(lm[mp_pose.PoseLandmark.LEFT_SHOULDER].y, 3),',
      '  round(lm[25].visibility, 2),',
      '  lm[11].HasField("visibility"),',
      '  result.pose_world_landmarks is None,',
      '  result.segmentation_mask is None,',
      '  type(result.pose_landmarks).__name__,',
      ']',
    ].join('\n'),
    { poses: replyPoses(raisedFrame) },
  );
  await step(
    'pose_none',
    [
      'import numpy as np, mediapipe as mp',
      'pose = mp.solutions.pose.Pose()',
      'result = pose.process(np.zeros((8, 8, 3), dtype=np.uint8))',
      '[result.pose_landmarks is None, bool(result.pose_landmarks)]',
    ].join('\n'),
    { poses: [] },
  );
  await step(
    'pose_draw',
    [
      'import numpy as np, mediapipe as mp',
      'mp_pose = mp.solutions.pose',
      'du = mp.solutions.drawing_utils',
      'pose = mp_pose.Pose()',
      'result = pose.process(np.zeros((480, 640, 3), dtype=np.uint8))',
      'frame = np.zeros((480, 640, 3), dtype=np.uint8)',
      'du.draw_landmarks(frame, result.pose_landmarks, mp_pose.POSE_CONNECTIONS)',
      'drawn = int(np.count_nonzero(frame.any(axis=2)))',
      '# visibility가 0.5보다 작은 점과 그 점에 닿은 선은 그리지 않는다(레거시 규칙): 화면 안의 왼쪽 팔꿈치를 잘 안 보이게 해 본다',
      'result.pose_landmarks.landmark[mp_pose.PoseLandmark.LEFT_ELBOW].visibility = 0.2',
      'hidden = np.zeros((480, 640, 3), dtype=np.uint8)',
      'du.draw_landmarks(hidden, result.pose_landmarks, mp_pose.POSE_CONNECTIONS)',
      '# 화면 밖(0~1 밖) 다리는 visibility를 1로 올려도 그려지지 않는다(정규화 좌표 규칙)',
      'for point in result.pose_landmarks.landmark:',
      '    point.visibility = 1.0',
      'more = np.zeros((480, 640, 3), dtype=np.uint8)',
      'du.draw_landmarks(more, result.pose_landmarks, mp_pose.POSE_CONNECTIONS)',
      '[drawn, int(np.count_nonzero(hidden.any(axis=2))), int(np.count_nonzero(more.any(axis=2)))]',
    ].join('\n'),
    { poses: replyPoses(raiseFrames[0]) },
  );
  await step(
    'pose_complexity',
    [
      'import mediapipe as mp',
      'pose = mp.solutions.pose.Pose(model_complexity=2, smooth_landmarks=False)',
      'lite = mp.solutions.pose.Pose(model_complexity=0)',
      '[pose.engine, lite.engine]',
    ].join('\n'),
  );
  await step('pose_bad_arg', 'import mediapipe as mp\nmp.solutions.pose.Pose(model_complexity=3)');

} else {
  // ── 제한 모드(JSPI 없음): 기다릴 수 없으니 손 없음으로 답하고 한국어로 한 번 안내한다 ──
  await step(
    'limited_process',
    [
      'import numpy as np, mediapipe as mp',
      'hands = mp.solutions.hands.Hands()',
      'result = hands.process(np.zeros((8, 8, 3), dtype=np.uint8))',
      '[hands.engine, result.multi_hand_landmarks is None]',
    ].join('\n'),
  );
}

// ── 동기 진입점 규칙(PROGRESS 미해결 25번): 마지막 양보 뒤 16ms가 지난 뒤 동기 runPython으로 실행 준비를 불러도 스택 전환 오류가 없어야 한다 ──
await new Promise((resolve) => setTimeout(resolve, 40));
try {
  pyodide.runPython('import apc_shims\napc_shims.install_available()');
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  out.syncEntrypointReset = 'ok';
} catch (error) {
  out.syncEntrypointReset = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
}
// install()은 멱등이어야 한다(두 번 불러도 초기화 함수가 한 번만 등록된다)
out.installIdempotent = pyodide.runPython(
  ['import apc_mediapipe, apc_runtime', 'apc_mediapipe.install()', 'apc_mediapipe.install()', 'apc_runtime._reset_hooks.count(apc_mediapipe._reset)'].join('\n'),
);
// numpy 없이도 import되는지(install()은 패키지를 받기 전에도 불린다)
out.importsWithoutNumpy = pyodide.runPython(
  [
    'import importlib, sys',
    'saved = sys.modules.pop("apc_mediapipe", None)',
    '# sys.modules[이름] = None 이면 그 이름의 import가 ImportError가 된다(numpy를 아직 받지 않은 상태 흉내)',
    'real_numpy = sys.modules.pop("numpy", None)',
    'sys.modules["numpy"] = None',
    'try:',
    '    module = importlib.import_module("apc_mediapipe")',
    '    ok = module.VERSION',
    'except Exception as error:',
    '    ok = f"{type(error).__name__}: {error}"',
    'finally:',
    '    if real_numpy is not None:',
    '        sys.modules["numpy"] = real_numpy',
    '    else:',
    '        sys.modules.pop("numpy", None)',
    '    sys.modules.pop("apc_mediapipe", None)',
    '    if saved is not None:',
    '        sys.modules["apc_mediapipe"] = saved',
    'ok',
  ].join('\n'),
);

finish();
