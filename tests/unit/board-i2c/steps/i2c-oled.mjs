// OLED(framebuf·ssd1306·sh1106 드라이버 흉내 + SSD1306 호환 장치의 명령·그림 바이트 해석)를 실제 Pyodide로 확인하는 단계들 — PLAN §8.3 P3-04.
// tests/unit/board-i2c/pyodide-i2c-oled.test.ts가 공유 도우미(tests/unit/lab/helpers/pyodide-board-run.mjs --steps=이 파일)로 돌린다.
import fs from 'node:fs';
import path from 'node:path';

export const OLED_ENTRY = { part: 'oled-i2c', id: 'oled', label: 'OLED(128×64)', pins: { sda: 21, scl: 22 }, directions: { sda: 'out', scl: 'out' }, known: true };
export const LCD_ENTRY = { part: 'lcd-i2c', id: 'lcd', label: '문자 LCD(16×2)', pins: { sda: 21, scl: 22 }, directions: { sda: 'out', scl: 'out' }, known: true };

/** 결과를 보는 줄: 가상 OLED 장치의 상태(켜짐·글자·켜진 RAM 비트 수)와 드라이버 버퍼의 켜진 비트 수 */
const OLED_CHECK = [
  'import apc_board as _apc_board',
  '_oled = [_d for _e, _d in _apc_board.wired_devices() if _e["part"] == "oled-i2c"][0]',
  '_state = _oled.state()',
  '[_state["on"], _state["remap"], _state["flip"], _state["contrast"], [t["text"] for t in _state["texts"]], sum(bin(b).count("1") for b in _oled.oled.ram), sum(bin(b).count("1") for b in oled.buffer), bytes(_oled.oled.ram) == bytes(oled.buffer)]',
].join('\n');

export default async function i2cOledSteps({ step, rootDir }) {
  const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8');
  const wiring = { parts: [OLED_ENTRY] };

  // ── framebuf(펌웨어 모듈 흉내): 형식·점·선·네모·스크롤·옮겨 그리기·글자 자르기·오류 ──
  await step(
    'framebuf',
    [
      'import framebuf, array',
      'def catch(fn):',
      '    try:',
      '        return ["ok", repr(fn())]',
      '    except Exception as error:',
      '        return [type(error).__name__, str(error)]',
      'def lit(fb, w, h):',
      '    return [(x, y) for y in range(h) for x in range(w) if fb.pixel(x, y)]',
      'out = {}',
      'buf = bytearray(4)',
      'fb = framebuf.FrameBuffer(buf, 8, 4, framebuf.MONO_HLSB)',
      'fb.pixel(0, 0, 1); fb.pixel(7, 3, 1)',
      'out["hlsb"] = [list(buf), fb.pixel(0, 0), fb.pixel(1, 0), fb.pixel(99, 0)]',
      'fb.fill(1); fb.fill_rect(2, 1, 3, 2, 0)',
      'out["fill_rect"] = list(buf)',
      'hm = bytearray(1); framebuf.FrameBuffer(hm, 8, 1, framebuf.MONO_HMSB).pixel(0, 0, 1)',
      'vl = bytearray(2); v = framebuf.FrameBuffer(vl, 2, 8, framebuf.MONO_VLSB); v.vline(1, 2, 3, 1); v.hline(0, 7, 5, 1)',
      'out["hmsb_vlsb"] = [list(hm), list(vl)]',
      'g8 = bytearray(64); f8 = framebuf.FrameBuffer(g8, 8, 8, framebuf.GS8)',
      'f8.line(0, 0, 7, 2, 9)',
      'out["line"] = [(x, y) for y in range(8) for x in range(8) if g8[y * 8 + x] == 9]',
      'r = bytearray(8); fr = framebuf.FrameBuffer(r, 8, 8, framebuf.MONO_VLSB)',
      'fr.rect(1, 1, 4, 3, 1)',
      'out["rect"] = len(lit(fr, 8, 8))',
      'fr.fill(0); fr.rect(1, 1, 4, 3, 1, True)',
      'out["rect_fill"] = len(lit(fr, 8, 8))',
      'e = bytearray(16); fe = framebuf.FrameBuffer(e, 16, 8, framebuf.MONO_VLSB)',
      'fe.ellipse(4, 4, 2, 2, 1)',
      'points = lit(fe, 16, 8)',
      'out["ellipse"] = [len(points), all((8 - x, y) in points and (x, 8 - y) in points for x, y in points), [(6, 4) in points, (2, 4) in points, (4, 2) in points, (4, 6) in points]]',
      'fe.fill(0); fe.ellipse(4, 4, 2, 2, 1, True, 0b0001)',
      'out["ellipse_q1"] = sorted(lit(fe, 16, 8))',
      'p = bytearray(64); fp = framebuf.FrameBuffer(p, 8, 8, framebuf.GS8)',
      "fp.poly(0, 0, array.array('h', [0, 0, 6, 0, 0, 6]), 5, True)",
      'out["poly"] = [p[0] == 5, p[5] == 5, p[1 * 8 + 1] == 5, p[7 * 8 + 7] == 0, p[6 * 8 + 6] == 0]',
      's = bytearray(1); fs = framebuf.FrameBuffer(s, 8, 1, framebuf.MONO_HLSB); fs.pixel(0, 0, 1); fs.scroll(1, 0)',
      'out["scroll"] = list(s)',
      'src = bytearray([0xC0, 0xC0]); dst = bytearray(4)',
      'fd = framebuf.FrameBuffer(dst, 4, 4, framebuf.MONO_HLSB)',
      'fd.blit(framebuf.FrameBuffer(src, 2, 2, framebuf.MONO_HLSB), 1, 1)',
      'out["blit"] = lit(fd, 4, 4)',
      'fd.fill(0); fd.blit((bytearray([0x80, 0x40]), 2, 2, framebuf.MONO_HLSB), 0, 0, 0)',
      'out["blit_key"] = lit(fd, 4, 4)',
      'w = bytearray(16); fw = framebuf.FrameBuffer(w, 4, 2, framebuf.RGB565); fw.pixel(3, 1, 0xF800)',
      'g4 = bytearray(2); f4 = framebuf.FrameBuffer(g4, 4, 1, framebuf.GS4_HMSB); f4.pixel(0, 0, 0xA); f4.pixel(3, 0, 0x5)',
      'g2 = bytearray(1); f2 = framebuf.FrameBuffer(g2, 4, 1, framebuf.GS2_HMSB); f2.pixel(1, 0, 3)',
      'out["color_formats"] = [fw.pixel(3, 1), list(w[14:16]), list(g4), f4.pixel(3, 0), list(g2), f2.pixel(1, 0)]',
      'ob = bytearray(128 * 64 // 8); o = framebuf.FrameBuffer(ob, 128, 64, framebuf.MONO_VLSB)',
      "o.text('A' * 20, 0, 0)",
      'cols = sorted({x for x in range(128) for y in range(8) if o.pixel(x, y)})',
      "out['text_clip'] = [cols[0], cols[-1], len(o._apc_texts), o._apc_texts[0][2][:3]]",
      "o.fill(0); o.text('한', 0, 10)",
      'out["text_utf8"] = [o.pixel(1, 10), o.pixel(9, 10), o.pixel(17, 10), o.pixel(25, 10), o._apc_texts]',
      "o.fill(0); o.text(b'Hi', 120, 60)",
      'out["text_edge"] = [sum(o.pixel(x, y) or 0 for x in range(128) for y in range(64)) > 0, o._apc_texts[0][:2]]',
      'errors = []',
      'errors.append(catch(lambda: framebuf.FrameBuffer(bytes(4), 8, 4, framebuf.MONO_HLSB)))',
      'errors.append(catch(lambda: framebuf.FrameBuffer(bytearray(1), 8, 4, framebuf.MONO_HLSB)))',
      'errors.append(catch(lambda: framebuf.FrameBuffer(bytearray(4), 8, 4, 9)))',
      'errors.append(catch(lambda: framebuf.FrameBuffer(bytearray(4), 8, 4)))',
      'errors.append(catch(lambda: o.text(5, 0, 0)))',
      'errors.append(catch(lambda: o.pixel(1.5, 0)))',
      'errors.append(catch(lambda: framebuf.FrameBuffer(bytearray(4), 0, 4, framebuf.MONO_HLSB)))',
      'errors.append(catch(lambda: framebuf.FrameBuffer1(bytearray(8), 8, 8).pixel(7, 7, 1)))',
      'out["errors"] = errors',
      'out',
    ].join('\n'),
  );

  // ── 교과서 코드 자료 그대로(ssd1306): f054 글자·f055 숫자·f057 점 삼각형 ──
  await step('f054_text', `${read('examples/esp32/u2/2-1-3-oled-text-check.py')}\n${OLED_CHECK}`, { wiring });
  await step('f055_number', `${read('examples/esp32/u2/2-1-3-oled-number-check.py')}\n${OLED_CHECK}`, { wiring });
  await step(
    'f057_triangle',
    [
      read('examples/esp32/u2/2-1-3-oled-triangle-dots.py'),
      OLED_CHECK.split('\n').slice(0, 2).join('\n'),
      'expected = set()',
      'def _tri(x, y, s):',
      '    if s <= 1:',
      '        expected.add((x, y))',
      '    else:',
      '        h = s // 2',
      '        _tri(x, y, h); _tri(x - h, y + h, h); _tri(x + h, y + h, h)',
      '_tri(64, 0, 64)',
      '_ram = _oled.oled.ram',
      '_lit = {(x, y) for x in range(128) for y in range(64) if _ram[(y >> 3) * 128 + x] >> (y & 7) & 1}',
      '[len(expected), len(_lit), _lit == expected]',
    ].join('\n'),
    { wiring },
  );

  // ── 원고의 이름(sh1106 — 원고 134쪽 코드 모양) ──
  await step(
    'sh1106_textbook',
    [
      'from machine import Pin',
      'from machine import SoftI2C',
      'from sh1106 import SH1106_I2C',
      'from time import sleep_ms',
      'i2c = SoftI2C(scl=Pin(22), sda=Pin(21))',
      'oled = SH1106_I2C(128, 64, i2c)',
      'oled.fill(0)',
      'oled.text("Hello, ESP32!", 0, 0)',
      'oled.text("OLED Display!", 0, 16)',
      'oled.show()',
      'import framebuf, sh1106, ssd1306',
      'kinds = [isinstance(oled, framebuf.FrameBuffer), isinstance(oled, sh1106.SH1106), oled.addr, oled.width, oled.height, oled.pages]',
      OLED_CHECK.replace('[_state["on"]', 'kinds + [_state["on"]'),
    ].join('\n'),
    { wiring },
  );

  // ── 화면 명령: 끄기·켜기·반전·대비·방향·sleep·flip ──
  await step(
    'oled_commands',
    [
      'from machine import Pin, SoftI2C',
      'from ssd1306 import SSD1306_I2C',
      'from sh1106 import SH1106_I2C',
      'import apc_board',
      'i2c = SoftI2C(scl=Pin(22), sda=Pin(21))',
      'oled = SSD1306_I2C(128, 64, i2c)',
      'dev = apc_board.wired_devices()[0][1]',
      'def flags():',
      '    s = dev.state()',
      '    return [s["on"], s["invert"], s["contrast"], s["remap"], s["flip"]]',
      'out = [flags()]',
      'oled.poweroff(); out.append(flags())',
      'oled.poweron(); oled.invert(1); oled.contrast(10); out.append(flags())',
      'oled.invert(0); oled.rotate(0); out.append(flags())',
      'oled.rotate(1)',
      'sh = SH1106_I2C(128, 64, i2c)',
      'sh.sleep(True); out.append(flags())',
      'sh.sleep(False); sh.flip(); out.append(flags())',
      'sh.flip(False); out.append(flags())',
      'out.append([dev.oled.data_bytes > 0, i2c.readfrom(0x3C, 1)])',
      'out',
    ].join('\n'),
    { wiring },
  );

  // ── SSD1306 쪽 주소 방식(B0~B7·00~0F·10~1F)과 제어 바이트(Co)를 바이트로 직접 ──
  await step(
    'ssd1306_bytes',
    [
      'from machine import Pin, SoftI2C',
      'import apc_board',
      'i2c = SoftI2C(scl=Pin(22), sda=Pin(21))',
      'dev = apc_board.wired_devices()[0][1]',
      "i2c.writeto(0x3C, bytes([0x00, 0xAF, 0xB2, 0x05, 0x11]))",
      "i2c.writeto(0x3C, bytes([0x40, 0xFF, 0x01]))",
      'ram = dev.oled.ram',
      'first = [ram[2 * 128 + 0x15], ram[2 * 128 + 0x16], dev.oled.column, dev.oled.page, dev.oled.display_on]',
      "i2c.writeto(0x3C, bytes([0x80, 0x81, 0x80, 0x40, 0xC0, 0x7F]))",
      "i2c.writeto(0x3C, bytes([0x00, 0x20, 0x00, 0x21, 0x10, 0x11, 0x22, 0x07, 0x07]))",
      "i2c.writeto(0x3C, bytes([0x40, 0x0F, 0xF0, 0xAA]))",
      '[first, dev.oled.contrast, [ram[7 * 128 + 0x10], ram[7 * 128 + 0x11], ram[7 * 128 + 0x10]], dev.oled.addressing, [dev.oled.column, dev.oled.page]]',
    ].join('\n'),
    { wiring },
  );

  // ── 주소 없음: 배선에 OLED가 없거나(LCD만) 주소를 틀리면 드라이버를 만들 때 ENODEV ──
  await step('no_oled', ['from machine import Pin, SoftI2C', 'from ssd1306 import SSD1306_I2C', 'i2c = SoftI2C(scl=Pin(22), sda=Pin(21))', 'print(i2c.scan())', 'oled = SSD1306_I2C(128, 64, i2c)'].join('\n'), {
    wiring: { parts: [LCD_ENTRY] },
  });
  await step('wrong_address', ['from machine import Pin, SoftI2C', 'from sh1106 import SH1106_I2C', 'oled = SH1106_I2C(128, 64, SoftI2C(scl=Pin(22), sda=Pin(21)), 0x3D)'].join('\n'), {
    wiring,
  });
  await step(
    'spi_placeholder',
    ['from ssd1306 import SSD1306_SPI', 'SSD1306_SPI(128, 64, None, None, None, None)'].join('\n'),
    { wiring },
  );
}
