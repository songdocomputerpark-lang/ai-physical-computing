// 실물 점검 도우미의 판정·복사 글·저장 값 읽기(P3-11) — 순수 함수.
import { describe, expect, it } from 'vitest';
import { CHECK_ITEMS } from '../../../src/lab/esp32/check/items.ts';
import { answeredCount, buildReport, itemVerdict, parseRecords, type CheckRecords } from '../../../src/lab/esp32/check/report.ts';

const item = CHECK_ITEMS[0]!;
const second = CHECK_ITEMS[1]!;

function allYes(id: string, questions: readonly { readonly id: string }[]): CheckRecords {
  return { [id]: { answers: Object.fromEntries(questions.map((question) => [question.id, 'yes' as const])) } };
}

describe('항목 판정', () => {
  it('답이 없으면 아직, 모두 예면 예, 하나라도 아니오면 다름, 그 사이는 일부', () => {
    expect(itemVerdict(item, undefined)).toBe('todo');
    expect(itemVerdict(item, { answers: {} })).toBe('todo');
    expect(itemVerdict(item, allYes(item.id, item.questions)[item.id])).toBe('yes');
    expect(itemVerdict(item, { answers: { [item.questions[0]!.id]: 'no' } })).toBe('different');
    expect(itemVerdict(item, { answers: { [item.questions[0]!.id]: 'yes' } })).toBe(item.questions.length === 1 ? 'yes' : 'partial');
    expect(itemVerdict(item, { answers: { [item.questions[0]!.id]: 'unknown' } })).toBe('partial');
  });

  it('답한 항목 수를 센다', () => {
    expect(answeredCount(CHECK_ITEMS, {})).toBe(0);
    expect(answeredCount(CHECK_ITEMS, allYes(item.id, item.questions))).toBe(1);
  });
});

describe('[결과 복사] 글', () => {
  const records: CheckRecords = {
    ...allYes(item.id, item.questions),
    [second.id]: {
      answers: { [second.questions[0]!.id]: 'no' },
      note: '값이 조금 달라요 | 표를 깨는 글자',
      run: 'stopped',
      output: 'first\nsecond\n',
    },
  };

  it('PROGRESS.md에 붙일 표를 만든다(항목마다 한 줄, 날짜·항목 수)', () => {
    const report = buildReport(CHECK_ITEMS, records, { date: '2026-09-18', board: 'Generic ESP32 · v1.29.0 · CH340' });
    expect(report).toContain('### 실물 점검 도우미 결과 (2026-09-18)');
    expect(report).toContain(`항목 ${CHECK_ITEMS.length}개 가운데 2개에 답했어요`);
    expect(report).toContain('- 보드: Generic ESP32 · v1.29.0 · CH340');
    expect(report).toContain('| 부록 B-2 | 항목 | 판정 | 메모 |');
    expect(report).toContain(`| ${item.b2} | ${item.title} | 예(같음) | — |`);
    // 표를 깨는 | 는 /로 바꾼다
    expect(report).toContain(`| ${second.b2} | ${second.title} | 다름 | 값이 조금 달라요 / 표를 깨는 글자 |`);
    // 답하지 않은 항목은 "아직"
    const third = CHECK_ITEMS[2]!;
    expect(report).toContain(`| ${third.b2} | ${third.title} | 아직 | — |`);
  });

  it("'아니오'가 있거나 콘솔 값이 있으면 자세히 칸에 질문·답·마지막 줄을 적는다", () => {
    const report = buildReport(CHECK_ITEMS, records, { date: '2026-09-18' });
    expect(report).toContain('자세히:');
    expect(report).toContain(`- **${second.title}**(B-2 ${second.b2})`);
    expect(report).toContain(`  - ${second.questions[0]!.text} → 아니오`);
    expect(report).toContain('  - [보드에 보내기] 결과: stopped');
    expect(report).toContain('    - `second`');
    // 답만 예로 한 항목은 자세히에 넣지 않는다(콘솔 값이 없으므로)
    expect(report).not.toContain(`- **${item.title}**(B-2 ${item.b2})`);
  });

  it('답이 없어도 글이 만들어진다(날짜는 오늘)', () => {
    const report = buildReport(CHECK_ITEMS, {});
    expect(report).toMatch(/### 실물 점검 도우미 결과 \(\d{4}-\d{2}-\d{2}\)/u);
    expect(report).toContain('0개에 답했어요');
  });
});

describe('저장 값 읽기', () => {
  it('모양이 틀린 값은 버리고 쓸 수 있는 것만 남긴다', () => {
    const parsed = parseRecords({
      ok: { answers: { a: 'yes', b: 'nope', c: 'no' }, note: '메모', run: 'ok', output: 'x' },
      bad: 'not an object',
      empty: {},
      wrongRun: { answers: {}, run: 'weird', note: 42 },
    });
    expect(parsed.ok).toEqual({ answers: { a: 'yes', c: 'no' }, note: '메모', run: 'ok', output: 'x' });
    expect(parsed.bad).toBeUndefined();
    expect(parsed.empty).toEqual({ answers: {} });
    expect(parsed.wrongRun).toEqual({ answers: {} });
  });

  it('값이 아니면 빈 기록', () => {
    expect(parseRecords(null)).toEqual({});
    expect(parseRecords('x')).toEqual({});
  });

  it('긴 메모·출력은 잘라 담는다', () => {
    const parsed = parseRecords({ big: { answers: {}, note: 'a'.repeat(900), output: 'b'.repeat(4000) } });
    expect(parsed.big?.note?.length).toBe(500);
    expect(parsed.big?.output?.length).toBe(2000);
  });
});
