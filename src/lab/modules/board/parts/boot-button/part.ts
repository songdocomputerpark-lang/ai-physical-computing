/**
 * 부품: 보드에 붙은 BOOT 버튼(GPIO0) — 입력 부품의 본보기(src/lab/README.md 7절). PLAN §6.2 "BOOT 버튼 (GPIO0) | f015",
 * PD-34(시나리오 B의 기본 입력은 디지털 터치 센서, BOOT 버튼판은 "거꾸로 동작하는 버튼" 바꿔보기).
 *
 * 핀을 누르는 값(interaction.drive): 누르면 0(GND에 닿음), 떼면 'pullup'(보드가 3.3V 쪽으로 끌어올려 둠) → Pin(0, Pin.IN).value()는
 * 평소 1, 누르는 동안 0이다. 실물의 GPIO0은 전원을 켤 때 부팅 방식을 정하는 스트래핑 핀이라, 실물에서 전원을 넣을 때 누르고 있으면
 * 코드 대신 펌웨어 굽기 모드로 켜진다(가상 보드는 흉내 내지 않음). 그림의 ▲는 스트래핑 핀 표시(보드 그림 안내와 같음).
 * 조작: 마우스·터치로 누르고 있기, 또는 Tab으로 초점을 옮겨 Space·Enter를 누르고 있기. 누르는 자리(투명 사각형)·초점 테두리·키보드 처리는
 * 보드 화면(view.ts)이 모든 입력 부품에 공통으로 붙인다.
 * 모습 값(data-visual-pressed): pressed(true|false).
 */
import type { PartDefinition } from '../../part-types.ts';

const definition: PartDefinition = {
  id: 'boot-button',
  title: 'BOOT 버튼',
  description: '보드에 붙어 있는 버튼이에요. 누르는 동안 GPIO0이 0, 떼면 1로 읽혀요.',
  onboard: true,
  pins: [{ role: 'sig', label: '신호', direction: 'in' }],
  defaultPins: { sig: 0 },
  size: { width: 50, height: 56 },
  interaction: {
    kind: 'momentary',
    label: 'BOOT 버튼',
    drive(active) {
      return active ? 0 : 'pullup';
    },
  },
  visual({ active }) {
    return { pressed: active };
  },
  render(target, { svg }) {
    const base = svg('rect', { x: 11, y: 5, width: 28, height: 24, rx: 3, fill: '#d5dbe3', stroke: '#4a5361', 'stroke-width': 1.2 });
    const cap = svg('circle', { cx: 25, cy: 17, r: 8, fill: '#2b2f36', stroke: '#17191c', 'stroke-width': 1 });
    // 스트래핑 핀 표시(▲): 보드 그림의 핀 머리 표시와 같은 모양
    const strap = svg('path', { d: 'M 43 3 L 47 10 L 39 10 Z', fill: '#ffd24a', stroke: '#1f2937', 'stroke-width': 0.6, class: 'board-strap-mark' });
    const label = svg('text', { x: 25, y: 41, 'text-anchor': 'middle', class: 'board-part__label board-part__label--small' }, ['BOOT IO0']);
    const state = svg('text', { x: 25, y: 52, 'text-anchor': 'middle', class: 'board-part__state' }, ['뗌']);
    target.append(base, cap, strap, label, state);
    return (visual) => {
      const pressed = visual.pressed === true;
      cap.setAttribute('r', pressed ? '6.5' : '8');
      cap.setAttribute('fill', pressed ? '#0b50c8' : '#2b2f36');
      base.setAttribute('fill', pressed ? '#bcc6d2' : '#d5dbe3');
      state.textContent = pressed ? '누름' : '뗌';
    };
  },
};

export default definition;
