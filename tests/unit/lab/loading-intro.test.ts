// @vitest-environment jsdom
// 첫 준비 동안 준비 칸을 DOM째 맨 위 자리로 옮기고 되돌리는 intro.ts(판 1.2.0 — PROGRESS 미해결 218, WCAG 2.4.3 초점 차례).
// 예전에는 CSS(grid-template-areas)로 보이게만 올려 준비 칸의 Tab 차례가 편집칸·입력/출력·조절 패널 뒤였다. 이제 DOM 차례 = 보이는 차례.
// 진짜 화면의 Tab 걷기·접힐 때 초점은 tests/e2e/lab-loading.spec.ts·a11y-keyboard.spec.ts가 본다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { endLoadingIntro, isInLoadingIntro, moveKeepingFocus, placeInLoadingIntro } from '../../../src/lab/modules/loading/intro.ts';

/** 실습실 틀(LabShell.astro)의 뼈대: 조작 줄 → 맨 위 자리 → 편집칸·입력/출력·조절 패널 → 넓은 모듈 줄(데스크톱·준비·[보내기]) → 콘솔 */
function labHtml(name: string): string {
  return `
    <div class="lab" data-lab data-lab-id="${name}" data-loading-intro="yes">
      <div class="lab__toolbar"><button data-lab-run>실행</button></div>
      <div class="lab__intro" data-lab-intro></div>
      <div class="lab__grid">
        <section class="lab__editor"><button data-lab-font-smaller>A−</button></section>
        <section class="lab__io"><button data-io>입력 켜기</button></section>
        <section class="lab__panel"><button data-panel>조절 값 쓰는 법</button></section>
        <div class="lab__modules">
          <section class="lab__module" data-lab-module-panel="desktop" hidden><button>미니게임</button></section>
          <section class="lab__module" data-lab-module-panel="loading" hidden>
            <div data-loading-panel><button data-loading-toggle>접기</button><button data-loading-next>다음 →</button></div>
          </section>
          <section class="lab__module" data-lab-module-panel="mqtt" hidden><button>연결</button></section>
        </div>
        <section class="lab__console"><button data-lab-console-clear>콘솔 지우기</button></section>
      </div>
    </div>`;
}

function rootOf(name: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-lab-id="${name}"]`)!;
}

function panelOf(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>('[data-lab-module-panel="loading"]')!;
}

/** a가 DOM(= Tab) 차례로 b보다 앞인가 */
function before(a: Element, b: Element): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** 넓은 모듈 줄의 칸 차례(id) */
function moduleOrder(root: HTMLElement): string[] {
  return [...root.querySelectorAll('.lab__modules > [data-lab-module-panel]')].map((element) => element.getAttribute('data-lab-module-panel') ?? '');
}

const originalMoveBefore = (Element.prototype as unknown as { moveBefore?: unknown }).moveBefore;

beforeEach(() => {
  document.body.innerHTML = labHtml('vision');
});

afterEach(() => {
  const proto = Element.prototype as unknown as { moveBefore?: unknown };
  if (originalMoveBefore === undefined) {
    delete proto.moveBefore;
  } else {
    proto.moveBefore = originalMoveBefore;
  }
});

describe('placeInLoadingIntro — 첫 준비 중이면 준비 칸을 편집칸 앞 자리로 DOM째', () => {
  it('준비 칸이 조작 줄 다음·편집칸 앞으로 오고(Tab 차례 = 보이는 차례), 다른 넓은 칸(데스크톱·MQTT)은 제자리에 남는다', () => {
    const root = rootOf('vision');
    const panel = panelOf(root);
    expect(before(root.querySelector('[data-lab-font-smaller]')!, panel)).toBe(true); // 예전: 편집칸 뒤
    expect(placeInLoadingIntro(root, panel)).toBe(true);
    expect(panel.parentElement?.matches('[data-lab-intro]')).toBe(true);
    expect(isInLoadingIntro(panel)).toBe(true);
    expect(before(root.querySelector('[data-lab-run]')!, panel)).toBe(true);
    expect(before(panel, root.querySelector('[data-lab-font-smaller]')!)).toBe(true);
    expect(before(panel, root.querySelector('[data-io]')!)).toBe(true);
    expect(moduleOrder(root)).toEqual(['desktop', 'mqtt']);
  });

  it('두 번 불러도 한 번만 옮기고, 첫 준비가 끝난 뒤(data-loading-intro="no")·자리가 없는 쪽에서는 옮기지 않는다', () => {
    const root = rootOf('vision');
    const panel = panelOf(root);
    expect(placeInLoadingIntro(root, panel)).toBe(true);
    expect(placeInLoadingIntro(root, panel)).toBe(false);

    document.body.innerHTML = labHtml('esp32');
    const done = rootOf('esp32');
    done.dataset.loadingIntro = 'no';
    expect(placeInLoadingIntro(done, panelOf(done))).toBe(false);
    expect(moduleOrder(done)).toEqual(['desktop', 'loading', 'mqtt']);

    document.body.innerHTML = labHtml('dev');
    const noSlot = rootOf('dev');
    noSlot.querySelector('[data-lab-intro]')!.remove();
    expect(placeInLoadingIntro(noSlot, panelOf(noSlot))).toBe(false);
  });
});

describe('endLoadingIntro — 접히거나 [실행]을 누르면 제자리로(곧바로)', () => {
  it('data-loading-intro를 no로 바꾸고 준비 칸을 원래 차례(데스크톱과 MQTT 사이)로 돌려놓으며 제자리 표시를 지운다', () => {
    const root = rootOf('vision');
    const panel = panelOf(root);
    placeInLoadingIntro(root, panel);
    endLoadingIntro(root);
    expect(root.dataset.loadingIntro).toBe('no');
    expect(moduleOrder(root)).toEqual(['desktop', 'loading', 'mqtt']);
    expect(root.querySelector('[data-lab-intro]')!.children).toHaveLength(0);
    expect(isInLoadingIntro(panel)).toBe(false);
    const comments = [...root.querySelector('.lab__modules')!.childNodes].filter((node) => node.nodeType === Node.COMMENT_NODE);
    expect(comments).toEqual([]);
    // 두 번 불러도 괜찮다
    endLoadingIntro(root);
    expect(moduleOrder(root)).toEqual(['desktop', 'loading', 'mqtt']);
  });

  it('준비 칸을 옮기기 전에 불러도(모듈이 아직 붙지 않음) 속성만 바꾼다 — 그 뒤에 붙는 준비 칸은 맨 위로 가지 않는다', () => {
    const root = rootOf('vision');
    endLoadingIntro(root);
    expect(root.dataset.loadingIntro).toBe('no');
    expect(placeInLoadingIntro(root, panelOf(root))).toBe(false);
    expect(moduleOrder(root)).toEqual(['desktop', 'loading', 'mqtt']);
  });

  it('칸 안의 초점은 옮긴 뒤에도 그 단추에 남는다(원자 이동이 없는 브라우저 — insertBefore 뒤 되돌림)', () => {
    delete (Element.prototype as unknown as { moveBefore?: unknown }).moveBefore;
    const root = rootOf('vision');
    const panel = panelOf(root);
    panel.hidden = false;
    placeInLoadingIntro(root, panel);
    const toggle = panel.querySelector<HTMLButtonElement>('[data-loading-toggle]')!;
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    endLoadingIntro(root);
    expect(document.activeElement).toBe(toggle);
    expect(moduleOrder(root)).toEqual(['desktop', 'loading', 'mqtt']);
  });

  it('원자 이동(moveBefore)이 있으면 그것으로 옮긴다(초점·상태를 브라우저가 지킴)', () => {
    const calls: string[] = [];
    (Element.prototype as unknown as { moveBefore: (node: Node, child: Node | null) => void }).moveBefore = function (this: Element, node: Node, child: Node | null) {
      calls.push(`${(node as Element).getAttribute('data-lab-module-panel')}→${this.className}`);
      this.insertBefore(node, child);
    };
    const root = rootOf('vision');
    const panel = panelOf(root);
    placeInLoadingIntro(root, panel);
    endLoadingIntro(root);
    expect(calls).toEqual(['loading→lab__intro', 'loading→lab__modules']);
  });

  it('초점 요소가 든 칸을 원자 이동으로 옮겨 브라우저가 화면을 굴려도 옮기기 전 화면 위치로 되돌린다(판 1.2.1 — 검토 E14, Edge 154 0 → 1,485px)', () => {
    let fakeScrollY = 0;
    const scrolled: number[] = [];
    const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');
    const originalScrollTo = window.scrollTo;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => fakeScrollY });
    window.scrollTo = ((options: ScrollToOptions) => {
      scrolled.push(options.top ?? -1);
      fakeScrollY = options.top ?? fakeScrollY;
    }) as typeof window.scrollTo;
    (Element.prototype as unknown as { moveBefore: (node: Node, child: Node | null) => void }).moveBefore = function (this: Element, node: Node, child: Node | null) {
      const hadFocus = (node as Element).contains(document.activeElement);
      this.insertBefore(node, child);
      if (hadFocus) {
        fakeScrollY = 1485; // 브라우저가 옮긴 초점 요소를 화면 안으로 굴린 것을 흉내(jsdom은 insertBefore에서 초점을 잃으므로 옮기기 전에 본다)
      }
    };
    try {
      const root = rootOf('vision');
      const panel = panelOf(root);
      panel.hidden = false;
      placeInLoadingIntro(root, panel);
      expect(scrolled).toEqual([]); // 초점이 칸 밖이면 건드리지 않는다
      const toggle = panel.querySelector<HTMLButtonElement>('[data-loading-toggle]')!;
      toggle.focus();
      endLoadingIntro(root);
      expect(document.activeElement).toBe(toggle);
      expect(scrolled).toEqual([0]);
      expect(window.scrollY).toBe(0);
    } finally {
      window.scrollTo = originalScrollTo;
      if (scrollYDescriptor) {
        Object.defineProperty(window, 'scrollY', scrollYDescriptor);
      } else {
        delete (window as unknown as { scrollY?: number }).scrollY;
      }
    }
  });

  it('원자 이동이 실패하면(예외) 보통 방법으로 옮긴다', () => {
    (Element.prototype as unknown as { moveBefore: () => void }).moveBefore = () => {
      throw new DOMException('state', 'HierarchyRequestError');
    };
    const root = rootOf('vision');
    const panel = panelOf(root);
    expect(placeInLoadingIntro(root, panel)).toBe(true);
    expect(panel.parentElement?.matches('[data-lab-intro]')).toBe(true);
    endLoadingIntro(root);
    expect(moduleOrder(root)).toEqual(['desktop', 'loading', 'mqtt']);
  });
});

describe('한 문서에 실습실 틀이 둘(4단원 통합 화면)', () => {
  it('칸마다 자기 틀의 맨 위 자리로 가고, 한쪽이 끝나도 다른 쪽은 그대로다', () => {
    document.body.innerHTML = labHtml('vision') + labHtml('esp32');
    const pc = rootOf('vision');
    const board = rootOf('esp32');
    placeInLoadingIntro(pc, panelOf(pc));
    placeInLoadingIntro(board, panelOf(board));
    expect(pc.querySelector('[data-lab-intro]')!.contains(panelOf(pc))).toBe(true);
    expect(board.querySelector('[data-lab-intro]')!.contains(panelOf(board))).toBe(true);
    endLoadingIntro(board);
    expect(moduleOrder(board)).toEqual(['desktop', 'loading', 'mqtt']);
    expect(pc.dataset.loadingIntro).toBe('yes');
    expect(isInLoadingIntro(panelOf(pc))).toBe(true);
  });
});

describe('moveKeepingFocus', () => {
  it('칸 밖에 있던 초점은 건드리지 않는다', () => {
    delete (Element.prototype as unknown as { moveBefore?: unknown }).moveBefore;
    const root = rootOf('vision');
    const run = root.querySelector<HTMLButtonElement>('[data-lab-run]')!;
    run.focus();
    moveKeepingFocus(panelOf(root), root.querySelector('[data-lab-intro]')!, null);
    expect(document.activeElement).toBe(run);
  });
});

describe('맨 위 자리의 제목 단계(R1-104)', () => {
  /** 준비 칸에 제목(h3)과 카드 제목(h4)을 넣고, 실습실 칸 제목(.lab__heading h2)을 편집칸에 둔다 */
  function withHeadings(): HTMLElement {
    const root = rootOf('vision');
    root.querySelector('.lab__editor')!.insertAdjacentHTML('afterbegin', '<h2 class="lab__heading">코드</h2>');
    panelOf(root).querySelector('[data-loading-panel]')!.insertAdjacentHTML('afterbegin', '<h3 data-loading-title>준비</h3><h4 data-loading-card-title>카드</h4>');
    return root;
  }

  it('맨 위 자리에 있는 동안은 실습실 칸 제목과 같은 단계(h2)로, 카드 제목은 한 단계 아래(h3)로 읽히고, 제자리로 돌아가면 태그 단계로 돌아간다', () => {
    const root = withHeadings();
    const panel = panelOf(root);
    expect(placeInLoadingIntro(root, panel)).toBe(true);
    expect(panel.querySelector('[data-loading-title]')?.getAttribute('aria-level')).toBe('2');
    expect(panel.querySelector('[data-loading-card-title]')?.getAttribute('aria-level')).toBe('3');
    endLoadingIntro(root);
    expect(panel.querySelector('[data-loading-title]')?.hasAttribute('aria-level')).toBe(false);
    expect(panel.querySelector('[data-loading-card-title]')?.hasAttribute('aria-level')).toBe(false);
  });

  it('칸 제목이 h3인 틀(4단원 통합 화면)에서는 같은 단계(3)다', () => {
    const root = withHeadings();
    root.querySelector('.lab__heading')!.outerHTML = '<h3 class="lab__heading">코드 — 컴퓨터 칸</h3>';
    placeInLoadingIntro(root, panelOf(root));
    expect(panelOf(root).querySelector('[data-loading-title]')?.getAttribute('aria-level')).toBe('3');
    expect(panelOf(root).querySelector('[data-loading-card-title]')?.getAttribute('aria-level')).toBe('4');
  });
});
