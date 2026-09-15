// 쓰지 않는 Pagefind 화면 파일 지우기(npm run build의 postbuild, 검색 색인을 만든 뒤에 돈다).
//
// 사이트 검색 화면은 Pagefind API(pagefind.js)로 직접 만들었으므로(src/components/search/), Pagefind가 dist/pagefind/에
// 함께 만들어 넣는 기본 화면 파일(pagefind-ui·pagefind-modular-ui·pagefind-component-ui의 .js·.css)과 강조 파일(pagefind-highlight.js)은
// 배포하지 않는다. 이 파일들에는 다른 라이브러리(Svelte, bcp-47 계열, adequate-little-templates, mark.js)가 묶여 있어
// 배포하면 sources.yaml 등록과 고지가 필요하다(2026-09-16 검토 반영). 남는 파일: pagefind.js, pagefind-worker.js,
// wasm.*.pagefind, pagefind-entry.json, *.pf_meta, index/, fragment/.
//
// 선택: --root <폴더>  다른 폴더의 dist/를 정리한다(단위 테스트용).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 지울 파일 이름(dist/pagefind/ 바로 아래) */
export const UNUSED_PAGEFIND_FILES = Object.freeze([
  'pagefind-ui.js',
  'pagefind-ui.css',
  'pagefind-modular-ui.js',
  'pagefind-modular-ui.css',
  'pagefind-component-ui.js',
  'pagefind-component-ui.css',
  'pagefind-highlight.js',
]);

/** 꼭 남아 있어야 하는 파일(없으면 검색이 안 되므로 빌드를 멈춘다) */
export const REQUIRED_PAGEFIND_FILES = Object.freeze(['pagefind.js', 'pagefind-worker.js', 'pagefind-entry.json']);

/**
 * @param {string} rootDir 저장소 뿌리
 * @returns {{ removed: string[], missing: string[] }}
 */
export function prunePagefind(rootDir) {
  const pagefindDir = path.join(rootDir, 'dist', 'pagefind');
  const missing = REQUIRED_PAGEFIND_FILES.filter((name) => !fs.existsSync(path.join(pagefindDir, name)));
  if (missing.length > 0) {
    return { removed: [], missing };
  }
  /** @type {string[]} */
  const removed = [];
  for (const name of UNUSED_PAGEFIND_FILES) {
    const filePath = path.join(pagefindDir, name);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath);
      removed.push(name);
    }
  }
  return { removed, missing: [] };
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const rootOptionIndex = args.indexOf('--root');
  const rootDir =
    rootOptionIndex >= 0 && args[rootOptionIndex + 1]
      ? path.resolve(args[rootOptionIndex + 1])
      : fileURLToPath(new URL('..', import.meta.url));
  const result = prunePagefind(rootDir);
  if (result.missing.length > 0) {
    console.error(`[검색 파일 정리] dist/pagefind/에 ${result.missing.join(', ')}이(가) 없어요. npm run build로 검색 색인을 먼저 만들었는지 확인해요.`);
    process.exitCode = 1;
  } else {
    console.log(`[검색 파일 정리] 쓰지 않는 Pagefind 화면 파일 ${result.removed.length}개를 지웠어요${result.removed.length > 0 ? `(${result.removed.join(', ')})` : ''}.`);
  }
}
