// 컴퓨터 쪽 시리얼 흉내(src/lab/modules/serial-pc/serial.py)를 **실제 Pyodide 314.0.7**로 검사한다(P4-02, PD-14).
// 얼개는 tests/unit/lab/pyodide-hello.test.ts와 같다(JSPI는 --experimental-wasm-jspi로 따로 띄운다).
//
// 가장 중요한 검사: **원본 f084(examples/vision/u3/3-1-2-uart-key-send.py)를 한 글자도 고치지 않고** 돌려
// a·b가 시리얼로 나가고 q로 끝나는지 본다(PLAN §8.4 P4-02 완료 기준). 나머지는 pyserial 3.5와 같은 사용법인지 본다
// (str을 쓰면 TypeError, 닫힌 포트는 "Attempting to use a port that is not open", timeout 0의 readline).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'tests', 'unit', 'bridge-serial', 'helpers', 'pyodide-serial-run.mjs');

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
  traceback?: string;
  stdout: string;
  sent?: { bytes: number[]; baud: number }[];
  control?: string[];
}

interface Result {
  jspi: boolean;
  files: string[];
  duplicate?: string;
  steps: Record<string, StepRecord>;
  sent: { bytes: number[]; baud: number }[];
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

const decode = (bytes: number[]): string => Buffer.from(bytes).toString('utf8');

describe.skipIf(!pyodideInstalled || !nodeHasJspi)('컴퓨터 쪽 시리얼 흉내(실제 Pyodide, JSPI)', () => {
  const out = run();

  it('serial.py가 /apc에 들어가고 이름이 겹치지 않는다', () => {
    expect(out.duplicate).toBeUndefined();
    expect(out.files).toEqual(expect.arrayContaining(['apc_runtime.py', 'serial.py']));
    expect(out.jspi).toBe(true);
  });

  it('원본 f084가 한 글자도 고치지 않고 돈다 — a·b가 나가고 q로 끝난다', () => {
    const step = out.steps.f084_original!;
    expect(step.errorType).toBeUndefined();
    expect((step.sent ?? []).map((item) => decode(item.bytes))).toEqual(['a', 'b']);
    expect((step.sent ?? []).every((item) => item.baud === 115_200)).toBe(true);
    // 원본이 print로 남기는 안내가 그대로 나온다(줄 번호·글자 그대로)
    expect(step.stdout).toContain('a 문자를 시리얼로 전송했습니다.');
    expect(step.stdout).toContain('프로그램을 종료합니다.');
  });

  it('포트를 열고 쓰면 보낸 바이트 수를 돌려주고, 속도가 그대로 실린다', () => {
    expect(out.steps.open_write!.value).toEqual([true, 'COM10', 'ESP32-LAB', 115_200, 2]);
    const last = out.sent.at(-1);
    expect(last).toBeDefined();
  });

  it('포트 이름은 쓰지 않는다는 안내가 콘솔에 한 번 나온다(§7.6)', () => {
    expect(out.notices.join('\n')).toMatch(/포트 이름\(COM10\)/u);
  });

  it('str을 쓰면 진짜 pyserial과 같은 TypeError', () => {
    expect(out.steps.write_str!.errorType).toBe('TypeError');
    expect(out.steps.write_str!.errorMessage).toContain('unicode strings are not supported, please encode to bytes');
  });

  it('닫은 포트에 쓰면 SerialException(Attempting to use a port that is not open)', () => {
    expect(out.steps.write_closed!.errorType).toBe('PortNotOpenError');
    expect(out.steps.write_closed!.errorMessage).toContain('Attempting to use a port that is not open');
  });

  it('timeout 0이면 줄바꿈이 없어도 지금까지 온 바이트를 준다(§8.4 설계 메모 ④)', () => {
    const value = out.steps.timeout_zero!.value as [number, number[], number[]];
    expect(value[0]).toBe(2);
    expect(value[1]).toEqual([...Buffer.from('hi')]);
    // 더 온 것이 없으면 빈 바이트
    expect(value[2]).toEqual([]);
  });

  it('timeout 0 + read(n)은 있는 만큼만 주고 기다리지 않는다', () => {
    const value = out.steps.read_partial!.value as [number[], number[]];
    expect(Buffer.from(value[0]).toString()).toBe('ab');
    expect(value[1]).toEqual([]);
    expect(out.steps.read_partial!.ms).toBeLessThan(3000);
  });

  it('줄바꿈이 오면 readline이 줄 끝까지 준다', () => {
    expect(Buffer.from(out.steps.readline_full!.value as number[]).toString()).toBe('hello\n');
  });

  it('in_waiting·reset_input_buffer가 받을 칸을 비운다', () => {
    const value = out.steps.reset_input!.value as [number, number, number[]];
    expect(value[0]).toBe(3);
    expect(value[1]).toBe(0);
    expect(value[2]).toEqual([]);
  });

  it('with 문으로 열고 나가면서 닫는다', () => {
    expect(out.steps.with_block!.value).toEqual([true, false]);
  });

  it('serial.tools.list_ports.comports()가 두 가지 import 방법 모두로 된다', () => {
    const value = out.steps.list_ports!.value as [number, string, string, string, string];
    expect(value[0]).toBe(1);
    expect(value[1]).toBe('ESP32-LAB');
    expect(value[2]).toContain('ESP32 실습실');
    expect(value[3]).toContain('ESP32-LAB - ');
    expect(value[4]).toBe('ESP32-LAB');
  });

  it('ESP32 실습실 탭이 없으면 SerialException + 한국어 안내(§8.4 설계 메모 ③)', () => {
    expect(out.steps.open_no_peer!.errorType).toBe('SerialException');
    expect(out.steps.open_no_peer!.errorMessage).toContain('ESP32 실습실 탭을 찾지 못했어요');
    // 오류 사전이 종류로 찾을 수 있게 트레이스백에 serial.SerialException으로 나온다
    expect(out.steps.open_no_peer!.traceback).toContain('SerialException');
  });

  it('close()가 화면에 닫기를 알린다', () => {
    expect(out.steps.close_event!.control).toEqual(['close']);
    expect(out.steps.close_event!.value).toBe(false);
  });
});
