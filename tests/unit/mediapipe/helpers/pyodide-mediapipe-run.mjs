// Node.js에서 실제 Pyodide 314.0.7 + opencv-python으로 mediapipe 흉내 모듈의 파이썬 쪽(src/lab/modules/mediapipe/{mediapipe,apc_mediapipe}.py)을
// 검사하는 도우미 스크립트(PLAN §8.2 P2-08, src/lab/README.md 4.6절, 판 1.8.0 — mediapipe 1.1.1 Tasks API 모양). tests/unit/mediapipe/pyodide-mediapipe.test.ts가
// `node [--experimental-wasm-jspi|제한 모드 흉내] 이 파일 <저장소 뿌리>`로 띄우고 마지막 줄의 JSON 한 줄을 읽는다.
//
// 워커(src/lab/runtime/worker.ts)와 같은 순서로 준비한다: 다리 등록 → 붙박이 .py와 모듈 폴더의 .py를 /apc에 쓰기 → apc_runtime.install()
// → apc_shims.register_shims(모듈 폴더 표) → 실행마다 install_available()·reset_for_run().
// 화면 흉내: 'mediapipe.open'에는 {ok, engine}으로, 'mediapipe.detect'에는 단계가 정한 합성 좌표로 답한다(PD-30 — 사람 데이터가 아니라 코드가 만든 좌표).
// 손·얼굴 개수는 진짜 화면(index.ts의 detectedFromSynthetic·facesFromSynthetic)처럼 그 객체를 열 때 보낸 maxNumHands·maxNumFaces로 자른다.
// 단계 목록은 tasks-steps.mjs.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { finishJson } from '../../helpers/finish-json.mjs';
import { loadSteps } from './tasks-steps.mjs';

const rootDir = process.argv[2] ?? process.cwd();
const cacheDir = path.join(rootDir, '.cache', 'pyodide-packages');
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);
const { createBridge } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'bridge.ts')).href);
const { steps, defaults } = await loadSteps(rootDir);

const out = { steps: {}, events: [], notices: [], requests: [], files: [] };

function isRethrownRunError(error) {
  return Boolean(error) && typeof error.type === 'string' && (error.type === 'SystemExit' || error.type === 'KeyboardInterrupt');
}
process.on('uncaughtException', (error) => {
  if (isRethrownRunError(error)) return;
  console.error(error);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  if (isRethrownRunError(reason)) return;
  console.error(reason);
  process.exit(1);
});

function finish() {
  // 결과 JSON이 파이프 버퍼(64KB)보다 크면 다 나가기 전에 끝나 버린다 → 공통 함수로 기다린 뒤 끝낸다.
  finishJson(out);
}

fs.mkdirSync(cacheDir, { recursive: true });
const pyodide = await loadPyodide({ packageCacheDir: cacheDir });
try {
  await pyodide.loadPackage('opencv-python');
} catch (error) {
  out.skipped = `opencv-python 휠을 받지 못했어요(네트워크?): ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
  finish();
}
// loadPackage는 휠을 못 받아도 콘솔에 적기만 하고 넘어갈 때가 있다(jsDelivr가 막힌 컴퓨터) → 실제로 불러지는지 한 번 더 본다.
try {
  pyodide.runPython('import numpy, cv2');
} catch (error) {
  out.skipped = `opencv-python·numpy를 불러오지 못했어요(네트워크?): ${error instanceof Error ? error.message.trim().split('\n').at(-1) : String(error)}`;
  finish();
  await new Promise(() => {}); // finish()가 결과를 다 내보내고 끝낼 때까지 아래 단계를 돌리지 않는다
}

let jspi = false;
let stdout = '';
/** 다음 mediapipe.detect 요청에 줄 답. 빈 목록이면 "못 찾음"이다. */
let nextHands = [];
let nextFaces = [];
let nextPoses = [];
let nextDetections = [];
let detectSource = 'replay';
/** 객체 번호 → 열 때 보낸 옵션(손·얼굴 개수 자르기에 쓴다) */
const openOptions = new Map();

const bridge = createBridge({
  post: (message) => {
    if (message.type === 'request') {
      const payload = message.payload;
      if (message.kind === 'mediapipe.open') {
        out.requests.push({ kind: message.kind, solution: payload.solution, id: payload.id, options: { ...payload.options } });
        openOptions.set(payload.id, { ...payload.options });
        setTimeout(() => bridge.resolveRequest(message.requestId, { ok: true, engine: 'replay', message: null }), 2);
      } else if (message.kind === 'mediapipe.detect') {
        const data = payload.data;
        out.requests.push({
          kind: message.kind,
          solution: payload.solution,
          id: payload.id,
          width: payload.width,
          height: payload.height,
          dataType: data ? data.constructor.name : typeof data,
          bytes: data ? data.byteLength : 0,
          // RGBA 첫 픽셀(파이썬이 넘긴 RGB 순서가 지켜지는지)
          firstPixel: data ? [data[0], data[1], data[2], data[3]] : null,
        });
        // solution마다 답의 모양이 다르다(index.ts와 같게)
        const options = openOptions.get(payload.id) ?? {};
        const limit = (list, count) => list.slice(0, Math.max(1, Number(count) || 1));
        const answer =
          payload.solution === 'face_mesh'
            ? { ok: true, faces: limit(nextFaces ?? [], options.maxNumFaces), source: detectSource }
            : payload.solution === 'face_detection'
              ? { ok: true, detections: nextDetections ?? [], source: detectSource }
              : payload.solution === 'pose'
                ? { ok: true, poses: limit(nextPoses ?? [], options.maxNumPoses), poseWorlds: null, source: detectSource }
                : { ok: true, hands: limit(nextHands ?? [], options.maxNumHands), source: detectSource };
        setTimeout(() => bridge.resolveRequest(message.requestId, answer), 2);
      } else {
        setTimeout(() => bridge.rejectRequest(message.requestId, `화면이 "${message.kind}" 요청을 처리하지 못해요.`), 2);
      }
    } else if (message.type === 'event') {
      out.events.push({ kind: message.kind });
    } else if (message.type === 'notice') {
      out.notices.push(message.text);
    }
  },
  now: () => performance.now(),
  canRunSync: () => jspi,
});
pyodide.setStdout({
  write: (buffer) => {
    stdout += new TextDecoder().decode(buffer);
    return buffer.length;
  },
});
pyodide.registerJsModule('_apc_bridge', bridge.api);
pyodide.FS.mkdirTree('/apc');

// 붙박이 + 모듈 폴더의 .py (src/lab/python/modules.ts와 같은 규칙)
const pythonFiles = new Map();
for (const file of fs.readdirSync(path.join(rootDir, 'src', 'lab', 'python'))) {
  if (file.endsWith('.py')) pythonFiles.set(file, path.join(rootDir, 'src', 'lab', 'python', file));
}
const modulesDir = path.join(rootDir, 'src', 'lab', 'modules');
for (const folder of fs.readdirSync(modulesDir, { withFileTypes: true })) {
  if (!folder.isDirectory()) continue;
  for (const file of fs.readdirSync(path.join(modulesDir, folder.name))) {
    if (!file.endsWith('.py')) continue;
    if (pythonFiles.has(file)) {
      out.duplicate = file;
      finish();
    }
    pythonFiles.set(file, path.join(modulesDir, folder.name, file));
  }
}
for (const [file, fullPath] of pythonFiles) {
  pyodide.FS.writeFile(`/apc/${file}`, fs.readFileSync(fullPath, 'utf8'));
  out.files.push(file);
}
out.files.sort();

jspi = await pyodide.runPythonAsync(
  ['import sys', "sys.path.insert(0, '/apc')", 'import apc_runtime', 'apc_runtime.install()', 'from pyodide.ffi import can_run_sync', 'can_run_sync()'].join('\n'),
);
bridge.setLimited(!jspi);
out.jspi = jspi;

// 워커가 하는 일: 모듈 폴더의 shims 표를 등록한다(src/lab/modules/mediapipe/manifest.ts의 shims와 같은 값)
out.shimTable = pyodide.runPython("import json, apc_shims\njson.dumps(apc_shims.register_shims({'mediapipe': 'apc_mediapipe'}))");

async function step(name, code, { setup, hands, faces, poses, detections } = {}) {
  stdout = '';
  nextHands = hands === undefined ? defaults.hands : hands;
  nextFaces = faces === undefined ? defaults.faces : faces;
  nextPoses = poses === undefined ? defaults.poses : poses;
  nextDetections = detections === undefined ? defaults.detections : detections;
  const requestsBefore = out.requests.length;
  const record = { ms: 0, stdout: '' };
  const startedAt = performance.now();
  bridge.beginRun();
  pyodide.runPython('import apc_shims\napc_shims.install_available()');
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  if (setup) setup();
  try {
    const globals = pyodide.toPy({ __name__: '__main__' });
    try {
      const value = await pyodide.runPythonAsync(code, { globals, filename: 'main.py' });
      record.value = value && typeof value.toJs === 'function' ? value.toJs({ dict_converter: Object.fromEntries }) : value;
    } finally {
      globals.destroy();
    }
  } catch (error) {
    record.errorType = error && error.type ? error.type : 'JsError';
    record.errorMessage = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
  } finally {
    bridge.endRun();
  }
  record.ms = Math.round(performance.now() - startedAt);
  record.stdout = stdout;
  record.requests = out.requests.slice(requestsBefore).map((request) => request.kind);
  out.steps[name] = record;
}

// 단계 목록은 tasks-steps.mjs 한 곳(같은 단계를 진짜 CPython에서도 돌려 기댓값을 대조한다 — 판 1.8.0).
for (const item of steps) {
  if (item.jspi === 'only' && !jspi) continue;
  if (item.jspi === 'limited' && jspi) continue;
  await step(item.name, item.code, item);
}

// ── 동기 진입점 규칙(PROGRESS 미해결 25번): 마지막 양보 뒤 16ms가 지난 뒤 동기 runPython으로 실행 준비를 불러도 스택 전환 오류가 없어야 한다 ──
await new Promise((resolve) => setTimeout(resolve, 40));
try {
  pyodide.runPython('import apc_shims\napc_shims.install_available()');
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  out.syncEntrypointReset = 'ok';
} catch (error) {
  out.syncEntrypointReset = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
}
// install()은 멱등이어야 한다(두 번 불러도 초기화 함수가 한 번만 등록된다)
out.installIdempotent = pyodide.runPython(
  ['import apc_mediapipe, apc_runtime', 'apc_mediapipe.install()', 'apc_mediapipe.install()', 'apc_runtime._reset_hooks.count(apc_mediapipe._reset)'].join('\n'),
);
// numpy 없이도 import되는지(install()은 패키지를 받기 전에도 불린다)
out.importsWithoutNumpy = pyodide.runPython(
  [
    'import importlib, sys',
    'saved = sys.modules.pop("apc_mediapipe", None)',
    '# sys.modules[이름] = None 이면 그 이름의 import가 ImportError가 된다(numpy를 아직 받지 않은 상태 흉내)',
    'real_numpy = sys.modules.pop("numpy", None)',
    'sys.modules["numpy"] = None',
    'try:',
    '    module = importlib.import_module("apc_mediapipe")',
    '    ok = module.VERSION',
    'except Exception as error:',
    '    ok = f"{type(error).__name__}: {error}"',
    'finally:',
    '    if real_numpy is not None:',
    '        sys.modules["numpy"] = real_numpy',
    '    else:',
    '        sys.modules.pop("numpy", None)',
    '    sys.modules.pop("apc_mediapipe", None)',
    '    if saved is not None:',
    '        sys.modules["apc_mediapipe"] = saved',
    'ok',
  ].join('\n'),
);

finish();
