// OLED의 파이썬 쪽 — framebuf 흉내(extmod/modframebuf.c와 같은 계산), ssd1306·sh1106 드라이버 흉내, SSD1306 호환 장치의 명령·그림 바이트 해석을
// 실제 Pyodide(JSPI)로 확인. PLAN §8.3 P3-04. 단계는 tests/unit/board-i2c/steps/i2c-oled.mjs.
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf } from '../lab/helpers/pyodide-board.ts';

describe.skipIf(!boardPyodideReady)('OLED — framebuf·드라이버 흉내·SSD1306 장치(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/board-i2c/steps/i2c-oled.mjs');

  it('framebuf: 형식별 비트 배치·채우기·선(Bresenham)·네모·타원·다각형·스크롤·옮겨 그리기·색 형식', () => {
    const record = stepOf(out, 'framebuf');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    const value = record.value as Record<string, unknown>;
    expect(value.hlsb).toEqual([[128, 0, 0, 1], 1, 0, null]);
    expect(value.fill_rect).toEqual([255, 199, 199, 255]);
    expect(value.hmsb_vlsb).toEqual([[1], [128, 156]]);
    expect(value.line).toEqual([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
      [4, 1],
      [5, 1],
      [6, 2],
      [7, 2],
    ]);
    expect(value.rect).toBe(10);
    expect(value.rect_fill).toBe(12);
    const [ellipseCount, symmetric, extremes] = value.ellipse as [number, boolean, boolean[]];
    expect(ellipseCount).toBeGreaterThan(4);
    expect(symmetric).toBe(true);
    expect(extremes).toEqual([true, true, true, true]);
    const quadrant = value.ellipse_q1 as [number, number][];
    expect(quadrant.length).toBeGreaterThan(0);
    expect(quadrant.every(([x, y]) => x >= 4 && y <= 4)).toBe(true);
    expect(value.poly).toEqual([true, true, true, true, true]);
    expect(value.scroll).toEqual([192]);
    expect(value.blit).toEqual([
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ]);
    expect(value.blit_key).toEqual([
      [0, 0],
      [1, 1],
    ]);
    expect(value.color_formats).toEqual([0xf800, [0x00, 0xf8], [0xa0, 0x05], 5, [12], 3]);
  });

  it('framebuf 글자: 8×8칸, 128칸 화면에 16글자까지(넘치면 잘림), 한글은 UTF-8 바이트마다 표에 없는 글자 칸, 글자 기록은 화면 낭독기용', () => {
    const value = stepOf(out, 'framebuf').value as Record<string, unknown>;
    expect(value.text_clip).toEqual([1, 125, 1, 'AAA']);
    expect(value.text_utf8).toEqual([1, 1, 1, 0, [[0, 10, '한', 24, 1]]]);
    expect(value.text_edge).toEqual([true, [120, 60]]);
  });

  it('framebuf 오류는 MicroPython과 같은 종류·문구', () => {
    const value = stepOf(out, 'framebuf').value as Record<string, unknown>;
    expect(value.errors).toEqual([
      ['TypeError', 'object with buffer protocol required'],
      ['ValueError', ''],
      ['ValueError', 'invalid format'],
      ['TypeError', 'function missing 1 required positional arguments'],
      ['TypeError', "can't convert 'int' object to str implicitly"],
      ['TypeError', "can't convert float to int"],
      ['ValueError', ''],
      ['ok', 'None'],
    ]);
  });

  it('교과서 코드 자료 그대로(ssd1306): f054 두 줄 글자·f055 숫자 — 드라이버 버퍼가 I2C를 거쳐 가상 OLED RAM과 똑같다(켜짐·방향·대비·글자 설명)', () => {
    const f054 = stepOf(out, 'f054_text');
    expect(f054.errorType, f054.errorMessage).toBeUndefined();
    expect(f054.value).toEqual([true, true, true, 255, ['Hello, ESP32!', 'OLED Display!'], 305, 305, true]);
    expect(f054.notices).toEqual([]);
    const f055 = stepOf(out, 'f055_number');
    expect(f055.errorType, f055.errorMessage).toBeUndefined();
    expect((f055.value as unknown[]).slice(4)).toEqual([['number: 123'], 122, 122, true]);
    // 화면에 알리는 board.device는 상태가 바뀐 전송에서만, 16ms로 합쳐서(초기화 명령 약 30번·그림 1번보다 훨씬 적게) — 마지막 알림이 최종 화면
    const devices = f054.devices ?? [];
    expect(devices.length).toBeGreaterThan(0);
    expect(devices.length).toBeLessThanOrEqual(10);
    const last = devices.at(-1)?.state as { on?: boolean; width?: number; height?: number; texts?: { text: string }[] };
    expect(devices.at(-1)?.part).toBe('oled-i2c');
    expect([last.on, last.width, last.height, (last.texts ?? []).map((item) => item.text)]).toEqual([true, 128, 64, ['Hello, ESP32!', 'OLED Display!']]);
  });

  it('f057 점 삼각형: pixel 729번이 모두 가상 OLED의 점이 된다(시에르핀스키 무늬와 똑같음)', () => {
    const record = stepOf(out, 'f057_triangle');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual([729, 729, true]);
  });

  it('원고의 이름 sh1106.SH1106_I2C도 같은 흉내: FrameBuffer를 물려받고 주소 0x3C, f054와 같은 화면', () => {
    const record = stepOf(out, 'sh1106_textbook');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual([true, true, 60, 128, 64, 8, true, true, true, 255, ['Hello, ESP32!', 'OLED Display!'], 305, 305, true]);
  });

  it('화면 명령: poweroff·poweron·invert·contrast·rotate, SH1106의 sleep·flip이 장치 상태로 간다', () => {
    const record = stepOf(out, 'oled_commands');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual([
      [true, false, 255, true, true],
      [false, false, 255, true, true],
      [true, true, 10, true, true],
      [true, false, 10, false, false],
      [false, false, 255, true, true],
      [true, false, 255, false, false],
      [true, false, 255, true, true],
      [true, { '0': 0 }],
    ]);
  });

  it('SSD1306 바이트: 제어 바이트(Co·D/C), 쪽 주소 방식(B0~B7·00~0F·10~1F), 여러 전송에 나뉜 명령 값, 가로 주소 방식의 열·쪽 범위와 되돌아가기', () => {
    const record = stepOf(out, 'ssd1306_bytes');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual([[255, 1, 0x17, 2, true], 64, [0xaa, 0xf0, 0xaa], 0, [17, 7]]);
  });

  it('OLED가 없거나 주소가 다르면 드라이버를 만들 때 ENODEV + 한국어 안내, SPI OLED는 한국어로 흉내 내지 않는다고 알린다', () => {
    const missing = stepOf(out, 'no_oled');
    expect(missing.errorType).toBe('OSError');
    expect(missing.errorMessage).toBe('OSError: [Errno 19] ENODEV');
    expect(missing.stdout).toContain('[32]');
    expect(missing.notices).toEqual([expect.stringContaining('I2C 주소 0x3C(60)에 대답하는 장치가 없어요')]);
    const wrong = stepOf(out, 'wrong_address');
    expect(wrong.errorType).toBe('OSError');
    expect(wrong.notices).toEqual([expect.stringContaining('OLED(128×64)(주소 0x3C)')]);
    const spi = stepOf(out, 'spi_placeholder');
    expect(spi.errorType).toBe('NotImplementedError');
    expect(spi.errorMessage).toContain('SPI로 잇는 OLED');
  });
});
