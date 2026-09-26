/**
 * 차시 틀 검사 규칙(PLAN §8.5 P5-02, SPEC §7.2, PD-35) — 한 곳에 모은 규칙을 두 곳이 함께 쓴다.
 *
 *   빌드(src/pages/learn/[unit]/[lesson].astro)     → 모든 문제를 경고로만 남긴다. 빌드는 멈추지 않는다(frontmatter 형식 오류만 Astro가 멈춘다).
 *   npm run check:lessons(scripts/check-lessons.mjs) → level이 error인 문제가 하나라도 있으면 실패한다(엄격 모드).
 *                                                      파일을 여는 검사(예제 파일·그림·눈 확인 기록·용어사전)는 scripts/lib/check-lessons.mjs가 더한다.
 *
 * 문제 하나 = { level, code, message }. code는 규칙 이름이라 MAINTENANCE.md 1-6의 표·단위 테스트(tests/unit/lesson/lesson-rules.test.ts)와 같다.
 * 규칙을 바꾸면 그 표와 테스트를 함께 고친다. 문장은 차시를 쓰는 선생님이 읽으므로 무엇을 어떻게 고치는지 한국어로 적는다.
 *
 * 순수 함수라 파일·브라우저를 쓰지 않는다(Astro 빌드·Node 스크립트·Vitest 모두에서 돈다).
 */
import type { LessonData } from '../../config/content-schemas.ts';
import { findStandard, mappedStandards } from '../../config/standards.ts';
import { findPlannedLesson, type LessonSource } from './curriculum.ts';
import {
  childElements,
  findAll,
  hasClass,
  parseHtml,
  textContent,
  type HtmlElement,
} from './html-tree.ts';
import { LESSON_SECTIONS, planLessonBody, type LessonBodyPlan, type LessonSectionKey } from './lesson-html.ts';
import { labOfExampleFile } from './lesson-data.ts';

export type LessonRuleLevel = 'error' | 'warning';

export interface LessonRuleIssue {
  readonly level: LessonRuleLevel;
  /** 규칙 이름(예: sec-missing). MAINTENANCE.md 1-6 표와 같다 */
  readonly code: string;
  readonly message: string;
}

export interface LessonRuleInput {
  /** frontmatter를 규칙(lessonSchema)대로 읽은 값(기본값이 채워진 것) */
  readonly data: LessonData;
  /** 마크다운을 바꾼 HTML(entry.rendered.html과 같은 것) */
  readonly html: string;
  /** 파일 이름(.md 뺀 것) — 차례표에서 차시를 찾을 때 */
  readonly slug: string;
  /**
   * frontmatter에 적힌 그대로의 값. 있으면 "칸을 적었는지"도 본다(예: standards를 [] 로라도 적었는지).
   * 빌드는 Astro가 기본값을 채운 값만 받으므로 넘기지 않는다.
   */
  readonly raw?: Readonly<Record<string, unknown>>;
  /** 이미 만든 본문 계획(페이지가 그리는 데 쓴 것). 없으면 여기서 만든다 */
  readonly plan?: LessonBodyPlan;
}

/** 8칸 틀을 검사하는 차시 종류(교과서·보충). 읽기 자료·대단원 마무리는 frontmatter·그림 규칙만 본다 */
export function usesLessonTemplate(kind: LessonData['kind']): boolean {
  return kind === 'textbook' || kind === 'supplement';
}

/** 차시 한 편의 최대 시간(분) — 넘으면 둘로 나눈다(PLAN §8.5) */
export const MAX_LESSON_MINUTES = 50;
/** 학습목표 최대 개수(SPEC §7.2 1번 "3개 이하") */
export const MAX_GOALS = 3;
/** 도전 과제 최대 개수(SPEC §7.2 6번 "1~2개") */
export const MAX_CHALLENGES = 2;
/** 바꿔볼 것 개수(SPEC §6.1 "바꿔볼 것 3가지") */
export const TRY_ITEMS = 3;
/** 확인 퀴즈 문항 수(SPEC §7.2 7번 "객관식 3문항") */
export const QUIZ_ITEMS = 3;
/** 그림 대체 글 최소 글자 수(원고 그림 목록 alt 규칙과 같다 — scripts/lib/lesson-images.mjs) */
export const MIN_ALT_LENGTH = 8;
/** 교사용 접기 안에 꼭 있어야 하는 ### 제목(앞부분만 맞으면 된다 — "지도안 요약(50분, …)"도 된다) */
export const TEACHER_HEADINGS = ['지도안 요약', '평가 포인트', '자주 막히는 곳'] as const;

/** 규칙 이름 → 한 줄 설명(문서·검사 결과 머리말에 쓴다) */
export const LESSON_RULES: Readonly<Record<string, string>> = Object.freeze({
  'fm-label': '차시 번호(label)',
  'fm-description': '한 줄 소개(description)',
  'fm-duration': '소요 시간(duration)과 50분 넘지 않기',
  'fm-difficulty': '난이도(difficulty)',
  'fm-pages': '교과서 쪽(pages)',
  'fm-lab': '실습실(lab)',
  'fm-examples': '따라하기 예제(examples) 1개 이상',
  'fm-virtual-ok': 'ESP32 예제가 있으면 virtual_ok',
  'fm-standards': '성취기준(standards) — 15개 코드 안, 대응표(PLAN §2.2)와 같게',
  'fm-quiz': '확인 퀴즈 3문항, 문항마다 보기 3개 이상·정답 1개·풀이',
  'fm-curriculum': '차례표(curriculum.ts)와 같은 종류·순서·제목',
  'fm-source': '원천(source)',
  'fm-parts': '배선(parts)은 ESP32 예제에만',
  'sec-missing': '8칸이 모두 있는지',
  'sec-duplicate': '같은 칸이 두 번',
  'sec-order': '8칸 순서',
  'sec-unknown': '틀에 없는 ## 제목',
  'sec-intro': '첫 ## 앞의 글',
  'body-plan': '::예제·::퀴즈 자리 표시·주소',
  'slot-place': '예제는 따라하기, 퀴즈는 확인 퀴즈 칸에',
  'goals-count': '학습목표 1~3개',
  'why-text': '왜 배울까의 문단과 그림',
  'concepts-figure': '핵심 개념의 그림(사이트가 그린 SVG 권장)',
  'box-why': '"왜 이런 결과가 나올까" 상자(따라하기·바꿔보기 칸)',
  'box-try': '"바꿔보기" 상자와 바꿔볼 것 3가지',
  'box-challenge': '도전 과제 1~2개와 힌트 접기',
  'box-genai': '생성형 AI 활용 탐구 상자는 도전 과제 칸에만',
  'teacher-box': '교사용 칸은 :::교사용 접기 안에, 지도안 요약·평가 포인트·자주 막히는 곳',
  'img-alt': '그림 대체 글',
  'heading-h1': '본문에 # 제목(h1) 쓰지 않기',
  'md-tilde': '물결표(~) 두 개가 취소선이 되지 않게(범위는 \\~)',
  'md-bold': '굵게(**)가 글자 그대로 남지 않게',
});

function issue(level: LessonRuleLevel, code: string, message: string): LessonRuleIssue {
  return { level, code, message };
}

function squash(text: string): string {
  return text.normalize('NFC').replace(/\s+/gu, '');
}

function sectionTitle(key: LessonSectionKey): string {
  return LESSON_SECTIONS.find((section) => section.key === key)?.title ?? key;
}

/** 본문 계획의 칸 하나를 나무로 읽는다(자리 표시 조각은 빼고 html 조각만) */
function sectionTree(plan: LessonBodyPlan, key: LessonSectionKey): HtmlElement | undefined {
  const section = plan.sections.find((candidate) => candidate.key === key);
  if (!section) {
    return undefined;
  }
  return parseHtml(section.parts.map((part) => (part.type === 'html' ? part.html : '')).join(''));
}

function isBox(element: HtmlElement, variant: string): boolean {
  return hasClass(element, 'box') && hasClass(element, `box--${variant}`);
}

function boxes(tree: HtmlElement | undefined, variant: string): HtmlElement[] {
  return tree ? findAll(tree, (element) => isBox(element, variant)) : [];
}

/* ───────────── frontmatter ───────────── */

function frontmatterIssues(input: LessonRuleInput): LessonRuleIssue[] {
  const { data, raw, slug } = input;
  const issues: LessonRuleIssue[] = [];
  const template = usesLessonTemplate(data.kind);
  const hasEsp32Example = data.examples.some((example) => labOfExampleFile(example.file) === 'esp32');

  if (!data.label) {
    issues.push(issue('error', 'fm-label', '차시 번호(label)를 적어요. 예: label: 1-2-1 (보충은 V1, 대단원 마무리는 I-마무리). 차례표와 같게 적어야 목록의 "준비 중" 카드 자리에 들어가요.'));
  }
  if (!data.description) {
    issues.push(issue('error', 'fm-description', '한 줄 소개(description)를 적어요. 차시 제목 아래와 목록·검색 결과에 보여요.'));
  }
  if (template && data.duration === undefined) {
    issues.push(issue('error', 'fm-duration', '소요 시간(duration)을 분으로 적어요. 예: duration: 50'));
  }
  if (template && data.duration !== undefined && data.duration > MAX_LESSON_MINUTES) {
    issues.push(
      issue('error', 'fm-duration', `소요 시간이 ${data.duration}분이에요. 한 차시는 ${MAX_LESSON_MINUTES}분 안으로 — 넘으면 차시 두 개로 나눠요(PLAN §8.5).`),
    );
  }
  if (template && data.difficulty === undefined) {
    issues.push(issue('error', 'fm-difficulty', '난이도(difficulty)를 1(쉬움)·2(보통)·3(어려움) 가운데 하나로 적어요.'));
  }
  // 교과서 차시는 늘, 읽기 자료·대단원 마무리는 차례표에 있는(원고가 있는) 것만 쪽을 적는다.
  // 차례표에 없는 새 읽기 자료(예: IV단원 프로젝트 안내 — 원고 없음)는 쪽이 없어도 된다.
  const plannedWithPages = data.label ? findPlannedLesson(data.unit, data.label, slug)?.pages !== undefined : false;
  if ((data.kind === 'textbook' || ((data.kind === 'reading' || data.kind === 'review') && plannedWithPages)) && !data.pages) {
    issues.push(issue('error', 'fm-pages', '교과서 쪽(pages)을 적어요. 예: pages: "024~032". 원고가 없는 차시는 코드 파일 이름의 쪽을 "파일명 p55·p58"처럼 적어요.'));
  }
  if (template && data.examples.length === 0) {
    issues.push(
      issue('error', 'fm-examples', '따라하기 예제(examples)를 하나 이상 적어요. 원고만 있는 차시도 카메라·보드 없이 해 보는 체험 예제를 새로 만들어요(PLAN §2.3).'),
    );
  }
  if (data.examples.length > 0 && !data.lab) {
    issues.push(issue('error', 'fm-lab', '예제가 있으면 따라하기에 쓰는 실습실(lab)을 적어요: vision, esp32, iot 가운데 하나.'));
  }
  if ((hasEsp32Example || data.lab === 'esp32' || data.lab === 'iot') && data.virtual_ok === undefined) {
    issues.push(issue('error', 'fm-virtual-ok', 'ESP32 예제가 있으면 가상 보드만으로 끝까지 되는지(virtual_ok: true)를 적어요. 차시 머리에 보여요.'));
  }
  if (data.virtual_ok === false) {
    issues.push(
      issue('warning', 'fm-virtual-ok', 'virtual_ok: false — 실물 보드가 있어야만 하는 차시예요. 절대 원칙 3(하드웨어 없어도 100%)에 맞는지 다시 확인해요.'),
    );
  }

  // 성취기준(PLAN §2.2 대응표, DECISIONS C8)
  if (raw && !Object.hasOwn(raw, 'standards')) {
    issues.push(
      issue('error', 'fm-standards', '성취기준(standards)을 적어요. 대응표(PLAN §2.2)에 코드가 없는 차시도 standards: [] 로 비워 적어요(화면은 "성취기준 코드 확인 중").'),
    );
  }
  for (const code of data.standards) {
    if (!findStandard(code)) {
      issues.push(issue('error', 'fm-standards', `성취기준 코드 ${code}는 과목 교육과정의 15개 코드(src/config/standards.ts)에 없어요. 코드를 지어내지 않아요(DECISIONS C8).`));
    }
  }
  if (data.label) {
    const mapped = mappedStandards(data.label);
    if (mapped === undefined) {
      if (template || data.standards.length > 0) {
        issues.push(
          issue('warning', 'fm-standards', `차시 ${data.label}은(는) 성취기준 대응표(PLAN §2.2, src/config/standards.ts)에 없어요. 새 차시라면 이대로 둬도 되고, 성취기준 대응을 붙이려면 대응표에 이 차시를 더해요(지금 적은 값: ${data.standards.length > 0 ? data.standards.join(', ') : '빈 값'}).`),
        );
      }
    } else {
      const expected = [...mapped].sort().join(', ');
      const actual = [...data.standards].sort().join(', ');
      if (expected !== actual) {
        issues.push(
          issue('error', 'fm-standards', `성취기준을 대응표(PLAN §2.2)와 같게 적어요. 차시 ${data.label}: standards: [${mapped.map((code) => `"${code}"`).join(', ')}] (지금 값: [${data.standards.join(', ')}]). 대응을 바꿔야 하면 대응표를 고치자는 요청을 남겨요.`),
        );
      }
    }
  }

  // 확인 퀴즈(SPEC §7.2 7번)
  if (template && data.quiz.length !== QUIZ_ITEMS) {
    issues.push(issue('error', 'fm-quiz', `확인 퀴즈는 객관식 ${QUIZ_ITEMS}문항이에요(지금 ${data.quiz.length}문항).`));
  }
  data.quiz.forEach((item, index) => {
    const where = `퀴즈 ${index + 1}번`;
    if (!item.explain) {
      issues.push(issue('error', 'fm-quiz', `${where}: 풀이(explain)를 적어요. 답을 확인하면 바로 보여 주는 설명이에요.`));
    }
    if (item.choices.length < 3) {
      issues.push(issue('error', 'fm-quiz', `${where}: 보기(choices)를 3개 이상 적어요(객관식).`));
    }
    const seen = new Set<string>();
    for (const choice of item.choices) {
      const key = squash(choice);
      if (seen.has(key)) {
        issues.push(issue('error', 'fm-quiz', `${where}: 같은 보기 "${choice}"가 두 번 있어요. 정답이 하나로 정해지게 보기를 모두 다르게 적어요.`));
      }
      seen.add(key);
    }
  });
  if (template && data.quiz.length >= 2 && new Set(data.quiz.map((item) => item.answer)).size === 1) {
    issues.push(issue('warning', 'fm-quiz', `모든 문항의 정답이 ${data.quiz[0]?.answer === undefined ? '' : `${data.quiz[0].answer + 1}번째 `}보기예요. 정답 자리를 섞어요.`));
  }

  // 배선은 ESP32 예제에만
  for (const example of data.examples) {
    if (example.parts.length > 0 && labOfExampleFile(example.file) !== 'esp32') {
      issues.push(issue('warning', 'fm-parts', `examples의 ${example.file}에 배선(parts)을 적었어요. 배선은 ESP32 예제(esp32/…)에만 쓰여요.`));
    }
  }

  // 차례표(PLAN §2.2)와 맞는지
  if (data.label) {
    const planned = findPlannedLesson(data.unit, data.label, slug);
    if (planned) {
      if (planned.kind !== data.kind) {
        issues.push(issue('error', 'fm-curriculum', `차례표에서 ${planned.label}은(는) kind: ${planned.kind}예요(지금 ${data.kind}). 종류를 맞춰요.`));
      }
      if (planned.order !== data.order) {
        issues.push(issue('warning', 'fm-curriculum', `차례표의 순서(order)는 ${planned.order}예요(지금 ${data.order}). 다르면 목록·앞뒤 쪽 순서가 차례표와 달라져요.`));
      }
      if (squash(planned.title) !== squash(data.title)) {
        issues.push(issue('warning', 'fm-curriculum', `제목이 차례표("${planned.title}")와 달라요(지금 "${data.title}"). 바꾼 까닭이 없으면 맞춰요.`));
      }
      if (data.source && data.source !== planned.source) {
        issues.push(issue('warning', 'fm-source', `원천(source)이 차례표(${planned.source})와 달라요. 차례표에 있는 차시는 source를 적지 않아도 돼요.`));
      }
    } else if (data.kind === 'textbook' && !data.source) {
      issues.push(
        issue('warning', 'fm-source', '차례표에 없는 교과서 차시예요. 원천(source: manuscript-code·manuscript·code-only)을 적으면 교사용 접기에 "원고 없음" 같은 표시가 맞게 붙어요.'),
      );
    }
  }
  return issues;
}

/* ───────────── 본문 틀(8칸) ───────────── */

function structureIssues(plan: LessonBodyPlan): LessonRuleIssue[] {
  const issues: LessonRuleIssue[] = [];
  const keyed = plan.sections.filter((section) => section.key !== undefined && !section.generated);

  const present = new Set(keyed.map((section) => section.key));
  for (const section of LESSON_SECTIONS) {
    if (!present.has(section.key)) {
      issues.push(issue('error', 'sec-missing', `"${section.title}" 칸(## ${section.title})이 없어요. 차시 틀 8칸: ${LESSON_SECTIONS.map((item) => item.title).join(' → ')}`));
    }
  }
  const keys = keyed.map((section) => section.key as LessonSectionKey);
  const repeated = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
  for (const key of repeated) {
    issues.push(issue('error', 'sec-duplicate', `"${sectionTitle(key)}" 칸이 두 번 있어요. 하나로 합치고, 칸 안을 나눌 때는 ### 제목을 써요.`));
  }
  const order = keys.map((key) => LESSON_SECTIONS.findIndex((section) => section.key === key));
  if (order.some((value, position) => position > 0 && value < (order[position - 1] ?? value))) {
    issues.push(issue('error', 'sec-order', `칸 순서가 틀과 달라요. 순서: ${LESSON_SECTIONS.map((section) => section.title).join(' → ')}`));
  }
  for (const section of plan.sections.filter((candidate) => candidate.key === undefined)) {
    issues.push(
      issue('error', 'sec-unknown', `"## ${section.title}"은(는) 차시 틀에 없는 칸이에요. ### ${section.title}로 바꿔 알맞은 칸 안에 넣어요(예: "다음은 무엇을 배울까"는 도전 과제 칸 끝의 ###).`),
    );
  }
  if (plan.intro.some((part) => part.type === 'slot' || (part.type === 'html' && part.html.replace(/<[^>]*>/gu, '').trim() !== ''))) {
    issues.push(issue('warning', 'sec-intro', '첫 ## 제목(학습목표) 앞에 글이 있어요. 학습목표 칸부터 시작해요(차시 소개는 frontmatter description에).'));
  }
  for (const warning of plan.warnings) {
    issues.push(issue('error', 'body-plan', warning));
  }
  for (const section of plan.sections) {
    for (const part of section.parts) {
      if (part.type === 'slot' && part.slot === 'examples' && section.key !== 'follow' && !section.generated) {
        issues.push(issue('error', 'slot-place', `::예제 자리 표시는 따라하기 칸에 적어요(지금 "${section.title}" 칸).`));
      }
      if (part.type === 'slot' && part.slot === 'quiz' && section.key !== 'quiz' && !section.generated) {
        issues.push(issue('error', 'slot-place', `::퀴즈 자리 표시는 확인 퀴즈 칸에 적어요(지금 "${section.title}" 칸).`));
      }
    }
  }
  return issues;
}

function contentIssues(plan: LessonBodyPlan, data: LessonData): LessonRuleIssue[] {
  const issues: LessonRuleIssue[] = [];

  const goals = sectionTree(plan, 'goals');
  if (goals) {
    const list = childElements(goals).find((element) => element.tag === 'ul' || element.tag === 'ol');
    const count = list ? childElements(list).filter((element) => element.tag === 'li').length : 0;
    if (count === 0 || count > MAX_GOALS) {
      issues.push(issue('error', 'goals-count', `학습목표는 목록(- …)으로 1~${MAX_GOALS}개 적어요(지금 ${count}개). "~할 수 있어요"로 끝내요.`));
    }
  }

  const why = sectionTree(plan, 'why');
  if (why) {
    if (!childElements(why).some((element) => element.tag === 'p' && textContent(element) !== '' && findAll(element, (inner) => inner.tag === 'img').length === 0)) {
      issues.push(issue('error', 'why-text', '"왜 배울까" 칸에 까닭을 설명하는 문단을 적어요(SPEC §7.2 2번: 1문단 + 그림).'));
    }
    if (findAll(why, (element) => element.tag === 'img' || element.tag === 'svg').length === 0) {
      issues.push(issue('warning', 'why-text', '"왜 배울까" 칸에 그림을 하나 넣으면 좋아요(SPEC §7.2 2번: 1문단 + 그림).'));
    }
  }

  const concepts = sectionTree(plan, 'concepts');
  if (concepts) {
    const images = findAll(concepts, (element) => element.tag === 'img' || element.tag === 'svg');
    if (images.length === 0) {
      issues.push(issue('error', 'concepts-figure', '"핵심 개념" 칸에 그림을 하나 이상 넣어요(SPEC §7.1: 모든 핵심 개념에 사이트가 그린 SVG 그림 1개 이상).'));
    } else if (!images.some((element) => element.tag === 'svg' || /\.svg(?:[?#]|$)/iu.test(element.attrs.src ?? ''))) {
      issues.push(issue('warning', 'concepts-figure', '"핵심 개념" 칸의 그림이 모두 원고 그림이에요. 개념 하나는 사이트가 그린 SVG로 보여 주면 좋아요(SPEC §7.1, INVENTORY §5.3 S-번호).'));
    }
  }

  const follow = sectionTree(plan, 'follow');
  const tryTree = sectionTree(plan, 'try');
  const whyBoxes = [...boxes(follow, 'why'), ...boxes(tryTree, 'why')];
  if (whyBoxes.length === 0) {
    issues.push(issue('error', 'box-why', '따라하기(또는 바꿔보기) 칸에 :::왜그럴까 상자("왜 이런 결과가 나올까")를 넣어요(SPEC §6.1).'));
  } else if (whyBoxes.length < data.examples.length) {
    issues.push(
      issue('warning', 'box-why', `예제가 ${data.examples.length}개인데 "왜 이런 결과가 나올까" 상자는 ${whyBoxes.length}개예요. 예제마다 하나씩 두면 좋아요(SPEC §6.1).`),
    );
  }

  if (tryTree) {
    const tryBoxes = boxes(tryTree, 'try');
    if (tryBoxes.length === 0) {
      issues.push(issue('error', 'box-try', '바꿔보기 칸에 :::바꿔보기 상자를 넣고 바꿔 볼 것을 번호 목록 3가지로 적어요(SPEC §6.1).'));
    }
    for (const box of tryBoxes) {
      const items = findAll(box, (element) => element.tag === 'li').length;
      if (items < TRY_ITEMS) {
        issues.push(issue('error', 'box-try', `바꿔보기 상자에 바꿔 볼 것이 ${items}가지예요. 번호 목록(1. 2. 3.)으로 ${TRY_ITEMS}가지를 적어요.`));
      }
    }
  }

  const challenge = sectionTree(plan, 'challenge');
  if (challenge) {
    const challenges = boxes(challenge, 'challenge');
    if (challenges.length === 0 || challenges.length > MAX_CHALLENGES) {
      issues.push(issue('error', 'box-challenge', `도전 과제는 ::::도전 상자로 1~${MAX_CHALLENGES}개 적어요(지금 ${challenges.length}개, SPEC §7.2 6번).`));
    }
    for (const box of challenges) {
      if (boxes(box, 'hint').length === 0) {
        const title = childElements(box).find((element) => hasClass(element, 'box__title'));
        issues.push(
          issue('error', 'box-challenge', `도전 과제 "${title ? textContent(title) : '(제목 없음)'}"에 :::힌트 접기를 넣어요. 바깥 상자는 콜론 4개(::::도전)로 열고 닫아요.`),
        );
      }
    }
  }

  // 칸 나무와 본문 전체 나무는 따로 읽었으므로 개수로 견준다(전체보다 도전 과제 칸 안이 적으면 다른 칸에 있다).
  const all = parseHtml(
    [...plan.intro, ...plan.sections.flatMap((section) => section.parts)].map((part) => (part.type === 'html' ? part.html : '')).join(''),
  );
  const genaiTotal = findAll(all, (element) => isBox(element, 'genai')).length;
  if (genaiTotal > boxes(challenge, 'genai').length) {
    issues.push(
      issue('error', 'box-genai', ':::생성형AI 상자(원고의 생성형 AI 활용 탐구 과제)는 도전 과제 칸에만 둬요(PLAN §8.5 P5-02 원고 요소 배치 규칙).'),
    );
  }

  const teacher = sectionTree(plan, 'teacher');
  if (teacher) {
    const outside = teacher.children.filter((node) => {
      if (node.type === 'text') {
        return node.text.trim() !== '';
      }
      return node.tag !== 'h2' && !isBox(node, 'teacher');
    });
    const teacherBoxes = childElements(teacher).filter((element) => isBox(element, 'teacher'));
    if (teacherBoxes.length === 0) {
      issues.push(issue('error', 'teacher-box', '교사용 칸의 내용은 :::교사용 접기 상자 안에 적어요(학생 화면에서는 접혀 보여요).'));
    } else if (outside.length > 0) {
      issues.push(issue('error', 'teacher-box', '교사용 칸에 :::교사용 상자 밖의 글이 있어요. 모두 상자 안으로 옮겨요.'));
    }
    const headings = teacherBoxes.flatMap((box) => findAll(box, (element) => element.tag === 'h3').map((element) => squash(textContent(element))));
    for (const required of TEACHER_HEADINGS) {
      if (teacherBoxes.length > 0 && !headings.some((heading) => heading.startsWith(squash(required)))) {
        issues.push(issue('error', 'teacher-box', `교사용 접기에 "### ${required}"을(를) 적어요(SPEC §7.2 8번: 지도안 요약·평가 포인트·자주 막히는 곳).`));
      }
    }
  }
  return issues;
}

/* ───────────── 그림·제목(모든 종류) ───────────── */

const GENERIC_ALT = new Set(['그림', '사진', '이미지', '도표', '그래프', 'image', 'img', 'picture', 'photo', 'figure']);

/** 본문 전체의 <img>를 찾아 대체 글 문제를 돌려준다 */
export function imageAltIssues(html: string): LessonRuleIssue[] {
  const issues: LessonRuleIssue[] = [];
  const tree = parseHtml(html);
  for (const image of findAll(tree, (element) => element.tag === 'img')) {
    const src = image.attrs.src ?? '(주소 없음)';
    if (!Object.hasOwn(image.attrs, 'alt')) {
      issues.push(issue('error', 'img-alt', `그림 ${src}에 대체 글(alt)이 없어요. 무엇이 보이고 무슨 뜻인지 한 문장으로 적어요(장식 그림이면 빈 alt: ![](…)).`));
      continue;
    }
    const alt = (image.attrs.alt ?? '').trim();
    if (alt === '') {
      continue; // 장식 그림(빈 alt)은 허용
    }
    if (GENERIC_ALT.has(alt.toLowerCase()) || /\.(?:png|jpe?g|gif|webp|svg|avif)$/iu.test(alt)) {
      issues.push(issue('error', 'img-alt', `그림 ${src}의 대체 글 "${alt}"는 뜻을 전하지 못해요. 무엇이 보이고 무슨 뜻인지 한 문장으로 적어요.`));
    } else if ([...alt].length < MIN_ALT_LENGTH) {
      issues.push(issue('error', 'img-alt', `그림 ${src}의 대체 글 "${alt}"가 너무 짧아요(${MIN_ALT_LENGTH}자 이상). 무엇이 보이고 무슨 뜻인지 한 문장으로 적어요.`));
    }
  }
  return issues;
}

function headingIssues(html: string): LessonRuleIssue[] {
  const tree = parseHtml(html);
  return findAll(tree, (element) => element.tag === 'h1').length > 0
    ? [issue('error', 'heading-h1', '본문에 # 제목(h1)이 있어요. 차시 제목은 frontmatter title이 맡으니 칸은 ##, 칸 안은 ###로 적어요.')]
    : [];
}

/** 글자로 읽히는 곳(코드·수식 밖)의 글 조각. 코드 안의 ~·**는 글자 그대로가 맞으므로 보지 않는다 */
const CODE_TAGS = new Set(['code', 'pre', 'kbd', 'samp', 'script', 'style']);
function proseTexts(node: HtmlElement): string[] {
  const texts: string[] = [];
  const walk = (current: HtmlElement) => {
    for (const child of current.children) {
      if (child.type === 'text') {
        texts.push(child.text);
      } else if (!CODE_TAGS.has(child.tag)) {
        walk(child);
      }
    }
  };
  walk(node);
  return texts;
}

/**
 * 마크다운 함정(Phase 5 구역들이 여러 번 겪은 것):
 * - md-tilde(오류): GFM은 물결표 하나(~글~)도 취소선으로 읽어서, 한 문단·목록 한 줄·표 한 칸에 "0~100", "1~22행"처럼 범위 물결표가
 *   두 번 나오면 그 사이가 <del>이 된다. 일부러 취소선을 쓰는 차시는 없다 → 범위 물결표는 \~로 적는다(화면에는 ~로 보임).
 * - md-bold(경고): **[단추 이름]**를처럼 문장 부호 뒤에서 **를 닫고 바로 한글을 붙이면(CommonMark 규칙) 굵게가 되지 않고 **가 글자로 남는다
 *   → <strong>[…]</strong>로 쓰거나 **를 글자 뒤로 옮긴다.
 */
function markdownTrapIssues(html: string): LessonRuleIssue[] {
  const tree = parseHtml(html);
  const issues: LessonRuleIssue[] = [];
  const strikes = findAll(tree, (element) => element.tag === 'del' || element.tag === 's');
  if (strikes.length > 0) {
    const sample = strikes
      .slice(0, 3)
      .map((element) => `"${textContent(element).slice(0, 24)}"`)
      .join(', ');
    issues.push(
      issue(
        'error',
        'md-tilde',
        `물결표(~) 두 개 사이의 글이 취소선이 된 곳이 ${strikes.length}곳 있어요(${sample}). 한 문단·목록 한 줄·표 한 칸에 범위 물결표를 두 번 쓰면 생겨요. 범위의 물결표는 \\~로 적어요(화면에는 ~로 보여요).`,
      ),
    );
  }
  const leftovers = proseTexts(tree).filter((text) => text.includes('**'));
  if (leftovers.length > 0) {
    issues.push(
      issue(
        'warning',
        'md-bold',
        `굵게 표시(**)가 글자 그대로 남은 곳이 ${leftovers.length}곳 있어요(예: "${(leftovers[0] ?? '').trim().slice(0, 30)}"). 문장 부호 뒤에서 **를 닫고 바로 글자를 붙이면 굵게가 되지 않아요 — <strong>…</strong>로 쓰거나 **를 옮겨요.`,
      ),
    );
  }
  return issues;
}

/* ───────────── 모으기 ───────────── */

/**
 * 차시 한 편의 규칙 문제를 모두 돌려준다(파일을 열지 않는 규칙만).
 * 빌드는 모두 경고로, check:lessons는 error를 실패로 다룬다.
 */
export function checkLessonRules(input: LessonRuleInput): LessonRuleIssue[] {
  const { data, html } = input;
  const plan =
    input.plan ??
    planLessonBody(html, {
      exampleCount: data.examples.length,
      quizCount: data.quiz.length,
      checkTemplate: false,
    });
  const issues: LessonRuleIssue[] = [...frontmatterIssues(input)];
  if (usesLessonTemplate(data.kind)) {
    issues.push(...structureIssues(plan), ...contentIssues(plan, data));
  } else {
    issues.push(...plan.warnings.map((warning) => issue('error', 'body-plan', warning)));
  }
  issues.push(...imageAltIssues(html), ...headingIssues(html), ...markdownTrapIssues(html));
  return issues;
}

/** 원천(PLAN §2.2) — 차례표가 먼저, 없으면 frontmatter source, 그것도 없으면 종류로 짐작(보충 → supplement) */
export function lessonSource(data: Pick<LessonData, 'unit' | 'label' | 'kind' | 'source'>, slug: string): LessonSource | undefined {
  const planned = data.label ? findPlannedLesson(data.unit, data.label, slug) : undefined;
  return planned?.source ?? data.source ?? (data.kind === 'supplement' ? 'supplement' : undefined);
}
