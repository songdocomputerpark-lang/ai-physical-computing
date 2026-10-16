// 낱말 띄어쓰기 통일(판 1.3.0 검수 R2-038) — 같은 화면에서 '영상 처리/영상처리', '피지컬 컴퓨팅/피지컬컴퓨팅'이 섞이지 않게 한다.
// 쓰는 모양: 영상 처리, 피지컬 컴퓨팅(띄어 쓴다). 예외는 아래 둘뿐이다.
// - 교육청 교육과정 원문의 영역 이름 '피지컬컴퓨팅'(성취기준 표 — 표 위에 원문 표기대로 적었다고 밝힌다)
// - 용어사전 '피지컬 컴퓨팅'의 검색 별칭(aliases) — 붙여 쓴 입력으로도 찾아지게
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPage } from '../../src/config/nav.ts';

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

// 메뉴 이름(판 1.6.0, DECISIONS C173) — 같은 45편의 두 쪽을 처음 온 사람이 구별하게 한다: 글만 있는 쪽은 "교과서 원문", 코드를 직접 실행하며 따라 하는 쪽은 "따라 하기".
// 옛 이름 "배우기"("풀이·실습")는 쪽 이름으로 더 쓰지 않는다. 동사로서의 "배우기"(예: "처음부터 배우기" 단추)는 그대로다.
/** 주석이 아닌 줄만 훑는다(글에 나가는 낱말만 본다) */
function visibleHits(pattern: RegExp): string[] {
  return shippedFiles()
    .filter((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split(/\r?\n/u)
        .some((line) => !/^\s*(?:\/\/|\*|\/\*|<!--|#)/u.test(line) && pattern.test(line)),
    )
    .map((file) => file.split(path.sep).join('/'));
}

describe('메뉴 이름(C173)', () => {
  it('머리글 메뉴의 두 이름은 "교과서 원문"·"따라 하기"이고 id·주소는 그대로다', () => {
    expect(getPage('book')).toMatchObject({ label: '교과서 원문', title: '교과서 원문', path: '/book/' });
    expect(getPage('learn')).toMatchObject({ label: '따라 하기', title: '따라 하기', path: '/learn/' });
  });

  it('옛 쪽 이름 "배우기 페이지·쪽·차례·목록·메뉴"를 쓴 글이 없다 — "따라 하기"로 쓴다', () => {
    expect(visibleHits(/배우기 (?:페이지|쪽|차례|목록|메뉴)/u)).toEqual([]);
  });
});
