// 펌웨어 굽기 순서(src/lab/firmware/flasher.ts)를 모의 시리얼 + 모의 ESP32 ROM 부트로더(src/lab/firmware/mock/esp32-rom.ts)로 끝까지 돌린다.
// esptool-js 0.6.1을 그대로 쓰고(스텁 없이 — PD-38), 흉내는 esptool.py --no-stub과 다른 길이·블록 크기를 오류로 대답한다.
// 흉내에서 된 것은 실물의 증거가 아니다(부록 B-2 — 운영자 할 일 2번).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { explainFlashError, FlashError } from '../../../src/lab/firmware/errors.ts';
import { FirmwareFlasher, findMicroPythonBanner, looksLikeBootLoop } from '../../../src/lab/firmware/flasher.ts';
import { md5Hex } from '../../../src/lab/firmware/md5.ts';
import { Esp32RomEmulator, type Esp32RomOptions } from '../../../src/lab/firmware/mock/esp32-rom.ts';
import { MicroPythonDevice, MockSerialPort, type MicroPythonDeviceOptions } from '../../../src/lab/serial/mock/index.ts';
import { syntheticImage } from './helpers/synthetic-image.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const STAGED_FIRMWARE = path.join(ROOT, '.cache', 'firmware-staging', 'ESP32_GENERIC-20260824-v1.29.0.bin');

const flashers: FirmwareFlasher[] = [];
const ports: MockSerialPort[] = [];

afterEach(async () => {
  for (const flasher of flashers.splice(0)) {
    await flasher.close();
  }
  for (const port of ports.splice(0)) {
    port.unplug();
  }
});

/** 모의 포트를 Web Serial SerialPort 자리에(모양은 같고 this 타입 표기만 달라 타입 검사를 위해 바꾼다) */
function asSerialPort(port: MockSerialPort): SerialPort {
  return port as unknown as SerialPort;
}

async function setup(
  romOptions: Esp32RomOptions = {},
  deviceOptions: MicroPythonDeviceOptions = {},
  flasherOptions: { baudRate?: number; connectAttempts?: number } = {},
): Promise<{ rom: Esp32RomEmulator; device: MicroPythonDevice; port: MockSerialPort; flasher: FirmwareFlasher; log: string[] }> {
  const rom = new Esp32RomEmulator(romOptions);
  const device = new MicroPythonDevice({ ...deviceOptions, onBootloader: rom.handler });
  const port = new MockSerialPort({ device });
  ports.push(port);
  const log: string[] = [];
  const flasher = await FirmwareFlasher.create({ port: asSerialPort(port), log: (line) => log.push(line), ...flasherOptions });
  flashers.push(flasher);
  return { rom, device, port, flasher, log };
}

describe('모의 ROM 부트로더로 굽기', () => {
  it('굽기 모드로 리셋해 ESP32 칩과 4MB 플래시를 알아내고, esptool.py --no-stub과 같은 모양으로 준비한다', async () => {
    const { rom, device, flasher } = await setup();
    const chip = await flasher.connect();
    expect(device.mode).toBe('bootloader');
    expect(chip.chipName).toBe('ESP32');
    expect(chip.description).toBe('ESP32-D0WD-V3 (revision 3)');
    expect(chip.features).toEqual(expect.arrayContaining(['Wi-Fi', 'BT', 'Dual Core', '240MHz']));
    expect(chip.flashSizeLabel).toBe('4MB');
    expect(chip.flashSizeBytes).toBe(4 * 1024 * 1024);
    expect(chip.usbVendorId).toBe(0x1a86);
    expect(rom.spiAttach).toEqual({ length: 8, value: 0 });
    expect(rom.flashParameterSize).toBe(4 * 1024 * 1024);
    expect(flasher.connectAttempts.at(-1)).toBe('success');
  }, 30_000);

  it('460800으로 올려 0x400 블록으로 압축해 쓰고, ROM의 MD5로 대조한 뒤 리셋해 MicroPython 시작 글을 받는다', async () => {
    const { rom, device, port, flasher } = await setup();
    const image = syntheticImage(48_000);
    await flasher.connect();
    const phases: string[] = [];
    let lastWrite = { done: 0, total: 0 };
    const result = await flasher.flash({
      image,
      offset: 0x1000,
      eraseAll: false,
      expectedVersion: '1.29.0',
      bootWaitMs: 3000,
      onPhase: (phase) => phases.push(phase),
      onProgress: (progress) => {
        if (progress.phase === 'write') {
          lastWrite = { done: progress.done, total: progress.total };
        }
      },
    });
    expect(phases).toEqual(['speed', 'write', 'verify', 'restart']);
    expect(rom.baudRate).toBe(460800);
    expect(port.openLog.map((item) => item.baudRate)).toEqual([115200, 460800, 115200]);
    expect(lastWrite.total).toBeGreaterThan(0);
    expect(lastWrite.done).toBe(lastWrite.total);
    // 플래시에 이미지가 그대로(4바이트 맞춤 — 48,000은 이미 배수)
    expect(Array.from(rom.read(0x1000, image.length))).toEqual(Array.from(image));
    expect(rom.read(0, 0x1000).every((byte) => byte === 0xff)).toBe(true);
    expect(result.md5).toBe(md5Hex(image));
    expect(result.bytesWritten).toBe(image.length);
    expect(result.baudRate).toBe(460800);
    // 스텁을 올리지 않았고(MEM_*) ROM이 못 하는 명령도 보내지 않았다
    const names = rom.commandNames();
    expect(names).not.toContain('MEM_BEGIN');
    expect(names).not.toContain('ERASE_FLASH');
    expect(names).not.toContain('FLASH_DEFL_END');
    expect(rom.protocolErrors).toBe(0);
    // 리셋 뒤 보통 부팅 → 시작 글
    expect(result.boot.version).toBe('1.29.0');
    expect(result.boot.banner).toContain('MicroPython v1.29.0 on 2026-08-24');
    expect(device.mode).toBe('friendly');
  }, 60_000);

  it('느린 속도(115200)면 속도를 바꾸지 않고 굽는다', async () => {
    const { rom, port, flasher } = await setup({}, {}, { baudRate: 115200 });
    const image = syntheticImage(9_000);
    await flasher.connect();
    const result = await flasher.flash({ image, offset: 0x1000, eraseAll: false, bootWaitMs: 2000 });
    expect(rom.count('CHANGE_BAUDRATE')).toBe(0);
    expect(port.openLog.map((item) => item.baudRate)).toEqual([115200]);
    expect(result.baudRate).toBe(115200);
    // 9,000바이트는 4의 배수라 그대로, MD5는 ROM이 계산한 값과 같다
    expect(result.md5).toBe(rom.md5(0x1000, 9_000));
  }, 60_000);

  it('4의 배수가 아닌 이미지는 0xFF로 채워 쓴다(esptool pad_to 4)', async () => {
    const { rom, flasher } = await setup({}, {}, { baudRate: 115200 });
    const image = syntheticImage(4_001);
    await flasher.connect();
    const result = await flasher.flash({ image, offset: 0x1000, eraseAll: false, bootWaitMs: 0 });
    expect(result.bytesWritten).toBe(4_004);
    expect(Array.from(rom.read(0x1000 + 4_001, 3))).toEqual([0xff, 0xff, 0xff]);
  }, 60_000);

  it('전체 지우기를 고르면 FLASH_BEGIN(16바이트)으로 위치 0부터 플래시 전체를 먼저 지운다', async () => {
    const { rom, flasher } = await setup({}, {}, { baudRate: 115200 });
    rom.flash.fill(0x42, 0x200000, 0x200100);
    await flasher.connect();
    const phases: string[] = [];
    await flasher.flash({ image: syntheticImage(4_096), offset: 0x1000, eraseAll: true, bootWaitMs: 0, onPhase: (phase) => phases.push(phase) });
    expect(phases).toEqual(['erase', 'write', 'verify', 'restart']);
    expect(rom.erased[0]).toEqual({ offset: 0, size: 4 * 1024 * 1024 });
    expect(rom.read(0x200000, 0x100).every((byte) => byte === 0xff)).toBe(true);
    expect(rom.commands.find((item) => item.name === 'FLASH_BEGIN')?.size).toBe(16);
  }, 60_000);

  it('자동 리셋 회로가 없어 굽기 모드로 못 바꾸면 "Failed to connect"이고 풀이는 BOOT 버튼 안내다', async () => {
    const { flasher } = await setup({}, { autoResetCircuit: false }, { connectAttempts: 2 });
    const error = await flasher.connect().then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Failed to connect with the device');
    expect(flasher.connectAttempts.length).toBe(2);
    // MicroPython이 돌고 있는 보드는 받은 바이트를 되울린다 → 무엇인가 받았으니 "굽기 모드가 아님"(BOOT 안내)
    expect(flasher.receivedOutput).toBe(true);
    const explained = explainFlashError(error, { stage: 'chip', attempts: flasher.connectAttempts, receivedOutput: flasher.receivedOutput });
    expect(explained.code).toBe('no-download-mode');
    expect(explained.steps.join(' ')).toContain('BOOT 버튼을 손가락으로 누른 채로');
  }, 60_000);

  it('아무 대답도 없는 포트(펌웨어도 부트로더도 대답하지 않음)는 no-response — 포트를 잘 골랐는지부터 안내', async () => {
    const port = new MockSerialPort({ device: null });
    ports.push(port);
    const flasher = await FirmwareFlasher.create({ port: asSerialPort(port), connectAttempts: 2 });
    flashers.push(flasher);
    const error = await flasher.connect().then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(flasher.receivedOutput).toBe(false);
    const explained = explainFlashError(error, { stage: 'chip', attempts: flasher.connectAttempts, receivedOutput: flasher.receivedOutput });
    expect(explained.code).toBe('no-response');
    expect(explained.steps[0]).toContain('블루투스 포트가 아닌지');
  }, 60_000);

  it('ESP32가 아닌 칩(ESP32-S3 magic)이면 굽지 않고 wrong-chip', async () => {
    const { flasher } = await setup({ chipMagic: 0x9 });
    const error = await flasher.connect().then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(FlashError);
    expect((error as FlashError).code).toBe('wrong-chip');
    expect((error as FlashError).values.chip).toBe('ESP32-S3');
  }, 30_000);

  it('보드가 쓴 내용이 파일과 다르면(MD5) verify-mismatch로 멈춘다', async () => {
    const { flasher } = await setup({ corruptAddress: 0x1000 + 1234 }, {}, { baudRate: 115200 });
    await flasher.connect();
    const error = await flasher.flash({ image: syntheticImage(8_192), offset: 0x1000, eraseAll: false, bootWaitMs: 0 }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(FlashError);
    expect((error as FlashError).code).toBe('verify-mismatch');
    expect(explainFlashError(error, { stage: 'verify' }).retry).toBe('slow');
  }, 60_000);

  it('쓰는 도중 USB 선이 빠지면 시간 제한을 기다리지 않고 device-lost로 끝난다', async () => {
    const { port, flasher } = await setup({ writeMsPerBlock: 5 }, {}, { baudRate: 115200 });
    await flasher.connect();
    let unplugged = false;
    const started = Date.now();
    const error = await flasher
      .flash({
        image: syntheticImage(60_000),
        offset: 0x1000,
        eraseAll: false,
        bootWaitMs: 0,
        onProgress: (progress) => {
          if (!unplugged && progress.phase === 'write' && progress.done > 8_000) {
            unplugged = true;
            port.unplug();
          }
        },
      })
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    expect(unplugged).toBe(true);
    expect(error).toBeInstanceOf(FlashError);
    expect((error as FlashError).code).toBe('device-lost');
    expect(flasher.deviceLost).toBe(true);
    expect(Date.now() - started).toBeLessThan(2_500);
    expect(explainFlashError(error, { stage: 'write', deviceLost: true }).title).toBe('보드와 연결이 끊겼어요');
  }, 60_000);

  it('[멈추기]는 기다리던 쓰기를 바로 aborted로 끝낸다', async () => {
    const { flasher } = await setup({ hangAtBlock: 3 }, {}, { baudRate: 115200 });
    await flasher.connect();
    const running = flasher.flash({ image: syntheticImage(30_000), offset: 0x1000, eraseAll: false, bootWaitMs: 0 });
    setTimeout(() => flasher.abort(), 400);
    const started = Date.now();
    const error = await running.then(
      () => null,
      (caught: unknown) => caught,
    );
    expect((error as FlashError).code).toBe('aborted');
    expect(Date.now() - started).toBeLessThan(2_000);
  }, 60_000);

  it('속도 바꾸기에 대답이 없으면 baud-failed(느린 속도로 다시 굽기 안내)', async () => {
    const { flasher } = await setup({ ignoreBaudChange: true });
    await flasher.connect();
    const error = await flasher.flash({ image: syntheticImage(4_096), offset: 0x1000, eraseAll: false, bootWaitMs: 0 }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect((error as FlashError).code).toBe('baud-failed');
    expect(explainFlashError(error, { stage: 'write' }).retry).toBe('slow');
  }, 60_000);

  it.runIf(fs.existsSync(STAGED_FIRMWARE))('운영자가 받은 실제 MicroPython v1.29.0 파일(1,790,544바이트)도 끝까지 쓰고 MD5가 맞는다', async () => {
    const image = new Uint8Array(fs.readFileSync(STAGED_FIRMWARE));
    const { rom, flasher } = await setup();
    await flasher.connect();
    const result = await flasher.flash({ image, offset: 0x1000, eraseAll: false, bootWaitMs: 3000 });
    expect(result.bytesWritten).toBe(1_790_544);
    expect(result.md5).toBe('9bc5ba8866e70b194d92af536c143070');
    expect(rom.md5(0x1000, image.length)).toBe(result.md5);
    // esptool-js가 pako level 9로 압축한 크기(1,172,437 — node:zlib level 9와 비교하면 거의 같다)
    expect(result.compressedBytes).toBeGreaterThan(deflateSync(image, { level: 9 }).length * 0.95);
    expect(rom.count('FLASH_DEFL_DATA')).toBe(Math.ceil(result.compressedBytes / 0x400));
  }, 180_000);
});

describe('시작 글 알아보기', () => {
  it('MicroPython 배너에서 판을 읽고, 리셋 글이 되풀이되면 부팅 반복으로 본다', () => {
    expect(findMicroPythonBanner('rst:0x1\r\nMicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32\r\nType "help()"')).toEqual({
      banner: 'MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32',
      version: '1.29.0',
    });
    expect(findMicroPythonBanner('ets Jul 29 2019')).toBeNull();
    expect(looksLikeBootLoop('rst:0x1 (POWERON_RESET)\r\nrst:0xc (SW_CPU_RESET)\r\nrst:0x10 (RTCWDT_RTC_RESET)')).toBe(true);
    expect(looksLikeBootLoop('rst:0x1 (POWERON_RESET)')).toBe(false);
  });
});
