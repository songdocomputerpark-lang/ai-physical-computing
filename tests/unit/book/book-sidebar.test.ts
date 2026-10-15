// 교과서 쪽의 왼쪽 차례(src/components/book/book-sidebar.ts)와 웹 차시 쪽 단원 목록(unitSidebarOutline)이 같은 모양(SidebarOutline)을 낸다
import { describe, expect, it } from 'vitest';
import { bookSidebarOutline } from '../../../src/components/book/book-sidebar.ts';
import { publishedBooks, type BookEntryLike } from '../../../src/components/book/book-data.ts';
import { toLessonSummary } from '../../../src/components/lesson/lesson-data.ts';
import { unitSidebarOutline } from '../../../src/components/lesson/sidebar-outline.ts';
import { bookSchema, lessonSchema } from '../../../src/config/content-schemas.ts';
import { getLearnUnit } from '../../../src/config/nav.ts';

function entry(id: string, fields: Record<string, unknown>): BookEntryLike {
  return { id, data: bookSchema.parse({ id, title: `${id} 제목`, order: 1, pages: '1', ...fields }) };
}

const books = publishedBooks([
  entry('front', { title: '머리말', order: 0, pages: '2~3' }),
  entry('u2-intro', { title: '피지컬 컴퓨팅', unit: 2, order: 0, pages: '114~115' }),
  entry('2-1-1', { title: '환경의 이해', unit: 2, part: '01 디스플레이 장치 제어', order: 1, pages: '116~123', lesson: '2-1-1' }),
  entry('2-1-2', { title: 'LCD 제어하기', unit: 2, part: '01 디스플레이 장치 제어', order: 2, pages: '124~131', lesson: '2-1-2' }),
  entry('2-2-1', { title: '버저 제어하기', unit: 2, part: '02 출력 장치 제어', order: 1, pages: '154~160' }),
  entry('u2-review', { title: '대단원 마무리하기', unit: 2, order: 9, pages: '180~181' }),
]);

const lessons = [
  toLessonSummary({ id: 'u2/2-1-2', data: lessonSchema.parse({ title: 'LCD 제어하기', unit: 2, order: 2, label: '2-1-2' }) }),
];

describe('교과서 차례(bookSidebarOutline)', () => {
  const outline = bookSidebarOutline(books, lessons, books.find((book) => book.id === '2-1-2')!);

  it('앞 부속·대단원 시작·중단원 묶음·대단원 마무리가 쪽 순서대로 묶인다', () => {
    expect(outline.groups.map((group) => group.title)).toEqual(['시작', '2단원 시작', '2단원 · 01 디스플레이 장치 제어', '2단원 · 02 출력 장치 제어', '2단원 마무리']);
    expect(outline.groups[2]?.items.map((item) => [item.id, item.label, item.href])).toEqual([
      ['2-1-1', '2-1-1', '/ai-physical-computing/book/2-1-1/'],
      ['2-1-2', '2-1-2', '/ai-physical-computing/book/2-1-2/'],
    ]);
  });

  it('제목이 번호 이름과 같은 말을 하는 항목(머리말·마무리)은 번호 이름을 비워 한 번만 보인다', () => {
    const items = outline.groups.flatMap((group) => group.items);
    expect(items.find((item) => item.id === 'front')).toMatchObject({ label: '', title: '머리말' });
    expect(items.find((item) => item.id === 'u2-review')).toMatchObject({ label: '', title: '대단원 마무리하기' });
    // 다른 말이면 번호 이름이 남는다
    expect(items.find((item) => item.id === 'u2-intro')).toMatchObject({ label: '2단원 시작', title: '피지컬 컴퓨팅' });
    expect(items.find((item) => item.id === '2-1-2')).toMatchObject({ label: '2-1-2', title: 'LCD 제어하기' });
  });

  it('지금 쪽 id·이름·색·진도: 짝 웹 차시가 있으면 그 진도 id, 없으면 쪽 전용 id, 앞 부속은 진도 없음', () => {
    expect(outline.currentId).toBe('2-1-2');
    expect(outline.navLabel).toBe('교과서 차례');
    expect(outline.unit).toBe(2);
    expect(outline.showProgress).toBe(false);
    const items = outline.groups.flatMap((group) => group.items);
    expect(items.find((item) => item.id === '2-1-2')?.progressId).toBe('u2/2-1-2');
    expect(items.find((item) => item.id === '2-2-1')?.progressId).toBe('u2/book-2-2-1');
    expect(items.find((item) => item.id === 'front')?.progressId).toBeUndefined();
  });
});

describe('웹 차시 단원 목록(unitSidebarOutline)', () => {
  it('같은 SidebarOutline 모양: 이름·단원 색·진도 표시를 켠다', () => {
    const outline = unitSidebarOutline(getLearnUnit(2), lessons, 'u2/2-1-2');
    expect(outline.navLabel).toBe('단원 차시 목록');
    expect(outline.summaryLabel).toBe('이 단원 차시 목록 펼치기');
    expect(outline.unit).toBe(2);
    expect(outline.showProgress).toBe(true);
    expect(outline.progressLabel).toBe('2단원');
    const item = outline.groups.flatMap((group) => group.items).find((candidate) => candidate.id === 'u2/2-1-2');
    expect(item).toMatchObject({ progressId: 'u2/2-1-2', label: '2-1-2', href: '/ai-physical-computing/learn/u2/2-1-2/' });
  });

  it('대단원 마무리 항목은 "II-마무리" 대신 읽히는 이름 "2단원 마무리" 하나만 보인다(차시 id·주소는 그대로)', () => {
    const withReview = [
      ...lessons,
      toLessonSummary({ id: 'u2/review', data: lessonSchema.parse({ title: '대단원 마무리하기', unit: 2, order: 99, kind: 'review', label: 'II-마무리' }) }),
    ];
    const outline = unitSidebarOutline(getLearnUnit(2), withReview, 'u2/review');
    const review = outline.groups.flatMap((group) => group.items).find((candidate) => candidate.id === 'u2/review');
    expect(review).toMatchObject({ progressId: 'u2/review', label: '', title: '2단원 마무리', href: '/ai-physical-computing/learn/u2/review/' });
    expect(JSON.stringify(outline)).not.toContain('II-마무리');
  });
});
