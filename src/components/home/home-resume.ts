/**
 * 홈의 진도 부분(판 1.3.0): "이어서 하기" 띠와 배움 지도 카드의 단추를 저장된 진도로 바꾼다.
 * 진도는 HTML에 굽지 않고 브라우저에서만 그린다(서비스 워커·오프라인판에서 캐시된 홈도 같게 보이게).
 *
 * 마크업 약속(HomeResume.astro · HomeMap.astro)
 *   [data-home-resume][hidden]            띠 전체. 진도가 있을 때만 hidden을 뗀다(처음 온 사람에게는 아무것도 안 보인다)
 *     script[data-home-index]             JSON {lessons: [[id, 번호, 제목], …], labs: [쪽 주소, …]} — 지금 사이트에 있는 차시·실습실 목록(없으면 거르지 않는다)
 *     [data-resume-lesson][hidden]        지난번에 본 차시 칸 — 안의 [data-resume-link](링크), [data-resume-name](이름 글), [data-resume-go](동작 글),
 *                                         data-go-open·data-go-done = 동작 글(끝낸 차시면 done 글: "다시 보기")
 *     [data-resume-next][hidden]          다음에 볼 차시 칸 — 지난번 차시를 끝냈을 때만 보인다(같은 대단원에서 안 연 첫 차시)
 *     [data-resume-lab][hidden]           마지막으로 연 실습실 칸 — 같은 구조
 *   [data-hero-resume][hidden]            첫 화면 큰 버튼 아래 "지난번 이어서" 한 줄(HomeHero.astro, R2-029) — 안의 [data-hero-resume-link]·[data-hero-resume-kicker]·[data-hero-resume-name].
 *                                         띠의 칸(다음에 볼 차시 > 지난번 차시 > 실습실) 중 첫 번째 보이는 칸에서 주소·머리글·이름을 복사한다.
 *                                         보이면 [data-hero-guide]("처음이라면 첫 번째 단추부터…")는 숨긴다 — 돌아온 학생에게 어긋난 안내라서.
 *   [data-home-map][data-learn-base]      배움 지도. data-learn-base = /learn/ 주소(base 포함), data-start-label·data-resume-label·data-replay-label = 단추 글
 *     [data-home-unit][data-progress-unit]  대단원 카드(차시 id 목록은 progress-paint가 센다)
 *       [data-unit-start]                 단원 링크: data-first-href(처음 차시), data-unit-name("1단원")
 *         [data-unit-start-label]         링크 안 글: "1단원 배우기" 꼴(단원 이름 + 단추 글)
 *
 * 글은 모두 textContent로만 넣는다(저장소 값이 마크업으로 해석되지 않게). 같은 상태를 여러 번 그려도 같은 결과다.
 * 실습실 라이브러리를 import하지 않는다 — 홈은 사전 캐시되는 쪽이라 작게 유지한다.
 */
import { installProgressPaint, watchProgress } from '../progress/progress-paint.ts';
import { firstUnseen, isLessonId, nextUnseen, lessonStatus, type ProgressState } from '../../lib/progress.ts';
import { lessonHrefFromId } from './home-map.ts';

/** 지도 카드 단추 글. 마크업(HomeMap.astro)의 data-start-label·data-resume-label·data-replay-label이 우선이고, 없으면 이 기본값이다. */
export interface MapLabels {
  readonly start: string;
  readonly resume: string;
  readonly replay: string;
}

const DEFAULT_LABELS: MapLabels = { start: '배우기', resume: '계속하기', replay: '다시 보기' };
const DEFAULT_GO_OPEN = '이어서 하기';
const DEFAULT_GO_DONE = '다시 보기';

/** 쪽에 실어 둔 "지금 있는 차시·실습실" 목록(HomeResume.astro의 JSON). 없거나 깨졌으면 null — 그때는 거르지 않는다. */
interface HomeIndex {
  /** 차시 id → { 번호, 제목 }, 사이트 차례대로 */
  readonly lessons: ReadonlyMap<string, { readonly label: string; readonly title: string }>;
  /** 실습실 쪽 주소(끝 / 없이 비교하려고 다듬은 것) */
  readonly labs: ReadonlySet<string>;
}

function trimSlash(path: string): string {
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
}

function readIndex(root: ParentNode): HomeIndex | null {
  const script = root.querySelector('script[data-home-index]');
  if (!script?.textContent) {
    return null;
  }
  try {
    const raw: unknown = JSON.parse(script.textContent);
    if (typeof raw !== 'object' || raw === null) {
      return null;
    }
    const { lessons, labs } = raw as { lessons?: unknown; labs?: unknown };
    if (!Array.isArray(lessons) || !Array.isArray(labs)) {
      return null;
    }
    const lessonMap = new Map<string, { label: string; title: string }>();
    for (const row of lessons) {
      if (Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'string' && typeof row[2] === 'string') {
        lessonMap.set(row[0], { label: row[1], title: row[2] });
      }
    }
    return { lessons: lessonMap, labs: new Set(labs.filter((path): path is string => typeof path === 'string').map(trimSlash)) };
  } catch {
    return null;
  }
}

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

/** 차시 id의 대단원 접두("u2/2-1-1" → "u2") */
function unitOf(id: string): string {
  return id.slice(0, id.indexOf('/'));
}

/**
 * 첫 화면의 "지난번 이어서" 한 줄을 띠의 한 칸으로 채운다. 칸이 없으면(item === null) 한 줄을 숨기고 처음 온 사람용 길잡이를 되살린다.
 * 글은 textContent·setAttribute로만 옮긴다(띠 칸에 이미 들어간 값이라 마크업이 아니다).
 */
function fillHero(root: ParentNode, item: Element | null): void {
  const hero = root.querySelector('[data-hero-resume]');
  const guide = root.querySelector('[data-hero-guide]');
  const link = hero?.querySelector<HTMLAnchorElement>('[data-hero-resume-link]') ?? null;
  const source = item?.querySelector<HTMLAnchorElement>('[data-resume-link]') ?? null;
  if (hero === null || link === null || item === null || source === null) {
    hero?.setAttribute('hidden', '');
    guide?.removeAttribute('hidden');
    return;
  }
  hero.removeAttribute('hidden');
  guide?.setAttribute('hidden', '');
  const href = source.getAttribute('href') ?? '';
  if (link.getAttribute('href') !== href) {
    link.setAttribute('href', href);
  }
  setText(link.querySelector('[data-hero-resume-kicker]'), item.querySelector('[data-resume-kicker]')?.textContent ?? '');
  setText(link.querySelector('[data-hero-resume-name]'), item.querySelector('[data-resume-name]')?.textContent ?? '');
}

/**
 * 이어서 하기 띠를 채운다. 보일 칸이 하나도 없으면 띠 전체를 숨긴다.
 *  - 사이트에 없는 차시·실습실(옛 주소)은 칸을 숨긴다. 있는 차시는 번호·제목·주소를 지금 사이트 것으로 쓴다(저장된 옛 이름·주소가 아니라).
 *  - 지난번 차시를 이미 끝냈으면 동작 글을 "다시 보기"로 바꾸고, 같은 대단원에서 아직 안 연 첫 차시를 "다음에 볼 차시" 칸으로 보인다.
 */
export function applyResume(root: ParentNode, state: ProgressState): void {
  const band = root.querySelector('[data-home-resume]');
  if (!band) {
    return;
  }
  const index = readIndex(band);
  const learnBase = root.querySelector('[data-home-map]')?.getAttribute('data-learn-base') ?? '';
  const last = state.last;
  const lab = state.lastLab;

  // 지난번 차시: 목록이 있으면 목록에 있는 차시만
  const known = last && index ? index.lessons.get(last.id) : undefined;
  const lastValid = last !== null && (index === null || known !== undefined);
  let lessonHref: string | null = null;
  let lessonName = '';
  if (last && lastValid) {
    lessonHref = known && learnBase !== '' ? lessonHrefFromId(learnBase, last.id) : last.href;
    lessonName = known ? `${known.label} ${known.title}` : `${last.label} ${last.title}`;
  }
  const lessonItem = band.querySelector('[data-resume-lesson]');
  const lessonShown = fillItem(lessonItem, lessonHref, lessonName);
  const lastDone = last !== null && lessonShown && lessonStatus(state, last.id) === 'done';
  const goText = lastDone ? lessonItem?.getAttribute('data-go-done') : lessonItem?.getAttribute('data-go-open');
  setText(lessonItem?.querySelector('[data-resume-go]') ?? null, goText || (lastDone ? DEFAULT_GO_DONE : DEFAULT_GO_OPEN));

  // 다음에 볼 차시: 지난번 차시를 끝냈고, 같은 대단원에 그 뒤로 안 연 차시가 남았을 때만
  let nextHref: string | null = null;
  let nextName = '';
  if (last && lastDone && index && learnBase !== '') {
    const unit = unitOf(last.id);
    const ids = [...index.lessons.keys()].filter((id) => unitOf(id) === unit);
    const nextId = nextUnseen(state, ids); // 지난번 차시 바로 뒤의 안 본 차시(안 본 앞 차시로 되돌리지 않음, R2-021)
    const next = nextId === null ? undefined : index.lessons.get(nextId);
    if (nextId !== null && next) {
      nextHref = lessonHrefFromId(learnBase, nextId);
      nextName = `${next.label} ${next.title}`;
    }
  }
  const nextItem = band.querySelector('[data-resume-next]');
  const nextShown = fillItem(nextItem, nextHref, nextName);

  // 마지막 실습실: 목록이 있으면 목록에 있는 쪽만
  const labValid = lab !== null && (index === null || index.labs.has(trimSlash(lab.path)));
  const labItem = band.querySelector('[data-resume-lab]');
  const labShown = fillItem(labItem, lab && labValid ? lab.path : null, lab && labValid ? lab.title : '');

  band.toggleAttribute('hidden', !(lessonShown || nextShown || labShown));
  // 첫 화면 한 줄: 끝낸 차시가 있으면 다음 차시, 아니면 지난번 차시, 그것도 없으면 마지막 실습실
  fillHero(root, nextShown ? nextItem : lessonShown ? lessonItem : labShown ? labItem : null);
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
    // 눈에 보이는 글이 "1단원 배우기"처럼 단원 이름을 담으므로 따로 aria-label을 두지 않는다(보이는 글 = 접근 이름).
    const unitName = link.getAttribute('data-unit-name');
    setText(link.querySelector('[data-unit-start-label]'), unitName ? `${unitName} ${label}` : label);
    link.removeAttribute('aria-label');
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
