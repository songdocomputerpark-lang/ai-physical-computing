// 차시 안 실습실(높이 맞춤 틀)의 "화면 안으로 옮기기"(판 1.7.0, PROGRESS 미해결 261 #13·#14 — src/lab/controls/reveal.ts 머리말).
// 차시 쪽(LessonExamples.astro)이 틀 높이를 안쪽 문서에 맞추면 틀 안 창 높이가 문서 전체라, 보이는 자리를 바깥 쪽 화면과 겹치는 띠로 재고
// 바깥 창을 굴려야 한다. [실행] 뒤 결과 옮기기(revealTogether)는 조작 줄([data-lab-bar])이 보이고 있으면 화면 밖으로 밀지 않는다.
// 실제 화면은 브라우저 시험(tests/e2e/lesson-embed.spec.ts)이 본다.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMBED_FIT_ATTRIBUTE, embedFitView, isMostlyVisible, revealElement, revealTogether } from '../../../src/lab/controls/reveal.ts';

function box(top: number, height: number, width = 300) {
  return { top, bottom: top + height, height, width, left: 0, right: width, x: 0, y: top, toJSON: () => ({}) };
}

/** getBoundingClientRect와 scrollIntoView만 가진 가짜 요소(틀 안 문서 좌표) */
function fakeElement(top: number, height: number, width = 300) {
  const calls: ScrollIntoViewOptions[] = [];
  return {
    calls,
    element: {
      getBoundingClientRect: () => box(top, height, width),
      scrollIntoView: (options?: ScrollIntoViewOptions) => {
        calls.push(options ?? {});
      },
    } as unknown as Element,
  };
}

interface FitStub {
  /** 바깥 쪽에서 본 틀 위 끝(음수면 화면 위로 지나감) */
  frameTop: number;
  /** 틀 높이 = 안쪽 문서 높이(높이 맞춤) */
  frameHeight: number;
  /** 바깥 쪽 화면 높이 */
  outerHeight: number;
  outerScroll: number;
  fit?: boolean;
  bar?: Element | null;
  reduce?: boolean;
}

/** 높이 맞춤 틀 안의 window·document 대역. 바깥 창의 scrollTo를 모은다 */
function stubFitFrame(stub: FitStub) {
  const outerScrolls: ScrollToOptions[] = [];
  const ownScrolls: ScrollToOptions[] = [];
  const outer = {
    innerHeight: stub.outerHeight,
    scrollY: stub.outerScroll,
    scrollTo: (options: ScrollToOptions) => {
      outerScrolls.push(options);
    },
    document: { documentElement: { clientHeight: stub.outerHeight } },
  };
  vi.stubGlobal('window', {
    innerHeight: stub.frameHeight,
    scrollY: 0,
    matchMedia: () => ({ matches: stub.reduce ?? false }),
    scrollTo: (options: ScrollToOptions) => {
      ownScrolls.push(options);
    },
    frameElement: { getBoundingClientRect: () => box(stub.frameTop, stub.frameHeight, 700), clientTop: 0 },
    parent: outer,
  });
  vi.stubGlobal('document', {
    documentElement: {
      clientHeight: stub.frameHeight,
      hasAttribute: (name: string) => (stub.fit ?? true) && name === 'data-embed-fit',
    },
    querySelector: (selector: string) => (selector === '[data-lab-bar]' ? (stub.bar ?? null) : null),
  });
  return { outerScrolls, ownScrolls };
}

describe('차시 안 실습실(높이 맞춤 틀)의 보이는 자리', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('보이는 띠는 바깥 쪽 화면과 틀이 겹치는 곳이다 — 틀 창 높이(문서 전체)로 재지 않는다', () => {
    // 375×812 휴대폰: 틀(3,146px)이 바깥 쪽에서 1,000px 위로 지나가 있다 → 틀 안 1,000~1,812가 화면에 보인다
    stubFitFrame({ frameTop: -1000, frameHeight: 3146, outerHeight: 812, outerScroll: 6000 });
    const view = embedFitView();
    expect(view).toMatchObject({ top: 1000, bottom: 1812 });
    // 부르는 쪽은 예전처럼 window.innerHeight(틀 높이 3,146)를 넘긴다 — 그래도 띠로 잰다
    expect(isMostlyVisible(fakeElement(1100, 300).element, 3146)).toBe(true);
    expect(isMostlyVisible(fakeElement(2000, 300).element, 3146)).toBe(false); // 틀 안에서는 "창 안"이지만 바깥 화면 밖
    expect(isMostlyVisible(fakeElement(400, 300).element, 3146)).toBe(false); // 화면 위로 지나간 칸
    // 틀 위 끝이 화면 가운데(300)에 있으면 화면 띠는 틀 안 좌표로 −300~512(틀 위쪽 화면까지 — 굴릴 양은 화면 기준으로 잰다)
    stubFitFrame({ frameTop: 300, frameHeight: 3146, outerHeight: 812, outerScroll: 5000 });
    expect(embedFitView()).toMatchObject({ top: -300, bottom: 512 });
    expect(isMostlyVisible(fakeElement(600, 200).element, 3146)).toBe(false);
    expect(isMostlyVisible(fakeElement(100, 200).element, 3146)).toBe(true);
  });

  it('뿌리에 data-embed-fit이 없거나 틀이 아니면 예전 계산 그대로다', () => {
    stubFitFrame({ frameTop: -1000, frameHeight: 3146, outerHeight: 812, outerScroll: 6000, fit: false });
    expect(embedFitView()).toBeUndefined();
    expect(isMostlyVisible(fakeElement(2000, 300).element, 3146)).toBe(true); // 틀 창(3,146) 안이라 보인다고 본다(수업 화면 속 실습실 — 틀이 스스로 스크롤)
  });

  it('[실행] 뒤 결과 옮기기는 바깥 창을 굴리되, 보이는 조작 줄을 화면 밖으로 밀지 않는다(walk-student-first #14)', () => {
    // 조작 줄이 띠 위 끝에서 300px 아래에 보인다 → 결과 칸까지 굴리고 싶어도 300 − 여백 8 = 292px까지만
    const bar = fakeElement(1300, 120).element;
    const { outerScrolls, ownScrolls } = stubFitFrame({ frameTop: -1000, frameHeight: 3146, outerHeight: 812, outerScroll: 6000, bar });
    const wide = fakeElement(2300, 600).element; // 입력·출력 칸(빈 영상 칸)
    expect(revealTogether([wide], null, { block: 'center', slack: 40 })).toBe(true);
    expect(ownScrolls).toEqual([]); // 틀 안은 굴리지 않는다(스크롤은 바깥 쪽 하나)
    expect(outerScrolls).toEqual([{ top: 6000 + 292, behavior: 'smooth' }]);
  });

  it('조작 줄이 이미 띠 위 끝에 붙어 있으면 더 굴리지 않는다(코드와 [실행]이 화면에 남는다)', () => {
    const bar = fakeElement(1004, 120).element;
    const { outerScrolls } = stubFitFrame({ frameTop: -1000, frameHeight: 3146, outerHeight: 812, outerScroll: 6000, bar });
    const output = fakeElement(2300, 400).element;
    const notice = fakeElement(2720, 90).element; // "콘솔에 결과가 나왔어요" 알림
    expect(revealTogether([output], notice, { margin: 8, fallback: output })).toBe(false);
    expect(outerScrolls).toEqual([]);
  });

  it('조작 줄과 결과가 한 화면에 들어가면 덜 굴리는 아래 끝 맞춤으로 둘 다 보인다', () => {
    const bar = fakeElement(1100, 100).element;
    const { outerScrolls } = stubFitFrame({ frameTop: -1000, frameHeight: 3146, outerHeight: 812, outerScroll: 6000, bar });
    const output = fakeElement(1500, 250).element;
    const slider = fakeElement(1760, 60).element; // 조절 막대(아래 끝 1,820 — 띠 아래 끝 1,812보다 8px 아래)
    expect(revealTogether([output], slider, { slack: 40 })).toBe(true);
    // 아래 끝 맞춤: 1,820 + 여유 40 − 1,812 = 48px만 굴린다(위 끝 맞춤이면 1,500 − 1,008 = 492px)
    expect(outerScrolls).toEqual([{ top: 6048, behavior: 'smooth' }]);
  });

  it('조작 줄이 화면에 없으면(편집칸에서 단축키로 실행) 지키지 않고 결과를 보인다', () => {
    const bar = fakeElement(200, 100).element; // 띠(1,000~1,812) 위로 지나감
    const { outerScrolls } = stubFitFrame({ frameTop: -1000, frameHeight: 3146, outerHeight: 812, outerScroll: 6000, bar });
    const wide = fakeElement(2300, 400).element;
    expect(revealTogether([wide], null, { block: 'start' })).toBe(true);
    expect(outerScrolls).toEqual([{ top: 6000 + (2300 - 1008), behavior: 'smooth' }]);
  });

  it('revealElement(오류 카드·[콘솔 보기])는 조작 줄과 상관없이 바깥 창을 굴려 띠 위 끝에 붙인다', () => {
    const bar = fakeElement(1004, 120).element;
    const { outerScrolls, ownScrolls } = stubFitFrame({ frameTop: -1000, frameHeight: 3146, outerHeight: 812, outerScroll: 6000, bar, reduce: true });
    const card = fakeElement(2600, 300);
    expect(revealElement(card.element)).toBe(true);
    expect(card.calls).toEqual([]); // scrollIntoView 대신 직접(바깥 창) — 띠를 알아야 해서
    expect(ownScrolls).toEqual([]);
    expect(outerScrolls).toEqual([{ top: 6000 + (2600 - 1008), behavior: 'auto' }]);
    // 이미 보이면 움직이지 않는다
    outerScrolls.length = 0;
    expect(revealElement(fakeElement(1200, 200).element)).toBe(false);
    expect(outerScrolls).toEqual([]);
  });

  it('틀 위 끝이 화면 아래쪽에 있어도 화면 기준으로 굴린다 — 조작 줄은 화면 위 끝까지 올라갈 수 있다', () => {
    // 틀 위 끝이 화면 y=500, 조작 줄은 틀 안 y=40(화면 y=540) → 화면 위 끝 + 8까지 532px 굴릴 수 있다
    const bar = fakeElement(40, 100).element;
    const { outerScrolls } = stubFitFrame({ frameTop: 500, frameHeight: 3000, outerHeight: 812, outerScroll: 4000, bar });
    const wide = fakeElement(1400, 600).element;
    expect(revealTogether([wide], null, { block: 'start' })).toBe(true);
    expect(outerScrolls).toEqual([{ top: 4000 + 532, behavior: 'smooth' }]);
    // 화면 밖 아래(틀 전체가 화면 아래)의 오류 카드도 화면 위 끝 + 8에 온다: 화면 y = 1,200 + 2,000 → 8
    const below = stubFitFrame({ frameTop: 1200, frameHeight: 3000, outerHeight: 812, outerScroll: 0 });
    expect(revealElement(fakeElement(2000, 200).element)).toBe(true);
    expect(below.outerScrolls).toEqual([{ top: 1200 + 2000 - 8, behavior: 'smooth' }]);
  });

  it('가운데 맞춤·가까운 쪽 맞춤도 띠 안에서 계산한다', () => {
    const { outerScrolls } = stubFitFrame({ frameTop: -1000, frameHeight: 3146, outerHeight: 812, outerScroll: 6000 });
    expect(revealElement(fakeElement(2400, 212).element, { block: 'center' })).toBe(true);
    // 띠 1,000~1,812(812px)의 가운데: 1,000 + (812 − 212)/2 = 1,300 → 2,400 − 1,300 = 1,100px
    expect(outerScrolls.at(-1)).toEqual({ top: 7100, behavior: 'smooth' });
    expect(revealElement(fakeElement(1900, 100).element, { block: 'nearest' })).toBe(true);
    // 아래에 있으니 아래 끝을 띠 아래 끝 − 8에: 1,900 − (1,812 − 8 − 100) = 196px
    expect(outerScrolls.at(-1)).toEqual({ top: 6196, behavior: 'smooth' });
  });
});

describe('높이 맞춤 이름·값 대조(판 1.7.0 — 세 파일이 같은 약속을 쓴다)', () => {
  const read = (file: string) => fs.readFileSync(path.resolve(file), 'utf8');

  it('차시 쪽 스크립트(LessonExamples.astro)·global.css·reveal.ts가 같은 뿌리 표시 이름을 쓴다', () => {
    expect(EMBED_FIT_ATTRIBUTE).toBe('data-embed-fit');
    // 차시 쪽은 실습실 묶음을 끌어오지 않으려 이름을 글자로 적는다 — 같은 글자여야 한다
    expect(read('src/components/lesson/LessonExamples.astro')).toContain(`const EMBED_FIT_ATTRIBUTE = '${EMBED_FIT_ATTRIBUTE}';`);
    expect(read('src/styles/global.css')).toContain(`:root[data-embed][${EMBED_FIT_ATTRIBUTE}]`);
  });

  it('global.css가 바깥 화면 높이(--embed-vh)로 다시 잰 편집칸·블록 작업판 높이는 실습실 틀의 vh 값과 같다', () => {
    const css = read('src/styles/global.css');
    const labShell = read('src/components/lab/LabShell.astro');
    const blocks = read('src/components/lab/blocks/BlocksPanel.astro');
    // 실습실 틀: .lab__editor-host { height: clamp(18rem, 52vh, 40rem) } → 높이 맞춤: clamp(18rem, calc(var(--embed-vh, 1vh) * 52), 40rem)
    const pairs: [string, string][] = [
      [labShell, 'clamp(18rem, 52vh, 40rem)'],
      [blocks, 'clamp(11rem, 30vh, 20rem)'],
      [blocks, 'clamp(24rem, 66vh, 46rem)'],
      [blocks, 'clamp(22rem, 64vh, 30rem)'],
    ];
    for (const [source, value] of pairs) {
      expect(source, `실습실 쪽 값 ${value} — 바꿨으면 global.css의 높이 맞춤 덩이도 함께`).toContain(value);
      const fitted = value.replace(/(\d+)vh/u, 'calc(var(--embed-vh, 1vh) * $1)');
      expect(css, `global.css 높이 맞춤 ${fitted}`).toContain(fitted);
    }
  });
});
