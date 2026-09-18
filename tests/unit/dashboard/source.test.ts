// 대시보드 ↔ MQTT 통로 잇기(P4-07) — 구역 D 2차. 진짜 `MqttConnection`에 가짜 탭 통로를 끼워 확인한다.
// 지키는 것: ① 접두어 아래 전부를 한 번만 받기로 한다 ② **접두어를 바꾸면 기억을 비우고 다시 받기로 한다**
// (안 그러면 옛 접두어가 한 번 더 붙어 아무 값도 오지 않는다) ③ 보낼 때 접두어는 통로가 붙인다(학생 코드는 짧은 토픽).
import { describe, expect, it } from 'vitest';
import { FakeBroadcastHub, flush } from '../bridge/helpers/fake.ts';
import { MqttConnection, openTabTransport, type MqttTransport, type TabMqttTransportOptions } from '../../../src/lab/mqtt/index.ts';
import { createTabChannel } from '../../../src/lab/bridge/index.ts';
import { bridgeLinesOf, bridgeTopicOf, createMqttSource, decodeText, listenBridge } from '../../../src/lab/dashboard/source.ts';
import type { SourceMessage } from '../../../src/lab/dashboard/types.ts';

const PREFIX = '7kq2m9xd4hpt';
const OTHER = 'mqttfriend34';

function tabOpener(hub: FakeBroadcastHub): (options: TabMqttTransportOptions) => MqttTransport {
  return (options) => openTabTransport({ ...options, factory: hub.factory, defer: (run) => run() });
}

async function connected(hub: FakeBroadcastHub, prefix = PREFIX): Promise<MqttConnection> {
  const connection = new MqttConnection({ prefix, mode: 'tab', openTab: tabOpener(hub) });
  await connection.connect();
  return connection;
}

describe('대시보드 통로', () => {
  it('접두어 아래 모든 토픽을 받고, 위젯에는 짧은 토픽으로 준다', async () => {
    const hub = new FakeBroadcastHub();
    const connection = await connected(hub);
    const source = createMqttSource(connection);
    const got: SourceMessage[] = [];
    source.onMessage((message) => got.push(message));
    await source.listen();

    // 다른 탭(보드)이 보낸 것처럼 흉내 낸다.
    const board = await connected(hub);
    await board.publish('esp32-01/tx', new TextEncoder().encode('42'));
    await flush();

    expect(got).toHaveLength(1);
    expect(got[0]?.topic).toBe('esp32-01/tx');
    expect(got[0]?.text).toBe('42');
  });

  it('접두어를 바꾸면 새 접두어로 다시 받기로 한다(옛 접두어가 겹쳐 붙지 않는다)', async () => {
    const hub = new FakeBroadcastHub();
    const connection = await connected(hub);
    const source = createMqttSource(connection);
    const got: SourceMessage[] = [];
    source.onMessage((message) => got.push(message));
    await source.listen();

    connection.update({ prefix: OTHER });
    await connection.connect();
    await source.listen();
    expect(connection.topics).toEqual([`${OTHER}/#`]);

    const friend = await connected(hub, OTHER);
    await friend.publish('esp32-01/tx', new TextEncoder().encode('7'));
    await flush();
    expect(got.map((message) => message.text)).toEqual(['7']);
  });

  it('보낼 때 접두어는 통로가 붙인다(학생 코드와 같은 짧은 토픽)', async () => {
    const hub = new FakeBroadcastHub();
    const connection = await connected(hub);
    const source = createMqttSource(connection);
    const board = await connected(hub);
    const seen: string[] = [];
    board.on('message', (message) => seen.push(message.topic));
    await board.subscribe('esp32-01/rx');

    await source.send('esp32-01/rx', 'on');
    await flush();
    expect(seen).toEqual([`${PREFIX}/esp32-01/rx`]);
    expect(source.prefix).toBe(PREFIX);
    expect(source.state).toBe('open');
  });

  it('글자로 읽을 수 없는 바이트는 16진수로 보여 준다(로그가 깨지지 않게)', () => {
    expect(decodeText(new Uint8Array([0x7e, 0xff, 0x06]))).toBe('7e ff 06');
    expect(decodeText(new TextEncoder().encode('안녕\n'))).toBe('안녕');
  });
});

describe('브릿지(P4-01)로 온 값', () => {
  it('보낸 쪽 이름이 토픽이 된다(bridge/pc·bridge/board)', () => {
    expect(bridgeTopicOf('pc')).toBe('bridge/pc');
    expect(bridgeTopicOf('board')).toBe('bridge/board');
    expect(bridgeTopicOf('')).toBe('bridge/unknown');
    expect(bridgeTopicOf('내 컴퓨터')).toMatch(/^bridge\/[a-z0-9-]+$/u);
  });

  it('봉투 하나에서 줄을 꺼낸다(끝 문자가 있든 없든, 여러 줄이 한꺼번에 와도)', () => {
    const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
    expect(bridgeLinesOf(encode('3\n'))).toEqual(['3']);
    expect(bridgeLinesOf(encode('355,152'))).toEqual(['355,152']);
    expect(bridgeLinesOf(encode('a\r\nb\n'))).toEqual(['a', 'b']);
    expect(bridgeLinesOf(encode('\n\n'))).toEqual([]);
  });

  it('브릿지 통로에서 온 글이 대시보드 메시지가 된다', async () => {
    const hub = new FakeBroadcastHub();
    const prefix = PREFIX;
    const dash = createTabChannel({ from: 'dash', prefix, factory: hub.factory, requirePeer: false });
    const pc = createTabChannel({ from: 'pc', prefix, factory: hub.factory, requirePeer: false });
    const got: SourceMessage[] = [];
    listenBridge(dash, (message) => got.push(message));
    await pc.send(new TextEncoder().encode('3\n'));
    await flush();
    expect(got).toHaveLength(1);
    expect(got[0]?.topic).toBe('bridge/pc');
    expect(got[0]?.text).toBe('3');
    dash.close();
    pc.close();
  });
});
