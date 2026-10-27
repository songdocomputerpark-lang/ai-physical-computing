/**
 * 실습실 예제 목록의 모양(PLAN §8.2 P2-02 "[예제 불러오기]", §2.6 "새 차시 = md 1개 + py 1개").
 *
 * 실습실 화면(src/components/lab/LabShell.astro)은 이 모양의 목록을 받아 [예제 불러오기] 선택 상자를 채우고,
 * 자동 저장 이름(editor:<실습실>:<예제 id>)과 [.py 내려받기] 파일 이름을 예제 id·file로 만든다.
 * P2-02(코드 에디터)에서는 실제 실습실 예제가 아직 없어 목록이 비어 있다. P2-03부터 examples/ 폴더의 .py 파일을
 * 페이지가 읽어(import.meta.glob) 이 모양으로 넘기면, 새 예제는 .py 파일 하나를 더하는 것으로 목록에 들어간다(원칙 6).
 *
 * 규칙
 * - id: 영문 소문자·숫자·하이픈(PD-09). 저장 이름의 일부가 되므로 storage.ts 규칙에도 맞는다. 목록 안에서 겹치지 않는다.
 * - file: examples/ 아래 경로(예: vision/u1/1-2-1-flip.py). 차시 페이지의 [실습실에서 열기]가 붙이는 ?example= 값과 같다.
 * - code: 예제 원래 코드. [초기화]가 이 코드로 되돌린다.
 * - packages: 실행 전에 미리 받을 Pyodide 패키지 이름(pyodide-lock.json 기준, 예: opencv-python). import 문 분석과 별개다.
 */
import type { WiringEntry } from '../modules/board/part-types.ts';

/** 교과서 코드와 달라진 기록(판 1.8.0 — 최신 판 라이브러리로 다시 쓴 예제, 사이드카 revised) */
export interface ExampleRevision {
  /** 고친 날(2026-10-26 모양) */
  readonly date: string;
  /** 고친 사이트 판(예: 1.8.0) */
  readonly version: string;
  /** 무엇이 달라졌는지 한 문장 */
  readonly note: string;
}

/** 실습실 예제 설명 아래 줄의 글: "원본 코드와 달라요 — 2026년 10월 26일 고침(사이트 판 1.8.0). …"(원본이 교과서인지 교안인지는 note가 말한다) */
export function exampleRevisionText(revision: ExampleRevision | undefined): string {
  if (!revision) {
    return '';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(revision.date);
  const when = match ? `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일` : revision.date;
  return `원본 코드와 달라요 — ${when} 고침(사이트 판 ${revision.version}). ${revision.note}`;
}

export interface LabExample {
  /** 영문 소문자·숫자·하이픈 식별자. 저장 이름·공유 링크(ex=)에 쓴다. */
  readonly id: string;
  /** 선택 상자에 보이는 이름 */
  readonly title: string;
  /** 예제 원래 코드([초기화]의 기준) */
  readonly code: string;
  /** examples/ 아래 경로(선택). 차시 링크의 ?example= 값과 같다. */
  readonly file?: string;
  /** 한 줄 설명(선택) */
  readonly description?: string;
  /** 실행 전에 미리 받을 Pyodide 패키지 이름(선택) */
  readonly packages?: readonly string[];
  /** [예제 불러오기] 선택 상자에서 묶어 보일 이름(선택, optgroup). 같은 이름끼리 목록 순서대로 묶인다. */
  readonly group?: string;
  /**
   * 이 예제가 나오는 차시(선택). 예제 머리말 `# @lesson v4`나 사이드카 lesson 값을 페이지가 실제 차시 주소로 바꿔 넣는다.
   * 실습실 위에 "이 예제가 나오는 차시" 링크가 생겨, 차시에서 [실습실에서 열기]로 넘어온 학생이 되돌아갈 수 있다(2026-09-17 검토 반영).
   */
  readonly lesson?: { readonly href: string; readonly label: string };
  /**
   * (판 1.6.0 C176) 이 예제가 나오는 키트 장치 쪽(배선표·회로 그림이 있는 /labs/esp32/kit/<id>/). 실습실 위에 "이 장치의 배선표·회로 그림" 링크가 생겨,
   * 키트 도감에서 코드를 열어 온 학생이 배선을 보러 돌아갈 길이 글로만 있던 것을 고친다(걷기 보고 walk-kit-user 5). 키트 도감 예제(사이드카 kit.device)만 있다.
   */
  readonly device?: { readonly href: string; readonly label: string };
  /**
   * (판 1.6.0 C176) 키트 장치 도감의 다음 단계 예제(1단계 → 2단계). 실습실 예제 설명 줄 옆에 "다음 단계: 2단계 · … →" 링크가 생긴다(걷기 보고 walk-kit-user 83) —
   * 누르면 이 실습실에서 그 예제를 바로 연다(id로 loadExample, href는 스크립트가 안 돌 때를 위한 주소). 마지막 단계에는 없다.
   */
  readonly nextStep?: { readonly id: string; readonly href: string; readonly label: string };
  /**
   * ESP32 실습실 예제의 배선(선택, PD-05 "예제별 배선"). 가상 보드가 이 부품들을 그리고 선을 긋고 파이썬에 알린다
   * (src/lab/modules/board/part-types.ts WiringEntry — 보드에 붙은 내장 LED·BOOT 버튼은 적지 않아도 늘 있다).
   * 페이지가 차시 md frontmatter → 사이드카 → 예제 머리말 `# @part` 순서로 채운다(src/lab/esp32/examples.ts, README 7.4).
   */
  readonly parts?: readonly WiringEntry[];
  /** 실습 방법 단계(선택, P3-02): 사이드카 practice → 머리말 "실습 방법" 상자. ESP32 실습실이 보드 그림 위에 보인다 */
  readonly practice?: readonly string[];
  /** (판 1.8.0 — C234) 원본(교과서·교안) 코드와 달라진 기록: 사이드카 revised. 한 줄 설명 아래에 "원본 코드와 달라요 — 고친 날"로 보인다 */
  readonly revised?: ExampleRevision;
  /**
   * (판 1.5.0) 고를 때 받는 예제: code는 빈 글자이고 코드·설명·배선은 이 주소의 JSON에서 받는다(src/lab/controls/lazy-examples.ts).
   * 키트 장치 도감 예제가 ESP32 실습실 HTML을 키우지 않게 한다(DECISIONS C15·C151). 받은 뒤에는 이 칸이 없는 보통 예제로 바뀐다.
   */
  readonly codeUrl?: string;
  /**
   * (판 1.6.0 C176) 가상 보드에서 되는 정도 — 사이드카 `virtual: partial | real-only`(키트 장치 도감 예제). 적지 않으면(교과서·이관 예제 전부) 가상 보드에서 끝까지 된다.
   * real-only면 가상 보드 탭에서 [실행]이 회색이 되고 까닭 안내 줄이 보이며, partial이면 노란 안내만 보인다(lab-shell.ts #paintRunBlock).
   * 실행 대상(실제 보드)을 고르면 둘 다 보이지 않는다.
   */
  readonly virtual?: ExampleVirtual;
}

/** 가상 보드에서 끝까지 되지 않는 정도(끝까지 되는 예제는 적지 않는다) */
export type ExampleVirtual = 'partial' | 'real-only';

/** 알 수 없는 글을 ExampleVirtual로(아니면 undefined) */
export function exampleVirtualOf(value: unknown): ExampleVirtual | undefined {
  return value === 'partial' || value === 'real-only' ? value : undefined;
}

/** 예제 id 모양 */
export const EXAMPLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

/** examples/ 아래 경로 모양(자리 페이지 _LabPlaceholder.astro의 ?example= 검사와 같은 규칙) */
export const EXAMPLE_FILE_PATTERN = /^[\w./-]{1,200}\.py$/u;

/** 예제를 고르지 않았을 때 자동 저장에 쓰는 이름 */
export const SCRATCH_EXAMPLE_ID = 'scratch';

/** 예제가 없을 때 처음 보이는 코드 */
export const DEFAULT_SCRATCH_CODE = "print('안녕')\n";

/** 예제가 없을 때의 내려받기 파일 이름 */
export const DEFAULT_FILE_NAME = 'main.py';

/** examples/ 경로가 규칙에 맞는지(".."이 없고 .py로 끝나는지) */
export function isValidExampleFile(file: string): boolean {
  return typeof file === 'string' && EXAMPLE_FILE_PATTERN.test(file) && !file.split('/').includes('..');
}

/** 예제 목록의 문제를 한국어로 돌려준다(없으면 빈 목록). 페이지를 만들 때 assertValidExamples()가 이 결과로 빌드를 멈춘다. */
export function validateExamples(examples: readonly LabExample[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  examples.forEach((example, index) => {
    const where = `${index + 1}번째 예제`;
    if (typeof example.id !== 'string' || !EXAMPLE_ID_PATTERN.test(example.id) || example.id === SCRATCH_EXAMPLE_ID) {
      errors.push(`${where}: id "${String(example.id)}"은(는) 영문 소문자·숫자·하이픈만 쓰고 "${SCRATCH_EXAMPLE_ID}"는 쓸 수 없어요.`);
    } else if (seen.has(example.id)) {
      errors.push(`${where}: id "${example.id}"이(가) 앞의 예제와 겹쳐요.`);
    } else {
      seen.add(example.id);
    }
    if (typeof example.title !== 'string' || example.title.trim() === '') {
      errors.push(`${where}: title(이름)을 적어요.`);
    }
    if (typeof example.code !== 'string') {
      errors.push(`${where}: code(예제 코드)는 글자여야 해요.`);
    }
    if (example.file !== undefined && !isValidExampleFile(example.file)) {
      errors.push(`${where}: file "${String(example.file)}"은(는) examples/ 아래 .py 경로여야 해요(예: vision/u1/1-2-1-flip.py).`);
    }
    if (example.codeUrl !== undefined) {
      // 고를 때 받는 예제(판 1.5.0): 사이트 안 주소(/로 시작)이고, 코드를 HTML에 함께 심지 않는다
      if (typeof example.codeUrl !== 'string' || !example.codeUrl.startsWith('/') || example.codeUrl.startsWith('//')) {
        errors.push(`${where}: codeUrl "${String(example.codeUrl)}"은(는) /로 시작하는 사이트 안 주소여야 해요(withBase()로 만들어요).`);
      }
      if (example.code !== '') {
        errors.push(`${where}: codeUrl이 있는 예제는 code를 빈 글자로 둬요(코드는 그 주소에서 받아요).`);
      }
    }
  });
  return errors;
}

/** 목록에 문제가 있으면 오류를 던진다(빌드가 멈춰 바로 알 수 있게). */
export function assertValidExamples(examples: readonly LabExample[]): void {
  const errors = validateExamples(examples);
  if (errors.length > 0) {
    throw new Error(`실습실 예제 목록에 문제가 있어요.\n${errors.map((error) => `- ${error}`).join('\n')}`);
  }
}

export function findExample(examples: readonly LabExample[], id: string | null | undefined): LabExample | undefined {
  return id ? examples.find((example) => example.id === id) : undefined;
}

export function findExampleByFile(examples: readonly LabExample[], file: string | null | undefined): LabExample | undefined {
  return file ? examples.find((example) => example.file === file) : undefined;
}

/** [.py 내려받기] 파일 이름: 예제 file의 마지막 부분, 없으면 "<id>.py", 예제가 없으면 main.py */
export function exampleFileName(example: LabExample | null | undefined): string {
  if (!example) {
    return DEFAULT_FILE_NAME;
  }
  if (example.file) {
    const base = example.file.split('/').pop();
    if (base) {
      return base;
    }
  }
  return `${example.id}.py`;
}
