// 오프라인 배포판 표시(__APC_OFFLINE__)와 그것을 읽는 곳 — P6-07.
// - 오프라인판 빌드 설정(scripts/offline/astro.config.offline.mjs)은 보통 설정에 define 한 줄만 더한다.
// - 보통 빌드·Node에서는 표시가 없어 온라인 사이트 동작 그대로다(jsDelivr 먼저 → 같은 사이트 예비본).
// - 표시가 있으면 파이썬 엔진·미리 받기가 같은 사이트만 쓰고, 오프라인 표(pillow 포함)를 안다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import astroConfig from '../../../astro.config.mjs';
import offlineConfig from '../../../scripts/offline/astro.config.offline.mjs';

const ORIGIN = 'http://localhost:8080';
const PILLOW = 'pillow-12.2.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('오프라인판 빌드 설정', () => {
  it('보통 설정을 그대로 두고 __APC_OFFLINE__ 한 줄만 더한다', () => {
    expect(offlineConfig.vite?.define?.__APC_OFFLINE__).toBe('true');
    expect(offlineConfig.vite?.define?.__APC_BASE__).toBe(astroConfig.vite?.define?.__APC_BASE__);
    expect(astroConfig.vite?.define).not.toHaveProperty('__APC_OFFLINE__');
    const { vite: offlineVite, ...offlineRest } = offlineConfig;
    const { vite: baseVite, ...baseRest } = astroConfig;
    expect(offlineRest).toEqual(baseRest);
    const { define: offlineDefine, ...offlineViteRest } = offlineVite ?? {};
    const { define: baseDefine, ...baseViteRest } = baseVite ?? {};
    expect(offlineViteRest).toEqual(baseViteRest);
    expect(Object.keys(offlineDefine ?? {}).sort()).toEqual([...Object.keys(baseDefine ?? {}), '__APC_OFFLINE__'].sort());
  });
});

describe('표시가 없을 때(온라인 사이트·개발 서버·Node) — 전과 같다', () => {
  it('파이썬 엔진은 jsDelivr 먼저, 같은 사이트 예비본이 다음이고 미리 받기는 jsDelivr 주소다', async () => {
    const config = await import('../../../src/lab/runtime/config.ts');
    const files = await import('../../../src/lab/loader/pyodide-files.ts');
    expect(config.OFFLINE_BUILD).toBe(false);
    expect(config.pyodideIndexUrls(ORIGIN)).toEqual([config.PYODIDE_CDN_INDEX_URL, new URL(config.PYODIDE_SITE_INDEX_PATH, ORIGIN).href]);
    expect(config.ALLOWED_REMOTE_ORIGINS).toEqual(['https://cdn.jsdelivr.net']);
    expect(files.pyodidePrefetchUrlsFor(['opencv-python']).every((url) => url.startsWith(config.PYODIDE_CDN_INDEX_URL))).toBe(true);
    expect(files.findPyodideFile(PILLOW)).toBeNull();
    expect(files.packageWheelSize('pillow')).toBeNull();
  });

  it('두 경우를 인자로 직접 고를 수도 있다(빌드 스크립트·테스트용)', async () => {
    const config = await import('../../../src/lab/runtime/config.ts');
    const files = await import('../../../src/lab/loader/pyodide-files.ts');
    expect(config.pyodideIndexUrls(ORIGIN, true)).toEqual([new URL(config.PYODIDE_SITE_INDEX_PATH, ORIGIN).href]);
    expect(config.pyodideIndexUrls(undefined, true)).toEqual([config.PYODIDE_SITE_INDEX_PATH]);
    expect(files.pyodideFileTable(true).map((file) => file.name)).toContain(PILLOW);
    expect(files.pyodideFilesFor(['pillow'], true).map((file) => file.name)).toContain(PILLOW);
    expect(files.pyodideFilesFor(['pillow'], false).map((file) => file.name)).not.toContain(PILLOW);
    expect(files.pyodidePreferredUrl('pyodide.mjs', true, ORIGIN)).toBe(files.pyodideSiteUrl('pyodide.mjs', ORIGIN));
    expect(files.pyodidePreferredUrl('pyodide.mjs', false, ORIGIN)).toBe(files.pyodideCdnUrl('pyodide.mjs'));
    expect(files.pyodidePrefetchBytesFor(null, true)).toBe(files.PYODIDE_OFFLINE_TOTAL_BYTES);
  });
});

describe('표시가 있을 때(오프라인 배포판 번들)', () => {
  it('파이썬 엔진·미리 받기가 같은 사이트만 쓰고, 사이트 밖 허용 출처가 없으며, 오프라인 표를 안다', async () => {
    vi.stubGlobal('__APC_OFFLINE__', true);
    vi.stubGlobal('location', { origin: ORIGIN });
    const config = await import('../../../src/lab/runtime/config.ts');
    const files = await import('../../../src/lab/loader/pyodide-files.ts');
    const site = new URL(config.PYODIDE_SITE_INDEX_PATH, ORIGIN).href;
    expect(config.OFFLINE_BUILD).toBe(true);
    expect(config.pyodideIndexUrls(ORIGIN)).toEqual([site]);
    expect(config.ALLOWED_REMOTE_ORIGINS).toEqual([]);
    expect(files.pyodidePrefetchUrlsFor(['opencv-python']).every((url) => url.startsWith(site))).toBe(true);
    expect(files.pyodidePrefetchUrls().some((url) => url.includes('cdn.jsdelivr.net'))).toBe(false);
    expect(files.findPyodideFile(PILLOW)?.size).toBe(1_037_806);
    expect(files.packageWheelSize('pillow')).toBe(1_037_806);
  });
});
