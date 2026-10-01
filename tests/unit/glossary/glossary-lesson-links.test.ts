// 용어사전의 "나오는 차시"가 빈 항목이 없는지 지킨다(2026-09-30 최종 점검 PM-06 — 바운딩 박스·알고리즘·오픈 소스·
// 인공지능 모델·해상도가 차시에 글자로는 나오는데 :용어[…] 표시가 없어 "나오는 차시"가 비어 있었다).
// 용어사전 페이지(src/pages/glossary/index.astro)와 같은 함수(collectLessonsByEntry)로, 초안이 아닌 차시 본문을
// astro.config.mjs와 같은 순서의 마크다운 플러그인으로 그려(helpers.ts) 모은다.
// 새 낱말을 더했으면 그 낱말이 처음 나오는 차시 본문 자리에 :용어[낱말]을 적어요(제목·링크·상자 제목 안은 안 돼요 — MAINTENANCE.md 1-4).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  collectLessonsByEntry,
  createGlossaryRegistry,
  formatGlossaryProblem,
  type GlossaryLessonLink,
} from '../../../src/components/glossary/glossary.ts';
import { CONTENT_DIRS, glossarySchema } from '../../../src/config/content-schemas.ts';
import { renderMarkdown } from './helpers.ts';

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u;

function readGlossary() {
  const dir = path.resolve(CONTENT_DIRS.glossary);
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => {
      const match = FRONTMATTER.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (!match) {
        throw new Error(`${name}: frontmatter(--- … ---)가 없어요.`);
      }
      // 초안도 등록부에 넘긴다(사이트와 같게 — 등록부가 초안을 찾아보기 표에서 빼고, 초안을 가리키는 표시는 문제로 알린다).
      return { id: name.slice(0, -'.md'.length), data: glossarySchema.parse(parseYaml(match[1])) };
    });
}

async function readLessons() {
  const root = path.resolve(CONTENT_DIRS.lessons);
  const lessons = [];
  for (const unitDir of fs.readdirSync(root).sort()) {
    const dir = path.join(root, unitDir);
    if (!fs.statSync(dir).isDirectory()) {
      continue;
    }
    for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.md')).sort()) {
      const match = FRONTMATTER.exec(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (!match) {
        continue;
      }
      const data = parseYaml(match[1]) as { title: string; label?: string; unit: number; order: number; draft?: boolean };
      if (data.draft) {
        continue;
      }
      lessons.push({
        id: `${unitDir}/${name.slice(0, -'.md'.length)}`,
        title: data.title,
        label: data.label,
        unit: data.unit,
        order: data.order,
        html: await renderMarkdown(match[2]),
      });
    }
  }
  return lessons;
}

describe('용어사전 — 나오는 차시', () => {
  it('모든 항목이 차시 본문 한 곳 이상에서 :용어[…]로 이어지고, 차시의 :용어[…]는 모두 항목을 찾는다', async () => {
    const entries = readGlossary();
    const registry = createGlossaryRegistry(entries);
    const lessons = await readLessons();
    expect(lessons.length, '초안이 아닌 차시 수').toBeGreaterThanOrEqual(45);
    const { byEntry, problems } = collectLessonsByEntry(lessons, registry);
    expect(problems.map(formatGlossaryProblem), '사전에 없는 :용어[…]').toEqual([]);
    const empty = registry.entries.filter((entry) => (byEntry.get(entry.id) ?? []).length === 0).map((entry) => entry.id);
    expect(empty, '나오는 차시가 빈 항목 — 그 낱말이 처음 나오는 차시 본문 자리에 :용어[낱말]을 적어요').toEqual([]);

    // PM-06에서 비어 있던 다섯 낱말은 뜻을 설명하는 차시와 이어져야 한다.
    const lessonIds = (id: string) => (byEntry.get(id) ?? []).map((link: GlossaryLessonLink) => link.id);
    expect(lessonIds('bounding-box')).toEqual(expect.arrayContaining(['u1/1-1-2', 'u1/1-3-3']));
    expect(lessonIds('algorithm')).toEqual(expect.arrayContaining(['u1/1-1-3', 'u2/2-2-4']));
    expect(lessonIds('open-source')).toEqual(expect.arrayContaining(['u1/1-1-2', 'u1/1-1-3']));
    expect(lessonIds('model')).toEqual(expect.arrayContaining(['u1/1-1-2', 'u1/1-2-1']));
    expect(lessonIds('resolution')).toEqual(expect.arrayContaining(['u1/v1', 'u1/1-2-3']));
  }, 60_000);
});
