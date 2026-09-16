/**
 * examples/ 폴더의 .py 파일을 영상처리 실습실 예제 목록(LabExample[])으로 바꾼다(PLAN §8.2 P2-03, §2.5·§2.6 "새 차시 = md 1개 + py 1개").
 *
 * 영상처리 실습실 페이지(src/pages/labs/vision/index.astro)가 빌드 때 import.meta.glob으로 읽은 파일 내용을 이 함수에 넘긴다.
 * 그래서 새 예제는 examples/vision/(또는 examples/desktop/) 아래에 .py 파일 하나를 두는 것으로 [예제 불러오기] 목록에 들어간다(원칙 6).
 *
 * 읽는 폴더(VISION_EXAMPLE_DIRS): vision/(영상처리·손·얼굴·자세), desktop/(pyautogui 가상 데스크톱 — PLAN §2.5는 영상처리 실습실 예제로 둔다).
 *
 * 파일에서 읽는 것
 * - id: 파일 이름(확장자 없이). 영문 소문자·숫자·하이픈만(PD-09). 폴더가 있으면 "폴더-파일"로 잇는다(vision/u1/v4-blur-edge.py → u1-v4-blur-edge,
 *   desktop/01-screen-size.py → desktop-01-screen-size). vision/ 바로 아래 파일은 폴더 이름을 붙이지 않는다(first-edge).
 * - title·description·packages: ① 같은 이름의 사이드카(<이름>.meta.yaml — 원본에서 옮긴 예제, src/lab/controls/example-sidecar.ts)가 있으면 그것,
 *   ② 없으면 파일 머리말(첫 주석 줄 제목·둘째 줄 설명 — 사이트가 만든 예제, src/lab/controls/example-meta.ts), ③ 둘 다 없으면 파일 이름.
 * - file: examples/ 아래 경로(vision/first-edge.py). 차시 페이지의 [실습실에서 열기]가 붙이는 ?example= 값과 같다.
 * - packages: 사이드카에 적지 않았으면 opencv-python(numpy 포함)을 미리 받는다(영상처리 예제 기본값).
 * - group: [예제 불러오기] 선택 상자의 묶음 이름(폴더별, EXAMPLE_GROUPS). 묶음 순서도 이 표가 정한다.
 * 순서: 묶음(EXAMPLE_GROUPS 순서) → 파일 이름(숫자는 크기순). 사이트 예제(first-edge)가 맨 앞이다.
 *
 * 이 파일은 브라우저 번들(vision-lab.ts가 VISION_PACKAGES를 씀)에도 들어가므로 yaml 같은 빌드 전용 패키지를 import하지 않는다 —
 * 사이드카는 페이지가 readExampleSidecars로 미리 읽어 넘긴다.
 */
import { readExampleMeta } from '../controls/example-meta.ts';
import type { ExampleSidecar } from '../controls/example-sidecar.ts';
import type { LabExample } from '../controls/examples.ts';

/** examples/ 아래에서 영상처리 실습실이 읽는 폴더(첫 칸) */
export const VISION_EXAMPLE_DIRS: readonly string[] = Object.freeze(['vision', 'desktop']);

/** 예전 이름(다른 코드가 참고하던 값) */
export const VISION_EXAMPLES_DIR = 'vision';

/** 영상처리 예제가 실행 전에 미리 받는 Pyodide 패키지(pyodide-lock.json 기준 이름. opencv-python이 numpy를 함께 받는다) */
export const VISION_PACKAGES: readonly string[] = Object.freeze(['opencv-python']);

/**
 * [예제 불러오기] 선택 상자의 묶음(폴더 → 이름). 순서가 곧 목록 순서다.
 * 열쇠는 examples/ 아래 첫 두 칸(vision/u1)이거나 첫 칸(desktop). vision/ 바로 아래 파일은 'vision'.
 */
export const EXAMPLE_GROUPS: readonly { readonly key: string; readonly label: string }[] = Object.freeze([
  { key: 'vision', label: '첫 실습·사이트 예제' },
  { key: 'vision/u1', label: '1단원 교과서 실습' },
  { key: 'vision/opmp', label: 'OpenCV·MediaPipe 계단(교안)' },
  { key: 'desktop', label: '가상 데스크톱(pyautogui)' },
]);

/** glob 경로(/examples/vision/u1/a.py, ./a.py 등)에서 examples/ 아래 경로(vision/u1/a.py)를 뽑는다. 읽는 폴더가 아니면 null. */
export function exampleFileFromPath(globPath: string): string | null {
  const normalized = globPath.replace(/\\/gu, '/');
  for (const dir of VISION_EXAMPLE_DIRS) {
    const marker = `/${dir}/`;
    const at = normalized.lastIndexOf(marker);
    if (at >= 0) {
      return normalized.slice(at + 1);
    }
  }
  return null;
}

/** 파일 경로(vision/u1/v4-blur-edge.py) → 예제 id(u1-v4-blur-edge). desktop/a.py → desktop-a */
export function exampleIdFromFile(file: string): string {
  const parts = file.split('/');
  const withoutDir = parts[0] === VISION_EXAMPLES_DIR ? parts.slice(1) : parts;
  return withoutDir
    .join('-')
    .replace(/\.py$/u, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}

/** 파일 경로 → 묶음 열쇠(EXAMPLE_GROUPS의 key). 표에 없는 폴더는 첫 칸 이름 그대로(맨 뒤에 놓인다). */
export function exampleGroupKey(file: string): string {
  const parts = file.split('/');
  if (parts.length >= 3 && parts[0] === VISION_EXAMPLES_DIR) {
    return `${parts[0]}/${parts[1]}`;
  }
  return parts[0] ?? '';
}

/** 묶음 열쇠 → 사람이 읽는 이름(표에 없으면 열쇠 그대로) */
export function exampleGroupLabel(key: string): string {
  return EXAMPLE_GROUPS.find((group) => group.key === key)?.label ?? key;
}

/** 머리말의 제목과 한 줄 설명(example-meta.ts의 readExampleMeta 가운데 목록에 쓰는 두 가지). */
export function readExampleHeader(source: string): { title: string | null; description: string | null } {
  const { title, description } = readExampleMeta(source);
  return { title, description };
}

function groupOrder(key: string): number {
  const index = EXAMPLE_GROUPS.findIndex((group) => group.key === key);
  return index < 0 ? EXAMPLE_GROUPS.length : index;
}

/**
 * import.meta.glob 결과({ '/examples/vision/first-edge.py': '소스', … })를 예제 목록으로 바꾼다.
 * sidecars는 같은 glob 경로 열쇠로 미리 읽은 사이드카({ '/examples/vision/u1/a.py': 사이드카 }, readExampleSidecars).
 * 읽는 폴더(vision/·desktop/) 밖의 항목과 .py가 아닌 항목은 건너뛴다.
 */
export function visionExamplesFromFiles(
  files: Readonly<Record<string, string>>,
  sidecars: Readonly<Record<string, ExampleSidecar>> = {},
): LabExample[] {
  const examples: LabExample[] = [];
  for (const [globPath, source] of Object.entries(files)) {
    const file = exampleFileFromPath(globPath);
    if (!file || !file.endsWith('.py')) {
      continue;
    }
    const id = exampleIdFromFile(file);
    const sidecar = sidecars[globPath] ?? sidecars[globPath.replace(/\\/gu, '/')] ?? null;
    const header = readExampleHeader(source);
    const title = sidecar?.title ?? header.title ?? id;
    const description = sidecar?.description ?? header.description ?? null;
    const packages = sidecar?.packages ?? VISION_PACKAGES;
    examples.push({
      id,
      title,
      code: source,
      file,
      ...(description ? { description } : {}),
      packages,
      group: exampleGroupLabel(exampleGroupKey(file)),
    });
  }
  examples.sort((a, b) => {
    const keyA = exampleGroupKey(a.file ?? '');
    const keyB = exampleGroupKey(b.file ?? '');
    const orderA = groupOrder(keyA);
    const orderB = groupOrder(keyB);
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    if (keyA !== keyB) {
      return keyA.localeCompare(keyB, 'en');
    }
    return (a.file ?? '').localeCompare(b.file ?? '', 'en', { numeric: true });
  });
  return examples;
}
