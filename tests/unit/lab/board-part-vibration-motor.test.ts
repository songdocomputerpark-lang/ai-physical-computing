// 부품 vibration-motor(진동 모터) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", PD-36(사이트 배정 핀, PWM이면 세기).
import { describe, expect, it } from 'vitest';
import { headerPinForGpio } from '../../../src/lab/modules/board/layout.ts';
import { snapshotAfterRun } from '../../../src/lab/modules/board/index.ts';
import motor from '../../../src/lab/modules/board/parts/vibration-motor/part.ts';
import { STRAPPING_GPIOS } from '../../../src/lab/modules/board/state.ts';
import { instanceOf, snapshotWith } from './helpers/board-snapshot.ts';

const instance = instanceOf('vibration-motor', { sig: 19 });

describe('부품: 진동 모터(vibration-motor)', () => {
  it('바깥 출력 부품: 사이트 배정 핀 GPIO19 — 스트래핑·JTAG·플래시·PSRAM·입력 전용·UART0이 아니고 핀 머리에 있으며, 실물 확인 전 안내가 붙는다', () => {
    expect(motor.pins).toEqual([{ role: 'sig', label: '신호', direction: 'out' }]);
    expect(motor.defaultPins).toEqual({ sig: 19 });
    const gpio = motor.defaultPins?.sig as number;
    expect(STRAPPING_GPIOS).not.toContain(gpio);
    // Espressif GPIO 문서(ESP32, v6.1): JTAG 12~15, SPI0/1(플래시·PSRAM) 6~11·16·17, 입력 전용 34~39 — 확인 2026-09-17
    expect([12, 13, 14, 15, 6, 7, 8, 9, 10, 11, 16, 17, 34, 35, 36, 37, 38, 39, 1, 3]).not.toContain(gpio);
    // 교과서 자료 코드가 쓰는 핀(코드 158개 검색, PROGRESS 미해결 7)
    expect([0, 2, 4, 5, 12, 15, 16, 17, 18, 21, 22, 23, 25, 26, 27, 32, 33]).not.toContain(gpio);
    expect(headerPinForGpio(gpio)).toMatchObject({ row: 'bottom', label: '19' });
    expect(motor.defaultPinsNotice).toContain('실물 키트에서는 아직 확인하지 않았어요');
  });

  it('신호 핀이 출력으로 1이면 진동(세기 100·떨림), 0·입력·[정지]면 멈춤', () => {
    const on = snapshotWith([{ id: 19, mode: 'out', out: 1, level: 1, driven: true }]);
    expect(motor.visual({ snapshot: on, instance, active: false, reducedMotion: false })).toEqual({ on: true, strength: 100, motion: 'shake' });
    expect(motor.visual({ snapshot: snapshotWith([{ id: 19, mode: 'out', out: 0, level: 0, driven: true }]), instance, active: false, reducedMotion: false })).toEqual({
      on: false,
      strength: 0,
      motion: 'still',
    });
    expect(motor.visual({ snapshot: snapshotWith([{ id: 19, mode: 'in', out: 1, level: 0, driven: false }]), instance, active: false, reducedMotion: false })).toMatchObject({ on: false });
    expect(motor.visual({ snapshot: snapshotAfterRun(on, { outcome: 'stopped' }), instance, active: false, reducedMotion: false })).toMatchObject({ on: false, motion: 'still' });
  });

  it('움직임 줄이기 설정이면 떨지 않고(still) 켜짐만 보인다', () => {
    const on = snapshotWith([{ id: 19, mode: 'out', out: 1, level: 1, driven: true }]);
    expect(motor.visual({ snapshot: on, instance, active: false, reducedMotion: true })).toEqual({ on: true, strength: 100, motion: 'still' });
  });

  it('PWM(board.state의 duty)이면 세기가 켜진 시간 비율 — P3-03이 duty를 채우면 따라온다', () => {
    const pwm = snapshotWith([{ id: 19, mode: 'out', out: 1, level: 1, driven: true, duty: 0.6, freq: 1000 }]);
    expect(motor.visual({ snapshot: pwm, instance, active: false, reducedMotion: false })).toEqual({ on: true, strength: 60, motion: 'shake' });
    const zero = snapshotWith([{ id: 19, mode: 'out', out: 1, level: 1, driven: true, duty: 0 }]);
    expect(motor.visual({ snapshot: zero, instance, active: false, reducedMotion: false })).toEqual({ on: false, strength: 0, motion: 'still' });
  });
});
