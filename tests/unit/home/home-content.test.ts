// 홈 화면 글·링크(src/components/home/home-content.ts)와 흐름 그림 움직임 규칙(flow-motion.ts) 단위 테스트.
// 화면에 실제로 보이는지는 브라우저 테스트(tests/e2e/home.spec.ts)가 확인한다.
import { describe, expect, it } from 'vitest';
import {
  canAnimate,
  FLOW_TOGGLE_LABELS,
  nextStateOnToggle,
  parseFlowState,
  toggleLabel,
} from '../../../src/components/home/flow-motion.ts';
import {
  COMING_SOON_BADGE,
  flowFigure,
  homeActions,
  homeFeatures,
  homeHero,
  homePrinciples,
} from '../../../src/components/home/home-content.ts';
import { flattenPages, getPage, learnUnits } from '../../../src/config/nav.ts';
import { siteConfig } from '../../../src/config/site.ts';

/** 문장 수: 마침표·물음표·느낌표 뒤 띄어쓰기로 나눈 덩어리 수 */
function countSentences(text: string): number {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/u)
    .filter((part) => part !== '').length;
}

const SITE_PATHS = new Set(flattenPages().map((page) => page.href));

describe('홈 첫 화면 글과 큰 버튼(home-content.ts)', () => {
  it('큰 버튼은 SPEC §5의 이름 그대로 3개이고 순서도 같다', () => {
    expect(homeActions.map((action) => action.label)).toEqual(['카메라로 바로 해보기', '가상 ESP32 켜보기', '내 보드 연결하기']);
  });

  it('버튼은 영상처리 실습실, ESP32 실습실, 보드 준비 페이지로 간다', () => {
    expect(homeActions.map((action) => action.pageId)).toEqual(['labs-vision', 'labs-esp32', 'start-board']);
    for (const action of homeActions) {
      expect(action.href).toBe(getPage(action.pageId).href);
      expect(SITE_PATHS.has(action.href), action.href).toBe(true);
    }
  });

  it('주소는 사이트 지도가 만든 것이라 base가 한 번만 붙고 /로 끝난다', () => {
    const base = `${siteConfig.base}/`;
    for (const action of homeActions) {
      expect(action.href.startsWith(base), action.href).toBe(true);
      expect(action.href.indexOf(base, 1), action.href).toBe(-1);
      expect(action.href.endsWith('/'), action.href).toBe(true);
    }
  });

  it('처음 온 학생에게 먼저 권하는 [카메라로 바로 해보기]만 주요 버튼이다', () => {
    expect(homeActions.map((action) => action.variant)).toEqual(['primary', 'secondary', 'secondary']);
  });

  it('아직 자리 페이지로 가는 실습실 버튼 2개에는 "준비 중" 표시가 붙고, 보드 준비 버튼에는 붙지 않는다', () => {
    expect(homeActions.filter((action) => action.status === 'coming-soon').map((action) => action.id)).toEqual(['camera', 'virtual-board']);
    expect(COMING_SOON_BADGE).toBe('준비 중');
  });

  it('버튼 식별자가 겹치지 않고, 버튼 설명은 좁은 휴대폰에서도 한 줄에 들어갈 만큼 짧다', () => {
    /**
     * 글자 폭 어림값: 한글 한 글자 = 1, 영문·숫자 = 0.75, 띄어쓰기·문장 부호 = 0.3.
     * 2026-09-16 측정(Pretendard 15px): 한글 약 13.0px, 영문 대문자 약 9.7px, 띄어쓰기 약 3.7px.
     * 버튼 설명 칸 폭은 화면 폭 − 160px(360px 화면에서 200px)이고, 21rem(336px)보다 좁은 화면에서는 설명 줄을 숨긴다
     * (HomeHero.astro). 그래서 336px 화면의 칸 176px ÷ 13.0px ≈ 13.5를 한도로 둔다.
     * 실제로 "보드가 없어도 화면 속 보드로 해요"(어림값 15.5, 측정 200.3px)는 360px 화면에서 두 줄로 넘쳤다.
     */
    const estimateTextWidth = (text: string): number =>
      [...text].reduce((width, char) => {
        if (/\p{Script=Hangul}/u.test(char)) {
          return width + 1;
        }
        return width + (/[A-Za-z0-9]/u.test(char) ? 0.75 : 0.3);
      }, 0);

    expect(new Set(homeActions.map((action) => action.id)).size).toBe(homeActions.length);
    expect(estimateTextWidth('보드가 없어도 화면 속 보드로 해요')).toBeGreaterThan(13.5);
    for (const action of homeActions) {
      expect(action.hint.length, action.label).toBeGreaterThan(0);
      expect(estimateTextWidth(action.hint), action.hint).toBeLessThanOrEqual(13.5);
    }
  });

  it('제목은 "보고, 판단하고, 움직이는"으로 시작하고, 소개는 한 문장이며 과목 이름과 ESP32 풀이가 있다', () => {
    expect(homeHero.titleLines.join(' ')).toBe('보고, 판단하고, 움직이는 인공지능을 만들어요');
    expect(countSentences(homeHero.lead)).toBe(1);
    expect(homeHero.lead.endsWith('.')).toBe(true);
    expect(homeHero.lead).toMatch(/ESP32 보드\([^)]+\)/u);
    expect(homeHero.lead).toContain('설치 없이');
    // 첫 화면에서 어떤 과목의 사이트인지 알 수 있게(SPEC §5 "30초 안에 이해", 2026-09-16 검토 반영)
    expect(homeHero.lead).toContain('인공지능과 피지컬 컴퓨팅');
  });
});

describe('흐름 그림 글(home-content.ts)', () => {
  it('단계는 보고 → 판단하고 → 움직여요 3개이고 설명이 있다', () => {
    expect(flowFigure.steps.map((step) => step.label)).toEqual(['보고', '판단하고', '움직여요']);
    expect(flowFigure.steps.map((step) => step.id)).toEqual(['see', 'judge', 'act']);
    for (const step of flowFigure.steps) {
      expect(step.detail.length, step.label).toBeGreaterThan(0);
    }
  });

  it('화면 낭독기용 이름이 있고 설명은 3문장 이내다', () => {
    expect(flowFigure.title.length).toBeGreaterThan(0);
    expect(countSentences(flowFigure.description)).toBeLessThanOrEqual(3);
  });
});

describe('아래쪽 카드와 원칙(home-content.ts)', () => {
  it('카드는 3~4개이고 배우기·실습실·교사용 자료실을 포함한다', () => {
    expect(homeFeatures.cards.length).toBeGreaterThanOrEqual(3);
    expect(homeFeatures.cards.length).toBeLessThanOrEqual(4);
    expect(homeFeatures.cards.map((card) => card.pageId)).toEqual(expect.arrayContaining(['learn', 'labs', 'teacher']));
  });

  it('카드 제목·주소는 사이트 지도를 따르고, 들어 있는 것이 적혀 있다', () => {
    for (const card of homeFeatures.cards) {
      const page = getPage(card.pageId);
      expect(card.title).toBe(page.title);
      expect(card.href).toBe(page.href);
      expect(card.items.length, card.title).toBeGreaterThan(0);
      expect(countSentences(card.description), card.title).toBeLessThanOrEqual(3);
    }
  });

  it('배우기 카드는 대단원 네 개를 교과서 차례대로 보여 준다', () => {
    const learn = homeFeatures.cards.find((card) => card.pageId === 'learn');
    expect(learn?.items).toEqual(learnUnits.map((unit) => unit.label));
  });

  it('원칙은 3개이고, 문단마다 3문장 이내이며, 점검 페이지로 가는 링크가 있다', () => {
    expect(homePrinciples.items).toHaveLength(3);
    for (const item of homePrinciples.items) {
      expect(countSentences(item.body), item.title).toBeLessThanOrEqual(3);
      expect(item.body.endsWith('.'), item.title).toBe(true);
    }
    expect(homePrinciples.browserNote.href).toBe(getPage('start-check').href);
    expect(countSentences(homePrinciples.browserNote.text)).toBe(1);
  });
});

describe('흐름 그림 움직임 규칙(flow-motion.ts)', () => {
  it('움직이는 중에는 [그림 멈추기], 그 밖의 상태에서는 [그림 다시 보기]를 보인다', () => {
    expect(toggleLabel('playing')).toBe(FLOW_TOGGLE_LABELS.pause);
    for (const state of ['static', 'paused', 'ended'] as const) {
      expect(toggleLabel(state), state).toBe(FLOW_TOGGLE_LABELS.replay);
    }
    expect(FLOW_TOGGLE_LABELS).toEqual({ pause: '그림 멈추기', replay: '그림 다시 보기' });
  });

  it('버튼을 누르면 움직이는 중은 멈추고, 멈춘 그림은 처음부터 다시 움직인다', () => {
    expect(nextStateOnToggle('playing')).toBe('paused');
    for (const state of ['static', 'paused', 'ended'] as const) {
      expect(nextStateOnToggle(state), state).toBe('playing');
    }
  });

  it('운영체제나 사이트에서 움직임을 줄이면 저절로 움직이지 않는다', () => {
    expect(canAnimate({ prefersReducedMotion: false })).toBe(true);
    expect(canAnimate({ prefersReducedMotion: false, siteMotion: null })).toBe(true);
    expect(canAnimate({ prefersReducedMotion: true })).toBe(false);
    expect(canAnimate({ prefersReducedMotion: false, siteMotion: 'reduce' })).toBe(false);
  });

  it('모르는 상태 글자는 움직이지 않는 완성 그림(static)으로 본다', () => {
    expect(parseFlowState('playing')).toBe('playing');
    expect(parseFlowState('paused')).toBe('paused');
    expect(parseFlowState('ended')).toBe('ended');
    expect(parseFlowState('static')).toBe('static');
    expect(parseFlowState(undefined)).toBe('static');
    expect(parseFlowState('running')).toBe('static');
  });
});
