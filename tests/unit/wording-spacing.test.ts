// 낱말 띄어쓰기 통일(판 1.3.0 검수 R2-038) — 같은 화면에서 '영상 처리/영상처리', '피지컬 컴퓨팅/피지컬컴퓨팅'이 섞이지 않게 한다.
// 쓰는 모양: 영상 처리, 피지컬 컴퓨팅(띄어 쓴다). 예외는 아래 둘뿐이다.
// - 교육청 교육과정 원문의 영역 이름 '피지컬컴퓨팅'(성취기준 표 — 표 위에 원문 표기대로 적었다고 밝힌다)
// - 용어사전 '피지컬 컴퓨팅'의 검색 별칭(aliases) — 붙여 쓴 입력으로도 찾아지게
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const TEXT_EXTENSIONS = new Set(['.ts', '.mjs', '.astro', '.css', '.md', '.yaml', '.yml', '.json', '.py', '.txt', '.svg']);

function walk(dir: string, accept: (file: string) => boolean, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, accept, found);
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name)) && accept(full)) {
      found.push(full);
    }
  }
  return found;
}

/** 화면·글에 나가는 파일: 사이트 코드, 차시·도움말 원고, 예제 설명(.meta.yaml) */
function shippedFiles(): string[] {
  return [
    ...walk('src', () => true),
    ...walk('content', () => true),
    ...walk('examples', (file) => file.endsWith('.meta.yaml')),
  ];
}

/** 붙여 쓴 검색어를 띄어 쓴 본문 말로 바꾸는 규칙 — 붙여 쓴 낱말이 있어야 하는 유일한 코드 */
const SEARCH_REWRITE_FILE = 'src/components/search/search-rank.ts';

function hits(needle: string): string[] {
  return shippedFiles()
    .filter((file) => fs.readFileSync(file, 'utf8').includes(needle))
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => file !== SEARCH_REWRITE_FILE);
}

describe('낱말 띄어쓰기 통일(R2-038)', () => {
  it('"영상처리"를 붙여 쓴 곳이 없다 — "영상 처리"로 쓴다', () => {
    expect(hits('영상처리')).toEqual([]);
  });

  it('"피지컬컴퓨팅"을 붙여 쓴 곳은 교육과정 원문 영역 이름과 검색 별칭뿐이다', () => {
    expect(hits('피지컬컴퓨팅').sort()).toEqual(
      [
        'content/glossary/physical-computing.md',
        'src/config/standards.ts',
        'src/pages/start/teacher/index.astro',
        'src/pages/teacher/standards/index.astro', // 영역 이름이 원문 표기라는 안내 문장의 보기
      ].sort(),
    );
  });
});
