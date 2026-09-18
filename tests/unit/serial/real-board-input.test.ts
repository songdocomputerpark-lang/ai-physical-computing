// 실제 보드 실행 중 input()에 한 줄 보내기(P3-08 실제 보드 ② — PLAN §8.3 "실행 중 input() 전달 시험")를 모의 시리얼 보드로 확인한다.
// 보드 쪽 규약: MicroPython v1.29.0 readline(32~126 글자만 넣음, '\r'이 줄 끝, 되울림 + "\r\n") — 모의 보드는 글자를 되울리고 \r·\n에서 줄을 끝낸다.
// 모의 보드에서 된다는 것은 실물의 증거가 아니다(부록 B-2 19번).
import { afterEach, describe, expect, it } from 'vitest';
import { FakeSerial, MicroPythonDevice, MockSerialPort, type MicroPythonDeviceOptions } from '../../../src/lab/serial/mock/index.ts';
import { BoardConnection } from '../../../src/lab/serial/board-connection.ts';
import { BOARD_INPUT_LABEL, BOARD_INPUT_MAX_CHARS, InputEchoFilter, prepareBoardInputLine } from '../../../src/lab/serial/board-input.ts';
import { RUN_NOTICES, createRealBoardRunTarget } from '../../../src/lab/serial/board-run-target.ts';
import type { LabRunContext } from '../../../src/lab/controls/lab-shell.ts';
import { FAST_TIMING, sleep } from './helpers/real-board-timing.ts';

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

async function connected(options: MicroPythonDeviceOptions = {}) {
  const device = new MicroPythonDevice(options);
  const port = new MockSerialPort({ device });
  const serial = new FakeSerial({ ports: [port], requireUserActivation: false });
  const connection = new BoardConnection({ serial, timing: FAST_TIMING });
  cleanups.push(async () => {
    connection.dispose();
    await sleep(20);
    port.unplug();
  });
  expect((await connection.connect()).state).toBe('ready');
  return { device, port, connection };
}

/** 셸 입력줄 흉내: prompt를 부를 때마다 answers에서 하나씩(함수면 불러서) 준다. 다 쓰면 실행이 끝날 때까지 기다린다(셸처럼 null은 끝에서) */
function inputContext(answers: (string | (() => Promise<string | null>))[]) {
  const lines: { text: string; kind: string }[] = [];
  const prompts: string[] = [];
  let release: ((value: string | null) => void) | null = null;
  const context: LabRunContext & { text(kind?: string): string; prompts: string[]; close(): void } = {
    runCount: 1,
    prompts,
    // 상태 줄 바꾸기(ctx.setStatus)는 이 검사에서 쓰지 않는다 — 화면이 없다
    setStatus() {},
    write(text: string, kind = 'stdout') {
      lines.push({ text, kind });
    },
    async prompt(label: string) {
      prompts.push(label);
      const next = answers.shift();
      if (typeof next === 'function') {
        return next();
      }
      if (typeof next === 'string') {
        lines.push({ text: `${next}\n`, kind: 'input' });
        return next;
      }
      return new Promise<string | null>((resolve) => {
        release = resolve;
      });
    },
    text(kind?: string) {
      return lines
        .filter((line) => kind === undefined || line.kind === kind)
        .map((line) => line.text)
        .join('');
    },
    close() {
      release?.(null);
    },
  };
  cleanups.push(() => context.close());
  return context;
}

describe('prepareBoardInputLine — 보드 readline이 받는 글자만', () => {
  it('영어·숫자·기호는 그대로, 끝에 \\r 하나', () => {
    const line = prepareBoardInputLine('Kim 42!');
    expect(line).toMatchObject({ text: 'Kim 42!', droppedNonAscii: false, droppedControl: false, truncated: false });
    expect([...line.bytes]).toEqual([...new TextEncoder().encode('Kim 42!'), 0x0d]);
  });

  it('한글은 빼고 알린다, Tab은 빈칸, 제어 글자(Ctrl-C·Ctrl-D·ESC)는 뺀다', () => {
    expect(prepareBoardInputLine('김철수 kim')).toMatchObject({ text: ' kim', droppedNonAscii: true });
    expect(prepareBoardInputLine('a\tb')).toMatchObject({ text: 'a b', droppedControl: false });
    const control = prepareBoardInputLine('x\x03y\x04z\x1b[A\x7f');
    expect(control).toMatchObject({ text: 'xyz[A', droppedControl: true });
    expect([...control.bytes].filter((byte) => byte < 0x20)).toEqual([0x0d]);
  });

  it('보드 링버퍼(260바이트)에 들어가게 250글자에서 자른다', () => {
    const line = prepareBoardInputLine('a'.repeat(300));
    expect(line.text).toHaveLength(BOARD_INPUT_MAX_CHARS);
    expect(line.truncated).toBe(true);
  });
});

describe('InputEchoFilter — 보낸 줄의 되울림을 한 번 걸러 낸다', () => {
  it('되울림이 조각나 와도 한 번만 걸러 내고, 뒤의 프로그램 출력은 그대로', () => {
    const filter = new InputEchoFilter();
    filter.expect('Kim');
    expect(filter.push('K')).toBe('');
    expect(filter.holding).toBe(true);
    expect(filter.push('im')).toBe('');
    expect(filter.push('\nhi Kim\n')).toBe('hi Kim\n');
    expect(filter.pending).toBe(0);
    expect(filter.holding).toBe(false);
  });

  it('어긋나면 붙잡은 글을 내보내고 기다림은 남긴다(미리 보낸 줄은 input()이 늦게 읽는다)', () => {
    const filter = new InputEchoFilter();
    filter.expect('ok');
    expect(filter.push('ohno\n')).toBe('ohno\n');
    expect(filter.pending).toBe(1);
    expect(filter.push('menu> ok\nnext')).toBe('menu> next');
    expect(filter.pending).toBe(0);
  });

  it('빈 줄(Enter만)의 되울림은 줄바꿈 하나', () => {
    const filter = new InputEchoFilter();
    filter.expect('');
    expect(filter.push('\nafter\n')).toBe('after\n');
  });

  it('release()는 붙잡은 글을 내보낸다, 오래된 기다림은 버린다', () => {
    let clock = 0;
    const filter = new InputEchoFilter({ expireMs: 1000, now: () => clock });
    filter.expect('abc');
    expect(filter.push('ab')).toBe('');
    expect(filter.release()).toBe('ab');
    expect(filter.pending).toBe(1);
    clock = 2000;
    expect(filter.push('abc\n')).toBe('abc\n');
    expect(filter.pending).toBe(0);
  });
});

describe('실행 대상 — 실행 중 input()에 보내기(모의 보드)', () => {
  it('프롬프트를 본 뒤 적은 줄을 보드로 보내고, 되울림은 걸러 콘솔에 한 번만', async () => {
    const { device, port, connection } = await connected();
    const target = createRealBoardRunTarget(connection, { flushMs: 5 });
    const context = inputContext([
      async () => {
        await expect.poll(() => context.text('stdout'), { timeout: 3000 }).toContain('이름? ');
        context.write('Kim\n', 'input');
        return 'Kim';
      },
    ]);
    const result = await target.run("name = input('이름? ')\nprint('hi', name)", context);
    expect(result.outcome).toBe('ok');
    expect(context.text('stdout')).toBe('이름? hi Kim\n');
    expect(context.text('notice')).toContain(RUN_NOTICES.input);
    expect(context.prompts[0]).toBe(BOARD_INPUT_LABEL);
    // 보드로 간 바이트: 코드 전송 뒤 "Kim\r"
    expect(port.writtenText().endsWith('Kim\r')).toBe(true);
    expect(device.mode).toBe('raw');
  });

  it('input()을 부르기 전에 미리 적은 줄도 보드 버퍼에 쌓였다가 읽힌다', async () => {
    const { connection } = await connected();
    const target = createRealBoardRunTarget(connection, { flushMs: 5 });
    const context = inputContext(['7']);
    const result = await target.run("import time\ntime.sleep(0.2)\nn = int(input('수? '))\nprint('두 배', n * 2)", context);
    expect(result.outcome).toBe('ok');
    expect(context.text('stdout')).toBe('수? 두 배 14\n');
  });

  it('반복문 input(): 줄마다 보내고, 한글은 빼고 알린다', async () => {
    const { connection } = await connected();
    const target = createRealBoardRunTarget(connection, { flushMs: 5 });
    const context = inputContext(['1', '가나 2', 'q']);
    const code = "while True:\n    cmd = input('> ')\n    if cmd == 'q':\n        break\n    print('cmd', cmd)\nprint('end')";
    const result = await target.run(code, context);
    expect(result.outcome).toBe('ok');
    expect(context.text('stdout')).toBe('> cmd 1\n> cmd  2\n> end\n');
    expect(context.text('notice')).toContain(RUN_NOTICES.inputAsciiOnly);
  });

  it('input()을 기다리는 동안 [정지]하면 Ctrl-C로 멈추고 stopped', async () => {
    const { port, connection } = await connected();
    const target = createRealBoardRunTarget(connection, { flushMs: 5 });
    const context = inputContext([]);
    const running = target.run("name = input('wait: ')\nprint('never')", context);
    await expect.poll(() => context.text('stdout'), { timeout: 3000 }).toContain('wait: ');
    const before = port.writtenText().length;
    target.stop();
    context.close();
    const result = await running;
    expect(result.outcome).toBe('stopped');
    expect(port.writtenText().slice(before)).toMatch(/^\x03+$/u);
    expect(context.text('stdout')).not.toContain('never');
  });

  it('코드가 돌지 않을 때는 보내지 않는다(sendInput false)', async () => {
    const { connection } = await connected();
    expect(connection.sendInput(prepareBoardInputLine('x').bytes)).toBe(false);
  });

  it('input()을 쓰지 않는 코드는 입력줄을 열지 않는다', async () => {
    const { connection } = await connected();
    const target = createRealBoardRunTarget(connection, { flushMs: 5 });
    const context = inputContext([]);
    expect((await target.run("print('no input')", context)).outcome).toBe('ok');
    expect(context.prompts).toEqual([]);
    expect(context.text('notice')).not.toContain(RUN_NOTICES.input);
  });
});
