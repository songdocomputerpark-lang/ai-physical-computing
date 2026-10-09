/**
 * 배우기 목록(/learn/)과 대단원 쪽에서 "어디부터 하지?"에 답하는 작은 스크립트(판 1.3.0).
 *
 * - 시작 카드([data-learn-start]): 진도가 없으면 "처음이면 1단원 1-1-1부터". 있으면 두 가지 말만 쓴다(R2-021 — 쪽마다 다른 말로 부르지 않는다):
 *     · 지난번에 본 차시를 아직 다 하지 않았으면 "지난번에 본 차시 … 이어서 하기"(이미 시작한 차시라 '이어서'가 맞다)
 *     · 그 차시를 다 했으면 지난번 차시 바로 뒤의 안 본 차시 "다음에 볼 차시 … 시작하기"(처음 하는 차시라 '시작하기')
 *   /learn/(모든 단원)과 대단원 쪽이 같은 규칙이다. 선택 보충(V1 같은 차시)은 다음에 볼 차시로 권하지 않는다(R2-020).
 *   서버가 그린 글이 "처음" 상태라서 JS가 없어도 맞는 길을 보여 준다.
 *   바뀐 뒤에는 단추의 접근 이름에 가는 차시가 들어간다("1-1-2 … 이어서 하기" — 보이는 글을 끝에 그대로 담아 2.5.3을 지킨다, R1-092).
 *   대단원 쪽에서 이 단원을 모두 봤으면 주 단추는 다음 대단원의 다음 차시로 가고, "처음부터 다시 보기"는 작은 보조 링크가 된다(R1-088).
 * - 다음에 볼 차시 표시(li[data-next]): 대단원 쪽 카드 가운데 지난번에 본 차시 바로 뒤의 안 본 차시에 표를 붙인다. 표는 카드 안에 떠 있어 자리를 밀지 않는다.
 *
 * 순수 함수(pickStart·startTexts)는 tests/unit/lesson/learn-progress.test.ts가, DOM 붙이기는 jsdom 시험과 tests/e2e/progress.spec.ts가 본다.
 * 진도는 src/lib/progress.ts로만 읽는다. 실습실 라이브러리를 가져오지 않는다.
 */
import { hasProgress, lessonStatus, nextUnseen, type ProgressState } from '../../lib/progress.ts';
import { watchProgress } from '../progress/progress-paint.ts';

/** 시작 카드가 가리킬 수 있는 차시 하나(카드 목록에서 읽는다) */
export interface StartEntry {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  readonly title: string;
}

/**
 * first 처음 · resume 지난번에 본 차시(아직 다 하지 않음) · next 다음에 볼 차시(안 본 차시) ·
 * again 모두 봤고 지난번 차시도 다 함(/learn/ 전체) · review 이 단원을 모두 봤어요(대단원 쪽)
 */
export type StartMode = 'first' | 'resume' | 'next' | 'again' | 'review';

export interface StartPick {
  readonly mode: StartMode;
  readonly entry: StartEntry;
}

/**
 * 시작 카드에 보일 차시를 고른다(scope 'all' 배우기 첫 쪽, 'unit' 대단원 쪽 — 같은 규칙이고 entries 범위만 다르다).
 * 1) entries에서 아무것도 안 봤으면 first(첫 차시).
 * 2) 지난번에 본 차시가 entries에 있고 아직 다 하지 않았으면 resume(그 차시).
 * 3) 안 본 차시가 남았으면 next — 지난번 차시 바로 뒤의 안 본 차시(없으면 첫 안 본 차시). 선택 보충은 건너뛴다.
 * 4) 모두 봤으면 scope 'all'은 again(지난번 차시, 다시 보기), 'unit'은 review(첫 차시, 처음부터 다시 보기).
 */
export function pickStart(state: ProgressState, entries: readonly StartEntry[], scope: 'all' | 'unit'): StartPick | null {
  const first = entries[0];
  if (!first) {
    return null;
  }
  const ids = entries.map((entry) => entry.id);
  if (!ids.some((id) => lessonStatus(state, id) !== 'none')) {
    return { mode: 'first', entry: first };
  }
  const last = state.last ? entries.find((entry) => entry.id === state.last?.id) : undefined;
  if (last && lessonStatus(state, last.id) !== 'done') {
    return { mode: 'resume', entry: last };
  }
  const nextId = nextUnseen(state, ids);
  const next = nextId ? entries.find((entry) => entry.id === nextId) : undefined;
  if (next) {
    return { mode: 'next', entry: next };
  }
  return scope === 'all' && last ? { mode: 'again', entry: last } : { mode: 'review', entry: first };
}

export interface StartTexts {
  /** 작은 윗글 */
  readonly kicker: string;
  /** 큰 글: 어느 차시인지 */
  readonly title: string;
  /** 누르는 단추 글 */
  readonly button: string;
}

/** 다음 대단원으로 이어 줄 때 쓰는 값: 다음 대단원의 번호(1~4)와, 그 단원에서 고른 차시 */
export interface NextUnitPick {
  readonly numeral: string;
  readonly pick: StartPick;
}

/**
 * 고른 차시를 시작 카드에 쓸 글로. firstButton은 "처음이면 1단원 1-1-1부터"처럼 서버가 정한 처음 상태의 단추 글.
 * nextUnit이 있으면(이 단원을 모두 본 대단원 쪽) 다음 대단원으로 가는 글을 쓴다 — 이때 pick은 쓰지 않는다.
 */
export function startTexts(pick: StartPick, firstButton: string, nextUnit?: NextUnitPick): StartTexts {
  if (nextUnit && pick.mode === 'review') {
    const target = nextUnit.pick.entry;
    return {
      kicker: nextUnit.pick.mode === 'first' ? '이 단원을 모두 봤어요. 다음 단원이에요' : `이 단원을 모두 봤어요. ${nextUnit.numeral}단원을 이어서 해요`,
      title: `${nextUnit.numeral}단원 ${target.label} ${target.title}`.trim(),
      button: nextUnit.pick.mode === 'first' ? `${nextUnit.numeral}단원 시작하기` : `${nextUnit.numeral}단원 이어서 하기`,
    };
  }
  const title = `${pick.entry.label} ${pick.entry.title}`.trim();
  switch (pick.mode) {
    case 'resume':
      return { kicker: '지난번에 열어 본 차시', title, button: '이어서 하기' };
    case 'next':
      return { kicker: '다음에 볼 차시', title, button: '시작하기' };
    case 'again':
      return { kicker: '지난번에 열어 본 차시', title, button: '다시 보기' };
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

/**
 * 서버가 카드에 실어 둔 "다음 대단원" 차시 목록(data-start-next-entries, JSON)과 단원 번호(data-start-next-numeral, 1~4)를 읽는다.
 * 없거나 깨졌으면 undefined(마지막 대단원이거나 JSON을 못 읽음 — 그냥 "처음부터 다시 보기"로 둔다).
 */
export function readNextUnit(card: HTMLElement): { numeral: string; entries: StartEntry[] } | undefined {
  const numeral = card.getAttribute('data-start-next-numeral') ?? '';
  const raw = card.getAttribute('data-start-next-entries');
  if (numeral === '' || !raw) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    const entries = parsed.flatMap((item): StartEntry[] => {
      const value = item as Partial<Record<keyof StartEntry, unknown>> | null;
      return value && typeof value.id === 'string' && typeof value.href === 'string' && typeof value.label === 'string' && typeof value.title === 'string'
        ? [{ id: value.id, href: value.href, label: value.label, title: value.title }]
        : [];
    });
    return entries.length > 0 ? { numeral, entries } : undefined;
  } catch {
    return undefined;
  }
}

/** 시작 카드 하나를 지금 진도에 맞게 고친다 */
export function paintStart(card: HTMLElement, entries: readonly StartEntry[], state: ProgressState): void {
  const scope = card.getAttribute('data-start-scope') === 'unit' ? 'unit' : 'all';
  const pick = pickStart(state, entries, scope);
  if (!pick) {
    return;
  }
  // 이 단원을 모두 봤으면 다음 대단원의 안 본 첫 차시로 이어 준다(다음 대단원도 모두 봤으면 그대로 "처음부터 다시 보기")
  let nextUnit: NextUnitPick | undefined;
  const nextData = pick.mode === 'review' ? readNextUnit(card) : undefined;
  if (nextData) {
    const nextPick = pickStart(state, nextData.entries, 'unit');
    if (nextPick && nextPick.mode !== 'review') {
      nextUnit = { numeral: nextData.numeral, pick: nextPick };
    }
  }
  const target = nextUnit ? nextUnit.pick.entry : pick.entry;
  const texts = startTexts(pick, card.getAttribute('data-start-first-text') ?? '', nextUnit);
  setText(card.querySelector('[data-start-kicker]'), texts.kicker);
  setText(card.querySelector('[data-start-title]'), texts.title);
  const button = card.querySelector<HTMLAnchorElement>('[data-start-button]');
  if (button) {
    setText(button.querySelector('[data-start-button-text]') ?? button, texts.button);
    if (button.getAttribute('href') !== target.href) {
      button.setAttribute('href', target.href);
    }
    // 처음 상태의 단추 글은 차시를 이미 말하므로 그대로 두고, 그 밖에는 가는 차시를 이름에 넣는다(R1-092). 보이는 글이 이름의 끝에 그대로 든다.
    if (pick.mode === 'first') {
      button.removeAttribute('aria-label');
    } else {
      button.setAttribute('aria-label', `${texts.title} ${texts.button}`);
    }
  }
  // 보조 링크 [처음부터 다시 보기]: 다음 대단원으로 이어 줄 때만 보인다
  const again = card.querySelector<HTMLAnchorElement>('[data-start-again]');
  if (again) {
    again.hidden = nextUnit === undefined;
    if (again.getAttribute('href') !== pick.entry.href) {
      again.setAttribute('href', pick.entry.href);
    }
  }
  card.setAttribute('data-start-mode', pick.mode);
  if (nextUnit) {
    card.setAttribute('data-start-next', nextUnit.pick.mode);
  } else {
    card.removeAttribute('data-start-next');
  }
}

/** 대단원 쪽 카드 가운데 안 본 첫 차시에 data-next를 붙인다(다른 카드에서는 뗀다) */
export function paintNextFlag(root: ParentNode, entries: readonly StartEntry[], state: ProgressState): void {
  const nextId = nextUnseen(state, entries.map((entry) => entry.id));
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
