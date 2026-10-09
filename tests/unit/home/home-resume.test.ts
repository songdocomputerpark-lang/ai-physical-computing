// @vitest-environment jsdom
// 홈 진도 부분(src/components/home/home-resume.ts) — 이어서 하기 띠와 배움 지도 단추를 진짜 DOM(jsdom)에서 확인한다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyMapProgress, applyResume, installHomeProgress } from '../../../src/components/home/home-resume.ts';
import { emptyProgress, markSeen, rememberLab, setDone, type ProgressState } from '../../../src/lib/progress.ts';

const BASE = '/ai-physical-computing/learn/';
const IDS = ['u1/1-1-1', 'u1/1-1-2', 'u1/1-1-3'];

function mount(): void {
  document.body.innerHTML = `
    <section data-home-resume hidden>
      <ul>
        <li data-resume-lesson hidden><a data-resume-link href="#"><span data-resume-name></span> <span>이어서 하기</span></a></li>
        <li data-resume-lab hidden><a data-resume-link href="#"><span data-resume-name></span> <span>다시 열기</span></a></li>
      </ul>
    </section>
    <section data-home-map data-learn-base="${BASE}" data-start-label="시작하기" data-resume-label="이어서 하기" data-replay-label="다시 보기">
      <div data-home-unit data-progress-unit="${IDS.join(',')}">
        <p data-progress-count></p>
        <div class="progress-bar" data-progress-bar></div>
        <a data-unit-start data-first-href="${BASE}u1/1-1-1/" data-unit-name="I단원" href="${BASE}u1/1-1-1/" aria-label="I단원 시작하기"><span data-unit-start-label>시작하기</span></a>
      </div>
    </section>`;
}

const q = (selector: string): HTMLElement => document.querySelector(selector) as HTMLElement;

function withLast(): ProgressState {
  return {
    ...emptyProgress(),
    seen: ['u1/1-1-1'],
    last: { id: 'u1/1-1-1', href: `${BASE}u1/1-1-1/`, label: '1-1-1', title: '카메라란 무엇일까', at: 1 },
  };
}

beforeEach(() => {
  localStorage.clear();
  mount();
});

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('이어서 하기 띠', () => {
  it('진도가 없으면 띠가 계속 숨어 있다(처음 온 사람에게는 아무것도 안 보인다)', () => {
    applyResume(document, emptyProgress());
    expect(q('[data-home-resume]').hasAttribute('hidden')).toBe(true);
    expect(q('[data-resume-lesson]').hasAttribute('hidden')).toBe(true);
    expect(q('[data-resume-lab]').hasAttribute('hidden')).toBe(true);
  });

  it('지난번에 본 차시가 있으면 띠와 차시 칸이 보이고, 링크·이름이 채워진다', () => {
    applyResume(document, withLast());
    expect(q('[data-home-resume]').hasAttribute('hidden')).toBe(false);
    expect(q('[data-resume-lesson]').hasAttribute('hidden')).toBe(false);
    expect(q('[data-resume-lab]').hasAttribute('hidden')).toBe(true);
    expect(q('[data-resume-lesson] [data-resume-link]').getAttribute('href')).toBe(`${BASE}u1/1-1-1/`);
    expect(q('[data-resume-lesson] [data-resume-name]').textContent).toBe('1-1-1 카메라란 무엇일까');
  });

  it('마지막 실습실만 있어도 띠가 보인다', () => {
    applyResume(document, { ...emptyProgress(), lastLab: { path: '/ai-physical-computing/labs/vision/', title: '영상처리 실습실', at: 2 } });
    expect(q('[data-home-resume]').hasAttribute('hidden')).toBe(false);
    expect(q('[data-resume-lesson]').hasAttribute('hidden')).toBe(true);
    expect(q('[data-resume-lab]').hasAttribute('hidden')).toBe(false);
    expect(q('[data-resume-lab] [data-resume-link]').getAttribute('href')).toBe('/ai-physical-computing/labs/vision/');
    expect(q('[data-resume-lab] [data-resume-name]').textContent).toBe('영상처리 실습실');
  });

  it('저장된 글은 마크업이 아니라 글자로만 들어간다', () => {
    const state = withLast();
    state.last!.title = '<img src=x onerror=alert(1)>';
    applyResume(document, state);
    expect(q('[data-resume-lesson] [data-resume-name]').querySelector('img')).toBeNull();
    expect(q('[data-resume-lesson] [data-resume-name]').textContent).toContain('<img');
  });

  it('진도를 지우면 다시 숨는다', () => {
    applyResume(document, withLast());
    applyResume(document, emptyProgress());
    expect(q('[data-home-resume]').hasAttribute('hidden')).toBe(true);
  });
});

describe('배움 지도 단추', () => {
  const start = (): HTMLElement => q('[data-unit-start]');
  const label = (): string | null => q('[data-unit-start-label]').textContent;

  it('본 차시가 없으면 [시작하기] → 첫 차시', () => {
    applyMapProgress(document, emptyProgress());
    expect(label()).toBe('시작하기');
    expect(start().getAttribute('href')).toBe(`${BASE}u1/1-1-1/`);
    expect(start().getAttribute('aria-label')).toBe('I단원 시작하기');
  });

  it('일부를 봤으면 [이어서 하기] → 안 본 첫 차시', () => {
    applyMapProgress(document, { ...emptyProgress(), seen: ['u1/1-1-1'] });
    expect(label()).toBe('이어서 하기');
    expect(start().getAttribute('href')).toBe(`${BASE}u1/1-1-2/`);
    expect(start().getAttribute('aria-label')).toBe('I단원 이어서 하기');
  });

  it('끝낸 차시도 본 것으로 센다', () => {
    applyMapProgress(document, { ...emptyProgress(), seen: ['u1/1-1-1', 'u1/1-1-2'], done: ['u1/1-1-1', 'u1/1-1-2'] });
    expect(start().getAttribute('href')).toBe(`${BASE}u1/1-1-3/`);
  });

  it('모두 봤으면 [다시 보기] → 첫 차시', () => {
    applyMapProgress(document, { ...emptyProgress(), seen: [...IDS] });
    expect(label()).toBe('다시 보기');
    expect(start().getAttribute('href')).toBe(`${BASE}u1/1-1-1/`);
  });

  it('진도가 지워지면 처음 모습으로 돌아온다', () => {
    applyMapProgress(document, { ...emptyProgress(), seen: ['u1/1-1-1'] });
    applyMapProgress(document, emptyProgress());
    expect(label()).toBe('시작하기');
    expect(start().getAttribute('href')).toBe(`${BASE}u1/1-1-1/`);
  });
});

describe('installHomeProgress(저장소와 이벤트)', () => {
  it('처음에는 아무것도 안 보이고, 차시를 보면 띠가 생기고 지도 단추가 바뀐다', () => {
    const stop = installHomeProgress();
    try {
      expect(q('[data-home-resume]').hasAttribute('hidden')).toBe(true);
      expect(q('[data-unit-start-label]').textContent).toBe('시작하기');

      markSeen({ id: 'u1/1-1-1', href: `${BASE}u1/1-1-1/`, label: '1-1-1', title: '카메라란 무엇일까' });
      expect(q('[data-home-resume]').hasAttribute('hidden')).toBe(false);
      expect(q('[data-resume-lesson] [data-resume-name]').textContent).toBe('1-1-1 카메라란 무엇일까');
      expect(q('[data-unit-start-label]').textContent).toBe('이어서 하기');
      // 단원 진도 글은 progress-paint가 칠한다
      expect(q('[data-progress-count]').textContent).toBe('3차시 중 1개 봤어요');
      expect(document.documentElement.hasAttribute('data-progress-has')).toBe(true);

      setDone('u1/1-1-1', true);
      expect(q('[data-progress-count]').textContent).toBe('3차시 중 1개 끝냄');

      rememberLab({ path: '/ai-physical-computing/labs/esp32/', title: 'ESP32 실습실' });
      expect(q('[data-resume-lab]').hasAttribute('hidden')).toBe(false);
    } finally {
      stop();
    }
  });
});
