// 출처 검사 본체(PLAN §8.1 P1-04 ②). scripts/check-sources.mjs와 단위 테스트가 부른다.
// 결과는 { ok, errors, warnings, summary }로 돌려주고, 화면 출력과 종료 코드는 부르는 쪽이 정한다.

import fs from 'node:fs';
import path from 'node:path';
import { BUILD_OUTPUT_DIR, BUNDLE_LICENSE_FILE } from './bundle-license.mjs';
import { REGISTRY_FILE, classifyFiles, findEntryByPackage, findMatchingEntries, parseRegistry } from './sources-registry.mjs';

/** 파일을 하나하나 등록 검사하는 폴더(배포되거나 사이트가 불러오는 자료가 들어가는 곳, PLAN §9.2) */
export const CHECKED_ROOTS = Object.freeze(['public', 'examples', 'content']);

/**
 * 등록 검사에서 빼는 파일 이름.
 * .gitkeep은 빈 폴더를 git에 남기는 표시이고, 나머지는 운영체제가 만드는 파일이다(.gitignore로 저장소에 안 올라간다).
 */
export const IGNORED_FILE_NAMES = new Set(['.gitkeep', '.DS_Store', 'Thumbs.db', 'desktop.ini']);

/**
 * 파일 머리(앞 2KB)에 다른 저작자의 표기가 있는지 볼 텍스트 파일 확장자.
 * sources.yaml의 넓은 항목(examples/** 등)은 폴더 약속(third-party/)에만 기대므로, 운영자·사이트 항목에 걸린 파일에
 * 저작권·라이선스 표기가 있으면 "다른 저작자의 파일이 third-party/ 밖에 있는 것 아닌지" 참고로 알린다(2026-09-16 검토 반영).
 */
const MARKER_SCAN_EXTENSIONS = new Set(['.py', '.js', '.mjs', '.cjs', '.ts', '.css', '.md', '.txt', '.html', '.svg', '.json', '.yaml', '.yml']);
const AUTHORSHIP_MARKER = /copyright|\(c\)|©|\blicen[cs]e\b|spdx-license-identifier|@author\b|\bauthor:|all rights reserved/iu;
const MARKER_SCAN_BYTES = 2048;
/**
 * 고지 파일(sources.yaml의 notice)이 아직 다 쓰이지 않았다는 표시. 2026-09-18 검토 반영:
 * 펌웨어 고지가 "이 고지는 초안입니다 … 파일을 올리기 전에 채웁니다"라고 적힌 채 1.79MB 바이너리와 함께 배포되고 있었다.
 */
const DRAFT_NOTICE_PATTERN = /이 고지는 초안|\[상태\][^\n]*초안|\bTODO\b|\bFIXME\b/u;

/**
 * @typedef {object} CheckResult
 * @property {boolean} ok 통과했는지
 * @property {string[]} errors 문제 묶음(여러 줄 한국어 설명)
 * @property {string[]} warnings 빌드를 멈추지 않는 참고 사항
 * @property {string} summary 통과했을 때의 한 줄 요약
 */

/**
 * @param {string} title
 * @param {string[]} lines
 * @param {string} [fix]
 * @returns {string}
 */
function formatBlock(title, lines, fix) {
  return [title, ...lines.map((line) => `  ${line}`), ...(fix ? [`  고치는 법: ${fix}`] : [])].join('\n');
}

/**
 * @param {string[]} errors
 * @param {string[]} [warnings]
 * @returns {CheckResult}
 */
function failed(errors, warnings = []) {
  return { ok: false, errors, warnings, summary: '' };
}

/**
 * @param {string} absoluteDir
 * @param {string} relativeDir
 * @param {string[]} files
 */
function collectFiles(absoluteDir, relativeDir, files) {
  for (const dirent of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = `${relativeDir}/${dirent.name}`.normalize('NFC');
    if (dirent.isDirectory()) {
      collectFiles(path.join(absoluteDir, dirent.name), relativePath, files);
      continue;
    }
    if (IGNORED_FILE_NAMES.has(dirent.name)) {
      continue;
    }
    // 보통 파일과 링크는 빌드 때 dist/로 복사될 수 있으니 모두 등록 검사한다.
    if (dirent.isFile() || dirent.isSymbolicLink()) {
      files.push(relativePath);
    }
  }
}

/**
 * 등록 검사 대상 파일 목록(저장소 뿌리 기준, / 구분, 정렬).
 * git에 올리지 않은 파일도 빌드에 들어가므로 git 목록이 아니라 실제 폴더를 읽는다.
 * @param {string} rootDir
 * @returns {string[]}
 */
export function listCheckedFiles(rootDir) {
  /** @type {string[]} */
  const files = [];
  for (const root of CHECKED_ROOTS) {
    const absoluteRoot = path.join(rootDir, root);
    if (fs.existsSync(absoluteRoot) && fs.statSync(absoluteRoot).isDirectory()) {
      collectFiles(absoluteRoot, root, files);
    }
  }
  return files.sort();
}

/**
 * sources.yaml을 읽어 검사한다.
 * @param {string} rootDir
 */
export function loadRegistry(rootDir) {
  const registryPath = path.join(rootDir, REGISTRY_FILE);
  if (!fs.existsSync(registryPath)) {
    return { entries: [], errors: [`${REGISTRY_FILE} 파일이 없어요. 저장소 뿌리에 출처 등록부를 만들어요.`] };
  }
  return parseRegistry(fs.readFileSync(registryPath, 'utf8'));
}

/**
 * package.json의 dependencies(배포 번들에 들어갈 수 있는 패키지) 이름 목록.
 * @param {string} rootDir
 * @returns {{ names: string[], error?: string }}
 */
function readDependencyNames(rootDir) {
  const packagePath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return { names: [] };
  }
  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return { names: Object.keys(packageJson.dependencies ?? {}).sort() };
  } catch (error) {
    return { names: [], error: `package.json을 읽지 못했어요: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * @param {string[]} registryErrors
 * @returns {string}
 */
function formatRegistryErrors(registryErrors) {
  return formatBlock(
    `${REGISTRY_FILE} 형식 오류 ${registryErrors.length}건`,
    registryErrors.map((error) => `- ${error}`),
    `${REGISTRY_FILE} 맨 위의 필드 설명을 보고 고쳐요.`,
  );
}

/**
 * 빌드 전 검사: public/·examples/·content/의 파일과 package.json dependencies가 등록됐는지,
 * 한 파일이 저작자가 다른 두 항목에 걸리지 않았는지 본다.
 * @param {{ rootDir: string }} options
 * @returns {CheckResult}
 */
export function checkSourceFiles({ rootDir }) {
  const registry = loadRegistry(rootDir);
  if (registry.errors.length > 0) {
    return failed([formatRegistryErrors(registry.errors)]);
  }
  const { entries } = registry;
  /** @type {string[]} */
  const errors = [];

  const missingNotices = entries.filter((entry) => entry.notice && !fs.existsSync(path.join(rootDir, entry.notice)));
  if (missingNotices.length > 0) {
    errors.push(
      formatBlock(
        `고지 파일(notice)을 찾지 못한 항목 ${missingNotices.length}개`,
        missingNotices.map((entry) => `- "${entry.name}": ${entry.notice}`),
        '파일을 그 경로에 두거나 notice 경로를 고쳐요.',
      ),
    );
  }

  /*
   * 고지 파일이 스스로 "초안"이라고 적은 채 배포되는 일을 막는다(2026-09-18 검토 반영).
   * 펌웨어 고지가 "파일을 올리기 전에 채웁니다"라고 적힌 채 1.79MB 바이너리와 함께 실사이트에 나가 있었다 —
   * 프로젝트가 스스로 세운 관문을 통과하지 못한 상태였고, /credits/로 들어온 교사가 그 문장을 먼저 읽었다.
   */
  const draftNotices = entries.filter((entry) => {
    if (!entry.notice) {
      return false;
    }
    const file = path.join(rootDir, entry.notice);
    if (!fs.existsSync(file)) {
      return false; // 위에서 이미 알렸다
    }
    return DRAFT_NOTICE_PATTERN.test(fs.readFileSync(file, 'utf8'));
  });
  if (draftNotices.length > 0) {
    errors.push(
      formatBlock(
        `아직 다 쓰지 않은(초안) 고지 파일 ${draftNotices.length}개`,
        draftNotices.map((entry) => `- "${entry.name}": ${entry.notice}`),
        '고지 전문을 채운 뒤 "초안"·TODO 표시를 지워요. 다 채우기 전에는 그 파일을 배포하지 않아요.',
      ),
    );
  }

  const files = listCheckedFiles(rootDir);
  const { unregistered, conflicts } = classifyFiles(files, entries);
  if (unregistered.length > 0) {
    errors.push(
      formatBlock(
        `등록되지 않은 파일 ${unregistered.length}개 — ${REGISTRY_FILE}에 이 파일을 포함하는 항목이 없어요.`,
        unregistered.map((file) => `- ${file}`),
        `외부 자료라면 ${REGISTRY_FILE}에 항목(name·category·author·license·url·used_in·paths·fetched)을 새로 만들어요. ` +
          '사이트가 직접 그린 그림은 public/images/site/에, 교과서·교안에서 옮긴 그림은 public/images/lessons/에 두면 이미 있는 항목에 걸려요.',
      ),
    );
  }
  if (conflicts.length > 0) {
    errors.push(
      formatBlock(
        `저작자가 다른 두 항목에 동시에 걸린 파일 ${conflicts.length}개(중복 매칭) — 누구의 자료인지 하나로 정해야 해요.`,
        conflicts.flatMap(({ file, matches }) => [
          `- ${file}`,
          ...matches.map(({ entry, pattern }) => `    · "${entry.name}"(저작자: ${entry.author}, 패턴: ${pattern})`),
        ]),
        '넓은 항목의 exclude_paths에 이 파일을 빼는 패턴을 적거나, 다른 저작자의 파일은 third-party/ 폴더로 옮겨요.',
      ),
    );
  }

  const dependencies = readDependencyNames(rootDir);
  if (dependencies.error) {
    errors.push(dependencies.error);
  }
  const unregisteredPackages = dependencies.names.filter((name) => !findEntryByPackage(name, entries));
  if (unregisteredPackages.length > 0) {
    errors.push(
      formatBlock(
        `등록되지 않은 배포용 npm 패키지 ${unregisteredPackages.length}개 — package.json의 dependencies에 있지만 ${REGISTRY_FILE}의 npm 목록에 없어요.`,
        unregisteredPackages.map((name) => `- ${name}`),
        `${REGISTRY_FILE} 항목의 npm 목록에 패키지 이름을 적어요. 빌드·검사에만 쓰는 도구라면 devDependencies로 옮겨요(PLAN §9.2).`,
      ),
    );
  }

  if (errors.length > 0) {
    return failed(errors);
  }
  const warnings = findAuthorshipMarkers(rootDir, files, entries);
  const packageText = dependencies.names.length > 0 ? `(${dependencies.names.join(', ')})` : '';
  return {
    ok: true,
    errors: [],
    warnings,
    summary:
      `통과 — 파일 ${files.length}개(${CHECKED_ROOTS.join('·')}), 등록부 항목 ${entries.length}개, ` +
      `배포용 npm 패키지 ${dependencies.names.length}개${packageText}`,
  };
}

/**
 * 운영자·사이트 자체 항목(operator·self)에만 걸린 텍스트 파일의 머리에 저작권·라이선스 표기가 있으면 참고로 알린다.
 * third-party/ 폴더의 파일과, library·third_party 항목에 따로 등록된 파일은 보지 않는다. 빌드는 멈추지 않는다.
 * @param {string} rootDir
 * @param {string[]} files
 * @param {import('./sources-registry.mjs').SourceEntry[]} entries
 * @returns {string[]}
 */
export function findAuthorshipMarkers(rootDir, files, entries) {
  /** @type {string[]} */
  const warnings = [];
  for (const file of files) {
    if (!MARKER_SCAN_EXTENSIONS.has(path.posix.extname(file).toLowerCase()) || file.split('/').includes('third-party')) {
      continue;
    }
    const matches = findMatchingEntries(file, entries);
    if (matches.length === 0 || !matches.every(({ entry }) => entry.category === 'operator' || entry.category === 'self')) {
      continue;
    }
    /** @type {string} */
    let head;
    try {
      const handle = fs.openSync(path.join(rootDir, ...file.split('/')), 'r');
      try {
        const buffer = Buffer.alloc(MARKER_SCAN_BYTES);
        const bytesRead = fs.readSync(handle, buffer, 0, MARKER_SCAN_BYTES, 0);
        head = buffer.subarray(0, bytesRead).toString('utf8');
      } finally {
        fs.closeSync(handle);
      }
    } catch {
      continue;
    }
    const marker = AUTHORSHIP_MARKER.exec(head);
    if (marker) {
      warnings.push(
        `${file}의 앞부분에 저작권·라이선스 표기("${marker[0]}")가 있어요. 다른 저작자의 파일이면 그 폴더의 third-party/ 폴더로 옮기고 ` +
          `${REGISTRY_FILE}에 항목을 따로 만들어요(PLAN §8.1 P1-04). 운영자·사이트가 쓴 표기라면 그대로 둬도 돼요.`,
      );
    }
  }
  return warnings;
}

/**
 * 빌드 뒤 검사: 배포 번들에 실제로 들어간 npm 패키지(전이 의존성 포함)가 등록됐는지 본다.
 * 목록 파일은 읽은 뒤 지워서 배포되지 않게 한다.
 * @param {{ rootDir: string, outputDir?: string, removeListFile?: boolean }} options
 * @returns {CheckResult}
 */
export function checkBundleDependencies({ rootDir, outputDir = BUILD_OUTPUT_DIR, removeListFile = true }) {
  const displayPath = `${outputDir}/${BUNDLE_LICENSE_FILE}`;
  const listPath = path.join(rootDir, outputDir, BUNDLE_LICENSE_FILE);
  if (!fs.existsSync(listPath)) {
    return failed([
      formatBlock(`배포 번들 의존성 목록(${displayPath})이 없어요.`, [
        '- astro.config.mjs의 vite.plugins에 clientBundleLicensePlugin()이 있는지 확인해요.',
        '- 이 검사는 빌드 뒤에 돌아요. npm run build로 빌드했는지 확인해요.',
      ]),
    ]);
  }
  const listText = fs.readFileSync(listPath, 'utf8');
  if (removeListFile) {
    fs.rmSync(listPath, { force: true });
  }

  /** @type {unknown} */
  let bundled;
  try {
    bundled = JSON.parse(listText);
  } catch (error) {
    return failed([`${displayPath}을(를) 읽지 못했어요: ${error instanceof Error ? error.message : String(error)}`]);
  }
  const isValidList =
    Array.isArray(bundled) &&
    bundled.every(
      (item) => typeof item === 'object' && item !== null && typeof item.name === 'string' && typeof item.version === 'string',
    );
  if (!isValidList) {
    return failed([`${displayPath}의 모양이 예상과 달라요. Vite의 build.license JSON 형식이 바뀌었는지 확인해요.`]);
  }
  /** @type {{ name: string, version: string, identifier?: string }[]} */
  const packages = /** @type {any} */ (bundled);

  const registry = loadRegistry(rootDir);
  if (registry.errors.length > 0) {
    return failed([formatRegistryErrors(registry.errors)]);
  }

  /** @type {string[]} */
  const unregistered = [];
  /** @type {string[]} */
  const warnings = [];
  for (const bundledPackage of packages) {
    const label = `${bundledPackage.name}@${bundledPackage.version}${bundledPackage.identifier ? ` (${bundledPackage.identifier})` : ''}`;
    const entry = findEntryByPackage(bundledPackage.name, registry.entries);
    if (!entry) {
      unregistered.push(`- ${label}`);
      continue;
    }
    if (bundledPackage.identifier && !entry.license.toLowerCase().includes(bundledPackage.identifier.toLowerCase())) {
      warnings.push(
        `${label}의 package.json 라이선스가 "${entry.name}" 항목의 license("${entry.license}")에 보이지 않아요. 등록부를 확인해 주세요.`,
      );
    }
  }
  if (unregistered.length > 0) {
    return failed(
      [
        formatBlock(
          `배포 번들에 들어갔지만 등록되지 않은 npm 패키지 ${unregistered.length}개(${displayPath} 기준, 전이 의존성 포함)`,
          unregistered,
          `${REGISTRY_FILE} 항목의 npm 목록에 패키지 이름을 적어요. 저작자가 다른 패키지는 항목을 따로 만들어요.`,
        ),
      ],
      warnings,
    );
  }
  const names = packages.map((item) => item.name);
  return {
    ok: true,
    errors: [],
    warnings,
    summary: `번들 의존성 통과 — 배포 번들에 들어간 npm 패키지 ${names.length}개${names.length > 0 ? `(${names.join(', ')})` : ''}`,
  };
}
