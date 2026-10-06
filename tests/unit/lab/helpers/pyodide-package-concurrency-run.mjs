// Node.js 실제 Pyodide 314.0.7로 "패키지를 받는 동안의 실행"(판 1.2.0, PROGRESS 미해결 219)을 확인하는 도우미 스크립트.
// tests/unit/lab/pyodide-package-concurrency.test.ts가 `node --experimental-wasm-jspi 이 파일 <저장소 뿌리> <control|main>`으로 띄우고
// 마지막 줄의 JSON 한 줄을 읽는다.
//
// 워커(src/lab/runtime/worker.ts)와 같은 것을 쓴다: 다리(bridge.ts), 받기 줄·실행 계획(package-loads.ts — 워커의 prepareRun 그대로),
// 붙박이 파이썬(src/lab/python/*.py)과 영상처리 실습실에 붙는 흉내 모듈 폴더의 .py·shims(manifest.ts의 labs가 vision 또는 '*' —
// python/modules.ts의 pythonModulesForLab·shimTableForLab과 같은 규칙). 실행 하나는 워커 run()과 같은 차례로 돈다
// (beginRun → prepareRun → install_available → reset_for_run → 전역 잇기 → runPythonAsync → run_idle → 마무리).
//
// 반쯤 받은 때(휠은 풀렸고 .so는 아직 — 그때 import하면 ImportError)를 확실히 잡으려고, Pyodide 코어를 띄운 뒤의 .so 불러오기
// (WebAssembly.instantiate에 바이트를 넘기는 것)를 문으로 막아 둔다: numpy의 .so는 numpyGate, cv2의 큰 .so(5MB 넘음)는 cv2Gate가 열릴 때까지.
// 문은 실제 시간이 아니라 진행으로 연다(DECISIONS C74 ② — 예: 문지기가 기다린다는 package-wait가 오면 numpy 문을 연다, [정지]도 그 알림으로).
// 휠은 .cache/pyodide-packages/(pyodide-cv2 검사와 같은 캐시)에서 읽고, 없으면 jsDelivr에서 받는다. 못 받으면 {"skipped": 이유}.
//
// control: 판 1.1.5까지의 위험을 그대로 재현한다(문지기 없이) — 미리 받기 동안 흉내 설치(apc_mediapipe의 맨 위 `import numpy`)와 numpy import.
// main: 판 1.2.0 방식 — 곧바로 시작·흉내 미루기·import 문지기 기다림·[정지]·줄 서기·"Loading" 새지 않음·받은 뒤 cv2 정상.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { finishJson } from '../../helpers/finish-json.mjs';

const rootDir = process.argv[2] ?? process.cwd();
const mode = process.argv[3] ?? 'main';
const cacheDir = path.join(rootDir, '.cache', 'pyodide-packages');
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);
const { createBridge } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'bridge.ts')).href);
const { createPackageLoads } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'package-loads.ts')).href);

const LAB_ID = 'vision';
const SITE_PACKAGES = '/lib/python3.14/site-packages';
const out = { mode, steps: {}, escaped: [], marks: [] };
const t0 = performance.now();
const now = () => Math.round(performance.now() - t0);
const mark = (text) => out.marks.push([now(), text]);

function isRethrownRunError(error) {
  return Boolean(error) && typeof error.type === 'string' && (error.type === 'SystemExit' || error.type === 'KeyboardInterrupt');
}
process.on('uncaughtException', (error) => {
  if (isRethrownRunError(error)) {
    out.escaped.push(`exception:${error.type}`);
    return;
  }
  console.error(error);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  if (isRethrownRunError(reason)) {
    out.escaped.push(`rejection:${reason.type}`);
    return;
  }
  console.error(reason);
  process.exit(1);
});

const lastLine = (error) => String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(test, label, limitMs = 60_000) {
  const started = performance.now();
  while (!test()) {
    if (performance.now() - started > limitMs) {
      throw new Error(`기다림 시간 초과: ${label}`);
    }
    await sleepMs(2);
  }
}

// ── 영상처리 실습실의 파이썬 파일·shims(manifest의 labs가 vision 또는 '*') ──
const pythonFiles = new Map();
for (const file of fs.readdirSync(path.join(rootDir, 'src', 'lab', 'python'))) {
  if (file.endsWith('.py')) pythonFiles.set(file, path.join(rootDir, 'src', 'lab', 'python', file));
}
const shimTable = {};
const modulesDir = path.join(rootDir, 'src', 'lab', 'modules');
function collectPy(dir, found) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectPy(full, found);
    else if (entry.name.endsWith('.py')) found.push(full);
  }
  return found;
}
for (const folder of fs.readdirSync(modulesDir, { withFileTypes: true })) {
  const manifestPath = path.join(modulesDir, folder.name, 'manifest.ts');
  if (!folder.isDirectory() || !fs.existsSync(manifestPath)) continue;
  const manifest = (await import(pathToFileURL(manifestPath).href)).default;
  if (!(manifest.labs === '*' || (Array.isArray(manifest.labs) && manifest.labs.includes(LAB_ID)))) continue;
  Object.assign(shimTable, manifest.shims ?? {});
  for (const full of collectPy(path.join(modulesDir, folder.name), [])) pythonFiles.set(path.basename(full), full);
}
out.labFiles = [...pythonFiles.keys()].sort();
out.shimTable = shimTable;

// ── Pyodide·다리 ──
fs.mkdirSync(cacheDir, { recursive: true });
const pyodide = await loadPyodide({ packageCacheDir: cacheDir });
// 코어를 띄운 뒤부터 .so 불러오기만 문으로 막는다(머리말)
let releaseNumpy = () => undefined;
let releaseCv2 = () => undefined;
const numpyGate = new Promise((resolve) => {
  releaseNumpy = () => {
    mark('numpy 문 열림');
    resolve();
  };
});
const cv2Gate = new Promise((resolve) => {
  releaseCv2 = () => {
    mark('cv2 문 열림');
    resolve();
  };
});
const instantiate = WebAssembly.instantiate;
WebAssembly.instantiate = async function gatedInstantiate(binary, info) {
  if (!(binary instanceof WebAssembly.Module)) {
    const size = binary.byteLength ?? binary.length ?? 0;
    if (size > 5_000_000) {
      await cv2Gate;
    } else if (!('numpy' in pyodide.loadedPackages)) {
      await numpyGate;
    }
  }
  return instantiate.call(this, binary, info);
};

let stdout = '';
pyodide.setStdout({
  write: (buffer) => {
    stdout += new TextDecoder().decode(buffer);
    return buffer.length;
  },
});
let jspi = false;
let loads = null;
let activeRun = null;
const posted = [];
let messageHook = null;
function post(message) {
  posted.push({ at: now(), ...message });
  messageHook?.(message);
}
const progress = [];
const packageCallbacks = (label) => ({
  messageCallback: (message) => progress.push(`${label}:${message}`),
  errorCallback: (message) => progress.push(`${label}:error:${message}`),
});
const bridge = createBridge({
  post: (message) => {
    if (message.type === 'request') {
      setTimeout(() => bridge.rejectRequest(message.requestId, `화면이 "${message.kind}" 요청을 처리하지 못해요.`), 2);
    }
    post(message);
  },
  now: () => performance.now(),
  canRunSync: () => jspi,
  packagesLoading: () => loads?.loadingImports() ?? [],
  async whenPackagesLoaded(name) {
    // worker.ts waitForPackageImport와 같다: 기다리는 동안 package-wait(phase import)
    const runId = activeRun;
    const names = loads.loadingKeys();
    if (runId !== null) post({ type: 'package-wait', runId, waiting: true, phase: 'import', names });
    try {
      const current = await loads.whenLoaded([name]);
      mark(`guard-released ${name} loaded=${Object.keys(pyodide.loadedPackages).sort().join(',')}`);
      return current;
    } finally {
      if (runId !== null && activeRun === runId) post({ type: 'package-wait', runId, waiting: false, phase: 'import', names });
    }
  },
});
pyodide.registerJsModule('_apc_bridge', bridge.api);
pyodide.FS.mkdirTree('/apc');
for (const [file, full] of pythonFiles) pyodide.FS.writeFile(`/apc/${file}`, fs.readFileSync(full, 'utf8'));
jspi = await pyodide.runPythonAsync(
  ['import sys', "sys.path.insert(0, '/apc')", 'import apc_runtime', 'apc_runtime.install()', 'from pyodide.ffi import can_run_sync', 'can_run_sync()'].join('\n'),
);
bridge.setLimited(!jspi);
out.jspi = jspi;
pyodide.runPython(`import json, apc_shims\napc_shims.register_shims(json.loads(${JSON.stringify(JSON.stringify(shimTable))}))`);

// 학생 작업 폴더의 내 모듈(코드의 import 문으로는 패키지가 드러나지 않는 길 — 문지기가 지켜야 하는 곳)
pyodide.FS.mkdirTree('/home/pyodide');
// helper_np는 사이트 흉내(mediapipe → apc_mediapipe의 맨 위 `import numpy`)를 거쳐 받는 중인 numpy에 닿는다 — 기다리는 자리가 흉내 모듈 자신의
// import 도중이라, 미룬 mediapipe 흉내는 덜 만들어진 채로 설치하지 않고 맨 바깥 import가 끝난 뒤 설치해야 한다(판 1.2.0 통합 — 브라우저 검사가 찾은
// "partially initialized module 'apc_mediapipe' has no attribute 'install'" 알림). 그 뒤 내 모듈의 `import numpy`는 기다리지 않는다.
pyodide.FS.writeFile('/home/pyodide/helper_np.py', 'import mediapipe as mp\nimport numpy as np\nVALUE = int(np.arange(4).sum())\nMP = mp.__version__\n');
pyodide.FS.writeFile('/home/pyodide/helper_cv.py', 'import cv2\nVERSION = cv2.__version__\n');
pyodide.FS.writeFile('/home/pyodide/helper_pil.py', 'from PIL import Image\nSIZE = Image.new("RGB", (3, 2)).size\n');

const extracted = (dir) => pyodide.FS.analyzePath(`${SITE_PACKAGES}/${dir}`).exists;
const loaded = (name) => name in pyodide.loadedPackages;
const py = (code) => {
  const value = pyodide.runPython(code);
  if (value && typeof value.toJs === 'function') {
    const plain = value.toJs();
    value.destroy?.();
    return plain;
  }
  return value;
};

const skip = (error) => {
  out.skipped = `휠을 받지 못했어요(네트워크?): ${lastLine(error)}`;
  finishJson(out);
};

let runCounter = 0;
/**
 * worker.ts run()과 같은 차례로 학생 코드를 한 번 돌린다.
 * stopOn(message): 워커가 화면에 보낸 메시지가 이 조건에 맞으면 그때 [정지](진행으로 멈춤 — C74 ②).
 * onMessage(message): 메시지마다 부른다(문 열기 등).
 */
async function runLikeWorker(name, code, { packages = [], stopOn, onMessage } = {}) {
  runCounter += 1;
  const runId = runCounter;
  const record = { runId, startedAt: now() };
  const stdoutBefore = stdout.length;
  const postedBefore = posted.length;
  const progressBefore = progress.length;
  const escapedBefore = out.escaped.length;
  activeRun = runId;
  bridge.beginRun();
  messageHook = (message) => {
    onMessage?.(message);
    if (stopOn && record.stopAt === undefined && stopOn(message)) {
      record.stopAt = now();
      record.busyAtStop = loads.busy();
      bridge.requestStop();
    }
  };
  let outcome = 'ok';
  try {
    const prepared = await loads.prepareRun({
      code,
      packages,
      fromImports: true,
      canWait: bridge.api.canWait(),
      raceStop: (promise) => bridge.api.raceStop(promise),
      isStopSignal: (value) => bridge.api.isStopSignal(value),
      onWait(waiting, names) {
        if (waiting) post({ type: 'progress', stage: 'package', message: '실행 전에 필요한 파일을 받는 중이에요 — 다 받으면 코드가 저절로 시작해요.' });
        post({ type: 'package-wait', runId, waiting, phase: 'start', names });
      },
    });
    record.plan = prepared.plan;
    record.preparedAt = now();
    record.busyWhenStarted = loads.busy();
    if (bridge.api.stopRequested()) {
      outcome = 'stopped';
    } else {
      const shims = py('import apc_shims\n[apc_shims.install_available(), apc_shims.deferred(), apc_shims.last_failures()]');
      record.shims = { installed: shims[0], deferred: shims[1], failures: shims[2] };
      pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
      const globals = pyodide.toPy({ __name__: '__main__', __file__: 'main.py' });
      pyodide.runPython('__import__("apc_runtime").bind_run_globals(globals())', { globals });
      try {
        const value = await pyodide.runPythonAsync(code, { globals, filename: 'main.py', dedent: false });
        record.value = value && typeof value.toJs === 'function' ? value.toJs() : value;
        await pyodide.runPythonAsync('__import__("apc_runtime").run_idle()', { globals, filename: '<board-idle>', dedent: false });
      } catch (error) {
        if (error && error.type === 'KeyboardInterrupt' && bridge.api.stopRequested()) {
          outcome = 'stopped';
        } else {
          outcome = 'error';
          record.errorType = error && error.type;
          record.errorMessage = lastLine(error);
        }
      } finally {
        pyodide.runPython('import apc_runtime\napc_runtime.unbind_run_globals()');
        globals.destroy();
        pyodide.runPython('import sys\nsys.stdout.flush()');
      }
    }
  } catch (error) {
    outcome = 'error';
    record.errorType = 'PackageLoadError';
    record.errorMessage = lastLine(error);
  } finally {
    bridge.endRun();
    activeRun = null;
    messageHook = null;
  }
  record.outcome = outcome;
  record.doneAt = now();
  record.ms = record.doneAt - record.startedAt;
  if (record.stopAt !== undefined) record.stopToDoneMs = record.doneAt - record.stopAt;
  record.busyWhenDone = loads.busy();
  record.loadedWhenDone = Object.keys(pyodide.loadedPackages).sort();
  record.stdout = stdout.slice(stdoutBefore);
  record.posted = posted.slice(postedBefore).map(({ at, type, runId: messageRunId, waiting, phase, names, message, level, text }) => ({ at, type, runId: messageRunId, waiting, phase, names, message, level, text }));
  record.progress = progress.slice(progressBefore);
  await sleepMs(20);
  record.escaped = out.escaped.slice(escapedBefore);
  out.steps[name] = record;
  mark(`${name} ${outcome}`);
  return record;
}

/** 판 1.2.0 방식의 받기 줄(워커와 같은 package-loads.ts) — main·late가 쓴다 */
function workerLikeLoads() {
  return createPackageLoads({
    loadPackage: (names) => pyodide.loadPackage([...names], packageCallbacks('load')),
    loadPackagesFromImports: (code) => {
      out.importLoads = (out.importLoads ?? 0) + 1;
      return pyodide.loadPackagesFromImports(code, packageCallbacks('imports'));
    },
    loadedNames: () => Object.keys(pyodide.loadedPackages),
    findImports: (code) => {
      const found = pyodide.pyimport('pyodide.code').find_imports(code);
      try {
        return found.toJs();
      } finally {
        found.destroy();
      }
    },
    lockPackages: () => pyodide.lockfile?.packages ?? null,
    onLoadingGrew: (importNames) => {
      out.pushed = [...(out.pushed ?? []), [...importNames]];
      pyodide.runPython(`import apc_runtime\napc_runtime.set_packages_loading(${JSON.stringify(importNames)})`);
    },
  });
}

if (mode === 'late') {
  // ── 판 1.2.1(판 1.2.0 적대적 검토 C4·C5): 미리 받기 도중 곧바로 시작한 실행 ──
  loads = workerLikeLoads();
  pyodide.registerJsModule('_probe', { loaded: () => 'opencv-python' in pyodide.loadedPackages && !loads.busy() });
  pyodide.FS.writeFile('/home/pyodide/helper_cv2b.py', 'import cv2\n');
  const preload = loads.load(['opencv-python']).catch(skip);
  // C5) 예제가 적은 패키지(opencv-python — 사이드카 없는 영상처리 예제)는 미리 받기가 받는 중이면 시작을 막지 않는다: 편집칸 코드가 그것을 쓰지 않으면 곧바로
  await runLikeWorker('example_packages_start_now', ['import time', "print('예제와 다른 코드')", 'time.sleep(0.05)', "print('끝')"].join('\n'), {
    packages: ['opencv-python'],
  });
  // C4) 받을 것 없는 코드로 시작 → 그사이 미리 받기가 끝남 → 작업 폴더의 내 모듈(helper_cv2b)이 import 문으로 드러나지 않게 cv2에 닿는다.
  //     받기가 끝난 뒤라 문지기는 기다리지 않지만, 그 import가 끝나는 자리에서 미룬 cv2 흉내가 설치돼 imshow가 화면으로 간다(전에는 그 실행 내내 진짜 imshow).
  //     문은 실제 시간이 아니라 진행으로 연다 — 이 실행이 '시작'을 찍으면(stdout) 두 문을 연다.
  let opened = false;
  const openWhenStarted = () => {
    if (!opened && stdout.includes('시작\n')) {
      opened = true;
      releaseNumpy();
      releaseCv2();
    }
  };
  const gateTimer = setInterval(openWhenStarted, 20);
  await runLikeWorker(
    'late_cv2_via_helper',
    ['import time, _probe', "print('시작')", 'while not _probe.loaded():', '    time.sleep(0.05)', 'import helper_cv2b', "print('cv2 imshow from', helper_cv2b.cv2.imshow.__module__)"].join('\n'),
  );
  clearInterval(gateTimer);
  await preload;
  // 다음 실행은 처음부터 흉내가 설치된다(예전과 같음)
  await runLikeWorker('next_run_cv2', "import cv2\nprint('next imshow from', cv2.imshow.__module__)");
  out.final = { shims: py('import apc_shims\n[apc_shims.install_available(), apc_shims.deferred(), apc_shims.last_failures()]') };
  out.stdout = stdout;
  out.progress = progress;
  finishJson(out);
} else if (mode === 'control') {
  // ── 대조: 판 1.1.5까지(문지기 없이) — 미리 받기 동안 흉내 설치·import가 반쯤 받은 numpy를 건드린다 ──
  const preload = pyodide.loadPackage(['opencv-python'], packageCallbacks('preload')).catch(skip);
  await waitUntil(() => extracted('numpy'), 'numpy 휠 풀림');
  out.halfLoaded = { numpyFiles: extracted('numpy'), numpyLoaded: loaded('numpy') };
  // 판 1.1.5의 apc_shims.install_available()이 하던 일: 찾을 수 있으면(find_spec) 흉내 모듈을 불러 install()
  out.controlMediapipe = py(
    [
      'import importlib, sys',
      'm = importlib.import_module("apc_mediapipe")',
      '[m.np is None, "numpy" in sys.modules]',
    ].join('\n'),
  );
  try {
    py('import numpy');
    out.controlImportNumpy = 'ok';
  } catch (error) {
    out.controlImportNumpy = lastLine(error);
  }
  out.controlNumpyLoadedAfterTry = loaded('numpy');
  releaseNumpy();
  releaseCv2();
  await preload;
  out.controlAfterPreload = py(
    ['import sys, numpy', 'import apc_mediapipe', '[numpy.__version__, apc_mediapipe.np is None]'].join('\n'),
  );
  out.stdout = stdout;
  finishJson(out);
} else {
  // ── 판 1.2.0 방식 ──
  loads = workerLikeLoads();

  // 1) 미리 받기(영상처리 실습실 VISION_PACKAGES)
  const preload = loads.load(['opencv-python']).catch(skip);
  out.loadingAtStart = { keys: loads.loadingKeys(), imports: loads.loadingImports() };

  // 2) 받을 것이 없는 코드(시리얼만 쓰는 3-1-2 컴퓨터 쪽처럼) — 곧바로 시작해 미리 받기가 도는 중에 끝난다
  await runLikeWorker(
    'no_packages_starts_now',
    ['import time, sys', "print('시작')", 'for i in range(20):', '    time.sleep(0.02)', "print('끝', 'numpy' in sys.modules, 'cv2' in sys.modules)"].join('\n'),
  );

  // 3) 동기 자리(흉내 설치와 같은 runPython)에서 받는 중인 numpy를 import하면 PackageStillLoading — sys.modules에 남지 않는다
  await waitUntil(() => extracted('numpy'), 'numpy 휠 풀림');
  out.syncGuard = { numpyFiles: extracted('numpy'), numpyLoaded: loaded('numpy') };
  try {
    py('import numpy');
    out.syncGuard.result = 'ok';
  } catch (error) {
    out.syncGuard.result = `${error.type}: ${lastLine(error)}`;
  }
  out.syncGuard.inSysModules = py('import sys\n"numpy" in sys.modules');

  // 4) 반쯤 받은 numpy를 작업 폴더의 내 모듈이 사이트 흉내(mediapipe)를 거쳐 import — 문지기가 다 받을 때까지 기다린 뒤 이어 간다
  //    (미룬 mediapipe 흉내는 그 import가 끝난 뒤 설치 — helper_np 만드는 곳 주석). 문지기가 기다린다고 알리면(package-wait import) 그때 numpy 문을 연다.
  out.beforeHelperNp = { numpyFiles: extracted('numpy'), numpyLoaded: loaded('numpy') };
  await runLikeWorker('helper_numpy_waits', 'import helper_np\nprint("합", helper_np.VALUE, helper_np.MP)\nhelper_np.VALUE', {
    onMessage: (message) => {
      if (message.type === 'package-wait' && message.waiting === true && message.phase === 'import') releaseNumpy();
    },
  });
  out.mediapipeAfterWait = py(
    'import sys\nm = sys.modules.get("apc_mediapipe")\n[m is not None, (m.np is not None) if m else None, bool(m._state["installed"]) if m else None]',
  );

  // 5) cv2가 아직 받는 중일 때(cv2 문은 닫혀 있다) 내 모듈이 cv2를 import — 문지기가 기다리는 동안 [정지]하면 곧바로 KeyboardInterrupt로 멈춘다
  await waitUntil(() => extracted('cv2'), 'cv2 휠 풀림');
  out.beforeHelperCv = { cv2Files: extracted('cv2'), cv2Loaded: loaded('opencv-python') };
  await runLikeWorker('helper_cv2_stop_while_waiting', 'import helper_cv\nprint(helper_cv.VERSION)', {
    stopOn: (message) => message.type === 'package-wait' && message.waiting === true && message.phase === 'import',
  });

  // 6) cv2를 직접 import하는 코드는 예전처럼 줄을 서서 기다린다(받을 것: opencv-python) — 기다린다고 알리면 cv2 문을 연다.
  //    다 받은 뒤 cv2 흉내가 설치되어 imshow가 화면으로 간다.
  await runLikeWorker(
    'cv2_code_waits_in_line',
    ['import cv2, numpy as np', 'img = np.zeros((4, 6, 3), dtype=np.uint8)', "cv2.imshow('창', img)", "print('cv2', cv2.__version__, cv2.imshow.__module__)"].join('\n'),
    {
      onMessage: (message) => {
        if (message.type === 'package-wait' && message.waiting === true && message.phase === 'start') releaseCv2();
      },
    },
  );
  await preload;
  out.afterPreload = { loaded: Object.keys(pyodide.loadedPackages).sort(), busy: loads.busy(), loadingImports: loads.loadingImports() };

  // 7) 다 받은 뒤: 내 모듈의 cv2도 바로(기다림 없이) 되고, 흉내(apc_cv2)가 설치돼 있다
  await runLikeWorker('helper_cv2_after_preload', 'import helper_cv, cv2\nprint(helper_cv.VERSION, cv2.imshow.__module__)');

  // 8) 두 번째 미리 받기(Pillow) 동안 Pillow를 쓰는 코드를 [실행]하고 줄을 서서 기다리는 동안 [정지] — 곧바로 'stopped', 그 실행의 받기는 하지 않는다
  const importLoadsBefore = out.importLoads ?? 0;
  const preloadPil = loads.load(['pillow']).catch(skip);
  await runLikeWorker('pil_code_stop_in_line', 'from PIL import Image\nprint(Image.new("RGB", (2, 2)).size)', {
    stopOn: (message) => message.type === 'package-wait' && message.waiting === true && message.phase === 'start',
  });
  await preloadPil;
  await sleepMs(50);
  out.importLoadsDuringStoppedRun = (out.importLoads ?? 0) - importLoadsBefore;

  // 9) 다 받은 뒤 Pillow 코드는 그대로 돈다
  await runLikeWorker('pil_after_preload', 'import helper_pil\nfrom PIL import Image\nprint(helper_pil.SIZE, Image.new("RGB", (2, 2)).size)');

  // 10) 끝 상태: 실행이 끝난 뒤 받는 중 없음, 흉내 실패 없음, 학생 stdout에 Pyodide 영어 알림("Loading …")이 없다
  out.final = {
    busy: loads.busy(),
    loadingImports: loads.loadingImports(),
    shims: py('import apc_shims\n[apc_shims.install_available(), apc_shims.deferred(), apc_shims.last_failures()]'),
    cv2Patched: py('import cv2\ncv2.imshow.__module__'),
  };
  out.stdout = stdout;
  out.progress = progress;
  out.posted = posted.filter((message) => message.type !== 'event').map(({ at, type, waiting, phase, names, message, text }) => ({ at, type, waiting, phase, names, message, text }));
  out.events = posted.filter((message) => message.type === 'event').map((message) => message.kind);
  finishJson(out);
}
