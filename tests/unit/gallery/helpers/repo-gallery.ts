/**
 * 저장소에 실제로 있는 예제·사이드카·**차시 md**로 갤러리를 만든다 — 페이지(src/components/examples/ExampleGallery.astro)가
 * 빌드 때 하는 일을 그대로 흉내 낸다(차시 frontmatter도 빌드와 같은 규칙 `lessonSchema`로 읽는다).
 *
 * 왜 따로 두나: 카드의 난이도·단원·통신 방식은 차시 md가 먼저라서(src/lab/gallery/cards.ts 머리말) 예제 파일만 읽어서는
 * 화면에 보이는 값을 알 수 없다. "모든 카드에 난이도가 있다"(PROGRESS 미해결 140) 같은 약속은 차시까지 읽어야 확인된다.
 * examples.test.ts(차시 없이 예제만)와 repo-facets.test.ts(차시까지)가 함께 쓴다.
 *
 * 빌드 전용 모듈(yaml)을 쓰는 시험 도구다. 브라우저 번들과 상관없다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { KIND_LABELS, publishedLessons, type LessonEntryLike } from '../../../../src/components/lesson/lesson-data.ts';
import { lessonSchema } from '../../../../src/config/content-schemas.ts';
import { readExampleSidecars, type ExampleSidecar } from '../../../../src/lab/controls/example-sidecar.ts';
import type { LabExample } from '../../../../src/lab/controls/examples.ts';
import { esp32ExamplesFromFiles } from '../../../../src/lab/esp32/examples.ts';
import { buildGallery, type GalleryBuild, type GalleryExampleInput, type GalleryLessonInfo } from '../../../../src/lab/gallery/cards.ts';
import type { WiringEntry } from '../../../../src/lab/modules/board/part-types.ts';
import { normalizeWiringSpecs } from '../../../../src/lab/modules/board/wiring-spec.ts';
import { visionExamplesFromFiles } from '../../../../src/lab/vision/examples.ts';

export const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const EXAMPLES_DIR = path.join(REPO_ROOT, 'examples');
const LESSONS_DIR = path.join(REPO_ROOT, 'content', 'lessons');

function walk(dir: string, accept: (name: string) => boolean, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, accept, found);
    } else if (accept(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/** examples/ 아래 파일을 import.meta.glob과 같은 모양({ '/examples/…': '내용' })으로 읽는다. */
export function readExampleGlob(suffix: string, dirs: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const dir of dirs) {
    const full = path.join(EXAMPLES_DIR, dir);
    if (!fs.existsSync(full)) {
      continue;
    }
    for (const file of walk(full, (name) => name.endsWith(suffix))) {
      const relative = path.relative(EXAMPLES_DIR, file).split(path.sep).join('/');
      result[`/examples/${relative}`] = fs.readFileSync(file, 'utf8');
    }
  }
  return result;
}

/** 차시 md 하나(빌드의 getCollection('lessons') 항목과 같은 모양: id는 content/lessons/ 뒤 경로에서 .md를 뗀 것) */
export interface RepoLessonEntry extends LessonEntryLike {
  readonly id: string;
  readonly data: ReturnType<typeof lessonSchema.parse>;
}

/** content/lessons/**의 frontmatter를 빌드와 같은 규칙(lessonSchema — 기본값까지)으로 읽는다. 초안(draft)도 돌려준다. */
export function readRepoLessons(): RepoLessonEntry[] {
  return walk(LESSONS_DIR, (name) => name.endsWith('.md'))
    .sort()
    .map((file) => {
      const text = fs.readFileSync(file, 'utf8').replace(/\r\n/gu, '\n');
      const matched = /^---\n([\s\S]*?)\n---\n/u.exec(text);
      if (!matched) {
        throw new Error(`${file}: frontmatter(--- 사이)를 찾지 못했어요.`);
      }
      const id = path.relative(LESSONS_DIR, file).split(path.sep).join('/').replace(/\.md$/u, '');
      return { id, data: lessonSchema.parse(YAML.parse(matched[1] ?? '')) };
    });
}

export interface RepoGallery {
  readonly gallery: GalleryBuild;
  readonly inputs: readonly GalleryExampleInput[];
  readonly examples: readonly LabExample[];
  readonly sidecarByFile: ReadonlyMap<string, ExampleSidecar>;
  readonly lessons: readonly RepoLessonEntry[];
}

/**
 * 갤러리를 만든다. `withLessons: false`면 차시 md 없이(예제·사이드카만) 만든다 — 차시가 덮어쓰기 전의 값을 볼 때.
 * 카드를 만드는 차례·차시 정보 모양은 ExampleGallery.astro와 같게 둔다(그 파일을 고치면 여기도 함께 본다).
 */
export function buildRepoGallery(options: { readonly withLessons?: boolean } = {}): RepoGallery {
  const withLessons = options.withLessons ?? true;
  const visionFiles = readExampleGlob('.py', ['vision', 'desktop']);
  const visionSidecars = readExampleSidecars(readExampleGlob('.meta.yaml', ['vision', 'desktop']));
  const esp32Files = readExampleGlob('.py', ['esp32']);
  const esp32Sidecars = readExampleSidecars(readExampleGlob('.meta.yaml', ['esp32']));
  const sidecarByFile = new Map<string, ExampleSidecar>();
  for (const [globPath, sidecar] of [...Object.entries(visionSidecars), ...Object.entries(esp32Sidecars)]) {
    sidecarByFile.set(globPath.replace(/^\/examples\//u, ''), sidecar);
  }

  const lessons = withLessons ? readRepoLessons().filter((entry) => !entry.data.draft) : [];
  const summaries = new Map(publishedLessons(lessons).map((lesson) => [lesson.id, lesson]));
  const byFile: Record<string, GalleryLessonInfo> = {};
  const bySlug: Record<string, GalleryLessonInfo> = {};
  const wiringByFile: Record<string, WiringEntry[]> = {};
  for (const entry of lessons) {
    for (const example of entry.data.examples) {
      if (example.parts.length > 0 && wiringByFile[example.file] === undefined) {
        const normalized = normalizeWiringSpecs(example.parts, `content/lessons/${entry.id}.md examples(${example.file})`);
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
    const info: GalleryLessonInfo = {
      slug: lesson.slug,
      href: lesson.href,
      label: `${kindLabel}${lesson.label} ${lesson.title}`,
      unit: entry.data.unit,
      difficulty: entry.data.difficulty,
      virtualOk: entry.data.virtual_ok,
      comm: entry.data.comm,
      tags: entry.data.tags,
      examples: entry.data.examples,
    };
    bySlug[info.slug] = info;
    for (const example of entry.data.examples) {
      byFile[example.file] ??= info;
    }
  }
  const lessonLinks = {
    byFile: Object.fromEntries(Object.entries(byFile).map(([file, info]) => [file, { href: info.href, label: info.label }])),
    bySlug: Object.fromEntries(Object.entries(bySlug).map(([slug, info]) => [slug, { href: info.href, label: info.label }])),
  };

  const visionExamples = visionExamplesFromFiles(visionFiles, visionSidecars, lessonLinks);
  const esp32Examples = esp32ExamplesFromFiles(esp32Files, esp32Sidecars, lessonLinks, { wiringByFile });
  const inputs: GalleryExampleInput[] = [
    ...visionExamples.map((example) => ({ lab: 'vision' as const, example, sidecar: sidecarByFile.get(example.file ?? '') ?? null })),
    ...esp32Examples.map((example) => ({ lab: 'esp32' as const, example, sidecar: sidecarByFile.get(example.file ?? '') ?? null })),
  ];
  const gallery = buildGallery(inputs, { byFile, bySlug }, { partLabels: {}, commLabels: {} });
  return { gallery, inputs, examples: [...visionExamples, ...esp32Examples], sidecarByFile, lessons };
}
