/**
 * MediaPipe Tasks Vision 엔진 공통 뼈대(PLAN §8.2 P2-08 손 · P2-09 얼굴·자세, PD-02·PD-03).
 *
 * 손(hands-engine.ts)·얼굴 그물(face-engine.ts)·얼굴 검출(face-detection-engine.ts)·자세(pose-engine.ts)가 똑같이 하는 일을 한곳에 모았다:
 * 1. 모델 파일(.task)을 **같은 사이트**에서 받는다(public/models/…). 없거나(404) 너무 작으면 'missing-model' — 실습실이 재생 입력으로 잇는다.
 * 2. @mediapipe/tasks-vision을 처음 필요할 때 import하고(별도 청크) WASM도 같은 사이트(public/vendor/mediapipe/<판>/wasm)에서 받는다.
 * 3. GPU 대리 실행기로 만들어 보고 안 되면 CPU로 바꾼다.
 * 4. 옵션이 바뀌면 setOptions로 고치고, 모델 파일 자체가 바뀌면(자세의 lite↔full) 다시 받는다.
 * 5. detect(프레임 RGBA, 시각) — 영상 모드는 단조 증가하는 시각이 필요하다.
 * 외부 주소로는 한 번도 가지 않는다(원칙 2, 브라우저 테스트가 검사).
 *
 * 추론 위치는 **화면(메인 스레드)**이다(2026-09-16 실험 — index.ts 머리말과 .cache/phase2-requests/mediapipe.md 3번).
 * 이 클래스의 바깥 모양(load·configure·detect·dispose)은 그대로 워커로 옮길 수 있게 두었다.
 */
import { withBase } from '../../../lib/url.ts';

/** 설치된 @mediapipe/tasks-vision 판(scripts/vendor-assets.mjs가 이 판 이름의 폴더에 WASM을 복사한다). 단위 테스트가 package.json과 대조한다. */
export const TASKS_VISION_VERSION = '0.10.35';

/** WASM 글루·바이너리 위치(같은 사이트). FilesetResolver가 뒤에 /vision_wasm_internal.js를 붙이므로 끝 /는 뗀다. */
export const WASM_BASE_PATH = withBase(`vendor/mediapipe/${TASKS_VISION_VERSION}/wasm`).replace(/\/$/u, '');

/** 모델 파일 주소(같은 사이트). 운영자가 public/models/에 넣기 전에는 404 → missing-model */
export function modelUrl(fileName: string): string {
  return withBase(`models/${fileName}`);
}

export type EngineState = 'idle' | 'loading' | 'ready' | 'missing-model' | 'failed';

export type RunningMode = 'IMAGE' | 'VIDEO';

export type TasksVisionModule = typeof import('@mediapipe/tasks-vision');

export type VisionFileset = Awaited<ReturnType<TasksVisionModule['FilesetResolver']['forVisionTasks']>>;

/** Tasks가 만들어 주는 인식기(모두 close()가 있다) */
export interface EngineTask {
  close(): void;
}

/** 파이썬 process()가 보낸 한 장(RGBA 바이트, 위→아래·왼쪽→오른쪽) */
export interface FrameInput {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

/** 엔진마다 다른 부분(모델 이름·만들기·옵션 적용·추론) */
export interface TaskEngineSpec<TOptions extends object, TTask extends EngineTask, TResult> {
  /** 안내 문장에 쓰는 이름: '손 인식' · '얼굴 인식' · '자세 인식' */
  readonly label: string;
  /** 옵션에 따라 쓰는 모델 파일 이름(자세는 저사양 모드에서 lite) */
  modelFileFor(options: TOptions): string;
  /** 실행 모드(영상/사진) */
  runningModeOf(options: TOptions): RunningMode;
  create(vision: TasksVisionModule, fileset: VisionFileset, model: Uint8Array, options: TOptions, delegate: 'GPU' | 'CPU'): Promise<TTask>;
  apply(task: TTask, options: TOptions): Promise<void>;
  detect(task: TTask, image: ImageData, timestamp: number, mode: RunningMode): TResult;
  /** 옵션 두 개가 같은지(같으면 setOptions를 하지 않는다) */
  same(a: TOptions, b: TOptions): boolean;
  /** 준비 전·오류일 때 돌려줄 값 */
  readonly empty: TResult;
}

export interface TaskEngineOptions {
  readonly wasmBasePath?: string;
  /** 시험용: models/ 대신 다른 주소에서 받기 */
  readonly modelBase?: (fileName: string) => string;
  /** 시험용: fetch를 바꿔 넣는다 */
  readonly fetchModel?: (url: string) => Promise<Response>;
}

/** 상태를 사람 말로(패널·콘솔 안내) */
export function describeState(state: EngineState, label: string, modelFile: string, detail = ''): string {
  switch (state) {
    case 'idle':
      return `${label} 엔진은 ${label} 코드가 처음 돌 때 준비돼요.`;
    case 'loading':
      return `${label} 엔진(MediaPipe Tasks)을 준비하는 중이에요…`;
    case 'ready':
      return `${label} 엔진 준비 끝(MediaPipe Tasks Vision ${TASKS_VISION_VERSION}${detail ? `, ${detail}` : ''}).`;
    case 'missing-model':
      return (
        `${label} 모델 파일(models/${modelFile})이 아직 이 사이트에 없어요. ` +
        "운영자가 파일을 넣기 전까지는 입력 소스를 '재생 입력(합성 좌표)'으로 바꿔 실습해요."
      );
    case 'failed':
      return `${label} 엔진(MediaPipe Tasks)을 준비하지 못했어요${detail ? `: ${detail}` : '.'}`;
    default:
      return '';
  }
}

/**
 * 인식기 하나를 감싼 엔진. 파이썬 쪽에 같은 solution 객체가 여럿 있어도 인식기는 하나이고 옵션은 마지막 configure가 정한다
 * (자료에는 같은 코드에 같은 solution을 두 번 만드는 예제가 없다).
 */
export class TaskEngine<TOptions extends object, TTask extends EngineTask, TResult> {
  readonly wasmBasePath: string;
  readonly #spec: TaskEngineSpec<TOptions, TTask, TResult>;
  readonly #modelBase: (fileName: string) => string;
  readonly #fetchModel: (url: string) => Promise<Response>;
  readonly #listeners = new Set<(state: EngineState) => void>();
  #state: EngineState = 'idle';
  #detail = '';
  #task: TTask | null = null;
  #vision: TasksVisionModule | null = null;
  #fileset: VisionFileset | null = null;
  #modelBytes: Uint8Array | null = null;
  #modelFile = '';
  #options: TOptions;
  #applied: TOptions | null = null;
  #loading: Promise<EngineState> | null = null;
  #configuring: Promise<void> = Promise.resolve();
  #lastTimestamp = 0;
  #delegate: 'GPU' | 'CPU' | '' = '';

  constructor(spec: TaskEngineSpec<TOptions, TTask, TResult>, defaults: TOptions, options: TaskEngineOptions = {}) {
    this.#spec = spec;
    this.#options = defaults;
    this.wasmBasePath = options.wasmBasePath ?? WASM_BASE_PATH;
    this.#modelBase = options.modelBase ?? modelUrl;
    this.#fetchModel = options.fetchModel ?? ((url) => fetch(url));
  }

  get label(): string {
    return this.#spec.label;
  }

  get state(): EngineState {
    return this.#state;
  }

  /** 상태 설명에 붙는 세부(대리 실행기 이름 또는 오류 한 줄) */
  get detail(): string {
    return this.#detail;
  }

  get options(): TOptions {
    return this.#options;
  }

  /** 지금 쓰는 모델 파일 이름 */
  get modelFile(): string {
    return this.#modelFile || this.#spec.modelFileFor(this.#options);
  }

  /** 모델 파일 주소(같은 사이트) */
  get modelPath(): string {
    return this.#modelBase(this.modelFile);
  }

  /** 받은 모델 크기(바이트, 준비 전이면 0) */
  get modelBytes(): number {
    return this.#modelBytes?.byteLength ?? 0;
  }

  get delegate(): string {
    return this.#delegate;
  }

  describe(state: EngineState = this.#state, detail = this.#detail): string {
    return describeState(state, this.#spec.label, this.modelFile, detail);
  }

  onStateChange(listener: (state: EngineState) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #setState(state: EngineState, detail = ''): void {
    this.#state = state;
    this.#detail = detail;
    for (const listener of [...this.#listeners]) {
      try {
        listener(state);
      } catch (error) {
        console.error(`${this.#spec.label} 엔진 상태 알림 중 오류`, error);
      }
    }
  }

  /** 엔진을 준비한다(한 번만, 다시 부르면 같은 약속). 결과 상태를 돌려준다(예외를 내지 않는다). */
  load(): Promise<EngineState> {
    if (this.#state === 'ready' || this.#state === 'missing-model') {
      return Promise.resolve(this.#state);
    }
    if (this.#loading) {
      return this.#loading;
    }
    this.#loading = this.#doLoad().finally(() => {
      this.#loading = null;
    });
    return this.#loading;
  }

  async #doLoad(): Promise<EngineState> {
    this.#setState('loading');
    try {
      const wanted = this.#spec.modelFileFor(this.#options);
      if (!this.#modelBytes || this.#modelFile !== wanted) {
        this.#modelFile = wanted;
        const response = await this.#fetchModel(this.#modelBase(wanted));
        if (!response.ok) {
          this.#modelBytes = null;
          this.#setState('missing-model', `${response.status}`);
          return this.#state;
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength < 1024) {
          // 자리 파일(.gitkeep 같은 것)이나 오류 페이지 — 모델이 아니다.
          this.#modelBytes = null;
          this.#setState('missing-model', '파일이 너무 작아요');
          return this.#state;
        }
        this.#modelBytes = bytes;
      }
      if (!this.#vision) {
        this.#vision = await import('@mediapipe/tasks-vision');
      }
      if (!this.#fileset) {
        this.#fileset = await this.#vision.FilesetResolver.forVisionTasks(this.wasmBasePath);
      }
      this.#task = await this.#createTask(this.#options);
      this.#applied = this.#options;
      this.#setState('ready', this.#delegate);
    } catch (error) {
      this.#task = null;
      this.#setState('failed', error instanceof Error ? (error.message.split('\n')[0] ?? error.name) : String(error));
    }
    return this.#state;
  }

  async #createTask(options: TOptions): Promise<TTask> {
    if (!this.#vision || !this.#fileset || !this.#modelBytes) {
      throw new Error('엔진 준비 순서가 어긋났어요(WASM·모델 먼저).');
    }
    try {
      const task = await this.#spec.create(this.#vision, this.#fileset, this.#modelBytes, options, 'GPU');
      this.#delegate = 'GPU';
      return task;
    } catch (gpuError) {
      console.warn(`${this.#spec.label} GPU 대리 실행기를 못 써서 CPU로 바꿔요.`, gpuError);
      const task = await this.#spec.create(this.#vision, this.#fileset, this.#modelBytes, options, 'CPU');
      this.#delegate = 'CPU';
      return task;
    }
  }

  /**
   * 옵션을 바꾼다. 준비 전이면 기억해 두고 준비될 때 쓴다. 모델 파일이 달라지면(자세 lite↔full) 다시 받도록 되돌린다.
   */
  configure(options: TOptions): Promise<void> {
    const previousFile = this.#spec.modelFileFor(this.#options);
    this.#options = options;
    if (this.#spec.modelFileFor(options) !== previousFile && (this.#state === 'ready' || this.#state === 'missing-model')) {
      this.#closeTask();
      this.#modelBytes = null;
      this.#applied = null;
      this.#setState('idle');
      return Promise.resolve();
    }
    if (this.#state !== 'ready' || !this.#task) {
      return Promise.resolve();
    }
    this.#configuring = this.#configuring.then(async () => {
      const task = this.#task;
      if (!task || (this.#applied && this.#spec.same(this.#applied, this.#options))) {
        return;
      }
      const next = this.#options;
      await this.#spec.apply(task, next);
      this.#applied = next;
    });
    return this.#configuring;
  }

  /** 한 장을 추론한다(준비 전이면 빈 결과). RGBA 바이트 수가 크기와 맞지 않으면 오류. */
  detect(frame: FrameInput, nowMs: number): TResult {
    const task = this.#task;
    if (this.#state !== 'ready' || !task) {
      return this.#spec.empty;
    }
    const { width, height, data } = frame;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || data.byteLength !== width * height * 4) {
      throw new Error(`${this.#spec.label}에 넘긴 이미지 크기가 맞지 않아요: ${width}×${height}, 바이트 ${data.byteLength}(기대 ${width * height * 4}).`);
    }
    // ImageData는 보통 ArrayBuffer를 보는 Uint8ClampedArray만 받는다. 워커에서 온 바이트는 늘 ArrayBuffer라 같은 메모리를 그대로 본다(복사 없음).
    const buffer = data.buffer;
    const pixels = buffer instanceof ArrayBuffer ? new Uint8ClampedArray(buffer, data.byteOffset, data.byteLength) : new Uint8ClampedArray(data);
    const image = new ImageData(pixels, width, height);
    const mode = this.#spec.runningModeOf(this.#applied ?? this.#options);
    // detectForVideo는 단조 증가하는 시각(ms)을 요구한다.
    const timestamp = Math.max(Math.round(nowMs), this.#lastTimestamp + 1);
    this.#lastTimestamp = timestamp;
    return this.#spec.detect(task, image, timestamp, mode);
  }

  #closeTask(): void {
    try {
      this.#task?.close();
    } catch {
      // 이미 닫힘
    }
    this.#task = null;
  }

  dispose(): void {
    this.#closeTask();
    this.#applied = null;
    this.#setState('idle');
  }
}

/** 값이 숫자가 아니거나 범위 밖이면 기본값·범위 안으로 */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

/** 파이썬이 보낸 True/1/'True'를 참으로 */
export function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === 'True' || value === 'true') return true;
  if (value === 0 || value === 'False' || value === 'false') return false;
  return fallback;
}
