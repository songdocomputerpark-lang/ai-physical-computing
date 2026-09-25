// 견본 차시(PLAN §8.1 P1-06: 기준 차시 1-1-1, 보충 V1~V5)와 그 그림·예제 파일을 검사한다.
// 모든 차시의 엄격한 틀 검사는 npm run check:lessons(scripts/check-lessons.mjs, P5-02)가 맡는다 — npm test에 넣지 않은 까닭은
// 그 파일 머리말(PD-35: 구역이 쓰다 만 차시가 다른 구역의 단위 테스트를 깨지 않게). 여기서는 이미 커밋된 견본만 본다.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { readImageRecords } from '../../../scripts/lib/lesson-images.mjs';
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
  { file: 'content/lessons/u1/v1.md', standards: [], kind: 'supplement' },
  { file: 'content/lessons/u1/v2.md', standards: [], kind: 'supplement' },
  { file: 'content/lessons/u1/v3.md', standards: [], kind: 'supplement' },
  { file: 'content/lessons/u1/v4.md', standards: [], kind: 'supplement' },
  { file: 'content/lessons/u1/v5.md', standards: [], kind: 'supplement' },
] as const;

interface ImageRecord {
  path: string;
  reviewed?: { by?: string; date?: string; result?: string };
}

// 눈 확인 기록은 두 곳에 있다: 차시마다 따로인 그림 목록(content/lessons/**/*.images.yaml, P5-01)과 옛 공용 기록(scripts/image-allowlist.yaml).
const imageReviews = readImageRecords('.').records as unknown as Map<string, ImageRecord>;

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

  it('본문 그림은 public/에 있고, 래스터 그림은 눈 확인 기록(통과)이 있다(사이트가 그린 SVG는 기록 없음)', () => {
    const sources = [
      ...[...lesson.body.matchAll(/!\[[^\]]*\]\((\/images\/[^)\s]+)\)/gu)].map((match) => match[1] ?? ''),
      ...[...lesson.body.matchAll(/<img\b[^>]*\ssrc="(\/images\/[^"]+)"/gu)].map((match) => match[1] ?? ''),
    ];
    for (const source of sources) {
      const publicPath = `public${source}`;
      expect(fs.existsSync(publicPath), publicPath).toBe(true);
      if (!publicPath.endsWith('.svg')) {
        expect(imageReviews.get(publicPath)?.reviewed?.result, publicPath).toMatch(/^통과/u);
      }
    }
  });
});

describe('차시 그림 폴더(public/images/lessons/)', () => {
  // git이 추적하는 그림만 본다. 여러 구역이 한 폴더에서 일할 때 다른 구역이 막 꺼내 아직 눈으로 보지 않은 그림 때문에
  // 내 테스트가 깨지지 않게 하려는 것이다 — 기록 없는 그림의 커밋은 저장소 검사(커밋 전 훅·CI)가 막는다(2026-09-25 P5-01).
  it('git이 추적하는 모든 차시 그림에 눈 확인 기록이 있다(PD-32)', () => {
    const images = execFileSync('git', ['ls-files', '-z', '--', 'public/images/lessons'], { encoding: 'utf8' })
      .split('\0')
      .filter((file) => /\.(?:png|jpe?g|gif|webp|avif)$/iu.test(file));
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      const review = imageReviews.get(image)?.reviewed;
      expect(review?.by, image).toBeTruthy();
      expect(review?.date, image).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(review?.result, image).toMatch(/^통과/u);
    }
  });

  it('WebP 그림에 EXIF·XMP·ICC 조각이 없다(메타데이터 제거 확인)', () => {
    // git이 추적하는 차시 그림 폴더의 WebP 전부(2026-09-25 P5-02: 옛 public/images/lessons/u1/ 삽화 3장은 도구 판으로 바꾸며 지웠다).
    const webps = execFileSync('git', ['ls-files', '-z', '--', 'public/images/lessons'], { encoding: 'utf8' })
      .split('\0')
      .filter((file) => file.endsWith('.webp') && fs.existsSync(file));
    expect(webps.length).toBeGreaterThan(0);
    for (const name of webps) {
      const bytes = fs.readFileSync(name);
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
