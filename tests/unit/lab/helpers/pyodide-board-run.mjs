// Node.js에서 실제 Pyodide 314.0.7로 가상 ESP32 보드 모듈(src/lab/modules/board/)의 파이썬 쪽을 검사하는 도우미 스크립트(PLAN §8.3 P3-01, PD-14).
// tests/unit/lab/pyodide-board.test.ts가 `node --experimental-wasm-jspi 이 파일 <저장소 뿌리>`로 띄우고 마지막 줄의 JSON 한 줄을 읽는다.
//
// ESP32 실습실 워커(src/lab/runtime/worker.ts, labId 'esp32')와 같은 순서로 준비한다:
//   다리 등록 → 붙박이 .py(src/lab/python/) + ESP32 실습실에 붙는 모듈 폴더(manifest labs가 '*' 또는 'esp32')의 .py(하위 폴더 포함)를 /apc에 쓰기
//   → apc_runtime.install() → apc_shims.register_shims(그 모듈들의 shims) → 실행마다 beginRun·install_available·reset_for_run·bind_run_globals
//   → runPythonAsync(학생 코드) → runPythonAsync(run_idle) → unbind·endRun.
// 화면 흉내: board.inputs(최신 값)·board.input(쌓이는 값)을 단계마다 넣고, board.state 이벤트를 모은다.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.cwd());
const limitedOnly = process.argv.includes('--limited');
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);
const { createBridge } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'bridge.ts')).href);

const out = { steps: {}, events: [], notices: [], files: [], shims: {}, stderr: '' };

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

// ── ESP32 실습실에 붙는 모듈 폴더 고르기(manifest.ts의 labs·shims를 글자로 읽는다 — Vite 없이) ──
const modulesDir = path.join(rootDir, 'src', 'lab', 'modules');
const esp32Folders = [];
for (const folder of fs.readdirSync(modulesDir, { withFileTypes: true })) {
  if (!folder.isDirectory()) continue;
  const manifestPath = path.join(modulesDir, folder.name, 'manifest.ts');
  if (!fs.existsSync(manifestPath)) continue;
  const text = fs.readFileSync(manifestPath, 'utf8');
  const labs = /labs:\s*('\*'|\[[^\]]*\])/u.exec(text)?.[1] ?? '';
  if (labs === "'*'" || /'esp32'/u.test(labs)) {
    esp32Folders.push(folder.name);
    const shims = /shims:\s*\{([^}]*)\}/u.exec(text)?.[1] ?? '';
    for (const match of shims.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'([a-z0-9_]+)'/gu)) {
      out.shims[match[1]] = match[2];
    }
  }
}
out.folders = esp32Folders.sort();

function pythonFilesUnder(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...pythonFilesUnder(full));
    else if (entry.name.endsWith('.py')) found.push(full);
  }
  return found;
}

const pyodide = await loadPyodide();
let jspi = false;
let stdout = '';
let stderr = '';
/** 단계가 정한 "파이썬이 이 표시를 보내면 할 일"(board.device {mark}) — 시간 대신 코드 진행에 맞춰 입력을 넣어 부하에 흔들리지 않게 */
let onMark = null;
const bridge = createBridge({
  post: (message) => {
    if (message.type === 'event' && message.kind === 'board.device' && message.payload && typeof message.payload.mark === 'string') {
      onMark?.(message.payload.mark);
      return;
    }
    if (message.type === 'event') out.events.push({ kind: message.kind, payload: message.payload });
    else if (message.type === 'notice') out.notices.push(message.text);
    else if (message.type === 'request') setTimeout(() => bridge.rejectRequest(message.requestId, `화면이 "${message.kind}" 요청을 처리하지 못해요.`), 5);
  },
  now: () => performance.now(),
  canRunSync: () => jspi,
});
pyodide.setStdout({ write: (buffer) => ((stdout += new TextDecoder().decode(buffer)), buffer.length) });
pyodide.setStderr({ write: (buffer) => ((stderr += new TextDecoder().decode(buffer)), buffer.length) });
pyodide.registerJsModule('_apc_bridge', bridge.api);
pyodide.FS.mkdirTree('/apc');
const files = new Map();
for (const file of fs.readdirSync(path.join(rootDir, 'src', 'lab', 'python'))) {
  if (file.endsWith('.py')) files.set(file, path.join(rootDir, 'src', 'lab', 'python', file));
}
for (const folder of esp32Folders) {
  for (const full of pythonFilesUnder(path.join(modulesDir, folder))) {
    const name = path.basename(full);
    if (files.has(name)) {
      out.duplicate = name;
      finish();
    }
    files.set(name, full);
  }
}
for (const [name, full] of files) {
  pyodide.FS.writeFile(`/apc/${name}`, fs.readFileSync(full, 'utf8'));
  out.files.push(name);
}
out.files.sort();

jspi = await pyodide.runPythonAsync(
  ['import sys', "sys.path.insert(0, '/apc')", 'import apc_runtime', 'apc_runtime.install()', 'from pyodide.ffi import can_run_sync', 'can_run_sync()'].join('\n'),
);
bridge.setLimited(limitedOnly || !jspi);
out.jspi = jspi;
pyodide.runPython(`import json, apc_shims\napc_shims.register_shims(json.loads(${JSON.stringify(JSON.stringify(out.shims))}))`);

const IDLE_CODE = '__import__("apc_runtime").run_idle()';

/**
 * 워커의 run()과 같은 순서로 코드 한 번을 돌린다.
 * options.inputs: 실행 전 board.inputs 값 / options.during: 실행 중 [ms, 함수] 목록 / options.stopAfterMs: 그 뒤 [정지] / options.idle: run_idle까지
 */
async function step(name, code, options = {}) {
  stdout = '';
  stderr = '';
  const eventsBefore = out.events.length;
  const noticesBefore = out.notices.length;
  const record = { ms: 0 };
  if (options.inputs !== undefined) bridge.setValue('board.inputs', options.inputs);
  if (options.wiring !== undefined) bridge.setValue('board.wiring', options.wiring);
  const startedAt = performance.now();
  bridge.beginRun();
  const timers = [];
  for (const [ms, action] of options.during ?? []) timers.push(setTimeout(action, ms));
  if (options.stopAfterMs !== undefined) timers.push(setTimeout(() => bridge.requestStop(), options.stopAfterMs));
  onMark = options.onMark ?? null;
  const globals = pyodide.toPy({ __name__: '__main__', __file__: 'main.py' });
  try {
    pyodide.runPython('import apc_shims\napc_shims.install_available()');
    pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
    pyodide.runPython('__import__("apc_runtime").bind_run_globals(globals())', { globals });
    const value = await pyodide.runPythonAsync(code, { globals, filename: 'main.py' });
    record.value = value && typeof value.toJs === 'function' ? value.toJs({ dict_converter: Object.fromEntries }) : value;
    if (value && typeof value.destroy === 'function') value.destroy();
    if (options.idle) {
      record.idleStartedMs = Math.round(performance.now() - startedAt);
      await pyodide.runPythonAsync(IDLE_CODE, { globals, filename: '<board-idle>' });
    }
  } catch (error) {
    record.errorType = error && error.type ? error.type : 'JsError';
    record.errorMessage = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
  } finally {
    try {
      pyodide.runPython('import apc_runtime\napc_runtime.unbind_run_globals()');
    } catch {
      // 실행 뒤 정리 실패는 결과에 영향 없음
    }
    globals.destroy();
    for (const timer of timers) clearTimeout(timer);
    onMark = null;
    bridge.endRun();
  }
  record.ms = Math.round(performance.now() - startedAt);
  record.stdout = stdout;
  record.stderr = stderr;
  record.events = out.events.slice(eventsBefore).filter((event) => event.kind === 'board.state').map((event) => event.payload);
  record.notices = out.notices.slice(noticesBefore);
  out.steps[name] = record;
}

if (limitedOnly) {
  // 제한 모드(JSPI 없음): 기다리지 못해도 핀·짧은 sleep·ticks가 돈다(브라우저가 멈춘 채 기다린다).
  await step('limited', ['from machine import Pin', 'import time', 'led = Pin(2, Pin.OUT)', 'led.on()', 'time.sleep_ms(30)', 'led.value()'].join('\n'));
  finish();
}

await step(
  'pin_basic',
  [
    'from machine import Pin',
    'led = Pin(2, Pin.OUT)',
    'led.on()',
    'a = led.value()',
    'led.off()',
    'b = led.value()',
    'led(1)',
    'c = led()',
    'led.toggle()',
    'd = led.value()',
    'led.value(True)',
    '[a, b, c, d, led.value(), Pin(2) is led, repr(Pin(2)), Pin.IN, Pin.OUT, Pin.OPEN_DRAIN, Pin.PULL_UP, Pin.PULL_DOWN, Pin.IRQ_RISING, Pin.IRQ_FALLING, Pin.WAKE_LOW, Pin.WAKE_HIGH]',
  ].join('\n'),
);

await step(
  'pin_errors',
  [
    'from machine import Pin',
    'r = []',
    'for args in [(24,), (28,), (40,), (-1,), (2.0,), ("D2",), (True,), (34, Pin.OUT), (39, Pin.OPEN_DRAIN), (2, "x"), (2, None, 2.5)]:',
    '    try:',
    '        Pin(*args)',
    '        r.append("ok")',
    '    except Exception as e:',
    '        r.append(type(e).__name__ + ": " + str(e))',
    'p = Pin(34, Pin.IN)',
    'r.append(repr(p))',
    'r.append(repr(Pin(4, Pin.IN, Pin.PULL_UP)))',
    'r.append(repr(Pin(5, Pin.OUT, drive=Pin.DRIVE_3)))',
    'r.append(repr(Pin(6)))',
    'r',
  ].join('\n'),
);

await step(
  'input_levels',
  [
    'from machine import Pin',
    'import time, apc_runtime',
    'b = Pin(0, Pin.IN)',
    'first = b.value()',
    "apc_runtime.emit('board.device', {'mark': 'first-read'})",
    'time.sleep_ms(150)',
    '[first, b.value(), Pin(4, Pin.IN, Pin.PULL_UP).value(), Pin(5, Pin.IN, Pin.PULL_DOWN).value()]',
  ].join('\n'),
  {
    inputs: { pins: { 0: 'pullup' } },
    // 첫 읽기가 끝났다는 표시를 받은 뒤에 버튼을 누른다(실행 시작이 느려도 첫 값은 실행 전 상태 1)
    onMark: (mark) => {
      if (mark === 'first-read') setTimeout(() => bridge.pushEvent('board.input', { pin: 0, drive: 0 }), 10);
    },
  },
);

await step(
  'polling_without_sleep',
  ['from machine import Pin', 'b = Pin(0, Pin.IN)', 'led = Pin(2, Pin.OUT)', 'n = 0', 'while b.value() == 1:', '    n += 1', 'led.on()', '[n > 0, led.value()]'].join('\n'),
  { inputs: { pins: { 0: 'pullup' } }, during: [[80, () => bridge.pushEvent('board.input', { pin: 0, drive: 0 })]] },
);

await step(
  'irq',
  [
    'from machine import Pin',
    'import time',
    'hits = []',
    'b = Pin(0, Pin.IN)',
    "b.irq(trigger=Pin.IRQ_FALLING, handler=lambda p: hits.append(('fall', p is b, p.value())))",
    't = Pin(4, Pin.IN)',
    "t.irq(lambda p: hits.append(('both', p.value())))",
    'time.sleep_ms(480)',
    'b.irq(handler=None)',
    'hits',
  ].join('\n'),
  {
    // 변화 사이를 100ms씩 벌린다: 콜백이 다음 변화 전에(20ms 조각 안에) 불려야 콜백 안의 p.value()가 그 순간 값이다.
    inputs: { pins: { 0: 'pullup', 4: 0 } },
    during: [
      [30, () => bridge.pushEvent('board.input', { pin: 0, drive: 0 })],
      [130, () => bridge.pushEvent('board.input', { pin: 4, drive: 1 })],
      [230, () => bridge.pushEvent('board.input', { pin: 0, drive: 'pullup' })],
      [330, () => bridge.pushEvent('board.input', { pin: 4, drive: 0 })],
    ],
  },
);

await step(
  'time_functions',
  [
    'import time, utime',
    'r = [time is utime]',
    't0 = time.ticks_ms()',
    'time.sleep_ms(50)',
    'r.append(time.ticks_diff(time.ticks_ms(), t0) >= 50)',
    'r.append(time.ticks_diff(5, 2**30 - 5))',
    'r.append(time.ticks_diff(2**30 - 5, 5))',
    'r.append(time.ticks_add(2**30 - 1, 1))',
    'r.append(time.ticks_add(0, -(2**29) + 1))',
    'for delta in (2**29, -(2**29)):',
    '    try:',
    '        time.ticks_add(0, delta)',
    '        r.append("no error")',
    '    except OverflowError as e:',
    '        r.append(str(e))',
    'r.append(list(time.gmtime(0)))',
    'r.append(list(time.gmtime(-1)))',
    'r.append(list(time.localtime(789_012_345)))',
    'r.append(time.mktime((2000, 1, 1, 0, 0, 0, 5, 1)))',
    'r.append(time.mktime((1999, 12, 31, 23, 59, 59, 4, 365)))',
    'r.append(time.mktime((2024, 13, 1, 0, 0, 0, 0, 0)) == time.mktime((2025, 1, 1, 0, 0, 0, 0, 0)))',
    'r.append(time.mktime([2024, 3, 0, 0, 0, 0, 0, 0]) == time.mktime((2024, 2, 29, 0, 0, 0, 0, 0)))',
    'r.append(time.mktime((2024, 2, 29, 25, 61, 61, 0, 0, 0)) == time.mktime((2024, 3, 1, 2, 2, 1, 0, 0)))',
    'r.append(time.localtime is time.gmtime)',
    'r.append(type(time.time()) is int and time.localtime()[0] >= 2026)',
    'r.append(hasattr(time, "perf_counter") or hasattr(time, "monotonic"))',
    'for bad in [lambda: time.sleep_ms(1.5), lambda: time.mktime((1, 2, 3)), lambda: time.gmtime(1.5), lambda: time.sleep(-1)]:',
    '    try:',
    '        bad()',
    '        r.append("no error")',
    '    except Exception as e:',
    '        r.append(type(e).__name__ + ": " + str(e))',
    'r',
  ].join('\n'),
);

await step(
  'virtual_clock',
  [
    'import time',
    't0 = time.ticks_us()',
    'for _ in range(200):',
    '    time.sleep_ms(1)',
    'many = time.ticks_diff(time.ticks_us(), t0)',
    't1 = time.ticks_ms()',
    'time.sleep(0.0005)',
    'tiny = time.ticks_diff(time.ticks_ms(), t1)',
    't2 = time.ticks_ms()',
    'time.sleep(0.25)',
    'quarter = time.ticks_diff(time.ticks_ms(), t2)',
    'time.sleep_us(3)',
    '[many, tiny, quarter]',
  ].join('\n'),
);

await step(
  'timer_periodic',
  [
    'from machine import Timer',
    'import time',
    'calls = []',
    't = Timer(0)',
    't.init(period=20, mode=Timer.PERIODIC, callback=lambda tm: calls.append((tm is t, time.ticks_ms())))',
    'time.sleep_ms(105)',
    'n = len(calls)',
    'v = t.value()',
    'text = repr(t)',
    't.deinit()',
    'time.sleep_ms(50)',
    'gaps = [calls[i + 1][1] - calls[i][1] for i in range(len(calls) - 1)]',
    '[n, len(calls), all(same for same, _ in calls), gaps, 0 <= v < 20, text, repr(Timer(1)), Timer(0) is t, Timer(-1) is Timer(-1), Timer.PERIODIC, Timer.ONE_SHOT]',
  ].join('\n'),
);

await step(
  'timer_one_shot_and_errors',
  [
    'from machine import Timer',
    'import time',
    'calls = []',
    'Timer(2, mode=Timer.ONE_SHOT, period=30, callback=lambda t: calls.append(1))',
    'time.sleep_ms(120)',
    'r = [len(calls)]',
    'for make in [lambda: Timer(4), lambda: Timer(0).init(100), lambda: Timer(0).init(period=100, hard=True), lambda: Timer(0).init(period=0), lambda: Timer(-1).init(freq=0)]:',
    '    try:',
    '        make()',
    '        r.append("no error")',
    '    except Exception as e:',
    '        r.append(type(e).__name__ + ": " + str(e))',
    'fast = []',
    'Timer(3).init(freq=100, callback=lambda t: fast.append(1))',
    'time.sleep_ms(55)',
    'r.append(len(fast))',
    'r',
  ].join('\n'),
);

await step(
  'callback_error_keeps_running',
  [
    'from machine import Timer',
    'import time',
    'count = [0]',
    'def bad(t):',
    '    count[0] += 1',
    '    raise ValueError("콜백 오류")',
    'Timer(0).init(period=25, callback=bad)',
    'time.sleep_ms(80)',
    'count[0]',
  ].join('\n'),
);

await step(
  'idle_after_end',
  ['from machine import Pin, Timer', 'led = Pin(2, Pin.OUT)', 'Timer(0).init(period=30, callback=lambda t: led.toggle())', '"started"'].join('\n'),
  { idle: true, stopAfterMs: 400 },
);

await step('no_idle_without_timers', ['from machine import Pin', 'Pin(2, Pin.OUT).on()', '"done"'].join('\n'), { idle: true });

await step('stop_in_sleep_loop', ['import time', 'while True:', '    time.sleep_ms(10)'].join('\n'), { stopAfterMs: 80 });

await step(
  'const_aliases_errno',
  [
    'from micropython import const',
    'import micropython, ustruct, struct, umachine, machine, uerrno, errno, usys, sys',
    'X = const(5)',
    'r = [X, ustruct is struct, umachine is machine, usys is sys, errno.ENODEV, uerrno.ETIMEDOUT, errno.errorcode[19], errno is uerrno]',
    'for statement in ["import bluetooth", "import ubluetooth", "import umicropython", "from machine import PWM", "machine.UART", "machine.nothing_here"]:',
    '    try:',
    '        exec(statement)',
    '        r.append("no error")',
    '    except Exception as e:',
    '        r.append(type(e).__name__ + ": " + str(e))',
    'queue = []',
    'for i in range(9):',
    '    try:',
    '        micropython.schedule(queue.append, i)',
    '    except RuntimeError as e:',
    '        r.append(str(e))',
    'import time',
    'time.sleep_ms(0)',
    'r.append(queue)',
    'r',
  ].join('\n'),
);

await step(
  'host_time_untouched',
  [
    'import importlib, logging, datetime',
    'real = importlib.import_module("time")',
    'import time as board_time',
    'import apc_board',
    'e = apc_board.board_oserror(19)',
    '[hasattr(real, "perf_counter"), hasattr(real, "sleep_ms"), real is not board_time, logging.makeLogRecord({}).created > 1_600_000_000, datetime.datetime.now().year >= 2026, str(e), list(e.args), type(e).__name__, e.errno]',
  ].join('\n'),
);

await step(
  'warnings',
  ['from machine import Pin', 'Pin(17, Pin.IN).value()', 'Pin(6, Pin.OUT)', 'Pin(34, Pin.IN, Pin.PULL_UP)', 'Pin(35).value(1)', 'Pin(1, Pin.OUT).on()', 'Pin(17, Pin.IN).value()', '"done"'].join('\n'),
);

await step('state_events', ['from machine import Pin', 'import time', 'led = Pin(2, Pin.OUT)', 'led.on()', 'time.sleep_ms(40)', 'led.off()', 'time.sleep_ms(40)', '"ok"'].join('\n'), {
  wiring: { parts: [{ part: 'builtin-led', id: 'led', pins: { led: 2 } }, { part: 'boot-button', id: 'boot', pins: { sig: 0 } }] },
});

// 동기 진입점 규칙: reset_for_run(보드 초기화 훅 포함)을 마지막 양보 뒤 16ms가 지난 뒤 동기 runPython으로 불러도 스택 전환 오류가 없어야 한다.
await new Promise((resolve) => setTimeout(resolve, 40));
try {
  bridge.pushEvent('board.input', { pin: 0, drive: 0 });
  pyodide.runPython('import apc_shims\napc_shims.install_available()');
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  out.syncEntrypointReset = 'ok';
} catch (error) {
  out.syncEntrypointReset = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
}
out.leftoverInputs = pyodide.runPython("import apc_runtime\napc_runtime.drain('board.input')").toJs();
out.stderr = stderr;
finish();
