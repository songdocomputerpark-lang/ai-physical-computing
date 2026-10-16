/**
 * 키트 장치 도감(판 1.5.0, DECISIONS C155) 데이터의 칸 규칙과 순수 함수 — 데이터 파일은 content/kit/devices.yaml(칸 설명은 그 파일 머리말).
 *
 * 빌드·테스트 전용: YAML 파서(`yaml`)를 쓰므로 .astro 프런트매터와 Node 테스트에서만 import한다. 브라우저로 가는 코드(<script>)에서는
 * import하지 않는다 — yaml 패키지가 번들에 들어가면 출처 검사가 실패한다(부품 사전 parts-schema.ts와 같은 규칙).
 * 이 파일은 파일을 열지 않는다. 읽기는 kit-data.ts, 장치 쪽 값 만들기는 kit-view.ts가 맡는다.
 *
 * 형식이 틀리면 KitFormatError(문제 목록)를 던져 빌드가 멈춘다 — 장치를 더하다 틀렸을 때 바로 알 수 있게.
 * 예제 파일·회로 그림·부품 사진이 실제로 있는지는 파일을 보는 tests/unit/kit/가 맡는다.
 */
import YAML from 'yaml';

/** 데이터 파일의 저장소 경로(문서·테스트가 같은 값을 쓴다) */
export const KIT_FILE = 'content/kit/devices.yaml';

/** 도감 첫 쪽의 사이트 안 경로(base 없음, withBase로 링크를 만든다) */
export const KIT_PAGE_PATH = 'labs/esp32/kit/';

/** 회로 그림 폴더의 저장소 경로 — sources.yaml의 키트 업체 항목이 이 폴더를 덮는다 */
export const KIT_CIRCUIT_DIR = 'public/images/kit/circuits/third-party/kit-vendor';

/** 회로 그림 폴더의 사이트 안 경로(앞에 / 없음, base 없음) */
export const KIT_CIRCUIT_PATH = 'images/kit/circuits/third-party/kit-vendor';

/** 장치 쪽 id 모양: d-<장>-<번호 두 자리> */
export const KIT_DEVICE_ID = /^d-([2-8])-(\d\d)$/u;

/** 가상 보드에서 되는 정도 */
export type KitVirtual = 'full' | 'partial' | 'real-only';

/** 가상 보드 지원 분류(조사 메모의 A·B1·B2·C — 화면에는 보이지 않는다) */
export type KitSupport = 'A' | 'B1' | 'B2' | 'C';

export const KIT_VIRTUAL_VALUES: readonly KitVirtual[] = ['full', 'partial', 'real-only'];
export const KIT_SUPPORT_VALUES: readonly KitSupport[] = ['A', 'B1', 'B2', 'C'];

export interface KitChapter {
  readonly n: number;
  readonly name: string;
}

export interface KitStep {
  /** 1 = 기본 동작 테스트, 2 = 심화 예제 */
  readonly n: number;
  /** "기본 동작 테스트"·"심화 예제" */
  readonly kind: string;
  readonly title: string;
  /** examples/ 뒤 경로(esp32/kit/ch3/3-11-ultrasonic-1.py) */
  readonly file: string;
  readonly virtual: KitVirtual;
  /** 이 코드에서 볼 것(두세 줄) */
  readonly points: readonly string[];
}

export interface KitLibrary {
  readonly name: string;
  readonly file: string;
  /** 참: 이 사이트가 보드 라이브러리로 싣고 있다(실습실이 저절로 쓴다) */
  readonly site: boolean;
  /** 사이트가 싣지 않는 파일의 브릭셀 내려받기 주소 */
  readonly url?: string;
  readonly note?: string;
}

export interface KitPartVariant {
  /** content/parts/parts.yaml의 부품 사진 id */
  readonly part: string;
  readonly label: string;
}

export interface KitDevice {
  /** d-3-11 */
  readonly id: string;
  /** "3.11" */
  readonly number: string;
  readonly chapter: number;
  readonly name: string;
  readonly nameEn: string;
  readonly description: string;
  /** 브릭셀 카드의 연결 방식 글("Digital / PWM") */
  readonly interface: string;
  readonly pins: string;
  readonly gpio: string;
  /** content/parts/parts.yaml의 부품 사진 id */
  readonly part: string;
  readonly partVariants: readonly KitPartVariant[];
  readonly libraries: readonly KitLibrary[];
  /** "G → GND" 꼴의 배선 줄 */
  readonly wiring: readonly string[];
  /** 회로 그림 파일 이름(KIT_CIRCUIT_DIR 안) */
  readonly circuit: string;
  readonly steps: readonly KitStep[];
  readonly support: KitSupport;
  readonly virtual: KitVirtual;
  readonly virtualReason?: string;
  readonly note?: string;
}

/** 1장 시작하기 코드 하나 */
export interface KitIntroItem {
  /** "1.7.3" */
  readonly number: string;
  readonly title: string;
  readonly sub: string;
  readonly file: string;
  readonly virtual: KitVirtual;
  readonly virtualReason?: string;
  readonly note?: string;
}

export interface KitData {
  readonly source: { readonly name: string; readonly url: string; readonly fetched: string };
  readonly chapters: readonly KitChapter[];
  readonly intro: readonly KitIntroItem[];
  readonly devices: readonly KitDevice[];
}

/** 데이터 파일의 문제 목록을 담은 오류 */
export class KitFormatError extends Error {
  readonly problems: readonly string[];

  constructor(file: string, problems: readonly string[]) {
    super(`${file}에 고칠 곳이 ${problems.length}군데 있어요.\n- ${problems.join('\n- ')}`);
    this.name = 'KitFormatError';
    this.problems = problems;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * YAML 글자를 읽어 검사한 도감 데이터를 돌려준다. 어긋난 곳은 모아서 KitFormatError 하나로 던진다.
 * 검사: 최상위 칸·장 이름표(2~8장 모두)·장치 id 모양과 겹침·번호와 id의 짝·글 칸·가상 보드 정도 값·단계 두 개·가상이 아니면 까닭.
 */
export function parseKitYaml(source: string, file: string = KIT_FILE): KitData {
  let raw: unknown;
  try {
    raw = YAML.parse(source);
  } catch (error) {
    throw new Error(`${file}을(를) YAML로 읽지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isPlainObject(raw) || !Array.isArray(raw.devices) || !Array.isArray(raw.chapters) || !Array.isArray(raw.intro) || !isPlainObject(raw.source)) {
    throw new KitFormatError(file, ['맨 위에 source:·chapters:·intro:·devices: 가 모두 있어야 해요.']);
  }
  const problems: string[] = [];

  const str = (where: string, item: Record<string, unknown>, key: string, required = true): string => {
    const value = item[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
    if (required) {
      problems.push(`${where}: "${key}" 칸이 비었어요(글이어야 해요).`);
    }
    return '';
  };
  const optional = (where: string, item: Record<string, unknown>, key: string): string | undefined => {
    const value = item[key];
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
    problems.push(`${where}: "${key}" 칸은 글이어야 해요.`);
    return undefined;
  };
  const virtualOf = (where: string, item: Record<string, unknown>): KitVirtual => {
    const value = item.virtual;
    if (typeof value === 'string' && (KIT_VIRTUAL_VALUES as readonly string[]).includes(value)) {
      return value as KitVirtual;
    }
    problems.push(`${where}: "virtual" 칸은 full · partial · real-only 중 하나여야 해요.`);
    return 'real-only';
  };

  const sourceInfo = {
    name: str('source', raw.source, 'name'),
    url: str('source', raw.source, 'url'),
    fetched: str('source', raw.source, 'fetched'),
  };

  const chapters: KitChapter[] = [];
  for (const item of raw.chapters) {
    if (!isPlainObject(item) || typeof item.n !== 'number' || typeof item.name !== 'string' || item.name.trim() === '') {
      problems.push('chapters: { n: 번호, name: 이름 } 모양의 묶음이어야 해요.');
      continue;
    }
    chapters.push({ n: item.n, name: item.name });
  }
  const chapterNumbers = new Set(chapters.map((chapter) => chapter.n));
  for (let n = 1; n <= 8; n += 1) {
    if (!chapterNumbers.has(n)) {
      problems.push(`chapters: ${n}장 이름표가 없어요.`);
    }
  }

  const intro: KitIntroItem[] = [];
  for (const item of raw.intro) {
    if (!isPlainObject(item)) {
      problems.push('intro: { number, title, file, virtual … } 모양의 묶음이어야 해요.');
      continue;
    }
    const where = `intro ${typeof item.number === 'string' ? item.number : '?'}`;
    const virtualReason = optional(where, item, 'virtual_reason');
    const note = optional(where, item, 'note');
    intro.push({
      number: str(where, item, 'number'),
      title: str(where, item, 'title'),
      sub: str(where, item, 'sub'),
      file: str(where, item, 'file'),
      virtual: virtualOf(where, item),
      ...(virtualReason === undefined ? {} : { virtualReason }),
      ...(note === undefined ? {} : { note }),
    });
  }

  const devices: KitDevice[] = [];
  const seenIds = new Set<string>();
  const seenNumbers = new Set<string>();
  for (const [index, item] of raw.devices.entries()) {
    const where = isPlainObject(item) && typeof item.id === 'string' ? `"${item.id}"` : `${index + 1}번째 장치`;
    if (!isPlainObject(item)) {
      problems.push(`${where}: { id: …, name: … } 모양의 묶음이어야 해요.`);
      continue;
    }
    const id = str(where, item, 'id');
    const idMatch = KIT_DEVICE_ID.exec(id);
    if (id !== '' && !idMatch) {
      problems.push(`${where}: id는 d-<장>-<번호 두 자리>(예: d-3-11) 모양이어야 해요.`);
    }
    if (seenIds.has(id)) {
      problems.push(`${where}: id가 겹쳐요.`);
    }
    seenIds.add(id);
    const number = str(where, item, 'number');
    if (seenNumbers.has(number)) {
      problems.push(`${where}: number "${number}"가 겹쳐요.`);
    }
    seenNumbers.add(number);
    const chapter = typeof item.chapter === 'number' ? item.chapter : Number.NaN;
    if (!Number.isInteger(chapter) || chapter < 2 || chapter > 8) {
      problems.push(`${where}: chapter는 2~8 사이 숫자여야 해요.`);
    }
    if (idMatch && (Number(idMatch[1]) !== chapter || number !== `${idMatch[1]}.${idMatch[2]}`)) {
      problems.push(`${where}: id(${id})와 chapter·number(${chapter}, ${number})가 서로 맞지 않아요.`);
    }

    const wiring = Array.isArray(item.wiring) ? item.wiring.filter((line): line is string => typeof line === 'string' && line.trim() !== '') : [];
    if (wiring.length === 0) {
      problems.push(`${where}: wiring(배선 줄)이 비었어요.`);
    }
    const circuit = str(where, item, 'circuit');
    if (circuit !== '' && !/^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/u.test(circuit)) {
      problems.push(`${where}: circuit "${circuit}"는 영문 소문자·숫자·하이픈으로 된 .webp 파일 이름이어야 해요.`);
    }

    const steps: KitStep[] = [];
    if (!Array.isArray(item.steps) || item.steps.length === 0) {
      problems.push(`${where}: steps(1단계·2단계)가 비었어요.`);
    } else {
      for (const step of item.steps) {
        if (!isPlainObject(step) || typeof step.n !== 'number') {
          problems.push(`${where}: steps의 항목은 { n, kind, title, file, virtual } 모양이어야 해요.`);
          continue;
        }
        const stepWhere = `${where} ${step.n}단계`;
        steps.push({
          n: step.n,
          kind: str(stepWhere, step, 'kind'),
          title: str(stepWhere, step, 'title'),
          file: str(stepWhere, step, 'file'),
          virtual: virtualOf(stepWhere, step),
          points: Array.isArray(step.points) ? step.points.filter((point): point is string => typeof point === 'string' && point.trim() !== '') : [],
        });
      }
    }

    const libraries: KitLibrary[] = [];
    for (const library of Array.isArray(item.libraries) ? item.libraries : []) {
      if (!isPlainObject(library) || typeof library.site !== 'boolean') {
        problems.push(`${where}: libraries의 항목은 { name, file, site: true|false } 모양이어야 해요.`);
        continue;
      }
      const libraryWhere = `${where} 라이브러리`;
      const url = optional(libraryWhere, library, 'url');
      const note = optional(libraryWhere, library, 'note');
      if (!library.site && url === undefined) {
        problems.push(`${where}: 사이트가 싣지 않는 라이브러리 "${String(library.name)}"는 url(브릭셀 내려받기 주소)이 있어야 해요.`);
      }
      libraries.push({
        name: str(libraryWhere, library, 'name'),
        file: str(libraryWhere, library, 'file'),
        site: library.site,
        ...(url === undefined ? {} : { url }),
        ...(note === undefined ? {} : { note }),
      });
    }

    const variants: KitPartVariant[] = [];
    for (const variant of Array.isArray(item.part_variants) ? item.part_variants : []) {
      if (!isPlainObject(variant) || typeof variant.part !== 'string' || typeof variant.label !== 'string') {
        problems.push(`${where}: part_variants의 항목은 { part, label } 모양이어야 해요.`);
        continue;
      }
      variants.push({ part: variant.part, label: variant.label });
    }

    const support = item.support;
    if (typeof support !== 'string' || !(KIT_SUPPORT_VALUES as readonly string[]).includes(support)) {
      problems.push(`${where}: support는 A · B1 · B2 · C 중 하나여야 해요.`);
    }
    const virtual = virtualOf(where, item);
    const virtualReason = optional(where, item, 'virtual_reason');
    if (virtual !== 'full' && virtualReason === undefined) {
      problems.push(`${where}: 가상 보드에서 끝까지 되지 않는 장치는 virtual_reason(까닭)을 적어요.`);
    }
    const note = optional(where, item, 'note');

    devices.push({
      id,
      number,
      chapter,
      name: str(where, item, 'name'),
      nameEn: str(where, item, 'name_en'),
      description: str(where, item, 'description'),
      interface: str(where, item, 'interface'),
      pins: str(where, item, 'pins'),
      gpio: str(where, item, 'gpio'),
      part: str(where, item, 'part'),
      partVariants: variants,
      libraries,
      wiring,
      circuit,
      steps,
      support: (typeof support === 'string' ? support : 'C') as KitSupport,
      virtual,
      ...(virtualReason === undefined ? {} : { virtualReason }),
      ...(note === undefined ? {} : { note }),
    });
  }

  if (problems.length > 0) {
    throw new KitFormatError(file, problems);
  }
  return { source: sourceInfo, chapters, intro, devices };
}
