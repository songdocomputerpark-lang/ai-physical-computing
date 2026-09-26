// 오프라인 배포판의 약속 한 곳(PLAN §5.6, P6-07) — scripts/build-offline.mjs·scripts/offline/verify-offline.mjs와 단위 테스트가 쓴다.
//
// - 파일 종류(MIME) 표 OFFLINE_MIME_TYPES: 작은 웹 서버 두 개(scripts/offline/serve.ps1·serve.py)에 같은 표가 글자로 들어 있다
//   (PowerShell·파이썬은 이 파일을 읽을 수 없어서). tests/unit/offline/site.test.ts가 세 표가 같은지 대조하고,
//   build:offline은 빌드 결과에 표에 없는 확장자가 있으면 멈춘다(새 파일 종류를 더할 때 세 곳을 함께 고치게).
// - zip 안 차림 OFFLINE_LAYOUT, zip 이름, 안내 글 자리 채우기(renderTemplate), 줄 끝 바꾸기(toCrlf).
// - 빌드 결과 확인(checkOfflineSite): public/의 모든 파일이 빠짐없이 같은 크기로 있는지(모델·펌웨어·글꼴·고지·MediaPipe·예비본),
//   오프라인 표의 Pyodide 파일이 크기·SHA-256까지 맞는지, 서비스 워커가 오프라인 설정인지, 검색 색인이 있는지.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 확장자 → Content-Type. 글 파일은 charset=utf-8을 붙인다(고지 파일은 BOM도 있어 문자 집합을 안 알려도 깨지지 않는다 — 구역 C).
 * .wasm은 application/wasm이어야 WebAssembly.instantiateStreaming이 되고, .mjs·.js는 JavaScript 형식이어야 모듈 워커·import()가 된다.
 */
export const OFFLINE_MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.cur': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.whl': 'application/zip',
  '.bin': 'application/octet-stream',
  '.task': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.pagefind': 'application/octet-stream',
  '.pf_fragment': 'application/octet-stream',
  '.pf_index': 'application/octet-stream',
  '.pf_meta': 'application/octet-stream',
});

/** 표에 없는 확장자의 Content-Type(두 서버 모두 같은 값) */
export const OFFLINE_DEFAULT_MIME = 'application/octet-stream';

/**
 * zip 안 차림. 맨 위 폴더(zip 이름과 같음) 아래에:
 *   시작하기.bat · 읽어보세요.txt · LICENSE · LICENSE-CONTENT.md · server/(serve.ps1, serve.py) · site/(빌드 결과)
 * 저장소의 원본: scripts/offline/start.bat → 시작하기.bat(CRLF), scripts/offline/README.txt → 읽어보세요.txt(CRLF, 자리 채움),
 * scripts/offline/serve.ps1·serve.py → server/(serve.ps1은 CRLF·판 번호 채움). 한국어 이름은 zip의 UTF-8 표시로 넣는다(offline-zip.mjs).
 */
export const OFFLINE_LAYOUT = Object.freeze({
  siteDir: 'site',
  serverDir: 'server',
  startBat: '시작하기.bat',
  readme: '읽어보세요.txt',
  license: 'LICENSE',
  licenseContent: 'LICENSE-CONTENT.md',
});

/**
 * zip과 맨 위 폴더 이름: apc-offline-<판>(apc = AI Physical Computing).
 * 짧게 둔 까닭(2026-09-26 실측): Windows 탐색기의 [압축 풀기]는 전체 경로가 260글자(MAX_PATH)를 넘는 파일을 풀지 못한다
 * (알림 없이 넘기거나 파일마다 "경로가 너무 깁니다" 창). 탐색기는 zip 이름으로 폴더를 하나 더 만들고 그 안에 맨 위 폴더를 푸므로
 * 이름이 두 번 들어간다 — 긴 이름(ai-physical-computing-offline-0.1.0, 35글자)이면 가장 긴 파일(Pyodide 휠 89글자)과 합쳐
 * 풀 곳이 93글자만 넘어도 파일 125개가 빠졌다. 짧은 이름이면 풀 곳 경로가 약 147글자까지 된다(OFFLINE_MAX_ENTRY_LENGTH).
 */
export function offlinePackageName(version) {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new Error(`판 번호 "${version}"이(가) 0.0.0 모양이 아니에요(package.json의 version).`);
  }
  return `apc-offline-${version}`;
}

/**
 * zip 안 이름(맨 위 폴더 포함) 길이의 상한. 탐색기가 푸는 전체 경로 = 풀 곳 + "\\" + zip 이름 폴더 + "\\" + zip 안 이름 ≤ 259글자.
 * 상한 130이면 zip 이름 폴더(약 18글자)를 빼고도 풀 곳 경로가 110글자까지 된다(보통 C:\Users\이름\Downloads는 30글자 안팎).
 * 새 파일 이름이 길어져 넘으면 build:offline이 멈춘다 — 이름을 줄이거나 이 값을 까닭과 함께 고친다.
 */
export const OFFLINE_MAX_ENTRY_LENGTH = 130;

/** Windows 탐색기로 풀 때 풀 곳 폴더 경로가 몇 글자까지 되는지(탐색기가 zip 이름으로 폴더를 하나 더 만드는 것까지 셈) */
export function explorerExtractBudget(longestEntryLength, packageName) {
  return 259 - longestEntryLength - (packageName.length + 1) - 1;
}

/**
 * 시작하기.bat가 보여 주는 한국어 안내(zip 안 이름은 OFFLINE_LAYOUT.startBat).
 * bat 파일에는 한국어를 적지 않는다: cmd는 배치 파일을 콘솔 코드 페이지로 읽고, chcp 65001을 해도 UTF-8 여러 바이트 글자가 든 줄을
 * 읽은 뒤 파일 위치를 잘못 옮겨 다음 줄을 깨뜨린다(2026-09-26 한국어 Windows 11 코드 페이지 949 실측 — 한국어 rem 줄 다음 줄이
 * "'��' is not recognized"로 실행됨). 그래서 이 글을 \uXXXX로 바꿔 PowerShell 명령(-Command)으로 찍는다 — bat는 영어·기호만 남는다.
 */
export const START_BAT_MESSAGES = Object.freeze({
  NOT_EXTRACTED: Object.freeze([
    '',
    ' [안내] 압축 파일 안에서 바로 실행한 것 같아요.',
    '        먼저 압축을 모두 푼 뒤, 풀린 폴더 안의 시작하기.bat를 실행해 주세요.',
    '',
  ]),
  FAILED: Object.freeze([
    '',
    ' [안내] 작은 웹 서버를 시작하지 못했어요. 위의 까닭을 확인해 주세요.',
    '        같은 폴더의 읽어보세요.txt 3절 "안 될 때"와 4절 "다른 방법으로 시작하기"를 열어 드릴게요.',
    '',
  ]),
});

/** 영어 글자·숫자·빈칸·일부 기호 말고는 모두 \uXXXX로(PowerShell [regex]::Unescape가 되돌린다) */
function unicodeEscape(text) {
  let out = '';
  for (const unit of text.split('')) {
    out += /[A-Za-z0-9 .,:-]/u.test(unit) ? unit : `\\u${unit.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return out;
}

/**
 * 한국어 줄들을 찍는 PowerShell 명령(-Command "…"의 안쪽). 결과는 ASCII만이라 bat 파일에 그대로 넣을 수 있다.
 * @param {readonly string[]} lines
 */
export function powershellMessageCommand(lines) {
  const items = lines.map((line) => `'${unicodeEscape(line)}'`).join(',');
  return `[Console]::OutputEncoding=[Text.Encoding]::UTF8; foreach ($l in @(${items})) { Write-Host ([regex]::Unescape($l)) -ForegroundColor Yellow }`;
}

/** 시작하기.bat 원본(scripts/offline/start.bat)의 {{APC_MSG_…}} 자리에 넣을 값 */
export function startBatTemplateValues() {
  return {
    MSG_NOT_EXTRACTED: powershellMessageCommand(START_BAT_MESSAGES.NOT_EXTRACTED),
    MSG_FAILED: powershellMessageCommand(START_BAT_MESSAGES.FAILED),
  };
}

/** 줄 끝을 CRLF로(메모장·cmd가 읽기 좋게). 이미 CRLF인 줄은 그대로. */
export function toCrlf(text) {
  return text.replace(/\r?\n/gu, '\r\n');
}

/**
 * {{APC_이름}} 자리를 채운다. 값이 없는 자리가 남으면 오류(안내 글에 {{…}}가 그대로 나가지 않게).
 * @param {string} text
 * @param {Record<string, string>} values 키는 APC_ 뒤 이름(예: VERSION)
 */
export function renderTemplate(text, values) {
  const result = text.replace(/\{\{APC_([A-Z_]+)\}\}/gu, (match, key) => {
    if (!(key in values)) {
      throw new Error(`안내 글의 자리 ${match}에 넣을 값이 없어요.`);
    }
    return values[key];
  });
  return result;
}

/** 폴더 안의 모든 파일(상대 경로, / 구분, 이름 차례) */
export function listFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.push(path.relative(dir, full).split(path.sep).join('/'));
      }
    }
  };
  walk(dir);
  return out.sort();
}

/** zip에 넣지 않는 파일: 점으로 시작하는 이름(예: public/models/.gitkeep — 자리 표시용 빈 파일) */
export function isPackagedSiteFile(relative) {
  return !relative.split('/').some((part) => part.startsWith('.'));
}

/** 빌드 결과에서 MIME 표에 없는 확장자(점 파일 제외). 확장자 없는 파일은 '(없음)'. */
export function extensionsWithoutMime(files) {
  const missing = new Set();
  for (const file of files) {
    if (!isPackagedSiteFile(file)) {
      continue;
    }
    const extension = path.posix.extname(file).toLowerCase();
    if (!(extension in OFFLINE_MIME_TYPES)) {
      missing.add(extension === '' ? '(없음)' : extension);
    }
  }
  return [...missing].sort();
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * 오프라인판 빌드 결과를 확인한다. 문제 문장 목록(비었으면 통과)과 참고 숫자를 돌려준다.
 * @param {{
 *   siteDir: string,
 *   publicDir: string,
 *   pyodideDir: string,
 *   pyodideFiles: readonly { name: string, size: number, sha256: string }[],
 *   noticeFiles?: readonly string[],
 * }} input
 *   pyodideDir: 사이트 안 Pyodide 폴더(예: vendor/pyodide/314.0.7) / noticeFiles: 사이트 안 고지 파일 경로(licenses/… — /credits/ 목록)
 */
export function checkOfflineSite({ siteDir, publicDir, pyodideDir, pyodideFiles, noticeFiles = [] }) {
  const problems = [];
  const siteFiles = new Set(listFiles(siteDir));

  for (const required of ['index.html', '404.html', 'sw.js', 'pagefind/pagefind.js']) {
    if (!siteFiles.has(required)) {
      problems.push(`빌드 결과에 ${required}이(가) 없어요.`);
    }
  }

  // public/의 모든 파일(점 파일 빼고)이 같은 크기로 들어 있어야 한다 — 모델·펌웨어·글꼴·고지·MediaPipe·Blockly·예비본
  let publicCount = 0;
  for (const relative of listFiles(publicDir)) {
    if (!isPackagedSiteFile(relative)) {
      continue;
    }
    publicCount += 1;
    const inSite = path.join(siteDir, ...relative.split('/'));
    if (!fs.existsSync(inSite)) {
      problems.push(`public/${relative}이(가) 빌드 결과에 없어요.`);
      continue;
    }
    if (fs.statSync(inSite).size !== fs.statSync(path.join(publicDir, ...relative.split('/'))).size) {
      problems.push(`public/${relative}과(와) 빌드 결과의 크기가 달라요.`);
    }
  }

  // 오프라인 표의 Pyodide 파일(예비본 7개 + 오프라인판에서만 더 넣는 휠)은 크기·SHA-256까지
  for (const file of pyodideFiles) {
    const relative = `${pyodideDir}/${file.name}`;
    const full = path.join(siteDir, ...relative.split('/'));
    if (!fs.existsSync(full)) {
      problems.push(`Pyodide 파일 ${relative}이(가) 없어요.`);
      continue;
    }
    if (fs.statSync(full).size !== file.size || sha256File(full) !== file.sha256) {
      problems.push(`Pyodide 파일 ${relative}의 크기나 SHA-256이 표(src/lab/loader/pyodide-files.ts)와 달라요.`);
    }
  }

  for (const notice of noticeFiles) {
    if (!siteFiles.has(notice)) {
      problems.push(`고지 파일 ${notice}이(가) 빌드 결과에 없어요(/credits/의 고지 전문 파일 모음).`);
    }
  }

  if (siteFiles.has('sw.js')) {
    const sw = fs.readFileSync(path.join(siteDir, 'sw.js'), 'utf8');
    if (!/"offline":true/u.test(sw)) {
      problems.push('서비스 워커(sw.js)가 오프라인 설정이 아니에요(scripts/build-sw.mjs --offline).');
    }
    if (!sw.includes('"base":"/"')) {
      problems.push('서비스 워커(sw.js)의 사이트 뿌리가 /가 아니에요(APC_BASE=/로 빌드해야 해요).');
    }
  }

  const unknownExtensions = extensionsWithoutMime([...siteFiles]);
  if (unknownExtensions.length > 0) {
    problems.push(
      `작은 웹 서버의 파일 종류(MIME) 표에 없는 확장자가 있어요: ${unknownExtensions.join(', ')} — ` +
        'scripts/lib/offline-site.mjs의 OFFLINE_MIME_TYPES와 scripts/offline/serve.ps1·serve.py의 표에 함께 더해요.',
    );
  }
  return { problems, siteFileCount: siteFiles.size, publicFileCount: publicCount };
}
