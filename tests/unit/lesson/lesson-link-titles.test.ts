// 차시 본문의 다른 차시 링크 글이 그 차시의 지금 제목과 같은지(판 1.9.3, DECISIONS C244 — 미해결 239).
// 판 1.4.0(C137)이 차시 제목을 출판본에 맞춰 frontmatter만 바꾼 뒤, 본문의 "다음 차시 [2-2-4 서보모터 활용하기](…)"처럼
// 링크 글이 옛 제목으로 남았다. 링크 글이 "<번호> <제목>" 꼴이면 제목은 가리키는 차시 frontmatter의 title과 같아야 한다.
// 제목 끝의 괄호 덧말(예: "말을 글로 바꾸는 기술(선택 차시)")은 문장 안에서 빼도 된다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const LESSON_ROOT = path.resolve('content', 'lessons');

interface LessonHead {
  readonly file: string;
  readonly href: string;
  readonly label: string;
  readonly title: string;
  readonly text: string;
}

function readLessons(): LessonHead[] {
  const lessons: LessonHead[] = [];
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
      const head = /^---\n([\s\S]*?)\n---/u.exec(text)?.[1];
      if (!head) {
        continue;
      }
      const data = parse(head) as { label?: unknown; title?: unknown };
      if (typeof data.label !== 'string' || typeof data.title !== 'string') {
        continue;
      }
      lessons.push({
        file: `${unit}/${file}`,
        href: `/learn/${unit}/${file.replace(/\.md$/u, '')}/`,
        label: data.label,
        title: data.title,
        text,
      });
    }
  }
  return lessons;
}

/** 제목 끝의 괄호 덧말을 뗀 꼴 */
function withoutTrailingNote(title: string): string {
  return title.replace(/\s*\([^()]*\)$/u, '');
}

describe('차시 본문의 차시 링크 글', () => {
  const lessons = readLessons();
  const byHref = new Map(lessons.map((lesson) => [lesson.href, lesson]));

  it('차시를 읽었다(45편 안팎)', () => {
    expect(lessons.length).toBeGreaterThanOrEqual(40);
  });

  it('"<번호> <제목>" 꼴 링크 글의 제목이 가리키는 차시의 지금 제목과 같다', () => {
    const problems: string[] = [];
    const link = /\[([^\]\n]+)\]\((\/learn\/u\d\/[a-z0-9-]+\/)(#[^)]*)?\)/gu;
    for (const lesson of lessons) {
      for (const match of lesson.text.matchAll(link)) {
        const [, rawText, href] = match;
        const target = byHref.get(href);
        const linkText = rawText.replace(/\*\*/gu, '').trim();
        if (!target || !linkText.startsWith(`${target.label} `)) {
          continue;
        }
        const shown = linkText.slice(target.label.length + 1).trim();
        if (shown !== target.title && shown !== withoutTrailingNote(target.title)) {
          problems.push(`${lesson.file}: [${linkText}] → 지금 제목 "${target.title}"`);
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
