// 대응 소스 릴리스 준비 도구(scripts/release/release-notes.mjs — 운영자 할 일 26)를 가짜 목록·파일로 확인한다.
// 이 도구는 아무것도 올리지 않는다: 설명과 명령을 만들고(찍기만), 올라간 뒤에는 gh api 결과(여기서는 가짜 JSON)를 대조한다.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SOURCES_SUMS_FILE, checkSourcesFolder } from '../../../scripts/lib/offline-sources.mjs';
import {
  NOTES_FILE,
  RELEASE_REPO,
  buildReleaseNotes,
  compareUploadedAssets,
  findRelease,
  readJsonFile,
  readOfflineZip,
  releaseAssets,
  releaseCommands,
} from '../../../scripts/release/release-notes.mjs';
import { makeTempDir, removeDir, writeFiles } from '../helpers/fixture.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
const SCRIPT = path.join(rootDir, 'scripts', 'release', 'release-notes.mjs');
const sha = (text: string | Buffer) => crypto.createHash('sha256').update(text).digest('hex');

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    removeDir(dir);
  }
});

const FILES: Record<string, string> = {
  'ffmpeg-9.9.tar.gz': 'ffmpeg source bytes',
  'recipes-abc.tar.gz': 'recipes archive bytes',
  'microjson-0.1.4.crate': 'gpl crate bytes',
  'syn-2.0.0.crate': 'macro crate bytes',
};

function group(id: string, ko: string) {
  return {
    id,
    title: `${id} group`,
    titleKo: `${ko} 묶음`,
    license: 'LGPL-2.1-or-later',
    binary: `${id} binary`,
    binaryKo: `${ko} 실행 파일`,
    notice: `licenses/${id}.txt`,
    why: `${id} why`,
    whyKo: `${ko} 까닭`,
    tools: `${id} tools`,
    toolsKo: `${ko} 도구`,
  };
}

function manifest() {
  const item = (id: string, file: string, groupId: string, fields: Record<string, unknown>) => ({
    id,
    group: groupId,
    file,
    urls: [`https://example.org/${file}`],
    size: null,
    sha256: null,
    md5: null,
    hashSource: null,
    what: `${id} what`,
    whatKo: `${id} 무엇`,
    license: 'MIT',
    ...fields,
  });
  return {
    schema: 1,
    releaseTag: 'license-sources-test',
    checkedOn: '2026-09-28',
    site: { pyodideVersion: '0', pyodideLockSha256: sha('l'), opencvWheel: 'w.whl', opencvWheelSha256: sha('w'), pagefindVersion: '0' },
    groups: [group('lgpl', '엘지피엘'), group('gpl', '지피엘')],
    items: [
      item('ffmpeg', 'ffmpeg-9.9.tar.gz', 'lgpl', { sha256: sha(FILES['ffmpeg-9.9.tar.gz']), hashSource: 'recipe meta.yaml', license: 'LGPL-2.1-or-later' }),
      item('recipes', 'recipes-abc.tar.gz', 'lgpl', { license: 'MPL-2.0' }),
      item('microjson', 'microjson-0.1.4.crate', 'gpl', { sha256: sha(FILES['microjson-0.1.4.crate']), hashSource: 'Cargo.lock', license: 'GPL-3.0-only', use: 'wasm' }),
      item('syn', 'syn-2.0.0.crate', 'gpl', { sha256: sha(FILES['syn-2.0.0.crate']), hashSource: 'Cargo.lock', use: 'build' }),
    ],
  };
}

/** fetch-sources.ps1이 받은 뒤의 폴더 + 가짜 목록 파일 */
function prepared() {
  const dir = makeTempDir('apc-release-notes-');
  tempDirs.push(dir);
  const list = manifest();
  const sums = list.items.map((entry) => `${sha(FILES[entry.file])}  ${entry.file}\n`).join('');
  writeFiles(dir, {
    ...FILES,
    [SOURCES_SUMS_FILE]: sums,
    'fetch-result.json': '﻿{"finishedAt":"2026-09-29T01:02:03Z"}',
    'manifest.json': JSON.stringify(list),
  });
  const checked = checkSourcesFolder({ folder: dir, manifest: list as never });
  expect(checked.problems).toEqual([]);
  return { dir, list, files: checked.files };
}

/** 가짜 오프라인판 zip과 빌드 요약 */
function offlineZip(dir: string, summarySha?: string) {
  const zipPath = path.join(dir, 'apc-offline-1.1.0.zip');
  fs.writeFileSync(zipPath, 'PK fake offline zip');
  fs.writeFileSync(path.join(dir, 'apc-offline-1.1.0.json'), JSON.stringify({ zip: { sha256: summarySha ?? sha('PK fake offline zip') } }));
  return zipPath;
}

describe('릴리스 설명(buildReleaseNotes)', () => {
  it('묶음마다 한국어·영어 표, 공식 값의 근거, 받을 때 잰 값의 날, 크레이트는 접기, 고지 주소', () => {
    const { list, files } = prepared();
    const notes = buildReleaseNotes({ manifest: list as never, files, fetchedOn: '2026-09-29' });
    expect(notes).toContain('## 엘지피엘 묶음');
    expect(notes).toContain('#### lgpl group');
    for (const file of Object.keys(FILES)) {
      expect(notes).toContain(`\`${file}\``);
    }
    expect(notes).toContain('공식 SHA-256 — recipe meta.yaml');
    expect(notes).toContain('받을 때 잰 값(2026-09-29)');
    expect(notes).toContain('measured when downloaded (2026-09-29)');
    expect(notes).toContain('<details><summary>크레이트 2개');
    expect(notes).toContain('(https://songdocomputerpark-lang.github.io/ai-physical-computing/licenses/lgpl.txt)');
    expect(notes).toContain('공식 해시가 없는 1개');
    expect(notes).not.toContain('오프라인판 1.1.0');
    expect(notes).not.toMatch(/[A-Za-z]:\\/u);
  });

  it('오프라인판 zip을 넣으면 이름·크기·SHA-256 칸이 생긴다', () => {
    const { dir, list, files } = prepared();
    const zip = readOfflineZip(offlineZip(dir));
    const notes = buildReleaseNotes({ manifest: list as never, files, offlineZip: zip });
    expect(notes).toContain('## 오프라인판 1.1.0');
    expect(notes).toContain(`\`apc-offline-1.1.0.zip\` — ${zip.size}바이트, SHA-256 \`${sha('PK fake offline zip')}\``);
  });
});

describe('오프라인판 zip 확인(readOfflineZip)', () => {
  it('이름 모양과 빌드 요약의 SHA-256을 본다', () => {
    const dir = makeTempDir('apc-release-zip-');
    tempDirs.push(dir);
    expect(readOfflineZip(offlineZip(dir)).version).toBe('1.1.0');
    expect(() => readOfflineZip(offlineZip(dir, sha('other')))).toThrow(/빌드 요약.*달라요/u);
    fs.writeFileSync(path.join(dir, 'offline.zip'), 'x');
    expect(() => readOfflineZip(path.join(dir, 'offline.zip'))).toThrow(/apc-offline-<판>\.zip 모양/u);
  });
});

describe('올릴 파일과 명령(releaseAssets·releaseCommands)', () => {
  it('소스 → SHA256SUMS.txt → zip 차례, 명령은 초안(--draft)·main·저장소 뿌리 기준 경로, 공개는 따로', () => {
    const { dir, files } = prepared();
    const zip = readOfflineZip(offlineZip(dir));
    const assets = releaseAssets({ files, dir, offlineZip: zip });
    expect(assets.map((asset) => asset.name)).toEqual([...Object.keys(FILES), SOURCES_SUMS_FILE, 'apc-offline-1.1.0.zip']);
    const commands = releaseCommands({
      tag: 'license-sources-test',
      title: '대응 소스 사본 (test)',
      notesPath: path.join(dir, NOTES_FILE),
      assets,
      rootDir: path.dirname(dir),
    });
    const folder = path.basename(dir);
    expect(commands.create).toBe(
      [
        'gh release create license-sources-test',
        `--repo ${RELEASE_REPO}`,
        '--target main',
        '--draft',
        '--title "대응 소스 사본 (test)"',
        `--notes-file ${folder}/${NOTES_FILE}`,
        ...assets.map((asset) => `${folder}/${asset.name}`),
      ].join(' '),
    );
    expect(commands.publish).toBe(`gh release edit license-sources-test --repo ${RELEASE_REPO} --draft=false`);
    expect(commands.check).toBe('node scripts/release/release-notes.mjs --check-uploaded');
  });
});

describe('올라간 파일 대조(compareUploadedAssets·findRelease·readJsonFile)', () => {
  const expected = [
    { name: 'a.tar.gz', size: 10, sha256: sha('a') },
    { name: 'SHA256SUMS.txt', size: 3, sha256: sha('s') },
  ];

  it('이름·크기·digest가 같으면 통과, digest가 없으면 크기만 보고 알린다', () => {
    const ok = compareUploadedAssets({
      release: { assets: [{ name: 'a.tar.gz', size: 10, digest: `sha256:${sha('a')}`, state: 'uploaded' }, { name: 'SHA256SUMS.txt', size: 3, state: 'uploaded' }] },
      expected,
    });
    expect(ok.ok).toBe(true);
    expect(ok.lines).toContain(`PASS    a.tar.gz 10 ${sha('a')}`);
    expect(ok.lines.at(-1)).toContain('1 asset(s) had no digest');
  });

  it('빠진 파일·크기·digest가 다른 파일·목록 밖 파일·다 올라가지 않은 파일을 막는다', () => {
    const result = compareUploadedAssets({
      release: {
        assets: [
          { name: 'a.tar.gz', size: 10, digest: `sha256:${sha('other')}`, state: 'uploaded' },
          { name: 'extra.bin', size: 1, state: 'uploaded' },
        ],
      },
      expected,
    });
    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toContain('a.tar.gz의 SHA-256(digest)이 폴더의 파일과 달라요');
    expect(result.problems.join('\n')).toContain('SHA256SUMS.txt이(가) 릴리스에 없어요');
    expect(result.problems.join('\n')).toContain('목록 밖 파일이 있어요: extra.bin');
    const size = compareUploadedAssets({ release: { assets: [{ name: 'a.tar.gz', size: 9, state: 'starter' }] }, expected: [expected[0]] });
    expect(size.problems.join('\n')).toContain('a.tar.gz의 크기가 9바이트예요(폴더 10바이트)');
    expect(size.problems.join('\n')).toContain('다 올라가지 않았어요(state starter)');
  });

  it('gh api 결과(배열)에서 초안 릴리스를 태그로 찾고, PowerShell > 로 저장한 UTF-16 파일도 읽는다', () => {
    const releases = [
      { tag_name: 'v0', draft: false, assets: [] },
      { tag_name: 'license-sources-test', draft: true, assets: [] },
    ];
    expect(findRelease(releases, 'license-sources-test')).toMatchObject({ draft: true });
    expect(findRelease(releases[0], 'v0')).toMatchObject({ tag_name: 'v0' });
    expect(findRelease(releases, 'nope')).toBeNull();
    const dir = makeTempDir('apc-release-json-');
    tempDirs.push(dir);
    const utf16 = path.join(dir, 'utf16.json');
    fs.writeFileSync(utf16, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(JSON.stringify(releases), 'utf16le')]));
    expect(readJsonFile(utf16)).toEqual(releases);
    const bom = path.join(dir, 'bom.json');
    fs.writeFileSync(bom, `﻿${JSON.stringify(releases)}`, 'utf8');
    expect(readJsonFile(bom)).toEqual(releases);
  });
});

describe('명령 줄(node scripts/release/release-notes.mjs) — 올리지 않음', () => {
  function run(args: string[]) {
    return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: rootDir, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  }

  it('준비: 폴더를 확인하고 설명을 쓰고 명령만 찍는다', () => {
    const { dir } = prepared();
    const result = run(['--dir', dir, '--manifest', path.join(dir, 'manifest.json')]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('올릴 파일 5개');
    expect(result.stdout).toContain('운영자가 "예"라고 한 뒤에만');
    expect(result.stdout).toMatch(/1\) gh release create license-sources-test --repo \S+ --target main --draft /u);
    expect(result.stdout).toContain('3) gh release edit license-sources-test');
    const notes = fs.readFileSync(path.join(dir, NOTES_FILE), 'utf8');
    expect(notes).toContain('받을 때 잰 값(2026-09-29)');
  });

  it('준비: SHA256SUMS.txt에 목록 밖 줄이 있으면 목록의 파일만으로 다시 쓴다', () => {
    const { dir, files } = prepared();
    fs.appendFileSync(path.join(dir, SOURCES_SUMS_FILE), `${sha('old')}  old-1.0.tar.gz\n`);
    const result = run(['--dir', dir, '--manifest', path.join(dir, 'manifest.json')]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`${SOURCES_SUMS_FILE}를 목록의 파일 4개로만 다시 썼어요`);
    expect(fs.readFileSync(path.join(dir, SOURCES_SUMS_FILE), 'utf8')).toBe(files.map((file) => `${file.sha256}  ${file.item.file}\n`).join(''));
  });

  it('준비: 폴더가 틀리면 멈추고 운영자에게 다시 받게 한다', () => {
    const { dir } = prepared();
    fs.writeFileSync(path.join(dir, 'ffmpeg-9.9.tar.gz'), 'changed');
    const result = run(['--dir', dir, '--manifest', path.join(dir, 'manifest.json')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ffmpeg-9.9.tar.gz의 SHA-256이 목록의 공식 값과 달라요');
    expect(result.stderr).toContain('fetch-sources.ps1을 다시 돌려야 해요');
    expect(fs.existsSync(path.join(dir, NOTES_FILE))).toBe(false);
  });

  it('--check-uploaded: 가짜 gh api 결과로 대조한다(네트워크 없이)', () => {
    const { dir, files } = prepared();
    const sums = fs.readFileSync(path.join(dir, SOURCES_SUMS_FILE));
    const assets = [
      ...files.map((file) => ({ name: file.item.file, size: file.size, digest: `sha256:${file.sha256}`, state: 'uploaded' })),
      { name: SOURCES_SUMS_FILE, size: sums.length, digest: `sha256:${sha(sums)}`, state: 'uploaded' },
    ];
    const uploaded = path.join(dir, 'uploaded.json');
    fs.writeFileSync(uploaded, JSON.stringify([{ tag_name: 'license-sources-test', draft: true, assets }]));
    const ok = run(['--dir', dir, '--manifest', path.join(dir, 'manifest.json'), '--check-uploaded', '--uploaded-json', uploaded]);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toContain('모두 맞아요(5개, 릴리스 초안)');

    fs.writeFileSync(uploaded, JSON.stringify([{ tag_name: 'license-sources-test', draft: true, assets: assets.slice(1) }]));
    const missing = run(['--dir', dir, '--manifest', path.join(dir, 'manifest.json'), '--check-uploaded', '--uploaded-json', uploaded]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('공개하지 말고 고쳐요');
  });
});
