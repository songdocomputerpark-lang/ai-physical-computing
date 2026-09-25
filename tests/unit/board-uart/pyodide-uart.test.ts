// machine.UART(누적 링 버퍼·timeout·핀·오류 문구)와 USB-UART 변환기(시리얼 창) 흉내 — 실제 Pyodide(JSPI)로 확인(P3-05 구역 C).
// 단계는 tests/unit/board-uart/steps/uart.mjs, 기준은 MicroPython v1.29.0 ports/esp32/machine_uart.c·py/stream.c(파이썬 파일 머리말).
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf } from '../lab/helpers/pyodide-board.ts';
import { bytesOf, deviceStates, lastPin, utf8 } from './helpers.ts';

interface TerminalState {
  choice: string | number;
  baud?: number | null;
  boardBaud?: number | null;
  rxTotal: number;
  rxTail: number[];
  txTotal: number;
  lastSend?: { bytes: number; reached: number } | null;
  mismatch: boolean;
}

describe.skipIf(!boardPyodideReady)('가상 보드 machine.UART와 시리얼 창(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/board-uart/steps/uart.mjs');

  it('공유 도우미로 ESP32 실습실과 같은 파일이 준비되고 이름이 겹치지 않는다', () => {
    expect(out.jspi).toBe(true);
    expect(out.duplicate).toBeUndefined();
    expect(out.files).toEqual(expect.arrayContaining(['apc_board_uart.py', 'apc_part_uart.py']));
  });

  it('기본값·같은 번호 같은 객체·repr(나누개로 다시 계산한 115201)·오류 문구가 v1.29.0과 같다', () => {
    const record = stepOf(out, 'uart_basics');
    expect(record.errorType).toBeUndefined();
    const value = record.value as unknown[];
    expect(value[0]).toBe(
      'UART(2, baudrate=9600, bits=8, parity=None, stop=1, tx=17, rx=16, rts=-1, cts=-1, txbuf=256, rxbuf=256, timeout=0, timeout_char=0, irq=0)',
    );
    expect(value[1]).toBe(true);
    // 번호만 주면 설정을 그대로 두고 받은 바이트만 비운다
    expect(value[2]).toBe(value[0]);
    expect(value[3]).toBe(
      'UART(1, baudrate=115201, bits=8, parity=None, stop=1, tx=10, rx=9, rts=-1, cts=-1, txbuf=256, rxbuf=256, timeout=0, timeout_char=0, irq=0)',
    );
    expect(value[4]).toContain('baudrate=115201, bits=7, parity=1, stop=2, tx=17, rx=16');
    expect(value[5]).toBe(value[0]);
    expect(value[6]).toBe(value[0]);
    expect(value[7]).toEqual([1, 4096, 2, 32, 4, 1, 2]);
    expect(value.slice(8, 23)).toEqual([
      'ValueError: UART(3) does not exist',
      'ValueError: invalid data bits',
      'ValueError: invalid stop bits',
      'ValueError: invalid pin',
      'OSError: [Errno 1] EPERM: ESP_FAIL',
      'OSError: [Errno 1] EPERM: ESP_FAIL',
      'ValueError: REPL UART buffer size is fixed',
      'ValueError: REPL UART does not support IRQs',
      'TypeError: extra positional arguments given',
      "TypeError: can't convert float to int",
      'ValueError: invalid inversion mask',
      'TypeError: function missing 1 required positional arguments',
      'TypeError: object with buffer protocol required',
      'ValueError: handler must be None or callable',
      'ValueError: trigger 0x0008 unsupported',
    ]);
    // write는 보낸 바이트 수(글자는 UTF-8 — "한글"은 6바이트, 최대·시작 인자), 받은 것이 없으면 any 0·read None·readline None, 보내는 중에는 txdone False
    expect(value[23]).toEqual([5, 2, 3, 6, 2, 3]);
    expect(value[24]).toEqual([0, null, null, null, false]);
    expect(value[25]).toBe(true);
    // deinit 뒤: write·read는 None, txdone False, any는 OSError(1, 'ESP_FAIL')
    expect(value[26]).toEqual([null, null, false]);
    expect(value[27]).toEqual(['OSError', [1, 'ESP_FAIL']]);
    // TX 핀은 "출력(읽기 꺼짐)" 1(쉼), RX 핀은 입력 — 핀 표에 보인다. UART1의 기본 핀 10은 플래시 핀 안내
    expect(lastPin(record, 17)).toMatchObject({ mode: 'out_only', level: 1, driven: true });
    expect(lastPin(record, 16)).toMatchObject({ mode: 'in' });
    expect(record.notices.some((text) => text.includes('10번 핀(6~11번)은 보드 안의 플래시 메모리'))).toBe(true);
    // 보드가 보낸 글자는 시리얼 창의 받은 글자에 차례로 쌓인다(deinit 뒤의 write는 빠짐)
    const terminal = deviceStates<TerminalState>(record, 'uart').at(-1);
    expect(terminal?.rxTail).toEqual([...utf8('hello'), ...utf8('ab'), 1, 2, 3, ...utf8('한글'), ...utf8('ab'), ...utf8('bcd')]);
  });

  it('시리얼 창이 보낸 바이트는 선을 지나는 시간만큼(9600bps 1바이트 약 1ms) 차례로 링 버퍼에 쌓이고, read()는 쌓인 것을 한꺼번에 준다', () => {
    const record = stepOf(out, 'uart_receive_spacing');
    expect(record.errorType).toBeUndefined();
    const [first, later, data, again, any] = record.value as [number, number, unknown, unknown, number];
    expect(first).toBeLessThan(40);
    expect(later).toBe(40);
    expect(bytesOf(data)).toEqual(utf8('0123456789abcdefghijklmnopqrstuvwxyzABCD'));
    expect(again).toBeNull();
    expect(any).toBe(0);
    expect(deviceStates<TerminalState>(record, 'uart').at(-1)).toMatchObject({ txTotal: 40, lastSend: { bytes: 40, reached: 1 } });
  });

  it('readline은 줄바꿈까지·나머지는 받은 만큼, read(n)·readinto는 지금 도착한 만큼, timeout은 가상 시계로 기다린다', () => {
    const record = stepOf(out, 'uart_readline_timeout');
    expect(record.errorType).toBeUndefined();
    const [first, second, got, buffer, one, rest, none, waitedEnough, notTooLong] = record.value as unknown[];
    expect(bytesOf(first)).toEqual(utf8('ab\n'));
    expect(bytesOf(second)).toEqual(utf8('cd'));
    expect(got).toBe(1);
    expect(bytesOf(buffer)).toEqual([87, 0, 0, 0]);
    // read(10)은 "지금 도착한 만큼"(적어도 한 바이트)이고 나머지는 read()가 기다려 모두 받는다. 바이트 사이가 약 1ms라 보통 'X' 하나지만,
    // 컴퓨터가 바쁘면 그사이 더 도착해 있다(npm test 전체 실행에서 'XYZ'를 본 적 있음, 2026-09-25) — 나눠진 자리가 아니라 합과 순서를 본다.
    const oneBytes = bytesOf(one) ?? [];
    expect(oneBytes.length).toBeGreaterThanOrEqual(1);
    expect([...oneBytes, ...(bytesOf(rest) ?? [])]).toEqual(utf8('XYZ12'));
    expect(none).toBeNull();
    expect(waitedEnough).toBe(true);
    expect(notTooLong).toBe(true);
  });

  it('보드와 시리얼 창의 속도가 다르면 비트 단위로 깨진다(115200bps 보드가 9600bps의 "1"을 받으면 1이 아니다)', () => {
    const record = stepOf(out, 'uart_baud_mismatch');
    expect(record.errorType).toBeUndefined();
    const [data, different] = record.value as [unknown, boolean];
    expect(bytesOf(data)?.length ?? 0).toBeGreaterThan(0);
    expect(different).toBe(true);
    expect(deviceStates<TerminalState>(record, 'uart').at(-1)).toMatchObject({ choice: 9600, baud: 9600, boardBaud: 115200, mismatch: true });
  });

  it('UART가 쓰는 TX 핀을 Pin()으로 다시 정하면 신호가 끊겨 부품에 닿지 않고 한국어로 한 번 알린다', () => {
    const record = stepOf(out, 'uart_tx_and_takeover');
    expect(record.errorType).toBeUndefined();
    const terminal = deviceStates<TerminalState>(record, 'uart').at(-1);
    expect(terminal?.rxTail).toEqual(utf8('hello world'));
    expect(record.notices.filter((text) => text.includes('UART 신호가 끊겼어요'))).toHaveLength(1);
  });

  it('tx·rx를 배선과 엇갈리게 적으면(3단원 원본 방향) 교차 연결을 한국어로 알리고 보낸 글자는 닿지 않는다', () => {
    const record = stepOf(out, 'uart_crossed_pins');
    expect(record.errorType).toBeUndefined();
    expect(record.notices.some((text) => text.includes('엇갈려 있어요') && text.includes('tx=17, rx=16'))).toBe(true);
    expect(deviceStates<TerminalState>(record, 'uart').at(-1)?.rxTotal).toBe(0);
  });

  it('irq(trigger=IRQ_RX)는 바이트가 들어오면 콜백을 부른다', () => {
    const record = stepOf(out, 'uart_irq');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([[true], 1, true]);
  });

  it('원본 f001(글자 "2" → 빨강 23번)·f007(바이트 3 → 초록 25번)이 파일 그대로 돈다', () => {
    const f001 = stepOf(out, 'f001_text_2');
    expect(f001.errorType).toBe('KeyboardInterrupt');
    expect(f001.stdout).toContain('50');
    expect([lastPin(f001, 23)?.level, lastPin(f001, 25)?.level, lastPin(f001, 26)?.level]).toEqual([1, 0, 0]);
    expect(deviceStates<TerminalState>(f001, 'uart').at(-1)?.rxTail).toEqual(utf8('hello world'));
    const f007 = stepOf(out, 'f007_bytes_3');
    expect(f007.errorType).toBe('KeyboardInterrupt');
    expect(f007.stdout).toContain('3');
    expect([lastPin(f007, 23)?.level, lastPin(f007, 25)?.level, lastPin(f007, 26)?.level]).toEqual([0, 1, 0]);
  });
});
