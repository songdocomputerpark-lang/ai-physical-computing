// 오프라인 배포판의 약속(scripts/lib/offline-site.mjs)과 zip에 넣는 안내 파일(scripts/offline/) — P6-07.
// - 작은 웹 서버 두 개(serve.ps1·serve.py)의 파일 종류(MIME) 표가 한 곳(OFFLINE_MIME_TYPES)과 글자까지 같다.
// - 시작하기.bat는 영어·기호만(ASCII) 적는다 — cmd가 UTF-8 한국어 줄을 잘못 읽어서(2026-09-26 확인) 한국어 안내는 \uXXXX로 바꿔
//   PowerShell이 찍는다. serve.ps1·읽어보세요.txt는 BOM으로 시작한다(PowerShell 5.1이 BOM 없는 파일을 한국어 Windows에서 CP949로 읽는다).
// - 빌드 결과 확인(checkOfflineSite)이 빠진 파일·크기·해시·서비스 워커 설정·모르는 확장자를 잡는다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  OFFLINE_DEFAULT_MIME,
  OFFLINE_LAYOUT,
  OFFLINE_MAX_ENTRY_LENGTH,
  OFFLINE_MIME_TYPES,
  checkOfflineSite,
  explorerExtractBudget,
  extensionsWithoutMime,
  isPackagedSiteFile,
  offlinePackageName,
  powershellMessageCommand,
  renderTemplate,
  START_BAT_MESSAGES,
  startBatTemplateValues,
  toCrlf,
} from '../../../scripts/lib/offline-site.mjs';
import { makeTempDir, removeDir, writeFiles } from '../helpers/fixture.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
const offlineDir = path.join(rootDir, 'scripts', 'offline');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    removeDir(dir);
  }
});

function read(name: string): Buffer {
  return fs.readFileSync(path.join(offlineDir, name));
}

/** PowerShell 해시 표 `'.ext' = 'type'` 줄들 */
function powershellMimeTable(source: string): Record<string, string> {
  const block = /\$MimeTypes = @\{([\s\S]*?)\n\}/u.exec(source)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/^\s*'(\.[a-z0-9_]+)' = '([^']+)'\s*$/gmu)].map((match) => [match[1], match[2]]));
}

/** 파이썬 사전 `'.ext': 'type',` 줄들 */
function pythonMimeTable(source: string): Record<string, string> {
  const block = /MIME_TYPES = \{([\s\S]*?)\n\}/u.exec(source)?.[1] ?? '';
  return Object.fromEntries([...block.matchAll(/^\s*'(\.[a-z0-9_]+)': '([^']+)',\s*$/gmu)].map((match) => [match[1], match[2]]));
}

describe('작은 웹 서버의 파일 종류(MIME) 표', () => {
  it('serve.ps1·serve.py의 표가 OFFLINE_MIME_TYPES와 같다', () => {
    const ps = powershellMimeTable(read('serve.ps1').toString('utf8'));
    const py = pythonMimeTable(read('serve.py').toString('utf8'));
    expect(ps).toEqual({ ...OFFLINE_MIME_TYPES });
    expect(py).toEqual({ ...OFFLINE_MIME_TYPES });
    expect(read('serve.ps1').toString('utf8')).toContain(`$DefaultMime = '${OFFLINE_DEFAULT_MIME}'`);
    expect(read('serve.py').toString('utf8')).toContain(`DEFAULT_MIME = '${OFFLINE_DEFAULT_MIME}'`);
  });

  it('파이썬 실행기·모듈 워커·검색이 요구하는 형식이 맞다', () => {
    expect(OFFLINE_MIME_TYPES['.wasm']).toBe('application/wasm');
    expect(OFFLINE_MIME_TYPES['.mjs']).toMatch(/^text\/javascript/u);
    expect(OFFLINE_MIME_TYPES['.js']).toMatch(/^text\/javascript/u);
    expect(OFFLINE_MIME_TYPES['.html']).toContain('charset=utf-8');
    expect(OFFLINE_MIME_TYPES['.txt']).toContain('charset=utf-8');
  });

  it('모르는 확장자를 찾는다(점 파일은 zip에 넣지 않으므로 빼고)', () => {
    expect(extensionsWithoutMime(['index.html', 'a/b.wasm', 'models/.gitkeep', 'x.mp4', 'README'])).toEqual(['(없음)', '.mp4']);
    expect(isPackagedSiteFile('models/.gitkeep')).toBe(false);
    expect(isPackagedSiteFile('models/hand.task')).toBe(true);
  });
});

describe('zip에 넣는 안내 파일', () => {
  it('시작하기.bat 원본은 영어·기호만(ASCII) 적고, 같은 폴더의 server\\serve.ps1을 Bypass로 부르며, 풀지 않고 실행한 경우를 알아본다', () => {
    const bytes = read('start.bat');
    const printable = (byte: number) => byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte <= 0x7e);
    expect([...bytes].every(printable), 'start.bat에 ASCII가 아닌 바이트가 있어요').toBe(true);
    const text = bytes.toString('utf8');
    expect(text.split(/\r?\n/u)[0]).toBe('@echo off');
    expect(text).toContain('-ExecutionPolicy Bypass -File "%~dp0server\\serve.ps1" -NoPause %*');
    // 압축 파일 안에서 바로 실행한 경우를 알아본다
    expect(text).toContain('if not exist "%~dp0server\\serve.ps1" goto not_extracted');
    const rendered = renderTemplate(text, startBatTemplateValues());
    expect(rendered).not.toContain('{{');
    expect([...Buffer.from(toCrlf(rendered), 'utf8')].every(printable)).toBe(true);
  });

  it('시작하기.bat의 한국어 안내는 \\uXXXX로 바꿔 PowerShell이 찍는다 — 되돌리면 원래 글과 같다', () => {
    for (const lines of Object.values(START_BAT_MESSAGES)) {
      const command = powershellMessageCommand(lines);
      expect(/^[\x20-\x7e]*$/u.test(command)).toBe(true);
      // cmd의 큰따옴표 안에 들어가므로 큰따옴표·%가 없어야 한다
      expect(command).not.toContain('"');
      expect(command).not.toContain('%');
      const items = [...command.matchAll(/'([^']*)'/gu)].map((match) =>
        (match[1] ?? '').replace(/\\u([0-9A-F]{4})/gu, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))),
      );
      expect(items).toEqual([...lines]);
    }
    expect(START_BAT_MESSAGES.NOT_EXTRACTED.join('')).toContain('압축을 모두 푼 뒤');
  });

  it('serve.ps1·README.txt 원본은 UTF-8 BOM으로 시작하고, 자리 {{APC_…}}는 알려진 이름뿐이다', () => {
    for (const name of ['serve.ps1', 'README.txt']) {
      const bytes = read(name);
      expect([bytes[0], bytes[1], bytes[2]], name).toEqual([0xef, 0xbb, 0xbf]);
    }
    const values = { VERSION: '1.0.0', BUILD_DATE: '2026-09-26', COMMIT: 'abc1234', SITE_URL: 'https://example.test/' };
    const readme = renderTemplate(read('README.txt').toString('utf8'), values);
    expect(readme).not.toContain('{{');
    expect(readme).toContain('판 1.0.0');
    expect(readme).toContain(OFFLINE_LAYOUT.startBat);
    // 구역 C가 부탁한 대응 소스 안내 두 줄
    expect(readme).toContain('site\\licenses\\pyodide-wheels-3rd-party.txt');
    expect(readme).toContain('site\\licenses\\pagefind-wasm-3rd-party.txt');
    const serve = renderTemplate(read('serve.ps1').toString('utf8'), values);
    expect(serve).toContain("$SiteVersion = '1.0.0'");
    expect(() => renderTemplate('{{APC_NOPE}}', values)).toThrow(/값이 없어요/u);
  });

  it('serve.ps1은 localhost·127.0.0.1에만 열고(관리자 권한 없이), Host 머리말과 경로를 거른다', () => {
    const serve = read('serve.ps1').toString('utf8');
    expect(serve).toContain('"http://localhost:$candidate/"');
    expect(serve).toContain('"http://127.0.0.1:$candidate/"');
    expect(serve).not.toMatch(/http:\/\/[+*]:/u);
    expect(serve).toContain('$AllowedHosts');
    expect(serve).toContain("if ($segment.StartsWith('.')) { return $null }");
    expect(serve).toContain('$RootPrefix');
  });

  it('줄 끝 바꾸기·zip 이름(짧게 — Windows 탐색기의 260글자 경로 한도)', () => {
    expect(toCrlf('a\nb\r\nc')).toBe('a\r\nb\r\nc');
    expect(offlinePackageName('0.1.0')).toBe('apc-offline-0.1.0');
    expect(() => offlinePackageName('버전')).toThrow(/모양/u);
    // 가장 긴 파일(Pyodide opencv 휠 — 이름은 pyodide-lock.json이 정해 바꿀 수 없다)이 상한 안에 들고, 탐색기로 풀 곳이 넉넉하다
    const longest = `${offlinePackageName('1.0.0')}/site/vendor/pyodide/314.0.7/opencv_python-4.11.0.86-cp314-cp314-pyemscripten_2026_0_wasm32.whl`;
    expect(longest.length).toBeLessThanOrEqual(OFFLINE_MAX_ENTRY_LENGTH);
    expect(explorerExtractBudget(longest.length, offlinePackageName('1.0.0'))).toBeGreaterThanOrEqual(100);
    expect(explorerExtractBudget(130, 'apc-offline-0.1.0')).toBe(259 - 130 - 18 - 1);
  });
});

describe('빌드 결과 확인(checkOfflineSite)', () => {
  const pyodideFile = (name: string, content: string) => ({
    name,
    size: Buffer.byteLength(content),
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  });

  function fixture(overrides: Record<string, string> = {}): { siteDir: string; publicDir: string } {
    const dir = makeTempDir('apc-offline-site-');
    tempDirs.push(dir);
    const publicFiles = { 'models/hand.task': 'model', 'licenses/a.txt': '고지', 'models/.gitkeep': '' };
    writeFiles(path.join(dir, 'public'), publicFiles);
    writeFiles(path.join(dir, 'site'), {
      'index.html': '<html></html>',
      '404.html': '<html></html>',
      'sw.js': 'const CONFIG = {"base":"/","offline":true};',
      'pagefind/pagefind.js': '',
      'models/hand.task': 'model',
      'licenses/a.txt': '고지',
      'vendor/pyodide/9/p.mjs': 'core',
      ...overrides,
    });
    return { siteDir: path.join(dir, 'site'), publicDir: path.join(dir, 'public') };
  }

  it('모두 있으면 통과(점 파일은 따지지 않음)', () => {
    const { siteDir, publicDir } = fixture();
    const result = checkOfflineSite({ siteDir, publicDir, pyodideDir: 'vendor/pyodide/9', pyodideFiles: [pyodideFile('p.mjs', 'core')], noticeFiles: ['licenses/a.txt'] });
    expect(result.problems).toEqual([]);
    expect(result.publicFileCount).toBe(2);
  });

  it('빠진 파일·크기·해시·서비스 워커 설정·모르는 확장자를 잡는다', () => {
    const { siteDir, publicDir } = fixture({
      'models/hand.task': 'model-changed',
      'sw.js': 'const CONFIG = {"base":"/ai-physical-computing/"};',
      'video/intro.mp4': 'x',
    });
    fs.rmSync(path.join(siteDir, 'licenses', 'a.txt'));
    const result = checkOfflineSite({
      siteDir,
      publicDir,
      pyodideDir: 'vendor/pyodide/9',
      pyodideFiles: [pyodideFile('p.mjs', 'different'), pyodideFile('q.whl', 'wheel')],
      noticeFiles: ['licenses/a.txt'],
    });
    const text = result.problems.join('\n');
    expect(text).toContain('public/licenses/a.txt이(가) 빌드 결과에 없어요');
    expect(text).toContain('public/models/hand.task과(와) 빌드 결과의 크기가 달라요');
    expect(text).toContain('vendor/pyodide/9/p.mjs의 크기나 SHA-256');
    expect(text).toContain('vendor/pyodide/9/q.whl이(가) 없어요');
    expect(text).toContain('고지 파일 licenses/a.txt');
    expect(text).toContain('오프라인 설정이 아니에요');
    expect(text).toContain('사이트 뿌리가 /가 아니에요');
    expect(text).toContain('.mp4');
  });
});
