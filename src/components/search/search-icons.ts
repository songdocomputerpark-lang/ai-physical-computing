/**
 * 찾기 화면(자동 완성 목록·검색 결과 카드)에서 자바스크립트가 그리는 아이콘 — 판 1.3.0 구역 B.
 *
 * 서버에서 그리는 아이콘은 src/components/common/Icon.astro가 맡는다. 하지만 목록·카드는 브라우저에서 만들어 붙이므로 아이콘 모양이 필요한데,
 * 공용 표(common/icons.ts)를 통째로 불러오면 45개 모양이 모든 쪽이 받는 스크립트에 들어간다. 그래서 여기서 쓰는 몇 개만 옮겨 두었다.
 * 공용 표와 모양이 같은지는 tests/unit/search/search-icons.test.ts가 본다(공용 표를 고치면 여기도 같이 고친다).
 * 한 아이콘은 path 하나(공용 표의 조각을 공백으로 이은 d 값)이고, 선만 있는 아이콘이라 꽉 찬 조각은 없다.
 */

export const SEARCH_ICON_NAMES = [
  'search',
  'book',
  'flask',
  'glossary',
  'alert',
  'grid',
  'teacher',
  'flag',
  'lifebuoy',
  'list',
  'arrow-right',
] as const;

export type SearchIconName = (typeof SEARCH_ICON_NAMES)[number];

/** 이름 → path d (조각들을 공백으로 이은 값) */
export const SEARCH_ICON_PATHS: Readonly<Record<SearchIconName, string>> = {
  search: 'M4.5 11a6.5 6.5 0 1 0 13 0 6.5 6.5 0 1 0 -13 0z M16 16l4.5 4.5',
  book: 'M12 6.8C9.8 5.2 6.8 4.7 3.5 5.2v13c3.3-.5 6.3 0 8.5 1.6 2.2-1.6 5.2-2.1 8.5-1.6v-13c-3.3-.5-6.3 0-8.5 1.6z M12 6.8v13',
  flask: 'M9 3h6M10 3v6.3l-5.3 9A1.8 1.8 0 0 0 6.2 21h11.6a1.8 1.8 0 0 0 1.5-2.7L14 9.3V3 M7.3 15.5h9.4',
  glossary: 'M6.5 3H19v18H6.5A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3z M9 3v18 M12.5 15l2.5-6.5 2.5 6.5M13.4 13h3.2',
  alert: 'M10.3 4.4 2.9 17.4A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3.1L13.7 4.4a2 2 0 0 0-3.4 0z M12 9.5v4.5 M12 17.3h.01',
  grid:
    'M5.5 4h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1 -1.5 1.5h-4a1.5 1.5 0 0 1 -1.5 -1.5v-4a1.5 1.5 0 0 1 1.5 -1.5z ' +
    'M14.5 4h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1 -1.5 1.5h-4a1.5 1.5 0 0 1 -1.5 -1.5v-4a1.5 1.5 0 0 1 1.5 -1.5z ' +
    'M5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1 -1.5 1.5h-4a1.5 1.5 0 0 1 -1.5 -1.5v-4a1.5 1.5 0 0 1 1.5 -1.5z ' +
    'M14.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1 -1.5 1.5h-4a1.5 1.5 0 0 1 -1.5 -1.5v-4a1.5 1.5 0 0 1 1.5 -1.5z',
  teacher: 'M2 9.5 12 5l10 4.5-10 4.5z M6 11.7V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.3 M22 9.5V14',
  flag: 'M5 21V4 M5 4.5h12.5L15 8.5l2.5 4H5',
  lifebuoy:
    'M3 12a9 9 0 1 0 18 0 9 9 0 1 0 -18 0z M8.5 12a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0 -7 0z M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9',
  list: 'M9 6.5h11M9 12h11M9 17.5h11 M4.5 6.5h.01 M4.5 12h.01 M4.5 17.5h.01',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 꾸밈 아이콘(svg)을 만든다. 크기는 CSS가 정한다(width·height를 주지 않음). 화면 낭독기에는 숨긴다.
 * 선 색은 둘레 글자 색(currentColor)을 따르고, 굵기·끝 모양은 Icon.astro와 같다.
 */
export function createSearchIcon(name: SearchIconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'suggest-icon');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', SEARCH_ICON_PATHS[name]);
  svg.append(path);
  return svg;
}
