// 같은 사이트 Pyodide 예비본 파일 표(src/lab/loader/pyodide-files.ts) 단위 테스트 — P2-05.
// 표의 이름·크기·SHA-256이 실제 Pyodide 배포(npm 패키지 pyodide@314.0.7과 그 안의 pyodide-lock.json)와 같은지 매번 대조한다.
// Pyodide 판을 올렸는데 표를 고치지 않으면 여기서 막힌다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PYODIDE_CORE_BYTES,
  PYODIDE_FALLBACK_FILES,
  PYODIDE_FALLBACK_TOTAL_BYTES,
  PYODIDE_VERSION,
  findPyodideFile,
  formatBytes,
  packageWheelSize,
  parsePyodideUrl,
  pyodideCdnUrl,
  pyodidePrefetchUrls,
  pyodideSiteUrl,
  twinPyodideUrl,
} from '../../../src/lab/loader/pyodide-files.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
const pyodideDir = path.join(rootDir, 'node_modules', 'pyodide');
const ORIGIN = 'https://songdocomputerpark-lang.github.io';

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

describe('예비본 파일 표', () => {
  it('첫 cv2 실습에 필요한 파일만 들어 있다(코어 5개 + numpy·opencv 휠)', () => {
    expect(PYODIDE_FALLBACK_FILES.map((file) => file.name)).toEqual([
      'pyodide.mjs',
      'pyodide.asm.mjs',
      'pyodide.asm.wasm',
      'python_stdlib.zip',
      'pyodide-lock.json',
      'numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
      'opencv_python-4.11.0.86-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
    ]);
    expect(PYODIDE_CORE_BYTES).toBe(13_531_207);
    expect(PYODIDE_FALLBACK_TOTAL_BYTES).toBe(27_167_539);
    // PLAN §5.1의 "GitHub Pages 사이트 1GB" 대비 3% 안(예비본을 배포물에 넣는 근거)
    expect(PYODIDE_FALLBACK_TOTAL_BYTES).toBeLessThan(0.03 * 1024 * 1024 * 1024);
  });

  it('코어 파일의 크기·해시가 npm 패키지 pyodide와 같다', () => {
    for (const file of PYODIDE_FALLBACK_FILES.filter((entry) => entry.kind === 'core')) {
      const full = path.join(pyodideDir, file.name);
      expect(fs.existsSync(full), `${file.name}이(가) node_modules/pyodide에 없어요`).toBe(true);
      expect(fs.statSync(full).size, file.name).toBe(file.size);
      expect(sha256(full), file.name).toBe(file.sha256);
    }
  });

  it('휠의 이름·해시가 pyodide-lock.json과 같다', () => {
    const lock = JSON.parse(fs.readFileSync(path.join(pyodideDir, 'pyodide-lock.json'), 'utf8')) as {
      packages: Record<string, { file_name: string; sha256: string; depends: string[] }>;
    };
    for (const file of PYODIDE_FALLBACK_FILES.filter((entry) => entry.kind === 'package')) {
      const entry = lock.packages[file.package!];
      expect(entry, `${file.package}이(가) pyodide-lock.json에 없어요`).toBeTruthy();
      expect(entry!.file_name).toBe(file.name);
      expect(entry!.sha256).toBe(file.sha256);
    }
    // opencv-python은 numpy에만 기대므로 둘만 있으면 첫 실습이 돈다(PLAN §5.2).
    expect(lock.packages['opencv-python']!.depends).toEqual(['numpy']);
  });

  it('npm 패키지 판이 설정과 같다', () => {
    const version = JSON.parse(fs.readFileSync(path.join(pyodideDir, 'package.json'), 'utf8')).version as string;
    expect(version).toBe(PYODIDE_VERSION);
  });
});

describe('주소 다루기', () => {
  it('CDN·같은 사이트 주소를 알아본다', () => {
    expect(parsePyodideUrl(pyodideCdnUrl('pyodide.mjs'), ORIGIN)).toEqual({ from: 'cdn', name: 'pyodide.mjs' });
    expect(parsePyodideUrl(pyodideSiteUrl('pyodide.mjs', ORIGIN), ORIGIN)).toEqual({ from: 'site', name: 'pyodide.mjs' });
  });

  it('검색어·앵커가 붙은 주소(살핌용)와 하위 폴더는 Pyodide 파일로 보지 않는다', () => {
    expect(parsePyodideUrl(`${pyodideCdnUrl('pyodide.mjs')}?probe=1`, ORIGIN)).toBeNull();
    expect(parsePyodideUrl(`${pyodideCdnUrl('sub/a.js')}`, ORIGIN)).toBeNull();
    expect(parsePyodideUrl('https://example.test/pyodide.mjs', ORIGIN)).toBeNull();
  });

  it('같은 파일의 다른 위치를 찾아 준다', () => {
    expect(twinPyodideUrl(pyodideCdnUrl('pyodide.asm.wasm'), ORIGIN)).toBe(pyodideSiteUrl('pyodide.asm.wasm', ORIGIN));
    expect(twinPyodideUrl(pyodideSiteUrl('pyodide.asm.wasm', ORIGIN), ORIGIN)).toBe(pyodideCdnUrl('pyodide.asm.wasm'));
    expect(twinPyodideUrl('https://example.test/a.js', ORIGIN)).toBeNull();
  });

  it('미리 받기 목록은 표 전체(CDN 주소)다', () => {
    expect(pyodidePrefetchUrls()).toHaveLength(PYODIDE_FALLBACK_FILES.length);
    expect(pyodidePrefetchUrls()[0]).toContain('cdn.jsdelivr.net');
  });

  it('찾기 도우미', () => {
    expect(findPyodideFile('pyodide.mjs')?.kind).toBe('core');
    expect(findPyodideFile('없는파일')).toBeNull();
    expect(packageWheelSize('numpy')).toBe(2_960_568);
    expect(packageWheelSize('pandas')).toBeNull();
  });

  it('바이트를 사람이 읽는 글자로 바꾼다', () => {
    expect(formatBytes(500)).toBe('500B');
    expect(formatBytes(119_077)).toBe('116KB');
    expect(formatBytes(2_960_568)).toBe('2.8MB');
    expect(formatBytes(PYODIDE_CORE_BYTES)).toBe('12.9MB');
    expect(formatBytes(-1)).toBe('?');
  });
});
