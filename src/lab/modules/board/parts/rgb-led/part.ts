/**
 * 부품: RGB LED 모듈(빨강·초록·파랑 신호 3핀) — 바깥 출력 부품(PLAN §6.2 "RGB LED 모듈 | 2-1-3, 2-1-4, 3-1-3, 4-2-2, BT", §8.3 P3-03,
 * 원고 118쪽 핀 구성 "RGB LED 5핀 GND·VCC·R, G, B", README 7.5·7.9).
 *
 * 켜지는 조건: 색마다 그 핀이 출력으로 1(HIGH)이면 100 %, PWM이면 duty만큼(state.ts outputStrength). [정지]하면 꺼진 모습.
 * 핀 번호는 예제마다 다르다(INVENTORY §4.2 — 27/32/33(원고 2-1-4·f060~f062), 12/5/4(f058), 25/26/27, 23/25/26 — PD-05). 기본 핀은 두지 않는다.
 * 공통 극성: 교과서 코드는 핀이 1이면 그 색이 켜진다(f061 `led[x].on()`, f058 `set_color(0, 0, 0)  # 꺼짐`) → 1이면 켜지는 방식(공통 음극)으로 그리고
 * 그림에 "1이면 켜짐"을 적는다. 키트 모듈의 실제 방식(공통 음극·양극, 트랜지스터 유무)은 확인 전이다(PLAN 부록 B-2 14번).
 * 모습 값: data-visual-r·g·b(0~100), lit, brightness(가장 밝은 색), color(#rrggbb), name(색 이름 — 세 색의 비율로 빨강·주황·노랑·흰색…, rgb-model.ts colorName), summary.
 * 그림: 사이트가 그린 모듈(브랜드 중립) — 색마다 핀 번호·세기 글, 섞인 색으로 빛나는 LED, 색 이름 글(색만으로 알리지 않음).
 */
import type { PartDefinition } from '../../part-types.ts';
import { rgbLevels, rgbVisual } from './rgb-model.ts';

const ROLES = [
  { role: 'r', letter: 'R', label: '빨강' },
  { role: 'g', letter: 'G', label: '초록' },
  { role: 'b', letter: 'B', label: '파랑' },
] as const;

const WIDTH = 126;
const HEIGHT = 80;

const definition: PartDefinition = {
  id: 'rgb-led',
  title: 'RGB LED',
  description: '빨강·초록·파랑 핀이 1(HIGH)이면 그 색이 켜지고 PWM이면 duty만큼 밝아지는 RGB LED 모듈이에요. 교과서 코드처럼 1이면 켜지는 방식으로 그렸어요.',
  pins: ROLES.map(({ role, label }) => ({ role, label, direction: 'out' as const })),
  size: { width: WIDTH, height: HEIGHT },
  visual({ snapshot, instance }) {
    return rgbVisual(rgbLevels(snapshot, instance.pins));
  },
  render(target, { svg, instance }) {
    const board = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 5, fill: '#1e3a5f', stroke: '#0f2238', 'stroke-width': 1.2 });
    const title = svg('text', { x: WIDTH - 5, y: 12, 'text-anchor': 'end', class: 'board-part__title' }, ['RGB LED']);
    target.append(board, title);
    const values: SVGTextElement[] = [];
    ROLES.forEach(({ role, letter }, index) => {
      const anchorX = 9 + index * 18;
      const gpio = instance.pins[role];
      const value = svg('text', { x: 72, y: 27 + index * 12, 'text-anchor': 'end', class: 'board-part__label board-part__label--small' }, ['0%']);
      values.push(value);
      target.append(
        svg('rect', { x: anchorX - 4, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 }),
        svg('text', { x: anchorX, y: 12, 'text-anchor': 'middle', class: 'board-part__label board-part__label--small' }, [letter]),
        svg('text', { x: 5, y: 27 + index * 12, class: 'board-part__label board-part__label--small' }, [`${letter} IO${gpio ?? ''}`]),
        value,
      );
    });
    const glow = svg('circle', { cx: 100, cy: 38, r: 21, fill: '#000000', opacity: 0 });
    const dome = svg('circle', { cx: 100, cy: 38, r: 12, fill: '#cbd5e1', stroke: '#e2e8f0', 'stroke-width': 1.5 });
    const shine = svg('circle', { cx: 96, cy: 34, r: 3, fill: '#ffffff', opacity: 0.55 });
    const name = svg('text', { x: 100, y: 70, 'text-anchor': 'middle', class: 'board-part__state' }, ['꺼짐']);
    const caption = svg('text', { x: 5, y: 72, class: 'board-part__label board-part__label--small' }, ['1이면 켜짐']);
    target.append(glow, dome, shine, name, caption);
    return (visual) => {
      const lit = visual.lit === true;
      const brightness = typeof visual.brightness === 'number' ? visual.brightness : 0;
      const color = typeof visual.color === 'string' ? visual.color : '#000000';
      glow.setAttribute('fill', color);
      glow.setAttribute('opacity', lit ? String(0.25 + 0.55 * (brightness / 100)) : '0');
      dome.setAttribute('fill', lit ? color : '#cbd5e1');
      ROLES.forEach(({ role }, index) => {
        const percent = visual[role];
        const text = values[index];
        if (text) {
          text.textContent = `${typeof percent === 'number' ? percent : 0}%`;
        }
      });
      name.textContent = typeof visual.name === 'string' ? visual.name : '꺼짐';
    };
  },
};

export default definition;
