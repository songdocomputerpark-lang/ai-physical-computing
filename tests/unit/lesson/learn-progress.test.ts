// @vitest-environment jsdom
// 배우기 목록·대단원 쪽의 시작 카드와 "다음에 볼 차시" 표(src/components/lesson/learn-progress.ts) — 순수 고르기와 DOM 칠하기.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  installLearnProgress,
  paintNextFlag,
  paintStart,
  pickStart,
  readNextUnit,
  readStartEntries,
  startTexts,
  type StartEntry,
} from '../../../src/components/lesson/learn-progress.ts';
import { emptyProgress, markSeen, setDone, type ProgressState } from '../../../src/lib/progress.ts';

const ENTRIES: StartEntry[] = [
  { id: 'u1/1-1-1', href: '/x/learn/u1/1-1-1/', label: '1-1-1', title: '인공지능 응용 프로그램과 에이전트' },
  { id: 'u1/1-1-2', href: '/x/learn/u1/1-1-2/', label: '1-1-2', title: '인공지능의 능력' },
  { id: 'u1/1-1-3', href: '/x/learn/u1/1-1-3/', label: '1-1-3', title: '정리' },
];

function stateWith(seen: string[], done: string[] = [], last: string | null = null): ProgressState {
  return {
    ...emptyProgress(),
    seen,
    done,
    last: last ? { id: last, href: `/x/learn/${last}/`, label: 'L', title: 'T', at: 1 } : null,
  };
}

describe('pickStart — 어느 차시를 가리킬까', () => {
  it('차시가 하나도 없으면 null', () => {
    expect(pickStart(emptyProgress(), [], 'all')).toBeNull();
    expect(pickStart(emptyProgress(), [], 'unit')).toBeNull();
  });

  it('배우기 첫 쪽: 진도가 없으면 첫 차시(first), 지난번에 본 차시가 목록에 있고 아직 다 하지 않았으면 그 차시(resume)', () => {
    expect(pickStart(emptyProgress(), ENTRIES, 'all')).toEqual({ mode: 'first', entry: ENTRIES[0] });
    expect(pickStart(stateWith(['u1/1-1-2'], [], 'u1/1-1-2'), ENTRIES, 'all')).toEqual({ mode: 'resume', entry: ENTRIES[1] });
  });

  it('지난번 차시를 다 했으면 그 바로 뒤의 안 본 차시를 권한다(next) — 안 본 앞 차시로 되돌려 보내지 않는다(R2-021)', () => {
    // 1-1-3만 열어 다 했다: 앞의 1-1-1·1-1-2는 안 봤지만 "다음"은 1-1-3 뒤가 없으니 그때서야 앞으로 돌아간다
    expect(pickStart(stateWith(['u1/1-1-3'], ['u1/1-1-3'], 'u1/1-1-3'), ENTRIES, 'all')).toEqual({ mode: 'next', entry: ENTRIES[0] });
    // 1-1-1을 다 했으면 1-1-2
    expect(pickStart(stateWith(['u1/1-1-1'], ['u1/1-1-1'], 'u1/1-1-1'), ENTRIES, 'all')).toEqual({ mode: 'next', entry: ENTRIES[1] });
    // 1-1-2를 다 했고 1-1-1은 안 봤어도 다음은 1-1-3
    expect(pickStart(stateWith(['u1/1-1-2'], ['u1/1-1-2'], 'u1/1-1-2'), ENTRIES, 'unit')).toEqual({ mode: 'next', entry: ENTRIES[2] });
  });

  it('선택 보충(V1 같은 차시)은 다음에 볼 차시로 권하지 않는다(R2-020)', () => {
    const withSupplement: StartEntry[] = [
      ENTRIES[0]!,
      { id: 'u1/v1', href: '/x/learn/u1/v1/', label: 'V1', title: '사진은 숫자다' },
      ENTRIES[1]!,
    ];
    const state = stateWith(['u1/1-1-1'], ['u1/1-1-1'], 'u1/1-1-1');
    expect(pickStart(state, withSupplement, 'unit')).toEqual({ mode: 'next', entry: ENTRIES[1] });
    // 본 차시를 모두 봤고 보충만 남았으면 "모두 봤어요"
    expect(pickStart(stateWith(['u1/1-1-1', 'u1/1-1-2'], ['u1/1-1-1', 'u1/1-1-2']), withSupplement, 'unit')).toEqual({ mode: 'review', entry: ENTRIES[0] });
  });

  it('배우기 첫 쪽: 모두 봤고 지난번 차시도 다 했으면 지난번 차시를 다시 보기(again)', () => {
    const ids = ENTRIES.map((entry) => entry.id);
    expect(pickStart(stateWith(ids, ids, 'u1/1-1-3'), ENTRIES, 'all')).toEqual({ mode: 'again', entry: ENTRIES[2] });
  });

  it('배우기 첫 쪽: 지난번 차시가 목록에 없으면(사라진 차시) 첫 차시로 돌아온다', () => {
    expect(pickStart(stateWith(['u9/9-9-9'], [], 'u9/9-9-9'), ENTRIES, 'all')).toEqual({ mode: 'first', entry: ENTRIES[0] });
  });

  it('대단원 쪽: 아무것도 안 봤으면 first, 봤으면 안 본 차시(next), 모두 봤으면 처음부터 다시(review)', () => {
    expect(pickStart(emptyProgress(), ENTRIES, 'unit')).toEqual({ mode: 'first', entry: ENTRIES[0] });
    expect(pickStart(stateWith(['u1/1-1-1']), ENTRIES, 'unit')).toEqual({ mode: 'next', entry: ENTRIES[1] });
    // 건너뛰어 본 경우에도 "안 본 첫 차시"다
    expect(pickStart(stateWith(['u1/1-1-2']), ENTRIES, 'unit')).toEqual({ mode: 'next', entry: ENTRIES[0] });
    expect(pickStart(stateWith(['u1/1-1-1', 'u1/1-1-2'], ['u1/1-1-3']), ENTRIES, 'unit')).toEqual({ mode: 'review', entry: ENTRIES[0] });
  });

  it('끝낸(done) 차시도 본 차시로 센다', () => {
    expect(pickStart(stateWith([], ['u1/1-1-1']), ENTRIES, 'unit')).toEqual({ mode: 'next', entry: ENTRIES[1] });
  });
});

describe('startTexts — 카드에 쓸 글', () => {
  const first = '1단원 1-1-1부터';
  it('처음이면 서버가 정한 단추 글을 그대로 쓴다', () => {
    expect(startTexts({ mode: 'first', entry: ENTRIES[0]! }, first)).toEqual({
      kicker: '처음이라면',
      title: '1-1-1 인공지능 응용 프로그램과 에이전트',
      button: first,
    });
  });

  it('이어서 하기(이미 시작한 차시)·시작하기(처음 하는 차시)·다시 보기·모두 봤어요 — 한 기능에 한 이름(R2-021)', () => {
    expect(startTexts({ mode: 'resume', entry: ENTRIES[1]! }, first)).toMatchObject({ kicker: '지난번에 열어 본 차시', button: '이어서 하기' });
    expect(startTexts({ mode: 'next', entry: ENTRIES[1]! }, first)).toMatchObject({ kicker: '다음에 볼 차시', button: '시작하기' });
    expect(startTexts({ mode: 'again', entry: ENTRIES[1]! }, first)).toMatchObject({ kicker: '지난번에 열어 본 차시', button: '다시 보기' });
    expect(startTexts({ mode: 'review', entry: ENTRIES[0]! }, first)).toMatchObject({ kicker: '이 단원을 모두 봤어요', button: '처음부터 다시 보기' });
  });

  it('단추 글에는 차시 제목이 들어가지 않는다(링크 이름이 카드 링크와 겹치지 않게)', () => {
    for (const mode of ['first', 'resume', 'next', 'again', 'review'] as const) {
      expect(startTexts({ mode, entry: ENTRIES[0]! }, first).button).not.toContain('에이전트');
    }
  });
});

function mount(scope: 'all' | 'unit' = 'unit', withFlag = true): void {
  document.body.innerHTML = `
    <div data-learn-start data-start-scope="${scope}" data-start-first-text="처음이면 1단원 1-1-1부터" data-start-mode="first">
      <p data-start-kicker>처음이라면</p>
      <p data-start-title>1-1-1 인공지능 응용 프로그램과 에이전트</p>
      <a data-start-button href="/x/learn/u1/1-1-1/"><span data-start-button-text>처음이면 1단원 1-1-1부터</span></a>
    </div>
    <ul>
      ${ENTRIES.map(
        (entry) => `<li class="lesson-card" data-progress-lesson="${entry.id}">
          <a class="lesson-card__link" href="${entry.href}"><span class="lesson-card__label">${entry.label}</span> <span class="lesson-card__title">${entry.title}</span></a>
          ${withFlag ? '<span data-next-flag></span>' : ''}
        </li>`,
      ).join('')}
      <li class="lesson-card" data-progress-lesson="u1/1-1-4"><p class="lesson-card__heading">준비 중</p></li>
    </ul>`;
}

const startEl = (): HTMLElement => document.querySelector('[data-learn-start]') as HTMLElement;
const card = (id: string): HTMLElement => document.querySelector(`[data-progress-lesson="${id}"]`) as HTMLElement;

describe('readStartEntries / paintStart / paintNextFlag', () => {
  beforeEach(() => mount());

  it('링크가 있는 카드만 읽는다(준비 중 카드는 뺀다)', () => {
    expect(readStartEntries(document).map((entry) => entry.id)).toEqual(ENTRIES.map((entry) => entry.id));
    expect(readStartEntries(document)[0]).toEqual(ENTRIES[0]);
  });

  it('paintStart: 안 본 차시는 "시작하기"로 바꾸고 링크 주소를 맞춘다', () => {
    paintStart(startEl(), ENTRIES, stateWith(['u1/1-1-1']));
    expect(startEl().getAttribute('data-start-mode')).toBe('next');
    expect(startEl().querySelector('[data-start-kicker]')?.textContent).toBe('다음에 볼 차시');
    expect(startEl().querySelector('[data-start-title]')?.textContent).toBe('1-1-2 인공지능의 능력');
    expect(startEl().querySelector('[data-start-button-text]')?.textContent).toBe('시작하기');
    expect(startEl().querySelector('[data-start-button]')?.getAttribute('href')).toBe('/x/learn/u1/1-1-2/');
  });

  it('paintStart: 지난번에 본 차시를 아직 다 하지 않았으면 "이어서 하기"로 그 차시를 가리킨다', () => {
    paintStart(startEl(), ENTRIES, stateWith(['u1/1-1-1', 'u1/1-1-2'], [], 'u1/1-1-2'));
    expect(startEl().getAttribute('data-start-mode')).toBe('resume');
    expect(startEl().querySelector('[data-start-kicker]')?.textContent).toBe('지난번에 열어 본 차시');
    expect(startEl().querySelector('[data-start-button-text]')?.textContent).toBe('이어서 하기');
    expect(startEl().querySelector('[data-start-button]')?.getAttribute('href')).toBe('/x/learn/u1/1-1-2/');
  });

  it('paintStart: 진도가 지워지면 처음 상태로 돌아온다', () => {
    paintStart(startEl(), ENTRIES, stateWith(['u1/1-1-1']));
    paintStart(startEl(), ENTRIES, emptyProgress());
    expect(startEl().getAttribute('data-start-mode')).toBe('first');
    expect(startEl().querySelector('[data-start-button-text]')?.textContent).toBe('처음이면 1단원 1-1-1부터');
    expect(startEl().querySelector('[data-start-button]')?.getAttribute('href')).toBe('/x/learn/u1/1-1-1/');
  });

  it('paintNextFlag: 안 본 첫 차시에만 data-next, 진도가 없으면 "여기서 시작", 있으면 "다음에 볼 차시"', () => {
    paintNextFlag(document, ENTRIES, emptyProgress());
    expect(card('u1/1-1-1').hasAttribute('data-next')).toBe(true);
    expect(card('u1/1-1-1').querySelector('[data-next-flag]')?.textContent).toBe('여기서 시작');
    expect(card('u1/1-1-2').hasAttribute('data-next')).toBe(false);

    paintNextFlag(document, ENTRIES, stateWith(['u1/1-1-1']));
    expect(card('u1/1-1-1').hasAttribute('data-next')).toBe(false);
    expect(card('u1/1-1-2').hasAttribute('data-next')).toBe(true);
    expect(card('u1/1-1-2').querySelector('[data-next-flag]')?.textContent).toBe('다음에 볼 차시');
  });

  it('paintNextFlag: 모두 봤으면 표가 하나도 없다', () => {
    paintNextFlag(document, ENTRIES, stateWith(ENTRIES.map((entry) => entry.id)));
    expect(document.querySelectorAll('[data-next]')).toHaveLength(0);
  });
});

describe('installLearnProgress — 진도가 바뀌면 다시 그린다', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('쪽에 시작 카드도 표 자리도 없으면 아무것도 듣지 않는다', () => {
    document.body.innerHTML = '<p>없음</p>';
    expect(() => installLearnProgress(document)()).not.toThrow();
  });

  it('등록하자마자 한 번 칠하고, markSeen·setDone 뒤 다시 칠한다', () => {
    mount('unit');
    const stop = installLearnProgress(document);
    expect(startEl().getAttribute('data-start-mode')).toBe('first');
    expect(card('u1/1-1-1').hasAttribute('data-next')).toBe(true);

    markSeen({ id: 'u1/1-1-1', href: '/x/learn/u1/1-1-1/', label: '1-1-1', title: '첫 차시' });
    // 지난번에 본 차시를 아직 다 하지 않았으니 시작 카드는 그 차시로 "이어서 하기", 목록의 표는 그 바로 뒤 차시
    expect(startEl().getAttribute('data-start-mode')).toBe('resume');
    expect(card('u1/1-1-2').hasAttribute('data-next')).toBe(true);
    setDone('u1/1-1-1', true);
    expect(startEl().getAttribute('data-start-mode')).toBe('next');

    setDone('u1/1-1-2', true);
    expect(card('u1/1-1-3').hasAttribute('data-next')).toBe(true);
    stop();

    // 멈춘 뒤에는 바뀌지 않는다
    markSeen({ id: 'u1/1-1-3', href: '/x/learn/u1/1-1-3/', label: '1-1-3', title: '셋' });
    expect(card('u1/1-1-3').hasAttribute('data-next')).toBe(true);
  });

  it('배우기 첫 쪽(scope all): 지난번에 본 차시로 "이어서 하기"(다 하지 않은 차시)', () => {
    mount('all', false);
    const stop = installLearnProgress(document);
    markSeen({ id: 'u1/1-1-2', href: '/x/learn/u1/1-1-2/', label: '1-1-2', title: '인공지능의 능력' });
    expect(startEl().getAttribute('data-start-mode')).toBe('resume');
    expect(startEl().querySelector('[data-start-button]')?.getAttribute('href')).toBe('/x/learn/u1/1-1-2/');
    stop();
  });
});

describe('가는 차시가 단추 이름에 들어간다(R1-092)', () => {
  beforeEach(() => mount());

  it('처음 상태에서는 aria-label이 없고, 바뀌면 "차시 번호 제목 시작하기"가 이름이 된다(보이는 글이 이름 끝에 그대로 든다)', () => {
    const button = (): Element | null => startEl().querySelector('[data-start-button]');
    paintStart(startEl(), ENTRIES, emptyProgress());
    expect(button()?.hasAttribute('aria-label')).toBe(false);

    paintStart(startEl(), ENTRIES, stateWith(['u1/1-1-1']));
    expect(button()?.getAttribute('aria-label')).toBe('1-1-2 인공지능의 능력 시작하기');
    expect(button()?.getAttribute('aria-label')?.endsWith(startEl().querySelector('[data-start-button-text]')?.textContent ?? '?')).toBe(true);

    // 진도가 지워지면 이름도 처음 상태로 돌아온다
    paintStart(startEl(), ENTRIES, emptyProgress());
    expect(button()?.hasAttribute('aria-label')).toBe(false);
  });
});

describe('이 단원을 모두 봤으면 다음 대단원으로 이어 준다(R1-088)', () => {
  const NEXT: StartEntry[] = [
    { id: 'u2/2-1-1', href: '/x/learn/u2/2-1-1/', label: '2-1-1', title: '피지컬 컴퓨팅' },
    { id: 'u2/2-1-2', href: '/x/learn/u2/2-1-2/', label: '2-1-2', title: 'LCD 제어하기' },
  ];
  const ALL_SEEN = ENTRIES.map((entry) => entry.id);

  function mountWithNext(next: StartEntry[] | null = NEXT): void {
    mount('unit', false);
    const card = startEl();
    if (next) {
      card.setAttribute('data-start-next-numeral', '2');
      card.setAttribute('data-start-next-entries', JSON.stringify(next));
    }
    card.querySelector('[data-start-button]')?.insertAdjacentHTML('afterend', '<a data-start-again hidden href="/x/learn/u1/1-1-1/">처음부터 다시 보기</a>');
  }
  const again = (): HTMLAnchorElement => startEl().querySelector('[data-start-again]') as HTMLAnchorElement;
  const button = (): HTMLAnchorElement => startEl().querySelector('[data-start-button]') as HTMLAnchorElement;

  it('readNextUnit: 서버가 실어 둔 JSON을 읽고, 없거나 깨졌으면 undefined', () => {
    mountWithNext();
    expect(readNextUnit(startEl())).toEqual({ numeral: '2', entries: NEXT });
    startEl().setAttribute('data-start-next-entries', '{깨짐');
    expect(readNextUnit(startEl())).toBeUndefined();
    startEl().setAttribute('data-start-next-entries', '[]');
    expect(readNextUnit(startEl())).toBeUndefined();
    startEl().removeAttribute('data-start-next-numeral');
    expect(readNextUnit(startEl())).toBeUndefined();
  });

  it('모두 봤고 다음 단원을 아직 안 봤으면: 주 단추는 다음 단원 시작하기, 처음부터 다시 보기는 보조 링크로 나타난다', () => {
    mountWithNext();
    paintStart(startEl(), ENTRIES, stateWith(ALL_SEEN));
    expect(startEl().getAttribute('data-start-mode')).toBe('review');
    expect(startEl().getAttribute('data-start-next')).toBe('first');
    expect(startEl().querySelector('[data-start-kicker]')?.textContent).toBe('이 단원을 모두 봤어요. 다음 단원이에요');
    expect(startEl().querySelector('[data-start-title]')?.textContent).toBe('2단원 2-1-1 피지컬 컴퓨팅');
    expect(startEl().querySelector('[data-start-button-text]')?.textContent).toBe('2단원 시작하기');
    expect(button().getAttribute('href')).toBe('/x/learn/u2/2-1-1/');
    expect(button().getAttribute('aria-label')).toBe('2단원 2-1-1 피지컬 컴퓨팅 2단원 시작하기');
    expect(again().hidden).toBe(false);
    expect(again().getAttribute('href')).toBe('/x/learn/u1/1-1-1/');
  });

  it('다음 단원을 일부 봤으면 그 단원의 안 본 첫 차시로 "이어서 하기"', () => {
    mountWithNext();
    paintStart(startEl(), ENTRIES, stateWith([...ALL_SEEN, 'u2/2-1-1']));
    expect(startEl().getAttribute('data-start-next')).toBe('next');
    expect(startEl().querySelector('[data-start-button-text]')?.textContent).toBe('2단원 이어서 하기');
    expect(button().getAttribute('href')).toBe('/x/learn/u2/2-1-2/');
  });

  it('다음 단원도 모두 봤거나 다음 단원이 없으면(마지막 대단원) 예전처럼 "처음부터 다시 보기"가 주 단추이고 보조 링크는 숨는다', () => {
    mountWithNext();
    paintStart(startEl(), ENTRIES, stateWith([...ALL_SEEN, ...NEXT.map((entry) => entry.id)]));
    expect(startEl().querySelector('[data-start-button-text]')?.textContent).toBe('처음부터 다시 보기');
    expect(button().getAttribute('href')).toBe('/x/learn/u1/1-1-1/');
    expect(again().hidden).toBe(true);
    expect(startEl().hasAttribute('data-start-next')).toBe(false);

    mountWithNext(null);
    paintStart(startEl(), ENTRIES, stateWith(ALL_SEEN));
    expect(startEl().querySelector('[data-start-button-text]')?.textContent).toBe('처음부터 다시 보기');
    expect(again().hidden).toBe(true);
  });

  it('아직 다 안 봤으면 다음 단원 이야기는 없다', () => {
    mountWithNext();
    paintStart(startEl(), ENTRIES, stateWith(['u1/1-1-1']));
    expect(startEl().getAttribute('data-start-mode')).toBe('next');
    expect(again().hidden).toBe(true);
    expect(startEl().hasAttribute('data-start-next')).toBe(false);
  });

  it('startTexts: nextUnit이 있어도 review가 아니면 쓰지 않는다', () => {
    const next = { numeral: '2', pick: { mode: 'first', entry: NEXT[0]! } } as const;
    expect(startTexts({ mode: 'next', entry: ENTRIES[1]! }, '처음', next).button).toBe('시작하기');
    expect(startTexts({ mode: 'review', entry: ENTRIES[0]! }, '처음', next).button).toBe('2단원 시작하기');
  });
});
