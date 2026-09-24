// Node.js에서 실제 Pyodide 314.0.7로 컴퓨터 쪽 시리얼 흉내(src/lab/modules/serial-pc/serial.py)를 검사하는 도우미 스크립트(P4-02).
// tests/unit/bridge-serial/pyodide-serial.test.ts가 `node --experimental-wasm-jspi 이 파일 <저장소 뿌리>`로 띄우고 마지막 줄의 JSON 한 줄을 읽는다.
// 얼개는 tests/unit/lab/helpers/pyodide-hello-run.mjs와 같다(워커와 같은 순서로 준비: 다리 등록 → /apc에 .py 쓰기 → install → 실행마다 reset).
//
// 화면 흉내(src/lab/modules/serial-pc/index.ts가 하는 일)
//  - 요청 'serial-pc.open' → { ok: true, portstr: 'ESP32-LAB', notices: [...] }. openFails를 켜면 { ok: false, error: 한국어 }로 답한다.
//  - 요청 'input' → 미리 넣어 둔 줄을 차례로 답한다(원본 f084가 input()으로 글자를 받는다).
//  - 이벤트 'serial-pc.tx' → 보낸 바이트를 모은다. 'serial-pc.control' → 닫기 기록.
//  - 채널 'serial-pc.rx' → 보드가 보낸 바이트를 넣는다. 값 'serial-pc.info' → 포트 목록.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { finishJson } from '../../helpers/finish-json.mjs';

const rootDir = process.argv[2] ?? process.cwd();
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);
const { createBridge } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'bridge.ts')).href);

const out = { steps: {}, sent: [], control: [], notices: [], files: [] };
let openFails = null;
let inputAnswers = [];

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

const pyodide = await loadPyodide();
let jspi = false;
let stdout = '';

const bridge = createBridge({
  post: (message) => {
    if (message.type === 'request') {
      setTimeout(() => {
        if (message.kind === 'serial-pc.open') {
          if (openFails !== null) {
            bridge.resolveRequest(message.requestId, { ok: false, error: openFails });
          } else {
            bridge.resolveRequest(message.requestId, {
              ok: true,
              portstr: 'ESP32-LAB',
              label: '같은 컴퓨터 탭',
              notices: [`브라우저에서는 포트 이름(${message.payload?.port ?? ''})을 쓰지 않아요.`],
            });
          }
          return;
        }
        if (message.kind === 'input') {
          bridge.resolveRequest(message.requestId, inputAnswers.length > 0 ? inputAnswers.shift() : null);
          return;
        }
        bridge.rejectRequest(message.requestId, `화면이 "${message.kind}" 요청을 처리하지 못해요.`);
      }, 5);
    } else if (message.type === 'event') {
      if (message.kind === 'serial-pc.tx') {
        out.sent.push({ bytes: [...(message.payload?.bytes ?? [])], baud: message.payload?.baud ?? 0 });
      } else if (message.kind === 'serial-pc.control') {
        out.control.push(message.payload?.kind ?? '?');
      }
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
      finishJson(out);
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

async function step(name, code, { setup, info } = {}) {
  stdout = '';
  const record = { ms: 0, stdout: '' };
  const startedAt = performance.now();
  bridge.beginRun();
  pyodide.runPython('import apc_shims\napc_shims.install_available()');
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  bridge.setValue('serial-pc.info', info ?? { ready: true, label: '같은 컴퓨터 탭', ports: [{ device: 'ESP32-LAB', description: 'ESP32 실습실(가상 USB-UART 변환기) — 이어짐', hwid: 'APC:VIRTUAL-UART' }] });
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
    const message = String(error && error.message ? error.message : error).trim();
    record.errorMessage = message.split('\n').slice(-1)[0];
    record.traceback = message.slice(-600);
  } finally {
    bridge.endRun();
  }
  record.ms = Math.round(performance.now() - startedAt);
  record.stdout = stdout;
  out.steps[name] = record;
}

/** 파이썬 쪽 '받을 칸'에 보드가 보낸 바이트를 넣는다(화면의 pushEvent와 같다) */
const push = (text) => bridge.pushEvent('serial-pc.rx', { bytes: [...new TextEncoder().encode(text)] });

if (jspi) {
  // ① 원본 f084를 **한 글자도 고치지 않고** 돌린다(입력 a·b·q).
  const f084 = fs.readFileSync(path.join(rootDir, 'examples', 'vision', 'u3', '3-1-2-uart-key-send.py'), 'utf8');
  inputAnswers = ['a', 'b', 'q'];
  const sentBefore = out.sent.length;
  await step('f084_original', f084);
  out.steps.f084_original.sent = out.sent.slice(sentBefore);

  // ② 포트 열기·쓰기(보낸 바이트와 속도가 그대로 실린다)
  await step('open_write', "import serial\nu = serial.Serial('COM10', 115200)\n[u.is_open, u.port, u.portstr, u.baudrate, u.write(b'ab')]");

  // ③ str을 주면 진짜 pyserial과 같은 TypeError
  await step('write_str', "import serial\nu = serial.Serial('COM10', 115200)\nu.write('a')");

  // ④ 닫은 포트에 쓰면 PortNotOpenError(SerialException)
  await step('write_closed', "import serial\nu = serial.Serial('COM10', 115200)\nu.close()\nu.write(b'a')");

  // ⑤ timeout 0: 줄바꿈이 없어도 지금까지 온 바이트를 준다(§8.4 설계 메모 ④)
  await step('timeout_zero', "import serial\nu = serial.Serial('COM10', 115200, timeout=0)\n[u.in_waiting, list(u.readline()), list(u.readline())]", {
    setup: () => push('hi'),
  });

  // ⑥ timeout 0 + read(n): 있는 만큼만 주고 기다리지 않는다
  await step('read_partial', "import serial\nu = serial.Serial('COM10', 115200, timeout=0)\n[list(u.read(5)), list(u.read(1))]", { setup: () => push('ab') });

  // ⑦ 줄바꿈이 오면 readline이 줄 끝까지 준다(timeout 없음 = 기다린다)
  await step('readline_full', "import serial\nu = serial.Serial('COM10', 115200)\nlist(u.readline())", { setup: () => push('hello\n') });

  // ⑧ in_waiting·reset_input_buffer
  await step('reset_input', "import serial\nu = serial.Serial('COM10', 115200, timeout=0)\nbefore = u.in_waiting\nu.reset_input_buffer()\n[before, u.in_waiting, list(u.read(3))]", {
    setup: () => push('abc'),
  });

  // ⑨ with 문(나가면서 닫힌다)
  await step('with_block', "import serial\nwith serial.Serial('COM10', 9600) as u:\n    u.write(b'x')\n    inside = u.is_open\n[inside, u.is_open]");

  // ⑩ serial.tools.list_ports — 두 가지 import 방법 모두
  await step(
    'list_ports',
    [
      'import serial',
      'import serial.tools.list_ports',
      'from serial.tools import list_ports',
      'ports = list_ports.comports()',
      '[len(ports), ports[0].device, ports[0].description, str(ports[0]), serial.tools.list_ports.comports()[0].device]',
    ].join('\n'),
  );

  // ⑪ ESP32 실습실 탭이 없으면 SerialException + 한국어 안내
  openFails = 'ESP32 실습실 탭을 찾지 못했어요. [보내기] 패널의 [ESP32 실습실 새 탭에서 열기]를 누른 뒤 다시 [실행]해요.';
  await step('open_no_peer', "import serial\nserial.Serial('COM10', 115200)");
  openFails = null;

  // ⑫ 닫기 알림이 화면으로 간다
  const controlBefore = out.control.length;
  await step('close_event', "import serial\nu = serial.Serial('COM10', 115200)\nu.close()\nu.is_open");
  out.steps.close_event.control = out.control.slice(controlBefore);
}

finishJson(out);
