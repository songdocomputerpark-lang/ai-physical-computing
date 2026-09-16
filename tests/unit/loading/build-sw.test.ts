// 서비스 워커 만들기(scripts/build-sw.mjs)와 원본(src/sw/sw.js)의 약속 검사 — P2-05, PD-11.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildConfig, checkPrecacheBudget, renderServiceWorker, shellAssetsFromHtml } from '../../../scripts/build-sw.mjs';
import {
  CACHE_PREFIX,
  PRECACHE_BUDGET_BYTES,
  PRECACHE_MAX_FILE_BYTES,
  SW_CONFIG_PLACEHOLDER,
  SW_MESSAGE,
  pyodideCacheName,
} from '../../../src/lab/loader/constants.ts';
import { PYODIDE_FALLBACK_FILES, PYODIDE_VERSION } from '../../../src/lab/loader/pyodide-files.ts';
import { BASE_PATH } from '../../../src/lib/url.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
const swSource = fs.readFileSync(path.join(rootDir, 'src', 'sw', 'sw.js'), 'utf8');

const SAMPLE_HTML = `<!doctype html><html><head>
<link rel="stylesheet" href="${BASE_PATH}_astro/index.ABC123.css" />
<link rel="stylesheet" href="${BASE_PATH}fonts/pretendard/pretendardvariable-dynamic-subset.css" />
<script type="module" src="${BASE_PATH}_astro/header.DEF456.js"></script>
<link rel="modulepreload" href="${BASE_PATH}_astro/shared.GHI789.js" />
<link rel="icon" href="${BASE_PATH}favicon.svg" />
</head><body>
<a href="${BASE_PATH}start/">시작하기</a>
<img src="${BASE_PATH}images/site/flow.svg" alt="" />
<script src="https://example.test/outside.js"></script>
</body></html>`;

describe('셸 고르기(shellAssetsFromHtml)', () => {
  it('홈 페이지가 받는 같은 사이트 CSS·JS·글꼴 규칙·아이콘을 고른다', () => {
    expect(shellAssetsFromHtml(SAMPLE_HTML, BASE_PATH)).toEqual([
      '_astro/header.DEF456.js',
      '_astro/index.ABC123.css',
      '_astro/shared.GHI789.js',
      'favicon.svg',
      'fonts/pretendard/pretendardvariable-dynamic-subset.css',
    ]);
  });

  it('사이트 밖 주소·그림·페이지 링크는 넣지 않는다', () => {
    const shell = shellAssetsFromHtml(SAMPLE_HTML, BASE_PATH);
    expect(shell.some((file) => file.includes('outside'))).toBe(false);
    expect(shell.some((file) => file.includes('images/site/flow'))).toBe(false);
    expect(shell.some((file) => file === 'start/')).toBe(false);
  });

  it('글꼴 조각(woff2)은 넣지 않는다 — PD-11 "셸만"(런타임 캐시가 맡는다)', () => {
    const html = `<link rel="preload" as="font" href="${BASE_PATH}fonts/pretendard/woff2/x.woff2" />`;
    expect(shellAssetsFromHtml(html, BASE_PATH)).toEqual([]);
  });

  it('검색어가 붙어 있어도 파일 이름만 남긴다', () => {
    expect(shellAssetsFromHtml(`<link rel="stylesheet" href="${BASE_PATH}_astro/a.css?v=1" />`, BASE_PATH)).toEqual(['_astro/a.css']);
  });
});

describe('사전 캐시 예산(PD-11: 셸만, 수백 KB)', () => {
  it('예산 안이면 문제가 없다', () => {
    const { problems, total } = checkPrecacheBudget([
      { url: '/a.css', size: 40_000 },
      { url: '/b.js', size: 120_000 },
    ]);
    expect(problems).toEqual([]);
    expect(total).toBe(160_000);
  });

  it('큰 파일 하나(실습실 청크 407KB 같은 것)가 들어오면 막는다', () => {
    const { problems } = checkPrecacheBudget([{ url: '/lab.js', size: 407 * 1024 }]);
    expect(problems.join(' ')).toContain('파일 하나 상한');
  });

  it('전체 예산을 넘으면 막는다', () => {
    const many = Array.from({ length: 10 }, (_, index) => ({ url: `/${index}.js`, size: 150_000 }));
    const { problems } = checkPrecacheBudget(many);
    expect(problems.join(' ')).toContain('사전 캐시 전체');
  });

  it('상한 값이 PD-11 범위(수백 KB)를 벗어나지 않는다', () => {
    expect(PRECACHE_BUDGET_BYTES).toBeLessThanOrEqual(1024 * 1024);
    expect(PRECACHE_MAX_FILE_BYTES).toBeLessThan(PRECACHE_BUDGET_BYTES);
  });
});

describe('서비스 워커 설정 새기기', () => {
  const config = buildConfig([{ url: `${BASE_PATH}_astro/a.css`, revision: null }]);

  it('캐시 이름·Pyodide 표·메시지 이름이 한 곳(constants.ts)에서 온다', () => {
    expect(config.cachePrefix).toBe(CACHE_PREFIX);
    expect(config.pyodide.cacheName).toBe(pyodideCacheName(PYODIDE_VERSION));
    expect(Object.keys(config.pyodide.sizes)).toHaveLength(PYODIDE_FALLBACK_FILES.length);
    expect(config.messages).toEqual({ ...SW_MESSAGE });
    expect(config.base).toBe(BASE_PATH);
    // 용량 정리 때 코어 파일은 마지막까지 남긴다.
    expect(config.pyodide.keepPaths).toHaveLength(5);
  });

  it('설정이 바뀌면 판 번호(buildId)가 바뀐다 — 브라우저가 새 서비스 워커를 알아챈다', () => {
    const other = buildConfig([{ url: `${BASE_PATH}_astro/b.css`, revision: null }]);
    expect(config.buildId).not.toBe(other.buildId);
    expect(config.buildId).toHaveLength(12);
  });

  it('설정 대입문만 JSON으로 바꾼다(머리말 설명은 그대로 둔다)', () => {
    const output = renderServiceWorker(swSource, config);
    expect(output).not.toContain(`const CONFIG = ${SW_CONFIG_PLACEHOLDER};`);
    const line = (output as string).split('\n').find((text: string) => text.startsWith('const CONFIG = '))!;
    const json = line.replace('const CONFIG = ', '').replace(/;$/u, '');
    expect(JSON.parse(json).buildId).toBe(config.buildId);
    // 머리말 설명에 남은 글자는 코드가 아니므로 그대로 둔다.
    expect(output).toContain(SW_CONFIG_PLACEHOLDER);
  });

  it('설정 대입문이 없으면 오류로 알린다', () => {
    expect(() => renderServiceWorker('const CONFIG = {};', config)).toThrow(/줄이 없어요/u);
  });
});

describe('서비스 워커 원본(src/sw/sw.js)', () => {
  it('설정 자리를 갖고 있다', () => {
    expect(swSource).toContain(SW_CONFIG_PLACEHOLDER);
  });

  it('메시지 이름을 직접 적지 않고 설정에서 읽는다(두 곳에 같은 글자를 두지 않으려고)', () => {
    for (const name of Object.values(SW_MESSAGE)) {
      expect(swSource.includes(`'${name}'`), `${name}을(를) sw.js에 직접 적었어요`).toBe(false);
    }
    for (const key of Object.keys(SW_MESSAGE)) {
      expect(swSource, `MESSAGE.${key}을(를) 쓰지 않아요`).toContain(`MESSAGE.${key}`);
    }
  });

  it('GET이 아닌 요청과 다른 사이트 요청은 건드리지 않는다', () => {
    expect(swSource).toContain("request.method !== 'GET'");
    expect(swSource).toContain('url.origin !== self.location.origin');
  });

  it('캐시에 넣을 때 압축 머리말을 지운다(다시 풀다 깨지지 않게)', () => {
    expect(swSource).toContain("lower === 'content-encoding'");
  });

  it('다른 사이트(jsDelivr) 응답의 Content-Length를 전체 크기로 믿지 않는다(압축된 크기라서)', () => {
    expect(swSource).toContain('url.startsWith(self.location.origin)');
  });
});
