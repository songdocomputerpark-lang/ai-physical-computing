// 오프라인판 작은 웹 서버를 실제로 띄워 보는 검사 — scripts/offline/serve.ps1(Windows PowerShell 5.1)·serve.py(파이썬 3), P6-07.
// 임시 폴더에 작은 사이트를 만들고 서버를 띄워 요청을 보낸다: 파일 종류(MIME), 폴더 주소의 / 붙이기(301), 사이트의 404 쪽,
// 숨은 파일·폴더 밖 주소 거절, HEAD, GET·HEAD 말고는 거절, Host 머리말 거르기(DNS 리바인딩), 포트가 쓰이는 중이면 다음 번호.
// serve.ps1 검사는 Windows에서만(CI Linux는 건너뜀 — PowerShell 5.1과 http.sys가 없다), serve.py 검사는 파이썬 3이 있을 때만 돈다.
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OFFLINE_LAYOUT, renderTemplate, startBatTemplateValues, toCrlf } from '../../../scripts/lib/offline-site.mjs';
import { makeTempDir, removeDir, writeFiles } from '../helpers/fixture.ts';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
const SERVE_PS1 = path.join(rootDir, 'scripts', 'offline', 'serve.ps1');
const SERVE_PY = path.join(rootDir, 'scripts', 'offline', 'serve.py');
const isWindows = process.platform === 'win32';

function findPython(): string | null {
  for (const candidate of isWindows ? ['python', 'py'] : ['python3', 'python']) {
    const result = spawnSync(candidate, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8', windowsHide: true });
    if (result.status === 0 && result.stdout.trim() === '3') {
      return candidate;
    }
  }
  return null;
}
const python = findPython();

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

/** node:http로 보낸다(Host 머리말을 바꿀 수 있게 — fetch는 Host를 못 바꾼다) */
function request(port: number, pathname: string, options: { method?: string; host?: string; body?: string } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method: options.method ?? 'GET',
        headers: { Host: options.host ?? `localhost:${port}`, ...(options.body !== undefined ? { 'Content-Length': Buffer.byteLength(options.body) } : {}) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) {
      req.write(options.body);
    }
    req.end();
  });
}

/** 비어 있는 포트 하나 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

interface Running {
  child: ChildProcess;
  port: number;
  output: () => string;
}

/** 서버를 띄우고 "서버가 켜졌어요: http://localhost:<포트>/" 줄에서 실제 포트를 읽는다 */
function startServer(command: string, args: string[]): Promise<Running> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`서버가 20초 안에 켜지지 않았어요:\n${output}`));
    }, 20_000);
    const onData = (chunk: Buffer) => {
      output += chunk.toString('utf8');
      const match = /서버가 켜졌어요:\s+http:\/\/localhost:(\d+)\//u.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve({ child, port: Number(match[1]), output: () => output });
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`서버가 끝났어요(종료 코드 ${code}):\n${output}`));
    });
  });
}

function stop(running: Running | null): void {
  if (!running || running.child.exitCode !== null) {
    return;
  }
  if (isWindows && running.child.pid) {
    spawnSync('taskkill', ['/PID', String(running.child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    running.child.kill('SIGINT');
  }
}

/**
 * 깊은 폴더에 풀린 오프라인판을 흉내 낸 파일: 임시 폴더 경로(약 60글자)를 더하면 전체 경로가 260글자를 넘는다.
 * Windows는 긴 경로 설정이 꺼져 있으면 이런 파일을 "없다"고 봐서, 서버가 opencv 휠을 404로 줘 첫 실습이 멈췄다(2026-09-26 Phase 6 검토 지적).
 */
const LONG_WHEEL = `deep/${'d'.repeat(100)}/${'e'.repeat(60)}/opencv_python-4.11.0.86-cp314-cp314-pyemscripten_2026_0_wasm32.whl`;

const SITE = {
  'index.html': '<!doctype html><title>홈</title>',
  '404.html': '<!doctype html><title>없어요</title>',
  'learn/index.html': '<!doctype html><title>배우기</title>',
  'vendor/pyodide/pyodide.asm.wasm': Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
  'vendor/pyodide/pyodide.mjs': 'export const x = 1;',
  'licenses/a.txt': '\ufeff고지',
  'models/.gitkeep': '',
  'noindex/readme.md': '# 목록 없음',
  [LONG_WHEEL]: Buffer.from('PK-long-path-wheel'),
};

/** 두 서버에 같은 검사를 한다 */
function sharedChecks(label: string, getRunning: () => Running, getSiteDir: () => string) {
  it(`${label}: 파일 종류(MIME)와 폴더 주소`, async () => {
    const { port } = getRunning();
    const home = await request(port, '/');
    expect(home.status).toBe(200);
    expect(home.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(home.body.toString('utf8')).toContain('<title>홈</title>');
    expect(home.headers['x-content-type-options']).toBe('nosniff');

    const wasm = await request(port, '/vendor/pyodide/pyodide.asm.wasm');
    expect(wasm.status).toBe(200);
    expect(wasm.headers['content-type']).toBe('application/wasm');
    expect(wasm.body.length).toBe(8);
    expect((await request(port, '/vendor/pyodide/pyodide.mjs')).headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect((await request(port, '/licenses/a.txt')).headers['content-type']).toBe('text/plain; charset=utf-8');
    expect((await request(port, '/%ED%95%9C%EA%B8%80.txt')).status).toBe(404);

    const redirect = await request(port, '/learn');
    expect(redirect.status).toBe(301);
    expect(redirect.headers.location).toMatch(/\/learn\/$/u);
    const learn = await request(port, '/learn/?q=1');
    expect(learn.status).toBe(200);
    expect(learn.body.toString('utf8')).toContain('배우기');
  });

  it(`${label}: 없는 주소는 사이트의 404 쪽, 폴더 목록·숨은 파일·폴더 밖은 주지 않는다`, async () => {
    const { port } = getRunning();
    const missing = await request(port, '/nope/');
    expect(missing.status).toBe(404);
    expect(missing.body.toString('utf8')).toContain('없어요');
    expect((await request(port, '/noindex/')).status).toBe(404);
    expect((await request(port, '/models/.gitkeep')).status).toBe(404);
    for (const attack of ['/../../Windows/win.ini', '/..%2f..%2fWindows%2fwin.ini', '/%2e%2e/%2e%2e/etc/passwd', '/a%5c..%5c..%5cx', '/C:/Windows/win.ini']) {
      const reply = await request(port, attack);
      expect(reply.status, attack).toBeGreaterThanOrEqual(400);
      expect(reply.body.toString('utf8'), attack).not.toMatch(/\[fonts\]|root:/u);
    }
  });

  it(`${label}: 전체 경로가 260글자를 넘는 파일(깊은 폴더에 푼 오프라인판의 휠)도 준다`, async () => {
    const { port } = getRunning();
    const siteDir = getSiteDir();
    const fullLength = path.join(siteDir, ...LONG_WHEEL.split('/')).length;
    expect(fullLength, '시험 파일의 전체 경로 길이').toBeGreaterThan(260);
    const wheel = await request(port, `/${LONG_WHEEL}`);
    expect(wheel.status, `${fullLength}글자 경로`).toBe(200);
    expect(wheel.headers['content-type']).toBe('application/zip');
    expect(wheel.body.toString('utf8')).toBe('PK-long-path-wheel');
    const head = await request(port, `/${LONG_WHEEL}`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers['content-length']).toBe(String('PK-long-path-wheel'.length));
  });

  it(`${label}: HEAD는 머리말만, GET·HEAD 말고는 거절, Host가 localhost·127.0.0.1이 아니면 거절`, async () => {
    const { port } = getRunning();
    const head = await request(port, '/vendor/pyodide/pyodide.asm.wasm', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers['content-length']).toBe('8');
    expect(head.body.length).toBe(0);
    const post = await request(port, '/', { method: 'POST', body: '' });
    expect(post.status).toBe(405);
    expect((await request(port, '/', { host: `127.0.0.1:${port}` })).status).toBe(200);
    const evil = await request(port, '/', { host: `evil.example:${port}` });
    expect(evil.status).toBe(421);
    expect(evil.body.toString('utf8')).not.toContain('<title>홈</title>');
  });
}

describe.skipIf(!isWindows)('serve.ps1(Windows PowerShell 5.1)', () => {
  let siteDir = '';
  let running: Running | null = null;

  beforeAll(async () => {
    siteDir = makeTempDir('apc-offline-serve-ps1-');
    writeFiles(siteDir, SITE);
    const port = await freePort();
    running = await startServer('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SERVE_PS1, '-Port', String(port), '-Root', siteDir, '-NoBrowser', '-NoPause']);
  }, 30_000);

  afterAll(() => {
    stop(running);
    removeDir(siteDir);
  });

  sharedChecks('serve.ps1', () => running!, () => siteDir);

  it('serve.ps1: 포트가 쓰이는 중이면 다음 번호로 연다(관리자 권한 없이)', async () => {
    const port = await freePort();
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', resolve));
    let second: Running | null = null;
    try {
      second = await startServer('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SERVE_PS1, '-Port', String(port), '-Root', siteDir, '-NoBrowser', '-NoPause']);
      expect(second.port).toBeGreaterThan(port);
      expect((await request(second.port, '/')).status).toBe(200);
    } finally {
      stop(second);
      blocker.close();
    }
  }, 40_000);

  it('serve.ps1: 같은 판 서버가 이미 켜져 있으면(시작하기.bat를 두 번 누름) 새로 열지 않고 그 주소를 알린다', () => {
    const port = running!.port;
    const result = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SERVE_PS1, '-Port', String(port), '-Root', siteDir, '-NoBrowser', '-NoPause'],
      { encoding: 'utf8', windowsHide: true, timeout: 20_000 },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`이미 켜져 있는 서버가 있어요: http://localhost:${port}/`);
    expect(result.stdout).not.toContain('서버가 켜졌어요');
  }, 30_000);

  it('serve.ps1: 다른 판의 서버가 켜져 있는 포트는 넘기고 다음 번호로 연다', async () => {
    const copyDir = makeTempDir('apc-offline-serve-ps1-other-');
    const other = path.join(copyDir, 'serve.ps1');
    fs.writeFileSync(other, fs.readFileSync(SERVE_PS1).toString('utf8').replace('{{APC_VERSION}}', '9.9.9'), 'utf8');
    // BOM이 남아 있어야 PowerShell 5.1이 한국어를 바르게 읽는다(읽은 글의 첫 글자가 BOM이라 그대로 다시 쓰인다)
    expect(fs.readFileSync(other).subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true);
    const port = await freePort();
    let older: Running | null = null;
    let newer: Running | null = null;
    try {
      older = await startServer('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', other, '-Port', String(port), '-Root', siteDir, '-NoBrowser', '-NoPause']);
      expect(older.port).toBe(port);
      expect((await request(port, '/')).headers['x-apc-offline']).toBe('9.9.9');
      newer = await startServer('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SERVE_PS1, '-Port', String(port), '-Root', siteDir, '-NoBrowser', '-NoPause']);
      expect(newer.port).toBeGreaterThan(port);
      expect(newer.output()).toContain('다른 판(9.9.9)');
      expect((await request(newer.port, '/')).headers['x-apc-offline']).toBe('dev');
    } finally {
      stop(newer);
      stop(older);
      removeDir(copyDir);
    }
  }, 60_000);

  it('시작하기.bat(빌드가 만든 모양): 풀지 않고 실행하면 한국어로 알리고(종료 코드 1), 풀린 폴더에서는 서버를 연다', async () => {
    const zipDir = makeTempDir('apc-offline-bat-');
    try {
      const batText = toCrlf(renderTemplate(fs.readFileSync(path.join(rootDir, 'scripts', 'offline', 'start.bat'), 'utf8'), startBatTemplateValues()));
      // ① 압축 파일 안에서 바로 실행한 경우(곁에 server 폴더가 없음)
      const lone = path.join(zipDir, 'lone', OFFLINE_LAYOUT.startBat);
      fs.mkdirSync(path.dirname(lone), { recursive: true });
      fs.writeFileSync(lone, batText, 'utf8');
      // Node의 detached는 콘솔 없이(DETACHED_PROCESS) 띄워 PowerShell Write-Host가 아무것도 찍지 못하므로 쓰지 않는다.
      // 새 콘솔(코드 페이지 949)에서 두 번 누른 것과 같은 확인은 손으로 했다(보고서). bat가 ASCII뿐이라 cmd가 읽는 방식은 코드 페이지와 상관없고,
      // 한국어는 PowerShell이 [Console]::OutputEncoding을 UTF-8로 두고 찍는다(949 콘솔에서도 UTF-8로 나옴 — 2026-09-26 확인).
      const loneRun = await new Promise<{ status: number | null; output: string }>((resolve) => {
        const child = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `""${lone}" < NUL"`], {
          windowsVerbatimArguments: true,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
        child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
        child.once('close', (status) => resolve({ status, output }));
      });
      expect(loneRun.status).toBe(1);
      expect(loneRun.output).toContain('압축 파일 안에서 바로 실행한 것 같아요');
      expect(loneRun.output).not.toContain('is not recognized');

      // ② 풀린 폴더(server\serve.ps1 + site\)
      const top = path.join(zipDir, 'unzipped');
      writeFiles(path.join(top, OFFLINE_LAYOUT.siteDir), SITE);
      fs.mkdirSync(path.join(top, OFFLINE_LAYOUT.serverDir), { recursive: true });
      fs.copyFileSync(SERVE_PS1, path.join(top, OFFLINE_LAYOUT.serverDir, 'serve.ps1'));
      const bat = path.join(top, OFFLINE_LAYOUT.startBat);
      fs.writeFileSync(bat, batText, 'utf8');
      const port = await freePort();
      const child = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `""${bat}" -Port ${port} -NoBrowser"`], {
        windowsVerbatimArguments: true,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, APC_OFFLINE_TEST: '1' },
      });
      const running = await new Promise<Running>((resolve, reject) => {
        let output = '';
        const timer = setTimeout(() => reject(new Error(`시작하기.bat가 서버를 열지 못했어요:\n${output}`)), 25_000);
        const onData = (chunk: Buffer) => {
          output += chunk.toString('utf8');
          const match = /서버가 켜졌어요:\s+http:\/\/localhost:(\d+)\//u.exec(output);
          if (match) {
            clearTimeout(timer);
            resolve({ child, port: Number(match[1]), output: () => output });
          }
        };
        child.stdout?.on('data', onData);
        child.stderr?.on('data', onData);
      });
      try {
        expect(running.port).toBe(port);
        expect((await request(port, '/')).status).toBe(200);
        expect(running.output()).not.toContain('is not recognized');
      } finally {
        stop(running);
      }
    } finally {
      removeDir(zipDir);
    }
  }, 60_000);

  it('serve.ps1: 사이트 폴더가 없으면 한국어로 알리고 끝낸다(종료 코드 1)', () => {
    const result = spawnSync(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SERVE_PS1, '-Root', path.join(siteDir, '없는폴더'), '-NoBrowser', '-NoPause'],
      { encoding: 'utf8', windowsHide: true, timeout: 20_000 },
    );
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain('사이트 파일을 찾지 못했어요');
  }, 30_000);
});

describe.skipIf(python === null)('serve.py(파이썬 3)', () => {
  let siteDir = '';
  let running: Running | null = null;

  beforeAll(async () => {
    siteDir = makeTempDir('apc-offline-serve-py-');
    writeFiles(siteDir, SITE);
    const port = await freePort();
    running = await startServer(python!, ['-X', 'utf8', SERVE_PY, '--port', String(port), '--root', siteDir, '--no-browser']);
  }, 30_000);

  afterAll(() => {
    stop(running);
    removeDir(siteDir);
  });

  sharedChecks('serve.py', () => running!, () => siteDir);
});
