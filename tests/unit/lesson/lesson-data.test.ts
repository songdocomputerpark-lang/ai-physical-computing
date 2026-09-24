import { describe, expect, it } from 'vitest';
import { CURRICULUM } from '../../../src/components/lesson/curriculum.ts';
import {
  STANDARDS_PENDING_TEXT,
  buildUnitOutline,
  checkLessons,
  countOutline,
  difficultyText,
  findNeighbors,
  formatDuration,
  kindBadge,
  labLink,
  labOfExampleFile,
  lessonBreadcrumb,
  lessonDocumentTitle,
  lessonSlug,
  materialsText,
  outlineBadges,
  pagesText,
  publishedLessons,
  toLessonSummary,
  virtualBoardText,
  type LessonEntryLike,
  type OutlineSection,
} from '../../../src/components/lesson/lesson-data.ts';
import { lessonSchema } from '../../../src/config/content-schemas.ts';
import { getLearnUnit, getPage } from '../../../src/config/nav.ts';
import { withBase } from '../../../src/lib/url.ts';

/** 콘텐츠 컬렉션 항목 흉내: frontmatter를 실제 규칙(lessonSchema)으로 읽어 기본값까지 채운다. */
function entry(id: string, frontmatter: Record<string, unknown> = {}): LessonEntryLike {
  return {
    id,
    data: lessonSchema.parse({ title: `${id} 제목`, unit: 1, order: 1, ...frontmatter }),
    filePath: `content/lessons/${id}.md`,
  };
}

function labels(section: OutlineSection | undefined): string[] {
  return section?.items.map((item) => `${item.label}:${item.status}`) ?? [];
}

describe('차시 요약(src/components/lesson/lesson-data.ts)', () => {
  it('주소는 frontmatter unit과 파일 이름으로 정하고, label이 없으면 파일 이름을 대문자로 쓴다', () => {
    const v4 = toLessonSummary(entry('u1/v4', { title: '블러와 에지', order: 3.4, kind: 'supplement' }));
    expect(lessonSlug('u1/v4')).toBe('v4');
    expect(v4).toMatchObject({ unit: 1, slug: 'v4', label: 'V4', path: '/learn/u1/v4/', href: withBase('learn/u1/v4/') });
    expect(v4.standards).toEqual([]);
    expect(v4.materials).toEqual([]);

    const moved = toLessonSummary(entry('extra/2-1-1', { unit: 2, label: '2-1-1' }));
    expect(moved.path).toBe('/learn/u2/2-1-1/');
  });

  it('draft 차시는 빼고 대단원 → order → 차시 번호(숫자 크기) 순서로 늘어놓는다', () => {
    const lessons = publishedLessons([
      entry('u2/2-1-1', { unit: 2, order: 1, label: '2-1-1' }),
      entry('u1/1-2-10', { order: 5, label: '1-2-10' }),
      entry('u1/1-2-9', { order: 5, label: '1-2-9' }),
      entry('u1/1-1-1', { order: 1, label: '1-1-1' }),
      entry('u1/secret', { order: 2, draft: true }),
    ]);
    expect(lessons.map((lesson) => lesson.label)).toEqual(['1-1-1', '1-2-9', '1-2-10', '2-1-1']);
  });

  it('이전·다음 차시는 대단원이 달라도 이어지고, 처음·끝·없는 id는 비어 있다', () => {
    const lessons = publishedLessons([
      entry('u1/1-1-1', { order: 1, label: '1-1-1' }),
      entry('u1/v4', { order: 3.4, kind: 'supplement' }),
      entry('u2/2-1-1', { unit: 2, order: 1, label: '2-1-1' }),
    ]);
    expect(findNeighbors(lessons, 'u1/1-1-1')).toEqual({ previous: undefined, next: lessons[1] });
    expect(findNeighbors(lessons, 'u1/v4')).toEqual({ previous: lessons[0], next: lessons[2] });
    expect(findNeighbors(lessons, 'u2/2-1-1').next).toBeUndefined();
    expect(findNeighbors(lessons, 'u9/none')).toEqual({});
  });
});

describe('차시 파일 점검(checkLessons)', () => {
  it('두 파일이 같은 주소를 쓰면 오류로 알린다(빌드를 멈춤)', () => {
    const issues = checkLessons([entry('u1/intro', { label: 'A' }), entry('extra/intro', { label: 'B' })]);
    const errors = issues.filter((issue) => issue.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('/learn/u1/intro/');
    expect(errors[0]?.message).toContain('content/lessons/u1/intro.md');
    expect(errors[0]?.message).toContain('content/lessons/extra/intro.md');
  });

  it('파일 이름 글자·폴더와 unit 불일치·겹치는 차시 번호는 경고만 남긴다', () => {
    const issues = checkLessons([
      entry('u1/사진-1', { label: '1-1-9' }),
      entry('u2/1-1-1', { unit: 1, label: '1-1-1' }),
      entry('u1/1-1-1-copy', { label: '1-1-1' }),
      entry('u1/hidden', { label: '1-1-1', draft: true }),
    ]);
    expect(issues.every((issue) => issue.level === 'warning')).toBe(true);
    expect(issues.map((issue) => issue.id)).toEqual(['u1/사진-1', 'u2/1-1-1', 'u1/1-1-1-copy']);
    expect(issues[0]?.message).toContain('PD-09');
    expect(issues[1]?.message).toContain('u2 폴더');
    expect(issues[2]?.message).toContain('차시 번호 1-1-1이');
  });
});

describe('대단원 목록(buildUnitOutline)', () => {
  const sample = publishedLessons([
    entry('u1/1-1-1', { title: '인공지능 응용 프로그램과 에이전트', order: 1, label: '1-1-1', duration: 50 }),
    entry('u1/v4', { title: '블러와 에지', order: 3.4, kind: 'supplement', label: 'V4' }),
  ]);

  it('차례표의 묶음 순서를 따르고, md가 있는 차시만 링크 카드(ready)가 된다', () => {
    const sections = buildUnitOutline(1, sample);
    expect(sections.map((section) => section.key)).toEqual(['u1-01', 'u1-basics', 'u1-02', 'u1-03', 'u1-04', 'u1-review']);
    expect(labels(sections[0])).toEqual(['1-1-1:ready', '1-1-2:planned', '1-1-3:planned']);
    expect(labels(sections[1])).toEqual(['V1:planned', 'V2:planned', 'V3:planned', 'V4:ready', 'V5:planned']);

    const first = sections[0]?.items[0];
    expect(first?.source).toBe('manuscript');
    expect(first?.pages).toBe('008~012');
    expect(first?.lesson?.href).toBe(withBase('learn/u1/1-1-1/'));
    expect(countOutline(sections)).toEqual({ ready: 2, planned: 16 });
  });

  it('차례표에 없는 새 md도 코드 수정 없이 알맞은 묶음에 들어간다', () => {
    const lessons = publishedLessons([
      entry('u1/1-2-4', { title: '새 핸드 트래킹 차시', order: 6.5, label: '1-2-4' }),
      entry('u1/v6', { title: '새 보충 차시', order: 3.6, kind: 'supplement' }),
      entry('u1/wrap-up', { title: '정리 문제', order: 100, kind: 'review', label: 'I 정리' }),
      entry('u1/1-5-1', { title: '새 중단원 차시', order: 13, label: '1-5-1' }),
      entry('u1/x1', { title: '맨 앞 차시', order: 0.5, label: 'X1' }),
    ]);
    const sections = buildUnitOutline(1, lessons);
    const byKey = new Map(sections.map((section) => [section.key, section]));

    expect(labels(byKey.get('u1-02'))).toEqual(['1-2-1:planned', '1-2-2:planned', '1-2-3:planned', '1-2-4:ready']);
    expect(labels(byKey.get('u1-basics')).at(-1)).toBe('V6:ready');
    expect(labels(byKey.get('u1-review'))).toEqual(['I-마무리:planned', 'I 정리:ready']);
    expect(labels(byKey.get('u1-01'))[0]).toBe('X1:ready');
    expect(byKey.get('u1-05')?.title).toBe('05 중단원(이름 준비 중)');
    expect(sections.map((section) => section.key).slice(-2)).toEqual(['u1-05', 'u1-review']);
  });

  it('차시 번호가 달라도 파일 이름(slug)이 같으면 차례표 자리에 들어가고, 제목은 md를 따른다', () => {
    const lessons = publishedLessons([entry('u1/v2', { title: '색과 흑백', order: 3.2, kind: 'supplement', label: '보충2' })]);
    const basics = buildUnitOutline(1, lessons).find((section) => section.key === 'u1-basics');
    expect(basics?.items[1]).toMatchObject({ label: '보충2', title: '색과 흑백', status: 'ready', source: 'supplement' });
  });

  it('차례표가 비어 있어도 차시와 대단원 마무리 묶음을 만든다', () => {
    const lessons = publishedLessons([
      entry('u4/a', { unit: 4, order: 1, label: 'A' }),
      entry('u4/review', { unit: 4, order: 99, kind: 'review', label: 'IV-마무리' }),
    ]);
    const sections = buildUnitOutline(4, lessons, []);
    expect(sections.map((section) => [section.key, section.title])).toEqual([
      ['u4-lessons', '차시'],
      ['u4-review', '대단원 마무리'],
    ]);
    expect(buildUnitOutline(3, lessons, CURRICULUM).every((section) => section.items.every((item) => item.status === 'planned'))).toBe(
      true,
    );
  });
});

describe('뱃지·표시 문장', () => {
  it('성취기준이 비면 C8 문장을 쓴다', () => {
    expect(STANDARDS_PENDING_TEXT).toBe('성취기준 코드 확인 중');
  });

  it('카드 딱지: 준비 중·원고 없음, 종류 표시: 보충·읽기 자료', () => {
    expect(outlineBadges({ status: 'planned', source: 'code-only' }).map((badge) => badge.text)).toEqual(['준비 중', '원고 없음']);
    expect(outlineBadges({ status: 'ready', source: 'manuscript' })).toEqual([]);
    expect(kindBadge('supplement')).toBe('보충');
    expect(kindBadge('reading')).toBe('읽기 자료');
    expect(kindBadge('textbook')).toBeUndefined();
    expect(kindBadge('review')).toBeUndefined();
  });

  it('소요 시간·난이도·가상 보드·준비물·교과서 쪽 문장', () => {
    expect(formatDuration(50)).toBe('50분');
    expect(formatDuration(60)).toBe('1시간');
    expect(formatDuration(100)).toBe('1시간 40분');
    expect(formatDuration(undefined)).toBeUndefined();
    expect(difficultyText(1)).toBe('쉬움');
    expect(difficultyText(3)).toBe('어려움');
    expect(difficultyText(undefined)).toBeUndefined();
    expect(virtualBoardText(true)).toBe('가상 보드로 끝까지 할 수 있어요');
    expect(virtualBoardText(false)).toBe('실제 보드가 있어야 해요');
    expect(virtualBoardText(undefined)).toBeUndefined();
    expect(materialsText([])).toBe('따로 준비할 것 없음');
    expect(materialsText(['웹캠', '샘플 이미지'])).toBe('웹캠, 샘플 이미지');
    expect(pagesText('008~012')).toBe('008~012쪽');
    expect(pagesText('141')).toBe('141쪽');
    expect(pagesText('파일명 p55·p58')).toBe('파일명 p55·p58');
  });

  it('탭 제목은 보충·읽기 자료를 괄호로 밝힌다(PD-07)', () => {
    expect(lessonDocumentTitle({ label: 'V4', title: '블러와 에지', kind: 'supplement' })).toBe('V4 (보충) 블러와 에지');
    expect(lessonDocumentTitle({ label: '2-1-R', title: 'OLED 디스플레이', kind: 'reading' })).toBe('2-1-R (읽기 자료) OLED 디스플레이');
    expect(lessonDocumentTitle({ label: '1-1-1', title: '에이전트', kind: 'textbook' })).toBe('1-1-1 에이전트');
  });

  it('실습실 링크는 사이트 지도 주소 뒤에 ?example=예제 경로를 붙인다', () => {
    const link = labLink('vision', 'vision/u1/v4-blur-edge.py');
    expect(link.label).toBe(getPage('labs-vision').label);
    expect(link.href).toBe(`${getPage('labs-vision').href}?example=vision%2Fu1%2Fv4-blur-edge.py`);
    expect(labLink('esp32').href).toBe(getPage('labs-esp32').href);
  });

  it('예제마다 경로의 첫 칸으로 실습실을 고른다(통신 차시의 보드 쪽 예제가 영상처리 실습실로 가지 않게 — P4-08)', () => {
    expect(labOfExampleFile('esp32/u4/c3-neopixel-count-rx.py')).toBe('esp32');
    expect(labOfExampleFile('vision/u4/c3-finger-count-send.py')).toBe('vision');
    expect(labOfExampleFile('desktop/01-screen-size.py')).toBe('vision');
    expect(labOfExampleFile('other/a.py')).toBeUndefined();
    expect(labLink(labOfExampleFile('esp32/u3/3-1-2-uart-laser.py')!, 'esp32/u3/3-1-2-uart-laser.py').href).toBe(
      `${getPage('labs-esp32').href}?example=esp32%2Fu3%2F3-1-2-uart-laser.py`,
    );
  });

  it('차시 현재 위치는 홈 › 배우기 › 대단원 › 차시(마지막 칸은 링크 없음)', () => {
    expect(lessonBreadcrumb({ unit: 1, label: '1-1-1', title: '에이전트' })).toEqual([
      { label: '홈', href: getPage('home').href },
      { label: '배우기', href: getPage('learn').href },
      { label: getLearnUnit(1).label, href: getLearnUnit(1).href },
      { label: '1-1-1 에이전트' },
    ]);
  });
});
