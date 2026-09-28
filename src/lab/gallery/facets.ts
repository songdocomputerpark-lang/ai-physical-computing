/**
 * 예제 갤러리(P4-11)가 카드에 붙이는 **태그 규약** — 단원·부품·통신 방식·난이도·가상 보드 가능(PLAN §8.4 P4-11).
 * Phase 4 병렬 제작 준비(2026-09-18)에서 규약만 먼저 정했다. 화면(필터 UI)은 P4-11이 만든다.
 *
 * 값은 두 곳에서 온다 — **차시 md frontmatter와 예제 쪽(사이드카, 사이트가 만든 예제는 머리말 `# @tags`까지)**.
 * 칸마다 앞 순서가 이기고, 비었으면 다음 순서를 쓴다(제목·설명과 같은 생각 — src/lab/README.md 3절).
 * - 차시 md가 그 예제를 **싣고 있으면**(frontmatter `examples`) 차시가 먼저다(기본값).
 * - 사이드카 `lesson`·머리말 `# @lesson`으로 차시를 **가리키기만 한** 예제는 예제 쪽이 먼저고, 예제가 비운 칸만 차시로 채운다
 *   (`exampleFirst` — 2026-09-28 미해결 140: 차시가 싣지 않은 예제에 차시 전체의 값이 덮어써져 예제마다 적은 난이도·통신 방식이 가려졌다).
 *
 * | 태그 | 차시 md(content/lessons/) | 예제 사이드카(<이름>.meta.yaml) | 값 |
 * |---|---|---|---|
 * | 단원 | `unit` | `unit` | 1~4 |
 * | 난이도 | `difficulty`(그 예제 항목 `examples[].difficulty`가 먼저 — 미해결 180) | `difficulty` | 1 쉬움 · 2 보통 · 3 어려움 |
 * | 가상 보드 가능 | `virtual_ok` | `virtual_ok` | true면 하드웨어 없이 끝까지 됨(절대 원칙 3) |
 * | 통신 방식 | `comm` | `comm` | 아래 EXAMPLE_COMM_KINDS |
 * | 부품 | `examples[].parts` | `parts` | 부품 폴더 id(src/lab/modules/board/parts/) |
 * | 그 밖의 낱말 | `tags` + 그 예제 항목 `examples[].tags` | `tags`(+ 머리말 `# @tags`) | 자유 낱말(검색용) — 모두 모은다 |
 *
 * 규칙
 * - **난이도는 모든 예제에 있다**(2026-09-28 미해결 140 — `tests/unit/gallery/repo-facets.test.ts`가 지킨다). 예제를 더하면 차시에 싣거나
 *   (차시 `difficulty`), 머리말 `# @lesson`으로 차시를 가리키거나, 사이드카에 `difficulty`를 적는다. 매기는 기준은 아래 주석(EXAMPLE_DIFFICULTY_GUIDE).
 * - 그 밖의 칸은 **모르면 적지 않는다.** 빈 값은 "해당 없음"이 아니라 "아직 모름"이라서 갤러리가 그 칸의 필터에서 뺀다.
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

/*
 * 예제 난이도를 매기는 기준(EXAMPLE_DIFFICULTY_GUIDE — 2026-09-28 미해결 140에서 정함, 사이드카에 새로 적은 값이 이 기준을 따른다).
 * 차시 frontmatter의 `difficulty`는 차시 전체의 난이도라 그 차시가 싣는 예제 카드에 그대로 쓰이고, 기본·심화가 섞인 차시는
 * 예제 항목(`examples[].difficulty`)으로 따로 적는다(DECISIONS C34 ④). 화면에는 보이지 않는 약속이라 코드가 아니라 주석으로 둔다
 * (이 파일은 브라우저 번들에도 들어간다).
 *
 *   1 쉬움   한 가지 동작을 차례대로 해 보는 짧은 코드 — 창 띄우기, 인식 결과(점·뼈대·그물)를 그대로 그리기, 특징점 하나를
 *            화면 좌표로 바꿔 보이기, 부품 하나 켜고 끄기, 라이브러리 함수를 그대로 부르기. 조건문이 거의 없다.
 *            (예: 캠 화면 띄우기, 검지 끝에 원 그리기, 내장 LED 깜빡이기, deque 연습 — 차시 4-1-1·2-1-1과 같은 급)
 *   2 보통   읽은 값으로 계산하거나 판단해서 결과를 바꾸는 코드 — 두 점 이상의 거리·비율·방향·각도 계산, 조건문 여러 개, 여러 장면의
 *            값을 모아 판단(deque), 함수·콜백·타이머, 부품 두세 개를 함께, 통신 짝의 한쪽.
 *            (예: 접힌 손가락 알아채기, 최근 30장으로 코 방향 알기, 타이머로 LED 깜빡이기 — 차시 1-2-3·1-3-2와 같은 급)
 *   3 어려움 인식·판단 결과로 마우스나 다른 장치를 계속 움직이는 여러 단계 프로젝트 코드, 부품 네 개 이상과 통신을 한꺼번에,
 *            100줄 안팎. (예: 코 끝으로 마우스 움직이기, 4-2-2 받는 쪽 최종판 — 3-1-4 심화·4-2-x와 같은 급)
 */

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

/** galleryFacetsOf의 차례 고르기 */
export interface FacetMergeOptions {
  /**
   * 참이면 **예제 쪽(sidecar)이 먼저**, 차시는 예제가 비운 칸만 채운다. 차시가 그 예제를 싣지 않고 사이드카 `lesson`·머리말 `# @lesson`으로
   * 가리키기만 했을 때 쓴다(src/lab/gallery/cards.ts). 거짓(기본)이면 차시가 먼저 — 차시가 그 예제를 싣고 있을 때.
   */
  readonly exampleFirst?: boolean;
}

/**
 * 차시 md와 사이드카에서 온 값을 합친다 — **칸마다** 앞 순서가 이기고, 비었으면 다음 순서를 쓴다.
 * 기본은 차시가 먼저다(제목·설명과 같은 규칙이다: 차시 md가 그 예제를 싣고 있으면 차시가 이긴다). 차시가 싣지 않고 가리키기만 한 예제는
 * `{ exampleFirst: true }`로 예제 쪽을 먼저 본다. 낱말은 차례와 상관없이 차시 → 사이드카 순서로 모두 모은다(겹치는 낱말은 한 번만).
 */
export function galleryFacetsOf(lesson: FacetSource | null, sidecar: FacetSource | null, options: FacetMergeOptions = {}): GalleryFacets {
  const [first, second] = options.exampleFirst === true ? [sidecar, lesson] : [lesson, sidecar];
  const pick = <T>(read: (source: FacetSource) => T | null): T | null => {
    const fromFirst = first ? read(first) : null;
    if (fromFirst !== null) {
      return fromFirst;
    }
    return second ? read(second) : null;
  };
  const comm = normalizeCommKinds(first?.comm);
  const parts = partIdsOf(first?.parts);
  const tags = [...new Set([...(lesson?.tags ?? []), ...(sidecar?.tags ?? [])].map((tag) => tag.trim()).filter((tag) => tag !== ''))];
  return Object.freeze({
    unit: pick((source) => intInRange(source.unit, 1, 4)),
    difficulty: pick((source) => intInRange(source.difficulty, 1, 3)),
    virtualOk: pick((source) => (typeof source.virtualOk === 'boolean' ? source.virtualOk : null)),
    comm: Object.freeze(comm.length > 0 ? comm : normalizeCommKinds(second?.comm)),
    parts: Object.freeze(parts.length > 0 ? parts : partIdsOf(second?.parts)),
    tags: Object.freeze(tags),
  });
}
