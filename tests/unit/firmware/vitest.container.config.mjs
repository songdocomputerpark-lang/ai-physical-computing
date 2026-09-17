// Astro 컴포넌트를 Container API로 그리는 테스트 전용 설정(tests/unit/firmware/*.container-test.ts).
// 기본 단위 테스트 설정(vitest.config.ts)은 Astro 설정을 거치지 않아 .astro를 불러오지 못하므로 따로 둔다(Astro 공식 테스트 안내 getViteConfig).
// 실행: npx vitest run --config tests/unit/firmware/vitest.container.config.mjs
import { getViteConfig } from 'astro/config';

export default getViteConfig({
  test: {
    include: ['tests/unit/firmware/*.container-test.ts'],
  },
});
