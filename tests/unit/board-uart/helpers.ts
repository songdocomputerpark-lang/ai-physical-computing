// 구역 C(P3-05 네오픽셀·UART·MP3·콘솔 입력) 단위 테스트의 작은 도구.
import type { BoardDeviceEventRecord, BoardStepRecord } from '../lab/helpers/pyodide-board.ts';

/** 파이썬 bytes가 JS로 오면 Uint8Array → JSON에서 {"0": 49, "1": 50} 모양이 된다. 숫자 목록으로 바꾼다(None이면 null). */
export function bytesOf(value: unknown): number[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map(Number);
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => Number((value as Record<string, unknown>)[key]));
  }
  throw new Error(`바이트 값이 아니에요: ${JSON.stringify(value)}`);
}

/** 글자 → 바이트 목록(UTF-8) */
export function utf8(text: string): number[] {
  return [...Buffer.from(text, 'utf8')];
}

/** 이 단계에서 배선 id가 보낸 board.device 상태들(오래된 것부터) */
export function deviceStates<T = Record<string, unknown>>(record: BoardStepRecord, id: string): T[] {
  return (record.devices ?? [])
    .filter((event: BoardDeviceEventRecord) => event.id === id)
    .map((event) => event.state as T);
}

/** 이 단계의 마지막 board.state에서 핀 하나 */
export function lastPin(record: BoardStepRecord, gpio: number) {
  return record.events.at(-1)?.pins.find((pin) => pin.id === gpio);
}
