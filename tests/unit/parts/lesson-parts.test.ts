// 준비물 사진 줄에 넘길 부품 목록 모으기(src/components/parts/lesson-parts.ts) — 판 1.4.0, DECISIONS C136.
// 사이드카를 실제로 읽는 빌드 전용 lesson-parts-data.ts는 브라우저 테스트(tests/e2e/parts.spec.ts)와 빌드가 확인한다.
import { describe, expect, it } from 'vitest';
import { collectExamplePartRefs } from '../../../src/components/parts/lesson-parts.ts';
import { siteIdsOf } from '../../../src/components/parts/parts-schema.ts';

describe('collectExamplePartRefs', () => {
  const sidecars: Record<string, { part: string }[]> = {
    'esp32/u2/b.py': [{ part: 'rgb-led' }],
    'esp32/u2/c.py': [{ part: 'buzzer' }],
  };
  const sidecarParts = (file: string) => sidecars[file];

  it('차시 frontmatter의 배선이 있으면 그것을, 비었으면 사이드카 배선을 쓴다', () => {
    const refs = collectExamplePartRefs(
      [
        { file: 'esp32/u2/a.py', parts: [{ part: 'lcd-i2c' }] },
        { file: 'esp32/u2/b.py', parts: [] },
        { file: 'esp32/u2/c.py' },
      ],
      sidecarParts,
    );
    expect(siteIdsOf(refs)).toEqual(['lcd-i2c', 'rgb-led', 'buzzer']);
  });

  it('frontmatter에 배선이 있는 예제는 사이드카를 보지 않는다(앞의 것만 쓴다)', () => {
    const refs = collectExamplePartRefs([{ file: 'esp32/u2/b.py', parts: [{ type: 'touch_digital' }] }], sidecarParts);
    expect(siteIdsOf(refs)).toEqual(['touch-digital']);
  });

  it('부품이 하나도 없으면 빈 목록이다(영상 처리 차시 — 줄을 그리지 않는다)', () => {
    expect(collectExamplePartRefs([{ file: 'vision/u1/a.py' }, { file: 'vision/u1/b.py', parts: [] }], () => undefined)).toEqual([]);
    expect(collectExamplePartRefs([], sidecarParts)).toEqual([]);
  });

  it('예제 차례대로 모으고 같은 부품이 여러 번 나와도 그대로 넘긴다(중복은 사진 줄이 한 번만 보인다)', () => {
    const refs = collectExamplePartRefs(
      [
        { file: 'a.py', parts: [{ part: 'lcd-i2c' }, { part: 'touch-digital' }] },
        { file: 'b.py', parts: [{ part: 'lcd-i2c' }] },
      ],
      () => undefined,
    );
    expect(siteIdsOf(refs)).toEqual(['lcd-i2c', 'touch-digital', 'lcd-i2c']);
  });
});
