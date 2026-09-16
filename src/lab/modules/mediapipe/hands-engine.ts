/**
 * 손 랜드마크 추론 엔진(PLAN §8.2 P2-08, PD-02·PD-03) — MediaPipe Tasks Vision 0.10.35의 HandLandmarker를 화면(메인 스레드)에서 돌린다.
 *
 * 받기·상태·GPU→CPU 되돌리기 같은 공통 부분은 task-engine.ts에 있고(얼굴·자세와 같은 뼈대), 이 파일은 **손에만 있는 것**을 맡는다:
 * 레거시 Hands(...) 인자 → Tasks 옵션 옮기기, HandLandmarkerResult → 파이썬에 보낼 평범한 값(DetectedHand[]) 바꾸기.
 *
 * 추론 위치 결정(2026-09-16 직접 실험, Edge 153 — 측정값은 index.ts 머리말과 .cache/phase2-requests/mediapipe.md):
 *   (a) 화면(메인 스레드): 표준 WASM 글루(vision_wasm_internal.js)로 뜬다(WASM 기동 261ms, 첫 회). 지금 이 파일이 쓰는 방식.
 *   (b) 모듈 워커 + 표준 글루: "ModuleFactory not set."으로 실패한다(모듈 워커에서는 importScripts가 TypeError라 tasks-vision이
 *       `await import(글루)`로 되돌아가는데, 표준 글루는 self.ModuleFactory를 만들지 않는다).
 *   (b') 모듈 워커 + 모듈 글루(forVisionTasks(base, true)): 뜬다(165ms). 다만 공유 파일 두 개(scripts/vendor-assets.mjs의 복사 목록 +11.2MB,
 *       src/lab/runtime/worker.ts의 모듈 확장 자리)를 고쳐야 해서 병렬 제작 단계에서는 못 한다.
 *
 * Tasks와 레거시의 차이(파이썬 쪽 apc_mediapipe.py 머리말에도 적음): Tasks numHands 기본 1 → 레거시 max_num_hands 기본 2를 이 모듈이 맞춘다,
 * 레거시 min_detection_confidence → minHandDetectionConfidence, min_tracking_confidence → minTrackingConfidence, 레거시에 없는
 * minHandPresenceConfidence는 0.5(Tasks 기본) 고정, model_complexity는 무시(Tasks 손 모델은 한 종류). 좌표계(0~1, z는 손목 기준)와
 * handedness 이름(거울 셀카 기준 Left/Right)은 같다. 모델은 레거시와 달라 같은 신뢰도에서 결과가 조금 다를 수 있다.
 */
import type { Category, HandLandmarker, HandLandmarkerResult, Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision';
import {
  TASKS_VISION_VERSION,
  TaskEngine,
  WASM_BASE_PATH,
  clampNumber,
  asBoolean,
  describeState,
  modelUrl,
  type EngineState,
  type FrameInput,
  type RunningMode,
  type TaskEngineOptions,
  type TaskEngineSpec,
} from './task-engine.ts';

export { TASKS_VISION_VERSION, WASM_BASE_PATH };

/** 손 모델 파일 이름(같은 사이트 public/models/에 둔다 — 운영자가 내려받아 넣는다. 없으면 404 → missing-model) */
export const HAND_MODEL_FILE = 'hand_landmarker.task';

/** 손 모델 주소 */
export const HAND_MODEL_PATH = modelUrl(HAND_MODEL_FILE);

export type HandEngineState = EngineState;

export type { RunningMode };

/** Tasks HandLandmarker 옵션 가운데 이 모듈이 쓰는 것 */
export interface HandTaskOptions {
  readonly numHands: number;
  readonly minHandDetectionConfidence: number;
  readonly minHandPresenceConfidence: number;
  readonly minTrackingConfidence: number;
  readonly runningMode: RunningMode;
}

/** 레거시 Hands(...) 인자 모양(파이썬 apc_mediapipe.Hands가 mediapipe.open payload.options로 보낸다) */
export interface LegacyHandsOptions {
  readonly staticImageMode?: unknown;
  readonly maxNumHands?: unknown;
  readonly modelComplexity?: unknown;
  readonly minDetectionConfidence?: unknown;
  readonly minTrackingConfidence?: unknown;
}

/** 레거시 기본값(mediapipe 0.10.x solutions/hands.py): static False, 손 2개, 신뢰도 0.5·0.5 */
export const DEFAULT_HAND_TASK_OPTIONS: HandTaskOptions = Object.freeze({
  numHands: 2,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  runningMode: 'VIDEO',
});

/** 손 개수 상한(Tasks는 더 받지만 화면·성능을 위해 4까지) */
export const MAX_NUM_HANDS = 4;

/** 화면이 넘겨 준 손 하나(레거시 결과 객체로 바꾸기 쉬운 평범한 값 — postMessage 구조화 복제 가능) */
export interface DetectedHand {
  /** 21개 [x, y, z](x·y는 0~1, z는 손목 기준 깊이) */
  readonly landmarks: number[][];
  /** 21개 [x, y, z](미터, 손 가운데 기준). 재생 입력은 null */
  readonly worldLandmarks: number[][] | null;
  /** 손 좌우(Left=0·Right=1, 점수). 없으면 null */
  readonly handedness: { index: number; score: number; label: string } | null;
}

export type HandFrameInput = FrameInput;

/** 레거시 Hands(...) 인자 → Tasks 옵션. 값이 이상하면 레거시 기본값으로. */
export function taskOptionsFromLegacy(legacy: LegacyHandsOptions | null | undefined): HandTaskOptions {
  const source = legacy ?? {};
  return {
    numHands: Math.round(clampNumber(source.maxNumHands, 1, MAX_NUM_HANDS, DEFAULT_HAND_TASK_OPTIONS.numHands)),
    minHandDetectionConfidence: clampNumber(source.minDetectionConfidence, 0, 1, DEFAULT_HAND_TASK_OPTIONS.minHandDetectionConfidence),
    minHandPresenceConfidence: DEFAULT_HAND_TASK_OPTIONS.minHandPresenceConfidence,
    minTrackingConfidence: clampNumber(source.minTrackingConfidence, 0, 1, DEFAULT_HAND_TASK_OPTIONS.minTrackingConfidence),
    runningMode: asBoolean(source.staticImageMode) ? 'IMAGE' : 'VIDEO',
  };
}

export function sameTaskOptions(a: HandTaskOptions, b: HandTaskOptions): boolean {
  return (
    a.numHands === b.numHands &&
    a.minHandDetectionConfidence === b.minHandDetectionConfidence &&
    a.minHandPresenceConfidence === b.minHandPresenceConfidence &&
    a.minTrackingConfidence === b.minTrackingConfidence &&
    a.runningMode === b.runningMode
  );
}

function landmarkTriples(points: readonly (NormalizedLandmark | Landmark)[]): number[][] {
  return points.map((point) => [point.x, point.y, point.z]);
}

function categoryOf(categories: readonly Category[] | undefined): DetectedHand['handedness'] {
  const first = categories?.[0];
  if (!first) {
    return null;
  }
  const label = first.categoryName || first.displayName || '';
  const index = typeof first.index === 'number' && first.index >= 0 ? first.index : label === 'Left' ? 0 : label === 'Right' ? 1 : -1;
  return { index, score: first.score, label };
}

/**
 * Tasks HandLandmarkerResult → DetectedHand[]. 손 i의 landmarks·worldLandmarks·handedness를 짝지어 준다(길이가 다르면 짧은 쪽까지).
 * 순수 함수라 단위 테스트가 가짜 결과로 검사한다.
 */
export function convertHandLandmarkerResult(result: Pick<HandLandmarkerResult, 'landmarks' | 'worldLandmarks' | 'handedness'>): DetectedHand[] {
  const hands: DetectedHand[] = [];
  for (const [index, points] of result.landmarks.entries()) {
    const world = result.worldLandmarks[index];
    hands.push({
      landmarks: landmarkTriples(points),
      worldLandmarks: world ? landmarkTriples(world) : null,
      handedness: categoryOf(result.handedness[index]),
    });
  }
  return hands;
}

/** 상태를 사람 말로(패널·콘솔 안내) */
export function describeEngineState(state: HandEngineState, detail = ''): string {
  return describeState(state, '손 인식', HAND_MODEL_FILE, detail);
}

const HAND_SPEC: TaskEngineSpec<HandTaskOptions, HandLandmarker, DetectedHand[]> = {
  label: '손 인식',
  modelFileFor: () => HAND_MODEL_FILE,
  runningModeOf: (options) => options.runningMode,
  create: (vision, fileset, model, options, delegate) =>
    vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: model, delegate },
      runningMode: options.runningMode,
      numHands: options.numHands,
      minHandDetectionConfidence: options.minHandDetectionConfidence,
      minHandPresenceConfidence: options.minHandPresenceConfidence,
      minTrackingConfidence: options.minTrackingConfidence,
    }),
  apply: (task, options) =>
    task.setOptions({
      runningMode: options.runningMode,
      numHands: options.numHands,
      minHandDetectionConfidence: options.minHandDetectionConfidence,
      minHandPresenceConfidence: options.minHandPresenceConfidence,
      minTrackingConfidence: options.minTrackingConfidence,
    }),
  detect: (task, image, timestamp, mode) => convertHandLandmarkerResult(mode === 'IMAGE' ? task.detect(image) : task.detectForVideo(image, timestamp)),
  same: sameTaskOptions,
  empty: [],
};

export interface HandEngineOptions extends TaskEngineOptions {
  /** 시험용: 모델 주소를 통째로 바꾼다 */
  readonly modelPath?: string;
}

/** 손 인식 엔진(바깥 모양은 P2-08과 같다: load·configure·detect·dispose·onStateChange). */
export class HandEngine {
  readonly #engine: TaskEngine<HandTaskOptions, HandLandmarker, DetectedHand[]>;

  constructor(options: HandEngineOptions = {}) {
    const { modelPath, ...rest } = options;
    this.#engine = new TaskEngine(HAND_SPEC, DEFAULT_HAND_TASK_OPTIONS, {
      ...rest,
      modelBase: modelPath ? () => modelPath : rest.modelBase,
    });
  }

  get wasmBasePath(): string {
    return this.#engine.wasmBasePath;
  }

  get modelPath(): string {
    return this.#engine.modelPath;
  }

  get state(): HandEngineState {
    return this.#engine.state;
  }

  get detail(): string {
    return this.#engine.detail;
  }

  get options(): HandTaskOptions {
    return this.#engine.options;
  }

  get modelBytes(): number {
    return this.#engine.modelBytes;
  }

  get delegate(): string {
    return this.#engine.delegate;
  }

  onStateChange(listener: (state: HandEngineState) => void): () => void {
    return this.#engine.onStateChange(listener);
  }

  describe(state: HandEngineState = this.state, detail: string = this.detail): string {
    return this.#engine.describe(state, detail);
  }

  load(): Promise<HandEngineState> {
    return this.#engine.load();
  }

  configure(options: HandTaskOptions): Promise<void> {
    return this.#engine.configure(options);
  }

  detect(frame: HandFrameInput, nowMs: number): DetectedHand[] {
    return this.#engine.detect(frame, nowMs);
  }

  dispose(): void {
    this.#engine.dispose();
  }
}
