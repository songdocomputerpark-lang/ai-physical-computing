// 가상 보드 부품 단위 테스트(tests/unit/lab/board-part-<부품 id>.test.ts)가 함께 쓰는 도우미 — 파이썬이 보낸 것 같은 board.state로 스냅샷을 만든다.
import type { PartInstance } from '../../../../src/lab/modules/board/part-types.ts';
import { EMPTY_SNAPSHOT, applyStateEvent, parseStateEvent, type BoardSnapshot } from '../../../../src/lab/modules/board/state.ts';

/** 핀 목록으로 실행 중(또는 phase) 스냅샷을 만든다: snapshotWith([{ id: 2, mode: 'out', out: 1, level: 1, driven: true }]) */
export function snapshotWith(pins: Record<string, unknown>[], phase = 'run'): BoardSnapshot {
  const event = parseStateEvent({ reason: 'reset', phase, seq: 1, t_us: 0, pins, timers: 0 });
  if (!event) {
    throw new Error('시험용 board.state 모양이 틀렸어요.');
  }
  return applyStateEvent(EMPTY_SNAPSHOT, event);
}

/** 배선 한 줄(검사를 마친 모양) */
export function instanceOf(part: string, pins: Record<string, number>, overrides: Partial<PartInstance> = {}): PartInstance {
  return { part, id: part, pins, label: part, usesDefaultPins: true, ...overrides };
}
