/**
 * ESP32 ROM 부트로더와 직접 주고받는 명령 — 플래셔 스텁 없이 굽기(PLAN PD-38, P3-09).
 *
 * esptool-js 0.6.1의 ESPLoader는 스텁을 올린 뒤를 기준으로 짜여 있어, 스텁 없이(ROM만으로) 굽는 흐름에서 모자라거나 다른 곳을
 * esptool.py v4.8.1의 --no-stub 흐름(esptool/__init__.py main(), cmds.py write_flash, loader.py — 2026-09-18 원문 확인)에 맞춰 여기서 채운다.
 *
 * | 할 일 | esptool.py(--no-stub, ESP32) | esptool-js 0.6.1 그대로 쓰면 | 여기서 |
 * |---|---|---|---|
 * | 플래시 핀 연결 SPI_ATTACH(0x0d) | 인자 4바이트 + ROM용 4바이트(is_legacy 0, 0, 0, 0) = 8바이트, 값은 eFuse의 SPI 패드 설정 | flashSpiAttach()가 4바이트만 보냄 | romSpiAttach: 8바이트 |
 * | 플래시 크기 알리기 SPI_SET_PARAMS(0x0b) | flash_set_parameters(크기): id 0·크기·64KB·4KB·256·0xFFFF | 함수 없음 | romSetFlashParameters |
 * | 전체 지우기 ERASE_FLASH(0xd0) | 스텁 전용(@stub_function_only) — ROM은 못 함 | writeFlash({eraseAll})가 스텁일 때만 지움 | romEraseRegion: FLASH_BEGIN(0x02)의 "지울 크기"로 지움(아래) |
 * | 쓰기 블록 크기 | ROM 0x400(ESPLoader.FLASH_WRITE_SIZE), 스텁 0x4000 | 로더가 늘 0x4000 | 굽기 전에 loader.FLASH_WRITE_SIZE = 0x400 |
 * | 쓴 내용 대조 SPI_FLASH_MD5(0x13) | ROM은 32글자 16진수 ASCII(문서 Serial Protocol) | writeFlash의 calculateMD5Hash가 ROM 응답을 한 번 더 16진수로 바꿔 늘 틀림 | romFlashMd5: ASCII로 읽음 |
 * | 끝난 뒤 | ROM에는 FLASH_END를 보내지 않고 RTS로 하드 리셋 | after('hard_reset')가 RTS를 켜지 않고 끄기만 함 | 플래셔가 RTS를 켰다 끔 |
 *
 * 전체 지우기(선택)는 ROM이 FLASH_BEGIN을 받으면 "지울 크기"만큼 먼저 지우는 규약(문서 Serial Protocol FLASH_BEGIN "size to erase",
 * esptool.py flash_begin 주석 "ROM performs the erase up front")을 쓴다: 위치 0부터 플래시 전체 크기를 지울 크기로 보내고 데이터는 보내지 않는다.
 * esptool.py에는 이 방법이 없어 실물 ESP32에서 확인해야 한다(부록 B-2 요청 — 확인 필요).
 * FLASH_BEGIN의 다섯 번째 값(암호화 쓰기)은 ESP32-S2 이후 ROM만 받으므로(esptool.py SUPPORTS_ENCRYPTED_FLASH) ESP32에는 16바이트만 보낸다.
 */
import type { ESPLoader } from 'esptool-js';

export const ROM_BAUD_RATE = 115200;
export const ESP_FLASH_BEGIN = 0x02;
export const ESP_READ_REG = 0x0a;
export const ESP_SPI_SET_PARAMS = 0x0b;
export const ESP_SPI_ATTACH = 0x0d;
export const ESP_SPI_FLASH_MD5 = 0x13;
/** ROM 부트로더의 쓰기 블록 크기(esptool.py ESPLoader.FLASH_WRITE_SIZE) */
export const ROM_FLASH_WRITE_SIZE = 0x400;
export const CHIP_DETECT_MAGIC_REG_ADDR = 0x40001000;
/** ESP32 eFuse(esptool.py targets/esp32.py): EFUSE_BLK0_RDATA3·RDATA5 */
export const ESP32_EFUSE_BLK0_RDATA3 = 0x3ff5a000 + 0x00c;
export const ESP32_EFUSE_BLK0_RDATA5 = 0x3ff5a000 + 0x014;
/** 크기에 비례하는 시간 제한(esptool과 같은 값) */
export const DEFAULT_TIMEOUT_MS = 3000;
export const ERASE_REGION_TIMEOUT_PER_MB_MS = 30_000;
export const MD5_TIMEOUT_PER_MB_MS = 8_000;

/** RDID 셋째 바이트(용량 코드) → 크기(esptool DETECTED_FLASH_SIZES와 같은 표) */
export const DETECTED_FLASH_SIZES: Readonly<Record<number, string>> = Object.freeze({
  0x12: '256KB',
  0x13: '512KB',
  0x14: '1MB',
  0x15: '2MB',
  0x16: '4MB',
  0x17: '8MB',
  0x18: '16MB',
  0x19: '32MB',
  0x1a: '64MB',
  0x1b: '128MB',
  0x1c: '256MB',
  0x20: '64MB',
  0x21: '128MB',
  0x22: '256MB',
  0x32: '256KB',
  0x33: '512KB',
  0x34: '1MB',
  0x35: '2MB',
  0x36: '4MB',
  0x37: '8MB',
  0x38: '16MB',
  0x39: '32MB',
  0x3a: '64MB',
});

/** esptool-js ESPLoader에서 이 파일이 쓰는 부분 */
export type RomLoader = Pick<ESPLoader, 'checkCommand' | 'readReg'>;

/** 32비트 little endian 값들을 이어 붙인다 */
export function packU32(...values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value >>> 0, true));
  return bytes;
}

/** 크기에 비례하는 시간 제한(최소 3초) */
export function timeoutPerMb(msPerMb: number, sizeBytes: number): number {
  return Math.max(DEFAULT_TIMEOUT_MS, Math.round((msPerMb * sizeBytes) / 1_000_000));
}

/** RDID 값 → 플래시 크기. 모르는 값(0xFFFFFF·0 포함)이면 null */
export function flashSizeFromId(flashId: number): { readonly label: string; readonly bytes: number } | null {
  if (flashId === 0xffffff || flashId === 0) {
    return null;
  }
  const label = DETECTED_FLASH_SIZES[(flashId >> 16) & 0xff];
  if (!label) {
    return null;
  }
  const amount = Number.parseInt(label, 10);
  return { label, bytes: label.endsWith('MB') ? amount * 1024 * 1024 : amount * 1024 };
}

/** eFuse에 적힌 SPI 플래시 패드 설정 → SPI_ATTACH 값(패드가 모두 0이면 0 = 기본 SPI) — esptool.py get_chip_spi_pads·_define_spi_conn */
export async function readSpiAttachValue(loader: RomLoader): Promise<number> {
  const rdata5 = (await loader.readReg(ESP32_EFUSE_BLK0_RDATA5)) >>> 0;
  const rdata3 = (await loader.readReg(ESP32_EFUSE_BLK0_RDATA3)) >>> 0;
  const clk = rdata5 & 0x1f;
  const q = (rdata5 >>> 5) & 0x1f;
  const d = (rdata5 >>> 10) & 0x1f;
  const cs = (rdata5 >>> 15) & 0x1f;
  const hd = (rdata3 >>> 4) & 0x1f;
  return ((hd << 24) | (cs << 18) | (d << 12) | (q << 6) | clk) >>> 0;
}

/** SPI_ATTACH: ROM은 값 뒤에 4바이트(is_legacy 0 + 예약 0 세 개)를 더 받는다 */
export async function romSpiAttach(loader: RomLoader, value: number): Promise<void> {
  const payload = new Uint8Array(8);
  payload.set(packU32(value), 0);
  await loader.checkCommand('configure SPI flash pins', ESP_SPI_ATTACH, payload);
}

/** SPI_SET_PARAMS: ROM의 플래시 정보(크기)를 알린다 */
export async function romSetFlashParameters(loader: RomLoader, sizeBytes: number): Promise<void> {
  await loader.checkCommand('set SPI params', ESP_SPI_SET_PARAMS, packU32(0, sizeBytes, 64 * 1024, 4 * 1024, 256, 0xffff));
}

/** FLASH_BEGIN으로 [offset, offset + size) 영역을 지운다(데이터는 보내지 않는다). size는 섹터(4KB) 배수로 올린다 */
export async function romEraseRegion(loader: RomLoader & { FLASH_WRITE_SIZE: number }, offset: number, size: number): Promise<number> {
  const eraseSize = Math.ceil(size / 0x1000) * 0x1000;
  const blockSize = loader.FLASH_WRITE_SIZE;
  const blocks = Math.ceil(eraseSize / blockSize);
  await loader.checkCommand(
    'erase flash region',
    ESP_FLASH_BEGIN,
    packU32(eraseSize, blocks, blockSize, offset),
    0,
    0,
    timeoutPerMb(ERASE_REGION_TIMEOUT_PER_MB_MS, eraseSize),
  );
  return eraseSize;
}

/** SPI_FLASH_MD5: ROM이 계산한 플래시 영역의 MD5(소문자 16진수 32글자) */
export async function romFlashMd5(loader: RomLoader, offset: number, size: number): Promise<string> {
  const response = await loader.checkCommand(
    'calculate md5sum',
    ESP_SPI_FLASH_MD5,
    packU32(offset, size, 0, 0),
    0,
    32,
    timeoutPerMb(MD5_TIMEOUT_PER_MB_MS, size),
  );
  if (!(response instanceof Uint8Array) || response.length < 32) {
    throw new Error('MD5Sum command returned unexpected result');
  }
  let text = '';
  for (const byte of response.subarray(0, 32)) {
    text += String.fromCharCode(byte);
  }
  if (!/^[0-9a-f]{32}$/iu.test(text)) {
    throw new Error(`MD5Sum command returned unexpected result: ${JSON.stringify(text)}`);
  }
  return text.toLowerCase();
}
