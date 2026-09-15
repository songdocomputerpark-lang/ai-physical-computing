import { defineConfig } from 'vitest/config';

// 단위 테스트(Vitest) 설정. 브라우저 테스트(Playwright)는 P1-09에서 tests/e2e/에 따로 둔다.
// 지금은 순수 TypeScript 모듈만 검사하므로 Astro의 getViteConfig()를 거치지 않는다.
// 테스트가 astro: 가상 모듈을 써야 할 때 공식 테스트 안내(https://docs.astro.build/en/guides/testing/)대로 바꾼다.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
