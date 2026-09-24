// 영상처리 ↔ 가상 보드 선(src/lab/modules/vision-bridge/link.ts) 검사 — P4-02.
// **진짜 BroadcastChannel**(Node 전역)로 두 끝을 열어, 브라우저 두 탭·한 화면(iframe)에서 일어나는 일을 그대로 본다.
// 확인하는 것: ① 접두어 정하기(주소 ?bridge= → 저장 → 새로 만들기) ② 상대 알아보기 ③ 바이트가 그대로 간다(속도·선 이름표까지)
// ④ §7.6 병합 규칙(같은 한 글자 명령은 합쳐지고 다른 글자는 둘 다 나간다) ⑤ 상대가 없으면 한국어 오류.
import { afterEach, describe, expect, it } from 'vitest';
import { BridgeLink, prefixFromSearch, resolvePrefix, type UartFrame } from '../../../src/lab/modules/vision-bridge/link.ts';
import { PREFIX_LENGTH, isValidPrefix } from '../../../src/lab/bridge/index.ts';

/** 저장 공간 흉내(Node에는 sessionStorage가 없다) */
function fakeStore(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  } as unknown as Storage;
}

const opened: BridgeLink[] = [];

function link(from: 'pc' | 'board', prefix: string, options: { minIntervalMs?: number } = {}): BridgeLink {
  const made = new BridgeLink({
    from,
    prefix,
    stores: { session: fakeStore(), local: fakeStore() },
    search: '',
    ...(options.minIntervalMs === undefined ? {} : { minIntervalMs: options.minIntervalMs }),
  });
  opened.push(made);
  return made;
}

/** 프레임이 올 때까지(또는 시간이 다 될 때까지) 기다린다 */
function nextFrame(target: BridgeLink, timeoutMs = 2000): Promise<UartFrame> {
  return new Promise((resolve, reject) => {
    const off = target.onFrame((frame) => {
      off();
      clearTimeout(timer);
      resolve(frame);
    });
    const timer = setTimeout(() => {
      off();
      reject(new Error('바이트가 오지 않았어요.'));
    }, timeoutMs);
  });
}

function frames(target: BridgeLink, ms: number): Promise<UartFrame[]> {
  const got: UartFrame[] = [];
  const off = target.onFrame((frame) => got.push(frame));
  return new Promise((resolve) => {
    setTimeout(() => {
      off();
      resolve(got);
    }, ms);
  });
}

const text = (frame: UartFrame): string => new TextDecoder().decode(frame.bytes);

afterEach(() => {
  for (const made of opened.splice(0)) {
    made.close();
  }
});

describe('접두어 정하기(PD-29)', () => {
  it('주소의 ?bridge=…를 읽는다(모양이 틀리면 null)', () => {
    expect(prefixFromSearch('?bridge=7kq2m9xd4hpt&example=a.py')).toBe('7kq2m9xd4hpt');
    expect(prefixFromSearch('?bridge=TOO-SHORT')).toBeNull();
    expect(prefixFromSearch('')).toBeNull();
  });

  it('주소에 있으면 그것을 쓰고 이 탭에도 적어 둔다', () => {
    const session = fakeStore();
    const prefix = resolvePrefix({ search: '?bridge=7kq2m9xd4hpt', stores: { session, local: fakeStore() } });
    expect(prefix).toBe('7kq2m9xd4hpt');
    expect(session.length).toBe(1);
  });

  it('없으면 새로 만들어 이 탭에 적어 둔다(12글자·헷갈리는 글자 없음)', () => {
    const session = fakeStore();
    const prefix = resolvePrefix({ stores: { session, local: fakeStore() } });
    expect(prefix).toHaveLength(PREFIX_LENGTH);
    expect(isValidPrefix(prefix)).toBe(true);
    expect(resolvePrefix({ stores: { session, local: fakeStore() } })).toBe(prefix);
  });
});

describe('두 끝을 잇는다(진짜 BroadcastChannel)', () => {
  it('상대를 알아보고, 보낸 바이트가 속도·선 이름표와 함께 그대로 간다', async () => {
    const prefix = 'abcdefghijkm';
    const pc = link('pc', prefix);
    const board = link('board', prefix);
    await pc.connect();
    await board.connect();

    expect(await pc.waitForPeer(2000)).toBe(true);
    expect(pc.status.peers).toEqual(['board']);

    const arriving = nextFrame(board);
    pc.sendBytes(new TextEncoder().encode('a'), { baud: 115_200 });
    const frame = await arriving;
    expect(text(frame)).toBe('a');
    expect(frame.from).toBe('pc');
    expect(frame.baud).toBe(115_200);
    expect(frame.port).toBe('uart');
    expect(pc.status.sentBytes).toBe(1);
    expect(board.status.receivedBytes).toBe(1);
  });

  it('보드 → 컴퓨터 방향도 같은 선으로 간다', async () => {
    const prefix = 'bbcdefghijkm';
    const pc = link('pc', prefix);
    const board = link('board', prefix);
    await pc.connect();
    await board.connect();
    await board.waitForPeer(2000);

    const arriving = nextFrame(pc);
    board.sendBytes(new TextEncoder().encode('hello\n'), { baud: 9600 });
    const frame = await arriving;
    expect(text(frame)).toBe('hello\n');
    expect(frame.from).toBe('board');
    expect(frame.baud).toBe(9600);
  });

  it('§7.6 병합: 같은 한 글자 명령은 합쳐지고, 다른 글자는 둘 다 나간다', async () => {
    const prefix = 'cbcdefghijkm';
    const pc = link('pc', prefix, { minIntervalMs: 60 });
    const board = link('board', prefix);
    await pc.connect();
    await board.connect();
    await pc.waitForPeer(2000);

    const collecting = frames(board, 400);
    pc.sendBytes(new TextEncoder().encode('a'), { baud: 115_200 });
    pc.sendBytes(new TextEncoder().encode('a'), { baud: 115_200 });
    pc.sendBytes(new TextEncoder().encode('a'), { baud: 115_200 });
    pc.sendBytes(new TextEncoder().encode('b'), { baud: 115_200 });
    const got = await collecting;
    expect(got.map(text)).toEqual(['a', 'a', 'b']);
  });

  it('§7.2 규칙 5: bridge.event()가 싣는 category "event"는 차례에서 바꿔 끼우지 않는다(상태만 최신 값으로)', async () => {
    const prefix = 'cbcdefghijkn';
    const pc = link('pc', prefix, { minIntervalMs: 60 });
    const board = link('board', prefix);
    await pc.connect();
    await board.connect();
    await pc.waitForPeer(2000);

    const collecting = frames(board, 500);
    const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
    pc.sendBytes(encode('3\n'), { baud: 0, category: 'state' }); // 바로 나감
    pc.sendBytes(encode('4\n'), { baud: 0, category: 'state' }); // 차례에 남음
    pc.sendBytes(encode('4\n'), { baud: 0, category: 'event' }); // 이벤트 — 같은 모양이어도 합치지 않음
    pc.sendBytes(encode('5\n'), { baud: 0, category: 'state' }); // 차례의 상태 '4'를 빼고 맨 뒤로(최신 값이 마지막에 닿게)
    const got = await collecting;
    expect(got.map(text)).toEqual(['3\n', '4\n', '5\n']);
  });

  it('원본 PC 코드가 a·b·a·b를 잇달아 쓰면 보드는 네 글자를 모두 차례대로 받는다(마지막 뜻이 b)', async () => {
    const prefix = 'cbcdefghijkp';
    const pc = link('pc', prefix, { minIntervalMs: 40 });
    const board = link('board', prefix);
    await pc.connect();
    await board.connect();
    await pc.waitForPeer(2000);

    const collecting = frames(board, 500);
    for (const letter of ['a', 'b', 'a', 'b']) {
      pc.sendBytes(new TextEncoder().encode(letter), { baud: 115_200 });
    }
    const got = await collecting;
    expect(got.map(text).join('')).toBe('abab');
  });

  it('보드 → 컴퓨터 바이트 흐름(sendStream)은 합치지 않고 이어 붙여 한 바이트도 잃지 않는다', async () => {
    const prefix = 'cbcdefghijkq';
    const pc = link('pc', prefix);
    const board = link('board', prefix, { minIntervalMs: 60 });
    await pc.connect();
    await board.connect();
    await board.waitForPeer(2000);

    const collecting = frames(pc, 600);
    // 보드가 uart.write(str(i) + chr(10))를 i = 0~4 따로 다섯 번(2026-09-25 검토: 전에는 1·2·3줄이 값 모양으로 합쳐져 사라졌다)
    for (let index = 0; index < 5; index += 1) {
      board.sendStream(new TextEncoder().encode(`${index}\n`), { baud: 9600 });
    }
    const got = await collecting;
    expect(got.map(text).join('')).toBe('0\n1\n2\n3\n4\n');
    expect(got.every((frame) => frame.baud === 9600 && frame.from === 'board')).toBe(true);
    // 첫 조각은 바로 나가고, 나머지 넷은 한 덩어리로 이어 붙어 나간다(초당 10회 차례는 그대로)
    expect(got.length).toBe(2);
  });

  it('접두어가 다르면 통하지 않는다', async () => {
    const pc = link('pc', 'dbcdefghijkm');
    const board = link('board', 'ebcdefghijkm');
    await pc.connect();
    await board.connect();
    expect(await pc.waitForPeer(300)).toBe(false);
    const got = frames(board, 300);
    pc.sendBytes(new TextEncoder().encode('a'), { baud: 115_200 });
    expect(await got).toEqual([]);
  });

  it('받을 쪽이 없으면 한국어 오류를 알린다(§7.4 comm-no-peer)', async () => {
    const pc = link('pc', 'fbcdefghijkm');
    await pc.connect();
    const warnings: string[] = [];
    pc.onWarn((warning) => warnings.push(warning.text));
    pc.sendBytes(new TextEncoder().encode('a'), { baud: 115_200 });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(pc.status.error ?? warnings.join(' ')).toMatch(/받을 쪽|찾지 못했어요/u);
  });

  it('접두어를 바꾸면 그 접두어의 상대와 이어진다', async () => {
    const pc = link('pc', 'gbcdefghijkm');
    const board = link('board', 'hbcdefghijkm');
    await pc.connect();
    await board.connect();
    expect(await pc.waitForPeer(200)).toBe(false);

    await pc.setPrefix('hbcdefghijkm');
    expect(pc.status.prefix).toBe('hbcdefghijkm');
    expect(await pc.waitForPeer(2000)).toBe(true);

    const arriving = nextFrame(board);
    pc.sendBytes(new TextEncoder().encode('c'), { baud: 115_200 });
    expect(text(await arriving)).toBe('c');
  });

  // 2026-09-25 Phase 4 검토 반영: 보드 탭이 [실행] 전인데 컴퓨터 탭이 보내면, 컴퓨터 탭에는 "이어졌어요"만 보였다.
  it('실행 상태(idle·running)를 상대에게 알리고, 데이터 줄기(onFrame)에는 섞이지 않는다', async () => {
    const prefix = 'kbcdefghijkm';
    const pc = link('pc', prefix);
    const board = link('board', prefix);
    await pc.connect();
    await board.connect();
    expect(await board.waitForPeer(2000)).toBe(true);

    const states: string[] = [];
    pc.onPeerState((state, from) => states.push(`${from}:${state}`));
    const dataFrames = frames(pc, 400);
    expect(board.sendState('idle')).toBe(true);
    expect(board.sendState('running')).toBe(true);
    expect(await dataFrames).toEqual([]);
    expect(states).toEqual(['board:idle', 'board:running']);
  });

  it('상대가 없거나 탭 통로가 아니면 실행 상태를 보내지 않는다(기다리지 않는다)', async () => {
    const lonely = link('board', 'mbcdefghijkm');
    await lonely.connect();
    expect(lonely.sendState('idle')).toBe(false);
    const closed = link('board', 'nbcdefghijkm');
    expect(closed.sendState('idle')).toBe(false);
  });

  it('접두어 모양이 틀리면 바꾸지 않고 한국어 까닭을 남긴다', async () => {
    const pc = link('pc', 'jbcdefghijkm');
    const status = await pc.setPrefix('나쁜값');
    expect(status.prefix).toBe('jbcdefghijkm');
    expect(status.error).toMatch(/12글자|접두어/u);
  });
});
