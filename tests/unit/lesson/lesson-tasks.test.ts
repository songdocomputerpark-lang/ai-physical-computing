// "이 차시에서 할 일" 카드(src/components/lesson/lesson-tasks.ts, 판 1.6.0 C174)와 교사용 접기 요약 줄(teacher-summary.ts, C175)의 순수 함수.
import { describe, expect, it } from 'vitest';
import type { LessonBodyPlan, LessonBodySection } from '../../../src/components/lesson/lesson-html.ts';
import { TASKS_HEADING, buildLessonTasks } from '../../../src/components/lesson/lesson-tasks.ts';
import { quizAnswerKey, teacherSummaryLinks } from '../../../src/components/lesson/teacher-summary.ts';

function section(key: LessonBodySection['key'], id: string | undefined, title = key ?? ''): LessonBodySection {
  return { key, id, title, generated: false, parts: [] };
}

const FULL_SECTIONS: LessonBodySection[] = [
  section('goals', '학습목표'),
  section('why', '왜-배울까'),
  section('concepts', '핵심-개념'),
  section('follow', '따라-하기'),
  section('try', '바꿔-보기'),
  section('challenge', '도전-과제'),
  section('quiz', '확인-퀴즈'),
  section('teacher', '교사용'),
];

function plan(sections: LessonBodySection[], conceptTopics = 3): Pick<LessonBodyPlan, 'sections' | 'conceptTopics'> {
  return { sections, conceptTopics };
}

describe('이 차시에서 할 일 카드(buildLessonTasks)', () => {
  it('8칸 차시는 읽기·따라 하기·확인 세 칸을 그 칸 제목(#위치)으로 잇고, 글은 차시에서 센 수로 만든다', () => {
    const tasks = buildLessonTasks({ plan: plan(FULL_SECTIONS, 3), exampleCount: 2, quizCount: 3, duration: 50 });
    expect(tasks?.heading).toBe(TASKS_HEADING);
    expect(tasks?.heading).toBe('이 차시에서 할 일');
    expect(tasks?.time).toBe('약 50분');
    expect(tasks?.cards.map((card) => [card.key, card.title, card.detail, card.href])).toEqual([
      ['read', '읽기', '개념 3가지', '#핵심-개념'],
      ['follow', '따라 하기', '예제 2개', '#따라-하기'],
      ['check', '확인', '퀴즈 3문제', '#확인-퀴즈'],
    ]);
  });

  it('소제목이 없으면 "핵심 개념", 예제·퀴즈가 없으면 수 없이 권하는 글이 된다', () => {
    const tasks = buildLessonTasks({ plan: plan(FULL_SECTIONS, 0), exampleCount: 0, quizCount: 0 });
    expect(tasks?.time).toBeUndefined();
    expect(tasks?.cards.map((card) => card.detail)).toEqual(['핵심 개념', '따라 해 봐요', '확인해 봐요']);
  });

  it('소요 시간은 시간·분으로 읽기 쉽게 적는다(formatDuration)', () => {
    expect(buildLessonTasks({ plan: plan(FULL_SECTIONS), exampleCount: 1, quizCount: 3, duration: 45 })?.time).toBe('약 45분');
  });

  it('없는 칸의 카드는 빼고, 카드가 둘 미만이면 상자를 만들지 않는다', () => {
    const noQuiz = FULL_SECTIONS.filter((candidate) => candidate.key !== 'quiz');
    expect(buildLessonTasks({ plan: plan(noQuiz), exampleCount: 1, quizCount: 0 })?.cards.map((card) => card.key)).toEqual(['read', 'follow']);
    // 제목에 id가 없는 칸은 링크를 만들 수 없다.
    expect(buildLessonTasks({ plan: plan([section('concepts', undefined), section('quiz', '확인-퀴즈')]), exampleCount: 0, quizCount: 3 })).toBeUndefined();
    // 읽기 자료·대단원 마무리(8칸 틀이 아닌 차시)
    expect(buildLessonTasks({ plan: plan([section(undefined, 'x', '읽기')]), exampleCount: 0, quizCount: 0 })).toBeUndefined();
    expect(buildLessonTasks({ plan: plan([]), exampleCount: 0, quizCount: 0 })).toBeUndefined();
  });
});

describe('교사용 접기 요약 줄(teacher-summary)', () => {
  it('접기 안 ### 제목에서 평가 포인트·채점 기준·지도 요약·자주 막히는 곳 바로 가기를 고른다 — 있는 것만, 정해진 차례로', () => {
    const links = teacherSummaryLinks([
      { id: 'g1', title: '지도안 요약(50분, 사이트가 제안하는 흐름)' },
      { id: 'g2', title: '평가 포인트' },
      { id: 'g3', title: '채점 기준' },
      { id: 'g4', title: '자주 막히는 곳' },
      { id: 'g5', title: '원고에서 바꾼 곳' },
    ]);
    expect(links).toEqual([
      { label: '평가 포인트', href: '#g2' },
      { label: '채점 기준', href: '#g3' },
      { label: '지도 요약', href: '#g1' },
      { label: '자주 막히는 곳', href: '#g4' },
    ]);
    expect(teacherSummaryLinks([{ id: 'a', title: '평가 포인트' }])).toEqual([{ label: '평가 포인트', href: '#a' }]);
    expect(teacherSummaryLinks([])).toEqual([]);
    // 띄어쓰기가 달라도 알아본다.
    expect(teacherSummaryLinks([{ id: 'x', title: '평가포인트' }])).toEqual([{ label: '평가 포인트', href: '#x' }]);
  });

  it('퀴즈 정답표는 문항 번호·정답 기호·정답 보기 글이다(학생 화면의 "정답: ② 학습"과 같은 기호)', () => {
    const key = quizAnswerKey([
      { choices: ['인식', '학습', '추론'], answer: 1 },
      { choices: ['가', '나', '다', '라'], answer: 3 },
    ]);
    expect(key).toEqual([
      { number: 1, mark: '②', text: '학습' },
      { number: 2, mark: '④', text: '라' },
    ]);
    expect(quizAnswerKey([])).toEqual([]);
  });
});
