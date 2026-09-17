// 문자 LCD 화면 모양 순수 함수(src/lab/modules/board/parts/lcd-i2c/lcd-screen.ts) — A00 문자표·줄 글자·사용자 정의 글자·요약. PLAN §8.3 P3-04.
import { describe, expect, it } from 'vitest';
import {
  LCD_CUSTOM_MARK,
  POWER_ON_SCREEN,
  byteList,
  customGlyph,
  isCustomCode,
  lcdCharacter,
  lcdLine,
  lcdSummary,
  parseLcdState,
} from '../../../src/lab/modules/board/parts/lcd-i2c/lcd-screen.ts';

function stateWith(line1: string, line2: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const codes = [...line1.padEnd(16, ' '), ...line2.padEnd(16, ' ')].map((character) => character.charCodeAt(0));
  return { v: 1, cols: 16, rows: 2, codes: new Uint8Array(codes), backlight: true, display: true, underline: false, blink: false, cgram: new Uint8Array(64), ...extra };
}

describe('A00 문자표(lcdCharacter)', () => {
  it('0x20~0x7D는 ASCII, 0x5C는 ¥·0x7E는 →·0x7F는 ←(일본어 표준 ROM)', () => {
    expect([0x20, 0x41, 0x7a, 0x7d].map(lcdCharacter)).toEqual([' ', 'A', 'z', '}']);
    expect(lcdCharacter(0x5c)).toBe('¥');
    expect(lcdCharacter(0x7e)).toBe('→');
    expect(lcdCharacter(0x7f)).toBe('←');
  });

  it('0xA1~0xDF는 반각 가타카나(JIS X 0201), 0xE0~0xFF는 그리스 글자·기호, 표에 없는 칸은 빈칸', () => {
    expect(lcdCharacter(0xa1)).toBe('｡');
    expect(lcdCharacter(0xb1)).toBe('ｱ');
    expect(lcdCharacter(0xdf)).toBe('ﾟ');
    expect(lcdCharacter(0xe0)).toBe('α');
    expect(lcdCharacter(0xe4)).toBe('μ');
    expect(lcdCharacter(0xf4)).toBe('Ω');
    expect(lcdCharacter(0xfd)).toBe('÷');
    expect(lcdCharacter(0xff)).toBe('█');
    expect([0x10, 0x1f, 0x80, 0x9f, 0xa0].map(lcdCharacter)).toEqual([' ', ' ', ' ', ' ', ' ']);
  });

  it('0x00~0x0F는 사용자 정의 글자(CGRAM — 8~15는 0~7과 같음)', () => {
    expect(isCustomCode(0)).toBe(true);
    expect(isCustomCode(15)).toBe(true);
    expect(isCustomCode(16)).toBe(false);
    expect(lcdCharacter(3)).toBe(LCD_CUSTOM_MARK);
  });
});

describe('상태 읽기(parseLcdState)와 한 줄 글자', () => {
  it('Uint8Array·숫자 배열·{"0": n} 모양을 모두 읽고, 모자라거나 범위 밖이면 null', () => {
    expect(byteList(new Uint8Array([1, 2, 3]), 2)).toEqual([1, 2]);
    expect(byteList([7, 8], 2)).toEqual([7, 8]);
    expect(byteList({ '0': 9, '1': 10 }, 2)).toEqual([9, 10]);
    expect(byteList([1], 2)).toBeNull();
    expect(byteList([1, 300], 2)).toBeNull();
    expect(byteList('ab', 2)).toBeNull();
    expect(parseLcdState(null)).toBeNull();
    expect(parseLcdState({ codes: [1, 2, 3] })).toBeNull();
  });

  it('16칸 두 줄: 빈칸은 공백, 커서는 보이는 칸만', () => {
    const screen = parseLcdState(stateWith('Hello LCD!', 'Count: 5', { cursor: [1, 8], underline: true }));
    expect(screen).not.toBeNull();
    expect(lcdLine(screen!, 0)).toBe('Hello LCD!      ');
    expect(lcdLine(screen!, 1)).toBe('Count: 5        ');
    expect(screen!.cursor).toEqual([1, 8]);
    expect(parseLcdState(stateWith('a', 'b', { cursor: [2, 0] }))!.cursor).toBeNull();
    expect(parseLcdState(stateWith('a', 'b', { cursor: [0, 16] }))!.cursor).toBeNull();
  });

  it('사용자 정의 글자 점: CGRAM 한 줄의 아래 5비트, 비트 4가 왼쪽 점', () => {
    const cgram = new Uint8Array(64);
    cgram.set([0x0e, 0x11, 0x11, 0x11, 0x0e, 0x00, 0x1f, 0x00], 8); // 1번 글자
    const screen = parseLcdState({ ...stateWith('', ''), cgram });
    const glyph = customGlyph(screen!, 9); // 9번 = 1번(8~15는 0~7과 같다)
    expect(glyph[0]).toEqual([false, true, true, true, false]);
    expect(glyph[1]).toEqual([true, false, false, false, true]);
    expect(glyph[6]).toEqual([true, true, true, true, true]);
  });
});

describe('요약(lcdSummary — 화면 낭독기 <desc>)', () => {
  it('글자·빈 줄·사용자 정의 글자·커서·백라이트를 한국어로', () => {
    expect(lcdSummary(null)).toBe('전원이 꺼져 있어요.');
    expect(lcdSummary(POWER_ON_SCREEN)).toBe('화면이 꺼져 있어 글자가 보이지 않아요, 백라이트 켜짐.');
    const screen = parseLcdState(stateWith('Counter: 3', '', { cursor: [0, 10], backlight: false }));
    expect(lcdSummary(screen)).toBe('1줄 "Counter: 3", 2줄 비어 있음, 커서 1줄 11칸, 백라이트 꺼짐.');
    const custom = parseLcdState(stateWith(String.fromCharCode(0), ''));
    expect(lcdSummary(custom)).toContain(`${LCD_CUSTOM_MARK}은 사용자 정의 글자`);
  });
});
