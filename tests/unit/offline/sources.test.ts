// 대응 소스 사본 도구(scripts/lib/offline-sources.mjs) — 미해결 211(build:offline --sources)·운영자 할 일 26.
// 작은 가짜 파일로 목록 검사·SHA256SUMS 읽기·폴더 대조(공식 SHA-256·SHA-512·MD5·받을 때 잰 값)·안내 글·zip에 넣기를 확인한다.
// 공식 해시가 없는 GitHub 압축은 git archive 모양의 가짜 .tar.gz(tests/unit/helpers/git-archive.ts)로 압축 안의 커밋·끝까지 풀림을 본다
// (1.1.0 안전 검토 지적 3 — 차단 안내 쪽·끊긴 받기·다른 커밋을 거른다). 진짜 소스 압축은 받지 않는다(내려받기는 운영자 몫 — scripts/release/README.md).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SOURCES_FOLDER_META_FILES,
  SOURCES_README_NAME,
  SOURCES_SUMS_FILE,
  SOURCES_ZIP_DIR,
  addSourceArchivesToZip,
  checkSourcesFolder,
  crateSourceItem,
  cratesFromCargoLock,
  hashFile,
  inspectGitArchive,
  isAllowedSourceUrl,
  parseSha256Sums,
  parseSourcesOption,
  readPaxCommit,
  sourcesGuideFiles,
  sourcesReadmeText,
  sourcesSha256SumsText,
  sourcesSiteMismatches,
  unpinnedSourceItems,
  validateSourcesManifest,
} from '../../../scripts/lib/offline-sources.mjs';
import { ZipWriter } from '../../../scripts/lib/offline-zip.mjs';
import { findDeviceAddresses, findPrivacyPatterns } from '../../../scripts/lib/repo-check.mjs';
import { listZipEntries, readZipEntry } from '../../../scripts/lib/zip-read.mjs';
import { makeTempDir, removeDir, writeFiles } from '../helpers/fixture.ts';
import { gitArchiveTar, gitArchiveTarGz } from '../helpers/git-archive.ts';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    removeDir(dir);
  }
});

function tempDir(): string {
  const dir = makeTempDir('apc-sources-');
  tempDirs.push(dir);
  return dir;
}

const sha = (text: string | Buffer) => crypto.createHash('sha256').update(text).digest('hex');
const md5 = (text: string | Buffer) => crypto.createHash('md5').update(text).digest('hex');
const sha512 = (text: string | Buffer) => crypto.createHash('sha512').update(text).digest('hex');

/** 공식 해시가 없는 GitHub 압축이 담고 있어야 할 커밋 */
const COMMIT = 'fc8587207ecbf0fb54305d5da25ab7ed70f126d3';

const CONTENT = {
  official: 'official source archive bytes',
  md5only: 'archive with only an md5 in the list',
  recorded: gitArchiveTarGz(COMMIT),
  crate: 'pretend crate bytes',
};

function item(overrides: Record<string, unknown>) {
  return {
    id: 'x',
    group: 'lgpl',
    file: 'x.tar.gz',
    urls: ['https://example.org/x.tar.gz'],
    size: null as number | null,
    sha256: null as string | null,
    md5: null as string | null,
    hashSource: null as string | null,
    what: 'what',
    whatKo: '무엇',
    license: 'MIT',
    ...overrides,
  };
}

function group(id: string) {
  return {
    id,
    title: `${id} title`,
    titleKo: `${id} 제목`,
    license: 'LGPL-2.1-or-later',
    binary: 'bin',
    binaryKo: '실행 파일',
    notice: 'licenses/x.txt',
    why: 'why',
    whyKo: '까닭',
    tools: 'tools',
    toolsKo: '도구',
  };
}

/** 가짜 목록: 공식 SHA-256(+크기) · MD5만 · 공식 값 없음 · 크레이트 */
function fakeManifest() {
  return {
    schema: 1,
    releaseTag: 'license-sources-test',
    checkedOn: '2026-09-28',
    site: {
      pyodideVersion: '314.0.7',
      pyodideLockSha256: sha('lock'),
      opencvWheel: 'opencv.whl',
      opencvWheelSha256: sha('wheel'),
      pagefindVersion: '1.5.2',
    },
    groups: [group('lgpl'), group('gpl')],
    items: [
      item({
        id: 'official',
        file: 'official-1.0.tar.gz',
        size: Buffer.byteLength(CONTENT.official),
        sha256: sha(CONTENT.official),
        hashSource: 'recipe meta.yaml',
      }),
      item({ id: 'md5only', file: 'md5only-0.1.zip', md5: md5(CONTENT.md5only), hashSource: 'cmake file' }),
      item({ id: 'recorded', file: 'recorded-abc.tar.gz', group: 'gpl', commit: COMMIT }),
      item({
        id: 'crate-demo-0.1.4',
        file: 'demo-0.1.4.crate',
        group: 'gpl',
        sha256: sha(CONTENT.crate),
        hashSource: 'Cargo.lock',
        use: 'wasm',
        license: 'GPL-3.0-only',
      }),
    ],
  };
}

type FakeManifest = ReturnType<typeof fakeManifest>;

/** fetch-sources.ps1이 받은 뒤의 폴더 모양을 만든다(파일 네 개 + SHA256SUMS.txt) */
function fakeFolder(manifest: FakeManifest, change: (files: Record<string, string | Buffer>) => void = () => {}): string {
  const dir = tempDir();
  const files: Record<string, string | Buffer> = {
    'official-1.0.tar.gz': CONTENT.official,
    'md5only-0.1.zip': CONTENT.md5only,
    'recorded-abc.tar.gz': CONTENT.recorded,
    'demo-0.1.4.crate': CONTENT.crate,
  };
  const sums = manifest.items.map((entry) => `${sha(files[entry.file])}  ${entry.file}\n`).join('');
  change(files);
  writeFiles(dir, { ...files, [SOURCES_SUMS_FILE]: sums });
  return dir;
}

describe('목록 검사(validateSourcesManifest)', () => {
  it('바른 목록은 문제가 없다', () => {
    expect(validateSourcesManifest(fakeManifest())).toEqual([]);
  });

  it('겹친 id·파일 이름(대소문자만 다른 것 포함)·경로가 든 이름·도구 파일 이름·.part를 막는다', () => {
    const manifest = fakeManifest();
    manifest.items.push(item({ id: 'official', file: 'OFFICIAL-1.0.tar.gz' }));
    manifest.items.push(item({ id: 'nested', file: 'sub/dir.tar.gz' }));
    manifest.items.push(item({ id: 'meta', file: SOURCES_SUMS_FILE }));
    manifest.items.push(item({ id: 'part', file: 'half.tar.gz.part' }));
    const problems = validateSourcesManifest(manifest).join('\n');
    expect(problems).toContain('파일 id "official"가 두 번');
    expect(problems).toContain('"OFFICIAL-1.0.tar.gz"이(가) 두 번');
    expect(problems).toMatch(/items\[5\]\(nested\)\.file/u);
    expect(problems).toContain('도구가 쓰는 파일 이름');
    expect(problems).toMatch(/items\[7\]\(part\)\.file/u);
  });

  it('https가 아닌 주소, 해시 모양, 해시 근거 없음, 없는 묶음, TODO를 막는다', () => {
    const manifest = fakeManifest();
    manifest.items.push(item({ id: 'http', file: 'a.tgz', urls: ['http://example.org/a.tgz'] }));
    manifest.items.push(item({ id: 'upper', file: 'b.tgz', sha256: sha('b').toUpperCase(), hashSource: 'x' }));
    manifest.items.push(item({ id: 'nosrc', file: 'c.tgz', md5: md5('c') }));
    manifest.items.push(item({ id: 'nogroup', file: 'd.tgz', group: 'nope' }));
    manifest.items.push(item({ id: 'todo', file: 'e.tgz', license: 'TODO' }));
    manifest.items.push(item({ id: 'size', file: 'f.tgz', size: -3 }));
    manifest.items.push(item({ id: 'use', file: 'g.tgz', use: 'runtime' }));
    const problems = validateSourcesManifest(manifest).join('\n');
    expect(problems).toContain('"http://example.org/a.tgz"은(는) https 주소가 아니에요');
    expect(problems).toContain('(upper).sha256');
    expect(problems).toContain('(nosrc).hashSource');
    expect(problems).toContain('"nope"이(가) groups에 없어요');
    expect(problems).toContain('(todo).license가 비었거나 TODO');
    expect(problems).toContain('(size).size');
    expect(problems).toContain('(use).use');
  });

  it('공식 해시가 없는 파일은 commit(압축 안 git 커밋)이 있어야 하고, commit·sha512 모양을 본다(1.1.0 안전 검토 지적 3)', () => {
    const manifest = fakeManifest();
    manifest.items.push(item({ id: 'nothing', file: 'n.tar.gz' }));
    manifest.items.push(item({ id: 'shortcommit', file: 's.tar.gz', commit: 'abc123' }));
    manifest.items.push(item({ id: 'badsha512', file: 'b.tar.gz', sha512: 'ABC', hashSource: 'port file' }));
    manifest.items.push(item({ id: 'goodsha512', file: 'g.tar.gz', sha512: sha512('g'), hashSource: 'port file' }));
    const problems = validateSourcesManifest(manifest).join('\n');
    expect(problems).toContain('(nothing)은(는) 공식 해시가 없어서 commit');
    expect(problems).toContain('(shortcommit).commit은 없거나 git 커밋 이름');
    expect(problems).toContain('(badsha512).sha512는 없거나 소문자 16진수 128자리');
    expect(problems).not.toContain('goodsha512');
  });

  it('고정하지 않은 항목(공식 해시가 하나도 없음)을 골라낸다 — 이런 목록으로는 오프라인판·릴리스를 만들지 않는다', () => {
    const manifest = fakeManifest();
    expect(unpinnedSourceItems(manifest).map((entry) => entry.id)).toEqual(['recorded']);
    manifest.items[2].sha256 = sha(CONTENT.recorded);
    expect(unpinnedSourceItems(manifest)).toEqual([]);
  });

  it('site·groups 칸이 비면 알린다', () => {
    const manifest = fakeManifest() as Record<string, unknown>;
    manifest.site = { pyodideVersion: '314.0.7', pyodideLockSha256: 'nothex', opencvWheel: '', opencvWheelSha256: sha('w'), pagefindVersion: '1' };
    manifest.groups = [{ ...group('lgpl'), whyKo: '' }, group('gpl')];
    const problems = validateSourcesManifest(manifest).join('\n');
    expect(problems).toContain('site.opencvWheel가 비었어요');
    expect(problems).toContain('site.pyodideLockSha256가 SHA-256');
    expect(problems).toContain('groups[0].whyKo가 비었어요');
  });

  it('시험용 작은 서버 주소(http://127.0.0.1)는 따로 허락할 때만 받는다', () => {
    expect(isAllowedSourceUrl('https://static.crates.io/crates/a/a-1.0.0.crate')).toBe(true);
    expect(isAllowedSourceUrl('http://127.0.0.1:8080/a')).toBe(false);
    expect(isAllowedSourceUrl('http://127.0.0.1:8080/a', { allowLoopbackHttp: true })).toBe(true);
    expect(isAllowedSourceUrl('http://example.org/a', { allowLoopbackHttp: true })).toBe(false);
    expect(isAllowedSourceUrl('https://exa mple.org/a')).toBe(false);
    expect(isAllowedSourceUrl('ftp://example.org/a')).toBe(false);
  });
});

describe('SHA256SUMS.txt 읽기(parseSha256Sums)', () => {
  it('GNU 모양(빈칸 둘·별표), BOM, CRLF, 빈 줄·# 줄을 읽는다', () => {
    const text = `\ufeff# 주석\r\n${sha('a')}  a.tar.gz\r\n\r\n${sha('b').toUpperCase()} *b.crate\n`;
    const { entries, problems } = parseSha256Sums(text);
    expect(problems).toEqual([]);
    expect([...entries]).toEqual([
      ['a.tar.gz', sha('a')],
      ['b.crate', sha('b')],
    ]);
  });

  it('모양이 틀린 줄, 폴더가 든 이름, 같은 파일의 다른 값을 알린다', () => {
    const text = [`${sha('a')}  a.tar.gz`, 'nothash  b.tgz', `${sha('c')}  ../c.tgz`, `${sha('d')}  a.tar.gz`].join('\n');
    const { entries, problems } = parseSha256Sums(text);
    expect(entries.get('a.tar.gz')).toBe(sha('a'));
    expect(problems).toHaveLength(3);
    expect(problems.join('\n')).toContain('2번 줄을 읽지 못했어요');
    expect(problems.join('\n')).toContain('"../c.tgz"');
    expect(problems.join('\n')).toContain('a.tar.gz의 값이 둘');
  });
});

describe('파일 해시(hashFile)', () => {
  it('알려진 값과 같고, 1MiB보다 큰 파일도 조각으로 읽어 같은 값을 낸다', () => {
    const dir = tempDir();
    writeFiles(dir, { 'abc.txt': 'abc' });
    const small = hashFile(path.join(dir, 'abc.txt'), { md5: true });
    expect(small).toEqual({
      size: 3,
      sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      md5: '900150983cd24fb0d6963f7d28e17f72',
    });
    const big = Buffer.alloc(1024 * 1024 * 2 + 17, 7);
    fs.writeFileSync(path.join(dir, 'big.bin'), big);
    expect(hashFile(path.join(dir, 'big.bin'))).toEqual({ size: big.length, sha256: sha(big), md5: null });
    expect(hashFile(path.join(dir, 'big.bin'), { sha512: true }).sha512).toBe(sha512(big));
  });
});

describe('GitHub 소스 압축 확인(inspectGitArchive·readPaxCommit)', () => {
  it('git archive가 적은 커밋을 읽고, 끝까지 풀리면 complete', () => {
    const dir = tempDir();
    writeFiles(dir, { 'a.tar.gz': gitArchiveTarGz(COMMIT) });
    expect(inspectGitArchive(path.join(dir, 'a.tar.gz'))).toEqual({ commit: COMMIT, complete: true, problem: null });
    expect(readPaxCommit(gitArchiveTar(COMMIT))).toBe(COMMIT);
    expect(readPaxCommit(gitArchiveTar(null))).toBeNull();
  });

  it('웹 쪽(차단 안내)·끊긴 받기·pax 머리 없는 압축을 알아본다', () => {
    const dir = tempDir();
    const big = { 'data.txt': crypto.randomBytes(24_000).toString('base64') };
    writeFiles(dir, {
      'blocked.tar.gz': '<!doctype html><title>차단된 사이트</title>',
      'cut.tar.gz': gitArchiveTarGz(COMMIT, { files: big, truncate: 6_000 }),
      'plain.tar.gz': gitArchiveTarGz(null),
    });
    const blocked = inspectGitArchive(path.join(dir, 'blocked.tar.gz'));
    expect(blocked.commit).toBeNull();
    expect(blocked.complete).toBe(false);
    expect(blocked.problem).toContain('gzip 압축이 아니에요');
    const cut = inspectGitArchive(path.join(dir, 'cut.tar.gz'));
    expect(cut.commit).toBe(COMMIT);
    expect(cut.complete).toBe(false);
    expect(cut.problem).toContain('끝까지 풀리지 않아요');
    expect(inspectGitArchive(path.join(dir, 'plain.tar.gz'))).toMatchObject({ commit: null, complete: true });
  });
});

describe('받은 폴더 대조(checkSourcesFolder)', () => {
  it('모두 맞으면 목록 차례대로 돌려주고, 근거(공식 SHA-256·MD5·받을 때 잰 값)를 붙인다', () => {
    const manifest = fakeManifest();
    const result = checkSourcesFolder({ folder: fakeFolder(manifest), manifest });
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.files.map((file) => [file.item.file, file.basis])).toEqual([
      ['official-1.0.tar.gz', 'sha256'],
      ['md5only-0.1.zip', 'md5'],
      ['recorded-abc.tar.gz', 'recorded'],
      ['demo-0.1.4.crate', 'sha256'],
    ]);
    expect(result.files[1].md5).toBe(md5(CONTENT.md5only));
    expect(result.files[2].sha256).toBe(sha(CONTENT.recorded));
    // 공식 해시가 없는 압축은 안의 git 커밋을 확인했다
    expect(result.files[2].commit).toBe(COMMIT);
  });

  it('없는 파일·공식 값과 다른 파일·크기가 다른 파일을 막는다', () => {
    const manifest = fakeManifest();
    manifest.items[0].size = 5;
    const folder = fakeFolder(manifest, (files) => {
      delete files['demo-0.1.4.crate'];
      files['md5only-0.1.zip'] = 'tampered';
    });
    const result = checkSourcesFolder({ folder, manifest });
    const text = result.problems.join('\n');
    expect(result.ok).toBe(false);
    expect(text).toContain('demo-0.1.4.crate이(가) 폴더에 없어요');
    expect(text).toContain('md5only-0.1.zip의 MD5가 목록의 공식 값과 달라요');
    expect(text).toContain(`official-1.0.tar.gz의 크기가 ${Buffer.byteLength(CONTENT.official)}바이트예요(목록 5바이트)`);
    expect(result.files.map((file) => file.item.file)).toEqual(['recorded-abc.tar.gz']);
  });

  it('공식 값이 없는 파일은 SHA256SUMS.txt(받을 때 잰 값)와 달라지면 막는다 — 받은 뒤에 바뀐 파일', () => {
    const manifest = fakeManifest();
    const folder = fakeFolder(manifest, (files) => {
      // 같은 커밋이지만 다른 바이트(다시 받은 압축) — 커밋 확인은 통과하고 받을 때 잰 값과 다르다
      files['recorded-abc.tar.gz'] = gitArchiveTarGz(COMMIT, { files: { 'README.md': 'changed after download\n' } });
    });
    const result = checkSourcesFolder({ folder, manifest });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([expect.stringContaining('recorded-abc.tar.gz이(가) 받은 뒤에 바뀌었어요')]);
  });

  it('공식 해시가 없는 압축은 안의 git 커밋이 목록과 달라도·끊겨 있어도·웹 쪽이어도 막는다(받을 때 잰 값과 같아도)', () => {
    const manifest = fakeManifest();
    for (const [label, data, expected] of [
      ['다른 커밋', gitArchiveTarGz('0'.repeat(40)), '안의 git 커밋이 0000000000000000000000000000000000000000이에요'],
      ['끊긴 받기', gitArchiveTarGz(COMMIT, { files: { 'data.txt': crypto.randomBytes(24_000).toString('base64') }, truncate: 6_000 }), '끝까지 풀리지 않아요'],
      ['차단 안내 쪽', Buffer.from('<html>blocked</html>'), 'gzip 압축이 아니에요'],
    ] as const) {
      const dir = tempDir();
      const files: Record<string, string | Buffer> = {
        'official-1.0.tar.gz': CONTENT.official,
        'md5only-0.1.zip': CONTENT.md5only,
        'recorded-abc.tar.gz': data,
        'demo-0.1.4.crate': CONTENT.crate,
      };
      // 받을 때 잰 값도 그 (틀린) 파일의 값 — 기록만으로는 거르지 못하는 경우
      const sums = manifest.items.map((entry) => `${sha(files[entry.file]!)}  ${entry.file}\n`).join('');
      writeFiles(dir, { ...files, [SOURCES_SUMS_FILE]: sums });
      const result = checkSourcesFolder({ folder: dir, manifest });
      expect(result.ok, label).toBe(false);
      expect(result.problems.join('\n'), label).toContain(expected);
      expect(result.files.map((file) => file.item.file), label).not.toContain('recorded-abc.tar.gz');
    }
  });

  it('공식 SHA-512(Emscripten 포트)가 있는 파일은 SHA-512로 대조한다', () => {
    const manifest = fakeManifest();
    const folder = fakeFolder(manifest);
    manifest.items.push(item({ id: 'port', file: 'zlib-1.3.1.tar.gz', sha512: sha512('zlib port'), hashSource: 'tools/ports/zlib.py' }) as (typeof manifest.items)[number]);
    writeFiles(folder, { 'zlib-1.3.1.tar.gz': 'zlib port' });
    fs.appendFileSync(path.join(folder, SOURCES_SUMS_FILE), `${sha('zlib port')}  zlib-1.3.1.tar.gz\n`);
    const ok = checkSourcesFolder({ folder, manifest });
    expect(ok.problems).toEqual([]);
    expect(ok.files.at(-1)).toMatchObject({ basis: 'sha512', sha512: sha512('zlib port') });
    writeFiles(folder, { 'zlib-1.3.1.tar.gz': 'other bytes' });
    fs.writeFileSync(
      path.join(folder, SOURCES_SUMS_FILE),
      fs.readFileSync(path.join(folder, SOURCES_SUMS_FILE), 'utf8').replace(sha('zlib port'), sha('other bytes')),
    );
    expect(checkSourcesFolder({ folder, manifest }).problems.join('\n')).toContain('zlib-1.3.1.tar.gz의 SHA-512가 목록의 공식 값과 달라요');
  });

  it('SHA256SUMS.txt가 없거나 줄이 빠지면 막는다', () => {
    const manifest = fakeManifest();
    const noSums = fakeFolder(manifest);
    fs.rmSync(path.join(noSums, SOURCES_SUMS_FILE));
    const missing = checkSourcesFolder({ folder: noSums, manifest });
    expect(missing.ok).toBe(false);
    expect(missing.problems).toEqual([expect.stringContaining(`${SOURCES_SUMS_FILE}이(가) 없어요`)]);

    const partial = fakeFolder(manifest);
    const sumsPath = path.join(partial, SOURCES_SUMS_FILE);
    fs.writeFileSync(sumsPath, fs.readFileSync(sumsPath, 'utf8').split('\n').filter((line) => !line.includes('recorded-abc')).join('\n'));
    const result = checkSourcesFolder({ folder: partial, manifest });
    expect(result.problems).toEqual([expect.stringContaining('SHA256SUMS.txt에 recorded-abc.tar.gz 줄이 없어요')]);
  });

  it('목록 밖 파일·쓰다 만 .part·도구 파일은 넣지 않고, 목록 밖 파일만 참고로 알린다', () => {
    const manifest = fakeManifest();
    const folder = fakeFolder(manifest);
    writeFiles(folder, {
      'stranger.tar.gz': 'not in the list',
      'official-1.0.tar.gz.part': 'half',
      'fetch-result.json': '{}',
      'release-notes.md': '# notes',
    });
    fs.appendFileSync(path.join(folder, SOURCES_SUMS_FILE), `${sha('old')}  old-0.9.tar.gz\n`);
    const result = checkSourcesFolder({ folder, manifest });
    expect(result.ok).toBe(true);
    expect(result.files).toHaveLength(4);
    expect(result.notes).toEqual([
      '목록에 없는 파일은 넣지 않아요: stranger.tar.gz',
      `${SOURCES_SUMS_FILE}에 목록 밖 파일 줄이 있어요(쓰지 않아요): old-0.9.tar.gz`,
    ]);
    expect(SOURCES_FOLDER_META_FILES).toContain('fetch-result.json');
  });

  it('폴더가 없으면 한 줄로 알린다', () => {
    const result = checkSourcesFolder({ folder: path.join(tempDir(), 'nope'), manifest: fakeManifest() });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([expect.stringContaining('대응 소스 폴더가 없어요')]);
  });

  it('받기 전 빈 폴더면 파일마다가 아니라 한 줄로, 먼저 받으라고 알린다', () => {
    const result = checkSourcesFolder({ folder: tempDir(), manifest: fakeManifest() });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(['목록의 파일 4개가 이 폴더에 하나도 없어요 — 먼저 scripts/release/fetch-sources.ps1로 받아요(scripts/release/README.md).']);
  });
});

describe('사이트 판 대조(sourcesSiteMismatches)', () => {
  it('같으면 비고, 다른 칸마다 한 줄', () => {
    const manifest = fakeManifest();
    expect(sourcesSiteMismatches(manifest, { ...manifest.site })).toEqual([]);
    const lines = sourcesSiteMismatches(manifest, { ...manifest.site, pagefindVersion: '1.6.0', opencvWheelSha256: null });
    expect(lines).toEqual([
      `site.opencvWheelSha256: 목록 ${manifest.site.opencvWheelSha256} ↔ 이 사이트 (없음)`,
      'site.pagefindVersion: 목록 1.5.2 ↔ 이 사이트 1.6.0',
    ]);
  });
});

describe('build:offline --sources 읽기(parseSourcesOption)', () => {
  it('두 모양을 읽고, 값이 없거나 두 번이면 한국어로 알린다', () => {
    expect(parseSourcesOption(['--skip-build'])).toEqual({ folder: null, error: null });
    expect(parseSourcesOption(['--sources', '.cache/release-sources', '--no-zip'])).toEqual({ folder: '.cache/release-sources', error: null });
    expect(parseSourcesOption(['--sources=D:/usb/src'])).toEqual({ folder: 'D:/usb/src', error: null });
    expect(parseSourcesOption(['--sources']).error).toContain('--sources 뒤에 대응 소스 폴더');
    expect(parseSourcesOption(['--sources', '--no-zip']).error).toContain('--sources 뒤에');
    expect(parseSourcesOption(['--sources=']).error).toContain('--sources 뒤에');
    expect(parseSourcesOption(['--sources', 'a', '--sources', 'b']).error).toContain('한 번만');
  });
});

describe('zip 안 안내 글과 확인값', () => {
  function checked() {
    const manifest = fakeManifest();
    const result = checkSourcesFolder({ folder: fakeFolder(manifest), manifest });
    expect(result.ok).toBe(true);
    return { manifest, files: result.files };
  }

  it('SHA256SUMS.txt는 목록 차례·LF·sha256sum -c 모양', () => {
    const { files } = checked();
    const text = sourcesSha256SumsText(files);
    expect(text.split('\n')).toEqual([
      `${sha(CONTENT.official)}  official-1.0.tar.gz`,
      `${sha(CONTENT.md5only)}  md5only-0.1.zip`,
      `${sha(CONTENT.recorded)}  recorded-abc.tar.gz`,
      `${sha(CONTENT.crate)}  demo-0.1.4.crate`,
      '',
    ]);
    expect(text).not.toContain('\r');
  });

  it('읽어보세요.txt는 파일마다 이름·크기·받은 곳, 한국어와 영어, 이 컴퓨터 경로 없음, 개인정보 검사 통과', () => {
    const { manifest, files } = checked();
    const text = sourcesReadmeText({ manifest, files, version: '1.1.0' });
    for (const file of files) {
      expect(text).toContain(file.item.file);
    }
    expect(text).toContain('https://example.org/x.tar.gz');
    expect(text).toContain('오프라인판 1.1.0 — 대응 소스 사본');
    expect(text).toContain('Corresponding source — AI Physical Computing Open Lab offline edition 1.1.0');
    expect(text).toContain('공식 해시가 없는 1개');
    expect(text).toContain('git 커밋이 목록과 같은지 확인');
    expect(text).toContain('sha256sum -c SHA256SUMS.txt');
    expect(text).toContain('license-sources-test');
    // 크레이트는 주소를 한 번만(파일마다 되풀이하지 않음)
    expect(text).toContain('.crate 파일은 모두 crates.io');
    expect(text).not.toMatch(/[A-Za-z]:\\/u);
    expect(text).not.toMatch(/\/(?:home|Users)\//u);
    expect(findDeviceAddresses(text)).toEqual([]);
    expect(findPrivacyPatterns(text)).toEqual([]);
  });

  it('안내 글 두 개: 읽어보세요.txt는 BOM·CRLF, SHA256SUMS.txt는 BOM 없는 LF', () => {
    const { manifest, files } = checked();
    const [readme, sums] = sourcesGuideFiles({ manifest, files, version: '9.9.9' });
    expect(readme.name).toBe(`${SOURCES_ZIP_DIR}/${SOURCES_README_NAME}`);
    expect([...readme.data.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(readme.data.toString('utf8')).toContain('\r\n');
    expect(readme.data.toString('utf8').replace(/\r\n/gu, '')).not.toContain('\n');
    expect(sums.name).toBe(`${SOURCES_ZIP_DIR}/${SOURCES_SUMS_FILE}`);
    expect(sums.data.toString('utf8')).toBe(sourcesSha256SumsText(files));
  });

  it('확인한 뒤에 바뀐 파일은 zip에 넣지 않고 멈춘다', () => {
    const { files } = checked();
    fs.writeFileSync(files[2].path, 'swapped after the check');
    const added: string[] = [];
    const writer = { addFile: (name: string) => void added.push(name) };
    expect(() => addSourceArchivesToZip(writer, 'top/', files)).toThrow(/recorded-abc\.tar\.gz이\(가\) 확인한 뒤에 바뀌었어요/u);
    expect(added).toEqual(['top/sources/official-1.0.tar.gz', 'top/sources/md5only-0.1.zip']);
  });

  it('zip에 넣으면(build-offline과 같은 도우미) 다시 읽어 이름·저장 방식·내용이 같다', () => {
    const { manifest, files } = checked();
    const zipPath = path.join(tempDir(), 'out.zip');
    const top = 'apc-offline-9.9.9/';
    const writer = new ZipWriter(zipPath, { date: new Date(2026, 8, 28, 12, 0, 0) });
    writer.addDirectory(top);
    writer.addDirectory(`${top}${SOURCES_ZIP_DIR}/`);
    for (const guide of sourcesGuideFiles({ manifest, files, version: '9.9.9' })) {
      writer.addFile(`${top}${guide.name}`, guide.data);
    }
    addSourceArchivesToZip(writer, top, files);
    writer.close();

    const buffer = fs.readFileSync(zipPath);
    const entries = listZipEntries(buffer);
    expect(entries.map((entry) => entry.name)).toEqual([
      top,
      `${top}sources/`,
      `${top}sources/읽어보세요.txt`,
      `${top}sources/SHA256SUMS.txt`,
      ...files.map((file) => `${top}sources/${file.item.file}`),
    ]);
    expect(entries.find((entry) => entry.name.endsWith('읽어보세요.txt'))?.utf8Flag).toBe(true);
    for (const file of files) {
      const entry = entries.find((candidate) => candidate.name === `${top}sources/${file.item.file}`);
      expect(entry?.method, file.item.file).toBe(0);
      expect(sha(readZipEntry(buffer, entry!)), file.item.file).toBe(file.sha256);
    }
    const sums = parseSha256Sums(readZipEntry(buffer, entries.find((entry) => entry.name.endsWith(SOURCES_SUMS_FILE))!).toString('utf8'));
    expect(sums.problems).toEqual([]);
    expect(sums.entries.size).toBe(files.length);
  });
});

describe('Cargo.lock → 크레이트 항목(cratesFromCargoLock·crateSourceItem)', () => {
  const lock = [
    '# This file is automatically @generated by Cargo.',
    'version = 4',
    '',
    '[[package]]',
    'name = "bit-set"',
    'version = "0.10.0"',
    'source = "registry+https://github.com/rust-lang/crates.io-index"',
    `checksum = "${sha('bit-set')}"`,
    'dependencies = [',
    ' "bit-vec",',
    ']',
    '',
    '[[package]]',
    'name = "pagefind_web"',
    'version = "0.0.0"',
    '',
    '[[package]]',
    'name = "pagefind_microjson"',
    'version = "0.1.4"',
    'source = "registry+https://github.com/rust-lang/crates.io-index"',
    `checksum = "${sha('microjson')}"`,
    '',
  ].join('\n');

  it('crates.io 크레이트만(경로 의존은 빼고) 이름·판·체크섬을 읽는다', () => {
    expect(cratesFromCargoLock(lock)).toEqual([
      { name: 'bit-set', version: '0.10.0', checksum: sha('bit-set') },
      { name: 'pagefind_microjson', version: '0.1.4', checksum: sha('microjson') },
    ]);
  });

  it('crates.io가 아닌 곳, 체크섬 없음은 멈춘다', () => {
    expect(() => cratesFromCargoLock(lock.replace('registry+https://github.com/rust-lang/crates.io-index"\nchecksum', 'git+https://example.org/x"\nchecksum'))).toThrow(
      /crates\.io가 아닌 곳/u,
    );
    expect(() => cratesFromCargoLock(lock.replace(`checksum = "${sha('microjson')}"`, ''))).toThrow(/checksum이 없거나/u);
  });

  it('항목은 static.crates.io 주소가 먼저이고, 라이선스·쓰임을 채우지 않으면 목록 검사가 막는다', () => {
    const [bitSet] = cratesFromCargoLock(lock);
    const draft = crateSourceItem(bitSet, { hashSource: 'Cargo.lock', group: 'gpl' });
    expect(draft.file).toBe('bit-set-0.10.0.crate');
    expect(draft.urls).toEqual([
      'https://static.crates.io/crates/bit-set/bit-set-0.10.0.crate',
      'https://crates.io/api/v1/crates/bit-set/0.10.0/download',
    ]);
    expect(draft.sha256).toBe(sha('bit-set'));
    const manifest = fakeManifest();
    manifest.items.push(draft as unknown as (typeof manifest.items)[number]);
    expect(validateSourcesManifest(manifest).join('\n')).toMatch(/crate-bit-set-0\.10\.0\)\.(?:what|license)가 비었거나 TODO/u);
    const filled = crateSourceItem(bitSet, { hashSource: 'Cargo.lock', group: 'gpl', license: 'Apache-2.0 OR MIT', use: 'wasm' });
    const ok = fakeManifest();
    ok.items.push(filled as unknown as (typeof ok.items)[number]);
    expect(validateSourcesManifest(ok)).toEqual([]);
    expect(filled.whatKo).toContain('검색 엔진 wasm에 함께 컴파일됨');
  });
});
