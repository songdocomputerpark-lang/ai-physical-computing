// 교과서 쪽 검사 규칙(src/components/book/book-rules.ts, 판 1.4.0 — DECISIONS C131·C134): frontmatter·쪽 표지·학습 목표·상자·제목·그림·실습실
import { markdownConfigDefaults, unified } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import { describe, expect, it } from 'vitest';
import { bookSchema } from '../../../src/config/content-schemas.ts';
import { BOOK_ALLOWED_BOXES, BOOK_RULES, bookBodyIssues, bookFrontmatterIssues, checkBookRules, pageMarksOf } from '../../../src/components/book/book-rules.ts';
import { parseHtml } from '../../../src/components/lesson/html-tree.ts';
import remarkBoxes from '../../../src/lib/remark-boxes.mjs';
import remarkGlossary from '../../../src/lib/remark-glossary.mjs';

async function html(markdown: string): Promise<string> {
  const renderer = await unified({ remarkPlugins: [remarkDirective, remarkGlossary, remarkBoxes] as never }).createRenderer({
    ...markdownConfigDefaults,
    syntaxHighlight: false,
  });
  return (await renderer.render(markdown)).code;
}

function data(fields: Record<string, unknown> = {}) {
  return bookSchema.parse({ id: '2-1-2', title: 'LCD 제어하기', unit: 2, part: '01 디스플레이 장치 제어', order: 2, pages: '124~126', ...fields });
}

const GOOD_BODY = [
  '::쪽[124]',
  '',
  '## 학습 목표',
  '',
  '- 목표를 이해할 수 있다.',
  '',
  '## 1 LCD의 이해',
  '',
  '본문이다.',
  '',
  '::쪽[125]',
  '',
  '### 단계 1 | 설치하기',
  '',
  ':::말풍선',
  '말이야.',
  ':::',
  '',
  '::쪽[126]',
  '',
  '## 기본 실습 | 출력하기',
  '',
  '![LCD 첫 줄에 글자가 보이는 사진](/images/lessons/2-1-2/x.webp "교과서 126쪽")',
].join('\n');

const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);

describe('규칙 표', () => {
  it('규칙 이름이 모두 설명을 가진다', () => {
    for (const code of ['book-id', 'book-unit', 'book-part', 'book-pages', 'book-lesson', 'book-page-marks', 'book-goal-first', 'book-box', 'book-heading', 'book-lab', 'img-alt']) {
      expect(BOOK_RULES[code], code).toBeTruthy();
    }
  });

  it('쓸 수 있는 상자는 교과서 꼭지 14종 + 정답', () => {
    expect(BOOK_ALLOWED_BOXES).toHaveLength(15);
    expect(BOOK_ALLOWED_BOXES).toContain('bubble');
    expect(BOOK_ALLOWED_BOXES).toContain('answer');
    expect(BOOK_ALLOWED_BOXES).not.toContain('teacher');
  });
});

describe('frontmatter', () => {
  it('맞게 적은 쪽은 문제가 없다', () => {
    expect(bookFrontmatterIssues({ id: '2-1-2', data: data(), html: '' })).toEqual([]);
  });

  it('id가 파일 이름과 다르거나 단원이 id와 다르면 오류', () => {
    expect(codes(bookFrontmatterIssues({ id: '2-1-3', data: data(), html: '' }))).toContain('book-id');
    const wrongUnit = bookFrontmatterIssues({ id: '2-1-2', data: data({ unit: 3 }), html: '' });
    expect(wrongUnit.find((issue) => issue.code === 'book-unit')?.message).toContain('단원(2)');
    expect(codes(bookFrontmatterIssues({ id: '2-1-2', data: data({ unit: undefined }), html: '' }))).toContain('book-unit');
  });

  it('절은 중단원(part)이 필요하고, 대단원 마무리·앞 부속은 필요 없다', () => {
    expect(codes(bookFrontmatterIssues({ id: '2-1-2', data: data({ part: undefined }), html: '' }))).toContain('book-part');
    const review = data({ id: 'u2-review', part: undefined, pages: '180~181' });
    expect(bookFrontmatterIssues({ id: 'u2-review', data: review, html: '' })).toEqual([]);
    const front = bookSchema.parse({ id: 'front', title: '머리말', order: 0, pages: '2~3' });
    expect(bookFrontmatterIssues({ id: 'front', data: front, html: '' })).toEqual([]);
    expect(codes(bookFrontmatterIssues({ id: 'front', data: { ...front, unit: 1 }, html: '' }))).toContain('book-unit');
  });

  it('같음 검사 예외의 쪽은 쪽 범위 안이어야 한다', () => {
    const issues = bookFrontmatterIssues({ id: '2-1-2', data: data({ fidelity_exceptions: [{ page: 130, reason: '그림 안 글자' }] }), html: '' });
    expect(issues.map((issue) => issue.code)).toEqual(['book-fidelity-exceptions']);
  });

  it('짝 웹 차시 확인: 없는 차시를 가리키면 참고, 같은 번호 차시가 있는데 lesson이 비면 참고', () => {
    const lessons = [{ unit: 2 as const, label: '2-1-2', slug: '2-1-2' }];
    expect(bookFrontmatterIssues({ id: '2-1-2', data: data({ lesson: '2-1-2' }), html: '', lessons })).toEqual([]);
    const missing = bookFrontmatterIssues({ id: '2-1-2', data: data({ lesson: '9-9-9' }), html: '', lessons });
    expect(missing[0]).toMatchObject({ level: 'warning', code: 'book-lesson' });
    const unset = bookFrontmatterIssues({ id: '2-1-2', data: data(), html: '', lessons });
    expect(unset[0]?.message).toContain('lesson: 2-1-2');
  });
});

describe('본문', () => {
  it('쪽 표지·학습 목표·제목·상자·그림 규칙을 모두 지킨 본문은 문제가 없다', async () => {
    const rendered = await html(GOOD_BODY);
    expect(bookBodyIssues({ id: '2-1-2', data: data(), html: rendered })).toEqual([]);
    expect(pageMarksOf(parseHtml(rendered))).toEqual([124, 125, 126]);
  });

  it('쪽 표지가 빠지거나 범위 밖이거나 두 번이면 오류, 차례가 어긋나도 오류', async () => {
    const missing = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(GOOD_BODY.replace('::쪽[125]', '')) });
    expect(missing.find((issue) => issue.code === 'book-page-marks')?.message).toContain('125쪽');
    const extra = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(`${GOOD_BODY}\n\n::쪽[130]`) });
    expect(extra.map((issue) => issue.message).join('\n')).toContain('범위(124~126) 밖');
    const twice = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(`${GOOD_BODY}\n\n::쪽[126]`) });
    expect(twice.map((issue) => issue.message).join('\n')).toContain('두 번');
    const swapped = GOOD_BODY.replace('::쪽[125]', '::쪽[TMP]').replace('::쪽[126]', '::쪽[125]').replace('::쪽[TMP]', '::쪽[126]');
    const order = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(swapped) });
    expect(order.map((issue) => issue.message).join('\n')).toContain('차례가 어긋났어요');
  });

  it('본문은 첫 쪽의 표지로 시작해야 한다', async () => {
    const issues = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(`머리글이에요.\n\n${GOOD_BODY}`) });
    expect(issues.find((issue) => issue.code === 'book-page-marks')?.message).toContain('첫 쪽의 표지');
  });

  it('절의 첫 제목은 "학습 목표" — 아니면 오류, 두 번이어도 오류(대단원 마무리는 예외)', async () => {
    const wrong = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(GOOD_BODY.replace('## 학습 목표', '## 목표')) });
    expect(codes(wrong)).toContain('book-goal-first');
    const twice = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(`${GOOD_BODY}\n\n## 학습 목표`) });
    expect(twice.map((issue) => issue.message).join('\n')).toContain('두 번');
    const review = bookBodyIssues({ id: 'u2-review', data: data({ id: 'u2-review', pages: '124~126' }), html: await html(GOOD_BODY.replace('## 학습 목표', '## 문제로 점검')) });
    expect(codes(review)).not.toContain('book-goal-first');
  });

  it('웹 차시용 상자는 교과서 쪽에서 오류, 교과서 꼭지·정답 상자는 된다', async () => {
    const bad = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(`${GOOD_BODY}\n\n:::왜그럴까\n이유\n:::\n\n:::교사용\n지도\n:::`) });
    const box = bad.find((issue) => issue.code === 'book-box');
    expect(box?.level).toBe('error');
    expect(box?.message).toContain('why');
    expect(box?.message).toContain('teacher');
    const good = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(`${GOOD_BODY}\n\n:::정답\n1번\n:::`) });
    expect(codes(good)).not.toContain('book-box');
  });

  it('제목 모양이 출판본과 다르면 참고(오류 아님), # 제목(h1)은 오류', async () => {
    const odd = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(`${GOOD_BODY}\n\n## 소개말\n\n#### 작은제목`) });
    const heading = odd.filter((issue) => issue.code === 'book-heading');
    expect(heading.map((issue) => issue.level)).toEqual(['warning']);
    expect(heading[0]?.message).toContain('소개말');
    const h1 = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(`${GOOD_BODY}\n\n# 큰 제목`) });
    expect(h1.find((issue) => issue.code === 'heading-h1')?.level).toBe('error');
  });

  it('그림 대체 글이 없거나 너무 짧으면 오류, 물결표 두 개 취소선도 오류', async () => {
    const short = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(`${GOOD_BODY}\n\n![그림](/images/a.webp)`) });
    expect(short.find((issue) => issue.code === 'img-alt')?.level).toBe('error');
    const tilde = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(`${GOOD_BODY}\n\n0~5까지, 124~131쪽`) });
    expect(tilde.find((issue) => issue.code === 'md-tilde')?.level).toBe('error');
    const escaped = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(`${GOOD_BODY}\n\n0\\~5까지, 124\\~131쪽`) });
    expect(codes(escaped)).not.toContain('md-tilde');
  });

  it('::실습실의 예제 경로 모양을 본다', async () => {
    const good = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(`${GOOD_BODY}\n\n::실습실[esp32/u2/2-1-2-lcd-count.py]`) });
    expect(codes(good)).not.toContain('book-lab');
    const bad = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(`${GOOD_BODY}\n\n::실습실[examples/esp32/u2/x.py]`) });
    expect(codes(bad)).toContain('book-lab');
    const upper = bookBodyIssues({ id: '2-1-2', data: data(), html: await html(`${GOOD_BODY}\n\n::실습실[ESP32/X.PY]`) });
    expect(codes(upper)).toContain('book-lab');
  });

  it('checkBookRules는 frontmatter와 본문 규칙을 함께 돌린다', async () => {
    const issues = checkBookRules({ id: '2-1-2', data: data({ part: undefined }), html: await html(GOOD_BODY.replace('::쪽[125]', '')) });
    expect(codes(issues)).toEqual(expect.arrayContaining(['book-part', 'book-page-marks']));
  });
});
