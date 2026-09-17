/**
 * 가상 보드(CPython 위 흉내)에서는 되지만 실물 ESP32의 MicroPython에서는 오류가 나는 코드 모양 찾기(P3-08 — PLAN §8.3 P3-00 차이 표 9번
 * "가상에서는 되고 실물에서는 안 되는 방향이라 위험하다. 실행 전 호환 경고를 P3-01·P3-08에서 검토").
 * [실제 보드]에서 [실행]하기 전에 콘솔에 안내만 한다(막지 않는다 — 코드가 실제로 그 줄에 닿는지는 모른다). 순수 함수(tests/unit/serial/real-board-compat.test.ts).
 *
 * 근거: MicroPython v1.29.0 문서 "MicroPython differences from CPython — Builtin types"(docs.micropython.org/en/v1.29.0/genrst/builtin_types.html,
 * 2026-09-18 확인): str.ljust()·rjust() not implemented / Subscript with step != 1 is not yet implemented(str) · Bytes subscription with step != 1 ·
 * Tuple load with step != 1(리스트 읽기는 됨) / int bit_length doesn't exist / bytes.decode() only 'utf8'·'utf-8'·'ascii'·keyword arguments 없음 /
 * Dictionary keys view does not behave as a set / str.rsplit(None, n) not implemented.
 * 교과서 ESP32 예제에는 이런 모양이 없다(P3-00 검색) — 학생이 PC 파이썬 습관으로 새로 쓴 코드를 위한 안내다.
 */

export interface CompatIssue {
  /** 1부터 */
  readonly line: number;
  readonly code: CompatIssueCode;
  /** 안내 글(고1 기준 한국어) */
  readonly text: string;
}

export type CompatIssueCode = 'str-ljust-rjust' | 'slice-step' | 'int-bit-length' | 'codec-args' | 'dict-keys-set' | 'rsplit-none';

interface CompatRule {
  readonly code: CompatIssueCode;
  /** bare = 글자 안을 비운 줄, text = 주석만 뺀 줄(글자 안을 봐야 하는 규칙) */
  readonly on: 'bare' | 'text';
  readonly pattern: RegExp;
  readonly text: string;
}

const RULES: readonly CompatRule[] = [
  {
    code: 'str-ljust-rjust',
    on: 'bare',
    pattern: /\.(?:ljust|rjust)\s*\(/u,
    text: 'ljust()·rjust()는 실물 보드의 MicroPython에 없어서 AttributeError가 나요. "{:<8}".format(글)처럼 format으로 칸을 맞춰요.',
  },
  {
    code: 'slice-step',
    on: 'bare',
    pattern: /\[[^[\]\n]*:[^[\]\n]*:[^[\]\n]*\]/u,
    text: '[::-1]처럼 간격을 준 자르기는 실물 보드에서 글자·바이트·튜플에 쓰면 NotImplementedError가 나요(리스트는 돼요).',
  },
  {
    code: 'int-bit-length',
    on: 'bare',
    pattern: /\.bit_length\s*\(/u,
    text: 'bit_length()는 실물 보드의 MicroPython에 없어서 AttributeError가 나요.',
  },
  {
    code: 'codec-args',
    on: 'text',
    pattern: /\.(?:decode|encode)\s*\(\s*(?:[A-Za-z_]\w*\s*=|(['"])(?!(?:utf-?8|ascii)\1)[^'"\n]*\1)/iu,
    text: '실물 보드의 decode()·encode()는 utf-8·ascii만 받고, errors= 같은 이름 붙인 인자를 쓸 수 없어요.',
  },
  {
    code: 'dict-keys-set',
    on: 'bare',
    pattern: /\.keys\(\s*\)\s*[&|^-]/u,
    text: '딕셔너리 .keys()에 &·|·- 같은 집합 계산은 실물 보드에서 안 돼요. set(딕셔너리.keys())로 바꿔 계산해요.',
  },
  {
    code: 'rsplit-none',
    on: 'bare',
    pattern: /\.rsplit\s*\(\s*None\s*,/u,
    text: 'rsplit(None, n)은 실물 보드에서 안 돼요. rsplit(" ", n)처럼 나눌 글자를 적어요.',
  },
];

/** 한 줄씩: 주석을 뺀 줄(text)과 글자 안까지 비운 줄(bare). 세 따옴표 글자가 여러 줄에 걸치면 이어서 비운다 */
function scanLines(code: string): { text: string; bare: string }[] {
  const lines = code.replace(/\r\n?/gu, '\n').split('\n');
  const out: { text: string; bare: string }[] = [];
  let triple: string | null = null;
  for (const line of lines) {
    let text = '';
    let bare = '';
    let quote: string | null = null;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]!;
      if (triple) {
        if (line.startsWith(triple, index)) {
          text += triple;
          bare += triple;
          index += 2;
          triple = null;
        } else {
          text += char;
        }
        continue;
      }
      if (quote) {
        text += char;
        if (char === '\\') {
          text += line[index + 1] ?? '';
          index += 1;
        } else if (char === quote) {
          bare += quote;
          quote = null;
        }
        continue;
      }
      if (char === '#') {
        break;
      }
      if (char === '"' || char === "'") {
        if (line.startsWith(char.repeat(3), index)) {
          triple = char.repeat(3);
          text += triple;
          bare += triple;
          index += 2;
        } else {
          quote = char;
          text += char;
          bare += char;
        }
        continue;
      }
      text += char;
      bare += char;
    }
    out.push({ text, bare });
  }
  return out;
}

/** 실물 보드에서 안 될 수 있는 줄(같은 줄·같은 규칙은 한 번). 너무 많으면 앞의 limit개만 */
export function findRealBoardCompatIssues(code: string, limit = 5): CompatIssue[] {
  const issues: CompatIssue[] = [];
  scanLines(code).forEach((line, index) => {
    for (const rule of RULES) {
      if (issues.length >= limit) {
        return;
      }
      if (rule.pattern.test(rule.on === 'bare' ? line.bare : line.text)) {
        issues.push({ line: index + 1, code: rule.code, text: rule.text });
      }
    }
  });
  return issues;
}
