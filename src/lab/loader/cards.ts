/**
 * "로딩되는 동안 읽는 1분 개념" 카드(PLAN §5.4, SPEC §6.1). 파이썬 엔진·OpenCV를 받는 동안(첫 방문 20MB 남짓) 읽을 거리다.
 *
 * 규칙
 * - 사이트가 직접 쓴 글만 쓴다(원본 자료 인용 없음 — sources.yaml "사이트 자체 제작"). 고1이 처음 읽어도 이해되게 두세 문장.
 * - 용어는 용어사전 항목으로 이어 준다(링크는 withBase로 만든다 — 하위 경로가 빠지지 않게).
 * - 카드 순서 = 첫 실습(에지 검출)에서 실제로 일어나는 순서: 픽셀 → 회색 → 흐리게 → 에지 → 임계값.
 * - 여기 글을 고치면 tests/unit/loading/cards.test.ts의 길이·링크 검사가 함께 지킨다.
 */
import { withBase } from '../../lib/url.ts';

export interface ConceptCard {
  /** 카드 id(영문 소문자·숫자·하이픈) */
  readonly id: string;
  readonly title: string;
  /** 두세 문장(각 문장은 짧게) */
  readonly body: readonly string[];
  /** 실습실 코드에서 이 개념이 나오는 줄(있으면 보여 준다) */
  readonly code?: string;
  /** 용어사전 항목 링크 */
  readonly link?: { readonly href: string; readonly text: string };
}

export const CONCEPT_CARDS: readonly ConceptCard[] = Object.freeze([
  {
    id: 'pixel',
    title: '사진은 사실 숫자표예요',
    body: [
      '카메라가 찍은 한 장은 작은 점(픽셀)이 가로세로로 빼곡히 놓인 표예요.',
      '640×480 사진이면 점이 307,200개, 점마다 색의 밝기가 숫자로 적혀 있어요.',
      '그래서 "사진을 다룬다"는 말은 곧 "숫자표를 계산한다"는 뜻이에요.',
    ],
    code: 'print(frame.shape)  # (480, 640, 3)',
    link: { href: withBase('glossary/#pixel'), text: '용어사전: 픽셀' },
  },
  {
    id: 'gray',
    title: '색을 버리면 계산이 빨라져요',
    body: [
      '컬러 사진은 점마다 파랑·초록·빨강 세 숫자를 갖고 있어요.',
      '밝기 하나로 줄이면(회색조) 숫자가 3분의 1로 줄어 계산이 빨라지고, 모양을 찾기도 쉬워져요.',
      '첫 실습이 회색으로 바꾸고 시작하는 이유예요.',
    ],
    code: 'gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)',
    link: { href: withBase('glossary/#bgr-rgb'), text: '용어사전: BGR과 RGB' },
  },
  {
    id: 'blur',
    title: '흐리게 만들면 더 잘 보여요',
    body: [
      '사진에는 먼지 같은 작은 얼룩(잡음)이 섞여 있어요.',
      '주변 점들의 평균으로 살짝 흐리게 만들면 얼룩은 사라지고 큰 모양만 남아요.',
      '흐리게 하는 정도(blur_size)를 너무 키우면 진짜 모양까지 뭉개져요.',
    ],
    code: 'blurred = cv2.GaussianBlur(gray, (5, 5), 0)',
  },
  {
    id: 'edge',
    title: '에지는 "밝기가 갑자기 바뀌는 곳"이에요',
    body: [
      '물체의 테두리에서는 밝기가 뚝 떨어지거나 확 올라가요.',
      '옆 점과의 밝기 차이가 큰 곳만 골라 흰 선으로 그리면 윤곽선 그림이 돼요.',
      '컴퓨터는 "고양이"를 아는 게 아니라 이런 숫자 변화를 볼 뿐이에요.',
    ],
    code: 'edges = cv2.Canny(blurred, threshold, threshold * 2)',
    link: { href: withBase('glossary/#edge'), text: '용어사전: 에지' },
  },
  {
    id: 'threshold',
    title: '임계값은 "어디부터 선으로 볼까"예요',
    body: [
      '밝기 차이가 얼마 이상이어야 테두리로 칠지 정하는 기준이 임계값이에요.',
      '기준을 낮추면 희미한 것까지 선이 되고(지저분해짐), 높이면 뚜렷한 것만 남아요.',
      '준비가 끝나면 오른쪽 아래 슬라이더로 직접 움직여 보세요.',
    ],
    code: 'threshold = 100  # @slider 0 255 1',
    link: { href: withBase('glossary/#threshold'), text: '용어사전: 임계값' },
  },
]);

/** 다음 카드 번호(마지막 다음은 처음). step이 음수면 이전 카드. */
export function nextCardIndex(index: number, step = 1, count = CONCEPT_CARDS.length): number {
  if (count <= 0) {
    return 0;
  }
  return (((index + step) % count) + count) % count;
}

/** "3 / 5"처럼 보여 줄 글 */
export function cardCounterText(index: number, count = CONCEPT_CARDS.length): string {
  return `${Math.min(count, index + 1)} / ${count}`;
}
