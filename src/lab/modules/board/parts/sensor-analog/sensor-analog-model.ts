/**
 * 범용 아날로그 센서 부품의 순수 논리(DOM 없음 — tests/unit/lab/board-part-sensor-analog.test.ts, Node 실제 Pyodide 단계 generic-parts.mjs도 import).
 * 조도·가변저항·토양 수분·소리·온도(NTC)·압력 …처럼 ADC 한 핀으로 값을 읽는 센서를 한 부품으로 흉내 낸다. 화면 이름은 배선의 label이다.
 *
 * 값(value)은 코드가 읽는 값 그 자체다: ADC(Pin(n))에 atten(ADC.ATTN_11DB), 12비트(기본)로 read()하면 슬라이더 값이 그대로 읽힌다(0~4095).
 * 4채널 터치(touch4-model.ts)는 정수 밀리볼트만 보내서 몇몇 값이 1 크게 읽혔지만(688 → 555mV → 688, 일부는 +1), 이 부품은 소수 밀리볼트를 보내
 * (apc_board.py normalize_drive가 실수 mv를 받는다) 슬라이더 값이 정확히 읽힌다. 감쇠를 낮추면(ATTN_0DB 등) 실물처럼 더 일찍 4095에 닿는다.
 */
import { BOARD_MAX_MV, type AnalogDrive } from '../../state.ts';
import type { PartOptions } from '../../part-types.ts';
import { readOptions, type OptionRule } from '../../part-options.ts';

/** 12비트 ADC의 최댓값 */
export const SENSOR_ANALOG_MAX = 4095;
/** 슬라이더의 처음 값(가운데) */
export const SENSOR_ANALOG_DEFAULT_VALUE = 2048;
/** ATTN_11DB에서 값 4095에 닿는 전압(mV) — apc_board_adc.py FULL_SCALE_MV[3]와 같다 */
const FULL_SCALE_MV = 3300;
/** 슬라이더 칸 수(0~100 %) — 화살표 키 한 번이 범위의 1 %(전체 범위에서 약 41), Home·End가 끝값이다 */
export const SLIDER_STEPS = 100;

/** 쓸 수 있는 설정 */
export const SENSOR_ANALOG_OPTION_RULES: readonly OptionRule[] = Object.freeze([
  { key: 'unit', type: 'text', fallback: '', maxLength: 6 },
  { key: 'min', type: 'integer', fallback: 0, min: 0, max: SENSOR_ANALOG_MAX },
  { key: 'max', type: 'integer', fallback: SENSOR_ANALOG_MAX, min: 0, max: SENSOR_ANALOG_MAX },
  { key: 'value', type: 'integer', fallback: SENSOR_ANALOG_DEFAULT_VALUE, min: 0, max: SENSOR_ANALOG_MAX },
  { key: 'label_low', type: 'text', fallback: '', maxLength: 8 },
  { key: 'label_high', type: 'text', fallback: '', maxLength: 8 },
]);

export interface AnalogSensorSettings {
  /** 값 뒤에 보여 줄 단위 글자(예: "%", "lux") — 보이는 글자일 뿐 코드가 읽는 값은 그대로 0~4095 */
  readonly unit: string;
  /** 슬라이더 범위 */
  readonly min: number;
  readonly max: number;
  /** 처음 값(min~max 안) */
  readonly initial: number;
  /** 슬라이더 양 끝 이름(예: 어두움 / 밝음) */
  readonly labelLow: string;
  readonly labelHigh: string;
}

export function clampRaw(value: number, min = 0, max = SENSOR_ANALOG_MAX): number {
  const rounded = Math.round(Number.isFinite(value) ? value : min);
  return Math.min(max, Math.max(min, rounded));
}

/** 설정을 읽는다. min이 max보다 작지 않으면 둘 다 기본값(0~4095)으로, 처음 값(value)이 범위 밖이면 범위 안으로 맞춘다 */
export function analogSensorSettings(options: PartOptions | undefined): { readonly settings: AnalogSensorSettings; readonly problems: readonly string[] } {
  const { values, problems } = readOptions(options, SENSOR_ANALOG_OPTION_RULES);
  const list = [...problems];
  let min = values.min as number;
  let max = values.max as number;
  if (!(min < max)) {
    list.push(`"min" 설정(${min})은 "max" 설정(${max})보다 작아야 해요. 범위 0부터 ${SENSOR_ANALOG_MAX}까지를 써요.`);
    min = 0;
    max = SENSOR_ANALOG_MAX;
  }
  const wanted = options?.value !== undefined && typeof values.value === 'number' ? (values.value as number) : SENSOR_ANALOG_DEFAULT_VALUE;
  const initial = clampRaw(wanted, min, max);
  if (initial !== wanted && options?.value !== undefined) {
    list.push(`"value" 설정(${wanted})은 min(${min})부터 max(${max})까지 안이어야 해요. ${initial}을 써요.`);
  }
  return {
    settings: { unit: values.unit as string, min, max, initial, labelLow: values.label_low as string, labelHigh: values.label_high as string },
    problems: list,
  };
}

/** 값(min~max) → 슬라이더 칸 번호(0~100) */
export function positionOf(value: number, settings: Pick<AnalogSensorSettings, 'min' | 'max'>): number {
  const span = settings.max - settings.min;
  return Math.min(SLIDER_STEPS, Math.max(0, Math.round(((clampRaw(value, settings.min, settings.max) - settings.min) / span) * SLIDER_STEPS)));
}

/** 슬라이더 칸 번호(0~100) → 값(min~max). 0은 정확히 min, 100은 정확히 max */
export function valueAt(position: number, settings: Pick<AnalogSensorSettings, 'min' | 'max'>): number {
  const clamped = Math.min(SLIDER_STEPS, Math.max(0, Math.round(Number.isFinite(position) ? position : 0)));
  return clampRaw(settings.min + (clamped / SLIDER_STEPS) * (settings.max - settings.min), settings.min, settings.max);
}

/**
 * 값(0~4095, ATTN_11DB·12비트로 읽을 값)이 정확히 읽히는 전압(mV, 소수). 값 = 내림(전압 × 4095 ÷ 3300)이라 값 × 3300 ÷ 4095에서 값이 되고,
 * 0.01mV(값 0.012칸)를 더해 부동소수점 오차로 한 칸 아래로 내려가지 않게 한다. 4095는 3300(끝 전압)이다.
 */
export function exactMillivoltsForRaw12(raw: number): number {
  const clamped = clampRaw(raw);
  return Math.min(BOARD_MAX_MV, (clamped * FULL_SCALE_MV) / SENSOR_ANALOG_MAX + 0.01);
}

/** 부품이 핀에 거는 아날로그 전압 — analogDrive()는 정수로 반올림해서 쓰지 않고 소수 밀리볼트를 그대로 건다 */
export function exactAnalogDrive(raw: number): AnalogDrive {
  return { mv: exactMillivoltsForRaw12(raw) };
}

/** 전압(mV) → ATTN_11DB·12비트 값(apc_board_adc.py raw12_from_millivolts와 같은 식) */
export function raw12FromMillivolts(millivolts: number): number {
  if (!Number.isFinite(millivolts)) {
    return 0;
  }
  return Math.min(SENSOR_ANALOG_MAX, Math.max(0, Math.floor((millivolts * SENSOR_ANALOG_MAX) / FULL_SCALE_MV)));
}

/** 값에 단위를 붙인 글: "2048", "2048 lux" */
export function valueText(value: number, settings: Pick<AnalogSensorSettings, 'unit'>): string {
  return settings.unit === '' ? String(value) : `${value} ${settings.unit}`;
}

/** 양 끝 이름이 있을 때 값이 어느 쪽에 가까운지(아래 34 % 미만 / 위 66 % 넘음 / 가운데). 이름이 없으면 빈 글 */
export function sideText(position: number, settings: Pick<AnalogSensorSettings, 'labelLow' | 'labelHigh'>): string {
  if (position < 34 && settings.labelLow !== '') {
    return `${settings.labelLow} 쪽`;
  }
  if (position > 66 && settings.labelHigh !== '') {
    return `${settings.labelHigh} 쪽`;
  }
  return settings.labelLow !== '' || settings.labelHigh !== '' ? '가운데' : '';
}

export interface AnalogSensorVisual {
  /** 코드가 읽는 값(0~4095) */
  readonly value: number;
  /** 범위 안의 위치(0~100 %) */
  readonly percent: number;
  readonly summary: string;
  [key: string]: string | number | boolean;
}

/** 부품 모습: value(읽히는 값), percent(범위 안 위치), summary(화면 낭독기 글) */
export function analogSensorVisual(value: number, settings: AnalogSensorSettings): AnalogSensorVisual {
  const read = raw12FromMillivolts(exactMillivoltsForRaw12(value));
  const percent = positionOf(read, settings);
  const side = sideText(percent, settings);
  return { value: read, percent, summary: `값 ${valueText(read, settings)}${side === '' ? '' : ` · ${side}`}` };
}
