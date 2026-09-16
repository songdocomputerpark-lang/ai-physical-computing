/**
 * 워커에 넣는 파이썬 쪽 모듈 목록(PLAN §8.2 P2-01·P2-03, CODE_MAPPING §3, src/lab/README.md 4절).
 *
 * 두 곳의 .py 파일을 Vite가 빌드할 때 글자로 묶어(import.meta.glob + ?raw) 워커(src/lab/runtime/worker.ts)가
 * Pyodide 가상 파일시스템의 /apc 폴더에 써 넣고 sys.path 맨 앞에 둔다. 그래서 파이썬 쪽에서 `import apc_runtime`,
 * `import apc_cv2`처럼 바로 불러올 수 있고, 학생이 같은 이름의 파일을 만들어도 가리지 못한다(CODE_MAPPING §3.3).
 *   1. src/lab/python/*.py            붙박이: 도우미 apc_runtime.py, 등록표 apc_shims.py, cv2 흉내 apc_cv2.py(폴더 규약 이전에 만든 것)
 *   2. src/lab/modules/<id>/*.py       흉내 모듈 폴더(자동 발견). 파일 이름 = 모듈 이름이라 저장소 전체에서 겹치면 안 된다(빌드 오류).
 *
 * 흉내 모듈을 더하는 법: src/lab/modules/<id>/ 폴더 하나(manifest.ts + index.ts + apc_<이름>.py + panel.astro?)를 만든다.
 * 진짜 패키지를 덮어쓰는 모듈이면 manifest.ts의 shims에 { '패키지 import 이름': 'apc_<이름>' }을 적는다 — 워커가 시작할 때
 * SHIM_TABLE을 apc_shims.register_shims()에 넘기고, 실행 직전 install_available()이 받아 둔 패키지의 install()을 한 번 부른다.
 * 파이썬 쪽은 apc_runtime의 request·emit·get·poll·drain·sleep·notice·register_reset_hook·register_tick_hook만 쓴다.
 * 요청·이벤트·채널 이름은 manifest.ts에 적는다(붙박이 cv2의 이름은 src/lab/runtime/protocol.ts 머리말).
 *
 * 모듈 이름은 파일 이름(확장자 없이)이다. 파일 이름은 영문 소문자·숫자·밑줄만 쓴다(파이썬 모듈 이름 규칙).
 */
import { shimTableOf } from '../modules/manifests.ts';

const builtinFiles = import.meta.glob<string>('./*.py', { query: '?raw', eager: true, import: 'default' });
const moduleFiles = import.meta.glob<string>('../modules/*/*.py', { query: '?raw', eager: true, import: 'default' });

function collect(files: Readonly<Record<string, string>>, where: string, into: Map<string, { source: string; from: string }>): void {
  for (const [modulePath, source] of Object.entries(files)) {
    const fileName = modulePath.split('/').pop() ?? modulePath;
    if (!/^[a-z][a-z0-9_]*\.py$/u.test(fileName)) {
      throw new Error(`파이썬 모듈 파일 이름 "${fileName}"은(는) 영문 소문자·숫자·밑줄만 써요(${where}).`);
    }
    const existing = into.get(fileName);
    if (existing) {
      throw new Error(`파이썬 모듈 파일 이름 "${fileName}"이(가) 겹쳐요: ${existing.from}와(과) ${modulePath}. 모듈 이름은 저장소 전체에서 하나여야 해요.`);
    }
    into.set(fileName, { source, from: modulePath });
  }
}

const merged = new Map<string, { source: string; from: string }>();
collect(builtinFiles, 'src/lab/python/', merged);
collect(moduleFiles, 'src/lab/modules/<id>/', merged);

/** { 'apc_runtime.py': 소스, 'apc_cv2.py': 소스, 'apc_hello.py': 소스, … } */
export const PYTHON_MODULES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries([...merged.entries()].map(([fileName, { source }]) => [fileName, source])),
);

/** 도우미 모듈(apc_runtime.py)이 들어 있는지 — 없으면 워커가 시작할 수 없다. */
export const RUNTIME_MODULE_FILE = 'apc_runtime.py';

/** 흉내 모듈 폴더들이 선언한 표 { '패키지 import 이름': 'apc_<이름>' } — 워커가 apc_shims.register_shims()에 넘긴다(붙박이 cv2는 apc_shims.py에 있다). */
export const SHIM_TABLE: Readonly<Record<string, string>> = Object.freeze(shimTableOf());

for (const shimModule of Object.values(SHIM_TABLE)) {
  if (!(`${shimModule}.py` in PYTHON_MODULES)) {
    throw new Error(`manifest.ts의 shims가 가리키는 흉내 모듈 "${shimModule}.py"이(가) 그 모듈 폴더에 없어요.`);
  }
}
