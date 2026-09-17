// 모의 보드가 "실행"하는 작은 파이썬 부분집합(src/lab/serial/mock/mini-python.ts) — 도구·수업 코드에 흔한 모양과 MicroPython 모양 오류 글(병렬 제작 준비 2026-09-17).
import { describe, expect, it } from 'vitest';
import { MockFileSystem, PyException, formatTraceback, runMiniPython, type MiniPythonHost } from '../../../src/lab/serial/mock/index.ts';

async function run(source: string, options: { files?: MockFileSystem; inputs?: string[]; unknownStatement?: 'error' | 'ignore' } = {}) {
  let output = '';
  const pins: [number, number][] = [];
  const inputs = [...(options.inputs ?? [])];
  const files = options.files ?? new MockFileSystem();
  const host: MiniPythonHost = {
    write: (text) => {
      output += text;
    },
    input: async (prompt) => {
      output += prompt;
      return inputs.shift() ?? '';
    },
    sleepMs: async () => undefined,
    poll: async () => undefined,
    ticksMs: () => 1234,
    files,
    pinWrite: (gpio, value) => pins.push([gpio, value]),
    ...(options.unknownStatement ? { unknownStatement: options.unknownStatement } : {}),
  };
  let error: PyException | null = null;
  try {
    await runMiniPython(source, host);
  } catch (caught) {
    if (!(caught instanceof PyException)) {
      throw caught;
    }
    error = caught;
  }
  return { output, error, pins, files, traceback: error ? formatTraceback(error) : '' };
}

describe('문장과 식', () => {
  it('print·산술·비교·논리', async () => {
    const { output, error } = await run("print(1 + 2 * 3, 7 // 2, 7 % 3, 2 ** 10, -3)\nprint(7 / 2, 10 / 5)\nprint('a', 'b', sep='-', end='!\\n')\nprint(1 < 2 <= 2, 3 == 3.0, 'x' in 'xyz', not True, None is None)\nprint(0 or 'fallback', 1 and 'both')");
    expect(error).toBeNull();
    expect(output).toBe("7 3 1 1024 -3\n3.5 2.0\na-b!\nTrue True True False True\nfallback both\n");
  });

  it('if/elif/else·while·for·break·continue·한 줄 몸통', async () => {
    const source = [
      'total = 0',
      'for i in range(10):',
      '    if i % 2 == 0:',
      '        continue',
      '    elif i > 7:',
      '        break',
      '    else:',
      '        total += i',
      'n = 3',
      'while n > 0: n -= 1',
      "for ch in 'ab': print(ch)",
      'for a, b in [(1, 2), (3, 4)]:',
      '    print(a + b)',
      'print(total, n)',
    ].join('\n');
    const { output, error } = await run(source);
    expect(error).toBeNull();
    expect(output).toBe('a\nb\n3\n7\n16 0\n');
  });

  it('글자 다루기·format·목록·튜플·첨자', async () => {
    const { output, error } = await run(
      "name = ' esp32 '.strip().upper()\nparts = 'a,b,c'.split(',')\nparts.append('d')\nprint(name, len(parts), parts[-1], ','.join(parts))\nprint('{} = {:.2f}'.format('pi', 3.14159), '{:03d}'.format(7))\nvalues = [1, 2, 3]\nvalues[0] = 9\nprint(values, (1,), min(values), max(4, 5), abs(-2), round(2.567, 1))\nprint(str(10) + '개', int('42') + 1, float('1.5'), repr('q'), hex(255), chr(65), ord('A'))",
    );
    expect(error).toBeNull();
    expect(output).toBe("ESP32 4 d a,b,c,d\npi = 3.14 007\n[9, 2, 3] (1,) 2 5 2 2.6\n10개 43 1.5 'q' 0xff A 65\n");
  });

  it('try/except/finally·raise·다시 던지기', async () => {
    const source = [
      'try:',
      '    x = 1 / 0',
      'except ZeroDivisionError as e:',
      "    print('잡음', e)",
      'finally:',
      "    print('끝')",
      'try:',
      "    raise ValueError('bad')",
      'except Exception as e:',
      '    print(e)',
      'try:',
      "    open('missing.txt')",
      'except OSError as e:',
      '    print(e.args[0], e.errno, e)',
      'try:',
      '    try:',
      '        import nothing_here',
      '    except ImportError:',
      '        raise',
      'except OSError:',
      "    print('no')",
    ].join('\n');
    const { output, error, traceback } = await run(source);
    expect(output).toBe('잡음 divide by zero\n끝\nbad\n2 2 [Errno 2] ENOENT\n');
    expect(error?.type).toBe('ImportError');
    expect(traceback).toBe("Traceback (most recent call last):\n  File \"<stdin>\", line 17, in <module>\nImportError: no module named 'nothing_here'\n");
  });

  it('input()은 호스트에서 한 줄을 받는다', async () => {
    const { output } = await run("a = input('첫째? ')\nb = input()\nprint(a + b)", { inputs: ['12', '34'] });
    expect(output).toBe('첫째? 1234\n');
  });
});

describe('MicroPython 모양 오류', () => {
  it.each([
    ['print(x)', "NameError: name 'x' isn't defined", 1],
    ['a = 1\nb = a / 0', 'ZeroDivisionError: divide by zero', 2],
    ["import foo", "ImportError: no module named 'foo'", 1],
    ["open('none.txt')", 'OSError: [Errno 2] ENOENT', 1],
    ['[1][5]', 'IndexError: list index out of range', 1],
    ["import os\nos.nope()", "AttributeError: 'module' object has no attribute 'nope'", 2],
  ])('%s → %s', async (source, last, line) => {
    const { traceback } = await run(source);
    expect(traceback).toBe(`Traceback (most recent call last):\n  File "<stdin>", line ${line}, in <module>\n${last}\n`);
  });

  it('구문 오류는 실행 전에 줄 번호와 함께(in <module> 없음)', async () => {
    const { output, traceback } = await run("print('before')\nif True\n    print(1)");
    expect(output).toBe('');
    expect(traceback).toBe('Traceback (most recent call last):\n  File "<stdin>", line 2\nSyntaxError: invalid syntax\n');
  });

  it('흉내 못 내는 문장은 NotImplementedError, ignore면 건너뛴다', async () => {
    const source = "def hello():\n    print('hi')\nprint('after')";
    const strict = await run(source);
    expect(strict.error?.type).toBe('NotImplementedError');
    expect(strict.error?.detail).toContain("mock board can't run: def hello():");
    const lenient = await run(source, { unknownStatement: 'ignore' });
    expect(lenient.error).toBeNull();
    expect(lenient.output).toBe('after\n');
  });
});

describe('보드 모듈', () => {
  it('파일 쓰기·읽기·목록·지우기(mpremote 모양 포함)', async () => {
    const files = new MockFileSystem({ 'lib/i2c_lcd.py': '# lcd\n' });
    const source = [
      "f = open('data.txt', 'w')",
      "f.write('line1\\n')",
      "f.write('line2\\n')",
      'f.close()',
      "with open('data.txt') as f:",
      '    print(f.readline().strip(), f.read())',
      "g = open('blob.bin', 'wb')",
      'w = g.write',
      "w(b'\\x00\\x01')",
      'g.close()',
      'import os',
      "print(os.listdir(), os.listdir('lib'))",
      "os.rename('data.txt', 'renamed.txt')",
      "os.remove('blob.bin')",
      "os.mkdir('logs')",
      'print(os.listdir())',
    ].join('\n');
    const result = await run(source, { files });
    expect(result.error).toBeNull();
    expect(result.output).toBe("line1 line2\n\n['blob.bin', 'data.txt', 'lib'] ['i2c_lcd.py']\n['lib', 'logs', 'renamed.txt']\n");
    expect(files.snapshot()).toEqual({ 'lib/i2c_lcd.py': '# lcd\n', 'renamed.txt': 'line1\nline2\n' });
  });

  it('machine.Pin·time·sys·gc·보드에 올린 라이브러리 import', async () => {
    const files = new MockFileSystem({ 'lib/i2c_lcd.py': '# lcd\n' });
    const source = [
      'from machine import Pin',
      'import time, sys, gc',
      'import i2c_lcd',
      'led = Pin(2, Pin.OUT)',
      'led.value(1)',
      'led.off()',
      'print(led.value(), sys.platform, time.ticks_ms(), time.ticks_diff(10, 4))',
      'gc.collect()',
      'time.sleep_ms(5)',
    ].join('\n');
    const result = await run(source, { files });
    expect(result.error).toBeNull();
    expect(result.output).toBe('0 esp32 1234 6\n');
    expect(result.pins).toEqual([
      [2, 1],
      [2, 0],
    ]);
  });
});
