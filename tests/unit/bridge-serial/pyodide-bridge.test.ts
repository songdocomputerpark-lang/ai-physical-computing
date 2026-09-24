// 새 예제용 통신 모듈 bridge(src/lab/modules/vision-bridge/finger-count/bridge.py)를 **실제 Pyodide 314.0.7**로 검사한다(P4-08, PLAN §7.6).
// 얼개는 같은 폴더의 pyodide-serial.test.ts와 같다(JSPI는 --experimental-wasm-jspi로 따로 띄운다).
//
// 지키는 것
//  - §7.2 규칙: 끝 문자 \n 한 개(2), 값이 바뀔 때만(4), 이벤트는 같은 값도(5), 원시 바이트는 그대로(7). 이벤트는 category 'event'로 싣는다.
//  - 받을 쪽이 없으면 BridgeNoPeer, 통로를 못 열면 BridgeClosed — 오류 사전 comm-no-peer·comm-closed가 그 이름으로 풀이를 붙인다.
//  - 초기화 함수가 동기 진입점에서 양보하지 않는다(PROGRESS 미해결 25번) — 실행마다 앞 실행의 상태를 버린다.
//  - ESP32 실습실 워커(가상 보드 흉내가 있는 곳)에서는 import부터 ModuleNotFoundError(실물 MicroPython에 bridge가 없다).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'helpers', 'pyodide-bridge-run.mjs');

const nodeJspi = spawnSync(process.execPath, ['--experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
  encoding: 'utf8',
  timeout: 20_000,
});
const nodeHasJspi = nodeJspi.status === 0 && nodeJspi.stdout === 'function';
const pyodideInstalled = fs.existsSync(path.join(ROOT, 'node_modules', 'pyodide', 'pyodide.mjs'));

interface SentRecord {
  text: string;
  category: string | null;
  baud: number | null;
}

interface StepRecord {
  ms: number;
  value?: unknown;
  errorType?: string;
  errorMessage?: string;
  stdout: string;
  sent: SentRecord[];
  control?: string[];
}

interface Result {
  jspi: boolean;
  steps: Record<string, StepRecord>;
  control: string[];
  notices: string[];
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

describe.skipIf(!pyodideInstalled || !nodeHasJspi)('새 예제용 bridge 모듈(실제 Pyodide, JSPI)', () => {
  const out = run();

  it('JSPI로 기다릴 수 있다', () => {
    expect(out.jspi).toBe(true);
  });

  it('§7.2: 끝 문자 한 개, 값이 바뀔 때만, 이벤트는 늘, 바이트는 그대로', () => {
    const step = out.steps.rules!;
    expect(step.errorType).toBeUndefined();
    // send("3") 참 · 같은 값 거짓 · 끝 문자를 붙여도 같은 값 · 숫자 4 참 · 이벤트 참 · 이벤트 뒤 같은 상태 거짓 · 바이트 3개 · 바이트 뒤 같은 상태 참 · b"5"는 글자 5 · 마지막 5 · 열림
    expect(step.value).toEqual([true, false, false, true, true, false, 3, true, true, '5', true]);
    expect(step.sent).toEqual([
      { text: '3\n', category: 'state', baud: 0 },
      { text: '4\n', category: 'state', baud: 0 },
      { text: '4\n', category: 'event', baud: 0 },
      { text: 'AB\n', category: null, baud: 0 },
      { text: '4\n', category: 'state', baud: 0 },
      { text: '5\n', category: 'state', baud: 0 },
    ]);
    // 처음 열 때 어떤 통로로 가는지 한 번 알린다(통로는 코드가 아니라 [보내기] 패널에서 고른다 — §7.6)
    expect(out.notices).toContain("bridge: '같은 컴퓨터 탭' 통로로 보내요. 통로는 [보내기] 패널에서 바꿔요.");
  });

  it('receive(): 줄바꿈까지 모았다가 한 줄씩 준다(\\r\\n도 뗀다)', () => {
    expect(out.steps.receive!.value).toEqual(['OK-3', 'OK-4', null, null]);
  });

  it('실행마다 앞 실행의 상태를 버린다(초기화 함수는 동기 진입점에서 양보하지 않는다)', () => {
    const step = out.steps.reset_between_runs!;
    expect(step.errorType).toBeUndefined();
    // 앞 실행(receive)에서 남은 'half' 네 바이트도 버려져 0이다
    expect(step.value).toEqual([false, null, 0, true]);
    expect(step.sent).toEqual([{ text: '3\n', category: 'state', baud: 0 }]);
  });

  it('잘못 쓴 값은 한국어로 알린다', () => {
    expect(out.steps.send_bytes_str!.errorType).toBe('TypeError');
    expect(out.steps.send_bytes_str!.errorMessage).toContain('bridge.send("3")');
    expect(out.steps.send_bad_bytes!.errorType).toBe('TypeError');
    expect(out.steps.send_bad_bytes!.errorMessage).toContain('send_bytes');
  });

  it('받을 쪽이 없으면 BridgeNoPeer, 통로를 못 열면 BridgeClosed(오류 사전 comm-no-peer·comm-closed)', () => {
    expect(out.steps.no_peer!.errorType).toBe('BridgeNoPeer');
    expect(out.steps.no_peer!.errorMessage).toContain('ESP32 실습실 탭을 찾지 못했어요');
    expect(out.steps.no_peer_catch!.value).toEqual(['BridgeNoPeer', true]);
    expect(out.steps.closed!.errorType).toBe('BridgeClosed');
    // 화면이 까닭을 reason으로 주면 글과 상관없이 그것을 따른다(요청 2번이 반영된 뒤의 모양)
    expect(out.steps.reason_field!.errorType).toBe('BridgeNoPeer');
    expect(out.steps.unhandled!.errorType).toBe('BridgeError');
    expect(out.steps.no_peer!.sent).toEqual([]);
  });

  it('close()는 화면에 닫기를 알리고, 다시 보내면 다시 연다', () => {
    const step = out.steps.close!;
    expect(step.value).toEqual([false, true]);
    expect(step.control).toEqual(['close']);
    expect(step.sent.map((item) => item.text)).toEqual(['1\n', '1\n']);
  });

  it('ESP32 실습실(가상 보드 흉내가 있는 워커)에서는 import부터 막는다', () => {
    const value = out.steps.esp32_guard!.value as [string, string];
    expect(value[0]).toBe('bridge');
    expect(value[1]).toContain("No module named 'bridge'");
    expect(value[1]).toContain('영상처리 실습실');
  });
});
