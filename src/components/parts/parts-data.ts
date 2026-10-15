/**
 * 부품 사전 데이터를 빌드 때 한 번 읽는 곳 — **빌드 전용**(.astro 프런트매터에서만 import, 판 1.4.0 C136).
 * content/parts/parts.yaml을 Vite의 ?raw로 글자로 가져와 parts-schema.ts로 검사한다(오류 사전 catalog-data.ts·교사용 teacher-data.ts와 같은 방법).
 * 형식이 틀리면 여기서 오류가 나서 빌드가 멈춘다. yaml 패키지가 브라우저 번들에 들어가면 출처 검사가 실패하므로 <script>에서는 쓰지 않는다.
 *
 * 쓰는 곳: src/pages/start/parts/index.astro(사전 쪽), src/components/start/board/KitPartsTable.astro(키트 표 사진 칸),
 * src/components/parts/PartPhotoStrip.astro(차시의 사진 줄).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  PARTS_FILE,
  PARTS_PHOTO_DIR,
  groupPartsByCategory,
  parsePartsYaml,
  partForKitName,
  pickPartsForSiteParts,
  siteIdsOf,
  type PartEntry,
  type PartGroup,
} from './parts-schema.ts';
import { readWebpInfo } from './webp-info.ts';

// 저장소 뿌리 기준 경로(src/lab/errors/catalog-data.ts가 content/help/errors/를 읽는 방법과 같다)
const files = import.meta.glob<string>('/content/parts/*.yaml', { query: '?raw', eager: true, import: 'default' });
const source = files[`/${PARTS_FILE}`];

if (source === undefined) {
  throw new Error(`부품 사전 데이터 파일 ${PARTS_FILE}을(를) 찾지 못했어요.`);
}

/** 검사를 마친 부품 전체(데이터 파일의 차례) */
export const allParts: readonly PartEntry[] = parsePartsYaml(source);

/** 분류 차례대로 묶은 부품 사전 */
export const partGroups: readonly PartGroup[] = groupPartsByCategory(allParts);

/**
 * 가상 보드 부품 id(들)에 맞는 사진 부품 — 부품 id마다 한 장(여럿이면 교과서 키트 부품 먼저 — parts-schema.ts). 차시 frontmatter의 examples[].parts를 그대로 넘겨도 된다
 * (`{ part: lcd-i2c }`·`{ type: touch_digital }` 모두 읽음). 사진이 없는 부품 id는 건너뛴다.
 */
export function partsForSiteParts(ids: readonly (string | { readonly part?: string; readonly type?: string })[]): PartEntry[] {
  return pickPartsForSiteParts(allParts, siteIdsOf(ids));
}

/** 키트 표 한 줄(kitName)에 이어진 사진 부품 — 없으면 undefined */
export function partForKit(kitName: string): PartEntry | undefined {
  return partForKitName(allParts, kitName);
}

/** 이미 읽은 사진 크기(빌드 한 번에 같은 사진을 여러 쪽이 쓴다) */
const sizeCache = new Map<string, { readonly width: number; readonly height: number }>();

/** 사진의 가로·세로(px) — 파일 머리에서 읽는다. 파일이 없거나 WebP가 아니면 한국어 오류로 빌드를 멈춘다. */
export function partPhotoSize(part: PartEntry): { readonly width: number; readonly height: number } {
  const cached = sizeCache.get(part.file);
  if (cached) {
    return cached;
  }
  const file = path.join(process.cwd(), PARTS_PHOTO_DIR, part.file);
  let info = null;
  try {
    info = readWebpInfo(new Uint8Array(fs.readFileSync(file)));
  } catch {
    info = null;
  }
  if (!info) {
    throw new Error(`부품 사진 ${PARTS_PHOTO_DIR}/${part.file}을(를) 읽지 못했어요(파일이 없거나 WebP가 아니에요). ${PARTS_FILE}의 "${part.id}" 줄을 확인해요.`);
  }
  const size = { width: info.width, height: info.height };
  sizeCache.set(part.file, size);
  return size;
}
