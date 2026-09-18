/**
 * 브릿지 전체가 PLAN §7.5의 보기 다섯 가지대로 도는지 확인한다(P4-01).
 * 통로는 같은 탭 직접 연결로 두고, 받는 쪽이 실제로 무엇을 읽는지까지 본다(자료의 받는 쪽 코드 기준 — CODE_MAPPING §6.5).
 */
import { describe, expect, it } from 'vitest';
import { BridgeInbox, createBridge, createDirectPair, type BridgeWarning } from '../../../src/lab/bridge/index.ts';
import { FakeScheduler, bytes, flush, textOf } from './helpers/fake.ts';

/** PC 쪽 브릿지와 보드 쪽 받는 차례를 함께 만든다 */
function pair(options: { skipUnchangedState?: boolean; allow?: readonly string[] } = {}) {
  const clock = new FakeScheduler();
  const [pcChannel, boardChannel] = createDirectPair({ a: 'pc', b: 'board' });
  const warnings: BridgeWarning[] = [];
  const console: string[] = [];
  const pc = createBridge(pcChannel, {
    scheduler: clock,
    ...(options.skipUnchangedState === undefined ? {} : { skipUnchangedState: options.skipUnchangedState }),
    onWarn: (warning) => warnings.push(warning),
    onSend: (_message, line) => console.push(line),
  });
  const board = new BridgeInbox(options.allow === undefined ? {} : { allow: options.allow });
  const raw: string[] = [];
  boardChannel.on('message', (envelope) => {
    raw.push(textOf(envelope.bytes));
    board.push(envelope.bytes);
  });
  return { clock, pc, pcChannel, boardChannel, board, raw, warnings, console };
}

describe('§7.5 보기 1 — 시나리오 F: 손가락 개수 → LED 개수', () => {
  it('bridge.send("3")이 보드에 "3"으로 도착한다', async () => {
    const { pc, board, raw, clock } = pair();
    pc.send('3');
    await flush();
    expect(raw).toEqual(['3\n']); // 끝 문자 한 개(§7.2-2)
    expect(board.take()).toBe('3'); // 받는 쪽은 strip한 값을 본다
    await clock.advance(0);
  });

  it('개수가 매 프레임 바뀌어도 초당 10번까지만 나가고 마지막 개수가 살아남는다', async () => {
    const { pc, board, clock } = pair();
    for (const count of ['0', '1', '2', '3', '4', '5']) {
      pc.send(count);
      await clock.advance(16); // 60fps
    }
    await clock.advance(200);
    const got = board.takeAll();
    expect(got.length).toBeLessThanOrEqual(3);
    expect(got.at(-1)).toBe('5');
  });
});

describe('§7.5 보기 2 — 3-1-2: 얼굴 → 레이저(f085 원본 그대로)', () => {
  it('원본이 쓴 b"a"가 한 바이트도 바뀌지 않고 간다(§7.2-8)', async () => {
    const { pc, raw } = pair();
    pc.sendBytes(bytes('a')); // f085의 uart.write(b'a')
    await flush();
    expect(raw).toEqual(['a']); // 끝 문자를 덧붙이지 않는다
  });

  it('같은 명령이 밀려 있으면 합쳐지고 다른 명령은 둘 다 간다(§7.6-④)', async () => {
    const { pc, raw, clock } = pair();
    pc.sendBytes(bytes('a'));
    pc.sendBytes(bytes('a'));
    pc.sendBytes(bytes('b'));
    await clock.advance(300);
    expect(raw).toEqual(['a', 'a', 'b']);
  });
});

describe('§7.5 보기 3 — 3-1-3: 검지 좌표 → RGB(f089 원본 그대로)', () => {
  it('밀린 좌표는 최신 값만 가고 받는 쪽이 split(",")로 읽는다', async () => {
    const { pc, board, clock } = pair();
    pc.sendBytes(bytes('300,100\n'));
    pc.sendBytes(bytes('310,110\n'));
    pc.sendBytes(bytes('355,152\n'));
    await clock.advance(200);
    const got = board.takeAll();
    expect(got.at(-1)).toBe('355,152');
    expect(got.at(-1)?.split(',').map(Number)).toEqual([355, 152]);
  });
});

describe('§7.5 보기 4 — 4-2-1: 얼굴 마우스 → LCD·서보·버저(f104 원본 그대로)', () => {
  it('좌표는 밀리면 최신 값만, 윙크(클릭 1)는 반드시 한 번 간다', async () => {
    // f104 원본은 끝 문자를 붙이지 않는다 — 그대로 보내므로(§7.2-8) 선에 나간 바이트로 확인한다.
    const { pc, raw, clock } = pair();
    pc.sendBytes(bytes('DATA,1920,1080,0,0'));
    pc.sendBytes(bytes('DATA,1921,1081,0,0'));
    pc.sendBytes(bytes('DATA,1930,1075,1,0')); // 윙크
    pc.sendBytes(bytes('DATA,1931,1076,0,0'));
    pc.sendBytes(bytes('DATA,1932,1077,0,0'));
    await clock.advance(400);

    expect(raw).toContain('DATA,1930,1075,1,0');
    expect(raw.filter((line) => line.endsWith(',1,0'))).toHaveLength(1);
    // 보통 프레임은 최신 값만 남는다(다섯 번 보냈지만 선에는 세 개)
    expect(raw).toEqual(['DATA,1920,1080,0,0', 'DATA,1932,1077,0,0', 'DATA,1930,1075,1,0']);
  });

  it('필드가 5개라 받는 쪽 검사(len(parts)==5)를 그대로 지난다', async () => {
    const { pc, board, clock } = pair();
    pc.send('DATA,1920,1080,0,0');
    await clock.advance(0);
    await flush();
    expect(board.take()?.split(',')).toHaveLength(5);
  });
});

describe('§7.5 보기 5 — 원시 바이트(f007)', () => {
  it('bytes([3])이 그대로 가고 끝 문자가 붙지 않는다', async () => {
    const { pc, boardChannel } = pair();
    const got: number[][] = [];
    boardChannel.on('message', (envelope) => got.push(Array.from(envelope.bytes)));
    pc.sendBytes(Uint8Array.of(3));
    await flush();
    expect(got).toEqual([[3]]);
  });
});

describe('되돌아오는 길(보드 → 브라우저)과 거르기', () => {
  it('보드가 보낸 줄을 receive()로 한 줄씩 꺼낸다', async () => {
    const { pc, boardChannel } = pair();
    await boardChannel.send(bytes('hello\nworld\n'));
    await flush();
    expect(pc.receive()).toBe('hello');
    expect(pc.receive()).toBe('world');
    expect(pc.receive()).toBeNull();
  });

  it('허용 목록을 주면 목록 밖 메시지는 무시한다(PD-29)', async () => {
    const clock = new FakeScheduler();
    const [pcChannel, boardChannel] = createDirectPair({ a: 'pc', b: 'board' });
    const rejected: string[] = [];
    const pc = createBridge(pcChannel, {
      scheduler: clock,
      inbound: { allow: ['on', 'off'] },
      onRejected: (line) => rejected.push(line),
    });
    await boardChannel.send(bytes('on\nlaser\noff\n'));
    await flush();
    expect(pc.receiveAll()).toEqual(['on', 'off']);
    expect(rejected).toEqual(['laser']);
  });

  it('20바이트를 넘으면 보내기 전에 한국어로 알린다(막지는 않는다)', async () => {
    const { pc, warnings, raw, clock } = pair();
    pc.send('DATA,123456,123456,1,1');
    await clock.advance(0);
    await flush();
    expect(warnings[0]?.code).toBe('too-long');
    expect(raw).toHaveLength(1); // 실물처럼 보내고, 잘리는 것은 통로가 보여 준다
  });

  it('콘솔에 원본처럼 Sent: 가 남는다(§7.6-⑤)', async () => {
    const { pc, console: lines, clock } = pair();
    pc.send('355,152');
    await clock.advance(0);
    await flush();
    expect(lines).toEqual(['Sent: 355,152']);
  });

  it('통로가 닫히면 한국어 알림이 오고 화면이 멈추지 않는다', async () => {
    const { pc, pcChannel, warnings, clock } = pair();
    pcChannel.close();
    pc.send('a');
    await clock.advance(10);
    await flush();
    expect(warnings.some((warning) => warning.code === 'closed')).toBe(true);
  });

  it('통로를 갈아 끼워도 같은 코드가 돌고, 밀려 있던 것은 새 통로로 나간다(§7.6 "통로는 코드에 적지 않는다")', async () => {
    const { pc, raw, clock } = pair();
    pc.send('1,1'); // 첫 통로로 바로 나감
    pc.send('2,2'); // 아직 차례에서 기다린다

    const [nextNear, nextFar] = createDirectPair({ a: 'pc', b: 'board' });
    const moved: string[] = [];
    nextFar.on('message', (envelope) => moved.push(textOf(envelope.bytes)));
    pc.setChannel(nextNear);
    expect(pc.channel).toBe(nextNear);

    await clock.advance(200);
    expect(raw).toEqual(['1,1\n']);
    expect(moved).toEqual(['2,2\n']);

    // 받는 길도 새 통로로 바뀐다
    await nextFar.send(bytes('ok\n'));
    await flush();
    expect(pc.receive()).toBe('ok');
  });

  it('reset()은 보낼 것과 받은 것을 모두 버린다(실행을 새로 시작할 때)', async () => {
    const { pc, boardChannel, clock } = pair();
    pc.send('1,1');
    pc.send('2,2');
    await boardChannel.send(bytes('x\n'));
    await flush();
    pc.reset();
    expect(pc.pending).toHaveLength(0);
    expect(pc.receive()).toBeNull();
    await clock.advance(200);
  });
});
