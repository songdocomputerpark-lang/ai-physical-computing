// 실제 보드 raw REPL 출력 읽기(src/lab/serial/raw-repl-follow.ts)·보드 글 풀기(control-bytes.ts)·배너 판별(banner.ts)의 순수 함수 검사(P3-07).
// 보드 모양은 MicroPython v1.29.0 docs/reference/repl.rst·shared/runtime/pyexec.c·ports/esp32/main.c 기준(2026-09-17 원문 확인).
import { describe, expect, it } from 'vitest';
import {
  classifyProbeTranscript,
  compareWithSiteFirmware,
  isEsp32Machine,
  isReplAnswerComplete,
  looksGarbled,
  parseMicroPythonBanner,
} from '../../../src/lab/serial/banner.ts';
import { BoardTextDecoder, bytesOf, fromLatin1, indexOfBytes, latin1, showControls } from '../../../src/lab/serial/control-bytes.ts';
import { RawReplFollower, parseBoardTraceback, type FollowEvent } from '../../../src/lab/serial/raw-repl-follow.ts';

const BANNER = 'MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32\r\nType "help()" for more information.\r\n';

/** 글을 size바이트씩 잘라 넣고 모든 사건과 남은 바이트를 모은다 */
function feed(text: string | Uint8Array, size = 3): { events: FollowEvent[]; rest: string; stdout: string } {
  const bytes = typeof text === 'string' ? fromLatin1(text) : text;
  const follower = new RawReplFollower();
  const events: FollowEvent[] = [];
  let rest = '';
  let stdout = '';
  const decoder = new BoardTextDecoder();
  for (let offset = 0; offset < bytes.length; offset += size) {
    const step = follower.push(bytes.slice(offset, offset + size));
    events.push(...step.events);
    for (const event of step.events) {
      if (event.type === 'stdout') {
        stdout += decoder.push(event.bytes);
      }
    }
    if (follower.phase === 'done') {
      rest = latin1(step.rest) + latin1(bytes.slice(offset + size));
      break;
    }
  }
  stdout += decoder.flush();
  return { events, rest, stdout };
}

describe('BoardTextDecoder — 보드 출력을 콘솔 글로', () => {
  it('조각에 걸친 한글 UTF-8과 \\r\\n을 이어 푼다(\\r이 조각 끝에 걸려도)', () => {
    const bytes = new TextEncoder().encode('안녕\r\n반가워요\r\nabc\r');
    const decoder = new BoardTextDecoder();
    let text = '';
    for (const byte of bytes) {
      text += decoder.push(Uint8Array.of(byte));
    }
    text += decoder.flush();
    expect(text).toBe('안녕\n반가워요\nabc\r');
  });

  it('홀로 있는 \\r(줄 앞으로 돌아가기)은 그대로 둔다', () => {
    const decoder = new BoardTextDecoder();
    expect(decoder.push(new TextEncoder().encode('10%\r'))).toBe('10%');
    expect(decoder.push(new TextEncoder().encode('20%\r\n'))).toBe('\r20%\n');
    expect(decoder.flush()).toBe('');
  });

  it('바이트 도우미: 이어 붙이기·찾기·제어 글자 보이기', () => {
    const bytes = bytesOf(0x05, 'A', Uint8Array.of(0x01), 'print(1)', 0x04);
    expect(latin1(bytes)).toBe('\x05A\x01print(1)\x04');
    expect(indexOfBytes(bytes, fromLatin1('print'))).toBe(3);
    expect(indexOfBytes(bytes, fromLatin1('zz'))).toBe(-1);
    expect(indexOfBytes(bytes, Uint8Array.of(0x04), 0, bytes.length - 1)).toBe(-1);
    expect(showControls('R\x01\x80\x00\x01\r\n')).toBe('R\\x01\x80\\x00\\x01\r\n');
  });
});

describe('RawReplFollower — [출력] \\x04 [오류] \\x04 >', () => {
  it('출력을 흘려보내고 오류 칸과 프롬프트를 나누며, 뒤에 붙은 바이트는 돌려준다', () => {
    const { events, rest, stdout } = feed('hello\r\n안녕\r\n\x04\x04>tick\r\n'.replace('안녕', latin1(new TextEncoder().encode('안녕'))), 2);
    expect(stdout).toBe('hello\n안녕\n');
    expect(events.filter((event) => event.type !== 'stdout')).toEqual([{ type: 'stdout-end' }, { type: 'stderr-end', stderr: '' }, { type: 'prompt', softReboot: false, preamble: '' }]);
    expect(rest).toBe('tick\r\n');
  });

  it('트레이스백은 두 번째 칸이고, 조각이 1바이트여도 같다', () => {
    const traceback = 'Traceback (most recent call last):\r\n  File "<stdin>", line 2, in <module>\r\nZeroDivisionError: divide by zero\r\n';
    const { events } = feed(`1\r\n\x04${traceback}\x04>`, 1);
    const end = events.find((event) => event.type === 'stderr-end');
    expect(end).toEqual({ type: 'stderr-end', stderr: traceback });
    expect(events.at(-1)).toEqual({ type: 'prompt', softReboot: false, preamble: '' });
  });

  it('SystemExit(sys.exit·machine.soft_reset): ">" 대신 소프트 리셋 뒤 raw REPL 알림까지 받는다(ports/esp32/main.c)', () => {
    const { events, rest } = feed('bye\r\n\x04\x04MPY: soft reboot\r\nboot.py 출력\r\nraw REPL; CTRL-B to exit\r\n>', 5);
    expect(events.at(-1)).toMatchObject({ type: 'prompt', softReboot: true });
    expect(rest).toBe('');
  });

  it('실행 중 하드 리셋(machine.reset·전원 부족): \\x04 없이 부팅 글 + 배너 + ">>> "', () => {
    const boot = `ets Jul 29 2019 12:21:46\r\n\r\nrst:0xc (SW_CPU_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\r\n${BANNER}>>> `;
    const { events, stdout } = feed(`before\r\n${boot}`, 7);
    expect(stdout).toContain('before\n');
    expect(stdout).toContain('rst:0xc (SW_CPU_RESET)');
    expect(events.at(-1)).toMatchObject({ type: 'reset', kind: 'hard' });
  });

  it('모의 보드처럼 \\x04 없이 온 소프트 리셋 글도 리셋으로 받는다', () => {
    const { events } = feed('MPY: soft reboot\r\nraw REPL; CTRL-B to exit\r\n>', 4);
    expect(events.at(-1)).toMatchObject({ type: 'reset', kind: 'soft' });
  });

  it('프로그램이 찍은 "rst:" 같은 글만으로는 끝내지 않는다(프롬프트까지 와야 리셋)', () => {
    const follower = new RawReplFollower();
    const step = follower.push(fromLatin1('\nrst:0x1 (made up) but still running\r\n'));
    expect(step.events.some((event) => event.type === 'reset')).toBe(false);
    expect(follower.phase).toBe('stdout');
  });
});

describe('parseBoardTraceback — 보드 트레이스백 → 실습실 오류 정보', () => {
  it('종류·마지막 줄·\\n 줄 끝 트레이스백', () => {
    expect(parseBoardTraceback('Traceback (most recent call last):\r\n  File "<stdin>", line 3, in <module>\r\nNameError: name \'x\' isn\'t defined\r\n')).toEqual({
      type: 'NameError',
      message: "NameError: name 'x' isn't defined",
      traceback: 'Traceback (most recent call last):\n  File "<stdin>", line 3, in <module>\nNameError: name \'x\' isn\'t defined',
    });
  });

  it('KeyboardInterrupt·OSError errno·문법 오류·빈 글', () => {
    expect(parseBoardTraceback('Traceback (most recent call last):\r\n  File "<stdin>", line 5, in <module>\r\nKeyboardInterrupt: \r\n')?.type).toBe('KeyboardInterrupt');
    expect(parseBoardTraceback('Traceback (most recent call last):\r\n  File "<stdin>", line 1, in <module>\r\nOSError: [Errno 19] ENODEV\r\n')).toMatchObject({ type: 'OSError', message: 'OSError: [Errno 19] ENODEV' });
    expect(parseBoardTraceback('Traceback (most recent call last):\r\n  File "<stdin>", line 1\r\nSyntaxError: invalid syntax\r\n')).toMatchObject({ type: 'SyntaxError', message: 'SyntaxError: invalid syntax' });
    expect(parseBoardTraceback('')).toBeNull();
    expect(parseBoardTraceback('\r\n')).toBeNull();
  });
});

describe('배너·판별(banner.ts)', () => {
  it('v1.29.0 배너와 개발판 태그를 읽고 사이트 기준판과 견준다', () => {
    expect(parseMicroPythonBanner(`\r\n${BANNER}>>> `)).toEqual({
      version: 'v1.29.0',
      buildDate: '2026-08-24',
      machine: 'Generic ESP32 module with ESP32',
      line: 'MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32',
    });
    const preview = parseMicroPythonBanner('MicroPython v1.30.0-preview.12.gabc1234 on 2026-09-01; Generic ESP32 module with ESP32\r\n');
    expect(preview?.version).toBe('v1.30.0-preview.12.gabc1234');
    expect(compareWithSiteFirmware('v1.29.0')).toBe('same');
    expect(compareWithSiteFirmware('v1.22.2')).toBe('older');
    expect(compareWithSiteFirmware(preview?.version)).toBe('newer');
    expect(compareWithSiteFirmware('v1.29.0-preview.3')).toBe('newer');
    expect(compareWithSiteFirmware('abc')).toBe('unknown');
    expect(isEsp32Machine('Generic ESP32 module with ESP32')).toBe(true);
    expect(isEsp32Machine('Raspberry Pi Pico with RP2040')).toBe(false);
  });

  it('Ctrl-B의 답이 다 왔는지(배너 뒤 ">>> " 또는 raw 프롬프트)', () => {
    expect(isReplAnswerComplete(`\r\n${BANNER}>>> `)).toBe(true);
    expect(isReplAnswerComplete('\r\n>>> ')).toBe(false);
    expect(isReplAnswerComplete('raw REPL; CTRL-B to exit\r\n>')).toBe(true);
    expect(isReplAnswerComplete(`\r\n${BANNER}`)).toBe(false);
  });

  it('판별: MicroPython(보통·raw)·CircuitPython·펌웨어 없음·다운로드 모드·멈추지 않음·다른 글·깨진 글·대답 없음', () => {
    expect(classifyProbeTranscript(`\r\n>>> \r\n>>> \r\n${BANNER}>>> `)).toMatchObject({ kind: 'micropython', prompt: 'friendly', banner: { version: 'v1.29.0' } });
    expect(classifyProbeTranscript('\r\nraw REPL; CTRL-B to exit\r\n>')).toMatchObject({ kind: 'micropython', prompt: 'raw', banner: null });
    expect(classifyProbeTranscript('\r\nAdafruit CircuitPython 9.2.1 on 2024-11-20; Adafruit Feather ESP32-S2 with ESP32S2\r\n>>> ')).toEqual({ kind: 'other-python', name: 'CircuitPython 9.2.1' });
    expect(classifyProbeTranscript('\r\n>>> ')).toEqual({ kind: 'other-python', name: '파이썬 REPL' });
    expect(classifyProbeTranscript('ets Jul 29 2019 12:21:46\r\n\r\nrst:0x10 (RTCWDT_RTC_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\r\ninvalid header: 0xffffffff\r\ninvalid header: 0xffffffff\r\n')).toEqual({
      kind: 'no-firmware',
      evidence: 'invalid-header',
    });
    expect(classifyProbeTranscript('flash read err, 1000\r\n')).toEqual({ kind: 'no-firmware', evidence: 'flash-read-error' });
    expect(classifyProbeTranscript('rst:0x1 (POWERON_RESET),boot:0x3 (DOWNLOAD_BOOT(UART0/UART1/SDIO_REI_REO_V2))\r\nwaiting for download\r\n')).toEqual({ kind: 'download-mode' });
    expect(classifyProbeTranscript('tick\r\nTraceback (most recent call last):\r\n  File "main.py", line 4\r\ntick\r\n')).toEqual({ kind: 'busy' });
    expect(classifyProbeTranscript('Hello from another firmware\r\n')).toEqual({ kind: 'other-output', garbled: false });
    expect(classifyProbeTranscript('\xf0\x81\x93\xfe\xc3\x00\x9a\xff\xe0')).toEqual({ kind: 'other-output', garbled: true });
    expect(classifyProbeTranscript('')).toEqual({ kind: 'silent' });
    expect(classifyProbeTranscript('\r\n \r\n')).toEqual({ kind: 'silent' });
    expect(looksGarbled('abc')).toBe(false);
  });
});
