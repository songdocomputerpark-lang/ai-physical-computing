/**
 * 교사용 자료실(/teacher/)의 아래 페이지 목록 — 자료실 첫 화면의 카드, 아래 페이지 위쪽의 자료실 메뉴(TeacherNav.astro),
 * 현재 위치(빵부스러기)가 이 목록 하나를 읽는다. 페이지를 더하거나 이름을 바꿀 때는 이 파일만 고친다.
 *
 * 사이트 지도(src/config/nav.ts)에는 자료실 한 칸(/teacher/)만 있다 — 아래 페이지는 공유 파일을 고치지 않고 여기서 관리한다
 * (구역 규약 src/lab/README.md 5.4). 현재 위치는 BaseLayout의 breadcrumb 배열로 넘긴다.
 * 제목(title)의 낱말 나열은 가운뎃점 대신 "과"·쉼표로 쓴다(nav.ts 머리말 — 좁은 화면 줄바꿈·사이트 검색 낱말 묶임).
 */
import { getPage, type BreadcrumbItem } from '../../config/nav.ts';
import { withBase } from '../../lib/url.ts';
import { TEACHER_PATHS } from './teacher-lessons.ts';

export interface TeacherPage {
  /** 영문 소문자·하이픈 식별자(테스트·data 속성에 쓴다) */
  readonly id: string;
  /** 메뉴에 보이는 짧은 이름 */
  readonly label: string;
  /** 페이지 제목(<h1>·브라우저 탭) */
  readonly title: string;
  /** 사이트 안 경로(base 없음) */
  readonly path: string;
  /** base를 붙인 링크 */
  readonly href: string;
  /** 카드·검색 설명에 쓰는 한 줄 */
  readonly description: string;
}

function page(input: Omit<TeacherPage, 'href'>): TeacherPage {
  return Object.freeze({ ...input, href: withBase(input.path) });
}

/** 자료실 아래 페이지(메뉴 순서) */
export const TEACHER_PAGES: readonly TeacherPage[] = Object.freeze([
  page({
    id: 'guides',
    label: '지도 요약',
    title: '차시별 지도 요약',
    path: TEACHER_PATHS.guides,
    description: '모든 차시의 교사용 안내(지도안 요약, 평가 포인트, 자주 막히는 곳)를 대단원마다 한 페이지에 모았어요.',
  }),
  page({
    id: 'standards',
    label: '성취기준과 평가',
    title: '성취기준과 평가 방향',
    path: TEACHER_PATHS.standards,
    description: '성취기준 15개와 이어지는 차시, 과목 교육과정의 평가 방법, 성취기준마다 볼 것을 표로 정리했어요.',
  }),
  page({
    id: 'corrections',
    label: '원고 정정',
    title: '교과서 원고 정정 목록',
    path: TEACHER_PATHS.corrections,
    description: '교과서 원고에서 바로잡은 글자와 코드, 차시마다 사이트가 원고와 다르게 쓴 곳을 모았어요.',
  }),
  page({
    id: 'real-pc',
    label: '진짜 PC에서 돌리기',
    title: '진짜 PC에서 돌리기',
    path: TEACHER_PATHS.realPc,
    description: '브라우저 대신 컴퓨터에 파이썬과 토니(Thonny)를 설치해 교과서 코드를 그대로 돌리는 방법이에요.',
  }),
  page({
    id: 'faq',
    label: '자주 묻는 질문',
    title: '선생님이 자주 묻는 질문',
    path: TEACHER_PATHS.faq,
    description: '수업 준비, 평가, 교과서와 사이트가 다른 곳, 기록과 개인정보에 대해 자주 묻는 것을 모았어요.',
  }),
]);

/** id로 자료실 아래 페이지를 찾는다. 없으면 빌드가 멈추게 오류를 낸다 */
export function getTeacherPage(id: string): TeacherPage {
  const found = TEACHER_PAGES.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`교사용 자료실 페이지 목록(src/components/teacher/teacher-pages.ts)에 id "${id}"가 없어요.`);
  }
  return found;
}

/** 자료실 아래 페이지의 현재 위치: 홈 › 교사용 자료실 › (…) › 지금 페이지 */
export function teacherBreadcrumb(current: string, middle: readonly BreadcrumbItem[] = []): BreadcrumbItem[] {
  const home = getPage('home');
  const teacher = getPage('teacher');
  return [{ label: home.label, href: home.href }, { label: teacher.label, href: teacher.href }, ...middle, { label: current }];
}
