// 채점 기준 표(### 채점 기준)가 있어야 하는 차시 — 교과서 차시(kind: textbook)와 보충 차시(kind: supplement) 40편 전부(판 1.7.0 Z3, 미해결 269).
// 1-1-1(본보기)과 2단원 9편은 판 1.6.0 C175, 나머지 30편은 판 1.7.0에서 채웠다. 실제 md를 읽어 표 모양을 지킨다.
// 대단원 마무리(kind: review)·읽기 자료·프로젝트 안내(kind: reading)는 평가 칸을 따로 쓰므로 표를 두지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { markdownConfigDefaults, unified } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import { describe, expect, it } from 'vitest';
import { childElements, findAll, hasClass, parseHtml, textContent } from '../../../src/components/lesson/html-tree.ts';
import { RUBRIC_LEVELS, rubricIssues } from '../../../src/components/lesson/lesson-rules.ts';
import remarkBoxes from '../../../src/lib/remark-boxes.mjs';
import remarkGlossary from '../../../src/lib/remark-glossary.mjs';

const LESSON_ROOT = path.resolve('content', 'lessons');

/** 표가 있어야 하는 종류(frontmatter의 kind) */
const RUBRIC_KINDS = new Set(['textbook', 'supplement']);

/** 표가 있어야 하는 차시 id(<단원 폴더>/<파일 이름>) — content/lessons를 읽어 저절로 모은다(새 차시를 더하면 이 시험이 표를 요구한다) */
function lessonsNeedingRubric(): string[] {
  const ids: string[] = [];
  for (const unit of fs.readdirSync(LESSON_ROOT)) {
    const folder = path.join(LESSON_ROOT, unit);
    if (!fs.statSync(folder).isDirectory()) {
      continue;
    }
    for (const file of fs.readdirSync(folder)) {
      if (!file.endsWith('.md')) {
        continue;
      }
      const text = fs.readFileSync(path.join(folder, file), 'utf8');
      const kind = /^kind:\s*(\S+)\s*$/mu.exec(text)?.[1];
      if (kind && RUBRIC_KINDS.has(kind)) {
        ids.push(`${unit}/${file.replace(/\.md$/u, '')}`);
      }
    }
  }
  return ids.sort();
}

const RUBRIC_LESSONS = lessonsNeedingRubric();

async function renderLesson(id: string): Promise<string> {
  const text = fs.readFileSync(path.resolve('content', 'lessons', `${id}.md`), 'utf8');
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '');
  const processor = unified({ remarkPlugins: [remarkDirective, remarkGlossary, remarkBoxes] as never });
  const renderer = await processor.createRenderer({ ...markdownConfigDefaults, syntaxHighlight: false });
  return (await renderer.render(body)).code;
}

describe('채점 기준 표가 있어야 하는 차시', () => {
  it('교과서·보충 차시를 모두 찾는다(2026-10-22 기준 40편 — 대단원 마무리·읽기 자료·프로젝트 안내 5편은 뺀다)', () => {
    expect(RUBRIC_LESSONS.length).toBeGreaterThanOrEqual(40);
    expect(RUBRIC_LESSONS).toContain('u1/1-1-1');
    expect(RUBRIC_LESSONS).toContain('u4/4-2-2');
    expect(RUBRIC_LESSONS).not.toContain('u2/review');
    expect(RUBRIC_LESSONS).not.toContain('u4/project');
  });

  for (const id of RUBRIC_LESSONS) {
    it(`${id}: 표 모양이 맞고(잘함·보통·노력 요함 × 관찰 항목 2~3개) 빈 칸이 없다`, async () => {
      const tree = parseHtml(await renderLesson(id));
      const boxes = findAll(tree, (element) => hasClass(element, 'box') && hasClass(element, 'box--teacher'));
      expect(boxes.length).toBeGreaterThan(0);
      expect(rubricIssues(boxes)).toEqual([]);
      // 표가 실제로 있고 머리줄이 "관찰 항목 | 잘함 | 보통 | 노력 요함"이다(위 검사는 "없음"을 참고로만 알리므로 한 번 더 확인).
      const siblings = boxes.map((box) => childElements(box)).find((children) => children.some((element) => element.tag === 'h3' && textContent(element).includes('채점 기준')));
      expect(siblings, `${id}에 "### 채점 기준"`).toBeDefined();
      const start = (siblings ?? []).findIndex((element) => element.tag === 'h3' && textContent(element).includes('채점 기준'));
      const table = (siblings ?? []).slice(start + 1).find((element) => element.tag === 'table');
      expect(table, `${id}의 채점 기준 표`).toBeDefined();
      const head = findAll(table!, (element) => element.tag === 'tr')[0];
      const cells = head ? childElements(head).map((cell) => textContent(cell).trim()) : [];
      expect(cells.slice(1)).toEqual([...RUBRIC_LEVELS]);
    });
  }
});
