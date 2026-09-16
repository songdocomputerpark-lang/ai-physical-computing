/**
 * 영상처리 실습실 화면 논리(PLAN §8.2 P2-03, SPEC §6.1, CODE_MAPPING §3.1) — 실습실 공통 틀(LabShell)에 카메라 입력과 출력 창을 잇는다.
 *
 * 흐름
 * 1. 페이지가 mountVisionLab(root)를 부르면 getLabController(root)로 컨트롤러를 받고, 입력 소스 고르기(sources.ts)·출력 창(windows.ts)을 만든다.
 * 2. 실습실이 준비되면(ready) OpenCV(opencv-python, numpy 포함)를 미리 받는다. 받는 동안 단계별 진행(① 파이썬 엔진 ② numpy ③ OpenCV)을
 *    data-vision-stage 요소에 보인다(P2-05가 진행률 막대·1분 개념 카드로 다듬는다).
 * 3. 파이썬 apc_cv2.py의 요청을 lab.onRequest로 받는다(종류는 protocol.ts 머리말):
 *    - camera.open  → 고른 입력 소스를 연다. 웹캠을 못 열면(권한 거부·카메라 없음·사용 중) 한국어 이유를 콘솔에 적고 샘플 입력으로 바꿔 연다.
 *    - camera.read  → 앞 장을 준 뒤 1000/15ms가 지나야 다음 장을 준다(FrameThrottle). 장면을 캔버스에 그려 RGBA 바이트를 transfer로 넘긴다.
 *    - camera.set   → 크기 바꾸기. camera.release → 소스를 놓지 않고(미리 보기·다음 실행에 다시 씀) 읽기 대기만 끝낸다.
 * 4. 워커의 event(window.show·open·close)를 출력 창에 그리고, 출력 화면의 키 입력은 runtime.pushEvent('cv2.keys', 코드)로 파이썬에 보낸다.
 * 5. 제한 모드(JSPI 없음): 파이썬이 기다릴 수 없으므로 실행 직전('run' 이벤트)에 열려 있는 소스의 한 장을 setValue('camera.info'·'camera.frame')로
 *    미리 넣는다. 그러면 cap.read()가 그 한 장을 돌려준다(한 번 실행되고 끝나는 코드만 된다 — PLAN §4.5).
 *
 * 카메라 스트림은 학생이 웹캠을 고르거나 [실행]으로 열릴 때만 켜지고, 페이지를 떠나면(pagehide) 꺼진다. 영상은 브라우저 메모리에만 있고
 * 워커(같은 컴퓨터)로만 간다(PLAN §10). 테스트가 읽는 값: 뿌리의 data-vision-source(id)·data-vision-input-state(closed|opening|open|failed)·
 * data-vision-packages(pending|loading|ready|failed), 입력 상태 글 [data-vision-input-status], 출력 상태 [data-vision-output-status].
 */
import { getLabController, type LabController } from '../controls/lab-shell.ts';
import type { RuntimeRequest } from '../runtime/client.ts';
import { FpsMeter, FrameThrottle, SCREEN_KEYS, type VisionFrame } from './frame.ts';
import { VISION_PACKAGES } from './examples.ts';
import {
  SourceOpenError,
  defaultVisionSourceId,
  findVisionSource,
  listVisionSources,
  setFileImage,
  type OpenedSource,
  type VisionSource,
} from './sources.ts';
import { OutputWindows } from './windows.ts';

export const KEY_CHANNEL = 'cv2.keys';
export const WINDOW_CHANNEL = 'cv2.window';
export const CAMERA_INFO_NAME = 'camera.info';
export const CAMERA_FRAME_NAME = 'camera.frame';

/** VisionLab이 만들어졌을 때 뿌리 요소에 보내는 이름(getVisionLab이 기다린다) */
export const VISION_READY_EVENT = 'apc:vision-ready';

/**
 * 카메라 프레임 훅(흉내 모듈이 ctx.vision().onFrame으로 등록, src/lab/README.md 4절). 파이썬 cap.read()에 답하기 직전에 불린다.
 * frame.data는 답한 뒤 워커로 옮겨져(transfer) 비므로, 훅은 그 자리에서 읽고 보관하려면 복사한다(new Uint8ClampedArray(frame.data)).
 * 훅이 오래 걸리면 파이썬에 가는 프레임이 늦어진다(추론은 파이썬이 request로 넘긴 배열로 한다 — CODE_MAPPING §3.2).
 */
export type FrameHook = (frame: VisionFrame, info: { readonly sourceId: string; readonly now: number }) => void;

/** 단계별 진행 표시의 단계 이름(P2-05가 진행률 막대로 바꾼다) */
export type LoadStage = 'core' | 'numpy' | 'opencv';
export type StageState = 'pending' | 'active' | 'done' | 'failed';

export interface VisionLabElements {
  readonly sourceSelect: HTMLSelectElement | null;
  readonly sourceDescription: HTMLElement | null;
  readonly openButton: HTMLButtonElement | null;
  readonly closeButton: HTMLButtonElement | null;
  readonly fileInput: HTMLInputElement | null;
  readonly fileButton: HTMLButtonElement | null;
  readonly fileName: HTMLElement | null;
  readonly previewHost: HTMLElement | null;
  readonly previewCanvas: HTMLCanvasElement | null;
  readonly previewEmpty: HTMLElement | null;
  readonly inputStatus: HTMLElement | null;
  readonly inputMessage: HTMLElement | null;
  readonly outputTabs: HTMLElement;
  readonly outputStage: HTMLElement;
  readonly outputEmpty: HTMLElement | null;
  readonly outputStatus: HTMLElement | null;
  readonly outputClose: HTMLButtonElement | null;
  readonly screenKeys: HTMLElement | null;
  readonly stageList: HTMLElement | null;
}

interface CameraOpenPayload {
  index?: number;
  capture?: number;
}

interface CameraSetPayload {
  prop?: string;
  value?: number;
}

const PACKAGE_STAGES: Readonly<Record<string, LoadStage>> = Object.freeze({ numpy: 'numpy', 'opencv-python': 'opencv' });

function q<T extends Element>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector);
}

export function readVisionElements(root: HTMLElement): VisionLabElements | null {
  const outputTabs = q<HTMLElement>(root, '[data-vision-output-tabs]');
  const outputStage = q<HTMLElement>(root, '[data-vision-output-stage]');
  if (!outputTabs || !outputStage) {
    return null;
  }
  return {
    sourceSelect: q(root, '[data-vision-source-select]'),
    sourceDescription: q(root, '[data-vision-source-description]'),
    openButton: q(root, '[data-vision-open]'),
    closeButton: q(root, '[data-vision-close]'),
    fileInput: q(root, '[data-vision-file-input]'),
    fileButton: q(root, '[data-vision-file-button]'),
    fileName: q(root, '[data-vision-file-name]'),
    previewHost: q(root, '[data-vision-preview]'),
    previewCanvas: q(root, '[data-vision-preview-canvas]'),
    previewEmpty: q(root, '[data-vision-preview-empty]'),
    inputStatus: q(root, '[data-vision-input-status]'),
    inputMessage: q(root, '[data-vision-input-message]'),
    outputTabs,
    outputStage,
    outputEmpty: q(root, '[data-vision-output-empty]'),
    outputStatus: q(root, '[data-vision-output-status]'),
    outputClose: q(root, '[data-vision-output-close]'),
    screenKeys: q(root, '[data-vision-screen-keys]'),
    stageList: q(root, '[data-vision-stages]'),
  };
}

export class VisionLab {
  readonly root: HTMLElement;
  readonly lab: LabController;
  readonly windows: OutputWindows;
  readonly #elements: VisionLabElements;
  readonly #throttle = new FrameThrottle();
  readonly #inputMeter = new FpsMeter();
  readonly #cleanups: (() => void)[] = [];
  readonly #grabCanvas: HTMLCanvasElement;
  readonly #frameHooks = new Set<FrameHook>();
  #source: OpenedSource | null = null;
  #sourceId: string;
  #opening: Promise<OpenedSource> | null = null;
  #pendingRead: { request: RuntimeRequest; timer: ReturnType<typeof setTimeout> | null } | null = null;
  #running = false;
  #disposed = false;
  #stages: Record<LoadStage, StageState> = { core: 'pending', numpy: 'pending', opencv: 'pending' };
  #statusTimer: ReturnType<typeof setInterval> | null = null;

  constructor(root: HTMLElement, lab: LabController, elements: VisionLabElements) {
    this.root = root;
    this.lab = lab;
    this.#elements = elements;
    this.#grabCanvas = document.createElement('canvas');
    this.windows = new OutputWindows({
      tabs: elements.outputTabs,
      stage: elements.outputStage,
      empty: elements.outputEmpty,
      status: elements.outputStatus,
      closeButton: elements.outputClose,
      onKey: (code) => this.sendKey(code),
      onClose: (name) => lab.runtime.pushEvent(WINDOW_CHANNEL, { name, closed: true }),
    });
    this.#sourceId = defaultVisionSourceId();
    this.#renderSourceSelect();
    this.#wireControls();
    this.#wireRuntime();
    this.#renderStages();
    this.#setInputState('closed');
    this.#statusTimer = setInterval(() => this.#renderInputStatus(), 500);
  }

  /** 지금 고른 입력 소스 id(webcam·sample·file·…) */
  get sourceId(): string {
    return this.#sourceId;
  }

  /** 열린 소스(없으면 null) */
  get openedSource(): OpenedSource | null {
    return this.#source;
  }

  /** 출력 화면의 키를 파이썬(cv2.waitKey)에 보낸다. 실행 중이 아니면 안내만 한다. */
  sendKey(code: number): void {
    if (!this.#running) {
      this.#showInputMessage('키는 코드가 실행 중일 때 cv2.waitKey()로 전달돼요.');
      return;
    }
    this.lab.runtime.pushEvent(KEY_CHANNEL, code);
  }

  /**
   * 카메라 프레임 훅을 등록한다(흉내 모듈용, FrameHook 설명 참고). 파이썬 cap.read()에 답하기 직전마다 불리고, 돌려주는 함수로 푼다.
   * 훅 안의 오류는 콘솔(console.error)에만 적고 프레임 전달은 계속한다.
   */
  onFrame(hook: FrameHook): () => void {
    this.#frameHooks.add(hook);
    return () => {
      this.#frameHooks.delete(hook);
    };
  }

  /** 입력 소스를 고른다(연 소스가 있으면 닫는다). */
  selectSource(id: string): void {
    const source = findVisionSource(id);
    if (!source) {
      return;
    }
    if (this.#sourceId !== id) {
      this.closeSource();
    }
    this.#sourceId = id;
    this.root.dataset.visionSource = id;
    if (this.#elements.sourceSelect && this.#elements.sourceSelect.value !== id) {
      this.#elements.sourceSelect.value = id;
    }
    if (this.#elements.sourceDescription) {
      this.#elements.sourceDescription.textContent = source.description;
    }
    if (this.#elements.fileButton) {
      this.#elements.fileButton.hidden = source.kind !== 'file';
    }
    if (this.#elements.fileName) {
      this.#elements.fileName.hidden = source.kind !== 'file';
    }
  }

  /**
   * 고른 소스를 연다. 웹캠을 못 열면 이유를 콘솔·입력 칸에 적고 샘플 입력으로 바꿔 연다(SPEC §6.1 "카메라 없을 때 샘플").
   * 이미 열려 있으면 그것을 돌려준다.
   */
  async openSource(): Promise<OpenedSource> {
    if (this.#source) {
      return this.#source;
    }
    if (this.#opening) {
      return this.#opening;
    }
    this.#opening = this.#openSelected();
    try {
      return await this.#opening;
    } finally {
      this.#opening = null;
    }
  }

  /** 소스를 닫는다(카메라 끄기). 읽기를 기다리던 파이썬 요청은 None으로 답한다. */
  closeSource(): void {
    this.#cancelPendingRead(null);
    const source = this.#source;
    this.#source = null;
    this.#throttle.reset();
    this.#inputMeter.reset();
    if (source) {
      source.close();
    }
    if (this.#elements.previewHost) {
      for (const video of this.#elements.previewHost.querySelectorAll('video')) {
        video.remove();
      }
    }
    if (this.#elements.previewCanvas) {
      this.#elements.previewCanvas.hidden = true;
    }
    if (this.#elements.previewEmpty) {
      this.#elements.previewEmpty.hidden = false;
    }
    this.#setInputState('closed');
    this.#renderInputStatus();
  }

  /** 지금 장면 한 장을 RGBA로 읽는다(소스가 없거나 아직 준비 전이면 null). */
  grabFrame(): VisionFrame | null {
    const source = this.#source;
    if (!source) {
      return null;
    }
    const width = source.width;
    const height = source.height;
    if (width <= 0 || height <= 0) {
      return null;
    }
    const canvas = this.#grabCanvas;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return null;
    }
    const now = performance.now();
    if (!source.grab(ctx, width, height, now)) {
      return null;
    }
    // 웹캠은 <video>가 미리 보기이고, 그 밖의 소스는 방금 그린 장면을 미리 보기 캔버스에도 보인다.
    if (!source.previewElement) {
      this.#drawPreview(canvas);
    }
    const image = ctx.getImageData(0, 0, width, height);
    return { width, height, data: image.data };
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    if (this.#statusTimer !== null) {
      clearInterval(this.#statusTimer);
    }
    for (const cleanup of this.#cleanups.splice(0)) {
      cleanup();
    }
    this.closeSource();
    this.windows.dispose();
  }

  async #openSelected(): Promise<OpenedSource> {
    const selected = findVisionSource(this.#sourceId) ?? findVisionSource('sample');
    if (!selected) {
      throw new SourceOpenError('unsupported', '쓸 수 있는 입력 소스가 없어요.');
    }
    this.#setInputState('opening');
    this.#showInputMessage(selected.kind === 'webcam' ? '카메라를 켜는 중이에요. 브라우저가 물으면 "허용"을 눌러 주세요.' : '');
    try {
      const opened = await selected.open();
      this.#attach(opened, selected);
      return opened;
    } catch (error) {
      const failure = error instanceof SourceOpenError ? error : new SourceOpenError('unknown', error instanceof Error ? error.message : String(error));
      if (selected.kind === 'sample') {
        this.#setInputState('failed');
        this.#showInputMessage(failure.message);
        throw failure;
      }
      // 웹캠·파일을 못 열면 샘플 입력으로 바꿔 연다.
      this.lab.appendConsole(`[안내] ${failure.message}\n`, 'notice');
      this.#showInputMessage(failure.message);
      const sample = findVisionSource('sample');
      if (!sample) {
        this.#setInputState('failed');
        throw failure;
      }
      this.selectSource('sample');
      this.#setInputState('opening');
      const opened = await sample.open();
      this.#attach(opened, sample);
      return opened;
    }
  }

  #attach(opened: OpenedSource, source: VisionSource): void {
    this.#source = opened;
    this.#throttle.reset();
    this.#inputMeter.reset();
    const { previewHost, previewCanvas, previewEmpty } = this.#elements;
    if (previewEmpty) {
      previewEmpty.hidden = true;
    }
    if (opened.previewElement && previewHost) {
      opened.previewElement.className = 'vision-preview__video';
      previewHost.append(opened.previewElement);
      if (previewCanvas) {
        previewCanvas.hidden = true;
      }
    } else if (previewCanvas) {
      previewCanvas.hidden = false;
      // 첫 장을 바로 보여 준다.
      this.grabFrame();
    }
    this.#setInputState('open');
    if (source.kind === 'webcam') {
      this.#showInputMessage('카메라를 켰어요.');
    } else if (source.kind === 'sample') {
      this.#showInputMessage('샘플 입력(실습실이 그린 도형)으로 실습해요.');
    }
    this.#renderInputStatus();
  }

  #drawPreview(from: HTMLCanvasElement): void {
    const canvas = this.#elements.previewCanvas;
    if (!canvas) {
      return;
    }
    if (canvas.width !== from.width || canvas.height !== from.height) {
      canvas.width = from.width;
      canvas.height = from.height;
    }
    canvas.getContext('2d')?.drawImage(from, 0, 0);
  }

  #setInputState(state: 'closed' | 'opening' | 'open' | 'failed'): void {
    this.root.dataset.visionInputState = state;
    const { openButton, closeButton } = this.#elements;
    if (openButton) {
      openButton.hidden = state === 'open' || state === 'opening';
      openButton.disabled = state === 'opening';
    }
    if (closeButton) {
      closeButton.hidden = state !== 'open';
    }
  }

  #showInputMessage(text: string): void {
    if (this.#elements.inputMessage) {
      this.#elements.inputMessage.textContent = text;
    }
  }

  #renderInputStatus(): void {
    const status = this.#elements.inputStatus;
    if (!status) {
      return;
    }
    const source = this.#source;
    if (!source) {
      status.textContent = '입력이 꺼져 있어요.';
      status.dataset.width = '';
      status.dataset.height = '';
      return;
    }
    const label = findVisionSource(this.#sourceId)?.label ?? this.#sourceId;
    const fps = this.#inputMeter.fps(performance.now());
    const fpsText = this.#running ? ` · 파이썬에 ${fps.toFixed(0)}fps로 전달` : '';
    status.textContent = `${label} ${source.width}×${source.height}${fpsText}`;
    status.dataset.width = String(source.width);
    status.dataset.height = String(source.height);
    status.dataset.fps = String(fps);
  }

  #renderSourceSelect(): void {
    const select = this.#elements.sourceSelect;
    if (select) {
      select.replaceChildren();
      for (const source of listVisionSources()) {
        const option = document.createElement('option');
        option.value = source.id;
        option.textContent = source.isAvailable() ? source.label : `${source.label} — 이 브라우저에서는 안 돼요`;
        option.disabled = !source.isAvailable();
        select.append(option);
      }
    }
    this.selectSource(this.#sourceId);
    if (this.#elements.screenKeys) {
      const host = this.#elements.screenKeys;
      host.replaceChildren();
      for (const key of SCREEN_KEYS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lab-button lab-button--small vision-key';
        button.dataset.visionKey = String(key.code);
        button.textContent = key.label;
        button.setAttribute('aria-label', key.hint);
        button.addEventListener('click', () => this.sendKey(key.code));
        host.append(button);
      }
    }
  }

  #wireControls(): void {
    const e = this.#elements;
    const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement | null, type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
      if (!target) {
        return;
      }
      target.addEventListener(type, handler);
      this.#cleanups.push(() => target.removeEventListener(type, handler));
    };
    listen(e.sourceSelect, 'change', () => {
      this.selectSource(e.sourceSelect?.value ?? this.#sourceId);
    });
    listen(e.openButton, 'click', () => {
      void this.openSource().catch(() => undefined);
    });
    listen(e.closeButton, 'click', () => this.closeSource());
    listen(e.fileButton, 'click', () => e.fileInput?.click());
    listen(e.fileInput, 'change', () => {
      const file = e.fileInput?.files?.[0];
      if (!file) {
        return;
      }
      void setFileImage(file)
        .then((info) => {
          if (e.fileName) {
            e.fileName.textContent = `${info.name} (${info.width}×${info.height})`;
          }
          this.selectSource('file');
          this.closeSource();
          return this.openSource();
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.#showInputMessage(message);
          this.lab.appendConsole(`[안내] ${message}\n`, 'notice');
        });
      if (e.fileInput) {
        e.fileInput.value = '';
      }
    });
    const onPageHide = () => this.closeSource();
    window.addEventListener('pagehide', onPageHide);
    this.#cleanups.push(() => window.removeEventListener('pagehide', onPageHide));
  }

  #wireRuntime(): void {
    const { lab } = this;
    const runtime = lab.runtime;
    this.#cleanups.push(
      lab.onRequest('camera.open', (request) => this.#handleOpen(request)),
      lab.onRequest('camera.read', (request) => this.#handleRead(request)),
      lab.onRequest('camera.set', (request) => this.#handleSet(request)),
      lab.onRequest('camera.release', (request) => {
        this.#cancelPendingRead(null);
        request.reply(true);
      }),
      runtime.on('event', ({ kind, payload }) => this.#handleEvent(kind, payload)),
      runtime.on('progress', ({ stage, phase, names }) => {
        if (stage === 'core') {
          this.#setStage('core', 'active');
          return;
        }
        for (const name of names ?? []) {
          const key = PACKAGE_STAGES[name];
          if (key) {
            this.#setStage(key, phase === 'done' ? 'done' : 'active');
          }
        }
      }),
      runtime.on('ready', () => {
        this.#setStage('core', 'done');
        void this.#preloadPackages();
      }),
      runtime.on('state', ({ state }) => {
        if (state === 'failed') {
          this.#setStage('core', 'failed');
        }
      }),
      lab.on('run', () => {
        this.#running = true;
        this.windows.clear();
        this.#throttle.reset();
        this.#inputMeter.reset();
        this.#prefillLimitedMode();
      }),
      lab.on('done', () => {
        this.#running = false;
        this.#cancelPendingRead(null);
        this.#renderInputStatus();
      }),
    );
    if (runtime.info) {
      this.#setStage('core', 'done');
      void this.#preloadPackages();
    }
  }

  async #preloadPackages(): Promise<void> {
    const runtime = this.lab.runtime;
    const missing = VISION_PACKAGES.filter((name) => !runtime.loadedPackages.includes(name));
    if (missing.length === 0) {
      this.#setStage('numpy', 'done');
      this.#setStage('opencv', 'done');
      return;
    }
    this.root.dataset.visionPackages = 'loading';
    try {
      await runtime.loadPackages(VISION_PACKAGES);
      this.#setStage('numpy', 'done');
      this.#setStage('opencv', 'done');
      this.root.dataset.visionPackages = 'ready';
    } catch (error) {
      // 실행 중이거나 워커가 다시 시작된 경우: 실행할 때 import 문 분석으로 다시 받는다.
      this.root.dataset.visionPackages = 'failed';
      this.lab.appendConsole(`[안내] OpenCV를 미리 받지 못했어요(실행할 때 다시 받아요): ${error instanceof Error ? error.message : String(error)}\n`, 'notice');
    }
  }

  #setStage(stage: LoadStage, state: StageState): void {
    if (this.#stages[stage] === 'done' && state === 'active') {
      return;
    }
    this.#stages[stage] = state;
    this.#renderStages();
  }

  #renderStages(): void {
    const list = this.#elements.stageList;
    if (!list) {
      return;
    }
    const all = (Object.keys(this.#stages) as LoadStage[]).every((key) => this.#stages[key] === 'done');
    list.dataset.state = all ? 'done' : 'loading';
    for (const item of list.querySelectorAll<HTMLElement>('[data-vision-stage]')) {
      const key = item.dataset.visionStage as LoadStage | undefined;
      if (key && key in this.#stages) {
        item.dataset.state = this.#stages[key];
      }
    }
  }

  /** 제한 모드: 실행 직전에 한 장을 파이썬 쪽 값으로 넣어 둔다(cap.read()가 이 장을 돌려준다). */
  #prefillLimitedMode(): void {
    const runtime = this.lab.runtime;
    if (!runtime.info?.limited) {
      return;
    }
    if (!this.#source) {
      const selected = findVisionSource(this.#sourceId);
      if (selected?.kind === 'sample' || selected?.kind === 'file') {
        // 샘플·파일은 기다림 없이 열 수 있지만 open()이 약속이라 이번 실행에는 못 미친다 → 다음 실행부터 들어간다.
        void this.openSource().catch(() => undefined);
      }
      this.#showInputMessage('제한 모드에서는 먼저 [입력 켜기]를 누른 뒤 실행해야 cap.read()가 한 장을 받아요.');
      runtime.setValue(CAMERA_INFO_NAME, null);
      runtime.setValue(CAMERA_FRAME_NAME, null);
      return;
    }
    const frame = this.grabFrame();
    const source = this.#source;
    runtime.setValue(CAMERA_INFO_NAME, { ok: true, width: source.width, height: source.height, source: this.#sourceId, fps: source.fps });
    runtime.setValue(CAMERA_FRAME_NAME, frame ? { width: frame.width, height: frame.height, data: frame.data } : null);
  }

  #handleOpen(request: RuntimeRequest): void {
    const payload = (request.payload ?? {}) as CameraOpenPayload;
    const index = typeof payload.index === 'number' ? payload.index : 0;
    if (index !== 0) {
      this.lab.appendConsole(`[안내] 이 실습실에서는 0번 카메라만 쓸 수 있어요(받은 번호: ${index}). cv2.VideoCapture(0)으로 바꿔 주세요.\n`, 'notice');
      request.reply({ ok: false });
      return;
    }
    this.openSource().then(
      (source) => {
        request.reply({ ok: true, width: source.width, height: source.height, source: this.#sourceId, fps: source.fps });
      },
      () => {
        request.reply({ ok: false });
      },
    );
  }

  #handleRead(request: RuntimeRequest): void {
    if (!this.#source) {
      request.reply(null);
      return;
    }
    // 앞 요청이 아직 답을 기다리면(같은 실행에서 겹치는 일은 없지만) 먼저 것을 None으로 끝낸다.
    this.#cancelPendingRead(null);
    const delay = this.#throttle.nextDelay(performance.now());
    const deliver = () => {
      this.#pendingRead = null;
      const frame = this.grabFrame();
      if (!frame) {
        // 카메라 첫 장이 아직 안 왔으면 조금 뒤 다시 본다(파이썬은 그동안 기다린다).
        this.#pendingRead = { request, timer: setTimeout(deliver, 40) };
        return;
      }
      const now = performance.now();
      this.#throttle.mark(now);
      this.#inputMeter.tick(now);
      if (this.#frameHooks.size > 0) {
        const info = { sourceId: this.#sourceId, now };
        for (const hook of this.#frameHooks) {
          try {
            hook(frame, info);
          } catch (error) {
            console.error('카메라 프레임 훅에서 오류가 났어요.', error);
          }
        }
      }
      request.reply({ width: frame.width, height: frame.height, data: frame.data }, [frame.data.buffer as ArrayBuffer]);
    };
    if (delay <= 0) {
      deliver();
    } else {
      this.#pendingRead = { request, timer: setTimeout(deliver, delay) };
    }
  }

  #cancelPendingRead(value: unknown): void {
    const pending = this.#pendingRead;
    if (!pending) {
      return;
    }
    this.#pendingRead = null;
    if (pending.timer !== null) {
      clearTimeout(pending.timer);
    }
    pending.request.reply(value);
  }

  #handleSet(request: RuntimeRequest): void {
    const payload = (request.payload ?? {}) as CameraSetPayload;
    const source = this.#source;
    if (!source || typeof payload.value !== 'number' || (payload.prop !== 'width' && payload.prop !== 'height')) {
      request.reply({ ok: false, width: source?.width ?? 0, height: source?.height ?? 0 });
      return;
    }
    const width = payload.prop === 'width' ? payload.value : source.width;
    const height = payload.prop === 'height' ? payload.value : source.height;
    source.resize(width, height).then(
      (size) => {
        this.#renderInputStatus();
        request.reply({ ok: size.width === Math.round(width) && size.height === Math.round(height), ...size });
      },
      () => request.reply({ ok: false, width: source.width, height: source.height }),
    );
  }

  #handleEvent(kind: string, payload: unknown): void {
    const data = (payload ?? {}) as { name?: unknown; width?: unknown; height?: unknown; data?: unknown };
    switch (kind) {
      case 'window.show':
        if (typeof data.name === 'string' && typeof data.width === 'number' && typeof data.height === 'number' && data.data instanceof Uint8Array) {
          this.windows.show({ name: data.name, width: data.width, height: data.height, data: data.data });
        }
        return;
      case 'window.open':
        if (typeof data.name === 'string') {
          this.windows.open(data.name);
        }
        return;
      case 'window.close':
        this.windows.markDestroyed(typeof data.name === 'string' ? data.name : null);
        return;
      default:
        return;
    }
  }
}

const mounted = new WeakMap<HTMLElement, Promise<VisionLab>>();

/** 영상처리 실습실 뿌리([data-lab])에 카메라·창 논리를 붙인다. LabShell 컨트롤러가 준비될 때까지 기다린다. */
export function mountVisionLab(root: HTMLElement | null): Promise<VisionLab> {
  if (!root) {
    return Promise.reject(new Error('영상처리 실습실 뿌리 요소([data-lab])를 찾지 못했어요.'));
  }
  const existing = mounted.get(root);
  if (existing) {
    return existing;
  }
  const promise = getLabController(root).then((lab) => {
    const elements = readVisionElements(root);
    if (!elements) {
      throw new Error('영상처리 실습실 화면 요소(data-vision-output-tabs·data-vision-output-stage)가 없어요.');
    }
    const vision = new VisionLab(root, lab, elements);
    root.dispatchEvent(new CustomEvent(VISION_READY_EVENT, { detail: { vision } }));
    return vision;
  });
  mounted.set(root, promise);
  return promise;
}

/**
 * 흉내 모듈·페이지 스크립트가 VisionLab을 받는 방법(아직 안 만들어졌으면 만들어질 때까지 기다린다 — getLabController와 같은 방식).
 * 영상처리 실습실이 아닌 뿌리에서는 영원히 기다리므로, 모듈은 ctx.vision()(src/lab/modules/host.ts — data-vision-io가 없으면 null)을 쓴다.
 */
export function getVisionLab(root: HTMLElement | null): Promise<VisionLab> {
  return new Promise((resolve, reject) => {
    if (!root) {
      reject(new Error('영상처리 실습실 뿌리 요소([data-lab])를 찾지 못했어요.'));
      return;
    }
    const existing = mounted.get(root);
    if (existing) {
      existing.then(resolve, reject);
      return;
    }
    root.addEventListener(VISION_READY_EVENT, (event) => resolve((event as CustomEvent<{ vision: VisionLab }>).detail.vision), { once: true });
  });
}
