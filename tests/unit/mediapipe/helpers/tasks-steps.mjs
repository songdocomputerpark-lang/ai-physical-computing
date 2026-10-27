// mediapipe 흉내(판 1.8.0 — mediapipe 1.1.1 Tasks API 모양)의 검사 단계 목록. pyodide-mediapipe-run.mjs(실제 Pyodide)가 쓰고,
// 같은 단계를 진짜 CPython에서도 돌려 기댓값을 대조할 수 있게 한 파일에 모았다(판 1.8.0 통합 — 이 컴퓨터에서 jsDelivr가 막혀도
// 단계 코드·기댓값을 미리 확인하려고). 단계 하나 = { name, code, jspi?: 'only' | 'limited', hands?, faces?, poses?, detections? }.
// hands·faces·poses·detections를 적지 않으면 기본 합성 장(손 two-hands 첫 장, 얼굴 face-turn 첫 장, 자세 pose-raise 첫 장)을 답한다.
// 사람 손·얼굴 데이터가 아니라 코드가 계산한 좌표다(PD-30).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** 합성 장 → 화면이 파이썬에 주는 답(src/lab/modules/mediapipe/index.ts의 detectedFromSynthetic 등과 같은 모양) */
export function replyBuilders(fixture, faceModule, poseModule) {
  const sequenceOf = (id) => fixture.sequences.find((sequence) => sequence.id === id);
  const replyHands = (frame) => frame.hands.map((hand) => ({ landmarks: hand.landmarks.map((point) => [...point]), worldLandmarks: null, handedness: { ...hand.handedness } }));
  const replyFaces = (frame) => frame.faces.map((face) => face.landmarks.map((point) => [...point]));
  const replyPoses = (frame) => frame.poses.map((body) => body.landmarks.map((point) => [...point]));
  const replyDetections = (frame) =>
    frame.faces.map((face) => {
      const point = (index) => [face.landmarks[index][0], face.landmarks[index][1]];
      const mouth = [(face.landmarks[13][0] + face.landmarks[14][0]) / 2, (face.landmarks[13][1] + face.landmarks[14][1]) / 2];
      return { score: face.score, box: { ...face.box }, keypoints: [point(468), point(473), point(1), mouth, point(234), point(454)] };
    });
  return {
    sequenceOf,
    faceSequence: (id) => faceModule.generateFaceSequence(id),
    poseSequence: (id) => poseModule.generatePoseSequence(id),
    replyHands,
    replyFaces,
    replyPoses,
    replyDetections,
  };
}

/** 저장소 뿌리에서 합성 좌표 생성기를 불러 단계 목록을 만든다(Node 22.18+·24는 .ts를 타입만 지우고 실행한다). */
export async function loadSteps(rootDir) {
  const fixture = JSON.parse(fs.readFileSync(path.join(rootDir, 'tests', 'fixtures', 'landmarks', 'hands.json'), 'utf8'));
  const faceModule = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'modules', 'mediapipe', 'synthetic-face.ts')).href);
  const poseModule = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'modules', 'mediapipe', 'synthetic-pose.ts')).href);
  const r = replyBuilders(fixture, faceModule, poseModule);
  const defaults = {
    hands: r.replyHands(r.sequenceOf('two-hands').frames[0]),
    faces: r.replyFaces(r.faceSequence('face-turn').frames[0]),
    poses: r.replyPoses(r.poseSequence('pose-raise').frames[0]),
    detections: r.replyDetections(r.faceSequence('face-turn').frames[0]),
  };
  const countFrames = r.sequenceOf('count').frames;
  const pinchFrames = r.sequenceOf('pinch').frames;
  const closest = pinchFrames.reduce(
    (best, frame, index) => {
      const [tx, ty] = frame.hands[0].landmarks[4];
      const [ix, iy] = frame.hands[0].landmarks[8];
      const distance = Math.hypot(tx - ix, ty - iy);
      return distance < best.distance ? { index, distance } : best;
    },
    { index: 0, distance: Infinity },
  );
  const yawnFrames = r.faceSequence('face-yawn').frames;
  const gapOf = (frame) => frame.faces[0].landmarks[14][1] - frame.faces[0].landmarks[13][1];
  const openFrame = yawnFrames.reduce((best, frame) => (gapOf(frame) > gapOf(best) ? frame : best), yawnFrames[0]);
  const blinkFrames = r.faceSequence('face-blink').frames;
  const raiseFrames = r.poseSequence('pose-raise').frames;
  const raisedFrame = raiseFrames.reduce((best, frame) => (frame.poses[0].landmarks[15][1] < best.poses[0].landmarks[15][1] ? frame : best), raiseFrames[0]);

  const VIDEO_HANDS = (numHands = 2) =>
    [
      'import time, cv2, numpy as np, mediapipe as mp',
      'from mediapipe.tasks.python import vision',
      `hands = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path='hand_landmarker.task'), running_mode=vision.RunningMode.VIDEO, num_hands=${numHands}))`,
      'def frame_of(h=48, w=64):',
      '    return mp.Image(image_format=mp.ImageFormat.SRGB, data=np.zeros((h, w, 3), dtype=np.uint8))',
    ].join('\n');
  const FOLDED = [
    'h1 = result.hand_landmarks[0]',
    'compare = [(2, 4, 17), (5, 8, 0), (9, 12, 0), (13, 16, 0), (17, 20, 0)]',
    'folding = ""',
    'for mcp, tip, comp in compare:',
    '    tip_dist = (h1[comp].x - h1[tip].x) ** 2 + (h1[comp].y - h1[tip].y) ** 2',
    '    mcp_dist = (h1[comp].x - h1[mcp].x) ** 2 + (h1[comp].y - h1[mcp].y) ** 2',
    '    folding += "01"[tip_dist > mcp_dist]',
    'folding',
  ].join('\n');

  /** @type {{ name: string, code: string, jspi?: 'only' | 'limited', hands?: unknown[], faces?: unknown[], poses?: unknown[], detections?: unknown[] }[]} */
  const steps = [
    // ── 어느 모드에서나 되는 것: import·상수·기본값·옛 사용법 ──
    {
      name: 'import',
      code: [
        'import mediapipe as mp',
        'from mediapipe.tasks import python as tasks_python',
        'from mediapipe.tasks.python import vision',
        'from mediapipe.tasks.python.vision import drawing_utils as du',
        'from mediapipe.tasks.python.vision.hand_landmarker import HandLandmark',
        'from mediapipe.tasks.python.components.containers import NormalizedLandmark, Category',
        'import mediapipe.tasks.python.vision.drawing_styles as ds',
        '[',
        '  mp.__version__,',
        '  int(HandLandmark.INDEX_FINGER_TIP),',
        '  int(HandLandmark.THUMB_TIP),',
        '  len(vision.HandLandmarksConnections.HAND_CONNECTIONS),',
        '  [[c.start, c.end] for c in vision.HandLandmarksConnections.HAND_CONNECTIONS[:3]],',
        '  du is vision.drawing_utils,',
        '  tasks_python is mp.tasks,',
        '  ds is vision.drawing_styles,',
        '  type(ds.get_default_hand_landmarks_style()[0]).__name__,',
        '  sorted(name for name in dir(mp) if not name.startswith("_")),',
        '  repr(vision.HandLandmarksConnections.HAND_CONNECTIONS[0]),',
        '  repr(mp.tasks.BaseOptions(model_asset_path="x.task")),',
        '  repr(NormalizedLandmark(x=0.5, y=0.25)),',
        '  vision.RunningMode.VIDEO.value,',
        '  int(mp.ImageFormat.SRGB),',
        ']',
      ].join('\n'),
    },
    { name: 'legacy_solutions', code: 'import mediapipe as mp\nmp.solutions.hands.Hands()' },
    { name: 'legacy_from_import', code: 'from mediapipe import solutions' },
    { name: 'legacy_submodule', code: 'import mediapipe.solutions.hands' },
    {
      name: 'drawing_spec_defaults',
      code: [
        'from mediapipe.tasks.python import vision',
        'du = vision.drawing_utils',
        'spec = du.DrawingSpec()',
        'custom = du.DrawingSpec(color=(166, 151, 18), thickness=3)',
        '[list(spec.color), spec.thickness, spec.circle_radius, list(custom.color), custom.thickness, custom.circle_radius, list(du.RED_COLOR), list(du.WHITE_COLOR)]',
      ].join('\n'),
    },
    {
      name: 'image_checks',
      code: [
        'import numpy as np, mediapipe as mp',
        'rgb = np.zeros((48, 64, 3), dtype=np.uint8)',
        'image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)',
        'errors = []',
        'for bad in (lambda: mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb[:, :, 0]), lambda: mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb.astype(np.float32)), lambda: mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb.tolist())):',
        '    try:',
        '        bad()',
        '        errors.append("no error")',
        '    except Exception as error:',
        '        errors.append(f"{type(error).__name__}: {error}")',
        '[image.width, image.height, image.channels, int(image.image_format), image.numpy_view().flags.writeable, errors]',
      ].join('\n'),
    },

    // ── 손(HandLandmarker) — 화면에 보내는 옵션 ──
    { name: 'open_default', jspi: 'only', code: 'from mediapipe.tasks.python import vision\nhands = vision.HandLandmarker.create_from_model_path("hand_landmarker.task")\nhands.engine' },
    {
      name: 'open_named',
      jspi: 'only',
      code: [
        'import mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        'options = vision.HandLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path="hand_landmarker.task"), running_mode=vision.RunningMode.VIDEO, num_hands=3, min_hand_detection_confidence=0.7, min_hand_presence_confidence=0.6, min_tracking_confidence=0.3)',
        'vision.HandLandmarker.create_from_options(options).engine',
      ].join('\n'),
    },
    {
      name: 'open_bad_num_hands',
      jspi: 'only',
      code: 'import mediapipe as mp\nfrom mediapipe.tasks.python import vision\nvision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path="hand_landmarker.task"), num_hands=0))',
    },

    // ── 손 — 결과 모양 ──
    {
      name: 'detect_two_hands',
      jspi: 'only',
      code: [
        VIDEO_HANDS(2),
        'from mediapipe.tasks.python.vision.hand_landmarker import HandLandmark',
        'frame = np.zeros((48, 64, 3), dtype=np.uint8)',
        'frame[:, :, 2] = 200', // BGR의 빨강 → RGB로 바꾸면 R이 200
        'rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)',
        'result = hands.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), 1000)',
        'hand = result.hand_landmarks[0]',
        '[',
        '  len(result.hand_landmarks),',
        '  len(hand),',
        '  round(hand[8].x, 4), round(hand[8].y, 4), round(hand[8].z, 4),',
        '  result.handedness[0][0].category_name,',
        '  result.handedness[1][0].category_name,',
        '  round(result.handedness[0][0].score, 2),',
        '  result.handedness[0][0].index,',
        '  result.handedness[1][0].index,',
        '  result.handedness[0][0].display_name,',
        '  len(result.hand_world_landmarks) == len(result.hand_landmarks) and len(result.hand_world_landmarks[0]) == 21,',
        '  round(hand[HandLandmark.INDEX_FINGER_TIP].x, 4),',
        '  type(result).__name__,',
        '  hand[0].visibility is None and hand[0].presence is None,',
        '  type(result.hand_landmarks).__name__,',
        ']',
      ].join('\n'),
    },
    {
      name: 'detect_none',
      jspi: 'only',
      hands: [],
      code: [VIDEO_HANDS(2), 'result = hands.detect_for_video(frame_of(), 1000)', '[result.hand_landmarks == [], result.handedness == [], result.hand_world_landmarks == [], bool(result.hand_landmarks)]'].join('\n'),
    },
    { name: 'num_hands_one', jspi: 'only', code: [VIDEO_HANDS(1), 'len(hands.detect_for_video(frame_of(), 1000).hand_landmarks)'].join('\n') },
    // 판 1.8.0 검토 반영: mp.Image가 아닌 것을 넣은 실패는 시각을 쓰지 않는다(진짜는 image._image_ptr를 먼저 읽음) — 같은 시각으로 다시 부르면 된다
    {
      name: 'bad_image_keeps_timestamp',
      jspi: 'only',
      code: [VIDEO_HANDS(2), 'try:', '    hands.detect_for_video([1, 2], 1000)', 'except AttributeError:', '    pass', 'len(hands.detect_for_video(frame_of(), 1000).hand_landmarks)'].join('\n'),
    },
    // 판 1.8.0 검토 반영: 윈도우 경로(역슬래시)로 적은 모델도 파일 이름으로 사이트 모델을 고른다(ntpath)
    {
      name: 'windows_model_path',
      jspi: 'only',
      code: [
        'import mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        "hands = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path=r'D:\\class\\models\\hand_landmarker.task')))",
        'hands.engine',
      ].join('\n'),
    },
    {
      name: 'result_repr',
      jspi: 'only',
      code: [VIDEO_HANDS(2), 'result = hands.detect_for_video(frame_of(), 1000)', 'print(result.hand_landmarks[0][0])', 'print(result.handedness[0][0])', '"ok"'].join('\n'),
    },

    // ── 손 — 잘못 쓰면 진짜와 같은 오류 ──
    { name: 'err_numpy_image', jspi: 'only', code: [VIDEO_HANDS(2), 'hands.detect_for_video(np.zeros((8, 8, 3), dtype=np.uint8), 1000)'].join('\n') },
    {
      name: 'err_gray_image',
      jspi: 'only',
      code: [VIDEO_HANDS(2), 'hands.detect_for_video(mp.Image(image_format=mp.ImageFormat.GRAY8, data=np.zeros((8, 8), dtype=np.uint8)), 1000)'].join('\n'),
    },
    { name: 'err_same_timestamp', jspi: 'only', code: [VIDEO_HANDS(2), 'hands.detect_for_video(frame_of(), 1000)', 'hands.detect_for_video(frame_of(), 1000)'].join('\n') },
    { name: 'err_float_timestamp', jspi: 'only', code: [VIDEO_HANDS(2), 'hands.detect_for_video(frame_of(), 1000.5)'].join('\n') },
    { name: 'err_wrong_mode', jspi: 'only', code: [VIDEO_HANDS(2), 'hands.detect(frame_of())'].join('\n') },
    { name: 'err_wrong_model', jspi: 'only', code: 'from mediapipe.tasks.python import vision\nvision.HandLandmarker.create_from_model_path("face_landmarker.task")' },
    { name: 'err_typo_model', jspi: 'only', code: 'from mediapipe.tasks.python import vision\nvision.HandLandmarker.create_from_model_path("hand.task")' },
    {
      name: 'err_mode_string',
      jspi: 'only',
      code: 'import mediapipe as mp\nfrom mediapipe.tasks.python import vision\nvision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path="hand_landmarker.task"), running_mode="VIDEO"))',
    },
    {
      name: 'err_live_without_callback',
      jspi: 'only',
      code: 'import mediapipe as mp\nfrom mediapipe.tasks.python import vision\nvision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path="hand_landmarker.task"), running_mode=vision.RunningMode.LIVE_STREAM))',
    },
    {
      name: 'err_unsupported_task',
      jspi: 'only',
      code: 'import mediapipe as mp\nfrom mediapipe.tasks.python import vision\nvision.GestureRecognizer.create_from_options(vision.GestureRecognizerOptions(base_options=mp.tasks.BaseOptions(model_asset_path="gesture_recognizer.task")))',
    },

    // ── 손 — 닫기·with 문·실시간 모드 ──
    { name: 'after_close', jspi: 'only', code: [VIDEO_HANDS(2), 'hands.close()', 'len(hands.detect_for_video(frame_of(), 1000).hand_landmarks)'].join('\n') },
    {
      name: 'context_manager',
      jspi: 'only',
      code: [
        'import numpy as np, mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        'with vision.HandLandmarker.create_from_model_path("hand_landmarker.task") as hands:',
        '    result = hands.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.zeros((8, 8, 3), dtype=np.uint8)))',
        '[len(result.hand_landmarks), hands._closed]',
      ].join('\n'),
    },
    {
      name: 'live_stream',
      jspi: 'only',
      code: [
        'import numpy as np, mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        'got = []',
        'def on_result(result, image, timestamp_ms):',
        '    got.append([len(result.hand_landmarks), type(image).__name__, timestamp_ms])',
        'options = vision.HandLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path="hand_landmarker.task"), running_mode=vision.RunningMode.LIVE_STREAM, num_hands=2, result_callback=on_result)',
        'hands = vision.HandLandmarker.create_from_options(options)',
        'hands.detect_async(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.zeros((8, 8, 3), dtype=np.uint8)), 42)',
        'got',
      ].join('\n'),
    },

    // ── 그리기(drawing_utils·drawing_styles — mediapipe 1.1.1 소스를 옮김) ──
    {
      name: 'draw_landmarks',
      jspi: 'only',
      code: [
        VIDEO_HANDS(1),
        'du = vision.drawing_utils',
        'hand = hands.detect_for_video(frame_of(240, 320), 1000).hand_landmarks[0]',
        'C = vision.HandLandmarksConnections.HAND_CONNECTIONS',
        'line_style = du.DrawingSpec(color=(255, 0, 0), thickness=3)',
        'circle_style = du.DrawingSpec(color=(0, 255, 0), thickness=2, circle_radius=3)',
        'frame = np.zeros((240, 320, 3), dtype=np.uint8)',
        'du.draw_landmarks(frame, hand, C, circle_style, line_style)',
        'blue = int(np.count_nonzero((frame[:, :, 0] > 200) & (frame[:, :, 1] < 50) & (frame[:, :, 2] < 50)))',
        'green = int(np.count_nonzero((frame[:, :, 1] > 200) & (frame[:, :, 0] < 50) & (frame[:, :, 2] < 50)))',
        'drawn = int(np.count_nonzero(frame.any(axis=2)))',
        'plain = np.zeros((240, 320, 3), dtype=np.uint8)',
        'du.draw_landmarks(plain, hand, C)',
        'no_dots = np.zeros((240, 320, 3), dtype=np.uint8)',
        'du.draw_landmarks(no_dots, hand, C, None, line_style)',
        'styled = np.zeros((240, 320, 3), dtype=np.uint8)',
        'du.draw_landmarks(styled, hand, C, vision.drawing_styles.get_default_hand_landmarks_style(), vision.drawing_styles.get_default_hand_connections_style())',
        '[blue, green, drawn, int(np.count_nonzero(plain.any(axis=2))), int(np.count_nonzero(no_dots.any(axis=2))), int(np.count_nonzero(styled.any(axis=2)))]',
      ].join('\n'),
    },
    { name: 'draw_whole_list', jspi: 'only', code: [VIDEO_HANDS(2), 'result = hands.detect_for_video(frame_of(), 1000)', 'vision.drawing_utils.draw_landmarks(np.zeros((48, 64, 3), dtype=np.uint8), result.hand_landmarks)'].join('\n') },
    { name: 'draw_tuple_connections', jspi: 'only', code: [VIDEO_HANDS(2), 'hand = hands.detect_for_video(frame_of(), 1000).hand_landmarks[0]', 'vision.drawing_utils.draw_landmarks(np.zeros((48, 64, 3), dtype=np.uint8), hand, [(0, 1)])'].join('\n') },

    // ── 합성 좌표로 예제 판정이 뜻대로 나온다 ──
    { name: 'folded_fingers_fist', jspi: 'only', hands: r.replyHands(countFrames[0]).slice(0, 1), code: [VIDEO_HANDS(1), 'result = hands.detect_for_video(frame_of(), 1000)', FOLDED].join('\n') },
    { name: 'folded_fingers_open', jspi: 'only', hands: r.replyHands(countFrames[countFrames.length - 1]).slice(0, 1), code: [VIDEO_HANDS(1), 'result = hands.detect_for_video(frame_of(), 1000)', FOLDED].join('\n') },
    {
      name: 'pinch_distance',
      jspi: 'only',
      hands: r.replyHands(pinchFrames[closest.index]).slice(0, 1),
      code: [VIDEO_HANDS(1), 'import math', 'hand = hands.detect_for_video(frame_of(480, 640), 1000).hand_landmarks[0]', 'int(math.hypot((hand[8].x - hand[4].x) * 640, (hand[8].y - hand[4].y) * 480))'].join('\n'),
    },

    // ── 얼굴 그물(FaceLandmarker) ──
    {
      name: 'face_import',
      code: [
        'from mediapipe.tasks.python import vision',
        'F = vision.FaceLandmarksConnections',
        'ds = vision.drawing_styles',
        '[',
        '  len(F.FACE_LANDMARKS_TESSELATION), len(F.FACE_LANDMARKS_CONTOURS), len(F.FACE_LANDMARKS_NOSE), len(F.FACE_LANDMARKS_LEFT_IRIS),',
        '  type(ds.get_default_face_mesh_tesselation_style()).__name__,',
        '  len(ds.get_default_face_mesh_contours_style()), len(ds.get_default_face_mesh_contours_style(1)), len(ds.get_default_face_mesh_iris_connections_style()),',
        '  int(vision.PoseLandmark.LEFT_SHOULDER), int(vision.PoseLandmark.LEFT_WRIST), len(vision.PoseLandmarksConnections.POSE_LANDMARKS),',
        '  F.Connection is vision.HandLandmarksConnections.Connection,',
        ']',
      ].join('\n'),
    },
    {
      name: 'face_detect',
      jspi: 'only',
      code: [
        'import numpy as np, mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        'face = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path="face_landmarker.task"), running_mode=vision.RunningMode.VIDEO, num_faces=1))',
        'result = face.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.zeros((480, 640, 3), dtype=np.uint8)), 1000)',
        'lm = result.face_landmarks[0]',
        '[len(result.face_landmarks), len(lm), round(lm[1].x, 4), round(lm[1].y, 4), lm[33].x < lm[263].x, lm[473].x > lm[468].x, type(result).__name__, result.face_blendshapes, result.facial_transformation_matrixes]',
      ].join('\n'),
    },
    {
      name: 'face_blendshapes',
      jspi: 'only',
      faces: r.replyFaces(blinkFrames[Math.floor(blinkFrames.length / 2)]),
      code: [
        'import numpy as np, mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        'face = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path="face_landmarker.task"), output_face_blendshapes=True))',
        'result = face.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.zeros((48, 64, 3), dtype=np.uint8)))',
        'shapes = result.face_blendshapes[0]',
        '[len(shapes), shapes[9].category_name, shapes[9].index, shapes[25].category_name, all(0 <= c.score <= 1 for c in shapes), shapes[0].category_name]',
      ].join('\n'),
    },
    {
      name: 'face_none',
      jspi: 'only',
      faces: [],
      code: [
        'import numpy as np, mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        'face = vision.FaceLandmarker.create_from_model_path("face_landmarker.task")',
        'result = face.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.zeros((8, 8, 3), dtype=np.uint8)))',
        '[result.face_landmarks == [], bool(result.face_landmarks)]',
      ].join('\n'),
    },
    {
      name: 'face_draw',
      jspi: 'only',
      code: [
        'import numpy as np, mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        'du = vision.drawing_utils',
        'face = vision.FaceLandmarker.create_from_model_path("face_landmarker.task")',
        'lm = face.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.zeros((480, 640, 3), dtype=np.uint8))).face_landmarks[0]',
        'F = vision.FaceLandmarksConnections',
        'frame = np.zeros((480, 640, 3), dtype=np.uint8)',
        'du.draw_landmarks(frame, lm, F.FACE_LANDMARKS_TESSELATION, du.DrawingSpec(color=(166, 151, 18), thickness=3), du.DrawingSpec(color=(166, 114, 81), thickness=2))',
        'contours = np.zeros((480, 640, 3), dtype=np.uint8)',
        'du.draw_landmarks(contours, lm, F.FACE_LANDMARKS_CONTOURS, None, vision.drawing_styles.get_default_face_mesh_contours_style())',
        '[int(np.count_nonzero(frame.any(axis=2))), int(np.count_nonzero(contours.any(axis=2)))]',
      ].join('\n'),
    },
    {
      name: 'face_yawn_mar',
      jspi: 'only',
      faces: r.replyFaces(openFrame),
      code: [
        'import math, numpy as np, mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        'face = vision.FaceLandmarker.create_from_model_path("face_landmarker.task")',
        'lm = face.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.zeros((480, 640, 3), dtype=np.uint8))).face_landmarks[0]',
        'pts = [(int(lm[i].x * 640), int(lm[i].y * 480)) for i in [13, 14, 19, 18, 78, 308]]',
        'd = lambda a, b: math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)',
        'round((d(pts[0], pts[2]) + d(pts[1], pts[3])) / (2.0 * d(pts[4], pts[5])), 3)',
      ].join('\n'),
    },

    // ── 얼굴 상자(FaceDetector) ──
    {
      name: 'face_detector',
      jspi: 'only',
      code: [
        'import numpy as np, mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        'detector = vision.FaceDetector.create_from_options(vision.FaceDetectorOptions(base_options=mp.tasks.BaseOptions(model_asset_path="blaze_face_short_range.tflite"), running_mode=vision.RunningMode.VIDEO, min_detection_confidence=0.5))',
        'result = detector.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.zeros((480, 640, 3), dtype=np.uint8)), 1000)',
        'detection = result.detections[0]',
        'box = detection.bounding_box',
        'frame = np.zeros((480, 640, 3), dtype=np.uint8)',
        'vision.drawing_utils.draw_detection(frame, detection)',
        '[len(result.detections), box.origin_x, box.origin_y, box.width, box.height, all(isinstance(v, int) for v in (box.origin_x, box.origin_y, box.width, box.height)), round(detection.categories[0].score, 2), len(detection.keypoints), round(detection.keypoints[2].x, 1), int(np.count_nonzero(frame.any(axis=2))) > 100, type(result).__name__]',
      ].join('\n'),
    },
    {
      name: 'face_detector_none',
      jspi: 'only',
      detections: [],
      code: [
        'import numpy as np, mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        'detector = vision.FaceDetector.create_from_model_path("blaze_face_short_range.tflite")',
        'result = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.zeros((8, 8, 3), dtype=np.uint8)))',
        '[result.detections == [], bool(result.detections)]',
      ].join('\n'),
    },
    { name: 'err_task_for_detector', jspi: 'only', code: 'from mediapipe.tasks.python import vision\nvision.FaceDetector.create_from_model_path("hand_landmarker.task")' },

    // ── 자세(PoseLandmarker) ──
    {
      name: 'pose_detect',
      jspi: 'only',
      poses: r.replyPoses(raisedFrame),
      code: [
        'import numpy as np, mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        'pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path="pose_landmarker_lite.task"), running_mode=vision.RunningMode.VIDEO))',
        'result = pose.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.zeros((480, 640, 3), dtype=np.uint8)), 1000)',
        'lm = result.pose_landmarks[0]',
        '[len(lm), round(lm[vision.PoseLandmark.LEFT_WRIST].y, 3), round(lm[vision.PoseLandmark.LEFT_SHOULDER].y, 3), round(lm[25].visibility, 2), lm[11].presence == lm[11].visibility, len(result.pose_world_landmarks), result.segmentation_masks is None, type(result.pose_landmarks).__name__]',
      ].join('\n'),
    },
    {
      name: 'pose_none',
      jspi: 'only',
      poses: [],
      code: [
        'import numpy as np, mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        'pose = vision.PoseLandmarker.create_from_model_path("pose_landmarker_lite.task")',
        'result = pose.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.zeros((8, 8, 3), dtype=np.uint8)))',
        '[result.pose_landmarks == [], bool(result.pose_landmarks)]',
      ].join('\n'),
    },
    {
      name: 'pose_draw',
      jspi: 'only',
      poses: r.replyPoses(raiseFrames[0]),
      code: [
        'import numpy as np, mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        'du = vision.drawing_utils',
        'P = vision.PoseLandmarksConnections.POSE_LANDMARKS',
        'pose = vision.PoseLandmarker.create_from_model_path("pose_landmarker_lite.task")',
        'lm = pose.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.zeros((480, 640, 3), dtype=np.uint8))).pose_landmarks[0]',
        'frame = np.zeros((480, 640, 3), dtype=np.uint8)',
        'du.draw_landmarks(frame, lm, P)',
        'drawn = int(np.count_nonzero(frame.any(axis=2)))',
        '# visibility가 0.5보다 작은 점과 그 점에 닿은 선은 그리지 않는다: 화면 안의 왼쪽 팔꿈치를 잘 안 보이게 해 본다',
        'lm[vision.PoseLandmark.LEFT_ELBOW].visibility = 0.2',
        'hidden = np.zeros((480, 640, 3), dtype=np.uint8)',
        'du.draw_landmarks(hidden, lm, P)',
        '# 화면 밖(0~1 밖) 다리는 visibility·presence를 1로 올려도 그려지지 않는다(정규화 좌표 규칙)',
        'for point in lm:',
        '    point.visibility = 1.0',
        '    point.presence = 1.0',
        'more = np.zeros((480, 640, 3), dtype=np.uint8)',
        'du.draw_landmarks(more, lm, P, vision.drawing_styles.get_default_pose_landmarks_style())',
        'plain = np.zeros((480, 640, 3), dtype=np.uint8)',
        'du.draw_landmarks(plain, lm, P)',
        '[drawn, int(np.count_nonzero(hidden.any(axis=2))), int(np.count_nonzero(plain.any(axis=2))), int(np.count_nonzero(more.any(axis=2))) > 1000]',
      ].join('\n'),
    },
    {
      name: 'pose_models',
      jspi: 'only',
      code: [
        'from mediapipe.tasks.python import vision',
        'full = vision.PoseLandmarker.create_from_model_path("pose_landmarker_full.task")',
        'heavy = vision.PoseLandmarker.create_from_model_path("pose_landmarker_heavy.task")',
        'lite = vision.PoseLandmarker.create_from_model_path("pose_landmarker_lite.task")',
        '[full.engine, heavy.engine, lite.engine]',
      ].join('\n'),
    },

    // ── 제한 모드(JSPI 없음): 기다릴 수 없으니 빈 결과로 답하고 한국어로 한 번 안내한다 ──
    {
      name: 'limited_detect',
      jspi: 'limited',
      code: [
        'import numpy as np, mediapipe as mp',
        'from mediapipe.tasks.python import vision',
        'hands = vision.HandLandmarker.create_from_model_path("hand_landmarker.task")',
        'result = hands.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.zeros((8, 8, 3), dtype=np.uint8)))',
        '[hands.engine, result.hand_landmarks == []]',
      ].join('\n'),
    },
  ];
  return { steps, defaults };
}
