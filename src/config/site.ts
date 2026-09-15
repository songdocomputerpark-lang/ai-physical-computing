/**
 * 사이트 설정 한 곳(PLAN §8.1 P1-02).
 * 사이트 이름·주소·저작자·라이선스를 바꿀 때는 이 파일만 고친다.
 * astro.config.mjs, 페이지, 테스트가 모두 이 값을 읽는다.
 *
 * astro.config.mjs를 거쳐 Node.js가 이 파일을 직접 읽을 수 있으므로,
 * 타입 표기만 지우면 그대로 도는 문법만 쓴다(enum·namespace 금지, JSON은 `with { type: 'json' }`로 불러오기).
 */
import packageJson from '../../package.json' with { type: 'json' };

export const siteConfig = {
  /** 사이트 이름. 가칭이다(DECISIONS C4). */
  name: 'AI 피지컬 컴퓨팅 오픈랩',
  /** 검색 결과와 공유 미리보기에 보이는 짧은 설명 */
  description:
    '프로그램을 설치하지 않고 브라우저만으로 인공지능(영상 처리)과 피지컬 컴퓨팅(ESP32 보드)을 배우고 실습하는 무료 교육 사이트',
  /** 저작자 표기(DECISIONS C2) */
  author: '박상진·김석전',
  /** GitHub Pages 도메인(DECISIONS C7) */
  origin: 'https://songdocomputerpark-lang.github.io',
  /**
   * 프로젝트 사이트 하위 경로(DECISIONS C7). 끝에 /를 붙이지 않는다.
   * 페이지 안 링크에는 끝에 /가 붙는 import.meta.env.BASE_URL을 쓴다(astro.config.mjs의 trailingSlash 참고).
   */
  base: '/ai-physical-computing',
  /** 공개 저장소 */
  repositoryUrl: 'https://github.com/songdocomputerpark-lang/ai-physical-computing',
  /** 사이트 버전. package.json의 version을 그대로 쓴다. */
  version: packageJson.version,
  /** 라이선스(DECISIONS C3, 적용 범위는 PLAN PD-26). LICENSE 파일들은 P1-10에서 만든다. */
  license: {
    software: {
      spdx: 'MIT',
      shortName: 'MIT',
      name: 'MIT 라이선스',
      url: 'https://spdx.org/licenses/MIT.html',
      appliesTo: '사이트 소프트웨어(src/·scripts/·tests/와 사이트가 새로 쓴 소프트웨어)',
    },
    content: {
      spdx: 'CC-BY-NC-SA-4.0',
      shortName: 'CC BY-NC-SA 4.0',
      name: '크리에이티브 커먼즈 저작자표시-비영리-동일조건변경허락 4.0 국제',
      url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ko',
      appliesTo: '학습 자료와 예제(content/·examples/, 원본 자료에서 옮긴 예제 코드 포함)와 자체 제작 그림',
    },
    exclusion:
      '다른 저작자가 만든 자료와 공개 라이브러리(출처와 라이선스 페이지에 따로 표시)는 이 두 라이선스에서 빠지고 원래 조건을 따릅니다.',
  },
} as const;

export type SiteConfig = typeof siteConfig;
