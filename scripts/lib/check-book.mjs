// 교과서 쪽 검사(npm run check:book — 엄격 모드, 판 1.4.0, DECISIONS C131·C134·C138)의 몸통.
//
// 흐름: content/book/*.md를 읽는다 → frontmatter를 규칙(bookSchema)으로 읽는다 → 빌드와 같은 마크다운 처리기로 HTML을 만든다
//       → 규칙(src/components/book/book-rules.ts — 빌드가 경고로 쓰는 것과 같은 규칙)을 돌린다 → 파일을 여는 검사를 더한다 → 오류가 하나라도 있으면 실패.
//
// 여기서만 하는 검사(빌드는 하지 않음 — 파일을 열어야 해서)
//   fm-schema         설정 칸(YAML 문법·bookSchema 규칙)
//   fm-yaml-comment   따옴표 없는 글 값의 " #"가 YAML 주석으로 잘리는 곳
//   box-unknown       모르는 상자 이름(:::말풍성 같은 오타 — 화면에 글자 그대로 보인다)
//   book-lab-file     ::실습실[파일]의 예제 파일이 examples/ 아래에 있는지
//   img-file·img-review·img-alt-manifest  그림 파일·눈 확인 기록·그림 목록 대체 글(차시 틀 검사와 같은 규칙 — check-lessons.mjs의 lessonImageIssues)
//   glossary          :용어[…]가 용어사전에 있는지(없으면 참고)
//   book-pages-overlap 두 쪽 파일의 쪽 범위가 겹치는지(오류)
//   그리고 src/components/book/book-rules.ts의 규칙들(쪽 표지·학습 목표·상자·제목·그림 대체 글 등 — 문서 머리말 참고)
// 출판본 글자와의 같음은 npm run book:fidelity가 본다(원본 PDF가 있는 운영자 PC에서만).
//
// Node가 직접 읽는 파일이라 JavaScript(JSDoc)로 쓰고, 사이트 규칙(.ts)은 Node의 타입 지우기로 그대로 불러온다.
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { checkBookRules } from '../../src/components/book/book-rules.ts';
import { bookPageList } from '../../src/components/book/book-data.ts';
import { findGlossaryMarkers, resolveGlossaryMarker } from '../../src/components/glossary/glossary.ts';
import { bookSchema } from '../../src/config/content-schemas.ts';
import {
  EXAMPLES_ROOT,
  createLessonRenderer,
  describeYamlSyntaxError,
  lessonImageIssues,
  listLessonFiles,
  loadGlossary,
  loadImageInfo,
  splitFrontmatter,
} from './check-lessons.mjs';
import { describeYamlCommentTrap, findYamlCommentTraps } from './yaml-comment-traps.mjs';

export const BOOK_ROOT = 'content/book';

/**
 * @typedef {{ level: 'error' | 'warning', code: string, message: string }} CheckIssue
 * @typedef {object} BookCheck
 * @property {string} file 저장소 뿌리 기준 경로
 * @property {string} id 쪽 id(파일 이름)
 * @property {string} [title]
 * @property {string} [pages]
 * @property {boolean} draft
 * @property {boolean} skipped 초안이라 건너뛰었는지
 * @property {CheckIssue[]} issues
 * @typedef {object} BookCheckReport
 * @property {BookCheck[]} books
 * @property {CheckIssue[]} global 파일 하나에 묶이지 않는 문제(쪽 범위 겹침 등)
 */

/**
 * content/book 아래 .md 파일(저장소 뿌리 기준, 정렬).
 * @param {string} rootDir
 * @returns {string[]}
 */
export function listBookFiles(rootDir) {
  const directory = path.join(rootDir, BOOK_ROOT);
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => `${BOOK_ROOT}/${name}`);
}

/**
 * 웹 차시의 짝 찾기에 쓸 값(단원·차시 번호·파일 이름)만 가볍게 읽는다.
 * @param {string} rootDir
 * @returns {{ unit: 1 | 2 | 3 | 4, label: string, slug: string }[]}
 */
export function readLessonKeys(rootDir) {
  /** @type {{ unit: 1 | 2 | 3 | 4, label: string, slug: string }[]} */
  const keys = [];
  for (const file of listLessonFiles(rootDir)) {
    const { frontmatter } = splitFrontmatter(fs.readFileSync(path.join(rootDir, file), 'utf8'));
    if (frontmatter === null) continue;
    const data = parseDocument(frontmatter).toJS() ?? {};
    const slug = path.posix.basename(file, '.md');
    if ([1, 2, 3, 4].includes(data.unit) && data.draft !== true) {
      keys.push({ unit: data.unit, label: String(data.label ?? slug.toUpperCase()), slug });
    }
  }
  return keys;
}

/**
 * 쪽 파일 하나를 검사한다.
 * @param {string} file 저장소 뿌리 기준 경로
 * @param {{ rootDir: string, renderer: Awaited<ReturnType<typeof createLessonRenderer>>, glossary: ReturnType<typeof loadGlossary>['registry'], images: ReturnType<typeof loadImageInfo>, lessons: ReturnType<typeof readLessonKeys>, includeDrafts: boolean }} context
 * @returns {Promise<BookCheck & { data?: import('../../src/config/content-schemas.ts').BookData }>}
 */
export async function checkBookFile(file, context) {
  const { rootDir } = context;
  const id = path.posix.basename(file, '.md');
  /** @type {CheckIssue[]} */
  const issues = [];
  const text = fs.readFileSync(path.join(rootDir, file), 'utf8');
  const { frontmatter, body } = splitFrontmatter(text);
  if (frontmatter === null) {
    return { file, id, draft: false, skipped: false, issues: [{ level: 'error', code: 'fm-schema', message: '맨 위에 --- 로 감싼 설정 칸(frontmatter)이 없어요. 본보기: content/book/2-1-2.md' }] };
  }
  const document = parseDocument(frontmatter, { uniqueKeys: true });
  if (document.errors.length > 0) {
    return {
      file,
      id,
      draft: false,
      skipped: false,
      issues: document.errors.map((error) => ({ level: 'error', code: 'fm-schema', message: describeYamlSyntaxError(/** @type {any} */ (error)) })),
    };
  }
  const raw = document.toJS() ?? {};
  const parsed = bookSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      file,
      id,
      draft: raw?.draft === true,
      skipped: false,
      issues: parsed.error.issues.map((problem) => ({
        level: 'error',
        code: 'fm-schema',
        message: `설정 칸 ${problem.path.length > 0 ? `${problem.path.join('.')}: ` : ''}${problem.message}`,
      })),
    };
  }
  const data = parsed.data;
  const base = { file, id, title: data.title, pages: data.pages, draft: data.draft, data };
  if (data.draft && !context.includeDrafts) {
    return { ...base, skipped: true, issues: [] };
  }
  // frontmatter는 md 2행부터(1행은 ---)
  for (const trap of findYamlCommentTraps(frontmatter)) {
    issues.push({ level: 'error', code: 'fm-yaml-comment', message: describeYamlCommentTrap({ ...trap, line: trap.line + 1 }, '설정 칸') });
  }

  // 그림 대체 글 속 "시:분:초"·"11:00:01"처럼 콜론 바로 뒤에 글자·숫자가 오면 마크다운이 지시문(:이름)으로 읽어 그 글자가 대체 글에서 사라진다 — 원문(md)에서 찾는다
  for (const match of body.matchAll(/!\[([^\]]*)\]\(/gu)) {
    const alt = match[1] ?? '';
    const colon = /\S:[^\s'"”’)\]]/u.exec(alt);
    if (colon) {
      issues.push({
        level: 'error',
        code: 'img-alt-colon',
        message: `그림 대체 글 "${alt.slice(0, 40)}…"에 콜론 바로 뒤에 글자가 붙은 곳("${colon[0]}")이 있어요. 마크다운이 지시문으로 읽어 그 글자가 사라져요 — 콜론 뒤에 빈칸을 두거나 "시, 분, 초"처럼 풀어 써요.`,
      });
    }
  }

  const { html, warnings } = await context.renderer.render(body, path.join(rootDir, file));
  for (const warning of warnings) {
    if (warning.includes('[상자 문법]')) {
      issues.push({ level: 'error', code: 'box-unknown', message: warning.replace(/^\[상자 문법\]\s*/u, '') });
    } else if (warning.includes('[용어 표시]')) {
      issues.push({ level: 'warning', code: 'glossary', message: warning.replace(/^\[용어 표시\]\s*/u, '') });
    } else {
      issues.push({ level: 'warning', code: 'markdown', message: warning });
    }
  }
  issues.push(...checkBookRules({ id, data, html, lessons: context.lessons }));

  // ::실습실[파일]의 예제 파일
  for (const match of html.matchAll(/class="book-lab-slot"[^>]*\sdata-book-lab="([^"]*)"/gu)) {
    const example = match[1] ?? '';
    if (!fs.existsSync(path.join(rootDir, EXAMPLES_ROOT, ...example.split('/')))) {
      issues.push({ level: 'error', code: 'book-lab-file', message: `::실습실[${example}]의 예제 파일 examples/${example}이(가) 없어요. 경로를 고치거나 예제를 먼저 넣어요.` });
    }
  }

  // 본문 그림(차시 틀 검사와 같은 규칙)
  issues.push(...lessonImageIssues(html, context));

  // 용어사전
  const seenTerms = new Set();
  for (const marker of findGlossaryMarkers(html)) {
    const key = `${marker.entry ?? ''}|${marker.text}`;
    if (seenTerms.has(key) || resolveGlossaryMarker(context.glossary, marker)) continue;
    seenTerms.add(key);
    issues.push({
      level: 'warning',
      code: 'glossary',
      message: marker.entry
        ? `:용어[${marker.text}]{항목=${marker.entry}} — 용어사전 항목 content/glossary/${marker.entry}.md가 없어요.`
        : `:용어[${marker.text}] — 용어사전에 없는 말이에요. 사전에 있는 낱말만 :용어[…]로 감싸요(없으면 그냥 글자로 둬요).`,
    });
  }
  return { ...base, skipped: false, issues };
}

/**
 * 모든 쪽을 검사한다.
 * @param {{ rootDir?: string, only?: string[], includeDrafts?: boolean }} [options]
 * @returns {Promise<BookCheckReport>}
 */
export async function runBookCheck(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const includeDrafts = options.includeDrafts ?? false;
  const only = (options.only ?? []).map((value) => value.split('\\').join('/').replace(/^\.\//u, '').toLowerCase());
  const glossary = loadGlossary(rootDir);
  const context = {
    rootDir,
    renderer: await createLessonRenderer(),
    glossary: glossary.registry,
    images: loadImageInfo(rootDir),
    lessons: readLessonKeys(rootDir),
    includeDrafts,
  };
  /** @type {(BookCheck & { data?: any })[]} */
  const all = [];
  for (const file of listBookFiles(rootDir)) {
    all.push(await checkBookFile(file, context));
  }

  /** @type {CheckIssue[]} */
  const global = [];
  // 쪽 범위가 겹치는 두 파일
  const owners = new Map();
  for (const book of all) {
    if (!book.data || book.skipped) continue;
    for (const page of bookPageList(book.data.pages)) {
      const owner = owners.get(page);
      if (owner && owner !== book.id) {
        global.push({ level: 'error', code: 'book-pages-overlap', message: `${page}쪽을 ${owner}와 ${book.id}가 함께 맡아요. 쪽 범위(pages)를 고쳐요.` });
        break;
      }
      owners.set(page, book.id);
    }
  }
  // 용어사전 파일 자체의 문제(빌드가 멈추는 문제라 몇 쪽만 검사할 때도 알린다)
  for (const message of glossary.problems) {
    global.push({ level: 'error', code: 'glossary', message });
  }

  const matchesOnly = (/** @type {BookCheck} */ book) => only.length === 0 || only.some((value) => value === book.file.toLowerCase() || value === book.id.toLowerCase());
  const books = all.filter(matchesOnly).map(({ data: _data, ...rest }) => rest);
  return { books, global };
}

/** @param {BookCheckReport} report */
export function reportFailed(report) {
  return report.global.some((problem) => problem.level === 'error') || report.books.some((book) => book.issues.some((problem) => problem.level === 'error'));
}

/**
 * 검사 결과를 사람이 읽는 글로 만든다.
 * @param {BookCheckReport} report
 * @returns {string}
 */
export function formatBookCheck(report) {
  const lines = ['교과서 쪽 검사(npm run check:book) — 엄격 모드: 오류가 하나라도 있으면 실패해요(빌드는 같은 문제를 경고로만 남겨요, PD-35).', ''];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let errorCount = 0;
  let warningCount = 0;
  for (const book of report.books) {
    const name = `${book.id}${book.title ? ` ${book.title}` : ''}${book.pages ? ` (${book.pages}쪽)` : ''}`;
    if (book.skipped) {
      skipped += 1;
      lines.push(`[건너뜀] ${book.file}  ${name} — 초안(draft: true)이에요. 함께 검사하려면 --drafts`);
      continue;
    }
    const errors = book.issues.filter((problem) => problem.level === 'error');
    const warnings = book.issues.filter((problem) => problem.level === 'warning');
    errorCount += errors.length;
    warningCount += warnings.length;
    if (errors.length > 0) {
      failed += 1;
      lines.push(`[실패] ${book.file}  ${name} — 오류 ${errors.length}${warnings.length > 0 ? `, 참고 ${warnings.length}` : ''}`);
    } else {
      passed += 1;
      lines.push(`[통과] ${book.file}  ${name}${warnings.length > 0 ? ` — 참고 ${warnings.length}` : ''}`);
    }
    for (const problem of [...errors, ...warnings]) {
      lines.push(`    ${problem.level === 'error' ? '오류' : '참고'} [${problem.code}] ${problem.message}`);
    }
  }
  for (const problem of report.global) {
    if (problem.level === 'error') {
      lines.push(`[실패] 오류 [${problem.code}] ${problem.message}`);
      errorCount += 1;
    } else {
      lines.push(`[참고] [${problem.code}] ${problem.message}`);
      warningCount += 1;
    }
  }
  lines.push('');
  lines.push(`결과: 교과서 쪽 ${passed + failed}개 검사 — 통과 ${passed}, 실패 ${failed}(오류 ${errorCount}, 참고 ${warningCount})${skipped > 0 ? `, 초안 ${skipped}개 건너뜀` : ''}.`);
  return lines.join('\n');
}
