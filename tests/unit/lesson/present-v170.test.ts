// 수업 화면 판 1.7.0(PROGRESS 미해결 259·260·271 — 다시 걷기 walk-a11y-keyboard N1~N4·walk-teacher-new A2) — 새 순수 함수(DOM 없이).
// 단계 목록(절 이름으로 건너뛰기)·막대 글 줄이기·거의 빈 뒤 단계 붙이기·안쪽 조각 단계는 합치지 않음. 화면 동작은 tests/e2e/lesson-template.spec.ts·book.spec.ts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONTINUED_LABEL,
  FIT_MIN_ZOOM,
  LATE_FIT_MIN_ZOOM,
  MORE_KEY_HINTS,
  SHORT_TAIL_RATIO,
  STATUS_LABEL_LENGTHS,
  TAIL_MIN_ZOOM,
  STEP_LABEL_MAX,
  continuedLabel,
  currentListEntry,
  isMergeable,
  isTailMergeable,
  planPresentationSteps,
  statusText,
  stepListEntries,
  tailMergeZoom,
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
      { kind: 'h3', title: '둘째 개념' },
      { kind: 'content' },
    ],
  },
  { title: '확인 퀴즈', blocks: [{ kind: 'h2', title: '확인 퀴즈' }, { kind: 'split', items: 3 }] },
];

describe('단계 목록(미해결 271 — 절 이름으로 건너뛰기)', () => {
  it('제목 장(학습 목표를 합친 장)과 칸마다 그 칸의 첫 단계 하나 — 소제목·퀴즈 문항 단계는 따로 나오지 않는다', () => {
    const steps = planPresentationSteps('1-1-1 인공지능 응용 프로그램과 에이전트', SECTIONS);
    const entries = stepListEntries(
      steps,
      SECTIONS.map((section) => section.title),
    );
    expect(entries.map((entry) => entry.label)).toEqual(['1-1-1 인공지능 응용 프로그램과 에이전트', '핵심 개념', '확인 퀴즈']);
    // 단계 번호는 1부터 — 핵심 개념은 둘째 단계, 확인 퀴즈는 핵심 개념 두 단계 뒤
    expect(entries.map((entry) => entry.step)).toEqual([1, 2, 4]);
    expect(steps).toHaveLength(6);
  });

  it('학습 목표가 제목 장에 합쳐지지 않으면(머리 상자가 있는 교과서 쪽) 제목 장·머리 상자 장·학습 목표 칸이 따로 나온다', () => {
    const steps: PresentStep[] = [
      { section: -1, blocks: [], label: '2-1-2 LCD 제어하기', title: true },
      { section: -1, blocks: [], label: '성취 계획', intro: true },
      { section: 0, blocks: [0, 1], label: '학습목표' },
      { section: 1, blocks: [0, 1, 2], label: '핵심 개념 — 첫 개념' },
      { section: 1, blocks: [0, 1, 2], label: '핵심 개념 — 첫 개념 (이어서)' },
    ];
    const entries = stepListEntries(steps, ['학습 목표', '']);
    expect(entries).toEqual([
      { step: 1, label: '2-1-2 LCD 제어하기' },
      { step: 2, label: '성취 계획' },
      { step: 3, label: '학습 목표' },
      // 칸 제목이 비면 그 단계의 막대 이름(가장 가까운 이름)
      { step: 4, label: '첫 개념' },
    ]);
  });

  it('예제·도전 과제 단계는 그 이름이 처음 나오는 단계를 칸 아래 줄(sub)로 — "(이어서)"·퀴즈 단계는 빼고 같은 이름은 한 번(교사 다시 걷기 m2)', () => {
    const steps: PresentStep[] = [
      { section: 0, blocks: [0, 1], label: '2-1-2 LCD 제어하기', title: true },
      { section: 1, blocks: [0, 1], label: '4 동작 테스트' },
      { section: 1, blocks: [0, 2], label: '4 동작 테스트 · 예제 1: 출력 테스트: LCD에 글자 쓰기(교과서 127쪽)' },
      { section: 1, blocks: [0, 2], label: '4 동작 테스트 · 예제 1: 출력 테스트: LCD에 글자 쓰기(교과서 127쪽) (이어서)' },
      { section: 1, blocks: [0, 3], label: '4 동작 테스트 · 예제 2: 기본 실습 1: 0부터 5까지 세기' },
      { section: 2, blocks: [0, 1], label: '도전 과제 · 도전 과제 1: 우리 주변 인공지능' },
      { section: 3, blocks: [0, 1], item: 0, label: '확인 퀴즈 (1/3)' },
    ];
    expect(stepListEntries(steps, ['학습 목표', '4 동작 테스트', '도전 과제', '확인 퀴즈'])).toEqual([
      { step: 1, label: '2-1-2 LCD 제어하기' },
      { step: 2, label: '4 동작 테스트' },
      { step: 3, label: '예제 1: 출력 테스트: LCD에 글자 쓰기(교과서 127쪽)', sub: true },
      { step: 5, label: '예제 2: 기본 실습 1: 0부터 5까지 세기', sub: true },
      // 칸의 첫 단계가 곧 도전 과제면 칸 줄과 아래 줄이 같은 단계를 가리킨다
      { step: 6, label: '도전 과제' },
      { step: 6, label: '도전 과제 1: 우리 주변 인공지능', sub: true },
      { step: 7, label: '확인 퀴즈' },
    ]);
    // 지금 단계가 예제 단계면 그 아래 줄이 지금 항목
    const entries = stepListEntries(steps, ['학습 목표', '4 동작 테스트', '도전 과제', '확인 퀴즈']);
    expect(entries[currentListEntry(entries, 4)]?.label).toMatch(/^예제 1/u);
  });

  it('지금 단계가 든 항목: 그 단계보다 앞에서 시작하는 마지막 항목, 목록이 비면 -1', () => {
    const entries = [
      { step: 1, label: '제목' },
      { step: 2, label: '핵심 개념' },
      { step: 5, label: '확인 퀴즈' },
    ];
    expect(currentListEntry(entries, 1)).toBe(0);
    expect(currentListEntry(entries, 4)).toBe(1);
    expect(currentListEntry(entries, 5)).toBe(2);
    expect(currentListEntry(entries, 9)).toBe(2);
    expect(currentListEntry([], 3)).toBe(-1);
  });
});

describe('막대 글(walk-a11y-keyboard 11 — 150%에서 "(이어서)"가 말줄임표에 잘림)', () => {
  it('줄일 글자 수는 20부터 차례로 작아지고, 첫 값은 예전 막대 글 길이와 같다', () => {
    expect(STATUS_LABEL_LENGTHS[0]).toBe(STEP_LABEL_MAX);
    expect([...STATUS_LABEL_LENGTHS].sort((a, b) => b - a)).toEqual([...STATUS_LABEL_LENGTHS]);
    expect(Math.min(...STATUS_LABEL_LENGTHS)).toBeGreaterThanOrEqual(6);
  });

  it('statusText: "n / 전체 · 이름" — 이름은 max글자 안, 꼬리 "(이어서)"·"(1/3)"는 남는다', () => {
    expect(statusText(4, 20, '1 인공지능의 정의 및 특징 (이어서)')).toBe('4 / 20 · 1 인공지능의 정의 및 특징 (이어서)');
    expect(statusText(4, 20, '1 인공지능의 정의 및 특징 (이어서)', 8)).toBe('4 / 20 · 1 인공지능의… (이어서)');
    expect(statusText(26, 27, '확인 퀴즈 (2/3)', 8)).toBe('26 / 27 · 확인 퀴즈 (2/3)');
  });

  it('"아래에 더 있어요" 키 안내: 첫 값은 막대 마크업 글과 같고, 차례로 짧아져 마지막은 안내 없음(키보드 다시 걷기 N4 — 150%에서 "· Sp…"로 잘림)', () => {
    const markup = readFileSync('src/components/lesson/LessonPresent.astro', 'utf8');
    expect(markup).toContain(`<span class="lesson-present__more-keys">${MORE_KEY_HINTS[0]}</span>`);
    const lengths = MORE_KEY_HINTS.map((hint) => hint.length);
    expect([...lengths].sort((a, b) => b - a)).toEqual(lengths);
    expect(MORE_KEY_HINTS[MORE_KEY_HINTS.length - 1]).toBe('');
    // 키 이름은 기호가 아니라 글(C — 화살표 기호 금지)
    expect(MORE_KEY_HINTS.join(' ')).not.toMatch(/[→←↓↑]/u);
  });

  it('continuedLabel: "(이어서)"는 한 번만 붙는다', () => {
    expect(continuedLabel('도전 과제 · 도전 과제 2')).toBe(`도전 과제 · 도전 과제 2 ${CONTINUED_LABEL}`);
    expect(continuedLabel(`도전 과제 · 도전 과제 2 ${CONTINUED_LABEL}`)).toBe(`도전 과제 · 도전 과제 2 ${CONTINUED_LABEL}`);
  });
});

describe('한 화면 맞추기(미해결 260 — 150% 확대에서 넘치는 단계 0)', () => {
  it('블록 안쪽 조각으로 나눈 단계(part)는 이웃 단계와 합치지 않는다', () => {
    const first: PresentStep = { section: 1, blocks: [0, 2], label: '도전 과제', part: { block: 2, from: 0, to: 1 } };
    const second: PresentStep = { section: 1, blocks: [0, 2], label: '도전 과제 (이어서)', part: { block: 2, from: 2, to: 3 } };
    const plain: PresentStep = { section: 1, blocks: [0, 3], label: '도전 과제' };
    expect(isMergeable(first, second)).toBe(false);
    expect(isMergeable(plain, second)).toBe(false);
    expect(isMergeable(first, plain)).toBe(false);
    expect(isMergeable(plain, { ...plain, blocks: [0, 4] })).toBe(true);
  });

  it('isTailMergeable: 거의 빈 뒤 단계는 안쪽 조각 단계(표의 마지막 줄 묶음) 뒤에도 붙일 수 있고, 뒤 단계 자신이 조각이면 안 된다(통합 시험)', () => {
    const lastRows: PresentStep = { section: 1, blocks: [0, 5], label: '1 인공지능의 정의 (이어서)', part: { block: 5, from: 1, to: 1 }, fit: { block: 5, zoom: 0.86 } };
    const caption: PresentStep = { section: 1, blocks: [0, 6, 7], label: '1 인공지능의 정의 (이어서)' };
    expect(isTailMergeable(lastRows, caption)).toBe(true);
    expect(isMergeable(lastRows, caption)).toBe(false);
    expect(isTailMergeable(caption, lastRows)).toBe(false);
    expect(isTailMergeable(lastRows, { ...caption, section: 2 })).toBe(false);
    expect(isTailMergeable({ ...lastRows, title: true }, caption)).toBe(false);
    expect(isTailMergeable(lastRows, { ...caption, item: 0 })).toBe(false);
  });

  it('tailMergeZoom: 거의 빈 뒤 단계를 붙여 넘친 만큼, 앞 블록을 (1 − 넘침/높이)배로 — 0.72배보다 더 줄여야 하면 붙이지 않는다', () => {
    // 표 높이 440px, 그림 설명 한 줄을 붙여 40px 넘침 → 0.9배
    expect(tailMergeZoom(440, 40)).toBe(0.9);
    // 넘치지 않으면 줄이지 않는다
    expect(tailMergeZoom(440, 0)).toBe(1);
    expect(tailMergeZoom(440, -12)).toBe(1);
    // 넘침이 높이의 28%를 넘으면 붙이지 않는다
    expect(tailMergeZoom(400, 150)).toBeNull();
    expect(tailMergeZoom(0, 20)).toBeNull();
    // 0.01 단위로 내림(줄인 뒤에 확실히 들어가게)
    expect(tailMergeZoom(300, 31)).toBe(0.89);
    expect(tailMergeZoom(400, 100, FIT_MIN_ZOOM)).toBe(0.75);
  });

  it('거의 빈 단계 비율·그린 뒤 줄이기 하한: 그림 설명 한 줄(쓸 높이의 20% 안)만 붙이고, 그린 뒤 줄이기는 0.85배까지(블록 맞추기 0.72보다 덜 줄인다)', () => {
    expect(SHORT_TAIL_RATIO).toBeGreaterThan(0);
    expect(SHORT_TAIL_RATIO).toBeLessThanOrEqual(0.25);
    expect(LATE_FIT_MIN_ZOOM).toBeGreaterThan(FIT_MIN_ZOOM);
    expect(LATE_FIT_MIN_ZOOM).toBeLessThan(1);
    // 그림 설명을 표에 붙일 때만 조금 더 줄인다(0.66 — 통합 시험)
    expect(TAIL_MIN_ZOOM).toBeLessThan(FIT_MIN_ZOOM);
    expect(TAIL_MIN_ZOOM).toBeGreaterThanOrEqual(0.6);
    expect(tailMergeZoom(341, 102, TAIL_MIN_ZOOM)).toBe(0.7);
  });
});
