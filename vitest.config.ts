import { defineConfig } from 'vitest/config';

// 단위 테스트(Vitest) 설정. 브라우저 테스트(Playwright)는 P1-09에서 tests/e2e/에 따로 둔다.
// 지금은 순수 TypeScript 모듈만 검사하므로 Astro의 getViteConfig()를 거치지 않는다.
// 테스트가 astro: 가상 모듈을 써야 할 때 공식 테스트 안내(https://docs.astro.build/en/guides/testing/)대로 바꾼다.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    /*
     * 검사 하나의 제한 시간 30초(Vitest 기본 5초). 단위 검사는 빠르기가 아니라 내용을 본다. 혼자 돌면 몇 초 안에 끝나는 검사도, 다른 프로그램이 많이 도는
     * 컴퓨터에서 npm test 전체(파일 230여 개를 여러 워커가 함께)를 돌리면 무거운 첫 준비 — jsdom으로 띄우는 Blockly(blocks/generator.test.ts),
     * 임시 git 저장소를 만드는 저장소 검사(repo-check.test.ts), 디스크를 많이 읽는 검사(repo-facets·sources-check·example-sidecar) — 가
     * 5초를 넘겨 자기 변경과 상관없이 실패했다(2026-09-30 최종 점검 TD-03, 2회 가운데 1회 재현; 먼저 8edee50이 한 파일에만 30초를 줌).
     * 더 긴 시간이 필요한 검사는 전처럼 그 검사에 따로 적는다(예: Pyodide를 띄우는 검사의 120_000·240_000).
     */
    testTimeout: 30_000,
  },
});
