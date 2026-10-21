// @vitest-environment jsdom
// 수업 화면(발표 모드)의 핵심 개념 접기 처리(src/components/lesson/present.ts flattenConceptFolds, 판 1.6.0 C174):
// 접힌 상자(details[data-concepts-fold])는 안쪽 블록(제목 줄 summary 제외)으로 풀어 칸의 블록 줄에 세운다. 다른 상자(힌트·교사용)는 그대로 한 블록이다.
import { describe, expect, it } from 'vitest';
import { CONCEPT_FOLD_SELECTOR, flattenConceptFolds } from '../../../src/components/lesson/present.ts';

function section(html: string): HTMLElement {
  const holder = document.createElement('section');
  holder.innerHTML = html;
  return holder;
}

describe('수업 화면의 핵심 개념 접기 풀기(flattenConceptFolds)', () => {
  it('접힌 상자는 summary를 빼고 안쪽 블록을 바깥 블록 사이에 세운다', () => {
    const holder = section(
      '<h2>핵심 개념</h2><h3 id="a">첫째</h3><p>첫째 글</p>' +
        '<details class="more concepts-fold" data-concepts-fold><summary>개념 2가지 더 읽기</summary><h3 id="b">둘째</h3><p>둘째 글</p><h3 id="c">셋째</h3><table></table></details>',
    );
    const blocks = flattenConceptFolds(Array.from(holder.children));
    expect(blocks.map((block) => block.tagName)).toEqual(['H2', 'H3', 'P', 'H3', 'P', 'H3', 'TABLE']);
    expect(blocks.some((block) => block.tagName === 'SUMMARY' || block.tagName === 'DETAILS')).toBe(false);
  });

  it('접힌 상자가 아닌 details(힌트·교사용 상자)는 그대로 한 블록이다', () => {
    const holder = section('<p>글</p><details class="box box--hint"><summary>힌트</summary><p>안쪽</p></details>');
    const blocks = flattenConceptFolds(Array.from(holder.children));
    expect(blocks.map((block) => block.tagName)).toEqual(['P', 'DETAILS']);
    expect(blocks[1]?.matches(CONCEPT_FOLD_SELECTOR)).toBe(false);
  });

  it('접힌 상자가 없으면 목록을 그대로 돌려준다', () => {
    const holder = section('<h2>핵심 개념</h2><p>글</p>');
    const children = Array.from(holder.children);
    expect(flattenConceptFolds(children)).toEqual(children);
  });
});
