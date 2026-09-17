/**
 * 모의 ESP32 ROM 부트로더 — 펌웨어 굽기(P3-09)를 실물 보드 없이 시험하는 테스트 도구(배포 번들에 들어가지 않음, 어느 페이지도 import하지 않는다).
 *
 * 모의 시리얼의 MicroPythonDevice(src/lab/serial/mock/)가 DTR·RTS 리셋 순서로 다운로드 모드에 들어가면 받은 바이트를 이 흉내의 handler로 넘긴다
 * (Node: new MicroPythonDevice({ onBootloader: rom.handler }), 브라우저: ./serial-plugin.ts). 흉내 낸 규약(2026-09-18 원문 확인):
 * - esptool 문서 "Serial Protocol": SLIP(0xC0 틀, 0xDB 0xDC = 0xC0, 0xDB 0xDD = 0xDB), 요청 [0x00, 명령, 길이 2, 체크섬 4, 데이터],
 *   응답 [0x01, 명령, 길이 2, 값 4, 데이터 + 상태 4바이트(ESP32 ROM은 끝 4바이트, 앞 2바이트가 상태)], 체크섬은 0xEF에서 데이터 바이트를 XOR.
 *   SYNC(0x08)는 36바이트(07 07 12 20 + 0x55×32)이고 ROM은 응답을 8번 보낸다(esptool.py sync()가 1 + 7번 읽음, ROM 값은 0이 아님).
 *   ROM이 받는 명령: FLASH_BEGIN/DATA/END, MEM_BEGIN/END/DATA, SYNC, WRITE_REG, READ_REG, SPI_SET_PARAMS, SPI_ATTACH, CHANGE_BAUDRATE,
 *   FLASH_DEFL_BEGIN/DATA/END, SPI_FLASH_MD5(ROM은 32글자 16진수 ASCII). ERASE_FLASH(0xd0)·ERASE_REGION·READ_FLASH·RUN_USER_CODE는 스텁 전용이라 오류.
 * - esptool.py v4.8.1(--no-stub, ESP32): SPI_ATTACH는 8바이트, SPI_SET_PARAMS는 24바이트, FLASH_DEFL_BEGIN은 16바이트(쓸 크기는 블록 크기의 배수),
 *   ROM의 블록 크기는 0x400 — 이 흉내는 이 길이·크기를 어기면 오류로 대답한다(사이트 코드가 esptool.py와 같은 모양으로 보내는지 테스트가 잡게).
 * - ESP32 칩 알아보기: 0x40001000 = 0x00f01d83. eFuse(0x3ff5a000 + 4×n) 기본값은 ESP32-D0WD-V3(revision 3)·Wi-Fi·BT·듀얼 코어·240MHz로
 *   esptool-js targets/esp32.js의 getChipDescription·getChipFeatures가 읽는 비트에 맞췄다. SPI 레지스터(0x3ff42000)의 사용자 명령 RDID(0x9f)는 flashId를 준다.
 * 흉내 내지 않는 것: 실제 지우기·쓰기 시간(옵션으로 늦출 수 있음), 속도(보드레이트) 불일치로 깨지는 바이트, 보안 기능(암호화·보안 부팅), XMC 플래시 복구 순서.
 * 흉내에서 된다는 것은 실물의 증거가 아니다(부록 B-2).
 */
// @ts-expect-error pako 2.2.0(esptool-js의 의존성으로 설치됨)에는 타입 선언이 없다 — 쓰는 부분만 아래 PakoInflate로 적는다.
import { Inflate as PakoInflateClass } from 'pako';
import type { BootloaderHandler, MicroPythonDevice } from '../../serial/mock/micropython-device.ts';
import type { SerialDeviceIO } from '../../serial/mock/device.ts';
import { md5Hex } from '../md5.ts';

/** pako.Inflate에서 흉내가 쓰는 부분(zlib 형식 — esptool-js가 pako.deflate로 만든 데이터를 푼다) */
interface PakoInflate {
  push(data: Uint8Array, flush?: boolean): boolean;
  onData: (chunk: Uint8Array) => void;
  readonly err: number;
  readonly msg: string;
}

const Inflate = PakoInflateClass as new () => PakoInflate;

export const ESP32_CHIP_MAGIC = 0x00f01d83;
/** 흉내가 기본으로 쓰는 플래시 RDID(제조사 0xEF, 장치 0x40, 용량 코드 0x16 = 4MB) */
export const DEFAULT_FLASH_ID = 0x1640ef;
export const ROM_BLOCK_SIZE = 0x400;

const SLIP_END = 0xc0;
const SLIP_ESC = 0xdb;
const SPI_REG_BASE = 0x3ff42000;
const SPI_CMD_USR = 1 << 18;
const EFUSE_BASE = 0x3ff5a000;
const APB_CTL_DATE = 0x3ff66000 + 0x7c;
const UART_CLKDIV_REG = 0x3ff40014;

/** ROM 오류 코드(esptool 문서 "ROM loader errors") */
export const ROM_ERRORS = Object.freeze({
  invalidMessage: 0x05,
  failedToAct: 0x06,
  invalidCrc: 0x07,
  flashWrite: 0x08,
  flashRead: 0x09,
  deflate: 0x0b,
});

export const ROM_COMMAND_NAMES: Readonly<Record<number, string>> = Object.freeze({
  0x02: 'FLASH_BEGIN',
  0x03: 'FLASH_DATA',
  0x04: 'FLASH_END',
  0x05: 'MEM_BEGIN',
  0x06: 'MEM_END',
  0x07: 'MEM_DATA',
  0x08: 'SYNC',
  0x09: 'WRITE_REG',
  0x0a: 'READ_REG',
  0x0b: 'SPI_SET_PARAMS',
  0x0d: 'SPI_ATTACH',
  0x0f: 'CHANGE_BAUDRATE',
  0x10: 'FLASH_DEFL_BEGIN',
  0x11: 'FLASH_DEFL_DATA',
  0x12: 'FLASH_DEFL_END',
  0x13: 'SPI_FLASH_MD5',
  0x14: 'GET_SECURITY_INFO',
  0xd0: 'ERASE_FLASH',
  0xd1: 'ERASE_REGION',
  0xd2: 'READ_FLASH',
  0xd3: 'RUN_USER_CODE',
});

export interface Esp32RomOptions {
  /** 플래시 크기(기본 4MB) */
  readonly flashSize?: number;
  /** RDID 값(기본 0x1640ef — 4MB) */
  readonly flashId?: number;
  /** 0x40001000 값(기본 ESP32). 다른 칩 흉내: ESP32-S3는 0x9 */
  readonly chipMagic?: number;
  /** eFuse 낱말 바꾸기(번호 → 값) */
  readonly efuseWords?: Readonly<Record<number, number>>;
  /** 전체 지우기 1MB에 걸리는 밀리초(기본 0) */
  readonly eraseMsPerMb?: number;
  /** 압축 블록 하나를 쓰는 데 걸리는 밀리초(기본 0) */
  readonly writeMsPerBlock?: number;
  /** 이 순번의 FLASH_DEFL_DATA에 대답하지 않는다(멈춘 보드) */
  readonly hangAtBlock?: number | null;
  /** 이 플래시 주소의 바이트를 쓸 때 뒤집는다(MD5 다름 흉내) */
  readonly corruptAddress?: number | null;
  /** CHANGE_BAUDRATE에 대답하지 않는다 */
  readonly ignoreBaudChange?: boolean;
}

export interface RomCommandRecord {
  readonly op: number;
  readonly name: string;
  readonly size: number;
}

interface DeflateSession {
  readonly offset: number;
  readonly writeSize: number;
  readonly blocks: number;
  readonly blockSize: number;
  readonly inflate: PakoInflate;
  nextSeq: number;
  written: number;
}

interface RawSession {
  readonly offset: number;
  readonly size: number;
  readonly blocks: number;
  readonly blockSize: number;
  nextSeq: number;
}

function defaultEfuses(): Map<number, number> {
  // 낱말 3: 패키지 버전 1(D0WD, 비트 9) · 개정 비트0(비트 15) · CPU 속도 표시(비트 13 = 240MHz), 낱말 5: 개정 비트1(비트 20)
  return new Map<number, number>([
    [3, (1 << 9) | (1 << 13) | (1 << 15)],
    [5, 1 << 20],
  ]);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function slipEncode(body: Uint8Array): Uint8Array {
  const out: number[] = [SLIP_END];
  for (const byte of body) {
    if (byte === SLIP_END) {
      out.push(SLIP_ESC, 0xdc);
    } else if (byte === SLIP_ESC) {
      out.push(SLIP_ESC, 0xdd);
    } else {
      out.push(byte);
    }
  }
  out.push(SLIP_END);
  return Uint8Array.from(out);
}

export class Esp32RomEmulator {
  readonly flash: Uint8Array;
  readonly commands: RomCommandRecord[] = [];
  /** 지운 영역 기록 */
  readonly erased: { offset: number; size: number }[] = [];
  /** 받은 SPI_ATTACH·SPI_SET_PARAMS 값 */
  spiAttach: { length: number; value: number } | null = null;
  flashParameterSize: number | null = null;
  /** 마지막으로 바꾼 속도(바꾸지 않았으면 115200) */
  baudRate = 115200;
  /** 체크섬·순번·길이 오류로 대답한 수 */
  protocolErrors = 0;

  private options: Esp32RomOptions;
  private readonly registers = new Map<number, number>();
  private readonly efuses: Map<number, number>;
  private frame: number[] = [];
  private inFrame = false;
  private escaping = false;
  private session: DeflateSession | null = null;
  private rawSession: RawSession | null = null;
  private io: SerialDeviceIO | null = null;
  private device: MicroPythonDevice | null = null;
  private seenResets = -1;

  constructor(options: Esp32RomOptions = {}) {
    this.options = { ...options };
    this.flash = new Uint8Array(options.flashSize ?? 4 * 1024 * 1024).fill(0xff);
    this.efuses = defaultEfuses();
    for (const [word, value] of Object.entries(options.efuseWords ?? {})) {
      this.efuses.set(Number(word), value >>> 0);
    }
  }

  /** 테스트 중에 옵션을 바꾼다(예: 쓰는 도중 멈추게) */
  setOption<K extends keyof Esp32RomOptions>(key: K, value: Esp32RomOptions[K]): void {
    this.options = { ...this.options, [key]: value };
  }

  /** MicroPythonDevice의 다운로드 모드 처리기 */
  readonly handler: BootloaderHandler = (bytes, io, device) => {
    this.io = io;
    this.device = device;
    if (device.hardResets !== this.seenResets) {
      // 새로 굽기 모드에 들어왔다 — 받던 틀과 쓰기 순서를 버린다(플래시 내용은 남는다)
      this.seenResets = device.hardResets;
      this.frame = [];
      this.inFrame = false;
      this.escaping = false;
      this.session = null;
      this.rawSession = null;
      this.baudRate = 115200;
    }
    for (const byte of bytes) {
      this.receiveByte(byte);
    }
  };

  commandNames(): string[] {
    return this.commands.map((item) => item.name);
  }

  count(name: string): number {
    return this.commands.filter((item) => item.name === name).length;
  }

  read(offset: number, length: number): Uint8Array {
    return this.flash.slice(offset, offset + length);
  }

  md5(offset: number, length: number): string {
    return md5Hex(this.flash.subarray(offset, offset + length));
  }

  private receiveByte(byte: number): void {
    if (byte === SLIP_END) {
      if (this.inFrame && this.frame.length > 0) {
        const frame = Uint8Array.from(this.frame);
        this.frame = [];
        this.inFrame = false;
        this.handleFrame(frame);
      } else {
        this.inFrame = true;
        this.frame = [];
      }
      return;
    }
    if (!this.inFrame) {
      return;
    }
    if (this.escaping) {
      this.escaping = false;
      this.frame.push(byte === 0xdc ? SLIP_END : byte === 0xdd ? SLIP_ESC : byte);
      return;
    }
    if (byte === SLIP_ESC) {
      this.escaping = true;
      return;
    }
    this.frame.push(byte);
  }

  private respond(op: number, value: number, data: Uint8Array, delayMs = 0): void {
    const body = new Uint8Array(8 + data.length);
    body[0] = 0x01;
    body[1] = op;
    body[2] = data.length & 0xff;
    body[3] = (data.length >> 8) & 0xff;
    new DataView(body.buffer).setUint32(4, value >>> 0, true);
    body.set(data, 8);
    const encoded = slipEncode(body);
    const io = this.io;
    const device = this.device;
    const resets = this.seenResets;
    const send = () => {
      // 그 사이 보드가 리셋됐으면(굽기 모드가 끝났으면) 대답하지 않는다
      if (device && (device.mode !== 'bootloader' || device.hardResets !== resets)) {
        return;
      }
      io?.emit(encoded);
    };
    if (delayMs > 0) {
      setTimeout(send, delayMs);
    } else {
      send();
    }
  }

  private ok(op: number, value = 0, delayMs = 0): void {
    this.respond(op, value, Uint8Array.of(0, 0, 0, 0), delayMs);
  }

  private fail(op: number, error: number): void {
    this.protocolErrors += 1;
    this.respond(op, 0, Uint8Array.of(1, error, 0, 0));
  }

  private handleFrame(frame: Uint8Array): void {
    if (frame.length < 8 || frame[0] !== 0x00) {
      return;
    }
    const op = frame[1]!;
    const size = frame[2]! | (frame[3]! << 8);
    const checksum = u32(frame, 4);
    const data = frame.subarray(8);
    this.commands.push({ op, name: ROM_COMMAND_NAMES[op] ?? `0x${op.toString(16)}`, size: data.length });
    if (data.length !== size) {
      this.fail(op, ROM_ERRORS.invalidMessage);
      return;
    }
    switch (op) {
      case 0x08:
        this.handleSync(data);
        return;
      case 0x0a:
        if (data.length !== 4) {
          this.fail(op, ROM_ERRORS.invalidMessage);
          return;
        }
        this.ok(op, this.readRegister(u32(data, 0)));
        return;
      case 0x09:
        this.handleWriteRegister(data);
        return;
      case 0x0d:
        // esptool.py flash_spi_attach(ROM): 값 4바이트 + is_legacy·예약 4바이트
        if (data.length !== 8) {
          this.fail(op, ROM_ERRORS.invalidMessage);
          return;
        }
        this.spiAttach = { length: data.length, value: u32(data, 0) };
        this.ok(op);
        return;
      case 0x0b:
        if (data.length !== 24) {
          this.fail(op, ROM_ERRORS.invalidMessage);
          return;
        }
        this.flashParameterSize = u32(data, 4);
        this.ok(op);
        return;
      case 0x0f:
        if (data.length !== 8) {
          this.fail(op, ROM_ERRORS.invalidMessage);
          return;
        }
        if (this.options.ignoreBaudChange) {
          return;
        }
        this.ok(op);
        this.baudRate = u32(data, 0);
        return;
      case 0x02:
        this.handleFlashBegin(data);
        return;
      case 0x03:
        this.handleFlashData(data, checksum);
        return;
      case 0x04:
        this.rawSession = null;
        this.ok(op);
        return;
      case 0x12:
        this.session = null;
        this.ok(op);
        return;
      case 0x06:
        this.ok(op);
        return;
      case 0x05:
      case 0x07:
        // 스텁 올리기(MEM_*) — 기록만 하고 받아 준다(사이트는 보내지 않아야 한다: PD-38)
        this.ok(op);
        return;
      case 0x10:
        this.handleDeflateBegin(data);
        return;
      case 0x11:
        this.handleDeflateData(data, checksum);
        return;
      case 0x13:
        this.handleMd5(data);
        return;
      default:
        // ERASE_FLASH·ERASE_REGION·READ_FLASH·RUN_USER_CODE·GET_SECURITY_INFO 등: ESP32 ROM은 모르는 명령
        this.fail(op, ROM_ERRORS.invalidMessage);
    }
  }

  private handleSync(data: Uint8Array): void {
    const valid = data.length === 36 && data[0] === 0x07 && data[1] === 0x07 && data[2] === 0x12 && data[3] === 0x20 && data.subarray(4).every((byte) => byte === 0x55);
    if (!valid) {
      this.fail(0x08, ROM_ERRORS.invalidMessage);
      return;
    }
    for (let index = 0; index < 8; index += 1) {
      this.ok(0x08, 0x20120707);
    }
  }

  private readRegister(address: number): number {
    if (address === 0x40001000) {
      return this.options.chipMagic ?? ESP32_CHIP_MAGIC;
    }
    if (address >= EFUSE_BASE && address < EFUSE_BASE + 4 * 64 && (address - EFUSE_BASE) % 4 === 0) {
      return this.efuses.get((address - EFUSE_BASE) / 4) ?? 0;
    }
    if (address === APB_CTL_DATE) {
      return 0x80000000;
    }
    if (address === UART_CLKDIV_REG) {
      return 347;
    }
    return this.registers.get(address) ?? 0;
  }

  private handleWriteRegister(data: Uint8Array): void {
    if (data.length !== 16 && data.length !== 32) {
      this.fail(0x09, ROM_ERRORS.invalidMessage);
      return;
    }
    const address = u32(data, 0);
    const value = u32(data, 4);
    const mask = u32(data, 8);
    const previous = this.registers.get(address) ?? 0;
    const next = ((previous & ~mask) | (value & mask)) >>> 0;
    this.registers.set(address, next);
    if (address === SPI_REG_BASE && (next & SPI_CMD_USR) !== 0) {
      // SPI 사용자 명령 실행: USR2의 아래 8비트가 플래시 명령
      const command = (this.registers.get(SPI_REG_BASE + 0x24) ?? 0) & 0xff;
      this.registers.set(SPI_REG_BASE + 0x80, command === 0x9f ? (this.options.flashId ?? DEFAULT_FLASH_ID) & 0xffffff : 0);
      this.registers.set(SPI_REG_BASE, next & ~SPI_CMD_USR);
    }
    this.ok(0x09);
  }

  private eraseRange(offset: number, size: number): boolean {
    if (offset + size > this.flash.length) {
      return false;
    }
    this.flash.fill(0xff, offset, offset + size);
    this.erased.push({ offset, size });
    return true;
  }

  private handleFlashBegin(data: Uint8Array): void {
    // ESP32 ROM: 16바이트(S2 이후 ROM만 다섯째 값 — esptool.py SUPPORTS_ENCRYPTED_FLASH)
    if (data.length !== 16) {
      this.fail(0x02, ROM_ERRORS.invalidMessage);
      return;
    }
    const eraseSize = u32(data, 0);
    const blocks = u32(data, 4);
    const blockSize = u32(data, 8);
    const offset = u32(data, 12);
    if (blockSize !== ROM_BLOCK_SIZE || !this.eraseRange(offset, eraseSize)) {
      this.fail(0x02, ROM_ERRORS.failedToAct);
      return;
    }
    this.session = null;
    this.rawSession = { offset, size: eraseSize, blocks, blockSize, nextSeq: 0 };
    this.ok(0x02, 0, Math.round(((this.options.eraseMsPerMb ?? 0) * eraseSize) / (1024 * 1024)));
  }

  private handleFlashData(data: Uint8Array, checksum: number): void {
    const session = this.rawSession;
    if (!session || data.length < 16) {
      this.fail(0x03, ROM_ERRORS.invalidMessage);
      return;
    }
    const length = u32(data, 0);
    const seq = u32(data, 4);
    const block = data.subarray(16);
    if (length !== block.length || length !== session.blockSize || seq !== session.nextSeq || seq >= session.blocks) {
      this.fail(0x03, ROM_ERRORS.invalidMessage);
      return;
    }
    let expected = 0xef;
    for (const byte of block) {
      expected ^= byte;
    }
    if (expected !== checksum) {
      this.fail(0x03, ROM_ERRORS.invalidCrc);
      return;
    }
    const at = session.offset + seq * session.blockSize;
    if (at + block.length > this.flash.length) {
      this.fail(0x03, ROM_ERRORS.flashWrite);
      return;
    }
    this.flash.set(block, at);
    session.nextSeq += 1;
    this.ok(0x03, 0, this.options.writeMsPerBlock ?? 0);
  }

  private handleDeflateBegin(data: Uint8Array): void {
    if (data.length !== 16) {
      this.fail(0x10, ROM_ERRORS.invalidMessage);
      return;
    }
    const writeSize = u32(data, 0);
    const blocks = u32(data, 4);
    const blockSize = u32(data, 8);
    const offset = u32(data, 12);
    if (blockSize !== ROM_BLOCK_SIZE || writeSize % blockSize !== 0 || !this.eraseRange(offset, writeSize)) {
      this.fail(0x10, ROM_ERRORS.failedToAct);
      return;
    }
    const inflate = new Inflate();
    const session: DeflateSession = { offset, writeSize, blocks, blockSize, inflate, nextSeq: 0, written: 0 };
    inflate.onData = (chunk: Uint8Array) => {
      const at = session.offset + session.written;
      this.flash.set(chunk.subarray(0, Math.max(0, Math.min(chunk.length, this.flash.length - at))), at);
      const corrupt = this.options.corruptAddress;
      if (typeof corrupt === 'number' && corrupt >= at && corrupt < at + chunk.length) {
        this.flash[corrupt] = this.flash[corrupt]! ^ 0xff;
      }
      session.written += chunk.length;
    };
    this.session = session;
    this.ok(0x10, 0, Math.round(((this.options.eraseMsPerMb ?? 0) * writeSize) / (1024 * 1024)));
  }

  private handleDeflateData(data: Uint8Array, checksum: number): void {
    const session = this.session;
    if (!session || data.length < 16) {
      this.fail(0x11, ROM_ERRORS.invalidMessage);
      return;
    }
    const length = u32(data, 0);
    const seq = u32(data, 4);
    const block = data.subarray(16);
    if (length !== block.length || length > session.blockSize || seq !== session.nextSeq || seq >= session.blocks) {
      this.fail(0x11, ROM_ERRORS.invalidMessage);
      return;
    }
    let expected = 0xef;
    for (const byte of block) {
      expected ^= byte;
    }
    if (expected !== checksum) {
      this.fail(0x11, ROM_ERRORS.invalidCrc);
      return;
    }
    if (this.options.hangAtBlock === seq) {
      return;
    }
    session.inflate.push(block, false);
    if (session.inflate.err) {
      this.fail(0x11, ROM_ERRORS.deflate);
      return;
    }
    if (session.written > session.writeSize) {
      this.fail(0x11, ROM_ERRORS.flashWrite);
      return;
    }
    session.nextSeq += 1;
    this.ok(0x11, 0, this.options.writeMsPerBlock ?? 0);
  }

  private handleMd5(data: Uint8Array): void {
    if (data.length !== 16) {
      this.fail(0x13, ROM_ERRORS.invalidMessage);
      return;
    }
    const offset = u32(data, 0);
    const size = u32(data, 4);
    if (offset + size > this.flash.length) {
      this.fail(0x13, ROM_ERRORS.flashRead);
      return;
    }
    const hex = this.md5(offset, size);
    const body = new Uint8Array(36);
    for (let index = 0; index < 32; index += 1) {
      body[index] = hex.charCodeAt(index);
    }
    this.respond(0x13, 0, body);
  }
}
