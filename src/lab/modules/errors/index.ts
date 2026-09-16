/**
 * 한국어 오류 사전 모듈의 화면 쪽(PLAN §8.2 P2-06, SPEC §6.1 "파이썬 예외 → 트레이스백 + 한국어 설명").
 *
 * 하는 일
 * 1. 실행이 끝나면(lab.on('done')) 결과가 오류·정지·다시 시작인지 보고, 트레이스백을 읽어(src/lab/errors/traceback.ts)
 *    오류 사전(content/help/errors/errors.yaml → panel.astro가 심은 JSON)에서 맞는 풀이를 고른다(explain.ts).
 * 2. 콘솔 위 카드(panel.astro)에 제목·뜻·왜·고치는 법·자주 하는 실수·짧은 트레이스백·사전 링크를 채우고 연다.
 * 3. 오류가 난 학생 코드 줄을 편집칸에서 강조한다(highlight.ts). [그 줄로 가기]를 누르면 그 줄로 커서가 간다.
 * 4. 콘솔에 한 줄 요약을 남기고, 실습실 틀이 콘솔에 찍어 둔 긴 원문 트레이스백을 사이트·파이썬 안쪽 단계를 뺀
 *    짧은 것으로 바꿔 쓴다(원문은 카드의 접기 안에 그대로 남는다).
 *
 * 다른 부품과의 약속
 * - 줄 강조는 먼저 실습실 뿌리에 CustomEvent 'apc:lab-error-line'(cancelable)을 보내고, 아무도 막지 않으면 편집칸을 강조한다.
 *   차시 임베드처럼 다른 방식으로 보여 주고 싶은 화면은 이 이벤트를 preventDefault()로 막고 자기 방식으로 그리면 된다.
 * - 콘솔 바꿔 쓰기는 실습실 틀이 방금 넣은 줄(그 글자와 정확히 같을 때)만 건드리고, 못 찾으면 아무 일도 하지 않는다.
 */
import { withBase } from '../../../lib/url.ts';
import { catalogFromJson, type ErrorCatalog } from '../../errors/catalog-schema.ts';
import { consoleSummary, explain, shortenMessage, type Explanation } from '../../errors/explain.ts';
import { clearHighlight, ERROR_LINE_EVENT, highlightLine, type ErrorLineDetail } from '../../errors/highlight.ts';
import type { RunResult } from '../../runtime/client.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import manifest from './manifest.ts';

/** 카드 안의 요소를 한 번에 찾아 둔다(없는 것은 null — 화면 조각이 바뀌어도 죽지 않게). */
interface CardElements {
  readonly card: HTMLElement;
  readonly type: HTMLElement | null;
  readonly title: HTMLElement | null;
  readonly close: HTMLButtonElement | null;
  readonly where: HTMLElement | null;
  readonly whereText: HTMLElement | null;
  readonly goto: HTMLButtonElement | null;
  readonly meaning: HTMLElement | null;
  readonly whyBox: HTMLElement | null;
  readonly why: HTMLElement | null;
  readonly fixBox: HTMLElement | null;
  readonly fix: HTMLElement | null;
  readonly mistakesBox: HTMLElement | null;
  readonly mistakes: HTMLElement | null;
  readonly details: HTMLDetailsElement | null;
  readonly traceback: HTMLElement | null;
  readonly hiddenNote: HTMLElement | null;
  readonly link: HTMLAnchorElement | null;
}

function findElements(panel: HTMLElement): CardElements | null {
  const card = panel.querySelector<HTMLElement>('[data-errors-card]');
  if (!card) {
    return null;
  }
  return {
    card,
    type: card.querySelector('[data-errors-type]'),
    title: card.querySelector('[data-errors-title]'),
    close: card.querySelector('[data-errors-close]'),
    where: card.querySelector('[data-errors-where]'),
    whereText: card.querySelector('[data-errors-where-text]'),
    goto: card.querySelector('[data-errors-goto]'),
    meaning: card.querySelector('[data-errors-meaning]'),
    whyBox: card.querySelector('[data-errors-why-box]'),
    why: card.querySelector('[data-errors-why]'),
    fixBox: card.querySelector('[data-errors-fix-box]'),
    fix: card.querySelector('[data-errors-fix]'),
    mistakesBox: card.querySelector('[data-errors-mistakes-box]'),
    mistakes: card.querySelector('[data-errors-mistakes]'),
    details: card.querySelector('[data-errors-details]'),
    traceback: card.querySelector('[data-errors-traceback]'),
    hiddenNote: card.querySelector('[data-errors-hidden-note]'),
    link: card.querySelector('[data-errors-link]'),
  };
}

/** panel.astro가 심어 둔 JSON을 읽는다(없거나 틀리면 null — 코드 안의 기본 풀이만 쓴다). */
export function readCatalog(panel: HTMLElement): ErrorCatalog | null {
  const script = panel.querySelector<HTMLScriptElement>('script[data-errors-catalog]');
  return catalogFromJson(script?.textContent ?? null);
}

/** 목록(ul·ol)을 글 목록으로 채운다. 비어 있으면 담은 상자를 숨긴다. */
function fillList(box: HTMLElement | null, list: HTMLElement | null, items: readonly string[]): void {
  if (!list) {
    return;
  }
  list.replaceChildren();
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    list.append(li);
  }
  if (box) {
    box.hidden = items.length === 0;
  }
}

/**
 * 실습실 틀이 방금 콘솔에 찍은 원문 트레이스백을 짧은 것으로 바꿔 쓴다.
 * 콘솔의 마지막 stderr 줄이 그 원문과 정확히 같을 때만 바꾸고(다르면 그대로 둔다), 바꿨으면 true.
 */
export function tidyConsoleTraceback(root: HTMLElement, rawTraceback: string, simplified: string): boolean {
  if (rawTraceback.trim() === '' || simplified.trim() === '' || simplified === rawTraceback) {
    return false;
  }
  const lines = root.querySelectorAll<HTMLElement>('[data-lab-console] .lab-console__line--stderr');
  const last = lines[lines.length - 1];
  if (!last || last.textContent !== `${rawTraceback}\n`) {
    return false;
  }
  last.textContent = `${simplified}\n`;
  return true;
}

function mount(context: LabModuleContext): LabModuleHandle | void {
  const { panel, lab } = context;
  if (!panel) {
    return;
  }
  const elements = findElements(panel);
  if (!elements) {
    return;
  }
  const catalog = readCatalog(panel);
  let current: Explanation | null = null;

  const hideCard = (): void => {
    current = null;
    elements.card.hidden = true;
    delete elements.card.dataset.errorsEntry;
    delete elements.card.dataset.errorsKind;
    delete elements.card.dataset.errorsLine;
    delete elements.card.dataset.errorsMatched;
    context.hidePanel();
  };

  const clearEditorHighlight = (): void => {
    const view = lab.editor?.view;
    if (view) {
      clearHighlight(view);
    }
  };

  /** 오류가 난 줄을 알린다: 먼저 이벤트로 물어보고(막지 않으면) 편집칸을 강조한다. */
  const markLine = (explanation: Explanation, focus: boolean): void => {
    const location = explanation.location;
    if (!location) {
      return;
    }
    const detail: ErrorLineDetail = {
      line: location.line,
      scope: location.scope,
      message: explanation.lastLine,
      source: location.source,
      focus,
    };
    const event = new CustomEvent<ErrorLineDetail>(ERROR_LINE_EVENT, { detail, bubbles: true, cancelable: true });
    const notPrevented = context.root.dispatchEvent(event);
    const view = lab.editor?.view;
    if (notPrevented && view) {
      highlightLine(view, location.line, { focus });
    }
  };

  const show = (explanation: Explanation, result: RunResult): void => {
    current = explanation;
    const { card } = elements;
    card.dataset.errorsEntry = explanation.entry.id;
    card.dataset.errorsKind = explanation.kind;
    card.dataset.errorsMatched = explanation.matched;
    card.dataset.errorsLine = explanation.location ? String(explanation.location.line) : '';
    if (elements.type) {
      elements.type.textContent = explanation.typeLabel;
    }
    if (elements.title) {
      elements.title.textContent = explanation.title;
    }
    if (elements.meaning) {
      elements.meaning.textContent = explanation.meaning;
    }
    if (elements.where) {
      elements.where.hidden = explanation.locationText === null;
    }
    if (elements.whereText) {
      elements.whereText.textContent = explanation.locationText ?? '';
    }
    fillList(elements.whyBox, elements.why, explanation.why);
    fillList(elements.fixBox, elements.fix, explanation.fix);
    fillList(elements.mistakesBox, elements.mistakes, explanation.mistakes);

    const raw = result.error?.traceback ?? '';
    if (elements.details) {
      elements.details.hidden = raw.trim() === '';
      elements.details.open = false;
    }
    if (elements.traceback) {
      elements.traceback.textContent = raw;
    }
    if (elements.hiddenNote) {
      const hidden = explanation.parsed?.hiddenFrames ?? 0;
      elements.hiddenNote.hidden = hidden === 0;
      elements.hiddenNote.textContent =
        hidden === 0 ? '' : `콘솔에는 사이트·파이썬 안쪽 ${hidden}단계를 뺀 짧은 내용이 있어요. 여기 있는 것이 원문 그대로예요.`;
    }
    if (elements.link) {
      elements.link.href = withBase(explanation.dictionaryPath);
      elements.link.textContent = `오류 사전에서 "${explanation.entry.title}" 더 보기`;
    }
    card.hidden = false;
    context.showPanel();
  };

  const onDone = (result: RunResult): void => {
    if (result.outcome === 'ok') {
      hideCard();
      return;
    }
    const explanation = explain(catalog, {
      outcome: result.outcome,
      ...(result.error ? { error: result.error } : {}),
    });
    if (!explanation) {
      hideCard();
      return;
    }
    show(explanation, result);
    if (explanation.simplified) {
      tidyConsoleTraceback(context.root, result.error?.traceback ?? '', shortenMessage(explanation.simplified));
    }
    lab.appendConsole(`${consoleSummary(explanation)}\n`, 'notice');
    markLine(explanation, false);
  };

  const onGoto = (): void => {
    if (current) {
      markLine(current, true);
    }
  };
  elements.goto?.addEventListener('click', onGoto);
  const onClose = (): void => {
    hideCard();
    clearEditorHighlight();
  };
  elements.close?.addEventListener('click', onClose);

  context.onLab('done', onDone);
  context.onLab('run', () => {
    hideCard();
    clearEditorHighlight();
  });
  context.onLab('code', ({ source }) => {
    // 코드를 고치기 시작하면 강조를 지운다(고친 뒤에는 그 줄이 원인이 아닐 수 있다). 카드는 읽던 중일 수 있어 남긴다.
    if (source === 'edit' || source === 'param') {
      clearEditorHighlight();
      return;
    }
    // 다른 코드로 통째로 바뀌면(예제·초기화·공유 링크·기록 지우기) 카드도 닫는다.
    hideCard();
    clearEditorHighlight();
  });

  return {
    dispose() {
      elements.goto?.removeEventListener('click', onGoto);
      elements.close?.removeEventListener('click', onClose);
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
