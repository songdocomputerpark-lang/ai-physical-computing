// 판 1.5.0 구역 K2 — 범용 부품 4종(sensor-digital·sensor-analog·joystick·output-digital)의 파이썬 쪽을 Node의 실제 Pyodide(JSPI)로 확인한다.
// 단계는 helpers/board-steps/generic-parts.mjs. 화면 부품이 거는 값(부품의 순수 모델과 같은 계산)을 MicroPython 코드가 읽고
// (Pin.IN value·ADC read), 코드가 쓴 핀(board.state)이 출력 부품의 모습(visual)으로 이어지는지 본다. 화면 쪽 조작은 board-part-*.test.ts.
import { describe, expect, it } from 'vitest';
import output from '../../../src/lab/modules/board/parts/output-digital/part.ts';
import { outputDigitalSettings } from '../../../src/lab/modules/board/parts/output-digital/output-digital-model.ts';
import { EMPTY_SNAPSHOT, applyStateEvent, parseStateEvent, stoppedSnapshot, type BoardSnapshot } from '../../../src/lab/modules/board/state.ts';
import { instanceOf } from './helpers/board-snapshot.ts';
import { boardPyodideReady, runBoardSteps, stepOf, type BoardStateEvent } from './helpers/pyodide-board.ts';

/** 단계의 board.state 이벤트들을 화면처럼 차례로 반영한 스냅샷 목록 */
function snapshotsOf(events: readonly BoardStateEvent[]): BoardSnapshot[] {
  const result: BoardSnapshot[] = [];
  let current = EMPTY_SNAPSHOT;
  for (const event of events) {
    const parsed = parseStateEvent(event);
    if (parsed) {
      current = applyStateEvent(current, parsed);
      result.push(current);
    }
  }
  return result;
}

/** 출력 부품의 켜짐 차례(같은 값은 한 번만) */
function litTrail(events: readonly BoardStateEvent[], options?: Record<string, string | number | boolean>): boolean[] {
  const instance = instanceOf('output-digital', { sig: 4 }, options ? { options } : {});
  const trail = snapshotsOf(events).map((snapshot) => output.visual({ snapshot, instance, active: false, reducedMotion: false }).lit === true);
  return trail.filter((lit, index) => index === 0 || lit !== trail[index - 1]);
}

describe.skipIf(!boardPyodideReady)('가상 ESP32 보드 — 범용 부품 4종의 파이썬 쪽(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/lab/helpers/board-steps/generic-parts.mjs');

  it('범용 부품 단계만 돌고 ESP32 실습실과 같은 파일로 준비된다(부품이 파이썬 파일을 더하지 않는다)', () => {
    expect(out.jspi).toBe(true);
    expect(out.duplicate).toBeUndefined();
    expect(Object.keys(out.steps).sort()).toEqual([
      'analog_digital_threshold',
      'analog_exhaustive',
      'analog_sweep',
      'digital_active_low',
      'digital_normal',
      'joystick_axes_and_button',
      'joystick_without_button',
      'output_on_input_only_pin',
      'output_on_off',
      'output_pwm',
    ]);
    // 새 파이썬 흉내 파일이 없다: 배선만으로 핀 값·ADC 전압이 들어온다
    expect(out.files.filter((name) => /generic|sensor|joystick|output_digital/u.test(name))).toEqual([]);
  });

  it('sensor-digital: Pin(23, Pin.IN).value()가 감지(1)·해제(0)를 따른다, active_low 모듈은 거꾸로(처음 1, 감지하면 0)', () => {
    for (const name of ['digital_normal', 'digital_active_low']) {
      const record = stepOf(out, name);
      expect(record.errorType).toBeUndefined();
      expect(record.notices).toEqual([]);
    }
    expect(stepOf(out, 'digital_normal').value).toEqual([0, 1, 0, 1]);
    expect(stepOf(out, 'digital_active_low').value).toEqual([1, 0, 1, 0]);
  });

  it('sensor-analog: 슬라이더 값이 ADC.read()로 그대로 읽힌다(처음 2048, 양 끝 0·4095, 688·1535·2381·3263도 +1 없이)', () => {
    const record = stepOf(out, 'analog_sweep');
    expect(record.errorType).toBeUndefined();
    expect(record.notices).toEqual([]);
    expect(record.value).toEqual([2048, 0, 1, 2, 44, 45, 688, 1000, 1535, 2047, 2048, 2049, 2381, 3263, 4000, 4093, 4094, 4095]);
  });

  it('sensor-analog: 값 0~4095 전부가 파이썬 ADC 식을 거쳐 어긋남 없이 그 값으로 돌아온다', () => {
    const record = stepOf(out, 'analog_exhaustive');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([]);
  });

  it('sensor-analog: 디지털로 읽으면 1.65V 문턱 — 값 2048은 1, 2047은 0', () => {
    const record = stepOf(out, 'analog_digital_threshold');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([1, 0]);
  });

  it('joystick: X·Y가 각각 ADC로, 버튼 sw는 Pin(PULL_UP)으로 읽힌다(누르면 0, 떼면 1), 버튼 핀이 없어도 두 축은 그대로', () => {
    const record = stepOf(out, 'joystick_axes_and_button');
    expect(record.errorType).toBeUndefined();
    expect(record.notices).toEqual([]);
    expect(record.value).toEqual([
      [2048, 2048, 1],
      [4095, 4095, 1],
      [0, 0, 1],
      [0, 0, 0],
      [0, 0, 1],
      [2048, 2048, 1],
    ]);
    const noButton = stepOf(out, 'joystick_without_button');
    expect(noButton.errorType).toBeUndefined();
    expect(noButton.notices).toEqual([]);
    expect(noButton.value).toEqual([1234, 3210]);
  });

  it('output-digital: Pin(4, Pin.OUT).on()/off()가 표시등을 켜고 끈다(board.state → visual), PWM이면 켜진 비율만큼', () => {
    const record = stepOf(out, 'output_on_off');
    expect(record.errorType).toBeUndefined();
    expect(record.notices).toEqual([]);
    expect(record.value).toBe(1);
    // 켜짐 → 꺼짐 → 켜짐 차례(처음 실행 시작 상태는 아직 핀을 만지지 않아 꺼짐)
    expect(litTrail(record.events, { color: 'red' })).toEqual([false, true, false, true]);

    const pwm = stepOf(out, 'output_pwm');
    expect(pwm.errorType).toBeUndefined();
    const instance = instanceOf('output-digital', { sig: 4 }, { options: { kind: 'relay' } });
    const settings = outputDigitalSettings({ kind: 'relay' }).settings;
    const brightness = snapshotsOf(pwm.events).map((snapshot) => output.visual({ snapshot, instance, active: false, reducedMotion: false }).brightness);
    expect(settings.kind).toBe('relay');
    expect(brightness).toContain(50);
    expect(brightness).toContain(0);
    // [정지] 뒤에는 꺼진 모습
    const last = snapshotsOf(stepOf(out, 'output_on_off').events).at(-1) as BoardSnapshot;
    expect(output.visual({ snapshot: stoppedSnapshot(last), instance, active: false, reducedMotion: false })).toMatchObject({ lit: false });
  });

  it('output-digital: 입력 전용 핀(34)에 출력을 만들면 실물과 같은 오류(배선 검사의 input-only-output도 같은 까닭)', () => {
    const record = stepOf(out, 'output_on_input_only_pin');
    expect(record.errorType).toBeUndefined();
    expect(String(record.value)).toMatch(/^\w+Error: /u);
  });
});
