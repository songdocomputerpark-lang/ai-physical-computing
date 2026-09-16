/**
 * examples/vision/ 폴더의 .py 파일을 실습실 예제 목록(LabExample[])으로 바꾼다(PLAN §8.2 P2-03, §2.6 "새 차시 = md 1개 + py 1개").
 *
 * 영상처리 실습실 페이지(src/pages/labs/vision/index.astro)가 빌드 때 import.meta.glob으로 읽은 파일 내용을 이 함수에 넘긴다.
 * 그래서 새 예제는 examples/vision/ 아래에 .py 파일 하나를 두는 것으로 [예제 불러오기] 목록에 들어간다(원칙 6, 코드 수정 없음).
 *
 * 파일에서 읽는 것(머리말 규약은 src/lab/controls/example-meta.ts·src/lab/README.md)
 * - id: 파일 이름(확장자 없이). 영문 소문자·숫자·하이픈만(PD-09). 하위 폴더가 있으면 "폴더-파일"로 잇는다(u1/v4-blur-edge.py → u1-v4-blur-edge).
 * - title: 머리말의 첫 주석 줄("# 첫 실습: …")에서 "# "을 뗀 글. 머리말이 없으면 파일 이름.
 * - description: 머리말의 둘째 주석 줄(한 줄 설명). "# @slider"·"# @lesson" 같은 규약 주석은 제목·설명으로 쓰지 않는다.
 * - file: examples/ 아래 경로(vision/first-edge.py). 차시 페이지의 [실습실에서 열기]가 붙이는 ?example= 값과 같다.
 * - packages: 영상처리 예제는 모두 OpenCV를 쓰므로 opencv-python(numpy 포함)을 미리 받는다.
 * 순서: 폴더 없는 파일 → 폴더 이름 → 파일 이름(숫자는 크기순).
 */
import { readExampleMeta } from '../controls/example-meta.ts';
import type { LabExample } from '../controls/examples.ts';

/** examples/ 아래에서 영상처리 실습실이 읽는 폴더 */
export const VISION_EXAMPLES_DIR = 'vision';

/** 영상처리 예제가 실행 전에 미리 받는 Pyodide 패키지(pyodide-lock.json 기준 이름. opencv-python이 numpy를 함께 받는다) */
export const VISION_PACKAGES: readonly string[] = Object.freeze(['opencv-python']);

/** glob 경로(/examples/vision/u1/a.py, ./a.py 등)에서 examples/ 아래 경로(vision/u1/a.py)를 뽑는다. */
export function exampleFileFromPath(globPath: string): string | null {
  const normalized = globPath.replace(/\\/gu, '/');
  const marker = `/${VISION_EXAMPLES_DIR}/`;
  const at = normalized.lastIndexOf(marker);
  if (at < 0) {
    return null;
  }
  return normalized.slice(at + 1);
}

/** 파일 경로(vision/u1/v4-blur-edge.py) → 예제 id(u1-v4-blur-edge) */
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

/** 머리말의 제목과 한 줄 설명(example-meta.ts의 readExampleMeta 가운데 목록에 쓰는 두 가지). */
export function readExampleHeader(source: string): { title: string | null; description: string | null } {
  const { title, description } = readExampleMeta(source);
  return { title, description };
}

function sortKey(file: string): [number, string] {
  const parts = file.split('/');
  const depth = parts.length;
  return [depth, file];
}

/**
 * import.meta.glob 결과({ '/examples/vision/first-edge.py': '소스', … })를 예제 목록으로 바꾼다.
 * 경로에 vision/ 폴더가 없는 항목은 건너뛴다.
 */
export function visionExamplesFromFiles(files: Readonly<Record<string, string>>): LabExample[] {
  const examples: LabExample[] = [];
  for (const [globPath, source] of Object.entries(files)) {
    const file = exampleFileFromPath(globPath);
    if (!file || !file.endsWith('.py')) {
      continue;
    }
    const id = exampleIdFromFile(file);
    const header = readExampleHeader(source);
    examples.push({
      id,
      title: header.title ?? id,
      code: source,
      file,
      ...(header.description ? { description: header.description } : {}),
      packages: VISION_PACKAGES,
    });
  }
  examples.sort((a, b) => {
    const [depthA, fileA] = sortKey(a.file ?? '');
    const [depthB, fileB] = sortKey(b.file ?? '');
    if (depthA !== depthB) {
      return depthA - depthB;
    }
    return fileA.localeCompare(fileB, 'en', { numeric: true });
  });
  return examples;
}
