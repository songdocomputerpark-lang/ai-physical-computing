/**
 * 범용 디지털 센서 부품의 순수 논리(DOM 없음 — tests/unit/lab/board-part-sensor-digital.test.ts, Node 실제 Pyodide 단계 generic-parts.mjs도 import).
 *
 * 신호 핀 1개가 0/1 둘 중 하나인 모듈(버튼·기울기·움직임·불꽃·충돌·가림·수위 …)을 한 부품으로 흉내 낸다. 화면 이름은 배선의 label이다.
 * 감지 중이면 신호가 1, 아니면 0이고, 눌렀을 때 0이 되는 모듈(active-low)은 설정 `active_low: true`로 거꾸로 만든다.
 * 감지 중은 "누르고 있는 동안"(held)이거나 "켜 두기"(latched)일 때다.
 */
import type { PartOptions } from '../../part-types.ts';
import { readOptions, type OptionRule } from '../../part-options.ts';

/** 쓸 수 있는 설정 */
export const SENSOR_DIGITAL_OPTION_RULES: readonly OptionRule[] = Object.freeze([{ key: 'active_low', type: 'boolean', fallback: false }]);

export interface DigitalSensorSettings {
  /** 감지 중에 신호가 0인 모듈이면 true */
  readonly activeLow: boolean;
}

export function digitalSensorSettings(options: PartOptions | undefined): { readonly settings: DigitalSensorSettings; readonly problems: readonly string[] } {
  const { values, problems } = readOptions(options, SENSOR_DIGITAL_OPTION_RULES);
  return { settings: { activeLow: values.active_low === true }, problems };
}

/** 지금 조작 상태: 누르고 있는지·켜 두었는지 */
export interface DigitalSensorInput {
  readonly held: boolean;
  readonly latched: boolean;
}

export const SENSOR_DIGITAL_IDLE: DigitalSensorInput = Object.freeze({ held: false, latched: false });

/** 감지 중인지(누르고 있거나 켜 두었으면 참) */
export function isDetecting(input: DigitalSensorInput): boolean {
  return input.held || input.latched;
}

/** 신호 핀이 내보낼 값: 감지 중이면 1(active_low면 0), 아니면 그 반대 */
export function sensorLevel(detecting: boolean, activeLow: boolean): 0 | 1 {
  return detecting === !activeLow ? 1 : 0;
}

export interface DigitalSensorVisual {
  readonly pressed: boolean;
  readonly latched: boolean;
  readonly level: 0 | 1;
  readonly summary: string;
  [key: string]: string | number | boolean;
}

/** 부품 모습: pressed(감지 중), latched(켜 둠), level(신호 값 0|1), summary(화면 낭독기 글 — 색만으로 알리지 않는다) */
export function digitalSensorVisual(input: DigitalSensorInput, settings: DigitalSensorSettings): DigitalSensorVisual {
  const detecting = isDetecting(input);
  const level = sensorLevel(detecting, settings.activeLow);
  return {
    pressed: detecting,
    latched: input.latched,
    level,
    summary: `${detecting ? '감지됨' : '감지 없음'} · 신호 ${level}${input.latched ? ' · 켜 둠' : ''}`,
  };
}

/** SVG 그림의 상태 글 */
export function digitalSensorStateText(detecting: boolean): string {
  return detecting ? '감지됨' : '없음';
}

/** 신호 값 글 */
export function digitalSensorLevelText(level: 0 | 1): string {
  return level === 1 ? '신호 1 (HIGH)' : '신호 0 (LOW)';
}
