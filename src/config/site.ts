/**
 * 사이트 설정 한 곳(PLAN §8.1 P1-02).
 * 사이트 이름·주소·저작자·라이선스를 바꿀 때는 이 파일만 고친다.
 * astro.config.mjs, 페이지, 테스트가 모두 이 값을 읽는다.
 *
 * astro.config.mjs를 거쳐 Node.js가 이 파일을 직접 읽을 수 있으므로,
 * 타입 표기만 지우면 그대로 도는 문법만 쓴다(enum·namespace 금지, JSON은 `with { type: 'json' }`로 불러오기).
 */
import packageJson from '../../package.json' with { type: 'json' };

/** 공개 저장소 주소(아래 저장소 링크·이슈·라이선스 파일 주소가 이 값으로 만들어진다) */
const repositoryUrl = 'https://github.com/songdocomputerpark-lang/ai-physical-computing';

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
  repositoryUrl,
  /** 문제 알리기·질문(GitHub Issues). 바닥글과 기여·문의 페이지가 쓴다. */
  issuesUrl: `${repositoryUrl}/issues`,
  /** 사이트 버전. package.json의 version을 그대로 쓴다. */
  version: packageJson.version,
  /**
   * 라이선스(DECISIONS C3, 적용 범위는 PLAN PD-26). 예제 코드(examples/)는 운영자 결정 O13(2026-09-25)으로 MIT예요.
   * 전문은 저장소 뿌리의 LICENSE(MIT)와 LICENSE-CONTENT.md(CC BY-NC-SA 4.0)에 있다(P1-10). 바닥글이 fileUrl로 연결한다.
   */
  license: {
    software: {
      spdx: 'MIT',
      shortName: 'MIT',
      name: 'MIT 라이선스',
      url: 'https://spdx.org/licenses/MIT.html',
      /** 저장소의 라이선스 파일 */
      fileUrl: `${repositoryUrl}/blob/main/LICENSE`,
      appliesTo:
        '사이트 소프트웨어(src/·scripts/·tests/와 사이트가 새로 쓴 소프트웨어, 컴포넌트 안에 코드로 그린 그림 포함)와 실습 예제 코드(examples/ — 교과서·수업 자료에서 옮긴 코드와 사이트판 포함, third-party/ 폴더의 다른 저작자 파일 제외)',
    },
    content: {
      spdx: 'CC-BY-NC-SA-4.0',
      shortName: 'CC BY-NC-SA 4.0',
      name: '크리에이티브 커먼즈 저작자표시-비영리-동일조건변경허락 4.0 국제',
      url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.ko',
      /** 저장소의 라이선스 안내 파일 */
      fileUrl: `${repositoryUrl}/blob/main/LICENSE-CONTENT.md`,
      appliesTo: '학습 자료(content/ — 차시 본문·용어사전 등)와 그림 파일(public/images/), 교사용 자료실의 가린 편집본 교안(public/teacher/handouts/)',
    },
    /**
     * 제3자 자료 제외 문구(PD-26). 출처와 라이선스 페이지 안에서도 쓰므로 그 페이지를 가리키는 말은 넣지 않는다.
     * 바닥글은 이 문장 뒤에 출처와 라이선스 페이지 링크를 붙인다.
     */
    exclusion: '다른 저작자가 만든 자료와 공개 라이브러리는 이 두 라이선스에서 빠지고, 원래 조건을 따라요.',
  },
} as const;

export type SiteConfig = typeof siteConfig;
