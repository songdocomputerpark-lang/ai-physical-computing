/**
 * 학습 진도 화면 칠하기(판 1.3.0 — 설계서 3절). 저장된 진도(src/lib/progress.ts)를 읽어 쪽 안의 표시를 채운다.
 * 진도는 HTML에 굽지 않고 브라우저에서만 그린다(서비스 워커·오프라인판에서 캐시된 쪽도 같게 보이게).
 *
 * 마크업 약속(어느 구역이든 이 속성만 달면 된다)
 *   차시 하나    <li data-progress-lesson="u1/1-1-1"> … <span data-progress-badge></span> </li>
 *                → 이 요소에 data-progress-state="done|seen|none", 안의 [data-progress-badge]에 글("다 했어요"/"열어 봤어요"/빈칸)
 *   단원 하나    <div data-progress-unit="u1/1-1-1,u1/1-1-2,…"> <p data-progress-count></p> <progress data-progress-bar></progress> </div>
 *                차시 id 목록은 data-progress-unit 값 또는 data-progress-ids(쉼표로 이음). 둘 다 목록이 아니면 안에 든 [data-progress-lesson]을 센다.
 *                → [data-progress-count]에 "18차시 중 3차시를 다 했어요", [data-progress-bar]에 값(<progress>는 value·max, 그 밖은 role=img+aria-label과 CSS 변수)
 *                → 단원에 본·끝낸 차시가 하나도 없으면 data-progress-empty를 붙이고 글은 비운다(CSS가 숨긴다 — "0개"를 처음 온 사람에게 크게 보이지 않게)
 *   준비 끝      칠한 단원에는 data-progress-ready가 붙는다.
 *   <html>       진도가 하나라도 있으면 data-progress-has를 붙인다(이어서 하기 띠 같은 것을 CSS로 보일 때).
 *
 * 쓰는 법
 *   installProgressPaint();                  // 쪽을 열 때 한 번. DOMContentLoaded·진도 바뀜·기록 지움·다른 탭 저장에 다시 칠한다.
 *   const stop = watchProgress((state) => …); // 진도가 바뀔 때마다 부르는 함수를 등록(처음 한 번도 부른다). 이어서 하기 띠 등에 쓴다.
 *
 * 작게 유지한다: 실습실 라이브러리를 import하지 않는다(records.ts는 이벤트 이름 상수와 storage.ts만 가져온다).
 */
import { RECORDS_CLEARED_EVENT } from '../../lab/controls/records.ts';
import { storageKey } from '../../lib/storage.ts';
import {
  PROGRESS_CHANGED_EVENT,
  PROGRESS_STORAGE_NAME,
  hasProgress,
  isLessonId,
  lessonStatus,
  readProgress,
  sanitizeProgress,
  unitSummary,
  type ProgressState,
} from '../../lib/progress.ts';

/**
 * 차시 하나의 표시 글. 낱말을 둘로만 쓴다: 끝까지 한 것은 "다 했어요", 열어만 본 것은 "열어 봤어요".
 * 처음에는 상태 글을 "마쳤어요"로 달리 썼으나(R1-067), 단추 [이 차시 다 했어요]·안내 "다 했다고 표시했어요"·개인정보 안내와
 * 쪽마다 말이 달라 헷갈렸다(R2-021) → 전 쪽이 "다 했어요"와 "열어 봤어요" 두 낱말만 쓴다.
 */
export const PROGRESS_BADGE_TEXT = { done: '다 했어요', seen: '열어 봤어요', none: '' } as const;

/**
 * 단원 진도 글: 다 한 차시가 있으면 "18차시 중 3차시를 다 했어요", 열어 본 것만 있으면 "18차시 중 3차시를 열어 봤어요",
 * 아무것도 없으면 빈 글. (열어 본 것과 다 한 것은 낱말도 다르고 막대에서도 연한 칸·진한 칸으로 다르다.)
 */
export function describeUnitProgress(summary: { total: number; seen: number; done: number }): string {
  if (summary.total <= 0) {
    return '';
  }
  if (summary.done > 0) {
    return `${summary.total}차시 중 ${summary.done}차시를 다 했어요`;
  }
  if (summary.seen > 0) {
    return `${summary.total}차시 중 ${summary.seen}차시를 열어 봤어요`;
  }
  return '';
}

/** 쉼표·공백으로 이은 글에서 모양이 맞는 차시 id만 뽑는다 */
export function parseLessonIds(text: string | null | undefined): string[] {
  if (!text) {
    return [];
  }
  return text
    .split(/[\s,]+/u)
    .map((part) => part.trim())
    .filter(isLessonId);
}

function setText(element: Element, text: string): void {
  // 같은 글이면 건드리지 않는다(화면 낭독기가 불필요하게 다시 읽지 않게).
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

function paintLesson(element: HTMLElement, state: ProgressState): void {
  const id = element.getAttribute('data-progress-lesson') ?? '';
  const status = isLessonId(id) ? lessonStatus(state, id) : 'none';
  element.setAttribute('data-progress-state', status);
  for (const badge of element.querySelectorAll('[data-progress-badge]')) {
    setText(badge, PROGRESS_BADGE_TEXT[status]);
  }
}

function unitIds(element: HTMLElement): string[] {
  const own = parseLessonIds(element.getAttribute('data-progress-ids') ?? element.getAttribute('data-progress-unit'));
  if (own.length > 0) {
    return own;
  }
  const inner: string[] = [];
  for (const lesson of element.querySelectorAll('[data-progress-lesson]')) {
    const id = lesson.getAttribute('data-progress-lesson') ?? '';
    if (isLessonId(id) && !inner.includes(id)) {
      inner.push(id);
    }
  }
  return inner;
}

function paintBar(bar: HTMLElement, summary: { total: number; seen: number; done: number }, label: string, prefix: string): void {
  const percent = (count: number): string => `${summary.total > 0 ? Math.round((count / summary.total) * 100) : 0}%`;
  bar.style.setProperty('--progress-done', percent(summary.done));
  bar.style.setProperty('--progress-seen', percent(summary.seen));
  if (bar.tagName === 'PROGRESS') {
    const progress = bar as HTMLProgressElement;
    progress.max = Math.max(1, summary.total);
    progress.value = summary.done;
  } else {
    bar.setAttribute('role', 'img');
  }
  if (label === '') {
    bar.removeAttribute('aria-label');
  } else {
    bar.setAttribute('aria-label', prefix === '' ? label : `${prefix} ${label}`);
  }
}

function paintUnit(element: HTMLElement, state: ProgressState): void {
  const ids = unitIds(element);
  const summary = unitSummary(state, ids);
  const text = describeUnitProgress(summary);
  const empty = summary.seen === 0 && summary.done === 0;
  const prefix = element.getAttribute('data-progress-label') ?? '';
  if (empty) {
    element.setAttribute('data-progress-empty', '');
  } else {
    element.removeAttribute('data-progress-empty');
  }
  for (const count of element.querySelectorAll('[data-progress-count]')) {
    setText(count, text);
  }
  for (const bar of element.querySelectorAll<HTMLElement>('[data-progress-bar]')) {
    paintBar(bar, summary, text, prefix);
  }
  element.setAttribute('data-progress-ready', '');
}

/**
 * root 안의 진도 표시를 모두 칠한다. state를 주지 않으면 저장소에서 읽는다(막힌 브라우저에서는 빈 진도).
 * 여러 번 불러도 같은 결과다.
 */
export function paintProgress(root: ParentNode = document, state: ProgressState = readProgress()): void {
  for (const lesson of root.querySelectorAll<HTMLElement>('[data-progress-lesson]')) {
    paintLesson(lesson, state);
  }
  for (const unit of root.querySelectorAll<HTMLElement>('[data-progress-unit], [data-progress-ids]')) {
    paintUnit(unit, state);
  }
  const html = typeof document === 'undefined' ? null : document.documentElement;
  if (html && root === document) {
    if (hasProgress(state)) {
      html.setAttribute('data-progress-has', '');
    } else {
      html.removeAttribute('data-progress-has');
    }
  }
}

/**
 * 진도가 바뀔 때마다 callback(state)을 부른다. 등록하자마자(문서가 준비되면) 한 번 부르고,
 * 같은 탭의 진도 바뀜(apc:progress-changed)·기록 지움(apc:records-cleared)·다른 탭의 저장(storage)에 다시 부른다.
 * 돌려주는 함수를 부르면 듣기를 멈춘다.
 */
export function watchProgress(callback: (state: ProgressState) => void): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }
  let stopped = false;
  const run = (state?: ProgressState): void => {
    if (!stopped) {
      callback(state ?? readProgress());
    }
  };
  const onChanged = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    // 이벤트가 새 값을 실어 오면 그대로 쓴다(저장이 막힌 브라우저에서도 이 쪽을 보는 동안은 반영된다).
    run(detail === undefined || detail === null ? undefined : sanitizeProgress(detail));
  };
  const onCleared = (): void => run();
  let key: string | null = null;
  try {
    key = storageKey(PROGRESS_STORAGE_NAME);
  } catch {
    key = null;
  }
  const onStorage = (event: StorageEvent): void => {
    // key가 null이면 다른 탭에서 저장 공간을 통째로 비운 것이다.
    if (event.key === null || event.key === key) {
      run();
    }
  };
  const onReady = (): void => run();
  document.addEventListener(PROGRESS_CHANGED_EVENT, onChanged);
  document.addEventListener(RECORDS_CLEARED_EVENT, onCleared);
  window.addEventListener('storage', onStorage);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady, { once: true });
  } else {
    run();
  }
  return () => {
    stopped = true;
    document.removeEventListener(PROGRESS_CHANGED_EVENT, onChanged);
    document.removeEventListener(RECORDS_CLEARED_EVENT, onCleared);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('DOMContentLoaded', onReady);
  };
}

let installedStop: (() => void) | null = null;

/** 쪽을 열 때 한 번 부른다(여러 번 불러도 듣기는 한 번만). 돌려주는 함수로 멈출 수 있다. */
export function installProgressPaint(): () => void {
  if (installedStop === null) {
    const stop = watchProgress((state) => paintProgress(document, state));
    installedStop = () => {
      stop();
      installedStop = null;
    };
  }
  return installedStop;
}
