// 저장소 검사 본체(PLAN §8.0 PD-32, §9.3, PD-37).
// scripts/check-repo.mjs(커밋 전 훅·CI)와 단위 테스트가 부른다.
//
// 검사 대상은 git 인덱스(스테이징된 내용 = 커밋될 내용)다. CI에서는 내려받은 커밋과 같다.
// 1) 올리면 안 되는 파일: docs/SPEC.md(학교명, PD-37), 원본 자료 폴더 안 파일(C6)
// 2) 원본 형식: .pdf .pptx .hwp .hwpx .zip .pyc, __pycache__ (scripts/repo-allowlist.yaml의 original_formats 제외)
// 3) 5MB 넘는 파일(large_files 허용 목록 제외, 허용해도 max_mb를 넘으면 실패)
// 4) public/ examples/ content/ src/ 안의 원본 파일 이름(원본 zip·PDF·폴더 이름)
// 5) 모든 추적 텍스트 파일(UTF-16으로 저장된 파일 포함)의 개인정보 형태: 사용자 폴더 경로, OneDrive 경로,
//    MAC 주소(자리표시자 제외), 이메일 주소(noreply·example 계열 제외), 전화번호 모양,
//    그리고 scripts/privacy-needles.json에 해시로만 적어 둔 비공개 이름(학교명 등, PD-37).
//    예외는 하나뿐이다: public/licenses/ 아래의 제3자 라이선스 고지 원문(저작권 표기에 저작자가 스스로 적은 주소가 들어 있음)은
//    scripts/repo-allowlist.yaml의 privacy_exceptions에 경로·이유를 적으면 이메일 모양 검사만 건너뛴다(2026-09-16 P2-02, CodeMirror MIT 고지).
// 6) 추적 파일 어디에 있든 래스터 이미지의 눈 확인 기록(reviewed). 기록은 두 곳에서 모은다(P5-01, 2026-09-25):
//    차시마다 따로인 그림 목록 content/lessons/**/*.images.yaml(원고 이미지 추출 도구가 file·sha256을 적는다)과
//    옛 공용 기록 scripts/image-allowlist.yaml(차시 밖 그림). 둘 다 git 인덱스(커밋될 내용)에서 읽으므로 기록을 스테이징하지
//    않으면 통과하지 못한다. 기록에 sha256이 있으면 그림 내용과 같아야 한다(눈으로 본 뒤 그림이 바뀌면 다시 봐야 한다).
//    글·코드 파일(SVG·마크다운·Astro·CSS 등) 안에 data: 주소로 넣은 래스터 그림도 그 파일의 기록이 있어야 한다.
// 7) 래스터 이미지 안의 메타데이터(PLAN §9.3 4번): WebP의 EXIF·XMP·ICC 조각, PNG의 eXIf·tEXt·iTXt·zTXt·iCCP·tIME,
//    JPEG의 APP1(EXIF·XMP)·APP2(ICC)·APP13(IPTC)·주석, GIF의 주석·XMP. 확인할 수 없는 형식(avif·tif·heic)도 막는다.
// 8) 가린 편집본 PDF(public/teacher/handouts/*.pdf, PD-31·P5-14)의 쪽별 눈 확인 기록: scripts/handout-redactions.yaml(git 인덱스)의
//    documents.*.output.path가 그 파일이고, output.sha256이 파일과 같고, review에 1쪽부터 source.pages쪽까지 모두
//    by·date·result("통과"로 시작)가 있어야 한다(Phase 5 통합 2026-09-25 — 편집본을 다시 만들고 기록을 고치지 않으면 막는다).
//    이 규칙은 Node만으로 돌아 CI에서도 돈다(CI에는 PyMuPDF가 없어 python scripts/redact-handouts.py check는 못 돈다).
//
// 이 파일의 주석에는 검사에 걸리는 실제 모양(경로·주소·이름)을 적지 않는다. 이 파일도 검사 대상이기 때문이다.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { matchesGlob, validateGlob } from './glob.mjs';
import {
  LEGACY_IMAGE_ALLOWLIST,
  MANIFEST_SUFFIX,
  collectImageRecords,
  inspectImageMetadata,
  isUncheckableRaster,
  reviewedProblem,
  sha256Hex,
} from './lesson-images.mjs';

export const REPO_ALLOWLIST_FILE = 'scripts/repo-allowlist.yaml';
/** 옛 공용 눈 확인 기록(차시 밖 그림). 원고에서 꺼낸 차시 그림의 기록은 각 차시의 그림 목록(P5-01) */
export const IMAGE_ALLOWLIST_FILE = LEGACY_IMAGE_ALLOWLIST;
export const PRIVACY_NEEDLES_FILE = 'scripts/privacy-needles.json';
/** 가린 편집본 PDF의 가릴 곳·쪽별 눈 확인 기록(P5-14)과 편집본을 두는 폴더 */
export const HANDOUT_RECORD_FILE = 'scripts/handout-redactions.yaml';
export const HANDOUT_ROOT = 'public/teacher/handouts/';
export const FORBIDDEN_TRACKED_FILES = Object.freeze(['docs/SPEC.md']);
export const ORIGINAL_FORMAT_EXTENSIONS = Object.freeze(['.pdf', '.pptx', '.hwp', '.hwpx', '.zip', '.pyc']);
/** 5MB 기준(5 × 1024 × 1024바이트) */
export const LARGE_FILE_LIMIT_BYTES = 5 * 1024 * 1024;
const DEFAULT_ALLOWED_MAX_MB = 50;
/** 원본 파일 이름을 찾는 폴더(docs/와 .gitignore는 원본 이름을 설명하므로 뺀다, PLAN §8.0) */
export const ORIGINAL_NAME_SCAN_ROOTS = Object.freeze(['public/', 'examples/', 'content/', 'src/']);

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
/**
 * 글·코드 파일 안에 data: 주소로 넣은 래스터 그림(png·jpg·webp 등, SVG는 제외).
 * SVG의 image·feImage(href·xlink:href), CSS의 url(data:…), 마크다운·HTML의 img가 모두 이 모양을 지난다(2026-09-16 검토 반영).
 */
const EMBEDDED_RASTER = /data:image\/(?!svg\+xml)/iu;
const ORIGINAL_DOCUMENT_NAME = /\.(?:pdf|pptx|zip|hwp|hwpx)$/iu;

// 개인정보 형태. 사용자 이름 칸에는 구분자·공백·따옴표·괄호 등이 오지 않는다.
const WINDOWS_USER_DIR = /(?<![A-Za-z0-9])[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)([^\\\/\s"'`<>|?*:;,()[\]{}]+)/giu;
const DRIVE_MOUNT_USER_DIR = /(?<![\w.~%:-])\/(?:mnt\/)?[A-Za-z]\/Users\/([^\\\/\s"'`<>|?*:;,()[\]{}]+)/giu;
const MAC_USER_DIR = /(?<![\w.~%:-])\/Users\/([^\\\/\s"'`<>|?*:;,()[\]{}]+)/gu;
const LINUX_HOME_DIR = /(?<![\w.~%:-])\/home\/([^\\\/\s"'`<>|?*:;,()[\]{}]+)/gu;
/** 문장 가운데 적힌 OneDrive 폴더도 잡는다(앞에 글자·숫자만 없으면 됨, 뒤에는 폴더 구분자가 온다). */
const ONEDRIVE_DIR = /(?<![A-Za-z0-9])OneDrive(?: ?- ?[^\\/\r\n]{1,80}?)?[\\/]/giu;
const MAC_ADDRESS = /(?<![0-9A-Fa-f:-])[0-9A-Fa-f]{2}([:-])[0-9A-Fa-f]{2}(?:\1[0-9A-Fa-f]{2}){4}(?![0-9A-Fa-f:-])/gu;
const ALLOWED_MAC_ADDRESSES = new Set(['00:00:00:00:00:00', 'ff:ff:ff:ff:ff:ff', '00-00-00-00-00-00', 'ff-ff-ff-ff-ff-ff']);
/*
 * 콜론·붙임표 말고 기기 주소가 적히는 다른 모양(2026-09-25 Phase 4 검토 반영 — 실물 확인 결과를 붙여 넣을 때 새는 구멍).
 * MicroPython의 wlan.config('mac')·ble.config('mac')는 bytes를 돌려주고, 학생·교사는 그 print 결과나 16진수를 그대로 옮겨 적는다.
 *  - bytes 글자 하나가 \xHH 정확히 6개로만 된 것(print 결과 모양 — b 뒤 따옴표 안에 \x와 16진수 두 자리가 여섯 번)
 *  - 점 모양(16진수 네 자리씩 셋을 점으로 이은 것)
 *  - 같은 줄 앞쪽에 주소 낱말(맥 주소·addr·bssid·주소)이 있을 때만: 구분자 없는 16진수 12자리, 두 자리씩 빈칸으로 띄운 여섯 묶음,
 *    0x로 시작하는 수 여섯 개를 담은 bytes([…]) — 이 셋은 I2C 명령·MP3 프레임 같은 흔한 6바이트와 헷갈리기 때문이다.
 * 이 설명에 예시 값을 그대로 적지 않는다(검사가 이 파일 자신을 잡는다 — 예시는 tests/unit/repo-check.test.ts에서 조각을 이어 만든다).
 */
const MAC_BYTES_ESCAPE = /\bb(['"])((?:\\x[0-9A-Fa-f]{2}){6})\1/gu;
const MAC_DOTTED = /(?<![0-9A-Fa-f.])[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}\.[0-9A-Fa-f]{4}(?![0-9A-Fa-f.])/gu;
const MAC_NEAR_WORD =
  /(?:mac|addr|bssid|주소)[^\n]{0,40}?(?:(?<![0-9A-Fa-f])([0-9A-Fa-f]{12}|[0-9A-Fa-f]{2}(?: [0-9A-Fa-f]{2}){5})(?![0-9A-Fa-f])|(\bbytes\(\s*\[\s*0x[0-9A-Fa-f]{1,2}(?:\s*,\s*0x[0-9A-Fa-f]{1,2}){5}\s*,?\s*\]\s*\)))/giu;
/**
 * 자리표시자로 보는 값: 여섯 바이트가 모두 00이거나 모두 FF, 또는 사이트가 만든 가상 기기 주소 02:00:00:00:00:xx
 * (첫 바이트 02 = "직접 정한 주소" 표시 — 실제 기기에 붙는 번호가 아니다. 가상 보드 network·bluetooth 흉내가 쓴다).
 * @param {string} text
 */
function isPlaceholderMacValue(text) {
  const digits = text.replace(/\\x|0x|[^0-9A-Fa-f]/giu, '').toLowerCase();
  return /^0+$/u.test(digits) || /^f+$/u.test(digits) || /^0200000000[0-9a-f]{2}$/u.test(digits);
}
/** 이메일 주소 모양(사용자@도메인.최상위) */
const EMAIL_ADDRESS = /(?<![A-Za-z0-9._%+-])([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})(?![A-Za-z0-9-])/gu;
/**
 * 사람을 가리키지 않는 이메일: 답장을 받지 않는 noreply 주소(GitHub·Anthropic 표기), 문서 예시용으로 예약된 도메인(RFC 2606·6761).
 * @param {string} local
 * @param {string} domain
 */
function isPlaceholderEmail(local, domain) {
  const lowerDomain = domain.toLowerCase();
  return (
    local.toLowerCase().startsWith('noreply') ||
    lowerDomain.endsWith('.noreply.github.com') ||
    /(?:^|\.)example\.(?:com|org|net)$/u.test(lowerDomain) ||
    /\.(?:example|invalid|test|localhost)$/u.test(lowerDomain) ||
    // 파일 이름 속 @(예: 고해상도 그림 이름의 @2x)는 이메일이 아니다.
    /\.(?:webp|png|jpe?g|gif|svg|avif|ico|css|js|mjs|cjs|ts|tsx|json|md|html?|py|txt|woff2?|ttf|otf|wasm|ya?ml|astro|pdf|zip)$/u.test(lowerDomain)
  );
}
/**
 * 한국 전화번호 모양(휴대전화 010·011 등, 지역 번호 02·031 등, 인터넷 전화 070, 대표 번호 080·050x).
 * 구분자(하이픈·점·공백)가 있는 것만 본다 — 버전·날짜 같은 숫자 나열과 헷갈리지 않게.
 */
const PHONE_NUMBER = /(?<![\dA-Za-z-])(?:01[016789]|0[2-6]\d?|070|080|050\d)[-. ]\d{3,4}[-. ]\d{4}(?![\dA-Za-z-])/gu;
/** 자리표시자 전화번호(전부 0) */
const ALLOWED_PHONE_NUMBERS = /^0[\d]{1,3}[-. ]0{3,4}[-. ]0{4}$/u;
const HANGUL_CHARACTER = /\p{Script=Hangul}/u;
const LATIN_CHARACTER = /[a-z0-9]/u;
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
    title: '개인정보로 보이는 경로·주소·이름',
    fix:
      '사용자 이름이 들어간 경로는 <사용자> 같은 자리표시자로, MAC 주소는 XX:XX:XX:XX:XX:XX로 바꾸고, OneDrive 경로는 지워요. ' +
      '이메일·전화번호는 지우거나 noreply@…·010-0000-0000 같은 자리표시자로 바꾸고, 비공개 이름(학교명 등)은 "우리 학교"처럼 일반적인 말로 바꿔요(PD-37).',
  },
  'image-review': {
    title: '눈 확인 기록이 없는 이미지',
    fix:
      '이미지를 한 장씩 열어 얼굴·이름·경로·파일명·기기 주소·학교명이 없는지 보고 reviewed(by·date·result)를 적은 뒤 기록 파일도 함께 스테이징해요. ' +
      `원고에서 꺼낸 차시 그림은 그 차시의 그림 목록(content/lessons/<단원>/<차시>${MANIFEST_SUFFIX}), 차시 밖 그림은 ${IMAGE_ALLOWLIST_FILE}에 적어요. ` +
      '그림이 바뀌어 sha256이 기록과 다르면 다시 보고 기록해요(npm run images:extract가 sha256을 새로 적어요). ' +
      '글·코드 파일 안에 data: 주소로 넣은 그림은 되도록 파일로 빼서 public/images/에 두고 그 파일을 기록해요.',
  },
  'image-metadata': {
    title: '메타데이터가 남은 이미지',
    fix:
      '그림에 촬영 기기·작업 PC 경로·원본 파일 이름 같은 정보가 따라올 수 있어요. 원고 그림은 npm run images:extract로 다시 꺼내고(픽셀만 WebP로 다시 인코딩), ' +
      '다른 그림은 편집기에서 메타데이터 없이 다시 저장해요. avif·tif·heic는 WebP·PNG·JPEG로 바꿔요.',
  },
  'handout-review': {
    title: '쪽별 눈 확인 기록이 맞지 않는 가린 편집본',
    fix:
      `가린 편집본 PDF는 ${HANDOUT_RECORD_FILE}에 모든 쪽의 눈 확인 기록(review — by·date·result "통과…")과 편집본의 output.sha256이 있어야 해요. ` +
      'python scripts/redact-handouts.py build로 다시 만들었다면 preview로 쪽 그림을 한 장씩 다시 보고 기록을 고친 뒤 기록 파일도 함께 스테이징해요(MAINTENANCE.md 3-3).',
  },
  'nul-text': {
    title: 'NUL 바이트가 든 글 파일',
    fix:
      '글·코드 파일(이진 확장자가 아닌 파일)의 앞부분에 NUL 바이트가 있으면 개인정보 검사가 그 파일을 이진 파일로 보고 건너뛰어요. ' +
      '이진 파일이면 알맞은 확장자로 저장하고, 글 파일이면 NUL 바이트를 지워요(코드에서 NUL이 필요하면 이스케이프 글자로 적어요).',
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
 * 해시로만 적어 둔 비공개 이름 하나(scripts/privacy-needles.json의 needles 항목).
 * @typedef {object} PrivacyNeedle
 * @property {string} label 무엇인지(예: "학교 이름"). 이름 자체는 적지 않는다.
 * @property {'hangul' | 'latin'} script 글자 종류(한글 / 영문·숫자). 그 종류의 글자만 이어진 구간에서 찾는다.
 * @property {number} length 글자 수(코드 포인트 수)
 * @property {string} sha256 hashPrivacyNeedle()로 만든 해시(16진수)
 */

/**
 * @typedef {object} PrivacyNeedleSet
 * @property {string} salt 해시에 섞는 값(파일마다 다르게 두어 같은 이름의 해시가 밖에서 만든 표와 맞지 않게)
 * @property {PrivacyNeedle[]} needles
 */

/**
 * @typedef {object} RepoRules
 * @property {{ path: string, reason: string }[]} originalFormatAllowed
 * @property {{ path: string, reason: string, maxMb: number }[]} largeFileAllowed
 * @property {Map<string, unknown>} imageReviews 이미지 경로 → 기록({ reviewed, sha256?, recordFile? }). runRepoCheck가 git 인덱스의 기록 파일에서 모은다
 * @property {string[]} originalFolderNames .gitignore의 원본 자료 폴더 이름
 * @property {string[]} originalNameNeedles 찾을 원본 이름
 * @property {PrivacyNeedleSet} [privacyNeedles] 해시로 적어 둔 비공개 이름(없으면 검사하지 않는다)
 * @property {{ path: string, kinds: string[], reason: string }[]} [privacyExceptions] 개인정보 모양 검사 예외(public/licenses/ 아래 고지 원문의 이메일만)
 * @property {Map<string, HandoutRecord>} [handoutReviews] 가린 편집본 경로 → 쪽별 눈 확인 기록. runRepoCheck가 git 인덱스의 기록 파일에서 모은다
 */

/**
 * 가린 편집본 하나의 기록(scripts/handout-redactions.yaml의 documents.<id>)
 * @typedef {object} HandoutRecord
 * @property {string} id 문서 이름(bt·ppt)
 * @property {string | undefined} sha256 output.sha256
 * @property {number | undefined} pages source.pages(원본 쪽 수 — 편집본 쪽 수와 같다)
 * @property {unknown[]} review 쪽별 기록
 */

/** privacy_exceptions에 적을 수 있는 검사 종류(지금은 라이선스 고지 원문·npm 잠금 파일의 이메일뿐) */
export const PRIVACY_EXCEPTION_KINDS = Object.freeze(['email']);
/** privacy_exceptions의 경로가 있어야 하는 폴더(다른 저작자의 라이선스 고지 원문) */
export const PRIVACY_EXCEPTION_ROOT = 'public/licenses/';
/**
 * 폴더 밖에서 예외를 둘 수 있는 파일. package-lock.json은 npm이 기록하는 다른 패키지의 deprecated 안내문에 그 패키지 저작자가 스스로 적은
 * 공개 주소가 들어올 수 있다(2026-09-16 glob 11.1.0 — workbox-build의 의존성). 운영자·학생의 정보는 어떤 경우에도 예외로 두지 않는다.
 */
export const PRIVACY_EXCEPTION_FILES = Object.freeze(['package-lock.json']);

/**
 * privacy_exceptions의 path로 쓸 수 있는 곳인지: public/licenses/ 아래 또는 정해진 파일(package-lock.json)만.
 * @param {unknown} pattern
 */
export function isPrivacyExceptionPathAllowed(pattern) {
  const text = String(pattern);
  return text.startsWith(PRIVACY_EXCEPTION_ROOT) || PRIVACY_EXCEPTION_FILES.includes(text);
}

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
 * @param {{ skipKinds?: readonly string[] }} [options] 건너뛸 검사 종류(PRIVACY_EXCEPTION_KINDS 가운데)
 * @returns {string[]}
 */
export function findPrivacyPatterns(text, options = {}) {
  const skipKinds = new Set(options.skipKinds ?? []);
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
  for (const match of text.matchAll(MAC_BYTES_ESCAPE)) {
    if (!isPlaceholderMacValue(match[2] ?? '')) {
      findings.push(`${lineNumberAt(text, match.index ?? 0)}번째 줄: MAC 주소 모양 — bytes 글자(\\x 여섯 개, 값은 가려서 표시)`);
    }
  }
  for (const match of text.matchAll(MAC_DOTTED)) {
    if (!isPlaceholderMacValue(match[0])) {
      findings.push(`${lineNumberAt(text, match.index ?? 0)}번째 줄: MAC 주소 모양 — 점 모양(값은 가려서 표시)`);
    }
  }
  for (const match of text.matchAll(MAC_NEAR_WORD)) {
    const value = match[1] ?? match[2] ?? '';
    if (!isPlaceholderMacValue(value)) {
      findings.push(`${lineNumberAt(text, match.index ?? 0)}번째 줄: MAC 주소 모양 — 주소 낱말 옆의 여섯 바이트(값은 가려서 표시)`);
    }
  }
  if (!skipKinds.has('email')) {
    for (const match of text.matchAll(EMAIL_ADDRESS)) {
      if (!isPlaceholderEmail(match[1], match[2])) {
        findings.push(`${lineNumberAt(text, match.index ?? 0)}번째 줄: 이메일 주소 모양(…@${match[2].split('.').slice(-1)[0]}, 앞부분은 가려서 표시)`);
      }
    }
  }
  for (const match of text.matchAll(PHONE_NUMBER)) {
    if (!ALLOWED_PHONE_NUMBERS.test(match[0])) {
      findings.push(`${lineNumberAt(text, match.index ?? 0)}번째 줄: 전화번호 모양(${match[0].slice(0, 3)}…, 나머지는 가려서 표시)`);
    }
  }
  return findings;
}

/**
 * 비공개 이름을 찾기 위한 글자 정리: 유니코드 정규화(NFC), 소문자, 공백·줄바꿈·너비 없는 글자 제거.
 * 문장 부호는 남겨서 "가나`·"다라"처럼 부호로 나뉜 두 낱말이 하나로 붙어 보이지 않게 한다.
 * @param {string} text
 * @returns {{ chars: string[], offsets: number[] }} 남은 글자와 원래 글에서의 위치
 */
export function normalizeForNeedle(text) {
  /** @type {string[]} */
  const chars = [];
  /** @type {number[]} */
  const offsets = [];
  const normalized = text.normalize('NFC').toLowerCase();
  let offset = 0;
  for (const char of normalized) {
    if (!/[\s​-‍﻿]/u.test(char)) {
      chars.push(char);
      offsets.push(offset);
    }
    offset += char.length;
  }
  return { chars, offsets };
}

/**
 * 비공개 이름 하나의 해시. 이름은 이 함수를 거친 값만 privacy-needles.json에 적는다(scripts/privacy-needle.mjs).
 * @param {string} word
 * @param {string} salt
 * @returns {{ sha256: string, length: number, script: 'hangul' | 'latin' }}
 */
export function hashPrivacyNeedle(word, salt) {
  const { chars } = normalizeForNeedle(word);
  const script = chars.every((char) => HANGUL_CHARACTER.test(char))
    ? 'hangul'
    : chars.every((char) => LATIN_CHARACTER.test(char))
      ? 'latin'
      : null;
  if (chars.length === 0 || script === null) {
    throw new Error('비공개 이름은 한글만으로, 또는 영문·숫자만으로 이루어진 낱말 하나여야 해요(공백은 무시).');
  }
  return { sha256: createHash('sha256').update(`${salt}\0${chars.join('')}`).digest('hex'), length: chars.length, script };
}

/**
 * 해시로 적어 둔 비공개 이름이 글에 있는지 찾는다. 같은 글자 종류(한글 / 영문·숫자)가 이어진 구간에서
 * 이름 길이만큼의 창을 옮겨 가며 해시를 견준다. 찾은 이름은 로그에 적지 않는다.
 * @param {string} text
 * @param {PrivacyNeedleSet | undefined} needleSet
 * @returns {string[]}
 */
export function findPrivacyNeedles(text, needleSet) {
  if (!needleSet || needleSet.needles.length === 0) {
    return [];
  }
  /** @type {string[]} */
  const findings = [];
  const { chars, offsets } = normalizeForNeedle(text);
  const classes = chars.map((char) => (HANGUL_CHARACTER.test(char) ? 'hangul' : LATIN_CHARACTER.test(char) ? 'latin' : 'other'));
  needleSet.needles.forEach((needle, index) => {
    let run = 0;
    for (let position = 0; position < chars.length; position += 1) {
      run = classes[position] === needle.script ? run + 1 : 0;
      if (run < needle.length) {
        continue;
      }
      const start = position - needle.length + 1;
      const window = chars.slice(start, position + 1).join('');
      const hash = createHash('sha256').update(`${needleSet.salt}\0${window}`).digest('hex');
      if (hash === needle.sha256) {
        findings.push(
          `${lineNumberAt(text, offsets[start] ?? 0)}번째 줄: 비공개 이름(${needle.label}, ${PRIVACY_NEEDLES_FILE}의 ${index + 1}번째 항목 — 이름은 표시하지 않아요)`,
        );
        break;
      }
    }
  });
  return findings;
}

/**
 * 텍스트 파일이면 글자로 바꿔 돌려주고, 이진 파일이면 null.
 * UTF-16(맨 앞에 BOM이 있는 파일, Windows PowerShell 5.1의 기본 저장 형식)은 NUL 바이트가 섞여 있어도 글자로 읽는다.
 * @param {string} filePath
 * @param {Buffer} content
 * @returns {string | null}
 */
function decodeTextContent(filePath, content) {
  if (BINARY_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase())) {
    return null;
  }
  if (content.length >= 2 && content[0] === 0xff && content[1] === 0xfe) {
    return content.subarray(2, 2 + Math.floor((content.length - 2) / 2) * 2).toString('utf16le');
  }
  if (content.length >= 2 && content[0] === 0xfe && content[1] === 0xff) {
    const body = Buffer.from(content.subarray(2, 2 + Math.floor((content.length - 2) / 2) * 2));
    return body.swap16().toString('utf16le');
  }
  if (content.subarray(0, 8000).includes(0)) {
    return null;
  }
  return content.toString('utf8');
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
 * 눈 확인 기록 하나를 검사한다. 기록에 sha256이 있으면 그림 내용과도 견준다.
 * @param {unknown} record
 * @param {Buffer | null} content
 * @returns {string | null}
 */
function describeReviewProblem(record, content) {
  if (!isPlainObject(record)) {
    return '눈 확인 기록이 없어요';
  }
  const problem = reviewedProblem(record.reviewed);
  if (problem) {
    return problem;
  }
  if (typeof record.sha256 === 'string' && content && sha256Hex(content) !== record.sha256) {
    return '눈으로 확인한 뒤에 그림이 바뀌었어요(sha256이 기록과 달라요). 다시 보고 기록해요';
  }
  return null;
}

/**
 * 가린 편집본 PDF 하나의 기록 문제(없으면 null).
 * @param {HandoutRecord | undefined} record
 * @param {Buffer | null} content
 * @returns {string | null}
 */
export function describeHandoutProblem(record, content) {
  if (!record) {
    return '가린 편집본의 쪽별 눈 확인 기록(documents.*.output.path가 이 파일인 항목)이 없어요';
  }
  if (typeof record.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(record.sha256)) {
    return `${record.id}: output.sha256(64자리 16진수)이 없어요`;
  }
  if (content && sha256Hex(content) !== record.sha256) {
    return `${record.id}: 편집본이 기록(output.sha256)과 달라요 — 다시 만든 편집본이면 쪽마다 다시 보고 기록해요`;
  }
  if (!Number.isInteger(record.pages) || /** @type {number} */ (record.pages) < 1) {
    return `${record.id}: 원본 쪽 수(source.pages)가 없어요`;
  }
  const passed = new Set();
  for (const item of record.review) {
    if (!isPlainObject(item)) continue;
    const ok =
      Number.isInteger(item.page) &&
      typeof item.by === 'string' &&
      item.by.trim() !== '' &&
      /^\d{4}-\d{2}-\d{2}$/u.test(String(item.date ?? '')) &&
      typeof item.result === 'string' &&
      item.result.startsWith('통과');
    if (ok) {
      passed.add(item.page);
    }
  }
  const missing = [];
  for (let page = 1; page <= /** @type {number} */ (record.pages); page += 1) {
    if (!passed.has(page)) {
      missing.push(page);
    }
  }
  if (missing.length > 0) {
    const shown = missing.slice(0, 10).join('·');
    return `${record.id}: ${shown}${missing.length > 10 ? ` 등 ${missing.length}` : ''}쪽의 눈 확인 기록(by·date·result "통과…")이 없거나 맞지 않아요`;
  }
  return null;
}

/**
 * git 인덱스의 scripts/handout-redactions.yaml에서 가린 편집본의 쪽별 눈 확인 기록을 모은다(P5-14).
 * 스테이징하지 않은 기록은 통하지 않는다(그림 기록과 같은 규칙).
 * @param {RepoFile[]} files
 * @returns {{ records: Map<string, HandoutRecord>, errors: { file: string, message: string }[] }}
 */
export function collectHandoutRecords(files) {
  /** @type {Map<string, HandoutRecord>} */
  const records = new Map();
  /** @type {{ file: string, message: string }[]} */
  const errors = [];
  const file = files.find((candidate) => candidate.path.normalize('NFC') === HANDOUT_RECORD_FILE);
  if (!file || !file.content) {
    return { records, errors };
  }
  const document = parseDocument(file.content.toString('utf8'), { uniqueKeys: true });
  if (document.errors.length > 0) {
    errors.push({ file: HANDOUT_RECORD_FILE, message: `YAML 문법 오류: ${document.errors[0].message.split('\n')[0]}` });
    return { records, errors };
  }
  const data = document.toJS();
  const documents = isPlainObject(data) ? data.documents : undefined;
  if (!isPlainObject(documents)) {
    errors.push({ file: HANDOUT_RECORD_FILE, message: 'documents(문서 이름 → 기록)를 적어요.' });
    return { records, errors };
  }
  for (const [id, entry] of Object.entries(documents)) {
    if (!isPlainObject(entry)) continue;
    const output = isPlainObject(entry.output) ? entry.output : {};
    const source = isPlainObject(entry.source) ? entry.source : {};
    if (typeof output.path !== 'string') {
      errors.push({ file: HANDOUT_RECORD_FILE, message: `documents.${id}: output.path(편집본 경로)를 적어요.` });
      continue;
    }
    records.set(output.path.normalize('NFC'), {
      id,
      sha256: typeof output.sha256 === 'string' ? output.sha256 : undefined,
      pages: typeof source.pages === 'number' ? source.pages : undefined,
      review: Array.isArray(entry.review) ? entry.review : [],
    });
  }
  return { records, errors };
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
      problems.push({ kind: 'forbidden', path: filePath, detail: '직위 같은 운영자 정보가 있어 로컬에만 둬요(운영자 할 일 7번 답 O11 — 학교명은 공개, 직위는 답이 없어 SPEC.md는 공개하지 않아요, PD-37).' });
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

    // 래스터 이미지는 저장소 어디에 있든(tests/·.github/·뿌리 포함) 눈 확인 기록이 있어야 한다. 공개 저장소라 폴더가 어디든 보이기 때문이다.
    const text = file.content ? decodeTextContent(filePath, file.content) : null;
    if (file.content && text === null && !BINARY_EXTENSIONS.has(extension)) {
      // 이진 확장자가 아닌데 글로 읽지 못했다 = 앞부분에 NUL이 있다. 예전에는 조용히 건너뛰어 개인정보 검사를 피하는 구멍이 됐다(2026-09-25 검토 반영).
      problems.push({ kind: 'nul-text', path: filePath, detail: '앞부분 8000바이트 안에 NUL 바이트가 있어 글로 읽지 못했어요.' });
    }
    const embeddedRaster = text !== null && EMBEDDED_RASTER.test(text);
    if (RASTER_IMAGE_EXTENSIONS.has(extension) || embeddedRaster) {
      const record = rules.imageReviews.get(filePath);
      const problem = describeReviewProblem(record, RASTER_IMAGE_EXTENSIONS.has(extension) ? file.content : null);
      if (problem) {
        const where = embeddedRaster ? '글·코드 파일 안에 data: 주소로 넣은 래스터 그림이 있는데 ' : '';
        const recordFile =
          isPlainObject(record) && typeof record.recordFile === 'string' ? record.recordFile : `차시 그림 목록(*${MANIFEST_SUFFIX}) 또는 ${IMAGE_ALLOWLIST_FILE}`;
        problems.push({ kind: 'image-review', path: filePath, detail: `${where}${problem}(${recordFile}).` });
      }
    }
    if (filePath.startsWith(HANDOUT_ROOT) && extension === '.pdf') {
      const problem = describeHandoutProblem(rules.handoutReviews?.get(filePath), file.content);
      if (problem) {
        problems.push({ kind: 'handout-review', path: filePath, detail: `${problem}(${HANDOUT_RECORD_FILE}).` });
      }
    }
    if (RASTER_IMAGE_EXTENSIONS.has(extension) && file.content) {
      if (isUncheckableRaster(extension)) {
        problems.push({ kind: 'image-metadata', path: filePath, detail: `${extension}는 메타데이터를 확인할 수 없는 형식이에요.` });
      } else {
        const inspected = inspectImageMetadata(file.content);
        if (inspected.problems.length > 0) {
          problems.push({ kind: 'image-metadata', path: filePath, detail: `${inspected.problems.join(', ')}이(가) 남아 있어요.` });
        }
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
      // 예외(privacy_exceptions)는 public/licenses/ 아래 고지 원문의 이메일 모양만 건너뛴다. 비공개 이름(needles)은 늘 검사한다.
      const exception = (rules.privacyExceptions ?? []).find((item) => matchesGlob(filePath, item.path));
      const patternFindings = findPrivacyPatterns(text, exception ? { skipKinds: exception.kinds } : {});
      for (const finding of [...patternFindings, ...findPrivacyNeedles(text, rules.privacyNeedles)]) {
        problems.push({ kind: 'privacy', path: filePath, detail: finding });
      }
    }
  }
  return problems;
}

/**
 * scripts/privacy-needles.json을 읽는다. 파일이 없으면 검사하지 않고(undefined), 모양이 틀리면 오류를 남긴다.
 * @param {string | null} text
 * @param {{ file: string, message: string }[]} errors
 * @returns {PrivacyNeedleSet | undefined}
 */
function parsePrivacyNeedles(text, errors) {
  if (text === null) {
    return undefined;
  }
  /** @type {unknown} */
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    errors.push({ file: PRIVACY_NEEDLES_FILE, message: `JSON 문법 오류: ${error instanceof Error ? error.message : String(error)}` });
    return undefined;
  }
  if (!isPlainObject(data) || typeof data.salt !== 'string' || data.salt.length < 8 || !Array.isArray(data.needles)) {
    errors.push({ file: PRIVACY_NEEDLES_FILE, message: 'salt(8글자 이상 글자)와 needles(목록)가 있어야 해요.' });
    return undefined;
  }
  /** @type {PrivacyNeedle[]} */
  const needles = [];
  data.needles.forEach((item, index) => {
    const where = `needles의 ${index + 1}번째 항목`;
    if (
      !isPlainObject(item) ||
      typeof item.label !== 'string' ||
      (item.script !== 'hangul' && item.script !== 'latin') ||
      !Number.isInteger(item.length) ||
      item.length < 2 ||
      typeof item.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(item.sha256)
    ) {
      errors.push({
        file: PRIVACY_NEEDLES_FILE,
        message: `${where}: label(글자), script(hangul 또는 latin), length(2 이상 정수), sha256(64자리 16진수)을 적어요. node scripts/privacy-needle.mjs <이름>으로 만들어요.`,
      });
      return;
    }
    needles.push({ label: item.label, script: item.script, length: item.length, sha256: item.sha256 });
  });
  return { salt: data.salt, needles };
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
    if (key !== 'original_formats' && key !== 'large_files' && key !== 'privacy_exceptions') {
      errors.push({
        file: REPO_ALLOWLIST_FILE,
        message: `모르는 이름 "${key}"예요. original_formats, large_files, privacy_exceptions만 써요.`,
      });
    }
  }
  const originalFormatAllowed = readAllowEntries(repoAllowlist, 'original_formats', errors).map(({ path: pattern, reason }) => ({
    path: pattern,
    reason,
  }));
  const largeFileAllowed = readAllowEntries(repoAllowlist, 'large_files', errors);
  const privacyExceptions = readPrivacyExceptions(repoAllowlist, errors);

  // 눈 확인 기록(imageReviews)은 여기서 읽지 않는다. runRepoCheck가 git 인덱스의 기록 파일(옛 공용 기록 + 차시 그림 목록)에서
  // 모은다(collectImageRecords) — 디스크에만 있고 스테이징하지 않은 기록이 커밋을 통과시키지 않게(2026-09-25 P5-01).
  /** @type {Map<string, unknown>} */
  const imageReviews = new Map();

  const originalFolderNames = originalFolderNamesFromGitignore(readOptional('.gitignore') ?? '');
  const documentNames = [
    ...originalDocumentNamesFromInventory(readOptional('docs/INVENTORY.md') ?? ''),
    ...originalDocumentNamesOnDisk(rootDir, originalFolderNames),
  ];
  const privacyNeedles = parsePrivacyNeedles(readOptional(PRIVACY_NEEDLES_FILE), errors);
  return {
    rules: {
      originalFormatAllowed,
      largeFileAllowed,
      imageReviews,
      originalFolderNames,
      originalNameNeedles: buildOriginalNameNeedles(originalFolderNames, documentNames),
      privacyNeedles,
      privacyExceptions,
    },
    errors,
  };
}

/**
 * privacy_exceptions 항목을 읽는다. 경로는 public/licenses/ 아래여야 하고(제3자 라이선스 고지 원문만),
 * kinds는 PRIVACY_EXCEPTION_KINDS 가운데서만 고르며, reason(이유)이 있어야 한다.
 * @param {Record<string, any>} data
 * @param {{ file: string, message: string }[]} errors
 * @returns {{ path: string, kinds: string[], reason: string }[]}
 */
function readPrivacyExceptions(data, errors) {
  const value = data.privacy_exceptions;
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push({ file: REPO_ALLOWLIST_FILE, message: 'privacy_exceptions는 목록으로 적어요.' });
    return [];
  }
  /** @type {{ path: string, kinds: string[], reason: string }[]} */
  const entries = [];
  value.forEach((item, index) => {
    const where = `privacy_exceptions의 ${index + 1}번째 항목`;
    const pattern = isPlainObject(item) ? item.path : undefined;
    const patternProblem = validateGlob(pattern);
    if (!isPlainObject(item) || patternProblem) {
      errors.push({ file: REPO_ALLOWLIST_FILE, message: `${where}: path — ${patternProblem ?? '경로가 없어요.'}` });
      return;
    }
    if (!isPrivacyExceptionPathAllowed(pattern)) {
      errors.push({
        file: REPO_ALLOWLIST_FILE,
        message: `${where}: path는 ${PRIVACY_EXCEPTION_ROOT} 아래의 라이선스 고지 파일이나 ${PRIVACY_EXCEPTION_FILES.join(', ')}만 적을 수 있어요.`,
      });
      return;
    }
    const kinds = Array.isArray(item.kinds) ? item.kinds : [];
    if (kinds.length === 0 || !kinds.every((kind) => typeof kind === 'string' && PRIVACY_EXCEPTION_KINDS.includes(kind))) {
      errors.push({ file: REPO_ALLOWLIST_FILE, message: `${where}: kinds는 ${PRIVACY_EXCEPTION_KINDS.join(', ')} 가운데서 목록으로 적어요.` });
      return;
    }
    if (typeof item.reason !== 'string' || item.reason.trim() === '') {
      errors.push({ file: REPO_ALLOWLIST_FILE, message: `${where}: reason(예외를 두는 이유)을 적어요.` });
      return;
    }
    entries.push({ path: /** @type {string} */ (pattern), kinds: [...kinds], reason: item.reason.trim() });
  });
  return entries;
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
  const imageRecords = collectImageRecords(files);
  rules.imageReviews = imageRecords.records;
  errors.push(...imageRecords.errors);
  const handoutRecords = collectHandoutRecords(files);
  rules.handoutReviews = handoutRecords.records;
  errors.push(...handoutRecords.errors);
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
