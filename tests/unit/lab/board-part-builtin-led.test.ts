// 부품 builtin-led(보드에 붙은 내장 LED, GPIO2) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나".
import { describe, expect, it } from 'vitest';
import { snapshotAfterRun } from '../../../src/lab/modules/board/index.ts';
import builtinLed from '../../../src/lab/modules/board/parts/builtin-led/part.ts';
import { EMPTY_SNAPSHOT } from '../../../src/lab/modules/board/state.ts';
import { instanceOf, snapshotWith } from './helpers/board-snapshot.ts';

const instance = instanceOf('builtin-led', { led: 2 }, { label: '내장 LED' });
const visual = (snapshot: Parameters<typeof builtinLed.visual>[0]['snapshot']) => builtinLed.visual({ snapshot, instance, active: false, reducedMotion: false });

describe('부품: 내장 LED(builtin-led)', () => {
  it('보드에 붙은 출력 부품: GPIO2 고정, 원고 123쪽의 초록 D2 LED', () => {
    expect(builtinLed).toMatchObject({ onboard: true, defaultPins: { led: 2 }, pins: [{ role: 'led', direction: 'out' }] });
    expect(builtinLed.interaction).toBeUndefined();
  });

  it('GPIO2가 출력으로 1이면 켜지고(밝기 100), 입력 모드·0·[정지]면 꺼진다', () => {
    const on = snapshotWith([{ id: 2, mode: 'out', out: 1, level: 1, driven: true, irq: false }]);
    expect(visual(on)).toEqual({ lit: true, brightness: 100 });
    expect(visual(snapshotWith([{ id: 2, mode: 'out', out: 0, level: 0, driven: true }]))).toEqual({ lit: false, brightness: 0 });
    expect(visual(snapshotWith([{ id: 2, mode: 'in', out: 1, level: 0, driven: false }]))).toEqual({ lit: false, brightness: 0 });
    expect(visual(snapshotAfterRun(on, { outcome: 'stopped' }))).toEqual({ lit: false, brightness: 0 });
    expect(visual(snapshotAfterRun(on, { outcome: 'killed' }))).toEqual({ lit: false, brightness: 0 });
    expect(visual(snapshotAfterRun({ ...on, phase: 'end' }, { outcome: 'ok' }))).toEqual({ lit: true, brightness: 100 });
    expect(visual(EMPTY_SNAPSHOT)).toEqual({ lit: false, brightness: 0 });
  });

  it('PWM(board.state의 duty)이면 켜진 시간 비율만큼 밝다 — P3-03이 duty를 채우면 따라온다', () => {
    expect(visual(snapshotWith([{ id: 2, mode: 'out', out: 1, level: 1, driven: true, duty: 0.4, freq: 1000 }]))).toEqual({ lit: true, brightness: 40 });
    expect(visual(snapshotWith([{ id: 2, mode: 'out', out: 0, level: 0, driven: true, duty: 0 }]))).toEqual({ lit: false, brightness: 0 });
  });
});
