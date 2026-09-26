// 사이트 검색 색인 만들기(npm run build의 postbuild, npm run search:index) — Phase 6 병렬 제작 준비(2026-09-26).
//
// 하는 일
//   1. Pagefind 1.5.2 명령(`pagefind --site <빌드 결과 폴더>`)을 돌려 <빌드 결과 폴더>/pagefind/에 검색 색인을 만든다.
//   2. 쓰지 않는 Pagefind 화면 파일을 지운다(scripts/prune-pagefind.mjs — 까닭은 그 머리말).
//   3. 검색 엔진 wasm 옆에 제3자 고지를 둔다(<빌드 결과 폴더>/pagefind/NOTICE-THIRD-PARTY.txt — 아래 끝 부분, Phase 6 P6-04 요청 C-4).
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

// 검색 엔진 wasm(wasm.*.pagefind)에는 GPL-3.0-only 크레이트 pagefind_microjson이 함께 들어 있어, 같은 폴더에 고지와 대응 소스 안내를 둔다
// (GPL-3.0 6조 d "object code 옆에 대응 소스가 어디 있는지 분명한 안내" — Phase 6 P6-04 구역 C 요청 C-4). 원문은 public/licenses/pagefind-wasm-3rd-party.txt 한 곳에서
// 복사하므로 두 벌이 어긋나지 않는다. 파일 이름을 NOTICE로 시작하게 한 것은 빌드 결과 개인정보 훑기(npm run check:repo -- --dist)가
// 고지 파일(LICENSE·NOTICE·COPYING으로 시작하는 이름)의 저작자 이메일을 건너뛰는 규칙과 맞추려는 것이다(scripts/lib/repo-check.mjs runBuildOutputCheck).
const WASM_NOTICE_SOURCE = path.join(rootDir, 'public', 'licenses', 'pagefind-wasm-3rd-party.txt');
const WASM_NOTICE_TARGET = path.join(siteDir, 'pagefind', 'NOTICE-THIRD-PARTY.txt');
try {
  fs.copyFileSync(WASM_NOTICE_SOURCE, WASM_NOTICE_TARGET);
  console.log(`[검색 색인] 검색 엔진 고지를 ${label}/pagefind/NOTICE-THIRD-PARTY.txt에 두었어요(원문 public/licenses/pagefind-wasm-3rd-party.txt).`);
} catch (error) {
  console.error(
    `[검색 색인] 검색 엔진 고지(public/licenses/pagefind-wasm-3rd-party.txt)를 ${label}/pagefind/ 폴더에 복사하지 못했어요: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
