/**
 * 파이썬 워커(PLAN §4.4 PD-01, §5.2 PD-02, §8.2 P2-01) — 모듈 워커 안에서 Pyodide 314.0.7을 띄우고 학생 코드를 실행한다.
 *
 * 화면 쪽(client.ts의 PythonRuntime)이 new Worker(…, { type: 'module' })로 띄우고 protocol.ts의 메시지로 말을 건다.
 *
 * 하는 일
 * 1. load: config.ts가 정한 위치(jsDelivr 고정 주소, 나중에 같은 사이트 예비본)에서 차례로 pyodide.mjs를 import(주소)해
 *    loadPyodide({ indexURL })로 띄운다(Pyodide 공식 워커 안내와 같은 방법 — 모듈 워커 필수).
 *    stdout·stderr를 화면으로 흘려보내고(write 처리기, 줄 단위 버퍼), JS 다리(bridge.ts)를 `_apc_bridge`로 등록하고,
 *    파이썬 쪽 모듈(src/lab/python/*.py — 도우미 apc_runtime.py와 흉내 모듈)을 가상 파일시스템 /apc에 넣어 time.sleep·input()을 바꾼다.
 *    JSPI 감지는 runPythonAsync 안에서 pyodide.ffi.can_run_sync()를 불러 한다(run_sync는 runPythonAsync로 들어온 호출에서만 된다).
 * 2. run: import 문을 분석해 필요한 Pyodide 패키지를 받고(loadPackagesFromImports, 패키지 이름은 pyodide-lock.json 기준),
 *    받아 둔 패키지의 흉내 모듈을 설치한 뒤(apc_shims.install_available — cv2의 카메라·창 함수 덮어쓰기, P2-03),
 *    새 전역(__name__ == '__main__')을 조절 패널 값의 목적지로 도우미에 알리고(apc_runtime.bind_run_globals, P2-04)
 *    runPythonAsync 한다(JSPI 기다리기는 이 경로에서만 된다). 끝나면 done 메시지.
 *    큰 값(cv2.imshow 영상)은 event 메시지의 transfer 목록으로 복사 없이 화면에 보낸다.
 *    학생 코드가 오류 없이 끝나면 apc_runtime.run_idle()을 한 번 더 기다린다 — 가상 보드의 Timer·핀 인터럽트처럼 실물에서는
 *    코드가 끝나도 계속 도는 것이 있으면 [정지]까지 이어 간다(P3-01, PLAN §4.4 "스크립트가 끝난 뒤의 대기"). 대기 훅이 없는 실습실은 곧바로 끝난다.
 *    load 메시지에 labId가 있으면 그 실습실에 붙는 흉내 모듈 폴더의 파이썬 파일·shims만 넣는다(python/modules.ts pythonModulesForLab).
 * 3. stop(정지 1단계): 다리에 정지 표시를 켜 기다리던 곳(sleep·input·request)을 깨우면 파이썬 쪽에서 KeyboardInterrupt가 난다.
 *    양보 없는 계산 반복문은 이 메시지를 받지 못하므로 화면이 1초 뒤 워커를 끝내고 다시 띄운다(정지 2단계, client.ts).
 *    인터럽트 버퍼(pyodide.setInterruptBuffer)는 SharedArrayBuffer가 필요하고 GitHub Pages는 교차 출처 격리 헤더(COOP·COEP)를
 *    줄 수 없어 못 쓴다(PLAN §4.2·§4.3, 2026-09-16 Pyodide 공식 문서로 다시 확인). 격리된 곳에서만 덤으로 켠다 — 그 경우 화면이
 *    버퍼에 2(SIGINT)를 써서 계산 반복문도 멈춘다(격리 환경이 없어 미검증). 오프라인판의 작은 서버(scripts/offline/serve.ps1·serve.py)도
 *    격리 머리말(COOP·COEP)을 보내지 않는다 — 온라인과 같은 동작을 지키려고(2026-09-26 P6-07 결정).
 *
 * 워커 전역 타입(lib webworker)을 프로젝트 전체에 넣으면 DOM 타입과 부딪히므로, 여기서 쓰는 몇 가지만 좁게 적었다.
 */
import type { PyodideAPI } from 'pyodide';
import type { PyProxy } from 'pyodide/ffi';
import { RUNTIME_MODULE_FILE, pythonModulesForLab, shimTableForLab } from '../python/modules.ts';
import { createBridge, type Bridge } from './bridge.ts';
import type {
  DoneMessage,
  FromWorkerMessage,
  LoadMessage,
  LoadPackagesMessage,
  PythonErrorInfo,
  RunMessage,
  RuntimeInfo,
  ToWorkerMessage,
  WriteFileMessage,
} from './protocol.ts';

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: (event: { readonly error?: unknown; preventDefault(): void }) => void): void;
  addEventListener(type: 'unhandledrejection', listener: (event: { readonly reason?: unknown; preventDefault(): void }) => void): void;
  readonly crossOriginIsolated?: boolean;
}

/** pyodide.mjs가 내보내는 것 가운데 쓰는 것 */
interface PyodideModule {
  loadPyodide(options?: { indexURL?: string }): Promise<PyodideAPI>;
}

/** 파이썬 쪽 모듈을 두는 가상 파일시스템 폴더. sys.path 맨 앞에 넣어 학생 파일이 가리지 못하게 한다(CODE_MAPPING §3.3). */
const HELPER_DIR = '/apc';

/**
 * 학생 코드가 끝난 뒤 흉내 모듈의 "계속 돌 일"을 이어 가는 코드(apc_runtime.run_idle, P3-01). 식 하나라 학생 전역에 이름을 남기지 않는다.
 * 파일 이름은 트레이스백에서 학생 코드(main.py)와 구별되게 따로 둔다.
 */
const IDLE_CODE = '__import__("apc_runtime").run_idle()';
const IDLE_FILENAME = '<board-idle>';

const scope = self as unknown as WorkerScope;

function post(message: FromWorkerMessage, transfer?: readonly ArrayBuffer[]): void {
  if (transfer && transfer.length > 0) {
    scope.postMessage(message, [...transfer]);
  } else {
    scope.postMessage(message);
  }
}

let pyodide: PyodideAPI | null = null;
let loadedFrom = '';
let jspiAvailable = false;
let activeRunId: number | null = null;
/** 화면이 보낸 미리 받기(load-packages)가 아직 도는 수 — 실행이 그사이에 시작되면 흉내 모듈 설치 실패를 알리지 않는다(installShims) */
let packageLoadsInFlight = 0;
let interruptBuffer: Uint8Array | null = null;
const stdoutDecoder = new TextDecoder();
const stderrDecoder = new TextDecoder();

const bridge: Bridge = createBridge({
  post,
  now: () => performance.now(),
  canRunSync: () => jspiAvailable,
});

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.split('\n')[0] || error.name;
  }
  return String(error);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** Pyodide의 PythonError(파이썬 예외)인지 */
function isPythonError(error: unknown): error is Error & { type: string } {
  return error instanceof Error && typeof (error as { type?: unknown }).type === 'string';
}

/**
 * runPythonAsync 약속의 거부와 별개로 워커 밖으로 한 번 더 새는 파이썬 예외인지.
 * 학생 코드가 SystemExit(exit()·sys.exit())나 KeyboardInterrupt로 끝나면, Pyodide가 코드를 돌리는 asyncio 작업이 그 예외를
 * 결과에 적고도 다시 던진다(asyncio Task의 규칙 — 두 예외는 Exception이 아닌 BaseException이라서). 그래서 약속이 거부되어
 * done 메시지로 알리는 것과 별개로, 워커의 처리되지 않은 오류(error·unhandledrejection 이벤트)로도 올라온다
 * (2026-09-16 Node의 실제 Pyodide로 확인, tests/unit/lab/helpers/pyodide-node-run.mjs가 같은 처리를 한다).
 * 이미 알린 예외이므로 여기서 삼켜 화면의 Worker error 이벤트·콘솔 오류로 가지 않게 한다. 다른 오류는 그대로 올라간다.
 */
function isRethrownRunError(error: unknown): boolean {
  return isPythonError(error) && (error.type === 'SystemExit' || error.type === 'KeyboardInterrupt');
}

function pythonErrorInfo(error: Error & { type: string }): PythonErrorInfo {
  const traceback = error.message.replace(/\s+$/u, '');
  const lines = traceback.split('\n');
  const message = lines[lines.length - 1] ?? `${error.type}`;
  return { type: error.type, message, traceback };
}

/** "SystemExit: 3" → 3, "SystemExit: None"·"SystemExit" → null */
function exitCodeOf(info: PythonErrorInfo): number | null {
  const match = /^SystemExit:\s*(-?\d+)\s*$/u.exec(info.message);
  return match ? Number(match[1]) : null;
}

/** 스트림 처리기가 받은 바이트를 글자로 바꿔 화면에 보낸다(UTF-8이 조각나도 잇는다). */
function makeWriter(kind: 'stdout' | 'stderr', decoder: TextDecoder) {
  return {
    write(buffer: Uint8Array): number {
      const text = decoder.decode(buffer, { stream: true });
      if (text !== '') {
        post({ type: kind, text });
      }
      return buffer.length;
    },
  };
}

function flushStreams(): void {
  if (!pyodide) {
    return;
  }
  try {
    pyodide.runPython('import sys\nsys.stdout.flush()\nsys.stderr.flush()');
  } catch {
    // 파이썬 쪽 버퍼를 비우지 못해도 아래에서 남은 바이트는 보낸다.
  }
  const stdoutRest = stdoutDecoder.decode();
  if (stdoutRest !== '') {
    post({ type: 'stdout', text: stdoutRest });
  }
  const stderrRest = stderrDecoder.decode();
  if (stderrRest !== '') {
    post({ type: 'stderr', text: stderrRest });
  }
}

function loadedPackageNames(): string[] {
  return pyodide ? Object.keys(pyodide.loadedPackages).sort() : [];
}

/**
 * Pyodide의 패키지 진행 알림("Loading numpy, opencv-python" / "Loaded numpy, opencv-python" — 314.0.7 실측)을
 * 한국어 안내와 구조(시작·끝, 패키지 이름)로 바꿔 화면에 보낸다. 다른 모양의 알림은 글자만 전한다.
 */
export function packageProgress(message: string): { message: string; phase?: 'start' | 'done'; names?: string[] } {
  if (/^No new packages to load/iu.test(message)) {
    // 이미 받아 둔 패키지만 쓰는 실행(Pyodide 314.0.7 실측 문구). 화면에는 한국어로 짧게.
    return { message: '패키지가 이미 준비돼 있어요.' };
  }
  const match = /^(Loading|Loaded)\s+(.+?)\s*$/u.exec(message);
  if (!match) {
    return { message };
  }
  const names = match[2]
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  const list = names.join(', ');
  return match[1] === 'Loading'
    ? { message: `패키지를 받는 중… (${list})`, phase: 'start', names }
    : { message: `패키지 준비 끝 (${list})`, phase: 'done', names };
}

function packageCallbacks() {
  return {
    messageCallback: (message: string) => post({ type: 'progress', stage: 'package' as const, ...packageProgress(message) }),
    errorCallback: (message: string) => post({ type: 'notice', level: 'warn' as const, text: `패키지 준비 중 알림: ${message}` }),
  };
}

/**
 * 조절 패널 값(P2-04)을 넣을 전역 사전 — 학생 코드의 globals() — 을 파이썬 도우미에 알린다.
 * 학생 이름 공간(globals)에서 식 하나만 돌려 다른 이름(import한 모듈 등)이 남지 않게 한다. 실패해도 실행은 계속한다(조절 값만 안 들어간다).
 */
function bindParamGlobals(globals: PyProxy): void {
  if (!pyodide) {
    return;
  }
  try {
    pyodide.runPython('__import__("apc_runtime").bind_run_globals(globals())', { globals });
  } catch (error) {
    post({ type: 'notice', level: 'warn', text: `조절 패널 값을 코드에 잇지 못했어요: ${describeError(error)}` });
  }
}

function unbindParamGlobals(): void {
  try {
    pyodide?.runPython('import apc_runtime\napc_runtime.unbind_run_globals()');
  } catch {
    // 실행이 끝난 뒤라 넘어간다(다음 실행의 reset_for_run이 다시 비운다).
  }
}

/**
 * 파이썬 예외의 마지막 줄("ImportError: …")만 돌려준다. describeError는 첫 줄이라 PythonError면 "Traceback (most recent call last):"만
 * 남아 학생에게 영어 조각만 보였다(2026-09-25 Phase 5 검토 — 중요 4).
 */
export function lastErrorLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return lines[lines.length - 1] ?? (error instanceof Error ? error.name : String(error));
}

/**
 * 받아 둔 패키지의 흉내 모듈을 설치한다(apc_shims.py). 실패해도 실행은 계속하고, 필요할 때만 콘솔에 한국어 한 줄로 알린다.
 * 미리 받기(loadPackages)가 도는 중이면 알리지 않는다 — 그 패키지를 쓰는 코드는 loadPackagesFromImports가 받기가 끝나기를
 * 기다린 뒤에 여기 오므로 실패하지 않고, 쓰지 않는 코드에는 필요 없는 모듈이다. 받기가 끝난 다음 실행에서 설치된다.
 */
function installShims(): void {
  if (!pyodide) {
    return;
  }
  let failures: string[][] = [];
  try {
    const result = pyodide.runPython('import apc_shims\napc_shims.install_available()\napc_shims.last_failures()') as PyProxy | undefined;
    failures = (result?.toJs() as string[][] | undefined) ?? [];
    result?.destroy();
  } catch (error) {
    post({ type: 'notice', level: 'warn', text: `사이트 흉내 모듈을 준비하지 못했어요(${lastErrorLine(error)}). 실행은 이어서 해요.` });
    return;
  }
  if (failures.length === 0 || packageLoadsInFlight > 0) {
    return;
  }
  const names = failures.map(([name]) => name).join(', ');
  const reasons = failures.map(([, reason]) => reason).join(' / ');
  post({ type: 'notice', level: 'warn', text: `사이트 흉내 모듈(${names})을 준비하지 못했어요(${reasons}). 실행은 이어서 해요.` });
}

function runtimeInfo(): RuntimeInfo {
  return {
    pyodideVersion: pyodide?.version ?? '',
    pythonVersion: pyodide ? String(pyodide.runPython('import sys\nsys.version.split()[0]')) : '',
    jspi: jspiAvailable,
    limited: bridge.isLimited(),
    indexUrl: loadedFrom,
    interruptBuffer: interruptBuffer !== null,
  };
}

async function load(message: LoadMessage): Promise<void> {
  if (pyodide) {
    post({ type: 'ready', info: runtimeInfo(), ...(interruptBuffer ? { interruptBuffer } : {}) });
    return;
  }
  const details: string[] = [];
  for (const indexUrl of message.indexUrls) {
    post({ type: 'progress', stage: 'core', message: `파이썬 엔진(Pyodide)을 받는 중… (${hostOf(indexUrl)})` });
    try {
      const module = (await import(/* @vite-ignore */ `${indexUrl}pyodide.mjs`)) as PyodideModule;
      pyodide = await module.loadPyodide({ indexURL: indexUrl });
      loadedFrom = indexUrl;
      break;
    } catch (error) {
      details.push(`${indexUrl}: ${describeError(error)}`);
    }
  }
  if (!pyodide) {
    post({
      type: 'load-failed',
      message:
        '파이썬 엔진(Pyodide)을 받지 못했어요. 인터넷 연결과 학교 네트워크 설정을 확인한 뒤 새로고침해 주세요. ' +
        '계속 같으면 시작하기의 점검 페이지 결과를 문제 알리기에 남겨 주세요.',
      details,
    });
    return;
  }

  pyodide.setStdout(makeWriter('stdout', stdoutDecoder));
  pyodide.setStderr(makeWriter('stderr', stderrDecoder));
  pyodide.registerJsModule('_apc_bridge', bridge.api);
  pyodide.FS.mkdirTree(HELPER_DIR);
  // 이 실습실(labId)에 붙는 흉내 모듈의 파일만 넣는다(없으면 모두). 가상 보드의 machine.py가 영상처리 실습실에 새지 않게(P3-01).
  const pythonModules = pythonModulesForLab(message.labId);
  const shimTable = shimTableForLab(message.labId);
  if (!(RUNTIME_MODULE_FILE in pythonModules)) {
    throw new Error(`파이썬 도우미 ${RUNTIME_MODULE_FILE}이(가) 묶음에 없어요(src/lab/python/).`);
  }
  for (const [fileName, source] of Object.entries(pythonModules)) {
    pyodide.FS.writeFile(`${HELPER_DIR}/${fileName}`, source);
  }

  // JSPI(기다리기) 감지: run_sync는 runPythonAsync로 들어온 호출에서만 되므로 그 안에서 can_run_sync()를 부른다.
  const canRunSync = (await pyodide.runPythonAsync(
    [
      'import sys',
      `sys.path.insert(0, ${JSON.stringify(HELPER_DIR)})`,
      'import apc_runtime',
      'apc_runtime.install()',
      'from pyodide.ffi import can_run_sync',
      'can_run_sync()',
    ].join('\n'),
  )) as unknown;
  jspiAvailable = canRunSync === true;
  bridge.setLimited(message.forceLimited || !jspiAvailable);

  // 흉내 모듈 폴더(src/lab/modules/<id>/manifest.ts)가 선언한 shims를 등록표에 더한다(실행 직전 installShims가 읽는다).
  if (Object.keys(shimTable).length > 0) {
    try {
      pyodide.runPython(`import json, apc_shims\napc_shims.register_shims(json.loads(${JSON.stringify(JSON.stringify(shimTable))}))`);
    } catch (error) {
      post({ type: 'notice', level: 'warn', text: `흉내 모듈 표를 등록하지 못했어요: ${describeError(error)}` });
    }
  }

  // 교차 출처 격리(COOP·COEP)가 있는 곳에서만 인터럽트 버퍼를 덤으로 켠다(GitHub Pages에서는 늘 거짓, 머리말 3).
  if (scope.crossOriginIsolated === true && typeof SharedArrayBuffer === 'function') {
    try {
      interruptBuffer = new Uint8Array(new SharedArrayBuffer(1));
      pyodide.setInterruptBuffer(interruptBuffer);
    } catch {
      interruptBuffer = null;
    }
  }

  if (message.packages.length > 0) {
    try {
      await pyodide.loadPackage([...message.packages], packageCallbacks());
    } catch (error) {
      post({ type: 'notice', level: 'warn', text: `전에 쓰던 패키지를 다시 불러오지 못했어요: ${describeError(error)}` });
    }
  }

  post({ type: 'ready', info: runtimeInfo(), ...(interruptBuffer ? { interruptBuffer } : {}) });
}

async function run(message: RunMessage): Promise<void> {
  const done = (partial: Omit<DoneMessage, 'type' | 'runId' | 'loadedPackages'>) =>
    post({ type: 'done', runId: message.runId, loadedPackages: loadedPackageNames(), ...partial });

  if (!pyodide) {
    done({ outcome: 'error', error: { type: 'RuntimeNotReady', message: '파이썬이 아직 준비되지 않았어요.', traceback: '' } });
    return;
  }
  if (activeRunId !== null) {
    done({ outcome: 'error', error: { type: 'RuntimeBusy', message: '이미 다른 코드가 실행 중이에요.', traceback: '' } });
    return;
  }
  activeRunId = message.runId;
  bridge.beginRun();
  let outcome: DoneMessage['outcome'] = 'ok';
  let error: PythonErrorInfo | undefined;
  let exitCode: number | null | undefined;

  try {
    if (message.packages.length > 0) {
      await pyodide.loadPackage([...message.packages], packageCallbacks());
    }
    await pyodide.loadPackagesFromImports(message.code, packageCallbacks());

    if (bridge.api.stopRequested()) {
      outcome = 'stopped';
    } else {
      installShims();
      pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
      const globals = pyodide.toPy({ __name__: '__main__', __file__: message.filename }) as PyProxy;
      bindParamGlobals(globals);
      try {
        await pyodide.runPythonAsync(message.code, { globals, filename: message.filename, dedent: false });
        // 코드가 끝나도 흉내 모듈이 계속 돌려야 할 일(가상 보드의 Timer·핀 인터럽트)이 있으면 [정지]까지 이어 간다. 없으면 곧바로 끝난다.
        await pyodide.runPythonAsync(IDLE_CODE, { globals, filename: IDLE_FILENAME, dedent: false });
      } catch (caught) {
        if (isPythonError(caught)) {
          const info = pythonErrorInfo(caught);
          if (info.type === 'SystemExit') {
            exitCode = exitCodeOf(info);
          } else if (info.type === 'KeyboardInterrupt' && bridge.api.stopRequested()) {
            outcome = 'stopped';
          } else {
            outcome = 'error';
            error = info;
          }
        } else {
          outcome = 'error';
          error = { type: 'JavaScriptError', message: describeError(caught), traceback: String(caught) };
        }
      } finally {
        unbindParamGlobals();
        globals.destroy();
        flushStreams();
      }
    }
  } catch (caught) {
    outcome = 'error';
    error = {
      type: 'PackageLoadError',
      message: `필요한 파이썬 패키지를 받지 못했어요: ${describeError(caught)}`,
      traceback: '',
    };
  } finally {
    const { stopped } = bridge.endRun();
    if (stopped && outcome === 'ok' && exitCode === undefined) {
      // 코드가 KeyboardInterrupt를 삼키고 끝까지 갔어도 [정지]로 끝난 것으로 알린다.
      outcome = 'stopped';
    }
    activeRunId = null;
    done({ outcome, ...(error ? { error } : {}), ...(exitCode !== undefined ? { exitCode } : {}) });
  }
}

function writeFile(message: WriteFileMessage): void {
  if (!pyodide) {
    post({ type: 'task-result', taskId: message.taskId, ok: false, error: '파이썬이 아직 준비되지 않았어요.' });
    return;
  }
  try {
    const slash = message.path.lastIndexOf('/');
    if (slash > 0) {
      pyodide.FS.mkdirTree(message.path.slice(0, slash));
    }
    pyodide.FS.writeFile(message.path, message.data);
    post({ type: 'task-result', taskId: message.taskId, ok: true, value: message.path });
  } catch (error) {
    post({ type: 'task-result', taskId: message.taskId, ok: false, error: `파일을 넣지 못했어요: ${describeError(error)}` });
  }
}

async function loadPackages(message: LoadPackagesMessage): Promise<void> {
  if (!pyodide) {
    post({ type: 'task-result', taskId: message.taskId, ok: false, error: '파이썬이 아직 준비되지 않았어요.' });
    return;
  }
  if (activeRunId !== null) {
    post({ type: 'task-result', taskId: message.taskId, ok: false, error: '코드가 실행 중일 때는 패키지를 불러올 수 없어요.' });
    return;
  }
  packageLoadsInFlight += 1;
  try {
    await pyodide.loadPackage([...message.names], packageCallbacks());
    post({ type: 'task-result', taskId: message.taskId, ok: true, value: loadedPackageNames() });
  } catch (error) {
    post({ type: 'task-result', taskId: message.taskId, ok: false, error: `패키지를 받지 못했어요: ${describeError(error)}` });
  } finally {
    packageLoadsInFlight -= 1;
  }
}

async function handle(message: ToWorkerMessage): Promise<void> {
  switch (message.type) {
    case 'load':
      await load(message);
      return;
    case 'run':
      await run(message);
      return;
    case 'stop':
      bridge.requestStop();
      return;
    case 'reply':
      if (message.ok) {
        bridge.resolveRequest(message.requestId, message.value);
      } else {
        bridge.rejectRequest(message.requestId, message.error ?? '화면이 요청을 처리하지 못했어요.');
      }
      return;
    case 'set':
      bridge.setValue(message.name, message.value);
      return;
    case 'push':
      bridge.pushEvent(message.channel, message.value);
      return;
    case 'write-file':
      writeFile(message);
      return;
    case 'load-packages':
      await loadPackages(message);
      return;
  }
}

// 메시지마다 따로 처리한다. 실행(run)이 JSPI로 멈춰 있는 동안에도 stop·reply·set이 들어와야 하기 때문이다.
scope.addEventListener('message', (event) => {
  const message = event.data as ToWorkerMessage;
  handle(message).catch((error: unknown) => {
    post({ type: 'notice', level: 'error', text: `워커 안에서 처리하지 못한 오류가 났어요: ${describeError(error)}` });
  });
});

// exit()·KeyboardInterrupt로 끝난 실행이 워커 밖으로 한 번 더 새는 것을 막는다(isRethrownRunError 설명).
scope.addEventListener('error', (event) => {
  if (isRethrownRunError(event.error)) {
    event.preventDefault();
  }
});
scope.addEventListener('unhandledrejection', (event) => {
  if (isRethrownRunError(event.reason)) {
    event.preventDefault();
  }
});
