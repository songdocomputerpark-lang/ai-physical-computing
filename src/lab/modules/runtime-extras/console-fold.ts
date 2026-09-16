/**
 * 콘솔 오래된 줄 접기(P2-10 "콘솔 줄 수 제한(오래된 줄 접기)", CODE_MAPPING §3.3 print 행).
 *
 * 실습실 틀의 콘솔(src/lab/controls/lab-shell.ts appendConsole)은 출력 조각(span)을 뒤에 붙이고 2,000조각을 넘으면 앞에서 지운다.
 * 매 프레임 print하는 예제(f072·f126·f133·f140)는 몇 초 만에 수백 줄이 쌓여 화면이 길어지므로, 이 모듈이 콘솔을 지켜보다(MutationObserver)
 * 보이는 조각이 FOLD_VISIBLE_MAX를 넘으면 오래된 조각을 접힌 상자(hidden span)로 옮기고 맨 위에 [이전 출력 N줄 접힘 — 펼치기] 버튼을 둔다.
 * 접힌 것까지 합쳐 FOLD_TOTAL_MAX 조각을 넘으면 가장 오래된 것부터 버린다(콘솔 틀의 2,000 상한은 직접 자식 수만 세므로 여기서 따로 지킨다).
 * [콘솔 지우기](replaceChildren)는 접힌 것도 함께 지우고 이 모듈은 상태를 처음으로 돌린다.
 *
 * "줄"은 조각 안의 줄바꿈 수로 센다(stdout이 줄 중간에서 조각날 수 있어 어림값 — 안내 글에만 쓴다).
 * planFold·countLines·foldToggleText는 순수 함수라 단위 테스트가 검사하고, DOM 동작은 브라우저 테스트(tests/e2e/lab-runner.spec.ts)가 본다.
 * 테스트가 읽는 값: 버튼 [data-runtime-extras-fold-toggle](aria-expanded, data-folded-lines), 접힌 상자 [data-runtime-extras-fold].
 */

/** 접지 않고 보이는 조각(콘솔 자식 span) 수 */
export const FOLD_VISIBLE_MAX = 300;
/** 보이는 것과 접힌 것을 합친 조각 수 상한(넘으면 가장 오래된 접힌 조각부터 버린다) */
export const FOLD_TOTAL_MAX = 3000;

export interface FoldLimits {
  readonly visibleMax: number;
  readonly totalMax: number;
}

export const DEFAULT_FOLD_LIMITS: FoldLimits = Object.freeze({ visibleMax: FOLD_VISIBLE_MAX, totalMax: FOLD_TOTAL_MAX });

/** 글자 속 줄 수(마지막 줄바꿈 뒤에 글자가 없으면 그 줄은 세지 않는다). 빈 글자는 0. */
export function countLines(text: string): number {
  if (text === '') {
    return 0;
  }
  let count = 0;
  for (const char of text) {
    if (char === '\n') {
      count += 1;
    }
  }
  return text.endsWith('\n') ? count : count + 1;
}

/**
 * 보이는 조각 수와 접힌 조각 수를 보고 몇 조각을 접고(moveToFold) 접힌 것에서 몇 조각을 버릴지(dropFromFold) 정한다.
 * 접힌 상자는 totalMax - visibleMax 조각까지만 둔다.
 */
export function planFold(visibleChunks: number, foldedChunks: number, limits: FoldLimits = DEFAULT_FOLD_LIMITS): { moveToFold: number; dropFromFold: number } {
  const moveToFold = Math.max(0, visibleChunks - limits.visibleMax);
  const foldCapacity = Math.max(0, limits.totalMax - limits.visibleMax);
  const dropFromFold = Math.max(0, foldedChunks + moveToFold - foldCapacity);
  return { moveToFold, dropFromFold };
}

/** 접기 버튼 글 */
export function foldToggleText(foldedLines: number, expanded: boolean): string {
  const lines = foldedLines.toLocaleString('ko-KR');
  return expanded ? `이전 출력 ${lines}줄 — 다시 접기` : `이전 출력 ${lines}줄 접힘 — 펼치기`;
}

export interface ConsoleFold {
  /** 접힌 조각 수 */
  readonly foldedChunks: number;
  /** 접힌 줄 수(어림) */
  readonly foldedLines: number;
  readonly expanded: boolean;
  /** 지금 콘솔 상태로 다시 접는다(관찰자가 부르지만 테스트·정리에서 직접 부를 수 있다) */
  refresh(): void;
  dispose(): void;
}

/**
 * 콘솔 상자([data-lab-console])에 접기를 붙인다. 상자가 없거나 MutationObserver가 없는 환경이면 null.
 * 접힌 상자와 버튼은 콘솔 맨 앞에 둔다(콘솔 틀은 뒤에만 붙이므로 순서가 지켜진다).
 */
export function mountConsoleFold(box: HTMLElement | null, limits: FoldLimits = DEFAULT_FOLD_LIMITS): ConsoleFold | null {
  if (!box || typeof MutationObserver === 'undefined') {
    return null;
  }
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'runtime-extras-fold__toggle';
  toggle.dataset.runtimeExtrasFoldToggle = '';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.hidden = true;
  const holder = document.createElement('span');
  holder.className = 'runtime-extras-fold';
  holder.dataset.runtimeExtrasFold = '';
  holder.hidden = true;
  const lineCounts = new WeakMap<Element, number>();
  let foldedLines = 0;
  let expanded = false;
  let updating = false;

  const renderToggle = () => {
    const hasFolded = holder.childElementCount > 0;
    toggle.hidden = !hasFolded;
    toggle.textContent = foldToggleText(foldedLines, expanded);
    toggle.dataset.foldedLines = String(foldedLines);
    toggle.setAttribute('aria-expanded', String(expanded && hasFolded));
    holder.hidden = !(expanded && hasFolded);
  };

  const resetAfterClear = () => {
    holder.replaceChildren();
    foldedLines = 0;
    expanded = false;
  };

  const refresh = () => {
    if (updating) {
      return;
    }
    updating = true;
    try {
      // [콘솔 지우기]가 우리 요소까지 지웠으면 접힌 것도 없는 셈이다.
      if (!box.contains(toggle) || !box.contains(holder)) {
        resetAfterClear();
      }
      const chunks = Array.from(box.children).filter((element) => element !== toggle && element !== holder);
      const plan = planFold(chunks.length, holder.childElementCount, limits);
      if (plan.moveToFold > 0) {
        if (!box.contains(toggle)) {
          box.prepend(toggle);
        }
        if (!box.contains(holder)) {
          toggle.after(holder);
        }
        for (const element of chunks.slice(0, plan.moveToFold)) {
          const lines = countLines(element.textContent ?? '');
          lineCounts.set(element, lines);
          foldedLines += lines;
          holder.append(element);
        }
      }
      for (let index = 0; index < plan.dropFromFold; index += 1) {
        const oldest = holder.firstElementChild;
        if (!oldest) {
          break;
        }
        foldedLines = Math.max(0, foldedLines - (lineCounts.get(oldest) ?? countLines(oldest.textContent ?? '')));
        oldest.remove();
      }
      if (box.contains(toggle)) {
        renderToggle();
      }
    } finally {
      updating = false;
    }
  };

  const onToggle = () => {
    expanded = !expanded;
    renderToggle();
    if (expanded) {
      box.scrollTop = 0;
    }
  };
  toggle.addEventListener('click', onToggle);

  const observer = new MutationObserver(() => refresh());
  observer.observe(box, { childList: true });
  refresh();

  return {
    get foldedChunks() {
      return holder.childElementCount;
    },
    get foldedLines() {
      return foldedLines;
    },
    get expanded() {
      return expanded;
    },
    refresh,
    dispose() {
      observer.disconnect();
      toggle.removeEventListener('click', onToggle);
      // 접힌 조각은 다시 콘솔에 돌려놓는다(모듈만 떠나도 출력은 남게).
      if (box.contains(holder)) {
        holder.replaceWith(...Array.from(holder.children));
      }
      toggle.remove();
    },
  };
}
