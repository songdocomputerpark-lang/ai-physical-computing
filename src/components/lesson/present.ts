/**
 * 발표 모드(SPEC §7.3 "차시 페이지를 큰 글씨·한 단계씩 넘기는 화면으로", PLAN §8.5 P5-02) — 수업 중 프로젝터용.
 *
 * 한 단계 = 차시 제목 한 장, 그다음 칸(##)마다, 칸 안의 ### 제목마다, 도전 과제 상자·따라하기 예제마다, 확인 퀴즈는 문항마다.
 * 교사용 칸은 발표 화면에 나오지 않는다(학생에게 비추지 않게).
 *
 * 조작(키보드만으로 모두 된다)
 *   → 다음 단계 · ← 앞 단계         Home · End  처음·끝         Esc  발표 모드 끝내기(전체 화면이면 먼저 전체 화면이 풀린다)
 *   PageDown · Space(단추·입력칸 밖에서)  한 화면 아래로 — 이 단계가 화면보다 길어 아래가 남았으면 스크롤하고, 끝이면 다음 단계 (R1-074)
 *   PageUp  한 화면 위로 — 맨 위면 앞 단계           ↓ · ↑  조금씩 스크롤(남은 내용이 있을 때만 움직인다)
 *   아래쪽 막대의 [앞] [다음] [전체 화면] [끝내기(Esc)](이름은 "앞 단계"·"다음 단계" — 화살표 기호는 낭독기에서 숨김). 몇째 단계인지는 막대의 알림 칸(aria-live)이 읽어 준다.
 *   발표를 시작하면 초점이 막대의 [다음 단계]에 놓인다(보이는 조작에 초점이 있어 Enter·Space·→로 바로 넘긴다, R2-023).
 *   보기(라디오 단추)에 초점이 있을 때 ←→는 보기를 고르는 데 쓰인다(가로챈 키가 아님). 실습실 틀(iframe) 안의 키도 가로채지 않는다.
 *   용어 풀이 툴팁이 열려 있으면 Esc는 툴팁만 닫는다(발표는 그대로).
 *
 * 화면은 DOM을 옮기지 않고 보이지 않을 요소에 data-present-off만 붙였다 뗀다(퀴즈·실습실·툴팁의 동작이 그대로 남는다).
 * 단계 나누기(planPresentationSteps)는 DOM 없이 도는 순수 함수라 Vitest가 검사한다(tests/unit/lesson/present.test.ts).
 *
 * 한 화면에 맞추기(2026-09-25 Phase 5 검토 중요 5 — 1366×768에서 단계 대부분이 한 화면을 넘었다): 발표를 시작할 때(그리고 창 크기가
 * 바뀌거나 그림을 다 받았을 때) 단계마다 블록 높이를 재서, 화면(아래 막대 제외)보다 길면 블록 경계에서 더 잘게 나눈다(splitTallSteps).
 * 나뉜 뒤 단계에는 그 칸의 제목(##·###)을 다시 보이고 막대에 "(이어서)"를 붙인다. 블록 하나가 화면보다 크면(긴 표 등) 그 블록만 한 단계로
 * 두고 아래로 스크롤한다 — 그때 막대 위에 "▼ 아래에 더 있어요" 띠가 뜨고(R1-073), Space·PageDown이 한 화면씩 내려간다(R1-074).
 * 따라하기 예제·도전 과제 단계의 막대 글에는 예제·과제 제목을 함께 적는다(어느 예제인지 알 수 있게).
 *
 * 반대로 너무 잘게 나뉜 단계(제목 한 줄과 문장 하나뿐인 화면)는 이웃 단계와 합친다 — 합친 내용이 한 화면에 들어올 때만(mergeShort, R1-075).
 */

export type PresentBlockKind = 'h2' | 'h3' | 'break' | 'content' | 'split';

export interface PresentBlock {
  readonly kind: PresentBlockKind;
  /** 제목 글자(h2·h3), 따라하기 예제·도전 과제(break)의 이름 */
  readonly title?: string;
  /** split 블록의 항목 수(퀴즈 문항 수) */
  readonly items?: number;
}

export interface PresentSection {
  readonly title: string;
  readonly blocks: readonly PresentBlock[];
}

export interface PresentStep {
  /** 칸 번호. -1이면 차시 제목 장 */
  readonly section: number;
  /** 이 단계에서 보일 블록 번호(그 칸 안의 차례) */
  readonly blocks: readonly number[];
  /** split 블록에서 보일 항목 번호 */
  readonly item?: number;
  /** 막대·낭독에 쓰는 이름 */
  readonly label: string;
}

/** 차시 제목 한 장 + 칸마다 단계를 나눈다. */
export function planPresentationSteps(title: string, sections: readonly PresentSection[]): PresentStep[] {
  const steps: PresentStep[] = [{ section: -1, blocks: [], label: title }];

  sections.forEach((section, sectionIndex) => {
    let current: number[] = [];
    let hasContent = false;
    let subTitle: string | undefined;
    let breakTitle: string | undefined;
    const headingBlocks: number[] = [];
    const labelNow = () => (subTitle ? `${section.title} — ${subTitle}` : section.title);
    const flush = () => {
      if (current.length > 0) {
        steps.push({ section: sectionIndex, blocks: current, label: breakTitle ? `${labelNow()} · ${breakTitle}` : labelNow() });
      }
      current = [];
      hasContent = false;
      breakTitle = undefined;
    };

    section.blocks.forEach((block, blockIndex) => {
      switch (block.kind) {
        case 'h2':
          flush();
          subTitle = undefined;
          headingBlocks.push(blockIndex);
          current.push(blockIndex);
          break;
        case 'h3':
          if (hasContent) {
            flush();
          }
          subTitle = block.title;
          current.push(blockIndex);
          break;
        case 'break':
          if (hasContent) {
            flush();
          }
          current.push(blockIndex);
          hasContent = true;
          breakTitle = block.title;
          break;
        case 'split': {
          const items = block.items ?? 0;
          if (items <= 1) {
            current.push(blockIndex);
            hasContent = true;
            break;
          }
          steps.push({ section: sectionIndex, blocks: [...current, blockIndex], item: 0, label: `${labelNow()} (1/${items})` });
          for (let item = 1; item < items; item += 1) {
            steps.push({ section: sectionIndex, blocks: [...headingBlocks, blockIndex], item, label: `${labelNow()} (${item + 1}/${items})` });
          }
          current = [];
          hasContent = false;
          break;
        }
        default:
          current.push(blockIndex);
          hasContent = true;
      }
    });
    flush();
  });
  return steps;
}

/** 나뉜 뒤 단계의 막대 글 끝에 붙는 말 */
export const CONTINUED_LABEL = '(이어서)';

/** 이웃한 두 단계를 합칠 수 있는가: 같은 칸이고 둘 다 제목 장·퀴즈 문항 단계가 아닐 때(순수 함수, R1-075) */
export function isMergeable(first: PresentStep, second: PresentStep): boolean {
  return first.section >= 0 && first.section === second.section && first.item === undefined && second.item === undefined;
}

/** 두 단계의 블록 번호를 중복 없이 칸 안 차례대로 합친다(나뉜 단계가 다시 보이는 제목 블록은 한 번만) */
export function unionBlocks(first: readonly number[], second: readonly number[]): number[] {
  return Array.from(new Set([...first, ...second])).sort((a, b) => a - b);
}

/** 합친 단계의 막대 글: 뒤 단계가 앞 단계 글에 예제·과제 이름을 더한 꼴이면 그 글, 아니면 앞 단계 글 */
export function mergedLabel(first: string, second: string): string {
  return second !== first && second.startsWith(`${first} `) ? second : first;
}

/** 이 비율 이하로 화면을 쓰는 단계를 "짧다"고 본다(제목 한 줄 + 문장 하나는 대개 20% 안팎) */
export const SHORT_STEP_RATIO = 0.45;

/**
 * 단계가 아래로 넘친 만큼(px). 내용 맨 아래(contentBottom, 문서 좌표)가 막대 윗선(scrollY + barTop)보다 4px 이상 위에 있으면 0 이하다.
 * 0보다 크면 막대 밑으로 들어간 내용이 있다. 수치가 작은 값(≤ 6)은 넘친 것으로 치지 않는다 — 한 화면에 맞춘 단계(fitToBar는 막대 4px 위까지 허용)가 늘 "더 있음"으로 보이지 않게.
 */
export function hiddenBelow(contentBottom: number, scrollY: number, barTop: number): number {
  return contentBottom - (scrollY + barTop) + 4;
}

/** 아래에 더 볼 내용이 있다고 알릴 만큼 넘쳤는가 */
export function hasMoreBelow(contentBottom: number, scrollY: number, barTop: number): boolean {
  return hiddenBelow(contentBottom, scrollY, barTop) > 6;
}

export interface ScrollRequest {
  /** 1 아래로 · -1 위로 */
  readonly direction: 1 | -1;
  readonly scrollY: number;
  /** 아래쪽 막대의 윗선(화면 좌표) */
  readonly barTop: number;
  /** 이 단계 내용의 맨 아래(문서 좌표) */
  readonly contentBottom: number;
  /** 문서를 가장 많이 내릴 수 있는 값(scrollHeight − 화면 높이) */
  readonly maxScroll: number;
  /** 한 번에 움직일 크기(px) */
  readonly amount: number;
}

/**
 * Space·PageDown·PageUp·↓·↑가 쪽을 스크롤할 자리. 움직일 수 없으면(내려갈 내용이 없거나 이미 맨 위) null — 그때 Space·PageDown·PageUp은 단계를 넘긴다.
 * 아래로는 막대 위에 남은 내용이 다 보일 만큼까지만, 마지막에는 12px 여유를 더 내려 글이 막대에 바짝 붙지 않게 한다.
 */
export function scrollTargetFor(request: ScrollRequest): number | null {
  const { direction, scrollY, barTop, contentBottom, maxScroll, amount } = request;
  if (direction < 0) {
    return scrollY > 1 ? Math.max(0, scrollY - amount) : null;
  }
  const hidden = hiddenBelow(contentBottom, scrollY, barTop);
  if (hidden <= 6) {
    return null;
  }
  const top = Math.min(maxScroll, scrollY + Math.min(amount, hidden + 12));
  return top > scrollY + 0.5 ? top : null;
}

/**
 * 화면보다 긴 단계를 블록 경계에서 더 나눈다(순수 함수). heightOf(칸, 블록)는 그 블록의 높이(바깥 여백 포함),
 * available은 한 화면에 쓸 수 있는 높이다. 단계 맨 앞의 제목 블록(##·###)은 나뉜 단계마다 다시 보인다(무엇의 이어서인지 알게).
 * 제목 장·퀴즈 문항 단계·블록이 하나뿐인 단계는 그대로 둔다. 블록 하나가 화면보다 크면 그 블록 하나(와 제목)로 한 단계.
 */
export function splitTallSteps(
  steps: readonly PresentStep[],
  sections: readonly PresentSection[],
  heightOf: (section: number, block: number) => number,
  available: number,
): PresentStep[] {
  const result: PresentStep[] = [];
  for (const step of steps) {
    const section = sections[step.section];
    if (!section || step.item !== undefined || step.blocks.length < 2 || available <= 0) {
      result.push(step);
      continue;
    }
    const total = step.blocks.reduce((sum, block) => sum + heightOf(step.section, block), 0);
    if (total <= available) {
      result.push(step);
      continue;
    }
    const isHeading = (block: number) => {
      const kind = section.blocks[block]?.kind;
      return kind === 'h2' || kind === 'h3';
    };
    let headingCount = 0;
    while (headingCount < step.blocks.length - 1 && isHeading(step.blocks[headingCount] ?? -1)) {
      headingCount += 1;
    }
    const headings = step.blocks.slice(0, headingCount);
    const headingHeight = headings.reduce((sum, block) => sum + heightOf(step.section, block), 0);
    const chunks: number[][] = [];
    let chunk: number[] = [...headings];
    let used = headingHeight;
    let hasContent = false;
    for (const block of step.blocks.slice(headingCount)) {
      const height = heightOf(step.section, block);
      if (hasContent && used + height > available) {
        chunks.push(chunk);
        chunk = [...headings];
        used = headingHeight;
      }
      chunk.push(block);
      used += height;
      hasContent = true;
    }
    chunks.push(chunk);
    chunks.forEach((blocks, position) => {
      result.push({ ...step, blocks, label: position === 0 ? step.label : `${step.label} ${CONTINUED_LABEL}` });
    });
  }
  return result;
}

/** 발표 모드에서 가로채는 키 → 할 일. 가로채지 않으면 undefined */
export type PresentCommand = 'next' | 'previous' | 'first' | 'last' | 'exit' | 'lineDown' | 'lineUp';

export interface PresentKeyContext {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
  /**
   * 초점이 있는 요소 종류 — 'arrows'(←→를 스스로 쓰는 요소: 퀴즈 보기·옆으로 미는 코드 상자), 'text'(글 입력칸),
   * 'control'(단추·링크·접기 제목 등), 'none'(본문)
   */
  readonly target: 'arrows' | 'text' | 'control' | 'none';
}

/** 키 하나를 발표 모드 명령으로 바꾼다(순수 함수 — 단위 테스트). */
export function presentCommandFor(event: PresentKeyContext): PresentCommand | undefined {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return undefined;
  }
  if (event.key === 'Escape') {
    return 'exit';
  }
  if (event.target === 'text') {
    return undefined;
  }
  switch (event.key) {
    case 'PageDown':
      return 'next';
    case 'PageUp':
      return 'previous';
    case 'ArrowRight':
      return event.target === 'arrows' ? undefined : 'next';
    case 'ArrowLeft':
      return event.target === 'arrows' ? undefined : 'previous';
    case ' ':
      return event.target === 'none' ? 'next' : undefined;
    case 'ArrowDown':
      // 보기(라디오)·코드 상자(←→↑↓로 스스로 움직이는 곳)에서는 가로채지 않는다. 본문·단추·링크에서는 조금씩 스크롤한다(R1-074).
      return event.target === 'none' || event.target === 'control' ? 'lineDown' : undefined;
    case 'ArrowUp':
      return event.target === 'none' || event.target === 'control' ? 'lineUp' : undefined;
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return undefined;
  }
}

/* ───────────── 화면(브라우저에서만) ───────────── */

const OFF = 'data-present-off';
const BREAK_SELECTOR = '.box--challenge, .lesson-example-block';

interface DomSection {
  readonly element: HTMLElement;
  readonly children: HTMLElement[];
  readonly model: PresentSection;
}

function focusTarget(element: Element | null): PresentKeyContext['target'] {
  if (!element || !(element instanceof HTMLElement)) {
    return 'none';
  }
  if (element instanceof HTMLInputElement) {
    return element.type === 'radio' || element.type === 'checkbox' || element.type === 'range' ? 'arrows' : 'text';
  }
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || element.isContentEditable) {
    return 'text';
  }
  // 옆으로 미는 코드 상자(<pre tabindex="0" role="region">)는 ←→로 스스로 움직인다.
  if (element.closest('pre, [role="region"], [role="slider"], [role="radio"]')) {
    return 'arrows';
  }
  if (element.closest('button, a[href], summary, iframe, [role="button"], [tabindex]:not([tabindex="-1"])')) {
    return 'control';
  }
  return 'none';
}

/** 화면에 보이지 않는 자식(컴포넌트가 제자리에 두는 <script>·<style>, 숨긴 요소)은 단계를 만들지 않는다 */
function isPresentable(child: Element): child is HTMLElement {
  return child instanceof HTMLElement && !['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META'].includes(child.tagName) && !child.hidden;
}

/** 따라하기 예제("예제 2: 보드 쪽 …")·도전 과제 상자의 이름(막대 글에 쓴다) */
function breakTitleOf(element: HTMLElement): string | undefined {
  const clean = (text: string | null | undefined) => text?.replace(/\s+/gu, ' ').trim() ?? '';
  if (element.matches('.lesson-example-block')) {
    const number = element.dataset.exampleNumber;
    const title = clean(element.querySelector('.lesson-example__title')?.textContent);
    return title ? (number ? `예제 ${number}: ${title}` : title) : undefined;
  }
  const title = clean(element.querySelector(':scope > .box__title')?.textContent);
  return title || undefined;
}

/**
 * 발표를 끝낸 자리에 초점을 둔다. 초점을 받지 않는 요소(제목·문단)는 잠깐 tabindex="-1"을 붙였다가 초점이 떠나면 뗀다
 * (Tab 차례에는 들어가지 않고, 다음 Tab은 그 자리 다음 조작으로 간다).
 */
function focusReadingPlace(element: HTMLElement): void {
  if (!element.hasAttribute('tabindex')) {
    element.setAttribute('tabindex', '-1');
    element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true });
  }
  element.focus({ preventScroll: true });
}

/** 요소 높이 + 위아래 바깥 여백(이웃 여백이 겹치는 만큼 조금 넉넉하게 잰다) */
function outerHeight(element: HTMLElement): number {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  const margin = style ? Number.parseFloat(style.marginTop) + Number.parseFloat(style.marginBottom) : 0;
  return element.getBoundingClientRect().height + (Number.isFinite(margin) ? margin : 0);
}

function readSections(body: HTMLElement): DomSection[] {
  return Array.from(body.querySelectorAll<HTMLElement>(':scope > section.lesson-section'))
    .filter((section) => section.dataset.section !== 'teacher')
    .map((element) => {
      const children = Array.from(element.children).filter(isPresentable);
      const blocks: PresentBlock[] = children.map((child) => {
        if (child.tagName === 'H2') {
          return { kind: 'h2', title: child.textContent?.trim() ?? '' };
        }
        if (child.tagName === 'H3') {
          return { kind: 'h3', title: child.textContent?.trim() ?? '' };
        }
        if (child.hasAttribute('data-present-split')) {
          return { kind: 'split', items: child.querySelectorAll('[data-present-item]').length };
        }
        if (child.matches(BREAK_SELECTOR)) {
          return { kind: 'break', title: breakTitleOf(child) };
        }
        return { kind: 'content' };
      });
      const heading = children.find((child) => child.tagName === 'H2');
      return { element, children, model: { title: heading?.textContent?.trim() ?? '', blocks } };
    });
}

/** 차시 페이지에 발표 모드를 붙인다(LessonPresent.astro가 부른다). 여러 번 불러도 한 번만 붙는다. */
export function installLessonPresentation(doc: Document = document): void {
  const root = doc.querySelector<HTMLElement>('[data-lesson-present]');
  const article = doc.querySelector<HTMLElement>('article.lesson');
  const body = article?.querySelector<HTMLElement>('.lesson-body');
  const openButton = doc.querySelector<HTMLButtonElement>('[data-present-open]');
  if (!root || !article || !body || !openButton || root.dataset.presentReady === 'true') {
    return;
  }
  root.dataset.presentReady = 'true';
  const html = doc.documentElement;
  const main = doc.getElementById('main-content');
  const header = article.querySelector<HTMLElement>('.lesson__header');
  const status = root.querySelector<HTMLElement>('[data-present-status]');
  const previousButton = root.querySelector<HTMLButtonElement>('[data-present-previous]');
  const nextButton = root.querySelector<HTMLButtonElement>('[data-present-next]');
  const fullscreenButton = root.querySelector<HTMLButtonElement>('[data-present-fullscreen]');
  const exitButton = root.querySelector<HTMLButtonElement>('[data-present-exit]');
  const more = root.querySelector<HTMLElement>('[data-present-more]');
  const lessonTitle = article.querySelector('h1')?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';

  let sections: DomSection[] = [];
  let steps: PresentStep[] = [];
  let index = 0;
  let enteredFullscreen = false;

  const markedElements = new Set<Element>();
  const hide = (element: Element) => {
    element.setAttribute(OFF, '');
    markedElements.add(element);
  };
  const clearMarks = () => {
    for (const element of markedElements) {
      element.removeAttribute(OFF);
    }
    markedElements.clear();
  };

  const intro = () => Array.from(body.children).filter((child) => isPresentable(child) && !child.matches('section.lesson-section'));

  /** 단계 하나를 보이게 표시만 바꾼다(막대·초점·스크롤은 render가) */
  const applyStep = (step: PresentStep) => {
    clearMarks();
    // 교사용 칸은 늘 숨긴다.
    for (const teacher of body.querySelectorAll(':scope > section.lesson-section[data-section="teacher"]')) {
      hide(teacher);
    }
    if (header && step.section !== -1) {
      hide(header);
    }
    if (step.section !== -1) {
      for (const child of intro()) {
        hide(child);
      }
    }
    sections.forEach((section, sectionIndex) => {
      if (sectionIndex !== step.section) {
        hide(section.element);
        return;
      }
      section.children.forEach((child, childIndex) => {
        if (!step.blocks.includes(childIndex)) {
          hide(child);
          return;
        }
        if (step.item !== undefined && child.hasAttribute('data-present-split')) {
          child.querySelectorAll('[data-present-item]').forEach((item, itemIndex) => {
            if (itemIndex !== step.item) {
              hide(item);
            }
          });
        }
      });
    });
  };

  /** 아래 막대의 위 끝(화면 좌표). 단계 내용은 이 위에서 끝나야 가려지지 않는다. */
  const barTop = () => {
    const viewport = doc.defaultView?.innerHeight ?? 768;
    const bar = root.querySelector<HTMLElement>('.lesson-present__bar');
    const top = bar?.getBoundingClientRect().top;
    return top !== undefined && top > 0 && top <= viewport ? top : viewport - 64;
  };

  /**
   * 한 단계에 쓸 수 있는 높이 = 막대 위 끝 − 단계 내용이 시작하는 자리(쪽 위 여백·머리글) − 여유.
   * 예전에는 화면 높이에서 막대만 뺐는데, 단계 내용이 화면 맨 위가 아니라 60~100px 아래에서 시작해 "들어간다"고 본 단계의 끝이
   * 막대 밑으로 들어갔다(1366×768에서 1-1-1 31단계 가운데 10 — 2026-09-26 Phase 6 사용성 검토 지적 2).
   */
  const availableHeight = (contentTop: number) => barTop() - contentTop - 16;

  /** 단계 하나를 그려 첫 블록(바깥 여백 포함)이 화면 위에서 어디서 시작하는지 잰다 */
  const contentTopOf = (step: PresentStep): number => {
    applyStep(step);
    doc.defaultView?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    const element = sections[step.section]?.children[step.blocks[0] ?? -1];
    if (!element) {
      return 0;
    }
    const style = doc.defaultView?.getComputedStyle(element);
    const margin = style ? Number.parseFloat(style.marginTop) : 0;
    return Math.max(0, element.getBoundingClientRect().top - (Number.isFinite(margin) ? margin : 0));
  };

  /**
   * 나눈 단계를 실제로 그려 보아, 첫 내용 블록 뒤의 블록이 막대 밑으로 들어가면 그 블록부터 "(이어서)" 단계로 넘긴다
   * (여백 겹침·다시 보이는 제목까지 실제 자리로 잰다 — 높이 합으로만 나누면 조금씩 어긋났다, 2026-09-26 Phase 6 사용성 검토 지적 2).
   * 첫 내용 블록 하나가 화면보다 크면 그 블록은 그대로 두고 스크롤한다(splitTallSteps와 같은 규칙).
   */
  const fitToBar = (planned: readonly PresentStep[]): PresentStep[] => {
    const fitted: PresentStep[] = [];
    const queue = [...planned];
    const limit = barTop() - 4;
    while (queue.length > 0) {
      const step = queue.shift()!;
      const section = sections[step.section];
      if (section && step.item !== undefined && step.blocks.length > 2) {
        // 퀴즈 첫 문항 단계(제목 + 안내 문단 + 문항): 문항이 막대 밑으로 들어가면 안내 문단을 앞 단계로 뺀다 — 채점 결과가 문항 바로 아래에
        // 나오므로 문항은 막대 위에서 끝나야 한다(2026-09-26 Phase 6 사용성 검토 지적 2).
        applyStep(step);
        doc.defaultView?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        const kinds = section.model.blocks;
        const splitBlock = step.blocks[step.blocks.length - 1] ?? -1;
        const splitElement = section.children[splitBlock];
        const leading = step.blocks.slice(0, -1);
        const headings = leading.filter((block) => kinds[block]?.kind === 'h2' || kinds[block]?.kind === 'h3');
        if (splitElement && splitElement.getBoundingClientRect().bottom > limit && headings.length < leading.length) {
          fitted.push({ section: step.section, blocks: leading, label: step.label.replace(/\s*\(\d+\/\d+\)$/u, '') });
          fitted.push({ ...step, blocks: [...headings, splitBlock] });
          continue;
        }
      }
      if (!section || step.item !== undefined || step.blocks.length < 2) {
        fitted.push(step);
        continue;
      }
      applyStep(step);
      doc.defaultView?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      const kinds = section.model.blocks;
      const isHeading = (block: number) => kinds[block]?.kind === 'h2' || kinds[block]?.kind === 'h3';
      let headingCount = 0;
      while (headingCount < step.blocks.length - 1 && isHeading(step.blocks[headingCount] ?? -1)) {
        headingCount += 1;
      }
      let cut = -1;
      for (let position = headingCount + 1; position < step.blocks.length; position += 1) {
        const element = section.children[step.blocks[position] ?? -1];
        if (element && element.getBoundingClientRect().bottom > limit) {
          cut = position;
          break;
        }
      }
      if (cut < 0) {
        fitted.push(step);
        continue;
      }
      fitted.push({ ...step, blocks: step.blocks.slice(0, cut) });
      const label = step.label.endsWith(` ${CONTINUED_LABEL}`) ? step.label : `${step.label} ${CONTINUED_LABEL}`;
      queue.unshift({ ...step, blocks: [...step.blocks.slice(0, headingCount), ...step.blocks.slice(cut)], label });
    }
    return fitted;
  };

  /** 단계를 그려 보여 그 단계 블록들의 맨 위·맨 아래(화면 좌표, 스크롤 0)를 잰다 */
  const extentOf = (step: PresentStep): { top: number; bottom: number } | null => {
    const section = sections[step.section];
    if (!section) {
      return null;
    }
    applyStep(step);
    doc.defaultView?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    let top = Number.POSITIVE_INFINITY;
    let bottom = 0;
    for (const block of step.blocks) {
      const element = section.children[block];
      if (element) {
        const box = element.getBoundingClientRect();
        top = Math.min(top, box.top);
        bottom = Math.max(bottom, box.bottom);
      }
    }
    return Number.isFinite(top) ? { top, bottom } : null;
  };

  /**
   * 너무 잘게 나뉜 단계를 이웃 단계와 합친다(R1-075 — 제목 한 줄과 문장 하나뿐인 빈 화면 단계, "(이어서)"가 줄줄이 이어지는 단계).
   * 앞 단계가 화면의 SHORT_STEP_RATIO 이하만 쓰고, 합친 내용이 막대 위에서 끝날 때만 합친다 — 합쳐서 넘치면 그대로 둔다.
   * 합친 단계가 또 짧으면 다음 단계와 이어서 시도한다. 퀴즈 문항 단계·제목 장·다른 칸과는 합치지 않는다(isMergeable).
   */
  const mergeShort = (planned: readonly PresentStep[]): PresentStep[] => {
    const limit = barTop() - 4;
    const merged: PresentStep[] = [];
    for (const step of planned) {
      const previous = merged[merged.length - 1];
      if (previous && isMergeable(previous, step)) {
        const before = extentOf(previous);
        if (before && before.bottom - before.top <= SHORT_STEP_RATIO * (limit - before.top)) {
          const candidate: PresentStep = {
            ...previous,
            blocks: unionBlocks(previous.blocks, step.blocks),
            label: mergedLabel(previous.label, step.label),
          };
          const after = extentOf(candidate);
          if (after && after.bottom <= limit) {
            merged[merged.length - 1] = candidate;
            continue;
          }
        }
      }
      merged.push(step);
    }
    return merged;
  };

  /**
   * 단계를 다시 나눈다: 기본 단계(planPresentationSteps)를 하나씩 보여 블록 높이를 잰 뒤 화면보다 긴 단계를 쪼개고(splitTallSteps),
   * 그린 자리로 한 번 더 맞춘다(fitToBar). keep이 있으면 보고 있던 자리(칸·첫 내용 블록)가 든 단계로 돌아온다.
   */
  const replan = (keep?: PresentStep) => {
    const models = sections.map((section) => section.model);
    const base = planPresentationSteps(lessonTitle, models);
    const heights = new Map<string, number>();
    let contentTop: number | null = null;
    for (const step of base) {
      if (step.section < 0 || step.item !== undefined || step.blocks.length < 2) {
        continue;
      }
      if (contentTop === null) {
        contentTop = contentTopOf(step);
      } else {
        applyStep(step);
      }
      const children = sections[step.section]?.children ?? [];
      for (const block of step.blocks) {
        const element = children[block];
        if (element) {
          heights.set(`${step.section}:${block}`, outerHeight(element));
        }
      }
    }
    steps = mergeShort(fitToBar(splitTallSteps(base, models, (section, block) => heights.get(`${section}:${block}`) ?? 0, availableHeight(contentTop ?? 0))));
    if (keep) {
      const kinds = models[keep.section]?.blocks ?? [];
      const anchor = keep.blocks.find((block) => kinds[block]?.kind !== 'h2' && kinds[block]?.kind !== 'h3') ?? keep.blocks[0];
      const found = steps.findIndex(
        (step) => step.section === keep.section && step.item === keep.item && (anchor === undefined || step.blocks.includes(anchor)),
      );
      index = found >= 0 ? found : Math.min(index, steps.length - 1);
    }
  };

  let replanTimer: number | undefined;
  const scheduleReplan = () => {
    if (!html.hasAttribute('data-presenting')) {
      return;
    }
    if (replanTimer !== undefined) {
      doc.defaultView?.clearTimeout(replanTimer);
    }
    replanTimer = doc.defaultView?.setTimeout(() => {
      replanTimer = undefined;
      if (html.hasAttribute('data-presenting')) {
        replan(steps[index]);
        render();
      }
    }, 200);
  };

  const render = () => {
    const step = steps[index];
    if (!step) {
      return;
    }
    applyStep(step);
    if (status) {
      status.textContent = `${index + 1} / ${steps.length} · ${step.label}`;
    }
    if (previousButton) {
      previousButton.disabled = index === 0;
    }
    if (nextButton) {
      nextButton.disabled = index === steps.length - 1;
    }
    root.dataset.presentStep = String(index + 1);
    root.dataset.presentTotal = String(steps.length);
    // 초점이 숨긴 곳에 남아 있으면 본문으로 옮긴다(키보드 사용자가 길을 잃지 않게).
    const active = doc.activeElement;
    if (active instanceof HTMLElement && active !== doc.body && active.closest(`[${OFF}]`)) {
      main?.focus({ preventScroll: true });
    }
    doc.defaultView?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    syncBarHeight();
    updateMore();
  };

  /** 막대 높이를 쪽 아래 여백과 "더 있어요" 띠 자리에 쓰도록 CSS 변수로 알린다(막대 높이는 단계마다 같지만 창 크기에 따라 다르다) */
  const syncBarHeight = () => {
    const height = root.querySelector<HTMLElement>('.lesson-present__bar')?.offsetHeight ?? 0;
    if (height > 0) {
      html.style.setProperty('--present-bar-h', `${height}px`);
    }
  };

  /** 이 단계 내용의 맨 아래(문서 좌표). 보이는 블록만 잰다 — 머리글·쪽 아래 여백은 빼고 막대에 가려질 내용만 본다 */
  const contentBottom = (): number => {
    const scrollY = doc.defaultView?.scrollY ?? 0;
    const step = steps[index];
    if (!step) {
      return 0;
    }
    const targets: Element[] =
      step.section === -1
        ? [...(header ? [header] : []), ...intro()]
        : step.blocks.flatMap((block) => {
            const element = sections[step.section]?.children[block];
            return element ? [element] : [];
          });
    let bottom = 0;
    for (const element of targets) {
      if (!element.closest(`[${OFF}]`)) {
        bottom = Math.max(bottom, element.getBoundingClientRect().bottom);
      }
    }
    return bottom + scrollY;
  };

  /** 아래에 더 있으면 "▼ 아래에 더 있어요" 띠를 보인다 */
  const updateMore = () => {
    if (!more) {
      return;
    }
    const win = doc.defaultView;
    more.hidden = !(html.hasAttribute('data-presenting') && win && hasMoreBelow(contentBottom(), win.scrollY, barTop()));
  };

  /** Space·PageDown·PageUp(한 화면)·↓·↑(조금씩)로 쪽을 스크롤한다. 움직였으면 true, 움직일 수 없으면 false */
  const scrollBy = (direction: 1 | -1, amount: number): boolean => {
    const win = doc.defaultView;
    if (!win) {
      return false;
    }
    const target = scrollTargetFor({
      direction,
      scrollY: win.scrollY,
      barTop: barTop(),
      contentBottom: contentBottom(),
      maxScroll: Math.max(0, html.scrollHeight - win.innerHeight),
      amount,
    });
    if (target === null) {
      return false;
    }
    win.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior });
    updateMore();
    return true;
  };

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(steps.length - 1, next));
    if (clamped !== index) {
      index = clamped;
      render();
    }
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return;
    }
    // 시작 초점이 [다음 단계]에 있으므로(R2-023) 그 단추 위의 Space도 본문 Space처럼 다룬다 — 이 단계 아래가 남았으면 한 화면 스크롤,
    // 끝이면 다음 단계(통합 확인: 단추가 눌려 긴 단계의 아래쪽을 건너뛰었다). Enter는 단추 그대로 다음 단계.
    const spaceOnNext = event.key === ' ' && nextButton !== null && doc.activeElement === nextButton;
    const command = presentCommandFor({
      key: event.key,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      target: spaceOnNext ? 'none' : focusTarget(doc.activeElement),
    });
    if (!command) {
      return;
    }
    // 용어 풀이 툴팁이 열려 있으면 Esc는 툴팁만 닫는다(툴팁보다 먼저 듣도록 캡처 단계에 걸어 둔 까닭).
    if (command === 'exit' && doc.querySelector('.glossary-term__link[data-tooltip="open"]')) {
      return;
    }
    if (command === 'lineDown' || command === 'lineUp') {
      // 쪽 스크롤은 우리가 맡는다(남은 내용이 없을 때 쪽이 빈 여백으로 밀려 내려가지 않게 늘 막는다)
      event.preventDefault();
      scrollBy(command === 'lineDown' ? 1 : -1, Math.max(48, Math.round(barTop() * 0.2)));
      return;
    }
    // PageDown·Space는 이 단계가 아래로 더 있으면 한 화면 스크롤, 끝이면 다음 단계. PageUp은 위로 더 있으면 스크롤, 맨 위면 앞 단계(R1-074)
    const pageKey = (command === 'next' && (event.key === 'PageDown' || event.key === ' ')) || (command === 'previous' && event.key === 'PageUp');
    if (pageKey && scrollBy(command === 'next' ? 1 : -1, Math.max(80, Math.round(barTop() - 72)))) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    if (command === 'next') {
      go(index + 1);
    } else if (command === 'previous') {
      go(index - 1);
    } else if (command === 'first') {
      go(0);
    } else if (command === 'last') {
      go(steps.length - 1);
    } else {
      exit();
    }
  };

  const updateFullscreenButton = () => {
    if (fullscreenButton) {
      const on = Boolean(doc.fullscreenElement);
      fullscreenButton.setAttribute('aria-pressed', on ? 'true' : 'false');
      fullscreenButton.textContent = on ? '전체 화면 끄기' : '전체 화면';
    }
  };

  const enter = () => {
    sections = readSections(body);
    html.dataset.presenting = '';
    root.hidden = false;
    // 늦게 받는(lazy) 그림은 그 단계를 보여 줄 때에야 받아져, 발표 도중에 높이가 바뀌고 단계 수가 달라졌다(휴대폰 23 → 25단계).
    // 발표를 시작하면 이 차시의 그림을 모두 받는다 — 다 받으면 아래 'load' 듣기가 한 번 더 나눈다.
    for (const image of body.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')) {
      image.loading = 'eager';
    }
    // 큰 글씨(발표 화면 스타일)가 걸린 뒤에 재야 한 화면에 맞게 나뉜다.
    replan();
    index = 0;
    doc.addEventListener('keydown', onKeydown, true);
    doc.defaultView?.addEventListener('resize', scheduleReplan);
    doc.defaultView?.addEventListener('scroll', updateMore, { passive: true });
    render();
    // 시작 초점: 막대의 [다음 단계](마지막 단계뿐인 차시면 [끝내기]). 보이는 조작에 초점이 있어야 키보드·낭독기 사용자가 어디 있는지 안다 —
    // 예전에는 보이지 않는 main에 놓였다(R2-023). 쪽을 움직이지 않는다(preventScroll).
    (nextButton && !nextButton.disabled ? nextButton : (exitButton ?? main))?.focus({ preventScroll: true });
    // 느린 망에서는 글꼴(Pretendard)을 다 받기 전에 발표를 시작할 수 있다 — 대체 글꼴로 잰 자리가 조금 어긋나 막대에 걸리지 않게,
    // 글꼴을 다 받으면 한 번 더 나눈다(보고 있던 자리는 그대로, 이미 받았으면 같은 결과).
    void doc.fonts?.ready.then(() => scheduleReplan()).catch(() => undefined);
  };

  const exit = () => {
    const step = steps[index];
    const anchor = step && step.section >= 0 ? sections[step.section]?.children[step.blocks[0] ?? 0] : undefined;
    doc.removeEventListener('keydown', onKeydown, true);
    doc.defaultView?.removeEventListener('resize', scheduleReplan);
    doc.defaultView?.removeEventListener('scroll', updateMore);
    clearMarks();
    delete html.dataset.presenting;
    html.style.removeProperty('--present-bar-h');
    if (more) {
      more.hidden = true;
    }
    root.hidden = true;
    delete root.dataset.presentStep;
    delete root.dataset.presentTotal;
    if (enteredFullscreen && doc.fullscreenElement) {
      void doc.exitFullscreen().catch(() => undefined);
    }
    enteredFullscreen = false;
    // 발표를 끝낸 자리(마지막으로 본 칸)에서 이어 읽게 한다. 초점도 그 자리(첫 블록 — 보통 칸 제목)에 둔다: 쪽 맨 위 [발표 모드]로 돌리면
    // 초점이 화면 밖에 있어 보이지 않고 다음 Tab이 쪽 위 "이 차시의 차례"로 뛰어 읽던 자리를 잃었다(2026-09-26 Phase 6 사용성 검토 지적 10).
    if (anchor) {
      anchor.scrollIntoView({ block: 'start' });
      focusReadingPlace(anchor);
    } else {
      openButton.focus();
    }
  };

  openButton.addEventListener('click', enter);
  // 발표 중 퀴즈를 채점하면 결과 글이 문항 바로 아래에 나온다 — 아래 막대에 가리지 않게 보이는 곳으로 옮긴다
  // (html의 scroll-padding-block-end 6rem을 따른다, 2026-09-26 Phase 6 사용성 검토 지적 2).
  body.addEventListener('click', (event) => {
    if (!html.hasAttribute('data-presenting') || !(event.target instanceof Element)) {
      return;
    }
    const feedback = event.target.closest('[data-quiz-check]')?.closest('[data-quiz-item]')?.querySelector<HTMLElement>('[data-quiz-feedback]');
    if (feedback) {
      doc.defaultView?.requestAnimationFrame(() => feedback.scrollIntoView({ block: 'nearest' }));
    }
  });
  // 늦게 받은 그림(느린 받기)의 높이가 정해지면 다시 나눈다(발표 중에만).
  body.addEventListener(
    'load',
    (event) => {
      if (event.target instanceof HTMLImageElement) {
        scheduleReplan();
      }
    },
    true,
  );
  previousButton?.addEventListener('click', () => go(index - 1));
  nextButton?.addEventListener('click', () => go(index + 1));
  exitButton?.addEventListener('click', () => exit());
  if (fullscreenButton) {
    if (!doc.fullscreenEnabled) {
      fullscreenButton.hidden = true;
    } else {
      fullscreenButton.addEventListener('click', () => {
        if (doc.fullscreenElement) {
          void doc.exitFullscreen().catch(() => undefined);
        } else {
          void html
            .requestFullscreen()
            .then(() => {
              enteredFullscreen = true;
            })
            .catch(() => undefined);
        }
      });
      doc.addEventListener('fullscreenchange', updateFullscreenButton);
    }
  }
  openButton.hidden = false;
}
