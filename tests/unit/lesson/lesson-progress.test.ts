// @vitest-environment jsdom
// 차시 쪽 진도·단원 차시 목록(src/components/lesson/lesson-progress.ts, unit-style.ts, quiz.ts의 allCorrect·완료 사건).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DONE_STATUS_TEXT,
  installLessonNav,
  installLessonProgress,
  revealCurrentInNav,
} from '../../../src/components/lesson/lesson-progress.ts';
import { QUIZ_COMPLETE_EVENT, allCorrect, enhanceQuizzes } from '../../../src/components/lesson/quiz.ts';
import { lessonPosition, progressIds, unitCardClass, unitIcon, unitShortName } from '../../../src/components/lesson/unit-style.ts';
import { ICON_NAMES } from '../../../src/components/common/icons.ts';
import { readProgress } from '../../../src/lib/progress.ts';

describe('unit-style — 단원 색·아이콘·몇 번째', () => {
  it('단원마다 다른 아이콘이 있고 모두 아이콘 표에 있는 이름이다', () => {
    const icons = ([1, 2, 3, 4] as const).map(unitIcon);
    expect(new Set(icons).size).toBe(4);
    for (const name of icons) {
      expect(ICON_NAMES).toContain(name);
    }
  });

  it('카드 클래스·짧은 이름·id 이음', () => {
    expect(unitCardClass(3)).toBe('card--u3');
    expect(([1, 2, 3, 4] as const).map(unitShortName)).toEqual(['I단원', 'II단원', 'III단원', 'IV단원']);
    expect(progressIds(['u1/1-1-1', 'u1/1-1-2'])).toBe('u1/1-1-1,u1/1-1-2');
  });

  it('lessonPosition: 같은 대단원 안에서 몇 번째인지', () => {
    const lessons = [
      { id: 'u1/a', unit: 1 },
      { id: 'u1/b', unit: 1 },
      { id: 'u2/c', unit: 2 },
      { id: 'u2/d', unit: 2 },
      { id: 'u2/e', unit: 2 },
    ];
    expect(lessonPosition(lessons, lessons[1]!)).toEqual({ index: 2, total: 2 });
    expect(lessonPosition(lessons, lessons[4]!)).toEqual({ index: 3, total: 3 });
    expect(lessonPosition(lessons, { id: 'u3/x', unit: 3 })).toBeUndefined();
  });
});

describe('quiz.ts — 모두 맞히면 알리는 사건', () => {
  it('allCorrect: 문항이 있고 모두 correct일 때만 true', () => {
    expect(allCorrect([])).toBe(false);
    expect(allCorrect(['correct', 'correct'])).toBe(true);
    expect(allCorrect(['correct', 'wrong'])).toBe(false);
    expect(allCorrect(['correct', 'unanswered'])).toBe(false);
  });

  function quizHtml(): string {
    const item = (name: string) => `
      <li data-quiz-item data-answer="1">
        <fieldset>
          <label><input type="radio" name="${name}" value="0" data-choice-text="가"></label>
          <label><input type="radio" name="${name}" value="1" data-choice-text="나"></label>
        </fieldset>
        <button type="button" data-quiz-check>확인</button>
        <button type="button" data-quiz-reveal hidden>풀이</button>
        <div data-quiz-feedback></div><div data-quiz-explain hidden></div>
      </li>`;
    return `<div data-quiz>${item('q1')}${item('q2')}<p data-quiz-summary></p></div>`;
  }

  const check = (index: number, choice: number) => {
    const items = document.querySelectorAll<HTMLElement>('[data-quiz-item]');
    const radios = items[index]!.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    radios[choice]!.checked = true;
    items[index]!.querySelector<HTMLButtonElement>('[data-quiz-check]')!.click();
  };

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('모든 문항을 맞힌 순간 한 번 퍼진다(틀린 것이 남아 있으면 안 퍼진다)', () => {
    document.body.innerHTML = quizHtml();
    const heard = vi.fn();
    document.addEventListener(QUIZ_COMPLETE_EVENT, heard);
    enhanceQuizzes(document);
    check(0, 1);
    check(1, 0);
    expect(heard).not.toHaveBeenCalled();
    // 틀린 문항을 다시 풀어 맞히면 그때 퍼진다(답을 바꾸면 change로 unanswered가 되었다가 확인으로 correct)
    const radios = document.querySelectorAll<HTMLInputElement>('[data-quiz-item]:nth-child(2) input[type="radio"]');
    radios[1]!.checked = true;
    radios[1]!.dispatchEvent(new Event('change', { bubbles: true }));
    check(1, 1);
    expect(heard).toHaveBeenCalledTimes(1);
    document.removeEventListener(QUIZ_COMPLETE_EVENT, heard);
  });
});

function mountLesson(): void {
  document.body.innerHTML = `
    <div data-lesson-done data-done="false" data-lesson-id="u1/1-1-1" data-lesson-href="/x/learn/u1/1-1-1/" data-lesson-label="1-1-1" data-lesson-title="첫 차시">
      <button type="button" aria-pressed="false" data-lesson-done-button>이 차시 다 했어요</button>
      <p role="status" data-lesson-done-status></p>
    </div>
    <ul>
      <li data-progress-lesson="u1/1-1-1"><a href="#">1-1-1</a><span data-progress-badge></span></li>
      <li data-progress-lesson="u1/1-1-2"><a href="#">1-1-2</a><span data-progress-badge></span></li>
    </ul>`;
}

describe('installLessonProgress — 열면 봤어요, 토글, 퀴즈 완료', () => {
  let stop: () => void = () => {};
  beforeEach(() => {
    localStorage.clear();
    mountLesson();
  });
  afterEach(() => {
    stop();
    document.body.innerHTML = '';
    localStorage.clear();
  });

  const button = (): HTMLButtonElement => document.querySelector('[data-lesson-done-button]') as HTMLButtonElement;
  const status = (): string => document.querySelector('[data-lesson-done-status]')?.textContent ?? '';
  const badge = (id: string): string => document.querySelector(`[data-progress-lesson="${id}"] [data-progress-badge]`)?.textContent ?? '';

  it('차시를 열면 봤어요가 저장되고 목록 배지가 바뀐다', () => {
    stop = installLessonProgress(document);
    const state = readProgress();
    expect(state.seen).toEqual(['u1/1-1-1']);
    expect(state.last).toMatchObject({ id: 'u1/1-1-1', href: '/x/learn/u1/1-1-1/', label: '1-1-1', title: '첫 차시' });
    expect(badge('u1/1-1-1')).toBe('봤어요');
    expect(badge('u1/1-1-2')).toBe('');
    expect(button().getAttribute('aria-pressed')).toBe('false');
  });

  it('[다 했어요]를 누르면 켜지고(aria-pressed·data-done), 저장되고, 낭독 글이 나온다. 다시 누르면 꺼진다', () => {
    stop = installLessonProgress(document);
    button().click();
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-lesson-done]')?.getAttribute('data-done')).toBe('true');
    expect(readProgress().done).toEqual(['u1/1-1-1']);
    expect(status()).toBe(DONE_STATUS_TEXT.done);
    expect(badge('u1/1-1-1')).toBe('다 했어요');

    button().click();
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(readProgress().done).toEqual([]);
    expect(readProgress().seen).toEqual(['u1/1-1-1']);
    expect(status()).toBe(DONE_STATUS_TEXT.undone);
    expect(badge('u1/1-1-1')).toBe('봤어요');
  });

  it('이미 다 했다고 표시한 차시를 열면 단추가 켜진 채로 시작한다', () => {
    localStorage.clear();
    stop = installLessonProgress(document);
    button().click();
    stop();
    stop = installLessonProgress(document);
    expect(button().getAttribute('aria-pressed')).toBe('true');
  });

  it('확인 퀴즈를 모두 맞히면 저절로 다 했어요로 바뀐다', () => {
    stop = installLessonProgress(document);
    document.dispatchEvent(new CustomEvent(QUIZ_COMPLETE_EVENT));
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(readProgress().done).toEqual(['u1/1-1-1']);
    expect(status()).toBe(DONE_STATUS_TEXT.quiz);
  });

  it('이미 다 했다고 표시했으면 퀴즈 사건이 낭독 글을 또 만들지 않는다', () => {
    stop = installLessonProgress(document);
    button().click();
    const before = status();
    document.dispatchEvent(new CustomEvent(QUIZ_COMPLETE_EVENT));
    expect(status()).toBe(before);
  });

  it('[다 했어요] 상자가 없는 쪽에서는 아무 일도 하지 않는다', () => {
    document.body.innerHTML = '<p>다른 쪽</p>';
    stop = installLessonProgress(document);
    expect(readProgress().seen).toEqual([]);
  });
});

function mountNav(): HTMLDetailsElement {
  document.body.innerHTML = `
    <details data-lesson-nav>
      <summary>이 단원 차시 목록 펼치기</summary>
      <div data-lesson-nav-scroll style="height:100px;overflow:auto">
        <nav aria-label="단원 차시 목록"><a href="#" aria-current="page">1-1-1</a></nav>
      </div>
    </details>`;
  return document.querySelector('[data-lesson-nav]') as HTMLDetailsElement;
}

function stubMatchMedia(initial: boolean): { set: (value: boolean) => void } {
  let matches = initial;
  const listeners = new Set<() => void>();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  })) as unknown as typeof window.matchMedia;
  return {
    set(value) {
      matches = value;
      listeners.forEach((listener) => listener());
    },
  };
}

describe('installLessonNav — 넓은 화면은 펼치고 좁은 화면은 접는다', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('좁은 화면에서는 접힌 채로 둔다(요약 줄이 Tab 정지점 하나)', () => {
    stubMatchMedia(false);
    const details = mountNav();
    const stop = installLessonNav(document);
    expect(details.open).toBe(false);
    expect(details.hasAttribute('data-wide')).toBe(false);
    stop();
  });

  it('넓은 화면에서는 펼치고 data-wide를 붙이며, 다시 좁아지면 접고 떼어 낸다', () => {
    const media = stubMatchMedia(true);
    const details = mountNav();
    const stop = installLessonNav(document);
    expect(details.open).toBe(true);
    expect(details.hasAttribute('data-wide')).toBe(true);
    media.set(false);
    expect(details.open).toBe(false);
    expect(details.hasAttribute('data-wide')).toBe(false);
    media.set(true);
    expect(details.open).toBe(true);
    stop();
  });

  it('좁은 화면에서 사용자가 연 목록은 되감지 않는다', () => {
    const media = stubMatchMedia(false);
    const details = mountNav();
    const stop = installLessonNav(document);
    details.open = true;
    media.set(false);
    expect(details.open).toBe(true);
    stop();
  });

  it('상자가 없거나 matchMedia가 없으면 조용히 넘어간다', () => {
    document.body.innerHTML = '<p>x</p>';
    expect(() => installLessonNav(document)()).not.toThrow();
  });

  it('revealCurrentInNav: 지금 차시가 없으면 스크롤하지 않는다', () => {
    const nav = document.createElement('div');
    nav.innerHTML = '<a href="#">x</a>';
    document.body.append(nav);
    nav.scrollTop = 0;
    revealCurrentInNav(nav);
    expect(nav.scrollTop).toBe(0);
  });
});
