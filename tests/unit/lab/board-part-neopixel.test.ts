// 부품 neopixel(네오픽셀 16구 링) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", PLAN §6.2 "네오픽셀 16구 링"·§8.3 P3-05.
// 링 흉내(apc_part_neopixel.py)가 보낸 색 글자 → 모습. write()를 불러야 바뀌는 규칙과 GRB 풀기는 파이썬 쪽(pyodide-neopixel.test.ts)이 본다.
// (구역 C 병렬 제작: 통합 때 tests/unit/board-uart/에서 tests/unit/lab/board-part-neopixel.test.ts로 옮긴 파일.)
import { describe, expect, it } from 'vitest';
import { stoppedSnapshot, type PartDeviceState } from '../../../src/lab/modules/board/state.ts';
import { PART_DEFINITIONS, resolveWiring } from '../../../src/lab/modules/board/parts.ts';
import neopixel, {
  RING_LED_COUNT,
  displayColor,
  glowOpacity,
  ledPosition,
  rgbOf,
  ringColors,
  ringVisual,
} from '../../../src/lab/modules/board/parts/neopixel/part.ts';
import { snapshotWith } from './helpers/board-snapshot.ts';

const OFF = '000000';

function ring(colors: string[], writes = 1): PartDeviceState {
  const padded = Array.from({ length: RING_LED_COUNT }, (_, index) => colors[index] ?? OFF);
  return { seq: writes, state: { v: 1, count: RING_LED_COUNT, colors: padded.join(''), writes, bytes: 48, timing: 1 } };
}

describe('neopixel 부품 정의', () => {
  it('레지스트리에 있고 DIN 기본 핀은 원고 149쪽의 23번', () => {
    expect(PART_DEFINITIONS.get('neopixel')).toBe(neopixel);
    expect(neopixel.pins).toEqual([{ role: 'din', label: 'DIN 데이터', direction: 'out' }]);
    expect(neopixel.defaultPins).toEqual({ din: 23 });
    expect(RING_LED_COUNT).toBe(16);
    expect(resolveWiring([{ part: 'neopixel' }], PART_DEFINITIONS).issues).toEqual([]);
  });
});

describe('링 색 읽기', () => {
  it('rrggbb × 16을 나누고 모양이 틀리면 모두 꺼짐', () => {
    expect(ringColors(ring(['ff0000', '00ff00']))).toEqual(['ff0000', '00ff00', ...Array(14).fill(OFF)]);
    expect(ringColors({ seq: 1, state: { colors: 'FF0000' } })).toEqual(['ff0000', ...Array(15).fill(OFF)]);
    expect(ringColors({ seq: 1, state: { colors: 'zz' } })).toEqual(Array(16).fill(OFF));
    expect(ringColors(undefined)).toEqual(Array(16).fill(OFF));
    expect(rgbOf('640000')).toEqual([100, 0, 0]);
  });

  it('어두운 색도 알아보게 화면 색은 올리고 빛 번짐은 실제 밝기만큼', () => {
    // 원고 f064의 (100, 0, 0)
    expect(displayColor('640000')).toBe('#c80000');
    expect(displayColor('ff8000')).toBe('#ff8000');
    expect(displayColor(OFF)).toBe('#2b3440');
    expect(glowOpacity(OFF)).toBe(0);
    expect(glowOpacity('640000')).toBe(0.49);
    expect(glowOpacity('ffffff')).toBe(0.85);
  });
});

describe('ringVisual — 모습', () => {
  it('실행 중이면 켜진 LED 수·색·write 횟수', () => {
    expect(ringVisual(snapshotWith([], 'run'), ring(['640000', OFF, '000064'], 3))).toEqual({
      lit: true,
      count: 2,
      colors: ['640000', OFF, '000064', ...Array(13).fill(OFF)].join(''),
      writes: 3,
    });
    expect(ringVisual(snapshotWith([], 'run'), undefined)).toEqual({ lit: false, count: 0, colors: OFF.repeat(16), writes: 0 });
  });

  it('[정지]하면 모두 꺼진 모습, 코드가 스스로 끝나면 마지막 색을 남긴다', () => {
    const device = ring(['ff0000']);
    expect(ringVisual(stoppedSnapshot(snapshotWith([], 'run')), device)).toEqual({ lit: false, count: 0, colors: OFF.repeat(16), writes: 0 });
    expect(ringVisual(snapshotWith([], 'end'), device).count).toBe(1);
    expect(ringVisual(snapshotWith([], 'idle'), device).lit).toBe(true);
  });

  it('0번 LED는 12시, 시계 방향으로 돈다', () => {
    expect(ledPosition(0)).toEqual({ x: 63, y: 26 });
    expect(ledPosition(4)).toEqual({ x: 107, y: 70 });
    expect(ledPosition(8)).toEqual({ x: 63, y: 114 });
    expect(ledPosition(12)).toEqual({ x: 19, y: 70 });
  });
});
