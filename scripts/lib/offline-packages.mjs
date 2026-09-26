// 오프라인 배포판에 넣을 Pyodide 패키지 고르기(PLAN §5.6, P6-07) — scripts/build-offline.mjs와 tests/unit/offline/packages.test.ts가 쓴다.
//
// 인터넷이 없는 교실에서 파이썬이 import하는 패키지 휠이 같은 사이트에 없으면 Pyodide가 받으려다 실패한다. 그래서
//   1. 사이트가 학생에게 주는 파이썬 코드 — 예제(examples/**/*.py), 사이트 흉내 모듈(src/lab/**/*.py), 차시 본문의 파이썬 코드 블록
//      (content/**/*.md의 ```python) — 에서 import하는 맨 앞 이름을 모으고,
//   2. pyodide-lock.json의 imports로 그 이름을 패키지에 잇고 depends를 끝까지 따라가(Pyodide가 받는 것과 같은 규칙),
//   3. 그 패키지들이 오프라인 표(src/lab/loader/pyodide-files.ts의 PYODIDE_OFFLINE_FILES)에 모두 있는지 본다.
// 표준 라이브러리·사이트 흉내 모듈(machine·pyautogui·mediapipe 등)은 lock에 없으므로 저절로 빠진다.
// 새 예제가 표에 없는 패키지를 쓰면 build:offline과 단위 테스트가 멈추고 무엇을 더할지 알린다.
import fs from 'node:fs';
import path from 'node:path';

/** 파이썬 식별자 */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/**
 * 파이썬 코드에서 import하는 맨 앞 모듈 이름을 모은다(`import a.b as c, d` → a, d / `from a.b import c` → a).
 * 상대 import(`from . import x`)와 문자열 안의 글자는 가리지 않는 단순 규칙이지만, 모자라게 잡기보다 넉넉하게 잡는 쪽이다
 * (잘못 잡힌 이름은 lock에 없어 저절로 빠진다).
 * @param {string} code
 * @returns {Set<string>}
 */
export function scanPythonImports(code) {
  const found = new Set();
  for (const line of code.split(/\r?\n/u)) {
    const importMatch = /^\s*import\s+(.+)$/u.exec(line);
    if (importMatch) {
      for (const part of importMatch[1].split(',')) {
        const name = part.trim().split(/\s+/u)[0]?.split('.')[0] ?? '';
        if (IDENTIFIER.test(name)) {
          found.add(name);
        }
      }
      continue;
    }
    const fromMatch = /^\s*from\s+([A-Za-z_][\w.]*)\s+import\s+/u.exec(line);
    if (fromMatch) {
      found.add(fromMatch[1].split('.')[0]);
    }
  }
  return found;
}

/**
 * 마크다운의 파이썬 코드 블록(```python, ```py) 본문들
 * @param {string} markdown
 * @returns {string[]}
 */
export function pythonCodeBlocks(markdown) {
  const blocks = [];
  for (const match of markdown.matchAll(/^```(?:python|py)\b[^\n]*\n([\s\S]*?)^```/gmu)) {
    blocks.push(match[1]);
  }
  return blocks;
}

/**
 * @typedef {object} PyodideLock
 * @property {Record<string, { name?: string, depends?: string[], imports?: string[], file_name?: string, sha256?: string }>} packages
 */

/**
 * import 이름 → lock 패키지 이름 표
 * @param {PyodideLock} lock
 * @returns {Map<string, string>}
 */
export function importIndex(lock) {
  const index = new Map();
  for (const [key, entry] of Object.entries(lock.packages)) {
    for (const name of entry.imports ?? []) {
      if (!index.has(name)) {
        index.set(name, key);
      }
    }
  }
  return index;
}

/**
 * 패키지와 기대는 패키지(depends)를 모두 모은다.
 * @param {Iterable<string>} packages lock의 키
 * @param {PyodideLock} lock
 * @returns {Set<string>}
 */
export function dependencyClosure(packages, lock) {
  const result = new Set();
  const visit = (key) => {
    if (result.has(key)) {
      return;
    }
    const entry = lock.packages[key];
    if (!entry) {
      throw new Error(`pyodide-lock.json에 "${key}" 패키지가 없어요.`);
    }
    result.add(key);
    for (const dependency of entry.depends ?? []) {
      visit(dependency);
    }
  };
  for (const key of packages) {
    visit(key);
  }
  return result;
}

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) {
    return out;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      walk(full, predicate, out);
    } else if (entry.isFile() && predicate(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * 저장소에서 사이트가 학생에게 주는 파이썬 코드의 import를 모은다.
 * @param {string} rootDir 저장소 뿌리
 * @returns {Map<string, string[]>} 모듈 이름 → 그 이름을 쓰는 파일(저장소 기준, / 구분)
 */
export function collectRepoImports(rootDir) {
  /** @type {Map<string, Set<string>>} */
  const byModule = new Map();
  const add = (names, file) => {
    const relative = path.relative(rootDir, file).split(path.sep).join('/');
    for (const name of names) {
      if (!byModule.has(name)) {
        byModule.set(name, new Set());
      }
      byModule.get(name).add(relative);
    }
  };
  const pythonFiles = [
    ...walk(path.join(rootDir, 'examples'), (name) => name.endsWith('.py')),
    ...walk(path.join(rootDir, 'src', 'lab'), (name) => name.endsWith('.py')),
  ];
  for (const file of pythonFiles) {
    add(scanPythonImports(fs.readFileSync(file, 'utf8')), file);
  }
  for (const file of walk(path.join(rootDir, 'content'), (name) => name.endsWith('.md'))) {
    for (const block of pythonCodeBlocks(fs.readFileSync(file, 'utf8'))) {
      add(scanPythonImports(block), file);
    }
  }
  return new Map([...byModule.entries()].map(([name, files]) => [name, [...files].sort()]));
}

/**
 * 오프라인판에 필요한 패키지와 표에 빠진 패키지.
 * @param {{ imports: Map<string, string[]>, lock: PyodideLock, tablePackages: Iterable<string> }} input
 *   tablePackages: 오프라인 표에 휠이 있는 패키지(lock 키 — numpy, opencv-python, pillow …)
 * @returns {{ needed: string[], missing: { package: string, via: string[] }[], importsByPackage: Record<string, string[]> }}
 */
export function offlinePackageCoverage({ imports, lock, tablePackages }) {
  const index = importIndex(lock);
  /** @type {Map<string, Set<string>>} 패키지 → 그 패키지를 부른 import 이름 */
  const direct = new Map();
  for (const name of imports.keys()) {
    const key = index.get(name);
    if (key) {
      if (!direct.has(key)) {
        direct.set(key, new Set());
      }
      direct.get(key).add(name);
    }
  }
  const needed = dependencyClosure(direct.keys(), lock);
  const have = new Set(tablePackages);
  /** @type {Record<string, string[]>} */
  const importsByPackage = {};
  for (const [key, names] of direct) {
    importsByPackage[key] = [...names].sort();
  }
  const missing = [...needed]
    .filter((key) => !have.has(key))
    .sort()
    .map((key) => {
      const via = (importsByPackage[key] ?? []).flatMap((name) => (imports.get(name) ?? []).slice(0, 3));
      return { package: key, via };
    });
  return { needed: [...needed].sort(), missing, importsByPackage };
}

/**
 * 표에 빠진 패키지를 알리는 한국어 문장(없으면 빈 글)
 * @param {{ package: string, via: string[] }[]} missing
 * @param {PyodideLock} lock
 */
export function describeMissingPackages(missing, lock) {
  if (missing.length === 0) {
    return '';
  }
  const lines = ['오프라인판 Pyodide 표(src/lab/loader/pyodide-files.ts의 PYODIDE_OFFLINE_EXTRA_FILES)에 없는 패키지를 예제·차시 코드가 써요:'];
  for (const item of missing) {
    const entry = lock.packages[item.package];
    lines.push(
      `  - ${item.package}(${entry?.file_name ?? '휠 이름 모름'}, SHA-256 ${entry?.sha256 ?? '?'})${item.via.length > 0 ? ` ← ${item.via.join(', ')}` : ' ← 다른 패키지가 기댐'}`,
    );
  }
  lines.push('  표에 한 줄씩 더해요: 이름·kind: package·package(lock 이름)·size(휠 크기, 바이트)·sha256(lock 값). 크기는 휠을 한 번 받아 재요.');
  return lines.join('\n');
}
