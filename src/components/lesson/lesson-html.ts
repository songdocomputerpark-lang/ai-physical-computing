/**
 * 차시 본문 HTML(마크다운을 바꾼 결과)을 SPEC §7.2 차시 틀 8칸으로 나누고,
 * 예제 코드와 확인 퀴즈가 들어갈 자리를 정한다(PLAN §2.6·§8.1 P1-06). 순수 함수라 Vitest로 검사한다.
 *
 * 마크다운을 쓰는 사람의 약속
 * - 8칸은 ## 제목으로 이 순서대로 쓴다: 학습목표 · 왜 배울까 · 핵심 개념 · 따라하기 · 바꿔보기 · 도전 과제 · 확인 퀴즈 · 교사용
 *   띄어쓰기는 달라도 된다("학습 목표"도 학습목표). 빠지거나 순서가 다르면 빌드 로그에 경고만 남긴다(PD-35).
 * - frontmatter examples의 예제 코드가 들어갈 자리에 ::예제 를 한 줄로 따로 적는다. 적지 않으면 따라하기 칸 끝에 붙는다.
 * - frontmatter quiz의 퀴즈가 들어갈 자리에 ::퀴즈 를 한 줄로 따로 적는다. 적지 않으면 확인 퀴즈 칸 끝에 붙는다.
 *   (두 표시는 어떤 remark 플러그인도 처리하지 않는 지시문이라 remark-boxes가 <p>::예제</p> 글자로 되돌려 둔다.
 *    상자·목록 안에 적은 표시는 쓰지 않고 지운다.)
 * - 그림·링크 주소는 사이트 뿌리부터 적는다: ![설명](/images/lessons/u1/그림.webp), [용어사전](/glossary/)
 *   이 파일이 base(/ai-physical-computing)를 붙인다. base는 src/config/site.ts 한 곳에서만 정한다(DECISIONS C7).
 */
import { BASE_PATH, withBase } from '../../lib/url.ts';

/** 차시 틀 8칸(SPEC §7.2). 적힌 순서가 틀의 순서다. */
export const LESSON_SECTIONS = [
  { key: 'goals', title: '학습목표' },
  { key: 'why', title: '왜 배울까' },
  { key: 'concepts', title: '핵심 개념' },
  { key: 'follow', title: '따라하기' },
  { key: 'try', title: '바꿔보기' },
  { key: 'challenge', title: '도전 과제' },
  { key: 'quiz', title: '확인 퀴즈' },
  { key: 'teacher', title: '교사용' },
] as const;

export type LessonSectionKey = (typeof LESSON_SECTIONS)[number]['key'];
export type LessonSlot = 'examples' | 'quiz';

/** 마크다운에 한 줄로 적는 자리 표시 */
export const LESSON_MARKERS: Readonly<Record<LessonSlot, string>> = Object.freeze({ examples: '::예제', quiz: '::퀴즈' });

/** 자리 표시가 없을 때 붙는 칸 */
const SLOT_SECTION: Readonly<Record<LessonSlot, LessonSectionKey>> = Object.freeze({ examples: 'follow', quiz: 'quiz' });
const SLOT_FIELD: Readonly<Record<LessonSlot, string>> = Object.freeze({ examples: 'examples', quiz: 'quiz' });

export type LessonBodyPart = { readonly type: 'html'; readonly html: string } | { readonly type: 'slot'; readonly slot: LessonSlot };

export interface LessonBodySection {
  readonly key?: LessonSectionKey;
  /** ## 제목의 id(목차 링크에 쓴다) */
  readonly id?: string;
  readonly title: string;
  /** 마크다운에 없어서 이 파일이 만든 칸인지 */
  readonly generated: boolean;
  readonly parts: readonly LessonBodyPart[];
}

export interface LessonBodyPlan {
  /** 첫 ## 제목 앞의 글 */
  readonly intro: readonly LessonBodyPart[];
  readonly sections: readonly LessonBodySection[];
  /** 빌드 로그에 남길 경고(차시 파일 경로는 부르는 쪽이 붙인다) */
  readonly warnings: readonly string[];
}

export interface LessonBodyOptions {
  /** frontmatter examples 개수 */
  readonly exampleCount: number;
  /** frontmatter quiz 문항 수 */
  readonly quizCount: number;
  /** 8칸 틀 검사(빠진 칸·순서·퀴즈 3문항·교사용 상자)를 할지. 읽기 자료·대단원 마무리는 false */
  readonly checkTemplate: boolean;
}

function squash(text: string): string {
  return text.normalize('NFC').replace(/\s+/gu, '');
}

/** ## 제목 글자로 8칸 가운데 어느 칸인지 찾는다. "학습 목표", "1. 학습목표", "교사용 안내"도 알아본다. */
export function sectionKeyFromHeading(text: string): LessonSectionKey | undefined {
  const plain = squash(text).replace(/^(?:\d+[.)]|[①-⑧])/u, '');
  if (plain.startsWith('교사용')) {
    return 'teacher';
  }
  return LESSON_SECTIONS.find((section) => squash(section.title) === plain)?.key;
}

function sectionIndex(key: LessonSectionKey): number {
  return LESSON_SECTIONS.findIndex((section) => section.key === key);
}

function sectionTitle(key: LessonSectionKey): string {
  return LESSON_SECTIONS[sectionIndex(key)]?.title ?? key;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
});

/** 제목·속성 글자에 흔히 나오는 HTML 문자 참조를 글자로 되돌린다. */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/giu, (whole: string, decimal?: string, hex?: string, name?: string) => {
    if (decimal) {
      return String.fromCodePoint(Number(decimal));
    }
    if (hex) {
      return String.fromCodePoint(Number.parseInt(hex, 16));
    }
    return (name && NAMED_ENTITIES[name.toLowerCase()]) ?? whole;
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** 상자(div·details)·목록·표·코드 블록처럼 안에 다른 글을 품는 태그 */
const NESTING_TAG = /<(\/?)(div|details|section|article|aside|blockquote|figure|nav|ul|ol|table|pre)\b[^>]*>/giu;

interface Match {
  readonly index: number;
  readonly text: string;
  /** 감싸는 태그 밖(맨 위 단계)에 있는지 */
  readonly topLevel: boolean;
}

/** html에서 pattern과 맞는 곳을 찾고, 감싸는 태그 밖인지 함께 알려 준다. */
export function findMatches(html: string, pattern: RegExp): Match[] {
  const ends: [number, number][] = [];
  let depth = 0;
  for (const tag of html.matchAll(new RegExp(NESTING_TAG.source, 'giu'))) {
    depth = Math.max(0, depth + (tag[1] === '/' ? -1 : 1));
    ends.push([(tag.index ?? 0) + tag[0].length, depth]);
  }
  const depthAt = (index: number): number => {
    let current = 0;
    for (const [end, value] of ends) {
      if (end > index) {
        break;
      }
      current = value;
    }
    return current;
  };
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  return [...html.matchAll(new RegExp(pattern.source, flags))].map((match) => ({
    index: match.index ?? 0,
    text: match[0],
    topLevel: depthAt(match.index ?? 0) === 0,
  }));
}

export interface HtmlSection {
  readonly key?: LessonSectionKey;
  readonly id?: string;
  readonly title: string;
  /** ## 제목(<h2>)부터 다음 ## 제목 앞까지 */
  readonly html: string;
}

/** 맨 위 단계의 <h2>마다 칸을 나눈다. 상자 안의 h2는 칸을 나누지 않는다. */
export function splitHtmlSections(html: string): { intro: string; sections: HtmlSection[] } {
  const starts = findMatches(html, /<h2\b[^>]*>/iu)
    .filter((match) => match.topLevel)
    .map((match) => match.index);
  if (starts.length === 0) {
    return { intro: html, sections: [] };
  }
  const sections = starts.map((start, position) => {
    const chunk = html.slice(start, starts[position + 1] ?? html.length);
    const open = /^<h2\b([^>]*)>/iu.exec(chunk);
    const closeIndex = chunk.search(/<\/h2>/iu);
    const inner = open && closeIndex >= 0 ? chunk.slice(open[0].length, closeIndex) : '';
    const title = decodeHtmlEntities(inner.replace(/<[^>]*>/gu, ''))
      .replace(/\s+/gu, ' ')
      .trim();
    const idMatch = /\sid="([^"]*)"/iu.exec(open?.[1] ?? '');
    return {
      key: sectionKeyFromHeading(title),
      id: idMatch?.[1] ? decodeHtmlEntities(idMatch[1]) : undefined,
      title,
      html: chunk,
    };
  });
  return { intro: html.slice(0, starts[0]), sections };
}

/** src·href·poster의 사이트 뿌리 주소(/로 시작, //는 제외)에 base를 붙인다. 이미 base가 붙은 주소는 그대로 둔다. */
export function rewriteRootRelativeUrls(html: string): { html: string; warnings: string[] } {
  const warnings: string[] = [];
  const baseWithoutSlash = BASE_PATH.slice(0, -1);
  const rewritten = html.replace(
    /(\s(?:src|href|poster)=")(\/(?!\/)[^"]*)"/giu,
    (whole: string, prefix: string, url: string) => {
      if (BASE_PATH === '/' || url.startsWith(BASE_PATH) || url === baseWithoutSlash) {
        return whole;
      }
      try {
        return `${prefix}${withBase(decodeHtmlEntities(url)).replace(/&/gu, '&amp;')}"`;
      } catch (error) {
        warnings.push(`주소 "${url}"에 사이트 base를 붙이지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
        return whole;
      }
    },
  );
  return { html: rewritten, warnings };
}

/** 본문 그림은 화면에 가까워질 때 받는다(학습 페이지 속도, SPEC §9). */
export function addLazyImageLoading(html: string): string {
  return html.replace(/<img\b(?![^>]*\sloading=)/giu, '<img loading="lazy" decoding="async"');
}

/** github-slugger와 같은 방식의 간단한 제목 id(칸을 새로 만들 때만 쓴다) */
function headingId(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/gu, '-');
}

interface WorkingSection {
  key?: LessonSectionKey;
  id?: string;
  title: string;
  generated: boolean;
  intro: boolean;
  parts: LessonBodyPart[];
}

/** 이웃한 html 조각을 하나로 잇고 빈 조각을 뺀다(표시 줄을 지운 자리에서 조각이 쪼개지므로). */
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
  return merged.filter((part) => part.type !== 'html' || part.html !== '');
}

function placeSlot(blocks: WorkingSection[], slot: LessonSlot, enabled: boolean, warnings: string[]): void {
  const marker = LESSON_MARKERS[slot];
  const pattern = new RegExp(`<p>\\s*${escapeRegExp(marker)}\\s*</p>\\n?`, 'u');
  let placed = false;
  let found = 0;
  let duplicates = 0;
  let nested = 0;

  for (const block of blocks) {
    block.parts = block.parts.flatMap((part): LessonBodyPart[] => {
      if (part.type !== 'html') {
        return [part];
      }
      const matches = findMatches(part.html, pattern);
      if (matches.length === 0) {
        return [part];
      }
      const pieces: LessonBodyPart[] = [];
      let cursor = 0;
      for (const match of matches) {
        found += 1;
        pieces.push({ type: 'html', html: part.html.slice(cursor, match.index) });
        cursor = match.index + match.text.length;
        if (!enabled) {
          continue;
        }
        if (!match.topLevel) {
          nested += 1;
        } else if (placed) {
          duplicates += 1;
        } else {
          pieces.push({ type: 'slot', slot });
          placed = true;
        }
      }
      pieces.push({ type: 'html', html: part.html.slice(cursor) });
      return pieces;
    });
    block.parts = mergeHtmlParts(block.parts);
  }

  if (!enabled) {
    if (found > 0) {
      warnings.push(`${marker} 줄이 있지만 frontmatter ${SLOT_FIELD[slot]}가 비어 있어 그 줄을 지웠어요.`);
    }
    return;
  }
  if (duplicates > 0) {
    warnings.push(`${marker} 줄은 한 번만 적어요. 두 번째부터는 지웠어요.`);
  }
  if (nested > 0) {
    warnings.push(`${marker} 줄은 상자·목록 밖에 한 줄로 따로 적어요. 안에 적은 줄은 지웠어요.`);
  }
  if (placed) {
    return;
  }

  const targetKey = SLOT_SECTION[slot];
  const target = blocks.find((block) => !block.intro && block.key === targetKey);
  if (target) {
    target.parts.push({ type: 'slot', slot });
    return;
  }

  const title = sectionTitle(targetKey);
  const usedIds = new Set(blocks.map((block) => block.id));
  let id = headingId(title);
  for (let suffix = 1; usedIds.has(id); suffix += 1) {
    id = `${headingId(title)}-${suffix}`;
  }
  const generated: WorkingSection = {
    key: targetKey,
    id,
    title,
    generated: true,
    intro: false,
    parts: [
      { type: 'html', html: `<h2 id="${escapeHtml(id)}">${escapeHtml(title)}</h2>\n` },
      { type: 'slot', slot },
    ],
  };
  const order = sectionIndex(targetKey);
  const insertAt = blocks.findIndex((block) => !block.intro && block.key !== undefined && sectionIndex(block.key) > order);
  blocks.splice(insertAt < 0 ? blocks.length : insertAt, 0, generated);
  warnings.push(`"${title}" 칸(## ${title})이 없어서 칸을 만들어 넣었어요.`);
}

function templateWarnings(blocks: readonly WorkingSection[], options: LessonBodyOptions): string[] {
  const warnings: string[] = [];
  const keyed = blocks.filter((block): block is WorkingSection & { key: LessonSectionKey } => !block.intro && block.key !== undefined);

  const present = new Set(keyed.map((block) => block.key));
  const missing = LESSON_SECTIONS.filter((section) => !present.has(section.key)).map((section) => section.title);
  if (missing.length > 0) {
    warnings.push(`빠진 칸이 있어요: ${missing.join(', ')} (차시 틀 8칸, SPEC §7.2)`);
  }

  const repeated = [...new Set(keyed.map((block) => block.key).filter((key, index, keys) => keys.indexOf(key) !== index))];
  if (repeated.length > 0) {
    warnings.push(`같은 칸이 두 번 있어요: ${repeated.map(sectionTitle).join(', ')}`);
  }

  const indexes = keyed.map((block) => sectionIndex(block.key));
  if (indexes.some((value, position) => position > 0 && value < (indexes[position - 1] ?? value))) {
    warnings.push(`칸 순서가 틀과 달라요. 순서: ${LESSON_SECTIONS.map((section) => section.title).join(' → ')}`);
  }

  const teacher = keyed.find((block) => block.key === 'teacher');
  if (teacher && !teacher.parts.some((part) => part.type === 'html' && /class="box box--teacher"/u.test(part.html))) {
    warnings.push('교사용 칸의 내용은 :::교사용 상자 안에 적어 접히게 해요.');
  }

  if (options.quizCount !== 3) {
    warnings.push(`확인 퀴즈는 3문항으로 적어요(지금 ${options.quizCount}문항).`);
  }
  return warnings;
}

/**
 * 차시 본문 HTML을 칸으로 나누고 예제·퀴즈 자리를 정한다.
 * 페이지는 intro → sections 순서로 html은 그대로, slot은 예제·퀴즈 컴포넌트로 그린다.
 */
export function planLessonBody(html: string, options: LessonBodyOptions): LessonBodyPlan {
  const warnings: string[] = [];
  const rewritten = rewriteRootRelativeUrls(addLazyImageLoading(html));
  warnings.push(...rewritten.warnings);

  const { intro, sections } = splitHtmlSections(rewritten.html);
  const blocks: WorkingSection[] = [
    { title: '', generated: false, intro: true, parts: intro.trim() === '' ? [] : [{ type: 'html', html: intro }] },
    ...sections.map((section) => ({
      key: section.key,
      id: section.id,
      title: section.title,
      generated: false,
      intro: false,
      parts: [{ type: 'html', html: section.html } as LessonBodyPart],
    })),
  ];

  placeSlot(blocks, 'examples', options.exampleCount > 0, warnings);
  placeSlot(blocks, 'quiz', options.quizCount > 0, warnings);
  if (options.checkTemplate) {
    warnings.push(...templateWarnings(blocks, options));
  }

  const [introBlock, ...rest] = blocks;
  return {
    intro: introBlock?.parts ?? [],
    sections: rest.map(({ key, id, title, generated, parts }) => ({ key, id, title, generated, parts })),
    warnings,
  };
}
