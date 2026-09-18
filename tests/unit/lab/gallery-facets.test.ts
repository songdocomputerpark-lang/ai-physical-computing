/**
 * 예제 갤러리 태그 규약(P4-11 준비, src/lab/gallery/facets.ts)과 통신 예제가 목록에서 빠지는 폴더 규칙.
 *
 * 왜: Phase 4 여섯 구역이 사이드카·차시 md에 같은 이름으로 태그를 적어야 통합할 때 갤러리 필터가 한 번에 만들어진다.
 * 여기서 굳히는 것은 ① 아는 통신 이름만 정해진 순서로 남는다 ② 차시 md가 사이드카보다 먼저다 ③ lib/ 폴더는 예제 목록에 없다.
 */
import { describe, expect, it } from 'vitest';
import { parseExampleSidecar } from '../../../src/lab/controls/example-sidecar.ts';
import { EXAMPLE_COMM_KINDS, galleryFacetsOf, normalizeCommKinds, partIdsOf } from '../../../src/lab/gallery/facets.ts';
import { exampleFileFromPath, visionExamplesFromFiles } from '../../../src/lab/vision/examples.ts';

describe('예제 갤러리 태그 규약(P4-11 준비)', () => {
  it('통신 방식은 아는 이름만 정해진 순서로 남고, 글자 하나만 줘도 받는다', () => {
    expect(normalizeCommKinds(['mqtt', 'uart', 'mqtt', 'BLE'])).toEqual(['uart', 'ble', 'mqtt']);
    expect(normalizeCommKinds('tab')).toEqual(['tab']);
    expect(normalizeCommKinds(['없는통로', '', 3])).toEqual([]);
    expect(normalizeCommKinds(undefined)).toEqual([]);
    expect(EXAMPLE_COMM_KINDS).toEqual(['uart', 'ble', 'wifi', 'mqtt', 'tab']);
  });

  it('부품 태그는 배선에서 나온 순서로, 중복 없이 뽑는다', () => {
    expect(partIdsOf([{ part: 'servo' }, { part: 'rgb-led' }, { part: 'servo' }])).toEqual(['servo', 'rgb-led']);
    expect(partIdsOf(null)).toEqual([]);
  });

  it('차시 md가 먼저고, 차시에 없는 칸만 사이드카에서 읽는다', () => {
    const lesson = { unit: 3, comm: ['ble'], parts: [{ part: 'rgb-led' }], tags: ['블루투스'] };
    const sidecar = { unit: 4, difficulty: 2, virtualOk: true, comm: ['mqtt'], parts: [{ part: 'servo' }], tags: ['BLE', '블루투스'] };
    const facets = galleryFacetsOf(lesson, sidecar);
    expect(facets.unit).toBe(3); // 차시가 이긴다
    expect(facets.difficulty).toBe(2); // 차시에 없으면 사이드카
    expect(facets.virtualOk).toBe(true);
    expect(facets.comm).toEqual(['ble']);
    expect(facets.parts).toEqual(['rgb-led']);
    expect(facets.tags).toEqual(['블루투스', 'BLE']); // 낱말은 합치고 중복만 뺀다
  });

  it('모르는 칸은 null·빈 목록으로 둔다(갤러리가 그 필터에서 뺀다)', () => {
    const facets = galleryFacetsOf(null, null);
    expect(facets).toMatchObject({ unit: null, difficulty: null, virtualOk: null, comm: [], parts: [], tags: [] });
    expect(galleryFacetsOf({ unit: 9, difficulty: 0 }, null)).toMatchObject({ unit: null, difficulty: null });
  });

  it('사이드카가 같은 이름의 칸을 읽는다', () => {
    const sidecar = parseExampleSidecar(['title: 보기', 'unit: 3', 'difficulty: 3', 'virtual_ok: true', 'comm: [ble, tab]'].join('\n'));
    expect(sidecar).toMatchObject({ unit: 3, difficulty: 3, virtualOk: true, comm: ['ble', 'tab'] });
    expect(galleryFacetsOf(null, sidecar)).toMatchObject({ unit: 3, difficulty: 3, virtualOk: true, comm: ['ble', 'tab'] });
  });
});

describe('PC 전용 라이브러리 폴더(examples/vision/lib/)', () => {
  it('실습실 예제 목록과 예제 파일 목록에서 빠진다', () => {
    expect(exampleFileFromPath('/examples/vision/lib/bluetooth.py')).toBeNull();
    expect(exampleFileFromPath('/examples/desktop/lib/a.py')).toBeNull();
    expect(exampleFileFromPath('/examples/vision/u3/3-1-3-hand-ble-xy.py')).toBe('vision/u3/3-1-3-hand-ble-xy.py');
    const examples = visionExamplesFromFiles({
      '/examples/vision/lib/bluetooth.py': '# PC 라이브러리 원본',
      '/examples/vision/bt/b11-finger-xy-send.py': '# 교안 예제',
    });
    expect(examples.map((example) => example.file)).toEqual(['vision/bt/b11-finger-xy-send.py']);
    expect(examples[0]?.group).toBe('블루투스 통신 수업교안 실습(컴퓨터 쪽)');
  });
});
