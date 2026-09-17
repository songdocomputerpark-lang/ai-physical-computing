// 러너 공통 모듈(src/lab/modules/runtime-extras/)의 파이썬 쪽(apc_files.py)을 Node.js의 실제 Pyodide 314.0.7로 검사하는 도우미(P2-10).
// tests/unit/runtime-extras/pyodide-runtime-extras.test.ts가 `node --experimental-wasm-jspi 이 파일 <저장소 뿌리> [시험용 글꼴 파일]`로 띄우고
// 마지막 줄의 JSON 한 줄을 읽는다. 본보기는 tests/unit/lab/helpers/pyodide-hello-run.mjs(src/lab/README.md 4.6).
//
// 워커(src/lab/runtime/worker.ts)와 같은 순서로 준비한다: 다리 등록 → 붙박이·모듈 폴더의 .py를 /apc에 쓰기 → apc_runtime.install()
// → apc_shims.register_shims(manifest.shims) → 실행마다 install_available() → reset_for_run() → bind_run_globals → 코드 → unbind_run_globals.
// 마지막 unbind_run_globals까지 흉내 내는 이유: apc_files.py가 그 자리에서 "마지막으로 저장된 파일"을 화면에 보내기 때문이다(실행 끝 훅).
//
// 화면 흉내: 'runtime-extras.font' 요청에 시험용 글꼴 파일을 파이썬 파일시스템에 써 주고 경로로 답한다(fontMode 'fail'이면 거절).
// 시험용 글꼴은 저장소에 글꼴 바이너리를 넣지 않으려고 이미 설치된 playwright-core의 codicon.ttf(MIT)를 쓴다 — 한글 글리프는 없지만
// FreeType이 여는 진짜 글꼴 파일이라 "경로 연결이 되는가"를 검사할 수 있다(사이트에 넣을 한글 글꼴은 .cache/phase2-requests/runner.md 1번).
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { finishJson } from '../../helpers/finish-json.mjs';

const rootDir = process.argv[2] ?? process.cwd();
const fontFixture = process.argv[3] && fs.existsSync(process.argv[3]) ? process.argv[3] : null;
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);
const { createBridge } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'bridge.ts')).href);
const { default: manifest } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'modules', 'runtime-extras', 'manifest.ts')).href);

const out = { steps: {}, events: [], notices: [], requests: [], files: [], fontFixture: Boolean(fontFixture) };
let fontMode = 'ok'; // 'ok' | 'fail'

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

const pyodide = await loadPyodide({ packageCacheDir: path.join(rootDir, '.cache', 'pyodide-packages') });
let jspi = false;
let stdout = '';

const bridge = createBridge({
  post: (message, transfer) => {
    if (message.type === 'request') {
      out.requests.push({ kind: message.kind, payload: message.payload });
      setTimeout(() => {
        if (message.kind === 'runtime-extras.font') {
          if (fontMode === 'fail' || !fontFixture) {
            bridge.rejectRequest(message.requestId, `사이트 한글 글꼴 파일(${message.payload?.file})이 아직 없어요(HTTP 404).`);
            return;
          }
          // 화면이 하는 일과 같다: 받은 글꼴 바이트를 파이썬 파일시스템에 쓰고 그 경로로 답한다.
          pyodide.FS.mkdirTree('/site-assets/fonts');
          pyodide.FS.writeFile(`/site-assets/fonts/${message.payload.file}`, fs.readFileSync(fontFixture));
          bridge.resolveRequest(message.requestId, { path: `/site-assets/fonts/${message.payload.file}`, label: 'Pretendard', file: message.payload.file });
          return;
        }
        if (message.kind === 'input') {
          bridge.resolveRequest(message.requestId, '민수');
          return;
        }
        bridge.rejectRequest(message.requestId, `화면이 "${message.kind}" 요청을 처리하지 못해요.`);
      }, 5);
    } else if (message.type === 'event') {
      const payload = message.payload ?? {};
      const record = { kind: message.kind, transferred: Array.isArray(transfer) ? transfer.length : 0 };
      if (message.kind === 'runtime-extras.file_saved') {
        record.name = payload.name;
        record.size = payload.size;
        record.dataLength = payload.data?.length ?? null;
        record.isPng = payload.data ? [...payload.data.slice(0, 4)].join(',') === '137,80,78,71' : false;
        record.text = payload.data && payload.data.length < 200 && !record.isPng ? new TextDecoder().decode(payload.data) : null;
        record.transferBytes = transfer?.[0] instanceof ArrayBuffer ? transfer[0].byteLength : null;
      } else if (message.kind === 'runtime-extras.files') {
        record.phase = payload.phase;
        record.names = (payload.files ?? []).map((file) => file.name);
      } else if (message.kind === 'runtime-extras.shadow') {
        record.file = payload.file;
        record.name = payload.name;
      }
      out.events.push(record);
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

await pyodide.loadPackage(['numpy', 'opencv-python', 'pillow']);

jspi = await pyodide.runPythonAsync(
  ['import sys', "sys.path.insert(0, '/apc')", 'import apc_runtime', 'apc_runtime.install()', 'from pyodide.ffi import can_run_sync', 'can_run_sync()'].join('\n'),
);
bridge.setLimited(!jspi);
out.jspi = jspi;
// manifest.ts에 적은 흉내 표를 그대로 등록한다(워커가 SHIM_TABLE로 하는 일).
out.shimTable = pyodide.runPython(`import json, apc_shims\njson.dumps(apc_shims.register_shims(${JSON.stringify(manifest.shims ?? {})}))`);
out.manifest = { id: manifest.id, labs: manifest.labs, shims: manifest.shims, requestKinds: manifest.requestKinds, eventKinds: manifest.eventKinds };
// 화면(assets.ts)과 파이썬(apc_files.py)의 상수가 같은지
out.pythonConstants = JSON.parse(
  pyodide.runPython(
    'import json, apc_files\n' +
      'json.dumps({"work": apc_files.WORK_DIR, "fontFile": apc_files.SITE_FONT_FILE, "fontPath": apc_files.SITE_FONT_PATH, ' +
      '"label": apc_files.SITE_FONT_LABEL, "request": apc_files.REQUEST_FONT, "saved": apc_files.EVENT_FILE_SAVED, ' +
      '"files": apc_files.EVENT_FILES, "shadow": apc_files.EVENT_SHADOW})',
  ),
);

/**
 * 워커와 같은 순서로 학생 코드를 한 번 돌린다.
 * before: [실행]을 누르기 전 작업 폴더 상태(가림 검사·기준 목록은 reset_for_run에서 잡는다), setup: 실행 준비 뒤(화면이 보내는 값).
 */
async function step(name, code, { before, setup, cleanup } = {}) {
  stdout = '';
  const eventsBefore = out.events.length;
  const noticesBefore = out.notices.length;
  const record = { ms: 0, stdout: '', events: 0 };
  const startedAt = performance.now();
  if (before) before();
  bridge.beginRun();
  pyodide.runPython('import apc_shims\napc_shims.install_available()');
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  if (setup) setup();
  const globals = pyodide.toPy({ __name__: '__main__', __file__: 'main.py' });
  try {
    pyodide.runPython('__import__("apc_runtime").bind_run_globals(globals())', { globals });
    const value = await pyodide.runPythonAsync(code, { globals, filename: 'main.py', dedent: false });
    record.value = value && typeof value.toJs === 'function' ? value.toJs({ dict_converter: Object.fromEntries }) : value;
  } catch (error) {
    record.errorType = error && error.type ? error.type : 'JsError';
    record.errorMessage = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
  } finally {
    // 워커가 실행 끝에 하는 일(unbindParamGlobals) — apc_files의 실행 끝 훅이 여기서 마지막 파일을 보낸다.
    pyodide.runPython('import apc_runtime\napc_runtime.unbind_run_globals()');
    globals.destroy();
    bridge.endRun();
  }
  record.ms = Math.round(performance.now() - startedAt);
  record.stdout = stdout;
  record.events = out.events.length - eventsBefore;
  record.notices = out.notices.slice(noticesBefore);
  out.steps[name] = record;
  if (cleanup) cleanup();
}

const WORK = '/home/pyodide';
const write = (name, data) => pyodide.FS.writeFile(`${WORK}/${name}`, data);
const remove = (name) => {
  try {
    pyodide.FS.unlink(`${WORK}/${name}`);
  } catch {
    // 없으면 넘어간다
  }
};

if (jspi) {
  // ── RUN: exit()·quit()·sys.exit()·__main__ (CODE_MAPPING §3.3) ──
  await step('exit_builtin', 'print("전")\nexit()\nprint("후")');
  await step('quit_builtin', 'quit()');
  await step('sys_exit', 'import sys\nsys.exit(3)');
  await step('main_guard', 'def main():\n    print("주")\n\nif __name__ == "__main__":\n    main()\nprint(__name__)');

  // ── IN: input()이 대기 지점에서 화면 값을 받는다 ──
  await step('input_value', 'name = input("이름? ")\nprint("안녕", name)\nname');

  // ── FS: 화면이 넣어 준 가상 파일을 cv2가 읽는다(mask.png와 같은 자리 — 실제 SVG→PNG는 브라우저 테스트에서) ──
  pyodide.runPython(
    'import numpy as np\nfrom PIL import Image\n'
      + 'rgba = np.zeros((500, 400, 4), dtype="uint8")\nrgba[100:400, 50:350] = (90, 60, 180, 255)\n'
      + 'Image.fromarray(rgba, "RGBA").save("/tmp/mask.png")',
  );
  write('mask.png', pyodide.FS.readFile('/tmp/mask.png'));
  await step(
    'mask_read',
    'import cv2\nmask = cv2.imread("mask.png", cv2.IMREAD_UNCHANGED)\n[int(mask.shape[0]), int(mask.shape[1]), int(mask.shape[2]), int(mask[200, 200, 3])]',
  );

  // ── FS: 코드가 마지막 줄에서 저장한 파일도 화면에 간다(실행 끝 훅) ──
  await step(
    'save_at_end',
    'import cv2, numpy as np\nimg = np.zeros((20, 30, 3), dtype="uint8")\nimg[:, :, 2] = 255\ncv2.imwrite("결과.png", img)\nopen("메모.txt", "w", encoding="utf-8").write("안녕")\n"저장함"',
    { cleanup: () => (remove('결과.png'), remove('메모.txt')) },
  );

  // ── FS: 반복문 안에서 저장하면 실행 중(틱 훅)에도 간다 ──
  await step(
    'save_in_loop',
    [
      'import cv2, numpy as np, time',
      'for i in range(12):',
      '    img = np.full((8, 8, 3), i * 20, dtype="uint8")',
      '    cv2.imwrite("반복.png", img)',
      '    time.sleep(0.06)',
      '"끝"',
    ].join('\n'),
    { cleanup: () => remove('반복.png') },
  );

  // ── 이름 가림 경고 ──
  await step('shadow_warn', 'import sys\nsorted(n for n in ("cv2", "numpy") if n in sys.modules)', {
    before: () => {
      write('cv2.py', 'VALUE = 1\n');
      write('my_cv2.py', 'VALUE = 1\n');
      write('numpy.py', 'VALUE = 1\n');
    },
    cleanup: () => (remove('cv2.py'), remove('my_cv2.py'), remove('numpy.py')),
  });

  // ── FONT: 없는 PC 글꼴 경로 → 화면에 부탁 → 사이트 글꼴로 ──
  await step(
    'font_site',
    'from PIL import ImageFont, ImageDraw, Image\nimport numpy as np\n'
      + 'font = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 30)\n'
      + 'img = Image.fromarray(np.zeros((60, 200, 3), dtype="uint8"))\nImageDraw.Draw(img).text((5, 5), "ab", font=font, fill=(0, 255, 0))\n'
      + '[type(font).__name__, int(font.size)]',
  );

  // ── FONT: 학생이 [파일 넣기]로 넣은 글꼴 파일은 그대로 쓴다(요청 없음) ──
  if (fontFixture) {
    write('내글꼴.ttf', fs.readFileSync(fontFixture));
    await step('font_uploaded', 'from PIL import ImageFont\nfont = ImageFont.truetype("내글꼴.ttf", 20)\n[type(font).__name__, int(font.size)]', {
      cleanup: () => remove('내글꼴.ttf'),
    });
  }

  // ── FONT: 사이트 글꼴이 아직 없으면 오류로 멈추지 않고 Pillow 기본 글꼴로 그린다 ──
  fontMode = 'fail';
  pyodide.runPython('import os, apc_files\nos.path.exists(apc_files.SITE_FONT_PATH) and os.unlink(apc_files.SITE_FONT_PATH)');
  await step(
    'font_missing',
    'from PIL import ImageFont, ImageDraw, Image\nimport numpy as np\n'
      + 'font = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 24)\n'
      + 'img = Image.fromarray(np.zeros((60, 200, 3), dtype="uint8"))\nImageDraw.Draw(img).text((5, 5), "ab", font=font, fill=(0, 255, 0))\n'
      + '[type(font).__name__, int(np.array(img).sum() > 0)]',
  );
  fontMode = 'ok';

  // ── 제한 모드(JSPI 없음): 화면이 미리 넣어 둔 글꼴 파일을 기다리지 않고 쓴다 ──
  if (fontFixture) {
    pyodide.FS.mkdirTree('/site-assets/fonts');
    pyodide.FS.writeFile(`/site-assets/fonts/${out.pythonConstants.fontFile}`, fs.readFileSync(fontFixture));
    bridge.setLimited(true);
    const requestsBefore = out.requests.length;
    await step('font_limited', 'from PIL import ImageFont\nfont = ImageFont.truetype("C:/Windows/Fonts/malgun.ttf", 18)\n[type(font).__name__, int(font.size)]');
    out.steps.font_limited.newRequests = out.requests.length - requestsBefore;
    bridge.setLimited(false);
  }

  // ── 사이트판 f039의 벡터 합성(원본의 파이썬 3중 반복 대신) — 결과 값과 걸린 시간 ──
  await step(
    'vector_overlay',
    [
      'import numpy as np, time',
      'frame = np.zeros((480, 640, 3), dtype="uint8")',
      'mask = np.zeros((250, 200, 4), dtype="uint8")',
      'mask[:, :, 0] = 200',
      'mask[:, :, 3] = 128',
      'alpha = mask[:, :, 3:4].astype("float32") / 255.0',
      'def blend(target):',
      '    target[10:260, 10:210] = (alpha * mask[:, :, :3] + (1 - alpha) * target[10:260, 10:210]).astype("uint8")',
      'blend(np.zeros((480, 640, 3), dtype="uint8"))  # 첫 장에는 numpy가 준비하는 시간이 섞이므로 다른 장으로 미리 한 번(영상은 계속 반복된다)',
      'start = time.monotonic()',
      'blend(frame)',
      'vector_ms = (time.monotonic() - start) * 1000',
      '[int(frame[100, 100, 0]), int(frame[400, 400, 0]), round(vector_ms)]',
    ].join('\n'),
  );
}

// 동기 진입점 규칙: 마지막 양보 뒤 16ms가 지난 뒤 reset_for_run·unbind_run_globals를 동기로 불러도 스택 전환 오류가 없어야 한다.
await new Promise((resolve) => setTimeout(resolve, 40));
try {
  write('결과2.png', new Uint8Array([1, 2, 3]));
  pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
  pyodide.runPython('import apc_runtime\napc_runtime.unbind_run_globals()');
  out.syncEntrypoint = 'ok';
} catch (error) {
  out.syncEntrypoint = String(error && error.message ? error.message : error).trim().split('\n').slice(-1)[0];
}
remove('결과2.png');

finish();
