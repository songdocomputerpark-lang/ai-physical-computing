/**
 * 얼굴 인식 엔진 두 가지(PLAN §8.2 P2-09, CODE_MAPPING §3.2.3·§3.2.4) — 공통 뼈대는 task-engine.ts.
 *
 * 1. FaceEngine — Tasks FaceLandmarker(얼굴 그물 478점). 레거시 FaceMesh(...) 인자를 Tasks 옵션으로 옮긴다.
 *    Tasks는 늘 478점(눈동자 포함)을 주고, refine_landmarks=False면 **파이썬 쪽이 앞 468개만** 잘라 쓴다(레거시와 같은 개수).
 * 2. FaceDetectionEngine — Tasks FaceDetector(얼굴 상자). Tasks 상자는 픽셀이라 여기서 0~1로 바꿔 레거시 relative_bounding_box 모양으로 만든다.
 *
 * 모델 파일(같은 사이트 public/models/): face_landmarker.task(3.58MB), blaze_face_short_range.tflite(224KB). 없으면 'missing-model'이 되고
 * 실습실이 재생 입력(합성 얼굴 좌표)으로 잇는다 — 카메라도 모델도 없이 실습을 끝낼 수 있어야 한다(SPEC §2).
 */
import type { FaceDetector, FaceDetectorResult, FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import {
  TaskEngine,
  asBoolean,
  clampNumber,
  describeState,
  modelUrl,
  type EngineState,
  type RunningMode,
  type TaskEngineOptions,
  type TaskEngineSpec,
} from './task-engine.ts';

/** 얼굴 그물 모델 파일(Tasks FaceLandmarker, float16 — 3,758,596바이트) */
export const FACE_MESH_MODEL_FILE = 'face_landmarker.task';

/** 얼굴 검출 모델 파일(BlazeFace 근거리 — 229,746바이트) */
export const FACE_DETECTION_MODEL_FILE = 'blaze_face_short_range.tflite';

export const FACE_MESH_MODEL_PATH = modelUrl(FACE_MESH_MODEL_FILE);
export const FACE_DETECTION_MODEL_PATH = modelUrl(FACE_DETECTION_MODEL_FILE);

/** 한 화면에서 찾을 얼굴 수 상한(성능) */
export const MAX_NUM_FACES = 4;

export interface FaceTaskOptions {
  readonly numFaces: number;
  readonly minFaceDetectionConfidence: number;
  readonly minFacePresenceConfidence: number;
  readonly minTrackingConfidence: number;
  readonly runningMode: RunningMode;
}

/** 레거시 FaceMesh(...) 인자(파이썬이 mediapipe.open payload.options로 보낸다) */
export interface LegacyFaceMeshOptions {
  readonly staticImageMode?: unknown;
  readonly maxNumFaces?: unknown;
  readonly refineLandmarks?: unknown;
  readonly minDetectionConfidence?: unknown;
  readonly minTrackingConfidence?: unknown;
}

/** 레거시 기본값(mediapipe 0.10.x solutions/face_mesh.py): 얼굴 1명, refine_landmarks=False, 신뢰도 0.5·0.5 */
export const DEFAULT_FACE_TASK_OPTIONS: FaceTaskOptions = Object.freeze({
  numFaces: 1,
  minFaceDetectionConfidence: 0.5,
  minFacePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  runningMode: 'VIDEO',
});

/** 화면이 파이썬에 주는 얼굴 하나(478점) */
export interface DetectedFace {
  /** 478개 [x, y, z] */
  readonly landmarks: number[][];
}

export function taskOptionsFromLegacyFaceMesh(legacy: LegacyFaceMeshOptions | null | undefined): FaceTaskOptions {
  const source = legacy ?? {};
  return {
    numFaces: Math.round(clampNumber(source.maxNumFaces, 1, MAX_NUM_FACES, DEFAULT_FACE_TASK_OPTIONS.numFaces)),
    minFaceDetectionConfidence: clampNumber(source.minDetectionConfidence, 0, 1, DEFAULT_FACE_TASK_OPTIONS.minFaceDetectionConfidence),
    minFacePresenceConfidence: DEFAULT_FACE_TASK_OPTIONS.minFacePresenceConfidence,
    minTrackingConfidence: clampNumber(source.minTrackingConfidence, 0, 1, DEFAULT_FACE_TASK_OPTIONS.minTrackingConfidence),
    runningMode: asBoolean(source.staticImageMode) ? 'IMAGE' : 'VIDEO',
  };
}

export function sameFaceOptions(a: FaceTaskOptions, b: FaceTaskOptions): boolean {
  return (
    a.numFaces === b.numFaces &&
    a.minFaceDetectionConfidence === b.minFaceDetectionConfidence &&
    a.minFacePresenceConfidence === b.minFacePresenceConfidence &&
    a.minTrackingConfidence === b.minTrackingConfidence &&
    a.runningMode === b.runningMode
  );
}

/** Tasks FaceLandmarkerResult → 파이썬에 보낼 평범한 값(순수 함수, 단위 테스트가 가짜 결과로 검사) */
export function convertFaceLandmarkerResult(result: Pick<FaceLandmarkerResult, 'faceLandmarks'>): DetectedFace[] {
  return result.faceLandmarks.map((points) => ({ landmarks: points.map((point) => [point.x, point.y, point.z]) }));
}

export function describeFaceEngineState(state: EngineState, detail = ''): string {
  return describeState(state, '얼굴 인식', FACE_MESH_MODEL_FILE, detail);
}

const FACE_SPEC: TaskEngineSpec<FaceTaskOptions, FaceLandmarker, DetectedFace[]> = {
  label: '얼굴 인식',
  modelFileFor: () => FACE_MESH_MODEL_FILE,
  runningModeOf: (options) => options.runningMode,
  create: (vision, fileset, model, options, delegate) =>
    vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: options.runningMode,
      numFaces: options.numFaces,
      minFaceDetectionConfidence: options.minFaceDetectionConfidence,
      minFacePresenceConfidence: options.minFacePresenceConfidence,
      minTrackingConfidence: options.minTrackingConfidence,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    }),
  apply: (task, options) =>
    task.setOptions({
      runningMode: options.runningMode,
      numFaces: options.numFaces,
      minFaceDetectionConfidence: options.minFaceDetectionConfidence,
      minFacePresenceConfidence: options.minFacePresenceConfidence,
      minTrackingConfidence: options.minTrackingConfidence,
    }),
  detect: (task, image, timestamp, mode) => convertFaceLandmarkerResult(mode === 'IMAGE' ? task.detect(image) : task.detectForVideo(image, timestamp)),
  same: sameFaceOptions,
  empty: [],
};

/** 얼굴 그물 엔진 */
export class FaceEngine extends TaskEngine<FaceTaskOptions, FaceLandmarker, DetectedFace[]> {
  constructor(options: TaskEngineOptions = {}) {
    super(FACE_SPEC, DEFAULT_FACE_TASK_OPTIONS, options);
  }
}

// ── 얼굴 검출(상자) ──

export interface FaceDetectionTaskOptions {
  readonly minDetectionConfidence: number;
  readonly runningMode: RunningMode;
}

export interface LegacyFaceDetectionOptions {
  readonly minDetectionConfidence?: unknown;
  readonly modelSelection?: unknown;
}

/** 레거시 기본값(solutions/face_detection.py): model_selection=0(2m 이내), 신뢰도 0.5 */
export const DEFAULT_FACE_DETECTION_OPTIONS: FaceDetectionTaskOptions = Object.freeze({
  minDetectionConfidence: 0.5,
  runningMode: 'VIDEO',
});

/** 화면이 파이썬에 주는 얼굴 상자 하나(모두 0~1 값 — 레거시 relative_bounding_box와 같다) */
export interface DetectedFaceBox {
  readonly score: number;
  readonly box: { readonly xmin: number; readonly ymin: number; readonly width: number; readonly height: number };
  /** 눈·코·입·귀 6점 [x, y] */
  readonly keypoints: number[][];
}

export function taskOptionsFromLegacyFaceDetection(legacy: LegacyFaceDetectionOptions | null | undefined): FaceDetectionTaskOptions {
  const source = legacy ?? {};
  return {
    minDetectionConfidence: clampNumber(source.minDetectionConfidence, 0, 1, DEFAULT_FACE_DETECTION_OPTIONS.minDetectionConfidence),
    runningMode: 'VIDEO',
  };
}

/**
 * Tasks FaceDetectorResult → 0~1 상자. Tasks 상자는 **픽셀**이라 프레임 크기로 나눈다(레거시는 0~1).
 * 순수 함수라 단위 테스트가 가짜 결과로 검사한다.
 */
export function convertFaceDetectorResult(result: Pick<FaceDetectorResult, 'detections'>, width: number, height: number): DetectedFaceBox[] {
  const safeWidth = width > 0 ? width : 1;
  const safeHeight = height > 0 ? height : 1;
  return result.detections.map((detection) => {
    const box = detection.boundingBox;
    return {
      score: detection.categories[0]?.score ?? 0,
      box: box
        ? {
            xmin: box.originX / safeWidth,
            ymin: box.originY / safeHeight,
            width: box.width / safeWidth,
            height: box.height / safeHeight,
          }
        : { xmin: 0, ymin: 0, width: 0, height: 0 },
      keypoints: detection.keypoints.map((point) => [point.x, point.y]),
    };
  });
}

export function describeFaceDetectionEngineState(state: EngineState, detail = ''): string {
  return describeState(state, '얼굴 검출', FACE_DETECTION_MODEL_FILE, detail);
}

const FACE_DETECTION_SPEC: TaskEngineSpec<FaceDetectionTaskOptions, FaceDetector, DetectedFaceBox[]> = {
  label: '얼굴 검출',
  modelFileFor: () => FACE_DETECTION_MODEL_FILE,
  runningModeOf: (options) => options.runningMode,
  create: (vision, fileset, model, options, delegate) =>
    vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: options.runningMode,
      minDetectionConfidence: options.minDetectionConfidence,
    }),
  apply: (task, options) => task.setOptions({ runningMode: options.runningMode, minDetectionConfidence: options.minDetectionConfidence }),
  detect: (task, image, timestamp, mode) =>
    convertFaceDetectorResult(mode === 'IMAGE' ? task.detect(image) : task.detectForVideo(image, timestamp), image.width, image.height),
  same: (a, b) => a.minDetectionConfidence === b.minDetectionConfidence && a.runningMode === b.runningMode,
  empty: [],
};

/** 얼굴 검출(상자) 엔진 */
export class FaceDetectionEngine extends TaskEngine<FaceDetectionTaskOptions, FaceDetector, DetectedFaceBox[]> {
  constructor(options: TaskEngineOptions = {}) {
    super(FACE_DETECTION_SPEC, DEFAULT_FACE_DETECTION_OPTIONS, options);
  }
}
