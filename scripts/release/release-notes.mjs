// 대응 소스 사본 릴리스 준비(운영자 할 일 26) — 받은 폴더 확인 → 릴리스 설명(release-notes.md) → 올릴 명령 보여 주기.
//
// 이 스크립트는 아무것도 올리지 않는다. 릴리스는 새 공개 게시라 운영자가 "예"라고 한 뒤에만 Claude가 여기서 찍은 명령을 돌린다
// (DECISIONS C33 — 결정 위임의 예외). 차례는 scripts/release/README.md 3절:
//   1. node scripts/release/release-notes.mjs [--dir .cache/release-sources] [--offline-zip .cache/offline/apc-offline-<판>.zip]
//      받은 폴더를 목록(scripts/release/sources-manifest.json)과 대조하고(scripts/lib/offline-sources.mjs — build:offline --sources와
//      같은 규칙), <폴더>/release-notes.md를 쓰고, 초안 릴리스를 만드는 gh 명령을 찍는다.
//   2. (운영자 "예" 뒤) 찍힌 gh release create … --draft 명령
//   3. node scripts/release/release-notes.mjs --check-uploaded [--offline-zip …]
//      gh api로 초안 릴리스의 파일 목록을 읽어 이름·크기·SHA-256(GitHub가 적는 digest)을 폴더와 대조한다(읽기만).
//   4. 모두 맞으면 찍힌 gh release edit <태그> --draft=false 명령으로 공개한다.
// 쓰는 도구는 저장소 안의 것뿐이고(외부 패키지 없음), gh는 3에서만 읽기(api GET)로 부른다.
// 목록에 공식 해시가 없는 채(고정 전)인 항목이 있으면 멈춘다 — README 3절 2번(받은 날 잰 SHA-256을 목록에 고정)을 먼저 한다
// (1.1.0 안전 검토 지적 3: 고정 전 값은 같은 폴더의 기록과만 대조된다, DECISIONS C60).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  SOURCES_DEFAULT_DIR,
  SOURCES_MANIFEST_FILE,
  SOURCES_SUMS_FILE,
  checkSourcesFolder,
  hashFile,
  readSourcesManifest,
  sourcesSha256SumsText,
  unpinnedSourceItems,
} from '../lib/offline-sources.mjs';

export const RELEASE_REPO = 'songdocomputerpark-lang/ai-physical-computing';
const SITE_URL = 'https://songdocomputerpark-lang.github.io/ai-physical-computing/';
const REPO_URL = `https://github.com/${RELEASE_REPO}`;
export const NOTES_FILE = 'release-notes.md';

/**
 * @typedef {import('../lib/offline-sources.mjs').SourcesManifest} SourcesManifest
 * @typedef {import('../lib/offline-sources.mjs').CheckedSource} CheckedSource
 * @typedef {{ name: string, path: string, size: number, sha256: string, version: string }} OfflineZip
 * @typedef {{ name: string, size: number, sha256: string }} ExpectedAsset
 */

function bytes(size) {
  return size.toLocaleString('en-US');
}

/** 마크다운 표 칸에 넣을 글(세로 막대·줄바꿈을 막는다) */
function cell(text) {
  return String(text).replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ');
}

/**
 * 오프라인판 zip의 이름·크기·SHA-256. 같은 폴더의 요약(apc-offline-<판>.json)이 있으면 SHA-256이 같은지도 본다.
 * @param {string} zipPath
 * @returns {OfflineZip}
 */
export function readOfflineZip(zipPath) {
  const name = path.basename(zipPath);
  const match = /^apc-offline-(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\.zip$/u.exec(name);
  if (!match) {
    throw new Error(`오프라인판 zip 이름이 apc-offline-<판>.zip 모양이 아니에요: ${name}`);
  }
  if (!fs.existsSync(zipPath)) {
    throw new Error(`오프라인판 zip이 없어요: ${zipPath}`);
  }
  const measured = hashFile(zipPath);
  const summaryPath = zipPath.replace(/\.zip$/u, '.json');
  if (fs.existsSync(summaryPath)) {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
    const recorded = summary?.zip?.sha256;
    if (typeof recorded === 'string' && recorded !== measured.sha256) {
      throw new Error(`${name}의 SHA-256이 빌드 요약(${path.basename(summaryPath)})과 달라요 — 만든 뒤 바뀌었어요. npm run build:offline으로 다시 만들어요.`);
    }
  }
  return { name, path: zipPath, size: measured.size, sha256: measured.sha256, version: match[1] };
}

/**
 * 릴리스 설명(마크다운 — 한국어 뒤에 영어).
 * @param {{ manifest: SourcesManifest, files: CheckedSource[], fetchedOn?: string | null, offlineZip?: OfflineZip | null }} input
 */
export function buildReleaseNotes({ manifest, files, fetchedOn = null, offlineZip = null }) {
  const byGroup = new Map(manifest.groups.map((group) => [group.id, /** @type {CheckedSource[]} */ ([])]));
  for (const file of files) {
    byGroup.get(file.item.group)?.push(file);
  }
  /** 공식 해시가 없어 압축 안의 git 커밋을 확인하고 받은 날 잰 값을 고정한 파일(GitHub가 그때그때 만드는 압축) */
  const byCommit = files.filter((file) => file.item.commit !== undefined);
  const hashName = (basis) => (basis === 'md5' ? 'MD5' : basis === 'sha512' ? 'SHA-512' : 'SHA-256');
  const basisKo = (file) =>
    file.item.commit !== undefined
      ? `git 커밋 ${file.item.commit.slice(0, 12)} 확인, SHA-256은 받은 날 잰 값${fetchedOn ? `(${fetchedOn})` : ''}`
      : file.basis === 'recorded'
        ? `받을 때 잰 값${fetchedOn ? `(${fetchedOn})` : ''}`
        : `공식 ${hashName(file.basis)} — ${file.item.hashSource}`;
  const basisEn = (file) =>
    file.item.commit !== undefined
      ? `git commit ${file.item.commit.slice(0, 12)} checked, SHA-256 measured when downloaded${fetchedOn ? ` (${fetchedOn})` : ''}`
      : file.basis === 'recorded'
        ? `measured when downloaded${fetchedOn ? ` (${fetchedOn})` : ''}`
        : `official ${hashName(file.basis)} - ${file.item.hashSource}`;
  const table = (rows, lang) => {
    const head =
      lang === 'ko'
        ? ['| 파일 | 바이트 | 무엇 | 라이선스 | 확인값 근거 |', '|---|---:|---|---|---|']
        : ['| File | Bytes | What | License | Hash from |', '|---|---:|---|---|---|'];
    return [
      ...head,
      ...rows.map((file) =>
        `| \`${file.item.file}\` | ${bytes(file.size)} | ${cell(lang === 'ko' ? file.item.whatKo : file.item.what)} | ${cell(file.item.license)} | ${cell(lang === 'ko' ? basisKo(file) : basisEn(file))} |`,
      ),
    ];
  };
  /** 크레이트가 많으면 접어 둔다 */
  const groupRows = (groupFiles, lang) => {
    const crates = groupFiles.filter((file) => file.item.file.endsWith('.crate'));
    const others = groupFiles.filter((file) => !file.item.file.endsWith('.crate'));
    const out = [...table(others, lang)];
    if (crates.length > 0) {
      const summary =
        lang === 'ko'
          ? `크레이트 ${crates.length}개 — crates.io(https://static.crates.io/crates/…)에서 받은 그대로, Cargo.lock의 체크섬이 공식 값`
          : `${crates.length} crates - exactly as published on crates.io; the Cargo.lock checksums are the official values`;
      out.push('', `<details><summary>${summary}</summary>`, '', ...table(crates, lang), '', '</details>');
    }
    return out;
  };

  const lines = [
    `[AI 피지컬 컴퓨팅 오픈랩](${SITE_URL})이 고치지 않고 다시 나누는 실행 파일의 **대응 소스 사본**이에요.`,
    '라이선스(LGPL-2.1·GPL-3.0)가 실행 파일을 받은 사람이 그 소스도 받을 수 있게 하라고 해서, 공식 주소에서 받은 파일을 하나도 고치지 않고 올려 두었어요.',
    '고지 전문과 서면 제안(3년 동안 무료로 드림)은 아래 고지 파일에 있어요.',
    '',
  ];
  for (const group of manifest.groups) {
    const groupFiles = byGroup.get(group.id) ?? [];
    if (groupFiles.length === 0) {
      continue;
    }
    lines.push(
      `## ${group.titleKo}`,
      '',
      `- 실행 파일: ${group.binaryKo}`,
      `- 고지: [${group.notice}](${SITE_URL}${group.notice})`,
      `- ${group.whyKo}`,
      '',
      ...groupRows(groupFiles, 'ko'),
      '',
      `여기에 넣지 않은 빌드 도구: ${group.toolsKo}`,
      '',
    );
  }
  lines.push(
    '## 확인하는 법',
    '',
    `- 파일마다의 SHA-256은 \`${SOURCES_SUMS_FILE}\`에 있어요. Windows PowerShell: \`Get-FileHash -Algorithm SHA256 <파일>\`, macOS·Linux: \`sha256sum -c ${SOURCES_SUMS_FILE}\``,
    `- 공식 해시가 있는 파일은 그 값과 같음을 확인했어요(근거는 표의 마지막 칸, 목록은 [${SOURCES_MANIFEST_FILE}](${REPO_URL}/blob/main/${SOURCES_MANIFEST_FILE})).`,
  );
  if (byCommit.length > 0) {
    lines.push(
      `- 공식 해시가 없는 ${byCommit.length}개(GitHub가 그때그때 만드는 압축)는 압축 안에 적힌 git 커밋이 목록과 같은지 확인하고, 받은 날 잰 SHA-256을 목록에 고정했어요.`,
    );
  }
  if (offlineZip) {
    lines.push(
      '',
      `## 오프라인판 ${offlineZip.version}`,
      '',
      `- \`${offlineZip.name}\` — ${bytes(offlineZip.size)}바이트, SHA-256 \`${offlineZip.sha256}\``,
      '- 인터넷이 막히거나 느린 교실에서 쓰는 사이트 전체 묶음이에요. 풀어서 `시작하기.bat`를 두 번 누르면 이 컴퓨터 안에서만 열려요(자세한 것은 zip 안 `읽어보세요.txt`).',
      '- 이 zip이 다시 나누는 OpenCV 휠과 검색 엔진 wasm의 대응 소스가 위의 파일이에요(같은 릴리스).',
    );
  }
  lines.push(
    '',
    '---',
    '',
    '### English',
    '',
    `Corresponding source for the unmodified binaries that [AI Physical Computing Open Lab](${SITE_URL}) redistributes.`,
    'Their licenses (LGPL-2.1, GPL-3.0) ask that whoever receives the binaries can also get the source, so the files below were downloaded from their official addresses and uploaded unchanged.',
    'The full notices and the written offer (source free of charge for three years) are in the notice files.',
    '',
  );
  for (const group of manifest.groups) {
    const groupFiles = byGroup.get(group.id) ?? [];
    if (groupFiles.length === 0) {
      continue;
    }
    lines.push(
      `#### ${group.title}`,
      '',
      `- Binary: ${group.binary}`,
      `- Notice: [${group.notice}](${SITE_URL}${group.notice})`,
      `- ${group.why}`,
      '',
      ...groupRows(groupFiles, 'en'),
      '',
      `Build tools not included: ${group.tools}`,
      '',
    );
  }
  lines.push(`SHA-256 of every file: \`${SOURCES_SUMS_FILE}\`.`);
  if (offlineZip) {
    lines.push(`Offline edition ${offlineZip.version}: \`${offlineZip.name}\` (${bytes(offlineZip.size)} bytes, SHA-256 \`${offlineZip.sha256}\`).`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * 릴리스에 올릴 파일(차례: 대응 소스 → SHA256SUMS.txt → 오프라인판 zip).
 * @param {{ files: CheckedSource[], dir: string, offlineZip?: OfflineZip | null }} input
 * @returns {(ExpectedAsset & { path: string })[]}
 */
export function releaseAssets({ files, dir, offlineZip = null }) {
  const sumsPath = path.join(dir, SOURCES_SUMS_FILE);
  const sums = hashFile(sumsPath);
  return [
    ...files.map((file) => ({ name: file.item.file, path: file.path, size: file.size, sha256: file.sha256 })),
    { name: SOURCES_SUMS_FILE, path: sumsPath, size: sums.size, sha256: sums.sha256 },
    ...(offlineZip ? [{ name: offlineZip.name, path: offlineZip.path, size: offlineZip.size, sha256: offlineZip.sha256 }] : []),
  ];
}

/** 명령 줄 인자 하나(빈칸·따옴표가 있으면 큰따옴표로) */
function quoteArg(value) {
  return /^[A-Za-z0-9._\/:=+-]+$/u.test(value) ? value : `"${value.replace(/(["\\$`])/gu, '\\$1')}"`;
}

/**
 * 운영자 "예" 뒤에 돌릴 명령(Git Bash 기준 — 저장소 뿌리에서). 이 스크립트는 명령을 찍기만 한다.
 * @param {{ tag: string, repo?: string, title: string, notesPath: string, assets: { path: string }[], rootDir: string }} input
 */
export function releaseCommands({ tag, repo = RELEASE_REPO, title, notesPath, assets, rootDir }) {
  const rel = (file) => path.relative(rootDir, file).split(path.sep).join('/');
  const create = [
    'gh release create',
    quoteArg(tag),
    `--repo ${repo}`,
    '--target main',
    '--draft',
    `--title ${quoteArg(title)}`,
    `--notes-file ${quoteArg(rel(notesPath))}`,
    ...assets.map((asset) => quoteArg(rel(asset.path))),
  ].join(' ');
  return {
    create,
    check: 'node scripts/release/release-notes.mjs --check-uploaded',
    publish: `gh release edit ${quoteArg(tag)} --repo ${repo} --draft=false`,
  };
}

/**
 * JSON 파일 읽기 — PowerShell 5.1의 > 로 저장한 UTF-16(BOM FF FE)과 UTF-8 BOM도 받는다.
 * @param {string} file
 */
export function readJsonFile(file) {
  const data = fs.readFileSync(file);
  let text;
  if (data[0] === 0xff && data[1] === 0xfe) {
    text = data.subarray(2).toString('utf16le');
  } else {
    text = data.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) {
      text = text.slice(1);
    }
  }
  return JSON.parse(text);
}

/**
 * gh api …/releases 결과(배열이나 릴리스 하나)에서 태그의 릴리스를 찾는다.
 * @param {unknown} json
 * @param {string} tag
 */
export function findRelease(json, tag) {
  const list = Array.isArray(json) ? json : [json];
  return list.find((release) => release && typeof release === 'object' && /** @type {{ tag_name?: string }} */ (release).tag_name === tag) ?? null;
}

/**
 * 올라간 파일을 올려야 할 파일과 대조한다: 이름·크기, 그리고 GitHub가 적는 digest("sha256:…")가 있으면 SHA-256까지.
 * @param {{ release: any, expected: ExpectedAsset[] }} input
 * @returns {{ ok: boolean, lines: string[], problems: string[] }}
 */
export function compareUploadedAssets({ release, expected }) {
  /** @type {string[]} */
  const lines = [];
  /** @type {string[]} */
  const problems = [];
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const byName = new Map(assets.map((asset) => [asset.name, asset]));
  let withoutDigest = 0;
  for (const want of expected) {
    const got = byName.get(want.name);
    if (!got) {
      problems.push(`${want.name}이(가) 릴리스에 없어요.`);
      lines.push(`MISSING ${want.name}`);
      continue;
    }
    const digest = typeof got.digest === 'string' && got.digest.startsWith('sha256:') ? got.digest.slice('sha256:'.length).toLowerCase() : null;
    if (got.size !== want.size) {
      problems.push(`${want.name}의 크기가 ${bytes(got.size)}바이트예요(폴더 ${bytes(want.size)}바이트).`);
      lines.push(`FAIL    ${want.name} size ${got.size} != ${want.size}`);
    } else if (digest !== null && digest !== want.sha256) {
      problems.push(`${want.name}의 SHA-256(digest)이 폴더의 파일과 달라요.`);
      lines.push(`FAIL    ${want.name} sha256 ${digest} != ${want.sha256}`);
    } else {
      if (digest === null) {
        withoutDigest += 1;
      }
      lines.push(`PASS    ${want.name} ${want.size} ${digest === null ? '(size only - no digest)' : want.sha256}`);
    }
    if (got.state !== undefined && got.state !== 'uploaded') {
      problems.push(`${want.name}이(가) 아직 다 올라가지 않았어요(state ${got.state}).`);
    }
  }
  const wanted = new Set(expected.map((asset) => asset.name));
  for (const asset of assets) {
    if (!wanted.has(asset.name)) {
      problems.push(`릴리스에 목록 밖 파일이 있어요: ${asset.name}`);
      lines.push(`EXTRA   ${asset.name}`);
    }
  }
  if (withoutDigest > 0) {
    lines.push(`note: ${withoutDigest} asset(s) had no digest field - only the size was compared.`);
  }
  return { ok: problems.length === 0, lines, problems };
}

function option(argv, name) {
  const index = argv.indexOf(name);
  if (index < 0) {
    return null;
  }
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} 뒤에 값을 적어요.`);
  }
  return value;
}

/** fetch-result.json의 끝난 날(YYYY-MM-DD) — 없으면 null */
function fetchedOnOf(dir) {
  const file = path.join(dir, 'fetch-result.json');
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    const finishedAt = readJsonFile(file)?.finishedAt;
    return typeof finishedAt === 'string' ? finishedAt.slice(0, 10) : null;
  } catch {
    return null;
  }
}

async function main(argv) {
  const rootDir = fileURLToPath(new URL('../..', import.meta.url));
  const dir = path.resolve(process.cwd(), option(argv, '--dir') ?? SOURCES_DEFAULT_DIR);
  const zipArg = option(argv, '--offline-zip');
  // --manifest는 시험용(tests/unit/release/release-notes.test.ts의 가짜 목록) — 보통은 저장소의 목록 한 곳
  const manifestArg = option(argv, '--manifest');
  const { manifest, problems } = readSourcesManifest(rootDir, manifestArg ? path.resolve(process.cwd(), manifestArg) : SOURCES_MANIFEST_FILE);
  if (!manifest) {
    throw new Error(`대응 소스 목록에 문제가 있어요:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
  }
  const tag = option(argv, '--tag') ?? manifest.releaseTag;
  const repo = option(argv, '--repo') ?? RELEASE_REPO;
  const unpinned = unpinnedSourceItems(manifest);
  if (unpinned.length > 0) {
    console.error(
      `목록에 아직 고정하지 않은 파일이 ${unpinned.length}개 있어요(${unpinned.map((item) => item.file).join(', ')}) — 릴리스를 준비하지 않아요.\n` +
        '  scripts/release/README.md 3절 2번대로, fetch-sources.ps1이 커밋을 확인하고 잰 SHA-256(fetch-result.json)을 목록의 sha256 칸에 고정한 뒤 다시 돌려요.',
    );
    return 1;
  }
  const result = checkSourcesFolder({ folder: dir, manifest });
  for (const note of result.notes) {
    console.log(`참고 — ${note}`);
  }
  if (!result.ok) {
    console.error(`받은 폴더에 문제가 ${result.problems.length}건 있어요(릴리스를 준비하지 않아요):`);
    for (const problem of result.problems) {
      console.error(`  - ${problem}`);
    }
    console.error('  운영자가 scripts/release/fetch-sources.ps1을 다시 돌려야 해요(scripts/release/README.md).');
    return 1;
  }
  const offlineZip = zipArg ? readOfflineZip(path.resolve(process.cwd(), zipArg)) : null;
  const checkOnly = argv.includes('--check-uploaded');
  if (!checkOnly) {
    // 릴리스에 올리는 SHA256SUMS.txt는 목록의 파일만(차례도 목록 차례) — 받은 폴더에 목록 밖 줄이 남아 있어도 올라가지 않게.
    // 확인을 거친 값만 쓰므로 fetch-sources.ps1이 쓴 내용과 같으면 그대로다.
    const sumsPath = path.join(dir, SOURCES_SUMS_FILE);
    const normalized = sourcesSha256SumsText(result.files);
    if (fs.readFileSync(sumsPath, 'utf8') !== normalized) {
      fs.writeFileSync(sumsPath, normalized, 'utf8');
      console.log(`${SOURCES_SUMS_FILE}를 목록의 파일 ${result.files.length}개로만 다시 썼어요.`);
    }
  }
  const assets = releaseAssets({ files: result.files, dir, offlineZip });

  if (checkOnly) {
    const jsonFile = option(argv, '--uploaded-json');
    let json;
    if (jsonFile) {
      json = readJsonFile(path.resolve(process.cwd(), jsonFile));
    } else {
      const gh = option(argv, '--gh') ?? 'gh';
      const reply = spawnSync(gh, ['api', `repos/${repo}/releases?per_page=100`], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
      if (reply.status !== 0) {
        throw new Error(`gh api가 실패했어요: ${reply.error?.message ?? reply.stderr}`);
      }
      json = JSON.parse(reply.stdout);
    }
    const release = findRelease(json, tag);
    if (!release) {
      console.error(`태그 ${tag}의 릴리스(초안 포함)를 찾지 못했어요.`);
      return 1;
    }
    const compared = compareUploadedAssets({ release, expected: assets });
    for (const line of compared.lines) {
      console.log(line);
    }
    if (!compared.ok) {
      console.error(`올라간 파일에 문제가 ${compared.problems.length}건 있어요 — 공개하지 말고 고쳐요:`);
      for (const problem of compared.problems) {
        console.error(`  - ${problem}`);
      }
      return 1;
    }
    console.log(`모두 맞아요(${assets.length}개, 릴리스 ${release.draft ? '초안' : '공개됨'}). 공개: gh release edit ${tag} --repo ${repo} --draft=false`);
    return 0;
  }

  const notesPath = path.join(dir, NOTES_FILE);
  const notes = buildReleaseNotes({ manifest, files: result.files, fetchedOn: fetchedOnOf(dir), offlineZip });
  fs.writeFileSync(notesPath, notes, 'utf8');
  const title = offlineZip
    ? `대응 소스 사본과 오프라인판 ${offlineZip.version} (Corresponding source and offline edition)`
    : '대응 소스 사본 — FFmpeg 4.4.1·검색 엔진 크레이트 (Corresponding source)';
  const commands = releaseCommands({ tag, repo, title, notesPath, assets, rootDir });
  const total = assets.reduce((sum, asset) => sum + asset.size, 0);
  console.log(`릴리스 설명: ${path.relative(rootDir, notesPath).split(path.sep).join('/')}`);
  console.log(`올릴 파일 ${assets.length}개, 모두 ${(total / (1024 * 1024)).toFixed(1)}MB (태그 ${tag})`);
  console.log('');
  console.log('운영자가 "예"라고 한 뒤에만 아래를 차례로 돌려요(저장소 뿌리, Git Bash — 아직 아무것도 올리지 않았어요):');
  console.log(`  1) ${commands.create}`);
  console.log(`  2) ${commands.check}${offlineZip ? ` --offline-zip ${quoteArg(path.relative(rootDir, offlineZip.path).split(path.sep).join('/'))}` : ''}`);
  console.log(`  3) ${commands.publish}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(`[대응 소스 릴리스] 실패 — ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    },
  );
}
