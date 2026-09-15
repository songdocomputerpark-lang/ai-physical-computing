// 저장소 검사 본체(PLAN §8.0 PD-32, §9.3, PD-37).
// scripts/check-repo.mjs(커밋 전 훅·CI)와 단위 테스트가 부른다.
//
// 검사 대상은 git 인덱스(스테이징된 내용 = 커밋될 내용)다. CI에서는 내려받은 커밋과 같다.
// 1) 올리면 안 되는 파일: docs/SPEC.md(학교명, PD-37), 원본 자료 폴더 안 파일(C6)
// 2) 원본 형식: .pdf .pptx .hwp .hwpx .zip .pyc, __pycache__ (scripts/repo-allowlist.yaml의 original_formats 제외)
// 3) 5MB 넘는 파일(large_files 허용 목록 제외, 허용해도 max_mb를 넘으면 실패)
// 4) public/ examples/ content/ src/ 안의 원본 파일 이름(원본 zip·PDF·폴더 이름)
// 5) 모든 추적 텍스트 파일의 개인정보 형태: 사용자 폴더 경로, OneDrive 경로, MAC 주소(자리표시자 제외)
// 6) 공개 이미지의 눈 확인 기록(scripts/image-allowlist.yaml의 reviewed)
//
// 이 파일의 주석에는 검사에 걸리는 실제 모양(경로·주소)을 적지 않는다. 이 파일도 검사 대상이기 때문이다.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { matchesGlob, validateGlob } from './glob.mjs';

export const REPO_ALLOWLIST_FILE = 'scripts/repo-allowlist.yaml';
export const IMAGE_ALLOWLIST_FILE = 'scripts/image-allowlist.yaml';
export const FORBIDDEN_TRACKED_FILES = Object.freeze(['docs/SPEC.md']);
export const ORIGINAL_FORMAT_EXTENSIONS = Object.freeze(['.pdf', '.pptx', '.hwp', '.hwpx', '.zip', '.pyc']);
/** 5MB 기준(5 × 1024 × 1024바이트) */
export const LARGE_FILE_LIMIT_BYTES = 5 * 1024 * 1024;
const DEFAULT_ALLOWED_MAX_MB = 50;
/** 원본 파일 이름을 찾는 폴더(docs/와 .gitignore는 원본 이름을 설명하므로 뺀다, PLAN §8.0) */
export const ORIGINAL_NAME_SCAN_ROOTS = Object.freeze(['public/', 'examples/', 'content/', 'src/']);
/** 눈 확인 기록이 필요한 이미지가 있는 폴더(공개되는 곳) */
export const IMAGE_REVIEW_ROOTS = Object.freeze(['public/', 'content/', 'examples/', 'src/', 'docs/']);

const RASTER_IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.tif', '.tiff', '.heic', '.heif', '.ico',
]);
const BINARY_EXTENSIONS = new Set([
  ...RASTER_IMAGE_EXTENSIONS,
  ...ORIGINAL_FORMAT_EXTENSIONS,
  '.wasm', '.task', '.tflite', '.bin', '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.wav', '.ogg', '.mp4', '.webm',
]);
/** 내용을 읽어 검사하는 파일 크기 한도 */
const MAX_CONTENT_BYTES = 64 * 1024 * 1024;
/** SVG 안에 래스터 그림(data: 주소)이 들어 있는지 */
const EMBEDDED_RASTER = /<image\b[^>]*\bhref\s*=\s*["']\s*data:image\/(?!svg)/iu;
const ORIGINAL_DOCUMENT_NAME = /\.(?:pdf|pptx|zip|hwp|hwpx)$/iu;

// 개인정보 형태. 사용자 이름 칸에는 구분자·공백·따옴표·괄호 등이 오지 않는다.
const WINDOWS_USER_DIR = /(?<![A-Za-z0-9])[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)([^\\\/\s"'`<>|?*:;,()[\]{}]+)/giu;
const DRIVE_MOUNT_USER_DIR = /(?<![\w.~%:-])\/(?:mnt\/)?[A-Za-z]\/Users\/([^\\\/\s"'`<>|?*:;,()[\]{}]+)/giu;
const MAC_USER_DIR = /(?<![\w.~%:-])\/Users\/([^\\\/\s"'`<>|?*:;,()[\]{}]+)/gu;
const LINUX_HOME_DIR = /(?<![\w.~%:-])\/home\/([^\\\/\s"'`<>|?*:;,()[\]{}]+)/gu;
const ONEDRIVE_DIR = /(?:^|[\\/])OneDrive(?: ?- ?[^\\/\r\n]+)?[\\/]/gimu;
const MAC_ADDRESS = /(?<![0-9A-Fa-f:-])[0-9A-Fa-f]{2}([:-])[0-9A-Fa-f]{2}(?:\1[0-9A-Fa-f]{2}){4}(?![0-9A-Fa-f:-])/gu;
const ALLOWED_MAC_ADDRESSES = new Set(['00:00:00:00:00:00', 'ff:ff:ff:ff:ff:ff', '00-00-00-00-00-00', 'ff-ff-ff-ff-ff-ff']);
/**
 * 사람을 가리키지 않는 사용자 이름: Windows 기본 폴더, 원고 캡처의 교실 PC 공용 계정 이름(INVENTORY §6),
 * 설명용 자리표시자, Pyodide·Emscripten 가상 경로와 GitHub Actions 실행기 이름.
 */
const ALLOWED_USER_NAMES = new Set([
  'public', 'default', 'all', 'com', 'user', 'username', 'user_name', 'yourname', 'your_name', 'name',
  '사용자', '사용자이름', '사용자명', '이름', 'pyodide', 'web_user', 'runner',
]);

/** 문제 종류 → 제목과 고치는 법(보고서에 이 순서로 보인다) */
const PROBLEM_KINDS = Object.freeze({
  forbidden: {
    title: '공개 저장소에 올리면 안 되는 파일',
    fix: 'git rm --cached <파일>로 추적에서 빼요(파일은 PC에 남아요).',
  },
  'original-folder': {
    title: '원본 자료 폴더의 파일',
    fix: '원본 자료는 공개 저장소에 올리지 않아요(DECISIONS C6). git rm --cached로 빼고, 필요한 내용만 content/·examples/·public/에 변환해 넣어요.',
  },
  'original-format': {
    title: '원본 자료 형식의 파일',
    fix: `원본 PDF·PPTX·ZIP 대신 필요한 내용만 옮겨요. 가린 편집본처럼 꼭 올려야 하면 ${REPO_ALLOWLIST_FILE}의 original_formats에 경로와 이유를 적어요.`,
  },
  'large-file': {
    title: '5MB를 넘는 파일',
    fix: `파일을 줄이거나, 모델·펌웨어처럼 꼭 필요하면 ${REPO_ALLOWLIST_FILE}의 large_files에 경로·이유·max_mb를 적어요.`,
  },
  'original-name': {
    title: '원본 파일 이름이 들어 있는 파일',
    fix: '원본 zip·PDF·폴더 이름을 지우거나 "교과서 원고 2단원"처럼 일반적인 설명으로 바꿔요.',
  },
  privacy: {
    title: '개인정보로 보이는 경로·주소',
    fix: '사용자 이름이 들어간 경로는 <사용자> 같은 자리표시자로, MAC 주소는 XX:XX:XX:XX:XX:XX로 바꾸고, OneDrive 경로는 지워요.',
  },
  'image-review': {
    title: '눈 확인 기록이 없는 이미지',
    fix: `이미지를 한 장씩 열어 얼굴·이름·경로·파일명·기기 주소·학교명이 없는지 보고 ${IMAGE_ALLOWLIST_FILE}에 reviewed(by·date·result)를 적어요.`,
  },
  config: {
    title: '허용 목록 형식 오류',
    fix: '허용 목록 파일 맨 위의 설명을 보고 형식을 고쳐요.',
  },
});

/**
 * @typedef {object} RepoFile
 * @property {string} path 저장소 뿌리 기준 경로(/ 구분)
 * @property {number} size 바이트
 * @property {Buffer | null} content 내용(너무 크거나 링크면 null)
 */

/**
 * @typedef {object} RepoRules
 * @property {{ path: string, reason: string }[]} originalFormatAllowed
 * @property {{ path: string, reason: string, maxMb: number }[]} largeFileAllowed
 * @property {Map<string, unknown>} imageReviews 이미지 경로 → 기록
 * @property {string[]} originalFolderNames .gitignore의 원본 자료 폴더 이름
 * @property {string[]} originalNameNeedles 찾을 원본 이름
 */

/** @typedef {{ kind: keyof typeof PROBLEM_KINDS, path: string, detail: string }} RepoProblem */

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {string} text
 * @param {number} index
 * @returns {number}
 */
function lineNumberAt(text, index) {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (text.charCodeAt(position) === 10) {
      line += 1;
    }
  }
  return line;
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function formatMegabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * .gitignore의 "원본 자료" 주석 아래(빈 줄 전까지)에 적힌 /폴더/ 이름.
 * @param {string} gitignoreText
 * @returns {string[]}
 */
export function originalFolderNamesFromGitignore(gitignoreText) {
  /** @type {string[]} */
  const names = [];
  let inOriginalBlock = false;
  for (const rawLine of gitignoreText.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.startsWith('#')) {
      inOriginalBlock = line.includes('원본 자료');
      continue;
    }
    if (line === '') {
      inOriginalBlock = false;
      continue;
    }
    const match = inOriginalBlock ? /^\/([^/]+)\/$/u.exec(line) : null;
    if (match) {
      names.push(match[1].normalize('NFC'));
    }
  }
  return names;
}

/**
 * docs/INVENTORY.md에 `…`로 적힌 원본 문서·압축 파일 이름(공개 문서에 이미 있는 이름만).
 * @param {string} inventoryText
 * @returns {string[]}
 */
export function originalDocumentNamesFromInventory(inventoryText) {
  const names = new Set();
  for (const match of inventoryText.matchAll(/`([^`\n]+?\.(?:pdf|pptx|zip|hwp|hwpx))`/giu)) {
    const baseName = (match[1].split('/').pop() ?? '').trim();
    if (baseName) {
      names.add(baseName.normalize('NFC'));
    }
  }
  return [...names];
}

/**
 * 운영자 PC처럼 원본 자료 폴더가 있으면 그 안 문서·압축 파일 이름도 모은다(읽기만 한다).
 * @param {string} rootDir
 * @param {string[]} folderNames
 * @returns {string[]}
 */
export function originalDocumentNamesOnDisk(rootDir, folderNames) {
  const names = new Set();
  /**
   * @param {string} directory
   * @param {number} depth
   */
  const walk = (directory, depth) => {
    if (depth > 6) return;
    /** @type {fs.Dirent[]} */
    let dirents;
    try {
      dirents = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (dirent.isDirectory()) {
        walk(path.join(directory, dirent.name), depth + 1);
      } else if (ORIGINAL_DOCUMENT_NAME.test(dirent.name)) {
        names.add(dirent.name.normalize('NFC'));
      }
    }
  };
  for (const folderName of folderNames) {
    const folderPath = path.join(rootDir, folderName);
    if (fs.existsSync(folderPath)) {
      walk(folderPath, 0);
    }
  }
  return [...names];
}

/**
 * 찾을 원본 이름 목록. 폴더 이름 중 공백이 있거나 영어 한 낱말인 이름(예: 일반 낱말과 겹치는 이름)은
 * 오탐을 막으려고 뺀다. 문서 이름은 확장자를 붙인 이름과, 8글자 이상이면 확장자를 뗀 이름을 함께 찾는다.
 * @param {string[]} folderNames
 * @param {string[]} documentNames
 * @returns {string[]}
 */
export function buildOriginalNameNeedles(folderNames, documentNames) {
  const needles = new Set();
  for (const name of folderNames) {
    if (!/\s/u.test(name) && !/^[A-Za-z]+$/u.test(name)) {
      needles.add(name);
    }
  }
  for (const name of documentNames) {
    needles.add(name);
    const baseName = name.replace(/\.[^.]+$/u, '');
    if ([...baseName].length >= 8) {
      needles.add(baseName);
    }
  }
  return [...needles].sort();
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isPlaceholderUserName(name) {
  return (
    ALLOWED_USER_NAMES.has(name.toLowerCase()) ||
    /^%[^%]+%$/u.test(name) ||
    name.startsWith('$') ||
    /^(?:x+|\*+|\.{3,}|…)$/iu.test(name)
  );
}

/**
 * 텍스트에서 개인정보 형태를 찾는다. 찾은 값은 로그(공개 CI 기록 포함)에 다시 퍼지지 않게 가려서 알린다.
 * @param {string} text
 * @returns {string[]}
 */
export function findPrivacyPatterns(text) {
  /** @type {string[]} */
  const findings = [];
  const userDirectoryRules = [
    { regExp: WINDOWS_USER_DIR, label: 'Windows 사용자 폴더 경로' },
    { regExp: DRIVE_MOUNT_USER_DIR, label: 'Windows 사용자 폴더 경로(Git Bash·WSL 모양)' },
    { regExp: MAC_USER_DIR, label: 'macOS 사용자 폴더 경로' },
    { regExp: LINUX_HOME_DIR, label: 'Linux 사용자 폴더 경로' },
  ];
  for (const { regExp, label } of userDirectoryRules) {
    for (const match of text.matchAll(regExp)) {
      if (!isPlaceholderUserName(match[1])) {
        findings.push(`${lineNumberAt(text, match.index ?? 0)}번째 줄: ${label}(사용자 이름은 가려서 표시)`);
      }
    }
  }
  for (const match of text.matchAll(ONEDRIVE_DIR)) {
    findings.push(`${lineNumberAt(text, match.index ?? 0)}번째 줄: OneDrive 폴더 경로(기관·계정 이름이 드러날 수 있어요)`);
  }
  for (const match of text.matchAll(MAC_ADDRESS)) {
    if (!ALLOWED_MAC_ADDRESSES.has(match[0].toLowerCase())) {
      findings.push(`${lineNumberAt(text, match.index ?? 0)}번째 줄: MAC 주소 모양(${match[0].slice(0, 2)}${match[1]}…, 나머지는 가려서 표시)`);
    }
  }
  return findings;
}

/**
 * @param {string} filePath
 * @param {Buffer} content
 * @returns {boolean}
 */
function isTextContent(filePath, content) {
  if (BINARY_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase())) {
    return false;
  }
  return !content.subarray(0, 8000).includes(0);
}

/**
 * @param {Buffer} content
 * @param {string | null} text
 * @param {string[]} needles
 * @returns {string | undefined}
 */
function findOriginalName(content, text, needles) {
  if (text !== null) {
    const normalized = text.normalize('NFC').toLowerCase();
    return needles.find((needle) => normalized.includes(needle.toLowerCase()));
  }
  return needles.find((needle) => content.includes(Buffer.from(needle, 'utf8')));
}

/**
 * @param {unknown} record
 * @returns {string | null}
 */
function describeReviewProblem(record) {
  if (!isPlainObject(record)) {
    return '눈 확인 기록이 없어요';
  }
  const reviewed = record.reviewed;
  if (!isPlainObject(reviewed)) {
    return 'reviewed 기록이 없어요';
  }
  if (typeof reviewed.by !== 'string' || reviewed.by.trim() === '') {
    return 'reviewed.by(확인한 사람)가 없어요';
  }
  if (typeof reviewed.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(reviewed.date)) {
    return 'reviewed.date가 YYYY-MM-DD 모양의 날짜가 아니에요';
  }
  if (typeof reviewed.result !== 'string' || !reviewed.result.trim().startsWith('통과')) {
    return 'reviewed.result가 "통과"로 시작하지 않아요';
  }
  return null;
}

/**
 * 파일 목록을 검사한다(git 없이도 부를 수 있어 단위 테스트가 쓴다).
 * @param {RepoFile[]} files
 * @param {RepoRules} rules
 * @returns {RepoProblem[]}
 */
export function checkRepoFiles(files, rules) {
  /** @type {RepoProblem[]} */
  const problems = [];
  const forbidden = new Set(FORBIDDEN_TRACKED_FILES.map((file) => file.toLowerCase()));
  const originalFolders = new Set(rules.originalFolderNames.map((name) => name.normalize('NFC')));

  for (const file of files) {
    const filePath = file.path.normalize('NFC');
    const extension = path.posix.extname(filePath).toLowerCase();
    const segments = filePath.split('/');

    if (forbidden.has(filePath.toLowerCase())) {
      problems.push({ kind: 'forbidden', path: filePath, detail: '학교명이 있어 운영자 할 일 7번 답 전까지 공개하지 않아요(PD-37).' });
    }
    if (segments.length > 1 && originalFolders.has(segments[0])) {
      problems.push({ kind: 'original-folder', path: filePath, detail: `원본 자료 폴더 "${segments[0]}" 안의 파일이에요.` });
    }

    const inPycache = segments.includes('__pycache__');
    if (
      (ORIGINAL_FORMAT_EXTENSIONS.includes(extension) || inPycache) &&
      !rules.originalFormatAllowed.some((item) => matchesGlob(filePath, item.path))
    ) {
      const what = ORIGINAL_FORMAT_EXTENSIONS.includes(extension) ? extension : '__pycache__ 폴더';
      problems.push({ kind: 'original-format', path: filePath, detail: `${what}는 원본 자료 형식이에요.` });
    }

    if (file.size > LARGE_FILE_LIMIT_BYTES) {
      const allowed = rules.largeFileAllowed.find((item) => matchesGlob(filePath, item.path));
      if (!allowed) {
        problems.push({ kind: 'large-file', path: filePath, detail: `${formatMegabytes(file.size)}예요(기준 5MB).` });
      } else if (file.size > allowed.maxMb * 1024 * 1024) {
        problems.push({
          kind: 'large-file',
          path: filePath,
          detail: `${formatMegabytes(file.size)}예요. 허용 목록의 최대 ${allowed.maxMb}MB를 넘어요.`,
        });
      }
    }

    const inImageRoot = IMAGE_REVIEW_ROOTS.some((root) => filePath.startsWith(root));
    const text = file.content && isTextContent(filePath, file.content) ? file.content.toString('utf8') : null;
    const needsReview =
      inImageRoot && (RASTER_IMAGE_EXTENSIONS.has(extension) || (extension === '.svg' && text !== null && EMBEDDED_RASTER.test(text)));
    if (needsReview) {
      const problem = describeReviewProblem(rules.imageReviews.get(filePath));
      if (problem) {
        problems.push({ kind: 'image-review', path: filePath, detail: `${problem}(${IMAGE_ALLOWLIST_FILE}).` });
      }
    }

    if (!file.content) {
      continue;
    }
    if (ORIGINAL_NAME_SCAN_ROOTS.some((root) => filePath.startsWith(root)) && rules.originalNameNeedles.length > 0) {
      const found = findOriginalName(file.content, text, rules.originalNameNeedles);
      if (found) {
        problems.push({ kind: 'original-name', path: filePath, detail: `원본 이름 "${found}"이(가) 들어 있어요.` });
      }
    }
    if (text !== null) {
      for (const finding of findPrivacyPatterns(text)) {
        problems.push({ kind: 'privacy', path: filePath, detail: finding });
      }
    }
  }
  return problems;
}

/**
 * @param {string | null} text
 * @param {string} label
 * @param {{ file: string, message: string }[]} errors
 * @returns {Record<string, any>}
 */
function parseYamlObject(text, label, errors) {
  if (text === null) {
    return {};
  }
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length > 0) {
    for (const error of document.errors) {
      errors.push({ file: label, message: `YAML 문법 오류: ${error.message.split('\n')[0]}` });
    }
    return {};
  }
  const data = document.toJS();
  if (data === null || data === undefined) {
    return {};
  }
  if (!isPlainObject(data)) {
    errors.push({ file: label, message: '맨 위는 "이름: 값" 모양이어야 해요.' });
    return {};
  }
  return data;
}

/**
 * @param {Record<string, any>} data
 * @param {string} key
 * @param {{ file: string, message: string }[]} errors
 * @returns {{ path: string, reason: string, maxMb: number }[]}
 */
function readAllowEntries(data, key, errors) {
  const value = data[key];
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push({ file: REPO_ALLOWLIST_FILE, message: `${key}는 목록으로 적어요.` });
    return [];
  }
  /** @type {{ path: string, reason: string, maxMb: number }[]} */
  const entries = [];
  value.forEach((item, index) => {
    const where = `${key}의 ${index + 1}번째 항목`;
    const pattern = isPlainObject(item) ? item.path : undefined;
    const patternProblem = validateGlob(pattern);
    if (!isPlainObject(item) || patternProblem) {
      errors.push({ file: REPO_ALLOWLIST_FILE, message: `${where}: path — ${patternProblem ?? '경로가 없어요.'}` });
      return;
    }
    if (typeof item.reason !== 'string' || item.reason.trim() === '') {
      errors.push({ file: REPO_ALLOWLIST_FILE, message: `${where}: reason(올리는 이유)을 적어요.` });
      return;
    }
    let maxMb = DEFAULT_ALLOWED_MAX_MB;
    if (item.max_mb !== undefined) {
      if (typeof item.max_mb !== 'number' || !(item.max_mb > 0) || item.max_mb > 95) {
        errors.push({ file: REPO_ALLOWLIST_FILE, message: `${where}: max_mb는 0보다 크고 95 이하인 숫자로 적어요.` });
        return;
      }
      maxMb = item.max_mb;
    }
    entries.push({ path: /** @type {string} */ (pattern), reason: item.reason.trim(), maxMb });
  });
  return entries;
}

/**
 * 허용 목록·원본 이름 등 검사 규칙을 읽는다. 파일이 없으면 빈 목록(더 엄격한 쪽)으로 본다.
 * @param {string} rootDir
 * @returns {{ rules: RepoRules, errors: { file: string, message: string }[] }}
 */
export function loadRepoRules(rootDir) {
  /** @type {{ file: string, message: string }[]} */
  const errors = [];
  /** @param {string} relativePath */
  const readOptional = (relativePath) => {
    const absolutePath = path.join(rootDir, relativePath);
    return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf8') : null;
  };

  const repoAllowlist = parseYamlObject(readOptional(REPO_ALLOWLIST_FILE), REPO_ALLOWLIST_FILE, errors);
  for (const key of Object.keys(repoAllowlist)) {
    if (key !== 'original_formats' && key !== 'large_files') {
      errors.push({ file: REPO_ALLOWLIST_FILE, message: `모르는 이름 "${key}"예요. original_formats, large_files만 써요.` });
    }
  }
  const originalFormatAllowed = readAllowEntries(repoAllowlist, 'original_formats', errors).map(({ path: pattern, reason }) => ({
    path: pattern,
    reason,
  }));
  const largeFileAllowed = readAllowEntries(repoAllowlist, 'large_files', errors);

  const imageAllowlist = parseYamlObject(readOptional(IMAGE_ALLOWLIST_FILE), IMAGE_ALLOWLIST_FILE, errors);
  /** @type {Map<string, unknown>} */
  const imageReviews = new Map();
  if (imageAllowlist.images !== undefined && imageAllowlist.images !== null) {
    if (!Array.isArray(imageAllowlist.images)) {
      errors.push({ file: IMAGE_ALLOWLIST_FILE, message: 'images는 목록으로 적어요.' });
    } else {
      imageAllowlist.images.forEach((item, index) => {
        if (!isPlainObject(item) || typeof item.path !== 'string' || item.path.trim() === '' || /[*?]/u.test(item.path)) {
          errors.push({
            file: IMAGE_ALLOWLIST_FILE,
            message: `images의 ${index + 1}번째 항목: path에 이미지 하나의 정확한 경로를 적어요(패턴 없이, 한 장씩 확인).`,
          });
          return;
        }
        imageReviews.set(item.path.normalize('NFC'), item);
      });
    }
  }

  const originalFolderNames = originalFolderNamesFromGitignore(readOptional('.gitignore') ?? '');
  const documentNames = [
    ...originalDocumentNamesFromInventory(readOptional('docs/INVENTORY.md') ?? ''),
    ...originalDocumentNamesOnDisk(rootDir, originalFolderNames),
  ];
  return {
    rules: {
      originalFormatAllowed,
      largeFileAllowed,
      imageReviews,
      originalFolderNames,
      originalNameNeedles: buildOriginalNameNeedles(originalFolderNames, documentNames),
    },
    errors,
  };
}

/**
 * git 인덱스(스테이징된 내용)의 파일 목록과 내용을 읽는다.
 * 커밋 전 훅에서는 git이 정한 GIT_INDEX_FILE을 그대로 따른다.
 * @param {string} rootDir
 * @returns {RepoFile[]}
 */
export function readIndexFiles(rootDir) {
  /**
   * @param {string[]} args
   * @param {string} [input]
   * @returns {Buffer}
   */
  const runGit = (args, input) =>
    execFileSync('git', args, { cwd: rootDir, input, maxBuffer: 2 * 1024 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });

  /** @type {Map<string, { mode: string, objectId: string }>} */
  const indexEntries = new Map();
  for (const record of runGit(['ls-files', '-s', '-z']).toString('utf8').split('\0')) {
    const tabIndex = record.indexOf('\t');
    if (tabIndex < 0) continue;
    const [mode, objectId] = record.slice(0, tabIndex).split(' ');
    const filePath = record.slice(tabIndex + 1).normalize('NFC');
    // 하위 모듈(160000)은 내용이 이 저장소에 없다. 충돌 중인 파일은 첫 단계만 본다.
    if (mode !== '160000' && !indexEntries.has(filePath)) {
      indexEntries.set(filePath, { mode, objectId });
    }
  }
  const records = [...indexEntries.entries()];
  if (records.length === 0) {
    return [];
  }

  const sizeLines = runGit(['cat-file', '--batch-check'], `${records.map(([, entry]) => entry.objectId).join('\n')}\n`)
    .toString('utf8')
    .trim()
    .split('\n');
  const sizes = sizeLines.map((line) => Number(line.split(' ')[2] ?? 0) || 0);

  const contentIds = [
    ...new Set(
      records
        .filter(([, entry], index) => entry.mode !== '120000' && sizes[index] <= MAX_CONTENT_BYTES)
        .map(([, entry]) => entry.objectId),
    ),
  ];
  /** @type {Map<string, Buffer>} */
  const contents = new Map();
  if (contentIds.length > 0) {
    const output = runGit(['cat-file', '--batch'], `${contentIds.join('\n')}\n`);
    let offset = 0;
    for (const objectId of contentIds) {
      const newlineIndex = output.indexOf(10, offset);
      if (newlineIndex < 0) break;
      const header = output.subarray(offset, newlineIndex).toString('utf8').split(' ');
      offset = newlineIndex + 1;
      if (header[1] === 'missing' || header[2] === undefined) continue;
      const size = Number(header[2]);
      contents.set(objectId, output.subarray(offset, offset + size));
      offset += size + 1;
    }
  }

  return records.map(([filePath, entry], index) => ({
    path: filePath,
    size: sizes[index],
    content: contents.get(entry.objectId) ?? null,
  }));
}

/**
 * 저장소 검사를 한 번 돌린다.
 * @param {{ rootDir: string }} options
 * @returns {{ ok: boolean, problems: RepoProblem[], fileCount: number }}
 */
export function runRepoCheck({ rootDir }) {
  const { rules, errors } = loadRepoRules(rootDir);
  const files = readIndexFiles(rootDir);
  const problems = checkRepoFiles(files, rules);
  for (const error of errors) {
    problems.push({ kind: 'config', path: error.file, detail: error.message });
  }
  return { ok: problems.length === 0, problems, fileCount: files.length };
}

/**
 * 검사 결과를 사람이 읽는 한국어 보고서로 만든다.
 * @param {{ ok: boolean, problems: RepoProblem[], fileCount: number }} result
 * @returns {string}
 */
export function formatRepoReport(result) {
  if (result.ok) {
    return `[저장소 검사] 통과 — 추적 파일 ${result.fileCount}개`;
  }
  const lines = [`[저장소 검사] 실패 — 문제 ${result.problems.length}건. 고치기 전에는 커밋과 배포를 멈춰요.`];
  for (const [kind, info] of Object.entries(PROBLEM_KINDS)) {
    const items = result.problems.filter((problem) => problem.kind === kind);
    if (items.length === 0) continue;
    lines.push('', `■ ${info.title}(${items.length}건)`);
    for (const item of items) {
      lines.push(`  - ${item.path}: ${item.detail}`);
    }
    lines.push(`  고치는 법: ${info.fix}`);
  }
  lines.push('', '스테이징에서만 빼려면: git restore --staged <파일>');
  return lines.join('\n');
}
