// Node.js에서 실제 Pyodide 314.0.7로 새 예제용 통신 모듈(src/lab/modules/vision-bridge/finger-count/bridge.py)을 검사하는 도우미 스크립트(P4-08).
// tests/unit/bridge-serial/pyodide-bridge.test.ts가 `node --experimental-wasm-jspi 이 파일 <저장소 뿌리>`로 띄우고 마지막 줄의 JSON 한 줄을 읽는다.
// 얼개는 같은 폴더의 pyodide-serial-run.mjs와 같다(워커와 같은 순서: 다리 등록 → /apc에 .py 쓰기 → install → 실행마다 reset).
//
// 화면 흉내(src/lab/modules/serial-pc/index.ts가 하는 일)
//  - 요청 'serial-pc.open' → openReply(기본 { ok: true, label: '같은 컴퓨터 탭' }). rejectOpen이면 요청을 거절한다(흉내 모듈이 없는 화면).
//  - 이벤트 'serial-pc.tx' → 보낸 바이트·category를 모은다. 'serial-pc.control' → 닫기 기록.
//  - 채널 'serial-pc.rx' → 보드가 보낸 바이트를 넣는다.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { finishJson } from '../../helpers/finish-json.mjs';

const rootDir = process.argv[2] ?? process.cwd();
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);
const { createBridge } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'bridge.ts')).href);

const BRIDGE_PY = path.join(rootDir, 'src', 'lab', 'modules', 'vision-bridge', 'finger-count', 'bridge.py');
const out = { steps: {}, control: [], notices: [] };
const DEFAULT_REPLY = { ok: true, portstr: 'ESP32-LAB', label: '같은 컴퓨터 탭', notices: [] };
let openReply = DEFAULT_REPLY;
let rejectOpen = false;
let sent = [];

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
        if (message.kind === 'serial-pc.open' && !rejectOpen) {
          bridge.resolveRequest(message.requestId, openReply);
          return;
        }
        bridge.rejectRequest(message.requestId, `이 실습실은 "${message.kind}" 요청을 처리하지 못해요.`);
      }, 5);
    } else if (message.type === 'event') {
      if (message.kind === 'serial-pc.tx') {
        const payload = message.payload ?? {};
        sent.push({ text: new TextDecoder().decode(new Uint8Array(payload.bytes ?? [])), category: payload.category ?? null, baud: payload.baud ?? null });
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
// 붙박이 도우미 + bridge.py만 넣는다(워커는 영상처리 실습실에 vision-bridge 폴더의 .py를 넣는다 — src/lab/python/modules.ts)
for (const file of fs.readdirSync(path.join(rootDir, 'src', 'lab', 'python'))) {
  if (file.endsWith('.py')) pyodide.FS.writeFile(`/apc/${file}`, fs.readFileSync(path.join(rootDir, 'src', 'lab', 'python', file), 'utf8'));
}
pyodide.FS.writeFile('/apc/bridge.py', fs.readFileSync(BRIDGE_PY, 'utf8'));

jspi = await pyodide.runPythonAsync(
  ['import sys', "sys.path.insert(0, '/apc')", 'import apc_runtime', 'apc_runtime.install()', 'from pyodide.ffi import can_run_sync', 'can_run_sync()'].join('\n'),
);
bridge.setLimited(!jspi);
out.jspi = jspi;

async function step(name, code, { setup } = {}) {
  stdout = '';
  sent = [];
  const record = { ms: 0, stdout: '' };
  const startedAt = performance.now();
  bridge.beginRun();
  // 워커처럼 **동기** runPython으로 실행 준비를 한다 — bridge.py의 초기화 함수가 양보하면 여기서 오류가 난다(미해결 25번).
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  bridge.setValue('serial-pc.info', { ready: true, label: '같은 컴퓨터 탭', peers: ['board'], prefix: 'zangfinger2a' });
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
  } finally {
    bridge.endRun();
  }
  record.ms = Math.round(performance.now() - startedAt);
  record.stdout = stdout;
  record.sent = sent;
  out.steps[name] = record;
}

/** 보드가 보낸 바이트를 받을 칸에 넣는다(화면의 pushEvent와 같다) */
const push = (text) => bridge.pushEvent('serial-pc.rx', { bytes: [...new TextEncoder().encode(text)] });
const NL = String.fromCharCode(10);

if (jspi) {
  // ① 규칙(§7.2 2·4·5·7): 값이 바뀔 때만, 끝 문자 한 개, 숫자·바이트 글자, event는 늘, send_bytes는 그대로
  await step(
    'rules',
    [
      'import bridge',
      'r = []',
      'r.append(bridge.send("3"))',
      'r.append(bridge.send("3"))',
      'r.append(bridge.send("3" + chr(10)))',
      'r.append(bridge.send(4))',
      'r.append(bridge.event("4"))',
      'r.append(bridge.send("4"))',
      'r.append(bridge.send_bytes(b"AB" + bytes([10])))',
      'r.append(bridge.send("4"))',
      'r.append(bridge.send(b"5"))',
      'r.append(bridge.last_sent())',
      'r.append(bridge.is_open())',
      'r',
    ].join(NL),
  );

  // ② receive(): 줄바꿈까지 모았다가 한 줄씩(끝의 \r\n을 뗀다), 아직 한 줄이 아니면 None
  await step('receive', ['import bridge', 'bridge.connect()', '[bridge.receive() for _ in range(4)]'].join(NL), {
    setup: () => {
      push(`OK-3${NL}OK-`);
      push(`4\r${NL}`);
      push('half');
    },
  });

  // ③ 실행마다 처음부터(앞 실행의 상태·받은 바이트를 버린다 — 초기화 함수는 동기 진입점에서 양보하지 않는다)
  await step('reset_between_runs', ['import bridge', '[bridge.is_open(), bridge.last_sent(), len(bridge.receive_bytes()), bridge.send("3")]'].join(NL));

  // ④ 잘못 쓴 값: 글자를 send_bytes에, 글자로 못 읽는 바이트를 send에
  await step('send_bytes_str', ['import bridge', 'bridge.send_bytes("3")'].join(NL));
  await step('send_bad_bytes', ['import bridge', 'bridge.send(bytes([0xff, 0xfe]))'].join(NL));

  // ⑤ 받을 쪽이 없으면 BridgeNoPeer(오류 사전 comm-no-peer), 통로를 못 열면 BridgeClosed(comm-closed), 둘 다 BridgeError
  openReply = { ok: false, error: 'ESP32 실습실 탭을 찾지 못했어요. [보내기] 패널의 … 다시 [실행]해요.' };
  await step('no_peer', ['import bridge', 'bridge.send("3")'].join(NL));
  await step(
    'no_peer_catch',
    ['import bridge', 'try:', '    bridge.send("3")', 'except bridge.BridgeError as e:', '    r = [type(e).__name__, isinstance(e, bridge.BridgeNoPeer)]', 'r'].join(NL),
  );
  openReply = { ok: false, error: '블루투스(실제 보드)를 열지 못했어요.' };
  await step('closed', ['import bridge', 'bridge.send("3")'].join(NL));
  openReply = { ok: false, error: '무엇이든', reason: 'no-peer' };
  await step('reason_field', ['import bridge', 'bridge.send("3")'].join(NL));
  openReply = DEFAULT_REPLY;
  rejectOpen = true;
  await step('unhandled', ['import bridge', 'bridge.send("3")'].join(NL));
  rejectOpen = false;

  // ⑥ close() → 화면에 닫기 알림, 다시 보내면 다시 연다
  const controlBefore = out.control.length;
  await step('close', ['import bridge', 'bridge.send("1")', 'bridge.close()', '[bridge.is_open(), bridge.send("1")]'].join(NL));
  out.steps.close.control = out.control.slice(controlBefore);

  // ⑦ ESP32 실습실(가상 보드 흉내가 있는 워커)에서는 import부터 막는다 — 실물 MicroPython에 bridge가 없다
  await step(
    'esp32_guard',
    [
      'import sys, types',
      'sys.modules["apc_board"] = types.ModuleType("apc_board")',
      'sys.modules.pop("bridge", None)',
      'try:',
      '    import bridge',
      '    r = "imported"',
      'except ModuleNotFoundError as e:',
      '    r = [e.name, str(e)]',
      'finally:',
      '    del sys.modules["apc_board"]',
      'r',
    ].join(NL),
  );
}

finishJson(out);
