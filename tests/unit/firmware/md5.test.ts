// MD5(src/lab/firmware/md5.ts) — ROM 부트로더의 SPI_FLASH_MD5와 대조할 값이 맞는지 본다.
import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { md5Bytes, md5Hex } from '../../../src/lab/firmware/md5.ts';

const encode = (text: string) => new TextEncoder().encode(text);

describe('md5', () => {
  it('RFC 1321 부록 A.5의 시험 값 7개와 같다', () => {
    const suite: [string, string][] = [
      ['', 'd41d8cd98f00b204e9800998ecf8427e'],
      ['a', '0cc175b9c0f1b6a831c399e269772661'],
      ['abc', '900150983cd24fb0d6963f7d28e17f72'],
      ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
      ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
      ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
      ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a'],
    ];
    for (const [input, expected] of suite) {
      expect(md5Hex(encode(input))).toBe(expected);
    }
  });

  it('덧붙이기 경계(55·56·63·64·65바이트)와 무작위 길이에서 Node crypto와 같다', () => {
    const lengths = [55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 1000, 4096, 65_537];
    for (let index = 0; index < 60; index += 1) {
      lengths.push(Math.floor(Math.random() * 5000));
    }
    for (const length of lengths) {
      const bytes = randomBytes(length);
      expect(md5Hex(new Uint8Array(bytes)), `길이 ${length}`).toBe(createHash('md5').update(bytes).digest('hex'));
    }
  });

  it('더 큰 버퍼의 일부(subarray)도 그 부분만 계산하고, 16바이트 값을 돌려준다', () => {
    const whole = new Uint8Array(randomBytes(300));
    const part = whole.subarray(17, 211);
    expect(md5Hex(part)).toBe(createHash('md5').update(part).digest('hex'));
    expect(md5Bytes(part)).toHaveLength(16);
  });

  it('1.7MB(펌웨어 크기)도 빠르게 계산한다', () => {
    const bytes = new Uint8Array(randomBytes(1_790_544));
    const started = performance.now();
    expect(md5Hex(bytes)).toBe(createHash('md5').update(bytes).digest('hex'));
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});
