// 가상 보드 부품 단계 확장 자리(병렬 제작 준비 2026-09-17)의 파이썬 쪽 — PWM·아날로그 입력·부품 장치·아직 없는 모듈·보드 라이브러리 폴더.
// 단계는 tests/unit/lab/helpers/board-steps/extension-points.mjs, 실행은 Node의 실제 Pyodide(JSPI) — 부품 구역 테스트의 본보기(src/lab/README.md 7.9).
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf } from './helpers/pyodide-board.ts';

describe.skipIf(!boardPyodideReady)('가상 ESP32 보드 — 부품 단계 확장 자리(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/lab/helpers/board-steps/extension-points.mjs');

  it('단계 파일만 돌고 ESP32 실습실과 같은 파일로 준비된다', () => {
    expect(out.jspi).toBe(true);
    expect(out.duplicate).toBeUndefined();
    expect(out.folders).toContain('board');
    expect(Object.keys(out.steps).sort()).toEqual(['analog_inputs', 'device_core', 'device_new_run', 'not_yet_and_board_lib', 'pwm_core']);
  });

  it('PWM 확장 자리: set_pwm이 핀 항목에 mode pwm·duty·freq를 싣고, 켜진 비율이 있으면 1·평균 전압, Pin(…, 인자)로 다시 정하면 끊긴다', () => {
    const record = stepOf(out, 'pwm_core');
    expect(record.errorType).toBeUndefined();
    const [a, b, level, mv, c, d, d2, e] = record.value as unknown[];
    expect(a).toEqual([0.5, 262]);
    expect(b).toEqual([0.25, 262]);
    expect(level).toBe(1);
    expect(mv).toBeCloseTo(825, 5);
    expect(c).toBeNull();
    expect(d).toBe(0);
    expect(d2).toEqual([1, 1000]);
    expect(e).toBeNull();
    const pwmPin = record.events.flatMap((event) => event.pins).find((pin) => pin.id === 15 && pin.mode === 'pwm');
    expect(pwmPin).toMatchObject({ mode: 'pwm', duty: 0.5, freq: 262, driven: true, level: 1 });
    // 다시 정한 뒤 마지막 상태는 보통 출력 핀
    expect(record.events.at(-1)?.pins.find((pin) => pin.id === 15)).toMatchObject({ mode: 'out' });
    expect(record.events.at(-1)?.pins.find((pin) => pin.id === 15)?.duty).toBeUndefined();
  });

  it('아날로그 입력 자리: 화면의 {mv}가 read_millivolts 값이 되고, 디지털로는 1.65V 문턱, 실행 중 변화도 들어온다', () => {
    const record = stepOf(out, 'analog_inputs');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([2381, 1, 0, 100, 0, 0, 3300]);
  });

  it('부품 장치 자리: factory는 실행마다 한 번, 장치 상태는 합쳐져 최신 값으로, 화면 조작은 on_device_input으로 받는다', () => {
    const record = stepOf(out, 'device_core');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([['f1'], 1, 1, [{ text: 'hi' }], { sig: 5 }]);
    const devices = record.devices ?? [];
    expect(devices.length).toBeGreaterThan(0);
    expect(devices.length).toBeLessThan(5);
    expect(devices.at(-1)).toEqual({ v: 1, id: 'f1', part: 'fake-part', state: { n: 4, lines: ['Hello', '4'] } });
    // 다음 실행은 장치를 새로 만들고, 실행 전에 보낸 조작은 버린다
    expect(stepOf(out, 'device_new_run').value).toEqual([1, []]);
  });

  it('아직 없는 모듈은 한국어 안내가 든 ModuleNotFoundError, 보드 라이브러리 폴더(/board/lib)의 파일은 import되고 그 안의 time은 MicroPython판이다', () => {
    const record = stepOf(out, 'not_yet_and_board_lib');
    expect(record.errorType).toBeUndefined();
    const [table, firmware, library, value, hasTicks] = record.value as [[string, string][], string[], string[], number, boolean];
    // 표에는 부품 단계가 채울 이름이 들어 있다(파일이 생기면 그 파일이 import되므로 표는 고치지 않는다)
    expect(Object.fromEntries(table)).toMatchObject({ neopixel: 'firmware', i2c_lcd: 'library', servo_library: 'library', gorillacell_dcmotors: 'library' });
    expect(firmware?.slice(0, 2)).toEqual(['ModuleNotFoundError', 'zz_demo_firmware']);
    expect(firmware?.[2]).toContain('가상 보드에 아직 없어요');
    expect(firmware?.[2]).toContain('펌웨어');
    expect(library?.slice(0, 2)).toEqual(['ModuleNotFoundError', 'zz_demo_library']);
    expect(library?.[2]).toContain('zz_demo_library.py');
    expect(value).toBe(42);
    expect(hasTicks).toBe(true);
  });
});
