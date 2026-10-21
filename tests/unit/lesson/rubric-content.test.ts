// 채점 기준 표(### 채점 기준)를 채운 차시 10편 — 1-1-1(본보기) + 2단원 9편(판 1.6.0 C175). 실제 md를 읽어 표 모양을 지킨다.
// 나머지 차시는 아직 표가 없다(PROGRESS 미해결) — 이 목록에 더할 때 이 시험이 모양을 지켜 준다.
import fs from 'node:fs';
import path from 'node:path';
import { markdownConfigDefaults, unified } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import { describe, expect, it } from 'vitest';
import { childElements, findAll, hasClass, parseHtml, textContent } from '../../../src/components/lesson/html-tree.ts';
import { RUBRIC_LEVELS, rubricIssues } from '../../../src/components/lesson/lesson-rules.ts';
import remarkBoxes from '../../../src/lib/remark-boxes.mjs';
import remarkGlossary from '../../../src/lib/remark-glossary.mjs';

/** 채점 기준을 채운 차시(content/lessons/<단원>/<파일>.md) */
const RUBRIC_LESSONS = [
  'u1/1-1-1',
  'u2/2-1-1',
  'u2/2-1-2',
  'u2/2-1-3',
  'u2/2-1-4',
  'u2/2-1-5',
  'u2/2-2-1',
  'u2/2-2-2',
  'u2/2-2-3',
  'u2/2-2-4',
] as const;

async function renderLesson(id: string): Promise<string> {
  const text = fs.readFileSync(path.resolve('content', 'lessons', `${id}.md`), 'utf8');
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '');
  const processor = unified({ remarkPlugins: [remarkDirective, remarkGlossary, remarkBoxes] as never });
  const renderer = await processor.createRenderer({ ...markdownConfigDefaults, syntaxHighlight: false });
  return (await renderer.render(body)).code;
}

describe('채점 기준 표를 채운 차시', () => {
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
