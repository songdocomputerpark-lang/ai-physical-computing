/**
 * 출판본 교과서의 차례(판 1.4.0 — DECISIONS C131·C132) — 중단원 9개·절 32개·대단원 마무리 4개의 이름과 쪽.
 *
 * 왜 이 파일이 따로 있나
 * - 홈의 "교과서 32절"·차례 그림(book-toc-spots.ts)·차시 카드는 **교과서 쪽(content/book/<id>.md)이 아직 없는 절도** 이름과 쪽을 보여야 한다.
 *   쪽 파일은 한 절씩 늘어나므로, 차례 자체는 출판본 4~5쪽 차례와 같은 값을 여기 한 곳에 둔다(순수 데이터 — 화면·빌드 어디서든 읽는다).
 * - 쪽 파일이 생기면 홈 카드는 **저절로** 그 쪽으로 이어진다(이름·쪽·매체는 쪽 파일 값이 먼저). 이 파일을 고칠 일은 출판본 차례가 바뀔 때뿐이다.
 * - 쪽 파일의 제목·쪽 범위가 이 파일과 어긋나면 tests/unit/home/book-outline.test.ts가 잡는다.
 *
 * 쪽 범위는 절 안쪽 쪽이다. 쪽 파일은 중단원 첫 절에 "중단원 시작(성취 계획) 쪽"을 앞에 붙일 수 있어(예: 2-1-1은 116~123) 그 범위가 이 값을 **품는** 것만 허락한다.
 * media는 쪽 파일(frontmatter media)이 생기기 전에 쓰는 어림값이다(차시 준비물·예제로 정함). 쪽 파일이 있으면 그 값을 쓴다.
 */
import type { BookData } from './content-schemas.ts';

/** 매체 표시(camera·mic·web·board) — 쪽 파일 frontmatter media와 같은 낱말 */
export type OutlineMedia = BookData['media'][number];

export type OutlineUnit = 1 | 2 | 3 | 4;

/** 중단원(출판본 차례 그림의 "01 인공지능과 인식" 같은 줄) */
export interface BookOutlinePart {
  readonly unit: OutlineUnit;
  /** 같은 대단원 안 몇 번째 중단원인지(1부터) */
  readonly index: number;
  /** 번호 포함 이름 — 쪽 파일의 frontmatter part와 글자까지 같다 */
  readonly title: string;
}

/** 절(출판본 차례 그림의 "1 인공지능 응용 프로그램과 에이전트 009" 같은 줄) */
export interface BookOutlineSection {
  /** 절 번호 = 쪽 파일 id = 웹 차시 label(소문자). 예: 2-1-2 */
  readonly id: string;
  readonly unit: OutlineUnit;
  /** 중단원 번호(1부터) */
  readonly part: number;
  readonly title: string;
  /** 절 안쪽 쪽 범위. 예: "124~131" */
  readonly pages: string;
  /** 쪽 파일이 생기기 전의 어림 매체 */
  readonly media: readonly OutlineMedia[];
}

/** 대단원 마무리하기(문제로 점검·프로그래밍으로 점검) */
export interface BookOutlineReview {
  /** 쪽 파일 id: u1-review … u4-review */
  readonly id: string;
  readonly unit: OutlineUnit;
  readonly title: string;
  readonly pages: string;
}

function part(unit: OutlineUnit, index: number, title: string): BookOutlinePart {
  return Object.freeze({ unit, index, title });
}

function section(id: string, title: string, pages: string, media: readonly OutlineMedia[]): BookOutlineSection {
  const [unit, partNo] = id.split('-').map(Number) as [OutlineUnit, number];
  return Object.freeze({ id, unit, part: partNo, title, pages, media: Object.freeze([...media]) });
}

function review(unit: OutlineUnit, pages: string): BookOutlineReview {
  return Object.freeze({ id: `u${unit}-review`, unit, title: '대단원 마무리하기', pages });
}

/** 중단원 9개(출판본 4~5쪽 차례) */
export const BOOK_OUTLINE_PARTS: readonly BookOutlinePart[] = Object.freeze([
  part(1, 1, '01 인공지능과 인식'),
  part(1, 2, '02 핸드 트래킹'),
  part(1, 3, '03 페이스 메시'),
  part(1, 4, '04 포즈 트래킹과 음성 인식'),
  part(2, 1, '01 디스플레이 장치 제어'),
  part(2, 2, '02 출력 장치 제어'),
  part(3, 1, '01 인공지능 피지컬 통신 방법'),
  part(4, 1, '01 얼굴 인식 기반 비접촉 마우스 컨트롤러 개발'),
  part(4, 2, '02 인공지능 신호 기반 물리적 피드백 시스템 제작'),
]);

/** 절 32개(출판본 차례 순서 = 쪽 순서) */
export const BOOK_OUTLINE_SECTIONS: readonly BookOutlineSection[] = Object.freeze([
  section('1-1-1', '인공지능 응용 프로그램과 에이전트', '9~12', []),
  section('1-1-2', '인공지능 영상 인식 기술의 원리', '13~18', ['camera']),
  section('1-1-3', '인공지능 인식 개발 환경', '19~23', ['camera']),
  section('1-2-1', '컴퓨터의 눈, 인간을 바라보다', '25~32', ['camera']),
  section('1-2-2', '검지로 여는 디지털 스케치', '33~41', ['camera']),
  section('1-2-3', '손끝 사이의 거리, 컴퓨터가 알아채다', '42~51', ['camera']),
  section('1-3-1', '방향을 감지하는 인공지능', '53~62', ['camera']),
  section('1-3-2', '하품의 순간을 포착하는 인공지능', '63~72', ['camera']),
  section('1-3-3', '인공지능 필터로 바꾸는 내 얼굴', '73~81', ['camera']),
  section('1-4-1', '몸으로 말해요! 동작 감지 인공지능', '83~92', ['camera']),
  section('1-4-2', '균형 잡힌 자세를 도와주는 인공지능', '93~102', ['camera']),
  section('1-4-3', '말을 글로 바꾸는 기술', '103~111', ['mic']),
  section('2-1-1', '피지컬 컴퓨팅 및 개발 환경의 이해', '117~123', ['board']),
  section('2-1-2', 'LCD 제어하기', '124~131', ['board']),
  section('2-1-3', 'OLED 제어하기', '132~141', ['board']),
  section('2-1-4', 'RGB LED와 레이저 제어하기', '142~147', ['board']),
  section('2-1-5', '네오픽셀 제어하기', '148~153', ['board']),
  section('2-2-1', '버저 제어하기', '155~160', ['board']),
  section('2-2-2', 'MP3 플레이어 제어하기', '161~166', ['board']),
  section('2-2-3', '팬 모터 제어하기', '167~172', ['board']),
  section('2-2-4', '서보모터 제어하기', '173~179', ['board']),
  section('3-1-1', '인공지능과 하드웨어 통신의 이해', '185~188', []),
  section('3-1-2', '인공지능 모델과 시리얼 통신', '189~194', ['camera', 'board']),
  section('3-1-3', '인공지능과 블루투스 통신', '195~200', ['camera', 'board']),
  section('3-1-4', '손과 동작으로 컴퓨터 제어하기', '201~207', ['camera']),
  section('4-1-1', '내 얼굴을 인식하는 인공지능의 눈', '213~222', ['camera']),
  section('4-1-2', '눈길 따라 움직이는 마우스 커서', '223~231', ['camera']),
  section('4-1-3', '윙크 한 번으로 더블 클릭!', '232~247', ['camera']),
  section('4-1-4', '블루투스로 데이터 전송하기', '248~257', ['camera', 'board']),
  section('4-2-1', '얼굴을 따라 움직이는 서보모터', '259~275', ['camera', 'board']),
  section('4-2-2', '소리와 빛으로 상태를 알려 줘', '276~285', ['camera', 'board']),
  section('4-2-3', '세상과 나를 잇는 인공지능 보조기구', '286~289', []),
]);

/** 대단원 마무리하기 4개 */
export const BOOK_OUTLINE_REVIEWS: readonly BookOutlineReview[] = Object.freeze([
  review(1, '112~113'),
  review(2, '180~181'),
  review(3, '208~209'),
  review(4, '290~291'),
]);

/** 출판본이 가진 절의 수(홈 알약 "교과서 32절") */
export function bookSectionCount(): number {
  return BOOK_OUTLINE_SECTIONS.length;
}

/** 절 번호로 찾기 */
export function findOutlineSection(id: string): BookOutlineSection | undefined {
  return BOOK_OUTLINE_SECTIONS.find((candidate) => candidate.id === id.toLowerCase());
}

/** 대단원·중단원 번호로 중단원 이름 찾기 */
export function findOutlinePart(unit: number, index: number): BookOutlinePart | undefined {
  return BOOK_OUTLINE_PARTS.find((candidate) => candidate.unit === unit && candidate.index === index);
}
