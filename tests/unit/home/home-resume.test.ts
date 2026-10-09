// @vitest-environment jsdom
// 홈 진도 부분(src/components/home/home-resume.ts) — 이어서 하기 띠와 배움 지도 단추를 진짜 DOM(jsdom)에서 확인한다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyMapProgress, applyResume, installHomeProgress } from '../../../src/components/home/home-resume.ts';
import { emptyProgress, markSeen, rememberLab, setDone, type ProgressState } from '../../../src/lib/progress.ts';

const BASE = '/ai-physical-computing/learn/';
const IDS = ['u1/1-1-1', 'u1/1-1-2', 'u1/1-1-3'];
const LAB = '/ai-physical-computing/labs/vision/';
/** 쪽에 실리는 "지금 있는 차시·실습실" 목록(HomeResume.astro)과 같은 모양. 2단원 차시 둘이 더 있다. */
const INDEX = {
  lessons: [
    ['u1/1-1-1', '1-1-1', '카메라란 무엇일까'],
    ['u1/1-1-2', '1-1-2', '영상은 숫자예요'],
    ['u1/1-1-3', '1-1-3', '밝기를 바꿔 봐요'],
    ['u2/2-1-1', '2-1-1', '영상 처리 기초'],
    ['u2/2-1-2', '2-1-2', 'LED 켜기'],
  ],
  labs: [LAB, '/ai-physical-computing/labs/esp32/'],
};

function mount(withIndex = true): void {
  document.body.innerHTML = `
    <section data-home-resume hidden>
      ${withIndex ? `<script type="application/json" data-home-index>${JSON.stringify(INDEX)}</script>` : ''}
      <ul>
        <li data-resume-lesson data-go-open="이어서 하기" data-go-done="다시 보기" hidden><a data-resume-link href="#"><span data-resume-name></span> <span data-resume-go>이어서 하기</span></a></li>
        <li data-resume-next hidden><a data-resume-link href="#"><span data-resume-name></span> <span>이어서 하기</span></a></li>
        <li data-resume-lab hidden><a data-resume-link href="#"><span data-resume-name></span> <span>다시 열기</span></a></li>
      </ul>
    </section>
    <section data-home-map data-learn-base="${BASE}" data-start-label="배우기" data-resume-label="계속하기" data-replay-label="다시 보기">
      <div data-home-unit data-progress-unit="${IDS.join(',')}">
        <p data-progress-count></p>
        <div class="progress-bar" data-progress-bar aria-hidden="true"></div>
        <a data-unit-start data-first-href="${BASE}u1/1-1-1/" data-unit-name="I단원" href="${BASE}u1/1-1-1/"><span data-unit-start-label>I단원 배우기</span></a>
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
    applyResume(document, { ...emptyProgress(), lastLab: { path: LAB, title: '영상처리 실습실', at: 2 } });
    expect(q('[data-home-resume]').hasAttribute('hidden')).toBe(false);
    expect(q('[data-resume-lesson]').hasAttribute('hidden')).toBe(true);
    expect(q('[data-resume-lab]').hasAttribute('hidden')).toBe(false);
    expect(q('[data-resume-lab] [data-resume-link]').getAttribute('href')).toBe(LAB);
    expect(q('[data-resume-lab] [data-resume-name]').textContent).toBe('영상처리 실습실');
  });

  it('저장된 글은 마크업이 아니라 글자로만 들어간다(목록이 없는 쪽에서 저장된 값을 쓰는 경우)', () => {
    mount(false);
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

  it('안 끝낸 차시면 동작 글은 "이어서 하기"이고 "다음에 볼 차시" 칸은 숨어 있다', () => {
    applyResume(document, withLast());
    expect(q('[data-resume-go]').textContent).toBe('이어서 하기');
    expect(q('[data-resume-next]').hasAttribute('hidden')).toBe(true);
  });

  // R1-030: 끝낸 차시가 "이어서 하기"에 그대로 남던 문제
  describe('지난번 차시를 이미 끝냈으면', () => {
    const doneLast = (): ProgressState => ({
      ...emptyProgress(),
      seen: ['u1/1-1-1', 'u2/2-1-1'],
      done: ['u1/1-1-1', 'u2/2-1-1'],
      last: { id: 'u2/2-1-1', href: `${BASE}u2/2-1-1/`, label: '2-1-1', title: '영상 처리 기초', at: 5 },
    });

    it('그 칸은 "다시 보기"로 바뀌고, 같은 대단원의 안 연 첫 차시가 "다음에 볼 차시"로 나온다', () => {
      applyResume(document, doneLast());
      expect(q('[data-resume-go]').textContent).toBe('다시 보기');
      expect(q('[data-resume-lesson] [data-resume-link]').getAttribute('href')).toBe(`${BASE}u2/2-1-1/`);
      expect(q('[data-resume-next]').hasAttribute('hidden')).toBe(false);
      expect(q('[data-resume-next] [data-resume-link]').getAttribute('href')).toBe(`${BASE}u2/2-1-2/`);
      expect(q('[data-resume-next] [data-resume-name]').textContent).toBe('2-1-2 LED 켜기');
    });

    it('대단원을 다 열었으면 다음 칸은 없고, "다시 보기"만 남는다', () => {
      const state = doneLast();
      state.seen.push('u2/2-1-2');
      applyResume(document, state);
      expect(q('[data-resume-go]').textContent).toBe('다시 보기');
      expect(q('[data-resume-next]').hasAttribute('hidden')).toBe(true);
    });

    it('끝냄 표시를 풀면 다시 "이어서 하기"로 돌아오고 다음 칸은 숨는다', () => {
      applyResume(document, doneLast());
      applyResume(document, { ...doneLast(), done: ['u1/1-1-1'] });
      expect(q('[data-resume-go]').textContent).toBe('이어서 하기');
      expect(q('[data-resume-next]').hasAttribute('hidden')).toBe(true);
    });
  });

  // R1-031: 없는 차시·실습실 id가 진도에 있으면 404 링크 카드가 나오던 문제
  describe('사이트에 없는 차시·실습실이 진도에 있으면', () => {
    const stale = (): ProgressState => ({
      ...emptyProgress(),
      seen: ['u1/9-9-9'],
      last: { id: 'u1/9-9-9', href: `${BASE}u1/9-9-9/`, label: '9-9-9', title: '없는 차시', at: 1 },
      lastLab: { path: '/ai-physical-computing/labs/nonexistent/', title: '없는 실습실', at: 2 },
    });

    it('두 칸 모두 숨기고 띠도 보이지 않는다', () => {
      applyResume(document, stale());
      expect(q('[data-resume-lesson]').hasAttribute('hidden')).toBe(true);
      expect(q('[data-resume-lab]').hasAttribute('hidden')).toBe(true);
      expect(q('[data-home-resume]').hasAttribute('hidden')).toBe(true);
    });

    it('있는 쪽만 남긴다(없는 차시 + 있는 실습실)', () => {
      applyResume(document, { ...stale(), lastLab: { path: LAB, title: '영상처리 실습실', at: 2 } });
      expect(q('[data-resume-lesson]').hasAttribute('hidden')).toBe(true);
      expect(q('[data-resume-lab]').hasAttribute('hidden')).toBe(false);
      expect(q('[data-home-resume]').hasAttribute('hidden')).toBe(false);
    });

    it('실습실 주소는 끝의 / 유무와 상관없이 맞춰 본다', () => {
      applyResume(document, { ...emptyProgress(), lastLab: { path: '/ai-physical-computing/labs/vision', title: '영상처리 실습실', at: 2 } });
      expect(q('[data-resume-lab]').hasAttribute('hidden')).toBe(false);
    });

    it('있는 차시는 저장된 옛 번호·제목·주소가 아니라 지금 사이트의 것으로 보인다', () => {
      const state = withLast();
      state.last!.title = '옛 제목';
      state.last!.href = '/old-base/learn/u1/1-1-1/';
      applyResume(document, state);
      expect(q('[data-resume-lesson] [data-resume-name]').textContent).toBe('1-1-1 카메라란 무엇일까');
      expect(q('[data-resume-lesson] [data-resume-link]').getAttribute('href')).toBe(`${BASE}u1/1-1-1/`);
    });

    it('목록(JSON)이 없는 쪽에서는 거르지 않고 저장된 값을 그대로 쓴다', () => {
      mount(false);
      applyResume(document, stale());
      expect(q('[data-resume-lesson]').hasAttribute('hidden')).toBe(false);
      expect(q('[data-resume-lab]').hasAttribute('hidden')).toBe(false);
    });
  });
});

describe('배움 지도 단추', () => {
  const start = (): HTMLElement => q('[data-unit-start]');
  const label = (): string | null => q('[data-unit-start-label]').textContent;

  // R1-027: 단추 글에 단원이 들어 있어 머리글 메뉴 [시작하기]·띠의 [이어서 하기]와 겹치지 않는다. 보이는 글이 곧 접근 이름이라 aria-label은 없다.
  it('본 차시가 없으면 [I단원 배우기] → 첫 차시', () => {
    applyMapProgress(document, emptyProgress());
    expect(label()).toBe('I단원 배우기');
    expect(start().getAttribute('href')).toBe(`${BASE}u1/1-1-1/`);
    expect(start().hasAttribute('aria-label')).toBe(false);
  });

  it('일부를 봤으면 [I단원 계속하기] → 안 본 첫 차시', () => {
    applyMapProgress(document, { ...emptyProgress(), seen: ['u1/1-1-1'] });
    expect(label()).toBe('I단원 계속하기');
    expect(start().getAttribute('href')).toBe(`${BASE}u1/1-1-2/`);
    expect(start().hasAttribute('aria-label')).toBe(false);
  });

  it('끝낸 차시도 본 것으로 센다', () => {
    applyMapProgress(document, { ...emptyProgress(), seen: ['u1/1-1-1', 'u1/1-1-2'], done: ['u1/1-1-1', 'u1/1-1-2'] });
    expect(start().getAttribute('href')).toBe(`${BASE}u1/1-1-3/`);
  });

  it('모두 봤으면 [I단원 다시 보기] → 첫 차시', () => {
    applyMapProgress(document, { ...emptyProgress(), seen: [...IDS] });
    expect(label()).toBe('I단원 다시 보기');
    expect(start().getAttribute('href')).toBe(`${BASE}u1/1-1-1/`);
  });

  it('진도가 지워지면 처음 모습으로 돌아온다', () => {
    applyMapProgress(document, { ...emptyProgress(), seen: ['u1/1-1-1'] });
    applyMapProgress(document, emptyProgress());
    expect(label()).toBe('I단원 배우기');
    expect(start().getAttribute('href')).toBe(`${BASE}u1/1-1-1/`);
  });
});

describe('installHomeProgress(저장소와 이벤트)', () => {
  it('처음에는 아무것도 안 보이고, 차시를 보면 띠가 생기고 지도 단추가 바뀐다', () => {
    const stop = installHomeProgress();
    try {
      expect(q('[data-home-resume]').hasAttribute('hidden')).toBe(true);
      expect(q('[data-unit-start-label]').textContent).toBe('I단원 배우기');

      markSeen({ id: 'u1/1-1-1', href: `${BASE}u1/1-1-1/`, label: '1-1-1', title: '카메라란 무엇일까' });
      expect(q('[data-home-resume]').hasAttribute('hidden')).toBe(false);
      expect(q('[data-resume-lesson] [data-resume-name]').textContent).toBe('1-1-1 카메라란 무엇일까');
      expect(q('[data-unit-start-label]').textContent).toBe('I단원 계속하기');
      // 단원 진도 글은 progress-paint가 칠한다
      expect(q('[data-progress-count]').textContent).toBe('3차시 중 1차시를 열어 봤어요');
      expect(document.documentElement.hasAttribute('data-progress-has')).toBe(true);

      setDone('u1/1-1-1', true);
      expect(q('[data-progress-count]').textContent).toBe('3차시 중 1차시를 마쳤어요');

      rememberLab({ path: '/ai-physical-computing/labs/esp32/', title: 'ESP32 실습실' });
      expect(q('[data-resume-lab]').hasAttribute('hidden')).toBe(false);
      // 끝낸 차시를 마지막으로 보았으니 동작 글은 "다시 보기"다(1-1-2가 남아 있어 다음 칸도 나온다)
      expect(q('[data-resume-go]').textContent).toBe('다시 보기');
      expect(q('[data-resume-next] [data-resume-link]').getAttribute('href')).toBe(`${BASE}u1/1-1-2/`);
    } finally {
      stop();
    }
  });
});
