import { markdownConfigDefaults, unified } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import { describe, expect, it } from 'vitest';
import {
  addLazyImageLoading,
  decodeHtmlEntities,
  planLessonBody,
  rewriteRootRelativeUrls,
  sectionKeyFromHeading,
  splitHtmlSections,
  type LessonBodyOptions,
  type LessonBodyPlan,
} from '../../../src/components/lesson/lesson-html.ts';
import remarkBoxes from '../../../src/lib/remark-boxes.mjs';
import remarkGlossary from '../../../src/lib/remark-glossary.mjs';
import { BASE_PATH, withBase } from '../../../src/lib/url.ts';

/** astro.config.mjs와 같은 플러그인 순서로 마크다운을 HTML로 바꾼다(차시 페이지가 받는 entry.rendered.html과 같은 모양). */
async function render(markdown: string): Promise<string> {
  const processor = unified({ remarkPlugins: [remarkDirective, remarkGlossary, remarkBoxes] as never });
  const renderer = await processor.createRenderer({ ...markdownConfigDefaults, syntaxHighlight: false });
  return (await renderer.render(markdown)).code;
}

interface FixtureOptions {
  exampleMarker?: boolean;
  quizMarker?: boolean;
  omit?: string[];
  followBody?: string;
  teacherBody?: string;
  quizBeforeTeacher?: boolean;
}

/** 8칸 차시 마크다운 */
function lessonMarkdown(options: FixtureOptions = {}): string {
  const { exampleMarker = true, quizMarker = true, omit = [], quizBeforeTeacher = true } = options;
  const quiz: [string, string] = ['확인 퀴즈', ['안내', quizMarker ? '::퀴즈' : ''].filter(Boolean).join('\n\n')];
  const teacher: [string, string] = ['교사용', options.teacherBody ?? ':::교사용\n### 지도안 요약\n요약\n:::'];
  const blocks: [string, string][] = [
    ['학습목표', '- 목표'],
    ['왜 배울까', '까닭'],
    ['핵심 개념', '개념'],
    ['따라하기', options.followBody ?? ['앞 글', exampleMarker ? '::예제' : '', ':::왜그럴까\n이유\n:::'].filter(Boolean).join('\n\n')],
    ['바꿔보기', ':::바꿔보기\n1. 하나\n:::'],
    ['도전 과제', '::::도전\n과제\n\n:::힌트\n힌트\n:::\n::::'],
    ...(quizBeforeTeacher ? [quiz, teacher] : [teacher, quiz]),
  ];
  return blocks
    .filter(([title]) => !omit.includes(title))
    .map(([title, body]) => `## ${title}\n\n${body}`)
    .join('\n\n');
}

const FULL: LessonBodyOptions = { exampleCount: 1, quizCount: 3, checkTemplate: true };

/** 칸마다 조각 모양만 뽑아 비교하기 쉽게 한다. */
function shape(plan: LessonBodyPlan): string[] {
  return plan.sections.map(
    (section) => `${section.key ?? '?'}[${section.parts.map((part) => (part.type === 'slot' ? part.slot : 'html')).join(',')}]`,
  );
}

function html(plan: LessonBodyPlan): string {
  return [...plan.intro, ...plan.sections.flatMap((section) => section.parts)]
    .map((part) => (part.type === 'html' ? part.html : `[${part.slot}]`))
    .join('');
}

describe('차시 틀 칸 이름(sectionKeyFromHeading)', () => {
  it('띄어쓰기·앞 번호가 달라도 8칸을 알아본다', () => {
    expect(sectionKeyFromHeading('학습 목표')).toBe('goals');
    expect(sectionKeyFromHeading('학습목표')).toBe('goals');
    expect(sectionKeyFromHeading('1. 왜 배울까')).toBe('why');
    expect(sectionKeyFromHeading('핵심개념')).toBe('concepts');
    expect(sectionKeyFromHeading('⑦ 확인 퀴즈')).toBe('quiz');
    expect(sectionKeyFromHeading('교사용 안내')).toBe('teacher');
    expect(sectionKeyFromHeading('참고 자료')).toBeUndefined();
  });
});

describe('자리 표시(::예제, ::퀴즈)와 마크다운 처리기의 약속', () => {
  it('처리하는 플러그인이 없는 ::예제·::퀴즈 줄은 <p> 글자로 남는다(remark-boxes가 되돌림)', async () => {
    expect(await render('::예제')).toContain('<p>::예제</p>');
    expect(await render('::퀴즈')).toContain('<p>::퀴즈</p>');
  });
});

describe('차시 본문 나누기(planLessonBody)', () => {
  it('8칸을 순서대로 나누고, ::예제·::퀴즈 자리에 예제·퀴즈를 넣는다(경고 없음)', async () => {
    const plan = planLessonBody(await render(lessonMarkdown()), FULL);
    expect(shape(plan)).toEqual([
      'goals[html]',
      'why[html]',
      'concepts[html]',
      'follow[html,examples,html]',
      'try[html]',
      'challenge[html]',
      'quiz[html,quiz]',
      'teacher[html]',
    ]);
    expect(plan.warnings).toEqual([]);
    expect(plan.sections.map((section) => section.id)).toEqual([
      '학습목표',
      '왜-배울까',
      '핵심-개념',
      '따라하기',
      '바꿔보기',
      '도전-과제',
      '확인-퀴즈',
      '교사용',
    ]);

    const follow = plan.sections[3];
    const [before, , after] = follow?.parts ?? [];
    expect(before?.type === 'html' && before.html).toContain('앞 글');
    expect(after?.type === 'html' && after.html).toContain('box--why');
    expect(html(plan)).not.toContain('::예제');
    expect(html(plan)).not.toContain('::퀴즈');
  });

  it('자리 표시가 없으면 따라하기·확인 퀴즈 칸 끝에 붙인다', async () => {
    const plan = planLessonBody(await render(lessonMarkdown({ exampleMarker: false, quizMarker: false })), FULL);
    expect(shape(plan)).toContain('follow[html,examples]');
    expect(shape(plan)).toContain('quiz[html,quiz]');
    expect(plan.warnings).toEqual([]);
  });

  it('칸이 없으면 틀 순서에 맞는 자리에 칸을 만들고 경고한다', async () => {
    const plan = planLessonBody(await render(lessonMarkdown({ omit: ['따라하기', '확인 퀴즈'] })), FULL);
    expect(shape(plan)).toEqual([
      'goals[html]',
      'why[html]',
      'concepts[html]',
      'follow[html,examples]',
      'try[html]',
      'challenge[html]',
      'quiz[html,quiz]',
      'teacher[html]',
    ]);
    const generated = plan.sections.filter((section) => section.generated);
    expect(generated.map((section) => [section.id, section.title])).toEqual([
      ['따라하기', '따라하기'],
      ['확인-퀴즈', '확인 퀴즈'],
    ]);
    expect(plan.warnings.join('\n')).toContain('"따라하기" 칸');
    expect(plan.warnings.join('\n')).toContain('"확인 퀴즈" 칸');
  });

  it('상자 안의 ::예제는 쓰지 않고 지운 뒤 칸 끝에 붙이고 경고한다', async () => {
    const plan = planLessonBody(await render(lessonMarkdown({ followBody: '앞 글\n\n:::참고\n::예제\n:::' })), FULL);
    expect(shape(plan)).toContain('follow[html,examples]');
    expect(html(plan)).not.toContain('::예제');
    expect(plan.warnings.some((warning) => warning.includes('상자·목록 밖'))).toBe(true);
  });

  it('::예제를 두 번 쓰면 두 번째를 지우고, examples가 비었으면 표시 줄을 지운다', async () => {
    const twice = planLessonBody(await render(lessonMarkdown({ followBody: '::예제\n\n가운데\n\n::예제' })), FULL);
    expect(shape(twice)).toContain('follow[html,examples,html]');
    expect(twice.warnings.some((warning) => warning.includes('한 번만'))).toBe(true);

    const none = planLessonBody(await render(lessonMarkdown()), { ...FULL, exampleCount: 0 });
    expect(shape(none)).toContain('follow[html]');
    expect(html(none)).not.toContain('::예제');
    expect(none.warnings.some((warning) => warning.includes('frontmatter examples'))).toBe(true);
  });

  it('상자 안의 ## 제목은 칸을 나누지 않는다', async () => {
    const plan = planLessonBody(
      await render(lessonMarkdown({ teacherBody: ':::교사용\n## 안쪽 제목\n요약\n:::' })),
      FULL,
    );
    expect(plan.sections).toHaveLength(8);
    expect(plan.warnings).toEqual([]);
  });

  it('빠진 칸·순서·교사용 상자·퀴즈 문항 수를 경고하고, checkTemplate가 false면 틀 경고를 하지 않는다', async () => {
    const markdown = lessonMarkdown({ omit: ['도전 과제'], quizBeforeTeacher: false, teacherBody: '접지 않은 글' });
    const plan = planLessonBody(await render(markdown), { ...FULL, quizCount: 2 });
    const text = plan.warnings.join('\n');
    expect(text).toContain('빠진 칸이 있어요: 도전 과제');
    expect(text).toContain('칸 순서가 틀과 달라요');
    expect(text).toContain(':::교사용 상자');
    expect(text).toContain('3문항');

    const reading = planLessonBody(await render(markdown), { exampleCount: 0, quizCount: 0, checkTemplate: false });
    expect(reading.warnings.filter((warning) => !warning.includes('frontmatter'))).toEqual([]);
  });

  it('첫 ## 제목 앞의 글은 intro로 남는다', async () => {
    const plan = planLessonBody(await render(`:::참고[틀만 있어요]\n안내\n:::\n\n${lessonMarkdown()}`), FULL);
    expect(plan.intro).toHaveLength(1);
    expect(html({ ...plan, sections: [] })).toContain('box--note');
  });
});

describe('주소·그림 도우미', () => {
  it('사이트 뿌리 주소(/…)에만 base를 붙이고 바깥 주소·이미 붙은 주소는 그대로 둔다', () => {
    const source = [
      '<img src="/images/lessons/u1/a.webp" alt="a">',
      '<a href="/glossary/">용어사전</a>',
      '<a href="/search/?q=a&amp;b=1#top">검색</a>',
      '<a href="//example.com/x">x</a>',
      '<a href="https://example.com/">바깥</a>',
      '<a href="#위치">안</a>',
      `<a href="${withBase('credits/')}">출처</a>`,
    ].join('');
    const { html: result, warnings } = rewriteRootRelativeUrls(source);
    expect(result).toContain(`src="${withBase('images/lessons/u1/a.webp')}"`);
    expect(result).toContain(`href="${withBase('glossary/')}"`);
    expect(result).toContain(`href="${BASE_PATH}search/?q=a&amp;b=1#top"`);
    expect(result).toContain('href="//example.com/x"');
    expect(result).toContain('href="https://example.com/"');
    expect(result).toContain('href="#위치"');
    expect(result).toContain(`href="${withBase('credits/')}"`);
    expect(result).not.toContain(`${BASE_PATH}${BASE_PATH.slice(1)}`);
    expect(warnings).toEqual([]);
  });

  it('".."이 든 주소는 고치지 않고 경고로 알린다', () => {
    const { html: result, warnings } = rewriteRootRelativeUrls('<a href="/../x/">x</a>');
    expect(result).toBe('<a href="/../x/">x</a>');
    expect(warnings).toHaveLength(1);
  });

  it('본문 그림에 느린 받기(loading="lazy")를 한 번만 붙인다', () => {
    expect(addLazyImageLoading('<img src="a.webp"><img loading="eager" src="b.webp">')).toBe(
      '<img loading="lazy" decoding="async" src="a.webp"><img loading="eager" src="b.webp">',
    );
  });

  it('칸 제목 글자의 문자 참조를 되돌리고, 제목 앞 글은 intro로 나눈다', () => {
    const { intro, sections } = splitHtmlSections('<p>머리말</p><h2 id="a">R&amp;D <code>x</code></h2><p>본문</p>');
    expect(intro).toBe('<p>머리말</p>');
    expect(sections).toEqual([{ key: undefined, id: 'a', title: 'R&D x', html: '<h2 id="a">R&amp;D <code>x</code></h2><p>본문</p>' }]);
    expect(decodeHtmlEntities('&lt;p&gt; &#39;a&#x27; &quot;b&quot; &unknown;')).toBe(`<p> 'a' "b" &unknown;`);
  });
});
