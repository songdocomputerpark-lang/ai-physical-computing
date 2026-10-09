// 영상처리 실습실 출력 칸 위의 한 줄 설명(판 1.3.0 검수 R1-101).
import { describe, expect, it } from 'vitest';
import { OUTPUT_HINTS, outputHintFor } from '../../../src/lab/vision/output-hints.ts';

describe('outputHintFor', () => {
  it('첫 실습에는 성공이 무엇인지와 조절 막대를 알려 준다', () => {
    const hint = outputHintFor('first-edge');
    expect(hint).toContain('흰 선');
    expect(hint).toContain('threshold');
  });

  it('없는 예제·없는 값은 빈 글이다', () => {
    expect(outputHintFor('nothing')).toBe('');
    expect(outputHintFor(null)).toBe('');
    expect(outputHintFor(undefined)).toBe('');
  });

  it('휴대폰에서는 칸이 위아래로 쌓이므로 "왼쪽·오른쪽"을 쓰지 않고, 한 줄은 두 문장 이내다', () => {
    for (const hint of Object.values(OUTPUT_HINTS)) {
      expect(hint).not.toMatch(/왼쪽|오른쪽/u);
      expect(hint.split(/[.!?]\s/u).length).toBeLessThanOrEqual(2);
    }
  });
});
