/**
 * 데이터 포트로 오간 바이트를 화면에 보여 줄 모양으로 모은다(P4-05 "받은 바이트를 실습실 콘솔·패널에 보이기").
 * 순수 논리라 단위 테스트가 바이트만으로 검사한다(DOM·타이머 없음).
 *
 * 왜 글자와 16진수를 함께 보여 주나
 * - 3-1-2 실습의 메시지는 글자다(`a`·`b`·`355,152`). 글자로 보이면 학생이 바로 읽는다.
 * - HW 예제(f007)와 MP3 모듈(f070~f072)은 **원시 바이트**다(0x01~0x04, `7E FF 06 …`). 글자로 바꾸면 보이지 않으므로 16진수도 함께 보인다.
 * - 속도가 서로 다르면 실물에서는 글자가 깨져 온다(PLAN §8.4 설계 메모 ④). 깨진 바이트는 글자 칸에서 U+FFFD(�)가 되고
 *   16진수 칸에는 그대로 남아, 학생이 "속도가 다르구나"를 눈으로 본다.
 *
 * 줄 나누기는 실물 UART처럼 **누적**이다(CODE_MAPPING §6.2 — 두 글자가 한꺼번에 오면 한 덩어리가 된다).
 * 아직 줄바꿈이 오지 않은 꼬리는 `partial`로 따로 보여 준다("보내는 중"이 보이게).
 */

/** 화면에 남겨 두는 최근 바이트 수(그보다 오래된 것은 버린다) */
export const BYTE_LOG_LIMIT = 4096;
/** 16진수 칸에 보일 마지막 바이트 수 */
export const HEX_TAIL_BYTES = 32;
/** 줄 목록에 남기는 줄 수 */
export const LINE_LIMIT = 12;

export interface ByteLogView {
  /** 받은 바이트 전체 수(버린 것 포함) */
  readonly total: number;
  /** 최근 바이트를 UTF-8로 읽은 글(읽을 수 없는 바이트는 �) */
  readonly text: string;
  /** 마지막 HEX_TAIL_BYTES개를 "61 62 0a"처럼 */
  readonly hex: string;
  /** 줄바꿈으로 끊은 최근 줄(끝 줄바꿈은 뗀다) */
  readonly lines: readonly string[];
  /** 아직 줄바꿈이 오지 않은 마지막 꼬리 */
  readonly partial: string;
}

const decoder = typeof TextDecoder === 'function' ? new TextDecoder('utf-8') : null;

/** 바이트를 UTF-8 글로(읽을 수 없으면 U+FFFD). TextDecoder가 없는 곳에서는 0~255 글자로 */
export function decodeUtf8(bytes: Uint8Array): string {
  if (decoder) {
    return decoder.decode(bytes);
  }
  let out = '';
  for (const byte of bytes) {
    out += String.fromCharCode(byte);
  }
  return out;
}

/** 바이트를 "7e ff 06"처럼 소문자 16진수로 */
export function toHex(bytes: Uint8Array, separator = ' '): string {
  const parts: string[] = [];
  for (const byte of bytes) {
    parts.push(byte.toString(16).padStart(2, '0'));
  }
  return parts.join(separator);
}

/** 보이지 않는 글자를 눈에 보이게(콘솔 한 줄용) — 줄바꿈 ⏎, 그 밖 제어 글자는 \x03 */
export function visibleText(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x0a) {
      out += '⏎';
    } else if (code === 0x0d) {
      out += '␍';
    } else if (code < 0x20 || code === 0x7f) {
      out += `\\x${code.toString(16).padStart(2, '0')}`;
    } else {
      out += char;
    }
  }
  return out;
}

export class ByteLog {
  #bytes: number[] = [];
  #total = 0;
  readonly #limit: number;

  constructor(limit = BYTE_LOG_LIMIT) {
    this.#limit = Math.max(16, limit);
  }

  get total(): number {
    return this.#total;
  }

  get empty(): boolean {
    return this.#bytes.length === 0;
  }

  push(bytes: Uint8Array): void {
    for (const byte of bytes) {
      this.#bytes.push(byte);
    }
    this.#total += bytes.length;
    if (this.#bytes.length > this.#limit) {
      this.#bytes = this.#bytes.slice(this.#bytes.length - this.#limit);
    }
  }

  clear(): void {
    this.#bytes = [];
    this.#total = 0;
  }

  /** 지금 보관 중인 바이트(복사본) */
  bytes(): Uint8Array {
    return Uint8Array.from(this.#bytes);
  }

  view(): ByteLogView {
    const bytes = this.bytes();
    const text = decodeUtf8(bytes);
    const tail = bytes.subarray(Math.max(0, bytes.length - HEX_TAIL_BYTES));
    // 실물처럼 \r\n·\r·\n을 모두 줄 끝으로 본다(보드는 \r\n, PC 코드는 \n을 쓴다)
    const parts = text.replace(/\r\n?/gu, '\n').split('\n');
    const partial = parts.pop() ?? '';
    return Object.freeze({
      total: this.#total,
      text,
      hex: toHex(tail),
      lines: Object.freeze(parts.slice(-LINE_LIMIT)),
      partial,
    });
  }
}
