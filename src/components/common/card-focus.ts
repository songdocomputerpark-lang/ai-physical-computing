/**
 * 카드 링크에 키보드 초점이 오면 카드 전체를 화면에 넣는다(판 1.6.0, DECISIONS C177, 걷기 보고 21 / 종합 B-98).
 *
 * 왜: 이 사이트의 카드는 안의 링크(`a.card__link`) 하나가 `::after` 덮개로 카드 전체를 누르게 만든다(global.css). 초점 테두리도 카드 전체에 그린다.
 * 그런데 브라우저는 초점을 받은 요소(링크 글줄, 높이 50px 안팎)만 화면에 넣어, Tab으로 카드에 가면 카드 아랫변과 아랫줄("50분 · 쉬움")이 화면 아래에 걸렸다.
 * 링크가 카드 위쪽(제목)에 있든 아래쪽([열기] 단추)에 있든, 카드(`.card`)를 `block: 'nearest'`로 보여 주면 이미 보이는 카드는 움직이지 않고
 * 걸쳐 있는 카드만 가장 가까운 만큼 옮겨 카드 전체가 들어온다. 카드의 위아래 여유(scroll-margin)는 global.css가 정한다.
 *
 * 마우스·손가락으로 누른 초점(:focus-visible이 아님)은 건드리지 않는다. 쓰는 곳: BaseLayout.astro의 스크립트가 모든 쪽에서 한 번 부른다.
 * 판단(`shouldScrollCard`)은 DOM 없이 도는 순수 함수이고, 실제 화면 동작은 tests/e2e/a11y-keyboard.spec.ts가 본다.
 */

/** 카드 링크 */
export const CARD_LINK_SELECTOR = 'a.card__link';
/** 링크를 감싼 카드 */
export const CARD_SELECTOR = '.card';

/** 카드를 화면에 넣어야 하는 초점인지: 카드 링크이고, 키보드(또는 프로그램)로 온 초점일 때만 */
export function shouldScrollCard(input: { readonly isCardLink: boolean; readonly focusVisible: boolean; readonly hasCard: boolean }): boolean {
  return input.isCardLink && input.focusVisible && input.hasCard;
}

/** `:focus-visible`을 못 읽는 환경(오래된 브라우저·DOM 흉내)에서는 키보드 초점으로 본다 */
function isFocusVisible(element: Element): boolean {
  try {
    return element.matches(':focus-visible');
  } catch {
    return true;
  }
}

/** 문서에 카드 초점 규칙을 건다. 이미 걸었으면 다시 걸지 않는다. 떼는 함수를 돌려준다(시험용) */
export function installCardFocusScroll(doc: Document = document): () => void {
  const marker = '__apcCardFocusScroll';
  const store = doc as unknown as Record<string, (() => void) | undefined>;
  if (store[marker]) {
    return store[marker] as () => void;
  }
  const onFocusIn = (event: FocusEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const isCardLink = target.matches(CARD_LINK_SELECTOR);
    const card = isCardLink ? target.closest<HTMLElement>(CARD_SELECTOR) : null;
    if (card && shouldScrollCard({ isCardLink, focusVisible: isFocusVisible(target), hasCard: true })) {
      card.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };
  doc.addEventListener('focusin', onFocusIn);
  const remove = (): void => {
    doc.removeEventListener('focusin', onFocusIn);
    store[marker] = undefined;
  };
  store[marker] = remove;
  return remove;
}
