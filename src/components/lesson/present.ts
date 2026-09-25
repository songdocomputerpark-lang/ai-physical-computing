/**
 * 발표 모드(SPEC §7.3 "차시 페이지를 큰 글씨·한 단계씩 넘기는 화면으로", PLAN §8.5 P5-02) — 수업 중 프로젝터용.
 *
 * 한 단계 = 차시 제목 한 장, 그다음 칸(##)마다, 칸 안의 ### 제목마다, 도전 과제 상자·따라하기 예제마다, 확인 퀴즈는 문항마다.
 * 교사용 칸은 발표 화면에 나오지 않는다(학생에게 비추지 않게).
 *
 * 조작(키보드만으로 모두 된다)
 *   → · PageDown · Space(단추·입력칸 밖에서)  다음 단계       ← · PageUp  앞 단계
 *   Home · End  처음·끝                                       Esc  발표 모드 끝내기(전체 화면이면 먼저 전체 화면이 풀린다)
 *   아래쪽 막대의 [◀ 앞] [다음 ▶] [전체 화면] [끝내기(Esc)]. 몇째 단계인지는 막대의 알림 칸(aria-live)이 읽어 준다.
 *   보기(라디오 단추)에 초점이 있을 때 ←→는 보기를 고르는 데 쓰인다(가로챈 키가 아님). 실습실 틀(iframe) 안의 키도 가로채지 않는다.
 *   용어 풀이 툴팁이 열려 있으면 Esc는 툴팁만 닫는다(발표는 그대로).
 *
 * 화면은 DOM을 옮기지 않고 보이지 않을 요소에 data-present-off만 붙였다 뗀다(퀴즈·실습실·툴팁의 동작이 그대로 남는다).
 * 단계 나누기(planPresentationSteps)는 DOM 없이 도는 순수 함수라 Vitest가 검사한다(tests/unit/lesson/present.test.ts).
 *
 * 한 화면에 맞추기(2026-09-25 Phase 5 검토 중요 5 — 1366×768에서 단계 대부분이 한 화면을 넘었다): 발표를 시작할 때(그리고 창 크기가
 * 바뀌거나 그림을 다 받았을 때) 단계마다 블록 높이를 재서, 화면(아래 막대 제외)보다 길면 블록 경계에서 더 잘게 나눈다(splitTallSteps).
 * 나뉜 뒤 단계에는 그 칸의 제목(##·###)을 다시 보이고 막대에 "(이어서)"를 붙인다. 블록 하나가 화면보다 크면(긴 표 등) 그 블록만 한 단계로
 * 두고 아래로 스크롤한다. 따라하기 예제·도전 과제 단계의 막대 글에는 예제·과제 제목을 함께 적는다(어느 예제인지 알 수 있게).
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
export type PresentCommand = 'next' | 'previous' | 'first' | 'last' | 'exit';

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

  /** 아래 막대를 뺀, 한 단계에 쓸 수 있는 화면 높이 */
  const availableHeight = () => {
    const bar = root.querySelector<HTMLElement>('.lesson-present__bar');
    return (doc.defaultView?.innerHeight ?? 768) - (bar?.getBoundingClientRect().height ?? 64) - 24;
  };

  /**
   * 단계를 다시 나눈다: 기본 단계(planPresentationSteps)를 하나씩 보여 블록 높이를 잰 뒤 화면보다 긴 단계를 쪼갠다(splitTallSteps).
   * keep이 있으면 보고 있던 자리(칸·첫 내용 블록)가 든 단계로 돌아온다.
   */
  const replan = (keep?: PresentStep) => {
    const models = sections.map((section) => section.model);
    const base = planPresentationSteps(lessonTitle, models);
    const heights = new Map<string, number>();
    for (const step of base) {
      if (step.section < 0 || step.item !== undefined || step.blocks.length < 2) {
        continue;
      }
      applyStep(step);
      const children = sections[step.section]?.children ?? [];
      for (const block of step.blocks) {
        const element = children[block];
        if (element) {
          heights.set(`${step.section}:${block}`, outerHeight(element));
        }
      }
    }
    steps = splitTallSteps(base, models, (section, block) => heights.get(`${section}:${block}`) ?? 0, availableHeight());
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
    const command = presentCommandFor({
      key: event.key,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      target: focusTarget(doc.activeElement),
    });
    if (!command) {
      return;
    }
    // 용어 풀이 툴팁이 열려 있으면 Esc는 툴팁만 닫는다(툴팁보다 먼저 듣도록 캡처 단계에 걸어 둔 까닭).
    if (command === 'exit' && doc.querySelector('.glossary-term__link[data-tooltip="open"]')) {
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
    render();
    main?.focus({ preventScroll: true });
  };

  const exit = () => {
    const step = steps[index];
    const anchor = step && step.section >= 0 ? sections[step.section]?.children[step.blocks[0] ?? 0] : undefined;
    doc.removeEventListener('keydown', onKeydown, true);
    doc.defaultView?.removeEventListener('resize', scheduleReplan);
    clearMarks();
    delete html.dataset.presenting;
    root.hidden = true;
    delete root.dataset.presentStep;
    delete root.dataset.presentTotal;
    if (enteredFullscreen && doc.fullscreenElement) {
      void doc.exitFullscreen().catch(() => undefined);
    }
    enteredFullscreen = false;
    // 발표를 끝낸 자리(마지막으로 본 칸)에서 이어 읽게 한다.
    anchor?.scrollIntoView({ block: 'start' });
    openButton.focus({ preventScroll: Boolean(anchor) });
  };

  openButton.addEventListener('click', enter);
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
