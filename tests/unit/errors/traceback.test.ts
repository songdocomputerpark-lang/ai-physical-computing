// 파이썬 트레이스백 읽기(src/lab/errors/traceback.ts) 단위 테스트 — PLAN §8.2 P2-06 "트레이스백에서 학생 코드 줄 번호를 찾아 표시".
//
// 쓰는 자료는 상상한 글이 아니라 **실제로 채집한 트레이스백**이다: tests/unit/errors/fixtures/tracebacks.json은
// Node의 진짜 Pyodide 314.0.7(+ opencv-python 4.11.0.86)에서 워커와 같은 방법(runPythonAsync(코드, { filename: 'main.py' }))으로
// 오류를 내고 받은 것이다. 다시 만들려면:
//   node --experimental-wasm-jspi tests/unit/errors/helpers/pyodide-traceback-run.mjs . --write
// Pyodide 판을 올리면 트레이스백 모양이 달라질 수 있어 아래 첫 테스트가 판을 대조한다(채집본을 다시 만들라고 알려 준다).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PYODIDE_VERSION } from '../../../src/lab/runtime/config.ts';
import { classifyFrame, messageText, parseTraceback } from '../../../src/lab/errors/traceback.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

interface Fixture {
  pyodideVersion: string;
  pythonVersion: string;
  collectedAt: string;
  skipped: string | null;
  cases: Record<string, { code: string; type: string; message: string; traceback: string }>;
}

const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'unit', 'errors', 'fixtures', 'tracebacks.json'), 'utf8')) as Fixture;

function tracebackOf(id: string): string {
  const found = fixtures.cases[id];
  if (!found) {
    throw new Error(`채집본에 "${id}" 사례가 없어요. pyodide-traceback-run.mjs의 CASES를 보세요.`);
  }
  return found.traceback;
}

describe('채집본', () => {
  it('실제로 돌린 Pyodide 판이 지금 쓰는 판과 같다', () => {
    expect(fixtures.pyodideVersion).toBe(PYODIDE_VERSION);
    expect(fixtures.pythonVersion.startsWith('3.14')).toBe(true);
    expect(fixtures.skipped).toBeNull();
  });

  it('사례가 넉넉히 들어 있다(오류 15가지 이상)', () => {
    expect(Object.keys(fixtures.cases).length).toBeGreaterThanOrEqual(30);
    const types = new Set(Object.values(fixtures.cases).map((item) => item.type));
    expect(types.size).toBeGreaterThanOrEqual(15);
  });
});

describe('프레임 구분', () => {
  it('파일 이름으로 어디 코드인지 나눈다', () => {
    expect(classifyFrame('main.py', 'main.py')).toBe('student');
    expect(classifyFrame('<exec>', 'main.py')).toBe('student');
    expect(classifyFrame('/apc/apc_cv2.py', 'main.py')).toBe('site');
    expect(classifyFrame('/lib/python314.zip/_pyodide/_base.py', 'main.py')).toBe('pyodide');
    expect(classifyFrame('/lib/python3.14/site-packages/cv2/__init__.py', 'main.py')).toBe('library');
    expect(classifyFrame('/lib/python314.zip/json/decoder.py', 'main.py')).toBe('library');
    expect(classifyFrame('<frozen importlib._bootstrap>', 'main.py')).toBe('frozen');
    expect(classifyFrame('무엇인지 모를 곳', 'main.py')).toBe('other');
  });
});

describe('학생 코드 줄 찾기', () => {
  it('함수 안에서 난 오류는 가장 안쪽 학생 프레임(2번째 줄)을 가리킨다', () => {
    const parsed = parseTraceback(tracebackOf('name-error-in-function'));
    expect(parsed.final.type).toBe('NameError');
    expect(parsed.final.message).toBe("name 'total' is not defined");
    expect(parsed.location).toEqual({ file: 'main.py', line: 2, scope: 'show', source: 'return total + 1' });
    // 바깥 → 안쪽 순서로 두 개(6번째 줄에서 부른 show, 그 안 2번째 줄)
    expect(parsed.studentFrames.map((frame) => frame.line)).toEqual([6, 2]);
    expect(parsed.hiddenFrames).toBeGreaterThan(0);
  });

  it('문법 오류는 ", in" 없는 프레임으로 줄을 알린다', () => {
    const parsed = parseTraceback(tracebackOf('syntax-assign-compare'));
    expect(parsed.final.syntax).toBe(true);
    expect(parsed.final.type).toBe('SyntaxError');
    expect(parsed.location?.line).toBe(2);
    expect(parsed.location?.scope).toBeNull();
    expect(parsed.location?.source).toBe('if x = 1:');
  });

  it('들여쓰기 오류(코드 줄만 있고 ^ 표시가 없어도) 줄을 찾는다', () => {
    const parsed = parseTraceback(tracebackOf('indentation-mismatch'));
    expect(parsed.final.type).toBe('IndentationError');
    expect(parsed.location?.line).toBe(3);
    expect(parsed.location?.source).toBe('y = 2');
  });

  it('사이트 흉내 모듈(/apc/)을 거쳐 난 오류도 학생 코드의 가장 안쪽 줄을 가리킨다', () => {
    const parsed = parseTraceback(tracebackOf('site-frame-between'));
    expect(parsed.location?.line).toBe(5);
    expect(parsed.studentFrames.map((frame) => frame.line)).toEqual([8, 5]);
    const origins = parsed.final.frames.map((frame) => frame.origin);
    expect(origins).toContain('site');
    expect(origins).toContain('pyodide');
  });

  it('같은 줄이 되풀이된 재귀 오류도 읽는다', () => {
    const parsed = parseTraceback(tracebackOf('recursion-error'));
    expect(parsed.final.type).toBe('RecursionError');
    expect(parsed.location?.line).toBe(2);
    const repeated = parsed.final.frames.find((frame) => frame.repeated > 0);
    expect(repeated?.repeated).toBeGreaterThan(100);
    expect(parsed.simplified).toContain('번 더 반복됨');
  });

  it('학생 프레임이 없는 마지막 구간이면 앞 구간(원인)에서 줄을 찾는다', () => {
    const parsed = parseTraceback(tracebackOf('stop-iteration'));
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0]?.relation).toBe('cause');
    expect(parsed.final.type).toBe('RuntimeError');
    expect(parsed.final.message).toBe('coroutine raised StopIteration');
    expect(parsed.location?.line).toBe(3);
  });

  it('예외가 이어지면(처리 중 다른 예외) 구간을 나누고 마지막 구간의 줄을 쓴다', () => {
    const parsed = parseTraceback(tracebackOf('chained-context'));
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.sections[0]?.relation).toBe('context');
    expect(parsed.sections[0]?.type).toBe('ZeroDivisionError');
    expect(parsed.final.type).toBe('ValueError');
    expect(parsed.location?.line).toBe(4);
    expect(parsed.simplified).toContain('위 오류를 처리하는 중에 아래 오류가 났어요:');
  });

  it('직접 원인(from)도 한국어 안내로 잇는다', () => {
    const parsed = parseTraceback(tracebackOf('chained-cause'));
    expect(parsed.simplified).toContain('위 오류가 원인이 되어 아래 오류가 났어요:');
    expect(parsed.final.type).toBe('RuntimeError');
  });
});

describe('짧은 트레이스백(simplified)', () => {
  it('사이트·파이썬 안쪽 프레임을 빼고 학생 줄과 마지막 줄만 남긴다', () => {
    const parsed = parseTraceback(tracebackOf('name-error-in-function'));
    expect(parsed.simplified).not.toContain('_pyodide');
    expect(parsed.simplified).not.toContain('eval_code_async');
    expect(parsed.simplified).toContain('File "main.py", line 6, in <module>');
    expect(parsed.simplified).toContain('File "main.py", line 2, in show');
    expect(parsed.simplified.trimEnd().endsWith("NameError: name 'total' is not defined")).toBe(true);
  });

  it('학생 프레임 사이에 숨긴 단계가 있으면 한 줄로 알린다', () => {
    const parsed = parseTraceback(tracebackOf('site-frame-between'));
    expect(parsed.simplified).toContain('(사이트·라이브러리 안 1단계 생략)');
    expect(parsed.simplified).not.toContain('/apc/apc_probe.py');
  });

  it('OpenCV의 이어진 설명 줄(> …)을 잃지 않는다', () => {
    const parsed = parseTraceback(tracebackOf('cv2-bad-argument'));
    expect(parsed.final.type).toBe('cv2.error');
    expect(parsed.final.shortType).toBe('error');
    expect(parsed.final.detail.join('\n')).toContain('Overload resolution failed');
    expect(messageText(parsed.final)).toContain("Can't parse 'pt1'");
    expect(parsed.simplified).toContain('Overload resolution failed');
  });
});

describe('트레이스백이 없거나 이상할 때', () => {
  it('빈 글자면 넘겨준 종류·메시지를 쓴다', () => {
    const parsed = parseTraceback('', { fallbackType: 'PackageLoadError', fallbackMessage: '패키지를 받지 못했어요' });
    expect(parsed.final.type).toBe('PackageLoadError');
    expect(parsed.final.message).toBe('패키지를 받지 못했어요');
    expect(parsed.location).toBeNull();
    expect(parsed.studentFrames).toHaveLength(0);
  });

  it('학생 코드 파일 이름을 바꿔 줄 수 있다', () => {
    const traceback = ['Traceback (most recent call last):', '  File "board.py", line 3, in <module>', '    x', 'NameError: name \'x\' is not defined'].join('\n');
    expect(parseTraceback(traceback).location).toBeNull();
    expect(parseTraceback(traceback, { studentFile: 'board.py' }).location?.line).toBe(3);
  });

  it('줄 끝이 \\r\\n이어도 읽는다', () => {
    const parsed = parseTraceback(tracebackOf('zero-division').replace(/\n/gu, '\r\n'));
    expect(parsed.final.type).toBe('ZeroDivisionError');
    expect(parsed.location?.line).toBe(2);
  });
});
