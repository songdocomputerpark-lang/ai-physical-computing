/**
 * PLAN §7.2 규칙 4·5와 §7.6 원본 코드용 병합 규칙 ①~⑤를 하나씩 확인한다(P4-01).
 * 가짜 시계로 시간을 돌려 "초당 10회"와 "밀린 것은 최신 값만"을 실제로 재 본다.
 */
import { describe, expect, it } from 'vitest';
import { BRIDGE_MIN_INTERVAL_MS, BridgeOutbox, rawMessage, streamMessage, textMessage, type BridgeMessage, type BridgeWarning } from '../../../src/lab/bridge/index.ts';
import { FakeScheduler, bytes, flush, textOf } from './helpers/fake.ts';

/** 보낸 것을 적어 두는 가짜 통로 */
function collector(): { sent: string[]; write: (message: BridgeMessage) => Promise<void>; release: () => void; holding: boolean } {
  const sent: string[] = [];
  let hold: (() => void) | null = null;
  return {
    sent,
    get holding() {
      return hold !== null;
    },
    write(message: BridgeMessage) {
      sent.push(textOf(message.bytes));
      return new Promise<void>((resolve) => {
        hold = () => {
          hold = null;
          resolve();
        };
      });
    },
    release() {
      hold?.();
    },
  };
}

function immediate(): { sent: string[]; write: (message: BridgeMessage) => void } {
  const sent: string[] = [];
  return {
    sent,
    write(message: BridgeMessage) {
      sent.push(textOf(message.bytes));
    },
  };
}

describe('§7.2 규칙 4 — 최대 초당 10회', () => {
  it('첫 메시지는 바로 나가고 다음은 100ms 뒤에 나간다', async () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock });

    outbox.send(textMessage('355,152'));
    expect(sink.sent).toEqual(['355,152\n']);

    outbox.send(textMessage('DATA,1,2'));
    expect(sink.sent).toHaveLength(1); // 아직 100ms가 안 지났다

    await clock.advance(BRIDGE_MIN_INTERVAL_MS);
    expect(sink.sent).toEqual(['355,152\n', 'DATA,1,2\n']);
  });

  it('1초 동안 30번 보내도 나가는 것은 10번 안쪽이고, 버려지지 않고 병합된다', async () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock });

    for (let index = 0; index < 30; index += 1) {
      outbox.send(textMessage(`${index},0`));
      await clock.advance(33); // 초당 30번(매 프레임)
    }
    expect(sink.sent.length).toBeLessThanOrEqual(11);
    expect(sink.sent.length).toBeGreaterThanOrEqual(9);
    // 마지막 값은 반드시 나간다(최신 값 유지)
    await clock.advance(BRIDGE_MIN_INTERVAL_MS);
    expect(sink.sent.at(-1)).toBe('29,0\n');
  });

  it('간격을 바꿀 수 있다(통로마다 다른 한도)', async () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock, minIntervalMs: 500 });
    outbox.send(textMessage('a'));
    outbox.send(textMessage('b'));
    await clock.advance(200);
    expect(sink.sent).toHaveLength(1);
    await clock.advance(300);
    expect(sink.sent).toHaveLength(2);
  });
});

describe('§7.2 규칙 5 — 상태는 최신 값, 이벤트는 대기열에 보존', () => {
  it('밀린 좌표는 최신 값 하나만 남는다', async () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock });

    outbox.send(textMessage('1,1')); // 바로 나감
    expect(outbox.send(textMessage('2,2'))).toBe('queued');
    expect(outbox.send(textMessage('3,3'))).toBe('merged');
    expect(outbox.send(textMessage('4,4'))).toBe('merged');
    expect(outbox.pending).toHaveLength(1);

    await clock.advance(BRIDGE_MIN_INTERVAL_MS);
    expect(sink.sent).toEqual(['1,1\n', '4,4\n']);
  });

  it('이벤트는 몇 개가 밀려도 모두 한 번씩 나간다', async () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock });

    outbox.send(textMessage('0,0')); // 바로 나감
    outbox.send(textMessage('DATA,1,1,1,0', { category: 'event' }));
    outbox.send(textMessage('DATA,2,2,1,0', { category: 'event' }));
    outbox.send(textMessage('DATA,3,3,1,0', { category: 'event' }));
    expect(outbox.pending).toHaveLength(3);

    await clock.advance(BRIDGE_MIN_INTERVAL_MS * 3);
    expect(sink.sent).toEqual(['0,0\n', 'DATA,1,1,1,0\n', 'DATA,2,2,1,0\n', 'DATA,3,3,1,0\n']);
  });

  it('상태와 이벤트가 섞이면 이벤트는 그대로 두고 최신 상태가 맨 뒤로 간다(보드가 마지막에 보는 값이 최신 값)', async () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock });

    outbox.send(textMessage('a')); // 바로 나감
    outbox.send(textMessage('1,1'));
    outbox.send(textMessage('DATA,9,9,1,0', { category: 'event' }));
    // 앞의 1,1을 빼고 2,2를 맨 뒤에 — 그 자리에서 바꾸면 2,2가 이벤트보다 먼저 나가 마지막 값이 이벤트의 옛 좌표가 된다(2026-09-25 검토)
    expect(outbox.send(textMessage('2,2'))).toBe('merged');
    expect(outbox.pending.map((message) => message.text)).toEqual(['DATA,9,9,1,0', '2,2']);
    await clock.advance(BRIDGE_MIN_INTERVAL_MS * 3);
    expect(sink.sent).toEqual(['a\n', 'DATA,9,9,1,0\n', '2,2\n']);
  });
});

describe('§7.6 — 원본 코드용 병합 규칙', () => {
  it('① 한 번에 하나만 쓴다(앞 보내기가 끝나야 다음이 나간다)', async () => {
    const clock = new FakeScheduler();
    const sink = collector();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock });

    outbox.send(textMessage('a'));
    await flush();
    expect(sink.sent).toEqual(['a\n']);
    expect(outbox.busy).toBe(true);

    outbox.send(textMessage('b'));
    await clock.advance(BRIDGE_MIN_INTERVAL_MS * 3);
    expect(sink.sent).toHaveLength(1); // 앞 보내기가 아직 안 끝났다

    sink.release();
    await flush();
    expect(sink.sent).toEqual(['a\n', 'b\n']);
  });

  it('② 머리말·필드 수가 같은 메시지는 새 값 하나로 줄어 맨 뒤에 선다', () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock });
    outbox.send(textMessage('DATA,0,0')); // 바로 나감
    outbox.send(textMessage('DATA,1,1'));
    expect(outbox.send(textMessage('DATA,2,2'))).toBe('merged');
    // 필드 수가 다르면 다른 자리라 따로 쌓인다
    expect(outbox.send(textMessage('DATA,3,3,0,0'))).toBe('queued');
    expect(outbox.pending.map((message) => message.text)).toEqual(['DATA,2,2', 'DATA,3,3,0,0']);
  });

  it('③ DATA 5필드에서 클릭 표시가 1이면 바뀌지 않는다', async () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock });

    // f104 원본이 매 프레임 보내는 모양: 보통 프레임 → 윙크 프레임 → 보통 프레임
    outbox.send(rawMessage(bytes('DATA,1920,1080,0,0'))); // 바로 나감
    outbox.send(rawMessage(bytes('DATA,1921,1081,0,0')));
    outbox.send(rawMessage(bytes('DATA,1930,1075,1,0'))); // 윙크 — 이벤트
    outbox.send(rawMessage(bytes('DATA,1931,1076,0,0'))); // 다시 보통 — 앞의 보통 프레임을 빼고 맨 뒤로

    expect(outbox.pending.map((message) => message.text)).toEqual(['DATA,1930,1075,1,0', 'DATA,1931,1076,0,0']);
    await clock.advance(BRIDGE_MIN_INTERVAL_MS * 3);
    // 클릭은 사라지지 않고, 보드가 마지막에 받는 좌표는 가장 새 좌표다
    expect(sink.sent).toEqual(['DATA,1920,1080,0,0', 'DATA,1930,1075,1,0', 'DATA,1931,1076,0,0']);
  });

  it('④ 밀려 있는 같은 한 글자 명령은 합쳐지고, 다른 글자는 둘 다 나간다', async () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock });

    outbox.send(rawMessage(bytes('a'))); // 바로 나감
    outbox.send(rawMessage(bytes('b')));
    expect(outbox.send(rawMessage(bytes('b')))).toBe('merged');
    expect(outbox.send(rawMessage(bytes('a')))).toBe('queued');
    expect(outbox.pending.map((message) => message.text)).toEqual(['b', 'a']);

    await clock.advance(BRIDGE_MIN_INTERVAL_MS * 3);
    expect(sink.sent).toEqual(['a', 'b', 'a']);
  });

  it('④ 한 글자 명령은 "직전과 같을 때만" 합친다 — a·b·a·b를 잇달아 보내면 네 개가 모두 차례대로 나간다', async () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock });

    // f084(키보드)·f085(얼굴)처럼 원본 PC 코드가 켜기·끄기를 번갈아 보낸다(2026-09-25 검토: 마지막 b가 앞 b 자리로 끼어들어 a로 끝났다)
    outbox.send(rawMessage(bytes('a'))); // 바로 나감
    expect(outbox.send(rawMessage(bytes('b')))).toBe('queued');
    expect(outbox.send(rawMessage(bytes('a')))).toBe('queued');
    expect(outbox.send(rawMessage(bytes('b')))).toBe('queued');
    await clock.advance(BRIDGE_MIN_INTERVAL_MS * 4);
    expect(sink.sent).toEqual(['a', 'b', 'a', 'b']);
    expect(sink.sent.at(-1)).toBe('b'); // 마지막 뜻(끄기)이 마지막에 닿는다
  });

  it('30ms 간격으로 a·b를 번갈아 10번 보내도 마지막에 보드가 받는 것은 마지막으로 보낸 글자다', async () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock });
    const sentOrder: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      const letter = index % 2 === 0 ? 'a' : 'b';
      sentOrder.push(letter);
      outbox.send(rawMessage(bytes(letter)));
      await clock.advance(30);
    }
    await clock.advance(BRIDGE_MIN_INTERVAL_MS * 20);
    expect(sink.sent.at(-1)).toBe(sentOrder.at(-1));
  });

  it('⑤ 나간 메시지를 콘솔 한 줄로 알려 준다', async () => {
    const clock = new FakeScheduler();
    const lines: string[] = [];
    const outbox = new BridgeOutbox(() => undefined, { scheduler: clock, onSend: (_message, line) => lines.push(line) });
    outbox.send(textMessage('355,152'));
    await flush();
    expect(lines).toEqual(['Sent: 355,152']);
  });
});

describe('§7.2 규칙 4 — "값이 바뀔 때만"(켰을 때)', () => {
  it('앞서 보낸 값과 같으면 건너뛰고, 바뀌면 보낸다', async () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock, skipUnchangedState: true });

    outbox.send(textMessage('a'));
    await clock.advance(BRIDGE_MIN_INTERVAL_MS);
    expect(outbox.send(textMessage('a'))).toBe('skipped');
    await clock.advance(BRIDGE_MIN_INTERVAL_MS);
    expect(outbox.send(textMessage('b'))).toBe('queued');
    await clock.advance(BRIDGE_MIN_INTERVAL_MS);
    expect(sink.sent).toEqual(['a\n', 'b\n']);
  });

  it('이벤트는 같은 값이어도 건너뛰지 않는다', async () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock, skipUnchangedState: true });
    outbox.send(textMessage('DATA,1,1,1,0'));
    await clock.advance(BRIDGE_MIN_INTERVAL_MS);
    expect(outbox.send(textMessage('DATA,1,1,1,0'))).toBe('queued');
  });

  it('꺼 두면(기본) 같은 값도 다시 나간다', async () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock });
    outbox.send(textMessage('a'));
    await clock.advance(BRIDGE_MIN_INTERVAL_MS);
    outbox.send(textMessage('a'));
    await clock.advance(BRIDGE_MIN_INTERVAL_MS);
    expect(sink.sent).toEqual(['a\n', 'a\n']);
  });
});

describe('차례가 가득 찰 때와 알림', () => {
  it('바꿔 끼울 수 없는 이벤트가 쌓이면 오래된 상태부터 버리고 한국어로 알린다', () => {
    const clock = new FakeScheduler();
    const warnings: BridgeWarning[] = [];
    const outbox = new BridgeOutbox(() => new Promise<void>(() => undefined), {
      scheduler: clock,
      maxQueue: 3,
      onWarn: (warning) => warnings.push(warning),
    });

    outbox.send(textMessage('start')); // 나가는 중(끝나지 않음)
    outbox.send(textMessage('1,1'));
    outbox.send(textMessage('DATA,1,1,1,0', { category: 'event' }));
    outbox.send(textMessage('DATA,2,2,1,0', { category: 'event' }));
    outbox.send(textMessage('DATA,3,3,1,0', { category: 'event' }));

    expect(outbox.pending).toHaveLength(3);
    // 버려진 것은 바꿔 끼울 수 있는 상태 메시지다 — 이벤트 셋은 그대로 있다
    expect(outbox.pending.every((message) => message.category === 'event')).toBe(true);
    expect(warnings.some((warning) => warning.code === 'queue-full')).toBe(true);
  });

  it('메시지를 만들 때 나온 알림(20바이트 넘김)을 그대로 넘겨 준다', () => {
    const warnings: BridgeWarning[] = [];
    const outbox = new BridgeOutbox(() => undefined, { scheduler: new FakeScheduler(), onWarn: (warning) => warnings.push(warning) });
    outbox.send(textMessage('DATA,123456,123456,1,1'));
    expect(warnings[0]?.code).toBe('too-long');
  });

  it('닫은 뒤에는 받지 않는다', () => {
    const outbox = new BridgeOutbox(() => undefined, { scheduler: new FakeScheduler() });
    outbox.close();
    expect(outbox.send(textMessage('a'))).toBe('dropped');
  });

  it('보내다 난 오류는 알려 주고 다음 메시지를 막지 않는다', async () => {
    const clock = new FakeScheduler();
    const errors: unknown[] = [];
    const sent: string[] = [];
    let first = true;
    const outbox = new BridgeOutbox(
      (message) => {
        if (first) {
          first = false;
          return Promise.reject(new Error('통로 오류'));
        }
        sent.push(textOf(message.bytes));
        return Promise.resolve();
      },
      { scheduler: clock, onError: (error) => errors.push(error) },
    );
    outbox.send(textMessage('a'));
    outbox.send(textMessage('b'));
    await clock.advance(BRIDGE_MIN_INTERVAL_MS * 2);
    expect(errors).toHaveLength(1);
    expect(sent).toEqual(['b\n']);
  });
});

describe('바이트 흐름(보드 UART → 컴퓨터) — 합치지 않고 이어 붙인다', () => {
  it('streamMessage는 절대 합치지 않고 20바이트·줄바꿈 알림도 없다', () => {
    const message = streamMessage(bytes('0\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n'));
    expect(message.mergeKey).toBeNull();
    expect(message.category).toBe('event');
    expect(message.warnings).toEqual([]);
  });

  it('replaceTail은 차례 맨 뒤 메시지만 바꾸고, 이미 나간 것은 바꾸지 않는다', async () => {
    const clock = new FakeScheduler();
    const sink = immediate();
    const outbox = new BridgeOutbox(sink.write, { scheduler: clock });
    const first = streamMessage(bytes('0\n'));
    outbox.send(first); // 바로 나감
    expect(outbox.replaceTail(first, streamMessage(bytes('x')))).toBe(false);
    const second = streamMessage(bytes('1\n'));
    outbox.send(second);
    expect(outbox.replaceTail(second, streamMessage(bytes('1\n2\n')))).toBe(true);
    await clock.advance(BRIDGE_MIN_INTERVAL_MS);
    expect(sink.sent).toEqual(['0\n', '1\n2\n']);
  });
});
