/**
 * 부품: 레이저 모듈(신호 1핀) — 바깥 출력 부품(PLAN §6.2 "레이저 모듈 | 2-1-4, 3-1-2, 4-2-2 (f062, f063, f082, f083, f110~f115)", §8.3 P3-03,
 * 원고 118쪽 핀 구성 "레이저 3핀 GND·VCC·SIG", 원고 144~147쪽).
 *
 * 켜지는 조건: 신호 핀이 출력으로 1(HIGH)이면 켜짐(밝기 100), PWM이면 duty만큼(state.ts outputStrength). [정지]하면 꺼진 모습.
 * 핀 번호는 예제마다 다르다(GPIO21 원고 2-1-4, GPIO18 3-1-2·4-2-2, GPIO27 f113 — INVENTORY §4.1, PD-05). 기본 핀은 두지 않는다.
 * 안전(PLAN §6.2 "빛줄기 + '눈에 비추지 않기' 표지", PD-23): 그림에 늘 경고 표지와 "눈에 비추지 않기" 글을 둔다.
 * 모습 값: data-visual-lit(true|false), brightness(0~100), summary.
 * 그림: 사이트가 그린 원통형 모듈과 빛줄기(브랜드 중립). 켜지면 렌즈와 빛줄기가 밝기만큼 진해지고 "켜짐" 글이 함께 바뀐다(색만으로 알리지 않음).
 */
import type { PartDefinition } from '../../part-types.ts';
import { outputStrength } from '../../state.ts';
import { percentOf } from '../rgb-led/rgb-model.ts';

const WIDTH = 108;
const HEIGHT = 64;

const definition: PartDefinition = {
  id: 'laser',
  title: '레이저',
  description: '신호 핀이 1(HIGH)이면 빨간 빛줄기를 내는 레이저 모듈이에요. 실물 레이저는 눈에 비추지 않아요.',
  pins: [{ role: 'sig', label: '신호', direction: 'out' }],
  size: { width: WIDTH, height: HEIGHT },
  visual({ snapshot, instance }) {
    const gpio = instance.pins.sig;
    const brightness = gpio === undefined ? 0 : percentOf(outputStrength(snapshot, gpio));
    const lit = brightness > 0;
    return { lit, brightness, summary: lit ? `빛줄기 켜짐${brightness < 100 ? `(밝기 ${brightness}%)` : ''} — 눈에 비추지 않기` : '꺼짐 — 눈에 비추지 않기' };
  },
  render(target, { svg, instance }) {
    const board = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 5, fill: '#1e3a5f', stroke: '#0f2238', 'stroke-width': 1.2 });
    const pinMark = svg('rect', { x: 5, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 });
    const pinLabel = svg('text', { x: 17, y: 12, class: 'board-part__label board-part__label--small' }, [`IO${instance.pins.sig ?? ''}`]);
    const title = svg('text', { x: WIDTH - 5, y: 12, 'text-anchor': 'end', class: 'board-part__title' }, ['레이저']);
    const body = svg('rect', { x: 6, y: 22, width: 36, height: 20, rx: 4, fill: '#94a3b8', stroke: '#cbd5e1', 'stroke-width': 1 });
    const ribs = svg('g', { stroke: '#64748b', 'stroke-width': 1 }, [
      svg('line', { x1: 14, y1: 24, x2: 14, y2: 40 }),
      svg('line', { x1: 20, y1: 24, x2: 20, y2: 40 }),
      svg('line', { x1: 26, y1: 24, x2: 26, y2: 40 }),
    ]);
    const lens = svg('circle', { cx: 44, cy: 32, r: 4.5, fill: '#7f1d1d', stroke: '#e2e8f0', 'stroke-width': 1 });
    const beamGlow = svg('rect', { x: 48, y: 28, width: 56, height: 8, rx: 4, fill: '#fca5a5', opacity: 0 });
    const beam = svg('rect', { x: 48, y: 31, width: 56, height: 2.5, rx: 1.2, fill: '#ef4444', opacity: 0 });
    const state = svg('text', { x: WIDTH - 5, y: 48, 'text-anchor': 'end', class: 'board-part__state' }, ['꺼짐']);
    const sign = svg('g', {}, [
      svg('path', { d: 'M 11 49 L 17 59 L 5 59 Z', fill: '#fbbf24', stroke: '#78350f', 'stroke-width': 0.8 }),
      svg('text', { x: 11, y: 58, 'text-anchor': 'middle', 'font-size': 7, 'font-weight': 700, fill: '#1f2937' }, ['!']),
    ]);
    const warning = svg('text', { x: 20, y: 58, class: 'board-part__label board-part__label--small' }, ['눈에 비추지 않기']);
    target.append(board, pinMark, pinLabel, title, body, ribs, lens, beamGlow, beam, state, sign, warning);
    return (visual) => {
      const lit = visual.lit === true;
      const brightness = typeof visual.brightness === 'number' ? visual.brightness : 0;
      const strength = brightness / 100;
      lens.setAttribute('fill', lit ? '#ef4444' : '#7f1d1d');
      beam.setAttribute('opacity', lit ? String(0.35 + 0.65 * strength) : '0');
      beamGlow.setAttribute('opacity', lit ? String(0.15 + 0.45 * strength) : '0');
      state.textContent = lit ? (brightness < 100 ? `켜짐 ${brightness}%` : '켜짐') : '꺼짐';
    };
  },
};

export default definition;
