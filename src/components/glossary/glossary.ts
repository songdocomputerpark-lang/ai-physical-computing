/**
 * 용어사전 공통 규칙(PLAN §8.1 P1-07, SPEC §7.1) — 페이지를 만들 때 쓰는 순수 함수 모음.
 *
 * 흐름
 *   마크다운 :용어[픽셀]
 *   → 1단계(src/lib/remark-glossary.mjs): <glossary-term data-glossary-text="…">픽셀</glossary-term>  (Astro 콘텐츠 캐시에 남는 HTML)
 *   → 2단계(applyGlossary — GlossaryScope.astro가 부름): 굵은 링크 + 풀이 툴팁                       (빌드마다 새로 만듦)
 *   두 단계로 나눈 까닭은 remark-glossary.mjs 머리말에 적었다.
 *
 * 이 파일은 astro:content를 부르지 않는다. 항목 목록은 .astro 파일이 getCollection으로 읽어 넘긴다.
 * 그래서 Vitest가 그대로 검사한다(tests/unit/glossary/). 브라우저로 가는 코드(tooltip.ts)는 이 파일을 불러오지 않는다.
 */
import { ENTRY_ID_PATTERN } from '../../config/content-schemas.ts';
import { GLOSSARY_MARKER_ATTRIBUTES, GLOSSARY_MARKER_TAG } from '../../lib/remark-glossary.mjs';
import { withBase } from '../../lib/url.ts';

/* ───────────── 항목과 찾아보기 표 ───────────── */

/** content/glossary/*.md frontmatter 가운데 이 파일이 쓰는 값(규칙: src/config/content-schemas.ts의 glossarySchema) */
export interface GlossaryEntryData {
  readonly title: string;
  readonly english?: string | undefined;
  readonly aliases?: readonly string[] | undefined;
  readonly summary: string;
  readonly related?: readonly string[] | undefined;
  readonly group?: string | undefined;
  readonly draft?: boolean | undefined;
}

/** getCollection('glossary')의 항목 하나(id = 파일 이름에서 .md를 뗀 것) */
export interface GlossaryEntryInput {
  readonly id: string;
  readonly data: GlossaryEntryData;
}

/** 찾아보기 표에 든 항목(초안 제외) */
export interface GlossaryEntry {
  readonly id: string;
  readonly title: string;
  readonly english: string | undefined;
  readonly aliases: readonly string[];
  readonly summary: string;
  readonly related: readonly string[];
  readonly group: string | undefined;
}

export interface GlossaryRegistry {
  /** 초안이 아닌 항목(넘겨받은 순서) */
  readonly entries: readonly GlossaryEntry[];
  /** 항목 id로 찾는다(영문 대소문자·앞뒤 공백 무시). */
  byId(id: string): GlossaryEntry | undefined;
  /** 표제어·다른 이름·영어 이름으로 찾는다(띄어쓰기·영문 대소문자 무시). */
  byName(name: string): GlossaryEntry | undefined;
  /** 초안(draft: true) 항목을 가리키면 그 id(경고 문장용) */
  draftIdOf(reference: { readonly id?: string | undefined; readonly name?: string | undefined }): string | undefined;
}

/** 용어사전 페이지와 공통 레이아웃이 이미 쓰는 id라서 항목 파일 이름으로 쓸 수 없는 것 */
const RESERVED_ID_PATTERN = /^(?:index|glossary)-/u;
const LAYOUT_IDS: ReadonlySet<string> = new Set(['main-content', 'site-menu']);

/**
 * 이름을 비교할 수 있게 맞춘다: 호환 글자 통일(NFKC — I²C → I2C, 전각 → 반각), 영문 소문자, 공백 모두 없앰.
 * 예: "정규화 좌표"와 "정규화좌표", "GPIO"와 "gpio"는 같은 이름이다.
 */
export function normalizeGlossaryName(name: string): string {
  return name.normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
}

/** 두 이름이 같은 이름으로 읽히는지 */
export function isSameGlossaryName(a: string, b: string): boolean {
  return normalizeGlossaryName(a) === normalizeGlossaryName(b);
}

/** 영어 이름이 표제어와 다른 글자일 때만 true(ESP32처럼 같으면 한 번만 보인다) */
export function hasDistinctEnglish(entry: { readonly title: string; readonly english?: string | undefined }): boolean {
  return entry.english !== undefined && entry.english.trim() !== '' && !isSameGlossaryName(entry.english, entry.title);
}

function checkEntryId(id: string): void {
  if (!ENTRY_ID_PATTERN.test(id)) {
    throw new Error(
      `용어사전(content/glossary/): 파일 이름 "${id}.md"는 영문 소문자·숫자·하이픈으로 지어요(PD-09). 파일 이름이 주소 뒤 #이름이 돼요. 예: bgr-rgb.md`,
    );
  }
  if (RESERVED_ID_PATTERN.test(id) || LAYOUT_IDS.has(id)) {
    throw new Error(
      `용어사전(content/glossary/): 파일 이름 "${id}.md"는 페이지 안에서 이미 쓰는 이름이라 쓸 수 없어요. index-·glossary-로 시작하지 않는 이름으로 바꿔요.`,
    );
  }
}

/**
 * 항목 목록으로 찾아보기 표를 만든다.
 * 서로 다른 두 항목이 같은 이름(띄어쓰기·대소문자 무시)을 가지면 오류를 낸다.
 * 본문의 :용어[그 이름]이 어느 항목인지 정할 수 없어 틀린 풀이가 붙기 때문이다(frontmatter 오류와 같게 빌드를 멈춘다).
 */
export function createGlossaryRegistry(inputs: readonly GlossaryEntryInput[]): GlossaryRegistry {
  const entries: GlossaryEntry[] = [];
  const byId = new Map<string, GlossaryEntry>();
  const byName = new Map<string, { readonly id: string; readonly name: string }>();
  const draftIds = new Set<string>();
  const draftByName = new Map<string, string>();

  for (const { id, data } of inputs) {
    checkEntryId(id);
    const names = [data.title, ...(data.aliases ?? []), ...(data.english ? [data.english] : [])];
    if (data.draft) {
      draftIds.add(id);
      for (const name of names) {
        const key = normalizeGlossaryName(name);
        if (key !== '') {
          draftByName.set(key, id);
        }
      }
      continue;
    }
    for (const name of names) {
      const key = normalizeGlossaryName(name);
      if (key === '') {
        continue;
      }
      const existing = byName.get(key);
      if (existing && existing.id !== id) {
        throw new Error(
          `용어사전(content/glossary/): 두 항목이 같은 이름으로 읽혀요 — ${existing.id}.md의 "${existing.name}", ${id}.md의 "${name}". ` +
            `본문의 :용어[${name}]가 어느 항목인지 정할 수 없으니 한쪽의 title·aliases·english를 바꿔요(띄어쓰기와 영문 대소문자는 같은 글자로 봐요).`,
        );
      }
      byName.set(key, { id, name });
    }
    const entry: GlossaryEntry = Object.freeze({
      id,
      title: data.title,
      english: data.english,
      aliases: Object.freeze([...(data.aliases ?? [])]),
      summary: data.summary,
      related: Object.freeze([...(data.related ?? [])]),
      group: data.group,
    });
    entries.push(entry);
    byId.set(id, entry);
  }

  return Object.freeze({
    entries: Object.freeze(entries),
    byId: (id: string) => byId.get(id.trim().toLowerCase()),
    byName: (name: string) => {
      const found = byName.get(normalizeGlossaryName(name));
      return found ? byId.get(found.id) : undefined;
    },
    draftIdOf: ({ id, name }: { readonly id?: string | undefined; readonly name?: string | undefined }) => {
      if (id !== undefined) {
        const key = id.trim().toLowerCase();
        return draftIds.has(key) ? key : undefined;
      }
      return name === undefined ? undefined : draftByName.get(normalizeGlossaryName(name));
    },
  });
}

/** 용어사전 페이지에서 그 항목이 있는 곳(주소 뒤 #파일이름) */
export function glossaryEntryHref(id: string): string {
  return withBase(`glossary/#${id}`);
}

/* ───────────── 표시 자리(<glossary-term>) 읽기 ───────────── */

/** 1단계가 남긴 표시 자리 하나 */
export interface GlossaryMarker {
  /** 대괄호 안 글자 */
  readonly text: string;
  /** {항목=…}으로 적은 항목 id */
  readonly entry: string | undefined;
  /** 마크다운 위치 "경로:줄" */
  readonly source: string | undefined;
}

const MARKER_PATTERN = new RegExp(`<${GLOSSARY_MARKER_TAG}(\\s[^>]*)?>([\\s\\S]*?)</${GLOSSARY_MARKER_TAG}>`, 'giu');
const ATTRIBUTE_PATTERN = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
const NAMED_CHARACTER_REFERENCES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeCharacterReferences(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_CHARACTER_REFERENCES[body.toLowerCase()] ?? whole;
  });
}

function decodeMarkerValue(value: string | undefined): string | undefined {
  if (value === undefined || value === '') {
    return undefined;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function markerFrom(attributeText: string | undefined, innerHtml: string): GlossaryMarker {
  const attributes = new Map<string, string>();
  for (const match of (attributeText ?? '').matchAll(ATTRIBUTE_PATTERN)) {
    attributes.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '');
  }
  const fallbackText = decodeCharacterReferences(innerHtml.replace(/<[^>]*>/gu, '')).replace(/\s+/gu, ' ').trim();
  return {
    text: decodeMarkerValue(attributes.get(GLOSSARY_MARKER_ATTRIBUTES.text)) ?? fallbackText,
    entry: decodeMarkerValue(attributes.get(GLOSSARY_MARKER_ATTRIBUTES.entry)),
    source: decodeMarkerValue(attributes.get(GLOSSARY_MARKER_ATTRIBUTES.source)),
  };
}

/** HTML 안의 표시 자리를 앞에서부터 모두 읽는다. */
export function findGlossaryMarkers(html: string): GlossaryMarker[] {
  return [...html.matchAll(MARKER_PATTERN)].map((match) => markerFrom(match[1], match[2]));
}

/** 표시 자리가 가리키는 항목. {항목=…}을 적었으면 id로만, 아니면 이름으로 찾는다. */
export function resolveGlossaryMarker(registry: GlossaryRegistry, marker: GlossaryMarker): GlossaryEntry | undefined {
  return marker.entry !== undefined ? registry.byId(marker.entry) : registry.byName(marker.text);
}

/* ───────────── 문제(빌드 로그 경고) ───────────── */

export type GlossaryProblem =
  | { readonly kind: 'unknown-name'; readonly text: string; readonly source?: string | undefined }
  | { readonly kind: 'unknown-entry'; readonly text: string; readonly entry: string; readonly source?: string | undefined }
  | { readonly kind: 'draft'; readonly text: string; readonly entry: string; readonly source?: string | undefined }
  | { readonly kind: 'missing-related'; readonly entry: string; readonly related: string }
  | { readonly kind: 'self-related'; readonly entry: string };

function problemFor(registry: GlossaryRegistry, marker: GlossaryMarker): GlossaryProblem {
  const draftId = registry.draftIdOf(marker.entry !== undefined ? { id: marker.entry } : { name: marker.text });
  if (draftId !== undefined) {
    return { kind: 'draft', text: marker.text, entry: draftId, source: marker.source };
  }
  if (marker.entry !== undefined) {
    return { kind: 'unknown-entry', text: marker.text, entry: marker.entry, source: marker.source };
  }
  return { kind: 'unknown-name', text: marker.text, source: marker.source };
}

/** 빌드 로그에 남길 한국어 문장 */
export function formatGlossaryProblem(problem: GlossaryProblem): string {
  switch (problem.kind) {
    case 'unknown-name': {
      const where = problem.source ? ` (${problem.source})` : '';
      return (
        `[용어 표시] 용어사전에 없는 말 ":용어[${problem.text}]"${where} — 굵게·풀이 없이 글자만 보여 줘요. ` +
        `content/glossary/에 항목을 만들거나, 있는 항목의 aliases에 이 말을 넣거나, :용어[${problem.text}]{항목=파일이름}처럼 항목을 적어요.`
      );
    }
    case 'unknown-entry': {
      const where = problem.source ? ` (${problem.source})` : '';
      return (
        `[용어 표시] ":용어[${problem.text}]{항목=${problem.entry}}"${where}의 항목 파일 content/glossary/${problem.entry}.md를 찾지 못했어요 — ` +
        '글자만 보여 줘요. 파일 이름(.md 뺀 것)을 확인해요.'
      );
    }
    case 'draft': {
      const where = problem.source ? ` (${problem.source})` : '';
      return `[용어 표시] ":용어[${problem.text}]"${where} — 가리키는 항목 content/glossary/${problem.entry}.md가 초안(draft: true)이라 연결하지 않고 글자만 보여 줘요.`;
    }
    case 'missing-related':
      return `[용어사전] content/glossary/${problem.entry}.md의 related에 적은 "${problem.related}" 항목이 없어요 — 그 링크는 빼고 보여 줘요. 파일 이름(.md 뺀 것)을 확인해요.`;
    case 'self-related':
      return `[용어사전] content/glossary/${problem.entry}.md의 related에 자기 자신을 적었어요 — 그 링크는 빼고 보여 줘요.`;
  }
}

const reportedMessages = new Set<string>();

/**
 * 문제를 빌드 로그에 경고로 남긴다. 같은 문장은 한 번만 남긴다
 * (같은 차시가 차시 페이지와 용어사전 페이지에서 두 번 검사되기 때문이다).
 */
export function reportGlossaryProblems(
  problems: readonly GlossaryProblem[],
  warn: (message: string) => void = (message) => console.warn(message),
  seen: Set<string> = reportedMessages,
): void {
  for (const problem of problems) {
    const message = formatGlossaryProblem(problem);
    if (!seen.has(message)) {
      seen.add(message);
      warn(message);
    }
  }
}

/** 항목의 related에 적은 id가 모두 있는지 */
export function findRelatedProblems(registry: GlossaryRegistry): GlossaryProblem[] {
  const problems: GlossaryProblem[] = [];
  for (const entry of registry.entries) {
    for (const related of entry.related) {
      if (related === entry.id) {
        problems.push({ kind: 'self-related', entry: entry.id });
      } else if (!registry.byId(related)) {
        problems.push({ kind: 'missing-related', entry: entry.id, related });
      }
    }
  }
  return problems;
}

/* ───────────── 표시 자리 → 링크 + 툴팁 ───────────── */

/** 범위 이름을 id에 쓸 수 있는 글자(영문 소문자·숫자·하이픈)로 맞춘다. */
export function toScopeKey(value: string): string {
  const key = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z\d]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return key === '' ? 'scope' : key;
}

/** 본문 내용으로 범위 이름을 만든다(같은 내용이면 같은 이름 — 빌드할 때마다 id가 바뀌지 않게). */
export function scopeKeyFromContent(html: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < html.length; index += 1) {
    hash ^= html.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `s${(hash >>> 0).toString(36)}`;
}

const claimedScopes = new WeakMap<object, Set<string>>();

/**
 * 한 페이지(owner — 보통 Astro.request) 안에서 겹치지 않는 범위 이름을 받는다. 이미 쓴 이름이면 뒤에 -2, -3을 붙인다.
 */
export function claimScopeKey(owner: object, key: string): string {
  const base = toScopeKey(key);
  let claimed = claimedScopes.get(owner);
  if (!claimed) {
    claimed = new Set<string>();
    claimedScopes.set(owner, claimed);
  }
  let candidate = base;
  for (let suffix = 2; claimed.has(candidate); suffix += 1) {
    candidate = `${base}-${suffix}`;
  }
  claimed.add(candidate);
  return candidate;
}

/** 툴팁 요소의 id */
export function glossaryTipId(scope: string, entryId: string): string {
  return `glossary-tip-${toScopeKey(scope)}-${entryId}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

/**
 * 용어 하나를 굵은 링크 + 툴팁 HTML로 만든다.
 * - 링크의 aria-describedby가 툴팁을 가리켜, 화면 낭독기는 초점을 받을 때 풀이를 읽는다.
 * - 툴팁은 hidden으로 숨겨 두고 tooltip.ts가 마우스·초점에 따라 보인다(스타일이 없어도 글 사이에 풀이가 끼어 보이지 않는다).
 * - data-pagefind-ignore: 사이트 검색 색인이 문장 가운데 끼인 툴팁 글을 본문으로 읽지 않게 한다.
 */
export function renderGlossaryTerm(entry: GlossaryEntry, innerHtml: string, scope: string): string {
  const tipId = glossaryTipId(scope, entry.id);
  const english = hasDistinctEnglish(entry)
    ? `<span class="glossary-term__tip-english" lang="en"> (${escapeHtml(entry.english ?? '')})</span>`
    : '';
  return [
    '<span class="glossary-term">',
    `<a class="glossary-term__link" href="${escapeHtml(glossaryEntryHref(entry.id))}" aria-describedby="${tipId}" data-glossary-entry="${entry.id}">`,
    `<b>${innerHtml}</b></a>`,
    `<span class="glossary-term__tip" id="${tipId}" role="tooltip" hidden data-pagefind-ignore>`,
    `<span class="glossary-term__tip-title">${escapeHtml(entry.title)}${english}</span> `,
    `<span class="glossary-term__tip-text">${escapeHtml(entry.summary)}</span>`,
    '</span></span>',
  ].join('');
}

export interface ApplyGlossaryOptions {
  /** 툴팁 id에 넣는 범위 이름. 한 페이지 안에서 범위마다 달라야 한다(claimScopeKey). */
  readonly scope: string;
  /** 지금 보여 주는 항목 id. 이 항목을 가리키는 용어는 링크하지 않는다(용어사전 페이지의 항목 본문). */
  readonly self?: string | undefined;
}

export interface ApplyGlossaryResult {
  /** 표시 자리를 바꾼 HTML */
  readonly html: string;
  /** 링크·툴팁을 붙인 항목 id(나온 순서) */
  readonly used: readonly string[];
  /** 찾지 못한 용어 */
  readonly problems: readonly GlossaryProblem[];
}

/**
 * HTML 안의 표시 자리를 바꾼다.
 * - 같은 항목은 처음 나온 곳만 링크 + 툴팁, 나머지와 self 항목은 보통 글자(표시 자리 태그만 벗긴다).
 * - 찾지 못한 용어는 보통 글자로 두고 problems에 담는다.
 */
export function applyGlossary(html: string, registry: GlossaryRegistry, options: ApplyGlossaryOptions): ApplyGlossaryResult {
  const scope = toScopeKey(options.scope);
  const used: string[] = [];
  const problems: GlossaryProblem[] = [];
  const output = html.replace(MARKER_PATTERN, (_whole: string, attributeText: string | undefined, innerHtml: string) => {
    const marker = markerFrom(attributeText, innerHtml);
    const entry = resolveGlossaryMarker(registry, marker);
    if (!entry) {
      problems.push(problemFor(registry, marker));
      return innerHtml;
    }
    if (entry.id === options.self || used.includes(entry.id)) {
      return innerHtml;
    }
    used.push(entry.id);
    return renderGlossaryTerm(entry, innerHtml, scope);
  });
  return { html: output, used, problems };
}

/* ───────────── 가나다·ABC 색인 ───────────── */

export interface GlossaryGroup {
  /** 색인에 보이는 글자. 예: ㄱ, A, 숫자·기호 */
  readonly label: string;
  /** 묶음 제목의 id(주소 뒤 #). 예: index-giyeok, index-a, index-etc */
  readonly anchor: string;
  readonly entries: readonly GlossaryEntry[];
}

/** 한글 첫소리 묶음 14개(국어사전 찾아보기 순서). anchor는 자음 이름의 로마자 표기다. */
const HANGUL_GROUPS: readonly { readonly label: string; readonly anchor: string }[] = [
  { label: 'ㄱ', anchor: 'index-giyeok' },
  { label: 'ㄴ', anchor: 'index-nieun' },
  { label: 'ㄷ', anchor: 'index-digeut' },
  { label: 'ㄹ', anchor: 'index-rieul' },
  { label: 'ㅁ', anchor: 'index-mieum' },
  { label: 'ㅂ', anchor: 'index-bieup' },
  { label: 'ㅅ', anchor: 'index-siot' },
  { label: 'ㅇ', anchor: 'index-ieung' },
  { label: 'ㅈ', anchor: 'index-jieut' },
  { label: 'ㅊ', anchor: 'index-chieut' },
  { label: 'ㅋ', anchor: 'index-kieuk' },
  { label: 'ㅌ', anchor: 'index-tieut' },
  { label: 'ㅍ', anchor: 'index-pieup' },
  { label: 'ㅎ', anchor: 'index-hieut' },
];

/** 한글 음절의 첫소리 19개(ㄱ ㄲ ㄴ ㄷ ㄸ ㄹ ㅁ ㅂ ㅃ ㅅ ㅆ ㅇ ㅈ ㅉ ㅊ ㅋ ㅌ ㅍ ㅎ) → 위 묶음 번호. 된소리는 예사소리 묶음에 넣는다. */
const SYLLABLE_INITIAL_GROUP: readonly number[] = [0, 0, 1, 2, 2, 3, 4, 5, 5, 6, 6, 7, 8, 8, 9, 10, 11, 12, 13];
/** 낱자(호환 자모)로 시작할 때 같은 순서로 찾는다. */
const COMPATIBILITY_INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const HANGUL_SYLLABLE_FIRST = 0xac00;
const HANGUL_SYLLABLE_LAST = 0xd7a3;
/** 첫소리 하나에 딸린 음절 수(가운뎃소리 21 × 받침 28) */
const SYLLABLES_PER_INITIAL = 588;

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/** 표제어 두 개를 가나다순(한국어 정렬 규칙, 숫자는 크기 순)으로 비교한다. */
export function compareGlossaryTitles(a: string, b: string): number {
  return collator.compare(a, b);
}

/** 표제어가 들어갈 색인 묶음. order: 한글 0~13 → 영문 100~125 → 숫자·기호 1000 */
export function glossaryGroupOf(title: string): { readonly order: number; readonly label: string; readonly anchor: string } {
  const first = title.normalize('NFC').trim().charAt(0);
  const code = first.codePointAt(0) ?? 0;
  if (code >= HANGUL_SYLLABLE_FIRST && code <= HANGUL_SYLLABLE_LAST) {
    const order = SYLLABLE_INITIAL_GROUP[Math.floor((code - HANGUL_SYLLABLE_FIRST) / SYLLABLES_PER_INITIAL)];
    return { order, ...HANGUL_GROUPS[order] };
  }
  const jamo = first === '' ? -1 : COMPATIBILITY_INITIALS.indexOf(first);
  if (jamo >= 0) {
    const order = SYLLABLE_INITIAL_GROUP[jamo];
    return { order, ...HANGUL_GROUPS[order] };
  }
  const latin = first.normalize('NFKD').charAt(0).toUpperCase();
  if (latin >= 'A' && latin <= 'Z') {
    return { order: 100 + latin.charCodeAt(0) - 'A'.charCodeAt(0), label: latin, anchor: `index-${latin.toLowerCase()}` };
  }
  return { order: 1000, label: '숫자·기호', anchor: 'index-etc' };
}

/** 항목을 색인 묶음으로 나누고, 묶음 안에서는 가나다순으로 늘어놓는다. 항목이 없는 묶음은 만들지 않는다. */
export function groupGlossaryEntries(entries: readonly GlossaryEntry[]): GlossaryGroup[] {
  const groups = new Map<string, { order: number; label: string; anchor: string; entries: GlossaryEntry[] }>();
  for (const entry of entries) {
    const group = glossaryGroupOf(entry.title);
    const existing = groups.get(group.anchor);
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.set(group.anchor, { ...group, entries: [entry] });
    }
  }
  return [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map((group) =>
      Object.freeze({
        label: group.label,
        anchor: group.anchor,
        entries: Object.freeze(
          [...group.entries].sort((a, b) => compareGlossaryTitles(a.title, b.title) || compareGlossaryTitles(a.id, b.id)),
        ),
      }),
    );
}

/* ───────────── 나오는 차시 ───────────── */

/** 차시 하나(getCollection('lessons')에서 필요한 값만) */
export interface GlossaryLessonInput {
  readonly id: string;
  readonly title: string;
  readonly label?: string | undefined;
  readonly unit: number;
  readonly order: number;
  /** 1단계를 거친 본문 HTML(entry.rendered.html) */
  readonly html: string;
  /**
   * 차시 페이지 링크(base 포함). 배우기 페이지와 같은 주소 규칙(src/components/lesson/lesson-data.ts의 toLessonSummary —
   * 대단원은 폴더가 아니라 frontmatter unit이 정함)으로 만든 값을 넘긴다. 없으면 lessonHref(id)를 쓴다.
   */
  readonly href?: string | undefined;
}

export interface GlossaryLessonLink {
  readonly id: string;
  readonly href: string;
  readonly label: string;
}

/**
 * 차시 페이지 주소의 예비 규칙. 차시 id(content/lessons/u1/1-2-1.md → u1/1-2-1)를 배우기 아래에 붙인다.
 * 폴더 이름과 frontmatter unit이 같을 때 배우기 페이지 주소와 같다. 용어사전 페이지는 GlossaryLessonInput.href로
 * 배우기 페이지의 주소를 그대로 넘기므로, 이 함수는 href가 없을 때(단위 테스트 등)만 쓰인다.
 */
export function lessonHref(lessonId: string): string {
  return withBase(`learn/${lessonId}/`);
}

/** 차시 본문에 나온 용어를 모아 "항목 id → 그 낱말이 나오는 차시" 목록을 만든다(단원·순서대로). */
export function collectLessonsByEntry(
  lessons: readonly GlossaryLessonInput[],
  registry: GlossaryRegistry,
): { readonly byEntry: ReadonlyMap<string, readonly GlossaryLessonLink[]>; readonly problems: readonly GlossaryProblem[] } {
  const byEntry = new Map<string, GlossaryLessonLink[]>();
  const problems: GlossaryProblem[] = [];
  const sorted = [...lessons].sort((a, b) => a.unit - b.unit || a.order - b.order || compareGlossaryTitles(a.id, b.id));
  for (const lesson of sorted) {
    const seen = new Set<string>();
    for (const marker of findGlossaryMarkers(lesson.html)) {
      const entry = resolveGlossaryMarker(registry, marker);
      if (!entry) {
        problems.push(problemFor(registry, marker));
        continue;
      }
      if (seen.has(entry.id)) {
        continue;
      }
      seen.add(entry.id);
      const links = byEntry.get(entry.id) ?? [];
      links.push({
        id: lesson.id,
        href: lesson.href ?? lessonHref(lesson.id),
        label: lesson.label ? `${lesson.label} ${lesson.title}` : lesson.title,
      });
      byEntry.set(entry.id, links);
    }
  }
  return { byEntry, problems };
}
