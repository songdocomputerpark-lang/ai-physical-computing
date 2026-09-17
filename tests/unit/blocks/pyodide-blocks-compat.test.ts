// 블록 모드가 만든 코드가 Node의 실제 Pyodide 314.0.7 + 가상 보드에서 도는지(PLAN §8.3 P3-06, PD-27 블록 전용 호환 모드).
// - JSPI가 있을 때: 화면 코드(실제 보드와 같은 코드) 그대로
// - JSPI가 없을 때(--limited): 실행판 — 최상위 await로 기다리며 터치 센서·BOOT 버튼 입력과 [정지]를 받는다
// 공유 도우미(tests/unit/lab/helpers/pyodide-board.ts)를 고치지 않고 단계 파일(helpers/board-steps/blocks-compat.mjs)만 더한다(README 7.7).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chain, findPreset, numberShadow } from '../../../src/lab/blocks/presets.ts';
import { boardPyodideReady, runBoardSteps, stepOf, type BoardRunResult, type BoardStepRecord } from '../lab/helpers/pyodide-board.ts';
import { forever, nodeBlocksKit, stateOf, workspaceFrom } from './helpers/blockly-node.ts';
import { TOUCH_LED_STATE } from './helpers/programs.ts';

const STEPS = 'tests/unit/blocks/helpers/board-steps/blocks-compat.mjs';

function programs() {
  const kit = nodeBlocksKit();
  const generate = (state: Parameters<typeof workspaceFrom>[0]) => {
    const { code, execCode } = kit.generate(workspaceFrom(state));
    return { code, execCode };
  };
  return {
    blink: generate(findPreset('blink')!.state),
    boot: generate(findPreset('boot-led')!.state),
    empty: generate(findPreset('empty')!.state),
    touch: generate(TOUCH_LED_STATE),
    repeat: generate(
      stateOf(
        chain([
          {
            type: 'controls_repeat_ext',
            inputs: {
              TIMES: numberShadow(3),
              DO: { block: chain([{ type: 'apc_builtin_led_toggle' }, { type: 'apc_wait_ms', inputs: { MS: numberShadow(30) } }])! },
            },
          },
          { type: 'text_print', inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: '끝' } } } } },
        ])!,
      ),
    ),
    error: generate(
      stateOf(
        forever(
          chain([
            { type: 'apc_builtin_led', fields: { STATE: 'on' } },
            {
              type: 'apc_wait_seconds',
              inputs: { SECONDS: { block: { type: 'math_arithmetic', fields: { OP: 'DIVIDE' }, inputs: { A: numberShadow(1), B: numberShadow(0) } } } },
            },
          ]),
        ),
      ),
    ),
  };
}

/** 단계의 board.state 이벤트에서 GPIO2(내장 LED) 전압이 바뀐 차례(같은 값이 이어지면 한 번) */
function ledLevels(record: BoardStepRecord): number[] {
  const levels: number[] = [];
  for (const event of record.events) {
    const pin = event.pins.find((entry) => entry.id === 2);
    if (pin && levels[levels.length - 1] !== pin.level) {
      levels.push(pin.level);
    }
  }
  return levels;
}

function checkRun(result: BoardRunResult, limited: boolean, codes: ReturnType<typeof programs>) {
  expect(stepOf(result, 'mode').value).toBe(!limited);

  const blink = stepOf(result, 'blink');
  expect(blink.errorType).toBe('KeyboardInterrupt');
  expect(ledLevels(blink).join(',')).toMatch(/1,0,1/u);

  const touch = stepOf(result, 'touch_led');
  expect(touch.errorType).toBe('KeyboardInterrupt');
  // 누르기 전 꺼짐 → 누르는 동안 켜짐 → 떼면 꺼짐
  expect(ledLevels(touch).join(',')).toMatch(/^0,1,0$/u);
  expect(touch.ms).toBeLessThan(5_000);

  const boot = stepOf(result, 'boot_led');
  expect(boot.errorType).toBe('KeyboardInterrupt');
  expect(ledLevels(boot).join(',')).toMatch(/^0,1,0$/u);

  const repeat = stepOf(result, 'repeat_done');
  expect(repeat.errorType).toBeUndefined();
  expect(repeat.stdout).toContain('끝');
  expect(ledLevels(repeat).join(',')).toMatch(/1,0,1$/u);

  const empty = stepOf(result, 'empty');
  expect(empty.errorType).toBeUndefined();

  // 오류 줄 번호가 화면 코드의 그 줄과 같다
  const traceback = (result as BoardRunResult & { errorTraceback?: string }).errorTraceback ?? '';
  expect(traceback).toContain('ZeroDivisionError');
  const expectedLine = codes.error.code.split('\n').findIndex((line) => line.includes('sleep(1 / 0)')) + 1;
  expect(expectedLine).toBeGreaterThan(0);
  const mainLines = [...traceback.matchAll(/File "main\.py", line (\d+)/gu)].map((match) => Number(match[1]));
  expect(mainLines[mainLines.length - 1]).toBe(expectedLine);
}

describe.skipIf(!boardPyodideReady)('블록이 만든 코드를 가상 보드(실제 Pyodide)에서 돌린다', () => {
  let file = '';
  let codes: ReturnType<typeof programs>;
  let previous: string | undefined;

  beforeAll(() => {
    codes = programs();
    file = path.join(os.tmpdir(), `apc-blocks-programs-${process.pid}-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(codes), 'utf8');
    previous = process.env.APC_BLOCKS_PROGRAMS;
    process.env.APC_BLOCKS_PROGRAMS = file;
  });

  afterAll(() => {
    if (previous === undefined) {
      delete process.env.APC_BLOCKS_PROGRAMS;
    } else {
      process.env.APC_BLOCKS_PROGRAMS = previous;
    }
    fs.rmSync(file, { force: true });
  });

  it('JSPI가 있으면 화면 코드 그대로: 깜빡이기·터치 센서로 LED·BOOT 버튼·반복 횟수·오류 줄', () => {
    const result = runBoardSteps(STEPS);
    expect(result.files).toContain('apc_blocks.py');
    checkRun(result, false, codes);
  }, 240_000);

  it('JSPI가 없으면(제한 모드) 블록 전용 호환 모드 실행판이 같은 결과를 낸다', () => {
    const result = runBoardSteps(STEPS, { limited: true });
    checkRun(result, true, codes);
  }, 240_000);
});
