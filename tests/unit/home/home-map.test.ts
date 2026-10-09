// 홈 배움 지도 카드 자료(src/components/home/home-map.ts) 단위 테스트 — 차시 수·첫 차시·진도 id·이어서 하기 주소.
import { describe, expect, it } from 'vitest';
import { homeMap } from '../../../src/components/home/home-content.ts';
import { buildHomeMapUnits, lessonHrefFromId, type HomeMapLesson } from '../../../src/components/home/home-map.ts';
import { learnUnits } from '../../../src/config/nav.ts';

function lesson(unit: 1 | 2 | 3 | 4, slug: string, label = slug): HomeMapLesson {
  return { id: `u${unit}/${slug}`, unit, label, title: `${label} 제목`, href: `/ai-physical-computing/learn/u${unit}/${slug}/` };
}

const LESSONS: HomeMapLesson[] = [
  lesson(1, '1-1-1'),
  lesson(1, '1-1-2'),
  lesson(1, 'v1', 'V1'),
  lesson(2, '2-1-1'),
  lesson(2, '2-1-2'),
  lesson(3, '3-1-1'),
];

describe('buildHomeMapUnits', () => {
  const units = buildHomeMapUnits(learnUnits, LESSONS, homeMap.unitIcons);

  it('대단원 I~IV 네 장을 교과서 차례대로 만든다', () => {
    expect(units.map((unit) => unit.unit)).toEqual([1, 2, 3, 4]);
    expect(units.map((unit) => unit.numeral)).toEqual(['I', 'II', 'III', 'IV']);
    expect(units.map((unit) => unit.label)).toEqual(learnUnits.map((unit) => unit.label));
    expect(units.map((unit) => unit.href)).toEqual(learnUnits.map((unit) => unit.href));
  });

  it('차시 수와 진도 id 목록은 그 단원의 공개 차시만 센다', () => {
    expect(units.map((unit) => unit.count)).toEqual([3, 2, 1, 0]);
    expect(units[0]?.lessonIds).toEqual(['u1/1-1-1', 'u1/1-1-2', 'u1/v1']);
    expect(units[3]?.lessonIds).toEqual([]);
  });

  it('시작하기는 그 단원 첫 차시로 가고, 공개 차시가 없는 단원은 first가 null이다', () => {
    expect(units[0]?.first).toEqual({
      id: 'u1/1-1-1',
      label: '1-1-1',
      title: '1-1-1 제목',
      href: '/ai-physical-computing/learn/u1/1-1-1/',
    });
    expect(units[1]?.first?.id).toBe('u2/2-1-1');
    expect(units[3]?.first).toBeNull();
  });

  it('아이콘은 단원마다 다르다(영상 → 보드 → 통신 → 프로젝트)', () => {
    expect(units.map((unit) => unit.icon)).toEqual(['camera', 'chip', 'signal', 'lightbulb']);
    expect(new Set(units.map((unit) => unit.icon)).size).toBe(4);
  });
});

describe('lessonHrefFromId', () => {
  it('id("u1/1-2-1")를 /learn/ 주소 뒤에 이어 차시 주소를 만든다(끝의 /는 한 번만)', () => {
    expect(lessonHrefFromId('/ai-physical-computing/learn/', 'u1/1-2-1')).toBe('/ai-physical-computing/learn/u1/1-2-1/');
    expect(lessonHrefFromId('/ai-physical-computing/learn', 'u2/2-1-r')).toBe('/ai-physical-computing/learn/u2/2-1-r/');
  });
});
