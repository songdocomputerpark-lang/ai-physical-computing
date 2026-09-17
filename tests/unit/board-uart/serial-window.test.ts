// USB-UART 변환기 부품의 시리얼 창 순수 논리(src/lab/modules/board/parts/uart/serial-window.ts) — PLAN §6.2 "UART2 상대 장치 — 송신 패널", §7.2 규칙 2·7.
import { describe, expect, it } from 'vitest';
import {
  BAUD_CHOICES,
  LOG_LIMIT,
  ReceiveLog,
  displayText,
  encodeSend,
  formatHex,
  parseBaudChoice,
  parseLineEnding,
  parseTerminalState,
  terminalCountsText,
  terminalStatusText,
  type TerminalState,
} from '../../../src/lab/modules/board/parts/uart/serial-window.ts';

function stateOf(overrides: Partial<TerminalState> = {}): TerminalState {
  return { choice: 'auto', baud: 9600, boardBaud: 9600, rxTotal: 0, rxTail: [], txTotal: 0, lastSend: null, mismatch: false, ...overrides };
}

describe('encodeSend — 송신 칸의 글을 바이트로', () => {
  it('글자는 UTF-8, 끝 문자는 고른 대로(기본 없음)', () => {
    expect(encodeSend('1', 'text', 'none')).toEqual({ bytes: [0x31] });
    expect(encodeSend('ab', 'text', 'lf')).toEqual({ bytes: [0x61, 0x62, 0x0a] });
    expect(encodeSend('a', 'text', 'crlf')).toEqual({ bytes: [0x61, 0x0d, 0x0a] });
    expect(encodeSend('가', 'text', 'none')).toEqual({ bytes: [0xea, 0xb0, 0x80] });
  });

  it('바이트 값은 쉼표·빈칸으로 나눈 10진수나 0x 16진수(f007은 1~4 바이트 값)', () => {
    expect(encodeSend('1, 2 0x33,0XfF', 'bytes', 'none')).toEqual({ bytes: [1, 2, 0x33, 0xff] });
    expect(encodeSend('4', 'bytes', 'lf')).toEqual({ bytes: [4, 0x0a] });
  });

  it('틀린 값과 빈 칸은 한국어로 알린다', () => {
    expect(encodeSend('256', 'bytes', 'none')).toEqual({ error: expect.stringContaining('"256"') });
    expect(encodeSend('a', 'bytes', 'none')).toEqual({ error: expect.stringContaining('바이트 값이 아니에요') });
    expect(encodeSend('0x123', 'bytes', 'none')).toEqual({ error: expect.stringContaining('"0x123"') });
    expect(encodeSend('', 'bytes', 'none')).toEqual({ error: expect.stringContaining('적어요') });
    expect(encodeSend('', 'text', 'none')).toEqual({ error: '보낼 글자를 적어요.' });
    // 끝 문자만 보내는 것은 된다(빈 줄 보내기)
    expect(encodeSend('', 'text', 'lf')).toEqual({ bytes: [0x0a] });
  });
});

describe('선택 읽기', () => {
  it('속도는 목록에 있는 값만, 아니면 보드와 같게', () => {
    expect(BAUD_CHOICES).toEqual([9600, 19200, 38400, 57600, 115200]);
    expect(parseBaudChoice('115200')).toBe(115200);
    expect(parseBaudChoice(9600)).toBe(9600);
    expect(parseBaudChoice('auto')).toBe('auto');
    expect(parseBaudChoice('1234')).toBe('auto');
    expect(parseBaudChoice(null)).toBe('auto');
    expect(parseLineEnding('crlf')).toBe('crlf');
    expect(parseLineEnding('x')).toBe('none');
  });
});

describe('parseTerminalState — 변환기 흉내 상태', () => {
  it('파이썬 상태를 읽고 틀린 값은 버린다', () => {
    const parsed = parseTerminalState({
      v: 1,
      choice: 115200,
      baud: 115200,
      boardBaud: 9600,
      rxTotal: 3,
      rxTail: [104, 300, 105, -1, 33],
      txTotal: 2,
      lastSend: { bytes: 2, reached: 1 },
      mismatch: true,
    });
    expect(parsed).toEqual({ choice: 115200, baud: 115200, boardBaud: 9600, rxTotal: 3, rxTail: [104, 105, 33], txTotal: 2, lastSend: { bytes: 2, reached: 1 }, mismatch: true });
    expect(parseTerminalState({ rxTail: new Uint8Array([1, 2]) })?.rxTail).toEqual([1, 2]);
    expect(parseTerminalState({ choice: 'fast' })?.choice).toBe('auto');
    expect(parseTerminalState(null)).toBeNull();
    expect(parseTerminalState('x')).toBeNull();
  });
});

describe('ReceiveLog — 받은 바이트 이어 붙이기', () => {
  it('새로 온 바이트만 붙이고 UTF-8이 나뉘어 와도 이어 읽는다', () => {
    const log = new ReceiveLog();
    expect(log.update(stateOf({ rxTotal: 5, rxTail: [104, 101, 108, 108, 111] }))).toEqual([104, 101, 108, 108, 111]);
    expect(log.text).toBe('hello');
    // 같은 상태가 다시 와도 두 번 붙이지 않는다
    expect(log.update(stateOf({ rxTotal: 5, rxTail: [104, 101, 108, 108, 111] }))).toEqual([]);
    // '가'(EA B0 80)가 두 번에 나뉘어 온다
    log.update(stateOf({ rxTotal: 6, rxTail: [104, 101, 108, 108, 111, 0xea] }));
    expect(log.text).toBe('hello');
    log.update(stateOf({ rxTotal: 8, rxTail: [104, 101, 108, 108, 111, 0xea, 0xb0, 0x80] }));
    expect(log.text).toBe('hello가');
    expect(log.hex).toBe('68 65 6C 6C 6F EA B0 80');
    expect(log.total).toBe(8);
  });

  it('최근 바이트 칸보다 많이 오면 빠진 수를 적는다', () => {
    const log = new ReceiveLog();
    log.update(stateOf({ rxTotal: 2, rxTail: [65, 66] }));
    log.update(stateOf({ rxTotal: 10, rxTail: [67, 68] }));
    expect(log.text).toBe('AB…(6바이트 생략)…CD');
    expect(log.hex).toBe('41 42 …(6바이트 생략)… 43 44');
  });

  it('새 실행(받은 수가 줄어듦)이면 비우고, [지우기]는 받은 수를 지켜 다시 붙이지 않는다', () => {
    const log = new ReceiveLog();
    log.update(stateOf({ rxTotal: 3, rxTail: [65, 66, 67] }));
    log.update(stateOf({ rxTotal: 1, rxTail: [90] }));
    expect(log.text).toBe('Z');
    log.clearText();
    expect(log.text).toBe('');
    expect(log.update(stateOf({ rxTotal: 1, rxTail: [90] }))).toEqual([]);
    expect(log.text).toBe('');
    log.update(stateOf({ rxTotal: 2, rxTail: [90, 89] }));
    expect(log.text).toBe('Y');
    log.clear();
    expect(log.total).toBe(0);
    expect(log.update(null)).toEqual([]);
  });

  it('칸 글자 수를 넘으면 오래된 것부터 버린다', () => {
    const log = new ReceiveLog();
    const tail = Array.from({ length: 500 }, () => 97);
    let total = 0;
    for (let round = 0; round < 10; round += 1) {
      total += 500;
      log.update(stateOf({ rxTotal: total, rxTail: tail }));
    }
    expect(log.text.length).toBe(LOG_LIMIT);
    expect(log.hex.length).toBeLessThanOrEqual(LOG_LIMIT);
  });
});

describe('보이는 글자', () => {
  it('줄바꿈을 맞추고 제어 문자는 기호로 보인다', () => {
    expect(displayText('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
    expect(displayText(`x${String.fromCharCode(1)}${String.fromCharCode(0)}\t${String.fromCharCode(0x7f)}`)).toBe('x␁␀\t␡');
    expect(formatHex([0, 15, 255])).toBe('00 0F FF');
  });

  it('상태 줄은 단계·연결·속도·받은 UART 수에 따라 바뀐다(바이트 수는 따로)', () => {
    expect(terminalStatusText(null, 'stopped')).toContain('[실행]하면');
    expect(terminalStatusText(stateOf(), 'end')).toContain('코드가 끝나서');
    expect(terminalStatusText(null, 'run')).toContain('UART(2, baudrate=9600, tx=17, rx=16)');
    expect(terminalStatusText(stateOf({ boardBaud: null }), 'idle')).toContain('아직 이 선을 쓰는 보드 UART가 없어요');
    expect(terminalStatusText(stateOf({ baud: 9600, boardBaud: 115200 }), 'run')).toBe(
      '주의: 속도가 달라요. 보드 UART는 115200bps, 이 창은 9600bps라 글자가 깨져요. 속도를 "보드와 같게"로 고르거나 코드의 baudrate를 맞춰요.',
    );
    expect(terminalStatusText(stateOf({ mismatch: true }), 'run')).toContain('주의: 속도가 달라요');
    expect(terminalStatusText(stateOf({ lastSend: { bytes: 1, reached: 0 } }), 'run')).toContain('받은 보드 UART가 없어요');
    expect(terminalStatusText(stateOf({ lastSend: { bytes: 1, reached: 1 }, txTotal: 1 }), 'run')).toBe('보드 UART와 이어졌어요(9600bps).');
    expect(terminalCountsText(stateOf({ txTotal: 2, rxTotal: 11 }))).toBe('보낸 바이트 2개 · 받은 바이트 11개');
    expect(terminalCountsText(null)).toBe('보낸 바이트 0개 · 받은 바이트 0개');
  });
});
