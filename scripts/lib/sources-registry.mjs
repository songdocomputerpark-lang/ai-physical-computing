// 출처 등록부(sources.yaml) 읽기·검사·짝짓기(PLAN §8.1 P1-04, §9.2, PD-26)
// scripts/check-sources.mjs(빌드 전·후 검사)와 /credits/ 페이지(src/lib/credits.ts)가 함께 쓴다.
// Node.js가 직접 실행하므로 TypeScript가 아닌 JavaScript(JSDoc 타입 표기)로 쓴다.

import { parseDocument } from 'yaml';
import { matchesGlob, validateGlob } from './glob.mjs';

/** 등록부 파일 이름(저장소 뿌리 기준) */
export const REGISTRY_FILE = 'sources.yaml';

/**
 * @typedef {'operator' | 'self' | 'stack' | 'library' | 'third_party' | 'reference'} SourceCategory
 */

/**
 * 검사를 통과한 등록부 항목
 * @typedef {object} SourceEntry
 * @property {string} name 자료 이름
 * @property {SourceCategory} category 분류
 * @property {string} author 저작자
 * @property {string} license 라이선스 이름
 * @property {string} used_in 사이트에서 쓰는 곳
 * @property {string | undefined} url 원래 자료 주소
 * @property {string[]} paths 이 항목에 속하는 파일 경로 패턴
 * @property {string[]} exclude_paths paths에서 뺄 경로 패턴
 * @property {string[]} npm 이 항목에 속하는 npm 패키지 이름
 * @property {string | undefined} fetched 가져온(확인한) 날짜 YYYY-MM-DD
 * @property {string | undefined} notice 고지 전문 파일 경로
 * @property {string | undefined} rights 제3자 권리 문구 원문
 */

/** 분류의 화면 이름. 적힌 순서가 출처 페이지의 정렬 순서다. */
export const CATEGORY_LABELS = Object.freeze({
  operator: '운영자 자체 자료',
  self: '사이트 자체 제작',
  stack: '실행 구성요소',
  library: '공개 라이브러리',
  third_party: '제3자 권리 표기 자료',
  reference: '참고·인용 자료',
});

/** @type {readonly string[]} */
export const CATEGORIES = Object.freeze(Object.keys(CATEGORY_LABELS));

/** 사이트 라이선스(MIT·CC BY-NC-SA 4.0)가 적용되는 분류 */
const SITE_LICENSED_CATEGORIES = new Set(['operator', 'self']);

/**
 * 사이트 라이선스에서 빠지고 원래 조건을 따르는 분류인지 알려 준다.
 * PD-26은 사이트 라이선스 폴더(content/·examples/) 안에 함께 놓이는 library·third_party를 제외로 정했다.
 * stack(외부 실행 구성요소)과 reference(규격·교육과정 인용)도 사이트가 다시 허락할 수 없는 자료라 같은 표시를 붙인다.
 * @param {string} category
 * @returns {boolean}
 */
export function isExcludedFromSiteLicense(category) {
  return !SITE_LICENSED_CATEGORIES.has(category);
}

const ALLOWED_FIELDS = Object.freeze([
  'name',
  'category',
  'author',
  'license',
  'url',
  'used_in',
  'paths',
  'exclude_paths',
  'npm',
  'fetched',
  'notice',
  'rights',
]);

/** 자주 헷갈리는 필드 이름 → 바른 이름(PLAN §9.2의 use·retrieved는 이 등록부에서 used_in·fetched로 적는다) */
const FIELD_HINTS = new Map([
  ['use', 'used_in'],
  ['usedIn', 'used_in'],
  ['retrieved', 'fetched'],
  ['date', 'fetched'],
  ['path', 'paths'],
  ['files', 'paths'],
  ['exclude', 'exclude_paths'],
  ['excludes', 'exclude_paths'],
  ['package', 'npm'],
  ['packages', 'npm'],
]);

/** 원래 자료 주소가 꼭 있어야 하는 분류 */
const URL_REQUIRED = new Set(['library', 'stack', 'reference']);
/** 가져온 날짜가 꼭 있어야 하는 분류(바깥에서 가져오거나 확인한 자료) */
const FETCHED_REQUIRED = new Set(['library', 'third_party', 'stack', 'reference']);
/** 권리 문구 원문이 꼭 있어야 하는 분류 */
const RIGHTS_REQUIRED = new Set(['third_party']);
/** npm 패키지 이름 모양(소문자, 선택적 @범위/) */
const NPM_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u;

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isValidDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string} field
 * @param {string} label
 * @param {string[]} errors
 * @param {boolean} required
 * @returns {string | undefined}
 */
function readText(raw, field, label, errors, required) {
  const value = raw[field];
  if (value === undefined || value === null) {
    if (required) {
      errors.push(`${label}: ${field} 필드가 없어요.`);
    }
    return undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${label}: ${field}는 비어 있지 않은 글자로 적어요.`);
    return undefined;
  }
  return value.trim();
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string} field
 * @param {string} label
 * @param {string[]} errors
 * @returns {string[]}
 */
function readList(raw, field, label, errors) {
  const value = raw[field];
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${label}: ${field}는 "- 값" 줄이 하나 이상 있는 목록으로 적어요.`);
    return [];
  }
  /** @type {string[]} */
  const items = [];
  for (const item of value) {
    if (typeof item !== 'string' || item === '') {
      errors.push(`${label}: ${field} 목록에 비어 있거나 글자가 아닌 값이 있어요.`);
      continue;
    }
    if (items.includes(item)) {
      errors.push(`${label}: ${field} 목록에 "${item}"이(가) 두 번 있어요.`);
      continue;
    }
    items.push(item);
  }
  return items;
}

/**
 * @param {unknown} raw
 * @param {number} index
 * @returns {string}
 */
function describeItem(raw, index) {
  const name = isPlainObject(raw) && typeof raw.name === 'string' ? raw.name.trim() : '';
  return name ? `항목 ${index + 1}("${name}")` : `항목 ${index + 1}`;
}

/**
 * 항목 하나를 검사하고 빈 목록 등을 채운 모양으로 바꾼다.
 * @param {unknown} raw
 * @param {string} label
 * @returns {{ entry: SourceEntry | null, errors: string[] }}
 */
function normalizeEntry(raw, label) {
  /** @type {string[]} */
  const errors = [];
  if (!isPlainObject(raw)) {
    return { entry: null, errors: [`${label}: "- name: …"처럼 필드 이름이 있는 항목으로 적어요.`] };
  }

  for (const key of Object.keys(raw)) {
    if (ALLOWED_FIELDS.includes(key)) {
      continue;
    }
    const hint = FIELD_HINTS.get(key);
    errors.push(
      hint
        ? `${label}: 모르는 필드 "${key}"예요. "${hint}"(으)로 적어요.`
        : `${label}: 모르는 필드 "${key}"예요. 쓸 수 있는 필드: ${ALLOWED_FIELDS.join(', ')}`,
    );
  }

  const name = readText(raw, 'name', label, errors, true);
  const category = readText(raw, 'category', label, errors, true);
  const author = readText(raw, 'author', label, errors, true);
  const license = readText(raw, 'license', label, errors, true);
  const usedIn = readText(raw, 'used_in', label, errors, true);
  const url = readText(raw, 'url', label, errors, false);
  const fetched = readText(raw, 'fetched', label, errors, false);
  const notice = readText(raw, 'notice', label, errors, false);
  const rights = readText(raw, 'rights', label, errors, false);
  const paths = readList(raw, 'paths', label, errors);
  const excludePaths = readList(raw, 'exclude_paths', label, errors);
  const npm = readList(raw, 'npm', label, errors);

  if (category !== undefined && !CATEGORIES.includes(category)) {
    errors.push(`${label}: category는 ${CATEGORIES.join(', ')} 중 하나로 적어요. 지금 값: "${category}"`);
  }
  if (url !== undefined && !/^https?:\/\/\S+$/u.test(url)) {
    errors.push(`${label}: url은 http:// 또는 https://로 시작하는 주소 하나로 적어요.`);
  }
  if (category !== undefined && URL_REQUIRED.has(category) && url === undefined) {
    errors.push(`${label}: ${category} 항목은 원래 자료 주소(url)를 적어요.`);
  }
  if (fetched !== undefined && !isValidDate(fetched)) {
    errors.push(`${label}: fetched는 2026-09-15처럼 YYYY-MM-DD 모양의 날짜로 적어요. 지금 값: "${fetched}"`);
  }
  if (category !== undefined && FETCHED_REQUIRED.has(category) && fetched === undefined) {
    errors.push(`${label}: ${category} 항목은 가져온 날짜(fetched)를 적어요.`);
  }
  if (category !== undefined && RIGHTS_REQUIRED.has(category) && rights === undefined) {
    errors.push(`${label}: third_party 항목은 원래 권리 문구(rights)를 그대로 적어요.`);
  }
  for (const pattern of [...paths, ...excludePaths]) {
    const problem = validateGlob(pattern);
    if (problem) {
      errors.push(`${label}: 경로 패턴 "${pattern}" — ${problem}`);
    }
  }
  if (excludePaths.length > 0 && paths.length === 0) {
    errors.push(`${label}: exclude_paths는 paths가 있을 때만 써요.`);
  }
  for (const packageName of npm) {
    if (!NPM_NAME_PATTERN.test(packageName)) {
      errors.push(`${label}: npm 패키지 이름 "${packageName}"의 모양이 맞지 않아요. 예: astro, @mediapipe/tasks-vision`);
    }
  }
  if (notice !== undefined && (validateGlob(notice) !== null || /[*?]/u.test(notice))) {
    errors.push(`${label}: notice는 저장소 뿌리 기준 파일 경로 하나로 적어요(* ? 없이).`);
  }

  if (
    errors.length > 0 ||
    name === undefined ||
    category === undefined ||
    author === undefined ||
    license === undefined ||
    usedIn === undefined
  ) {
    return { entry: null, errors };
  }
  return {
    entry: {
      name,
      category: /** @type {SourceCategory} */ (category),
      author,
      license,
      used_in: usedIn,
      url,
      paths,
      exclude_paths: excludePaths,
      npm,
      fetched,
      notice,
      rights,
    },
    errors,
  };
}

/**
 * sources.yaml 내용을 읽고 검사한다.
 * @param {string} text
 * @returns {{ entries: SourceEntry[], errors: string[] }}
 */
export function parseRegistry(text) {
  /** @type {string[]} */
  const errors = [];
  /** @type {SourceEntry[]} */
  const entries = [];

  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length > 0) {
    for (const error of document.errors) {
      const line = error.linePos?.[0]?.line;
      const firstLine = error.message.split('\n')[0].replace(/:$/u, '');
      errors.push(`YAML 문법 오류${line ? `(${line}번째 줄)` : ''}: ${firstLine}`);
    }
    return { entries, errors };
  }

  const data = document.toJS();
  if (!isPlainObject(data) || !Array.isArray(data.sources)) {
    errors.push('맨 위에 "sources:" 목록이 있어야 해요.');
    return { entries, errors };
  }
  for (const key of Object.keys(data)) {
    if (key !== 'sources') {
      errors.push(`맨 위에는 "sources:"만 둘 수 있어요. 모르는 이름: "${key}"`);
    }
  }

  /** @type {Map<string, number>} */
  const firstIndexByName = new Map();
  /** @type {Map<string, string>} */
  const entryNameByPackage = new Map();

  data.sources.forEach((raw, index) => {
    const label = describeItem(raw, index);
    const result = normalizeEntry(raw, label);
    errors.push(...result.errors);
    const entry = result.entry;
    if (!entry) {
      return;
    }
    const firstIndex = firstIndexByName.get(entry.name);
    if (firstIndex !== undefined) {
      errors.push(`${label}: 이름이 항목 ${firstIndex}과(와) 같아요. 이름은 항목마다 달라야 해요.`);
    } else {
      firstIndexByName.set(entry.name, index + 1);
    }
    for (const packageName of entry.npm) {
      const owner = entryNameByPackage.get(packageName);
      if (owner !== undefined) {
        errors.push(`${label}: npm 패키지 "${packageName}"이(가) "${owner}" 항목에도 있어요. 한 패키지는 한 항목에만 적어요.`);
      } else {
        entryNameByPackage.set(packageName, entry.name);
      }
    }
    entries.push(entry);
  });

  return { entries, errors };
}

/**
 * 파일 하나에 걸리는 항목을 찾는다(paths에 맞고 exclude_paths에는 맞지 않는 항목).
 * @param {string} filePath 저장소 뿌리 기준 경로(/ 구분)
 * @param {SourceEntry[]} entries
 * @returns {{ entry: SourceEntry, pattern: string }[]}
 */
export function findMatchingEntries(filePath, entries) {
  /** @type {{ entry: SourceEntry, pattern: string }[]} */
  const matches = [];
  for (const entry of entries) {
    const pattern = entry.paths.find((candidate) => matchesGlob(filePath, candidate));
    if (pattern === undefined) {
      continue;
    }
    if (entry.exclude_paths.some((candidate) => matchesGlob(filePath, candidate))) {
      continue;
    }
    matches.push({ entry, pattern });
  }
  return matches;
}

/**
 * @param {string} author
 * @returns {string}
 */
function normalizeAuthor(author) {
  return author.replace(/\s+/gu, ' ').trim();
}

/**
 * 파일 목록을 등록부와 짝짓는다.
 * - 어느 항목에도 걸리지 않은 파일 → unregistered
 * - 저작자(author)가 다른 두 항목 이상에 걸린 파일 → conflicts(중복 매칭).
 *   저작자가 같으면 넓은 항목과 자세한 항목이 겹쳐도 괜찮다(PLAN §8.1 P1-04).
 * @param {string[]} files
 * @param {SourceEntry[]} entries
 * @returns {{ unregistered: string[], conflicts: { file: string, matches: { entry: SourceEntry, pattern: string }[] }[] }}
 */
export function classifyFiles(files, entries) {
  /** @type {string[]} */
  const unregistered = [];
  /** @type {{ file: string, matches: { entry: SourceEntry, pattern: string }[] }[]} */
  const conflicts = [];
  for (const file of files) {
    const matches = findMatchingEntries(file, entries);
    if (matches.length === 0) {
      unregistered.push(file);
      continue;
    }
    const authors = new Set(matches.map((match) => normalizeAuthor(match.entry.author)));
    if (authors.size > 1) {
      conflicts.push({ file, matches });
    }
  }
  return { unregistered, conflicts };
}

/**
 * npm 패키지 이름이 적힌 항목을 찾는다.
 * @param {string} packageName
 * @param {SourceEntry[]} entries
 * @returns {SourceEntry | undefined}
 */
export function findEntryByPackage(packageName, entries) {
  return entries.find((entry) => entry.npm.includes(packageName));
}
