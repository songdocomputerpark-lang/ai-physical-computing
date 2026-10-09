// @vitest-environment jsdom
// 찾기 화면의 작은 아이콘 표(search-icons.ts)가 공용 아이콘 표(common/icons.ts)와 같은 모양인지 본다.
import { describe, expect, it } from 'vitest';
import { ICONS, type IconPart } from '../../../src/components/common/icons.ts';
import { SEARCH_ICON_NAMES, SEARCH_ICON_PATHS, createSearchIcon } from '../../../src/components/search/search-icons.ts';

const joined = (parts: readonly IconPart[]): string => parts.map((part) => (typeof part === 'string' ? part : part.solid)).join(' ');

describe('찾기 아이콘 표', () => {
  it.each(SEARCH_ICON_NAMES)('%s: 공용 아이콘 표와 같은 모양이다', (name) => {
    expect(SEARCH_ICON_PATHS[name]).toBe(joined(ICONS[name]));
  });

  it('선만 있는 아이콘이다(꽉 찬 조각을 옮겨 오지 않았다)', () => {
    for (const name of SEARCH_ICON_NAMES) {
      expect(
        ICONS[name].every((part) => typeof part === 'string'),
        name,
      ).toBe(true);
    }
  });

  it('createSearchIcon: 꾸밈 svg(낭독 제외, 초점 없음, currentColor 선)를 만든다', () => {
    const svg = createSearchIcon('book');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.querySelector('path')?.getAttribute('d')).toBe(SEARCH_ICON_PATHS.book);
  });
});
