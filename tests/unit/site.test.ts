import { describe, expect, it } from 'vitest';
import packageJson from '../../package.json' with { type: 'json' };
import astroConfig from '../../astro.config.mjs';
import { resolveBuildSettings, siteConfig } from '../../src/config/site.ts';

describe('사이트 설정 한 곳(src/config/site.ts)', () => {
  it('사이트 이름이 "AI 피지컬 컴퓨팅 오픈랩"이다', () => {
    expect(siteConfig.name).toBe('AI 피지컬 컴퓨팅 오픈랩');
  });

  it('GitHub Pages 프로젝트 사이트 주소(도메인과 base)가 맞다', () => {
    expect(siteConfig.origin).toBe('https://songdocomputerpark-lang.github.io');
    expect(siteConfig.base).toBe('/ai-physical-computing');
  });

  it('astro.config.mjs가 site.ts의 도메인·base를 그대로 쓰고 끝 슬래시를 항상 붙인다', () => {
    expect(astroConfig.site).toBe(siteConfig.origin);
    // site.ts는 사이트 뿌리를 ''로, Astro는 '/'로 적는다(APC_BASE=/ — 오프라인 배포판).
    expect(astroConfig.base).toBe(siteConfig.base === '' ? '/' : siteConfig.base);
    expect(astroConfig.trailingSlash).toBe('always');
  });

  it('astro.config.mjs가 빌드 결과 폴더(APC_OUT_DIR)와 브라우저용 base(__APC_BASE__)를 site.ts에서 받는다', () => {
    expect(astroConfig.outDir).toBe(resolveBuildSettings().outDir);
    expect(astroConfig.vite?.define?.__APC_BASE__).toBe(JSON.stringify(siteConfig.base));
  });

  it('버전은 package.json에서 가져온다', () => {
    expect(siteConfig.version).toBe(packageJson.version);
  });
});
