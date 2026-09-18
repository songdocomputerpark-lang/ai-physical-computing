// ESP32 실습실 쪽 선 잇기의 순수 논리(src/lab/modules/vision-bridge/board-uart.ts) 검사 — P4-02.
// 확인하는 것: ① 부품 상태에서 USB-UART 변환기 값만 뽑는다 ② 늘어난 만큼만 떼어 낸다(실행을 새로 시작하면 0부터)
// ③ 512바이트를 넘게 밀리면 몇 바이트를 놓쳤는지 알려 준다 ④ 보드 → 컴퓨터 이벤트(board.uart.tx) 읽기
// ⑤ 컴퓨터 → 보드로 넣을 값의 모양(board.device.input, 속도 0이면 '보드와 같게').
import { describe, expect, it } from 'vitest';
import { deviceInputFor, newBytesFrom, readUartDevice, readUartTxEvent } from '../../../src/lab/modules/vision-bridge/board-uart.ts';

const reading = (rxTotal: number, rxTail: number[], baud = 115_200) => ({ id: 'uart', rxTotal, rxTail, baud });

describe('board.device에서 USB-UART 변환기 값 읽기', () => {
  it('부품이 uart일 때만 읽고, 배선 id·받은 수·꼬리·속도를 준다', () => {
    const value = readUartDevice({ v: 1, id: 'uart', part: 'uart', state: { rxTotal: 3, rxTail: [104, 105, 10], baud: 115_200, boardBaud: 115_200 } });
    expect(value).toEqual({ id: 'uart', rxTotal: 3, rxTail: [104, 105, 10], baud: 115_200 });
  });

  it('다른 부품·모양이 아닌 값은 null', () => {
    expect(readUartDevice({ v: 1, id: 'lcd', part: 'lcd-i2c', state: { text: 'hi' } })).toBeNull();
    expect(readUartDevice(null)).toBeNull();
    expect(readUartDevice({ id: 'uart', part: 'uart' })).toBeNull();
  });

  it('baud가 없으면 보드 속도(boardBaud)를 쓰고, 둘 다 없으면 0', () => {
    expect(readUartDevice({ id: 'uart', part: 'uart', state: { rxTotal: 0, rxTail: [], boardBaud: 9600 } })?.baud).toBe(9600);
    expect(readUartDevice({ id: 'uart', part: 'uart', state: { rxTotal: 0, rxTail: [] } })?.baud).toBe(0);
  });
});

describe('늘어난 만큼만 떼어 내기(보드 → 컴퓨터)', () => {
  it('처음 받은 3바이트를 그대로 준다', () => {
    const next = newBytesFrom(0, reading(3, [104, 105, 10]));
    expect(Array.from(next.bytes)).toEqual([104, 105, 10]);
    expect(next.total).toBe(3);
    expect(next.missed).toBe(0);
  });

  it('이미 본 것은 다시 주지 않는다(꼬리는 그대로인데 수만 늘었을 때 뒤쪽만)', () => {
    const next = newBytesFrom(3, reading(5, [104, 105, 10, 97, 98]));
    expect(Array.from(next.bytes)).toEqual([97, 98]);
    expect(next.total).toBe(5);
  });

  it('바뀐 것이 없으면 빈 바이트', () => {
    expect(newBytesFrom(5, reading(5, [104, 105, 10, 97, 98])).bytes.length).toBe(0);
  });

  it('실행을 새로 시작해 수가 0으로 돌아가면 처음부터 다시 센다', () => {
    const next = newBytesFrom(12, reading(2, [65, 66]));
    expect(Array.from(next.bytes)).toEqual([65, 66]);
    expect(next.total).toBe(2);
  });

  it('꼬리보다 많이 늘었으면 아는 만큼만 주고 놓친 수를 알려 준다', () => {
    const next = newBytesFrom(0, reading(600, Array.from({ length: 512 }, (_, index) => index % 256)));
    expect(next.bytes.length).toBe(512);
    expect(next.missed).toBe(88);
  });
});

describe('보드 → 컴퓨터 이벤트(board.uart.tx)', () => {
  it('바이트 목록·배선 id·속도를 읽는다', () => {
    const tx = readUartTxEvent({ id: 'uart', port: 'uart', bytes: [104, 105], baud: 9600 });
    expect(tx).not.toBeNull();
    expect(Array.from(tx!.bytes)).toEqual([104, 105]);
    expect(tx!.baud).toBe(9600);
  });

  it('바이트가 없거나 모양이 아니면 null', () => {
    expect(readUartTxEvent({ id: 'uart', bytes: [] })).toBeNull();
    expect(readUartTxEvent('hi')).toBeNull();
  });
});

describe('컴퓨터 → 보드로 넣을 값(board.device.input)', () => {
  it('부품 흉내가 받는 모양 그대로 만든다', () => {
    expect(deviceInputFor('uart', Uint8Array.of(97), 115_200)).toEqual({ id: 'uart', data: { kind: 'send', bytes: [97], baud: 115_200 } });
  });

  it('속도를 모르면(0) 보드와 같게(auto) 보낸다 — 손으로 보내기 칸', () => {
    expect(deviceInputFor('uart-2', Uint8Array.of(98, 10), 0).data.baud).toBe('auto');
  });
});
