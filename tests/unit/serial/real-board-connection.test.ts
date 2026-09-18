// 실제 보드 연결 상태 기계(src/lab/serial/board-connection.ts)와 실습실 실행 대상(board-run-target.ts)을 모의 navigator.serial·보드로 확인한다(P3-07).
// 포트 선택 창(requestPort)·열기 실패·MicroPython 없음·선 뽑기와 다시 꽂기·연결 끊기(RTS → DTR)·보드 다시 시작·[실행]/[정지] 결과 모양.
import { afterEach, describe, expect, it } from 'vitest';
import { FakeSerial, MicroPythonDevice, MockSerialPort, SilentDevice, USB_IDS, type MicroPythonDeviceOptions, type SerialDevice } from '../../../src/lab/serial/mock/index.ts';
import { BoardConnection, type BoardConnectionState } from '../../../src/lab/serial/board-connection.ts';
import { OutputBuffer, RUN_NOTICES, createRealBoardRunTarget, errorToRunResult, execToRunResult, usesInput } from '../../../src/lab/serial/board-run-target.ts';
import { BoardDisconnectedError, SerialClosedError } from '../../../src/lab/serial/errors.ts';
import type { ExecResult } from '../../../src/lab/serial/raw-repl.ts';
import type { LabRunContext } from '../../../src/lab/controls/lab-shell.ts';
import { stubbornProgramDevice } from './helpers/real-board-devices.ts';
import { FAST_TIMING, sleep } from './helpers/real-board-timing.ts';

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function setup(devices: { device: SerialDevice | null; info?: SerialPortInfo; openError?: string }[]) {
  const ports = devices.map(({ device, info, openError }) => new MockSerialPort({ device, ...(info ? { info } : {}), ...(openError ? { openError } : {}) }));
  const serial = new FakeSerial({ ports, requireUserActivation: false });
  const connection = new BoardConnection({ serial, timing: FAST_TIMING });
  const states: BoardConnectionState[] = [];
  connection.subscribe((snapshot) => {
    if (states.at(-1) !== snapshot.state) {
      states.push(snapshot.state);
    }
  });
  cleanups.push(async () => {
    connection.dispose();
    await sleep(20);
    for (const port of ports) {
      port.unplug();
    }
  });
  return { serial, ports, connection, states };
}

function micropython(options: MicroPythonDeviceOptions = {}) {
  return new MicroPythonDevice(options);
}

/** 실행 대상에 넘길 가짜 실습실 문맥 */
function fakeContext(runCount = 1): LabRunContext & { lines: { text: string; kind: string }[]; text(kind?: string): string } {
  const lines: { text: string; kind: string }[] = [];
  return {
    runCount,
    lines,
    // 상태 줄 바꾸기(ctx.setStatus)는 이 검사에서 쓰지 않는다 — 화면이 없다
    setStatus() {},
    write(text: string, kind = 'stdout') {
      lines.push({ text, kind });
    },
    prompt: async () => null,
    text(kind?: string) {
      return lines
        .filter((line) => kind === undefined || line.kind === kind)
        .map((line) => line.text)
        .join('');
    },
  };
}

describe('BoardConnection — 연결·판별', () => {
  it('Web Serial이 없으면 unsupported에서 움직이지 않는다', async () => {
    const connection = new BoardConnection({ serial: null });
    expect(connection.state).toBe('unsupported');
    expect(connection.supported).toBe(false);
    expect((await connection.connect()).state).toBe('unsupported');
    expect(connection.snapshot.problem?.code).toBe('unsupported');
  });

  it('[보드 연결]: 거르지 않는 선택 창 → 열기 → 판별 → ready(CH340 칩·v1.29.0·ESP32)', async () => {
    const device = micropython();
    const { serial, ports, connection, states } = setup([{ device }]);
    const snapshot = await connection.connect();
    expect(states).toEqual(['choosing', 'opening', 'checking', 'ready']);
    expect(snapshot).toMatchObject({
      state: 'ready',
      port: { kind: 'usb', usbId: '1a86:7523', chip: 'CH340', text: 'CH340(WCH) · USB 1a86:7523' },
      banner: { version: 'v1.29.0', machine: 'Generic ESP32 module with ESP32' },
      firmware: 'same',
      esp32: true,
      problem: null,
      hasLastPort: true,
    });
    // 포트 선택 창에 필터를 넣지 않는다(CH9102·CP210x 보드도 보이게)
    expect(serial.requests).toEqual([{}]);
    expect(ports[0]!.isOpen).toBe(true);
    expect(ports[0]!.openLog.at(-1)).toMatchObject({ baudRate: 115200, bufferSize: 4096 });
    expect(device.hardResets).toBe(1);
  });

  it('CP210x·옛 펌웨어·ESP32가 아닌 보드는 보조 정보로만 알린다', async () => {
    const { connection } = setup([{ device: micropython({ version: 'v1.22.2', machine: 'Raspberry Pi Pico with RP2040' }), info: { ...USB_IDS.cp2102 } }]);
    const snapshot = await connection.connect();
    expect(snapshot).toMatchObject({ state: 'ready', port: { chip: 'CP210x' }, firmware: 'older', esp32: false });
  });

  it('선택 창을 닫으면 idle + not-selected, 열기 실패(다른 프로그램이 쓰는 중)는 error + port-in-use', async () => {
    const first = setup([{ device: micropython() }]);
    first.serial.chooseNext(null);
    expect(await first.connection.connect()).toMatchObject({ state: 'idle', problem: { code: 'not-selected' } });

    const second = setup([{ device: micropython(), openError: 'NetworkError' }]);
    expect(await second.connection.connect()).toMatchObject({ state: 'error', problem: { code: 'port-in-use' } });
  });

  it('대답 없는 보드 → no-micropython(판별 결과 silent), [실행]은 다시 확인한 뒤 BoardNoMicroPython', async () => {
    const { connection } = setup([{ device: new SilentDevice() }]);
    expect(await connection.connect()).toMatchObject({ state: 'no-micropython', verdict: { kind: 'silent' }, banner: null });
    await expect(connection.run("print('x')")).rejects.toMatchObject({ name: 'BoardNoMicroPython' });
    expect(connection.state).toBe('no-micropython');
  }, 15_000);

  it('Ctrl-C를 삼키는 프로그램이 도는 보드 → busy', async () => {
    const { connection } = setup([{ device: stubbornProgramDevice() }]);
    expect(await connection.connect()).toMatchObject({ state: 'busy', verdict: { kind: 'busy' } });
  }, 15_000);

  it('다른 포트를 고르면 먼저 연 포트를 닫는다', async () => {
    const { serial, ports, connection } = setup([{ device: micropython() }, { device: micropython(), info: { ...USB_IDS.cp2102 } }]);
    await connection.connect();
    serial.chooseNext(ports[1]!);
    const snapshot = await connection.connect();
    expect(snapshot).toMatchObject({ state: 'ready', port: { chip: 'CP210x' } });
    expect(ports[0]!.isOpen).toBe(false);
    expect(ports[1]!.isOpen).toBe(true);
  });
});

describe('BoardConnection — 실행·정지·끊김·다시 연결·연결 끊기·다시 시작', () => {
  it('실행 → ready로 돌아오고, 정지는 Ctrl-C로 KeyboardInterrupt', async () => {
    const device = micropython();
    const { connection, states } = setup([{ device }]);
    await connection.connect();
    const out: string[] = [];
    const result = await connection.run("print('hi')", { onStdout: (text) => out.push(text) });
    expect(result).toMatchObject({ outcome: 'ok', stdout: 'hi\n' });
    expect(out.join('')).toBe('hi\n');
    expect(states.slice(-2)).toEqual(['running', 'ready']);
    const seen: string[] = [];
    const running = connection.run("import time\nwhile True:\n    print('t')\n    time.sleep(0.05)", { onStdout: (text) => seen.push(text) });
    await expect.poll(() => seen.length > 0, { timeout: 3000 }).toBe(true);
    connection.stop();
    expect(await running).toMatchObject({ outcome: 'interrupted', stopRequested: true });
    expect(connection.state).toBe('ready');
  });

  it('USB 선을 뽑으면 lost, 다시 꽂으면 replugged, [다시 연결]은 선택 창 없이 같은 포트를 연다', async () => {
    const { serial, ports, connection } = setup([{ device: micropython() }]);
    await connection.connect();
    ports[0]!.unplug();
    await expect.poll(() => connection.state).toBe('lost');
    expect(connection.snapshot).toMatchObject({ problem: { code: 'lost' }, replugged: false, hasLastPort: true });
    ports[0]!.plug();
    await expect.poll(() => connection.snapshot.replugged).toBe(true);
    const requestsBefore = serial.requests.length;
    const snapshot = await connection.reconnect();
    expect(snapshot).toMatchObject({ state: 'ready', replugged: false, banner: { version: 'v1.29.0' } });
    expect(serial.requests.length).toBe(requestsBefore);
  });

  it('실행 중에 선이 빠지면 run이 BoardDisconnectedError로 끝나고 상태는 lost', async () => {
    const { ports, connection } = setup([{ device: micropython() }]);
    await connection.connect();
    const seen: string[] = [];
    const running = connection.run("import time\nwhile True:\n    print('t')\n    time.sleep(0.05)", { onStdout: (text) => seen.push(text) });
    await expect.poll(() => seen.length > 0, { timeout: 3000 }).toBe(true);
    ports[0]!.unplug();
    await expect(running).rejects.toBeInstanceOf(BoardDisconnectedError);
    expect(connection.state).toBe('lost');
  });

  it('[연결 끊기]: 보통 REPL로 돌려놓고 RTS를 먼저·DTR을 나중에 내린 뒤 포트를 닫는다(보드 리셋 없음)', async () => {
    const device = micropython();
    const { ports, connection } = setup([{ device }]);
    await connection.connect();
    await connection.run("print('x')");
    expect(device.mode).toBe('raw');
    const signalsBefore = ports[0]!.signalLog.length;
    const snapshot = await connection.disconnect();
    expect(snapshot).toMatchObject({ state: 'idle', banner: null, problem: null, hasLastPort: true });
    expect(ports[0]!.isOpen).toBe(false);
    expect(device.mode).toBe('friendly');
    const changes = ports[0]!.signalLog.slice(signalsBefore).map((item) => `${item.requestToSend ? 'R1' : 'R0'}${item.dataTerminalReady ? 'D1' : 'D0'}`);
    expect(changes.slice(0, 3)).toEqual(['R0D1', 'R0D1', 'R0D0']);
    expect(device.hardResets).toBe(1);
  });

  it('실행 중에 [연결 끊기]를 누르면 멈추고 닫는다', async () => {
    const { ports, connection } = setup([{ device: micropython() }]);
    await connection.connect();
    const seen: string[] = [];
    const running = connection.run("import time\nwhile True:\n    print('t')\n    time.sleep(0.05)", { onStdout: (text) => seen.push(text) });
    await expect.poll(() => seen.length > 0, { timeout: 3000 }).toBe(true);
    const disconnected = connection.disconnect();
    const settled = await running.then(
      (result) => result.outcome,
      (error: unknown) => (error instanceof SerialClosedError ? 'closed' : String(error)),
    );
    expect(['interrupted', 'closed']).toContain(settled);
    await disconnected;
    expect(connection.state).toBe('idle');
    expect(ports[0]!.isOpen).toBe(false);
  });

  it('[보드 다시 시작]: RTS로 EN을 눌렀다 놓아 보통 부팅(다운로드 모드 아님) 뒤 다시 판별', async () => {
    const device = micropython();
    const { connection } = setup([{ device }]);
    await connection.connect();
    const snapshot = await connection.restartBoard();
    expect(snapshot.state).toBe('ready');
    expect(device.hardResets).toBe(2);
    expect(device.mode).toBe('friendly');
  });
});

describe('실습실 실행 대상(createRealBoardRunTarget)', () => {
  it('Web Serial이 없으면 BoardUnsupported와 [가상 보드] 안내', async () => {
    const target = createRealBoardRunTarget(new BoardConnection({ serial: null }));
    const context = fakeContext();
    const result = await target.run("print('x')", context);
    expect(result).toMatchObject({ runId: 1, outcome: 'error', error: { type: 'BoardUnsupported', traceback: '' } });
    expect(context.text('notice')).toBe(`[안내] ${RUN_NOTICES.unsupported}\n`);
  });

  it('연결 전 [실행]: 선택 창 → 연결·판별 → 곧바로 실행해 출력이 콘솔로', async () => {
    const { serial, connection } = setup([{ device: micropython() }]);
    const target = createRealBoardRunTarget(connection, { flushMs: 5 });
    const context = fakeContext(3);
    const result = await target.run("print('보드에서', 7 * 6)", context);
    expect(result).toMatchObject({ runId: 3, outcome: 'ok' });
    expect(serial.requests).toHaveLength(1);
    expect(context.text('stdout')).toBe('보드에서 42\n');
    expect(context.text('notice')).toContain(RUN_NOTICES.connectFirst);
    expect(connection.state).toBe('ready');
  });

  it('선택 창을 닫으면 BoardNotConnected', async () => {
    const { serial, connection } = setup([{ device: micropython() }]);
    serial.chooseNext(null);
    const context = fakeContext();
    const result = await createRealBoardRunTarget(connection).run("print('x')", context);
    expect(result).toMatchObject({ outcome: 'error', error: { type: 'BoardNotConnected' } });
    expect(context.text('notice')).toContain(RUN_NOTICES.notConnected);
  });

  it('오류는 트레이스백을 쓰지 않고 결과로(셸이 한 번 적음), 정지는 stopped', async () => {
    const { connection } = setup([{ device: micropython() }]);
    await connection.connect();
    const target = createRealBoardRunTarget(connection, { flushMs: 5 });
    const context = fakeContext();
    const failed = await target.run('print(1)\nx = 1/0', context);
    expect(failed).toMatchObject({
      outcome: 'error',
      error: { type: 'ZeroDivisionError', message: 'ZeroDivisionError: divide by zero', traceback: 'Traceback (most recent call last):\n  File "<stdin>", line 2, in <module>\nZeroDivisionError: divide by zero' },
    });
    expect(context.text()).toBe('1\n');

    const loopContext = fakeContext(2);
    const running = target.run("import time\nwhile True:\n    print('tick')\n    time.sleep(0.05)", loopContext);
    await expect.poll(() => loopContext.text('stdout').includes('tick'), { timeout: 3000 }).toBe(true);
    target.stop();
    const stopped = await running;
    expect(stopped.outcome).toBe('stopped');
    expect(stopped.error).toBeUndefined();
    expect(loopContext.text()).not.toContain('KeyboardInterrupt');
  });

  it('실행 중에 선이 빠지면 BoardDisconnected와 다시 연결 안내', async () => {
    const { ports, connection } = setup([{ device: micropython() }]);
    await connection.connect();
    const context = fakeContext();
    const running = createRealBoardRunTarget(connection, { flushMs: 5 }).run("import time\nwhile True:\n    print('t')\n    time.sleep(0.05)", context);
    await expect.poll(() => context.text('stdout').length > 0, { timeout: 3000 }).toBe(true);
    ports[0]!.unplug();
    const result = await running;
    expect(result).toMatchObject({ outcome: 'error', error: { type: 'BoardDisconnected' } });
    expect(context.text('notice')).toContain(RUN_NOTICES.disconnected);
  });

  it('결과 모양 바꾸기(execToRunResult·errorToRunResult)', () => {
    const base: ExecResult = { outcome: 'ok', stdout: '', stderr: '', error: null, transfer: 'raw-paste', softReboot: false, resetKind: null, stopRequested: false, stopUnconfirmed: false, durationMs: 12 };
    const nameError = { type: 'NameError', message: "NameError: name 'x' isn't defined", traceback: 'Traceback …' };
    expect(execToRunResult(base, 1)).toEqual({ runId: 1, outcome: 'ok', durationMs: 12 });
    expect(execToRunResult({ ...base, softReboot: true }, 1)).toEqual({ runId: 1, outcome: 'ok', exitCode: null, durationMs: 12 });
    expect(execToRunResult({ ...base, outcome: 'reset', resetKind: 'soft' }, 1)).toMatchObject({ outcome: 'ok', exitCode: null });
    expect(execToRunResult({ ...base, outcome: 'reset', resetKind: 'hard' }, 1)).toMatchObject({ outcome: 'error', error: { type: 'BoardReset' } });
    expect(execToRunResult({ ...base, outcome: 'error', error: nameError }, 1)).toMatchObject({ outcome: 'error', error: nameError });
    expect(execToRunResult({ ...base, stopRequested: true }, 1)).toMatchObject({ outcome: 'stopped' });
    expect(execToRunResult({ ...base, outcome: 'interrupted', stopRequested: true, stopUnconfirmed: true }, 1)).toMatchObject({ outcome: 'stopped' });
    expect(execToRunResult({ ...base, outcome: 'error', error: nameError, stopRequested: true }, 1)).toMatchObject({ outcome: 'error', error: nameError });
    expect(execToRunResult({ ...base, outcome: 'interrupted', error: { type: 'KeyboardInterrupt', message: 'KeyboardInterrupt:', traceback: '' } }, 1)).toMatchObject({ outcome: 'error', error: { type: 'KeyboardInterrupt' } });
    expect(errorToRunResult(new SerialClosedError(), 2, 5)).toEqual({ result: { runId: 2, outcome: 'stopped', durationMs: 5 }, notice: RUN_NOTICES.closed });
    expect(errorToRunResult(new Error('boom'), 2, 5).result).toMatchObject({ outcome: 'error', error: { type: 'RunTargetError' } });
  });

  it('input()을 쓰는 코드는 입력줄 안내를 먼저 남기고 실행한다(보낼 줄이 없으면 [정지]로 끝 — 보내기는 real-board-input.test.ts)', async () => {
    expect(usesInput("name = input('이름? ')")).toBe(true);
    expect(usesInput('x = int(input())')).toBe(true);
    expect(usesInput("# input()은 주석\nprint('x')")).toBe(false);
    expect(usesInput('my_input(3)\nsys.stdin.input(1)')).toBe(false);
    const { connection } = setup([{ device: micropython() }]);
    await connection.connect();
    const context = fakeContext();
    const running = createRealBoardRunTarget(connection, { flushMs: 5 }).run("name = input('이름? ')", context);
    await expect.poll(() => context.text('stdout').includes('이름? '), { timeout: 3000 }).toBe(true);
    expect(context.text('notice')).toContain(RUN_NOTICES.input);
    connection.stop();
    expect((await running).outcome).toBe('stopped');
  });

  it('OutputBuffer는 짧은 조각을 모아 한 번에 쓴다', async () => {
    const writes: string[] = [];
    const buffer = new OutputBuffer((text) => writes.push(text), 20);
    buffer.push('a');
    buffer.push('b\n');
    buffer.push('');
    expect(writes).toEqual([]);
    await sleep(40);
    expect(writes).toEqual(['ab\n']);
    buffer.push('c');
    buffer.flush();
    expect(writes).toEqual(['ab\n', 'c']);
  });
});
