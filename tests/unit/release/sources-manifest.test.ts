// 대응 소스 목록(scripts/release/sources-manifest.json — 운영자 할 일 26·미해결 211)이 모양에 맞고, 이 사이트가 실제로 나누는 판·
// 고지 파일 두 개와 같은 것을 가리키는지 본다. Pyodide·OpenCV 휠·Pagefind 판을 올리고 목록을 그대로 두면 여기서 멈춘다
// (다른 판의 소스를 릴리스·오프라인판에 싣지 않게 — scripts/release/README.md 5절 "판을 올릴 때").
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SOURCES_MANIFEST_FILE,
  readSiteSourcesActual,
  readSourcesManifest,
  sourcesSiteMismatches,
} from '../../../scripts/lib/offline-sources.mjs';
import { PYODIDE_VERSION } from '../../../src/lab/loader/pyodide-files.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
const { manifest, problems } = readSourcesManifest(rootDir);
const wheelsNotice = fs.readFileSync(path.join(rootDir, 'public', 'licenses', 'pyodide-wheels-3rd-party.txt'), 'utf8');
const pagefindNotice = fs.readFileSync(path.join(rootDir, 'public', 'licenses', 'pagefind-wasm-3rd-party.txt'), 'utf8');

function loaded() {
  expect(problems).toEqual([]);
  expect(manifest).not.toBeNull();
  return manifest!;
}

function itemById(id: string) {
  const found = loaded().items.find((item) => item.id === id);
  expect(found, id).toBeDefined();
  return found!;
}

/** Pagefind 고지 표의 "크레이트 판" 줄(wasm에 들어가는 크레이트) — "wasm-bindgen(-shared)"·"serde(serde_core)"는 둘로 */
function noticeWasmCrates(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = /^ {2}([a-z0-9_-]+)(?:\(([a-z0-9_-]+)\))?\s+v?(\d+\.\d+\.\d+)\s/u.exec(line);
    if (!match || match[1] === 'pagefind_web') {
      continue;
    }
    const [, name, extra, version] = match;
    out.push(`${name} ${version}`);
    if (extra) {
      out.push(`${extra.startsWith('-') ? `${name}${extra}` : extra} ${version}`);
    }
  }
  return out.sort();
}

describe(`대응 소스 목록(${SOURCES_MANIFEST_FILE})`, () => {
  it('모양 검사를 통과하고, 파일 이름·주소가 겹치지 않는다', () => {
    const list = loaded();
    const urls = list.items.flatMap((item) => item.urls);
    expect(new Set(urls).size).toBe(urls.length);
    expect(list.items.every((item) => item.urls[0].startsWith('https://'))).toBe(true);
  });

  it('목록의 site 칸이 이 사이트가 지금 나누는 판(Pyodide 잠금 파일·opencv 휠·Pagefind)과 같다', () => {
    const list = loaded();
    expect(sourcesSiteMismatches(list, readSiteSourcesActual(rootDir, PYODIDE_VERSION))).toEqual([]);
    // opencv 휠과 소스 묶음의 판이 같다
    const wheelVersion = /^opencv_python-(\d+\.\d+\.\d+\.\d+)-/u.exec(list.site.opencvWheel)?.[1];
    expect(itemById('opencv-python-4.11.0.86').file).toBe(`opencv-python-${wheelVersion}.tar.gz`);
    // Pagefind 소스 묶음의 판이 site 칸과 같다
    expect(itemById('pagefind-1.5.2').file).toBe(`pagefind-${list.site.pagefindVersion}.tar.gz`);
  });

  it('FFmpeg 쪽 공식 값이 고지 파일(pyodide-wheels-3rd-party.txt 1절)과 같다', () => {
    const github = itemById('ffmpeg-n4.4.1');
    expect(wheelsNotice).toContain(github.urls[0]);
    expect(wheelsNotice).toContain(github.sha256!);
    const release = itemById('ffmpeg-4.4.1-release');
    expect(wheelsNotice).toContain(release.urls[0]);
    expect(wheelsNotice).toContain(`${release.size!.toLocaleString('en-US')}바이트`);
    const opencv = itemById('opencv-python-4.11.0.86');
    expect(wheelsNotice).toContain(opencv.urls[0]);
    expect(wheelsNotice).toContain(opencv.sha256!);
    expect(wheelsNotice).toContain(`${opencv.size!.toLocaleString('en-US')}바이트`);
    // 레시피 커밋·하위 모듈 커밋·빌드 도구 판
    const recipesCommit = /[0-9a-f]{40}/u.exec(itemById('pyodide-recipes-fc85872').file)![0];
    const buildCommit = /[0-9a-f]{40}/u.exec(itemById('pyodide-build-26a30ea').file)![0];
    expect(wheelsNotice).toContain(recipesCommit);
    expect(wheelsNotice).toContain(buildCommit);
    const lgpl = loaded().groups.find((group) => group.id === 'lgpl-ffmpeg')!;
    for (const tool of ['Emscripten 5.0.3', '314.0.6']) {
      expect(wheelsNotice).toContain(tool);
      expect(lgpl.tools).toContain(tool);
    }
    // 묶음이 가리키는 고지 파일이 사이트에 있다(zip 안 안내 글·릴리스 설명이 이 경로를 적는다)
    for (const group of loaded().groups) {
      expect(fs.existsSync(path.join(rootDir, 'public', ...group.notice.split('/'))), group.notice).toBe(true);
    }
  });

  it('검색 엔진 쪽: GPL 크레이트·Pagefind 커밋·wasm에 든 크레이트 표가 고지 파일(pagefind-wasm-3rd-party.txt)과 같다', () => {
    const list = loaded();
    const microjson = itemById('crate-pagefind_microjson-0.1.4');
    expect(microjson.license).toBe('GPL-3.0-only');
    expect(pagefindNotice).toContain(microjson.sha256!);
    expect(pagefindNotice).toContain(microjson.urls[1]);
    const pagefind = itemById('pagefind-1.5.2');
    expect(pagefindNotice).toContain(pagefind.urls[0]);
    expect(pagefindNotice).toContain(/[0-9a-f]{40}/u.exec(pagefind.what)![0]);
    const gpl = list.groups.find((group) => group.id === 'gpl-pagefind')!;
    expect(pagefindNotice).toContain('bf4fbfb7a 2026-04-11');
    expect(gpl.tools).toContain('bf4fbfb7a 2026-04-11');

    const crates = list.items.filter((item) => item.file.endsWith('.crate'));
    const wasm = crates.filter((item) => item.use === 'wasm');
    const build = crates.filter((item) => item.use === 'build');
    expect(wasm.length + build.length).toBe(crates.length);
    // wasm에 든 크레이트 = 고지 표(이름·판)
    expect(wasm.map((item) => item.file.replace(/-(\d[^-]*)\.crate$/u, ' $1')).sort()).toEqual(noticeWasmCrates(pagefindNotice));
    // 만들 때만 쓰는 크레이트는 고지의 "wasm에 들어가지 않아서 뺐어요" 문장에 이름이 있다
    const excluded = /proc-macro 크레이트 (.+?)는 wasm에 들어가지 않아서/su.exec(pagefindNotice)?.[1].replace(/\s+/gu, '') ?? '';
    expect(excluded).toContain('proc-macro2');
    for (const item of build) {
      const name = item.file.replace(/-\d[^-]*\.crate$/u, '');
      const mentioned = excluded.includes(name) || excluded.includes(name.replace(/-(support|shared)$/u, '(-$1)'));
      expect(mentioned, name).toBe(true);
    }
    // 묶음 설명의 개수가 실제 개수와 같다
    expect(gpl.why).toContain(`${wasm.length} compiled into the wasm, ${build.length} used only while building`);
    expect(gpl.whyKo).toContain(`wasm에 든 ${wasm.length}개, 만들 때만 쓰는 ${build.length}개`);
  });

  it('크레이트는 모두 crates.io 공식 체크섬이 있고, 다른 파일은 공식 값이 없으면 GitHub 압축뿐이다', () => {
    const list = loaded();
    for (const item of list.items) {
      if (item.file.endsWith('.crate')) {
        expect(item.sha256, item.id).toMatch(/^[0-9a-f]{64}$/u);
        expect(item.urls[0], item.id).toBe(`https://static.crates.io/crates/${item.file.replace(/-\d[^-]*\.crate$/u, '')}/${item.file}`);
      } else if (item.sha256 === null && item.md5 === null) {
        expect(item.urls[0], item.id).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\/archive\//u);
      }
    }
  });

  it('운영자 안내(scripts/release/README.md)가 같은 릴리스 태그와 명령을 쓴다', () => {
    const readme = fs.readFileSync(path.join(rootDir, 'scripts', 'release', 'README.md'), 'utf8');
    expect(readme).toContain(loaded().releaseTag);
    expect(readme).toContain('powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\release\\fetch-sources.ps1');
    expect(readme).toContain('npm run build:offline -- --sources .cache/release-sources');
  });
});
