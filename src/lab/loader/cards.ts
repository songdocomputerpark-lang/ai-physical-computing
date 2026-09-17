/**
 * "로딩되는 동안 읽는 1분 개념" 카드(PLAN §5.4, SPEC §6.1). 파이썬 엔진·OpenCV를 받는 동안(첫 방문 20MB 남짓) 읽을 거리다.
 *
 * 규칙
 * - 사이트가 직접 쓴 글만 쓴다(원본 자료 인용 없음 — sources.yaml "사이트 자체 제작"). 고1이 처음 읽어도 이해되게 두세 문장.
 * - 용어는 용어사전 항목으로 이어 준다(링크는 withBase로 만든다 — 하위 경로가 빠지지 않게).
 * - 카드 순서 = 첫 실습(에지 검출)에서 실제로 일어나는 순서: 픽셀 → 회색 → 흐리게 → 에지 → 임계값.
 * - 여기 글을 고치면 tests/unit/loading/cards.test.ts의 길이·링크 검사가 함께 지킨다.
 * - (P3-11) 실습실마다 읽을 거리가 다르다: 영상처리는 사진·에지, ESP32는 핀·MicroPython. cardsForLab(labId)로 고른다.
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
/** ESP32 실습실에서 파이썬 엔진(12.9MB)을 받는 동안 읽는 카드 — 보드 개념 순서: 마이크로컨트롤러 → 핀 → MicroPython → PWM */
export const BOARD_CONCEPT_CARDS: readonly ConceptCard[] = Object.freeze([
  {
    id: 'board-brain',
    title: 'ESP32는 아주 작은 컴퓨터예요',
    body: [
      '손가락 두 개만 한 보드 안에 계산하는 칩과 저장 공간이 들어 있어요.',
      '화면도 키보드도 없지만, 파이썬 코드를 넣으면 LED·버저·모터를 스스로 움직여요.',
    ],
    link: { href: withBase('glossary/#microcontroller'), text: '용어사전: 마이크로컨트롤러' },
  },
  {
    id: 'board-pin',
    title: '핀은 보드와 부품을 잇는 문이에요',
    body: [
      '보드 양쪽에 번호가 적힌 금속 다리(핀)가 줄지어 있어요.',
      '코드에서 Pin(2)처럼 번호를 부르면 그 문으로 전기를 내보내거나 값을 읽어요.',
      '핀마다 할 수 있는 일이 조금씩 달라서, 예제의 배선 그림에 적힌 번호를 그대로 써요.',
    ],
    code: 'led = Pin(2, Pin.OUT)',
    link: { href: withBase('glossary/#gpio'), text: '용어사전: GPIO' },
  },
  {
    id: 'board-micropython',
    title: 'MicroPython은 보드용 파이썬이에요',
    body: [
      '컴퓨터에서 쓰는 파이썬을 작은 보드에 맞게 줄인 것이에요.',
      'print·if·for는 똑같고, 대신 machine처럼 보드만 가진 모듈이 있어요.',
      '가상 보드와 실물 보드가 같은 코드를 돌리는 까닭이에요.',
    ],
    link: { href: withBase('glossary/#micropython'), text: '용어사전: MicroPython' },
  },
  {
    id: 'board-digital',
    title: '핀이 아는 값은 0과 1이에요',
    body: [
      '디지털 핀은 0(0V, 꺼짐)과 1(3.3V, 켜짐) 두 가지만 내보내요.',
      '버튼을 읽을 때도 눌렸는지 아닌지를 0·1로 알려 줘요.',
    ],
    code: 'print(button.value())  # 0 또는 1',
    link: { href: withBase('glossary/#sensor'), text: '용어사전: 센서' },
  },
  {
    id: 'board-pwm',
    title: '빠르게 켜고 끄면 밝기가 돼요',
    body: [
      '0과 1만 낼 수 있어도, 1초에 수천 번 켜고 끄면 눈에는 중간 밝기로 보여요.',
      '켜진 시간의 비율(duty)을 바꾸면 LED 밝기·버저 소리·서보 각도를 정할 수 있어요.',
    ],
    code: 'PWM(Pin(27), freq=1000, duty=512)',
    link: { href: withBase('glossary/#pwm'), text: '용어사전: PWM' },
  },
]);

/** 이 실습실에서 보여 줄 카드(모르는 실습실은 영상처리 카드) */
export function cardsForLab(labId: string): readonly ConceptCard[] {
  return labId === 'esp32' ? BOARD_CONCEPT_CARDS : CONCEPT_CARDS;
}

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
