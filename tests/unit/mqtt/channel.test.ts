// 브릿지 통로 'mqtt'(src/lab/README.md 9.6) 단위 테스트 — 구역 D(P4-06).
// 지키는 것: ① 등록표를 고치지 않고 끼워진다 ② 보드 쪽은 rx를 받고 tx로 보낸다(PLAN §7.4) ③ 같은 글자 한 줄이
// 브릿지 규칙 그대로 오간다 ④ 공개 브로커 경고가 통로에 붙어 있다(PD-29).
import { beforeEach, describe, expect, it } from 'vitest';
import { flush, FakeBroadcastHub } from '../bridge/helpers/fake.ts';
import { clearBridgeChannels, createBridge, listBridgeChannels, openBridgeChannel, type BridgeEnvelope } from '../../../src/lab/bridge/index.ts';
import { envelopeTextOf, forgetMqttChannelRegistration, MqttConnection, openTabTransport, registerMqttChannel, type MqttTransport, type TabMqttTransportOptions } from '../../../src/lab/mqtt/index.ts';

const PREFIX = '7kq2m9xd4hpt';
const DEVICE = 'esp32-07';

function tabOpener(hub: FakeBroadcastHub): (options: TabMqttTransportOptions) => MqttTransport {
  return (options) => openTabTransport({ ...options, factory: hub.factory, defer: (run) => run() });
}

function connectionOn(hub: FakeBroadcastHub): MqttConnection {
  return new MqttConnection({ prefix: PREFIX, mode: 'tab', openTab: tabOpener(hub) });
}

beforeEach(() => {
  clearBridgeChannels();
  forgetMqttChannelRegistration();
});

describe('통로 등록', () => {
  it('registerBridgeChannel로 끼워지고 공개 브로커 경고가 붙는다', () => {
    registerMqttChannel();
    const found = listBridgeChannels().find((factory) => factory.id === 'mqtt');
    expect(found).toBeDefined();
    expect(found?.notice).toContain('누구나 보고, 누구나 보낼 수도 있어요');
    expect(found?.available()).toBe(true);
  });

  it('두 번 불러도 오류가 나지 않는다', () => {
    registerMqttChannel();
    expect(() => registerMqttChannel()).not.toThrow();
  });
});

describe('토픽 방향(PLAN §7.4)', () => {
  it('보드 쪽은 <접두어>/<보드>/rx를 받고 tx로 보낸다', async () => {
    const hub = new FakeBroadcastHub();
    registerMqttChannel();
    const boardConnection = connectionOn(hub);
    const channel = await openBridgeChannel('mqtt', { from: 'board', prefix: PREFIX, extra: { connection: boardConnection, device: DEVICE } });
    const pcConnection = connectionOn(hub);
    await pcConnection.connect();
    const got: string[] = [];
    pcConnection.on('message', (message) => got.push(`${message.topic}=${new TextDecoder().decode(message.bytes)}`));
    await pcConnection.subscribe(`${PREFIX}/${DEVICE}/tx`);

    await channel.send(new TextEncoder().encode('hello\n'));
    await flush();

    expect(got).toEqual([`${PREFIX}/${DEVICE}/tx=hello\n`]);
    expect(boardConnection.topics).toContain(`${PREFIX}/${DEVICE}/rx`);
  });

  it('컴퓨터 쪽은 반대로 rx로 보내고 tx를 받는다', async () => {
    const hub = new FakeBroadcastHub();
    registerMqttChannel();
    const pcConnection = connectionOn(hub);
    const channel = await openBridgeChannel('mqtt', { from: 'pc', prefix: PREFIX, extra: { connection: pcConnection, device: DEVICE } });
    const boardConnection = connectionOn(hub);
    await boardConnection.connect();
    const got: string[] = [];
    boardConnection.on('message', (message) => got.push(message.topic));
    await boardConnection.subscribe(`${PREFIX}/${DEVICE}/rx`);

    await channel.send(new TextEncoder().encode('a\n'));
    await flush();

    expect(got).toEqual([`${PREFIX}/${DEVICE}/rx`]);
    expect(pcConnection.topics).toContain(`${PREFIX}/${DEVICE}/tx`);
  });
});

describe('브릿지 메시지가 오간다', () => {
  it('컴퓨터가 보낸 한 줄을 보드 쪽 브릿지가 받는다(§7.2 규칙 2 끝 문자)', async () => {
    const hub = new FakeBroadcastHub();
    registerMqttChannel();
    const pcChannel = await openBridgeChannel('mqtt', { from: 'pc', prefix: PREFIX, extra: { connection: connectionOn(hub), device: DEVICE } });
    const boardChannel = await openBridgeChannel('mqtt', { from: 'board', prefix: PREFIX, extra: { connection: connectionOn(hub), device: DEVICE } });
    const envelopes: BridgeEnvelope[] = [];
    boardChannel.on('message', (envelope) => envelopes.push(envelope));

    const pcBridge = createBridge(pcChannel, { minIntervalMs: 0 });
    pcBridge.send('355,152');
    await flush(20);

    expect(envelopes).toHaveLength(1);
    expect(envelopeTextOf(envelopes[0]!)).toBe('355,152\n');
    expect(envelopes[0]?.from).toBe('pc');
  });

  it('상대가 있는지 알 수 없는 통로라 "받을 쪽 없음" 오류를 내지 않는다', async () => {
    const hub = new FakeBroadcastHub();
    registerMqttChannel();
    const channel = await openBridgeChannel('mqtt', { from: 'pc', prefix: PREFIX, extra: { connection: connectionOn(hub), device: DEVICE } });
    expect(channel.knowsPeers).toBe(false);
    expect(channel.peers).toEqual([]);
    await expect(channel.send(new TextEncoder().encode('a\n'))).resolves.toBeUndefined();
  });
});

describe('닫기', () => {
  it('연결이 닫히면 통로도 닫히고 보내기가 한국어 오류를 낸다', async () => {
    const hub = new FakeBroadcastHub();
    registerMqttChannel();
    const connection = connectionOn(hub);
    const channel = await openBridgeChannel('mqtt', { from: 'board', prefix: PREFIX, extra: { connection, device: DEVICE } });
    expect(channel.state).toBe('open');

    connection.close('시험으로 닫음');

    expect(channel.state).toBe('closed');
    await expect(channel.send(new TextEncoder().encode('a\n'))).rejects.toThrow(/닫혀 있어서/u);
  });

  it('통로를 닫아도 연결은 살아 있다(패널·파이썬이 함께 쓰는 연결)', async () => {
    const hub = new FakeBroadcastHub();
    registerMqttChannel();
    const connection = connectionOn(hub);
    const channel = await openBridgeChannel('mqtt', { from: 'board', prefix: PREFIX, extra: { connection, device: DEVICE } });

    channel.close();

    expect(channel.state).toBe('closed');
    expect(connection.state).toBe('open');
  });
});
