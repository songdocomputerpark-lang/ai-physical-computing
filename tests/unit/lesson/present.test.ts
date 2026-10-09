// 발표 모드(src/components/lesson/present.ts, PLAN §8.5 P5-02) — 단계 나누기와 키 해석(DOM 없이). 화면 동작은 tests/e2e/lesson-template.spec.ts.
import { describe, expect, it } from 'vitest';
import {
  hasMoreBelow,
  hiddenBelow,
  isMergeable,
  mergedLabel,
  planPresentationSteps,
  presentCommandFor,
  scrollTargetFor,
  splitTallSteps,
  unionBlocks,
  type PresentSection,
  type PresentStep,
} from '../../../src/components/lesson/present.ts';

const SECTIONS: PresentSection[] = [
  { title: '학습목표', blocks: [{ kind: 'h2', title: '학습목표' }, { kind: 'content' }] },
  {
    title: '핵심 개념',
    blocks: [
      { kind: 'h2', title: '핵심 개념' },
      { kind: 'h3', title: '첫 개념' },
      { kind: 'content' },
      { kind: 'content' },
      { kind: 'h3', title: '둘째 개념' },
      { kind: 'content' },
    ],
  },
  {
    title: '따라하기',
    blocks: [{ kind: 'h2', title: '따라하기' }, { kind: 'content' }, { kind: 'break' }, { kind: 'content' }],
  },
  {
    title: '도전 과제',
    blocks: [{ kind: 'h2', title: '도전 과제' }, { kind: 'break' }, { kind: 'break' }],
  },
  {
    title: '확인 퀴즈',
    blocks: [{ kind: 'h2', title: '확인 퀴즈' }, { kind: 'content' }, { kind: 'split', items: 3 }],
  },
];

describe('발표 모드 단계 나누기(planPresentationSteps)', () => {
  const steps = planPresentationSteps('1-1-1 인공지능', SECTIONS);

  it('첫 장은 차시 제목이고, 칸(##)마다 새 단계가 시작된다', () => {
    expect(steps[0]).toEqual({ section: -1, blocks: [], label: '1-1-1 인공지능' });
    expect(steps[1]).toEqual({ section: 0, blocks: [0, 1], label: '학습목표' });
  });

  it('### 제목마다 단계를 나누고, 제목만 있는 단계는 만들지 않는다(## 바로 뒤 ###은 함께)', () => {
    const concept = steps.filter((step) => step.section === 1);
    expect(concept.map((step) => step.blocks)).toEqual([
      [0, 1, 2, 3],
      [4, 5],
    ]);
    expect(concept.map((step) => step.label)).toEqual(['핵심 개념 — 첫 개념', '핵심 개념 — 둘째 개념']);
  });

  it('따라하기 예제·도전 과제 상자(break)는 앞 내용이 있으면 새 단계로 나뉜다', () => {
    expect(steps.filter((step) => step.section === 2).map((step) => step.blocks)).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(steps.filter((step) => step.section === 3).map((step) => step.blocks)).toEqual([[0, 1], [2]]);
  });

  it('확인 퀴즈는 문항마다 한 단계이고, 뒤 문항에도 칸 제목을 함께 보인다', () => {
    const quiz = steps.filter((step) => step.section === 4);
    expect(quiz.map((step) => [step.blocks, step.item])).toEqual([
      [[0, 1, 2], 0],
      [[0, 2], 1],
      [[0, 2], 2],
    ]);
    expect(quiz.map((step) => step.label)).toEqual(['확인 퀴즈 (1/3)', '확인 퀴즈 (2/3)', '확인 퀴즈 (3/3)']);
    expect(steps).toHaveLength(1 + 1 + 2 + 2 + 2 + 3);
  });

  it('칸이 없어도 제목 장 하나는 있다', () => {
    expect(planPresentationSteps('제목', [])).toHaveLength(1);
  });

  it('따라하기 예제·도전 과제 단계의 막대 글에 그 이름이 붙는다(어느 예제인지 — Phase 5 검토 중요 5)', () => {
    const named = planPresentationSteps('제목', [
      {
        title: '따라하기',
        blocks: [
          { kind: 'h2', title: '따라하기' },
          { kind: 'h3', title: '코드 읽기' },
          { kind: 'content' },
          { kind: 'break', title: '예제 1: 글자 쓰기' },
          { kind: 'content' },
          { kind: 'break', title: '예제 2: 숫자 세기' },
        ],
      },
    ]);
    expect(named.slice(1).map((step) => step.label)).toEqual([
      '따라하기 — 코드 읽기',
      '따라하기 — 코드 읽기 · 예제 1: 글자 쓰기',
      '따라하기 — 코드 읽기 · 예제 2: 숫자 세기',
    ]);
  });
});

describe('한 화면보다 긴 단계 나누기(splitTallSteps — Phase 5 검토 중요 5)', () => {
  const section: PresentSection = {
    title: '왜 배울까',
    blocks: [{ kind: 'h2', title: '왜 배울까' }, { kind: 'content' }, { kind: 'content' }, { kind: 'content' }],
  };
  const heights = [60, 200, 500, 150];
  const base = planPresentationSteps('제목', [section]);

  it('화면에 들어가면 그대로 둔다', () => {
    expect(splitTallSteps(base, [section], (_s, block) => heights[block] ?? 0, 1000)).toEqual(base);
  });

  it('넘치면 블록 경계에서 나누고, 나뉜 단계마다 칸 제목을 다시 보이며 "(이어서)"를 붙인다', () => {
    const split = splitTallSteps(base, [section], (_s, block) => heights[block] ?? 0, 600);
    expect(split.slice(1).map((step) => [step.blocks, step.label])).toEqual([
      [[0, 1], '왜 배울까'],
      [[0, 2], '왜 배울까 (이어서)'],
      [[0, 3], '왜 배울까 (이어서)'],
    ]);
  });

  it('블록 하나가 화면보다 크면 그 블록만(제목과 함께) 한 단계로 두고, 퀴즈 문항 단계는 나누지 않는다', () => {
    const tall = splitTallSteps(base, [section], (_s, block) => (block === 2 ? 2000 : (heights[block] ?? 0)), 600);
    expect(tall.slice(1).map((step) => step.blocks)).toEqual([
      [0, 1],
      [0, 2],
      [0, 3],
    ]);
    const quiz = planPresentationSteps('제목', [SECTIONS[4] as PresentSection]);
    expect(splitTallSteps(quiz, [SECTIONS[4] as PresentSection], () => 5000, 600)).toEqual(quiz);
  });
});

describe('발표 모드 키(presentCommandFor)', () => {
  it('→·PageDown은 다음, ←·PageUp은 앞, Home·End는 처음·끝, Esc는 끝내기', () => {
    expect(presentCommandFor({ key: 'ArrowRight', target: 'none' })).toBe('next');
    expect(presentCommandFor({ key: 'PageDown', target: 'control' })).toBe('next');
    expect(presentCommandFor({ key: 'ArrowLeft', target: 'control' })).toBe('previous');
    expect(presentCommandFor({ key: 'PageUp', target: 'none' })).toBe('previous');
    expect(presentCommandFor({ key: 'Home', target: 'none' })).toBe('first');
    expect(presentCommandFor({ key: 'End', target: 'none' })).toBe('last');
    expect(presentCommandFor({ key: 'Escape', target: 'text' })).toBe('exit');
  });

  it('보기(라디오)·코드 상자처럼 ←→를 스스로 쓰는 곳과 글 입력칸에서는 가로채지 않는다', () => {
    expect(presentCommandFor({ key: 'ArrowRight', target: 'arrows' })).toBeUndefined();
    expect(presentCommandFor({ key: 'ArrowLeft', target: 'arrows' })).toBeUndefined();
    expect(presentCommandFor({ key: 'ArrowRight', target: 'text' })).toBeUndefined();
    expect(presentCommandFor({ key: 'Home', target: 'text' })).toBeUndefined();
  });

  it('Space는 본문에 초점이 있을 때만 다음(단추 위에서는 단추를 누른다), 조합키는 가로채지 않는다', () => {
    expect(presentCommandFor({ key: ' ', target: 'none' })).toBe('next');
    expect(presentCommandFor({ key: ' ', target: 'control' })).toBeUndefined();
    expect(presentCommandFor({ key: 'ArrowRight', target: 'none', altKey: true })).toBeUndefined();
    expect(presentCommandFor({ key: 'ArrowLeft', target: 'none', ctrlKey: true })).toBeUndefined();
    expect(presentCommandFor({ key: 'a', target: 'none' })).toBeUndefined();
  });
});

describe('↓·↑는 본문·단추 위에서 조금씩 스크롤하는 명령이다(R1-074)', () => {
  it('본문·단추·링크에서 ↓·↑는 lineDown·lineUp, 보기(라디오)·코드 상자·입력칸에서는 가로채지 않는다', () => {
    expect(presentCommandFor({ key: 'ArrowDown', target: 'none' })).toBe('lineDown');
    expect(presentCommandFor({ key: 'ArrowUp', target: 'control' })).toBe('lineUp');
    expect(presentCommandFor({ key: 'ArrowDown', target: 'arrows' })).toBeUndefined();
    expect(presentCommandFor({ key: 'ArrowUp', target: 'text' })).toBeUndefined();
    expect(presentCommandFor({ key: 'ArrowDown', target: 'none', ctrlKey: true })).toBeUndefined();
  });
});

describe('넘치는 단계 스크롤(scrollTargetFor·hiddenBelow·hasMoreBelow — R1-073·R1-074)', () => {
  // 막대 윗선 650, 이 단계 내용은 문서 좌표 1500까지(화면 두 배쯤)
  const base = { barTop: 650, contentBottom: 1500, maxScroll: 1100, amount: 500 } as const;

  it('내용이 막대 위에서 끝나면 넘치지 않은 것이다(한 화면에 맞춘 단계는 "더 있음"이 뜨지 않는다)', () => {
    expect(hiddenBelow(646, 0, 650)).toBe(0);
    expect(hasMoreBelow(646, 0, 650)).toBe(false);
    expect(hasMoreBelow(500, 0, 650)).toBe(false);
    expect(hasMoreBelow(1500, 0, 650)).toBe(true);
  });

  it('아래로: 한 번에 amount만큼, 남은 내용이 적으면 그만큼(+여유 12px)만, 끝이면 null(= 다음 단계로 넘긴다)', () => {
    expect(scrollTargetFor({ ...base, direction: 1, scrollY: 0 })).toBe(500);
    expect(scrollTargetFor({ ...base, direction: 1, scrollY: 500 })).toBe(866);
    // 남은 숨은 내용 = 1500 - (866 + 650) + 4 = -12 → 더 내릴 것이 없다
    expect(scrollTargetFor({ ...base, direction: 1, scrollY: 866 })).toBeNull();
    expect(scrollTargetFor({ ...base, direction: 1, scrollY: 1100 })).toBeNull();
  });

  it('한 화면에 들어오는 단계는 아래로 갈 수 없다(null)', () => {
    expect(scrollTargetFor({ ...base, contentBottom: 600, direction: 1, scrollY: 0 })).toBeNull();
  });

  it('쪽을 더 내릴 수 없으면(maxScroll) 거기까지만, 이미 거기면 null', () => {
    expect(scrollTargetFor({ ...base, maxScroll: 300, direction: 1, scrollY: 0 })).toBe(300);
    expect(scrollTargetFor({ ...base, maxScroll: 300, direction: 1, scrollY: 300 })).toBeNull();
  });

  it('위로: 맨 위가 아니면 amount만큼(0 아래로는 안 간다), 맨 위면 null(= 앞 단계로)', () => {
    expect(scrollTargetFor({ ...base, direction: -1, scrollY: 800 })).toBe(300);
    expect(scrollTargetFor({ ...base, direction: -1, scrollY: 200 })).toBe(0);
    expect(scrollTargetFor({ ...base, direction: -1, scrollY: 0 })).toBeNull();
  });
});

describe('너무 잘게 나뉜 단계 합치기 도우미(R1-075)', () => {
  const step = (over: Partial<PresentStep>): PresentStep => ({ section: 1, blocks: [0], label: '핵심 개념', ...over });

  it('isMergeable: 같은 칸의 일반 단계끼리만. 제목 장·퀴즈 문항 단계·다른 칸은 합치지 않는다', () => {
    expect(isMergeable(step({}), step({ blocks: [1] }))).toBe(true);
    expect(isMergeable(step({ section: -1, blocks: [] }), step({ section: -1, blocks: [] }))).toBe(false);
    expect(isMergeable(step({}), step({ section: 2 }))).toBe(false);
    expect(isMergeable(step({ item: 0 }), step({ blocks: [2] }))).toBe(false);
    expect(isMergeable(step({}), step({ item: 1 }))).toBe(false);
  });

  it('unionBlocks: 다시 보이는 제목 블록은 한 번만, 칸 안 차례대로', () => {
    expect(unionBlocks([0, 1, 2], [0, 3, 4])).toEqual([0, 1, 2, 3, 4]);
    expect(unionBlocks([0, 5], [0, 2])).toEqual([0, 2, 5]);
  });

  it('mergedLabel: 뒤 단계가 앞 글에 예제 이름을 더한 꼴이면 그 글, 아니면 앞 글', () => {
    expect(mergedLabel('따라하기', '따라하기 · 예제 1: 손 찾기')).toBe('따라하기 · 예제 1: 손 찾기');
    expect(mergedLabel('핵심 개념 — A', '핵심 개념 — B')).toBe('핵심 개념 — A');
    expect(mergedLabel('핵심 개념', '핵심 개념')).toBe('핵심 개념');
  });
});
