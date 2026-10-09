// 실습실 안내(/labs/)의 카드·"무엇을 할까요?" 고르기 내용(src/pages/labs/_lab-cards.ts) — 판 1.3.0.
// 사이트 지도의 실습실마다 카드 정보가 있는지, 아이콘 이름이 진짜인지, 고르기가 지도의 쪽으로 가는지를 고정한다.
import { describe, expect, it } from 'vitest';
import { isIconName } from '../../../src/components/common/icons.ts';
import { getPage } from '../../../src/config/nav.ts';
import { LAB_CARD_INFO, LAB_CHOICES, labCardInfo } from '../../../src/pages/labs/_lab-cards.ts';
import { getLabPlan } from '../../../src/pages/labs/_labs.ts';

describe('실습실 카드 정보', () => {
  const labs = getPage('labs').children;

  it('사이트 지도의 실습실마다 정확히 한 항목이 있다', () => {
    expect(LAB_CARD_INFO.map((info) => info.id).sort()).toEqual(labs.map((lab) => lab.id).sort());
    for (const lab of labs) {
      expect(labCardInfo(lab.id), lab.id).toBeDefined();
    }
  });

  it('아이콘 이름은 모두 Icon 표에 있다', () => {
    for (const info of LAB_CARD_INFO) {
      expect(isIconName(info.icon), `${info.id} 카드 아이콘`).toBe(true);
      for (const need of info.needs) {
        expect(isIconName(need.icon), `${info.id} 칩 ${need.text}`).toBe(true);
      }
    }
    for (const choice of LAB_CHOICES) {
      expect(isIconName(choice.icon), choice.ask).toBe(true);
    }
  });

  it('"이럴 때 써요" 한 줄은 …할 때로 끝나고, 필요한 것 칩은 1~3개이며 짧다', () => {
    for (const info of LAB_CARD_INFO) {
      expect(info.useWhen, info.id).toMatch(/때$/u);
      expect(info.needs.length, info.id).toBeGreaterThanOrEqual(1);
      expect(info.needs.length, info.id).toBeLessThanOrEqual(3);
      for (const need of info.needs) {
        expect(need.text.length, need.text).toBeLessThanOrEqual(16);
      }
    }
  });

  it('열린 실습실에는 "보드·카메라 없어도 돼요"처럼 부담을 덜어 주는 초록 칩이 하나 이상 있다', () => {
    for (const info of LAB_CARD_INFO) {
      expect(info.needs.some((need) => need.tone === 'ok'), info.id).toBe(true);
    }
  });
});

describe('무엇을 할까요? 고르기', () => {
  it('3개이고 모두 사이트 지도의 열린 실습실로 간다', () => {
    expect(LAB_CHOICES).toHaveLength(3);
    for (const choice of LAB_CHOICES) {
      expect(() => getPage(choice.target), choice.ask).not.toThrow();
      expect(getLabPlan(choice.target).open, choice.ask).toBe(true);
      if (choice.alsoTarget !== undefined) {
        expect(getLabPlan(choice.alsoTarget).open, choice.ask).toBe(true);
      }
    }
  });

  it('링크 글에 실습실 이름을 넣지 않는다(아래 카드의 제목 링크와 이름이 겹치지 않게)', () => {
    const titles = getPage('labs').children.map((lab) => lab.title);
    for (const choice of LAB_CHOICES) {
      for (const title of titles) {
        expect(choice.ask.includes(title), `${choice.ask} / ${title}`).toBe(false);
      }
    }
  });

  it('첫 고르기(처음이면 여기서)는 영상처리 실습실이다', () => {
    expect(LAB_CHOICES[0]?.target).toBe('labs-vision');
  });
});

describe('실습실 안내 글(판 1.3.0 검수 R1-103)', () => {
  it('실습실 수를 우리말 관형사로 말한다("실습실 다섯 곳")', async () => {
    const { koreanCountWord } = await import('../../../src/pages/labs/_lab-cards.ts');
    expect(koreanCountWord(5)).toBe('다섯');
    expect(koreanCountWord(1)).toBe('한');
    expect(koreanCountWord(10)).toBe('열');
    expect(koreanCountWord(11)).toBe('11');
    expect(koreanCountWord(0)).toBe('0');
  });

  it('4단원 카드 글: 같은 낱말("움직")이 겹치지 않고, "카메라와 보드가 없어도 돼요"처럼 조사가 있다', () => {
    const info = labCardInfo('labs-unit4')!;
    expect((info.useWhen.match(/움직/gu) ?? []).length).toBeLessThanOrEqual(2);
    expect(info.needs.some((need) => need.text === '카메라와 보드가 없어도 돼요')).toBe(true);
  });
});
