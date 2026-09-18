/**
 * 오류 사전 데이터의 모양과 검사(PLAN §8.2 P2-06, SPEC §6.1 "파이썬 예외 → 트레이스백 + 한국어 설명").
 *
 * 데이터 파일은 content/help/errors/errors.yaml 하나다(필드 설명은 그 파일 머리말). 교사가 항목을 더하면 코드 수정 없이
 * 실습실의 "오류 풀이" 카드(src/lab/modules/errors/)와 오류 사전 페이지(/help/errors/)에 함께 들어간다.
 *
 * 이 파일은 브라우저 번들에도 들어가므로 YAML 파서를 쓰지 않는다. YAML 글자 → 객체는 빌드·테스트 전용 catalog-build.ts가 하고,
 * 여기서는 이미 객체가 된 데이터(YAML을 읽은 것, 또는 panel.astro가 페이지에 심은 JSON)를 검사해 ErrorCatalog로 만든다.
 * 형식이 틀리면 어디가 틀렸는지 한국어로 모아 알린다(빌드가 멈춰 바로 알 수 있게).
 */

/** 항목 id·묶음 id 모양: 영문 소문자로 시작, 소문자·숫자·하이픈 */
export const ENTRY_ID_PATTERN = /^[a-z][a-z0-9-]*$/u;
/** 예외 종류 이름 모양: NameError, cv2.error, pyodide.ffi.JsException */
export const TYPE_NAME_PATTERN = /^[A-Za-z_][\w.]*$/u;
/**
 * 글 안의 자리 표시: {name} 또는 {name:은/는}. 중괄호 자체를 쓰려면 두 번 겹친다: {{age}} → {age}
 * (f-문자열 보기 print(f'나이: {{age}}')처럼 코드에 중괄호가 필요할 때).
 */
export const PLACEHOLDER_PATTERN = /\{\{|\}\}|\{([A-Za-z_][\w]*)(?::([^{}]+))?\}/gu;
/** 패턴의 이름 붙은 묶음 (?<name>…) */
const NAMED_GROUP_PATTERN = /\(\?<([A-Za-z_][\w]*)>/gu;

/** 사이트가 만든 예외 종류 이름(파이썬 예외가 아닌 실행 결과·워커 메시지를 항목에 맞추기 위한 이름) */
export const SYNTHETIC_TYPES = Object.freeze({
  /** 실행 결과 stopped: [정지]로 멈춤 */
  stopped: 'StopRequested',
  /** 실행 결과 killed: 정지 2단계(워커 다시 시작) */
  killed: 'ForcedRestart',
} as const);

/** 글 자리에 늘 넣을 수 있는 이름(패턴 묶음이 아니어도 됨) */
export const BUILTIN_PLACEHOLDERS: readonly string[] = Object.freeze(['line', 'type', 'message', 'scope', 'file']);

export interface ErrorGroup {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export interface ErrorExample {
  readonly code: string;
  readonly error: string;
  /** 보기 코드에서 오류가 나는 줄(1부터). 적지 않으면 마지막 줄로 본다(사전 페이지의 "{line}번째 줄" 글에 쓴다). */
  readonly line: number | null;
}

/**
 * 항목이 "오류"인지 "안내"인지(2026-09-18 검토 반영). [정지]로 멈춘 것처럼 고칠 것이 없는 항목까지 빨간 오류 카드로 보여 주면
 * 고1은 글보다 색을 먼저 읽어 정상 종료를 고장으로 오해한다. level: notice면 카드·사전이 파랑 안내 상자와 중립 배지로 그린다.
 */
export type ErrorLevel = 'error' | 'notice';
export const ERROR_LEVELS: readonly ErrorLevel[] = Object.freeze(['error', 'notice']);

export interface ErrorEntry {
  readonly id: string;
  readonly group: string;
  readonly title: string;
  /** 'error'(기본) 또는 'notice'(오류가 아닌 안내 — [정지] 등) */
  readonly level: ErrorLevel;
  /** 비어 있으면 종류를 보지 않는다(패턴만으로 맞춤) */
  readonly types: readonly string[];
  /** 오류 메시지(마지막 줄의 ": " 뒤 + 이어진 줄)에 맞출 정규식 원문 */
  readonly patterns: readonly string[];
  /** 트레이스백 전체에 맞출 정규식 원문 */
  readonly tracebackPatterns: readonly string[];
  readonly priority: number;
  readonly meaning: string;
  readonly why: readonly string[];
  readonly fix: readonly string[];
  readonly mistakes: readonly string[];
  readonly example: ErrorExample | null;
  readonly cases: readonly string[];
  readonly fallback: boolean;
}

export interface ErrorCatalog {
  readonly groups: readonly ErrorGroup[];
  readonly entries: readonly ErrorEntry[];
}

export class CatalogFormatError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`오류 사전 데이터(content/help/errors/errors.yaml)에 문제가 있어요.\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    this.name = 'CatalogFormatError';
    this.problems = problems;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** 글 한 줄 또는 글 목록 → 빈 글을 뺀 목록 */
function textList(value: unknown, where: string, field: string, problems: string[]): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  const items = Array.isArray(value) ? value : [value];
  const result: string[] = [];
  for (const item of items) {
    if (typeof item !== 'string') {
      problems.push(`${where}: ${field}의 항목은 글이어야 해요(지금: ${JSON.stringify(item)}).`);
      continue;
    }
    if (item.trim() !== '') {
      result.push(item.trim());
    }
  }
  return result;
}

function compilePatterns(list: readonly string[], where: string, field: string, problems: string[]): void {
  for (const pattern of list) {
    try {
      new RegExp(pattern, 'u');
    } catch (error) {
      problems.push(`${where}: ${field}의 정규식 "${pattern}"을(를) 읽을 수 없어요(${error instanceof Error ? error.message : String(error)}).`);
    }
  }
}

function namedGroupsOf(patterns: readonly string[]): Set<string> {
  const names = new Set<string>();
  for (const pattern of patterns) {
    for (const match of pattern.matchAll(NAMED_GROUP_PATTERN)) {
      names.add(match[1]!);
    }
  }
  return names;
}

/** 글 안의 {자리}가 패턴 묶음 이름이나 붙박이 이름인지 확인한다(오타를 빌드 때 잡는다). */
function checkPlaceholders(entry: ErrorEntry, where: string, problems: string[]): void {
  const allowed = namedGroupsOf([...entry.patterns, ...entry.tracebackPatterns]);
  for (const name of BUILTIN_PLACEHOLDERS) {
    allowed.add(name);
  }
  const texts = [entry.title, entry.meaning, ...entry.why, ...entry.fix, ...entry.mistakes];
  for (const body of texts) {
    for (const match of body.matchAll(PLACEHOLDER_PATTERN)) {
      const name = match[1];
      if (name === undefined) {
        continue; // {{ 또는 }}(중괄호 자체)
      }
      if (!allowed.has(name)) {
        problems.push(`${where}: 글의 자리 {${name}}에 넣을 값이 없어요. patterns의 (?<${name}>…) 묶음이나 붙박이 이름(${BUILTIN_PLACEHOLDERS.join(', ')})만 쓸 수 있어요.`);
      }
      const particle = match[2];
      if (particle !== undefined && !/^(?:은\/는|이\/가|을\/를|과\/와|으로\/로)$/u.test(particle)) {
        problems.push(`${where}: 자리 {${name}:${particle}}의 조사는 은/는·이/가·을/를·과/와·으로/로 가운데 하나예요.`);
      }
    }
  }
}

function normalizeExample(value: unknown, where: string, problems: string[]): ErrorExample | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value)) {
    problems.push(`${where}: example은 code와 error를 가진 사전이에요.`);
    return null;
  }
  const code = typeof value.code === 'string' ? value.code.replace(/\s+$/u, '') : '';
  const error = text(value.error);
  if (code === '' || error === null) {
    problems.push(`${where}: example에는 code(코드)와 error(오류 마지막 줄)를 모두 적어요.`);
    return null;
  }
  let line: number | null = null;
  if (value.line !== undefined && value.line !== null) {
    const lineCount = code.split('\n').length;
    if (typeof value.line !== 'number' || !Number.isInteger(value.line) || value.line < 1 || value.line > lineCount) {
      problems.push(`${where}: example.line은 보기 코드의 줄 번호(1~${lineCount})예요(지금: ${JSON.stringify(value.line)}).`);
    } else {
      line = value.line;
    }
  }
  return { code, error, line };
}

function normalizeEntry(raw: unknown, index: number, groupIds: ReadonlySet<string>, problems: string[]): ErrorEntry | null {
  const where = `entries[${index}]${isRecord(raw) && typeof raw.id === 'string' ? ` (${raw.id})` : ''}`;
  if (!isRecord(raw)) {
    problems.push(`${where}: 항목은 id·title·… 필드를 가진 사전이어야 해요.`);
    return null;
  }
  const id = text(raw.id);
  if (id === null || !ENTRY_ID_PATTERN.test(id)) {
    problems.push(`${where}: id는 영문 소문자로 시작하고 소문자·숫자·하이픈만 써요(지금: ${JSON.stringify(raw.id)}).`);
  }
  const group = text(raw.group);
  if (group === null || !groupIds.has(group)) {
    problems.push(`${where}: group은 groups에 적은 id 가운데 하나예요(지금: ${JSON.stringify(raw.group)}).`);
  }
  const title = text(raw.title);
  if (title === null) {
    problems.push(`${where}: title(학생이 읽는 제목)을 적어요.`);
  }
  const meaning = text(raw.meaning);
  if (meaning === null) {
    problems.push(`${where}: meaning(무슨 뜻인지 한 문장)을 적어요.`);
  }
  const types = textList(raw.types, where, 'types', problems);
  for (const name of types) {
    if (!TYPE_NAME_PATTERN.test(name)) {
      problems.push(`${where}: types의 "${name}"은(는) 예외 종류 이름 모양(NameError, cv2.error)이 아니에요.`);
    }
  }
  const patterns = textList(raw.patterns, where, 'patterns', problems);
  /*
   * 데이터 파일은 traceback_patterns(YAML), JSON으로 다시 읽을 때는 tracebackPatterns(실습실 카드가 쓰는 길 —
   * catalogJson → catalogFromJson)라 두 이름을 모두 받는다. 2026-09-18에 한쪽만 받아 카드 사전에서 트레이스백
   * 조건이 사라지고, 학생의 일반 IndexError에 네오픽셀 풀이가 붙는 것을 브라우저 테스트가 찾았다.
   */
  const tracebackPatterns = textList(raw.traceback_patterns ?? raw.tracebackPatterns, where, 'traceback_patterns', problems);
  compilePatterns(patterns, where, 'patterns', problems);
  compilePatterns(tracebackPatterns, where, 'traceback_patterns', problems);
  const fallback = raw.fallback === true;
  if (raw.fallback !== undefined && typeof raw.fallback !== 'boolean') {
    problems.push(`${where}: fallback은 true 또는 false예요.`);
  }
  if (!fallback && types.length === 0 && patterns.length === 0 && tracebackPatterns.length === 0) {
    problems.push(`${where}: types나 patterns 가운데 하나는 적어요(아무것도 없으면 어떤 오류에도 맞지 않아요). 마지막 풀이는 fallback: true.`);
  }
  let priority = 0;
  if (raw.priority !== undefined) {
    if (typeof raw.priority === 'number' && Number.isInteger(raw.priority)) {
      priority = raw.priority;
    } else {
      problems.push(`${where}: priority는 정수예요(지금: ${JSON.stringify(raw.priority)}).`);
    }
  }
  const fix = textList(raw.fix, where, 'fix', problems);
  if (fix.length === 0) {
    problems.push(`${where}: fix(고치는 법)를 한 가지 이상 적어요.`);
  }
  let level: ErrorLevel = 'error';
  if (raw.level !== undefined && raw.level !== null) {
    if (typeof raw.level === 'string' && (ERROR_LEVELS as readonly string[]).includes(raw.level)) {
      level = raw.level as ErrorLevel;
    } else {
      problems.push(`${where}: level은 ${ERROR_LEVELS.join(' 또는 ')}예요(지금: ${JSON.stringify(raw.level)}).`);
    }
  }
  const entry: ErrorEntry = {
    id: id ?? `entry-${index}`,
    group: group ?? '',
    title: title ?? '',
    level,
    types,
    patterns,
    tracebackPatterns,
    priority,
    meaning: meaning ?? '',
    why: textList(raw.why, where, 'why', problems),
    fix,
    mistakes: textList(raw.mistakes, where, 'mistakes', problems),
    example: normalizeExample(raw.example, where, problems),
    cases: textList(raw.cases, where, 'cases', problems),
    fallback,
  };
  checkPlaceholders(entry, where, problems);
  return entry;
}

function normalizeGroups(raw: unknown, problems: string[]): ErrorGroup[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    problems.push('groups: 묶음 목록(id·title·description)을 한 개 이상 적어요.');
    return [];
  }
  const groups: ErrorGroup[] = [];
  const seen = new Set<string>();
  raw.forEach((item, index) => {
    const where = `groups[${index}]`;
    if (!isRecord(item)) {
      problems.push(`${where}: 묶음은 id·title·description을 가진 사전이에요.`);
      return;
    }
    const id = text(item.id);
    const title = text(item.title);
    if (id === null || !ENTRY_ID_PATTERN.test(id)) {
      problems.push(`${where}: id는 영문 소문자로 시작하고 소문자·숫자·하이픈만 써요(지금: ${JSON.stringify(item.id)}).`);
      return;
    }
    if (seen.has(id)) {
      problems.push(`${where}: 묶음 id "${id}"이(가) 두 번 있어요.`);
      return;
    }
    if (title === null) {
      problems.push(`${where}: title을 적어요.`);
      return;
    }
    seen.add(id);
    groups.push({ id, title, description: text(item.description) ?? '' });
  });
  return groups;
}

/**
 * YAML(또는 JSON)에서 읽은 객체를 검사해 ErrorCatalog로 만든다. 문제가 하나라도 있으면 CatalogFormatError(모든 문제를 모아서).
 */
export function normalizeCatalog(raw: unknown): ErrorCatalog {
  const problems: string[] = [];
  if (!isRecord(raw)) {
    throw new CatalogFormatError(['파일 전체가 groups와 entries를 가진 사전이어야 해요.']);
  }
  const groups = normalizeGroups(raw.groups, problems);
  const groupIds = new Set(groups.map((group) => group.id));
  if (!Array.isArray(raw.entries) || raw.entries.length === 0) {
    problems.push('entries: 오류 항목 목록을 한 개 이상 적어요.');
    throw new CatalogFormatError(problems);
  }
  const entries: ErrorEntry[] = [];
  const seenIds = new Set<string>();
  raw.entries.forEach((item, index) => {
    const entry = normalizeEntry(item, index, groupIds, problems);
    if (!entry) {
      return;
    }
    if (seenIds.has(entry.id)) {
      problems.push(`entries[${index}] (${entry.id}): id가 두 번 있어요. 항목마다 달라야 해요.`);
    }
    seenIds.add(entry.id);
    entries.push(entry);
  });
  const fallbacks = entries.filter((entry) => entry.fallback);
  if (fallbacks.length !== 1) {
    problems.push(`fallback: true인 항목(아무것도 맞지 않을 때의 마지막 풀이)은 정확히 하나여야 해요(지금 ${fallbacks.length}개).`);
  }
  if (problems.length > 0) {
    throw new CatalogFormatError(problems);
  }
  return { groups, entries };
}

/** 페이지에 심은 JSON 글자(panel.astro의 data-errors-catalog) → ErrorCatalog. 글자가 비었거나 틀리면 null(화면은 기본 풀이만 한다). */
export function catalogFromJson(json: string | null | undefined): ErrorCatalog | null {
  if (!json || json.trim() === '') {
    return null;
  }
  try {
    return normalizeCatalog(JSON.parse(json) as unknown);
  } catch {
    return null;
  }
}

/** 묶음별 항목(groups 순서, 묶음 안은 파일 순서). 사전 페이지가 쓴다. */
export function entriesByGroup(catalog: ErrorCatalog): { group: ErrorGroup; entries: ErrorEntry[] }[] {
  return catalog.groups.map((group) => ({ group, entries: catalog.entries.filter((entry) => entry.group === group.id) }));
}
