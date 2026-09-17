// 가상 I2C 버스(machine.I2C·SoftI2C)와 문자 LCD 바이트 해석(PCF8574 → HD44780)의 파이썬 쪽 — 실제 Pyodide(JSPI)로 확인. PLAN §8.3 P3-04.
// 단계는 tests/unit/board-i2c/steps/i2c-bus-lcd.mjs. 공유 도우미(helpers/pyodide-board-run.mjs)가 ESP32 실습실 워커와 같은 파일·순서로 돌린다.
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf, type BoardDeviceEventRecord } from '../lab/helpers/pyodide-board.ts';

/** board.device 상태의 글자 코드(Uint8Array가 JSON으로 {"0": n}이 되어 온다)를 32글자로 */
function screenText(record: BoardDeviceEventRecord | undefined): string {
  const state = (record?.state ?? {}) as { codes?: Record<string, number> };
  const codes = state.codes ?? {};
  return Array.from({ length: 32 }, (_, index) => String.fromCharCode(codes[String(index)] ?? 32)).join('');
}

describe.skipIf(!boardPyodideReady)('가상 I2C 버스와 문자 LCD — 파이썬 쪽(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/board-i2c/steps/i2c-bus-lcd.mjs');

  it('확장 파일이 ESP32 실습실 워커의 /apc에 들어간다(machine 확장·부품 흉내·드라이버)', () => {
    expect(out.jspi).toBe(true);
    expect(out.duplicate).toBeUndefined();
    expect(out.files).toEqual(expect.arrayContaining(['apc_board_i2c.py', 'apc_board_rtc.py', 'apc_part_lcd_i2c.py', 'apc_part_oled_i2c.py', 'framebuf.py', 'ssd1306.py', 'sh1106.py']));
  });

  it('SoftI2C: repr의 freq는 500000 // us_delay, scan은 배선의 LCD 주소, writeto·readfrom·writevto·mem 함수, 핀은 오픈 드레인·풀업으로 1', () => {
    const record = stepOf(out, 'soft_basics');
    expect(record.errorType).toBeUndefined();
    expect(record.notices).toEqual([]);
    expect(record.value).toEqual([
      'SoftI2C(scl=22, sda=21, freq=500000)',
      'SoftI2C(scl=22, sda=21, freq=100000)',
      'SoftI2C(scl=22, sda=21, freq=500000)',
      [32],
      2,
      [12, 12],
      [null, [12]],
      2,
      [8],
      null,
      1,
      null,
      [
        [21, 'open_drain', 1, false],
        [22, 'open_drain', 1, false],
      ],
    ]);
  });

  it('주소에 장치가 없으면 실물과 같은 OSError: [Errno 19] ENODEV(args (19,)) + 한국어 안내, 인자 오류는 MicroPython 문구', () => {
    const record = stepOf(out, 'soft_errors');
    expect(record.errorType).toBeUndefined();
    const results = record.value as unknown[][];
    expect(results[0]).toEqual(['OSError', '[Errno 19] ENODEV', [19], 19]);
    expect(results[1]).toEqual(['OSError', '[Errno 19] ENODEV', [19], 19]);
    expect(results.slice(2).map((item) => [item[0], item[1]])).toEqual([
      ['TypeError', "'sda' argument required"],
      ['TypeError', 'extra positional arguments given'],
      ['TypeError', 'extra keyword arguments given'],
      ['ValueError', 'invalid pin'],
      ['ZeroDivisionError', 'divide by zero'],
      ['TypeError', 'function missing 1 required positional arguments'],
      ['TypeError', 'object with buffer protocol required'],
      ['TypeError', "can't convert float to int"],
      ['TypeError', 'object with buffer protocol required'],
      ['TypeError', "object 'int' isn't a tuple or list"],
      ['ValueError', 'invalid addrsize'],
      ['TypeError', 'function takes 1 positional arguments but 2 were given'],
      ['TypeError', "function doesn't take keyword arguments"],
      ['MemoryError', 'memory allocation failed, allocating 4294967295 bytes'],
      ['TypeError', 'extra positional arguments given'],
    ]);
    expect(record.notices[0]).toContain('I2C 주소 0x27(39)에 대답하는 장치가 없어요');
    expect(record.notices[0]).toContain('문자 LCD(16×2)(주소 0x20)');
    expect(record.notices[1]).toContain('0x3C');
    expect(record.notices[2]).toContain('freq를 0으로');
  });

  it('SDA·SCL을 바꿔 적거나 배선에 I2C 장치가 없으면 ENODEV와 까닭 한 줄(핀 모드 안내가 겹치지 않음)', () => {
    const swapped = stepOf(out, 'swapped_pins');
    expect(swapped.errorType).toBe('OSError');
    expect(swapped.errorMessage).toBe('OSError: [Errno 19] ENODEV');
    expect(swapped.notices).toEqual([expect.stringContaining('코드는 SCL=GPIO21·SDA=GPIO22로 I2C를 열었는데, 배선도의 문자 LCD(16×2)은(는) SCL=GPIO22·SDA=GPIO21')]);
    const missing = stepOf(out, 'no_wiring');
    expect(missing.errorType).toBe('OSError');
    expect(missing.stdout).toContain('[]');
    expect(missing.notices).toEqual([expect.stringContaining('배선도에는 I2C 장치(문자 LCD·OLED)가 없어요')]);
  });

  it('machine.I2C(하드웨어): 번호마다 같은 객체·기본 핀·새 드라이버 규칙(보낸 바이트 수, 기본 동작 없음), I2C(-1)은 경고 뒤 SoftI2C', () => {
    const record = stepOf(out, 'hardware');
    expect(record.errorType).toBeUndefined();
    const value = record.value as unknown[];
    expect(value.slice(0, 9)).toEqual([
      'I2C(0, scl=22, sda=21, freq=400000, timeout=50000)',
      true,
      'I2C(1, scl=25, sda=26, freq=400000, timeout=50000)',
      [32],
      2,
      [12],
      {},
      [8],
      2,
    ]);
    expect(value.slice(9, 15).map((item) => (item as unknown[]).slice(0, 2))).toEqual([
      ['OSError', 'I2C operation not supported'],
      ['OSError', 'I2C operation not supported'],
      ['OSError', 'I2C operation not supported'],
      ['ValueError', "I2C(2) doesn't exist"],
      ['OSError', '[Errno 19] ENODEV'],
      ['OSError', '[Errno 19] ENODEV'],
    ]);
    expect(value[15]).toEqual(['SoftI2C', 'SoftI2C(scl=22, sda=21, freq=500000)']);
    expect(value[16]).toEqual([
      [21, 'open_drain', 'up', 1],
      [22, 'open_drain', 'up', 1],
      [25, 'open_drain', 'up', 1],
      [26, 'open_drain', 'up', 1],
    ]);
    expect(record.stdout).toContain('Warning: I2C(-1, ...) is deprecated, use SoftI2C(...) instead');
    expect(record.notices[0]).toContain('I2C 주소는 0~127(0x00~0x7F)이에요. 256은(는)');
  });

  it('SoftI2C 기본 동작: start → write(주소 바이트·데이터)의 ACK 수, 없는 주소는 0, readinto는 PCF8574 핀 값, START 없이 쓰면 0', () => {
    const record = stepOf(out, 'primitives');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([3, 0, 1, [12, 12], 0]);
  });

  it('HD44780 바이트 해석: 전원 직후 8비트·화면 끔, RW=1 떨어짐은 무시, 초기화 0x3·0x3·0x3·0x2 → 4비트, DDRAM 주소·데이터·커서·화면 이동·CGRAM·화면 끄기·백라이트', () => {
    const record = stepOf(out, 'hd44780_bytes');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([
      [true, false, false, true],
      [0, false],
      [false, true, 4],
      `Hi${' '.repeat(28)}AB`,
      null,
      [1, 3],
      `i${' '.repeat(28)}ABC`,
      [[14, 17, 17, 17, 14, 0, 0, 0], 0, true],
      '',
      [false, false, 2, 4, false],
      [false, 'OK'],
    ]);
  });

  it('교과서 예제 그대로: f047 Hello LCD!·f048 number: 123·BT 교안 Hello world·f050 move_to(사이트판 별칭)로 Count: 5', () => {
    const expected: Record<string, string> = {
      f047_text: 'Hello LCD!',
      f048_number: 'number: 123',
      f144_bt_hello: 'Hello world',
      f050_count_move_to: 'Count: 5',
    };
    for (const [name, text] of Object.entries(expected)) {
      const record = stepOf(out, name);
      expect(record.errorType, `${name}: ${record.errorMessage}`).toBeUndefined();
      expect(record.value).toEqual([`${text.padEnd(16, ' ')}${' '.repeat(16)}`]);
      expect(record.notices).toEqual([]);
    }
    // f050은 1초씩 6번 자므로 가상 시계로 약 6초
    expect(stepOf(out, 'f050_count_move_to').ms).toBeGreaterThan(5500);
    // LCD 상태는 16ms로 합쳐 보낸다 — 글자 하나마다 보내지 않는다
    expect((stepOf(out, 'f047_text').devices ?? []).length).toBeLessThan(40);
  });

  it('f052(터치할 때마다 Counter 1씩): 누름 두 번 → LCD "Counter: 2", [정지]로 멈춤', () => {
    const record = stepOf(out, 'f052_touch_counter');
    expect(record.errorType).toBe('KeyboardInterrupt');
    const devices = record.devices ?? [];
    expect(devices.length).toBeGreaterThan(0);
    const texts = devices.map((device) => screenText(device).slice(0, 16).trimEnd());
    expect(texts).toContain('Counter: 1');
    expect(texts.at(-1)).toBe('Counter: 2');
  });

  it('19자 줄 넘김 덮어쓰기(원본 i2c_lcd.py 커서 규칙): 둘째 줄의 넘친 3칸이 첫 줄 앞을 덮고, 36자는 첫 줄로 돌아오며 넘김 직후의 \\n은 무시', () => {
    const record = stepOf(out, 'overflow_19');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([19, '   234 Y:5678   d_c:1     r_c:0 ', '6789!fghijklmnopqrstuvwxyz012345', 5, 0]);
  });

  it('원고 127쪽 LCD 화면 제어 함수: 커서 보이기·깜빡이기·숨기기, 화면 끄기·켜기, 백라이트, 사용자 정의 글자, 한글은 ord의 아래 8비트', () => {
    const record = stepOf(out, 'library_functions');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([
      [[0, 0], true, false],
      [[1, 2], true],
      false,
      [false, ''],
      [true, false, 'Hi'],
      [[0, 10, 0, 4, 0, 17, 14, 0], 0, true, [5, 1]],
      [0x48, 0x48],
    ]);
  });

  it('sleep 없는 LCD 반복문도 [정지]를 누르면 곧 멈춘다(I2C 전송이 입력 확인 지점)', () => {
    const record = stepOf(out, 'stop_busy_loop');
    expect(record.errorType).toBe('KeyboardInterrupt');
    expect(record.ms).toBeLessThan(3000);
    expect((record.devices ?? []).length).toBeGreaterThan(3);
  });
});
