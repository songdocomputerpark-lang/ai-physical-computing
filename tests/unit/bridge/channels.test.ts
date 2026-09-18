/**
 * 통로 세 가지 자리(P4-01 임무 1): ① 같은 컴퓨터 탭(BroadcastChannel, PD-17) ② 같은 탭 직접 연결
 * ③ 나중에 MQTT·BLE·Web Serial이 끼워질 등록표. 통로가 달라도 보내기·받기·닫기·"누가 보냈는지"가 같다.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  BRIDGE_DATA_TYPE,
  BRIDGE_HELLO_TYPE,
  BridgeClosedError,
  BridgeNoPeerError,
  TAB_UART_DATA_TYPE,
  clearBridgeChannels,
  createDirectHub,
  createDirectPair,
  createTabChannel,
  getBridgeChannelFactory,
  listBridgeChannels,
  openBridgeChannel,
  parseEnvelope,
  registerBridgeChannel,
  registerBuiltinChannels,
  type BridgeChannel,
  type BridgeEnvelope,
} from '../../../src/lab/bridge/index.ts';
import { FakeBroadcastHub, FakeScheduler, bytes, flush, textOf } from './helpers/fake.ts';

function collect(channel: BridgeChannel): BridgeEnvelope[] {
  const got: BridgeEnvelope[] = [];
  channel.on('message', (envelope) => got.push(envelope));
  return got;
}

describe('통로 약속 — 세 구현이 같게 움직인다', () => {
  it('같은 탭 직접 연결: 보낸 바이트와 "누가 보냈는지"가 그대로 간다', async () => {
    const [pc, board] = createDirectPair({ a: 'pc', b: 'board' });
    const got = collect(board);

    await pc.send(bytes('a\n'));
    expect(got).toHaveLength(1);
    expect(textOf(got[0]?.bytes ?? new Uint8Array())).toBe('a\n');
    expect(got[0]?.from).toBe('pc');
    expect(got[0]?.type).toBe(BRIDGE_DATA_TYPE);
    expect(pc.peers).toEqual(['board']);
  });

  it('같은 탭 직접 연결: 보낸 쪽에는 돌아오지 않는다', async () => {
    const [pc, board] = createDirectPair({ a: 'pc', b: 'board' });
    const mine = collect(pc);
    const theirs = collect(board);
    await pc.send(bytes('a'));
    expect(mine).toHaveLength(0);
    expect(theirs).toHaveLength(1);
  });

  it('같은 탭 직접 연결: 받을 쪽을 적으면 그 쪽만 받는다', async () => {
    const hub = createDirectHub();
    const pc = hub.join('pc');
    const board = hub.join('board');
    const dash = hub.join('dash');
    const toBoard = collect(board);
    const toDash = collect(dash);
    await pc.send(bytes('a'), { to: 'board' });
    expect(toBoard).toHaveLength(1);
    expect(toDash).toHaveLength(0);
  });

  it('닫은 통로로 보내면 한국어 오류가 난다', async () => {
    const [pc] = createDirectPair({ a: 'pc', b: 'board' });
    pc.close();
    await expect(pc.send(bytes('a'))).rejects.toThrow(BridgeClosedError);
    await expect(pc.send(bytes('a'))).rejects.toThrow(/닫혀 있어서/u);
  });

  it('상대가 없을 때 오류를 내게 할 수 있다(P4-02의 serial 흉내가 쓴다)', async () => {
    const hub = createDirectHub({ requirePeer: true });
    const alone = hub.join('pc');
    await expect(alone.send(bytes('a'))).rejects.toThrow(BridgeNoPeerError);
    await expect(alone.send(bytes('a'))).rejects.toThrow(/ESP32 실습실/u);
  });
});

describe('같은 컴퓨터 탭 통로(PD-17)', () => {
  it('같은 접두어의 다른 탭에 바이트가 간다', async () => {
    const hub = new FakeBroadcastHub();
    const clock = new FakeScheduler();
    const pc = createTabChannel({ from: 'pc', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: clock });
    const board = createTabChannel({ from: 'board', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: clock });
    const got = collect(board);
    await flush();

    await pc.send(bytes('355,152\n'));
    await flush();
    expect(textOf(got[0]?.bytes ?? new Uint8Array())).toBe('355,152\n');
    expect(got[0]?.from).toBe('pc');
    pc.close();
    board.close();
  });

  it('접두어가 다르면 통하지 않는다', async () => {
    const hub = new FakeBroadcastHub();
    const clock = new FakeScheduler();
    const pc = createTabChannel({ from: 'pc', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: clock, requirePeer: false });
    const board = createTabChannel({ from: 'board', prefix: 'npqrstuvwxyz', factory: hub.factory, scheduler: clock });
    const got = collect(board);
    await flush();
    await pc.send(bytes('a'));
    await flush();
    expect(got).toHaveLength(0);
    pc.close();
    board.close();
  });

  it('인사를 주고받아 상대가 있는지 안다', async () => {
    const hub = new FakeBroadcastHub();
    const clock = new FakeScheduler();
    const pc = createTabChannel({ from: 'pc', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: clock });
    expect(pc.peers).toEqual([]);

    const board = createTabChannel({ from: 'board', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: clock });
    await flush();
    expect(pc.peers).toEqual(['board']);
    expect(board.peers).toEqual(['pc']);
    // 인사 봉투에는 바이트가 실리지 않는다(개인정보·내용이 인사에 섞이지 않게)
    const hello = hub.log.map((item) => parseEnvelope(item.data)).find((envelope) => envelope?.type === BRIDGE_HELLO_TYPE);
    expect(hello?.bytes.length).toBe(0);
    pc.close();
    board.close();
  });

  it('상대가 닫으면 목록에서 빠지고, 보내기가 한국어 오류를 낸다', async () => {
    const hub = new FakeBroadcastHub();
    const clock = new FakeScheduler();
    const pc = createTabChannel({ from: 'pc', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: clock, discoveryMs: 200 });
    const board = createTabChannel({ from: 'board', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: clock });
    await flush();
    expect(pc.peers).toEqual(['board']);

    board.close();
    await flush();
    expect(pc.peers).toEqual([]);

    const sending = pc.send(bytes('a'));
    await clock.advance(200);
    await expect(sending).rejects.toThrow(BridgeNoPeerError);
    pc.close();
  });

  it('소식이 없으면 상대 목록에서 빠진다(탭을 그냥 닫았을 때)', async () => {
    const hub = new FakeBroadcastHub();
    const clock = new FakeScheduler();
    const pc = createTabChannel({ from: 'pc', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: clock, peerTimeoutMs: 1000 });
    const board = createTabChannel({ from: 'board', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: clock, heartbeatMs: 100_000 });
    await flush();
    expect(pc.peers).toEqual(['board']);
    await clock.advance(2000);
    expect(pc.peers).toEqual([]);
    pc.close();
    board.close();
  });

  it('막 열린 탭이 답할 시간을 기다린 뒤에 보낸다', async () => {
    const hub = new FakeBroadcastHub();
    const clock = new FakeScheduler();
    const pc = createTabChannel({ from: 'pc', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: clock, discoveryMs: 500 });
    const sending = pc.send(bytes('a'));

    // 보내는 도중에 ESP32 실습실 탭이 열린다
    const board = createTabChannel({ from: 'board', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: clock });
    const got = collect(board);
    await clock.advance(100);
    await expect(sending).resolves.toBeUndefined();
    await flush();
    expect(textOf(got[0]?.bytes ?? new Uint8Array())).toBe('a');
    pc.close();
    board.close();
  });

  it('봉투 type·포트 이름표·속도를 그대로 싣는다(PLAN §8.4 설계 메모 ②)', async () => {
    const hub = new FakeBroadcastHub();
    const clock = new FakeScheduler();
    const pc = createTabChannel({
      from: 'pc',
      prefix: 'abcdefghijkm',
      type: TAB_UART_DATA_TYPE,
      factory: hub.factory,
      scheduler: clock,
    });
    const board = createTabChannel({ from: 'board', prefix: 'abcdefghijkm', type: TAB_UART_DATA_TYPE, factory: hub.factory, scheduler: clock });
    const got = collect(board);
    await flush();
    await pc.send(bytes('a'), { port: 'usb-uart', baud: 115200 });
    await flush();
    expect(got[0]).toMatchObject({ type: 'uart.data', from: 'pc', port: 'usb-uart', baud: 115200 });
    pc.close();
    board.close();
  });

  it('깨진 봉투는 버린다', async () => {
    const hub = new FakeBroadcastHub();
    const clock = new FakeScheduler();
    const board = createTabChannel({ from: 'board', prefix: 'abcdefghijkm', factory: hub.factory, scheduler: clock });
    const got = collect(board);
    const stranger = hub.create('ai-physical-computing:bridge:abcdefghijkm');
    stranger.postMessage({ hello: 'world' });
    stranger.postMessage(null);
    await flush();
    expect(got).toHaveLength(0);
    board.close();
  });
});

describe('통로 등록표 — 나중에 MQTT·BLE·Web Serial이 끼워질 자리', () => {
  afterEach(() => {
    clearBridgeChannels();
  });

  it('붙박이 통로 둘이 등록된다', () => {
    clearBridgeChannels();
    registerBuiltinChannels();
    expect(listBridgeChannels().map((factory) => factory.id)).toEqual(['direct', 'tab']);
    expect(getBridgeChannelFactory('tab')?.notice).toContain('컴퓨터 밖으로 나가지 않아요');
  });

  it('새 통로를 등록하고 id로 연다', async () => {
    clearBridgeChannels();
    const [near] = createDirectPair({ a: 'pc', b: 'board' });
    registerBridgeChannel({
      id: 'mqtt',
      label: '공개 브로커(MQTT)',
      notice: '이 통신은 누구나 보고, 누구나 보낼 수도 있어요.',
      available: () => true,
      open: () => Promise.resolve(near),
    });
    const channel = await openBridgeChannel('mqtt', { from: 'pc' });
    expect(channel.from).toBe('pc');
  });

  it('같은 id를 두 번 등록하면 오류다', () => {
    clearBridgeChannels();
    const factory = { id: 'ble', label: 'BLE', available: () => true, open: () => Promise.reject(new Error('x')) };
    registerBridgeChannel(factory);
    expect(() => registerBridgeChannel(factory)).toThrow(/이미 등록/u);
  });

  it('없는 id로 열면 등록된 목록을 알려 준다', async () => {
    clearBridgeChannels();
    registerBuiltinChannels();
    await expect(openBridgeChannel('mqtt', { from: 'pc' })).rejects.toThrow(/direct, tab/u);
  });

  it('쓸 수 없는 통로는 목록에서 뺄 수 있다', () => {
    clearBridgeChannels();
    registerBridgeChannel({ id: 'serial', label: 'USB 시리얼', available: () => false, open: () => Promise.reject(new Error('x')) });
    expect(listBridgeChannels(true)).toHaveLength(0);
    expect(listBridgeChannels()).toHaveLength(1);
  });

  it('같은 접두어로 연 직접 연결끼리 이어진다', async () => {
    clearBridgeChannels();
    registerBuiltinChannels();
    const pc = await openBridgeChannel('direct', { from: 'pc', prefix: 'one' });
    const board = await openBridgeChannel('direct', { from: 'board', prefix: 'one' });
    const other = await openBridgeChannel('direct', { from: 'board', prefix: 'two' });
    const got = collect(board);
    const none = collect(other);
    await pc.send(bytes('a'));
    expect(got).toHaveLength(1);
    expect(none).toHaveLength(0);
  });
});
