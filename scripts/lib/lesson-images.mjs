// 원고 이미지 목록의 규칙과 검사(PLAN §8.5 P5-01, §9.3, PD-18·PD-32).
// scripts/extract-lesson-images.mjs(추출 도구), scripts/lib/repo-check.mjs(커밋 전 훅·CI의 눈 확인 기록 검사), 단위 테스트가 함께 쓴다.
//
// ■ 차시마다 따로인 그림 목록 = 허용 목록 + 눈 확인 기록
//   content/lessons/<단원 폴더>/<차시>.images.yaml  (차시 md 바로 옆. 예: content/lessons/u1/1-1-2.images.yaml)
//   - 여기에 적은 그림만 도구가 원본에서 꺼낸다(기본 거부). 적지 않은 그림은 꺼내지 않는다.
//   - 여러 구역이 동시에 일해도 서로 다른 파일만 고치게, 목록·기록·결과 폴더를 차시마다 나눴다.
//   - 결과 그림: public/images/lessons/<폴더>/<name>.webp — 폴더는 기본이 차시 파일 이름(1-1-2, v1, c3)이고,
//     단원마다 같은 이름을 쓰는 차시(review)는 folder: u1-review처럼 "<단원 폴더>-<차시>"로 적는다.
//   - 제3자 권리 그림(third_party: <키>)은 public/images/lessons/<폴더>/third-party/<키>/<name>.webp에 두고,
//     sources.yaml의 category: third_party 항목이 public/images/lessons/*/third-party/<키>/** 로 그 폴더를 덮는다.
//     출판 편집 삽화·컷(이름표 (삽)·(컷))은 운영자 결정 O10(2026-09-25)으로 운영자 자료라 third_party 없이 차시 그림 폴더에 바로 둔다.
// ■ 옛 공용 기록 scripts/image-allowlist.yaml은 차시 밖 그림(사이트 화면 그림, 테스트 그림 등)과 도구 이전에 손으로 꺼낸 그림에 쓴다.
// ■ 제외 쪽 scripts/image-exclusions.yaml(INVENTORY §6) — 목록에 적어도 꺼내지 않는다.
//
// 목록 항목의 칸(사람이 적는 칸 → 도구가 적는 칸 → 사람이 눈으로 보고 적는 칸)은 MAINTENANCE.md 3절과 buildEntry()의 설명을 본다.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { toPosixPath } from './glob.mjs';
import { findMatchingEntries } from './sources-registry.mjs';

export const LESSONS_DIR = 'content/lessons';
export const MANIFEST_SUFFIX = '.images.yaml';
export const LESSON_IMAGE_ROOT = 'public/images/lessons';
export const LEGACY_IMAGE_ALLOWLIST = 'scripts/image-allowlist.yaml';
export const EXCLUSIONS_FILE = 'scripts/image-exclusions.yaml';
/** 쪽 미리 보기·얼굴 검사용 임시 파일 자리(git 제외) */
export const WORK_DIR = '.cache/lesson-images';

/** 이름 규칙(PD-09): 영문 소문자·숫자·하이픈 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
export const RASTER_EXTENSIONS = Object.freeze(['.webp', '.png', '.jpg', '.jpeg', '.gif', '.avif', '.bmp', '.tif', '.tiff', '.heic', '.heif', '.ico']);

export const DEFAULTS = Object.freeze({ dpi: 220, maxWidth: 960, quality: 85 });

/**
 * 원본 약칭(docs/INVENTORY.md "표기 약속")과 파일. 경로는 원본 폴더(운영자 PC = 저장소 뿌리, 그 밖 = 비공개 자료 저장소의 originals/) 기준.
 * layout: spread = 한 PDF 쪽이 교과서 두 쪽(펼침면), page = 한 PDF 쪽이 한 쪽(슬라이드 교안), slides = PPTX
 * @type {Readonly<Record<string, { label: string, file: string, kind: 'pdf' | 'pptx', layout: 'spread' | 'page' | 'slides', pageSize: [number, number] }>>}
 */
export const SOURCES = Object.freeze({
  U1: { label: '교과서 원고 I단원 01·02', file: '교과서_안/고등_인공지능과피지컬_1단원-1, 2.pdf', kind: 'pdf', layout: 'spread', pageSize: [595.28, 779.53] },
  U2A: { label: '교과서 원고 II단원 01', file: '교과서_안/고등_인공지능과피지컬_2단원-1.pdf', kind: 'pdf', layout: 'spread', pageSize: [595.28, 779.53] },
  U2B: { label: '교과서 원고 II단원 02(1·2)', file: '교과서_안/고등_인공지능과피지컬_2단원-2(1, 2).pdf', kind: 'pdf', layout: 'spread', pageSize: [595.28, 779.53] },
  U2C: { label: '교과서 원고 II단원 02(3·4)', file: '교과서_안/고등_인공지능과피지컬_2단원-2(3,4).pdf', kind: 'pdf', layout: 'spread', pageSize: [595.28, 779.53] },
  U3: { label: '교과서 원고 III단원 01', file: '교과서_안/고등_인공지능과피지컬_3단원-1단원.pdf', kind: 'pdf', layout: 'spread', pageSize: [595.28, 779.53] },
  BT: { label: '블루투스 통신 수업 교안', file: '블루투스통신_수업교안/블루투스 통신 수업교안_0202.pdf', kind: 'pdf', layout: 'page', pageSize: [1440, 810] },
  PPT: { label: 'PyAutoGUI 수업 슬라이드', file: 'pyautugoui_소스코드/pyautogui_1122.py (1).pptx', kind: 'pptx', layout: 'slides', pageSize: [0, 0] },
});

/**
 * 교과서 원고 PDF의 펼침면 표(인쇄 쪽 번호 확인: 2026-09-25, 각 쪽 아래 숫자를 PyMuPDF로 읽어 INVENTORY §표기 약속의 식과 대조).
 * [PDF 쪽, 왼쪽 인쇄 쪽, 오른쪽 인쇄 쪽]. 오른쪽이 null이면 한 쪽짜리 PDF 쪽이다(U1 PDF 25 = 294쪽 정답).
 * @type {Readonly<Record<string, ReadonlyArray<readonly [number, number, number | null]>>>}
 */
export const SPREADS = Object.freeze({
  U1: [...range(1, 23).map((n) => /** @type {const} */ ([n, 2 * n + 4, 2 * n + 5])), [24, 112, 113], [25, 294, null]],
  U2A: range(1, 20).map((n) => /** @type {const} */ ([n, 2 * n + 112, 2 * n + 113])),
  U2B: range(1, 7).map((n) => /** @type {const} */ ([n, 2 * n + 152, 2 * n + 153])),
  U2C: range(1, 8).map((n) => /** @type {const} */ ([n, 2 * n + 164, 2 * n + 165])),
  U3: range(1, 14).map((n) => /** @type {const} */ ([n, 2 * n + 180, 2 * n + 181])),
});
/** 한 쪽짜리 원본의 쪽 수 */
const PAGE_COUNTS = Object.freeze({ BT: 91, PPT: 23 });

/**
 * @param {number} first
 * @param {number} last
 * @returns {number[]}
 */
function range(first, last) {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/**
 * @typedef {object} PageLocation
 * @property {number} pdfPage PDF 쪽(1부터). PPTX는 슬라이드 번호
 * @property {'left' | 'right' | 'full'} side 펼침면의 어느 쪽인지
 * @property {[number, number]} size 그 쪽의 크기(pt). 영역(region)은 이 크기 안이어야 한다
 */

/**
 * 원본 약칭과 쪽 번호(교과서 = 인쇄 쪽, BT = PDF 쪽, PPT = 슬라이드)로 PDF 쪽·펼침면의 어느 쪽인지 찾는다.
 * U2B와 U2C는 166~167쪽이 겹친다(INVENTORY §7.5 — U2C가 고친 판). 둘 다 찾을 수 있다.
 * @param {string} source
 * @param {number} page
 * @returns {PageLocation | null}
 */
export function locatePage(source, page) {
  const info = SOURCES[source];
  if (!info || !Number.isInteger(page)) {
    return null;
  }
  if (info.layout === 'spread') {
    for (const [pdfPage, left, right] of SPREADS[source] ?? []) {
      if (page === left) {
        return { pdfPage, side: right === null ? 'full' : 'left', size: info.pageSize };
      }
      if (page === right) {
        return { pdfPage, side: 'right', size: info.pageSize };
      }
    }
    return null;
  }
  const count = PAGE_COUNTS[/** @type {keyof typeof PAGE_COUNTS} */ (source)] ?? 0;
  return page >= 1 && page <= count ? { pdfPage: page, side: 'full', size: info.pageSize } : null;
}

/**
 * PDF 쪽 안의 한 점(가운데 x)이 어느 인쇄 쪽에 속하는지(그림 번호로 꺼낼 때 그림이 놓인 쪽 확인용).
 * @param {string} source
 * @param {number} pdfPage
 * @param {number} centerX PDF 쪽 좌표(pt)
 * @returns {number | null}
 */
export function printedPageAt(source, pdfPage, centerX) {
  const info = SOURCES[source];
  if (!info) return null;
  if (info.layout !== 'spread') return pdfPage;
  const row = (SPREADS[source] ?? []).find(([number]) => number === pdfPage);
  if (!row) return null;
  if (row[2] === null) return row[1];
  return centerX < info.pageSize[0] ? row[1] : row[2];
}

// ─────────────────────────────── 제외 쪽 ───────────────────────────────

export const EXCLUSION_KINDS = Object.freeze(['face', 'path', 'device-address', 'school-name', 'classroom', 'content']);
const KIND_LABELS = Object.freeze({
  face: '얼굴',
  path: '화면 속 경로·파일 이름',
  'device-address': '기기 주소',
  'school-name': '학교명',
  classroom: '학급 게시물 화면',
  content: '알맞지 않은 문구',
});

/**
 * @typedef {object} ExclusionRule
 * @property {string} source
 * @property {number[]} pages
 * @property {string} kind
 * @property {'region' | 'never'} override
 * @property {string} reason
 */

/**
 * @typedef {object} PageExclusion 한 쪽에 걸린 제외 항목을 합친 것
 * @property {'region' | 'never'} override never가 하나라도 있으면 never
 * @property {boolean} strictFaces face 항목이 하나라도 있으면 엄격 얼굴 검사
 * @property {string[]} kinds
 * @property {string[]} reasons
 */

/**
 * scripts/image-exclusions.yaml을 읽는다.
 * @param {string} text
 * @returns {{ rules: ExclusionRule[], errors: string[] }}
 */
export function parseExclusions(text) {
  /** @type {string[]} */
  const errors = [];
  /** @type {ExclusionRule[]} */
  const rules = [];
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length > 0) {
    return { rules, errors: document.errors.map((error) => `YAML 문법 오류: ${error.message.split('\n')[0]}`) };
  }
  const data = document.toJS();
  if (!isPlainObject(data) || !Array.isArray(data.exclusions)) {
    return { rules, errors: ['맨 위에 "exclusions:" 목록이 있어야 해요.'] };
  }
  data.exclusions.forEach((raw, index) => {
    const where = `exclusions의 ${index + 1}번째 항목`;
    if (!isPlainObject(raw)) {
      errors.push(`${where}: "이름: 값" 모양으로 적어요.`);
      return;
    }
    const pages = Array.isArray(raw.pages) ? raw.pages : [];
    if (typeof raw.source !== 'string' || !(raw.source in SOURCES)) {
      errors.push(`${where}: source는 ${Object.keys(SOURCES).join(' ')} 가운데 하나예요.`);
      return;
    }
    if (pages.length === 0 || !pages.every((page) => Number.isInteger(page) && page > 0)) {
      errors.push(`${where}: pages는 쪽 번호(자연수) 목록이에요.`);
      return;
    }
    if (typeof raw.kind !== 'string' || !EXCLUSION_KINDS.includes(raw.kind)) {
      errors.push(`${where}: kind는 ${EXCLUSION_KINDS.join(', ')} 가운데 하나예요.`);
      return;
    }
    if (raw.override !== 'region' && raw.override !== 'never') {
      errors.push(`${where}: override는 region 또는 never예요.`);
      return;
    }
    if (typeof raw.reason !== 'string' || raw.reason.trim() === '') {
      errors.push(`${where}: reason(까닭)을 적어요.`);
      return;
    }
    rules.push({ source: raw.source, pages: [...pages], kind: raw.kind, override: raw.override, reason: raw.reason.trim() });
  });
  return { rules, errors };
}

/**
 * 한 쪽에 걸린 제외 항목을 합친다. 걸리지 않으면 null.
 * @param {ExclusionRule[]} rules
 * @param {string} source
 * @param {number} page
 * @returns {PageExclusion | null}
 */
export function exclusionFor(rules, source, page) {
  const hits = rules.filter((rule) => rule.source === source && rule.pages.includes(page));
  if (hits.length === 0) {
    return null;
  }
  return {
    override: hits.some((rule) => rule.override === 'never') ? 'never' : 'region',
    strictFaces: hits.some((rule) => rule.kind === 'face'),
    kinds: [...new Set(hits.map((rule) => rule.kind))],
    reasons: hits.map((rule) => `${KIND_LABELS[/** @type {keyof typeof KIND_LABELS} */ (rule.kind)] ?? rule.kind} — ${rule.reason}`),
  };
}

// ─────────────────────────────── 그림 목록(*.images.yaml) ───────────────────────────────

/**
 * @typedef {object} ImageFrom 원본에서 꺼낼 자리
 * @property {string} source 원본 약칭(SOURCES)
 * @property {number} page 교과서 = 인쇄 쪽, BT = PDF 쪽, PPT = 슬라이드 번호
 * @property {[number, number, number, number] | undefined} region 그 쪽의 왼쪽 위 기준 pt 좌표 [x0, y0, x1, y1] — 쪽에 보이는 그대로 그려 꺼낸다
 * @property {number | undefined} image PDF 그림 번호(xref) — 원본 그림 그대로(쪽에서 가려진 부분까지 나올 수 있다)
 * @property {number | undefined} picture PPT 슬라이드 안 그림 순번(1부터)
 * @property {[number, number, number, number] | undefined} crop 꺼낸 그림에서 다시 잘라 낼 영역(px, 줄이기 전)
 * @property {number} dpi region을 그릴 해상도
 */

/**
 * @typedef {object} ImageEntry 목록의 그림 한 장
 * @property {number} index 목록 안 순번(0부터)
 * @property {string} name 파일 이름(확장자 없이)
 * @property {string} use 어디에 쓰는지
 * @property {string} alt 대체 글(장식 그림이면 빈 글)
 * @property {boolean} decorative 장식 그림인지
 * @property {ImageFrom | undefined} from 원본에서 꺼내는 그림
 * @property {string | undefined} origin 원본에서 꺼내지 않은 그림(사이트 화면 찍기 등)이 어디서 왔는지
 * @property {number} maxWidth
 * @property {number} quality
 * @property {boolean} lossless
 * @property {string | undefined} thirdParty 제3자 권리 그림의 키(sources.yaml third_party 항목의 폴더 이름)
 * @property {string | undefined} privacyOverride 제외 쪽에서 무엇을 잘라 냈는지
 * @property {string | undefined} file 도구가 적은(또는 origin 그림이면 사람이 적은) 저장소 경로
 * @property {string | undefined} sha256
 * @property {unknown} checks
 * @property {{ by: string, date: string, result: string } | undefined} reviewed
 */

/**
 * @typedef {object} ImageManifest
 * @property {string} path 저장소 뿌리 기준 경로
 * @property {string} slug 차시 파일 이름(1-1-2)
 * @property {string} folder 결과 폴더 이름
 * @property {ImageEntry[]} images
 */

const MANIFEST_KEYS = new Set(['folder', 'images']);
const ENTRY_KEYS = new Set([
  'name', 'use', 'alt', 'decorative', 'from', 'origin', 'max_width', 'quality', 'lossless', 'third_party', 'privacy_override', 'note',
  'file', 'width', 'height', 'bytes', 'sha256', 'checks', 'reviewed',
]);
const FROM_KEYS = new Set(['source', 'page', 'region', 'image', 'picture', 'crop', 'dpi']);

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {value is [number, number, number, number]}
 */
function isBox(value) {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item) && item >= 0) &&
    value[0] < value[2] &&
    value[1] < value[3]
  );
}

/** @param {string} filePath */
export function isManifestPath(filePath) {
  const posix = toPosixPath(filePath);
  return posix.startsWith(`${LESSONS_DIR}/`) && posix.endsWith(MANIFEST_SUFFIX);
}

/**
 * 목록 파일 경로 → 차시 이름(slug)과 단원 폴더 이름.
 * @param {string} filePath
 */
export function manifestNames(filePath) {
  const posix = toPosixPath(filePath);
  const slug = path.posix.basename(posix).slice(0, -MANIFEST_SUFFIX.length);
  const parent = path.posix.basename(path.posix.dirname(posix));
  return { slug, parent };
}

/**
 * 눈 확인 기록(reviewed) 검사 — 저장소 검사와 같은 규칙.
 * @param {unknown} reviewed
 * @returns {string | null}
 */
export function reviewedProblem(reviewed) {
  if (!isPlainObject(reviewed)) {
    return 'reviewed 기록이 없어요';
  }
  if (typeof reviewed.by !== 'string' || reviewed.by.trim() === '') {
    return 'reviewed.by(확인한 사람)가 없어요';
  }
  if (typeof reviewed.date !== 'string' || !DATE.test(reviewed.date)) {
    return 'reviewed.date가 YYYY-MM-DD 모양의 날짜가 아니에요';
  }
  if (typeof reviewed.result !== 'string' || !reviewed.result.trim().startsWith('통과')) {
    return 'reviewed.result가 "통과"로 시작하지 않아요';
  }
  return null;
}

/**
 * 그림 목록을 읽고 칸 규칙을 검사한다(원본 없이 할 수 있는 검사만).
 * @param {string} text
 * @param {string} filePath 저장소 뿌리 기준 경로
 * @returns {{ manifest: ImageManifest | null, errors: string[] }}
 */
export function parseImageManifest(text, filePath) {
  const posix = toPosixPath(filePath);
  /** @type {string[]} */
  const errors = [];
  const { slug, parent } = manifestNames(posix);
  if (!isManifestPath(posix) || !SLUG.test(slug)) {
    return { manifest: null, errors: [`파일 위치·이름: content/lessons/<단원 폴더>/<차시 파일 이름>${MANIFEST_SUFFIX}로 두어요(영문 소문자·숫자·하이픈).`] };
  }
  const document = parseDocument(text, { uniqueKeys: true });
  if (document.errors.length > 0) {
    return { manifest: null, errors: document.errors.map((error) => `YAML 문법 오류: ${error.message.split('\n')[0]}`) };
  }
  const data = document.toJS() ?? {};
  if (!isPlainObject(data)) {
    return { manifest: null, errors: ['맨 위는 "이름: 값" 모양이어야 해요.'] };
  }
  for (const key of Object.keys(data)) {
    if (!MANIFEST_KEYS.has(key)) {
      errors.push(`맨 위의 모르는 이름 "${key}" — folder, images만 써요.`);
    }
  }
  let folder = slug;
  if (data.folder !== undefined) {
    const allowed = [slug, `${parent}-${slug}`];
    if (typeof data.folder !== 'string' || !allowed.includes(data.folder)) {
      errors.push(`folder는 적지 않거나(기본 ${slug}) "${parent}-${slug}"로 적어요. 다른 차시와 결과 폴더가 겹치지 않게 하려는 약속이에요.`);
    } else {
      folder = data.folder;
    }
  }
  if (!Array.isArray(data.images)) {
    errors.push('images: 목록이 있어야 해요(그림이 아직 없으면 images: []).');
    return { manifest: { path: posix, slug, folder, images: [] }, errors };
  }
  /** @type {ImageEntry[]} */
  const images = [];
  const names = new Set();
  data.images.forEach((raw, index) => {
    const entry = buildEntry(raw, index, errors);
    if (!entry) return;
    if (names.has(entry.name)) {
      errors.push(`images의 ${index + 1}번째 항목: name "${entry.name}"이(가) 앞 항목과 같아요.`);
      return;
    }
    names.add(entry.name);
    images.push(entry);
  });
  return { manifest: { path: posix, slug, folder, images }, errors };
}

/**
 * 목록 항목 하나를 검사해 ImageEntry로 만든다.
 *
 * 사람이 적는 칸: name, use, alt(또는 decorative: true), from(원본 자리) 또는 origin(원본에서 꺼내지 않은 그림 + file),
 *   선택 max_width·quality·lossless·third_party·privacy_override·note
 * 도구가 적는 칸: file, width, height, bytes, sha256, checks — 손으로 고치지 않는다
 * 사람이 그림을 열어 보고 적는 칸: reviewed { by, date, result }
 * @param {unknown} raw
 * @param {number} index
 * @param {string[]} errors
 * @returns {ImageEntry | null}
 */
function buildEntry(raw, index, errors) {
  const where = `images의 ${index + 1}번째 항목`;
  if (!isPlainObject(raw)) {
    errors.push(`${where}: "이름: 값" 모양으로 적어요.`);
    return null;
  }
  const before = errors.length;
  for (const key of Object.keys(raw)) {
    if (!ENTRY_KEYS.has(key)) {
      errors.push(`${where}: 모르는 칸 "${key}".`);
    }
  }
  const name = raw.name;
  if (typeof name !== 'string' || !SLUG.test(name)) {
    errors.push(`${where}: name은 영문 소문자·숫자·하이픈으로 적어요(파일 이름이 돼요).`);
  }
  const label = typeof name === 'string' ? `${where}(${name})` : where;
  if (typeof raw.use !== 'string' || raw.use.trim() === '') {
    errors.push(`${label}: use(어느 차시 어느 칸에 쓰는지)를 적어요.`);
  }
  const decorative = raw.decorative === true;
  if (raw.decorative !== undefined && typeof raw.decorative !== 'boolean') {
    errors.push(`${label}: decorative는 true 또는 false예요.`);
  }
  const alt = typeof raw.alt === 'string' ? raw.alt.trim() : '';
  if (decorative && alt !== '') {
    errors.push(`${label}: 장식 그림(decorative: true)은 alt를 비워요(화면 읽기 프로그램이 건너뛰게).`);
  } else if (!decorative && [...alt].length < 8) {
    errors.push(`${label}: alt(그림을 볼 수 없는 사람을 위한 설명)를 한 문장으로 적어요. 장식 그림이면 decorative: true.`);
  }
  if ((raw.from === undefined) === (raw.origin === undefined)) {
    errors.push(`${label}: from(원본에서 꺼낼 자리)과 origin(원본에서 꺼내지 않은 그림의 출처) 가운데 하나만 적어요.`);
  }
  /** @type {ImageFrom | undefined} */
  let from;
  if (raw.from !== undefined) {
    from = buildFrom(raw.from, label, errors);
  }
  if (raw.origin !== undefined && (typeof raw.origin !== 'string' || raw.origin.trim() === '')) {
    errors.push(`${label}: origin에는 그림이 어디서 왔는지 적어요(예: 사이트 ESP32 실습실 화면 찍기).`);
  }
  if (raw.origin !== undefined && typeof raw.file !== 'string') {
    errors.push(`${label}: origin 그림은 file(저장소 경로)을 직접 적어요.`);
  } else if (raw.origin !== undefined && !['.webp', '.png', '.jpg', '.jpeg', '.gif'].includes(path.posix.extname(raw.file).toLowerCase())) {
    errors.push(`${label}: 목록에는 래스터 그림(webp·png·jpg·gif)만 적어요. 사이트가 그린 SVG는 적지 않아요(sources.yaml "사이트가 직접 그린 그림" 항목이 맡아요).`);
  }
  const maxWidth = raw.max_width ?? DEFAULTS.maxWidth;
  if (!Number.isInteger(maxWidth) || maxWidth < 160 || maxWidth > 2400) {
    errors.push(`${label}: max_width는 160~2400 사이 정수예요.`);
  }
  const quality = raw.quality ?? DEFAULTS.quality;
  if (!Number.isInteger(quality) || quality < 40 || quality > 100) {
    errors.push(`${label}: quality는 40~100 사이 정수예요.`);
  }
  if (raw.lossless !== undefined && typeof raw.lossless !== 'boolean') {
    errors.push(`${label}: lossless는 true 또는 false예요.`);
  }
  if (raw.third_party !== undefined && (typeof raw.third_party !== 'string' || !SLUG.test(raw.third_party))) {
    errors.push(`${label}: third_party는 sources.yaml 제3자 항목의 폴더 키(영문 소문자·숫자·하이픈)예요.`);
  } else if (raw.third_party === 'publisher') {
    errors.push(
      `${label}: 출판 편집 삽화·컷은 운영자 결정 O10(2026-09-25, 할 일 13번 답)으로 운영자 자료예요. third_party: publisher를 빼고 차시 그림 폴더에 바로 둬요.`,
    );
  }
  if (raw.privacy_override !== undefined && (typeof raw.privacy_override !== 'string' || [...raw.privacy_override.trim()].length < 10)) {
    errors.push(`${label}: privacy_override에는 제외 쪽에서 무엇을 잘라 냈는지 한 문장으로 적어요.`);
  }
  if (raw.file !== undefined && (typeof raw.file !== 'string' || !toPosixPath(raw.file).startsWith(`${LESSON_IMAGE_ROOT}/`))) {
    errors.push(`${label}: file은 ${LESSON_IMAGE_ROOT}/ 아래 경로예요(도구가 적어요).`);
  }
  if (raw.sha256 !== undefined && (typeof raw.sha256 !== 'string' || !SHA256.test(raw.sha256))) {
    errors.push(`${label}: sha256은 도구가 적는 64자리 16진수예요.`);
  }
  if (raw.reviewed !== undefined) {
    const problem = reviewedProblem(raw.reviewed);
    if (problem) {
      errors.push(`${label}: ${problem}.`);
    }
  }
  if (errors.length > before) {
    return null;
  }
  return {
    index,
    name,
    use: raw.use.trim(),
    alt,
    decorative,
    from,
    origin: typeof raw.origin === 'string' ? raw.origin.trim() : undefined,
    maxWidth,
    quality,
    lossless: raw.lossless === true,
    thirdParty: raw.third_party,
    privacyOverride: typeof raw.privacy_override === 'string' ? raw.privacy_override.trim() : undefined,
    file: typeof raw.file === 'string' ? toPosixPath(raw.file) : undefined,
    sha256: raw.sha256,
    checks: raw.checks,
    reviewed: isPlainObject(raw.reviewed) ? /** @type {any} */ (raw.reviewed) : undefined,
  };
}

/**
 * @param {unknown} raw
 * @param {string} label
 * @param {string[]} errors
 * @returns {ImageFrom | undefined}
 */
function buildFrom(raw, label, errors) {
  if (!isPlainObject(raw)) {
    errors.push(`${label}: from은 "source: U1, page: 14, region: [...]" 모양으로 적어요.`);
    return undefined;
  }
  for (const key of Object.keys(raw)) {
    if (!FROM_KEYS.has(key)) {
      errors.push(`${label}: from의 모르는 칸 "${key}".`);
    }
  }
  const source = raw.source;
  if (typeof source !== 'string' || !(source in SOURCES)) {
    errors.push(`${label}: from.source는 ${Object.keys(SOURCES).join(' ')} 가운데 하나예요(docs/INVENTORY.md 표기 약속).`);
    return undefined;
  }
  const info = SOURCES[source];
  const location = locatePage(source, raw.page);
  if (!location) {
    errors.push(
      `${label}: from.page ${raw.page}쪽을 ${info.label}에서 찾지 못했어요` +
        (info.layout === 'spread' ? '(교과서는 인쇄 쪽 번호로 적어요).' : info.layout === 'page' ? '(PDF 쪽 번호로 적어요).' : '(슬라이드 번호로 적어요).'),
    );
  }
  const ways = ['region', 'image', 'picture'].filter((key) => raw[key] !== undefined);
  if (info.kind === 'pptx') {
    if (ways.length !== 1 || ways[0] !== 'picture' || !Number.isInteger(raw.picture) || raw.picture < 1) {
      errors.push(`${label}: PPT는 from.picture(슬라이드 안 그림 순번, 1부터)로만 꺼내요.`);
    }
  } else if (ways.length !== 1 || ways[0] === 'picture') {
    errors.push(`${label}: from에는 region(쪽 좌표 영역) 또는 image(PDF 그림 번호) 가운데 하나를 적어요.`);
  } else if (ways[0] === 'region') {
    if (!isBox(raw.region)) {
      errors.push(`${label}: from.region은 [x0, y0, x1, y1](왼쪽 위 기준 pt, x0 < x1, y0 < y1)이에요.`);
    } else if (location && (raw.region[2] > location.size[0] + 0.5 || raw.region[3] > location.size[1] + 0.5)) {
      errors.push(`${label}: from.region이 쪽 크기(${location.size[0]}×${location.size[1]}pt) 밖으로 나가요.`);
    }
  } else if (!Number.isInteger(raw.image) || raw.image < 1) {
    errors.push(`${label}: from.image는 PDF 그림 번호(자연수)예요. npm run images:show -- ${source} ${raw.page ?? '<쪽>'}로 번호를 봐요.`);
  }
  if (raw.crop !== undefined && !isBox(raw.crop)) {
    errors.push(`${label}: from.crop은 [x0, y0, x1, y1](꺼낸 그림의 픽셀 좌표)이에요.`);
  }
  const dpi = raw.dpi ?? DEFAULTS.dpi;
  if (!Number.isInteger(dpi) || dpi < 72 || dpi > 600) {
    errors.push(`${label}: from.dpi는 72~600 사이 정수예요.`);
  }
  return {
    source,
    page: raw.page,
    region: isBox(raw.region) ? [...raw.region] : undefined,
    image: Number.isInteger(raw.image) ? raw.image : undefined,
    picture: Number.isInteger(raw.picture) ? raw.picture : undefined,
    crop: isBox(raw.crop) ? [...raw.crop] : undefined,
    dpi,
  };
}

/**
 * 원본에서 꺼낸 그림이 놓일 저장소 경로.
 * @param {string} folder
 * @param {{ name: string, thirdParty?: string }} entry
 */
export function outputPathFor(folder, entry) {
  const thirdParty = entry.thirdParty ? `third-party/${entry.thirdParty}/` : '';
  return `${LESSON_IMAGE_ROOT}/${folder}/${thirdParty}${entry.name}.webp`;
}

/**
 * 제외 쪽 규칙을 목록 항목에 비춘다(원본 없이). 문제가 있으면 한국어 설명, 없으면 null.
 * @param {ImageEntry} entry
 * @param {ExclusionRule[]} rules
 * @returns {{ problem: string | null, exclusion: PageExclusion | null }}
 */
export function checkExclusionPolicy(entry, rules) {
  if (!entry.from) {
    return { problem: null, exclusion: null };
  }
  const exclusion = exclusionFor(rules, entry.from.source, entry.from.page);
  if (!exclusion) {
    return { problem: null, exclusion: null };
  }
  const where = `${entry.from.source} ${entry.from.page}쪽`;
  if (exclusion.override === 'never') {
    return { problem: `${where}은(는) 꺼내지 않는 쪽이에요 — ${exclusion.reasons.join(' / ')}`, exclusion };
  }
  if (!entry.from.region) {
    return {
      problem: `${where}은(는) 제외 쪽이라 얼굴·경로·주소가 없는 부분만 region(쪽 좌표)으로 꺼낼 수 있어요. 그림 번호(image)로는 쪽에서 가려진 부분까지 나와서 안 돼요. — ${exclusion.reasons.join(' / ')}`,
      exclusion,
    };
  }
  if (!entry.privacyOverride) {
    return {
      problem: `${where}은(는) 제외 쪽이에요. 그 부분을 뺀 영역만 꺼낸다면 privacy_override에 무엇을 잘라 냈는지 적어요. — ${exclusion.reasons.join(' / ')}`,
      exclusion,
    };
  }
  return { problem: null, exclusion };
}

/**
 * 제3자 권리 그림의 경로가 sources.yaml third_party 항목에 이어지는지 본다.
 * @param {string} outputPath
 * @param {import('./sources-registry.mjs').SourceEntry[]} entries
 * @returns {string | null}
 */
export function checkSourcesLink(outputPath, entries) {
  const matches = findMatchingEntries(outputPath, entries);
  const isThirdPartyPath = outputPath.split('/').includes('third-party');
  if (matches.length === 0) {
    if (!isThirdPartyPath) {
      return `${outputPath}을(를) 덮는 sources.yaml 항목이 없어요.`;
    }
    const key = outputPath.split('/').at(-2);
    return (
      `${outputPath}을(를) 덮는 sources.yaml 제3자 항목이 없어요. 그 권리자가 처음이면 sources.yaml에 이렇게 한 항목을 더해요:\n` +
      thirdPartyEntryTemplate(key ?? '<키>')
    );
  }
  const wrong = matches.filter(({ entry }) => (isThirdPartyPath ? entry.category !== 'third_party' : entry.category !== 'operator'));
  if (wrong.length > 0) {
    const expected = isThirdPartyPath ? 'third_party' : 'operator(원고 그림)';
    return `${outputPath}이(가) ${wrong.map(({ entry }) => `"${entry.name}"(${entry.category})`).join(', ')} 항목에 걸려요. ${expected} 항목이어야 해요 — 다른 폴더에 두거나 sources.yaml을 고쳐요.`;
  }
  return null;
}

/**
 * @param {string} key
 * @returns {string}
 */
export function thirdPartyEntryTemplate(key) {
  return [
    `  - name: <자료 이름 — 예: 교과서 원고 155쪽 알람 시계 사진>`,
    `    category: third_party`,
    `    author: <원 제작자 — 도구가 알려 준 제작자(creator)>`,
    `    license: 원 권리자 보유 — 운영자 사용 허락(O4), 사이트 CC BY-NC-SA 4.0 적용 제외`,
    `    used_in: "<쓰는 차시와 그림>"`,
    `    rights: "<도구가 알려 준 권리 문구(rights) 원문>"`,
    `    paths:`,
    `      - public/images/lessons/*/third-party/${key}/**`,
    `    fetched: <오늘 날짜 YYYY-MM-DD>`,
  ].join('\n');
}

/**
 * 원본 그림의 제작자 칸이 운영자 자신(원고·교안 저자)이면 제3자가 아니다. 교안 PDF의 작성자 칸이 로마자로 적혀 있다(INVENTORY §2).
 * 비교는 소문자·공백 무시.
 */
export const OPERATOR_CREATORS = Object.freeze(['박상진', '김석전', 'seok jeon kim']);

/**
 * @param {Record<string, string>} info
 */
function isOperatorCreator(info) {
  const creator = (info.creator ?? '').toLowerCase().replace(/\s+/gu, '');
  const rights = (info.rights ?? '').toLowerCase().replace(/\s+/gu, '');
  const names = OPERATOR_CREATORS.map((name) => name.toLowerCase().replace(/\s+/gu, ''));
  return creator !== '' && names.includes(creator) && (rights === '' || names.includes(rights));
}

/**
 * 원본 그림의 권리 표기(도구가 알려 준 rights 목록)로 그 그림을 쓸 수 있는지, third_party가 필요한지 본다.
 * - 출판 편집 삽화·컷(이름표 "…(삽)"·"…(컷)") → 운영자 자료(결정 O10, 2026-09-25 — 운영자 할 일 13번 답 "다 넣어도 됨").
 *   third_party 없이 차시 그림 폴더에 두고, 도구는 checks.rights에 "출판 편집 삽화"를 기록으로만 남긴다.
 * - 출판사가 아닌 제3자(스톡 작가·판매 사이트) 표기 → 쓰지 않는다(결정 C11, docs/DECISIONS.md). 스톡 사용권은 출판사가 교과서용으로
 *   산 것이라 웹사이트로 넘어오지 않는다. C11이 거둬지면(운영자가 웹 사용 라이선스를 알려 주면) 이 규칙을 되돌린다.
 * - 제작자가 운영자 자신이면 제3자가 아니다.
 * @param {{ info: Record<string, string>, publisher: boolean, id: string }[]} hits
 * @param {string | undefined} _thirdParty 목록의 third_party(지금은 판정에 쓰지 않는다 — 출판 편집 삽화도 운영자 자료, O10)
 * @returns {string | null}
 */
export function rightsProblem(hits, _thirdParty) {
  // 출판 편집 삽화·컷은 O10으로 운영자 자료다 — 제3자로 세지 않는다. 남는 것은 스톡(출판사가 아닌 권리자) 표기뿐이다.
  const stock = hits.filter((hit) => !hit.publisher && !isOperatorCreator(hit.info));
  if (stock.length === 0) {
    return null;
  }
  const describe = stock.map((hit) => `제작자 ${hit.info.creator ?? '(없음)'}, 권리 문구 ${hit.info.rights ?? '(없음)'}`).join(' / ');
  return (
    `원본 그림에 출판사가 아닌 권리자의 표기가 있어요(${describe}). 결정 C11(docs/DECISIONS.md) — 스톡 그림은 사이트에 쓰지 않아요. ` +
    '사이트가 그린 SVG로 바꾸거나 빼요(스톡 그림이 영역 가장자리에 조금 걸린 것이면 region을 좁혀요).'
  );
}

// ─────────────────────────────── 그림 파일의 메타데이터 ───────────────────────────────

/**
 * 그림 파일 안에 메타데이터(EXIF·XMP·ICC·글 조각·주석)가 남았는지 본다. 형식은 파일 머리로 알아낸다.
 * @param {Buffer} buffer
 * @returns {{ format: string, width: number | null, height: number | null, problems: string[] }}
 */
export function inspectImageMetadata(buffer) {
  if (buffer.length >= 12 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') {
    return inspectWebP(buffer);
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return inspectPng(buffer);
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return inspectJpeg(buffer);
  }
  if (buffer.length >= 6 && /^GIF8[79]a$/u.test(buffer.toString('latin1', 0, 6))) {
    return inspectGif(buffer);
  }
  return { format: 'unknown', width: null, height: null, problems: [] };
}

/** @param {Buffer} buffer */
function inspectWebP(buffer) {
  /** @type {string[]} */
  const problems = [];
  let width = null;
  let height = null;
  const allowed = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF']);
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const type = buffer.toString('latin1', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (type === 'EXIF' || type === 'XMP ' || type === 'ICCP') {
      problems.push(`WebP ${type.trim()} 조각`);
    } else if (!allowed.has(type)) {
      problems.push(`WebP의 알 수 없는 조각 "${type}"`);
    }
    if (type === 'VP8X' && size >= 10) {
      const flags = buffer[body];
      if (flags & 0x20) problems.push('WebP VP8X에 ICC 표시');
      if (flags & 0x08) problems.push('WebP VP8X에 EXIF 표시');
      if (flags & 0x04) problems.push('WebP VP8X에 XMP 표시');
      width = 1 + buffer.readUIntLE(body + 4, 3);
      height = 1 + buffer.readUIntLE(body + 7, 3);
    } else if (type === 'VP8 ' && size >= 10 && width === null) {
      width = buffer.readUInt16LE(body + 6) & 0x3fff;
      height = buffer.readUInt16LE(body + 8) & 0x3fff;
    } else if (type === 'VP8L' && size >= 5 && width === null) {
      const bits = buffer.readUInt32LE(body + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    }
    offset = body + size + (size % 2);
  }
  return { format: 'webp', width, height, problems: [...new Set(problems)] };
}

/** @param {Buffer} buffer */
function inspectPng(buffer) {
  /** @type {string[]} */
  const problems = [];
  let width = null;
  let height = null;
  const metadata = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'iCCP', 'tIME']);
  for (let offset = 8; offset + 12 <= buffer.length; ) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(offset + 8);
      height = buffer.readUInt32BE(offset + 12);
    }
    if (metadata.has(type)) {
      problems.push(`PNG ${type} 조각`);
    }
    if (type === 'IEND') break;
    offset += 12 + size;
  }
  return { format: 'png', width, height, problems: [...new Set(problems)] };
}

/** @param {Buffer} buffer */
function inspectJpeg(buffer) {
  /** @type {string[]} */
  const problems = [];
  let width = null;
  let height = null;
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // 영상 자료 시작·끝
    const size = buffer.readUInt16BE(offset + 2);
    if (marker === 0xe1) problems.push('JPEG APP1(EXIF·XMP)');
    else if (marker === 0xe2) problems.push('JPEG APP2(ICC)');
    else if (marker === 0xed) problems.push('JPEG APP13(IPTC)');
    else if (marker === 0xfe) problems.push('JPEG 주석(COM)');
    else if (marker >= 0xe3 && marker <= 0xef && marker !== 0xee) problems.push(`JPEG APP${marker - 0xe0}`);
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      height = buffer.readUInt16BE(offset + 5);
      width = buffer.readUInt16BE(offset + 7);
    }
    offset += 2 + size;
  }
  return { format: 'jpeg', width, height, problems: [...new Set(problems)] };
}

/** @param {Buffer} buffer */
function inspectGif(buffer) {
  /** @type {string[]} */
  const problems = [];
  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);
  let offset = 13;
  if (buffer[10] & 0x80) offset += 3 * (1 << ((buffer[10] & 0x07) + 1));
  const skipBlocks = () => {
    while (offset < buffer.length && buffer[offset] !== 0) offset += buffer[offset] + 1;
    offset += 1;
  };
  while (offset < buffer.length) {
    const introducer = buffer[offset];
    if (introducer === 0x3b) break;
    if (introducer === 0x21) {
      const label = buffer[offset + 1];
      offset += 2;
      if (label === 0xfe) problems.push('GIF 주석');
      if (label === 0xff && buffer.toString('latin1', offset + 1, offset + 12) === 'XMP DataXMP') problems.push('GIF XMP');
      skipBlocks();
    } else if (introducer === 0x2c) {
      const packed = buffer[offset + 9];
      offset += 10;
      if (packed & 0x80) offset += 3 * (1 << ((packed & 0x07) + 1));
      offset += 1; // LZW 최소 부호 길이
      skipBlocks();
    } else {
      break;
    }
  }
  return { format: 'gif', width, height, problems: [...new Set(problems)] };
}

/**
 * 메타데이터를 확인할 수 없는 형식(카메라·편집기 형식은 EXIF가 들어 있기 쉽다).
 * @param {string} extension 점 포함 소문자
 */
export function isUncheckableRaster(extension) {
  return ['.avif', '.tif', '.tiff', '.heic', '.heif'].includes(extension);
}

/** @param {Buffer | string} data */
export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

// ─────────────────────────────── 기록 모으기(저장소 검사·테스트) ───────────────────────────────

/**
 * @typedef {object} ImageRecord
 * @property {string} path 그림의 저장소 경로
 * @property {unknown} reviewed
 * @property {string | undefined} sha256 기록된 sha256(차시 목록은 도구가 적는다. 옛 공용 기록에는 없을 수 있다)
 * @property {string} recordFile 기록이 적힌 파일
 */

/**
 * 파일 목록(경로 + 내용)에서 눈 확인 기록을 모은다. 옛 공용 기록(scripts/image-allowlist.yaml)과
 * 차시 목록(content/lessons/**\/*.images.yaml)을 함께 읽는다. 같은 그림의 기록이 두 곳에 있으면 오류다.
 * @param {{ path: string, content: Buffer | string | null }[]} files
 * @returns {{ records: Map<string, ImageRecord>, errors: { file: string, message: string }[] }}
 */
export function collectImageRecords(files) {
  /** @type {Map<string, ImageRecord>} */
  const records = new Map();
  /** @type {{ file: string, message: string }[]} */
  const errors = [];
  /**
   * @param {string} imagePath
   * @param {ImageRecord} record
   */
  const add = (imagePath, record) => {
    const key = imagePath.normalize('NFC');
    const existing = records.get(key);
    if (existing) {
      errors.push({ file: record.recordFile, message: `${key}의 눈 확인 기록이 ${existing.recordFile}에도 있어요. 기록은 한 곳에만 둬요.` });
      return;
    }
    records.set(key, record);
  };
  for (const file of files) {
    const filePath = toPosixPath(file.path).normalize('NFC');
    const isLegacy = filePath === LEGACY_IMAGE_ALLOWLIST;
    if (!isLegacy && !isManifestPath(filePath)) {
      continue;
    }
    if (file.content === null) {
      continue;
    }
    const text = typeof file.content === 'string' ? file.content : file.content.toString('utf8');
    const document = parseDocument(text, { uniqueKeys: true });
    if (document.errors.length > 0) {
      errors.push({ file: filePath, message: `YAML 문법 오류: ${document.errors[0].message.split('\n')[0]}` });
      continue;
    }
    const data = document.toJS();
    const images = isPlainObject(data) ? data.images : undefined;
    if (images === undefined || images === null) {
      continue;
    }
    if (!Array.isArray(images)) {
      errors.push({ file: filePath, message: 'images는 목록으로 적어요.' });
      continue;
    }
    images.forEach((item, index) => {
      const imagePath = isPlainObject(item) ? (isLegacy ? item.path : item.file) : undefined;
      if (isLegacy && (typeof imagePath !== 'string' || imagePath.trim() === '' || /[*?]/u.test(imagePath))) {
        errors.push({ file: filePath, message: `images의 ${index + 1}번째 항목: path에 이미지 하나의 정확한 경로를 적어요(패턴 없이, 한 장씩 확인).` });
        return;
      }
      if (typeof imagePath !== 'string') {
        return; // 차시 목록에서 아직 꺼내지 않은 항목(file 없음)
      }
      if (!isLegacy && !toPosixPath(imagePath).startsWith(`${LESSON_IMAGE_ROOT}/`)) {
        errors.push({ file: filePath, message: `images의 ${index + 1}번째 항목: 차시 그림 목록의 file은 ${LESSON_IMAGE_ROOT}/ 아래 그림만 적어요(다른 그림은 ${LEGACY_IMAGE_ALLOWLIST}).` });
        return;
      }
      add(toPosixPath(imagePath), {
        path: toPosixPath(imagePath),
        reviewed: /** @type {Record<string, unknown>} */ (item).reviewed,
        sha256: typeof item.sha256 === 'string' ? item.sha256 : undefined,
        recordFile: filePath,
      });
    });
  }
  return { records, errors };
}

/**
 * 디스크의 기록 파일을 모두 읽는다(테스트·도구용. 저장소 검사는 git 인덱스를 읽는다).
 * @param {string} rootDir
 */
export function readImageRecords(rootDir) {
  const files = [LEGACY_IMAGE_ALLOWLIST, ...listManifestFiles(rootDir)]
    .filter((relative) => fs.existsSync(path.join(rootDir, relative)))
    .map((relative) => ({ path: relative, content: fs.readFileSync(path.join(rootDir, relative)) }));
  return collectImageRecords(files);
}

/**
 * content/lessons 아래의 그림 목록 파일(저장소 뿌리 기준 경로, 정렬).
 * @param {string} rootDir
 * @returns {string[]}
 */
export function listManifestFiles(rootDir) {
  /** @type {string[]} */
  const found = [];
  const walk = (/** @type {string} */ relative) => {
    const absolute = path.join(rootDir, relative);
    if (!fs.existsSync(absolute)) return;
    for (const dirent of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = `${relative}/${dirent.name}`;
      if (dirent.isDirectory()) walk(child);
      else if (dirent.name.endsWith(MANIFEST_SUFFIX)) found.push(child);
    }
  };
  walk(LESSONS_DIR);
  return found.sort();
}

/**
 * 폴더 아래 래스터 그림 파일(저장소 뿌리 기준 경로).
 * @param {string} rootDir
 * @param {string} relative
 * @returns {string[]}
 */
function listRasterFiles(rootDir, relative) {
  /** @type {string[]} */
  const found = [];
  const walk = (/** @type {string} */ current) => {
    const absolute = path.join(rootDir, current);
    if (!fs.existsSync(absolute)) return;
    for (const dirent of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = `${current}/${dirent.name}`;
      if (dirent.isDirectory()) walk(child);
      else if (RASTER_EXTENSIONS.includes(path.posix.extname(dirent.name).toLowerCase())) found.push(child);
    }
  };
  walk(relative);
  return found.sort();
}

/**
 * 저장소 전체의 차시 그림 목록을 원본 없이 검사한다(npm test와 images:check).
 * - 오류: 칸 규칙, 결과 폴더 겹침, 제외 쪽 규칙, sources.yaml 연결, 기록과 다른 그림(sha256), 메타데이터가 남은 그림,
 *   목록에 없는 그림(폴더 안 남은 파일), file 칸과 지금 설정이 다른 항목(다시 꺼내야 함)
 * - 참고(경고): 아직 꺼내지 않은 항목, 눈 확인 기록이 아직 없는 그림 — 작업 중인 다른 구역의 테스트를 막지 않으려고 오류로 두지 않는다.
 *   눈 확인 기록 없는 그림의 커밋은 저장소 검사(커밋 전 훅·CI)가 막는다.
 * @param {{ rootDir: string, registryEntries: import('./sources-registry.mjs').SourceEntry[], exclusionRules: ExclusionRule[] }} options
 * @returns {{ errors: string[], warnings: string[], manifests: ImageManifest[] }}
 */
export function validateLessonImages({ rootDir, registryEntries, exclusionRules }) {
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {ImageManifest[]} */
  const manifests = [];
  /** @type {Map<string, string>} */
  const folderOwners = new Map();
  for (const manifestFile of listManifestFiles(rootDir)) {
    const { manifest, errors: manifestErrors } = parseImageManifest(fs.readFileSync(path.join(rootDir, manifestFile), 'utf8'), manifestFile);
    errors.push(...manifestErrors.map((message) => `${manifestFile}: ${message}`));
    if (!manifest) continue;
    manifests.push(manifest);
    const owner = folderOwners.get(manifest.folder);
    if (owner) {
      errors.push(`${manifestFile}: 결과 폴더 ${LESSON_IMAGE_ROOT}/${manifest.folder}/를 ${owner}도 써요. 한 폴더는 한 차시만 써요(folder: <단원 폴더>-<차시>).`);
    }
    folderOwners.set(manifest.folder, manifestFile);
    /** @type {Set<string>} */
    const listed = new Set();
    for (const entry of manifest.images) {
      const label = `${manifestFile}(${entry.name})`;
      const expected = entry.from ? outputPathFor(manifest.folder, entry) : entry.file;
      if (entry.from) {
        const { problem } = checkExclusionPolicy(entry, exclusionRules);
        if (problem) errors.push(`${label}: ${problem}`);
      } else if (entry.file) {
        const folderRoot = `${LESSON_IMAGE_ROOT}/${manifest.folder}/`;
        const thirdRoot = entry.thirdParty ? `${folderRoot}third-party/${entry.thirdParty}/` : folderRoot;
        if (!entry.file.startsWith(thirdRoot) || (!entry.thirdParty && entry.file.split('/').includes('third-party'))) {
          errors.push(`${label}: origin 그림의 file은 ${thirdRoot} 안에 둬요.`);
        }
      }
      if (expected) {
        listed.add(expected);
        const linkProblem = checkSourcesLink(expected, registryEntries);
        if (linkProblem) errors.push(`${label}: ${linkProblem}`);
      }
      if (!entry.file) {
        warnings.push(`${label}: 아직 꺼내지 않았어요(npm run images:extract -- ${manifest.slug}).`);
        continue;
      }
      if (entry.from && entry.file !== expected) {
        errors.push(`${label}: file(${entry.file})이 지금 설정의 결과 경로(${expected})와 달라요. npm run images:extract -- ${manifest.slug}로 다시 꺼내요.`);
        continue;
      }
      const absolute = path.join(rootDir, entry.file);
      if (!fs.existsSync(absolute)) {
        errors.push(`${label}: ${entry.file} 파일이 없어요. 다시 꺼내거나 목록에서 file 칸을 지워요.`);
        continue;
      }
      const content = fs.readFileSync(absolute);
      if (entry.sha256 && sha256Hex(content) !== entry.sha256) {
        errors.push(`${label}: ${entry.file}이(가) 기록(sha256)과 달라요. 도구로 다시 꺼낸 뒤 눈으로 다시 확인해요.`);
      } else if (!entry.sha256) {
        errors.push(`${label}: sha256이 없어요. npm run images:extract -- ${manifest.slug}가 적어요.`);
      }
      const { problems } = inspectImageMetadata(content);
      if (problems.length > 0) {
        errors.push(`${label}: 메타데이터가 남았어요(${problems.join(', ')}). 도구로 다시 꺼내요.`);
      }
      const review = reviewedProblem(entry.reviewed);
      if (review) {
        warnings.push(`${label}: 눈 확인 기록이 아직 없어요(${review}). 그림을 열어 보고 reviewed를 적어야 커밋할 수 있어요.`);
      }
    }
    for (const file of listRasterFiles(rootDir, `${LESSON_IMAGE_ROOT}/${manifest.folder}`)) {
      if (!listed.has(file)) {
        errors.push(`${manifestFile}: ${file}이(가) 목록에 없어요. 쓰지 않는 그림이면 지우고, 쓰는 그림이면 목록에 적어요.`);
      }
    }
  }
  return { errors, warnings, manifests };
}
