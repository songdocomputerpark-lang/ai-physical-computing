/**
 * 사이트 설정 한 곳(PLAN §8.1 P1-02).
 * 사이트 이름·주소·저작자·라이선스를 바꿀 때는 이 파일만 고친다.
 * astro.config.mjs, 페이지, 테스트가 모두 이 값을 읽는다.
 *
 * astro.config.mjs를 거쳐 Node.js가 이 파일을 직접 읽을 수 있으므로,
 * 타입 표기만 지우면 그대로 도는 문법만 쓴다(enum·namespace 금지, JSON은 `with { type: 'json' }`로 불러오기).
 *
 * 빌드 환경 변수(Phase 6 병렬 제작 준비, 2026-09-26) — **값은 이 파일에서만 읽는다**(`resolveBuildSettings`).
 * - `APC_BASE`: 이번 빌드의 사이트 하위 경로. 없으면 공개 사이트와 같은 `/ai-physical-computing`,
 *   `/`이면 사이트 뿌리(오프라인 배포판 — PLAN §5.6, `npm run build:offline`).
 * - `APC_OUT_DIR`: 빌드 결과 폴더(저장소 뿌리 기준). 없으면 `dist`. Astro는 빌드 전에 이 폴더를 **비우므로**
 *   `dist`, `dist-이름`(예: `dist-offline`), `.cache/` 아래(예: `.cache/offline/site`)만 받는다.
 * 브라우저에는 환경 변수가 없어서, astro.config.mjs가 이번 빌드의 base를 `vite.define`으로 번들에 글자로 새겨 넣는다(`__APC_BASE__`).
 * Git Bash에서는 `/`로 시작하는 값이 Windows 경로(`C:/Program Files/Git/`)로 바뀌므로 `MSYS_NO_PATHCONV=1`을 앞에 붙인다
 * (2026-09-26 확인 — 바뀐 값은 알아보고 한국어 오류로 멈춘다).
 */
import packageJson from '../../package.json' with { type: 'json' };

/**
 * astro.config.mjs의 `vite.define`이 번들(브라우저·페이지 그리기 코드)에 새겨 넣는 이번 빌드의 base.
 * Node가 이 파일을 직접 읽을 때(astro.config.mjs·scripts·Playwright·Vitest)는 없다 — 그때는 환경 변수를 읽는다.
 */
declare const __APC_BASE__: string | undefined;

/** 공개 저장소 주소(아래 저장소 링크·이슈·라이선스 파일 주소가 이 값으로 만들어진다) */
const repositoryUrl = 'https://github.com/songdocomputerpark-lang/ai-physical-computing';

/**
 * 공개 사이트(GitHub Pages 프로젝트 사이트)의 하위 경로(DECISIONS C7). 끝에 /를 붙이지 않는다.
 * 사용자 도메인을 연결하면 여기를 ''로 바꾼다. 검색 엔진 대표 주소·공유 미리보기의 전체 주소는 늘 이 경로를 쓴다(`absoluteUrl`).
 */
const PUBLIC_BASE = '/ai-physical-computing';

/** 빌드 결과 폴더 기본값(Astro outDir 기본값, 배포 워크플로의 withastro/action이 올리는 폴더와 같다) */
export const DEFAULT_OUT_DIR = 'dist';

/** 빌드 환경 변수 이름 */
export const BUILD_ENV_NAMES = { base: 'APC_BASE', outDir: 'APC_OUT_DIR' } as const;

/** 환경 변수 모음(process.env와 같은 모양) */
export type BuildEnvironment = Readonly<Record<string, string | undefined>>;

/** 이번 빌드의 설정 */
export interface BuildSettings {
  /** 사이트 하위 경로, 끝에 / 없음. 사이트 뿌리면 '' */
  readonly base: string;
  /** 빌드 결과 폴더(저장소 뿌리 기준, / 구분) */
  readonly outDir: string;
}

/** Windows 절대 경로(Git Bash가 /로 시작하는 값을 바꾼 모양 포함) */
const WINDOWS_ABSOLUTE_PATH = /^[a-z]:[\\/]/iu;
/** 주소 한 칸에 쓸 수 있는 글자(RFC 3986 unreserved — 영문·숫자·-·_·.·~, 첫 글자는 영문·숫자) */
const BASE_SEGMENT = /^[a-z\d][a-z\d._~-]*$/iu;
/** 저장소 뿌리 바로 아래의 빌드 결과 폴더 이름: dist, dist-이름, dist_이름 */
const TOP_LEVEL_OUT_DIR = /^dist(?:[-_][a-z\d][a-z\d_-]*)?$/iu;

/**
 * APC_BASE 값을 사이트 하위 경로로 바꾼다. 비었으면 공개 사이트의 경로, '/'면 사이트 뿌리('').
 * 앞뒤 /는 있어도 없어도 된다('offline' = '/offline/' = '/offline'). 쓸 수 없는 값은 한국어 오류를 던져 빌드를 멈춘다.
 */
export function parseBaseSetting(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (value === '') {
    return PUBLIC_BASE;
  }
  if (WINDOWS_ABSOLUTE_PATH.test(value)) {
    throw new Error(
      `환경 변수 ${BUILD_ENV_NAMES.base}가 "${value}"예요. Git Bash가 /로 시작하는 값을 Windows 경로로 바꾼 것 같아요 — ` +
        `명령 앞에 MSYS_NO_PATHCONV=1을 붙이거나(예: MSYS_NO_PATHCONV=1 ${BUILD_ENV_NAMES.base}=/ npm run build) ` +
        `PowerShell에서 $env:${BUILD_ENV_NAMES.base}='/'로 적어요.`,
    );
  }
  const trimmed = value.replace(/^\/+/u, '').replace(/\/+$/u, '');
  if (trimmed === '') {
    return '';
  }
  const segments = trimmed.split('/');
  if (!segments.every((segment) => BASE_SEGMENT.test(segment))) {
    throw new Error(
      `환경 변수 ${BUILD_ENV_NAMES.base}="${value}"는 쓸 수 없어요. '/'(사이트 뿌리) 또는 '/이름'처럼 적고, ` +
        '이름에는 영문·숫자·-·_·.·~만 써요(빈 칸·..·?·# 안 됨).',
    );
  }
  return `/${segments.join('/')}`;
}

/**
 * APC_OUT_DIR 값을 빌드 결과 폴더(저장소 뿌리 기준, / 구분)로 바꾼다. 비었으면 dist.
 * Astro가 빌드 전에 이 폴더를 비우므로(node_modules/astro/dist/core/build/static-build.js의 emptyDir) 소스·원본 폴더를
 * 잘못 적어 지우는 일이 없게 dist·dist-이름·.cache/ 아래만 받는다.
 */
export function parseOutDirSetting(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (value === '') {
    return DEFAULT_OUT_DIR;
  }
  const normalized = value.replace(/\\/gu, '/').replace(/^(?:\.\/)+/u, '').replace(/\/+$/u, '');
  const segments = normalized.split('/');
  const isAbsolute = normalized.startsWith('/') || WINDOWS_ABSOLUTE_PATH.test(value);
  const safeSegments = segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
  const allowed =
    !isAbsolute &&
    safeSegments &&
    ((segments.length === 1 && TOP_LEVEL_OUT_DIR.test(segments[0] ?? '')) || (segments.length >= 2 && segments[0] === '.cache'));
  if (!allowed) {
    throw new Error(
      `환경 변수 ${BUILD_ENV_NAMES.outDir}="${value}"는 쓸 수 없어요. 빌드가 이 폴더를 먼저 비우므로 ` +
        'dist, dist-이름(예: dist-offline), .cache/ 아래(예: .cache/offline/site)처럼 저장소 뿌리 기준 상대 경로만 받아요.',
    );
  }
  return segments.join('/');
}

/** Node의 환경 변수(브라우저에는 process가 없어 빈 모음) */
function nodeEnvironment(): BuildEnvironment {
  const processLike = (globalThis as { process?: { env?: BuildEnvironment } }).process;
  return processLike?.env ?? {};
}

/**
 * 이번 빌드의 base·결과 폴더를 환경 변수에서 읽는다(Node 전용 — astro.config.mjs·scripts·Playwright가 부른다).
 * 인자를 주면 그 모음을 읽는다(단위 테스트용).
 */
export function resolveBuildSettings(env: BuildEnvironment = nodeEnvironment()): BuildSettings {
  return {
    base: parseBaseSetting(env[BUILD_ENV_NAMES.base]),
    outDir: parseOutDirSetting(env[BUILD_ENV_NAMES.outDir]),
  };
}

/** 이번 빌드의 base: 번들 안에서는 빌드 때 새긴 값, Node에서는 환경 변수 */
function currentBase(): string {
  if (typeof __APC_BASE__ === 'string') {
    return __APC_BASE__;
  }
  return parseBaseSetting(nodeEnvironment()[BUILD_ENV_NAMES.base]);
}

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
   * 이번 빌드의 사이트 하위 경로. 끝에 /를 붙이지 않는다(사이트 뿌리면 '').
   * 보통은 공개 사이트와 같은 `/ai-physical-computing`(DECISIONS C7)이고, 환경 변수 APC_BASE로 바꾼다(위 머리말).
   * 페이지 안 링크에는 끝에 /가 붙는 import.meta.env.BASE_URL이나 src/lib/url.ts의 withBase()를 쓴다(astro.config.mjs의 trailingSlash 참고).
   */
  base: currentBase(),
  /** 공개 사이트의 하위 경로(끝에 / 없음). 전체 주소(대표 주소·공유 미리보기)는 빌드 base와 상관없이 이 경로다. */
  publicBase: PUBLIC_BASE,
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
