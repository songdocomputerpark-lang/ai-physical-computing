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
