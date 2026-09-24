/**
 * 블록 모드 색(SPEC §9 "명도 대비 WCAG AA") — 블록 글자는 흰색이므로 블록 바탕색은 흰 글자와 대비 4.5:1 이상인 색만 쓴다.
 * 값의 대비는 tests/unit/blocks/theme.test.ts가 WCAG 상대 휘도 공식으로 확인한다(색을 바꾸면 그 검사가 막는다).
 * Blockly 기본 블록(반복·논리·수·글자·변수)의 기본 색(zelos 테마의 밝은 색)은 흰 글자 대비가 모자라 여기서 함께 바꾼다.
 * 글꼴은 사이트 글꼴(Pretendard, src/styles/tokens.css --font-sans와 같은 순서).
 */
import type { BlocklyApi } from './blockly-types.ts';

/** 블록 style 이름 → 바탕색(흰 글자와 대비 4.5:1 이상) */
export const BLOCK_COLOURS: Readonly<Record<string, string>> = Object.freeze({
  apc_board_blocks: '#1f5bd6', // 보드(파랑) — 사이트 강조색과 같음
  apc_sensor_blocks: '#0f766e', // 센서(청록)
  apc_light_blocks: '#c2410c', // 빛(주황)
  apc_sound_blocks: '#be185d', // 소리(자홍)
  apc_motion_blocks: '#6d28d9', // 움직임(보라)
  apc_display_blocks: '#475569', // 화면(청회색)
  apc_comm_blocks: '#155e9c', // 통신(짙은 파랑, P4-10) — 보드(#1f5bd6)보다 어둡게. src/lab/blocks/comm/blocks.ts COMM_BLOCK_COLOUR와 같은 값
  apc_wait_blocks: '#a16207', // 기다리기(겨자)
  loop_blocks: '#15803d', // 반복·조건(초록)
  logic_blocks: '#15803d',
  math_blocks: '#3f6212', // 수(올리브)
  text_blocks: '#86198f', // 글자(자주)
  variable_blocks: '#92400e', // 변수(갈색)
  variable_dynamic_blocks: '#92400e',
  procedure_blocks: '#9d174d',
  list_blocks: '#5b21b6',
  colour_blocks: '#9f1239',
  hat_blocks: '#1f5bd6',
});

/** 블록 글자색(Blockly zelos·classic이 쓰는 흰색) */
export const BLOCK_TEXT_COLOUR = '#ffffff';

export const BLOCKS_THEME_NAME = 'apc-esp32';

/** WCAG 2.x 상대 휘도 */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(hex);
  if (!match) {
    throw new Error(`색 "${hex}"은(는) #rrggbb 모양이 아니에요.`);
  }
  const [r, g, b] = [match[1]!, match[2]!, match[3]!].map((part) => {
    const channel = Number.parseInt(part, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** 두 색의 명도 대비(1~21) */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

/** Blockly 테마를 만든다(같은 이름으로 다시 부르면 같은 설정으로 덮어쓴다) */
export function defineBlocksTheme(Blockly: BlocklyApi) {
  const blockStyles: Record<string, { colourPrimary: string }> = {};
  const categoryStyles: Record<string, { colour: string }> = {};
  for (const [style, colour] of Object.entries(BLOCK_COLOURS)) {
    blockStyles[style] = { colourPrimary: colour };
    categoryStyles[style.replace(/_blocks$/u, '_category')] = { colour };
  }
  return Blockly.Theme.defineTheme(BLOCKS_THEME_NAME, {
    name: BLOCKS_THEME_NAME,
    base: Blockly.Themes.Zelos,
    blockStyles,
    categoryStyles,
    componentStyles: {
      workspaceBackgroundColour: '#ffffff',
      toolboxBackgroundColour: '#f6f8fb',
      toolboxForegroundColour: '#17191c',
      flyoutBackgroundColour: '#edf1f6',
      flyoutForegroundColour: '#17191c',
      flyoutOpacity: 1,
      scrollbarColour: '#7b8594',
      insertionMarkerColour: '#17191c',
      insertionMarkerOpacity: 0.3,
      cursorColour: '#0b50c8',
      selectedGlowColour: '#0b50c8',
    },
    fontStyle: {
      family: "'Pretendard Variable', Pretendard, 'Pretendard Fallback', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
      weight: '600',
      size: 12,
    },
  });
}
