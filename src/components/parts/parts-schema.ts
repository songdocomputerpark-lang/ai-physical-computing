/**
 * 부품 사전 데이터의 칸 규칙과 순수 함수(판 1.4.0, DECISIONS C136) — 데이터 파일은 content/parts/parts.yaml(칸 설명은 그 파일 머리말).
 *
 * 빌드·테스트 전용: YAML 파서(`yaml`)를 쓰므로 .astro 프런트매터(src/pages/start/parts/index.astro 등)와 Node 테스트에서만 import한다.
 * 브라우저로 가는 코드(<script>)에서는 import하지 않는다 — yaml 패키지가 번들에 들어가면 출처 검사가 실패한다
 * (오류 사전 src/lab/errors/catalog-build.ts, 교사용 자료실 teacher-data-schema.ts와 같은 규칙).
 *
 * 쓰는 곳: parts-data.ts(빌드 때 파일을 읽어 이 함수로 검사), 부품 사전 쪽·키트 표 사진 칸·사진 줄 부품, tests/unit/parts/.
 * 형식이 틀리면 PartsFormatError(문제 목록)를 던져 빌드가 멈춘다 — 부품을 더하다 틀렸을 때 바로 알 수 있게.
 */
import YAML from 'yaml';
import { withBase } from '../../lib/url.ts';

/** 데이터 파일의 저장소 경로(문서·테스트가 같은 값을 쓴다) */
export const PARTS_FILE = 'content/parts/parts.yaml';

/** 사진 폴더(저장소 뿌리 기준) — sources.yaml의 키트 업체 항목이 이 폴더를 덮는다 */
export const PARTS_PHOTO_DIR = 'public/images/parts/third-party/kit-vendor';

/** 사진 폴더의 사이트 안 경로(base 없음, withBase로 링크를 만든다) */
export const PARTS_PHOTO_PATH = 'images/parts/third-party/kit-vendor';

/** 사진 긴 변의 상한(px) — 다시 인코딩할 때 맞춘다(데이터 파일 머리말) */
export const PARTS_PHOTO_MAX_SIDE = 800;

/** 부품 사전 쪽의 사이트 안 경로(사이트 지도에는 메인이 따로 올린다) */
export const PARTS_PAGE_PATH = 'start/parts/';

/** 사진 줄·키트 표에서 부품 사전의 카드로 가는 #위치 앞머리 */
export const PART_CARD_ID_PREFIX = 'part-';

/** 분류 칩이 가는 #위치 앞머리 */
export const PART_CATEGORY_ID_PREFIX = 'cat-';

/** 분류 하나: 쪽에 보이는 차례가 이 목록의 차례다. M·O·U의 뜻은 .cache/v140/notes/a1-images.md를 따른다. */
export const PART_CATEGORIES = [
  { id: 'analog-sensor', label: '아날로그 센서', description: '값이 0부터 4095까지 연속으로 바뀌어 읽히는 센서예요.' },
  { id: 'digital-sensor', label: '디지털 센서·스위치', description: '켜짐(1)과 꺼짐(0)처럼 두 가지 값으로 읽히는 센서와 버튼이에요. 일부는 글자를 주고받는 통신(UART)을 써요.' },
  { id: 'display', label: '표시 장치', description: '화면이나 LED처럼 빛으로 보여 주는 부품이에요.' },
  { id: 'motor', label: '모터·구동', description: '움직임을 만드는 모터와, 모터를 움직이게 도와주는 부품이에요.' },
  { id: 'i2c', label: 'I2C 센서', description: '선 두 개(SDA·SCL)로 보드와 이야기하는 센서예요.' },
  { id: 'comm', label: '통신 모듈', description: '무선이나 적외선, 시리얼로 다른 기기와 정보를 주고받는 부품이에요.' },
  { id: 'output', label: '출력 장치', description: '소리를 내거나 전기를 켜고 끄는 부품이에요.' },
  { id: 'board', label: '보드·실드', description: '부품을 꽂는 보드와 확장 실드, 브레드보드예요.' },
  { id: 'etc', label: '기타', description: '전원이나 리모컨처럼 위의 분류에 들어가지 않는 부품이에요.' },
] as const;

export type PartCategoryId = (typeof PART_CATEGORIES)[number]['id'];

export interface PartCategory {
  readonly id: PartCategoryId;
  readonly label: string;
  readonly description: string;
}

/** 검사를 마친 부품(사진) 한 장 */
export interface PartEntry {
  /** 영문 소문자·숫자·하이픈 */
  readonly id: string;
  /** 사진 파일 이름(PARTS_PHOTO_DIR 안) */
  readonly file: string;
  /** 한국어 이름 */
  readonly name: string;
  /** 영어 이름 */
  readonly nameEn: string;
  readonly category: PartCategoryId;
  /** 보드와 어떻게 이어요? */
  readonly connection: string;
  /** 가상 보드 부품 id들(src/lab/modules/board/parts/ 폴더 이름). 없으면 빈 목록 */
  readonly siteParts: readonly string[];
  /** 키트 표(kit-parts.ts)의 kitName과 같은 글 */
  readonly kitName?: string;
  /** 판이 달라 모양이 다를 수 있다는 안내 같은 한 줄 */
  readonly note?: string;
}

/** 사전 한 분류와 그 분류의 부품들 */
export interface PartGroup {
  readonly category: PartCategory;
  readonly parts: readonly PartEntry[];
}

/** 데이터 파일의 문제 목록을 담은 오류 */
export class PartsFormatError extends Error {
  readonly problems: readonly string[];

  constructor(file: string, problems: readonly string[]) {
    super(`${file}에 고칠 곳이 ${problems.length}군데 있어요.\n- ${problems.join('\n- ')}`);
    this.name = 'PartsFormatError';
    this.problems = problems;
  }
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PHOTO_FILE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/u;
const KNOWN_KEYS = new Set(['id', 'file', 'name', 'name_en', 'category', 'connection', 'site_part', 'kit_name', 'note']);
const CATEGORY_IDS: ReadonlySet<string> = new Set(PART_CATEGORIES.map((category) => category.id));

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * YAML 글자를 읽어 검사한 부품 목록을 돌려준다. 어긋난 곳은 모아서 PartsFormatError 하나로 던진다.
 * 검사: 최상위 parts 목록·알 수 없는 칸(오타)·id 모양과 겹침·사진 파일 이름 모양과 겹침·분류 이름·필수 글 칸·site_part 모양·kit_name 겹침.
 * 사진 파일이 실제로 있는지, 크기가 맞는지는 파일 시스템을 보는 tests/unit/parts/가 맡는다(이 함수는 파일을 읽지 않는다).
 */
export function parsePartsYaml(source: string, file: string = PARTS_FILE): PartEntry[] {
  let raw: unknown;
  try {
    raw = YAML.parse(source);
  } catch (error) {
    throw new Error(`${file}을(를) YAML로 읽지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isPlainObject(raw) || !Array.isArray(raw.parts)) {
    throw new PartsFormatError(file, ['맨 위에 parts: 목록이 있어야 해요.']);
  }

  const problems: string[] = [];
  const parts: PartEntry[] = [];
  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();
  const seenKitNames = new Set<string>();

  raw.parts.forEach((item: unknown, index: number) => {
    const where = isPlainObject(item) && typeof item.id === 'string' ? `"${item.id}"` : `${index + 1}번째 항목`;
    if (!isPlainObject(item)) {
      problems.push(`${where}: { id: …, name: … } 모양의 묶음이어야 해요.`);
      return;
    }
    for (const key of Object.keys(item)) {
      if (!KNOWN_KEYS.has(key)) {
        problems.push(`${where}: 알 수 없는 칸 "${key}"이에요(오타인지 데이터 파일 머리말의 칸 목록과 견줘 봐요).`);
      }
    }
    const text = (key: string, required: boolean): string | undefined => {
      const value = item[key];
      if (value === undefined || value === null) {
        if (required) problems.push(`${where}: "${key}" 칸이 비었어요.`);
        return undefined;
      }
      if (typeof value !== 'string' || value.trim() === '') {
        problems.push(`${where}: "${key}"은 글(비어 있지 않은 문자열)이어야 해요.`);
        return undefined;
      }
      return value.trim();
    };

    const id = text('id', true);
    if (id !== undefined) {
      if (!KEBAB.test(id)) problems.push(`${where}: id는 영문 소문자·숫자·하이픈만 써요.`);
      if (seenIds.has(id)) problems.push(`${where}: id가 다른 항목과 겹쳐요.`);
      seenIds.add(id);
    }

    const fileName = text('file', false) ?? (id === undefined ? undefined : `${id}.webp`);
    if (fileName !== undefined) {
      if (!PHOTO_FILE.test(fileName)) problems.push(`${where}: 사진 파일 이름(${fileName})은 영문 소문자·숫자·하이픈과 .webp만 써요.`);
      if (seenFiles.has(fileName)) problems.push(`${where}: 사진 파일 ${fileName}을(를) 다른 항목도 써요. 같은 사진은 한 번만 실어요.`);
      seenFiles.add(fileName);
    }

    const name = text('name', true);
    const nameEn = text('name_en', true);
    const connection = text('connection', true);
    const category = text('category', true);
    if (category !== undefined && !CATEGORY_IDS.has(category)) {
      problems.push(`${where}: category "${category}"을(를) 몰라요. ${[...CATEGORY_IDS].join(' · ')} 중 하나를 써요.`);
    }

    let siteParts: string[] = [];
    const siteValue = item.site_part;
    if (siteValue !== undefined && siteValue !== null) {
      const list = Array.isArray(siteValue) ? siteValue : [siteValue];
      if (list.length === 0 || list.some((entry) => typeof entry !== 'string' || !KEBAB.test(entry))) {
        problems.push(`${where}: site_part는 가상 보드 부품 id(영문 소문자·하이픈) 하나이거나 그 목록이어야 해요.`);
      } else {
        siteParts = [...(list as string[])];
      }
    }

    const kitName = text('kit_name', false);
    if (kitName !== undefined) {
      if (seenKitNames.has(kitName)) problems.push(`${where}: kit_name이 다른 항목과 겹쳐요. 키트 표의 한 줄에는 사진 한 장만 이어요.`);
      seenKitNames.add(kitName);
    }
    const note = text('note', false);

    if (id !== undefined && fileName !== undefined && name !== undefined && nameEn !== undefined && connection !== undefined && category !== undefined && CATEGORY_IDS.has(category)) {
      parts.push({
        id,
        file: fileName,
        name,
        nameEn,
        category: category as PartCategoryId,
        connection,
        siteParts,
        ...(kitName === undefined ? {} : { kitName }),
        ...(note === undefined ? {} : { note }),
      });
    }
  });

  if (parts.length === 0 && problems.length === 0) {
    problems.push('부품이 하나도 없어요.');
  }
  if (problems.length > 0) {
    throw new PartsFormatError(file, problems);
  }
  return parts;
}

/** 분류 id → 분류 */
export function partCategory(id: PartCategoryId): PartCategory {
  const found = PART_CATEGORIES.find((category) => category.id === id);
  if (!found) throw new Error(`알 수 없는 분류 ${id}`);
  return found;
}

/** 분류 차례대로 묶는다. 같은 분류 안에서는 데이터 파일의 차례를 지킨다. 부품이 없는 분류는 빼지 않고 빈 목록으로 둔다. */
export function groupPartsByCategory(parts: readonly PartEntry[]): PartGroup[] {
  return PART_CATEGORIES.map((category) => ({ category, parts: parts.filter((part) => part.category === category.id) }));
}

/**
 * 가상 보드 부품 id(들)에 맞는 사진 부품을 돌려준다 — 부품 id마다 **사진 한 장**(같은 사진은 한 번만).
 * 같은 부품 id를 가리키는 사진이 여럿이면(OLED 0.96인치 SSD1306·1.3인치 SH1106, 세로형·가로형 레이저) **교과서 키트 부품(kit_name이 있는 사진)을 먼저** 고르고,
 * 키트 부품이 없거나 모두 키트 부품이면 데이터 파일에서 먼저 나오는 것을 고른다 — 교과서·차시의 본문과 코드는 키트 부품 기준이기 때문이다(2026-10-16 화면 검수).
 * 새 사진을 더할 때 따로 적을 칸은 없다: 키트 표에 있는 부품이면 kit_name을 적는 것만으로 대표가 된다.
 * 차시의 사진 줄(PartPhotoStrip)이 쓴다. 사진이 없는 부품 id(ble 같은)는 조용히 건너뛰고, 차례는 받은 id의 차례다.
 */
export function pickPartsForSiteParts(parts: readonly PartEntry[], siteIds: readonly string[]): PartEntry[] {
  const picked: PartEntry[] = [];
  const seen = new Set<string>();
  for (const siteId of siteIds) {
    const candidates = parts.filter((part) => part.siteParts.includes(siteId));
    const found = candidates.find((part) => part.kitName !== undefined) ?? candidates[0];
    if (found && !seen.has(found.id)) {
      seen.add(found.id);
      picked.push(found);
    }
  }
  return picked;
}

/**
 * 차시 frontmatter의 examples[].parts 항목(`{ part: lcd-i2c, … }` 또는 PLAN §2.6의 `{ type: touch_digital, … }`)과 문자열을 가상 보드 부품 id로 읽는다.
 * type의 밑줄은 하이픈으로 읽는다(content-schemas.ts partSchema와 같은 규칙). 읽을 수 없는 항목은 건너뛴다.
 */
export function siteIdsOf(items: readonly (string | { readonly part?: string; readonly type?: string })[]): string[] {
  const ids: string[] = [];
  for (const item of items) {
    const raw = typeof item === 'string' ? item : (item.part ?? item.type);
    if (typeof raw === 'string' && raw.trim() !== '') {
      ids.push(raw.trim().replace(/_/gu, '-'));
    }
  }
  return ids;
}

/** 키트 표 한 줄(kitName)에 이어진 사진 부품(없으면 undefined) */
export function partForKitName(parts: readonly PartEntry[], kitName: string): PartEntry | undefined {
  return parts.find((part) => part.kitName === kitName);
}

/** 사진의 사이트 안 주소(base가 붙음) */
export function partPhotoSrc(part: PartEntry): string {
  return withBase(`${PARTS_PHOTO_PATH}/${part.file}`);
}

/** 사진의 대체 글 — "초음파 센서 사진" */
export function partPhotoAlt(part: PartEntry): string {
  return `${part.name} 사진`;
}

/** 부품 사전에서 이 부품의 카드로 가는 링크 */
export function partCardHref(part: PartEntry): string {
  return withBase(`${PARTS_PAGE_PATH}#${PART_CARD_ID_PREFIX}${part.id}`);
}
