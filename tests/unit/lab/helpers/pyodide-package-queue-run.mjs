// Node.js에서 실제 Pyodide 314.0.7로 "패키지 받기 줄 세우기"(src/lab/runtime/package-queue.ts)를 확인하는 도우미 스크립트.
// tests/unit/lab/pyodide-package-queue.test.ts가 `node 이 파일 <저장소 뿌리>`로 띄우고 마지막 줄의 JSON 한 줄을 읽는다.
//
// 1. 줄 세움(워커와 같은 방법): 미리 받기(loadPackage numpy)와 실행 쪽 받기(loadPackagesFromImports 'import numpy')를 거의 같이 부른다.
//    → 진짜 stdout(학생 콘솔)에는 아무것도 안 나가고, 알림은 각자 자기 알림 함수로 가야 한다.
// 2. 대조(줄 세우지 않음): 같은 모양을 pillow로 겹쳐 부르면 Pyodide 314.0.7에서는 "Loading pillow"가 진짜 stdout으로 샌다
//    (PackageManager.setCallbacks가 겹친 호출에서 stdout 자리를 잘못 되돌림 — 2026-09-26 Phase 6 사용성 검토 지적 4의 원인).
//    1을 먼저 하는 까닭: 2가 지나간 뒤에는 stdout 자리가 옛 알림 함수로 남아 1이 새는지 볼 수 없다.
// 휠은 .cache/pyodide-packages/(pyodide-cv2·runtime-extras 검사가 쓰는 캐시)에서 읽고, 없으면 jsDelivr에서 받는다. 못 받으면 {"skipped": 이유}.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { finishJson } from '../../helpers/finish-json.mjs';

const rootDir = process.argv[2] ?? process.cwd();
const cacheDir = path.join(rootDir, '.cache', 'pyodide-packages');
const require = createRequire(path.join(rootDir, 'package.json'));
const { loadPyodide } = await import(pathToFileURL(require.resolve('pyodide/pyodide.mjs')).href);
const { createPackageQueue } = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'runtime', 'package-queue.ts')).href);

const out = {};
fs.mkdirSync(cacheDir, { recursive: true });
const pyodide = await loadPyodide({ packageCacheDir: cacheDir });
let stdout = '';
pyodide.setStdout({
  write: (buffer) => {
    stdout += new TextDecoder().decode(buffer);
    return buffer.length;
  },
});

const skip = (error) => {
  out.skipped = `휠을 받지 못했어요(네트워크?): ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
  finishJson(out);
};

// 1. 줄 세움
const queue = createPackageQueue();
const prefetch = [];
const runSide = [];
try {
  await Promise.all([
    queue.run(() => pyodide.loadPackage(['numpy'], { messageCallback: (message) => prefetch.push(message) })),
    queue.run(() => pyodide.loadPackagesFromImports('import numpy', { messageCallback: (message) => runSide.push(message) })),
  ]);
} catch (error) {
  skip(error);
}
out.queued = { stdout, prefetch, runSide };

// 2. 대조 — 줄 세우지 않음
stdout = '';
const first = [];
const second = [];
try {
  await Promise.all([
    pyodide.loadPackage(['pillow'], { messageCallback: (message) => first.push(message) }),
    pyodide.loadPackagesFromImports('import PIL', { messageCallback: (message) => second.push(message) }),
  ]);
} catch (error) {
  skip(error);
}
out.unqueued = { stdout, first, second };
out.loadedPackages = Object.keys(pyodide.loadedPackages).sort();
finishJson(out);
