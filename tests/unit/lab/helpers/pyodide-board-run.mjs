// Node.js에서 실제 Pyodide 314.0.7로 가상 ESP32 보드 모듈(src/lab/modules/board/)의 파이썬 쪽을 검사하는 도우미 스크립트(PLAN §8.3 P3-01, PD-14).
// tests/unit/lab/pyodide-board.test.ts가 `node --experimental-wasm-jspi 이 파일 <저장소 뿌리>`로 띄우고 마지막 줄의 JSON 한 줄을 읽는다.
// 부품·기능별 단계는 `--steps=tests/unit/lab/helpers/board-steps/<이름>.mjs`로 따로 돌린다(TS 쪽 도구 helpers/pyodide-board.ts의 runBoardSteps).
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
import { finishJson } from '../../helpers/finish-json.mjs';

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
  // 결과 JSON이 파이프 버퍼(64KB)보다 크면 다 나가기 전에 끝나 버린다 → 공통 함수로 기다린 뒤 끝낸다.
  finishJson(out);
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
/**
 * 단계가 정한 "이 이벤트가 오면 [정지]"(options.stopWhen) — 실제 시간(stopAfterMs) 대신 코드가 거기까지 갔는지로 멈춘다.
 * 부하가 큰 컴퓨터에서는 같은 실제 시간 안에 코드가 덜 가서, 시간으로 멈추면 보려는 모습(첫 write·꼭대기 뒤 내림 등)이 오기 전에 멈췄다
 * (2026-09-30 최종 점검 TD-03 — npm test를 다른 프로그램과 함께 돌려 재현).
 */
let stopWhen = null;
/** [정지]를 요청한 시각(performance.now) — 단계 기록의 stopLatencyMs(정지 요청부터 실행이 끝날 때까지)를 잰다 */
let stopRequestedAt = null;
function requestStopNow() {
  if (stopRequestedAt === null) stopRequestedAt = performance.now();
  bridge.requestStop();
}
/** 파이썬이 실제로 기다린 횟수(다리의 sleep 부름) — 짧은 sleep 모으기(16ms)를 실제 시간과 상관없이 세려고(단계 기록의 hostWaits) */
let hostWaits = 0;
const bridge = createBridge({
  post: (message) => {
    if (message.type === 'event' && message.kind === 'board.device' && message.payload && typeof message.payload.mark === 'string') {
      onMark?.(message.payload.mark);
      return;
    }
    if (message.type === 'event') {
      out.events.push({ kind: message.kind, payload: message.payload });
      if (stopWhen && stopWhen({ kind: message.kind, payload: message.payload })) {
        stopWhen = null;
        requestStopNow();
      }
    } else if (message.type === 'notice') out.notices.push(message.text);
    else if (message.type === 'request') setTimeout(() => bridge.rejectRequest(message.requestId, `화면이 "${message.kind}" 요청을 처리하지 못해요.`), 5);
  },
  now: () => performance.now(),
  canRunSync: () => jspi,
});
pyodide.setStdout({ write: (buffer) => ((stdout += new TextDecoder().decode(buffer)), buffer.length) });
pyodide.setStderr({ write: (buffer) => ((stderr += new TextDecoder().decode(buffer)), buffer.length) });
const bridgeSleep = bridge.api.sleep;
bridge.api.sleep = (ms) => {
  hostWaits += 1;
  return bridgeSleep(ms);
};
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

/*
 * 시험용 멈춘 시계(options.frozenClock): 가상 시계(apc_board.Clock)는 sleep한 양에 "실제로 계산한 시간"을 더한다(실물 보드도 코드가 도는 동안
 * 시간이 흐르니까). 그래서 컴퓨터가 바쁘면 Timer 주기를 합치거나(20ms를 넘게 밀리면 한 번으로) ticks 차이가 몇 ms 늘어, 가상 시각 계산 자체를 보는
 * 검사가 부하에 따라 흔들렸다(2026-09-30 최종 점검 TD-03 — 콜백 5번 대신 3번, sleep(5)가 5,003ms). 이 틀을 켜면 실행 동안 apc_board가 읽는
 * 실제 시계(_host_monotonic)를 0에 멈춰, 가상 시각이 sleep한 양만큼만 흐른다 — 부하와 상관없이 값이 정확하다(실제 기다림은 그대로 일어난다).
 * 실물처럼 계산 시간이 흐르는 모습은 이 틀을 켜지 않은 단계(virtual_clock 등)가 본다. 실행이 끝나면 되돌리고 그 가상 시각에서 이어 가게 닻을 다시 놓는다.
 */
const FREEZE_HOST_CLOCK = ['import apc_board as _apc_b', '_apc_b._apc_test_host_monotonic = _apc_b._host_monotonic', '_apc_b._host_monotonic = lambda: 0.0'].join('\n');
const THAW_HOST_CLOCK = [
  'import apc_board as _apc_b',
  '_apc_now = _apc_b.BOARD.clock.now_ns()',
  '_apc_b._host_monotonic = _apc_b._apc_test_host_monotonic',
  'del _apc_b._apc_test_host_monotonic',
  '_apc_b.BOARD.clock.anchor(_apc_now)',
].join('\n');

/**
 * 워커의 run()과 같은 순서로 코드 한 번을 돌린다.
 * options.inputs: 실행 전 board.inputs 값 / options.during: 실행 중 [ms, 함수] 목록 / options.stopAfterMs: 그 뒤 [정지] / options.idle: run_idle까지
 * options.onMark(mark): 파이썬이 board.device {mark}를 보내면 / options.stopWhen({kind, payload}): 이벤트가 이 조건에 맞으면 [정지](코드 진행에 맞춰 —
 * stopAfterMs를 함께 주면 그것은 조건이 끝내 오지 않을 때의 안전망) / options.frozenClock: 위 시험용 멈춘 시계.
 * 기록: ms(단계 전체 실제 시간), hostWaits(파이썬이 실제로 기다린 횟수), stopLatencyMs([정지] 요청부터 실행이 끝날 때까지 — 요청했을 때만)
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
  stopRequestedAt = null;
  const waitsBefore = hostWaits;
  const timers = [];
  for (const [ms, action] of options.during ?? []) timers.push(setTimeout(action, ms));
  if (options.stopAfterMs !== undefined) timers.push(setTimeout(() => requestStopNow(), options.stopAfterMs));
  onMark = options.onMark ?? null;
  stopWhen = options.stopWhen ?? null;
  const globals = pyodide.toPy({ __name__: '__main__', __file__: 'main.py' });
  let frozen = false;
  try {
    pyodide.runPython('import apc_shims\napc_shims.install_available()');
    pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
    pyodide.runPython('__import__("apc_runtime").bind_run_globals(globals())', { globals });
    if (options.frozenClock) {
      pyodide.runPython(FREEZE_HOST_CLOCK);
      frozen = true;
    }
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
    // 트레이스백 전체(워커가 화면에 넘기는 error.traceback과 같은 글 — Pyodide가 덧붙인 영어 안내(note)는 마지막 줄 뒤에 온다, 판 1.1.3)
    record.errorText = String(error && error.message ? error.message : error).trim();
  } finally {
    if (frozen) {
      try {
        pyodide.runPython(THAW_HOST_CLOCK);
      } catch (error) {
        // 되돌리지 못하면 다음 단계의 가상 시계가 멈춘 채로 돈다 — 조용히 넘어가지 않고 기록에 남긴다
        record.thawError = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
      }
    }
    try {
      pyodide.runPython('import apc_runtime\napc_runtime.unbind_run_globals()');
    } catch {
      // 실행 뒤 정리 실패는 결과에 영향 없음
    }
    globals.destroy();
    for (const timer of timers) clearTimeout(timer);
    onMark = null;
    stopWhen = null;
    bridge.endRun();
  }
  const endedAt = performance.now();
  record.ms = Math.round(endedAt - startedAt);
  record.hostWaits = hostWaits - waitsBefore;
  if (stopRequestedAt !== null) record.stopLatencyMs = Math.round(endedAt - stopRequestedAt);
  record.stdout = stdout;
  record.stderr = stderr;
  record.events = out.events.slice(eventsBefore).filter((event) => event.kind === 'board.state').map((event) => event.payload);
  record.devices = out.events.slice(eventsBefore).filter((event) => event.kind === 'board.device').map((event) => event.payload);
  record.notices = out.notices.slice(noticesBefore);
  out.steps[name] = record;
}

// --steps=<파일>: 공유 단계 대신 그 파일(기본 내보내기 async ({ step, bridge, pyodide, out, rootDir }) => void)의 단계만 돌린다(병렬 제작 준비 2026-09-17).
// 부품 구역은 tests/unit/lab/helpers/board-steps/<이름>.mjs를 새로 만들어 이 도우미를 고치지 않는다(README 7.9).
const stepsArg = process.argv.find((arg) => arg.startsWith('--steps='));
if (stepsArg) {
  const stepsFile = path.resolve(rootDir, stepsArg.slice('--steps='.length));
  const { default: runSteps } = await import(pathToFileURL(stepsFile).href);
  if (typeof runSteps !== 'function') {
    throw new Error(`단계 파일 ${stepsFile}의 기본 내보내기가 함수가 아니에요.`);
  }
  await runSteps({ step, bridge, pyodide, out, rootDir });
  out.stderr = stderr;
  finish();
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
  [
    'from machine import Pin',
    'import apc_runtime',
    'b = Pin(0, Pin.IN)',
    'led = Pin(2, Pin.OUT)',
    'n = 0',
    "apc_runtime.emit('board.device', {'mark': 'loop'})",
    'while b.value() == 1:',
    '    n += 1',
    'led.on()',
    '[n > 0, led.value()]',
  ].join('\n'),
  {
    inputs: { pins: { 0: 'pullup' } },
    // 반복문(sleep 없음 — f015 모양) 바로 앞의 표시를 받은 뒤 80ms에 버튼을 누른다. 전에는 단계 시작부터 80ms라서, 바쁜 컴퓨터에서
    // 실행 준비가 80ms를 넘으면 반복문에 들어가기 전에 이미 눌려 n = 0이 됐다(2026-09-28 최종 검증에서 한 번 — 코드 진행에 맞춰 흔들림을 없앰).
    onMark: (mark) => {
      if (mark === 'loop') setTimeout(() => bridge.pushEvent('board.input', { pin: 0, drive: 0 }), 80);
    },
  },
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
  // 실제 시계 그대로(계산 시간도 가상 시각에 들어감): 1ms × 200번 — 잔 만큼보다 줄지 않고, 실제로 기다린 횟수(hostWaits)는 16ms씩 모은 만큼
  ['import time', 't0 = time.ticks_us()', 'for _ in range(200):', '    time.sleep_ms(1)', 'time.ticks_diff(time.ticks_us(), t0)'].join('\n'),
);

await step(
  'virtual_clock_exact',
  // 시험용 멈춘 시계(frozenClock): 계산 시간을 빼고 가상 시각 계산만 — 짧은 sleep을 모아도 잔 만큼, sleep(초)은 밀리초로 버림, sleep_us는 마이크로초
  [
    'import time',
    't0 = time.ticks_us()',
    'for _ in range(200):',
    '    time.sleep_ms(1)',
    'many = time.ticks_diff(time.ticks_us(), t0)',
    't1 = time.ticks_us()',
    'time.sleep(0.0005)',
    'tiny = time.ticks_diff(time.ticks_us(), t1)',
    't2 = time.ticks_ms()',
    'time.sleep(0.25)',
    'quarter = time.ticks_diff(time.ticks_ms(), t2)',
    't3 = time.ticks_us()',
    'time.sleep_us(3)',
    'micro = time.ticks_diff(time.ticks_us(), t3)',
    '[many, tiny, quarter, micro]',
  ].join('\n'),
  { frozenClock: true },
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
  // 콜백 수·간격은 가상 시각 계산을 본다 — 계산 시간이 20ms를 넘게 밀리면 주기가 합쳐져 부하에 따라 수가 흔들렸다(TD-03)
  { frozenClock: true },
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
  { frozenClock: true },
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
  { frozenClock: true },
);

// 코드가 끝난 뒤(run_idle)에도 Timer가 LED를 바꾸는지: 끝난 뒤의 상태(phase idle)가 6번 오면 [정지] — 전에는 실제 400ms 뒤에 멈춰서,
// 컴퓨터가 바쁘면 준비에 시간을 다 써 idle 상태가 모자랐다(TD-03). 60초는 조건이 끝내 오지 않을 때(회귀)의 안전망.
let idleStates = 0;
await step(
  'idle_after_end',
  ['from machine import Pin, Timer', 'led = Pin(2, Pin.OUT)', 'Timer(0).init(period=30, callback=lambda t: led.toggle())', '"started"'].join('\n'),
  {
    idle: true,
    stopWhen: ({ kind, payload }) => kind === 'board.state' && payload?.phase === 'idle' && (idleStates += 1) >= 6,
    stopAfterMs: 60_000,
  },
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
    'for statement in ["import bluetooth", "import ubluetooth", "import umicropython", "from machine import DAC", "machine.I2S", "machine.nothing_here"]:',
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

// 배선과 코드 맞춰 보기(P3-02): 화면이 넣은 배선(board.wiring — 부품 이름·핀·방향, 모르는 부품은 known false)과 코드가 핀을 쓰는 모양이 어긋나면
// 핀 하나에 한 번씩 알린다. 모르는 부품(LCD)의 핀과 보드 부품을 맞게 쓴 핀은 알리지 않는다.
await step(
  'wiring_notices',
  [
    'from machine import Pin',
    'Pin(17, Pin.OUT)',
    'Pin(19, Pin.IN)',
    'm = Pin(19)',
    'm.on()',
    'Pin(18, Pin.OUT).on()',
    'Pin(21, Pin.OUT)',
    'Pin(2, Pin.OUT).on()',
    'Pin(0, Pin.IN).value()',
    'Pin(4, Pin.IN).value()',
    'Pin(17, Pin.OUT)',
    '"done"',
  ].join('\n'),
  {
    inputs: { pins: { 0: 'pullup', 17: 0 } },
    wiring: {
      parts: [
        { part: 'builtin-led', id: 'builtin-led', label: '내장 LED', pins: { led: 2 }, directions: { led: 'out' }, known: true },
        { part: 'boot-button', id: 'boot-button', label: 'BOOT 버튼', pins: { sig: 0 }, directions: { sig: 'in' }, known: true },
        { part: 'touch-digital', id: 'touch', label: '터치 센서', pins: { sig: 17 }, directions: { sig: 'in' }, known: true },
        { part: 'vibration-motor', id: 'motor', label: '진동 모터', pins: { sig: 19 }, directions: { sig: 'out' }, known: true },
        { part: 'lcd-i2c', id: 'lcd', label: '문자 LCD', pins: { sda: 21, scl: 22 }, known: false },
      ],
    },
  },
);

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
