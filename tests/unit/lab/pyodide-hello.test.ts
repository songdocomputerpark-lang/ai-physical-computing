// 흉내 모듈 폴더 규약의 파이썬 쪽(src/lab/modules/hello/apc_hello.py)을 Node.js의 실제 Pyodide 314.0.7로 검사한다(src/lab/README.md 4절, PD-14).
// JSPI는 --experimental-wasm-jspi로 켜서 따로 띄운다(tests/unit/lab/helpers/pyodide-hello-run.mjs). 새 모듈은 이 파일과 도우미를 복사해 쓴다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'tests', 'unit', 'lab', 'helpers', 'pyodide-hello-run.mjs');

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
  events: number;
}

interface Result {
  jspi: boolean;
  files: string[];
  duplicate?: string;
  shimTable: string;
  duplicateShim: string;
  steps: Record<string, StepRecord>;
  events: { kind: string; payload: unknown }[];
  notices: string[];
  requests: { kind: string; payload: unknown }[];
  syncEntrypointReset: string;
  leftoverClicks: unknown[];
  shimFailure: { installed?: string[]; failures?: string[][]; thrown?: string };
  shimFailureCleared: string[][];
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

describe.skipIf(!pyodideInstalled || !nodeHasJspi)('hello 모듈의 파이썬 쪽(실제 Pyodide, JSPI)', () => {
  const out = run();

  it('붙박이와 모듈 폴더의 .py가 겹치지 않고 /apc에 모두 들어간다', () => {
    expect(out.duplicate).toBeUndefined();
    expect(out.files).toEqual(expect.arrayContaining(['apc_runtime.py', 'apc_shims.py', 'apc_cv2.py', 'apc_hello.py']));
    expect(out.jspi).toBe(true);
  });

  it('흉내 모듈 표 등록: 붙박이 cv2가 남고 같은 패키지의 다른 이름은 오류', () => {
    expect(JSON.parse(out.shimTable)).toMatchObject({ cv2: 'apc_cv2' });
    expect(out.duplicateShim).toMatch(/겹쳐요/u);
  });

  it('greet: 요청 → 화면 답을 돌려준다(대기 지점)', () => {
    expect(out.steps.greet).toMatchObject({ value: '안녕, 세계!' });
    expect(out.steps.greet_default).toMatchObject({ value: '안녕, 친구!' });
    expect(out.requests.filter((request) => request.kind === 'hello.greet').map((request) => request.payload)).toEqual([{ name: '세계' }, { name: '' }]);
  });

  it('wave: 답을 기다리지 않는 이벤트가 화면에 간다', () => {
    expect(out.steps.wave).toMatchObject({ value: 'done', events: 2 });
    expect(out.events.filter((event) => event.kind === 'hello.wave').map((event) => event.payload)).toEqual([{ count: 2 }, { count: 1 }]);
  });

  it('name·clicks: 화면 값(get)과 쌓인 값(poll)을 읽고, 실행 전에 쌓인 값은 실행 시작 때(bridge.beginRun + 초기화 함수) 버려진다', () => {
    expect(out.steps.name).toMatchObject({ value: ['민수', '민수'] });
    expect(out.steps.name_empty).toMatchObject({ value: '기본' });
    expect(out.steps.clicks).toMatchObject({ value: [2, 3] });
  });

  it('틱 훅이 입력 확인 지점마다 한 번씩 불리고(같은 함수는 한 번만 등록), 훅 오류는 알림으로만 남는다', () => {
    expect(out.steps.tick_hook).toMatchObject({ value: 3 });
    expect(out.notices.filter((text) => text.includes('훅 오류')).length).toBeGreaterThanOrEqual(3);
  });

  it('흉내 모듈 하나의 설치가 실패해도 예외를 내지 않고 나머지를 설치하며, 실패는 한 줄 까닭으로 남긴다(Phase 5 검토 중요 4)', () => {
    expect(out.shimFailure.thrown).toBeUndefined();
    expect(out.shimFailure.installed).toEqual(expect.arrayContaining(['zz_ok_pkg']));
    expect(out.shimFailure.installed).not.toContain('zz_fake_pkg');
    expect(out.shimFailure.failures).toEqual([['zz_fake_pkg', 'ImportError: 풀려만 있고 아직 불러오지 못했어요']]);
    expect(out.shimFailureCleared).toEqual([]);
  });

  it('동기 진입점(reset_for_run)에서 모듈 초기화가 양보를 시도하지 않는다(PROGRESS 미해결 25번)', () => {
    expect(out.syncEntrypointReset).toBe('ok');
    expect(out.leftoverClicks).toEqual([]);
    expect(out.notices.filter((text) => text.includes('초기화 중 오류'))).toEqual([]);
  });
});
