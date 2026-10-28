/**
 * 왼쪽 메뉴판의 브라우저 쪽(판 1.9.0, DECISIONS C238) — 마크업은 SideMenu.astro, 머리글 [메뉴] 단추는 SiteHeader.astro.
 *
 * ① [메뉴] 단추(aria-controls="site-menu")
 *    넓은 화면(75rem 이상): 왼쪽 칸을 접고 편다. 고른 것은 이 브라우저에 남긴다(storage 이름 ui:side-menu — 'closed'|'open').
 *      화면을 넓게 쓰는 쪽(실습실 — <html data-page-width="wide">)은 처음에 접혀 있고 그 쪽들의 선택은 ui:side-menu-wide에 따로 남긴다.
 *      첫 그리기 전에 BaseLayout의 스크립트가 같은 값을 읽어 <html data-side-menu="closed">를 붙이므로 쪽을 옮겨도 칸이 흔들리지 않는다.
 *    좁은 화면: 머리글 바로 아래 칸을 열고 닫는다(저장하지 않는다 — 쪽을 옮기면 닫혀 있다).
 *      열린 채 Esc를 누르면 닫히고 초점이 [메뉴]로 돌아온다(검색 상자 안의 Esc는 검색 자동 완성이 맡는다). 칸 안 링크·머리글과 칸 바깥을 누르면 닫힌다.
 *    화면 폭이 기준을 넘나들면 그 폭의 상태로 다시 맞춘다(좁은 화면의 열림은 닫힌 상태로 돌아간다).
 *    aria-expanded는 늘 "지금 보이는지"다.
 * ② "내 학습" 칸: 진도가 있으면 [이어서 하기 — 지난번 차시], 없으면 [처음이라면 여기부터 — 1-1-1 …]. 그 링크가 지금 쪽이면 링크를 숨긴다
 *    (차시 쪽은 열자마자 "지난번 차시"가 그 쪽이 된다 — 같은 쪽으로 가는 큰 단추는 쓸모가 없다).
 *    전체·단원 진도 글과 막대는 progress-paint.ts가 칠하고, 단원 줄 끝의 "3/18"([data-progress-fraction])은 여기서 칠한다(다 한 차시가 있을 때만).
 * ③ 넓은 화면에서 지금 쪽 줄이 칸 아래쪽에 있으면(선생님 묶음 등) 칸 안에서만 굴려 보이게 한다(창은 굴리지 않는다).
 *
 * 글은 모두 textContent로만 넣는다(저장소 값이 마크업으로 해석되지 않게). 실습실 라이브러리를 import하지 않는다(모든 쪽에 실린다).
 */
import { installProgressPaint, parseLessonIds, watchProgress } from '../../components/progress/progress-paint.ts';
import { unitSummary, type ProgressState } from '../../lib/progress.ts';
import { readItem, writeItem } from '../../lib/storage.ts';
import { normalizePagePath } from '../../lib/url.ts';
import { SIDE_MENU_STORAGE_NAME, SIDE_MENU_WIDE_STORAGE_NAME, type SideMenuSaved } from './side-menu.ts';

/** SideMenu.astro·SiteHeader.astro의 75rem 기준과 같다 */
export const SIDE_MENU_WIDE_QUERY = '(min-width: 75rem)';

/** 이 쪽의 선택을 저장하는 이름: 화면을 넓게 쓰는 쪽(<html data-page-width="wide">)은 따로 */
export function sideMenuStorageName(pageWidth: string | undefined): string {
  return pageWidth === 'wide' ? SIDE_MENU_WIDE_STORAGE_NAME : SIDE_MENU_STORAGE_NAME;
}

/** 넓은 화면에서 메뉴판이 처음에 펴져 있는지: 보통 쪽은 접었다고 저장한 때만 접고, 넓게 쓰는 쪽은 폈다고 저장한 때만 편다 */
export function sideMenuStartsOpen(pageWidth: string | undefined, saved: SideMenuSaved | null): boolean {
  return pageWidth === 'wide' ? saved === 'open' : saved !== 'closed';
}

/** 저장된 선택(없거나 읽지 못하면 null) */
export function readSideMenuSaved(name: string = SIDE_MENU_STORAGE_NAME): SideMenuSaved | null {
  try {
    const value = readItem(name);
    return value === 'closed' || value === 'open' ? value : null;
  } catch {
    return null;
  }
}

/** 단원 줄 끝 글: 다 한 차시가 있으면 "3/18", 없으면 빈 글 */
export function fractionText(summary: { total: number; done: number }): string {
  return summary.total > 0 && summary.done > 0 ? `${summary.done}/${summary.total}` : '';
}

/** 짝 웹 차시가 없는 교과서 쪽의 진도 id(book-data.ts bookAsLesson — "u1/book-front" 꼴) */
const BOOK_ONLY_ID = /^u[1-4]\/book-[a-z0-9-]+$/u;

/**
 * 이어서 하기 링크에 쓸 지난번 차시. 주소가 이 사이트의 따라 하기·교과서 쪽(base 포함)이고, 차시 id가 지금 사이트에 있는 차시(known — 메뉴판 "내 학습" 칸의
 * data-progress-unit 목록)이거나 교과서 쪽 id일 때만 쓴다 — 저장소에 남은 낡은 값(지운 차시 등)이 없는 쪽으로 보내지 않게(홈의 R1-031과 같은 규칙).
 */
export function resumeTarget(state: ProgressState, base: string, known?: readonly string[]): { href: string; name: string } | null {
  const last = state.last;
  if (!last) {
    return null;
  }
  const root = base.endsWith('/') ? base : `${base}/`;
  const isLearn = last.href.startsWith(`${root}learn/`);
  const isBook = last.href.startsWith(`${root}book/`);
  if (!isLearn && !isBook) {
    return null;
  }
  if (known && !known.includes(last.id) && !(isBook && BOOK_ONLY_ID.test(last.id))) {
    return null;
  }
  return { href: last.href, name: `${last.label} ${last.title}`.trim() };
}

function setText(element: Element | null, text: string): void {
  if (element && element.textContent !== text) {
    element.textContent = text;
  }
}

function paintMenu(menu: HTMLElement, state: ProgressState): void {
  const resume = menu.querySelector<HTMLAnchorElement>('[data-side-resume]');
  if (resume) {
    const go = resume.querySelector<HTMLElement>('[data-side-resume-go]');
    const name = resume.querySelector<HTMLElement>('[data-side-resume-name]');
    const base = import.meta.env.BASE_URL;
    const known = parseLessonIds(menu.querySelector('.side-menu__me')?.getAttribute('data-progress-unit'));
    const target = resumeTarget(state, base, known);
    const href = target?.href ?? resume.dataset.firstHref ?? resume.href;
    resume.setAttribute('href', href);
    setText(go, (target ? go?.dataset.resumeLabel : go?.dataset.firstLabel) ?? '');
    setText(name, target?.name ?? name?.dataset.firstName ?? '');
    resume.hidden = normalizePagePath(href) === normalizePagePath(location.pathname);
  }
  for (const unit of menu.querySelectorAll<HTMLElement>('[data-progress-fraction]')) {
    const holder = unit.closest<HTMLElement>('[data-progress-unit]');
    const ids = parseLessonIds(holder?.getAttribute('data-progress-unit'));
    setText(unit, fractionText(unitSummary(state, ids)));
  }
}

function scrollCurrentIntoMenu(menu: HTMLElement, wide: boolean): void {
  if (!wide || menu.scrollHeight <= menu.clientHeight) {
    return;
  }
  const current = menu.querySelector<HTMLElement>('[aria-current="page"]') ?? menu.querySelector<HTMLElement>('.side-menu__link[data-active]');
  if (!current) {
    return;
  }
  const menuBox = menu.getBoundingClientRect();
  const box = current.getBoundingClientRect();
  const visibleBottom = Math.min(menuBox.bottom, window.innerHeight);
  if (box.bottom > visibleBottom - 16) {
    menu.scrollTop += box.bottom - visibleBottom + menuBox.height / 3;
  }
}

let installed = false;

/** 쪽마다 한 번(SideMenu.astro의 스크립트). 여러 번 불러도 한 번만 설치한다. */
export function installSideMenu(): void {
  if (installed || typeof document === 'undefined') {
    return;
  }
  installed = true;
  const root = document.documentElement;
  const menu = document.querySelector<HTMLElement>('[data-side-menu]');
  const button = document.querySelector<HTMLButtonElement>('[data-menu-button]');
  const header = document.querySelector<HTMLElement>('[data-site-header]');
  if (!menu) {
    return;
  }
  const wideScreen = window.matchMedia(SIDE_MENU_WIDE_QUERY);

  const isOpen = (): boolean => (wideScreen.matches ? root.dataset.sideMenu !== 'closed' : menu.dataset.open === 'true');
  const sync = (): void => {
    button?.setAttribute('aria-expanded', String(isOpen()));
  };
  const storageName = sideMenuStorageName(root.dataset.pageWidth);
  const setWideOpen = (open: boolean): void => {
    if (open) {
      delete root.dataset.sideMenu;
    } else {
      root.dataset.sideMenu = 'closed';
    }
    writeItem(storageName, open ? 'open' : 'closed');
    sync();
  };
  const setNarrowOpen = (open: boolean): void => {
    menu.dataset.open = String(open);
    sync();
  };

  // 첫 그리기 전 스크립트(BaseLayout)와 같은 규칙으로 한 번 더 맞춘다(저장이 막혔다가 풀림 등으로 어긋났을 때).
  if (sideMenuStartsOpen(root.dataset.pageWidth, readSideMenuSaved(storageName))) {
    delete root.dataset.sideMenu;
  } else {
    root.dataset.sideMenu = 'closed';
  }
  sync();

  button?.addEventListener('click', () => {
    if (wideScreen.matches) {
      setWideOpen(!isOpen());
      if (isOpen()) {
        scrollCurrentIntoMenu(menu, true);
      }
    } else {
      setNarrowOpen(!isOpen());
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || wideScreen.matches || !isOpen()) {
      return;
    }
    if (event.target instanceof Element && event.target.closest('.site-header__search')) {
      return;
    }
    setNarrowOpen(false);
    button?.focus();
  });

  // 좁은 화면: 칸 안 링크를 누르면(같은 쪽 #위치 링크 등) 닫는다. 다른 쪽으로 가는 링크는 쪽이 바뀌므로 상관없다.
  menu.addEventListener('click', (event) => {
    if (!wideScreen.matches && isOpen() && event.target instanceof Element && event.target.closest('a')) {
      setNarrowOpen(false);
    }
  });

  // 좁은 화면: 머리글과 칸 바깥을 누르면 닫는다(초점은 누른 곳에 그대로 둔다).
  document.addEventListener('click', (event) => {
    if (wideScreen.matches || !isOpen() || !(event.target instanceof Node)) {
      return;
    }
    if (!menu.contains(event.target) && !(header?.contains(event.target) ?? false)) {
      setNarrowOpen(false);
    }
  });

  wideScreen.addEventListener('change', () => {
    menu.dataset.open = 'false';
    sync();
    scrollCurrentIntoMenu(menu, wideScreen.matches);
  });

  installProgressPaint();
  watchProgress((state) => paintMenu(menu, state));
  scrollCurrentIntoMenu(menu, wideScreen.matches);
}
