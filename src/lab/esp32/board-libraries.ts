/**
 * 보드 라이브러리(examples/esp32/lib/ 아래 .py) 목록과 "이 코드가 부르는 라이브러리" 찾기 — 순수 함수(병렬 제작 준비 2026-09-17).
 *
 * 보드 라이브러리는 학생 코드가 import하는 사이트 제공 파일이다: i2c_lcd.py(P3-04, third-party/), servo_library.py(P3-03, 운영자 원고 복원),
 * gorillacell_dcmotors.py(P3-05, third-party/) 등. 한 파일을 두 곳이 같이 쓴다.
 * - 가상 보드: 보드 모듈(src/lab/modules/board/index.ts)이 파이썬이 준비될 때마다 워커의 /board/lib/<파일 이름>에 써 넣는다(sys.path에 있음).
 * - 실물 보드(P3-08 [보드에 저장]): librariesNeededBy(코드)로 코드가 부르는 라이브러리를 골라 main.py와 함께 보드에 올린다.
 * 규칙(검사 — boardLibrariesFromFiles가 오류를 던져 빌드가 멈춘다): 파일 이름 = import 이름(영문 소문자로 시작, 소문자·숫자·밑줄),
 * 폴더(third-party/ 포함)가 달라도 파일 이름은 하나뿐, 사이트 흉내 모듈 이름(apc_로 시작)·가상 보드 붙박이 이름(machine·micropython 등)과 겹치면 안 된다.
 * 이 파일은 glob을 쓰지 않는다(Node 테스트·Playwright에서도 import) — 파일 묶음은 board-library-files.ts.
 */

export interface BoardLibrary {
  /** import 이름(i2c_lcd) */
  readonly name: string;
  /** 보드에 쓸 파일 이름(i2c_lcd.py) */
  readonly fileName: string;
  /** examples/ 뒤 경로(esp32/lib/third-party/i2c_lcd.py) */
  readonly file: string;
  /** 다른 저작자의 파일인지(third-party/ 폴더) */
  readonly thirdParty: boolean;
  readonly source: string;
}

/** 라이브러리 폴더(examples/ 뒤) */
export const BOARD_LIBRARY_PREFIX = 'esp32/lib/';

/** 보드 라이브러리가 쓸 수 없는 이름(가상 보드 붙박이 모듈·MicroPython 내장 모듈과 겹치면 학생 코드가 엉뚱한 파일을 받는다) */
export const RESERVED_LIBRARY_NAMES: readonly string[] = Object.freeze([
  'machine',
  'micropython',
  'time',
  'utime',
  'errno',
  'uerrno',
  'bluetooth',
  'ubluetooth',
  'network',
  'neopixel',
  'esp',
  'esp32',
  'os',
  'sys',
  'struct',
  'json',
  'math',
  'random',
  'gc',
  'select',
  'socket',
  'framebuf',
]);

const NAME_PATTERN = /^[a-z][a-z0-9_]*$/u;

/** glob 경로(/examples/esp32/lib/third-party/i2c_lcd.py) → examples/ 뒤 경로(esp32/lib/third-party/i2c_lcd.py). 라이브러리 폴더 밖이면 null */
export function boardLibraryFileFromPath(globPath: string): string | null {
  const normalized = globPath.replace(/\\/gu, '/');
  const at = normalized.lastIndexOf(`/${BOARD_LIBRARY_PREFIX}`);
  if (at < 0) {
    return null;
  }
  const file = normalized.slice(at + 1);
  return file.endsWith('.py') ? file : null;
}

/**
 * import.meta.glob 결과 → 보드 라이브러리 목록(파일 이름 순). 규칙을 어기면 오류를 던진다(빌드가 멈춘다).
 */
export function boardLibrariesFromFiles(files: Readonly<Record<string, string>>): BoardLibrary[] {
  const libraries: BoardLibrary[] = [];
  const seen = new Map<string, string>();
  const errors: string[] = [];
  for (const [globPath, source] of Object.entries(files)) {
    const file = boardLibraryFileFromPath(globPath);
    if (!file) {
      continue;
    }
    const fileName = file.split('/').pop() ?? file;
    const name = fileName.replace(/\.py$/u, '');
    if (!NAME_PATTERN.test(name)) {
      errors.push(`examples/${file}: 보드 라이브러리 파일 이름은 import 이름이라 영문 소문자로 시작하고 소문자·숫자·밑줄만 써요.`);
      continue;
    }
    if (name.startsWith('apc_') || RESERVED_LIBRARY_NAMES.includes(name)) {
      errors.push(`examples/${file}: "${name}"은(는) 가상 보드·MicroPython이 이미 쓰는 이름이라 보드 라이브러리 이름으로 쓸 수 없어요.`);
      continue;
    }
    const existing = seen.get(name);
    if (existing) {
      errors.push(`examples/${file}: 파일 이름 ${fileName}이(가) examples/${existing}와(과) 겹쳐요. 보드에는 폴더 없이 한곳(/lib)에 올라가므로 이름이 하나여야 해요.`);
      continue;
    }
    seen.set(name, file);
    libraries.push({ name, fileName, file, thirdParty: file.split('/').includes('third-party'), source });
  }
  if (errors.length > 0) {
    throw new Error(`보드 라이브러리(examples/esp32/lib/)에 문제가 있어요.\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }
  return libraries.sort((a, b) => a.fileName.localeCompare(b.fileName, 'en'));
}

/** 줄 끝 주석과 글자(따옴표 안)를 대강 지운다 — import 줄 찾기용(완전한 파이썬 구문 분석은 아님) */
function stripStringsAndComments(code: string): string {
  return code
    .replace(/("""|''')[\s\S]*?\1/gu, '')
    .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/gu, '""')
    .replace(/#.*$/gmu, '');
}

/**
 * 코드가 import하는 모듈 이름(맨 앞 이름, 나온 순서·중복 없음): `import a, b.c as d` → a, b / `from x.y import z` → x. 점으로 시작하는 상대 import는 뺀다.
 * 들여쓴 줄(함수 안·try 안)의 import도 찾는다.
 */
export function importedModuleNames(code: string): string[] {
  const names: string[] = [];
  const add = (name: string | undefined) => {
    const head = name?.trim().split('.')[0]?.trim();
    if (head && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(head) && !names.includes(head)) {
      names.push(head);
    }
  };
  const text = stripStringsAndComments(code).replace(/\\\r?\n/gu, ' ');
  for (const statement of text.split(/[\r\n;]+/u)) {
    const line = statement.trim();
    const fromMatch = /^from\s+([A-Za-z_][\w.]*)\s+import\b/u.exec(line);
    if (fromMatch) {
      add(fromMatch[1]);
      continue;
    }
    const importMatch = /^import\s+(.+)$/u.exec(line);
    if (importMatch) {
      for (const part of importMatch[1]!.split(',')) {
        add(part.replace(/\s+as\s+\w+\s*$/u, ''));
      }
    }
  }
  return names;
}

/** 코드가 부르는 보드 라이브러리(라이브러리가 부르는 라이브러리까지, 목록 순서) */
export function librariesNeededBy(code: string, libraries: readonly BoardLibrary[]): BoardLibrary[] {
  const byName = new Map(libraries.map((library) => [library.name, library]));
  const needed = new Map<string, BoardLibrary>();
  const queue = [...importedModuleNames(code)];
  while (queue.length > 0) {
    const name = queue.shift()!;
    const library = byName.get(name);
    if (!library || needed.has(name)) {
      continue;
    }
    needed.set(name, library);
    queue.push(...importedModuleNames(library.source));
  }
  return libraries.filter((library) => needed.has(library.name));
}
