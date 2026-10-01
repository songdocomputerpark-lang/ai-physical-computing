// 옆으로 넘치는 표·코드 칸의 "더 볼 것이 있어요" 그늘 판단(src/components/common/scroll-focus.ts의 scrollMoreOf) — 2026-09-30 최종 점검 MA-02.
// 브라우저 동작(휴대폰 폭에서 그늘이 생기고 끝까지 밀면 사라짐)은 tests/e2e/learn.spec.ts가 본다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCROLL_MORE_ATTRIBUTE, scrollMoreOf } from '../../src/components/common/scroll-focus.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..');

describe('scrollMoreOf — 가로로 아직 안 보이는 쪽', () => {
  it('넘치지 않으면(반올림 1px 차이 포함) 그늘이 없다', () => {
    expect(scrollMoreOf({ scrollWidth: 343, clientWidth: 343, scrollLeft: 0 })).toBe('none');
    expect(scrollMoreOf({ scrollWidth: 344, clientWidth: 343, scrollLeft: 0 })).toBe('none');
  });

  it('처음(왼쪽 끝)에는 오른쪽에, 가운데에서는 양쪽에, 끝까지 밀면 왼쪽에만', () => {
    const box = { scrollWidth: 451, clientWidth: 343 };
    expect(scrollMoreOf({ ...box, scrollLeft: 0 })).toBe('end');
    expect(scrollMoreOf({ ...box, scrollLeft: 50 })).toBe('both');
    expect(scrollMoreOf({ ...box, scrollLeft: 108 })).toBe('start');
    // 브라우저가 끝을 소수로 멈춰도(107.5) 끝까지 민 것으로 본다
    expect(scrollMoreOf({ ...box, scrollLeft: 107.5 })).toBe('start');
  });

  it('오른쪽에서 왼쪽으로 쓰는 쪽(scrollLeft가 음수)도 민 거리로 판단한다', () => {
    expect(scrollMoreOf({ scrollWidth: 451, clientWidth: 343, scrollLeft: -50 })).toBe('both');
  });

  it('global.css가 속성의 세 값마다 그늘을 그린다', () => {
    const css = fs.readFileSync(path.join(rootDir, 'src', 'styles', 'global.css'), 'utf8');
    for (const value of ['end', 'start', 'both']) {
      expect(css).toContain(`[${SCROLL_MORE_ATTRIBUTE}='${value}']`);
    }
  });
});
