// 음성 인식 흉내의 파이썬 쪽(src/lab/modules/speech/speech_recognition.py)을 Node.js의 실제 Pyodide 314.0.7로 검사한다(P2-13).
// 교과서 예제 f044·f045를 **파일 그대로** 돌려 글자 입력 방식으로 끝까지 도는지 본다(PLAN §8.2 P2-13 판정 기준).
// JSPI는 --experimental-wasm-jspi로 켜서 따로 띄운다(tests/unit/speech/helpers/pyodide-speech-run.mjs).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'tests', 'unit', 'speech', 'helpers', 'pyodide-speech-run.mjs');

const nodeJspi = spawnSync(process.execPath, ['--experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
  encoding: 'utf8',
  timeout: 20_000,
});
const nodeHasJspi = nodeJspi.status === 0 && nodeJspi.stdout === 'function';
const pyodideInstalled = fs.existsSync(path.join(ROOT, 'node_modules', 'pyodide', 'pyodide.mjs'));

interface StepRecord {
  ms: number;
  value?: unknown;
  errorType?: string;
  errorMessage?: string;
  stdout: string;
  leftoverReplies: number;
}

interface Result {
  jspi: boolean;
  files: string[];
  duplicate?: string;
  steps: Record<string, StepRecord>;
  notices: string[];
  requests: { kind: string; payload: unknown }[];
  syncEntrypointReset: string;
}

function run(): Result {
  const result = spawnSync(process.execPath, ['--experimental-wasm-jspi', SCRIPT, ROOT], {
    encoding: 'utf8',
    timeout: 240_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`도우미 스크립트 실패(${result.status}): ${result.stderr.slice(-2000)}`);
  }
  const lines = result.stdout.trim().split('\n');
  return JSON.parse(lines[lines.length - 1] ?? '{}') as Result;
}

describe.skipIf(!pyodideInstalled || !nodeHasJspi)('음성 인식 흉내의 파이썬 쪽(실제 Pyodide, JSPI)', () => {
  const out = run();

  it('speech_recognition.py가 /apc에 들어가 학생 코드의 import가 바로 된다(내려받기 없음)', () => {
    expect(out.duplicate).toBeUndefined();
    expect(out.files).toContain('speech_recognition.py');
    expect(out.jspi).toBe(true);
  });

  it('f044(교과서 기본 실습)가 파일 그대로 돌고 화면이 답한 글자가 인식 결과가 된다', () => {
    const step = out.steps.f044_ok;
    expect(step.errorType).toBeUndefined();
    expect(step.stdout).toContain('말씀하세요. (5초 이내)');
    expect(step.stdout).toContain('인식된 내용: 안녕하세요');
    // phrase_time_limit=5가 화면 요청에 담긴다
    expect(out.requests.filter((request) => request.kind === 'speech.listen')[0]).toMatchObject({
      payload: { phraseTimeLimit: 5, language: 'ko-KR' },
    });
  });

  it('못 알아들으면 UnknownValueError, 권한·네트워크 문제면 RequestError가 원본 코드의 except 자리에서 잡힌다', () => {
    expect(out.steps.f044_unknown.errorType).toBeUndefined();
    expect(out.steps.f044_unknown.stdout).toContain('음성을 인식할 수 없습니다.');
    expect(out.steps.f044_request.errorType).toBeUndefined();
    expect(out.steps.f044_request.stdout).toContain('서버 요청 실패.');
  });

  it('f045(심화 실습)의 키워드 반복이 시작 → 정지 → 종료로 끝난다', () => {
    const step = out.steps.f045_keywords;
    expect(step.errorType).toBeUndefined();
    expect(step.stdout).toContain('감지된 키워드: 시작');
    expect(step.stdout).toContain('프로그램이 실행됩니다.');
    expect(step.stdout).toContain('프로그램이 일시 정지되었습니다.');
    expect(step.stdout).toContain('프로그램을 종료합니다.');
    expect(step.leftoverReplies).toBe(0);
  });

  it('timeout을 주면 원본처럼 WaitTimeoutError가 난다', () => {
    expect(out.steps.timeout.errorType).toBe('WaitTimeoutError');
  });

  it('마이크 이름 목록·adjust_for_ambient_noise·show_all은 되고, 다른 인식기는 한국어로 까닭을 알려 준다', () => {
    const value = out.steps.extras.value as [number, string, string, string];
    expect(out.steps.extras.errorType).toBeUndefined();
    expect(value[0]).toBe(1);
    expect(value[1]).toBe('테스트 문장');
    expect(value[2]).toContain('recognize_google');
    expect(value[3]).toBe('text');
  });

  it('한국어가 아닌 language로 부르면 한 번만 알려 주고 글자는 그대로 돌려준다', () => {
    expect(out.steps.language_notice.value).toEqual(['hello', 'hello']);
    expect(out.notices.filter((text) => text.includes("language='en-US'")).length).toBe(1);
  });

  it('제한 모드(JSPI 없음)에서는 실행 전에 적어 둔 문장을 쓰고, 비어 있으면 UnknownValueError', () => {
    expect(out.steps.limited.errorType).toBeUndefined();
    expect(out.steps.limited.stdout).toContain('인식된 내용: 미리 적어 둔 문장');
    expect(out.steps.limited_empty.stdout).toContain('음성을 인식할 수 없습니다.');
    expect(out.notices.some((text) => text.includes('실행 중에 말을 받을 수 없어서'))).toBe(true);
  });

  it('동기 진입점(reset_for_run)에서 이 모듈이 양보를 시도하지 않는다(PROGRESS 미해결 25번)', () => {
    expect(out.syncEntrypointReset).toBe('ok');
    expect(out.notices.filter((text) => text.includes('초기화 중 오류'))).toEqual([]);
  });
});
