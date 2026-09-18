/**
 * 예제 갤러리(P4-11)의 **카드 목록을 빌드 때 만드는 곳**(PLAN §8.4 P4-11, §2.5).
 *
 * 들어오는 것은 실습실이 이미 만들어 쓰는 예제 목록(`src/lab/vision/examples.ts`·`src/lab/esp32/examples.ts`가 돌려준 `LabExample[]`)과
 * 그 옆의 사이드카, 그리고 차시 md에서 뽑은 값이다. **그래서 새 예제는 `.py` 파일 하나를 폴더에 두는 것만으로 카드가 생긴다**
 * (실습실 [예제 불러오기] 목록에 드는 것과 똑같은 조건 — 원칙 6). 차시 md를 새로 만들면 카드에 차시 링크와 차시가 적은 태그가 함께 붙는다.
 *
 * 태그(facets)를 정하는 차례 — 칸마다 따로 본다.
 *   ① 차시 md frontmatter → ② 예제 사이드카(`<이름>.meta.yaml`) → ③ 사이트 규칙으로 저절로 읽기(`infer.ts`: 폴더 이름의 단원, 코드가 import하는 통신 모듈)
 * ①②는 `galleryFacetsOf`(facets.ts)가 맡고, 둘 다 비었을 때만 ③이 온다. 부품은 배선(`LabExample.parts`)이 곧 태그라 따로 적지 않는다.
 *
 * 같은 코드가 두 번 들어오면(§7.1 사본) **카드는 한 장만** 만들고 나머지 파일 이름을 `sameCode`에 적는다.
 * 거의 같은 변형(§7.2)과 원본↔사이트판은 `variants.ts`가 묶어 "비교해 보기"로 잇는다.
 *
 * 빌드에서만 도는 파일이다(페이지 프런트매터가 부른다). 브라우저로 가는 값은 카드의 `data-*`뿐이라 코드 본문은 화면에 실리지 않는다.
 */
import { getPage } from '../../config/nav.ts';
import type { ExampleSidecar } from '../controls/example-sidecar.ts';
import type { LabExample } from '../controls/examples.ts';
import { galleryFacetsOf, partIdsOf, type FacetSource, type GalleryFacets } from './facets.ts';
import { GALLERY_LAB_IDS, GALLERY_LAB_LABELS, normalizeKeywords, type GalleryLabId } from './filters.ts';
import { commKindsFromCode, unitFromExampleFile } from './infer.ts';
import { SITE_VERSION_GROUP, siteVersionPairs, variantGroupsBySourceId, type VariantGroup } from './variants.ts';

/** 차시 md 하나에서 갤러리가 쓰는 값(페이지가 `getCollection('lessons')`으로 만들어 넘긴다) */
export interface GalleryLessonInfo extends FacetSource {
  /** 차시 파일 이름(사이드카 `lesson`과 견준다) */
  readonly slug: string;
  /** base가 붙은 차시 주소 */
  readonly href: string;
  /** 화면 글자. 예: "1-2-1 웹캠 영상 좌우 반전" */
  readonly label: string;
}

/** 예제 → 차시 찾는 표(실습실 페이지가 쓰는 것과 같은 모양) */
export interface GalleryLessonLookup {
  /** 차시 frontmatter `examples[].file` → 그 차시 */
  readonly byFile?: Readonly<Record<string, GalleryLessonInfo>>;
  /** 차시 파일 이름 → 그 차시(사이드카 `lesson`·머리말 `# @lesson`이 가리킬 때) */
  readonly bySlug?: Readonly<Record<string, GalleryLessonInfo>>;
}

/** 갤러리에 넣을 예제 하나 */
export interface GalleryExampleInput {
  readonly lab: GalleryLabId;
  /** 실습실 목록이 만든 예제(제목·설명·묶음·배선·차시 링크가 이미 들어 있다) */
  readonly example: LabExample;
  /** 같은 이름의 사이드카(없으면 null) */
  readonly sidecar?: ExampleSidecar | null;
}

export interface GalleryCardLink {
  readonly href: string;
  readonly label: string;
}

/** "비교해 보기" 한 묶음(카드에서 다른 판으로 건너뛰는 링크) */
export interface GalleryCompare {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly others: readonly { readonly anchor: string; readonly title: string }[];
}

export interface GalleryCard {
  /** 갤러리 안에서 겹치지 않는 id(실습실 + 예제 id) */
  readonly id: string;
  /** 카드 제목에 붙는 위치 이름(#으로 건너뛰기·검색 결과 항목) */
  readonly anchor: string;
  readonly lab: GalleryLabId;
  readonly labLabel: string;
  /** 실습실 예제 id(?ex=·자동 저장 이름과 같은 값) */
  readonly exampleId: string;
  /** examples/ 뒤 경로 */
  readonly file: string;
  readonly title: string;
  readonly description: string | null;
  /** 실습실 [예제 불러오기]의 묶음 이름(갤러리에서도 같은 묶음으로 보인다) */
  readonly group: string;
  /** 이관 기록 id(docs/CODE_MAPPING.md, 예: f028) */
  readonly sourceId: string | null;
  /** 교과서 쪽 */
  readonly page: number | null;
  /** 코드 줄 수 */
  readonly lines: number;
  /** 이 예제가 나오는 차시 */
  readonly lesson: GalleryCardLink | null;
  /** 카드의 [실습실에서 열기] 주소(?example=…) */
  readonly labHref: string;
  readonly facets: GalleryFacets;
  /** 낱말 찾기용 글자(소문자) */
  readonly keywords: string;
  readonly compare: GalleryCompare | null;
  /** 코드가 똑같아 이 카드로 합친 다른 파일(보통 비어 있다 — §7.1 사본은 애초에 하나만 옮긴다) */
  readonly sameCode: readonly string[];
}

/**
 * 카드 묶음(실습실 [예제 불러오기]의 optgroup과 같은 나눔).
 * 실습실이 다르면 이름이 같아도(두 실습실 모두 "첫 실습·사이트 예제") 다른 묶음이라 `labLabel`을 함께 보인다.
 */
export interface GallerySection {
  readonly key: string;
  readonly label: string;
  readonly lab: GalleryLabId;
  readonly labLabel: string;
  readonly cards: readonly GalleryCard[];
}

export interface GalleryFacetOption {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

export interface GalleryFacetGroup {
  /** 거르기 칸 이름(filters.ts의 GalleryFilterState 열쇠) */
  readonly key: 'lab' | 'unit' | 'comm' | 'parts' | 'difficulty';
  /** 화면 제목 */
  readonly legend: string;
  readonly options: readonly GalleryFacetOption[];
}

export interface GalleryBuild {
  readonly cards: readonly GalleryCard[];
  readonly sections: readonly GallerySection[];
  readonly facetGroups: readonly GalleryFacetGroup[];
  /** 하드웨어 없이 끝까지 되는 예제 수(가상 보드 거르기 칸에 보인다). 0이면 그 칸을 만들지 않는다 */
  readonly virtualOkCount: number;
  /** 빌드 로그에 찍을 알림(사본을 합쳤을 때 등) */
  readonly notes: readonly string[];
}

export interface GalleryBuildOptions {
  /** 부품 id → 한국어 이름(가상 보드 부품 정의에서 온다). 없는 id는 id 그대로 보인다 */
  readonly partLabels?: Readonly<Record<string, string>>;
  /** 통신 방식 id → 한국어 이름(기본은 facets.ts의 EXAMPLE_COMM_LABELS) */
  readonly commLabels?: Readonly<Record<string, string>>;
  /** 난이도 → 한국어 이름 */
  readonly difficultyLabels?: Readonly<Record<number, string>>;
}

function labOrder(lab: GalleryLabId): number {
  const index = GALLERY_LAB_IDS.indexOf(lab);
  return index < 0 ? GALLERY_LAB_IDS.length : index;
}

/** 예제 파일 경로 → 카드 위치 이름(#으로 건너뛸 때 쓴다). 실습실 + 예제 id라 갤러리 안에서 겹치지 않는다. */
export function cardAnchor(lab: GalleryLabId, exampleId: string): string {
  return `ex-${lab}-${exampleId}`;
}

/** 실습실 id → 사이트 지도 페이지 id */
const LAB_PAGE_ID: Readonly<Record<GalleryLabId, string>> = Object.freeze({ vision: 'labs-vision', esp32: 'labs-esp32' });

/**
 * 카드의 [실습실에서 열기] 주소. 차시 페이지의 [실습실에서 열기](lesson-data.ts labLink)와 **같은 규칙**이라
 * 실습실이 `?example=`을 읽어 그 예제를 골라 준다(src/lab/controls/lab-shell.ts).
 */
export function labExampleHref(lab: GalleryLabId, file: string): string {
  return `${getPage(LAB_PAGE_ID[lab]).href}?example=${encodeURIComponent(file)}`;
}

/** 차시 md와 사이드카에서 이 예제에 해당하는 차시를 찾는다(차시가 싣고 있으면 그 차시가 먼저). */
function lessonFor(input: GalleryExampleInput, lessons: GalleryLessonLookup): GalleryLessonInfo | null {
  const file = input.example.file ?? '';
  const byFile = lessons.byFile?.[file];
  if (byFile) {
    return byFile;
  }
  const slug = input.sidecar?.lesson ?? null;
  return (slug !== null ? lessons.bySlug?.[slug] : null) ?? null;
}

/** 사이드카를 facets.ts가 읽는 모양으로 바꾼다(칸 이름이 다른 것만 맞춰 준다). */
function sidecarFacetSource(sidecar: ExampleSidecar | null | undefined): FacetSource | null {
  if (!sidecar) {
    return null;
  }
  return {
    unit: sidecar.unit ?? undefined,
    difficulty: sidecar.difficulty ?? undefined,
    virtualOk: sidecar.virtualOk ?? undefined,
    comm: sidecar.comm,
    tags: sidecar.tags,
  };
}

function countLines(code: string): number {
  if (code === '') {
    return 0;
  }
  const withoutTrailing = code.endsWith('\n') ? code.slice(0, -1) : code;
  return withoutTrailing.split('\n').length;
}

function pushOption(counts: Map<string, number>, value: string): void {
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

function optionsFrom(
  counts: Map<string, number>,
  order: readonly string[],
  label: (value: string) => string,
): GalleryFacetOption[] {
  const known = order.filter((value) => counts.has(value));
  const extra = [...counts.keys()].filter((value) => !order.includes(value)).sort((a, b) => a.localeCompare(b, 'ko'));
  return [...known, ...extra].map((value) => ({ value, label: label(value), count: counts.get(value) ?? 0 }));
}

/**
 * 예제 목록 → 갤러리 카드·묶음·거르기 칸.
 * `lessons`는 차시 md에서 만든 표, `options`는 부품·통신 이름표다.
 */
export function buildGallery(
  inputs: readonly GalleryExampleInput[],
  lessons: GalleryLessonLookup = {},
  options: GalleryBuildOptions = {},
): GalleryBuild {
  const notes: string[] = [];
  const sorted = [...inputs].sort((a, b) => labOrder(a.lab) - labOrder(b.lab));
  const variantBySourceId = variantGroupsBySourceId();
  const sitePairs = siteVersionPairs(sorted.map((input) => input.example.file ?? ''));
  const partLabels = options.partLabels ?? {};
  const commLabels = options.commLabels ?? {};
  const difficultyLabels = options.difficultyLabels ?? {};

  // ① 카드 한 장씩 만들기(코드가 똑같은 파일은 먼저 온 카드에 합친다 — PLAN §2.5 "사본은 하나만")
  const cards: GalleryCard[] = [];
  const byCode = new Map<string, GalleryCard>();
  const sameCodeOf = new Map<string, string[]>();
  for (const input of sorted) {
    const { example } = input;
    const file = example.file ?? '';
    if (file === '') {
      continue;
    }
    const existing = byCode.get(example.code);
    if (existing) {
      const list = sameCodeOf.get(existing.id) ?? [];
      list.push(file);
      sameCodeOf.set(existing.id, list);
      notes.push(`갤러리: examples/${file}은(는) examples/${existing.file}과 코드가 같아 카드 한 장으로 합쳤어요.`);
      continue;
    }
    const lesson = lessonFor(input, lessons);
    const sidecar = input.sidecar ?? null;
    const merged = galleryFacetsOf(lesson, sidecarFacetSource(sidecar));
    // ③ 아무 데도 적혀 있지 않은 칸만 사이트 규칙으로 읽는다(infer.ts).
    const unit = merged.unit ?? unitFromExampleFile(file);
    const comm = merged.comm.length > 0 ? merged.comm : commKindsFromCode(example.code);
    const parts = merged.parts.length > 0 ? merged.parts : partIdsOf(example.parts?.map((entry) => ({ part: entry.part })) ?? []);
    const facets: GalleryFacets = Object.freeze({
      unit,
      difficulty: merged.difficulty,
      virtualOk: merged.virtualOk,
      comm: Object.freeze(comm),
      parts: Object.freeze(parts),
      tags: merged.tags,
    });
    const id = `${input.lab}-${example.id}`;
    const keywords = normalizeKeywords(
      [
        example.title,
        example.description ?? '',
        facets.tags.join(' '),
        parts.map((part) => partLabels[part] ?? part).join(' '),
        comm.map((kind) => commLabels[kind] ?? kind).join(' '),
        file,
        sidecar?.sourceId ?? '',
        lesson?.label ?? '',
      ].join(' '),
    );
    const card: GalleryCard = {
      id,
      anchor: cardAnchor(input.lab, example.id),
      lab: input.lab,
      labLabel: GALLERY_LAB_LABELS[input.lab],
      exampleId: example.id,
      file,
      title: example.title,
      description: example.description ?? null,
      group: example.group ?? GALLERY_LAB_LABELS[input.lab],
      sourceId: sidecar?.sourceId ?? null,
      page: sidecar?.page ?? null,
      lines: countLines(example.code),
      lesson: example.lesson ? { href: example.lesson.href, label: example.lesson.label } : null,
      labHref: labExampleHref(input.lab, file),
      facets,
      keywords,
      compare: null,
      sameCode: [],
    };
    cards.push(card);
    byCode.set(example.code, card);
  }

  // ② "비교해 보기" 묶기 — 자료에 있던 변형(코드 id)과 원본↔사이트판(파일 이름)
  const byFile = new Map(cards.map((card) => [card.file, card] as const));
  const groups = new Map<string, { group: VariantGroup; members: GalleryCard[] }>();
  for (const card of cards) {
    const variant = card.sourceId === null ? undefined : variantBySourceId.get(card.sourceId);
    if (variant) {
      const bucket = groups.get(variant.id) ?? { group: variant, members: [] };
      bucket.members.push(card);
      groups.set(variant.id, bucket);
    }
  }
  for (const [siteFile, originalFile] of sitePairs) {
    const siteCard = byFile.get(siteFile);
    const originalCard = byFile.get(originalFile);
    if (!siteCard || !originalCard) {
      continue;
    }
    const group: VariantGroup = {
      id: `site-${originalCard.exampleId}`,
      label: SITE_VERSION_GROUP.label,
      note: SITE_VERSION_GROUP.note,
      sourceIds: [],
    };
    groups.set(group.id, { group, members: [originalCard, siteCard] });
  }

  const compareById = new Map<string, GalleryCompare>();
  for (const { group, members } of groups.values()) {
    if (members.length < 2) {
      continue;
    }
    for (const card of members) {
      compareById.set(card.id, {
        id: group.id,
        label: group.label,
        note: group.note,
        others: members
          .filter((other) => other.id !== card.id)
          .map((other) => ({ anchor: other.anchor, title: other.title })),
      });
    }
  }

  const finalCards: GalleryCard[] = cards.map((card) => ({
    ...card,
    compare: compareById.get(card.id) ?? null,
    sameCode: Object.freeze(sameCodeOf.get(card.id) ?? []),
  }));

  // ③ 묶음(실습실 [예제 불러오기]와 같은 나눔)과 거르기 칸
  const sections: GallerySection[] = [];
  for (const card of finalCards) {
    const last = sections[sections.length - 1];
    if (last && last.label === card.group && last.lab === card.lab) {
      (last.cards as GalleryCard[]).push(card);
      continue;
    }
    sections.push({
      key: `${card.lab}-${sections.length + 1}`,
      label: card.group,
      lab: card.lab,
      labLabel: card.labLabel,
      cards: [card],
    });
  }

  const labCounts = new Map<string, number>();
  const unitCounts = new Map<string, number>();
  const commCounts = new Map<string, number>();
  const partCounts = new Map<string, number>();
  const difficultyCounts = new Map<string, number>();
  let virtualOkCount = 0;
  for (const card of finalCards) {
    pushOption(labCounts, card.lab);
    if (card.facets.unit !== null) {
      pushOption(unitCounts, String(card.facets.unit));
    }
    if (card.facets.difficulty !== null) {
      pushOption(difficultyCounts, String(card.facets.difficulty));
    }
    if (card.facets.virtualOk === true) {
      virtualOkCount += 1;
    }
    for (const kind of card.facets.comm) {
      pushOption(commCounts, kind);
    }
    for (const part of card.facets.parts) {
      pushOption(partCounts, part);
    }
  }

  // 칸을 먼저 GalleryFacetGroup[]로 적어 두고(그래야 key가 정해진 이름으로 좁혀진다) 값이 없는 칸만 뺀다.
  const allFacetGroups: GalleryFacetGroup[] = [
    {
      key: 'lab',
      legend: '실습실',
      options: optionsFrom(labCounts, GALLERY_LAB_IDS, (value) => GALLERY_LAB_LABELS[value as GalleryLabId] ?? value),
    },
    { key: 'unit', legend: '대단원', options: optionsFrom(unitCounts, ['1', '2', '3', '4'], (value) => `${value}단원`) },
    {
      key: 'comm',
      legend: '통신 방식',
      options: optionsFrom(commCounts, Object.keys(commLabels), (value) => commLabels[value] ?? value),
    },
    {
      key: 'difficulty',
      legend: '난이도',
      options: optionsFrom(difficultyCounts, ['1', '2', '3'], (value) => difficultyLabels[Number(value)] ?? value),
    },
    {
      key: 'parts',
      legend: '부품',
      options: optionsFrom(partCounts, Object.keys(partLabels), (value) => partLabels[value] ?? value),
    },
  ];
  const facetGroups = allFacetGroups.filter((group) => group.options.length > 0);

  return { cards: finalCards, sections, facetGroups, virtualOkCount, notes };
}
