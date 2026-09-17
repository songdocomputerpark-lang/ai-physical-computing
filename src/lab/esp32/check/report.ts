/**
 * 실물 점검 도우미의 답과 [결과 복사] 글(PLAN §8.3 P3-11). 순수 함수 — DOM·네트워크 없이 단위 테스트한다.
 *
 * 답은 항목별로 질문 하나에 예/아니오/모름, 그리고 메모 한 줄이다. [결과 복사]는 PROGRESS.md "운영자 할 일 2번"에
 * 그대로 붙일 수 있는 마크다운 표를 만든다(제목 줄 + 항목마다 한 줄 + 아니오·메모가 있으면 아래에 자세히).
 * 저장은 브라우저에만 남는다(src/lib/storage.ts 규칙, 이름 `board-check:answers`) — 서버 없음(SPEC 원칙 2).
 */
import type { CheckItem } from './items.ts';

export type CheckAnswer = 'yes' | 'no' | 'unknown';

export interface ItemRecord {
  /** 질문 id → 답 */
  readonly answers: Readonly<Record<string, CheckAnswer>>;
  readonly note?: string;
  /** 마지막으로 [보드에 보내기]를 눌러 코드가 끝난 결과 */
  readonly run?: 'ok' | 'error' | 'stopped';
  /** 코드가 찍은 마지막 줄들(복사 글에 넣는다 — 값을 기록하려고) */
  readonly output?: string;
}

export type CheckRecords = Readonly<Record<string, ItemRecord>>;

/** 항목 한 줄의 판정: 답이 모두 예면 '예', 하나라도 아니오면 '다름', 답이 없으면 '아직' */
export type ItemVerdict = 'yes' | 'different' | 'partial' | 'todo';

export function itemVerdict(item: CheckItem, record: ItemRecord | undefined): ItemVerdict {
  const answers = item.questions.map((question) => record?.answers?.[question.id]);
  if (answers.some((answer) => answer === 'no')) {
    return 'different';
  }
  if (answers.every((answer) => answer === 'yes')) {
    return 'yes';
  }
  if (answers.some((answer) => answer === 'yes' || answer === 'unknown')) {
    return 'partial';
  }
  return 'todo';
}

export const VERDICT_TEXT: Readonly<Record<ItemVerdict, string>> = Object.freeze({
  yes: '예(같음)',
  different: '다름',
  partial: '일부',
  todo: '아직',
});

const ANSWER_TEXT: Readonly<Record<CheckAnswer, string>> = Object.freeze({ yes: '예', no: '아니오', unknown: '모름' });

/** 답이 하나라도 있는 항목 수 */
export function answeredCount(items: readonly CheckItem[], records: CheckRecords): number {
  return items.filter((item) => itemVerdict(item, records[item.id]) !== 'todo').length;
}

function cleanOutput(text: string | undefined, maxLines = 6): string[] {
  if (!text) {
    return [];
  }
  const lines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== '');
  return lines.slice(-maxLines);
}

export interface ReportOptions {
  /** 보고 날짜(YYYY-MM-DD). 적지 않으면 오늘 */
  readonly date?: string;
  /** 보드·펌웨어 정보 한 줄(연결 칸에서 읽은 것) */
  readonly board?: string;
  /** 브라우저 한 줄 */
  readonly browser?: string;
}

function todayText(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** PROGRESS.md에 붙일 마크다운 글 */
export function buildReport(items: readonly CheckItem[], records: CheckRecords, options: ReportOptions = {}): string {
  const date = options.date ?? todayText();
  const done = answeredCount(items, records);
  const lines: string[] = [];
  lines.push(`### 실물 점검 도우미 결과 (${date})`);
  lines.push('');
  lines.push(`- 항목 ${items.length}개 가운데 ${done}개에 답했어요(도우미 주소: /labs/esp32/check/).`);
  if (options.board) {
    lines.push(`- 보드: ${options.board}`);
  }
  if (options.browser) {
    lines.push(`- 브라우저: ${options.browser}`);
  }
  lines.push('');
  lines.push('| 부록 B-2 | 항목 | 판정 | 메모 |');
  lines.push('|---|---|---|---|');
  for (const item of items) {
    const record = records[item.id];
    const verdict = VERDICT_TEXT[itemVerdict(item, record)];
    const note = (record?.note ?? '').replace(/\s+/gu, ' ').replace(/\|/gu, '/').trim();
    lines.push(`| ${item.b2} | ${item.title} | ${verdict} | ${note || '—'} |`);
  }

  const details = items.filter((item) => {
    const record = records[item.id];
    if (!record) {
      return false;
    }
    const hasNo = item.questions.some((question) => record.answers?.[question.id] === 'no');
    return hasNo || cleanOutput(record.output).length > 0;
  });
  if (details.length > 0) {
    lines.push('');
    lines.push('자세히:');
    for (const item of details) {
      const record = records[item.id];
      lines.push('');
      lines.push(`- **${item.title}**(B-2 ${item.b2})`);
      for (const question of item.questions) {
        const answer = record?.answers?.[question.id];
        if (answer) {
          lines.push(`  - ${question.text} → ${ANSWER_TEXT[answer]}`);
        }
      }
      if (record?.run) {
        lines.push(`  - [보드에 보내기] 결과: ${record.run}`);
      }
      const output = cleanOutput(record?.output);
      if (output.length > 0) {
        lines.push('  - 콘솔 마지막 줄:');
        for (const line of output) {
          lines.push(`    - \`${line.replace(/`/gu, "'")}\``);
        }
      }
    }
  }
  lines.push('');
  lines.push('답하지 않은 항목은 "아직"이라 적혀요. 나눠서 해도 되고, 이 글을 PROGRESS.md 운영자 할 일 2번 아래에 붙여 주세요.');
  return lines.join('\n');
}

/** 저장 값 → 답 기록(모양이 틀린 값은 버린다) */
export function parseRecords(raw: unknown): CheckRecords {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  const out: Record<string, ItemRecord> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const { answers, note, run, output } = value as { answers?: unknown; note?: unknown; run?: unknown; output?: unknown };
    const cleanAnswers: Record<string, CheckAnswer> = {};
    if (answers && typeof answers === 'object') {
      for (const [key, answer] of Object.entries(answers as Record<string, unknown>)) {
        if (answer === 'yes' || answer === 'no' || answer === 'unknown') {
          cleanAnswers[key] = answer;
        }
      }
    }
    const record: ItemRecord = {
      answers: cleanAnswers,
      ...(typeof note === 'string' ? { note: note.slice(0, 500) } : {}),
      ...(run === 'ok' || run === 'error' || run === 'stopped' ? { run } : {}),
      ...(typeof output === 'string' ? { output: output.slice(-2000) } : {}),
    };
    out[id] = record;
  }
  return out;
}
