// 데이터 포트(P4-05)를 모의 시리얼(src/lab/README.md 8절)로 연다: 보드 REPL 포트를 건드리지 않고 **두 번째 포트**를 나란히 여는지,
// 속도 바꾸기·끊기·선 뽑기·잘못 고른 포트(보드 REPL)를 한국어로 알리는지.
// 모의에서 된다는 것이 실물에서 된다는 증거는 아니다 — 실제 송수신은 운영자 확인(부록 B-2 8번).
import { afterEach, describe, expect, it } from 'vitest';
import { DataPortClosedError, DataPortConnection } from '../../../src/lab/serial/data-port/index.ts';
import { EchoDevice, FakeSerial, MicroPythonDevice, MockSerialPort, TextDevice, USB_IDS } from '../../../src/lab/serial/mock/index.ts';

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

/** 변환기 포트 하나(에코 장치 = 반대쪽에서 되돌려 보내는 선)와 가짜 navigator.serial */
function setup(options: { readonly converter?: MockSerialPort; readonly ports?: readonly MockSerialPort[] } = {}) {
  const converter = options.converter ?? new MockSerialPort({ device: new EchoDevice(), label: 'converter' });
  const serial = new FakeSerial({ ports: [converter, ...(options.ports ?? [])], requireUserActivation: false });
  const connection = new DataPortConnection({ serial });
  cleanups.push(() => connection.dispose());
  return { converter, serial, connection };
}

/** 받은 바이트가 도착할 때까지 잠깐 기다린다(스트림은 다음 차례에 온다) */
async function settle(times = 3): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('데이터 포트 연결', () => {
  it('Web Serial이 없는 브라우저는 처음부터 "열 수 없어요"로 알린다', () => {
    const connection = new DataPortConnection({ serial: null });
    expect(connection.supported).toBe(false);
    expect(connection.snapshot.state).toBe('unsupported');
    expect(connection.snapshot.problem?.text).toContain('USB 포트를 열 수 없어요');
  });

  it('[데이터 포트 연결]로 포트를 고르면 고른 속도로 열린다', async () => {
    const { converter, connection } = setup();
    const snapshot = await connection.connect();
    expect(snapshot.state).toBe('open');
    expect(snapshot.problem).toBeNull();
    expect(snapshot.identity?.key).toBe('usb:1a86:7523');
    expect(snapshot.labelText).toBe('데이터 포트(CH340)');
    expect(converter.isOpen).toBe(true);
    expect(converter.openLog[0]?.baudRate).toBe(115200);
  });

  it('선택 창을 닫으면 연결 전 상태로 돌아가고 까닭을 알린다', async () => {
    const { serial, connection } = setup();
    serial.chooseNext(null);
    const snapshot = await connection.connect();
    expect(snapshot.state).toBe('idle');
    expect(snapshot.problem?.code).toBe('not-selected');
    expect(snapshot.problem?.advice).toContain('변환기');
  });

  it('이미 열려 있을 때 선택 창을 닫아도 열린 연결은 그대로 둔다', async () => {
    const { serial, connection } = setup();
    await connection.connect();
    serial.chooseNext(null);
    const snapshot = await connection.connect();
    expect(snapshot.state).toBe('open');
    expect(snapshot.problem?.code).toBe('not-selected');
  });

  it('보드 REPL 포트(이 페이지가 이미 연 포트)를 고르면 "이 페이지가 이미 쓰고 있어요"라고 알린다', async () => {
    // 실제 보드 탭이 연 포트 = 이미 열려 있는 포트. Web Serial은 다시 열면 InvalidStateError를 낸다.
    const boardPort = new MockSerialPort({ device: new MicroPythonDevice(), label: 'board' });
    await boardPort.open({ baudRate: 115200 });
    cleanups.push(async () => {
      await boardPort.close().catch(() => undefined);
    });
    const { serial, connection } = setup({ ports: [boardPort] });
    serial.chooseNext(boardPort);
    const snapshot = await connection.connect();
    expect(snapshot.state).toBe('error');
    expect(snapshot.problem?.code).toBe('port-in-use');
    expect(snapshot.problem?.text).toContain('이미 쓰고 있어요');
    // 보드 포트는 그대로 열려 있다(건드리지 않았다)
    expect(boardPort.isOpen).toBe(true);
  });

  it('다른 프로그램이 쓰는 포트는 "다른 프로그램이 쓰고 있어요"로 알린다', async () => {
    const busy = new MockSerialPort({ device: new EchoDevice(), openError: 'NetworkError', label: 'busy' });
    const { serial, connection } = setup({ ports: [busy] });
    serial.chooseNext(busy);
    const snapshot = await connection.connect();
    expect(snapshot.problem?.code).toBe('port-busy');
    expect(snapshot.problem?.advice).toContain('Thonny');
  });

  it('보드 REPL 포트를 골라 열렸을 때는 MicroPython 시작 글을 보고 알아챈다', async () => {
    const replLike = new MockSerialPort({
      device: new TextDevice('MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32\r\n>>> ', 'once'),
      label: 'repl-like',
    });
    const { serial, connection } = setup({ ports: [replLike] });
    serial.chooseNext(replLike);
    await connection.connect();
    expect(connection.snapshot.boardReplSuspect).toBe(false);
    // 보드는 무엇이든 받으면 배너를 보낸다(실물은 열자마자·Enter를 받으면)
    await connection.write(Uint8Array.of(0x0d));
    await settle();
    expect(connection.snapshot.boardReplSuspect).toBe(true);
  });
});

describe('데이터 주고받기', () => {
  it('보낸 바이트가 변환기에 그대로 가고 되돌아온 바이트가 쌓인다', async () => {
    const { converter, connection } = setup();
    const received: Uint8Array[] = [];
    connection.onData((bytes) => received.push(bytes));
    await connection.connect();
    await connection.write(new TextEncoder().encode('a\n'));
    await settle();
    expect(converter.writtenText()).toBe('a\n');
    expect(connection.snapshot.sent).toBe(2);
    expect(connection.snapshot.received).toBe(2);
    expect(received.map((item) => new TextDecoder().decode(item)).join('')).toBe('a\n');
    expect(connection.snapshot.rx.lines).toEqual(['a']);
    expect(connection.snapshot.tx.lines).toEqual(['a']);
  });

  it('원시 바이트(0x01~0x04)도 그대로 오간다 — 변환기 포트는 제어 신호로 삼키지 않는다', async () => {
    const { converter, connection } = setup();
    await connection.connect();
    await connection.write(Uint8Array.of(0x03));
    await settle();
    expect(converter.writtenText()).toBe('\x03');
    expect(connection.snapshot.rx.hex).toBe('03');
  });

  it('열려 있지 않으면 보내기가 한국어 오류로 끝난다', async () => {
    const { connection } = setup();
    await expect(connection.write(new TextEncoder().encode('a'))).rejects.toBeInstanceOf(DataPortClosedError);
    await expect(connection.write(new TextEncoder().encode('a'))).rejects.toThrow('[데이터 포트 연결]');
  });

  it('속도를 바꾸면 같은 포트를 새 속도로 다시 연다', async () => {
    const { converter, connection } = setup();
    await connection.connect();
    const snapshot = await connection.setBaudRate(9600);
    expect(snapshot.state).toBe('open');
    expect(snapshot.baudRate).toBe(9600);
    expect(converter.openLog.map((item) => item.baudRate)).toEqual([115200, 9600]);
    expect(converter.isOpen).toBe(true);
  });

  it('연결하기 전에 바꾼 속도는 열 때 쓰인다', async () => {
    const { converter, connection } = setup();
    await connection.setBaudRate(9600);
    await connection.connect();
    expect(converter.openLog.map((item) => item.baudRate)).toEqual([9600]);
  });

  it('[연결 끊기]는 포트를 닫고 다시 연결할 수 있게 둔다', async () => {
    const { converter, connection } = setup();
    await connection.connect();
    const snapshot = await connection.disconnect();
    expect(snapshot.state).toBe('idle');
    expect(converter.isOpen).toBe(false);
    const again = await connection.reconnect();
    expect(again.state).toBe('open');
    expect(converter.openLog).toHaveLength(2);
  });

  it('USB 선을 뽑으면 끊김을 알린다', async () => {
    const { converter, connection } = setup();
    await connection.connect();
    converter.unplug();
    await settle(6);
    expect(connection.snapshot.state).toBe('error');
    expect(connection.snapshot.problem?.code).toBe('lost');
    expect(connection.snapshot.problem?.text).toContain('USB 선이 빠졌거나');
  });

  it('화면은 구독으로 상태를 받는다(구독하자마자 지금 상태 한 번)', async () => {
    const { connection } = setup();
    const states: string[] = [];
    const stop = connection.subscribe((snapshot) => states.push(snapshot.state));
    await connection.connect();
    stop();
    expect(states[0]).toBe('idle');
    expect(states).toContain('choosing');
    expect(states).toContain('opening');
    expect(states[states.length - 1]).toBe('open');
  });

  it('이름표는 제어 글자를 지우고 화면 이름에 쓰인다', async () => {
    const { connection } = setup();
    await connection.connect();
    const snapshot = connection.setLabel(' 왼쪽 USB\n');
    expect(snapshot.label).toBe('왼쪽 USB');
    expect(snapshot.labelText).toBe('왼쪽 USB');
  });

  it('다른 포트를 골라 열면 앞 포트의 이름표를 데려가지 않는다', async () => {
    // 칩이 서로 다른 두 포트(CP2102 변환기·CH340 보드) — 이름표 열쇠는 USB VID·PID다
    const converter = new MockSerialPort({ device: new EchoDevice(), info: { ...USB_IDS.cp2102 }, label: 'converter' });
    const other = new MockSerialPort({ device: new EchoDevice(), info: { ...USB_IDS.ch340 }, label: 'other' });
    const { connection, serial } = setup({ converter, ports: [other] });
    await connection.connect();
    connection.setLabel('변환기');
    const firstKey = connection.snapshot.identity?.key;
    expect(connection.snapshot.label).toBe('변환기');

    serial.chooseNext(other);
    await connection.connect();
    // 열쇠가 다른 포트라 이름표가 비워진다(화면이 그 포트에 저장해 둔 이름표를 다시 넣는다)
    expect(connection.snapshot.identity?.key).not.toBe(firstKey);
    expect(connection.snapshot.label).toBe('');
  });

  it('같은 포트를 속도만 바꿔 다시 열면 이름표가 그대로 남는다', async () => {
    const { connection } = setup();
    await connection.connect();
    connection.setLabel('변환기');
    await connection.setBaudRate(9600);
    expect(connection.snapshot.baudRate).toBe(9600);
    expect(connection.snapshot.label).toBe('변환기');
  });

  it('기록 지우기는 쌓인 바이트만 지운다(연결은 그대로)', async () => {
    const { connection } = setup();
    await connection.connect();
    await connection.write(new TextEncoder().encode('a\n'));
    await settle();
    connection.clearLog();
    expect(connection.snapshot.received).toBe(0);
    expect(connection.snapshot.rx.text).toBe('');
    expect(connection.snapshot.state).toBe('open');
  });
});
