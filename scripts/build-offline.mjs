// 오프라인 배포판 만들기(npm run build:offline) — PLAN §5.6, §8.6 P6-07. **아직 없음: Phase 6 구역 E가 이 파일을 채운다.**
//
// 이 자리는 Phase 6 병렬 제작 준비(2026-09-26)에서 package.json 명령을 먼저 걸어 두려고 만들었다(package.json은 공유 파일).
// 구역 E가 쓸 수 있게 미리 열어 둔 것
//   - 사이트 뿌리 경로: 환경 변수 APC_BASE=/ 로 빌드하면 모든 링크·자산·서비스 워커·Pyodide 예비본 주소가 사이트 뿌리(/)를 따른다
//     (src/config/site.ts 머리말 — 브라우저 번들에는 astro.config.mjs가 vite.define으로 새긴다).
//   - 결과 폴더: 환경 변수 APC_OUT_DIR(예: dist-offline 또는 .cache/offline/site). 빌드 뒤 단계(출처 번들 검사·검색 색인·서비스 워커)가
//     같은 폴더를 따른다(scripts/check-sources.mjs --bundle, scripts/search-index.mjs, scripts/build-sw.mjs). 링크 검사도 같은 환경 변수로:
//     APC_BASE=/ APC_OUT_DIR=… npm run check:links
//   - Node에서 환경 변수를 넘겨 부르면(child_process의 env) Git Bash의 경로 바꾸기(/ → C:/Program Files/Git/)를 피한다.
console.error('[오프라인 배포판] 아직 없어요 — Phase 6 구역 E(P6-07)가 scripts/build-offline.mjs를 만들고 있어요(PLAN §5.6).');
process.exitCode = 1;
