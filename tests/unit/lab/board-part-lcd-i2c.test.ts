// 부품 lcd-i2c(문자 LCD 16×2 + I2C 백팩) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", PLAN §8.3 P3-04.
// 파이썬 쪽 바이트 해석(PCF8574 → HD44780)은 tests/unit/board-i2c/pyodide-i2c-bus-lcd.test.ts, 글자표·요약 같은 화면 순수 함수는 tests/unit/board-i2c/lcd-screen.test.ts.
import { describe, expect, it } from 'vitest';
import { snapshotAfterRun } from '../../../src/lab/modules/board/index.ts';
import { headerPinForGpio } from '../../../src/lab/modules/board/layout.ts';
import { PART_DEFINITIONS, resolveWiring, wiringValue } from '../../../src/lab/modules/board/parts.ts';
import lcd from '../../../src/lab/modules/board/parts/lcd-i2c/part.ts';
import { EMPTY_SNAPSHOT, STRAPPING_GPIOS } from '../../../src/lab/modules/board/state.ts';
import { instanceOf, snapshotWith } from './helpers/board-snapshot.ts';

const instance = instanceOf('lcd-i2c', { sda: 21, scl: 22 }, { id: 'lcd', label: '문자 LCD(16×2)' });

function codesOf(line1: string, line2: string): number[] {
  return [...line1.padEnd(16, ' '), ...line2.padEnd(16, ' ')].map((character) => character.charCodeAt(0));
}

describe('부품: 문자 LCD(lcd-i2c)', () => {
  it('바깥 출력 부품: SDA·SCL 두 핀(기본 GPIO21·22 — 원고 125쪽), 신호 자리는 18 간격 칸, 파이썬 흉내 apc_part_lcd_i2c', () => {
    expect(lcd.id).toBe('lcd-i2c');
    expect(lcd.onboard).toBeFalsy();
    expect(lcd.pins).toEqual([
      { role: 'sda', label: 'SDA', direction: 'out' },
      { role: 'scl', label: 'SCL', direction: 'out' },
    ]);
    expect(lcd.defaultPins).toEqual({ sda: 21, scl: 22 });
    expect(lcd.python).toBe('apc_part_lcd_i2c');
    expect(lcd.defaultPinsNotice).toBeUndefined();
    for (const gpio of [21, 22]) {
      expect(STRAPPING_GPIOS).not.toContain(gpio);
      expect(headerPinForGpio(gpio)).toMatchObject({ row: 'bottom' });
    }
    expect(PART_DEFINITIONS.get('lcd-i2c')).toBe(lcd);
  });

  it('f052 사이드카 배선(터치 17 + LCD sda 21·scl 22)은 문제없이 그려지고, 파이썬에는 known: true와 방향이 간다', () => {
    const resolved = resolveWiring([
      { part: 'touch-digital', pin: 17 },
      { part: 'lcd-i2c', id: 'lcd', pins: { sda: 21, scl: 22 }, label: '문자 LCD(16×2)' },
    ]);
    expect(resolved.issues).toEqual([]);
    expect(resolved.unknown).toEqual([]);
    expect(wiringValue(resolved.instances, resolved.unknown).parts).toEqual(
      expect.arrayContaining([{ part: 'lcd-i2c', id: 'lcd', label: '문자 LCD(16×2)', pins: { sda: 21, scl: 22 }, directions: { sda: 'out', scl: 'out' }, known: true }]),
    );
  });

  it('LCD와 OLED를 같은 I2C 선에 이으면 "같은 신호를 받아요"(참고)만, 입력 전용 핀(34~39)에 이으면 오류', () => {
    const shared = resolveWiring([
      { part: 'lcd-i2c', id: 'lcd', pins: { sda: 21, scl: 22 } },
      { part: 'oled-i2c', id: 'oled', pins: { sda: 21, scl: 22 } },
    ]);
    expect(shared.issues.map((issue) => [issue.level, issue.code, issue.gpio])).toEqual([
      ['info', 'shared-output', 21],
      ['info', 'shared-output', 22],
    ]);
    const inputOnly = resolveWiring([{ part: 'lcd-i2c', id: 'lcd', pins: { sda: 34, scl: 22 } }]);
    expect(inputOnly.issues).toEqual(expect.arrayContaining([expect.objectContaining({ level: 'error', code: 'input-only-output', gpio: 34 })]));
  });

  it('모습: 멈춤이면 전원 없음(백라이트 꺼짐), 실행 중인데 상태가 없으면 전원 직후(백라이트 켜짐·빈 화면)', () => {
    expect(lcd.visual({ snapshot: EMPTY_SNAPSHOT, instance, active: false, reducedMotion: false })).toEqual({
      lit: false,
      display: false,
      line1: ' '.repeat(16),
      line2: ' '.repeat(16),
      cursor: '',
      blink: false,
      frame: 0,
    });
    const running = snapshotWith([]);
    expect(lcd.visual({ snapshot: running, instance, active: false, reducedMotion: false })).toMatchObject({ lit: true, display: false, line1: ' '.repeat(16) });
  });

  it('모습: 파이썬이 보낸 글자 코드(16×2)·백라이트·커서가 data-visual 값이 되고, [정지]하면 꺼진 모습, 스스로 끝나면 마지막 모습', () => {
    const running = snapshotWith([{ id: 21, mode: 'open_drain', out: 1, level: 1, driven: false }]);
    const state = { v: 1, cols: 16, rows: 2, codes: new Uint8Array(codesOf('Hello LCD!', 'Count: 5')), backlight: true, display: true, underline: true, blink: false, cursor: [1, 8], cgram: new Uint8Array(64) };
    const device = { seq: 3, state };
    expect(lcd.visual({ snapshot: running, instance, active: false, reducedMotion: false, device })).toEqual({
      lit: true,
      display: true,
      line1: 'Hello LCD!      ',
      line2: 'Count: 5        ',
      cursor: '1,8',
      blink: false,
      frame: 3,
    });
    expect(lcd.visual({ snapshot: snapshotAfterRun(running, { outcome: 'stopped' }), instance, active: false, reducedMotion: false, device })).toMatchObject({ lit: false, line1: ' '.repeat(16) });
    const ended = snapshotWith([], 'end');
    expect(lcd.visual({ snapshot: ended, instance, active: false, reducedMotion: false, device })).toMatchObject({ lit: true, line1: 'Hello LCD!      ' });
  });

  it('Node 시험 도구가 JSON으로 넘긴 바이트({"0": 72, …})도 읽고, 모양이 틀린 상태는 전원 직후 모습으로 둔다', () => {
    const running = snapshotWith([]);
    const codes = Object.fromEntries(codesOf('Hi', '').map((code, index) => [String(index), code]));
    const device = { seq: 1, state: { codes, backlight: false, display: true } };
    expect(lcd.visual({ snapshot: running, instance, active: false, reducedMotion: false, device })).toMatchObject({ lit: false, display: true, line1: 'Hi              ' });
    expect(lcd.visual({ snapshot: running, instance, active: false, reducedMotion: false, device: { seq: 2, state: { codes: [1, 2] } } })).toMatchObject({ lit: true, display: false });
  });
});
