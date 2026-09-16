// Node.js에서 실제 Pyodide 314.0.7로 pyautogui 흉내 모듈(src/lab/modules/desktop/pyautogui.py)을 검사하는 도우미 스크립트
// (PLAN §8.2 P2-11, CODE_MAPPING §3.4, src/lab/README.md 4.6). tests/unit/pyautogui/pyodide-pyautogui.test.ts가
// `node [--experimental-wasm-jspi|--no-experimental-wasm-jspi] 이 파일 <저장소 뿌리>`로 띄우고 마지막 줄의 JSON 한 줄을 읽는다.
//
// 워커(src/lab/runtime/worker.ts)와 같은 순서로 준비한다: 다리 등록 → 붙박이 .py + 모듈 폴더 .py를 /apc에 쓰기 → apc_runtime.install()
// → apc_shims.register_shims(표) → 실행마다 bridge.beginRun() · install_available() · reset_for_run().
// 화면 흉내(index.ts 대신): desktop.* 이벤트를 모으고, desktop.screenshot 요청에 가짜 그림(RGBA)을 답하며,
// desktop.state 값과 desktop.pointer 채널(학생이 마우스를 옮긴 것)을 넣는다.
// Pillow는 screenshot() 검사에만 필요하다 — 받지 못하면 그 단계만 건너뛴다(out.pillow).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.argv[2] ?? process.cwd();
const cacheDir = path.join(rootDir, '.cache', 'pyodide-packages');
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);
const { createBridge } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'bridge.ts')).href);

/** 가상 모니터 크기(화면이 desktop.state로 알려 주는 값 — 기본 1920×1080이 아닌 값으로 두어 정말 읽는지 본다) */
const SCREEN = { width: 1280, height: 720, x: 640, y: 360 };
/** 가짜 화면 캡처 크기(index.ts는 논리 크기의 절반으로 찍어 보낸다) */
const SHOT = { width: 640, height: 360 };

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

/** 가짜 화면 캡처 한 장: 왼쪽 절반은 파랑, 오른쪽 절반은 흰색(자른 그림·크기 바꾸기를 확인할 수 있게) */
function makeShot() {
  const data = new Uint8ClampedArray(SHOT.width * SHOT.height * 4);
  for (let y = 0; y < SHOT.height; y += 1) {
    for (let x = 0; x < SHOT.width; x += 1) {
      const at = (y * SHOT.width + x) * 4;
      const left = x < SHOT.width / 2;
      data[at] = left ? 20 : 255;
      data[at + 1] = left ? 60 : 255;
      data[at + 2] = left ? 200 : 255;
      data[at + 3] = 255;
    }
  }
  return { width: SHOT.width, height: SHOT.height, data };
}

fs.mkdirSync(cacheDir, { recursive: true });
const pyodide = await loadPyodide({ packageCacheDir: cacheDir });
let jspi = false;
let stdout = '';

const bridge = createBridge({
  post: (message) => {
    if (message.type === 'request') {
      out.requests.push({ kind: message.kind, payload: message.payload });
      setTimeout(() => {
        if (message.kind === 'desktop.screenshot') {
          // 브라우저(index.ts)는 buffer를 transfer로 넘기지만, 다리는 값만 받는다(옮기기는 워커 postMessage의 몫).
          bridge.resolveRequest(message.requestId, makeShot());
        } else {
          bridge.rejectRequest(message.requestId, `화면이 "${message.kind}" 요청을 처리하지 못해요.`);
        }
      }, 5);
    } else if (message.type === 'event') {
      // desktop.file은 PNG 바이트를 담고 있다 → 그대로 JSON에 넣으면 출력이 터지므로 길이와 앞 4바이트(PNG 표시)만 남긴다.
      const payload = message.payload;
      if (message.kind === 'desktop.file' && payload && payload.bytes) {
        out.events.push({
          kind: message.kind,
          payload: {
            name: payload.name,
            width: payload.width,
            height: payload.height,
            skipped: payload.skipped,
            byteLength: payload.bytes.length,
            magic: Array.from(payload.bytes.slice(0, 4)).join(','),
          },
        });
      } else {
        out.events.push({ kind: message.kind, payload });
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

// screenshot() 검사용 Pillow(없으면 그 단계만 건너뛴다)
try {
  await pyodide.loadPackage('pillow');
  out.pillow = true;
} catch (error) {
  out.pillow = false;
  out.pillowError = error instanceof Error ? error.message.split('\n')[0] : String(error);
}

async function step(name, code, { setup } = {}) {
  stdout = '';
  const eventsBefore = out.events.length;
  const record = { ms: 0, stdout: '', events: [] };
  const startedAt = performance.now();
  bridge.beginRun();
  bridge.setValue('desktop.state', { ...SCREEN });
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
  record.events = out.events.slice(eventsBefore).map((event) => ({ kind: event.kind, payload: event.payload }));
  out.steps[name] = record;
}

// ① 화면이 알려 준 크기·커서를 읽는다(size·position)
await step('size_position', 'import pyautogui\n[list(pyautogui.size()), list(pyautogui.position()), pyautogui.size().width, pyautogui.position().x]');

// ② 좌표: 소수는 잘리고(f021), 화면 밖은 화면 안으로 잘린다
await step('coords', 'import pyautogui\npyautogui.moveTo(100.7, 200.9)\nstart = list(pyautogui.position())\npyautogui.moveTo(5000, -20)\n[start, list(pyautogui.position()), pyautogui.onScreen(5000, 10)]');

// ③ 걸음 계산: duration이 MINIMUM_DURATION(0.1)보다 길면 0.05초 간격으로 나눠 간다(원본과 같은 계산)
await step('move_steps', 'import pyautogui\npyautogui.moveTo(300, 300, duration=0.5)\n"done"');
await step('move_instant', 'import pyautogui\npyautogui.moveTo(50, 50)\n"done"');

// ④ PAUSE: 함수마다 0.1초 쉰다. 학생이 0으로 바꾸면 빨라지고, 다음 실행에는 기본값으로 돌아온다(진짜 PC는 실행마다 새 파이썬)
await step('pause_default', 'import pyautogui\nfor _ in range(3):\n    pyautogui.moveTo(10, 10)\npyautogui.PAUSE');
await step('pause_off', 'import pyautogui\npyautogui.PAUSE = 0\nfor _ in range(3):\n    pyautogui.moveTo(10, 10)\npyautogui.PAUSE');
await step('pause_reset', 'import pyautogui\npyautogui.PAUSE');

// ⑤ 클릭·더블 클릭·오른쪽 클릭(f018)
await step('clicks', 'import pyautogui\npyautogui.click(300, 300)\npyautogui.doubleClick(300, 300)\npyautogui.rightClick(300, 300)\n"done"');

// ⑥ 끌기(f019·f022): 버튼을 누른 채 옮기고 놓는다
await step('drag', 'import pyautogui\npyautogui.dragTo(400, 400, duration=0)\n"done"');
await step('drag_rel', 'import pyautogui\npyautogui.moveTo(500, 500)\npyautogui.dragRel(100, 0, duration=0.5)\n"done"');

// ⑦ 글자·키(f020·f024)
await step('typewrite', 'import pyautogui\npyautogui.typewrite("hi\\n", interval=0)\n"done"');
await step('hotkey', 'import pyautogui\npyautogui.hotkey("ctrl", "s")\n"done"');
await step('press_keys', 'import pyautogui\npyautogui.press("enter", presses=2)\npyautogui.keyDown("shift")\npyautogui.keyUp("shift")\n"done"');
await step('unknown_key', 'import pyautogui\npyautogui.press("한글키")\n"done"');
await step('scroll', 'import pyautogui\npyautogui.scroll(3, 100, 100)\n"done"');

// ⑧ 없는 함수(f024의 pyautogui.enter) → AttributeError + 한국어 힌트
await step('missing_enter', 'import pyautogui\npyautogui.enter("enter")');

// ⑨ 안전장치: 사람이 커서를 (0, 0)으로 옮기면 다음 함수에서 FailSafeException(f091)
await step('failsafe', 'import pyautogui\npyautogui.moveTo(300, 300)\npyautogui.click()', {
  setup: () => bridge.pushEvent('desktop.pointer', { x: 0, y: 0 }),
});
await step('failsafe_off', 'import pyautogui\npyautogui.FAILSAFE = False\npyautogui.moveTo(300, 300)\nlist(pyautogui.position())', {
  setup: () => bridge.pushEvent('desktop.pointer', { x: 0, y: 0 }),
});

// ⑩ 학생이 가상 모니터를 눌러 커서를 옮기면 position()이 따라간다
await step('pointer_follows', 'import pyautogui\nlist(pyautogui.position())', {
  setup: () => bridge.pushEvent('desktop.pointer', { x: 111, y: 222 }),
});

// ⑩-b f091(손가락으로 커서 조종)의 pyautogui 쪽: 정규화 좌표(0~1)를 size()에 곱해 moveTo.
// 손 인식(mediapipe)은 다른 구역 몫이라 좌표만 흉내 낸다. 마지막 점은 화면 밖(인식이 튀는 경우) → 화면 안으로 잘린다.
await step(
  'f091_cursor',
  [
    'import pyautogui',
    'screen_w, screen_h = pyautogui.size()',
    'moved = []',
    'for nx, ny in [(0.25, 0.5), (0.75, 0.25), (1.2, -0.1)]:',
    '    pyautogui.moveTo(int(nx * screen_w), int(ny * screen_h))',
    '    moved.append(list(pyautogui.position()))',
    '[screen_w, screen_h, moved]',
  ].join('\n'),
);

// ⑪ 화면 캡처(f025·f016): Pillow 이미지로 받아 크기를 논리 해상도로 늘리고 파일로 저장한다
if (out.pillow) {
  await step(
    'screenshot',
    [
      'import pyautogui, os',
      'shot = pyautogui.screenshot()',
      'shot.save("screenshot.png")',
      'part = pyautogui.screenshot(region=(0, 0, 100, 50))',
      '[list(shot.size), shot.mode, shot.getpixel((10, 10)), shot.getpixel((1200, 10)), list(part.size), os.path.exists("screenshot.png")]',
    ].join('\n'),
  );
  await step('screenshot_file', 'import pyautogui, os\npyautogui.screenshot("shot2.png")\nos.path.getsize("shot2.png") > 0');

  // ⑪-b (P2-12) 저장한 그림을 화면의 '내 파일'에 알린다(desktop.file: 이름·PNG 바이트·크기)
  await step(
    'screenshot_announce',
    ['import pyautogui', 'shot = pyautogui.screenshot()', 'shot.save("announced.png")', 'type(shot).__name__'].join('\n'),
  );

  // ⑪-c (P2-12) f090: 손 모양이 맞는 동안 매 프레임 같은 파일에 저장한다 → 0.5초에 한 번만 실제로 저장하고 한 번 안내한다
  await step(
    'screenshot_rate',
    [
      'import pyautogui, os',
      'pyautogui.PAUSE = 0',
      'for _ in range(8):',
      '    pyautogui.screenshot("screenshot.png")',
      'os.path.exists("screenshot.png")',
    ].join('\n'),
  );

  // ⑪-d (P2-12) f016: 이름이 다르면 빈도 제한에 걸리지 않고 모두 저장된다
  await step(
    'screenshot_many',
    [
      'import pyautogui, os',
      'pyautogui.PAUSE = 0',
      'for i in range(3):',
      '    pyautogui.screenshot().save(f"many_{i}.png")',
      '[os.path.exists(f"many_{i}.png") for i in range(3)]',
    ].join('\n'),
  );
}

// ⑬ (P2-12) webbrowser.open(url) → 가상 브라우저 창(f023·f024). 표준 라이브러리 webbrowser는 워커에서 ImportError를 낸다.
await step(
  'webbrowser',
  [
    'import webbrowser',
    'ok = webbrowser.open("https://www.naver.com/")',
    'webbrowser.open_new_tab("https://www.google.com/")',
    'browser = webbrowser.get()',
    '[ok, browser.name, webbrowser.__file__]',
  ].join('\n'),
);

// ⑭ (P2-12) f121: 입을 벌리는 동안 press("space")를 연타한다(미니게임으로 간다)
await step(
  'space_spam',
  ['import pyautogui as pg', 'pg.PAUSE = 0', 'for _ in range(5):', '    pg.press("space")', '"done"'].join('\n'),
);

// ⑮ f095~f097·f127의 pyautogui 쪽: FAILSAFE=False·PAUSE=0.01로 바꾸고 정규화 좌표를 size()에 곱해 매 프레임 moveTo.
// 얼굴 인식(mediapipe)은 다른 구역 몫이라 좌표만 흉내 낸다. f097은 여기에 오른쪽 클릭·더블 클릭이 더 붙는다.
await step(
  'face_mouse',
  [
    'import pyautogui',
    'pyautogui.FAILSAFE = False',
    'pyautogui.PAUSE = 0.01',
    'screen_width, screen_height = pyautogui.size()',
    'for nx, ny in [(0.5, 0.5), (0.52, 0.48), (0.54, 0.46)]:',
    '    pyautogui.moveTo(int(nx * screen_width), int(ny * screen_height))',
    "pyautogui.click(button='right')",
    'pyautogui.doubleClick()',
    '[screen_width, screen_height, list(pyautogui.position())]',
  ].join('\n'),
  { setup: () => bridge.pushEvent('desktop.pointer', { x: 0, y: 0 }) }, // 커서가 모서리에 있어도 FAILSAFE=False라 멈추지 않는다
);

// ⑫ 동기 진입점 규칙: 마지막 양보 뒤 16ms가 지난 뒤 reset_for_run을 동기로 불러도 스택 전환 오류가 없어야 한다(PROGRESS 미해결 25번)
await new Promise((resolve) => setTimeout(resolve, 40));
try {
  bridge.pushEvent('desktop.pointer', { x: 7, y: 7 });
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  out.syncEntrypointReset = 'ok';
} catch (error) {
  out.syncEntrypointReset = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
}
out.leftoverPointer = pyodide.runPython("import apc_runtime\napc_runtime.drain('desktop.pointer')").toJs();

finish();
