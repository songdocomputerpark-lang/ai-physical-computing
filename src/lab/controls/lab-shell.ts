/**
 * 실습실 공통 조작의 화면 쪽 논리(PLAN §8.2 P2-02, SPEC §6.1 "위에 [실행] [정지] [초기화] [예제 불러오기] [공유 링크] 버튼").
 *
 * src/components/lab/LabShell.astro가 그린 HTML(data-lab-* 표시)을 찾아 코드 에디터(src/lab/editor/)·파이썬 실행기
 * (src/lab/runtime/client.ts)·자동 저장·공유 링크·내려받기·콘솔·input() 입력줄을 잇는다. 영상처리·ESP32·통신 실습실과
 * 차시 임베드(P2-03 이후)는 이 컨트롤러를 그대로 쓰고, 카메라 프레임 같은 요청은 onRequest()로 받는다.
 *
 * 쓰는 법(페이지 스크립트에서)
 *   import { getLabController } from '../lab/controls/lab-shell.ts';
 *   const lab = await getLabController(document.querySelector('[data-lab]'));
 *   lab.on('done', (result) => …);                       // 실행이 끝났을 때(RunResult)
 *   lab.onRequest('camera.read', (request) => request.reply(frame));  // 파이썬 apc_runtime.request('camera.read', …)
 *   lab.replaceCode(from, to, '120', 'param');            // 코드 한 구간만 바꿔 쓰기(조절 패널, src/lab/params/panel.ts)
 *   lab.setRunTarget({ label: '실제 보드', run, stop });   // [실행]·[정지]를 실제 보드로(LabRunTarget, 병렬 제작 준비 2026-09-17), null이면 되돌림
 *
 * 조절 패널(P2-04)은 LabShell.astro가 mountLabShell 뒤에 mountParamPanel(root, lab)으로 붙인다(코드의 # @slider 규약 → 패널,
 * 값 변경 → 코드 글자 바꿔 쓰기 + 실행 중이면 runtime.pushEvent('lab.params', …)).
 *
 * 시작할 때 코드를 정하는 순서
 *   1. 주소 # 뒤에 공유 링크 코드(code=)가 있으면 그 코드(예제는 ex= 값). 주소의 #은 지워 새로고침하면 자동 저장본이 열린다.
 *   2. 아니면 예제를 고른다: ?example=<examples/ 경로> → 저장된 "마지막 예제" → 첫 예제 → 없음(scratch).
 *   3. 그 예제의 자동 저장본이 있으면 그것, 없으면 예제 원래 코드(예제가 없으면 DEFAULT_SCRATCH_CODE).
 * 자동 저장은 코드가 바뀔 때마다(손을 멈춘 뒤 0.4초) 예제별 이름으로 저장하고 "저장됨"을 보인다.
 * [이 컴퓨터에서 내 기록 지우기](ClearRecordsButton)가 끝나면 document의 apc:records-cleared를 받아 예제 원래 코드·기본 글자 크기로 돌아간다.
 *
 * 테스트가 읽는 값(뿌리 요소의 data-*): state·run-target(실행 대상 이름, 없으면 빈 값)·jspi·limited·outcome·run-count·stop-ms·save-state·example·share-loaded·
 * example-missing(?example= 파일을 못 찾음)·loading-intro(첫 준비 중이면 yes — 준비 패널이 맨 위, LabShell.astro).
 * [실행] 단추의 data-lab-run-pending=yes는 "파이썬을 받는 동안 눌러 둠(준비되면 실행)"이다.
 *
 * 학생이 헤매지 않게 하는 규칙(2026-09-17 Phase 2 검토 반영)
 * - 파이썬을 받는 동안에도 [실행]을 누를 수 있다. 누르면 "준비되면 실행돼요…"로 바뀌고 준비가 끝나면 저절로 실행한다.
 * - (2026-09-25 Phase 4 검토 반영) 파이썬이 준비된 뒤 모듈이 워커에 넣는 파일(보드 라이브러리 i2c_lcd.py·mask.png 등)은
 *   holdRun(약속)으로 알린다. [실행]은 그 약속이 모두 끝난 뒤에 코드를 보낸다(최대 RUN_HOLD_MAX_MS) — 예약 실행이
 *   라이브러리보다 먼저 워커에 닿아 "가상 보드에 아직 없어요"라는 거짓 오류로 멈추던 것을 막는다.
 * - 실행을 시작하면 결과 칸(과 조절 막대가 있으면 첫 막대)이 첫 화면 밖일 때 그쪽으로 화면을 옮긴다(reveal.ts, 움직임 줄이기면 바로 옮김).
 * - 예제에 차시 정보(lesson)가 있으면 조작 줄 아래에 "이 예제가 나오는 차시" 링크를 보인다(차시에서 넘어온 학생이 돌아갈 길).
 */
import { canStepFontSize, readFontSize, saveFontSize, stepFontSize, DEFAULT_FONT_SIZE_PX } from '../editor/font-size.ts';
import { createPythonEditor, type PythonEditor } from '../editor/python-editor.ts';
import { PythonRuntime, type RunResult, type RuntimeRequest, type StopResult } from '../runtime/client.ts';
import { STOP_GRACE_MS } from '../runtime/config.ts';
import type { RuntimeState } from '../runtime/protocol.ts';
import { withParticle } from '../../lib/korean.ts';
import { readItem, writeItem } from '../../lib/storage.ts';
import { Autosave, editorStorageName, lastExampleStorageName, type AutosaveStatus } from './autosave.ts';
import { downloadTextFile } from './download.ts';
import { DEFAULT_SCRATCH_CODE, exampleFileName, findExample, findExampleByFile, type LabExample } from './examples.ts';
import { RECORDS_CLEARED_EVENT } from './records.ts';
import { isMostlyVisible, revealElement, revealTogether } from './reveal.ts';
import { ShareTooLongError, buildShareLink, hasShareHash, parseShareHash } from './share-link.ts';

/** 실행기 상태를 사람 말로 */
export const STATE_TEXT: Readonly<Record<RuntimeState, string>> = Object.freeze({
  unloaded: '아직 시작하지 않았어요.',
  loading: '파이썬을 준비하는 중이에요…',
  idle: '준비됐어요. [실행]을 누르세요.',
  running: '실행 중이에요.',
  stopping: '멈추는 중이에요…',
  failed: '파이썬을 준비하지 못했어요.',
});

/** 자동 저장 상태를 사람 말로 */
export const SAVE_TEXT: Readonly<Record<AutosaveStatus, string>> = Object.freeze({
  idle: '',
  pending: '저장 중…',
  saved: '저장됨',
  unavailable: '저장 안 됨 — 이 브라우저는 저장 공간을 쓸 수 없어요',
});

/** 콘솔에 남기는 줄 수 상한(오래된 줄부터 버린다) */
export const MAX_CONSOLE_LINES = 2000;
/** 콘솔이 화면 밖일 때 결과 칸에 비춰 주는 마지막 줄 수 */
export const CONSOLE_TAIL_LINES = 3;

/** 다음 화면 그리기에 한 번만 — requestAnimationFrame이 없는 대역(테스트·옛 브라우저)에서는 타이머로 */
function requestFrame(callback: () => void): number {
  return typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => callback()) : (setTimeout(callback, 16) as unknown as number);
}

function cancelFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle);
  } else {
    clearTimeout(handle);
  }
}

/** 컨트롤러가 만들어졌을 때 뿌리 요소에 보내는 이름 */
export const LAB_READY_EVENT = 'apc:lab-ready';

/**
 * [실행]이 holdRun 약속을 기다리는 최대 시간(밀리초). 넘으면 기다리지 않고 실행한다 — 모듈 하나가 멈춰도 실습실이 막히지 않게.
 * 보드 라이브러리 6개(약 60KB)를 워커에 쓰는 데는 수십 ms, 가상 파일(mask.png) 그리기는 수백 ms면 끝난다(2026-09-25 실측).
 */
export const RUN_HOLD_MAX_MS = 8000;

export type ConsoleKind = 'stdout' | 'stderr' | 'notice' | 'input';

/** 코드가 바뀐 까닭. param = 조절 패널이 값 글자를 바꿔 씀(P2-04) */
export type CodeSource = 'edit' | 'example' | 'share' | 'restore' | 'reset' | 'set' | 'records-cleared' | 'param';

export interface LabEvents {
  /** 코드가 바뀜(사용자 편집 포함) */
  code: { code: string; source: CodeSource };
  /** 고른 예제가 바뀜 */
  example: { example: LabExample | null };
  /**
   * 파이썬을 받는 동안 [실행]을 눌러 예약함(준비가 끝나면 그때 'run'이 온다). 준비 진행률 모듈(loading)이 이때 자기 패널을
   * 화면 안으로 옮겨, 기다리는 학생이 진행률과 1분 개념 카드를 보게 한다(2026-09-17 검토 반영).
   */
  'run-pending': { code: string };
  /** 실행을 보내기 직전. target은 실행 대상 이름(setRunTarget — 예: '실제 보드'), 이 페이지의 파이썬 실행기면 null */
  run: { code: string; runCount: number; target: string | null };
  /** 실행이 끝남(정지·오류 포함) */
  done: RunResult;
  /** 실행기 상태 */
  state: { state: RuntimeState };
  /** 자동 저장 상태 */
  save: { status: AutosaveStatus };
  /** 기록 지우기 뒤 */
  'records-cleared': { removed: number };
}

type LabListener<K extends keyof LabEvents> = (payload: LabEvents[K]) => void;
type RequestHandler = (request: RuntimeRequest) => void;

/**
 * (병렬 제작 준비 2026-09-17) [실행]·[정지]를 이 페이지의 파이썬 실행기 대신 받는 실행 대상 — 실제 보드(P3-07·P3-08,
 * SPEC §6.2 "[가상 보드]/[실제 보드] 탭 — 같은 코드가 두 곳에서 돈다"). 흉내 모듈·페이지가 lab.setRunTarget(대상)으로 끼우고 null로 뗀다.
 * 끼운 동안 [실행]은 파이썬 준비(로딩)를 기다리지 않고 대상의 run을 부르며, 콘솔 머리줄·'run'·'done' 이벤트(오류 풀이 카드)·결과 줄·
 * input() 입력줄·[정지] 단추는 보통 실행과 같게 흐른다. 뿌리 요소의 data-state는 대상의 idle·running·stopping, data-run-target은 대상 이름.
 */
export interface LabRunTarget {
  /** 상태 글에 쓰는 이름(예: '실제 보드' → "실제 보드에서 실행 중이에요.") */
  readonly label: string;
  /**
   * 코드를 실행하고 끝나면 결과를 돌려준다: 정상 'ok', [정지] 'stopped', 오류 'error' + error{type, message(마지막 줄), traceback(전체)}.
   * 트레이스백은 셸이 콘솔에 한 번 적으므로 write로 따로 적지 않는다. 약속이 거절되면 셸이 오류 결과(RunTargetError)로 바꾼다.
   */
  run(code: string, context: LabRunContext): Promise<RunResult>;
  /** [정지]를 눌렀을 때 — run이 돌려준 약속이 곧 'stopped'로 끝나게 한다(실제 보드: Ctrl-C) */
  stop(): Promise<void> | void;
}

export interface LabRunContext {
  /** 이번 실행 번호(콘솔 "── 실행 N ──"과 같다) */
  readonly runCount: number;
  /** 콘솔에 쓴다(보드 출력은 stdout, 사이트 안내는 notice) */
  write(text: string, kind?: ConsoleKind): void;
  /** input() 입력줄을 보이고 학생이 적은 한 줄을 기다린다(셸이 그 줄을 콘솔에 input으로 적는다). 실행이 끝나거나 [정지]면 null */
  prompt(label: string): Promise<string | null>;
  /**
   * 상태 줄의 글을 이번 실행 동안만 바꾼다(null이면 기본 글 "<대상>에서 실행 중이에요."로 되돌림). 2026-09-18 검토 반영:
   * 실제 보드가 포트 선택 창을 여는 동안에는 아직 아무것도 실행되지 않았는데 "실행 중"이라고 적혀, 창을 못 본 학생이 멈춘 줄 알았다.
   */
  setStatus(text: string | null): void;
}

export interface LabController {
  readonly root: HTMLElement;
  readonly labId: string;
  readonly runtime: PythonRuntime;
  readonly editor: PythonEditor;
  readonly examples: readonly LabExample[];
  readonly currentExample: LabExample | null;
  getCode(): string;
  /** 코드를 넣는다. save가 false면 자동 저장하지 않는다(기본 true). */
  setCode(code: string, options?: { save?: boolean }): void;
  /**
   * 코드의 한 구간(from부터 to 앞까지)만 바꿔 쓴다(커서·되돌리기 유지, 자동 저장됨). 'code' 이벤트의 source는 기본 'edit',
   * 조절 패널은 'param'을 넘긴다. 범위가 코드 밖이면 false.
   */
  replaceCode(from: number, to: number, insert: string, source?: CodeSource): boolean;
  run(): Promise<RunResult | null>;
  stop(): Promise<StopResult>;
  /** 예제 원래 코드로(확인 없이) */
  reset(): void;
  loadExample(id: string): boolean;
  appendConsole(text: string, kind?: ConsoleKind): void;
  clearConsole(): void;
  /** 조작 줄 아래 안내 글(role=status) */
  showMessage(text: string): void;
  on<K extends keyof LabEvents>(event: K, listener: LabListener<K>): () => void;
  /** 파이썬의 request(kind) 처리기. 같은 kind는 마지막 것만 남는다. 'input'은 셸이 처리한다. */
  onRequest(kind: string, handler: RequestHandler): () => void;
  /**
   * (P3-05) input() 입력줄을 보이고 학생이 적은 한 줄을 기다린다 — 실행 대상의 ctx.prompt와 같은 입력줄·같은 되울림(콘솔에 input으로).
   * 실행 대상이 실행 중이거나, 실행 대상이 없고 이 페이지의 파이썬이 실행 중일 때만 연다(보드 콘솔 모듈이 파이썬을 멈추지 않고 입력을 받을 때).
   * 실행이 끝나거나 [정지]하면 null, 실행 중이 아니면 바로 null.
   */
  prompt(label: string): Promise<string | null>;
  /**
   * (P3-06) [실행] 때 파이썬 실행기에 보낼 코드를 바꾼다(편집칸·공유 링크·내려받기·실제 보드에는 영향 없음).
   * 블록 전용 호환 모드(PD-27)가 줄 수가 같은 실행판을 보낼 때 쓴다. null이면 편집칸 코드를 그대로 보낸다.
   */
  setRunCodeTransform(transform: ((code: string) => string | null) | null): void;
  /**
   * (2026-09-25 Phase 4 검토 반영) [실행] 전에 끝나야 하는 준비 작업을 알린다 — 파이썬이 준비될 때마다 모듈이 워커에 넣는
   * 파일(보드 라이브러리·가상 파일)과 흉내 모듈 붙이기. 이 페이지의 파이썬으로 실행할 때(실행 대상이 없을 때) [실행]·예약 실행은
   * 알린 약속이 모두 끝난 뒤에 코드를 보낸다(최대 RUN_HOLD_MAX_MS). 약속이 실패해도 실행은 한다(실패 안내는 그 모듈이 한다).
   */
  holdRun(task: Promise<unknown>): void;
  /** (병렬 제작 준비 2026-09-17) 지금 [실행]을 받는 실행 대상. null이면 이 페이지의 파이썬 실행기 */
  readonly runTarget: LabRunTarget | null;
  /** 실행 대상을 끼운다(null이면 뗀다). 실행 중이면 오류를 던진다 — [정지]한 뒤에 바꾼다 */
  setRunTarget(target: LabRunTarget | null): void;
  dispose(): void;
}

interface ShellElements {
  runButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  resetButton: HTMLButtonElement | null;
  exampleSelect: HTMLSelectElement | null;
  exampleLoadButton: HTMLButtonElement | null;
  shareButton: HTMLButtonElement | null;
  downloadButton: HTMLButtonElement | null;
  editorHost: HTMLElement;
  editorHint: HTMLElement | null;
  /** 입력·출력 칸([data-lab-io]). [실행] 뒤 결과가 첫 화면 밖이면 여기로 옮긴다. */
  ioSection: HTMLElement | null;
  fontSmaller: HTMLButtonElement | null;
  fontLarger: HTMLButtonElement | null;
  fontSizeText: HTMLElement | null;
  saveText: HTMLElement | null;
  statusText: HTMLElement | null;
  progressText: HTMLElement | null;
  messageText: HTMLElement | null;
  /** "이 예제가 나오는 차시" 줄과 그 링크 */
  lessonBox: HTMLElement | null;
  lessonLink: HTMLAnchorElement | null;
  /** 예제 한 줄 설명(사이드카 description) 자리 */
  exampleDescription: HTMLElement | null;
  limitedNotice: HTMLElement | null;
  consoleBox: HTMLElement;
  consoleClear: HTMLButtonElement | null;
  /** 콘솔이 화면 밖일 때 결과 칸에 뜨는 "결과가 나왔어요" 알림(2026-09-18 검토 반영) */
  ioOutputBox: HTMLElement | null;
  ioOutputHead: HTMLElement | null;
  ioOutputCount: HTMLElement | null;
  ioOutputText: HTMLElement | null;
  consoleJump: HTMLButtonElement | null;
  consoleNewBadge: HTMLElement | null;
  inputForm: HTMLFormElement | null;
  inputLabel: HTMLElement | null;
  inputField: HTMLInputElement | null;
  resultText: HTMLElement | null;
  shareDialog: HTMLDialogElement | null;
  shareUrl: HTMLInputElement | null;
  shareNote: HTMLElement | null;
  shareCopy: HTMLButtonElement | null;
  shareCopied: HTMLElement | null;
  resetDialog: HTMLDialogElement | null;
  resetConfirm: HTMLButtonElement | null;
}

function query<T extends Element>(root: HTMLElement, selector: string): T | null {
  return root.querySelector<T>(selector);
}

function readExamples(root: HTMLElement): LabExample[] {
  const script = root.querySelector<HTMLScriptElement>('script[data-lab-examples]');
  if (!script) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(script.textContent ?? '[]');
    return Array.isArray(parsed) ? (parsed as LabExample[]) : [];
  } catch {
    return [];
  }
}

function openDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) {
      dialog.showModal();
    }
  } else {
    dialog.setAttribute('open', '');
  }
}

function closeDialog(dialog: HTMLDialogElement): void {
  if (typeof dialog.close === 'function') {
    if (dialog.open) {
      dialog.close();
    }
  } else {
    dialog.removeAttribute('open');
  }
}

class LabShellController implements LabController {
  readonly root: HTMLElement;
  readonly labId: string;
  readonly runtime: PythonRuntime;
  readonly editor: PythonEditor;
  readonly examples: readonly LabExample[];
  #example: LabExample | null = null;
  readonly #elements: ShellElements;
  readonly #listeners = new Map<keyof LabEvents, Set<LabListener<keyof LabEvents>>>();
  readonly #requestHandlers = new Map<string, RequestHandler>();
  readonly #cleanups: (() => void)[] = [];
  #autosave: Autosave;
  #suppressAutosave = false;
  /** replaceCode가 넘긴 까닭(에디터 onChange가 'code' 이벤트에 쓴다) */
  #changeSource: CodeSource | null = null;
  #runCount = 0;
  /** 콘솔이 화면 밖인 동안 쌓인 출력의 마지막 줄들과 줄 수(결과 칸 알림에 쓴다) */
  readonly #consoleTail: string[] = [];
  #consoleNewLines = 0;
  /** 콘솔이 화면에 보이는지(null = 아직 재지 않음 — 처음 출력 때 한 번 재고 그 뒤로는 IntersectionObserver가 고친다) */
  #consoleVisible: boolean | null = null;
  /** 알림 글자 쓰기를 모으는 화면 그리기 예약 */
  #consoleNoticeFrame: number | null = null;
  #fontSizePx = DEFAULT_FONT_SIZE_PX;
  #pendingInput: RuntimeRequest | null = null;
  /** 파이썬을 받는 동안 누른 [실행] — 준비가 끝나면 바로 실행한다 */
  #pendingRun = false;
  /** holdRun으로 알린, 아직 끝나지 않은 준비 작업 */
  readonly #runHolds = new Set<Promise<unknown>>();
  /** [실행]이 준비 작업을 기다리는 중(단추는 예약과 같은 모습) */
  #holdWaiting = false;
  /** 기다리는 동안 [정지]·실행 대상 바꾸기가 있었으면 그 실행을 버린다 */
  #holdCancelled = false;
  /** [실행] 단추의 원래 글자 */
  #runLabel = '실행';
  /**
   * [실행]·[정지] 가운데 초점이 있던 단추가 꺼지면(disabled) 초점을 옮길 단추. 키보드로 [실행]을 누르면 실행이 시작되며 [실행]이 꺼져
   * 초점이 문서(body)로 사라졌다 — 화면 낭독기 사용자는 자리를 잃고, 다음 Tab은 쪽 처음부터였다(2026-09-26 Phase 6 사용성 검토 지적 1).
   * 이제 [실행] → [정지], [정지] → [실행]으로 옮긴다(둘 다 꺼져 있으면 먼저 켜지는 단추로). 학생이 초점을 다른 곳으로 옮기면 그만둔다.
   */
  #focusFollow: 'run' | 'stop' | null = null;
  #disposed = false;
  /** (P3-06) [실행] 때 파이썬 실행기로 보낼 코드를 바꾸는 함수(setRunCodeTransform) */
  #runCodeTransform: ((code: string) => string | null) | null = null;

  /** 실행 대상(setRunTarget)과, 그 대상이 돌고 있는 동안의 기록·input 줄 약속 */
  #runTarget: LabRunTarget | null = null;
  #targetRun: { readonly startedAt: number; stopRequestedAt: number | null } | null = null;
  #targetPromptResolve: ((value: string | null) => void) | null = null;
  /** 실행 대상이 이번 실행 동안만 바꾼 상태 글(ctx.setStatus) */
  #targetStatusText: string | null = null;

  constructor(root: HTMLElement, elements: ShellElements) {
    this.root = root;
    this.#elements = elements;
    this.labId = root.dataset.labId ?? 'lab';
    this.#runLabel = elements.runButton.textContent?.trim() || '실행';
    this.examples = readExamples(root);
    const forceLimited = new URLSearchParams(window.location.search).get('limited') === '1';
    // labId를 넘기면 워커가 이 실습실에 붙는 흉내 모듈의 파이썬 파일만 넣는다(가상 보드의 machine·time 흉내는 ESP32 실습실에만, P3-01).
    this.runtime = new PythonRuntime({ forceLimited, labId: this.labId });

    // 1. 시작 코드와 예제 정하기(파일 머리말의 순서)
    const share = hasShareHash(window.location.hash) ? parseShareHash(window.location.hash) : null;
    const queryFile = new URLSearchParams(window.location.search).get('example');
    const queryExample = findExampleByFile(this.examples, queryFile);
    // 주소에 ?example=이 있는데 그런 파일이 없으면 조용히 다른 예제를 열지 않고 한 번 알린다(공유 링크가 망가졌을 때와 같은 방식).
    // findExampleByFile은 못 찾으면 undefined를 돌려준다(null이 아님 — 2026-09-17 브라우저 테스트에서 이 비교가 늘 거짓이던 것을 발견).
    const missingQueryFile = queryFile !== null && queryFile !== '' && queryExample === undefined;
    const initial =
      findExample(this.examples, share?.example) ??
      queryExample ??
      findExample(this.examples, root.dataset.initialExample) ??
      findExample(this.examples, readItem(lastExampleStorageName(this.labId))) ??
      this.examples[0] ??
      null;
    this.#example = initial;
    this.#autosave = this.#createAutosave(initial);
    const restored = this.#autosave.restore();
    let doc: string;
    let source: CodeSource;
    if (share?.code !== undefined) {
      doc = share.code;
      source = 'share';
    } else if (restored !== null) {
      doc = restored;
      source = 'restore';
    } else {
      doc = this.#originalCode();
      source = 'example';
    }

    // 2. 에디터
    this.#fontSizePx = readFontSize();
    this.editor = createPythonEditor({
      parent: elements.editorHost,
      doc,
      ariaLabel: elements.editorHost.dataset.label ?? '파이썬 코드',
      describedBy: elements.editorHint?.id,
      fontSizePx: this.#fontSizePx,
      onChange: (code) => this.#handleChange(code),
      onRun: () => {
        void this.run();
      },
    });
    this.#applyFontSize(false);
    this.#renderExampleSelect();
    this.#renderLessonLink();
    this.#renderExampleDescription();
    // 공유 링크로 열었을 때는 보이는 코드가 저장본이 아니므로 "저장됨"을 보이지 않는다(고치면 그때 저장된다).
    this.#setSaveState(source === 'restore' ? 'saved' : 'idle');
    if (share) {
      root.dataset.shareLoaded = share.code !== undefined ? 'yes' : 'broken';
      // 주소의 #을 지운다: 새로고침하면 자동 저장본이 열리고, 주소를 다시 공유해도 옛 코드가 따라가지 않는다.
      const cleanUrl = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(window.history.state, '', cleanUrl);
      if (share.code !== undefined) {
        this.showMessage('공유 링크의 코드를 불러왔어요. 고치면 이 컴퓨터에 자동 저장돼요.');
      } else {
        this.showMessage('공유 링크가 망가져 있어서 코드를 읽지 못했어요. 링크를 보낸 사람에게 다시 받아 주세요.');
      }
    } else if (missingQueryFile) {
      root.dataset.exampleMissing = queryFile ?? '';
      const opened = this.#example ? withParticle(`'${this.#example.title}' 예제`, '으로/로') : '빈 편집칸으로';
      this.showMessage(`링크에 적힌 예제(${queryFile})를 찾지 못해서 ${opened} 열었어요. 예제 목록에서 골라 주세요.`);
    }
    this.#emit('code', { code: doc, source });
    this.#emit('example', { example: this.#example });

    // 3. 실행기와 조작 잇기
    this.#wireRuntime();
    this.#wireControls();
    this.#wireDialogs();
    this.#wireRecordsCleared();
    this.#wirePageLifecycle();
    this.runtime.load().catch(() => {
      // 실패 안내는 notice 이벤트와 상태 글이 보여 준다.
    });
  }

  get currentExample(): LabExample | null {
    return this.#example;
  }

  getCode(): string {
    return this.editor.getValue();
  }

  setCode(code: string, options: { save?: boolean } = {}): void {
    const save = options.save ?? true;
    this.#suppressAutosave = !save;
    try {
      this.editor.setValue(code);
    } finally {
      this.#suppressAutosave = false;
    }
    if (!save) {
      this.#emit('code', { code, source: 'set' });
    }
  }

  replaceCode(from: number, to: number, insert: string, source: CodeSource = 'edit'): boolean {
    this.#changeSource = source;
    try {
      return this.editor.replaceRange(from, to, insert);
    } finally {
      this.#changeSource = null;
    }
  }

  async run(): Promise<RunResult | null> {
    if (this.#runTarget) {
      return this.#runOnTarget(this.#runTarget);
    }
    /*
     * 파이썬을 받는 동안(unloaded·loading) 누른 [실행]은 버리지 않고 예약한다. 느린 학교 네트워크에서는 준비에 몇 분이 걸려서
     * (PLAN §5.1 Fast 3G 계산값 약 3.6분) 예전처럼 단추를 꺼 두면 학생의 첫 클릭이 아무 반응 없이 사라졌다(2026-09-17 검토 반영).
     */
    if (this.runtime.state === 'unloaded' || this.runtime.state === 'loading') {
      this.#pendingRun = true;
      this.#renderRunButton();
      this.showMessage('파이썬을 준비하는 중이에요. 준비가 끝나면 바로 실행할게요.');
      this.#emit('run-pending', { code: this.getCode() });
      return null;
    }
    if (this.runtime.state !== 'idle' || this.#holdWaiting) {
      return null;
    }
    if (this.#runHolds.size > 0) {
      // 파이썬은 준비됐지만 모듈이 워커에 넣는 파일(보드 라이브러리·가상 파일)이 아직이다 — 끝난 뒤에 코드를 보낸다.
      this.#holdWaiting = true;
      this.#holdCancelled = false;
      this.#renderRunButton();
      await this.#settleRunHolds();
      this.#holdWaiting = false;
      this.#renderRunButton();
      if (this.#holdCancelled || this.#disposed || this.#runTarget || this.runtime.state !== 'idle') {
        return null;
      }
    }
    const code = this.getCode();
    this.#beginRun(code, null);
    try {
      const sent = this.#runCodeTransform?.(code) ?? code;
      return await this.runtime.run(sent, this.#example?.packages ? { packages: this.#example.packages } : {});
    } catch (error) {
      this.appendConsole(`[오류] ${error instanceof Error ? error.message : String(error)}\n`, 'notice');
      return null;
    }
  }

  /** 실행을 시작할 때 파이썬 실행기·실행 대상이 함께 하는 일: 번호·결과 지우기·콘솔 머리줄·'run' 이벤트·결과 칸으로 화면 옮기기 */
  #beginRun(code: string, target: string | null): void {
    this.#runCount += 1;
    this.root.dataset.runCount = String(this.#runCount);
    this.root.dataset.outcome = '';
    this.root.dataset.stopMs = '';
    if (this.#elements.resultText) {
      this.#elements.resultText.textContent = '';
    }
    // 지난 실행이 남긴 안내(예: "오류로 끝났어요: NameError …")는 새 실행과 맞지 않으니 지운다.
    this.showMessage('');
    // 지난 실행의 "콘솔에 결과가 나왔어요" 알림도 지운다(이번 실행의 출력이 오면 다시 뜬다).
    this.#resetConsoleOutputNotice();
    // 첫 준비 동안 맨 위로 올려 둔 준비 패널(LabShell.astro의 data-loading-intro)을 제자리로 돌린 뒤에 화면 위치를 잰다.
    this.root.dataset.loadingIntro = 'no';
    this.appendConsole(`── 실행 ${this.#runCount} ──\n`, 'notice');
    this.#emit('run', { code, runCount: this.#runCount, target });
    // 결과가 첫 화면 밖이면(검토 실측: 1366×768에서 출력 제목 y≈678, 375×812에서 y≈2,056) 결과 칸으로 화면을 옮긴다.
    // io 슬롯이 결과 부분에 data-lab-reveal-on-run(넓은 칸)·data-lab-reveal-on-run-min(꼭 보여야 하는 최소 칸)을 달아 두었으면 그것을,
    // 없으면 입력·출력 칸 전체를 본다(영상처리 실습실: 출력 칸 전체 → 출력 화면 틀).
    // 조절 막대(@slider 등)가 있으면 결과와 첫 조절 막대를 한 화면에 함께 보인다 — 결과를 보면서 막대를 움직이게(시나리오 A 3단계).
    // 출력이 이미 보여도 막대가 화면 밖이면 옮긴다(1366×768 첫 실습에서 그랬다). 함께 못 넣으면 결과만 화면 가운데에 보인다.
    // 여유 40px: 첫 결과가 오면 입력 칸에 "카메라를 켰어요"·전달 속도 줄이 생겨 막대가 조금 내려간다.
    const ioSection = this.#elements.ioSection;
    const wide = ioSection?.querySelector('[data-lab-reveal-on-run]') ?? ioSection;
    const narrow = ioSection?.querySelector('[data-lab-reveal-on-run-min]') ?? null;
    revealTogether([wide, narrow], this.root.querySelector('[data-lab-param]'), { slack: 40, block: 'center' });
  }

  stop(): Promise<StopResult> {
    if (this.#targetRun && this.#runTarget) {
      return this.#stopTarget(this.#runTarget);
    }
    if (this.#holdWaiting) {
      // 준비 작업을 기다리던 [실행]은 아직 코드를 보내지 않았다 — 그 실행을 버린다.
      this.#holdCancelled = true;
    }
    return this.runtime.stop();
  }

  holdRun(task: Promise<unknown>): void {
    const tracked = task.then(
      () => undefined,
      () => undefined,
    );
    this.#runHolds.add(tracked);
    void tracked.then(() => {
      this.#runHolds.delete(tracked);
    });
  }

  /** holdRun 약속이 모두 끝날 때까지(기다리는 동안 새로 알린 것까지) 기다린다. RUN_HOLD_MAX_MS를 넘으면 그만 기다린다. */
  async #settleRunHolds(): Promise<void> {
    const deadline = Date.now() + RUN_HOLD_MAX_MS;
    while (this.#runHolds.size > 0) {
      const left = deadline - Date.now();
      if (left <= 0) {
        this.root.dataset.runHoldTimedOut = 'yes';
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, left);
      });
      await Promise.race([Promise.all([...this.#runHolds]), timeout]);
      clearTimeout(timer);
    }
  }

  get runTarget(): LabRunTarget | null {
    return this.#runTarget;
  }

  prompt(label: string): Promise<string | null> {
    return this.#promptForTarget(label);
  }

  setRunCodeTransform(transform: ((code: string) => string | null) | null): void {
    this.#runCodeTransform = transform;
  }

  setRunTarget(target: LabRunTarget | null): void {
    if (target === this.#runTarget) {
      return;
    }
    if (this.#targetRun || this.runtime.state === 'running' || this.runtime.state === 'stopping') {
      throw new Error('실행 중에는 실행 대상을 바꿀 수 없어요. [정지]한 뒤에 바꿔요.');
    }
    this.#runTarget = target;
    if (target && this.#pendingRun) {
      // 파이썬을 기다리며 눌러 둔 [실행]은 대상이 바뀌었으니 취소한다(학생이 대상을 보고 다시 누른다).
      this.#pendingRun = false;
    }
    if (target && this.#holdWaiting) {
      // 준비 작업을 기다리던 [실행]도 같다.
      this.#holdCancelled = true;
    }
    this.#renderTargetState();
  }

  async #runOnTarget(target: LabRunTarget): Promise<RunResult | null> {
    if (this.#targetRun) {
      return null;
    }
    const code = this.getCode();
    const startedAt = performance.now();
    this.#targetRun = { startedAt, stopRequestedAt: null };
    this.#targetStatusText = null;
    this.#renderTargetState();
    this.#beginRun(code, target.label);
    let result: RunResult;
    try {
      result = await target.run(code, {
        runCount: this.#runCount,
        write: (text, kind = 'stdout') => this.appendConsole(text, kind),
        prompt: (label) => this.#promptForTarget(label),
        setStatus: (text) => {
          this.#targetStatusText = text;
          this.#renderTargetState();
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result = {
        runId: this.#runCount,
        outcome: 'error',
        error: { type: 'RunTargetError', message: `${target.label}에서 실행하지 못했어요: ${message}`, traceback: '' },
        durationMs: performance.now() - startedAt,
      };
    }
    const run = this.#targetRun;
    this.#targetRun = null;
    this.#targetStatusText = null;
    this.#resolveTargetPrompt(null);
    if (run && run.stopRequestedAt !== null && result.stopMs === undefined) {
      result = { ...result, stopMs: performance.now() - run.stopRequestedAt };
    }
    this.#hideInput();
    this.#showResult(result);
    this.#emit('done', result);
    this.#renderTargetState();
    return result;
  }

  async #stopTarget(target: LabRunTarget): Promise<StopResult> {
    const run = this.#targetRun;
    if (run && run.stopRequestedAt === null) {
      run.stopRequestedAt = performance.now();
      this.#renderTargetState();
    }
    this.#resolveTargetPrompt(null);
    try {
      await target.stop();
    } catch (error) {
      this.appendConsole(`[오류] ${target.label}을(를) 멈추지 못했어요: ${error instanceof Error ? error.message : String(error)}\n`, 'notice');
    }
    return 'stopped';
  }

  #promptForTarget(label: string): Promise<string | null> {
    const { inputForm, inputLabel, inputField } = this.#elements;
    // 실행 대상이 돌고 있거나(그 대상의 ctx.prompt), 대상이 없고 이 페이지의 파이썬이 돌고 있을 때(보드 콘솔 input)만 연다
    const running = this.#targetRun !== null || (this.#runTarget === null && this.runtime.state === 'running');
    if (!running || !inputForm || !inputField) {
      return Promise.resolve(null);
    }
    this.#resolveTargetPrompt(null);
    return new Promise<string | null>((resolve) => {
      this.#targetPromptResolve = resolve;
      this.#pendingInput = {
        requestId: -1,
        kind: 'input',
        payload: { prompt: label },
        reply: (value) => this.#resolveTargetPrompt(String(value)),
        fail: () => this.#resolveTargetPrompt(null),
      };
      if (inputLabel) {
        inputLabel.textContent = label.trim() !== '' ? label : '입력';
      }
      inputForm.hidden = false;
      inputField.value = '';
      inputField.focus();
    });
  }

  #resolveTargetPrompt(value: string | null): void {
    const resolve = this.#targetPromptResolve;
    this.#targetPromptResolve = null;
    resolve?.(value);
  }

  /** 실행 대상이 있으면 그 상태(idle·running·stopping)로, 없으면 파이썬 실행기 상태로 상태 글·단추·data-state를 그린다 */
  #renderTargetState(): void {
    this.#keepButtonFocus(() => {
      const { stopButton, statusText } = this.#elements;
      const target = this.#runTarget;
      const run = this.#targetRun;
      this.root.dataset.runTarget = target?.label ?? '';
      if (target && run) {
        const stopping = run.stopRequestedAt !== null;
        this.root.dataset.state = stopping ? 'stopping' : 'running';
        if (statusText) {
          statusText.textContent = stopping
            ? `${withParticle(target.label, '을/를')} 멈추는 중이에요…`
            : (this.#targetStatusText ?? `${target.label}에서 실행 중이에요.`);
        }
        stopButton.disabled = stopping;
      } else if (target) {
        this.root.dataset.state = 'idle';
        if (statusText) {
          statusText.textContent = `${target.label}에서 실행할 수 있어요. [실행]을 누르세요.`;
        }
        stopButton.disabled = true;
      } else {
        const state = this.runtime.state;
        this.root.dataset.state = state;
        if (statusText) {
          statusText.textContent = STATE_TEXT[state];
        }
        stopButton.disabled = state !== 'running';
      }
      this.#paintRunButton();
    });
  }

  /**
   * 단추 상태를 바꾸는 그리기를 감싼다: 초점이 있던 [실행]·[정지]가 꺼지면 다른 단추로 초점을 옮긴다(#focusFollow).
   * 초점을 옮길 때 화면은 움직이지 않는다(preventScroll) — [실행] 뒤 결과 칸으로 옮겨 간 화면(revealTogether)을 되돌리지 않게.
   */
  #keepButtonFocus(render: () => void): void {
    const { runButton, stopButton } = this.#elements;
    const active = document.activeElement;
    render();
    if (active === runButton && runButton.disabled) {
      this.#focusFollow = 'stop';
    } else if (active === stopButton && stopButton.disabled) {
      this.#focusFollow = 'run';
    }
    this.#followButtonFocus();
  }

  #followButtonFocus(): void {
    const follow = this.#focusFollow;
    if (!follow) {
      return;
    }
    const { runButton, stopButton } = this.#elements;
    const active = document.activeElement;
    const lost = active === null || active === document.body || ((active === runButton || active === stopButton) && (active as HTMLButtonElement).disabled);
    if (!lost) {
      // 학생이 초점을 다른 곳(편집칸·입력줄 등)으로 옮겼다 — 따라가지 않는다.
      this.#focusFollow = null;
      return;
    }
    const preferred = follow === 'stop' ? stopButton : runButton;
    const other = follow === 'stop' ? runButton : stopButton;
    const target = !preferred.disabled ? preferred : !other.disabled ? other : null;
    if (target) {
      target.focus({ preventScroll: true });
      this.#focusFollow = null;
    }
    // 둘 다 꺼져 있으면(준비 중에 누른 [실행] — "준비되면 실행돼요…") 기억해 두었다가 먼저 켜지는 단추로 옮긴다.
  }

  reset(): void {
    const original = this.#originalCode();
    this.setCode(original, { save: false });
    this.#autosave.forget();
    this.#setSaveState('idle');
    this.#emit('code', { code: original, source: 'reset' });
    this.showMessage(this.#example ? '예제 원래 코드로 되돌렸어요.' : '처음 코드로 되돌렸어요.');
  }

  loadExample(id: string): boolean {
    const example = findExample(this.examples, id);
    if (!example) {
      return false;
    }
    this.#autosave.flush();
    this.#example = example;
    this.#autosave = this.#createAutosave(example);
    const restored = this.#autosave.restore();
    this.setCode(restored ?? example.code, { save: false });
    this.#setSaveState(restored !== null ? 'saved' : 'idle');
    writeItem(lastExampleStorageName(this.labId), example.id);
    this.root.dataset.example = example.id;
    if (this.#elements.exampleSelect) {
      this.#elements.exampleSelect.value = example.id;
    }
    this.#renderLessonLink();
    this.#renderExampleDescription();
    this.#emit('example', { example });
    this.#emit('code', { code: this.getCode(), source: 'example' });
    this.showMessage(restored !== null ? `"${example.title}" 예제의 저장된 코드를 불러왔어요.` : `"${example.title}" 예제를 불러왔어요.`);
    return true;
  }

  appendConsole(text: string, kind: ConsoleKind = 'stdout'): void {
    const box = this.#elements.consoleBox;
    const span = document.createElement('span');
    span.className = `lab-console__line lab-console__line--${kind}`;
    span.textContent = text;
    box.append(span);
    while (box.childNodes.length > MAX_CONSOLE_LINES) {
      box.firstChild?.remove();
    }
    box.scrollTop = box.scrollHeight;
    // 콘솔이 화면 밖이면 결과 칸에 "결과가 나왔어요"를 띄운다(실행 머리줄 '── 실행 N ──'은 빼고 진짜 출력만).
    if (kind !== 'notice' || !text.startsWith('── 실행 ')) {
      this.#noteConsoleOutput(text);
    }
  }

  clearConsole(): void {
    this.#elements.consoleBox.replaceChildren();
    if (this.#elements.resultText) {
      this.#elements.resultText.textContent = '';
    }
    this.#resetConsoleOutputNotice();
  }

  /**
   * 콘솔에 새 출력이 생겼다는 것을 결과 칸에서 알린다(2026-09-18 검토 반영).
   *
   * 왜: 실습실은 세로로 길어 콘솔이 결과 칸보다 688px(1366×768)·696px(375×812) 아래에 있다. 결과가 print()뿐인 예제에서
   * [실행]을 눌러도 화면에는 아무 변화가 없어 학생이 "안 된다"로 읽었다. 화면을 저절로 콘솔로 내리면 이번에는 보드 그림이
   * 화면 밖으로 나가므로(둘은 한 화면에 들어가지 않는다) 옮기지 않고, 결과 칸 아래에 마지막 줄을 비춰 주고 [콘솔 보기]를 둔다.
   * 콘솔이 이미 보이면 아무것도 하지 않는다.
   */
  #noteConsoleOutput(text: string): void {
    const { ioOutputBox, consoleBox } = this.#elements;
    if (!ioOutputBox || typeof window === 'undefined') {
      return;
    }
    /*
     * 콘솔이 보이는지는 처음 한 번만 잰다(getBoundingClientRect는 배치를 다시 계산한다 — 초당 수백 줄이 오는 실행에서
     * 줄마다 재면 느려진다). 그 뒤로는 아래 IntersectionObserver가 값을 고쳐 준다.
     */
    if (this.#consoleVisible === null) {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      this.#consoleVisible = viewportHeight > 0 ? isMostlyVisible(consoleBox, viewportHeight) : true;
    }
    if (this.#consoleVisible) {
      if (this.#consoleNewLines > 0) {
        this.#resetConsoleOutputNotice();
      }
      return;
    }
    let added = 0;
    for (const line of text.split('\n')) {
      if (line.trim() !== '') {
        this.#consoleTail.push(line);
        added += 1;
      }
    }
    if (added === 0) {
      return;
    }
    this.#consoleNewLines += added;
    while (this.#consoleTail.length > CONSOLE_TAIL_LINES) {
      this.#consoleTail.shift();
    }
    // 글자 쓰기는 한 화면 그리기에 한 번만 모아 한다(줄마다 DOM을 고치지 않게).
    if (this.#consoleNoticeFrame === null) {
      this.#consoleNoticeFrame = requestFrame(() => {
        this.#consoleNoticeFrame = null;
        this.#renderConsoleOutputNotice();
      });
    }
  }

  #renderConsoleOutputNotice(): void {
    const { ioOutputBox } = this.#elements;
    if (!ioOutputBox || this.#consoleNewLines === 0) {
      return;
    }
    const first = ioOutputBox.hidden;
    ioOutputBox.hidden = false;
    if (first && this.#elements.ioOutputHead) {
      // 화면 낭독기에는 실행마다 한 번만 알린다(줄마다 읽어 주면 시끄럽다).
      this.#elements.ioOutputHead.textContent = '콘솔에 결과가 나왔어요.';
    }
    if (this.#elements.ioOutputCount) {
      this.#elements.ioOutputCount.textContent = `(${this.#consoleNewLines}줄)`;
    }
    if (this.#elements.ioOutputText) {
      this.#elements.ioOutputText.textContent = this.#consoleTail.join('\n');
    }
    if (this.#elements.consoleNewBadge) {
      this.#elements.consoleNewBadge.hidden = false;
      this.#elements.consoleNewBadge.textContent = `새 출력 ${this.#consoleNewLines}줄`;
    }
    if (first) {
      /*
       * 알림은 처음에 결과 칸 맨 아래(핀 표 다음)에 있어 [실행] 뒤 화면 위치에서는 접힌 곳 아래일 수 있다.
       * io 슬롯이 `[data-lab-io-output-anchor]`로 자리를 알려 주면(보드 그림 바로 아래·출력 화면 바로 아래) 알림을 그 뒤로 옮겨,
       * 꼭 보여야 하는 칸(보드 그림)과 알림이 한 화면에 함께 들어오게 한다. 그래도 못 넣으면 **보드 그림을** 보인다
       * (2026-09-25 Phase 4 검토 반영 — 전에는 알림 쪽으로 옮겨 LED·네오픽셀 링이 화면 밖으로 밀렸다. 알림을 화면 아래에 붙여 띄우는
       * 방법(sticky)은 휴대폰에서 보드 조작 칸(4채널 터치 패드)을 덮어 손가락이 닿지 않아 쓰지 않는다 — 리눅스 CI에서 드러남).
       */
      const ioSection = this.#elements.ioSection;
      const anchor = ioSection?.querySelector<HTMLElement>('[data-lab-io-output-anchor]') ?? null;
      if (anchor !== null && anchor.nextElementSibling !== ioOutputBox) {
        anchor.after(ioOutputBox);
      }
      const narrow = ioSection?.querySelector('[data-lab-reveal-on-run-min]') ?? null;
      revealTogether(narrow ? [narrow] : [ioOutputBox], ioOutputBox, { margin: 8, fallback: narrow ?? ioOutputBox });
    }
  }

  #resetConsoleOutputNotice(): void {
    this.#consoleTail.length = 0;
    this.#consoleNewLines = 0;
    if (this.#consoleNoticeFrame !== null) {
      cancelFrame(this.#consoleNoticeFrame);
      this.#consoleNoticeFrame = null;
    }
    if (this.#elements.ioOutputBox) {
      this.#elements.ioOutputBox.hidden = true;
    }
    if (this.#elements.ioOutputHead) {
      this.#elements.ioOutputHead.textContent = '';
    }
    if (this.#elements.ioOutputText) {
      this.#elements.ioOutputText.textContent = '';
    }
    if (this.#elements.consoleNewBadge) {
      this.#elements.consoleNewBadge.hidden = true;
    }
  }

  /** [콘솔 보기]: 콘솔로 화면을 옮기고 초점을 준다(키보드만 쓰는 학생도 바로 읽게). */
  #jumpToConsole(): void {
    const box = this.#elements.consoleBox;
    revealElement(box.closest('.lab__console') ?? box, { block: 'start' });
    try {
      box.focus({ preventScroll: true });
    } catch {
      box.focus();
    }
    this.#resetConsoleOutputNotice();
  }

  showMessage(text: string): void {
    if (this.#elements.messageText) {
      this.#elements.messageText.textContent = text;
    }
  }

  on<K extends keyof LabEvents>(event: K, listener: LabListener<K>): () => void {
    let set = this.#listeners.get(event);
    if (!set) {
      set = new Set();
      this.#listeners.set(event, set);
    }
    set.add(listener as LabListener<keyof LabEvents>);
    return () => {
      set.delete(listener as LabListener<keyof LabEvents>);
    };
  }

  onRequest(kind: string, handler: RequestHandler): () => void {
    this.#requestHandlers.set(kind, handler);
    return () => {
      if (this.#requestHandlers.get(kind) === handler) {
        this.#requestHandlers.delete(kind);
      }
    };
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#resolveTargetPrompt(null);
    for (const cleanup of this.#cleanups.splice(0)) {
      cleanup();
    }
    this.#autosave.dispose();
    this.runtime.dispose();
    this.editor.destroy();
  }

  #emit<K extends keyof LabEvents>(event: K, payload: LabEvents[K]): void {
    const set = this.#listeners.get(event);
    if (!set) {
      return;
    }
    for (const listener of [...set]) {
      try {
        (listener as LabListener<K>)(payload);
      } catch (error) {
        console.error('실습실 이벤트 처리 중 오류', error);
      }
    }
  }

  #originalCode(): string {
    return this.#example?.code ?? DEFAULT_SCRATCH_CODE;
  }

  #createAutosave(example: LabExample | null): Autosave {
    return new Autosave({
      name: editorStorageName(this.labId, example?.id ?? null),
      onStatus: (status) => this.#setSaveState(status),
    });
  }

  #setSaveState(status: AutosaveStatus): void {
    this.root.dataset.saveState = status;
    if (this.#elements.saveText) {
      this.#elements.saveText.textContent = SAVE_TEXT[status];
    }
    this.#emit('save', { status });
  }

  #handleChange(code: string): void {
    if (!this.#suppressAutosave) {
      this.#autosave.update(code);
      this.#emit('code', { code, source: this.#changeSource ?? 'edit' });
    }
  }

  #applyFontSize(save: boolean): void {
    this.editor.setFontSize(this.#fontSizePx);
    const { fontSmaller, fontLarger, fontSizeText } = this.#elements;
    if (fontSizeText) {
      fontSizeText.textContent = `${this.#fontSizePx}px`;
    }
    if (fontSmaller) {
      fontSmaller.disabled = !canStepFontSize(this.#fontSizePx, -1);
    }
    if (fontLarger) {
      fontLarger.disabled = !canStepFontSize(this.#fontSizePx, 1);
    }
    this.root.dataset.fontSize = String(this.#fontSizePx);
    if (save) {
      saveFontSize(this.#fontSizePx);
    }
  }

  #renderExampleSelect(): void {
    const select = this.#elements.exampleSelect;
    if (!select) {
      return;
    }
    if (this.#example) {
      select.value = this.#example.id;
      this.root.dataset.example = this.#example.id;
    } else {
      this.root.dataset.example = '';
    }
    const empty = this.examples.length === 0;
    select.disabled = empty;
    if (this.#elements.exampleLoadButton) {
      this.#elements.exampleLoadButton.disabled = empty;
    }
  }

  /** "이 예제가 나오는 차시" 줄(예제에 lesson 값이 있을 때만) */
  #renderLessonLink(): void {
    const { lessonBox, lessonLink } = this.#elements;
    if (!lessonBox || !lessonLink) {
      return;
    }
    const lesson = this.#example?.lesson;
    if (!lesson) {
      lessonBox.hidden = true;
      return;
    }
    lessonLink.href = lesson.href;
    lessonLink.textContent = lesson.label;
    lessonBox.hidden = false;
  }

  /** 지금 예제의 한 줄 설명(사이드카 description)을 조작 줄 아래에 보인다 */
  #renderExampleDescription(): void {
    const box = this.#elements.exampleDescription;
    if (!box) {
      return;
    }
    const description = this.#example?.description?.trim() ?? '';
    box.textContent = description;
    box.hidden = description === '';
  }

  /**
   * [실행] 단추의 글자와 눌림 여부. 파이썬을 받는 동안에도 누를 수 있고(예약), 예약된 뒤에는 무엇을 기다리는지 글자로 알린다.
   * 실행 중·멈추는 중·준비 실패일 때만 끈다.
   */
  #renderRunButton(): void {
    this.#keepButtonFocus(() => this.#paintRunButton());
  }

  /** [실행] 단추만 그린다(초점 옮기기 없이 — 부르는 쪽이 #keepButtonFocus로 감싼다) */
  #paintRunButton(): void {
    const { runButton } = this.#elements;
    const state = this.runtime.state;
    if (this.#runTarget) {
      // 실행 대상(실제 보드)은 파이썬 준비를 기다리지 않는다 — 대상이 도는 동안만 끈다.
      runButton.textContent = this.#runLabel;
      delete runButton.dataset.labRunPending;
      runButton.disabled = this.#targetRun !== null;
      return;
    }
    if (this.#pendingRun || this.#holdWaiting) {
      runButton.textContent = '준비되면 실행돼요…';
      runButton.disabled = true;
      runButton.dataset.labRunPending = 'yes';
      return;
    }
    runButton.textContent = this.#runLabel;
    delete runButton.dataset.labRunPending;
    runButton.disabled = state === 'running' || state === 'stopping' || state === 'failed';
  }

  #hideInput(): void {
    this.#pendingInput = null;
    if (this.#elements.inputForm) {
      this.#elements.inputForm.hidden = true;
    }
  }

  #showResult(result: RunResult): void {
    /*
     * 결과 줄은 학생이 읽는 문장이라 사이트 안쪽 용어("정지 2단계")와 경과 밀리초를 넣지 않는다(2026-09-17 검토 반영).
     * 그 값이 필요한 테스트·개발자는 뿌리 요소의 data-outcome·data-stop-ms를 읽는다.
     */
    let text: string;
    switch (result.outcome) {
      case 'ok':
        text = result.exitCode === undefined ? '실행이 끝났어요.' : `exit()로 끝났어요(종료 코드 ${result.exitCode ?? '없음'}).`;
        break;
      case 'stopped':
        text = '[정지]를 눌러 멈췄어요(KeyboardInterrupt).';
        break;
      case 'killed':
        text = `${STOP_GRACE_MS / 1000}초 안에 멈추지 않아서 파이썬을 다시 시작했어요. 잠깐 뒤에 다시 실행할 수 있어요.`;
        break;
      default:
        text = `오류로 끝났어요: ${result.error?.message ?? '알 수 없는 오류'}`;
        if (result.error?.traceback) {
          this.appendConsole(`${result.error.traceback}\n`, 'stderr');
        }
    }
    if (this.#elements.resultText) {
      this.#elements.resultText.textContent = text;
    }
    this.root.dataset.outcome = result.outcome;
    this.root.dataset.stopMs = result.stopMs === undefined ? '' : String(Math.round(result.stopMs));
  }

  #wireRuntime(): void {
    const { stopButton, statusText, progressText, limitedNotice } = this.#elements;
    const runtime = this.runtime;
    // HTML은 [실행]을 꺼 둔 채로 오지만, 파이썬을 받는 동안에도 미리 누를 수 있어야 하므로 여기서 한 번 다시 그린다.
    this.#renderRunButton();
    this.#cleanups.push(
      runtime.on('state', ({ state }) => {
        // 실행 대상(setRunTarget)을 끼운 동안에는 상태 글·단추·data-state를 대상이 정한다(파이썬은 뒤에서 준비만 이어 간다).
        if (this.#runTarget) {
          this.#renderTargetState();
        } else {
          this.#keepButtonFocus(() => {
            this.root.dataset.state = state;
            if (statusText) {
              statusText.textContent = STATE_TEXT[state];
            }
            this.#paintRunButton();
            stopButton.disabled = state !== 'running';
          });
          if (state !== 'running') {
            this.#hideInput();
            this.#resolveTargetPrompt(null);
          }
        }
        this.#emit('state', { state });
        if (state === 'idle' && this.#pendingRun) {
          /*
           * 준비되는 동안 눌러 둔 [실행]을 이제 실행한다. 바로 부르지 않고 한 박자(setTimeout 0) 미룬다:
           * 실행기는 state 'idle' 바로 뒤에 'ready'를 알리고, 영상처리 실습실은 그때 OpenCV 미리 받기(loadPackages)를 워커에 보낸다.
           * 실행을 먼저 보내면 워커가 "실행 중에는 패키지를 불러올 수 없어요"로 미리 받기를 거절해 콘솔에 헷갈리는 안내가 남는다
           * (실행 쪽 패키지 받기는 Pyodide의 패키지 잠금을 기다렸다가 이어진다 — 2026-09-17 확인).
           */
          this.#pendingRun = false;
          this.#renderRunButton();
          window.setTimeout(() => {
            if (this.#disposed || this.runtime.state !== 'idle') {
              return;
            }
            void this.run();
            this.showMessage('준비가 끝나서 눌러 둔 [실행]을 시작했어요.');
          }, 0);
        } else if (state === 'failed' && this.#pendingRun) {
          this.#pendingRun = false;
          this.#renderRunButton();
          this.showMessage('파이썬을 준비하지 못해서 실행하지 못했어요. 잠시 뒤 새로고침해 주세요.');
        }
      }),
      runtime.on('ready', (info) => {
        this.root.dataset.jspi = info.jspi ? 'yes' : 'no';
        this.root.dataset.limited = info.limited ? 'yes' : 'no';
        if (limitedNotice) {
          limitedNotice.hidden = !info.limited;
        }
        if (progressText) {
          progressText.textContent = '준비 끝';
        }
      }),
      runtime.on('progress', ({ message }) => {
        if (progressText) {
          progressText.textContent = message;
        }
      }),
      runtime.on('stdout', (text) => this.appendConsole(text, 'stdout')),
      runtime.on('stderr', (text) => this.appendConsole(text, 'stderr')),
      runtime.on('notice', ({ level, text }) => {
        const label = level === 'error' ? '오류' : level === 'warn' ? '알림' : '안내';
        this.appendConsole(`[${label}] ${text}\n`, 'notice');
      }),
      runtime.on('done', (result) => {
        this.#hideInput();
        this.#resolveTargetPrompt(null);
        this.#showResult(result);
        this.#emit('done', result);
      }),
      runtime.on('request', (request) => this.#handleRequest(request)),
    );
  }

  #handleRequest(request: RuntimeRequest): void {
    if (request.kind === 'input') {
      const { inputForm, inputLabel, inputField } = this.#elements;
      if (!inputForm || !inputField) {
        request.fail('이 화면에는 입력줄이 없어서 input()을 쓸 수 없어요.');
        return;
      }
      this.#pendingInput = request;
      const payload = request.payload as { prompt?: string } | null;
      const prompt = typeof payload?.prompt === 'string' && payload.prompt.trim() !== '' ? payload.prompt : '입력';
      if (inputLabel) {
        inputLabel.textContent = prompt;
      }
      inputForm.hidden = false;
      inputField.value = '';
      inputField.focus();
      return;
    }
    const handler = this.#requestHandlers.get(request.kind);
    if (handler) {
      try {
        handler(request);
      } catch (error) {
        request.fail(`"${request.kind}" 요청을 처리하다 오류가 났어요: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    request.fail(`이 실습실은 "${request.kind}" 요청을 처리하지 못해요.`);
  }

  #wireControls(): void {
    const e = this.#elements;
    const listen = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | null,
      type: K,
      handler: (event: HTMLElementEventMap[K]) => void,
    ) => {
      if (!target) {
        return;
      }
      target.addEventListener(type, handler);
      this.#cleanups.push(() => target.removeEventListener(type, handler));
    };

    listen(e.runButton, 'click', () => {
      void this.run();
    });
    listen(e.stopButton, 'click', () => {
      void this.stop();
    });
    listen(e.resetButton, 'click', () => {
      if (this.getCode() === this.#originalCode()) {
        this.showMessage(this.#example ? '지금 코드가 이미 예제 원래 코드예요.' : '지금 코드가 이미 처음 코드예요.');
        return;
      }
      if (e.resetDialog) {
        openDialog(e.resetDialog);
        e.resetConfirm?.focus();
      } else if (window.confirm('지금 코드를 지우고 예제 원래 코드로 되돌릴까요?')) {
        this.reset();
      }
    });
    listen(e.exampleLoadButton, 'click', () => {
      const id = e.exampleSelect?.value ?? '';
      if (!this.loadExample(id)) {
        this.showMessage('불러올 예제를 먼저 골라 주세요.');
      }
    });
    listen(e.shareButton, 'click', () => this.#openShare());
    listen(e.downloadButton, 'click', () => {
      const ok = downloadTextFile(exampleFileName(this.#example), this.getCode());
      this.showMessage(ok ? `${exampleFileName(this.#example)} 파일로 내려받아요.` : '이 브라우저에서는 파일 내려받기를 시작하지 못했어요.');
    });
    listen(e.consoleClear, 'click', () => this.clearConsole());
    listen(e.consoleJump, 'click', () => this.#jumpToConsole());
    // 학생이 스스로 콘솔까지 내려오면 "결과가 나왔어요" 알림을 거둔다(알림이 할 일을 다 했다).
    if (typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver(
        () => {
          // 판정은 알림을 띄울 때와 같은 규칙(isMostlyVisible)으로 — 다른 규칙을 쓰면 알림이 떴다 사라졌다 한다.
          const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
          this.#consoleVisible = viewportHeight > 0 ? isMostlyVisible(e.consoleBox, viewportHeight) : true;
          if (this.#consoleVisible) {
            this.#resetConsoleOutputNotice();
          }
        },
        { threshold: [0, 0.25, 0.5, 1] },
      );
      observer.observe(e.consoleBox);
      this.#cleanups.push(() => observer.disconnect());
    }
    listen(e.fontSmaller, 'click', () => {
      this.#fontSizePx = stepFontSize(this.#fontSizePx, -1);
      this.#applyFontSize(true);
    });
    listen(e.fontLarger, 'click', () => {
      this.#fontSizePx = stepFontSize(this.#fontSizePx, 1);
      this.#applyFontSize(true);
    });
    listen(e.inputForm, 'submit', (event) => {
      event.preventDefault();
      const request = this.#pendingInput;
      if (!request || !e.inputField) {
        return;
      }
      const value = e.inputField.value;
      this.appendConsole(`${value}\n`, 'input');
      this.#hideInput();
      request.reply(value);
    });
  }

  #openShare(): void {
    const e = this.#elements;
    try {
      const link = buildShareLink(window.location.href, this.getCode(), this.#example?.id ?? null);
      if (e.shareUrl) {
        e.shareUrl.value = link.url;
      }
      if (e.shareNote) {
        e.shareNote.textContent =
          link.warning ?? `주소 ${link.length.toLocaleString('ko-KR')}자. 이 주소를 연 사람의 편집칸에 지금 코드가 들어가요.`;
      }
      if (e.shareCopied) {
        e.shareCopied.textContent = '';
      }
      if (e.shareDialog) {
        openDialog(e.shareDialog);
        e.shareUrl?.focus();
        e.shareUrl?.select();
      }
      this.showMessage('공유 링크를 만들었어요.');
    } catch (error) {
      const message = error instanceof ShareTooLongError ? error.message : `공유 링크를 만들지 못했어요: ${error instanceof Error ? error.message : String(error)}`;
      this.showMessage(message);
      this.appendConsole(`[안내] ${message}\n`, 'notice');
    }
  }

  #wireDialogs(): void {
    const e = this.#elements;
    const listen = (target: HTMLElement | null, type: string, handler: (event: Event) => void) => {
      if (!target) {
        return;
      }
      target.addEventListener(type, handler);
      this.#cleanups.push(() => target.removeEventListener(type, handler));
    };
    // 대화 상자 안의 [닫기]·[취소] 버튼(data-lab-dialog-close)
    for (const dialog of [e.shareDialog, e.resetDialog]) {
      if (!dialog) {
        continue;
      }
      for (const button of dialog.querySelectorAll<HTMLButtonElement>('[data-lab-dialog-close]')) {
        listen(button, 'click', () => closeDialog(dialog));
      }
    }
    listen(e.resetConfirm, 'click', () => {
      if (e.resetDialog) {
        closeDialog(e.resetDialog);
      }
      this.reset();
      this.editor.focus();
    });
    listen(e.shareCopy, 'click', () => {
      const url = e.shareUrl?.value ?? '';
      const done = (text: string) => {
        if (e.shareCopied) {
          e.shareCopied.textContent = text;
        }
      };
      const clipboard = navigator.clipboard;
      if (clipboard && typeof clipboard.writeText === 'function') {
        clipboard.writeText(url).then(
          () => done('복사했어요. 메신저나 게시판에 붙여 넣어 보내 주세요.'),
          () => {
            e.shareUrl?.select();
            done('자동으로 복사하지 못했어요. 주소 칸을 고른 뒤 Ctrl+C로 복사해 주세요.');
          },
        );
      } else {
        e.shareUrl?.select();
        done('이 브라우저에서는 자동 복사가 안 돼요. 주소 칸을 고른 뒤 Ctrl+C로 복사해 주세요.');
      }
    });
  }

  #wireRecordsCleared(): void {
    const handler = (event: Event) => {
      const removed = (event as CustomEvent<{ removed?: number }>).detail?.removed ?? 0;
      this.#fontSizePx = DEFAULT_FONT_SIZE_PX;
      this.#applyFontSize(false);
      const original = this.#originalCode();
      this.setCode(original, { save: false });
      this.#autosave.forget();
      this.#setSaveState('idle');
      this.#emit('code', { code: original, source: 'records-cleared' });
      this.#emit('records-cleared', { removed });
      this.showMessage('기록을 지웠어요. 편집칸은 예제 원래 코드로 돌아갔어요.');
    };
    document.addEventListener(RECORDS_CLEARED_EVENT, handler);
    this.#cleanups.push(() => document.removeEventListener(RECORDS_CLEARED_EVENT, handler));
  }

  #wirePageLifecycle(): void {
    const onPageHide = () => {
      this.#autosave.flush();
      this.runtime.dispose();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        this.#autosave.flush();
      }
    };
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    this.#cleanups.push(() => {
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }
}

/** 뿌리 요소에 붙여 둔 컨트롤러 */
const controllers = new WeakMap<HTMLElement, LabController>();

/** LabShell HTML 하나를 살아 있는 실습실로 만든다. 이미 만들었으면 그것을 돌려준다. */
export function mountLabShell(root: HTMLElement): LabController | null {
  const existing = controllers.get(root);
  if (existing) {
    return existing;
  }
  const runButton = query<HTMLButtonElement>(root, '[data-lab-run]');
  const stopButton = query<HTMLButtonElement>(root, '[data-lab-stop]');
  const editorHost = query<HTMLElement>(root, '[data-lab-editor]');
  const consoleBox = query<HTMLElement>(root, '[data-lab-console]');
  if (!runButton || !stopButton || !editorHost || !consoleBox) {
    console.error('실습실 화면에 필요한 요소(data-lab-run·data-lab-stop·data-lab-editor·data-lab-console)가 없어요.');
    return null;
  }
  const elements: ShellElements = {
    runButton,
    stopButton,
    resetButton: query(root, '[data-lab-reset]'),
    exampleSelect: query(root, '[data-lab-example-select]'),
    exampleLoadButton: query(root, '[data-lab-example-load]'),
    shareButton: query(root, '[data-lab-share]'),
    downloadButton: query(root, '[data-lab-download]'),
    editorHost,
    editorHint: query(root, '[data-lab-editor-hint]'),
    ioSection: query(root, '[data-lab-io]'),
    fontSmaller: query(root, '[data-lab-font-smaller]'),
    fontLarger: query(root, '[data-lab-font-larger]'),
    fontSizeText: query(root, '[data-lab-font-size]'),
    saveText: query(root, '[data-lab-save]'),
    statusText: query(root, '[data-lab-status]'),
    progressText: query(root, '[data-lab-progress]'),
    messageText: query(root, '[data-lab-message]'),
    lessonBox: query(root, '[data-lab-lesson]'),
    lessonLink: query(root, '[data-lab-lesson-link]'),
    exampleDescription: query(root, '[data-lab-example-description]'),
    limitedNotice: query(root, '[data-lab-limited]'),
    consoleBox,
    consoleClear: query(root, '[data-lab-console-clear]'),
    ioOutputBox: query(root, '[data-lab-io-output]'),
    ioOutputHead: query(root, '[data-lab-io-output-head]'),
    ioOutputCount: query(root, '[data-lab-io-output-count]'),
    ioOutputText: query(root, '[data-lab-io-output-text]'),
    consoleJump: query(root, '[data-lab-console-jump]'),
    consoleNewBadge: query(root, '[data-lab-console-new]'),
    inputForm: query(root, '[data-lab-input-form]'),
    inputLabel: query(root, '[data-lab-input-label]'),
    inputField: query(root, '[data-lab-input]'),
    resultText: query(root, '[data-lab-result]'),
    shareDialog: query(root, '[data-lab-share-dialog]'),
    shareUrl: query(root, '[data-lab-share-url]'),
    shareNote: query(root, '[data-lab-share-note]'),
    shareCopy: query(root, '[data-lab-share-copy]'),
    shareCopied: query(root, '[data-lab-share-copied]'),
    resetDialog: query(root, '[data-lab-reset-dialog]'),
    resetConfirm: query(root, '[data-lab-reset-confirm]'),
  };
  const controller = new LabShellController(root, elements);
  controllers.set(root, controller);
  root.dispatchEvent(new CustomEvent(LAB_READY_EVENT, { detail: { controller } }));
  return controller;
}

/** 페이지 스크립트가 컨트롤러를 받는 방법. 아직 안 만들어졌으면 만들어질 때까지 기다린다. */
export function getLabController(root: HTMLElement | null): Promise<LabController> {
  return new Promise((resolve, reject) => {
    if (!root) {
      reject(new Error('실습실 뿌리 요소([data-lab])를 찾지 못했어요.'));
      return;
    }
    const existing = controllers.get(root);
    if (existing) {
      resolve(existing);
      return;
    }
    root.addEventListener(
      LAB_READY_EVENT,
      (event) => resolve((event as CustomEvent<{ controller: LabController }>).detail.controller),
      { once: true },
    );
  });
}
