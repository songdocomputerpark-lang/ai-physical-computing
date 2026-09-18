/**
 * 저장소에 실제로 있는 예제 파일로 갤러리 목록을 만들어 본다(P4-11 완료 기준 "새 .py 하나를 넣으면 코드 수정 없이 카드가 생긴다"의 뿌리).
 *
 * 페이지(src/components/examples/ExampleGallery.astro)가 빌드 때 하는 일을 그대로 흉내 낸다 —
 * examples/ 폴더를 읽어 실습실 목록 만들기(vision/esp32 examples.ts)에 넘기고, 그 결과를 buildGallery에 넣는다.
 * 그래서 예제를 더하거나 폴더를 옮겼을 때 갤러리에서 빠지거나 두 번 나오면 여기서 먼저 걸린다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readExampleSidecars } from '../../../src/lab/controls/example-sidecar.ts';
import { esp32ExamplesFromFiles } from '../../../src/lab/esp32/examples.ts';
import { buildGallery, type GalleryExampleInput } from '../../../src/lab/gallery/cards.ts';
import { visionExamplesFromFiles } from '../../../src/lab/vision/examples.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const EXAMPLES_DIR = path.join(ROOT, 'examples');

/** examples/ 아래 파일을 import.meta.glob과 같은 모양({ '/examples/…': '내용' })으로 읽는다. */
function readGlob(suffix: string, dirs: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(suffix)) {
        const relative = path.relative(EXAMPLES_DIR, full).split(path.sep).join('/');
        result[`/examples/${relative}`] = fs.readFileSync(full, 'utf8');
      }
    }
  };
  for (const dir of dirs) {
    const full = path.join(EXAMPLES_DIR, dir);
    if (fs.existsSync(full)) {
      walk(full);
    }
  }
  return result;
}

const visionFiles = readGlob('.py', ['vision', 'desktop']);
const visionSidecars = readExampleSidecars(readGlob('.meta.yaml', ['vision', 'desktop']));
const esp32Files = readGlob('.py', ['esp32']);
const esp32Sidecars = readExampleSidecars(readGlob('.meta.yaml', ['esp32']));

const visionExamples = visionExamplesFromFiles(visionFiles, visionSidecars);
const esp32Examples = esp32ExamplesFromFiles(esp32Files, esp32Sidecars);
const sidecarByFile = new Map(
  [...Object.entries(visionSidecars), ...Object.entries(esp32Sidecars)].map(([globPath, sidecar]) => [
    globPath.replace(/^\/examples\//u, ''),
    sidecar,
  ]),
);
const inputs: GalleryExampleInput[] = [
  ...visionExamples.map((example) => ({ lab: 'vision' as const, example, sidecar: sidecarByFile.get(example.file ?? '') ?? null })),
  ...esp32Examples.map((example) => ({ lab: 'esp32' as const, example, sidecar: sidecarByFile.get(example.file ?? '') ?? null })),
];
const gallery = buildGallery(inputs, {}, { partLabels: {}, commLabels: {} });

describe('저장소의 예제로 만든 갤러리', () => {
  it('실습실 [예제 불러오기]에 드는 예제가 모두 카드가 된다(라이브러리 폴더는 빼고)', () => {
    const labFiles = [...visionExamples, ...esp32Examples].map((example) => example.file);
    const cardFiles = gallery.cards.map((card) => card.file);
    expect(cardFiles.length).toBeGreaterThan(50);
    expect([...cardFiles].sort()).toEqual([...labFiles].sort());
    expect(cardFiles.some((file) => file.includes('/lib/'))).toBe(false);
  });

  it('카드 id와 위치 이름(#앵커)이 겹치지 않는다', () => {
    const ids = gallery.cards.map((card) => card.id);
    const anchors = gallery.cards.map((card) => card.anchor);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(anchors).size).toBe(anchors.length);
    for (const anchor of anchors) {
      expect(anchor).toMatch(/^ex-[a-z0-9-]+$/u);
    }
  });

  it('카드마다 제목과 실습실로 여는 주소가 있다', () => {
    for (const card of gallery.cards) {
      expect(card.title.trim()).not.toBe('');
      expect(card.labHref).toContain('?example=');
      expect(card.labHref.startsWith('/')).toBe(true);
      expect(card.lines).toBeGreaterThan(0);
    }
  });

  it('교과서 단원 폴더(u1~u4)의 예제에는 단원 태그가 붙는다', () => {
    const textbook = gallery.cards.filter((card) => /\/u[1-4]\//u.test(card.file));
    expect(textbook.length).toBeGreaterThan(30);
    expect(textbook.every((card) => card.facets.unit !== null)).toBe(true);
  });

  it('통신 예제에는 통신 방식 태그가 붙고, 통신을 쓰지 않는 예제에는 붙지 않는다', () => {
    const byFile = new Map(gallery.cards.map((card) => [card.file, card]));
    expect(byFile.get('esp32/u3/3-1-2-uart-laser.py')?.facets.comm).toEqual(['uart']);
    expect(byFile.get('esp32/u3/3-1-3-ble-xy-rgb.py')?.facets.comm).toEqual(['ble']);
    expect(byFile.get('vision/u3/3-1-3-hand-ble-xy.py')?.facets.comm).toEqual(['ble']);
    expect(byFile.get('vision/u1/1-2-1-webcam-flip.py')?.facets.comm).toEqual([]);
    expect(gallery.cards.filter((card) => card.facets.comm.length > 0).length).toBeGreaterThanOrEqual(20);
  });

  it('배선을 적어 둔 ESP32 예제에는 부품 태그가 붙는다', () => {
    const withParts = gallery.cards.filter((card) => card.facets.parts.length > 0);
    expect(withParts.length).toBeGreaterThan(10);
    expect(withParts.every((card) => card.lab === 'esp32')).toBe(true);
  });

  it('원본과 사이트판, 자료의 변형이 "비교해 보기"로 이어진다', () => {
    const byFile = new Map(gallery.cards.map((card) => [card.file, card]));
    const site = byFile.get('esp32/u2/2-1-4-laser-rgb-site.py');
    expect(site?.compare?.label).toBe('원본과 사이트판');
    expect(site?.compare?.others[0].anchor).toBe(byFile.get('esp32/u2/2-1-4-laser-rgb.py')?.anchor);
    expect(byFile.get('esp32/hw/uart2-rgb-text.py')?.compare?.others).toHaveLength(1);
    expect(byFile.get('vision/u3/3-1-4-hand-screenshot.py')?.compare?.id).toBe('hand-desktop');
  });

  it('코드가 똑같은 파일은 남아 있지 않다(사본은 하나만 옮긴다 — PLAN §2.5)', () => {
    expect(gallery.cards.filter((card) => card.sameCode.length > 0)).toEqual([]);
    expect(gallery.notes).toEqual([]);
  });

  it('묶음은 실습실 [예제 불러오기]의 묶음 이름과 같다', () => {
    const labels = gallery.sections.map((section) => section.label);
    expect(labels).toContain('1단원 교과서 실습');
    expect(labels).toContain('2단원 교과서 실습(피지컬 컴퓨팅)');
    // 두 실습실에 이름이 같은 묶음("첫 실습·사이트 예제")이 있어서 실습실까지 더해야 하나뿐이다.
    const keys = gallery.sections.map((section) => `${section.lab}/${section.label}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('거르기 칸에 실습실·단원·통신 방식·부품이 들어 있다', () => {
    const keys = gallery.facetGroups.map((group) => group.key);
    expect(keys).toContain('lab');
    expect(keys).toContain('unit');
    expect(keys).toContain('comm');
    expect(keys).toContain('parts');
  });
});
