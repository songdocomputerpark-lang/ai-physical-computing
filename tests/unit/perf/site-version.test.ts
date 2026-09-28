// 사이트 판(version)은 package.json 한 곳에서 오고(DECISIONS C20), 번들에는 판 글자만 들어간다(판 1.1.0 — PROGRESS 미해결 202).
//
// 전에는 src/config/site.ts가 package.json을 통째로 불러 모든 쪽이 받는 공용 청크(_astro/url.*.js)에 이름·명령·의존성 목록까지
// 약 2.3KB(gzip 약 1KB)가 들어갔다. 이제 astro.config.mjs가 vite.define `__APC_VERSION__`으로 판 글자만 새기고(`__APC_BASE__`와 같은 방식),
// Node가 site.ts를 직접 읽을 때(astro.config.mjs·scripts·Playwright·Vitest)는 package.json을 읽는다. 이 파일은
//  1. 판을 읽는 곳(바닥글 "버전"·점검 페이지 [결과 복사]의 "사이트 버전"·오프라인판 zip 이름·CHANGELOG 제목)이 그대로 package.json 값인지
//  2. 번들 흉내(`__APC_VERSION__`이 있을 때)와 실제 Vite 묶기에서 package.json 내용이 빠지고 판 글자만 남는지(되돌리면 잡히는지 대조까지)
// 를 본다. 브라우저에서 보이는 글자는 tests/e2e/smoke.spec.ts(바닥글)·a11y.spec.ts(바닥글 속성)·start.spec.ts([결과 복사])가 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import packageJson from '../../../package.json' with { type: 'json' };
import astroConfig from '../../../astro.config.mjs';
import offlineConfig from '../../../scripts/offline/astro.config.offline.mjs';
import { offlinePackageName } from '../../../scripts/lib/offline-site.mjs';
import { siteConfig } from '../../../src/config/site.ts';
import { formatReport, type CheckReport } from '../../../src/lib/capabilities.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const ENTRY = path.join(ROOT, 'tests', 'unit', 'perf', 'fixtures', 'site-version-entry.ts');
const VERSION = packageJson.version;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** package.json에만 있는 글자 — 번들에 이것이 보이면 package.json이 통째로 들어간 것이다 */
const PACKAGE_ONLY_MARKERS = ['devDependencies', 'allowScripts', 'scripts/vendor-assets.mjs', '@playwright/test'];

/** fixtures/site-version-entry.ts를 Astro 클라이언트 빌드처럼(ES 모듈·압축) 묶어 코드 글을 돌려준다 */
async function bundleEntry(define: Record<string, string>): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    root: ROOT,
    // public/(49MB vendor 포함)을 건드리지 않는다 — 결과는 메모리에만(write: false)
    publicDir: false,
    define,
    build: {
      write: false,
      minify: true,
      emptyOutDir: false,
      lib: { entry: ENTRY, formats: ['es'], fileName: 'site-version-entry' },
    },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
  return outputs
    .flatMap((output) => output.output)
    .map((item) => (item.type === 'chunk' ? item.code : ''))
    .join('\n');
}

describe('판은 package.json 한 곳(DECISIONS C20)', () => {
  it('Node에서 읽으면 siteConfig.version = package.json version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(siteConfig.version).toBe(VERSION);
  });

  it('astro.config.mjs가 판을 __APC_VERSION__으로 새긴다(오프라인판 설정도 같은 값)', () => {
    expect(astroConfig.vite?.define?.__APC_VERSION__).toBe(JSON.stringify(VERSION));
    expect(offlineConfig.vite?.define?.__APC_VERSION__).toBe(JSON.stringify(VERSION));
    // base는 전과 같다
    expect(astroConfig.vite?.define?.__APC_BASE__).toBe(JSON.stringify(siteConfig.base));
  });

  it('번들 흉내: __APC_VERSION__이 있으면 package.json 대신 그 글자를 쓴다', async () => {
    vi.stubGlobal('__APC_VERSION__', '9.8.7');
    const bundled = await import('../../../src/config/site.ts');
    expect(bundled.siteConfig.version).toBe('9.8.7');
  });
});

describe('판을 읽는 곳이 그대로다', () => {
  it('바닥글 "버전"과 data-site-version은 siteConfig.version이다', () => {
    const footer = fs.readFileSync(path.join(ROOT, 'src', 'layouts', 'partials', 'SiteFooter.astro'), 'utf8');
    expect(footer).toContain('data-site-version={siteConfig.version}>버전 {siteConfig.version}</span>');
  });

  it('점검 페이지 [결과 복사]: CheckReport가 siteConfig.version을 넘기고 글에 "사이트 버전: <판>"이 들어간다', () => {
    const component = fs.readFileSync(path.join(ROOT, 'src', 'components', 'start', 'CheckReport.astro'), 'utf8');
    expect(component).toContain('data-site-version={siteConfig.version}');
    expect(component).toContain('siteVersion: root.dataset.siteVersion');
    const report: CheckReport = {
      checkedAt: new Date('2026-09-28T12:00:00+09:00'),
      browser: { name: 'Chrome', platformName: 'Windows', mobile: false },
      results: [],
    } as unknown as CheckReport;
    expect(formatReport(report, { siteName: siteConfig.name, siteVersion: siteConfig.version })).toContain(`사이트 버전: ${VERSION}`);
  });

  it('오프라인판 zip 이름이 같은 판이다(scripts/build-offline.mjs가 siteConfig.version을 쓴다)', () => {
    expect(offlinePackageName(siteConfig.version)).toBe(`apc-offline-${VERSION}`);
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'build-offline.mjs'), 'utf8');
    expect(script).toContain('siteConfig.version');
  });

  it('CHANGELOG.md에 지금 판의 제목("## <판> — 날짜")이 있다(MAINTENANCE.md 10절 — 판을 올릴 때 제목도 함께)', () => {
    const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    const heading = new RegExp(`^## ${VERSION.replaceAll('.', '\\.')} — \\d{4}-\\d{2}-\\d{2}`, 'mu');
    expect(changelog, `CHANGELOG.md에 "## ${VERSION} — 날짜" 제목이 없어요`).toMatch(heading);
  });
});

describe('번들에는 판 글자만 들어간다(미해결 202)', () => {
  it('Vite로 묶으면 package.json 내용이 빠지고 판·base 글자는 남는다 — define을 빼면 다시 통째로 들어간다(대조)', { timeout: 60_000 }, async () => {
    const base = JSON.stringify('/ai-physical-computing');
    const withDefine = await bundleEntry({ __APC_BASE__: base, __APC_VERSION__: JSON.stringify(VERSION) });
    for (const marker of PACKAGE_ONLY_MARKERS) {
      expect(withDefine, `묶은 코드에 package.json의 "${marker}"가 있어요`).not.toContain(marker);
    }
    expect(withDefine).toContain(VERSION);
    expect(withDefine).toContain('/ai-physical-computing');
    // 대조: 판을 새기지 않으면(= 옛 방식과 같은 결과) package.json이 통째로 들어간다 — 이 검사가 되돌림을 잡는다는 증거
    const withoutDefine = await bundleEntry({ __APC_BASE__: base });
    expect(PACKAGE_ONLY_MARKERS.filter((marker) => withoutDefine.includes(marker))).toEqual(PACKAGE_ONLY_MARKERS);
    console.log(`[미해결 202] 묶은 입구 크기: 판을 새김 ${withDefine.length}바이트 / 새기지 않음 ${withoutDefine.length}바이트`);
  });
});
