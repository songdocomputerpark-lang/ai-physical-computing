/**
 * OLED 128×64(oled-i2c) 화면 모양 — 순수 함수(DOM 없음, tests/unit/lab/board-part-oled-i2c.test.ts·tests/unit/board-i2c/oled-screen.test.ts).
 *
 * 파이썬 부품 흉내(apc_part_oled_i2c.py의 OledI2cDevice.state)가 'board.device'로 보내는 상태(src/lab/README.md 7.3):
 *   { v: 1, width: 128, height: 64,
 *     ram: Uint8Array(1024)   SSD1306 화면 기억 장치(GDDRAM) — 쪽(page) 8개 × 열 128, 한 바이트의 비트 0이 그 쪽의 맨 위 줄,
 *     on: boolean             화면 켜짐(AF)·꺼짐(AE),
 *     invert: boolean         반전(A7),  entire: boolean  RAM과 상관없이 모두 켜기(A5),
 *     contrast: 0~255         대비(81 xx) — 그림에서는 점의 밝기,
 *     remap: boolean          좌우(A1이면 true), flip: boolean  위아래(C8이면 true) — 둘 다 true면 RAM 그대로 바로 보인다(드라이버의 기본 초기화),
 *     texts: [{ x, y, text }] 드라이버 흉내가 넘긴 "text()로 쓴 글자"(화면 낭독기 설명용 — 점 그림이 늘 기준) }
 * 브라우저로는 bytes가 Uint8Array로 오고, Node 시험 도구(JSON)로는 {"0": n, …}로 온다 — 둘 다 읽는다.
 * 방향: 보이는 점 (x, y)는 RAM의 열 = remap ? x : 127 − x, 줄 = flip ? y : 63 − y(데이터시트 A0/A1·C0/C8 — 모듈을 바로 놓았을 때 A1·C8이 바른 방향).
 */

export const OLED_WIDTH = 128;
export const OLED_HEIGHT = 64;
const RAM_SIZE = OLED_WIDTH * (OLED_HEIGHT / 8);

export interface OledText {
  readonly x: number;
  readonly y: number;
  readonly text: string;
}

export interface OledScreen {
  readonly ram: Uint8Array;
  readonly on: boolean;
  readonly invert: boolean;
  readonly entire: boolean;
  readonly contrast: number;
  readonly remap: boolean;
  readonly flip: boolean;
  readonly texts: readonly OledText[];
}

/** Uint8Array·숫자 배열·{"0": n, …}을 길이 length의 Uint8Array로. 모양이 틀리면 null */
function bytesOf(value: unknown, length: number): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return value.length >= length ? value.subarray(0, length) : null;
  }
  const bytes = new Uint8Array(length);
  if (Array.isArray(value)) {
    if (value.length < length) {
      return null;
    }
    for (let index = 0; index < length; index += 1) {
      const item = value[index];
      if (typeof item !== 'number' || !Number.isInteger(item) || item < 0 || item > 255) {
        return null;
      }
      bytes[index] = item;
    }
    return bytes;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (let index = 0; index < length; index += 1) {
      const item = record[String(index)];
      if (typeof item !== 'number' || !Number.isInteger(item) || item < 0 || item > 255) {
        return null;
      }
      bytes[index] = item;
    }
    return bytes;
  }
  return null;
}

/** 파이썬이 보낸 OLED 상태를 읽는다(모양이 틀리면 null) */
export function parseOledState(state: unknown): OledScreen | null {
  if (!state || typeof state !== 'object') {
    return null;
  }
  const raw = state as Record<string, unknown>;
  const ram = bytesOf(raw.ram, RAM_SIZE);
  if (!ram) {
    return null;
  }
  const texts: OledText[] = [];
  if (Array.isArray(raw.texts)) {
    for (const item of raw.texts) {
      if (item && typeof item === 'object') {
        const { x, y, text } = item as Record<string, unknown>;
        if (typeof text === 'string' && typeof x === 'number' && typeof y === 'number') {
          texts.push({ x, y, text });
        }
      }
    }
  }
  const contrast = typeof raw.contrast === 'number' && Number.isFinite(raw.contrast) ? Math.min(255, Math.max(0, Math.round(raw.contrast))) : 0x7f;
  return {
    ram,
    on: raw.on === true,
    invert: raw.invert === true,
    entire: raw.entire === true,
    contrast,
    remap: raw.remap === true,
    flip: raw.flip === true,
    texts,
  };
}

/** 보이는 점(행 우선 128×64, 켜짐 1). 화면이 꺼졌거나 상태가 없으면 모두 0 */
export function oledPixels(screen: OledScreen | null): Uint8Array {
  const pixels = new Uint8Array(OLED_WIDTH * OLED_HEIGHT);
  if (!screen || !screen.on) {
    return pixels;
  }
  for (let y = 0; y < OLED_HEIGHT; y += 1) {
    const row = screen.flip ? y : OLED_HEIGHT - 1 - y;
    const pageBase = (row >> 3) * OLED_WIDTH;
    const bit = row & 7;
    for (let x = 0; x < OLED_WIDTH; x += 1) {
      const column = screen.remap ? x : OLED_WIDTH - 1 - x;
      let lit = screen.entire ? 1 : ((screen.ram[pageBase + column] ?? 0) >> bit) & 1;
      if (screen.invert) {
        lit ^= 1;
      }
      pixels[y * OLED_WIDTH + x] = lit;
    }
  }
  return pixels;
}

/** 켜진 점 수 */
export function countLit(pixels: Uint8Array): number {
  let count = 0;
  for (const value of pixels) {
    count += value;
  }
  return count;
}

/** 켜진 점을 줄마다 이어진 조각으로 묶은 SVG 경로(점 1칸 = 1단위, crispEdges로 그린다) */
export function pixelPath(pixels: Uint8Array, width = OLED_WIDTH, height = OLED_HEIGHT): string {
  const parts: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let x = 0;
    while (x < width) {
      if (pixels[y * width + x] !== 1) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < width && pixels[y * width + x] === 1) {
        x += 1;
      }
      parts.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
    }
  }
  return parts.join('');
}

/** 점의 밝기(대비 0~255 → 0~100) */
export function oledBrightness(screen: OledScreen | null): number {
  return screen ? Math.round((screen.contrast / 255) * 100) : 0;
}

/** 드라이버가 넘긴 글자들을 위→아래·왼→오른 차례로 이은 것("Hello, ESP32! | OLED Display!") */
export function oledText(screen: OledScreen | null): string {
  if (!screen || !screen.on) {
    return '';
  }
  return [...screen.texts]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((item) => item.text)
    .join(' | ');
}

/** 화면 낭독기 요약(상태가 아직 없으면 전원 직후라 화면이 꺼져 있다 — 보드의 전원 자체가 꺼진 것은 부품 그림이 따로 알린다) */
export function oledSummary(screen: OledScreen | null, lit: number): string {
  if (!screen || !screen.on) {
    return '화면이 꺼져 있어요.';
  }
  const text = oledText(screen);
  const parts = [text === '' ? '글자 없음' : `글자 "${text.replaceAll(' | ', '", "')}"`, `켜진 점 ${lit}개`];
  if (screen.invert) {
    parts.push('색 반전');
  }
  return `${parts.join(', ')}.`;
}
