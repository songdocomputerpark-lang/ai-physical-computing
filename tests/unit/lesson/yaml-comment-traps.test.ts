// YAML 주석 함정(scripts/lib/yaml-comment-traps.mjs) — 따옴표 없는 글 값 안의 " #"부터 주석이 되어 글이 잘리는 곳.
// 2026-09-25 Phase 5 검토 중요 1(4-2-2 퀴즈 풀이가 반쪽 문장으로 나감)에서 만든 검사다. 차시 frontmatter는 npm run check:lessons가 보고,
// 여기서는 함수의 규칙과, 사람이 글을 적는 다른 YAML(예제 사이드카·그림 목록·오류 사전·교사용 자료실·용어사전)을 모두 훑는다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findYamlCommentTraps } from '../../../scripts/lib/yaml-comment-traps.mjs';

describe('findYamlCommentTraps', () => {
  it('글 칸(explain·description·choices 등)의 같은 줄 주석은 함정이고, 따옴표로 감싼 값·줄 주석은 아니다', () => {
    const text = [
      'title: 제목',
      'explain: 원래 파일은 세 줄 앞에 #이 붙어 있어요.',
      'q: "따옴표 # 안은 괜찮아요"',
      '# 줄 주석은 괜찮아요',
      'choices:',
      '  - 첫째 # 꼬리',
      'description: 설명이에요 # 일부러 단 주석도 글 칸이면 잘린 것으로 봐요',
    ].join('\n');
    expect(findYamlCommentTraps(text)).toEqual([
      { line: 2, key: 'explain', value: '원래 파일은 세 줄 앞에', comment: '이 붙어 있어요.' },
      { line: 6, key: 'choices', value: '첫째', comment: '꼬리' },
      { line: 7, key: 'description', value: '설명이에요', comment: '일부러 단 주석도 글 칸이면 잘린 것으로 봐요' },
    ]);
  });

  it('숫자·참거짓·목록 뒤의 주석과, 글 칸이 아닌 값의 "# 설명" 주석은 괜찮다. "#" 바로 뒤가 글자면 어느 칸이든 함정', () => {
    const text = ['answer: 1        # 순번', 'draft: false # 초안', 'tags: [a, b] # 태그', 'file: a/b.py  # 경로', 'pin: GPIO#2번'].join('\n');
    expect(findYamlCommentTraps(text)).toEqual([]);
    expect(findYamlCommentTraps('file: a/b.py #경로')).toEqual([{ line: 1, key: 'file', value: 'a/b.py', comment: '경로' }]);
  });
});

/** 저장소 뿌리 기준 폴더에서 이름이 맞는 파일(정렬) */
function listFiles(directory: string, match: (name: string) => boolean): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }
  const found: string[] = [];
  for (const dirent of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, dirent.name);
    if (dirent.isDirectory()) {
      found.push(...listFiles(child, match));
    } else if (match(dirent.name)) {
      found.push(child);
    }
  }
  return found.sort();
}

function frontmatterOf(text: string): string {
  return /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text)?.[1] ?? '';
}

describe('저장소의 사람이 쓰는 YAML에 주석 함정이 없다', () => {
  const targets = [
    ...listFiles('examples', (name) => name.endsWith('.meta.yaml')).map((file) => ({ file, text: fs.readFileSync(file, 'utf8') })),
    ...listFiles('content', (name) => name.endsWith('.yaml')).map((file) => ({ file, text: fs.readFileSync(file, 'utf8') })),
    ...listFiles(path.join('content', 'glossary'), (name) => name.endsWith('.md')).map((file) => ({ file, text: frontmatterOf(fs.readFileSync(file, 'utf8')) })),
  ];

  // 차시 md의 frontmatter는 npm run check:lessons(fm-yaml-comment)가 본다 — npm test에 차시 전체 검사를 넣지 않는 까닭은 PD-35(PLAN §8.5 P5-02 구현 메모).
  it('훑는 파일이 있다(사이드카·그림 목록·오류 사전·교사용 자료실·용어사전)', () => {
    expect(targets.length).toBeGreaterThan(200);
  });

  it.each(targets.map((target) => [target.file, target.text] as const))('%s', (_file, text) => {
    expect(findYamlCommentTraps(text)).toEqual([]);
  });
});
