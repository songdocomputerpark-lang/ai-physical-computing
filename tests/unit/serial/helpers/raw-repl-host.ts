// 모의 시리얼 테스트용 "호스트" — MicroPython tools/pyboard.py·mpremote와 같은 순서로 raw REPL·raw-paste를 쓰는 작은 도구(병렬 제작 준비 2026-09-17).
// 사이트의 실제 보드 연결 코드(P3-07·P3-08 구역 E)가 아니라, 모의 보드가 규약대로 답하는지 확인하는 기준 구현이다.
import { concatBytes, fromLatin1, latin1, toBytes, utf8 } from '../../../../src/lab/serial/mock/bytes.ts';
import type { MockSerialPort } from '../../../../src/lab/serial/mock/mock-port.ts';

export class RawReplHost {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private buffer: number[] = [];
  private readonly waiters = new Set<() => void>();
  private pump: Promise<void> | null = null;
  /** 받은 바이트 전체(0~255 글자) */
  transcript = '';

  constructor(readonly port: MockSerialPort) {}

  async open(baudRate = 115200): Promise<void> {
    await this.port.open({ baudRate });
    this.reader = this.port.readable!.getReader();
    this.writer = this.port.writable!.getWriter();
    this.pump = (async () => {
      for (;;) {
        let result: ReadableStreamReadResult<Uint8Array>;
        try {
          result = await this.reader!.read();
        } catch {
          break;
        }
        if (result.done) {
          break;
        }
        for (const byte of result.value) {
          this.buffer.push(byte);
          this.transcript += String.fromCharCode(byte);
        }
        for (const wake of [...this.waiters]) {
          wake();
        }
      }
    })();
  }

  async close(): Promise<void> {
    await this.reader?.cancel().catch(() => undefined);
    this.reader?.releaseLock();
    await this.writer?.close().catch(() => undefined);
    this.writer?.releaseLock();
    this.reader = null;
    this.writer = null;
    await this.pump;
    await this.port.close();
  }

  async write(data: string | Uint8Array): Promise<void> {
    await this.writer!.write(typeof data === 'string' ? toBytes(data) : data);
  }

  /** 받은 버퍼에서 n바이트(없으면 기다림) */
  async read(count: number, timeoutMs = 3000): Promise<string> {
    await this.waitFor(() => this.buffer.length >= count, timeoutMs, `${count}바이트`);
    return latin1(Uint8Array.from(this.buffer.splice(0, count)));
  }

  /** 끝이 ending이 될 때까지 읽는다(pyboard.read_until) */
  async readUntil(ending: string, timeoutMs = 3000): Promise<string> {
    await this.waitFor(() => latin1(Uint8Array.from(this.buffer)).includes(ending), timeoutMs, JSON.stringify(ending));
    const text = latin1(Uint8Array.from(this.buffer));
    const end = text.indexOf(ending) + ending.length;
    this.buffer.splice(0, end);
    return text.slice(0, end);
  }

  /** readUntil의 UTF-8 판: 한글 같은 글자를 그대로 적고 받은 것도 UTF-8로 풀어 돌려준다 */
  async readText(ending: string, timeoutMs = 3000): Promise<string> {
    return utf8(fromLatin1(await this.readUntil(latin1(toBytes(ending)), timeoutMs)));
  }

  /** 지금까지 받은 것을 비운다 */
  drain(): string {
    return latin1(Uint8Array.from(this.buffer.splice(0)));
  }

  pendingText(): string {
    return latin1(Uint8Array.from(this.buffer));
  }

  private waitFor(check: () => boolean, timeoutMs: number, what: string): Promise<void> {
    if (check()) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(wake);
        reject(new Error(`${timeoutMs}ms 안에 ${what}을(를) 받지 못했어요. 받은 것: ${JSON.stringify(latin1(Uint8Array.from(this.buffer)))}`));
      }, timeoutMs);
      const wake = () => {
        if (check()) {
          clearTimeout(timer);
          this.waiters.delete(wake);
          resolve();
        }
      };
      this.waiters.add(wake);
    });
  }

  /** pyboard.enter_raw_repl(soft_reset) */
  async enterRawRepl(softReset = true): Promise<void> {
    await this.write('\r\x03');
    await new Promise((resolve) => setTimeout(resolve, 30));
    this.drain();
    await this.write('\r\x01');
    if (softReset) {
      await this.readUntil('raw REPL; CTRL-B to exit\r\n>');
      await this.write('\x04');
      await this.readUntil('soft reboot\r\n');
    }
    await this.readUntil('raw REPL; CTRL-B to exit\r\n');
  }

  /** pyboard.exec_raw_no_follow + follow: raw-paste(되면) 또는 보통 raw로 코드를 보내고 (출력, 오류)를 돌려준다 */
  async exec(code: string, options: { rawPaste?: boolean; timeoutMs?: number } = {}): Promise<{ output: string; error: string; mode: 'raw-paste' | 'raw' }> {
    const timeoutMs = options.timeoutMs ?? 5000;
    await this.readUntil('>');
    const bytes = toBytes(code);
    let mode: 'raw-paste' | 'raw' = 'raw';
    if (options.rawPaste !== false) {
      await this.write('\x05A\x01');
      const reply = await this.read(2);
      if (reply === 'R\x01') {
        mode = 'raw-paste';
        const header = await this.read(2);
        const windowSize = header.charCodeAt(0) | (header.charCodeAt(1) << 8);
        let windowRemain = windowSize;
        let index = 0;
        while (index < bytes.length) {
          while (windowRemain === 0 || this.buffer.length > 0) {
            const flag = await this.read(1, timeoutMs);
            if (flag === '\x01') {
              windowRemain += windowSize;
            } else if (flag === '\x04') {
              await this.write('\x04');
              return { output: '', error: '', mode };
            } else {
              throw new Error(`raw-paste 중에 뜻밖의 값: ${JSON.stringify(flag)}`);
            }
          }
          const part = bytes.slice(index, Math.min(index + windowRemain, bytes.length));
          await this.write(part);
          windowRemain -= part.length;
          index += part.length;
        }
        await this.write('\x04');
        await this.readUntil('\x04', timeoutMs);
      } else if (reply === 'R\x00') {
        // raw-paste를 알지만 쓰지 않는 장치: 프롬프트(>)가 뒤따른다
        await this.readUntil('>');
      } else {
        // raw-paste를 모르는 옛 펌웨어: raw REPL 알림을 다시 받는다
        await this.readUntil('w REPL; CTRL-B to exit\r\n>');
      }
    }
    if (mode === 'raw') {
      for (let offset = 0; offset < bytes.length; offset += 256) {
        await this.write(bytes.slice(offset, offset + 256));
      }
      await this.write('\x04');
      const ok = await this.read(2, timeoutMs);
      if (ok !== 'OK') {
        throw new Error(`실행 시작 응답이 OK가 아니에요: ${JSON.stringify(ok)}`);
      }
    }
    const output = (await this.readUntil('\x04', timeoutMs)).slice(0, -1);
    const error = (await this.readUntil('\x04', timeoutMs)).slice(0, -1);
    return { output, error, mode };
  }
}

export function joinBytes(parts: readonly Uint8Array[]): string {
  return latin1(concatBytes(parts));
}
