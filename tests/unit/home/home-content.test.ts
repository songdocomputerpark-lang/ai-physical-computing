// 홈 화면 글·링크(src/components/home/home-content.ts) 단위 테스트.
// 판 1.9.3: 옛 첫 화면(HomeHero·흐름 그림·flow-motion.ts)을 지우며 그 글을 지키던 앞 절반 시험도 걷었다(미해결 291).
// 화면에 실제로 보이는지는 브라우저 테스트(tests/e2e/home.spec.ts)가 확인한다.
import { describe, expect, it } from 'vitest';
import {
  homeCover,
  homeCoverActions,
  homeMap,
  homePrinciples,
  homeResume,
  homeSearch,
  homeShortcuts,
  homeUnits,
} from '../../../src/components/home/home-content.ts';
import { ICON_NAMES } from '../../../src/components/common/icons.ts';
import { flattenPages, getPage } from '../../../src/config/nav.ts';

/** 문장 수: 마침표·물음표·느낌표 뒤 띄어쓰기로 나눈 덩어리 수 */
function countSentences(text: string): number {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/u)
    .filter((part) => part !== '').length;
}

const SITE_PATHS = new Set(flattenPages().map((page) => page.href));

describe('이어서 하기·큰 검색·단원 글(home-content.ts)', () => {
  it('이어서 하기 띠 글: 머리는 "지난번 이어서", 차시 칸(이어서 하기, 끝낸 차시면 다시 보기), 다음 차시 칸(시작하기), 실습실 칸(다시 열기)', () => {
    expect(homeResume.heading).toBe('지난번 이어서');
    expect(homeResume.lesson.go).toBe('이어서 하기');
    expect(homeResume.lesson.goDone).toBe('다시 보기');
    expect(homeResume.next.go).toBe('시작하기');
    expect(homeResume.next.kicker).toBe('다음에 볼 차시');
    expect(homeResume.lab.go).toBe('다시 열기');
    expect(homeResume.lesson.kicker.length).toBeGreaterThan(0);
    expect(homeResume.lab.kicker.length).toBeGreaterThan(0);
  });

  it('큰 검색 제목은 "무엇을 찾나요?"다', () => {
    expect(homeSearch.heading).toBe('무엇을 찾나요?');
  });

  it('단원 카드 단추 글은 띠와 같은 말이다(같은 행동은 같은 말, R3-006) — "열기"·"이어서 하기"·"다시 보기"', () => {
    expect([homeUnits.openLabel, homeUnits.resumeLabel, homeUnits.replayLabel]).toEqual(['열기', '이어서 하기', '다시 보기']);
    expect(homeUnits.resumeLabel).toBe(homeResume.lesson.go);
    expect([homeUnits.openLabel, homeUnits.resumeLabel]).not.toContain('시작하기');
    expect(homeResume.lesson.kicker).toBe('지난번에 열어 본 차시');
  });

  it('단원 몫 글: 네 단원이 서로 다른 "-기" 꼴 낱말이다(R1-025·R3-012) — 차시 머리와 같은 글', () => {
    expect([1, 2, 3, 4].map((unit) => homeMap.stages[unit as 1 | 2 | 3 | 4])).toEqual(['보고 판단하기', '움직이기', '잇기', '합치기']);
    for (const unit of [1, 2, 3, 4]) {
      expect(homeMap.stages[unit as 1 | 2 | 3 | 4], `${unit}단원 단계 칩`).toMatch(/기$/u);
    }
  });
});

describe('바로 가기 타일과 원칙(home-content.ts)', () => {
  it('타일은 9개이고 실습실 4개·예제 갤러리·오류 사전·용어사전·교사용 자료실·점검을 담는다', () => {
    expect(homeShortcuts.items.map((item) => item.pageId)).toEqual([
      'labs-vision',
      'labs-esp32',
      'labs-iot',
      'labs-unit4',
      'labs-gallery',
      'help-errors',
      'glossary',
      'teacher',
      'start-check',
    ]);
  });

  it('타일 주소는 사이트 지도를 따르고(모두 실제 페이지), 이름과 아이콘이 있으며, 이름이 겹치지 않는다', () => {
    for (const item of homeShortcuts.items) {
      expect(item.href, item.pageId).toBe(getPage(item.pageId).href);
      expect(SITE_PATHS.has(item.href), item.href).toBe(true);
      expect(item.label.length, item.pageId).toBeGreaterThan(0);
      expect(ICON_NAMES as readonly string[], item.pageId).toContain(item.icon);
    }
    expect(new Set(homeShortcuts.items.map((item) => item.label)).size).toBe(homeShortcuts.items.length);
  });

  it('타일 이름이 표지 큰 단추 이름과 겹치지 않는다(홈에서 같은 이름의 링크가 둘이 되지 않게)', () => {
    const buttonNames = [...homeCoverActions('/learn/u1/1-1-1/').map((action) => action.label), homeCover.resumeLabel];
    for (const item of homeShortcuts.items) {
      for (const name of buttonNames) {
        expect(item.label.includes(name) || name.includes(item.label), `${item.label} / ${name}`).toBe(false);
      }
    }
  });

  it('실습실 타일 4개는 1~4단원 색을 하나씩 쓴다', () => {
    const units = homeShortcuts.items.filter((item) => item.pageId.startsWith('labs-') && item.unit !== undefined).map((item) => item.unit);
    expect(units).toEqual([1, 2, 3, 4]);
  });

  it('원칙은 3개이고, 문단마다 3문장 이내이며, 점검 페이지로 가는 링크가 있다', () => {
    expect(homePrinciples.items).toHaveLength(3);
    for (const item of homePrinciples.items) {
      expect(countSentences(item.body), item.title).toBeLessThanOrEqual(3);
      expect(item.body.endsWith('.'), item.title).toBe(true);
      expect(ICON_NAMES as readonly string[], item.title).toContain(item.icon);
    }
    expect(homePrinciples.browserNote.href).toBe(getPage('start-check').href);
    // 판 1.7.0(미해결 263 #6): 휴대폰으로 되는 범위(읽기)와 안 되는 범위(실습)를 한 줄에 — 보호자 안내와 같은 말
    expect(countSentences(homePrinciples.browserNote.text)).toBe(2);
    expect(homePrinciples.browserNote.text).toContain('읽기는 휴대폰도 돼요');
    expect(homePrinciples.browserNote.text).toContain('실습은 컴퓨터');
    expect(homePrinciples.browserNote.text).not.toContain('권장');
  });
});
