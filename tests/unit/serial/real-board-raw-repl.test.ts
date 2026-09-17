// 실제 보드 raw REPL 규약(src/lab/serial/raw-repl.ts + serial-channel.ts)을 모의 시리얼 보드(src/lab/serial/mock/)에 대고 확인한다(P3-07 완료 기준:
// "모의 시리얼 스트림으로 배너 판별·실행·오류·정지 순서가 모두 맞다", SPEC §12 raw REPL 프로토콜 단위 테스트).
// 보드 쪽 규약은 MicroPython v1.29.0 docs/reference/repl.rst·shared/runtime/pyexec.c(모의 보드가 따름), 보낸 바이트 순서는 port.writtenText()로 본다.
import { afterEach, describe, expect, it } from 'vitest';
import { MicroPythonDevice, MockSerialPort, SilentDevice, TextDevice, type MicroPythonDeviceOptions, type SerialDevice } from '../../../src/lab/serial/mock/index.ts';
import { BoardBusyError, BoardDisconnectedError } from '../../../src/lab/serial/errors.ts';
import { MicroPythonRepl } from '../../../src/lab/serial/raw-repl.ts';
import { SerialChannel } from '../../../src/lab/serial/serial-channel.ts';
import { noFirmwareDevice, stubbornProgramDevice } from './helpers/real-board-devices.ts';
import { RawReplScriptDevice } from './helpers/raw-repl-script-device.ts';
import { FAST_TIMING, sleep } from './helpers/real-board-timing.ts';

const opened: { port: MockSerialPort; channel: SerialChannel }[] = [];

async function connect(device: SerialDevice | null, portOptions: { deliveryDelayMs?: number; chunkSize?: number } = {}): Promise<{ port: MockSerialPort; channel: SerialChannel; repl: MicroPythonRepl }> {
  const port = new MockSerialPort({ device, ...portOptions });
  const channel = await SerialChannel.open(port, { baudRate: 115200 });
  opened.push({ port, channel });
  return { port, channel, repl: new MicroPythonRepl(channel, FAST_TIMING) };
}

async function connectMicroPython(options: MicroPythonDeviceOptions = {}, portOptions: { deliveryDelayMs?: number; chunkSize?: number } = {}) {
  const device = new MicroPythonDevice(options);
  return { device, ...(await connect(device, portOptions)) };
}

afterEach(async () => {
  for (const { port, channel } of opened.splice(0)) {
    await channel.close().catch(() => undefined);
    port.unplug();
  }
});

describe('판별(probe) — 연결 직후 Ctrl-C·Enter·Ctrl-B로 배너를 받는다', () => {
  it('보통 REPL 보드: 보낸 순서 Ctrl-C → Ctrl-C·Enter → Ctrl-B, v1.29.0 배너와 보드 이름, 리셋 없음', async () => {
    const { device, port, repl } = await connectMicroPython();
    const result = await repl.probe();
    expect(result.verdict).toEqual({
      kind: 'micropython',
      prompt: 'friendly',
      banner: { version: 'v1.29.0', buildDate: '2026-08-24', machine: 'Generic ESP32 module with ESP32', line: 'MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32' },
    });
    expect(result.attempts).toBe(1);
    expect(port.writtenText()).toBe('\x03\x03\r\x02');
    expect(repl.mode).toBe('friendly');
    expect(device.mode).toBe('friendly');
    // 판별은 보드를 리셋하지 않는다(전원이 들어올 때 한 번뿐)
    expect(device.hardResets).toBe(1);
    expect(device.softResets).toBe(0);
  });

  it('main.py가 반복문으로 돌고 있으면 Ctrl-C로 멈추고 판별한다', async () => {
    const { device, repl } = await connectMicroPython({ files: { 'main.py': "import time\nn = 0\nwhile True:\n    n += 1\n    print('tick', n)\n    time.sleep(0.03)\n" } });
    await sleep(80);
    expect(device.mode).toBe('running');
    const result = await repl.probe();
    expect(result.verdict.kind).toBe('micropython');
    expect(result.transcript).toContain('KeyboardInterrupt');
    expect(device.mode).toBe('friendly');
  });

  it('input()을 기다리던 main.py에 빈 줄을 먼저 넣지 않는다(Ctrl-C가 Enter보다 먼저)', async () => {
    const { device, repl } = await connectMicroPython({ files: { 'main.py': "answer = input('> ')\nprint('got', answer)\n" } });
    await sleep(30);
    const result = await repl.probe();
    expect(result.verdict.kind).toBe('micropython');
    expect(result.transcript).not.toContain('got');
    expect(result.transcript).toContain('KeyboardInterrupt');
    expect(device.executed.filter((item) => item.via === 'main.py')).toHaveLength(1);
  });

  it('다른 도구가 raw REPL에 두고 간 보드도 Ctrl-B로 보통 REPL 배너를 받는다', async () => {
    const { device, channel, repl } = await connectMicroPython();
    await channel.write(Uint8Array.of(0x0d, 0x01));
    await sleep(40);
    expect(device.mode).toBe('raw');
    const result = await repl.probe();
    expect(result.verdict).toMatchObject({ kind: 'micropython', prompt: 'friendly', banner: { version: 'v1.29.0' } });
    expect(device.mode).toBe('friendly');
  });

  it('대답 없는 보드는 두 번 물어보고 silent', async () => {
    const silent = new SilentDevice();
    const { repl } = await connect(silent);
    const result = await repl.probe();
    expect(result.verdict).toEqual({ kind: 'silent' });
    expect(result.attempts).toBe(2);
    expect(repl.mode).toBe('unknown');
  }, 15_000);

  it('다른 펌웨어(쓸 때마다 글만 보냄) → other-output', async () => {
    const other = await connect(new TextDevice('Hello from another firmware\r\n'));
    expect((await other.repl.probe()).verdict).toEqual({ kind: 'other-output', garbled: false });
  }, 15_000);

  it('펌웨어가 지워진 ESP32(부팅 글 되풀이) → no-firmware', async () => {
    const erased = await connect(noFirmwareDevice());
    expect((await erased.repl.probe()).verdict).toEqual({ kind: 'no-firmware', evidence: 'invalid-header' });
  }, 15_000);

  it('CircuitPython 배너 → other-python(한 번에 끝)', async () => {
    const circuit = await connect(new TextDevice('\r\nAdafruit CircuitPython 9.2.1 on 2024-11-20; Adafruit Feather ESP32-S2 with ESP32S2\r\n>>> '));
    const result = await circuit.repl.probe();
    expect(result.verdict).toEqual({ kind: 'other-python', name: 'CircuitPython 9.2.1' });
    expect(result.attempts).toBe(1);
  }, 15_000);

  it('Ctrl-C를 삼키며 계속 찍는 프로그램 → 세 번 물어보고 busy', async () => {
    const stubborn = await connect(stubbornProgramDevice());
    const busy = await stubborn.repl.probe();
    expect(busy.verdict).toEqual({ kind: 'busy' });
    expect(busy.attempts).toBe(3);
    expect(stubborn.repl.mode).toBe('busy');
  }, 15_000);
});

describe('실행(exec) — raw REPL + 소프트 리셋 + raw-paste, 출력·오류·정지', () => {
  it('처음 실행: Ctrl-C로 멈춤 → raw REPL → 소프트 리셋 → raw-paste로 보내고 출력을 흘려받는다', async () => {
    const { device, port, repl } = await connectMicroPython();
    await repl.probe();
    const chunks: string[] = [];
    const stages: string[] = [];
    const result = await repl.exec("print('안녕', 1 + 2)\nfor i in range(3):\n    print(i)", { onStdout: (text) => chunks.push(text), onStage: (stage) => stages.push(stage) });
    expect(result).toMatchObject({ outcome: 'ok', stdout: '안녕 3\n0\n1\n2\n', stderr: '', error: null, transfer: 'raw-paste', softReboot: false, stopRequested: false });
    expect(chunks.join('')).toBe('안녕 3\n0\n1\n2\n');
    expect(stages).toEqual(['soft-reset', 'upload', 'running']);
    expect(device.executed.at(-1)).toEqual({ via: 'raw-paste', code: "print('안녕', 1 + 2)\nfor i in range(3):\n    print(i)" });
    expect(device.softResets).toBe(1);
    expect(device.mode).toBe('raw');
    expect(repl.mode).toBe('raw');
    expect(repl.rawPasteSupported).toBe(true);
    // 보낸 순서: 판별 → "\r\x03\x03" → "\r\x01" → Ctrl-C + Ctrl-D(소프트 리셋) → "\x05A\x01" → 코드 → \x04
    const written = port.writtenText();
    const after = written.slice('\x03\x03\r\x02'.length);
    expect(after.startsWith('\r\x03\x03\r\x01\x03\x04\x05A\x01')).toBe(true);
    expect(after.endsWith('\x04')).toBe(true);
    expect(device.flowControlOverrun).toBe(0);
  });

  it('두 번째 실행은 raw 프롬프트에서 바로 소프트 리셋한다(Timer·핀이 남지 않게 매번)', async () => {
    const { device, port, repl } = await connectMicroPython();
    await repl.probe();
    await repl.exec("print('one')");
    const before = port.writtenText().length;
    const second = await repl.exec("print('two')");
    expect(second.stdout).toBe('two\n');
    expect(port.writtenText().slice(before).startsWith('\x03\x04\x05A\x01')).toBe(true);
    expect(device.softResets).toBe(2);
  });

  it('긴 한글 코드도 창(128바이트)을 지켜 보낸다 — 흐름 제어를 어긴 바이트 0', async () => {
    const { device, repl } = await connectMicroPython({}, { chunkSize: 16 });
    const code = `x = 7\n# ${'가'.repeat(700)}\nprint(x * 6)\n`;
    expect(new TextEncoder().encode(code).length).toBeGreaterThan(2000);
    const result = await repl.exec(code);
    expect(result.stdout).toBe('42\n');
    expect(device.flowControlOverrun).toBe(0);
    expect(device.executed.at(-1)?.code).toBe(code);
  });

  it('raw-paste를 모르는 옛 펌웨어면 보통 raw 모드(256바이트씩 → \\x04 → OK)로 보낸다', async () => {
    const { device, repl } = await connectMicroPython({ rawPaste: false });
    const result = await repl.exec("print('old')");
    expect(result).toMatchObject({ outcome: 'ok', stdout: 'old\n', transfer: 'raw' });
    expect(repl.rawPasteSupported).toBe(false);
    expect(device.executed.at(-1)?.via).toBe('raw');
    const again = await repl.exec("print('again')");
    expect(again).toMatchObject({ stdout: 'again\n', transfer: 'raw' });
  });

  it('오류: 출력은 오류 전까지, 트레이스백은 오류 정보(종류·마지막 줄·<stdin> 줄 번호)로', async () => {
    const { repl } = await connectMicroPython();
    const result = await repl.exec('print(1)\nx = 1/0\nprint(2)');
    expect(result.outcome).toBe('error');
    expect(result.stdout).toBe('1\n');
    expect(result.error).toEqual({
      type: 'ZeroDivisionError',
      message: 'ZeroDivisionError: divide by zero',
      traceback: 'Traceback (most recent call last):\n  File "<stdin>", line 2, in <module>\nZeroDivisionError: divide by zero',
    });
    const syntax = await repl.exec('print(');
    expect(syntax.error).toMatchObject({ type: 'SyntaxError', message: 'SyntaxError: invalid syntax' });
    const name = await repl.exec('print(missing)');
    expect(name.error?.message).toBe("NameError: name 'missing' isn't defined");
    // 오류 뒤에도 보드는 raw 프롬프트에서 다음 코드를 받는다
    expect((await repl.exec("print('ok')")).stdout).toBe('ok\n');
  });

  it('정지: 도는 코드에 Ctrl-C → KeyboardInterrupt로 끝나고, 다음 실행이 된다', async () => {
    const { device, port, repl } = await connectMicroPython();
    const seen: string[] = [];
    const running = repl.exec("import time\nwhile True:\n    print('tick')\n    time.sleep(0.05)", { onStdout: (text) => seen.push(text) });
    await expect.poll(() => seen.join('').includes('tick'), { timeout: 3000 }).toBe(true);
    const before = port.writtenText().length;
    repl.requestStop();
    const result = await running;
    expect(result).toMatchObject({ outcome: 'interrupted', stopRequested: true, stopUnconfirmed: false });
    expect(result.error?.type).toBe('KeyboardInterrupt');
    expect(port.writtenText().slice(before)).toMatch(/^\x03+$/u);
    expect(device.mode).toBe('raw');
    expect((await repl.exec("print('after')")).stdout).toBe('after\n');
  });

  it('보내는 도중 정지: 더 보내지 않고 Ctrl-C만 — 보드의 \\x04에 \\x04로 답하지 않아 소프트 리셋이 한 번 더 일어나지 않는다', async () => {
    // 보드 → 사이트 바이트가 늦게 닿게(창 알림이 늦음) 해서 보내는 도중에 정지를 누른다
    const { device, port, repl } = await connectMicroPython({}, { deliveryDelayMs: 40 });
    const code = `# ${'a'.repeat(3000)}\nprint('never')\n`;
    const stages: string[] = [];
    const running = repl.exec(code, { onStage: (stage) => stages.push(stage) });
    await expect.poll(() => stages.includes('upload'), { timeout: 5000 }).toBe(true);
    await sleep(60);
    repl.requestStop();
    const result = await running;
    expect(result.outcome).toBe('interrupted');
    expect(result.stdout).toBe('');
    expect(device.softResets).toBe(1); // 실행 전 소프트 리셋 한 번뿐
    expect(device.executed.some((item) => item.code.includes('never'))).toBe(false);
    expect(port.writtenText()).not.toContain("print('never')");
    expect(device.mode).toBe('raw');
    expect((await repl.exec("print('next')")).stdout).toBe('next\n');
    expect(device.softResets).toBe(2);
  });

  it('Ctrl-C를 삼키는 프로그램: 정해진 횟수만 보내고 "멈춤 확인 못 함"으로 끝낸다', async () => {
    const { device, port, repl } = await connectMicroPython({
      scripts: [
        {
          match: '^stubborn',
          async run(context) {
            const started = Date.now();
            while (Date.now() - started < 4000) {
              try {
                context.print('still\n');
                await context.sleep(30);
              } catch {
                // 맨 except처럼 KeyboardInterrupt를 삼킨다
              }
            }
          },
        },
      ],
    });
    const seen: string[] = [];
    const running = repl.exec('stubborn = True', { onStdout: (text) => seen.push(text) });
    await expect.poll(() => seen.join('').includes('still'), { timeout: 3000 }).toBe(true);
    const before = port.writtenText().length;
    repl.requestStop();
    const result = await running;
    expect(result).toMatchObject({ outcome: 'interrupted', stopRequested: true, stopUnconfirmed: true });
    expect(port.writtenText().slice(before)).toBe('\x03\x03\x03\x03');
    expect(repl.mode).toBe('busy');
    expect(device.mode).toBe('running');
  }, 15_000);

  /*
   * (P3-11) 실물 raw REPL에서 sys.exit()과 machine.soft_reset()은 **같은 바이트**를 보낸다: 출력 → \x04\x04 → "MPY: soft reboot" →
   * boot.py → raw REPL 알림(shared/runtime/pyexec.c의 EXEC_FLAG_PRINT_EOF 두 자리 → PYEXEC_FORCED_EXIT → ports/esp32/main.c).
   * 그래서 사이트는 둘을 구별할 수 없고, 오류 없이 끝난 실행(outcome 'ok')에 softReboot 표지를 달아 콘솔에 안내한다
   * (board-run-target.ts RUN_NOTICES.softReboot). 모의 보드도 이 순서를 그대로 흉내 낸다(mock/micropython-device.ts).
   * 하드 리셋(machine.reset())만 \x04 없이 ROM 부팅 글이 와서 outcome 'reset'이다.
   */
  it('sys.exit()·machine.soft_reset()은 소프트 리셋으로 끝나고(오류 아님) machine.reset()은 리셋으로 끝난다 / 다음 실행이 된다', async () => {
    const { device, repl } = await connectMicroPython();
    expect(await repl.exec("import sys\nprint('a')\nsys.exit()\nprint('b')")).toMatchObject({
      outcome: 'ok',
      stdout: 'a\n',
      error: null,
      softReboot: true,
    });
    const soft = await repl.exec('import machine\nmachine.soft_reset()');
    expect(soft).toMatchObject({ outcome: 'ok', error: null, softReboot: true, resetKind: null });
    expect((await repl.exec("print('after soft')")).stdout).toBe('after soft\n');
    const hard = await repl.exec('import machine\nmachine.reset()');
    expect(hard).toMatchObject({ outcome: 'reset', resetKind: 'hard' });
    expect(hard.stdout).toContain('rst:0xc (SW_CPU_RESET)');
    expect(repl.mode).toBe('friendly');
    expect(device.mode).toBe('friendly');
    expect((await repl.exec("print('after hard')")).stdout).toBe('after hard\n');
  });

  it('boot.py가 끝나지 않는 보드: 소프트 리셋 뒤 Ctrl-C로 raw 프롬프트를 되찾는다', async () => {
    const { device, repl } = await connectMicroPython({ files: { 'boot.py': 'import time\nwhile True:\n    time.sleep(0.02)\n' } });
    expect((await repl.probe()).verdict.kind).toBe('micropython');
    const result = await repl.exec("print('ran')");
    expect(result).toMatchObject({ outcome: 'ok', stdout: 'ran\n' });
    expect(device.executed.filter((item) => item.via === 'boot.py').length).toBeGreaterThanOrEqual(2);
  }, 15_000);

  it('Ctrl-C를 듣지 않는 보드에는 raw REPL로 들어가지 못해 BoardBusyError', async () => {
    const { repl } = await connect(stubbornProgramDevice());
    await expect(repl.exec("print('x')")).rejects.toBeInstanceOf(BoardBusyError);
    expect(repl.mode).toBe('busy');
  }, 15_000);

  it('실행 중에 USB 선이 빠지면 BoardDisconnectedError, 통로는 끊김(lost)', async () => {
    const { port, channel, repl } = await connectMicroPython();
    const seen: string[] = [];
    const running = repl.exec("import time\nwhile True:\n    print('tick')\n    time.sleep(0.05)", { onStdout: (text) => seen.push(text) });
    await expect.poll(() => seen.length > 0, { timeout: 3000 }).toBe(true);
    port.unplug();
    await expect(running).rejects.toBeInstanceOf(BoardDisconnectedError);
    expect(channel.state).toBe('lost');
    expect(channel.end?.reason).toBe('lost');
  });

  it('한 번에 하나만: 실행 중에 판별·다른 실행을 부르면 BoardInUse', async () => {
    const { repl } = await connectMicroPython();
    const running = repl.exec("import time\ntime.sleep(0.3)\nprint('done')");
    await expect(repl.probe()).rejects.toMatchObject({ name: 'BoardInUse' });
    await expect(repl.exec("print('x')")).rejects.toMatchObject({ name: 'BoardInUse' });
    expect((await running).stdout).toBe('done\n');
  });

  it('보드가 받은 순서도 규약 그대로: OK·소프트 리셋 → R\\x01 + 창(0x80 0x00) + \\x01 → 받기 끝 \\x04 → 출력 → \\x04\\x04>', async () => {
    const { port, repl } = await connectMicroPython();
    await repl.probe();
    const before = port.deliveredText().length;
    await repl.exec("print('순서')");
    const delivered = port.deliveredText().slice(before);
    const reboot = delivered.indexOf('OK\r\nMPY: soft reboot\r\nraw REPL; CTRL-B to exit\r\n>');
    const paste = delivered.indexOf('R\x01\x80\x00\x01');
    const ack = delivered.indexOf('\x04', paste);
    expect(reboot).toBeGreaterThanOrEqual(0);
    expect(paste).toBeGreaterThan(reboot);
    expect(ack).toBeGreaterThan(paste);
    expect(delivered.endsWith('\x04\x04>')).toBe(true);
    expect(Buffer.from(delivered.slice(ack + 1, -3), 'latin1').toString('utf8')).toBe('순서\r\n');
  });

  it('"\\x05A\\x01"에 R\\x00(알지만 쓰지 않음)이면 ">" 뒤 보통 raw로 보낸다', async () => {
    const device = new RawReplScriptDevice({ pasteReply: 'R\x00' });
    const { repl } = await connect(device);
    const result = await repl.exec("print('fallback')");
    expect(result).toMatchObject({ outcome: 'ok', stdout: 'fallback\n', transfer: 'raw' });
    expect(repl.rawPasteSupported).toBe(false);
    expect(device.executed).toEqual([{ via: 'raw', code: "print('fallback')" }]);
    expect((await repl.exec("print('again')")).transfer).toBe('raw');
  });

  it('보드가 raw-paste 받기를 먼저 끝내면(긴 코드의 구문 오류) \\x04로 답하고 더 보내지 않으며, 오류는 두 번째 칸으로 받는다', async () => {
    const device = new RawReplScriptDevice({ abortAfter: 200 });
    const { port, repl } = await connect(device);
    const code = `print(\n${'# 긴 주석 '.repeat(200)}\n`;
    expect(new TextEncoder().encode(code).length).toBeGreaterThan(2000);
    const result = await repl.exec(code);
    expect(result).toMatchObject({ outcome: 'error', stdout: '', transfer: 'raw-paste', error: { type: 'SyntaxError', message: 'SyntaxError: invalid syntax' } });
    // 창 두 개(256바이트)까지만 보내고 멈췄다 — 코드 전체를 보내지 않았다
    expect(device.pasteBytes).toBeLessThanOrEqual(256);
    expect(port.writtenText().endsWith('\x04')).toBe(true);
    // 다음 실행은 raw 프롬프트에서 바로 소프트 리셋으로
    expect((await repl.exec("print('next')")).stdout).toBe('next\n');
  });

  it('실물 ESP32처럼 sys.exit()가 \\x04\\x04 뒤 소프트 리셋 글을 보내도 끝을 알아채고 다음 실행이 된다', async () => {
    const device = new RawReplScriptDevice();
    const { repl } = await connect(device);
    const result = await repl.exec("print('bye')\nsys.exit()");
    expect(result).toMatchObject({ outcome: 'ok', stdout: 'bye\n', softReboot: true, error: null });
    expect(repl.mode).toBe('raw');
    const resetsBefore = device.softResets;
    expect((await repl.exec("print('after')")).stdout).toBe('after\n');
    expect(device.softResets).toBe(resetsBefore + 1);
  });

  it('연결을 끊기 전 exitRawRepl은 보통 REPL로 돌려놓는다', async () => {
    const { device, repl } = await connectMicroPython();
    await repl.exec("print('x')");
    expect(device.mode).toBe('raw');
    await repl.exitRawRepl();
    expect(device.mode).toBe('friendly');
    expect(repl.mode).toBe('friendly');
  });
});
