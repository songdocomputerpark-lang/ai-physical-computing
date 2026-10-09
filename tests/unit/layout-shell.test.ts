// 공통 틀 검수 1차 고침(판 1.3.0 R1-003·R1-007·R1-009·R1-010)을 원문으로 고정한다. 화면 확인은 tests/e2e/smoke.spec.ts "쪽 틀 정렬·카드 격자·바닥글 높이".
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getPage } from '../../src/config/nav.ts';

const css = readFileSync('src/styles/global.css', 'utf8');
const footer = readFileSync('src/layouts/partials/SiteFooter.astro', 'utf8');

describe('R1-003 쪽 칸 폭', () => {
  it('글 읽기(narrow) 쪽도 칸 자체 폭은 기본과 같다: .page--narrow .page__inner가 --page-width를 바꾸지 않는다', () => {
    expect(css).not.toMatch(/\.page--narrow\s+\.page__inner\s*\{/u);
  });

  it('글 읽기 폭(--width-prose)은 본문 덩어리에만 걸고, 쪽 제목·교사용 자료실 메뉴는 칸 폭을 다 쓴다', () => {
    const rule = css.match(/\.page--narrow \.page__main > :where\(([^{]*)\)\s*\{\s*max-width:\s*var\(--width-prose\)/u);
    expect(rule?.[1]).toContain('.page-title');
    expect(rule?.[1]).toContain('.teacher-nav');
  });
});

describe('R1-007 카드 격자 균형', () => {
  it('4~7장일 때 열 수를 정하는 규칙이 있고 5장은 2열에서 마지막 카드를 한 줄로 늘린다', () => {
    for (const count of [4, 5, 6, 7]) {
      expect(css).toContain(`:has(> :nth-child(${count}):last-child)`);
    }
    expect(css).toMatch(/:has\(> :nth-child\(5\):last-child\) > :last-child,[^{]*\{\s*grid-column: 1 \/ -1;/u);
  });

  it('쪽·컴포넌트 안의 격자(교과서 보충·교사용 자료 카드)도 같은 규칙을 받는다', () => {
    expect(css).toMatch(/:is\([^)]*\.unit-outline__cards[^)]*\.teacher-cards[^)]*\)/u);
  });
});

describe('R1-009 바닥글', () => {
  it('필수 문구(만든 사람·라이선스 두 줄·제외 문구·출처 링크·저장소 링크)와 판 줄 원문이 그대로다', () => {
    expect(footer).toContain('data-site-version={siteConfig.version}>버전 {siteConfig.version}</span>');
    expect(footer).toContain('만든 사람: {siteConfig.author}');
    expect(footer).toContain('{exclusion} 해당 자료는 <a href={withBase(\'credits/\')}>출처와 라이선스</a>');
    expect(footer).toContain('GitHub 저장소');
    expect(footer).toContain('문제 알리기(GitHub Issues)');
    expect(footer.match(/<li>\s*(학습 자료|사이트 프로그램과 예제 코드):/gu)).toHaveLength(2);
  });

  it('사이트 지도는 한 묶음이 한 줄(넓은 화면 제목 옆)로 쌓이고 5열 격자는 없다', () => {
    expect(footer).not.toMatch(/repeat\(5,/u);
    expect(footer).toMatch(/\.site-footer__children\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap/u);
  });
});

describe('R1-010 점검 쪽 이름', () => {
  it('/start/check/의 이름(label)과 쪽 제목(title)은 "내 컴퓨터 점검" 하나다', () => {
    const page = getPage('start-check');
    expect(page.label).toBe('내 컴퓨터 점검');
    expect(page.title).toBe('내 컴퓨터 점검');
    expect(page.description).toContain('학교 네트워크');
  });
});
