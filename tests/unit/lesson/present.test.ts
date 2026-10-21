// 수업 화면(옛 이름 "발표 모드" — src/components/lesson/present.ts, PLAN §8.5 P5-02, 판 1.6.0 C173) — 단계 나누기와 키 해석(DOM 없이).
// 화면 동작은 tests/e2e/lesson-template.spec.ts.
import { describe, expect, it } from 'vitest';
import {
  FIT_MIN_ZOOM,
  LAST_STEP_NOTE,
  LAST_STEP_NOTE_TOUCH,
  STEP_LABEL_MAX,
  fitZoomFor,
  hasMoreBelow,
  hiddenBelow,
  isGoalTitle,
  isMergeable,
  mergedLabel,
  pixelSlack,
  planPresentationSteps,
  presentCommandFor,
  scrollTargetFor,
  searchWithoutSlideView,
  shortStepLabel,
  slideHash,
  slideLabHref,
  slideNumberFromHash,
  splitTallSteps,
  unionBlocks,
  visibleBottom,
  wantsSlideView,
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

describe('수업 화면 단계 나누기(planPresentationSteps)', () => {
  const steps = planPresentationSteps('1-1-1 인공지능', SECTIONS);

  it('첫 장은 차시 제목과 학습 목표를 함께 보인다(제목만 있는 빈 첫 장을 두지 않는다 — 판 1.6.0, walk-teacher-new A8)', () => {
    expect(steps[0]).toEqual({ section: 0, blocks: [0, 1], label: '1-1-1 인공지능', title: true });
    // 학습 목표가 따로 한 장을 더 쓰지 않는다 — 둘째 장은 다음 칸
    expect(steps[1]).toMatchObject({ section: 1, blocks: [0, 1, 2, 3] });
  });

  it('학습 목표 칸이 맨 앞이 아니거나 길면(블록 다섯 넘음·상자) 예전처럼 제목만의 장 + 칸마다 단계다', () => {
    const noGoal = planPresentationSteps('제목', SECTIONS.slice(1));
    expect(noGoal[0]).toEqual({ section: -1, blocks: [], label: '제목', title: true, intro: true });
    expect(noGoal[1]).toMatchObject({ section: 0, label: '핵심 개념 — 첫 개념' });
    const longGoal: PresentSection = {
      title: '학습 목표',
      blocks: [{ kind: 'h2', title: '학습 목표' }, ...Array.from({ length: 5 }, () => ({ kind: 'content' as const }))],
    };
    expect(planPresentationSteps('제목', [longGoal])[0]).toEqual({ section: -1, blocks: [], label: '제목', title: true, intro: true });
    const boxedGoal: PresentSection = { title: '학습목표', blocks: [{ kind: 'h2', title: '학습목표' }, { kind: 'break', title: '도전' }] };
    expect(planPresentationSteps('제목', [boxedGoal])[0]?.section).toBe(-1);
  });

  it('칸 앞 머리 상자(교과서 쪽 성취 계획)가 있으면 제목 장 바로 다음 한 장이다(walk-a11y-keyboard 12)', () => {
    const withIntro = planPresentationSteps('1-1-1 인공지능', SECTIONS, { introLabel: '성취 계획' });
    expect(withIntro[0]).toMatchObject({ section: 0, title: true });
    expect(withIntro[1]).toEqual({ section: -1, blocks: [], label: '성취 계획', intro: true });
    expect(withIntro).toHaveLength(steps.length + 1);
  });

  it('isGoalTitle: "학습 목표"·"학습목표"(교과서 쪽 붙여 쓴 것)만', () => {
    expect(isGoalTitle('학습 목표')).toBe(true);
    expect(isGoalTitle('학습목표')).toBe(true);
    expect(isGoalTitle(' 학습  목표 ')).toBe(true);
    expect(isGoalTitle('목표')).toBe(false);
    expect(isGoalTitle('핵심 개념')).toBe(false);
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
    // 제목+학습 목표 1 · 핵심 개념 2 · 따라하기 2 · 도전 과제 2 · 퀴즈 3
    expect(steps).toHaveLength(1 + 2 + 2 + 2 + 3);
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

  it('제목 장(학습 목표를 합친 장)은 높이 합으로 나누지 않는다 — 넘치면 화면이 그려 본 뒤 둘로 되돌린다(fitToBar)', () => {
    const goal = SECTIONS[0] as PresentSection;
    const planned = planPresentationSteps('제목', [goal]);
    expect(splitTallSteps(planned, [goal], () => 5000, 600)).toEqual(planned);
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

describe('수업 화면 키(presentCommandFor)', () => {
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
    // 학습 목표를 합친 제목 장(section 0, title)은 같은 칸이어도 합치지 않는다
    expect(isMergeable(step({ section: 0, title: true }), step({ section: 0, blocks: [2] }))).toBe(false);
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

describe('주소 별칭 ?view=slide(판 1.4.0, DECISIONS C133)', () => {
  it('view=slide(별칭 view=present)면 수업 화면으로 바로 열고, 그 밖에는 읽기 화면이 기본이다', () => {
    expect(wantsSlideView('?view=slide')).toBe(true);
    expect(wantsSlideView('?example=a.py&view=slide')).toBe(true);
    expect(wantsSlideView('?view=present')).toBe(true);
    expect(wantsSlideView('')).toBe(false);
    expect(wantsSlideView('?view=read')).toBe(false);
    expect(wantsSlideView('?slide=1')).toBe(false);
  });

  it('searchWithoutSlideView: 수업 화면을 끝낼 때 view=slide·present만 지우고 다른 값은 그대로, 지울 것이 없으면 받은 글 그대로', () => {
    expect(searchWithoutSlideView('?view=slide')).toBe('');
    expect(searchWithoutSlideView('?view=present')).toBe('');
    expect(searchWithoutSlideView('?example=a.py&view=slide')).toBe('?example=a.py');
    expect(searchWithoutSlideView('?view=slide&example=a.py&embed=1')).toBe('?example=a.py&embed=1');
    expect(searchWithoutSlideView('')).toBe('');
    expect(searchWithoutSlideView('?view=read')).toBe('?view=read');
    expect(searchWithoutSlideView('?example=a.py')).toBe('?example=a.py');
  });
});

describe('단계 주소 #slide=N(판 1.6.0 — 뒤로 가기·새로 고침이 그 단계로, walk-teacher-new A3)', () => {
  it('slideNumberFromHash: "#slide=N"(# 없어도)의 N, 0·숫자 아님·다른 #위치는 undefined', () => {
    expect(slideNumberFromHash('#slide=3')).toBe(3);
    expect(slideNumberFromHash('slide=12')).toBe(12);
    expect(slideNumberFromHash('#slide=0')).toBeUndefined();
    expect(slideNumberFromHash('#slide=x')).toBeUndefined();
    expect(slideNumberFromHash('#slide=12345')).toBeUndefined();
    expect(slideNumberFromHash('#toc')).toBeUndefined();
    expect(slideNumberFromHash('')).toBeUndefined();
  });

  it('slideHash: 1부터의 정수 단계 번호를 #slide=N으로(0·소수는 1 이상 정수로)', () => {
    expect(slideHash(3)).toBe('#slide=3');
    expect(slideHash(0)).toBe('#slide=1');
    expect(slideHash(2.7)).toBe('#slide=2');
    expect(slideNumberFromHash(slideHash(17))).toBe(17);
  });

  it('slideLabHref: [실습실에서 크게 열기] 주소에 from=slide·n=단계를 붙이고 다른 값·#위치는 그대로(실습실 쪽 "← 수업 화면으로")', () => {
    expect(slideLabHref('/ai-physical-computing/labs/esp32/?example=esp32%2Fu2%2F2-1-2-lcd.py', 23)).toBe(
      '/ai-physical-computing/labs/esp32/?example=esp32%2Fu2%2F2-1-2-lcd.py&from=slide&n=23',
    );
    expect(slideLabHref('/ai-physical-computing/labs/vision/', 4)).toBe('/ai-physical-computing/labs/vision/?from=slide&n=4');
    // 이미 붙어 있으면 지금 단계로 바꾼다(단계를 넘긴 뒤 다시 누를 때)
    expect(slideLabHref('/labs/esp32/?from=slide&n=2', 5)).toBe('/labs/esp32/?from=slide&n=5');
    expect(slideLabHref('/labs/esp32/?a=1#top', 1)).toBe('/labs/esp32/?a=1&from=slide&n=1#top');
  });
});

describe('막대의 짧은 단계 이름(shortStepLabel — 20글자 안, walk-teacher-new A5·B-40·B-88)', () => {
  it('가장 가까운 이름 하나(예제·과제 › ### 제목 › 칸 제목)만 남긴다', () => {
    expect(shortStepLabel('따라하기 — 코드 읽기 · 예제 2: 숫자 세기')).toBe('예제 2: 숫자 세기');
    expect(shortStepLabel('핵심 개념 — 에이전트')).toBe('에이전트');
    expect(shortStepLabel('학습목표')).toBe('학습목표');
    expect(shortStepLabel('확인 퀴즈 (2/3)')).toBe('확인 퀴즈 (2/3)');
  });

  it('20글자를 넘으면 줄이고(…), "(이어서)"·"(n/m)" 꼬리는 늘 남긴다', () => {
    const short = shortStepLabel('핵심 개념 — 기존 응용 프로그램과 인공지능 응용 프로그램 (이어서)');
    expect(short.endsWith('… (이어서)')).toBe(true);
    expect(Array.from(short.replace(/ \(이어서\)$/u, '')).length).toBeLessThanOrEqual(STEP_LABEL_MAX);
    expect(short.startsWith('기존 응용 프로그램과')).toBe(true);
    expect(shortStepLabel('네 번째 단계 이름이 아주아주 길어서 줄여야 하는 상자 (1/3)', 10)).toMatch(/^.{1,9}… \(1\/3\)$/u);
  });

  it('마지막 단계 안내는 키보드 "Esc로 끝내기", 터치 "[끝내기]" 두 가지다', () => {
    expect(LAST_STEP_NOTE).toBe('마지막 단계예요 · Esc로 끝내기');
    expect(LAST_STEP_NOTE_TOUCH).toBe('마지막 단계예요 · [끝내기]를 눌러요');
  });
});

describe('150% 확대·손가락 확대에서 한 화면 맞추기(판 1.6.0 C177, walk-a11y-keyboard 4)', () => {
  it('fitZoomFor: 들어가면 1, 넘치면 들어가는 비율(0.01 내림), 너무 작으면 FIT_MIN_ZOOM', () => {
    expect(fitZoomFor(500, 600)).toBe(1);
    expect(fitZoomFor(800, 600)).toBe(0.75);
    expect(fitZoomFor(700, 600)).toBe(0.85);
    expect(fitZoomFor(2000, 600)).toBe(FIT_MIN_ZOOM);
    expect(fitZoomFor(0, 600)).toBe(1);
    expect(fitZoomFor(800, 0)).toBe(1);
  });

  it('visibleBottom: 손가락 확대(scale > 1)면 보이는 화면 아래 끝과 막대 위 끝 가운데 작은 쪽, 아니면 막대 위 끝', () => {
    expect(visibleBottom(650, null)).toBe(650);
    expect(visibleBottom(650, { offsetTop: 0, height: 500, scale: 1 })).toBe(650);
    expect(visibleBottom(650, { offsetTop: 0, height: 500, scale: 1.5 })).toBe(500);
    expect(visibleBottom(650, { offsetTop: 200, height: 600, scale: 2 })).toBe(650);
  });

  it('pixelSlack: 기기 화소 두 칸(최소 4px) — 150% 확대(화소비 1.5)에서도 4px, 화소비 3이면 6px', () => {
    expect(pixelSlack(1)).toBe(4);
    expect(pixelSlack(1.5)).toBe(4);
    expect(pixelSlack(3)).toBe(6);
    expect(pixelSlack(undefined)).toBe(4);
    expect(pixelSlack(0)).toBe(4);
  });
});
