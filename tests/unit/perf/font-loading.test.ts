// 글꼴 CSS를 켜는 때(src/layouts/BaseLayout.astro의 window.__apcFontCss — 판 1.1.0, PROGRESS 미해결 194)의 단위 테스트.
//
// 규칙: 글꼴 CSS는 media="print"로 받기 시작한다(첫 그리기를 막지 않게 — DECISIONS C16). CSS가 도착하면
//  - 느린 망이면 window load 뒤에 켠다(글꼴 조각 290~675KB가 퀴즈·용어 풀이 스크립트와 회선을 다투지 않게 — DCL·load가 당겨진다).
//    느린 망 = ① 글꼴 CSS를 받는 데 0.5초 넘게 ② 이 쪽 HTML을 받는 데(요청 → 응답 끝) 0.5초 넘게 ③ navigator.connection.effectiveType이 2g·3g
//    (②③은 1.1.0 검토 반영 — 실사이트는 둘째 쪽부터 글꼴 CSS가 캐시에서 곧바로 와서 ①만으로는 몰랐다, DECISIONS C59)
//  - 빠른 망이면 곧바로 켠다(전과 같다). HTML이 아직 오는 중이면(응답 끝을 모름) 구문 분석이 끝날 때 다시 본다.
//  - 이미 load가 지났거나, 잴 수 없으면(Timing 없음·오류) 곧바로 켠다
// 이 파일은 BaseLayout 소스에서 그 작은 스크립트를 꺼내 가짜 window·performance·document·navigator로 돌려 본다. 실제 브라우저에서 3G일 때
// 글꼴이 load 뒤에 나가는지는 tests/e2e/perf-timing.spec.ts(perf 무리)가, 홈 → 실습실(둘째 쪽 — 글꼴 CSS가 캐시에서 옴)은
// tests/e2e/perf-scenario-a.spec.ts(회선 흉내 프록시가 GitHub Pages처럼 max-age=600을 준다)가 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const LAYOUT = fs.readFileSync(path.join(ROOT, 'src', 'layouts', 'BaseLayout.astro'), 'utf8');
const FONT_CSS = 'http://localhost:4329/ai-physical-computing/fonts/pretendard/pretendardvariable-dynamic-subset.css';

/** BaseLayout의 <script is:inline> 가운데 __apcFontCss를 정의하는 것 */
function fontScript(): string {
  const match = /<script is:inline>\s*(window\.__apcFontCss = function[\s\S]*?)<\/script>/u.exec(LAYOUT);
  expect(match, 'BaseLayout.astro에 window.__apcFontCss를 정의하는 인라인 스크립트가 있다').not.toBeNull();
  return match?.[1] ?? '';
}

interface Situation {
  /** 글꼴 CSS의 Resource Timing duration(ms). null이면 항목이 없다 */
  readonly duration: number | null;
  readonly readyState?: DocumentReadyState;
  /** getEntriesByName이 오류를 던진다 */
  readonly throws?: boolean;
  /** 이 쪽 HTML의 Navigation Timing(requestStart·responseEnd, ms). null이면 항목이 없다(기본 — 빠른 쪽: 요청 10ms, 응답 끝 90ms) */
  readonly navigation?: { requestStart: number; responseEnd: number } | null;
  /** navigator.connection.effectiveType(없으면 connection 없음) */
  readonly effectiveType?: string;
}

function run(situation: Situation) {
  const listeners: { type: string; listener: () => void; options: unknown }[] = [];
  const documentListeners: { type: string; listener: () => void; options: unknown }[] = [];
  const link = { href: FONT_CSS, media: 'print' };
  const fakeWindow: { addEventListener: (type: string, listener: () => void, options: unknown) => void; __apcFontCss?: (link: unknown) => void } = {
    addEventListener: (type, listener, options) => listeners.push({ type, listener, options }),
  };
  const navigation = situation.navigation === undefined ? { requestStart: 10, responseEnd: 90 } : situation.navigation;
  const fakePerformance = {
    getEntriesByName: (name: string) => {
      if (situation.throws) {
        throw new Error('Resource Timing을 쓸 수 없음');
      }
      return situation.duration !== null && name === FONT_CSS ? [{ name, duration: situation.duration }] : [];
    },
    getEntriesByType: (type: string) => (type === 'navigation' && navigation !== null ? [navigation] : []),
  };
  const fakeDocument = {
    readyState: situation.readyState ?? 'interactive',
    addEventListener: (type: string, listener: () => void, options: unknown) => documentListeners.push({ type, listener, options }),
  };
  const fakeNavigator = situation.effectiveType === undefined ? {} : { connection: { effectiveType: situation.effectiveType } };
  new Function('window', 'performance', 'document', 'navigator', fontScript())(fakeWindow, fakePerformance, fakeDocument, fakeNavigator);
  expect(typeof fakeWindow.__apcFontCss).toBe('function');
  fakeWindow.__apcFontCss?.(link);
  return { link, listeners, documentListeners, navigation, fakeDocument };
}

describe('글꼴 CSS를 켜는 때(미해결 194)', () => {
  it('빠른 망·캐시(글꼴 CSS·쪽 HTML 모두 0.5초 안)면 곧바로 켠다 — 전과 같다', () => {
    for (const duration of [0, 3, 120, 499]) {
      const { link, listeners, documentListeners } = run({ duration });
      expect(link.media, `${duration}ms`).toBe('all');
      expect(listeners).toEqual([]);
      expect(documentListeners).toEqual([]);
    }
  });

  it('글꼴 CSS가 느리면(0.5초 넘게) window load 뒤에 한 번 켠다', () => {
    for (const duration of [500, 700, 2364]) {
      const { link, listeners } = run({ duration, readyState: 'interactive' });
      expect(link.media, `${duration}ms — load 전에는 켜지 않는다`).toBe('print');
      expect(listeners.map((item) => [item.type, item.options])).toEqual([['load', { once: true }]]);
      listeners[0]?.listener();
      expect(link.media).toBe('all');
    }
    // 구문 분석 중(loading)에 CSS가 먼저 와도 같다
    expect(run({ duration: 2300, readyState: 'loading' }).link.media).toBe('print');
  });

  it('글꼴 CSS가 캐시에서 곧바로 와도 이 쪽 HTML이 느리게 왔으면(둘째 쪽 — 실사이트 max-age=600) load 뒤에 켠다', () => {
    for (const navigation of [
      { requestStart: 100, responseEnd: 600 },
      { requestStart: 1_900, responseEnd: 4_300 },
    ]) {
      const { link, listeners } = run({ duration: 0, navigation });
      expect(link.media, JSON.stringify(navigation)).toBe('print');
      expect(listeners.map((item) => item.type)).toEqual(['load']);
      listeners[0]?.listener();
      expect(link.media).toBe('all');
    }
    // 쪽 HTML이 빨리 왔으면 그대로 곧바로
    expect(run({ duration: 0, navigation: { requestStart: 100, responseEnd: 599 } }).link.media).toBe('all');
  });

  it('HTML이 아직 오는 중이면(응답 끝을 모름) 켜지 않고 구문 분석이 끝날 때(readystatechange) 다시 본다', () => {
    // 느린 쪽: 구문 분석이 끝났을 때 HTML이 0.5초 넘게 걸렸다 → load 뒤
    const slow = run({ duration: 1, readyState: 'loading', navigation: { requestStart: 50, responseEnd: 0 } });
    expect(slow.link.media).toBe('print');
    expect(slow.documentListeners.map((item) => [item.type, item.options])).toEqual([['readystatechange', { once: true }]]);
    slow.navigation!.responseEnd = 2_600;
    slow.fakeDocument.readyState = 'interactive';
    slow.documentListeners[0]?.listener();
    expect(slow.link.media).toBe('print');
    expect(slow.listeners.map((item) => item.type)).toEqual(['load']);
    slow.listeners[0]?.listener();
    expect(slow.link.media).toBe('all');
    // 빠른 쪽: 곧바로 켠다(load를 기다리지 않는다)
    const fast = run({ duration: 1, readyState: 'loading', navigation: { requestStart: 50, responseEnd: 0 } });
    fast.navigation!.responseEnd = 180;
    fast.fakeDocument.readyState = 'interactive';
    fast.documentListeners[0]?.listener();
    expect(fast.link.media).toBe('all');
    expect(fast.listeners).toEqual([]);
  });

  it('브라우저가 느린 망(2g·3g)이라고 알려 주면 load 뒤에 켠다(4g·모름이면 곧바로)', () => {
    for (const effectiveType of ['slow-2g', '2g', '3g']) {
      expect(run({ duration: 0, effectiveType }).link.media, effectiveType).toBe('print');
    }
    expect(run({ duration: 0, effectiveType: '4g' }).link.media).toBe('all');
  });

  it('느려도 load가 이미 지났으면(complete) 곧바로 켠다 — 영영 안 켜지는 일이 없다', () => {
    const { link, listeners } = run({ duration: 2364, readyState: 'complete', navigation: { requestStart: 0, responseEnd: 9_000 } });
    expect(link.media).toBe('all');
    expect(listeners).toEqual([]);
  });

  it('잴 수 없으면(Timing 항목이 없거나 오류) 전처럼 곧바로 켠다', () => {
    expect(run({ duration: null, navigation: null }).link.media).toBe('all');
    expect(run({ duration: 3000, throws: true }).link.media).toBe('all');
  });
});

describe('BaseLayout 마크업', () => {
  it('글꼴 CSS는 media="print"로 받고, 도착하면 __apcFontCss가 켠다(없으면 전처럼 바로 all). 자바스크립트가 꺼져 있으면 noscript', () => {
    const link = /<link\s+rel="stylesheet"\s+href=\{withBase\('fonts\/pretendard\/pretendardvariable-dynamic-subset\.css'\)\}\s+media="print"\s+onload="([^"]+)"\s*\/>/u.exec(LAYOUT);
    expect(link, '글꼴 CSS link').not.toBeNull();
    expect(link?.[1]).toBe("window.__apcFontCss ? window.__apcFontCss(this) : this.setAttribute('media','all')");
    expect(LAYOUT).toContain("<noscript><link rel=\"stylesheet\" href={withBase('fonts/pretendard/pretendardvariable-dynamic-subset.css')} /></noscript>");
    // 스크립트가 link보다 앞에 있다(CSS가 캐시에서 곧바로 와도 함수가 있다)
    expect(LAYOUT.indexOf('window.__apcFontCss = function')).toBeLessThan(link?.index ?? -1);
    // 인라인 처리기 안의 addEventListener는 link 요소 것이 되므로(범위 사슬) 스크립트 안에서 window·document를 꼭 적는다
    expect(fontScript()).toContain("window.addEventListener('load'");
    expect(fontScript()).toMatch(/document\.addEventListener\(\s*'readystatechange'/u);
    expect(fontScript()).toMatch(/var FONT_CSS_SLOW_MS = 500;/u);
    // 쪽 HTML에 실리는 스크립트라 안에는 주석을 두지 않는다(설명은 중괄호 주석 — 쪽에 실리지 않음)
    expect(fontScript()).not.toMatch(/\/\/|\/\*/u);
  });

  it('기다리는 동안 보이는 대체 글꼴(Pretendard Fallback — 폭·높이를 맞춘 맑은 고딕)이 그대로 있다', () => {
    const fonts = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'fonts.css'), 'utf8');
    expect(fonts).toMatch(/font-family: 'Pretendard Fallback';[\s\S]*?local\('Malgun Gothic'\)[\s\S]*?size-adjust: 86%;/u);
    const tokens = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'tokens.css'), 'utf8');
    expect(tokens).toMatch(/--font-sans: 'Pretendard Variable', Pretendard, 'Pretendard Fallback',/u);
  });
});
