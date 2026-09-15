/**
 * 사이트 검색 설정(PLAN §8.1 P1-11).
 *
 * Pagefind 1.5.2가 빌드 뒤(npm run build의 postbuild) dist/를 읽어 dist/pagefind/에 검색 색인과 검색 코드를 만든다.
 * 검색 화면(/search/)과 머리글 검색 상자(src/components/search/HeaderSearch.astro)는 이 값을 쓴다.
 * 검색 화면 구현: src/components/search/SearchPage.astro(화면)와 search-page.ts(Pagefind API로 찾고 결과 그리기).
 *
 * 색인 규칙(P1-11 결정)
 * - BaseLayout이 <main>에 data-pagefind-body를 붙인다. 그래서 머리글·바닥글은 색인되지 않고,
 *   searchIndex={false}로 만든 페이지(홈·검색·404)는 색인에서 빠진다.
 * - 준비 중 상자(ComingSoon)와 교사용·정답 접기 상자(마크다운 :::교사용·:::정답, Callout)는 data-pagefind-ignore로 빠진다.
 *   여러 페이지에 같은 문장이 들어가거나, 학생 검색 결과 요약에 지도 글·정답이 보이지 않게 하려는 것이다.
 * - 한국어: 조사를 떼어 주지 않고 낱말 앞부분으로 찾는다. 가운뎃점(·)으로 이은 낱말은 한 낱말로 묶이므로 나열은 쉼표로 쓴다.
 * - 본문 안에서 뺄 부분에는 data-pagefind-ignore(안의 글만 빼기) 또는 data-pagefind-ignore="all"(모두 빼기)을 붙인다.
 * - 코드를 고치지 않고 빼려면 저장소 뿌리에 pagefind.yml을 두고 exclude_selectors를 적는다
 *   (Pagefind는 명령을 실행한 폴더의 pagefind.yml·pagefind.toml·pagefind.json을 읽는다).
 */
import { BASE_PATH, withBase } from '../lib/url.ts';

export const searchConfig = {
  /** 검색 페이지의 사이트 안 경로 */
  pagePath: '/search/',
  /** 검색 페이지 링크(base 포함) */
  pageHref: withBase('search/'),
  /** 검색어를 싣는 주소 이름. 예: /search/?q=픽셀 */
  queryParam: 'q',
  /** Pagefind 파일 폴더(base 포함). pagefind.js, pagefind-ui.js, pagefind-ui.css가 이 안에 생긴다. */
  bundlePath: withBase('pagefind/'),
  /**
   * 검색 결과 주소 앞에 붙일 값(Pagefind의 baseUrl 옵션).
   * 색인에는 base 없는 주소(예: /credits/)가 들어간다. Pagefind 1.5.2는 pagefind.js를 불러온 주소(bundlePath)에서
   * base를 알아내 결과를 /ai-physical-computing/credits/로 준다(2026-09-16 브라우저로 확인, tests/e2e/search-index.spec.ts).
   * 불러오는 방식이 달라져도 주소가 틀리지 않게 검색 화면에서는 이 값을 넘겨 둔다.
   * 예: await pagefind.options({ baseUrl: searchConfig.baseUrl })
   */
  baseUrl: BASE_PATH,
} as const;
