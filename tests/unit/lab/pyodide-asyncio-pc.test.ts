// 컴퓨터 쪽 실습실(영상처리·4단원 컴퓨터 칸·개발용)의 asyncio(src/lab/python/apc_asyncio.py — 판 1.2.0, PROGRESS 미해결 223)를 Node.js의 실제 Pyodide 314.0.7(JSPI)로 본다.
// 전에는 학생 코드의 asyncio가 진짜 asyncio 그대로라 `asyncio.run` + `while True: … await asyncio.sleep(0.3)` 반복은 [정지]가 1초 안에 먹지 않아
// "계산만 하는 반복문" 안내와 함께 파이썬을 다시 시작했다(실사이트 1.1.5 — [정지] 뒤 1,063ms에 killed). 같은 원리의 가상 보드 쪽은 판 1.1.5(C82).
// 단계는 tests/unit/lab/helpers/pyodide-asyncio-pc-run.mjs(영상처리 실습실 워커와 같은 파일·차례). [정지]는 진행(학생 stdout)으로 누른다(C74 ②).
// 정지 시간의 기준은 제품의 정지 유예(STOP_GRACE_MS 1초 — 넘으면 화면이 파이썬을 다시 시작한다).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { STOP_GRACE_MS } from '../../../src/lab/runtime/config.ts';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'tests', 'unit', 'lab', 'helpers', 'pyodide-asyncio-pc-run.mjs');

const nodeJspi = spawnSync(process.execPath, ['--experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
  encoding: 'utf8',
  timeout: 20_000,
});
const nodeHasJspi = nodeJspi.status === 0 && nodeJspi.stdout === 'function';
const pyodideInstalled = fs.existsSync(path.join(ROOT, 'node_modules', 'pyodide', 'pyodide.mjs'));

interface StepRecord {
  value?: unknown;
  errorType?: string;
  errorMessage?: string;
  stopped: boolean;
  ms: number;
  stopLatencyMs?: number;
  stdout: string;
  stdoutAfter: string;
  stderr: string;
  escaped: string[];
  shims: { installed: string[]; failures: string[][] };
}

interface RunOutput {
  jspi: boolean;
  labHasBoard: boolean;
  steps: Record<string, StepRecord>;
  escaped: string[];
  notices: string[];
}

describe.skipIf(!pyodideInstalled || !nodeHasJspi)('컴퓨터 쪽 asyncio — 학생 코드에만 [정지]를 아는 asyncio(실제 Pyodide, JSPI — 미해결 223)', () => {
  let out: RunOutput;
  beforeAll(() => {
    const result = spawnSync(process.execPath, ['--experimental-wasm-jspi', SCRIPT, ROOT], { encoding: 'utf8', timeout: 240_000, cwd: ROOT });
    expect(result.status, result.stderr).toBe(0);
    const lines = result.stdout.trim().split('\n');
    out = JSON.parse(lines[lines.length - 1] ?? '{}') as RunOutput;
  }, 280_000);
  const stepOf = (name: string): StepRecord => {
    const record = out.steps[name];
    expect(record, `단계 ${name}`).toBeDefined();
    return record as StepRecord;
  };
  const expectStoppedQuietly = (record: StepRecord) => {
    expect(record.errorType).toBe('KeyboardInterrupt');
    expect(record.errorMessage).toBe('KeyboardInterrupt: [정지] 단추로 멈췄어요.');
    expect(record.stopped).toBe(true);
    expect(record.stopLatencyMs).toBeDefined();
    expect(record.stopLatencyMs!).toBeLessThan(STOP_GRACE_MS);
    expect(record.stderr).not.toMatch(/Unhandled exception|never retrieved|Traceback/u);
    expect(record.escaped.every((entry) => entry.endsWith('KeyboardInterrupt'))).toBe(true);
  };

  it('영상처리 실습실 그대로 준비된다(가상 보드 파일 없음, 흉내 설치 실패 없음 — asyncio 흉내가 설치됨)', () => {
    expect(out.jspi).toBe(true);
    expect(out.labHasBoard).toBe(false);
    const first = stepOf('repro_223');
    expect(first.shims.failures).toEqual([]);
    expect(first.shims.installed).toContain('asyncio');
    expect(out.notices).toEqual([]);
  });

  it('미해결 223 재현 코드(asyncio.run + while True: await asyncio.sleep(0.3))가 [정지]로 1초 안에 KeyboardInterrupt — 다시 시작 없음, 끝난 뒤 더 돌지 않음', () => {
    const record = stepOf('repro_223');
    expectStoppedQuietly(record);
    expect(record.stdout).toBe('tick 1\ntick 2\n');
    expect(record.stdoutAfter).toBe('');
  });

  it('맨 바깥 await 반복·Event만 기다림·Queue만 기다림·run_forever()도 [정지]가 곧바로 먹는다', () => {
    for (const name of ['top_level_await_loop', 'event_wait_stop', 'queue_wait_stop', 'run_forever_stop_button']) {
      expectStoppedQuietly(stepOf(name));
    }
  });

  it('작업 여럿(create_task·get_running_loop().create_task)이 함께 자다가 [정지] — 트레이스백 없이 멈추고 실행이 끝난 뒤 뒤에서 돌지 않는다', () => {
    const record = stepOf('stop_many_tasks');
    expectStoppedQuietly(record);
    expect(record.stdout).toMatch(/가/u);
    expect(record.stdout).toMatch(/나/u);
    expect(record.stdoutAfter).toBe('');
  });

  it('[정지] 뒤 다시 [실행]: gather·Queue·wait_for(시간 초과)·timeout이 진짜와 같게 돈다', () => {
    const record = stepOf('gather_queue_ok');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual([[0, 10, 20, 30, 40], 'timeout']);
    expect(stepOf('run_again').value).toBe('again');
  });

  it('asyncio.run이 끝나면 남은 작업을 멈추고 마무리(finally)까지 기다린다 — 진짜 파이썬처럼, 실행이 끝난 뒤 더 돌지 않는다', () => {
    const record = stepOf('leftover_cancelled');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual([['a:멈춤', 'b:멈춤'], true]);
  });

  it('gather가 만든 자식도 남은 작업이다 — 예외로 끝난 run이 남은 자식을 멈추고 마무리를 기다린 뒤 예외를 낸다(CPython과 같음, 판 1.2.1 — 검토 C1)', () => {
    const record = stepOf('gather_child_leak');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual([['tick-fin', 'VE'], true, 1]);
    expect(record.stdoutAfter).toBe('');
    expect(record.stderr).toBe('');
  });

  it('맨 바깥 asyncio.run(asyncio.gather(…))·맨 바깥 await gather의 남은 자식도 실행이 끝나면 멈춰 다음 실행 콘솔에 섞이지 않는다(검토 C1)', () => {
    const record = stepOf('top_level_gather_leak');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toBe('done');
    expect(record.stdout).toMatch(/R\n/u);
    expect(record.stdout).toMatch(/G\n/u);
    expect(record.stdoutAfter).toBe('');
    expect(record.stderr).toBe('');
    const next = stepOf('after_leaks');
    expect(next.stdout).toBe('다음 실행\n다음 실행 끝\n');
    expect(next.stdoutAfter).toBe('');
  });

  it('main이 예외로 끝나면 남은 작업의 마무리(finally)가 먼저 돌고 예외가 except에 닿는다(CPython: bg-fin → KE, 검토 C2)', () => {
    const record = stepOf('main_raises_order');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual(['bg-fin', 'KE']);
  });

  it('루프·이름이 PC와 같다: close 뒤 is_closed·"Event loop is closed", new_event_loop는 새 루프, AbstractEventLoop, 코루틴 안 asyncio.run은 RuntimeError, all_tasks는 2(검토 C3)', () => {
    const record = stepOf('loop_like_pc');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual([
      'a',
      'b',
      'c',
      true,
      false,
      false,
      true,
      'Event loop is closed',
      'asyncio.run() cannot be called from a running event loop',
      2,
    ]);
    expect(record.stderr).toBe('');
  });

  it('loop.run_forever()는 loop.stop()까지 기다린다(Pyodide WebLoop는 곧바로 돌아왔다)', () => {
    const record = stepOf('run_forever_until_stop');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toBe(true);
  });

  it('이름은 진짜 asyncio 그대로이고(sleep·run만 사이트판), 사이트 모듈은 진짜를·작업 폴더의 내 모듈은 학생용을 받는다', () => {
    const names = stepOf('names_same_as_real');
    expect(names.errorType, names.errorMessage).toBeUndefined();
    expect(names.value).toEqual([true, 'asyncio', true, true, true, true, true, true, true, true, true, true, true, true]);
    expect(stepOf('who_gets_which').value).toEqual([true, true]);
  });

  it('sleep의 값 규칙과 asyncio.run(main) 실수의 오류는 진짜와 같다', () => {
    const rules = stepOf('sleep_rules');
    expect(rules.errorType, rules.errorMessage).toBeUndefined();
    expect(rules.value).toEqual(['neg', 'zero', 'short', true, true, "TypeError: '<=' not supported between instances of 'str' and 'int'"]);
    const notCoroutine = stepOf('run_not_coroutine');
    expect(notCoroutine.errorType).toBe('TypeError');
    expect(notCoroutine.errorMessage).toBe('TypeError: An asyncio.Future, a coroutine or an awaitable is required');
  });

  it('[정지]가 아닌 작업 예외는 진짜처럼 콘솔(stderr)에 남고, 학생이 정한 예외 처리기는 그 예외를 받는다', () => {
    const printed = stepOf('task_error_printed');
    expect(printed.value).toBe('done');
    expect(printed.stderr).toMatch(/Unhandled exception in event loop/u);
    expect(printed.stderr).toMatch(/ValueError: 보기 오류/u);
    expect(stepOf('user_exception_handler').value).toEqual(['ValueError']);
  });

  it('조절 패널 값은 await asyncio.sleep 뒤에도 전역 변수에 들어간다(time.sleep과 같은 입력 확인 지점)', () => {
    const record = stepOf('params_in_asyncio_loop');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual([7, 7, 7, 7]);
  });

  it('제한 모드: asyncio.run은 기다릴 수 없다고 한국어로 알리고, 맨 바깥 await sleep은 그대로 된다', () => {
    const run = stepOf('limited_run');
    expect(run.errorType).toBe('RuntimeError');
    expect(run.errorMessage).toMatch(/JSPI\(파이썬 기다리기 기능\)가 없어서/u);
    expect(stepOf('limited_top_level_sleep').value).toBe('slept');
  });
});
