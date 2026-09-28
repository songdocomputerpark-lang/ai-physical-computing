// 예제 갤러리 태그 합치기의 차례 고르기(src/lab/gallery/facets.ts galleryFacetsOf — 2026-09-28 미해결 140).
// 기본(차시가 먼저) 규칙은 tests/unit/lab/gallery-facets.test.ts가 본다. 여기서는 exampleFirst(예제 쪽이 먼저)만 본다.
import { describe, expect, it } from 'vitest';
import { galleryFacetsOf } from '../../../src/lab/gallery/facets.ts';

const lesson = { unit: 4, difficulty: 3, virtualOk: true, comm: ['tab', 'uart'], parts: [{ part: 'servo' }], tags: ['프로젝트', '서보'] };
const sidecar = { difficulty: 1, comm: ['ble'], tags: ['서보', '조립'] };

describe('galleryFacetsOf — 차례 고르기', () => {
  it('기본은 차시가 먼저다(차시가 그 예제를 싣고 있을 때)', () => {
    expect(galleryFacetsOf(lesson, sidecar)).toMatchObject({ unit: 4, difficulty: 3, comm: ['uart', 'tab'], parts: ['servo'] });
  });

  it('exampleFirst면 예제 쪽이 먼저고, 예제가 비운 칸(단원·하드웨어 없이·부품)만 차시로 채운다', () => {
    expect(galleryFacetsOf(lesson, sidecar, { exampleFirst: true })).toMatchObject({
      unit: 4,
      difficulty: 1,
      virtualOk: true,
      comm: ['ble'],
      parts: ['servo'],
    });
  });

  it('낱말은 차례와 상관없이 차시 → 예제 순서로 모두 모으고 겹치는 낱말은 한 번만 둔다', () => {
    expect(galleryFacetsOf(lesson, sidecar).tags).toEqual(['프로젝트', '서보', '조립']);
    expect(galleryFacetsOf(lesson, sidecar, { exampleFirst: true }).tags).toEqual(['프로젝트', '서보', '조립']);
  });

  it('한쪽이 없어도 된다 — 예제 쪽만 있으면 그 값, 둘 다 없으면 모름(null·빈 목록)', () => {
    expect(galleryFacetsOf(null, sidecar, { exampleFirst: true })).toMatchObject({ unit: null, difficulty: 1, comm: ['ble'] });
    expect(galleryFacetsOf(lesson, null, { exampleFirst: true })).toMatchObject({ unit: 4, difficulty: 3, comm: ['uart', 'tab'] });
    expect(galleryFacetsOf(null, null, { exampleFirst: true })).toMatchObject({ unit: null, difficulty: null, virtualOk: null, comm: [], parts: [], tags: [] });
  });
});
