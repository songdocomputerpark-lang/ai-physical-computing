// 가상 네오픽셀(neopixel.NeoPixel + machine.bitstream + 16구 링 흉내) — write() 때만 반영, G·R·B 차례, MicroPython 값·오류 규칙을 실제 Pyodide로 확인(P3-05 구역 C).
// 단계는 tests/unit/board-uart/steps/neopixel.mjs, 기준은 micropython-lib neopixel.py(v1.29.0 펌웨어에 들어간 판)·py/binary.c·extmod/machine_bitstream.c.
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf } from '../lab/helpers/pyodide-board.ts';
import { deviceStates } from './helpers.ts';

interface RingState {
  count: number;
  colors: string;
  writes: number;
  bytes: number;
}

/** 'rrggbb' × 16 → ['rrggbb', …] */
function leds(colors: string): string[] {
  return colors.match(/.{6}/gu) ?? [];
}

describe.skipIf(!boardPyodideReady)('가상 네오픽셀(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/board-uart/steps/neopixel.mjs');

  it('파일이 ESP32 실습실 워커에 들어간다(neopixel.py·machine.bitstream 확장·링 흉내)', () => {
    expect(out.duplicate).toBeUndefined();
    expect(out.files).toEqual(expect.arrayContaining(['neopixel.py', 'apc_board_bitstream.py', 'apc_part_neopixel.py']));
  });

  it('np[i] = (r, g, b)는 버퍼에만(G·R·B 차례), write() 때 링이 바뀐다. fill·짧은 줄·bpp=4 밀림·timing 값', () => {
    const record = stepOf(out, 'neopixel_write_only');
    expect(record.errorType).toBeUndefined();
    const value = record.value as unknown[][];
    expect(value[0]).toEqual([[0, 100, 0, 2, 1, 3], [100, 0, 0], [1, 2, 3], 16, 0, [0, 0, 0]]);
    expect(value[1]).toEqual([1, [100, 0, 0], [1, 2, 3], [0, 0, 0]]);
    expect(value[2]).toEqual([[0, 0, 255], [0, 0, 255], [0, 0, 255]]);
    // 4개만 보내면 뒤쪽 LED는 전의 색 그대로
    expect(value[3]).toEqual([[9, 9, 9], [0, 0, 255]]);
    // RGBW 4바이트를 3바이트 링이 읽으면 색이 밀린다(버퍼 G R B W = 20 10 30 40 → LED0 (10, 20, 30), LED1 (0, 40, 0))
    expect(value[4]).toEqual([[20, 10, 30, 40, 0, 0, 0, 0], [10, 20, 30], [0, 40, 0], 8]);
    expect(value[5]).toEqual([[400, 850, 800, 450], [800, 1700, 1600, 900], [1, 2, 3, 4], 'Pin(23, mode=Pin.OUT)']);
    const last = deviceStates<RingState>(record, 'neopixel').at(-1);
    expect(last).toMatchObject({ count: 16, writes: 4, bytes: 8 });
    expect(leds(last?.colors ?? '').slice(0, 5)).toEqual(['0a141e', '002800', '090909', '090909', '0000ff']);
  });

  it('값·오류 규칙이 실물과 같다: 인덱스·튜플 IndexError(앞칸은 적힘), 256 → 0·-1 → 255, 소수 TypeError, bitstream 인자 검사', () => {
    const record = stepOf(out, 'neopixel_errors');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([
      'IndexError: bytearray index out of range',
      'IndexError: tuple index out of range',
      [7, 8, 0],
      "TypeError: can't convert float to int",
      [0, 255, 3],
      [4, 5, 6],
      "AttributeError: 'int' object has no attribute 'init'",
      'ValueError: encoding',
      'ValueError: requested length 4 but object has length 3',
      "TypeError: object 'int' isn't a tuple or list",
      'TypeError: object with buffer protocol required',
      "TypeError: can't convert float to int",
      'TypeError: function takes 4 positional arguments but 3 were given',
      'ValueError: invalid pin',
    ]);
  });

  it('배선도에 없는 핀으로 색을 보내면 한국어로 한 번 알린다', () => {
    const record = stepOf(out, 'neopixel_wrong_pin');
    expect(record.errorType).toBeUndefined();
    expect(record.notices.filter((text) => text.includes('네오픽셀 색 신호를 보냈지만'))).toHaveLength(1);
  });

  it('원본 f064 파일 그대로: 첫 반복(write 없음)에는 링이 그대로 꺼져 있다가, 둘째 반복의 첫 write에서 빨강이 한꺼번에 켜진다', () => {
    const record = stepOf(out, 'f064_file');
    expect(record.errorType).toBe('KeyboardInterrupt');
    const states = deviceStates<RingState>(record, 'neopixel');
    const firstWrite = states.find((state) => state.writes === 1);
    // 첫 write 때는 15번 LED를 끈 뒤라 0~14번이 빨강(100, 0, 0), 15번은 꺼짐
    expect(leds(firstWrite?.colors ?? '')).toEqual([...Array(15).fill('640000'), '000000']);
    expect(states.every((state) => state.writes > 0 || /^0+$/u.test(state.colors))).toBe(true);
  });

  it('원본 f065 파일 그대로: 빨강을 한 칸씩 채우다가 주황(255, 94, 0)으로 거꾸로 채운다', () => {
    const record = stepOf(out, 'f065_file');
    expect(record.errorType).toBe('KeyboardInterrupt');
    const states = deviceStates<RingState>(record, 'neopixel');
    expect(leds(states.find((state) => state.writes === 1)?.colors ?? '')[0]).toBe('ff0000');
    expect(leds(states.find((state) => state.writes === 16)?.colors ?? '')).toEqual(Array(16).fill('ff0000'));
    expect(states.some((state) => leds(state.colors)[15] === 'ff5e00')).toBe(true);
  });
});
