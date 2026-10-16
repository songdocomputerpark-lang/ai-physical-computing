// 판 1.5.0 구역 K2(범용 부품 4종 — sensor-digital·sensor-analog·joystick·output-digital)의 파이썬 쪽 — 화면 부품이 거는 값을 MicroPython 코드가 읽고
// (Pin.IN value·ADC read), 코드가 쓴 핀이 출력 부품의 모습으로 이어지는지를 Node의 실제 Pyodide(JSPI)로 확인한다.
// tests/unit/lab/pyodide-board-generic-parts.test.ts가 공유 도우미(pyodide-board-run.mjs --steps=이 파일)로 돌린다(src/lab/README.md 7.7·7.9).
// 받는 도구: step(이름, 코드, { inputs, wiring, during, onMark, stopAfterMs, stopWhen, frozenClock, idle }), bridge, pyodide, rootDir.
// 부품이 거는 값은 부품의 순수 모델 파일(sensor-digital-model.ts 등)을 그대로 불러와 쓴다 — 화면과 같은 계산.
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function partFile(rootDir, ...segments) {
  return pathToFileURL(path.join(rootDir, 'src', 'lab', 'modules', 'board', 'parts', ...segments)).href;
}

/** 배선 한 줄(화면의 wiringValue와 같은 모양) */
function entry(part, id, label, pins, directions) {
  return { part, id, label, pins, directions, known: true };
}

/** 4096개 값 전부를 파이썬 ADC의 전압 → 값 식(apc_board_adc.raw12_from_millivolts)에 넣어 어긋난 값을 찾는 코드 */
function exhaustiveAdcCode(millivolts) {
  return [
    'import apc_board_adc',
    `mvs = [${millivolts.map((mv) => String(mv)).join(', ')}]`,
    '[i for i, mv in enumerate(mvs) if apc_board_adc.raw12_from_millivolts(mv) != i]',
  ].join('\n');
}

export default async function genericPartsSteps({ step, bridge, rootDir }) {
  const digital = await import(partFile(rootDir, 'sensor-digital', 'sensor-digital-model.ts'));
  const analog = await import(partFile(rootDir, 'sensor-analog', 'sensor-analog-model.ts'));
  const stick = await import(partFile(rootDir, 'joystick', 'joystick-model.ts'));

  // ── sensor-digital: Pin(23, Pin.IN).value()가 감지/해제를 따른다(처음 값은 board.inputs, 뒤는 board.input) ──
  const digitalWiring = (id, label) => ({ parts: [entry('sensor-digital', id, label, { sig: 23 }, { sig: 'in' })] });
  const digitalCode = [
    'from machine import Pin',
    'import apc_runtime, time',
    'p = Pin(23, Pin.IN)',
    'r = [p.value()]',
    "for mark in ['detect', 'clear', 'detect']:",
    "    apc_runtime.emit('board.device', {'mark': mark})",
    '    time.sleep_ms(30)',
    '    r.append(p.value())',
    'r',
  ].join('\n');
  for (const [name, activeLow] of [
    ['digital_normal', false],
    ['digital_active_low', true],
  ]) {
    await step(name, digitalCode, {
      inputs: { pins: { 23: digital.sensorLevel(false, activeLow) } },
      wiring: digitalWiring('motion', '움직임 센서'),
      onMark: (mark) => bridge.pushEvent('board.input', { pin: 23, drive: digital.sensorLevel(mark === 'detect', activeLow) }),
    });
  }

  // ── sensor-analog: 슬라이더 값이 ADC.read()로 정확히 읽힌다(4채널 터치와 달리 +1이 없다) ──
  const sweep = [0, 1, 2, 44, 45, 688, 1000, 1535, 2047, 2048, 2049, 2381, 3263, 4000, 4093, 4094, 4095];
  const analogWiring = { parts: [entry('sensor-analog', 'light', '조도 센서', { sig: 32 }, { sig: 'in' })] };
  await step(
    'analog_sweep',
    [
      'from machine import ADC, Pin',
      'import apc_runtime, time',
      'a = ADC(Pin(32))',
      'a.atten(ADC.ATTN_11DB)',
      'a.width(ADC.WIDTH_12BIT)',
      `values = ${JSON.stringify(sweep)}`,
      'reads = [a.read()]',
      'for v in values:',
      "    apc_runtime.emit('board.device', {'mark': 'v:%d' % v})",
      '    time.sleep_ms(5)',
      '    reads.append(a.read())',
      'reads',
    ].join('\n'),
    {
      inputs: { pins: { 32: analog.exactAnalogDrive(analog.SENSOR_ANALOG_DEFAULT_VALUE) } },
      wiring: analogWiring,
      onMark: (mark) => bridge.pushEvent('board.input', { pin: 32, drive: analog.exactAnalogDrive(Number(mark.slice(2))) }),
    },
  );
  // 4096개 전부: 전압 → 값 식이 어긋난 값이 하나도 없다
  const all = Array.from({ length: 4096 }, (_, raw) => analog.exactMillivoltsForRaw12(raw));
  await step('analog_exhaustive', exhaustiveAdcCode(all), { wiring: { parts: [] } });
  // 처음 값(board.inputs의 슬라이더 기본 2048)과 디지털로 읽을 때의 1.65V 문턱(2048은 1, 2047은 0)
  await step(
    'analog_digital_threshold',
    [
      'from machine import Pin',
      'import apc_runtime, time',
      'p = Pin(32, Pin.IN)',
      'r = [p.value()]',
      "apc_runtime.emit('board.device', {'mark': 'v:2047'})",
      'time.sleep_ms(5)',
      'r.append(p.value())',
      'r',
    ].join('\n'),
    {
      inputs: { pins: { 32: analog.exactAnalogDrive(2048) } },
      wiring: analogWiring,
      onMark: (mark) => bridge.pushEvent('board.input', { pin: 32, drive: analog.exactAnalogDrive(Number(mark.slice(2))) }),
    },
  );

  // ── joystick: X(32)·Y(33) ADC와 버튼 sw(27) 디지털 ──
  const stickWiring = {
    parts: [entry('joystick', 'joystick', '조이스틱', { x: 32, y: 33, sw: 27 }, { x: 'in', y: 'in', sw: 'in' })],
  };
  await step(
    'joystick_axes_and_button',
    [
      'from machine import ADC, Pin',
      'import apc_runtime, time',
      'x = ADC(Pin(32))',
      'y = ADC(Pin(33))',
      'x.atten(ADC.ATTN_11DB)',
      'y.atten(ADC.ATTN_11DB)',
      'sw = Pin(27, Pin.IN, Pin.PULL_UP)',
      'r = [[x.read(), y.read(), sw.value()]]',
      "for mark in ['right-up', 'left-down', 'press', 'release', 'center']:",
      "    apc_runtime.emit('board.device', {'mark': mark})",
      '    time.sleep_ms(5)',
      '    r.append([x.read(), y.read(), sw.value()])',
      'r',
    ].join('\n'),
    {
      inputs: { pins: { 32: analog.exactAnalogDrive(stick.JOYSTICK_CENTER), 33: analog.exactAnalogDrive(stick.JOYSTICK_CENTER), 27: stick.joystickButtonDrive(false) } },
      wiring: stickWiring,
      onMark: (mark) => {
        const axes = { 'right-up': [4095, 4095], 'left-down': [0, 0], center: [stick.JOYSTICK_CENTER, stick.JOYSTICK_CENTER] }[mark];
        if (axes) {
          bridge.pushEvent('board.input', { pin: 32, drive: analog.exactAnalogDrive(axes[0]) });
          bridge.pushEvent('board.input', { pin: 33, drive: analog.exactAnalogDrive(axes[1]) });
        } else if (mark === 'press' || mark === 'release') {
          bridge.pushEvent('board.input', { pin: 27, drive: stick.joystickButtonDrive(mark === 'press') });
        }
      },
    },
  );
  // 버튼 핀 없이 X·Y만 배선(sw는 optional): 두 축 값이 그대로 읽히고 배선 안내가 나오지 않는다
  await step(
    'joystick_without_button',
    ['from machine import ADC, Pin', 'x = ADC(Pin(32))', 'y = ADC(Pin(33))', '[x.read(), y.read()]'].join('\n'),
    {
      inputs: { pins: { 32: analog.exactAnalogDrive(1234), 33: analog.exactAnalogDrive(3210) } },
      wiring: { parts: [entry('joystick', 'joystick', '조이스틱', { x: 32, y: 33 }, { x: 'in', y: 'in' })] },
    },
  );

  // ── output-digital: Pin(4, Pin.OUT)의 board.state가 표시등 모습으로 이어진다(모습은 TS 쪽 테스트가 state 이벤트로 계산) ──
  const outputWiring = (options) => ({
    parts: [{ ...entry('output-digital', 'led', '빨강 LED', { sig: 4 }, { sig: 'out' }), ...(options ? { options } : {}) }],
  });
  await step(
    'output_on_off',
    ['from machine import Pin', 'import time', 'led = Pin(4, Pin.OUT)', 'led.on()', 'time.sleep_ms(40)', 'led.off()', 'time.sleep_ms(40)', 'led.value(1)', 'time.sleep_ms(40)', 'led.value()'].join('\n'),
    { wiring: outputWiring({ color: 'red' }) },
  );
  await step(
    'output_pwm',
    ['from machine import Pin, PWM', 'import time', 'p = PWM(Pin(4), freq=1000, duty=512)', 'time.sleep_ms(40)', 'p.duty(0)', 'time.sleep_ms(40)', 'p.deinit()'].join('\n'),
    { wiring: outputWiring({ kind: 'relay' }) },
  );
  // 입력 전용 핀(34)에 출력을 쓰면 실물처럼 오류 — 배선 검사(input-only-output)가 먼저 막는 상황
  await step(
    'output_on_input_only_pin',
    ['from machine import Pin', 'try:', '    Pin(34, Pin.OUT)', '    r = "no error"', 'except Exception as e:', '    r = type(e).__name__ + ": " + str(e)', 'r'].join('\n'),
    { wiring: { parts: [entry('output-digital', 'led', '빨강 LED', { sig: 34 }, { sig: 'out' })] } },
  );
}
