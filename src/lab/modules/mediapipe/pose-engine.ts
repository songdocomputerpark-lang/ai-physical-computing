/**
 * 자세(포즈) 인식 엔진(PLAN §8.2 P2-09, CODE_MAPPING §3.2.5, PD-20) — 공통 뼈대는 task-engine.ts.
 *
 * 레거시 Pose(...)의 model_complexity를 Tasks 모델 파일로 옮긴다(PD-20):
 *   0 → pose_landmarker_lite.task(5.78MB), 1·2 → pose_landmarker_full.task(9.40MB).
 *   2(heavy, 30.7MB)는 사이트에 두지 않고 full로 돌린다(파이썬 쪽이 콘솔로 한 번 알린다).
 *   조절 패널의 **저사양 모드**를 켜면 코드가 무엇을 적었든 lite를 쓴다 — 모델 파일이 바뀌면 엔진이 스스로 다시 받는다(TaskEngine.configure).
 *
 * 레거시는 사람 한 명(pose_landmarks 단수)만 주므로 numPoses는 1로 고정하고, 결과에는 visibility를 함께 넘긴다
 * (draw_landmarks가 visibility < 0.5인 점을 건너뛰는 레거시 규칙을 파이썬 쪽이 그대로 쓴다 — 화면 밖 다리가 그려지지 않는다).
 */
import type { PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
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

/** 자세 모델 파일(가벼운 것·보통 것) */
export const POSE_MODEL_FILE_LITE = 'pose_landmarker_lite.task';
export const POSE_MODEL_FILE_FULL = 'pose_landmarker_full.task';

export const POSE_MODEL_PATH_LITE = modelUrl(POSE_MODEL_FILE_LITE);
export const POSE_MODEL_PATH_FULL = modelUrl(POSE_MODEL_FILE_FULL);

export interface PoseTaskOptions {
  readonly minPoseDetectionConfidence: number;
  readonly minPosePresenceConfidence: number;
  readonly minTrackingConfidence: number;
  readonly runningMode: RunningMode;
  /** 0 = lite, 1·2 = full(레거시 model_complexity) */
  readonly modelComplexity: number;
  /** 저사양 모드(조절 패널) — 켜면 늘 lite */
  readonly lowSpec: boolean;
}

/** 레거시 Pose(...) 인자(파이썬이 mediapipe.open payload.options로 보낸다) */
export interface LegacyPoseOptions {
  readonly staticImageMode?: unknown;
  readonly modelComplexity?: unknown;
  readonly smoothLandmarks?: unknown;
  readonly enableSegmentation?: unknown;
  readonly minDetectionConfidence?: unknown;
  readonly minTrackingConfidence?: unknown;
}

/** 레거시 기본값(mediapipe 0.10.x solutions/pose.py): model_complexity=1(full), 신뢰도 0.5·0.5 */
export const DEFAULT_POSE_TASK_OPTIONS: PoseTaskOptions = Object.freeze({
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  runningMode: 'VIDEO',
  modelComplexity: 1,
  lowSpec: false,
});

/** 화면이 파이썬에 주는 사람 하나 */
export interface DetectedPose {
  /** 33개 [x, y, z, visibility] */
  readonly landmarks: number[][];
  /** 33개 [x, y, z, visibility](미터, 엉덩이 가운데 기준). 재생 입력은 null */
  readonly worldLandmarks: number[][] | null;
}

export function poseModelFile(options: Pick<PoseTaskOptions, 'modelComplexity' | 'lowSpec'>): string {
  return options.lowSpec || options.modelComplexity <= 0 ? POSE_MODEL_FILE_LITE : POSE_MODEL_FILE_FULL;
}

export function taskOptionsFromLegacyPose(legacy: LegacyPoseOptions | null | undefined, lowSpec = false): PoseTaskOptions {
  const source = legacy ?? {};
  return {
    minPoseDetectionConfidence: clampNumber(source.minDetectionConfidence, 0, 1, DEFAULT_POSE_TASK_OPTIONS.minPoseDetectionConfidence),
    minPosePresenceConfidence: DEFAULT_POSE_TASK_OPTIONS.minPosePresenceConfidence,
    minTrackingConfidence: clampNumber(source.minTrackingConfidence, 0, 1, DEFAULT_POSE_TASK_OPTIONS.minTrackingConfidence),
    runningMode: asBoolean(source.staticImageMode) ? 'IMAGE' : 'VIDEO',
    modelComplexity: Math.round(clampNumber(source.modelComplexity, 0, 2, DEFAULT_POSE_TASK_OPTIONS.modelComplexity)),
    lowSpec,
  };
}

export function samePoseOptions(a: PoseTaskOptions, b: PoseTaskOptions): boolean {
  return (
    a.minPoseDetectionConfidence === b.minPoseDetectionConfidence &&
    a.minPosePresenceConfidence === b.minPosePresenceConfidence &&
    a.minTrackingConfidence === b.minTrackingConfidence &&
    a.runningMode === b.runningMode &&
    poseModelFile(a) === poseModelFile(b)
  );
}

/** Tasks PoseLandmarkerResult → 파이썬에 보낼 평범한 값(첫 사람은 목록 맨 앞, 순수 함수) */
export function convertPoseLandmarkerResult(result: Pick<PoseLandmarkerResult, 'landmarks' | 'worldLandmarks'>): DetectedPose[] {
  return result.landmarks.map((points, index) => {
    const world = result.worldLandmarks[index];
    return {
      landmarks: points.map((point) => [point.x, point.y, point.z, point.visibility ?? 1]),
      worldLandmarks: world ? world.map((point) => [point.x, point.y, point.z, point.visibility ?? 1]) : null,
    };
  });
}

export function describePoseEngineState(state: EngineState, detail = ''): string {
  return describeState(state, '자세 인식', POSE_MODEL_FILE_FULL, detail);
}

const POSE_SPEC: TaskEngineSpec<PoseTaskOptions, PoseLandmarker, DetectedPose[]> = {
  label: '자세 인식',
  modelFileFor: poseModelFile,
  runningModeOf: (options) => options.runningMode,
  create: (vision, fileset, model, options, delegate) =>
    vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: options.runningMode,
      numPoses: 1,
      minPoseDetectionConfidence: options.minPoseDetectionConfidence,
      minPosePresenceConfidence: options.minPosePresenceConfidence,
      minTrackingConfidence: options.minTrackingConfidence,
      outputSegmentationMasks: false,
    }),
  apply: (task, options) =>
    task.setOptions({
      runningMode: options.runningMode,
      numPoses: 1,
      minPoseDetectionConfidence: options.minPoseDetectionConfidence,
      minPosePresenceConfidence: options.minPosePresenceConfidence,
      minTrackingConfidence: options.minTrackingConfidence,
    }),
  detect: (task, image, timestamp, mode) => convertPoseLandmarkerResult(mode === 'IMAGE' ? task.detect(image) : task.detectForVideo(image, timestamp)),
  same: samePoseOptions,
  empty: [],
};

/** 자세 인식 엔진 */
export class PoseEngine extends TaskEngine<PoseTaskOptions, PoseLandmarker, DetectedPose[]> {
  constructor(options: TaskEngineOptions = {}) {
    super(POSE_SPEC, DEFAULT_POSE_TASK_OPTIONS, options);
  }
}
