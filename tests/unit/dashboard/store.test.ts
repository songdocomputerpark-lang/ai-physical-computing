// 위젯 배치 저장(P4-07) — 구역 D 2차.
// 지키는 것: ① 저장 이름이 사이트 머리말 아래라 [기록 지우기]가 함께 지운다(PLAN §10)
// ② **읽은 값을 믿지 않는다**(모르는 종류·깨진 자리·다른 판 번호는 버리고 처음 판으로)
// ③ 저장이 막힌 브라우저에서도 오류로 멈추지 않는다.
import { describe, expect, it } from 'vitest';
import { FakeStorage } from '../bridge/helpers/fake.ts';
import { STORAGE_KEY_PREFIX } from '../../../src/lib/storage.ts';
import { BOARD_VERSION, DASH_MAX_WIDGETS, defaultBoard } from '../../../src/lab/dashboard/defaults.ts';
import { BOARD_STORAGE_NAME, readBoard, sanitizeBoard, sanitizeWidget, writeBoard } from '../../../src/lab/dashboard/store.ts';
import { overlaps } from '../../../src/lab/dashboard/layout.ts';
import type { DashboardWidget } from '../../../src/lab/dashboard/types.ts';

describe('저장 이름', () => {
  it('사이트 머리말 아래 이름 하나만 쓴다([기록 지우기]가 함께 지운다)', () => {
    const storage = new FakeStorage();
    writeBoard(defaultBoard(), storage);
    expect(storage.key(0)).toBe(`${STORAGE_KEY_PREFIX}${BOARD_STORAGE_NAME}`);
    expect(storage.length).toBe(1);
  });
});

describe('읽기', () => {
  it('저장한 판을 그대로 돌려준다', () => {
    const storage = new FakeStorage();
    const board = defaultBoard();
    expect(writeBoard(board, storage)).toBe(true);
    expect(readBoard(storage)).toEqual(board);
  });

  it('저장한 것이 없으면 처음 판이다', () => {
    expect(readBoard(new FakeStorage())).toEqual(defaultBoard());
  });

  it('깨진 글자·다른 판 번호는 처음 판으로 되돌린다', () => {
    const storage = new FakeStorage();
    storage.setItem(`${STORAGE_KEY_PREFIX}${BOARD_STORAGE_NAME}`, '{이건 JSON이 아니에요');
    expect(readBoard(storage)).toEqual(defaultBoard());
    storage.setItem(`${STORAGE_KEY_PREFIX}${BOARD_STORAGE_NAME}`, JSON.stringify({ version: 99, widgets: [] }));
    expect(readBoard(storage)).toEqual(defaultBoard());
  });

  it('저장을 막은 브라우저에서도 오류 없이 처음 판을 준다', () => {
    const blocked = (): never => {
      throw new Error('저장이 막혔어요');
    };
    expect(readBoard(blocked)).toEqual(defaultBoard());
    expect(writeBoard(defaultBoard(), blocked)).toBe(false);
  });
});

describe('값 다듬기', () => {
  it('모르는 종류·id는 버린다', () => {
    expect(sanitizeWidget({ id: 'x1', kind: '레이저' })).toBeNull();
    expect(sanitizeWidget({ id: '대문자 Id', kind: 'gauge' })).toBeNull();
    expect(sanitizeWidget(null)).toBeNull();
  });

  it('빠진 칸은 기본값으로 채우고 자리는 판 안으로 들여놓는다', () => {
    const widget = sanitizeWidget({ id: 'gauge-9', kind: 'gauge', x: 99, y: -3, w: 0, h: 0 });
    expect(widget).not.toBeNull();
    expect(widget?.title).toBe('지금 값');
    expect(widget?.x).toBeLessThanOrEqual(10);
    expect(widget?.y).toBe(0);
    expect(widget?.w).toBeGreaterThanOrEqual(2);
  });

  it('너무 긴 글·줄바꿈은 자르고 지운다(통신 규칙 20바이트)', () => {
    const widget = sanitizeWidget({ id: 'switch-9', kind: 'switch', title: 'a'.repeat(80), onText: 'b'.repeat(40), topic: 'a\nb' });
    expect(widget?.title.length).toBeLessThanOrEqual(24);
    expect(widget?.onText.length).toBeLessThanOrEqual(20);
    expect(widget?.topic).not.toContain('\n');
  });

  it('같은 id가 둘이면 하나만 남기고, 겹친 자리는 푼다', () => {
    const same = { id: 'gauge-1', kind: 'gauge', x: 0, y: 0, w: 3, h: 4 };
    const board = sanitizeBoard({ version: BOARD_VERSION, widgets: [same, same, { ...same, id: 'chart-1', kind: 'chart', w: 6 }] });
    expect(board?.widgets).toHaveLength(2);
    const [a, b] = board?.widgets as DashboardWidget[];
    expect(overlaps(a, b)).toBe(false);
  });

  it('위젯 개수 한도를 넘기지 않는다', () => {
    const many = Array.from({ length: DASH_MAX_WIDGETS + 5 }, (_unused, index) => ({ id: `gauge-${index + 1}`, kind: 'gauge', x: 0, y: 0, w: 3, h: 4 }));
    const board = sanitizeBoard({ version: BOARD_VERSION, widgets: many });
    expect(board?.widgets).toHaveLength(DASH_MAX_WIDGETS);
  });

  it('쓸 만한 위젯이 하나도 없으면 null이다(화면은 처음 판으로 간다)', () => {
    expect(sanitizeBoard({ version: BOARD_VERSION, widgets: [{ kind: '없는것' }] })).toBeNull();
  });
});
