/**
 * 교과서 쪽 검사 규칙(판 1.4.0 — DECISIONS C131·C134·C138) — 한 곳에 모은 규칙을 두 곳이 함께 쓴다.
 *
 *   빌드(src/pages/book/[id].astro)                → 모든 문제를 경고로만 남긴다. 빌드는 멈추지 않는다(PD-35).
 *   npm run check:book(scripts/check-book.mjs)      → level이 error인 문제가 하나라도 있으면 실패한다(엄격 모드).
 *                                                     파일을 여는 검사(그림 파일·예제 파일·눈 확인 기록)는 scripts/lib/check-book.mjs가 더한다.
 *
 * 문제 하나 = { level, code, message }. 규칙 이름(code)은 아래 BOOK_RULES와 같다. 문장은 쪽을 옮겨 쓰는 선생님이 읽으므로
 * 무엇을 어떻게 고치는지 한국어로 적는다. 순수 함수라 파일·브라우저를 쓰지 않는다(Astro 빌드·Node 스크립트·Vitest 모두에서 돈다).
 *
 * 교과서 쪽은 8칸 차시 틀(lesson-rules.ts)을 쓰지 않는다. 출판본 차례·문장·표·코드를 그대로 싣는 곳이라 규칙은 "그대로 싣기 위한 짜임"만 본다:
 * 쪽 표지(::쪽[n])가 쪽마다 빠짐없이 있는지, 절이 학습 목표로 시작하는지, 교과서 꼭지 상자만 쓰는지, 그림 대체 글이 있는지.
 * (글자가 출판본과 같은지는 npm run book:fidelity가 원본 PDF와 맞대어 본다 — 원본은 운영자 PC에만 있다, C138.)
 */
import { BOOK_ID_PATTERN, EXAMPLE_FILE_PATTERN, type BookData } from '../../config/content-schemas.ts';
import { BOOK_BOX_VARIANTS } from '../../lib/remark-boxes.mjs';
import { childElements, findAll, hasClass, parseHtml, textContent, type HtmlElement } from '../lesson/html-tree.ts';
import { imageAltIssues, markdownTrapIssues } from '../lesson/lesson-rules.ts';
import { bookKindOf, bookPageList, lessonMatchesBook, parseBookPages, type BookKind } from './book-data.ts';

export type BookRuleLevel = 'error' | 'warning';

export interface BookRuleIssue {
  readonly level: BookRuleLevel;
  /** 규칙 이름(예: book-page-marks) */
  readonly code: string;
  readonly message: string;
}

/** 웹 차시 하나를 가리키는 데 필요한 값(짝 찾기용) */
export interface BookRuleLesson {
  readonly unit: 1 | 2 | 3 | 4;
  readonly label: string;
  readonly slug: string;
}

export interface BookRuleInput {
  /** 콘텐츠 id(파일 이름에서 .md를 뗀 것) */
  readonly id: string;
  /** frontmatter를 규칙(bookSchema)대로 읽은 값(기본값이 채워진 것) */
  readonly data: BookData;
  /** 마크다운을 바꾼 HTML(entry.rendered.html과 같은 것) */
  readonly html: string;
  /** 웹 차시 목록(짝 확인용). 주지 않으면 짝 검사를 건너뛴다 */
  readonly lessons?: readonly BookRuleLesson[];
}

/** 규칙 이름 → 한 줄 설명(문서·검사 결과 머리말에 쓴다) */
export const BOOK_RULES: Readonly<Record<string, string>> = Object.freeze({
  'book-id': '쪽 id(id)는 파일 이름과 같고 모양이 맞게',
  'book-unit': '대단원(unit)은 id와 같게 — 앞 부속(front)만 적지 않음',
  'book-part': '절은 중단원(part)을 적게',
  'book-pages': '쪽 범위(pages) 모양',
  'book-lesson': '짝 웹 차시(lesson)가 실제 차시와 이어지게',
  'book-fidelity-exceptions': '같음 검사 예외의 쪽은 쪽 범위 안에',
  'book-page-marks': '쪽 표지(::쪽[n])가 첫 쪽부터 끝 쪽까지 차례대로 빠짐없이',
  'book-goal-first': '절은 ## 학습 목표로 시작',
  'book-box': '교과서 꼭지 상자(:::말풍선 등)와 정답 접기만',
  'book-heading': '제목 모양: ## 번호 제목 · ## 기본 실습 | 제목 · ### 단계 1 | 제목',
  'book-lab': '::실습실[파일]의 예제 경로 모양',
  'img-alt': '그림 대체 글',
  'heading-h1': '본문에 # 제목(h1) 쓰지 않기',
  'md-tilde': '물결표(~) 두 개가 취소선이 되지 않게(범위는 \\~)',
  'md-bold': '굵게(**)가 글자 그대로 남지 않게',
});

/** 교과서 쪽에서 쓸 수 있는 상자: 교과서 꼭지 14종 + 정답 접기(대단원 마무리 정답) */
export const BOOK_ALLOWED_BOXES: readonly string[] = Object.freeze([...(BOOK_BOX_VARIANTS as readonly string[]), 'answer']);

function issue(level: BookRuleLevel, code: string, message: string): BookRuleIssue {
  return { level, code, message };
}

function squash(text: string): string {
  return text.normalize('NFC').replace(/\s+/gu, '');
}

/** 절 id(2-1-2)의 대단원 번호(2). 절이 아니면 undefined */
function unitOfId(id: string): number | undefined {
  const section = /^([1-4])-[1-9]-[1-9]$/u.exec(id);
  if (section) {
    return Number(section[1]);
  }
  const unit = /^u([1-4])-(?:intro|review)$/u.exec(id);
  return unit ? Number(unit[1]) : undefined;
}

/* ───────────── frontmatter ───────────── */

export function bookFrontmatterIssues(input: BookRuleInput): BookRuleIssue[] {
  const { id, data, lessons } = input;
  const issues: BookRuleIssue[] = [];
  const kind: BookKind = bookKindOf(id);

  if (!BOOK_ID_PATTERN.test(id)) {
    issues.push(issue('error', 'book-id', `파일 이름 "${id}.md"가 쪽 id 규칙에 맞지 않아요. 절은 2-1-2, 대단원 시작은 u2-intro, 마무리는 u2-review, 앞 부속은 front로 지어요.`));
  }
  if (data.id !== id) {
    issues.push(issue('error', 'book-id', `설정 칸의 id(${data.id})가 파일 이름(${id}.md)과 달라요. 같게 적어요.`));
  }

  const expectedUnit = unitOfId(id);
  if (kind === 'front') {
    if (data.unit !== undefined) {
      issues.push(issue('error', 'book-unit', '앞 부속(front)에는 대단원(unit)을 적지 않아요.'));
    }
  } else if (data.unit === undefined) {
    issues.push(issue('error', 'book-unit', `대단원(unit)을 적어요. 이 쪽은 ${expectedUnit ?? '?'}단원이에요.`));
  } else if (expectedUnit !== undefined && data.unit !== expectedUnit) {
    issues.push(issue('error', 'book-unit', `대단원(unit: ${data.unit})이 쪽 id(${id})의 단원(${expectedUnit})과 달라요.`));
  }

  if (kind === 'section' && !data.part) {
    issues.push(issue('error', 'book-part', '중단원(part)을 출판본 그대로 번호 포함해 적어요. 예: part: "01 디스플레이 장치 제어"'));
  }

  const range = parseBookPages(data.pages);
  if (!range) {
    issues.push(issue('error', 'book-pages', `쪽 범위(pages: ${data.pages})의 뒤 쪽이 앞 쪽보다 작아요. 예: "124~131"`));
  }

  if (range) {
    for (const exception of data.fidelity_exceptions) {
      if (exception.page < range.start || exception.page > range.end) {
        issues.push(issue('error', 'book-fidelity-exceptions', `같음 검사 예외의 쪽(${exception.page})이 쪽 범위(${data.pages}) 밖이에요.`));
      }
    }
  }

  if (lessons && data.unit !== undefined) {
    const paired = lessons.find((lesson) => lessonMatchesBook({ unit: data.unit, lesson: data.lesson }, lesson));
    if (data.lesson && !paired) {
      issues.push(
        issue('warning', 'book-lesson', `lesson: ${data.lesson}에 해당하는 웹 차시(${data.unit}단원)가 없어요. 짝이 없으면 lesson 칸을 지우고, 있으면 차시 번호(label)를 맞춰 적어요.`),
      );
    }
    if (!data.lesson && kind === 'section') {
      const sameLabel = lessons.find((lesson) => lesson.unit === data.unit && lesson.label.toLowerCase() === id.toLowerCase());
      if (sameLabel) {
        issues.push(issue('warning', 'book-lesson', `웹 차시 ${sameLabel.label}가 있는데 lesson 칸이 비어 있어요. lesson: ${sameLabel.label}을 적으면 두 쪽의 전환 줄이 이어져요.`));
      }
    }
  }
  return issues;
}

/* ───────────── 본문(HTML) ───────────── */

/** 쪽 표지(<p class="book-page-mark" id="p125">)의 쪽 번호들을 문서 차례대로 */
export function pageMarksOf(tree: HtmlElement): number[] {
  return findAll(tree, (element) => hasClass(element, 'book-page-mark')).flatMap((element) => {
    const match = /^p([1-9]\d{0,2})$/u.exec(element.attrs.id ?? '');
    return match ? [Number(match[1])] : [];
  });
}

function pageMarkIssues(html: string, data: BookData, tree: HtmlElement): BookRuleIssue[] {
  const expected = bookPageList(data.pages);
  if (expected.length === 0) {
    return [];
  }
  const marks = pageMarksOf(tree);
  const issues: BookRuleIssue[] = [];
  const first = expected[0] ?? 0;
  const last = expected[expected.length - 1] ?? 0;
  const seen = new Set<number>();
  const duplicated = marks.filter((page) => (seen.has(page) ? true : (seen.add(page), false)));
  const missing = expected.filter((page) => !marks.includes(page));
  const extra = [...new Set(marks.filter((page) => !expected.includes(page)))];
  if (missing.length > 0) {
    issues.push(issue('error', 'book-page-marks', `쪽 표지가 빠진 쪽이 있어요: ${missing.join(', ')}쪽. 쪽이 바뀌는 자리마다 ::쪽[번호] 한 줄을 적어요(쪽 범위 ${data.pages}).`));
  }
  if (extra.length > 0) {
    issues.push(issue('error', 'book-page-marks', `쪽 범위(${data.pages}) 밖의 쪽 표지가 있어요: ${extra.join(', ')}쪽.`));
  }
  if (duplicated.length > 0) {
    issues.push(issue('error', 'book-page-marks', `같은 쪽 표지가 두 번 있어요: ${[...new Set(duplicated)].join(', ')}쪽.`));
  }
  if (missing.length === 0 && extra.length === 0 && duplicated.length === 0 && marks.some((page, index) => page !== expected[index])) {
    issues.push(issue('error', 'book-page-marks', `쪽 표지의 차례가 어긋났어요. ${first}쪽부터 ${last}쪽까지 오름차순으로 적어요(지금: ${marks.join(', ')}).`));
  }
  // 본문은 첫 쪽의 표지로 시작해야 한다(쪽 표지 앞에 글이 있으면 그 글이 몇 쪽인지 알 수 없다 — 같음 검사가 쪽마다 나누는 기준)
  const firstElement = childElements(tree)[0];
  if (html.trim() !== '' && (!firstElement || !hasClass(firstElement, 'book-page-mark') || firstElement.attrs.id !== `p${first}`)) {
    issues.push(issue('error', 'book-page-marks', `본문은 첫 쪽의 표지(::쪽[${first}])로 시작해요. 그 앞에 글이나 상자를 두지 않아요.`));
  }
  return issues;
}

function goalIssues(kind: BookKind, tree: HtmlElement): BookRuleIssue[] {
  if (kind !== 'section') {
    return [];
  }
  const headings = findAll(tree, (element) => element.tag === 'h2');
  const first = headings[0];
  if (!first || squash(textContent(first)) !== '학습목표') {
    return [issue('error', 'book-goal-first', `절의 첫 제목(##)은 "학습 목표"예요(지금: ${first ? `"${textContent(first).trim()}"` : '## 제목이 하나도 없음'}). 출판본 절 첫 쪽의 학습 목표 칩을 ## 학습 목표로 적어요.`)];
  }
  const goals = headings.filter((element) => squash(textContent(element)) === '학습목표');
  return goals.length > 1 ? [issue('error', 'book-goal-first', '"학습 목표" 제목이 두 번 있어요. 절마다 하나예요.')] : [];
}

function boxIssues(tree: HtmlElement): BookRuleIssue[] {
  const issues: BookRuleIssue[] = [];
  const unknown = new Set<string>();
  for (const box of findAll(tree, (element) => hasClass(element, 'box'))) {
    const variant = (box.attrs['data-box'] ?? '').trim();
    if (!BOOK_ALLOWED_BOXES.includes(variant)) {
      unknown.add(variant || '(이름 없음)');
    }
  }
  if (unknown.size > 0) {
    issues.push(
      issue(
        'error',
        'book-box',
        `교과서 쪽에서 쓸 수 없는 상자가 있어요: ${[...unknown].join(', ')}. 쓸 수 있는 상자: 말풍선·해보기·용어풀이·연결레시피·에러체크·결과·점검하기·자기평가·학습활동·읽기자료·성취계획·코드설명·그림생략·웹정정, 그리고 정답 접기. 웹 차시용 상자(왜그럴까·도전·교사용 등)는 쓰지 않아요.`,
      ),
    );
  }
  return issues;
}

/** ## 번호 제목("1 장치 이해") · ## 기본 실습 | 제목 · ## 심화 실습 | 제목 · ## 학습 목표 */
const H2_PATTERNS = [/^학습 목표$/u, /^\d+ \S.*$/u, /^(?:기본|심화) 실습 \| \S.*$/u];
const H3_PATTERNS = [/^단계 \d+ \| \S.*$/u];

function headingIssues(tree: HtmlElement): BookRuleIssue[] {
  const issues: BookRuleIssue[] = [];
  const text = (element: HtmlElement) => textContent(element).normalize('NFC').replace(/\s+/gu, ' ').trim();
  for (const element of findAll(tree, (candidate) => candidate.tag === 'h1')) {
    issues.push(issue('error', 'heading-h1', `본문에 # 제목(h1)이 있어요("${text(element)}"). 쪽 제목은 frontmatter title이 맡으니 절 안의 큰 제목은 ##, 단계는 ###로 적어요.`));
  }
  for (const element of findAll(tree, (candidate) => candidate.tag === 'h2')) {
    if (!H2_PATTERNS.some((pattern) => pattern.test(text(element)))) {
      issues.push(
        issue('warning', 'book-heading', `## "${text(element)}"는 출판본 제목 모양이 아니에요. ## 학습 목표 · ## 1 장치 이해(번호 + 띄어쓰기 + 제목) · ## 기본 실습 | 제목 · ## 심화 실습 | 제목 가운데 하나로 적어요.`),
      );
    }
  }
  for (const element of findAll(tree, (candidate) => candidate.tag === 'h3')) {
    if (!H3_PATTERNS.some((pattern) => pattern.test(text(element)))) {
      issues.push(issue('warning', 'book-heading', `### "${text(element)}"는 단계 제목 모양이 아니에요. ### 단계 1 | 제목 처럼 적어요.`));
    }
  }
  return issues;
}

function labIssues(tree: HtmlElement): BookRuleIssue[] {
  const issues: BookRuleIssue[] = [];
  for (const slot of findAll(tree, (element) => hasClass(element, 'book-lab-slot'))) {
    const file = slot.attrs['data-book-lab'] ?? '';
    if (!EXAMPLE_FILE_PATTERN.test(file) || file.startsWith('examples/')) {
      issues.push(issue('error', 'book-lab', `::실습실[${file}]의 경로 모양이 맞지 않아요. examples/ 뒤의 경로를 적어요. 예: ::실습실[esp32/u2/2-1-2-lcd-count.py]`));
    }
  }
  return issues;
}

/** 쪽 본문(HTML)의 규칙 문제 */
export function bookBodyIssues(input: BookRuleInput): BookRuleIssue[] {
  const { id, data, html } = input;
  const tree = parseHtml(html);
  const trap = markdownTrapIssues(html).map((found) => issue(found.level, found.code, found.message));
  const alt = imageAltIssues(html).map((found) => issue(found.level, found.code, found.message));
  return [...pageMarkIssues(html, data, tree), ...goalIssues(bookKindOf(id), tree), ...boxIssues(tree), ...headingIssues(tree), ...labIssues(tree), ...alt, ...trap];
}

/** 쪽 한 편의 규칙 문제를 모두 돌려준다(파일을 열지 않는 규칙만). 빌드는 경고로, check:book은 error를 실패로 다룬다 */
export function checkBookRules(input: BookRuleInput): BookRuleIssue[] {
  return [...bookFrontmatterIssues(input), ...bookBodyIssues(input)];
}
