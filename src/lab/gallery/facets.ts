/**
 * 예제 갤러리(P4-11)가 카드에 붙이는 **태그 규약** — 단원·부품·통신 방식·난이도·가상 보드 가능(PLAN §8.4 P4-11).
 * Phase 4 병렬 제작 준비(2026-09-18)에서 규약만 먼저 정했다. 화면(필터 UI)은 P4-11이 만든다.
 *
 * 값은 두 곳에서 온다 — **차시 md frontmatter가 먼저, 없으면 예제 사이드카**(제목·설명과 같은 우선순위, src/lab/README.md 3절).
 *
 * | 태그 | 차시 md(content/lessons/) | 예제 사이드카(<이름>.meta.yaml) | 값 |
 * |---|---|---|---|
 * | 단원 | `unit` | `unit` | 1~4 |
 * | 난이도 | `difficulty`(그 예제 항목 `examples[].difficulty`가 먼저 — 미해결 180) | `difficulty` | 1 쉬움 · 2 보통 · 3 어려움 |
 * | 가상 보드 가능 | `virtual_ok` | `virtual_ok` | true면 하드웨어 없이 끝까지 됨(절대 원칙 3) |
 * | 통신 방식 | `comm` | `comm` | 아래 EXAMPLE_COMM_KINDS |
 * | 부품 | `examples[].parts` | `parts` | 부품 폴더 id(src/lab/modules/board/parts/) |
 * | 그 밖의 낱말 | `tags` + 그 예제 항목 `examples[].tags` | `tags` | 자유 낱말(검색용) — 셋을 모두 모은다 |
 *
 * 규칙
 * - **모르면 적지 않는다.** 빈 값은 "해당 없음"이 아니라 "아직 모름"이라서 갤러리가 그 칸의 필터에서 뺀다.
 * - 통신을 쓰지 않는 예제는 `comm`을 적지 않는다(빈 목록). `none` 같은 값을 만들지 않는다.
 * - 부품은 배선(`parts`)에서 저절로 나오므로 따로 적지 않는다 — 배선이 곧 부품 태그다.
 * - 이 파일은 브라우저 번들에도 들어갈 수 있으니 빌드 전용 패키지(yaml 등)를 import하지 않는다.
 */

/** 통신 방식(PLAN §7.3 통로 표와 같은 이름). 값 하나가 "이 예제가 쓰는 길"이다. */
export const EXAMPLE_COMM_KINDS: readonly string[] = Object.freeze(['uart', 'ble', 'wifi', 'mqtt', 'tab']);

/** 화면에 보일 한국어 이름 */
export const EXAMPLE_COMM_LABELS: Readonly<Record<string, string>> = Object.freeze({
  uart: '시리얼(UART)',
  ble: '블루투스(BLE)',
  wifi: '와이파이',
  mqtt: 'MQTT',
  tab: '같은 컴퓨터 탭',
});

/** 난이도 1~3 */
export const EXAMPLE_DIFFICULTY_LABELS: Readonly<Record<number, string>> = Object.freeze({
  1: '쉬움',
  2: '보통',
  3: '어려움',
});

export interface GalleryFacets {
  /** 대단원 1~4(모르면 null) */
  readonly unit: number | null;
  /** 난이도 1~3(모르면 null) */
  readonly difficulty: number | null;
  /** 하드웨어 없이 끝까지 되나(모르면 null) */
  readonly virtualOk: boolean | null;
  /** 통신 방식(EXAMPLE_COMM_KINDS 순서, 중복 없음) */
  readonly comm: readonly string[];
  /** 부품 폴더 id(배선에서 뽑음, 나온 순서·중복 없음) */
  readonly parts: readonly string[];
  /** 자유 낱말(검색용) */
  readonly tags: readonly string[];
}

/** 갤러리가 값을 받는 한 곳(차시 md·사이드카 모두 이 모양으로 넘긴다). 모르는 칸은 빼고 준다. */
export interface FacetSource {
  readonly unit?: unknown;
  readonly difficulty?: unknown;
  readonly virtualOk?: unknown;
  readonly comm?: unknown;
  readonly parts?: readonly { readonly part?: string }[] | null;
  readonly tags?: readonly string[];
}

function intInRange(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/** 통신 방식 목록을 다듬는다: 아는 이름만, 정해진 순서로, 중복 없이. 글자 하나만 줘도 받는다. */
export function normalizeCommKinds(value: unknown): string[] {
  const list = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
  const wanted = new Set<string>();
  for (const item of list) {
    const name = typeof item === 'string' ? item.trim().toLowerCase() : '';
    if (EXAMPLE_COMM_KINDS.includes(name)) {
      wanted.add(name);
    }
  }
  return EXAMPLE_COMM_KINDS.filter((kind) => wanted.has(kind));
}

/** 배선 목록 → 부품 폴더 id 목록(나온 순서, 중복 없음) */
export function partIdsOf(parts: FacetSource['parts']): string[] {
  const ids: string[] = [];
  for (const entry of parts ?? []) {
    const id = typeof entry?.part === 'string' ? entry.part.trim() : '';
    if (id !== '' && !ids.includes(id)) {
      ids.push(id);
    }
  }
  return ids;
}

/**
 * 차시 md와 사이드카에서 온 값을 합친다 — **칸마다** 차시가 먼저고, 차시에 없으면 사이드카를 쓴다.
 * (제목·설명과 같은 규칙이다: 차시 md가 그 예제를 싣고 있으면 차시가 이긴다.)
 */
export function galleryFacetsOf(lesson: FacetSource | null, sidecar: FacetSource | null): GalleryFacets {
  const pick = <T>(read: (source: FacetSource) => T | null): T | null => {
    const fromLesson = lesson ? read(lesson) : null;
    if (fromLesson !== null) {
      return fromLesson;
    }
    return sidecar ? read(sidecar) : null;
  };
  const comm = normalizeCommKinds(lesson?.comm);
  const parts = partIdsOf(lesson?.parts);
  const tags = [...new Set([...(lesson?.tags ?? []), ...(sidecar?.tags ?? [])].map((tag) => tag.trim()).filter((tag) => tag !== ''))];
  return Object.freeze({
    unit: pick((source) => intInRange(source.unit, 1, 4)),
    difficulty: pick((source) => intInRange(source.difficulty, 1, 3)),
    virtualOk: pick((source) => (typeof source.virtualOk === 'boolean' ? source.virtualOk : null)),
    comm: Object.freeze(comm.length > 0 ? comm : normalizeCommKinds(sidecar?.comm)),
    parts: Object.freeze(parts.length > 0 ? parts : partIdsOf(sidecar?.parts)),
    tags: Object.freeze(tags),
  });
}
