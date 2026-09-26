// 같은 사이트 Pyodide 예비본을 빌드 폴더에 채운다 — PLAN §5.2 PD-02·PD-13, §8.2 P2-05.
//
// 왜 필요한가: 학교 네트워크가 jsDelivr를 막거나 느리게 하면 파이썬이 뜨지 않는다. 그래서 첫 cv2 실습에 필요한 파일만
// 같은 사이트(public/vendor/pyodide/<판>/)에도 두고, 서비스 워커가 CDN이 막히면 자동으로 이쪽으로 바꾼다(src/sw/sw.js).
// 파일은 **저장소에 커밋하지 않는다**(PD-13, .gitignore /public/vendor/). 빌드 때마다 이 스크립트가 채운다.
//
// 어디서 가져오나(순서대로 — 네트워크를 가장 적게 쓴다)
//   1. 이미 대상 폴더에 있고 SHA-256이 맞으면 그대로 둔다.
//   2. 로컬 캐시 .cache/pyodide-fallback/(CI의 actions/cache 경로) → 3. node_modules/pyodide/(코어 5개, devDependency)
//   → 4. .cache/pyodide-packages/(Node 테스트가 받아 둔 휠) → 5. jsDelivr에서 내려받기(고정 주소).
// 받은 파일은 크기·SHA-256으로 확인한다(src/lab/loader/pyodide-files.ts의 표 = pyodide-lock.json의 값). 다르면 오류로 멈춘다.
//
// 쓰는 법
//   node scripts/fetch-pyodide-fallback.mjs            채운다(npm run build의 prebuild에서 부른다)
//   node scripts/fetch-pyodide-fallback.mjs --check    받지 않고 빠진 것만 알린다(종료 코드 1)
//   node scripts/fetch-pyodide-fallback.mjs --offline  네트워크를 쓰지 않는다(로컬에 없으면 오류)
//
// 오프라인 배포판(PLAN §5.6, P6-07): scripts/build-offline.mjs가 이 파일의 ensurePyodideFiles()를 불러 오프라인 표
// (pyodide-files.ts의 PYODIDE_OFFLINE_FILES — 예비본 7개 + 오프라인판에서만 더 넣는 휠)를 **빌드 결과 폴더**에 직접 채운다.
// public/vendor/는 온라인 사이트 배포물이 되므로 오프라인판에서만 쓰는 휠은 넣지 않는다(온라인 사이트는 그대로).
//
// 크기: 코어 13.5MB + numpy 3.0MB + OpenCV 10.7MB = 27.2MB. GitHub Pages 사이트 한도 1GB의 약 2.7%(PLAN §5.1).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PYODIDE_FALLBACK_FILES, PYODIDE_FALLBACK_TOTAL_BYTES, PYODIDE_VERSION, pyodideCdnUrl } from '../src/lab/loader/pyodide-files.ts';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
/** 온라인 사이트 예비본 자리(빌드가 dist/vendor/pyodide/<판>/으로 복사한다) */
export const PUBLIC_FALLBACK_DIR = path.join(rootDir, 'public', 'vendor', 'pyodide', PYODIDE_VERSION);
/** CI에서 actions/cache로 남기는 폴더(워크플로 요청은 .cache/phase2-requests/loading.md 4번) */
const cacheDir = path.join(rootDir, '.cache', 'pyodide-fallback', PYODIDE_VERSION);
const localSources = [cacheDir, path.join(rootDir, 'node_modules', 'pyodide'), path.join(rootDir, '.cache', 'pyodide-packages')];

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * 파일이 있고 크기·해시가 표와 같은지
 * @param {string} filePath
 * @param {{ size: number, sha256: string }} file
 */
export function verifiedPyodideFile(filePath, file) {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const stat = fs.statSync(filePath);
  if (stat.size !== file.size) {
    return false;
  }
  return sha256(fs.readFileSync(filePath)) === file.sha256;
}

function findLocal(file) {
  for (const dir of localSources) {
    const candidate = path.join(dir, file.name);
    if (verifiedPyodideFile(candidate, file)) {
      return candidate;
    }
  }
  return null;
}

async function download(file) {
  const url = pyodideCdnUrl(file.name);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${file.name}: ${url} 이(가) ${response.status} 응답을 보냈어요.`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length !== file.size || sha256(buffer) !== file.sha256) {
    throw new Error(
      `${file.name}: 받은 파일이 표와 달라요(크기 ${buffer.length}/${file.size}). Pyodide 판을 올렸다면 src/lab/loader/pyodide-files.ts의 표를 갱신해요.`,
    );
  }
  return buffer;
}

function writeFile(filePath, buffer) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

/**
 * 표의 파일을 대상 폴더에 채운다(있고 맞으면 그대로 → 로컬 사본 복사 → jsDelivr 고정 주소에서 받아 크기·SHA-256 대조).
 * @param {{ files: readonly { name: string, size: number, sha256: string }[], targetDir: string, checkOnly?: boolean, offline?: boolean }} options
 *   offline: 네트워크를 쓰지 않는다(로컬에 없으면 오류) — 인터넷이 막힌 곳에서 빌드할 때
 * @returns {Promise<{ ready: number, copied: number, fetched: number, missing: string[] }>}
 */
export async function ensurePyodideFiles({ files, targetDir, checkOnly = false, offline = false }) {
  let ready = 0;
  let copied = 0;
  let fetched = 0;
  const missing = [];

  for (const file of files) {
    const target = path.join(targetDir, file.name);
    if (verifiedPyodideFile(target, file)) {
      ready += 1;
      continue;
    }
    if (checkOnly) {
      missing.push(file.name);
      continue;
    }
    const local = findLocal(file);
    if (local) {
      writeFile(target, fs.readFileSync(local));
      copied += 1;
      continue;
    }
    if (offline) {
      throw new Error(`${file.name}이(가) 로컬에 없어요(--offline). node_modules/pyodide 또는 .cache/pyodide-fallback/을 확인해요.`);
    }
    const buffer = await download(file);
    writeFile(target, buffer);
    // 다음 빌드(그리고 CI 캐시)를 위해 남겨 둔다.
    try {
      writeFile(path.join(cacheDir, file.name), buffer);
    } catch {
      // 캐시 폴더를 못 써도 빌드는 계속한다.
    }
    fetched += 1;
  }
  return { ready, copied, fetched, missing };
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const offline = args.includes('--offline');
  const { ready, copied, fetched, missing } = await ensurePyodideFiles({
    files: PYODIDE_FALLBACK_FILES,
    targetDir: PUBLIC_FALLBACK_DIR,
    checkOnly,
    offline,
  });

  const megabytes = (PYODIDE_FALLBACK_TOTAL_BYTES / (1024 * 1024)).toFixed(1);
  if (checkOnly) {
    if (missing.length > 0) {
      console.error(`[Pyodide 예비본] ${missing.length}개가 없거나 달라요: ${missing.join(', ')}`);
      console.error('  node scripts/fetch-pyodide-fallback.mjs 를 실행해요.');
      process.exitCode = 1;
    } else {
      console.log(`[Pyodide 예비본] ${PYODIDE_FALLBACK_FILES.length}개 모두 있어요(${megabytes}MB).`);
    }
    return;
  }
  console.log(
    `[Pyodide 예비본] public/vendor/pyodide/${PYODIDE_VERSION}/ — 그대로 ${ready}개, 복사 ${copied}개, 내려받기 ${fetched}개 (모두 ${megabytes}MB, 저장소에 넣지 않음)`,
  );
}

// 다른 파일(scripts/build-offline.mjs)이 import할 때는 돌지 않게 한다.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(`[Pyodide 예비본] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
