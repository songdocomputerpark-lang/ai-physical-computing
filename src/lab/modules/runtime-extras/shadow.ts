/**
 * 파일 이름이 파이썬 라이브러리 이름을 가리는지 검사(P2-10, CODE_MAPPING §3.3 "사용자 모듈 가림 방지").
 *
 * Pyodide의 sys.path는 ''(현재 폴더 /home/pyodide)가 site-packages보다 앞이라(2026-09-16 Node Pyodide로 확인), 학생이 작업 폴더에
 * cv2.py·numpy.py 같은 파일을 두면 import cv2가 진짜 라이브러리 대신 그 파일을 불러 이해하기 어려운 오류가 난다. 사이트 도우미(/apc)는
 * sys.path 맨 앞이라 가려지지 않지만 이름이 같으면 헷갈리므로 함께 막는다.
 *
 * 화면 쪽([파일 넣기])은 이 검사로 넣기를 거절하고 한국어로 알린다. 파이썬 쪽(apc_files.py)은 실행 시작 때 작업 폴더를 훑어 코드가 만든 파일도 경고한다
 * (그쪽은 sys.stdlib_module_names·site-packages 목록으로 더 넓게 본다). 순수 함수라 단위 테스트가 검사한다.
 */
import { BUILTIN_PYTHON_MODULES, BUILTIN_SHIMS, MODULE_MANIFESTS } from '../manifests.ts';
import type { LabModuleManifest } from '../types.ts';

/** 학생이 자주 쓰는 라이브러리·표준 모듈 이름(파이썬 쪽은 sys.stdlib_module_names로 전체를 본다) */
export const COMMON_LIBRARY_NAMES: readonly string[] = Object.freeze([
  'cv2',
  'numpy',
  'mediapipe',
  'pyautogui',
  'PIL',
  'serial',
  'speech_recognition',
  'pyodide',
  'js',
  'micropython',
  'machine',
  'time',
  'os',
  'sys',
  'math',
  'random',
  'json',
  're',
  'collections',
  'datetime',
  'string',
  'turtle',
  'tkinter',
  'socket',
  'threading',
  'asyncio',
  'csv',
  'io',
  'pathlib',
  'subprocess',
  'typing',
  'functools',
  'itertools',
  'statistics',
  'urllib',
  'http',
  'unittest',
  'logging',
  'copy',
  'enum',
  'dataclasses',
  'abc',
  'array',
  'struct',
  'pickle',
  'shutil',
  'tempfile',
  'glob',
  'platform',
  'queue',
  'heapq',
  'bisect',
  'decimal',
  'fractions',
  'operator',
  'textwrap',
  'unicodedata',
  'base64',
  'hashlib',
  'secrets',
  'uuid',
  'zlib',
  'gzip',
  'zipfile',
  'calendar',
  'argparse',
  'pprint',
  'traceback',
  'warnings',
  'inspect',
  'ast',
  'types',
  'weakref',
  'gc',
  'contextlib',
  'importlib',
  'builtins',
  'keyword',
  'html',
  'xml',
  'sqlite3',
  'webbrowser',
  'select',
  'signal',
  'code',
  'test',
  'main',
]);

/** 넣을 수 있는 파일 이름 길이 상한 */
export const MAX_UPLOAD_NAME_LENGTH = 120;

/** 가려질 수 있는 이름 모음: 자주 쓰는 라이브러리 + 붙박이·모듈 폴더의 흉내 대상 패키지와 흉내 모듈 이름 */
export function reservedModuleNames(manifests: readonly LabModuleManifest[] = MODULE_MANIFESTS): Set<string> {
  const names = new Set<string>(COMMON_LIBRARY_NAMES);
  for (const [pkg, shim] of Object.entries(BUILTIN_SHIMS)) {
    names.add(pkg);
    names.add(shim);
  }
  for (const name of BUILTIN_PYTHON_MODULES) {
    names.add(name);
  }
  for (const manifest of manifests) {
    for (const [pkg, shim] of Object.entries(manifest.shims ?? {})) {
      names.add(pkg);
      names.add(shim);
    }
  }
  return names;
}

/** 파일 이름(a.py)에서 import 이름(a)을 뽑는다. .py가 아니거나 파이썬 이름 규칙에 맞지 않으면 null. */
export function moduleNameOfFile(fileName: string): string | null {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\.py$/u.exec(fileName);
  return match ? match[1]! : null;
}

/** 이 파일 이름이 가리는 라이브러리 이름. 가리지 않으면 null. */
export function shadowedName(fileName: string, reserved: ReadonlySet<string> = reservedModuleNames()): string | null {
  const name = moduleNameOfFile(fileName);
  if (name === null) {
    return null;
  }
  return reserved.has(name) ? name : null;
}

/**
 * 넣을 파일 이름을 다듬는다: 경로를 떼고 이름만 남기며, 빈 이름·숨김 파일(.으로 시작)·제어 문자·너무 긴 이름은 null.
 * 한글 이름은 그대로 둔다(Pyodide 파일시스템은 UTF-8 이름을 다룬다).
 */
export function sanitizeUploadName(name: string): string | null {
  const base = (name.split(/[\\/]/u).pop() ?? '').trim();
  if (base === '' || base === '.' || base === '..' || base.startsWith('.') || base.length > MAX_UPLOAD_NAME_LENGTH) {
    return null;
  }
  if (/[\p{Cc}:*?"<>|]/u.test(base)) {
    return null;
  }
  return base;
}

/** 가리는 파일을 넣지 않았을 때의 안내 */
export function shadowRefusedMessage(fileName: string, name: string): string {
  return (
    `'${fileName}'은(는) 파이썬 라이브러리 이름 '${name}'과(와) 같아서 작업 폴더에 넣지 않았어요. ` +
    `이름이 같으면 import ${name}이(가) 진짜 라이브러리 대신 내 파일을 불러 오류가 나요. 파일 이름을 바꿔 주세요(예: my_${name}.py).`
  );
}
