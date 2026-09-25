import { describe, expect, it } from 'vitest';
import { CURRICULUM, getUnitCurriculum, type PlannedLesson } from '../../../src/components/lesson/curriculum.ts';
import { LESSON_SLUG_PATTERN } from '../../../src/components/lesson/lesson-data.ts';

const allLessons: (PlannedLesson & { unit: number })[] = CURRICULUM.flatMap((unit) =>
  unit.sections.flatMap((section) => section.lessons.map((lesson) => ({ ...lesson, unit: unit.unit }))),
);

describe('배우기 차례표(src/components/lesson/curriculum.ts, PLAN §2.2)', () => {
  it('대단원 I~IV가 순서대로 있고 교과서 31차시·보충 9차시·읽기 자료 2(2-1-R, IV단원 프로젝트 안내)·대단원 마무리 3이다(PLAN §1.1)', () => {
    expect(CURRICULUM.map((unit) => unit.unit)).toEqual([1, 2, 3, 4]);
    const count = (kind: PlannedLesson['kind']) => allLessons.filter((lesson) => lesson.kind === kind).length;
    expect(count('textbook')).toBe(31);
    expect(count('supplement')).toBe(9);
    expect(count('reading')).toBe(2);
    expect(count('review')).toBe(3);
    expect(getUnitCurriculum(2)?.sections.map((section) => section.title)).toEqual([
      '01 디스플레이 장치 제어',
      '02 출력 장치 제어',
      '대단원 마무리',
    ]);
    expect(getUnitCurriculum(5)).toBeUndefined();
    // IV단원 프로젝트 안내는 원고에 없는 읽기 자료(원천 supplement, 교과서 쪽 없음)
    const project = getUnitCurriculum(4)?.sections.flatMap((section) => section.lessons).find((lesson) => lesson.label === 'IV-프로젝트');
    expect(project).toMatchObject({ slug: 'project', kind: 'reading', source: 'supplement', order: 7 });
    expect(project?.pages).toBeUndefined();
  });

  it('주소 이름(slug)은 영문 소문자·숫자·하이픈이고 대단원 안에서 겹치지 않는다(PD-09)', () => {
    for (const unit of CURRICULUM) {
      const slugs = unit.sections.flatMap((section) => section.lessons.map((lesson) => lesson.slug));
      expect(new Set(slugs).size, `u${unit.unit}`).toBe(slugs.length);
      for (const slug of slugs) {
        expect(slug, slug).toMatch(LESSON_SLUG_PATTERN);
      }
    }
    const labels = allLessons.map((lesson) => lesson.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('적힌 순서대로 order가 커져서 목록 순서가 PLAN 표 순서와 같다', () => {
    for (const unit of CURRICULUM) {
      const orders = unit.sections.flatMap((section) => section.lessons.map((lesson) => lesson.order));
      expect(orders, `u${unit.unit}`).toEqual([...orders].sort((a, b) => a - b));
      expect(new Set(orders).size, `u${unit.unit}`).toBe(orders.length);
    }
  });

  it('차시 번호의 가운데 숫자가 묶음(중단원) 번호와 같다', () => {
    for (const unit of CURRICULUM) {
      for (const section of unit.sections) {
        for (const lesson of section.lessons) {
          const numbered = /^(\d)-(\d)-/u.exec(lesson.label);
          if (numbered) {
            expect(Number(numbered[1]), lesson.label).toBe(unit.unit);
            expect(section.middleUnit, lesson.label).toBe(Number(numbered[2]));
          }
        }
      }
    }
  });

  it('원고 없음(코드만) 12차시와 원고만 있는 2차시가 PLAN §2.3과 같다', () => {
    const labelsOf = (source: PlannedLesson['source']) =>
      allLessons.filter((lesson) => lesson.source === source && lesson.kind === 'textbook').map((lesson) => lesson.label);
    expect(labelsOf('code-only')).toEqual([
      '1-3-1',
      '1-3-2',
      '1-3-3',
      '1-4-1',
      '1-4-2',
      '1-4-3',
      '4-1-1',
      '4-1-2',
      '4-1-3',
      '4-1-4',
      '4-2-1',
      '4-2-2',
    ]);
    expect(labelsOf('manuscript')).toEqual(['1-1-1', '3-1-1']);
  });
});
