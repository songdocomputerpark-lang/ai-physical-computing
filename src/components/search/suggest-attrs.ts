/**
 * 자동 완성(search-suggest.ts)이 읽는 설정을 data- 속성으로 만든다 — 서버(.astro 머리말)에서만 쓴다.
 *
 * 머리글 검색 폼(HeaderSearch.astro)이 이 속성을 달면, 같은 쪽의 홈 큰 검색·404 검색칸 같은 다른 data-suggest 폼도 이 설정을 함께 쓴다.
 * 설정을 브라우저 코드에서 불러오지 않고 속성으로 넘기는 까닭은 SearchPage.astro 머리말과 같다(site.ts가 번들에 묶이지 않게).
 */
import { flattenPages, learnUnits } from '../../config/nav.ts';
import { searchConfig } from '../../config/search.ts';

/** 위치 표시에 쓸 위 페이지 이름 표의 깊이 한도(경로 칸 수). 머리글은 모든 쪽 HTML에 들어가므로 앞의 두 칸까지만 둔다. */
const MAX_SECTION_DEPTH = 2;

/** 경로의 칸 수: '/' → 0, '/labs/' → 1, '/labs/esp32/' → 2 */
export function pathDepth(path: string): number {
  return path.split('/').filter(Boolean).length;
}

/** 위치 표시용 이름 표: 사이트 지도와 대단원 가운데 깊이가 한도 안인 것 */
export function suggestSections(maxDepth = MAX_SECTION_DEPTH): { path: string; label: string }[] {
  return [...flattenPages(), ...learnUnits]
    .filter((page) => page.path !== '/' && pathDepth(page.path) <= maxDepth)
    .map((page) => ({ path: page.path, label: page.label }));
}

/** 머리글 검색 폼에 펼쳐 넣는 속성들 */
export function suggestConfigAttrs(): Record<string, string> {
  return {
    'data-suggest-config': '',
    'data-bundle-path': searchConfig.bundlePath,
    'data-base-url': searchConfig.baseUrl,
    'data-query-param': searchConfig.queryParam,
    'data-anchor-pages': JSON.stringify(searchConfig.anchorPages),
    'data-sections': JSON.stringify(suggestSections()),
    'data-popular': JSON.stringify(searchConfig.popularWords),
  };
}
