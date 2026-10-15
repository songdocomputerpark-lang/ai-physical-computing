// 출판본 차례(src/config/book-outline.ts)와 차례 그림 위 링크 자리(src/config/book-toc-spots.ts) 검사(판 1.4.0, DECISIONS C132).
// ① 차례 자체의 짜임(절 32·중단원 9·마무리 4, 쪽 순서) ② 링크 자리가 모든 절을 한 번씩 덮고 겹치지 않는지, 그림 파일 크기와 맞는지
// ③ 이미 쓴 교과서 쪽(content/book)·웹 차시(content/lessons)의 제목·중단원·쪽 범위가 이 차례와 어긋나지 않는지(새 쪽이 늘어도 저절로 검사에 든다).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { readWebpInfo } from '../../../src/components/parts/webp-info.ts';
import {
  BOOK_OUTLINE_PARTS,
  BOOK_OUTLINE_REVIEWS,
  BOOK_OUTLINE_SECTIONS,
  bookSectionCount,
  findOutlinePart,
  findOutlineSection,
} from '../../../src/config/book-outline.ts';
import { BOOK_TOC_IMAGES, BOOK_TOC_SPOTS, spotStyle } from '../../../src/config/book-toc-spots.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');

/** "124~131" → [124, 131], "141" → [141, 141] (앞의 0은 뗀다: "053~062" → [53, 62]) */
function pageRange(pages: string): [number, number] {
  const [start, end] = pages.split('~').map((part) => Number(part));
  return [start as number, (end ?? start) as number];
}

/** content/lessons 아래 대단원 폴더(u1~u4) 이름 — .gitkeep 같은 파일은 뺀다 */
function lessonUnitDirs(lessonsDir: string): string[] {
  return fs.readdirSync(lessonsDir).filter((name) => fs.statSync(path.join(lessonsDir, name)).isDirectory());
}

/** 마크다운 앞머리(frontmatter)를 읽는다 */
function frontmatterOf(file: string): Record<string, unknown> {
  const text = fs.readFileSync(file, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(text);
  return (match ? parse(match[1] ?? '') : {}) as Record<string, unknown>;
}

describe('출판본 차례(book-outline.ts)', () => {
  it('절 32개·중단원 9개·대단원 마무리 4개이고, 절 수는 한 곳(bookSectionCount)에서 센다', () => {
    expect(BOOK_OUTLINE_SECTIONS).toHaveLength(32);
    expect(bookSectionCount()).toBe(32);
    expect(BOOK_OUTLINE_PARTS).toHaveLength(9);
    expect(BOOK_OUTLINE_REVIEWS.map((review) => review.id)).toEqual(['u1-review', 'u2-review', 'u3-review', 'u4-review']);
  });

  it('대단원별 절 수는 1단원 12 · 2단원 9 · 3단원 4 · 4단원 7이다', () => {
    const counts = [1, 2, 3, 4].map((unit) => BOOK_OUTLINE_SECTIONS.filter((section) => section.unit === unit).length);
    expect(counts).toEqual([12, 9, 4, 7]);
  });

  it('절 번호는 겹치지 않고, 번호의 앞 두 칸이 대단원·중단원이며, 중단원은 차례에 있다', () => {
    const ids = new Set<string>();
    for (const section of BOOK_OUTLINE_SECTIONS) {
      expect(ids.has(section.id), section.id).toBe(false);
      ids.add(section.id);
      expect(section.id, section.id).toMatch(/^[1-4]-[1-9]-[1-9]$/u);
      expect(section.id.startsWith(`${section.unit}-${section.part}-`), section.id).toBe(true);
      expect(findOutlinePart(section.unit, section.part), `${section.id}의 중단원`).toBeDefined();
    }
  });

  it('쪽 범위는 모양이 맞고 쪽 순서대로 이어진다(앞 절이 끝난 쪽 뒤에서 다음 절이 시작)', () => {
    let last = 0;
    for (const section of [...BOOK_OUTLINE_SECTIONS, ...BOOK_OUTLINE_REVIEWS].sort((a, b) => pageRange(a.pages)[0] - pageRange(b.pages)[0])) {
      expect(section.pages, section.id).toMatch(/^[1-9]\d{0,2}(?:~[1-9]\d{0,2})?$/u);
      const [start, end] = pageRange(section.pages);
      expect(end, section.id).toBeGreaterThanOrEqual(start);
      expect(start, `${section.id}이 앞 절과 겹쳐요`).toBeGreaterThan(last);
      last = end;
    }
  });

  it('절 목록은 번호 순서(대단원 → 중단원 → 절)이고 쪽 번호도 같은 순서다', () => {
    const ids = BOOK_OUTLINE_SECTIONS.map((section) => section.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })));
    const starts = BOOK_OUTLINE_SECTIONS.map((section) => pageRange(section.pages)[0]);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('중단원 이름은 번호로 시작하고 같은 대단원 안에서 1번부터 빠짐없이 이어진다', () => {
    for (const unit of [1, 2, 3, 4]) {
      const parts = BOOK_OUTLINE_PARTS.filter((part) => part.unit === unit);
      expect(parts.map((part) => part.index), `${unit}단원`).toEqual(parts.map((_, index) => index + 1));
      for (const part of parts) {
        expect(part.title.startsWith(String(part.index).padStart(2, '0') + ' '), part.title).toBe(true);
      }
    }
  });

  it('매체는 camera·mic·web·board 가운데서만 쓴다', () => {
    for (const section of BOOK_OUTLINE_SECTIONS) {
      for (const media of section.media) {
        expect(['camera', 'mic', 'web', 'board'], `${section.id} ${media}`).toContain(media);
      }
    }
  });

  it('절 번호로 찾는다(대소문자 무시)', () => {
    expect(findOutlineSection('2-1-2')?.title).toBe('LCD 제어하기');
    expect(findOutlineSection('9-9-9')).toBeUndefined();
  });
});

describe('차례 그림 위 링크 자리(book-toc-spots.ts)', () => {
  const spotsById = new Map(BOOK_TOC_SPOTS.map((spot) => [spot.id, spot]));

  it('모든 절에 링크 자리가 하나씩 있고, 없는 절의 자리는 없다', () => {
    expect(BOOK_TOC_SPOTS).toHaveLength(BOOK_OUTLINE_SECTIONS.length);
    expect(spotsById.size).toBe(BOOK_TOC_SPOTS.length);
    for (const section of BOOK_OUTLINE_SECTIONS) {
      expect(spotsById.has(section.id), `${section.id} 자리`).toBe(true);
    }
  });

  it('그림은 1쪽(1·2단원)과 2쪽(3·4단원) 둘이고, 절은 자기 단원이 든 그림 위에 있다', () => {
    expect(BOOK_TOC_IMAGES.map((image) => image.image)).toEqual([1, 2]);
    for (const section of BOOK_OUTLINE_SECTIONS) {
      const spot = spotsById.get(section.id)!;
      const image = BOOK_TOC_IMAGES.find((candidate) => candidate.image === spot.image)!;
      expect(image.units, `${section.id}의 그림`).toContain(section.unit);
    }
  });

  it('자리는 그림 안(0~100%)에 있고, 같은 그림 위의 자리끼리 겹치지 않는다', () => {
    for (const spot of BOOK_TOC_SPOTS) {
      expect(spot.left, spot.id).toBeGreaterThanOrEqual(0);
      expect(spot.top, spot.id).toBeGreaterThanOrEqual(0);
      expect(spot.left + spot.width, spot.id).toBeLessThanOrEqual(100);
      expect(spot.top + spot.height, spot.id).toBeLessThanOrEqual(100);
      // 한 줄 높이가 너무 작으면 눌러지지 않는다 — 그림 높이 1560px 기준 30px(1.9%) 이상
      expect(spot.height, `${spot.id} 높이`).toBeGreaterThanOrEqual(1.9);
    }
    for (const image of BOOK_TOC_IMAGES) {
      const spots = BOOK_TOC_SPOTS.filter((spot) => spot.image === image.image);
      for (const [index, a] of spots.entries()) {
        for (const b of spots.slice(index + 1)) {
          const overlapX = a.left < b.left + b.width && b.left < a.left + a.width;
          const overlapY = a.top < b.top + b.height && b.top < a.top + a.height;
          expect(overlapX && overlapY, `${a.id}와 ${b.id}가 겹쳐요`).toBe(false);
        }
      }
    }
  });

  it('값은 소수 둘째 자리까지만 적는다(손으로 고치기 쉽게)', () => {
    for (const spot of BOOK_TOC_SPOTS) {
      for (const value of [spot.left, spot.top, spot.width, spot.height]) {
        expect(Math.round(value * 100) / 100, spot.id).toBe(value);
      }
    }
  });

  it('그림 파일이 있고 가로·세로가 적은 값과 같다(WebP)', () => {
    for (const image of BOOK_TOC_IMAGES) {
      const info = readWebpInfo(new Uint8Array(fs.readFileSync(path.join(ROOT, 'public', image.src))));
      expect(info, image.src).not.toBeNull();
      expect({ width: info?.width, height: info?.height }, image.src).toEqual({ width: image.width, height: image.height });
      expect(image.alt.length, image.src).toBeGreaterThan(20);
    }
  });

  it('CSS 한 줄 모양', () => {
    expect(spotStyle({ left: 15.1, top: 43.21, width: 28.94, height: 2.44 })).toBe('left:15.1%;top:43.21%;width:28.94%;height:2.44%');
  });
});

describe('이미 쓴 교과서 쪽·웹 차시와 차례가 맞는지', () => {
  const bookDir = path.join(ROOT, 'content', 'book');
  const bookFiles = fs.existsSync(bookDir) ? fs.readdirSync(bookDir).filter((name) => /^[1-4]-[1-9]-[1-9]\.md$/u.test(name)) : [];

  it('교과서 쪽(절)의 제목·중단원은 차례와 글자까지 같고, 쪽 범위는 차례의 쪽을 품는다', () => {
    expect(bookFiles.length).toBeGreaterThan(0);
    for (const name of bookFiles) {
      const id = name.slice(0, -'.md'.length);
      const outline = findOutlineSection(id);
      expect(outline, `${name}: 차례에 없는 절 번호예요`).toBeDefined();
      const data = frontmatterOf(path.join(bookDir, name));
      expect(data.title, `${name} 제목`).toBe(outline!.title);
      expect(data.part, `${name} 중단원`).toBe(findOutlinePart(outline!.unit, outline!.part)!.title);
      expect(data.unit, `${name} 대단원`).toBe(outline!.unit);
      const [start, end] = pageRange(String(data.pages));
      const [outlineStart, outlineEnd] = pageRange(outline!.pages);
      // 중단원 첫 절은 중단원 시작(성취 계획) 쪽을 앞에 붙일 수 있다 — 끝 쪽은 같아야 한다
      expect(start, `${name} 시작 쪽`).toBeLessThanOrEqual(outlineStart);
      expect(end, `${name} 끝 쪽`).toBe(outlineEnd);
    }
  });

  it('대단원 마무리 쪽의 쪽 범위도 차례와 같다', () => {
    for (const review of BOOK_OUTLINE_REVIEWS) {
      const file = path.join(bookDir, `${review.id}.md`);
      if (!fs.existsSync(file)) {
        continue;
      }
      expect(frontmatterOf(file).pages, review.id).toBe(review.pages);
    }
  });

  it('웹 차시(교과서 절과 짝)의 제목은 출판본 절 제목이다("(선택 차시)" 같은 꼬리말은 뺀다)', () => {
    const lessonsDir = path.join(ROOT, 'content', 'lessons');
    let checked = 0;
    for (const unit of lessonUnitDirs(lessonsDir)) {
      for (const name of fs.readdirSync(path.join(lessonsDir, unit)).filter((file) => file.endsWith('.md'))) {
        const data = frontmatterOf(path.join(lessonsDir, unit, name));
        const outline = findOutlineSection(String(data.label ?? ''));
        if (!outline) {
          continue;
        }
        checked += 1;
        const title = String(data.title).replace(/\(선택 차시\)$/u, '');
        expect(title, `${unit}/${name} 제목이 출판본(${outline.title})과 달라요`).toBe(outline.title);
      }
    }
    expect(checked).toBe(31);
  });

  it('쪽 범위를 적은 웹 차시는 출판본 절 범위 안이다(원고에 없던 12편도 "파일명 p…"가 아니다)', () => {
    const lessonsDir = path.join(ROOT, 'content', 'lessons');
    for (const unit of lessonUnitDirs(lessonsDir)) {
      for (const name of fs.readdirSync(path.join(lessonsDir, unit)).filter((file) => file.endsWith('.md'))) {
        const data = frontmatterOf(path.join(lessonsDir, unit, name));
        const outline = findOutlineSection(String(data.label ?? ''));
        if (!outline) {
          continue;
        }
        const pages = String(data.pages ?? '');
        expect(pages, `${unit}/${name}`).toMatch(/^\d{3}(?:~\d{3})?$/u);
        const [start, end] = pageRange(pages);
        const [outlineStart, outlineEnd] = pageRange(outline.pages);
        // 첫 절은 중단원 시작 쪽부터, 2-1-3은 읽기 자료(141쪽)를 따로 떼어 끝이 하나 모자랄 수 있다
        expect(start, `${unit}/${name} 시작 쪽`).toBeLessThanOrEqual(outlineStart);
        expect(start, `${unit}/${name} 시작 쪽`).toBeGreaterThanOrEqual(outlineStart - 2);
        expect(end, `${unit}/${name} 끝 쪽`).toBeLessThanOrEqual(outlineEnd);
        expect(end, `${unit}/${name} 끝 쪽`).toBeGreaterThanOrEqual(outlineEnd - 1);
      }
    }
  });
});
