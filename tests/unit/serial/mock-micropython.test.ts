// 모의 MicroPython 보드(src/lab/serial/mock/micropython-device.ts)가 raw REPL·raw-paste·보통 REPL 규약대로 답하는지 확인한다(병렬 제작 준비 2026-09-17).
// 호스트 쪽은 MicroPython tools/pyboard.py와 같은 순서로 움직이는 tests/unit/serial/helpers/raw-repl-host.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { MicroPythonDevice, MockSerialPort, type MicroPythonDeviceOptions } from '../../../src/lab/serial/mock/index.ts';
import { RawReplHost } from './helpers/raw-repl-host.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const hosts: RawReplHost[] = [];

async function connect(options: MicroPythonDeviceOptions = {}): Promise<{ host: RawReplHost; device: MicroPythonDevice; port: MockSerialPort }> {
  const device = new MicroPythonDevice(options);
  const port = new MockSerialPort({ device });
  const host = new RawReplHost(port);
  hosts.push(host);
  await host.open();
  return { host, device, port };
}

afterEach(async () => {
  for (const host of hosts.splice(0)) {
    if (host.port.isOpen) {
      await host.close().catch(() => undefined);
    }
    host.port.unplug();
  }
});

describe('보통 REPL', () => {
  it('포트를 열기 전에 켜진 보드라 배너는 Ctrl-B로 다시 받는다', async () => {
    const { host, device } = await connect();
    expect(device.mode).toBe('friendly');
    expect(device.hardResets).toBe(1);
    await sleep(20);
    expect(host.pendingText()).toBe('');
    await host.write('\x03\x02');
    const text = await host.readUntil('information.\r\n>>> ');
    expect(text).toBe('\r\n>>> \r\nMicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32\r\nType "help()" for more information.\r\n>>> ');
  });

  it('글자를 되울리고 식의 값을 보여 주며, 콜론 줄은 ... 로 이어 받는다', async () => {
    const { host } = await connect();
    await host.write('1+2\r');
    expect(await host.readUntil('>>> ')).toBe('1+2\r\n3\r\n>>> ');
    await host.write('for i in range(2):\r');
    expect(await host.readUntil('... ')).toBe('for i in range(2):\r\n... ');
    await host.write('    print(i)\r');
    await host.readUntil('... ');
    await host.write('\r');
    expect(await host.readUntil('>>> ')).toBe('\r\n0\r\n1\r\n>>> ');
  });

  it('input()은 호스트가 보낸 줄을 되울리며 받는다', async () => {
    const { host } = await connect();
    await host.write("name = input('이름? ')\r");
    // 되울린 줄에도 "이름? "이 있으므로 줄바꿈 뒤의 진짜 물음까지 읽는다
    expect(await host.readText("')\r\n이름? ")).toBe("name = input('이름? ')\r\n이름? ");
    await host.write('철수\r');
    expect(await host.readText('>>> ')).toBe('철수\r\n>>> ');
    await host.write('print(name)\r');
    expect(await host.readText('>>> ')).toBe('print(name)\r\n철수\r\n>>> ');
  });

  it('오류는 MicroPython 모양 트레이스백', async () => {
    const { host } = await connect();
    await host.write('x = 1/0\r');
    expect(await host.readUntil('>>> ')).toBe('x = 1/0\r\nTraceback (most recent call last):\r\n  File "<stdin>", line 1, in <module>\r\nZeroDivisionError: divide by zero\r\n>>> ');
  });

  it('붙여넣기 모드(Ctrl-E)와 빈 줄 Ctrl-D 소프트 리셋', async () => {
    const { host, device } = await connect({ files: { 'boot.py': "print('boot')\n", 'main.py': "print('main')\n" } });
    await host.write('\x05');
    expect(await host.readUntil('=== ')).toBe('\r\npaste mode; Ctrl-C to cancel, Ctrl-D to finish\r\n=== ');
    await host.write("a = 2\rprint(a * 21)\r\x04");
    const pasted = await host.readUntil('>>> ');
    expect(pasted).toContain('42\r\n>>> ');
    await host.write('\x04');
    const rebooted = await host.readUntil('>>> ');
    expect(rebooted).toBe('\r\nMPY: soft reboot\r\nboot\r\nmain\r\n' + device.banner + '>>> ');
    expect(device.softResets).toBe(1);
    expect(device.executed.map((item) => item.via)).toEqual(['boot.py', 'main.py', 'paste', 'boot.py', 'main.py']);
  });
});

describe('raw REPL(pyboard.py 순서)', () => {
  it('enter_raw_repl(soft_reset) → raw-paste로 실행 → 출력과 오류를 \\x04로 나눠 받는다', async () => {
    const { host, device } = await connect();
    await host.enterRawRepl(true);
    expect(device.mode).toBe('raw');
    const result = await host.exec("print('hello')\nprint(1, 2, sep=',')");
    expect(result).toEqual({ output: 'hello\r\n1,2\r\n', error: '', mode: 'raw-paste' });
    expect(device.executed.at(-1)).toEqual({ via: 'raw-paste', code: "print('hello')\nprint(1, 2, sep=',')" });
    // 규약 바이트 그대로: raw-paste 요청 응답 "R\x01" + 창 128(0x80 0x00) + "\x01"
    expect(host.transcript).toContain('R\x01\x80\x00\x01');
  });

  it('오류 트레이스백은 두 번째 칸에, 출력은 오류 전까지', async () => {
    const { host } = await connect();
    await host.enterRawRepl(false);
    const result = await host.exec('print(1)\nx = 1/0\nprint(2)');
    expect(result.output).toBe('1\r\n');
    expect(result.error).toBe('Traceback (most recent call last):\r\n  File "<stdin>", line 2, in <module>\r\nZeroDivisionError: divide by zero\r\n');
    const syntax = await host.exec('print(');
    expect(syntax.error).toBe('Traceback (most recent call last):\r\n  File "<stdin>", line 1\r\nSyntaxError: invalid syntax\r\n');
  });

  it('raw-paste를 끄면(옛 펌웨어) 보통 raw 모드로 되돌아가 OK를 받는다', async () => {
    const { host, device } = await connect({ rawPaste: false });
    await host.enterRawRepl(false);
    const result = await host.exec("print('old')");
    expect(result).toEqual({ output: 'old\r\n', error: '', mode: 'raw' });
    expect(device.executed.at(-1)?.via).toBe('raw');
  });

  it('창 크기를 지키는 호스트는 넘치지 않고, 한꺼번에 쏟는 호스트는 넘침으로 기록된다', async () => {
    const { host, device } = await connect();
    await host.enterRawRepl(false);
    const long = `x = 7\n# ${'가'.repeat(400)}\nprint(x * 6)\n`;
    expect(new TextEncoder().encode(long).length).toBeGreaterThan(1000);
    const result = await host.exec(long);
    expect(result.output).toBe('42\r\n');
    expect(device.flowControlOverrun).toBe(0);

    await host.readUntil('>');
    await host.write('\x05A\x01');
    expect(await host.read(5)).toBe('R\x01\x80\x00\x01');
    await host.write(`${long}\x04`);
    const flood = await host.readUntil('\x04>', 5000);
    expect(flood).toContain('42\r\n');
    expect(device.flowControlOverrun).toBeGreaterThan(0);
  });

  it('실행 중 Ctrl-C는 KeyboardInterrupt 트레이스백으로 끝난다', async () => {
    const { host } = await connect();
    await host.enterRawRepl(false);
    await host.readUntil('>');
    await host.write('import time\nwhile True:\n    time.sleep(0.05)\n\x04');
    expect(await host.read(2)).toBe('OK');
    await sleep(120);
    await host.write('\x03');
    const output = await host.readUntil('\x04');
    const error = await host.readUntil('\x04');
    expect(output).toBe('\x04');
    // 보통은 sleep 줄(3)에서 멈추지만 반복 사이 양보 순간에 닿으면 while 줄(2) — 실물도 멈춘 자리의 줄을 적는다
    expect(error).toMatch(/^Traceback \(most recent call last\):\r\n {2}File "<stdin>", line [23], in <module>\r\nKeyboardInterrupt: \r\n\x04$/u);
    expect(await host.read(1)).toBe('>');
  });

  it('빈 코드 + Ctrl-D는 raw REPL에 머문 채 소프트 리셋(main.py는 돌지 않음)', async () => {
    const { host, device } = await connect({ files: { 'main.py': "print('main')\n" } });
    await host.enterRawRepl(false);
    await host.readUntil('>');
    await host.write('\x04');
    expect(await host.readUntil('raw REPL; CTRL-B to exit\r\n>')).toBe('OK\r\nMPY: soft reboot\r\nraw REPL; CTRL-B to exit\r\n>');
    expect(device.executed.filter((item) => item.via === 'main.py')).toHaveLength(1);
    await host.write('\x02');
    expect(await host.readUntil('>>> ')).toBe(`\r\n${device.banner}>>> `);
    expect(device.mode).toBe('friendly');
  });

  it('"\\x05" 뒤가 A가 아니면 R\\x00 + 프롬프트', async () => {
    const { host } = await connect();
    await host.enterRawRepl(false);
    await host.readUntil('>');
    await host.write('\x05B\x01');
    expect(await host.read(3)).toBe('R\x00>');
  });

  it('mpremote처럼 파일을 쓰고 읽는다', async () => {
    const { host, device } = await connect();
    await host.enterRawRepl(false);
    const write = await host.exec("f=open('main.py','wb')\nw=f.write\nw(b'print(\\'saved\\')\\n')\nf.close()");
    expect(write.error).toBe('');
    expect(device.files.readText('main.py')).toBe("print('saved')\n");
    const listing = await host.exec("import os\nprint(os.listdir())\nwith open('main.py') as f:\n    print(f.read())");
    expect(listing).toEqual({ output: "['main.py']\r\nprint('saved')\r\n\r\n", error: '', mode: 'raw-paste' });
  });

  it('SystemExit는 트레이스백 없이 끝난다', async () => {
    const { host } = await connect();
    await host.enterRawRepl(false);
    expect(await host.exec("import sys\nprint('a')\nsys.exit()\nprint('b')")).toEqual({ output: 'a\r\n', error: '', mode: 'raw-paste' });
  });

  it('scripts로 정한 응답이 mini-python보다 먼저', async () => {
    const { host, device } = await connect({
      scripts: [
        { match: '^import esp32\\b', output: 'temp 42\n' },
        { match: 'bluetooth', error: 'OSError: [Errno 19] ENODEV' },
      ],
    });
    await host.enterRawRepl(false);
    expect(await host.exec('import esp32\nprint(esp32.raw_temperature())')).toEqual({ output: 'temp 42\r\n', error: '', mode: 'raw-paste' });
    const failed = await host.exec('import bluetooth');
    expect(failed.error).toBe('Traceback (most recent call last):\r\n  File "<stdin>", line 1, in <module>\r\nOSError: [Errno 19] ENODEV\r\n');
    device.addScript({ match: /^print\('run'\)$/u, run: async (context) => context.print(`files=${context.files.list('').length}\n`) });
    expect((await host.exec("print('run')")).output).toBe('files=0\r\n');
  });

  it('machine.reset()은 ROM 부팅 글(SW_CPU_RESET)과 배너를 낸다(\\x04 없이)', async () => {
    const { host, device } = await connect();
    await host.enterRawRepl(false);
    await host.readUntil('>');
    await host.write('import machine\nmachine.reset()\x04');
    expect(await host.read(2)).toBe('OK');
    const text = await host.readUntil('>>> ');
    expect(text).toBe(`ets Jul 29 2019 12:21:46\r\n\r\nrst:0xc (SW_CPU_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\r\n${device.banner}>>> `);
    expect(device.hardResets).toBe(2);
    expect(device.mode).toBe('friendly');
  });
});

describe('보드에서 이미 도는 프로그램', () => {
  it('main.py 끝없는 반복을 Ctrl-C로 멈추고 raw REPL로 들어간다(멈추는 동안 보낸 바이트는 REPL이 이어 읽음)', async () => {
    const { host, device } = await connect({ files: { 'main.py': "import time\nn = 0\nwhile True:\n    n += 1\n    print('tick', n)\n    time.sleep(0.03)\n" } });
    await host.readUntil('tick', 2000);
    expect(device.mode).toBe('running');
    await host.enterRawRepl(true);
    expect(device.mode).toBe('raw');
    expect(host.transcript).toContain('KeyboardInterrupt: \r\n');
    expect(host.transcript).toMatch(/File "main\.py", line \d+, in <module>/u);
    expect(device.executed.filter((item) => item.via === 'main.py')).toHaveLength(1);
    expect((await host.exec('print(n)')).error).toContain("NameError: name 'n' isn't defined");
  });

  it('input()을 기다리는 main.py에 한 줄을 보낸다(지우기 글자 포함)', async () => {
    const { host, device } = await connect({ files: { 'main.py': "answer = input('> ')\nprint('got', answer)\n" } });
    await sleep(30);
    expect(device.mode).toBe('running');
    await host.write('ab\x08c\r');
    expect(await host.readUntil('got ac\r\n')).toBe('ab\b \bc\r\ngot ac\r\n');
    expect(await host.readUntil('>>> ')).toBe(`${device.banner}>>> `);
    expect(device.mode).toBe('friendly');
  });

  it('input()을 기다리는 main.py는 Ctrl-C로 멈춘다', async () => {
    const { host, device } = await connect({ files: { 'main.py': "answer = input('> ')\n" } });
    await host.write('\x03');
    expect(await host.readUntil('>>> ')).toBe(`Traceback (most recent call last):\r\n  File "main.py", line 1, in <module>\r\nKeyboardInterrupt: \r\n${device.banner}>>> `);
  });

  it('bootDelayMs 동안 보낸 바이트는 사라진다(실물 부팅 중)', async () => {
    const { host, device } = await connect({ bootDelayMs: 150 });
    void device.hardReset('pin');
    await sleep(10);
    await host.write('\x01');
    await sleep(40);
    expect(device.mode).toBe('booting');
    await host.readUntil('>>> ', 1000);
    expect(device.mode).toBe('friendly');
  });
});

describe('자동 리셋 회로(DTR·RTS)', () => {
  it('esptool ClassicReset 순서면 다운로드 모드, RTS 펄스만 주면 보통 부팅', async () => {
    const { host, device, port } = await connect();
    const handled: number[] = [];
    device.setBootloaderHandler((bytes, io) => {
      handled.push(...bytes);
      io.emit(bytes);
    });
    // esptool-js 0.6.1 lib/reset.js ClassicReset: D0|R1|W100|D1|R0|W50|D0 (setRTS 뒤 setDTR 한 번 더 — usbser.sys 우회)
    await port.setSignals({ dataTerminalReady: false });
    await port.setSignals({ requestToSend: true });
    await port.setSignals({ dataTerminalReady: false });
    expect(device.mode).toBe('reset-held');
    await sleep(100);
    await port.setSignals({ dataTerminalReady: true });
    await port.setSignals({ requestToSend: false });
    await port.setSignals({ dataTerminalReady: true });
    await sleep(50);
    await port.setSignals({ dataTerminalReady: false });
    expect(await host.readUntil('waiting for download\r\n')).toContain('boot:0x3 (DOWNLOAD_BOOT(UART0/UART1/SDIO_REI_REO_V2))');
    expect(device.mode).toBe('bootloader');
    await host.write(Uint8Array.of(0xc0, 0x00));
    await sleep(20);
    expect(handled.length).toBeGreaterThan(0);

    // 굽기 뒤 HardReset: RTS=1(EN 낮음) → 100ms → RTS=0, DTR=0이라 IO0 높음 → 보통 부팅
    await port.setSignals({ requestToSend: true });
    await sleep(100);
    await port.setSignals({ requestToSend: false });
    expect(await host.readUntil('>>> ')).toContain('rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)');
    expect(device.mode).toBe('friendly');
    expect(port.signalLog.at(-1)).toEqual({ dataTerminalReady: false, requestToSend: false, break: false });
  });

  it('포트를 열고 닫는 것만으로는 리셋되지 않는다', async () => {
    const { host, device } = await connect();
    expect(device.hardResets).toBe(1);
    await host.close();
    await host.open();
    await sleep(30);
    expect(device.hardResets).toBe(1);
  });
});
