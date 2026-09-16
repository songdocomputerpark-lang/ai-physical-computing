/**
 * 오류 사전 데이터 파일을 빌드 때 한 번 읽는 곳(PLAN §8.2 P2-06) — **빌드 전용**.
 *
 * content/help/errors/errors.yaml을 Vite의 ?raw로 글자로 가져와 catalog-build.ts(YAML 파서)로 읽고 검사한다.
 * 형식이 틀리면 여기서 오류가 나서 빌드가 멈춘다(교사가 항목을 더하다 틀렸을 때 바로 알 수 있게).
 *
 * 쓰는 곳(.astro 프런트매터만):
 *   - src/lab/modules/errors/panel.astro : errorCardCatalogJson을 <script type="application/json">에 심는다.
 *   - src/pages/help/errors/index.astro  : errorCatalog(전체)로 사전 페이지를 그린다.
 * 브라우저로 가는 코드(index.ts 등)에서는 import하지 않는다 — yaml 패키지가 번들에 들어가면 출처 검사가 실패한다.
 */
import { cardCatalog, catalogJson, loadCatalogFromYaml, CATALOG_FILE } from './catalog-build.ts';
import type { ErrorCatalog } from './catalog-schema.ts';

// 파일 하나지만 glob으로 읽는다(저장소 뿌리 기준 경로 — src/pages/labs/vision/index.astro가 examples/를 읽는 방법과 같다).
const files = import.meta.glob<string>('/content/help/errors/*.yaml', { query: '?raw', eager: true, import: 'default' });
const source = files[`/${CATALOG_FILE}`];

if (source === undefined) {
  throw new Error(`오류 사전 데이터 파일 ${CATALOG_FILE}을(를) 찾지 못했어요.`);
}

/** 검사를 마친 오류 사전(묶음 + 항목) */
export const errorCatalog: ErrorCatalog = loadCatalogFromYaml(source);

/**
 * 실습실 페이지에 심을 JSON 글자 — 카드가 쓰지 않는 보기 코드·교과서 사례를 뺀 것(catalog-build.ts의 cardCatalog, 61.6KB → 50.1KB).
 * 화면 쪽은 catalog-schema.ts의 catalogFromJson으로 되돌린다. 사전 페이지는 위의 errorCatalog(전체)를 그대로 쓴다.
 */
export const errorCardCatalogJson: string = catalogJson(cardCatalog(errorCatalog));
