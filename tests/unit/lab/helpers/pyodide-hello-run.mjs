// Node.js에서 실제 Pyodide 314.0.7로 흉내 모듈 폴더 규약(src/lab/modules/<id>/)의 파이썬 쪽을 검사하는 도우미 스크립트(src/lab/README.md 4절).
// tests/unit/lab/pyodide-hello.test.ts가 `node --experimental-wasm-jspi 이 파일 <저장소 뿌리>`로 띄우고 마지막 줄의 JSON 한 줄을 읽는다.
//
// 워커(src/lab/runtime/worker.ts)와 같은 순서로 준비한다: 다리 등록 → 붙박이 .py(src/lab/python/)와 모듈 폴더의 .py(src/lab/modules/*/)를
// /apc에 쓰기 → apc_runtime.install() → apc_shims.register_shims(모듈 폴더 표) → 실행마다 install_available()·reset_for_run().
// 화면 흉내: 'hello.greet' 요청에 '안녕, <name>!'으로 답하고, 'hello.wave' 이벤트를 세고, hello.name 값과 hello.clicks 채널을 넣는다.
// 새 모듈은 이 파일을 복사해 요청·이벤트 처리와 단계(step)를 바꾼다. 흉내 모듈 파이썬 파일의 동기 진입점 규칙(PROGRESS 미해결 25번)도 여기서 본다.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.argv[2] ?? process.cwd();
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);
const { createBridge } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'bridge.ts')).href);

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
  process.stdout.write(`\n${JSON.stringify(out)}\n`);
  process.exit(0);
}

const pyodide = await loadPyodide();
let jspi = false;
let stdout = '';

const bridge = createBridge({
  post: (message) => {
    if (message.type === 'request') {
      out.requests.push({ kind: message.kind, payload: message.payload });
      setTimeout(() => {
        if (message.kind === 'hello.greet') {
          const name = message.payload && typeof message.payload.name === 'string' && message.payload.name.trim() !== '' ? message.payload.name.trim() : '친구';
          bridge.resolveRequest(message.requestId, `안녕, ${name}!`);
        } else {
          bridge.rejectRequest(message.requestId, `화면이 "${message.kind}" 요청을 처리하지 못해요.`);
        }
      }, 5);
    } else if (message.type === 'event') {
      out.events.push({ kind: message.kind, payload: message.payload });
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

// 붙박이 + 모듈 폴더의 .py (src/lab/python/modules.ts와 같은 규칙: 이름은 저장소 전체에서 하나)
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
out.shimTable = pyodide.runPython("import json, apc_shims\njson.dumps(apc_shims.register_shims({}))");
// 같은 패키지를 다른 이름으로 다시 등록하면 오류
try {
  pyodide.runPython("import apc_shims\napc_shims.register_shims({'cv2': 'apc_other'})");
  out.duplicateShim = 'no-error';
} catch (error) {
  out.duplicateShim = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
}

async function step(name, code, { setup } = {}) {
  stdout = '';
  const eventsBefore = out.events.length;
  const record = { ms: 0, stdout: '', events: 0 };
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
  record.events = out.events.length - eventsBefore;
  out.steps[name] = record;
}

if (jspi) {
  await step('greet', "import apc_hello\napc_hello.greet('세계')");
  await step('greet_default', 'import apc_hello\napc_hello.greet("")');
  await step('wave', 'import apc_hello\napc_hello.wave(2)\napc_hello.wave()\n"done"');
  bridge.setValue('hello.name', '민수');
  await step('name', "import apc_hello\n[apc_hello.name('기본'), apc_hello.name()]");
  bridge.setValue('hello.name', '');
  await step('name_empty', "import apc_hello\napc_hello.name('기본')");
  // 실행 전에 쌓인 누른 기록은 reset(_reset의 drain)이 버리고, 실행 중에 쌓인 것만 나온다
  bridge.pushEvent('hello.clicks', 1);
  await step('clicks', 'import apc_hello\napc_hello.clicks()', {
    setup: () => {
      bridge.pushEvent('hello.clicks', 2);
      bridge.pushEvent('hello.clicks', 3);
    },
  });
  // 틱 훅: 입력 확인 지점(get)에서 불리고, 양보 없는 훅 오류는 콘솔 알림으로만
  await step(
    'tick_hook',
    [
      'import apc_runtime, apc_hello',
      'count = {"n": 0}',
      'def tick():',
      '    count["n"] += 1',
      'def bad():',
      '    raise ValueError("훅 오류")',
      'apc_runtime.register_tick_hook(tick)',
      'apc_runtime.register_tick_hook(tick)',
      'apc_runtime.register_tick_hook(bad)',
      'for _ in range(3):',
      '    apc_hello.name()',
      'count["n"]',
    ].join('\n'),
  );
}

// 동기 진입점 규칙: reset_for_run(모듈의 _reset 포함)을 마지막 양보 뒤 16ms가 지난 뒤 동기 runPython으로 불러도 스택 전환 오류가 없어야 한다.
await new Promise((resolve) => setTimeout(resolve, 40));
try {
  bridge.pushEvent('hello.clicks', 9);
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  out.syncEntrypointReset = 'ok';
} catch (error) {
  out.syncEntrypointReset = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
}
out.leftoverClicks = pyodide.runPython("import apc_runtime\napc_runtime.drain('hello.clicks')").toJs();

finish();
