// [실제 보드] 탭에서 [실행]을 쉬는 동안의 상태 줄 글(src/lab/serial/board-run-target.ts realBoardIdleStatus, 판 1.6.0 C176 — 걷기 보고 walk-student-board 26).
// 연결 전에는 "먼저 [보드 연결]을 눌러요", 이어진 뒤에는 null(셸 기본 글 "실제 보드에서 실행할 수 있어요. [실행]을 눌러 봐요.").
import { afterEach, describe, expect, it } from 'vitest';
import { BoardConnection, type BoardConnectionState } from '../../../src/lab/serial/board-connection.ts';
import { createRealBoardRunTarget, realBoardIdleStatus } from '../../../src/lab/serial/board-run-target.ts';
import { FakeSerial, MicroPythonDevice, MockSerialPort } from '../../../src/lab/serial/mock/index.ts';
import { FAST_TIMING, sleep } from './helpers/real-board-timing.ts';

function fake(state: BoardConnectionState, options: { supported?: boolean; isOpen?: boolean } = {}) {
  return { supported: options.supported ?? true, isOpen: options.isOpen ?? false, state };
}

describe('realBoardIdleStatus — 연결 상태별 상태 줄 글', () => {
  it('연결 전(idle)이면 할 일을 먼저 말한다', () => {
    expect(realBoardIdleStatus(fake('idle'))).toBe('먼저 [보드 연결]을 눌러요.');
  });

  it('포트 선택 창·열기·판별 중이면 연결하는 중이라고 말한다', () => {
    for (const state of ['choosing', 'opening', 'checking'] as const) {
      expect(realBoardIdleStatus(fake(state))).toBe('보드를 연결하는 중이에요…');
    }
  });

  it('끊겼으면 [다시 연결], 열기에 실패했으면 아래 안내', () => {
    expect(realBoardIdleStatus(fake('lost'))).toBe('보드 연결이 끊겼어요. [다시 연결]을 눌러요.');
    expect(realBoardIdleStatus(fake('error'))).toBe('보드를 잇지 못했어요. 아래 안내를 따라 해요.');
  });

  it('MicroPython이 없거나 보드가 멈추지 않으면 연결돼 있어도 "실행할 수 있어요"라 적지 않는다', () => {
    expect(realBoardIdleStatus(fake('no-micropython', { isOpen: true }))).toContain('MicroPython이 아직 없어요');
    expect(realBoardIdleStatus(fake('busy', { isOpen: true }))).toContain('보드가 멈추지 않아요');
  });

  it('이 브라우저가 Web Serial을 못 쓰면 [가상 보드] 탭으로 이끈다', () => {
    expect(realBoardIdleStatus(fake('unsupported', { supported: false }))).toBe('이 브라우저에서는 실제 보드를 연결할 수 없어요. [가상 보드] 탭에서 해요.');
  });

  it('보드가 이어졌으면(ready) null — 셸 기본 글이 나온다', () => {
    expect(realBoardIdleStatus(fake('ready', { isOpen: true }))).toBeNull();
  });
});

describe('실행 대상 idleStatus·onIdleStatusChange — 실제 연결 상태를 따라간다', () => {
  const cleanups: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) {
      await cleanup();
    }
  });

  it('연결 전 글 → [보드 연결] 중 알림 → 이어진 뒤 null, 처리기를 풀면 더는 알리지 않는다', async () => {
    const port = new MockSerialPort({ device: new MicroPythonDevice() });
    const serial = new FakeSerial({ ports: [port], requireUserActivation: false });
    const connection = new BoardConnection({ serial, timing: FAST_TIMING });
    cleanups.push(async () => {
      connection.dispose();
      await sleep(20);
      port.unplug();
    });
    const target = createRealBoardRunTarget(connection);
    expect(target.idleStatus?.()).toBe('먼저 [보드 연결]을 눌러요.');

    let notified = 0;
    const off = target.onIdleStatusChange?.(() => {
      notified += 1;
    });
    expect(off).toBeTypeOf('function');
    await connection.connect();
    expect(notified).toBeGreaterThan(0);
    expect(connection.state).toBe('ready');
    expect(target.idleStatus?.()).toBeNull();

    off?.();
    const before = notified;
    await connection.disconnect();
    expect(notified).toBe(before);
  });
});
