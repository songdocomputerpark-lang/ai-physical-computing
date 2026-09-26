// 오프라인 배포판 만들기(npm run build:offline) — PLAN §5.6, §8.6 P6-07.
//
// 인터넷이 막히거나 느린 교실에서 쓰는 zip을 만든다. 풀어서 시작하기.bat를 두 번 누르면 이 컴퓨터 안에서만 열리는 작은 웹 서버
// (Windows에 처음부터 있는 PowerShell 5.1 — scripts/offline/serve.ps1)가 사이트를 http://localhost:8080/ 으로 열고, 인터넷 없이
// 첫 실습(영상처리)·가상 보드·같은 컴퓨터 탭 통신이 된다(tests/e2e/offline.spec.ts가 인터넷을 막은 브라우저로 확인).
//
// 하는 일(차례대로 — 하나라도 실패하면 zip을 만들지 않고 종료 코드 1)
//   1. 패키지 확인: 사이트가 주는 파이썬 코드의 import → pyodide-lock.json 패키지(scripts/lib/offline-packages.mjs)가
//      오프라인 표(src/lab/loader/pyodide-files.ts의 PYODIDE_OFFLINE_FILES)에 모두 있는지.
//   2. 사이트 빌드: `npm run build -- --config scripts/offline/astro.config.offline.mjs`를 환경 변수 APC_BASE=/(사이트 뿌리)·
//      APC_OUT_DIR=.cache/offline/site로 부른다. 보통 빌드 앞뒤 단계(출처 검사·번들 검사·검색 색인·서비스 워커)가 그대로 돌고,
//      설정 파일은 보통 설정에 __APC_OFFLINE__ 한 줄만 더해 실습실이 파이썬 엔진을 같은 사이트에서만 받게 한다(src/lab/runtime/config.ts).
//   3. 서비스 워커를 오프라인 설정으로 다시 만든다(scripts/build-sw.mjs --offline).
//   4. Pyodide 파일: 오프라인 표 전체(예비본 7개 + 오프라인판에서만 더 넣는 휠)를 빌드 결과에 채운다 — 이미 있으면 SHA-256 확인,
//      없으면 로컬 사본(node_modules/pyodide, .cache/pyodide-packages …) → jsDelivr 고정 주소(크기·SHA-256 대조, fetch-pyodide-fallback.mjs).
//   5. 링크 검사(scripts/check-links.mjs — 같은 환경 변수로 사이트 뿌리 기준).
//   6. 빌드 결과 확인(scripts/lib/offline-site.mjs checkOfflineSite): public/ 전체·Pyodide 표·고지 파일 모음(/credits/)·서비스 워커 설정·
//      작은 웹 서버의 MIME 표에 없는 확장자.
//   7. 안내 파일 만들기(.cache/offline/extras/): 시작하기.bat·읽어보세요.txt(CRLF, 판·날짜·코드 채움)·server/serve.ps1·serve.py·LICENSE 둘.
//   8. 개인정보 검사(scripts/lib/repo-check.mjs runBuildOutputCheck — 구역 C 요청 C-17): 이 컴퓨터의 절대 경로·개인정보 모양·그림
//      메타데이터가 빌드 결과와 안내 파일에 없는지. 오프라인판은 운영자 PC에서 만들어 그대로 나눠 주므로 CI처럼 막을 곳이 없다.
//   9. zip 쓰기(.cache/offline/<이름>.zip — 저장소에 넣지 않음, .gitignore의 .cache/).
//  10. zip을 다시 읽어 항목마다 크기·CRC-32 대조, 요약(.cache/offline/<이름>.json — 크기·파일 수·단계별 시간·SHA-256).
//
// 쓰는 법
//   npm run build:offline                 모두
//   node scripts/build-offline.mjs --skip-build   2~4를 건너뛰고 이미 있는 .cache/offline/site로 묶기만(안내 파일을 고칠 때)
//   node scripts/build-offline.mjs --no-zip       zip을 만들지 않는다(빌드와 확인만)
// 확인: node scripts/offline/verify-offline.mjs(zip을 풀어 시작하기.bat로 서버를 띄우고, 인터넷을 막은 Edge로 tests/e2e/offline.spec.ts)
//
// 한 작업 폴더에서 빌드는 한 번에 하나만 돌린다(콘텐츠 캐시·public/vendor를 함께 쓴다 — src/lab/README.md 5.5).
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePyodideFiles } from './fetch-pyodide-fallback.mjs';
import { describeMissingPackages, collectRepoImports, offlinePackageCoverage } from './lib/offline-packages.mjs';
import {
  OFFLINE_LAYOUT,
  OFFLINE_MAX_ENTRY_LENGTH,
  checkOfflineSite,
  explorerExtractBudget,
  isPackagedSiteFile,
  listFiles,
  offlinePackageName,
  renderTemplate,
  startBatTemplateValues,
  toCrlf,
} from './lib/offline-site.mjs';
import { ZipWriter } from './lib/offline-zip.mjs';
import { formatBuildOutputReport, runBuildOutputCheck } from './lib/repo-check.mjs';
import { listZipEntries, readZipEntry } from './lib/zip-read.mjs';
import { PYODIDE_OFFLINE_FILES, PYODIDE_OFFLINE_TOTAL_BYTES, PYODIDE_VERSION } from '../src/lab/loader/pyodide-files.ts';
import { buildCreditsView } from '../src/lib/credits.ts';
import { siteConfig } from '../src/config/site.ts';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
/** 빌드 결과 폴더(APC_OUT_DIR — src/config/site.ts가 .cache/ 아래를 받는다) */
export const OFFLINE_OUT_DIR = '.cache/offline/site';
/** zip·안내 파일·요약을 두는 폴더(저장소에 넣지 않음) */
export const OFFLINE_WORK_DIR = '.cache/offline';
const OFFLINE_CONFIG = 'scripts/offline/astro.config.offline.mjs';
const TEMPLATE_DIR = path.join(rootDir, 'scripts', 'offline');

const args = process.argv.slice(2);
const skipBuild = args.includes('--skip-build');
const noZip = args.includes('--no-zip');

const startedAt = Date.now();
/** @type {{ step: string, ms: number }[]} */
const timings = [];
let stepIndex = 0;
const TOTAL_STEPS = 10;

function log(message) {
  console.log(`[오프라인 배포판] ${message}`);
}

function fail(message) {
  console.error(`[오프라인 배포판] 실패 — ${message}`);
  process.exit(1);
}

/** 단계 하나를 재며 돌린다 */
async function step(title, run) {
  stepIndex += 1;
  log(`${stepIndex}/${TOTAL_STEPS} ${title}`);
  const at = Date.now();
  const result = await run();
  timings.push({ step: title, ms: Date.now() - at });
  return result;
}

/** 오프라인 빌드용 환경 변수(Git Bash의 / 경로 바꾸기를 피하려고 Node에서 직접 넘긴다 — src/config/site.ts 머리말) */
function offlineEnv() {
  return { ...process.env, APC_BASE: '/', APC_OUT_DIR: OFFLINE_OUT_DIR, ASTRO_TELEMETRY_DISABLED: '1' };
}

/** 명령을 돌리고 실패하면 멈춘다(출력은 그대로 보인다) */
function run(command, commandArgs, label) {
  const options = { cwd: rootDir, env: offlineEnv(), stdio: /** @type {const} */ ('inherit'), windowsHide: true };
  // npm은 Windows에서 npm.cmd라 셸로 부른다 — 명령 한 줄로 넘긴다(인자에 공백이 없다: 경로는 저장소 뿌리 기준 상대 경로).
  // (셸에 인자 목록을 따로 넘기면 Node 24가 DEP0190 경고를 낸다.)
  const result =
    command === 'npm'
      ? spawnSync(['npm', ...commandArgs].join(' '), { ...options, shell: true })
      : spawnSync(command, commandArgs, options);
  if (result.error) {
    fail(`${label}을(를) 실행하지 못했어요: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${label}이(가) 실패했어요(종료 코드 ${result.status}). 위의 메시지를 확인해요.`);
  }
}

function git(argsList) {
  const result = spawnSync('git', argsList, { cwd: rootDir, encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : '';
}

function localDate(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function megabytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

async function main() {
  const siteDir = path.join(rootDir, ...OFFLINE_OUT_DIR.split('/'));
  const workDir = path.join(rootDir, ...OFFLINE_WORK_DIR.split('/'));
  const version = siteConfig.version;
  const packageName = offlinePackageName(version);
  const lock = JSON.parse(fs.readFileSync(path.join(rootDir, 'node_modules', 'pyodide', 'pyodide-lock.json'), 'utf8'));

  // 1. 패키지 확인
  const coverage = await step('파이썬 패키지 확인(예제·흉내 모듈·차시 코드의 import → pyodide-lock.json)', () => {
    const imports = collectRepoImports(rootDir);
    const tablePackages = PYODIDE_OFFLINE_FILES.filter((file) => file.kind === 'package').map((file) => file.package ?? '');
    const result = offlinePackageCoverage({ imports, lock, tablePackages });
    if (result.missing.length > 0) {
      fail(describeMissingPackages(result.missing, lock));
    }
    log(`  필요한 패키지 ${result.needed.length}개(${result.needed.join(', ')}) — 오프라인 표에 모두 있어요.`);
    return result;
  });

  // 2~4. 빌드
  if (skipBuild) {
    if (!fs.existsSync(path.join(siteDir, 'index.html'))) {
      fail(`--skip-build인데 ${OFFLINE_OUT_DIR}/index.html이 없어요. 먼저 npm run build:offline을 한 번 돌려요.`);
    }
    stepIndex += 3;
    log(`2~4/${TOTAL_STEPS} 빌드는 건너뛰어요(--skip-build) — 이미 있는 빌드 결과를 써요.`);
  } else {
    await step(`사이트 빌드(사이트 뿌리 /, 결과 ${OFFLINE_OUT_DIR}, 설정 ${OFFLINE_CONFIG})`, () => {
      run('npm', ['run', 'build', '--', '--config', OFFLINE_CONFIG], '사이트 빌드(npm run build)');
    });
    await step('서비스 워커를 오프라인 설정으로(build-sw --offline)', () => {
      run(process.execPath, ['scripts/build-sw.mjs', '--offline'], '서비스 워커 만들기');
    });
    await step(`Pyodide 파일 채우기(${PYODIDE_OFFLINE_FILES.length}개, ${megabytes(PYODIDE_OFFLINE_TOTAL_BYTES)})`, async () => {
      const targetDir = path.join(siteDir, 'vendor', 'pyodide', PYODIDE_VERSION);
      const result = await ensurePyodideFiles({ files: PYODIDE_OFFLINE_FILES, targetDir });
      log(`  그대로 ${result.ready}개, 복사 ${result.copied}개, 내려받기 ${result.fetched}개(고정 주소 + SHA-256 대조)`);
    });
  }

  // 5. 링크 검사
  await step('링크 검사(사이트 뿌리 기준)', () => {
    run(process.execPath, ['scripts/check-links.mjs'], '링크 검사');
  });

  // 6. 빌드 결과 확인
  const noticeFiles = buildCreditsView(fs.readFileSync(path.join(rootDir, 'sources.yaml'), 'utf8'))
    .noticeFiles.map((file) => file.path)
    .filter((file) => file.startsWith('public/'))
    .map((file) => file.slice('public/'.length));
  const siteCheck = await step('빌드 결과 확인(public 전체·Pyodide 표·고지 파일·서비스 워커·MIME 표)', () => {
    const result = checkOfflineSite({
      siteDir,
      publicDir: path.join(rootDir, 'public'),
      pyodideDir: `vendor/pyodide/${PYODIDE_VERSION}`,
      pyodideFiles: PYODIDE_OFFLINE_FILES,
      noticeFiles,
    });
    if (result.problems.length > 0) {
      fail(`빌드 결과에 문제가 ${result.problems.length}건 있어요:\n${result.problems.map((problem) => `  - ${problem}`).join('\n')}`);
    }
    log(`  사이트 파일 ${result.siteFileCount}개(public에서 온 ${result.publicFileCount}개 포함), 고지 파일 ${noticeFiles.length}개 확인`);
    return result;
  });

  // 7. 안내 파일(zip의 맨 위 폴더에 들어갈 것 — 8에서 빌드 결과와 함께 개인정보 검사를 받는다)
  const extrasRoot = path.join(workDir, 'extras');
  const extrasDir = path.join(extrasRoot, packageName);
  const commit = git(['rev-parse', '--short', 'HEAD']) || '알 수 없음';
  const dirty = git(['status', '--porcelain', '--untracked-files=no']) !== '';
  const buildDate = localDate(new Date(startedAt));
  const templateValues = {
    VERSION: version,
    BUILD_DATE: buildDate,
    COMMIT: dirty ? `${commit}(+커밋 전 변경)` : commit,
    SITE_URL: `${siteConfig.origin}${siteConfig.publicBase}/`,
  };
  const extras = await step('안내 파일 만들기(시작하기.bat·읽어보세요.txt·server/·LICENSE)', () => {
    removeDir(extrasRoot);
    /** zip에 넣을 안내 파일: zip 안 이름(맨 위 폴더 기준), 내용, 실행 권한 */
    const list = [
      {
        name: OFFLINE_LAYOUT.startBat,
        data: Buffer.from(toCrlf(renderTemplate(fs.readFileSync(path.join(TEMPLATE_DIR, 'start.bat'), 'utf8'), startBatTemplateValues())), 'utf8'),
      },
      {
        name: OFFLINE_LAYOUT.readme,
        data: Buffer.from(toCrlf(renderTemplate(fs.readFileSync(path.join(TEMPLATE_DIR, 'README.txt'), 'utf8'), templateValues)), 'utf8'),
      },
      {
        name: `${OFFLINE_LAYOUT.serverDir}/serve.ps1`,
        data: Buffer.from(toCrlf(renderTemplate(fs.readFileSync(path.join(TEMPLATE_DIR, 'serve.ps1'), 'utf8'), templateValues)), 'utf8'),
      },
      { name: `${OFFLINE_LAYOUT.serverDir}/serve.py`, data: fs.readFileSync(path.join(TEMPLATE_DIR, 'serve.py')), executable: true },
      { name: OFFLINE_LAYOUT.license, data: fs.readFileSync(path.join(rootDir, 'LICENSE')) },
      { name: OFFLINE_LAYOUT.licenseContent, data: fs.readFileSync(path.join(rootDir, 'LICENSE-CONTENT.md')) },
    ];
    // 시작하기.bat는 영어·기호만(ASCII) — cmd가 UTF-8 여러 바이트 글자가 든 배치 파일을 잘못 읽는다(scripts/lib/offline-site.mjs START_BAT_MESSAGES).
    // 안내 글·PowerShell 스크립트는 BOM으로 시작해야 한다(BOM이 없으면 PowerShell 5.1이 한국어 Windows에서 CP949로 읽어 한국어가 깨진다).
    if (list[0].data.some((byte) => byte > 0x7e || (byte < 0x20 && byte !== 0x0d && byte !== 0x0a && byte !== 0x09))) {
      fail('시작하기.bat에 영어·기호가 아닌 글자가 있어요 — 한국어 안내는 scripts/lib/offline-site.mjs의 START_BAT_MESSAGES에 적어요.');
    }
    for (const index of [1, 2]) {
      const data = list[index].data;
      if (!(data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf)) {
        fail(`${list[index].name}이(가) UTF-8 BOM으로 시작하지 않아요(PowerShell 5.1·메모장이 한국어를 깨뜨려요).`);
      }
    }
    for (const extra of list) {
      const target = path.join(extrasDir, ...extra.name.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, extra.data);
    }
    log(`  ${path.relative(rootDir, extrasDir).split(path.sep).join('/')}/ — ${list.map((extra) => extra.name).join(', ')}`);
    return list;
  });

  // 8. 개인정보 검사(빌드 결과 + 안내 파일)
  await step('개인정보 검사(이 컴퓨터의 절대 경로·개인정보 모양·그림 메타데이터 — 구역 C 요청 C-17)', () => {
    for (const outDir of [OFFLINE_OUT_DIR, `${OFFLINE_WORK_DIR}/extras`]) {
      const privacy = runBuildOutputCheck({ rootDir, outDir });
      console.log(formatBuildOutputReport(privacy));
      if (!privacy.ok) {
        fail(`${outDir}에서 개인정보 검사가 실패했어요 — zip을 만들지 않아요.`);
      }
    }
  });

  if (noZip) {
    log('zip은 만들지 않아요(--no-zip).');
    summarize({ siteCheck, coverage, extrasCount: extras.length, zip: null, version, packageName, commit: templateValues.COMMIT, buildDate });
    return;
  }

  // 9. zip
  const zipPath = path.join(workDir, `${packageName}.zip`);
  const zipInfo = await step(`zip 쓰기(${path.relative(rootDir, zipPath).split(path.sep).join('/')})`, () => {
    fs.rmSync(zipPath, { force: true });
    const writer = new ZipWriter(zipPath, { date: new Date(startedAt) });
    try {
      const siteFiles = listFiles(siteDir).filter(isPackagedSiteFile);
      const top = `${packageName}/`;
      /** 폴더 항목(zip 안 이름) — 파일보다 먼저, 이름 차례 */
      const directories = new Set([top, `${top}${OFFLINE_LAYOUT.serverDir}/`, `${top}${OFFLINE_LAYOUT.siteDir}/`]);
      for (const relative of siteFiles) {
        const parts = relative.split('/');
        for (let depth = 1; depth < parts.length; depth += 1) {
          directories.add(`${top}${OFFLINE_LAYOUT.siteDir}/${parts.slice(0, depth).join('/')}/`);
        }
      }
      for (const directory of [...directories].sort()) {
        writer.addDirectory(directory);
      }
      // 사람이 먼저 보는 파일을 앞에 둔다(시작하기.bat·읽어보세요.txt).
      for (const extra of extras) {
        writer.addFile(`${top}${extra.name}`, extra.data, { executable: extra.executable === true });
      }
      for (const relative of siteFiles) {
        writer.addFile(`${top}${OFFLINE_LAYOUT.siteDir}/${relative}`, fs.readFileSync(path.join(siteDir, ...relative.split('/'))));
      }
      return writer.close();
    } catch (error) {
      writer.abort();
      throw error;
    }
  });

  // 다시 읽어 모든 항목의 크기·CRC-32를 확인한다(쓰기 도구가 틀리면 여기서 잡힌다).
  const verify = await step('zip 다시 읽어 확인(항목마다 풀어 CRC-32 대조)', () => {
    const buffer = fs.readFileSync(zipPath);
    const entries = listZipEntries(buffer);
    let files = 0;
    let longest = '';
    for (const entry of entries) {
      if (entry.name.length > longest.length) {
        longest = entry.name;
      }
      if (entry.isDirectory) {
        continue;
      }
      readZipEntry(buffer, entry);
      files += 1;
    }
    if (entries.length !== zipInfo.entries || files !== zipInfo.files) {
      fail(`zip 항목 수가 달라요(쓴 것 ${zipInfo.entries}·${zipInfo.files}, 읽은 것 ${entries.length}·${files}).`);
    }
    const koreanNames = entries.filter((entry) => /[가-힣]/u.test(entry.name));
    if (!koreanNames.every((entry) => entry.utf8Flag)) {
      fail('한국어 이름 항목에 UTF-8 표시가 없어요.');
    }
    // Windows 탐색기는 전체 경로가 260글자를 넘는 파일을 풀지 못한다(2026-09-26 실측) — zip 안 이름이 너무 길면 멈춘다
    if (longest.length > OFFLINE_MAX_ENTRY_LENGTH) {
      fail(
        `zip 안 이름이 ${longest.length}글자예요(상한 ${OFFLINE_MAX_ENTRY_LENGTH}): ${longest} — Windows 탐색기가 풀지 못할 수 있어요. ` +
          '이름을 줄이거나 scripts/lib/offline-site.mjs의 OFFLINE_MAX_ENTRY_LENGTH를 까닭과 함께 고쳐요.',
      );
    }
    return { entries: entries.length, files, longest, sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
  });

  summarize({
    siteCheck,
    coverage,
    extrasCount: extras.length,
    zip: { path: zipPath, ...zipInfo, ...verify },
    version,
    packageName,
    commit: templateValues.COMMIT,
    buildDate,
  });
}

function summarize({ siteCheck, coverage, extrasCount, zip, version, packageName, commit, buildDate }) {
  const totalMs = Date.now() - startedAt;
  const summary = {
    version,
    packageName,
    commit,
    buildDate,
    builtAt: new Date(startedAt).toISOString(),
    totalSeconds: Math.round(totalMs / 100) / 10,
    steps: timings.map((timing) => ({ step: timing.step, seconds: Math.round(timing.ms / 100) / 10 })),
    site: { dir: OFFLINE_OUT_DIR, files: siteCheck.siteFileCount, publicFiles: siteCheck.publicFileCount },
    pyodide: { files: PYODIDE_OFFLINE_FILES.map((file) => file.name), bytes: PYODIDE_OFFLINE_TOTAL_BYTES, packages: coverage.needed },
    extras: extrasCount,
    zip: zip
      ? {
          file: path.relative(rootDir, zip.path).split(path.sep).join('/'),
          bytes: zip.bytes,
          sha256: zip.sha256,
          entries: zip.entries,
          files: zip.files,
          uncompressedBytes: zip.uncompressedBytes,
          longestEntryName: zip.longest,
          longestEntryLength: zip.longest.length,
          explorerExtractBudget: explorerExtractBudget(zip.longest.length, packageName),
        }
      : null,
  };
  const workDir = path.join(rootDir, ...OFFLINE_WORK_DIR.split('/'));
  fs.mkdirSync(workDir, { recursive: true });
  fs.writeFileSync(path.join(workDir, `${packageName}.json`), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  log('');
  log(`끝 — 모두 ${summary.totalSeconds}초`);
  for (const timing of summary.steps) {
    log(`  · ${timing.step}: ${timing.seconds}초`);
  }
  if (summary.zip) {
    log(
      `  zip ${summary.zip.file} — ${megabytes(summary.zip.bytes)}(${summary.zip.bytes.toLocaleString('en-US')}바이트), ` +
        `항목 ${summary.zip.entries}개(파일 ${summary.zip.files}개), 풀면 ${megabytes(summary.zip.uncompressedBytes)}`,
    );
    log(`  SHA-256 ${summary.zip.sha256}`);
    log(
      `  가장 긴 zip 안 이름 ${summary.zip.longestEntryLength}글자(상한 ${OFFLINE_MAX_ENTRY_LENGTH}) — Windows 탐색기로 풀 때 풀 곳 폴더 경로가 ` +
        `${summary.zip.explorerExtractBudget}글자까지 돼요: ${summary.zip.longestEntryName}`,
    );
  }
  log(`  요약: ${path.relative(rootDir, path.join(workDir, `${packageName}.json`)).split(path.sep).join('/')}`);
  log('  확인: node scripts/offline/verify-offline.mjs (zip을 풀어 서버를 띄우고 인터넷을 막은 브라우저로 시험)');
}

main().catch((error) => {
  fail(error instanceof Error ? (error.stack ?? error.message) : String(error));
});
