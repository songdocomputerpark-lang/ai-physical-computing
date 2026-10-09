// MQTT 연결(통로 고르기·접두어·거르기·기록) 단위 테스트 — 구역 D(P4-06).
// 지키는 것: ① 중계 서버가 안 되면 한국어 안내 + 같은 컴퓨터 탭으로 자동 전환(PD-17) ② 토픽에 접두어를 붙이고
// 받을 때 떼어 준다(PD-29) ③ 허용 목록 밖 메시지는 버린다(PD-29) ④ 접두어를 바꾸면 연결을 닫는다.
import { describe, expect, it, vi } from 'vitest';
import { flush, FakeBroadcastHub } from '../bridge/helpers/fake.ts';
import {
  MqttConnectError,
  MqttConnection,
  mqttText,
  openTabTransport,
  toBytes,
  type BrokerTransportOptions,
  type MqttReceived,
  type MqttTransport,
  type TabMqttTransportOptions,
} from '../../../src/lab/mqtt/index.ts';

const PREFIX = '7kq2m9xd4hpt';

/** 가짜 탭 통로(같은 hub를 나눠 쓰는 탭들) */
function tabOpener(hub: FakeBroadcastHub): (options: TabMqttTransportOptions) => MqttTransport {
  return (options) => openTabTransport({ ...options, factory: hub.factory, defer: (run) => run() });
}

function makeConnection(hub: FakeBroadcastHub, overrides: Partial<ConstructorParameters<typeof MqttConnection>[0]> = {}): MqttConnection {
  return new MqttConnection({ prefix: PREFIX, mode: 'tab', openTab: tabOpener(hub), ...overrides });
}

describe('통로 고르기', () => {
  it('기본(탭)은 인터넷 없이 바로 열린다', async () => {
    const hub = new FakeBroadcastHub();
    const connection = makeConnection(hub);
    const result = await connection.connect();
    expect(result.via).toBe('tab');
    expect(connection.state).toBe('open');
  });

  it('중계 서버에 연결되면 브로커 통로를 쓴다', async () => {
    const hub = new FakeBroadcastHub();
    const inner = openTabTransport({ prefix: PREFIX, factory: hub.factory });
    // 가짜 "중계 서버 통로": 안쪽은 탭 통로지만 via·where만 브로커처럼 보인다.
    const brokerLike: MqttTransport = {
      via: 'broker',
      where: 'wss://broker.example:8084/mqtt',
      get connected() {
        return inner.connected;
      },
      publish: (topic, bytes, options) => inner.publish(topic, bytes, options),
      subscribe: (filter) => inner.subscribe(filter),
      on: (event, listener) => inner.on(event, listener),
      close: (reason) => inner.close(reason),
    };
    const connection = makeConnection(hub, { mode: 'broker', openBroker: () => Promise.resolve(brokerLike) });
    const result = await connection.connect();
    expect(result.via).toBe('broker');
    expect(connection.where).toBe('wss://broker.example:8084/mqtt');
  });

  it('"중계 서버 먼저, 안 되면 탭"(auto)은 중계 서버가 안 되면 한국어로 알리고 같은 컴퓨터 탭으로 바꾼다(PD-17)', async () => {
    const hub = new FakeBroadcastHub();
    const notices: string[] = [];
    const connection = makeConnection(hub, {
      mode: 'auto',
      brokerUrl: 'wss://broker.example:8084/mqtt',
      openBroker: (_options: BrokerTransportOptions) => Promise.reject(new Error('중계 서버 wss://broker.example:8084/mqtt에 연결하지 못했어요(막힘).')),
    });
    connection.on('notice', (text) => notices.push(text));

    const result = await connection.connect();

    expect(result.via).toBe('tab');
    expect(notices.join('\n')).toContain('연결하지 못했어요');
    expect(notices.join('\n')).toContain('같은 컴퓨터 탭 통로로 바꿨어요');
    expect(notices.join('\n')).toContain('다른 컴퓨터와는 안 돼요');
    expect(connection.state).toBe('open');
  });

  // 판 1.1.1 최종 점검: 실패 한 번에 안내가 두 줄(까닭 줄 + 안내 줄)이었고 까닭에 영어 "(connack timeout)"이 보였다 → 한국어 까닭을 넣은 한 줄.
  it('중계 서버 실패 안내는 한 번에 한 줄이고, 짧은 한국어 까닭을 괄호로 넣는다(auto·broker 모두)', async () => {
    const url = 'wss://broker.example:8084/mqtt';
    const refuse = (_options: BrokerTransportOptions) =>
      Promise.reject(new MqttConnectError(mqttText.connectFailed(url, '서버가 답하지 않음'), '서버가 답하지 않음'));
    for (const mode of ['auto', 'broker'] as const) {
      const hub = new FakeBroadcastHub();
      const notices: string[] = [];
      const connection = makeConnection(hub, { mode, brokerUrl: url, openBroker: refuse });
      connection.on('notice', (text) => notices.push(text));
      if (mode === 'broker') {
        await expect(connection.connect()).rejects.toThrow(/공개 중계 서버 .*연결하지 못했어요\(서버가 답하지 않음\)/u);
      } else {
        await connection.connect();
      }
      const failures = notices.filter((text) => text.includes(url));
      expect(failures, mode).toHaveLength(1);
      expect(failures[0], mode).toContain('(서버가 답하지 않음)');
      expect(notices.join('\n'), mode).not.toMatch(/connack|timeout/iu);
    }
  });

  it('"공개 중계 서버"(broker)만 고르면 안 될 때 몰래 탭으로 바꾸지 않고 한국어로 실패를 알린다(2026-09-25 검토 반영)', async () => {
    const hub = new FakeBroadcastHub();
    const notices: string[] = [];
    const connection = makeConnection(hub, {
      mode: 'broker',
      brokerUrl: 'wss://broker.example:8084/mqtt',
      openBroker: (_options: BrokerTransportOptions) => Promise.reject(new Error('중계 서버 wss://broker.example:8084/mqtt에 연결하지 못했어요(막힘).')),
    });
    connection.on('notice', (text) => notices.push(text));

    await expect(connection.connect()).rejects.toThrow(/공개 중계 서버 .*연결하지 못했어요/u);
    expect(connection.state).toBe('closed');
    expect(connection.via).toBeNull();
    expect(notices.join('\n')).not.toContain('같은 컴퓨터 탭 통로로 바꿨어요');
    expect(notices.join('\n')).toContain('[같은 컴퓨터 탭]으로 바꾸고');
  });

  it('연결하지 않고 보내면 한국어 오류', async () => {
    const hub = new FakeBroadcastHub();
    const connection = makeConnection(hub);
    await expect(connection.publish('led', toBytes('on'))).rejects.toThrow(/connect\(\)/u);
  });
});

describe('접두어(PD-29)', () => {
  it('짧은 토픽에 접두어를 붙여 보내고 한 번만 알려 준다', async () => {
    const hub = new FakeBroadcastHub();
    const notices: string[] = [];
    const connection = makeConnection(hub);
    connection.on('notice', (text) => notices.push(text));
    await connection.connect();

    expect(await connection.publish('led', toBytes('on'))).toBe(`${PREFIX}/led`);
    expect(await connection.publish('led', toBytes('off'))).toBe(`${PREFIX}/led`);

    const added = notices.filter((text) => text.includes('접두어를 붙여서'));
    expect(added).toHaveLength(1);
    // R2-011: 인터넷을 안 쓰는 같은 컴퓨터 탭 통로에서는 "공개 중계 서버" 이야기 대신 이 컴퓨터 밖으로 나가지 않는다고 말한다
    expect(added[0]).toContain('이 컴퓨터 밖으로 나가지 않아요');
    expect(added[0]).not.toContain('공개 중계 서버는 온 세상');
  });

  it('공개 중계 서버 통로의 접두어 안내는 다른 사람의 메시지와 섞인다는 까닭을 말한다', () => {
    const text = mqttText.prefixAdded(PREFIX, 'broker');
    expect(text).toContain('공개 중계 서버는 온 세상이 함께 쓰는 곳');
    expect(text).not.toContain('이 컴퓨터 밖으로 나가지 않아요');
    expect(mqttText.prefixAdded(PREFIX)).toBe(text); // 통로를 모르면(연결 전) 예전 글
  });

  it('받은 토픽은 학생이 쓴 모양으로 돌려준다', async () => {
    const hub = new FakeBroadcastHub();
    const receiver = makeConnection(hub);
    const sender = makeConnection(hub);
    const got: MqttReceived[] = [];
    receiver.on('message', (message) => got.push(message));
    await receiver.connect();
    await sender.connect();
    await receiver.subscribe('led');

    await sender.publish('led', toBytes('on'));
    await flush();

    expect(got).toHaveLength(1);
    expect(got[0]?.topic).toBe(`${PREFIX}/led`);
    expect(got[0]?.studentTopic).toBe('led');
    expect(new TextDecoder().decode(got[0]?.bytes)).toBe('on');
  });

  it('접두어가 다른 탭과는 통하지 않는다', async () => {
    const hub = new FakeBroadcastHub();
    const receiver = makeConnection(hub);
    const sender = makeConnection(hub, { prefix: 'abcdefghjkmn' });
    const got: MqttReceived[] = [];
    receiver.on('message', (message) => got.push(message));
    await receiver.connect();
    await sender.connect();
    await receiver.subscribe('led');

    await sender.publish('led', toBytes('on'));
    await flush();

    expect(got).toHaveLength(0);
  });

  it('접두어를 바꾸면 연결을 닫는다(다음 connect에서 새 접두어로 연다)', async () => {
    const hub = new FakeBroadcastHub();
    const connection = makeConnection(hub);
    await connection.connect();
    expect(connection.state).toBe('open');

    connection.update({ prefix: 'abcdefghjkmn' });
    expect(connection.state).toBe('closed');

    await connection.connect();
    expect(connection.prefix).toBe('abcdefghjkmn');
    expect(connection.state).toBe('open');
  });
});

describe('받는 메시지 거르기(PD-29 — 실제 보드로 가는 길)', () => {
  it('허용 목록 밖 메시지는 버리고 기록에만 남긴다', async () => {
    const hub = new FakeBroadcastHub();
    const receiver = makeConnection(hub, { inbound: { allow: ['on', 'off'] } });
    const sender = makeConnection(hub);
    const got: MqttReceived[] = [];
    receiver.on('message', (message) => got.push(message));
    await receiver.connect();
    await sender.connect();
    await receiver.subscribe('led');

    await sender.publish('led', toBytes('on\n'));
    await sender.publish('led', toBytes('laser'));
    await flush();

    expect(got.map((message) => new TextDecoder().decode(message.bytes))).toEqual(['on\n']);
    const ignored = receiver.log.filter((entry) => entry.kind === 'ignored');
    expect(ignored).toHaveLength(1);
    expect(ignored[0]?.text).toContain('무시했어요');
  });

  it('20바이트를 넘는 메시지도 버린다', async () => {
    const hub = new FakeBroadcastHub();
    const receiver = makeConnection(hub, { inbound: {} });
    const sender = makeConnection(hub);
    const got: MqttReceived[] = [];
    receiver.on('message', (message) => got.push(message));
    await receiver.connect();
    await sender.connect();
    await receiver.subscribe('led');

    await sender.publish('led', toBytes('x'.repeat(21)));
    await flush();

    expect(got).toHaveLength(0);
    expect(receiver.log.some((entry) => entry.kind === 'ignored')).toBe(true);
  });
});

describe('기록', () => {
  it('보낸 것·받은 것이 기록에 남는다', async () => {
    const hub = new FakeBroadcastHub();
    const connection = makeConnection(hub);
    await connection.connect();
    await connection.subscribe('led');
    await connection.publish('led', toBytes('on'));
    await flush();

    const kinds = connection.log.map((entry) => entry.kind);
    expect(kinds).toContain('sent');
    expect(kinds).toContain('received');
  });

  it('기록은 정해진 줄 수만 남긴다', async () => {
    const hub = new FakeBroadcastHub();
    const connection = makeConnection(hub, { maxLog: 5 });
    await connection.connect();
    for (let index = 0; index < 10; index += 1) {
      await connection.publish('led', toBytes(String(index)));
    }
    expect(connection.log.length).toBe(5);
  });
});

describe('닫기', () => {
  it('닫으면 상태가 바뀌고 안내가 남는다', async () => {
    const hub = new FakeBroadcastHub();
    const connection = makeConnection(hub);
    const states: string[] = [];
    connection.on('state', (state) => states.push(state));
    await connection.connect();
    connection.close('시험으로 닫음');

    expect(connection.state).toBe('closed');
    expect(states).toContain('connecting');
    expect(states).toContain('open');
    expect(states).toContain('closed');
  });

  it('통로가 스스로 닫히면 연결도 닫힌 것으로 본다', async () => {
    const hub = new FakeBroadcastHub();
    let opened: MqttTransport | null = null;
    const connection = makeConnection(hub, {
      openTab: (options) => {
        opened = openTabTransport({ ...options, factory: hub.factory, defer: (run) => run() });
        return opened;
      },
    });
    await connection.connect();
    const notice = vi.fn();
    connection.on('notice', notice);

    (opened as MqttTransport | null)?.close('통로가 끊겼어요.');

    expect(connection.state).toBe('closed');
    expect(notice).toHaveBeenCalledWith('통로가 끊겼어요.');
  });
});
