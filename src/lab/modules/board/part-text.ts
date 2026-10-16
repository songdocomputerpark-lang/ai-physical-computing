/**
 * 범용 부품 4종(판 1.5.0)이 SVG 그림 안에 글자를 넣을 때 쓰는 도우미. 부품 그림은 크기가 정해져 있는데 이름(배선의 label)은 예제마다 달라서,
 * 칸을 넘는 이름은 줄여 쓰고(…) 전체 이름은 화면 낭독기용 설명(<desc data-part-desc>)과 aria-label에 둔다.
 */
import type { svgElement } from './svg.ts';

/** 한글·한자·전각 글자(칸을 한 글자 크기만큼 차지하는 글자)인지 */
function isWide(code: number): boolean {
  return (code >= 0x1100 && code <= 0x11ff) || (code >= 0x2e80 && code <= 0xd7ff) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xff00 && code <= 0xffef);
}

/** 글자 크기(fontSize) 기준으로 어림한 글 너비(SVG 단위). 한글은 글자 크기만큼, 영문·숫자는 0.62배, 띄어쓰기는 0.35배 */
export function textWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const character of text) {
    if (character === ' ') {
      width += fontSize * 0.35;
    } else {
      width += isWide(character.codePointAt(0) ?? 0) ? fontSize : fontSize * 0.62;
    }
  }
  return width;
}

/** maxWidth 안에 들어오게 글을 줄인다(넘으면 끝을 …로). 줄이지 않아도 되면 그대로 */
export function fitText(text: string, maxWidth: number, fontSize: number): string {
  const trimmed = text.trim();
  if (textWidth(trimmed, fontSize) <= maxWidth) {
    return trimmed;
  }
  let result = '';
  for (const character of trimmed) {
    if (textWidth(`${result}${character}…`, fontSize) > maxWidth) {
      break;
    }
    result += character;
  }
  return `${result.trimEnd()}…`;
}

/**
 * 부품 요소(view.ts가 만든 role="img" <g>)의 <desc>를 한 번 만들고 글만 바꾸는 함수를 돌려준다. 화면 낭독기의 설명이 된다(SVG-AAM).
 * 부품 요소가 아직 없으면(단위 테스트에서 target만 만든 경우) 아무 일도 하지 않는다.
 */
export function createPartDescriber(target: SVGGElement, svg: typeof svgElement): (text: string) => void {
  let desc: SVGDescElement | null = null;
  return (text) => {
    const root = target.closest('[data-board-part]');
    if (!root) {
      return;
    }
    if (!desc || desc.parentNode !== root) {
      desc = svg('desc', { 'data-part-desc': '' });
      root.insertBefore(desc, root.firstChild);
    }
    if (desc.textContent !== text) {
      desc.textContent = text;
    }
  };
}
