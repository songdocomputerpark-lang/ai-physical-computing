/**
 * 차시 목록·차시 페이지가 함께 쓰는 계산(PLAN §8.1 P1-06). Astro 없이도 도는 순수 함수라 Vitest로 검사한다(tests/unit/lesson/).
 *
 * - 차시 md(content/lessons/**) 하나 → LessonSummary(주소·차시 번호·뱃지에 쓸 값)
 * - 차례표(curriculum.ts) + md 목록 → 대단원 목록(묶음 > 차시 카드). md가 없는 차시는 "준비 중" 카드
 * - 이전·다음 차시, 뱃지 문장(소요 시간·난이도·가상 보드·성취기준), 차시 파일 점검(주소 겹침 등)
 *
 * 주소 규칙: /learn/u{대단원 번호}/{md 파일 이름}/ — content/lessons/u1/1-1-1.md(unit: 1) → /learn/u1/1-1-1/
 * 폴더 이름이 아니라 frontmatter의 unit이 대단원을 정한다. 폴더와 unit이 다르면 경고만 남긴다.
 */
import type { LAB_IDS, LessonData } from '../../config/content-schemas.ts';
import { getLearnUnit, getPage, type BreadcrumbItem } from '../../config/nav.ts';
import { unmappedReason } from '../../config/standards.ts';
import { withParticle } from '../../lib/korean.ts';
import { withBase } from '../../lib/url.ts';
import { CURRICULUM, type LessonKind, type LessonSource, type UnitCurriculum } from './curriculum.ts';

export type LabId = (typeof LAB_IDS)[number];
export type UnitNumber = 1 | 2 | 3 | 4;

/**
 * 콘텐츠 컬렉션 항목에서 쓰는 부분(astro:content의 CollectionEntry<'lessons'>가 이 모양을 만족한다).
 * 본문 HTML(entry.rendered)은 차시 페이지가 직접 읽어 lesson-html.ts에 넘긴다.
 */
export interface LessonEntryLike {
  readonly id: string;
  readonly data: LessonData;
  readonly filePath?: string;
}

/** 주소 끝 이름(md 파일 이름) 모양: 영문 소문자·숫자·하이픈(PD-09) */
export const LESSON_SLUG_PATTERN = /^[a-z\d]+(?:-[a-z\d]+)*$/u;

/** 성취기준 코드가 비었을 때 화면 문장(DECISIONS C8) — 대응표(PLAN §2.2)에 없는 새 차시가 비었을 때만 */
export const STANDARDS_PENDING_TEXT = '성취기준 코드 확인 중';

/** 대응표에서 일부러 비운 차시(보충·선택 차시·대단원 마무리)의 뱃지 앞말. 뒤에 "(보충 차시)"처럼 까닭이 붙는다 */
export const STANDARDS_NONE_TEXT = '해당 없음';

/**
 * 성취기준이 빈 차시의 뱃지 글.
 * - 대응표에서 일부러 비운 차시(src/config/standards.ts UNMAPPED_REASONS) → "해당 없음(보충 차시)", intentional: true
 * - 대응표에 없는 새 차시 → "성취기준 코드 확인 중"(DECISIONS C8), intentional: false
 * 대응표의 근거 교육과정은 운영자가 확인했으므로(O12) 일부러 비운 차시에 "확인 중"을 보이지 않는다(2026-09-25 Phase 5 통합).
 */
export function standardsEmptyText(label: string | undefined): { readonly text: string; readonly intentional: boolean; readonly reason?: string } {
  const reason = unmappedReason(label);
  return reason ? { text: `${STANDARDS_NONE_TEXT}(${reason})`, intentional: true, reason } : { text: STANDARDS_PENDING_TEXT, intentional: false };
}

/** 성취기준 코드 옆에 붙이는 설명(PLAN §2.2 화면 표기) */
export const STANDARDS_NOTE = '성취기준은 인천광역시교육청 승인 교육과정의 코드이고, 차시와의 연결은 사이트가 붙였어요.';

/** 차시 종류 이름 */
export const KIND_LABELS: Readonly<Record<LessonKind, string>> = Object.freeze({
  textbook: '교과서',
  supplement: '보충',
  reading: '읽기 자료',
  review: '대단원 마무리',
});

/** 난이도 이름 */
export const DIFFICULTY_LABELS: Readonly<Record<1 | 2 | 3, string>> = Object.freeze({ 1: '쉬움', 2: '보통', 3: '어려움' });

export interface LessonSummary {
  readonly id: string;
  readonly unit: UnitNumber;
  readonly slug: string;
  /** 화면 차시 번호. frontmatter label이 없으면 파일 이름을 대문자로(v4 → V4) */
  readonly label: string;
  readonly title: string;
  readonly order: number;
  readonly kind: LessonKind;
  readonly description?: string;
  readonly pages?: string;
  readonly duration?: number;
  readonly difficulty?: 1 | 2 | 3;
  readonly virtualOk?: boolean;
  readonly lab?: LabId;
  readonly standards: readonly string[];
  readonly materials: readonly string[];
  /** 사이트 안 경로(base 없음). 예: /learn/u1/1-1-1/ */
  readonly path: string;
  /** base를 붙인 링크 */
  readonly href: string;
}

/** 콘텐츠 id("u1/1-1-1")에서 주소 끝 이름("1-1-1")을 꺼낸다. */
export function lessonSlug(id: string): string {
  const segments = id.split('/');
  return segments[segments.length - 1] || id;
}

/** frontmatter label이 없을 때의 차시 번호 */
export function defaultLessonLabel(slug: string): string {
  return slug.toUpperCase();
}

/** 차시 페이지 경로(base 없음) */
export function lessonPath(unit: number, slug: string): string {
  return `/learn/u${unit}/${slug}/`;
}

export function toLessonSummary(entry: LessonEntryLike): LessonSummary {
  const { data } = entry;
  const slug = lessonSlug(entry.id);
  const path = lessonPath(data.unit, slug);
  return {
    id: entry.id,
    unit: data.unit,
    slug,
    label: data.label ?? defaultLessonLabel(slug),
    title: data.title,
    order: data.order,
    kind: data.kind,
    description: data.description,
    pages: data.pages,
    duration: data.duration,
    difficulty: data.difficulty,
    virtualOk: data.virtual_ok,
    lab: data.lab,
    standards: data.standards,
    materials: data.materials,
    path,
    href: withBase(path),
  };
}

const labelCollator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });

/** 대단원 → order → 차시 번호(숫자는 크기대로) 순서 */
export function compareLessons(
  a: Pick<LessonSummary, 'unit' | 'order' | 'label'>,
  b: Pick<LessonSummary, 'unit' | 'order' | 'label'>,
): number {
  return a.unit - b.unit || a.order - b.order || labelCollator.compare(a.label, b.label);
}

/** 목록·페이지에 내보낼 차시(draft: true 제외)를 순서대로 */
export function publishedLessons(entries: readonly LessonEntryLike[]): LessonSummary[] {
  return entries
    .filter((entry) => !entry.data.draft)
    .map(toLessonSummary)
    .sort(compareLessons);
}

/** 순서대로 늘어놓은 차시에서 앞뒤 차시를 찾는다(대단원이 달라도 이어진다). */
export function findNeighbors(
  sorted: readonly LessonSummary[],
  id: string,
): { previous?: LessonSummary; next?: LessonSummary } {
  const index = sorted.findIndex((lesson) => lesson.id === id);
  if (index < 0) {
    return {};
  }
  return { previous: sorted[index - 1], next: sorted[index + 1] };
}

/** 차시 파일 점검 결과 한 줄 */
export interface LessonIssue {
  /** error는 빌드를 멈추고(같은 주소를 두 파일이 씀), warning은 빌드 로그에만 남긴다(PD-35). */
  readonly level: 'error' | 'warning';
  readonly id: string;
  readonly message: string;
}

/** 목록·주소를 만들기 전에 차시 파일끼리 부딪히는 곳을 찾는다. */
export function checkLessons(entries: readonly LessonEntryLike[]): LessonIssue[] {
  const issues: LessonIssue[] = [];
  const fileByPath = new Map<string, string>();
  const fileByLabel = new Map<string, string>();

  for (const entry of entries) {
    if (entry.data.draft) {
      continue;
    }
    const lesson = toLessonSummary(entry);
    const file = entry.filePath ?? `content/lessons/${entry.id}.md`;

    if (!LESSON_SLUG_PATTERN.test(lesson.slug)) {
      issues.push({
        level: 'warning',
        id: entry.id,
        message: `${file}: 파일 이름 "${lesson.slug}"에 영문 소문자·숫자·하이픈이 아닌 글자가 있어요. 주소가 길고 알아보기 어려워지니 1-2-1.md나 v4.md처럼 바꿔요(PD-09).`,
      });
    }

    const folder = entry.id.includes('/') ? entry.id.split('/')[0] : undefined;
    if (folder && /^u\d+$/u.test(folder) && folder !== `u${lesson.unit}`) {
      issues.push({
        level: 'warning',
        id: entry.id,
        message: `${file}: ${folder} 폴더에 있지만 unit이 ${lesson.unit}이라서 주소는 ${lesson.path}가 돼요. 폴더와 unit을 맞춰요.`,
      });
    }

    const samePath = fileByPath.get(lesson.path);
    if (samePath) {
      issues.push({
        level: 'error',
        id: entry.id,
        message: `${withParticle(`주소 ${lesson.path}`, '을/를')} 두 파일(${samePath}, ${file})이 함께 써요. 한 파일의 이름이나 unit을 바꿔요.`,
      });
    } else {
      fileByPath.set(lesson.path, file);
    }

    const labelKey = `${lesson.unit}:${lesson.label.toLowerCase()}`;
    const sameLabel = fileByLabel.get(labelKey);
    if (sameLabel) {
      issues.push({
        level: 'warning',
        id: entry.id,
        message: `${withParticle(`차시 번호 ${lesson.label}`, '이/가')} 두 파일(${sameLabel}, ${file})에 있어요. 복사해 둔 파일이면 하나를 지우거나 label을 바꿔요.`,
      });
    } else {
      fileByLabel.set(labelKey, file);
    }
  }
  return issues;
}

/** 목록 카드 한 장 */
export interface OutlineItem {
  /** 페이지 안에서 겹치지 않는 이름(카드 id 등에 쓴다) */
  readonly key: string;
  readonly label: string;
  readonly title: string;
  readonly order: number;
  readonly kind: LessonKind;
  /** 차례표에 있는 차시만 원천을 안다 */
  readonly source?: LessonSource;
  readonly pages?: string;
  /** ready: md가 있어 페이지로 이동할 수 있음 / planned: 준비 중 */
  readonly status: 'ready' | 'planned';
  readonly lesson?: LessonSummary;
}

/** 목록의 묶음(중단원) 하나 */
export interface OutlineSection {
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly items: readonly OutlineItem[];
}

interface WorkingSection {
  key: string;
  title: string;
  description?: string;
  middleUnit?: number;
  review: boolean;
  items: { item: OutlineItem; plannedSlug?: string }[];
}

function readyItem(lesson: LessonSummary, planned?: OutlineItem): OutlineItem {
  return {
    key: `lesson-u${lesson.unit}-${lesson.slug}`,
    label: lesson.label,
    title: lesson.title,
    order: lesson.order,
    kind: lesson.kind,
    source: planned?.source,
    pages: lesson.pages ?? planned?.pages,
    status: 'ready',
    lesson,
  };
}

function compareItems(a: OutlineItem, b: OutlineItem): number {
  return a.order - b.order || labelCollator.compare(a.label, b.label);
}

/**
 * 새 md 파일이 차례표에 없을 때 들어갈 묶음을 고른다.
 * ① 대단원 마무리(kind: review) → 마무리 묶음 ② 차시 번호 "대단원-중단원-차시" 모양 → 같은 중단원 묶음(없으면 새로 만든다)
 * ③ 그 밖(보충 등) → order가 바로 앞(같거나 작은 것 중 가장 큰)인 차시의 묶음
 */
function pickSection(sections: WorkingSection[], lesson: LessonSummary): WorkingSection {
  const reviewIndex = sections.findIndex((section) => section.review);

  if (lesson.kind === 'review') {
    if (reviewIndex >= 0) {
      return sections[reviewIndex] as WorkingSection;
    }
    const created: WorkingSection = { key: `u${lesson.unit}-review`, title: '대단원 마무리', review: true, items: [] };
    sections.push(created);
    return created;
  }

  const numbered = /^(\d+)-(\d+)-/u.exec(lesson.label);
  if (numbered && Number(numbered[1]) === lesson.unit) {
    const middleUnit = Number(numbered[2]);
    const existing = sections.find((section) => section.middleUnit === middleUnit);
    if (existing) {
      return existing;
    }
    const code = String(middleUnit).padStart(2, '0');
    const created: WorkingSection = {
      key: `u${lesson.unit}-${code}`,
      title: `${code} 중단원(이름 준비 중)`,
      middleUnit,
      review: false,
      items: [],
    };
    const insertAt = sections.findIndex(
      (section) => section.review || (section.middleUnit !== undefined && section.middleUnit > middleUnit),
    );
    sections.splice(insertAt < 0 ? sections.length : insertAt, 0, created);
    return created;
  }

  let best: { section: WorkingSection; order: number } | undefined;
  for (const section of sections) {
    if (section.review) {
      continue;
    }
    for (const { item } of section.items) {
      if (item.order <= lesson.order && (!best || item.order >= best.order)) {
        best = { section, order: item.order };
      }
    }
  }
  if (best) {
    return best.section;
  }
  const first = sections.find((section) => !section.review);
  if (first) {
    return first;
  }
  const created: WorkingSection = { key: `u${lesson.unit}-lessons`, title: '차시', review: false, items: [] };
  sections.splice(reviewIndex < 0 ? sections.length : reviewIndex, 0, created);
  return created;
}

/**
 * 대단원 하나의 목록(묶음 > 카드)을 만든다.
 * 차례표의 차시 번호(label, 대소문자 무시)나 파일 이름(slug)이 md와 같으면 그 자리의 "준비 중" 카드가 링크 카드로 바뀐다.
 */
export function buildUnitOutline(
  unit: UnitNumber,
  lessons: readonly LessonSummary[],
  curriculum: readonly UnitCurriculum[] = CURRICULUM,
): OutlineSection[] {
  const unitCurriculum = curriculum.find((candidate) => candidate.unit === unit);
  const sections: WorkingSection[] = (unitCurriculum?.sections ?? []).map((section) => ({
    key: section.key,
    title: section.title,
    description: section.description,
    middleUnit: section.middleUnit,
    review: section.lessons.length > 0 && section.lessons.every((planned) => planned.kind === 'review'),
    items: section.lessons.map((planned) => ({
      plannedSlug: planned.slug,
      item: {
        key: `planned-u${unit}-${planned.slug}`,
        label: planned.label,
        title: planned.title,
        order: planned.order,
        kind: planned.kind,
        source: planned.source,
        pages: planned.pages,
        status: 'planned',
      },
    })),
  }));

  for (const lesson of lessons.filter((candidate) => candidate.unit === unit)) {
    let matched = false;
    for (const section of sections) {
      const slot = section.items.find(
        ({ item, plannedSlug }) =>
          item.status === 'planned' &&
          (item.label.toLowerCase() === lesson.label.toLowerCase() || plannedSlug === lesson.slug),
      );
      if (slot) {
        slot.item = readyItem(lesson, slot.item);
        matched = true;
        break;
      }
    }
    if (!matched) {
      pickSection(sections, lesson).items.push({ item: readyItem(lesson) });
    }
  }

  return sections
    .filter((section) => section.items.length > 0)
    .map((section) => ({
      key: section.key,
      title: section.title,
      description: section.description,
      items: section.items.map(({ item }) => item).sort(compareItems),
    }));
}

/** 목록에 든 카드 수 */
export function countOutline(sections: readonly OutlineSection[]): { ready: number; planned: number } {
  let ready = 0;
  let planned = 0;
  for (const section of sections) {
    for (const item of section.items) {
      if (item.status === 'ready') {
        ready += 1;
      } else {
        planned += 1;
      }
    }
  }
  return { ready, planned };
}

/** 카드·제목 앞에 붙는 차시 종류 표시(교과서 차시와 대단원 마무리는 붙이지 않는다, PD-07) */
export function kindBadge(kind: LessonKind): string | undefined {
  return kind === 'supplement' || kind === 'reading' ? KIND_LABELS[kind] : undefined;
}

export interface Badge {
  readonly text: string;
  readonly tone: 'planned' | 'no-manuscript';
}

/** 카드 상태 뱃지: 준비 중, 원고 없음(코드만 있는 차시, PLAN §2.3) */
export function outlineBadges(item: Pick<OutlineItem, 'status' | 'source'>): Badge[] {
  const badges: Badge[] = [];
  if (item.status === 'planned') {
    badges.push({ text: '준비 중', tone: 'planned' });
  }
  if (item.source === 'code-only') {
    badges.push({ text: '원고 없음', tone: 'no-manuscript' });
  }
  return badges;
}

/** 소요 시간. 50 → "50분", 100 → "1시간 40분" */
export function formatDuration(minutes: number | undefined): string | undefined {
  if (minutes === undefined) {
    return undefined;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${minutes}분`;
  }
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

export function difficultyText(level: 1 | 2 | 3 | undefined): string | undefined {
  return level === undefined ? undefined : DIFFICULTY_LABELS[level];
}

/** 가상 보드로 끝까지 할 수 있는지(적지 않았으면 표시하지 않는다) */
export function virtualBoardText(value: boolean | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value ? '가상 보드로 끝까지 할 수 있어요' : '실제 보드가 있어야 해요';
}

export function materialsText(materials: readonly string[]): string {
  return materials.length > 0 ? materials.join(', ') : '따로 준비할 것 없음';
}

/** 교과서 쪽. "008~012" → "008~012쪽", 숫자가 아닌 표기("파일명 p55·p58")는 그대로 */
export function pagesText(pages: string | undefined): string | undefined {
  if (pages === undefined) {
    return undefined;
  }
  return /^[\d~·,\s-]+$/u.test(pages) ? `${pages}쪽` : pages;
}

/** 브라우저 탭·검색 결과 제목. 예: "V4 (보충) 블러와 에지" */
export function lessonDocumentTitle(lesson: Pick<LessonSummary, 'label' | 'title' | 'kind'>): string {
  const badge = kindBadge(lesson.kind);
  return `${lesson.label}${badge ? ` (${badge})` : ''} ${lesson.title}`;
}

/** 실습실 링크. 예제 파일을 주면 ?example=로 붙인다(실습실이 Phase 2~4에서 읽는다). */
/**
 * examples/ 뒤 경로의 첫 칸으로 그 예제가 도는 실습실을 고른다(esp32/ → ESP32, vision/·desktop/ → 영상처리). 모르면 undefined.
 * 통신 차시는 컴퓨터 쪽(vision/)과 보드 쪽(esp32/) 예제를 한 쌍으로 싣기 때문에, frontmatter의 lab 하나로 모든 예제를 열면
 * 한쪽이 틀린 실습실로 간다(P4-08에서 발견, 2026-09-24 통합에서 고침). 예제 갤러리(src/lab/gallery/cards.ts)도 같은 규칙이다.
 */
export function labOfExampleFile(file: string): LabId | undefined {
  const head = file.split('/')[0];
  if (head === 'esp32') {
    return 'esp32';
  }
  if (head === 'vision' || head === 'desktop') {
    return 'vision';
  }
  return undefined;
}

export function labLink(lab: LabId, exampleFile?: string): { label: string; href: string } {
  const page = getPage(`labs-${lab}`);
  return {
    label: page.label,
    href: exampleFile ? `${page.href}?example=${encodeURIComponent(exampleFile)}` : page.href,
  };
}

/** 차시 페이지의 현재 위치(홈 › 배우기 › 대단원 › 차시) */
export function lessonBreadcrumb(lesson: Pick<LessonSummary, 'unit' | 'label' | 'title'>): BreadcrumbItem[] {
  const home = getPage('home');
  const learn = getPage('learn');
  const unit = getLearnUnit(lesson.unit);
  return [
    { label: home.label, href: home.href },
    { label: learn.label, href: learn.href },
    { label: unit.label, href: unit.href },
    { label: `${lesson.label} ${lesson.title}` },
  ];
}
