/**
 * 모의 시리얼 포트에 붙이는 "장치"의 약속과 간단한 장치들(병렬 제작 준비 2026-09-17, src/lab/README.md 8절).
 * MockSerialPort(mock-port.ts)가 호스트(사이트 코드)의 쓰기를 receive로 넘기고, 장치가 emit한 바이트를 readable로 흘려보낸다.
 * 테스트 도구다(배포 번들에 들어가지 않음).
 */
import { toBytes } from './bytes.ts';

export interface SerialDeviceIO {
  /** 장치 → 호스트 바이트. 포트가 닫혀 있으면 실물처럼 사라진다 */
  emit(data: Uint8Array | string): void;
}

/** DTR·RTS·break — setSignals가 일부만 주어도 장치는 늘 세 값 모두를 받는다 */
export interface SerialLineSignals {
  readonly dataTerminalReady: boolean;
  readonly requestToSend: boolean;
  readonly break: boolean;
}

export interface SerialDevice {
  /** 포트에 붙을 때(USB 전원이 들어오는 때 — 다시 꽂을 때도) */
  attach(io: SerialDeviceIO): void;
  /** USB 선이 빠져 전원이 꺼질 때 */
  detach?(): void;
  /** 호스트가 port.open()했을 때 */
  opened?(options: SerialOptions): void;
  /** 호스트가 port.close()했을 때 */
  closed?(): void;
  /** 호스트 → 장치 바이트(쓰기 한 번 = 한 조각) */
  receive(bytes: Uint8Array): void;
  /** setSignals 한 번이 끝난 뒤의 선 상태(한 번의 호출은 한꺼번에 바뀐 것으로 본다) */
  signals?(signals: SerialLineSignals): void;
  /** getSignals()가 돌려줄 입력 선 상태 */
  inputSignals?(): SerialInputSignals;
}

/** 아무 응답도 하지 않는 장치 — MicroPython이 없는(또는 멈춘) 보드. [펌웨어 굽기] 안내 흐름 시험용 */
export class SilentDevice implements SerialDevice {
  readonly received: Uint8Array[] = [];
  attach(): void {}
  receive(bytes: Uint8Array): void {
    this.received.push(new Uint8Array(bytes));
  }
}

/** 받은 바이트가 있을 때마다(또는 처음 한 번) 정해진 글을 보내는 장치 — 다른 펌웨어(아두이노 스케치 등)가 든 보드 */
export class TextDevice implements SerialDevice {
  private io: SerialDeviceIO | null = null;
  private sent = false;
  readonly received: Uint8Array[] = [];

  constructor(
    private readonly text: string,
    private readonly mode: 'every-write' | 'once' = 'every-write',
  ) {}

  attach(io: SerialDeviceIO): void {
    this.io = io;
    this.sent = false;
  }

  detach(): void {
    this.io = null;
  }

  receive(bytes: Uint8Array): void {
    this.received.push(new Uint8Array(bytes));
    if (this.mode === 'once' && this.sent) {
      return;
    }
    this.sent = true;
    this.io?.emit(toBytes(this.text));
  }
}

/** 받은 바이트를 그대로 돌려보내는 장치(연결 흐름·포트 이름표 시험용) */
export class EchoDevice implements SerialDevice {
  private io: SerialDeviceIO | null = null;
  attach(io: SerialDeviceIO): void {
    this.io = io;
  }
  detach(): void {
    this.io = null;
  }
  receive(bytes: Uint8Array): void {
    this.io?.emit(bytes);
  }
}
