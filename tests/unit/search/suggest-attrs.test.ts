// 자동 완성이 읽는 설정(src/components/search/suggest-attrs.ts)과 추천 낱말(src/config/search.ts popularWords) 약속.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenPages, learnUnits } from '../../../src/config/nav.ts';
import { searchConfig } from '../../../src/config/search.ts';
import { parseSections, parseStringList, planSearch } from '../../../src/components/search/search-core.ts';
import { pathDepth, suggestConfigAttrs, suggestSections } from '../../../src/components/search/suggest-attrs.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');

describe('위치 표시용 이름 표', () => {
  it('pathDepth: 경로 칸 수', () => {
    expect(pathDepth('/')).toBe(0);
    expect(pathDepth('/labs/')).toBe(1);
    expect(pathDepth('/labs/esp32/')).toBe(2);
    expect(pathDepth('/labs/esp32/check/')).toBe(3);
  });

  it('깊이 2 이하인 사이트 지도 쪽과 대단원만 담는다(모든 쪽 HTML에 들어가므로 작게)', () => {
    const sections = suggestSections();
    expect(sections.length).toBeGreaterThan(10);
    expect(sections.every((section) => pathDepth(section.path) <= 2)).toBe(true);
    expect(sections.some((section) => section.path === '/')).toBe(false);
    const paths = sections.map((section) => section.path);
    expect(paths).toContain('/learn/');
    expect(paths).toContain('/labs/');
    for (const unit of learnUnits) {
      expect(paths, unit.id).toContain(unit.path);
    }
    // 전체 표보다 확실히 작다
    expect(sections.length).toBeLessThan([...flattenPages(), ...learnUnits].length);
    expect(JSON.stringify(sections).length).toBeLessThan(2500);
  });
});

describe('머리글 검색 폼에 달리는 속성', () => {
  const attrs = suggestConfigAttrs();

  it('설정을 한 곳(searchConfig)에서 받는다', () => {
    expect(attrs['data-bundle-path']).toBe(searchConfig.bundlePath);
    expect(attrs['data-base-url']).toBe(searchConfig.baseUrl);
    expect(attrs['data-query-param']).toBe(searchConfig.queryParam);
    expect(parseStringList(attrs['data-anchor-pages'])).toEqual([...searchConfig.anchorPages]);
    expect(parseStringList(attrs['data-popular'])).toEqual([...searchConfig.popularWords]);
    expect(parseSections(attrs['data-sections'])).toEqual(suggestSections());
    expect('data-suggest-config' in attrs).toBe(true);
  });
});

describe('많이 찾는 낱말(popularWords)', () => {
  it('설계서의 일곱 낱말이다', () => {
    expect([...searchConfig.popularWords]).toEqual(['손 인식', '임계값', 'LED', '서보', '블루투스', 'NameError', '카메라가 안 켜져요']);
  });

  it('모두 찾을 계획이 서고(뜻 없는 입력이 아니다), "카메라가 안 켜져요"는 사이트 글의 말투로 바꿔 찾는다(R1-014)', () => {
    for (const word of searchConfig.popularWords) {
      expect(planSearch(word), word).not.toBeNull();
    }
    expect(planSearch('카메라가 안 켜져요')?.terms[0]).toBe('카메라가 켜지지 않아요');
  });

  it('겹치지 않고, 앞뒤 공백·특수 글자가 없다(주소 이름에 그대로 실린다)', () => {
    expect(new Set(searchConfig.popularWords).size).toBe(searchConfig.popularWords.length);
    for (const word of searchConfig.popularWords) {
      expect(word, word).toBe(word.trim());
      expect(word, word).toMatch(/^[\p{L}\p{N} ]+$/u);
      expect(word.length, word).toBeLessThanOrEqual(20);
    }
  });

  it('검색 쪽 처음 화면의 예시 낱말("픽셀"·"카메라"·"라이선스")과 이름이 겹치지 않는다(링크 이름이 하나여야 한다)', () => {
    for (const example of ['픽셀', '카메라', '라이선스']) {
      expect([...searchConfig.popularWords]).not.toContain(example);
    }
  });
});

describe('브라우저로 가는 코드에 무거운 것이 묶이지 않는다', () => {
  // 머리글 자동 완성 스크립트는 모든 쪽이 받는다. 사이트 설정·아이콘 표 전체·라이브러리를 끌어오지 않는다.
  const files = ['search-suggest.ts', 'search-core.ts', 'search-icons.ts', 'search-rank.ts', 'search-hint.ts'];
  it.each(files)('%s는 사이트 설정(site.ts)·공용 아이콘 표·실습실 라이브러리를 불러오지 않는다', (name) => {
    const text = readFileSync(path.join(rootDir, 'src', 'components', 'search', name), 'utf8');
    const imports = [...text.matchAll(/^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gmu)].map((match) => match[1] ?? '');
    for (const target of imports) {
      expect(target, `${name}: ${target}`).toMatch(/^\.\/search-(?:core|icons|suggest|rank|hint)\.ts$/u);
    }
    expect(text).not.toMatch(/pyodide|mediapipe|blockly|mqtt\.js|codemirror|esptool/iu);
  });

  it('pagefind.js는 쪽을 열 때가 아니라 loadPagefind가 불릴 때만 동적으로 불러온다', () => {
    const text = readFileSync(path.join(rootDir, 'src', 'components', 'search', 'search-core.ts'), 'utf8');
    expect(text).toMatch(/await import\(\/\* @vite-ignore \*\/ `\$\{config\.bundlePath\}pagefind\.js`\)/u);
    expect(text).not.toMatch(/^import .*pagefind/mu);
    const boot = readFileSync(path.join(rootDir, 'src', 'components', 'search', 'search-suggest.ts'), 'utf8');
    // 붙일 때(attachSuggest) 바로 부르지 않고 초점 처리기 안에서만 부른다
    const loadCalls = [...boot.matchAll(/loadPagefind\(config\)/gu)].length;
    expect(loadCalls).toBeGreaterThanOrEqual(2);
    expect(boot).toMatch(/addEventListener\('focus', \(\) => \{\s*\/\/[^\n]*\n\s*loadPagefind\(config\)/u);
  });
});
