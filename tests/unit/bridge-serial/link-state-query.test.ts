// 선(src/lab/modules/vision-bridge/link.ts)의 판 1.1.1 최종 점검 고침 — 진짜 BroadcastChannel(Node 전역)로 두 끝을 연다.
//  1. 실행 상태 묻기(STATE_QUERY_TEXT): 상대가 (다시) 보이면 상태를 듣는 끝(컴퓨터 쪽)이 묻고, answerStateWith를 건 끝(보드 쪽)이 답한다.
//     보드 탭이 6초 넘게 멈칫해 컴퓨터 쪽 목록에서 빠졌다 돌아오면, 보드 쪽은 컴퓨터를 계속 보고 있어 "상대가 늘 때" 알림을 다시 보내지 않았다
//     — 그래서 두 탭 블루투스가 끊긴 채로 굳었다(브라우저 검사: tests/e2e/ble-pc-tab.spec.ts "8초 멈칫").
//  2. 다른 줄기로 실제로 나간 것 알림(onEnvelopeSent): [보내기] 패널 "주고받은 글"이 블루투스 줄기로 오간 글도 남긴다.
import { afterEach, describe, expect, it } from 'vitest';
import { BLE_ENVELOPE_TYPE, BridgeLink, STATE_QUERY_TEXT, type PeerRunState } from '../../../src/lab/modules/vision-bridge/link.ts';

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

function link(from: 'pc' | 'board', prefix: string): BridgeLink {
  const made = new BridgeLink({ from, prefix, stores: { session: fakeStore(), local: fakeStore() }, search: '' });
  opened.push(made);
  return made;
}

function until(check: () => boolean, ms = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (check()) {
        clearInterval(timer);
        resolve(true);
      } else if (Date.now() - started > ms) {
        clearInterval(timer);
        resolve(false);
      }
    }, 10);
  });
}

afterEach(() => {
  for (const made of opened.splice(0)) {
    made.close();
  }
});

describe('실행 상태 묻기(STATE_QUERY_TEXT)', () => {
  it('묻는 말은 실행 상태 글자와 겹치지 않는다', () => {
    expect(STATE_QUERY_TEXT).not.toBe('idle');
    expect(STATE_QUERY_TEXT).not.toBe('running');
  });

  it('상태를 듣는 끝(컴퓨터 쪽)은 상대가 보이면 물어보고, 보드 쪽이 지금 상태로 답한다', async () => {
    const prefix = 'qbcdefghijk2';
    const board = link('board', prefix);
    let boardState: PeerRunState = 'running';
    board.answerStateWith(() => boardState);
    await board.connect();

    const pc = link('pc', prefix);
    const states: string[] = [];
    pc.onPeerState((state, from) => states.push(`${from}:${state}`));
    await pc.connect();
    expect(await until(() => states.includes('board:running'))).toBe(true);

    // 컴퓨터 쪽이 스스로 물을 수도 있다(상대는 보이는데 상태를 모를 때 — 다시 [실행])
    boardState = 'idle';
    expect(pc.queryState()).toBe(true);
    expect(await until(() => states.includes('board:idle'))).toBe(true);
  });

  it('보드 쪽이 목록에서 빠졌다가(떠났다가) 다시 보이면 컴퓨터 쪽이 다시 묻고 상태를 되찾는다', async () => {
    const prefix = 'rbcdefghijk2';
    const pc = link('pc', prefix);
    const states: string[] = [];
    pc.onPeerState((state, from) => states.push(`${from}:${state}`));
    await pc.connect();

    const board = link('board', prefix);
    board.answerStateWith(() => 'running');
    await board.connect();
    expect(await until(() => states.filter((one) => one === 'board:running').length >= 1)).toBe(true);

    // 보드 쪽 선이 닫혔다 다시 열린다(컴퓨터 쪽 목록에서 빠졌다 돌아오는 것과 같은 길 — 상대가 새로 보인다)
    board.disconnect();
    expect(await until(() => !pc.status.peers.includes('board'))).toBe(true);
    const before = states.length;
    await board.connect();
    expect(await until(() => states.slice(before).includes('board:running'))).toBe(true);
  });

  it('답할 함수를 걸지 않은 끝은 묻는 말에 답하지 않고, 묻는 말은 데이터 줄기(onFrame)에 섞이지 않는다', async () => {
    const prefix = 'sbcdefghijk2';
    const board = link('board', prefix);
    await board.connect();
    const pc = link('pc', prefix);
    const states: string[] = [];
    const frames: string[] = [];
    pc.onPeerState((state, from) => states.push(`${from}:${state}`));
    board.onFrame((frame) => frames.push(new TextDecoder().decode(frame.bytes)));
    await pc.connect();
    expect(await until(() => pc.status.peers.includes('board'))).toBe(true);
    expect(pc.queryState()).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(states).toEqual([]);
    expect(frames).toEqual([]);
  });

  it('선이 닫혀 있거나 상대가 없으면 묻지 않는다(기다리지 않는다)', async () => {
    const closed = link('pc', 'tbcdefghijk2');
    expect(closed.queryState()).toBe(false);
    const lonely = link('pc', 'ubcdefghijk2');
    await lonely.connect();
    expect(lonely.queryState()).toBe(false);
  });
});

describe('다른 줄기로 실제로 나간 것 알림(onEnvelopeSent)', () => {
  it('블루투스 줄기로 보낸 바이트를 보낸 뒤에 알린다(UART 줄기의 onSent와 짝)', async () => {
    const prefix = 'vbcdefghijk2';
    const pc = link('pc', prefix);
    const board = link('board', prefix);
    await pc.connect();
    await board.connect();
    expect(await board.waitForPeer(2000)).toBe(true);
    const sent: string[] = [];
    const off = pc.onEnvelopeSent((type, bytes) => sent.push(`${type}:${new TextDecoder().decode(bytes)}`));
    const received: string[] = [];
    board.onEnvelope(BLE_ENVELOPE_TYPE, (frame) => received.push(new TextDecoder().decode(frame.bytes)));
    await pc.sendEnvelope(BLE_ENVELOPE_TYPE, new TextEncoder().encode('3,6'));
    expect(sent).toEqual([`${BLE_ENVELOPE_TYPE}:3,6`]);
    expect(await until(() => received.includes('3,6'))).toBe(true);
    // 그만 들으면 더는 알리지 않는다
    off();
    await pc.sendEnvelope(BLE_ENVELOPE_TYPE, new TextEncoder().encode('4,8'));
    expect(sent).toHaveLength(1);
  });

  it('보내지 못하면(선이 닫힘) 알리지 않는다', async () => {
    const pc = link('pc', 'wbcdefghijk2');
    const sent: string[] = [];
    pc.onEnvelopeSent((type) => sent.push(type));
    await expect(pc.sendEnvelope(BLE_ENVELOPE_TYPE, new TextEncoder().encode('x'))).rejects.toThrow();
    expect(sent).toEqual([]);
  });
});
