// 교사 평가 길(판 1.7.0 구역 Z3 — 미해결 258·259·269·272) — 소스·콘텐츠를 읽어 약속을 지킨다.
// 화면에서 실제로 보이는지(평가 자료 상자 첫 줄·카드 주소·접힌 영역)는 tests/e2e/teacher.spec.ts가 본다.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEACHER_PAGES } from '../../../src/components/teacher/teacher-pages.ts';

const teacherHome = readFileSync('src/pages/teacher/index.astro', 'utf8');
const standardsPage = readFileSync('src/pages/teacher/standards/index.astro', 'utf8');
const faq = readFileSync('content/help/faq-teacher.md', 'utf8');

describe('교사용 자료실 첫 화면 — 평가 자료 상자(미해결 258)', () => {
  it('첫 줄이 "학생에게 나눠 줄 평가지(학습지·문항지)는 아직 없어요"이고, 대신 쓸 것(정답표·채점 기준 표)과 예시 차시 링크가 있다', () => {
    const first = teacherHome.slice(teacherHome.indexOf('data-teacher-assessment-first'));
    expect(first.slice(0, 900)).toContain('학생에게 나눠 줄 평가지(학습지·문항지)는 아직 없어요');
    expect(first.slice(0, 900)).toContain('확인 퀴즈와 정답표');
    expect(first.slice(0, 900)).toContain('채점 기준 표');
    expect(first.slice(0, 1200)).toContain('data-teacher-assessment-example');
    // 첫 줄은 평가 자료 제목 바로 아래, 옛 "평가 계획서는 아직 없어요" 문장보다 앞이다
    expect(teacherHome.indexOf('data-teacher-assessment-first')).toBeLessThan(teacherHome.indexOf('평가 계획서와 운영 계획서도 아직 없어요'));
    expect(teacherHome).toContain("lesson.summary.label === '2-1-2'");
  });

  it('표만 인쇄·복사하는 방법을 안내한다([표 인쇄]·[표 복사], 서버로 보내지 않음)', () => {
    const tools = teacherHome.slice(teacherHome.indexOf('data-teacher-assessment-tools'));
    expect(tools.slice(0, 700)).toContain('[표 인쇄]');
    expect(tools.slice(0, 700)).toContain('[표 복사]');
    expect(tools.slice(0, 900)).toContain('서버로 아무것도 보내지 않아요');
  });

  it('채점 기준 표가 있는 차시 수는 빌드 때 센다(손으로 적은 숫자가 없다) — 교과서·보충 차시가 모두 가지면 "모두"라고 한다', () => {
    expect(teacherHome).toContain('rubricSectionOf(lesson) !== undefined');
    expect(teacherHome).toContain('lessons.filter(rubricExpected)');
    expect(teacherHome).toMatch(/교과서·보충 차시 \$\{rubricTarget\}개 모두에 있어요/u);
  });
});

describe('"수업 화면 해 보기" 카드 주소(미해결 259, 걷기 N3)', () => {
  it('수업 화면이 바로 켜지는 주소(?view=slide)로 간다', () => {
    expect(teacherHome).toMatch(/const tryHref = tryLesson \? `\$\{tryLesson\.summary\.href\}\?view=slide`/u);
    expect(teacherHome).toContain('href: tryHref');
    // 다른 차시에서는 단추를 어디서 찾는지 카드 글에 있다
    expect(teacherHome).toContain('다른 차시는 쪽 위쪽의 [수업 화면] 단추로 열어요');
  });
});

describe('성취기준과 평가 방향 — 좁은 화면에서 영역을 접는다(미해결 272 ③, 걷기 B-47)', () => {
  it('영역마다 접는 칸(details)이 있고 제목(h3·id)은 요약 줄 안에 있다 — 차례의 #std-area-N이 그대로 닿는다', () => {
    expect(standardsPage).toMatch(/<details class="more std-area__details" open data-std-area-details>/u);
    expect(standardsPage).toMatch(/<summary>\s*<h3 id=\{`std-area-\$\{area\.area\}`\} class="std-area__title">/u);
    // 영역(section)과 data-standard-area는 그대로다(기존 시험이 쓴다)
    expect(standardsPage).toContain('data-standard-area={area.area}');
  });

  it('표가 카드로 쌓이는 폭(47.99rem)에서만 접고, 넓어지면 모두 펴고, 주소 #위치·인쇄는 details.ts 도우미가 편다', () => {
    expect(standardsPage).toContain("window.matchMedia('(max-width: 47.99rem)')");
    // 같은 폭에서 표가 카드로 쌓인다(두 규칙이 어긋나면 카드 모양인데 펼쳐 있거나 표 모양인데 접힌다)
    expect(standardsPage).toContain('@media (max-width: 47.99rem)');
    expect(standardsPage).toContain("import { installCollapsibleHelpers } from '../../../components/lesson/details.ts'");
    expect(standardsPage.indexOf('area.open = false')).toBeLessThan(standardsPage.indexOf('installCollapsibleHelpers();'));
  });
});

describe('선생님 FAQ(미해결 272 ①·258)', () => {
  it('"평가 계획서나 채점 기준이 있나요?"에 채점 기준 표(교과서·보충 차시 모두)와 [표 인쇄]·[표 복사]가 적혀 있다', () => {
    const answer = faq.slice(faq.indexOf('### 평가 계획서나 채점 기준이 있나요?'), faq.indexOf('### 학생에게 나눠 줄 평가지'));
    expect(answer).toContain('채점 기준 표');
    expect(answer).toContain('교과서 차시와 보충 차시에 모두 있어요');
    expect(answer).toContain('[표 인쇄]');
    expect(answer).toContain('[표 복사]');
  });

  it('"학생에게 나눠 줄 평가지(학습지·문항지)가 있나요?" 질문이 있어 평가지·학습지·문항지로 찾아진다', () => {
    const start = faq.indexOf('### 학생에게 나눠 줄 평가지(학습지·문항지)가 있나요?');
    expect(start).toBeGreaterThan(0);
    const answer = faq.slice(start, faq.indexOf('### 대단원 마무리의 정답은 어디에 있나요?'));
    expect(answer).toContain('아직 없어요');
    expect(answer).toContain('확인 퀴즈 3문제');
    expect(answer).toContain('채점 기준 표');
    expect(answer).toContain('/learn/u2/2-1-2/#교사용');
  });
});

describe('지도 요약 쪽 소개 글', () => {
  it('차시 교사용 안내 소개에 채점 기준 표와 표 인쇄·복사가 들어 있다', () => {
    const guides = TEACHER_PAGES.find((page) => page.id === 'guides');
    expect(guides?.description).toContain('채점 기준 표');
    expect(guides?.description).toContain('인쇄');
    expect(readFileSync('src/pages/teacher/guides/[unit].astro', 'utf8')).toContain('평가 포인트, 채점 기준 표, 자주 막히는 곳');
  });
});
