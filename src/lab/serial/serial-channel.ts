/**
 * 열린 Web Serial 포트 하나를 "바이트를 쓰고, 받은 바이트를 차례로 읽는 통로"로 다룬다(P3-07 실제 보드 ① — 사이트 코드).
 * raw REPL 규약(raw-repl.ts)은 이 통로의 write·take·nextChunk·readUntil만 쓴다. 진짜 SerialPort와 모의 포트(src/lab/serial/mock/mock-port.ts)가 같게 돈다.
 *
 * Web Serial 명세(https://wicg.github.io/serial/, 2026-09-17 확인)에 맞춘 것
 * - 읽기 반복은 명세의 모양 그대로: `while (port.readable) { reader = port.readable.getReader(); … reader.releaseLock() }`.
 *   BreakError·FramingError·ParityError·BufferOverrunError 같은 "치명적이지 않은" 오류 뒤에는 readable이 새 스트림이라 이어 읽고,
 *   NetworkError("The device has been lost." — USB 선이 빠짐) 뒤에는 readable이 null이라 반복이 끝난다 → 끊김(lost)으로 알린다.
 * - 닫을 때는 읽기 쪽을 cancel하고 잠금을 푼 뒤(잠긴 스트림이 있으면 close()가 TypeError) port.close()를 부른다.
 *   쓰기는 연결하는 동안 writer 하나를 잡고 차례로 쓴다(쓰기 약속을 이어 붙여 섞이지 않게).
 * 받은 바이트는 모두 이 통로의 버퍼에 쌓이고, 읽는 쪽이 꺼내 간다(꺼내지 않은 바이트는 다음 읽기가 받는다). 기록이 필요하면 onData로 듣는다.
 */
import { fromLatin1, indexOfBytes, latin1 } from './control-bytes.ts';
import { BoardDisconnectedError, SerialClosedError, SerialTimeoutError, errorName } from './errors.ts';

/** 진짜 SerialPort와 모의 포트가 함께 따르는 모양 */
export interface SerialPortLike extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
  setSignals?(signals: SerialOutputSignals): Promise<void>;
}

/** 진짜 navigator.serial과 모의 FakeSerial이 함께 따르는 모양 */
export interface SerialLike extends EventTarget {
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

export type ChannelState = 'open' | 'closing' | 'closed' | 'lost';

export interface ChannelEnd {
  readonly reason: 'closed' | 'lost';
  readonly error: unknown;
}

export interface ReadOptions {
  /** 이 시간(밀리초) 안에 오지 않으면 SerialTimeoutError. 없으면 끝없이 기다린다 */
  readonly timeoutMs?: number;
  /** 무엇을 기다렸는지(오류 글) */
  readonly what?: string;
}

const INITIAL_CAPACITY = 1024;
/** 닫을 때 보내던 바이트·읽기 반복이 끝나기를 기다리는 최대 시간(밀리초) */
const CLOSE_WRITE_WAIT_MS = 1000;

/** promise가 끝나거나 ms가 지나면 끝난다(타이머는 남기지 않는다) */
function settleWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

export class SerialChannel {
  readonly port: SerialPortLike;
  #state: ChannelState = 'open';
  #reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  #writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  #buffer = new Uint8Array(INITIAL_CAPACITY);
  #length = 0;
  #readLoop: Promise<void> = Promise.resolve();
  #writeChain: Promise<void> = Promise.resolve();
  #end: ChannelEnd | null = null;
  readonly #wakers = new Set<() => void>();
  readonly #dataListeners = new Set<(bytes: Uint8Array) => void>();
  readonly #endListeners = new Set<(end: ChannelEnd) => void>();
  /** 받은 바이트 수 전체(기록용) */
  received = 0;
  /** 보낸 바이트 수 전체(기록용) */
  sent = 0;

  private constructor(port: SerialPortLike) {
    this.port = port;
  }

  /** 포트를 열고(이미 열린 포트는 그대로 받아) 읽기 반복을 시작한다 */
  static async open(port: SerialPortLike, options: SerialOptions, alreadyOpen = false): Promise<SerialChannel> {
    if (!alreadyOpen) {
      await port.open(options);
    }
    const channel = new SerialChannel(port);
    const writable = port.writable;
    if (!writable) {
      throw new BoardDisconnectedError('포트를 열었지만 보낼 통로(writable)가 없어요.');
    }
    channel.#writer = writable.getWriter();
    channel.#readLoop = channel.#runReadLoop();
    return channel;
  }

  get state(): ChannelState {
    return this.#state;
  }

  get isOpen(): boolean {
    return this.#state === 'open';
  }

  /** 끝났으면 그 까닭 */
  get end(): ChannelEnd | null {
    return this.#end;
  }

  /** 버퍼에 쌓인(아직 읽지 않은) 바이트 수 */
  get buffered(): number {
    return this.#length;
  }

  onData(listener: (bytes: Uint8Array) => void): () => void {
    this.#dataListeners.add(listener);
    return () => this.#dataListeners.delete(listener);
  }

  onEnd(listener: (end: ChannelEnd) => void): () => void {
    this.#endListeners.add(listener);
    return () => this.#endListeners.delete(listener);
  }

  /** 바이트를 쓴다(앞선 쓰기가 끝난 뒤 차례로). 끊겼으면 BoardDisconnectedError */
  write(data: Uint8Array): Promise<void> {
    const task = this.#writeChain.then(async () => {
      this.#assertUsable();
      const writer = this.#writer;
      if (!writer) {
        throw new SerialClosedError();
      }
      try {
        await writer.write(data);
        this.sent += data.length;
      } catch (error) {
        if (this.#state === 'closing' || this.#state === 'closed') {
          throw new SerialClosedError();
        }
        throw new BoardDisconnectedError();
      }
    });
    // 한 번 실패해도 다음 쓰기는 이어서 시도한다(실패는 부른 쪽이 받는다)
    this.#writeChain = task.catch(() => undefined);
    return task;
  }

  /** 버퍼의 바이트를 꺼낸다(max를 주면 그만큼까지) */
  take(max = Number.POSITIVE_INFINITY): Uint8Array {
    const count = Math.min(this.#length, Math.max(0, Math.floor(max)));
    const out = this.#buffer.slice(0, count);
    this.#buffer.copyWithin(0, count, this.#length);
    this.#length -= count;
    return out;
  }

  /** 꺼냈던 바이트를 버퍼 앞에 되돌린다(규약 글 뒤에 붙어 온 바이트를 다음 읽기에 넘길 때) */
  unshift(bytes: Uint8Array): void {
    if (bytes.length === 0) {
      return;
    }
    this.#ensureCapacity(this.#length + bytes.length);
    this.#buffer.copyWithin(bytes.length, 0, this.#length);
    this.#buffer.set(bytes, 0);
    this.#length += bytes.length;
    this.#wake();
  }

  /** 버퍼의 글(0~255 글자, 꺼내지 않음) */
  peekText(): string {
    return latin1(this.#buffer.subarray(0, this.#length));
  }

  /**
   * 바이트가 올 때까지 기다렸다가 버퍼를 모두 꺼낸다. timeoutMs 안에 안 오면 null.
   * 끊기거나 닫히면 오류(버퍼에 남은 바이트가 있으면 먼저 돌려준다).
   */
  async nextChunk(timeoutMs = Number.POSITIVE_INFINITY): Promise<Uint8Array | null> {
    const ready = await this.#waitFor(() => this.#length > 0, timeoutMs);
    return ready ? this.take() : null;
  }

  /** 정확히 count바이트 */
  async readExactly(count: number, options: ReadOptions = {}): Promise<Uint8Array> {
    const ready = await this.#waitFor(() => this.#length >= count, options.timeoutMs ?? Number.POSITIVE_INFINITY);
    if (!ready) {
      throw new SerialTimeoutError(options.what ?? `${count}바이트`, this.peekText());
    }
    return this.take(count);
  }

  /** ending(0~255 글자열 또는 바이트)이 나올 때까지 읽어 ending까지 돌려준다. 시간이 다 되면 SerialTimeoutError(버퍼는 그대로) */
  async readUntil(ending: string | Uint8Array, options: ReadOptions = {}): Promise<Uint8Array> {
    const needle = typeof ending === 'string' ? fromLatin1(ending) : ending;
    let scanned = 0;
    let found = -1;
    const ready = await this.#waitFor(() => {
      // 앞에서 이미 훑은 곳은 다시 보지 않는다(버퍼가 줄었으면 — unshift·take — 처음부터)
      const from = scanned <= this.#length ? Math.max(0, scanned - needle.length + 1) : 0;
      found = indexOfBytes(this.#buffer, needle, from, this.#length);
      scanned = this.#length;
      return found >= 0;
    }, options.timeoutMs ?? Number.POSITIVE_INFINITY);
    if (!ready || found < 0) {
      throw new SerialTimeoutError(options.what ?? JSON.stringify(typeof ending === 'string' ? ending : latin1(ending)), this.peekText());
    }
    return this.take(found + needle.length);
  }

  /**
   * 받은 글(버퍼 앞부분부터, 0~255 글자열)이 test를 만족할 때까지 기다린다. 만족하면 true(꺼내지 않음), 시간이 다 되면 false.
   * 배너·프롬프트처럼 모양으로 찾는 판별에 쓴다.
   */
  async waitForText(test: (text: string) => boolean, timeoutMs: number): Promise<boolean> {
    return this.#waitFor(() => test(this.peekText()), timeoutMs);
  }

  /**
   * 조용해질 때까지(quietMs 동안 새 바이트가 없을 때까지, 길어도 maxMs) 받은 바이트를 모두 꺼내 돌려준다.
   * 보드에 Ctrl-C를 보낸 뒤 트레이스백·프롬프트가 다 오기를 기다릴 때 쓴다.
   */
  async readQuiet(quietMs: number, maxMs: number): Promise<Uint8Array> {
    const parts: Uint8Array[] = [];
    const started = Date.now();
    for (;;) {
      const remaining = maxMs - (Date.now() - started);
      if (remaining <= 0) {
        break;
      }
      const chunk = await this.nextChunk(Math.min(quietMs, remaining));
      if (!chunk) {
        break;
      }
      parts.push(chunk);
    }
    parts.push(this.take());
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  /** 선 신호(DTR·RTS)를 바꾼다. 포트가 지원하지 않으면 false */
  async setSignals(signals: SerialOutputSignals): Promise<boolean> {
    this.#assertUsable();
    if (typeof this.port.setSignals !== 'function') {
      return false;
    }
    try {
      await this.port.setSignals(signals);
      return true;
    } catch (error) {
      if (errorName(error) === 'NetworkError') {
        throw new BoardDisconnectedError();
      }
      throw error;
    }
  }

  /**
   * 연결이 끊긴 것을 밖에서 먼저 알았을 때(Web Serial 'disconnect' 이벤트) — 기다리던 읽기·쓰기가 BoardDisconnectedError로 끝난다.
   * (그 뒤 close()로 잠금을 풀고 포트를 닫는다. 이미 끝난 통로면 아무것도 하지 않는다)
   */
  markLost(error: unknown = null): void {
    if (this.#state !== 'open') {
      return;
    }
    this.#state = 'lost';
    this.#finish({ reason: 'lost', error });
    this.#wake();
  }

  /** 읽기를 멈추고 잠금을 풀고 포트를 닫는다(끊긴 포트도 닫는다 — 명세상 opened 그대로라 close가 된다) */
  async close(): Promise<void> {
    if (this.#state === 'closed' || this.#state === 'closing') {
      await this.#readLoop;
      return;
    }
    const wasLost = this.#state === 'lost';
    this.#state = 'closing';
    this.#wake();
    // 보내던 바이트는 끝까지 보내되, 운영체제가 쓰기를 붙잡고 있어도 닫기가 멈추지 않게 오래 기다리지 않는다
    await settleWithin(this.#writeChain, CLOSE_WRITE_WAIT_MS);
    try {
      await this.#reader?.cancel();
    } catch {
      // 이미 끝난 스트림
    }
    await settleWithin(this.#readLoop, CLOSE_WRITE_WAIT_MS);
    try {
      this.#writer?.releaseLock();
    } catch {
      // 이미 풀림
    }
    this.#writer = null;
    try {
      await this.port.close();
    } catch {
      // 이미 닫힘(InvalidStateError) — 끝난 것으로 본다
    }
    this.#state = 'closed';
    if (!wasLost) {
      this.#finish({ reason: 'closed', error: null });
    }
    this.#wake();
  }

  // ───────────── 안쪽 ─────────────

  #assertUsable(): void {
    if (this.#state === 'lost') {
      throw new BoardDisconnectedError();
    }
    if (this.#state !== 'open') {
      throw new SerialClosedError();
    }
  }

  async #runReadLoop(): Promise<void> {
    let lastError: unknown = null;
    while (this.#state === 'open') {
      const readable = this.port.readable;
      if (!readable) {
        break;
      }
      let reader: ReadableStreamDefaultReader<Uint8Array>;
      try {
        reader = readable.getReader();
      } catch (error) {
        lastError = error;
        break;
      }
      this.#reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          if (value && value.length > 0) {
            this.#push(value);
          }
        }
      } catch (error) {
        lastError = error;
        // 치명적이지 않은 오류면 readable이 새 스트림이라 while이 이어 읽는다(명세). NetworkError면 readable이 null이 되어 끝난다.
      } finally {
        this.#reader = null;
        try {
          reader.releaseLock();
        } catch {
          // 이미 풀림
        }
      }
      if (this.#state !== 'open') {
        break;
      }
      if (errorName(lastError) === 'NetworkError') {
        break;
      }
    }
    if (this.#state === 'open') {
      this.#state = 'lost';
      this.#finish({ reason: 'lost', error: lastError });
      this.#wake();
    }
  }

  #push(chunk: Uint8Array): void {
    this.#ensureCapacity(this.#length + chunk.length);
    this.#buffer.set(chunk, this.#length);
    this.#length += chunk.length;
    this.received += chunk.length;
    for (const listener of [...this.#dataListeners]) {
      try {
        listener(chunk);
      } catch {
        // 기록 듣는 쪽의 오류가 통로를 멈추지 않게
      }
    }
    this.#wake();
  }

  #ensureCapacity(size: number): void {
    if (size <= this.#buffer.length) {
      return;
    }
    let capacity = this.#buffer.length;
    while (capacity < size) {
      capacity *= 2;
    }
    const next = new Uint8Array(capacity);
    next.set(this.#buffer.subarray(0, this.#length));
    this.#buffer = next;
  }

  #finish(end: ChannelEnd): void {
    if (this.#end) {
      return;
    }
    this.#end = end;
    for (const listener of [...this.#endListeners]) {
      try {
        listener(end);
      } catch {
        // 듣는 쪽의 오류는 무시
      }
    }
  }

  #wake(): void {
    for (const wake of [...this.#wakers]) {
      wake();
    }
  }

  /** check가 참이 될 때까지 기다린다. 시간이 다 되면 false, 끊기거나 닫히면(check가 거짓인 채로) 오류 */
  #waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
    if (check()) {
      return Promise.resolve(true);
    }
    const closedError = (): Error | null => {
      if (this.#state === 'lost') {
        return new BoardDisconnectedError();
      }
      if (this.#state === 'closing' || this.#state === 'closed') {
        return new SerialClosedError();
      }
      return null;
    };
    const early = closedError();
    if (early) {
      return Promise.reject(early);
    }
    return new Promise<boolean>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const done = () => {
        this.#wakers.delete(wake);
        if (timer !== null) {
          clearTimeout(timer);
        }
      };
      const wake = () => {
        if (check()) {
          done();
          resolve(true);
          return;
        }
        const error = closedError();
        if (error) {
          done();
          reject(error);
        }
      };
      this.#wakers.add(wake);
      if (Number.isFinite(timeoutMs)) {
        timer = setTimeout(
          () => {
            done();
            resolve(check());
          },
          Math.max(0, timeoutMs),
        );
      }
    });
  }
}
