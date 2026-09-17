/**
 * 받은 펌웨어 파일이 목록(manifest)에 적힌 그 파일인지 확인한다 — PLAN §8.3 P3-09 "파일 검증(크기·해시) 뒤 굽기".
 *
 * 순서(값싼 것부터, 하나라도 틀리면 굽지 않는다)
 * 1. 크기: 목록의 size와 바이트 수가 같은지. 학교 네트워크의 차단 안내 페이지·잘린 파일을 바로 걸러 낸다.
 * 2. ESP32 이미지 머리: 첫 바이트 0xE9(ESP_IMAGE_HEADER_MAGIC), 세그먼트 수 1~16, 칩 id 0(ESP32).
 *    esp_image_header_t(ESP-IDF components/bootloader_support/include/esp_app_format.h) 순서:
 *    magic(0) · segment_count(1) · spi_mode(2) · spi_speed:4 + spi_size:4(3) · entry_addr(4~7) · wp_pin(8) · spi_pin_drv(9~11)
 *    · chip_id(12~13, ESP32 = 0) · min_chip_rev(14) · min_chip_rev_full(15~16) · max_chip_rev_full(17~18) · reserved(19~22) · hash_appended(23).
 *    MicroPython ESP32_GENERIC v1.29.0 파일의 머리는 e9 03 02 20 … chip_id 0000 … hash_appended 01(2026-09-18 운영자 스테이징 파일로 확인).
 * 3. SHA-256: 목록의 sha256과 같은지(crypto.subtle — 보안 연결에서만 있다. Web Serial도 보안 연결에서만 되므로 굽기 화면에는 늘 있다).
 *
 * Node(단위 테스트)와 브라우저가 같은 코드로 돈다(globalThis.crypto.subtle). 검사: tests/unit/firmware/verify.test.ts
 */
import type { FirmwareInfo } from './manifest.ts';

export const ESP_IMAGE_MAGIC = 0xe9;
/** esp_chip_id_t: ESP32 = 0x0000 */
export const ESP32_IMAGE_CHIP_ID = 0x0000;
/** 이미지 머리(확장 머리 포함) 길이 */
export const ESP_IMAGE_HEADER_LENGTH = 24;

/** spi_mode 값 → 이름(esptool과 같은 순서) */
const FLASH_MODES: readonly string[] = ['QIO', 'QOUT', 'DIO', 'DOUT'];
/** ESP32 spi_size 값(머리 4번째 바이트의 윗 4비트) → 이름 */
const FLASH_SIZE_CODES: readonly string[] = ['1MB', '2MB', '4MB', '8MB', '16MB', '32MB', '64MB', '128MB'];

export interface Esp32ImageHeader {
  readonly segments: number;
  readonly flashMode: string;
  /** 머리에 적힌 플래시 크기(예: 4MB). 모르는 값이면 null */
  readonly flashSize: string | null;
  readonly chipId: number;
  readonly hashAppended: boolean;
}

export type FirmwareCheckFailure = 'size' | 'image' | 'sha256' | 'no-crypto';

export type FirmwareVerifyResult =
  | { readonly ok: true; readonly sha256: string; readonly header: Esp32ImageHeader }
  | {
      readonly ok: false;
      readonly reason: FirmwareCheckFailure;
      /** 학생·교사가 읽는 한 문장 */
      readonly message: string;
      readonly expected: string | null;
      readonly actual: string | null;
    };

interface SubtleDigest {
  digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer>;
}

/** 바이트 → 소문자 16진수 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function defaultSubtle(): SubtleDigest | null {
  const scope = globalThis as { crypto?: { subtle?: SubtleDigest } };
  return scope.crypto?.subtle ?? null;
}

/** SHA-256(소문자 16진수 64글자). Web Crypto가 없으면 null */
export async function sha256Hex(bytes: Uint8Array, subtle: SubtleDigest | null = defaultSubtle()): Promise<string | null> {
  if (!subtle) {
    return null;
  }
  // 넘긴 Uint8Array가 더 큰 ArrayBuffer의 일부일 수 있어, 그 부분만 새 버퍼로 떼어 넘긴다
  const view = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
  const digest = await subtle.digest('SHA-256', view as Uint8Array<ArrayBuffer>);
  return toHex(new Uint8Array(digest));
}

/** ESP32 이미지 머리를 읽는다. ESP32 이미지가 아니면 null */
export function readEsp32ImageHeader(bytes: Uint8Array): Esp32ImageHeader | null {
  if (bytes.length < ESP_IMAGE_HEADER_LENGTH || bytes[0] !== ESP_IMAGE_MAGIC) {
    return null;
  }
  const segments = bytes[1]!;
  if (segments < 1 || segments > 16) {
    return null;
  }
  const chipId = bytes[12]! | (bytes[13]! << 8);
  return {
    segments,
    flashMode: FLASH_MODES[bytes[2]!] ?? `알 수 없음(${bytes[2]})`,
    flashSize: FLASH_SIZE_CODES[bytes[3]! >> 4] ?? null,
    chipId,
    hashAppended: bytes[23] === 1,
  };
}

/** 받은 파일이 목록의 그 펌웨어인지 확인한다(크기 → 이미지 머리 → SHA-256) */
export async function verifyFirmwareImage(
  bytes: Uint8Array,
  info: Pick<FirmwareInfo, 'size' | 'sha256' | 'chip'>,
  subtle: SubtleDigest | null = defaultSubtle(),
): Promise<FirmwareVerifyResult> {
  if (bytes.length !== info.size) {
    return {
      ok: false,
      reason: 'size',
      message: `받은 파일의 크기(${bytes.length}바이트)가 적힌 크기(${info.size}바이트)와 달라요.`,
      expected: String(info.size),
      actual: String(bytes.length),
    };
  }
  const header = readEsp32ImageHeader(bytes);
  if (!header) {
    return {
      ok: false,
      reason: 'image',
      message: '받은 파일이 ESP32 펌웨어 모양이 아니에요(첫 바이트가 0xE9가 아니거나 머리가 망가졌어요).',
      expected: 'ESP32 이미지(0xE9)',
      actual: bytes.length > 0 ? `0x${bytes[0]!.toString(16)}` : '빈 파일',
    };
  }
  if (info.chip === 'ESP32' && header.chipId !== ESP32_IMAGE_CHIP_ID) {
    return {
      ok: false,
      reason: 'image',
      message: `받은 파일은 다른 칩(칩 번호 ${header.chipId})용 펌웨어예요. ESP32용이 아니라서 굽지 않아요.`,
      expected: `칩 번호 ${ESP32_IMAGE_CHIP_ID}`,
      actual: `칩 번호 ${header.chipId}`,
    };
  }
  const actual = await sha256Hex(bytes, subtle);
  if (actual === null) {
    return {
      ok: false,
      reason: 'no-crypto',
      message: '이 브라우저에서 파일 지문(SHA-256)을 계산할 수 없어요(보안 연결 https가 아닐 때 생겨요).',
      expected: info.sha256,
      actual: null,
    };
  }
  if (actual !== info.sha256.toLowerCase()) {
    return {
      ok: false,
      reason: 'sha256',
      message: '받은 파일의 지문(SHA-256)이 적힌 값과 달라요. 파일이 바뀌었거나 받는 동안 망가졌어요.',
      expected: info.sha256.toLowerCase(),
      actual,
    };
  }
  return { ok: true, sha256: actual, header };
}
