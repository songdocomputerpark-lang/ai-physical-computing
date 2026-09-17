/**
 * 부품: 보드에 붙은 내장 LED(GPIO2) — 출력 부품의 본보기(src/lab/README.md 7절). PLAN §6.2 "내장 LED (GPIO2) | 2-1-1 f046".
 *
 * 켜지는 조건: 보드가 코드를 돌리는 중이거나 스스로 끝났고(phase run·idle·end), GPIO2가 전기를 내보내며(driven) 값이 1일 때.
 * Pin(2, Pin.IN)으로 두고 on()을 부르면 출력이 꺼져 있어 실물처럼 켜지지 않는다. [정지]하면 꺼진 모습으로 돌아간다.
 * 밝기(P3-02): state.ts outputStrength — 보통 출력은 0 또는 100, PWM(P3-03이 board.state에 duty를 채우면)은 켜진 시간 비율만큼.
 * 모습 값: data-visual-lit(true|false), data-visual-brightness(0~100).
 * 그림: 사이트가 그린 작은 칩 LED(브랜드 중립). 색은 원고 123쪽 "D2 LED 녹색불"에 맞춘 초록. 켜지면 빛 번짐이 밝기만큼 진해지고,
 * 색만으로 알리지 않게 "켜짐" 글(밝기가 100 미만이면 "켜짐 40%")도 함께 바뀐다(화면 낭독기 이름에도 들어감).
 */
import type { PartDefinition } from '../../part-types.ts';
import { outputStrength } from '../../state.ts';

const definition: PartDefinition = {
  id: 'builtin-led',
  title: '내장 LED',
  description: '보드에 붙어 있는 작은 LED예요. GPIO2가 1(HIGH)이면 켜져요.',
  onboard: true,
  pins: [{ role: 'led', label: 'LED', direction: 'out' }],
  defaultPins: { led: 2 },
  size: { width: 46, height: 40 },
  visual({ snapshot, instance }) {
    const gpio = instance.pins.led;
    const brightness = gpio === undefined ? 0 : Math.round(outputStrength(snapshot, gpio) * 100);
    return { lit: brightness > 0, brightness };
  },
  render(target, { svg, instance }) {
    const glow = svg('circle', { cx: 23, cy: 11, r: 12, fill: '#4ade80', opacity: 0, class: 'board-led__glow' });
    const body = svg('rect', { x: 12, y: 5, width: 22, height: 12, rx: 2, fill: '#dfe5ec', stroke: '#8a939f', 'stroke-width': 1.2 });
    const lens = svg('rect', { x: 16, y: 8, width: 14, height: 6, rx: 1.5, fill: '#b9c3cf' });
    const label = svg('text', { x: 23, y: 29, 'text-anchor': 'middle', class: 'board-part__label' }, [`IO${instance.pins.led ?? ''}`]);
    const state = svg('text', { x: 23, y: 39, 'text-anchor': 'middle', class: 'board-part__state' }, ['꺼짐']);
    target.append(glow, body, lens, label, state);
    return (visual) => {
      const brightness = typeof visual.brightness === 'number' ? visual.brightness : 0;
      const lit = visual.lit === true;
      glow.setAttribute('opacity', lit ? String(0.2 + 0.5 * (brightness / 100)) : '0');
      lens.setAttribute('fill', lit ? '#16a34a' : '#b9c3cf');
      body.setAttribute('fill', lit ? '#dcfce7' : '#dfe5ec');
      state.textContent = lit ? (brightness < 100 ? `켜짐 ${brightness}%` : '켜짐') : '꺼짐';
    };
  },
};

export default definition;
