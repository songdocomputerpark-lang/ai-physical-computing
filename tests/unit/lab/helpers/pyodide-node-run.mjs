// Node.js에서 실제 Pyodide 314.0.7(npm devDependency)을 띄워 파이썬 도우미(src/lab/python/apc_runtime.py)와
// JS 다리(src/lab/runtime/bridge.ts)를 함께 돌리는 도우미 스크립트(PLAN PD-14, PROGRESS 미해결 1번).
// tests/unit/lab/pyodide-node.test.ts가 `node --experimental-wasm-jspi 이 파일 <저장소 뿌리>`로 띄우고,
// 마지막 줄에 찍히는 JSON 한 줄을 읽는다. `--no-experimental-wasm-jspi`로 띄우면 제한 모드(can_run_sync 거짓)의 결과가 나온다
// (JSPI 기본값은 Node 판마다 달라 두 경우 모두 플래그를 명시한다). 제한 모드에서는 끝나지 않는 단계(정지를 기다리는 반복문)를
// 건너뛰고 결과에 skipped로 적는다.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.argv[2] ?? process.cwd();
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);
const { createBridge } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'bridge.ts')).href);
const helperSource = fs.readFileSync(path.join(rootDir, 'src', 'lab', 'python', 'apc_runtime.py'), 'utf8');

const out = { jspiFlag: typeof WebAssembly.Suspending === 'function', steps: {}, escaped: [] };
const posted = [];
let stdout = '';
let jspi = false;
/** 조절 패널 흉내(P2-04): input() 안내글 → 답하기 직전에 'lab.params' 채널에 쌓을 값 목록 */
const paramPushes = new Map();

// 워커(src/lab/runtime/worker.ts)의 error·unhandledrejection 처리와 같은 역할이다. SystemExit·KeyboardInterrupt로 끝난 실행은
// runPythonAsync 약속이 거부되는 것과 별개로 처리되지 않은 오류로 한 번 더 새어 나온다(asyncio Task가 결과에 적고도 다시 던짐).
// 여기서는 그 종류와 방식(exception·rejection)만 적어 두고 살려 둔다. 다른 오류는 그대로 실패로 끝낸다.
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

const startedAt = Date.now();
const pyodide = await loadPyodide();
out.pyodideVersion = pyodide.version;
out.loadMs = Date.now() - startedAt;

const bridge = createBridge({
  post: (message) => {
    posted.push(message);
    // 화면 흉내: input 요청에는 10ms 뒤 '민수'로 답하고(답하기 전에 안내글에 걸린 조절 값을 쌓는다), camera.read 요청은 거절한다.
    if (message.type === 'request') {
      setTimeout(() => {
        if (message.kind === 'input') {
          for (const update of paramPushes.get(message.payload?.prompt ?? '') ?? []) {
            bridge.pushEvent('lab.params', update);
          }
          bridge.resolveRequest(message.requestId, '민수');
        } else bridge.rejectRequest(message.requestId, `화면이 "${message.kind}" 요청을 처리하지 못해요.`);
      }, 10);
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
pyodide.FS.writeFile('/apc/apc_runtime.py', helperSource);
jspi = await pyodide.runPythonAsync(
  "import sys\nsys.path.insert(0, '/apc')\nimport apc_runtime\napc_runtime.install()\nfrom pyodide.ffi import can_run_sync\ncan_run_sync()",
);
out.canRunSync = jspi;
out.pythonVersion = String(pyodide.runPython('import sys\nsys.version.split()[0]'));
bridge.setLimited(!jspi);

/**
 * 학생 코드처럼 runPythonAsync로 실행하고 결과·예외·걸린 시간을 적는다.
 * needsJspi: 정지 신호나 화면의 답(input)으로만 끝나는 코드. 기다리기가 없는 제한 모드에서는 끝나지 않거나 뜻이 없어 건너뛴다.
 * bindGlobals: 워커(src/lab/runtime/worker.ts)처럼 새 전역 사전으로 돌리고 조절 패널 값의 목적지로 도우미에 알린다(P2-04).
 * setup: 실행 준비(reset_for_run·bind) 뒤, 코드를 돌리기 직전에 부른다(실행 중에 들어와야 하는 값을 넣는 곳).
 */
async function step(name, code, { stopAfterMs, needsJspi = false, bindGlobals = false, setup } = {}) {
  if (needsJspi && !jspi) {
    out.steps[name] = { skipped: '제한 모드(JSPI 없음)에서는 정지 신호·화면의 답을 받지 못해 끝나지 않는 코드' };
    return;
  }
  bridge.beginRun();
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  const globals = bindGlobals ? pyodide.toPy({ __name__: '__main__' }) : null;
  if (globals) {
    pyodide.runPython('__import__("apc_runtime").bind_run_globals(globals())', { globals });
  }
  setup?.();
  const before = stdout.length;
  const escapedBefore = out.escaped.length;
  const t0 = performance.now();
  let timer;
  if (stopAfterMs !== undefined) {
    timer = setTimeout(() => bridge.requestStop(), stopAfterMs);
  }
  const record = { ms: 0 };
  try {
    const value = await pyodide.runPythonAsync(code, { filename: 'main.py', dedent: false, ...(globals ? { globals } : {}) });
    record.value = value && typeof value.toJs === 'function' ? value.toJs() : value;
  } catch (error) {
    record.errorType = error && error.type;
    record.errorMessage = String(error.message ?? error).trim().split('\n').slice(-1)[0];
  } finally {
    clearTimeout(timer);
    if (globals) {
      pyodide.runPython('import apc_runtime\napc_runtime.unbind_run_globals()');
      globals.destroy();
    }
    record.ms = Math.round(performance.now() - t0);
    record.stopped = bridge.endRun().stopped;
    record.stdout = stdout.slice(before);
  }
  // 새어 나온 오류는 약속이 거부된 뒤 잠깐 사이에 오므로 한 틱 기다렸다가 센다.
  await new Promise((resolve) => setTimeout(resolve, 20));
  record.escaped = out.escaped.slice(escapedBefore);
  out.steps[name] = record;
}

await step('block_on_js_promise', 'import apc_runtime, js\napc_runtime.block_on(js.Promise.resolve(42))');
await step('sleep_loop_stops', 'import time\nwhile True:\n    time.sleep(0.05)', { stopAfterMs: 60, needsJspi: true });
await step('sleep_coalesce', 'import time\nt0 = time.time()\nfor _ in range(20):\n    time.sleep(0.001)\nround((time.time() - t0) * 1000)');
await step('sleep_zero_yields', "import time\nfor _ in range(3):\n    time.sleep(0)\n'ok'");
await step('sleep_type_error', 'import time\ntime.sleep("a")');
await step('input_roundtrip', "name = input('이름: ')\nprint('안녕, ' + name)\nname");
await step('input_stops', "input('기다림: ')", { stopAfterMs: 5, needsJspi: true });
await step('request_rejected', "import apc_runtime\napc_runtime.request('camera.read', {'w': 1})");
bridge.setValue('threshold', 120);
bridge.pushEvent('keys', 113);
bridge.pushEvent('keys', 27);
await step(
  'get_and_poll',
  "import apc_runtime\n[apc_runtime.get('threshold'), apc_runtime.get('none', '기본'), apc_runtime.poll('keys'), apc_runtime.poll('keys')]",
);
// 조절 패널 값(P2-04): input()에서 기다리는 동안 화면이 쌓은 값이 약속이 끝난 뒤(block_on) 전역 변수에 들어간다.
// 형 이름대로 바꾸고(int는 반올림), 예약어·변수 이름이 아닌 것·사전이 아닌 것은 버리며, 바꿀 수 없는 값은 콘솔에 알린다.
paramPushes.set('1', [{ name: 'threshold', value: 120, type: 'int' }]);
paramPushes.set('2', [
  { name: 'threshold', value: 7.6, type: 'int' },
  { name: 'ratio', value: 0.25, type: 'float' },
  { name: 'mode', value: 'blur', type: 'str' },
  { name: 'show', value: 0, type: 'bool' },
  { name: 'for', value: 1, type: 'int' },
  { name: 'bad name', value: 1, type: 'int' },
  { name: 'broken', value: 'abc', type: 'int' },
  'garbage',
]);
await step(
  'params_apply',
  [
    'threshold = 100',
    'ratio = 1.0',
    'mode = "edge"',
    'show = True',
    "input('1')",
    'first = threshold',
    "input('2')",
    "[first, threshold, ratio, mode, show, type(threshold).__name__, type(ratio).__name__, 'for' in globals(), 'broken' in globals()]",
  ].join('\n'),
  { needsJspi: true, bindGlobals: true },
);
// 실행 전에 쌓인 값은 버린다(코드에 적힌 값이 시작값 — 패널이 코드도 함께 고쳐 둔다).
bridge.pushEvent('lab.params', { name: 'threshold', value: 55, type: 'int' });
await step('params_stale_dropped', "threshold = 1\ninput('x')\nthreshold", { needsJspi: true, bindGlobals: true });
// 전역 사전을 잇지 않은 실행에는 값을 넣지 않는다(쌓인 값은 버린다).
await step('params_without_bind', "threshold = 1\ninput('1')\nthreshold", { needsJspi: true });
// get()도 입력 확인 지점이라 양보 없이(제한 모드에서도) 값이 들어간다.
await step('params_get_checkpoint', "import apc_runtime\nthreshold = 1\napc_runtime.get('nothing')\nthreshold", {
  bindGlobals: true,
  setup: () => bridge.pushEvent('lab.params', { name: 'threshold', value: 3, type: 'int' }),
});
await step(
  'catch_keyboard_interrupt',
  "import time\ntry:\n    while True:\n        time.sleep(0.02)\nexcept KeyboardInterrupt as e:\n    result = 'caught ' + str(e)\nresult",
  { stopAfterMs: 30, needsJspi: true },
);
// exit()는 SystemExit로 끝난다(정상 종료로 다룬다). 그 뒤의 줄은 실행되지 않고, 실행기는 계속 쓸 수 있어야 한다.
await step('exit_call', "print('앞')\nexit()\nprint('뒤')");
await step('sys_exit_code', 'import sys\nsys.exit(3)');
await step('still_alive', "print('계속')\n1 + 1");
bridge.setLimited(true);
await step('limited_print', "print('제한 모드')\n1 + 1");
await step('limited_sleep', 'import time\nt0 = time.time()\ntime.sleep(0.02)\nround((time.time() - t0) * 1000)');
await step('limited_input', "input('x')");
bridge.setLimited(!jspi);
out.pendingRequests = bridge.pendingRequestCount();
out.notices = posted.filter((message) => message.type === 'notice').map((message) => message.text);
out.noticeCount = out.notices.length;
process.stdout.write(`\n${JSON.stringify(out)}\n`);
process.exit(0);
