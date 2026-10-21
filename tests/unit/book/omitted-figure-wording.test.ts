// 교과서 쪽의 :::그림생략 상자(판 1.6.0 R6, 걷기 보고 B-14·B-61): "출판본 10쪽의 이 그림은 권리 때문에 싣지 않았어요."는 저작권 걱정을 일으키고 어디서 보라는 말이 없었다.
// 이제 모든 상자의 끝은 까닭 + "이 사이트에는 싣지 못했어요" + "책 N쪽에서 보세요."이고, N은 상자 제목("교과서 N쪽 …")의 쪽과 같다.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const files = fs.readdirSync('content/book').filter((name) => name.endsWith('.md'));

interface Box {
  readonly file: string;
  readonly page: string;
  readonly body: string;
}

function omittedBoxes(): Box[] {
  const boxes: Box[] = [];
  for (const name of files) {
    const lines = fs.readFileSync(`content/book/${name}`, 'utf8').split(/\r?\n/u);
    let current: { page: string; body: string[] } | null = null;
    for (const line of lines) {
      const start = /^\s*:::그림생략\[교과서 (\d+)쪽/u.exec(line);
      if (start) {
        current = { page: start[1] ?? '', body: [] };
        continue;
      }
      if (current && line.trim() === ':::') {
        boxes.push({ file: name, page: current.page, body: current.body.join('\n') });
        current = null;
        continue;
      }
      current?.body.push(line);
    }
  }
  return boxes;
}

describe(':::그림생략 상자 문구', () => {
  const boxes = omittedBoxes();

  it('상자가 40개 안팎 있다(옮겨 적을 때 하나를 빠뜨려 검사가 비지 않게)', () => {
    expect(boxes.length).toBeGreaterThanOrEqual(35);
  });

  it('모든 상자가 "이 사이트에는 싣지 못했어요. 책 N쪽에서 보세요."로 알리고 N이 제목의 쪽과 같다', () => {
    for (const box of boxes) {
      expect(box.body, `${box.file} ${box.page}쪽`).toContain('이 사이트에는 싣지 못했어요.');
      expect(box.body, `${box.file} ${box.page}쪽`).toContain(`책 ${box.page}쪽에서 보세요.`);
    }
  });

  it('"권리 때문에 싣지 않았어요"·"싣지 않았어요"가 상자 안에 남아 있지 않다', () => {
    for (const box of boxes) {
      expect(box.body, `${box.file} ${box.page}쪽`).not.toMatch(/권리 때문에|싣지 않았어요/u);
    }
  });
});
