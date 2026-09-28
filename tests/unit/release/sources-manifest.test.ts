// 대응 소스 목록(scripts/release/sources-manifest.json — 운영자 할 일 26·미해결 211)이 모양에 맞고, 이 사이트가 실제로 나누는 판·
// 고지 파일 두 개와 같은 것을 가리키는지 본다. Pyodide·OpenCV 휠·Pagefind 판을 올리고 목록을 그대로 두면 여기서 멈춘다
// (다른 판의 소스를 릴리스·오프라인판에 싣지 않게 — scripts/release/README.md 5절 "판을 올릴 때").
// 1.1.0 안전 검토 반영(DECISIONS C60·C61): 서면 제안은 "고지 파일에 적힌 대응 소스"를 약속하므로 목록의 모든 파일이 고지 두 파일에 있어야 하고,
// 공식 해시가 없는 파일은 커밋 주소(태그 주소는 옮겨질 수 있음)와 commit 칸이 있어야 한다.
import { REDISTRIBUTION_NOTICES } from '../../../src/lib/credits.ts';
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

  it('크레이트는 모두 crates.io 공식 체크섬이 있고, 공식 값이 없는 파일은 커밋 주소로 받는 GitHub 압축(+ commit 칸)뿐이다', () => {
    const list = loaded();
    for (const item of list.items) {
      if (item.file.endsWith('.crate')) {
        expect(item.sha256, item.id).toMatch(/^[0-9a-f]{64}$/u);
        expect(item.urls[0], item.id).toBe(`https://static.crates.io/crates/${item.file.replace(/-\d[^-]*\.crate$/u, '')}/${item.file}`);
      } else if (item.sha256 === null && item.md5 === null && (item.sha512 ?? null) === null) {
        // 태그 주소(refs/tags)는 태그가 옮겨지면 다른 내용이 온다 — 커밋 주소로만 받고, 압축 안의 커밋을 확인한다
        expect(item.commit, item.id).toMatch(/^[0-9a-f]{40}$/u);
        expect(item.urls, item.id).toEqual([`https://github.com/${/^https:\/\/github\.com\/([^/]+\/[^/]+)\//u.exec(item.urls[0])?.[1]}/archive/${item.commit}.tar.gz`]);
      }
    }
    // 공식 값이 없는 파일은 셋(레시피·그 하위 모듈·Pagefind)
    expect(list.items.filter((item) => item.commit !== undefined).map((item) => item.id)).toEqual(['pyodide-recipes-fc85872', 'pyodide-build-26a30ea', 'pagefind-1.5.2']);
  });

  it('Emscripten 포트(zlib·libjpeg·libpng — cv2.so에 정적으로 들어감)도 목록에 있고 공식 SHA-512(포트 파일의 값)로 확인한다', () => {
    for (const [id, file] of [
      ['emscripten-port-zlib-1.3.1', 'zlib-1.3.1.tar.gz'],
      ['emscripten-port-libjpeg-9f', 'jpegsrc.v9f.tar.gz'],
      ['emscripten-port-libpng-1.6.55', 'libpng-1.6.55.tar.gz'],
    ] as const) {
      const item = itemById(id);
      expect(item.file).toBe(file);
      expect(item.group).toBe('lgpl-ffmpeg');
      expect(item.sha512, id).toMatch(/^[0-9a-f]{128}$/u);
      expect(item.hashSource, id).toContain('Emscripten 5.0.3 tools/ports/');
    }
    // 목록의 도구 칸이 포트를 "요구하지 않음"이라고 하지 않는다(소스를 넣었으므로)
    const lgpl = loaded().groups.find((group) => group.id === 'lgpl-ffmpeg')!;
    expect(lgpl.tools).not.toContain('does not require');
    expect(lgpl.toolsKo).toContain('소스를 이 목록에 넣었어요');
  });

  it('서면 제안의 범위 = 목록 전체: 목록의 모든 파일이 고지 두 파일에 있다(주소·커밋·크레이트 이름과 판)', () => {
    const list = loaded();
    const wasmListed = new Set(noticeWasmCrates(pagefindNotice));
    for (const item of list.items) {
      const group = list.groups.find((entry) => entry.id === item.group)!;
      const notice = group.notice.endsWith('pagefind-wasm-3rd-party.txt') ? pagefindNotice : wheelsNotice;
      if (item.file.endsWith('.crate')) {
        const [, name, version] = /^(.+)-(\d[^-]*)\.crate$/u.exec(item.file)!;
        const listed = item.use === 'wasm' ? wasmListed.has(`${name} ${version}`) : notice.includes(`${name} ${version}`);
        expect(listed, `${item.file}이(가) ${group.notice}에 있다`).toBe(true);
      } else if (item.commit !== undefined) {
        expect(notice, `${item.id}의 커밋이 ${group.notice}에 있다`).toContain(item.commit);
      } else {
        expect(item.urls.some((url) => notice.includes(url)), `${item.id}의 받는 곳이 ${group.notice}에 있다`).toBe(true);
      }
    }
    // 범위를 못 박는 문장도 목록 전체를 가리킨다
    expect(wheelsNotice).toContain('여기서 대응 소스는 위 목록 전부');
    expect(wheelsNotice).not.toContain('위 세 가지');
    expect(pagefindNotice).toContain('crates.io 크레이트 전부 21개');
    for (const notice of [wheelsNotice, pagefindNotice]) {
      expect(notice).toContain('scripts/release/sources-manifest.json');
    }
    // 출처 페이지 글(/credits/ "다시 나누는 파일에 꼭 함께 알리는 것")도 목록을 가리킨다
    const creditsText = (id: string) => REDISTRIBUTION_NOTICES.find((entry) => entry.id === id)?.text ?? '';
    expect(creditsText('ffmpeg-lgpl')).toContain('scripts/release/sources-manifest.json');
    expect(creditsText('ffmpeg-lgpl')).toContain('ADE·libwebp·libtiff·zlib·libjpeg·libpng');
    expect(creditsText('pagefind-gpl')).toContain('크레이트 21개');
  });

  it('운영자 안내(scripts/release/README.md)가 같은 릴리스 태그와 명령을 쓴다', () => {
    const readme = fs.readFileSync(path.join(rootDir, 'scripts', 'release', 'README.md'), 'utf8');
    expect(readme).toContain(loaded().releaseTag);
    expect(readme).toContain('powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\release\\fetch-sources.ps1');
    expect(readme).toContain('npm run build:offline -- --sources .cache/release-sources');
  });
});
