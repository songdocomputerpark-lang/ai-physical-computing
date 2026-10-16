/**
 * 홈의 진도 부분(판 1.3.0): "이어서 하기" 띠와 배움 지도 카드의 단추를 저장된 진도로 바꾼다.
 * 진도는 HTML에 굽지 않고 브라우저에서만 그린다(서비스 워커·오프라인판에서 캐시된 홈도 같게 보이게).
 *
 * 마크업 약속(HomeResume.astro · HomeMap.astro)
 *   [data-home-resume][hidden]            띠 전체. 진도가 있을 때만 hidden을 뗀다(처음 온 사람에게는 아무것도 안 보인다)
 *     script[data-home-index]             JSON {lessons: [[id, 번호, 제목, 교과서 쪽 주소?], …], labs: [쪽 주소, …]} — 지금 사이트에 있는 차시·실습실 목록(없으면 거르지 않는다).
 *                                         네 번째 칸은 그 차시의 짝 교과서 쪽 주소(base 포함) — 있으면 "다음에 볼 차시"가 교과서 쪽으로 가고, 지난번에 연 곳이 그 쪽이면 거기로 돌아간다.
 *     [data-resume-lesson][hidden]        지난번에 본 차시 칸 — 안의 [data-resume-link](링크), [data-resume-name](이름 글), [data-resume-go](동작 글),
 *                                         data-go-open·data-go-done = 동작 글(끝낸 차시면 done 글: "다시 보기")
 *     [data-resume-next][hidden]          다음에 볼 차시 칸 — 지난번 차시를 끝냈을 때만 채운다(같은 대단원에서 안 연 첫 차시). 첫 화면 한 줄이 이 칸을 그대로 보이면
 *                                         같은 안내가 위아래로 두 번 보이지 않게 이 칸은 숨긴다(R3-007). 띠에는 "다시 보기" 칸(지난번 차시)이 남는다.
 *     [data-resume-lab][hidden]           마지막으로 연 실습실 칸 — 같은 구조
 *   [data-cover-start]                    표지의 첫 번째 큰 단추(HomeCover.astro, 판 1.4.0 — 판 1.6.0부터 [학생 처음부터 배우기]) — 처음엔 "처음부터 배우기"(data-first-href, 1단원 첫 절의 따라 하기 쪽). 띠의 칸(다음에 볼 차시 > 지난번 차시)에서
 *                                         주소·이름을 복사해 "이어서 하기 + 차시 이름"으로 바꾼다(실습실 칸은 쓰지 않는다 — 큰 단추는 배울 곳으로만 이어 준다).
 *                                         안의 [data-cover-start-label](글, data-start-label·data-resume-label)·[data-cover-start-name](차시 이름, 이어서 할 때만 보임).
 *   [data-learn-base]                     /learn/ 주소(base 포함, HomeUnits.astro가 단다). 차시 id로 웹 차시 주소를 만들 때 쓴다.
 *   [data-home-units][data-learn-base]    홈 단원 4장 카드 묶음(판 1.6.0, HomeUnits.astro. 옛 배움 지도 HomeMap.astro는 [data-home-map] — 같은 약속) data-start-label·data-resume-label·data-replay-label = 단추 글
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

const DEFAULT_LABELS: MapLabels = { start: '배우기', resume: '이어서 하기', replay: '다시 보기' };
const DEFAULT_GO_OPEN = '이어서 하기';
const DEFAULT_GO_DONE = '다시 보기';

/** 쪽에 실어 둔 "지금 있는 차시·실습실" 목록(HomeResume.astro의 JSON). 없거나 깨졌으면 null — 그때는 거르지 않는다. */
interface HomeIndex {
  /** 차시 id → { 번호, 제목 }, 사이트 차례대로 */
  readonly lessons: ReadonlyMap<string, { readonly label: string; readonly title: string; readonly bookHref?: string }>;
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
    const lessonMap = new Map<string, { label: string; title: string; bookHref?: string }>();
    for (const row of lessons) {
      if (Array.isArray(row) && typeof row[0] === 'string' && typeof row[1] === 'string' && typeof row[2] === 'string') {
        lessonMap.set(row[0], { label: row[1], title: row[2], ...(typeof row[3] === 'string' && row[3].startsWith('/') ? { bookHref: row[3] } : {}) });
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
 * 표지의 첫 번째 큰 단추를 띠의 한 칸에서 채운다(판 1.4.0). 칸이 있으면 "이어서 하기" + 차시 이름 + 그 주소로, 칸이 없으면(item === null) 처음 모습
 * "처음부터 배우기"(data-first-href)로 되돌린다. 단추를 바꿨으면 true를 돌려준다(R3-007: 띠가 같은 칸을 또 보이지 않으려고 부르는 쪽이 알아야 한다).
 * 글은 textContent·setAttribute로만 옮긴다(띠 칸에 이미 들어간 값이라 마크업이 아니다).
 */
function fillCover(root: ParentNode, item: Element | null): boolean {
  const start = root.querySelector<HTMLAnchorElement>('[data-cover-start]');
  if (start === null) {
    return false;
  }
  const label = start.querySelector('[data-cover-start-label]');
  const name = start.querySelector('[data-cover-start-name]');
  const source = item?.querySelector<HTMLAnchorElement>('[data-resume-link]') ?? null;
  if (item === null || source === null) {
    const first = start.getAttribute('data-first-href');
    if (first && start.getAttribute('href') !== first) {
      start.setAttribute('href', first);
    }
    setText(label, start.getAttribute('data-start-label') ?? '처음부터 배우기');
    name?.setAttribute('hidden', '');
    start.removeAttribute('data-resuming');
    return false;
  }
  const href = source.getAttribute('href') ?? '';
  if (start.getAttribute('href') !== href) {
    start.setAttribute('href', href);
  }
  // 지난번 차시를 이미 끝냈으면 띠와 같은 말 "다시 보기", 아니면(안 끝냈거나 다음 차시) "이어서 하기"
  const resumeLabel = start.getAttribute('data-resume-label') ?? DEFAULT_GO_OPEN;
  const goText = item.hasAttribute('data-resume-lesson') ? item.querySelector('[data-resume-go]')?.textContent : null;
  setText(label, goText || resumeLabel);
  setText(name, item.querySelector('[data-resume-name]')?.textContent ?? '');
  name?.removeAttribute('hidden');
  start.setAttribute('data-resuming', '');
  return true;
}

/**
 * 차시 id의 목적지 주소. 기본은 실습이 있는 따라 하기 쪽(/learn/)이고, 지난번에 연 곳이 그 차시의 교과서 원문 쪽이었을 때만
 * 거기로 돌려보낸다(판 1.6.0 C173 — "다음 차시"는 늘 따라 하기 쪽; 걷기 조사에서 학생이 글만 있는 교과서 쪽에 떨어져 실습이 없다고 느꼈다).
 */
function lessonTarget(learnBase: string, id: string, bookHref: string | undefined, lastHref: string | null): string {
  if (bookHref !== undefined && lastHref !== null && trimSlash(lastHref) === trimSlash(bookHref)) {
    return bookHref;
  }
  return lessonHrefFromId(learnBase, id);
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
  const learnBase = root.querySelector('[data-learn-base]')?.getAttribute('data-learn-base') ?? '';
  const last = state.last;
  const lab = state.lastLab;

  // 지난번 차시: 목록이 있으면 목록에 있는 차시만
  const known = last && index ? index.lessons.get(last.id) : undefined;
  const lastValid = last !== null && (index === null || known !== undefined);
  let lessonHref: string | null = null;
  let lessonName = '';
  if (last && lastValid) {
    lessonHref = known && learnBase !== '' ? lessonTarget(learnBase, last.id, known.bookHref, last.href) : last.href;
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
      nextHref = lessonTarget(learnBase, nextId, next.bookHref, null);
      nextName = `${next.label} ${next.title}`;
    }
  }
  const nextItem = band.querySelector('[data-resume-next]');
  const nextShown = fillItem(nextItem, nextHref, nextName);

  // 마지막 실습실: 목록이 있으면 목록에 있는 쪽만
  const labValid = lab !== null && (index === null || index.labs.has(trimSlash(lab.path)));
  const labItem = band.querySelector('[data-resume-lab]');
  const labShown = fillItem(labItem, lab && labValid ? lab.path : null, lab && labValid ? lab.title : '');

  // 표지의 첫 번째 큰 단추: 끝낸 차시가 있으면 다음 차시, 아니면 지난번 차시(실습실은 큰 단추의 몫이 아니다 — 띠에서 다시 열면 된다)
  const heroItem = nextShown ? nextItem : lessonShown ? lessonItem : null;
  const heroShown = fillCover(root, heroItem);
  // 큰 단추가 "다음에 볼 차시"를 이미 보이고 있으면 띠에서는 그 칸을 숨긴다 — 같은 안내는 한 번만(R3-007). 단추를 못 바꾼 때는 띠가 맡는다.
  const nextVisible = nextShown && !(heroShown && heroItem === nextItem);
  if (nextShown && !nextVisible) {
    nextItem?.setAttribute('hidden', '');
  }
  band.toggleAttribute('hidden', !(lessonShown || nextVisible || labShown));
}

/**
 * 배움 지도 카드의 단추를 진도에 맞춘다.
 *  - 본 차시가 없으면 "시작하기" → 첫 차시
 *  - 본 차시가 있고 안 본 차시가 남았으면 "이어서 하기" → 안 본 첫 차시
 *  - 모두 봤으면 "다시 보기" → 첫 차시
 */
export function applyMapProgress(root: ParentNode, state: ProgressState, fallback: MapLabels = DEFAULT_LABELS): void {
  // 판 1.6.0: 홈의 단원 카드(HomeUnits.astro)는 [data-home-units], 옛 배움 지도(HomeMap.astro)는 [data-home-map] — 같은 속성 약속을 쓴다
  const map = root.querySelector<HTMLElement>('[data-home-map], [data-home-units]');
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
