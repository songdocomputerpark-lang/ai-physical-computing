/**
 * 문자 LCD 16×2(lcd-i2c) 화면 모양 — 순수 함수(DOM 없음, tests/unit/lab/board-part-lcd-i2c.test.ts·tests/unit/board-i2c/lcd-screen.test.ts).
 *
 * 파이썬 부품 흉내(apc_part_lcd_i2c.py의 LcdI2cDevice.state)가 'board.device'로 보내는 상태(src/lab/README.md 7.3):
 *   { v: 1, cols: 16, rows: 2,
 *     codes: Uint8Array(32)   보이는 16×2칸의 글자 코드(행 우선 — 화면 이동·화면 끔·1줄 모드를 이미 반영),
 *     backlight: boolean      PCF8574 비트 3(백라이트),
 *     display: boolean        HD44780 D 비트(화면 켜짐),
 *     underline: boolean, blink: boolean   커서 밑줄(C)·깜빡이는 네모(B),
 *     cursor?: [row, col]     커서가 보이는 칸(보이지 않으면 없음),
 *     lines: 1 | 2, bits: 4 | 8,
 *     cgram: Uint8Array(64)   사용자 정의 글자 8개 × 8줄(한 줄의 아래 5비트, 비트 4가 왼쪽 점) }
 * 브라우저로는 bytes가 Uint8Array로 오고, Node 시험 도구(JSON)로는 {"0": 72, …} 모양으로 온다 — 둘 다 읽는다.
 *
 * 글자 모양: HD44780 A00 문자표(일본어 표준 ROM — 1602 모듈에 가장 흔한 판). 0x20~0x7D는 ASCII와 같고 0x5C는 ¥, 0x7E는 →, 0x7F는 ←,
 * 0xA1~0xDF는 반각 가타카나(JIS X 0201), 0xE0~0xFF는 그리스 글자·기호, 0x00~0x0F는 CGRAM(사용자 정의 글자 — 점 그림으로 그림),
 * 0x10~0x1F·0x80~0xA0은 빈칸. 교과서 키트 LCD의 문자표(A00·A02)는 실물 확인 전이다(부록 B-2). 한글은 i2c_lcd.py가 ord()의 아래 8비트만 보내
 * 엉뚱한 글자가 된다(CODE_MAPPING f049 비고) — 가상 LCD도 그 코드를 이 표로 보여 준다.
 */

export const LCD_COLUMNS = 16;
export const LCD_ROWS = 2;
/** 사용자 정의 글자(CGRAM) 칸을 글자로 나타낼 때 쓰는 표시(요약·data-visual-line) */
export const LCD_CUSTOM_MARK = '▯';

export interface LcdScreen {
  readonly cols: number;
  readonly rows: number;
  /** 행 우선 글자 코드(cols × rows) */
  readonly codes: readonly number[];
  readonly backlight: boolean;
  readonly display: boolean;
  readonly underline: boolean;
  readonly blink: boolean;
  /** 커서가 보이는 칸 [행, 열] */
  readonly cursor: readonly [number, number] | null;
  /** 사용자 정의 글자 8개 × 8줄 */
  readonly cgram: readonly number[];
}

/** 전원을 켠 직후(부품 흉내가 아직 상태를 보내지 않음): PCF8574 핀이 모두 1이라 백라이트는 켜지고, HD44780은 화면을 끈 채 시작한다 */
export const POWER_ON_SCREEN: LcdScreen = Object.freeze({
  cols: LCD_COLUMNS,
  rows: LCD_ROWS,
  codes: Object.freeze(Array.from({ length: LCD_COLUMNS * LCD_ROWS }, () => 0x20)),
  backlight: true,
  display: false,
  underline: false,
  blink: false,
  cursor: null,
  cgram: Object.freeze(Array.from({ length: 64 }, () => 0)),
});

/** Uint8Array·숫자 배열·{"0": n, …}(JSON으로 온 Uint8Array)을 길이 length의 바이트 목록으로. 모양이 틀리면 null */
export function byteList(value: unknown, length: number): number[] | null {
  let items: unknown[] | null = null;
  if (value instanceof Uint8Array || Array.isArray(value)) {
    items = Array.from(value as ArrayLike<unknown>);
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    items = Array.from({ length }, (_, index) => record[String(index)]);
  }
  if (!items || items.length < length) {
    return null;
  }
  const bytes: number[] = [];
  for (let index = 0; index < length; index += 1) {
    const item = items[index];
    if (typeof item !== 'number' || !Number.isInteger(item) || item < 0 || item > 255) {
      return null;
    }
    bytes.push(item);
  }
  return bytes;
}

/** 파이썬이 보낸 LCD 상태를 읽는다(모양이 틀리면 null — 화면은 전원 직후 모습으로 둔다) */
export function parseLcdState(state: unknown): LcdScreen | null {
  if (!state || typeof state !== 'object') {
    return null;
  }
  const raw = state as Record<string, unknown>;
  const codes = byteList(raw.codes, LCD_COLUMNS * LCD_ROWS);
  if (!codes) {
    return null;
  }
  const cgram = byteList(raw.cgram, 64) ?? [...POWER_ON_SCREEN.cgram];
  let cursor: [number, number] | null = null;
  const place = raw.cursor;
  if (Array.isArray(place) && place.length === 2) {
    const [row, col] = place;
    if (Number.isInteger(row) && Number.isInteger(col) && (row as number) >= 0 && (row as number) < LCD_ROWS && (col as number) >= 0 && (col as number) < LCD_COLUMNS) {
      cursor = [row as number, col as number];
    }
  }
  return {
    cols: LCD_COLUMNS,
    rows: LCD_ROWS,
    codes,
    backlight: raw.backlight === true,
    display: raw.display === true,
    underline: raw.underline === true,
    blink: raw.blink === true,
    cursor,
    cgram,
  };
}

/** A00 문자표 0xE0~0xFF(Hitachi HD44780U 데이터시트 Table 4, ROM Code A00). 한 칸에 글자 하나로 보이게 가까운 유니코드로 적었다 */
const A00_HIGH: readonly string[] = [
  'α', 'ä', 'β', 'ε', 'μ', 'σ', 'ρ', 'g', '√', '⁻', 'j', 'ˣ', '¢', '£', 'ñ', 'ö',
  'p', 'q', 'θ', '∞', 'Ω', 'ü', 'Σ', 'π', 'x̄', 'y', '千', '万', '円', '÷', ' ', '█',
];

/** 코드가 사용자 정의 글자(CGRAM 0~7, 8~15는 0~7과 같음)인지 */
export function isCustomCode(code: number): boolean {
  return code >= 0 && code < 0x10;
}

/** A00 문자표로 본 글자 하나. 빈칸 코드는 ' ', 사용자 정의 글자는 LCD_CUSTOM_MARK */
export function lcdCharacter(code: number): string {
  if (isCustomCode(code)) {
    return LCD_CUSTOM_MARK;
  }
  if (code === 0x5c) {
    return '¥';
  }
  if (code === 0x7e) {
    return '→';
  }
  if (code === 0x7f) {
    return '←';
  }
  if (code >= 0x20 && code < 0x7e) {
    return String.fromCharCode(code);
  }
  if (code >= 0xa1 && code <= 0xdf) {
    return String.fromCharCode(0xff61 + (code - 0xa1));
  }
  if (code >= 0xe0 && code <= 0xff) {
    return A00_HIGH[code - 0xe0] ?? ' ';
  }
  return ' ';
}

/** 한 줄(16칸)의 글자 — 빈칸은 공백, 사용자 정의 글자는 LCD_CUSTOM_MARK */
export function lcdLine(screen: LcdScreen, row: number): string {
  const start = row * screen.cols;
  return screen.codes
    .slice(start, start + screen.cols)
    .map((code) => lcdCharacter(code))
    .join('');
}

/** 사용자 정의 글자 한 칸의 점(8줄 × 5열, 켜진 점이 true) */
export function customGlyph(screen: LcdScreen, code: number): boolean[][] {
  const base = (code & 0x07) * 8;
  return Array.from({ length: 8 }, (_, row) => {
    const bits = screen.cgram[base + row] ?? 0;
    return Array.from({ length: 5 }, (_, col) => ((bits >> (4 - col)) & 1) === 1);
  });
}

/** 화면 낭독기·배선 목록에 쓰는 한국어 요약 */
export function lcdSummary(screen: LcdScreen | null): string {
  if (!screen) {
    return '전원이 꺼져 있어요.';
  }
  const parts: string[] = [];
  if (!screen.display) {
    parts.push('화면이 꺼져 있어 글자가 보이지 않아요');
  } else {
    const lines = Array.from({ length: screen.rows }, (_, row) => lcdLine(screen, row).trimEnd());
    lines.forEach((line, row) => {
      parts.push(`${row + 1}줄 ${line === '' ? '비어 있음' : `"${line}"`}`);
    });
    if (screen.codes.some((code) => isCustomCode(code))) {
      parts.push(`${LCD_CUSTOM_MARK}은 사용자 정의 글자`);
    }
    if (screen.cursor) {
      parts.push(`커서 ${screen.cursor[0] + 1}줄 ${screen.cursor[1] + 1}칸`);
    }
  }
  parts.push(screen.backlight ? '백라이트 켜짐' : '백라이트 꺼짐');
  return `${parts.join(', ')}.`;
}
