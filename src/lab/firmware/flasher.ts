/**
 * ESP32에 펌웨어를 굽는 순서(스텁 없이 ROM 부트로더와 직접) — PLAN §8.3 P3-09, PD-38.
 *
 *   const flasher = await FirmwareFlasher.create({ port });           // esptool-js를 이때 늦게 불러온다
 *   const chip = await flasher.connect();                               // 굽기 모드로 리셋 → 동기화 → 칩·플래시 크기
 *   const result = await flasher.flash({ image, offset: 0x1000, eraseAll: false, expectedVersion: '1.29.0' });
 *   await flasher.close();
 *
 * 순서는 esptool.py v4.8.1 `--no-stub write_flash`와 같게 맞췄다(원문 2026-09-18 확인, 자세한 대조표는 rom.ts 머리말):
 *   포트 열기(115200) → DTR·RTS 리셋으로 굽기 모드(ClassicReset) → SYNC → 칩 magic(ESP32만) → 칩 설명 → eFuse의 SPI 패드 → SPI_ATTACH(ROM 8바이트)
 *   → RDID로 플래시 크기 → SPI_SET_PARAMS → (속도 올리기 CHANGE_BAUDRATE 460800 — 안 되면 오류, [느린 속도로 다시 굽기]는 115200 그대로)
 *   → (선택) 전체 지우기 → FLASH_DEFL_BEGIN/DATA 0x400 블록(압축) → SPI_FLASH_MD5 대조 → 115200으로 돌아와 RTS 리셋 → MicroPython 시작 글 기다리기.
 * esptool-js의 ESPLoader.main()·runStub()은 부르지 않는다(스텁은 GPL이라 사이트에 없다 — scripts/lib/esptool-stub-guard.mjs).
 *
 * 멈춤·선 빠짐: esptool-js는 취소 기능이 없어 읽기가 시간 제한(블록 3초, 지우기 최대 2분)까지 기다린다. 그래서 모든 긴 작업을 guard()로 감싸
 * [멈추기](abort)나 포트의 disconnect 이벤트가 오면 바로 실패로 끝낸다(뒤에 남은 esptool-js의 읽기는 시간 제한에서 조용히 끝난다).
 * 실물 확인은 부록 B-2(운영자 할 일 2번): 굽기 시간, 전체 지우기(FLASH_BEGIN), 460800 속도, 리셋 뒤 시작 글.
 * 모의 보드 검사: tests/unit/firmware/flasher.test.ts(src/lab/firmware/mock/esp32-rom.ts의 ROM 흉내 + 모의 시리얼).
 */
import type { ESPLoader, Transport } from 'esptool-js';
import { FlashError, type ConnectAttemptLog } from './errors.ts';
import { md5Hex } from './md5.ts';
import {
  CHIP_DETECT_MAGIC_REG_ADDR,
  ROM_BAUD_RATE,
  ROM_FLASH_WRITE_SIZE,
  flashSizeFromId,
  readSpiAttachValue,
  romEraseRegion,
  romFlashMd5,
  romSetFlashParameters,
  romSpiAttach,
} from './rom.ts';

type EsptoolModule = typeof import('esptool-js');

/** 쓰기 속도: MicroPython 공식 설치 안내의 esptool --baud 460800 */
export const FAST_BAUD_RATE = 460800;
/** 굽기 모드로 바꾸는 시도 횟수(esptool-js·esptool.py 기본 7) */
export const DEFAULT_CONNECT_ATTEMPTS = 7;
/** 리셋 뒤 MicroPython 시작 글을 기다리는 시간 */
export const DEFAULT_BOOT_WAIT_MS = 8000;
/** EN을 낮게 누르고 있는 시간(esptool HardReset 0.1초) */
export const RESET_HOLD_MS = 100;
/** 플래시 크기를 모를 때 전체 지우기 크기(교과서 키트 ESP32-WROOM 4MB) */
export const DEFAULT_ERASE_BYTES = 4 * 1024 * 1024;

export interface ChipReport {
  /** esptool-js 칩 이름(ESP32) */
  readonly chipName: string;
  /** 예: ESP32-D0WD-V3 (revision 3) */
  readonly description: string;
  /** 예: Wi-Fi, BT, Dual Core */
  readonly features: readonly string[];
  readonly flashId: number | null;
  readonly flashSizeLabel: string | null;
  readonly flashSizeBytes: number | null;
  /** 포트의 USB 정보(CH340 1a86:7523 등, 없으면 null) */
  readonly usbVendorId: number | null;
  readonly usbProductId: number | null;
}

export type FlashPhase = 'speed' | 'erase' | 'write' | 'verify' | 'restart';

export interface FlashProgress {
  readonly phase: 'erase' | 'write';
  /** write: 보낸 압축 바이트, erase: 지난 밀리초 */
  readonly done: number;
  /** write: 보낼 압축 바이트 전체, erase: 어림 시간(밀리초) */
  readonly total: number;
}

export interface BootReport {
  /** MicroPython 시작 글 한 줄(못 받았으면 null) */
  readonly banner: string | null;
  /** 시작 글의 판(예: 1.29.0) */
  readonly version: string | null;
  /** 리셋 글(rst:0x…)이 계속 되풀이되는지(부팅 반복) */
  readonly bootLoop: boolean;
  /** 받은 글 앞부분(교사용 기록, 최대 2,000자) */
  readonly output: string;
}

export interface FlashRunOptions {
  readonly image: Uint8Array;
  readonly offset: number;
  readonly eraseAll: boolean;
  /** 지울 크기를 정할 때 쓰는 최소 크기(플래시 크기를 모르면 이 값) */
  readonly eraseBytes?: number;
  readonly expectedVersion?: string;
  readonly bootWaitMs?: number;
  readonly onPhase?: (phase: FlashPhase) => void;
  readonly onProgress?: (progress: FlashProgress) => void;
}

export interface FlashResult {
  readonly bytesWritten: number;
  readonly compressedBytes: number;
  readonly md5: string;
  readonly baudRate: number;
  readonly erased: boolean;
  readonly durationMs: number;
  readonly writeMs: number;
  readonly boot: BootReport;
}

export interface FirmwareFlasherOptions {
  readonly port: SerialPort;
  /** 쓰기 속도. 115200이면 속도를 바꾸지 않는다(느린 속도로 다시 굽기) */
  readonly baudRate?: number;
  readonly connectAttempts?: number;
  /** esptool-js가 쓰는 글(교사용 기록) */
  readonly log?: (line: string) => void;
  /** 테스트용: esptool-js 불러오기 바꾸기 */
  readonly loadEsptool?: () => Promise<EsptoolModule>;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function padTo4(image: Uint8Array): Uint8Array {
  const rest = image.length % 4;
  if (rest === 0) {
    return image;
  }
  const padded = new Uint8Array(image.length + (4 - rest)).fill(0xff);
  padded.set(image);
  return padded;
}

/** 받은 바이트를 글로(시작 글은 ASCII라 한 바이트 = 한 글자로 충분하다) */
function latin1(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return text;
}

/** MicroPython 시작 글 찾기: "MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32" */
export function findMicroPythonBanner(output: string): { readonly banner: string; readonly version: string } | null {
  const match = /MicroPython v(\d+\.\d+\.\d+)[^\r\n]*/u.exec(output);
  return match ? { banner: match[0].trim(), version: match[1]! } : null;
}

/** 리셋 글이 세 번 넘게 되풀이되면 부팅 반복으로 본다 */
export function looksLikeBootLoop(output: string): boolean {
  return (output.match(/rst:0x[0-9a-f]+/giu) ?? []).length >= 3;
}

export class FirmwareFlasher {
  readonly port: SerialPort;
  readonly baudRate: number;
  private readonly transport: Transport;
  private readonly loader: ESPLoader;
  private readonly connectAttemptCount: number;
  private readonly log: (line: string) => void;
  private readonly attemptLog: string[] = [];
  private readonly stops = new Set<(error: Error) => void>();
  private report: ChipReport | null = null;
  private sawOutput = false;
  private lost = false;
  private aborted = false;
  private closed = false;
  private readonly onDisconnect = () => {
    this.lost = true;
    for (const stop of [...this.stops]) {
      stop(new FlashError('device-lost', 'The device has been lost. (serial port disconnect event)'));
    }
  };

  private constructor(options: FirmwareFlasherOptions, esptool: EsptoolModule) {
    this.port = options.port;
    this.baudRate = options.baudRate ?? FAST_BAUD_RATE;
    this.connectAttemptCount = options.connectAttempts ?? DEFAULT_CONNECT_ATTEMPTS;
    this.log = options.log ?? (() => undefined);
    this.transport = new esptool.Transport(options.port, false);
    // esptool-js는 읽기 반복이 끝날 때 등 trace()를 늘 console.log로 찍는다 — 브라우저 콘솔 대신 교사용 기록으로 보낸다
    this.transport.trace = (message: string) => this.log(`[serial] ${message}`);
    let partial = '';
    this.loader = new esptool.ESPLoader({
      transport: this.transport,
      baudrate: this.baudRate,
      debugLogging: false,
      terminal: {
        clean: () => undefined,
        writeLine: (line: string) => {
          this.log(partial + line);
          partial = '';
        },
        write: (text: string) => {
          partial += text;
        },
      },
    });
    this.port.addEventListener('disconnect', this.onDisconnect);
  }

  /** esptool-js를 불러와 플래셔를 만든다(포트는 아직 열지 않는다) */
  static async create(options: FirmwareFlasherOptions): Promise<FirmwareFlasher> {
    const esptool = await (options.loadEsptool ?? (() => import('esptool-js')))();
    return new FirmwareFlasher(options, esptool);
  }

  /** USB 선이 빠졌다는 알림을 받았는지 */
  get deviceLost(): boolean {
    return this.lost;
  }

  /** 굽기 모드로 바꾸는 시도마다의 결과(오류 풀이가 BOOT 안내·케이블 안내를 가르는 데 쓴다) */
  get connectAttempts(): ConnectAttemptLog {
    return this.attemptLog;
  }

  /** 굽기 모드로 바꾸는 동안 보드에서 무엇이든(되울림·앱 출력·부팅 글) 받았는지 */
  get receivedOutput(): boolean {
    return this.sawOutput;
  }

  get chip(): ChipReport | null {
    return this.report;
  }

  /** [멈추기]: 기다리던 작업을 바로 실패시키고 포트를 닫는다 */
  abort(): void {
    if (this.aborted) {
      return;
    }
    this.aborted = true;
    for (const stop of [...this.stops]) {
      stop(new FlashError('aborted', 'Flashing was stopped by the user.'));
    }
    void this.close();
  }

  /** 긴 작업을 멈춤·선 빠짐과 경주시킨다 */
  private guard<T>(operation: Promise<T>): Promise<T> {
    if (this.lost || this.aborted) {
      operation.catch(() => undefined);
      return Promise.reject(
        this.lost ? new FlashError('device-lost', 'The device has been lost.') : new FlashError('aborted', 'Flashing was stopped by the user.'),
      );
    }
    return new Promise<T>((resolve, reject) => {
      const stop = (error: Error) => {
        this.stops.delete(stop);
        operation.catch(() => undefined);
        reject(error);
      };
      this.stops.add(stop);
      operation.then(
        (value) => {
          if (this.stops.delete(stop)) {
            resolve(value);
          }
        },
        (error: unknown) => {
          if (!this.stops.delete(stop)) {
            return;
          }
          if (this.lost) {
            reject(new FlashError('device-lost', 'The device has been lost.', {}, { cause: error }));
          } else if (this.aborted) {
            reject(new FlashError('aborted', 'Flashing was stopped by the user.', {}, { cause: error }));
          } else {
            reject(error);
          }
        },
      );
    });
  }

  /** 포트를 열고 보드를 굽기 모드로 바꿔 칩과 플래시 크기를 알아낸다 */
  async connect(): Promise<ChipReport> {
    const loader = this.loader;
    const transport = this.transport;
    const original = loader._connectAttempt.bind(loader);
    loader._connectAttempt = async (mode, strategy) => {
      const result = await original(mode, strategy);
      this.attemptLog.push(result);
      return result;
    };
    // 보드가 무엇이든 보냈는지(되울림·앱 출력·부팅 글) — 아무것도 안 온 포트(다른 장치·전원 없음)와 굽기 모드가 아닌 보드를 가른다.
    // esptool-js 0.6.1은 받은 바이트를 readLoop와 read()에서 늘 appendArray로 붙이므로 연결하는 동안만 그 호출을 엿본다.
    const originalAppend = transport.appendArray.bind(transport);
    transport.appendArray = (first, second) => {
      if (second.length > 0) {
        this.sawOutput = true;
      }
      return originalAppend(first, second);
    };
    try {
      await this.guard(loader.connect('default_reset', this.connectAttemptCount, true));
    } finally {
      loader._connectAttempt = original;
      transport.appendArray = originalAppend;
    }
    const chip = loader.chip;
    if (chip.CHIP_NAME !== 'ESP32') {
      throw new FlashError('wrong-chip', `This chip is ${chip.CHIP_NAME}, not ESP32.`, { chip: chip.CHIP_NAME });
    }
    // 스텁이 아닌 ROM과 주고받으므로 블록 크기를 ROM 값으로(esptool-js 로더의 기본값은 스텁용 0x4000)
    loader.FLASH_WRITE_SIZE = ROM_FLASH_WRITE_SIZE;
    const description = await this.guard(chip.getChipDescription(loader));
    const features = (await this.guard(chip.getChipFeatures(loader))).map((item) => item.trim()).filter((item) => item !== '');
    const attachValue = await this.guard(readSpiAttachValue(loader));
    await this.guard(romSpiAttach(loader, attachValue));
    const flashId = (await this.guard(loader.readFlashId())) >>> 0;
    const size = flashSizeFromId(flashId);
    if (size) {
      await this.guard(romSetFlashParameters(loader, size.bytes));
    } else {
      this.log(`WARNING: flash size could not be detected (flash id 0x${flashId.toString(16)}).`);
    }
    const info = this.port.getInfo();
    this.report = {
      chipName: chip.CHIP_NAME,
      description,
      features,
      flashId,
      flashSizeLabel: size?.label ?? null,
      flashSizeBytes: size?.bytes ?? null,
      usbVendorId: info.usbVendorId ?? null,
      usbProductId: info.usbProductId ?? null,
    };
    return this.report;
  }

  /** 펌웨어를 쓰고, 쓴 내용을 대조하고, 보드를 다시 시작한다 */
  async flash(options: FlashRunOptions): Promise<FlashResult> {
    const report = this.report;
    if (!report) {
      throw new Error('connect()를 먼저 불러요.');
    }
    const started = Date.now();
    const loader = this.loader;
    let baudRate = ROM_BAUD_RATE;
    if (this.baudRate > ROM_BAUD_RATE) {
      options.onPhase?.('speed');
      try {
        await this.guard(loader.changeBaud());
        await this.guard(loader.readReg(CHIP_DETECT_MAGIC_REG_ADDR));
        baudRate = this.baudRate;
      } catch (error) {
        if (error instanceof FlashError) {
          throw error;
        }
        throw new FlashError('baud-failed', `Changing baud rate to ${this.baudRate} failed.`, {}, { cause: error });
      }
    }

    if (options.eraseAll) {
      options.onPhase?.('erase');
      const eraseBytes = report.flashSizeBytes ?? options.eraseBytes ?? DEFAULT_ERASE_BYTES;
      // ROM은 지우는 동안 대답이 없어 진행률을 알 수 없다 — 지난 시간과 어림 시간(1MB에 약 3초, 실물 확인 전)을 알린다
      const estimate = Math.round((eraseBytes / (1024 * 1024)) * 3000);
      const eraseStart = Date.now();
      const ticker = setInterval(() => options.onProgress?.({ phase: 'erase', done: Date.now() - eraseStart, total: estimate }), 500);
      try {
        await this.guard(romEraseRegion(loader, 0, eraseBytes));
      } finally {
        clearInterval(ticker);
      }
      const erasedMs = Date.now() - eraseStart;
      this.log(`Erased ${eraseBytes} bytes from 0x0 in ${erasedMs} ms (ROM FLASH_BEGIN).`);
      options.onProgress?.({ phase: 'erase', done: erasedMs, total: erasedMs });
    }

    options.onPhase?.('write');
    loader.FLASH_WRITE_SIZE = ROM_FLASH_WRITE_SIZE;
    const image = padTo4(options.image);
    let compressedBytes = 0;
    const writeStart = Date.now();
    await this.guard(
      loader.writeFlash({
        fileArray: [{ data: image, address: options.offset }],
        flashMode: 'keep',
        flashFreq: 'keep',
        flashSize: 'keep',
        eraseAll: false,
        compress: true,
        reportProgress: (_fileIndex, written, total) => {
          compressedBytes = total;
          options.onProgress?.({ phase: 'write', done: written, total });
        },
      }),
    );
    const writeMs = Date.now() - writeStart;

    options.onPhase?.('verify');
    const expected = md5Hex(image);
    const actual = await this.guard(romFlashMd5(loader, options.offset, image.length));
    this.log(`File  md5: ${expected}`);
    this.log(`Flash md5: ${actual}`);
    if (actual !== expected) {
      throw new FlashError('verify-mismatch', `MD5 of file does not match data in flash! (file ${expected}, flash ${actual})`);
    }

    options.onPhase?.('restart');
    const boot = await this.restart({ watchMs: options.bootWaitMs ?? DEFAULT_BOOT_WAIT_MS });
    return {
      bytesWritten: image.length,
      compressedBytes,
      md5: actual,
      baudRate,
      erased: options.eraseAll,
      durationMs: Date.now() - started,
      writeMs,
      boot,
    };
  }

  /**
   * 보드를 보통 모드로 다시 시작한다(DTR 끔 = IO0 높음, RTS 켰다 끔 = EN 리셋) — esptool HardReset과 같은 선 순서.
   * watchMs 동안 MicroPython 시작 글을 기다린다(0이면 기다리지 않음).
   */
  async restart(options: { readonly watchMs: number }): Promise<BootReport> {
    const transport = this.transport;
    if (transport.baudrate !== ROM_BAUD_RATE) {
      await this.guard(transport.disconnect());
      await this.guard(transport.connect(ROM_BAUD_RATE, {}));
      void transport.readLoop();
    }
    transport.flushInput();
    await this.guard(transport.setDTR(false));
    await this.guard(transport.setRTS(true));
    await sleep(RESET_HOLD_MS);
    await this.guard(transport.setRTS(false));
    let output = '';
    const deadline = Date.now() + Math.max(0, options.watchMs);
    let found = findMicroPythonBanner(output);
    while (!found && Date.now() < deadline && !this.lost && !this.aborted) {
      await sleep(50);
      const chunk = transport.peek();
      if (chunk.length > 0) {
        output += latin1(chunk);
        transport.flushInput();
        found = findMicroPythonBanner(output);
      }
    }
    if (this.lost) {
      throw new FlashError('device-lost', 'The device has been lost while restarting.');
    }
    return {
      banner: found?.banner ?? null,
      version: found?.version ?? null,
      bootLoop: !found && looksLikeBootLoop(output),
      output: output.slice(0, 2000),
    };
  }

  /** 오류 뒤 보드를 원래대로 다시 시작해 본다(실패해도 조용히) */
  async restartQuietly(): Promise<void> {
    if (this.lost || this.closed || !this.port.readable) {
      return;
    }
    try {
      await this.transport.setDTR(false);
      await this.transport.setRTS(true);
      await sleep(RESET_HOLD_MS);
      await this.transport.setRTS(false);
    } catch {
      // 포트가 이미 닫혔거나 선이 빠졌다
    }
  }

  /** 포트를 닫는다(여러 번 불러도 된다) */
  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.port.removeEventListener('disconnect', this.onDisconnect);
    try {
      await Promise.race([this.transport.disconnect(), sleep(3000).then(() => Promise.reject(new Error('close timeout')))]);
    } catch {
      // 열리지 않았거나 선이 빠진 포트
    }
  }
}
