/**
 * 차시·교과서 쪽의 준비물 사진 줄에 넘길 부품 목록을 만든다 — **빌드 전용**(.astro 프런트매터에서만 import, 판 1.4.0 C136).
 * 예제 사이드카(examples/**\/*.meta.yaml)를 Vite의 ?raw로 한 번 읽어 두고(예제 실습실·갤러리가 쓰는 규칙과 같다, src/lab/controls/example-sidecar.ts),
 * 차시 frontmatter의 예제 목록을 collectExamplePartRefs(lesson-parts.ts)에 넣는다. yaml 패키지가 브라우저 번들에 들어가면 출처 검사가 실패하므로 <script>에서는 쓰지 않는다.
 */
import { readExampleSidecars } from '../../lab/controls/example-sidecar.ts';
import { collectExamplePartRefs, type ExampleLike, type PartRef } from './lesson-parts.ts';

const sidecarFiles = import.meta.glob<string>('/examples/**/*.meta.yaml', { query: '?raw', eager: true, import: 'default' });
const sidecars = readExampleSidecars(sidecarFiles);

/** 예제 목록(차시 frontmatter examples)이 쓰는 가상 보드 부품 목록 — PartPhotoStrip의 parts 속성에 그대로 넘긴다. 부품이 없으면 빈 목록. */
export function lessonPartRefs(examples: readonly ExampleLike[]): PartRef[] {
  return collectExamplePartRefs(examples, (file) => sidecars[`/examples/${file}`]?.parts ?? undefined);
}
