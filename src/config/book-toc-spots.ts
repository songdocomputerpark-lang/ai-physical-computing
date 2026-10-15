/**
 * 홈 "차례" 그림 위의 투명 링크 자리(판 1.4.0 — DECISIONS C132).
 *
 * 출판본 4쪽·5쪽 차례를 그림(public/images/book/toc-1.webp·toc-2.webp)으로 보이고, 절 한 줄마다 투명한 링크(`<a>`)를 **그림 크기 대비 퍼센트**로 얹는다.
 * 그림이 줄어도 링크가 함께 줄어든다. 링크 하나 = 절 하나이고 id는 절 번호(book-outline.ts)다.
 *
 * 좌표 읽는 법: left·top은 그림 왼쪽 위에서 잰 거리, width·height는 링크 크기 — 모두 그림 폭·높이에 대한 % 값이다.
 * 처음 값은 그림(1192×1560px)을 눈으로 보고 한 줄씩 잰 픽셀 박스를 퍼센트로 바꾼 것이다(박스 높이 38px, 줄 간격 42px).
 * 그림을 바꾸면(출판본이 바뀌면) 이 값을 다시 잰다 — 모든 절이 한 번씩 있는지, 겹치지 않는지는 tests/unit/home/book-toc-spots.test.ts가 지킨다.
 *
 * 링크가 가는 곳·이름(title·aria-label)은 홈 화면이 정한다(home-lessons.ts): 쪽 파일이 있으면 /book/<id>/, 없으면 짝 웹 차시, 둘 다 없으면 링크 없음.
 */

/** 차례 그림 한 장(출판본 한 쪽) */
export interface BookTocImage {
  /** 1 = 출판본 4쪽(1·2단원), 2 = 5쪽(3·4단원) */
  readonly image: 1 | 2;
  /** 사이트 안 그림 경로(base 없음, withBase로 붙인다) */
  readonly src: string;
  readonly width: number;
  readonly height: number;
  /** 그림 대체 글(낱말 목록은 그림 속 차례 글자와 같게) */
  readonly alt: string;
  /** 이 그림에 담긴 대단원 번호 */
  readonly units: readonly (1 | 2 | 3 | 4)[];
}

export interface BookTocSpot {
  /** 절 번호(book-outline.ts의 id) */
  readonly id: string;
  readonly image: 1 | 2;
  /** 그림 폭 대비 왼쪽 거리(%) */
  readonly left: number;
  /** 그림 높이 대비 위쪽 거리(%) */
  readonly top: number;
  /** 그림 폭 대비 링크 폭(%) */
  readonly width: number;
  /** 그림 높이 대비 링크 높이(%) */
  readonly height: number;
}

export const BOOK_TOC_IMAGES: readonly BookTocImage[] = Object.freeze([
  Object.freeze({
    image: 1,
    src: 'images/book/toc-1.webp',
    width: 1192,
    height: 1560,
    alt: '교과서 차례 왼쪽 쪽: 1단원 영상 처리 인공지능(인공지능과 인식, 핸드 트래킹, 페이스 메시, 포즈 트래킹과 음성 인식)과 2단원 피지컬 컴퓨팅(디스플레이 장치 제어, 출력 장치 제어)의 절 이름과 시작 쪽',
    units: Object.freeze([1, 2] as const),
  }),
  Object.freeze({
    image: 2,
    src: 'images/book/toc-2.webp',
    width: 1192,
    height: 1560,
    alt: '교과서 차례 오른쪽 쪽: 3단원 인공지능과 피지컬 컴퓨팅(인공지능 피지컬 통신 방법)과 4단원 지능화 사물 개발 프로젝트(얼굴 인식 기반 비접촉 마우스 컨트롤러 개발, 인공지능 신호 기반 물리적 피드백 시스템 제작)의 절 이름과 시작 쪽',
    units: Object.freeze([3, 4] as const),
  }),
]);

function spot(id: string, image: 1 | 2, left: number, top: number, width: number, height: number): BookTocSpot {
  return Object.freeze({ id, image, left, top, width, height });
}

/** 한 줄 높이 2.44% = 38px(그림 높이 1560px 기준). 줄 간격은 42px(2.69%)라 위아래 링크 사이에 4px 틈이 있다. */
export const BOOK_TOC_SPOTS: readonly BookTocSpot[] = Object.freeze([
  // 4쪽 왼쪽 칸: 1단원
  spot('1-1-1', 1, 15.1, 43.21, 28.94, 2.44),
  spot('1-1-2', 1, 15.1, 45.9, 28.94, 2.44),
  spot('1-1-3', 1, 15.1, 48.59, 28.94, 2.44),
  spot('1-2-1', 1, 15.1, 56.22, 28.94, 2.44),
  spot('1-2-2', 1, 15.1, 58.91, 28.94, 2.44),
  spot('1-2-3', 1, 15.1, 61.6, 28.94, 2.44),
  spot('1-3-1', 1, 15.1, 69.17, 28.94, 2.44),
  spot('1-3-2', 1, 15.1, 71.86, 28.94, 2.44),
  spot('1-3-3', 1, 15.1, 74.55, 28.94, 2.44),
  spot('1-4-1', 1, 15.1, 82.18, 28.94, 2.44),
  spot('1-4-2', 1, 15.1, 84.87, 28.94, 2.44),
  spot('1-4-3', 1, 15.1, 87.56, 28.94, 2.44),
  // 4쪽 오른쪽 칸: 2단원
  spot('2-1-1', 1, 56.63, 43.21, 28.52, 2.44),
  spot('2-1-2', 1, 56.63, 45.9, 28.52, 2.44),
  spot('2-1-3', 1, 56.63, 48.59, 28.52, 2.44),
  spot('2-1-4', 1, 56.63, 51.28, 28.52, 2.44),
  spot('2-1-5', 1, 56.63, 53.97, 28.52, 2.44),
  spot('2-2-1', 1, 56.63, 68.21, 28.52, 2.44),
  spot('2-2-2', 1, 56.63, 70.9, 28.52, 2.44),
  spot('2-2-3', 1, 56.63, 73.59, 28.52, 2.44),
  spot('2-2-4', 1, 56.63, 76.28, 28.52, 2.44),
  // 5쪽 왼쪽 칸: 3단원
  spot('3-1-1', 2, 20.3, 48.78, 26.17, 2.44),
  spot('3-1-2', 2, 20.3, 51.47, 26.17, 2.44),
  spot('3-1-3', 2, 20.3, 54.17, 26.17, 2.44),
  spot('3-1-4', 2, 20.3, 56.86, 26.17, 2.44),
  // 5쪽 오른쪽 칸: 4단원
  spot('4-1-1', 2, 58.98, 48.78, 28.52, 2.44),
  spot('4-1-2', 2, 58.98, 51.47, 28.52, 2.44),
  spot('4-1-3', 2, 58.98, 54.17, 28.52, 2.44),
  spot('4-1-4', 2, 58.98, 56.86, 28.52, 2.44),
  spot('4-2-1', 2, 58.98, 76.03, 28.52, 2.44),
  spot('4-2-2', 2, 58.98, 78.72, 28.52, 2.44),
  spot('4-2-3', 2, 58.98, 81.41, 28.52, 2.44),
]);

/** 링크 자리의 CSS 한 줄(`left:15.1%;top:43.21%;width:28.94%;height:2.44%`) */
export function spotStyle(spotData: Pick<BookTocSpot, 'left' | 'top' | 'width' | 'height'>): string {
  return `left:${spotData.left}%;top:${spotData.top}%;width:${spotData.width}%;height:${spotData.height}%`;
}
