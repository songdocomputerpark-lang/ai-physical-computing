// @vitest-environment jsdom
// 학습 진도 화면 칠하기(src/components/progress/progress-paint.ts) — 진짜 DOM(jsdom)에서 속성·글·막대 값·이벤트 반응을 확인한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROGRESS_BADGE_TEXT,
  describeUnitProgress,
  installProgressPaint,
  paintProgress,
  parseLessonIds,
  watchProgress,
} from '../../src/components/progress/progress-paint.ts';
import { PROGRESS_STORAGE_NAME, emptyProgress, markSeen, setDone, type ProgressState } from '../../src/lib/progress.ts';
import { clearOurs, storageKey } from '../../src/lib/storage.ts';

const IDS = ['u1/1-1-1', 'u1/1-1-2', 'u1/1-1-3'];

function mount(): void {
  document.body.innerHTML = `
    <ul id="list">
      <li data-progress-lesson="u1/1-1-1"><a href="#a">1-1-1</a><span data-progress-badge>x</span></li>
      <li data-progress-lesson="u1/1-1-2"><a href="#b">1-1-2</a><span data-progress-badge></span></li>
      <li data-progress-lesson="u1/1-1-3"><a href="#c">1-1-3</a><span data-progress-badge></span></li>
      <li data-progress-lesson="bad id"><span data-progress-badge></span></li>
    </ul>
    <section id="unit-a" data-progress-unit="${IDS.join(',')}" data-progress-label="1단원">
      <p data-progress-count></p>
      <progress id="bar-a" data-progress-bar></progress>
    </section>
    <section id="unit-b" data-progress-unit="u1" data-progress-ids="u2/2-1-1, u2/2-1-2">
      <p data-progress-count></p>
      <div id="bar-b" class="progress-bar" data-progress-bar></div>
    </section>
    <section id="unit-c" data-progress-unit="u1">
      <ol>
        <li data-progress-lesson="u1/1-1-1"></li>
        <li data-progress-lesson="u1/1-1-2"></li>
      </ol>
      <p data-progress-count></p>
    </section>
  `;
}

const el = (selector: string): HTMLElement => document.querySelector(selector) as HTMLElement;
const state = (id: string): string | null => document.querySelector(`[data-progress-lesson="${id}"]`)?.getAttribute('data-progress-state') ?? null;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-progress-has');
  mount();
});

afterEach(() => {
  // installProgressPaint가 남긴 듣기를 정리한다.
  installProgressPaint()();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('글 만들기', () => {
  it('describeUnitProgress', () => {
    expect(describeUnitProgress({ total: 18, seen: 5, done: 3 })).toBe('18차시 중 3차시를 다 했어요');
    expect(describeUnitProgress({ total: 18, seen: 2, done: 0 })).toBe('18차시 중 2차시를 열어 봤어요');
    expect(describeUnitProgress({ total: 18, seen: 0, done: 0 })).toBe('');
    expect(describeUnitProgress({ total: 0, seen: 0, done: 0 })).toBe('');
  });

  it('parseLessonIds는 모양이 맞는 것만 뽑는다', () => {
    expect(parseLessonIds('u1/1-1-1, u1/1-1-2 u2/x,bad,')).toEqual(['u1/1-1-1', 'u1/1-1-2', 'u2/x']);
    expect(parseLessonIds(null)).toEqual([]);
    expect(parseLessonIds('')).toEqual([]);
  });

  it('배지 글', () => {
    expect(PROGRESS_BADGE_TEXT).toEqual({ done: '다 했어요', seen: '열어 봤어요', none: '' });
  });
});

describe('차시 하나', () => {
  it('진도가 없으면 모두 none이고 배지는 빈 글이다(처음 온 사람)', () => {
    paintProgress();
    for (const id of IDS) {
      expect(state(id)).toBe('none');
    }
    expect(el('#list li').querySelector('[data-progress-badge]')?.textContent).toBe('');
    expect(document.documentElement.hasAttribute('data-progress-has')).toBe(false);
  });

  it('done·seen·none을 붙이고 배지에 글을 넣는다', () => {
    markSeen({ id: 'u1/1-1-2', href: '/x/', label: '1-1-2', title: '둘째' }, localStorage, 1);
    setDone('u1/1-1-1', true, localStorage);
    paintProgress();
    expect(state('u1/1-1-1')).toBe('done');
    expect(state('u1/1-1-2')).toBe('seen');
    expect(state('u1/1-1-3')).toBe('none');
    const badges = [...document.querySelectorAll('#list [data-progress-badge]')].map((badge) => badge.textContent);
    expect(badges).toEqual(['다 했어요', '열어 봤어요', '', '']);
    expect(document.documentElement.hasAttribute('data-progress-has')).toBe(true);
  });

  it('모양이 틀린 id는 none', () => {
    setDone('u1/1-1-1', true, localStorage);
    paintProgress();
    expect(el('[data-progress-lesson="bad id"]').getAttribute('data-progress-state')).toBe('none');
  });

  it('링크 안은 건드리지 않는다(배지는 링크 밖 요소)', () => {
    setDone('u1/1-1-1', true, localStorage);
    paintProgress();
    expect(el('#list li a').textContent).toBe('1-1-1');
  });
});

describe('단원', () => {
  it('진도가 없으면 data-progress-empty이고 글은 비어 있다', () => {
    paintProgress();
    const unit = el('#unit-a');
    expect(unit.hasAttribute('data-progress-empty')).toBe(true);
    expect(unit.hasAttribute('data-progress-ready')).toBe(true);
    expect(unit.querySelector('[data-progress-count]')?.textContent).toBe('');
    expect(el('#bar-a').hasAttribute('aria-label')).toBe(false);
  });

  it('끝낸 개수 글과 <progress> 값을 넣는다', () => {
    setDone('u1/1-1-1', true, localStorage);
    markSeen({ id: 'u1/1-1-2', href: '/x/', label: '1-1-2', title: '둘째' }, localStorage, 1);
    paintProgress();
    const unit = el('#unit-a');
    expect(unit.hasAttribute('data-progress-empty')).toBe(false);
    expect(unit.querySelector('[data-progress-count]')?.textContent).toBe('3차시 중 1차시를 다 했어요');
    const bar = el('#bar-a') as HTMLProgressElement;
    expect(bar.max).toBe(3);
    expect(bar.value).toBe(1);
    expect(bar.getAttribute('aria-label')).toBe('1단원 3차시 중 1차시를 다 했어요');
    expect(bar.style.getPropertyValue('--progress-done')).toBe('33%');
    expect(bar.style.getPropertyValue('--progress-seen')).toBe('67%');
  });

  it('끝낸 것이 없고 본 것만 있으면 "열어 봤어요" 글', () => {
    markSeen({ id: 'u1/1-1-1', href: '/x/', label: '1-1-1', title: '첫째' }, localStorage, 1);
    paintProgress();
    expect(el('#unit-a [data-progress-count]').textContent).toBe('3차시 중 1차시를 열어 봤어요');
  });

  it('data-progress-ids가 있으면 그것을 쓰고, div 막대는 role=img와 CSS 변수로 칠한다', () => {
    setDone('u2/2-1-2', true, localStorage);
    paintProgress();
    const bar = el('#bar-b');
    expect(el('#unit-b [data-progress-count]').textContent).toBe('2차시 중 1차시를 다 했어요');
    expect(bar.getAttribute('role')).toBe('img');
    expect(bar.getAttribute('aria-label')).toBe('2차시 중 1차시를 다 했어요');
    expect(bar.style.getPropertyValue('--progress-done')).toBe('50%');
  });

  it('다른 단원의 진도는 세지 않는다', () => {
    setDone('u3/3-1-1', true, localStorage);
    paintProgress();
    expect(el('#unit-a').hasAttribute('data-progress-empty')).toBe(true);
  });

  it('차시 id 목록이 없으면 안에 든 [data-progress-lesson]을 센다', () => {
    setDone('u1/1-1-2', true, localStorage);
    paintProgress();
    expect(el('#unit-c [data-progress-count]').textContent).toBe('2차시 중 1차시를 다 했어요');
  });

  it('칠한 값을 지우면(빈 진도) 다시 empty가 된다', () => {
    setDone('u1/1-1-1', true, localStorage);
    paintProgress();
    expect(el('#unit-a').hasAttribute('data-progress-empty')).toBe(false);
    paintProgress(document, emptyProgress());
    expect(el('#unit-a').hasAttribute('data-progress-empty')).toBe(true);
    expect(el('#unit-a [data-progress-count]').textContent).toBe('');
    expect(state('u1/1-1-1')).toBe('none');
  });

  it('여러 번 칠해도 결과가 같다', () => {
    setDone('u1/1-1-1', true, localStorage);
    paintProgress();
    const first = document.body.innerHTML;
    paintProgress();
    expect(document.body.innerHTML).toBe(first);
  });

  it('root를 주면 그 안만 칠한다', () => {
    setDone('u1/1-1-1', true, localStorage);
    paintProgress(el('#list'));
    expect(state('u1/1-1-1')).toBe('done');
    expect(el('#unit-a').hasAttribute('data-progress-ready')).toBe(false);
  });
});

describe('저장 공간이 막혀도', () => {
  it('오류 없이 빈 진도로 칠한다', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('막힘');
    });
    try {
      expect(() => paintProgress()).not.toThrow();
      expect(state('u1/1-1-1')).toBe('none');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('installProgressPaint', () => {
  it('설치하면 곧바로 칠한다', () => {
    setDone('u1/1-1-1', true, localStorage);
    installProgressPaint();
    expect(state('u1/1-1-1')).toBe('done');
  });

  it('여러 번 불러도 듣기는 한 번이다', () => {
    const add = vi.spyOn(document, 'addEventListener');
    try {
      installProgressPaint();
      installProgressPaint();
      const mine = add.mock.calls.filter(([name]) => name === 'apc:progress-changed');
      expect(mine).toHaveLength(1);
    } finally {
      add.mockRestore();
    }
  });

  it('apc:progress-changed(markSeen·setDone이 보냄)에 다시 칠한다', () => {
    installProgressPaint();
    expect(state('u1/1-1-1')).toBe('none');
    setDone('u1/1-1-1', true, localStorage);
    expect(state('u1/1-1-1')).toBe('done');
    markSeen({ id: 'u1/1-1-2', href: '/x/', label: '1-1-2', title: '둘째' }, localStorage, 5);
    expect(state('u1/1-1-2')).toBe('seen');
  });

  it('이벤트가 싣고 온 값으로 칠한다(저장이 막힌 브라우저에서도 그 쪽을 보는 동안 반영)', () => {
    installProgressPaint();
    const next: ProgressState = { ...emptyProgress(), done: ['u1/1-1-3'], seen: ['u1/1-1-3'] };
    document.dispatchEvent(new CustomEvent('apc:progress-changed', { detail: next }));
    expect(state('u1/1-1-3')).toBe('done');
  });

  it('apc:records-cleared(기록 지우기)에 비운다', () => {
    installProgressPaint();
    setDone('u1/1-1-1', true, localStorage);
    expect(state('u1/1-1-1')).toBe('done');
    clearOurs(localStorage);
    document.dispatchEvent(new CustomEvent('apc:records-cleared', { detail: { removed: 1 } }));
    expect(state('u1/1-1-1')).toBe('none');
    expect(el('#unit-a').hasAttribute('data-progress-empty')).toBe(true);
    expect(document.documentElement.hasAttribute('data-progress-has')).toBe(false);
  });

  it('다른 탭의 storage 이벤트(진도 이름·전체 비움)에 다시 칠한다', () => {
    installProgressPaint();
    // 다른 탭이 저장한 것을 흉내: 이벤트 없이 저장 공간만 바꾼다.
    localStorage.setItem(
      storageKey(PROGRESS_STORAGE_NAME),
      JSON.stringify({ version: 1, seen: ['u1/1-1-2'], done: [], last: null, lastLab: null }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey(PROGRESS_STORAGE_NAME) }));
    expect(state('u1/1-1-2')).toBe('seen');
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(state('u1/1-1-2')).toBe('none');
  });

  it('상관없는 이름의 storage 이벤트는 무시한다', () => {
    installProgressPaint();
    localStorage.setItem(
      storageKey(PROGRESS_STORAGE_NAME),
      JSON.stringify({ version: 1, seen: ['u1/1-1-2'], done: [], last: null, lastLab: null }),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: 'other-site:x' }));
    expect(state('u1/1-1-2')).toBe('none');
  });

  it('멈추면 더는 칠하지 않는다', () => {
    const stop = installProgressPaint();
    stop();
    setDone('u1/1-1-1', true, localStorage);
    expect(state('u1/1-1-1')).not.toBe('done');
  });
});

describe('watchProgress', () => {
  it('등록하면 한 번 부르고, 바뀔 때마다 부르고, 멈추면 그친다', () => {
    const seen: number[] = [];
    const stop = watchProgress((current) => seen.push(current.done.length));
    expect(seen).toEqual([0]);
    setDone('u1/1-1-1', true, localStorage);
    expect(seen).toEqual([0, 1]);
    stop();
    setDone('u1/1-1-2', true, localStorage);
    expect(seen).toEqual([0, 1]);
  });
});
