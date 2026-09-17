/**
 * 오류 → 한국어 풀이 고르기(PLAN §8.2 P2-06, SPEC §6.1 "자주 나는 오류 15개 이상 매핑").
 *
 * 실행 결과(src/lab/runtime/client.ts의 RunResult: outcome·error{type,message,traceback})를 받아
 * ① 트레이스백을 읽고(traceback.ts) ② 오류 사전(catalog-schema.ts의 ErrorCatalog, 데이터는 content/help/errors/errors.yaml)에서
 * 가장 잘 맞는 항목을 고른 뒤 ③ 글 안의 {자리}에 값을 넣어 Explanation을 만든다. 화면(src/lab/modules/errors/index.ts)과
 * 단위 테스트(tests/unit/errors/explain.test.ts)가 쓴다. DOM을 쓰지 않는 순수 함수다.
 *
 * 고르는 규칙(교사가 항목을 더할 때 알아야 할 것 — errors.yaml 머리말에도 적혀 있다)
 * - types가 있으면 오류 종류가 그 가운데 하나여야 한다(짧은 이름 error와 적힌 이름 cv2.error 모두 비교).
 * - patterns가 있으면 메시지(마지막 줄의 ": " 뒤 + 이어진 줄)에 하나라도 맞아야 하고, traceback_patterns는 트레이스백 전체에 맞아야 한다.
 * - 점수: 종류 맞음 2 + 메시지 패턴 맞음 4 + 트레이스백 패턴 맞음 4 + priority. 가장 높은 항목, 같으면 파일에서 먼저 나온 항목.
 * - 아무것도 맞지 않으면 fallback: true 항목(없으면 코드 안의 기본 풀이).
 * - 실행 결과 stopped·killed는 사이트가 만든 종류 이름(StopRequested·ForcedRestart)으로 항목을 찾는다(SYNTHETIC_TYPES).
 */
import type { PythonErrorInfo, RunOutcome } from '../runtime/protocol.ts';
import { withParticle, type ParticlePair } from '../../lib/korean.ts';
import { PLACEHOLDER_PATTERN, SYNTHETIC_TYPES, type ErrorCatalog, type ErrorEntry } from './catalog-schema.ts';
import { messageText, parseTraceback, type ErrorLocation, type ParsedTraceback } from './traceback.ts';

export type ExplanationKind = 'error' | 'stopped' | 'killed';

export interface ExplainInput {
  readonly outcome: RunOutcome;
  readonly error?: PythonErrorInfo | null;
  /** 학생 코드 파일 이름(기본 main.py) */
  readonly studentFile?: string;
}

export interface Explanation {
  readonly kind: ExplanationKind;
  readonly entry: ErrorEntry;
  /** 카드 제목 앞에 보이는 종류 이름(NameError, cv2.error, 정지 …) */
  readonly typeLabel: string;
  readonly title: string;
  readonly meaning: string;
  readonly why: readonly string[];
  readonly fix: readonly string[];
  readonly mistakes: readonly string[];
  /** 오류가 난 학생 코드 위치(없으면 null) */
  readonly location: ErrorLocation | null;
  /** "내 코드 5번째 줄(함수 show 안)" 같은 위치 글(없으면 null) */
  readonly locationText: string | null;
  /** 짧은 트레이스백(학생 프레임 + 마지막 줄). 정지·다시 시작에는 null */
  readonly simplified: string | null;
  /** 마지막 줄 원문("NameError: name 'x' is not defined") */
  readonly lastLine: string;
  /** 어떻게 맞았는지(테스트·디버깅용) */
  readonly matched: 'type+pattern' | 'pattern' | 'type' | 'fallback';
  /** 글 자리에 넣은 값 */
  readonly vars: Readonly<Record<string, string>>;
  /** 오류 사전 페이지의 사이트 안 경로(base 없음). 예: help/errors/#name-error */
  readonly dictionaryPath: string;
  readonly parsed: ParsedTraceback | null;
}

/** 오류 사전 페이지의 사이트 안 경로(base 없음). withBase()를 붙여 링크로 쓴다. */
export const DICTIONARY_PATH = 'help/errors/';

/** 데이터 파일을 읽지 못했을 때도 화면이 풀이를 낼 수 있게 두는 최소 항목 */
export const BUILTIN_FALLBACK_ENTRY: ErrorEntry = Object.freeze({
  id: 'unknown',
  group: 'lab',
  title: '실행이 오류로 끝났어요',
  types: [],
  patterns: [],
  tracebackPatterns: [],
  priority: 0,
  meaning: '{type} 오류가 났어요. 마지막 줄의 메시지를 읽어 봐요: {message}',
  why: ['트레이스백은 아래에서 위로 읽어요. 마지막 줄이 오류 종류와 메시지이고, 그 위의 File "main.py", line 숫자가 내 코드의 어느 줄에서 났는지예요.'],
  fix: ['{line}번째 줄과 그 줄이 쓰는 변수를 print로 찍어 값이 생각과 같은지 봐요.'],
  mistakes: [],
  example: null,
  cases: [],
  fallback: true,
});

const STOP_MESSAGE_TEXT = '[정지] 버튼으로 멈췄어요.';
const KILLED_MESSAGE_TEXT = '1초 안에 멈추지 않아 파이썬을 다시 시작했어요.';

interface Candidate {
  entry: ErrorEntry;
  score: number;
  vars: Record<string, string>;
  matched: Explanation['matched'];
}

function matchAny(patterns: readonly string[], text: string, vars: Record<string, string>): boolean {
  let matched = false;
  for (const pattern of patterns) {
    let regExp: RegExp;
    try {
      regExp = new RegExp(pattern, 'u');
    } catch {
      continue;
    }
    const found = regExp.exec(text);
    if (found) {
      for (const [name, value] of Object.entries(found.groups ?? {})) {
        if (typeof value === 'string' && vars[name] === undefined) {
          vars[name] = value;
        }
      }
      matched = true;
      // 첫 패턴의 묶음 값을 우선하되 뒤 패턴도 새 이름을 더할 수 있게 계속 본다.
    }
  }
  return matched;
}

/** 오류 종류·메시지·트레이스백에 가장 잘 맞는 항목을 고른다. 맞는 것이 없으면 fallback 항목(없으면 BUILTIN_FALLBACK_ENTRY). */
export function pickEntry(
  catalog: ErrorCatalog | null,
  input: { type: string; shortType: string; message: string; traceback: string },
): Candidate {
  const entries = catalog?.entries ?? [];
  let best: Candidate | null = null;
  for (const entry of entries) {
    if (entry.fallback) {
      continue;
    }
    const vars: Record<string, string> = {};
    let score = 0;
    let typeMatched = false;
    if (entry.types.length > 0) {
      typeMatched = entry.types.includes(input.type) || entry.types.includes(input.shortType);
      if (!typeMatched) {
        continue;
      }
      score += 2;
    }
    let patternMatched = false;
    if (entry.patterns.length > 0) {
      patternMatched = matchAny(entry.patterns, input.message, vars);
      if (!patternMatched) {
        continue;
      }
      score += 4;
    }
    if (entry.tracebackPatterns.length > 0) {
      if (!matchAny(entry.tracebackPatterns, input.traceback, vars)) {
        continue;
      }
      patternMatched = true;
      score += 4;
    }
    score += entry.priority;
    const matched: Explanation['matched'] = typeMatched && patternMatched ? 'type+pattern' : patternMatched ? 'pattern' : 'type';
    if (!best || score > best.score) {
      best = { entry, score, vars, matched };
    }
  }
  if (best) {
    return best;
  }
  const fallback = entries.find((entry) => entry.fallback) ?? BUILTIN_FALLBACK_ENTRY;
  return { entry: fallback, score: 0, vars: {}, matched: 'fallback' };
}

function isParticlePair(value: string): value is ParticlePair {
  return value === '은/는' || value === '이/가' || value === '을/를' || value === '과/와' || value === '으로/로';
}

/**
 * 글 안의 {이름}·{이름:은/는}에 값을 넣는다. 값이 없는 자리는 "(알 수 없음)"(줄 번호는 "?").
 * 겹친 중괄호는 중괄호 자체가 된다: {{age}} → {age}
 */
export function fillTemplate(template: string, vars: Readonly<Record<string, string>>): string {
  return template.replace(PLACEHOLDER_PATTERN, (whole: string, name: string | undefined, particle: string | undefined) => {
    if (name === undefined) {
      return whole === '{{' ? '{' : '}';
    }
    const value = vars[name];
    if (value === undefined || value === '') {
      return name === 'line' ? '?' : '(알 수 없음)';
    }
    if (particle !== undefined && isParticlePair(particle)) {
      return withParticle(value, particle);
    }
    return value;
  });
}

/**
 * 긴 OpenCV 메시지에서 빌드 폴더 경로를 잘라 읽기 쉽게 한다(뜻은 그대로).
 *   OpenCV(4.11.0) /home/runner/work/…/modules/imgproc/src/color.cpp:199: error: (-215:…)
 *   → OpenCV(4.11.0) color.cpp:199: error: (-215:…)
 * Pyodide의 opencv-python 휠은 만든 컴퓨터의 폴더 경로를 메시지에 담는다(2026-09-16 Node 실제 Pyodide로 확인).
 * 학생에게 보이는 곳(카드·콘솔)에만 쓰고, 항목을 고를 때 쓰는 원문 메시지는 그대로 둔다.
 */
export function shortenMessage(message: string): string {
  return message.replace(/(OpenCV\([\d.]+\) )\S*[/\\]([\w.+-]+:\d+: error:)/gu, '$1$2');
}

/** 위치 글: "내 코드 5번째 줄" + "(함수 show 안)" */
export function describeLocation(location: ErrorLocation | null): string | null {
  if (!location) {
    return null;
  }
  const scope = location.scope && location.scope !== '<module>' ? `(함수 ${location.scope.replace(/^<|>$/gu, '')} 안)` : '';
  return `내 코드 ${location.line}번째 줄${scope}`;
}

/** 실행 결과를 한국어 풀이로 바꾼다. 결과가 ok이면 null. */
export function explain(catalog: ErrorCatalog | null, input: ExplainInput): Explanation | null {
  const studentFile = input.studentFile;
  if (input.outcome === 'ok') {
    return null;
  }
  if (input.outcome === 'stopped' || input.outcome === 'killed') {
    const kind: ExplanationKind = input.outcome;
    const type = input.outcome === 'stopped' ? SYNTHETIC_TYPES.stopped : SYNTHETIC_TYPES.killed;
    const message = input.outcome === 'stopped' ? STOP_MESSAGE_TEXT : KILLED_MESSAGE_TEXT;
    const candidate = pickEntry(catalog, { type, shortType: type, message, traceback: '' });
    const vars = { ...candidate.vars, type, message, line: '?', file: studentFile ?? 'main.py', scope: '' };
    return {
      kind,
      entry: candidate.entry,
      // 카드 머리의 종류 이름은 학생이 읽는 말로 쓴다(사이트 안쪽 용어 "정지 2단계"는 쓰지 않는다 — 2026-09-17 검토 반영).
      typeLabel: input.outcome === 'stopped' ? '정지' : '파이썬 다시 시작',
      title: fillTemplate(candidate.entry.title, vars),
      meaning: fillTemplate(candidate.entry.meaning, vars),
      why: candidate.entry.why.map((line) => fillTemplate(line, vars)),
      fix: candidate.entry.fix.map((line) => fillTemplate(line, vars)),
      mistakes: candidate.entry.mistakes.map((line) => fillTemplate(line, vars)),
      location: null,
      locationText: null,
      simplified: null,
      lastLine: message,
      matched: candidate.matched,
      vars,
      dictionaryPath: `${DICTIONARY_PATH}#${candidate.entry.id}`,
      parsed: null,
    };
  }

  const error = input.error ?? { type: '', message: '', traceback: '' };
  const parsed = parseTraceback(error.traceback ?? '', {
    ...(studentFile ? { studentFile } : {}),
    fallbackType: error.type,
    fallbackMessage: error.message,
  });
  const section = parsed.final;
  const type = section.type || error.type || 'Error';
  const shortType = section.shortType || error.type || 'Error';
  const message = messageText(section) || error.message || '';
  const candidate = pickEntry(catalog, { type, shortType, message, traceback: error.traceback ?? '' });
  const location = parsed.location;
  const vars: Record<string, string> = {
    ...candidate.vars,
    type,
    // 글에 넣는 메시지는 긴 빌드 경로를 줄인다(항목을 고를 때 쓴 message는 원문 그대로다).
    message: shortenMessage(section.message || error.message || ''),
    line: location ? String(location.line) : '',
    file: location?.file ?? parsed.studentFile,
    scope: location?.scope ?? '',
  };
  const lastLine = section.message ? shortenMessage(`${type}: ${section.message}`) : type;
  return {
    kind: 'error',
    entry: candidate.entry,
    typeLabel: type,
    title: fillTemplate(candidate.entry.title, vars),
    meaning: fillTemplate(candidate.entry.meaning, vars),
    why: candidate.entry.why.map((line) => fillTemplate(line, vars)),
    fix: candidate.entry.fix.map((line) => fillTemplate(line, vars)),
    mistakes: candidate.entry.mistakes.map((line) => fillTemplate(line, vars)),
    location,
    locationText: describeLocation(location),
    simplified: parsed.simplified || null,
    lastLine,
    matched: candidate.matched,
    vars,
    dictionaryPath: `${DICTIONARY_PATH}#${candidate.entry.id}`,
    parsed,
  };
}

/** 사전 페이지에 보여 줄, 자리({name} 등)를 채운 항목 글 */
export interface EntryPreview {
  readonly title: string;
  readonly meaning: string;
  readonly why: readonly string[];
  readonly fix: readonly string[];
  readonly mistakes: readonly string[];
  /** 자리를 채우는 데 쓴 값(테스트·디버깅용) */
  readonly vars: Readonly<Record<string, string>>;
}

/**
 * 오류 사전 페이지(/help/errors/)용: 항목의 보기(example)로 글의 {자리}를 채운다.
 * 실습실 카드와 달리 실제 실행 결과가 없으므로, 보기의 오류 줄에 이 항목의 패턴을 맞춰 이름을 뽑고
 * 줄 번호는 보기 코드의 마지막 줄로 둔다(보기에서 오류가 나는 줄). 값이 없는 자리는 "(알 수 없음)"이 아니라 일반 말로 바꾼다.
 */
export function entryPreview(entry: ErrorEntry): EntryPreview {
  const errorLine = entry.example?.error ?? '';
  const parsed = /^(?<type>[A-Za-z_][\w.]*)(?::\s?(?<message>[\s\S]*))?$/u.exec(errorLine);
  const type = parsed?.groups?.type ?? entry.types[0] ?? '오류';
  const message = (parsed?.groups?.message ?? errorLine).trim();
  const vars: Record<string, string> = {};
  matchAny(entry.patterns, message, vars);
  const codeLines = entry.example?.code.trimEnd().split('\n') ?? [];
  const exampleLine = entry.example?.line ?? (codeLines.length > 0 ? codeLines.length : null);
  const filled: Record<string, string> = {
    line: exampleLine === null ? '' : String(exampleLine),
    type,
    message: shortenMessage(message),
    file: 'main.py',
    scope: '',
    ...vars,
  };
  // 보기가 없는 항목(마지막 풀이)은 줄 번호를 알 수 없으므로 "{line}번째 줄"을 "오류가 난 줄"로 바꿔 읽히게 한다.
  const prepare = (text: string): string => (filled.line === '' ? text.replace(/\{line\}번째 줄/gu, '오류가 난 줄') : text);
  const fill = (text: string): string => fillTemplate(prepare(text), filled);
  return {
    title: fill(entry.title),
    meaning: fill(entry.meaning),
    why: entry.why.map(fill),
    fix: entry.fix.map(fill),
    mistakes: entry.mistakes.map(fill),
    vars: filled,
  };
}

/** 콘솔에 한 줄로 알릴 글. 예: "[오류 풀이] NameError — 정해 준 적이 없는 이름을 썼어요 (내 코드 3번째 줄). 자세한 풀이는 콘솔 위 카드에 있어요." */
export function consoleSummary(explanation: Explanation): string {
  const where = explanation.locationText ? ` (${explanation.locationText})` : '';
  return `[오류 풀이] ${explanation.typeLabel} — ${explanation.title}${where}. 자세한 풀이는 콘솔 위 "오류 풀이" 카드에 있어요.`;
}
