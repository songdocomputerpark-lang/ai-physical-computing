/**
 * 회로 그림 목록(scripts/circuits/circuits.yaml)의 칸 규칙과 순수 함수(판 1.4.0 C5, DECISIONS O17·C136·C137).
 *
 * 키트 업체(고릴라셀·브릭셀)의 회로 구성 도구로 그린 차시별 배선 그림 23장의 이름·핀·캡션·대체 글·그림 크기를 한 파일에서 읽는다.
 * 그림을 만들고 목록을 고치는 쪽(npm run circuits:build·export·import)과 목록을 화면에 그리는 쪽(교과서 쪽의 ::회로[id]·웹 차시의 접기·보드 준비 쪽)이
 * 같은 목록을 본다. 이 파일은 목록을 **읽기만** 하고 그림 파일을 열지 않는다(그림 파일과 목록의 sha256 대조는 npm run circuits:import -- --check와 tests/unit/circuits/가 맡는다).
 *
 * 빌드·테스트 전용: YAML 파서(`yaml`)를 쓰므로 .astro 프런트매터·scripts/lib/check-book.mjs·Node 테스트에서만 import한다.
 * 브라우저로 가는 코드(<script>)에서는 import하지 않는다 — yaml 패키지가 번들에 들어가면 출처 검사가 실패한다(parts-schema.ts와 같은 규칙).
 *
 * 쓰는 곳: circuits-data.ts(빌드 때 파일을 읽음), book-html.ts(::회로 자리 표시 → 그림), CircuitFigure.astro·CircuitDetails.astro(웹 차시·보드 준비 쪽),
 * scripts/lib/check-book.mjs(모르는 번호면 check:book 오류).
 */
import YAML from 'yaml';

/** 목록 파일의 저장소 경로(문서·테스트가 같은 값을 쓴다) */
export const CIRCUITS_FILE = 'scripts/circuits/circuits.yaml';

/** 그림 파일이 놓이는 폴더의 사이트 안 경로(앞에 /, base 없음). 저장소에서는 public/ 아래다 — sources.yaml의 키트 업체 항목이 이 폴더를 덮는다 */
export const CIRCUITS_IMAGE_URL_DIR = '/images/circuits/third-party/kit-vendor';

/** 그림 번호의 모양: "<차시 번호>-<그림 번호>" — 2-1-2-1, 4-2-2-2 */
export const CIRCUIT_ID_PATTERN = /^([1-4]-[1-9]-[1-9])-([1-9]\d?)$/u;

/** 부품 id → 학생에게 보일 이름(회로 목록의 parts[].part와 같은 id — 가상 보드 부품 폴더 이름) */
export const CIRCUIT_PART_LABEL: Readonly<Record<string, string>> = Object.freeze({
  'lcd-i2c': 'LCD',
  'oled-i2c': 'OLED',
  'touch-digital': '터치 센서',
  'touch-analog-4ch': '4채널 터치 센서',
  'rgb-led': 'RGB LED',
  laser: '레이저',
  neopixel: '네오픽셀',
  buzzer: '버저',
  mp3: 'MP3 플레이어',
  'fan-motor': '팬 모터',
  servo: '서보모터',
  'uart-converter': 'USB-UART 변환기',
});

/** 검사를 마친 회로 그림 한 장 */
export interface CircuitFigure {
  /** 2-1-2-1 */
  readonly id: string;
  /** 짝 웹 차시 번호(label) — 2-1-2 */
  readonly lesson: string;
  /** 출판본에서 이 배선을 그린 쪽 */
  readonly textbookPage: number;
  /** 그림 제목("LCD 연결") — 접기 안 목록·쪽 낭독에 쓴다 */
  readonly title: string;
  /** 그림 설명 한 줄 */
  readonly caption: string;
  /** 그림을 못 보는 사람이 읽을 대체 글 */
  readonly alt: string;
  /** 그림 파일(저장소 뿌리 기준 — public/images/circuits/…/<id>.webp) */
  readonly file: string;
  readonly width: number;
  readonly height: number;
  /** 이 그림이 그리는 부품(id)들 */
  readonly parts: readonly string[];
  /** 그림에 그리지 못한 연결이 있으면 그 안내(같은 차시의 마지막 그림에만 붙는다) */
  readonly undrawnNote?: string;
}

/** 목록 전체 */
export interface CircuitList {
  /** 캡션 맨 끝에 붙는 고정 문장 */
  readonly captionNote: string;
  readonly figures: readonly CircuitFigure[];
}

/** 목록 파일의 문제 목록을 담은 오류 */
export class CircuitsFormatError extends Error {
  readonly problems: readonly string[];

  constructor(file: string, problems: readonly string[]) {
    super(`${file}에 고칠 곳이 ${problems.length}군데 있어요.\n- ${problems.join('\n- ')}`);
    this.name = 'CircuitsFormatError';
    this.problems = problems;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 그림 파일 경로의 모양(저장소 뿌리 기준) */
const IMAGE_FILE_PATTERN = /^public\/images\/circuits\/third-party\/kit-vendor\/([^/]+)\.webp$/u;

/**
 * 목록의 그림 파일 경로(public/images/…)를 사이트 안 주소(/images/…)로. base는 붙이지 않는다 — 마크다운 출력은 rewriteRootRelativeUrls가,
 * .astro 부품은 withBase()가 붙인다.
 */
export function circuitImageUrl(figure: Pick<CircuitFigure, 'file'>): string {
  return figure.file.replace(/^public(?=\/)/u, '');
}

/**
 * YAML 글자를 읽어 검사한 회로 그림 목록을 돌려준다. 어긋난 곳은 모아서 CircuitsFormatError 하나로 던진다.
 * 검사: figures 목록·id 모양과 겹침·차시 번호가 id 앞머리와 같은지·필수 글 칸·그림 파일 경로가 id와 맞는지·그림 크기와 `image` 기록 여부.
 * 그림이 아직 만들어지지 않은 항목(image 칸 없음)은 오류다 — 사이트는 그림 없는 칸을 그리지 않는다(circuits:import로 먼저 채워요).
 */
export function parseCircuitsYaml(source: string, file: string = CIRCUITS_FILE): CircuitList {
  let raw: unknown;
  try {
    raw = YAML.parse(source);
  } catch (error) {
    throw new Error(`${file}을(를) YAML로 읽지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isPlainObject(raw) || !Array.isArray(raw.figures)) {
    throw new CircuitsFormatError(file, ['맨 위에 figures: 목록이 있어야 해요.']);
  }

  const problems: string[] = [];
  const captionNote = typeof raw.caption_note === 'string' ? raw.caption_note.trim() : '';
  if (captionNote === '') {
    problems.push('맨 위의 caption_note(캡션 끝에 붙는 고정 문장)가 비었어요.');
  }

  const figures: CircuitFigure[] = [];
  const seen = new Set<string>();
  raw.figures.forEach((item: unknown, index: number) => {
    const where = isPlainObject(item) && typeof item.id === 'string' ? `"${item.id}"` : `${index + 1}번째 그림`;
    if (!isPlainObject(item)) {
      problems.push(`${where}: { id: …, lesson: … } 모양의 묶음이어야 해요.`);
      return;
    }
    const text = (key: string): string | undefined => {
      const value = item[key];
      if (typeof value !== 'string' || value.trim() === '') {
        problems.push(`${where}: "${key}"은 글(비어 있지 않은 문자열)이어야 해요.`);
        return undefined;
      }
      return value.trim();
    };

    const id = text('id');
    const idMatch = id === undefined ? null : CIRCUIT_ID_PATTERN.exec(id);
    if (id !== undefined) {
      if (!idMatch) problems.push(`${where}: id는 "<차시 번호>-<번호>" 모양(예: 2-1-2-1)이어야 해요.`);
      if (seen.has(id)) problems.push(`${where}: id가 다른 그림과 겹쳐요.`);
      seen.add(id);
    }
    const lesson = text('lesson');
    if (lesson !== undefined && idMatch && idMatch[1] !== lesson) {
      problems.push(`${where}: lesson(${lesson})이 id의 차시 번호(${idMatch[1]})와 달라요.`);
    }
    const title = text('title');
    const caption = text('caption');
    const alt = text('alt');
    const page = item.textbook_page;
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) {
      problems.push(`${where}: textbook_page는 출판본 쪽 번호(자연수)여야 해요.`);
    }
    const parts = Array.isArray(item.parts) ? item.parts.flatMap((entry: unknown) => (isPlainObject(entry) && typeof entry.part === 'string' ? [entry.part] : [])) : [];
    if (parts.length === 0) {
      problems.push(`${where}: parts에 그리는 부품이 하나는 있어야 해요.`);
    }

    const image = item.image;
    let imageFile: string | undefined;
    let width = 0;
    let height = 0;
    if (!isPlainObject(image)) {
      problems.push(`${where}: image 칸이 없어요. npm run circuits:import로 그림을 만들어 채워요.`);
    } else {
      imageFile = typeof image.file === 'string' ? image.file : undefined;
      width = typeof image.width === 'number' ? image.width : 0;
      height = typeof image.height === 'number' ? image.height : 0;
      const fileMatch = imageFile === undefined ? null : IMAGE_FILE_PATTERN.exec(imageFile);
      if (!fileMatch) {
        problems.push(`${where}: image.file은 public/images/circuits/third-party/kit-vendor/<id>.webp 모양이어야 해요.`);
      } else if (id !== undefined && fileMatch[1] !== id) {
        problems.push(`${where}: image.file의 이름(${fileMatch[1]})이 id와 달라요.`);
      }
      if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
        problems.push(`${where}: image.width·height는 그림 크기(자연수)여야 해요.`);
      }
    }

    if (id !== undefined && lesson !== undefined && title !== undefined && caption !== undefined && alt !== undefined && imageFile !== undefined && idMatch) {
      figures.push({
        id,
        lesson,
        textbookPage: typeof page === 'number' ? page : 0,
        title,
        caption,
        alt,
        file: imageFile,
        width,
        height,
        parts,
      });
    }
  });

  if (figures.length === 0 && problems.length === 0) {
    problems.push('그림이 하나도 없어요.');
  }
  if (problems.length > 0) {
    throw new CircuitsFormatError(file, problems);
  }

  // 그리지 못한 연결(undrawable)은 그 차시의 마지막 그림에 안내로 붙인다
  const undrawable = Array.isArray(raw.undrawable) ? raw.undrawable.filter(isPlainObject) : [];
  const lastOfLesson = new Map<string, string>();
  for (const figure of figures) {
    lastOfLesson.set(figure.lesson, figure.id);
  }
  const withNotes = figures.map((figure) => {
    if (lastOfLesson.get(figure.lesson) !== figure.id) {
      return figure;
    }
    const missing = undrawable.filter((entry) => entry.lesson === figure.lesson);
    const note = undrawnNoteText(figure, missing);
    return note === undefined ? figure : { ...figure, undrawnNote: note };
  });
  return { captionNote, figures: withNotes };
}

/** 그림에 그리지 못한 연결의 안내 글. 그리지 못한 것이 없으면 undefined */
function undrawnNoteText(figure: CircuitFigure, missing: readonly Record<string, unknown>[]): string | undefined {
  const names = missing.flatMap((entry) => {
    const part = typeof entry.part === 'string' ? (CIRCUIT_PART_LABEL[entry.part] ?? entry.part) : undefined;
    const pins = isPlainObject(entry.pins) ? Object.values(entry.pins).filter((value): value is number => typeof value === 'number') : [];
    if (part === undefined) {
      return [];
    }
    return [pins.length > 0 ? `${part}(${pins.map((pin) => `${pin}번 핀`).join('·')})` : part];
  });
  if (names.length === 0) {
    return undefined;
  }
  return `이 그림에 없는 연결: ${names.join(', ')}. 그림 도구의 보드에는 그 핀 자리가 없어서 그리지 못했어요. 교과서 ${figure.textbookPage}쪽 그림을 따라 연결해요.`;
}

/** 번호로 그림 하나(없으면 undefined) */
export function findCircuit(list: CircuitList, id: string): CircuitFigure | undefined {
  return list.figures.find((figure) => figure.id === id);
}

/** 한 차시(label, 예: "2-1-2")의 그림들 — 목록의 차례 그대로 */
export function circuitsForLesson(list: CircuitList, label: string): CircuitFigure[] {
  return list.figures.filter((figure) => figure.lesson === label);
}
