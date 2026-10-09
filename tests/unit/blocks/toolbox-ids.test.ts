// @vitest-environment jsdom
// 블록 도구 상자 범주의 중복 id 정리(판 1.3.0 검수 R1-116)
import { describe, expect, it } from 'vitest';
import { dedupeToolboxCategoryIds } from '../../../src/lab/blocks/toolbox-ids.ts';

function toolboxHtml(ids: readonly string[]): string {
  return ids
    .map(
      (id) =>
        `<div class="blocklyToolboxCategoryContainer" role="treeitem" id="${id}" aria-labelledby="${id}.label">` +
        `<div class="blocklyToolboxCategory" id="${id}"><span id="${id}.label">이름</span></div></div>`,
    )
    .join('');
}

describe('dedupeToolboxCategoryIds', () => {
  it('바깥 칸(treeitem)의 id는 두고 안쪽 줄의 같은 id만 지운다', () => {
    document.body.innerHTML = `<div id="host">${toolboxHtml(['blocks-cat-board', 'blocks-cat-sensor'])}</div>`;
    expect(document.querySelectorAll('#blocks-cat-board')).toHaveLength(2);
    expect(dedupeToolboxCategoryIds(document.getElementById('host')!)).toBe(2);
    expect(document.querySelectorAll('#blocks-cat-board')).toHaveLength(1);
    expect(document.querySelector('#blocks-cat-board')?.getAttribute('role')).toBe('treeitem');
    expect(document.querySelectorAll('[id="blocks-cat-sensor"]')).toHaveLength(1);
    // 이름 칸(.label)은 그대로 — aria-labelledby가 가리킨다
    expect(document.getElementById('blocks-cat-board.label')).not.toBeNull();
  });

  it('다시 불러도 아무것도 지우지 않고, id가 서로 다른 안쪽 줄은 건드리지 않는다', () => {
    document.body.innerHTML = `<div id="host">${toolboxHtml(['blocks-cat-light'])}<div class="blocklyToolboxCategoryContainer" id="a"><div class="blocklyToolboxCategory" id="b"></div></div></div>`;
    expect(dedupeToolboxCategoryIds(document.getElementById('host')!)).toBe(1);
    expect(dedupeToolboxCategoryIds(document.getElementById('host')!)).toBe(0);
    expect(document.getElementById('b')).not.toBeNull();
  });
});
