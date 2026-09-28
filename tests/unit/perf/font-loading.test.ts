// 글꼴 CSS를 켜는 때(src/layouts/BaseLayout.astro의 window.__apcFontCss — 판 1.1.0, PROGRESS 미해결 194)의 단위 테스트.
//
// 규칙: 글꼴 CSS는 media="print"로 받기 시작한다(첫 그리기를 막지 않게 — DECISIONS C16). CSS가 도착하면
//  - 받는 데 0.5초 안(빠른 망·서비스 워커·브라우저 캐시)이면 곧바로 켠다(전과 같다 — 다시 올 때마다 글꼴이 늦게 바뀌지 않게)
//  - 0.5초 넘게 걸린 느린 망이면 window load 뒤에 켠다(글꼴 조각 290~675KB가 퀴즈·용어 풀이 스크립트와 회선을 다투지 않게 — DCL·load가 당겨진다)
//  - 이미 load가 지났거나, 잴 수 없으면(Resource Timing 없음·오류) 곧바로 켠다
// 이 파일은 BaseLayout 소스에서 그 작은 스크립트를 꺼내 가짜 window·performance·document로 돌려 본다. 실제 브라우저에서 3G일 때 글꼴이
// load 뒤에 나가는지는 tests/e2e/perf-timing.spec.ts(perf 무리)가 본다.
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
}

function run(situation: Situation) {
  const listeners: { type: string; listener: () => void; options: unknown }[] = [];
  const link = { href: FONT_CSS, media: 'print' };
  const fakeWindow: { addEventListener: (type: string, listener: () => void, options: unknown) => void; __apcFontCss?: (link: unknown) => void } = {
    addEventListener: (type, listener, options) => listeners.push({ type, listener, options }),
  };
  const fakePerformance = {
    getEntriesByName: (name: string) => {
      if (situation.throws) {
        throw new Error('Resource Timing을 쓸 수 없음');
      }
      return situation.duration !== null && name === FONT_CSS ? [{ name, duration: situation.duration }] : [];
    },
  };
  const fakeDocument = { readyState: situation.readyState ?? 'interactive' };
  new Function('window', 'performance', 'document', fontScript())(fakeWindow, fakePerformance, fakeDocument);
  expect(typeof fakeWindow.__apcFontCss).toBe('function');
  fakeWindow.__apcFontCss?.(link);
  return { link, listeners };
}

describe('글꼴 CSS를 켜는 때(미해결 194)', () => {
  it('빠른 망·캐시(0.5초 안)면 곧바로 켠다 — 전과 같다', () => {
    for (const duration of [0, 3, 120, 499]) {
      const { link, listeners } = run({ duration });
      expect(link.media, `${duration}ms`).toBe('all');
      expect(listeners).toEqual([]);
    }
  });

  it('느린 망(0.5초 넘게)이면 window load 뒤에 한 번 켠다', () => {
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

  it('느려도 load가 이미 지났으면(complete) 곧바로 켠다 — 영영 안 켜지는 일이 없다', () => {
    const { link, listeners } = run({ duration: 2364, readyState: 'complete' });
    expect(link.media).toBe('all');
    expect(listeners).toEqual([]);
  });

  it('잴 수 없으면(Resource Timing 항목이 없거나 오류) 전처럼 곧바로 켠다', () => {
    expect(run({ duration: null }).link.media).toBe('all');
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
    // 인라인 처리기 안의 addEventListener는 link 요소 것이 되므로(범위 사슬) 스크립트 안에서 window를 꼭 적는다
    expect(fontScript()).toContain("window.addEventListener('load'");
    expect(fontScript()).toMatch(/var FONT_CSS_SLOW_MS = 500;/u);
  });

  it('기다리는 동안 보이는 대체 글꼴(Pretendard Fallback — 폭·높이를 맞춘 맑은 고딕)이 그대로 있다', () => {
    const fonts = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'fonts.css'), 'utf8');
    expect(fonts).toMatch(/font-family: 'Pretendard Fallback';[\s\S]*?local\('Malgun Gothic'\)[\s\S]*?size-adjust: 86%;/u);
    const tokens = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'tokens.css'), 'utf8');
    expect(tokens).toMatch(/--font-sans: 'Pretendard Variable', Pretendard, 'Pretendard Fallback',/u);
  });
});
