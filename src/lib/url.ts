/**
 * 사이트 안 주소 도우미(PLAN §2.1, DECISIONS C7).
 *
 * 사이트는 GitHub Pages의 하위 경로(base, 예: /ai-physical-computing)에 올라가고, 페이지 주소는 항상 /로 끝난다
 * (astro.config.mjs의 trailingSlash: 'always'). 그래서 사이트 안 링크는 손으로 적지 않고 이 파일의 함수로 만든다.
 *
 *   withBase('start/student/')         → '/ai-physical-computing/start/student/'
 *   withBase('/credits/#third-party')  → '/ai-physical-computing/credits/#third-party'
 *   withBase('search/?q=픽셀')          → '/ai-physical-computing/search/?q=픽셀'
 *   withBase('fonts/pretendard/a.css') → '/ai-physical-computing/fonts/pretendard/a.css' (파일 이름 끝에는 /를 붙이지 않음)
 *   stripBase(Astro.url.pathname)      → '/start/student/'
 *   absoluteUrl('credits/')            → 'https://songdocomputerpark-lang.github.io/ai-physical-computing/credits/'
 *
 * base는 src/config/site.ts 한 곳에서 온다. 사용자 도메인을 연결해 base를 ''로 바꿔도 부르는 코드는 그대로 둔다.
 * 이번 빌드의 base는 환경 변수 APC_BASE로 바뀔 수 있다(오프라인 배포판은 사이트 뿌리 '' — site.ts 머리말). 그래도 absoluteUrl()이 만드는
 * 전체 주소(검색 엔진 대표 주소·공유 미리보기)는 늘 **공개 사이트** 주소다(siteConfig.publicBase).
 * Astro 페이지뿐 아니라 Vitest·Playwright·Node 스크립트도 이 파일을 쓰므로 import.meta.env(Astro 전용 값)를 읽지 않는다.
 */
import { siteConfig } from '../config/site.ts';

/**
 * 하위 경로. 설정의 글자 그대로 타입이 좁혀지지 않게 string으로 받는다
 * (사용자 도메인을 연결해 ''로 바꾸는 경우도 같은 코드로 처리하기 위해서다).
 */
const BASE: string = siteConfig.base;

/** 사이트 뿌리 주소: base 끝에 /를 붙인 값(base가 ''이면 '/') */
export const BASE_PATH = `${BASE}/`;

/** https:·mailto: 같은 방식 이름으로 시작하거나 //로 시작하는 주소 */
const EXTERNAL_HREF = /^(?:[a-z][a-z\d+.-]*:|\/\/)/iu;
/** 확장자가 붙은 파일 이름. 페이지 주소는 영문 소문자·숫자·하이픈만 써서 점이 없다(PD-09). */
const FILE_NAME = /\.[a-z\d]+$/iu;

/** 사이트 밖 주소(https:, mailto: 등)인지 알려 준다. */
export function isExternalHref(href: string): boolean {
  return EXTERNAL_HREF.test(href);
}

/**
 * 사이트 안 경로에 base를 붙인 링크를 만든다.
 * - 앞의 / 는 있어도 없어도 된다. 페이지 경로에는 끝에 /를 붙이고, 파일 이름에는 붙이지 않는다.
 * - ?검색어 와 #위치 는 그대로 뒤에 붙인다.
 * - 사이트 밖 주소와 #으로 시작하는 주소는 바꾸지 않고 돌려준다.
 * - 이미 base가 붙은 주소나 ".."이 든 주소는 실수로 보고 오류를 낸다(빌드가 멈춰 바로 알 수 있다).
 */
export function withBase(path: string): string {
  if (isExternalHref(path) || path.startsWith('#')) {
    return path;
  }
  const suffixStart = path.search(/[?#]/u);
  const suffix = suffixStart < 0 ? '' : path.slice(suffixStart);
  let pathname = (suffixStart < 0 ? path : path.slice(0, suffixStart)).replace(/^(?:\.?\/)+/u, '');

  if (pathname.split('/').includes('..')) {
    throw new Error(`withBase()에 ".."이 든 주소 "${path}"를 넣었어요. 사이트 뿌리부터 적어요(예: "start/student/").`);
  }
  const rooted = `/${pathname}`;
  if (BASE !== '' && (rooted === BASE || rooted.startsWith(BASE_PATH))) {
    throw new Error(
      `withBase()에 이미 base(${BASE})가 붙은 주소 "${path}"를 넣었어요. ` +
        '사이트 안 경로(예: "start/")만 넣거나 stripBase()로 먼저 떼요.',
    );
  }
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (pathname !== '' && !pathname.endsWith('/') && !FILE_NAME.test(lastSegment)) {
    pathname += '/';
  }
  return `${BASE_PATH}${pathname}${suffix}`;
}

/**
 * base가 붙은 주소에서 base를 뗀 사이트 안 경로를 돌려준다.
 * stripBase('/ai-physical-computing/start/') → '/start/', stripBase('/ai-physical-computing') → '/'
 */
export function stripBase(pathname: string): string {
  if (BASE !== '') {
    if (pathname === BASE) {
      return '/';
    }
    if (pathname.startsWith(BASE_PATH)) {
      return `/${pathname.slice(BASE_PATH.length)}`;
    }
  }
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

/**
 * 페이지 경로를 비교할 수 있게 맞춘다: base를 떼고, 끝의 index.html을 지우고, 끝에 /를 붙인다.
 * normalizePagePath('/ai-physical-computing/start/index.html') → '/start/'
 */
export function normalizePagePath(pathname: string): string {
  let result = stripBase(pathname).replace(/index\.html$/u, '');
  if (!result.endsWith('/')) {
    result += '/';
  }
  return result;
}

/** 공개 사이트의 뿌리 주소(끝에 /). 이번 빌드의 base가 달라도(오프라인 배포판) 전체 주소는 이 경로를 쓴다. */
const PUBLIC_BASE_PATH = `${siteConfig.publicBase as string}/`;

/**
 * 사이트 밖에서 쓰는 전체 주소(검색 엔진 대표 주소·공유 미리보기 등). 언제나 공개 사이트(GitHub Pages)의 주소다.
 * absoluteUrl('credits/') → 'https://songdocomputerpark-lang.github.io/ai-physical-computing/credits/'
 * 페이지 주소(base가 붙은 Astro.url.pathname)는 stripBase()로 먼저 뗀다: absoluteUrl(stripBase(Astro.url.pathname))
 */
export function absoluteUrl(path: string): string {
  const local = withBase(path);
  if (isExternalHref(local)) {
    return local;
  }
  const rest = local.startsWith(BASE_PATH) ? local.slice(BASE_PATH.length) : local;
  return new URL(`${PUBLIC_BASE_PATH}${rest}`, siteConfig.origin).href;
}
