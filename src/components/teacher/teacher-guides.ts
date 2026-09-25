/**
 * 교사용 자료실(PLAN §8.5 P5-14) — 차시 md의 교사용 접기를 빌드 때 모으는 순수 함수.
 *
 * 차시마다 손으로 옮겨 적지 않는다. 새 차시 md를 넣으면 코드 수정 없이 모음에 따라 들어온다(SPEC 원칙 6).
 * 차시 본문 HTML(entry.rendered.html)에서 "## 교사용" 칸의 :::교사용 상자 안을 꺼내 ### 제목마다 나눈다.
 *
 * 모음 페이지 한 쪽에 여러 차시를 모으므로 두 가지를 바꾼다.
 * - id: 차시마다 같은 제목("평가 포인트")이 되풀이되니 id 앞에 차시 앞머리를 붙인다(한 쪽 안에서 id가 겹치지 않게).
 * - #링크: 꺼낸 글 안을 가리키면 새 id로, 그 밖(차시 페이지의 다른 칸, 예: #도전-과제)을 가리키면 차시 주소#위치로 바꾼다.
 *   그래야 링크 검사(npm run check:links)의 #위치 확인을 통과하고 눌렀을 때 맞는 곳으로 간다.
 *
 * 쓰는 곳: src/pages/teacher/guides/[unit].astro(차시별 지도 요약), src/pages/teacher/corrections/index.astro(원고에서 바꾼 곳 모음),
 * src/pages/teacher/standards/index.astro(생성형 AI 활용 탐구 과제 모음). 테스트: tests/unit/teacher/teacher-guides.test.ts(순수 함수 묶음, Vitest).
 * 차시 틀 쪽 함수(lesson-html.ts·html-tree.ts)는 읽기만 한다 — 고치지 않는다(구역 규약, src/lab/README.md 5.4).
 */
import { addLazyImageLoading, decodeHtmlEntities, findMatches, rewriteRootRelativeUrls, splitHtmlSections } from '../lesson/lesson-html.ts';
import { findAll, hasClass, parseHtml, textContent, type HtmlElement } from '../lesson/html-tree.ts';

/** 교사용 접기 안의 ### 한 부분 */
export interface TeacherGuideSection {
  /** 모음 페이지에서 쓰는 id(앞머리를 붙인 것). 제목에 id가 없으면 빈 글 */
  readonly id: string;
  /** 차시 페이지에서의 원래 id(차시 주소#위치에 쓴다). 없으면 undefined */
  readonly sourceId?: string;
  /** ### 제목 글자 */
  readonly title: string;
  /** <h3>부터 다음 <h3> 앞까지(제목 포함) */
  readonly html: string;
}

export interface TeacherGuide {
  /** 교사용 상자 안 전체(제목 줄 summary는 뺌, id·#링크는 바꾼 것) */
  readonly html: string;
  /** 첫 ### 앞의 글(없으면 빈 글) */
  readonly intro: string;
  readonly sections: readonly TeacherGuideSection[];
}

export interface TeacherGuideOptions {
  /** id 앞머리(영문 소문자·숫자·하이픈). 예: 'guide-1-1-1-' */
  readonly idPrefix: string;
  /** 차시 페이지 링크(base 포함, /로 끝남). 꺼낸 글 밖을 가리키는 #링크를 이 주소로 보낸다 */
  readonly lessonHref: string;
}

/** 안에 다른 글을 품는 태그 — lesson-html.ts의 NESTING_TAG와 같은 목록(짝 맞는 닫는 태그를 찾을 때 쓴다) */
const NESTING_TAG = /<(\/?)(div|details|section|article|aside|blockquote|figure|nav|ul|ol|table|pre)\b[^>]*>/giu;

/** 교사용 상자 여는 태그(class에 box--teacher) */
const TEACHER_BOX_OPEN = /<details\b[^>]*\bclass="(?:[^"]*\s)?box--teacher(?:\s[^"]*)?"[^>]*>/iu;

/** html의 openIndex에 있는 여는 태그와 짝이 맞는 닫는 태그의 시작 위치. 못 찾으면 -1 */
export function matchingCloseIndex(html: string, openIndex: number): number {
  let depth = 0;
  for (const tag of html.slice(openIndex).matchAll(new RegExp(NESTING_TAG.source, 'giu'))) {
    depth += tag[1] === '/' ? -1 : 1;
    if (depth === 0) {
      return openIndex + (tag.index ?? 0);
    }
  }
  return -1;
}

/** 차시 본문 HTML에서 "## 교사용" 칸의 :::교사용 상자 안 HTML들(summary 뺌). 칸이나 상자가 없으면 빈 목록 */
export function teacherBoxBodies(lessonHtml: string): string[] {
  const { sections } = splitHtmlSections(lessonHtml);
  const bodies: string[] = [];
  for (const section of sections.filter((candidate) => candidate.key === 'teacher')) {
    for (const open of findMatches(section.html, TEACHER_BOX_OPEN).filter((match) => match.topLevel)) {
      const close = matchingCloseIndex(section.html, open.index);
      if (close < 0) {
        continue;
      }
      const inner = section.html.slice(open.index + open.text.length, close);
      bodies.push(inner.replace(/^\s*<summary\b[^>]*>[\s\S]*?<\/summary>/iu, ''));
    }
  }
  return bodies;
}

function escapeAttribute(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;');
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 꺼낸 글의 id에 앞머리를 붙이고, #링크를 새 id나 차시 주소#위치로 바꾼다.
 * aria-labelledby·aria-describedby·aria-controls·for가 가리키는 id도 함께 바꾼다.
 */
export function relocateFragment(html: string, options: TeacherGuideOptions): string {
  const ids = new Set<string>();
  for (const match of html.matchAll(/\sid="([^"]*)"/giu)) {
    ids.add(decodeHtmlEntities(match[1] ?? ''));
  }
  const withIds = html.replace(
    /(\s(?:id|for|aria-labelledby|aria-describedby|aria-controls)=")([^"]*)"/giu,
    (_whole: string, prefix: string, value: string) => {
      const replaced = decodeHtmlEntities(value)
        .split(/\s+/u)
        .filter(Boolean)
        .map((token) => (ids.has(token) ? `${options.idPrefix}${token}` : token))
        .join(' ');
      return `${prefix}${escapeAttribute(replaced)}"`;
    },
  );
  return withIds.replace(/(\shref=")#([^"]*)"/giu, (_whole: string, prefix: string, rawTarget: string) => {
    const target = safeDecodeUri(decodeHtmlEntities(rawTarget));
    if (target !== '' && ids.has(target)) {
      return `${prefix}#${escapeAttribute(options.idPrefix)}${rawTarget}"`;
    }
    return `${prefix}${escapeAttribute(options.lessonHref)}${rawTarget === '' ? '' : `#${rawTarget}`}"`;
  });
}

/**
 * 차시 페이지 기준 상대 주소(href·src가 main.py, ../1-1-1/처럼 /·#·scheme 없이 시작)를 차시 주소 기준 절대 경로로 바꾼다.
 * 모음 페이지는 주소가 달라서 그대로 두면 다른 곳을 가리킨다 — 바꾸면 차시 페이지와 같은 곳을 가리킨다(깨진 링크면 둘 다 링크 검사에 걸린다).
 */
export function resolveRelativeUrls(html: string, lessonHref: string): string {
  return html.replace(/(\s(?:href|src)=")(?![a-z][a-z\d+.-]*:|\/|#)([^"]+)"/giu, (_whole: string, prefix: string, raw: string) => {
    const resolved = new URL(decodeHtmlEntities(raw), `https://lesson.invalid${lessonHref}`);
    return `${prefix}${escapeAttribute(`${resolved.pathname}${resolved.search}${resolved.hash}`)}"`;
  });
}

/** 맨 위 단계의 <h3>마다 나눈다. 첫 <h3> 앞은 intro */
export function splitGuideSections(html: string): { intro: string; sections: TeacherGuideSection[] } {
  const starts = findMatches(html, /<h3\b[^>]*>/iu)
    .filter((match) => match.topLevel)
    .map((match) => match.index);
  if (starts.length === 0) {
    return { intro: html, sections: [] };
  }
  const sections = starts.map((start, position) => {
    const chunk = html.slice(start, starts[position + 1] ?? html.length);
    const open = /^<h3\b([^>]*)>/iu.exec(chunk);
    const closeIndex = chunk.search(/<\/h3>/iu);
    const inner = open && closeIndex >= 0 ? chunk.slice(open[0].length, closeIndex) : '';
    const title = decodeHtmlEntities(inner.replace(/<[^>]*>/gu, ''))
      .replace(/\s+/gu, ' ')
      .trim();
    const id = decodeHtmlEntities(/\sid="([^"]*)"/iu.exec(open?.[1] ?? '')?.[1] ?? '');
    return { id, title, html: chunk };
  });
  return { intro: html.slice(0, starts[0]), sections };
}

/**
 * 차시 본문 HTML(entry.rendered.html)에서 교사용 접기를 꺼낸다. 교사용 칸이나 :::교사용 상자가 없으면 undefined.
 * 사이트 뿌리 주소(/images/…, /learn/…)에는 base를 붙이고, 그림은 늦게 받게 한다(차시 페이지와 같은 처리 — lesson-html.ts).
 */
export function extractTeacherGuide(lessonHtml: string, options: TeacherGuideOptions): TeacherGuide | undefined {
  const bodies = teacherBoxBodies(lessonHtml);
  if (bodies.length === 0) {
    return undefined;
  }
  const original = bodies.join('\n');
  const prepared = resolveRelativeUrls(rewriteRootRelativeUrls(addLazyImageLoading(original)).html, options.lessonHref);
  const relocated = relocateFragment(prepared, options);
  const { intro, sections } = splitGuideSections(relocated);
  const originalSections = splitGuideSections(original).sections;
  return {
    html: relocated,
    intro,
    sections: sections.map((section, index) => ({
      ...section,
      sourceId: originalSections[index]?.id || undefined,
    })),
  };
}

/**
 * 원고·자료와 달라진 점이나 본문을 쓴 근거를 적은 부분인지(원고 정정 목록의 차시별 모음과 지도 요약 바로 가기가 쓴다).
 * 2026-09-25 모든 차시의 교사용 제목을 모아 정한 규칙 — 제목에 다음 낱말이 들어가면 그렇다고 본다.
 * - "바꾼 곳": 원고에서 바꾼 곳 · 수업 슬라이드에서 바꾼 곳 · 본문을 쓴 근거와 바꾼 곳(IV단원)
 * - "코드 파일": 원고가 없는 I단원 03·04의 원고와 코드 파일 · 코드 파일과 사이트판 · 선택 차시 운영과 코드 파일
 * - "쓴 근거": IV단원 프로젝트 읽기 자료의 이 안내를 쓴 근거
 */
export function isChangeSection(title: string): boolean {
  return /바꾼\s*곳|코드\s*파일|쓴\s*근거/u.test(title);
}

/** 교사용 접기의 필수 세 부분(lesson-rules.ts TEACHER_HEADINGS와 같은 이름)을 찾을 때 쓰는 정규화 */
export function squashTitle(title: string): string {
  return title.normalize('NFC').replace(/\s+/gu, '');
}

/** 차시 본문의 생성형 AI 활용 탐구 상자 한 개 */
export interface GenAiTask {
  /** 상자 제목(기본 제목이면 "생성형 AI 활용 탐구") */
  readonly title: string;
  /** 상자 안 글(제목과 끝 안내 문장을 뺀 것, 한 줄로) */
  readonly text: string;
  /** 상자 바로 앞 제목(h2·h3)의 차시 페이지 id — 차시 주소#위치로 이 상자 근처에 가려고 쓴다. 앞에 제목이 없으면 undefined */
  readonly anchor?: string;
}

function isElement(node: { type: string }): node is HtmlElement {
  return node.type === 'element';
}

/** :::생성형AI 상자의 여는 태그(class에 box--genai) — 문서 차례대로 찾아 가장 가까운 앞 제목을 고른다 */
const GENAI_BOX_OPEN = /<div\b[^>]*\bclass="(?:[^"]*\s)?box--genai(?:\s[^"]*)?"[^>]*>/giu;

/** html에서 at 위치 앞의 마지막 제목(h2·h3) id. 없으면 undefined */
export function headingIdBefore(html: string, at: number): string | undefined {
  let found = '';
  for (const match of html.slice(0, at).matchAll(/<h[23]\b[^>]*\sid="([^"]*)"/giu)) {
    found = decodeHtmlEntities(match[1] ?? '');
  }
  return found || undefined;
}

/**
 * 차시 본문 HTML에서 :::생성형AI 상자들을 찾는다(remark-boxes.mjs가 만드는 div.box.box--genai).
 * 도전 과제 칸이 아닌 곳(IV단원 프로젝트 읽기 자료의 단계별 안내 등)에 있어도 anchor가 그 상자 앞 제목을 가리킨다.
 */
export function genAiTasks(lessonHtml: string): GenAiTask[] {
  const tree = parseHtml(lessonHtml);
  const openings = [...lessonHtml.matchAll(GENAI_BOX_OPEN)].map((match) => match.index ?? 0);
  return findAll(tree, (element) => element.tag === 'div' && hasClass(element, 'box--genai')).map((box, index) => {
    const children = box.children.filter(isElement);
    const titleElement = children.find((child) => hasClass(child, 'box__title'));
    const body = children.filter((child) => !hasClass(child, 'box__title') && !hasClass(child, 'box__note'));
    const at = openings[index];
    return {
      title: titleElement ? textContent(titleElement) : '생성형 AI 활용 탐구',
      text: body.map((child) => textContent(child)).join(' ').trim(),
      ...(at === undefined ? {} : { anchor: headingIdBefore(lessonHtml, at) }),
    };
  });
}

/**
 * 모음 페이지 id 앞머리 — 대단원 번호와 주소 끝 이름(slug)으로 만든다(영문 소문자·숫자·하이픈).
 * 예: (1, '1-1-1') → 'guide-u1-1-1-1-', (2, 'review') → 'guide-u2-review-'(대단원 마무리는 slug가 모두 review라 대단원 번호가 필요하다)
 */
export function guideIdPrefix(unit: number, slug: string): string {
  return `guide-u${unit}-${slug.toLowerCase().replace(/[^a-z\d-]/gu, '-')}-`;
}
