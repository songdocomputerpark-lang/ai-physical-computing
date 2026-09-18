/**
 * 데이터 포트(USB-UART 변환기)의 통신 속도 목록(P4-05, PLAN §7.3 "USB 시리얼" 줄).
 *
 * 왜 목록이 필요한가: 시리얼은 **양쪽 속도가 같아야** 글자가 온전히 간다. 보드 쪽 코드가 `UART(2, baudrate=115200)`이면
 * 컴퓨터 쪽도 115200이어야 하고, 다르면 실물에서는 글자가 깨져 도착한다(가상 UART도 같게 흉내 낸다 — PLAN §8.4 설계 메모 ④).
 * 그래서 화면은 "속도 고르기"를 늘 보이고, 예제가 쓰는 값을 기본으로 둔다.
 *
 * 자료에 있는 값(INVENTORY §4.2·CODE_MAPPING §6.1 — 직접 확인)
 * - 115200: 3-1-2 UART 실습(f082~f085). 이 사이트의 기본값이다.
 * - 9600: HW 라이브러리 예제(f001·f007)와 MP3 모듈(f070~f072).
 * 나머지 값은 흔히 쓰는 표준 속도라 골라 볼 수 있게만 둔다(자료에는 없다).
 *
 * Web Serial은 `open({ baudRate })`에 양의 정수만 받는다(0이면 TypeError — WICG Web Serial open 알고리즘, 2026-09-17 확인).
 * 속도 자체에 상한이 정해져 있지 않고 USB-시리얼 칩·드라이버가 정하므로, 사이트는 터무니없는 값만 막고 나머지는 그대로 넘긴다.
 */

export interface DataPortBaudRate {
  readonly rate: number;
  /** 화면 목록에 보일 글 */
  readonly label: string;
  /** 어느 예제가 쓰는 값인지(없으면 빈 글) */
  readonly note: string;
}

/** 교과서 3-1-2 UART 실습이 쓰는 값 */
export const DEFAULT_DATA_PORT_BAUD = 115200;

/** 고를 수 있는 속도(빠른 것부터가 아니라 느린 것부터 — 목록에서 9600을 먼저 찾는 학생이 많다) */
export const DATA_PORT_BAUD_RATES: readonly DataPortBaudRate[] = Object.freeze([
  Object.freeze({ rate: 4800, label: '4800 bps', note: '' }),
  Object.freeze({ rate: 9600, label: '9600 bps', note: 'HW 예제·MP3 모듈' }),
  Object.freeze({ rate: 19200, label: '19200 bps', note: '' }),
  Object.freeze({ rate: 38400, label: '38400 bps', note: '' }),
  Object.freeze({ rate: 57600, label: '57600 bps', note: '' }),
  Object.freeze({ rate: 115200, label: '115200 bps', note: '교과서 3-1-2 UART 실습' }),
  Object.freeze({ rate: 230400, label: '230400 bps', note: '' }),
]);

/** 받아 주는 속도 범위(이 밖의 값은 기본값으로 되돌린다) */
export const MIN_DATA_PORT_BAUD = 300;
export const MAX_DATA_PORT_BAUD = 2_000_000;

/** 목록에 있는 속도인가 */
export function isListedBaud(rate: number): boolean {
  return DATA_PORT_BAUD_RATES.some((item) => item.rate === rate);
}

/** 화면에 보일 속도 글("115200 bps") */
export function baudLabel(rate: number): string {
  const found = DATA_PORT_BAUD_RATES.find((item) => item.rate === rate);
  return found ? found.label : `${rate} bps`;
}

/**
 * 저장해 둔 값·고른 값을 쓸 수 있는 속도로 만든다.
 * 숫자가 아니거나 범위를 벗어나면 기본값(115200)으로 되돌린다 — 저장 공간이 깨져도 실습실이 멈추지 않게.
 */
export function normalizeBaud(value: unknown): number {
  const rate = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(rate) || !Number.isInteger(rate) || rate < MIN_DATA_PORT_BAUD || rate > MAX_DATA_PORT_BAUD) {
    return DEFAULT_DATA_PORT_BAUD;
  }
  return rate;
}

/** 보드 쪽 코드에 적을 속도와 컴퓨터 쪽 속도가 다를 때 보여 줄 한국어 안내(없으면 null) */
export function baudMismatchNotice(computerBaud: number, boardBaud: number | null): string | null {
  if (boardBaud === null || boardBaud === computerBaud) {
    return null;
  }
  return `컴퓨터 쪽은 ${baudLabel(computerBaud)}, 보드 코드는 ${baudLabel(boardBaud)}예요. 속도가 다르면 글자가 깨져서 도착해요.`;
}
