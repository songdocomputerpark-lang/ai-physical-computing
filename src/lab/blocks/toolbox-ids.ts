/**
 * 도구 상자 범주의 중복 id를 없앤다(판 1.3.0 검수 R1-116). Blockly는 범주마다 바깥 칸(role="treeitem", 접근 이름 참조 aria-labelledby="<id>.label"가 가리키는 칸)과
 * 안쪽 줄(.blocklyToolboxCategory — 눌리는 칸)에 같은 id(우리가 적은 toolboxitemid: blocks-cat-board …)를 붙인다. 한 문서에 같은 id가 둘이라
 * `#blocks-cat-board`가 요소 둘을 가리켰다(Playwright strict 모드가 막힘, id 참조가 모호). 바깥 칸의 id만 남기고 안쪽 줄의 id는 지운다 —
 * 안쪽 줄은 id로 참조되는 곳이 없다(참조는 바깥 칸과 ".label" 이름 칸).
 */
export function dedupeToolboxCategoryIds(host: ParentNode): number {
  let removed = 0;
  for (const row of host.querySelectorAll<HTMLElement>('.blocklyToolboxCategoryContainer[id] > .blocklyToolboxCategory[id]')) {
    if (row.id === row.parentElement?.id) {
      row.removeAttribute('id');
      removed += 1;
    }
  }
  return removed;
}
