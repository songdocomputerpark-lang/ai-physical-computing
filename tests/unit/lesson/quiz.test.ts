import { describe, expect, it } from 'vitest';
import {
  answerText,
  choiceMark,
  gradeQuizAnswer,
  summarizeQuiz,
  type QuizItemLike,
} from '../../../src/components/lesson/quiz.ts';

const item: QuizItemLike = {
  q: '데이터에서 패턴을 익히는 능력은?',
  choices: ['인식', '학습', '추론'],
  answer: 1,
  explain: '학습은 데이터에서 패턴을 익히는 능력이에요.',
};

describe('확인 퀴즈 채점(src/components/lesson/quiz.ts)', () => {
  it('정답을 고르면 correct와 풀이를 돌려준다', () => {
    expect(gradeQuizAnswer(item, 1)).toEqual({
      state: 'correct',
      title: '정답이에요!',
      detail: '학습은 데이터에서 패턴을 익히는 능력이에요.',
    });
  });

  it('풀이가 없는 문항은 정답이어도 덧붙이는 말이 비어 있다', () => {
    const { explain: _explain, ...withoutExplain } = item;
    expect(gradeQuizAnswer(withoutExplain, 1)).toEqual({ state: 'correct', title: '정답이에요!', detail: '' });
  });

  it('오답이면 wrong과 고른 답만 알리고 정답은 먼저 알려 주지 않는다', () => {
    const result = gradeQuizAnswer(item, 2);
    expect(result).toEqual({ state: 'wrong', title: '다시 생각해 보세요.', detail: '고른 답: ③ 추론' });
    expect(result.detail).not.toContain('학습');
  });

  it('고르지 않았거나 없는 보기 순번이면 unanswered', () => {
    for (const selected of [null, undefined, -1, 3, 1.5, Number.NaN]) {
      expect(gradeQuizAnswer(item, selected).state, String(selected)).toBe('unanswered');
    }
    expect(gradeQuizAnswer(item, null).title).toBe('보기를 먼저 골라요.');
  });

  it('보기 번호는 동그라미 숫자이고, 정답 한 줄에 번호와 보기를 함께 적는다', () => {
    expect(choiceMark(0)).toBe('①');
    expect(choiceMark(4)).toBe('⑤');
    expect(choiceMark(5)).toBe('6.');
    expect(answerText(item)).toBe('정답: ② 학습');
  });

  it('퀴즈 전체 결과는 확인한 문항이 있을 때만 한 줄로 알린다', () => {
    expect(summarizeQuiz(['unanswered', 'unanswered', 'unanswered'])).toBe('');
    expect(summarizeQuiz(['correct', 'wrong', 'unanswered'])).toBe('3문항 가운데 1문항을 맞혔어요.');
    expect(summarizeQuiz(['correct', 'correct', 'correct'])).toBe('3문항 가운데 3문항을 맞혔어요.');
  });
});
