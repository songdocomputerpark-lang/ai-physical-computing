// 보드 콘솔 input()(src/lab/modules/board-console/) — 실물 MicroPython처럼 인자 규칙을 맞추고, 화면이 보드 콘솔을 지원하면
// 한 줄을 기다리는 동안에도 Timer 콜백이 도는지 실제 Pyodide로 확인(P3-05 구역 C). 단계는 tests/unit/board-uart/steps/console.mjs.
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf } from '../lab/helpers/pyodide-board.ts';

describe.skipIf(!boardPyodideReady)('보드 콘솔 input()(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/board-uart/steps/console.mjs');

  it('ESP32 실습실 워커의 input은 보드 콘솔판이고 인자 규칙이 MicroPython과 같다(화면 지원 전에는 러너 공통 input으로 넘긴다)', () => {
    expect(out.files).toContain('apc_board_console.py');
    const record = stepOf(out, 'console_argument_rules');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([
      'TypeError: function expected at most 1 arguments, got 2',
      "TypeError: function doesn't take keyword arguments",
      [true, false],
    ]);
  });

  it('화면이 보드 콘솔을 지원하면 input()을 기다리는 동안에도 Timer 콜백이 돈다(실물의 MICROPY_EVENT_POLL_HOOK)', () => {
    const record = stepOf(out, 'console_timer_keeps_running');
    expect(record.errorType).toBeUndefined();
    const [first, second, duringFirst] = record.value as [string, string, number];
    expect([first, second]).toEqual(['안녕', '42']);
    expect(duringFirst).toBeGreaterThanOrEqual(3);
    // 안내글은 str()로 콘솔에 찍힌다(숫자 123도)
    expect(record.stdout).toBe('이름: 123');
    // 기다리는 동안 LED가 바뀐 상태가 화면으로 나갔다
    expect(record.events.length).toBeGreaterThan(3);
  });

  it('기다리는 중 [정지]는 KeyboardInterrupt, 입력줄이 닫히면(null) EOFError', () => {
    expect(stepOf(out, 'console_stop_while_waiting').errorType).toBe('KeyboardInterrupt');
    expect(stepOf(out, 'console_cancelled').value).toBe('EOFError: 입력이 취소되었어요.');
  });

  it('원본 f076 파일 그대로: 1 → 팬 cw(duty 1023), 0 → 정지, 잘못된 입력 안내, q → 프로그램 끝', () => {
    const record = stepOf(out, 'f076_file');
    expect(record.errorType).toBeUndefined();
    expect(record.stdout).toContain('[Fan] on (CW, speed = 100)');
    expect(record.stdout).toContain('[Fan] OFF (STOP)');
    expect(record.stdout).toContain('잘못된 입력입니다.');
    expect(record.stdout.trim().endsWith('프로그램을 종료합니다.')).toBe(true);
    const duties = (record.value as [number, number][]).map(([gpio, duty]) => `${gpio}:${duty}`);
    expect(duties).toEqual(['25:0', '26:0', '25:1023', '26:0', '25:0', '26:0', '25:0', '26:0']);
  });
});
