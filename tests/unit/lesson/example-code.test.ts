// 차시 따라하기 예제의 코드 상자 글자(src/components/lesson/example-code.ts) — 2026-09-25 Phase 5 검토 반영(중요 9·사소 20).
import { describe, expect, it } from 'vitest';
import { codeLinesToHtml, excerptToHtml, LINE_BREAK_HTML, parseFocusRanges, splitExampleCode } from '../../../src/components/lesson/example-code.ts';

describe('splitExampleCode — 끝의 실습실 안내 주석 떼기', () => {
  it('파일 끝의 "바꿔볼 것 3가지"·"왜 이런 결과가 나올까" 주석 묶음과 그 앞 빈 줄을 떼고, 앞 줄 번호는 그대로 둔다', () => {
    const code = [
      '# 제목',
      'x = 1',
      'print(x)',
      '',
      '# ── 바꿔볼 것 3가지 ──',
      '# 1. x를 바꿔요.',
      '# ── 왜 이런 결과가 나올까 ──',
      '# 까닭이에요.',
      '',
    ].join('\n');
    const split = splitExampleCode(code);
    expect(split.lines).toEqual(['# 제목', 'x = 1', 'print(x)']);
    expect(split.guideLines).toBe(5);
  });

  it('안내 묶음 뒤에 코드가 있으면(끝이 아니면) 떼지 않는다 — 원본 이관 예제의 줄을 건드리지 않게', () => {
    const code = ['x = 1', '# ── 실습 방법 ──', '# 1. [실행]', 'print(x)'].join('\n');
    expect(splitExampleCode(code)).toEqual({ lines: ['x = 1', '# ── 실습 방법 ──', '# 1. [실행]', 'print(x)'], guideLines: 0 });
  });

  it('안내 제목이 없는 끝 주석(원본 예제의 설명 주석)은 그대로 둔다', () => {
    const code = ['x = 1', '# 끝 설명'].join('\r\n');
    expect(splitExampleCode(code)).toEqual({ lines: ['x = 1', '# 끝 설명'], guideLines: 0 });
  });
});

describe('parseFocusRanges — 발췌할 줄 범위', () => {
  it('범위를 차례대로 합치고(겹침·이웃), 한 줄도 받는다', () => {
    expect(parseFocusRanges('117-123, 1-7, 5-9, 10, 201', 250).ranges).toEqual([
      [1, 10],
      [117, 123],
      [201, 201],
    ]);
    expect(parseFocusRanges('3~1', 10).ranges).toEqual([[1, 3]]);
  });

  it('파일 밖 줄은 문제로 알리고, 끝을 넘는 범위는 파일 끝까지만', () => {
    const result = parseFocusRanges('1-3, 40-60, 99', 50);
    expect(result.ranges).toEqual([
      [1, 3],
      [40, 50],
    ]);
    expect(result.problems).toHaveLength(2);
    expect(result.problems.join('\n')).toContain('50줄');
  });
});

describe('코드 상자 HTML', () => {
  it('줄마다 data-line 번호가 있고, 주석 줄은 흐린 색 클래스, 글자는 이스케이프한다', () => {
    const html = codeLinesToHtml(['# 설명', 'if a < b:', '    print("&")']);
    expect(html).toBe(
      [
        '<span class="lesson-code__line lesson-code__line--comment" data-line="1"># 설명</span>',
        '<span class="lesson-code__line" data-line="2">if a &lt; b:</span>',
        '<span class="lesson-code__line" data-line="3">    print("&amp;")</span>',
      ].join(LINE_BREAK_HTML),
    );
    // 태그를 떼면 예전처럼 줄마다 줄바꿈 글자로 이어진 글자(검색 색인·textContent)
    expect(html.replace(/<[^>]+>/gu, '')).toBe('# 설명\nif a &lt; b:\n    print("&amp;")');
  });

  it('발췌는 원래 줄 번호를 지키고 건너뛴 줄 수를 앞·사이·끝에 보인다', () => {
    const lines = Array.from({ length: 10 }, (_, index) => `line${index + 1}`);
    const { html, shown } = excerptToHtml(lines, [
      [3, 4],
      [8, 8],
    ]);
    expect(shown).toBe(3);
    expect(html).toBe(
      [
        '<span class="lesson-code__gap">⋯ 2줄 건너뜀 ⋯</span>',
        '<span class="lesson-code__line" data-line="3">line3</span>',
        '<span class="lesson-code__line" data-line="4">line4</span>',
        '<span class="lesson-code__gap">⋯ 3줄 건너뜀 ⋯</span>',
        '<span class="lesson-code__line" data-line="8">line8</span>',
        '<span class="lesson-code__gap">⋯ 2줄 건너뜀 ⋯</span>',
      ].join(LINE_BREAK_HTML),
    );
  });
});
