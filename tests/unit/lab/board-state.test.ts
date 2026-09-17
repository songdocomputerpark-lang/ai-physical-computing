// 가상 ESP32 보드 화면 쪽 상태 논리(src/lab/modules/board/state.ts) 단위 테스트 — P3-01.
// 파이썬 apc_board.py가 보내는 'board.state' 모양을 읽고, 입력 부품 값을 'board.inputs'·'board.input' 모양으로 만드는지 본다.
import { describe, expect, it } from 'vitest';
import {
  BOARD_MAX_MV,
  DIGITAL_HIGH_MV,
  EMPTY_SNAPSHOT,
  VALID_GPIOS,
  analogDrive,
  applyDeviceEvent,
  applyStateEvent,
  digitalLevelOf,
  isAnalogDrive,
  isPinDrive,
  parseDeviceEvent,
  sameDrive,
  describePin,
  inputChanges,
  inputsValue,
  isDrivenHigh,
  isStrappingGpio,
  isValidGpio,
  outputStrength,
  parseStateEvent,
  phaseText,
  stoppedSnapshot,
  type BoardSnapshot,
  type PinDrive,
} from '../../../src/lab/modules/board/state.ts';

const PIN2_ON = { id: 2, mode: 'out', pull: null, out: 1, level: 1, driven: true, irq: false };

function event(overrides: Record<string, unknown>) {
  return { v: 1, reason: 'change', phase: 'run', seq: 2, t_us: 1000, pins: [PIN2_ON], timers: 0, ...overrides };
}

describe('board.state 읽기', () => {
  it('파이썬이 보낸 모양을 읽고, 없는 값(None → undefined)은 null로 채운다', () => {
    const parsed = parseStateEvent(event({ pins: [{ id: 2, out: 1, level: 1, driven: true, irq: false }, { id: 0, mode: 'in', pull: 'up', out: 0, level: 1 }] }));
    expect(parsed?.pins).toEqual([
      { id: 2, mode: null, pull: null, out: 1, level: 1, driven: true, irq: false },
      { id: 0, mode: 'in', pull: 'up', out: 0, level: 1, driven: false, irq: false },
    ]);
    expect(parsed).toMatchObject({ reason: 'change', phase: 'run', seq: 2, tUs: 1000, timers: 0 });
  });

  it('PWM 자리(duty 0~1·freq Hz)는 있을 때만 읽고, 범위 밖 duty는 0~1로 자르며 이상한 freq는 버린다(P3-02에서 자리만 정함)', () => {
    const parsed = parseStateEvent(event({ pins: [{ ...PIN2_ON, duty: 1.5, freq: 1000 }, { id: 4, mode: 'out', out: 1, level: 1, driven: true, duty: 0.25, freq: -5 }] }));
    expect(parsed?.pins[0]).toMatchObject({ id: 2, duty: 1, freq: 1000 });
    expect(parsed?.pins[1]).toMatchObject({ id: 4, duty: 0.25 });
    expect(parsed?.pins[1]).not.toHaveProperty('freq');
    expect(parseStateEvent(event({}))?.pins[0]).not.toHaveProperty('duty');
  });

  it('모양이 틀리면 null, ESP32에 없는 핀은 버린다', () => {
    expect(parseStateEvent(null)).toBeNull();
    expect(parseStateEvent({ reason: 'oops', pins: [] })).toBeNull();
    expect(parseStateEvent({ reason: 'change', pins: 'x' })).toBeNull();
    expect(parseStateEvent(event({ pins: [{ id: 24, level: 1 }, { id: 2.5 }, PIN2_ON] }))?.pins.map((pin) => pin.id)).toEqual([2]);
  });

  it('스냅샷: reset이면 새로, 늦게 온 옛 순서 번호는 버리고, 핀 목록은 통째로 바꾼다', () => {
    const started = applyStateEvent(EMPTY_SNAPSHOT, parseStateEvent(event({ reason: 'reset', seq: 1, pins: [] }))!);
    expect(started).toMatchObject({ phase: 'run', seq: 1 });
    const on = applyStateEvent(started, parseStateEvent(event({ seq: 2 }))!);
    expect(on.pins.get(2)?.level).toBe(1);
    const stale = applyStateEvent(on, parseStateEvent(event({ seq: 2, pins: [] }))!);
    expect(stale).toBe(on);
    const again = applyStateEvent(on, parseStateEvent(event({ reason: 'reset', seq: 1, pins: [] }))!);
    expect(again.pins.size).toBe(0);
  });

  it('LED 같은 출력 부품: 실행 중·스스로 끝남에서는 켜진 모습, [정지]하면 꺼진 모습', () => {
    const on = applyStateEvent(EMPTY_SNAPSHOT, parseStateEvent(event({ reason: 'reset', seq: 1 }))!);
    expect(isDrivenHigh(on, 2)).toBe(true);
    const ended: BoardSnapshot = { ...on, phase: 'end' };
    expect(isDrivenHigh(ended, 2)).toBe(true);
    expect(isDrivenHigh(stoppedSnapshot(on), 2)).toBe(false);
    const inputHigh = applyStateEvent(EMPTY_SNAPSHOT, parseStateEvent(event({ reason: 'reset', seq: 1, pins: [{ id: 2, mode: 'in', level: 1, driven: false }] }))!);
    expect(isDrivenHigh(inputHigh, 2)).toBe(false);
  });
});

describe('출력 세기(outputStrength) — LED 밝기·진동 모터 세기', () => {
  it('실행 중 HIGH 출력은 1, LOW·입력·[정지]는 0, PWM이면 duty', () => {
    const snap = (pins: Record<string, unknown>[]) => applyStateEvent(EMPTY_SNAPSHOT, parseStateEvent(event({ reason: 'reset', seq: 1, pins }))!);
    expect(outputStrength(snap([PIN2_ON]), 2)).toBe(1);
    expect(outputStrength(snap([{ ...PIN2_ON, out: 0, level: 0 }]), 2)).toBe(0);
    expect(outputStrength(snap([{ id: 2, mode: 'in', level: 1, driven: false }]), 2)).toBe(0);
    expect(outputStrength(stoppedSnapshot(snap([PIN2_ON])), 2)).toBe(0);
    expect(outputStrength(snap([{ ...PIN2_ON, duty: 0.3 }]), 2)).toBeCloseTo(0.3);
    expect(outputStrength(snap([]), 2)).toBe(0);
  });

  it('스트래핑 핀(0·2·5·12·15)', () => {
    expect([0, 2, 5, 12, 15, 4, 19].map(isStrappingGpio)).toEqual([true, true, true, true, true, false, false]);
  });
});

describe('입력 부품 값', () => {
  it("'board.inputs' 값은 GPIO 순서의 글자 열쇠, 연결 없음(null)은 뺀다", () => {
    const drives = new Map<number, PinDrive>([
      [17, 1],
      [0, 'pullup'],
      [4, null],
    ]);
    expect(inputsValue(drives)).toEqual({ pins: { '0': 'pullup', '17': 1 } });
  });

  it("바뀐 핀만 'board.input' 변화로, 없어진 핀은 null", () => {
    const before = new Map<number, PinDrive>([
      [0, 'pullup'],
      [17, 0],
    ]);
    const after = new Map<number, PinDrive>([
      [0, 0],
      [17, 0],
      [4, 1],
    ]);
    expect(inputChanges(before, after)).toEqual([
      { pin: 0, drive: 0 },
      { pin: 4, drive: 1 },
    ]);
    expect(inputChanges(after, new Map([[0, 0]]))).toEqual([
      { pin: 4, drive: null },
      { pin: 17, drive: null },
    ]);
  });
});

describe('아날로그 전압 입력과 PWM 모드(병렬 제작 준비 2026-09-17)', () => {
  it('아날로그 전압은 0~3300mV 정수로 자르고, 값으로 비교하며, 디지털로 읽으면 1.65V 문턱이다', () => {
    expect(analogDrive(-5)).toEqual({ mv: 0 });
    expect(analogDrive(5000)).toEqual({ mv: BOARD_MAX_MV });
    expect(analogDrive(687.6)).toEqual({ mv: 688 });
    expect(analogDrive(Number.NaN)).toEqual({ mv: 0 });
    expect(isAnalogDrive({ mv: 1 })).toBe(true);
    expect(isPinDrive({ mv: 1535 })).toBe(true);
    expect(isPinDrive({ mv: "1" })).toBe(false);
    expect(sameDrive({ mv: 688 }, { mv: 688 })).toBe(true);
    expect(sameDrive({ mv: 688 }, { mv: 689 })).toBe(false);
    expect(sameDrive({ mv: 0 }, 0)).toBe(false);
    expect(sameDrive(undefined, null)).toBe(true);
    expect(digitalLevelOf({ mv: DIGITAL_HIGH_MV - 1 })).toBe(0);
    expect(digitalLevelOf({ mv: DIGITAL_HIGH_MV })).toBe(1);
    expect(digitalLevelOf('pullup')).toBe(1);
    expect(digitalLevelOf(null)).toBeNull();
  });

  it("아날로그 값도 'board.inputs'·'board.input'로 나가고, 같은 전압이면 변화로 치지 않는다", () => {
    const before = new Map<number, PinDrive>([[32, { mv: 688 }]]);
    const same = new Map<number, PinDrive>([[32, { mv: 688 }]]);
    const after = new Map<number, PinDrive>([[32, { mv: 1535 }]]);
    expect(inputsValue(after)).toEqual({ pins: { 32: { mv: 1535 } } });
    expect(inputChanges(before, same)).toEqual([]);
    expect(inputChanges(before, after)).toEqual([{ pin: 32, drive: { mv: 1535 } }]);
    expect(inputChanges(after, new Map())).toEqual([{ pin: 32, drive: null }]);
  });

  it("PWM 핀은 mode 'pwm'로 읽고 표에는 'PWM 출력', 세기는 duty다", () => {
    const parsed = parseStateEvent(event({ pins: [{ id: 15, mode: 'pwm', out: 0, level: 1, driven: true, duty: 0.5, freq: 262 }] }));
    expect(parsed?.pins[0]).toMatchObject({ id: 15, mode: 'pwm', duty: 0.5, freq: 262 });
    const snapshot = applyStateEvent(EMPTY_SNAPSHOT, parsed!);
    expect(outputStrength(snapshot, 15)).toBe(0.5);
    expect(describePin(parsed!.pins[0]!)).toBe('GPIO15 PWM 출력 1 (HIGH)');
  });
});

describe('부품 장치 상태(board.device, 병렬 제작 준비 2026-09-17)', () => {
  it('id·part가 있는 값만 읽고, 같은 배선 id는 순서 번호를 올려 최신 상태로 바꾼다', () => {
    expect(parseDeviceEvent({ mark: 'ready' })).toBeNull();
    expect(parseDeviceEvent({ id: 'lcd' })).toBeNull();
    const first = parseDeviceEvent({ v: 1, id: 'lcd', part: 'lcd-i2c', state: { lines: ['Hello', ''] } });
    expect(first).toEqual({ id: 'lcd', part: 'lcd-i2c', state: { lines: ['Hello', ''] } });
    const one = applyDeviceEvent(new Map(), first!);
    const two = applyDeviceEvent(one, { id: 'lcd', part: 'lcd-i2c', state: { lines: ['Count: 1', ''] } });
    expect(one.get('lcd')).toEqual({ seq: 1, state: { lines: ['Hello', ''] } });
    expect(two.get('lcd')).toEqual({ seq: 2, state: { lines: ['Count: 1', ''] } });
    expect(one.get('lcd')?.seq).toBe(1);
    expect(parseDeviceEvent({ id: 'ring', part: 'neopixel-ring' })).toEqual({ id: 'ring', part: 'neopixel-ring', state: null });
  });
});

describe('핀 번호·글', () => {
  it('ESP32에 있는 GPIO는 35개(0~23, 25~27, 32~39)다 — apc_board.py의 VALID_GPIOS와 같다', () => {
    expect(VALID_GPIOS).toHaveLength(35);
    expect(isValidGpio(24)).toBe(false);
    expect(isValidGpio(39)).toBe(true);
    expect(isValidGpio('2')).toBe(false);
  });

  it('핀 한 줄 요약과 실행 단계 글이 한국어로 나온다', () => {
    expect(describePin({ id: 2, mode: 'out', pull: null, out: 1, level: 1, driven: true, irq: false })).toBe('GPIO2 출력 1 (HIGH)');
    expect(describePin({ id: 0, mode: 'in', pull: 'up', out: 0, level: 0, driven: false, irq: true })).toBe('GPIO0 입력 · 풀업 0 (LOW) · 인터럽트');
    expect(phaseText({ ...EMPTY_SNAPSHOT, phase: 'idle', timers: 1 })).toContain('Timer 1개');
    expect(phaseText(EMPTY_SNAPSHOT)).toContain('[실행]');
  });
});
