// 부품 사전의 진짜 데이터(content/parts/parts.yaml)와 사진 파일(public/images/parts/third-party/kit-vendor/)을 대조한다(판 1.4.0, DECISIONS O17·C136).
// 파일 시스템을 읽으므로 이 검사는 사진·데이터·키트 표·가상 보드 부품·눈 확인 기록·출처 등록부가 서로 어긋나면 알려 준다.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readImageRecords } from '../../../scripts/lib/lesson-images.mjs';
import { findMatchingEntries, parseRegistry } from '../../../scripts/lib/sources-registry.mjs';
import { KIT_PARTS } from '../../../src/components/start/board/kit-parts.ts';
import {
  PARTS_FILE,
  PARTS_PHOTO_DIR,
  PARTS_PHOTO_MAX_SIDE,
  PART_CATEGORIES,
  groupPartsByCategory,
  parsePartsYaml,
  pickPartsForSiteParts,
} from '../../../src/components/parts/parts-schema.ts';
import { WEBP_METADATA_CHUNKS, readWebpInfo } from '../../../src/components/parts/webp-info.ts';

const root = process.cwd();
const parts = parsePartsYaml(fs.readFileSync(path.join(root, PARTS_FILE), 'utf8'));
const photoDir = path.join(root, PARTS_PHOTO_DIR);
const photoFiles = fs.readdirSync(photoDir).filter((name) => !name.startsWith('.'));

/** 사진 한 장의 키트 표 줄이 없는 줄(보드 안의 칩이라 사진이 없다) — 새 사진이 생기면 이 목록을 줄인다 */
const KIT_ROWS_WITHOUT_PHOTO = ['USB 드라이브(CH340)'];

describe('데이터 파일 ↔ 사진 파일', () => {
  it('부품이 있고, 사진 폴더의 모든 파일이 정확히 한 항목에 이어진다(빠진 사진·남는 사진 없음)', () => {
    expect(parts.length).toBeGreaterThan(100);
    const referenced = parts.map((part) => part.file).sort();
    expect(new Set(referenced).size).toBe(referenced.length);
    expect(photoFiles.sort()).toEqual(referenced);
  });

  it('id가 겹치지 않고 사진 파일 이름은 <id>.webp다', () => {
    expect(new Set(parts.map((part) => part.id)).size).toBe(parts.length);
    for (const part of parts) {
      expect(part.file, part.id).toBe(`${part.id}.webp`);
    }
  });

  it('모든 분류에 부품이 한 장 이상 있다(빈 분류는 쪽에서 숨겨지므로 알아채기 위해)', () => {
    for (const group of groupPartsByCategory(parts)) {
      expect(group.parts.length, group.category.id).toBeGreaterThan(0);
    }
    expect(PART_CATEGORIES.length).toBe(9);
  });
});

describe('사진 파일: 크기·메타데이터·바이트', () => {
  const infos = parts.map((part) => {
    const bytes = fs.readFileSync(path.join(photoDir, part.file));
    return { part, bytes, info: readWebpInfo(new Uint8Array(bytes)) };
  });

  it('모두 올바른 WebP이고 긴 변이 800px 이하다', () => {
    for (const { part, info } of infos) {
      expect(info, `${part.file}은(는) WebP로 읽혀야 해요`).not.toBeNull();
      expect(Math.max(info!.width, info!.height), part.file).toBeLessThanOrEqual(PARTS_PHOTO_MAX_SIDE);
      expect(Math.min(info!.width, info!.height), part.file).toBeGreaterThan(0);
    }
  });

  it('EXIF·XMP·ICC(색 프로필) 조각이 없다 — 촬영·편집 기록이 사이트에 실리지 않는다', () => {
    for (const { part, info } of infos) {
      const found = info!.chunks.filter((name) => WEBP_METADATA_CHUNKS.includes(name));
      expect(found, `${part.file}에 ${found.join(', ')} 조각이 있어요`).toEqual([]);
    }
  });

  it('한 장이 300KB를 넘지 않는다(첫 화면 전송량을 지키려고 다시 인코딩한다)', () => {
    for (const { part, bytes } of infos) {
      expect(bytes.length, part.file).toBeLessThanOrEqual(300 * 1024);
    }
  });
});

describe('가상 보드·키트 표와의 짝', () => {
  const boardPartDirs = new Set(
    fs
      .readdirSync(path.join(root, 'src', 'lab', 'modules', 'board', 'parts'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  );

  it('site_part는 모두 실제 가상 보드 부품 폴더 이름이다', () => {
    for (const part of parts) {
      for (const siteId of part.siteParts) {
        expect(boardPartDirs.has(siteId), `${part.id}의 site_part "${siteId}"는 src/lab/modules/board/parts/에 없어요`).toBe(true);
      }
    }
  });

  it('사진이 있는 가상 보드 부품은 사진 줄이 그 부품의 사진을 고른다(사진 없는 ble은 건너뜀)', () => {
    const picked = pickPartsForSiteParts(parts, ['lcd-i2c', 'touch-digital', 'ble']);
    expect(picked.map((part) => part.id)).toEqual(['dis-001-i2c-1602-lcd', 'd-022-touch-sensor']);
    // 키트에 있는 가상 부품은 모두 사진이 있다
    for (const siteId of ['touch-analog-4ch', 'uart', 'lcd-i2c', 'rgb-led', 'laser', 'oled-i2c', 'neopixel', 'touch-digital', 'vibration-motor', 'fan-motor', 'servo', 'buzzer', 'mp3', 'builtin-led', 'boot-button']) {
      expect(pickPartsForSiteParts(parts, [siteId]), siteId).toHaveLength(1);
    }
  });

  it('kit_name은 모두 보드 준비 쪽 키트 표(kit-parts.ts)의 kitName과 글자까지 같다', () => {
    const kitNames = new Set(KIT_PARTS.map((part) => part.kitName));
    for (const part of parts) {
      if (part.kitName !== undefined) {
        expect(kitNames.has(part.kitName), `${part.id}의 kit_name "${part.kitName}"이(가) kit-parts.ts에 없어요`).toBe(true);
      }
    }
  });

  it('키트 표 16줄 가운데 사진이 없는 줄은 목록에 적은 것뿐이다', () => {
    const withPhoto = new Set(parts.flatMap((part) => (part.kitName === undefined ? [] : [part.kitName])));
    const without = KIT_PARTS.map((part) => part.kitName).filter((kitName) => !withPhoto.has(kitName));
    expect(without).toEqual(KIT_ROWS_WITHOUT_PHOTO);
    expect(KIT_PARTS).toHaveLength(16);
  });

  it('판이 달라 모양이 다를 수 있는 부품(확장 실드 V2↔V3, DFPlayer↔KT403A, SG90↔MG90S 등)에는 안내가 붙어 있다', () => {
    const byId = new Map(parts.map((part) => [part.id, part]));
    for (const id of ['board-003-esp32-shield-v3', 'board-010-esp32', 'o-002-mp3-player-kt403a', 'm-006-mg90s-servo', 'c-007-usb-to-uart-converter', 'a-022-analog-touch-sensor', 'o-001-buzzer']) {
      expect(byId.get(id)?.note, id).toContain('키트에 따라 모양이 다를 수 있어요');
    }
  });
});

describe('눈 확인 기록과 출처 등록부', () => {
  const { records, errors } = readImageRecords(root);
  const registry = parseRegistry(fs.readFileSync(path.join(root, 'sources.yaml'), 'utf8'));

  it('기록 파일에 문법 오류가 없다', () => {
    expect(errors).toEqual([]);
  });

  it('모든 사진에 sha256이 같은 눈 확인 기록("통과")이 있다 — 저장소 검사가 커밋 때 요구하는 것과 같다', () => {
    for (const part of parts) {
      const sitePath = `${PARTS_PHOTO_DIR}/${part.file}`;
      const record = records.get(sitePath);
      expect(record, `${sitePath}의 눈 확인 기록이 scripts/image-allowlist.yaml에 없어요`).toBeDefined();
      const reviewed = record!.reviewed as { by?: string; date?: string; result?: string };
      expect(reviewed.by, sitePath).toBeTruthy();
      expect(reviewed.result, sitePath).toMatch(/^통과/u);
      const actual = createHash('sha256').update(fs.readFileSync(path.join(root, sitePath))).digest('hex');
      expect(record!.sha256, `${sitePath}: 눈으로 확인한 뒤에 사진이 바뀌었어요`).toBe(actual);
    }
  });

  it('사진은 모두 제3자 "키트 업체" 항목이 덮고, 그 항목에 운영자 허락(O17) 문장이 있다', () => {
    expect(registry.errors).toEqual([]);
    for (const part of parts) {
      const matches = findMatchingEntries(`${PARTS_PHOTO_DIR}/${part.file}`, registry.entries);
      expect(matches.length, part.file).toBe(1);
      expect(matches[0]!.entry.category, part.file).toBe('third_party');
      expect(matches[0]!.entry.name, part.file).toContain('키트 업체');
    }
    const kit = registry.entries.find((entry) => entry.name.startsWith('키트 업체'));
    expect(kit, 'sources.yaml에 "키트 업체…" 항목이 있어야 해요').toBeDefined();
    expect(kit!.rights ?? '').toContain('2026-10-15');
    expect(kit!.rights ?? '').toContain('부품 사진: 고릴라셀(브릭셀) 제공, 허락받아 사용');
  });
});
