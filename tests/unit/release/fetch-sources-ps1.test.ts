// 운영자가 돌리는 대응 소스 받기 스크립트(scripts/release/fetch-sources.ps1 — 운영자 할 일 26)를 확인한다.
// 인터넷의 진짜 소스 압축은 받지 않는다: 이 테스트가 이 컴퓨터 안(127.0.0.1)에 작은 서버를 띄워 가짜 파일을 주고, 가짜 목록으로
// 스크립트를 돌려 해시 대조(PASS·RECORD·FAIL — SHA-256·SHA-512·MD5)·다른 주소로 넘어가기·결과 파일·다시 돌리기·-VerifyOnly·-Force·-ListOnly를 본다.
// 공식 해시가 없는 GitHub 압축은 git archive 모양의 가짜 .tar.gz로 "압축 안의 커밋이 목록과 같고 끝까지 풀리는지"를 본다 — 다른 커밋·
// 끊긴 받기·학교망 차단 안내 쪽(HTML)은 FAIL이고 남기지 않는다(1.1.0 안전 검토 지적 3).
// 저장소의 진짜 목록은 -ListOnly로만 읽는다(그 갈래는 받는 코드보다 앞에서 끝난다). Windows PowerShell 5.1이 필요해 CI(Linux)는 건너뛴다.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SOURCES_SUMS_FILE, parseSha256Sums, readSourcesManifest, validateSourcesManifest } from '../../../scripts/lib/offline-sources.mjs';
import { makeTempDir, removeDir } from '../helpers/fixture.ts';
import { gitArchiveTarGz } from '../helpers/git-archive.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
const SCRIPT = path.join(rootDir, 'scripts', 'release', 'fetch-sources.ps1');
const isWindows = process.platform === 'win32';
/** PowerShell 5.1은 켜지는 데만 몇 초 걸린다(다른 검사와 함께 돌면 더) — 검사 하나의 제한 시간 */
const PS_TIMEOUT = 90_000;

const sha = (text: string | Buffer) => crypto.createHash('sha256').update(text).digest('hex');
const md5 = (text: string | Buffer) => crypto.createHash('md5').update(text).digest('hex');
const sha512 = (text: string | Buffer) => crypto.createHash('sha512').update(text).digest('hex');

/** 공식 해시가 없는 GitHub 압축이 담고 있어야 할 커밋 */
const COMMIT = 'bf17396721be637cc67c8ed7ead1dc7b8ac43d96';

describe('fetch-sources.ps1 글자', () => {
  it('ASCII 글자만 쓴다(BOM 없는 파일을 Windows PowerShell 5.1이 CP949로 읽어도 깨지지 않게)', () => {
    const data = fs.readFileSync(SCRIPT);
    const bad = [...data.entries()].filter(([, byte]) => byte > 0x7e || (byte < 0x20 && byte !== 0x0a && byte !== 0x0d && byte !== 0x09));
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('스크립트가 도구 파일 이름·결과 낱말을 Node 쪽(scripts/lib/offline-sources.mjs)과 같게 쓴다', () => {
    const text = fs.readFileSync(SCRIPT, 'utf8');
    expect(text).toContain("$MetaFiles = @('SHA256SUMS.txt', 'fetch-result.json', 'fetch-result.txt', 'release-notes.md', 'uploaded.json')");
    for (const word of ['PASS', 'RECORD', 'FAIL', 'MISSING']) {
      expect(text).toContain(`'${word}'`);
    }
  });
});

/** 작은 서버가 주는 가짜 파일(경로 → 내용). /missing은 404 */
const BODIES: Record<string, string | Buffer> = {
  '/good.bin': 'good official content',
  '/md5.bin': 'content checked by md5',
  '/record.bin': gitArchiveTarGz(COMMIT),
  '/bad.bin': 'tampered content',
  '/mirror.bin': 'content on the second address',
  '/wrong.bin': 'first address gives other bytes',
  '/right.bin': 'second address gives the right bytes',
  '/sha512.bin': 'emscripten port archive',
  // 공식 해시가 없는 압축의 틀린 경우 셋: 다른 커밋, 받다 끊긴 압축(끝이 잘림), 학교망 차단 안내 쪽(HTML)
  '/record-wrong.bin': gitArchiveTarGz('0'.repeat(40)),
  '/record-cut.bin': gitArchiveTarGz(COMMIT, { files: { 'data.txt': crypto.randomBytes(18_000).toString('base64') }, truncate: 6_000 }),
  '/record-html.bin': '<!doctype html><title>blocked</title><p>This site is blocked.</p>',
};

interface RunResult {
  code: number | null;
  out: string;
}

function runPowerShell(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], {
      cwd: options.cwd ?? rootDir,
      env: { ...process.env, ...options.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (out += chunk.toString('utf8')));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`PowerShell이 60초 안에 끝나지 않았어요:\n${out}`));
    }, 60_000);
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

const runScript = (args: string[], cwd?: string) => runPowerShell(['-File', SCRIPT, ...args], { cwd });

describe.skipIf(!isWindows)('fetch-sources.ps1(Windows PowerShell 5.1, 이 컴퓨터 안 작은 서버로)', () => {
  let server: http.Server;
  let base = '';
  const hits = new Map<string, number>();
  let work = '';
  let outDir = '';
  let manifestPath = '';

  const fileOf = (id: string) => `${id}-1.0.bin`;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      const url = request.url ?? '';
      hits.set(url, (hits.get(url) ?? 0) + 1);
      const body = BODIES[url];
      if (body === undefined) {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': Buffer.byteLength(body) });
      response.end(body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    work = makeTempDir('apc-fetch-sources-');
    outDir = path.join(work, 'out');
    manifestPath = path.join(work, 'manifest.json');
    const item = (id: string, urls: string[], fields: Record<string, unknown>) => ({
      id,
      group: 'test',
      file: fileOf(id),
      urls: urls.map((url) => `${base}${url}`),
      size: null,
      sha256: null,
      md5: null,
      hashSource: 'test',
      what: 'test file',
      whatKo: '시험 파일',
      license: 'MIT',
      ...fields,
    });
    const manifest = {
      schema: 1,
      releaseTag: 'license-sources-test',
      checkedOn: '2026-09-28',
      site: { pyodideVersion: '0', pyodideLockSha256: sha('l'), opencvWheel: 'w.whl', opencvWheelSha256: sha('w'), pagefindVersion: '0' },
      groups: [
        { id: 'test', title: 't', titleKo: 't', license: 'MIT', binary: 'b', binaryKo: 'b', notice: 'n', why: 'w', whyKo: 'w', tools: 't', toolsKo: 't' },
      ],
      items: [
        item('good', ['/good.bin'], { sha256: sha(BODIES['/good.bin']!), size: Buffer.byteLength(BODIES['/good.bin']!) }),
        item('md5only', ['/md5.bin'], { md5: md5(BODIES['/md5.bin']!) }),
        item('record', ['/record.bin'], { hashSource: null, commit: COMMIT }),
        item('bad', ['/bad.bin'], { sha256: sha('the official content') }),
        item('after404', ['/missing', '/mirror.bin'], { sha256: sha(BODIES['/mirror.bin']!) }),
        item('aftermismatch', ['/wrong.bin', '/right.bin'], { sha256: sha(BODIES['/right.bin']!) }),
        item('sha512only', ['/sha512.bin'], { sha512: sha512(BODIES['/sha512.bin']!) }),
        item('recordwrong', ['/record-wrong.bin'], { hashSource: null, commit: COMMIT }),
        item('recordcut', ['/record-cut.bin'], { hashSource: null, commit: COMMIT }),
        item('recordhtml', ['/record-html.bin'], { hashSource: null, commit: COMMIT }),
      ],
    };
    // Node 쪽 목록 규칙으로도 맞는 목록이다(작은 서버 주소는 시험용으로만 허락)
    expect(validateSourcesManifest(manifest, { allowLoopbackHttp: true })).toEqual([]);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (work) {
      removeDir(work);
    }
  });

  it('PowerShell 구문 검사(파서만)에 오류가 없다', async () => {
    const command =
      '$t = $null; $e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($env:APC_PS1, [ref]$t, [ref]$e); ' +
      'if ($e.Count -gt 0) { $e | ForEach-Object { $_.ToString() }; exit 1 }; Write-Host PARSE-OK';
    const result = await runPowerShell(['-Command', command], { env: { APC_PS1: SCRIPT } });
    expect(result.out).toContain('PARSE-OK');
    expect(result.code).toBe(0);
  }, PS_TIMEOUT);

  it('-ListOnly: 목록만 찍고 아무것도 받지 않는다(작은 서버 요청 0번)', async () => {
    const result = await runScript(['-ListOnly', '-Manifest', manifestPath]);
    expect(result.code, result.out).toBe(0);
    expect(result.out).toContain('List only - nothing is downloaded');
    expect(result.out).toContain(`${fileOf('good')}  (official sha256, size ${Buffer.byteLength(BODIES['/good.bin']!)})`);
    expect(result.out).toContain(`${fileOf('record')}  (no official hash - git commit ${COMMIT.slice(0, 12)} is checked, SHA-256 will be recorded)`);
    expect(result.out).toContain(`${fileOf('sha512only')}  (official sha512)`);
    expect([...hits.values()].reduce((sum, count) => sum + count, 0)).toBe(0);
    expect(fs.existsSync(outDir)).toBe(false);
  }, PS_TIMEOUT);

  it('-ListOnly: 저장소의 진짜 목록도 PowerShell이 읽고 검사를 통과한다(받지 않음)', async () => {
    const { manifest } = readSourcesManifest(rootDir);
    const result = await runScript(['-ListOnly']);
    expect(result.code, result.out).toBe(0);
    expect(result.out).toContain(`fetch-sources: ${manifest!.items.length} files`);
    for (const entry of manifest!.items) {
      expect(result.out).toContain(entry.file);
    }
  }, PS_TIMEOUT);

  it('받기: 공식 값과 같으면 PASS, 공식 값이 없으면 커밋을 확인하고 RECORD, 다르면 FAIL(남기지 않음) — 다른 주소로 넘어간다', async () => {
    const result = await runScript(['-Manifest', manifestPath, '-OutDir', outDir, '-Retries', '1']);
    expect(result.code, result.out).toBe(1);
    const block = result.out.slice(result.out.indexOf('===== BEGIN fetch-sources result ====='));
    expect(block).toMatch(new RegExp(`^PASS +${fileOf('good')} ${Buffer.byteLength(BODIES['/good.bin']!)} ${sha(BODIES['/good.bin']!)}$`, 'mu'));
    expect(block).toMatch(new RegExp(`^PASS +${fileOf('md5only')} \\d+ ${sha(BODIES['/md5.bin']!)}$`, 'mu'));
    expect(block).toMatch(new RegExp(`^RECORD +${fileOf('record')} \\d+ ${sha(BODIES['/record.bin']!)}$`, 'mu'));
    expect(block).toMatch(new RegExp(`^FAIL +${fileOf('bad')} - - \\| .*sha256 is ${sha(BODIES['/bad.bin']!)}, the list says ${sha('the official content')}`, 'mu'));
    expect(block).toMatch(new RegExp(`^PASS +${fileOf('after404')} `, 'mu'));
    expect(block).toMatch(new RegExp(`^PASS +${fileOf('aftermismatch')} `, 'mu'));
    expect(block).toMatch(new RegExp(`^PASS +${fileOf('sha512only')} `, 'mu'));
    // 공식 해시가 없는 압축: 다른 커밋·끊긴 받기·차단 안내 쪽은 FAIL(받을 때 잰 값으로 고정하지 않는다)
    expect(block).toMatch(new RegExp(`^FAIL +${fileOf('recordwrong')} - - \\| .*git commit in the archive is ${'0'.repeat(40)}, the list says ${COMMIT}`, 'mu'));
    expect(block).toMatch(new RegExp(`^FAIL +${fileOf('recordcut')} - - \\| .*cut download`, 'mu'));
    expect(block).toMatch(new RegExp(`^FAIL +${fileOf('recordhtml')} - - \\| .*not a gzip archive`, 'mu'));
    expect(result.out).toContain(`no official hash, git commit ${COMMIT.slice(0, 12)} checked, recorded`);
    expect(block).toContain('SUMMARY pass=5 record=1 fail=4 missing=0 total=10');

    // 파일: 통과한 것만 남고, 쓰다 만 .part가 없다
    const files = fs.readdirSync(outDir).sort();
    expect(files).toEqual(
      [...['good', 'md5only', 'record', 'after404', 'aftermismatch', 'sha512only'].map(fileOf), SOURCES_SUMS_FILE, 'fetch-result.json', 'fetch-result.txt'].sort(),
    );
    // SHA256SUMS.txt = Node가 잰 값(목록 차례, BOM 없음)
    const sumsText = fs.readFileSync(path.join(outDir, SOURCES_SUMS_FILE), 'utf8');
    expect(sumsText.charCodeAt(0)).not.toBe(0xfeff);
    const sums = parseSha256Sums(sumsText);
    expect(sums.problems).toEqual([]);
    expect([...sums.entries.keys()]).toEqual(['good', 'md5only', 'record', 'after404', 'aftermismatch', 'sha512only'].map(fileOf));
    for (const [file, value] of sums.entries) {
      expect(value, file).toBe(sha(fs.readFileSync(path.join(outDir, file))));
    }
    // fetch-result.json은 BOM 없는 JSON(Node가 바로 읽음)
    const report = JSON.parse(fs.readFileSync(path.join(outDir, 'fetch-result.json'), 'utf8'));
    expect(report.counts).toEqual({ pass: 5, record: 1, fail: 4, missing: 0, total: 10 });
    expect(report.releaseTag).toBe('license-sources-test');
    const byId = new Map(report.files.map((entry: { id: string }) => [entry.id, entry]));
    expect(byId.get('md5only')).toMatchObject({ status: 'PASS', basis: 'md5', md5: md5(BODIES['/md5.bin']!) });
    expect(byId.get('sha512only')).toMatchObject({ status: 'PASS', basis: 'sha512', sha512: sha512(BODIES['/sha512.bin']!) });
    expect(byId.get('record')).toMatchObject({ status: 'RECORD', basis: 'recorded', from: 'download', commit: COMMIT, expectedCommit: COMMIT });
    expect(byId.get('bad')).toMatchObject({ status: 'FAIL', bytes: null, sha256: null });
    expect(byId.get('recordwrong')).toMatchObject({ status: 'FAIL', bytes: null, sha256: null, commit: null });
    expect(byId.get('after404')).toMatchObject({ status: 'PASS', url: `${base}/mirror.bin` });
    expect(fs.readFileSync(path.join(outDir, 'fetch-result.txt'), 'utf8')).toContain('===== END fetch-sources result =====');
    // 404는 다시 시도하지 않고 다음 주소로, 값이 다른 주소도 다음 주소로
    expect(hits.get('/missing')).toBe(1);
    expect(hits.get('/wrong.bin')).toBe(1);
    expect(hits.get('/right.bin')).toBe(1);
  }, PS_TIMEOUT);

  it('다시 돌리면 이미 확인된 파일은 받지 않고, 틀린 것만 다시 받는다', async () => {
    const before = new Map(hits);
    const result = await runScript(['-Manifest', manifestPath, '-OutDir', outDir, '-Retries', '1']);
    expect(result.code, result.out).toBe(1);
    for (const url of ['/good.bin', '/md5.bin', '/record.bin', '/mirror.bin', '/right.bin', '/sha512.bin']) {
      expect(hits.get(url), url).toBe(before.get(url));
    }
    expect(hits.get('/bad.bin')).toBe((before.get('/bad.bin') ?? 0) + 1);
    expect(hits.get('/record-wrong.bin')).toBe((before.get('/record-wrong.bin') ?? 0) + 1);
    // 폴더에 있던 커밋 확인 압축도 다시 확인해 PASS가 아니라 RECORD로 둔다(받지 않고)
    expect(result.out).toMatch(/RECORD +\d+ bytes, sha256 [0-9a-f]{64} \(no official hash, git commit [0-9a-f]{12} checked, recorded, folder,/u);
    expect(result.out).toMatch(/PASS +\d+ bytes, sha256 [0-9a-f]{64} \(official sha256, folder,/u);
  }, PS_TIMEOUT);

  it('-VerifyOnly: 받지 않고 폴더만 확인하고, 없는 파일은 MISSING', async () => {
    fs.rmSync(path.join(outDir, fileOf('record')));
    const before = new Map(hits);
    const result = await runScript(['-VerifyOnly', '-Manifest', manifestPath, '-OutDir', outDir]);
    expect(result.code, result.out).toBe(1);
    expect(result.out).toMatch(new RegExp(`^MISSING +${fileOf('record')} - -`, 'mu'));
    expect(result.out).toMatch(new RegExp(`^MISSING +${fileOf('bad')} - -`, 'mu'));
    expect(result.out).toContain('SUMMARY pass=5 record=0 fail=0 missing=5 total=10');
    expect(hits).toEqual(before);
    const sums = parseSha256Sums(fs.readFileSync(path.join(outDir, SOURCES_SUMS_FILE), 'utf8'));
    expect([...sums.entries.keys()]).toEqual(['good', 'md5only', 'after404', 'aftermismatch', 'sha512only'].map(fileOf));
  }, PS_TIMEOUT);

  it('-Force: 이미 있는 파일도 다시 받는다', async () => {
    const before = hits.get('/good.bin') ?? 0;
    const result = await runScript(['-Force', '-Manifest', manifestPath, '-OutDir', outDir, '-Retries', '1']);
    expect(result.code, result.out).toBe(1);
    expect(hits.get('/good.bin')).toBe(before + 1);
    expect(result.out).toContain('SUMMARY pass=5 record=1 fail=4 missing=0 total=10');
  }, PS_TIMEOUT);

  it('파일 하나에 예상 못 한 문제가 생겨도 그 파일만 FAIL이고 나머지와 결과 파일은 그대로 나온다', async () => {
    // 목록의 파일 이름과 같은 폴더가 있으면(옮기면 그 폴더 안으로 들어가 버린다) 그 파일만 멈춘다
    fs.rmSync(path.join(outDir, fileOf('good')));
    fs.mkdirSync(path.join(outDir, fileOf('good')));
    try {
      const result = await runScript(['-Manifest', manifestPath, '-OutDir', outDir, '-Retries', '1']);
      expect(result.code, result.out).toBe(1);
      expect(result.out).toMatch(new RegExp(`^FAIL +${fileOf('good')} - - \\| unexpected error: a folder named ${fileOf('good')} is in the way`, 'mu'));
      expect(result.out).toMatch(new RegExp(`^PASS +${fileOf('md5only')} `, 'mu'));
      expect(result.out).toContain('SUMMARY pass=4 record=1 fail=5 missing=0 total=10');
      const report = JSON.parse(fs.readFileSync(path.join(outDir, 'fetch-result.json'), 'utf8'));
      expect(report.counts).toEqual({ pass: 4, record: 1, fail: 5, missing: 0, total: 10 });
      expect(fs.readdirSync(outDir).filter((name) => name.endsWith('.part'))).toEqual([]);
    } finally {
      fs.rmSync(path.join(outDir, fileOf('good')), { recursive: true, force: true });
    }
  }, PS_TIMEOUT);

  it('저장소 뿌리가 아닌 폴더에서 돌리면 멈춘다(종료 코드 2, 받지 않음)', async () => {
    const before = new Map(hits);
    const result = await runScript(['-Manifest', manifestPath, '-OutDir', outDir], work);
    expect(result.code).toBe(2);
    expect(result.out).toContain('STOP  Run this script from the project root folder');
    expect(hits).toEqual(before);
  }, PS_TIMEOUT);

  it('목록이 틀리면(https가 아닌 주소·대문자 해시·공식 해시도 커밋도 없는 항목) 멈춘다(종료 코드 2)', async () => {
    const broken = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    broken.items[0].urls = ['http://example.org/good.bin'];
    broken.items[1].md5 = broken.items[1].md5.toUpperCase();
    delete broken.items[2].commit;
    const brokenPath = path.join(work, 'broken.json');
    fs.writeFileSync(brokenPath, JSON.stringify(broken), 'utf8');
    const result = await runScript(['-ListOnly', '-Manifest', brokenPath]);
    expect(result.code).toBe(2);
    expect(result.out).toContain('STOP  The list has problems');
    expect(result.out).toContain('not an https address: http://example.org/good.bin');
    expect(result.out).toContain('md5 must be 32 lowercase hex digits');
    expect(result.out).toContain('a file without an official hash needs commit');
  }, PS_TIMEOUT);
});
