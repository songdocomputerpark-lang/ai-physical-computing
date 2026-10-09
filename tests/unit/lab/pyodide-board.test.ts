// 가상 ESP32 보드 모듈의 파이썬 쪽(src/lab/modules/board/: machine.py·apc_board.py·apc_board_time.py·micropython.py)을
// Node.js의 실제 Pyodide 314.0.7로 검사한다(PLAN §8.3 P3-01 "흉내 모듈 단위 테스트 통과", PD-14).
// JSPI는 --experimental-wasm-jspi로 켠 별도 프로세스에서 돈다(tests/unit/lab/helpers/pyodide-board-run.mjs — ESP32 실습실 워커와 같은 순서).
// 부품 단계 확장 자리(PWM·아날로그·부품 장치·아직 없는 모듈)는 pyodide-board-extension-points.test.ts(단계 파일 helpers/board-steps/extension-points.mjs).
// 기대값은 MicroPython v1.29.0 ESP32 포트 소스(machine_pin.c·machine_timer.c·extmod/modtime.c·shared/timeutils)로 확인한 실물 동작이다.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STOP_GRACE_MS } from '../../../src/lab/runtime/config.ts';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'tests', 'unit', 'lab', 'helpers', 'pyodide-board-run.mjs');

const nodeJspi = spawnSync(process.execPath, ['--experimental-wasm-jspi', '-e', 'process.stdout.write(typeof WebAssembly.Suspending)'], {
  encoding: 'utf8',
  timeout: 20_000,
});
const nodeHasJspi = nodeJspi.status === 0 && nodeJspi.stdout === 'function';
const pyodideInstalled = fs.existsSync(path.join(ROOT, 'node_modules', 'pyodide', 'pyodide.mjs'));

interface StateEvent {
  reason: string;
  phase: string;
  seq: number;
  t_us: number;
  pins: { id: number; mode?: string | null; pull?: string | null; out: number; level: number; driven: boolean; irq: boolean; duty?: number; freq?: number }[];
  timers: number;
}

interface StepRecord {
  ms: number;
  /** 파이썬이 실제로 기다린 횟수(다리의 sleep 부름) */
  hostWaits: number;
  /** [정지] 요청부터 실행이 끝날 때까지(요청한 단계만) */
  stopLatencyMs?: number;
  /** 시험용 멈춘 시계를 되돌리지 못했을 때의 오류(frozenClock 단계) */
  thawError?: string;
  value?: unknown;
  errorType?: string;
  errorMessage?: string;
  stdout: string;
  stderr: string;
  events: StateEvent[];
  devices?: { v?: number; id?: string; part?: string; state?: unknown }[];
  notices: string[];
  idleStartedMs?: number;
}

interface Result {
  jspi: boolean;
  files: string[];
  folders: string[];
  shims: Record<string, string>;
  duplicate?: string;
  steps: Record<string, StepRecord>;
  syncEntrypointReset: string;
  leftoverInputs: unknown[];
}

function run(extra: string[] = []): Result {
  const result = spawnSync(process.execPath, ['--experimental-wasm-jspi', SCRIPT, ROOT, ...extra], {
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

describe.skipIf(!pyodideInstalled || !nodeHasJspi)('가상 ESP32 보드의 파이썬 쪽(실제 Pyodide, JSPI)', () => {
  const out = run();
  const step = (name: string): StepRecord => {
    const found = out.steps[name];
    if (!found) {
      throw new Error(`단계 ${name}이(가) 없어요.`);
    }
    return found;
  };

  it('ESP32 실습실 워커와 같은 파일·흉내 표로 준비된다(보드 + 모든 실습실 모듈, 영상 처리 전용 모듈은 없음)', () => {
    expect(out.jspi).toBe(true);
    expect(out.duplicate).toBeUndefined();
    expect(out.folders).toContain('board');
    expect(out.folders).not.toContain('mediapipe');
    expect(out.files).toEqual(expect.arrayContaining(['apc_runtime.py', 'apc_board.py', 'apc_board_time.py', 'machine.py', 'micropython.py']));
    expect(out.files).not.toContain('pyautogui.py');
    expect(out.shims).toMatchObject({ time: 'apc_board' });
  });

  it('Pin: on·off·value·호출형·toggle, 같은 번호는 같은 객체, 상수 값과 repr이 실물과 같다', () => {
    expect(step('pin_basic').value).toEqual([1, 0, 1, 0, 1, true, 'Pin(2, mode=Pin.OUT)', 1, 3, 7, 2, 1, 1, 2, 4, 5]);
  });

  it('Pin: 없는 핀 번호·입력 전용 핀(34~39)의 출력 모드·틀린 인자형은 실물과 같은 오류', () => {
    expect(step('pin_errors').value).toEqual([
      'ValueError: invalid pin',
      'ValueError: invalid pin',
      'ValueError: invalid pin',
      'ValueError: invalid pin',
      'ValueError: invalid pin',
      'ValueError: invalid pin',
      'ValueError: invalid pin',
      'ValueError: pin can only be input',
      'ValueError: pin can only be input',
      "TypeError: can't convert str to int",
      "TypeError: can't convert float to int",
      'Pin(34, mode=Pin.IN)',
      'Pin(4, mode=Pin.IN, pull=Pin.PULL_UP)',
      'Pin(5, mode=Pin.OUT, drive=Pin.DRIVE_3)',
      'Pin(6, mode=Pin.IN)',
    ]);
  });

  it('입력: 실행 전 입력 상태(board.inputs)와 실행 중 변화(board.input)를 읽고, 풀업·풀다운이 반영된다', () => {
    expect(step('input_levels').value).toEqual([1, 0, 1, 0]);
  });

  it('sleep 없는 반복문도 입력 핀을 읽는 자리에서 양보해 버튼 입력을 받는다(f015 모양)', () => {
    expect(step('polling_without_sleep').value).toEqual([true, 1]);
    expect(step('polling_without_sleep').ms).toBeLessThan(5_000);
  });

  it('핀 인터럽트: 누른 순간(IRQ_FALLING)·양쪽(기본 trigger)이 sleep 도중에도 곧바로 콜백되고 콜백은 Pin 객체를 받는다', () => {
    expect(step('irq').value).toEqual([
      ['fall', true, 0],
      ['both', 1],
      ['both', 0],
    ]);
  });

  it('time: MicroPython판 이름·ticks 넘침 계산·ticks_add 한계·epoch 2000 날짜 8칸·mktime 넘김·실물과 같은 오류', () => {
    expect(step('time_functions').value).toEqual([
      true,
      true,
      10,
      -10,
      0,
      2 ** 29 + 1,
      'ticks interval overflow',
      'ticks interval overflow',
      [2000, 1, 1, 0, 0, 0, 5, 1],
      [1999, 12, 31, 23, 59, 59, 4, 365],
      [2025, 1, 1, 2, 5, 45, 2, 1],
      0,
      -1,
      true,
      true,
      true,
      true,
      true,
      false,
      "TypeError: can't convert float to int",
      'TypeError: mktime needs a tuple of length 8 or 9',
      "TypeError: can't convert float to int",
      'ValueError: sleep length must be non-negative',
    ]);
  });

  it('가상 시계: 짧은 sleep을 모아도 ticks는 잔 만큼 늘고, sleep(초)은 밀리초로 버린다', () => {
    /*
     * 2026-09-30 최종 점검 TD-03: 전에는 실제 시계 그대로 돌려 "402,709 < 400,000"처럼 상한이 부하에 따라 깨졌다(가상 시계는 계산 시간도 더한다).
     * 가상 시각 계산은 시험용 멈춘 시계(helpers/pyodide-board-run.mjs frozenClock)로 정확한 값을 보고, 실제 시계 쪽은 부하와 상관없는 것만 본다.
     */
    const exact = step('virtual_clock_exact');
    expect(exact.thawError).toBeUndefined();
    // 1ms × 200번 = 200,000µs, sleep(0.0005)는 0ms로 버림, sleep(0.25) = 250ms, sleep_us(3) = 3µs
    expect(exact.value).toEqual([200_000, 0, 250, 3]);

    const record = step('virtual_clock');
    // 실제 시계 그대로면 계산 시간이 더해질 뿐, 잔 만큼보다 줄지는 않는다
    expect(record.value as number).toBeGreaterThanOrEqual(200_000);
    /*
     * 짧은 sleep은 16ms씩 모아 기다린다: 실제로 기다린 횟수는 모은 몫(200 ÷ 16 → 13)과, 16ms마다 한 번 양보한 몫(단계 실제 시간 ÷ 16)을 넘지 않는다.
     * 모으기가 깨지면 sleep마다 기다려 200번 가까이 된다. (전에는 "실제 2초 안"으로 봤는데 부하에 따라 흔들리고, 모으기가 깨져도 Node에서는 2초 안에 끝났다.)
     */
    expect(record.hostWaits).toBeGreaterThan(0);
    expect(record.hostWaits).toBeLessThanOrEqual(Math.ceil(200 / 16) + Math.ceil(record.ms / 16) + 3);
  });

  it('Timer: 주기마다 가상 시각에 맞춰 콜백(20ms 간격), deinit 뒤 멈춤, value(), 뒤바뀐 repr까지 실물과 같다', () => {
    // 시험용 멈춘 시계(frozenClock)라 가상 시각이 sleep한 양만큼만 흐른다 — 콜백은 가상 시각 20·40·60·80·100ms에 정확히 5번.
    // (전에는 계산 시간이 더해져 5~6번·간격 8~32ms를 받아 주었는데, 부하가 크면 20ms 넘게 밀린 주기가 합쳐져 3번까지 줄었다 — TD-03)
    const record = step('timer_periodic');
    expect(record.thawError).toBeUndefined();
    const value = record.value as unknown[];
    expect(value[0]).toBe(5);
    expect(value[1]).toBe(value[0]);
    expect(value[2]).toBe(true);
    expect(value[3]).toEqual([20, 20, 20, 20]);
    expect(value.slice(4)).toEqual([true, 'Timer(0, mode=ONE_SHOT, period=20)', 'Timer(1, mode=PERIODIC, period=0)', true, false, 1, 0]);
  });

  it('Timer: 한 번(ONE_SHOT)·없는 번호·위치 인자·hard·0 주기 오류, freq로 만든 짧은 주기도 빠짐없이', () => {
    const value = step('timer_one_shot_and_errors').value as unknown[];
    expect(value.slice(0, 6)).toEqual([
      1,
      "ValueError: Timer(4) doesn't exist, there are only 4 hardware timers",
      'TypeError: extra positional arguments given',
      'ValueError: hard Timers are not implemented',
      'ValueError: Timer period is too short for this timer',
      'ValueError: Timer period is too short for this timer',
    ]);
    // freq=100(10ms)으로 sleep_ms(55): 10·20·30·40·50ms에 정확히 5번 — 건너뛴 주기가 없다(시험용 멈춘 시계, TD-03).
    expect(value[6]).toBe(5);
  });

  it('콜백 오류는 트레이스백(학생 코드 줄만)과 안내를 남기고 보드는 계속 돈다', () => {
    const record = step('callback_error_keeps_running');
    // 25ms 주기로 sleep_ms(80): 25·50·75ms에 3번 — 오류가 나도 다음 주기가 온다(시험용 멈춘 시계, TD-03)
    expect(record.value).toBe(3);
    expect(record.stderr).toContain('File "main.py", line 6, in bad');
    expect(record.stderr).not.toContain('/apc/');
    expect(record.notices.filter((text) => text.includes('콜백 함수에서 오류'))).toHaveLength(1);
  });

  it('코드가 끝나도 Timer가 있으면 [정지]까지 이어 돌고(run_idle), 없으면 곧바로 끝난다', () => {
    // 끝난 뒤의 상태(phase idle)가 6번 오면 도우미가 [정지]를 누른다(실제 시간 대신 진행으로 — TD-03). 스스로 끝나지 않고 [정지]로 멈춘 것을 본다.
    const idle = step('idle_after_end');
    expect(idle.value).toBe('started');
    expect(idle.errorType).toBe('KeyboardInterrupt');
    expect(idle.idleStartedMs).toBeDefined();
    expect(idle.notices.some((text) => text.includes('계속 돌고 있어요'))).toBe(true);
    const phases = idle.events.map((event) => event.phase);
    expect(phases).toContain('idle');
    expect(idle.events.filter((event) => event.phase === 'idle').length).toBeGreaterThanOrEqual(5);
    expect(idle.events.at(-1)?.reason).toBe('end');
    const quick = step('no_idle_without_timers');
    expect(quick.value).toBe('done');
    expect(quick.errorType).toBeUndefined();
    // Timer가 없으면 run_idle이 기다리지 않는다: 끝난 뒤의 상태·안내가 없고, run_idle에 쓴 시간이 짧다
    // (전에는 단계 전체가 200ms 안인지 봤는데 준비 시간까지 들어가 부하에 따라 흔들렸다 — TD-03)
    expect(quick.events.some((event) => event.phase === 'idle')).toBe(false);
    expect(quick.notices.some((text) => text.includes('계속 돌고 있어요'))).toBe(false);
    expect(quick.ms - (quick.idleStartedMs ?? 0)).toBeLessThan(1_000);
  });

  it('[정지]: time.sleep 반복문은 곧바로 KeyboardInterrupt로 멈춘다', () => {
    const record = step('stop_in_sleep_loop');
    expect(record.errorType).toBe('KeyboardInterrupt');
    // [정지] 요청부터 멈출 때까지만 잰다(전에는 준비 시간까지 든 단계 전체가 500ms 안인지 봐서 부하에 흔들렸다 — TD-03).
    // 실습실의 약속은 정지 유예(src/lab/runtime/config.ts STOP_GRACE_MS, 1초) 안 — 보통은 몇십 ms다.
    expect(record.stopLatencyMs).toBeDefined();
    expect(record.stopLatencyMs!).toBeLessThan(STOP_GRACE_MS);
  });

  it('micropython.const·u-이름·errno(실물 번호)·bluetooth 흉내·아직 없는 machine 이름·schedule 대기열(8개)', () => {
    const value = step('const_aliases_errno').value as unknown[];
    expect(value.slice(0, 8)).toEqual([5, true, true, true, 19, 116, 'ENODEV', true]);
    // bluetooth·ubluetooth는 Phase 4 P4-03에서 보드 확장(ext/ble/apc_board_ble.py)이 자리 안내를 덮어써서 이제 import된다(2026-09-24 통합).
    // 확장 파일이 빠지면 자리 안내("가상 보드의 블루투스는 아직 …")로 돌아간다 — 그 안전망은 apc_board.py install()에 그대로 있다.
    expect(value[8]).toBe('no error');
    expect(value[9]).toBe('no error');
    expect(value[10]).toBe("ModuleNotFoundError: No module named 'umicropython'");
    // 부품 구역(P3-03~P3-05)이 PWM·UART 같은 이름을 더해도 흔들리지 않게, 이 단계에서 흉내 낼 계획이 없는 이름(DAC·I2S)으로 본다
    expect(value[11]).toBe('ImportError: machine.DAC은(는) 가상 보드에 아직 없어요(실물 ESP32에는 있어요). 이 기능은 실물 보드에서 확인해요.');
    expect(value[12]).toMatch(/^ImportError: machine\.I2S은\(는\) 가상 보드에 아직 없어요/u);
    expect(value[13]).toBe("AttributeError: module 'machine' has no attribute 'nothing_here'");
    expect(value[14]).toBe('schedule queue full');
    expect(value[15]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('학생 코드 밖의 time(표준 라이브러리·importlib)은 진짜 CPython time 그대로이고, OSError 도우미는 실물 모양', () => {
    expect(step('host_time_untouched').value).toEqual([true, false, true, true, true, '[Errno 19] ENODEV', [19], 'OSError', 19]);
  });

  it('실물에서 문제가 되는 핀 사용(떠 있는 입력·플래시 핀·입력 전용 핀의 풀업·쓰기·UART0)은 한국어로 한 번씩 알린다', () => {
    const notices = step('warnings').notices;
    expect(notices).toHaveLength(5);
    expect(notices[0]).toContain('17번 핀을 읽었지만');
    expect(notices[1]).toContain('플래시 메모리');
    expect(notices[2]).toContain('풀업·풀다운 저항이 없어요');
    expect(notices[3]).toContain('입력 전용');
    expect(notices[4]).toContain('UART0');
  });

  it('배선과 코드가 어긋나면(입력 부품 핀을 출력으로·출력 부품 핀을 입력으로·출력으로 정하지 않고 쓰기·부품 없는 핀) 핀마다 한 번씩 한국어로 알린다(P3-02)', () => {
    const record = step('wiring_notices');
    expect(record.value).toBe('done');
    expect(record.errorType).toBeUndefined();
    const notices = record.notices;
    expect(notices).toHaveLength(5);
    expect(notices[0]).toContain('17번 핀에는 터치 센서(값을 보내는 부품)이(가) 이어져 있는데 출력(Pin.OUT)으로 정했어요');
    expect(notices[1]).toContain('19번 핀에는 진동 모터(보드가 움직이는 부품)이(가) 이어져 있는데 입력(Pin.IN)으로 정했어요');
    expect(notices[2]).toContain('19번 핀에 진동 모터이(가) 이어져 있지만 핀을 출력(Pin.OUT)으로 정하지 않아서');
    expect(notices[3]).toContain('18번 핀을 출력으로 정했는데, 이 예제의 배선도에는 18번 핀에 이은 부품이 없어요');
    expect(notices[4]).toContain('4번 핀을 읽었지만');
    expect(notices[4]).toContain('배선도에도 이 핀에 이은 부품이 없어요');
    // 배선을 받지 못한 실행(앞 단계 warnings)에는 배선 안내가 없다
    expect(step('warnings').notices.some((text) => text.includes('배선도'))).toBe(false);
  });

  it('board.state 이벤트: 실행 시작(reset) → 기다리기 전의 변화 → 끝(end), 순서 번호·가상 시각이 늘어나기만 한다', () => {
    const events = step('state_events').events;
    expect(events[0]).toMatchObject({ reason: 'reset', phase: 'run', seq: 1, pins: [] });
    expect(events.at(-1)).toMatchObject({ reason: 'end', phase: 'end' });
    const on = events.find((event) => event.pins.some((pin) => pin.id === 2 && pin.level === 1));
    expect(on?.pins.find((pin) => pin.id === 2)).toMatchObject({ mode: 'out', out: 1, level: 1, driven: true, irq: false });
    expect(events.some((event, index) => index > 0 && event.reason === 'change' && event.pins.some((pin) => pin.id === 2 && pin.level === 0))).toBe(true);
    for (let index = 1; index < events.length; index += 1) {
      expect(events[index]!.seq).toBeGreaterThan(events[index - 1]!.seq);
      expect(events[index]!.t_us).toBeGreaterThanOrEqual(events[index - 1]!.t_us);
    }
  });

  it('동기 진입점(install_available·reset_for_run)에서 보드 초기화가 양보하지 않고, 실행 전 입력은 버린다(PROGRESS 미해결 25번)', () => {
    expect(out.syncEntrypointReset).toBe('ok');
    expect(out.leftoverInputs).toEqual([]);
  });
});

describe.skipIf(!pyodideInstalled || !nodeHasJspi)('가상 ESP32 보드 — 제한 모드(JSPI 없음)', () => {
  it('기다리기가 없어도 핀·짧은 sleep이 돌고 상태 이벤트가 나간다', () => {
    const out = run(['--limited']);
    const record = out.steps.limited;
    expect(record?.value).toBe(1);
    expect(record?.errorType).toBeUndefined();
    expect(record?.events.at(-1)).toMatchObject({ reason: 'end' });
  }, 240_000);
});
