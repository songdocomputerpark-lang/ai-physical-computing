// @vitest-environment jsdom
// 한 쪽에 실습실 틀이 둘일 때 같은 id를 푸는 scopeLabIds(src/lab/controls/lab-shell.ts — 판 1.1.0, PROGRESS 미해결 138) 검사.
// 전에는 4단원 통합 화면만의 우회(src/lab/unit4/dom.ts dedupeIdsWithin)가 보드 칸만 고쳤다. 이제 틀이 모듈이 붙기 전에 칸마다 꼬리를 붙인다.
// 진짜 화면은 tests/e2e/unit4.spec.ts(두 칸의 data-lab-ids-scoped·겹친 id 0·이름표가 제 칸을 가리킴)가 본다.
import { beforeEach, describe, expect, it } from 'vitest';
import { scopeLabIds } from '../../../src/lab/controls/lab-shell.ts';

/** 두 칸에 함께 붙는 모듈 패널 모양(고정 id + 이름표·aria 참조 + 쪽 안 링크) */
function labHtml(labId: string, suffix?: string): string {
  return `
    <div data-lab data-lab-id="${labId}"${suffix === undefined ? '' : ` data-lab-id-suffix="${suffix}"`}>
      <h2 id="lab-${labId}-editor-heading">코드</h2>
      <p id="lab-${labId}-editor-hint">Tab 안내</p>
      <section data-lab-module-panel="vision-bridge">
        <label for="lab-bridge-channel">통로</label>
        <select id="lab-bridge-channel" aria-describedby="lab-bridge-note lab-${labId}-editor-hint"></select>
        <p id="lab-bridge-note">안내</p>
        <a href="#lab-bridge-note">안내로</a>
      </section>
      <section data-lab-module-panel="loading" aria-labelledby="lab-loading-title">
        <h3 id="lab-loading-title">준비</h3>
      </section>
    </div>`;
}

function ids(root: Element): string[] {
  return [...root.querySelectorAll('[id]')].map((element) => element.id);
}

function duplicates(): string[] {
  const seen = new Map<string, number>();
  for (const element of document.querySelectorAll('[id]')) {
    seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('scopeLabIds — 한 쪽에 실습실 틀이 여럿일 때', () => {
  it('칸이 하나면 아무것도 바꾸지 않는다', () => {
    document.body.innerHTML = labHtml('vision');
    const root = document.querySelector<HTMLElement>('[data-lab]')!;
    const before = ids(root);
    expect(scopeLabIds(root)).toBe(0);
    expect(ids(root)).toEqual(before);
  });

  it('두 칸이 함께 쓰는 id에 칸마다 꼬리를 붙이고(차례대로 부르면 두 칸 모두), 칸 안의 참조를 함께 고친다', () => {
    document.body.innerHTML = `<p id="page-note">쪽 글</p>${labHtml('vision', 'pc')}${labHtml('esp32', 'board')}`;
    const [pc, board] = [...document.querySelectorAll<HTMLElement>('[data-lab]')] as [HTMLElement, HTMLElement];
    expect(duplicates().sort()).toEqual(['lab-bridge-channel', 'lab-bridge-note', 'lab-loading-title']);

    expect(scopeLabIds(pc)).toBe(3);
    expect(scopeLabIds(board)).toBe(3);
    expect(duplicates()).toEqual([]);

    // 겹치던 것만 바뀐다 — 칸마다 다른 id(labId가 든 틀의 id)·쪽의 id는 그대로
    expect(ids(pc)).toEqual(['lab-vision-editor-heading', 'lab-vision-editor-hint', 'lab-bridge-channel--pc', 'lab-bridge-note--pc', 'lab-loading-title--pc']);
    expect(ids(board)).toEqual(['lab-esp32-editor-heading', 'lab-esp32-editor-hint', 'lab-bridge-channel--board', 'lab-bridge-note--board', 'lab-loading-title--board']);
    expect(document.getElementById('page-note')).not.toBeNull();

    // 이름표·aria·쪽 안 링크가 제 칸을 가리킨다
    for (const [root, tail, labId] of [
      [pc, 'pc', 'vision'],
      [board, 'board', 'esp32'],
    ] as const) {
      expect(root.querySelector('label')?.getAttribute('for')).toBe(`lab-bridge-channel--${tail}`);
      expect(root.querySelector('select')?.getAttribute('aria-describedby')).toBe(`lab-bridge-note--${tail} lab-${labId}-editor-hint`);
      expect(root.querySelector('a')?.getAttribute('href')).toBe(`#lab-bridge-note--${tail}`);
      expect(root.querySelector('[data-lab-module-panel="loading"]')?.getAttribute('aria-labelledby')).toBe(`lab-loading-title--${tail}`);
    }

    // 두 번 불러도 다시 바꾸지 않는다
    expect(scopeLabIds(pc)).toBe(0);
    expect(scopeLabIds(board)).toBe(0);
  });

  it('꼬리(idSuffix)가 없으면 labId를 쓰고, 같은 꼬리가 이미 있으면 번호를 더 붙인다', () => {
    document.body.innerHTML = `${labHtml('vision')}${labHtml('vision')}`;
    const [first, second] = [...document.querySelectorAll<HTMLElement>('[data-lab]')] as [HTMLElement, HTMLElement];
    scopeLabIds(first);
    scopeLabIds(second);
    expect(duplicates()).toEqual([]);
    expect(first.querySelector('select')?.id).toBe('lab-bridge-channel--vision');
    expect(second.querySelector('select')?.id).toBe('lab-bridge-channel--vision-2');
    // 같은 labId 두 칸이면 틀의 id도 겹친다 — 그것도 푼다
    expect(first.querySelector('h2')?.id).toBe('lab-vision-editor-heading--vision');
    expect(second.querySelector('h2')?.id).toBe('lab-vision-editor-heading--vision-2');
    expect(second.querySelector('select')?.getAttribute('aria-describedby')).toBe('lab-bridge-note--vision-2 lab-vision-editor-hint--vision-2');
  });
});
