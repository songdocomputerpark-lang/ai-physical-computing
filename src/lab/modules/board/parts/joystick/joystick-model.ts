/**
 * 조이스틱 부품의 순수 논리(DOM 없음 — tests/unit/lab/board-part-joystick.test.ts, Node 실제 Pyodide 단계 generic-parts.mjs도 import).
 *
 * 축 x·y는 ADC로 읽는 값(0~4095, 가운데 약 2048)이고 버튼 sw는 디지털(누르면 0, 떼면 1)이다. 값의 방향은 이 키트 예제의 약속을 따른다:
 * 오른쪽으로 밀면 X 값이 커지고, 위로 밀면 Y 값이 커진다(예제의 "방향 알아맞히기"가 dx > 0이면 오른쪽, dy > 0이면 위쪽). 실제 모듈은 놓는 방향에 따라
 * 부호가 반대일 수 있어 예제 안내도 "반대면 앞에 -를 붙여 보세요"라고 한다.
 * 버튼 핀 sw는 배선에 적지 않아도 된다(part.ts pins의 optional) — 키트의 조이스틱 모듈에 따라 버튼 핀이 없을 수 있다.
 */
import { SENSOR_ANALOG_MAX } from '../sensor-analog/sensor-analog-model.ts';

export { SENSOR_ANALOG_MAX as JOYSTICK_MAX };
/** 가운데 값(막대를 놓은 모습) */
export const JOYSTICK_CENTER = 2048;
/** 가운데에서 이만큼 넘게 벗어나야 "밀었다"고 보는 값 — 예제 4_04 step2의 GAP */
export const JOYSTICK_DIRECTION_GAP = 800;

export interface JoystickInput {
  readonly x: number;
  readonly y: number;
  /** 버튼(sw)을 누르고 있는지 */
  readonly pressed: boolean;
}

export const JOYSTICK_IDLE: JoystickInput = Object.freeze({ x: JOYSTICK_CENTER, y: JOYSTICK_CENTER, pressed: false });

export type JoystickDirection = '중앙' | '위쪽' | '아래쪽' | '왼쪽' | '오른쪽';

function clampAxis(value: number): number {
  const rounded = Math.round(Number.isFinite(value) ? value : JOYSTICK_CENTER);
  return Math.min(SENSOR_ANALOG_MAX, Math.max(0, rounded));
}

/** 밀린 방향: 가운데에서 더 많이 벗어난 축을 보고, 벗어남이 GAP을 넘을 때만 그 방향 */
export function joystickDirection(x: number, y: number, center = JOYSTICK_CENTER, gap = JOYSTICK_DIRECTION_GAP): JoystickDirection {
  const dx = x - center;
  const dy = y - center;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > gap ? '오른쪽' : dx < -gap ? '왼쪽' : '중앙';
  }
  return dy > gap ? '위쪽' : dy < -gap ? '아래쪽' : '중앙';
}

/** 버튼 핀을 누르는 값: 누르면 0(GND에 닿음), 떼면 'pullup'(모듈에 달린 풀업 저항이 올려 둠 — 코드가 PULL_UP을 주든 안 주든 1로 읽힌다) */
export function joystickButtonDrive(pressed: boolean): 0 | 'pullup' {
  return pressed ? 0 : 'pullup';
}

export interface JoystickVisual {
  readonly x: number;
  readonly y: number;
  readonly pressed: boolean;
  readonly direction: JoystickDirection;
  readonly summary: string;
  [key: string]: string | number | boolean;
}

/** 부품 모습: x·y(읽히는 값), pressed(버튼), direction(밀린 방향), summary. 버튼 핀이 없으면 버튼 얘기는 뺀다 */
export function joystickVisual(input: JoystickInput, hasButton: boolean): JoystickVisual {
  const x = clampAxis(input.x);
  const y = clampAxis(input.y);
  const direction = joystickDirection(x, y);
  const pressed = hasButton && input.pressed;
  return {
    x,
    y,
    pressed,
    direction,
    summary: `X ${x} · Y ${y} · ${direction}${hasButton ? ` · 버튼 ${pressed ? '누름' : '뗌'}` : ''}`,
  };
}

/** 패드 안 위치(0~1, 왼쪽 위가 0,0) → X·Y 값: 오른쪽이 X 큼, 위쪽이 Y 큼 */
export function padToRaw(fractionX: number, fractionY: number): { x: number; y: number } {
  const fx = Math.min(1, Math.max(0, Number.isFinite(fractionX) ? fractionX : 0.5));
  const fy = Math.min(1, Math.max(0, Number.isFinite(fractionY) ? fractionY : 0.5));
  return { x: clampAxis(fx * SENSOR_ANALOG_MAX), y: clampAxis((1 - fy) * SENSOR_ANALOG_MAX) };
}

/** X·Y 값 → 패드 안 위치(0~1) — padToRaw의 반대 */
export function rawToPad(x: number, y: number): { fractionX: number; fractionY: number } {
  return { fractionX: clampAxis(x) / SENSOR_ANALOG_MAX, fractionY: 1 - clampAxis(y) / SENSOR_ANALOG_MAX };
}
