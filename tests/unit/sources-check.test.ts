import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { BUNDLE_LICENSE_FILE } from '../../scripts/lib/bundle-license.mjs';
import { checkBundleDependencies, checkSourceFiles } from '../../scripts/lib/sources-check.mjs';
import { makeTempDir, removeDir, writeFiles } from './helpers/fixture.ts';

const CHECK_SOURCES_CLI = fileURLToPath(new URL('../../scripts/check-sources.mjs', import.meta.url));

const OPERATOR_ENTRY = `  - name: 운영자 자료
    category: operator
    author: 박상진·김석전
    license: 운영자 자체 자료(박상진·김석전, 운영자 확인 2026-09-15)
    used_in: 차시와 예제
    paths:
      - content/**
      - examples/**
    exclude_paths:
      - examples/**/third-party/**
    fetched: 2026-09-15
`;
const PROBE_ENTRY = `  - name: 시험 파일
    category: self
    author: 박상진·김석전
    license: MIT
    used_in: 배포 시험
    paths:
      - public/_probe/**
`;
const ASTRO_ENTRY = `  - name: Astro
    category: stack
    author: Astro 기여자
    license: MIT
    url: https://github.com/withastro/astro
    used_in: 사이트 틀
    npm:
      - astro
    fetched: 2026-09-15
`;

function registry(...entries: string[]): string {
  return `sources:\n${entries.join('')}`;
}

/** 통과해야 하는 기본 저장소 모양 */
function baseFiles(): Record<string, string> {
  return {
    'sources.yaml': registry(OPERATOR_ENTRY, PROBE_ENTRY, ASTRO_ENTRY),
    'package.json': JSON.stringify({ dependencies: { astro: '7.3.2' }, devDependencies: { vitest: '5.0.0' } }),
    'public/_probe/probe.mjs': "export const probe = 'ok';\n",
    'content/lessons/u1/1-1-1.md': '# 차시\n',
    'content/.gitkeep': '',
    'examples/vision/u1/1-2-1-flip.py': 'print(1)\n',
  };
}

const tempDirs: string[] = [];
function fixture(overrides: Record<string, string> = {}): string {
  const rootDir = makeTempDir('apc-sources-');
  tempDirs.push(rootDir);
  writeFiles(rootDir, { ...baseFiles(), ...overrides });
  return rootDir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    removeDir(dir);
  }
});

describe('빌드 전 출처 검사(checkSourceFiles)', () => {
  it('모든 파일과 배포용 의존성이 등록돼 있으면 통과한다(.gitkeep은 검사하지 않음)', () => {
    const result = checkSourceFiles({ rootDir: fixture() });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('파일 3개');
    expect(result.summary).toContain('배포용 npm 패키지 1개(astro)');
  });

  it('public/에 등록되지 않은 파일이 있으면 실패한다', () => {
    const result = checkSourceFiles({ rootDir: fixture({ 'public/unregistered.txt': '?' }) });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('등록되지 않은 파일 1개');
    expect(result.errors.join('\n')).toContain('- public/unregistered.txt');
  });

  it('examples/에 등록되지 않은 .py가 있으면 실패한다(third-party 폴더는 넓은 항목에서 빠짐)', () => {
    const result = checkSourceFiles({
      rootDir: fixture({ 'examples/esp32/lib/third-party/i2c_lcd.py': 'class I2cLcd: pass\n' }),
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('- examples/esp32/lib/third-party/i2c_lcd.py');
  });

  it('third-party 파일을 따로 등록하면 넓은 항목과 겹치지 않고 통과한다', () => {
    const libraryEntry = `  - name: python_lcd
    category: library
    author: Dave Hylands
    license: MIT
    url: https://github.com/dhylands/python_lcd
    used_in: 문자 LCD 라이브러리
    paths:
      - examples/esp32/lib/third-party/i2c_lcd.py
    fetched: 2026-09-15
`;
    const result = checkSourceFiles({
      rootDir: fixture({
        'sources.yaml': registry(OPERATOR_ENTRY, PROBE_ENTRY, ASTRO_ENTRY, libraryEntry),
        'examples/esp32/lib/third-party/i2c_lcd.py': 'class I2cLcd: pass\n',
      }),
    });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('한 파일이 저작자가 다른 두 항목에 걸리면(중복 매칭) 실패한다', () => {
    const overlapping = `  - name: 다른 저작자 예제
    category: library
    author: 다른 사람
    license: MIT
    url: https://example.com/other
    used_in: 예제
    paths:
      - examples/vision/**
    fetched: 2026-09-15
`;
    const result = checkSourceFiles({
      rootDir: fixture({ 'sources.yaml': registry(OPERATOR_ENTRY, PROBE_ENTRY, ASTRO_ENTRY, overlapping) }),
    });
    const message = result.errors.join('\n');
    expect(result.ok).toBe(false);
    expect(message).toContain('중복 매칭');
    expect(message).toContain('- examples/vision/u1/1-2-1-flip.py');
    expect(message).toContain('"운영자 자료"');
    expect(message).toContain('"다른 저작자 예제"');
  });

  it('저작자가 같은 두 항목이 겹치는 것은 괜찮다', () => {
    const sameAuthor = `  - name: 사이트가 새로 쓴 예제
    category: self
    author: 박상진·김석전
    license: CC BY-NC-SA 4.0
    used_in: 보충 예제
    paths:
      - examples/vision/**
`;
    const result = checkSourceFiles({
      rootDir: fixture({ 'sources.yaml': registry(OPERATOR_ENTRY, PROBE_ENTRY, ASTRO_ENTRY, sameAuthor) }),
    });
    expect(result.errors).toEqual([]);
  });

  it('dependencies에 있는데 등록되지 않은 패키지가 있으면 실패한다', () => {
    const result = checkSourceFiles({
      rootDir: fixture({ 'package.json': JSON.stringify({ dependencies: { astro: '7.3.2', codemirror: '6.0.2' } }) }),
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('- codemirror');
  });

  it('등록부 형식이 틀리면 무엇을 고칠지 한국어로 알린다', () => {
    const broken = `  - name: 틀린 항목
    category: stak
    author: 누군가
    license: MIT
    use: 어딘가
    paths:
      - /public/**
`;
    const result = checkSourceFiles({ rootDir: fixture({ 'sources.yaml': registry(broken) }) });
    const message = result.errors.join('\n');
    expect(result.ok).toBe(false);
    expect(message).toContain('category는');
    expect(message).toContain('"used_in"(으)로 적어요');
    expect(message).toContain('used_in 필드가 없어요');
    expect(message).toContain('경로 패턴 "/public/**"');
  });
});

describe('빌드 뒤 번들 의존성 검사(checkBundleDependencies)', () => {
  function writeBundleList(rootDir: string, list: unknown): string {
    const listPath = path.join(rootDir, 'dist', BUNDLE_LICENSE_FILE);
    fs.mkdirSync(path.dirname(listPath), { recursive: true });
    fs.writeFileSync(listPath, JSON.stringify(list));
    return listPath;
  }

  it('번들에 들어간 패키지가 모두 등록돼 있으면 통과하고 목록 파일을 지운다', () => {
    const rootDir = fixture();
    const listPath = writeBundleList(rootDir, [{ name: 'astro', version: '7.3.2', identifier: 'MIT' }]);
    const result = checkBundleDependencies({ rootDir });
    expect(result.ok).toBe(true);
    expect(result.summary).toContain('1개(astro)');
    expect(fs.existsSync(listPath)).toBe(false);
  });

  it('전이 의존성이라도 등록되지 않은 패키지가 번들에 있으면 실패한다', () => {
    const rootDir = fixture();
    writeBundleList(rootDir, [
      { name: 'astro', version: '7.3.2', identifier: 'MIT' },
      { name: 'pako', version: '2.1.0', identifier: '(MIT AND Zlib)' },
    ]);
    const result = checkBundleDependencies({ rootDir });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('- pako@2.1.0 ((MIT AND Zlib))');
  });

  it('목록 파일이 없으면(설정이 빠진 경우) 실패한다', () => {
    const result = checkBundleDependencies({ rootDir: fixture() });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('clientBundleLicensePlugin');
  });
});

describe('scripts/check-sources.mjs 명령', () => {
  function runCli(rootDir: string, ...extraArgs: string[]) {
    return spawnSync(process.execPath, [CHECK_SOURCES_CLI, '--root', rootDir, ...extraArgs], { encoding: 'utf8' });
  }

  it('통과하면 종료 코드 0, 미등록 파일이 있으면 종료 코드 1로 빌드를 멈춘다', () => {
    const passing = runCli(fixture());
    expect(passing.status).toBe(0);
    expect(passing.stdout).toContain('[출처 검사] 통과');

    const failing = runCli(fixture({ 'public/unregistered.txt': '?' }));
    expect(failing.status).toBe(1);
    expect(failing.stderr).toContain('public/unregistered.txt');
  });
});
