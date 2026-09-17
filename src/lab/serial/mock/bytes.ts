/**
 * 모의 시리얼 도구의 바이트 도우미(병렬 제작 준비 2026-09-17 — src/lab/serial/mock/README 대신 src/lab/README.md 8절).
 * 실제 사이트 코드가 아니라 테스트 도구다(배포 번들에 들어가지 않는다 — 사이트 페이지가 import하지 않음).
 */

/** MicroPython REPL 제어 글자(docs/reference/repl.rst — v1.29.0) */
export const CTRL_A = 0x01; // raw REPL 들어가기
export const CTRL_B = 0x02; // 보통 REPL로 나가기(배너)
export const CTRL_C = 0x03; // 실행 중인 코드 멈추기(KeyboardInterrupt)·입력 줄 지우기
export const CTRL_D = 0x04; // 보통 REPL: 소프트 리셋 / raw REPL: 보낸 코드 실행(빈 줄이면 소프트 리셋)
export const CTRL_E = 0x05; // 붙여넣기 모드(보통 REPL) / raw-paste 요청의 첫 글자(raw REPL, "\x05A\x01")

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 글자(UTF-8)·바이트 묶음·숫자 목록을 Uint8Array로(복사본) */
export function toBytes(data: string | Uint8Array | ArrayBuffer | ArrayBufferView | readonly number[]): Uint8Array {
  if (typeof data === 'string') {
    return encoder.encode(data);
  }
  if (data instanceof Uint8Array) {
    return new Uint8Array(data);
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data.slice(0));
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  }
  return Uint8Array.from(data);
}

/** 바이트 → UTF-8 글자(잘린 글자는 대체 문자) */
export function utf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

/** 바이트 → 한 글자씩 코드 0~255(제어 글자까지 그대로 보이게 — 기록·비교용) */
export function latin1(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return text;
}

/** 0~255 글자열 → 바이트(latin1의 반대) */
export function fromLatin1(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }
  return bytes;
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** 제어 글자를 \x04처럼 보이게 바꾼 글(실패 메시지용) */
export function describeBytes(bytes: Uint8Array | string): string {
  const text = typeof bytes === 'string' ? bytes : latin1(bytes);
  return text.replace(/[\x00-\x1f\x7f-\xff]/gu, (char) => {
    if (char === '\r') {
      return '\\r';
    }
    if (char === '\n') {
      return '\\n';
    }
    return `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`;
  });
}

/** 보드 출력처럼 줄 끝 \n을 \r\n으로(MicroPython의 cooked 출력 — print()) */
export function cooked(text: string): string {
  return text.replace(/\r?\n/gu, '\r\n');
}
