/**
 * 부품: 팬 모터 모듈(INA·INB 2핀) — 바깥 출력 부품(PLAN §6.2 "팬 모터 | 2-2-3 (f073~f077)", §8.3 P3-03, 원고 166~172쪽, INVENTORY §4.1
 * "팬 모터(4핀) + 프로펠러, INA GPIO25, INB GPIO26", README 7.5).
 *
 * 방향·속도: fan-model.ts — INA 1·INB 0 정회전(시계 방향), 0·1 역회전(반시계 방향), 0·0 정지(두 핀 모두 1도 멈춤), PWM이면 duty 차이만큼 속도.
 * 기본 핀: INA GPIO25·INB GPIO26(원고 168~172쪽의 모든 팬 예제). 예제 배선에서 바꿀 수 있다(PD-05).
 * 모습 값: data-visual-direction(cw|ccw|stop), speed(0~100), brake(두 핀 모두 1로 멈춤), motion(spin|still — 움직임 줄이기면 still), summary.
 * 그림: 사이트가 그린 프로펠러와 틀(브랜드 중립). 돌면 Web Animations로 방향·속도대로 돌고, 움직임 줄이기 설정이면 돌지 않고 "정회전 70%" 글만 바뀐다.
 * 안전(PLAN §6.2 "도는 프로펠러 + 안전 표지"): "손 조심" 글을 늘 둔다.
 */
import { pinSignal } from '../../ext/pwm/pwm-signal.ts';
import type { PartDefinition } from '../../part-types.ts';
import { fanDrive, fanStateText, fanSummary } from './fan-model.ts';

const WIDTH = 108;
const HEIGHT = 80;
const FAN_X = 80;
const FAN_Y = 44;
/** 속도 100 %일 때 한 바퀴 시간(ms) — 눈으로 방향을 알아볼 수 있을 만큼만 빠르게 */
const FULL_SPEED_TURN_MS = 450;

const SPIN_FRAMES: Keyframe[] = [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }];

const definition: PartDefinition = {
  id: 'fan-motor',
  title: '팬 모터',
  description: 'INA가 1이고 INB가 0이면 정회전, 반대면 역회전, 둘 다 0이면 멈추는 팬 모터예요. PWM으로 주면 duty만큼 빠르게 돌아요.',
  pins: [
    { role: 'ina', label: 'INA', direction: 'out' },
    { role: 'inb', label: 'INB', direction: 'out' },
  ],
  defaultPins: { ina: 25, inb: 26 },
  size: { width: WIDTH, height: HEIGHT },
  visual({ snapshot, instance, reducedMotion }) {
    const drive = fanDrive(pinSignal(snapshot, instance.pins.ina), pinSignal(snapshot, instance.pins.inb));
    return {
      direction: drive.direction,
      speed: drive.speed,
      brake: drive.brake,
      motion: drive.direction !== 'stop' && !reducedMotion ? 'spin' : 'still',
      summary: fanSummary(drive),
    };
  },
  render(target, { svg, instance }) {
    const board = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 5, fill: '#1e3a5f', stroke: '#0f2238', 'stroke-width': 1.2 });
    const marks = [9, 27].map((x) => svg('rect', { x: x - 4, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 }));
    const letters = [
      svg('text', { x: 9, y: 12, 'text-anchor': 'middle', class: 'board-part__label board-part__label--small' }, ['A']),
      svg('text', { x: 27, y: 12, 'text-anchor': 'middle', class: 'board-part__label board-part__label--small' }, ['B']),
    ];
    const title = svg('text', { x: WIDTH - 5, y: 12, 'text-anchor': 'end', class: 'board-part__title' }, ['팬 모터']);
    const pinText = [
      svg('text', { x: 5, y: 26, class: 'board-part__label board-part__label--small' }, [`A IO${instance.pins.ina ?? ''}`]),
      svg('text', { x: 5, y: 37, class: 'board-part__label board-part__label--small' }, [`B IO${instance.pins.inb ?? ''}`]),
    ];
    const ring = svg('circle', { cx: FAN_X, cy: FAN_Y, r: 21, fill: '#0f172a', stroke: '#94a3b8', 'stroke-width': 1.5 });
    const blades = [0, 120, 240].map((angle) =>
      svg('ellipse', { cx: FAN_X, cy: FAN_Y - 10, rx: 5, ry: 10, fill: '#cbd5e1', stroke: '#e2e8f0', 'stroke-width': 0.6, transform: `rotate(${angle} ${FAN_X} ${FAN_Y})` }),
    );
    // 돌리는 묶음의 경계 상자가 프로펠러 가운데에 오게 보이지 않는 원을 함께 둔다(transform-box: fill-box)
    const rotor = svg('g', {}, [svg('circle', { cx: FAN_X, cy: FAN_Y, r: 20, fill: 'none', stroke: 'none' }), ...blades]);
    rotor.style.transformBox = 'fill-box';
    rotor.style.transformOrigin = 'center';
    const hub = svg('circle', { cx: FAN_X, cy: FAN_Y, r: 4, fill: '#475569', stroke: '#e2e8f0', 'stroke-width': 1 });
    const state = svg('text', { x: 5, y: 56, class: 'board-part__state' }, ['멈춤']);
    const safety = svg('text', { x: 5, y: 72, class: 'board-part__label board-part__label--small' }, ['손 조심']);
    target.append(board, ...marks, ...letters, title, ...pinText, ring, rotor, hub, state, safety);
    let animation: Animation | null = null;
    return (visual) => {
      const direction = visual.direction;
      const speed = typeof visual.speed === 'number' ? visual.speed : 0;
      state.textContent = fanStateText({ direction: direction === 'cw' || direction === 'ccw' ? direction : 'stop', speed, brake: visual.brake === true });
      if (visual.motion === 'spin' && typeof rotor.animate === 'function') {
        if (!animation) {
          animation = rotor.animate(SPIN_FRAMES, { duration: FULL_SPEED_TURN_MS, iterations: Infinity });
        }
        animation.playbackRate = (direction === 'ccw' ? -1 : 1) * Math.max(0.05, speed / 100);
      } else if (animation) {
        animation.cancel();
        animation = null;
      }
    };
  },
};

export default definition;
