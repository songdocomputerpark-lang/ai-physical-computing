// 블루투스 브릿지 통로 — src/lab/ble/channel.ts (P4-01 규약 9.6 "새 통로 더하기", PLAN §7.2 규칙 6·§7.7).
import { afterEach, describe, expect, it } from 'vitest';
import { BLE_CHANNEL_ID, BleConnection, createBleChannel, longValueNotice, registerBleChannel } from '../../../src/lab/ble/index.ts';
import { createMockBluetooth, type MockBluetooth } from '../../../src/lab/ble/mock/index.ts';
import { BridgeClosedError, clearBridgeChannels, getBridgeChannelFactory, listBridgeChannels, openBridgeChannel } from '../../../src/lab/bridge/index.ts';
import type { BridgeEnvelope } from '../../../src/lab/bridge/index.ts';

async function openConnection(config: Parameters<typeof createMockBluetooth>[0] = { devices: [{ name: 'ESP32-07' }] }): Promise<{
  bluetooth: MockBluetooth;
  connection: BleConnection;
}> {
  const bluetooth = createMockBluetooth(config);
  const connection = new BleConnection({ bluetooth: bluetooth as unknown as Bluetooth });
  await connection.connect();
  return { bluetooth, connection };
}

afterEach(() => {
  clearBridgeChannels();
});

describe('통로 등록', () => {
  it('등록표 파일을 고치지 않고 id "ble"로 끼운다', () => {
    const bluetooth = createMockBluetooth();
    const connection = new BleConnection({ bluetooth: bluetooth as unknown as Bluetooth });
    registerBleChannel(() => connection);
    const factory = getBridgeChannelFactory(BLE_CHANNEL_ID);
    expect(factory?.id).toBe('ble');
    expect(factory?.label).toContain('블루투스');
    expect(factory?.notice).toContain('20바이트');
    expect(factory?.available()).toBe(true);
  });

  it('Web Bluetooth가 없는 브라우저에서는 고를 수 없는 통로다', () => {
    const connection = new BleConnection({ bluetooth: null });
    registerBleChannel(() => connection);
    expect(getBridgeChannelFactory(BLE_CHANNEL_ID)?.available()).toBe(false);
    expect(listBridgeChannels(true).some((item) => item.id === BLE_CHANNEL_ID)).toBe(false);
  });

  it('두 번 등록해도 오류가 나지 않는다(모듈이 다시 mount돼도 안전)', () => {
    const connection = new BleConnection({ bluetooth: createMockBluetooth() as unknown as Bluetooth });
    registerBleChannel(() => connection);
    expect(() => registerBleChannel(() => connection)).not.toThrow();
  });
});

describe('통로로 주고받기', () => {
  it('보낸 바이트가 그대로 보드에 닿는다', async () => {
    const { bluetooth, connection } = await openConnection();
    registerBleChannel(() => connection);
    const channel = await openBridgeChannel(BLE_CHANNEL_ID, { from: 'pc' });
    await channel.send(new TextEncoder().encode('355,152\n'));
    expect(new TextDecoder().decode(Uint8Array.from(bluetooth.first.written[0] ?? []))).toBe('355,152\n');
    channel.close();
  });

  it('보드가 보낸 값이 봉투로 온다(from은 board)', async () => {
    const { bluetooth, connection } = await openConnection();
    registerBleChannel(() => connection);
    const channel = await openBridgeChannel(BLE_CHANNEL_ID, { from: 'pc' });
    const got: BridgeEnvelope[] = [];
    channel.on('message', (envelope) => got.push(envelope));
    bluetooth.first.notifyText('COUNT,3\n');
    expect(got).toHaveLength(1);
    expect(got[0]?.from).toBe('board');
    expect(new TextDecoder().decode(got[0]?.bytes)).toBe('COUNT,3\n');
    channel.close();
  });

  it('아직 연결하지 않았으면 한국어 오류로 멈춘다', async () => {
    const bluetooth = createMockBluetooth();
    const connection = new BleConnection({ bluetooth: bluetooth as unknown as Bluetooth });
    registerBleChannel(() => connection);
    const channel = await openBridgeChannel(BLE_CHANNEL_ID, { from: 'pc' });
    await expect(channel.send(new TextEncoder().encode('a'))).rejects.toBeInstanceOf(BridgeClosedError);
    await expect(channel.send(new TextEncoder().encode('a'))).rejects.toThrow('연결을 다시 해 보세요');
    channel.close();
  });

  it('이어져 있으면 상대를 board 하나로 알린다(블루투스는 한 번에 한 곳)', async () => {
    const { bluetooth, connection } = await openConnection();
    registerBleChannel(() => connection);
    const channel = await openBridgeChannel(BLE_CHANNEL_ID, { from: 'pc' });
    expect(channel.knowsPeers).toBe(true);
    expect(channel.peers).toEqual(['board']);
    const peerChanges: (readonly string[])[] = [];
    channel.on('peers', (peers) => peerChanges.push(peers));
    bluetooth.first.drop();
    expect(peerChanges.at(-1)).toEqual([]);
    channel.close();
  });

  it('통로를 닫아도 블루투스 연결은 살아 있다(화면의 [연결 끊기]가 끊는다)', async () => {
    const { bluetooth, connection } = await openConnection();
    const channel = createBleChannel(connection, { from: 'pc' });
    channel.close('시험');
    expect(channel.state).toBe('closed');
    expect(connection.isOpen).toBe(true);
    expect(bluetooth.first.gatt.connected).toBe(true);
  });

  it('닫은 통로에는 봉투가 오지 않는다', async () => {
    const { bluetooth, connection } = await openConnection();
    const channel = createBleChannel(connection, { from: 'pc' });
    const got: BridgeEnvelope[] = [];
    channel.on('message', (envelope) => got.push(envelope));
    channel.close();
    bluetooth.first.notifyText('x\n');
    expect(got).toEqual([]);
  });
});

describe('20바이트 안내(§7.7)', () => {
  it('넘으면 브릿지와 같은 문장으로 알리고, 넘지 않으면 아무 말도 하지 않는다', () => {
    expect(longValueNotice('a', 1)).toBeNull();
    const notice = longValueNotice('ABCDEFGHIJKLMNOPQRSTUV', 22);
    expect(notice).toContain('22바이트');
    expect(notice).toContain('20바이트');
  });

  it('통로는 자르지 않고 그대로 보낸다 — 자르는 쪽은 실물 보드다', async () => {
    const { bluetooth, connection } = await openConnection();
    registerBleChannel(() => connection);
    const channel = await openBridgeChannel(BLE_CHANNEL_ID, { from: 'pc' });
    await channel.send(new TextEncoder().encode('ABCDEFGHIJKLMNOPQRSTUVWXYZ'));
    expect(bluetooth.first.written[0]).toHaveLength(26);
    expect(bluetooth.first.received[0]).toHaveLength(20);
    channel.close();
  });
});
