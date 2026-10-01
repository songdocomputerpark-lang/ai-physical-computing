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

/** src 아래 .astro·.ts 파일(저장소 뿌리 기준 경로) */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(?:astro|ts)$/u.test(entry.name) ? [full] : [];
  });
}

/** 줄이 쌓이는 기록 칸·줄을 접는 칸(가로로 넘치지 않거나 그늘이 맞지 않는 칸) — 그늘 규칙에서 뺀다 */
const SHADE_EXEMPT_CLASS = /(?:^|\s)(?:[\w-]+__(?:log|lines|console|notepad|request)|data-port__code)(?:\s|$)/u;

describe('가로로 넘칠 수 있는 코드 칸은 그늘 규칙도 쓴다(판 1.1.3 최종 전수 점검 2바퀴 ST2-01)', () => {
  // 그늘 규칙은 `.prose` 안의 표·코드 칸에만 저절로 붙어서, `.prose` 밖의 코드 칸(오류 사전 예시 코드·용어 파일 예시·직접 굽는 명령)은
  // 휴대폰에서 줄 끝이 잘린 채 끝난 것처럼 보였다. data-scroll-focus를 단 <pre>는 기록 칸이 아니면 data-scroll-shade도 단다.
  it('data-scroll-focus를 단 <pre> 가운데 기록 칸이 아닌 것은 모두 data-scroll-shade가 있다', () => {
    const missing: string[] = [];
    let checked = 0;
    for (const file of sourceFiles(path.join(rootDir, 'src'))) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/<pre\b[^>]*>/gu)) {
        const tag = match[0];
        if (!tag.includes('data-scroll-focus')) {
          continue;
        }
        const className = /\bclass="([^"]*)"/u.exec(tag)?.[1] ?? '';
        if (SHADE_EXEMPT_CLASS.test(className)) {
          continue;
        }
        checked += 1;
        if (!/\bdata-scroll-shade\b/u.test(tag)) {
          const line = text.slice(0, match.index).split('\n').length;
          missing.push(`${path.relative(rootDir, file).split(path.sep).join('/')}:${line} ${tag.slice(0, 80)}`);
        }
      }
    }
    // 훑기가 코드 칸을 하나도 못 찾으면 거짓으로 통과하지 않게(오류 사전·용어사전·굽기 명령 셋은 있어야 한다)
    expect(checked).toBeGreaterThanOrEqual(3);
    expect(missing, '가로로 넘칠 수 있는 코드 칸에는 data-scroll-shade도 붙여요(src/components/common/scroll-focus.ts 머리말)').toEqual([]);
  });

  it('기록 칸 빼기 규칙은 기록 칸만 뺀다', () => {
    for (const exempt of ['ble-real__lines', 'board-check__console', 'connect-check__log', 'desktop__notepad', 'port-help__request', 'data-port__code', 'fw__log']) {
      expect(SHADE_EXEMPT_CLASS.test(exempt), exempt).toBe(true);
    }
    for (const code of ['errors-entry__code', 'glossary-code', 'fw__code', 'fw__logbook']) {
      expect(SHADE_EXEMPT_CLASS.test(code), code).toBe(false);
    }
  });
});
