// 바닥글 사이트 지도 묶음(src/layouts/partials/footer-columns.ts)과 머리글 메뉴 아이콘 약속 검사(판 1.3.0).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isIconName } from '../../src/components/common/icons.ts';
import { flattenPages, headerNav, learnUnits } from '../../src/config/nav.ts';
import { footerColumns } from '../../src/layouts/partials/footer-columns.ts';

const footerHrefs = footerColumns.flatMap((column) => [...(column.href ? [column.href] : []), ...column.links.map((link) => link.href)]);

describe('바닥글 사이트 지도 묶음', () => {
  it('다섯 묶음이고 순서가 정해져 있다', () => {
    expect(footerColumns.map((column) => column.id)).toEqual(['start', 'learn', 'labs', 'help', 'site']);
    expect(footerColumns.map((column) => column.title)).toEqual(['시작하기', '따라 하기', '실습실', '문제 해결', '사이트 정보']);
  });

  it('홈을 뺀 사이트 지도의 쪽과 대단원 I~IV가 한 번 이상 나온다(머리글 하위 쪽 포함)', () => {
    const missing = [...flattenPages(), ...learnUnits]
      .filter((page) => page.id !== 'home')
      // 두 단계 아래 쪽(실물 점검 도우미·대시보드)은 위 쪽(ESP32·통신 실습실) 안에서 이어진다.
      .filter((page) => page.path.split('/').filter(Boolean).length <= 2 || page.id.startsWith('learn-u'))
      .filter((page) => !footerHrefs.includes(page.href));
    expect(missing.map((page) => page.path)).toEqual([]);
  });

  it('같은 묶음 안에서 주소가 겹치지 않고, 모든 주소는 base로 시작해 /로 끝난다', () => {
    for (const column of footerColumns) {
      const hrefs = column.links.map((link) => link.href);
      expect(new Set(hrefs).size, column.id).toBe(hrefs.length);
    }
    for (const href of footerHrefs) {
      expect(href).toMatch(/^\/ai-physical-computing\/.+\/$/u);
    }
  });

  it('묶음 제목과 모든 링크에 글자가 있다', () => {
    for (const column of footerColumns) {
      expect(column.title.length).toBeGreaterThan(0);
      for (const link of column.links) {
        expect(link.label.length, column.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('사이트 지도의 아이콘(nav.ts icon)', () => {
  it('모든 쪽과 대단원에 icons.ts에 있는 아이콘 이름이 있다', () => {
    for (const page of [...flattenPages(), ...learnUnits]) {
      expect(isIconName(page.icon), `${page.id}: ${page.icon}`).toBe(true);
    }
  });

  it('주요 일곱 곳(headerNav — 판 1.9.0부터 왼쪽 메뉴판의 큰 줄)의 아이콘은 서로 다르다(아이콘만 봐도 구분 — 판 1.4.0: 교과서는 닫힌 책 textbook)', () => {
    const icons = headerNav.map((page) => page.icon);
    expect(new Set(icons).size).toBe(icons.length);
    expect(icons).toEqual(['flag', 'textbook', 'book', 'flask', 'teacher', 'lifebuoy', 'glossary']);
  });
});

describe('머리글·바닥글 마크업 약속(원문)', () => {
  const header = readFileSync('src/layouts/partials/SiteHeader.astro', 'utf8');

  it('머리글 차례는 이름 → [메뉴] → 검색 상자이고, 주 메뉴(링크 목록)는 머리글에 없다(판 1.9.0 — 왼쪽 메뉴판 SideMenu.astro로 옮김, C238)', () => {
    const brand = header.indexOf('class="site-header__brand"');
    const button = header.indexOf('data-menu-button');
    const search = header.indexOf('<div class="site-header__search">');
    expect(brand).toBeGreaterThan(0);
    expect(button).toBeGreaterThan(brand);
    expect(search).toBeGreaterThan(button);
    expect(header).not.toMatch(/id="site-menu"/u);
  });

  it('머리글은 화면에 붙지 않는다(sticky 없음 — 초점 가림·좁은 화면 공간 때문)', () => {
    expect(header).not.toMatch(/position:\s*sticky/u);
  });

  it('주 메뉴 단추 이름은 "메뉴" 그대로고 aria-controls로 메뉴판(#site-menu)과 이어진다', () => {
    expect(header).toMatch(/aria-controls="site-menu"/u);
    expect(header).toMatch(/<span class="site-header__menu-label">메뉴<\/span>/u);
    expect(readFileSync('src/layouts/partials/SideMenu.astro', 'utf8')).toMatch(/id="site-menu" aria-label="주 메뉴"/u);
  });
});
