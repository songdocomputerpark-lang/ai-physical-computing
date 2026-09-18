// boot.py 무한 반복·멈추지 않는 보드 되찾기(P3-08 실제 보드 ② — PLAN §8.3 "boot.py 무한 반복에 막혔을 때 Ctrl-C 반복으로 되찾기")를 모의 시리얼 보드로 확인한다.
// 모의 보드(src/lab/serial/mock/)는 raw REPL 소프트 리셋에서 boot.py를 돌리고(main.py는 건너뜀), RTS로 EN을 누르면 다시 켜진다(자동 리셋 회로).
// "맨 except로 KeyboardInterrupt를 삼키는 반복"은 정한 응답(scripts)으로 만든다 — 반복에 들어가기 전(preMs)에만 Ctrl-C가 듣고, 보드가 리셋되면 끝난다.
// 실물의 부팅 시간·Ctrl-C가 떨어지는 자리는 다르다 — 부록 B-2 19~21번.
import { afterEach, describe, expect, it } from 'vitest';
import { FakeSerial, MicroPythonDevice, MockSerialPort, type MicroPythonDeviceOptions, type MockScript, type SerialDevice } from '../../../src/lab/serial/mock/index.ts';
import { BoardConnection } from '../../../src/lab/serial/board-connection.ts';
import { disableAutorunCommand, findInterruptedAutorun, parseRenamed } from '../../../src/lab/serial/board-recovery.ts';
import { RUN_NOTICES, createRealBoardRunTarget, errorToRunResult } from '../../../src/lab/serial/board-run-target.ts';
import { BoardBusyError } from '../../../src/lab/serial/errors.ts';
import { MicroPythonRepl } from '../../../src/lab/serial/raw-repl.ts';
import { SerialChannel } from '../../../src/lab/serial/serial-channel.ts';
import type { LabRunContext } from '../../../src/lab/controls/lab-shell.ts';
import { stubbornProgramDevice } from './helpers/real-board-devices.ts';
import { FAST_TIMING, sleep } from './helpers/real-board-timing.ts';

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

/** 교과서 3단원 191쪽처럼 boot.py에 저장한 끝나지 않는 반복(Ctrl-C로는 멈춤) */
const LOOP_BOOT = 'import time\nwhile True:\n    time.sleep(0.02)\n';

/** "# swallow <preMs>" 파일: preMs 동안은 Ctrl-C가 듣고, 그 뒤로는 맨 except처럼 KeyboardInterrupt를 삼키며 보드가 리셋될 때까지 돈다 */
const SWALLOW_SCRIPT: MockScript = {
  match: '^# swallow',
  async run(context, code) {
    const preMs = Number(/^# swallow (\d+)/u.exec(code)?.[1] ?? 0);
    const resets = context.device.hardResets + context.device.softResets;
    await context.sleep(preMs);
    // 보드가 리셋되거나 선이 빠지면(전원 꺼짐) 끝난다 — 테스트가 끝난 뒤 타이머가 남지 않게
    while (context.device.mode !== 'off' && context.device.hardResets + context.device.softResets === resets) {
      try {
        await context.sleep(40);
      } catch {
        // 맨 except: KeyboardInterrupt도 삼킨다
      }
    }
  },
};

async function connected(options: MicroPythonDeviceOptions = {}, device: SerialDevice = new MicroPythonDevice({ scripts: [SWALLOW_SCRIPT], ...options })) {
  const port = new MockSerialPort({ device });
  const serial = new FakeSerial({ ports: [port], requireUserActivation: false });
  const connection = new BoardConnection({ serial, timing: FAST_TIMING });
  cleanups.push(async () => {
    connection.dispose();
    await sleep(20);
    port.unplug();
  });
  return { device: device as MicroPythonDevice, port, connection };
}

function fakeContext(): LabRunContext & { text(kind?: string): string } {
  const lines: { text: string; kind: string }[] = [];
  return {
    runCount: 1,
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

describe('트레이스백에서 멈춘 자동 실행 파일 찾기·이름 바꾸기 명령', () => {
  it('가장 바깥 프레임이 boot.py·main.py인 KeyboardInterrupt만, 여러 개면 마지막', () => {
    const boot = 'Traceback (most recent call last):\r\n  File "boot.py", line 3, in <module>\r\nKeyboardInterrupt: \r\n';
    const nested = 'Traceback (most recent call last):\r\n  File "main.py", line 9, in <module>\r\n  File "i2c_lcd.py", line 40, in putstr\r\nKeyboardInterrupt: \r\n';
    const stdin = 'Traceback (most recent call last):\r\n  File "<stdin>", line 2, in <module>\r\nKeyboardInterrupt: \r\n';
    expect(findInterruptedAutorun(boot)).toBe('boot.py');
    expect(findInterruptedAutorun(nested)).toBe('main.py');
    expect(findInterruptedAutorun(stdin)).toBeNull();
    expect(findInterruptedAutorun(`${boot}MicroPython v1.29.0\r\n${nested}`)).toBe('main.py');
    expect(findInterruptedAutorun('Traceback (most recent call last):\r\n  File "boot.py", line 1, in <module>\r\nNameError: x\r\n')).toBeNull();
    expect(parseRenamed('apc:renamed boot_off2.py\n')).toBe('boot_off2.py');
    expect(parseRenamed('')).toBeNull();
  });

  it('이름 바꾸기: 비어 있는 _off 이름을 찾아 바꾼다(지우지 않음, 모의 보드 mini-python에서 돈다)', async () => {
    const device = new MicroPythonDevice({ files: { 'boot.py': "print('boot')\n", 'boot_off.py': '# 지난번에 끈 파일\n' } });
    const port = new MockSerialPort({ device });
    const channel = await SerialChannel.open(port, { baudRate: 115200 });
    cleanups.push(async () => {
      await channel.close().catch(() => undefined);
      port.unplug();
    });
    const repl = new MicroPythonRepl(channel, FAST_TIMING);
    const output = await repl.session((tools) => tools.command(disableAutorunCommand('boot.py')));
    expect(output.error).toBeNull();
    expect(parseRenamed(output.stdout)).toBe('boot_off2.py');
    expect(device.files.snapshot()).toEqual({ 'boot_off.py': '# 지난번에 끈 파일\n', 'boot_off2.py': "print('boot')\n" });
    const missing = await repl.session((tools) => tools.command(disableAutorunCommand('main.py')));
    expect(missing.error?.message).toContain('ENOENT');
  });
});

describe('boot.py가 끝나지 않는 보드 — 소프트 리셋마다 Ctrl-C 되풀이', () => {
  it('[실행]: 처음에는 boot.py를 넉넉히 기다린 뒤 멈추고 알리며, 그다음부터는 곧바로 멈춘다 — 고치면 안내가 사라진다', async () => {
    const { device, connection } = await connected({ files: { 'boot.py': LOOP_BOOT } });
    await sleep(60);
    const snapshot = await connection.connect();
    expect(snapshot.state).toBe('ready');
    // 판별이 boot.py를 멈췄어도 "끝나지 않는 반복"으로 정하지 않는다(오래 걸리는 boot.py일 수 있음)
    expect(snapshot.autorun).toBeNull();
    const target = createRealBoardRunTarget(connection, { flushMs: 5 });
    const context = fakeContext();
    const firstStarted = Date.now();
    const result = await target.run("print('ran')", context);
    expect(result.outcome).toBe('ok');
    expect(context.text('stdout')).toBe('ran\n');
    expect(Date.now() - firstStarted).toBeGreaterThanOrEqual(FAST_TIMING.bootTimeoutMs!);
    expect(context.text('notice')).toContain(RUN_NOTICES.bootLoop);
    expect(connection.snapshot.autorun).toEqual({ file: 'boot.py', stuck: false, disabledAs: null });
    expect(device.executed.filter((item) => item.via === 'boot.py').length).toBeGreaterThanOrEqual(2);
    // 두 번째: 짧은 기다림(bootLoopGraceMs)만, 안내는 한 번만
    const second = fakeContext();
    const secondStarted = Date.now();
    expect((await target.run("print('again')", second)).outcome).toBe('ok');
    expect(Date.now() - secondStarted).toBeLessThan(FAST_TIMING.bootTimeoutMs!);
    expect(second.text('notice')).not.toContain(RUN_NOTICES.bootLoop);
    // boot.py를 고치면(제때 끝남) 반복 안내가 사라진다
    device.files.write('boot.py', "print('boot ok')\n");
    expect((await target.run("print('fixed')", fakeContext())).outcome).toBe('ok');
    expect(connection.snapshot.autorun).toBeNull();
  }, 20_000);

  it('판별 없이도: 첫 소프트 리셋은 넉넉히 기다린 뒤 Ctrl-C, 그다음부터는 곧바로, boot.py를 고치면 잊는다(raw-repl)', async () => {
    const device = new MicroPythonDevice({ files: { 'boot.py': LOOP_BOOT } });
    const port = new MockSerialPort({ device });
    const channel = await SerialChannel.open(port, { baudRate: 115200 });
    cleanups.push(async () => {
      await channel.close().catch(() => undefined);
      port.unplug();
    });
    const repl = new MicroPythonRepl(channel, FAST_TIMING);
    await repl.enterRawRepl();
    expect(repl.bootLoopFile).toBeNull();
    const first = await repl.exec("print('one')");
    expect(first).toMatchObject({ outcome: 'ok', stdout: 'one\n', bootInterrupted: 'boot.py' });
    expect(repl.bootLoopFile).toBe('boot.py');
    const startedAt = Date.now();
    const second = await repl.exec("print('two')");
    expect(second).toMatchObject({ outcome: 'ok', stdout: 'two\n', bootInterrupted: 'boot.py' });
    expect(Date.now() - startedAt).toBeLessThan(FAST_TIMING.bootTimeoutMs!);
    device.files.write('boot.py', "print('boot ok')\n");
    const fixed = await repl.exec("print('three')");
    expect(fixed).toMatchObject({ outcome: 'ok', stdout: 'three\n', bootInterrupted: null });
    expect(repl.bootLoopFile).toBeNull();
  }, 20_000);

  it('Ctrl-C를 삼키는 boot.py: 정해진 횟수만 보내고 BoardBusyError(autorun boot.py), 연결은 busy, [실행] 안내는 [boot.py 끄기]', async () => {
    const { device, port, connection } = await connected({ files: { 'boot.py': "print('boot')\n" } });
    expect((await connection.connect()).state).toBe('ready');
    device.files.write('boot.py', '# swallow 0\n');
    const before = port.writtenText().length;
    const failure = await connection.run("print('x')").then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(BoardBusyError);
    expect((failure as BoardBusyError).autorun).toBe('boot.py');
    expect(connection.snapshot).toMatchObject({ state: 'busy', autorun: { file: 'boot.py', stuck: true, disabledAs: null } });
    // 소프트 리셋(Ctrl-C·Ctrl-D) 뒤 Ctrl-C를 정해진 횟수(bootInterruptAttempts)만
    const sent = port.writtenText().slice(before);
    const afterReset = sent.slice(sent.indexOf('\x03\x04') + 2);
    expect(afterReset).toBe('\x03'.repeat(FAST_TIMING.bootInterruptAttempts!));
    expect(errorToRunResult(failure, 1, 0).notice).toBe(RUN_NOTICES.busyBootPy);
  }, 20_000);
});

describe('[보드 되찾기] — Ctrl-C 되풀이 → 보드를 다시 켜며 되풀이 → [boot.py 끄기]', () => {
  it('KeyboardInterrupt를 삼키는 boot.py에 막힌 보드: RTS로 다시 켜며 멈추고, 이름을 바꾸면 다시 [실행]된다', async () => {
    const { device, port, connection } = await connected({ files: { 'boot.py': "print('boot')\n" } });
    expect((await connection.connect()).state).toBe('ready');
    device.files.write('boot.py', '# swallow 400\n');
    await expect(connection.run("print('x')")).rejects.toBeInstanceOf(BoardBusyError);
    expect(connection.state).toBe('busy');

    const stages: string[] = [];
    connection.subscribe((snapshot) => {
      const stage = snapshot.recoveryStage;
      if (stage && stages.at(-1) !== stage) {
        stages.push(stage);
      }
    });
    const signalsBefore = port.signalLog.length;
    const hardResetsBefore = device.hardResets;
    const snapshot = await connection.recover();
    expect(snapshot.state).toBe('ready');
    expect(stages).toEqual(['interrupt', 'reset']);
    // RTS 켬·DTR 끔(EN 누름) → RTS 끔: 보통 부팅(다운로드 모드 아님)
    expect(port.signalLog.slice(signalsBefore).some((item) => item.requestToSend && !item.dataTerminalReady)).toBe(true);
    expect(device.hardResets).toBe(hardResetsBefore + 1);
    expect(snapshot.autorun).toEqual({ file: 'boot.py', stuck: true, disabledAs: null });
    expect(snapshot.banner?.version).toBe('v1.29.0');

    const disabled = await connection.disableAutorun();
    expect(disabled).toMatchObject({ state: 'ready', autorun: { file: 'boot.py', disabledAs: 'boot_off.py' } });
    expect(Object.keys(device.files.snapshot())).toEqual(['boot_off.py']);
    const result = await connection.run("print('free')");
    expect(result).toMatchObject({ outcome: 'ok', stdout: 'free\n', bootInterrupted: null });
  }, 30_000);

  it('켤 때마다 도는 main.py가 멈춤 신호를 삼키는 보드: 판별은 대답 없음 → 되찾으면 ready와 main.py 안내', async () => {
    const { connection } = await connected({ files: { 'main.py': '# swallow 400\n' } });
    await sleep(500); // 전원이 들어오고 main.py가 삼키는 반복에 들어갈 때까지
    const first = await connection.connect();
    expect(first).toMatchObject({ state: 'no-micropython', verdict: { kind: 'silent' } });
    const snapshot = await connection.recover();
    expect(snapshot).toMatchObject({ state: 'ready', autorun: { file: 'main.py', stuck: true, disabledAs: null } });
    // raw REPL 소프트 리셋은 main.py를 돌리지 않으므로 [실행]은 된다
    expect((await connection.run("print('ok')")).stdout).toBe('ok\n');
  }, 30_000);

  it('어떻게 해도 프롬프트가 오지 않으면(Ctrl-C를 듣지 않고 계속 찍는 보드) busy + recover-failed', async () => {
    const { connection } = await connected({}, stubbornProgramDevice());
    expect((await connection.connect()).state).toBe('busy');
    const stages: string[] = [];
    connection.subscribe((snapshot) => {
      const stage = snapshot.recoveryStage;
      if (stage && stages.at(-1) !== stage) {
        stages.push(stage);
      }
    });
    const snapshot = await connection.recover();
    expect(snapshot).toMatchObject({ state: 'busy', problem: { code: 'recover-failed' } });
    expect(stages).toEqual(['interrupt', 'reset', 'press-button']);
    expect(snapshot.recoveryStage).toBeNull();
  }, 30_000);
});
