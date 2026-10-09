// 대단원 소개 글(src/components/lesson/unit-about.ts, 판 1.3.0 R1-083·R1-084) — 할 수 있는 것 3줄, 큰 그림 속 자리, 걸리는 시간.
import { describe, expect, it } from 'vitest';
import {
  FLOW_STAGES,
  UNIT_ABOUT,
  flowRoleText,
  getUnitAbout,
  isStageOfUnit,
  unitDurationText,
} from '../../../src/components/lesson/unit-about.ts';
import { homeMap } from '../../../src/components/home/home-content.ts';

describe('UNIT_ABOUT — 대단원마다 할 수 있는 것 3줄과 큰 그림 속 자리', () => {
  it('대단원 4개 모두 있고, 할 수 있는 것은 3줄이며 "~ 수 있어요."로 끝난다', () => {
    for (const unit of [1, 2, 3, 4] as const) {
      const about = getUnitAbout(unit);
      expect(about.outcomes, `${unit}단원`).toHaveLength(3);
      for (const line of about.outcomes) {
        expect(line).toMatch(/수 있어요\.$/u);
      }
    }
  });

  it('큰 그림 단계 이름은 홈 흐름 그림과 같다(보고 → 판단하고 → 움직여요)', () => {
    expect(FLOW_STAGES.map((stage) => stage.label)).toEqual(['보고', '판단하고', '움직여요']);
  });

  it('단원 몫(모두 -기 꼴, 홈 칩과 같은 글 R3-012): I 보고 판단하기 · II 움직이기 · III 잇기 · IV 합치기', () => {
    expect(UNIT_ABOUT[1].role).toBe('보고 판단하기');
    expect(UNIT_ABOUT[2].role).toBe('움직이기');
    expect(UNIT_ABOUT[3].role).toBe('잇기');
    expect(UNIT_ABOUT[4].role).toBe('합치기');
    expect(isStageOfUnit(1, 'see')).toBe(true);
    expect(isStageOfUnit(1, 'act')).toBe(false);
    expect(isStageOfUnit(2, 'act')).toBe(true);
    expect(isStageOfUnit(2, 'see')).toBe(false);
    expect(isStageOfUnit(3, 'judge')).toBe(true);
    expect(isStageOfUnit(3, 'act')).toBe(true);
    expect(isStageOfUnit(3, 'see')).toBe(false);
    for (const stage of FLOW_STAGES) {
      expect(isStageOfUnit(4, stage.id)).toBe(true);
    }
  });

  it('차시 머리 단원 몫과 홈 배움 지도 칩은 같은 글이다(R3-012)', () => {
    for (const unit of [1, 2, 3, 4] as const) {
      expect(UNIT_ABOUT[unit].role, `${unit}단원`).toBe(homeMap.stages[unit]);
    }
  });

  it('flowRoleText: 한 줄 안내', () => {
    expect(flowRoleText(1)).toBe('이 단원은 큰 그림의 "보고 판단하기" 칸이에요.');
    expect(flowRoleText(3)).toBe('이 단원은 큰 그림의 "잇기" 칸이에요.');
  });

  it('학교 이름·개인 경로·이메일·전화번호 모양이 없다', () => {
    const text = JSON.stringify(UNIT_ABOUT);
    expect(text).not.toMatch(/@|https?:|[A-Za-z]:\|\d{2,3}-\d{3,4}-\d{4}/u);
  });
});

describe('unitDurationText — 걸리는 시간', () => {
  it('모두 같은 시간이면 "18차시 × 50분 = 15시간"', () => {
    expect(unitDurationText(Array.from({ length: 18 }, () => 50))).toBe('18차시 × 50분 = 15시간');
    expect(unitDurationText([50, 50, 50])).toBe('3차시 × 50분 = 2시간 30분');
    expect(unitDurationText([50])).toBe('1차시 × 50분 = 50분');
  });

  it('시간이 다르면 합만, 적지 않은 차시는 합에서 뺀다', () => {
    expect(unitDurationText([50, 100, 50])).toBe('3차시, 모두 약 3시간 20분');
    expect(unitDurationText([50, undefined, 50])).toBe('2차시 × 50분 = 1시간 40분(시간이 정해지지 않은 1차시는 빼고 셌어요)');
  });

  it('시간을 적은 차시가 없으면 undefined', () => {
    expect(unitDurationText([])).toBeUndefined();
    expect(unitDurationText([undefined, undefined])).toBeUndefined();
  });
});
