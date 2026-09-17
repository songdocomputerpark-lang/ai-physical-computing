// raw REPL 도구 명령 묶음(P3-08 — MicroPythonRepl.session·command)의 갈림길을 모의 시리얼 보드로 확인한다:
// raw 프롬프트 빠른 길(Ctrl-C 하나), 그사이 보드가 다시 켜졌거나 보통 REPL로 나가 있으면 전체 순서로 다시 들어가기(명령은 한 번만 실행),
// 명령이 끝나지 않을 때 시간 제한(Ctrl-C로 멈추고 SerialTimeoutError), [정지]·[연결 끊기]로 멈춤(ReplStoppedError).
import { afterEach, describe, expect, it } from 'vitest';
import { MicroPythonDevice, MockSerialPort, type MicroPythonDeviceOptions } from '../../../src/lab/serial/mock/index.ts';
import { ReplStoppedError, SerialTimeoutError } from '../../../src/lab/serial/errors.ts';
import { MicroPythonRepl } from '../../../src/lab/serial/raw-repl.ts';
import { SerialChannel } from '../../../src/lab/serial/serial-channel.ts';
import { FAST_TIMING, sleep } from './helpers/real-board-timing.ts';

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function open(options: MicroPythonDeviceOptions = {}, timing = FAST_TIMING) {
  const device = new MicroPythonDevice(options);
  const port = new MockSerialPort({ device });
  const channel = await SerialChannel.open(port, { baudRate: 115200 });
  cleanups.push(async () => {
    await channel.close().catch(() => undefined);
    port.unplug();
  });
  return { device, port, channel, repl: new MicroPythonRepl(channel, timing) };
}

describe('도구 명령 묶음(session·command)', () => {
  it('처음엔 전체 순서로 raw REPL에 들어가고, 이어지는 명령은 Ctrl-C 하나 뒤 곧바로 raw-paste로 보낸다', async () => {
    const { device, port, repl } = await open();
    await repl.session(async (tools) => {
      expect((await tools.command("print('one')")).stdout).toBe('one\n');
      const before = port.writtenText().length;
      expect((await tools.command("print('two')")).stdout).toBe('two\n');
      expect(port.writtenText().slice(before).startsWith('\x03\x05A\x01')).toBe(true);
    });
    expect(device.executed.map((item) => item.code)).toEqual(["print('one')", "print('two')"]);
    expect(device.softResets).toBe(0);
    expect(repl.mode).toBe('raw');
  });

  it('softReset이면 mpremote처럼 먼저 한 번 소프트 리셋한다', async () => {
    const { device, repl } = await open();
    await repl.session((tools) => tools.command("print('x')"), { softReset: true });
    expect(device.softResets).toBe(1);
  });

  it('raw 프롬프트인 줄 알았는데 보드가 보통 REPL이면(raw-paste 답이 어긋남) 전체 순서로 다시 들어가 명령을 한 번만 실행한다', async () => {
    const { device, channel, repl } = await open();
    await repl.session((tools) => tools.command("print('first')"));
    expect(repl.mode).toBe('raw');
    // 다른 도구가 보드를 보통 REPL로 돌려놓았고, 그 배너는 이미 지나갔다(버퍼에 흔적이 없음)
    await channel.write(Uint8Array.of(0x0d, 0x02));
    await sleep(80);
    channel.take();
    expect(device.mode).toBe('friendly');
    const output = await repl.session((tools) => tools.command("print('again')"));
    expect(output.stdout).toBe('again\n');
    expect(device.executed.filter((item) => item.code === "print('again')")).toHaveLength(1);
    expect(repl.mode).toBe('raw');
  });

  it('그사이 보드가 다시 켜진 흔적(부팅 글·배너)이 버퍼에 있으면 빠른 길을 쓰지 않는다 — EN을 눌러 main.py가 도는 보드도 곧바로 실행', async () => {
    const { device, repl } = await open({ files: { 'main.py': "import time\nwhile True:\n    time.sleep(0.05)\n" } });
    await repl.exec("print('before')");
    void device.hardReset('pin');
    await sleep(150);
    expect(device.mode).toBe('running');
    const startedAt = Date.now();
    const result = await repl.exec("print('after reset')");
    expect(result).toMatchObject({ outcome: 'ok', stdout: 'after reset\n', bootInterrupted: null });
    // 소프트 리셋 뒤 main.py를 기다리는 긴 시간(bootTimeoutMs)을 쓰지 않았다
    expect(Date.now() - startedAt).toBeLessThan(FAST_TIMING.bootTimeoutMs!);
  });

  it('명령이 시간 안에 끝나지 않으면 Ctrl-C로 멈추고 SerialTimeoutError, 다음 명령은 된다', async () => {
    const { device, repl } = await open({ scripts: [{ match: '^slow', output: 'working\n', delayMs: 5000 }] }, { ...FAST_TIMING, commandTimeoutMs: 300 });
    const failure = await repl
      .session((tools) => tools.command('slow = 1'))
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(SerialTimeoutError);
    expect(device.mode).toBe('raw');
    expect((await repl.session((tools) => tools.command("print('next')"))).stdout).toBe('next\n');
  });

  it('[정지]·[연결 끊기](requestStop)면 도는 명령을 Ctrl-C로 멈추고 ReplStoppedError, 다음 명령을 보내지 않는다', async () => {
    const { device, repl } = await open({ scripts: [{ match: '^slow', output: 'working\n', delayMs: 5000 }] });
    const running = repl.session(async (tools) => {
      await tools.command('slow = 1');
      await tools.command("print('never')");
    });
    await sleep(300);
    repl.requestStop();
    await expect(running).rejects.toBeInstanceOf(ReplStoppedError);
    expect(device.executed.some((item) => item.code === "print('never')")).toBe(false);
    expect(repl.isBusy).toBe(false);
    expect((await repl.session((tools) => tools.command("print('ok')"))).stdout).toBe('ok\n');
  });

  it('도구 명령은 묶음 밖에서 부를 수 없고, 묶음이 도는 동안 다른 일은 BoardInUse', async () => {
    const { repl } = await open({ scripts: [{ match: '^slow', delayMs: 300 }] });
    let captured: { command(code: string): Promise<unknown> } | null = null;
    const running = repl.session(async (tools) => {
      captured = tools;
      await tools.command('slow = 1');
    });
    await sleep(50);
    await expect(repl.exec("print('x')")).rejects.toMatchObject({ name: 'BoardInUse' });
    await expect(repl.probe()).rejects.toMatchObject({ name: 'BoardInUse' });
    await running;
    await expect(captured!.command("print('late')")).rejects.toMatchObject({ name: 'BoardInUse' });
  });
});
