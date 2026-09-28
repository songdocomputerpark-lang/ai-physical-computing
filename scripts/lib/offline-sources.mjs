// 대응 소스 사본(운영자 할 일 26·미해결 211) — 목록 읽기·검사, 받은 폴더 확인, 오프라인판 zip의 sources/ 만들기.
//
// 사이트는 고치지 않은 실행 파일 두 가지를 다시 나눈다: OpenCV 휠의 cv2.so(FFmpeg 4.4.1이 정적으로 들어 있음 — LGPL-2.1 이상)와
// 사이트 검색 엔진 wasm(pagefind_microjson 0.1.4가 들어 있음 — GPL-3.0-only). 두 라이선스는 실행 파일을 받은 사람이 대응 소스도 받을 수
// 있게 하라고 한다(DECISIONS C22·C23·C36). 그 소스 파일 목록을 scripts/release/sources-manifest.json 한 곳에 두고 셋이 같이 읽는다.
//   - scripts/release/fetch-sources.ps1 — 운영자 PC에서 공식 주소로 받아 크기·해시를 대조한다(공식 값과 같으면 PASS, 다르면 FAIL,
//     공식 값이 없으면 SHA-256을 적어 두는 RECORD). 받은 폴더에 SHA256SUMS.txt·fetch-result.json을 쓴다.
//     (Claude는 소스 압축을 내려받지 않는다 — 내려받기는 운영자 몫.)
//   - scripts/release/release-notes.mjs — 받은 폴더를 이 모듈로 확인하고 릴리스 설명과 gh 명령을 만든다(올리기는 운영자가 "예"라고 한 뒤).
//   - scripts/build-offline.mjs --sources <폴더> — 같은 확인을 거친 파일만 zip 안 sources/에 넣는다(없으면 지금과 같은 zip).
// 목록의 site 칸은 목록이 가리키는 사이트 판(Pyodide 잠금 파일·opencv 휠·Pagefind)이다. 사이트 판을 올리면 목록도 고쳐야 하므로
// build-offline(--sources)과 단위 테스트(tests/unit/release/sources-manifest.test.ts)가 실제 판과 대조한다.
//
// 확인 규칙(checkSourcesFolder): 목록의 파일이 모두 있어야 하고, 크기(목록에 있으면)·공식 SHA-256·SHA-512·MD5(있으면)가 같아야 하며,
// 폴더의 SHA256SUMS.txt(받을 때 잰 값)와도 같아야 한다. 공식 해시가 없는 파일(GitHub가 그때그때 만드는 압축)은 목록의 commit 칸이 있어야 하고,
// 압축 안(git archive가 맨 앞 pax 전역 머리에 적는 comment=<커밋 40자리>)의 커밋이 같고 압축이 끝까지 풀려야 한다 — 학교망 차단 안내 쪽·끊긴
// 받기·옮겨진 태그를 "받을 때 잰 값"으로 고정하지 않게(1.1.0 안전 검토 지적 3, DECISIONS C60). 목록 밖 파일은 넣지 않고 참고로만 알린다.
// 공식 해시가 없는 채(고정 전)인 목록으로는 오프라인판·릴리스를 만들지 않는다(unpinnedSourceItems — scripts/release/README.md 3절 2번에서 고정).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { toCrlf } from './offline-site.mjs';

/** 대응 소스 목록(저장소 뿌리 기준) */
export const SOURCES_MANIFEST_FILE = 'scripts/release/sources-manifest.json';
export const SOURCES_MANIFEST_SCHEMA = 1;
/** fetch-sources.ps1이 받는 기본 폴더(저장소 뿌리 기준 — .gitignore의 .cache/) */
export const SOURCES_DEFAULT_DIR = '.cache/release-sources';
/** 받은 폴더의 확인값 목록(GNU sha256sum 모양 "<SHA-256>  <파일 이름>") */
export const SOURCES_SUMS_FILE = 'SHA256SUMS.txt';
/** zip 안 대응 소스 폴더(맨 위 폴더 기준) */
export const SOURCES_ZIP_DIR = 'sources';
/** zip 안 sources/의 안내 글 */
export const SOURCES_README_NAME = '읽어보세요.txt';
/** 받은 폴더에 도구들이 함께 쓰는 파일 — 대응 소스가 아니라 묶지 않는다 */
export const SOURCES_FOLDER_META_FILES = Object.freeze([
  SOURCES_SUMS_FILE,
  'fetch-result.json',
  'fetch-result.txt',
  'release-notes.md',
  'uploaded.json',
]);

const HEX64 = /^[0-9a-f]{64}$/u;
const HEX32 = /^[0-9a-f]{32}$/u;
const HEX128 = /^[0-9a-f]{128}$/u;
/** git 커밋 이름(SHA-1 40자리) */
const HEX40 = /^[0-9a-f]{40}$/u;
/** 파일 이름: 영어·숫자로 시작, 폴더 구분자·빈칸 없음(zip 안 이름·릴리스 파일 이름으로 그대로 쓴다) */
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/u;
const SAFE_ID = /^[a-z0-9][a-z0-9._-]*$/u;
const SAFE_TAG = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const SITE_KEYS = Object.freeze(['pyodideVersion', 'pyodideLockSha256', 'opencvWheel', 'opencvWheelSha256', 'pagefindVersion']);
const ITEM_USES = Object.freeze(['wasm', 'build']);

/**
 * @typedef {{
 *   id: string, group: string, file: string, urls: string[], size: number | null, sha256: string | null, md5: string | null,
 *   sha512?: string | null, commit?: string,
 *   hashSource: string | null, what: string, whatKo: string, license: string, use?: 'wasm' | 'build',
 * }} SourceItem
 * @typedef {{
 *   id: string, title: string, titleKo: string, license: string, binary: string, binaryKo: string, notice: string,
 *   why: string, whyKo: string, tools: string, toolsKo: string,
 * }} SourceGroup
 * @typedef {{
 *   schema: number, releaseTag: string, checkedOn: string,
 *   site: { pyodideVersion: string, pyodideLockSha256: string, opencvWheel: string, opencvWheelSha256: string, pagefindVersion: string },
 *   groups: SourceGroup[], items: SourceItem[],
 * }} SourcesManifest
 * @typedef {{
 *   item: SourceItem, path: string, size: number, sha256: string, md5: string | null, sha512: string | null,
 *   basis: 'sha256' | 'sha512' | 'md5' | 'recorded', commit: string | null,
 * }} CheckedSource
 */

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * 받는 주소로 쓸 수 있는지: https만(시험용 작은 서버 127.0.0.1·localhost의 http는 allowLoopbackHttp일 때만).
 * @param {unknown} value
 * @param {{ allowLoopbackHttp?: boolean }} [options]
 */
export function isAllowedSourceUrl(value, options = {}) {
  if (typeof value !== 'string' || /\s/u.test(value)) {
    return false;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') {
    return url.hostname !== '';
  }
  return options.allowLoopbackHttp === true && url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
}

/**
 * 목록의 모양을 검사한다. 문제 문장 목록(비었으면 통과).
 * @param {unknown} manifest
 * @param {{ allowLoopbackHttp?: boolean }} [options] 시험용 목록(작은 서버 주소)을 받을 때만 allowLoopbackHttp
 * @returns {string[]}
 */
export function validateSourcesManifest(manifest, options = {}) {
  /** @type {string[]} */
  const problems = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['대응 소스 목록이 JSON 객체가 아니에요.'];
  }
  const data = /** @type {Record<string, any>} */ (manifest);
  if (data.schema !== SOURCES_MANIFEST_SCHEMA) {
    problems.push(`schema가 ${SOURCES_MANIFEST_SCHEMA}이 아니에요(지금 ${JSON.stringify(data.schema)}).`);
  }
  if (typeof data.releaseTag !== 'string' || !SAFE_TAG.test(data.releaseTag)) {
    problems.push('releaseTag(릴리스 태그 이름)가 비었거나 쓸 수 없는 글자가 있어요.');
  }
  if (typeof data.checkedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(data.checkedOn)) {
    problems.push('checkedOn(목록을 공식 자료와 대조한 날, 2026-09-28 모양)이 없어요.');
  }

  const site = data.site;
  if (!site || typeof site !== 'object') {
    problems.push('site(목록이 가리키는 사이트 판) 칸이 없어요.');
  } else {
    for (const key of SITE_KEYS) {
      if (!isNonEmptyString(site[key])) {
        problems.push(`site.${key}가 비었어요.`);
      }
    }
    for (const key of ['pyodideLockSha256', 'opencvWheelSha256']) {
      if (isNonEmptyString(site[key]) && !HEX64.test(site[key])) {
        problems.push(`site.${key}가 SHA-256(소문자 16진수 64자리) 모양이 아니에요.`);
      }
    }
  }

  const groups = Array.isArray(data.groups) ? data.groups : [];
  if (groups.length === 0) {
    problems.push('groups(묶음)가 비었어요.');
  }
  const groupIds = new Set();
  for (const [index, group] of groups.entries()) {
    const where = `groups[${index}]`;
    if (!group || typeof group !== 'object') {
      problems.push(`${where}가 객체가 아니에요.`);
      continue;
    }
    if (typeof group.id !== 'string' || !SAFE_ID.test(group.id)) {
      problems.push(`${where}.id가 비었거나 쓸 수 없는 글자가 있어요.`);
    } else if (groupIds.has(group.id)) {
      problems.push(`묶음 id "${group.id}"가 두 번 나와요.`);
    } else {
      groupIds.add(group.id);
    }
    for (const key of ['title', 'titleKo', 'license', 'binary', 'binaryKo', 'notice', 'why', 'whyKo', 'tools', 'toolsKo']) {
      if (!isNonEmptyString(group[key])) {
        problems.push(`${where}.${key}가 비었어요.`);
      }
    }
  }

  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) {
    problems.push('items(파일)가 비었어요.');
  }
  const ids = new Set();
  const files = new Set();
  const metaFiles = new Set(SOURCES_FOLDER_META_FILES.map((name) => name.toLowerCase()));
  for (const [index, item] of items.entries()) {
    const where = `items[${index}]${item && typeof item.id === 'string' ? `(${item.id})` : ''}`;
    if (!item || typeof item !== 'object') {
      problems.push(`${where}가 객체가 아니에요.`);
      continue;
    }
    if (typeof item.id !== 'string' || !SAFE_ID.test(item.id)) {
      problems.push(`${where}.id가 비었거나 쓸 수 없는 글자가 있어요.`);
    } else if (ids.has(item.id)) {
      problems.push(`파일 id "${item.id}"가 두 번 나와요.`);
    } else {
      ids.add(item.id);
    }
    if (typeof item.group !== 'string' || !groupIds.has(item.group)) {
      problems.push(`${where}.group "${String(item.group)}"이(가) groups에 없어요.`);
    }
    if (typeof item.file !== 'string' || !SAFE_FILE.test(item.file) || item.file.endsWith('.part')) {
      problems.push(`${where}.file은 영어·숫자와 . _ + -만 쓴 파일 이름이어야 해요(폴더 구분자·빈칸 없이).`);
    } else if (metaFiles.has(item.file.toLowerCase())) {
      problems.push(`${where}.file "${item.file}"은(는) 도구가 쓰는 파일 이름이라 쓸 수 없어요.`);
    } else if (files.has(item.file.toLowerCase())) {
      problems.push(`파일 이름 "${item.file}"이(가) 두 번 나와요(Windows는 대소문자를 가리지 않아요).`);
    } else {
      files.add(item.file.toLowerCase());
    }
    if (!Array.isArray(item.urls) || item.urls.length === 0) {
      problems.push(`${where}.urls(받는 곳)가 비었어요.`);
    } else {
      for (const url of item.urls) {
        if (!isAllowedSourceUrl(url, options)) {
          problems.push(`${where}.urls의 "${String(url)}"은(는) https 주소가 아니에요.`);
        }
      }
    }
    if (item.size !== null && !(Number.isSafeInteger(item.size) && item.size > 0)) {
      problems.push(`${where}.size는 null이거나 양의 정수(바이트)여야 해요.`);
    }
    if (item.sha256 !== null && (typeof item.sha256 !== 'string' || !HEX64.test(item.sha256))) {
      problems.push(`${where}.sha256은 null이거나 소문자 16진수 64자리여야 해요.`);
    }
    if (item.md5 !== null && (typeof item.md5 !== 'string' || !HEX32.test(item.md5))) {
      problems.push(`${where}.md5는 null이거나 소문자 16진수 32자리여야 해요.`);
    }
    const sha512 = item.sha512 ?? null;
    if (sha512 !== null && (typeof sha512 !== 'string' || !HEX128.test(sha512))) {
      problems.push(`${where}.sha512는 없거나 소문자 16진수 128자리여야 해요.`);
    }
    if (item.commit !== undefined && (typeof item.commit !== 'string' || !HEX40.test(item.commit))) {
      problems.push(`${where}.commit은 없거나 git 커밋 이름(소문자 16진수 40자리)이어야 해요.`);
    }
    if ((item.sha256 !== null || item.md5 !== null || sha512 !== null) && !isNonEmptyString(item.hashSource)) {
      problems.push(`${where}.hashSource(공식 값을 어디서 가져왔는지)가 비었어요.`);
    }
    if (item.sha256 === null && item.md5 === null && sha512 === null && item.commit === undefined) {
      problems.push(`${where}은(는) 공식 해시가 없어서 commit(압축 안에 적힌 git 커밋 40자리)이 있어야 해요 — 받은 뒤 내용을 확인할 길이 없어요.`);
    }
    for (const key of ['what', 'whatKo', 'license']) {
      if (!isNonEmptyString(item[key]) || /\bTODO\b/u.test(item[key])) {
        problems.push(`${where}.${key}가 비었거나 TODO예요.`);
      }
    }
    if (item.use !== undefined && !ITEM_USES.includes(item.use)) {
      problems.push(`${where}.use는 ${ITEM_USES.join(' 또는 ')}여야 해요.`);
    }
  }
  return problems;
}

/** 글 앞의 BOM을 뗀다(메모장 등이 붙일 수 있다 — JSON.parse는 BOM을 받지 않는다) */
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * 저장소의 대응 소스 목록을 읽고 검사한다.
 * @param {string} rootDir 저장소 뿌리
 * @param {string} [file] 목록 파일(저장소 뿌리 기준, 또는 시험용 절대 경로)
 * @returns {{ manifest: SourcesManifest | null, problems: string[] }}
 */
export function readSourcesManifest(rootDir, file = SOURCES_MANIFEST_FILE) {
  const full = path.isAbsolute(file) ? file : path.join(rootDir, ...file.split('/'));
  let parsed;
  try {
    parsed = JSON.parse(stripBom(fs.readFileSync(full, 'utf8')));
  } catch (error) {
    return { manifest: null, problems: [`${file}을(를) 읽지 못했어요: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const problems = validateSourcesManifest(parsed);
  return { manifest: problems.length === 0 ? /** @type {SourcesManifest} */ (parsed) : null, problems };
}

/**
 * SHA256SUMS.txt(GNU sha256sum 모양)를 읽는다: "<16진수 64자리> <빈칸이나 *><파일 이름>" 한 줄에 하나, 빈 줄·# 줄은 건너뜀.
 * @param {string} text
 * @returns {{ entries: Map<string, string>, problems: string[] }} entries: 파일 이름 → SHA-256(소문자)
 */
export function parseSha256Sums(text) {
  /** @type {Map<string, string>} */
  const entries = new Map();
  /** @type {string[]} */
  const problems = [];
  const lines = stripBom(text).split(/\r?\n/u);
  for (const [index, raw] of lines.entries()) {
    const line = raw.trimEnd();
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      continue;
    }
    const match = /^([0-9A-Fa-f]{64}) [ *](.+)$/u.exec(line);
    if (!match) {
      problems.push(`${SOURCES_SUMS_FILE} ${index + 1}번 줄을 읽지 못했어요("<SHA-256>  <파일 이름>" 모양이 아니에요).`);
      continue;
    }
    const file = match[2];
    if (!SAFE_FILE.test(file)) {
      problems.push(`${SOURCES_SUMS_FILE} ${index + 1}번 줄의 파일 이름 "${file}"은(는) 쓸 수 없어요(폴더 구분자 없이 이름만).`);
      continue;
    }
    const hash = match[1].toLowerCase();
    const before = entries.get(file);
    if (before !== undefined && before !== hash) {
      problems.push(`${SOURCES_SUMS_FILE}에 ${file}의 값이 둘이에요.`);
      continue;
    }
    entries.set(file, hash);
  }
  return { entries, problems };
}

/**
 * 파일의 크기와 SHA-256(원하면 MD5·SHA-512)을 잰다. 1MiB씩 읽어 큰 파일도 메모리에 모으지 않는다.
 * @param {string} filePath
 * @param {{ md5?: boolean, sha512?: boolean }} [options]
 * @returns {{ size: number, sha256: string, md5: string | null, sha512?: string | null }}
 */
export function hashFile(filePath, options = {}) {
  const sha256 = crypto.createHash('sha256');
  const md5 = options.md5 ? crypto.createHash('md5') : null;
  const sha512 = options.sha512 ? crypto.createHash('sha512') : null;
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = fs.openSync(filePath, 'r');
  let size = 0;
  try {
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (read === 0) {
        break;
      }
      const chunk = buffer.subarray(0, read);
      sha256.update(chunk);
      md5?.update(chunk);
      sha512?.update(chunk);
      size += read;
    }
  } finally {
    fs.closeSync(fd);
  }
  return { size, sha256: sha256.digest('hex'), md5: md5 ? md5.digest('hex') : null, ...(sha512 ? { sha512: sha512.digest('hex') } : {}) };
}

/**
 * tar 앞머리(풀린 앞 1,024바이트 이상)에서 git archive가 적는 커밋 이름을 읽는다: 첫 512바이트 머리의 종류가 'g'(pax 전역 머리)이고
 * 다음 512바이트에 "52 comment=<40자리>\n" 기록이 있을 때(git 문서 git-archive — "the commit ID is stored in a global extended pax header").
 * @param {Buffer} tar
 * @returns {string | null}
 */
export function readPaxCommit(tar) {
  if (tar.length < 1024 || tar[156] !== 0x67) {
    return null;
  }
  const match = /(?:^|\n)\d+ comment=([0-9a-f]{40})\n/u.exec(tar.subarray(512, 1024).toString('latin1'));
  return match ? match[1] : null;
}

/**
 * GitHub 소스 압축(.tar.gz — git archive가 만듦)을 확인한다(공식 해시가 없는 파일 — 머리말). 풀어서 쓰지 않고 읽기만 한다.
 * - gzip이 아니면(차단 안내 쪽 등) commit null
 * - 끝까지 풀리고 tar 끝 표시(512바이트 단위, 마지막 1,024바이트가 0)가 있어야 complete — 끊긴 받기를 막는다
 * @param {string} filePath
 * @returns {{ commit: string | null, complete: boolean, problem: string | null }}
 */
export function inspectGitArchive(filePath) {
  let data;
  try {
    data = fs.readFileSync(filePath);
  } catch (error) {
    return { commit: null, complete: false, problem: `파일을 읽지 못했어요: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (data.length < 18 || data[0] !== 0x1f || data[1] !== 0x8b) {
    return { commit: null, complete: false, problem: 'gzip 압축이 아니에요(학교망 차단 안내 같은 웹 쪽을 받았을 수 있어요)' };
  }
  let commit = null;
  try {
    commit = readPaxCommit(zlib.gunzipSync(data.subarray(0, Math.min(data.length, 64 * 1024)), { finishFlush: zlib.constants.Z_SYNC_FLUSH }));
  } catch {
    commit = null;
  }
  let tar;
  try {
    tar = zlib.gunzipSync(data);
  } catch (error) {
    return { commit, complete: false, problem: `압축이 끝까지 풀리지 않아요(받다 끊긴 파일일 수 있어요): ${error instanceof Error ? error.message : String(error)}` };
  }
  const tail = tar.subarray(Math.max(0, tar.length - 1024));
  const complete = tar.length >= 2048 && tar.length % 512 === 0 && tail.every((byte) => byte === 0);
  return { commit, complete, problem: complete ? null : 'tar 끝 표시가 없어요(받다 끊긴 파일일 수 있어요)' };
}

/**
 * 공식 해시가 하나도 없는(아직 고정하지 않은) 목록 항목 — 이런 목록으로는 오프라인판·릴리스를 만들지 않는다(머리말).
 * @param {SourcesManifest} manifest
 * @returns {SourceItem[]}
 */
export function unpinnedSourceItems(manifest) {
  return manifest.items.filter((item) => item.sha256 === null && item.md5 === null && (item.sha512 ?? null) === null);
}

/** 메모리의 내용 SHA-256 */
export function sha256Of(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * 받은 폴더를 목록과 대조한다(머리말의 확인 규칙).
 * @param {{ folder: string, manifest: SourcesManifest }} input
 * @returns {{ ok: boolean, files: CheckedSource[], problems: string[], notes: string[] }}
 */
export function checkSourcesFolder({ folder, manifest }) {
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const notes = [];
  /** @type {CheckedSource[]} */
  const files = [];
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    return { ok: false, files, problems: [`대응 소스 폴더가 없어요: ${folder}`], notes };
  }
  const sumsPath = path.join(folder, SOURCES_SUMS_FILE);
  /** @type {Map<string, string>} */
  let sums = new Map();
  if (fs.existsSync(sumsPath)) {
    const parsed = parseSha256Sums(fs.readFileSync(sumsPath, 'utf8'));
    sums = parsed.entries;
    problems.push(...parsed.problems);
  } else {
    problems.push(`${SOURCES_SUMS_FILE}이(가) 없어요 — scripts/release/fetch-sources.ps1이 받은 폴더에 쓰는 파일이에요.`);
  }

  const known = new Set(manifest.items.map((item) => item.file));
  const absent = manifest.items.filter((item) => {
    const filePath = path.join(folder, item.file);
    return !fs.existsSync(filePath) || !fs.statSync(filePath).isFile();
  });
  if (absent.length === manifest.items.length) {
    // 받기 전 폴더(또는 다른 폴더) — 파일마다 한 줄 대신 한 줄로
    return {
      ok: false,
      files,
      problems: [`목록의 파일 ${manifest.items.length}개가 이 폴더에 하나도 없어요 — 먼저 scripts/release/fetch-sources.ps1로 받아요(scripts/release/README.md).`],
      notes,
    };
  }
  for (const item of manifest.items) {
    const filePath = path.join(folder, item.file);
    if (absent.includes(item)) {
      problems.push(`${item.file}이(가) 폴더에 없어요.`);
      continue;
    }
    const wantSha512 = (item.sha512 ?? null) !== null;
    const measured = hashFile(filePath, { md5: item.md5 !== null, sha512: wantSha512 });
    const before = problems.length;
    if (item.size !== null && measured.size !== item.size) {
      problems.push(`${item.file}의 크기가 ${measured.size.toLocaleString('en-US')}바이트예요(목록 ${item.size.toLocaleString('en-US')}바이트).`);
    }
    /** @type {CheckedSource['basis']} */
    let basis = 'recorded';
    if (item.sha256 !== null) {
      basis = 'sha256';
      if (measured.sha256 !== item.sha256) {
        problems.push(`${item.file}의 SHA-256이 목록의 값과 달라요(잰 값 ${measured.sha256}).`);
      }
    }
    if (wantSha512) {
      if (basis === 'recorded') {
        basis = 'sha512';
      }
      if (measured.sha512 !== item.sha512) {
        problems.push(`${item.file}의 SHA-512가 목록의 공식 값과 달라요(잰 값 ${measured.sha512}).`);
      }
    }
    if (item.md5 !== null) {
      if (basis === 'recorded') {
        basis = 'md5';
      }
      if (measured.md5 !== item.md5) {
        problems.push(`${item.file}의 MD5가 목록의 공식 값과 달라요(잰 값 ${measured.md5}).`);
      }
    }
    /** 압축 안에서 읽은 커밋(목록에 commit이 있는 파일만) */
    let commit = null;
    if (item.commit !== undefined) {
      const archive = inspectGitArchive(filePath);
      commit = archive.commit;
      if (!archive.complete) {
        problems.push(`${item.file}: ${archive.problem ?? '압축을 끝까지 읽지 못했어요'} — fetch-sources.ps1로 다시 받아요.`);
      } else if (archive.commit !== item.commit) {
        problems.push(`${item.file} 안의 git 커밋이 ${archive.commit ?? '(없음)'}이에요(목록 ${item.commit}) — 다른 판을 받았어요.`);
      }
    }
    const recorded = sums.get(item.file);
    if (recorded === undefined) {
      if (sums.size > 0 || fs.existsSync(sumsPath)) {
        problems.push(`${SOURCES_SUMS_FILE}에 ${item.file} 줄이 없어요 — fetch-sources.ps1을 다시 돌려요.`);
      }
    } else if (recorded !== measured.sha256) {
      problems.push(`${item.file}이(가) 받은 뒤에 바뀌었어요(${SOURCES_SUMS_FILE}의 값과 달라요) — fetch-sources.ps1로 다시 받아요.`);
    }
    if (problems.length === before) {
      files.push({ item, path: filePath, size: measured.size, sha256: measured.sha256, md5: measured.md5, sha512: measured.sha512 ?? null, basis, commit });
    }
  }

  const meta = new Set(SOURCES_FOLDER_META_FILES);
  const extra = fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !known.has(entry.name) && !meta.has(entry.name) && !entry.name.endsWith('.part'))
    .map((entry) => entry.name)
    .sort();
  if (extra.length > 0) {
    notes.push(`목록에 없는 파일은 넣지 않아요: ${extra.join(', ')}`);
  }
  const unknownSums = [...sums.keys()].filter((file) => !known.has(file)).sort();
  if (unknownSums.length > 0) {
    notes.push(`${SOURCES_SUMS_FILE}에 목록 밖 파일 줄이 있어요(쓰지 않아요): ${unknownSums.join(', ')}`);
  }
  return { ok: problems.length === 0, files, problems, notes };
}

/**
 * 이 사이트가 지금 나누는 판(목록의 site 칸과 대조할 값)을 읽는다.
 * @param {string} rootDir 저장소 뿌리
 * @param {string} pyodideVersion src/lab/loader/pyodide-files.ts의 PYODIDE_VERSION
 */
export function readSiteSourcesActual(rootDir, pyodideVersion) {
  const lockBytes = fs.readFileSync(path.join(rootDir, 'node_modules', 'pyodide', 'pyodide-lock.json'));
  const lock = JSON.parse(lockBytes.toString('utf8'));
  const opencv = lock?.packages?.['opencv-python'] ?? null;
  const pagefind = JSON.parse(fs.readFileSync(path.join(rootDir, 'node_modules', 'pagefind', 'package.json'), 'utf8'));
  return {
    pyodideVersion,
    pyodideLockSha256: sha256Of(lockBytes),
    opencvWheel: typeof opencv?.file_name === 'string' ? opencv.file_name : null,
    opencvWheelSha256: typeof opencv?.sha256 === 'string' ? opencv.sha256 : null,
    pagefindVersion: typeof pagefind?.version === 'string' ? pagefind.version : null,
  };
}

/**
 * 목록의 site 칸과 실제 판이 다른 곳(문장 목록 — 비었으면 같음).
 * @param {SourcesManifest} manifest
 * @param {Record<string, string | null>} actual readSiteSourcesActual 결과
 */
export function sourcesSiteMismatches(manifest, actual) {
  /** @type {string[]} */
  const out = [];
  for (const key of SITE_KEYS) {
    const expected = /** @type {Record<string, string>} */ (manifest.site)[key];
    if (expected !== actual[key]) {
      out.push(`site.${key}: 목록 ${expected} ↔ 이 사이트 ${actual[key] ?? '(없음)'}`);
    }
  }
  return out;
}

/**
 * zip 안 sources/SHA256SUMS.txt 내용(목록 차례, LF — macOS·Linux의 sha256sum -c가 그대로 읽는다).
 * @param {CheckedSource[]} files
 */
export function sourcesSha256SumsText(files) {
  return files.map((file) => `${file.sha256}  ${file.item.file}\n`).join('');
}

function bytesText(size) {
  return size.toLocaleString('en-US');
}

/**
 * zip 안 sources/읽어보세요.txt 내용(한국어 뒤에 영어, LF — 쓰는 쪽이 CRLF·BOM을 붙인다).
 * 이 컴퓨터의 경로는 넣지 않는다(파일 이름·크기·공식 주소만).
 * @param {{ manifest: SourcesManifest, files: CheckedSource[], version: string }} input
 */
export function sourcesReadmeText({ manifest, files, version }) {
  const byGroup = new Map(manifest.groups.map((group) => [group.id, /** @type {CheckedSource[]} */ ([])]));
  for (const file of files) {
    byGroup.get(file.item.group)?.push(file);
  }
  const commitCount = files.filter((file) => file.item.commit !== undefined).length;
  const crateUrl = 'https://static.crates.io/crates/<이름>/<이름>-<판>.crate';
  const lines = [
    `AI 피지컬 컴퓨팅 오픈랩 오프라인판 ${version} — 대응 소스 사본`,
    `Corresponding source for the AI Physical Computing Open Lab offline edition ${version} (English below)`,
    '',
    '이 sources 폴더에는 이 묶음이 고치지 않고 다시 나누는 실행 파일의 "대응 소스"(그 실행 파일을 만든 원래 소스와',
    '빌드 방법)가 들어 있어요. 아래 라이선스가 실행 파일을 받은 사람이 소스도 받을 수 있게 하라고 해서 함께 넣었어요.',
    '파일은 모두 공식 주소에서 받은 그대로이고, 하나도 고치지 않았어요.',
    '',
  ];
  for (const group of manifest.groups) {
    const groupFiles = byGroup.get(group.id) ?? [];
    if (groupFiles.length === 0) {
      continue;
    }
    lines.push(`■ ${group.titleKo}`, `  실행 파일: ${group.binaryKo}`, `  고지: ${group.notice}`, '  파일:');
    for (const file of groupFiles) {
      const crate = file.item.file.endsWith('.crate');
      lines.push(`  - ${file.item.file} (${bytesText(file.size)}바이트) — ${file.item.whatKo}`);
      if (!crate) {
        lines.push(`      받은 곳: ${file.item.urls[0]}`);
      }
    }
    if (groupFiles.some((file) => file.item.file.endsWith('.crate'))) {
      lines.push(`    (.crate 파일은 모두 crates.io의 ${crateUrl} 에서 받은 것 — 크레이트 이름·판은 파일 이름에 있어요)`);
    }
    lines.push(`  여기에 넣지 않은 빌드 도구: ${group.toolsKo}`, '');
  }
  lines.push(
    '확인하는 법',
    `  같은 폴더의 ${SOURCES_SUMS_FILE}에 파일마다 SHA-256이 있어요.`,
    '  - Windows PowerShell: Get-FileHash -Algorithm SHA256 <파일 이름>  → 그 값과 같으면 받은 그대로예요.',
    `  - macOS·Linux: 이 폴더에서  sha256sum -c ${SOURCES_SUMS_FILE}`,
    '  공식 해시가 있는 파일은 그 값과 같은지 확인한 뒤 넣었어요(목록: 공개 저장소의 scripts/release/sources-manifest.json).',
  );
  if (commitCount > 0) {
    lines.push(
      `  공식 해시가 없는 ${commitCount}개(GitHub가 그때그때 만드는 압축)는 압축 안에 적힌 git 커밋이 목록과 같은지 확인하고,`,
      '  받은 날 잰 SHA-256을 목록에 고정해 그 값과 같은지 확인했어요.',
    );
  }
  lines.push(
    '  같은 파일을 공개 저장소의 릴리스 목록(https://github.com/songdocomputerpark-lang/ai-physical-computing/releases)에서도',
    `  받을 수 있어요(운영자가 태그 ${manifest.releaseTag}로 올린 뒤부터).`,
    '',
    '────────────────────────────────────────────────────────────',
    '',
    `Corresponding source — AI Physical Computing Open Lab offline edition ${version}`,
    '',
    'This sources folder holds the corresponding source (the original source code and build scripts) of the unmodified',
    'binaries that this package redistributes, as their licenses require. Every file is exactly as downloaded from its',
    'official address; nothing was changed.',
    '',
  );
  for (const group of manifest.groups) {
    const groupFiles = byGroup.get(group.id) ?? [];
    if (groupFiles.length === 0) {
      continue;
    }
    lines.push(`* ${group.title}`, `  Binary: ${group.binary}`, `  Notice: ${group.notice}`, '  Files:');
    for (const file of groupFiles) {
      lines.push(`  - ${file.item.file} (${bytesText(file.size)} bytes) - ${file.item.what}`);
      if (!file.item.file.endsWith('.crate')) {
        lines.push(`      from ${file.item.urls[0]}`);
      }
    }
    if (groupFiles.some((file) => file.item.file.endsWith('.crate'))) {
      lines.push('    (every .crate file comes from https://static.crates.io/crates/<name>/<name>-<version>.crate)');
    }
    lines.push(`  Build tools not included here: ${group.tools}`, '');
  }
  lines.push(
    'How to check',
    `  ${SOURCES_SUMS_FILE} in this folder lists the SHA-256 of every file.`,
    '  - Windows PowerShell: Get-FileHash -Algorithm SHA256 <file>',
    `  - macOS/Linux: in this folder run  sha256sum -c ${SOURCES_SUMS_FILE}`,
    '  Files with an official hash were checked against it (list: scripts/release/sources-manifest.json in the public repository).',
  );
  if (commitCount > 0) {
    lines.push(
      `  The ${commitCount} archive(s) without an official hash (GitHub builds them on request) carry the git commit named in the list`,
      '  (checked inside the archive) and match the SHA-256 measured when they were downloaded and pinned in the list.',
    );
  }
  lines.push(
    `  The same files can also be found in the repository releases (tag ${manifest.releaseTag}, once the operator has published it):`,
    '  https://github.com/songdocomputerpark-lang/ai-physical-computing/releases',
    '',
  );
  return lines.join('\n');
}

/**
 * zip 안 sources/의 안내 글 두 개(맨 위 폴더 기준 이름·내용). build-offline이 안내 파일 목록에 더해 개인정보 검사를 함께 받게 한다.
 * 읽어보세요.txt는 다른 안내 글처럼 CRLF + UTF-8 BOM(메모장·PowerShell 5.1), SHA256SUMS.txt는 LF(sha256sum -c).
 * @param {{ manifest: SourcesManifest, files: CheckedSource[], version: string }} input
 * @returns {{ name: string, data: Buffer }[]}
 */
export function sourcesGuideFiles({ manifest, files, version }) {
  return [
    { name: `${SOURCES_ZIP_DIR}/${SOURCES_README_NAME}`, data: Buffer.from(`﻿${toCrlf(sourcesReadmeText({ manifest, files, version }))}`, 'utf8') },
    { name: `${SOURCES_ZIP_DIR}/${SOURCES_SUMS_FILE}`, data: Buffer.from(sourcesSha256SumsText(files), 'utf8') },
  ];
}

/**
 * 확인한 소스 압축을 zip의 <맨 위 폴더>/sources/에 넣는다: 이미 압축된 파일이라 저장 방식(0)으로, 넣기 직전에 SHA-256을 한 번 더 재서
 * 확인한 뒤에 바뀐 파일이면 멈춘다. 폴더 항목(<맨 위>/sources/)은 부르는 쪽이 다른 폴더와 함께 먼저 넣는다.
 * @param {{ addFile: (name: string, data: Buffer, options?: { method?: 0 | 8 }) => void }} writer scripts/lib/offline-zip.mjs의 ZipWriter
 * @param {string} top 맨 위 폴더(끝에 /)
 * @param {CheckedSource[]} files
 */
export function addSourceArchivesToZip(writer, top, files) {
  for (const file of files) {
    const data = fs.readFileSync(file.path);
    if (sha256Of(data) !== file.sha256) {
      throw new Error(`${file.item.file}이(가) 확인한 뒤에 바뀌었어요 — 대응 소스 폴더를 다시 확인해요.`);
    }
    writer.addFile(`${top}${SOURCES_ZIP_DIR}/${file.item.file}`, data, { method: 0 });
  }
}

/**
 * build:offline 명령 줄에서 --sources <폴더>(또는 --sources=<폴더>)를 읽는다.
 * @param {readonly string[]} argv
 * @returns {{ folder: string | null, error: string | null }}
 */
export function parseSourcesOption(argv) {
  /** @type {string | null} */
  let folder = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== '--sources' && !arg.startsWith('--sources=')) {
      continue;
    }
    const value = arg === '--sources' ? argv[index + 1] : arg.slice('--sources='.length);
    if (arg === '--sources') {
      index += 1;
    }
    if (value === undefined || value === '' || value.startsWith('--')) {
      return { folder: null, error: `--sources 뒤에 대응 소스 폴더를 적어요(예: --sources ${SOURCES_DEFAULT_DIR}).` };
    }
    if (folder !== null) {
      return { folder: null, error: '--sources는 한 번만 적어요.' };
    }
    folder = value;
  }
  return { folder, error: null };
}

/**
 * Cargo.lock(판 3·4)에서 crates.io 크레이트의 이름·판·체크섬(= .crate 파일의 SHA-256)을 읽는다. 경로 의존(체크섬 없음)은 뺀다.
 * Pagefind 판을 올릴 때 새 pagefind_web/Cargo.lock으로 목록의 크레이트 칸을 다시 만든다(scripts/release/crates-from-lock.mjs).
 * @param {string} text
 * @returns {{ name: string, version: string, checksum: string }[]}
 */
export function cratesFromCargoLock(text) {
  /** @type {{ name: string, version: string, checksum: string }[]} */
  const out = [];
  const blocks = stripBom(text).split(/^\[\[package\]\]\s*$/mu).slice(1);
  for (const block of blocks) {
    const field = (key) => {
      const match = new RegExp(`^${key} = "([^"]*)"\\s*$`, 'mu').exec(block);
      return match ? match[1] : null;
    };
    const name = field('name');
    const version = field('version');
    const source = field('source');
    const checksum = field('checksum');
    if (!name || !version) {
      throw new Error('Cargo.lock의 [[package]]에 name이나 version이 없어요.');
    }
    if (source === null) {
      continue;
    }
    if (!source.startsWith('registry+')) {
      throw new Error(`${name} ${version}은(는) crates.io가 아닌 곳(${source})에서 와요 — 목록에 넣는 방법을 따로 정해요.`);
    }
    if (checksum === null || !HEX64.test(checksum)) {
      throw new Error(`${name} ${version}의 checksum이 없거나 SHA-256 모양이 아니에요.`);
    }
    if (!SAFE_FILE.test(`${name}-${version}.crate`)) {
      throw new Error(`${name} ${version}의 이름·판에 쓸 수 없는 글자가 있어요.`);
    }
    out.push({ name, version, checksum });
  }
  return out;
}

/**
 * 크레이트 하나를 목록 항목으로(라이선스·쓰임은 crates.io에서 확인해 채운다 — 비워 두면 목록 검사가 막는다).
 * @param {{ name: string, version: string, checksum: string }} crate
 * @param {{ hashSource: string, group: string, license?: string, use?: 'wasm' | 'build' }} options
 * @returns {SourceItem}
 */
export function crateSourceItem(crate, options) {
  const { name, version, checksum } = crate;
  const use = options.use;
  const role =
    use === 'wasm'
      ? { en: 'compiled into the search wasm', ko: '검색 엔진 wasm에 함께 컴파일됨' }
      : use === 'build'
        ? { en: 'used only while building the wasm (procedural macro or its dependency)', ko: 'wasm을 만들 때만 쓰는 매크로(또는 그 의존)' }
        : { en: 'TODO: wasm or build', ko: 'TODO' };
  return {
    id: `crate-${name.toLowerCase()}-${version.toLowerCase()}`,
    group: options.group,
    file: `${name}-${version}.crate`,
    urls: [`https://static.crates.io/crates/${name}/${name}-${version}.crate`, `https://crates.io/api/v1/crates/${name}/${version}/download`],
    size: null,
    sha256: checksum,
    md5: null,
    hashSource: options.hashSource,
    what: `${name} ${version} (crates.io) - ${role.en}`,
    whatKo: `크레이트 ${name} ${version} — ${role.ko}`,
    license: options.license ?? 'TODO',
    ...(use ? { use } : {}),
  };
}
