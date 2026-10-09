// 선택 보충 차시 id 모양(src/lib/progress.ts isSupplementId)과 차시 파일의 kind: supplement가 어긋나지 않는지 본다(R2-020).
// 진도 쪽은 차시 파일을 읽지 못하므로 id 모양(v1·c1·p1)으로 보충 차시를 가린다 — 새 보충 차시의 파일 이름이 다른 모양이면 여기서 막힌다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSupplementId } from '../../../src/lib/progress.ts';

const LESSONS_DIR = path.resolve('content/lessons');

function lessonFiles(): { id: string; kind: string | undefined }[] {
  const found: { id: string; kind: string | undefined }[] = [];
  for (const unit of fs.readdirSync(LESSONS_DIR, { withFileTypes: true })) {
    if (!unit.isDirectory() || !/^u[1-4]$/u.test(unit.name)) {
      continue;
    }
    for (const file of fs.readdirSync(path.join(LESSONS_DIR, unit.name))) {
      if (!file.endsWith('.md')) {
        continue;
      }
      const text = fs.readFileSync(path.join(LESSONS_DIR, unit.name, file), 'utf8');
      const head = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text)?.[1] ?? '';
      found.push({ id: `${unit.name}/${file.replace(/\.md$/u, '')}`, kind: /^kind:\s*(\S+)/mu.exec(head)?.[1] });
    }
  }
  return found;
}

describe('선택 보충 차시 id ↔ kind: supplement', () => {
  it('kind: supplement인 차시만 isSupplementId가 true다', () => {
    const files = lessonFiles();
    expect(files.length).toBeGreaterThan(20);
    const mismatched = files.filter((file) => isSupplementId(file.id) !== (file.kind === 'supplement')).map((file) => file.id);
    expect(mismatched).toEqual([]);
  });
});
