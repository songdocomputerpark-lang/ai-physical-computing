// (실험) USB 한 개로 보내기 — PLAN §7.3이 "raw REPL과 섞일 때 동작 미확인"이라고 적어 둔 길을 모의 시리얼로 실제로 시험한다(P4-05).
// 여기서 나온 결과가 src/lab/serial/data-port/single-usb.ts 머리말의 ①~⑥이다. 실물 확인은 운영자 몫(부록 B-2)이다.
import { afterEach, describe, expect, it } from 'vitest';
import { checkSingleUsbLine, SINGLE_USB_TEMPLATE } from '../../../src/lab/serial/data-port/index.ts';
import { prepareBoardInputLine } from '../../../src/lab/serial/board-input.ts';
import { MicroPythonDevice, MockSerialPort, type MicroPythonDeviceOptions } from '../../../src/lab/serial/mock/index.ts';
import { MicroPythonRepl, type ExecStage } from '../../../src/lab/serial/raw-repl.ts';
import { SerialChannel } from '../../../src/lab/serial/serial-channel.ts';
import { FAST_TIMING, sleep } from './helpers/real-board-timing.ts';

const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function open(options: MicroPythonDeviceOptions = {}) {
  const device = new MicroPythonDevice({ timeScale: 0.05, ...options });
  const port = new MockSerialPort({ device });
  const channel = await SerialChannel.open(port, { baudRate: 115200 });
  cleanups.push(async () => {
    await channel.close().catch(() => undefined);
    port.unplug();
  });
  return { device, port, channel, repl: new MicroPythonRepl(channel, FAST_TIMING) };
}

/** test()가 참이 될 때까지(최대 limitMs) 기다린다 */
async function until(test: () => boolean, limitMs = 3000): Promise<boolean> {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    if (test()) {
      return true;
    }
    await sleep(10);
  }
  return test();
}

/** 코드를 실행하고 "도는 중"이 될 때까지 기다린다(그때부터 sendInput이 나간다) */
async function startRun(repl: MicroPythonRepl, code: string) {
  const chunks: string[] = [];
  let stage: ExecStage | '' = '';
  const run = repl.exec(code, {
    onStdout: (text) => chunks.push(text),
    onStage: (value) => (stage = value),
  });
  await until(() => stage === 'running');
  return { run, chunks, output: () => chunks.join('') };
}

const READ_LOOP = "while True:\n    cmd = input()\n    print('got ' + cmd)\n";

describe('① 보드 REPL 포트로 보낸 한 줄이 도는 프로그램에 닿는다', () => {
  it('input()으로 기다리는 프로그램이 컴퓨터가 보낸 줄을 받는다', async () => {
    const { repl } = await open();
    const { run, output } = await startRun(repl, READ_LOOP);
    expect(repl.sendInput(prepareBoardInputLine('a').bytes)).toBe(true);
    expect(await until(() => output().includes('got a'))).toBe(true);
    repl.requestStop();
    const result = await run;
    expect(result.outcome).toBe('interrupted');
  });

  it('② 보드가 받은 글자를 되울려 콘솔에 섞인다(input()의 readline)', async () => {
    const { repl } = await open();
    const { run, output } = await startRun(repl, READ_LOOP);
    repl.sendInput(prepareBoardInputLine('b').bytes);
    await until(() => output().includes('got b'));
    // 보낸 글자 'b'가 프로그램 출력('got b')보다 먼저 콘솔에 되울려 온다 → 브릿지가 초당 여러 줄을 보내면 콘솔이 덮인다
    expect(output().indexOf('b')).toBeLessThan(output().indexOf('got b'));
    expect(output().startsWith('b\n')).toBe(true);
    repl.requestStop();
    await run;
  });

  it('실행 중이 아닐 때는 보내지 않는다(sendInput이 거짓)', async () => {
    const { repl } = await open();
    expect(repl.sendInput(prepareBoardInputLine('a').bytes)).toBe(false);
  });
});

describe('③ 프로그램이 읽지 않는 동안 보낸 바이트는 남았다가 raw REPL로 흘러간다', () => {
  it('프로그램이 늦게 input()을 불러도 먼저 보낸 줄을 읽는다(보드 stdin 버퍼)', async () => {
    const { repl } = await open();
    const { run, output } = await startRun(repl, "import time\ntime.sleep(0.3)\nprint('reading')\ncmd = input()\nprint('got ' + cmd)\n");
    repl.sendInput(prepareBoardInputLine('a').bytes);
    const result = await run;
    expect(result.outcome).toBe('ok');
    // 'reading' 뒤에 되울림 'a'가 보이고 그다음에 프로그램 출력이 온다
    expect(output()).toBe('reading\na\ngot a\n');
  });

  it('남은 글자는 실행되지 않고 raw REPL 입력 칸에 쌓이며, 다음 [실행]의 Ctrl-C가 지운다', async () => {
    const { device, repl } = await open();
    const { run } = await startRun(repl, 'import time\nwhile True:\n    time.sleep(0.05)\n');
    // 프로그램은 input()을 부르지 않는다 → 보낸 바이트는 보드 stdin 버퍼에 쌓인다
    repl.sendInput(new TextEncoder().encode("print('끼어들기')\r"));
    await sleep(60);
    repl.requestStop();
    await run;
    expect(device.mode).toBe('raw');
    expect(device.executed.some((item) => item.code.includes('끼어들기'))).toBe(false);
    const next = await repl.exec("print('next')");
    expect(next.outcome).toBe('ok');
    expect(next.stdout).toBe('next\n');
  });

  it('데이터에 0x04(Ctrl-D)가 섞이면 남아 있던 글자가 보드에서 코드로 실행된다 — 이것이 "섞임"의 정체', async () => {
    const { device, repl } = await open();
    const { run } = await startRun(repl, 'import time\nwhile True:\n    time.sleep(0.05)\n');
    repl.sendInput(new TextEncoder().encode(`print('sneaky')\r${String.fromCharCode(4)}`));
    await sleep(60);
    repl.requestStop();
    await run;
    // 사이트가 보낸 적 없는 코드가 raw REPL에서 실행됐다
    const leaked = device.executed.find((item) => item.code.includes('sneaky'));
    expect(leaked?.via).toBe('raw');
    // 그래도 다음 [실행]은 사이트가 되찾는다(실행마다 Ctrl-C + raw REPL을 새로 잡는다)
    const next = await repl.exec("print('next')");
    expect(next.outcome).toBe('ok');
  });

  it('데이터에 0x02(Ctrl-B)가 섞이면 보드가 보통 REPL로 나가고, 사이트는 다음 실행에서 되찾는다', async () => {
    const { device, repl } = await open();
    const { run } = await startRun(repl, 'import time\nwhile True:\n    time.sleep(0.05)\n');
    repl.sendInput(Uint8Array.of(0x02));
    await sleep(60);
    repl.requestStop();
    await run;
    expect(device.mode).toBe('friendly');
    const next = await repl.exec("print('next')");
    expect(next.outcome).toBe('ok');
    expect(next.stdout).toBe('next\n');
  });
});

describe('④ 제어 바이트는 데이터가 아니다', () => {
  it('0x03(Ctrl-C)을 데이터처럼 보내면 프로그램이 멈춘다', async () => {
    const { repl } = await open();
    const { run, output } = await startRun(repl, READ_LOOP);
    // 원시 바이트 예제(f007)는 0x01~0x04를 보낸다 — 그중 0x03이 이 길에서는 "멈춤" 신호다
    repl.sendInput(Uint8Array.of(0x03));
    const result = await run;
    expect(result.outcome).toBe('interrupted');
    expect(output()).not.toContain('got');
  });

  it('검사 함수가 제어 바이트를 미리 잡아낸다', () => {
    const check = checkSingleUsbLine(`a${String.fromCharCode(3)}b`);
    expect(check.safe).toBe(false);
    expect(check.warnings.some((warning) => warning.code === 'control' && warning.text.includes('Ctrl-C'))).toBe(true);
    expect(checkSingleUsbLine('a').safe).toBe(true);
  });
});

describe('⑤⑥ 한글과 길이', () => {
  it('한글 바이트는 보드가 버린다(영어·숫자·기호만 줄에 들어간다)', async () => {
    const { channel, repl } = await open();
    const { run, output } = await startRun(repl, READ_LOOP);
    // 사이트가 거르지 않고 그대로 보냈다고 하고 보드의 동작을 본다
    await channel.write(new TextEncoder().encode('안a\r'));
    expect(await until(() => output().includes('got '))).toBe(true);
    expect(output()).toContain('got a');
    repl.requestStop();
    await run;
  });

  it('검사 함수가 한글·길이·빈 줄을 한국어로 알린다', () => {
    const korean = checkSingleUsbLine('안녕a');
    expect(korean.line.text).toBe('a');
    expect(korean.warnings.some((warning) => warning.code === 'non-ascii')).toBe(true);
    const long = checkSingleUsbLine('x'.repeat(300));
    expect(long.warnings.some((warning) => warning.code === 'too-long')).toBe(true);
    expect(long.line.text).toHaveLength(250);
    const blank = checkSingleUsbLine('   ');
    expect(blank.safe).toBe(false);
    expect(blank.warnings.some((warning) => warning.code === 'empty')).toBe(true);
    expect(checkSingleUsbLine('').warnings.some((warning) => warning.code === 'empty')).toBe(true);
  });
});

describe('보드에 올리는 템플릿', () => {
  it('a·b 명령을 input()으로 받는 짧은 코드다(실습실 [실행]에 그대로 넣을 수 있게)', () => {
    expect(SINGLE_USB_TEMPLATE).toContain('input()');
    expect(SINGLE_USB_TEMPLATE).toContain("if cmd == 'a'");
    expect(SINGLE_USB_TEMPLATE.split('\n').length).toBeLessThan(20);
  });

  it('템플릿이 모의 보드에서 실제로 돌고 a·b에 반응한다', async () => {
    const { repl } = await open();
    const { run, output } = await startRun(repl, SINGLE_USB_TEMPLATE);
    expect(await until(() => output().includes('명령을 기다려요'))).toBe(true);
    repl.sendInput(prepareBoardInputLine('a').bytes);
    expect(await until(() => output().includes('laser on'))).toBe(true);
    repl.sendInput(prepareBoardInputLine('b').bytes);
    expect(await until(() => output().includes('laser off'))).toBe(true);
    repl.requestStop();
    await run;
  });
});

