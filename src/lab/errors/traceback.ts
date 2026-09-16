/**
 * 파이썬 트레이스백 읽기(PLAN §8.2 P2-06 "트레이스백에서 학생 코드 줄 번호를 찾아 표시").
 *
 * 워커(src/lab/runtime/worker.ts)는 학생 코드를 runPythonAsync(코드, { filename: 'main.py' })로 돌리므로(config.ts STUDENT_FILENAME),
 * Pyodide 314.0.7의 트레이스백은 이런 모양이다(2026-09-16 Node의 실제 Pyodide로 채집, tests/unit/errors/fixtures/tracebacks.json):
 *
 *   Traceback (most recent call last):
 *     File "/lib/python314.zip/_pyodide/_base.py", line 619, in eval_code_async      ← Pyodide 내부(늘 있음)
 *       await CodeRunner(
 *       ...<10 lines>...
 *     File "main.py", line 5, in <module>                                            ← 학생 코드(바깥)
 *       show()
 *       ~~~~^^
 *     File "main.py", line 2, in show                                                ← 학생 코드(안쪽, 함수 show)
 *       return total + 1
 *              ^^^^^
 *     File "/apc/apc_cv2.py", line 315, in imshow                                    ← 사이트 흉내 모듈(있을 때)
 *   NameError: name 'total' is not defined                                           ← 마지막 줄: 종류: 메시지
 *   > Overload resolution failed:                                                    ← (cv2.error) 이어진 줄
 *
 * 문법 오류(SyntaxError·IndentationError·TabError)는 프레임 줄에 ", in …"이 없고 그 아래 코드 줄과 ^ 줄이 온다.
 * 예외가 이어질 때는 "The above exception was the direct cause of the following exception:" 또는
 * "During handling of the above exception, another exception occurred:"로 구간이 나뉜다(예: next()의 StopIteration → RuntimeError).
 *
 * 하는 일
 * - 구간마다 프레임·예외 종류(cv2.error처럼 점이 든 이름 그대로)·메시지·이어진 줄을 나눈다.
 * - 프레임이 어디 것인지 나눈다: student(main.py) / site(/apc/) / pyodide(/_pyodide/) / library(그 밖의 /lib/python…) / frozen / other.
 * - 학생 코드의 마지막(가장 안쪽) 프레임을 오류 위치로 삼는다. 마지막 구간에 학생 프레임이 없으면 앞 구간(원인 예외)에서 찾는다.
 * - 사이트·Pyodide 내부 프레임을 뺀 짧은 트레이스백 글자(simplified)를 만든다(학생 프레임 + 마지막 줄).
 * 순수 함수라 Node 단위 테스트가 채집한 트레이스백으로 검사한다(tests/unit/errors/traceback.test.ts).
 */

export type FrameOrigin = 'student' | 'site' | 'pyodide' | 'library' | 'frozen' | 'other';

export interface TracebackFrame {
  readonly file: string;
  readonly line: number;
  /** "in <module>"의 <module>, 함수 이름. 문법 오류 프레임은 null */
  readonly scope: string | null;
  /** 프레임 아래에 보인 코드 줄(없으면 null) */
  readonly source: string | null;
  /** 코드 줄 아래의 ^~ 표시 줄(없으면 null) */
  readonly caret: string | null;
  readonly origin: FrameOrigin;
  /** "[Previous line repeated N more times]"의 N */
  readonly repeated: number;
}

export type SectionRelation = 'primary' | 'cause' | 'context';

export interface TracebackSection {
  readonly frames: readonly TracebackFrame[];
  /** 마지막 줄의 예외 이름(적힌 그대로, 예: cv2.error, pyodide.ffi.JsException, NameError) */
  readonly type: string;
  /** 점 뒤의 짧은 이름(error, JsException, NameError) */
  readonly shortType: string;
  /** ": " 뒤의 메시지(없으면 빈 글자) */
  readonly message: string;
  /** 마지막 줄 아래에 이어진 줄들(OpenCV의 "> …" 설명 등) */
  readonly detail: readonly string[];
  /** 문법 오류처럼 프레임이 아니라 "File …, line N" + 코드 + ^로 위치를 알린 경우 */
  readonly syntax: boolean;
  /** 다음 구간과의 관계: cause(직접 원인) / context(처리 중 다른 예외) / primary(마지막 구간) */
  readonly relation: SectionRelation;
}

export interface ErrorLocation {
  readonly file: string;
  readonly line: number;
  readonly scope: string | null;
  readonly source: string | null;
}

export interface ParsedTraceback {
  readonly sections: readonly TracebackSection[];
  /** 실행을 끝낸(마지막) 예외 구간 */
  readonly final: TracebackSection;
  /** 학생 코드 파일 이름(기본 main.py) */
  readonly studentFile: string;
  /** 모든 구간의 학생 프레임(바깥 → 안쪽, 구간 순서) */
  readonly studentFrames: readonly TracebackFrame[];
  /** 오류가 난 학생 코드 위치(가장 안쪽 학생 프레임). 학생 프레임이 없으면 null */
  readonly location: ErrorLocation | null;
  /** 숨긴(학생 코드가 아닌) 프레임 수 */
  readonly hiddenFrames: number;
  /** 학생 프레임과 마지막 줄만 남긴 짧은 트레이스백 */
  readonly simplified: string;
}

export const DEFAULT_STUDENT_FILE = 'main.py';

const TRACEBACK_HEADER = 'Traceback (most recent call last):';
const CAUSE_LINE = 'The above exception was the direct cause of the following exception:';
const CONTEXT_LINE = 'During handling of the above exception, another exception occurred:';
const FRAME_LINE = /^ {2}File "(?<file>.+?)", line (?<line>\d+)(?:, in (?<scope>.+))?$/u;
const REPEATED_LINE = /^ {2}\[Previous line repeated (?<count>\d+) more times\]$/u;
const EXCEPTION_LINE = /^(?<type>[A-Za-z_][\w.]*)(?::\s?(?<message>.*))?$/u;
/** ^·~ 로만 된 표시 줄 */
const CARET_LINE = /^[\s^~]+$/u;
/** 학생 코드로 볼 파일 이름(Pyodide runPython의 기본 이름들) */
const STUDENT_LIKE = new Set(['<exec>', '<stdin>', '<string>', '<console>']);

export function classifyFrame(file: string, studentFile: string): FrameOrigin {
  if (file === studentFile || STUDENT_LIKE.has(file)) {
    return 'student';
  }
  if (file.startsWith('/apc/')) {
    return 'site';
  }
  if (file.includes('/_pyodide/') || file.includes('/pyodide/')) {
    return 'pyodide';
  }
  if (file.startsWith('/lib/python') || file.includes('/site-packages/')) {
    return 'library';
  }
  if (file.startsWith('<frozen')) {
    return 'frozen';
  }
  return 'other';
}

function shortTypeOf(type: string): string {
  const dot = type.lastIndexOf('.');
  return dot < 0 ? type : type.slice(dot + 1);
}

interface MutableFrame {
  file: string;
  line: number;
  scope: string | null;
  source: string | null;
  caret: string | null;
  origin: FrameOrigin;
  repeated: number;
}

/** 한 구간(Traceback … 마지막 줄 … 이어진 줄)을 읽는다. */
function parseSection(lines: readonly string[], studentFile: string, relation: SectionRelation): TracebackSection {
  const frames: MutableFrame[] = [];
  let type = '';
  let message = '';
  const detail: string[] = [];
  let syntax = false;
  let sawFrame = false;
  let inFrames = false;
  let headerFound = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/u, '');
    if (headerFound) {
      if (line.trim() !== '') {
        detail.push(line.trim());
      }
      continue;
    }
    if (line === TRACEBACK_HEADER) {
      inFrames = true;
      continue;
    }
    const frameMatch = FRAME_LINE.exec(line);
    if (frameMatch?.groups) {
      const file = frameMatch.groups.file!;
      const scope = frameMatch.groups.scope ?? null;
      if (scope === null) {
        syntax = true;
      }
      frames.push({
        file,
        line: Number(frameMatch.groups.line),
        scope,
        source: null,
        caret: null,
        origin: classifyFrame(file, studentFile),
        repeated: 0,
      });
      sawFrame = true;
      inFrames = true;
      continue;
    }
    const repeatedMatch = REPEATED_LINE.exec(line);
    if (repeatedMatch?.groups && frames.length > 0) {
      frames[frames.length - 1]!.repeated = Number(repeatedMatch.groups.count);
      continue;
    }
    if (line.startsWith('    ') || (inFrames && line.startsWith(' '))) {
      // 프레임에 딸린 코드 줄·^ 표시 줄·"...<10 lines>..." 줄
      const last = frames[frames.length - 1];
      if (last) {
        const body = line.trimEnd();
        if (CARET_LINE.test(body) && last.source !== null) {
          if (last.caret === null) {
            last.caret = body;
          }
        } else if (last.source === null && !body.trim().startsWith('...<')) {
          last.source = body.trim();
        }
      }
      continue;
    }
    if (line.trim() === '') {
      continue;
    }
    const exceptionMatch = EXCEPTION_LINE.exec(line);
    if (exceptionMatch?.groups && (sawFrame || !inFrames || frames.length === 0)) {
      type = exceptionMatch.groups.type!;
      message = (exceptionMatch.groups.message ?? '').trim();
      headerFound = true;
      continue;
    }
    // 프레임도 예외 줄도 아닌 글(드묾) — 이어진 설명으로 둔다.
    detail.push(line.trim());
  }

  return {
    frames: frames.map((frame) => Object.freeze({ ...frame })),
    type,
    shortType: shortTypeOf(type),
    message,
    detail,
    syntax,
    relation,
  };
}

/** 구간 나누기: 이어진 예외 문장을 만나면 앞 구간을 끝낸다. */
function splitSections(text: string): { lines: string[]; relation: SectionRelation }[] {
  const sections: { lines: string[]; relation: SectionRelation }[] = [];
  let current: string[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === CAUSE_LINE || trimmed === CONTEXT_LINE) {
      sections.push({ lines: current, relation: trimmed === CAUSE_LINE ? 'cause' : 'context' });
      current = [];
      continue;
    }
    current.push(line);
  }
  sections.push({ lines: current, relation: 'primary' });
  return sections;
}

function locationOf(sections: readonly TracebackSection[]): ErrorLocation | null {
  for (let index = sections.length - 1; index >= 0; index -= 1) {
    const studentFrames = sections[index]!.frames.filter((frame) => frame.origin === 'student');
    const deepest = studentFrames[studentFrames.length - 1];
    if (deepest) {
      return { file: deepest.file, line: deepest.line, scope: deepest.scope, source: deepest.source };
    }
  }
  return null;
}

const RELATION_TEXT: Record<Exclude<SectionRelation, 'primary'>, string> = {
  cause: '위 오류가 원인이 되어 아래 오류가 났어요:',
  context: '위 오류를 처리하는 중에 아래 오류가 났어요:',
};

function frameText(frame: TracebackFrame): string[] {
  const head = frame.scope === null ? `  File "${frame.file}", line ${frame.line}` : `  File "${frame.file}", line ${frame.line}, in ${frame.scope}`;
  const lines = [head];
  if (frame.source !== null) {
    lines.push(`    ${frame.source}`);
  }
  if (frame.caret !== null) {
    lines.push(frame.caret);
  }
  if (frame.repeated > 0) {
    lines.push(`  [같은 줄이 ${frame.repeated}번 더 반복됨]`);
  }
  return lines;
}

/** 학생 프레임과 마지막 줄만 남긴 짧은 트레이스백. 학생 프레임 사이에 숨긴 프레임이 있으면 한 줄로 알린다. */
function simplify(sections: readonly TracebackSection[]): string {
  const out: string[] = [];
  sections.forEach((section, sectionIndex) => {
    if (sectionIndex > 0) {
      const previous = sections[sectionIndex - 1]!;
      out.push('', RELATION_TEXT[previous.relation === 'primary' ? 'cause' : previous.relation], '');
    }
    const studentFrames = section.frames.filter((frame) => frame.origin === 'student');
    if (studentFrames.length > 0) {
      out.push(section.syntax ? '' : TRACEBACK_HEADER);
      let seenStudent = false;
      let hiddenRun = 0;
      const flushHidden = () => {
        if (hiddenRun > 0) {
          out.push(`  … (사이트·라이브러리 안 ${hiddenRun}단계 생략)`);
          hiddenRun = 0;
        }
      };
      for (const frame of section.frames) {
        if (frame.origin === 'student') {
          flushHidden();
          seenStudent = true;
          out.push(...frameText(frame));
        } else if (seenStudent) {
          hiddenRun += 1;
        }
      }
      flushHidden();
    }
    const header = section.message === '' ? section.type : `${section.type}: ${section.message}`;
    if (header !== '') {
      out.push(header);
    }
    out.push(...section.detail);
  });
  return out
    .filter((line, index, all) => !(line === '' && (index === 0 || all[index - 1] === '')))
    .join('\n')
    .trim();
}

/**
 * 트레이스백 글자를 읽는다. 학생 코드 파일 이름은 기본 main.py(src/lab/runtime/config.ts STUDENT_FILENAME).
 * 트레이스백이 비어 있으면 종류·메시지만 든 빈 결과를 돌려준다(위치 null).
 */
export function parseTraceback(traceback: string, options: { studentFile?: string; fallbackType?: string; fallbackMessage?: string } = {}): ParsedTraceback {
  const studentFile = options.studentFile ?? DEFAULT_STUDENT_FILE;
  const text = traceback.replace(/\r\n/gu, '\n').replace(/\s+$/u, '');
  const rawSections = text === '' ? [] : splitSections(text);
  const sections = rawSections.map((section) => parseSection(section.lines, studentFile, section.relation));
  let final = sections[sections.length - 1];
  if (!final || (final.type === '' && final.frames.length === 0)) {
    final = {
      frames: [],
      type: options.fallbackType ?? '',
      shortType: shortTypeOf(options.fallbackType ?? ''),
      message: options.fallbackMessage ?? '',
      detail: [],
      syntax: false,
      relation: 'primary',
    };
    if (sections.length === 0) {
      sections.push(final);
    } else {
      sections[sections.length - 1] = final;
    }
  } else if (final.type === '' && options.fallbackType) {
    final = { ...final, type: options.fallbackType, shortType: shortTypeOf(options.fallbackType), message: options.fallbackMessage ?? final.message };
    sections[sections.length - 1] = final;
  }
  const studentFrames = sections.flatMap((section) => section.frames.filter((frame) => frame.origin === 'student'));
  const hiddenFrames = sections.reduce((count, section) => count + section.frames.filter((frame) => frame.origin !== 'student').length, 0);
  return {
    sections,
    final,
    studentFile,
    studentFrames,
    location: locationOf(sections),
    hiddenFrames,
    simplified: simplify(sections),
  };
}

/** 마지막 줄(종류: 메시지)과 이어진 설명을 한 글자로(항목 패턴 맞추기용). */
export function messageText(section: TracebackSection): string {
  return [section.message, ...section.detail].filter((line) => line !== '').join('\n');
}
