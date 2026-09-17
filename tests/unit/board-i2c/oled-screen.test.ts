// OLED 화면 모양 순수 함수(src/lab/modules/board/parts/oled-i2c/oled-screen.ts) — RAM → 보이는 점(방향·반전·끄기), 점 경로, 글자 요약. PLAN §8.3 P3-04.
import { describe, expect, it } from 'vitest';
import { countLit, oledBrightness, oledPixels, oledSummary, oledText, parseOledState, pixelPath } from '../../../src/lab/modules/board/parts/oled-i2c/oled-screen.ts';

function state(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const ram = new Uint8Array(1024);
  ram[0] = 0b0000_0011; // 쪽 0·열 0: 맨 위 두 줄(y 0·1)
  ram[1 * 128 + 5] = 0b1000_0000; // 쪽 1·열 5: y = 8 + 7 = 15
  return { v: 1, width: 128, height: 64, ram, on: true, invert: false, entire: false, contrast: 255, remap: true, flip: true, texts: [], ...overrides };
}

function lit(pixels: Uint8Array): [number, number][] {
  const points: [number, number][] = [];
  pixels.forEach((value, index) => {
    if (value) {
      points.push([index % 128, Math.floor(index / 128)]);
    }
  });
  return points;
}

describe('OLED 점(oledPixels)', () => {
  it('드라이버 기본 방향(A1·C8)이면 RAM의 (열, 쪽·비트)가 그대로 (x, y)', () => {
    const screen = parseOledState(state());
    expect(lit(oledPixels(screen))).toEqual([
      [0, 0],
      [0, 1],
      [5, 15],
    ]);
  });

  it('A0(좌우)·C0(위아래)면 거꾸로 — rotate(0)과 같은 180도', () => {
    const screen = parseOledState(state({ remap: false, flip: false }));
    expect(lit(oledPixels(screen))).toEqual([
      [122, 48],
      [127, 62],
      [127, 63],
    ]);
  });

  it('화면 끔이면 점 없음, 반전이면 나머지가 켜짐, A5(모두 켜기)면 RAM과 상관없이 모두', () => {
    expect(countLit(oledPixels(parseOledState(state({ on: false }))))).toBe(0);
    expect(countLit(oledPixels(parseOledState(state({ invert: true }))))).toBe(128 * 64 - 3);
    expect(countLit(oledPixels(parseOledState(state({ entire: true }))))).toBe(128 * 64);
    expect(countLit(oledPixels(null))).toBe(0);
  });

  it('JSON으로 온 RAM({"0": n})도 읽고, 모자라면 null', () => {
    const ram = Object.fromEntries(Array.from({ length: 1024 }, (_, index) => [String(index), index === 0 ? 1 : 0]));
    expect(countLit(oledPixels(parseOledState({ ...state(), ram })))).toBe(1);
    expect(parseOledState({ ...state(), ram: [1, 2, 3] })).toBeNull();
    expect(parseOledState('x')).toBeNull();
  });
});

describe('점 경로(pixelPath)', () => {
  it('줄마다 이어진 점을 조각 하나로: 한 줄에 조각 둘이면 경로 둘', () => {
    const pixels = new Uint8Array(4 * 2);
    pixels.set([1, 1, 0, 1, 0, 0, 0, 0]);
    expect(pixelPath(pixels, 4, 2)).toBe('M0 0h2v1h-2zM3 0h1v1h-1z');
    expect(pixelPath(new Uint8Array(4), 2, 2)).toBe('');
  });
});

describe('글자·밝기·요약', () => {
  it('글자는 위→아래·왼→오른 차례로 " | "로 잇고, 대비는 0~100', () => {
    const screen = parseOledState(
      state({
        contrast: 127,
        texts: [
          { x: 40, y: 0, text: 'B' },
          { x: 0, y: 20, text: 'C' },
          { x: 0, y: 0, text: 'A' },
          { x: 'bad', y: 0, text: 'x' },
        ],
      }),
    );
    expect(oledText(screen)).toBe('A | B | C');
    expect(oledBrightness(screen)).toBe(50);
    expect(oledSummary(screen, 3)).toBe('글자 "A", "B", "C", 켜진 점 3개.');
    expect(oledSummary(parseOledState(state({ invert: true })), 8189)).toBe('글자 없음, 켜진 점 8189개, 색 반전.');
    expect(oledSummary(parseOledState(state({ on: false })), 0)).toBe('화면이 꺼져 있어요.');
    expect(oledSummary(null, 0)).toBe('화면이 꺼져 있어요.');
    expect(oledText(parseOledState(state({ on: false, texts: [{ x: 0, y: 0, text: 'A' }] })))).toBe('');
  });
});
