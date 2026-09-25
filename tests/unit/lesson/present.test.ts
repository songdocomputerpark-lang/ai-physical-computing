// 발표 모드(src/components/lesson/present.ts, PLAN §8.5 P5-02) — 단계 나누기와 키 해석(DOM 없이). 화면 동작은 tests/e2e/lesson-template.spec.ts.
import { describe, expect, it } from 'vitest';
import { planPresentationSteps, presentCommandFor, type PresentSection } from '../../../src/components/lesson/present.ts';

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
