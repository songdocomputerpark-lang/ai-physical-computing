/**
 * 부품: 디지털 터치 센서(신호 1핀) — 바깥 입력 부품(PLAN §6.2 "디지털 터치 센서 | 2-1-2, 2-2-1 (f052, f053, f069)", PD-34).
 *
 * 핀을 누르는 값(interaction.drive): 누르고 있는 동안 1, 떼면 0 — 센서 모듈의 출력이 핀을 세게 누른다(풀업·풀다운이 아님).
 * 원고 130~131쪽: "터치 센서가 연결된 핀(GPIO17)을 입력으로 설정", "감지되지 않으면 0, 감지되면 1을 출력". 그래서 기본 핀은 GPIO17이고,
 * 예제 배선에서 다른 핀으로 옮길 수 있다(PD-05 예제별 배선). 실물 키트의 결선(원고 사진의 모듈 이름은 'Analog Touch Sensor')은
 * 실물 점검 도우미에서 확인한다(PLAN 부록 B-2 10번).
 * 조작: 마우스·손가락으로 누르고 있기, 또는 Tab으로 초점을 옮겨 Space·Enter를 누르고 있기(보드 화면 view.ts가 공통으로 처리).
 * 모습 값(data-visual-pressed): pressed(true|false).
 * 그림: 사이트가 그린 둥근 터치 패드 모듈(브랜드 중립). 누르면 패드가 노랗게 바뀌고 테두리 고리가 생기며 "누름" 글이 함께 바뀐다.
 */
import type { PartDefinition } from '../../part-types.ts';

const definition: PartDefinition = {
  id: 'touch-digital',
  title: '터치 센서',
  description: '손가락을 대고 있는 동안 신호 핀이 1, 떼면 0이 되는 디지털 터치 센서예요.',
  pins: [{ role: 'sig', label: '신호', direction: 'in' }],
  defaultPins: { sig: 17 },
  size: { width: 90, height: 68 },
  interaction: {
    kind: 'momentary',
    label: '터치 센서',
    drive(active) {
      return active ? 1 : 0;
    },
  },
  visual({ active }) {
    return { pressed: active };
  },
  render(target, { svg, instance }) {
    const board = svg('rect', { x: 0, y: 0, width: 90, height: 68, rx: 5, fill: '#1e3a5f', stroke: '#0f2238', 'stroke-width': 1.2 });
    const pinMark = svg('rect', { x: 5, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 });
    const pinLabel = svg('text', { x: 17, y: 12, class: 'board-part__label board-part__label--small' }, [`IO${instance.pins.sig ?? ''}`]);
    const title = svg('text', { x: 85, y: 12, 'text-anchor': 'end', class: 'board-part__title' }, ['터치 센서']);
    const ring = svg('circle', { cx: 45, cy: 36, r: 18, fill: 'none', stroke: '#fbbf24', 'stroke-width': 2.5, opacity: 0 });
    const pad = svg('circle', { cx: 45, cy: 36, r: 14, fill: '#dbe4ee', stroke: '#9fb3c8', 'stroke-width': 2 });
    const inner = svg('circle', { cx: 45, cy: 36, r: 7, fill: 'none', stroke: '#9fb3c8', 'stroke-width': 1.2 });
    const state = svg('text', { x: 45, y: 63, 'text-anchor': 'middle', class: 'board-part__state' }, ['뗌']);
    target.append(board, pinMark, pinLabel, title, ring, pad, inner, state);
    return (visual) => {
      const pressed = visual.pressed === true;
      pad.setAttribute('fill', pressed ? '#fde68a' : '#dbe4ee');
      pad.setAttribute('stroke', pressed ? '#d97706' : '#9fb3c8');
      inner.setAttribute('stroke', pressed ? '#d97706' : '#9fb3c8');
      ring.setAttribute('opacity', pressed ? '1' : '0');
      state.textContent = pressed ? '누름' : '뗌';
    };
  },
};

export default definition;
