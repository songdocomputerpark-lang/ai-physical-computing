/**
 * 차시·교과서 쪽의 "준비물 사진 줄"이 보일 부품 id를 모은다(판 1.4.0, DECISIONS C136) — 순수 함수라 Vitest로 검사한다(tests/unit/parts/lesson-parts.test.ts).
 *
 * 한 예제의 부품은 가상 보드 배선을 읽는 규칙과 같은 순서를 따른다(src/lab/modules/board/wiring-spec.ts 머리말):
 *   차시 md frontmatter examples[].parts → 예제 사이드카(<이름>.meta.yaml) parts. (예제 파일 머리말 `# @part`는 사이트판 예제에만 있어 여기서는 읽지 않는다.)
 * 차시가 가진 예제 전부의 부품을 차례대로 한 목록으로 모은다. 같은 부품을 여러 예제가 써도 줄에는 한 번만 보이는 것은 PartPhotoStrip(pickPartsForSiteParts)이 맡는다.
 * 사이드카를 실제로 읽는 쪽은 빌드 전용 lesson-parts-data.ts다(브라우저 번들에 yaml이 들어가지 않게 나눴다).
 */

/** 부품 한 줄: 부품 id 글자나 `{ part }`·`{ type }` 사전(PartPhotoStrip의 parts 속성과 같은 모양) */
export type PartRef = string | { readonly part?: string | undefined; readonly type?: string | undefined };

export interface ExampleLike {
  /** examples/ 뒤의 경로. 예: esp32/u2/2-1-2-lcd-text-check.py */
  readonly file: string;
  /** 차시 frontmatter에 적은 배선(없거나 비었으면 사이드카를 본다) */
  readonly parts?: readonly PartRef[] | undefined;
}

/**
 * 예제 목록에서 부품 id를 차례대로 모은다. 예제마다 frontmatter 배선이 있으면 그것을, 비었으면 사이드카 배선(sidecarParts)을 쓴다.
 * 부품 이름이 없는 줄은 PartPhotoStrip이 건너뛰므로 여기서는 그대로 넘긴다.
 */
export function collectExamplePartRefs(
  examples: readonly ExampleLike[],
  sidecarParts: (file: string) => readonly PartRef[] | undefined,
): PartRef[] {
  const refs: PartRef[] = [];
  for (const example of examples) {
    const own = example.parts ?? [];
    const found = own.length > 0 ? own : (sidecarParts(example.file) ?? []);
    refs.push(...found);
  }
  return refs;
}
