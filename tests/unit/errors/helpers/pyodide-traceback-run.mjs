// Node.js에서 실제 Pyodide 314.0.7(+ opencv-python 4.11.0.86)로 오류를 하나씩 내 보고 트레이스백을 그대로 모으는 도우미
// (PLAN §8.2 P2-06, PD-14). 워커(src/lab/runtime/worker.ts)와 똑같이 runPythonAsync(코드, { globals, filename: 'main.py' })로 돌리고
// 잡은 PythonError에서 type·마지막 줄·트레이스백 전체를 꺼낸다(worker.ts의 pythonErrorInfo와 같은 방법).
//
// 쓰는 법: node --experimental-wasm-jspi tests/unit/errors/helpers/pyodide-traceback-run.mjs <저장소 뿌리> [--write]
//   --write를 주면 tests/unit/errors/fixtures/tracebacks.json을 새로 쓴다(사람이 읽고 커밋하는 채집본).
//   주지 않으면 JSON 한 줄만 찍는다(tests/unit/errors/pyodide-traceback.test.ts가 이렇게 부른다).
// opencv 휠(약 10.7MB)은 .cache/pyodide-packages/에 저장된다(git 제외). 받지 못하면 cv2 사례를 건너뛰고 skipped에 이유를 적는다.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { finishJson } from '../../helpers/finish-json.mjs';

// 절대 경로로 바꾼다("." 같은 상대 경로를 그대로 createRequire에 넘기면 ERR_INVALID_ARG_VALUE로 멈춘다).
const rootDir = path.resolve(process.argv[2] ?? process.cwd());
const write = process.argv.includes('--write');
const cacheDir = path.join(rootDir, '.cache', 'pyodide-packages');
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);

/** 학생 코드 파일 이름(src/lab/runtime/config.ts STUDENT_FILENAME) */
const STUDENT_FILENAME = 'main.py';

/** 사이트 흉내 모듈이 사이에 낀 트레이스백을 만들려고 /apc에 두는 작은 모듈(진짜 apc_cv2와 같은 자리) */
const PROBE_MODULE = `# 사이트 흉내 모듈 흉내(테스트용). 학생 함수를 대신 부른다.
def run(callback):
    return callback()
`;

/** 사례 목록: id → 파이썬 코드. cv2가 필요한 사례는 needsCv2: true */
const CASES = [
  { id: 'name-error', code: "x = 1\nprint(total)\n" },
  { id: 'name-error-typo', code: "result = 10\nprint(resutl)\n" },
  { id: 'name-error-in-function', code: "def show():\n    return total + 1\n\n\nprint('시작')\nshow()\n" },
  { id: 'indentation-expected', code: "if True:\nprint('안녕')\n" },
  { id: 'indentation-unexpected', code: "x = 1\n  y = 2\n" },
  { id: 'indentation-mismatch', code: "def f():\n    x = 1\n     y = 2\n    return x\n" },
  { id: 'syntax-assign-compare', code: "x = 1\nif x = 1:\n    print('one')\n" },
  { id: 'syntax-missing-colon', code: "x = 1\nif x == 1\n    print('one')\n" },
  { id: 'syntax-unclosed', code: "print('안녕'\nprint('다음')\n" },
  { id: 'syntax-print', code: "print '안녕'\n" },
  { id: 'syntax-invalid-character', code: "x = 1\nprint(‘안녕’)\n" },
  { id: 'type-error-str-int', code: "count = 3\nprint('개수: ' + count)\n" },
  { id: 'type-error-none', code: "value = None\nprint(value + 1)\n" },
  { id: 'type-error-args', code: "def draw(x, y):\n    return x + y\n\n\ndraw(1)\n" },
  { id: 'type-error-not-subscriptable', code: "value = None\nprint(value[0])\n" },
  { id: 'attribute-error-none', code: "frame = None\nprint(frame.shape)\n" },
  { id: 'attribute-error-list', code: "nums = [1, 2, 3]\nnums.push(4)\n" },
  { id: 'index-error', code: "nums = [1, 2, 3]\nprint(nums[5])\n" },
  { id: 'key-error', code: "scores = {'국어': 90}\nprint(scores['수학'])\n" },
  { id: 'value-error-int', code: "value = int('스물')\n" },
  { id: 'value-error-unpack', code: "a, b = [1, 2, 3]\n" },
  { id: 'zero-division', code: "total = 0\nprint(10 / total)\n" },
  { id: 'module-not-found', code: "import cv3\n" },
  { id: 'module-not-found-site', code: "import mediapipe as mp\n" },
  { id: 'file-not-found', code: "with open('mask.png', 'rb') as f:\n    data = f.read()\n" },
  { id: 'recursion-error', code: "def count(n):\n    return count(n + 1)\n\n\ncount(1)\n" },
  { id: 'assertion-error', code: "value = 1\nassert value == 2, '값이 달라요'\n" },
  { id: 'unbound-local', code: "total = 0\n\n\ndef add():\n    total = total + 1\n    return total\n\n\nadd()\n" },
  { id: 'eof-error', code: "name = input('이름: ')\n" },
  { id: 'chained-context', code: "try:\n    1 / 0\nexcept ZeroDivisionError:\n    raise ValueError('값이 이상해요')\n" },
  { id: 'chained-cause', code: "try:\n    {'a': 1}['b']\nexcept KeyError as error:\n    raise RuntimeError('처리 실패') from error\n" },
  { id: 'keyboard-interrupt', code: "raise KeyboardInterrupt\n" },
  { id: 'site-frame-between', code: "import apc_probe\n\n\ndef step():\n    return 1 / 0\n\n\napc_probe.run(step)\n" },
  { id: 'stop-iteration', code: "values = iter([1])\nnext(values)\nnext(values)\n" },
  {
    id: 'cv2-empty-image',
    needsCv2: true,
    code: "import cv2\n\nframe = None\ngray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)\n",
  },
  {
    id: 'cv2-empty-imread',
    needsCv2: true,
    code: "import cv2\n\nimage = cv2.imread('없는파일.png')\ngray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)\ncv2.imshow('gray', gray)\n",
  },
  {
    id: 'cv2-channels',
    needsCv2: true,
    code: "import cv2\nimport numpy as np\n\ncolor = np.zeros((48, 64, 3), dtype=np.uint8)\ngray = np.zeros((48, 64), dtype=np.uint8)\nmixed = cv2.bitwise_and(color, gray)\n",
  },
  {
    id: 'cv2-channels-add',
    needsCv2: true,
    code: "import cv2\nimport numpy as np\n\ncolor = np.zeros((48, 64, 3), dtype=np.uint8)\ngray = np.zeros((48, 64), dtype=np.uint8)\nmixed = cv2.addWeighted(color, 0.5, gray, 0.5, 0)\n",
  },
  {
    id: 'cv2-kernel-odd',
    needsCv2: true,
    code: "import cv2\nimport numpy as np\n\nimage = np.zeros((48, 64, 3), dtype=np.uint8)\nblur = cv2.GaussianBlur(image, (4, 4), 0)\n",
  },
  {
    id: 'cv2-bad-argument',
    needsCv2: true,
    code: "import cv2\nimport numpy as np\n\nimage = np.zeros((48, 64, 3), dtype=np.uint8)\ncv2.line(image, (1.5, 2), (30, 40), (255, 0, 0), 2)\n",
  },
  {
    id: 'cv2-size-mismatch',
    needsCv2: true,
    code: "import cv2\nimport numpy as np\n\nbig = np.zeros((48, 64, 3), dtype=np.uint8)\nsmall = np.zeros((24, 32, 3), dtype=np.uint8)\nmixed = cv2.add(big, small)\n",
  },
  {
    id: 'attribute-error-module',
    needsCv2: true,
    code: "import cv2\n\ncv2.destoyAllWindows()\n",
  },
  {
    id: 'import-error',
    needsCv2: true,
    code: "from cv2 import imread2\n",
  },
  {
    id: 'os-error-font',
    needsPillow: true,
    code: "from PIL import ImageFont\n\nfont = ImageFont.truetype('없는글꼴.ttf', 30)\n",
  },
  {
    id: 'numpy-shape',
    needsCv2: true,
    code: "import numpy as np\n\na = np.zeros((2, 3))\nb = np.zeros((4, 5))\nprint(a + b)\n",
  },
];

const out = { pyodideVersion: '', pythonVersion: '', collectedAt: new Date().toISOString().slice(0, 10), cases: {}, skipped: null };

// SystemExit·KeyboardInterrupt는 runPythonAsync 약속이 거부되는 것과 별개로 한 번 더 새어 나온다(BaseException, worker.ts 머리말).
// 워커와 같이 그 두 가지만 삼킨다.
function isRethrownRunError(error) {
  return Boolean(error) && typeof error.type === 'string' && (error.type === 'SystemExit' || error.type === 'KeyboardInterrupt');
}
process.on('uncaughtException', (error) => {
  if (isRethrownRunError(error)) {
    return;
  }
  console.error(error);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  if (isRethrownRunError(reason)) {
    return;
  }
  console.error(reason);
  process.exit(1);
});

fs.mkdirSync(cacheDir, { recursive: true });
const pyodide = await loadPyodide({ packageCacheDir: cacheDir });
out.pyodideVersion = pyodide.version;
out.pythonVersion = pyodide.runPython('import sys; ".".join(str(part) for part in sys.version_info[:3])');

// 사이트 흉내 모듈 자리(/apc, sys.path 맨 앞 — src/lab/runtime/worker.ts와 같다)
pyodide.FS.mkdirTree('/apc');
pyodide.FS.writeFile('/apc/apc_probe.py', PROBE_MODULE, { encoding: 'utf8' });
pyodide.runPython('import sys\nif "/apc" not in sys.path:\n    sys.path.insert(0, "/apc")\n');

let cv2Ready = false;
let pillowReady = false;
try {
  await pyodide.loadPackage(['numpy', 'opencv-python']);
  cv2Ready = true;
} catch (error) {
  out.skipped = `opencv-python 휠을 받지 못했어요(네트워크?): ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
}
try {
  await pyodide.loadPackage('pillow');
  pillowReady = true;
} catch {
  // Pillow 사례(글꼴)만 건너뛴다.
}

/** worker.ts의 pythonErrorInfo와 같은 방법으로 트레이스백을 꺼낸다. */
function errorInfo(error) {
  const traceback = String(error.message ?? '').replace(/\s+$/u, '');
  const lines = traceback.split('\n');
  return { type: error.type, message: lines[lines.length - 1] ?? String(error.type), traceback };
}

for (const testCase of CASES) {
  if ((testCase.needsCv2 && !cv2Ready) || (testCase.needsPillow && !pillowReady)) {
    continue;
  }
  const globals = pyodide.toPy({ __name__: '__main__', __file__: STUDENT_FILENAME });
  try {
    await pyodide.runPythonAsync(testCase.code, { globals, filename: STUDENT_FILENAME, dedent: false });
    out.cases[testCase.id] = { code: testCase.code, type: null, message: null, traceback: null, note: '오류가 나지 않았어요(사례를 고쳐야 해요).' };
  } catch (caught) {
    if (caught && typeof caught === 'object' && typeof caught.type === 'string') {
      out.cases[testCase.id] = { code: testCase.code, ...errorInfo(caught) };
    } else {
      out.cases[testCase.id] = { code: testCase.code, type: 'JavaScriptError', message: String(caught), traceback: String(caught) };
    }
  } finally {
    globals.destroy();
  }
}

if (write) {
  const target = path.join(rootDir, 'tests', 'unit', 'errors', 'fixtures', 'tracebacks.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  process.stdout.write(`${target}에 ${Object.keys(out.cases).length}개를 썼어요.\n`);
  process.exit(0);
} else {
  // 결과 JSON이 파이프 버퍼(64KB)보다 크면 다 나가기 전에 끝나 버린다 → 공통 함수로 기다린 뒤 끝낸다.
  finishJson(out);
}
