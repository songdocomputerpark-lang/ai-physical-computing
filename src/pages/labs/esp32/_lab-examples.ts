/**
 * ESP32 실습실 예제 목록 만들기(빌드 전용 — 실습실 페이지 index.astro와 키트 예제 JSON 파일 kit-code/[...file].json.ts가 함께 쓴다).
 * 파일 이름이 _로 시작해 쪽(route)이 아니다.
 *
 * 예제: examples/esp32/ 아래 .py(보드 라이브러리 폴더 esp32/lib/ 제외)를 빌드 때 모두 읽는다(src/lab/esp32/examples.ts).
 * 차시로 돌아가는 링크(frontmatter examples[].file → 사이드카·머리말 @lesson)와 차시 md의 배선(examples[].parts)도 여기서 붙인다.
 *
 * (판 1.5.0) 키트 장치 도감 예제(examples/esp32/kit/)는 고를 때 받는다: 실습실 HTML에는 목록 자리(id·제목·파일·묶음·받을 주소)만 심고,
 * 코드·설명·배선·실습 방법은 `<base>/labs/esp32/kit-code/<장>/<이름>.json`으로 따로 만든다(splitLazyEsp32Examples, DECISIONS C15·C151).
 * 받을 주소 끝의 `?v=<사이트 판>`은 서비스 워커의 static 캐시(먼저 주고 뒤에서 새로 받음 — 검색어까지 열쇠)가 판이 바뀐 뒤 옛 코드를 주지 않게 한다.
 */
import { getCollection } from 'astro:content';
import { KIND_LABELS, publishedLessons } from '../../../components/lesson/lesson-data.ts';
import { siteConfig } from '../../../config/site.ts';
import { readExampleSidecars } from '../../../lab/controls/example-sidecar.ts';
import type { LabExample } from '../../../lab/controls/examples.ts';
import type { LazyExamplePayload } from '../../../lab/controls/lazy-examples.ts';
import { esp32ExamplesFromFiles, kitCodePath, splitLazyEsp32Examples } from '../../../lab/esp32/examples.ts';
import type { WiringEntry } from '../../../lab/modules/board/part-types.ts';
import { normalizeWiringSpecs } from '../../../lab/modules/board/wiring-spec.ts';
import type { ExampleLessonLink } from '../../../lab/vision/examples.ts';
import { withBase } from '../../../lib/url.ts';

const exampleFiles = import.meta.glob<string>('/examples/esp32/**/*.py', { query: '?raw', eager: true, import: 'default' });
const sidecarFiles = import.meta.glob<string>('/examples/esp32/**/*.meta.yaml', { query: '?raw', eager: true, import: 'default' });

export interface Esp32LabExamples {
  /** 실습실 HTML에 심는 목록(키트 예제는 목록 자리) */
  readonly examples: LabExample[];
  /** 따로 받는 키트 예제 JSON(경로 매개변수 → 내용) */
  readonly payloads: readonly { readonly param: string; readonly file: string; readonly payload: LazyExamplePayload }[];
}

/** 받을 주소: 사이트 안 주소 + 판(서비스 워커 캐시가 판마다 따로 — 머리말) */
export function kitCodeUrl(file: string): string {
  return `${withBase(kitCodePath(file))}?v=${encodeURIComponent(siteConfig.version)}`;
}

let built: Promise<Esp32LabExamples> | null = null;

async function build(): Promise<Esp32LabExamples> {
  const lessonEntries = (await getCollection('lessons')).filter((entry) => !entry.data.draft);
  const summaries = new Map(publishedLessons(lessonEntries).map((lesson) => [lesson.id, lesson]));
  const byFile: Record<string, ExampleLessonLink> = {};
  const bySlug: Record<string, ExampleLessonLink> = {};
  const wiringByFile: Record<string, WiringEntry[]> = {};
  const warnWiring = (text: string) => console.warn(`[ESP32 실습실 배선] ${text}`);
  for (const entry of lessonEntries) {
    // 차시 md의 배선(examples[].parts)은 차시 링크와 상관없이 읽는다(차시가 목록에 아직 안 보여도 예제 배선은 맞게).
    for (const example of entry.data.examples) {
      if (example.parts.length > 0 && wiringByFile[example.file] === undefined) {
        const normalized = normalizeWiringSpecs(example.parts, `content/lessons/${entry.id}.md examples(${example.file})`);
        normalized.errors.forEach(warnWiring);
        if (normalized.entries.length > 0) {
          wiringByFile[example.file] = normalized.entries;
        }
      }
    }
    const lesson = summaries.get(entry.id);
    if (!lesson) {
      continue;
    }
    const kindLabel = lesson.kind === 'supplement' ? `${KIND_LABELS.supplement} ` : '';
    const link = { href: lesson.href, label: `${kindLabel}${lesson.label} ${lesson.title}` };
    bySlug[lesson.slug] = link;
    for (const example of entry.data.examples) {
      byFile[example.file] ??= link;
    }
  }
  const all = esp32ExamplesFromFiles(exampleFiles, readExampleSidecars(sidecarFiles), { byFile, bySlug }, { wiringByFile, onWarning: warnWiring });
  return splitLazyEsp32Examples(all, kitCodeUrl);
}

/** 한 번의 빌드에서 한 번만 만든다(실습실 쪽과 JSON 파일 212개가 함께 쓴다). 개발 서버는 차시 md를 고칠 때마다 새로 읽게 매번 만든다 */
export function esp32LabExamples(): Promise<Esp32LabExamples> {
  if (!import.meta.env.PROD) {
    return build();
  }
  built ??= build();
  return built;
}
