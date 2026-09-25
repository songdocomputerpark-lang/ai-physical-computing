/**
 * 차시 따라하기 예제의 코드 상자 글자 만들기(LessonExamples.astro가 빌드할 때 쓴다) — 순수 함수라 Vitest로 검사한다
 * (tests/unit/lesson/example-code.test.ts).
 *
 * 2026-09-25 Phase 5 검토 반영
 * - 줄 번호는 CSS 카운터 대신 줄마다 data-line으로 적는다. 발췌(focus)에서 건너뛴 줄이 있어도 원래 줄 번호가 그대로 보인다.
 * - focus(frontmatter examples[].focus, 예: "1-7, 117-123")가 있으면 코드 읽기가 가리키는 줄만 발췌해 보이고, 전체 코드는
 *   아래 [전체 코드 보기] 접기에 둔다(중요 9: 200~275줄 코드가 차시에 통째로 펼쳐져 휴대폰에서 26,000px이 넘었다).
 * - 사이트가 만든 예제 끝의 실습실 안내 주석(# ── 바꿔볼 것 3가지 ── · 왜 이런 결과가 나올까 · 실습 방법)은 차시 본문의
 *   바꿔보기·왜 이런 결과가 나올까 칸과 같은 내용이라 차시 코드 상자에서는 뺀다(사소 20). 실습실·갤러리에서는 그대로 보인다.
 *   끝에 있는 주석 묶음만 빼므로 앞의 줄 번호는 바뀌지 않는다.
 */

/** 실습실 안내 상자 제목 줄(src/lab/controls/example-meta.ts의 SECTION_TITLE과 같은 세 이름) */
const GUIDE_TITLE = /^#\s*[─━═=~-]*\s*(?:바꿔볼 것 3가지|왜 이런 결과가 나올까|실습 방법)\s*[─━═=~-]*\s*$/u;

export interface CodeLines {
  /** 차시에 보일 줄(끝의 안내 주석을 뺀 것) */
  readonly lines: readonly string[];
  /** 뺀 끝의 안내 주석 줄 수 */
  readonly guideLines: number;
}

/** 코드 글자를 줄로 나누고, 끝에 붙은 실습실 안내 주석 묶음(제목 줄부터 파일 끝까지 주석·빈 줄뿐인 것)을 뗀다. */
export function splitExampleCode(code: string): CodeLines {
  const lines = code.replace(/\r\n?/gu, '\n').replace(/\n$/u, '').split('\n');
  // 끝에서부터 주석·빈 줄이 이어지는 곳까지 거슬러 올라간다.
  let tailStart = lines.length;
  while (tailStart > 0 && /^\s*(?:#.*)?$/u.test(lines[tailStart - 1] ?? '')) {
    tailStart -= 1;
  }
  const guideStart = lines.findIndex((line, index) => index >= tailStart && GUIDE_TITLE.test(line.trim()));
  if (guideStart < 0) {
    return { lines, guideLines: 0 };
  }
  // 안내 묶음 앞의 빈 줄도 함께 뗀다(코드 상자 끝에 빈 줄이 남지 않게).
  let cut = guideStart;
  while (cut > 0 && (lines[cut - 1] ?? '').trim() === '') {
    cut -= 1;
  }
  return { lines: lines.slice(0, cut), guideLines: lines.length - cut };
}

export interface FocusRanges {
  /** 1부터 세는 줄 범위 [시작, 끝](겹침을 합치고 차례대로) */
  readonly ranges: readonly (readonly [number, number])[];
  /** 적은 값의 문제(없는 줄 등) — check:lessons가 알린다 */
  readonly problems: readonly string[];
}

/** "1-7, 117-123, 201" → [[1,7],[117,123],[201,201]]. 파일의 줄 수(lineCount) 밖은 잘라 내고 문제로 알린다. */
export function parseFocusRanges(spec: string, lineCount: number): FocusRanges {
  const problems: string[] = [];
  const raw: [number, number][] = [];
  for (const piece of spec.split(',')) {
    const text = piece.trim();
    if (text === '') {
      continue;
    }
    const match = /^(\d+)\s*(?:[-~]\s*(\d+))?$/u.exec(text);
    if (!match) {
      problems.push(`"${text}"는 줄 범위 모양이 아니에요. 예: 1-7, 117-123`);
      continue;
    }
    let start = Number(match[1]);
    let end = match[2] === undefined ? start : Number(match[2]);
    if (end < start) {
      [start, end] = [end, start];
    }
    if (start < 1 || start > lineCount) {
      problems.push(`${text}행 — 파일은 ${lineCount}줄이에요.`);
      continue;
    }
    if (end > lineCount) {
      problems.push(`${text}행 — 파일은 ${lineCount}줄이라 ${lineCount}행까지만 보여요.`);
      end = lineCount;
    }
    raw.push([start, end]);
  }
  raw.sort((a, b) => a[0] - b[0]);
  const ranges: [number, number][] = [];
  for (const [start, end] of raw) {
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1] + 1) {
      last[1] = Math.max(last[1], end);
    } else {
      ranges.push([start, end]);
    }
  }
  return { ranges, problems };
}

function escapeHtml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

/**
 * 줄 사이의 줄바꿈 글자(화면에서는 숨김 — CSS `.lesson-code__nl { display: none }`). 줄이 블록이라 화면에는 필요 없지만,
 * 글자 그대로의 코드(textContent)와 사이트 검색 색인(Pagefind는 CSS를 모름)에서 줄 끝 낱말이 다음 줄 첫 낱말과 붙지 않게 한다
 * — 예전처럼 줄마다 줄바꿈 글자로 이어진 글자가 된다.
 */
export const LINE_BREAK_HTML = '<span class="lesson-code__nl" aria-hidden="true">\n</span>';

function lineHtml(line: string, number: number): string {
  const comment = /^\s*#/u.test(line) ? ' lesson-code__line--comment' : '';
  // 빈 줄은 빈칸 하나로 둔다 — 속이 빈 줄 블록은 끌어 고른 글(복사)에서 사라져 빈 줄이 없어졌다(Edge 확인, 2026-09-26).
  // 빈칸만 있는 줄은 파이썬에서 빈 줄과 같다.
  return `<span class="lesson-code__line${comment}" data-line="${number}">${line === '' ? ' ' : escapeHtml(line)}</span>`;
}

/** 줄 전체를 코드 상자 HTML로(줄 번호 1부터). 줄 사이에는 화면에서 숨긴 줄바꿈 글자(LINE_BREAK_HTML)를 둔다. */
export function codeLinesToHtml(lines: readonly string[]): string {
  return lines.map((line, index) => lineHtml(line, index + 1)).join(LINE_BREAK_HTML);
}

/** 건너뛴 줄 표시 한 줄 */
function gapHtml(count: number): string {
  return `<span class="lesson-code__gap">⋯ ${count}줄 건너뜀 ⋯</span>`;
}

/** 발췌 HTML(원래 줄 번호 유지, 건너뛴 곳에 "⋯ n줄 건너뜀"). 보인 줄 수도 돌려준다. */
export function excerptToHtml(lines: readonly string[], ranges: FocusRanges['ranges']): { html: string; shown: number } {
  const parts: string[] = [];
  let shown = 0;
  let previousEnd = 0;
  for (const [start, end] of ranges) {
    if (start - previousEnd - 1 > 0) {
      parts.push(gapHtml(start - previousEnd - 1));
    }
    for (let number = start; number <= end; number += 1) {
      parts.push(lineHtml(lines[number - 1] ?? '', number));
      shown += 1;
    }
    previousEnd = end;
  }
  if (lines.length - previousEnd > 0) {
    parts.push(gapHtml(lines.length - previousEnd));
  }
  return { html: parts.join(LINE_BREAK_HTML), shown };
}
