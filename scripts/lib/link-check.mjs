// 사이트 안 링크 검사(PLAN §8.1 P1-05·P1-09·P1-10) — 빌드 결과(dist/)의 HTML·CSS가 가리키는 사이트 안 주소가 실제로 있는지 본다.
//
// 읽는 주소
// - HTML: a·area·link의 href, script·img·iframe·audio·video·source·track·embed의 src, img·source의 srcset,
//   video의 poster, object의 data, form의 action, SVG use·image의 href(xlink:href),
//   사이트 주소로 시작하는 공유 미리보기 meta(og:url·og:image·twitter:image)의 content
// - CSS: url(…)과 @import
// - #위치: 가리키는 페이지에 그 id(또는 a 요소의 name)가 있는지
//
// 문제로 보는 것(kind)
// - base-missing       사이트 뿌리 주소(/credits/ 등)인데 base(/ai-physical-computing/)가 빠졌다 → GitHub Pages에서 404
// - not-found          가리키는 파일·페이지가 dist/에 없다
// - no-trailing-slash  페이지 주소 끝에 /가 없다(astro.config.mjs의 trailingSlash 'always' 정책, GitHub Pages가 301로 한 번 더 이동시킴)
// - anchor-not-found   #위치가 그 페이지에 없다
// - relative-in-404    404 페이지의 상대 주소(404 페이지는 어느 깊이의 주소에서도 보이므로 상대 주소가 깨진다)
// - example-not-found  실습실 주소의 ?example=<examples/ 아래 경로> 값이 실제 예제 파일이 아니다(실습실이 조용히 다른 예제를 연다)
// 건너뛰는 것: 다른 사이트 주소, mailto:·tel:·javascript:·data:·blob:, 자바스크립트가 실행 중에 만드는 주소(검색 결과 등),
// <script>·<style> 안의 글자와 HTML 주석
//
// Node.js가 직접 읽으므로(scripts/check-links.mjs) JavaScript(JSDoc 타입 표기)로 쓰고 외부 패키지를 쓰지 않는다.

import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {object} SiteAddress
 * @property {string} origin 사이트 도메인(예: https://songdocomputerpark-lang.github.io)
 * @property {string} base   하위 경로, 끝에 / 없음(예: /ai-physical-computing)
 */

/**
 * @typedef {'base-missing' | 'not-found' | 'no-trailing-slash' | 'anchor-not-found' | 'relative-in-404' | 'example-not-found'} LinkProblemKind
 */

/**
 * @typedef {object} LinkProblem
 * @property {string} file   문제가 있는 파일(dist/ 기준, / 구분)
 * @property {string} ref    파일에 적힌 주소 그대로
 * @property {LinkProblemKind} kind
 * @property {string} [target] 찾아본 파일(dist/ 기준)
 */

/**
 * @typedef {object} LinkReport
 * @property {number} pages        검사한 HTML 파일 수
 * @property {number} stylesheets  검사한 CSS 파일 수
 * @property {number} internal     확인한 사이트 안 주소 수(같은 주소도 적힌 곳마다 센다)
 * @property {number} anchors      그 가운데 #위치까지 확인한 수
 * @property {number} examples     실습실 주소의 ?example= 값까지 확인한 수
 * @property {number} external     건너뛴 다른 사이트 주소 수
 * @property {LinkProblem[]} problems
 */

/** 404 페이지로 쓰이는 파일(GitHub Pages는 사이트 뿌리의 404.html을 없는 주소마다 보여 준다) */
const NOT_FOUND_PAGE = '404.html';

/** 요소별로 주소가 들어가는 속성 */
const URL_ATTRIBUTES = new Map([
  ['a', ['href']],
  ['area', ['href']],
  ['link', ['href']],
  ['script', ['src']],
  ['img', ['src', 'srcset']],
  ['source', ['src', 'srcset']],
  ['iframe', ['src']],
  ['audio', ['src']],
  ['video', ['src', 'poster']],
  ['track', ['src']],
  ['embed', ['src']],
  ['object', ['data']],
  ['form', ['action']],
  ['use', ['href', 'xlink:href']],
  ['image', ['href', 'xlink:href']],
]);

/** 사이트 주소를 content에 적는 공유 미리보기 meta */
const URL_META_PROPERTIES = new Set(['og:url', 'og:image', 'twitter:image']);

const TAG_PATTERN = /<([a-z][\w:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/giu;
const ATTRIBUTE_PATTERN = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
const SKIPPED_SCHEMES = /^(?:mailto|tel|sms|javascript|data|blob|about):/iu;
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/iu;
const NAMED_CHARACTER_REFERENCES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * dist/ 안 파일을 모두 모은다(/ 구분 상대 경로).
 * @param {string} rootDir
 * @returns {string[]}
 */
export function listFiles(rootDir) {
  /** @type {string[]} */
  const files = [];
  /** @param {string} directory */
  const walk = (directory) => {
    for (const dirent of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, dirent.name);
      if (dirent.isDirectory()) {
        walk(full);
      } else if (dirent.isFile()) {
        files.push(path.relative(rootDir, full).split(path.sep).join('/'));
      }
    }
  };
  walk(rootDir);
  return files.sort();
}

/**
 * package.json의 homepage(https://…/ai-physical-computing/)에서 도메인과 base를 읽는다.
 * src/config/site.ts와 같은 값인지는 단위 테스트(tests/unit/link-check.test.ts)가 확인한다.
 * @param {string} homepage
 * @returns {SiteAddress}
 */
export function siteFromHomepage(homepage) {
  const url = new URL(homepage);
  return { origin: url.origin, base: url.pathname.replace(/\/+$/u, '') };
}

/**
 * @param {string} text
 * @returns {string}
 */
function decodeCharacterReferences(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (whole, body) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_CHARACTER_REFERENCES[/** @type {keyof typeof NAMED_CHARACTER_REFERENCES} */ (body.toLowerCase())] ?? whole;
  });
}

/**
 * <script>·<style>·<textarea>·<title> 안의 글자와 HTML 주석을 지운다(여는 태그의 속성은 남긴다).
 * @param {string} html
 * @returns {string}
 */
function stripNonMarkup(html) {
  return html
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/(<(script|style|textarea|title)\b[^>]*>)[\s\S]*?(<\/\2\s*>)/giu, '$1$3');
}

/**
 * @param {string} attributeText
 * @returns {Map<string, string>}
 */
function parseAttributes(attributeText) {
  /** @type {Map<string, string>} */
  const attributes = new Map();
  for (const match of attributeText.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1].toLowerCase();
    if (!attributes.has(name)) {
      attributes.set(name, decodeCharacterReferences(match[2] ?? match[3] ?? match[4] ?? ''));
    }
  }
  return attributes;
}

/**
 * srcset 값에서 주소만 꺼낸다. 예: "a.webp 1x, b.webp 2x" → ["a.webp", "b.webp"]
 * @param {string} value
 * @returns {string[]}
 */
function splitSrcset(value) {
  return value
    .split(',')
    .map((candidate) => candidate.trim().split(/\s+/u)[0] ?? '')
    .filter((candidate) => candidate !== '');
}

/**
 * HTML에서 주소와 id를 읽는다.
 * @param {string} html
 * @param {SiteAddress} site
 * @returns {{ refs: string[], ids: Set<string> }}
 */
export function extractHtmlReferences(html, site) {
  /** @type {string[]} */
  const refs = [];
  /** @type {Set<string>} */
  const ids = new Set();
  for (const match of stripNonMarkup(html).matchAll(TAG_PATTERN)) {
    const tag = match[1].toLowerCase();
    const attributes = parseAttributes(match[2] ?? '');
    const id = attributes.get('id');
    if (id) {
      ids.add(id);
    }
    if (tag === 'a' && attributes.get('name')) {
      ids.add(/** @type {string} */ (attributes.get('name')));
    }
    if (tag === 'meta') {
      const property = (attributes.get('property') ?? attributes.get('name') ?? '').toLowerCase();
      const content = attributes.get('content') ?? '';
      if (URL_META_PROPERTIES.has(property) && content.startsWith(`${site.origin}/`)) {
        refs.push(content);
      }
      continue;
    }
    for (const attribute of URL_ATTRIBUTES.get(tag) ?? []) {
      const value = attributes.get(attribute);
      if (value === undefined) {
        continue;
      }
      if (attribute === 'srcset') {
        refs.push(...splitSrcset(value));
      } else {
        refs.push(value);
      }
    }
  }
  return { refs, ids };
}

/**
 * CSS에서 url(…)과 @import 주소를 읽는다.
 * @param {string} css
 * @returns {string[]}
 */
export function extractCssReferences(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  /** @type {string[]} */
  const refs = [];
  for (const match of withoutComments.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^'")\s]+))\s*\)/giu)) {
    refs.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  for (const match of withoutComments.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/giu)) {
    refs.push(match[1] ?? match[2] ?? '');
  }
  return refs.filter((ref) => ref.trim() !== '');
}

/**
 * dist/ 안 파일이 사이트에서 열리는 주소
 * @param {string} file dist/ 기준 경로
 * @param {SiteAddress} site
 * @returns {string}
 */
export function publicUrlOf(file, site) {
  return `${site.origin}${site.base}/${file}`;
}

/**
 * @param {string} value
 * @returns {string}
 */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * dist/의 HTML·CSS를 모두 읽어 사이트 안 주소를 검사한다.
 * @param {string} distDir
 * @param {SiteAddress} site
 * @returns {LinkReport}
 */
export function checkLinks(distDir, site, options = {}) {
  // ?example= 값이 가리키는 예제 파일은 dist/에 복사되지 않으므로 저장소의 examples/ 폴더에서 찾는다.
  const examplesDir = options.examplesDir ?? path.join(distDir, '..', 'examples');
  const files = listFiles(distDir);
  const fileSet = new Set(files);
  /** @type {Map<string, Set<string>>} */
  const idCache = new Map();
  /** @type {LinkReport} */
  const report = { pages: 0, stylesheets: 0, internal: 0, anchors: 0, examples: 0, external: 0, problems: [] };
  const basePrefix = `${site.base}/`;

  /** @param {string} file */
  const idsOf = (file) => {
    let ids = idCache.get(file);
    if (!ids) {
      ids = extractHtmlReferences(fs.readFileSync(path.join(distDir, ...file.split('/')), 'utf8'), site).ids;
      idCache.set(file, ids);
    }
    return ids;
  };

  /**
   * @param {string} file
   * @param {string} ref
   */
  const checkReference = (file, ref) => {
    const value = ref.trim();
    if (value === '' || value === '#' || SKIPPED_SCHEMES.test(value)) {
      return;
    }
    if (file === NOT_FOUND_PAGE && !value.startsWith('/') && !value.startsWith('#') && !HAS_SCHEME.test(value)) {
      report.problems.push({ file, ref, kind: 'relative-in-404' });
      return;
    }
    /** @type {URL} */
    let url;
    try {
      url = new URL(value, publicUrlOf(file, site));
    } catch {
      report.problems.push({ file, ref, kind: 'not-found' });
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return;
    }
    if (url.origin !== site.origin) {
      report.external += 1;
      return;
    }
    report.internal += 1;
    if (url.pathname === site.base) {
      report.problems.push({ file, ref, kind: 'no-trailing-slash', target: 'index.html' });
      return;
    }
    if (!url.pathname.startsWith(basePrefix)) {
      report.problems.push({ file, ref, kind: 'base-missing' });
      return;
    }

    const sitePath = safeDecode(url.pathname.slice(basePrefix.length));
    /** @type {string} */
    let target;
    if (sitePath === '' || sitePath.endsWith('/')) {
      target = `${sitePath}index.html`;
      if (!fileSet.has(target)) {
        report.problems.push({ file, ref, kind: 'not-found', target });
        return;
      }
    } else if (fileSet.has(sitePath)) {
      target = sitePath;
    } else if (fileSet.has(`${sitePath}/index.html`)) {
      report.problems.push({ file, ref, kind: 'no-trailing-slash', target: `${sitePath}/index.html` });
      return;
    } else {
      report.problems.push({ file, ref, kind: 'not-found', target: sitePath });
      return;
    }

    // 실습실 주소의 ?example=<examples/ 아래 경로>는 차시 md가 손으로 적는 값이라, 예제 파일 이름이 바뀌면
    // 링크는 200인데 학생에게 다른 예제가 열린다(lab-shell.ts는 못 찾으면 첫 예제로 대신 연다). 빌드 때 여기서 잡는다.
    const exampleRef = url.searchParams.get('example');
    if (exampleRef !== null && exampleRef !== '' && target.endsWith('.html')) {
      report.examples += 1;
      const parts = exampleRef.split('/');
      const unsafe = parts.length === 0 || parts.some((part) => part === '' || part === '.' || part === '..');
      if (unsafe || !fs.existsSync(path.join(examplesDir, ...parts))) {
        report.problems.push({ file, ref, kind: 'example-not-found', target: `examples/${exampleRef}` });
      }
    }

    const anchor = safeDecode(url.hash.slice(1));
    if (anchor === '' || anchor.startsWith(':~:') || !target.endsWith('.html')) {
      return;
    }
    report.anchors += 1;
    if (!idsOf(target).has(anchor)) {
      report.problems.push({ file, ref, kind: 'anchor-not-found', target });
    }
  };

  for (const file of files) {
    if (file.endsWith('.html')) {
      report.pages += 1;
      const html = fs.readFileSync(path.join(distDir, ...file.split('/')), 'utf8');
      const { refs, ids } = extractHtmlReferences(html, site);
      idCache.set(file, ids);
      for (const ref of refs) {
        checkReference(file, ref);
      }
    } else if (file.endsWith('.css')) {
      report.stylesheets += 1;
      for (const ref of extractCssReferences(fs.readFileSync(path.join(distDir, ...file.split('/')), 'utf8'))) {
        checkReference(file, ref);
      }
    }
  }
  return report;
}

/** 문제 종류별 한국어 설명과 고치는 법 */
const PROBLEM_MESSAGES = {
  'base-missing': (/** @type {SiteAddress} */ site) =>
    `사이트 주소 앞부분(${site.base}/)이 빠졌어요. .astro 파일에서는 withBase('경로/')로 링크를 만들어요.`,
  'not-found': () => '가리키는 파일이나 페이지가 빌드 결과(dist/)에 없어요. 주소의 철자와 파일 위치를 확인해요.',
  'no-trailing-slash': () => '페이지 주소는 끝에 /를 붙여요(사이트 규칙). 예: …/credits/',
  'anchor-not-found': () => '주소 뒤 #위치(id)가 그 페이지에 없어요. 제목의 id나 #이름의 철자를 확인해요.',
  'relative-in-404': () => '404 페이지는 어느 주소에서나 보이므로 상대 주소가 깨져요. withBase()로 만든 주소를 써요.',
  'example-not-found': () => '실습실 주소의 ?example= 값이 examples/ 아래에 없는 파일이에요. 그대로 두면 실습실이 조용히 첫 예제를 열어요 — 파일 경로를 고쳐요.',
};

/**
 * 검사 결과를 한국어 문장으로 만든다.
 * @param {LinkReport} report
 * @param {SiteAddress} site
 * @returns {string}
 */
export function formatLinkReport(report, site) {
  const summary =
    `HTML ${report.pages}개와 CSS ${report.stylesheets}개에서 사이트 안 주소 ${report.internal}개` +
    `(#위치 ${report.anchors}개, 실습실 예제 ${report.examples}개 포함)를 확인했어요. 다른 사이트 주소 ${report.external}개는 건너뛰었어요.`;
  if (report.problems.length === 0) {
    return `[링크 검사] 통과 — ${summary}`;
  }
  const lines = [`[링크 검사] 실패 — 문제 ${report.problems.length}개. ${summary}`];
  for (const problem of report.problems) {
    const target = problem.target ? ` (찾아본 파일: dist/${problem.target})` : '';
    lines.push(`- dist/${problem.file}: "${problem.ref}"${target}`);
    lines.push(`  ${PROBLEM_MESSAGES[problem.kind](site)}`);
  }
  return lines.join('\n');
}
