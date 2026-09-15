// 견본 차시 두 개(PLAN §8.1 P1-06: 1-1-1 원고 일부, 보충 V4 틀)와 그 그림·예제 파일을 검사한다.
// 모든 차시에 적용하는 엄격한 틀 검사는 P5-02 check:lessons가 맡는다(PD-35). 여기서는 견본만 본다.
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { LESSON_MARKERS, LESSON_SECTIONS, sectionKeyFromHeading } from '../../../src/components/lesson/lesson-html.ts';
import { lessonSchema } from '../../../src/config/content-schemas.ts';

interface LessonFile {
  file: string;
  frontmatter: unknown;
  body: string;
}

function readLesson(file: string): LessonFile {
  const text = fs.readFileSync(file, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(text);
  if (!match) {
    throw new Error(`${file}: frontmatter(--- 사이)를 찾지 못했어요.`);
  }
  return { file, frontmatter: parse(match[1] ?? ''), body: match[2] ?? '' };
}

const SAMPLES = [
  { file: 'content/lessons/u1/1-1-1.md', standards: ['12인피01-01'], kind: 'textbook' },
  { file: 'content/lessons/u1/v4.md', standards: [], kind: 'supplement' },
] as const;

interface ImageRecord {
  path: string;
  reviewed?: { by?: string; date?: string; result?: string };
}

const imageReviews = new Map<string, ImageRecord>(
  ((parse(fs.readFileSync('scripts/image-allowlist.yaml', 'utf8')) as { images?: ImageRecord[] }).images ?? []).map(
    (item): [string, ImageRecord] => [item.path, item],
  ),
);

describe.each(SAMPLES)('견본 차시 $file', (sample) => {
  const lesson = readLesson(sample.file);
  const parsed = lessonSchema.safeParse(lesson.frontmatter);

  it('frontmatter가 차시 규칙(src/config/content-schemas.ts)을 통과한다', () => {
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data?.kind).toBe(sample.kind);
    expect(parsed.data?.standards).toEqual(sample.standards);
  });

  it('확인 퀴즈는 3문항이고 문항마다 풀이가 있다', () => {
    expect(parsed.data?.quiz).toHaveLength(3);
    for (const item of parsed.data?.quiz ?? []) {
      expect(item.explain, item.q).toBeTruthy();
    }
  });

  it('본문 ## 제목이 차시 틀 8칸을 순서대로 모두 갖고, ::예제·::퀴즈 자리가 있다', () => {
    const headings = [...lesson.body.matchAll(/^## (.+)$/gmu)].map((match) => sectionKeyFromHeading(match[1] ?? ''));
    expect(headings).toEqual(LESSON_SECTIONS.map((section) => section.key));
    expect(lesson.body).toMatch(new RegExp(`^${LESSON_MARKERS.examples}$`, 'mu'));
    expect(lesson.body).toMatch(new RegExp(`^${LESSON_MARKERS.quiz}$`, 'mu'));
    expect(lesson.body).toContain(':::왜그럴까');
    expect(lesson.body).toContain(':::교사용');
  });

  it('예제 파일이 examples/에 있고 줄 끝이 LF다', () => {
    for (const example of parsed.data?.examples ?? []) {
      const examplePath = path.join('examples', example.file);
      expect(fs.existsSync(examplePath), examplePath).toBe(true);
      expect(fs.readFileSync(examplePath, 'utf8')).not.toContain('\r');
    }
  });

  it('본문 그림은 public/에 있고 눈 확인 기록(통과)이 있다', () => {
    for (const match of lesson.body.matchAll(/!\[[^\]]+\]\((\/images\/[^)\s]+)\)/gu)) {
      const publicPath = `public${match[1]}`;
      expect(fs.existsSync(publicPath), publicPath).toBe(true);
      expect(imageReviews.get(publicPath)?.reviewed?.result, publicPath).toMatch(/^통과/u);
    }
  });
});

describe('차시 그림 폴더(public/images/lessons/)', () => {
  it('모든 그림에 눈 확인 기록이 있다(PD-32)', () => {
    const walk = (directory: string): string[] =>
      fs.existsSync(directory)
        ? fs.readdirSync(directory, { withFileTypes: true }).flatMap((dirent) => {
            const full = `${directory}/${dirent.name}`;
            return dirent.isDirectory() ? walk(full) : [full];
          })
        : [];
    const images = walk('public/images/lessons').filter((file) => /\.(?:png|jpe?g|gif|webp|avif)$/iu.test(file));
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      const review = imageReviews.get(image)?.reviewed;
      expect(review?.by, image).toBeTruthy();
      expect(review?.date, image).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(review?.result, image).toMatch(/^통과/u);
    }
  });

  it('WebP 그림에 EXIF·XMP·ICC 조각이 없다(메타데이터 제거 확인)', () => {
    for (const name of fs.readdirSync('public/images/lessons/u1').filter((file) => file.endsWith('.webp'))) {
      const bytes = fs.readFileSync(`public/images/lessons/u1/${name}`);
      expect(bytes.subarray(0, 4).toString('latin1')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
      const chunks: string[] = [];
      for (let offset = 12; offset + 8 <= bytes.length; ) {
        const size = bytes.readUInt32LE(offset + 4);
        chunks.push(bytes.subarray(offset, offset + 4).toString('latin1'));
        offset += 8 + size + (size % 2);
      }
      expect(chunks, name).not.toContain('EXIF');
      expect(chunks, name).not.toContain('XMP ');
      expect(chunks, name).not.toContain('ICCP');
    }
  });
});
