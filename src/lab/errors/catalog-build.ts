/**
 * 오류 사전 YAML(content/help/errors/errors.yaml) 읽기 — **빌드·테스트 전용**(PLAN §8.2 P2-06).
 *
 * YAML 파서(devDependency `yaml`)를 쓰므로 .astro 프런트매터(src/lab/modules/errors/panel.astro, src/pages/help/errors/index.astro)와
 * Node 테스트에서만 import한다. 브라우저로 가는 코드(src/lab/modules/errors/index.ts 등)에서는 import하지 않는다 —
 * 번들에 yaml이 들어가면 출처 검사가 실패한다(src/lab/controls/example-sidecar.ts와 같은 규칙).
 * 실습실 화면은 panel.astro가 페이지에 심은 JSON(catalogJson)을 catalog-schema.ts의 catalogFromJson으로 읽는다.
 */
import YAML from 'yaml';
import { normalizeCatalog, type ErrorCatalog } from './catalog-schema.ts';

/** 데이터 파일의 저장소 경로(문서·테스트가 같은 값을 쓴다) */
export const CATALOG_FILE = 'content/help/errors/errors.yaml';

/** YAML 글자 → 검사된 ErrorCatalog. 형식이 틀리면 CatalogFormatError(문제 목록)를 던진다. */
export function loadCatalogFromYaml(source: string): ErrorCatalog {
  let raw: unknown;
  try {
    raw = YAML.parse(source);
  } catch (error) {
    throw new Error(`${CATALOG_FILE}을(를) YAML로 읽지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
  }
  return normalizeCatalog(raw);
}

/**
 * 페이지에 심을 JSON 글자. <script type="application/json"> 안에 넣으므로 <를 유니코드로 바꿔 </script>가 스크립트를 끊지 못하게 한다
 * (LabShell.astro의 예제 목록과 같은 처리). 화면 쪽은 catalogFromJson으로 되돌린다.
 */
export function catalogJson(catalog: ErrorCatalog): string {
  return JSON.stringify(catalog).replace(/</gu, '\\u003c');
}

/**
 * 실습실 카드가 쓰는 만큼만 남긴 사전(보기 코드 example과 교과서 사례 cases를 뺀다).
 * 이 JSON은 실습실 페이지마다 HTML에 들어가므로(사이트 밖 요청을 만들지 않으려고) 크기를 줄인다 — 2026-09-16 실측 61.6KB → 50.1KB.
 * 뺀 두 필드는 오류 사전 페이지(/help/errors/)에서만 쓰고, 항목을 고르는 데(types·patterns·priority)에는 쓰이지 않아 풀이 결과가 같다
 * (tests/unit/errors/catalog.test.ts가 두 사전의 풀이 결과를 대조한다).
 */
export function cardCatalog(catalog: ErrorCatalog): ErrorCatalog {
  return {
    groups: catalog.groups,
    entries: catalog.entries.map((entry) => ({ ...entry, example: null, cases: [] })),
  };
}
