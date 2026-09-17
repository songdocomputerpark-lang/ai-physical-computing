// 실제 보드 연결(P3-07) 테스트용 작은 장치들 — 모의 시리얼(src/lab/serial/mock/)의 SerialDevice 약속을 따른다.
// MicroPythonDevice가 흉내 내지 않는 보드 모습(펌웨어가 지워져 부팅 글만 되풀이, Ctrl-C를 듣지 않고 계속 찍는 프로그램)을 만든다.
import type { SerialDevice, SerialDeviceIO } from '../../../../src/lab/serial/mock/index.ts';

/** 붙어 있는 동안 intervalMs마다 lines를 차례로 보내고, 받은 바이트는 무시하는 장치 */
export class RepeatingTextDevice implements SerialDevice {
  readonly received: Uint8Array[] = [];
  #io: SerialDeviceIO | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #index = 0;

  constructor(
    private readonly lines: readonly string[],
    private readonly intervalMs = 25,
    private readonly firstText = '',
  ) {}

  attach(io: SerialDeviceIO): void {
    this.#io = io;
    this.#index = 0;
    this.stop();
    if (this.firstText) {
      io.emit(this.firstText);
    }
    this.#timer = setInterval(() => {
      const line = this.lines[this.#index % this.lines.length];
      this.#index += 1;
      if (line !== undefined) {
        this.#io?.emit(line);
      }
    }, this.intervalMs);
  }

  detach(): void {
    this.stop();
    this.#io = null;
  }

  receive(bytes: Uint8Array): void {
    this.received.push(new Uint8Array(bytes));
  }

  stop(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }
}

/** 펌웨어가 지워진 ESP32: ROM 부팅 글 뒤 "invalid header: 0xffffffff"를 되풀이(워치독 리셋 반복) */
export function noFirmwareDevice(): RepeatingTextDevice {
  return new RepeatingTextDevice(
    ['invalid header: 0xffffffff\r\n', 'invalid header: 0xffffffff\r\n', 'ets Jul 29 2019 12:21:46\r\n\r\nrst:0x10 (RTCWDT_RTC_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\r\n'],
    30,
  );
}

/** Ctrl-C를 삼키며 계속 찍는 MicroPython 프로그램(맨 except로 KeyboardInterrupt를 잡는 반복문과 같은 모습) */
export function stubbornProgramDevice(): RepeatingTextDevice {
  return new RepeatingTextDevice(['tick\r\n', 'Traceback (most recent call last):\r\n  File "main.py", line 4, in <module>\r\nKeyboardInterrupt: \r\n'], 30);
}
