// 부품 touch-digital(디지털 터치 센서) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", PD-34(누르는 동안 1).
import { describe, expect, it } from 'vitest';
import { partAnchors, partPowerLegs } from '../../../src/lab/modules/board/layout.ts';
import touch from '../../../src/lab/modules/board/parts/touch-digital/part.ts';
import { resolveWiring } from '../../../src/lab/modules/board/parts.ts';
import { EMPTY_SNAPSHOT } from '../../../src/lab/modules/board/state.ts';
import { instanceOf } from './helpers/board-snapshot.ts';

describe('부품: 디지털 터치 센서(touch-digital)', () => {
  it('바깥 입력 부품: 신호 핀 하나, 기본 GPIO17(원고 130쪽), 누르고 있는 동안만(momentary)', () => {
    expect(touch.onboard).toBeUndefined();
    expect(touch.pins).toEqual([{ role: 'sig', label: '신호', direction: 'in' }]);
    expect(touch.defaultPins).toEqual({ sig: 17 });
    expect(touch.interaction?.kind).toBe('momentary');
    expect(touch.defaultPinsNotice).toBeUndefined();
  });

  it('누르면 1, 떼면 0을 세게 누른다(센서 모듈 출력 — 풀업이 아님)', () => {
    expect(touch.interaction?.drive(true, 'sig')).toBe(1);
    expect(touch.interaction?.drive(false, 'sig')).toBe(0);
    const instance = instanceOf('touch-digital', { sig: 17 });
    expect(touch.visual({ snapshot: EMPTY_SNAPSHOT, instance, active: true, reducedMotion: false })).toEqual({ pressed: true });
    expect(touch.visual({ snapshot: EMPTY_SNAPSHOT, instance, active: false, reducedMotion: true })).toEqual({ pressed: false });
  });

  it('배선도 자리: 신호선은 윗변 x 9, 전원 다리는 아랫변 가운데 양옆, 예제 배선의 pin 줄임 표기를 받는다', () => {
    expect(partAnchors(touch)).toEqual({ sig: { x: 9, y: 0 } });
    expect(partPowerLegs(touch)).toEqual({ gnd: { x: 36, y: 68 }, vcc: { x: 54, y: 68 } });
    const resolved = resolveWiring([{ part: 'touch-digital', pin: 4 }]);
    expect(resolved.instances.find((instance) => instance.part === 'touch-digital')).toMatchObject({ id: 'touch-digital', pins: { sig: 4 }, label: '터치 센서' });
    expect(resolved.issues).toEqual([]);
  });
});
