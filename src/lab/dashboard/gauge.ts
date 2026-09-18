/**
 * 게이지(반달 눈금) 자리 계산(P4-07) — 그림은 **사이트가 직접 그린 SVG**다(외부 그림·라이브러리 없음, SPEC §2 저작권).
 *
 * 각도는 12시 방향을 0도로 보고 시계 방향으로 잰다(사람이 시계를 읽는 방향과 같아 눈으로 검산하기 쉽다).
 * 게이지는 왼쪽 아래(-125도)에서 오른쪽 아래(+125도)까지 250도를 쓴다.
 */

/** 눈금이 시작하는 각도(12시가 0도, 시계 방향이 +) */
export const GAUGE_START_DEG = -125;
/** 눈금이 끝나는 각도 */
export const GAUGE_END_DEG = 125;

/** 값이 눈금 어디쯤인지(0~1). 눈금을 벗어나면 끝에 붙인다. */
export function gaugeRatio(value: number, min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (!Number.isFinite(value) || high - low < 1e-9) {
    return 0;
  }
  return Math.min(1, Math.max(0, (value - low) / (high - low)));
}

/** 0~1을 각도로 */
export function gaugeAngle(ratio: number): number {
  const clamped = Math.min(1, Math.max(0, ratio));
  return GAUGE_START_DEG + clamped * (GAUGE_END_DEG - GAUGE_START_DEG);
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** 가운데에서 각도·거리만큼 간 자리 */
export function polar(cx: number, cy: number, radius: number, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + radius * Math.sin(rad), y: cy - radius * Math.cos(rad) };
}

/** 소수점을 짧게(SVG 경로가 길어지지 않게) */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 원호 하나의 SVG 경로(`d` 값) */
export function arcPath(cx: number, cy: number, radius: number, fromDeg: number, toDeg: number): string {
  const start = polar(cx, cy, radius, fromDeg);
  const end = polar(cx, cy, radius, toDeg);
  const sweep = toDeg >= fromDeg ? 1 : 0;
  const largeArc = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `M ${round(start.x)} ${round(start.y)} A ${round(radius)} ${round(radius)} 0 ${largeArc} ${sweep} ${round(end.x)} ${round(end.y)}`;
}

/** 눈금 전체(옅은 배경) 경로 */
export function trackPath(cx: number, cy: number, radius: number): string {
  return arcPath(cx, cy, radius, GAUGE_START_DEG, GAUGE_END_DEG);
}

/** 값만큼 채운 경로 */
export function valuePath(cx: number, cy: number, radius: number, ratio: number): string {
  return arcPath(cx, cy, radius, GAUGE_START_DEG, gaugeAngle(ratio));
}

/** 바늘 끝 자리 */
export function needleTip(cx: number, cy: number, radius: number, ratio: number): Point {
  const tip = polar(cx, cy, radius, gaugeAngle(ratio));
  return { x: round(tip.x), y: round(tip.y) };
}
