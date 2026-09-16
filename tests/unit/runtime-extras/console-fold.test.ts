// 콘솔 오래된 줄 접기의 순수 논리(src/lab/modules/runtime-extras/console-fold.ts) — 몇 조각을 접고 버릴지, 줄 수 세기, 버튼 글(P2-10).
// 실제 콘솔에 붙는 동작(MutationObserver·[펼치기]·[콘솔 지우기])은 tests/e2e/lab-runner.spec.ts가 본다.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOLD_LIMITS,
  FOLD_TOTAL_MAX,
  FOLD_VISIBLE_MAX,
  countLines,
  foldToggleText,
  planFold,
} from '../../../src/lab/modules/runtime-extras/console-fold.ts';

/** 실습실 콘솔 틀(src/lab/controls/lab-shell.ts)의 MAX_CONSOLE_LINES. 그 파일은 CodeMirror까지 함께 불러오므로 값만 적어 둔다. */
const LAB_SHELL_MAX_CONSOLE_LINES = 2000;

describe('접기 계획', () => {
  it('보이는 조각이 상한 아래면 아무것도 하지 않는다', () => {
    expect(planFold(0, 0)).toEqual({ moveToFold: 0, dropFromFold: 0 });
    expect(planFold(FOLD_VISIBLE_MAX, 0)).toEqual({ moveToFold: 0, dropFromFold: 0 });
  });

  it('상한을 넘은 만큼만 접는다', () => {
    expect(planFold(FOLD_VISIBLE_MAX + 12, 0)).toEqual({ moveToFold: 12, dropFromFold: 0 });
  });

  it('접힌 것까지 합쳐 전체 상한을 넘으면 가장 오래된 접힌 조각부터 버린다', () => {
    const foldCapacity = FOLD_TOTAL_MAX - FOLD_VISIBLE_MAX;
    expect(planFold(FOLD_VISIBLE_MAX + 5, foldCapacity)).toEqual({ moveToFold: 5, dropFromFold: 5 });
    expect(planFold(FOLD_VISIBLE_MAX, foldCapacity + 3)).toEqual({ moveToFold: 0, dropFromFold: 3 });
  });

  it('상한은 실습실 콘솔 자체의 상한(2,000조각)보다 커지지 않는다 — 접기가 켜져 있으면 콘솔 틀이 앞에서 지우지 않는다', () => {
    expect(FOLD_VISIBLE_MAX).toBeLessThan(LAB_SHELL_MAX_CONSOLE_LINES);
    expect(FOLD_TOTAL_MAX).toBeGreaterThan(FOLD_VISIBLE_MAX);
    expect(DEFAULT_FOLD_LIMITS).toEqual({ visibleMax: FOLD_VISIBLE_MAX, totalMax: FOLD_TOTAL_MAX });
  });

  it('상한을 직접 넘길 수 있다(테스트·좁은 화면용)', () => {
    expect(planFold(10, 4, { visibleMax: 3, totalMax: 8 })).toEqual({ moveToFold: 7, dropFromFold: 6 });
  });
});

describe('줄 수 세기와 버튼 글', () => {
  it('마지막 줄바꿈 뒤에 글자가 없으면 그 줄은 세지 않는다', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('한 줄\n')).toBe(1);
    expect(countLines('한 줄')).toBe(1);
    expect(countLines('1\n2\n3\n')).toBe(3);
    expect(countLines('1\n2\n3')).toBe(3);
    expect(countLines('\n\n')).toBe(2);
  });

  it('버튼 글은 접힌 줄 수를 한국어로 알려 준다', () => {
    expect(foldToggleText(1234, false)).toBe('이전 출력 1,234줄 접힘 — 펼치기');
    expect(foldToggleText(1234, true)).toBe('이전 출력 1,234줄 — 다시 접기');
  });
});
