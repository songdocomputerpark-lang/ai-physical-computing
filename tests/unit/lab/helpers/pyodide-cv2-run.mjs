// Node.js에서 실제 Pyodide 314.0.7 + opencv-python 4.11.0.86으로 cv2 카메라·창 흉내 모듈(src/lab/python/apc_cv2.py)을 검사하는
// 도우미 스크립트(PLAN §8.2 P2-03, PD-14). tests/unit/lab/pyodide-cv2.test.ts가 `node --experimental-wasm-jspi 이 파일 <저장소 뿌리>`로 띄우고
// 마지막 줄의 JSON 한 줄을 읽는다.
// - opencv-python 휠(10.7MB)과 numpy 휠은 Pyodide가 jsDelivr에서 받아 .cache/pyodide-packages/(git 제외)에 저장한다(packageCacheDir,
//   Pyodide Node 전용 옵션). 두 번째부터는 캐시에서 읽어 네트워크가 필요 없다. 받지 못하면 {"skipped": 이유}를 찍고 끝낸다.
// - 화면 흉내: camera.open → 64×48 시험 입력, camera.read → 검은 바탕에 흰 네모(테두리가 생기는 그림)를 RGBA로 답하고,
//   window.show 이벤트의 흰 픽셀을 센다. 첫 실습 예제(examples/vision/first-edge.py)를 그대로 돌려 5장 뒤 q 키를 넣는다.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.argv[2] ?? process.cwd();
const cacheDir = path.join(rootDir, '.cache', 'pyodide-packages');
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);
const { createBridge } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'bridge.ts')).href);

const pythonDir = path.join(rootDir, 'src', 'lab', 'python');
const exampleSource = fs.readFileSync(path.join(rootDir, 'examples', 'vision', 'first-edge.py'), 'utf8');

const out = { steps: {}, events: [], notices: [], reads: 0 };

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
  process.stdout.write(`\n${JSON.stringify(out)}\n`);
  process.exit(0);
}

fs.mkdirSync(cacheDir, { recursive: true });
const pyodide = await loadPyodide({ packageCacheDir: cacheDir });
try {
  await pyodide.loadPackage('opencv-python');
} catch (error) {
  out.skipped = `opencv-python 휠을 받지 못했어요(네트워크?): ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
  finish();
}
out.loadedPackages = Object.keys(pyodide.loadedPackages).sort();

/** 시험 입력 한 장: 검은 바탕에 흰 네모(64×48 RGBA). frameIndex로 네모를 조금씩 옮겨 장마다 다르게 한다. */
const FRAME_W = 64;
const FRAME_H = 48;
function makeFrame(frameIndex) {
  const data = new Uint8ClampedArray(FRAME_W * FRAME_H * 4);
  const shift = frameIndex % 4;
  for (let y = 0; y < FRAME_H; y += 1) {
    for (let x = 0; x < FRAME_W; x += 1) {
      const inside = x >= 20 + shift && x < 44 + shift && y >= 12 && y < 36;
      const value = inside ? 255 : 0;
      const offset = (y * FRAME_W + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width: FRAME_W, height: FRAME_H, data };
}

let cameraOk = true;
let stopAfterReads = Infinity;
const bridge = createBridge({
  post: (message, transfer) => {
    if (message.type === 'notice') {
      out.notices.push(message.text);
      return;
    }
    if (message.type === 'event') {
      const payload = message.payload ?? {};
      const record = { kind: message.kind, name: payload.name ?? null, transferred: Array.isArray(transfer) ? transfer.length : 0 };
      if (message.kind === 'window.show') {
        const data = payload.data;
        let white = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] > 200) white += 1;
        }
        record.width = payload.width;
        record.height = payload.height;
        record.bytes = data.length;
        record.dataType = data.constructor.name;
        record.white = white;
        // transfer 목록의 첫 ArrayBuffer 크기. 영상 바이트의 버퍼 자체가 옮기기 목록에 들어갔는지 본다
        // (Node에는 postMessage가 없어 실제로 옮겨지지는 않는다 — 옮긴 뒤 비는 것은 브라우저 테스트 lab-vision.spec.ts가 확인).
        record.transferBytes = transfer?.[0] instanceof ArrayBuffer ? transfer[0].byteLength : null;
      }
      out.events.push(record);
      return;
    }
    if (message.type !== 'request') {
      return;
    }
    // 화면(vision-lab.ts)은 cap.read()에 초당 15장(약 67ms 간격)으로만 답한다. 여기서도 같은 간격으로 답해야
    // imshow의 같은 창 초당 30장 제한에 걸려 장이 빠지는 일이 없다(2ms로 답하면 5장 가운데 1장만 화면으로 간다).
    const delay = message.kind === 'camera.read' ? 67 : 2;
    setTimeout(() => {
      switch (message.kind) {
        case 'camera.open':
          bridge.resolveRequest(message.requestId, cameraOk ? { ok: true, width: FRAME_W, height: FRAME_H, source: 'test', fps: 15 } : { ok: false });
          return;
        case 'camera.read': {
          out.reads += 1;
          if (out.reads >= stopAfterReads) {
            bridge.pushEvent('cv2.keys', 113); // q
          }
          bridge.resolveRequest(message.requestId, makeFrame(out.reads));
          return;
        }
        case 'camera.set':
          bridge.resolveRequest(message.requestId, { ok: true, width: message.payload.prop === 'width' ? message.payload.value : FRAME_W, height: FRAME_H });
          return;
        case 'camera.release':
          out.released = (out.released ?? 0) + 1;
          bridge.resolveRequest(message.requestId, true);
          return;
        default:
          bridge.rejectRequest(message.requestId, `화면이 "${message.kind}" 요청을 처리하지 못해요.`);
      }
    }, delay);
  },
  now: () => performance.now(),
  canRunSync: () => jspi,
});
let jspi = false;

let stdout = '';
pyodide.setStdout({
  write: (buffer) => {
    stdout += new TextDecoder().decode(buffer);
    return buffer.length;
  },
});
pyodide.registerJsModule('_apc_bridge', bridge.api);
pyodide.FS.mkdirTree('/apc');
for (const fileName of fs.readdirSync(pythonDir)) {
  if (fileName.endsWith('.py')) {
    pyodide.FS.writeFile(`/apc/${fileName}`, fs.readFileSync(path.join(pythonDir, fileName), 'utf8'));
  }
}
jspi = await pyodide.runPythonAsync(
  "import sys\nsys.path.insert(0, '/apc')\nimport apc_runtime\napc_runtime.install()\nfrom pyodide.ffi import can_run_sync\ncan_run_sync()",
);
out.canRunSync = jspi;
bridge.setLimited(!jspi);
out.shimsInstalled = pyodide.runPython('import apc_shims\napc_shims.install_available()').toJs();
out.shimsInstalledAgain = pyodide.runPython('apc_shims.install_available()').toJs();
out.patched = pyodide.runPython(
  "import cv2, apc_cv2\n[cv2.VideoCapture is apc_cv2.VideoCapture, cv2.imshow is apc_cv2.imshow, cv2.waitKey is apc_cv2.waitKey, apc_cv2.originals()['imshow'] is not apc_cv2.imshow, hasattr(cv2, 'destoyAllWindows')]",
).toJs();

/**
 * 학생 코드처럼 실행하고 결과·예외·이벤트를 적는다.
 * setup: 실행 준비(reset_for_run — 흉내 모듈이 이전 실행의 키·창 목록을 비운다) 뒤, 코드를 돌리기 직전에 부른다.
 *        키 입력처럼 "실행 중에" 들어와야 하는 값은 여기서 넣는다(실행 전에 넣으면 reset_for_run이 지운다 — 설계대로).
 */
async function step(name, code, { stopAfterMs, setup, resetDelayMs = 0 } = {}) {
  bridge.beginRun();
  if (resetDelayMs > 0) {
    // 워커에서는 beginRun 뒤 패키지 받기가 끝난 다음(수 초 뒤) reset_for_run이 동기(runPython)로 불린다.
    // 마지막 양보 뒤 16ms가 지난 상태를 흉내 내 초기화 함수가 양보를 시도하지 않는지(JSPI 스택 전환 거부 오류) 본다.
    await new Promise((resolve) => setTimeout(resolve, resetDelayMs));
  }
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  setup?.();
  const before = stdout.length;
  const eventsBefore = out.events.length;
  const t0 = performance.now();
  let timer;
  if (stopAfterMs !== undefined) {
    timer = setTimeout(() => bridge.requestStop(), stopAfterMs);
  }
  const record = {};
  try {
    const globals = pyodide.toPy({ __name__: '__main__' });
    try {
      const value = await pyodide.runPythonAsync(code, { globals, filename: 'main.py', dedent: false });
      record.value = value && typeof value.toJs === 'function' ? value.toJs() : value;
    } finally {
      globals.destroy();
    }
  } catch (error) {
    record.errorType = error && error.type;
    record.errorMessage = String(error.message ?? error).trim().split('\n').slice(-1)[0];
  } finally {
    clearTimeout(timer);
    record.ms = Math.round(performance.now() - t0);
    record.stopped = bridge.endRun().stopped;
    record.stdout = stdout.slice(before);
    record.events = out.events.slice(eventsBefore);
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  out.steps[name] = record;
}

if (jspi) {
  // 1. 첫 실습 예제를 그대로 돌린다: 5장 읽으면 q 키가 들어가 반복이 끝난다.
  stopAfterReads = 5;
  out.reads = 0;
  await step('first_edge_example', exampleSource);
  out.steps.first_edge_example.reads = out.reads;
  stopAfterReads = Infinity;

  // 2. 창 속성·닫힘·waitKey·키 큐
  await step(
    'window_props',
    [
      'import cv2, apc_runtime',
      "cv2.namedWindow('w')",
      "before = cv2.getWindowProperty('w', cv2.WND_PROP_VISIBLE)",
      "unknown = cv2.getWindowProperty('nope', cv2.WND_PROP_VISIBLE)",
      "apc_runtime.notice('x')",
      "[before, unknown]",
    ].join('\n'),
  );
  // 실행 중에 화면에서 창을 닫으면(cv2.window 이벤트) getWindowProperty가 0.0이 된다.
  await step(
    'window_closed',
    "import cv2\ncv2.namedWindow('w')\ncv2.getWindowProperty('w', cv2.WND_PROP_VISIBLE)",
    { setup: () => bridge.pushEvent('cv2.window', { name: 'w', closed: true }) },
  );
  // 실행 전에 들어온 키·창 이벤트는 reset_for_run이 비운다(이전 실행의 값이 새 실행에 새지 않게).
  // 마지막 양보 뒤 40ms가 지난 뒤 동기 진입점에서 초기화해도 오류 없이(양보 시도 없이) 비워야 한다.
  bridge.pushEvent('cv2.keys', 113);
  await step('stale_keys_cleared', 'import cv2\ncv2.pollKey()', { resetDelayMs: 40 });
  // 실행 중에 들어온 키는 순서대로 나온다.
  await step('waitkey_queue', 'import cv2\n[cv2.waitKey(0), cv2.waitKey(5), cv2.waitKey(5), cv2.pollKey()]', {
    setup: () => {
      bridge.pushEvent('cv2.keys', 27);
      bridge.pushEvent('cv2.keys', 100);
    },
  });
  await step('waitkey_zero_stops', 'import cv2\ncv2.waitKey(0)', { stopAfterMs: 40 });
  await step('destroy_all', "import cv2\ncv2.namedWindow('a')\ncv2.namedWindow('b')\ncv2.destroyWindow('a')\ncv2.destroyAllWindows()\ncv2.getWindowProperty('b', cv2.WND_PROP_VISIBLE)");

  // 3. imshow 변환: 회색·float·잘못된 모양·배열 아님
  await step(
    'imshow_kinds',
    [
      'import cv2, numpy as np, time',
      "cv2.imshow('gray', np.full((4, 6), 200, np.uint8))",
      'time.sleep(0.05)',
      "cv2.imshow('float', np.ones((4, 6, 3), np.float32))",
      'time.sleep(0.05)',
      "cv2.imshow('bgra', np.zeros((4, 6, 4), np.uint8))",
      'errors = []',
      'try:',
      "    cv2.imshow('bad', np.zeros((4, 6, 2), np.uint8))",
      'except cv2.error as e:',
      "    errors.append('error:' + str(e)[:10])",
      'try:',
      "    cv2.imshow('bad', 5)",
      'except cv2.error as e:',
      "    errors.append('error:' + str(e)[:10])",
      'errors',
    ].join('\n'),
  );
  // 같은 창에 30ms 안에 두 번 보내면 한 번만 화면으로 간다.
  await step('imshow_rate_limit', "import cv2, numpy as np\nfor _ in range(5):\n    cv2.imshow('fast', np.zeros((2, 2), np.uint8))\n'done'");

  // 4. cap.get/set/release, 카메라 못 열 때, 파일 경로는 진짜 VideoCapture
  await step(
    'cap_props',
    [
      'import cv2',
      'cap = cv2.VideoCapture(0)',
      'w0, h0 = cap.get(cv2.CAP_PROP_FRAME_WIDTH), cap.get(cv2.CAP_PROP_FRAME_HEIGHT)',
      'changed = cap.set(cv2.CAP_PROP_FRAME_WIDTH, 32)',
      'w1 = cap.get(cv2.CAP_PROP_FRAME_WIDTH)',
      'fps = cap.get(cv2.CAP_PROP_FPS)',
      'opened = cap.isOpened()',
      'cap.release()',
      '[w0, h0, changed, w1, fps, opened, cap.isOpened(), cap.getBackendName()]',
    ].join('\n'),
  );
  cameraOk = false;
  await step('camera_unavailable', 'import cv2\ncap = cv2.VideoCapture(0)\nok, frame = cap.read()\n[cap.isOpened(), ok, frame is None]');
  cameraOk = true;
  await step('file_path_delegates', "import cv2\ncap = cv2.VideoCapture('no-such-file.mp4')\n[cap.isOpened(), cap.read()[0]]");

  // 5. 읽기 대기 중 [정지]
  await step('read_stops', 'import cv2\ncap = cv2.VideoCapture(0)\nwhile True:\n    ok, frame = cap.read()\n', { stopAfterMs: 60 });
}

// 6. 제한 모드: 기다릴 수 없으니 화면이 미리 넣은 정보·프레임을 읽는다. imshow(emit)는 된다.
bridge.setLimited(true);
bridge.setValue('camera.info', { ok: true, width: FRAME_W, height: FRAME_H, source: 'sample', fps: 15 });
bridge.setValue('camera.frame', makeFrame(0));
await step(
  'limited_read',
  [
    'import cv2',
    'cap = cv2.VideoCapture(0)',
    'ok, frame = cap.read()',
    'gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)',
    "cv2.imshow('limited', cv2.Canny(gray, 100, 200))",
    '[cap.isOpened(), ok, list(frame.shape), int(frame[24, 32, 0]), int(frame[2, 2, 0]), cv2.waitKey(1)]',
  ].join('\n'),
);
await step('limited_waitkey_zero', 'import cv2\ncv2.waitKey(0)');
bridge.setLimited(!jspi);

// 동기 진입점(runPython)에서 입력 확인 지점(poll → maybe_yield)이 불려도 양보를 시도하지 않아야 한다.
// 워커는 실행 준비(reset_for_run)를 runPython으로 부르고, 그 앞의 패키지 받기 때문에 마지막 양보 뒤 16ms가 넘게 지나 있다.
// 양보를 시도하면 Pyodide가 "Cannot stack switch because the Python entrypoint was a synchronous function"을 낸다(2026-09-16 실사이트 첫 실행에서 발견).
bridge.beginRun();
await new Promise((resolve) => setTimeout(resolve, 40));
try {
  pyodide.runPython("import apc_runtime\napc_runtime.poll('sync-check')\napc_runtime.get('sync-check')");
  out.syncEntrypointPoll = 'ok';
} catch (error) {
  out.syncEntrypointPoll = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
}
bridge.endRun();

out.pendingRequests = bridge.pendingRequestCount();
finish();
