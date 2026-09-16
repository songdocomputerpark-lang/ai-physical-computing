// 실제 Pyodide 314.0.7을 Node.js에서 띄워 파이썬 도우미(apc_runtime.py)와 다리(bridge.ts)를 검사한다(PLAN PD-14, PROGRESS 미해결 1번).
// JSPI는 V8 옵션 --experimental-wasm-jspi로 켜고 --no-experimental-wasm-jspi로 끄므로 Node를 따로 띄운다
// (tests/unit/lab/helpers/pyodide-node-run.mjs). 기본값은 Node 판마다 다르다(운영자 PC의 24.19.0은 꺼짐, CI의 24.20.0은 켜짐 —
// 2026-09-16 테스트 워크플로 실행 35040170394에서 확인). 그래서 두 경우 모두 플래그를 명시한다.
// 플래그를 모르는 Node나 pyodide 패키지가 없는 곳에서는 건너뛴다. Pyodide를 띄우는 데 2초 안팎이 걸린다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PYODIDE_VERSION, YIELD_INTERVAL_MS } from '../../../src/lab/runtime/config.ts';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'tests', 'unit', 'lab', 'helpers', 'pyodide-node-run.mjs');
const HELPER = path.join(ROOT, 'src', 'lab', 'runtime', 'apc_runtime.py');

const nodeJspi = spawnSync(process.execPath, ['--experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
  encoding: 'utf8',
  timeout: 20_000,
});
const nodeHasJspi = nodeJspi.status === 0 && nodeJspi.stdout === 'function';
const nodeNoJspi = spawnSync(process.execPath, ['--no-experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
  encoding: 'utf8',
  timeout: 20_000,
});
const nodeCanDisableJspi = nodeNoJspi.status === 0 && nodeNoJspi.stdout === 'undefined';
const pyodideInstalled = fs.existsSync(path.join(ROOT, 'node_modules', 'pyodide', 'pyodide.mjs'));

interface StepRecord {
  skipped?: string;
  ms: number;
  value?: unknown;
  errorType?: string;
  errorMessage?: string;
  stopped: boolean;
  stdout: string;
  /** 이 단계에서 약속 거부와 별개로 새어 나온 오류("exception:SystemExit"처럼 방식:종류) */
  escaped: string[];
}

interface RunOutput {
  jspiFlag: boolean;
  pyodideVersion: string;
  pythonVersion: string;
  loadMs: number;
  canRunSync: boolean;
  steps: Record<string, StepRecord>;
  escaped: string[];
  pendingRequests: number;
  noticeCount: number;
}

function runNode(flags: string[]): RunOutput {
  const result = spawnSync(process.execPath, [...flags, SCRIPT, ROOT], { encoding: 'utf8', timeout: 120_000, cwd: ROOT });
  const lines = result.stdout.trim().split('\n');
  const last = lines[lines.length - 1] ?? '';
  expect(result.status, `${result.stderr}\n${result.stdout.slice(-2000)}`).toBe(0);
  return JSON.parse(last) as RunOutput;
}

/** exit()·정지처럼 끝나는 실행은 약속 거부와 별개로 같은 종류의 오류가 한 번 새어 나온다(worker.ts가 삼키는 것) */
function expectEscaped(step: StepRecord, type: string): void {
  expect(step.escaped).toHaveLength(1);
  expect(step.escaped[0]).toMatch(new RegExp(`^(exception|rejection):${type}$`, 'u'));
}

describe('파이썬 도우미 파일', () => {
  it('양보 간격이 config.ts와 같고 time.sleep·input을 바꾸는 install()이 있다', () => {
    const source = fs.readFileSync(HELPER, 'utf8');
    expect(source).toContain(`YIELD_INTERVAL_MS = ${YIELD_INTERVAL_MS}`);
    expect(source).toContain('time.sleep = sleep');
    expect(source).toContain('builtins.input = input');
    expect(source).toContain('KeyboardInterrupt');
  });
});

describe.runIf(pyodideInstalled)('Node.js의 실제 Pyodide', () => {
  it.runIf(nodeHasJspi)(
    'JSPI 플래그를 켜면 run_sync가 돌고, 도우미의 sleep·input·request·정지·exit()가 설계대로 동작한다',
    () => {
      const out = runNode(['--experimental-wasm-jspi']);
      expect(out.jspiFlag).toBe(true);
      expect(out.pyodideVersion).toBe(PYODIDE_VERSION);
      expect(out.pythonVersion).toMatch(/^3\.14\./u);
      expect(out.canRunSync).toBe(true);
      const steps = out.steps;

      expect(steps.block_on_js_promise.value).toBe(42);
      expect(steps.block_on_js_promise.escaped).toEqual([]);

      // 정지 1단계: sleep에서 기다리다가 KeyboardInterrupt(정지 요청 뒤 곧바로)
      expect(steps.sleep_loop_stops.errorType).toBe('KeyboardInterrupt');
      expect(steps.sleep_loop_stops.stopped).toBe(true);
      expect(steps.sleep_loop_stops.ms).toBeLessThan(500);
      expectEscaped(steps.sleep_loop_stops, 'KeyboardInterrupt');

      // 짧은 sleep 20번(합 20ms)은 모아서 기다려 실제 시간이 비슷하고, 너무 오래 걸리지 않는다.
      expect(steps.sleep_coalesce.errorType).toBeUndefined();
      expect(Number(steps.sleep_coalesce.value)).toBeGreaterThanOrEqual(15);
      expect(steps.sleep_coalesce.ms).toBeLessThan(400);
      expect(steps.sleep_zero_yields.value).toBe('ok');
      expect(steps.sleep_type_error.errorType).toBe('TypeError');
      expect(steps.sleep_type_error.escaped).toEqual([]);

      // input(): 안내글이 stdout에 찍히고 화면의 답('민수')이 돌아온다.
      expect(steps.input_roundtrip.value).toBe('민수');
      expect(steps.input_roundtrip.stdout).toContain('이름: ');
      expect(steps.input_roundtrip.stdout).toContain('안녕, 민수');
      // input에서 기다리는 중에 정지하면 바로 멈춘다.
      expect(steps.input_stops.errorType).toBe('KeyboardInterrupt');
      expect(steps.input_stops.ms).toBeLessThan(500);
      expectEscaped(steps.input_stops, 'KeyboardInterrupt');
      // 화면이 거절한 요청은 파이썬 예외(JsException)로 전해진다.
      expect(steps.request_rejected.errorType).toBe('JsException');
      expect(steps.request_rejected.errorMessage).toContain('camera.read');
      expect(steps.request_rejected.escaped).toEqual([]);

      expect(steps.get_and_poll.value).toEqual([120, '기본', [113, 27], []]);
      // 학생 코드가 KeyboardInterrupt를 잡으면 새어 나오는 오류도 없다.
      expect(steps.catch_keyboard_interrupt.value).toBe('caught [정지] 버튼으로 멈췄어요.');
      expect(steps.catch_keyboard_interrupt.stopped).toBe(true);
      expect(steps.catch_keyboard_interrupt.escaped).toEqual([]);

      // exit()·sys.exit(3): SystemExit로 끝나고 뒤 줄은 실행되지 않으며, 실행기는 계속 쓸 수 있다.
      expect(steps.exit_call.errorType).toBe('SystemExit');
      expect(steps.exit_call.errorMessage).toBe('SystemExit: None');
      expect(steps.exit_call.stdout).toContain('앞');
      expect(steps.exit_call.stdout).not.toContain('뒤');
      expectEscaped(steps.exit_call, 'SystemExit');
      expect(steps.sys_exit_code.errorMessage).toBe('SystemExit: 3');
      expect(steps.still_alive.value).toBe(2);
      expect(steps.still_alive.stdout).toContain('계속');
      expect(steps.still_alive.escaped).toEqual([]);

      // 제한 모드: 출력과 sleep은 되고(브라우저가 멈춘 채) 기다리는 함수는 한국어 안내와 함께 RuntimeError
      expect(steps.limited_print.value).toBe(2);
      expect(steps.limited_print.stdout).toContain('제한 모드');
      expect(Number(steps.limited_sleep.value)).toBeGreaterThanOrEqual(15);
      expect(steps.limited_input.errorType).toBe('RuntimeError');
      expect(steps.limited_input.errorMessage).toContain('JSPI');

      expect(out.pendingRequests).toBe(0);
      expect(out.escaped).toHaveLength(4); // sleep_loop_stops, input_stops, exit_call, sys_exit_code
    },
    120_000,
  );

  it.runIf(nodeCanDisableJspi)('JSPI를 끄고(--no-experimental-wasm-jspi) 띄우면 can_run_sync가 거짓이라 제한 모드가 되고, 한 번 실행되는 코드는 그대로 돈다', () => {
    const out = runNode(['--no-experimental-wasm-jspi']);
    expect(out.jspiFlag).toBe(false);
    expect(out.canRunSync).toBe(false);
    const steps = out.steps;
    expect(steps.block_on_js_promise.errorType).toBe('RuntimeError');
    expect(steps.block_on_js_promise.errorMessage).toContain('JSPI');
    // 정지 신호로만 끝나는 코드는 제한 모드에서 끝나지 않으므로 건너뛴다(브라우저에서는 정지 2단계가 맡는다).
    expect(steps.sleep_loop_stops.skipped).toBeTruthy();
    expect(steps.input_stops.skipped).toBeTruthy();
    expect(steps.catch_keyboard_interrupt.skipped).toBeTruthy();
    expect(steps.limited_print.value).toBe(2);
    expect(steps.input_roundtrip.errorType).toBe('RuntimeError');
    expect(steps.request_rejected.errorType).toBe('RuntimeError');
    // sleep은 진짜로 기다리지만(양보 없음) 정지 요청은 못 받는다 → 브라우저에서는 정지 2단계가 맡는다.
    expect(Number(steps.limited_sleep.value)).toBeGreaterThanOrEqual(15);
    // exit()는 제한 모드에서도 같다.
    expect(steps.exit_call.errorType).toBe('SystemExit');
    expectEscaped(steps.exit_call, 'SystemExit');
    expect(steps.still_alive.value).toBe(2);
    expect(out.escaped).toHaveLength(2); // exit_call, sys_exit_code
  }, 120_000);
});
