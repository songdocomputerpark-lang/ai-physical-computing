// 교과서 쪽 "그대로 싣기" 같음 검사의 순수 함수(판 1.4.0 — DECISIONS C138). npm run book:fidelity(scripts/check-book-fidelity.mjs)와 단위 테스트가 쓴다.
//
// 무엇을 재나: 교과서 쪽 md(content/book/<id>.md)를 ::쪽[n] 표지로 쪽마다 나눠 "문장"만 남긴 글과, 원본 PDF(출판본 교과서) 그 쪽의 글자를 맞댄다.
//   두 글을 모두 한글·영문·숫자만 남기고(띄어쓰기·따옴표 모양·가운뎃점·괄호·기호 무시) 5글자 조각(shingle)으로 잘라 겹침을 낸다.
//   - 빠짐(recall): 원본 PDF의 줄마다 그 줄의 5글자 조각이 md 글에 있는 비율(조각 개수 가중). 문장이 빠지거나 글자가 바뀌면 내려간다.
//   - 더해짐(precision): md의 문장 단위(문단·목록 항목·표 칸·코드 줄)마다 5글자 조각이 원본 쪽 글에 있는 비율. 출판본에 없는 글이 섞이면 내려간다.
//   둘 다 FIDELITY_MIN(0.97) 이상이어야 그 쪽이 통과한다. 쪽마다 frontmatter fidelity_exceptions: [{ page, reason }]에 적은 쪽은 까닭과 함께 통과한다.
//
// 비교에서 빼는 것(원본에 없는 글이거나 원본의 꾸밈이라서): 쪽 표지·실습실 자리·상자 문법 줄, :::웹정정·:::그림생략 상자 안의 글, 코드 설명의 줄 번호 표지(**줄 7~8**),
//   자기 평가 표의 "조금 · 보통 · 잘함"(😐🙂😀 칸의 글자 풀이), 목록 머리표(- 1.), 마크다운 기호·주소. 원본에서 빼는 것: 머리말·쪽 번호·indd 파일 이름 줄·코드 줄 번호(일꾼이 처리).
//   그림은 대체 글(alt)을 "그림 속 글자"로 봐서 **빠짐 쪽에만** 넣는다(스크린샷에 얹힌 설명 글이 PDF에는 글자로 있다) — 더해짐에는 넣지 않는다(대체 글은 설명 문장이라 원본에 없다).
//   상자 이름 가운데 출판본에 글자로 인쇄된 것(해 보기·실행 결과·자기 평가·학습 활동·점검하기)은 PRINTED_BOX_TITLE 표대로 그 글자를 더해 맞춘다.
//
// 순수 함수라 파일·파이썬을 쓰지 않는다. 원본 PDF 글자 뽑기는 scripts/lib/book_text_worker.py, 흐름은 scripts/check-book-fidelity.mjs.

/** 5글자 조각 길이 */
export const SHINGLE = 5;
/** 쪽마다 빠짐·더해짐이 모두 이 값 이상이어야 통과 */
export const FIDELITY_MIN = 0.97;
/** 빠진 문장 후보를 쪽마다 몇 줄까지 보일지 */
export const REPORT_LINES = 6;

/** 상자 이름 → 출판본에 그 상자의 이름표로 인쇄된 글(없으면 이름표를 인쇄하지 않는 상자) */
export const PRINTED_BOX_TITLE = Object.freeze({
  해보기: '해 보기',
  결과: '실행 결과',
  점검하기: '점검하기',
  자기평가: '자기 평가',
  학습활동: '학습 활동',
});

/** 비교에서 통째로 빼는 상자(원본에 없는 글) */
const SKIPPED_BOXES = new Set(['웹정정', 'webfix', '그림생략', 'omitted']);

/**
 * 한글·영문·숫자만 남긴다(NFC). 띄어쓰기·기호·따옴표 모양은 모두 무시된다.
 * @param {string} text
 */
export function normalizeText(text) {
  return text.normalize('NFC').replace(/[^\p{Script=Hangul}A-Za-z0-9]/gu, '');
}

/**
 * 글에서 5글자 조각의 목록(겹치게).
 * @param {string} normalized normalizeText를 거친 글
 * @param {number} [size]
 * @returns {string[]}
 */
export function shingles(normalized, size = SHINGLE) {
  const found = [];
  for (let index = 0; index + size <= normalized.length; index += 1) {
    found.push(normalized.slice(index, index + size));
  }
  return found;
}

/**
 * md 글을 frontmatter와 본문으로 나눈다.
 * @param {string} text
 * @returns {{ frontmatter: string | null, body: string }}
 */
export function splitFrontmatter(text) {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/u.exec(text);
  return match ? { frontmatter: match[1] ?? '', body: match[2] ?? '' } : { frontmatter: null, body: text };
}

/**
 * 본문을 ::쪽[n] 표지로 나눈다. 표지 앞의 글은 before에 둔다(쪽 표지 규칙이 이를 막는다).
 * @param {string} body
 * @returns {{ before: string, pages: { page: number, text: string }[] }}
 */
export function splitBookPages(body) {
  const mark = /^[ \t]*::쪽\[(\d{1,3})\][ \t]*$/gmu;
  const found = [...body.matchAll(mark)];
  if (found.length === 0) {
    return { before: body, pages: [] };
  }
  const pages = found.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = found[index + 1]?.index ?? body.length;
    return { page: Number(match[1]), text: body.slice(start, end) };
  });
  return { before: body.slice(0, found[0]?.index ?? 0), pages };
}

/** md 인라인 표시를 걷어 글자만 남긴다(그림 alt는 따로 모은다) */
function inlineText(line, alts) {
  let text = line;
  // 그림: ![alt](주소 "제목") → alt는 따로(빠짐 쪽에만), 글에서는 뺀다
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/gu, (_whole, alt) => {
    if (alt.trim() !== '') alts.push(alt);
    return ' ';
  });
  // 원시 HTML 그림: <img ... alt="...">
  text = text.replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/giu, (_whole, alt) => {
    if (alt.trim() !== '') alts.push(alt);
    return ' ';
  });
  // 용어 표시 :용어[낱말]{…} → 낱말 (링크 규칙보다 먼저 — 바로 뒤의 (풀이 괄호)를 링크 주소로 읽지 않게)
  text = text.replace(/:(?:용어|term)\[([^\]]*)\](?:\{[^}]*\})?/gu, '$1');
  // 링크 [글](주소) → 글
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1');
  // 코드 설명 줄 번호 표지 **줄 7\~8**
  text = text.replace(/\*\*줄 [^*]*\*\*/gu, ' ');
  // HTML 태그(<br> 포함)는 글자 경계로
  text = text.replace(/<[^>]+>/gu, ' ');
  return text;
}

/**
 * md 한 쪽의 본문을 비교할 글 단위로 바꾼다.
 * @param {string} md 한 쪽 분량의 md(쪽 표지 줄 제외)
 * @returns {{ units: string[], alts: string[] }} units는 더해짐·빠짐에 모두 쓰는 문장 단위(대체 글 제외), alts는 그림 대체 글(빠짐에만)
 */
export function mdPageUnits(md) {
  /** @type {string[]} */
  const units = [];
  /** @type {string[]} */
  const alts = [];
  const boxes = [];
  let skipDepth = 0;
  let fence = false;
  const cleaned = md.replace(/<!--[\s\S]*?-->/gu, '');
  for (const rawLine of cleaned.split(/\r?\n/u)) {
    const line = rawLine.trimEnd();
    if (/^[ \t]*(?:```|~~~)/u.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) {
      if (skipDepth === 0 && line.trim() !== '') units.push(line);
      continue;
    }
    // 상자 열기·닫기
    const open = /^[ \t]*:{3,}([^\s[{:]+)(?:\[([^\]]*)\])?(?:\{[^}]*\})?[ \t]*$/u.exec(line);
    if (open) {
      const name = open[1] ?? '';
      boxes.push(name);
      if (SKIPPED_BOXES.has(name)) {
        skipDepth += 1;
        continue;
      }
      if (skipDepth === 0) {
        const printed = /** @type {Record<string, string>} */ (PRINTED_BOX_TITLE)[name];
        if (printed) units.push(printed);
        if (open[2]) units.push(open[2]);
      }
      continue;
    }
    if (/^[ \t]*:{3,}[ \t]*$/u.test(line)) {
      const name = boxes.pop();
      if (name !== undefined && SKIPPED_BOXES.has(name)) skipDepth = Math.max(0, skipDepth - 1);
      continue;
    }
    if (skipDepth > 0) continue;
    // 한 줄 지시자(::실습실[…]·::예제 …)와 빈 줄, 표 구분선
    if (/^[ \t]*::[^\s:]/u.test(line) || line.trim() === '' || /^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/u.test(line)) {
      continue;
    }
    // 표 한 줄 → 칸마다
    if (/^[ \t]*\|.*\|[ \t]*$/u.test(line)) {
      for (const cell of line.trim().slice(1, -1).split('|')) {
        // 칸 안의 <br>은 줄바꿈이라 따로 센다(원본에서도 줄이 따로다)
        for (const piece of cell.split(/<br\s*\/?>/iu)) {
          const text = inlineText(piece, alts).trim();
          if (text !== '' && !/^조금\s*·\s*보통\s*·\s*잘함$/u.test(text)) units.push(text);
        }
      }
      continue;
    }
    // 제목(## …): 출판본은 번호 배지·"단계 N" 칩·"기본 실습" 칩이 제목 글자와 따로 인쇄되므로 칩과 제목을 나눠 센다
    const heading = /^[ \t]*#{1,6}\s+(.*)$/u.exec(line);
    if (heading) {
      const title = inlineText(heading[1] ?? '', alts).trim();
      const chip = /^(.+?) \| (.+)$/u.exec(title) ?? /^(\d{1,2}) (\S.*)$/u.exec(title);
      for (const part of chip ? [chip[1], chip[2]] : [title]) if (part && part.trim() !== '') units.push(part.trim());
      continue;
    }
    // 목록 머리표·인용 표시를 뗀다
    const text = inlineText(line.replace(/^[ \t]*(?:>\s*|[-*+]\s+|\d+[.)]\s+)/u, ''), alts).trim();
    if (text !== '') units.push(text);
  }
  return { units, alts };
}

/**
 * 한 쪽을 비교한다.
 * @param {string[] | { lines: string[], native?: string[] }} pdf 원본 PDF 그 쪽의 글(머리말·쪽 번호·코드 줄 번호는 일꾼이 뺀 것): 줄 목록, 또는 { lines(정렬한 줄), native(PDF 안 글 덩어리 차례 그대로의 줄) }
 * @param {{ units: string[], alts: string[] }} md mdPageUnits의 결과
 * @returns {{ recall: number, precision: number, missing: string[], extra: string[], pdfChars: number, mdChars: number }}
 */
export function comparePage(pdf, md) {
  const pdfLines = Array.isArray(pdf) ? pdf : pdf.lines;
  const pdfNative = Array.isArray(pdf) ? [] : (pdf.native ?? []);
  const pdfNorm = pdfLines.map(normalizeText).filter((line) => line !== '');
  const mdNorm = md.units.map(normalizeText).filter((unit) => unit !== '');
  const altNorm = md.alts.map(normalizeText).filter((unit) => unit !== '');

  // 원본 쪽 조각(줄 안의 조각 + 줄을 이은 글의 조각 — 문단 줄바꿈 사이를 넘는 조각도 맞도록)
  // (문단·제목이 여러 줄에 걸쳐 인쇄돼도 md의 한 줄 문단과 맞도록, 줄을 이은 조각도 넣는다 — PDF 안의 글 차례대로 이은 것과 정렬한 차례로 이은 것 둘 다)
  const pdfAll = new Set([
    ...pdfNorm.flatMap((line) => shingles(line)),
    ...shingles(normalizeText(pdfNative.join(''))),
    ...shingles(pdfNorm.join('')),
  ]);
  // md 조각(문장 단위 + 이은 글, 그림 대체 글은 빠짐 쪽에만)
  const mdForPrecision = new Set([...mdNorm.flatMap((unit) => shingles(unit))]);
  const mdForRecall = new Set([...mdForPrecision, ...shingles(mdNorm.join('')), ...altNorm.flatMap((unit) => shingles(unit)), ...shingles(altNorm.join(''))]);

  let pdfTotal = 0;
  let pdfFound = 0;
  /** @type {{ text: string, score: number }[]} */
  const lineScores = [];
  for (const line of pdfNorm) {
    const grams = shingles(line);
    if (grams.length === 0) {
      // 4글자 이하의 짧은 줄은 이은 글 어디엔가 들어 있으면 충분(칩 이름 등) — 조각 수에는 넣지 않는다
      continue;
    }
    const found = grams.filter((gram) => mdForRecall.has(gram)).length;
    pdfTotal += grams.length;
    pdfFound += found;
    if (found / grams.length < 0.6) lineScores.push({ text: line, score: found / grams.length });
  }
  let mdTotal = 0;
  let mdFound = 0;
  /** @type {{ text: string, score: number }[]} */
  const extraScores = [];
  for (const unit of mdNorm) {
    const grams = shingles(unit);
    if (grams.length === 0) continue;
    const found = grams.filter((gram) => pdfAll.has(gram)).length;
    mdTotal += grams.length;
    mdFound += found;
    if (found / grams.length < 0.6) extraScores.push({ text: unit, score: found / grams.length });
  }
  return {
    recall: pdfTotal === 0 ? 1 : pdfFound / pdfTotal,
    precision: mdTotal === 0 ? 1 : mdFound / mdTotal,
    missing: lineScores.sort((a, b) => a.score - b.score).map((entry) => entry.text),
    extra: extraScores.sort((a, b) => a.score - b.score).map((entry) => entry.text),
    pdfChars: pdfNorm.join('').length,
    mdChars: mdNorm.join('').length,
  };
}

/**
 * 교과서 쪽 한 편을 검사한다.
 * @param {{ id: string, title: string, pages: number[], body: string, exceptions: { page: number, reason: string }[] }} book
 * @param {Map<number, string[] | { lines: string[], native?: string[] }>} pdfPages 쪽 번호 → 원본 PDF 글(줄 목록 또는 { lines, native })
 * @param {number} [minimum]
 * @returns {{ id: string, pages: { page: number, status: 'ok' | 'fail' | 'excepted' | 'no-mark', recall: number, precision: number, missing: string[], extra: string[], reason?: string }[], failed: boolean }}
 */
export function checkBookFidelity(book, pdfPages, minimum = FIDELITY_MIN) {
  const { pages: marked } = splitBookPages(book.body);
  const results = [];
  for (const page of book.pages) {
    const part = marked.find((candidate) => candidate.page === page);
    const exception = book.exceptions.find((candidate) => candidate.page === page);
    if (!part) {
      results.push({ page, status: exception ? 'excepted' : 'no-mark', recall: 0, precision: 0, missing: [], extra: [], ...(exception ? { reason: exception.reason } : {}) });
      continue;
    }
    const pdfText = pdfPages.get(page) ?? [];
    if ((Array.isArray(pdfText) ? pdfText : pdfText.lines).length === 0) {
      // 원본 PDF에서 글자를 읽지 못한 쪽(쪽 번호가 틀렸거나 그림뿐인 쪽) — 겹침을 잴 수 없으니 통과시키지 않는다
      results.push({
        page,
        status: exception ? 'excepted' : 'fail',
        recall: 0,
        precision: 0,
        missing: ['원본 PDF의 이 쪽에서 글자를 읽지 못했어요(쪽 번호나 원본 파일을 확인해요)'],
        extra: [],
        ...(exception ? { reason: exception.reason } : {}),
      });
      continue;
    }
    const md = mdPageUnits(part.text);
    // 첫 쪽에는 절 제목이 쪽 맨 위 큰 글자로 인쇄된다(제목은 frontmatter에 있다)
    if (page === book.pages[0]) md.units.unshift(book.title);
    const result = comparePage(pdfText, md);
    const passed = result.recall >= minimum && result.precision >= minimum;
    results.push({
      page,
      status: passed ? 'ok' : exception ? 'excepted' : 'fail',
      recall: result.recall,
      precision: result.precision,
      missing: result.missing.slice(0, REPORT_LINES),
      extra: result.extra.slice(0, REPORT_LINES),
      ...(exception && !passed ? { reason: exception.reason } : {}),
    });
  }
  return { id: book.id, pages: results, failed: results.some((entry) => entry.status === 'fail' || entry.status === 'no-mark') };
}

/**
 * 결과를 사람이 읽는 글로.
 * @param {ReturnType<typeof checkBookFidelity>[]} reports
 * @param {number} [minimum]
 */
export function formatFidelity(reports, minimum = FIDELITY_MIN) {
  const lines = [`교과서 쪽 같음 검사(npm run book:fidelity) — 쪽마다 빠짐(recall)·더해짐(precision)이 모두 ${minimum} 이상이어야 해요(5글자 조각 겹침).`, ''];
  let failed = 0;
  for (const report of reports) {
    lines.push(`${report.failed ? '[실패]' : '[통과]'} ${report.id}`);
    for (const entry of report.pages) {
      const score = `빠짐 ${entry.recall.toFixed(3)} · 더해짐 ${entry.precision.toFixed(3)}`;
      if (entry.status === 'ok') {
        lines.push(`    ${entry.page}쪽  ${score}`);
        continue;
      }
      if (entry.status === 'excepted') {
        lines.push(`    ${entry.page}쪽  ${score} — 예외로 통과(${entry.reason ?? '까닭 없음'})`);
        continue;
      }
      failed += 1;
      if (entry.status === 'no-mark') {
        lines.push(`    ${entry.page}쪽  실패 — 이 쪽의 ::쪽[${entry.page}] 표지가 없어요`);
        continue;
      }
      lines.push(`    ${entry.page}쪽  실패 — ${score}`);
      for (const text of entry.missing) lines.push(`        빠졌거나 달라진 글 후보: ${text.slice(0, 60)}`);
      for (const text of entry.extra) lines.push(`        출판본에 없는 글 후보: ${text.slice(0, 60)}`);
    }
  }
  lines.push('', failed === 0 ? '결과: 모두 통과' : `결과: 실패한 쪽 ${failed}개 — 글을 출판본 그대로 고치거나, 그림 속 글자처럼 어쩔 수 없는 쪽은 frontmatter fidelity_exceptions에 쪽과 까닭을 적어요.`);
  return lines.join('\n');
}
