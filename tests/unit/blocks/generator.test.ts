// 블록 → MicroPython 코드 생성기(PLAN §8.3 P3-06) — Node의 Blockly 13.3.0(jsdom판)으로 화면 없는 작업판을 만들어 코드를 확인한다.
// 확인하는 것: 예시·시나리오 B 코드가 교과서 모양 그대로인지, 도구 상자의 모든 블록이 코드를 만들고 화면 코드와 실행판(블록 전용 호환 모드)의
// 줄 수가 같으며 두 판 모두 파이썬 문법에 맞는지(이 컴퓨터에 파이썬 3이 있으면), 부품 이름·import·배선·핀 겹침·한글 변수 이름.
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { BLOCK_DEFINITIONS, CUSTOM_BLOCK_TYPES, STANDARD_BLOCK_TYPES } from '../../../src/lab/blocks/blocks.ts';
import { EXEC_HELPER, intArgument, sameLineCount, textArgument } from '../../../src/lab/blocks/generator.ts';
import { BLOCK_PRESETS, chain, findPreset, numberShadow, type SerializedBlock } from '../../../src/lab/blocks/presets.ts';
import { buildToolbox, toolboxBlockTypes } from '../../../src/lab/blocks/toolbox.ts';
import { forever, nodeBlocksKit, stateOf, workspaceFrom } from './helpers/blockly-node.ts';
import { TOUCH_LED_STATE } from './helpers/programs.ts';

function generate(state: Parameters<typeof workspaceFrom>[0]) {
  return nodeBlocksKit().generate(workspaceFrom(state));
}

function lines(code: string): string[] {
  return code.replace(/\n$/u, '').split('\n');
}

/** 파이썬 3(python·python3·py -3)으로 문법 검사. 없으면 null */
function pythonCompile(sources: Record<string, { code: string; exec: boolean }>): Record<string, string> | null {
  const script = [
    'import ast, json, sys',
    'data = json.loads(sys.stdin.read())',
    'out = {}',
    'for name, item in data.items():',
    '    try:',
    '        flags = ast.PyCF_ALLOW_TOP_LEVEL_AWAIT if item["exec"] else 0',
    '        compile(item["code"], name, "exec", flags=flags, dont_inherit=True)',
    '        out[name] = "ok"',
    '    except SyntaxError as error:',
    '        out[name] = f"{error.msg} (line {error.lineno})"',
    'print(json.dumps(out))',
  ].join('\n');
  for (const [command, args] of [
    ['python', ['-c', script]],
    ['python3', ['-c', script]],
    ['py', ['-3', '-c', script]],
  ] as const) {
    const result = spawnSync(command, [...args], { input: JSON.stringify(sources), encoding: 'utf8', timeout: 30_000 });
    if (result.status === 0 && result.stdout.trim().startsWith('{')) {
      return JSON.parse(result.stdout.trim()) as Record<string, string>;
    }
  }
  return null;
}

describe('예시 작업판과 시나리오 B 코드', () => {
  it('처음 예시(내장 LED 깜빡이기)는 사이트 예제 01과 같은 모양의 코드를 만든다', () => {
    const program = generate(findPreset('blink')!.state);
    expect(program.code).toBe(
      [
        '# 블록으로 만든 코드',
        'from machine import Pin',
        'from time import sleep',
        '',
        'led = Pin(2, Pin.OUT)',
        '',
        'while True:',
        '    led.on()',
        '    sleep(0.5)',
        '    led.off()',
        '    sleep(0.5)',
        '',
      ].join('\n'),
    );
    expect(program.wiring).toEqual([]);
    expect(program.blockCount).toBe(5);
    expect(program.usesWait).toBe(true);
  });

  it('BOOT 버튼 예시는 "거꾸로 동작하는 버튼"이라 == 0으로 확인하는 코드를 만든다(사이트 예제 02와 같음)', () => {
    const program = generate(findPreset('boot-led')!.state);
    expect(program.code).toBe(
      [
        '# 블록으로 만든 코드',
        'from machine import Pin',
        'from time import sleep_ms',
        '',
        'led = Pin(2, Pin.OUT)',
        'button = Pin(0, Pin.IN)',
        '',
        'while True:',
        '    if button.value() == 0:',
        '        led.on()',
        '    else:',
        '        led.off()',
        '    sleep_ms(20)',
        '',
      ].join('\n'),
    );
  });

  it('시나리오 B(터치 센서를 누르면 LED): 머리말 # @part로 배선을 적고 터치 센서는 Pin(17, Pin.IN)', () => {
    const program = generate(TOUCH_LED_STATE);
    expect(lines(program.code)).toEqual([
      '# 블록으로 만든 코드',
      '# @part touch-digital 17',
      'from machine import Pin',
      '',
      'led = Pin(2, Pin.OUT)',
      'touch = Pin(17, Pin.IN)',
      '',
      'while True:',
      '    if touch.value() == 1:',
      '        led.on()',
      '    else:',
      '        led.off()',
    ]);
    expect(program.wiring).toEqual([{ part: 'touch-digital', pin: 17, label: '터치 센서' }]);
    expect(program.plan.conflicts).toEqual([]);
  });

  it('빈 작업판은 주석만 있는 코드(실행해도 아무 일도 없음)', () => {
    const program = generate(findPreset('empty')!.state);
    expect(program.blockCount).toBe(0);
    expect(program.code).toBe('# 블록으로 만든 코드\n\n# 블록을 끌어다 놓으면 여기에 코드가 생겨요.\n');
    expect(program.execCode).toBe(program.code);
  });
});

describe('블록 전용 호환 모드 실행판(PD-27)', () => {
  it('기다리는 줄과 반복문 머리만 바뀌고 줄 수가 같다', () => {
    const program = generate(findPreset('blink')!.state);
    const display = lines(program.code);
    const exec = lines(program.execCode);
    expect(exec.length).toBe(display.length);
    const changed = display.flatMap((line, index) => (line === exec[index] ? [] : [[line, exec[index]]]));
    expect(changed).toEqual([
      ['while True:', `while await ${EXEC_HELPER}.tick(True):`],
      ['    sleep(0.5)', `    await ${EXEC_HELPER}.sleep(0.5)`],
      ['    sleep(0.5)', `    await ${EXEC_HELPER}.sleep(0.5)`],
    ]);
  });

  it('N번 반복·조건 반복·i를 a부터 b까지 반복은 async for·await 조건으로 바뀐다', () => {
    const program = generate(
      stateOf(
        chain([
          { type: 'controls_repeat_ext', inputs: { TIMES: numberShadow(3), DO: { block: { type: 'apc_wait_ms', inputs: { MS: numberShadow(10) } } } } },
          {
            type: 'controls_whileUntil',
            fields: { MODE: 'UNTIL' },
            inputs: { BOOL: { block: { type: 'apc_boot_pressed' } }, DO: { block: { type: 'apc_builtin_led_toggle' } } },
          },
          {
            type: 'controls_for',
            fields: { VAR: { name: 'i' } },
            inputs: { FROM: numberShadow(0), TO: numberShadow(15), BY: numberShadow(1), DO: { block: { type: 'apc_wait_seconds', inputs: { SECONDS: numberShadow(0.1) } } } },
          },
        ])!,
      ),
    );
    const display = lines(program.code);
    const exec = lines(program.execCode);
    expect(display).toContain('for count in range(3):');
    expect(exec).toContain(`async for count in ${EXEC_HELPER}.each(range(3)):`);
    expect(display).toContain('while not button.value() == 0:');
    expect(exec).toContain(`while await ${EXEC_HELPER}.tick(not button.value() == 0):`);
    expect(display).toContain('for i in range(16):');
    expect(exec).toContain(`async for i in ${EXEC_HELPER}.each(range(16)):`);
    expect(exec.length).toBe(display.length);
  });

  it('sameLineCount는 줄 수만 본다', () => {
    expect(sameLineCount('a\nb', 'c\nd')).toBe(true);
    expect(sameLineCount('a\nb', 'a')).toBe(false);
  });
});

/** 도구 상자에 있는 블록 하나씩을 "계속 반복하기" 안(문장 블록)이나 비교 블록 안(값 블록)에 넣은 작업판 */
function everyToolboxBlockState(): { state: ReturnType<typeof stateOf>; types: string[] } {
  const statements: SerializedBlock[] = [];
  const types: string[] = [];
  const toolbox = buildToolbox();
  for (const category of toolbox.contents) {
    for (const item of category.contents ?? []) {
      if (item.kind !== 'block' || !item.type || item.type === 'apc_forever') {
        continue;
      }
      types.push(item.type);
      const inputs = Object.fromEntries(Object.entries(item.inputs ?? {}).map(([name, value]) => [name, value])) as SerializedBlock['inputs'];
      const block: SerializedBlock = {
        type: item.type,
        ...(item.fields ? { fields: item.fields } : {}),
        ...(inputs && Object.keys(inputs).length > 0 ? { inputs } : {}),
        ...(item.extraState ? { extraState: item.extraState } : {}),
      };
      const definition = BLOCK_DEFINITIONS.find((entry) => entry.type === item.type);
      const isValue = definition ? 'output' in definition : ['logic_compare', 'logic_operation', 'logic_negate', 'logic_boolean', 'math_number', 'math_arithmetic', 'math_random_int', 'text'].includes(item.type);
      if (isValue) {
        statements.push({ type: 'text_print', inputs: { TEXT: { block } } });
      } else if (item.type === 'controls_flow_statements') {
        statements.push({ type: 'controls_repeat_ext', inputs: { TIMES: numberShadow(1), DO: { block } } });
      } else {
        statements.push(block);
      }
    }
  }
  statements.push({ type: 'variables_set', fields: { VAR: { name: '횟수' } }, inputs: { VALUE: { block: { type: 'math_number', fields: { NUM: 0 } } } } });
  statements.push({ type: 'math_change', fields: { VAR: { name: '횟수' } }, inputs: { DELTA: numberShadow(1) } });
  return { state: stateOf(forever(chain(statements))), types };
}

describe('도구 상자의 모든 블록', () => {
  it('사용자 정의 블록마다 한국어 글·툴팁·코드 함수가 있고, 도구 상자에 들어 있다', () => {
    const kit = nodeBlocksKit();
    const inToolbox = new Set(toolboxBlockTypes());
    for (const definition of BLOCK_DEFINITIONS) {
      expect(String(definition.message0), definition.type).toMatch(/[가-힣]/u);
      expect(String(definition.tooltip), definition.type).toMatch(/[가-힣]/u);
      expect(typeof kit.generator.forBlock[definition.type], definition.type).toBe('function');
      expect(kit.Blockly.Blocks[definition.type], definition.type).toBeDefined();
      expect(inToolbox.has(definition.type), `${definition.type}이(가) 도구 상자에 없어요`).toBe(true);
    }
    for (const type of STANDARD_BLOCK_TYPES) {
      expect(typeof kit.generator.forBlock[type], type).toBe('function');
    }
    for (const type of toolboxBlockTypes()) {
      expect(CUSTOM_BLOCK_TYPES.includes(type) || STANDARD_BLOCK_TYPES.includes(type), `${type}은(는) 코드 함수가 정해지지 않은 블록이에요`).toBe(true);
    }
  });

  it('모든 블록을 넣은 프로그램: 화면 코드·실행판 줄 수가 같고, CPython 전용 모듈을 부르지 않으며, 파이썬 문법에 맞다', () => {
    const { state, types } = everyToolboxBlockState();
    const program = generate(state);
    expect(types.length).toBeGreaterThan(40);
    expect(sameLineCount(program.code, program.execCode)).toBe(true);
    // Blockly 기본 math_change의 from numbers import Number(CPython 전용)가 없어야 실제 보드에서 돈다
    expect(program.code).not.toMatch(/numbers|isinstance\(/u);
    expect(program.code).toContain('횟수 = 0');
    expect(program.code).toContain('횟수 = 횟수 + 1');
    expect(lines(program.code).find((line) => line.startsWith('from machine'))).toBe('from machine import Pin, PWM, SoftI2C, UART');
    for (const needed of [
      'from time import sleep, sleep_ms',
      'from neopixel import NeoPixel',
      'from i2c_lcd import I2cLcd',
      'from ssd1306 import SSD1306_I2C',
      'from servo_library import ServoMotor',
      'from gorillacell_dcmotors import GORILLACELL_DCMOTORS',
      'import random',
      'i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)',
      'lcd = I2cLcd(i2c, 0x20, 2, 16)',
      'oled = SSD1306_I2C(128, 64, i2c)',
      'np = NeoPixel(Pin(23), 16)',
      'buzzer = PWM(Pin(15), freq=1000, duty=0)',
      'uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))',
      'def mp3_send(cmd, p1=0, p2=0):',
      'servo = ServoMotor(signal_pin=25)',
      'fan = GORILLACELL_DCMOTORS(25, 26)',
      'rgb_r = PWM(Pin(27), freq=1000, duty=0)',
    ]) {
      expect(program.code, needed).toContain(needed);
    }
    const compiled = pythonCompile({ 'display.py': { code: program.code, exec: false }, 'exec.py': { code: program.execCode, exec: true } });
    if (compiled) {
      expect(compiled).toEqual({ 'display.py': 'ok', 'exec.py': 'ok' });
    }
  });

  it('예시 작업판 모두: 두 판의 줄 수가 같다', () => {
    for (const preset of BLOCK_PRESETS) {
      const program = generate(preset.state);
      expect(sameLineCount(program.code, program.execCode), preset.id).toBe(true);
    }
  });
});

describe('부품 이름·방식·배선·핀 겹침', () => {
  it('같은 부품을 다른 핀에 두 개 쓰면 이름에 핀 번호가 붙고 배선 id도 나뉜다', () => {
    const program = generate(
      stateOf(
        forever(
          chain([
            { type: 'text_print', inputs: { TEXT: { block: { type: 'apc_touch_value', fields: { PIN: '18' } } } } },
            { type: 'text_print', inputs: { TEXT: { block: { type: 'apc_touch_value', fields: { PIN: '17' } } } } },
          ]),
        ),
      ),
    );
    expect(program.code).toContain('touch_17 = Pin(17, Pin.IN)\ntouch_18 = Pin(18, Pin.IN)');
    expect(program.code).toContain('print(touch_18.value())');
    expect(program.code).toContain('# @part touch-digital 17 as touch-digital-17\n# @part touch-digital 18 as touch-digital-18');
    expect(program.wiring.map((entry) => entry.id)).toEqual(['touch-digital-17', 'touch-digital-18']);
  });

  it('RGB LED: 색 블록만 쓰면 Pin 켜기·끄기, 밝기 블록이 하나라도 있으면 세 핀 모두 PWM', () => {
    const colorOnly = generate(stateOf({ type: 'apc_rgb_color', fields: { PINS: '27,32,33', COLOR: 'yellow' } }));
    expect(colorOnly.code).toContain('rgb_r = Pin(27, Pin.OUT)');
    expect(colorOnly.code).toContain('rgb_r.value(1)\nrgb_g.value(1)\nrgb_b.value(0)');
    expect(colorOnly.code).toContain('# @part rgb-led r=27 g=32 b=33');
    const mixed = generate(
      stateOf(
        chain([
          { type: 'apc_rgb_color', fields: { PINS: '27,32,33', COLOR: 'yellow' } },
          { type: 'apc_rgb_brightness', fields: { PINS: '27,32,33' }, inputs: { R: numberShadow(1023), G: numberShadow(512.5), B: numberShadow(0) } },
        ])!,
      ),
    );
    expect(mixed.code).toContain('rgb_g = PWM(Pin(32), freq=1000, duty=0)');
    expect(mixed.code).toContain('rgb_r.duty(1023)\nrgb_g.duty(1023)\nrgb_b.duty(0)');
    expect(mixed.code).toContain('rgb_g.duty(int(512.5))');
  });

  it('팬: 방향 블록만 쓰면 INA·INB 진리표, 속도 블록이 있으면 교과서 라이브러리', () => {
    const digital = generate(stateOf({ type: 'apc_fan', fields: { INA: '25', INB: '26', DIRECTION: 'ccw' } }));
    expect(digital.code).toContain('fan_ina = Pin(25, Pin.OUT)\nfan_inb = Pin(26, Pin.OUT)');
    expect(digital.code).toContain('fan_ina.value(0)\nfan_inb.value(1)');
    const library = generate(
      stateOf(
        chain([
          { type: 'apc_fan', fields: { INA: '25', INB: '26', DIRECTION: 'stop' } },
          { type: 'apc_fan_speed', fields: { INA: '25', INB: '26', DIRECTION: 'cw' }, inputs: { SPEED: numberShadow(70) } },
        ])!,
      ),
    );
    expect(library.code).toContain('fan = GORILLACELL_DCMOTORS(25, 26)');
    expect(library.code).toContain("fan.stop()\nfan.rotate('cw', speed=70)");
  });

  it('LCD와 OLED는 I2C 버스 하나를 함께 쓰고 겹침으로 보지 않는다', () => {
    const program = generate(
      stateOf(
        chain([
          { type: 'apc_lcd_print', inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: 'Hi' } } } } },
          { type: 'apc_oled_text', inputs: { X: numberShadow(0), Y: numberShadow(16), TEXT: { block: { type: 'math_number', fields: { NUM: 5 } } } } },
          { type: 'apc_oled_show' },
        ])!,
      ),
    );
    expect(program.code.match(/SoftI2C\(/gu)?.length).toBe(1);
    expect(program.code).toContain("lcd.putstr('Hi')");
    expect(program.code).toContain('oled.text(str(5), 0, 16)');
    expect(program.plan.conflicts).toEqual([]);
    expect(program.wiring).toEqual([
      { part: 'lcd-i2c', id: 'lcd', pins: { sda: 21, scl: 22 }, label: '문자 LCD' },
      { part: 'oled-i2c', id: 'oled', pins: { sda: 21, scl: 22 }, label: 'OLED' },
    ]);
  });

  it('레이저(21)와 LCD(SDA 21), MP3(보드 TX 17)와 터치 센서(17)는 핀 겹침으로 알린다', () => {
    const program = generate(
      stateOf(
        chain([
          { type: 'apc_laser', fields: { PIN: '21', STATE: 'on' } },
          { type: 'apc_lcd_clear' },
          { type: 'apc_mp3_play', inputs: { TRACK: numberShadow(1) } },
          { type: 'text_print', inputs: { TEXT: { block: { type: 'apc_touch_value', fields: { PIN: '17' } } } } },
        ])!,
      ),
    );
    expect(program.plan.conflicts.map((conflict) => conflict.gpio)).toEqual([17, 21]);
    expect(program.plan.conflicts[0]!.text).toContain('17번 핀을 터치 센서·MP3 모듈(보드 TX)이(가) 함께 써요');
    expect(program.plan.conflicts[1]!.labels).toEqual(['레이저', '문자 LCD SDA']);
    expect(program.plan.conflicts[1]!.blockIds.length).toBe(2);
  });

  it('학생 변수 이름: 한글은 그대로, 부품 이름과 겹치는 영문 이름은 2를 붙인다', () => {
    const program = generate(
      stateOf(
        chain([
          { type: 'variables_set', fields: { VAR: { name: 'led' } }, inputs: { VALUE: { block: { type: 'math_number', fields: { NUM: 1 } } } } },
          { type: 'variables_set', fields: { VAR: { name: '밝기 값' } }, inputs: { VALUE: { block: { type: 'math_number', fields: { NUM: 3 } } } } },
          { type: 'apc_builtin_led', fields: { STATE: 'on' } },
          { type: 'controls_repeat_ext', inputs: { TIMES: numberShadow(2), DO: { block: { type: 'math_change', fields: { VAR: { name: '밝기 값' } }, inputs: { DELTA: numberShadow(1) } } } } },
        ])!,
      ),
    );
    expect(program.code).toContain('led2 = 1');
    expect(program.code).toContain('밝기_값 = 3');
    expect(program.code).toContain('    밝기_값 = 밝기_값 + 1');
    expect(program.code).toContain('led.on()');
  });
});

describe('값 모양 도우미', () => {
  it('intArgument: 정수 글자는 그대로, 아니면 int(…)', () => {
    expect(intArgument('512')).toBe('512');
    expect(intArgument('-3')).toBe('-3');
    expect(intArgument('0.5')).toBe('int(0.5)');
    expect(intArgument('횟수 * 4')).toBe('int(횟수 * 4)');
  });

  it("textArgument: 따옴표 글자는 그대로, 아니면 str(…)", () => {
    expect(textArgument("'Hello'")).toBe("'Hello'");
    expect(textArgument('"It\'s"')).toBe('"It\'s"');
    expect(textArgument('count')).toBe('str(count)');
  });
});
