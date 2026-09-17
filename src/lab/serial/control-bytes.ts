/**
 * MicroPython REPL 제어 글자와 바이트 도우미(P3-07 실제 보드 ① 연결·raw REPL — 사이트 코드라 배포 번들에 들어간다).
 *
 * 근거(2026-09-17 MicroPython v1.29.0 원문 확인)
 * - docs/reference/repl.rst "Raw mode and raw-paste mode": Ctrl-A로 raw REPL, 코드 + Ctrl-D → "OK" → 출력 → \x04 → 오류 → \x04 → ">",
 *   Ctrl-B로 보통(friendly) REPL. raw-paste는 "\x05A\x01" → "R\x01"(지원)·"R\x00"(알지만 안 씀)·"ra…"(모름) → 창 크기 2바이트(LE) …
 * - shared/runtime/pyexec.c: raw REPL에서 Ctrl-C는 받던 줄을 지우고(출력 없음), 빈 줄 + Ctrl-D는 "OK\r\n" 뒤 소프트 리셋이다.
 *   보통 REPL에서 Ctrl-B는 리셋 없이 배너("MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32")를 다시 찍는다.
 * - ports/esp32/main.c: 소프트 리셋 글 "MPY: soft reboot\r\n", raw REPL 모드로 다시 켜지면 boot.py만 돌고 main.py는 돌지 않는다.
 * 모의 시리얼(src/lab/serial/mock/bytes.ts)은 테스트 도구라 사이트 코드가 import하지 않으므로(배포 번들에 넣지 않음) 같은 값을 여기 따로 둔다.
 */

/** raw REPL로 들어가기 */
export const CTRL_A = 0x01;
/** 보통 REPL로 나가기(보통 REPL에서는 배너 다시 찍기) */
export const CTRL_B = 0x02;
/** 실행 중인 코드 멈추기(KeyboardInterrupt). raw REPL 대기 중에는 받던 줄 지우기 */
export const CTRL_C = 0x03;
/** raw REPL: 코드 끝(빈 줄이면 소프트 리셋). 보드 출력에서는 "보통 출력 끝·오류 끝" 표시 */
export const CTRL_D = 0x04;
/** raw-paste 요청의 첫 글자 */
export const CTRL_E = 0x05;
export const CR = 0x0d;

/** raw REPL에 들어갔을 때(그리고 raw REPL로 소프트 리셋된 뒤) 보드가 보내는 글 — 뒤에 ">"가 붙는다 */
export const RAW_REPL_BANNER = 'raw REPL; CTRL-B to exit\r\n';
/** raw REPL 프롬프트까지 붙은 글 */
export const RAW_REPL_READY = `${RAW_REPL_BANNER}>`;
/** raw-paste를 모르는 옛 펌웨어가 "\x05A\x01"에 raw REPL 알림을 다시 보낼 때, 앞 두 글자("ra")를 읽고 남는 부분(repl.rst) */
export const RAW_REPL_READY_TAIL = 'w REPL; CTRL-B to exit\r\n>';
/** 소프트 리셋 알림의 끝부분(ESP32 "MPY: soft reboot\r\n") */
export const SOFT_REBOOT_TEXT = 'soft reboot\r\n';
/** 보통 REPL 프롬프트 */
export const FRIENDLY_PROMPT = '>>> ';
/** raw-paste 요청 바이트 */
export const RAW_PASTE_REQUEST: Uint8Array = Uint8Array.of(CTRL_E, 0x41, CTRL_A);

const encoder = new TextEncoder();

/** 글자(UTF-8)·바이트·제어 글자 번호를 이어 붙인 바이트 */
export function bytesOf(...parts: readonly (number | string | Uint8Array)[]): Uint8Array {
  const pieces = parts.map((part) => (typeof part === 'number' ? Uint8Array.of(part & 0xff) : typeof part === 'string' ? encoder.encode(part) : part));
  const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const piece of pieces) {
    out.set(piece, offset);
    offset += piece.length;
  }
  return out;
}

/** 바이트 → 한 글자에 0~255(제어 글자를 그대로 두고 규약 글자를 찾을 때) */
export function latin1(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index < bytes.length; index += 1) {
    text += String.fromCharCode(bytes[index]!);
  }
  return text;
}

/** 0~255 글자열 → 바이트(latin1의 반대, 규약 글자를 바이트로 찾을 때) */
export function fromLatin1(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }
  return bytes;
}

/** haystack에서 needle이 처음 나오는 자리(from부터). 없으면 -1 */
export function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0, end = haystack.length): number {
  if (needle.length === 0) {
    return Math.min(Math.max(from, 0), end);
  }
  const last = Math.min(end, haystack.length) - needle.length;
  outer: for (let start = Math.max(from, 0); start <= last; start += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        continue outer;
      }
    }
    return start;
  }
  return -1;
}

/** 기록·오류 글에서 제어 글자를 \x04처럼 보이게(줄바꿈은 \r\n 그대로 보이게) */
export function showControls(text: string): string {
  return text.replace(/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/gu, (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

/**
 * 보드 출력 → 콘솔 글. UTF-8을 조각 경계에 걸친 글자까지 이어 풀고(TextDecoder stream), MicroPython이 붙이는 줄 끝 \r\n을 \n으로 바꾼다
 * (\r이 조각 끝에 걸리면 다음 조각을 보고 정한다). 홀로 있는 \r은 그대로 둔다(진행률 표시처럼 줄 앞으로 돌아가는 글).
 */
export class BoardTextDecoder {
  readonly #decoder = new TextDecoder('utf-8');
  #pendingCr = false;

  push(bytes: Uint8Array): string {
    return this.#normalize(this.#decoder.decode(bytes, { stream: true }));
  }

  /** 남은 글을 모두 내보낸다(잘린 UTF-8은 대체 문자) */
  flush(): string {
    const text = this.#normalize(this.#decoder.decode());
    if (this.#pendingCr) {
      this.#pendingCr = false;
      return `${text}\r`;
    }
    return text;
  }

  #normalize(text: string): string {
    let input = text;
    let prefix = '';
    if (this.#pendingCr) {
      this.#pendingCr = false;
      if (input.startsWith('\n')) {
        prefix = '\n';
        input = input.slice(1);
      } else if (input.length === 0) {
        this.#pendingCr = true;
        return '';
      } else {
        prefix = '\r';
      }
    }
    if (input.endsWith('\r')) {
      this.#pendingCr = true;
      input = input.slice(0, -1);
    }
    return prefix + input.replace(/\r\n/gu, '\n');
  }
}
