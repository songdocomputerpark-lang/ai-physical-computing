// npm run check:lessons(scripts/check-lessons.mjs → scripts/lib/check-lessons.mjs, PLAN §8.5 P5-02, PD-35)
// 임시 폴더에 작은 저장소(차시 md·예제·그림·그림 목록·용어사전)를 만들어 엄격 모드가 무엇에서 실패하는지 보인다.
// 파일을 열지 않는 규칙 하나하나는 lesson-rules.test.ts가 본다. 여기서는 파일 검사와 "오류면 실패, 참고는 통과"를 본다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  formatLessonCheck,
  listLessonFiles,
  reportFailed,
  runLessonCheck,
  splitFrontmatter,
} from '../../../scripts/lib/check-lessons.mjs';

let root = '';

function write(relative: string, content: string | Buffer): void {
  const target = path.join(root, ...relative.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

const FRONTMATTER = `---
title: 사진은 숫자다
unit: 1
order: 3.1
kind: supplement
label: V1
description: 시험용 차시예요.
standards: []
duration: 50
difficulty: 1
lab: vision
examples:
  - file: vision/supplement/v1-pixel-numbers.py
quiz:
  - { q: 첫 문제, choices: [가, 나, 다], answer: 0, explain: 풀이 하나 }
  - { q: 둘째 문제, choices: [가, 나, 다], answer: 1, explain: 풀이 둘 }
  - { q: 셋째 문제, choices: [가, 나, 다], answer: 2, explain: 풀이 셋 }
---
`;

const SECTIONS: Record<string, string> = {
  학습목표: '- :용어[픽셀]을 설명할 수 있어요.',
  '왜 배울까': '까닭을 설명하는 문단이에요.\n\n![왜 배우는지 보여 주는 사이트 그림](/images/lessons/v1/why.svg)',
  '핵심 개념': '### 개념\n\n![개념을 한눈에 보여 주는 사이트 그림](/images/lessons/v1/concept.svg)',
  따라하기: '실행해요.\n\n::예제\n\n:::왜그럴까\n이유예요.\n:::',
  바꿔보기: ':::바꿔보기\n1. 하나\n2. 둘\n3. 셋\n:::',
  '도전 과제': '::::도전[도전 과제: 해 보기]\n과제\n\n:::힌트\n힌트\n:::\n::::',
  '확인 퀴즈': '::퀴즈',
  교사용: ':::교사용\n### 지도안 요약\n요약\n\n### 평가 포인트\n- 포인트\n\n### 자주 막히는 곳\n- 곳\n:::',
};

function lesson(sections: Record<string, string> = SECTIONS, frontmatter = FRONTMATTER): string {
  return `${frontmatter}\n${Object.entries(sections)
    .map(([title, body]) => `## ${title}\n\n${body}`)
    .join('\n\n')}\n`;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-check-lessons-'));
  write('examples/vision/supplement/v1-pixel-numbers.py', 'print("안녕")\n');
  write('public/images/lessons/v1/why.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  write('public/images/lessons/v1/concept.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  write('content/glossary/pixel.md', '---\ntitle: 픽셀\nsummary: 디지털 사진을 이루는 작은 점이에요.\n---\n\n본문\n');
  write('content/lessons/u1/v1.md', lesson());
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

async function run(options: { only?: string[]; includeDrafts?: boolean; complete?: boolean } = {}) {
  const report = await runLessonCheck({ rootDir: root, ...options });
  return { report, text: formatLessonCheck(report), failed: reportFailed(report) };
}

describe('check:lessons — 통과와 실패', () => {
  it('틀을 모두 갖춘 차시는 통과하고, 아직 없는 차시는 목록으로만 알린다(실패 아님)', async () => {
    const { report, text, failed } = await run();
    expect(failed).toBe(false);
    expect(report.lessons).toHaveLength(1);
    expect(report.lessons[0]?.issues).toEqual([]);
    expect(text).toContain('[통과] content/lessons/u1/v1.md  V1 사진은 숫자다');
    expect(report.missing.map((item) => item.label)).not.toContain('V1');
    expect(report.missing.map((item) => item.label)).toContain('1-1-1');
    expect(text).toContain('아직 md가 없는 차시');
    expect(text).toMatch(/결과: 차시 1개 검사 — 통과 1, 실패 0/u);
  });

  it('칸이 빠진 차시는 실패한다(같은 문제를 빌드는 경고로만 — lesson-rules.ts를 함께 씀)', async () => {
    const { 바꿔보기: _removed, ...rest } = SECTIONS;
    write('content/lessons/u1/v1.md', lesson(rest));
    const { text, failed } = await run();
    expect(failed).toBe(true);
    expect(text).toContain('[실패] content/lessons/u1/v1.md');
    expect(text).toContain('오류 [sec-missing] "바꿔보기" 칸(## 바꿔보기)이 없어요');
  });

  it('--complete이면 차례표의 차시가 모두 있어야 통과한다(Phase 5 완료 기준)', async () => {
    const { failed, text } = await run({ complete: true });
    expect(failed).toBe(true);
    expect(text).toContain('--complete: 실패');
  });

  it('초안(draft: true)은 건너뛰고, --drafts면 함께 검사한다. 초안은 "아직 없는 차시"에 초안 파일로 보인다', async () => {
    write('content/lessons/supplement/c3.md', lesson({ 학습목표: '- 목표예요.' }, FRONTMATTER.replace('label: V1', 'label: C3').replace('unit: 1', 'unit: 3').replace('order: 3.1', 'order: 4.3').replace('title: 사진은 숫자다', 'title: 손가락 개수만큼 LED 켜기').replace('---\n', '---\ndraft: true\n')));
    const skipped = await run();
    expect(skipped.failed).toBe(false);
    expect(skipped.text).toContain('[건너뜀] content/lessons/supplement/c3.md');
    expect(skipped.report.missing.find((item) => item.label === 'C3')?.draftFile).toBe('content/lessons/supplement/c3.md');
    const included = await run({ includeDrafts: true });
    expect(included.failed).toBe(true);
    expect(included.text).toContain('[실패] content/lessons/supplement/c3.md');
  });

  it('차시 번호·파일 이름으로 몇 개만 검사할 수 있다(그때는 아직 없는 차시 목록을 보이지 않음)', async () => {
    const { report } = await run({ only: ['v1'] });
    expect(report.lessons.map((item) => item.slug)).toEqual(['v1']);
    expect(report.missing).toEqual([]);
    expect((await run({ only: ['9-9-9'] })).report.lessons).toEqual([]);
  });
});

describe('check:lessons — 파일을 여는 검사', () => {
  it('example-file: 예제 파일이 없거나 줄 끝이 CRLF면 실패', async () => {
    fs.rmSync(path.join(root, 'examples'), { recursive: true });
    expect((await run()).text).toContain('오류 [example-file] 예제 파일 examples/vision/supplement/v1-pixel-numbers.py이(가) 없어요');
    write('examples/vision/supplement/v1-pixel-numbers.py', 'print(1)\r\n');
    expect((await run()).text).toContain('줄 끝이 CRLF');
  });

  it('fm-yaml-comment: 따옴표 없는 풀이 안의 " #"부터 주석이 되어 글이 잘리면 실패하고, 따옴표로 감싸면 통과한다(Phase 5 검토 중요 1)', async () => {
    const cut = FRONTMATTER.replace('explain: 풀이 셋 }', 'explain: 풀이 셋 }\n  # 아래는 시험 문항\n').replace(
      'quiz:\n',
      'quiz:\n  - q: 넷째 문제\n    choices: [가, 나, 다]\n    answer: 0\n    explain: 앞에 #이 붙은 줄은 실행되지 않아요.\n',
    );
    write('content/lessons/u1/v1.md', lesson(SECTIONS, cut));
    const broken = await run();
    expect(broken.failed).toBe(true);
    expect(broken.text).toContain('오류 [fm-yaml-comment]');
    expect(broken.text).toContain('"앞에"에서 잘려요');

    write('content/lessons/u1/v1.md', lesson(SECTIONS, cut.replace('explain: 앞에 #이 붙은 줄은 실행되지 않아요.', 'explain: "앞에 #이 붙은 줄은 실행되지 않아요."')));
    expect((await run()).text).not.toContain('[fm-yaml-comment]');
  });

  it('fm-yaml-comment: 차시 예제의 사이드카(.meta.yaml) 설명이 주석으로 잘려도 실패한다. 숫자 뒤 주석(answer: 1  # 순번)은 괜찮다', async () => {
    write('examples/vision/supplement/v1-pixel-numbers.meta.yaml', 'title: 픽셀 숫자\ndifficulty: 1   # 쉬움\ndescription: 1번 #2번 차례로 읽어요.\n');
    const { text, failed } = await run();
    expect(failed).toBe(true);
    expect(text).toContain('사이드카 examples/vision/supplement/v1-pixel-numbers.meta.yaml 3행(description)');
    expect(text.match(/\[fm-yaml-comment\]/gu)).toHaveLength(1);
  });

  it('example-focus: 발췌할 줄이 파일 밖이면 실패, 150줄 넘는 예제에 focus가 없으면 참고', async () => {
    write('examples/vision/supplement/v1-pixel-numbers.py', `${Array.from({ length: 160 }, (_, index) => `x${index} = ${index}`).join('\n')}\n`);
    const long = await run();
    expect(long.failed).toBe(false);
    expect(long.text).toContain('참고 [example-focus] 예제 examples/vision/supplement/v1-pixel-numbers.py이(가) 160줄이에요');

    write('content/lessons/u1/v1.md', lesson(SECTIONS, FRONTMATTER.replace('  - file: vision/supplement/v1-pixel-numbers.py\n', '  - file: vision/supplement/v1-pixel-numbers.py\n    focus: "1-5, 150-170"\n')));
    const outside = await run();
    expect(outside.failed).toBe(true);
    expect(outside.text).toContain('오류 [example-focus] examples의 vision/supplement/v1-pixel-numbers.py focus: 150-170행 — 파일은 160줄이라 160행까지만 보여요.');
  });

  it('img-file: 본문 그림 파일이 없거나 사이트 밖 주소면 실패', async () => {
    fs.rmSync(path.join(root, 'public/images/lessons/v1/why.svg'));
    const sections = { ...SECTIONS, 따라하기: `${SECTIONS['따라하기']}\n\n![바깥에서 가져온 그림 한 장이에요](https://example.com/a.png)` };
    write('content/lessons/u1/v1.md', lesson(sections));
    const { text, failed } = await run();
    expect(failed).toBe(true);
    expect(text).toContain('그림 파일 public/images/lessons/v1/why.svg이(가) 없어요');
    expect(text).toContain('사이트 밖 주소');
  });

  it('img-review·img-alt-manifest: 차시 그림 폴더의 래스터 그림은 눈 확인 기록이 있어야 하고, 대체 글이 그림 목록과 같아야 한다', async () => {
    write('public/images/lessons/v1/photo.webp', Buffer.from('RIFF0000WEBP'));
    const withPhoto = { ...SECTIONS, 따라하기: `${SECTIONS['따라하기']}\n\n![목록과 다른 대체 글이에요](/images/lessons/v1/photo.webp)` };
    write('content/lessons/u1/v1.md', lesson(withPhoto));
    expect((await run()).text).toContain('오류 [img-review] 그림 public/images/lessons/v1/photo.webp: 눈 확인 기록이 없어요');

    write(
      'content/lessons/u1/v1.images.yaml',
      [
        'images:',
        '  - name: photo',
        '    use: 시험용 그림',
        '    alt: 시험용으로 만든 사진 한 장의 설명이에요',
        '    origin: 단위 테스트가 만든 그림',
        '    file: public/images/lessons/v1/photo.webp',
        '    reviewed:',
        '      by: test',
        '      date: 2026-09-25',
        '      result: 통과 — 시험용',
        '',
      ].join('\n'),
    );
    const mismatch = await run();
    expect(mismatch.text).not.toContain('[img-review]');
    expect(mismatch.text).toContain('오류 [img-alt-manifest]');
    expect(mismatch.text).toContain('"시험용으로 만든 사진 한 장의 설명이에요"');

    const same = { ...SECTIONS, 따라하기: `${SECTIONS['따라하기']}\n\n![시험용으로 만든 사진 한 장의 설명이에요](/images/lessons/v1/photo.webp)` };
    write('content/lessons/u1/v1.md', lesson(same));
    expect((await run()).failed).toBe(false);
  });

  it('box-unknown: 모르는 상자 이름(오타)은 실패, glossary: 사전에 없는 낱말은 참고(실패 아님)', async () => {
    const sections = { ...SECTIONS, 따라하기: `${SECTIONS['따라하기']}\n\n:::왜그럴가\n오타\n:::\n\n:용어[없는말]이 있어요.` };
    write('content/lessons/u1/v1.md', lesson(sections));
    const { text, report } = await run();
    expect(text).toContain('오류 [box-unknown]');
    expect(text).toContain('참고 [glossary] :용어[없는말]');
    const issues = report.lessons[0]?.issues ?? [];
    expect(issues.filter((item) => item.code === 'glossary').map((item) => item.level)).toEqual(['warning']);
  });

  it('lesson-path: 두 파일이 같은 차시 번호를 쓰면 실패(빌드는 경고)', async () => {
    write('content/lessons/u1/v1-copy.md', lesson());
    const { text, failed } = await run();
    expect(failed).toBe(true);
    expect(text).toContain('[lesson-path] 차시 번호 V1이 두 파일');
  });

  it('frontmatter 형식 오류는 그 차시를 실패로 알리고 다른 차시는 계속 검사한다', async () => {
    write('content/lessons/u1/v2.md', lesson(SECTIONS, FRONTMATTER.replace('unit: 1', 'unit: 7').replace('label: V1', 'label: V2')));
    const { text, failed } = await run();
    expect(failed).toBe(true);
    expect(text).toContain('[실패] content/lessons/u1/v2.md');
    expect(text).toContain('[fm-schema] 설정 칸 unit: 대단원 번호(unit)는 1, 2, 3, 4 중 하나로 적어요.');
    expect(text).toContain('[통과] content/lessons/u1/v1.md');
  });
});

describe('check:lessons — 도우미', () => {
  it('차시 md만 모으고(그림 목록 .images.yaml 제외), frontmatter와 본문을 나눈다', () => {
    write('content/lessons/u1/v1.images.yaml', 'images: []\n');
    expect(listLessonFiles(root)).toEqual(['content/lessons/u1/v1.md']);
    expect(splitFrontmatter('---\na: 1\n---\n본문')).toEqual({ frontmatter: 'a: 1', body: '본문' });
    expect(splitFrontmatter('본문만')).toEqual({ frontmatter: null, body: '본문만' });
  });
});
