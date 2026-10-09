// 공용 아이콘 표(src/components/common/icons.ts)와 Icon.astro 약속 검사.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ICONS, ICON_NAMES, isIconName } from '../../src/components/common/icons.ts';

/** 설계서 2절이 정한 이름 36개(다른 구역이 이 이름으로 코드를 쓴다) */
const REQUIRED = [
  'home', 'search', 'flag', 'book', 'flask', 'teacher', 'lifebuoy', 'glossary', 'camera', 'chip', 'plug', 'signal', 'bluetooth', 'wifi', 'grid',
  'alert', 'check', 'check-circle', 'circle', 'arrow-right', 'arrow-left', 'chevron-right', 'chevron-down', 'menu', 'close', 'play', 'stop', 'clock',
  'settings', 'external', 'lightbulb', 'map', 'monitor', 'sparkles', 'list', 'eye',
];

function dOf(part: string | { solid: string }): string {
  return typeof part === 'string' ? part : part.solid;
}

/** path d에서 숫자 인자까지 대충 걸러 보는 간단한 문법 검사: 명령 글자 뒤에 숫자가 오고 처음은 M */
const D_PATTERN = /^[Mm][\d\s.,\-+MmLlHhVvCcSsQqTtAaZz]*$/u;

describe('아이콘 이름', () => {
  it('설계서 이름이 모두 있다', () => {
    for (const name of REQUIRED) {
      expect(ICON_NAMES, name).toContain(name);
    }
  });

  it('이름이 겹치지 않고 소문자·하이픈 모양이다', () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    for (const name of ICON_NAMES) {
      expect(name).toMatch(/^[a-z]+(?:-[a-z]+)*$/u);
    }
  });

  it('ICON_NAMES와 ICONS의 이름이 정확히 같다', () => {
    expect(Object.keys(ICONS).sort()).toEqual([...ICON_NAMES].sort());
  });

  it('isIconName', () => {
    expect(isIconName('home')).toBe(true);
    expect(isIconName('nope')).toBe(false);
    expect(isIconName(3)).toBe(false);
  });
});

describe('아이콘 모양', () => {
  it.each(ICON_NAMES)('%s: path가 하나 이상이고 d 값이 올바른 모양이다', (name) => {
    const parts = ICONS[name];
    expect(parts.length, `${name}에 조각이 없어요`).toBeGreaterThan(0);
    for (const part of parts) {
      const d = dOf(part);
      expect(d.length, name).toBeGreaterThan(3);
      expect(d, `${name}: ${d}`).toMatch(D_PATTERN);
      expect(d, `${name}에 NaN이 들어갔어요`).not.toMatch(/NaN|undefined|Infinity/u);
    }
  });

  it('좌표가 24 격자 안(-1~25)에 있다(절대 좌표 명령의 숫자만 대략 확인)', () => {
    for (const name of ICON_NAMES) {
      for (const part of ICONS[name]) {
        const d = dOf(part);
        // 대문자 명령(절대 좌표)만 본다. 호(A)의 반지름·각도·플래그는 격자 좌표가 아니므로 뺀다.
        for (const match of d.matchAll(/[MLHVC]\s*(-?[\d.]+(?:[\s,]+-?[\d.]+)*)/gu)) {
          for (const number of match[1].split(/[\s,]+/u)) {
            const value = Number(number);
            expect(value, `${name}: ${d}`).toBeGreaterThanOrEqual(-1);
            expect(value, `${name}: ${d}`).toBeLessThanOrEqual(25);
          }
        }
      }
    }
  });
});

describe('Icon.astro 약속', () => {
  const source = readFileSync(new URL('../../src/components/common/Icon.astro', import.meta.url), 'utf8');

  it('24 격자·currentColor 선·굵기 2·둥근 끝', () => {
    expect(source).toContain('viewBox="0 0 24 24"');
    expect(source).toContain('stroke="currentColor"');
    expect(source).toContain('stroke-width="2"');
    expect(source).toContain('stroke-linecap="round"');
    expect(source).toContain('stroke-linejoin="round"');
    expect(source).toContain('fill="none"');
  });

  it('label이 없으면 aria-hidden·focusable=false, 있으면 role=img와 aria-label', () => {
    expect(source).toContain(`aria-hidden={decorative ? 'true' : undefined}`);
    expect(source).toContain('focusable="false"');
    expect(source).toContain(`role={decorative ? undefined : 'img'}`);
    expect(source).toContain('aria-label={decorative ? undefined : label}');
    expect(source).toContain('const decorative = label === undefined || label === \'\'');
  });

  it('크기는 토큰(--icon-sm·md·lg)을 쓰고 아이콘 표는 icons.ts에서 읽는다', () => {
    for (const token of ['--icon-sm', '--icon-md', '--icon-lg']) {
      expect(source).toContain(token);
    }
    expect(source).toContain(`from './icons.ts'`);
  });

  it('토큰이 tokens.css에 정의되어 있다', () => {
    const tokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
    for (const token of ['--icon-sm', '--icon-md', '--icon-lg', '--unit-1', '--unit-4-soft', '--radius-xl', '--shadow-lg', '--header-height']) {
      expect(tokens, token).toMatch(new RegExp(`${token}:`, 'u'));
    }
  });
});
