// 예제 이관 본체(PLAN §8.0 PD-33, §3.3, CODE_MAPPING §2.2 머리말) — scripts/import-examples.mjs(CLI)와 단위 테스트가 부른다.
//
// 하는 일
// 1. 목록 파일(scripts/examples-manifest.yaml)의 항목마다 원본 zip 멤버(또는 낱개 원본 파일)를 메모리에서 읽는다(zip-read.mjs).
// 2. 줄 끝만 CRLF → LF로 바꾼다. 그 밖에는 한 바이트도 고치지 않는다(BOM·끝 줄바꿈·공백 그대로 — 줄 번호가 교과서와 같아야 한다, PD-10).
//    **유일한 예외는 개인정보다**(DECISIONS 저작권 예외): 항목에 privacy: [mac]을 적으면 기기 주소(MAC·BLE)를 같은 글자 수의
//    자리표시자 XX:XX:XX:XX:XX:XX로 바꾼다(줄·칸 위치 그대로). 적지 않았는데 주소가 있으면 옮기기가 멈춘다(안전망).
// 3. 원본과 옮긴 글의 줄 수가 같은지(원본은 파이썬의 줄 규칙 \r\n·\r·\n 모두, 옮긴 글은 \n) 확인하고, 파이썬 구문을 검사한다:
//    - 이 컴퓨터에 파이썬 3이 있으면 `python -c "ast.parse(...)"`(정확한 검사, 실행은 하지 않음),
//    - 없으면 Node의 가벼운 검사(괄호 짝·따옴표·들여쓰기 섞임)만.
//    원본 결함으로 구문 오류가 나는 파일(f074, CODE_MAPPING §2.2)은 항목에 expect_syntax_error: true를 적어 두면 통과한다.
// 4. examples/<대상 경로>에 쓰고, 항목에 기록(lines·sha256·syntax·syntax_checker·imported)을 적어 목록 파일을 다시 저장한다(주석 보존).
// 5. 같은 이름의 사이드카(<대상>.meta.yaml — 제목·설명·차시·쪽·태그·패키지, ESP32 예제면 배선 parts·스모크 기대 smoke)가 없으면 항목의 meta로 만든다. 있으면 건드리지 않는다.
//    원본 코드 파일에는 머리말을 넣지 않는다(src/lab/README.md 2절). 사이트는 사이드카를 읽는다(src/lab/controls/example-sidecar.ts).
// 6. --verify: 원본 없이(CI·다른 컴퓨터) examples/의 파일이 기록(sha256·줄 수)과 같은지 본다. tests/unit/import-examples.test.ts가 저장소에 대고 돌린다.
//
// 저작자 구분(author): operator(운영자 자료, DECISIONS O2~O5) / third_party(다른 저작자 — 대상 경로에 third-party/ 폴더가 있어야 한다, PD-26).
// 추출 사본(extracted/flat)은 줄 끝이 손상돼 있으므로 쓰지 않는다(PD-33). 원본 폴더 위치는 목록의 materials_root 또는 --materials로 정한다
// (운영자 PC = 저장소 뿌리, 클라우드 = 비공개 자료 저장소의 originals/).

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { toPosixPath } from './glob.mjs';
import { openZip } from './zip-read.mjs';

export const MANIFEST_FILE = 'scripts/examples-manifest.yaml';
export const SIDECAR_SUFFIX = '.meta.yaml';
export const EXAMPLES_ROOT = 'examples/';
export const AUTHOR_KINDS = Object.freeze(['operator', 'third_party']);
export const THIRD_PARTY_SEGMENT = 'third-party';

/** 대상 경로 규칙(PD-09): examples/ 아래, 영문 소문자·숫자·하이픈·밑줄 폴더와 .py 파일 */
const TARGET_PATTERN = /^examples\/(?:[a-z0-9][a-z0-9_-]*\/)+[a-z0-9][a-z0-9_-]*\.py$/u;
/**
 * 보드 라이브러리 폴더(examples/esp32/lib/) 안은 **파일 이름이 곧 import 이름**이라 대문자를 허용한다(Phase 4 준비 2026-09-18).
 * 예: ESP32BLE.py — 학생 코드가 `import ESP32BLE`로 부르므로 소문자로 바꾸면 원본도 실물 보드도 돌지 않는다.
 * 폴더 이름은 그대로 소문자만 쓴다(PD-09). 같은 규칙이 src/lab/esp32/board-libraries.ts에도 있다.
 */
export const BOARD_LIBRARY_TARGET_PREFIX = 'examples/esp32/lib/';
const LIBRARY_TARGET_PATTERN = /^examples\/esp32\/lib\/(?:[a-z0-9][a-z0-9_-]*\/)*[A-Za-z0-9][A-Za-z0-9_-]*\.py$/u;
const ID_PATTERN = /^[a-z][a-z0-9-]*$/u;

/** 대상 경로가 규칙에 맞나(보드 라이브러리 폴더는 대문자 파일 이름을 허용) */
export function isValidTarget(target) {
  return target.startsWith(BOARD_LIBRARY_TARGET_PREFIX) ? LIBRARY_TARGET_PATTERN.test(target) : TARGET_PATTERN.test(target);
}

/**
 * 기기 주소(MAC·BLE) 모양과 자리표시자 — 개인정보라 공개 저장소에 실제 값을 두지 않는다(PLAN §10, DECISIONS 저작권 예외).
 * 자리표시자는 글자 수가 같아(17자) 줄·칸 위치가 원본과 같다. 구분 기호(: 또는 -)는 원본 그대로 둔다.
 * scripts/lib/repo-check.mjs의 MAC 검사와 같은 모양이다(X는 16진수가 아니라서 자리표시자는 걸리지 않는다).
 */
const DEVICE_ADDRESS = /(?<![0-9A-Fa-f:-])[0-9A-Fa-f]{2}([:-])[0-9A-Fa-f]{2}(?:\1[0-9A-Fa-f]{2}){4}(?![0-9A-Fa-f:-])/gu;
export const PRIVACY_KINDS = Object.freeze(['mac']);

/**
 * @typedef {object} ManifestExample
 * @property {string} id            기록 id(예: f026 — docs/CODE_MAPPING.md의 코드 id)
 * @property {string} source        sources 표의 이름(zip) 또는 낱개 파일이면 'file'
 * @property {string} member        zip 안 경로(/ 구분) 또는 낱개 파일 경로(원본 폴더 기준)
 * @property {string} target        저장소 기준 대상 경로(examples/…py)
 * @property {'operator' | 'third_party'} author
 * @property {boolean} [expect_syntax_error] 원본 결함으로 구문 오류가 나는 파일(f074)
 * @property {string[]} [privacy]   가릴 개인정보 종류(지금은 mac만 — BLE·MAC 주소를 XX:XX:XX:XX:XX:XX로)
 * @property {Record<string, unknown>} [meta] 사이드카를 처음 만들 때 쓸 제목·설명 등
 * @property {number} [lines]        기록: 줄 수
 * @property {string} [sha256]       기록: 옮긴 파일의 SHA-256
 * @property {string} [syntax]       기록: ok | error-expected
 * @property {string} [syntax_checker] 기록: python-ast | node-light
 * @property {string} [imported]     기록: 날짜 YYYY-MM-DD
 */

// ── 글자 처리 ──

/**
 * 줄 끝을 CRLF → LF로만 바꾼다. 홀로 있는 CR(\r)은 바꾸지 않고 개수만 알린다(원본 검토 대상).
 * @param {string} text
 */
export function normalizeLineEndings(text) {
  let crlf = 0;
  const converted = text.replace(/\r\n/gu, () => {
    crlf += 1;
    return '\n';
  });
  const loneCr = (converted.match(/\r/gu) ?? []).length;
  return { text: converted, crlf, loneCr };
}

/**
 * 파이썬이 세는 줄 수(str.splitlines 규칙: \r\n·\r·\n 모두 줄 끝, 마지막 줄바꿈 뒤의 빈 줄은 세지 않음).
 * @param {string} text
 */
export function countPythonLines(text) {
  if (text === '') {
    return 0;
  }
  const parts = text.split(/\r\n|\r|\n/u);
  return /(?:\r\n|\r|\n)$/u.test(text) ? parts.length - 1 : parts.length;
}

/**
 * LF 기준 줄 수(옮긴 파일).
 * @param {string} text
 */
export function countLfLines(text) {
  if (text === '') {
    return 0;
  }
  const parts = text.split('\n');
  return text.endsWith('\n') ? parts.length - 1 : parts.length;
}

/**
 * 기기 주소(MAC·BLE)를 자리표시자로 바꾼다. 글자 수가 같아 줄 수·칸 위치가 그대로다.
 * 원본 코드를 고치지 않는 것이 원칙(PD-10)이지만 **개인정보는 유일한 예외**다(DECISIONS 저작권 예외, PLAN §10).
 * 자료의 BLE 주소는 교안 화면과 같은 실제 기기 주소라 공개 저장소에 두지 않는다 — 브라우저는 주소로 연결하지 않으므로(Web Bluetooth 선택 창)
 * 학습에도 값이 필요 없다(PLAN §7.3 "MAC 주소로는 연결할 수 없다").
 * @param {string} text
 * @returns {{ text: string, count: number }}
 */
export function redactDeviceAddresses(text) {
  let count = 0;
  const redacted = text.replace(DEVICE_ADDRESS, (_match, separator) => {
    count += 1;
    return ['XX', 'XX', 'XX', 'XX', 'XX', 'XX'].join(separator);
  });
  return { text: redacted, count };
}

/** 글에 기기 주소(MAC·BLE) 모양이 남아 있나 */
export function hasDeviceAddress(text) {
  DEVICE_ADDRESS.lastIndex = 0;
  return DEVICE_ADDRESS.test(text);
}

/** @param {Buffer | string} data */
export function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ── 파이썬 구문 검사 ──

/** @type {string[] | null | undefined} */
let cachedPython;

/**
 * 이 컴퓨터의 파이썬 3 명령을 찾는다(python → python3 → py -3). 없으면 null.
 * @param {{ candidates?: string[][] }} [options]
 * @returns {string[] | null}
 */
export function findPython(options = {}) {
  if (!options.candidates && cachedPython !== undefined) {
    return cachedPython;
  }
  const candidates = options.candidates ?? [['python'], ['python3'], ['py', '-3']];
  let found = null;
  for (const candidate of candidates) {
    const result = spawnSync(candidate[0], [...candidate.slice(1), '--version'], { encoding: 'utf8', timeout: 10_000 });
    const text = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    if (!result.error && result.status === 0 && /^Python 3\.\d+/u.test(text.trim())) {
      found = candidate;
      break;
    }
  }
  if (!options.candidates) {
    cachedPython = found;
  }
  return found;
}

const AST_PARSE_SCRIPT = [
  'import ast, sys',
  "source = sys.stdin.buffer.read().decode('utf-8')",
  'try:',
  "    ast.parse(source, filename='<example>')",
  'except SyntaxError as error:',
  "    print(f'{type(error).__name__}: {error.msg} (line {error.lineno})')",
  '    sys.exit(2)',
].join('\n');

/**
 * 파이썬 ast.parse로 구문을 검사한다(실행하지 않는다).
 * @param {string} source
 * @param {string[]} python
 * @returns {{ ok: boolean, message: string | null }}
 */
export function pythonAstCheck(source, python) {
  const result = spawnSync(python[0], [...python.slice(1), '-c', AST_PARSE_SCRIPT], {
    input: source,
    encoding: 'utf8',
    timeout: 30_000,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  if (result.error) {
    throw new Error(`파이썬을 실행하지 못했어요: ${result.error.message}`);
  }
  if (result.status === 0) {
    return { ok: true, message: null };
  }
  const message = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').pop() ?? 'SyntaxError';
  return { ok: false, message };
}

/**
 * 파이썬 없이 하는 가벼운 검사: 괄호 짝, 닫히지 않은 따옴표, 탭과 공백이 섞인 들여쓰기. 구문 오류를 모두 잡지는 못한다.
 * @param {string} source
 * @returns {{ ok: boolean, message: string | null }}
 */
export function nodeLightSyntaxCheck(source) {
  const pairs = { ')': '(', ']': '[', '}': '{' };
  /** @type {{ char: string, line: number }[]} */
  const stack = [];
  let line = 1;
  let quote = null;
  let tripleQuote = null;
  let sawTabIndent = false;
  let sawSpaceIndent = false;
  let lineStart = true;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\n') {
      if (quote !== null && tripleQuote === null) {
        return { ok: false, message: `${line}번 줄: 닫히지 않은 따옴표(${quote})가 있어요.` };
      }
      line += 1;
      lineStart = true;
      continue;
    }
    if (lineStart) {
      if (char === '\t') {
        sawTabIndent = true;
      } else if (char === ' ') {
        sawSpaceIndent = true;
      } else {
        lineStart = false;
      }
      if (lineStart) {
        continue;
      }
    }
    if (tripleQuote !== null) {
      if (source.startsWith(tripleQuote, index)) {
        tripleQuote = null;
        quote = null;
        index += 2;
      } else if (char === '\\') {
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (char === '\\') {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '#') {
      while (index + 1 < source.length && source[index + 1] !== '\n') {
        index += 1;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      const triple = char.repeat(3);
      if (source.startsWith(triple, index)) {
        tripleQuote = triple;
        quote = char;
        index += 2;
      } else {
        quote = char;
      }
      continue;
    }
    if (char === '(' || char === '[' || char === '{') {
      stack.push({ char, line });
    } else if (char === ')' || char === ']' || char === '}') {
      const open = stack.pop();
      if (!open || open.char !== pairs[char]) {
        return { ok: false, message: `${line}번 줄: 괄호 "${char}"의 짝이 맞지 않아요.` };
      }
    }
  }
  if (tripleQuote !== null) {
    return { ok: false, message: '닫히지 않은 세 따옴표 문자열이 있어요.' };
  }
  if (quote !== null) {
    return { ok: false, message: `${line}번 줄: 닫히지 않은 따옴표(${quote})가 있어요.` };
  }
  if (stack.length > 0) {
    const open = stack[stack.length - 1];
    return { ok: false, message: `${open.line}번 줄: 괄호 "${open.char}"이(가) 닫히지 않았어요.` };
  }
  if (sawTabIndent && sawSpaceIndent) {
    return { ok: false, message: '탭과 공백 들여쓰기가 섞여 있어요(파이썬 3은 TabError).' };
  }
  return { ok: true, message: null };
}

/**
 * 구문 검사: 파이썬이 있으면 ast.parse, 없으면 가벼운 검사.
 * @param {string} source
 * @param {{ python?: string[] | null }} [options] python: 명령(찾지 않으려면 null)
 * @returns {{ ok: boolean, message: string | null, checker: 'python-ast' | 'node-light' }}
 */
export function checkPythonSyntax(source, options = {}) {
  const python = options.python === undefined ? findPython() : options.python;
  if (python) {
    return { ...pythonAstCheck(source, python), checker: 'python-ast' };
  }
  return { ...nodeLightSyntaxCheck(source), checker: 'node-light' };
}

// ── 목록 파일 ──

/**
 * 목록 파일 글자를 읽어 검사한다. 주석을 지키려고 yaml Document도 함께 돌려준다.
 * @param {string} text
 * @returns {{ doc: YAML.Document, materialsRoot: string, sources: Record<string, string>, examples: ManifestExample[], errors: string[] }}
 */
export function parseManifest(text) {
  const doc = YAML.parseDocument(text);
  /** @type {string[]} */
  const errors = [];
  for (const warning of doc.errors) {
    errors.push(`YAML 오류: ${warning.message}`);
  }
  const raw = doc.toJS() ?? {};
  const materialsRoot = typeof raw.materials_root === 'string' && raw.materials_root.trim() !== '' ? raw.materials_root : '.';
  /** @type {Record<string, string>} */
  const sources = {};
  if (raw.sources && typeof raw.sources === 'object') {
    for (const [name, value] of Object.entries(raw.sources)) {
      if (typeof value !== 'string' || value.trim() === '') {
        errors.push(`sources.${name}: zip 경로를 글자로 적어요.`);
      } else if (!/^[a-z][a-z0-9-]*$/u.test(name)) {
        errors.push(`sources.${name}: 이름은 영문 소문자·숫자·하이픈으로 적어요.`);
      } else {
        sources[name] = value;
      }
    }
  }
  /** @type {ManifestExample[]} */
  const examples = [];
  const seenIds = new Set();
  const seenTargets = new Set();
  const list = Array.isArray(raw.examples) ? raw.examples : [];
  if (!Array.isArray(raw.examples)) {
    errors.push('examples 목록이 없어요.');
  }
  list.forEach((item, index) => {
    const where = `examples ${index + 1}번째 항목`;
    if (!item || typeof item !== 'object') {
      errors.push(`${where}: 항목은 id·source·member·target·author를 가진 사전이어야 해요.`);
      return;
    }
    const entry = /** @type {Record<string, unknown>} */ (item);
    const id = typeof entry.id === 'string' ? entry.id : '';
    const label = id ? `${where}(${id})` : where;
    if (!ID_PATTERN.test(id)) {
      errors.push(`${label}: id는 f026처럼 영문 소문자·숫자·하이픈으로 적어요.`);
    } else if (seenIds.has(id)) {
      errors.push(`${label}: id가 앞의 항목과 겹쳐요.`);
    }
    seenIds.add(id);
    const source = typeof entry.source === 'string' ? entry.source : '';
    if (source !== 'file' && !(source in sources)) {
      errors.push(`${label}: source "${source}"이(가) sources 표에 없어요(낱개 파일이면 file).`);
    }
    const member = typeof entry.member === 'string' ? entry.member : '';
    if (member.trim() === '' || member.includes('\\') || member.split('/').includes('..')) {
      errors.push(`${label}: member는 zip 안 경로(또는 원본 파일 경로)를 /로 적어요.`);
    }
    const target = typeof entry.target === 'string' ? entry.target : '';
    if (!isValidTarget(target)) {
      errors.push(
        `${label}: target "${target}"은(는) examples/ 아래 영문 소문자·숫자·하이픈 경로의 .py 파일이어야 해요(예: examples/vision/u1/1-2-1-webcam-flip.py). ` +
          `보드 라이브러리(${BOARD_LIBRARY_TARGET_PREFIX} 아래)만 파일 이름에 대문자를 쓸 수 있어요(파일 이름이 곧 import 이름이라서).`,
      );
    } else if (seenTargets.has(target)) {
      errors.push(`${label}: target이 앞의 항목과 겹쳐요.`);
    }
    seenTargets.add(target);
    const author = typeof entry.author === 'string' ? entry.author : '';
    if (!AUTHOR_KINDS.includes(author)) {
      errors.push(`${label}: author는 operator 또는 third_party로 적어요.`);
    } else {
      const inThirdParty = target.split('/').includes(THIRD_PARTY_SEGMENT);
      if (author === 'third_party' && !inThirdParty) {
        errors.push(`${label}: 다른 저작자(third_party)의 파일은 third-party/ 폴더 아래에 둬요(PD-26). 예: examples/esp32/lib/third-party/i2c_lcd.py`);
      }
      if (author === 'operator' && inThirdParty) {
        errors.push(`${label}: 운영자 자료(operator)는 third-party/ 폴더에 두지 않아요.`);
      }
    }
    if (entry.expect_syntax_error !== undefined && typeof entry.expect_syntax_error !== 'boolean') {
      errors.push(`${label}: expect_syntax_error는 true 또는 false로 적어요.`);
    }
    /** @type {string[]} */
    const privacy = [];
    if (entry.privacy !== undefined) {
      if (!Array.isArray(entry.privacy)) {
        errors.push(`${label}: privacy는 가릴 개인정보 종류 목록으로 적어요(지금은 mac만). 예: privacy: [mac]`);
      } else {
        for (const kind of entry.privacy) {
          if (typeof kind !== 'string' || !PRIVACY_KINDS.includes(kind)) {
            errors.push(`${label}: privacy에는 ${PRIVACY_KINDS.join('·')}만 적을 수 있어요(지금: ${JSON.stringify(kind)}).`);
          } else if (!privacy.includes(kind)) {
            privacy.push(kind);
          }
        }
      }
    }
    if (entry.meta !== undefined && (entry.meta === null || typeof entry.meta !== 'object' || Array.isArray(entry.meta))) {
      errors.push(`${label}: meta는 title·description 등을 가진 사전으로 적어요.`);
    }
    examples.push(/** @type {ManifestExample} */ ({
      id,
      source,
      member,
      target,
      author,
      ...(privacy.length > 0 ? { privacy } : {}),
      ...(entry.expect_syntax_error === true ? { expect_syntax_error: true } : {}),
      ...(entry.meta && typeof entry.meta === 'object' ? { meta: /** @type {Record<string, unknown>} */ (entry.meta) } : {}),
      ...(typeof entry.lines === 'number' ? { lines: entry.lines } : {}),
      ...(typeof entry.sha256 === 'string' ? { sha256: entry.sha256 } : {}),
      ...(typeof entry.syntax === 'string' ? { syntax: entry.syntax } : {}),
      ...(typeof entry.syntax_checker === 'string' ? { syntax_checker: entry.syntax_checker } : {}),
      ...(entry.imported !== undefined ? { imported: String(entry.imported) } : {}),
    }));
  });
  return { doc, materialsRoot, sources, examples, errors };
}

/**
 * @param {string} rootDir
 * @param {string} [manifestPath]
 */
export function loadManifest(rootDir, manifestPath = MANIFEST_FILE) {
  const absolutePath = path.resolve(rootDir, manifestPath);
  if (!fs.existsSync(absolutePath)) {
    return { ...parseManifest('examples: []'), errors: [`목록 파일 ${manifestPath}이(가) 없어요.`], absolutePath };
  }
  return { ...parseManifest(fs.readFileSync(absolutePath, 'utf8')), absolutePath };
}

// ── 사이드카 ──

/** 사이드카 경로: examples/vision/u1/a.py → examples/vision/u1/a.meta.yaml */
export function sidecarPathFor(target) {
  return target.replace(/\.py$/u, SIDECAR_SUFFIX);
}

/**
 * 사이드카 기본 내용을 만든다(항목의 meta + 원본 이름에서 읽은 쪽·차시). 파일 머리말 규약(src/lab/README.md 3절)과 같은 필드다.
 * @param {ManifestExample} entry
 */
export function defaultSidecar(entry) {
  const meta = entry.meta ?? {};
  const memberName = entry.member.split('/').pop() ?? entry.member;
  const pageMatch = /\(p(\d+)\)/u.exec(memberName);
  const lessonMatch = /(\d-\d-\d)/u.exec(memberName);
  const baseTitle = memberName.replace(/\.py$/iu, '').replace(/^\[[^\]]*\]\s*/u, '').replace(/_/gu, ' ');
  const folder = entry.target.split('/')[1] ?? '';
  /** @type {Record<string, unknown>} */
  const sidecar = {
    title: typeof meta.title === 'string' && meta.title.trim() !== '' ? meta.title : baseTitle,
    description: typeof meta.description === 'string' ? meta.description : '',
  };
  const lesson = typeof meta.lesson === 'string' ? meta.lesson : lessonMatch?.[1] ?? '';
  if (lesson) {
    sidecar.lesson = lesson;
  }
  const page = typeof meta.page === 'number' ? meta.page : pageMatch ? Number(pageMatch[1]) : null;
  if (page !== null) {
    sidecar.page = page;
  }
  sidecar.source_id = entry.id;
  sidecar.tags = Array.isArray(meta.tags) ? meta.tags : [];
  sidecar.packages = Array.isArray(meta.packages) ? meta.packages : folder === 'vision' ? ['opencv-python'] : [];
  // ESP32 예제의 배선(src/lab/README.md 7.4)·예제 스모크 기대 결과(tests/e2e/examples-smoke.spec.ts)·실습 방법은 씨앗에 있으면 그대로 옮긴다(P3-02).
  if (Array.isArray(meta.parts)) {
    sidecar.parts = meta.parts;
  }
  if (meta.smoke && typeof meta.smoke === 'object' && !Array.isArray(meta.smoke)) {
    sidecar.smoke = meta.smoke;
  }
  if (Array.isArray(meta.practice)) {
    sidecar.practice = meta.practice;
  }
  return sidecar;
}

const SIDECAR_HEADER =
  '# 예제 설명(사이드카). 원본 코드 파일은 줄 번호를 지키려고 고치지 않고, 제목·설명은 여기에 적어요(src/lab/README.md 3절).\n' +
  '# 처음 한 번은 scripts/import-examples.mjs가 만들고, 그 뒤로는 사람이 고쳐요(스크립트가 덮어쓰지 않아요).\n';

/** @param {Record<string, unknown>} sidecar */
export function serializeSidecar(sidecar) {
  return `${SIDECAR_HEADER}${YAML.stringify(sidecar, { lineWidth: 0 })}`;
}

// ── 이관 ──

/**
 * 원본을 읽는다(zip 멤버 또는 낱개 파일).
 * @param {ManifestExample} entry
 * @param {{ materialsDir: string, sources: Record<string, string>, zipCache: Map<string, ReturnType<typeof openZip>> }} context
 * @returns {Buffer}
 */
function readOriginal(entry, context) {
  if (entry.source === 'file') {
    const filePath = path.resolve(context.materialsDir, ...entry.member.split('/'));
    if (!fs.existsSync(filePath)) {
      throw new Error(`원본 파일이 없어요: ${entry.member} (원본 폴더 ${context.materialsDir})`);
    }
    return fs.readFileSync(filePath);
  }
  const zipRelative = context.sources[entry.source];
  const zipPath = path.resolve(context.materialsDir, ...zipRelative.split('/'));
  let zip = context.zipCache.get(zipPath);
  if (!zip) {
    if (!fs.existsSync(zipPath)) {
      throw new Error(`원본 zip이 없어요: ${zipRelative} (원본 폴더 ${context.materialsDir}). 운영자 PC의 원본 폴더나 --materials로 위치를 알려 주세요.`);
    }
    zip = openZip(zipPath);
    context.zipCache.set(zipPath, zip);
  }
  const member = zip.find(entry.member);
  if (!member) {
    const similar = zip.entries.filter((candidate) => !candidate.isDirectory && candidate.name.endsWith(entry.member.split('/').pop() ?? '')).map((candidate) => candidate.name);
    throw new Error(
      `zip "${zipRelative}"에 멤버 "${entry.member}"이(가) 없어요.${similar.length > 0 ? ` 비슷한 이름: ${similar.join(' | ')}` : ''}`,
    );
  }
  return zip.read(member);
}

/**
 * 원본 바이트를 검사·변환한다(파일을 쓰지는 않는다).
 * @param {Buffer} original
 * @param {ManifestExample} entry
 * @param {{ python?: string[] | null }} options
 */
export function convertOriginal(original, entry, options = {}) {
  /** @type {string[]} */
  const problems = [];
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(original);
  } catch {
    problems.push('원본이 UTF-8이 아니에요(CP949 등). 원본 인코딩을 확인한 뒤 옮겨요 — 파이썬 3은 UTF-8 소스만 그대로 읽어요.');
    return { text: '', lines: 0, originalLines: 0, redacted: 0, sha256: '', syntax: 'error', syntaxChecker: 'none', syntaxMessage: null, problems };
  }
  const originalLines = countPythonLines(text);
  const { text: lineFixed, loneCr } = normalizeLineEndings(text);
  // 개인정보 가리기(PD-10의 유일한 예외). 선언한 종류만 가리고, 선언하지 않았는데 주소가 있으면 옮기기를 멈춘다.
  const wantsMacRedaction = (entry.privacy ?? []).includes('mac');
  const { text: converted, count: redacted } = wantsMacRedaction ? redactDeviceAddresses(lineFixed) : { text: lineFixed, count: 0 };
  if (wantsMacRedaction && redacted === 0) {
    problems.push('privacy: [mac]이라고 적었는데 원본에 기기 주소(MAC·BLE) 모양이 없어요. 항목에서 그 줄을 빼요.');
  }
  if (!wantsMacRedaction && hasDeviceAddress(lineFixed)) {
    problems.push(
      '원본에 기기 주소(MAC·BLE) 모양이 있어요. 공개 저장소에 실제 기기 주소를 두지 않으므로 항목에 privacy: [mac]을 적어 ' +
        'XX:XX:XX:XX:XX:XX로 가려요(글자 수가 같아 줄·칸 위치는 그대로예요).',
    );
  }
  const lines = countLfLines(converted);
  if (loneCr > 0) {
    problems.push(`원본에 홀로 있는 CR(\\r)이 ${loneCr}개 있어요. 파이썬은 이것도 줄 끝으로 보므로 줄 번호가 어긋나요 — 원본을 확인해요.`);
  }
  if (originalLines !== lines) {
    problems.push(`줄 수가 달라요: 원본 ${originalLines}줄, 옮긴 글 ${lines}줄.`);
  }
  const check = checkPythonSyntax(converted, options);
  let syntax = 'ok';
  if (!check.ok) {
    if (entry.expect_syntax_error) {
      syntax = 'error-expected';
    } else {
      syntax = 'error';
      problems.push(`파이썬 구문 오류(${check.checker}): ${check.message ?? ''}. 원본 결함이면 항목에 expect_syntax_error: true를 적어요(f074처럼).`);
    }
  } else if (entry.expect_syntax_error) {
    problems.push('expect_syntax_error: true인데 구문 오류가 없어요. 항목에서 그 줄을 지워요.');
  }
  return {
    text: converted,
    lines,
    originalLines,
    redacted,
    sha256: sha256Hex(Buffer.from(converted, 'utf8')),
    syntax,
    syntaxChecker: check.checker,
    syntaxMessage: check.message,
    problems,
  };
}

/**
 * 목록 항목을 옮긴다.
 * @param {{
 *   rootDir: string,
 *   manifestPath?: string,
 *   materialsRoot?: string,
 *   ids?: readonly string[],
 *   python?: string[] | null,
 *   write?: boolean,
 *   today?: string,
 * }} options
 */
export function importExamples(options) {
  const rootDir = path.resolve(options.rootDir);
  const manifestPath = options.manifestPath ?? MANIFEST_FILE;
  const manifest = loadManifest(rootDir, manifestPath);
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const write = options.write ?? true;
  /** @type {{ id: string, target: string, ok: boolean, lines: number, sha256: string, syntax: string, syntaxChecker: string, problems: string[], sidecar: 'created' | 'kept' | 'skipped' }[]} */
  const results = [];
  /** @type {string[]} */
  const errors = [...manifest.errors];
  if (errors.length > 0) {
    return { ok: false, results, errors, summary: '목록 파일에 문제가 있어요.' };
  }
  const wanted = options.ids && options.ids.length > 0 ? new Set(options.ids) : null;
  if (wanted) {
    for (const id of wanted) {
      if (!manifest.examples.some((entry) => entry.id === id)) {
        errors.push(`목록에 id "${id}" 항목이 없어요.`);
      }
    }
  }
  const materialsDir = path.resolve(rootDir, options.materialsRoot ?? manifest.materialsRoot);
  const context = { materialsDir, sources: manifest.sources, zipCache: new Map() };
  const selected = manifest.examples.filter((entry) => !wanted || wanted.has(entry.id));
  const entryNodes = manifest.doc.get('examples');

  selected.forEach((entry) => {
    /** @type {string[]} */
    let problems = [];
    let converted = null;
    try {
      const original = readOriginal(entry, context);
      converted = convertOriginal(original, entry, { python: options.python });
      problems = converted.problems;
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
    const ok = problems.length === 0 && converted !== null;
    let sidecar = 'skipped';
    if (ok && write && converted) {
      const targetPath = path.resolve(rootDir, ...entry.target.split('/'));
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, converted.text, 'utf8');
      const sidecarPath = path.resolve(rootDir, ...sidecarPathFor(entry.target).split('/'));
      if (fs.existsSync(sidecarPath)) {
        sidecar = 'kept';
      } else {
        fs.writeFileSync(sidecarPath, serializeSidecar(defaultSidecar(entry)), 'utf8');
        sidecar = 'created';
      }
      // 기록을 목록 문서에 적는다(주석은 그대로 남는다).
      const index = manifest.examples.indexOf(entry);
      const node = entryNodes && typeof entryNodes === 'object' && 'get' in entryNodes ? /** @type {YAML.YAMLSeq} */ (entryNodes).get(index) : null;
      if (node && typeof node === 'object' && 'set' in node) {
        const map = /** @type {YAML.YAMLMap} */ (node);
        map.set('lines', converted.lines);
        map.set('sha256', converted.sha256);
        map.set('syntax', converted.syntax);
        map.set('syntax_checker', converted.syntaxChecker);
        if (converted.redacted > 0) {
          map.set('redacted', converted.redacted);
        }
        map.set('imported', today);
      }
    }
    results.push({
      id: entry.id,
      target: entry.target,
      ok,
      lines: converted?.lines ?? 0,
      sha256: converted?.sha256 ?? '',
      syntax: converted?.syntax ?? 'error',
      syntaxChecker: converted?.syntaxChecker ?? 'none',
      problems,
      sidecar,
    });
  });

  const failed = results.filter((result) => !result.ok);
  for (const result of failed) {
    errors.push(`${result.id} → ${result.target}\n  - ${result.problems.join('\n  - ')}`);
  }
  if (write && results.some((result) => result.ok)) {
    fs.writeFileSync(manifest.absolutePath, manifest.doc.toString({ lineWidth: 0 }), 'utf8');
  }
  const okCount = results.length - failed.length;
  return {
    ok: errors.length === 0,
    results,
    errors,
    summary: `${okCount}개 옮김, ${failed.length}개 실패${write ? '' : '(쓰지 않음)'}`,
  };
}

/**
 * 원본 없이 기록과 대조한다: 대상 파일이 있고 sha256·줄 수가 기록과 같은지, 줄 끝이 LF인지, 사이드카가 있는지.
 * @param {{ rootDir: string, manifestPath?: string }} options
 */
export function verifyExamples(options) {
  const rootDir = path.resolve(options.rootDir);
  const manifest = loadManifest(rootDir, options.manifestPath ?? MANIFEST_FILE);
  /** @type {string[]} */
  const problems = [...manifest.errors];
  let checked = 0;
  for (const entry of manifest.examples) {
    const targetPath = path.resolve(rootDir, ...entry.target.split('/'));
    if (entry.sha256 === undefined || entry.lines === undefined) {
      problems.push(`${entry.id}: 아직 옮기지 않았어요(기록 없음). node scripts/import-examples.mjs ${entry.id}`);
      continue;
    }
    if (!fs.existsSync(targetPath)) {
      problems.push(`${entry.id}: 대상 파일 ${entry.target}이(가) 없어요.`);
      continue;
    }
    const data = fs.readFileSync(targetPath);
    const text = data.toString('utf8');
    const hash = sha256Hex(data);
    if (hash !== entry.sha256) {
      problems.push(`${entry.id}: ${entry.target}의 내용이 기록과 달라요(sha256). 원본에서 다시 옮기거나(node scripts/import-examples.mjs ${entry.id}) 사이트판 수정이면 PD-10 규칙대로 별도 파일로 둬요.`);
    }
    if (text.includes('\r')) {
      problems.push(`${entry.id}: ${entry.target}에 CR(\\r)이 남아 있어요(줄 끝은 LF만).`);
    }
    const lines = countLfLines(text);
    if (lines !== entry.lines) {
      problems.push(`${entry.id}: ${entry.target}의 줄 수(${lines})가 기록(${entry.lines})과 달라요.`);
    }
    const sidecarPath = path.resolve(rootDir, ...sidecarPathFor(entry.target).split('/'));
    if (!fs.existsSync(sidecarPath)) {
      problems.push(`${entry.id}: 사이드카 ${toPosixPath(sidecarPathFor(entry.target))}이(가) 없어요.`);
    }
    checked += 1;
  }
  return { ok: problems.length === 0, problems, checked, total: manifest.examples.length };
}
