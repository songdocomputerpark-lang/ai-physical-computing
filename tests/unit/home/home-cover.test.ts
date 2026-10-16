// 홈 표지(HomeCover) 글과 단추(src/components/home/home-content.ts의 homeCover·homeCoverActions·homeCoverPill)와 바닥글 출처 줄 — 판 1.4.0.
// 화면에 실제로 보이는지(375×812 첫 화면에 h1·소개·단추 셋)는 브라우저 테스트(tests/e2e/home.spec.ts)가 확인한다.
import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from '../../../src/components/common/icons.ts';
import { homeCover, homeCoverActions, homeCoverPill, homeLessons, homeToc } from '../../../src/components/home/home-content.ts';
import { getPage } from '../../../src/config/nav.ts';
import { siteConfig } from '../../../src/config/site.ts';
import { footerCreditText } from '../../../src/layouts/partials/footer-columns.ts';

/** 문장 수: 마침표·물음표·느낌표 뒤 띄어쓰기로 나눈 덩어리 수 */
function countSentences(text: string): number {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/u)
    .filter((part) => part !== '').length;
}

describe('표지(homeCover)', () => {
  it('제목을 이어 읽으면 책 이름이고, 출판사·저자는 책 표지에 인쇄된 그대로다(사이트 설정과 같은 값)', () => {
    expect(homeCover.titleLines.join(' ')).toBe(siteConfig.textbook.title);
    expect(homeCover.publisher).toBe('금성출판사');
    expect(homeCover.authors).toEqual(['김석전', '박상진', '김승현', '김영준', '육동건']);
    expect(homeCover.coverAlt).toContain(siteConfig.textbook.title);
  });

  it('소개는 두 문장 안이고 책 이름을 말한다', () => {
    expect(countSentences(homeCover.lead)).toBeLessThanOrEqual(2);
    expect(homeCover.lead).toContain('인공지능과 피지컬 컴퓨팅');
  });

  it('알약의 수는 글에 적지 않고 받은 수로 만든다', () => {
    expect(homeCoverPill(32, 45)).toBe('고등학교 · 교과서 32절 · 웹 차시 45편');
    expect(homeCoverPill(30, 41)).toBe('고등학교 · 교과서 30절 · 웹 차시 41편');
  });
});

describe('표지 큰 단추(homeCoverActions)', () => {
  const actions = homeCoverActions('/ai-physical-computing/book/1-1-1/');

  it('순서는 [1단원부터 시작] · [차례 보기] · [실습실]이다', () => {
    expect(actions.map((action) => action.id)).toEqual(['start', 'toc', 'labs']);
    expect(actions.map((action) => action.label)).toEqual(['1단원부터 시작', '차례 보기', '실습실']);
  });

  it('주소: 시작은 받은 주소, 차례는 같은 쪽 #toc, 실습실은 사이트 지도의 실습실 안내', () => {
    expect(actions[0]!.href).toBe('/ai-physical-computing/book/1-1-1/');
    expect(actions[1]!.href).toBe('#toc');
    expect(actions[2]!.href).toBe(getPage('labs').href);
  });

  it('채운 파랑 주 단추는 첫 번째 하나뿐이다(C114)', () => {
    expect(actions.map((action) => action.variant)).toEqual(['primary', 'secondary', 'secondary']);
  });

  it('아이콘은 모두 사이트 아이콘 이름이다', () => {
    for (const action of actions) {
      expect((ICON_NAMES as readonly string[]).includes(action.icon), action.id).toBe(true);
    }
  });
});

describe('차례·차시 목록 글', () => {
  it('짧은 글 두 문장 안, 제목은 "차례"·"차시 목록"이다', () => {
    expect(homeToc.heading).toBe('차례');
    expect(homeLessons.heading).toBe('차시 목록');
    expect(countSentences(homeToc.lead)).toBeLessThanOrEqual(2);
    expect(countSentences(homeLessons.lead)).toBeLessThanOrEqual(2);
  });

  it('보충 차시 알약은 "웹에서 더함"이고, 보드는 "실제 보드 있으면 더 좋아요"로 알린다(가상 보드로 끝까지 할 수 있다)', () => {
    expect(homeLessons.webOnlyBadge).toBe('웹에서 더함');
    expect(homeLessons.legendBoard).toBe('실제 보드 있으면 더 좋아요');
  });
});

describe('바닥글 출처 줄(footerCreditText)', () => {
  it('교과서와 부품 사진·회로 그림의 출처를 한 줄로 알린다(글자까지 같아야 한다)', () => {
    expect(footerCreditText()).toBe(
      '교과서: 「인공지능과 피지컬 컴퓨팅」(금성출판사, 김석전·박상진·김승현·김영준·육동건). 부품 사진·회로 그림·키트 예제 코드: 고릴라셀(브릭셀) 제공, 허락받아 사용.',
    );
  });
});
