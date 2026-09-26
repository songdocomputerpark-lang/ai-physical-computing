// 빌드 뒤 서비스 워커(dist/sw.js)를 만든다 — PLAN §5.3 PD-11, §8.2 P2-05.
//
// 하는 일
//   1. 만들어진 사이트(dist/)의 **홈 페이지가 받는 파일**을 읽어 "공통 레이아웃 셸" 목록을 정한다(PD-11: 사전 캐시는 셸만).
//      홈 페이지의 <link rel="stylesheet">·<script src>·<link rel="modulepreload">에서 같은 사이트 _astro/ 파일만 고르고,
//      글꼴 CSS와 파비콘을 더한다. Pyodide·휠·MediaPipe WASM·모델·실습실 청크는 넣지 않는다(실제로 쓸 때 받아 캐시한다).
//   2. workbox-build의 getManifest()로 그 목록의 revision(해시 이름 파일은 null)과 크기를 얻는다.
//      (사전 캐시 목록만 만들고 Workbox 실행 코드는 배포물에 넣지 않는다 — 서비스 워커 논리는 src/sw/sw.js 한 파일이다.)
//   3. 예산을 확인한다: 파일 하나 PRECACHE_MAX_FILE_BYTES, 전체 PRECACHE_BUDGET_BYTES(src/lab/loader/constants.ts). 넘으면 오류로 멈춘다.
//   4. src/sw/sw.js의 `__APC_SW_CONFIG__` 자리를 설정 JSON으로 바꿔 <dir>/sw.js로 쓴다. 설정에는 캐시 이름·용량 한도·시간·메시지 이름과
//      Pyodide 파일 표(이름 → 원본 크기)가 들어간다. 설정이 바뀌면 sw.js 내용이 바뀌므로 브라우저가 새 판을 알아채고 다시 설치한다.
//
// 쓰는 법
//   node scripts/build-sw.mjs                 빌드 결과 폴더(환경 변수 APC_OUT_DIR, 기본 dist/)를 읽고 그 안에 sw.js를 만든다(npm run build의 postbuild에서 부른다)
//   node scripts/build-sw.mjs --dir <폴더>     다른 폴더의 빌드 결과에 대고 만든다(병렬 제작 검증용)
//   사이트 하위 경로(설정의 base)는 이번 빌드와 같은 값(환경 변수 APC_BASE — src/config/site.ts)을 src/lib/url.ts의 BASE_PATH로 읽는다.
//   node scripts/build-sw.mjs --dry           만들지 않고 목록·크기만 보여 준다
//   node scripts/build-sw.mjs --offline       오프라인 배포판용(scripts/build-offline.mjs가 부른다 — PLAN §5.6): 설정에 offline: true를 넣고
//                                             Pyodide 표를 오프라인 표(예비본 7개 + 오프라인판에서만 더 넣는 휠)로 새긴다.
//                                             서비스 워커는 그 설정을 보고 Pyodide 파일을 같은 사이트에서만 받는다(src/sw/sw.js 머리말).
//                                             이 선택이 없으면 설정은 전과 한 글자도 다르지 않다(온라인 사이트 그대로).
//
// 이 파일의 함수는 tests/unit/loading/build-sw.test.ts가 직접 불러 검사한다(순수 함수 부분).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getManifest } from 'workbox-build';
import { resolveBuildSettings } from '../src/config/site.ts';
import {
  ASSETS_CACHE,
  ASSETS_CACHE_MAX_ENTRIES,
  CACHE_PREFIX,
  CDN_DOWN_TTL_MS,
  FONTS_CACHE,
  PAGES_CACHE,
  PAGES_CACHE_MAX_ENTRIES,
  PAGE_NETWORK_TIMEOUT_MS,
  PRECACHE_BUDGET_BYTES,
  PRECACHE_MAX_FILE_BYTES,
  PRECACHE_NAME,
  PYODIDE_CACHE_LIMIT_BYTES,
  PYODIDE_CACHE_MAX_FILE_BYTES,
  PYODIDE_STALL_MS,
  SEARCH_CACHE,
  SEARCH_CACHE_MAX_ENTRIES,
  STATIC_CACHE,
  STATIC_CACHE_MAX_ENTRIES,
  SW_CONFIG_PLACEHOLDER,
  SW_MESSAGE,
  SW_SCRIPT_NAME,
  VENDOR_CACHE,
  VENDOR_CACHE_LIMIT_BYTES,
  pyodideCacheName,
} from '../src/lab/loader/constants.ts';
import { PYODIDE_VERSION, pyodideFileTable } from '../src/lab/loader/pyodide-files.ts';
import { PYODIDE_CDN_INDEX_URL, PYODIDE_SITE_INDEX_PATH } from '../src/lab/runtime/config.ts';
import { BASE_PATH } from '../src/lib/url.ts';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const SW_SOURCE = path.join(rootDir, 'src', 'sw', 'sw.js');

/**
 * 사전 캐시에 늘 더하는 파일(있을 때만). 홈 페이지 HTML 자신을 넣어 두면 **한 번도 안 열어 본 주소를 오프라인에서 열었을 때**
 * 맨 홈으로 안내할 수 있다(src/sw/sw.js의 navigate 예비 응답). 글꼴 woff2 조각(92개·3.1MB)은 넣지 않는다:
 * PD-11 "셸만, 수백 KB 이하"와 GitHub Pages max-age=600 재검증 비용을 함께 본 결정(PROGRESS 다음 할 일 4번) —
 * @font-face 규칙이 든 CSS만 넣고, 실제로 쓰는 조각은 런타임 캐시(fonts, 캐시 우선)에 들어간다.
 */
const EXTRA_SHELL_FILES = ['index.html'];

/** 사전 캐시에 넣어도 되는 확장자(글꼴 조각 woff2는 일부러 뺀다) */
const SHELL_EXTENSIONS = /\.(?:css|js|mjs|svg|ico|png|webmanifest)$/u;

/**
 * 홈 페이지 HTML에서 같은 사이트 자산 주소를 뽑는다(공통 레이아웃 셸 = 어느 쪽에서나 쓰는 CSS·JS·글꼴 규칙·아이콘).
 * 스타일시트·모듈 스크립트·미리 받기·아이콘 링크만 본다(그림·링크된 페이지는 넣지 않는다).
 * 돌려주는 값은 사이트 뿌리 기준 상대 경로(예: '_astro/index.CxYz.css')다.
 */
export function shellAssetsFromHtml(html, basePath) {
  const found = new Set();
  for (const match of html.matchAll(/<(link|script)\b([^>]*)>/giu)) {
    const [, tag, attributes] = match;
    const attribute = (name) => new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'iu').exec(attributes)?.[1] ?? '';
    const rel = attribute('rel').toLowerCase();
    const href = tag.toLowerCase() === 'script' ? attribute('src') : attribute('href');
    if (!href || !href.startsWith(basePath)) {
      continue;
    }
    if (tag.toLowerCase() === 'link' && !/\b(?:stylesheet|icon|modulepreload|preload)\b/u.test(rel)) {
      continue;
    }
    const rest = href.slice(basePath.length).split('?')[0].split('#')[0];
    if (rest !== '' && SHELL_EXTENSIONS.test(rest)) {
      found.add(rest);
    }
  }
  return [...found].sort();
}

/** 예산 검사. 넘는 파일·전체 크기를 문제 목록으로 돌려준다(빈 목록이면 통과). */
export function checkPrecacheBudget(entries, limits = { maxFileBytes: PRECACHE_MAX_FILE_BYTES, budgetBytes: PRECACHE_BUDGET_BYTES }) {
  const problems = [];
  let total = 0;
  for (const entry of entries) {
    total += entry.size;
    if (entry.size > limits.maxFileBytes) {
      problems.push(`${entry.url}이(가) 파일 하나 상한(${Math.round(limits.maxFileBytes / 1024)}KB)을 넘어요: ${Math.round(entry.size / 1024)}KB`);
    }
  }
  if (total > limits.budgetBytes) {
    problems.push(`사전 캐시 전체가 예산(${Math.round(limits.budgetBytes / 1024)}KB)을 넘어요: ${Math.round(total / 1024)}KB (PD-11은 셸만 미리 받아요)`);
  }
  return { problems, total };
}

/**
 * 서비스 워커에 새겨 넣을 설정. buildId가 바뀌면 브라우저가 새 판으로 본다.
 * @param {{ url: string, revision: string | null }[]} precache
 * @param {{ offline?: boolean }} [options] offline: 오프라인 배포판(설정에 offline: true, Pyodide 표는 오프라인 표). 없으면 온라인 사이트 설정 그대로.
 */
export function buildConfig(precache, options = {}) {
  const offline = options.offline === true;
  const files = pyodideFileTable(offline);
  const sizes = {};
  const hashes = {};
  for (const file of files) {
    sizes[file.name] = file.size;
    // 크기만으로는 "다른 파일"을 못 걸러낸다. 학생 브라우저가 실행하는 코드(pyodide.asm.mjs 등)라서
    // 빌드 스크립트와 같은 SHA-256을 서비스 워커에도 새겨 넣는다(2026-09-17 검토 반영, PLAN §5.4).
    hashes[file.name] = file.sha256;
  }
  const config = {
    buildId: '',
    base: BASE_PATH,
    cachePrefix: CACHE_PREFIX,
    caches: {
      precache: PRECACHE_NAME,
      pages: PAGES_CACHE,
      search: SEARCH_CACHE,
      assets: ASSETS_CACHE,
      fonts: FONTS_CACHE,
      vendor: VENDOR_CACHE,
      static: STATIC_CACHE,
    },
    limits: {
      pyodideCacheBytes: PYODIDE_CACHE_LIMIT_BYTES,
      pyodideMaxFileBytes: PYODIDE_CACHE_MAX_FILE_BYTES,
      pagesMaxEntries: PAGES_CACHE_MAX_ENTRIES,
      searchMaxEntries: SEARCH_CACHE_MAX_ENTRIES,
      assetsMaxEntries: ASSETS_CACHE_MAX_ENTRIES,
      staticMaxEntries: STATIC_CACHE_MAX_ENTRIES,
      vendorCacheBytes: VENDOR_CACHE_LIMIT_BYTES,
    },
    timing: {
      stallMs: PYODIDE_STALL_MS,
      cdnDownTtlMs: CDN_DOWN_TTL_MS,
      pageTimeoutMs: PAGE_NETWORK_TIMEOUT_MS,
    },
    messages: { ...SW_MESSAGE },
    precache,
    pyodide: {
      version: PYODIDE_VERSION,
      cdnIndex: PYODIDE_CDN_INDEX_URL,
      sitePath: PYODIDE_SITE_INDEX_PATH,
      cacheName: pyodideCacheName(PYODIDE_VERSION),
      sizes,
      hashes,
      // 용량 정리 때 마지막까지 남기는 파일(파이썬 엔진 코어) — 휠부터 지운다.
      keepPaths: files.filter((file) => file.kind === 'core').map((file) => `${PYODIDE_SITE_INDEX_PATH}${file.name}`),
    },
  };
  if (offline) {
    // 온라인 설정에는 이 칸을 넣지 않는다 — 넣으면 온라인 sw.js의 내용·판 번호가 까닭 없이 바뀐다.
    config.offline = true;
  }
  config.buildId = crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 12);
  return config;
}

/**
 * 원본 sw.js의 설정 자리를 JSON으로 바꾼다.
 * 머리말 설명에도 같은 글자가 나오므로 **대입문 한 줄**만 정확히 바꾼다(글자만 바꾸면 주석이 먼저 바뀐다 — 2026-09-16 단위 테스트가 잡음).
 */
export function renderServiceWorker(source, config) {
  const assignment = `const CONFIG = ${SW_CONFIG_PLACEHOLDER};`;
  if (!source.includes(assignment)) {
    throw new Error(`src/sw/sw.js에 "${assignment}" 줄이 없어요.`);
  }
  // </script> 같은 글자가 JSON 안에 있어도 안전하게(서비스 워커는 HTML 안에 들어가지 않지만 습관을 지킨다).
  const json = JSON.stringify(config)
    .replace(/</gu, '\\u003c')
    .replace(/[\u2028\u2029]/gu, (character) => '\\u' + character.charCodeAt(0).toString(16));
  return source.replace(assignment, () => `const CONFIG = ${json};`);
}

async function main() {
  const args = process.argv.slice(2);
  const dirIndex = args.indexOf('--dir');
  const dir = path.resolve(rootDir, dirIndex >= 0 ? args[dirIndex + 1] : resolveBuildSettings().outDir);
  const dry = args.includes('--dry');
  const offline = args.includes('--offline');
  const indexHtml = path.join(dir, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    throw new Error(`빌드 결과가 없어요: ${path.relative(rootDir, indexHtml)} — 먼저 npm run build를 실행해요.`);
  }

  const html = fs.readFileSync(indexHtml, 'utf8');
  const shell = shellAssetsFromHtml(html, BASE_PATH);
  const extras = EXTRA_SHELL_FILES.filter((file) => fs.existsSync(path.join(dir, file)));
  const patterns = [...shell, ...extras].filter((file) => {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) {
      return false;
    }
    return fs.statSync(full).size <= PRECACHE_MAX_FILE_BYTES;
  });
  const skipped = [...shell, ...extras].filter((file) => !patterns.includes(file));

  // getManifest의 설정 이름은 workbox-build 7.4.1이 함께 배포하는 스키마(node_modules/workbox-build/build/schema/GetManifestOptions.json)로 확인했다:
  // additionalManifestEntries, dontCacheBustURLsMatching, manifestTransforms, maximumFileSizeToCacheInBytes, modifyURLPrefix,
  // globFollow, globIgnores, globPatterns, templatedURLs, globDirectory. (옛 판의 globStrict는 없어져 넣으면 오류가 난다.)
  const { manifestEntries, warnings, size } = await getManifest({
    globDirectory: dir,
    globPatterns: patterns.length > 0 ? patterns : ['__none__'],
    // 파일 하나 상한(PD-11). 넘는 파일은 목록에서 빠지고 warnings에 이유가 담긴다.
    maximumFileSizeToCacheInBytes: PRECACHE_MAX_FILE_BYTES,
    // 해시 이름 파일(_astro/)은 주소가 곧 판이라 revision을 붙이지 않는다.
    dontCacheBustURLsMatching: /^_astro\//u,
  });
  for (const warning of warnings) {
    console.warn(`[서비스 워커] ${warning}`);
  }

  // 홈 페이지는 주소가 폴더 꼴(trailingSlash: 'always')이라 index.html 대신 그 주소로 넣는다 — 오프라인 navigate 예비 응답이 찾을 수 있게.
  const entries = manifestEntries.map((entry) => ({
    url: `${BASE_PATH}${entry.url === 'index.html' ? '' : entry.url}`,
    revision: entry.revision ?? null,
    size: fs.statSync(path.join(dir, entry.url)).size,
  }));
  const { problems, total } = checkPrecacheBudget(entries);
  if (problems.length > 0) {
    throw new Error(`사전 캐시 예산을 넘었어요(PD-11).\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
  }

  const config = buildConfig(
    entries.map(({ url, revision }) => ({ url, revision })),
    { offline },
  );
  const output = renderServiceWorker(fs.readFileSync(SW_SOURCE, 'utf8'), config);
  const outPath = path.join(dir, SW_SCRIPT_NAME);
  if (!dry) {
    fs.writeFileSync(outPath, output, 'utf8');
  }
  console.log(
    `[서비스 워커] ${dry ? '(시험) ' : ''}${offline ? '(오프라인 배포판) ' : ''}${path.relative(rootDir, outPath)} — 셸 ${entries.length}개 ${Math.round(total / 1024)}KB ` +
      `(예산 ${Math.round(PRECACHE_BUDGET_BYTES / 1024)}KB, workbox 합계 ${Math.round(size / 1024)}KB), 판 ${config.buildId}`,
  );
  for (const entry of entries) {
    console.log(`  · ${entry.url} ${Math.round(entry.size / 1024)}KB${entry.revision ? ` (revision ${entry.revision.slice(0, 8)})` : ''}`);
  }
  if (skipped.length > 0) {
    console.log(`  (상한을 넘어 빼놓음: ${skipped.join(', ')})`);
  }
}

// 다른 파일이 import할 때는 돌지 않게 한다(단위 테스트가 위 함수만 쓴다).
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`[서비스 워커] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
