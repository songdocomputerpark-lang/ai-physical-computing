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
 * 판 1.1.0에서 더한 것
 * 6. **실행 중에 입력 소스를 바꾸면 새 소스로 이어 간다**(미해결 200): 입력이 켜져 있을 때 소스를 바꾸면(웹캠 ↔ 샘플 ↔ 그림 파일 ↔ 재생 입력,
 *    카메라 바꾸기 포함) 기다리던 cap.read()를 None으로 끝내지 않고 붙들어 두었다가(#holdReads) 새 소스의 첫 장으로 답한다 — 전에는 빈 답을
 *    받은 학생 코드가 AttributeError로 멈췄다. 새 소스는 앞 소스와 같은 크기로 연다. [입력 끄기]는 전처럼 빈 답(False, None)을 준다
 *    (진짜 OpenCV에서 카메라를 뽑은 것과 같다 — 실행 중이면 콘솔에 까닭을 한 줄 적는다).
 *    그림 파일을 아직 고르지 않았으면 고를 때까지 기다린다(그동안 코드는 cap.read()에서 쉰다 — [정지]는 그대로 된다).
 * 7. **카메라 고르기**(미해결 121): 카메라가 두 대 이상이면 [카메라] 칸이 보인다(camera-devices.ts — 허락 전에는 이름을 몰라 "카메라 1·2",
 *    가상 카메라는 뒤로 미루고 앞에 "가상 카메라:" 표시). 학생이 고른 장치는 deviceId로 이 브라우저에만 기억한다(저장 이름 vision:camera —
 *    [기록 지우기]가 지운다, 장치 이름은 저장하지 않음). 고르지 않았으면 웹캠 소스가 가상 카메라를 건너뛰고 진짜 카메라를 연다(sources.ts).
 * 8. **까만 영상 감지**(미해결 121): 웹캠을 켠 뒤 2초 동안 들어온 장면이 모두 거의 까맣거나(black-frame.ts) 4초 동안 한 장도 오지 않으면
 *    미리 보기 아래에 안내를 띄운다(camera-notice.ts — [다른 카메라로 바꾸기]·[샘플로 계속]·도움말 링크). 밝은 장이 오면 저절로 사라진다.
 *    1.1.0 검토 반영(2026-09-29): 안내가 화면 밖(휴대폰 — 출력 칸을 보는 중)이면 한 번 화면 안으로 옮기고, 안내가 풀리면(밝아짐·입력 바꿈)
 *    콘솔에도 한 줄을 남겨 "콘솔에 결과가 나왔어요" 칸에 옛 안내가 남지 않게 한다. 안내 단추를 키보드로 누르면 안내가 숨기 전에 초점을
 *    [카메라]·입력 소스 칸으로 옮긴다(초점이 문서로 사라지지 않게). 입력 상태 줄은 fps가 0.5초마다 바뀌어 낭독하지 않는다(aria-live off —
 *    한 번짜리 알림은 [data-vision-input-message] role=status로만).
 *
 * 카메라 스트림은 학생이 웹캠을 고르거나 [실행]으로 열릴 때만 켜지고, 페이지를 떠나면(pagehide) 꺼진다. 영상은 브라우저 메모리에만 있고
 * 워커(같은 컴퓨터)로만 간다(PLAN §10). 테스트가 읽는 값: 뿌리의 data-vision-source(id)·data-vision-input-state(closed|opening|open|failed)·
 * data-vision-packages(pending|loading|ready|failed)·data-vision-camera-check(idle|watching|ok|black|no-frames)·data-vision-camera-kind
 * (normal|virtual|infrared — 켠 카메라의 종류, 웹캠이 아니면 빈 값)·data-vision-camera-count(아는 카메라 수)·data-vision-hold-reads(yes|no),
 * 입력 상태 글 [data-vision-input-status], 출력 상태 [data-vision-output-status].
 */
import { readItem, removeItem, writeItem } from '../../lib/storage.ts';
import { getLabController, type LabController } from '../controls/lab-shell.ts';
import { RECORDS_CLEARED_EVENT } from '../controls/records.ts';
import { revealElement } from '../controls/reveal.ts';
import type { RuntimeRequest } from '../runtime/client.ts';
import type { BlackVerdict, BlackWatchSummary } from './black-frame.ts';
import { VISION_CAMERA_STORAGE_NAME, cameraName, cameraOptions, canChooseCameras, pickCamera, type CameraDevice } from './camera-devices.ts';
import { cameraNotice, cameraOpenedMessage } from './camera-notice.ts';
import { VideoBlackWatcher } from './camera-stream.ts';
import { codeShowsVideo } from './code-uses.ts';
import { FpsMeter, FrameThrottle, SCREEN_KEYS, type VisionFrame } from './frame.ts';
import { VISION_PACKAGES } from './examples.ts';
import {
  SourceOpenError,
  currentFileImage,
  defaultVisionSourceId,
  findVisionSource,
  listCameras,
  listVisionSources,
  setFileImage,
  type OpenOptions,
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
 * cap.read()에 "장이 없다"고 답하는 값. JS null은 Pyodide 314에서 None이 아니라 jsnull로 가서 apc_cv2.read()의 `frame is None` 검사를
 * 지나쳐 AttributeError('JsNull' object has no attribute 'width')가 났다 — [입력 끄기]·입력 바꾸기 뒤 학생 코드가 ok를 확인해도 멈춘
 * 까닭(미해결 200, 2026-09-28 브라우저에서 재현). undefined는 None으로 가서 read()가 (False, None)을 돌려준다(board-console의 jsnull 메모와 같은 까닭).
 */
const NO_FRAME = undefined;

/**
 * 카메라 프레임 훅(흉내 모듈이 ctx.vision().onFrame으로 등록, src/lab/README.md 4절). 파이썬 cap.read()에 답하기 직전에 불린다.
 * frame.data는 답한 뒤 워커로 옮겨져(transfer) 비므로, 훅은 그 자리에서 읽고 보관하려면 복사한다(new Uint8ClampedArray(frame.data)).
 * 훅이 오래 걸리면 파이썬에 가는 프레임이 늦어진다(추론은 파이썬이 request로 넘긴 배열로 한다 — CODE_MAPPING §3.2).
 */
export type FrameHook = (frame: VisionFrame, info: { readonly sourceId: string; readonly now: number }) => void;

/** 단계별 진행 표시의 단계 이름(P2-05가 진행률 막대로 바꾼다) */
export type LoadStage = 'core' | 'numpy' | 'opencv';
export type StageState = 'pending' | 'active' | 'done' | 'failed';

/** 켠 카메라를 지켜본 결과(뿌리 data-vision-camera-check) */
export type CameraCheckState = 'idle' | BlackVerdict;

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
  /** "이 예제 실습 방법" 상자와 단계 목록(2026-09-24 Phase 4 통합 — 없으면 그리지 않는다) */
  readonly practiceBox?: HTMLElement | null;
  readonly practiceSteps?: HTMLElement | null;
  /** [카메라] 고르기 칸(판 1.1.0 — 없으면 고르기 없이 알아서 고른 카메라만 쓴다) */
  readonly cameraRow?: HTMLElement | null;
  readonly cameraSelect?: HTMLSelectElement | null;
  /** 까만 영상 안내 상자와 그 안의 글·단추(판 1.1.0 — 없으면 입력 칸 안내 줄과 콘솔에만 적는다) */
  readonly cameraNotice?: HTMLElement | null;
  readonly cameraNoticeTitle?: HTMLElement | null;
  readonly cameraNoticeLead?: HTMLElement | null;
  readonly cameraNoticeCauses?: HTMLElement | null;
  readonly cameraNoticeSample?: HTMLElement | null;
  readonly cameraOtherButton?: HTMLButtonElement | null;
  readonly cameraSampleButton?: HTMLButtonElement | null;
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
    practiceBox: q(root, '[data-vision-practice]'),
    practiceSteps: q(root, '[data-vision-practice-steps]'),
    cameraRow: q(root, '[data-vision-camera]'),
    cameraSelect: q(root, '[data-vision-camera-select]'),
    cameraNotice: q(root, '[data-vision-camera-notice]'),
    cameraNoticeTitle: q(root, '[data-vision-camera-notice-title]'),
    cameraNoticeLead: q(root, '[data-vision-camera-notice-lead]'),
    cameraNoticeCauses: q(root, '[data-vision-camera-notice-causes]'),
    cameraNoticeSample: q(root, '[data-vision-camera-notice-sample]'),
    cameraOtherButton: q(root, '[data-vision-camera-other]'),
    cameraSampleButton: q(root, '[data-vision-camera-sample]'),
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
  /** 받는 중 안내로 바꾸기 전의 입력·출력 칸 빈 안내(되돌릴 때 쓴다 — 출력 칸 글에는 <code>가 있다) */
  #emptyHtml: { preview: string; output: string } | null = null;
  /** [실행]을 눌렀는데 numpy·OpenCV를 아직 받는 중이라 코드가 기다리는 동안인지 */
  #packageWaitShown = false;
  /** 지금 실행한 코드가 영상(cv2)을 쓰나 — 받는 중 안내 글을 고른다(codeShowsVideo) */
  #runShowsVideo = true;
  /** 소스를 닫거나 바꿀 때마다 올린다 — 열던 중인 소스가 늦게 열리면 버리고 지금 고른 소스를 연다(닫았으면 열지 않는다) */
  #generation = 0;
  /** 마지막으로 closeSource()가 올린 #generation 값(열던 중에 입력을 껐는지 가른다) */
  #closedGeneration = -1;
  /** 입력을 바꾸는 동안 파이썬의 cap.read()를 빈 답으로 끝내지 않고 새 소스가 열릴 때까지 붙들어 둔다(미해결 200) */
  #holdReads = false;
  /** 바꿀 때 앞 소스의 크기(새 소스를 같은 크기로 연다 — 학생 코드가 받는 장의 크기가 바뀌지 않게) */
  #switchSize: { width: number; height: number } | null = null;
  /** 이 컴퓨터의 카메라 목록(허락 뒤에는 이름이 있다) */
  #cameras: CameraDevice[] = [];
  /** 이번에 [카메라] 칸에서 고른 장치 */
  #chosenCameraId: string | null = null;
  /** 이 브라우저에 기억해 둔 장치(저장 이름 vision:camera) */
  #rememberedCameraId: string | null;
  /** 지금 켠 웹캠 장치 */
  #openedCameraId: string | null = null;
  /** 켠 웹캠이 까만지 지켜보는 도우미 */
  #blackWatcher: VideoBlackWatcher | null = null;
  #noticeShown = false;

  constructor(root: HTMLElement, lab: LabController, elements: VisionLabElements) {
    this.root = root;
    this.lab = lab;
    this.#elements = elements;
    this.#grabCanvas = document.createElement('canvas');
    this.#rememberedCameraId = readItem(VISION_CAMERA_STORAGE_NAME);
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
    this.#wireCameras();
    this.#wireRuntime();
    this.#cleanups.push(lab.on('example', () => this.#renderPractice()));
    this.#renderPractice();
    this.#renderStages();
    this.#setInputState('closed');
    this.#setCameraCheck('idle');
    this.root.dataset.visionHoldReads = 'no';
    this.#statusTimer = setInterval(() => this.#renderInputStatus(), 500);
    // 받는 중 안내: 미리 받기 상태(data-vision-packages)와 준비 칸의 받은 양(data-loading-text — 로딩 모듈)이 바뀔 때마다 다시 그린다.
    const waitObserver = new MutationObserver(() => this.#renderPackageWait());
    waitObserver.observe(root, { attributes: true, attributeFilter: ['data-vision-packages', 'data-loading-text'] });
    this.#cleanups.push(() => waitObserver.disconnect());
  }

  /**
   * 느린 망에서 "준비됐어요. [실행]을 누르세요." 뒤 [실행]을 누르면, 파이썬 엔진 다음에 받는 numpy·OpenCV(약 13MB)를 다 받을 때까지
   * 코드가 시작하지 않는다. 그동안 입력·출력 칸이 "[실행]을 누르면 입력이 켜져요"·"입력이 꺼져 있어요"만 보여 몇 분 동안 멈춘 것처럼
   * 보였다(회선 전체 3G에서 4분 30초 — 2026-09-26 Phase 6 사용성 검토 지적 5). 기다리는 동안은 무엇을 받는지와 받은 양을 보이고
   * "다 받으면 저절로 시작해요"라고 알린다. 다 받거나 실행이 끝나면 원래 안내로 되돌린다.
   */
  #renderPackageWait(): void {
    const waiting = this.#running && this.root.dataset.visionPackages === 'loading';
    this.root.dataset.visionPackageWait = waiting ? 'yes' : 'no';
    const { previewEmpty, outputEmpty } = this.#elements;
    if (waiting) {
      if (!this.#packageWaitShown) {
        this.#emptyHtml = { preview: previewEmpty?.innerHTML ?? '', output: outputEmpty?.innerHTML ?? '' };
        this.#packageWaitShown = true;
      }
      // 준비 칸의 받은 양 글("OpenCV(영상 처리) 3.1MB / 10.2MB", 셀 수 없으면 "numpy(배열 계산)·OpenCV(영상 처리) 받는 중… (약 13.6MB)")에서
      // "받는 중…"을 빼고 붙인다(앞 문장과 겹치지 않게).
      const amount = (this.root.dataset.loadingText ?? '').replace(/\s*받는 중…/u, '').trim();
      const detail = amount === '' ? '' : `: ${amount}`;
      // 영상을 쓰지 않는 코드(시리얼·블루투스만 — 3-1-2 컴퓨터 쪽 등)도 실습실을 처음 열었을 때는 OpenCV를 다 받은 뒤에 시작한다
      // (워커가 미리 받기를 끝낸 뒤 코드를 돌린다). 그때는 "영상"·"입력이 켜져요"를 말하지 않는다(판 1.1.1 최종 점검).
      if (previewEmpty) {
        previewEmpty.textContent = this.#runShowsVideo
          ? `필요한 파일을 받는 중이에요${detail}. 다 받으면 입력이 켜져요.`
          : `필요한 파일을 받는 중이에요${detail}.`;
      }
      if (outputEmpty) {
        outputEmpty.textContent = this.#runShowsVideo
          ? `필요한 파일을 받는 중이에요${detail}. 다 받으면 코드가 저절로 시작하고, 영상이 여기에 나와요.`
          : `필요한 파일을 받는 중이에요${detail}. 다 받으면 코드가 저절로 시작해요.`;
      }
      this.#renderInputStatus();
      return;
    }
    if (this.#packageWaitShown) {
      this.#packageWaitShown = false;
      if (previewEmpty && this.#emptyHtml) {
        previewEmpty.innerHTML = this.#emptyHtml.preview;
      }
      if (outputEmpty && this.#emptyHtml) {
        outputEmpty.innerHTML = this.#emptyHtml.output;
      }
      this.#renderInputStatus();
    }
  }

  /** "이 예제 실습 방법" 상자(예제의 practice 단계 — 없으면 숨긴다) */
  #renderPractice(): void {
    const box = this.#elements.practiceBox ?? null;
    const list = this.#elements.practiceSteps ?? null;
    if (box === null || list === null) {
      return;
    }
    const steps = (this.lab.currentExample?.practice ?? []).filter((step) => typeof step === 'string' && step.trim() !== '');
    list.replaceChildren(
      ...steps.map((step) => {
        const item = document.createElement('li');
        item.textContent = step;
        return item;
      }),
    );
    box.hidden = steps.length === 0;
  }

  /** 지금 고른 입력 소스 id(webcam·sample·file·…) */
  get sourceId(): string {
    return this.#sourceId;
  }

  /** 열린 소스(없으면 null) */
  get openedSource(): OpenedSource | null {
    return this.#source;
  }

  /** 이 컴퓨터의 카메라 목록(허락 뒤에는 이름이 있다) */
  get cameras(): readonly CameraDevice[] {
    return this.#cameras;
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

  /**
   * 입력 소스를 고른다. 입력이 켜져 있으면(열린 소스·여는 중·파이썬이 장을 기다리는 중) 새 소스를 바로 열어 이어 간다(미해결 200) —
   * 실행 중인 코드의 cap.read()는 빈 답 없이 새 소스의 장을 받는다. 입력이 꺼져 있으면 고르기만 한다(다음 [입력 켜기]·[실행] 때 연다).
   */
  selectSource(id: string): void {
    const source = findVisionSource(id);
    if (!source) {
      return;
    }
    if (this.#sourceId === id) {
      this.#applySelection(id);
      return;
    }
    if (this.#inputOn()) {
      this.#switchSource(id);
      return;
    }
    this.closeSource();
    this.#applySelection(id);
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
    this.#generation += 1;
    this.#closedGeneration = this.#generation;
    this.#setHoldReads(false);
    this.#cancelPendingRead(NO_FRAME);
    this.#detach('close');
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

  /** 입력이 켜져 있는지(열린 소스·여는 중·파이썬이 장을 기다리는 중·바꾸는 중) */
  #inputOn(): boolean {
    return this.#source !== null || this.#opening !== null || this.#pendingRead !== null || this.#holdReads;
  }

  /** 고른 소스 id와 화면(목록 값·설명·파일 단추·카메라 칸)을 맞춘다. 소스를 열거나 닫지는 않는다. */
  #applySelection(id: string): void {
    const source = findVisionSource(id);
    if (!source) {
      return;
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
    this.#renderCameraRow();
  }

  /**
   * 열린 소스를 떼어 낸다(카메라 끄기·미리 보기 지우기). 파이썬의 읽기 대기는 건드리지 않는다.
   * @param reason 'switch'(다른 입력으로 바꿈 — 까만 화면 안내가 떠 있었으면 콘솔에 한 줄) · 'close'(입력 끄기·페이지 떠남)
   */
  #detach(reason: 'switch' | 'close'): void {
    const source = this.#source;
    this.#source = null;
    this.#stopBlackWatch();
    this.#hideCameraNotice(reason === 'switch' ? '[안내] 다른 입력으로 바꿨어요 — 까만 화면 안내를 닫았어요.' : null);
    this.#openedCameraId = null;
    delete this.root.dataset.visionCameraKind;
    this.#setCameraCheck('idle');
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
  }

  /**
   * 입력이 켜진 채로 소스를 id로 바꾼다(같은 id면 다시 연다 — 카메라 바꾸기·새 그림 파일). 파이썬이 기다리던 cap.read()는 붙들어 두었다가
   * 새 소스의 첫 장으로 답한다. 그림 파일을 아직 고르지 않았으면 열지 않고 고를 때까지 기다린다.
   */
  #switchSource(id: string): void {
    const previous = this.#source;
    if (previous) {
      this.#switchSize = { width: previous.width, height: previous.height };
    }
    this.#generation += 1;
    const running = this.#running;
    this.#setHoldReads(running);
    this.#detach('switch');
    this.#applySelection(id);
    const selected = findVisionSource(id);
    if (selected?.kind === 'file' && currentFileImage() === null) {
      this.#setInputState('closed');
      this.#showInputMessage(
        running
          ? '[그림 파일 고르기]로 그림을 고르면 그 그림으로 이어서 실행돼요. 그때까지 코드는 다음 장을 기다려요.'
          : '[그림 파일 고르기]로 그림을 고르면 입력이 켜져요.',
      );
      this.#renderInputStatus();
      return;
    }
    void this.openSource().catch(() => {
      // 새 소스를 끝내 열지 못했다(샘플까지 실패) — 기다리던 읽기를 빈 답으로 끝낸다.
      this.#setHoldReads(false);
      this.#cancelPendingRead(NO_FRAME);
    });
  }

  #setHoldReads(hold: boolean): void {
    this.#holdReads = hold;
    this.root.dataset.visionHoldReads = hold ? 'yes' : 'no';
  }

  /** 소스를 열 때의 부탁(크기·카메라 장치) */
  #openOptionsFor(selected: VisionSource): OpenOptions {
    const size = this.#switchSize ?? {};
    if (selected.kind !== 'webcam') {
      return size;
    }
    if (this.#chosenCameraId) {
      return { ...size, deviceId: this.#chosenCameraId, exactDevice: true };
    }
    if (this.#rememberedCameraId) {
      return { ...size, deviceId: this.#rememberedCameraId, exactDevice: false };
    }
    return size;
  }

  async #openSelected(): Promise<OpenedSource> {
    // 여는 동안 학생이 다른 소스를 고르면(#generation이 오른다) 늦게 열린 것은 닫고, 지금 고른 소스를 다시 연다.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const generation = this.#generation;
      const result = await this.#openOnce();
      if (generation === this.#generation || attempt === 3) {
        this.#attach(result.opened, result.source, result.switchedReason);
        return result.opened;
      }
      result.opened.close();
      if (this.#closedGeneration === this.#generation) {
        // 여는 동안 입력을 껐다(페이지를 떠남 등) — 다시 열지 않는다.
        this.#setInputState('closed');
        this.#showInputMessage('');
        throw new SourceOpenError('unknown', '입력을 꺼서 열지 않았어요.');
      }
    }
    throw new SourceOpenError('unknown', '입력 소스를 열지 못했어요.');
  }

  /** 고른 소스를 한 번 연다(붙이지는 않는다). 웹캠·파일을 못 열면 샘플 입력으로 바꿔 연다. */
  async #openOnce(): Promise<{ opened: OpenedSource; source: VisionSource; switchedReason?: string }> {
    const selected = findVisionSource(this.#sourceId) ?? findVisionSource('sample');
    if (!selected) {
      throw new SourceOpenError('unsupported', '쓸 수 있는 입력 소스가 없어요.');
    }
    this.#setInputState('opening');
    this.#showInputMessage(selected.kind === 'webcam' ? '카메라를 켜는 중이에요. 브라우저가 물으면 "허용"을 눌러 주세요.' : '');
    try {
      const opened = await selected.open(this.#openOptionsFor(selected));
      return { opened, source: selected };
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
      this.#applySelection('sample');
      this.#setInputState('opening');
      const opened = await sample.open(this.#switchSize ?? {});
      // 왜 샘플로 바뀌었는지를 남긴 채로 붙인다(예전에는 #attach의 기본 문구가 이유를 덮어써서, 실수로 "차단"을 누른 학생이
      // 되돌리는 방법을 화면에서 볼 수 없었다 — 2026-09-17 검토 반영).
      return { opened, source: sample, switchedReason: failure.message };
    }
  }

  /** @param switchedReason 다른 소스를 못 열어 이 소스로 바꿔 연 까닭(있으면 안내 글 앞에 그대로 남긴다) */
  #attach(opened: OpenedSource, source: VisionSource, switchedReason?: string): void {
    this.#source = opened;
    this.#switchSize = null;
    this.#setHoldReads(false);
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
    if (opened.camera) {
      this.#cameras = [...opened.camera.cameras];
      this.#openedCameraId = opened.camera.deviceId || null;
      const current = this.#currentCamera();
      this.root.dataset.visionCameraKind = current?.kind ?? 'normal';
      this.#renderCameraRow();
    }
    if (switchedReason) {
      // 이유 문장(sources.ts)은 "…샘플 입력으로 실습해요."로 끝나므로, 덧붙이는 말은 "무엇을 해 두었고 어떻게 되돌리는지"만 적는다.
      this.#showInputMessage(
        `${switchedReason} 입력 소스를 '샘플 입력'으로 바꿔 두었어요. 카메라를 고친 뒤에는 입력 소스에서 '웹캠(카메라)'을 고르고 [입력 켜기]를 누르면 돼요.`,
      );
    } else if (source.kind === 'webcam') {
      const camera = opened.camera;
      this.#showInputMessage(
        cameraOpenedMessage({
          current: this.#currentCamera(),
          avoided: camera?.avoided ?? null,
          fallbackReason: camera?.fallbackReason ?? null,
          count: this.#cameras.length,
        }),
      );
    } else if (source.kind === 'sample') {
      this.#showInputMessage('샘플 입력(실습실이 그린 도형)으로 실습해요.');
    } else if (source.kind === 'file' && this.#running) {
      this.#showInputMessage('고른 그림으로 이어서 실행해요.');
    }
    if (source.kind === 'webcam' && opened.previewElement) {
      this.#startBlackWatch(opened);
    } else {
      this.#setCameraCheck('idle');
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
      status.textContent = this.#packageWaitShown ? '입력이 꺼져 있어요 — 필요한 파일을 다 받으면 켜져요.' : '입력이 꺼져 있어요.';
      status.dataset.width = '';
      status.dataset.height = '';
      return;
    }
    const label = findVisionSource(this.#sourceId)?.label ?? this.#sourceId;
    // 카메라가 두 대 이상이면 어느 카메라인지도 적는다(한 대면 전과 같은 글).
    const current = source.camera && this.#cameras.length >= 2 ? this.#currentCamera() : null;
    const cameraText = current ? ` · ${cameraName(current)}` : '';
    const fps = this.#inputMeter.fps(performance.now());
    const fpsText = this.#running ? ` · 파이썬에 ${fps.toFixed(0)}fps로 전달` : '';
    status.textContent = `${label}${cameraText} ${source.width}×${source.height}${fpsText}`;
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
    this.#applySelection(this.#sourceId);
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

  // ── 카메라 고르기(판 1.1.0, 미해결 121) ──

  /** 지금 켠 웹캠(목록에서 찾음 — 모르면 null) */
  #currentCamera(): CameraDevice | null {
    const id = this.#openedCameraId;
    return id ? (this.#cameras.find((camera) => camera.deviceId === id) ?? null) : null;
  }

  /** [카메라] 칸: 웹캠을 고른 때 카메라가 두 대 이상(id를 아는 목록)일 때만 보인다. */
  #renderCameraRow(): void {
    const row = this.#elements.cameraRow ?? null;
    const select = this.#elements.cameraSelect ?? null;
    this.root.dataset.visionCameraCount = String(this.#cameras.length);
    if (!row || !select) {
      return;
    }
    const show = this.#sourceId === 'webcam' && canChooseCameras(this.#cameras);
    row.hidden = !show;
    if (!show) {
      return;
    }
    const options = cameraOptions(this.#cameras);
    const same =
      select.options.length === options.length &&
      options.every((option, index) => select.options[index]?.value === option.value && select.options[index]?.textContent === option.label);
    if (!same) {
      select.replaceChildren(
        ...options.map((item) => {
          const option = document.createElement('option');
          option.value = item.value;
          option.textContent = item.label;
          option.dataset.cameraKind = item.kind;
          return option;
        }),
      );
    }
    // 보이는 값: 켠 카메라 → 이번에 고른 것 → 기억한 것 → 처음 열 때 고를 카메라(가상 카메라는 뒤로)
    const has = (id: string | null): id is string => id !== null && options.some((option) => option.value === id);
    const value = has(this.#openedCameraId)
      ? this.#openedCameraId
      : has(this.#chosenCameraId)
        ? this.#chosenCameraId
        : has(this.#rememberedCameraId)
          ? this.#rememberedCameraId
          : (pickCamera(this.#cameras)?.deviceId ?? '');
    if (select.value !== value) {
      select.value = value;
    }
  }

  /** 카메라 목록을 다시 읽는다(허락을 묻지 않는다 — 허락 전에는 이름이 비고 한 대로 보일 수 있다). */
  async #refreshCameras(): Promise<void> {
    const cameras = await listCameras();
    if (this.#disposed) {
      return;
    }
    // 이미 이름을 아는 목록이 있는데 새 목록이 이름을 모르면(허락을 거둔 경우 등) 새 목록을 그대로 쓴다 — 고를 수 없게 된다.
    this.#cameras = cameras;
    this.#renderCameraRow();
  }

  /** 학생이 [카메라] 칸에서 고른 장치 — 이 브라우저에 기억하고, 입력이 켜져 있으면 그 카메라로 바로 바꿔 연다. */
  #chooseCamera(deviceId: string): void {
    if (!deviceId) {
      return;
    }
    this.#chosenCameraId = deviceId;
    this.#rememberedCameraId = deviceId;
    writeItem(VISION_CAMERA_STORAGE_NAME, deviceId);
    if (this.#sourceId !== 'webcam') {
      return;
    }
    if (this.#openedCameraId === deviceId) {
      return;
    }
    if (this.#inputOn()) {
      this.#switchSource('webcam');
    }
  }

  #wireCameras(): void {
    const select = this.#elements.cameraSelect ?? null;
    if (select) {
      const onChange = () => this.#chooseCamera(select.value);
      select.addEventListener('change', onChange);
      this.#cleanups.push(() => select.removeEventListener('change', onChange));
    }
    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (mediaDevices && typeof mediaDevices.addEventListener === 'function') {
      // USB 웹캠을 꽂거나 뽑으면 목록을 다시 읽는다.
      const onDeviceChange = () => void this.#refreshCameras();
      mediaDevices.addEventListener('devicechange', onDeviceChange);
      this.#cleanups.push(() => mediaDevices.removeEventListener('devicechange', onDeviceChange));
    }
    // [이 컴퓨터에서 내 기록 지우기]: 기억한 카메라도 잊는다(지금 켜진 카메라는 그대로 둔다).
    const onCleared = () => {
      this.#chosenCameraId = null;
      this.#rememberedCameraId = null;
      removeItem(VISION_CAMERA_STORAGE_NAME);
    };
    document.addEventListener(RECORDS_CLEARED_EVENT, onCleared);
    this.#cleanups.push(() => document.removeEventListener(RECORDS_CLEARED_EVENT, onCleared));

    const other = this.#elements.cameraOtherButton ?? null;
    if (other) {
      const onOther = () => {
        const hadFocus = document.activeElement === other;
        const target = other.dataset.cameraTarget;
        if (target) {
          if (select) {
            select.value = target;
          }
          // 카메라를 바꾸면 안내가 숨어 이 단추도 사라진다 — 숨기 전에 초점을 [카메라] 칸(바꾼 카메라가 골라져 있음)으로 옮긴다.
          if (hadFocus) {
            this.#moveFocusTo(this.#visible(select) ? select : this.#elements.sourceSelect);
          }
          this.#chooseCamera(target);
          return;
        }
        // 고를 카메라가 여럿이면 [카메라] 칸으로 옮겨 준다.
        if (select && !(this.#elements.cameraRow?.hidden ?? true)) {
          select.focus();
        }
      };
      other.addEventListener('click', onOther);
      this.#cleanups.push(() => other.removeEventListener('click', onOther));
    }
    const sample = this.#elements.cameraSampleButton ?? null;
    if (sample) {
      const onSample = () => {
        // [샘플로 계속]도 안내를 거둔다 — 숨기 전에 초점을 입력 소스 칸('샘플 입력'이 골라진다)으로 옮긴다.
        if (document.activeElement === sample) {
          this.#moveFocusTo(this.#elements.sourceSelect);
        }
        this.selectSource('sample');
        if (!this.#inputOn()) {
          void this.openSource().catch(() => undefined);
        }
      };
      sample.addEventListener('click', onSample);
      this.#cleanups.push(() => sample.removeEventListener('click', onSample));
    }
    void this.#refreshCameras();
  }

  // ── 까만 영상 감지(판 1.1.0, 미해결 121) ──

  #setCameraCheck(state: CameraCheckState): void {
    this.root.dataset.visionCameraCheck = state;
  }

  #startBlackWatch(opened: OpenedSource): void {
    this.#stopBlackWatch();
    const video = opened.previewElement;
    if (!video) {
      return;
    }
    this.#setCameraCheck('watching');
    this.#blackWatcher = new VideoBlackWatcher(video, (verdict, summary) => this.#onBlackVerdict(opened, verdict, summary));
  }

  #stopBlackWatch(): void {
    this.#blackWatcher?.stop();
    this.#blackWatcher = null;
  }

  #onBlackVerdict(opened: OpenedSource, verdict: BlackVerdict, summary: BlackWatchSummary): void {
    if (this.#source !== opened) {
      this.#stopBlackWatch();
      return;
    }
    this.#setCameraCheck(verdict);
    if (verdict === 'ok') {
      // 밝은 장이 왔다 — 안내가 떠 있었으면 거두고 지켜보기를 끝낸다(가리개를 열었을 때 저절로 사라진다).
      this.#stopBlackWatch();
      if (this.#noticeShown) {
        this.#hideCameraNotice('[안내] 이제 카메라 영상이 들어와요.');
        this.#showInputMessage('이제 카메라 영상이 들어와요.');
      }
      return;
    }
    if (verdict === 'black' || verdict === 'no-frames') {
      this.#showCameraNotice(verdict, summary);
    }
  }

  #showCameraNotice(verdict: 'black' | 'no-frames', summary: BlackWatchSummary): void {
    const content = cameraNotice({ verdict, current: this.#currentCamera(), cameras: this.#cameras, flat: summary.flat });
    const e = this.#elements;
    if (e.cameraNoticeTitle) {
      e.cameraNoticeTitle.textContent = content.title;
    }
    if (e.cameraNoticeLead) {
      e.cameraNoticeLead.textContent = content.lead;
    }
    if (e.cameraNoticeCauses) {
      e.cameraNoticeCauses.replaceChildren(
        ...content.causes.map((cause) => {
          const item = document.createElement('li');
          item.dataset.cause = cause.id;
          item.textContent = cause.text;
          return item;
        }),
      );
    }
    if (e.cameraNoticeSample) {
      e.cameraNoticeSample.textContent = content.sampleHint;
    }
    const other = e.cameraOtherButton ?? null;
    if (other) {
      if (content.switchTo) {
        other.hidden = false;
        other.dataset.cameraTarget = content.switchTo.deviceId;
        other.textContent = `다른 카메라로 바꾸기(${cameraName(content.switchTo)})`;
      } else if (content.chooseAmong) {
        other.hidden = false;
        delete other.dataset.cameraTarget;
        other.textContent = '다른 카메라 고르기';
      } else {
        other.hidden = true;
        delete other.dataset.cameraTarget;
      }
    }
    if (e.cameraNotice) {
      e.cameraNotice.hidden = false;
      e.cameraNotice.dataset.verdict = verdict;
    }
    if (!this.#noticeShown) {
      this.#noticeShown = true;
      // 안내가 화면 밖이면(휴대폰에서 [실행] 뒤 출력 칸을 보는 중 — 안내는 미리 보기 아래라 화면 위쪽 밖) 한 번 화면 안으로 옮긴다(1.1.0 검토 반영).
      // 콘솔 줄은 실습실 틀의 "콘솔에 결과가 나왔어요" 칸에도 비치지만, 그 칸 쪽으로는 화면을 옮기지 않게 한다(reveal: false) — 옮기면
      // 다음 화면 그리기에서 안내 쪽으로 가던 화면을 결과 칸으로 되돌린다(휴대폰 검사에서 확인).
      this.lab.appendConsole(`${content.consoleLine}\n`, 'notice', { reveal: false });
      revealElement(e.cameraNotice, { block: 'center' });
    }
    this.#showInputMessage(content.announce);
  }

  /**
   * 까만 화면 안내를 거둔다. consoleLine이 있고 안내가 떠 있었으면 콘솔에도 한 줄 남긴다 — 실습실 틀의 "콘솔에 결과가 나왔어요" 칸이
   * 마지막 몇 줄을 보여 주므로, 풀린 뒤에도 옛 "[안내] … 화면이 까매요"가 남아 아직 까만 것처럼 보이지 않게(1.1.0 검토 반영).
   */
  #hideCameraNotice(consoleLine: string | null = null): void {
    const wasShown = this.#noticeShown;
    this.#noticeShown = false;
    const notice = this.#elements.cameraNotice ?? null;
    if (notice) {
      notice.hidden = true;
      delete notice.dataset.verdict;
    }
    if (wasShown && consoleLine) {
      this.lab.appendConsole(`${consoleLine}\n`, 'notice');
    }
  }

  /** 보이는 요소인지(hidden 조상 없음) */
  #visible(element: HTMLElement | null | undefined): element is HTMLElement {
    return element !== null && element !== undefined && !element.hidden && element.closest('[hidden]') === null;
  }

  /**
   * 초점을 받던 단추가 곧 숨을 때(까만 화면 안내의 단추 — 안내를 거두면 사라진다) 초점을 이어 받을 칸으로 옮긴다. 옮기지 않으면 초점이
   * 문서(body)로 사라져 키보드·화면 낭독기 사용자가 자리를 잃는다(1.1.0 검토 반영 — 실습실 틀의 [실행]·[정지] 초점 규칙과 같은 뜻).
   * 화면은 필요할 때만(그 칸이 화면 밖일 때) 옮긴다.
   */
  #moveFocusTo(element: HTMLElement | null | undefined): void {
    if (!this.#visible(element)) {
      return;
    }
    element.focus({ preventScroll: true });
    revealElement(element, { block: 'center' });
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
    listen(e.closeButton, 'click', () => {
      const wasRunning = this.#running && this.#source !== null;
      this.closeSource();
      if (wasRunning) {
        // 진짜 OpenCV에서 카메라를 뽑은 것처럼 cap.read()가 (False, None)을 받는다. 코드가 그것을 확인하지 않으면 오류가 날 수 있어 까닭을 남긴다.
        this.lab.appendConsole('[안내] 실행 중에 [입력 끄기]를 눌러서 cap.read()가 빈 답(False, None)을 받았어요. 다시 [입력 켜기]를 누르거나 [실행]해요.\n', 'notice');
      }
    });
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
          // 새 그림으로 바로 연다. 실행 중이면 기다리던 cap.read()가 새 그림을 받는다(미해결 200).
          this.#switchSource('file');
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
        this.#cancelPendingRead(NO_FRAME);
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
      lab.on('run', ({ code }) => {
        this.#running = true;
        this.#runShowsVideo = codeShowsVideo(code);
        this.windows.clear();
        this.#throttle.reset();
        this.#inputMeter.reset();
        this.#prefillLimitedMode();
        this.#renderPackageWait();
      }),
      lab.on('done', () => {
        this.#running = false;
        this.#setHoldReads(false);
        this.#cancelPendingRead(NO_FRAME);
        this.#renderPackageWait();
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
      runtime.setValue(CAMERA_FRAME_NAME, NO_FRAME);
      return;
    }
    const frame = this.grabFrame();
    const source = this.#source;
    runtime.setValue(CAMERA_INFO_NAME, { ok: true, width: source.width, height: source.height, source: this.#sourceId, fps: source.fps });
    runtime.setValue(CAMERA_FRAME_NAME, frame ? { width: frame.width, height: frame.height, data: frame.data } : NO_FRAME);
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
    if (!this.#source && !this.#holdReads) {
      request.reply(NO_FRAME);
      return;
    }
    // 앞 요청이 아직 답을 기다리면(같은 실행에서 겹치는 일은 없지만) 먼저 것을 None으로 끝낸다.
    this.#cancelPendingRead(NO_FRAME);
    const delay = this.#source ? this.#throttle.nextDelay(performance.now()) : 0;
    const deliver = () => {
      this.#pendingRead = null;
      const frame = this.grabFrame();
      if (!frame) {
        if (!this.#source && !this.#holdReads) {
          // 기다리는 사이에 입력이 꺼졌다([입력 끄기]).
          request.reply(NO_FRAME);
          return;
        }
        // 카메라 첫 장이 아직 안 왔거나 새 소스를 여는 중이면 조금 뒤 다시 본다(파이썬은 그동안 기다린다).
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
