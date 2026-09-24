/**
 * 조절 값 규약 파서(PLAN §8.2 P2-04, SPEC §6.1 "값을 바꿔가며 보기") — 코드 속 주석으로 슬라이더·선택 상자·토글을 만든다.
 *
 * 규약(줄 끝 주석, 들여쓰기 없는 줄에서만)
 *   threshold = 100     # @slider 0 255 1          최소 최대 간격(간격을 빼면 1)
 *   blur_size = 5       # @slider 1 31 2           간격 2면 1·3·5…처럼 홀수만
 *   ratio = 0.5         # @slider 0 1 0.1          값·최소·최대·간격 가운데 하나라도 소수점이 있으면 float, 아니면 int
 *   mode = "edge"       # @select edge blur gray   따옴표로 감싼 글자 값과 고를 수 있는 낱말 목록(띄어쓰기·쉼표로 나눔)
 *   show_fps = True     # @toggle                  True·False
 * 규약 앞뒤의 다른 글자는 조절 패널에 보이는 설명이 된다: `threshold = 100  # @slider 0 255 1 테두리로 볼 밝기 차이`.
 * 값은 숫자·글자·True/False 하나여야 한다(`100 + 1`처럼 식이면 안 됨 — 패널이 그 자리의 글자를 바꿔 쓰기 때문).
 *
 * 잘못된 형식(숫자가 아님, 최소 > 최대, 간격 0, 값이 범위·선택지 밖, 들여쓰기, 겹치는 이름, 모르는 규약 이름)은 한국어 경고를
 * 돌려주고 그 줄만 건너뛴다. 코드 실행은 그대로 된다(주석이라 파이썬에는 영향이 없다).
 *
 * 결과의 valueFrom·valueTo는 코드 전체에서 값 글자의 위치(0부터, 끝은 제외)다. 조절 패널(panel.ts)이 이 자리를 새 값으로
 * 바꿔 써서 코드와 패널이 늘 같은 값을 보인다. 실행 중 반영은 panel.ts가 runtime.pushEvent('lab.params', …)로 보내고
 * 파이썬 도우미(src/lab/python/apc_runtime.py의 sync_params)가 입력 확인 지점에서 전역 변수에 넣는다.
 *
 * 이 파일은 DOM을 쓰지 않는 순수 함수라 Vitest(tests/unit/lab/params.test.ts)가 검사한다.
 */

export type ParamKind = 'slider' | 'select' | 'toggle';

/** 파이썬 쪽에 넘길 때의 형(apc_runtime.sync_params가 이 이름으로 변환한다) */
export type ParamValueType = 'int' | 'float' | 'str' | 'bool';

interface ParamBase {
  readonly kind: ParamKind;
  /** 파이썬 변수 이름 */
  readonly name: string;
  /** 줄 번호(1부터) */
  readonly line: number;
  /** 규약 앞뒤에 적힌 설명(없으면 빈 글자) */
  readonly label: string;
  /** 코드 전체에서 값 글자가 시작하는 위치 */
  readonly valueFrom: number;
  /** 값 글자가 끝나는 위치(제외) */
  readonly valueTo: number;
  /** 코드에 적힌 값 글자 그대로 */
  readonly valueText: string;
}

export interface SliderParam extends ParamBase {
  readonly kind: 'slider';
  readonly valueType: 'int' | 'float';
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  /** 값을 글자로 적을 때의 소수 자릿수(값·최소·최대·간격 가운데 가장 긴 것) */
  readonly decimals: number;
}

export interface SelectParam extends ParamBase {
  readonly kind: 'select';
  readonly options: readonly string[];
  readonly value: string;
  /** 코드에 쓴 따옴표(바꿔 쓸 때 그대로 둔다) */
  readonly quote: '"' | "'";
}

export interface ToggleParam extends ParamBase {
  readonly kind: 'toggle';
  readonly value: boolean;
}

export type ParamSpec = SliderParam | SelectParam | ToggleParam;

export interface ParamWarning {
  readonly line: number;
  readonly message: string;
}

export interface ParseResult {
  readonly params: readonly ParamSpec[];
  readonly warnings: readonly ParamWarning[];
}

/** 화면이 파이썬에 보내는 값 하나(runtime.pushEvent(PARAMS_CHANNEL, …)의 값) */
export interface ParamUpdate {
  readonly name: string;
  readonly value: number | string | boolean;
  readonly type: ParamValueType;
}

/** 조절 값이 오가는 채널 이름. 파이썬 쪽 apc_runtime.PARAMS_CHANNEL과 같아야 한다. */
export const PARAMS_CHANNEL = 'lab.params';

/** 규약 이름 */
export const PARAM_DIRECTIVES: readonly ParamKind[] = Object.freeze(['slider', 'select', 'toggle']);

/** 파이썬 예약어(변수 이름으로 쓸 수 없는 것, Python 3.14 keyword.kwlist) */
const PYTHON_KEYWORDS = new Set([
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else',
  'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise',
  'return', 'try', 'while', 'with', 'yield',
]);

const NUMBER_TEXT = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/u;
/** 줄 앞부분: 들여쓰기, 이름, =, 값 글자(숫자·따옴표 글자·True/False/None) */
const ASSIGN_LINE =
  /^(?<indent>[ \t]*)(?<name>[A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*(?<value>[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|True|False|None)(?<rest>.*)$/u;
/** 주석 속 규약: @이름 */
const DIRECTIVE_IN_COMMENT = /@([A-Za-z][A-Za-z0-9_]*)/u;
const PARAM_DIRECTIVE_ANYWHERE = /#.*@(slider|select|toggle)\b/u;
/** 주석만 있는 줄이 규약으로 시작함(자리를 잘못 잡은 규약: `# @slider 0 255 1`). 문장 속에 낱말로만 나오면 그냥 설명이다. */
const COMMENT_ONLY_DIRECTIVE = /^#\s*@(slider|select|toggle)\b/u;

function isNumberText(text: string): boolean {
  return NUMBER_TEXT.test(text);
}

function isFloatText(text: string): boolean {
  return /[.eE]/u.test(text);
}

function decimalsOf(text: string): number {
  const match = /\.(\d*)/u.exec(text);
  if (match) {
    return match[1]?.length ?? 0;
  }
  return 0;
}

/** 규약 뒤 낱말을 띄어쓰기·쉼표로 나눈다. */
function splitWords(text: string): string[] {
  return text
    .split(/[\s,]+/u)
    .map((word) => word.trim())
    .filter((word) => word !== '');
}

/** 따옴표 글자 값에서 안쪽 글자(단순 이스케이프만 푼다) */
function unquote(text: string): string {
  const inner = text.slice(1, -1);
  return inner.replace(/\\(.)/gu, '$1');
}

interface LineInfo {
  readonly text: string;
  readonly start: number;
  readonly number: number;
}

function splitLines(code: string): LineInfo[] {
  const lines: LineInfo[] = [];
  let start = 0;
  let number = 1;
  for (const raw of code.split('\n')) {
    const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    lines.push({ text, start, number });
    start += raw.length + 1;
    number += 1;
  }
  return lines;
}

const SHAPE_HINT = '`이름 = 값  # @slider 최소 최대 간격` 모양이어야 해요(값은 숫자·따옴표 글자·True/False 하나).';

/**
 * 코드에서 조절 값 규약을 읽는다. 순서는 코드에 나온 순서, 같은 이름은 처음 것만 쓴다.
 * 이 함수는 코드를 실행하거나 바꾸지 않는다.
 */
export function parseParams(code: string): ParseResult {
  const params: ParamSpec[] = [];
  const warnings: ParamWarning[] = [];
  const seen = new Map<string, number>();

  for (const line of splitLines(code)) {
    const { text, number } = line;
    if (!text.includes('#') || !text.includes('@')) {
      continue;
    }
    const assign = ASSIGN_LINE.exec(text);
    if (!assign?.groups) {
      const trimmed = text.trimStart();
      if (trimmed.startsWith('#')) {
        // 주석만 있는 줄: 규약으로 시작하면 자리를 잘못 잡은 것이라 알리고, 문장 속에 낱말로만 나오면(설명 글) 지나간다.
        if (COMMENT_ONLY_DIRECTIVE.test(trimmed)) {
          warnings.push({ line: number, message: '@slider·@select·@toggle은 `이름 = 값` 줄의 끝에 써요. 주석만 있는 줄에서는 조절 값이 생기지 않아요.' });
        }
      } else if (PARAM_DIRECTIVE_ANYWHERE.test(text)) {
        // 규약이 있지만 `이름 = 값` 모양이 아니다(식이 있는 줄 등).
        warnings.push({ line: number, message: SHAPE_HINT });
      }
      continue;
    }
    const { indent, name, value, rest } = assign.groups as { indent: string; name: string; value: string; rest: string };
    const commentAt = rest.indexOf('#');
    const beforeComment = commentAt < 0 ? rest : rest.slice(0, commentAt);
    if (commentAt < 0 || beforeComment.trim() !== '') {
      if (PARAM_DIRECTIVE_ANYWHERE.test(text)) {
        warnings.push({ line: number, message: SHAPE_HINT });
      }
      continue;
    }
    const comment = rest.slice(commentAt + 1);
    const directive = DIRECTIVE_IN_COMMENT.exec(comment);
    if (!directive) {
      continue;
    }
    const directiveName = directive[1] ?? '';
    if (!(PARAM_DIRECTIVES as readonly string[]).includes(directiveName)) {
      warnings.push({ line: number, message: `모르는 규약 "@${directiveName}"이에요. 쓸 수 있는 것은 @slider·@select·@toggle이에요.` });
      continue;
    }
    const kind = directiveName as ParamKind;
    if (indent !== '') {
      warnings.push({
        line: number,
        message: `@${kind}은(는) 들여쓰기 없는 줄(맨 바깥)에서만 조절 값이 돼요. 반복문 안에서는 코드가 매번 값을 다시 정해요.`,
      });
      continue;
    }
    if (PYTHON_KEYWORDS.has(name)) {
      warnings.push({ line: number, message: `"${name}"은(는) 파이썬 예약어라 변수 이름으로 쓸 수 없어요.` });
      continue;
    }
    const labelBefore = comment.slice(0, directive.index).trim();
    const argsText = comment.slice((directive.index ?? 0) + directive[0].length);
    // 값 글자의 위치: 줄 시작 + (줄 길이 − 값 뒤 글자 길이 − 값 길이). 정규식이 줄 전체와 맞으므로 rest는 값 바로 뒤부터다.
    const valueFrom = line.start + (text.length - rest.length - value.length);
    const valueTo = valueFrom + value.length;
    const base = { name, line: number, valueFrom, valueTo, valueText: value };

    let spec: ParamSpec | null = null;
    switch (kind) {
      case 'slider': {
        if (!isNumberText(value)) {
          warnings.push({ line: number, message: `@slider의 값은 숫자여야 해요. 지금 값: ${value}` });
          break;
        }
        const words = splitWords(argsText);
        const numbers: string[] = [];
        while (numbers.length < 3 && words.length > 0 && isNumberText(words[0] ?? '')) {
          numbers.push(words.shift() ?? '');
        }
        if (numbers.length < 2) {
          warnings.push({ line: number, message: '@slider 뒤에 최소 최대 간격을 숫자로 적어요. 예: # @slider 0 255 1' });
          break;
        }
        const minText = numbers[0] ?? '';
        const maxText = numbers[1] ?? '';
        const stepText = numbers[2] ?? '1';
        const min = Number(minText);
        const max = Number(maxText);
        const step = Number(stepText);
        const current = Number(value);
        if (!(min < max)) {
          warnings.push({ line: number, message: `@slider의 최소(${minText})는 최대(${maxText})보다 작아야 해요.` });
          break;
        }
        if (!(step > 0)) {
          warnings.push({ line: number, message: `@slider의 간격(${stepText})은 0보다 커야 해요.` });
          break;
        }
        if (current < min || current > max) {
          warnings.push({ line: number, message: `${name}의 값 ${value}이(가) 범위 ${minText}~${maxText}를 벗어나요.` });
          break;
        }
        const valueType: 'int' | 'float' = [value, minText, maxText, stepText].some(isFloatText) ? 'float' : 'int';
        const decimals = Math.max(decimalsOf(value), decimalsOf(minText), decimalsOf(maxText), decimalsOf(stepText));
        spec = {
          kind: 'slider',
          ...base,
          label: [labelBefore, words.join(' ')].filter((part) => part !== '').join(' '),
          valueType,
          min,
          max,
          step,
          value: current,
          decimals,
        };
        break;
      }
      case 'select': {
        const quote = value[0];
        if (quote !== '"' && quote !== "'") {
          warnings.push({ line: number, message: `@select의 값은 따옴표로 감싼 글자여야 해요. 예: mode = "edge"  # @select edge blur gray (지금 값: ${value})` });
          break;
        }
        const options = splitWords(argsText).map((word) => (/^(["']).*\1$/u.test(word) && word.length >= 2 ? unquote(word) : word));
        if (options.length < 2) {
          warnings.push({ line: number, message: '@select 뒤에 고를 수 있는 낱말을 2개 이상 띄어서 적어요. 예: # @select edge blur gray' });
          break;
        }
        const current = unquote(value);
        if (!options.includes(current)) {
          warnings.push({ line: number, message: `${name}의 값 ${value}이(가) 선택지(${options.join(', ')})에 없어요.` });
          break;
        }
        spec = { kind: 'select', ...base, label: labelBefore, options: [...new Set(options)], value: current, quote };
        break;
      }
      case 'toggle': {
        if (value !== 'True' && value !== 'False') {
          warnings.push({ line: number, message: `@toggle의 값은 True 또는 False여야 해요. 지금 값: ${value}` });
          break;
        }
        spec = { kind: 'toggle', ...base, label: [labelBefore, argsText.trim()].filter((part) => part !== '').join(' '), value: value === 'True' };
        break;
      }
    }
    if (!spec) {
      continue;
    }
    const earlier = seen.get(name);
    if (earlier !== undefined) {
      warnings.push({ line: number, message: `"${name}"은(는) ${earlier}번 줄에서 이미 조절 값으로 썼어요. 먼저 것만 패널에 보여요.` });
      continue;
    }
    seen.set(name, number);
    params.push(spec);
  }

  return { params, warnings };
}

/** 파이썬 쪽에 넘길 형 이름 */
export function paramValueType(param: ParamSpec): ParamValueType {
  switch (param.kind) {
    case 'slider':
      return param.valueType;
    case 'select':
      return 'str';
    case 'toggle':
      return 'bool';
  }
}

/** 슬라이더 값을 간격에 맞추고 범위 안으로 넣는다(소수 오차는 자릿수로 다듬는다). */
export function snapSliderValue(param: SliderParam, value: number): number {
  if (!Number.isFinite(value)) {
    return param.value;
  }
  const steps = Math.round((value - param.min) / param.step);
  const snapped = param.min + steps * param.step;
  const clamped = Math.min(param.max, Math.max(param.min, snapped));
  return param.valueType === 'int' ? Math.round(clamped) : Number(clamped.toFixed(param.decimals));
}

/** 값을 코드에 적을 글자로 바꾼다(따옴표·소수 자릿수를 원래 코드처럼). 값이 규약에 맞지 않으면 null. */
export function formatParamValue(param: ParamSpec, value: unknown): string | null {
  switch (param.kind) {
    case 'slider': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
      }
      const snapped = snapSliderValue(param, value);
      return param.valueType === 'int' ? String(Math.round(snapped)) : snapped.toFixed(param.decimals);
    }
    case 'select': {
      if (typeof value !== 'string' || !param.options.includes(value)) {
        return null;
      }
      return `${param.quote}${value.replace(/\\/gu, '\\\\').replace(new RegExp(param.quote, 'gu'), `\\${param.quote}`)}${param.quote}`;
    }
    case 'toggle':
      return typeof value === 'boolean' ? (value ? 'True' : 'False') : null;
  }
}

/** 코드 글자에서 값을 다시 읽는다(formatParamValue의 반대). */
export function paramValueFromText(param: ParamSpec, text: string): number | string | boolean | null {
  switch (param.kind) {
    case 'slider':
      return isNumberText(text) ? Number(text) : null;
    case 'select':
      return /^(["']).*\1$/u.test(text) && text.length >= 2 ? unquote(text) : null;
    case 'toggle':
      return text === 'True' ? true : text === 'False' ? false : null;
  }
}

/**
 * 같은 조절 요소로 볼 수 있는지의 열쇠(값은 뺀다). 코드가 바뀌었을 때 패널이 요소를 새로 만들지, 값만 고칠지 정한다.
 * 이름·종류·범위·선택지·설명이 같으면 같은 요소다.
 */
export function paramSpecKey(param: ParamSpec): string {
  switch (param.kind) {
    case 'slider':
      return `slider:${param.name}:${param.valueType}:${param.min}:${param.max}:${param.step}:${param.decimals}:${param.label}`;
    case 'select':
      return `select:${param.name}:${param.options.join('\u0000')}:${param.label}`;
    case 'toggle':
      return `toggle:${param.name}:${param.label}`;
  }
}

/** 파이썬에 보낼 값 하나를 만든다. */
export function paramUpdate(param: ParamSpec, value: number | string | boolean): ParamUpdate {
  return { name: param.name, value, type: paramValueType(param) };
}

/** 화면 낭독기가 읽는 슬라이더 값 글(aria-valuetext) */
export function sliderValueText(param: SliderParam, value: number): string {
  const text = param.valueType === 'int' ? String(Math.round(value)) : value.toFixed(param.decimals);
  return `${text} (${param.min}부터 ${param.max}까지)`;
}
