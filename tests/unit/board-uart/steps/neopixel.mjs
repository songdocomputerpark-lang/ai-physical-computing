// 가상 네오픽셀(neopixel.NeoPixel + machine.bitstream + 16구 링 흉내)을 실제 Pyodide로 확인하는 단계들(P3-05 구역 C).
// tests/unit/board-uart/pyodide-neopixel.test.ts가 공유 도우미(--steps=이 파일)로 돌린다.
import fs from 'node:fs';
import path from 'node:path';

/** 배선: 네오픽셀 링 DIN = GPIO23(원고 149쪽) */
export const RING_WIRING = {
  parts: [{ part: 'neopixel', id: 'neopixel', label: '네오픽셀 링', pins: { din: 23 }, directions: { din: 'out' }, known: true }],
};

export default async function neopixelSteps({ step, rootDir }) {
  // 1. 색은 write() 때만 링에 간다. 버퍼는 G·R·B 차례, np[i]는 (r, g, b)로 돌려준다. fill·len·bpp=4 밀림.
  await step(
    'neopixel_write_only',
    [
      'from machine import Pin',
      'from neopixel import NeoPixel',
      'import apc_board, time',
      'np = NeoPixel(Pin(23), 16)',
      "ring = apc_board.wired_devices('neopixel')[0][1]",
      'r = []',
      'np[0] = (100, 0, 0)',
      'np[1] = (1, 2, 3)',
      'r.append([list(np.buf[:6]), np[0], np[1], len(np), ring.writes, ring.colors[0]])',
      'np.write()',
      'time.sleep_ms(20)',
      'r.append([ring.writes, ring.colors[0], ring.colors[1], ring.colors[2]])',
      'np.fill((0, 0, 255))',
      'np.write()',
      'time.sleep_ms(20)',
      'r.append([ring.colors[0], ring.colors[15], np[15]])',
      'short = NeoPixel(Pin(23), 4)',
      'short.fill((9, 9, 9))',
      'short.write()',
      'time.sleep_ms(20)',
      'r.append([ring.colors[3], ring.colors[4]])',
      'rgbw = NeoPixel(Pin(23), 2, bpp=4)',
      'rgbw[0] = (10, 20, 30, 40)',
      'rgbw.write()',
      'time.sleep_ms(20)',
      'r.append([list(rgbw.buf), ring.colors[0], ring.colors[1], ring.last_bytes])',
      'r.append([np.timing, NeoPixel(Pin(23), 1, timing=0).timing, NeoPixel(Pin(23), 1, timing=(1, 2, 3, 4)).timing, repr(Pin(23))])',
      'r',
    ].join('\n'),
    { wiring: RING_WIRING },
  );

  // 2. MicroPython과 같은 오류·값 규칙(py/binary.c·py/obj.c·extmod/machine_bitstream.c)
  await step(
    'neopixel_errors',
    [
      'from machine import Pin, bitstream',
      'from neopixel import NeoPixel',
      'r = []',
      'np = NeoPixel(Pin(23), 16)',
      'def attempt(fn):',
      '    try:',
      '        fn()',
      '        return "no error"',
      '    except Exception as e:',
      '        return type(e).__name__ + ": " + str(e)',
      'def set_item(i, v):',
      '    np[i] = v',
      'r.append(attempt(lambda: set_item(16, (1, 2, 3))))',
      'r.append(attempt(lambda: set_item(0, (7, 8))))',
      'r.append(np[0])',
      'r.append(attempt(lambda: set_item(1, (1.5, 0, 0))))',
      'set_item(2, (256, -1, 3))',
      'r.append(np[2])',
      'set_item(-1, (4, 5, 6))',
      'r.append(np[15])',
      'r.append(attempt(lambda: NeoPixel(23, 16)))',
      'r.append(attempt(lambda: bitstream(Pin(23), 1, (1, 2, 3, 4), b"abc")))',
      'r.append(attempt(lambda: bitstream(Pin(23), 0, (1, 2, 3), b"abc")))',
      'r.append(attempt(lambda: bitstream(Pin(23), 0, 5, b"abc")))',
      'r.append(attempt(lambda: bitstream(Pin(23), 0, (1, 2, 3, 4), 5)))',
      'r.append(attempt(lambda: bitstream(Pin(23), 0, (1, 2, 3.5, 4), b"abc")))',
      'r.append(attempt(lambda: bitstream(Pin(23), 0, (1, 2, 3, 4))))',
      'r.append(attempt(lambda: bitstream(24, 0, (1, 2, 3, 4), b"abc")))',
      'r',
    ].join('\n'),
    { wiring: RING_WIRING },
  );

  // 3. 배선에 없는 핀으로 보내면 한 번 알린다
  await step(
    'neopixel_wrong_pin',
    ['from machine import Pin', 'from neopixel import NeoPixel', 'np = NeoPixel(Pin(22), 16)', 'np.fill((1, 1, 1))', 'np.write()', '"done"'].join('\n'),
    { wiring: RING_WIRING },
  );

  // 4·5. 원본 f064(첫 반복에 write 없음 → 불이 차례로 켜지지 않음)·f065(무지개)를 파일 그대로
  const f064 = fs.readFileSync(path.join(rootDir, 'examples/esp32/u2/2-1-5-neopixel-check.py'), 'utf8');
  await step('f064_file', f064, { wiring: RING_WIRING, stopAfterMs: 2400 });
  const f065 = fs.readFileSync(path.join(rootDir, 'examples/esp32/u2/2-1-5-neopixel-rainbow.py'), 'utf8');
  await step('f065_file', f065, { wiring: RING_WIRING, stopAfterMs: 2000 });
}
