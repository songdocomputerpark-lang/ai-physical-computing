/**
 * 부품: 보드에 붙은 내장 LED(GPIO2) — 출력 부품의 본보기(src/lab/README.md 7절). PLAN §6.2 "내장 LED (GPIO2) | 2-1-1 f046".
 *
 * 켜지는 조건: 보드가 코드를 돌리는 중이거나 스스로 끝났고(phase run·idle·end), GPIO2가 전기를 내보내며(driven) 값이 1일 때.
 * Pin(2, Pin.IN)으로 두고 on()을 부르면 출력이 꺼져 있어 실물처럼 켜지지 않는다. [정지]하면 꺼진 모습으로 돌아간다.
 * 모습 값(data-visual-lit): lit(true|false).
 * 그림: 사이트가 그린 작은 칩 LED(브랜드 중립). 켜지면 빛 번짐 원과 몸체 색이 바뀐다 — 색만으로 알리지 않게 "켜짐" 글도 함께(화면 낭독기 이름).
 */
import type { PartDefinition } from '../../part-types.ts';
import { isDrivenHigh } from '../../state.ts';

const definition: PartDefinition = {
  id: 'builtin-led',
  title: '내장 LED',
  description: '보드에 붙어 있는 작은 LED예요. GPIO2가 1(HIGH)이면 켜져요.',
  onboard: true,
  pins: [{ role: 'led', label: 'LED', direction: 'out' }],
  defaultPins: { led: 2 },
  size: { width: 64, height: 54 },
  visual({ snapshot, instance }) {
    const gpio = instance.pins.led;
    return { lit: gpio !== undefined && isDrivenHigh(snapshot, gpio) };
  },
  render(target, { svg, instance }) {
    const glow = svg('circle', { cx: 32, cy: 18, r: 17, fill: '#60a5fa', opacity: 0, class: 'board-led__glow' });
    const body = svg('rect', { x: 20, y: 11, width: 24, height: 14, rx: 2, fill: '#dfe5ec', stroke: '#8a939f', 'stroke-width': 1.2 });
    const lens = svg('rect', { x: 25, y: 14, width: 14, height: 8, rx: 1.5, fill: '#b9c3cf' });
    const label = svg('text', { x: 32, y: 41, 'text-anchor': 'middle', class: 'board-part__label' }, [`IO${instance.pins.led ?? ''}`]);
    const state = svg('text', { x: 32, y: 53, 'text-anchor': 'middle', class: 'board-part__state' }, ['꺼짐']);
    target.append(glow, body, lens, label, state);
    return (visual) => {
      const lit = visual.lit === true;
      glow.setAttribute('opacity', lit ? '0.55' : '0');
      lens.setAttribute('fill', lit ? '#2563eb' : '#b9c3cf');
      body.setAttribute('fill', lit ? '#dbeafe' : '#dfe5ec');
      state.textContent = lit ? '켜짐' : '꺼짐';
    };
  },
};

export default definition;
