/**
 * 받은 글에서 **숫자를 꺼내는 규칙**과 **최근 값 모으기**(P4-07) — 순수 코드만 둔다.
 *
 * 왜 규칙이 필요한가: 자료의 메시지 모양이 세 가지다(PLAN §7.2 규칙 1).
 *   `3`            값 하나            → 그대로 숫자
 *   `355,152`      쉼표로 나눈 값들    → field 번째 값
 *   `DATA,120,80`  머리말 + 필드       → 머리말은 세지 않고 field 번째 값
 * 그래서 쉼표로 나눈 뒤 **맨 앞이 숫자가 아니면 머리말로 보고 뺀다**. 끝의 줄바꿈·공백은 떼고 본다.
 */
import { topicMatches } from '../mqtt/index.ts';
import type { SourceMessage, WidgetSpec } from './types.ts';

/** 그래프가 들고 있는 점 하나 */
export interface SamplePoint {
  /** 받은 시각(ms) */
  readonly at: number;
  readonly value: number;
}

/** 한 위젯이 기억하는 점 개수(넘으면 오래된 것부터 버린다) */
export const SERIES_LIMIT = 120;

/** 글에서 숫자를 꺼낸다. 숫자가 아니면 null. */
export function parseNumber(text: string, field = 0): number | null {
  const cleaned = text.replace(/[\u0000-\u001f]+$/u, '').trim();
  if (cleaned === '') {
    return null;
  }
  const parts = cleaned.split(',').map((part) => part.trim());
  // 맨 앞이 숫자가 아니면 머리말(DATA 등)이라 세지 않는다.
  const first = parts[0] ?? '';
  const values = first !== '' && Number.isFinite(Number(first)) ? parts : parts.slice(1);
  const wanted = values[Math.max(0, Math.trunc(field))];
  if (wanted === undefined || wanted === '') {
    return null;
  }
  const value = Number(wanted);
  return Number.isFinite(value) ? value : null;
}

/** 이 메시지가 이 위젯의 토픽에 맞나(MQTT 와일드카드 `+`·`#`도 본다) */
export function widgetWants(spec: WidgetSpec, message: SourceMessage): boolean {
  const topic = spec.topic.trim();
  if (topic === '') {
    return false;
  }
  return topicMatches(topic, message.topic);
}

/** 최근 값 모으기(그래프·게이지가 함께 쓴다) */
export class Series {
  readonly #points: SamplePoint[] = [];
  readonly #limit: number;

  constructor(limit: number = SERIES_LIMIT) {
    this.#limit = Math.max(2, Math.trunc(limit));
  }

  get length(): number {
    return this.#points.length;
  }

  /** 점을 더한다(넘치면 가장 오래된 것부터 버린다) */
  push(value: number, at: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    this.#points.push({ at, value });
    while (this.#points.length > this.#limit) {
      this.#points.shift();
    }
  }

  clear(): void {
    this.#points.length = 0;
  }

  get points(): readonly SamplePoint[] {
    return this.#points;
  }

  get last(): SamplePoint | null {
    return this.#points.length === 0 ? null : (this.#points[this.#points.length - 1] ?? null);
  }

  /** 지금 모인 값의 아래·위(값이 없으면 null) */
  range(): { min: number; max: number } | null {
    if (this.#points.length === 0) {
      return null;
    }
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const point of this.#points) {
      min = Math.min(min, point.value);
      max = Math.max(max, point.value);
    }
    return { min, max };
  }
}

/**
 * 그래프 눈금(아래·위)을 정한다. 설정한 눈금을 기본으로 하되, **값이 눈금을 넘으면 넓혀 준다**
 * (보드가 1, 2, 3…처럼 끝없이 커지는 값을 보내도 선이 화면 밖으로 나가지 않게).
 */
export function axisRange(spec: Pick<WidgetSpec, 'min' | 'max'>, series: Series): { min: number; max: number } {
  const wanted = { min: Math.min(spec.min, spec.max), max: Math.max(spec.min, spec.max) };
  const seen = series.range();
  let min = seen === null ? wanted.min : Math.min(wanted.min, seen.min);
  let max = seen === null ? wanted.max : Math.max(wanted.max, seen.max);
  if (max - min < 1e-9) {
    // 값이 모두 같으면 위아래로 조금 벌려 선이 보이게 한다.
    min -= 1;
    max += 1;
  }
  return { min, max };
}

/** 화면에 보여 줄 숫자 글(너무 긴 소수는 줄인다) */
export function formatValue(value: number, unit = ''): string {
  const rounded = Math.abs(value) >= 100 || Number.isInteger(value) ? Math.round(value).toString() : value.toFixed(1);
  return unit === '' ? rounded : `${rounded}${unit}`;
}

/** 로그 한 줄(시:분:초 + 토픽 + 글) */
export function logLine(message: SourceMessage): string {
  const time = new Date(message.at);
  const stamp = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`;
  return `${stamp} ${message.topic} → ${message.text}`;
}
