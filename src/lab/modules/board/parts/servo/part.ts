/**
 * 부품: 서보모터(신호 1핀) — 바깥 출력 부품(PLAN §6.2 "서보모터 2개 | 2-2-4, 4-2-1, 4-2-2, BT (f078~f081, f106, f108~f115, f145, f149)",
 * §6.1 PD-15, §8.3 P3-03, 원고 118쪽 "서보모터 3핀 GND·VCC·SIG", 원고 173~179쪽, README 7.5).
 *
 * 각도: 신호 핀의 PWM 펄스 폭 → 프로필(servo-model.ts: 기본 mg90s, 교과서 servo_library면 servo40) → 반원 눈금 위 팔 각도와 "약 89° · 1.50ms" 글.
 * 프로필은 파이썬 부품 흉내(같은 폴더 apc_part_servo.py)가 이번 실행에서 부른 서보 라이브러리로 알린다(board.device {profile, library}).
 * 신호가 없거나(duty 0·deinit·[정지]) 서보가 알아듣기 어려운 신호면 팔은 마지막 자리에 흐리게 남고 글이 바뀐다(실물 서보는 신호가 끊기면 힘을 뺀다).
 * 핀 번호는 예제마다 다르다(GPIO25·26 원고 2-2-4·4단원, GPIO32 BT·f113 — INVENTORY §4.1). 기본 핀은 두지 않는다.
 * 모습 값: data-visual-signal(angle|no-signal|unusual), angle(0~180, 신호가 없으면 -1), pulse-ms(소수 둘째 자리, 모르면 -1), profile(mg90s|servo40), summary.
 * 그림: 사이트가 그린 서보 몸통과 반원 눈금(0°·90°·180°), 팔(브랜드 중립). 마우스를 올리면 환산 기준이 설명으로 보인다. 팔은 순간 이동한다(움직임 효과 없음).
 */
import { pinSignal } from '../../ext/pwm/pwm-signal.ts';
import type { PartDefinition } from '../../part-types.ts';
import { SERVO_PROFILES, profileFromDevice, servoReading, servoSummary } from './servo-model.ts';

const WIDTH = 108;
const HEIGHT = 92;
const CX = 54;
const CY = 58;
const RADIUS = 30;

/** 각도(0° 왼쪽 · 90° 위 · 180° 오른쪽)의 반원 위 점 */
function pointAt(angle: number, radius: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;
  return { x: CX - radius * Math.cos(radians), y: CY - radius * Math.sin(radians) };
}

const definition: PartDefinition = {
  id: 'servo',
  title: '서보모터',
  description: '신호 핀 PWM의 펄스 폭(보통 50Hz에서 0.5~2.5ms)에 맞춰 0°~180° 사이의 정해진 각도로 팔을 돌리는 서보모터예요.',
  pins: [{ role: 'sig', label: '신호', direction: 'out' }],
  size: { width: WIDTH, height: HEIGHT },
  python: 'apc_part_servo',
  visual({ snapshot, instance, device }) {
    const profile = SERVO_PROFILES[profileFromDevice(device)];
    const reading = servoReading(pinSignal(snapshot, instance.pins.sig), profile);
    return {
      signal: reading.state,
      angle: reading.angle ?? -1,
      pulseMs: reading.pulseMs ?? -1,
      profile: profile.id,
      summary: servoSummary(reading, profile),
    };
  },
  render(target, { svg, instance }) {
    const board = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 5, fill: '#1e3a5f', stroke: '#0f2238', 'stroke-width': 1.2 });
    const pinMark = svg('rect', { x: 5, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 });
    const pinLabel = svg('text', { x: 17, y: 12, class: 'board-part__label board-part__label--small' }, [`IO${instance.pins.sig ?? ''}`]);
    const title = svg('text', { x: WIDTH - 5, y: 12, 'text-anchor': 'end', class: 'board-part__title' }, ['서보모터']);
    const tooltip = svg('title', {}, ['서보모터']);
    const start = pointAt(0, RADIUS);
    const end = pointAt(180, RADIUS);
    const arc = svg('path', {
      d: `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 0 1 ${end.x} ${end.y}`,
      fill: 'none',
      stroke: '#94a3b8',
      'stroke-width': 1.5,
    });
    const ticks = svg(
      'g',
      { stroke: '#cbd5e1', 'stroke-width': 1.2 },
      [0, 45, 90, 135, 180].map((angle) => {
        const inner = pointAt(angle, RADIUS - 5);
        const outer = pointAt(angle, RADIUS + 1);
        return svg('line', { x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y });
      }),
    );
    const labels = [
      svg('text', { x: start.x - 3, y: CY + 3, 'text-anchor': 'end', class: 'board-part__label board-part__label--small' }, ['0°']),
      svg('text', { x: CX, y: CY - RADIUS - 4, 'text-anchor': 'middle', class: 'board-part__label board-part__label--small' }, ['90°']),
      svg('text', { x: end.x + 3, y: CY + 3, class: 'board-part__label board-part__label--small' }, ['180°']),
    ];
    const body = svg('rect', { x: CX - 16, y: CY + 2, width: 32, height: 13, rx: 2, fill: '#475569', stroke: '#94a3b8', 'stroke-width': 1 });
    const armTip = pointAt(90, RADIUS - 6);
    const arm = svg('line', { x1: CX, y1: CY, x2: armTip.x, y2: armTip.y, stroke: '#f8fafc', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.45 });
    const hub = svg('circle', { cx: CX, cy: CY, r: 4.5, fill: '#e2e8f0', stroke: '#334155', 'stroke-width': 1 });
    const state = svg('text', { x: CX, y: HEIGHT - 6, 'text-anchor': 'middle', class: 'board-part__state' }, ['신호 없음']);
    target.append(tooltip, board, pinMark, pinLabel, title, arc, ticks, ...labels, body, arm, hub, state);
    let lastAngle = 90;
    return (visual) => {
      const signal = visual.signal;
      if (signal === 'angle' && typeof visual.angle === 'number' && visual.angle >= 0) {
        lastAngle = visual.angle;
      }
      const tip = pointAt(lastAngle, RADIUS - 6);
      arm.setAttribute('x2', String(tip.x));
      arm.setAttribute('y2', String(tip.y));
      arm.setAttribute('opacity', signal === 'angle' ? '1' : '0.45');
      const pulse = typeof visual.pulseMs === 'number' && visual.pulseMs >= 0 ? `${visual.pulseMs.toFixed(2)}ms` : '';
      state.textContent = signal === 'angle' ? `약 ${lastAngle}° · ${pulse}` : signal === 'unusual' ? '알 수 없는 신호' : '신호 없음';
      const profile = visual.profile === 'servo40' ? SERVO_PROFILES.servo40 : SERVO_PROFILES.mg90s;
      tooltip.textContent = `서보모터(IO${instance.pins.sig ?? ''}) — ${profile.label}`;
    };
  },
};

export default definition;
