// 사이트 검색 색인 만들기(npm run build의 postbuild, npm run search:index) — Phase 6 병렬 제작 준비(2026-09-26).
//
// 하는 일
//   1. Pagefind 1.5.2 명령(`pagefind --site <빌드 결과 폴더>`)을 돌려 <빌드 결과 폴더>/pagefind/에 검색 색인을 만든다.
//   2. 쓰지 않는 Pagefind 화면 파일을 지운다(scripts/prune-pagefind.mjs — 까닭은 그 머리말).
// 빌드 결과 폴더는 이번 빌드와 같은 환경 변수 APC_OUT_DIR(기본 dist — src/config/site.ts)를 따른다.
// 전에는 package.json에 `pagefind --site dist`로 적었는데, 폴더를 환경 변수로 바꿀 수 있게(오프라인 배포판) 이 파일로 옮겼다.
//
// Pagefind npm 패키지의 실행 도우미(node_modules/pagefind/lib/runner/bin.cjs)를 지금 Node로 부른다 — Windows에서도 셸(.cmd) 없이 돈다.
// (패키지의 exports가 이 경로를 내보내지 않아 require.resolve 대신 저장소의 node_modules 경로를 쓴다. pagefind는 직접 의존성이라 늘 이 자리다.)
//
// 쓰는 법
//   node scripts/search-index.mjs              빌드 결과 폴더(APC_OUT_DIR, 기본 dist)
//   node scripts/search-index.mjs --dir <폴더>  다른 폴더(저장소 뿌리 기준 또는 절대 경로)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBuildSettings } from '../src/config/site.ts';
import { prunePagefindAndReport } from './prune-pagefind.mjs';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const PAGEFIND_RUNNER = path.join(rootDir, 'node_modules', 'pagefind', 'lib', 'runner', 'bin.cjs');

const args = process.argv.slice(2);
const dirIndex = args.indexOf('--dir');
const outDir = dirIndex >= 0 && args[dirIndex + 1] ? args[dirIndex + 1] : resolveBuildSettings().outDir;
const siteDir = path.resolve(rootDir, outDir);
const label = path.relative(rootDir, siteDir).split(path.sep).join('/') || siteDir;

if (!fs.existsSync(path.join(siteDir, 'index.html'))) {
  console.error(`[검색 색인] 빌드 결과를 찾지 못했어요(${label}/index.html 없음). 먼저 npm run build를 실행해요.`);
  process.exit(1);
}
if (!fs.existsSync(PAGEFIND_RUNNER)) {
  console.error('[검색 색인] Pagefind를 찾지 못했어요(node_modules/pagefind). npm ci로 의존성을 먼저 설치해요.');
  process.exit(1);
}

// 저장소 뿌리에서 돌린다 — Pagefind가 설정 파일(pagefind.yml 등)을 찾는 자리가 package.json의 옛 명령과 같게.
const result = spawnSync(process.execPath, [PAGEFIND_RUNNER, '--site', label], { cwd: rootDir, stdio: 'inherit', windowsHide: true });
if (result.error) {
  console.error(`[검색 색인] Pagefind를 실행하지 못했어요: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(`[검색 색인] Pagefind가 실패했어요(종료 코드 ${result.status ?? '없음'}).`);
  process.exit(result.status ?? 1);
}
if (!prunePagefindAndReport(rootDir, path.relative(rootDir, siteDir))) {
  process.exit(1);
}
