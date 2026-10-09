/**
 * 배우기 목록(/learn/)과 대단원 쪽에서 "어디부터 하지?"에 답하는 작은 스크립트(판 1.3.0).
 *
 * - 시작 카드([data-learn-start]): 진도가 없으면 "처음이면 I단원 1-1-1부터", 있으면 "이어서 하기"(/learn/은 지난번에 본 차시,
 *   대단원 쪽은 아직 안 본 첫 차시). 서버가 그린 글이 "처음" 상태라서 JS가 없어도 맞는 길을 보여 준다.
 * - 다음에 볼 차시 표시(li[data-next]): 대단원 쪽 카드 가운데 아직 안 본 첫 차시에 표를 붙인다. 표는 카드 안에 떠 있어 자리를 밀지 않는다.
 *
 * 순수 함수(pickStart·startTexts)는 tests/unit/lesson/learn-progress.test.ts가, DOM 붙이기는 jsdom 시험과 tests/e2e/progress.spec.ts가 본다.
 * 진도는 src/lib/progress.ts로만 읽는다. 실습실 라이브러리를 가져오지 않는다.
 */
import { firstUnseen, hasProgress, lessonStatus, type ProgressState } from '../../lib/progress.ts';
import { watchProgress } from '../progress/progress-paint.ts';

/** 시작 카드가 가리킬 수 있는 차시 하나(카드 목록에서 읽는다) */
export interface StartEntry {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  readonly title: string;
}

/** first 처음 · resume 지난번에 본 차시(/learn/) · next 다음에 볼 차시(대단원) · review 모두 봤어요(대단원) */
export type StartMode = 'first' | 'resume' | 'next' | 'review';

export interface StartPick {
  readonly mode: StartMode;
  readonly entry: StartEntry;
}

/**
 * 시작 카드에 보일 차시를 고른다.
 * scope 'all'(배우기 첫 쪽): 지난번에 본 차시가 목록에 있으면 resume, 아니면 첫 차시(first).
 * scope 'unit'(대단원 쪽): 아무것도 안 봤으면 first, 안 본 차시가 있으면 그 첫 차시(next), 모두 봤으면 review(첫 차시).
 */
export function pickStart(state: ProgressState, entries: readonly StartEntry[], scope: 'all' | 'unit'): StartPick | null {
  const first = entries[0];
  if (!first) {
    return null;
  }
  if (scope === 'all') {
    const last = state.last ? entries.find((entry) => entry.id === state.last?.id) : undefined;
    return last ? { mode: 'resume', entry: last } : { mode: 'first', entry: first };
  }
  const ids = entries.map((entry) => entry.id);
  const anySeen = ids.some((id) => lessonStatus(state, id) !== 'none');
  if (!anySeen) {
    return { mode: 'first', entry: first };
  }
  const nextId = firstUnseen(state, ids);
  const next = nextId ? entries.find((entry) => entry.id === nextId) : undefined;
  return next ? { mode: 'next', entry: next } : { mode: 'review', entry: first };
}

export interface StartTexts {
  /** 작은 윗글 */
  readonly kicker: string;
  /** 큰 글: 어느 차시인지 */
  readonly title: string;
  /** 누르는 단추 글 */
  readonly button: string;
}

/** 고른 차시를 시작 카드에 쓸 글로. firstButton은 "처음이면 I단원 1-1-1부터"처럼 서버가 정한 처음 상태의 단추 글 */
export function startTexts(pick: StartPick, firstButton: string): StartTexts {
  const title = `${pick.entry.label} ${pick.entry.title}`.trim();
  switch (pick.mode) {
    case 'resume':
      return { kicker: '지난번에 본 차시', title, button: '이어서 하기' };
    case 'next':
      return { kicker: '다음에 볼 차시', title, button: '이어서 하기' };
    case 'review':
      return { kicker: '이 단원을 모두 봤어요', title, button: '처음부터 다시 보기' };
    default:
      return { kicker: '처음이라면', title, button: firstButton };
  }
}

/** 카드 목록(li[data-progress-lesson] 안의 링크)에서 시작 카드가 쓸 차시 목록을 읽는다. 링크가 없는(준비 중) 카드는 뺀다. */
export function readStartEntries(root: ParentNode): StartEntry[] {
  const entries: StartEntry[] = [];
  for (const card of root.querySelectorAll<HTMLElement>('[data-progress-lesson]')) {
    const id = card.getAttribute('data-progress-lesson') ?? '';
    const link = card.querySelector<HTMLAnchorElement>('a[href]');
    if (!id || !link) {
      continue;
    }
    entries.push({
      id,
      href: link.getAttribute('href') ?? '',
      label: card.querySelector('.lesson-card__label')?.textContent?.trim() ?? '',
      title: card.querySelector('.lesson-card__title')?.textContent?.trim() ?? '',
    });
  }
  return entries;
}

function setText(element: Element | null, text: string): void {
  if (element && element.textContent !== text) {
    element.textContent = text;
  }
}

/** 시작 카드 하나를 지금 진도에 맞게 고친다 */
export function paintStart(card: HTMLElement, entries: readonly StartEntry[], state: ProgressState): void {
  const scope = card.getAttribute('data-start-scope') === 'unit' ? 'unit' : 'all';
  const pick = pickStart(state, entries, scope);
  if (!pick) {
    return;
  }
  const texts = startTexts(pick, card.getAttribute('data-start-first-text') ?? '');
  setText(card.querySelector('[data-start-kicker]'), texts.kicker);
  setText(card.querySelector('[data-start-title]'), texts.title);
  const button = card.querySelector<HTMLAnchorElement>('[data-start-button]');
  if (button) {
    setText(button.querySelector('[data-start-button-text]') ?? button, texts.button);
    if (button.getAttribute('href') !== pick.entry.href) {
      button.setAttribute('href', pick.entry.href);
    }
  }
  card.setAttribute('data-start-mode', pick.mode);
}

/** 대단원 쪽 카드 가운데 안 본 첫 차시에 data-next를 붙인다(다른 카드에서는 뗀다) */
export function paintNextFlag(root: ParentNode, entries: readonly StartEntry[], state: ProgressState): void {
  const nextId = firstUnseen(state, entries.map((entry) => entry.id));
  const hasAny = hasProgress(state);
  for (const card of root.querySelectorAll<HTMLElement>('[data-progress-lesson]')) {
    const isNext = nextId !== null && card.getAttribute('data-progress-lesson') === nextId;
    if (isNext) {
      card.setAttribute('data-next', '');
      setText(card.querySelector('[data-next-flag]'), hasAny ? '다음에 볼 차시' : '여기서 시작');
    } else {
      card.removeAttribute('data-next');
    }
  }
}

/**
 * 배우기 첫 쪽·대단원 쪽에서 한 번 부른다. 진도가 바뀔 때마다(다른 탭 포함) 다시 그린다.
 * 돌려주는 함수를 부르면 멈춘다.
 */
export function installLearnProgress(root: Document = document): () => void {
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-learn-start]'));
  const flagged = root.querySelector('[data-next-flag]') !== null;
  if (cards.length === 0 && !flagged) {
    return () => {};
  }
  return watchProgress((state) => {
    const entries = readStartEntries(root);
    for (const card of cards) {
      // 대단원 쪽의 시작 카드는 그 단원 카드만, 배우기 첫 쪽은 모든 단원 카드를 훑는다(readStartEntries가 쪽 전체를 읽는다).
      paintStart(card, entries, state);
    }
    if (flagged) {
      paintNextFlag(root, entries, state);
    }
  });
}
