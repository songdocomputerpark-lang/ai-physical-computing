/**
 * 블록 모드 도구 상자(카테고리 목록) — 순수 데이터(Blockly를 import하지 않는다). Blockly.inject(…, { toolbox: buildToolbox() }).
 *
 * 순서는 교과서 2단원 흐름(보드 → 센서 → 빛 → 소리 → 움직임 → 화면)과 "반복·조건 → 기다리기 → 계산 → 변수".
 * 값 칸에는 기본 숫자·글자 블록(shadow)을 끼워 두어, 학생이 블록을 끌어 놓기만 해도 코드가 돈다(예: 0.5초 기다리기).
 * 카테고리 이름·설명 글은 한국어, 색 이름은 theme.ts(categorystyle).
 */
import { BLOCK_STYLES } from './blocks.ts';

export interface ToolboxItem {
  readonly kind: 'block' | 'label' | 'sep';
  readonly type?: string;
  readonly text?: string;
  readonly gap?: number;
  readonly inputs?: Record<string, unknown>;
  readonly fields?: Record<string, unknown>;
  readonly extraState?: Record<string, unknown>;
}

export interface ToolboxCategory {
  readonly kind: 'category';
  readonly name: string;
  readonly categorystyle: string;
  readonly contents?: readonly ToolboxItem[];
  readonly custom?: string;
  readonly toolboxitemid?: string;
}

export interface ToolboxDefinitionJson {
  readonly kind: 'categoryToolbox';
  readonly contents: readonly ToolboxCategory[];
}

/** 숫자 기본 블록(shadow)을 끼운 값 칸 */
function numberInput(value: number): Record<string, unknown> {
  return { shadow: { type: 'math_number', fields: { NUM: value } } };
}

function textInput(value: string): Record<string, unknown> {
  return { shadow: { type: 'text', fields: { TEXT: value } } };
}

const block = (type: string, extra: Omit<ToolboxItem, 'kind' | 'type'> = {}): ToolboxItem => ({ kind: 'block', type, ...extra });
const label = (text: string): ToolboxItem => ({ kind: 'label', text });

/** 카테고리 색 이름(블록 style 이름의 _blocks를 _category로) */
export function categoryStyleOf(blockStyle: string): string {
  return blockStyle.replace(/_blocks$/u, '_category');
}

/**
 * 도구 상자 카테고리 id(Blockly가 카테고리 줄 요소의 HTML id로 쓴다 — 페이지의 다른 id와 겹치지 않게 머리말을 붙인다).
 * 브라우저 테스트는 `#blocks-cat-flow`처럼 카테고리를 누른다.
 */
export const TOOLBOX_CATEGORY_IDS = [
  'blocks-cat-board',
  'blocks-cat-sensor',
  'blocks-cat-light',
  'blocks-cat-sound',
  'blocks-cat-motion',
  'blocks-cat-display',
  'blocks-cat-flow',
  'blocks-cat-wait',
  'blocks-cat-calc',
  'blocks-cat-variables',
] as const;

export function buildToolbox(): ToolboxDefinitionJson {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: '보드',
        toolboxitemid: 'blocks-cat-board',
        categorystyle: categoryStyleOf(BLOCK_STYLES.board),
        contents: [
          label('보드에 붙은 LED(GPIO2)'),
          block('apc_builtin_led', { fields: { STATE: 'on' } }),
          block('apc_builtin_led', { fields: { STATE: 'off' } }),
          block('apc_builtin_led_toggle'),
          label('BOOT 버튼(GPIO0) — 누르면 0이 되는 거꾸로 동작하는 버튼'),
          block('apc_boot_pressed'),
          block('apc_boot_value'),
        ],
      },
      {
        kind: 'category',
        name: '센서',
        toolboxitemid: 'blocks-cat-sensor',
        categorystyle: categoryStyleOf(BLOCK_STYLES.sensor),
        contents: [label('터치 센서 — 누르고 있으면 1, 떼면 0'), block('apc_touch_pressed'), block('apc_touch_value')],
      },
      {
        kind: 'category',
        name: '빛',
        toolboxitemid: 'blocks-cat-light',
        categorystyle: categoryStyleOf(BLOCK_STYLES.light),
        contents: [
          label('RGB LED'),
          block('apc_rgb_color'),
          block('apc_rgb_brightness', { inputs: { R: numberInput(1023), G: numberInput(0), B: numberInput(0) } }),
          label('레이저 — 빛을 눈에 비추지 않아요'),
          block('apc_laser'),
          label('네오픽셀 LED 16개 링'),
          block('apc_neopixel_set', { inputs: { INDEX: numberInput(0), R: numberInput(255), G: numberInput(0), B: numberInput(0) } }),
          block('apc_neopixel_fill', { inputs: { R: numberInput(0), G: numberInput(0), B: numberInput(255) } }),
          block('apc_neopixel_write'),
        ],
      },
      {
        kind: 'category',
        name: '소리',
        toolboxitemid: 'blocks-cat-sound',
        categorystyle: categoryStyleOf(BLOCK_STYLES.sound),
        contents: [
          label('버저'),
          block('apc_buzzer_note', { inputs: { SECONDS: numberInput(0.5) } }),
          block('apc_buzzer_tone', { inputs: { FREQ: numberInput(440) } }),
          block('apc_buzzer_off'),
          label('MP3 모듈(UART2)'),
          block('apc_mp3_volume', { inputs: { VOLUME: numberInput(15) } }),
          block('apc_mp3_play', { inputs: { TRACK: numberInput(1) } }),
          block('apc_mp3_control'),
        ],
      },
      {
        kind: 'category',
        name: '움직임',
        toolboxitemid: 'blocks-cat-motion',
        categorystyle: categoryStyleOf(BLOCK_STYLES.motion),
        contents: [
          block('apc_vibration'),
          block('apc_servo', { inputs: { ANGLE: numberInput(90) } }),
          label('팬 모터 — 날개에 손을 대지 않아요'),
          block('apc_fan'),
          block('apc_fan_speed', { inputs: { SPEED: numberInput(50) } }),
        ],
      },
      {
        kind: 'category',
        name: '화면',
        toolboxitemid: 'blocks-cat-display',
        categorystyle: categoryStyleOf(BLOCK_STYLES.display),
        contents: [
          label('문자 LCD(16칸×2줄)'),
          block('apc_lcd_clear'),
          block('apc_lcd_cursor', { inputs: { COL: numberInput(0), ROW: numberInput(0) } }),
          block('apc_lcd_print', { inputs: { TEXT: textInput('Hello') } }),
          label('OLED(128×64)'),
          block('apc_oled_clear'),
          block('apc_oled_text', { inputs: { X: numberInput(0), Y: numberInput(0), TEXT: textInput('Hello') } }),
          block('apc_oled_pixel', { inputs: { X: numberInput(64), Y: numberInput(32) } }),
          block('apc_oled_show'),
        ],
      },
      {
        kind: 'category',
        name: '반복·조건',
        toolboxitemid: 'blocks-cat-flow',
        categorystyle: 'loop_category',
        contents: [
          // 처음 블록 실습(시나리오 B "터치 센서를 누르면 LED")에 쓰는 것을 위에: 계속 반복 → 만약·아니면 → 만약
          block('apc_forever'),
          block('controls_if', { extraState: { hasElse: true } }),
          block('controls_if'),
          block('controls_repeat_ext', { inputs: { TIMES: numberInput(3) } }),
          block('controls_whileUntil'),
          block('controls_for', { inputs: { FROM: numberInput(0), TO: numberInput(15), BY: numberInput(1) } }),
          block('controls_flow_statements'),
        ],
      },
      {
        kind: 'category',
        name: '기다리기',
        toolboxitemid: 'blocks-cat-wait',
        categorystyle: categoryStyleOf(BLOCK_STYLES.wait),
        contents: [block('apc_wait_seconds', { inputs: { SECONDS: numberInput(0.5) } }), block('apc_wait_ms', { inputs: { MS: numberInput(20) } })],
      },
      {
        kind: 'category',
        name: '계산',
        toolboxitemid: 'blocks-cat-calc',
        categorystyle: 'logic_category',
        contents: [
          block('logic_compare', { inputs: { A: numberInput(0), B: numberInput(0) } }),
          block('logic_operation'),
          block('logic_negate'),
          block('logic_boolean'),
          block('math_number', { fields: { NUM: 0 } }),
          block('math_arithmetic', { inputs: { A: numberInput(1), B: numberInput(1) } }),
          block('math_random_int', { inputs: { FROM: numberInput(1), TO: numberInput(100) } }),
          block('text'),
          block('text_print', { inputs: { TEXT: textInput('안녕') } }),
        ],
      },
      { kind: 'category', name: '변수', toolboxitemid: 'blocks-cat-variables', categorystyle: 'variable_category', custom: 'VARIABLE' },
    ],
  };
}

/** 도구 상자에 들어 있는 블록 type 전체(중복 없음) */
export function toolboxBlockTypes(toolbox: ToolboxDefinitionJson = buildToolbox()): string[] {
  const types = new Set<string>();
  for (const category of toolbox.contents) {
    for (const item of category.contents ?? []) {
      if (item.kind === 'block' && item.type) {
        types.add(item.type);
      }
      for (const input of Object.values(item.inputs ?? {})) {
        const shadow = (input as { shadow?: { type?: string } }).shadow;
        if (shadow?.type) {
          types.add(shadow.type);
        }
      }
    }
    if (category.custom === 'VARIABLE') {
      types.add('variables_get');
      types.add('variables_set');
      types.add('math_change');
    }
  }
  return [...types];
}
