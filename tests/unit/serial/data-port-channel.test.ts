// 데이터 포트를 브릿지 통로로 끼운 것(P4-05 + P4-01 규약 9.6)을 모의 시리얼로 확인한다:
// 등록표에 id 'serial'로 들어가는지, 같은 글자가 변환기로 나가는지, 받은 바이트가 봉투로 오는지,
// 포트가 닫혀 있으면 한국어 BridgeClosed로 끝나는지.
import { afterEach, describe, expect, it } from 'vitest';
import {
  BridgeClosedError,
  clearBridgeChannels,
  createBridge,
  getBridgeChannelFactory,
  listBridgeChannels,
  openBridgeChannel,
  type BridgeEnvelope,
} from '../../../src/lab/bridge/index.ts';
import {
  DATA_PORT_CHANNEL_ID,
  DataPortConnection,
  UART_DATA_TYPE,
  createDataPortChannel,
  registerDataPortChannel,
} from '../../../src/lab/serial/data-port/index.ts';
import { EchoDevice, FakeSerial, MockSerialPort } from '../../../src/lab/serial/mock/index.ts';

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
  clearBridgeChannels();
});

function setup() {
  const converter = new MockSerialPort({ device: new EchoDevice(), label: 'converter' });
  const serial = new FakeSerial({ ports: [converter], requireUserActivation: false });
  const connection = new DataPortConnection({ serial });
  cleanups.push(() => connection.dispose());
  return { converter, serial, connection };
}

async function settle(times = 3): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('통로 등록(9.6 — 등록표 파일을 고치지 않는다)', () => {
  it('registerDataPortChannel로 id "serial"이 등록되고 목록에 이름·안내가 보인다', () => {
    const { connection } = setup();
    registerDataPortChannel(() => connection);
    const factory = getBridgeChannelFactory(DATA_PORT_CHANNEL_ID);
    expect(factory?.label).toBe('USB 데이터 포트');
    expect(factory?.notice).toContain('통신 속도가 같아야');
    expect(listBridgeChannels(true).map((item) => item.id)).toContain(DATA_PORT_CHANNEL_ID);
  });

  it('두 번 등록해도 오류를 내지 않는다(실습실을 두 번 열어도 안전하게)', () => {
    const { connection } = setup();
    registerDataPortChannel(() => connection);
    expect(() => registerDataPortChannel(() => connection)).not.toThrow();
    expect(listBridgeChannels().filter((item) => item.id === DATA_PORT_CHANNEL_ID)).toHaveLength(1);
  });

  it('연결 객체가 없으면 고를 수 없는 통로로 보인다', () => {
    registerDataPortChannel(() => null);
    expect(listBridgeChannels(true).map((item) => item.id)).not.toContain(DATA_PORT_CHANNEL_ID);
  });

  it('Web Serial이 없는 브라우저에서는 통로 목록에 나오지 않는다', () => {
    const connection = new DataPortConnection({ serial: null });
    cleanups.push(() => connection.dispose());
    registerDataPortChannel(() => connection);
    expect(listBridgeChannels(true).map((item) => item.id)).not.toContain(DATA_PORT_CHANNEL_ID);
    // 등록은 돼 있다(브라우저를 바꾸면 다시 보인다)
    expect(getBridgeChannelFactory(DATA_PORT_CHANNEL_ID)).not.toBeNull();
  });

  it('포트를 아직 열지 않아도 고를 수는 있다(통로를 고른 뒤에 [데이터 포트 연결]을 누른다)', () => {
    const { connection } = setup();
    registerDataPortChannel(() => connection);
    expect(connection.isOpen).toBe(false);
    expect(listBridgeChannels(true).map((item) => item.id)).toContain(DATA_PORT_CHANNEL_ID);
  });

  it('등록표로 열면 데이터 포트 통로가 나온다', async () => {
    const { connection } = setup();
    registerDataPortChannel(() => connection);
    const channel = await openBridgeChannel(DATA_PORT_CHANNEL_ID, { from: 'pc' });
    expect(channel.id).toBe('serial');
    expect(channel.from).toBe('pc');
    // 선 반대쪽에 누가 있는지는 알 수 없다
    expect(channel.knowsPeers).toBe(false);
    expect(channel.peers).toEqual([]);
    channel.close();
  });
});

describe('브릿지 메시지가 변환기로 오간다', () => {
  it('bridge.send()가 만든 한 줄이 포트로 그대로 나간다(끝 문자 포함)', async () => {
    const { converter, connection } = setup();
    await connection.connect();
    const channel = createDataPortChannel(connection, { from: 'pc' });
    const bridge = createBridge(channel);
    bridge.send('355,152');
    await settle();
    expect(converter.writtenText()).toBe('355,152\n');
    bridge.close();
  });

  it('원본 코드가 보낸 바이트는 한 바이트도 바뀌지 않는다(§7.2 규칙 8)', async () => {
    const { converter, connection } = setup();
    await connection.connect();
    const bridge = createBridge(createDataPortChannel(connection, { from: 'pc' }));
    bridge.sendBytes(new TextEncoder().encode('a'));
    await settle();
    expect(converter.writtenText()).toBe('a');
    bridge.close();
  });

  it('받은 바이트는 uart.data 봉투로 오고 한 줄로 꺼내진다', async () => {
    const { connection } = setup();
    await connection.connect();
    const channel = createDataPortChannel(connection, { from: 'pc' });
    const envelopes: BridgeEnvelope[] = [];
    channel.on('message', (envelope) => envelopes.push(envelope));
    const bridge = createBridge(channel);
    // 에코 장치라 보낸 것이 그대로 돌아온다(변환기 반대쪽 보드가 보낸 셈)
    bridge.sendBytes(new TextEncoder().encode('hello world\n'));
    await settle();
    expect(envelopes[0]?.type).toBe(UART_DATA_TYPE);
    expect(envelopes[0]?.from).toBe('board');
    expect(envelopes[0]?.to).toBe('pc');
    expect(envelopes[0]?.baud).toBe(115200);
    expect(bridge.receive()).toBe('hello world');
    bridge.close();
  });

  it('포트가 닫혀 있으면 한국어 BridgeClosed로 알린다', async () => {
    const { connection } = setup();
    const channel = createDataPortChannel(connection, { from: 'pc' });
    await expect(channel.send(new TextEncoder().encode('a'))).rejects.toBeInstanceOf(BridgeClosedError);
    await expect(channel.send(new TextEncoder().encode('a'))).rejects.toThrow('USB 데이터 포트');
    channel.close();
  });

  it('통로를 닫아도 포트는 열려 있다(시험 보내기·다른 통로가 아직 쓴다)', async () => {
    const { converter, connection } = setup();
    await connection.connect();
    const channel = createDataPortChannel(connection, { from: 'pc' });
    let closedReason = '';
    channel.on('close', (reason) => (closedReason = reason));
    channel.close('통로 바꿈');
    expect(closedReason).toBe('통로 바꿈');
    expect(channel.state).toBe('closed');
    expect(connection.isOpen).toBe(true);
    await connection.write(new TextEncoder().encode('x'));
    expect(converter.writtenText()).toBe('x');
  });

  it('통로를 닫으면 그 뒤에 온 바이트를 더 알리지 않는다', async () => {
    const { connection } = setup();
    await connection.connect();
    const channel = createDataPortChannel(connection, { from: 'pc' });
    const seen: BridgeEnvelope[] = [];
    channel.on('message', (envelope) => seen.push(envelope));
    await connection.write(new TextEncoder().encode('1'));
    await settle();
    const before = seen.length;
    channel.close();
    await connection.write(new TextEncoder().encode('2'));
    await settle();
    expect(seen).toHaveLength(before);
  });
});
