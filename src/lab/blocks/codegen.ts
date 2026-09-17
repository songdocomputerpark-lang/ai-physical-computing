/**
 * 블록 하나하나가 만드는 MicroPython 코드(PLAN §8.3 P3-06). 블록 모양은 blocks.ts, 코드 모양 전체·실행판은 generator.ts.
 *
 * 규칙
 * - 부품은 generator.part(block, 종류, { pins, flavor })로 받는다 — 이름·준비 줄·import·배선은 catalog.planParts가 한 곳에서 정한다.
 * - 기다리는 줄은 generator.waitLine, 반복문 머리는 generator.whileHeader·forHeader만 쓴다(블록 전용 호환 모드 실행판이 같은 줄 수로 바뀌게).
 * - 블록 하나가 만드는 줄 수는 화면 코드와 실행판에서 같아야 한다(tests/unit/blocks/generator.test.ts가 모든 블록으로 확인).
 * - 값 모양은 MicroPython에 맞춘다: 정수만 받는 곳(duty·freq·색 값·좌표·곡 번호)은 intArgument, 글자를 받는 곳(LCD·OLED)은 textArgument.
 * - Blockly 기본 블록 가운데 CPython 전용 코드를 만드는 것(math_change의 `from numbers import Number`)은 여기서 MicroPython판으로 바꾼다.
 */
import type { Block, BlocklyPythonApi } from './blockly-types.ts';
import { BUZZER_DUTY, MP3_SEND_NAME, RGB_COLORS, rgbPinsFromValue } from './catalog.ts';
import { intArgument, textArgument, type MicroPythonCodeGenerator } from './generator.ts';

export type BlockCode = (block: Block, generator: MicroPythonCodeGenerator) => string | [string, number];

function pinField(block: Block, name = 'PIN'): number {
  return Number(block.getFieldValue(name));
}

/** Blockly python의 Order 값(연산자 우선순위) — python 모듈에서 받는다 */
export type OrderValues = BlocklyPythonApi['Order'];

/** 사용자 정의 블록 코드 함수 */
export function customBlockCode(Order: OrderValues): Record<string, BlockCode> {
  const value = (block: Block, generator: MicroPythonCodeGenerator, name: string, fallback: string, order = Order.NONE): string =>
    generator.valueToCode(block, name, order) || fallback;

  return {
    apc_builtin_led(block, generator) {
      const led = generator.part(block, 'builtin-led');
      return `${led.name}.${block.getFieldValue('STATE') === 'off' ? 'off' : 'on'}()\n`;
    },
    apc_builtin_led_toggle(block, generator) {
      const led = generator.part(block, 'builtin-led');
      return `${led.name}.value(not ${led.name}.value())\n`;
    },
    apc_boot_pressed(block, generator) {
      const button = generator.part(block, 'boot-button');
      return [`${button.name}.value() == 0`, Order.RELATIONAL];
    },
    apc_boot_value(block, generator) {
      const button = generator.part(block, 'boot-button');
      return [`${button.name}.value()`, Order.FUNCTION_CALL];
    },
    apc_touch_pressed(block, generator) {
      const touch = generator.part(block, 'touch', { pins: { sig: pinField(block) } });
      return [`${touch.name}.value() == 1`, Order.RELATIONAL];
    },
    apc_touch_value(block, generator) {
      const touch = generator.part(block, 'touch', { pins: { sig: pinField(block) } });
      return [`${touch.name}.value()`, Order.FUNCTION_CALL];
    },
    apc_rgb_color(block, generator) {
      const rgb = generator.part(block, 'rgb', { pins: rgbPinsFromValue(block.getFieldValue('PINS')) });
      const color = RGB_COLORS.find((item) => item.value === block.getFieldValue('COLOR')) ?? RGB_COLORS[RGB_COLORS.length - 1]!;
      return (['r', 'g', 'b'] as const)
        .map((role, index) => {
          const on = color.rgb[index] === 1;
          return rgb.flavor === 'pwm' ? `${rgb.name}_${role}.duty(${on ? 1023 : 0})\n` : `${rgb.name}_${role}.value(${on ? 1 : 0})\n`;
        })
        .join('');
    },
    apc_rgb_brightness(block, generator) {
      const rgb = generator.part(block, 'rgb', { pins: rgbPinsFromValue(block.getFieldValue('PINS')), flavor: 'pwm' });
      return (['R', 'G', 'B'] as const).map((input) => `${rgb.name}_${input.toLowerCase()}.duty(${intArgument(value(block, generator, input, '0'))})\n`).join('');
    },
    apc_laser(block, generator) {
      const laser = generator.part(block, 'laser', { pins: { sig: pinField(block) } });
      return `${laser.name}.${block.getFieldValue('STATE') === 'off' ? 'off' : 'on'}()\n`;
    },
    apc_neopixel_set(block, generator) {
      const np = generator.part(block, 'neopixel', { pins: { din: pinField(block) } });
      const index = intArgument(value(block, generator, 'INDEX', '0'));
      const [r, g, b] = (['R', 'G', 'B'] as const).map((input) => intArgument(value(block, generator, input, '0')));
      return `${np.name}[${index}] = (${r}, ${g}, ${b})\n`;
    },
    apc_neopixel_fill(block, generator) {
      const np = generator.part(block, 'neopixel', { pins: { din: pinField(block) } });
      const [r, g, b] = (['R', 'G', 'B'] as const).map((input) => intArgument(value(block, generator, input, '0')));
      return `${np.name}.fill((${r}, ${g}, ${b}))\n`;
    },
    apc_neopixel_write(block, generator) {
      const np = generator.part(block, 'neopixel', { pins: { din: pinField(block) } });
      return `${np.name}.write()\n`;
    },
    apc_buzzer_note(block, generator) {
      const buzzer = generator.part(block, 'buzzer', { pins: { sig: pinField(block) } });
      const note = intArgument(String(block.getFieldValue('NOTE') ?? '262'));
      const seconds = value(block, generator, 'SECONDS', '0.5');
      return `${buzzer.name}.freq(${note})\n${buzzer.name}.duty(${BUZZER_DUTY})\n${generator.waitLine('sleep', seconds)}${buzzer.name}.duty(0)\n`;
    },
    apc_buzzer_tone(block, generator) {
      const buzzer = generator.part(block, 'buzzer', { pins: { sig: pinField(block) } });
      return `${buzzer.name}.freq(${intArgument(value(block, generator, 'FREQ', '440'))})\n${buzzer.name}.duty(${BUZZER_DUTY})\n`;
    },
    apc_buzzer_off(block, generator) {
      const buzzer = generator.part(block, 'buzzer', { pins: { sig: pinField(block) } });
      return `${buzzer.name}.duty(0)\n`;
    },
    apc_mp3_play(block, generator) {
      generator.part(block, 'mp3');
      return `${MP3_SEND_NAME}(0x03, 0x00, ${intArgument(value(block, generator, 'TRACK', '1'))})\n`;
    },
    apc_mp3_volume(block, generator) {
      generator.part(block, 'mp3');
      return `${MP3_SEND_NAME}(0x06, 0x00, ${intArgument(value(block, generator, 'VOLUME', '15'))})\n`;
    },
    apc_mp3_control(block, generator) {
      generator.part(block, 'mp3');
      const command = /^0x[0-9A-F]{2}$/u.test(String(block.getFieldValue('COMMAND'))) ? String(block.getFieldValue('COMMAND')) : '0x16';
      return `${MP3_SEND_NAME}(${command})\n`;
    },
    apc_vibration(block, generator) {
      const motor = generator.part(block, 'vibration', { pins: { sig: pinField(block) } });
      return `${motor.name}.${block.getFieldValue('STATE') === 'off' ? 'off' : 'on'}()\n`;
    },
    apc_servo(block, generator) {
      const servo = generator.part(block, 'servo', { pins: { sig: pinField(block) } });
      return `${servo.name}.rotate(${value(block, generator, 'ANGLE', '90')})\n`;
    },
    apc_fan(block, generator) {
      const fan = generator.part(block, 'fan', { pins: { ina: pinField(block, 'INA'), inb: pinField(block, 'INB') } });
      const direction = String(block.getFieldValue('DIRECTION'));
      if (fan.flavor === 'library') {
        return direction === 'stop' ? `${fan.name}.stop()\n` : `${fan.name}.rotate('${direction === 'ccw' ? 'ccw' : 'cw'}')\n`;
      }
      const [ina, inb] = direction === 'cw' ? [1, 0] : direction === 'ccw' ? [0, 1] : [0, 0];
      return `${fan.name}_ina.value(${ina})\n${fan.name}_inb.value(${inb})\n`;
    },
    apc_fan_speed(block, generator) {
      const fan = generator.part(block, 'fan', { pins: { ina: pinField(block, 'INA'), inb: pinField(block, 'INB') }, flavor: 'library' });
      const direction = block.getFieldValue('DIRECTION') === 'ccw' ? 'ccw' : 'cw';
      return `${fan.name}.rotate('${direction}', speed=${value(block, generator, 'SPEED', '50')})\n`;
    },
    apc_lcd_clear(block, generator) {
      const lcd = generator.part(block, 'lcd');
      return `${lcd.name}.clear()\n`;
    },
    apc_lcd_print(block, generator) {
      const lcd = generator.part(block, 'lcd');
      return `${lcd.name}.putstr(${textArgument(value(block, generator, 'TEXT', "''"))})\n`;
    },
    apc_lcd_cursor(block, generator) {
      const lcd = generator.part(block, 'lcd');
      return `${lcd.name}.move_to(${intArgument(value(block, generator, 'COL', '0'))}, ${intArgument(value(block, generator, 'ROW', '0'))})\n`;
    },
    apc_oled_clear(block, generator) {
      const oled = generator.part(block, 'oled');
      return `${oled.name}.fill(0)\n`;
    },
    apc_oled_text(block, generator) {
      const oled = generator.part(block, 'oled');
      const text = textArgument(value(block, generator, 'TEXT', "''"));
      return `${oled.name}.text(${text}, ${intArgument(value(block, generator, 'X', '0'))}, ${intArgument(value(block, generator, 'Y', '0'))})\n`;
    },
    apc_oled_pixel(block, generator) {
      const oled = generator.part(block, 'oled');
      return `${oled.name}.pixel(${intArgument(value(block, generator, 'X', '0'))}, ${intArgument(value(block, generator, 'Y', '0'))}, 1)\n`;
    },
    apc_oled_show(block, generator) {
      const oled = generator.part(block, 'oled');
      return `${oled.name}.show()\n`;
    },
    apc_forever(block, generator) {
      const branch = generator.addLoopTrap(generator.statementToCode(block, 'DO'), block) || generator.PASS;
      return `${generator.whileHeader('True')}\n${branch}`;
    },
    apc_wait_seconds(block, generator) {
      return generator.waitLine('sleep', value(block, generator, 'SECONDS', '0'));
    },
    apc_wait_ms(block, generator) {
      return generator.waitLine('sleep_ms', intArgument(value(block, generator, 'MS', '0')));
    },
  };
}

/**
 * Blockly 기본 블록 가운데 반복문·변수 바꾸기를 MicroPython판으로 바꾼 코드 함수.
 * 반복문 머리는 실행판에서 달라져야 해서(await) 직접 만든다. controls_for는 Blockly 기본 코드(범위 계산이 길다)를 부른 뒤 머리 줄만 바꾼다.
 */
export function standardBlockOverrides(python: BlocklyPythonApi): Record<string, BlockCode> {
  const { Order, pythonGenerator } = python;
  const baseFor = pythonGenerator.forBlock.controls_for;
  return {
    controls_repeat_ext(block, generator) {
      let repeats = generator.valueToCode(block, 'TIMES', Order.NONE) || '0';
      repeats = /^-?\d+(?:\.\d+)?$/u.test(repeats) ? String(Math.trunc(Number(repeats))) : `int(${repeats})`;
      const branch = generator.addLoopTrap(generator.statementToCode(block, 'DO'), block) || generator.PASS;
      return `${generator.forHeader('count', `range(${repeats})`)}\n${branch}`;
    },
    controls_whileUntil(block, generator) {
      const until = block.getFieldValue('MODE') === 'UNTIL';
      let condition = generator.valueToCode(block, 'BOOL', until ? Order.LOGICAL_NOT : Order.NONE) || 'False';
      if (until) {
        condition = `not ${condition}`;
      }
      const branch = generator.addLoopTrap(generator.statementToCode(block, 'DO'), block) || generator.PASS;
      return `${generator.whileHeader(condition)}\n${branch}`;
    },
    controls_for(block, generator) {
      if (typeof baseFor !== 'function') {
        throw new Error('Blockly python 생성기에 controls_for가 없어요.');
      }
      const code = String(baseFor.call(block, block, generator as never) ?? '');
      if (generator.mode !== 'exec') {
        return code;
      }
      // 이 블록 코드의 맨 앞(들여쓰기 없는) for 줄 하나만 실행판 머리로 바꾼다(앞의 i_start 같은 준비 줄·안쪽 블록은 그대로)
      const lines = code.split('\n');
      const index = lines.findIndex((line) => /^for \S+ in .+:$/u.test(line));
      if (index >= 0) {
        const match = /^for (\S+) in (.+):$/u.exec(lines[index]!)!;
        lines[index] = generator.forHeader(match[1]!, match[2]!);
      }
      return lines.join('\n');
    },
    math_change(block, generator) {
      const variable = generator.getVariableName(block.getFieldValue('VAR'));
      const delta = generator.valueToCode(block, 'DELTA', Order.ADDITIVE) || '0';
      return `${variable} = ${variable} + ${delta}\n`;
    },
  };
}
