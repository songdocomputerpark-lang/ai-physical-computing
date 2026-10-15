// 교과서 쪽 같음 검사의 순수 함수(scripts/lib/book-fidelity.mjs, 판 1.4.0 — DECISIONS C138)
import { describe, expect, it } from 'vitest';
import {
  FIDELITY_MIN,
  PRINTED_BOX_TITLE,
  SHINGLE,
  checkBookFidelity,
  comparePage,
  formatFidelity,
  mdPageUnits,
  normalizeText,
  shingles,
  splitBookPages,
  splitFrontmatter,
} from '../../../scripts/lib/book-fidelity.mjs';

describe('글 다듬기', () => {
  it('한글·영문·숫자만 남긴다(띄어쓰기·따옴표 모양·기호 무시)', () => {
    expect(normalizeText('lcd.putstr(‘Hello LCD!’)  — “글”')).toBe('lcdputstrHelloLCD글');
    expect(normalizeText('＊투과율·백라이트')).toBe('투과율백라이트');
  });

  it('5글자 조각으로 자른다', () => {
    expect(SHINGLE).toBe(5);
    expect(shingles('가나다라마바')).toEqual(['가나다라마', '나다라마바']);
    expect(shingles('가나다라')).toEqual([]);
  });

  it('frontmatter와 본문을 나누고 ::쪽[n] 표지로 쪽을 나눈다', () => {
    const { frontmatter, body } = splitFrontmatter('---\nid: x\n---\n\n::쪽[8]\n\n가\n\n::쪽[9]\n\n나\n');
    expect(frontmatter).toBe('id: x');
    const { before, pages } = splitBookPages(body);
    expect(before.trim()).toBe('');
    expect(pages.map((page) => [page.page, page.text.trim()])).toEqual([[8, '가'], [9, '나']]);
  });
});

describe('md → 비교할 문장 단위(mdPageUnits)', () => {
  const md = [
    '## 기본 실습 | 형식 맞추기',
    '',
    '### 단계 1 | 준비하기',
    '',
    '이 글은 **굵게**와 `코드`와 [링크](/learn/) 글이다. :용어[LCD](액정 화면)도 있다.',
    '',
    '![스크린샷에 얹힌 설명 글](/images/a.webp "교과서 8쪽")',
    '',
    '```python {start=2}',
    "from machine import Pin",
    '```',
    '',
    ':::코드설명',
    '- **줄 7\\~8** 핀을 불러온다',
    ':::',
    '',
    ':::웹정정[앞의 점]',
    '출판본에 없는 알림 글이에요.',
    ':::',
    '',
    '::실습실[esp32/u2/x.py]',
    '',
    ':::결과',
    '결과 글이다.',
    ':::',
    '',
    '| 평가 항목 | 잘한 정도 |',
    '| --- | --- |',
    '| 이해할 수 있는가? | 조금 · 보통 · 잘함 |',
    '| 첫째<br>둘째 | 하나 |',
  ].join('\n');
  const { units, alts } = mdPageUnits(md);

  it('제목은 칩과 제목으로 나누고, 마크다운 기호·주소·줄 번호 표지·웹 알림은 뺀다', () => {
    expect(units).toContain('기본 실습');
    expect(units).toContain('형식 맞추기');
    expect(units).toContain('단계 1');
    expect(units).toContain('준비하기');
    expect(units).toContain('이 글은 **굵게**와 `코드`와 링크 글이다. LCD(액정 화면)도 있다.');
    expect(units).toContain('from machine import Pin');
    expect(units).toContain('핀을 불러온다');
    expect(units.join('\n')).not.toContain('출판본에 없는');
    expect(units.join('\n')).not.toContain('줄 7');
    expect(units.join('\n')).not.toContain('esp32');
  });

  it('그림 대체 글은 따로 모으고, 출판본에 인쇄된 상자 이름은 더한다', () => {
    expect(alts).toEqual(['스크린샷에 얹힌 설명 글']);
    expect(units).toContain(PRINTED_BOX_TITLE['결과']);
    expect(units).toContain('결과 글이다.');
  });

  it('표는 칸마다 센다: 😐🙂😀 글자 풀이("조금 · 보통 · 잘함")는 빼고 <br>은 줄을 나눈다', () => {
    expect(units).toContain('이해할 수 있는가?');
    expect(units.join('\n')).not.toContain('조금');
    expect(units).toContain('첫째');
    expect(units).toContain('둘째');
  });
});

describe('한 쪽 비교(comparePage)', () => {
  const PDF = ['LCD는 여러 줄의 정보나 복잡한 화면을 동시에 표현할 수 있다.', '또한 다양한 크기와 해상도로 제작할 수 있다.'];

  it('같은 글이면 빠짐·더해짐이 1이다(줄이 문단 사이에서 끊겨도, 띄어쓰기·기호가 달라도)', () => {
    const result = comparePage(PDF, { units: ['LCD는 여러 줄의 정보나 복잡한 화면을 동시에 표현할 수 있다. 또한 다양한 크기와 해상도로 제작할 수 있다.'], alts: [] });
    expect(result.recall).toBe(1);
    expect(result.precision).toBe(1);
  });

  it('문장이 빠지면 빠짐이 내려가고 빠진 줄 후보가 나온다', () => {
    const result = comparePage(PDF, { units: ['LCD는 여러 줄의 정보나 복잡한 화면을 동시에 표현할 수 있다.'], alts: [] });
    expect(result.recall).toBeLessThan(0.7);
    expect(result.missing[0]).toBe(normalizeText(PDF[1]!));
  });

  it('출판본에 없는 글이 섞이면 더해짐이 내려간다', () => {
    const result = comparePage(PDF, { units: [...PDF, '출판본에 없는 문장이 길게 이어지는 글이에요 정말로'], alts: [] });
    expect(result.recall).toBe(1);
    expect(result.precision).toBeLessThan(0.8);
    expect(result.extra[0]).toContain('출판본에없는문장');
  });

  it('그림 대체 글은 빠짐을 채우되 더해짐을 깎지 않는다(스크린샷 위 설명 글은 PDF에 글자로 있다)', () => {
    const withCallout = comparePage([...PDF, '파일 → ...(으)로 저장 클릭'], { units: [...PDF], alts: ['코드 편집기 화면. 설명 글: 파일 → ...(으)로 저장 클릭'] });
    expect(withCallout.recall).toBe(1);
    expect(withCallout.precision).toBe(1);
    const without = comparePage([...PDF, '파일 → ...(으)로 저장 클릭'], { units: [...PDF], alts: [] });
    expect(without.recall).toBeLessThan(1);
  });

  it('PDF 안 글 차례(native)로 이어 붙인 조각도 맞다 — 문단이 줄 사이에서 옆 상자 줄과 섞여 정렬돼도 한 줄 문단과 같다', () => {
    const lines = ['문단의 앞부분은 이렇게 시작하고', '옆에 낀 용어 풀이', '뒷부분이 이어진다'];
    const native = ['문단의 앞부분은 이렇게 시작하고', '뒷부분이 이어진다', '옆에 낀 용어 풀이'];
    const joined = { units: ['문단의 앞부분은 이렇게 시작하고 뒷부분이 이어진다', '옆에 낀 용어 풀이'], alts: [] };
    expect(comparePage({ lines, native }, joined).precision).toBe(1);
    expect(comparePage(lines, joined).precision).toBeLessThan(1);
  });
});

describe('쪽 한 편 검사(checkBookFidelity)', () => {
  const body = '::쪽[8]\n\n첫 쪽 글이다 정말로 길게 이어지는 문장이다.\n\n::쪽[9]\n\n둘째 쪽 글이다 아주 다른 문장이다.\n';
  const book = { id: 'x', title: '제목', pages: [8, 9], body, exceptions: [] as { page: number; reason: string }[] };
  const pdf = new Map<number, string[]>([
    [8, ['제목', '첫 쪽 글이다 정말로 길게 이어지는 문장이다.']],
    [9, ['둘째 쪽 글이다 아주 다른 문장이다.']],
  ]);

  it('모두 같으면 통과한다(첫 쪽은 frontmatter 제목을 더해 맞춘다)', () => {
    const report = checkBookFidelity(book, pdf);
    expect(report.failed).toBe(false);
    expect(report.pages.map((page) => page.status)).toEqual(['ok', 'ok']);
  });

  it('쪽이 다르면 그 쪽만 실패하고, 예외로 적은 쪽은 까닭과 함께 통과한다', () => {
    const different = new Map(pdf).set(9, ['전혀 다른 글이 여기 인쇄되어 있다 아주 길게 이어진다.']);
    const failed = checkBookFidelity(book, different);
    expect(failed.failed).toBe(true);
    expect(failed.pages.map((page) => page.status)).toEqual(['ok', 'fail']);
    const excepted = checkBookFidelity({ ...book, exceptions: [{ page: 9, reason: '그림 안 글자' }] }, different);
    expect(excepted.failed).toBe(false);
    expect(excepted.pages[1]).toMatchObject({ status: 'excepted', reason: '그림 안 글자' });
  });

  it('쪽 표지가 없거나 원본에서 글자를 읽지 못한 쪽은 실패한다', () => {
    const noMark = checkBookFidelity({ ...book, body: '::쪽[8]\n\n첫 쪽 글이다.\n' }, pdf);
    expect(noMark.pages[1]?.status).toBe('no-mark');
    const noPdf = checkBookFidelity(book, new Map([[8, pdf.get(8)!]]));
    expect(noPdf.pages[1]).toMatchObject({ status: 'fail' });
    expect(noPdf.pages[1]?.missing[0]).toContain('글자를 읽지 못했어요');
  });

  it('결과 글: 통과·실패 줄과 빠진 글 후보, 기준 0.97', () => {
    expect(FIDELITY_MIN).toBe(0.97);
    const text = formatFidelity([checkBookFidelity(book, new Map(pdf).set(9, ['전혀 다른 글이 여기 인쇄되어 있다 아주 길게 이어진다.']))]);
    expect(text).toContain('[실패] x');
    expect(text).toContain('8쪽  빠짐 1.000');
    expect(text).toContain('9쪽  실패');
    expect(text).toContain('빠졌거나 달라진 글 후보');
    expect(text).toContain('fidelity_exceptions');
  });
});
