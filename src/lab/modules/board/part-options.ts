/**
 * 범용 부품 4종(sensor-digital·sensor-analog·joystick·output-digital — 판 1.5.0, DECISIONS C157)이 배선 줄의 설정(options)을 읽는 순수 함수.
 * DOM 없음 — tests/unit/lab/board-part-*.test.ts가 그대로 검사한다.
 *
 * 설정은 사이드카 `parts: [{ part: sensor-analog, pin: 32, options: { unit: lux } }]`나 차시 md의 `examples[].parts`에서 오고,
 * 글자·숫자·참거짓 값만 화면까지 온다(wiring-spec.ts). 여기서는 부품마다 쓰는 설정 이름과 값 범위를 규칙(OptionRule)으로 적으면
 * 값을 읽고, 철자 틀린 이름·범위 밖 값은 한국어 문제 문장으로 돌려준다(조용히 무시하지 않는다 — 부품의 checkOptions가 이 문장을 배선 목록에 주의로 보인다).
 */
import type { PartOptions } from './part-types.ts';

export type OptionRule =
  | { readonly key: string; readonly type: 'text'; readonly fallback: string; readonly maxLength: number }
  | { readonly key: string; readonly type: 'integer'; readonly fallback: number; readonly min: number; readonly max: number }
  | { readonly key: string; readonly type: 'boolean'; readonly fallback: boolean }
  | { readonly key: string; readonly type: 'choice'; readonly fallback: string; readonly choices: readonly string[] };

export interface ReadOptionsResult {
  /** 규칙마다 읽은 값(틀렸거나 적지 않았으면 fallback) */
  readonly values: Readonly<Record<string, string | number | boolean>>;
  /** 학생·교사가 읽는 문제 문장(없으면 빈 목록) */
  readonly problems: readonly string[];
}

/** 글자 수(코드 포인트) */
function lengthOf(text: string): number {
  return [...text].length;
}

/** 규칙에 따라 options를 읽는다. 규칙에 없는 이름은 문제로 알린다(철자 실수 잡기). */
export function readOptions(raw: PartOptions | undefined, rules: readonly OptionRule[]): ReadOptionsResult {
  const values: Record<string, string | number | boolean> = {};
  const problems: string[] = [];
  const known = new Set(rules.map((rule) => rule.key));
  for (const name of Object.keys(raw ?? {})) {
    if (!known.has(name)) {
      problems.push(`"${name}" 설정은 이 부품에 없어요(있는 설정: ${rules.map((rule) => rule.key).join(', ')}).`);
    }
  }
  for (const rule of rules) {
    const value = raw?.[rule.key];
    values[rule.key] = rule.fallback;
    if (value === undefined) {
      continue;
    }
    if (rule.type === 'text') {
      if (typeof value !== 'string') {
        problems.push(`"${rule.key}" 설정은 글자로 적어요(지금 값: ${String(value)}).`);
      } else if (lengthOf(value.trim()) > rule.maxLength) {
        problems.push(`"${rule.key}" 설정이 너무 길어요(${rule.maxLength}글자까지). 앞 ${rule.maxLength}글자만 써요.`);
        values[rule.key] = [...value.trim()].slice(0, rule.maxLength).join('');
      } else {
        values[rule.key] = value.trim();
      }
    } else if (rule.type === 'integer') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        problems.push(`"${rule.key}" 설정은 정수로 적어요(지금 값: ${String(value)}). 기본값(${String(rule.fallback)})을 써요.`);
      } else if (value < rule.min || value > rule.max) {
        problems.push(`"${rule.key}" 설정은 ${rule.min}부터 ${rule.max}까지예요(지금 값: ${value}). 기본값(${String(rule.fallback)})을 써요.`);
      } else {
        values[rule.key] = value;
      }
    } else if (rule.type === 'boolean') {
      if (typeof value !== 'boolean') {
        problems.push(`"${rule.key}" 설정은 true나 false로 적어요(지금 값: ${String(value)}). 기본값(${String(rule.fallback)})을 써요.`);
      } else {
        values[rule.key] = value;
      }
    } else if (typeof value !== 'string' || !rule.choices.includes(value)) {
      problems.push(`"${rule.key}" 설정은 ${rule.choices.join('·')} 가운데 하나예요(지금 값: ${String(value)}). 기본값(${String(rule.fallback)})을 써요.`);
    } else {
      values[rule.key] = value;
    }
  }
  return { values, problems };
}
