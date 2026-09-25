import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import packageJson from '../../package.json' with { type: 'json' };
import {
  checkLinks,
  extractCssReferences,
  extractHtmlReferences,
  formatLinkReport,
  siteFromHomepage,
} from '../../scripts/lib/link-check.mjs';
import { siteConfig } from '../../src/config/site.ts';
import { makeTempDir, removeDir, writeFiles } from './helpers/fixture.ts';

const site = { origin: 'https://example.github.io', base: '/demo' };
const CHECK_LINKS_CLI = path.resolve('scripts/check-links.mjs');

/** 가장 작은 페이지 HTML */
function page(body: string, head = ''): string {
  return `<!doctype html><html lang="ko"><head>${head}</head><body>${body}</body></html>`;
}

const tempDirs: string[] = [];

function makeDist(files: Record<string, string>): string {
  const dir = makeTempDir('link-check-');
  tempDirs.push(dir);
  writeFiles(dir, files);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    removeDir(dir);
  }
});

describe('사이트 주소 읽기', () => {
  it('package.json의 homepage가 src/config/site.ts의 도메인·base와 같다', () => {
    expect(siteFromHomepage(packageJson.homepage)).toEqual({ origin: siteConfig.origin, base: siteConfig.base });
  });
});

describe('주소 꺼내기', () => {
  it('HTML 속성(href·src·srcset·action)과 id를 읽고, 스크립트 안 글자·주석은 건너뛴다', () => {
    const html = page(
      [
        '<a href="/demo/credits/#third" id="top">출처</a>',
        '<img src="/demo/img/a.webp" srcset="/demo/img/a.webp 1x, /demo/img/a@2x.webp 2x" alt="">',
        '<form action="/demo/search/"></form>',
        '<script type="module" src="/demo/_astro/app.js">const s = \'<a href="/nope/">\';</script>',
        '<!-- <a href="/commented/"> -->',
        '<a name="old-anchor"></a>',
      ].join(''),
      `<meta property="og:url" content="${site.origin}/demo/"><meta name="description" content="${site.origin}/not-a-link/">`,
    );
    const { refs, ids } = extractHtmlReferences(html, site);
    expect(refs).toEqual([
      `${site.origin}/demo/`,
      '/demo/credits/#third',
      '/demo/img/a.webp',
      '/demo/img/a.webp',
      '/demo/img/a@2x.webp',
      '/demo/search/',
      '/demo/_astro/app.js',
    ]);
    expect([...ids]).toEqual(['top', 'old-anchor']);
  });

  it('CSS의 url(…)과 @import를 읽고 주석은 건너뛴다', () => {
    const css = '@import "./base.css"; /* url(nope.png) */ .a{background:url(./img/a.png)} @font-face{src:url("../fonts/b.woff2") format("woff2")}';
    expect(extractCssReferences(css)).toEqual(['./img/a.png', '../fonts/b.woff2', './base.css']);
  });
});

describe('링크 검사(checkLinks)', () => {
  it('사이트 안 페이지·자원·#위치가 모두 있으면 문제가 없고, 다른 사이트 주소는 건너뛴다', () => {
    const dist = makeDist({
      'index.html': page(
        [
          '<a href="#main">본문</a><main id="main">',
          '<a href="/demo/credits/">출처</a>',
          '<a href="/demo/credits/#third-party">제3자</a>',
          '<a href="./credits/">상대 주소</a>',
          '<a href="/demo/search/?q=%ED%94%BD%EC%85%80">검색</a>',
          '<a href="https://github.com/example">바깥</a><a href="mailto:someone@example.com">메일</a>',
          '<img src="/demo/images/pixel.webp" alt="">',
          `<a href="${site.origin}/demo/credits/">절대 주소</a>`,
          '</main>',
        ].join(''),
        '<link rel="stylesheet" href="/demo/fonts/font.css">',
      ),
      'credits/index.html': page('<h2 id="third-party">제3자</h2>'),
      'search/index.html': page('<h1>검색</h1>'),
      'images/pixel.webp': 'webp',
      'fonts/font.css': '@font-face{src:url(./a.woff2)}',
      'fonts/a.woff2': 'woff2',
    });
    const report = checkLinks(dist, site);
    expect(report.problems).toEqual([]);
    expect(report).toMatchObject({ pages: 3, stylesheets: 1, internal: 9, anchors: 2, external: 1 });
    expect(formatLinkReport(report, site)).toMatch(/^\[링크 검사\] 통과 — HTML 3개와 CSS 1개/u);
  });

  it('base가 빠진 주소, 없는 페이지·그림, 끝 슬래시 없는 페이지 주소, 없는 #위치를 찾아낸다', () => {
    const dist = makeDist({
      'index.html': page(
        [
          '<a href="/credits/">base 빠짐</a>',
          '<a href="/demo/no-such-page/">없는 페이지</a>',
          '<img src="/demo/images/missing.webp" alt="">',
          '<a href="/demo/credits">끝 슬래시 없음</a>',
          '<a href="/demo">base만</a>',
          '<a href="/demo/credits/#nope">없는 위치</a>',
          '<a href="#also-nope">이 페이지의 없는 위치</a>',
        ].join(''),
      ),
      'credits/index.html': page('<h2 id="third-party">제3자</h2>'),
    });
    const report = checkLinks(dist, site);
    expect(report.problems.map((problem) => [problem.ref, problem.kind])).toEqual([
      ['/credits/', 'base-missing'],
      ['/demo/no-such-page/', 'not-found'],
      ['/demo/images/missing.webp', 'not-found'],
      ['/demo/credits', 'no-trailing-slash'],
      ['/demo', 'no-trailing-slash'],
      ['/demo/credits/#nope', 'anchor-not-found'],
      ['#also-nope', 'anchor-not-found'],
    ]);
    const message = formatLinkReport(report, site);
    expect(message).toContain('[링크 검사] 실패 — 문제 7개');
    expect(message).toContain('- dist/index.html: "/credits/"');
    expect(message).toContain('사이트 주소 앞부분(/demo/)이 빠졌어요');
  });

  it('사이트 뿌리로 빌드했을 때(오프라인 배포판): 사이트 안 주소는 뿌리로, 전체 주소(대표 주소·공유 미리보기)는 공개 사이트 base로 본다', () => {
    const rootSite = { origin: site.origin, base: '', publicBase: '/demo' };
    const dist = makeDist({
      'index.html': page(
        ['<a href="/credits/">출처</a>', '<a href="credits/#third-party">상대</a>', '<a href="/demo/credits/">옛 base가 박힌 주소</a>'].join(''),
        `<link rel="canonical" href="${site.origin}/demo/"><meta property="og:url" content="${site.origin}/demo/credits/">`,
      ),
      'credits/index.html': page('<h2 id="third-party">제3자</h2>'),
    });
    const report = checkLinks(dist, rootSite);
    expect(report.problems.map((problem) => [problem.ref, problem.kind])).toEqual([['/demo/credits/', 'not-found']]);
    expect(formatLinkReport(report, rootSite, { dirLabel: 'dist-offline' })).toContain('- dist-offline/index.html: "/demo/credits/"');
  });

  it('실습실 주소의 ?example= 값이 examples/에 없는 파일이면 찾아낸다(2026-09-17 검토 반영 — 실습실은 조용히 첫 예제를 열기 때문)', () => {
    const examplesDir = makeTempDir('link-check-examples-');
    tempDirs.push(examplesDir);
    writeFiles(examplesDir, { 'vision/u1/1-2-1-adv-hand-settings.py': 'print(1)\n' });
    const dist = makeDist({
      'index.html': page(
        [
          '<a href="/demo/labs/vision/?example=vision%2Fu1%2F1-2-1-adv-hand-settings.py">있는 예제</a>',
          '<a href="/demo/labs/vision/?example=vision/u1/1-2-1-adv-hand-settings.py&embed=1">임베드</a>',
          '<a href="/demo/labs/vision/?example=vision/u1/renamed.py">이름이 바뀐 예제</a>',
          '<a href="/demo/labs/vision/?example=../package.json">폴더 밖</a>',
          '<a href="/demo/labs/vision/?example=">빈 값</a>',
        ].join(''),
      ),
      'labs/vision/index.html': page('<h1>영상처리 실습실</h1>'),
    });
    const report = checkLinks(dist, site, { examplesDir });
    expect(report.examples).toBe(4);
    expect(report.problems.map((problem) => [problem.ref, problem.kind, problem.target])).toEqual([
      ['/demo/labs/vision/?example=vision/u1/renamed.py', 'example-not-found', 'examples/vision/u1/renamed.py'],
      ['/demo/labs/vision/?example=../package.json', 'example-not-found', 'examples/../package.json'],
    ]);
    expect(formatLinkReport(report, site)).toContain('?example= 값이 examples/ 아래에 없는 파일이에요');
  });

  it('?example= 예제를 싣지 않는 실습실로 열면 찾아낸다(통신 차시의 보드 쪽 예제가 영상처리 실습실로 가던 것 — P4-08·2026-09-24 통합)', () => {
    const examplesDir = makeTempDir('link-check-examples-');
    tempDirs.push(examplesDir);
    writeFiles(examplesDir, {
      'vision/u4/c3-finger-count-send.py': 'print(1)\n',
      'esp32/u4/c3-neopixel-count-rx.py': 'print(1)\n',
      'desktop/01-screen-size.py': 'print(1)\n',
    });
    const dist = makeDist({
      'index.html': page(
        [
          '<a href="/demo/labs/vision/?example=vision%2Fu4%2Fc3-finger-count-send.py">맞음</a>',
          '<a href="/demo/labs/vision/?example=desktop/01-screen-size.py">맞음(가상 데스크톱)</a>',
          '<a href="/demo/labs/esp32/?example=esp32/u4/c3-neopixel-count-rx.py&embed=1">맞음(보드)</a>',
          '<a href="/demo/labs/vision/?example=esp32%2Fu4%2Fc3-neopixel-count-rx.py&embed=1">보드 예제를 영상처리로</a>',
          '<a href="/demo/labs/esp32/?example=vision/u4/c3-finger-count-send.py">컴퓨터 예제를 보드로</a>',
          '<a href="/demo/labs/unit4/?example=esp32/u4/c3-neopixel-count-rx.py">두 칸 화면은 검사하지 않음</a>',
        ].join(''),
      ),
      'labs/vision/index.html': page('<h1>영상처리 실습실</h1>'),
      'labs/esp32/index.html': page('<h1>ESP32 실습실</h1>'),
      'labs/unit4/index.html': page('<h1>4단원 통합 실습실</h1>'),
    });
    const report = checkLinks(dist, site, { examplesDir });
    expect(report.examples).toBe(6);
    expect(report.problems.map((problem) => [problem.ref, problem.kind])).toEqual([
      ['/demo/labs/vision/?example=esp32%2Fu4%2Fc3-neopixel-count-rx.py&embed=1', 'example-wrong-lab'],
      ['/demo/labs/esp32/?example=vision/u4/c3-finger-count-send.py', 'example-wrong-lab'],
    ]);
    expect(formatLinkReport(report, site)).toContain('예제를 싣지 않는 실습실로 열어요');
  });

  it('404 페이지의 상대 주소와 CSS가 가리키는 없는 파일을 찾아낸다', () => {
    const dist = makeDist({
      'index.html': page('<p>홈</p>'),
      '404.html': page('<a href="./">상대 주소</a><a href="/demo/">첫 화면</a><a href="#main">본문</a><main id="main"></main>'),
      '_astro/site.css': '.logo{background:url(../images/logo.svg)}',
    });
    const report = checkLinks(dist, site);
    expect(report.problems.map((problem) => [problem.file, problem.ref, problem.kind])).toEqual([
      ['404.html', './', 'relative-in-404'],
      ['_astro/site.css', '../images/logo.svg', 'not-found'],
    ]);
  });
});

describe('scripts/check-links.mjs', () => {
  it('문제가 없으면 종료 코드 0, 있으면 1과 한국어 설명을 낸다', () => {
    const base = siteFromHomepage(packageJson.homepage).base;
    const passing = makeDist({ 'index.html': page(`<a href="${base}/">홈</a>`) });
    const ok = spawnSync(process.execPath, [CHECK_LINKS_CLI, '--dist', passing], { encoding: 'utf8' });
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('[링크 검사] 통과');

    const failing = makeDist({ 'index.html': page('<a href="/credits/">출처</a>') });
    const blocked = spawnSync(process.execPath, [CHECK_LINKS_CLI, '--dist', failing], { encoding: 'utf8' });
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain('[링크 검사] 실패 — 문제 1개');

    const empty = makeDist({ 'readme.txt': '빌드 결과 아님' });
    const missing = spawnSync(process.execPath, [CHECK_LINKS_CLI, '--dist', empty], { encoding: 'utf8' });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('먼저 npm run build를 실행해요');
  });
});
