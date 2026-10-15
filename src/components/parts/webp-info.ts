/**
 * WebP 파일 머리 읽기 — 부품 사진의 크기와 들어 있는 조각(chunk) 이름을 본다(판 1.4.0, DECISIONS C136). 순수 함수라 브라우저 번들에 들어가도 해가 없지만
 * 쓰는 곳은 빌드 전용 parts-data.ts와 tests/unit/parts/뿐이다.
 *
 * WebP는 RIFF 상자다: 'RIFF' 크기 'WEBP' 다음에 조각이 이어진다(조각 = 이름 4글자 + 크기 4바이트(작은 끝) + 내용, 홀수 크기는 한 바이트 덧붙임).
 * 그림 조각은 'VP8 '(손실)·'VP8L'(무손실)·'VP8X'(확장 머리)·'ALPH'(투명도)이고, 사진 속 개인 정보가 실릴 수 있는 곳은
 * 'EXIF'(촬영 기록)·'XMP '(편집 기록)·'ICCP'(색 프로필)이다. 사이트에 싣는 부품 사진은 이 세 조각이 없어야 한다(저장소 검사 inspectImageMetadata도 막는다).
 */

export interface WebpInfo {
  readonly width: number;
  readonly height: number;
  /** 파일에 든 조각 이름 차례(예: ['VP8X', 'ALPH', 'VP8 ']) */
  readonly chunks: readonly string[];
}

const ascii = (bytes: Uint8Array, offset: number, length: number): string => String.fromCharCode(...bytes.subarray(offset, offset + length));
const u16le = (bytes: Uint8Array, offset: number): number => (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
const u24le = (bytes: Uint8Array, offset: number): number => u16le(bytes, offset) | ((bytes[offset + 2] ?? 0) << 16);
const u32le = (bytes: Uint8Array, offset: number): number => u24le(bytes, offset) + (bytes[offset + 3] ?? 0) * 0x1000000;

/** WebP 바이트에서 크기와 조각 이름을 읽는다. WebP가 아니거나 조각이 끊겼으면 null. */
export function readWebpInfo(bytes: Uint8Array): WebpInfo | null {
  if (bytes.length < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    return null;
  }
  const chunks: string[] = [];
  let width = 0;
  let height = 0;
  let position = 12;
  while (position + 8 <= bytes.length) {
    const name = ascii(bytes, position, 4);
    const size = u32le(bytes, position + 4);
    const body = position + 8;
    if (body + size > bytes.length) {
      return null; // 조각이 끊긴 파일
    }
    chunks.push(name);
    if (name === 'VP8X') {
      // 캔버스 가로-1(24비트), 세로-1(24비트)
      width = 1 + u24le(bytes, body + 4);
      height = 1 + u24le(bytes, body + 7);
    } else if (name === 'VP8 ' && width === 0) {
      // 프레임 머리: 3바이트 태그 + 시작 부호 9D 01 2A + 가로·세로(14비트 + 확대 2비트)
      if (bytes[body + 3] !== 0x9d || bytes[body + 4] !== 0x01 || bytes[body + 5] !== 0x2a) {
        return null;
      }
      width = u16le(bytes, body + 6) & 0x3fff;
      height = u16le(bytes, body + 8) & 0x3fff;
    } else if (name === 'VP8L' && width === 0) {
      // 서명 0x2F + (가로-1) 14비트 + (세로-1) 14비트
      if (bytes[body] !== 0x2f) {
        return null;
      }
      const b0 = bytes[body + 1] ?? 0;
      const b1 = bytes[body + 2] ?? 0;
      const b2 = bytes[body + 3] ?? 0;
      const b3 = bytes[body + 4] ?? 0;
      width = 1 + (((b1 & 0x3f) << 8) | b0);
      height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    }
    position = body + size + (size & 1);
  }
  if (position !== bytes.length || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height, chunks };
}

/** 개인 정보가 실릴 수 있는 조각(촬영 기록·편집 기록·색 프로필) */
export const WEBP_METADATA_CHUNKS: readonly string[] = ['EXIF', 'XMP ', 'ICCP'];
