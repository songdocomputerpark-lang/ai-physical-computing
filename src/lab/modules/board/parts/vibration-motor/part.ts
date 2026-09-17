/**
 * 부품: 진동 모터 모듈(신호 1핀) — 바깥 출력 부품(PLAN §6.1·§6.2 PD-36, 원고 119쪽 "진동 모터 3핀 GND·VCC·SIG", 성취기준 [12인피02-03]).
 *
 * 켜지는 조건: 보드가 코드를 돌리는 중이거나 스스로 끝났고, 신호 핀이 전기를 내보내며 1(HIGH)일 때(state.ts outputStrength).
 * 세기: 보통 출력이면 100, PWM이면 켜진 시간 비율(board.state의 duty — PWM 흉내는 P3-03이 채운다). 세기가 100 미만이면 "진동 중 40%".
 * 기본 핀 GPIO19(사이트 배정, 실물 확인 전 — PROGRESS 미해결 7): 원고에 핀 번호가 없어 ① 스트래핑 핀 0·2·5·12·15(Espressif GPIO 문서)
 * ② JTAG 12~15·플래시·PSRAM 6~11·16·17 ③ 입력 전용 34~39·UART0 1·3 ④ 교과서 자료 코드가 쓰는 핀(2·4·5·12·15·16·17·18·21·22·23·25·26·27·
 * 32·33 — 코드 158개 검색)을 뺀 빈 핀 가운데 키트 확장 보드에 3색 헤더로 나와 있는 GPIO19를 골랐다(원고 118쪽 사진). 13·14는 JTAG 핀이라 뺐다.
 * 모습 값: data-visual-on(true|false), data-visual-strength(0~100), data-visual-motion(shake|still).
 * 움직임: 켜지면 모터 그림이 잘게 떨린다(Web Animations). 움직임 줄이기 설정이면 떨지 않고(motion still) 진동 표시 곡선과 "진동 중" 글만 보인다.
 */
import type { PartDefinition } from '../../part-types.ts';
import { outputStrength } from '../../state.ts';

const SHAKE_FRAMES: Keyframe[] = [
  { transform: 'translate(0px, 0px)' },
  { transform: 'translate(-1.3px, 0.6px)' },
  { transform: 'translate(1.2px, -0.7px)' },
  { transform: 'translate(-0.8px, -0.9px)' },
  { transform: 'translate(0px, 0px)' },
];

const definition: PartDefinition = {
  id: 'vibration-motor',
  title: '진동 모터',
  description: '신호 핀이 1(HIGH)이면 떨리는 진동 모터예요. 휴대폰 진동 알림과 같은 부품이에요.',
  pins: [{ role: 'sig', label: '신호', direction: 'out' }],
  defaultPins: { sig: 19 },
  defaultPinsNotice:
    '진동 모터의 GPIO19는 원고에 핀 번호가 없어서 사이트가 정한 핀이에요(부팅에 쓰는 스트래핑 핀과 교과서 실습이 쓰는 핀을 피했어요). 실물 키트에서는 아직 확인하지 않았어요.',
  size: { width: 90, height: 68 },
  visual({ snapshot, instance, reducedMotion }) {
    const gpio = instance.pins.sig;
    const strength = gpio === undefined ? 0 : Math.round(outputStrength(snapshot, gpio) * 100);
    const on = strength > 0;
    return { on, strength, motion: on && !reducedMotion ? 'shake' : 'still' };
  },
  render(target, { svg, instance }) {
    const board = svg('rect', { x: 0, y: 0, width: 90, height: 68, rx: 5, fill: '#1e3a5f', stroke: '#0f2238', 'stroke-width': 1.2 });
    const pinMark = svg('rect', { x: 5, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 });
    const pinLabel = svg('text', { x: 17, y: 12, class: 'board-part__label board-part__label--small' }, [`IO${instance.pins.sig ?? ''}`]);
    const title = svg('text', { x: 85, y: 12, 'text-anchor': 'end', class: 'board-part__title' }, ['진동 모터']);
    const waves = svg('g', { opacity: 0, fill: 'none', stroke: '#fbbf24', 'stroke-width': 2, 'stroke-linecap': 'round' }, [
      svg('path', { d: 'M 25 27 Q 20 36 25 45' }),
      svg('path', { d: 'M 19 24 Q 12 36 19 48' }),
      svg('path', { d: 'M 65 27 Q 70 36 65 45' }),
      svg('path', { d: 'M 71 24 Q 78 36 71 48' }),
    ]);
    const motor = svg('g', { class: 'board-vibration__motor' }, [
      svg('circle', { cx: 45, cy: 36, r: 14, fill: '#9aa5b1', stroke: '#5b6673', 'stroke-width': 1.5 }),
      svg('circle', { cx: 45, cy: 36, r: 5, fill: '#d6dce3' }),
    ]);
    const state = svg('text', { x: 45, y: 63, 'text-anchor': 'middle', class: 'board-part__state' }, ['멈춤']);
    target.append(board, pinMark, pinLabel, title, waves, motor, state);
    let animation: Animation | null = null;
    return (visual) => {
      const on = visual.on === true;
      const strength = typeof visual.strength === 'number' ? visual.strength : 0;
      waves.setAttribute('opacity', on ? String(0.45 + 0.55 * (strength / 100)) : '0');
      state.textContent = on ? (strength < 100 ? `진동 중 ${strength}%` : '진동 중') : '멈춤';
      if (visual.motion === 'shake') {
        if (!animation && typeof motor.animate === 'function') {
          animation = motor.animate(SHAKE_FRAMES, { duration: 110, iterations: Infinity });
        }
      } else if (animation) {
        animation.cancel();
        animation = null;
      }
    };
  },
};

export default definition;
