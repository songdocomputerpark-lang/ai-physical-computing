// 가상 ESP32 보드의 파이썬 쪽을 Node의 실제 Pyodide로 돌리는 테스트 도구(병렬 제작 준비 2026-09-17, src/lab/README.md 7.9).
// 공유 도우미 스크립트 helpers/pyodide-board-run.mjs를 JSPI를 켠 별도 프로세스로 띄워 마지막 줄의 JSON을 읽는다.
//
//   import { boardPyodideReady, runBoardSteps, stepOf } from './helpers/pyodide-board.ts';
//   describe.skipIf(!boardPyodideReady)('버저 부품의 파이썬 쪽', () => {
//     const out = runBoardSteps('tests/unit/lab/helpers/board-steps/buzzer.mjs');
//     it('…', () => expect(stepOf(out, 'buzzer_tone').value).toEqual(…));
//   });
//
// 단계 파일은 tests/unit/lab/helpers/board-steps/<부품 또는 기능>.mjs에 새로 만든다(본보기: extension-points.mjs). 공유 스크립트는 고치지 않는다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const REPO_ROOT = process.cwd();
export const BOARD_RUN_SCRIPT = path.join(REPO_ROOT, 'tests', 'unit', 'lab', 'helpers', 'pyodide-board-run.mjs');

const nodeJspi = spawnSync(process.execPath, ['--experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
  encoding: 'utf8',
  timeout: 20_000,
});
/** 이 Node가 JSPI를 켤 수 있는지 */
export const nodeHasJspi = nodeJspi.status === 0 && nodeJspi.stdout === 'function';
/** devDependency pyodide가 설치됐는지 */
export const pyodideInstalled = fs.existsSync(path.join(REPO_ROOT, 'node_modules', 'pyodide', 'pyodide.mjs'));
/** 둘 다 되면 true — describe.skipIf(!boardPyodideReady)로 쓴다 */
export const boardPyodideReady = nodeHasJspi && pyodideInstalled;

export interface BoardPinEntry {
  id: number;
  mode?: string | null;
  pull?: string | null;
  out: number;
  level: number;
  driven: boolean;
  irq: boolean;
  duty?: number;
  freq?: number;
}

export interface BoardStateEvent {
  reason: string;
  phase: string;
  seq: number;
  t_us: number;
  pins: BoardPinEntry[];
  timers: number;
}

export interface BoardDeviceEventRecord {
  v?: number;
  id?: string;
  part?: string;
  state?: unknown;
}

export interface BoardStepRecord {
  ms: number;
  /** 코드 마지막 식의 값(파이썬 → JS, dict는 객체) */
  value?: unknown;
  errorType?: string;
  errorMessage?: string;
  stdout: string;
  stderr: string;
  /** 이 단계의 board.state 이벤트 */
  events: BoardStateEvent[];
  /** 이 단계의 board.device 이벤트({mark}는 빠짐) */
  devices?: BoardDeviceEventRecord[];
  /** 콘솔 안내(apc_runtime.notice) */
  notices: string[];
  idleStartedMs?: number;
}

export interface BoardRunResult {
  jspi: boolean;
  files: string[];
  folders: string[];
  shims: Record<string, string>;
  duplicate?: string;
  steps: Record<string, BoardStepRecord>;
  stderr?: string;
  syncEntrypointReset?: string;
  leftoverInputs?: unknown[];
}

/** 도우미 스크립트를 띄운다(extra: '--limited' 또는 '--steps=<파일>') */
export function runBoard(extra: readonly string[] = []): BoardRunResult {
  const result = spawnSync(process.execPath, ['--experimental-wasm-jspi', BOARD_RUN_SCRIPT, REPO_ROOT, ...extra], {
    encoding: 'utf8',
    timeout: 240_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`도우미 스크립트 실패(${result.status}): ${result.stderr.slice(-2000)}`);
  }
  const lines = result.stdout.trim().split('\n');
  const last = lines[lines.length - 1] ?? '{}';
  try {
    return JSON.parse(last) as BoardRunResult;
  } catch (error) {
    // 글이 중간에서 끊겼으면 도우미 스크립트가 결과를 다 내보내기 전에 끝난 것이다(tests/unit/helpers/finish-json.mjs 머리말 참고).
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`도우미 스크립트의 결과 JSON을 읽지 못했어요(${last.length}자, ${reason}). 마지막 40자: ${JSON.stringify(last.slice(-40))}`);
  }
}

/** 단계 파일(저장소 뿌리 기준 경로) 하나만 돌린다. limited: true면 JSPI 없는 브라우저처럼(제한 모드 — 블록 전용 호환 모드 시험) */
export function runBoardSteps(stepsFile: string, options: { readonly limited?: boolean } = {}): BoardRunResult {
  if (!fs.existsSync(path.resolve(REPO_ROOT, stepsFile))) {
    throw new Error(`단계 파일이 없어요: ${stepsFile}`);
  }
  return runBoard([...(options.limited ? ['--limited'] : []), `--steps=${stepsFile}`]);
}

/** 이름으로 단계 기록을 꺼낸다(없으면 실패 메시지) */
export function stepOf(result: BoardRunResult, name: string): BoardStepRecord {
  const found = result.steps[name];
  if (!found) {
    throw new Error(`단계 ${name}이(가) 없어요. 있는 단계: ${Object.keys(result.steps).join(', ')}`);
  }
  return found;
}
