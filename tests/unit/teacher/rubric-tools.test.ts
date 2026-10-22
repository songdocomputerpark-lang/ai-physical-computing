// @vitest-environment jsdom
// 채점 기준 표 인쇄·복사(판 1.7.0 구역 Z3, 미해결 258) — src/components/teacher/rubric-tools.ts의 순수 함수와 단추 동작(jsdom),
// 그리고 단추를 그리는 쪽(LessonTeacherSummary·지도 요약 쪽)과 표 위치를 찾는 규칙(rubricTargetId·rubricSectionOf).
// 실제 브라우저에서 클립보드·인쇄 화면이 되는지는 tests/e2e/teacher.spec.ts("채점 기준 표 인쇄·복사")가 본다.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rubricTargetId } from '../../../src/components/lesson/teacher-summary.ts';
import {
  RUBRIC_MESSAGES,
  RUBRIC_PRINTING_ATTRIBUTE,
  buildPrintRoot,
  cleanCellText,
  findRubricTable,
  installRubricTools,
  printTitle,
  rowsToTsv,
  rubricIntroText,
  tableRows,
} from '../../../src/components/teacher/rubric-tools.ts';
import { rubricExpected, rubricSectionOf, type TeacherLesson } from '../../../src/components/teacher/teacher-lessons.ts';

const TABLE_HTML =
  '<table id="t1" tabindex="0" data-scroll-more="end"><thead><tr><th>관찰 항목</th><th>잘함</th><th>보통</th><th>노력 요함</th></tr></thead>' +
  '<tbody><tr><td>첫째  항목\n(퀴즈 1)</td><td>잘 <code>해냄</code></td><td>일부만 함</td><td>못 함</td></tr>' +
  '<tr><td>둘째 항목</td><td>가</td><td>나</td><td>다</td></tr></tbody></table>';

function pageHtml(extra = ''): string {
  return (
    '<h1>2-1-2 LCD 제어하기</h1>' +
    '<details open><summary>선생님용</summary>' +
    '<div data-rubric-tools data-rubric-target="rubric-h" hidden>' +
    '<button type="button" data-rubric-print>표 인쇄</button><button type="button" data-rubric-copy>표 복사</button><span data-rubric-status role="status"></span></div>' +
    '<h3 id="rubric-h">채점 기준</h3><p>수행평가에서 세 단계로 판단한다.</p>' +
    TABLE_HTML +
    '<h3 id="next-h">자주 막히는 곳</h3><table id="other"><tr><td>다른 표</td></tr></table>' +
    '</details>' +
    extra
  );
}

describe('표 글 다듬기', () => {
  it('cleanCellText: 줄바꿈·탭·겹친 빈칸을 한 칸으로 줄이고 앞뒤를 뗀다', () => {
    expect(cleanCellText('  가\n나\t\t다   라 ')).toBe('가 나 다 라');
  });

  it('rowsToTsv: 칸은 탭, 행은 줄바꿈으로 나누고 끝에 줄바꿈이 없다 — 칸 안의 탭·줄바꿈은 빈칸 하나가 된다', () => {
    expect(
      rowsToTsv([
        ['관찰 항목', '잘함'],
        ['가\n나', '다\t라'],
      ]),
    ).toBe('관찰 항목\t잘함\n가 나\t다 라');
  });

  it('rowsToTsv: 큰따옴표가 든 칸은 따옴표로 감싸 안의 따옴표를 두 개로 한다(표 프로그램이 칸을 잘못 읽지 않게)', () => {
    expect(rowsToTsv([['말 "예시"를 듦', '보통']])).toBe('"말 ""예시""를 듦"\t보통');
  });

  it('printTitle: 차시 이름 뒤에 "— 채점 기준", 이름이 없으면 "채점 기준"', () => {
    expect(printTitle('  2-1-2  LCD 제어하기 ')).toBe('2-1-2 LCD 제어하기 — 채점 기준');
    expect(printTitle('')).toBe('채점 기준');
  });
});

describe('표 찾기', () => {
  it('제목 다음에 처음 나오는 표를 찾고, 다음 제목 뒤의 표는 집지 않는다', () => {
    document.body.innerHTML = pageHtml();
    const table = findRubricTable(document.getElementById('rubric-h'));
    expect(table?.id).toBe('t1');
    // 다음 제목(자주 막히는 곳) 아래에는 채점 기준 표가 없다고 보고 null
    expect(findRubricTable(document.getElementById('next-h'))?.id).toBe('other');
    document.body.innerHTML = '<h3 id="a">채점 기준</h3><p>표가 없다</p><h3 id="b">다음</h3>' + TABLE_HTML;
    expect(findRubricTable(document.getElementById('a'))).toBeNull();
    expect(findRubricTable(null)).toBeNull();
  });

  it('표가 감싸개(div) 안에 있어도 찾는다', () => {
    document.body.innerHTML = '<h3 id="a">채점 기준</h3><div class="wrap">' + TABLE_HTML + '</div>';
    expect(findRubricTable(document.getElementById('a'))?.id).toBe('t1');
  });

  it('tableRows: 머리 줄을 포함해 칸 글을 다듬어 돌려준다(코드 글자도 글로)', () => {
    document.body.innerHTML = pageHtml();
    const rows = tableRows(findRubricTable(document.getElementById('rubric-h'))!);
    expect(rows).toEqual([
      ['관찰 항목', '잘함', '보통', '노력 요함'],
      ['첫째 항목 (퀴즈 1)', '잘 해냄', '일부만 함', '못 함'],
      ['둘째 항목', '가', '나', '다'],
    ]);
  });

  it('rubricIntroText: 제목과 표 사이의 안내 글만 모은다', () => {
    document.body.innerHTML = pageHtml();
    const heading = document.getElementById('rubric-h');
    expect(rubricIntroText(heading, findRubricTable(heading)!)).toBe('수행평가에서 세 단계로 판단한다.');
  });
});

describe('인쇄 상자', () => {
  it('제목·안내·표 복사본·쪽 주소를 담고, 복사본에서는 id·초점·스크롤 표식을 뗀다(원본은 그대로)', () => {
    document.body.innerHTML = pageHtml();
    const table = findRubricTable(document.getElementById('rubric-h'))!;
    const root = buildPrintRoot(document, table, '2-1-2 LCD 제어하기 — 채점 기준', '안내 글', 'https://example.test/learn/u2/2-1-2/');
    expect(root.querySelector('h1')?.textContent).toBe('2-1-2 LCD 제어하기 — 채점 기준');
    expect(root.querySelector('p')?.textContent).toBe('안내 글');
    expect(root.querySelectorAll('tr')).toHaveLength(3);
    const clone = root.querySelector('table')!;
    expect(clone.hasAttribute('id')).toBe(false);
    expect(clone.hasAttribute('tabindex')).toBe(false);
    expect(clone.hasAttribute('data-scroll-more')).toBe(false);
    expect(root.querySelector('.rubric-print-root__source')?.textContent).toBe('이 표가 있는 쪽: https://example.test/learn/u2/2-1-2/');
    // 원본 표는 그대로
    expect(table.id).toBe('t1');
    expect(table.getAttribute('tabindex')).toBe('0');
  });

  it('안내 글·주소가 비면 그 줄을 만들지 않는다', () => {
    document.body.innerHTML = pageHtml();
    const root = buildPrintRoot(document, findRubricTable(document.getElementById('rubric-h'))!, '제목', '', '');
    expect(root.querySelectorAll('p')).toHaveLength(0);
  });
});

describe('단추 줄 켜기', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute(RUBRIC_PRINTING_ATTRIBUTE);
  });

  it('installRubricTools: 처음엔 hidden인 줄을 보이게 하고, 두 번 불러도 한 번만 켠다', async () => {
    document.body.innerHTML = pageHtml();
    const bar = document.querySelector<HTMLElement>('[data-rubric-tools]')!;
    expect(bar.hidden).toBe(true);
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    installRubricTools(window);
    installRubricTools(window);
    expect(bar.hidden).toBe(false);
    bar.querySelector<HTMLButtonElement>('[data-rubric-copy]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('[표 복사]: 탭으로 나눈 표를 클립보드에 넣고 "표를 복사했어요"를 알린 뒤 얼마 뒤 지운다', async () => {
    document.body.innerHTML = pageHtml();
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    installRubricTools(window);
    document.querySelector<HTMLButtonElement>('[data-rubric-copy]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledWith(
      ['관찰 항목\t잘함\t보통\t노력 요함', '첫째 항목 (퀴즈 1)\t잘 해냄\t일부만 함\t못 함', '둘째 항목\t가\t나\t다'].join('\n'),
    );
    const status = document.querySelector('[data-rubric-status]')!;
    expect(status.textContent).toBe(RUBRIC_MESSAGES.copied);
    await vi.advanceTimersByTimeAsync(9000);
    expect(status.textContent).toBe('');
  });

  it('[표 복사]: 복사하지 못하면 직접 복사하는 방법을 알린다', async () => {
    document.body.innerHTML = pageHtml();
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
    // jsdom에는 execCommand가 없다 — 보이지 않는 입력칸 복사도 안 되는 경우
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    installRubricTools(window);
    document.querySelector<HTMLButtonElement>('[data-rubric-copy]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('[data-rubric-status]')!.textContent).toBe(RUBRIC_MESSAGES.copyFailed);
    expect(document.querySelectorAll('textarea')).toHaveLength(0);
  });

  it('표를 찾지 못하면(제목 id가 없으면) 안내만 한다', async () => {
    document.body.innerHTML = pageHtml().replace('id="rubric-h"', 'id="elsewhere"');
    installRubricTools(window);
    document.querySelector<HTMLButtonElement>('[data-rubric-copy]')!.click();
    document.querySelector<HTMLButtonElement>('[data-rubric-print]')!.click();
    expect(document.querySelector('[data-rubric-status]')!.textContent).toBe(RUBRIC_MESSAGES.noTable);
    expect(document.querySelector('[data-rubric-print-root]')).toBeNull();
  });

  it('[표 인쇄]: 인쇄 상자를 붙이고 html에 표시를 달아 인쇄 창을 열며, afterprint가 오면 치운다', () => {
    document.body.innerHTML = pageHtml();
    installRubricTools(window);
    let seen: { attribute: boolean; heading: string; rows: number } | undefined;
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      const root = document.querySelector('[data-rubric-print-root]');
      seen = {
        attribute: document.documentElement.hasAttribute(RUBRIC_PRINTING_ATTRIBUTE),
        heading: root?.querySelector('h1')?.textContent ?? '',
        rows: root?.querySelectorAll('tr').length ?? 0,
      };
    });
    document.querySelector<HTMLButtonElement>('[data-rubric-print]')!.click();
    expect(print).toHaveBeenCalledTimes(1);
    // 단추 줄에 차시 이름이 없으면 쪽의 첫 제목을 쓴다
    expect(seen).toEqual({ attribute: true, heading: '2-1-2 LCD 제어하기 — 채점 기준', rows: 3 });
    expect(document.querySelectorAll('[data-rubric-print-root]')).toHaveLength(1);
    window.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('[data-rubric-print-root]')).toBeNull();
    expect(document.documentElement.hasAttribute(RUBRIC_PRINTING_ATTRIBUTE)).toBe(false);
    print.mockRestore();
  });

  it('[표 인쇄]: afterprint가 오지 않는 브라우저도 다음에 누르거나 키를 치면 상자를 치운다(남으면 일반 인쇄가 이 표만 나온다)', () => {
    document.body.innerHTML = pageHtml();
    installRubricTools(window);
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    document.querySelector<HTMLButtonElement>('[data-rubric-print]')!.click();
    expect(document.querySelectorAll('[data-rubric-print-root]')).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
    expect(document.querySelector('[data-rubric-print-root]')).toBeNull();
    expect(document.documentElement.hasAttribute(RUBRIC_PRINTING_ATTRIBUTE)).toBe(false);
    print.mockRestore();
  });

  it('단추 줄의 data-rubric-title이 있으면 인쇄 제목에 쓴다(지도 요약 쪽은 쪽 제목이 대단원이라)', () => {
    document.body.innerHTML = pageHtml().replace('data-rubric-target="rubric-h"', 'data-rubric-target="rubric-h" data-rubric-title="2-1-3 OLED 제어하기"');
    installRubricTools(window);
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    document.querySelector<HTMLButtonElement>('[data-rubric-print]')!.click();
    expect(document.querySelector('[data-rubric-print-root] h1')?.textContent).toBe('2-1-3 OLED 제어하기 — 채점 기준');
    window.dispatchEvent(new Event('afterprint'));
    print.mockRestore();
  });
});

describe('표 제목 찾기와 단추를 그리는 쪽', () => {
  it('rubricTargetId: 접기 안 "채점 기준" 제목의 id(글자 사이 빈칸은 무시), 없으면 undefined', () => {
    expect(rubricTargetId([{ id: 'a', title: '평가 포인트' }, { id: '채점-기준', title: '채점 기준' }])).toBe('채점-기준');
    expect(rubricTargetId([{ id: 'x', title: '채 점 기 준(예시)' }])).toBe('x');
    expect(rubricTargetId([{ id: 'a', title: '평가 포인트' }])).toBeUndefined();
    expect(rubricTargetId([])).toBeUndefined();
  });

  const fake = (kind: string, titles: readonly string[]): TeacherLesson =>
    ({
      summary: { kind },
      guide: { html: '', intro: '', sections: titles.map((title, index) => ({ id: `g-${index}`, title, html: '' })) },
    }) as unknown as TeacherLesson;

  it('rubricSectionOf: 지도 요약용 차시의 "채점 기준" 부분을 찾는다(없거나 교사용 접기가 없으면 undefined)', () => {
    expect(rubricSectionOf(fake('textbook', ['지도안 요약', '채점 기준', '자주 막히는 곳']))?.id).toBe('g-1');
    expect(rubricSectionOf(fake('textbook', ['지도안 요약']))).toBeUndefined();
    expect(rubricSectionOf({ summary: { kind: 'textbook' } } as unknown as TeacherLesson)).toBeUndefined();
  });

  it('rubricExpected: 교과서·보충 차시만 표가 있어야 한다(대단원 마무리·읽기 자료는 제외)', () => {
    expect(rubricExpected(fake('textbook', []))).toBe(true);
    expect(rubricExpected(fake('supplement', []))).toBe(true);
    expect(rubricExpected(fake('review', []))).toBe(false);
    expect(rubricExpected(fake('reading', []))).toBe(false);
  });

  it('차시 교사용 접기 맨 위 요약 줄과 지도 요약 쪽 차시마다 단추 줄 부품을 쓴다', () => {
    const summary = readFileSync('src/components/lesson/LessonTeacherSummary.astro', 'utf8');
    expect(summary).toContain("import RubricTools from '../teacher/RubricTools.astro'");
    expect(summary).toMatch(/\{rubricId && <RubricTools targetId=\{rubricId\} \/>\}/u);
    const guides = readFileSync('src/pages/teacher/guides/[unit].astro', 'utf8');
    expect(guides).toContain("import RubricTools from '../../../components/teacher/RubricTools.astro'");
    expect(guides).toMatch(/<RubricTools targetId=\{rubric\.id\} title=\{lessonHeading\(lesson\)\} \/>/u);
  });

  it('단추 줄 부품: 자바스크립트가 켜기 전에는 hidden이고, 이름에 차시 이름이 들어가며, 인쇄 규칙이 표 상자만 남긴다', () => {
    const source = readFileSync('src/components/teacher/RubricTools.astro', 'utf8');
    expect(source).toMatch(/<p class="rubric-tools" data-rubric-tools[^>]* hidden\b/u);
    expect(source).toContain('data-rubric-print');
    expect(source).toContain('data-rubric-copy');
    expect(source).toContain('role="status"');
    expect(source).toContain('${prefix}채점 기준 표 인쇄');
    expect(source).toContain('${prefix}채점 기준 표 복사');
    expect(source).toMatch(/\.rubric-tools\[hidden\]\s*\{\s*display:\s*none;/u);
    expect(source).toMatch(/html\[data-rubric-printing\] body > :not\(\.rubric-print-root\)\s*\{\s*display:\s*none !important;/u);
    expect(source).toMatch(/\.rubric-print-root\s*\{\s*display:\s*none;/u);
  });
});
