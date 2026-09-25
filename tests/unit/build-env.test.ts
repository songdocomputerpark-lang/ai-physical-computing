// 빌드 환경 변수(APC_BASE·APC_OUT_DIR)와 Phase 6 병렬 제작 준비 자리(2026-09-26) — src/config/site.ts 머리말.
import { afterEach, describe, expect, it, vi } from 'vitest';
import packageJson from '../../package.json' with { type: 'json' };
import { prunePagefind, REQUIRED_PAGEFIND_FILES, UNUSED_PAGEFIND_FILES } from '../../scripts/prune-pagefind.mjs';
import { rehypePlugins, remarkPlugins } from '../../src/lib/markdown-plugins.mjs';
import rehypeLessonPolish, { REHYPE_LESSON_POLISH_VERSION } from '../../src/lib/rehype-lesson-polish.mjs';
import {
  BUILD_ENV_NAMES,
  DEFAULT_OUT_DIR,
  parseBaseSetting,
  parseOutDirSetting,
  resolveBuildSettings,
  siteConfig,
} from '../../src/config/site.ts';
import { makeTempDir, removeDir, writeFiles } from './helpers/fixture.ts';

const tempDirs: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  for (const dir of tempDirs.splice(0)) {
    removeDir(dir);
  }
});

describe('APC_BASE — 이번 빌드의 사이트 하위 경로', () => {
  it('비었으면 공개 사이트 경로, /이면 사이트 뿌리(\'\')', () => {
    expect(parseBaseSetting(undefined)).toBe('/ai-physical-computing');
    expect(parseBaseSetting('')).toBe('/ai-physical-computing');
    expect(parseBaseSetting('  ')).toBe('/ai-physical-computing');
    expect(parseBaseSetting('/')).toBe('');
    expect(parseBaseSetting('//')).toBe('');
  });

  it('앞뒤 /는 있어도 없어도 되고, 여러 칸도 받는다', () => {
    expect(parseBaseSetting('/offline')).toBe('/offline');
    expect(parseBaseSetting('offline/')).toBe('/offline');
    expect(parseBaseSetting('/a/b-c_d.e~f/')).toBe('/a/b-c_d.e~f');
  });

  it('쓸 수 없는 값은 한국어 오류로 멈춘다', () => {
    for (const bad of ['/a b', '/a/../b', '/a//b', '/a?x', '/a#x', '/한글', '/.hidden']) {
      expect(() => parseBaseSetting(bad), bad).toThrow(/APC_BASE="[^"]*"는 쓸 수 없어요/u);
    }
  });

  it('Git Bash가 /를 Windows 경로로 바꾼 값을 알아보고 고치는 법을 알린다(2026-09-26 실측: "/" → "C:/Program Files/Git/")', () => {
    expect(() => parseBaseSetting('C:/Program Files/Git/')).toThrow(/MSYS_NO_PATHCONV=1/u);
    expect(() => parseBaseSetting('C:\\Program Files\\Git\\offline')).toThrow(/Git Bash/u);
  });
});

describe('APC_OUT_DIR — 빌드 결과 폴더', () => {
  it('비었으면 dist', () => {
    expect(DEFAULT_OUT_DIR).toBe('dist');
    expect(parseOutDirSetting(undefined)).toBe('dist');
    expect(parseOutDirSetting('')).toBe('dist');
  });

  it('dist, dist-이름, .cache/ 아래만 받고 / 구분으로 맞춘다', () => {
    expect(parseOutDirSetting('dist')).toBe('dist');
    expect(parseOutDirSetting('./dist-offline/')).toBe('dist-offline');
    expect(parseOutDirSetting('dist_test')).toBe('dist_test');
    expect(parseOutDirSetting('.cache\\offline\\site')).toBe('.cache/offline/site');
  });

  it('빌드가 비우는 폴더라 소스·원본 폴더나 저장소 밖은 막는다', () => {
    for (const bad of ['src', 'public', 'content', 'examples', '.', '..', '../dist', 'dist/../src', '.cache', '/tmp/site', 'C:/site', 'distx', 'dist/sub']) {
      expect(() => parseOutDirSetting(bad), bad).toThrow(/APC_OUT_DIR="[^"]*"는 쓸 수 없어요/u);
    }
  });

  it('resolveBuildSettings가 두 환경 변수를 함께 읽는다', () => {
    expect(BUILD_ENV_NAMES).toEqual({ base: 'APC_BASE', outDir: 'APC_OUT_DIR' });
    expect(resolveBuildSettings({})).toEqual({ base: '/ai-physical-computing', outDir: 'dist' });
    expect(resolveBuildSettings({ APC_BASE: '/', APC_OUT_DIR: 'dist-offline' })).toEqual({ base: '', outDir: 'dist-offline' });
  });

  it('환경 변수가 없는 보통 실행에서는 공개 사이트와 같은 값이다', () => {
    expect(siteConfig.base).toBe(siteConfig.publicBase);
    expect(`${siteConfig.origin}${siteConfig.publicBase}/`).toBe(packageJson.homepage);
  });
});

describe('사이트 뿌리로 빌드할 때(APC_BASE=/ — 오프라인 배포판)', () => {
  it('사이트 안 주소는 뿌리를 따르고, 전체 주소(대표 주소)는 공개 사이트를 가리킨다', async () => {
    vi.stubEnv('APC_BASE', '/');
    vi.resetModules();
    const site = await import('../../src/config/site.ts');
    const url = await import('../../src/lib/url.ts');
    expect(site.siteConfig.base).toBe('');
    expect(url.BASE_PATH).toBe('/');
    expect(url.withBase('credits/')).toBe('/credits/');
    expect(url.withBase('vendor/pyodide/314.0.7/')).toBe('/vendor/pyodide/314.0.7/');
    expect(url.stripBase('/labs/esp32/')).toBe('/labs/esp32/');
    expect(url.absoluteUrl('credits/')).toBe('https://songdocomputerpark-lang.github.io/ai-physical-computing/credits/');
    expect(url.absoluteUrl(url.stripBase('/learn/u1/1-1-1/'))).toBe(
      'https://songdocomputerpark-lang.github.io/ai-physical-computing/learn/u1/1-1-1/',
    );
  });
});

describe('마크다운 출력 다듬기 자리(src/lib/rehype-lesson-polish.mjs — 구역 A)', () => {
  it('빌드와 차시 틀 검사가 함께 쓰는 목록에 판 번호와 함께 등록돼 있다(판을 올리면 콘텐츠 캐시가 비워진다)', () => {
    expect(remarkPlugins).toHaveLength(3);
    expect(rehypePlugins).toContainEqual([rehypeLessonPolish, { version: REHYPE_LESSON_POLISH_VERSION }]);
    expect(Number.isInteger(REHYPE_LESSON_POLISH_VERSION) && REHYPE_LESSON_POLISH_VERSION >= 1).toBe(true);
  });
});

describe('빌드 뒤 단계가 결과 폴더를 따른다', () => {
  it('prunePagefind는 주어진 결과 폴더의 pagefind/를 정리한다', () => {
    const root = makeTempDir('prune-pagefind-');
    tempDirs.push(root);
    const files: Record<string, string> = {};
    for (const name of [...REQUIRED_PAGEFIND_FILES, ...UNUSED_PAGEFIND_FILES]) {
      files[`dist-offline/pagefind/${name}`] = '//';
    }
    writeFiles(root, files);
    expect(prunePagefind(root, 'dist').missing).toEqual([...REQUIRED_PAGEFIND_FILES]);
    const result = prunePagefind(root, 'dist-offline');
    expect(result.missing).toEqual([]);
    expect(result.removed).toEqual([...UNUSED_PAGEFIND_FILES]);
  });
});
