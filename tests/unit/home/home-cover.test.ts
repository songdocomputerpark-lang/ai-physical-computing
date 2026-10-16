// 홈 표지(HomeCover) 글과 단추(src/components/home/home-content.ts의 homeCover·homeCoverActions·homeCoverPill)·안심 띠(homeTrust)·단원 카드 글(homeUnits)과 바닥글 출처 줄 — 판 1.6.0(C172·C173).
// 화면에 실제로 보이는지(375×812 첫 화면에 안심 띠·h1·사람별 큰 단추 셋)는 브라우저 테스트(tests/e2e/home.spec.ts)가 확인한다.
import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from '../../../src/components/common/icons.ts';
import { homeCover, homeCoverActions, homeCoverPill, homeLessons, homeToc, homeTrust, homeUnits } from '../../../src/components/home/home-content.ts';
import { getPage } from '../../../src/config/nav.ts';
import { CAMERA_PRIVACY_BRIEF } from '../../../src/config/privacy-text.ts';
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

  it('"누가 만들었나" 줄에 부품 사진·회로 그림·예제 코드의 출처(고릴라셀 브릭셀)가 있다 — 바닥글과 같은 업체 이름', () => {
    expect(homeCover.partsCredit).toBe('부품 사진·회로 그림·예제 코드: 고릴라셀(브릭셀) 제공');
    expect(homeCover.partsCredit).toContain(siteConfig.partsProvider);
  });

  it('소개는 두 문장 안이고 책 이름을 말한다. 설치·무료는 안심 띠가 말하므로 여기서 되풀이하지 않는다', () => {
    expect(countSentences(homeCover.lead)).toBeLessThanOrEqual(2);
    expect(homeCover.lead).toContain('인공지능과 피지컬 컴퓨팅');
    expect(homeCover.lead).not.toContain('설치');
    expect(homeCover.lead).not.toContain('무료');
  });

  it('알약의 수는 글에 적지 않고 받은 수로 만든다', () => {
    expect(homeCoverPill(32, 45)).toBe('고등학교 · 교과서 32절 · 웹 차시 45편');
    expect(homeCoverPill(30, 41)).toBe('고등학교 · 교과서 30절 · 웹 차시 41편');
  });
});

describe('표지 큰 단추(homeCoverActions) — 사람으로 나눈다(C172)', () => {
  const actions = homeCoverActions('/ai-physical-computing/learn/u1/1-1-1/');

  it('순서는 [학생 처음부터 배우기] · [선생님 수업 준비] · [키트가 있어요 보드 켜기]이다', () => {
    expect(actions.map((action) => action.id)).toEqual(['start', 'teacher', 'kit']);
    expect(actions.map((action) => action.who)).toEqual(['학생', '선생님', '키트가 있어요']);
    expect(actions.map((action) => action.label)).toEqual(['처음부터 배우기', '수업 준비', '보드 켜기']);
  });

  it('주소: 학생은 받은 주소(실습이 있는 따라 하기 쪽), 선생님은 교사용 시작하기, 키트는 보드 준비하기', () => {
    expect(actions[0]!.href).toBe('/ai-physical-computing/learn/u1/1-1-1/');
    expect(actions[1]!.href).toBe(getPage('start-teacher').href);
    expect(actions[1]!.href).toMatch(/\/start\/teacher\/$/u);
    expect(actions[2]!.href).toBe(getPage('start-board').href);
    expect(actions[2]!.href).toMatch(/\/start\/board\/$/u);
  });

  it('채운 파랑 주 단추는 학생 하나뿐이다(C114)', () => {
    expect(actions.map((action) => action.variant)).toEqual(['primary', 'secondary', 'secondary']);
  });

  it('진도가 있을 때 "이어서 하기"로 바뀌는 학생 단추의 글(시작·이어서)이 homeCover에 있다', () => {
    expect(actions[0]!.label).toBe(homeCover.startLabel);
    expect(homeCover.resumeLabel).toBe('이어서 하기');
  });

  it('아이콘은 모두 사이트 아이콘 이름이다', () => {
    for (const action of actions) {
      expect((ICON_NAMES as readonly string[]).includes(action.icon), action.id).toBe(true);
    }
  });
});

describe('안심 띠(homeTrust) — 3초 안에 네 가지(C172)', () => {
  it('설치 없음 · 무료 · 보드 없어도 됨 · 카메라 영상은 내 컴퓨터 밖으로 안 나감, 이 순서', () => {
    expect(homeTrust.items.map((item) => item.text)).toEqual(['설치 없음', '무료', '보드 없어도 됨', '카메라 영상은 내 컴퓨터 밖으로 안 나감']);
    expect(homeTrust.items.map((item) => item.id)).toEqual(['install', 'free', 'no-board', 'camera']);
  });

  it('카메라 문장은 개인정보 문장 한 곳(privacy-text.ts)에서 온다', () => {
    expect(homeTrust.items[3]!.text).toBe(CAMERA_PRIVACY_BRIEF);
  });

  it('칸마다 아이콘이 있고 모두 사이트 아이콘 이름이다(아이콘은 꾸밈 — 글이 뜻을 전한다)', () => {
    for (const item of homeTrust.items) {
      expect((ICON_NAMES as readonly string[]).includes(item.icon), item.id).toBe(true);
      expect(item.text.length, item.id).toBeGreaterThan(0);
    }
    expect(new Set(homeTrust.items.map((item) => item.icon)).size).toBe(4);
  });

  it('띠 전체의 이름이 있다(화면 낭독기용 랜드마크 이름)', () => {
    expect(homeTrust.label).toBe('이 사이트는');
  });
});

describe('단원 4장 카드 글(homeUnits)', () => {
  it('제목은 질문 한 줄이고 설명은 한 문장이다(학부모가 아이가 무엇을 배우는지 안다 — walk-parent-browse)', () => {
    expect(homeUnits.heading).toBe('무엇을 배우나요?');
    expect(countSentences(homeUnits.lead)).toBeLessThanOrEqual(2);
    expect(homeUnits.lead).toContain('인공지능');
    expect(homeUnits.lead).toContain('보드');
  });

  it('단추 글은 "열기"(진도가 있으면 "이어서 하기"·"다시 보기")이고 단원 이름이 앞에 붙는다', () => {
    expect([homeUnits.openLabel, homeUnits.resumeLabel, homeUnits.replayLabel]).toEqual(['열기', '이어서 하기', '다시 보기']);
  });

  it('편 수는 "13편", 웹에서 더한 편 수는 "그중 웹에서 더함 5편"(알약이 아니라 글자)', () => {
    expect(homeUnits.countText(13)).toBe('13편');
    expect(homeUnits.webOnlyText(5)).toBe('그중 웹에서 더함 5편');
  });

  it('전체 목록 링크는 따라 하기로 간다는 것을 알린다', () => {
    expect(homeUnits.allLinkLabel).toBe('차시 전체 목록 보기');
    expect(getPage('learn').label).toBe('따라 하기');
  });
});

describe('차례·차시 목록 글', () => {
  it('차례 제목은 "차례"이고 짧은 글 두 문장 안이다(옛 차시 목록 글도 그대로 있다)', () => {
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
