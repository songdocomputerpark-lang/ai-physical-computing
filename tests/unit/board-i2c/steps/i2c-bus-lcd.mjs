// 가상 I2C 버스(machine.I2C·SoftI2C)와 문자 LCD(PCF8574 → HD44780 바이트 해석)를 실제 Pyodide로 확인하는 단계들 — PLAN §8.3 P3-04.
// tests/unit/board-i2c/pyodide-i2c-bus-lcd.test.ts가 공유 도우미(tests/unit/lab/helpers/pyodide-board-run.mjs --steps=이 파일)로 돌린다(README 7.7·7.9).
// 교과서 예제(examples/esp32/…)는 파일 글자 그대로 돌리고, 결과를 보는 줄은 파일 끝에 덧붙인다(원본 줄 번호는 그대로).
import fs from 'node:fs';
import path from 'node:path';

/** 배선(화면이 넣는 board.wiring 모양) */
export const LCD_ENTRY = { part: 'lcd-i2c', id: 'lcd', label: '문자 LCD(16×2)', pins: { sda: 21, scl: 22 }, directions: { sda: 'out', scl: 'out' }, known: true };
export const TOUCH_ENTRY = { part: 'touch-digital', id: 'touch-digital', label: '터치 센서', pins: { sig: 17 }, directions: { sig: 'in' }, known: true };

/** 결과를 보는 줄: 가상 LCD의 보이는 32칸 글자 */
const SCREEN = [
  'import apc_board as _apc_board',
  '_lcd = [_d for _e, _d in _apc_board.wired_devices() if _e["part"] == "lcd-i2c"][0]',
  '[bytes(_lcd.lcd.visible_codes()).decode("latin-1")]',
].join('\n');

export default async function i2cBusLcdSteps({ step, bridge, pyodide, rootDir }) {
  const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8');
  // 화면(보드 모듈 index.ts)이 파이썬 준비 때 넣는 것과 같게 보드 라이브러리를 /board/lib에 넣는다
  pyodide.FS.mkdirTree('/board/lib');
  pyodide.FS.writeFile('/board/lib/i2c_lcd.py', read('examples/esp32/lib/third-party/i2c_lcd.py'));
  const wiring = { parts: [LCD_ENTRY] };

  // ── machine.SoftI2C 기본 ──
  await step(
    'soft_basics',
    [
      'from machine import Pin, SoftI2C',
      'import apc_board',
      'i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)',
      'out = [repr(i2c), repr(SoftI2C(Pin(22), 21, freq=100000)), repr(SoftI2C(scl=22, sda=21, freq=-5))]',
      'out.append(i2c.scan())',
      "out.append(i2c.writeto(0x20, b'\\x08\\x0c'))",
      'out.append(list(i2c.readfrom(0x20, 2)))',
      'buf = bytearray(1)',
      'out.append([i2c.readfrom_into(0x20, buf), list(buf)])',
      "out.append(i2c.writevto(0x20, [b'\\x00', b'', bytearray(b'\\x08')]))",
      'out.append(list(i2c.readfrom_mem(0x20, 0x08, 1)))',
      "out.append(i2c.writeto_mem(0x20, 0x00, b'\\x0c'))",
      "out.append(i2c.writeto(0xA0, 'x'))",
      'out.append(i2c.deinit())',
      "out.append([(p['id'], p['mode'], p['level'], p['driven']) for p in apc_board.BOARD.snapshot('change')['pins']])",
      'out',
    ].join('\n'),
    { wiring },
  );

  // ── 인자 오류·주소 없음(ENODEV) — 문구는 MicroPython v1.29.0과 같다 ──
  await step(
    'soft_errors',
    [
      'from machine import Pin, SoftI2C',
      'i2c = SoftI2C(scl=Pin(22), sda=Pin(21))',
      'def catch(fn):',
      '    try:',
      '        return ["ok", repr(fn())]',
      '    except Exception as error:',
      '        return [type(error).__name__, str(error), list(error.args), getattr(error, "errno", None)]',
      'out = []',
      "out.append(catch(lambda: i2c.writeto(0x27, b'\\x00')))",
      'out.append(catch(lambda: i2c.readfrom(0x3C, 1)))',
      'out.append(catch(lambda: SoftI2C(scl=Pin(22))))',
      'out.append(catch(lambda: SoftI2C(Pin(22), Pin(21), 400000)))',
      'out.append(catch(lambda: SoftI2C(scl=Pin(22), sda=Pin(21), speed=1)))',
      "out.append(catch(lambda: SoftI2C(scl=Pin(22), sda='D21')))",
      'out.append(catch(lambda: SoftI2C(scl=Pin(22), sda=Pin(21), freq=0)))',
      'out.append(catch(lambda: i2c.writeto(0x20)))',
      'out.append(catch(lambda: i2c.writeto(0x20, 5)))',
      "out.append(catch(lambda: i2c.writeto(32.0, b'')))",
      "out.append(catch(lambda: i2c.readfrom_into(0x20, b'ab')))",
      'out.append(catch(lambda: i2c.writevto(0x20, 5)))',
      'out.append(catch(lambda: i2c.readfrom_mem(0x20, 0, 1, addrsize=12)))',
      'out.append(catch(lambda: i2c.scan(1)))',
      "out.append(catch(lambda: i2c.writeto(0x20, b'', stop=True)))",
      'out.append(catch(lambda: i2c.readfrom(0x20, -1)))',
      'out.append(catch(lambda: i2c.readfrom_mem(0x20, 0, 1, 8)))',
      'out',
    ].join('\n'),
    { wiring },
  );

  // SDA·SCL을 바꿔 적으면 장치가 대답하지 않는다(ENODEV + 배선과 다르다는 안내)
  await step('swapped_pins', ['from machine import Pin, SoftI2C', 'i2c = SoftI2C(scl=Pin(21), sda=Pin(22))', 'out = [i2c.scan()]', "i2c.writeto(0x20, b'\\x00')"].join('\n'), { wiring });

  // 배선에 I2C 장치가 없으면 ENODEV + 안내 한 줄(핀 모드 안내 "배선에 없는 핀을 출력으로"는 I2C 선에서 끈다)
  await step('no_wiring', ['from machine import Pin, SoftI2C', 'i2c = SoftI2C(scl=Pin(22), sda=Pin(21))', 'print(i2c.scan())', "i2c.writeto(0x20, b'\\x00')"].join('\n'), {
    wiring: { parts: [] },
  });

  // ── machine.I2C(하드웨어, v1.29.0 새 ESP-IDF 드라이버) ──
  await step(
    'hardware',
    [
      'from machine import I2C, Pin, SoftI2C',
      'import apc_board',
      'def catch(fn):',
      '    try:',
      '        return ["ok", repr(fn())]',
      '    except Exception as error:',
      '        return [type(error).__name__, str(error), list(error.args)]',
      'a = I2C(0, scl=Pin(22), sda=Pin(21))',
      'b = I2C(0)',
      'out = [repr(a), a is b, repr(I2C(1)), a.scan()]',
      "out.append(a.writeto(0x20, b'\\x08\\x0c'))",
      'out.append(list(a.readfrom(0x20, 1)))',
      'out.append(a.readfrom(0x27, 0))',
      'out.append(list(a.readfrom_mem(0x20, 0x08, 1)))',
      "out.append(a.writevto(0x20, (b'\\x0c', b'\\x08')))",
      'out.append(catch(lambda: a.init()))',
      'out.append(catch(lambda: a.start()))',
      "out.append(catch(lambda: a.write(b'\\x00')))",
      'out.append(catch(lambda: I2C(2)))',
      "out.append(catch(lambda: a.writeto(0x100, b'')))",
      "out.append(catch(lambda: a.writeto(0x27, b'\\x00')))",
      's = I2C(-1, scl=Pin(22), sda=Pin(21))',
      'out.append([type(s).__name__, repr(s)])',
      "out.append([(p['id'], p['mode'], p['pull'], p['level']) for p in apc_board.BOARD.snapshot('change')['pins']])",
      'out',
    ].join('\n'),
    { wiring },
  );

  // ── SoftI2C 기본 동작(start·write·readinto·stop) ──
  await step(
    'primitives',
    [
      'from machine import Pin, SoftI2C',
      'i2c = SoftI2C(scl=Pin(22), sda=Pin(21))',
      'i2c.start()',
      'n1 = i2c.write(bytes([0x20 << 1, 0x08, 0x0C]))',
      'i2c.stop()',
      'i2c.start()',
      'n2 = i2c.write(bytes([0x27 << 1, 0x00]))',
      'i2c.stop()',
      'i2c.start()',
      'n3 = i2c.write(bytes([(0x20 << 1) | 1]))',
      'buf = bytearray(2)',
      'i2c.readinto(buf)',
      'i2c.stop()',
      "n4 = i2c.write(b'\\x00')",
      '[n1, n2, n3, list(buf), n4]',
    ].join('\n'),
    { wiring },
  );

  // ── HD44780 바이트 해석(라이브러리 없이 PCF8574 바이트를 직접) ──
  await step(
    'hd44780_bytes',
    [
      'from machine import Pin, SoftI2C',
      'import apc_board',
      'i2c = SoftI2C(scl=Pin(22), sda=Pin(21))',
      'dev = apc_board.wired_devices()[0][1]',
      'lcd = dev.lcd',
      'E, RS, BL = 0x04, 0x01, 0x08',
      'def pulse(nibble, rs=0):',
      '    base = BL | (nibble << 4) | (RS if rs else 0)',
      '    i2c.writeto(0x20, bytes([base | E]))',
      '    i2c.writeto(0x20, bytes([base]))',
      'def cmd(value):',
      '    pulse(value >> 4)',
      '    pulse(value & 0x0F)',
      'def data(value):',
      '    pulse(value >> 4, 1)',
      '    pulse(value & 0x0F, 1)',
      'def screen():',
      '    return bytes(lcd.visible_codes()).decode("latin-1")',
      'out = [[lcd.eight_bit, lcd.display_on, lcd.two_lines, dev.backlight]]',
      "i2c.writeto(0x20, b'\\x00')",
      'out.append([lcd.commands, dev.backlight])',
      'for n in (3, 3, 3, 2):',
      '    pulse(n)',
      'out.append([lcd.eight_bit, lcd.two_lines, lcd.commands])',
      'cmd(0x28); cmd(0x0C); cmd(0x01); cmd(0x06)',
      "for ch in b'Hi':",
      '    data(ch)',
      'cmd(0x80 | 0x40 | 14)',
      "for ch in b'ABCD':",
      '    data(ch)',
      'out.append(screen())',
      'cmd(0x0F)',
      'out.append(lcd.cursor_cell())',
      'cmd(0x80 | 0x40 | 3)',
      'out.append(lcd.cursor_cell())',
      'cmd(0x18)',
      'out.append(screen())',
      'cmd(0x02)',
      'cmd(0x40)',
      'for row in (0x0E, 0x11, 0x11, 0x11, 0x0E, 0, 0, 0):',
      '    data(row)',
      'cmd(0x80)',
      'data(0)',
      'out.append([list(lcd.cgram[:8]), lcd.ddram[0], screen()[0] == chr(0)])',
      'cmd(0x08)',
      'out.append(screen().strip())',
      "i2c.writeto(0x20, b'\\x00')",
      'state = dev.state()',
      'out.append([dev.backlight, state["display"], state["lines"], state["bits"], "cursor" in state])',
      '# 초기화 순서를 두 번 보내도(반 바이트가 어긋난 상태에서 시작해도) 4비트 모드로 다시 맞춰진다',
      'pulse(0x3)',
      'for n in (3, 3, 3, 2):',
      '    pulse(n)',
      'cmd(0x28); cmd(0x0C); cmd(0x01)',
      "for ch in b'OK':",
      '    data(ch)',
      'out.append([lcd.eight_bit, screen()[:2]])',
      'out',
    ].join('\n'),
    { wiring },
  );

  // ── 교과서 예제 그대로(f047·f048·f144·f050) ──
  await step('f047_text', `${read('examples/esp32/u2/2-1-2-lcd-text-check.py')}\n${SCREEN}`, { wiring });
  await step('f048_number', `${read('examples/esp32/u2/2-1-2-lcd-number-check.py')}\n${SCREEN}`, { wiring });
  await step('f144_bt_hello', `${read('examples/esp32/bt/b5-lcd-hello.py')}\n${SCREEN}`, { wiring });
  await step('f050_count_move_to', `${read('examples/esp32/u2/2-1-2-lcd-count.py')}\n${SCREEN}`, { wiring });

  // f052(터치할 때마다 Counter 1씩): 0.05초마다 터치를 읽는 반복문 — 누름·뗌을 두 번(0.3초 디바운스보다 길게) 넣고 [정지]
  await step('f052_touch_counter', read('examples/esp32/u2/2-1-2-adv-touch-lcd-counter.py'), {
    wiring: { parts: [TOUCH_ENTRY, LCD_ENTRY] },
    inputs: { pins: { 17: 0 } },
    during: [
      [700, () => bridge.pushEvent('board.input', { pin: 17, drive: 1 })],
      [1200, () => bridge.pushEvent('board.input', { pin: 17, drive: 0 })],
      [1900, () => bridge.pushEvent('board.input', { pin: 17, drive: 1 })],
      [2400, () => bridge.pushEvent('board.input', { pin: 17, drive: 0 })],
    ],
    stopAfterMs: 3300,
  });

  // ── 19자 줄 넘김 덮어쓰기(CODE_MAPPING f105 비고): 둘째 줄에 19자 → 넘친 3칸이 첫 줄 앞을 덮는다(i2c_lcd.py 원본 커서 규칙) ──
  await step(
    'overflow_19',
    [
      'from machine import Pin, SoftI2C',
      'from i2c_lcd import I2cLcd',
      'lcd = I2cLcd(SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000), 0x20, 2, 16)',
      "lcd.putstr('X:1234 Y:5678')",
      'lcd.move_to(0, 1)',
      "text = 'd_c:{:<5} r_c:{:<5}'.format(1, 0)",
      'lcd.putstr(text)',
      'import apc_board',
      'device = apc_board.wired_devices()[0][1]',
      'after_19 = bytes(device.lcd.visible_codes()).decode("latin-1")',
      'lcd.clear()',
      "lcd.putstr('abcdefghijklmnopqrstuvwxyz0123456789')",
      "lcd.putchar('\\n')",
      "lcd.putstr('!')",
      '[len(text), after_19, bytes(device.lcd.visible_codes()).decode("latin-1"), lcd.cursor_x, lcd.cursor_y]',
    ].join('\n'),
    { wiring },
  );

  // ── 라이브러리의 커서·화면·백라이트·사용자 정의 글자 함수(원고 127쪽 LCD 화면 제어 함수 표) ──
  await step(
    'library_functions',
    [
      'from machine import Pin, SoftI2C',
      'from i2c_lcd import I2cLcd',
      'import apc_board',
      'lcd = I2cLcd(SoftI2C(scl=Pin(22), sda=Pin(21)), 0x20, 2, 16)',
      'dev = apc_board.wired_devices()[0][1]',
      'out = []',
      'lcd.show_cursor()',
      'out.append([dev.state().get("cursor"), dev.state()["underline"], dev.state()["blink"]])',
      'lcd.setcursor(2, 1)',
      'lcd.blink_cursor_on()',
      'out.append([dev.state().get("cursor"), dev.state()["blink"]])',
      'lcd.hide_cursor()',
      'out.append("cursor" in dev.state())',
      "lcd.putstr('Hi')",
      'lcd.display_off()',
      'out.append([dev.state()["display"], bytes(dev.lcd.visible_codes()).decode().strip()])',
      'lcd.display_on()',
      'lcd.backlight_off()',
      'out.append([dev.state()["display"], dev.state()["backlight"], bytes(dev.lcd.visible_codes()).decode().strip()])',
      'lcd.backlight_on()',
      'happy = bytearray([0x00, 0x0A, 0x00, 0x04, 0x00, 0x11, 0x0E, 0x00])',
      'lcd.custom_char(0, happy)',
      'lcd.putchar(chr(0))',
      'state = dev.state()',
      'out.append([list(state["cgram"][:8]), state["codes"][16 + 4], state["backlight"], [lcd.cursor_x, lcd.cursor_y]])',
      "lcd.putstr('안')",
      'out.append([ord("안") & 0xFF, dev.state()["codes"][16 + 5]])',
      'out',
    ].join('\n'),
    { wiring },
  );

  // ── sleep 없는 LCD 반복문도 [정지]로 멈춘다(I2C 전송이 입력 확인 지점) ──
  await step(
    'stop_busy_loop',
    [
      'from machine import Pin, SoftI2C',
      'from i2c_lcd import I2cLcd',
      'lcd = I2cLcd(SoftI2C(scl=Pin(22), sda=Pin(21)), 0x20, 2, 16)',
      'n = 0',
      'while True:',
      '    lcd.move_to(0, 0)',
      '    lcd.putstr(str(n))',
      '    n += 1',
    ].join('\n'),
    { wiring, stopAfterMs: 900 },
  );
}
