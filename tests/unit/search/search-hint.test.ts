// 찾는 글이 없을 때 돕는 규칙(src/components/search/search-hint.ts, 판 1.3.0 검수 R1-012·R1-021) 단위 검사.
import { describe, expect, it } from 'vitest';
import {
  didYouMean,
  editDistance,
  fallbackTerms,
  maxEditDistance,
  normalizeVocabulary,
  restoreCase,
} from '../../../src/components/search/search-hint.ts';

describe('편집 거리', () => {
  it('글자 하나 끼우기·빼기·바꾸기가 1이다. 한글은 글자(음절) 단위로 센다', () => {
    expect(editDistance('임게값', '임계값')).toBe(1);
    expect(editDistance('threshold', 'treshold')).toBe(1);
    expect(editDistance('서보', '서보모터')).toBe(2);
    expect(editDistance('', '가나')).toBe(2);
    expect(editDistance('같음', '같음')).toBe(0);
  });

  it('maxEditDistance: 2글자 이하는 오타로 보지 않고, 3~5글자는 1, 6글자 이상은 2', () => {
    expect([1, 2, 3, 5, 6, 9].map(maxEditDistance)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('오타 제안(didYouMean) — R1-012', () => {
  const vocabulary = normalizeVocabulary(['임계값', 'Threshold', '픽셀', 'LED', '서보모터', 'Pulse Width Modulation']);

  it('임게값 → 임계값', () => {
    expect(didYouMean('임게값', vocabulary)).toBe('임계값');
  });

  it('영어 오타도: treshold → threshold', () => {
    expect(didYouMean('treshold', vocabulary)).toBe('threshold');
  });

  it('이미 목록에 있는 낱말이거나 가까운 낱말이 없으면 제안하지 않는다', () => {
    expect(didYouMean('임계값', vocabulary)).toBeUndefined();
    expect(didYouMean('뷁쿍퓽', vocabulary)).toBeUndefined();
    expect(didYouMean('ㅋㅋㅋ', vocabulary)).toBeUndefined();
  });

  it('두 글자 이하 낱말은 제안하지 않는다(우연히 가까운 것이 너무 많다)', () => {
    expect(didYouMean('픽', vocabulary)).toBeUndefined();
    expect(didYouMean('서보', normalizeVocabulary(['서모']))).toBeUndefined();
  });

  it('낱말이 여럿이면 낱말마다 고친다', () => {
    expect(didYouMean('임게값 픽셀', vocabulary)).toBe('임계값 픽셀');
  });

  it('normalizeVocabulary: 소문자·낱말 단위·두 글자 이상·중복 없이', () => {
    expect(normalizeVocabulary(['Pulse Width Modulation', 'PWM', 'a', 'pwm'])).toEqual(['pulse', 'width', 'modulation', 'pwm']);
  });

  it('restoreCase: 소문자 낱말을 목록의 원래 표기로 되돌린다', () => {
    expect(restoreCase('led', ['LED', '서보'])).toBe('LED');
    expect(restoreCase('없음', ['LED'])).toBe('없음');
  });
});

describe('낱말 줄여 다시 찾기(fallbackTerms) — R1-021', () => {
  it('낱말이 하나면 후보가 없다', () => {
    expect(fallbackTerms('웹캠')).toEqual([]);
  });

  it('낱말을 하나씩 빼 긴 것부터, 원래 차례 그대로', () => {
    expect(fallbackTerms('웹캠 permission denied')).toEqual([
      '웹캠 permission',
      '웹캠 denied',
      'permission denied',
      '웹캠',
      'permission',
      'denied',
    ]);
  });

  it('후보 수에 한도가 있다', () => {
    expect(fallbackTerms('가 나 다 라 마 바 사', 5)).toHaveLength(5);
    expect(fallbackTerms('가 나 다 라 마 바 사 아')).toEqual([]);
  });
});
