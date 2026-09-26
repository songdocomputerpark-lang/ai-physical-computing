// 오프라인 배포판에 넣을 Pyodide 패키지(scripts/lib/offline-packages.mjs, src/lab/loader/pyodide-files.ts의 오프라인 표) — P6-07.
// 사이트가 학생에게 주는 파이썬 코드(예제·흉내 모듈·차시 코드 블록)가 import하는 패키지가 오프라인 표에 모두 있는지 매번 본다.
// 새 예제가 표에 없는 패키지(예: matplotlib)를 쓰면 여기서 막히고, 고칠 곳(PYODIDE_OFFLINE_EXTRA_FILES)을 알려 준다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  collectRepoImports,
  dependencyClosure,
  describeMissingPackages,
  importIndex,
  offlinePackageCoverage,
  pythonCodeBlocks,
  scanPythonImports,
} from '../../../scripts/lib/offline-packages.mjs';
import {
  PYODIDE_FALLBACK_FILES,
  PYODIDE_OFFLINE_EXTRA_FILES,
  PYODIDE_OFFLINE_FILES,
  PYODIDE_OFFLINE_TOTAL_BYTES,
} from '../../../src/lab/loader/pyodide-files.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
const lock = JSON.parse(fs.readFileSync(path.join(rootDir, 'node_modules', 'pyodide', 'pyodide-lock.json'), 'utf8')) as {
  packages: Record<string, { file_name: string; sha256: string; depends: string[]; imports: string[] }>;
};

describe('import 모으기', () => {
  it('import·from 문에서 맨 앞 모듈 이름을 모은다', () => {
    const code = [
      'import cv2',
      'import numpy as np, time',
      'from PIL import Image, ImageFont',
      'from machine import Pin',
      'import os.path',
      '    import math  # 들여쓴 import도',
      '# import 주석은 줄 머리에 # 가 있어 빠진다',
      "print('import 글자는 빠진다')",
      'from . import sibling',
    ].join('\n');
    expect([...scanPythonImports(code)].sort()).toEqual(['PIL', 'cv2', 'machine', 'math', 'numpy', 'os', 'time']);
  });

  it('마크다운의 파이썬 코드 블록만 읽는다', () => {
    const markdown = ['글', '```python', 'import cv2', '```', '```bash', 'import 아님', '```', '```py title="x"', 'from PIL import Image', '```'].join('\n');
    expect(pythonCodeBlocks(markdown).map((block) => block.trim())).toEqual(['import cv2', 'from PIL import Image']);
  });
});

describe('pyodide-lock.json으로 패키지 잇기', () => {
  it('import 이름 → 패키지, depends를 끝까지 따라간다', () => {
    const index = importIndex(lock);
    expect(index.get('cv2')).toBe('opencv-python');
    expect(index.get('PIL')).toBe('pillow');
    expect(index.get('machine')).toBeUndefined();
    expect([...dependencyClosure(['opencv-python'], lock)].sort()).toEqual(['numpy', 'opencv-python']);
    expect(dependencyClosure(['matplotlib'], lock).has('pillow')).toBe(true);
    expect(() => dependencyClosure(['없는패키지'], lock)).toThrow(/없어요/u);
  });

  it('표에 빠진 패키지를 찾아 어느 파일이 쓰는지와 함께 알린다', () => {
    const imports = new Map([
      ['cv2', ['examples/a.py']],
      ['matplotlib', ['examples/b.py']],
      ['machine', ['examples/c.py']],
    ]);
    const result = offlinePackageCoverage({ imports, lock, tablePackages: ['numpy', 'opencv-python'] });
    expect(result.needed).toContain('matplotlib');
    const missingNames = result.missing.map((item) => item.package);
    expect(missingNames).toContain('matplotlib');
    expect(missingNames).toContain('pillow'); // matplotlib이 기대는 패키지
    expect(result.missing.find((item) => item.package === 'matplotlib')!.via).toEqual(['examples/b.py']);
    const message = describeMissingPackages(result.missing, lock);
    expect(message).toContain('PYODIDE_OFFLINE_EXTRA_FILES');
    expect(message).toContain(lock.packages.matplotlib!.sha256);
  });
});

describe('저장소 전체 — 오프라인 표가 사이트의 파이썬 코드를 모두 덮는다', () => {
  it('예제·흉내 모듈·차시 코드 블록이 쓰는 Pyodide 패키지가 모두 오프라인 표에 있다(2026-09-26: numpy·opencv-python·pillow)', () => {
    const imports = collectRepoImports(rootDir);
    expect(imports.get('cv2')?.length ?? 0).toBeGreaterThan(10);
    const tablePackages = PYODIDE_OFFLINE_FILES.filter((file) => file.kind === 'package').map((file) => file.package!);
    const result = offlinePackageCoverage({ imports, lock, tablePackages });
    expect(result.missing, describeMissingPackages(result.missing, lock)).toEqual([]);
    expect(result.needed).toEqual(['numpy', 'opencv-python', 'pillow']);
  });

  it('오프라인 표에만 더 넣는 휠의 이름·SHA-256이 pyodide-lock.json과 같고, 받아 둔 휠이 있으면 크기·해시도 같다', () => {
    for (const file of PYODIDE_OFFLINE_EXTRA_FILES) {
      const entry = lock.packages[file.package!];
      expect(entry, `${file.package}이(가) pyodide-lock.json에 없어요`).toBeTruthy();
      expect(entry!.file_name).toBe(file.name);
      expect(entry!.sha256).toBe(file.sha256);
      const cached = path.join(rootDir, '.cache', 'pyodide-packages', file.name);
      if (fs.existsSync(cached)) {
        expect(fs.statSync(cached).size, file.name).toBe(file.size);
        expect(crypto.createHash('sha256').update(fs.readFileSync(cached)).digest('hex')).toBe(file.sha256);
      }
    }
  });

  it('오프라인 표 = 예비본 7개 + 더 넣는 휠(겹치지 않음), 합계 크기', () => {
    const names = PYODIDE_OFFLINE_FILES.map((file) => file.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.slice(0, PYODIDE_FALLBACK_FILES.length)).toEqual(PYODIDE_FALLBACK_FILES.map((file) => file.name));
    expect(PYODIDE_OFFLINE_TOTAL_BYTES).toBe(28_205_345);
  });
});
