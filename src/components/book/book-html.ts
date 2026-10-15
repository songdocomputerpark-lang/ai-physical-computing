/**
 * 교과서 쪽 본문 HTML(마크다운을 바꾼 결과)을 화면에 그릴 칸으로 나눈다(판 1.4.0 — DECISIONS C131). 순수 함수라 Vitest로 검사한다.
 *
 * 웹 차시(lesson-html.ts의 planLessonBody)와 같은 마무리 손질(그림 크게 보기·표 머리·링크 줄·그림 지연 받기·base 붙이기)을 거친 뒤,
 * 맨 위 단계의 ## 제목마다 칸(section)을 나눈다. 칸의 모양(LessonBodyPlan)은 웹 차시와 같아서 LessonBody.astro가 그대로 그리고,
 * 발표 모드(present.ts)도 같은 칸 구조(section.lesson-section)를 읽는다. 8칸 틀·퀴즈·교사용은 없다.
 *
 * 마크다운 약속(자세히는 src/lib/remark-boxes.mjs 머리말, 기준 쪽 content/book/2-1-2.md)
 * - ::쪽[125]  → <p class="book-page-mark" id="p125"> (remark가 만든다 — 여기서는 건드리지 않는다)
 * - ::실습실[esp32/u2/2-1-2-lcd-count.py] → remark가 만든 자리 표시(<div class="book-lab-slot" data-book-lab="파일">)를
 *   예제 자리(slot examples)로 바꾼다. 화면은 LessonExamples.astro의 "누를 때만 iframe" 부품을 launcherOnly로 그린다(코드는 쪽에 이미 있다).
 *   상자·목록 안에 적은 자리는 쓰지 않고 지운다(웹 차시의 ::예제와 같은 약속).
 * - ::회로[2-1-2-1] → remark가 만든 자리 표시(<div class="book-circuit-slot" data-book-circuit="번호">)를 회로 그림 목록(scripts/circuits/circuits.yaml)에서 읽은
 *   <figure class="book-circuit">으로 바꾼다(그림 + 캡션 + [그림 크게 보기]). 목록은 호출하는 쪽(.astro)이 `circuits` 옵션으로 준다 — 이 파일은 파일을 읽지 않는다.
 *   모르는 번호는 경고를 남기고 자리를 지운다(npm run check:book은 오류로 막는다). 상자(:::연결레시피) 안에 적어도 그대로 바뀐다.
 */
import { circuitFigureHtml } from '../circuits/circuit-html.ts';
import type { CircuitFigure } from '../circuits/circuits-schema.ts';
import {
  addImageZoomLinks,
  addLazyImageLoading,
  findMatches,
  markLinkOnlyLines,
  markRowHeaderTables,
  rewriteRootRelativeUrls,
  splitHtmlSections,
  type LessonBodyPart,
  type LessonBodyPlan,
  type LessonBodySection,
} from '../lesson/lesson-html.ts';

/** 쪽에서 [이 자리에서 실습실 열기]로 띄울 예제 하나(examples/ 뒤 경로와 제목) */
export interface BookLab {
  readonly file: string;
  /** 쪽에 보일 이름. 짝 웹 차시의 examples에 같은 파일이 있으면 그 제목을 쓴다 */
  readonly title: string;
}

/** 회로 그림 목록을 읽는 길(.astro가 circuits-data.ts의 값을 넘긴다) */
export interface BookCircuitSource {
  /** 캡션 끝에 붙는 고정 문장 */
  readonly captionNote: string;
  readonly find: (id: string) => CircuitFigure | undefined;
}

export interface BookBodyPlanOptions {
  /** ::회로 자리를 바꿀 그림 목록. 주지 않으면 자리를 지우고 경고한다 */
  readonly circuits?: BookCircuitSource;
}

export interface BookBodyPlan {
  /** LessonBody.astro가 그대로 그리는 계획(intro → sections, 예제 자리는 labs의 차례) */
  readonly plan: LessonBodyPlan;
  /** 쪽 본문에 적힌 ::실습실 자리의 예제 파일(적힌 차례, 겹치면 한 번) */
  readonly labFiles: readonly string[];
}

/**
 * 출판본 제목 모양(## 번호 제목 · ## 기본 실습 | 제목 · ### 단계 1 | 제목 · ## 학습 목표)에 종류 표시(data-kind)와 칩 모양을 입힌다.
 * 글자는 그대로 두고(칩 둘 사이에 공백 글자를 둬 낭독·검색·발표 모드가 읽는 글은 "기본 실습 제목") 칩은 CSS(src/styles/book.css)가 그린다.
 * 제목 id는 Astro가 이미 글자에서 만들어 둔 것을 그대로 둔다. 제목 안에 용어·굵게 같은 태그가 있으면 건드리지 않는다.
 */
export function decorateBookHeadings(html: string): string {
  return html.replace(/<(h2|h3)\b([^>]*)>([^<]*)<\/\1>/gu, (whole: string, tag: string, attrs: string, inner: string) => {
    const text = inner.replace(/\s+/gu, ' ').trim();
    const open = (kind: string) => `<${tag}${attrs} data-kind="${kind}">`;
    if (tag === 'h2') {
      if (text.replace(/\s+/gu, '') === '학습목표') {
        return `${open('goal')}${inner}</${tag}>`;
      }
      const stage = /^(기본|심화) 실습 \| (\S.*)$/u.exec(text);
      if (stage) {
        return `${open(stage[1] === '기본' ? 'basic' : 'advanced')}<span class="book-tag">${stage[1]} 실습</span> <span class="book-heading__text">${stage[2]}</span></${tag}>`;
      }
      const numbered = /^(\d{1,2}) (\S.*)$/u.exec(text);
      if (numbered) {
        return `${open('numbered')}<span class="book-num">${numbered[1]}</span> <span class="book-heading__text">${numbered[2]}</span></${tag}>`;
      }
      return whole;
    }
    const step = /^(단계 \d+) \| (\S.*)$/u.exec(text);
    return step ? `${open('step')}<span class="book-step">${step[1]}</span> <span class="book-heading__text">${step[2]}</span></${tag}>` : whole;
  });
}

/** 그림 아래 캡션 문단(▲로 시작하는 한 줄)에 클래스를 붙인다 — 스타일은 src/styles/book.css의 .book-caption */
export function decorateBookCaptions(html: string): string {
  return html.replace(/<p>(▲[^<]*)<\/p>/gu, '<p class="book-caption">$1</p>');
}

/** remark가 만든 실습실 자리 표시 한 줄 */
const LAB_SLOT_PATTERN = /<div class="book-lab-slot"[^>]*\sdata-book-lab="([^"]*)"[^>]*><\/div>\n?/u;

/**
 * 한 조각(html)에서 실습실 자리를 찾아 html·slot 조각으로 나눈다. 맨 위 단계에 있는 자리만 쓰고, 상자 안에 든 것은 지운다.
 * @param labFiles 지금까지 모은 예제 파일(차례 번호를 정하는 데 쓴다 — 같은 파일은 같은 번호)
 */
function placeLabSlots(part: LessonBodyPart, labFiles: string[], warnings: string[]): LessonBodyPart[] {
  if (part.type !== 'html') {
    return [part];
  }
  const matches = findMatches(part.html, LAB_SLOT_PATTERN);
  if (matches.length === 0) {
    return [part];
  }
  const pieces: LessonBodyPart[] = [];
  let cursor = 0;
  for (const match of matches) {
    pieces.push({ type: 'html', html: part.html.slice(cursor, match.index) });
    cursor = match.index + match.text.length;
    const file = LAB_SLOT_PATTERN.exec(match.text)?.[1] ?? '';
    if (!match.topLevel) {
      warnings.push(`::실습실[${file}] 줄은 상자·목록 밖에 한 줄로 따로 적어요. 안에 적은 줄은 지웠어요.`);
      continue;
    }
    let index = labFiles.indexOf(file);
    if (index < 0) {
      labFiles.push(file);
      index = labFiles.length - 1;
    }
    pieces.push({ type: 'slot', slot: 'examples', examples: [index] });
  }
  pieces.push({ type: 'html', html: part.html.slice(cursor) });
  return pieces;
}

/** remark가 만든 회로 그림 자리 표시 한 줄 */
const CIRCUIT_SLOT_PATTERN = /<div class="book-circuit-slot"[^>]*\sdata-book-circuit="([^"]*)"[^>]*><\/div>\n?/gu;

/**
 * ::회로 자리 표시를 회로 그림(<figure class="book-circuit">)으로 바꾼다. 목록에 없는 번호나 목록을 주지 않은 경우는 자리를 지우고 경고한다.
 * 그림 주소는 /images/… 그대로 둔다 — 뒤의 rewriteRootRelativeUrls가 base를 붙인다.
 */
export function placeCircuitSlots(html: string, circuits: BookCircuitSource | undefined, warnings: string[]): string {
  return html.replace(CIRCUIT_SLOT_PATTERN, (_whole: string, id: string) => {
    if (!circuits) {
      warnings.push(`::회로[${id}]를 그릴 그림 목록을 받지 못해 자리를 지웠어요.`);
      return '';
    }
    const figure = circuits.find(id);
    if (!figure) {
      warnings.push(`::회로[${id}]는 회로 그림 목록(scripts/circuits/circuits.yaml)에 없는 번호예요. 자리를 지웠어요.`);
      return '';
    }
    return circuitFigureHtml(figure, circuits.captionNote);
  });
}

/** 이웃한 html 조각을 하나로 잇고 빈 조각을 뺀다 */
function mergeHtmlParts(parts: readonly LessonBodyPart[]): LessonBodyPart[] {
  const merged: LessonBodyPart[] = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (part.type === 'html' && last?.type === 'html') {
      merged[merged.length - 1] = { type: 'html', html: last.html + part.html };
    } else {
      merged.push(part);
    }
  }
  return merged.filter((part) => part.type !== 'html' || part.html.trim() !== '');
}

/** 쪽 본문 HTML을 칸으로 나누고 실습실 자리를 정한다 */
export function planBookBody(html: string, options: BookBodyPlanOptions = {}): BookBodyPlan {
  const warnings: string[] = [];
  const withCircuits = placeCircuitSlots(html, options.circuits, warnings);
  const rewritten = rewriteRootRelativeUrls(markLinkOnlyLines(markRowHeaderTables(addImageZoomLinks(addLazyImageLoading(decorateBookCaptions(decorateBookHeadings(withCircuits)))))));
  warnings.push(...rewritten.warnings);

  const labFiles: string[] = [];
  const { intro, sections } = splitHtmlSections(rewritten.html);
  const introParts = mergeHtmlParts(placeLabSlots({ type: 'html', html: intro }, labFiles, warnings));
  const sectionPlans: LessonBodySection[] = sections.map((section) => ({
    id: section.id,
    title: section.title,
    generated: false,
    parts: mergeHtmlParts(placeLabSlots({ type: 'html', html: section.html }, labFiles, warnings)),
  }));
  return { plan: { intro: introParts, sections: sectionPlans, warnings }, labFiles };
}

/**
 * 쪽 안의 모든 ## 제목(칸)의 { id, title } — 필요하면 쪽 안 차례에 쓴다. 제목이 없는 칸은 건너뛴다.
 */
export function bookSectionLinks(plan: LessonBodyPlan): { id: string; title: string }[] {
  return plan.sections.flatMap((section) => (section.id ? [{ id: section.id, title: section.title }] : []));
}
