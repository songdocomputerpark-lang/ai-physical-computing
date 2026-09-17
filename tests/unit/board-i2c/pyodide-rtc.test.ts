// machine.RTC(내장 실시간 시계)의 파이썬 쪽 — 실제 Pyodide(JSPI)로 확인. PLAN §8.3 P3-04, f051(2-1-2 기본 2).
// 단계는 tests/unit/board-i2c/steps/rtc.mjs. 값은 MicroPython v1.29.0 ports/esp32/machine_rtc.c·shared/timeutils와 같은 계산.
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf, type BoardDeviceEventRecord } from '../lab/helpers/pyodide-board.ts';

/** board.device 상태의 LCD 첫 줄 글자(Uint8Array가 JSON으로 {"0": n}이 되어 온다) */
function firstLine(record: BoardDeviceEventRecord): string {
  const codes = ((record.state ?? {}) as { codes?: Record<string, number> }).codes ?? {};
  return Array.from({ length: 16 }, (_, index) => String.fromCharCode(codes[String(index)] ?? 32))
    .join('')
    .trimEnd();
}

describe.skipIf(!boardPyodideReady)('가상 보드의 machine.RTC(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/board-i2c/steps/rtc.mjs');

  it('맞추고 읽기: 요일 칸은 쓰지 않고 계산(2025-06-21 토요일 = 5), time과 같은 시계(2000년 기준 초), sleep만큼 흐름, init 칸 순서·윤년, 넘친 시각, 사용자 메모리', () => {
    const record = stepOf(out, 'rtc_basics');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    const value = record.value as unknown[];
    const secondsSince2000 = (Date.UTC(2025, 5, 21, 11, 0, 0) - Date.UTC(2000, 0, 1)) / 1000;
    expect(value.slice(0, 7)).toEqual([true, 8, [2025, 6, 21, 5, 11, 0, 0], true, [2025, 6, 21, 11, 0, 0, 5], secondsSince2000, [11, 0, 2]]);
    // init((년, 월, 일, 시, 분, 초, _, 마이크로초)) — 2024-02-29 23:59:58.9 → 1.2초 뒤 2024-03-01(금 = 4) 00:00:00
    expect(value[7]).toEqual([[2024, 2, 29, 3, 23, 59, 58], true]);
    expect(value[8]).toEqual([2024, 3, 1, 4, 0, 0, 0]);
    // 25시 61분 → 다음 날 02:01(2025-01-02 목 = 3)
    expect(value[9]).toEqual([2025, 1, 2, 3, 2, 1, 0]);
    expect(value[10]).toEqual([{}, null, { 0: 104, 1: 101, 2: 108, 3: 108, 4: 111 }, null, 2048]);
    expect(record.notices).toEqual([]);
  });

  it('인자 오류는 MicroPython과 같은 종류·문구, 13월은 다음 해 1월(실물과 같음)·0월은 안내', () => {
    const record = stepOf(out, 'rtc_errors');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual([
      ['TypeError', 'function takes 0 positional arguments but 1 were given'],
      ['TypeError', "object 'int' isn't a tuple or list"],
      ['ValueError', 'requested length 8 but object has length 3'],
      ['TypeError', "can't convert float to int"],
      ['TypeError', 'function expected at most 2 arguments, got 3'],
      ['TypeError', "function doesn't take keyword arguments"],
      ['TypeError', 'function takes 2 positional arguments but 1 were given'],
      ['ValueError', 'buffer too long'],
      ['TypeError', 'object with buffer protocol required'],
      ['ok', 'None'],
      [2026, 1, 1, 3, 0, 0, 0],
      2025,
    ]);
    expect(record.notices).toEqual([expect.stringContaining('13월은 다음 해 1월로 계산돼요'), expect.stringContaining('표 밖의 값을 읽어 엉뚱한 날짜')]);
  });

  it('다음 [실행]은 보드를 새로 켠 것: 맞춘 시각(2025년)·RTC 메모리가 처음으로 돌아가고 이 컴퓨터의 현지 시각에서 출발', () => {
    const record = stepOf(out, 'rtc_next_run');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    const [memory, rtcYear, timeYear] = record.value as [unknown, number, number];
    expect(memory).toEqual({});
    const thisYear = new Date().getFullYear();
    expect([rtcYear, timeYear]).toEqual([thisYear, thisYear]);
  });

  it('f051 교과서 코드 그대로: LCD에 Time: 11:00:00부터 1초마다 올라가고 [정지]로 멈춘다', () => {
    const record = stepOf(out, 'f051_lcd_clock');
    expect(record.errorType).toBe('KeyboardInterrupt');
    expect(record.notices).toEqual([]);
    const shown = (record.devices ?? []).map(firstLine).filter((text) => /^Time: \d\d:\d\d:\d\d$/u.test(text));
    expect(shown[0]).toBe('Time: 11:00:00');
    expect(shown).toContain('Time: 11:00:01');
    const seconds = shown.map((text) => Number(text.slice(-2)));
    expect(seconds).toEqual([...seconds].sort((a, b) => a - b));
    expect(seconds.at(-1)).toBeLessThanOrEqual(4);
  });
});
