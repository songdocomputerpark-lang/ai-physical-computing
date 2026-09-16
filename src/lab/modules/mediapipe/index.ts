/**
 * mediapipe 흉내 모듈의 화면 쪽(PLAN §8.2 P2-08 "손 + 합성 재생 입력", P2-09 "얼굴·자세", CODE_MAPPING §3.2, PD-03·PD-30).
 * 파이썬 짝은 같은 폴더의 apc_mediapipe.py(+ 학생이 import하는 mediapipe.py), 규약은 src/lab/README.md 4절.
 *
 * 하는 일
 * 1. 입력 소스 '재생 입력(합성 좌표)'(replay-source.ts)을 영상처리 실습실 목록에 더한다. 실습실 화면이 먼저 그려졌으면 <option>도 더한다.
 * 2. 요청 처리(파이썬 → 화면). 요청 이름은 두 개뿐이고 payload.solution으로 갈린다('hands' | 'face_mesh' | 'face_detection' | 'pose'):
 *    - mediapipe.open  { solution, id, options{…} }
 *        → 입력 소스가 샘플(카메라 없음)이고 아직 열리지 않았으면 재생 입력으로 바꾼다(SPEC §6.1 "카메라 없을 때", PD-30).
 *        → 재생 입력이면 그 solution에 맞는 동작(손/얼굴/자세)으로 바꾸고 엔진을 받지 않는다 → { ok, engine: 'replay' }.
 *        → 아니면 엔진(hands·face·pose·face-detection engine)을 준비·설정하고 { ok, engine: 'ready'|'missing-model'|'failed'|'loading', message }.
 *    - mediapipe.detect { solution, id, width, height, data: Uint8Array(RGBA) }
 *        → 재생 입력이면 마지막으로 그린 장의 합성 좌표, 샘플 입력(카메라를 못 열어 바뀐 경우)이면 같은 시각의 합성 좌표(안내 한 번),
 *          그 밖(웹캠·그림 파일)이면 Tasks 엔진 추론. 모델이 없으면 빈 목록 + 안내 한 번.
 *        답: 손 { hands: […] }, 얼굴 그물 { faces: [[x,y,z]…] }, 얼굴 검출 { detections: [{score, box, keypoints}] }, 자세 { poses: [[x,y,z,visibility]…] }.
 *        재생 입력에서는 넘어온 이미지의 방향 표시를 보고 `cv2.flip(frame, 1)` 여부를 알아내 좌표를 함께 뒤집는다(mirror.ts) —
 *        진짜 카메라+모델은 "파이썬이 넘긴 배열"로 추론해 저절로 맞지만(CODE_MAPPING §3.1), 재생 입력은 그려 둔 좌표를 돌려주기 때문이다.
 * 3. 패널(panel.astro): 엔진 상태, 재생 동작 고르기(저장 이름 module:mediapipe:replay-sequence — [기록 지우기]가 지움),
 *    손 개수·신뢰도 조절 막대(코드의 Hands(...) 값에서 시작해 실행 중에 바꿔 보기 — 다음 process()부터 반영, 코드 값은 그대로),
 *    저사양 모드(자세 모델을 가벼운 것으로, 저장 이름 module:mediapipe:low-spec — PD-20).
 *
 * 추론 위치 결정(2026-09-16 직접 실험, Edge 153 + 개발 서버, 측정값과 근거는 .cache/phase2-requests/mediapipe.md): **화면(메인 스레드)에서 추론한다.**
 *   실험 방법: 모델이 아직 없으므로 가짜 모델 바이트(4KB 0)를 넣어 createFromOptions를 부른다 — WASM이 뜨면 "Unable to open zip archive."(모델
 *   파싱 단계까지 갔다는 뜻), 못 뜨면 그 앞에서 다른 오류가 난다. 세 경우 모두 MediaPipe 관련 사이트 밖 요청 0건(jsDelivr Pyodide만).
 *   (a) 화면(메인 스레드) + 표준 글루 vision_wasm_internal.js: WASM 기동 성공, import 98ms + fileset 44ms + WASM 기동 261ms(첫 회).
 *   (b) 파이썬과 같은 종류의 모듈 워커 + 표준 글루: **"ModuleFactory not set."으로 실패**(9ms).
 *   (b') 모듈 워커 + 모듈 글루: 되지만 공유 파일 두 개(scripts/vendor-assets.mjs +11.2MB, src/lab/runtime/worker.ts)를 고쳐야 해 병렬 제작 단계에서는 못 한다.
 *   파이썬은 어차피 process()에서 답을 기다리며 멈춰 있으므로(JSPI) 어디서 돌리든 걸리는 시간은 같다. 엔진 경계(task-engine.ts)는 그대로 워커로 옮길 수 있다.
 */
import { readItem, writeItem } from '../../../lib/storage.ts';
import type { RuntimeRequest } from '../../runtime/client.ts';
import type { VisionLab } from '../../vision/vision-lab.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import {
  FaceDetectionEngine,
  FaceEngine,
  taskOptionsFromLegacyFaceDetection,
  taskOptionsFromLegacyFaceMesh,
  type DetectedFace,
  type DetectedFaceBox,
} from './face-engine.ts';
import {
  DEFAULT_HAND_TASK_OPTIONS,
  HandEngine,
  MAX_NUM_HANDS,
  describeEngineState,
  taskOptionsFromLegacy,
  type DetectedHand,
  type HandEngineState,
  type HandTaskOptions,
  type LegacyHandsOptions,
} from './hands-engine.ts';
import manifest from './manifest.ts';
import { detectMirroredFrame, mirrorFaces, mirrorHands, mirrorPoses } from './mirror.ts';
import { PoseEngine, taskOptionsFromLegacyPose, type DetectedPose } from './pose-engine.ts';
import { REPLAY_SOURCE_ID, registerReplaySource, replaySource, type ReplaySource } from './replay-source.ts';
import { kindForSolution, type ReplayKind } from './sequences.ts';
import type { SyntheticFace } from './synthetic-face.ts';
import type { SyntheticHand } from './synthetic-hands.ts';
import type { SyntheticPose } from './synthetic-pose.ts';
import type { EngineState } from './task-engine.ts';

export const REQUEST_OPEN = 'mediapipe.open';
export const REQUEST_DETECT = 'mediapipe.detect';

/** 재생 동작을 기억하는 저장 이름(src/lib/storage.ts 규칙, ctx.storageName('replay-sequence')과 같은 열쇠) */
export const SEQUENCE_STORAGE_NAME = 'module:mediapipe:replay-sequence';

/** 저사양 모드를 기억하는 저장 이름(PD-20 — 자세 모델을 가벼운 것으로) */
export const LOW_SPEC_STORAGE_NAME = 'module:mediapipe:low-spec';

export type DetectionSource = 'tasks' | 'replay' | 'none';

/** 이 모듈이 다루는 solution 이름(파이썬 apc_mediapipe.py의 SOLUTION_* 와 같다) */
export const SUPPORTED_SOLUTIONS: readonly string[] = Object.freeze(['hands', 'face_mesh', 'face_detection', 'pose']);

/** 사람 말 이름(안내 문장용) */
export const SOLUTION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  hands: '손 인식',
  face_mesh: '얼굴 그물',
  face_detection: '얼굴 검출',
  pose: '자세 인식',
});

export interface OpenPayload {
  solution?: unknown;
  id?: unknown;
  options?: Record<string, unknown> | null;
}

export interface DetectPayload {
  solution?: unknown;
  id?: unknown;
  width?: unknown;
  height?: unknown;
  data?: unknown;
}

/** 합성 손(재생 입력) → 화면이 파이썬에 주는 모양 */
export function detectedFromSynthetic(hands: readonly SyntheticHand[], limit: number): DetectedHand[] {
  return hands.slice(0, Math.max(1, limit)).map((hand) => ({
    landmarks: hand.landmarks.map(([x, y, z]) => [x, y, z]),
    worldLandmarks: null,
    handedness: { ...hand.handedness },
  }));
}

/** 합성 얼굴(재생 입력) → 파이썬에 주는 점 목록(478개) */
export function facesFromSynthetic(faces: readonly SyntheticFace[], limit: number): number[][][] {
  return faces.slice(0, Math.max(1, limit)).map((face) => face.landmarks.map(([x, y, z]) => [x, y, z]));
}

/** 합성 자세(재생 입력) → 파이썬에 주는 점 목록(33개, visibility 포함) */
export function posesFromSynthetic(poses: readonly SyntheticPose[]): number[][][] {
  return poses.slice(0, 1).map((body) => body.landmarks.map(([x, y, z, visibility]) => [x, y, z, visibility]));
}

/**
 * 합성 얼굴 → 얼굴 검출 결과(상자 + 점 6개). 점 순서는 레거시 FaceKeyPoint와 같다:
 * 오른눈(468 눈동자 가운데)·왼눈(473)·코끝(1)·입 가운데(13·14 사이)·오른귀(234)·왼귀(454).
 */
export function detectionsFromSynthetic(faces: readonly SyntheticFace[]): DetectedFaceBox[] {
  return faces.map((face) => {
    const point = (index: number): [number, number] => [face.landmarks[index]?.[0] ?? 0, face.landmarks[index]?.[1] ?? 0];
    const [mouthTopX, mouthTopY] = point(13);
    const [mouthBottomX, mouthBottomY] = point(14);
    return {
      score: face.score,
      box: { ...face.box },
      keypoints: [point(468), point(473), point(1), [(mouthTopX + mouthBottomX) / 2, (mouthTopY + mouthBottomY) / 2], point(234), point(454)],
    };
  });
}

registerReplaySource();

interface PanelElements {
  readonly status: HTMLElement | null;
  readonly engine: HTMLElement | null;
  readonly solution: HTMLElement | null;
  readonly sequence: HTMLSelectElement | null;
  readonly sequenceNote: HTMLElement | null;
  readonly lowSpec: HTMLInputElement | null;
  readonly sliders: Map<keyof HandTaskOptions, HTMLInputElement>;
  readonly values: Map<keyof HandTaskOptions, HTMLElement>;
  readonly codeOptions: HTMLElement | null;
}

function readPanel(panel: HTMLElement | null): PanelElements {
  const sliders = new Map<keyof HandTaskOptions, HTMLInputElement>();
  const values = new Map<keyof HandTaskOptions, HTMLElement>();
  if (panel) {
    for (const input of panel.querySelectorAll<HTMLInputElement>('[data-mediapipe-opt]')) {
      sliders.set(input.dataset.mediapipeOpt as keyof HandTaskOptions, input);
    }
    for (const element of panel.querySelectorAll<HTMLElement>('[data-mediapipe-opt-value]')) {
      values.set(element.dataset.mediapipeOptValue as keyof HandTaskOptions, element);
    }
  }
  return {
    status: panel?.querySelector<HTMLElement>('[data-mediapipe-status]') ?? null,
    engine: panel?.querySelector<HTMLElement>('[data-mediapipe-engine]') ?? null,
    solution: panel?.querySelector<HTMLElement>('[data-mediapipe-solution]') ?? null,
    sequence: panel?.querySelector<HTMLSelectElement>('[data-mediapipe-sequence]') ?? null,
    sequenceNote: panel?.querySelector<HTMLElement>('[data-mediapipe-sequence-note]') ?? null,
    lowSpec: panel?.querySelector<HTMLInputElement>('[data-mediapipe-low-spec]') ?? null,
    sliders,
    values,
    codeOptions: panel?.querySelector<HTMLElement>('[data-mediapipe-code-options]') ?? null,
  };
}

/** 실습실 화면의 입력 소스 목록에 재생 입력 <option>이 없으면 더한다(VisionLab이 목록을 이 모듈보다 먼저 그렸을 때). */
export function ensureReplayOption(root: HTMLElement, replay: ReplaySource): HTMLOptionElement | null {
  const select = root.querySelector<HTMLSelectElement>('[data-vision-source-select]');
  if (!select) {
    return null;
  }
  const existing = select.querySelector<HTMLOptionElement>(`option[value="${REPLAY_SOURCE_ID}"]`);
  if (existing) {
    return existing;
  }
  const option = document.createElement('option');
  option.value = replay.id;
  option.textContent = replay.label;
  const sample = select.querySelector<HTMLOptionElement>('option[value="sample"]');
  if (sample?.nextSibling) {
    select.insertBefore(option, sample.nextSibling);
  } else {
    select.append(option);
  }
  return option;
}

function formatOptionValue(name: keyof HandTaskOptions, value: number | string): string {
  if (name === 'numHands') {
    return `${value}개`;
  }
  return typeof value === 'number' ? value.toFixed(2) : String(value);
}

/** 종류별 동작 이름(재생 동작 <optgroup>) */
const KIND_LABELS: Readonly<Record<ReplayKind, string>> = Object.freeze({ hands: '손', face: '얼굴', pose: '자세' });

async function mount(context: LabModuleContext): Promise<LabModuleHandle | void> {
  const vision = await context.vision();
  if (!vision) {
    // 영상처리 실습실이 아니면(카메라 칸이 없으면) 할 일이 없다.
    return undefined;
  }
  const replay = replaySource;
  ensureReplayOption(context.root, replay);

  const hands = new HandEngine();
  const faces = new FaceEngine();
  const poses = new PoseEngine();
  const boxes = new FaceDetectionEngine();
  const engines = { hands, face_mesh: faces, pose: poses, face_detection: boxes } as const;
  type Engine = (typeof engines)[keyof typeof engines];
  const engineFor = (solution: string): Engine => engines[solution as keyof typeof engines] ?? hands;

  const elements = readPanel(context.panel);
  let codeOptions: HandTaskOptions = DEFAULT_HAND_TASK_OPTIONS;
  let liveOptions: HandTaskOptions = DEFAULT_HAND_TASK_OPTIONS;
  let lowSpec = readItem(LOW_SPEC_STORAGE_NAME) === '1';
  let activeSolution = 'hands';
  const noticed = new Set<string>();
  const cleanups: (() => void)[] = [];

  const noticeOnce = (key: string, text: string) => {
    if (noticed.has(key)) {
      return;
    }
    noticed.add(key);
    context.notice(text);
  };

  const describe = (solution: string, state: EngineState, detail?: string): string =>
    solution === 'hands' ? describeEngineState(state, detail ?? hands.detail) : engineFor(solution).describe(state, detail);

  const renderStatus = (solution = activeSolution, state: EngineState = engineFor(solution).state) => {
    if (elements.solution) {
      elements.solution.textContent = SOLUTION_LABELS[solution] ?? solution;
    }
    if (elements.engine) {
      elements.engine.dataset.state = state;
      elements.engine.textContent =
        state === 'ready' ? '준비됨' : state === 'loading' ? '준비 중' : state === 'missing-model' ? '모델 없음' : state === 'failed' ? '실패' : '대기';
    }
    if (elements.status) {
      const replaying = vision.sourceId === REPLAY_SOURCE_ID;
      elements.status.textContent = replaying
        ? `재생 입력이 켜져 있어 합성 좌표를 돌려줘요(엔진·모델을 받지 않아요). ${describe(solution, state)}`
        : describe(solution, state);
    }
  };

  const renderSliders = (options: HandTaskOptions) => {
    for (const [name, input] of elements.sliders) {
      const value = options[name];
      if (typeof value === 'number') {
        input.value = String(value);
        const label = elements.values.get(name);
        if (label) {
          label.textContent = formatOptionValue(name, value);
        }
        input.setAttribute('aria-valuetext', formatOptionValue(name, value));
      }
    }
    if (elements.codeOptions) {
      elements.codeOptions.textContent = `코드의 값: 손 ${codeOptions.numHands}개, 검출 신뢰도 ${codeOptions.minHandDetectionConfidence.toFixed(2)}, 추적 신뢰도 ${codeOptions.minTrackingConfidence.toFixed(2)}, ${codeOptions.runningMode === 'IMAGE' ? '사진 모드(static_image_mode=True)' : '영상 모드'}`;
    }
  };

  const setSequence = (id: string, remember = true) => {
    if (!replay.setSequence(id)) {
      return;
    }
    if (remember) {
      writeItem(SEQUENCE_STORAGE_NAME, id);
    }
    if (elements.sequence) {
      elements.sequence.value = id;
    }
    if (elements.sequenceNote) {
      elements.sequenceNote.textContent = replay.sequence.description;
    }
    context.root.dataset.mediapipeReplay = id;
    context.root.dataset.mediapipeReplayKind = replay.sequenceKind;
  };

  // 재생 동작 목록(손·얼굴·자세를 묶음으로, 저장한 것이 있으면 그것부터)
  if (elements.sequence) {
    elements.sequence.replaceChildren();
    const groups = new Map<ReplayKind, HTMLOptGroupElement>();
    for (const item of replay.listSequences()) {
      let group = groups.get(item.kind);
      if (!group) {
        group = document.createElement('optgroup');
        group.label = KIND_LABELS[item.kind];
        groups.set(item.kind, group);
        elements.sequence.append(group);
      }
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.label} (${item.frames}장)`;
      group.append(option);
    }
    const saved = readItem(SEQUENCE_STORAGE_NAME);
    setSequence(saved && replay.setSequence(saved) ? saved : replay.sequenceId, false);
    const onSequence = () => setSequence(elements.sequence?.value ?? '');
    elements.sequence.addEventListener('change', onSequence);
    cleanups.push(() => elements.sequence?.removeEventListener('change', onSequence));
  }
  context.root.dataset.mediapipeReplay = replay.sequenceId;
  context.root.dataset.mediapipeReplayKind = replay.sequenceKind;

  // 저사양 모드: 자세 모델을 가벼운 것으로(PD-20). 바꾸면 다음 실행부터 반영된다(모델 파일을 다시 받는다).
  if (elements.lowSpec) {
    elements.lowSpec.checked = lowSpec;
    const onLowSpec = () => {
      lowSpec = elements.lowSpec?.checked ?? false;
      writeItem(LOW_SPEC_STORAGE_NAME, lowSpec ? '1' : '0');
      context.root.dataset.mediapipeLowSpec = lowSpec ? 'yes' : 'no';
      void poses.configure({ ...poses.options, lowSpec });
    };
    elements.lowSpec.addEventListener('change', onLowSpec);
    cleanups.push(() => elements.lowSpec?.removeEventListener('change', onLowSpec));
  }
  context.root.dataset.mediapipeLowSpec = lowSpec ? 'yes' : 'no';

  // 조절 막대(손 인식): 움직이면 실행 중인 엔진·재생 입력에 바로 반영(코드 값은 그대로)
  for (const [name, input] of elements.sliders) {
    const onInput = () => {
      const raw = Number(input.value);
      const value = name === 'numHands' ? Math.min(MAX_NUM_HANDS, Math.max(1, Math.round(raw))) : Math.min(1, Math.max(0, raw));
      liveOptions = { ...liveOptions, [name]: value };
      const label = elements.values.get(name);
      if (label) {
        label.textContent = formatOptionValue(name, value);
      }
      input.setAttribute('aria-valuetext', formatOptionValue(name, value));
    };
    const onChange = () => {
      onInput();
      void hands.configure(liveOptions);
    };
    input.addEventListener('input', onInput);
    input.addEventListener('change', onChange);
    cleanups.push(() => {
      input.removeEventListener('input', onInput);
      input.removeEventListener('change', onChange);
    });
  }

  for (const [solution, engine] of Object.entries(engines)) {
    cleanups.push(
      engine.onStateChange((state) => {
        if (solution === activeSolution) {
          renderStatus(solution, state);
        }
      }),
    );
  }
  renderSliders(liveOptions);
  renderStatus();

  /** solution에 맞는 옵션을 엔진에 넣는다(레거시 인자 → Tasks 옵션). */
  const configureFor = (solution: string, options: Record<string, unknown> | null): Promise<void> => {
    if (solution === 'hands') {
      codeOptions = taskOptionsFromLegacy(options as LegacyHandsOptions | null);
      liveOptions = codeOptions;
      renderSliders(liveOptions);
      return hands.configure(liveOptions);
    }
    if (solution === 'face_mesh') {
      return faces.configure(taskOptionsFromLegacyFaceMesh(options));
    }
    if (solution === 'pose') {
      return poses.configure(taskOptionsFromLegacyPose(options, lowSpec));
    }
    return boxes.configure(taskOptionsFromLegacyFaceDetection(options));
  };

  /** 지금 기억하고 있는 옵션을 엔진에 다시 넣는다(엔진을 늦게 준비했을 때 — 코드의 값을 잃지 않는다). */
  const reapply = (solution: string): Promise<void> => {
    if (solution === 'hands') return hands.configure(liveOptions);
    if (solution === 'face_mesh') return faces.configure(faces.options);
    if (solution === 'pose') return poses.configure({ ...poses.options, lowSpec });
    return boxes.configure(boxes.options);
  };

  const handleOpen = async (request: RuntimeRequest) => {
    const payload = (request.payload ?? {}) as OpenPayload;
    const solution = typeof payload.solution === 'string' ? payload.solution : 'hands';
    if (!SUPPORTED_SOLUTIONS.includes(solution)) {
      request.fail(`이 실습실은 mediapipe.solutions.${solution}을(를) 아직 지원하지 않아요(손·얼굴 그물·얼굴 검출·자세만 돼요).`);
      return;
    }
    activeSolution = solution;
    await configureFor(solution, payload.options ?? null);

    // 카메라가 없어 샘플 입력이 골라져 있고 아직 열리지 않았으면 재생 입력으로 바꾼다(도형 영상에는 손·얼굴이 없다).
    if (vision.sourceId === 'sample' && vision.openedSource === null) {
      vision.selectSource(REPLAY_SOURCE_ID);
      noticeOnce('auto-replay', `카메라 없이 실습해요: 입력 소스를 '${replay.label}'로 바꿨어요. 실습실이 만든 좌표가 카메라 대신 들어가요.`);
    }
    context.root.dataset.mediapipeOpened = solution;

    if (vision.sourceId === REPLAY_SOURCE_ID) {
      // 재생 동작이 이 solution과 다른 종류면(예: 손 동작인데 얼굴을 찾는 코드) 알맞은 동작으로 바꾼다.
      const changed = replay.ensureKind(kindForSolution(solution));
      if (changed) {
        setSequence(changed, false);
        noticeOnce(`replay:${changed}`, `재생 입력의 동작을 '${replay.sequence.label}'로 바꿨어요(${SOLUTION_LABELS[solution]} 코드라서요).`);
      }
      renderStatus(solution, engineFor(solution).state);
      request.reply({ ok: true, engine: 'replay', message: null });
      return;
    }
    const engine = engineFor(solution);
    const state = await engine.load();
    await reapply(solution);
    renderStatus(solution, state);
    if (state === 'missing-model' || state === 'failed') {
      noticeOnce(`engine:${solution}:${state}`, describe(solution, state, engine.detail));
    }
    request.reply({ ok: true, engine: state, message: state === 'ready' ? null : describe(solution, state, engine.detail) });
  };

  // 재생 입력에서 학생 코드가 영상을 좌우로 뒤집었는지(화면 왼쪽 위 방향 표시로 알아낸다 — mirror.ts).
  // 표시를 못 찾은 장(손이 구석을 가렸거나 학생이 그림을 덮어 그린 경우)은 바로 앞의 판단을 그대로 쓴다.
  let lastMirrored = false;
  const mirroredNow = (payload: DetectPayload): boolean => {
    const data = payload.data;
    if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray) || typeof payload.width !== 'number' || typeof payload.height !== 'number') {
      return lastMirrored;
    }
    const found = detectMirroredFrame({ width: payload.width, height: payload.height, data });
    if (found !== null) {
      lastMirrored = found;
      context.root.dataset.mediapipeMirrored = found ? 'yes' : 'no';
    }
    return lastMirrored;
  };

  /** 재생 좌표로 답을 만든다(뒤집힌 영상이면 좌표도 함께 뒤집는다). */
  const replyFromReplay = (request: RuntimeRequest, solution: string, mirrored: boolean, now: number, useLastDrawn: boolean) => {
    const frame = useLastDrawn ? replay.currentFrame(now) : replay.frameAt(now).frame;
    if (solution === 'hands') {
      const list = mirrored ? mirrorHands(frame.hands) : frame.hands;
      request.reply({ ok: true, hands: detectedFromSynthetic(list, liveOptions.numHands), source: 'replay' });
      return;
    }
    const faceList = mirrored ? mirrorFaces(frame.faces) : frame.faces;
    if (solution === 'face_mesh') {
      request.reply({ ok: true, faces: facesFromSynthetic(faceList, faces.options.numFaces), source: 'replay' });
      return;
    }
    if (solution === 'face_detection') {
      request.reply({ ok: true, detections: detectionsFromSynthetic(faceList), source: 'replay' });
      return;
    }
    const poseList = mirrored ? mirrorPoses(frame.poses) : frame.poses;
    request.reply({ ok: true, poses: posesFromSynthetic(poseList), source: 'replay' });
  };

  /** 엔진 추론 결과로 답을 만든다. */
  const replyFromEngine = (request: RuntimeRequest, solution: string, frame: { width: number; height: number; data: Uint8Array | Uint8ClampedArray }, now: number) => {
    if (solution === 'hands') {
      request.reply({ ok: true, hands: hands.detect(frame, now), source: 'tasks' });
      return;
    }
    if (solution === 'face_mesh') {
      const found: DetectedFace[] = faces.detect(frame, now);
      request.reply({ ok: true, faces: found.map((face) => face.landmarks), source: 'tasks' });
      return;
    }
    if (solution === 'face_detection') {
      request.reply({ ok: true, detections: boxes.detect(frame, now), source: 'tasks' });
      return;
    }
    const found: DetectedPose[] = poses.detect(frame, now);
    request.reply({
      ok: true,
      poses: found.slice(0, 1).map((body) => body.landmarks),
      poseWorlds: found[0]?.worldLandmarks ? [found[0].worldLandmarks] : null,
      source: 'tasks',
    });
  };

  /** 아무것도 찾지 못했을 때의 답(파이썬은 None으로 바꾼다) */
  const replyEmpty = (request: RuntimeRequest, solution: string) => {
    if (solution === 'hands') {
      request.reply({ ok: true, hands: [], source: 'none' });
    } else if (solution === 'face_mesh') {
      request.reply({ ok: true, faces: [], source: 'none' });
    } else if (solution === 'face_detection') {
      request.reply({ ok: true, detections: [], source: 'none' });
    } else {
      request.reply({ ok: true, poses: [], source: 'none' });
    }
  };

  const handleDetect = (request: RuntimeRequest) => {
    const payload = (request.payload ?? {}) as DetectPayload;
    const solution = typeof payload.solution === 'string' ? payload.solution : 'hands';
    if (!SUPPORTED_SOLUTIONS.includes(solution)) {
      request.fail(`이 실습실은 mediapipe.solutions.${solution}을(를) 아직 지원하지 않아요(손·얼굴 그물·얼굴 검출·자세만 돼요).`);
      return;
    }
    activeSolution = solution;
    const now = performance.now();
    const openedKind = vision.openedSource?.kind ?? null;
    try {
      if (openedKind === 'replay' || (openedKind === null && vision.sourceId === REPLAY_SOURCE_ID)) {
        // 학생 코드가 cv2.flip(frame, 1)로 뒤집었으면 좌표도 함께 뒤집어야 뼈대가 그림 위에 그려진다(mirror.ts).
        replyFromReplay(request, solution, mirroredNow(payload), now, true);
        return;
      }
      if (openedKind === 'sample') {
        noticeOnce(
          'sample-replay',
          `입력이 샘플(움직이는 도형)이라 사람이 없어요. 대신 합성 좌표를 돌려줘요 — 입력 소스를 '${replay.label}'로 바꾸면 화면에도 점과 선이 보여요.`,
        );
        replyFromReplay(request, solution, false, now, false);
        return;
      }
      const engine = engineFor(solution);
      if (engine.state === 'idle') {
        void engine.load().then((state) => {
          void reapply(solution);
          renderStatus(solution, state);
        });
      }
      if (engine.state !== 'ready') {
        if (engine.state === 'missing-model' || engine.state === 'failed') {
          noticeOnce(`engine:${solution}:${engine.state}`, describe(solution, engine.state, engine.detail));
        } else {
          noticeOnce(
            `engine:${solution}:loading`,
            `${SOLUTION_LABELS[solution]} 엔진을 준비하는 동안에는 찾지 못한 것으로 답해요(잠깐 뒤 다음 프레임부터 됩니다).`,
          );
        }
        replyEmpty(request, solution);
        return;
      }
      const width = typeof payload.width === 'number' ? payload.width : 0;
      const height = typeof payload.height === 'number' ? payload.height : 0;
      const data = payload.data;
      if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) {
        request.fail('인식에 넘긴 이미지 바이트 모양이 이상해요(Uint8Array가 아니에요).');
        return;
      }
      replyFromEngine(request, solution, { width, height, data }, now);
    } catch (error) {
      request.fail(`${SOLUTION_LABELS[solution]} 중 오류가 났어요: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  context.onRequest(REQUEST_OPEN, (request) => {
    void handleOpen(request).catch((error: unknown) => {
      request.fail(`인식 엔진을 준비하지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
    });
  });
  context.onRequest(REQUEST_DETECT, handleDetect);

  context.onLab('run', () => {
    noticed.clear();
    lastMirrored = false;
    delete context.root.dataset.mediapipeOpened;
    delete context.root.dataset.mediapipeMirrored;
  });

  const onSourceChange = () => renderStatus();
  const sourceSelect = context.root.querySelector<HTMLSelectElement>('[data-vision-source-select]');
  sourceSelect?.addEventListener('change', onSourceChange);
  cleanups.push(() => sourceSelect?.removeEventListener('change', onSourceChange));

  context.showPanel();
  return {
    dispose() {
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
      for (const engine of Object.values(engines)) {
        engine.dispose();
      }
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;

export type { HandEngineState, VisionLab };
