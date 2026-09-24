/**
 * examples/esp32/ 폴더의 .py 파일을 ESP32 실습실 예제 목록(LabExample[])으로 바꾼다(PLAN §8.3 P3-01, §2.6 "새 차시 = md 1개 + py 1개").
 *
 * ESP32 실습실 페이지(src/pages/labs/esp32/index.astro)가 빌드 때 import.meta.glob으로 읽은 파일 내용을 넘긴다.
 * 새 예제 = examples/esp32/ 아래 .py 하나(원칙 6). 규칙은 영상처리 실습실 목록(src/lab/vision/examples.ts)과 같다:
 * - id: examples/esp32/ 뒤 경로를 하이픈으로 이은 것(esp32/first-blink.py → first-blink, esp32/u2/2-1-1-led.py → u2-2-1-1-led)
 * - 제목·설명: 사이드카(<이름>.meta.yaml) → 파일 머리말(첫 주석 줄·둘째 줄) → 파일 이름
 * - packages: 가상 보드는 Pyodide 코어만 쓴다(PD-04) — 미리 받을 패키지가 없다
 * - 묶음: ESP32_EXAMPLE_GROUPS(폴더별). esp32/lib/ 아래(보드 라이브러리 i2c_lcd.py 등, P3-04)는 예제가 아니라 목록에 넣지 않는다.
 * - parts(배선, P3-02): 차시 md frontmatter의 examples[].parts(페이지가 wiringByFile로 넘김) → 사이드카 parts → 파일 머리말 `# @part` 순서로
 *   처음 찾은 곳만 쓴다(src/lab/README.md 7.4). 틀린 줄은 빼고 까닭을 onWarning으로 알린다(빌드 경고만 — PD-35).
 * - practice(실습 방법, P3-02): 사이드카 practice → 머리말 "── 실습 방법 ──" 상자. 보드 그림 위에 "이 예제 실습 방법"으로 보인다.
 * 이 파일은 빌드(페이지)에서만 쓴다 — yaml 같은 빌드 전용 패키지는 import하지 않고 사이드카는 페이지가 미리 읽어 넘긴다.
 */
import { readExampleMeta } from '../controls/example-meta.ts';
import type { ExampleSidecar } from '../controls/example-sidecar.ts';
import type { LabExample } from '../controls/examples.ts';
import type { WiringEntry } from '../modules/board/part-types.ts';
import { normalizeWiringSpecs } from '../modules/board/wiring-spec.ts';
import type { ExampleLessonLinks } from '../vision/examples.ts';

export interface Esp32ExampleOptions {
  /** 차시 md frontmatter가 정한 배선: examples/ 뒤 경로(esp32/u2/a.py) → 배선 목록(이미 맞춘 모양) */
  readonly wiringByFile?: Readonly<Record<string, readonly WiringEntry[]>>;
  /** 배선 글을 읽다 뺀 줄의 까닭(페이지가 빌드 경고로 찍는다) */
  onWarning?(text: string): void;
}

export const ESP32_EXAMPLES_DIR = 'esp32';

/** 예제가 아닌 폴더(보드에 올리는 라이브러리) */
export const ESP32_LIBRARY_DIR = 'esp32/lib/';

/** [예제 불러오기] 묶음(폴더 → 이름). 순서가 곧 목록 순서다. 표에 없는 폴더는 맨 뒤에 폴더 이름 그대로. */
export const ESP32_EXAMPLE_GROUPS: readonly { readonly key: string; readonly label: string }[] = Object.freeze([
  { key: 'esp32', label: '첫 실습·사이트 예제' },
  { key: 'esp32/u2', label: '2단원 교과서 실습(피지컬 컴퓨팅)' },
  { key: 'esp32/u3', label: '3단원 교과서 실습(통신)' },
  { key: 'esp32/u4', label: '4단원 프로젝트 실습' },
  { key: 'esp32/bt', label: '블루투스 통신 수업교안 실습' },
  { key: 'esp32/templates', label: '통신 템플릿(베껴 쓰는 뼈대 코드)' },
  { key: 'esp32/hw', label: '부품 라이브러리 시험 코드' },
]);

/** glob 경로(/examples/esp32/a.py)에서 examples/ 아래 경로(esp32/a.py)를 뽑는다. esp32 폴더 밖·라이브러리 폴더면 null. */
export function esp32ExampleFileFromPath(globPath: string): string | null {
  const normalized = globPath.replace(/\\/gu, '/');
  const at = normalized.lastIndexOf(`/${ESP32_EXAMPLES_DIR}/`);
  if (at < 0) {
    return null;
  }
  const file = normalized.slice(at + 1);
  return file.startsWith(ESP32_LIBRARY_DIR) ? null : file;
}

/** esp32/u2/2-1-1-led.py → u2-2-1-1-led, esp32/first-blink.py → first-blink */
export function esp32ExampleIdFromFile(file: string): string {
  const parts = file.split('/');
  const withoutDir = parts[0] === ESP32_EXAMPLES_DIR ? parts.slice(1) : parts;
  return withoutDir
    .join('-')
    .replace(/\.py$/u, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

export function esp32ExampleGroupKey(file: string): string {
  const parts = file.split('/');
  return parts.length >= 3 ? `${parts[0]}/${parts[1]}` : (parts[0] ?? '');
}

function groupOrder(key: string): number {
  const index = ESP32_EXAMPLE_GROUPS.findIndex((group) => group.key === key);
  return index < 0 ? ESP32_EXAMPLE_GROUPS.length : index;
}

function groupLabel(key: string): string {
  return ESP32_EXAMPLE_GROUPS.find((group) => group.key === key)?.label ?? key;
}

/** import.meta.glob 결과를 ESP32 실습실 예제 목록으로 바꾼다(사이트 예제가 맨 앞, 폴더 → 파일 이름(숫자는 크기순)). */
export function esp32ExamplesFromFiles(
  files: Readonly<Record<string, string>>,
  sidecars: Readonly<Record<string, ExampleSidecar>> = {},
  lessons: ExampleLessonLinks = {},
  options: Esp32ExampleOptions = {},
): LabExample[] {
  const examples: LabExample[] = [];
  for (const [globPath, source] of Object.entries(files)) {
    const file = esp32ExampleFileFromPath(globPath);
    if (!file || !file.endsWith('.py')) {
      continue;
    }
    const id = esp32ExampleIdFromFile(file);
    const sidecar = sidecars[globPath] ?? sidecars[globPath.replace(/\\/gu, '/')] ?? null;
    const meta = readExampleMeta(source);
    const description = sidecar?.description ?? meta.description ?? null;
    const lessonSlug = sidecar?.lesson ?? meta.lesson ?? null;
    const lesson = lessons.byFile?.[file] ?? (lessonSlug === null ? null : (lessons.bySlug?.[lessonSlug] ?? null));
    let parts: readonly WiringEntry[] = [];
    const fromLesson = options.wiringByFile?.[file];
    if (fromLesson && fromLesson.length > 0) {
      parts = fromLesson;
    } else if (sidecar?.parts && sidecar.parts.length > 0) {
      parts = sidecar.parts;
      for (const error of sidecar.partErrors ?? []) {
        options.onWarning?.(`examples/${file}: ${error}`);
      }
    } else if (meta.parts.length > 0) {
      const normalized = normalizeWiringSpecs(meta.parts, `examples/${file} 머리말 # @part`);
      parts = normalized.entries;
      for (const error of normalized.errors) {
        options.onWarning?.(error);
      }
    }
    const practice = sidecar?.practice && sidecar.practice.length > 0 ? sidecar.practice : meta.practice;
    examples.push({
      id,
      title: sidecar?.title ?? meta.title ?? id,
      code: source,
      file,
      ...(description ? { description } : {}),
      ...(sidecar?.packages && sidecar.packages.length > 0 ? { packages: sidecar.packages } : {}),
      group: groupLabel(esp32ExampleGroupKey(file)),
      ...(lesson ? { lesson } : {}),
      ...(parts.length > 0 ? { parts } : {}),
      ...(practice.length > 0 ? { practice } : {}),
    });
  }
  examples.sort((a, b) => {
    const keyA = esp32ExampleGroupKey(a.file ?? '');
    const keyB = esp32ExampleGroupKey(b.file ?? '');
    const order = groupOrder(keyA) - groupOrder(keyB);
    if (order !== 0) {
      return order;
    }
    if (keyA !== keyB) {
      return keyA.localeCompare(keyB, 'en');
    }
    return (a.file ?? '').localeCompare(b.file ?? '', 'en', { numeric: true });
  });
  return examples;
}
