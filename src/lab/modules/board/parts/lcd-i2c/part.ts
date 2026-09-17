/**
 * 부품: 문자 LCD 16×2 + I2C 백팩(주소 0x20) — 바깥 출력 부품(PLAN §6.2 "문자 LCD 16×2 + I2C 백팩(0x20) | 2-1-2, 4-1-4, 4-2-1, 4-2-2, BT",
 * §8.3 P3-04, 원고 124~131쪽). 부품 id lcd-i2c는 README 7.5의 약속 id(f052 사이드카가 먼저 씀).
 *
 * 핀: sda(데이터)·scl(클럭) — 기본 GPIO21·22(원고 125쪽 "SDA(21번 핀)·SCL(22번 핀)"). I2C 선은 보드와 부품이 함께 쓰는 선이지만,
 * 보드가 신호를 내보내는 쪽(오픈 드레인 출력)이라 방향은 'out'이다 — 배선 검사가 34~39번(입력 전용)에 이으면 오류로, 한 선에 I2C 부품 여럿이면
 * "같은 신호를 받아요"(참고)로 알린다. 전원 다리는 GND·VCC(원고 "GND·VCC·SDA·SCL" 4핀).
 * 화면: 파이썬 부품 흉내(apc_part_lcd_i2c.py — PCF8574 → HD44780 바이트 해석)가 보낸 'board.device' 상태를 lcd-screen.ts로 읽어 16×2 글자 칸에 그린다.
 * 보드가 멈췄으면(전원 없음) 백라이트까지 꺼지고, 실행을 시작했는데 상태가 아직 없으면 전원 직후 모습(백라이트 켜짐·글자 없음)이다.
 * 모습 값(data-visual-*): lit(백라이트), display(화면 켜짐), line1·line2(16글자 — 빈칸은 공백, 사용자 정의 글자는 ▯), cursor("행,열" 또는 ""),
 * blink, frame(받은 상태 순서 번호).
 * 글자는 SVG <text data-lcd-line="0|1"> 안의 칸마다 <tspan data-lcd-cell="행-열">(빈칸은 줄바꿈 없는 공백)로 그려 DOM 글자로도 읽힌다.
 * 화면 낭독기: 보드 화면(view.ts)이 부품에 붙이는 이름("문자 LCD(16×2)(GPIO21·GPIO22): 켜짐 — 설명") 뒤에, 부품 요소의 <desc>로
 * 지금 화면 글자를 설명한다(lcd-screen.ts lcdSummary).
 * 그림: 사이트가 직접 그린 브랜드 중립 1602 모듈(초록 기판·검은 테두리·파란 백라이트 유리·흰 글자 — 원고 124·128쪽 키트 사진의 색).
 */
import type { PartDefinition } from '../../part-types.ts';
import { isLive } from '../../state.ts';
import { LCD_COLUMNS, LCD_ROWS, POWER_ON_SCREEN, customGlyph, isCustomCode, lcdCharacter, lcdLine, lcdSummary, parseLcdState, type LcdScreen } from './lcd-screen.ts';

const WIDTH = 232;
const HEIGHT = 92;
const CELL_WIDTH = 12;
const CELL_HEIGHT = 20;
const GLASS_PAD_X = 6;
const GLASS_PAD_Y = 4;
const GLASS_X = Math.round((WIDTH - (LCD_COLUMNS * CELL_WIDTH + 2 * GLASS_PAD_X)) / 2);
const GLASS_Y = 22;
const GLASS_WIDTH = LCD_COLUMNS * CELL_WIDTH + 2 * GLASS_PAD_X;
const GLASS_HEIGHT = LCD_ROWS * CELL_HEIGHT + 2 * GLASS_PAD_Y;
/** 줄바꿈 없는 공백(U+00A0) — SVG가 빈 칸 글자를 지우지 않게 */
const NBSP = String.fromCharCode(0xa0);

const COLORS = Object.freeze({
  board: '#14532d',
  boardStroke: '#0b3b1f',
  bezel: '#0b1220',
  glassOn: '#1d4ed8',
  glassOff: '#1e293b',
  cellOn: '#2f5fe0',
  cellOff: '#243244',
  textOn: '#f8fafc',
  textOff: '#3d4b5f',
});

/** 보이는 화면: 멈췄으면 null(전원 없음), 실행 중인데 상태가 없으면 전원 직후 모습 */
function currentScreen(live: boolean, state: unknown): LcdScreen | null {
  if (!live) {
    return null;
  }
  return parseLcdState(state) ?? POWER_ON_SCREEN;
}

function cellX(column: number): number {
  return GLASS_X + GLASS_PAD_X + column * CELL_WIDTH;
}

function cellY(row: number): number {
  return GLASS_Y + GLASS_PAD_Y + row * CELL_HEIGHT;
}

const definition: PartDefinition = {
  id: 'lcd-i2c',
  title: '문자 LCD(16×2)',
  description: 'I2C(주소 0x20)로 글자를 받아 16칸 2줄에 보여 주는 문자 LCD예요.',
  pins: [
    { role: 'sda', label: 'SDA', direction: 'out' },
    { role: 'scl', label: 'SCL', direction: 'out' },
  ],
  defaultPins: { sda: 21, scl: 22 },
  size: { width: WIDTH, height: HEIGHT },
  python: 'apc_part_lcd_i2c',
  visual({ snapshot, device }) {
    const screen = currentScreen(isLive(snapshot), device?.state);
    return {
      lit: screen?.backlight ?? false,
      display: screen?.display ?? false,
      line1: screen ? lcdLine(screen, 0) : ' '.repeat(LCD_COLUMNS),
      line2: screen ? lcdLine(screen, 1) : ' '.repeat(LCD_COLUMNS),
      cursor: screen?.cursor ? `${screen.cursor[0]},${screen.cursor[1]}` : '',
      blink: screen?.blink ?? false,
      frame: device?.seq ?? 0,
    };
  },
  render(target, { svg, instance }) {
    const pinMarks = ['sda', 'scl'].map((role, index) =>
      svg('rect', { x: 5 + index * 18, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8, 'data-role': role }),
    );
    const board = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 5, fill: COLORS.board, stroke: COLORS.boardStroke, 'stroke-width': 1.2 });
    const pinLabel = svg('text', { x: 41, y: 13, class: 'board-part__label board-part__label--small' }, [`SDA IO${instance.pins.sda ?? ''} · SCL IO${instance.pins.scl ?? ''}`]);
    // Pretendard는 숫자 사이의 x를 곱하기 기호(×)로 바꿔 그려 "0x20"이 "0×20"으로 보인다 — 합자·문맥 대체를 끈다(2026-09-18 Edge에서 확인)
    const title = svg('text', { x: WIDTH - 6, y: 13, 'text-anchor': 'end', class: 'board-part__title', style: 'font-variant-ligatures: none;' }, ['문자 LCD 0x20']);
    const bezel = svg('rect', { x: GLASS_X - 4, y: GLASS_Y - 4, width: GLASS_WIDTH + 8, height: GLASS_HEIGHT + 8, rx: 3, fill: COLORS.bezel });
    const glass = svg('rect', { x: GLASS_X, y: GLASS_Y, width: GLASS_WIDTH, height: GLASS_HEIGHT, rx: 2, fill: COLORS.glassOff });
    const cells: SVGRectElement[] = [];
    const cellLayer = svg('g', { 'aria-hidden': 'true' });
    for (let row = 0; row < LCD_ROWS; row += 1) {
      for (let column = 0; column < LCD_COLUMNS; column += 1) {
        const cell = svg('rect', { x: cellX(column) + 1, y: cellY(row) + 2, width: CELL_WIDTH - 2, height: CELL_HEIGHT - 4, fill: COLORS.cellOff, opacity: 0.55 });
        cells.push(cell);
        cellLayer.append(cell);
      }
    }
    const rows: SVGTextElement[] = [];
    const tspans: SVGTSpanElement[][] = [];
    const textLayer = svg('g', { class: 'board-lcd__text' });
    for (let row = 0; row < LCD_ROWS; row += 1) {
      const line = svg('text', {
        y: cellY(row) + CELL_HEIGHT - 5,
        'data-lcd-line': row,
        style: 'font-family: var(--font-mono), ui-monospace, monospace; font-size: 15px; font-weight: 600;',
        fill: COLORS.textOff,
        'text-anchor': 'middle',
      });
      const spans: SVGTSpanElement[] = [];
      for (let column = 0; column < LCD_COLUMNS; column += 1) {
        const span = svg('tspan', { x: cellX(column) + CELL_WIDTH / 2, 'data-lcd-cell': `${row}-${column}` }, [NBSP]);
        spans.push(span);
        line.append(span);
      }
      rows.push(line);
      tspans.push(spans);
      textLayer.append(line);
    }
    const customLayer = svg('g', { 'data-lcd-custom': '', 'aria-hidden': 'true' });
    const underline = svg('rect', { width: CELL_WIDTH - 2, height: 2, fill: COLORS.textOn, opacity: 0, 'data-lcd-cursor': 'underline' });
    const block = svg('rect', { width: CELL_WIDTH - 2, height: CELL_HEIGHT - 4, fill: COLORS.textOn, opacity: 0, 'data-lcd-cursor': 'block' });
    const state = svg('text', { x: WIDTH / 2, y: HEIGHT - 7, 'text-anchor': 'middle', class: 'board-part__state' }, ['전원 꺼짐']);
    target.append(board, ...pinMarks, pinLabel, title, bezel, glass, cellLayer, textLayer, customLayer, underline, block, state);

    let blinkAnimation: Animation | null = null;
    let desc: SVGDescElement | null = null;

    const describe = (text: string) => {
      // 부품 요소(view.ts가 만든 role="img" <g>)의 <desc>가 화면 낭독기의 설명이 된다(SVG-AAM). 한 번 만들고 글만 바꾼다.
      const root = target.closest('[data-board-part]');
      if (!root) {
        return;
      }
      if (!desc || desc.parentNode !== root) {
        desc = svg('desc', { 'data-part-desc': '' });
        root.insertBefore(desc, root.firstChild);
      }
      if (desc.textContent !== text) {
        desc.textContent = text;
      }
    };

    return (_visual, extra) => {
      const screen = currentScreen(isLive(extra.snapshot), extra.device?.state);
      const lit = screen?.backlight === true;
      glass.setAttribute('fill', lit ? COLORS.glassOn : COLORS.glassOff);
      for (const cell of cells) {
        cell.setAttribute('fill', lit ? COLORS.cellOn : COLORS.cellOff);
      }
      const textColor = lit ? COLORS.textOn : COLORS.textOff;
      customLayer.replaceChildren();
      for (let row = 0; row < LCD_ROWS; row += 1) {
        rows[row]?.setAttribute('fill', textColor);
        for (let column = 0; column < LCD_COLUMNS; column += 1) {
          const code = screen ? (screen.codes[row * LCD_COLUMNS + column] ?? 0x20) : 0x20;
          const span = tspans[row]?.[column];
          const custom = screen?.display === true && isCustomCode(code);
          const text = custom ? NBSP : lcdCharacter(code);
          const shown = text === ' ' ? NBSP : text;
          if (span && span.textContent !== shown) {
            span.textContent = shown;
          }
          if (custom && screen) {
            const glyph = customGlyph(screen, code);
            glyph.forEach((dots, dotRow) => {
              dots.forEach((on, dotColumn) => {
                if (on) {
                  customLayer.append(
                    svg('rect', { x: cellX(column) + 1 + dotColumn * 2, y: cellY(row) + 2 + dotRow * 2, width: 1.8, height: 1.8, fill: textColor }),
                  );
                }
              });
            });
          }
        }
      }
      const cursor = screen?.cursor ?? null;
      if (cursor) {
        const x = cellX(cursor[1]) + 1;
        const y = cellY(cursor[0]);
        underline.setAttribute('x', String(x));
        underline.setAttribute('y', String(y + CELL_HEIGHT - 4));
        block.setAttribute('x', String(x));
        block.setAttribute('y', String(y + 2));
      }
      underline.setAttribute('opacity', cursor && screen?.underline ? '1' : '0');
      const showBlink = Boolean(cursor && screen?.blink);
      if (showBlink && !extra.reducedMotion) {
        block.setAttribute('opacity', '0.85');
        if (!blinkAnimation && typeof block.animate === 'function') {
          // HD44780: 깜빡이는 커서는 약 0.4초마다 켜짐·꺼짐(데이터시트, 발진 250kHz 기준)
          blinkAnimation = block.animate(
            [
              { opacity: 0.85, offset: 0 },
              { opacity: 0.85, offset: 0.5 },
              { opacity: 0, offset: 0.5 },
              { opacity: 0, offset: 1 },
            ],
            { duration: 820, iterations: Infinity },
          );
        }
      } else {
        if (blinkAnimation) {
          blinkAnimation.cancel();
          blinkAnimation = null;
        }
        // 움직임 줄이기면 깜빡이지 않고 반투명 네모로 둔다
        block.setAttribute('opacity', showBlink ? '0.55' : '0');
      }
      if (!screen) {
        state.textContent = '전원 꺼짐';
      } else {
        state.textContent = `${lit ? '백라이트 켜짐' : '백라이트 꺼짐'} · ${screen.display ? '화면 켜짐' : '화면 꺼짐'}`;
      }
      describe(`문자 LCD 화면: ${lcdSummary(screen)}`);
    };
  },
};

export default definition;
