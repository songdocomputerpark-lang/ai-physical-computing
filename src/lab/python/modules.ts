/**
 * 워커에 넣는 파이썬 쪽 모듈 목록(PLAN §8.2 P2-01·P2-03, CODE_MAPPING §3).
 *
 * 이 폴더(src/lab/python/)의 .py 파일을 Vite가 빌드할 때 글자로 묶어(import.meta.glob + ?raw) 워커(src/lab/runtime/worker.ts)가
 * Pyodide 가상 파일시스템의 /apc 폴더에 써 넣고 sys.path 맨 앞에 둔다. 그래서 파이썬 쪽에서 `import apc_runtime`,
 * `import apc_cv2`처럼 바로 불러올 수 있고, 학생이 같은 이름의 파일을 만들어도 가리지 못한다(CODE_MAPPING §3.3).
 *
 * 흉내 모듈을 더하는 법(코드 수정은 이 폴더 안에서만):
 *   1. 이 폴더에 apc_<이름>.py를 만든다. 화면과 값을 주고받는 일은 apc_runtime의 request·emit·get·poll·sleep·notice만 쓴다.
 *   2. 진짜 패키지의 함수를 덮어쓰는 모듈이면 install()을 만들고 apc_shims.py의 SHIMS 표에 '패키지 import 이름': 'apc_<이름>'을 적는다.
 *      워커가 실행 직전에 apc_shims.install_available()을 불러, 받아 둔 패키지가 있으면 install()을 한 번 부른다.
 *   3. 화면 쪽 처리기(request kind·event kind)는 protocol.ts 머리말에 적고 실습실 페이지가 lab.onRequest / lab.onEvent로 받는다.
 *
 * 모듈 이름은 파일 이름(확장자 없이)이다. 파일 이름은 영문 소문자·숫자·밑줄만 쓴다(파이썬 모듈 이름 규칙).
 */

const files = import.meta.glob<string>('./*.py', { query: '?raw', eager: true, import: 'default' });

/** { 'apc_runtime.py': 소스, 'apc_cv2.py': 소스, … } */
export const PYTHON_MODULES: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(files).map(([modulePath, source]) => {
      const fileName = modulePath.split('/').pop() ?? modulePath;
      if (!/^[a-z][a-z0-9_]*\.py$/u.test(fileName)) {
        throw new Error(`파이썬 모듈 파일 이름 "${fileName}"은(는) 영문 소문자·숫자·밑줄만 써요(src/lab/python/).`);
      }
      return [fileName, source];
    }),
  ),
);

/** 도우미 모듈(apc_runtime.py)이 들어 있는지 — 없으면 워커가 시작할 수 없다. */
export const RUNTIME_MODULE_FILE = 'apc_runtime.py';
