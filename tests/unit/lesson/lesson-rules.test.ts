// 차시 틀 검사 규칙(src/components/lesson/lesson-rules.ts, PLAN §8.5 P5-02) — 규칙마다 "맞는 차시는 통과, 어긴 차시는 그 규칙 이름으로 걸림"을 보인다.
// 빌드는 같은 문제를 경고로만 남기고(PD-35), npm run check:lessons는 level이 error인 문제에서 실패한다(tests/unit/lesson/check-lessons.test.ts).
import { markdownConfigDefaults, unified } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import { describe, expect, it } from 'vitest';
import {
  LESSON_RULES,
  MAX_LESSON_MINUTES,
  checkLessonRules,
  imageAltIssues,
  lessonSource,
  type LessonRuleIssue,
} from '../../../src/components/lesson/lesson-rules.ts';
import { lessonSchema, type LessonData } from '../../../src/config/content-schemas.ts';
import remarkBoxes from '../../../src/lib/remark-boxes.mjs';
import remarkGlossary from '../../../src/lib/remark-glossary.mjs';

async function render(markdown: string): Promise<string> {
  const processor = unified({ remarkPlugins: [remarkDirective, remarkGlossary, remarkBoxes] as never });
  const renderer = await processor.createRenderer({ ...markdownConfigDefaults, syntaxHighlight: false });
  return (await renderer.render(markdown)).code;
}

/** 차례표의 V1과 같은 값(제목·순서·종류)이라 차례표 규칙에 걸리지 않는 기본 frontmatter */
const BASE_RAW: Record<string, unknown> = {
  title: '사진은 숫자다',
  unit: 1,
  order: 3.1,
  kind: 'supplement',
  label: 'V1',
  description: '시험용 차시예요.',
  standards: [],
  duration: 50,
  difficulty: 1,
  lab: 'vision',
  examples: [{ file: 'vision/supplement/v1-pixel-numbers.py', title: '예제' }],
  quiz: [
    { q: '첫 문제', choices: ['가', '나', '다'], answer: 0, explain: '풀이 하나' },
    { q: '둘째 문제', choices: ['가', '나', '다'], answer: 1, explain: '풀이 둘' },
    { q: '셋째 문제', choices: ['가', '나', '다'], answer: 2, explain: '풀이 셋' },
  ],
};

type Sections = Record<string, string>;

const BASE_SECTIONS: Sections = {
  학습목표: '- 첫째 목표를 설명할 수 있어요.\n- 둘째 목표를 설명할 수 있어요.',
  '왜 배울까': '까닭을 설명하는 문단이에요.\n\n<img src="/images/lessons/v1/why.svg" alt="왜 배우는지 보여 주는 사이트 그림">',
  '핵심 개념': '### 개념 하나\n\n설명이에요.\n\n<img src="/images/lessons/v1/concept.svg" alt="개념을 한눈에 보여 주는 사이트 그림">',
  따라하기: '실행해 보세요.\n\n::예제\n\n:::왜그럴까\n이유예요.\n:::',
  바꿔보기: ':::바꿔보기\n1. 하나를 바꿔요.\n2. 둘을 바꿔요.\n3. 셋을 바꿔요.\n:::',
  '도전 과제': '::::도전[도전 과제: 해 보기]\n과제예요.\n\n:::힌트\n힌트예요.\n:::\n::::',
  '확인 퀴즈': '세 문제로 확인해요.\n\n::퀴즈',
  교사용: ':::교사용\n### 지도안 요약(50분)\n요약\n\n### 평가 포인트\n- 포인트\n\n### 자주 막히는 곳\n- 막히는 곳\n:::',
};

function markdownOf(sections: Sections, before = ''): string {
  return `${before}${Object.entries(sections)
    .map(([title, body]) => `## ${title}\n\n${body}`)
    .join('\n\n')}\n`;
}

async function check(
  options: { raw?: Record<string, unknown>; sections?: Sections; markdown?: string; passRaw?: boolean; slug?: string } = {},
): Promise<LessonRuleIssue[]> {
  const raw = options.raw ?? BASE_RAW;
  const data: LessonData = lessonSchema.parse(raw);
  const html = await render(options.markdown ?? markdownOf(options.sections ?? BASE_SECTIONS));
  const slug = options.slug ?? (typeof raw.label === 'string' ? raw.label.toLowerCase() : 'v1');
  return checkLessonRules({ data, html, slug, raw: options.passRaw === false ? undefined : raw });
}

function codes(issues: readonly LessonRuleIssue[], level?: LessonRuleIssue['level']): string[] {
  return issues.filter((item) => !level || item.level === level).map((item) => item.code);
}

function withSection(name: string, body: string | undefined): Sections {
  const copy: Sections = { ...BASE_SECTIONS };
  if (body === undefined) {
    delete copy[name];
  } else {
    copy[name] = body;
  }
  return copy;
}

describe('차시 틀 검사 — 기본 차시', () => {
  it('8칸을 모두 갖춘 차시는 문제가 하나도 없다(빌드 경고도 없음)', async () => {
    expect(await check()).toEqual([]);
  });

  it('모든 문제의 규칙 이름이 규칙 표(LESSON_RULES)에 있다', async () => {
    const issues = await check({
      raw: { ...BASE_RAW, label: undefined, duration: 90, quiz: [] },
      markdown: `# 제목\n\n${markdownOf(withSection('바꿔보기', undefined))}`,
    });
    expect(issues.length).toBeGreaterThan(3);
    for (const item of issues) {
      expect(Object.keys(LESSON_RULES), item.code).toContain(item.code);
    }
  });
});

describe('frontmatter 규칙', () => {
  it('fm-label·fm-description: 차시 번호와 한 줄 소개가 없으면 오류', async () => {
    const issues = await check({ raw: { ...BASE_RAW, label: undefined, description: undefined } });
    expect(codes(issues, 'error')).toEqual(expect.arrayContaining(['fm-label', 'fm-description']));
  });

  it(`fm-duration·fm-difficulty: 시간·난이도가 없거나 ${MAX_LESSON_MINUTES}분을 넘으면 오류(나눠야 함)`, async () => {
    expect(codes(await check({ raw: { ...BASE_RAW, duration: undefined, difficulty: undefined } }), 'error')).toEqual(
      expect.arrayContaining(['fm-duration', 'fm-difficulty']),
    );
    const long = await check({ raw: { ...BASE_RAW, duration: 90 } });
    expect(long.find((item) => item.code === 'fm-duration')?.message).toContain('두 개로 나눠요');
  });

  it('fm-pages: 교과서 차시는 교과서 쪽이 있어야 한다(보충은 없어도 됨)', async () => {
    const textbook = {
      ...BASE_RAW,
      title: '인공지능 응용 프로그램과 에이전트',
      order: 1,
      kind: 'textbook',
      label: '1-1-1',
      standards: ['12인피01-01'],
    };
    expect(codes(await check({ raw: textbook }), 'error')).toContain('fm-pages');
    expect(codes(await check({ raw: { ...textbook, pages: '008~012' } }), 'error')).not.toContain('fm-pages');
    expect(codes(await check(), 'error')).not.toContain('fm-pages');
  });

  it('fm-examples·fm-lab: 예제가 없거나 예제가 있는데 실습실이 없으면 오류', async () => {
    const noExamples = await check({ raw: { ...BASE_RAW, examples: [] } });
    expect(codes(noExamples, 'error')).toContain('fm-examples');
    expect(codes(await check({ raw: { ...BASE_RAW, lab: undefined } }), 'error')).toContain('fm-lab');
  });

  it('fm-virtual-ok: ESP32 예제가 있으면 virtual_ok를 적어야 하고, false면 참고', async () => {
    const esp32 = { ...BASE_RAW, lab: 'esp32', examples: [{ file: 'esp32/u2/2-1-1-led.py' }] };
    expect(codes(await check({ raw: esp32 }), 'error')).toContain('fm-virtual-ok');
    expect(codes(await check({ raw: { ...esp32, virtual_ok: true } }))).not.toContain('fm-virtual-ok');
    expect(codes(await check({ raw: { ...esp32, virtual_ok: false } }), 'warning')).toContain('fm-virtual-ok');
  });

  it('fm-standards: 칸을 적지 않았거나, 15개에 없는 코드이거나, 대응표(PLAN §2.2)와 다르면 오류', async () => {
    const { standards: _omitted, ...withoutStandards } = BASE_RAW;
    expect(codes(await check({ raw: withoutStandards }), 'error')).toContain('fm-standards');
    // 빌드는 적힌 그대로의 값이 없어 이 검사를 건너뛴다.
    expect(codes(await check({ raw: withoutStandards, passRaw: false }))).not.toContain('fm-standards');

    const unknown = await check({ raw: { ...BASE_RAW, standards: ['12인피01-09'] } });
    expect(unknown.filter((item) => item.code === 'fm-standards').map((item) => item.message).join('\n')).toContain('15개 코드');

    const textbook = {
      ...BASE_RAW,
      title: '인공지능 응용 프로그램과 에이전트',
      order: 1,
      kind: 'textbook',
      label: '1-1-1',
      pages: '008~012',
    };
    const mismatch = await check({ raw: { ...textbook, standards: ['12인피01-02'] } });
    expect(mismatch.find((item) => item.code === 'fm-standards')?.message).toContain('standards: ["12인피01-01"]');
    expect(codes(await check({ raw: { ...textbook, standards: ['12인피01-01'] } }))).not.toContain('fm-standards');
  });

  it('fm-standards: 대응표에 없는 새 차시는 참고로만 알린다', async () => {
    const issues = await check({ raw: { ...BASE_RAW, label: 'V9', order: 3.9, title: '새 보충' } });
    expect(issues.filter((item) => item.code === 'fm-standards').map((item) => item.level)).toEqual(['warning']);
  });

  it('fm-quiz: 3문항·풀이·보기 3개 이상·같은 보기 없음은 오류, 정답 자리가 모두 같으면 참고', async () => {
    const quiz = BASE_RAW.quiz as Record<string, unknown>[];
    expect(codes(await check({ raw: { ...BASE_RAW, quiz: quiz.slice(0, 2) } }), 'error')).toContain('fm-quiz');
    const noExplain = quiz.map((item, index) => (index === 0 ? { ...item, explain: undefined } : item));
    expect((await check({ raw: { ...BASE_RAW, quiz: noExplain } })).find((item) => item.code === 'fm-quiz')?.message).toContain('풀이');
    const twoChoices = quiz.map((item, index) => (index === 1 ? { ...item, choices: ['가', '나'], answer: 0 } : item));
    expect((await check({ raw: { ...BASE_RAW, quiz: twoChoices } })).find((item) => item.code === 'fm-quiz')?.message).toContain('3개 이상');
    const duplicate = quiz.map((item, index) => (index === 2 ? { ...item, choices: ['가', '나', '가'] } : item));
    expect((await check({ raw: { ...BASE_RAW, quiz: duplicate } })).find((item) => item.code === 'fm-quiz')?.message).toContain('같은 보기');
    const same = quiz.map((item) => ({ ...item, answer: 1 }));
    const sameIssues = await check({ raw: { ...BASE_RAW, quiz: same } });
    expect(sameIssues.filter((item) => item.code === 'fm-quiz').map((item) => item.level)).toEqual(['warning']);
  });

  it('fm-parts: 배선(parts)은 ESP32 예제에만 — 다른 예제에 적으면 참고', async () => {
    const issues = await check({ raw: { ...BASE_RAW, examples: [{ file: 'vision/supplement/v1-pixel-numbers.py', parts: [{ part: 'touch-digital', pin: 17 }] }] } });
    expect(issues.filter((item) => item.code === 'fm-parts').map((item) => item.level)).toEqual(['warning']);
  });

  it('fm-curriculum·fm-source: 차례표와 종류가 다르면 오류, 순서·제목·원천이 다르면 참고', async () => {
    expect(codes(await check({ raw: { ...BASE_RAW, kind: 'textbook', pages: '1' } }), 'error')).toContain('fm-curriculum');
    const soft = await check({ raw: { ...BASE_RAW, order: 3.7, title: '다른 제목', source: 'code-only' } });
    expect(soft.filter((item) => item.code === 'fm-curriculum').map((item) => item.level)).toEqual(['warning', 'warning']);
    expect(soft.filter((item) => item.code === 'fm-source').map((item) => item.level)).toEqual(['warning']);
    // 차례표에 없는 교과서 차시는 원천(source)을 적으라고 알린다.
    const unplanned = await check({ raw: { ...BASE_RAW, kind: 'textbook', label: '9-9-9', order: 9, title: '새 차시', pages: '1' } });
    expect(codes(unplanned, 'warning')).toContain('fm-source');
  });

  it('lessonSource: 차례표 → frontmatter source → 보충이면 supplement 차례로 원천을 정한다', () => {
    expect(lessonSource({ unit: 1, label: '1-3-1', kind: 'textbook', source: undefined }, '1-3-1')).toBe('code-only');
    expect(lessonSource({ unit: 1, label: '9-9-9', kind: 'textbook', source: 'manuscript' }, '9-9-9')).toBe('manuscript');
    expect(lessonSource({ unit: 1, label: 'V9', kind: 'supplement', source: undefined }, 'v9')).toBe('supplement');
    expect(lessonSource({ unit: 1, label: '9-9-9', kind: 'textbook', source: undefined }, '9-9-9')).toBeUndefined();
  });
});

describe('본문 8칸 규칙', () => {
  it('sec-missing: 빠진 칸은 오류(빌드는 같은 문제를 경고로)', async () => {
    const issues = await check({ sections: withSection('도전 과제', undefined) });
    expect(issues.find((item) => item.code === 'sec-missing')?.message).toContain('"도전 과제" 칸');
    expect(issues.find((item) => item.code === 'sec-missing')?.level).toBe('error');
  });

  it('sec-duplicate·sec-order: 같은 칸이 두 번이거나 순서가 틀리면 오류', async () => {
    const { 교사용: teacher, '확인 퀴즈': quiz, ...rest } = BASE_SECTIONS;
    const swapped = { ...rest, 교사용: teacher ?? '', '확인 퀴즈': quiz ?? '' };
    expect(codes(await check({ sections: swapped }), 'error')).toContain('sec-order');
    const twice = `${markdownOf(BASE_SECTIONS)}\n## 바꿔보기\n\n:::바꿔보기\n1. 가\n2. 나\n3. 다\n:::\n`;
    expect(codes(await check({ markdown: twice }), 'error')).toContain('sec-duplicate');
  });

  it('sec-unknown: 틀에 없는 ## 제목은 오류(### 로 바꿔 칸 안에)', async () => {
    const markdown = markdownOf(BASE_SECTIONS).replace('## 확인 퀴즈', '## 다음은 무엇을 배울까\n\n다음 차시예요.\n\n## 확인 퀴즈');
    expect((await check({ markdown })).find((item) => item.code === 'sec-unknown')?.message).toContain('### 다음은 무엇을 배울까');
  });

  it('sec-intro: 첫 ## 앞의 글은 참고', async () => {
    const issues = await check({ markdown: markdownOf(BASE_SECTIONS, '머리 글이에요.\n\n') });
    expect(issues.filter((item) => item.code === 'sec-intro').map((item) => item.level)).toEqual(['warning']);
  });

  it('body-plan·slot-place: 자리 표시를 상자 안에 쓰거나 다른 칸에 쓰면 오류', async () => {
    const nested = withSection('따라하기', '실행해요.\n\n:::참고\n::예제\n:::\n\n:::왜그럴까\n이유\n:::');
    expect(codes(await check({ sections: nested }), 'error')).toContain('body-plan');
    const elsewhere = { ...withSection('따라하기', '실행해요.\n\n:::왜그럴까\n이유\n:::'), 바꿔보기: `::예제\n\n${BASE_SECTIONS['바꿔보기']}` };
    expect((await check({ sections: elsewhere })).find((item) => item.code === 'slot-place')?.message).toContain('따라하기 칸');
    const quizElsewhere = { ...withSection('확인 퀴즈', '세 문제예요.'), 교사용: `::퀴즈\n\n${BASE_SECTIONS['교사용']}` };
    expect(codes(await check({ sections: quizElsewhere }), 'error')).toContain('slot-place');
  });

  it('goals-count: 학습목표가 없거나 3개를 넘으면 오류', async () => {
    const four = withSection('학습목표', '- 하나\n- 둘\n- 셋\n- 넷');
    expect((await check({ sections: four })).find((item) => item.code === 'goals-count')?.message).toContain('지금 4개');
    expect(codes(await check({ sections: withSection('학습목표', '목표를 문장으로만 적었어요.') }), 'error')).toContain('goals-count');
  });

  it('why-text: 왜 배울까에 문단이 없으면 오류, 그림이 없으면 참고', async () => {
    const onlyImage = withSection('왜 배울까', '<img src="/images/lessons/v1/why.svg" alt="왜 배우는지 보여 주는 사이트 그림">');
    expect(codes(await check({ sections: onlyImage }), 'error')).toContain('why-text');
    const noImage = withSection('왜 배울까', '까닭만 적었어요.');
    expect((await check({ sections: noImage })).filter((item) => item.code === 'why-text').map((item) => item.level)).toEqual(['warning']);
  });

  it('concepts-figure: 핵심 개념에 그림이 없으면 오류, SVG가 없으면 참고', async () => {
    expect(codes(await check({ sections: withSection('핵심 개념', '설명만 있어요.') }), 'error')).toContain('concepts-figure');
    const raster = withSection('핵심 개념', '<img src="/images/lessons/v1/photo.webp" alt="원고에서 꺼낸 개념 설명 사진">');
    expect((await check({ sections: raster })).filter((item) => item.code === 'concepts-figure').map((item) => item.level)).toEqual([
      'warning',
    ]);
  });

  it('box-why: "왜 이런 결과가 나올까" 상자가 따라하기·바꿔보기에 없으면 오류, 예제보다 적으면 참고', async () => {
    const noWhy = withSection('따라하기', '실행해요.\n\n::예제');
    expect(codes(await check({ sections: noWhy }), 'error')).toContain('box-why');
    const twoExamples = { ...BASE_RAW, examples: [{ file: 'vision/a.py' }, { file: 'vision/b.py' }] };
    expect((await check({ raw: twoExamples })).filter((item) => item.code === 'box-why').map((item) => item.level)).toEqual(['warning']);
    // 바꿔보기 칸의 상자도 센다.
    const inTry = { ...noWhy, 바꿔보기: `${BASE_SECTIONS['바꿔보기']}\n\n:::왜그럴까\n이유\n:::` };
    expect(codes(await check({ sections: inTry }))).not.toContain('box-why');
  });

  it('box-try: 바꿔보기 상자가 없거나 바꿔 볼 것이 3가지보다 적으면 오류', async () => {
    expect(codes(await check({ sections: withSection('바꿔보기', '1. 하나\n2. 둘\n3. 셋') }), 'error')).toContain('box-try');
    const two = withSection('바꿔보기', ':::바꿔보기\n1. 하나\n2. 둘\n:::');
    expect((await check({ sections: two })).find((item) => item.code === 'box-try')?.message).toContain('2가지');
  });

  it('box-challenge: 도전 과제가 없거나 3개 이상이거나 힌트 접기가 없으면 오류', async () => {
    expect(codes(await check({ sections: withSection('도전 과제', '스스로 해 봐요.') }), 'error')).toContain('box-challenge');
    const one = BASE_SECTIONS['도전 과제'] ?? '';
    expect((await check({ sections: withSection('도전 과제', `${one}\n\n${one}\n\n${one}`) })).find((item) => item.code === 'box-challenge')?.message).toContain(
      '지금 3개',
    );
    const noHint = withSection('도전 과제', ':::도전[도전 과제: 힌트 없음]\n과제예요.\n:::');
    expect((await check({ sections: noHint })).find((item) => item.code === 'box-challenge')?.message).toContain('힌트 없음');
  });

  it('box-genai: 생성형 AI 활용 탐구 상자는 도전 과제 칸에만(다른 칸이면 오류)', async () => {
    const genai = ':::생성형AI\nAI에게 물어봐요.\n:::';
    const inChallenge = withSection('도전 과제', `${BASE_SECTIONS['도전 과제']}\n\n${genai}`);
    expect(codes(await check({ sections: inChallenge }))).not.toContain('box-genai');
    const inFollow = withSection('따라하기', `${BASE_SECTIONS['따라하기']}\n\n${genai}`);
    expect(codes(await check({ sections: inFollow }), 'error')).toContain('box-genai');
  });

  it('teacher-box: 교사용 칸은 :::교사용 접기 안에 지도안 요약·평가 포인트·자주 막히는 곳', async () => {
    expect(codes(await check({ sections: withSection('교사용', '접지 않은 글이에요.') }), 'error')).toContain('teacher-box');
    const outside = withSection('교사용', `상자 밖 글\n\n${BASE_SECTIONS['교사용']}`);
    expect((await check({ sections: outside })).find((item) => item.code === 'teacher-box')?.message).toContain('상자 밖');
    const missing = withSection('교사용', ':::교사용\n### 지도안 요약\n요약\n\n### 자주 막히는 곳\n- 곳\n:::');
    expect((await check({ sections: missing })).find((item) => item.code === 'teacher-box')?.message).toContain('평가 포인트');
  });

  it('heading-h1: 본문에 # 제목을 쓰면 오류', async () => {
    expect(codes(await check({ markdown: `# 큰 제목\n\n${markdownOf(BASE_SECTIONS)}` }), 'error')).toContain('heading-h1');
  });

  it('읽기 자료·대단원 마무리는 8칸 틀을 보지 않고 frontmatter·그림 규칙만 본다', async () => {
    const review = {
      title: '대단원 마무리',
      unit: 1,
      order: 99,
      kind: 'review',
      label: 'I-마무리',
      description: '대단원 문제를 풀어요.',
      pages: '112~113',
      standards: [],
      quiz: [{ q: '문제', choices: ['가', '나', '다'], answer: 0, explain: '풀이' }],
    };
    const issues = await check({ raw: review, markdown: '## 문제\n\n풀어 봐요.\n\n::퀴즈\n' });
    expect(codes(issues)).toEqual([]);
  });
});

describe('그림 대체 글(img-alt)', () => {
  it('alt가 없거나, 8자보다 짧거나, "그림"·파일 이름 같은 말이면 오류 — 빈 alt(장식)는 된다', async () => {
    const html = await render(
      [
        '<img src="/a.svg">',
        '![짧아요](/b.svg)',
        '![그림](/c.svg)',
        '![photo.webp](/d.webp)',
        '![](/e.svg)',
        '![강아지와 고양이를 나누는 인공지능 그림](/f.svg)',
      ].join('\n\n'),
    );
    const issues = imageAltIssues(html);
    expect(issues.map((item) => item.code)).toEqual(['img-alt', 'img-alt', 'img-alt', 'img-alt']);
    expect(issues.map((item) => item.message).join('\n')).toContain('/a.svg에 대체 글(alt)이 없어요');
    expect(issues.map((item) => item.message).join('\n')).not.toContain('/e.svg');
    expect(issues.map((item) => item.message).join('\n')).not.toContain('/f.svg');
  });

  it('코드 블록 속 <img 글자는 그림으로 세지 않는다', async () => {
    const html = await render('```html\n<img src="x.png">\n```');
    expect(imageAltIssues(html)).toEqual([]);
  });
});
