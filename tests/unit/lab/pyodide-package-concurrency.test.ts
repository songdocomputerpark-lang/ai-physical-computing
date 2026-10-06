// 패키지를 받는 동안의 실행(판 1.2.0, PROGRESS 미해결 219)을 Node.js의 실제 Pyodide 314.0.7로 확인한다.
// 영상처리 실습실은 준비 직후 numpy·OpenCV(약 13MB)를 미리 받는다. 판 1.1.5까지 워커는 받을 패키지가 없는 코드(시리얼만 쓰는 3-1-2 컴퓨터 쪽 등)도
// 그 받기가 끝날 때까지 시작하지 않았다(느린 학교망 첫 방문에 몇 분). 막혀 있던 까닭 둘을 먼저 재현하고(control), 판 1.2.0 방식이
// 그 둘을 건드리지 않는지 본다(main) — 도우미 tests/unit/lab/helpers/pyodide-package-concurrency-run.mjs(워커와 같은 package-loads.ts·bridge.ts·
// 파이썬 도우미·영상처리 실습실 흉내 모듈 폴더를 쓴다).
//   ① 받기는 한 줄(C39 ④): 겹친 loadPackage는 "Loading …"을 학생 콘솔로 흘린다 — 받을 것이 없는 실행은 loadPackage를 부르지 않아야 한다.
//   ② 흉내 설치가 반쯤 받은 패키지를 건드림: 휠은 풀렸고 .so는 아직인 numpy를 import하면 ImportError가 나고, apc_mediapipe는 그때 np=None을 굳힌다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'tests', 'unit', 'lab', 'helpers', 'pyodide-package-concurrency-run.mjs');

const nodeJspi = spawnSync(process.execPath, ['--experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
  encoding: 'utf8',
  timeout: 20_000,
});
const nodeHasJspi = nodeJspi.status === 0 && nodeJspi.stdout === 'function';
const pyodideInstalled = fs.existsSync(path.join(ROOT, 'node_modules', 'pyodide', 'pyodide.mjs'));

interface Posted {
  at: number;
  type: string;
  runId?: number;
  waiting?: boolean;
  phase?: 'start' | 'import';
  names?: string[];
  message?: string;
  text?: string;
}

interface StepRecord {
  runId: number;
  startedAt: number;
  preparedAt?: number;
  doneAt: number;
  ms: number;
  outcome: 'ok' | 'error' | 'stopped';
  value?: unknown;
  errorType?: string;
  errorMessage?: string;
  plan?: { needed: string[]; busy: boolean; startNow: boolean };
  busyWhenStarted?: boolean;
  busyWhenDone: boolean;
  loadedWhenDone: string[];
  shims?: { installed: string[]; deferred: string[]; failures: string[][] };
  stopAt?: number;
  stopToDoneMs?: number;
  busyAtStop?: boolean;
  stdout: string;
  posted: Posted[];
  progress: string[];
  escaped: string[];
}

interface ControlOutput {
  skipped?: string;
  halfLoaded: { numpyFiles: boolean; numpyLoaded: boolean };
  controlMediapipe: [boolean, boolean];
  controlImportNumpy: string;
  controlAfterPreload: [string, boolean];
  stdout: string;
}

interface MainOutput {
  skipped?: string;
  jspi: boolean;
  labFiles: string[];
  shimTable: Record<string, string>;
  loadingAtStart: { keys: string[]; imports: string[] };
  pushed: string[][];
  steps: Record<string, StepRecord>;
  syncGuard: { numpyFiles: boolean; numpyLoaded: boolean; result: string; inSysModules: boolean };
  beforeHelperNp: { numpyFiles: boolean; numpyLoaded: boolean };
  mediapipeAfterWait: [boolean, boolean | null, boolean | null];
  beforeHelperCv: { cv2Files: boolean; cv2Loaded: boolean };
  afterPreload: { loaded: string[]; busy: boolean; loadingImports: string[] };
  importLoadsDuringStoppedRun: number;
  final: { busy: boolean; loadingImports: string[]; shims: [string[], string[], string[][]]; cv2Patched: string };
  stdout: string;
  progress: string[];
  posted: Posted[];
  events: string[];
  escaped: string[];
  marks: [number, string][];
}

interface LateOutput {
  skipped?: string;
  steps: Record<string, StepRecord>;
  final: { shims: [string[], string[], string[][]] };
  stdout: string;
}

function runHelper<T>(mode: 'control' | 'main' | 'late'): T & { skipped?: string } {
  const result = spawnSync(process.execPath, ['--experimental-wasm-jspi', SCRIPT, ROOT, mode], { encoding: 'utf8', timeout: 280_000, cwd: ROOT });
  expect(result.status, result.stderr).toBe(0);
  const lines = result.stdout.trim().split('\n');
  return JSON.parse(lines[lines.length - 1] ?? '{}') as T & { skipped?: string };
}

describe.skipIf(!pyodideInstalled || !nodeHasJspi)('패키지를 받는 동안의 실행(실제 Pyodide 314.0.7 — 미해결 219)', () => {
  it('대조: 판 1.1.5 방식으로 미리 받기 동안 흉내 모듈을 설치하면 반쯤 받은 numpy를 건드려 apc_mediapipe가 np=None을 굳힌다', () => {
    const out = runHelper<ControlOutput>('control');
    if (out.skipped) {
      console.warn(`[건너뜀] ${out.skipped}`);
      return;
    }
    // numpy 휠은 풀렸지만 아직 다 받지 않은 때(.so를 불러오는 중)
    expect(out.halfLoaded).toEqual({ numpyFiles: true, numpyLoaded: false });
    // 그때 흉내 모듈을 불러오면 맨 위 `try: import numpy except ImportError: np = None`이 None을 굳힌다
    expect(out.controlMediapipe).toEqual([true, false]);
    expect(out.controlImportNumpy).toMatch(/ImportError|module export function|_multiarray_umath/u);
    // 받기가 끝난 뒤 numpy는 되지만 흉내 모듈은 그대로 np=None(세션 끝까지 — 대조가 보여 주는 위험)
    expect(out.controlAfterPreload[0]).toMatch(/^2\./u);
    expect(out.controlAfterPreload[1]).toBe(true);
  }, 300_000);

  it('판 1.2.0: 받을 것이 없는 코드는 곧바로 시작하고, 반쯤 받은 패키지는 흉내 설치가 미루고 import 줄에서 기다리며, "Loading"이 새지 않는다', () => {
    const out = runHelper<MainOutput>('main');
    if (out.skipped) {
      console.warn(`[건너뜀] ${out.skipped}`);
      return;
    }
    expect(out.jspi).toBe(true);
    // 영상처리 실습실 그대로: 붙박이 + 흉내 모듈 폴더(가상 보드 파일은 없다), asyncio 흉내(apc_asyncio)는 붙박이
    expect(out.labFiles).toEqual(expect.arrayContaining(['apc_runtime.py', 'apc_shims.py', 'apc_cv2.py', 'apc_asyncio.py', 'apc_mediapipe.py', 'apc_files.py', 'serial.py']));
    expect(out.labFiles).not.toContain('apc_board.py');
    // 미리 받기가 줄에 서자마자 받는 중(import 이름)을 파이썬 문지기에 알렸다
    expect(out.loadingAtStart.keys).toEqual(['numpy', 'opencv-python']);
    expect(out.pushed[0]).toEqual(['cv2', 'numpy']);

    // 실행마다 그 실행의 package-wait만(다른 실행의 늦은 알림이 섞이면 안 된다 — worker.ts waitForPackageImport)
    for (const step of Object.values(out.steps)) {
      for (const message of step.posted.filter((item) => item.type === 'package-wait')) {
        expect(message.runId).toBe(step.runId);
      }
    }

    // ① 받을 것이 없는 코드: 곧바로 시작(startNow), 미리 받기가 도는 중에 끝남, 흉내는 미룸(실패 아님), numpy·cv2를 건드리지 않음
    const first = out.steps.no_packages_starts_now;
    expect(first.outcome).toBe('ok');
    expect(first.plan).toEqual({ needed: [], busy: true, startNow: true });
    expect(first.busyWhenDone).toBe(true);
    expect(first.loadedWhenDone).not.toContain('opencv-python');
    expect(first.shims?.deferred).toEqual(expect.arrayContaining(['cv2', 'mediapipe']));
    expect(first.shims?.failures).toEqual([]);
    expect(first.shims?.installed).toEqual(expect.arrayContaining(['asyncio', 'builtins']));
    expect(first.stdout).toBe('시작\n끝 False False\n');
    expect(first.posted.filter((message) => message.type === 'package-wait')).toEqual([]);

    // ② 기다릴 수 없는 자리(동기 runPython)에서 반쯤 받은 numpy import → PackageStillLoading, sys.modules에 남지 않음
    expect(out.syncGuard.numpyFiles).toBe(true);
    expect(out.syncGuard.result).toMatch(/^PackageStillLoading: .*PackageStillLoading: 'numpy' 패키지를 아직 받는 중이에요/u);
    expect(out.syncGuard.inSysModules).toBe(false);

    // ③ 내 모듈이 사이트 흉내(mediapipe → apc_mediapipe)를 거쳐 반쯤 받은 numpy를 import: 곧바로 시작한 뒤 import 줄에서 numpy를 다 받을 때까지
    //    기다리고(package-wait import) 이어서 끝까지 돈다
    expect(out.beforeHelperNp.numpyLoaded).toBe(false);
    const helperNp = out.steps.helper_numpy_waits;
    expect(helperNp.outcome).toBe('ok');
    expect(helperNp.plan?.startNow).toBe(true);
    expect(helperNp.value).toBe(6);
    expect(helperNp.stdout).toBe('합 6 0.10.35-apc\n');
    const npWaits = helperNp.posted.filter((message) => message.type === 'package-wait');
    expect(npWaits.map((message) => [message.phase, message.waiting])).toEqual([
      ['import', true],
      ['import', false],
    ]);
    expect(out.marks.some(([, text]) => /^guard-released numpy loaded=.*numpy/u.test(text))).toBe(true);
    // 기다린 자리가 apc_mediapipe 자신의 import 도중이었어도 흉내 설치 실패 알림이 없다(판 1.2.0 통합 — 덜 만들어진 모듈의 install()을
    // 부르지 않고 맨 바깥 import가 끝난 뒤 설치, apc_shims._initializing·apc_runtime._retry_deferred)
    expect(helperNp.posted.filter((message) => message.type === 'notice' && /흉내 모듈/u.test(message.text ?? ''))).toEqual([]);
    // 미뤄 둔 mediapipe 흉내는 numpy를 다 받은 뒤 설치되어 np가 None이 아니고(대조와 반대) install()이 불렸다
    expect(out.mediapipeAfterWait).toEqual([true, true, true]);

    // ④ cv2를 받는 중에 내 모듈의 import cv2에서 기다리는 동안 [정지] → 곧바로 KeyboardInterrupt('stopped'), 다시 시작 없음
    expect(out.beforeHelperCv).toEqual({ cv2Files: true, cv2Loaded: false });
    const cvStop = out.steps.helper_cv2_stop_while_waiting;
    expect(cvStop.outcome).toBe('stopped');
    expect(cvStop.busyAtStop).toBe(true);
    expect(cvStop.stopToDoneMs).toBeLessThan(1000);

    // ⑤ cv2를 직접 쓰는 코드는 예전처럼 줄을 서서 기다리고(package-wait start + 상태 줄 글), 다 받은 뒤 cv2 흉내가 설치되어 imshow가 화면으로 간다
    const cvLine = out.steps.cv2_code_waits_in_line;
    expect(cvLine.outcome).toBe('ok');
    expect(cvLine.plan).toEqual({ needed: ['opencv-python'], busy: true, startNow: false });
    expect(cvLine.posted.filter((message) => message.type === 'package-wait').map((message) => [message.phase, message.waiting])).toEqual([
      ['start', true],
      ['start', false],
    ]);
    expect(cvLine.posted.some((message) => message.type === 'progress' && /다 받으면 코드가 저절로 시작해요/u.test(message.message ?? ''))).toBe(true);
    expect(cvLine.stdout).toMatch(/^cv2 4\.11\.0 apc_cv2\n$/u);
    expect(out.events).toContain('window.show');
    expect(out.afterPreload).toEqual({ loaded: ['numpy', 'opencv-python'], busy: false, loadingImports: [] });

    // ⑥ 다 받은 뒤에는 내 모듈의 cv2도 기다림 없이(package-wait 없음) 되고 흉내가 설치돼 있다
    const cvAfter = out.steps.helper_cv2_after_preload;
    expect(cvAfter.outcome).toBe('ok');
    expect(cvAfter.stdout).toBe('4.11.0 apc_cv2\n');
    expect(cvAfter.posted.filter((message) => message.type === 'package-wait')).toEqual([]);

    // ⑦ 줄을 서서 기다리는 동안 [정지] → 곧바로 'stopped'(예전엔 1초 뒤 워커를 다시 띄움), 차례가 와도 그 실행의 받기는 하지 않는다
    const pilStop = out.steps.pil_code_stop_in_line;
    expect(pilStop.outcome).toBe('stopped');
    expect(pilStop.plan?.needed).toEqual(['pillow']);
    expect(pilStop.stopToDoneMs).toBeLessThan(1000);
    expect(out.importLoadsDuringStoppedRun).toBe(0);
    const pilAfter = out.steps.pil_after_preload;
    expect(pilAfter.outcome).toBe('ok');
    expect(pilAfter.stdout).toBe('(3, 2) (2, 2)\n');

    // ⑧ 끝: 받는 중 없음, 흉내 실패·미룸 없음, cv2 흉내 그대로, 학생 stdout에 Pyodide 영어 알림 없음(알림은 모두 알림 함수로)
    expect(out.final.busy).toBe(false);
    expect(out.final.loadingImports).toEqual([]);
    expect(out.final.shims[1]).toEqual([]);
    expect(out.final.shims[2]).toEqual([]);
    expect(out.final.cv2Patched).toBe('apc_cv2');
    expect(out.stdout).not.toMatch(/Loading|Loaded|No new packages|already loaded/u);
    expect(out.progress.join('\n')).toMatch(/^load:Loading numpy, opencv-python$/mu);
    // 새어 나온 오류는 [정지]의 KeyboardInterrupt뿐(워커는 error·unhandledrejection에서 삼킨다)
    expect(out.escaped.every((entry) => entry.endsWith('KeyboardInterrupt'))).toBe(true);
  }, 300_000);

  it('판 1.2.1(검토 C5·C4): 예제가 적은 패키지는 미리 받기 중이면 시작을 막지 않고, 실행 도중 받기가 끝난 뒤 내 모듈이 닿은 cv2에도 흉내가 설치된다', () => {
    const out = runHelper<LateOutput>('late');
    if (out.skipped) {
      console.warn(`[건너뜀] ${out.skipped}`);
      return;
    }
    // C5: 예제 packages(opencv-python)를 함께 보내도, 편집칸 코드가 그것을 import하지 않고 미리 받기가 받는 중이면 곧바로 시작한다
    const examplePackages = out.steps.example_packages_start_now;
    expect(examplePackages.outcome).toBe('ok');
    expect(examplePackages.plan).toEqual({ needed: ['numpy', 'opencv-python'], busy: true, startNow: true });
    expect(examplePackages.stdout).toBe('예제와 다른 코드\n끝\n');
    // C4: 실행을 시작할 때는 cv2·mediapipe 흉내가 미뤄졌지만, 받기가 끝난 뒤 내 모듈의 `import cv2`가 끝나는 자리에서 cv2 흉내가 설치된다
    const late = out.steps.late_cv2_via_helper;
    expect(late.outcome, late.errorMessage).toBe('ok');
    expect(late.plan?.startNow).toBe(true);
    expect(late.shims?.deferred).toEqual(['cv2', 'mediapipe']);
    expect(late.stdout).toBe('시작\ncv2 imshow from apc_cv2\n');
    expect(late.posted.filter((message) => message.type === 'notice')).toEqual([]);
    expect(out.steps.next_run_cv2.stdout).toBe('next imshow from apc_cv2\n');
    expect(out.final.shims[1]).toEqual([]);
    expect(out.final.shims[2]).toEqual([]);
    expect(out.stdout).not.toMatch(/Loading|Loaded|No new packages|already loaded/u);
  }, 300_000);
});
