// npm run check:book(scripts/check-book.mjs → scripts/lib/check-book.mjs, 판 1.4.0): 임시 폴더에 작은 저장소를 만들어 엄격 모드가 무엇에서 실패하는지 보인다.
// 규칙 하나하나는 book-rules.test.ts가 본다. 여기서는 파일을 여는 검사와 "오류면 실패, 참고는 통과"를 본다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatBookCheck, listBookFiles, readLessonKeys, reportFailed, runBookCheck } from '../../../scripts/lib/check-book.mjs';

let root = '';

function write(relative: string, content: string | Buffer): void {
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

const FRONTMATTER = `---
id: 2-1-2
title: LCD 제어하기
unit: 2
part: "01 디스플레이 장치 제어"
order: 2
pages: "124~125"
lesson: 2-1-2
media: [board]
---
`;

const BODY = [
  '::쪽[124]',
  '',
  '## 학습 목표',
  '',
  '- :용어[LCD]를 이해할 수 있다.',
  '',
  '## 1 LCD의 이해',
  '',
  '본문이다.',
  '',
  '::실습실[esp32/u2/2-1-2-lcd-count.py]',
  '',
  '::쪽[125]',
  '',
  '### 단계 1 | 설치하기',
  '',
  ':::말풍선',
  '말이야.',
  ':::',
  '',
].join('\n');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-check-book-'));
  write('examples/esp32/u2/2-1-2-lcd-count.py', 'print("안녕")\n');
  write('content/glossary/lcd.md', '---\ntitle: LCD\nsummary: 액정 화면이에요.\n---\n\n본문\n');
  write('content/lessons/u2/2-1-2.md', '---\ntitle: LCD 제어하기\nunit: 2\norder: 2\nlabel: 2-1-2\n---\n\n본문\n');
  write('content/book/2-1-2.md', `${FRONTMATTER}\n${BODY}`);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

async function run(options: { only?: string[]; includeDrafts?: boolean } = {}) {
  const report = await runBookCheck({ rootDir: root, ...options });
  return { report, text: formatBookCheck(report), failed: reportFailed(report) };
}

describe('check:book — 통과와 실패', () => {
  it('규칙을 모두 지킨 쪽은 통과한다', async () => {
    const { report, text, failed } = await run();
    expect(report.books).toHaveLength(1);
    expect(report.books[0]?.issues).toEqual([]);
    expect(failed).toBe(false);
    expect(text).toContain('[통과] content/book/2-1-2.md  2-1-2 LCD 제어하기 (124~125쪽)');
    expect(text).toMatch(/결과: 교과서 쪽 1개 검사 — 통과 1, 실패 0/u);
  });

  it('쪽 표지가 빠지면 실패하고 고칠 곳을 한국어로 알린다', async () => {
    write('content/book/2-1-2.md', `${FRONTMATTER}\n${BODY.replace('::쪽[125]', '')}`);
    const { text, failed } = await run();
    expect(failed).toBe(true);
    expect(text).toContain('[실패] content/book/2-1-2.md');
    expect(text).toContain('오류 [book-page-marks] 쪽 표지가 빠진 쪽이 있어요: 125쪽');
  });

  it('설정 칸 오류(쪽 범위 모양·없는 칸)는 실패한다', async () => {
    write('content/book/2-1-2.md', `${FRONTMATTER.replace('pages: "124~125"', 'pages: "124-125"')}\n${BODY}`);
    const { text, failed } = await run();
    expect(failed).toBe(true);
    expect(text).toContain('오류 [fm-schema] 설정 칸 pages');
  });

  it('YAML 문법 오류는 한국어로 풀어 알린다', async () => {
    write('content/book/2-1-2.md', `${FRONTMATTER.replace('title: LCD 제어하기', 'title: LCD 제어: 하기')}\n${BODY}`);
    const { text } = await run();
    expect(text).toContain('오류 [fm-schema] 설정 칸 YAML 문법 오류');
  });

  it('::실습실의 예제 파일이 없으면 실패한다', async () => {
    fs.rmSync(path.join(root, 'examples/esp32/u2/2-1-2-lcd-count.py'));
    const { text, failed } = await run();
    expect(failed).toBe(true);
    expect(text).toContain('오류 [book-lab-file] ::실습실[esp32/u2/2-1-2-lcd-count.py]');
  });

  it('모르는 상자 이름(오타)은 오류, 웹 차시용 상자도 오류', async () => {
    write('content/book/2-1-2.md', `${FRONTMATTER}\n${BODY}\n:::말풍성\n오타\n:::\n\n:::도전\n웹 차시용\n:::\n`);
    const { text } = await run();
    expect(text).toContain('오류 [box-unknown]');
    expect(text).toContain('오류 [book-box]');
  });

  it('용어사전에 없는 :용어는 참고(통과)다', async () => {
    write('content/book/2-1-2.md', `${FRONTMATTER}\n${BODY}\n사전에 없는 :용어[낱말]이다.\n`);
    const { report, failed } = await run();
    expect(failed).toBe(false);
    expect(report.books[0]?.issues.map((issue) => [issue.level, issue.code])).toEqual([['warning', 'glossary']]);
  });

  it('그림: 파일이 없으면 오류, 래스터 그림은 눈 확인 기록이 있어야 한다(그림 목록 reviewed)', async () => {
    write('content/book/2-1-2.md', `${FRONTMATTER}\n${BODY}\n![LCD 첫 줄에 글자가 보이는 사진](/images/lessons/2-1-2/a.webp)\n`);
    const missing = await run();
    expect(missing.text).toContain('오류 [img-file] 그림 파일 public/images/lessons/2-1-2/a.webp이(가) 없어요');
    write('public/images/lessons/2-1-2/a.webp', Buffer.from('RIFF0000WEBP'));
    const unreviewed = await run();
    expect(unreviewed.text).toContain('오류 [img-review] 그림 public/images/lessons/2-1-2/a.webp: 눈 확인 기록이 없어요');
  });

  it('그림 대체 글의 "시:분:초"처럼 콜론 바로 뒤에 글자가 오면 오류로 막는다(지시문으로 읽혀 글자가 사라진다)', async () => {
    write('content/book/2-1-2.md', `${FRONTMATTER}\n${BODY}\n![LCD에 11:00:01처럼 시각이 나오는 사진](/images/a.svg)\n`);
    const { text } = await run();
    expect(text).toContain('오류 [img-alt-colon]');
  });

  it('쪽 범위가 겹치는 두 파일은 실패한다', async () => {
    write('content/book/2-1-3.md', `${FRONTMATTER.replace('id: 2-1-2', 'id: 2-1-3').replace('pages: "124~125"', 'pages: "125~126"').replace('lesson: 2-1-2', 'lesson: 2-1-3')}\n${BODY.replace('::쪽[124]', '::쪽[125]').replace('::쪽[125]\n\n###', '::쪽[126]\n\n###')}`);
    const { text, failed } = await run();
    expect(failed).toBe(true);
    expect(text).toContain('오류 [book-pages-overlap] 125쪽을 2-1-2와 2-1-3가 함께 맡아요');
  });

  it('초안(draft: true)은 건너뛰고, --drafts면 함께 검사한다', async () => {
    write('content/book/2-1-3.md', `${FRONTMATTER.replace('id: 2-1-2', 'id: 2-1-3').replace('pages: "124~125"', 'pages: "126~127"').replace('lesson: 2-1-2', 'draft: true')}\n쪽 표지도 없는 쓰다 만 글이다.\n`);
    const skipped = await run();
    expect(skipped.failed).toBe(false);
    expect(skipped.text).toContain('[건너뜀] content/book/2-1-3.md');
    const included = await run({ includeDrafts: true });
    expect(included.failed).toBe(true);
    expect(included.text).toContain('[실패] content/book/2-1-3.md');
  });

  it('쪽 id·파일 경로로 몇 개만 검사할 수 있다', async () => {
    write('content/book/2-1-3.md', `${FRONTMATTER.replace('id: 2-1-2', 'id: 2-1-3').replace('pages: "124~125"', 'pages: "126~127"')}\n쪽 표지 없는 글이다.\n`);
    const only = await run({ only: ['2-1-2'] });
    expect(only.report.books.map((book) => book.id)).toEqual(['2-1-2']);
    expect(only.failed).toBe(false); // 고른 쪽만 검사한다 — 쪽 표지 없는 2-1-3의 문제는 이번 결과에 들어오지 않는다
    expect((await run()).failed).toBe(true); // 모두 검사하면 2-1-3이 실패한다
  });
});

describe('도우미', () => {
  it('쪽 파일 목록은 content/book의 .md만(그림 목록 yaml은 뺀다)', () => {
    write('content/book/2-1-2.images.yaml', 'images: []\n');
    expect(listBookFiles(root)).toEqual(['content/book/2-1-2.md']);
  });

  it('웹 차시 짝 확인용 키(단원·차시 번호·파일 이름)만 읽는다', () => {
    expect(readLessonKeys(root)).toEqual([{ unit: 2, label: '2-1-2', slug: '2-1-2' }]);
  });

  it('쪽이 하나도 없는 저장소는 빈 결과(실패 아님)', async () => {
    fs.rmSync(path.join(root, 'content/book'), { recursive: true });
    const { report, failed } = await run();
    expect(report.books).toEqual([]);
    expect(failed).toBe(false);
  });
});
