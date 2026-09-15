/**
 * 확인 퀴즈(SPEC §7.2 7번: 객관식, 정답 즉시 피드백, 서버 없음).
 *
 * - 채점 규칙(gradeQuizAnswer·summarizeQuiz)은 화면과 떨어진 순수 함수라 Vitest로 검사한다(tests/unit/lesson/quiz.test.ts).
 * - enhanceQuizzes는 LessonQuiz.astro가 만든 HTML에 동작을 붙인다. 브라우저에서만 돌고 Playwright로 검사한다.
 *
 * 화면 동작(키보드만으로 모두 된다)
 * - 보기(라디오 단추)는 방향키로 고르고, Tab으로 [답 확인하기]에 가서 Enter·Space로 누른다.
 * - 맞히면 "정답이에요!"와 풀이를, 틀리면 "다시 생각해 보세요."와 고른 답을 알린다(role="status"라 화면 낭독기가 읽는다).
 * - 틀린 뒤에는 [정답과 풀이 보기]가 생긴다. 누르면 정답과 풀이가 펼쳐지고 초점이 그곳으로 간다.
 * - 자바스크립트가 꺼져 있으면 문항마다 "정답과 풀이 보기" 접기 상자가 대신 보인다(LessonQuiz.astro).
 */
export interface QuizItemLike {
  readonly q: string;
  readonly choices: readonly string[];
  /** 정답 보기의 순번(0부터) */
  readonly answer: number;
  readonly explain?: string;
}

export type QuizState = 'correct' | 'wrong' | 'unanswered';

export interface QuizFeedback {
  readonly state: QuizState;
  /** 짧은 알림. 예: 정답이에요! */
  readonly title: string;
  /** 덧붙이는 말(풀이나 고른 답). 없으면 빈 글자 */
  readonly detail: string;
}

const CHOICE_MARKS = ['①', '②', '③', '④', '⑤'] as const;

/** 보기 번호 표시: 0 → ① */
export function choiceMark(index: number): string {
  return CHOICE_MARKS[index] ?? `${index + 1}.`;
}

/** 정답 한 줄. 예: 정답: ② 학습 */
export function answerText(item: Pick<QuizItemLike, 'choices' | 'answer'>): string {
  return `정답: ${choiceMark(item.answer)} ${item.choices[item.answer] ?? ''}`.trim();
}

/** 고른 보기(순번)를 채점한다. 고르지 않았거나 없는 순번이면 unanswered */
export function gradeQuizAnswer(item: QuizItemLike, selected: number | null | undefined): QuizFeedback {
  if (
    selected === null ||
    selected === undefined ||
    !Number.isInteger(selected) ||
    selected < 0 ||
    selected >= item.choices.length
  ) {
    return { state: 'unanswered', title: '보기를 먼저 골라요.', detail: '' };
  }
  if (selected === item.answer) {
    return { state: 'correct', title: '정답이에요!', detail: item.explain ?? '' };
  }
  return {
    state: 'wrong',
    title: '다시 생각해 보세요.',
    detail: `고른 답: ${choiceMark(selected)} ${item.choices[selected] ?? ''}`.trim(),
  };
}

/** 퀴즈 전체 결과 한 줄. 아직 아무 문항도 확인하지 않았으면 빈 글자 */
export function summarizeQuiz(states: readonly QuizState[]): string {
  if (states.every((state) => state === 'unanswered')) {
    return '';
  }
  const correct = states.filter((state) => state === 'correct').length;
  return `${states.length}문항 가운데 ${correct}문항을 맞혔어요.`;
}

/** LessonQuiz.astro가 만든 퀴즈에 동작을 붙인다(여러 번 불러도 한 번만 붙는다). */
export function enhanceQuizzes(root: ParentNode = document): void {
  for (const quiz of Array.from(root.querySelectorAll<HTMLElement>('[data-quiz]'))) {
    if (quiz.dataset.quizReady === 'true') {
      continue;
    }
    quiz.dataset.quizReady = 'true';
    const items = Array.from(quiz.querySelectorAll<HTMLElement>('[data-quiz-item]'));
    const summary = quiz.querySelector<HTMLElement>('[data-quiz-summary]');
    const states: QuizState[] = items.map(() => 'unanswered');
    const updateSummary = () => {
      if (summary) {
        summary.textContent = summarizeQuiz(states);
      }
    };
    items.forEach((element, index) => {
      setupQuizItem(element, (state) => {
        states[index] = state;
        updateSummary();
      });
    });
  }
}

function setupQuizItem(element: HTMLElement, onStateChange: (state: QuizState) => void): void {
  const inputs = Array.from(element.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
  const labels = inputs.map((input) => input.closest<HTMLElement>('label'));
  const checkButton = element.querySelector<HTMLButtonElement>('[data-quiz-check]');
  const revealButton = element.querySelector<HTMLButtonElement>('[data-quiz-reveal]');
  const feedback = element.querySelector<HTMLElement>('[data-quiz-feedback]');
  const explainBox = element.querySelector<HTMLElement>('[data-quiz-explain]');
  const item: QuizItemLike = {
    q: '',
    choices: inputs.map((input) => input.dataset.choiceText ?? ''),
    answer: Number(element.dataset.answer),
    explain: element.querySelector('[data-quiz-explain-text]')?.textContent?.trim() || undefined,
  };
  let revealed = false;

  const markChoices = (selected?: number) => {
    labels.forEach((label, index) => {
      if (!label) {
        return;
      }
      if (revealed && index === item.answer) {
        label.dataset.result = 'correct';
      } else if (index === selected) {
        label.dataset.result = index === item.answer ? 'correct' : 'wrong';
      } else {
        delete label.dataset.result;
      }
    });
  };

  const showFeedback = (result: QuizFeedback | undefined) => {
    if (!feedback) {
      return;
    }
    feedback.replaceChildren();
    if (!result) {
      delete feedback.dataset.state;
      return;
    }
    feedback.dataset.state = result.state;
    const title = document.createElement('p');
    title.className = 'quiz__feedback-title';
    title.textContent = result.title;
    feedback.append(title);
    if (result.detail) {
      const detail = document.createElement('p');
      detail.textContent = result.detail;
      feedback.append(detail);
    }
  };

  const reveal = () => {
    revealed = true;
    if (explainBox) {
      explainBox.hidden = false;
    }
    if (revealButton) {
      revealButton.hidden = true;
    }
    markChoices(inputs.findIndex((input) => input.checked));
  };

  checkButton?.addEventListener('click', () => {
    const selectedIndex = inputs.findIndex((input) => input.checked);
    const result = gradeQuizAnswer(item, selectedIndex < 0 ? null : selectedIndex);
    showFeedback(result);
    onStateChange(result.state);
    markChoices(selectedIndex < 0 ? undefined : selectedIndex);
    if (result.state === 'correct') {
      // 맞히면 풀이는 피드백 칸(role="status")이 보여 주고 읽어 준다. 같은 풀이를 두 번 보이지 않게 풀이 상자는 열지 않는다.
      if (revealButton) {
        revealButton.hidden = true;
      }
      return;
    }
    if (result.state === 'wrong' && revealButton && !revealed) {
      revealButton.hidden = false;
    }
  });

  revealButton?.addEventListener('click', () => {
    reveal();
    explainBox?.focus();
  });

  for (const input of inputs) {
    input.addEventListener('change', () => {
      // 답을 바꾸면 이전 채점 표시를 지우고 다시 확인하게 한다(펼친 정답은 그대로 둔다).
      showFeedback(undefined);
      markChoices();
      onStateChange('unanswered');
    });
  }
}
