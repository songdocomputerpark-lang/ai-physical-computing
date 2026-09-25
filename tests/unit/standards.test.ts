// 성취기준 표와 차시 대응표(src/config/standards.ts — PLAN §2.2, PD-21, DECISIONS C8)가 서로·차례표와 맞는지
import { describe, expect, it } from 'vitest';
import { allPlannedLessons } from '../../src/components/lesson/curriculum.ts';
import { STANDARD_CODE_PATTERN } from '../../src/config/content-schemas.ts';
import {
  LESSON_STANDARDS,
  STANDARDS,
  STANDARD_AREAS,
  UNMAPPED_REASONS,
  findStandard,
  mappedStandards,
  unmappedReason,
} from '../../src/config/standards.ts';

describe('성취기준 표', () => {
  it('영역 4개 × 4·4·3·4개 = 15개이고 코드 모양이 frontmatter 규칙과 같다', () => {
    expect(STANDARD_AREAS.map((area) => area.area)).toEqual([1, 2, 3, 4]);
    expect(STANDARDS).toHaveLength(15);
    expect(new Set(STANDARDS.map((standard) => standard.code)).size).toBe(15);
    for (const standard of STANDARDS) {
      expect(standard.code).toMatch(STANDARD_CODE_PATTERN);
      expect(standard.code.startsWith(`12인피0${standard.area}-`)).toBe(true);
      expect(standard.summary.length).toBeGreaterThan(3);
    }
    expect(STANDARDS.filter((standard) => standard.area === 3)).toHaveLength(3);
    expect(findStandard('12인피03-04')).toBeUndefined();
  });
});

describe('차시 ↔ 성취기준 대응표(PLAN §2.2 초안)', () => {
  it('대응표의 코드는 모두 15개 안에 있다', () => {
    for (const [label, codes] of Object.entries(LESSON_STANDARDS)) {
      for (const code of codes) {
        expect(findStandard(code), `${label}: ${code}`).toBeDefined();
      }
    }
  });

  it('차례표(curriculum.ts)의 차시 45개(IV단원 프로젝트 안내 포함)가 모두 대응표에 있고, 대응표에만 있는 차시는 없다', () => {
    const planned = allPlannedLessons().map(({ lesson }) => lesson.label);
    expect(planned).toHaveLength(45);
    expect([...planned].sort()).toEqual(Object.keys(LESSON_STANDARDS).sort());
  });

  it('PLAN §2.2의 대표 값: 보충·음성·마무리는 빈 값, 3-1-4는 12인피01-02, IV단원은 12인피04-01', () => {
    expect(mappedStandards('v3')).toEqual([]);
    expect(mappedStandards('1-4-3')).toEqual([]);
    expect(mappedStandards('II-마무리')).toEqual([]);
    expect(mappedStandards('3-1-4')).toEqual(['12인피01-02']);
    expect(mappedStandards('3-1-1')).toEqual(['12인피03-01', '12인피03-03']);
    expect(mappedStandards('4-2-2')).toEqual(['12인피04-01']);
    expect(mappedStandards('9-9-9')).toBeUndefined();
    expect(mappedStandards('iv-프로젝트')).toEqual(['12인피04-02', '12인피04-03', '12인피04-04']);
  });

  it('일부러 비운 차시(빈 목록)와 그 까닭 표(UNMAPPED_REASONS)는 늘 같은 차시를 가리킨다', () => {
    const empty = Object.entries(LESSON_STANDARDS)
      .filter(([, codes]) => codes.length === 0)
      .map(([label]) => label)
      .sort();
    expect(Object.keys(UNMAPPED_REASONS).sort()).toEqual(empty);
    expect(unmappedReason('v4')).toBe('보충 차시');
    expect(unmappedReason('1-4-3')).toBe('선택 차시');
    expect(unmappedReason('III-마무리')).toBe('대단원 마무리');
    expect(unmappedReason('1-1-1')).toBeUndefined();
    expect(unmappedReason(undefined)).toBeUndefined();
  });
});
