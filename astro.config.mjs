// @ts-check
import { defineConfig } from 'astro/config';
import { siteConfig } from './src/config/site.ts';

// 주소와 하위 경로는 src/config/site.ts 한 곳에서만 정한다(DECISIONS C7).
export default defineConfig({
  // GitHub Pages 도메인. 실제 사이트 주소는 site + base다.
  site: siteConfig.origin,
  // 프로젝트 사이트라서 저장소 이름이 하위 경로가 된다. 빌드된 자원·링크 앞에 붙는다.
  base: siteConfig.base,
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
});
