import { describe, expect, it } from 'vitest';
import {
  TOOLTIP_GAP,
  VIEWPORT_MARGIN,
  computeTooltipPosition,
  isAnchorVisible,
} from '../../../src/components/glossary/tooltip-position.ts';

/** 375×812 휴대폰 화면(P1-05 기준 크기) */
const PHONE = { width: 375, height: 812 };

function rect(left: number, top: number, width = 40, height = 24) {
  return { left, top, right: left + width, bottom: top + height };
}

describe('툴팁 위치 계산(src/components/glossary/tooltip-position.ts)', () => {
  it('위 자리가 넉넉하면 용어 바로 위에 왼쪽 끝을 맞춰 놓는다(읽던 문장의 다음 줄을 가리지 않게)', () => {
    expect(computeTooltipPosition(rect(100, 200), { width: 200, height: 80 }, PHONE)).toEqual({
      top: 200 - TOOLTIP_GAP - 80,
      left: 100,
      placement: 'above',
    });
  });

  it('위 자리가 모자라면(화면 맨 위 근처의 용어) 용어 아래에 놓는다', () => {
    expect(computeTooltipPosition(rect(100, 40), { width: 200, height: 80 }, PHONE)).toEqual({
      top: 40 + 24 + TOOLTIP_GAP,
      left: 100,
      placement: 'below',
    });
  });

  it('위·아래 모두 모자라면 더 넓은 쪽에 놓는다', () => {
    const tall = { width: 200, height: 700 };
    expect(computeTooltipPosition(rect(100, 760), tall, PHONE).placement).toBe('above');
    expect(computeTooltipPosition(rect(100, 30), tall, PHONE).placement).toBe('below');
  });

  it('오른쪽·왼쪽 가장자리를 넘으면 여백만큼 안쪽으로 밀어 넣는다', () => {
    expect(computeTooltipPosition(rect(330, 100), { width: 300, height: 80 }, PHONE).left).toBe(
      PHONE.width - VIEWPORT_MARGIN - 300,
    );
    expect(computeTooltipPosition(rect(-20, 100), { width: 200, height: 80 }, PHONE).left).toBe(VIEWPORT_MARGIN);
  });

  it('툴팁이 화면보다 넓거나 높으면 왼쪽 위 여백에 맞춘다', () => {
    expect(computeTooltipPosition(rect(50, 400), { width: 500, height: 900 }, PHONE)).toEqual({
      top: VIEWPORT_MARGIN,
      left: VIEWPORT_MARGIN,
      placement: 'above',
    });
  });

  it('용어가 화면 밖으로 완전히 나가면 보이지 않는 것으로 본다', () => {
    expect(isAnchorVisible(rect(10, -30), PHONE)).toBe(false);
    expect(isAnchorVisible(rect(10, -10), PHONE)).toBe(true);
    expect(isAnchorVisible(rect(10, PHONE.height), PHONE)).toBe(false);
    expect(isAnchorVisible(rect(-50, 10), PHONE)).toBe(false);
  });

  // R2-022: 위에 놓으면 바로 위 소제목("핵심 개념")을 덮던 문제
  it('위에 놓으면 소제목을 덮을 때는 아래 자리가 넉넉하면 아래에 놓고, 소제목이 없으면 그대로 위에 놓는다', () => {
    const heading = { top: 150, bottom: 180 };
    expect(computeTooltipPosition(rect(100, 200), { width: 200, height: 80 }, PHONE, undefined, undefined, [heading]).placement).toBe('below');
    expect(computeTooltipPosition(rect(100, 200), { width: 200, height: 80 }, PHONE, undefined, undefined, [{ top: 20, bottom: 40 }]).placement).toBe('above');
    // 아래에도 소제목이 있으면 원래대로 위
    expect(
      computeTooltipPosition(rect(100, 200), { width: 200, height: 80 }, PHONE, undefined, undefined, [heading, { top: 250, bottom: 280 }]).placement,
    ).toBe('above');
  });
});
