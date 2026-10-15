// WebP 머리 읽기(src/components/parts/webp-info.ts) — 크기와 조각 이름.
import { describe, expect, it } from 'vitest';
import { WEBP_METADATA_CHUNKS, readWebpInfo } from '../../../src/components/parts/webp-info.ts';

/** RIFF/WEBP 파일 바이트를 조각 목록으로 만든다(조각 내용은 호출한 쪽이 정한다). */
function riff(chunks: readonly { name: string; body: number[] }[]): Uint8Array {
  const parts: number[] = [];
  for (const chunk of chunks) {
    parts.push(...[...chunk.name].map((char) => char.charCodeAt(0)));
    const size = chunk.body.length;
    parts.push(size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >> 24) & 0xff, ...chunk.body);
    if (size % 2 === 1) parts.push(0);
  }
  const total = 4 + parts.length;
  return new Uint8Array([
    ...[...'RIFF'].map((char) => char.charCodeAt(0)),
    total & 0xff,
    (total >> 8) & 0xff,
    (total >> 16) & 0xff,
    (total >> 24) & 0xff,
    ...[...'WEBP'].map((char) => char.charCodeAt(0)),
    ...parts,
  ]);
}

const u24 = (value: number): number[] => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];

/** 크기 640×480 손실(VP8) 그림 조각: 프레임 태그 3바이트 + 시작 부호 + 가로·세로 */
const vp8 = (width: number, height: number): { name: string; body: number[] } => ({
  name: 'VP8 ',
  body: [0x10, 0x00, 0x00, 0x9d, 0x01, 0x2a, width & 0xff, (width >> 8) & 0x3f, height & 0xff, (height >> 8) & 0x3f, 0, 0],
});

describe('readWebpInfo', () => {
  it('손실(VP8) 파일의 크기와 조각 이름을 읽는다', () => {
    const info = readWebpInfo(riff([vp8(640, 480)]));
    expect(info).toEqual({ width: 640, height: 480, chunks: ['VP8 '] });
  });

  it('투명도가 있는 파일(VP8X + ALPH + VP8)은 캔버스 크기를 읽는다', () => {
    const vp8x = { name: 'VP8X', body: [0x10, 0, 0, 0, ...u24(412 - 1), ...u24(606 - 1)] };
    const info = readWebpInfo(riff([vp8x, { name: 'ALPH', body: [0, 1, 2, 3] }, vp8(412, 606)]));
    expect(info).toEqual({ width: 412, height: 606, chunks: ['VP8X', 'ALPH', 'VP8 '] });
  });

  it('EXIF·XMP·ICCP 조각이 있으면 chunks에 그대로 나온다(메타데이터 검사가 이 목록을 본다)', () => {
    const vp8x = { name: 'VP8X', body: [0x2c, 0, 0, 0, ...u24(99), ...u24(99)] };
    const info = readWebpInfo(riff([vp8x, { name: 'ICCP', body: [1, 2, 3] }, vp8(100, 100), { name: 'EXIF', body: [1, 2] }, { name: 'XMP ', body: [9] }]));
    expect(info?.chunks).toEqual(['VP8X', 'ICCP', 'VP8 ', 'EXIF', 'XMP ']);
    expect(info?.chunks.filter((name) => WEBP_METADATA_CHUNKS.includes(name))).toEqual(['ICCP', 'EXIF', 'XMP ']);
  });

  it('WebP가 아니거나 조각이 끊긴 파일은 null이다', () => {
    expect(readWebpInfo(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(readWebpInfo(new Uint8Array(40))).toBeNull();
    const whole = riff([vp8(10, 10)]);
    expect(readWebpInfo(whole.subarray(0, whole.length - 4))).toBeNull();
  });
});
