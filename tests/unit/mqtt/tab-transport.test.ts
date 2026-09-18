// 같은 컴퓨터 탭 MQTT 통로(PD-17) 단위 테스트 — 구역 D(P4-06).
// 학교망이 막아도 되는 길이라 이 통로가 규칙대로 도는지 먼저 굳혀 둔다.
import { describe, expect, it } from 'vitest';
import { flush, FakeBroadcastHub } from '../bridge/helpers/fake.ts';
import { openTabTransport, parseTabEnvelope, tabMqttChannelName, toBytes, type MqttIncoming } from '../../../src/lab/mqtt/index.ts';

const PREFIX = '7kq2m9xd4hpt';

function collect(): { got: MqttIncoming[]; listener: (message: MqttIncoming) => void } {
  const got: MqttIncoming[] = [];
  return { got, listener: (message) => got.push(message) };
}

describe('탭 통로 채널 이름', () => {
  it('사이트 이름 + mqtt + 접두어(브릿지의 탭 통로와 섞이지 않는다)', () => {
    expect(tabMqttChannelName(PREFIX)).toBe(`ai-physical-computing:mqtt:${PREFIX}`);
  });
});

describe('탭끼리 토픽으로 주고받기', () => {
  it('한 탭이 보내면 같은 토픽을 받기로 한 다른 탭에 온다', async () => {
    const hub = new FakeBroadcastHub();
    const sender = openTabTransport({ prefix: PREFIX, factory: hub.factory, defer: (run) => run() });
    const receiver = openTabTransport({ prefix: PREFIX, factory: hub.factory, defer: (run) => run() });
    const seen = collect();
    receiver.on('message', seen.listener);
    await receiver.subscribe(`${PREFIX}/led`);

    await sender.publish(`${PREFIX}/led`, toBytes('on'));
    await flush();

    expect(seen.got).toHaveLength(1);
    expect(seen.got[0]?.topic).toBe(`${PREFIX}/led`);
    expect(new TextDecoder().decode(seen.got[0]?.bytes)).toBe('on');
  });

  it('받기로 하지 않은 토픽은 오지 않는다', async () => {
    const hub = new FakeBroadcastHub();
    const sender = openTabTransport({ prefix: PREFIX, factory: hub.factory });
    const receiver = openTabTransport({ prefix: PREFIX, factory: hub.factory });
    const seen = collect();
    receiver.on('message', seen.listener);
    await receiver.subscribe(`${PREFIX}/led`);

    await sender.publish(`${PREFIX}/buzzer`, toBytes('1'));
    await flush();

    expect(seen.got).toHaveLength(0);
  });

  it('와일드카드(#)로 접두어 아래 전체를 받는다', async () => {
    const hub = new FakeBroadcastHub();
    const sender = openTabTransport({ prefix: PREFIX, factory: hub.factory });
    const receiver = openTabTransport({ prefix: PREFIX, factory: hub.factory });
    const seen = collect();
    receiver.on('message', seen.listener);
    await receiver.subscribe(`${PREFIX}/#`);

    await sender.publish(`${PREFIX}/esp32-01/rx`, toBytes('a'));
    await sender.publish(`${PREFIX}/dash/gauge`, toBytes('12'));
    await flush();

    expect(seen.got.map((message) => message.topic)).toEqual([`${PREFIX}/esp32-01/rx`, `${PREFIX}/dash/gauge`]);
  });

  it('중계 서버처럼 보낸 탭도 자기 메시지를 받는다(한 탭에서 해 보는 첫 실습)', async () => {
    const hub = new FakeBroadcastHub();
    const transport = openTabTransport({ prefix: PREFIX, factory: hub.factory, defer: (run) => run() });
    const seen = collect();
    transport.on('message', seen.listener);
    await transport.subscribe(`${PREFIX}/led`);

    await transport.publish(`${PREFIX}/led`, toBytes('on'));
    await flush();

    expect(seen.got).toHaveLength(1);
  });

  it('접두어가 다르면 통하지 않는다(다른 반과 섞이지 않게)', async () => {
    const hub = new FakeBroadcastHub();
    const sender = openTabTransport({ prefix: PREFIX, factory: hub.factory });
    const receiver = openTabTransport({ prefix: 'abcdefghjkmn', factory: hub.factory });
    const seen = collect();
    receiver.on('message', seen.listener);
    await receiver.subscribe('#');

    await sender.publish(`${PREFIX}/led`, toBytes('on'));
    await flush();

    expect(seen.got).toHaveLength(0);
  });

  it('닫으면 알리고, 더는 보내지 못한다', async () => {
    const hub = new FakeBroadcastHub();
    const transport = openTabTransport({ prefix: PREFIX, factory: hub.factory });
    const reasons: string[] = [];
    transport.on('close', (reason) => reasons.push(reason));

    transport.close('시험으로 닫음');
    expect(reasons).toEqual(['시험으로 닫음']);
    expect(transport.connected).toBe(false);
    await expect(transport.publish(`${PREFIX}/led`, toBytes('on'))).rejects.toThrow(/연결/u);
  });
});

describe('받은 봉투 검사(밖에서 온 값은 믿지 않는다)', () => {
  it('모양이 다른 값은 버린다', () => {
    expect(parseTabEnvelope(null)).toBeNull();
    expect(parseTabEnvelope({ v: 2, type: 'mqtt.publish', topic: 'a', bytes: new Uint8Array(0) })).toBeNull();
    expect(parseTabEnvelope({ v: 1, type: 'other', topic: 'a', bytes: new Uint8Array(0) })).toBeNull();
    expect(parseTabEnvelope({ v: 1, type: 'mqtt.publish', topic: '', bytes: new Uint8Array(0) })).toBeNull();
    expect(parseTabEnvelope({ v: 1, type: 'mqtt.publish', topic: 'a', bytes: 'on' })).toBeNull();
  });

  it('바른 봉투는 그대로 읽는다', () => {
    const parsed = parseTabEnvelope({ v: 1, type: 'mqtt.publish', topic: 'a/b', bytes: toBytes('on'), from: 'tab-1', at: 5 });
    expect(parsed?.topic).toBe('a/b');
    expect(parsed?.from).toBe('tab-1');
    expect(parsed?.at).toBe(5);
  });
});
