// Node.js 실제 Pyodide 314.0.7로 컴퓨터 쪽 실습실의 asyncio(src/lab/python/apc_asyncio.py — 판 1.2.0, PROGRESS 미해결 223)를 검사하는 도우미.
// tests/unit/lab/pyodide-asyncio-pc.test.ts가 `node --experimental-wasm-jspi 이 파일 <저장소 뿌리>`로 띄우고 마지막 줄의 JSON 한 줄을 읽는다.
//
// 영상처리 실습실 워커와 같게 준비한다: 다리(bridge.ts) → 붙박이 .py(src/lab/python/)와 영상처리 실습실에 붙는 흉내 모듈 폴더의 .py·shims
// (manifest의 labs가 vision 또는 '*' — 가상 보드 파일은 없다) → apc_runtime.install() → register_shims. 실행 하나는 워커 run()처럼
// beginRun → install_available → reset_for_run → 전역 잇기 → runPythonAsync → run_idle → unbind(마무리 훅) → endRun.
// [정지]는 실제 시간이 아니라 진행으로 누른다(stopWhen — 학생 stdout에 그 글이 나오면, DECISIONS C74 ②). stopAfterMs는 안전망.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { finishJson } from '../../helpers/finish-json.mjs';

const rootDir = process.argv[2] ?? process.cwd();
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);
const { createBridge } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'bridge.ts')).href);

const LAB_ID = 'vision';
const out = { steps: {}, escaped: [], notices: [] };

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

// ── 영상처리 실습실의 파이썬 파일·shims ──
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

const pyodide = await loadPyodide();
let stdout = '';
let stderr = '';
let stdoutHook = null;
pyodide.setStdout({
  write: (buffer) => {
    stdout += new TextDecoder().decode(buffer);
    stdoutHook?.();
    return buffer.length;
  },
});
pyodide.setStderr({
  write: (buffer) => {
    stderr += new TextDecoder().decode(buffer);
    return buffer.length;
  },
});
let jspi = false;
const bridge = createBridge({
  post: (message) => {
    if (message.type === 'notice') out.notices.push(message.text);
    if (message.type === 'request') setTimeout(() => bridge.rejectRequest(message.requestId, `화면이 "${message.kind}" 요청을 처리하지 못해요.`), 2);
  },
  now: () => performance.now(),
  canRunSync: () => jspi,
});
pyodide.registerJsModule('_apc_bridge', bridge.api);
pyodide.FS.mkdirTree('/apc');
for (const [file, full] of pythonFiles) pyodide.FS.writeFile(`/apc/${file}`, fs.readFileSync(full, 'utf8'));
// 사이트 모듈(/apc)과 학생 작업 폴더의 내 모듈 — 누가 어느 asyncio를 받는지
pyodide.FS.writeFile('/apc/zz_site_probe.py', 'import asyncio, sys\nIS_REAL = asyncio is sys.modules["asyncio"]\n');
pyodide.FS.mkdirTree('/home/pyodide');
pyodide.FS.writeFile('/home/pyodide/my_async_helper.py', 'import asyncio, sys\nIS_THIN = asyncio is not sys.modules["asyncio"]\n');
jspi = await pyodide.runPythonAsync(
  ['import sys', "sys.path.insert(0, '/apc')", 'import apc_runtime', 'apc_runtime.install()', 'from pyodide.ffi import can_run_sync', 'can_run_sync()'].join('\n'),
);
bridge.setLimited(!jspi);
out.jspi = jspi;
out.labHasBoard = pythonFiles.has('apc_board.py');
pyodide.runPython(`import json, apc_shims\napc_shims.register_shims(json.loads(${JSON.stringify(JSON.stringify(shimTable))}))`);

/**
 * 워커 run()과 같은 차례로 학생 코드를 한 번 돌린다.
 * stopWhen(stdout): 학생 stdout이 이 조건에 맞으면 [정지](진행으로). stopAfterMs: 안전망(그때까지 안 맞으면 [정지]).
 * setup(): 전역을 이은 뒤·코드를 돌리기 직전(조절 패널 값 넣기 등).
 * afterMs: 끝난 뒤 이만큼(실제 시간) 기다렸다가 그사이 stdout을 따로 적는다(끝난 뒤에도 작업이 뒤에서 도는지).
 */
async function step(name, code, { stopWhen, stopAfterMs, setup, afterMs = 0 } = {}) {
  const record = {};
  const stdoutBefore = stdout.length;
  const stderrBefore = stderr.length;
  const escapedBefore = out.escaped.length;
  bridge.beginRun();
  let stopAt = null;
  const requestStop = () => {
    if (stopAt === null) {
      stopAt = performance.now();
      bridge.requestStop();
    }
  };
  stdoutHook = () => {
    if (stopWhen && stopWhen(stdout.slice(stdoutBefore))) requestStop();
  };
  const timer = stopAfterMs === undefined ? undefined : setTimeout(requestStop, stopAfterMs);
  const t0 = performance.now();
  const shims = pyodide.runPython('import apc_shims\n[apc_shims.install_available(), apc_shims.last_failures()]').toJs();
  record.shims = { installed: shims[0], failures: shims[1] };
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  const globals = pyodide.toPy({ __name__: '__main__', __file__: 'main.py' });
  pyodide.runPython('__import__("apc_runtime").bind_run_globals(globals())', { globals });
  setup?.();
  try {
    const value = await pyodide.runPythonAsync(code, { globals, filename: 'main.py', dedent: false });
    record.value = value && typeof value.toJs === 'function' ? value.toJs() : value;
    await pyodide.runPythonAsync('__import__("apc_runtime").run_idle()', { globals, filename: '<board-idle>', dedent: false });
  } catch (error) {
    record.errorType = error && error.type;
    record.errorMessage = lastLine(error);
  } finally {
    clearTimeout(timer);
    stdoutHook = null;
    pyodide.runPython('import apc_runtime\napc_runtime.unbind_run_globals()');
    globals.destroy();
    pyodide.runPython('import sys\nsys.stdout.flush()\nsys.stderr.flush()');
    record.stopped = bridge.endRun().stopped;
  }
  const doneAt = performance.now();
  record.ms = Math.round(doneAt - t0);
  if (stopAt !== null) record.stopLatencyMs = Math.round(doneAt - stopAt);
  record.stdout = stdout.slice(stdoutBefore);
  const afterStart = stdout.length;
  if (afterMs > 0) await sleepMs(afterMs);
  await sleepMs(20);
  record.stdoutAfter = stdout.slice(afterStart);
  record.stderr = stderr.slice(stderrBefore);
  record.escaped = out.escaped.slice(escapedBefore);
  out.steps[name] = record;
  return record;
}

const has = (text) => (seen) => seen.includes(text);

// ⓐ 미해결 223 재현 코드 그대로: asyncio.run + while True: await asyncio.sleep(0.3) — [정지]가 곧바로 KeyboardInterrupt(전엔 1초 넘어 killed)
await step(
  'repro_223',
  ['import asyncio', 'async def main():', '    n = 0', '    while True:', '        n += 1', "        print('tick', n)", '        await asyncio.sleep(0.3)', 'asyncio.run(main())'].join('\n'),
  { stopWhen: has('tick 2\n'), stopAfterMs: 10_000, afterMs: 400 },
);

// ⓑ 맨 바깥 await 반복(asyncio.run 없이)도 [정지]
await step('top_level_await_loop', ['import asyncio', 'n = 0', 'while True:', '    n += 1', "    print('t', n)", '    await asyncio.sleep(0.1)'].join('\n'), {
  stopWhen: has('t 2\n'),
  stopAfterMs: 10_000,
});

// ⓒ sleep 없이 Event·Queue만 기다려도 [정지](run 옆의 지켜보는 작업)
await step(
  'event_wait_stop',
  ['import asyncio', 'async def main():', '    ev = asyncio.Event()', "    print('기다림')", '    await ev.wait()', 'asyncio.run(main())'].join('\n'),
  { stopWhen: has('기다림\n'), stopAfterMs: 10_000 },
);
await step(
  'queue_wait_stop',
  ['import asyncio', 'async def main():', '    q = asyncio.Queue()', "    print('받기 기다림')", '    await q.get()', 'asyncio.run(main())'].join('\n'),
  { stopWhen: has('받기 기다림\n'), stopAfterMs: 10_000 },
);

// ⓓ 작업 여럿이 함께 자다가 [정지] — 콘솔에 "Unhandled exception"·"never retrieved"가 남지 않는다
await step(
  'stop_many_tasks',
  [
    'import asyncio',
    'async def worker(name, delay):',
    '    while True:',
    '        print(name)',
    '        await asyncio.sleep(delay)',
    'async def main():',
    "    asyncio.create_task(worker('가', 0.05))",
    "    asyncio.get_running_loop().create_task(worker('나', 0.07))",
    "    await worker('다', 0.09)",
    'asyncio.run(main())',
  ].join('\n'),
  { stopWhen: (seen) => (seen.match(/다\n/gu) ?? []).length >= 2, stopAfterMs: 10_000, afterMs: 300 },
);

// ⓔ 정지 뒤 다시 [실행] — 평범한 asyncio 코드가 끝까지(gather·Queue·wait_for)
await step(
  'gather_queue_ok',
  [
    'import asyncio',
    'async def producer(q):',
    '    for i in range(5):',
    '        await q.put(i)',
    '        await asyncio.sleep(0.01)',
    '    await q.put(None)',
    'async def consumer(q):',
    '    got = []',
    '    while (item := await q.get()) is not None:',
    '        got.append(item * 10)',
    '    return got',
    'async def main():',
    '    q = asyncio.Queue()',
    '    _, got = await asyncio.gather(producer(q), consumer(q))',
    '    try:',
    '        await asyncio.wait_for(asyncio.sleep(10), 0.05)',
    "        timed = 'no'",
    '    except TimeoutError:',
    "        timed = 'timeout'",
    '    async with asyncio.timeout(0.05):',
    '        pass',
    '    return got, timed',
    'asyncio.run(main())',
  ].join('\n'),
);

// ⓕ asyncio.run이 끝나면 남은 작업을 멈추고(finally까지) — 진짜 파이썬처럼. 실행이 끝난 뒤 뒤에서 더 돌지 않는다
await step(
  'leftover_cancelled',
  [
    'import asyncio, time',
    'ticks = []',
    'async def bg(tag):',
    '    try:',
    '        while True:',
    '            ticks.append(tag)',
    '            await asyncio.sleep(0.05)',
    '    finally:',
    "        ticks.append(tag + ':멈춤')",
    'async def main():',
    "    asyncio.create_task(bg('a'))",
    "    asyncio.get_event_loop().create_task(bg('b'))",
    '    await asyncio.sleep(0.2)',
    'asyncio.run(main())',
    'after_run = len(ticks)',
    'time.sleep(0.3)',
    "[sorted(t for t in ticks if t.endswith(':멈춤')), len(ticks) == after_run]",
  ].join('\n'),
);

// ⓖ loop.run_forever()는 loop.stop()까지 기다린다(WebLoop는 곧바로 돌아왔다), [정지]로도 끝난다
await step(
  'run_forever_until_stop',
  [
    'import asyncio',
    'loop = asyncio.get_event_loop()',
    'hits = []',
    'async def tick():',
    '    while True:',
    '        hits.append(1)',
    '        await asyncio.sleep(0.05)',
    'loop.create_task(tick())',
    'loop.call_later(0.3, loop.stop)',
    'loop.run_forever()',
    'len(hits) >= 3',
  ].join('\n'),
);
await step('run_forever_stop_button', ['import asyncio', 'loop = asyncio.new_event_loop()', "print('영원히')", 'loop.run_forever()'].join('\n'), {
  stopWhen: has('영원히\n'),
  stopAfterMs: 10_000,
});

// ⓗ 이름은 진짜 asyncio 그대로(바꾼 것은 sleep·run·create_task·ensure_future·루프 얻기뿐), 하위 모듈 import도 된다
await step(
  'names_same_as_real',
  [
    'import asyncio, sys, inspect',
    'real = sys.modules["asyncio"]',
    'from asyncio import sleep, gather, Queue',
    'import asyncio.queues',
    '[asyncio is not real, asyncio.__name__, gather is real.gather, Queue is real.Queue, asyncio.Event is real.Event,',
    ' asyncio.TimeoutError is real.TimeoutError, asyncio.CancelledError is real.CancelledError, asyncio.TaskGroup is real.TaskGroup,',
    ' sleep is not real.sleep, asyncio.queues is real.queues, "gather" in dir(asyncio), "sleep" in asyncio.__all__,',
    ' inspect.iscoroutinefunction(asyncio.sleep), asyncio.run is not real.run]',
  ].join('\n'),
);

// ⓘ 사이트 모듈(/apc)은 진짜 asyncio, 학생 작업 폴더의 내 모듈은 학생용
await step('who_gets_which', ['import zz_site_probe, my_async_helper', '[zz_site_probe.IS_REAL, my_async_helper.IS_THIN]'].join('\n'));

// ⓙ sleep 값 규칙은 진짜와 같다(음수·0은 한 번 양보 뒤 result, NaN·글자는 같은 오류)
await step(
  'sleep_rules',
  [
    'import asyncio, sys',
    'real = sys.modules["asyncio"]',
    'async def err(f, *a):',
    '    try:',
    '        await f(*a)',
    "        return 'ok'",
    '    except Exception as e:',
    "        return type(e).__name__ + ': ' + str(e)",
    "nan = float('nan')",
    "[await asyncio.sleep(-1, 'neg'), await asyncio.sleep(0, 'zero'), await asyncio.sleep(0.01, 'short'),",
    " await err(asyncio.sleep, nan) == await err(real.sleep, nan), await err(asyncio.sleep, 'a') == await err(real.sleep, 'a'),",
    " await err(asyncio.sleep, 'a')]",
  ].join('\n'),
);

// ⓚ 흔한 실수 asyncio.run(main) — 진짜와 같은 TypeError
await step('run_not_coroutine', ['import asyncio', 'async def main():', '    pass', 'asyncio.run(main)'].join('\n'));

// ⓛ [정지]가 아닌 작업 예외는 진짜처럼 콘솔에 남고, 학생이 정한 예외 처리기는 그 예외를 받는다
await step(
  'task_error_printed',
  ['import asyncio', 'async def bad():', "    raise ValueError('보기 오류')", 'async def main():', '    asyncio.create_task(bad())', '    await asyncio.sleep(0.05)', 'asyncio.run(main())', "'done'"].join(
    '\n',
  ),
);
await step(
  'user_exception_handler',
  [
    'import asyncio',
    'seen = []',
    'loop = asyncio.get_event_loop()',
    "loop.set_exception_handler(lambda l, ctx: seen.append(type(ctx.get('exception')).__name__))",
    'async def bad():',
    "    raise ValueError('x')",
    'async def main():',
    '    asyncio.create_task(bad())',
    '    await asyncio.sleep(0.05)',
    'asyncio.run(main())',
    'seen',
  ].join('\n'),
);

// ⓜ 조절 패널 값은 await asyncio.sleep 뒤에도 전역 변수에 들어간다(time.sleep과 같은 입력 확인 지점)
await step(
  'params_in_asyncio_loop',
  ['import asyncio', 'threshold = 1', 'seen = []', 'async def main():', '    for _ in range(4):', '        await asyncio.sleep(0.03)', '        seen.append(threshold)', 'asyncio.run(main())', 'seen'].join(
    '\n',
  ),
  { setup: () => bridge.pushEvent('lab.params', { name: 'threshold', value: 7, type: 'int' }) },
);

// ⓝ 제한 모드(JSPI 없음): asyncio.run은 기다릴 수 없다고 한국어로, 맨 바깥 await sleep은 그대로 된다
bridge.setLimited(true);
await step('limited_run', ['import asyncio', 'async def main():', '    await asyncio.sleep(0.01)', 'asyncio.run(main())'].join('\n'));
await step('limited_top_level_sleep', ['import asyncio', "await asyncio.sleep(0.05, 'slept')"].join('\n'));
bridge.setLimited(!jspi);

// ⓞ 다 끝난 뒤 한 번 더 — 정지·제한 모드를 거쳐도 다시 된다
await step('run_again', ['import asyncio', "asyncio.run(asyncio.sleep(0.01, 'again'))"].join('\n'));

out.notices = out.notices.filter((text) => !text.startsWith('['));
finishJson(out);
