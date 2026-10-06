// 마크다운 출력 다듬기(rehype 플러그인) — Phase 6 구역 A(성능, 2026-09-26). 자리는 병렬 제작 준비 때 열었다.
//
// 하는 일(모든 마크다운 — 차시·용어사전·교사용 자료실 문서에 같다)
//   1. 그림 크기 속성(PROGRESS 미해결 190): `![대체 글](/images/lessons/…webp)`로 넣은 그림의 <img>에 width·height를 붙인다.
//      크기는 **그림 파일에서 직접 읽는다**(public/ 아래 WebP·PNG·JPEG·GIF·SVG의 머리 바이트 — 그림 목록 *.images.yaml의 숫자와
//      다르면 파일이 맞다). 받기 전에도 브라우저가 가로세로 비율로 자리를 잡아 두어, 그림이 도착할 때 아래 글이 밀리지 않는다
//      (레이아웃 이동 0 — 전역 CSS가 img에 height: auto를 주므로 화면에 맞춰 줄어도 비율은 그대로다).
//      - 사이트 뿌리 주소(/로 시작, //는 아님)만 본다. 바깥 주소·상대 주소는 그대로 둔다.
//      - width나 height를 이미 적은 그림(마크다운 속 <img … width= height=>)은 건드리지 않는다 — 글쓴이 값이 먼저다.
//      - 파일이 없거나 읽을 수 없는 모양이면 조용히 그대로 둔다(파일이 없는 것은 차시 틀 검사 img-file이 알린다).
//   2. 차시 번호 줄바꿈 막기(PROGRESS 미해결 174): 글 속 차시 번호(2-1-3, 2-1-R 같은 "숫자-숫자-숫자|R")를
//      <span class="nowrap">으로 감싼다 — 좁은 표 칸에서 브라우저가 하이픈 뒤에서 "2-1-" / "3"으로 가르던 것.
//      클래스는 src/styles/global.css의 .nowrap(white-space: nowrap).
//      - 글자 노드만 바꾼다: 주소(href·src)·대체 글(alt)·제목 id(뒤에 도는 rehypeHeadingIds가 글자에서 만든다 — 글자는 그대로라
//        id도 그대로)는 달라지지 않는다.
//      - <code>·<pre>·<kbd>·<samp>·<script>·<style>·<textarea> 안은 건드리지 않는다(코드 블록·인라인 코드).
//      - 앞뒤가 영문·숫자·밑줄·하이픈이면 차시 번호로 보지 않는다(날짜 2026-09-26, 전화번호, 10-2-3 같은 글).
//   3. 좁은 화면용 그림(PROGRESS 미해결 209, 판 1.1.0 구역 D): 사이트가 그린 SVG(x.svg) 옆에 좁은 화면용 그림(x.narrow.svg — 폭 360
//      안팎에 글자를 키워 세로로 다시 그린 것)이 있으면, 마크다운 안 HTML의 <img>를
//      <picture><source media="(max-width: 30em)" srcset="…x.narrow.svg" width height><img …></picture>로 감싼다.
//      휴대폰(뷰포트 480px 이하)은 좁은 그림을, 그 밖은 원래 그림을 받는다(받는 것은 둘 중 하나뿐). **차시 md는 고치지 않는다** —
//      좁은 그림 파일을 옆에 두기만 하면 된다(유지보수 쉬움).
//      - 대체 글(alt)·원래 그림의 width·height·주소(src)는 그대로다(<img>를 한 글자도 바꾸지 않고 감싸기만 한다). 좁은 그림의
//        가로·세로는 <source>의 width·height로(좁은 그림 파일 머리에서 읽음) — 받기 전에도 좁은 그림 비율로 자리를 잡는다
//        (Chrome 90·Safari 15·Firefox 108부터, MDN browser-compat-data html/elements/source.json 확인 2026-09-28).
//      - srcset에는 **이번 빌드의 base를 붙인 주소**를 쓴다(src/lib/url.ts의 withBase — 사이트 안 주소는 이것으로만 만든다).
//        차시 HTML의 src·href는 lesson-html.ts(rewriteRootRelativeUrls)가 나중에 base를 붙이지만 srcset은 거기서 보지 않는다.
//        base는 Astro 설정의 일부라 base가 바뀌면(오프라인판) 콘텐츠 캐시도 비워진다(아래 캐시 주의).
//      - 마크다운 안 HTML 조각(raw — 사이트 SVG를 넣는 정식 방법인 <figure><img …>, MAINTENANCE.md 1-4)의 <img>만 감싼다.
//        마크다운 그림(![](…))은 문단 속 그림이라 [그림 크게 보기]·가운데 맞춤(lesson-html.ts·LessonBody.astro)이 <p><img>만 알아서
//        감싸지 않는다. 이미 <picture>나 <source>가 든 조각은 글쓴이가 직접 고른 것이라 건드리지 않는다.
//      - [그림 크게 보기]는 원래 그림을 연다(lesson-html.ts가 <figure> 안 <img>의 src로 만든다 — 바뀌지 않음). 발표 모드도 같은
//        <picture>라 화면 폭대로 고른다(교실 화면·프로젝터는 원래 그림, 휴대폰은 좁은 그림 — 긴 단계는 present.ts가 나눈다).
//        스타일: src/styles/global.css의 .prose figure > picture.
//      - 좁은 그림 파일을 새로 더하거나 지워도 차시 md는 그대로라, 로컬 빌드·개발 서버의 콘텐츠 캐시가 옛 HTML을 되살릴 수 있다(아래 캐시 주의 —
//        markdown-plugins.mjs가 narrowFigureFingerprint()를 플러그인 설정에 넣어 저절로 비워진다. CI 빌드는 늘 캐시 없이 새로 그린다).
//   4. 닫는 따옴표 바로잡기(판 1.2.0 — 2026-10-06 판 1.1.5 뒤 개선 묶음 구역 E 지적, DECISIONS C96): 곧은 따옴표(" ')를 둥근 따옴표로 바꾸는
//      smartypants(@astrojs/markdown-remark가 사용자 remark 플러그인보다 먼저 거는 remark-smartypants 3.0.3 → retext-smartypants 6.2.0)는
//      따옴표 앞이 문장부호·기호이고 뒤가 낱말이면 **여는** 따옴표로 정한다(retext-smartypants lib/index.js quotesDefault "Get most opening
//      single quotes"). 한국어는 닫는 따옴표 뒤에 조사가 빈칸 없이 붙어 "뒤가 낱말"이 되므로 `'재생 입력(합성 좌표)'으로`가 화면에
//      ‘재생 입력(합성 좌표)‘으로, `"정회전 30%"처럼`이 “정회전 30%“처럼, `"'정지' 또는 '종료'"를`이 “‘정지’ 또는 ‘종료‘“를로 보였다
//      (차시 45편 가운데 23편 72곳). 그래서 smartypants 뒤에서 **여는 따옴표(“ ‘) 바로 앞 글자가 빈칸·여는 괄호·여는 따옴표·줄표·빗금이 아니면**
//      닫는 따옴표(” ’)로 바꾼다. 블록(문단·제목·목록 항목·표 칸 등)의 맨 앞은 여는 자리다.
//      - 앞 글자는 같은 블록 안에서 굵게·링크·용어 같은 인라인 요소의 경계를 넘어 본다. 인라인 코드(<code>·<kbd>·<samp>·<var>)는 글자를 바꾸지
//        않고 낱말 하나로 본다(smartypants도 인라인 코드를 낱말 글자로 이어 본다). 마크다운 안 HTML 조각(raw) 바로 뒤와 모르는 요소 뒤는
//        블록 맨 앞처럼 본다(바꾸지 않는 쪽 — smartypants가 보지 않는 글이라 판단할 근거가 없다).
//      - 코드 블록·인라인 코드 안의 따옴표, 닫는 따옴표·아포스트로피(’), 곧은 따옴표는 건드리지 않는다. 바꾸는 것은 따옴표 방향뿐이라 글자 수·
//        제목 id·주소는 그대로다. 차시 md에는 둥근 따옴표를 쓰지 않는다(곧은 따옴표로 쓰면 된다 — 유지보수 쉬움).
//
// 어디서 도나(@astrojs/markdown-remark 7.3.1 dist/index.js의 순서, 2026-09-26 확인)
//   remark 플러그인(src/lib/markdown-plugins.mjs) → remark-rehype → Shiki 코드 색 → **이 플러그인** → Astro 그림 처리(rehypeImages)
//   → 제목 id(rehypeHeadingIds) → rehype-raw → HTML 글자
//   - 빌드(astro.config.mjs)와 차시 틀 검사(npm run check:lessons — scripts/lib/check-lessons.mjs, 코드 색은 끔)가 **같은 목록**으로 부른다.
//   - 마크다운 안에 적은 HTML 조각(<figure>·<img … width= height=> 등)은 이 단계에서 아직 raw 노드다(rehype-raw가 뒤에 돈다) —
//     요소로 보이지 않으므로 1·2번은 바꾸지 않는다(그런 그림은 글쓴이가 width·height를 적는다 — MAINTENANCE.md 1절).
//     3번(좁은 화면용 그림)만 raw 노드의 글자에서 <img …> 태그를 찾아 앞뒤에 <picture><source …>·</picture>를 덧붙인다.
//   - "/"로 시작하는 그림은 Astro 그림 처리가 건드리지 않는다(remark-collect-images가 로컬·원격 어느 쪽으로도 모으지 않음) — 붙인 속성이 그대로 나간다.
//   - 차시 HTML은 이 뒤에 src/components/lesson/lesson-html.ts가 한 번 더 고친다(base 붙이기·[그림 크게 보기]·loading="lazy").
//
// 캐시 주의(PROGRESS 미해결 169): Astro 콘텐츠 캐시(.astro/data-store.json, node_modules/.astro/data-store.json)는 md 파일이
// 바뀌지 않으면 옛 HTML을 되살린다. 캐시를 지우는 조건은 "Astro 설정이 바뀜"인데(node_modules/astro/dist/content/content-layer.js —
// vite 설정을 뺀 설정을 JSON으로 비교), 함수 속 코드는 JSON에 들어가지 않는다. 그래서 markdown-plugins.mjs가 이 플러그인을
// [플러그인, { version: REHYPE_LESSON_POLISH_VERSION, narrow: narrowFigureFingerprint() }]으로 등록한다 — **동작을 바꾸면 아래 판 번호를
// 올린다**(설정 JSON이 바뀌어 다음 빌드·개발 서버가 "Astro config changed → Clearing content store"로 차시를 모두 다시 그린다. 배포
// 워크플로의 캐시도 같다). 좁은 화면용 그림(3번)은 코드가 아니라 **파일이 있는지**로 출력이 바뀐다 — 그래서 설정에 narrowFigureFingerprint()
// (좁은 그림 목록의 지문)를 함께 넣어 그림 파일만 더하거나 지워도 캐시가 비워진다(판 1.1.0 통합 — 개발 서버는 다시 켜기만 하면 된다).
// 그래도 옛 HTML이 보이면 캐시를 지운다(개발 서버를 끄고 .astro/data-store.json, 빌드는 node_modules/.astro/ — MAINTENANCE.md 8-11).
// CI 빌드는 캐시 없이 새로 그려 늘 맞다.
//
// Node.js가 직접 읽으므로(astro.config.mjs·check-lessons) JavaScript(JSDoc 타입 표기)로 쓴다. 바깥 패키지를 새로 쓰지 않는다
// (그림 크기는 파일 머리를 직접 읽고, 나무 돌기도 직접 한다 — package.json에 없는 전이 의존성에 기대지 않으려고).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteConfig } from '../config/site.ts';
import { withBase } from './url.ts';

/**
 * 이 플러그인의 동작 판. 출력이 바뀌는 수정을 하면 1씩 올린다(위 캐시 주의).
 * 1 = 아무것도 안 함(준비 자리) · 2 = 그림 width·height(190) + 차시 번호 nowrap(174) · 3 = 좁은 화면용 그림 <picture>(209)
 * · 4 = 닫는 따옴표 바로잡기(판 1.2.0 — 머리말 4번)
 */
export const REHYPE_LESSON_POLISH_VERSION = 4;

/** 좁은 화면용 그림 파일 이름의 끝: 원래 그림 agent-cycle.svg 옆의 agent-cycle.narrow.svg */
export const NARROW_FIGURE_SUFFIX = '.narrow.svg';

/**
 * 좁은 화면용 그림을 고르는 화면 조건(<source media>). 30em = 브라우저 기본 글자 16px일 때 뷰포트 480px:
 * 휴대폰 세로(320~430px)는 모두 좁은 그림, 태블릿(768px~)·데스크톱·프로젝터(발표 모드)는 원래 그림.
 * 폭 640 그림은 480px 뷰포트(본문 약 442px)에서 0.69배라 16px 글자가 약 11px — 이보다 좁으면 원래 그림 글자가 11px 밑으로 내려간다.
 * em이라 브라우저 기본 글자를 키운 사람은 더 넓은 화면에서도 글자가 큰 좁은 그림을 보고, 쪽 확대 400%(1280 → 320px)도 좁은 그림이다.
 */
export const NARROW_FIGURE_MEDIA = '(max-width: 30em)';

/** 저장소의 public 폴더(이 파일 src/lib/ 기준 — 작업 폴더와 상관없이) */
const REPO_PUBLIC_DIR = fileURLToPath(new URL('../../public/', import.meta.url));

/** 차시 번호를 감싸는 요소의 클래스(src/styles/global.css — 이름을 바꾸면 두 곳을 함께) */
export const NOWRAP_CLASS = 'nowrap';

/**
 * 글 속 차시 번호. 앞뒤가 영문·숫자·밑줄·하이픈이 아니어야 한다(한글 조사는 바로 붙어도 된다 — "2-1-3에서").
 * 가운데는 한 자리 숫자 두 개, 끝은 숫자 또는 R(읽기 자료 2-1-R).
 */
export const LESSON_NUMBER_PATTERN = /(?<![0-9A-Za-z_-])[0-9]-[0-9]-(?:[0-9]+|R)(?![0-9A-Za-z_-])/gu;

/** 이 요소 안의 글자는 바꾸지 않는다(코드·스크립트·입력칸) */
const SKIP_TEXT_INSIDE = new Set(['code', 'pre', 'kbd', 'samp', 'script', 'style', 'textarea', 'svg', 'math']);

/**
 * @typedef {object} RehypeLessonPolishOptions
 * @property {number} [version] 동작 판(markdown-plugins.mjs가 REHYPE_LESSON_POLISH_VERSION을 넣는다 — 캐시를 비우는 용도로만 쓴다)
 * @property {string} [publicDir] 그림을 찾을 public 폴더(테스트용). 없으면 마크다운 파일 위치에서 저장소 뿌리를 찾아 그 아래 public/
 * @property {string} [basePath] 그림 주소 앞에 붙어 있을 수 있는 사이트 하위 경로(기본 공개 사이트 경로 siteConfig.publicBase — 있으면 떼고 찾는다.
 *   마크다운은 보통 base 없이 /images/…로 적으므로 대비용이다)
 * @property {boolean} [narrowFigures] false면 좁은 화면용 그림(<picture>)을 붙이지 않는다(테스트에서 판 2 출력과 견줄 때). 기본 true
 * @property {boolean} [closingQuotes] false면 닫는 따옴표를 바로잡지 않는다(테스트에서 판 3 출력과 견줄 때). 기본 true
 * @property {string} [narrow] 좁은 그림 목록의 지문(narrowFigureFingerprint() — 동작에는 쓰지 않고, 설정 JSON에 들어가 캐시를 비우는 용도)
 */

/**
 * @typedef {{ width: number, height: number }} ImageSize
 */

// ─────────────────────────────────────────────────────────────
// 그림 크기 읽기(파일 머리 바이트만 — 순수 함수, tests/unit/perf/rehype-lesson-polish.test.ts)
// ─────────────────────────────────────────────────────────────

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 */
function u16be(bytes, offset) {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 */
function u16le(bytes, offset) {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 */
function u24le(bytes, offset) {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 */
function u32be(bytes, offset) {
  return (((bytes[offset] ?? 0) << 24) >>> 0) + (((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0));
}

/**
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {string} text
 */
function asciiAt(bytes, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) {
      return false;
    }
  }
  return true;
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {ImageSize | null}
 */
function sizeOrNull(width, height) {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 ? { width, height } : null;
}

/**
 * WebP(VP8 손실·VP8L 무손실·VP8X 확장) 머리에서 크기를 읽는다.
 * @param {Uint8Array} bytes
 * @returns {ImageSize | null}
 */
export function webpSize(bytes) {
  if (bytes.length < 30 || !asciiAt(bytes, 0, 'RIFF') || !asciiAt(bytes, 8, 'WEBP')) {
    return null;
  }
  if (asciiAt(bytes, 12, 'VP8 ')) {
    // 프레임 머리: 20~22 프레임 태그, 23~25 시작 부호 9D 01 2A, 26~29 가로·세로(14비트 + 확대 2비트)
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return null;
    }
    return sizeOrNull(u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff);
  }
  if (asciiAt(bytes, 12, 'VP8L')) {
    // 20 서명 0x2F, 21~24에 (가로-1) 14비트·(세로-1) 14비트
    if (bytes[20] !== 0x2f) {
      return null;
    }
    const b0 = bytes[21] ?? 0;
    const b1 = bytes[22] ?? 0;
    const b2 = bytes[23] ?? 0;
    const b3 = bytes[24] ?? 0;
    return sizeOrNull(1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)));
  }
  if (asciiAt(bytes, 12, 'VP8X')) {
    // 24~26 (캔버스 가로-1), 27~29 (캔버스 세로-1), 24비트 작은 끝
    return sizeOrNull(1 + u24le(bytes, 24), 1 + u24le(bytes, 27));
  }
  return null;
}

/**
 * PNG 머리(IHDR)에서 크기를 읽는다.
 * @param {Uint8Array} bytes
 * @returns {ImageSize | null}
 */
export function pngSize(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value) || !asciiAt(bytes, 12, 'IHDR')) {
    return null;
  }
  return sizeOrNull(u32be(bytes, 16), u32be(bytes, 20));
}

/**
 * GIF 머리(논리 화면 크기)에서 크기를 읽는다.
 * @param {Uint8Array} bytes
 * @returns {ImageSize | null}
 */
export function gifSize(bytes) {
  if (bytes.length < 10 || !(asciiAt(bytes, 0, 'GIF87a') || asciiAt(bytes, 0, 'GIF89a'))) {
    return null;
  }
  return sizeOrNull(u16le(bytes, 6), u16le(bytes, 8));
}

/**
 * JPEG 조각을 따라가 SOF(프레임 시작) 조각의 크기를 읽는다.
 * @param {Uint8Array} bytes
 * @returns {ImageSize | null}
 */
export function jpegSize(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      return null;
    }
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1; // 채움 바이트
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2; // 길이가 없는 표시
      continue;
    }
    const length = u16be(bytes, offset + 2);
    // SOF0~SOF15(C0~CF) 가운데 DHT(C4)·JPG(C8)·DAC(CC)는 프레임이 아니다
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return sizeOrNull(u16be(bytes, offset + 7), u16be(bytes, offset + 5));
    }
    if (length < 2) {
      return null;
    }
    offset += 2 + length;
  }
  return null;
}

/**
 * SVG 뿌리 요소의 width·height(단위가 없거나 px) 또는 viewBox에서 크기를 읽는다. 소수는 반올림한다.
 * @param {string} text
 * @returns {ImageSize | null}
 */
export function svgSize(text) {
  const root = /<svg\b([^>]*)>/iu.exec(text)?.[1];
  if (root === undefined) {
    return null;
  }
  /** @param {string} name */
  const attr = (name) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'iu').exec(root);
  /** @param {RegExpExecArray | null} match */
  const valueOf = (match) => (match ? (match[1] ?? match[2] ?? '').trim() : '');
  /** @param {string} value */
  const pixels = (value) => {
    const match = /^(\d+(?:\.\d+)?)(?:px)?$/u.exec(value);
    return match ? Math.round(Number(match[1])) : null;
  };
  const width = pixels(valueOf(attr('width')));
  const height = pixels(valueOf(attr('height')));
  if (width !== null && height !== null) {
    return sizeOrNull(width, height);
  }
  const viewBox = valueOf(attr('viewBox'))
    .split(/[\s,]+/u)
    .filter((part) => part !== '')
    .map(Number);
  if (viewBox.length === 4 && viewBox.every((value) => Number.isFinite(value))) {
    const [, , boxWidth = 0, boxHeight = 0] = viewBox;
    if (width !== null && boxWidth > 0) {
      return sizeOrNull(width, Math.round((width * boxHeight) / boxWidth));
    }
    if (height !== null && boxHeight > 0) {
      return sizeOrNull(Math.round((height * boxWidth) / boxHeight), height);
    }
    return sizeOrNull(Math.round(boxWidth), Math.round(boxHeight));
  }
  return null;
}

/**
 * 그림 파일 내용과 확장자로 크기를 읽는다(모르는 모양이면 null).
 * @param {Uint8Array} bytes
 * @param {string} extension 점을 포함한 소문자 확장자(.webp 등)
 * @returns {ImageSize | null}
 */
export function imageSizeOf(bytes, extension) {
  switch (extension) {
    case '.webp':
      return webpSize(bytes);
    case '.png':
      return pngSize(bytes);
    case '.jpg':
    case '.jpeg':
      return jpegSize(bytes);
    case '.gif':
      return gifSize(bytes);
    case '.svg':
      return svgSize(new TextDecoder('utf-8').decode(bytes.subarray(0, Math.min(bytes.length, 4096))));
    default:
      return null;
  }
}

/** 같은 파일을 여러 번 읽지 않게(빌드 한 번에 차시 45편) — 열쇠는 경로·크기·고친 시각(개발 서버에서 그림을 바꾸면 다시 읽는다) */
const sizeCache = new Map();

/**
 * public 폴더 안 파일의 그림 크기(없거나 모르는 모양이면 null).
 * @param {string} file 절대 경로
 * @returns {ImageSize | null}
 */
export function readImageFileSize(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  if (!stat.isFile()) {
    return null;
  }
  const key = `${file}|${stat.size}|${stat.mtimeMs}`;
  if (sizeCache.has(key)) {
    return sizeCache.get(key);
  }
  const extension = path.extname(file).toLowerCase();
  let size = null;
  try {
    // 머리만 읽는다(JPEG은 앞 조각이 길 수 있어 넉넉히 256KB, SVG는 뿌리 요소가 앞 4KB 안에 있다)
    const handle = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(Math.min(stat.size, 256 * 1024));
      fs.readSync(handle, buffer, 0, buffer.length, 0);
      size = imageSizeOf(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length), extension);
    } finally {
      fs.closeSync(handle);
    }
  } catch {
    size = null;
  }
  sizeCache.set(key, size);
  return size;
}

/**
 * 마크다운 파일 경로에서 public 폴더를 찾는다: 경로 속 마지막 content 폴더의 부모가 저장소 뿌리다(content/lessons/… 등).
 * 못 찾으면 작업 폴더(process.cwd())의 public/.
 * @param {string | undefined} filePath
 * @param {string} [cwd]
 */
export function publicDirFor(filePath, cwd = process.cwd()) {
  if (typeof filePath === 'string' && filePath !== '') {
    const parts = path.resolve(filePath).split(path.sep);
    const index = parts.lastIndexOf('content');
    if (index > 0) {
      return path.join(parts.slice(0, index).join(path.sep) || path.sep, 'public');
    }
  }
  return path.join(cwd, 'public');
}

/**
 * 그림 주소(/images/…)를 public 폴더 안 파일 경로로. 사이트 뿌리 주소가 아니거나 폴더 밖을 가리키면 null.
 * @param {string} src
 * @param {string} publicDir
 * @param {string} basePath
 */
export function publicFileForSrc(src, publicDir, basePath = siteConfig.publicBase) {
  if (typeof src !== 'string' || !src.startsWith('/') || src.startsWith('//')) {
    return null;
  }
  let sitePath = src.split(/[?#]/u)[0] ?? '';
  try {
    sitePath = decodeURI(sitePath);
  } catch {
    return null;
  }
  const base = basePath.replace(/\/+$/u, '');
  if (base !== '' && (sitePath === base || sitePath.startsWith(`${base}/`))) {
    sitePath = sitePath.slice(base.length) || '/';
  }
  const resolved = path.resolve(publicDir, `.${sitePath}`);
  const inside = path.relative(publicDir, resolved);
  if (inside === '' || inside.startsWith('..') || path.isAbsolute(inside)) {
    return null;
  }
  return resolved;
}

// ─────────────────────────────────────────────────────────────
// hast 나무 돌기(직접 — 바깥 패키지 없이)
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {import('hast').Root | import('hast').Element} Parent
 * @typedef {import('hast').RootContent} Child
 */

/**
 * 그림 요소에 크기 속성을 붙인다. 붙였으면 true.
 * @param {import('hast').Element} node
 * @param {string} publicDir
 * @param {string} basePath
 */
export function addImageSize(node, publicDir, basePath) {
  const properties = node.properties ?? {};
  if (properties.width !== undefined || properties.height !== undefined) {
    return false;
  }
  const file = publicFileForSrc(typeof properties.src === 'string' ? properties.src : '', publicDir, basePath);
  if (file === null) {
    return false;
  }
  const size = readImageFileSize(file);
  if (size === null) {
    return false;
  }
  node.properties = { ...properties, width: size.width, height: size.height };
  return true;
}

// ─────────────────────────────────────────────────────────────
// 좁은 화면용 그림(PROGRESS 미해결 209 — 순수 함수, tests/unit/lesson/narrow-figures.test.ts)
// ─────────────────────────────────────────────────────────────

/**
 * 원래 그림 주소(/images/…/x.svg)에서 좁은 화면용 그림의 사이트 안 경로(/images/…/x.narrow.svg — base 없이)를 만든다.
 * 사이트 뿌리 주소의 SVG가 아니거나 이미 좁은 그림이면 null. ?·# 뒤는 버린다.
 * @param {string} src
 * @param {string} [basePath]
 * @returns {string | null}
 */
export function narrowFigureSitePath(src, basePath = siteConfig.publicBase) {
  if (typeof src !== 'string' || !src.startsWith('/') || src.startsWith('//')) {
    return null;
  }
  let sitePath = src.split(/[?#]/u)[0] ?? '';
  const base = basePath.replace(/\/+$/u, '');
  if (base !== '' && sitePath.startsWith(`${base}/`)) {
    sitePath = sitePath.slice(base.length);
  }
  const lower = sitePath.toLowerCase();
  if (!lower.endsWith('.svg') || lower.endsWith(NARROW_FIGURE_SUFFIX)) {
    return null;
  }
  return `${sitePath.slice(0, -'.svg'.length)}${NARROW_FIGURE_SUFFIX}`;
}

/**
 * @typedef {{ srcset: string, width: number, height: number }} NarrowFigure
 */

/**
 * 원래 그림 옆에 좁은 화면용 그림 파일이 있으면 <source>에 쓸 값, 없으면(또는 크기를 읽지 못하면) null.
 * srcset은 이번 빌드의 base를 붙인 주소다(withBase — 머리말 3번).
 * @param {string} src 마크다운에 적은 원래 그림 주소
 * @param {string} publicDir
 * @param {string} [basePath]
 * @returns {NarrowFigure | null}
 */
export function narrowFigureFor(src, publicDir, basePath = siteConfig.publicBase) {
  const sitePath = narrowFigureSitePath(src, basePath);
  if (sitePath === null) {
    return null;
  }
  const file = publicFileForSrc(sitePath, publicDir, basePath);
  const size = file === null ? null : readImageFileSize(file);
  if (size === null) {
    return null;
  }
  let srcset;
  try {
    srcset = withBase(sitePath);
  } catch {
    return null;
  }
  // srcset은 빈칸·쉼표로 후보를 나누므로 그런 글자가 든 주소는 쓰지 않는다(사이트 그림 이름은 영문 소문자·숫자·하이픈 — MAINTENANCE 3-2)
  if (/[\s,]/u.test(srcset)) {
    return null;
  }
  return { srcset, width: size.width, height: size.height };
}

/** <img …> 태그 하나(따옴표 안의 >는 태그 끝이 아니다) */
const IMG_TAG = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu;

/**
 * 태그 글자에서 속성 값을 읽는다(따옴표 두 가지·따옴표 없는 값). 없으면 null. &amp;만 되돌린다(그림 주소에 다른 글자 참조는 쓰지 않는다).
 * @param {string} tag
 * @param {string} name
 * @returns {string | null}
 */
function attributeOf(tag, name) {
  const match = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'iu').exec(tag);
  if (!match) {
    return null;
  }
  return (match[1] ?? match[2] ?? match[3] ?? '').replace(/&amp;/gu, '&');
}

/**
 * @param {string} value
 */
function escapeAttribute(value) {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;');
}

/**
 * <img> 태그 하나를 좁은 화면용 그림과 함께 <picture>로 감싼 글자. <img> 글자는 한 글자도 바꾸지 않는다.
 * @param {string} imageTag
 * @param {NarrowFigure} narrow
 */
export function pictureHtml(imageTag, narrow) {
  return `<picture><source media="${NARROW_FIGURE_MEDIA}" srcset="${escapeAttribute(narrow.srcset)}" width="${narrow.width}" height="${narrow.height}">${imageTag}</picture>`;
}

/**
 * 마크다운 안에 적은 HTML 조각(raw 노드의 글자)에서, 좁은 화면용 그림이 옆에 있는 <img>를 <picture>로 감싼다. 바뀐 것이 없으면 null.
 * 이미 <picture>나 <source>가 든 조각은 글쓴이가 직접 고른 것이라 그대로 둔다.
 * @param {string} html
 * @param {string} publicDir
 * @param {string} [basePath]
 * @returns {string | null}
 */
export function wrapNarrowFigures(html, publicDir, basePath = siteConfig.publicBase) {
  if (!/<img\b/iu.test(html) || /<(?:picture|source)\b/iu.test(html)) {
    return null;
  }
  let changed = false;
  const result = html.replace(IMG_TAG, (tag) => {
    const src = attributeOf(tag, 'src');
    const narrow = src === null ? null : narrowFigureFor(src, publicDir, basePath);
    if (narrow === null) {
      return tag;
    }
    changed = true;
    return pictureHtml(tag, narrow);
  });
  return changed ? result : null;
}

/**
 * 저장소의 좁은 화면용 그림 목록 지문(public 아래 *.narrow.svg의 경로·가로·세로). 좁은 그림을 더하거나 지우거나 크기를 바꾸면 달라진다.
 * 플러그인 설정에 넣으면(markdown-plugins.mjs) Astro 설정 JSON이 바뀌어 콘텐츠 캐시가 비워진다 — 차시 md를 고치지 않고 그림만 더해도
 * 로컬 빌드·개발 서버에 보이게(머리말 캐시 주의). 폴더가 없으면 빈 목록의 지문.
 * @param {string} [publicDir]
 * @returns {string}
 */
export function narrowFigureFingerprint(publicDir = REPO_PUBLIC_DIR) {
  /** @type {string[]} */
  const entries = [];
  const imagesDir = path.join(publicDir, 'images');
  /** @type {string[]} */
  let names = [];
  try {
    names = fs.readdirSync(imagesDir, { recursive: true, encoding: 'utf8' });
  } catch {
    names = [];
  }
  for (const name of names) {
    if (!name.toLowerCase().endsWith(NARROW_FIGURE_SUFFIX)) {
      continue;
    }
    const size = readImageFileSize(path.join(imagesDir, name));
    entries.push(`${name.split(path.sep).join('/')}:${size ? `${size.width}x${size.height}` : '?'}`);
  }
  entries.sort();
  return `${entries.length}-${createHash('sha256').update(entries.join('\n')).digest('hex').slice(0, 12)}`;
}

/**
 * 글자 하나를 차시 번호 조각으로 나눈다. 차시 번호가 없으면 null.
 * @param {string} value
 * @returns {Child[] | null}
 */
export function splitLessonNumbers(value) {
  LESSON_NUMBER_PATTERN.lastIndex = 0;
  /** @type {Child[]} */
  const parts = [];
  let last = 0;
  for (const match of value.matchAll(LESSON_NUMBER_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) {
      parts.push({ type: 'text', value: value.slice(last, start) });
    }
    parts.push({ type: 'element', tagName: 'span', properties: { className: [NOWRAP_CLASS] }, children: [{ type: 'text', value: match[0] }] });
    last = start + match[0].length;
  }
  if (parts.length === 0) {
    return null;
  }
  if (last < value.length) {
    parts.push({ type: 'text', value: value.slice(last) });
  }
  return parts;
}

/**
 * @param {import('hast').Element} node
 */
function isNowrapSpan(node) {
  const className = node.properties?.className;
  return node.tagName === 'span' && Array.isArray(className) && className.includes(NOWRAP_CLASS);
}

/**
 * 나무를 돌며 그림 크기·좁은 화면용 그림과 차시 번호를 다듬는다.
 * @param {Parent} parent
 * @param {{ publicDir: string, basePath: string, insideSkip: boolean, narrowFigures: boolean }} state
 */
function polish(parent, state) {
  const children = parent.children;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (!child) {
      continue;
    }
    // 마크다운 안에 적은 HTML 조각(<figure><img …>)은 rehype-raw가 뒤에서 풀기 전이라 글자 그대로다(머리말 "어디서 도나")
    if (child.type === 'raw') {
      const wrapped = state.narrowFigures ? wrapNarrowFigures(child.value, state.publicDir, state.basePath) : null;
      if (wrapped !== null) {
        child.value = wrapped;
      }
      continue;
    }
    if (child.type === 'element') {
      if (child.tagName === 'img') {
        addImageSize(child, state.publicDir, state.basePath);
      }
      const skip = state.insideSkip || SKIP_TEXT_INSIDE.has(child.tagName) || isNowrapSpan(child);
      polish(child, { ...state, insideSkip: skip });
      continue;
    }
    if (child.type === 'text' && !state.insideSkip) {
      const parts = splitLessonNumbers(child.value);
      if (parts !== null) {
        children.splice(index, 1, ...parts);
        index += parts.length - 1;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 닫는 따옴표 바로잡기(머리말 4번 — 판 1.2.0)
// ─────────────────────────────────────────────────────────────

/** 여는 따옴표 → 닫는 따옴표 */
const CLOSING_QUOTE_OF = new Map([
  ['“', '”'],
  ['‘', '’'],
]);

/**
 * 이 글자 바로 뒤의 여는 따옴표는 바르다: 빈칸, 여는 괄호·따옴표, 줄표·하이픈, 빗금, 별표(굵게가 되지 못하고 글자로 남은 `**` — 차시 틀 검사
 * md-bold가 따로 알린다)
 */
const OPENING_QUOTE_CONTEXT = /[\s([{<“‘「『《〈—–\-/*]/u;

/** 블록 안에서 앞 글자를 이어 보는 인라인 요소(굵게·링크·용어 등). 이 밖의 요소는 블록 경계로 본다(그 안과 뒤는 맨 앞처럼) */
const QUOTE_INLINE_TAGS = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'data', 'del', 'dfn', 'em', 'glossary-term', 'i', 'ins', 'mark', 'q', 's', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u']);

/** 글자를 바꾸지 않고 낱말 하나로 보는 인라인 코드 요소(smartypants도 인라인 코드를 낱말 글자로 이어 본다) */
const QUOTE_CODE_TAGS = new Set(['code', 'kbd', 'samp', 'var']);

/** 앞 글자 대신 쓰는 낱말 글자(인라인 코드 뒤) */
const WORD_PLACEHOLDER = 'A';

/**
 * 글 하나의 여는 따옴표 가운데 앞 글자가 여는 자리가 아닌 것을 닫는 따옴표로 바꾼다. state.prev는 블록 안 앞 글자(null = 블록 맨 앞)이고,
 * 바꾼 글자로 이어 간다(‘종료‘“를 → ’ 다음의 “도 닫는 쪽).
 * @param {string} value
 * @param {{ prev: string | null, fixed: number }} state
 * @returns {string}
 */
export function fixClosingQuotesInText(value, state) {
  let out = '';
  for (const char of value) {
    let next = char;
    const closing = CLOSING_QUOTE_OF.get(char);
    if (closing !== undefined && state.prev !== null && !OPENING_QUOTE_CONTEXT.test(state.prev)) {
      next = closing;
      state.fixed += 1;
    }
    out += next;
    state.prev = next;
  }
  return out;
}

/**
 * 나무를 돌며 닫는 따옴표를 바로잡는다(머리말 4번). 바꾼 수를 돌려준다.
 * @param {Parent} parent
 * @param {{ prev: string | null, fixed: number }} state
 */
function fixClosingQuotes(parent, state) {
  for (const child of parent.children) {
    if (child.type === 'text') {
      child.value = fixClosingQuotesInText(child.value, state);
      continue;
    }
    if (child.type === 'element') {
      if (QUOTE_CODE_TAGS.has(child.tagName)) {
        state.prev = WORD_PLACEHOLDER;
        continue;
      }
      if (QUOTE_INLINE_TAGS.has(child.tagName)) {
        fixClosingQuotes(child, state);
        continue;
      }
      // 블록(문단·제목·목록 항목·표 칸 …)이나 모르는 요소: 그 안은 맨 앞부터, 그 뒤도 맨 앞처럼. 코드·스크립트 안은 보지 않는다.
      if (!SKIP_TEXT_INSIDE.has(child.tagName)) {
        const inner = { prev: null, fixed: 0 };
        fixClosingQuotes(child, inner);
        state.fixed += inner.fixed;
      }
      state.prev = null;
      continue;
    }
    if (child.type === 'raw') {
      // 마크다운 안 HTML 조각 — smartypants가 보지 않는 글이라 바로 뒤는 맨 앞처럼(바꾸지 않는 쪽)
      state.prev = null;
    }
  }
  return state.fixed;
}

/**
 * rehype 플러그인(unified 규약: 설정을 받아 변환 함수를 돌려준다).
 * @param {RehypeLessonPolishOptions} [options]
 * @returns {(tree: import('hast').Root, file: import('vfile').VFile) => void}
 */
export default function rehypeLessonPolish(options = {}) {
  const basePath = options.basePath ?? siteConfig.publicBase;
  const narrowFigures = options.narrowFigures !== false;
  const closingQuotes = options.closingQuotes !== false;
  return function transform(tree, file) {
    const publicDir = options.publicDir ?? publicDirFor(file?.path, file?.cwd);
    if (closingQuotes) {
      fixClosingQuotes(tree, { prev: null, fixed: 0 });
    }
    polish(tree, { publicDir, basePath, insideSkip: false, narrowFigures });
  };
}
