/**
 * 파이썬 워커와 화면 사이의 메시지 형식(PLAN §4.4, §8.2 P2-01·P2-03).
 *
 * 화면 쪽 API는 client.ts(PythonRuntime), 워커는 worker.ts, 두 쪽이 함께 쓰는 다리 논리는 bridge.ts,
 * 파이썬 쪽은 src/lab/python/(apc_runtime.py와 흉내 모듈).
 * 메시지는 postMessage로 오가므로 구조화 복제가 되는 값(글자·숫자·불리언·배열·평범한 객체·Uint8Array)만 넣는다.
 * 큰 값(카메라 프레임·출력 영상)은 ArrayBuffer를 transfer 목록에 넣어 복사 없이 옮긴다(P2-03).
 * 타입만 있는 파일이라 실행 코드가 없다.
 *
 * 흉내 모듈이 쓰는 요청·이벤트 종류(P2-03, 카메라·창 — src/lab/python/apc_cv2.py ↔ src/lab/vision/vision-lab.ts)
 *   request 'camera.open'    payload { index }             → reply { ok, width, height, source, fps }
 *   request 'camera.read'    payload {}                    → reply { width, height, data: Uint8ClampedArray(RGBA) } | null
 *   request 'camera.set'     payload { prop, value }       → reply boolean(바뀌었는지)
 *   request 'camera.release' payload {}                    → reply true
 *   event   'window.show'    payload { name, width, height, data: Uint8Array(RGBA) }   cv2.imshow
 *   event   'window.open'    payload { name }              cv2.namedWindow
 *   event   'window.close'   payload { name: string | null } cv2.destroyWindow(이름)·destroyAllWindows(null)
 *   push    'cv2.keys'       값 int(키 코드)               화면 → cv2.waitKey
 *   push    'cv2.window'     값 { name, closed: true }     화면에서 창(탭)을 닫음 → cv2.getWindowProperty
 *   set     'camera.info'    값 { width, height, source }  제한 모드의 VideoCapture가 읽는다
 *   set     'camera.frame'   값 { width, height, data }    제한 모드의 cap.read()가 읽는다(실행 직전에 한 장)
 */

/**
 * 실행기 상태.
 * - unloaded: 아직 load()를 부르지 않음(또는 dispose() 뒤)
 * - loading: 워커를 띄우고 Pyodide·패키지를 받는 중(정지 2단계로 다시 띄우는 동안도 이 상태)
 * - idle: 준비됨, 실행할 수 있음
 * - running: 학생 코드가 도는 중
 * - stopping: [정지]를 눌러 멈추는 중
 * - failed: Pyodide를 받지 못했거나 워커가 죽음(load()를 다시 부르면 다시 시도)
 */
export type RuntimeState = 'unloaded' | 'loading' | 'idle' | 'running' | 'stopping' | 'failed';

/**
 * 실행 결과.
 * - ok: 끝까지 실행(exit()·sys.exit()로 끝난 것도 포함, exitCode 참고)
 * - error: 파이썬 예외로 끝남(error 참고)
 * - stopped: [정지]로 멈춤(정지 1단계, KeyboardInterrupt)
 * - killed: 정지 2단계 — 멈추지 않아 워커를 끝내고 다시 띄움
 */
export type RunOutcome = 'ok' | 'error' | 'stopped' | 'killed';

export type NoticeLevel = 'info' | 'warn' | 'error';

/** 파이썬 예외 정보(트레이스백 원문은 P2-06 한국어 오류 사전이 읽는다) */
export interface PythonErrorInfo {
  /** 예외 종류 이름. 예: NameError, KeyboardInterrupt. 패키지를 받지 못했을 때는 PackageLoadError */
  readonly type: string;
  /** 마지막 줄(예: "NameError: name 'x' is not defined") */
  readonly message: string;
  /** 트레이스백 전체 */
  readonly traceback: string;
}

/** 워커가 준비되면 알려 주는 정보 */
export interface RuntimeInfo {
  readonly pyodideVersion: string;
  readonly pythonVersion: string;
  /** 워커 안에서 pyodide.ffi.can_run_sync()가 참인지(JSPI가 있어 기다리기가 되는지) */
  readonly jspi: boolean;
  /** 제한 모드(JSPI가 없거나 시험용으로 강제함): 기다리는 코드(input·카메라)는 실행할 수 없다(PLAN §4.5) */
  readonly limited: boolean;
  /** Pyodide를 받은 위치(indexURL) */
  readonly indexUrl: string;
  /** 인터럽트 버퍼(SharedArrayBuffer)를 쓸 수 있는지. 교차 출처 격리(COOP·COEP)가 있는 곳(오프라인판)에서만 참 */
  readonly interruptBuffer: boolean;
}

// ── 화면 → 워커 ──

export interface LoadMessage {
  readonly type: 'load';
  /** 차례로 시도할 Pyodide 위치(config.ts의 pyodideIndexUrls) */
  readonly indexUrls: readonly string[];
  /** 준비되자마자 불러올 패키지(정지 2단계 뒤 다시 띄울 때 전에 쓰던 패키지) */
  readonly packages: readonly string[];
  /** 시험용: JSPI가 있어도 제한 모드처럼 동작 */
  readonly forceLimited: boolean;
}

export interface RunMessage {
  readonly type: 'run';
  readonly runId: number;
  readonly code: string;
  readonly filename: string;
  /** import 문 분석과 별도로 먼저 불러올 패키지 이름(Pyodide 배포 패키지 이름, 예: opencv-python) */
  readonly packages: readonly string[];
}

export interface StopMessage {
  readonly type: 'stop';
}

/** 대기 지점(request)에 대한 화면의 답 */
export interface ReplyMessage {
  readonly type: 'reply';
  readonly requestId: number;
  readonly ok: boolean;
  readonly value?: unknown;
  /** ok가 false일 때 파이썬 쪽에 예외로 전해질 한국어 설명 */
  readonly error?: string;
}

/** 최신 값(슬라이더 등). 파이썬은 apc_runtime.get(name)으로 읽는다. */
export interface SetValueMessage {
  readonly type: 'set';
  readonly name: string;
  readonly value: unknown;
}

/** 쌓이는 값(키 입력 등). 파이썬은 apc_runtime.poll(channel)로 한꺼번에 꺼낸다. */
export interface PushEventMessage {
  readonly type: 'push';
  readonly channel: string;
  readonly value: unknown;
}

/** Pyodide 가상 파일시스템에 파일 쓰기(예제 자산·업로드 이미지) */
export interface WriteFileMessage {
  readonly type: 'write-file';
  readonly taskId: number;
  /** 절대 경로(예: /home/pyodide/mask.png). 폴더가 없으면 만든다. */
  readonly path: string;
  readonly data: string | Uint8Array;
}

export interface LoadPackagesMessage {
  readonly type: 'load-packages';
  readonly taskId: number;
  readonly names: readonly string[];
}

export type ToWorkerMessage =
  | LoadMessage
  | RunMessage
  | StopMessage
  | ReplyMessage
  | SetValueMessage
  | PushEventMessage
  | WriteFileMessage
  | LoadPackagesMessage;

// ── 워커 → 화면 ──

export interface ProgressMessage {
  readonly type: 'progress';
  /** core = 파이썬 엔진, package = 패키지 */
  readonly stage: 'core' | 'package';
  /** 사람이 읽는 한국어 안내 */
  readonly message: string;
  /** 패키지 단계일 때: 받기 시작(start)·끝(done)과 패키지 이름(pyodide-lock.json 기준). 화면의 단계별 진행 표시가 쓴다(P2-03). */
  readonly phase?: 'start' | 'done';
  readonly names?: readonly string[];
}

export interface ReadyMessage {
  readonly type: 'ready';
  readonly info: RuntimeInfo;
  /** SharedArrayBuffer 위의 인터럽트 버퍼(격리된 곳에서만). 화면이 2(SIGINT)를 써 넣으면 계산 반복문도 멈춘다. */
  readonly interruptBuffer?: Uint8Array;
}

export interface LoadFailedMessage {
  readonly type: 'load-failed';
  /** 한국어 안내 */
  readonly message: string;
  /** 위치마다 실패한 까닭 */
  readonly details: readonly string[];
}

export interface OutputMessage {
  readonly type: 'stdout' | 'stderr';
  readonly text: string;
}

export interface NoticeMessage {
  readonly type: 'notice';
  readonly level: NoticeLevel;
  readonly text: string;
}

/** 파이썬이 대기 지점에서 화면에 무언가를 부탁함(input 줄, 카메라 프레임 등). 화면은 ReplyMessage로 답한다. */
export interface RequestMessage {
  readonly type: 'request';
  readonly requestId: number;
  /** 요청 종류. 'input'(payload: { prompt: string })은 실습실 틀이, 'camera.*'는 영상처리 실습실이 처리한다(머리말 목록). */
  readonly kind: string;
  readonly payload: unknown;
}

/**
 * 파이썬이 답을 기다리지 않고 화면에 알리는 것(cv2.imshow의 영상 등). 제한 모드(JSPI 없음)에서도 보낼 수 있다.
 * 큰 payload(영상 바이트)는 워커가 transfer 목록으로 옮긴다.
 */
export interface EventMessage {
  readonly type: 'event';
  readonly kind: string;
  readonly payload: unknown;
}

export interface DoneMessage {
  readonly type: 'done';
  readonly runId: number;
  readonly outcome: Exclude<RunOutcome, 'killed'>;
  readonly error?: PythonErrorInfo;
  /** SystemExit로 끝났을 때의 종료 코드(exit()·sys.exit()는 null) */
  readonly exitCode?: number | null;
  /** 지금까지 불러온 Pyodide 패키지 이름(정지 2단계 뒤 다시 불러오려고 기억한다) */
  readonly loadedPackages: readonly string[];
}

export interface TaskResultMessage {
  readonly type: 'task-result';
  readonly taskId: number;
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: string;
}

export type FromWorkerMessage =
  | ProgressMessage
  | ReadyMessage
  | LoadFailedMessage
  | OutputMessage
  | NoticeMessage
  | RequestMessage
  | EventMessage
  | DoneMessage
  | TaskResultMessage;
