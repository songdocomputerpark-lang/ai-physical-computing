// 실습실이 학생을 헤매지 않게 하는 두 도구의 순수 논리(2026-09-17 Phase 2 검토 반영).
// - src/lab/controls/reveal.ts: 방금 생긴 칸(결과·오류 카드)이 화면 밖이면 화면 안으로 옮긴다. 이미 보이면 움직이지 않는다.
// - src/lab/modules/panel-when-used.ts: 흉내 모듈 패널을 "코드가 그 모듈을 쓸 때만" 연다(한 페이지 한 개념).
// 실제 화면 위치·스크롤은 브라우저 테스트(lab-vision·lab-errors·lab-mediapipe-hands)가 본다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isMostlyVisible, revealElement, revealTogether } from '../../../src/lab/controls/reveal.ts';
import { showPanelWhenUsed } from '../../../src/lab/modules/panel-when-used.ts';
import type { LabModuleContext } from '../../../src/lab/modules/types.ts';

/** getBoundingClientRect와 scrollIntoView만 가진 가짜 요소 */
function fakeElement(top: number, height: number, width = 300) {
  const calls: ScrollIntoViewOptions[] = [];
  return {
    calls,
    element: {
      getBoundingClientRect: () => ({ top, bottom: top + height, height, width, left: 0, right: width, x: 0, y: top, toJSON: () => ({}) }),
      scrollIntoView: (options?: ScrollIntoViewOptions) => {
        calls.push(options ?? {});
      },
    } as unknown as Element,
  };
}

describe('화면 안으로 옮기기(reveal.ts)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('다 보이거나(작은 칸) 화면 절반 넘게 차지하면(큰 칸) 충분히 보인다고 본다', () => {
    const viewport = 768;
    expect(isMostlyVisible(fakeElement(100, 400).element, viewport)).toBe(true); // 모두 보임
    expect(isMostlyVisible(fakeElement(468, 300).element, viewport)).toBe(true); // 작은 칸이 끝까지 보임
    expect(isMostlyVisible(fakeElement(600, 300).element, viewport)).toBe(false); // 작은 칸(오류 카드 같은)이 잘려 있음
    expect(isMostlyVisible(fakeElement(678, 900).element, viewport)).toBe(false); // 90px만 걸친 출력 칸(1366×768 검토 실측)
    expect(isMostlyVisible(fakeElement(300, 900).element, viewport)).toBe(true); // 큰 칸이 화면 절반 넘게 보임
    expect(isMostlyVisible(fakeElement(2900, 400).element, viewport)).toBe(false); // 오류 카드(문서 y≈2,900)
    expect(isMostlyVisible(fakeElement(-500, 300).element, viewport)).toBe(false); // 위로 지나감
    // 화면보다 큰 칸은 화면 절반 이상 보이면 된다
    expect(isMostlyVisible(fakeElement(0, 3000).element, viewport)).toBe(true);
    expect(isMostlyVisible(fakeElement(500, 3000).element, viewport)).toBe(false);
    // 숨은 칸(크기 0)은 옮기지 않는다
    expect(isMostlyVisible(fakeElement(5000, 0, 0).element, viewport)).toBe(true);
  });

  it('화면 밖이면 옮기고, 움직임 줄이기 설정이면 부드럽게 넘기지 않는다', () => {
    let reduce = false;
    vi.stubGlobal('window', { innerHeight: 768, matchMedia: () => ({ matches: reduce }) });
    vi.stubGlobal('document', { documentElement: { clientHeight: 768 } });

    const far = fakeElement(2900, 400);
    expect(revealElement(far.element)).toBe(true);
    expect(far.calls).toEqual([{ behavior: 'smooth', block: 'start' }]);

    reduce = true;
    const again = fakeElement(1500, 400);
    expect(revealElement(again.element, { block: 'nearest' })).toBe(true);
    expect(again.calls).toEqual([{ behavior: 'auto', block: 'nearest' }]);

    const visible = fakeElement(100, 200);
    expect(revealElement(visible.element)).toBe(false);
    expect(visible.calls).toEqual([]);
  });

  it('요소가 없거나 브라우저가 아니면 조용히 넘어간다', () => {
    expect(revealElement(null)).toBe(false);
    expect(revealElement(undefined)).toBe(false);
    expect(revealElement(fakeElement(3000, 100).element)).toBe(false); // window 없음(Node)
  });
});

describe('두 칸을 함께 보이기(revealTogether)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubWindow(scrollY: number, reduce = false) {
    const scrolls: ScrollToOptions[] = [];
    vi.stubGlobal('window', {
      innerHeight: 768,
      scrollY,
      matchMedia: () => ({ matches: reduce }),
      scrollTo: (options: ScrollToOptions) => {
        scrolls.push(options);
      },
    });
    vi.stubGlobal('document', { documentElement: { clientHeight: 768 } });
    return scrolls;
  }

  it('출력 창은 보이지만 조절 막대가 화면 밖이면(1366×768 첫 실습) 둘이 함께 들어오게 옮긴다', () => {
    const scrolls = stubWindow(400);
    const output = fakeElement(285, 420); // 이미 화면 안
    const slider = fakeElement(900, 70); // 화면 밖
    expect(revealTogether(output.element, slider.element, { slack: 60 })).toBe(true);
    expect(scrolls).toEqual([{ top: 400 + 285 - 8, behavior: 'smooth' }]);
    expect(output.calls).toEqual([]); // 첫 칸만 보이는 길(scrollIntoView)은 쓰지 않음
  });

  it('넓은 후보(출력 칸 전체)가 막대와 함께 안 들어가면 좁은 후보(출력 화면 틀)로 맞춘다 — 1366×768 실측값', () => {
    const scrolls = stubWindow(399);
    const wide = fakeElement(317, 571); // 출력 칸 전체(입력 칸 높이만큼 늘어남)
    const narrow = fakeElement(393, 217); // 출력 화면 틀
    const slider = fakeElement(978, 113); // threshold 막대
    expect(revealTogether([wide.element, narrow.element], slider.element, { slack: 40, block: 'center' })).toBe(true);
    expect(scrolls).toEqual([{ top: 399 + 393 - 8, behavior: 'smooth' }]);
    // 375×812처럼 넓은 후보가 들어가면 넓은 후보를 쓴다
    const scrollsMobile = stubWindow(1237);
    vi.stubGlobal('window', { ...(globalThis.window as object), innerHeight: 812 });
    expect(revealTogether([fakeElement(1977, 466).element, fakeElement(2051, 257).element], fakeElement(2528, 113).element, { slack: 40 })).toBe(true);
    expect(scrollsMobile).toEqual([{ top: 1237 + 1977 - 8, behavior: 'smooth' }]);
  });

  it('둘 다 이미 보이면 움직이지 않고, 둘째 칸이 없으면 첫 칸만 본다', () => {
    const scrolls = stubWindow(0);
    expect(revealTogether(fakeElement(100, 300).element, fakeElement(450, 60).element, { slack: 60 })).toBe(false);
    expect(scrolls).toEqual([]);
    const far = fakeElement(2900, 400);
    expect(revealTogether(far.element, null)).toBe(true);
    expect(far.calls).toEqual([{ behavior: 'smooth', block: 'start' }]);
  });

  // R1-096: 조작 줄 묶음이 화면 위에 붙으면(넓은 화면 sticky) 칸을 그 밑에 놓는다. 둘이 안 들어가면 여유(slack)를 8px까지 줄여 한 번 더 본다.
  it('붙은 줄(inset)이 있으면 칸을 그 밑에 놓는다 — 둘이 함께 들어오는 시나리오 A(결과 칸 + 조절 막대)가 깨지지 않게', () => {
    const scrolls = stubWindow(0);
    const narrow = fakeElement(700, 217);
    const slider = fakeElement(1232, 112); // 700 ~ 1344 = 644px
    expect(revealTogether([narrow.element], slider.element, { slack: 40, block: 'center', inset: 64 })).toBe(true);
    expect(scrolls).toEqual([{ top: 700 - (8 + 64), behavior: 'smooth' }]);
  });

  it('붙은 줄 때문에 여유 40px가 안 들어가면 여유를 8px로 줄여 다시 본다', () => {
    const scrolls = stubWindow(0);
    const narrow = fakeElement(700, 217);
    const slider = fakeElement(1268, 112); // 700 ~ 1380 = 680px: 680 + 72 + 40 > 768, 680 + 72 + 8 <= 768
    expect(revealTogether([narrow.element], slider.element, { slack: 40, inset: 64 })).toBe(true);
    expect(scrolls).toEqual([{ top: 700 - 72, behavior: 'smooth' }]);
  });

  it('붙은 줄이 높아 그 밑에 둘을 다 못 넣으면 둘째 칸의 아래 끝을 화면 아래에 맞춘다(통합 확인 — 시나리오 A 막대가 화면 밖에 남았다)', () => {
    const scrolls = stubWindow(400);
    const narrow = fakeElement(413, 218);
    const slider = fakeElement(903, 113); // 413 ~ 1016 = 603px: 603 + (8 + 160) + 8 > 768, 603 + 16 <= 768
    expect(revealTogether([narrow.element], slider.element, { slack: 40, block: 'center', inset: 160 })).toBe(true);
    expect(scrolls).toEqual([{ top: 400 + 1016 + 8 - 768, behavior: 'smooth' }]);
  });

  it('붙은 줄에 가려진 칸(위쪽이 줄 높이보다 작다)은 이미 보인다고 보지 않는다', () => {
    const scrolls = stubWindow(500);
    const covered = fakeElement(30, 217); // 화면 위 30px — 붙은 줄(64px) 밑
    const slider = fakeElement(400, 112);
    expect(revealTogether([covered.element], slider.element, { slack: 40, inset: 64 })).toBe(true);
    expect(scrolls).toEqual([{ top: 500 + 30 - 72, behavior: 'smooth' }]);
    // 붙은 줄이 없으면(inset 0) 같은 배치가 이미 보인다
    const none = stubWindow(500);
    expect(revealTogether([fakeElement(30, 217).element], fakeElement(400, 112).element, { slack: 40 })).toBe(false);
    expect(none).toEqual([]);
  });

  it('둘을 합쳐 화면보다 크면 첫 칸만 보이고, 움직임 줄이기면 부드럽게 넘기지 않는다', () => {
    const scrolls = stubWindow(0, true);
    const output = fakeElement(1200, 500);
    expect(revealTogether(output.element, fakeElement(1900, 70).element, { slack: 60 })).toBe(true);
    expect(scrolls).toEqual([]);
    expect(output.calls).toEqual([{ behavior: 'auto', block: 'start' }]);
    const scrolls2 = stubWindow(100, true);
    expect(revealTogether(fakeElement(900, 300).element, fakeElement(1250, 60).element)).toBe(true);
    expect(scrolls2).toEqual([{ top: 100 + 900 - 8, behavior: 'auto' }]);
  });
});

/** showPanelWhenUsed가 쓰는 만큼만 흉내 낸 모듈 문맥 */
function fakeContext(initialCode: string) {
  const state = { code: initialCode, runtimeState: 'idle', visible: false, shows: 0, hides: 0 };
  const codeHandlers: ((event: { code: string }) => void)[] = [];
  const context = {
    showPanel: () => {
      state.visible = true;
      state.shows += 1;
    },
    hidePanel: () => {
      state.visible = false;
      state.hides += 1;
    },
    onLab: (type: string, handler: (event: { code: string }) => void) => {
      if (type === 'code') {
        codeHandlers.push(handler);
      }
      return () => undefined;
    },
    lab: { getCode: () => state.code },
    runtime: {
      get state() {
        return state.runtimeState;
      },
    },
  } as unknown as LabModuleContext;
  const typeCode = (code: string) => {
    state.code = code;
    for (const handler of codeHandlers) {
      handler({ code });
    }
  };
  return { context, state, typeCode };
}

describe('흉내 모듈 패널은 쓸 때만 연다(panel-when-used.ts)', () => {
  const MEDIAPIPE = /\bmediapipe\b|\bmp\s*\.\s*solutions\b/u;

  it('처음 코드에 모듈 이름이 없으면 닫고, 있으면 연다', () => {
    const edge = fakeContext('import cv2\nedges = cv2.Canny(gray, 100, 200)\n');
    showPanelWhenUsed(edge.context, MEDIAPIPE);
    expect(edge.state.visible).toBe(false);

    const hands = fakeContext('import mediapipe as mp\nhands = mp.solutions.hands.Hands()\n');
    showPanelWhenUsed(hands.context, MEDIAPIPE);
    expect(hands.state.visible).toBe(true);
  });

  it('코드를 고치면 따라 열리고 닫히지만, 실행 중에는 닫지 않는다', () => {
    const { context, state, typeCode } = fakeContext('print(1)\n');
    showPanelWhenUsed(context, MEDIAPIPE);
    expect(state.visible).toBe(false);
    typeCode('import mediapipe as mp\n');
    expect(state.visible).toBe(true);
    state.runtimeState = 'running';
    typeCode('print(2)\n');
    expect(state.visible).toBe(true); // 실행 중에는 그대로
    state.runtimeState = 'idle';
    typeCode('print(3)\n');
    expect(state.visible).toBe(false);
  });

  it('파이썬이 실제로 쓰면(show) 그 뒤로는 코드가 바뀌어도 닫지 않는다', () => {
    const { context, state, typeCode } = fakeContext('print(1)\n');
    const gate = showPanelWhenUsed(context, MEDIAPIPE);
    gate.show();
    expect(state.visible).toBe(true);
    typeCode('print("mediapipe 글자 없음")\n'.replace('mediapipe', '인식'));
    expect(state.visible).toBe(true);
  });
});
