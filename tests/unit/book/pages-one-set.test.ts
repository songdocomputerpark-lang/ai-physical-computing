// 쪽 범위 한 벌(판 1.6.0 — DECISIONS C137 적용 누락 고침, 걷기 B-17·B-64·B-90).
// 같은 절의 쪽 범위가 곳마다 달랐다: 홈·전환 줄 "116~123"(교과서 쪽) / 따라 하기 목록·교사용 "117~123"(웹 차시 frontmatter·차례표), 0 붙임 "008~012".
// 이제 값은 교과서 쪽(content/book/<id>.md pages — 출판본, 중단원 첫 절은 성취 계획 쪽부터)이 기준이고, 짝 웹 차시 frontmatter와
// 차례표(src/components/lesson/curriculum.ts)가 같은 값을 적는다. 화면 표기(앞 0 없이)는 src/lib/display-names.ts 한 곳.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CURRICULUM } from '../../../src/components/lesson/curriculum.ts';
import { formatPageRange } from '../../../src/lib/display-names.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

function frontmatterOf(file: string): Record<string, unknown> {
  const text = fs.readFileSync(file, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text);
  return match ? ((parse(match[1] ?? '') as Record<string, unknown> | null) ?? {}) : {};
}

function markdownFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? markdownFiles(full) : entry.name.endsWith('.md') ? [full] : [];
  });
}

interface LessonFm {
  readonly file: string;
  readonly unit: number;
  readonly label: string;
  readonly pages?: string;
}

const lessons: LessonFm[] = markdownFiles(path.join(ROOT, 'content', 'lessons')).map((file) => {
  const data = frontmatterOf(file);
  return {
    file: path.relative(ROOT, file).split(path.sep).join('/'),
    unit: Number(data.unit),
    label: String(data.label ?? ''),
    ...(data.pages === undefined ? {} : { pages: String(data.pages) }),
  };
});

/** 짝 웹 차시가 있는 교과서 쪽: frontmatter lesson(차시 번호나 파일 이름)으로 잇는다(book-data.ts findPairedLesson과 같은 규칙) */
const pairs = markdownFiles(path.join(ROOT, 'content', 'book')).flatMap((file) => {
  const data = frontmatterOf(file);
  const link = data.lesson === undefined ? undefined : String(data.lesson);
  if (!link || data.draft === true) {
    return [];
  }
  const lesson = lessons.find(
    (candidate) => candidate.unit === Number(data.unit) && (candidate.label === link || path.basename(candidate.file, '.md') === link),
  );
  return lesson ? [{ id: path.basename(file, '.md'), pages: String(data.pages), lesson }] : [];
});

const planned = CURRICULUM.flatMap((unit) => unit.sections.flatMap((section) => section.lessons.map((lesson) => ({ unit: unit.unit, ...lesson }))));

describe('쪽 범위 한 벌(교과서 쪽 = 웹 차시 = 차례표)', () => {
  it('짝이 있는 교과서 쪽은 30편이 넘는다(시험이 실제 파일을 본다)', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(30);
  });

  it('짝 웹 차시 frontmatter pages는 교과서 쪽 pages와 같은 쪽 범위다(앞 0만 다를 수 있다)', () => {
    const differ = pairs
      .filter((pair) => formatPageRange(pair.lesson.pages ?? '') !== formatPageRange(pair.pages))
      .map((pair) => `${pair.id}: 교과서 쪽 ${pair.pages} ↔ ${pair.lesson.file} ${pair.lesson.pages ?? '(없음)'}`);
    expect(differ).toEqual([]);
  });

  it('차례표(curriculum.ts)의 쪽 범위도 같은 값이다', () => {
    const differ = pairs.flatMap((pair) => {
      const plan = planned.find((item) => item.unit === pair.lesson.unit && item.label === pair.lesson.label);
      return plan?.pages !== undefined && formatPageRange(plan.pages) !== formatPageRange(pair.pages)
        ? [`${pair.lesson.label}: 교과서 쪽 ${pair.pages} ↔ curriculum.ts ${plan.pages}`]
        : [];
    });
    expect(differ).toEqual([]);
  });
});
