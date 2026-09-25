// @ts-check
import { unified } from '@astrojs/markdown-remark';
import { defineConfig } from 'astro/config';
import { resolveBuildSettings, siteConfig } from './src/config/site.ts';
import { clientBundleLicensePlugin } from './scripts/lib/bundle-license.mjs';
import { esptoolStubGuardPlugin } from './scripts/lib/esptool-stub-guard.mjs';
import { rehypePlugins, remarkPlugins } from './src/lib/markdown-plugins.mjs';

// 주소와 하위 경로는 src/config/site.ts 한 곳에서만 정한다(DECISIONS C7).
// 빌드 환경 변수 APC_BASE(하위 경로 — 오프라인 배포판은 '/')·APC_OUT_DIR(결과 폴더, 기본 dist)도 site.ts가 읽는다(그 머리말).
const build = resolveBuildSettings();

export default defineConfig({
  // GitHub Pages 도메인. 실제 사이트 주소는 site + base다.
  site: siteConfig.origin,
  // 프로젝트 사이트라서 저장소 이름이 하위 경로가 된다. 빌드된 자원·링크 앞에 붙는다.
  // site.ts는 사이트 뿌리를 ''로 적고 Astro는 '/'로 받는다(APC_BASE=/ — 오프라인 배포판).
  base: build.base === '' ? '/' : build.base,
  // 빌드 결과 폴더(APC_OUT_DIR, 기본 dist). Astro는 빌드 전에 이 폴더를 비운다 — site.ts가 dist·dist-이름·.cache/ 아래만 받는다.
  outDir: build.outDir,
  // 서버 없이 미리 만든 파일만 배포한다(절대 원칙 2).
  output: 'static',
  // 끝 슬래시 정책: 내부 주소는 항상 /로 끝낸다. 근거는 네 가지다.
  // 1) build.format 'directory'는 start/index.html을 만들고, GitHub Pages는 /start를 /start/로
  //    301 이동시킨다(2026-09-15 GitHub Pages 응답으로 확인). 처음부터 /를 붙이면 이동이 한 번 줄어든다.
  // 2) 'always'면 import.meta.env.BASE_URL이 '/ai-physical-computing/'처럼 /로 끝나서
  //    `${import.meta.env.BASE_URL}start/`처럼 이어 붙여도 주소가 깨지지 않는다.
  // 3) 개발 서버가 /로 끝나지 않는 주소를 경고 페이지로 보여 줘 링크 실수를 일찍 찾는다.
  // 4) PLAN §2.1 사이트 지도의 주소가 모두 /로 끝난다.
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  markdown: {
    // Astro 7의 기본 처리기(Sätteri) 대신 unified 처리기(@astrojs/markdown-remark)를 쓴다.
    // 상자 문법(:::교사용)과 용어 표시 문법(:용어[픽셀])에 remark 플러그인이 필요하기 때문이다(PLAN §3.1·§3.2, PD-10).
    // 플러그인 목록·순서는 src/lib/markdown-plugins.mjs 한 곳(차시 틀 검사 npm run check:lessons도 같은 목록을 쓴다):
    //   remark: remarkDirective(: 문법 읽기) → remarkGlossary(:용어[…]) → remarkBoxes(:::상자, 처리 안 된 지시문을 원래 글자로 되돌림)
    //   rehype: 출력 다듬기 src/lib/rehype-lesson-polish.mjs(Phase 6 구역 A 자리 — 판 번호를 올리면 콘텐츠 캐시가 비워진다)
    processor: unified({ remarkPlugins, rehypePlugins }),
    // 마크다운 코드 블록 색(Shiki 테마). Astro 기본값 github-dark는 주석 색(#6A737D)이 바탕(#24292E) 위에서 대비 3.05:1이라
    // WCAG AA(글자 4.5:1)에 못 미친다. github-light-high-contrast는 코드 글자색이 모두 흰 바탕(#FFFFFF) 위에서 5.04:1 이상이다
    // (가장 낮은 주석 #66707B 5.04:1, 기본 글자 #0E1116 18.91:1 — 2026-09-16 @shikijs/themes 4.4.3의 색으로 WCAG 상대 휘도 공식 계산).
    // 바탕이 페이지와 같은 흰색이라 코드 블록 테두리는 src/styles/global.css의 .prose pre가 그린다.
    shikiConfig: {
      theme: 'github-light-high-contrast',
    },
  },
  vite: {
    // 브라우저로 가는 코드에는 환경 변수가 없어서, 이번 빌드의 base를 글자로 새겨 넣는다(src/config/site.ts의 __APC_BASE__).
    // 그래서 withBase()·서비스 워커 등록·Pyodide 예비본 주소가 APC_BASE를 따른다(워커는 주소를 화면 쪽에서 받는다).
    define: {
      __APC_BASE__: JSON.stringify(build.base),
    },
    // 병렬 제작: 한 작업 폴더에 개발 서버가 여럿이면 node_modules/.vite/deps를 함께 써서 504(Outdated Optimize Dep)가 되풀이된다.
    // APC_VITE_CACHE_DIR을 서버마다 다르게 주면 미리 묶기 폴더가 나뉜다(src/lab/README.md 5.1). 값이 없으면 지금과 같다.
    ...(process.env.APC_VITE_CACHE_DIR ? { cacheDir: process.env.APC_VITE_CACHE_DIR } : {}),
    // 배포 번들(브라우저로 가는 코드)에 실제로 들어간 npm 패키지 목록을 dist/bundle-licenses.json으로 남긴다.
    // 빌드 뒤 scripts/check-sources.mjs --bundle(npm의 postbuild)이 sources.yaml과 대조하고 지운다(PLAN §8.1 P1-04).
    // client 환경에만 켜는 이유는 scripts/lib/bundle-license.mjs에 적었다.
    // esptool-js 안의 플래셔 스텁(GPL-2.0-or-later)은 싣지 않는다(PLAN PD-38): 스텁 JSON import를 "싣지 않아요" 오류 모듈로 바꾼다.
    plugins: [clientBundleLicensePlugin(), esptoolStubGuardPlugin()],
    // 의존성 미리 묶기(개발 서버)는 위 플러그인을 거치지 않으므로 esptool-js는 빼서 빌드와 같게 돌게 한다.
    // esptool-js가 쓰는 CommonJS 패키지 atob-lite만 따로 미리 묶는다(ESM인 pako·tslib는 그대로 된다). 근거는 scripts/lib/esptool-stub-guard.mjs 머리말.
    optimizeDeps: {
      exclude: ['esptool-js'],
      include: ['esptool-js > atob-lite'],
    },
    // 파이썬 워커(src/lab/runtime/worker.ts)는 모듈 워커다(Pyodide 314는 클래식 워커를 지원하지 않는다, PLAN §4.4).
    // Vite 기본 워커 형식(iife)은 워커 안의 import()를 다루지 못하므로 ES 모듈로 만든다.
    // 워커는 Pyodide를 실행 중에 import(주소)로 받는다(주소는 src/lab/runtime/config.ts 한 곳).
    worker: {
      format: 'es',
    },
  },
});
