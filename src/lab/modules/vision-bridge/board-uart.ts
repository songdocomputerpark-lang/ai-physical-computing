/**
 * ESP32 실습실 쪽 선 잇기의 **순수 논리**(P4-02). DOM·워커를 모르므로 단위 테스트(tests/unit/bridge-serial/)가 그대로 검사한다.
 *
 * 두 방향의 이름(PLAN §8.4 설계 메모 ②)
 *  - 컴퓨터 → 보드: 화면이 채널 `board.device.input`에 { id: 배선 id, data: { kind: 'send', bytes, baud } }를 넣으면
 *    USB-UART 변환기 흉내(src/lab/modules/board/parts/uart/apc_part_uart.py)가 변환기 TX 핀으로 보내고, 그 핀을 RX로 쓰는
 *    UART가 바이트 도착 시각(8N1 115200bps면 약 87µs/바이트)까지 맞춰 받는다. **속도가 다르면 실물처럼 글자가 깨진다.**
 *  - 보드 → 컴퓨터: 준비 단계가 이름만 열어 둔 이벤트 `board.uart.tx`({ id, port, bytes, baud })를 쓴다.
 *    아직 보드 쪽에서 그 이벤트를 보내지 않으므로(파이썬 apc_part_uart.py에 한 줄이 필요 — 보고서의 공유 파일 변경 요청),
 *    그때까지는 부품 상태 `board.device`의 rxTotal·rxTail(최근 512바이트)에서 **늘어난 만큼**을 떼어 같은 자리로 올린다.
 *    이벤트가 한 번이라도 오면 상태에서 떼는 길은 스스로 꺼진다(같은 바이트를 두 번 보내지 않게).
 */

/** 보드가 화면에 보낸 부품 상태에서 뽑은 USB-UART 변환기 값 */
export interface UartDeviceReading {
  /** 배선 id(예: 'uart'. 같은 부품이 둘이면 'uart-2') */
  readonly id: string;
  /** 보드가 지금까지 이 변환기로 보낸 바이트 수 */
  readonly rxTotal: number;
  /** 최근에 받은 바이트(최대 512) */
  readonly rxTail: readonly number[];
  /** 지금 쓰는 속도(bps). 모르면 0 */
  readonly baud: number;
}

/** 'board.device' 이벤트 payload에서 USB-UART 변환기 값만 뽑는다(다른 부품이면 null) */
export function readUartDevice(payload: unknown): UartDeviceReading | null {
  if (payload === null || typeof payload !== 'object') {
    return null;
  }
  const event = payload as { id?: unknown; part?: unknown; state?: unknown };
  if (event.part !== 'uart' || typeof event.id !== 'string' || event.state === null || typeof event.state !== 'object') {
    return null;
  }
  const state = event.state as { rxTotal?: unknown; rxTail?: unknown; baud?: unknown; boardBaud?: unknown };
  const rxTail = Array.isArray(state.rxTail) ? state.rxTail.filter((value): value is number => typeof value === 'number') : [];
  const baud = typeof state.baud === 'number' ? state.baud : typeof state.boardBaud === 'number' ? state.boardBaud : 0;
  return {
    id: event.id,
    rxTotal: typeof state.rxTotal === 'number' ? state.rxTotal : 0,
    rxTail,
    baud,
  };
}

/**
 * 지난번에 본 수(previousTotal)와 지금 값에서 **새로 온 바이트**만 떼어 낸다.
 * 실행을 새로 시작하면 rxTotal이 0으로 돌아가므로 그때는 처음부터 다시 센다.
 * 한 번에 512바이트(rxTail 길이)를 넘게 오면 그만큼만 알 수 있다 — 16ms 병합 때문이라 콘솔에 알린다(부르는 쪽).
 */
export function newBytesFrom(previousTotal: number, reading: UartDeviceReading): { bytes: Uint8Array; total: number; missed: number } {
  const previous = reading.rxTotal < previousTotal ? 0 : previousTotal;
  const delta = reading.rxTotal - previous;
  if (delta <= 0) {
    return { bytes: new Uint8Array(0), total: reading.rxTotal, missed: 0 };
  }
  const take = Math.min(delta, reading.rxTail.length);
  const bytes = Uint8Array.from(reading.rxTail.slice(reading.rxTail.length - take).map((value) => value & 0xff));
  return { bytes, total: reading.rxTotal, missed: delta - take };
}

/** 'board.uart.tx' 이벤트 payload({ id, port, bytes, baud }) → 보낼 바이트. 모양이 아니면 null */
export function readUartTxEvent(payload: unknown): { id: string; port: string; bytes: Uint8Array; baud: number } | null {
  if (payload === null || typeof payload !== 'object') {
    return null;
  }
  const event = payload as { id?: unknown; port?: unknown; bytes?: unknown; baud?: unknown };
  const raw = event.bytes;
  const bytes = raw instanceof Uint8Array ? raw : Array.isArray(raw) ? Uint8Array.from(raw.map((value) => (typeof value === 'number' ? value & 0xff : 0))) : null;
  if (bytes === null || bytes.length === 0) {
    return null;
  }
  return {
    id: typeof event.id === 'string' ? event.id : 'uart',
    port: typeof event.port === 'string' ? event.port : 'uart',
    bytes,
    baud: typeof event.baud === 'number' ? event.baud : 0,
  };
}

/** 컴퓨터에서 온 바이트를 보드 부품 흉내에 넣을 값으로 만든다(채널 'board.device.input') */
export function deviceInputFor(id: string, bytes: Uint8Array, baud: number): { id: string; data: { kind: 'send'; bytes: number[]; baud: number | 'auto' } } {
  return { id, data: { kind: 'send', bytes: Array.from(bytes), baud: baud > 0 ? baud : 'auto' } };
}
