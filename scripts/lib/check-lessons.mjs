// 차시 틀 검사(npm run check:lessons — 엄격 모드, PLAN §8.5 P5-02, PD-35)의 몸통.
//
// 흐름: content/lessons/**/*.md를 모두 읽는다 → frontmatter를 규칙(lessonSchema)으로 읽는다 → 빌드와 같은 마크다운 처리기로 HTML을 만든다
//       → 규칙(src/components/lesson/lesson-rules.ts — 빌드가 경고로 쓰는 것과 같은 규칙)을 돌린다
//       → 파일을 여는 검사를 더한다(아래) → 오류가 하나라도 있으면 실패.
//
// 여기서만 하는 검사(빌드는 하지 않음 — 파일을 열어야 해서)
//   example-file      examples[].file이 examples/에 있고 줄 끝이 LF인지
//   example-focus     examples[].focus(발췌할 줄)가 파일 안의 줄인지(오류), 150줄 넘는 예제에 focus가 없는지(참고 — 차시에 통째로 펼치지 않게)
//   fm-yaml-comment   frontmatter·그 차시 예제의 사이드카(.meta.yaml)에서 따옴표 없는 글 값이 " #" 주석으로 잘리는 곳(2026-09-25 Phase 5 검토 중요 1)
//   img-file          본문 그림(/images/…)이 public/에 있는지, 바깥 주소 그림이 아닌지
//   img-review        원고·화면 래스터 그림(public/images/lessons/)에 눈 확인 기록("통과")이 있는지(PD-32)
//   img-alt-manifest  그림 목록(<차시>.images.yaml)의 alt와 본문 대체 글이 같은지(P5-01 제안)
//   glossary          :용어[…]가 용어사전에 있는지(없으면 참고 — 새 낱말은 통합 때 사전에 넣는다)
//   box-unknown       모르는 상자 이름(:::교사욯 같은 오타 — 화면에 글자 그대로 보인다)
//   lesson-path       두 파일이 같은 주소·차시 번호를 쓰는지, 파일 이름·폴더 규칙(lesson-data.ts의 checkLessons)
//   curriculum        차례표에 있는데 아직 md가 없는 차시(목록으로만 알림, --complete면 오류)
//
// Node가 직접 읽는 파일이라 JavaScript(JSDoc)로 쓰고, 사이트 규칙(.ts)은 Node의 타입 지우기로 그대로 불러온다(scripts/build-sw.mjs와 같음).
import fs from 'node:fs';
import path from 'node:path';
import { markdownConfigDefaults, unified } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import { parseDocument } from 'yaml';
import { createGlossaryRegistry, findGlossaryMarkers, resolveGlossaryMarker } from '../../src/components/glossary/glossary.ts';
import { allPlannedLessons } from '../../src/components/lesson/curriculum.ts';
import { checkLessons as checkLessonEntries } from '../../src/components/lesson/lesson-data.ts';
import { parseFocusRanges, splitExampleCode } from '../../src/components/lesson/example-code.ts';
import { checkLessonRules } from '../../src/components/lesson/lesson-rules.ts';
import { glossarySchema, lessonSchema } from '../../src/config/content-schemas.ts';
import remarkBoxes from '../../src/lib/remark-boxes.mjs';
import remarkGlossary from '../../src/lib/remark-glossary.mjs';
import { LESSON_IMAGE_ROOT, RASTER_EXTENSIONS, listManifestFiles, parseImageManifest, readImageRecords, reviewedProblem } from './lesson-images.mjs';
import { describeYamlCommentTrap, findYamlCommentTraps } from './yaml-comment-traps.mjs';

export const LESSONS_ROOT = 'content/lessons';
export const GLOSSARY_ROOT = 'content/glossary';
export const EXAMPLES_ROOT = 'examples';
/** 이보다 긴 예제는 차시에 발췌(focus)로 보이게 한다(참고 example-focus) */
export const LONG_EXAMPLE_LINES = 150;

/**
 * @typedef {{ level: 'error' | 'warning', code: string, message: string }} CheckIssue
 * @typedef {object} LessonCheck
 * @property {string} file 저장소 뿌리 기준 경로
 * @property {string} id 콘텐츠 id(u1/1-1-1)
 * @property {string} slug
 * @property {string} [label]
 * @property {string} [title]
 * @property {number} [unit]
 * @property {string} [kind]
 * @property {boolean} draft
 * @property {boolean} skipped 초안이라 건너뛰었는지
 * @property {CheckIssue[]} issues
 * @typedef {object} LessonCheckReport
 * @property {LessonCheck[]} lessons
 * @property {{ unit: number, label: string, title: string, slug: string, draftFile?: string }[]} missing 차례표에 있는데 md가 없는(또는 초안인) 차시
 * @property {number} plannedCount 차례표의 차시 수
 * @property {boolean} complete --complete(없는 차시도 오류)
 * @property {CheckIssue[]} global 파일 하나에 묶이지 않는 문제(같은 주소 등)
 */

/** @param {string} value */
function toPosix(value) {
  return value.split(path.sep).join('/');
}

/**
 * content/lessons 아래 .md 파일(저장소 뿌리 기준, 정렬). 그림 목록(.images.yaml)은 빼고 .md만.
 * @param {string} rootDir
 * @returns {string[]}
 */
export function listLessonFiles(rootDir) {
  /** @type {string[]} */
  const found = [];
  const walk = (/** @type {string} */ relative) => {
    const absolute = path.join(rootDir, relative);
    if (!fs.existsSync(absolute)) return;
    for (const dirent of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = `${relative}/${dirent.name}`;
      if (dirent.isDirectory()) walk(child);
      else if (dirent.name.endsWith('.md')) found.push(child);
    }
  };
  walk(LESSONS_ROOT);
  return found.sort();
}

/**
 * md 글을 frontmatter(--- 사이)와 본문으로 나눈다.
 * @param {string} text
 * @returns {{ frontmatter: string | null, body: string }}
 */
export function splitFrontmatter(text) {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/u.exec(text);
  return match ? { frontmatter: match[1] ?? '', body: match[2] ?? '' } : { frontmatter: null, body: text };
}

/** 빌드(astro.config.mjs)와 같은 플러그인 순서의 마크다운 처리기. 코드 색 입히기는 검사에 필요 없어 끈다. */
export async function createLessonRenderer() {
  const processor = unified({ remarkPlugins: [remarkDirective, remarkGlossary, remarkBoxes] });
  const renderer = await processor.createRenderer({ ...markdownConfigDefaults, syntaxHighlight: false });
  return {
    /**
     * 마크다운을 HTML로 바꾸고, 그동안 플러그인이 남긴 경고(모르는 상자 이름 등)를 모은다.
     * @param {string} markdown
     * @param {string} filePath 경고 문장에 쓸 경로
     */
    async render(markdown, filePath) {
      /** @type {string[]} */
      const warnings = [];
      const original = console.warn;
      console.warn = (...args) => {
        warnings.push(args.map(String).join(' '));
      };
      try {
        const result = await renderer.render(markdown, { fileURL: new URL(`file:///${toPosix(path.resolve(filePath))}`) });
        return { html: result.code, warnings };
      } finally {
        console.warn = original;
      }
    },
  };
}

/**
 * 용어사전(content/glossary/*.md)을 읽어 찾아보기 표를 만든다.
 * @param {string} rootDir
 */
export function loadGlossaryRegistry(rootDir) {
  const directory = path.join(rootDir, GLOSSARY_ROOT);
  const inputs = fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .flatMap((name) => {
          const { frontmatter } = splitFrontmatter(fs.readFileSync(path.join(directory, name), 'utf8'));
          const parsed = glossarySchema.safeParse(frontmatter === null ? {} : (parseDocument(frontmatter).toJS() ?? {}));
          return parsed.success ? [{ id: name.slice(0, -3), data: parsed.data }] : [];
        })
    : [];
  return createGlossaryRegistry(inputs);
}

/**
 * 그림 목록의 대체 글과 눈 확인 기록을 모은다(옛 공용 기록 scripts/image-allowlist.yaml 포함).
 * @param {string} rootDir
 */
export function loadImageInfo(rootDir) {
  const { records } = readImageRecords(rootDir);
  /** @type {Map<string, { alt: string, decorative: boolean, manifest: string }>} */
  const alts = new Map();
  for (const manifestPath of listManifestFiles(rootDir)) {
    const { manifest } = parseImageManifest(fs.readFileSync(path.join(rootDir, manifestPath), 'utf8'), manifestPath);
    for (const entry of manifest?.images ?? []) {
      if (entry.file) {
        alts.set(entry.file.normalize('NFC'), { alt: entry.alt, decorative: entry.decorative, manifest: manifestPath });
      }
    }
  }
  return { records, alts };
}

/** @param {string} value */
function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * HTML 안의 <img> 태그(주소·대체 글). 코드 블록 안 글자는 이미 &lt;로 바뀌어 있어 잡히지 않는다.
 * @param {string} html
 * @returns {{ src: string, alt: string | undefined }[]}
 */
function imagesIn(html) {
  return [...html.matchAll(/<img\b([^>]*)>/giu)].map((match) => {
    const attrs = match[1] ?? '';
    const src = /\ssrc="([^"]*)"/iu.exec(attrs)?.[1] ?? '';
    const altMatch = /\salt="([^"]*)"/iu.exec(attrs);
    return { src: src.replace(/&amp;/gu, '&'), alt: altMatch ? altMatch[1].replace(/&quot;/gu, '"').replace(/&amp;/gu, '&').replace(/&#x3C;/giu, '<') : undefined };
  });
}

/**
 * 차시 파일 하나를 검사한다.
 * @param {string} file 저장소 뿌리 기준 경로
 * @param {{ rootDir: string, renderer: Awaited<ReturnType<typeof createLessonRenderer>>, glossary: ReturnType<typeof loadGlossaryRegistry>, images: ReturnType<typeof loadImageInfo>, includeDrafts: boolean }} context
 * @returns {Promise<LessonCheck & { data?: import('../../src/config/content-schemas.ts').LessonData }>}
 */
export async function checkLessonFile(file, context) {
  const { rootDir } = context;
  const slug = path.posix.basename(file, '.md');
  const id = file.slice(`${LESSONS_ROOT}/`.length, -'.md'.length);
  /** @type {CheckIssue[]} */
  const issues = [];
  const text = fs.readFileSync(path.join(rootDir, file), 'utf8');
  const { frontmatter, body } = splitFrontmatter(text);
  if (frontmatter === null) {
    return { file, id, slug, draft: false, skipped: false, issues: [{ level: 'error', code: 'fm-schema', message: '맨 위에 --- 로 감싼 설정 칸(frontmatter)이 없어요.' }] };
  }
  const document = parseDocument(frontmatter, { uniqueKeys: true });
  if (document.errors.length > 0) {
    return {
      file,
      id,
      slug,
      draft: false,
      skipped: false,
      issues: document.errors.map((error) => ({ level: 'error', code: 'fm-schema', message: `설정 칸 YAML 문법 오류: ${error.message.split('\n')[0]}` })),
    };
  }
  const raw = document.toJS() ?? {};
  const parsed = lessonSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      file,
      id,
      slug,
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
  const base = { file, id, slug, label: data.label, title: data.title, unit: data.unit, kind: data.kind, draft: data.draft, data };
  if (data.draft && !context.includeDrafts) {
    return { ...base, skipped: true, issues: [] };
  }
  // frontmatter는 md 2행부터(1행은 ---)
  for (const trap of findYamlCommentTraps(frontmatter)) {
    issues.push({ level: 'error', code: 'fm-yaml-comment', message: describeYamlCommentTrap({ ...trap, line: trap.line + 1 }, '설정 칸') });
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
  issues.push(...checkLessonRules({ data, html, slug, raw }));

  // 예제 파일(examples/ 아래, LF)
  for (const example of data.examples) {
    const examplePath = path.join(rootDir, EXAMPLES_ROOT, ...example.file.split('/'));
    if (!fs.existsSync(examplePath)) {
      issues.push({ level: 'error', code: 'example-file', message: `예제 파일 examples/${example.file}이(가) 없어요. 파일을 넣거나 examples의 경로를 고쳐요.` });
    } else {
      const code = fs.readFileSync(examplePath, 'utf8');
      if (code.includes('\r')) {
        issues.push({ level: 'error', code: 'example-file', message: `예제 파일 examples/${example.file}의 줄 끝이 CRLF예요. LF로 저장해요(PD-33).` });
      }
      const { lines } = splitExampleCode(code);
      if (example.focus) {
        for (const problem of parseFocusRanges(example.focus, lines.length).problems) {
          issues.push({ level: 'error', code: 'example-focus', message: `examples의 ${example.file} focus: ${problem}` });
        }
      } else if (lines.length > LONG_EXAMPLE_LINES) {
        issues.push({
          level: 'warning',
          code: 'example-focus',
          message: `예제 examples/${example.file}이(가) ${lines.length}줄이에요. 코드 읽기가 가리키는 줄을 focus: "1-7, 117-123"처럼 적으면 차시에는 그 줄만 보이고 전체는 접혀요.`,
        });
      }
    }
    const sidecarFile = example.file.replace(/\.py$/u, '.meta.yaml');
    const sidecar = path.join(rootDir, EXAMPLES_ROOT, ...sidecarFile.split('/'));
    if (fs.existsSync(sidecar)) {
      for (const trap of findYamlCommentTraps(fs.readFileSync(sidecar, 'utf8'))) {
        issues.push({ level: 'error', code: 'fm-yaml-comment', message: describeYamlCommentTrap(trap, `사이드카 examples/${sidecarFile}`) });
      }
    }
  }

  // 본문 그림
  for (const image of imagesIn(html)) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/iu.test(image.src)) {
      issues.push({ level: 'error', code: 'img-file', message: `그림 ${image.src}는 사이트 밖 주소예요. 그림은 public/images/ 아래에 두고 /images/…로 적어요(저작권·개인정보 확인 — PLAN §9).` });
      continue;
    }
    if (!image.src.startsWith('/')) {
      issues.push({ level: 'error', code: 'img-file', message: `그림 주소 "${image.src}"는 사이트 뿌리부터 적어요. 예: /images/lessons/1-2-1/flip.svg` });
      continue;
    }
    const sitePath = decodePath(image.src.split(/[?#]/u)[0] ?? '');
    const publicPath = `public${sitePath}`.normalize('NFC');
    if (!fs.existsSync(path.join(rootDir, ...publicPath.split('/')))) {
      issues.push({ level: 'error', code: 'img-file', message: `그림 파일 ${publicPath}이(가) 없어요.` });
      continue;
    }
    const extension = path.posix.extname(publicPath).toLowerCase();
    if (RASTER_EXTENSIONS.includes(extension) && publicPath.startsWith(`${LESSON_IMAGE_ROOT}/`)) {
      const record = context.images.records.get(publicPath);
      const problem = record ? reviewedProblem(record.reviewed) : '눈 확인 기록이 없어요';
      if (problem) {
        issues.push({
          level: 'error',
          code: 'img-review',
          message: `그림 ${publicPath}: ${problem}. 한 장씩 열어 얼굴·이름·화면 속 경로·파일명·기기 주소·학교명이 없는지 보고 그 차시의 그림 목록에 reviewed를 적어요(PD-32, MAINTENANCE.md 3-1).`,
        });
      }
      const manifest = context.images.alts.get(publicPath);
      if (manifest && (image.alt ?? '').trim() !== manifest.alt.trim()) {
        issues.push({
          level: 'error',
          code: 'img-alt-manifest',
          message: `그림 ${publicPath}의 대체 글이 그림 목록(${manifest.manifest})의 alt와 달라요. 목록의 alt를 그대로 옮겨요: "${manifest.alt}"`,
        });
      }
    }
  }

  // 용어사전
  const seenTerms = new Set();
  for (const marker of findGlossaryMarkers(html)) {
    const key = `${marker.entry ?? ''}|${marker.text}`;
    if (seenTerms.has(key) || resolveGlossaryMarker(context.glossary, marker)) {
      continue;
    }
    seenTerms.add(key);
    issues.push({
      level: 'warning',
      code: 'glossary',
      message: marker.entry
        ? `:용어[${marker.text}]{항목=${marker.entry}} — 용어사전 항목 content/glossary/${marker.entry}.md가 없어요.`
        : `:용어[${marker.text}] — 용어사전에 없는 말이에요. 새 낱말은 통합 담당에게 항목을 요청하고(구역은 content/glossary/를 고치지 않아요), 그전까지는 굵게·풀이 없이 글자만 보여요.`,
    });
  }

  return { ...base, skipped: false, issues };
}

/**
 * 모든 차시를 검사한다.
 * @param {{ rootDir?: string, only?: string[], includeDrafts?: boolean, complete?: boolean }} [options]
 * @returns {Promise<LessonCheckReport>}
 */
export async function runLessonCheck(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const includeDrafts = options.includeDrafts ?? false;
  const complete = options.complete ?? false;
  const only = (options.only ?? []).map((value) => toPosix(value).replace(/^\.\//u, '').toLowerCase());
  const context = {
    rootDir,
    renderer: await createLessonRenderer(),
    glossary: loadGlossaryRegistry(rootDir),
    images: loadImageInfo(rootDir),
    includeDrafts,
  };

  /** @type {(LessonCheck & { data?: any })[]} */
  const all = [];
  for (const file of listLessonFiles(rootDir)) {
    all.push(await checkLessonFile(file, context));
  }

  // 파일끼리 부딪히는 곳(같은 주소는 빌드도 멈춘다 — 나머지는 빌드에서 경고, 여기서는 오류)
  /** @type {CheckIssue[]} */
  const global = [];
  const entries = all.filter((lesson) => lesson.data).map((lesson) => ({ id: lesson.id, data: lesson.data, filePath: lesson.file }));
  for (const problem of checkLessonEntries(entries)) {
    const owner = all.find((lesson) => lesson.id === problem.id);
    const target = owner && !owner.skipped ? owner.issues : global;
    target.push({ level: 'error', code: 'lesson-path', message: problem.message });
  }

  const matchesOnly = (/** @type {LessonCheck} */ lesson) =>
    only.length === 0 ||
    only.some((value) => value === lesson.file.toLowerCase() || value === lesson.slug || value === (lesson.label ?? '').toLowerCase() || value === lesson.id);
  const lessons = all.filter(matchesOnly).map(({ data: _data, ...rest }) => rest);

  const planned = allPlannedLessons();
  const sameLesson = (/** @type {LessonCheck} */ candidate, /** @type {number} */ unit, /** @type {{ label: string, slug: string }} */ lesson) =>
    candidate.unit === unit && ((candidate.label ?? '').toLowerCase() === lesson.label.toLowerCase() || candidate.slug === lesson.slug);
  const parsedLessons = all.filter((lesson) => lesson.data);
  const missing = planned
    .filter(({ unit, lesson }) => !parsedLessons.some((candidate) => !candidate.draft && sameLesson(candidate, unit, lesson)))
    .map(({ unit, lesson }) => ({
      unit,
      label: lesson.label,
      title: lesson.title,
      slug: lesson.slug,
      draftFile: parsedLessons.find((candidate) => candidate.draft && sameLesson(candidate, unit, lesson))?.file,
    }));

  return { lessons, missing: only.length === 0 ? missing : [], plannedCount: planned.length, complete, global };
}

/** @param {LessonCheckReport} report */
export function reportFailed(report) {
  return (
    report.global.some((problem) => problem.level === 'error') ||
    report.lessons.some((lesson) => lesson.issues.some((problem) => problem.level === 'error')) ||
    (report.complete && report.missing.length > 0)
  );
}

/**
 * 검사 결과를 사람이 읽는 글로 만든다.
 * @param {LessonCheckReport} report
 * @returns {string}
 */
export function formatLessonCheck(report) {
  const lines = ['차시 틀 검사(npm run check:lessons) — 엄격 모드: 오류가 하나라도 있으면 실패해요(빌드는 같은 문제를 경고로만 남겨요, PD-35).', ''];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let errorCount = 0;
  let warningCount = 0;
  for (const lesson of report.lessons) {
    const name = `${lesson.label ?? lesson.slug}${lesson.title ? ` ${lesson.title}` : ''}`;
    if (lesson.skipped) {
      skipped += 1;
      lines.push(`[건너뜀] ${lesson.file}  ${name} — 초안(draft: true)이에요. 함께 검사하려면 --drafts`);
      continue;
    }
    const errors = lesson.issues.filter((problem) => problem.level === 'error');
    const warnings = lesson.issues.filter((problem) => problem.level === 'warning');
    errorCount += errors.length;
    warningCount += warnings.length;
    if (errors.length > 0) {
      failed += 1;
      lines.push(`[실패] ${lesson.file}  ${name} — 오류 ${errors.length}${warnings.length > 0 ? `, 참고 ${warnings.length}` : ''}`);
    } else {
      passed += 1;
      lines.push(`[통과] ${lesson.file}  ${name}${warnings.length > 0 ? ` — 참고 ${warnings.length}` : ''}`);
    }
    for (const problem of [...errors, ...warnings]) {
      lines.push(`    ${problem.level === 'error' ? '오류' : '참고'} [${problem.code}] ${problem.message}`);
    }
  }
  for (const problem of report.global) {
    lines.push(`[실패] ${problem.message}`);
    errorCount += problem.level === 'error' ? 1 : 0;
  }
  if (report.missing.length > 0) {
    lines.push('');
    lines.push(
      `${report.complete ? '[실패] ' : ''}아직 md가 없는 차시(차례표 ${report.plannedCount}개 가운데 ${report.missing.length}개 — src/components/lesson/curriculum.ts):`,
    );
    for (const lesson of report.missing) {
      lines.push(
        `    ${lesson.label} ${lesson.title}  → ${lesson.draftFile ? `초안 ${lesson.draftFile}(draft: true를 풀면 검사해요)` : `content/lessons/u${lesson.unit}/${lesson.slug}.md`}`,
      );
    }
  }
  lines.push('');
  lines.push(
    `결과: 차시 ${passed + failed}개 검사 — 통과 ${passed}, 실패 ${failed}(오류 ${errorCount}, 참고 ${warningCount})` +
      `${skipped > 0 ? `, 초안 ${skipped}개 건너뜀` : ''}${report.missing.length > 0 ? `, 아직 없는 차시 ${report.missing.length}개${report.complete ? '(--complete: 실패)' : '(목록만)'}` : ''}.`,
  );
  return lines.join('\n');
}
