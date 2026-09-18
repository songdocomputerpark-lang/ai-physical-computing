// [보드에 저장]·라이브러리 올리기(P3-08 실제 보드 ②, src/lab/serial/board-files.ts)를 모의 시리얼 보드로 확인한다.
// 쓰는 방식은 MicroPython v1.29.0 mpremote fs_writefile(256바이트씩 "w(b'…')" 명령)과 같은지, 같은 파일은 SHA256으로 건너뛰는지(fs cp),
// 보드 오류(공간 부족)·덜 써진 파일을 한국어 오류로 알리는지 본다. 모의 보드는 hashlib이 없어 해시를 "?"로 답한다 — 해시가 필요한 갈래는 정한 응답(scripts)으로.
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeSerial, MicroPythonDevice, MockSerialPort, type MicroPythonDeviceOptions } from '../../../src/lab/serial/mock/index.ts';
import { boardLibrariesFromFiles } from '../../../src/lab/esp32/board-libraries.ts';
import { BoardConnection } from '../../../src/lab/serial/board-connection.ts';
import {
  BOARD_MAIN_FILE,
  BoardFileError,
  FILE_CHUNK_BYTES,
  closeAndStatCommand,
  fileInfoCommand,
  isSafeBoardPath,
  openForWriteCommand,
  parseFileInfo,
  parseStatSize,
  planBoardSave,
  provisionLibraries,
  pythonBytesLiteral,
  pythonPathLiteral,
  readBoardFileInfo,
  saveFilesToBoard,
  sha256Hex,
  writeBoardFile,
  writeChunkCommand,
  type BoardSaveProgress,
} from '../../../src/lab/serial/board-files.ts';
import { createRealBoardRunTarget, libraryNotice, libraryUploadNotice } from '../../../src/lab/serial/board-run-target.ts';
import { MicroPythonRepl } from '../../../src/lab/serial/raw-repl.ts';
import { SerialChannel } from '../../../src/lab/serial/serial-channel.ts';
import type { LabRunContext } from '../../../src/lab/controls/lab-shell.ts';
import { FAST_TIMING, sleep } from './helpers/real-board-timing.ts';

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

const LIBRARIES = boardLibrariesFromFiles({
  '/examples/esp32/lib/third-party/i2c_lcd.py': "# MIT 고지(시험용)\nfrom lcd_api import LcdApi\nclass I2cLcd(LcdApi):\n    pass\n",
  '/examples/esp32/lib/third-party/lcd_api.py': "# 한글 주석 — UTF-8 바이트\nclass LcdApi:\n    pass\n",
  '/examples/esp32/lib/servo_library.py': 'def angle(x):\n    return x\n',
});

const sha256 = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');

async function session(options: MicroPythonDeviceOptions = {}) {
  const device = new MicroPythonDevice(options);
  const port = new MockSerialPort({ device });
  const channel = await SerialChannel.open(port, { baudRate: 115200 });
  const repl = new MicroPythonRepl(channel, FAST_TIMING);
  cleanups.push(async () => {
    await channel.close().catch(() => undefined);
    port.unplug();
  });
  return { device, port, channel, repl };
}

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

describe('명령 글자 — mpremote fs_writefile과 같은 모양', () => {
  it('bytes 글자: 보이는 ASCII는 그대로, 따옴표·역슬래시·줄바꿈·그 밖은 이스케이프', () => {
    expect(pythonBytesLiteral(new TextEncoder().encode("a'b\\c\n\r\td"))).toBe("b'a\\'b\\\\c\\n\\r\\td'");
    expect(pythonBytesLiteral(new TextEncoder().encode('가'))).toBe("b'\\xea\\xb0\\x80'");
    expect(pythonBytesLiteral(Uint8Array.of(0, 0x7f, 0xff))).toBe("b'\\x00\\x7f\\xff'");
  });

  it('경로는 안전한 이름만(따옴표·빈칸·..·앞의 / 없음)', () => {
    expect(isSafeBoardPath('main.py')).toBe(true);
    expect(isSafeBoardPath('lib/i2c_lcd.py')).toBe(true);
    for (const bad of ["a'b.py", 'a b.py', '../x.py', '/main.py', 'lib/../main.py', '', '한글.py']) {
      expect(isSafeBoardPath(bad)).toBe(false);
    }
    expect(() => pythonPathLiteral("x'); import os; os.remove('boot.py")).toThrow();
    expect(openForWriteCommand('main.py')).toBe("f=open('main.py','wb')\nw=f.write");
    expect(writeChunkCommand(new TextEncoder().encode('hi'))).toBe("w(b'hi')");
    expect(closeAndStatCommand('main.py')).toBe("f.close()\nimport os\nprint('apc:size',os.stat('main.py')[6])");
  });

  it('출력 읽기: 표시 줄만(Timer가 찍은 글이 섞여도), 해시 모름·파일 없음', () => {
    const hash = 'a'.repeat(64);
    expect(parseFileInfo(`tick\napc:file 1234 ${hash}\ntick\n`)).toEqual({ exists: true, size: 1234, sha256: hash });
    expect(parseFileInfo('apc:file 12 ?\n')).toEqual({ exists: true, size: 12, sha256: null });
    expect(parseFileInfo('apc:file -1 ?\n')).toEqual({ exists: false, size: -1, sha256: null });
    expect(parseFileInfo('nothing')).toBeNull();
    expect(parseStatSize('x\napc:size 300\n')).toBe(300);
    expect(parseStatSize('')).toBeNull();
  });

  it('SHA256은 Web Crypto로(Node의 crypto와 같은 값)', async () => {
    const bytes = new TextEncoder().encode('print("안녕")\n');
    expect(await sha256Hex(bytes)).toBe(sha256(bytes));
  });

  it('저장 계획: 코드가 부르는 라이브러리(부르는 라이브러리의 라이브러리까지) 먼저, main.py는 마지막', () => {
    const plan = planBoardSave('from i2c_lcd import I2cLcd\nlcd = I2cLcd()\n', LIBRARIES);
    expect(plan.map((item) => [item.path, item.kind, item.thirdParty])).toEqual([
      ['i2c_lcd.py', 'library', true],
      ['lcd_api.py', 'library', true],
      [BOARD_MAIN_FILE, 'main', false],
    ]);
    expect(new TextDecoder().decode(plan.at(-1)!.bytes)).toBe('from i2c_lcd import I2cLcd\nlcd = I2cLcd()\n');
    expect(planBoardSave("print('x')", LIBRARIES).map((item) => item.path)).toEqual(['main.py']);
  });
});

describe('파일 쓰기·확인 — 모의 보드 raw REPL', () => {
  it('0~255 모든 바이트를 256바이트 조각으로 써서 그대로 저장하고 크기를 확인한다', async () => {
    const { device, repl } = await session();
    const bytes = new Uint8Array(700);
    bytes.forEach((_, index) => {
      bytes[index] = index % 256;
    });
    const written: number[] = [];
    await repl.session((tools) => writeBoardFile(tools, 'data.bin', bytes, (count) => written.push(count)));
    expect([...(device.files.read('data.bin') ?? [])]).toEqual([...bytes]);
    expect(written).toEqual([256, 512, 700]);
    const commands = device.executed.map((item) => item.code);
    expect(commands.filter((code) => code.startsWith('w(b'))).toHaveLength(Math.ceil(700 / FILE_CHUNK_BYTES));
    // 임시 이름에 쓰고 제자리로 옮긴다(도중에 끊겨도 원래 파일이 반쪽이 되지 않게)
    expect(commands).toContain("f=open('data.bin.part','wb')\nw=f.write");
    expect(Object.keys(device.files.snapshot())).toEqual(['data.bin']);
    expect(device.executed.every((item) => item.via === 'raw-paste')).toBe(true);
    expect(device.flowControlOverrun).toBe(0);
    // 도구 묶음은 소프트 리셋하지 않았다(softReset 기본 false)
    expect(device.softResets).toBe(0);
  });

  it('파일 정보: 없으면 exists false, 있으면 크기(모의 보드는 hashlib이 없어 해시 null)', async () => {
    const { repl } = await session({ files: { 'lib_a.py': 'x = 1\n' } });
    const [missing, present] = await repl.session(async (tools) => [await readBoardFileInfo(tools, 'nope.py'), await readBoardFileInfo(tools, 'lib_a.py')]);
    expect(missing).toEqual({ exists: false, size: -1, sha256: null });
    expect(present).toEqual({ exists: true, size: 6, sha256: null });
  });

  it('보드 오류: 공간 부족(ENOSPC)이면 BoardFileError no-space, 열린 파일은 닫는다', async () => {
    const { device, repl } = await session({ scripts: [{ match: '^w\\(b', error: 'OSError: [Errno 28] ENOSPC' }] });
    const failure = await repl
      .session((tools) => writeBoardFile(tools, 'main.py', new TextEncoder().encode("print('x')\n")))
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failure).toBeInstanceOf(BoardFileError);
    expect(failure).toMatchObject({ code: 'no-space', path: 'main.py', boardMessage: 'OSError: [Errno 28] ENOSPC' });
    expect(device.executed.at(-1)?.code).toBe('f.close()');
  });

  it('쓰다 실패하면 보드에 있던 파일은 그대로고 임시 파일(.part)만 남는다 — 다음에 다시 올린다', async () => {
    const { device, repl } = await session({ files: { 'lib_a.py': '# 보드에 있던 파일\n' }, scripts: [{ match: '^w\\(b', error: 'OSError: [Errno 28] ENOSPC' }] });
    await expect(repl.session((tools) => writeBoardFile(tools, 'lib_a.py', new TextEncoder().encode('# 새 파일\n')))).rejects.toMatchObject({ name: 'BoardFileError', code: 'no-space' });
    expect(device.files.readText('lib_a.py')).toBe('# 보드에 있던 파일\n');
    expect(device.files.read('lib_a.py.part')).not.toBeNull();
  });

  it('덜 써진 파일(크기가 다름)은 verify 오류', async () => {
    const { repl } = await session({ scripts: [{ match: '^f\\.close\\(\\)\\nimport os', output: 'apc:size 3\n' }] });
    await expect(repl.session((tools) => writeBoardFile(tools, 'main.py', new TextEncoder().encode('12345')))).rejects.toMatchObject({ name: 'BoardFileError', code: 'verify' });
  });
});

describe('saveFilesToBoard·provisionLibraries — 같은 파일은 건너뛰고, 없으면 올린다', () => {
  const code = 'from i2c_lcd import I2cLcd\nprint(1)\n';

  it('처음 저장: 라이브러리 두 개 → main.py, 진행률은 늘기만 하고 마지막에 전체 바이트', async () => {
    const { device, repl } = await session();
    const plan = planBoardSave(code, LIBRARIES);
    const progress: BoardSaveProgress[] = [];
    const result = await repl.session((tools) => saveFilesToBoard(tools, plan, { onProgress: (item) => progress.push(item) }));
    expect(result.files.map((file) => [file.path, file.status, file.replaced])).toEqual([
      ['i2c_lcd.py', 'written', false],
      ['lcd_api.py', 'written', false],
      ['main.py', 'written', false],
    ]);
    expect(result.writtenBytes).toBe(result.totalBytes);
    expect(device.files.readText('main.py')).toBe(code);
    expect(device.files.readText('lcd_api.py')).toBe(LIBRARIES.find((item) => item.name === 'lcd_api')!.source);
    const done = progress.map((item) => item.doneBytes);
    expect(done).toEqual([...done].sort((a, b) => a - b));
    expect(progress.at(-1)).toMatchObject({ path: 'main.py', fileNumber: 3, fileCount: 3, doneBytes: result.totalBytes });
  });

  it('보드 해시가 같으면 건너뛰고(same), 다르면 바꿔 쓴다(replaced)', async () => {
    const lcdApi = LIBRARIES.find((item) => item.name === 'lcd_api')!;
    const i2cLcd = LIBRARIES.find((item) => item.name === 'i2c_lcd')!;
    const lcdApiBytes = new TextEncoder().encode(lcdApi.source);
    // 모의 보드에는 hashlib이 없어 "파일 정보" 명령에만 정한 응답을 준다: i2c_lcd.py는 다른 파일, lcd_api.py는 사이트판과 같은 파일
    const { device, repl } = await session({
      scripts: [
        { match: "^import os\\ntry:\\n _s=os.stat\\('i2c_lcd\\.py'\\)", output: `apc:file 5 ${'0'.repeat(64)}\n` },
        { match: "^import os\\ntry:\\n _s=os.stat\\('lcd_api\\.py'\\)", output: `apc:file ${lcdApiBytes.length} ${sha256(lcdApiBytes)}\n` },
      ],
    });
    const result = await repl.session((tools) => saveFilesToBoard(tools, planBoardSave(code, LIBRARIES)));
    expect(result.files.map((file) => [file.path, file.status, file.replaced])).toEqual([
      ['i2c_lcd.py', 'written', true],
      ['lcd_api.py', 'same', false],
      ['main.py', 'written', false],
    ]);
    expect(result.writtenBytes).toBe(result.totalBytes - lcdApiBytes.length);
    expect(device.files.readText('i2c_lcd.py')).toBe(i2cLcd.source);
    expect(device.files.read('lcd_api.py')).toBeNull();
  });

  it('[실행] 전 라이브러리 갖추기: 없으면 올리고, 있으면(해시 모름) 그대로, 해시가 다르면 알리기만', async () => {
    const needed = LIBRARIES.filter((item) => item.name !== 'servo_library');
    const { device, repl } = await session({ files: { 'lcd_api.py': '# 학생이 고친 파일\n' } });
    const first = await repl.session((tools) => provisionLibraries(tools, needed));
    expect(first).toEqual([
      { path: 'i2c_lcd.py', status: 'uploaded' },
      { path: 'lcd_api.py', status: 'present' },
    ]);
    expect(device.files.readText('lcd_api.py')).toBe('# 학생이 고친 파일\n');
    expect(libraryNotice(first)).toContain('i2c_lcd.py');

    const i2cBytes = new TextEncoder().encode(needed[0]!.source);
    device.addScript({ match: "^import os\\ntry:\\n _s=os.stat\\('i2c_lcd\\.py'\\)", output: `apc:file ${i2cBytes.length} ${sha256(i2cBytes)}\n` });
    device.addScript({ match: "^import os\\ntry:\\n _s=os.stat\\('lcd_api\\.py'\\)", output: `apc:file 20 ${'f'.repeat(64)}\n` });
    const second = await repl.session((tools) => provisionLibraries(tools, needed));
    expect(second).toEqual([
      { path: 'i2c_lcd.py', status: 'same' },
      { path: 'lcd_api.py', status: 'different' },
    ]);
    expect(libraryNotice(second)).toContain('사이트판과 달라요: lcd_api.py');
    expect(libraryNotice([{ path: 'x.py', status: 'same' }])).toBeNull();
  });

  it('파일 정보 명령은 모의 보드 mini-python에서도 돈다(해시 칸은 ?)', async () => {
    const { device, repl } = await session({ files: { 'a.py': 'abc' } });
    const output = await repl.session((tools) => tools.command(fileInfoCommand('a.py')));
    expect(output.error).toBeNull();
    expect(output.stdout).toBe('apc:file 3 ?\n');
    expect(device.executed.at(-1)?.via).toBe('raw-paste');
  });
});

describe('BoardConnection.save·실행 대상 — 연결 상태와 함께', () => {
  it('[보드에 저장]: writing → ready, 먼저 소프트 리셋 한 번, main.py와 라이브러리가 보드에, lastSave 기록', async () => {
    const { device, connection } = await connected();
    const states: string[] = [];
    connection.subscribe((snapshot) => {
      if (states.at(-1) !== snapshot.state) {
        states.push(snapshot.state);
      }
    });
    const resetsBefore = device.softResets;
    const result = await connection.save('from i2c_lcd import I2cLcd\nprint(1)\n', { libraries: LIBRARIES });
    expect(states).toEqual(['writing', 'ready']);
    expect(device.softResets).toBe(resetsBefore + 1);
    expect(Object.keys(device.files.snapshot()).sort()).toEqual(['i2c_lcd.py', 'lcd_api.py', 'main.py']);
    expect(connection.snapshot.lastSave).toEqual({ ok: true, result });
    expect(connection.snapshot.task).toBeNull();
    // 저장한 뒤에도 [실행]이 된다
    expect((await connection.run("print('after save')")).stdout).toBe('after save\n');
  });

  it('저장 실패(공간 부족)는 lastSave에 남기고 ready로 — 연결 문제가 아니다', async () => {
    const { connection, device } = await connected();
    device.addScript({ match: '^w\\(b', error: 'OSError: [Errno 28] ENOSPC' });
    await expect(connection.save("print('x')\n")).rejects.toMatchObject({ code: 'no-space' });
    expect(connection.state).toBe('ready');
    expect(connection.snapshot.lastSave).toMatchObject({ ok: false, error: { name: 'BoardFileError', code: 'no-space', path: 'main.py' } });
  });

  it('연결되지 않았거나 다른 일 중이면 저장하지 않는다', async () => {
    const connection = new BoardConnection({ serial: new FakeSerial({ ports: [], requireUserActivation: false }), timing: FAST_TIMING });
    await expect(connection.save("print('x')")).rejects.toMatchObject({ name: 'BoardNotConnected' });
    const ready = await connected();
    const running = ready.connection.run("import time\ntime.sleep(0.3)\nprint('done')");
    await expect(ready.connection.save("print('x')")).rejects.toMatchObject({ name: 'BoardInUse' });
    expect((await running).stdout).toBe('done\n');
  });

  it('[실행]: 코드가 부르는 라이브러리가 보드에 없으면 먼저 올리고 알린 뒤 실행, 두 번째 실행은 조용히', async () => {
    const { device, connection } = await connected();
    const target = createRealBoardRunTarget(connection, { flushMs: 5, libraries: LIBRARIES });
    const context = fakeContext();
    const result = await target.run("import i2c_lcd\nprint('lib ok')", context);
    expect(result.outcome).toBe('ok');
    expect(context.text('stdout')).toBe('lib ok\n');
    // 올리기 전에 파일마다 알린다(실물에서 큰 파일은 몇 초 걸린다)
    for (const name of ['i2c_lcd', 'lcd_api']) {
      const library = LIBRARIES.find((item) => item.name === name)!;
      expect(context.text('notice')).toContain(libraryUploadNotice(library.fileName, new TextEncoder().encode(library.source).length));
    }
    expect(device.files.readText('i2c_lcd.py')).toBe(LIBRARIES.find((item) => item.name === 'i2c_lcd')!.source);
    // 라이브러리 명령이 남긴 이름은 소프트 리셋으로 사라진 뒤 학생 코드가 돈다(라이브러리 명령 → 소프트 리셋 → 코드)
    const vias = device.executed.map((item) => item.code);
    const lastWrite = vias.map((code, index) => (code.startsWith('f.close()') ? index : -1)).filter((index) => index >= 0).at(-1)!;
    expect(vias.indexOf("import i2c_lcd\nprint('lib ok')")).toBeGreaterThan(lastWrite);

    const again = fakeContext();
    expect((await target.run("import i2c_lcd\nprint('again')", again)).outcome).toBe('ok');
    expect(again.text('notice')).toBe('');
  });
});
