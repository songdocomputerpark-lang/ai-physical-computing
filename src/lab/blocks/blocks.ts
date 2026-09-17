/**
 * 블록 모드의 사용자 정의 블록(PLAN §8.3 P3-06: 내장 LED, BOOT 버튼, 터치, 진동 모터, RGB LED, 레이저, 버저, 서보, 팬, LCD, OLED, 네오픽셀, MP3,
 * 반복·조건·대기). Blockly JSON 정의라 모양·글자만 있고, 코드는 codegen.ts가 만든다.
 *
 * 규칙
 * - 글은 고1이 처음 읽어도 되는 한국어. 블록 이름에 부품 이름과 핀 번호를 함께 보인다(배선도와 같은 번호).
 * - 핀 고르기는 30핀 개발 보드에 핀 머리가 있는 번호만(catalog.ts OUTPUT_PINS·INPUT_PINS) — 없는 핀을 고를 수 없게.
 * - 툴팁(마우스를 올리거나 Ctrl+J)에 "무엇을 하는지 + 코드 한 줄"을 적어 블록 = 코드를 익히게 한다.
 * - 색은 style 이름으로만 정하고 값은 theme.ts(흰 글자와 명도 대비 4.5:1 이상).
 * - 블록 type 이름은 apc_로 시작한다(저장된 작업판 JSON에 들어가므로 바꾸면 옛 저장본을 못 읽는다 — 바꿀 때는 presets.ts·테스트도 함께).
 */
import type { BlocklyApi } from './blockly-types.ts';
import { BUZZER_NOTES, INPUT_PINS, MP3_COMMANDS, OUTPUT_PINS, RGB_COLORS, RGB_PIN_SETS, partKindInfo, type PartKind } from './catalog.ts';

/** 블록 색 이름(theme.ts가 값을 정한다) */
export const BLOCK_STYLES = {
  board: 'apc_board_blocks',
  sensor: 'apc_sensor_blocks',
  light: 'apc_light_blocks',
  sound: 'apc_sound_blocks',
  motion: 'apc_motion_blocks',
  display: 'apc_display_blocks',
  flow: 'loop_blocks',
  wait: 'apc_wait_blocks',
} as const;

type DropdownOptions = [string, string][];

function pinOptions(pins: readonly number[]): DropdownOptions {
  return pins.map((pin) => [String(pin), String(pin)]);
}

/** 기본 핀을 맨 앞에 둔 선택지(Blockly 드롭다운은 첫 선택지가 기본값) */
function pinOptionsWithDefault(pins: readonly number[], kind: PartKind, role: string): DropdownOptions {
  const fallback = pins[0] ?? 0;
  const preferred = partKindInfo(kind).defaultPins[role] ?? fallback;
  const options = pinOptions(pins);
  const index = options.findIndex(([, value]) => value === String(preferred));
  if (index > 0) {
    const [chosen] = options.splice(index, 1);
    options.unshift(chosen!);
  }
  return options;
}

const ON_OFF: DropdownOptions = [
  ['켜기', 'on'],
  ['끄기', 'off'],
];

/** JSON 블록 정의 한 개(Blockly.common.createBlockDefinitionsFromJsonArray가 받는 모양) */
export interface BlockJson {
  readonly type: string;
  readonly [key: string]: unknown;
}

/** 사용자 정의 블록 전체 */
export const BLOCK_DEFINITIONS: readonly BlockJson[] = Object.freeze([
  // ── 보드에 붙은 부품 ──
  {
    type: 'apc_builtin_led',
    message0: '내장 LED %1',
    args0: [{ type: 'field_dropdown', name: 'STATE', options: ON_OFF }],
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.board,
    tooltip: '보드에 붙은 LED(GPIO2)를 켜거나 꺼요. 코드: led.on() / led.off()',
  },
  {
    type: 'apc_builtin_led_toggle',
    message0: '내장 LED 켜짐·꺼짐 바꾸기',
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.board,
    tooltip: '켜져 있으면 끄고, 꺼져 있으면 켜요. 코드: led.value(not led.value())',
  },
  {
    type: 'apc_boot_pressed',
    message0: 'BOOT 버튼을 누르고 있나요?',
    output: 'Boolean',
    style: BLOCK_STYLES.board,
    tooltip: 'BOOT 버튼(GPIO0)은 누르면 0, 떼면 1이 되는 "거꾸로 동작하는 버튼"이에요. 그래서 코드는 button.value() == 0으로 확인해요.',
  },
  {
    type: 'apc_boot_value',
    message0: 'BOOT 버튼 값 (누르면 0)',
    output: 'Number',
    style: BLOCK_STYLES.board,
    tooltip: 'BOOT 버튼(GPIO0)의 값: 누르고 있으면 0, 떼면 1. 코드: button.value()',
  },

  // ── 센서 ──
  {
    type: 'apc_touch_pressed',
    message0: '터치 센서 (핀 %1) 누르고 있나요?',
    args0: [{ type: 'field_dropdown', name: 'PIN', options: pinOptionsWithDefault(INPUT_PINS, 'touch', 'sig') }],
    output: 'Boolean',
    style: BLOCK_STYLES.sensor,
    tooltip: '터치 센서는 손가락을 대고 있는 동안 1, 떼면 0이에요. 코드: touch.value() == 1',
  },
  {
    type: 'apc_touch_value',
    message0: '터치 센서 (핀 %1) 값 (누르면 1)',
    args0: [{ type: 'field_dropdown', name: 'PIN', options: pinOptionsWithDefault(INPUT_PINS, 'touch', 'sig') }],
    output: 'Number',
    style: BLOCK_STYLES.sensor,
    tooltip: '터치 센서 값: 누르고 있으면 1, 떼면 0. 코드: touch.value()',
  },

  // ── 빛 ──
  {
    type: 'apc_rgb_color',
    message0: 'RGB LED (%1) 색 %2',
    args0: [
      { type: 'field_dropdown', name: 'PINS', options: RGB_PIN_SETS.map((set) => [set.label, set.value]) },
      { type: 'field_dropdown', name: 'COLOR', options: RGB_COLORS.map((color) => [color.label, color.value]) },
    ],
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.light,
    tooltip: 'RGB LED의 빨강·초록·파랑 핀을 켜거나 꺼서 색을 섞어요(빨강+초록 = 노랑). 코드: rgb_r.value(1) …',
  },
  {
    type: 'apc_rgb_brightness',
    message0: 'RGB LED (%1) 밝기 빨강 %2 초록 %3 파랑 %4',
    args0: [
      { type: 'field_dropdown', name: 'PINS', options: RGB_PIN_SETS.map((set) => [set.label, set.value]) },
      { type: 'input_value', name: 'R', check: 'Number' },
      { type: 'input_value', name: 'G', check: 'Number' },
      { type: 'input_value', name: 'B', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.light,
    tooltip: '밝기는 0(꺼짐)부터 1023(가장 밝음)까지예요. PWM이 켜져 있는 시간 비율로 밝기를 정해요. 코드: rgb_r.duty(512)',
  },
  {
    type: 'apc_laser',
    message0: '레이저 (핀 %1) %2',
    args0: [
      { type: 'field_dropdown', name: 'PIN', options: pinOptionsWithDefault(OUTPUT_PINS, 'laser', 'sig') },
      { type: 'field_dropdown', name: 'STATE', options: ON_OFF },
    ],
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.light,
    tooltip: '레이저 모듈을 켜거나 꺼요. 실물 레이저 빛은 절대 눈이나 사람 쪽으로 비추지 않아요. 코드: laser.on() / laser.off()',
  },
  {
    type: 'apc_neopixel_set',
    message0: '네오픽셀 (핀 %1) %2번 LED 색 빨강 %3 초록 %4 파랑 %5',
    args0: [
      { type: 'field_dropdown', name: 'PIN', options: pinOptionsWithDefault(OUTPUT_PINS, 'neopixel', 'din') },
      { type: 'input_value', name: 'INDEX', check: 'Number' },
      { type: 'input_value', name: 'R', check: 'Number' },
      { type: 'input_value', name: 'G', check: 'Number' },
      { type: 'input_value', name: 'B', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.light,
    tooltip: '16개 LED 가운데 한 개(0~15번)의 색을 정해요. 색 값은 0~255. 정한 색은 "정한 색 보이기" 블록을 써야 켜져요. 코드: np[0] = (255, 0, 0)',
  },
  {
    type: 'apc_neopixel_fill',
    message0: '네오픽셀 (핀 %1) 모든 LED 색 빨강 %2 초록 %3 파랑 %4',
    args0: [
      { type: 'field_dropdown', name: 'PIN', options: pinOptionsWithDefault(OUTPUT_PINS, 'neopixel', 'din') },
      { type: 'input_value', name: 'R', check: 'Number' },
      { type: 'input_value', name: 'G', check: 'Number' },
      { type: 'input_value', name: 'B', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.light,
    tooltip: '16개 LED의 색을 한꺼번에 정해요(0, 0, 0이면 모두 꺼짐). 코드: np.fill((0, 0, 255))',
  },
  {
    type: 'apc_neopixel_write',
    message0: '네오픽셀 (핀 %1) 정한 색 보이기',
    args0: [{ type: 'field_dropdown', name: 'PIN', options: pinOptionsWithDefault(OUTPUT_PINS, 'neopixel', 'din') }],
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.light,
    tooltip: '지금까지 정한 색을 LED로 한 번에 보내요. 이 블록을 쓰기 전에는 LED가 바뀌지 않아요. 코드: np.write()',
  },

  // ── 소리 ──
  {
    type: 'apc_buzzer_note',
    message0: '버저 (핀 %1) %2 음을 %3초 울리기',
    args0: [
      { type: 'field_dropdown', name: 'PIN', options: pinOptionsWithDefault(OUTPUT_PINS, 'buzzer', 'sig') },
      { type: 'field_dropdown', name: 'NOTE', options: BUZZER_NOTES.map((note) => [`${note.label}(${note.value}Hz)`, note.value]) },
      { type: 'input_value', name: 'SECONDS', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.sound,
    tooltip: '버저로 음 하나를 정한 시간만큼 울리고 멈춰요. 음 높이는 주파수(Hz)로 정해요. 코드: buzzer.freq(262) → buzzer.duty(512) → sleep → buzzer.duty(0)',
  },
  {
    type: 'apc_buzzer_tone',
    message0: '버저 (핀 %1) %2 Hz 소리 켜기',
    args0: [
      { type: 'field_dropdown', name: 'PIN', options: pinOptionsWithDefault(OUTPUT_PINS, 'buzzer', 'sig') },
      { type: 'input_value', name: 'FREQ', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.sound,
    tooltip: '정한 주파수로 버저 소리를 켜요. 끄기 블록을 쓸 때까지 계속 울려요. 코드: buzzer.freq(440) → buzzer.duty(512)',
  },
  {
    type: 'apc_buzzer_off',
    message0: '버저 (핀 %1) 소리 끄기',
    args0: [{ type: 'field_dropdown', name: 'PIN', options: pinOptionsWithDefault(OUTPUT_PINS, 'buzzer', 'sig') }],
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.sound,
    tooltip: '버저 소리를 꺼요(켜진 시간 비율을 0으로). 코드: buzzer.duty(0)',
  },
  {
    type: 'apc_mp3_play',
    message0: 'MP3 %1번 곡 재생',
    args0: [{ type: 'input_value', name: 'TRACK', check: 'Number' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.sound,
    tooltip: 'MP3 모듈(UART2: 보드 TX 17 · RX 16)에 곡 번호를 보내 재생해요. microSD의 001.mp3가 1번 곡이에요. 코드: mp3_send(0x03, 0x00, 1)',
  },
  {
    type: 'apc_mp3_volume',
    message0: 'MP3 음량 %1 (0~30)',
    args0: [{ type: 'input_value', name: 'VOLUME', check: 'Number' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.sound,
    tooltip: 'MP3 모듈의 음량을 0(무음)부터 30(가장 큼)까지 정해요. 코드: mp3_send(0x06, 0x00, 15)',
  },
  {
    type: 'apc_mp3_control',
    message0: 'MP3 모듈 %1',
    args0: [{ type: 'field_dropdown', name: 'COMMAND', options: MP3_COMMANDS.map((command) => [command.label, command.value]) }],
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.sound,
    tooltip: 'MP3 모듈에 멈추기·잠깐 멈추기·이어서 재생·다음 곡·이전 곡 명령을 보내요. 코드: mp3_send(0x16)',
  },

  // ── 움직임 ──
  {
    type: 'apc_vibration',
    message0: '진동 모터 (핀 %1) %2',
    args0: [
      { type: 'field_dropdown', name: 'PIN', options: pinOptionsWithDefault(OUTPUT_PINS, 'vibration', 'sig') },
      { type: 'field_dropdown', name: 'STATE', options: ON_OFF },
    ],
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.motion,
    tooltip: '진동 모터를 켜거나 꺼요. 기본 19번 핀은 사이트가 정한 핀이에요(실물 키트에서 확인 전). 코드: motor.on() / motor.off()',
  },
  {
    type: 'apc_servo',
    message0: '서보모터 (핀 %1) %2 도로 돌리기',
    args0: [
      { type: 'field_dropdown', name: 'PIN', options: pinOptionsWithDefault(OUTPUT_PINS, 'servo', 'sig') },
      { type: 'input_value', name: 'ANGLE', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.motion,
    tooltip: '서보모터 팔을 0~180도 가운데 정한 각도로 돌려요(교과서 servo_library). 코드: servo.rotate(90)',
  },
  {
    type: 'apc_fan',
    message0: '팬 모터 (INA %1 · INB %2) %3',
    args0: [
      { type: 'field_dropdown', name: 'INA', options: pinOptionsWithDefault(OUTPUT_PINS, 'fan', 'ina') },
      { type: 'field_dropdown', name: 'INB', options: pinOptionsWithDefault(OUTPUT_PINS, 'fan', 'inb') },
      {
        type: 'field_dropdown',
        name: 'DIRECTION',
        options: [
          ['정회전', 'cw'],
          ['역회전', 'ccw'],
          ['멈추기', 'stop'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.motion,
    tooltip: '팬 모터 방향: INA=1·INB=0이면 정회전, INA=0·INB=1이면 역회전, 둘 다 0이면 멈춰요. 돌아가는 날개에 손을 대지 않아요.',
  },
  {
    type: 'apc_fan_speed',
    message0: '팬 모터 (INA %1 · INB %2) %3 속도 %4 %%',
    args0: [
      { type: 'field_dropdown', name: 'INA', options: pinOptionsWithDefault(OUTPUT_PINS, 'fan', 'ina') },
      { type: 'field_dropdown', name: 'INB', options: pinOptionsWithDefault(OUTPUT_PINS, 'fan', 'inb') },
      {
        type: 'field_dropdown',
        name: 'DIRECTION',
        options: [
          ['정회전', 'cw'],
          ['역회전', 'ccw'],
        ],
      },
      { type: 'input_value', name: 'SPEED', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.motion,
    tooltip: '팬 모터를 0~100% 속도로 돌려요(교과서 gorillacell_dcmotors 라이브러리). 코드: fan.rotate(\'cw\', speed=70)',
  },

  // ── 화면 ──
  {
    type: 'apc_lcd_clear',
    message0: 'LCD 화면 지우기',
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.display,
    tooltip: '문자 LCD(16칸×2줄, I2C 주소 0x20 — SDA 21 · SCL 22)의 글자를 모두 지우고 커서를 처음으로 옮겨요. 코드: lcd.clear()',
  },
  {
    type: 'apc_lcd_print',
    message0: 'LCD에 %1 쓰기',
    args0: [{ type: 'input_value', name: 'TEXT', check: ['String', 'Number'] }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.display,
    tooltip: '커서 자리부터 글자를 써요. 문자 LCD는 영어·숫자·기호만 보여 줄 수 있어요(한글 안 됨). 코드: lcd.putstr(\'Hello\')',
  },
  {
    type: 'apc_lcd_cursor',
    message0: 'LCD 커서를 %1 칸 %2 줄로 옮기기',
    args0: [
      { type: 'input_value', name: 'COL', check: 'Number' },
      { type: 'input_value', name: 'ROW', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.display,
    tooltip: '다음 글자를 쓸 자리를 정해요. 칸은 0~15, 줄은 0(위)·1(아래). 코드: lcd.move_to(0, 1)',
  },
  {
    type: 'apc_oled_clear',
    message0: 'OLED 화면 지우기',
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.display,
    tooltip: 'OLED(128×64 점, SDA 21 · SCL 22)에 그릴 내용을 모두 지워요. "화면에 보이기" 블록을 써야 실제 화면이 바뀌어요. 코드: oled.fill(0)',
  },
  {
    type: 'apc_oled_text',
    message0: 'OLED x %1 y %2 에 %3 쓰기',
    args0: [
      { type: 'input_value', name: 'X', check: 'Number' },
      { type: 'input_value', name: 'Y', check: 'Number' },
      { type: 'input_value', name: 'TEXT', check: ['String', 'Number'] },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.display,
    tooltip: '왼쪽 위(0, 0)에서 x칸 오른쪽, y칸 아래에 글자를 그려요. 글자 한 개는 8×8 점이에요(영어·숫자만). 코드: oled.text(\'Hi\', 0, 0)',
  },
  {
    type: 'apc_oled_pixel',
    message0: 'OLED 점 찍기 x %1 y %2',
    args0: [
      { type: 'input_value', name: 'X', check: 'Number' },
      { type: 'input_value', name: 'Y', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.display,
    tooltip: '점 하나를 켜요. x는 0~127, y는 0~63이에요. 코드: oled.pixel(64, 32, 1)',
  },
  {
    type: 'apc_oled_show',
    message0: 'OLED 화면에 보이기',
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.display,
    tooltip: '지금까지 그린 글자·점을 실제 화면으로 보내요. 코드: oled.show()',
  },

  // ── 반복·기다리기 ──
  {
    type: 'apc_forever',
    message0: '계속 반복하기 %1 %2',
    args0: [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    style: BLOCK_STYLES.flow,
    tooltip: '안에 넣은 블록을 [정지]를 누를 때까지 되풀이해요. 코드: while True:',
  },
  {
    type: 'apc_wait_seconds',
    message0: '%1 초 기다리기',
    args0: [{ type: 'input_value', name: 'SECONDS', check: 'Number' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.wait,
    tooltip: '정한 시간(초) 동안 기다려요. 0.5는 반 초예요. 기다리는 동안 버튼·센서 값과 [정지]가 들어와요. 코드: sleep(0.5)',
  },
  {
    type: 'apc_wait_ms',
    message0: '%1 밀리초 기다리기',
    args0: [{ type: 'input_value', name: 'MS', check: 'Number' }],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: BLOCK_STYLES.wait,
    tooltip: '1000분의 1초 단위로 기다려요(1000밀리초 = 1초, 정수만). 코드: sleep_ms(20)',
  },
] satisfies BlockJson[]);

/** 사용자 정의 블록 type 목록 */
export const CUSTOM_BLOCK_TYPES: readonly string[] = Object.freeze(BLOCK_DEFINITIONS.map((definition) => definition.type));

/** 도구 상자에 넣는 Blockly 기본 블록(코드가 MicroPython에서도 도는 것만 — CPython 전용 모듈(numbers 등)을 부르는 블록은 넣지 않는다) */
export const STANDARD_BLOCK_TYPES: readonly string[] = Object.freeze([
  'controls_repeat_ext',
  'controls_whileUntil',
  'controls_for',
  'controls_if',
  'controls_flow_statements',
  'logic_compare',
  'logic_operation',
  'logic_negate',
  'logic_boolean',
  'math_number',
  'math_arithmetic',
  'math_random_int',
  'math_change',
  'text',
  'text_print',
  'variables_get',
  'variables_set',
]);

const registered = new WeakSet<object>();

/** Blockly에 사용자 정의 블록을 등록한다(같은 Blockly 모듈에 두 번 불러도 한 번만) */
export function registerBlocks(Blockly: BlocklyApi): void {
  if (registered.has(Blockly.Blocks)) {
    return;
  }
  Blockly.common.defineBlocks(Blockly.common.createBlockDefinitionsFromJsonArray(BLOCK_DEFINITIONS as unknown as Parameters<typeof Blockly.common.createBlockDefinitionsFromJsonArray>[0]));
  registered.add(Blockly.Blocks);
}
