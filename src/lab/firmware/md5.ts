/**
 * MD5(RFC 1321) — 펌웨어를 보드에 쓴 뒤 "보드에 들어간 내용이 파일과 같은지" 대조하는 데만 쓴다(PLAN §8.3 P3-09).
 *
 * 왜 직접 만들었나
 * - ESP32 ROM 부트로더의 SPI_FLASH_MD5(0x13) 명령은 플래시 영역의 MD5를 32글자 16진수(ASCII)로 돌려준다
 *   (esptool 문서 "Serial Protocol" — ROM은 32 hex ASCII, 스텁은 16바이트. 2026-09-18 확인). 비교하려면 브라우저에서도 MD5가 필요하다.
 * - 브라우저의 Web Crypto(crypto.subtle.digest)는 MD5를 주지 않는다(SHA-1·SHA-256·SHA-384·SHA-512만).
 * - 새 npm 패키지를 들이지 않으려고 RFC 1321의 계산을 그대로 옮겼다(사이트 자체 코드, MIT).
 *
 * 보안용이 아니다: MD5는 일부러 만든 충돌을 막지 못한다. 파일이 바뀌지 않았는지는 SHA-256(verify.ts)으로 먼저 확인하고,
 * MD5는 "USB로 보내는 동안 깨지지 않았는지"를 ROM과 같은 방법으로 대조하는 데만 쓴다.
 * 검사: tests/unit/firmware/md5.test.ts(RFC 1321 부록 A.5의 시험 값 7개 + Node crypto와 무작위 대조).
 */

/** 라운드마다 왼쪽으로 돌리는 칸 수(RFC 1321 3.4) */
const SHIFTS: readonly number[] = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

/** T[i] = floor(|sin(i + 1)| × 2^32)(RFC 1321 3.4, 32비트 부호 있는 정수로 보관) */
const TABLE: Int32Array = (() => {
  const table = new Int32Array(64);
  for (let index = 0; index < 64; index += 1) {
    table[index] = Math.floor(Math.abs(Math.sin(index + 1)) * 4294967296) | 0;
  }
  return table;
})();

interface Md5State {
  a: number;
  b: number;
  c: number;
  d: number;
}

function processBlock(state: Md5State, bytes: Uint8Array, offset: number, words: Int32Array): void {
  for (let index = 0; index < 16; index += 1) {
    const at = offset + index * 4;
    words[index] = bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24);
  }
  let a = state.a;
  let b = state.b;
  let c = state.c;
  let d = state.d;
  for (let round = 0; round < 64; round += 1) {
    let f: number;
    let g: number;
    if (round < 16) {
      f = (b & c) | (~b & d);
      g = round;
    } else if (round < 32) {
      f = (d & b) | (~d & c);
      g = (5 * round + 1) % 16;
    } else if (round < 48) {
      f = b ^ c ^ d;
      g = (3 * round + 5) % 16;
    } else {
      f = c ^ (b | ~d);
      g = (7 * round) % 16;
    }
    const next = d;
    d = c;
    c = b;
    const sum = (a + f + TABLE[round]! + words[g]!) | 0;
    const shift = SHIFTS[round]!;
    b = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
    a = next;
  }
  state.a = (state.a + a) | 0;
  state.b = (state.b + b) | 0;
  state.c = (state.c + c) | 0;
  state.d = (state.d + d) | 0;
}

/** MD5 값 16바이트 */
export function md5Bytes(data: Uint8Array): Uint8Array {
  const state: Md5State = { a: 0x67452301, b: 0xefcdab89 | 0, c: 0x98badcfe | 0, d: 0x10325476 };
  const words = new Int32Array(16);
  const fullBlocks = Math.floor(data.length / 64);
  for (let block = 0; block < fullBlocks; block += 1) {
    processBlock(state, data, block * 64, words);
  }
  // 남은 바이트 + 0x80 + 0 채우기 + 길이(비트, 64비트 little endian)
  const rest = data.length - fullBlocks * 64;
  const tail = new Uint8Array(rest < 56 ? 64 : 128);
  tail.set(data.subarray(fullBlocks * 64));
  tail[rest] = 0x80;
  const bits = data.length * 8;
  const low = bits % 4294967296;
  const high = Math.floor(bits / 4294967296);
  const end = tail.length;
  for (let index = 0; index < 4; index += 1) {
    tail[end - 8 + index] = (low >>> (8 * index)) & 0xff;
    tail[end - 4 + index] = (high >>> (8 * index)) & 0xff;
  }
  processBlock(state, tail, 0, words);
  if (tail.length === 128) {
    processBlock(state, tail, 64, words);
  }
  const digest = new Uint8Array(16);
  [state.a, state.b, state.c, state.d].forEach((word, index) => {
    for (let byte = 0; byte < 4; byte += 1) {
      digest[index * 4 + byte] = (word >>> (8 * byte)) & 0xff;
    }
  });
  return digest;
}

/** MD5 값을 소문자 16진수 32글자로 */
export function md5Hex(data: Uint8Array): string {
  return Array.from(md5Bytes(data), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
