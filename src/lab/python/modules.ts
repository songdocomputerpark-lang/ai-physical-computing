/**
 * 워커에 넣는 파이썬 쪽 모듈 목록(PLAN §8.2 P2-01·P2-03, CODE_MAPPING §3, src/lab/README.md 4절).
 *
 * 두 곳의 .py 파일을 Vite가 빌드할 때 글자로 묶어(import.meta.glob + ?raw) 워커(src/lab/runtime/worker.ts)가
 * Pyodide 가상 파일시스템의 /apc 폴더에 써 넣고 sys.path 맨 앞에 둔다. 그래서 파이썬 쪽에서 `import apc_runtime`,
 * `import apc_cv2`처럼 바로 불러올 수 있고, 학생이 같은 이름의 파일을 만들어도 가리지 못한다(CODE_MAPPING §3.3).
 *   1. src/lab/python/*.py              붙박이: 도우미 apc_runtime.py, 등록표 apc_shims.py, cv2 흉내 apc_cv2.py(폴더 규약 이전에 만든 것)
 *   2. src/lab/modules/<id>/**\/*.py      흉내 모듈 폴더(자동 발견). 폴더 바로 아래뿐 아니라 그 안의 하위 폴더(예: 가상 보드의 부품 폴더
 *                                         modules/board/parts/<부품>/*.py)도 찾는다(P3-01 부품 레지스트리). 파일 이름 = 모듈 이름이라
 *                                         저장소 전체에서 겹치면 안 된다(빌드 오류). 어느 모듈 폴더의 파일인지는 경로의 첫 칸으로 정한다.
 *
 * 실습실마다 넣는 모듈이 다르다(P3-01, PD-04): 워커가 load 메시지의 labId를 받으면 pythonModulesForLab(labId)로
 * 붙박이 + 그 실습실에 붙는 모듈 폴더(manifest.labs)의 파일만 넣고, shimTableForLab(labId)로 그 모듈들의 shims만 등록한다.
 * 그래서 가상 보드의 machine.py·time 흉내는 ESP32 실습실 워커에만 있고 영상처리 실습실에서는 `import machine`이 원래대로 없는 모듈이다.
 * labId가 없으면(단위 테스트·옛 호출) 예전처럼 모든 모듈을 넣는다.
 *
 * 흉내 모듈을 더하는 법: src/lab/modules/<id>/ 폴더 하나(manifest.ts + index.ts + apc_<이름>.py + panel.astro?)를 만든다.
 * 진짜 패키지를 덮어쓰는 모듈이면 manifest.ts의 shims에 { '패키지 import 이름': 'apc_<이름>' }을 적는다 — 워커가 시작할 때
 * SHIM_TABLE을 apc_shims.register_shims()에 넘기고, 실행 직전 install_available()이 받아 둔 패키지의 install()을 한 번 부른다.
 * 파이썬 쪽은 apc_runtime의 request·emit·get·peek·poll·drain·sleep·notice·register_*_hook만 쓴다.
 * 요청·이벤트·채널 이름은 manifest.ts에 적는다(붙박이 cv2의 이름은 src/lab/runtime/protocol.ts 머리말).
 *
 * 모듈 이름은 파일 이름(확장자 없이)이다. 파일 이름은 영문 소문자·숫자·밑줄만 쓴다(파이썬 모듈 이름 규칙).
 */
import { MODULE_MANIFESTS, moduleAppliesTo, shimTableOf } from '../modules/manifests.ts';
import type { LabModuleManifest } from '../modules/types.ts';

const builtinFiles = import.meta.glob<string>('./*.py', { query: '?raw', eager: true, import: 'default' });
const moduleFiles = import.meta.glob<string>(['../modules/*/*.py', '../modules/*/**/*.py'], { query: '?raw', eager: true, import: 'default' });

/** 모은 파이썬 파일 하나: 소스, 찾은 경로, 주인 모듈 id(붙박이는 null) */
export interface PythonModuleFile {
  readonly source: string;
  readonly from: string;
  readonly owner: string | null;
}

/**
 * glob 경로에서 주인 모듈 id를 뽑는다: '../modules/board/machine.py' → 'board', '../modules/board/parts/led/x.py' → 'board'.
 * 모듈 폴더 밖이면 null.
 */
export function moduleOwnerOf(globPath: string): string | null {
  const parts = globPath.replace(/\\/gu, '/').split('/');
  const at = parts.lastIndexOf('modules');
  return at >= 0 && parts.length >= at + 3 ? (parts[at + 1] ?? null) : null;
}

/**
 * 붙박이·모듈 폴더의 glob 결과를 파일 이름 → { source, from, owner } 표로 합친다(순수 함수 — 단위 테스트가 가짜 경로로 검사한다).
 * 파일 이름 규칙(영문 소문자·숫자·밑줄)과 저장소 전체에서 이름이 하나인지를 검사하고, 어기면 오류를 던진다.
 */
export function collectPythonModules(
  builtin: Readonly<Record<string, string>>,
  modules: Readonly<Record<string, string>>,
): Map<string, PythonModuleFile> {
  const merged = new Map<string, PythonModuleFile>();
  const add = (files: Readonly<Record<string, string>>, where: string, ownerOf: (path: string) => string | null) => {
    for (const [modulePath, source] of Object.entries(files)) {
      const fileName = modulePath.split('/').pop() ?? modulePath;
      if (!/^[a-z][a-z0-9_]*\.py$/u.test(fileName)) {
        throw new Error(`파이썬 모듈 파일 이름 "${fileName}"은(는) 영문 소문자·숫자·밑줄만 써요(${where}).`);
      }
      const existing = merged.get(fileName);
      if (existing) {
        if (existing.from === modulePath) {
          continue; // 두 glob 패턴이 같은 파일을 함께 찾은 경우
        }
        throw new Error(`파이썬 모듈 파일 이름 "${fileName}"이(가) 겹쳐요: ${existing.from}와(과) ${modulePath}. 모듈 이름은 저장소 전체에서 하나여야 해요.`);
      }
      merged.set(fileName, { source, from: modulePath, owner: ownerOf(modulePath) });
    }
  };
  add(builtin, 'src/lab/python/', () => null);
  add(modules, 'src/lab/modules/<id>/', moduleOwnerOf);
  return merged;
}

const merged = collectPythonModules(builtinFiles, moduleFiles);

/** { 'apc_runtime.py': 소스, 'apc_cv2.py': 소스, 'apc_hello.py': 소스, … } — 모든 실습실의 파일 */
export const PYTHON_MODULES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries([...merged.entries()].map(([fileName, { source }]) => [fileName, source])),
);

/** 파일 이름 → 주인 모듈 id(붙박이는 null) */
export const PYTHON_MODULE_OWNERS: Readonly<Record<string, string | null>> = Object.freeze(
  Object.fromEntries([...merged.entries()].map(([fileName, { owner }]) => [fileName, owner])),
);

/** 도우미 모듈(apc_runtime.py)이 들어 있는지 — 없으면 워커가 시작할 수 없다. */
export const RUNTIME_MODULE_FILE = 'apc_runtime.py';

/** 흉내 모듈 폴더들이 선언한 표 { '패키지 import 이름': 'apc_<이름>' } — 모든 실습실 기준(붙박이 cv2는 apc_shims.py에 있다). */
export const SHIM_TABLE: Readonly<Record<string, string>> = Object.freeze(shimTableOf());

for (const shimModule of Object.values(SHIM_TABLE)) {
  if (!(`${shimModule}.py` in PYTHON_MODULES)) {
    throw new Error(`manifest.ts의 shims가 가리키는 흉내 모듈 "${shimModule}.py"이(가) 그 모듈 폴더에 없어요.`);
  }
}

/** 주인 모듈이 이 실습실에 붙는지. manifest가 없는 폴더의 파일은 모든 실습실에 넣는다(예전 동작). */
function ownerApplies(owner: string | null, labId: string, manifests: readonly LabModuleManifest[]): boolean {
  if (owner === null) {
    return true;
  }
  const manifest = manifests.find((item) => item.id === owner);
  return manifest ? moduleAppliesTo(manifest, labId) : true;
}

/**
 * 그 실습실의 워커에 넣을 파이썬 파일 { 파일 이름: 소스 }: 붙박이 + 그 실습실에 붙는 모듈 폴더의 파일.
 * labId가 없으면 모든 파일(PYTHON_MODULES).
 */
export function pythonModulesForLab(
  labId?: string,
  manifests: readonly LabModuleManifest[] = MODULE_MANIFESTS,
  owners: Readonly<Record<string, string | null>> = PYTHON_MODULE_OWNERS,
  modules: Readonly<Record<string, string>> = PYTHON_MODULES,
): Record<string, string> {
  if (!labId) {
    return { ...modules };
  }
  return Object.fromEntries(Object.entries(modules).filter(([fileName]) => ownerApplies(owners[fileName] ?? null, labId, manifests)));
}

/** 그 실습실에 붙는 모듈들의 shims 표. labId가 없으면 모든 모듈의 표(SHIM_TABLE). */
export function shimTableForLab(labId?: string, manifests: readonly LabModuleManifest[] = MODULE_MANIFESTS): Record<string, string> {
  if (!labId) {
    return shimTableOf(manifests);
  }
  return shimTableOf(manifests.filter((manifest) => moduleAppliesTo(manifest, labId)));
}
