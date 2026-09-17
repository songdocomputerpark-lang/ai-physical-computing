// 구역 A(P3-03 PWM·ADC 부품) — machine.PWM·machine.ADC 확장(src/lab/modules/board/ext/{pwm,adc}/)과 서보 라이브러리·교과서 예제를 실제 Pyodide로 확인하는 단계들.
// tests/unit/lab/pyodide-board-pwm-adc.test.ts가 공유 도우미(pyodide-board-run.mjs --steps=이 파일)로 돌린다(src/lab/README.md 7.7·7.9).
// 받는 도구: step(이름, 코드, { inputs, wiring, during, onMark, stopAfterMs, idle }), bridge, pyodide, rootDir.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** examples/ 아래 예제 파일(원본에서 옮긴 코드 그대로) */
function exampleCode(rootDir, file) {
  return fs.readFileSync(path.join(rootDir, 'examples', ...file.split('/')), 'utf8');
}

/** 화면이 하듯 보드 라이브러리(examples/esp32/lib/**\/*.py)를 워커의 /board/lib/에 써 넣는다(board/index.ts writeLibraries) */
function writeBoardLibraries(pyodide, rootDir) {
  const libDir = path.join(rootDir, 'examples', 'esp32', 'lib');
  const walk = (dir) =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith('.py') ? [path.join(dir, entry.name)] : []))
      : [];
  pyodide.FS.mkdirTree('/board/lib');
  const names = [];
  for (const full of walk(libDir)) {
    pyodide.FS.writeFile(`/board/lib/${path.basename(full)}`, fs.readFileSync(full, 'utf8'));
    names.push(path.basename(full));
  }
  return names.sort();
}

const SERVO_WIRING = (pins) => ({
  parts: pins.map((pin, index) => ({
    part: 'servo',
    id: pins.length === 1 ? 'servo' : `servo-${index + 1}`,
    label: pins.length === 1 ? '서보모터' : `서보모터 ${index + 1}`,
    pins: { sig: pin },
    directions: { sig: 'out' },
    known: true,
  })),
});

export default async function pwmAdcSteps({ step, bridge, pyodide, rootDir }) {
  const libraries = writeBoardLibraries(pyodide, rootDir);
  // 4채널 터치 부품(화면)이 패드마다 거는 전압 — 같은 식으로 파이썬 ADC가 688·1535·2381·3263을 읽어야 한다
  const touchModel = await import(pathToFileURL(path.join(rootDir, 'src', 'lab', 'modules', 'board', 'parts', 'touch-analog-4ch', 'touch4-model.ts')).href);
  const padMv = touchModel.TOUCH4_PADS.map((pad) => touchModel.millivoltsForRaw12(pad.raw));

  await step(
    'pwm_basics',
    [
      'from machine import Pin, PWM',
      'import machine, time',
      'r = []',
      'p = PWM(Pin(15))',
      'r.append([repr(p), p.freq(), p.duty(), p.duty_u16()])',
      'p.freq(262)',
      'p.duty(512)',
      'r.append([repr(p), p.freq(), p.duty(), p.duty_u16(), p.duty_ns()])',
      'p.duty(1023)',
      'r.append([p.duty(), p.duty_u16()])',
      'p.duty_u16(65535)',
      'r.append([p.duty_u16(), repr(p)])',
      'p.duty(0)',
      'r.append(p.duty())',
      'q = PWM(27, 1000, duty=40)',
      'r.append([repr(q), q.freq()])',
      'q.init(freq=50)',
      'r.append([repr(q), q.duty(), q.duty_ns()])',
      'q.duty_ns(1500000)',
      'r.append([repr(q), q.duty_u16()])',
      'hi = PWM(Pin(4), freq=100000, duty=1)',
      'r.append([repr(hi), hi.duty()])',
      'slow = PWM(Pin(5), freq=5, duty=512)',
      'r.append([repr(slow), slow.freq()])',
      'time.sleep_ms(30)',
      'p.duty(512)',
      'time.sleep_ms(30)',
      'p.deinit()',
      'r.append(repr(p))',
      'for call in [lambda: p.freq(), lambda: p.duty(), lambda: p.duty(10), lambda: p.freq(100), lambda: p.duty_u16()]:',
      '    try:',
      '        call()',
      '        r.append("no error")',
      '    except Exception as e:',
      '        r.append(type(e).__name__ + ": " + str(e))',
      'p.init(duty=100)',
      'r.append([repr(p), machine.PWM is PWM])',
      'time.sleep_ms(30)',
      'r',
    ].join('\n'),
    { wiring: { parts: [] } },
  );

  await step(
    'pwm_errors',
    [
      'from machine import Pin, PWM',
      'r = []',
      'pwm = PWM(Pin(2), freq=1000, duty=0)',
      'cases = [',
      '    lambda: pwm.duty(1024), lambda: pwm.duty(-1), lambda: pwm.duty_u16(65536), lambda: pwm.duty_u16(-5),',
      '    lambda: pwm.duty_ns(10**6 + 1), lambda: pwm.freq(0), lambda: pwm.freq(40000001), lambda: pwm.duty(512.0),',
      '    lambda: pwm.duty("1"), lambda: pwm.duty(2**40), lambda: pwm.duty(1, 2), lambda: pwm.duty(duty=3),',
      '    lambda: pwm.deinit(1), lambda: PWM(), lambda: PWM(Pin(2), 1000, 2), lambda: PWM(24), lambda: PWM(Pin(2), freq=50, duty=2000),',
      '    lambda: PWM(Pin(2), duty=5, bogus=1), lambda: PWM(Pin(2), 1000, freq=10), lambda: PWM(Pin(34), freq=1000),',
      '    lambda: PWM(Pin(19), duty_ns=100), lambda: pwm.init(1000, 512),',
      ']',
      'for case in cases:',
      '    try:',
      '        case()',
      '        r.append("no error")',
      '    except Exception as e:',
      '        r.append([type(e).__name__, str(e), list(e.args)])',
      'r.append([repr(pwm), pwm.duty(), pwm.freq(), pwm.duty(True), pwm.duty()])',
      'r',
    ].join('\n'),
  );

  // LEDC 채널 16개: 같은 주파수면 핀 16개까지, 17번째는 RuntimeError("out of PWM channels:16")
  await step(
    'pwm_channels_limit',
    [
      'from machine import Pin, PWM',
      'r = []',
      'made = []',
      'for gpio in [0, 2, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26]:',
      '    try:',
      '        made.append(PWM(Pin(gpio), freq=1000))',
      '    except Exception as e:',
      '        r.append([gpio, type(e).__name__, str(e)])',
      'r.append(len(made))',
      'r',
    ].join('\n'),
    { wiring: { parts: [] } },
  );

  // 타이머 8개(모드 2 × 4): 주파수 8가지까지. 새 PWM을 9번째 주파수로 만들면 소스대로 채널 찾기에서 막혀 "out of PWM channels:16",
  // 타이머를 다른 핀과 함께 쓰는 PWM의 주파수를 바꾸면 "out of PWM timers:8". 같은 주파수는 타이머를 함께 쓰고, 하나를 끄면 자리가 난다.
  await step(
    'pwm_timers_limit',
    [
      'from machine import Pin, PWM',
      'r = []',
      'made = [PWM(Pin(gpio), freq=100 * (i + 1), duty=10) for i, gpio in enumerate([2, 4, 5, 12, 13, 14, 15, 16])]',
      'r.append([p.freq() for p in made])',
      'try:',
      '    PWM(Pin(17), freq=950)',
      '    r.append("no error")',
      'except RuntimeError as e:',
      '    r.append(str(e))',
      'same = PWM(Pin(18), freq=100, duty=100)',
      'r.append(repr(same))',
      'try:',
      '    same.freq(950)',
      '    r.append("no error")',
      'except RuntimeError as e:',
      '    r.append(str(e))',
      'made[7].freq(950)',
      'r.append(made[7].freq())',
      'made[1].deinit()',
      'again = PWM(Pin(17), freq=975, duty=20)',
      'r.append(repr(again))',
      'r',
    ].join('\n'),
  );

  await step(
    'pwm_pin_reinit',
    [
      'from machine import Pin, PWM',
      'import apc_board, time',
      'B = apc_board.BOARD',
      'r = []',
      'led = PWM(Pin(2), freq=1000, duty=512)',
      'r.append(B.pwm_of(2))',
      'Pin(2, Pin.OUT)',
      'r.append(B.pwm_of(2))',
      'led.duty(100)',
      'r.append([B.pwm_of(2), led.duty()])',
      'time.sleep_ms(20)',
      'led.deinit()',
      'led2 = PWM(Pin(2), freq=2000, duty=256)',
      'r.append(B.pwm_of(2))',
      'inv = PWM(Pin(4), freq=1000, duty=256, invert=True)',
      'r.append([B.pwm_of(4), repr(inv)])',
      'Pin(4).value()',
      'r.append(Pin(4).value())',
      'time.sleep_ms(20)',
      'r',
    ].join('\n'),
    { wiring: { parts: [{ part: 'builtin-led', id: 'builtin-led', label: '내장 LED', pins: { led: 2 }, directions: { led: 'out' }, known: true }] } },
  );

  // 지난 실행에서 만든 PWM 객체는 새 실행(보드를 새로 켬)에서 멈춘 것으로 본다 — 모듈 전역에 객체를 남겨 다음 실행에서 쓴다
  await step('pwm_generation_first', ['import apc_board', 'from machine import PWM', 'apc_board._left_pwm = PWM(15, freq=440)', 'repr(apc_board._left_pwm)'].join('\n'));
  await step(
    'pwm_generation_second',
    [
      'import apc_board',
      'old = apc_board._left_pwm',
      'r = [repr(old), apc_board.BOARD.pwm_of(15)]',
      'try:',
      '    old.duty(10)',
      'except RuntimeError as e:',
      '    r.append(str(e))',
      'del apc_board._left_pwm',
      'r',
    ].join('\n'),
  );

  // 교과서 f060(RGB LED 빨강 밝기 서서히): 원본 그대로 돌리며 핀 27의 duty가 오르내린다
  await step('textbook_f060_fade', exampleCode(rootDir, 'esp32/u2/2-1-4-rgb-pwm-fade.py'), { stopAfterMs: 2600 });

  // 교과서 f068(버저 음계): 원본 그대로 — 8음을 0.5초씩, 마지막에 deinit
  await step('textbook_f068_scale', exampleCode(rootDir, 'esp32/u2/2-2-1-buzzer-scale.py'));

  await step(
    'adc_basics',
    [
      'from machine import ADC, Pin',
      'import apc_runtime, time',
      'r = []',
      'a = ADC(Pin(32))',
      'r.append([repr(a), ADC.ATTN_0DB, ADC.ATTN_2_5DB, ADC.ATTN_6DB, ADC.ATTN_11DB, ADC.WIDTH_9BIT, ADC.WIDTH_12BIT, ADC(32) is a, ADC(Pin(32)) is a])',
      'a.atten(ADC.ATTN_11DB)',
      'a.width(ADC.WIDTH_12BIT)',
      'r.append([a.read(), a.read_u16(), a.read_uv()])',
      'readings = []',
      "for mark in ['pad1', 'pad2', 'pad3', 'pad4', 'none']:",
      "    apc_runtime.emit('board.device', {'mark': mark})",
      '    time.sleep_ms(30)',
      '    readings.append(a.read())',
      'r.append(readings)',
      "apc_runtime.emit('board.device', {'mark': 'pad2'})",
      'time.sleep_ms(30)',
      'widths = []',
      'for bits in (9, 10, 11, 12):',
      '    a.width(bits)',
      '    widths.append([a.read(), a.read_u16()])',
      'r.append(widths)',
      'attens = []',
      'for atten in (0, 1, 2, 3):',
      '    a.atten(atten)',
      '    attens.append([a.read(), a.read_uv(), repr(a)])',
      'r.append(attens)',
      'b = ADC(Pin(33), atten=ADC.ATTN_0DB)',
      'r.append([repr(b), b.read()])',
      'b.init()',
      'r.append(repr(b))',
      'errors = []',
      'for case in [lambda: ADC(Pin(5)), lambda: ADC(24), lambda: a.atten(4), lambda: a.width(13), lambda: a.width(8), lambda: ADC(), lambda: ADC(Pin(32), 3),',
      '             lambda: ADC(Pin(32), attn=3), lambda: a.read(1), lambda: a.atten(), lambda: a.block(), lambda: a.atten(1.5)]:',
      '    try:',
      '        case()',
      '        errors.append("no error")',
      '    except Exception as e:',
      '        errors.append(type(e).__name__ + ": " + str(e))',
      'r.append(errors)',
      'r',
    ].join('\n'),
    {
      inputs: { pins: { 32: { mv: padMv[1] }, 33: { mv: 3000 } } },
      wiring: { parts: [{ part: 'touch-analog-4ch', id: 'touch-analog-4ch', label: '4채널 터치', pins: { sig: 32 }, directions: { sig: 'in' }, known: true }] },
      onMark: (mark) => {
        const index = ['pad1', 'pad2', 'pad3', 'pad4'].indexOf(mark);
        bridge.pushEvent('board.input', { pin: 32, drive: { mv: index < 0 ? 0 : padMv[index] } });
      },
    },
  );

  // ADC 핀에 부품이 없으면(배선을 받은 실행) 한 번 알리고 0으로 읽는다
  await step('adc_unwired', ['from machine import ADC', 'a = ADC(34)', '[a.read(), a.read()]'].join('\n'), { wiring: { parts: [] } });

  // 교과서 f059(4채널 터치 값 읽기) 원본 그대로: 패드 1~4 값에 따른 콘솔 줄(원본 판정 구간이 겹쳐 패드 3·4를 잘못 알아보는 것까지)
  // + 사이트판(PD-10, 판정 구간 네 줄만 원고 152쪽 구간으로 고친 파일)은 패드 1~4를 Button 1~4로 알아본다
  for (const [name, file] of [
    ['textbook_f059_touch4', 'esp32/u2/2-1-3-adv-touch4-check.py'],
    ['site_f059_touch4', 'esp32/u2/2-1-3-adv-touch4-check-site.py'],
  ]) {
    await step(name, exampleCode(rootDir, file), {
      inputs: { pins: { 32: { mv: 0 } } },
      wiring: { parts: [{ part: 'touch-analog-4ch', id: 'touch-analog-4ch', label: '4채널 터치', pins: { sig: 32 }, directions: { sig: 'in' }, known: true }] },
      during: [
        [500, () => bridge.pushEvent('board.input', { pin: 32, drive: { mv: padMv[0] } })],
        [1100, () => bridge.pushEvent('board.input', { pin: 32, drive: { mv: padMv[1] } })],
        [1700, () => bridge.pushEvent('board.input', { pin: 32, drive: { mv: padMv[2] } })],
        [2300, () => bridge.pushEvent('board.input', { pin: 32, drive: { mv: padMv[3] } })],
      ],
      stopAfterMs: 3100,
    });
  }

  // 서보 라이브러리(복원본): f078 원본 그대로 — duty 40·77·115, 50Hz, 프로필 servo40 알림
  await step('servo_library_f078', exampleCode(rootDir, 'esp32/u2/2-2-4-servo-angles.py'), { wiring: SERVO_WIRING([25]) });

  // 서보 2개(f080): 두 핀 모두 duty 40↔115, 두 서보에 프로필 알림
  await step('servo_library_f080', exampleCode(rootDir, 'esp32/u2/2-2-4-servo-two.py'), { wiring: SERVO_WIRING([25, 26]), stopAfterMs: 3400 });

  // 라이브러리 없이 PWM을 직접 쓰면 프로필 알림이 없다(화면은 기본 mg90s). mg90s_servo 라이브러리(시험용 파일)는 mg90s로 알린다.
  await step(
    'servo_profiles',
    [
      'from machine import Pin, PWM',
      'import time, apc_part_servo',
      'raw = PWM(Pin(25), freq=50, duty=77)',
      'time.sleep_ms(20)',
      'before = apc_part_servo.current_profile()',
      "with open('/board/lib/mg90s_servo.py', 'w') as f:",
      "    f.write('from machine import Pin, PWM\\nclass MG90S_SERVO:\\n    def __init__(self, signal_pin):\\n        self.pwm = PWM(Pin(signal_pin), freq=50, duty=0)\\n')",
      'import importlib',
      'importlib.invalidate_caches()',
      'from mg90s_servo import MG90S_SERVO',
      'MG90S_SERVO(26)',
      'time.sleep_ms(20)',
      'after = apc_part_servo.current_profile()',
      "import os\nos.remove('/board/lib/mg90s_servo.py')",
      '[list(before), list(after)]',
    ].join('\n'),
    { wiring: SERVO_WIRING([25]) },
  );

  // 라이브러리 파일이 없으면 원래처럼 ModuleNotFoundError(표에 있는 이름이면 한국어 안내)
  await step(
    'servo_library_missing',
    [
      'import os, importlib, sys',
      "os.rename('/board/lib/servo_library.py', '/board/lib/servo_library.bak')",
      "sys.modules.pop('servo_library', None)",
      'importlib.invalidate_caches()',
      'try:',
      '    from servo_library import ServoMotor',
      '    r = "no error"',
      'except ModuleNotFoundError as e:',
      '    r = [type(e).__name__, e.name, str(e)]',
      "os.rename('/board/lib/servo_library.bak', '/board/lib/servo_library.py')",
      'importlib.invalidate_caches()',
      'r',
    ].join('\n'),
  );

  // 교과서 f073(팬 모터 정·역회전·정지): 원본 그대로 — 핀 25·26의 값 차례
  await step('textbook_f073_fan', exampleCode(rootDir, 'esp32/u2/2-2-3-fan-direction.py'), { stopAfterMs: 5000 });

  // 교과서 f062(레이저 + RGB LED): 원본은 set_color에 값 3개를 넘겨 첫 반복에서 TypeError(원본 결함),
  // 사이트판(원고 147쪽처럼 g 핀 줄·값 3개)은 레이저 21번과 빨강 27·파랑 33이 1초마다 번갈아 켜진다
  const LASER_WIRING = {
    parts: [
      { part: 'rgb-led', id: 'rgb-led', label: 'RGB LED', pins: { r: 27, g: 32, b: 33 }, directions: { r: 'out', g: 'out', b: 'out' }, known: true },
      { part: 'laser', id: 'laser', label: '레이저', pins: { sig: 21 }, directions: { sig: 'out' }, known: true },
    ],
  };
  await step('textbook_f062_laser', exampleCode(rootDir, 'esp32/u2/2-1-4-laser-rgb.py'), { wiring: LASER_WIRING, stopAfterMs: 2600 });
  await step('site_f062_laser', exampleCode(rootDir, 'esp32/u2/2-1-4-laser-rgb-site.py'), { wiring: LASER_WIRING, stopAfterMs: 2600 });

  // 교과서 f058(4채널 터치 + OLED + RGB LED PWM 12·5·4): OLED(구역 B)가 있으면 끝까지 돈다 — 원본은 패드 3만 Button 2, 사이트판은 패드 1~4가 Button 1~4
  const OLED_RGB_WIRING = {
    parts: [
      { part: 'touch-analog-4ch', id: 'touch-analog-4ch', label: '4채널 터치', pins: { sig: 32 }, directions: { sig: 'in' }, known: true },
      { part: 'oled-i2c', id: 'oled', label: 'OLED(128×64)', pins: { sda: 21, scl: 22 }, directions: { sda: 'out', scl: 'out' }, known: true },
      { part: 'rgb-led', id: 'rgb-led', label: 'RGB LED', pins: { r: 12, g: 5, b: 4 }, directions: { r: 'out', g: 'out', b: 'out' }, known: true },
    ],
  };
  for (const [name, file] of [
    ['textbook_f058_touch4_oled', 'esp32/u2/2-1-3-adv-touch4-oled-rgb.py'],
    ['site_f058_touch4_oled', 'esp32/u2/2-1-3-adv-touch4-oled-rgb-site.py'],
  ]) {
    await step(name, exampleCode(rootDir, file), {
      inputs: { pins: { 32: { mv: 0 } } },
      wiring: OLED_RGB_WIRING,
      during: [
        [800, () => bridge.pushEvent('board.input', { pin: 32, drive: { mv: padMv[0] } })],
        [1600, () => bridge.pushEvent('board.input', { pin: 32, drive: { mv: padMv[1] } })],
        [2400, () => bridge.pushEvent('board.input', { pin: 32, drive: { mv: padMv[2] } })],
        [3200, () => bridge.pushEvent('board.input', { pin: 32, drive: { mv: padMv[3] } })],
        [4000, () => bridge.pushEvent('board.input', { pin: 32, drive: { mv: 0 } })],
      ],
      stopAfterMs: 4800,
    });
  }

  // 제한 모드가 아니어도 동기 진입점(reset_for_run — 확장의 초기화 훅 포함)에서 양보하지 않는다
  await new Promise((resolve) => setTimeout(resolve, 40));
  try {
    pyodide.runPython('import apc_runtime\napc_runtime.reset_for_run()');
    bridge.setValue('board.pwmAdcReset', 'ok');
  } catch (error) {
    bridge.setValue('board.pwmAdcReset', String(error && error.message ? error.message : error).split('\n').slice(-1)[0]);
  }
  await step('sync_reset_result', ["import apc_runtime", "[apc_runtime.peek('board.pwmAdcReset', None), " + JSON.stringify(libraries) + ']'].join('\n'));
}
