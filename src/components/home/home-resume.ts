/**
 * 홈의 진도 부분(판 1.3.0): "이어서 하기" 띠와 배움 지도 카드의 단추를 저장된 진도로 바꾼다.
 * 진도는 HTML에 굽지 않고 브라우저에서만 그린다(서비스 워커·오프라인판에서 캐시된 홈도 같게 보이게).
 *
 * 마크업 약속(HomeResume.astro · HomeMap.astro)
 *   [data-home-resume][hidden]            띠 전체. 진도가 있을 때만 hidden을 뗀다(처음 온 사람에게는 아무것도 안 보인다)
 *     [data-resume-lesson][hidden]        지난번에 본 차시 칸 — 안의 [data-resume-link](링크), [data-resume-name](이름 글)
 *     [data-resume-lab][hidden]           마지막으로 연 실습실 칸 — 같은 구조
 *   [data-home-map][data-learn-base]      배움 지도. data-learn-base = /learn/ 주소(base 포함), data-start-label·data-resume-label·data-replay-label = 단추 글
 *     [data-home-unit][data-progress-unit]  대단원 카드(차시 id 목록은 progress-paint가 센다)
 *       [data-unit-start]                 시작하기 링크: data-first-href(처음 차시), data-unit-name("I단원")
 *         [data-unit-start-label]         링크 안 글
 *
 * 글은 모두 textContent로만 넣는다(저장소 값이 마크업으로 해석되지 않게). 같은 상태를 여러 번 그려도 같은 결과다.
 * 실습실 라이브러리를 import하지 않는다 — 홈은 사전 캐시되는 쪽이라 작게 유지한다.
 */
import { installProgressPaint, watchProgress } from '../progress/progress-paint.ts';
import { firstUnseen, isLessonId, lessonStatus, type ProgressState } from '../../lib/progress.ts';
import { lessonHrefFromId } from './home-map.ts';

/** 지도 카드 단추 글. 마크업(HomeMap.astro)의 data-start-label·data-resume-label·data-replay-label이 우선이고, 없으면 이 기본값이다. */
export interface MapLabels {
  readonly start: string;
  readonly resume: string;
  readonly replay: string;
}

const DEFAULT_LABELS: MapLabels = { start: '시작하기', resume: '이어서 하기', replay: '다시 보기' };

function setText(element: Element | null, text: string): void {
  if (element && element.textContent !== text) {
    element.textContent = text;
  }
}

function fillItem(item: Element | null, href: string | null, name: string): boolean {
  if (!item) {
    return false;
  }
  const link = item.querySelector<HTMLAnchorElement>('[data-resume-link]');
  const show = href !== null && link !== null;
  item.toggleAttribute('hidden', !show);
  if (show) {
    if (link.getAttribute('href') !== href) {
      link.setAttribute('href', href);
    }
    setText(item.querySelector('[data-resume-name]'), name);
  }
  return show;
}

/** 이어서 하기 띠를 채운다. 보일 칸이 하나도 없으면 띠 전체를 숨긴다. */
export function applyResume(root: ParentNode, state: ProgressState): void {
  const band = root.querySelector('[data-home-resume]');
  if (!band) {
    return;
  }
  const last = state.last;
  const lab = state.lastLab;
  const lessonShown = fillItem(band.querySelector('[data-resume-lesson]'), last ? last.href : null, last ? `${last.label} ${last.title}` : '');
  const labShown = fillItem(band.querySelector('[data-resume-lab]'), lab ? lab.path : null, lab ? lab.title : '');
  band.toggleAttribute('hidden', !(lessonShown || labShown));
}

/**
 * 배움 지도 카드의 단추를 진도에 맞춘다.
 *  - 본 차시가 없으면 "시작하기" → 첫 차시
 *  - 본 차시가 있고 안 본 차시가 남았으면 "이어서 하기" → 안 본 첫 차시
 *  - 모두 봤으면 "다시 보기" → 첫 차시
 */
export function applyMapProgress(root: ParentNode, state: ProgressState, fallback: MapLabels = DEFAULT_LABELS): void {
  const map = root.querySelector<HTMLElement>('[data-home-map]');
  const learnBase = map?.getAttribute('data-learn-base') ?? '';
  const labels: MapLabels = {
    start: map?.getAttribute('data-start-label') || fallback.start,
    resume: map?.getAttribute('data-resume-label') || fallback.resume,
    replay: map?.getAttribute('data-replay-label') || fallback.replay,
  };
  for (const card of root.querySelectorAll<HTMLElement>('[data-home-unit]')) {
    const link = card.querySelector<HTMLAnchorElement>('[data-unit-start]');
    if (!link) {
      continue;
    }
    const firstHref = link.getAttribute('data-first-href') ?? link.getAttribute('href') ?? '';
    const ids = (card.getAttribute('data-progress-unit') ?? '').split(',').filter(isLessonId);
    const anySeen = ids.some((id) => lessonStatus(state, id) !== 'none');
    let label = labels.start;
    let href = firstHref;
    if (anySeen) {
      const next = firstUnseen(state, ids);
      if (next !== null && learnBase !== '') {
        label = labels.resume;
        href = lessonHrefFromId(learnBase, next);
      } else {
        label = labels.replay;
      }
    }
    if (link.getAttribute('href') !== href) {
      link.setAttribute('href', href);
    }
    setText(link.querySelector('[data-unit-start-label]'), label);
    const unitName = link.getAttribute('data-unit-name');
    link.setAttribute('aria-label', unitName ? `${unitName} ${label}` : label);
  }
}

/** 홈 쪽 스크립트가 한 번 부른다: 진도 칠하기 + 띠 + 지도 단추. 멈춤 함수를 돌려준다. */
export function installHomeProgress(root: ParentNode = document): () => void {
  const stopPaint = installProgressPaint();
  const stopWatch = watchProgress((state) => {
    applyResume(root, state);
    applyMapProgress(root, state);
  });
  return () => {
    stopWatch();
    stopPaint();
  };
}
