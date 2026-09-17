// 부품 boot-button(보드에 붙은 BOOT 버튼, GPIO0) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나".
import { describe, expect, it } from 'vitest';
import bootButton from '../../../src/lab/modules/board/parts/boot-button/part.ts';
import { EMPTY_SNAPSHOT } from '../../../src/lab/modules/board/state.ts';
import { instanceOf } from './helpers/board-snapshot.ts';

describe('부품: BOOT 버튼(boot-button)', () => {
  it('누르면 GPIO0을 0으로, 떼면 풀업(평소 1) — 누르고 있는 동안만(momentary)', () => {
    expect(bootButton).toMatchObject({ onboard: true, defaultPins: { sig: 0 }, pins: [{ role: 'sig', direction: 'in' }] });
    expect(bootButton.interaction?.kind).toBe('momentary');
    expect(bootButton.interaction?.drive(true, 'sig')).toBe(0);
    expect(bootButton.interaction?.drive(false, 'sig')).toBe('pullup');
    const instance = instanceOf('boot-button', { sig: 0 }, { label: 'BOOT 버튼' });
    expect(bootButton.visual({ snapshot: EMPTY_SNAPSHOT, instance, active: true, reducedMotion: false })).toEqual({ pressed: true });
    expect(bootButton.visual({ snapshot: EMPTY_SNAPSHOT, instance, active: false, reducedMotion: false })).toEqual({ pressed: false });
  });
});
