// 부품 oled-i2c(OLED 128×64, I2C) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", PLAN §8.3 P3-04.
// 파이썬 쪽(framebuf·ssd1306·sh1106 흉내와 SSD1306 명령 해석)은 tests/unit/board-i2c/pyodide-i2c-oled.test.ts, 점 그림 순수 함수는 tests/unit/board-i2c/oled-screen.test.ts.
import { describe, expect, it } from 'vitest';
import { snapshotAfterRun } from '../../../src/lab/modules/board/index.ts';
import { partAnchors, partPowerLegs } from '../../../src/lab/modules/board/layout.ts';
import { PART_DEFINITIONS } from '../../../src/lab/modules/board/parts.ts';
import lcd from '../../../src/lab/modules/board/parts/lcd-i2c/part.ts';
import oled from '../../../src/lab/modules/board/parts/oled-i2c/part.ts';
import { EMPTY_SNAPSHOT } from '../../../src/lab/modules/board/state.ts';
import { instanceOf, snapshotWith } from './helpers/board-snapshot.ts';

const instance = instanceOf('oled-i2c', { sda: 21, scl: 22 }, { id: 'oled', label: 'OLED(128×64)' });

/** RAM(쪽 8 × 열 128)에 (x, y) 점들을 켠다 — 드라이버 기본 방향(remap·flip true)이면 보이는 좌표와 같다 */
function ramWith(points: readonly (readonly [number, number])[]): Uint8Array {
  const ram = new Uint8Array(1024);
  for (const [x, y] of points) {
    ram[(y >> 3) * 128 + x] = (ram[(y >> 3) * 128 + x] ?? 0) | (1 << (y & 7));
  }
  return ram;
}

describe('부품: OLED(oled-i2c)', () => {
  it('바깥 출력 부품: SDA·SCL(기본 GPIO21·22 — 원고 133쪽), 파이썬 흉내 apc_part_oled_i2c, 신호 자리는 배선도 칸(18의 배수 + 9)', () => {
    expect(oled.id).toBe('oled-i2c');
    expect(oled.pins.map((pin) => [pin.role, pin.direction])).toEqual([
      ['sda', 'out'],
      ['scl', 'out'],
    ]);
    expect(oled.defaultPins).toEqual({ sda: 21, scl: 22 });
    expect(oled.python).toBe('apc_part_oled_i2c');
    expect(PART_DEFINITIONS.get('oled-i2c')).toBe(oled);
    for (const definition of [oled, lcd]) {
      const anchors = partAnchors(definition);
      expect(Object.values(anchors).every((point) => point.x % 18 === 9 && point.y === 0)).toBe(true);
      const legs = partPowerLegs(definition);
      expect(legs?.gnd.y).toBe(definition.size.height);
    }
  });

  it('모습: 멈춤이면 꺼짐, 실행 중인데 상태가 없으면 전원 직후라 화면 꺼짐(점 0개)', () => {
    expect(oled.visual({ snapshot: EMPTY_SNAPSHOT, instance, active: false, reducedMotion: false })).toEqual({ lit: false, brightness: 0, pixels: 0, text: '', frame: 0 });
    expect(oled.visual({ snapshot: snapshotWith([]), instance, active: false, reducedMotion: false })).toEqual({ lit: false, brightness: 0, pixels: 0, text: '', frame: 0 });
  });

  it('모습: 켜진 점 수·대비(밝기)·드라이버가 넘긴 글자, [정지]하면 꺼진 모습, 스스로 끝나면 마지막 모습', () => {
    const running = snapshotWith([]);
    const state = {
      v: 1,
      width: 128,
      height: 64,
      ram: ramWith([
        [0, 0],
        [127, 63],
        [5, 9],
      ]),
      on: true,
      invert: false,
      entire: false,
      contrast: 255,
      remap: true,
      flip: true,
      texts: [
        { x: 0, y: 16, text: 'OLED Display!' },
        { x: 0, y: 0, text: 'Hello, ESP32!' },
      ],
    };
    const device = { seq: 4, state };
    expect(oled.visual({ snapshot: running, instance, active: false, reducedMotion: false, device })).toEqual({
      lit: true,
      brightness: 100,
      pixels: 3,
      text: 'Hello, ESP32! | OLED Display!',
      frame: 4,
    });
    expect(oled.visual({ snapshot: snapshotAfterRun(running, { outcome: 'stopped' }), instance, active: false, reducedMotion: false, device })).toMatchObject({ lit: false, pixels: 0 });
    expect(oled.visual({ snapshot: snapshotWith([], 'end'), instance, active: false, reducedMotion: false, device })).toMatchObject({ lit: true, pixels: 3 });
    // 화면 끔(poweroff)이면 RAM이 남아 있어도 점이 없고, 반전이면 나머지가 켜진다
    expect(oled.visual({ snapshot: running, instance, active: false, reducedMotion: false, device: { seq: 5, state: { ...state, on: false } } })).toMatchObject({ lit: false, pixels: 0, text: '' });
    expect(oled.visual({ snapshot: running, instance, active: false, reducedMotion: false, device: { seq: 6, state: { ...state, invert: true, contrast: 0x7f } } })).toMatchObject({
      lit: true,
      pixels: 128 * 64 - 3,
      brightness: 50,
    });
  });
});
