// 오프라인 배포판 확인(PLAN §8.6 P6-07 완료 기준 "인터넷 없이 첫 실습·가상 보드·같은 컴퓨터 탭 통신이 된다").
//
// 교사가 하는 것과 같은 차례로 확인한다:
//   1. npm run build:offline이 만든 zip(.cache/offline/apc-offline-<판>.zip)을 새 폴더(.cache/offline/unzipped/)에 푼다
//      (Windows에서는 Windows에 들어 있는 tar.exe로 — 한국어 이름 "시작하기.bat"·"읽어보세요.txt"가 그대로 풀리는지도 본다).
//   2. 풀린 폴더의 시작하기.bat를 실행해 작은 웹 서버(server/serve.ps1)를 띄운다(-NoBrowser — 브라우저는 Playwright가 연다).
//      Windows가 아니면 server/serve.py(파이썬판)를 띄운다.
//   3. 인터넷을 막은 브라우저(Edge — 주소 풀이를 localhost 말고 모두 실패시키고, 사이트 밖 요청을 모두 끊어 기록)로
//      tests/e2e/offline.spec.ts를 돌린다(환경 변수 APC_E2E_GROUP=offline, APC_BASE=/, PW_BASE_URL=http://localhost:<포트>/).
//   4. 서버를 끈다.
//
// 쓰는 법
//   node scripts/offline/verify-offline.mjs                    기본 zip·포트 4905(Phase 6 구역 E 포트)
//   node scripts/offline/verify-offline.mjs --zip <zip> --port 4905 -- --grep 시나리오   (-- 뒤는 Playwright 인자)
//   node scripts/offline/verify-offline.mjs --server py        파이썬판 서버(server/serve.py)로(Windows에서도 — 읽어보세요.txt 4절)
// CI(Linux)에서는 돌리지 않는다: zip을 만드는 데 1분쯤 걸리고, 이 확인의 요점이 Windows PowerShell 서버라서(tests/e2e/offline.spec.ts 머리말).
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFLINE_LAYOUT, offlinePackageName } from '../lib/offline-site.mjs';
import { openZip } from '../lib/zip-read.mjs';
import { siteConfig } from '../../src/config/site.ts';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const PLAYWRIGHT_CLI = path.join(rootDir, 'node_modules', '@playwright', 'test', 'cli.js');

const rawArgs = process.argv.slice(2);
const dashDash = rawArgs.indexOf('--');
const ownArgs = dashDash >= 0 ? rawArgs.slice(0, dashDash) : rawArgs;
const playwrightArgs = dashDash >= 0 ? rawArgs.slice(dashDash + 1) : [];
const option = (name) => {
  const index = ownArgs.indexOf(name);
  return index >= 0 ? ownArgs[index + 1] : undefined;
};

const packageName = offlinePackageName(siteConfig.version);
const zipPath = path.resolve(rootDir, option('--zip') ?? path.join('.cache', 'offline', `${packageName}.zip`));
const port = Number(option('--port') ?? 4905);
/** 띄울 서버: ps1(시작하기.bat → serve.ps1, Windows 기본) 또는 py(server/serve.py — 읽어보세요.txt 4절의 다른 방법) */
const serverKind = option('--server') ?? (process.platform === 'win32' ? 'ps1' : 'py');
if (serverKind !== 'ps1' && serverKind !== 'py') {
  console.error('[오프라인판 확인] --server는 ps1 또는 py예요.');
  process.exit(1);
}
const extractRoot = path.join(rootDir, '.cache', 'offline', 'unzipped');

function log(message) {
  console.log(`[오프라인판 확인] ${message}`);
}

function fail(message) {
  console.error(`[오프라인판 확인] 실패 — ${message}`);
  process.exit(1);
}

/** zip을 푼다: Windows는 tar.exe(Windows 10 1803부터 들어 있음), 그 밖은 저장소의 zip 읽기 도구 */
function extract() {
  fs.rmSync(extractRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  fs.mkdirSync(extractRoot, { recursive: true });
  if (process.platform === 'win32') {
    const tar = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
    const result = spawnSync(tar, ['-xf', zipPath, '-C', extractRoot], { stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) {
      fail(`tar.exe로 zip을 풀지 못했어요(종료 코드 ${result.status}).`);
    }
    return 'Windows tar.exe';
  }
  const zip = openZip(zipPath);
  for (const entry of zip.entries) {
    const target = path.join(extractRoot, ...entry.name.split('/'));
    if (entry.isDirectory) {
      fs.mkdirSync(target, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, zip.read(entry));
  }
  fs.chmodSync(path.join(extractRoot, packageName, OFFLINE_LAYOUT.serverDir, 'serve.py'), 0o755);
  return '저장소 zip 읽기 도구';
}

async function waitForServer(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < until) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`${url}이(가) ${Math.round(timeoutMs / 1000)}초 안에 열리지 않았어요(${lastError}).`);
}

/** 파이썬 3 실행 파일 이름(Windows: py 또는 python, 그 밖: python3) */
function pythonCommand() {
  for (const candidate of process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python']) {
    const result = spawnSync(candidate, ['-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8', windowsHide: true });
    if (result.status === 0 && result.stdout.trim() === '3') {
      return candidate;
    }
  }
  fail('파이썬 3을 찾지 못했어요(--server py).');
  return '';
}

function startServer(topDir) {
  if (serverKind === 'ps1') {
    const bat = path.join(topDir, OFFLINE_LAYOUT.startBat);
    // cmd /s /c ""경로" 인자" — 경로에 빈칸·한국어가 있어도 교사가 두 번 누른 것과 같게 돈다.
    return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `""${bat}" -Port ${port} -NoBrowser"`], {
      cwd: topDir,
      windowsVerbatimArguments: true,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, APC_OFFLINE_TEST: '1' },
    });
  }
  // 파이썬판: 읽어보세요.txt 4절 "다른 방법으로 시작하기"와 같은 명령(-X utf8은 한국어 안내를 파이프로 받으려고)
  return spawn(pythonCommand(), ['-X', 'utf8', path.join(topDir, OFFLINE_LAYOUT.serverDir, 'serve.py'), '--port', String(port), '--no-browser'], {
    cwd: topDir,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function stopServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    child.kill('SIGINT');
  }
}

async function main() {
  if (!fs.existsSync(zipPath)) {
    fail(`zip이 없어요: ${path.relative(rootDir, zipPath)} — 먼저 npm run build:offline을 돌려요.`);
  }
  const started = Date.now();
  const how = extract();
  const topDir = path.join(extractRoot, packageName);
  for (const name of [OFFLINE_LAYOUT.startBat, OFFLINE_LAYOUT.readme, `${OFFLINE_LAYOUT.serverDir}/serve.ps1`, `${OFFLINE_LAYOUT.siteDir}/index.html`]) {
    if (!fs.existsSync(path.join(topDir, ...name.split('/')))) {
      fail(`푼 폴더에 ${name}이(가) 없어요(푼 도구: ${how}).`);
    }
  }
  log(`zip을 풀었어요(${how}, ${((Date.now() - started) / 1000).toFixed(1)}초): ${path.relative(rootDir, topDir).split(path.sep).join('/')}/`);

  const serverStarted = Date.now();
  const server = startServer(topDir);
  let serverOutput = '';
  server.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString('utf8');
  });
  server.stderr.on('data', (chunk) => {
    serverOutput += chunk.toString('utf8');
  });
  const base = `http://localhost:${port}/`;
  let exitCode = 1;
  /** @type {unknown} */
  let failure = null;
  try {
    await waitForServer(base, 30_000);
    log(`작은 웹 서버(${serverKind === 'ps1' ? '시작하기.bat → serve.ps1' : 'server/serve.py'})가 ${((Date.now() - serverStarted) / 1000).toFixed(1)}초 만에 열렸어요: ${base}`);
    const firstLine = serverOutput.split(/\r?\n/u).find((line) => line.includes('서버가 켜졌어요'));
    if (firstLine) {
      log(`서버 창: ${firstLine.trim()}`);
    }
    const result = spawnSync(
      process.execPath,
      [PLAYWRIGHT_CLI, 'test', 'tests/e2e/offline.spec.ts', '--project=desktop', '--workers=1', ...playwrightArgs],
      {
        cwd: rootDir,
        stdio: 'inherit',
        windowsHide: true,
        env: {
          ...process.env,
          APC_E2E_GROUP: 'offline',
          APC_BASE: '/',
          PW_BASE_URL: base,
          APC_OFFLINE_DIR: topDir,
          APC_OFFLINE_SERVER: serverKind,
        },
      },
    );
    exitCode = result.status ?? 1;
  } catch (error) {
    failure = error;
  } finally {
    stopServer(server);
  }
  if (failure) {
    console.error(serverOutput);
    fail(failure instanceof Error ? failure.message : String(failure));
  }
  log(`${exitCode === 0 ? '통과' : '실패'} — 모두 ${((Date.now() - started) / 1000).toFixed(1)}초`);
  process.exit(exitCode);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
