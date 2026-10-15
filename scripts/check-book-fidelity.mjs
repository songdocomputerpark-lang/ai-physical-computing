#!/usr/bin/env node
// 교과서 쪽 같음 검사 — npm run book:fidelity (판 1.4.0, DECISIONS C138)
//
//   npm run book:fidelity                       content/book의 모든 쪽(초안 제외)
//   npm run book:fidelity -- 2-1-2 u2-review     몇 개만(쪽 id)
//   npm run book:fidelity -- --materials <폴더>  원본 PDF 위치(기본: 저장소 뿌리 = 운영자 PC. 그 밖에는 비공개 자료 저장소의 originals/)
//
// 교과서 쪽 md를 ::쪽[n] 표지로 쪽마다 나눠 문장만 남긴 글과 원본 PDF(출판본 교과서) 그 쪽의 글자를 맞댄다(규칙은 scripts/lib/book-fidelity.mjs 머리말).
// 쪽마다 빠짐·더해짐이 0.97 미만이면 실패(종료 코드 1) — frontmatter fidelity_exceptions에 쪽과 까닭을 적은 쪽은 통과한다.
// 원본 PDF가 없으면 "원본이 없어 건너뜀"으로 끝낸다(종료 0 — 원본은 저장소에 없고 CI에는 frontmatter·쪽 표지 규칙 검사(check:book)만 돈다).
// 필요한 것: PyMuPDF가 있는 파이썬 3(APC_PYTHON으로 정할 수 있다).

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { SOURCES } from './lib/lesson-images.mjs';
import { checkBookFidelity, formatFidelity, splitFrontmatter } from './lib/book-fidelity.mjs';

const WORKER = fileURLToPath(new URL('./lib/book_text_worker.py', import.meta.url));
const BOOK_DIR = 'content/book';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(
    ['교과서 쪽 같음 검사', '  npm run book:fidelity                       모든 쪽', '  npm run book:fidelity -- 2-1-2              몇 개만(쪽 id)', '  --materials <폴더>                          원본 PDF 위치'].join('\n'),
  );
  process.exit(0);
}

/** @param {string} name */
function readOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const materialsDir = path.resolve(readOption('--materials') ?? rootDir);
const wanted = args.filter((arg) => !arg.startsWith('--'));

/** PyMuPDF가 있는 파이썬 */
function findPython() {
  /** @type {string[][]} */
  const candidates = [];
  if (process.env.APC_PYTHON && process.env.APC_PYTHON.trim() !== '') candidates.push(process.env.APC_PYTHON.trim().split(/\s+/u));
  candidates.push(['python'], ['python3'], ['py', '-3']);
  for (const candidate of candidates) {
    const result = spawnSync(candidate[0], [...candidate.slice(1), '-c', 'import pymupdf'], { encoding: 'utf8', timeout: 60_000 });
    if (!result.error && result.status === 0) return candidate;
  }
  return null;
}

/** @param {string} range 예: "124~131" → [124, …, 131] */
function pageList(range) {
  const match = /^(\d+)(?:~(\d+))?$/u.exec(range.trim());
  if (!match) return [];
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

const pdfPath = path.join(materialsDir, ...SOURCES.BOOK.file.split('/'));
if (!fs.existsSync(pdfPath)) {
  console.log(`[교과서 같음 검사] 원본이 없어 건너뜀 — ${SOURCES.BOOK.file}을(를) ${materialsDir}에서 찾지 못했어요(운영자 PC의 저장소 뿌리나 --materials로 알려 줘요).`);
  process.exit(0);
}

const bookDir = path.join(rootDir, BOOK_DIR);
const files = fs.existsSync(bookDir) ? fs.readdirSync(bookDir).filter((name) => name.endsWith('.md')).sort() : [];
/** @type {{ id: string, title: string, pages: number[], body: string, exceptions: { page: number, reason: string }[] }[]} */
const books = [];
for (const name of files) {
  const id = name.slice(0, -3);
  if (wanted.length > 0 && !wanted.includes(id)) continue;
  const { frontmatter, body } = splitFrontmatter(fs.readFileSync(path.join(bookDir, name), 'utf8'));
  if (frontmatter === null) {
    console.error(`[교과서 같음 검사] ${BOOK_DIR}/${name}: 맨 위 설정 칸(frontmatter)이 없어요.`);
    process.exit(1);
  }
  const data = parseDocument(frontmatter).toJS() ?? {};
  if (data.draft === true && wanted.length === 0) continue;
  const pages = pageList(String(data.pages ?? ''));
  if (pages.length === 0) {
    console.error(`[교과서 같음 검사] ${BOOK_DIR}/${name}: 쪽 범위(pages)를 읽지 못했어요(예: "124~131").`);
    process.exit(1);
  }
  const exceptions = Array.isArray(data.fidelity_exceptions)
    ? data.fidelity_exceptions.filter((item) => item && Number.isInteger(item.page)).map((item) => ({ page: item.page, reason: String(item.reason ?? '') }))
    : [];
  books.push({ id, title: String(data.title ?? ''), pages, body, exceptions });
}
if (books.length === 0) {
  console.error(`[교과서 같음 검사] 검사할 쪽이 없어요${wanted.length > 0 ? `: ${wanted.join(', ')}` : ''}.`);
  process.exit(wanted.length > 0 ? 1 : 0);
}

const python = findPython();
if (!python) {
  console.error('[교과서 같음 검사] PyMuPDF가 있는 파이썬 3을 찾지 못했어요. APC_PYTHON 환경 변수로 파이썬을 알려 줘요(예: APC_PYTHON="py -3.11").');
  process.exit(1);
}

const reports = [];
for (const book of books) {
  const result = spawnSync(python[0], [...python.slice(1), WORKER], {
    input: JSON.stringify({ file: pdfPath, pages: book.pages }),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  /** @type {any} */
  let response;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    response = { ok: false, error: result.stderr || result.error?.message || '답을 읽지 못했어요' };
  }
  if (!response.ok) {
    console.error(`[교과서 같음 검사] ${book.id}: 원본 글자를 읽지 못했어요 — ${response.error}`);
    process.exit(1);
  }
  const pdfPages = new Map(Object.entries(response.pages).map(([page, text]) => [Number(page), /** @type {{ lines: string[], native: string[] }} */ (text)]));
  reports.push(checkBookFidelity(book, pdfPages));
}
console.log(formatFidelity(reports));
process.exit(reports.some((report) => report.failed) ? 1 : 0);
