/**
 * 왼쪽 메뉴판(판 1.9.0, DECISIONS C239) — 모든 쪽 왼쪽에 사이트 전체 길잡이를 묶음으로 보이는 목록의 자료.
 *
 * 운영자 요청(2026-10-28): "왼쪽에 대시보드 만들어서 누르면 쉽게 알 수 있게, 지금 가독성이 너무 떨어짐".
 * 예전 머리글 주 메뉴는 아이콘 위·낱말 아래의 작은 칸 일곱 개(15px)였고 실습실 네 곳·키트 도감·오류 사전 같은 자주 가는 곳은 한 번 더 들어가야 보였다.
 * 이제 넓은 화면(75rem 이상)에서는 왼쪽에 붙어 따라오는 칸, 좁은 화면에서는 [메뉴]로 여는 칸 하나에 묶음 다섯 개를 큰 글자 줄로 보인다.
 * 화면 이름은 "메뉴" — "대시보드"는 통신 실습실의 쪽 이름(/labs/iot/dashboard/)이라 같은 말을 쓰지 않는다.
 *
 * 쪽 이름·주소·아이콘은 모두 사이트 지도(src/config/nav.ts)에서 읽는다 — 여기는 "어느 묶음에 어떤 차례로"만 정한다.
 * 새 쪽을 메뉴판에 보이려면 nav.ts에 쪽을 두고 아래 SIDE_MENU_PLAN의 묶음에 id 한 줄을 더한다(tests/unit/side-menu.test.ts가 id를 대조).
 *
 * 줄 규칙
 * - 묶음 제목은 낱말(처음이라면·배우기·실습하기·도움받기·선생님)로, 줄마다 아이콘 + 낱말. 지금 주소에 가장 꼭 맞는 줄 하나(sideMenuBestMatch)만
 *   지금 쪽이면 aria-current="page", 지금 쪽이 그 아래에 있으면 data-active이고, 그 줄의 메뉴판 위 줄이 함께 data-active다 — 둘 다 색·왼쪽 막대·
 *   굵은 글자를 함께 써서 색만으로 알리지 않는다.
 * - 아래 줄(depth 1)은 'always'면 늘, 'active'면 그 줄이나 그 아래 줄이 가장 꼭 맞는 줄일 때만 보인다(시작하기의 학생용·보호자 안내 등).
 *   한 쪽은 메뉴판에 한 번만 나온다(같은 링크 두 벌 없음) — 시작하기 아래의 부품 사전·교사용 시작하기는 실습하기·선생님 묶음에 있어 빠진다.
 * - 따라 하기 아래 단원 넷은 "1단원 영상 처리 인공지능" 꼴(src/lib/display-names.ts unitName)과 단원 진도("3/18")를 함께 보인다.
 */
import type { IconName } from '../../components/common/icons.ts';
import { getLearnUnit, getPage, isCurrentPage, isInSection, type NavPage } from '../../config/nav.ts';
import { unitName } from '../../lib/display-names.ts';

/** 아래 줄을 언제 보이는지 */
export type SideMenuChildShow = 'always' | 'active';

interface SideMenuItemPlan {
  /** 사이트 지도 id */
  readonly id: string;
  /** 메뉴판에서만 쓰는 이름(없으면 사이트 지도의 label) */
  readonly label?: string;
  readonly children?: readonly string[];
  readonly show?: SideMenuChildShow;
}

interface SideMenuGroupPlan {
  readonly key: string;
  readonly title: string;
  readonly items: readonly SideMenuItemPlan[];
}

/** 대단원 줄을 나타내는 가짜 id(사이트 지도의 learn-u1~4) */
const UNIT_IDS = ['learn-u1', 'learn-u2', 'learn-u3', 'learn-u4'] as const;

/** 묶음과 차례 — 이 표만 고치면 메뉴판이 바뀐다 */
export const SIDE_MENU_PLAN: readonly SideMenuGroupPlan[] = Object.freeze([
  {
    key: 'start',
    title: '처음이라면',
    items: [
      { id: 'home' },
      { id: 'start', children: ['start-student', 'start-parent', 'start-board', 'start-check'], show: 'active' },
    ],
  },
  {
    key: 'learn',
    title: '배우기',
    items: [{ id: 'book' }, { id: 'learn', children: UNIT_IDS, show: 'always' }],
  },
  {
    key: 'labs',
    title: '실습하기',
    items: [
      { id: 'labs', label: '실습실 모아 보기', children: ['labs-vision', 'labs-esp32', 'labs-iot', 'labs-unit4', 'labs-gallery'], show: 'always' },
      { id: 'labs-esp32-kit' },
      { id: 'start-parts' },
    ],
  },
  {
    key: 'help',
    title: '도움받기',
    items: [{ id: 'help' }, { id: 'help-errors' }, { id: 'glossary' }],
  },
  {
    key: 'teacher',
    title: '선생님',
    items: [{ id: 'teacher' }, { id: 'start-teacher' }],
  },
]);

export interface SideMenuLink {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: IconName;
  /** 지금 쪽(aria-current="page") */
  readonly current: boolean;
  /** 지금 쪽이 이 줄 아래에 있다(data-active) */
  readonly active: boolean;
  /** 대단원 줄이면 단원 번호(진도·단원 색) */
  readonly unit?: 1 | 2 | 3 | 4;
  readonly depth: 0 | 1;
  readonly children: readonly SideMenuLink[];
}

export interface SideMenuGroup {
  readonly key: string;
  readonly title: string;
  readonly links: readonly SideMenuLink[];
}

function unitOf(id: string): 1 | 2 | 3 | 4 | undefined {
  const index = (UNIT_IDS as readonly string[]).indexOf(id);
  return index < 0 ? undefined : ((index + 1) as 1 | 2 | 3 | 4);
}

function toLink(page: NavPage, depth: 0 | 1, mark: { current: boolean; active: boolean }, label?: string): SideMenuLink {
  const unit = unitOf(page.id);
  return Object.freeze({
    id: page.id,
    label: label ?? (unit ? unitName(unit) : page.label),
    href: page.href,
    icon: page.icon,
    current: mark.current,
    active: mark.active,
    ...(unit ? { unit } : {}),
    depth,
    children: Object.freeze([]),
  });
}

function pageOf(id: string): NavPage {
  const unit = unitOf(id);
  return unit ? getLearnUnit(unit) : getPage(id);
}

/**
 * 지금 주소에 가장 꼭 맞는 메뉴판 줄의 id: 지금 쪽 그 자체가 있으면 그 줄, 없으면 지금 주소를 품는 줄 가운데 주소가 가장 긴 줄.
 * 그 줄만 "지금 쪽"(aria-current) 또는 "이 아래에 있어요"(data-active)이고, 그 줄의 메뉴판 위 줄(depth 0)만 함께 "이 아래"다.
 * 예전처럼 주소가 앞부분만 겹치는 줄을 모두 표시하면 키트 장치 쪽에서 실습실 모아 보기·ESP32 실습실·키트 장치 도감 셋이,
 * 부품 사전 쪽에서 시작하기와 부품 사전이 함께 칠해졌다(판 1.9.0 검토).
 */
export function sideMenuBestMatch(pathname: string): string | undefined {
  const ids = sideMenuPageIds();
  const pages = ids.map(pageOf);
  const exact = pages.find((page) => isCurrentPage(page, pathname));
  if (exact) {
    return exact.id;
  }
  return pages
    .filter((page) => isInSection(page, pathname))
    .sort((a, b) => b.path.length - a.path.length)[0]?.id;
}

/**
 * 지금 주소(base가 붙어 있어도 됨)에 맞춘 메뉴판 묶음. 'active' 아래 줄은 그 줄이 가장 꼭 맞는 줄이거나 아래 줄 가운데 하나가 그럴 때만 넣는다.
 */
export function sideMenuGroups(pathname: string): SideMenuGroup[] {
  const best = sideMenuBestMatch(pathname);
  const markOf = (page: NavPage): { current: boolean; active: boolean } => {
    if (page.id !== best) {
      return { current: false, active: false };
    }
    const current = isCurrentPage(page, pathname);
    return { current, active: !current };
  };
  return SIDE_MENU_PLAN.map((group) => ({
    key: group.key,
    title: group.title,
    links: group.items.map((item) => {
      const page = pageOf(item.id);
      const childIds = item.children ?? [];
      const holdsBest = best !== undefined && childIds.includes(best);
      const own = markOf(page);
      const parent = toLink(page, 0, holdsBest ? { current: false, active: true } : own, item.label);
      const open = item.show === 'always' || page.id === best || holdsBest;
      const children = open ? childIds.map((id) => toLink(pageOf(id), 1, markOf(pageOf(id)))) : [];
      return children.length > 0 ? { ...parent, children: Object.freeze(children) } : parent;
    }),
  }));
}

/** 메뉴판에 나오는 모든 사이트 지도 id(차례대로, 'active' 아래 줄 포함) — 같은 쪽이 두 번 나오지 않는지 시험이 본다 */
export function sideMenuPageIds(): string[] {
  return SIDE_MENU_PLAN.flatMap((group) => group.items.flatMap((item) => [item.id, ...(item.children ?? [])]));
}

/**
 * 메뉴판을 접고 펴는 선택을 저장하는 이름(src/lib/storage.ts 규칙 — 머리말 없이). BaseLayout의 첫 그리기 전 스크립트가 같은 키를 직접 읽는다
 * (그 스크립트는 import 없이 쪽 HTML에 실리므로 머리말을 글자로 적는다 — tests/unit/side-menu.test.ts가 두 값을 대조).
 */
export const SIDE_MENU_STORAGE_NAME = 'ui:side-menu';

/**
 * 화면을 넓게 쓰는 쪽(BaseLayout width="wide" — 영상 처리·ESP32·4단원 실습실, 대시보드)의 선택. 이 쪽들은 처음에 메뉴판이 접혀 있고('open'일 때만 편다)
 * 보통 쪽의 선택과 따로 기억한다 — 1366 폭에서 메뉴판(18rem)이 펴져 있으면 ESP32 실습실의 보드 그림(최소 32rem)이 칸보다 넓어져 잘렸다.
 */
export const SIDE_MENU_WIDE_STORAGE_NAME = 'ui:side-menu-wide';

/** 저장 값: 접었으면 'closed', 폈으면 'open'(처음 온 사람은 저장 값이 없고 넓은 화면에서 펴져 있다) */
export type SideMenuSaved = 'closed' | 'open';
