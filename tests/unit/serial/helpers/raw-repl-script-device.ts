// 모의 MicroPython 보드(src/lab/serial/mock/micropython-device.ts)가 흉내 내지 않는 raw REPL 갈래를 바이트 그대로 재현하는 작은 장치(P3-07 테스트용).
// 근거: MicroPython v1.29.0 shared/runtime/pyexec.c(do_reader_stdin "R\x00", mp_reader_stdin_close의 받기 끝 \x04와 Ctrl-D까지 버리기),
// ports/esp32/main.c(raw REPL에서 SystemExit → \x04\x04 뒤 "MPY: soft reboot" → raw REPL 알림).
//  - pasteReply 'R\x00': raw-paste를 알지만 쓰지 않는 보드 → "R\x00>" 뒤 보통 raw
//  - abortAfter N: raw-paste로 N바이트를 받으면 구문 오류로 먼저 받기를 끝냄(\x04) → 호스트의 \x04까지 버리고 \x04 + SyntaxError + \x04 + ">"
//  - 코드에 sys.exit()가 있으면 출력 뒤 \x04\x04 + 소프트 리셋 글(">" 없이)
import type { SerialDevice, SerialDeviceIO } from '../../../../src/lab/serial/mock/index.ts';

const RAW_READY = 'raw REPL; CTRL-B to exit\r\n>';
const BANNER = 'MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32\r\nType "help()" for more information.\r\n';
const SYNTAX_TRACEBACK = 'Traceback (most recent call last):\r\n  File "<stdin>", line 1\r\nSyntaxError: invalid syntax\r\n';

export interface RawReplScriptOptions {
  readonly pasteReply?: 'R\x01' | 'R\x00';
  readonly abortAfter?: number;
  readonly window?: number;
}

export class RawReplScriptDevice implements SerialDevice {
  /** 실행한 코드(보통 raw·raw-paste) */
  readonly executed: { via: 'raw' | 'raw-paste'; code: string }[] = [];
  /** raw-paste로 받은 바이트 수(받기 끝 전까지) */
  pasteBytes = 0;
  softResets = 0;
  #io: SerialDeviceIO | null = null;
  #mode: 'friendly' | 'raw' | 'paste' | 'drain' = 'friendly';
  #line: number[] = [];
  #paste: number[] = [];
  #windowRemain = 0;

  constructor(private readonly options: RawReplScriptOptions = {}) {}

  get mode(): string {
    return this.#mode;
  }

  attach(io: SerialDeviceIO): void {
    this.#io = io;
    this.#mode = 'friendly';
  }

  detach(): void {
    this.#io = null;
  }

  receive(bytes: Uint8Array): void {
    for (const byte of bytes) {
      this.#byte(byte);
    }
  }

  #emit(text: string): void {
    const out = new Uint8Array(text.length);
    for (let index = 0; index < text.length; index += 1) {
      out[index] = text.charCodeAt(index) & 0xff;
    }
    this.#io?.emit(out);
  }

  #byte(byte: number): void {
    const window = this.options.window ?? 128;
    switch (this.#mode) {
      case 'friendly':
        if (byte === 0x01) {
          this.#mode = 'raw';
          this.#line = [];
          this.#emit(`\r\n${RAW_READY}`);
        } else if (byte === 0x02) {
          this.#emit(`\r\n${BANNER}>>> `);
        } else if (byte === 0x03 || byte === 0x0d) {
          this.#emit('\r\n>>> ');
        }
        return;
      case 'raw':
        if (byte === 0x01) {
          if (this.#line.length === 2 && this.#line[0] === 0x05) {
            const command = this.#line[1];
            this.#line = [];
            if (command !== 0x41 || this.options.pasteReply === 'R\x00') {
              this.#emit('R\x00>');
              return;
            }
            this.#emit(`R\x01${String.fromCharCode(window & 0xff, (window >> 8) & 0xff)}\x01`);
            this.#mode = 'paste';
            this.#paste = [];
            this.#windowRemain = window;
            return;
          }
          this.#line = [];
          this.#emit(RAW_READY);
        } else if (byte === 0x02) {
          this.#mode = 'friendly';
          this.#emit(`\r\n${BANNER}>>> `);
        } else if (byte === 0x03) {
          this.#line = [];
        } else if (byte === 0x04) {
          if (this.#line.length === 0) {
            this.softResets += 1;
            this.#emit(`OK\r\nMPY: soft reboot\r\n${RAW_READY}`);
            return;
          }
          const code = new TextDecoder().decode(Uint8Array.from(this.#line));
          this.#line = [];
          this.#emit('OK');
          this.#run(code, 'raw');
        } else {
          this.#line.push(byte);
        }
        return;
      case 'paste':
        if (byte === 0x04) {
          this.#emit('\x04');
          this.#mode = 'raw';
          this.#run(new TextDecoder().decode(Uint8Array.from(this.#paste)), 'raw-paste');
          return;
        }
        this.#paste.push(byte);
        this.pasteBytes += 1;
        if (this.options.abortAfter !== undefined && this.#paste.length >= this.options.abortAfter) {
          // 구문 오류를 찾아 받기를 먼저 끝낸다: \x04를 보내고 호스트의 Ctrl-D(또는 Ctrl-C)까지 버린다
          this.#emit('\x04');
          this.#mode = 'drain';
          return;
        }
        this.#windowRemain -= 1;
        if (this.#windowRemain === 0) {
          this.#windowRemain = window;
          this.#emit('\x01');
        }
        return;
      case 'drain':
        if (byte === 0x04 || byte === 0x03) {
          this.#mode = 'raw';
          this.#emit(`\x04${SYNTAX_TRACEBACK}\x04>`);
        }
        return;
    }
  }

  #run(code: string, via: 'raw' | 'raw-paste'): void {
    this.executed.push({ via, code });
    const printed = [...code.matchAll(/print\('([^']*)'\)/gu)].map((match) => `${match[1]}\r\n`).join('');
    if (code.includes('sys.exit()')) {
      this.softResets += 1;
      this.#emit(`${printed}\x04\x04MPY: soft reboot\r\n${RAW_READY}`);
      return;
    }
    this.#emit(`${printed}\x04\x04>`);
  }
}
