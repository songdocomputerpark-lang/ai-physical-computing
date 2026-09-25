import { describe, expect, it } from 'vitest';
import {
  GLOSSARY_SUMMARY_MAX,
  glossarySchema,
  lessonSchema,
} from '../../src/config/content-schemas.ts';

/** PLAN §2.6의 frontmatter 예시 그대로 */
const PLAN_EXAMPLE = {
  title: '터치 센서를 누르면 LED가 켜져요',
  unit: 2,
  order: 1,
  standards: ['12인피02-01'],
  duration: 50,
  lab: 'esp32',
  virtual_ok: true,
  difficulty: 1,
  examples: [
    {
      file: 'esp32/u2/2-1-1-touch-led.py',
      parts: [
        { type: 'builtin_led', pin: 2 },
        { type: 'touch_digital', pin: 17 },
      ],
    },
  ],
  quiz: [{ q: '내장 LED는 몇 번 핀에 연결되어 있나요?', choices: ['0번', '2번', '21번'], answer: 1 }],
};

function issueMessages(result: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return result.success ? '' : (result.error?.issues ?? []).map((issue) => issue.message).join('\n');
}

describe('차시 frontmatter 규칙(lessonSchema)', () => {
  it('PLAN §2.6 예시가 통과하고, 적지 않은 칸에는 기본값이 들어간다', () => {
    const data = lessonSchema.parse(PLAN_EXAMPLE);
    expect(data.kind).toBe('textbook');
    expect(data.materials).toEqual([]);
    expect(data.national_refs).toEqual([]);
    expect(data.draft).toBe(false);
    expect(data.examples[0].parts).toHaveLength(2);
  });

  it('성취기준을 비우거나 적지 않으면 빈 목록이 된다(DECISIONS C8)', () => {
    expect(lessonSchema.parse({ ...PLAN_EXAMPLE, standards: null }).standards).toEqual([]);
    const { standards: _omitted, ...withoutStandards } = PLAN_EXAMPLE;
    expect(lessonSchema.parse(withoutStandards).standards).toEqual([]);
    expect(lessonSchema.parse({ ...PLAN_EXAMPLE, standards: [] }).standards).toEqual([]);
  });

  it('성취기준 코드 모양이 틀리면 실패하고 고치는 법을 한국어로 알린다', () => {
    const result = lessonSchema.safeParse({ ...PLAN_EXAMPLE, standards: ['12인피2-1'] });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain('12인피02-01 모양');
  });

  it('정답 순번이 보기 개수보다 크거나 같으면 실패한다', () => {
    const result = lessonSchema.safeParse({
      ...PLAN_EXAMPLE,
      quiz: [{ q: '문제', choices: ['가', '나', '다'], answer: 3 }],
    });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toContain('보기 개수보다 작아야');
  });

  it('대단원 번호가 1~4가 아니거나 제목이 없으면 실패한다', () => {
    expect(issueMessages(lessonSchema.safeParse({ ...PLAN_EXAMPLE, unit: 5 }))).toContain('1, 2, 3, 4 중 하나');
    expect(issueMessages(lessonSchema.safeParse({ ...PLAN_EXAMPLE, title: '' }))).toContain('차시 제목(title)');
  });

  it('예제 파일 경로는 examples/ 뒤의 소문자 .py 경로만 받는다', () => {
    for (const file of ['examples/esp32/u2/a.py', 'esp32/U2/Touch.py', 'esp32/u2/touch.txt']) {
      const result = lessonSchema.safeParse({ ...PLAN_EXAMPLE, examples: [{ file }] });
      expect(result.success, file).toBe(false);
      expect(issueMessages(result)).toContain('examples/ 뒤의 경로');
    }
    expect(lessonSchema.safeParse({ ...PLAN_EXAMPLE, examples: [{ file: 'esp32/lib/third-party/i2c_lcd.py' }] }).success).toBe(true);
  });

  it('예제 배선(parts)은 PLAN §2.6의 type·pin과 사이드카 모양의 part·id·pins·label을 모두 받고, 부품 이름이 없으면 실패한다', () => {
    const data = lessonSchema.parse({
      ...PLAN_EXAMPLE,
      examples: [
        {
          file: 'esp32/u2/2-1-2-adv-touch-lcd-counter.py',
          parts: [
            { part: 'touch-digital', pin: 17 },
            { part: 'lcd-i2c', id: 'lcd', pins: { sda: 21, scl: 22 }, label: '문자 LCD' },
          ],
        },
      ],
    });
    expect(data.examples[0]?.parts).toHaveLength(2);
    expect(lessonSchema.parse({ ...PLAN_EXAMPLE, examples: [{ file: 'esp32/01-first-blink.py' }] }).examples[0]?.parts).toEqual([]);
    const missing = lessonSchema.safeParse({ ...PLAN_EXAMPLE, examples: [{ file: 'esp32/a.py', parts: [{ pin: 17 }] }] });
    expect(missing.success).toBe(false);
    expect(issueMessages(missing)).toContain('부품 이름(part)을 적어요');
  });

  it('규칙에 없는 필드를 더 적어도 빌드를 멈추지 않고 값을 남긴다', () => {
    const data = lessonSchema.parse({ ...PLAN_EXAMPLE, hero_image: 'u2/touch.svg' });
    expect((data as Record<string, unknown>).hero_image).toBe('u2/touch.svg');
  });

  it('원천(source)은 네 값 가운데 하나, 가린 편집본(handouts)은 bt·ppt와 쪽 숫자로 적는다(P5-02, PD-31)', () => {
    const data = lessonSchema.parse({ ...PLAN_EXAMPLE, source: 'code-only', handouts: [{ doc: 'bt', pages: '41~47' }] });
    expect(data.source).toBe('code-only');
    expect(data.handouts).toEqual([{ doc: 'bt', pages: '41~47' }]);
    expect(lessonSchema.parse(PLAN_EXAMPLE).handouts).toEqual([]);
    expect(issueMessages(lessonSchema.safeParse({ ...PLAN_EXAMPLE, source: 'book' }))).toContain('원천(source)');
    expect(issueMessages(lessonSchema.safeParse({ ...PLAN_EXAMPLE, handouts: [{ doc: 'pdf', pages: '1' }] }))).toContain('bt·ppt');
    expect(issueMessages(lessonSchema.safeParse({ ...PLAN_EXAMPLE, handouts: [{ doc: 'bt', pages: 'p41' }] }))).toContain('숫자');
  });
});

describe('용어사전 frontmatter 규칙(glossarySchema)', () => {
  it('표제어와 한 줄 풀이만 있으면 통과하고 목록 칸은 빈 목록이 된다', () => {
    const data = glossarySchema.parse({ title: '픽셀', summary: '디지털 사진을 이루는 아주 작은 색 점 하나예요.' });
    expect(data.aliases).toEqual([]);
    expect(data.related).toEqual([]);
    expect(data.draft).toBe(false);
  });

  it('한 줄 풀이가 없거나 너무 길면 실패한다', () => {
    expect(issueMessages(glossarySchema.safeParse({ title: '픽셀' }))).not.toBe('');
    const tooLong = glossarySchema.safeParse({ title: '픽셀', summary: '가'.repeat(GLOSSARY_SUMMARY_MAX + 1) });
    expect(issueMessages(tooLong)).toContain(`${GLOSSARY_SUMMARY_MAX}자 안으로`);
  });

  it('관련 항목은 파일 이름 모양(영문 소문자·숫자·하이픈)으로 적는다', () => {
    const result = glossarySchema.safeParse({ title: '픽셀', summary: '작은 점', related: ['BGR RGB'] });
    expect(issueMessages(result)).toContain('파일 이름');
  });
});
