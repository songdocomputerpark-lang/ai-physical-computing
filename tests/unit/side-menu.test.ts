// 왼쪽 메뉴판(판 1.9.0, DECISIONS C238) — 묶음 자료(src/layouts/partials/side-menu.ts)와 브라우저 쪽 순수 함수(side-menu-client.ts) 검사.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPage, headerNav } from '../../src/config/nav.ts';
import {
  SIDE_MENU_PLAN,
  SIDE_MENU_STORAGE_NAME,
  SIDE_MENU_WIDE_STORAGE_NAME,
  sideMenuGroups,
  sideMenuPageIds,
} from '../../src/layouts/partials/side-menu.ts';
import { fractionText, resumeTarget, sideMenuStartsOpen, sideMenuStorageName } from '../../src/layouts/partials/side-menu-client.ts';
import { emptyProgress } from '../../src/lib/progress.ts';
import { STORAGE_KEY_PREFIX, isValidStorageName } from '../../src/lib/storage.ts';

const BASE = '/ai-physical-computing/';

function flat(pathname: string) {
  return sideMenuGroups(pathname).flatMap((group) => group.links.flatMap((link) => [link, ...link.children]));
}

describe('메뉴판 묶음(SIDE_MENU_PLAN)', () => {
  it('묶음 다섯 개가 정해진 차례다', () => {
    expect(SIDE_MENU_PLAN.map((group) => group.title)).toEqual(['처음이라면', '배우기', '실습하기', '도움받기', '선생님']);
  });

  it('모든 id가 사이트 지도에 있고(대단원 포함), 한 쪽은 메뉴판에 한 번만 나온다', () => {
    const ids = sideMenuPageIds();
    for (const id of ids) {
      expect(() => getPage(id), id).not.toThrow();
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('예전 머리글 주 메뉴 일곱 곳(headerNav)과 실습실 네 곳·키트 도감·부품 사전·오류 사전이 모두 있다', () => {
    const ids = sideMenuPageIds();
    for (const page of headerNav) {
      expect(ids, page.id).toContain(page.id);
    }
    for (const id of ['labs-vision', 'labs-esp32', 'labs-iot', 'labs-unit4', 'labs-gallery', 'labs-esp32-kit', 'start-parts', 'help-errors', 'learn-u1', 'learn-u4']) {
      expect(ids).toContain(id);
    }
  });
});

describe('지금 쪽 표시(sideMenuGroups)', () => {
  it('홈에서는 홈만 지금 쪽이고, 시작하기 아래 줄은 접혀 있다', () => {
    const links = flat(BASE);
    expect(links.filter((link) => link.current).map((link) => link.id)).toEqual(['home']);
    expect(links.some((link) => link.active)).toBe(false);
    expect(links.map((link) => link.id)).not.toContain('start-student');
  });

  it('차시 쪽(/learn/u1/1-1-2/)에서는 따라 하기와 1단원이 "이 아래에 있어요"이고 지금 쪽은 없다', () => {
    const links = flat(`${BASE}learn/u1/1-1-2/`);
    expect(links.filter((link) => link.active).map((link) => link.id)).toEqual(['learn', 'learn-u1']);
    expect(links.filter((link) => link.current)).toEqual([]);
  });

  it('단원 줄은 "1단원 영상 처리 인공지능" 꼴 이름과 단원 번호를 가진다', () => {
    const unit = flat(BASE).find((link) => link.id === 'learn-u1');
    expect(unit?.label).toBe('1단원 영상 처리 인공지능');
    expect(unit?.unit).toBe(1);
    expect(unit?.depth).toBe(1);
  });

  it('실습실 쪽(/labs/vision/)은 지금 쪽, 실습실 모아 보기는 "이 아래"', () => {
    const links = flat(`${BASE}labs/vision/`);
    expect(links.find((link) => link.id === 'labs-vision')?.current).toBe(true);
    expect(links.find((link) => link.id === 'labs')?.active).toBe(true);
    expect(links.find((link) => link.id === 'labs')?.label).toBe('실습실 모아 보기');
  });

  it('시작하기 아래 줄(학생용·보호자 안내·보드 준비·내 컴퓨터 점검)은 시작하기 안에 있을 때만 펼친다', () => {
    const ids = flat(`${BASE}start/board/`).map((link) => link.id);
    expect(ids).toEqual(expect.arrayContaining(['start-student', 'start-parent', 'start-board', 'start-check']));
    expect(flat(`${BASE}start/board/`).find((link) => link.id === 'start-board')?.current).toBe(true);
    expect(flat(`${BASE}glossary/`).map((link) => link.id)).not.toContain('start-board');
  });
});

describe('저장 이름과 첫 그리기 전 스크립트', () => {
  it('저장 이름은 storage.ts 규칙에 맞고, BaseLayout의 인라인 스크립트가 머리말을 붙인 같은 키를 읽는다(넓게 쓰는 쪽은 따로)', () => {
    expect(isValidStorageName(SIDE_MENU_STORAGE_NAME)).toBe(true);
    expect(isValidStorageName(SIDE_MENU_WIDE_STORAGE_NAME)).toBe(true);
    const layout = readFileSync('src/layouts/BaseLayout.astro', 'utf8');
    expect(layout).toContain(`localStorage.getItem('${STORAGE_KEY_PREFIX}${SIDE_MENU_STORAGE_NAME}') === 'closed'`);
    expect(layout).toContain(`localStorage.getItem('${STORAGE_KEY_PREFIX}${SIDE_MENU_WIDE_STORAGE_NAME}') !== 'open'`);
    expect(layout).toMatch(/<html lang="ko" data-page-width=\{width\}>/u);
  });

  it('처음 펴짐: 보통 쪽은 접었다고 저장했을 때만 접고, 넓게 쓰는 쪽(실습실)은 폈다고 저장했을 때만 편다 — 저장 이름도 따로', () => {
    expect(sideMenuStartsOpen('default', null)).toBe(true);
    expect(sideMenuStartsOpen('narrow', 'closed')).toBe(false);
    expect(sideMenuStartsOpen('wide', null)).toBe(false);
    expect(sideMenuStartsOpen('wide', 'closed')).toBe(false);
    expect(sideMenuStartsOpen('wide', 'open')).toBe(true);
    expect(sideMenuStorageName('wide')).toBe(SIDE_MENU_WIDE_STORAGE_NAME);
    expect(sideMenuStorageName('default')).toBe(SIDE_MENU_STORAGE_NAME);
  });

  it('메뉴판 마크업: id site-menu·이름 "주 메뉴"이고, 머리글 [메뉴]가 aria-controls로 잇는다', () => {
    const menu = readFileSync('src/layouts/partials/SideMenu.astro', 'utf8');
    const header = readFileSync('src/layouts/partials/SiteHeader.astro', 'utf8');
    expect(menu).toMatch(/id="site-menu"/u);
    expect(menu).toMatch(/aria-label="주 메뉴"/u);
    expect(header).toMatch(/aria-controls="site-menu"/u);
    expect(header).not.toMatch(/<nav\b/u);
  });
});

describe('브라우저 쪽 순수 함수', () => {
  it('단원 줄 끝 글: 다 한 차시가 있을 때만 "다 한 수/전체"', () => {
    expect(fractionText({ total: 18, done: 0 })).toBe('');
    expect(fractionText({ total: 18, done: 3 })).toBe('3/18');
    expect(fractionText({ total: 0, done: 0 })).toBe('');
  });

  it('이어서 하기: 지난번 차시가 이 사이트의 따라 하기·교과서 쪽일 때만', () => {
    const state = emptyProgress();
    expect(resumeTarget(state, BASE)).toBeNull();
    const last = { id: 'u1/1-1-3', href: `${BASE}learn/u1/1-1-3/`, label: '1-1-3', title: '인공지능 인식 개발 환경', at: 1 };
    expect(resumeTarget({ ...state, last }, BASE)).toEqual({ href: last.href, name: '1-1-3 인공지능 인식 개발 환경' });
    expect(resumeTarget({ ...state, last: { ...last, href: `${BASE}book/1-1-3/` } }, BASE)?.href).toBe(`${BASE}book/1-1-3/`);
    expect(resumeTarget({ ...state, last: { ...last, href: 'https://example.com/learn/' } }, BASE)).toBeNull();
    expect(resumeTarget({ ...state, last: { ...last, href: `${BASE}labs/vision/` } }, BASE)).toBeNull();
  });

  it('이어서 하기: 지금 사이트에 없는 차시 id(지운 차시)는 쓰지 않고, 짝 없는 교과서 쪽 id는 쓴다', () => {
    const state = emptyProgress();
    const known = ['u1/1-1-1', 'u1/1-1-3'];
    const last = { id: 'u1/1-1-3', href: `${BASE}learn/u1/1-1-3/`, label: '1-1-3', title: '인공지능 인식 개발 환경', at: 1 };
    expect(resumeTarget({ ...state, last }, BASE, known)?.href).toBe(last.href);
    expect(resumeTarget({ ...state, last: { ...last, id: 'u1/9-9-9', href: `${BASE}learn/u1/9-9-9/` } }, BASE, known)).toBeNull();
    expect(resumeTarget({ ...state, last: { ...last, id: 'u1/book-front', href: `${BASE}book/front/` } }, BASE, known)?.href).toBe(`${BASE}book/front/`);
    expect(resumeTarget({ ...state, last: { ...last, id: 'u1/book-front', href: `${BASE}learn/u1/front/` } }, BASE, known)).toBeNull();
  });
});
