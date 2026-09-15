/**
 * 접기 상자(<details>: 힌트·정답·교사용, src/lib/remark-boxes.mjs)를 돕는 작은 기능.
 * 열고 닫기 자체는 브라우저 기본 기능이라 키보드(Tab으로 제목에 가서 Enter·Space)로 된다.
 *
 * - 인쇄: 브라우저는 닫힌 상자 안을 인쇄하지 않는다. 인쇄 직전에 닫힌 상자를 펼치고, 인쇄가 끝나면 원래대로 닫는다.
 * - 주소의 #위치: 접힌 상자 안을 가리키거나, 바로 뒤에 접기 상자가 오는 제목(예: #교사용)을 가리키면 그 상자를 펼친다.
 *
 * 규칙 부분(openForPrint·openDetailsFor)은 DOM 없이 도는 순수 함수라 Vitest로 검사한다(tests/unit/lesson/details.test.ts).
 */
export interface CollapsibleLike {
  open: boolean;
}

/** 닫힌 상자를 펼치고, 다시 닫는 함수를 돌려준다(처음부터 열려 있던 상자는 건드리지 않는다). */
export function openForPrint(items: Iterable<CollapsibleLike>): () => void {
  const opened: CollapsibleLike[] = [];
  for (const item of items) {
    if (!item.open) {
      item.open = true;
      opened.push(item);
    }
  }
  return () => {
    for (const item of opened) {
      item.open = false;
    }
  };
}

/** DOM 노드에서 이 기능이 쓰는 부분 */
export interface NodeLike {
  readonly tagName: string;
  open?: boolean;
  readonly parentElement: NodeLike | null;
  readonly nextElementSibling: NodeLike | null;
}

function isDetails(node: NodeLike | null): node is NodeLike & { open: boolean } {
  return node !== null && node.tagName.toUpperCase() === 'DETAILS';
}

/**
 * 주소 #위치가 가리키는 노드를 보이게 하려고 펼칠 상자를 모두 펼친다. 펼친 상자 수를 돌려준다.
 * ① 노드를 품은 상자(바깥 상자까지) ② 노드가 제목(h2~h4)이고 바로 뒤가 상자면 그 상자
 */
export function openDetailsFor(target: NodeLike | null): number {
  let count = 0;
  for (let node = target; node; node = node.parentElement) {
    if (isDetails(node) && !node.open) {
      node.open = true;
      count += 1;
    }
  }
  if (target && /^H[2-4]$/u.test(target.tagName.toUpperCase())) {
    const next = target.nextElementSibling;
    if (isDetails(next) && !next.open) {
      next.open = true;
      count += 1;
    }
  }
  return count;
}

/** 페이지에 인쇄·#위치 기능을 붙인다(브라우저에서만 부른다). */
export function installCollapsibleHelpers(win: Window = window): void {
  let restore: (() => void) | undefined;
  win.addEventListener('beforeprint', () => {
    restore = openForPrint(win.document.querySelectorAll('details'));
  });
  win.addEventListener('afterprint', () => {
    restore?.();
    restore = undefined;
  });

  const openHashTarget = () => {
    let id = '';
    try {
      id = decodeURIComponent(win.location.hash.slice(1));
    } catch {
      return;
    }
    if (!id) {
      return;
    }
    const target = win.document.getElementById(id);
    if (target && openDetailsFor(target as unknown as NodeLike) > 0) {
      target.scrollIntoView();
    }
  };
  win.addEventListener('hashchange', openHashTarget);
  openHashTarget();
}
