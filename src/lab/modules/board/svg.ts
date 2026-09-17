/**
 * 가상 보드 그림을 만드는 작은 도우미(SVG 요소 만들기). 부품 폴더의 part.ts가 render()에서 쓴다.
 * 그림은 모두 사이트가 직접 그린 도형이다(브랜드 중립, Fritzing 등 다른 저작물 그림을 쓰지 않는다 — PLAN §9, SPEC §2).
 */

export const SVG_NS = 'http://www.w3.org/2000/svg';

export type SvgAttributes = Readonly<Record<string, string | number | boolean | null | undefined>>;

/** SVG 요소 하나를 만든다. 값이 null·undefined·false인 속성은 넣지 않는다. 자식은 요소나 글자. */
export function svgElement<K extends keyof SVGElementTagNameMap>(tag: K, attributes: SvgAttributes = {}, children: readonly (Node | string)[] = []): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) {
      continue;
    }
    element.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) {
    element.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return element;
}
