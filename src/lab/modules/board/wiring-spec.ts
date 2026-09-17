/**
 * 예제 배선을 적는 세 곳의 글을 한 모양(WiringEntry)으로 맞춘다(PLAN §2.6·§6.1 PD-05 "예제별 배선", §8.3 P3-02, src/lab/README.md 7.4).
 * 순수 함수라 빌드(실습실 페이지의 프런트매터)·단위 테스트·브라우저 어디서나 쓴다. 부품 정의(parts.ts)는 import하지 않는다 —
 * 부품 이름이 맞는지, 핀이 하나뿐인 부품인지 같은 검사는 화면에서 resolveWiring이 한다(모르는 부품도 "아직 없어요"로 알리려고).
 *
 * 적는 곳(우선순위 높은 것부터 — 한 예제에 여러 곳이 있으면 앞의 것만 쓴다)
 * 1. 차시 md frontmatter  examples: [{ file: esp32/u2/2-1-2-adv-touch-check.py, parts: [{ type: touch_digital, pin: 17 }] }]
 *    PLAN §2.6 예시의 type·밑줄 이름도 받는다(touch_digital → touch-digital).
 * 2. 사이드카(<이름>.meta.yaml) parts: [{ part: touch-digital, pin: 17 }, { part: lcd-i2c, id: lcd, pins: { sda: 21, scl: 22 }, label: 문자 LCD }]
 * 3. 예제 파일 머리말(사이트가 만든 예제)  # @part touch-digital 17   /   # @part rgb-led r=27 g=32 b=33 as rgb
 *
 * 한 줄의 칸: part(또는 type) 부품 id — 필수 / id 배선 안에서 부르는 이름 / pin 핀이 하나뿐인 부품의 GPIO / pins role → GPIO / label 화면 이름.
 * 틀린 줄은 버리고 까닭을 errors에 한국어로 모은다(빌드는 경고만 — PD-35).
 */
import type { WiringEntry } from './part-types.ts';

/** 부품 id·배선 id 모양(parts.ts의 PART_ID_PATTERN과 같다) */
const ID_PATTERN = /^[a-z][a-z0-9-]*$/u;
/** 핀 역할 이름 모양(parts.ts의 PART_ROLE_PATTERN과 같다) */
const ROLE_PATTERN = /^[a-z][a-z0-9_]*$/u;

export interface WiringSpecResult {
  readonly entries: WiringEntry[];
  readonly errors: string[];
}

/** type·part 값 → 부품 id: 앞뒤 공백을 떼고 소문자로, 밑줄은 하이픈으로(PLAN §2.6의 builtin_led·touch_digital 표기) */
export function partIdFromSpec(value: string): string {
  return value.trim().toLowerCase().replace(/_/gu, '-');
}

/** GPIO 번호 글: 17, "17", "GPIO17", "IO17", "D17"을 받는다. 아니면 null */
export function gpioFromSpec(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^(?:gpio|io|d)?\s*(\d{1,2})$/iu.exec(value.trim());
  return match ? Number(match[1]) : null;
}

/** 배선 한 줄(사전)을 맞춘다. 틀리면 null과 까닭 */
export function normalizeWiringItem(raw: unknown, where: string): { entry: WiringEntry | null; errors: string[] } {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { entry: null, errors: [`${where}: 배선 한 줄은 { part: 부품 이름, pin: 핀 번호 } 모양으로 적어요.`] };
  }
  const item = raw as Record<string, unknown>;
  const partValue = typeof item.part === 'string' ? item.part : typeof item.type === 'string' ? item.type : null;
  if (partValue === null || partValue.trim() === '') {
    return { entry: null, errors: [`${where}: 부품 이름(part)을 적어요. 예: { part: touch-digital, pin: 17 }`] };
  }
  const part = partIdFromSpec(partValue);
  if (!ID_PATTERN.test(part)) {
    return { entry: null, errors: [`${where}: 부품 이름 "${partValue}"은(는) 영문 소문자·숫자·하이픈으로 적어요(예: touch-digital).`] };
  }
  let id: string | undefined;
  if (item.id !== undefined) {
    if (typeof item.id === 'string' && ID_PATTERN.test(item.id.trim())) {
      id = item.id.trim();
    } else {
      errors.push(`${where}: 배선 이름(id) "${String(item.id)}"은(는) 영문 소문자로 시작하는 소문자·숫자·하이픈이어야 해서 빼고 읽었어요.`);
    }
  }
  let pin: number | undefined;
  if (item.pin !== undefined) {
    const gpio = gpioFromSpec(item.pin);
    if (gpio === null) {
      return { entry: null, errors: [...errors, `${where}: ${part}의 핀 번호(pin) "${String(item.pin)}"을(를) 읽지 못했어요. 17처럼 숫자로 적어요.`] };
    }
    pin = gpio;
  }
  let pins: Record<string, number> | undefined;
  if (item.pins !== undefined) {
    if (!item.pins || typeof item.pins !== 'object' || Array.isArray(item.pins)) {
      return { entry: null, errors: [...errors, `${where}: ${part}의 pins는 { 역할: 핀 번호 } 모양으로 적어요. 예: { sda: 21, scl: 22 }`] };
    }
    pins = {};
    for (const [role, value] of Object.entries(item.pins as Record<string, unknown>)) {
      const gpio = gpioFromSpec(value);
      if (!ROLE_PATTERN.test(role) || gpio === null) {
        return { entry: null, errors: [...errors, `${where}: ${part}의 pins에서 "${role}: ${String(value)}"을(를) 읽지 못했어요. 역할은 영문 소문자, 값은 핀 번호예요.`] };
      }
      pins[role] = gpio;
    }
  }
  const label = typeof item.label === 'string' && item.label.trim() !== '' ? item.label.trim() : undefined;
  return {
    entry: {
      part,
      ...(id === undefined ? {} : { id }),
      ...(pin === undefined ? {} : { pin }),
      ...(pins === undefined ? {} : { pins }),
      ...(label === undefined ? {} : { label }),
    },
    errors,
  };
}

/** 배선 목록(차시 md·사이드카의 parts 값)을 맞춘다. 목록이 아니면 빈 목록과 까닭 */
export function normalizeWiringSpecs(raw: unknown, where: string): WiringSpecResult {
  if (raw === undefined || raw === null) {
    return { entries: [], errors: [] };
  }
  if (!Array.isArray(raw)) {
    return { entries: [], errors: [`${where}: parts는 목록으로 적어요. 예: parts: [{ part: touch-digital, pin: 17 }]`] };
  }
  const entries: WiringEntry[] = [];
  const errors: string[] = [];
  raw.forEach((item, index) => {
    const result = normalizeWiringItem(item, `${where} parts ${index + 1}번째`);
    errors.push(...result.errors);
    if (result.entry) {
      entries.push(result.entry);
    }
  });
  return { entries, errors };
}

/**
 * 예제 머리말의 `# @part` 한 줄(@part 뒤의 글)을 배선 한 줄의 사전으로 읽는다(모양 검사는 normalizeWiringItem).
 *   touch-digital 17            → { part: 'touch-digital', pin: 17 }
 *   rgb-led r=27 g=32 b=33 as rgb → { part: 'rgb-led', pins: { r: 27, g: 32, b: 33 }, id: 'rgb' }
 * 읽지 못한 낱말이 있으면 null(그 줄은 버린다 — 머리말 규약은 README 2절).
 */
export function parsePartDirective(text: string): Record<string, unknown> | null {
  const words = text.trim().split(/\s+/u).filter((word) => word !== '');
  const [part, ...rest] = words;
  if (part === undefined) {
    return null;
  }
  const item: Record<string, unknown> = { part };
  const pins: Record<string, string> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const word = rest[index] ?? '';
    if (word === 'as') {
      const id = rest[index + 1];
      if (id === undefined) {
        return null;
      }
      item.id = id;
      index += 1;
      continue;
    }
    const pair = /^([a-z][a-z0-9_]*)=(.+)$/u.exec(word);
    if (pair) {
      pins[pair[1] ?? ''] = pair[2] ?? '';
      continue;
    }
    if (item.pin === undefined && gpioFromSpec(word) !== null) {
      item.pin = word;
      continue;
    }
    return null;
  }
  if (Object.keys(pins).length > 0) {
    item.pins = pins;
  }
  return item;
}
