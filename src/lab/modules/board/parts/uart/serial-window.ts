/**
 * USB-UART 변환기 부품의 "컴퓨터 시리얼 창" 순수 논리(DOM 없음 — tests/unit/board-uart/serial-window.test.ts). 화면은 같은 폴더의 part.ts.
 *
 * - encodeSend: 송신 칸의 글을 보낼 바이트로. 모양은 글자(UTF-8)나 바이트 값(1, 2, 0x33 — f007처럼 원시 바이트를 받는 코드용, PLAN §7.2 규칙 7),
 *   끝 문자는 없음·\n·\r\n(PLAN §7.2 규칙 2 — 교과서 PC 코드는 끝 문자 없이 보내므로 기본은 없음).
 * - ReceiveLog: 변환기 흉내가 보낸 상태(rxTotal·rxTail 최근 512바이트)에서 새로 온 바이트만 골라 이어 붙인다. 글자는 UTF-8로 이어 읽고(여러 번에
 *   나뉘어 와도), 16진수 보기는 바이트마다 두 자리. 한 번에 512바이트보다 많이 오면 빠진 수를 적는다. 실행을 새로 시작해 rxTotal이 줄면 비운다.
 * - displayText: 받은 글자를 칸에 보일 모양으로 — \r\n·\r은 줄바꿈, 그 밖의 제어 문자(0x00~0x1F, 0x7F)는 제어 기호(␁ 등)로 보여 준다.
 * - parseTerminalState·terminalStatusText·terminalCountsText: 상태 줄 글(이어짐·속도 다름·UART 없음·실행 전·코드 끝남)과 오간 바이트 수.
 *   parseBaudChoice·parseLineEnding: 저장한 선택 읽기.
 */
import type { BoardPhase } from '../../state.ts';

export type SendMode = 'text' | 'bytes';
export type LineEnding = 'none' | 'lf' | 'crlf';
export type BaudChoice = 'auto' | number;

/** 패널에서 고를 수 있는 속도(bps) — apc_part_uart.py BAUD_CHOICES와 같다 */
export const BAUD_CHOICES: readonly number[] = Object.freeze([9600, 19200, 38400, 57600, 115200]);

const ENDINGS: Readonly<Record<LineEnding, readonly number[]>> = Object.freeze({ none: [], lf: [0x0a], crlf: [0x0d, 0x0a] });

/** 저장하거나 고른 속도 글자('auto'·'9600' …) → 선택 값. 목록에 없는 값은 'auto' */
export function parseBaudChoice(value: unknown): BaudChoice {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : Number.NaN;
  return BAUD_CHOICES.includes(number) ? number : 'auto';
}

/** 저장한 끝 문자 선택 → 값(모르는 값은 'none') */
export function parseLineEnding(value: unknown): LineEnding {
  return value === 'lf' || value === 'crlf' ? value : 'none';
}

/** 송신 칸의 글 → 보낼 바이트. 틀리면 한국어 까닭 */
export function encodeSend(text: string, mode: SendMode, ending: LineEnding): { bytes: number[] } | { error: string } {
  const tail = ENDINGS[ending] ?? [];
  if (mode === 'bytes') {
    const tokens = text
      .split(/[\s,]+/u)
      .map((token) => token.trim())
      .filter((token) => token !== '');
    const bytes: number[] = [];
    for (const token of tokens) {
      const value = /^0x[0-9a-f]{1,2}$/iu.test(token) ? Number.parseInt(token.slice(2), 16) : /^\d{1,3}$/u.test(token) ? Number(token) : Number.NaN;
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        return { error: `"${token}"은(는) 바이트 값이 아니에요. 0~255 사이 숫자나 0x00~0xFF를 쉼표로 나눠 적어요(예: 1, 2, 0x33).` };
      }
      bytes.push(value);
    }
    if (bytes.length === 0 && tail.length === 0) {
      return { error: '보낼 바이트 값을 적어요(예: 1, 2, 0x33).' };
    }
    return { bytes: [...bytes, ...tail] };
  }
  const encoded = [...new TextEncoder().encode(text)];
  if (encoded.length === 0 && tail.length === 0) {
    return { error: '보낼 글자를 적어요.' };
  }
  return { bytes: [...encoded, ...tail] };
}

export interface TerminalState {
  readonly choice: BaudChoice;
  readonly baud: number | null;
  readonly boardBaud: number | null;
  readonly rxTotal: number;
  readonly rxTail: readonly number[];
  readonly txTotal: number;
  readonly lastSend: { readonly bytes: number; readonly reached: number } | null;
  readonly mismatch: boolean;
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 변환기 흉내 상태를 읽는다(없으면 null) */
export function parseTerminalState(state: unknown): TerminalState | null {
  if (!state || typeof state !== 'object') {
    return null;
  }
  const raw = state as Record<string, unknown>;
  const tail = raw.rxTail;
  const bytes = Array.isArray(tail)
    ? tail.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 255)
    : tail instanceof Uint8Array
      ? [...tail]
      : [];
  const lastSend = raw.lastSend && typeof raw.lastSend === 'object' ? (raw.lastSend as Record<string, unknown>) : null;
  const choice = raw.choice === 'auto' ? 'auto' : (finiteOrNull(raw.choice) ?? 'auto');
  return {
    choice,
    baud: finiteOrNull(raw.baud),
    boardBaud: finiteOrNull(raw.boardBaud),
    rxTotal: finiteOrNull(raw.rxTotal) ?? 0,
    rxTail: bytes,
    txTotal: finiteOrNull(raw.txTotal) ?? 0,
    lastSend: lastSend ? { bytes: finiteOrNull(lastSend.bytes) ?? 0, reached: finiteOrNull(lastSend.reached) ?? 0 } : null,
    mismatch: raw.mismatch === true,
  };
}

/** 바이트 → "68 65 6C" */
export function formatHex(bytes: readonly number[]): string {
  return bytes.map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

/** 받은 글자 칸에 둘 최대 글자 수(오래된 것부터 버린다) */
export const LOG_LIMIT = 4000;

export class ReceiveLog {
  #seen = 0;
  #text = '';
  #hex = '';
  #decoder = new TextDecoder('utf-8', { fatal: false });

  get text(): string {
    return this.#text;
  }

  get hex(): string {
    return this.#hex;
  }

  /** 지금까지 반영한 받은 바이트 수 */
  get total(): number {
    return this.#seen;
  }

  /** 모두 비운다(새 실행 — 받은 수도 0부터) */
  clear(): void {
    this.#seen = 0;
    this.clearText();
  }

  /** [지우기]: 보이는 글자만 비운다(이미 받은 바이트를 다시 붙이지 않게 받은 수는 그대로) */
  clearText(): void {
    this.#text = '';
    this.#hex = '';
    this.#decoder = new TextDecoder('utf-8', { fatal: false });
  }

  /** 새 상태를 반영한다. 새로 붙은 바이트 목록을 돌려준다 */
  update(state: TerminalState | null): number[] {
    if (!state) {
      return [];
    }
    if (state.rxTotal < this.#seen) {
      this.clear();
    }
    const fresh = state.rxTotal - this.#seen;
    if (fresh <= 0) {
      return [];
    }
    const available = Math.min(fresh, state.rxTail.length);
    const bytes = state.rxTail.slice(state.rxTail.length - available);
    if (fresh > available) {
      const skipped = `…(${fresh - available}바이트 생략)…`;
      this.#text += this.#decoder.decode() + skipped;
      this.#hex += `${this.#hex ? ' ' : ''}${skipped}`;
      this.#decoder = new TextDecoder('utf-8', { fatal: false });
    }
    this.#text += this.#decoder.decode(new Uint8Array(bytes), { stream: true });
    this.#hex += `${this.#hex && bytes.length > 0 ? ' ' : ''}${formatHex(bytes)}`;
    this.#text = this.#text.slice(-LOG_LIMIT);
    this.#hex = this.#hex.slice(-LOG_LIMIT);
    this.#seen = state.rxTotal;
    return bytes;
  }
}

/** 받은 글자 → 칸에 보일 글자: \r\n·\r은 줄바꿈으로, 탭·줄바꿈 밖의 제어 문자는 제어 기호(U+2400~, 0x7F는 ␡)로 */
export function displayText(text: string): string {
  return text.replace(/\r\n?/gu, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/gu, (char) => {
    const code = char.charCodeAt(0);
    return String.fromCharCode(code === 0x7f ? 0x2421 : 0x2400 + code);
  });
}

/**
 * 시리얼 창 상태 줄(한국어, 화면 낭독기가 바뀔 때 읽는다 — 그래서 자주 바뀌는 바이트 수는 넣지 않고 terminalCountsText로 따로 보인다).
 * phase는 보드 단계(state.ts BoardPhase): run·idle이면 보드가 받는 중, end면 코드가 끝남, stopped면 멈춤.
 */
export function terminalStatusText(state: TerminalState | null, phase: BoardPhase): string {
  if (phase === 'end') {
    return '코드가 끝나서 보드가 더는 읽지 않아요. 다시 보내려면 [실행]을 눌러요.';
  }
  if (phase !== 'run' && phase !== 'idle') {
    return '[실행]하면 보드와 이어져요. 보드가 코드를 돌리는 동안 보낸 것만 보드가 받아요.';
  }
  if (!state || state.boardBaud === null) {
    return '아직 이 선을 쓰는 보드 UART가 없어요. 코드에서 UART(2, baudrate=9600, tx=17, rx=16)처럼 만들면 이어져요.';
  }
  if (state.mismatch || (state.baud !== null && state.baud !== state.boardBaud)) {
    return `주의: 속도가 달라요. 보드 UART는 ${state.boardBaud}bps, 이 창은 ${state.baud ?? '?'}bps라 글자가 깨져요. 속도를 "보드와 같게"로 고르거나 코드의 baudrate를 맞춰요.`;
  }
  if (state.lastSend && state.lastSend.reached === 0) {
    return '주의: 보낸 바이트를 받은 보드 UART가 없어요. 코드의 rx 핀 번호가 배선도의 변환기 TX 핀과 같은지 확인해요.';
  }
  return `보드 UART와 이어졌어요(${state.boardBaud}bps).`;
}

/** 오간 바이트 수 글: "보낸 바이트 2개 · 받은 바이트 11개" */
export function terminalCountsText(state: TerminalState | null): string {
  return `보낸 바이트 ${state?.txTotal ?? 0}개 · 받은 바이트 ${state?.rxTotal ?? 0}개`;
}
