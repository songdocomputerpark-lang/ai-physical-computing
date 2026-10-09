/**
 * 차시 쪽의 학습 진도와 단원 차시 목록(판 1.3.0).
 *
 * - 차시를 열면 markSeen(봤어요) — 저장하는 것은 차시 번호·제목·주소·시각뿐이다(src/lib/progress.ts).
 * - [이 차시 다 했어요] 토글: aria-pressed. 누르면 setDone. 확인 퀴즈를 모두 맞히면(quiz.ts의 apc:quiz-complete) 저절로 "다 했어요".
 * - 단원 차시 목록(LessonSidebar): 넓은 화면(64rem 이상)에서는 펼쳐 두고 옆에 붙이며, 좁은 화면에서는 <details> 그대로 둔다.
 *   펼친 목록은 지금 차시가 보이게 목록 안에서만 스크롤한다(쪽은 움직이지 않는다).
 *
 * 진도를 칠하는 일(막대·배지)은 progress-paint.ts의 installProgressPaint가 맡는다.
 */
import { markSeen, readProgress, setDone, type ProgressState } from '../../lib/progress.ts';
import { installProgressPaint, watchProgress } from '../progress/progress-paint.ts';
import { QUIZ_COMPLETE_EVENT } from './quiz.ts';

/** 단원 차시 목록을 옆에 붙여 보이는 화면 너비(rem) — LessonSidebar.astro·lesson-layout CSS와 같은 값 */
export const WIDE_QUERY = '(min-width: 64rem)';

export const DONE_STATUS_TEXT = {
  done: '다 했다고 표시했어요. 이 컴퓨터에만 저장돼요.',
  undone: '표시를 지웠어요.',
  quiz: '퀴즈를 모두 맞혀서 다 했다고 표시했어요.',
} as const;

function setPressed(button: HTMLButtonElement, pressed: boolean): void {
  button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  button.closest<HTMLElement>('[data-lesson-done]')?.setAttribute('data-done', pressed ? 'true' : 'false');
}

/** 차시 쪽 진도: 열면 봤어요, 토글, 퀴즈 다 맞히면 다 했어요 */
export function installLessonProgress(doc: Document = document): () => void {
  const box = doc.querySelector<HTMLElement>('[data-lesson-done]');
  if (!box) {
    return () => {};
  }
  const id = box.getAttribute('data-lesson-id') ?? '';
  const href = box.getAttribute('data-lesson-href') ?? '';
  const label = box.getAttribute('data-lesson-label') ?? '';
  const title = box.getAttribute('data-lesson-title') ?? '';
  const button = box.querySelector<HTMLButtonElement>('[data-lesson-done-button]');
  const status = box.querySelector<HTMLElement>('[data-lesson-done-status]');
  const announce = (text: string): void => {
    if (status) {
      status.textContent = text;
    }
  };

  // 칠하기가 먼저 듣고 있어야 markSeen이 보내는 사건으로 목록의 "봤어요"가 바로 바뀐다.
  installProgressPaint();
  markSeen({ id, href, label, title });

  const stopWatch = watchProgress((state: ProgressState) => {
    if (button) {
      setPressed(button, state.done.includes(id));
    }
  });

  const onClick = (): void => {
    if (!button) {
      return;
    }
    const next = button.getAttribute('aria-pressed') !== 'true';
    setDone(id, next);
    setPressed(button, next);
    announce(next ? DONE_STATUS_TEXT.done : DONE_STATUS_TEXT.undone);
  };
  button?.addEventListener('click', onClick);

  const onQuizComplete = (): void => {
    if (readProgress().done.includes(id)) {
      return;
    }
    setDone(id, true);
    if (button) {
      setPressed(button, true);
    }
    announce(DONE_STATUS_TEXT.quiz);
  };
  doc.addEventListener(QUIZ_COMPLETE_EVENT, onQuizComplete);

  return () => {
    stopWatch();
    button?.removeEventListener('click', onClick);
    doc.removeEventListener(QUIZ_COMPLETE_EVENT, onQuizComplete);
  };
}

/** 목록 안에서만 스크롤해 지금 차시가 보이게 한다(쪽 스크롤은 건드리지 않는다) */
export function revealCurrentInNav(nav: HTMLElement): void {
  const current = nav.querySelector<HTMLElement>('[aria-current="page"]');
  if (!current) {
    return;
  }
  const navBox = nav.getBoundingClientRect();
  const currentBox = current.getBoundingClientRect();
  const offset = currentBox.top - navBox.top - (nav.clientHeight - currentBox.height) / 2;
  if (Math.abs(offset) > 1) {
    nav.scrollTop = Math.max(0, nav.scrollTop + offset);
  }
}

/** 단원 차시 목록: 넓은 화면에서는 펼치고(요약 줄은 CSS가 숨김), 좁은 화면에서는 접는다 */
export function installLessonNav(doc: Document = document): () => void {
  const details = doc.querySelector<HTMLDetailsElement>('[data-lesson-nav]');
  const win = doc.defaultView;
  if (!details || !win || typeof win.matchMedia !== 'function') {
    return () => {};
  }
  const query = win.matchMedia(WIDE_QUERY);
  const scroller = details.querySelector<HTMLElement>('[data-lesson-nav-scroll]');
  const apply = (): void => {
    if (query.matches) {
      details.setAttribute('data-wide', '');
      details.open = true;
      if (scroller) {
        revealCurrentInNav(scroller);
      }
    } else {
      // 넓은 화면에서 좁은 화면으로 바뀔 때만 접는다(좁은 화면에서 사용자가 연 것을 되감지 않는다).
      if (details.hasAttribute('data-wide')) {
        details.open = false;
      }
      details.removeAttribute('data-wide');
    }
  };
  apply();
  query.addEventListener('change', apply);
  return () => query.removeEventListener('change', apply);
}
