// 같은 사이트에서 내보낼 외부 자산을 npm 패키지에서 public/vendor/로 복사한다(PLAN §5.2 PD-02·PD-13, P2-08 준비).
//
// - MediaPipe Tasks Vision 0.10.35의 WebAssembly 파일(node_modules/@mediapipe/tasks-vision/wasm/*)을 public/vendor/mediapipe/0.10.35/wasm/에 둔다.
//   FilesetResolver.forVisionTasks(withBase('vendor/mediapipe/0.10.35/wasm'))로 불러오면 학생 브라우저가 CDN 대신 이 사이트에서 받는다(PD-02).
//   버전은 package.json의 설치 버전에서 읽어 폴더 이름에 넣는다(캐시 우선 규칙, PLAN §5.3).
// - Pretendard 정적 글꼴 한 개(node_modules/pretendard/dist/public/static/Pretendard-Regular.otf)를 public/vendor/pretendard/에 둔다.
//   Pyodide의 Pillow(FreeType)가 woff2를 열지 못해서, 실습실이 PIL로 한글을 그릴 때 쓸 .otf 한 개가 필요하다(P2-10, f043).
// - Blockly의 media 폴더(효과음·커서·아이콘, P3-06 블록 모드)를 public/vendor/blockly/<버전>/media/에 둔다(병렬 제작 준비 2026-09-17).
//   Blockly.inject의 media 옵션을 주지 않으면 외부 주소에서 받으므로 src/lab/vendor-paths.ts의 blocklyMediaPath()를 넘긴다.
// - public/vendor/는 저장소에 넣지 않는다(.gitignore). npm run dev·npm run build 앞(predev·prebuild)에서 자동으로 돈다. 이미 같은 크기·수정 시각이면 건너뛴다.
// - 출처 등록: sources.yaml의 "MediaPipe Tasks Vision" 항목이 public/vendor/mediapipe/**를 덮는다. 같은 사이트 Pyodide 예비본(P2-05)도
//   public/vendor/pyodide/<버전>/에 두면 되고(Pyodide 항목이 덮음), 그 내려받기 단계는 이 파일에 더한다.
//
// 쓰는 법: node scripts/vendor-assets.mjs [--check]   (--check: 복사하지 않고 빠진 파일만 알린다, 종료 코드 1)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const checkOnly = process.argv.includes('--check');

/** 복사할 자산 목록. 새 자산은 여기에 한 줄을 더한다(먼저 sources.yaml에 등록). */
function assetJobs() {
  const mediapipeDir = path.join(rootDir, 'node_modules', '@mediapipe', 'tasks-vision');
  const packageJsonPath = path.join(mediapipeDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error('@mediapipe/tasks-vision 패키지가 없어요. npm ci(또는 npm install)를 먼저 실행해요.');
  }
  const version = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
  const pretendardDir = path.join(rootDir, 'node_modules', 'pretendard');
  if (!fs.existsSync(path.join(pretendardDir, 'package.json'))) {
    throw new Error('pretendard 패키지가 없어요. npm ci(또는 npm install)를 먼저 실행해요.');
  }
  const blocklyDir = path.join(rootDir, 'node_modules', 'blockly');
  if (!fs.existsSync(path.join(blocklyDir, 'package.json'))) {
    throw new Error('blockly 패키지가 없어요. npm ci(또는 npm install)를 먼저 실행해요.');
  }
  const blocklyVersion = JSON.parse(fs.readFileSync(path.join(blocklyDir, 'package.json'), 'utf8')).version;
  const blocklyMedia = path.join(blocklyDir, 'media');
  return [
    {
      name: `MediaPipe Tasks Vision ${version} WebAssembly`,
      from: path.join(mediapipeDir, 'wasm'),
      to: path.join(rootDir, 'public', 'vendor', 'mediapipe', version, 'wasm'),
      // 시각 파일만(SIMD·비SIMD 둘 다 — 브라우저가 고른다). 오디오·텍스트 태스크는 이 패키지에 없다.
      files: ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm'],
    },
    {
      // 파이썬 쪽 PIL이 한글을 그릴 때 쓰는 정적 글꼴 한 개(공식 배포 파일 그대로, 고치지 않음 — OFL-1.1).
      // 찾는 주소는 src/lab/modules/runtime-extras/assets.ts의 SITE_FONT_CANDIDATES.
      name: 'Pretendard 정적 글꼴(PIL 글꼴 경로 연결용)',
      from: path.join(pretendardDir, 'dist', 'public', 'static'),
      to: path.join(rootDir, 'public', 'vendor', 'pretendard'),
      files: ['Pretendard-Regular.otf'],
    },
    {
      // Blockly(P3-06 블록 모드)가 inject({ media })로 부르는 효과음·커서·아이콘 파일. 옵션을 주지 않으면 Blockly가 외부 주소
      // (blockly-demo.appspot.com)에서 받으려 하므로 같은 사이트에 둔다(PD-02, 원칙 2). 주소는 src/lab/vendor-paths.ts의 blocklyMediaPath().
      // 패키지 폴더의 파일을 모두 복사한다(판마다 파일이 달라질 수 있어서). 고치지 않는다(Apache-2.0, sources.yaml "Blockly" 항목).
      name: `Blockly ${blocklyVersion} media`,
      from: blocklyMedia,
      to: path.join(rootDir, 'public', 'vendor', 'blockly', blocklyVersion, 'media'),
      files: fs.readdirSync(blocklyMedia).filter((file) => fs.statSync(path.join(blocklyMedia, file)).isFile()).sort(),
    },
  ];
}

function sameFile(from, to) {
  if (!fs.existsSync(to)) {
    return false;
  }
  const a = fs.statSync(from);
  const b = fs.statSync(to);
  return a.size === b.size && Math.abs(a.mtimeMs - b.mtimeMs) < 1000;
}

let copied = 0;
let missing = 0;
for (const job of assetJobs()) {
  for (const file of job.files) {
    const from = path.join(job.from, file);
    const to = path.join(job.to, file);
    if (!fs.existsSync(from)) {
      throw new Error(`${job.name}: 패키지 안에 ${file}이(가) 없어요(패키지 판이 바뀌었으면 이 목록을 고쳐요).`);
    }
    if (sameFile(from, to)) {
      continue;
    }
    if (checkOnly) {
      console.error(`[자산 복사] 빠짐: ${path.relative(rootDir, to)}`);
      missing += 1;
      continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    const stat = fs.statSync(from);
    fs.utimesSync(to, stat.atime, stat.mtime);
    copied += 1;
  }
}

if (checkOnly) {
  if (missing > 0) {
    console.error(`[자산 복사] ${missing}개가 없어요. node scripts/vendor-assets.mjs 를 실행해요.`);
    process.exitCode = 1;
  } else {
    console.log('[자산 복사] 모두 있어요.');
  }
} else {
  console.log(`[자산 복사] ${copied > 0 ? `${copied}개 복사` : '이미 최신'} → public/vendor/ (저장소에 넣지 않음)`);
}
