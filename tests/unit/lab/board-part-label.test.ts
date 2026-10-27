// @vitest-environment jsdom
// 누르는 부품(role=button — BOOT 버튼·터치 센서)의 이름이 그림에 보이는 글자를 품는지(WCAG 2.5.3 — axe 4.14 label-content-name-mismatch, 판 1.8.0).
// axe는 SVG <text> 조각을 띄우지 않고 이어 읽으므로("BOOT IO0뗌") 둘째 조각부터 글 앞에 빈칸을 둔다(SVG는 그 빈칸을 그리지 않는다).
import { describe, expect, it } from 'vitest';
import { interactiveLabel, spaceSvgTexts, visibleSvgText } from '../../../src/lab/modules/board/view.ts';

const SVG = 'http://www.w3.org/2000/svg';

function part(...texts: string[]): SVGGElement {
  const group = document.createElementNS(SVG, 'g');
  for (const value of texts) {
    const text = document.createElementNS(SVG, 'text');
    text.textContent = value;
    group.append(text);
  }
  return group;
}

describe('누르는 부품의 이름', () => {
  it('둘째 글 조각부터 앞에 빈칸을 한 번만 두고, 보이는 글자를 띄어 이어 읽는다', () => {
    const group = part('BOOT IO0', '뗌');
    spaceSvgTexts(group);
    spaceSvgTexts(group);
    expect(group.textContent).toBe('BOOT IO0 뗌');
    expect(visibleSvgText(group)).toBe('BOOT IO0 뗌');
  });

  it('부품이 상태 글을 바꾸면(apply) 다시 불러 빈칸을 되살린다', () => {
    const group = part('IO17', '터치 센서', '뗌');
    spaceSvgTexts(group);
    group.querySelectorAll('text')[2]!.textContent = '눌림';
    spaceSvgTexts(group);
    expect(group.textContent).toBe('IO17 터치 센서 눌림');
  });

  it('이름은 보이는 글자로 시작하고, 이미 들어 있거나 글자가 없으면 설명만', () => {
    expect(interactiveLabel('BOOT IO0 뗌', 'BOOT 버튼(GPIO0) — 누르고 있는 동안 눌려요')).toBe('BOOT IO0 뗌 — BOOT 버튼(GPIO0) — 누르고 있는 동안 눌려요');
    expect(interactiveLabel('', '버튼')).toBe('버튼');
    expect(interactiveLabel('버튼', '큰 버튼')).toBe('큰 버튼');
  });
});
