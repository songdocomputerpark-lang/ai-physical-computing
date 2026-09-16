// 가상 브라우저(P2-12)의 순수 논리 검사 — 주소 살펴보기(허용 목록), 사이트 안 검색, 창 안 흐름(주소창·검색창·결과·쪽 보기).
// f023(webbrowser.open)·f024(검색어 치고 Enter)가 가상 데스크톱에서 어떻게 도는지를 여기서 못 박는다.
// 브라우저에서의 실제 동작은 tests/e2e/lab-desktop2.spec.ts, 파이썬 쪽은 tests/unit/pyautogui/pyodide-pyautogui.test.ts가 본다.
import { describe, expect, it } from 'vitest';
import { siteConfig } from '../../../src/config/site.ts';
import {
  DEFAULT_ENTRIES,
  MAX_RESULTS,
  PRACTICE_URL,
  SITE_ENTRIES,
  classifyUrl,
  entryOfPath,
  searchSite,
  searchTokens,
} from '../../../src/lab/modules/desktop/browser.ts';
import { DesktopModel } from '../../../src/lab/modules/desktop/model.ts';

function fresh(): DesktopModel {
  return new DesktopModel(1920, 1080, { now: () => 1_700_000_000_000 });
}

describe('주소 살펴보기(허용 목록)', () => {
  it('우리 사이트 주소는 "진짜로 열 수 있다"로, 그 밖의 주소는 "가상 브라우저에서만"으로 알린다', () => {
    const outside = classifyUrl('https://www.naver.com/');
    expect(outside.kind).toBe('outside');
    expect(outside.path).toBeNull();
    expect(outside.notice).toContain('가상 브라우저에서만 열려요');
    expect(outside.notice).toContain('진짜 인터넷');

    const site = classifyUrl(`${siteConfig.origin}${siteConfig.base}/labs/vision/`);
    expect(site.kind).toBe('site');
    expect(site.path).toBe('/labs/vision/');
    expect(site.notice).toContain('우리 사이트');

    // 개발 서버(localhost)와 같은 하위 경로, 그리고 하위 경로로 시작하는 상대 주소도 우리 사이트로 본다
    expect(classifyUrl(`http://localhost:4406${siteConfig.base}/learn/`).path).toBe('/learn/');
    expect(classifyUrl(`${siteConfig.base}/glossary/`).path).toBe('/glossary/');
    // 하위 경로가 다르면 남의 주소다(같은 도메인이라도)
    expect(classifyUrl(`${siteConfig.origin}/다른-프로젝트/`).kind).toBe('outside');
    expect(classifyUrl('').kind).toBe('empty');
  });

  it('사이트 안 경로로 그 쪽을 찾는다', () => {
    expect(entryOfPath('/labs/vision/')?.title).toBe('영상처리 실습실');
    expect(entryOfPath('/labs/vision')?.title).toBe('영상처리 실습실'); // 끝 / 가 없어도
    expect(entryOfPath('/없는/쪽/')).toBeNull();
    expect(entryOfPath(null)).toBeNull();
  });
});

describe('연습 검색(이 사이트 안만 찾는다)', () => {
  it('찾는 목록은 모두 이 사이트에 실제로 있는 쪽이다(가짜 결과를 지어내지 않는다)', () => {
    expect(SITE_ENTRIES.length).toBeGreaterThan(8);
    for (const entry of SITE_ENTRIES) {
      expect(entry.path.startsWith('/')).toBe(true);
      expect(entry.path.endsWith('/')).toBe(true);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
    expect(DEFAULT_ENTRIES.map((entry) => entry.path)).toContain('/labs/vision/');
  });

  it('f024의 영어 검색어("PYAUTOGUI tutorial")도 가상 데스크톱 쪽에 닿는다', () => {
    expect(searchTokens('PYAUTOGUI tutorial')).toEqual(['pyautogui', 'tutorial']);
    const result = searchSite('PYAUTOGUI tutorial');
    expect(result.fallback).toBe(false);
    expect(result.entries.length).toBeLessThanOrEqual(MAX_RESULTS);
    expect(result.entries[0]?.path).toBe('/labs/vision/');
  });

  it('한국어 낱말도 찾고, 맞는 것이 없으면 기본 차례를 보여 준다', () => {
    expect(searchSite('용어').entries.some((entry) => entry.path === '/glossary/')).toBe(true);
    const none = searchSite('zzzzzz없는낱말');
    expect(none.fallback).toBe(true);
    expect(none.entries).toEqual(DEFAULT_ENTRIES);
    expect(searchSite('   ').fallback).toBe(true);
  });
});

describe('가상 브라우저 창', () => {
  it('webbrowser.open이 창을 열고, 밖의 주소면 "가상 브라우저에서만" 안내가 붙는다(f023)', () => {
    const model = fresh();
    const action = model.openBrowser('https://www.naver.com/');
    expect(model.windowOfKind('browser')).not.toBeNull();
    expect(model.focusedWindow?.kind).toBe('browser');
    expect(model.browser.url).toBe('https://www.naver.com/');
    expect(model.browser.view).toBe('practice');
    expect(model.browser.field).toBe('search');
    expect(action).toContain('가상 브라우저에서만 열려요');
    expect(model.focusedWindow?.title).toContain('https://www.naver.com/');
  });

  it('창이 열린 뒤 친 글자는 검색창에 들어가고 Enter가 결과를 연다(f024 사이트판 흐름)', () => {
    const model = fresh();
    model.openBrowser('https://www.google.com/');
    for (const char of 'PYAUTOGUI tutorial') {
      model.key('down', char, char);
    }
    expect(model.browser.query).toBe('PYAUTOGUI tutorial');
    expect(model.notepadText).toBe(''); // 메모장이 아니라 브라우저로 갔다
    expect(model.windowOfKind('notepad')).toBeNull();

    model.key('down', 'enter', '\n');
    expect(model.browser.view).toBe('results');
    expect(model.browser.results?.entries.length).toBeGreaterThan(0);
    expect(model.lastAction).toContain('이 사이트 안의 쪽');

    // 결과 한 줄을 누르면 그 쪽 요약이 열린다
    const window = model.windowOfKind('browser')!;
    const row = model.browserResultRects(window)[0]!;
    model.click(row.x + 20, row.y + 20);
    expect(model.browser.view).toBe('page');
    expect(model.browser.page?.title).toBe(model.browser.results!.entries[0]!.title);
  });

  it('주소창을 눌러 주소를 치면 그 자리로 옮겨 가고, 우리 사이트 주소는 쪽을 연다', () => {
    const model = fresh();
    model.openBrowser('https://www.naver.com/');
    const window = model.windowOfKind('browser')!;
    const bar = model.browserBarRects(window);
    model.click(bar.address.x + 10, bar.address.y + 10);
    expect(model.browser.field).toBe('address');
    expect(model.hitTest(bar.go.x + 10, bar.go.y + 10).kind).toBe('browser-go');

    // 주소창 글자를 모두 지우고 사이트 안 주소를 친다
    for (let index = 0; index < 60; index += 1) {
      model.key('down', 'backspace');
    }
    expect(model.browser.url).toBe('');
    for (const char of `${siteConfig.base}/labs/vision/`) {
      model.key('down', char, char);
    }
    model.key('down', 'enter', '\n');
    expect(model.browser.view).toBe('page');
    expect(model.browser.page?.path).toBe('/labs/vision/');
    expect(model.browser.info.kind).toBe('site');
  });

  it('처음 상태로 돌리면 가상 브라우저도 연습 검색 페이지로 돌아간다', () => {
    const model = fresh();
    model.openBrowser('https://example.com/');
    model.browserType('무엇');
    model.reset();
    expect(model.windowOfKind('browser')).toBeNull();
    expect(model.browser.url).toBe(PRACTICE_URL);
    expect(model.browser.query).toBe('');
  });
});
