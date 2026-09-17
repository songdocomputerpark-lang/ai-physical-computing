/**
 * Web Serial SerialPort의 테스트 대역(병렬 제작 준비 2026-09-17, src/lab/README.md 8절).
 * 사이트 코드가 진짜 포트처럼 open·readable·writable·setSignals·getSignals·getInfo·close·forget을 쓰면, 뒤에 붙은 SerialDevice(보통 MicroPythonDevice)가 응답한다.
 *
 * 진짜 동작에 맞춘 것(WICG Web Serial 명세 https://wicg.github.io/serial/ 의 알고리즘 — 2026-09-17 원문 확인. 오류는 이름(name)이 명세와 같고, 문장은 Chromium과 비슷하게 적었다)
 * - open: [[state]]가 "closed"가 아니면 InvalidStateError. baudRate가 없거나 0, dataBits가 7·8이 아님, stopBits가 1·2가 아님, bufferSize 0이면 TypeError
 *   (값을 undefined로 넘기면 기본값 8·1·255 — esptool-js Transport.connect가 이렇게 부른다). 운영체제가 못 열면 NetworkError.
 * - readable·writable: 열린 동안만 있고, 읽기 쪽을 cancel·쓰기 쪽을 close/abort하면 다음 접근 때 새 스트림을 준다(while (port.readable) 반복 모양).
 * - USB 선이 빠지면: 읽기 스트림이 NetworkError("The device has been lost.")로 끝나고 readable은 null, 다음 쓰기도 NetworkError(writable은 null).
 *   포트는 "opened" 그대로라 close()는 성공한다(그 뒤 open은 NetworkError). 'disconnect' 이벤트는 포트에서 일어나 navigator.serial로 올라간다.
 * - close: [[state]]가 "opened"가 아니면 InvalidStateError. 스트림이 잠겨 있으면(getReader·getWriter 뒤 releaseLock 안 함) TypeError.
 * - setSignals: 열려 있어야 하고(InvalidStateError), 멤버가 하나도 없으면 TypeError, 적은 선만 바꾼다. getSignals도 열려 있어야 한다.
 * - forget: 허락을 없애고 "forgotten"이 된다(열려 있었으면 끊긴 것처럼 스트림이 끝난다). 그 뒤 open·close는 InvalidStateError.
 * 흉내 모델(명세 밖): 열면 DTR·RTS를 켠다(자동 리셋 회로가 있는 보드도 리셋되지 않는 조합), 닫으면 둘 다 끈다.
 *   setSignals 한 번은 한꺼번에 바뀐 것으로 장치에 알린다(실물 운영체제는 DTR→RTS→break 순서로 따로 바꿀 수 있다 — 명세 참고 문장).
 * 테스트 도구다(배포 번들에 들어가지 않음).
 */
import { concatBytes, latin1, toBytes } from './bytes.ts';
import type { SerialDevice, SerialDeviceIO, SerialLineSignals } from './device.ts';

/** 흔한 USB-시리얼 칩의 VID·PID(PLAN §8.3 P3-07 — CH340 1a86:7523, CP210x 10c4:ea60) */
export const USB_IDS = Object.freeze({
  ch340: Object.freeze({ usbVendorId: 0x1a86, usbProductId: 0x7523 }),
  cp2102: Object.freeze({ usbVendorId: 0x10c4, usbProductId: 0xea60 }),
});

export const DEVICE_LOST_MESSAGE = 'The device has been lost.';

export interface MockSerialPortOptions {
  /** getInfo() 값(기본 CH340) */
  readonly info?: SerialPortInfo;
  /** 뒤에 붙은 장치(없으면 아무 응답 없는 포트) */
  readonly device?: SerialDevice | null;
  /** 테스트용 이름 */
  readonly label?: string;
  /** open()이 이 이름의 DOMException으로 실패(예: 'NetworkError' — 다른 프로그램이 포트를 쓰는 중) */
  readonly openError?: string | null;
  /** 장치 출력을 이 크기로 잘라 보낸다(USB 조각 흉내, 기본 64) */
  readonly chunkSize?: number;
  /** 장치 출력이 호스트에 닿기까지 밀리초(기본 0 — 바로 스트림에 넣는다) */
  readonly deliveryDelayMs?: number;
}

type PortState = 'closed' | 'opening' | 'opened' | 'forgotten';

function domError(name: string, message: string): Error {
  if (typeof DOMException === 'function') {
    return new DOMException(message, name);
  }
  const error = new Error(message);
  error.name = name;
  return error;
}

export class MockSerialPort extends EventTarget {
  onconnect: ((this: MockSerialPort, event: Event) => void) | null = null;
  ondisconnect: ((this: MockSerialPort, event: Event) => void) | null = null;

  readonly label: string;
  readonly device: SerialDevice | null;
  /** 호스트가 쓴 조각(순서대로) */
  readonly written: Uint8Array[] = [];
  /** 호스트에게 보낸 조각(순서대로) */
  readonly delivered: Uint8Array[] = [];
  /** 선 상태 기록(open·setSignals·close 한 번마다 — 값이 같아도 적는다. 장치에는 값이 바뀔 때만 알린다) */
  readonly signalLog: SerialLineSignals[] = [];
  /** open()에 넘긴 값 기록 */
  readonly openLog: SerialOptions[] = [];

  private readonly info: SerialPortInfo;
  private readonly options: MockSerialPortOptions;
  private state: PortState = 'closed';
  private plugged = true;
  private readFatal = false;
  private writeFatal = false;
  private signalState: SerialLineSignals = { dataTerminalReady: false, requestToSend: false, break: false };
  private readableStream: ReadableStream<Uint8Array> | null = null;
  private readableController: ReadableStreamDefaultController<Uint8Array> | null = null;
  private writableStream: WritableStream<Uint8Array> | null = null;
  private pending: Uint8Array[] = [];
  private readonly io: SerialDeviceIO = { emit: (data) => this.fromDevice(toBytes(data)) };

  constructor(options: MockSerialPortOptions = {}) {
    super();
    this.options = options;
    this.info = { ...(options.info ?? USB_IDS.ch340) };
    this.label = options.label ?? 'mock port';
    this.device = options.device ?? null;
    this.device?.attach(this.io);
    this.addEventListener('connect', (event) => this.onconnect?.call(this, event));
    this.addEventListener('disconnect', (event) => this.ondisconnect?.call(this, event));
  }

  // ───────────── SerialPort ─────────────

  /** 명세의 connected: 선이 꽂혀 있는지 */
  get connected(): boolean {
    return this.plugged;
  }

  get isOpen(): boolean {
    return this.state === 'opened';
  }

  get forgotten(): boolean {
    return this.state === 'forgotten';
  }

  get readable(): ReadableStream<Uint8Array> | null {
    if (this.readableStream) {
      return this.readableStream;
    }
    if (this.state !== 'opened' || this.readFatal) {
      return null;
    }
    const stream: ReadableStream<Uint8Array> = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.readableController = controller;
        for (const chunk of this.pending.splice(0)) {
          controller.enqueue(chunk);
        }
      },
      cancel: () => {
        if (this.readableStream === stream) {
          this.readableStream = null;
          this.readableController = null;
        }
      },
    });
    this.readableStream = stream;
    return stream;
  }

  get writable(): WritableStream<Uint8Array> | null {
    if (this.writableStream) {
      return this.writableStream;
    }
    if (this.state !== 'opened' || this.writeFatal) {
      return null;
    }
    const stream: WritableStream<Uint8Array> = new WritableStream<Uint8Array>({
      write: (chunk) => {
        if (!(chunk instanceof Uint8Array) && !ArrayBuffer.isView(chunk) && !((chunk as unknown) instanceof ArrayBuffer)) {
          throw new TypeError("Failed to execute 'write' on 'WritableStreamDefaultWriter': The provided value is not of type '(ArrayBuffer or ArrayBufferView)'.");
        }
        if (this.state !== 'opened' || !this.plugged) {
          this.writeFatal = true;
          if (this.writableStream === stream) {
            this.writableStream = null;
          }
          throw domError('NetworkError', DEVICE_LOST_MESSAGE);
        }
        const bytes = toBytes(chunk as Uint8Array);
        this.written.push(bytes);
        const device = this.device;
        if (device) {
          // 실물처럼 쓰기가 끝난 뒤 장치가 받는다(같은 작업 차례에서 응답이 끼어들지 않게, 쓴 순서대로)
          setTimeout(() => device.receive(bytes), 0);
        }
      },
      close: () => {
        if (this.writableStream === stream) {
          this.writableStream = null;
        }
      },
      abort: () => {
        if (this.writableStream === stream) {
          this.writableStream = null;
        }
      },
    });
    this.writableStream = stream;
    return stream;
  }

  async open(options: SerialOptions): Promise<void> {
    if (this.state !== 'closed') {
      throw domError('InvalidStateError', 'The port is already open.');
    }
    if (!options || options.baudRate === undefined) {
      throw new TypeError("Failed to execute 'open' on 'SerialPort': Failed to read the 'baudRate' property from 'SerialOptions': Required member is undefined.");
    }
    if (!(options.baudRate > 0)) {
      throw new TypeError('Requested baud rate must be greater than zero.');
    }
    const dataBits = options.dataBits ?? 8;
    if (dataBits !== 7 && dataBits !== 8) {
      throw new TypeError('Requested number of data bits must be 7 or 8.');
    }
    const stopBits = options.stopBits ?? 1;
    if (stopBits !== 1 && stopBits !== 2) {
      throw new TypeError('Requested number of stop bits must be 1 or 2.');
    }
    if (options.bufferSize !== undefined && !(options.bufferSize > 0)) {
      throw new TypeError('Requested buffer size must be greater than zero.');
    }
    // 명세: [[state]]를 "opening"으로 두고 운영체제에 여는 일은 "in parallel", 결과는 다음 작업(task)에서 알린다
    // — 같은 차례의 마이크로태스크에서 장치가 낸 출력은 열리기 전이라 사라진다
    this.state = 'opening';
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (!this.plugged || this.options.openError) {
      this.state = 'closed';
      throw domError(this.plugged ? (this.options.openError ?? 'NetworkError') : 'NetworkError', 'Failed to open serial port.');
    }
    this.openLog.push({ ...options });
    this.state = 'opened';
    this.readFatal = false;
    this.writeFatal = false;
    this.pending = [];
    this.device?.opened?.(options);
    this.applySignals({ dataTerminalReady: true, requestToSend: true, break: false });
  }

  async close(): Promise<void> {
    if (this.state !== 'opened') {
      throw domError('InvalidStateError', 'The port is already closed.');
    }
    if (this.readableStream?.locked) {
      throw new TypeError("Failed to execute 'cancel' on 'ReadableStream': Cannot cancel a locked stream");
    }
    if (this.writableStream?.locked) {
      throw new TypeError("Failed to execute 'abort' on 'WritableStream': Cannot abort a locked stream");
    }
    const readable = this.readableStream;
    const writable = this.writableStream;
    this.readableStream = null;
    this.readableController = null;
    this.writableStream = null;
    await readable?.cancel().catch(() => undefined);
    await writable?.abort().catch(() => undefined);
    this.state = 'closed';
    this.readFatal = false;
    this.writeFatal = false;
    this.pending = [];
    if (this.plugged) {
      this.applySignals({ dataTerminalReady: false, requestToSend: false, break: false });
    }
    this.device?.closed?.();
  }

  async setSignals(signals: SerialOutputSignals): Promise<void> {
    if (this.state !== 'opened') {
      throw domError('InvalidStateError', 'The port is closed.');
    }
    if (!signals || (signals.dataTerminalReady === undefined && signals.requestToSend === undefined && signals.break === undefined)) {
      throw new TypeError("Failed to execute 'setSignals' on 'SerialPort': Signals dictionary must contain at least one member.");
    }
    if (!this.plugged) {
      throw domError('NetworkError', 'Failed to set control signals.');
    }
    this.applySignals({
      dataTerminalReady: signals.dataTerminalReady ?? this.signalState.dataTerminalReady,
      requestToSend: signals.requestToSend ?? this.signalState.requestToSend,
      break: signals.break ?? this.signalState.break,
    });
  }

  async getSignals(): Promise<SerialInputSignals> {
    if (this.state !== 'opened') {
      throw domError('InvalidStateError', 'The port is closed.');
    }
    if (!this.plugged) {
      throw domError('NetworkError', 'Failed to get control signals.');
    }
    return this.device?.inputSignals?.() ?? { dataCarrierDetect: false, clearToSend: false, ringIndicator: false, dataSetReady: false };
  }

  getInfo(): SerialPortInfo {
    return { ...this.info };
  }

  async forget(): Promise<void> {
    if (this.state === 'opened') {
      this.loseStreams();
    }
    this.state = 'forgotten';
  }

  // ───────────── 테스트 조작 ─────────────

  /** USB 선을 뺀다: 열린 스트림을 NetworkError로 끝내고 장치 전원을 끄고 'disconnect'를 알린다 */
  unplug(): void {
    if (!this.plugged) {
      return;
    }
    this.plugged = false;
    if (this.state === 'opened') {
      this.loseStreams();
    }
    this.device?.detach?.();
    this.dispatchEvent(new Event('disconnect', { bubbles: true }));
  }

  /** USB 선을 다시 꽂는다(장치는 전원이 새로 들어와 부팅한다) */
  plug(): void {
    if (this.plugged) {
      return;
    }
    this.plugged = true;
    this.signalState = { dataTerminalReady: false, requestToSend: false, break: false };
    this.device?.attach(this.io);
    this.dispatchEvent(new Event('connect', { bubbles: true }));
  }

  /** FakeSerial.requestPort가 잊었던 포트를 다시 허락할 때 */
  restorePermission(): void {
    if (this.state === 'forgotten') {
      this.state = 'closed';
      this.readFatal = false;
      this.writeFatal = false;
    }
  }

  /** 호스트가 쓴 바이트 전체(0~255 글자) */
  writtenText(): string {
    return latin1(concatBytes(this.written));
  }

  /** 호스트에게 보낸 바이트 전체(0~255 글자) */
  deliveredText(): string {
    return latin1(concatBytes(this.delivered));
  }

  get lineSignals(): SerialLineSignals {
    return { ...this.signalState };
  }

  // ───────────── 안쪽 ─────────────

  private loseStreams(): void {
    const lost = domError('NetworkError', DEVICE_LOST_MESSAGE);
    this.readFatal = true;
    this.writeFatal = true;
    try {
      this.readableController?.error(lost);
    } catch {
      // 이미 끝난 스트림
    }
    this.readableStream = null;
    this.readableController = null;
    this.pending = [];
    // 쓰기 스트림은 명세처럼 그대로 두고 다음 쓰기에서 NetworkError(그때 writable이 null이 된다)
  }

  private applySignals(next: SerialLineSignals): void {
    const previous = this.signalState;
    this.signalState = next;
    this.signalLog.push({ ...next });
    if (previous.dataTerminalReady !== next.dataTerminalReady || previous.requestToSend !== next.requestToSend || previous.break !== next.break) {
      this.device?.signals?.({ ...next });
    }
  }

  private fromDevice(bytes: Uint8Array): void {
    if (this.state !== 'opened' || !this.plugged || this.readFatal || bytes.length === 0) {
      return;
    }
    const size = Math.max(1, this.options.chunkSize ?? 64);
    const chunks: Uint8Array[] = [];
    for (let offset = 0; offset < bytes.length; offset += size) {
      chunks.push(bytes.slice(offset, offset + size));
    }
    const deliver = () => {
      if (this.state !== 'opened' || this.readFatal) {
        return;
      }
      for (const chunk of chunks) {
        this.delivered.push(chunk);
        if (this.readableController) {
          try {
            this.readableController.enqueue(chunk);
            continue;
          } catch {
            // 닫힌 스트림이면 다음 스트림을 위해 쌓아 둔다
          }
        }
        this.pending.push(chunk);
      }
    };
    const delay = this.options.deliveryDelayMs ?? 0;
    if (delay > 0) {
      setTimeout(deliver, delay);
    } else {
      deliver();
    }
  }
}
