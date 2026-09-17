/**
 * 부품: 네오픽셀 링(WS2812 16구) — 바깥 출력 부품(PLAN §6.2 "네오픽셀 16구 링 | 2-1-5 (f064~f066)", 원고 148~153쪽, src/lab/README.md 7.5).
 * 파이썬 쪽은 같은 폴더의 neopixel.py(학생이 import하는 드라이버)·apc_board_bitstream.py(machine.bitstream)·apc_part_neopixel.py(링 흉내).
 *
 * 핀: din(데이터 입력) — 원고 149쪽 회로 "GND·VCC·DIN(23번 핀)"이라 기본 GPIO23. 예제 배선(PD-05)에서 다른 핀으로 옮길 수 있다.
 * 모습은 핀 전압이 아니라 링 흉내가 보낸 LED 색('board.device' state.colors — 'rrggbb' × 16)으로 그린다. 그래서 np.write()를 불러야 바뀐다
 * (원고 149쪽 첫 반복문처럼 write()를 빼면 링이 그대로다 — 실물과 같음). [정지]하면 모두 꺼진 모습, 코드가 스스로 끝나면 마지막 색을 남긴다.
 * 모습 값: data-visual-lit(한 개라도 켜짐), data-visual-count(켜진 LED 수), data-visual-colors(16진 색 16개를 이은 글자), data-visual-writes(write 횟수).
 * 그림: 사이트가 그린 둥근 링 기판과 LED 16개(0번이 12시, 시계 방향 — 원고 148쪽 그림 "np[0]·np[1]…np[15]"). 어두운 색도 알아보게 화면 색은
 * 밝게 올리고 빛 번짐은 실제 밝기만큼. 색만으로 알리지 않게 "켜진 LED 3개" 글과 LED마다 제목(<title> "3번 LED: (255, 0, 0)")을 둔다.
 */
import type { PartDefinition, PartVisual } from '../../part-types.ts';
import { isLive, type BoardSnapshot, type PartDeviceState } from '../../state.ts';

/** 키트의 네오픽셀 링 LED 수(원고 148쪽) — apc_part_neopixel.py LED_COUNT와 같다 */
export const RING_LED_COUNT = 16;
const OFF = '000000';
const SIZE = { width: 126, height: 142 };
const CENTER = { x: 63, y: 70 };
const RING_RADIUS = 44;

/** 링 흉내 상태에서 LED 색 16개('rrggbb')를 꺼낸다. 모양이 틀리면 모두 꺼짐 */
export function ringColors(device: PartDeviceState | undefined): string[] {
  const state = device?.state as { colors?: unknown } | null | undefined;
  const text = typeof state?.colors === 'string' ? state.colors.toLowerCase() : '';
  if (!/^(?:[0-9a-f]{6})+$/u.test(text)) {
    return Array(RING_LED_COUNT).fill(OFF);
  }
  const colors = text.match(/.{6}/gu) ?? [];
  return Array.from({ length: RING_LED_COUNT }, (_, index) => colors[index] ?? OFF);
}

/** 'rrggbb' → [r, g, b] */
export function rgbOf(hex: string): [number, number, number] {
  const value = Number.parseInt(hex, 16);
  return Number.isFinite(value) ? [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff] : [0, 0, 0];
}

/**
 * 화면에 칠할 색: 어두운 색(예: 원고 f064의 (100, 0, 0))도 알아보게 가장 큰 값이 적어도 200이 되도록 같은 비율로 올린다(색상은 그대로).
 * 실제 밝기는 빛 번짐 투명도(glowOpacity)로 보인다.
 */
export function displayColor(hex: string): string {
  const [r, g, b] = rgbOf(hex);
  const max = Math.max(r, g, b);
  if (max === 0) {
    return '#2b3440';
  }
  const scale = Math.max(1, 200 / max);
  const channel = (value: number) => Math.min(255, Math.round(value * scale)).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** 빛 번짐 투명도(0~0.85): 가장 큰 색 값에 비례 */
export function glowOpacity(hex: string): number {
  const [r, g, b] = rgbOf(hex);
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : Math.round((0.25 + 0.6 * (max / 255)) * 100) / 100;
}

export function ringVisual(snapshot: BoardSnapshot, device: PartDeviceState | undefined): PartVisual {
  const live = isLive(snapshot);
  const colors = live ? ringColors(device) : Array<string>(RING_LED_COUNT).fill(OFF);
  const count = colors.filter((color) => color !== OFF).length;
  const writes = live && device ? Number((device.state as { writes?: unknown } | null)?.writes ?? 0) || 0 : 0;
  return { lit: count > 0, count, colors: colors.join(''), writes };
}

/** LED 한 개의 자리(0번이 12시, 시계 방향) */
export function ledPosition(index: number): { x: number; y: number } {
  const angle = (index / RING_LED_COUNT) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.round((CENTER.x + RING_RADIUS * Math.cos(angle)) * 10) / 10, y: Math.round((CENTER.y + RING_RADIUS * Math.sin(angle)) * 10) / 10 };
}

const definition: PartDefinition = {
  id: 'neopixel',
  title: '네오픽셀 링',
  description: 'LED 16개가 둥글게 붙은 네오픽셀(WS2812) 링이에요. np[번호] = (빨강, 초록, 파랑)으로 색을 정하고 np.write()를 부르면 켜져요.',
  pins: [{ role: 'din', label: 'DIN 데이터', direction: 'out' }],
  defaultPins: { din: 23 },
  size: SIZE,
  // 전원 다리는 아랫변 양 끝(가운데의 "켜진 LED" 글과 겹치지 않게)
  power: { gnd: { x: 18, y: SIZE.height }, vcc: { x: 108, y: SIZE.height } },
  visual({ snapshot, device }) {
    return ringVisual(snapshot, device);
  },
  render(target, { svg, instance }) {
    const board = svg('circle', { cx: CENTER.x, cy: CENTER.y, r: RING_RADIUS + 12, fill: '#1f2933', stroke: '#0b1117', 'stroke-width': 1.2 });
    const hole = svg('circle', { cx: CENTER.x, cy: CENTER.y, r: RING_RADIUS - 12, fill: '#f4efe3', stroke: '#0b1117', 'stroke-width': 1 });
    const pinMark = svg('rect', { x: 5, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 });
    const pinLabel = svg('text', { x: 17, y: 9, class: 'board-part__label board-part__label--small' }, [`DIN IO${instance.pins.din ?? ''}`]);
    const title = svg('text', { x: CENTER.x, y: CENTER.y - 3, 'text-anchor': 'middle', class: 'board-neopixel__title' }, ['네오픽셀']);
    const subtitle = svg('text', { x: CENTER.x, y: CENTER.y + 9, 'text-anchor': 'middle', class: 'board-neopixel__title' }, ['16구']);
    const state = svg('text', { x: CENTER.x, y: SIZE.height - 2, 'text-anchor': 'middle', class: 'board-neopixel__state' }, ['모두 꺼짐']);
    target.append(board, hole, pinMark, pinLabel, title, subtitle);
    const leds = Array.from({ length: RING_LED_COUNT }, (_, index) => {
      const { x, y } = ledPosition(index);
      const glow = svg('circle', { cx: x, cy: y, r: 9, fill: '#000000', opacity: 0 });
      const body = svg('rect', { x: x - 5.5, y: y - 5.5, width: 11, height: 11, rx: 1.5, fill: '#e9edf1', stroke: '#6b7682', 'stroke-width': 0.8 });
      const lens = svg('circle', { cx: x, cy: y, r: 3.6, fill: '#2b3440' });
      const tooltip = svg('title', {}, [`${index}번 LED: 꺼짐`]);
      const group = svg('g', { 'data-neopixel-led': index }, [glow, body, lens, tooltip]);
      target.append(group);
      return { glow, lens, tooltip };
    });
    target.append(state);
    // 부품 그림 글자 규칙(README 7.8): 짙은 기판 위 흰색, 밝은 가운데 구멍·브레드보드 위 짙은 색.
    // 핀 글은 링 위쪽 브레드보드(밝은 바탕)에 있어 짙게 — board-part__label의 CSS 흰색(fill 속성보다 우선)을 inline style로 덮는다
    pinLabel.style.fill = '#1f2933';
    title.setAttribute('fill', '#1f2933');
    subtitle.setAttribute('fill', '#1f2933');
    title.setAttribute('font-size', '9');
    subtitle.setAttribute('font-size', '9');
    state.setAttribute('fill', '#1f2933');
    state.setAttribute('font-size', '9.5');
    return (visual) => {
      const text = typeof visual.colors === 'string' ? visual.colors : '';
      const colors = text.match(/.{6}/gu) ?? [];
      leds.forEach((led, index) => {
        const hex = colors[index] ?? OFF;
        const [r, g, b] = rgbOf(hex);
        led.lens.setAttribute('fill', displayColor(hex));
        led.glow.setAttribute('fill', displayColor(hex));
        led.glow.setAttribute('opacity', String(glowOpacity(hex)));
        led.tooltip.textContent = hex === OFF ? `${index}번 LED: 꺼짐` : `${index}번 LED: (${r}, ${g}, ${b})`;
      });
      const count = typeof visual.count === 'number' ? visual.count : 0;
      state.textContent = count === 0 ? '모두 꺼짐' : `켜진 LED ${count}개`;
    };
  },
};

export default definition;
