/**
 * 실습실 안내(/labs/)의 카드·"무엇을 할까요?" 고르기에 쓰는 내용(판 1.3.0).
 *
 * 제목·한 줄 설명·주소는 사이트 지도(src/config/nav.ts)에서 오고, 여기에는 **지도에 없는 것**만 둔다:
 * 카드 그림(아이콘 이름)·단원 색·"이럴 때 써요" 한 줄·"필요한 것" 칩. 새 실습실이 지도에 생기면 이 표에도 한 줄을 더한다
 * (tests/unit/labs/lab-cards.test.ts가 지도의 실습실마다 항목이 있는지 본다).
 *
 * 문장은 고1이 처음 읽어도 알 수 있게 쓴다. 칩은 "이게 있어야 하나?"를 바로 풀어 주는 짧은 낱말이다.
 * 파일 이름이 _로 시작해서 Astro가 페이지(주소)로 만들지 않는다.
 */
import type { IconName } from '../../components/common/icons.ts';

/** 필요한 것 칩 하나: ok = 없어도 되거나 쉬운 쪽(초록), note = 알아 둘 것(회색) */
export interface LabNeedChip {
  readonly text: string;
  readonly tone: 'ok' | 'note';
  readonly icon: IconName;
}

export interface LabCardInfo {
  /** 사이트 지도(src/config/nav.ts)의 id */
  readonly id: string;
  readonly icon: IconName;
  /** 카드 색(대단원 색 1~4). 없으면 파랑 */
  readonly unit?: 1 | 2 | 3 | 4;
  /** "이럴 때 써요" 한 줄(…할 때) */
  readonly useWhen: string;
  readonly needs: readonly LabNeedChip[];
}

export const LAB_CARD_INFO: readonly LabCardInfo[] = Object.freeze([
  {
    id: 'labs-vision',
    icon: 'camera',
    unit: 1,
    useWhen: '카메라로 손이나 얼굴을 알아보는 인공지능을 만들어 보고 싶을 때',
    needs: [
      { text: '카메라 없어도 돼요', tone: 'ok', icon: 'check-circle' },
      { text: '설치 없이 바로', tone: 'ok', icon: 'check-circle' },
    ],
  },
  {
    id: 'labs-esp32',
    icon: 'chip',
    unit: 2,
    useWhen: 'LED, 버저, 모터 같은 부품을 코드로 움직여 보고 싶을 때',
    needs: [
      { text: '보드 없어도 돼요', tone: 'ok', icon: 'check-circle' },
      { text: '보드가 있으면 USB로 연결', tone: 'note', icon: 'plug' },
    ],
  },
  {
    id: 'labs-iot',
    icon: 'signal',
    unit: 3,
    useWhen: '컴퓨터와 보드가 신호를 주고받는 방법을 알고 싶을 때',
    needs: [
      { text: '보드 없어도 돼요', tone: 'ok', icon: 'check-circle' },
      { text: '화면 두 개가 짝', tone: 'note', icon: 'monitor' },
    ],
  },
  {
    id: 'labs-unit4',
    icon: 'sparkles',
    unit: 4,
    useWhen: '내 얼굴로 마우스를 움직이고, 보드가 그대로 따라 하게 하고 싶을 때',
    needs: [
      { text: '카메라와 보드가 없어도 돼요', tone: 'ok', icon: 'check-circle' },
      { text: '컴퓨터가 조금 바빠요', tone: 'note', icon: 'clock' },
    ],
  },
  {
    id: 'labs-gallery',
    icon: 'grid',
    useWhen: '만들 수 있는 예제를 둘러보고 마음에 드는 것으로 시작하고 싶을 때',
    needs: [
      { text: '고르면 실습실이 열려요', tone: 'ok', icon: 'check-circle' },
      { text: '낱말로 찾을 수 있어요', tone: 'note', icon: 'search' },
    ],
  },
]);

/** 수를 우리말 관형사로: 5 → "다섯"("실습실 다섯 곳"). 열 개를 넘으면 숫자 그대로 */
export function koreanCountWord(count: number): string {
  const words = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
  return words[count] !== undefined && words[count] !== '' ? words[count]! : String(count);
}

/** 사이트 지도 id로 카드 정보를 찾는다(없으면 undefined) */
export function labCardInfo(id: string): LabCardInfo | undefined {
  return LAB_CARD_INFO.find((info) => info.id === id);
}

/** "무엇을 할까요?" 고르기 한 칸 */
export interface LabChoice {
  /** 큰 질문(내가 하고 싶은 일) — 접근 이름이 되는 링크 글 */
  readonly ask: string;
  /** 어느 실습실로 가는지(사이트 지도 id) — 카드 전체가 이쪽으로 눌린다 */
  readonly target: string;
  /** 같은 일에 쓰는 다른 실습실(카드 안의 작은 링크) */
  readonly alsoTarget?: string;
  readonly icon: IconName;
  readonly unit: 1 | 2 | 3 | 4;
  /** 한 줄 보탬 */
  readonly hint: string;
}

/**
 * 하고 싶은 일 3가지. 링크 글(ask)에는 실습실 이름을 넣지 않는다 — 아래 카드의 제목 링크와 이름이 겹치면
 * "영상처리 실습실" 같은 이름으로 링크를 찾는 사람·검사가 둘을 헷갈린다. 어느 실습실인지는 target의 제목을 따로 보인다.
 */
export const LAB_CHOICES: readonly LabChoice[] = Object.freeze([
  {
    ask: '카메라로 인공지능 만들기',
    target: 'labs-vision',
    icon: 'camera',
    unit: 1,
    hint: '처음이면 여기서 시작해요',
  },
  {
    ask: '보드를 움직여 보기',
    target: 'labs-esp32',
    icon: 'chip',
    unit: 2,
    hint: '보드가 없어도 화면 속 보드로 해요',
  },
  {
    ask: '둘을 이어서 움직이기',
    target: 'labs-iot',
    alsoTarget: 'labs-unit4',
    icon: 'signal',
    unit: 3,
    hint: '컴퓨터가 알아낸 것을 보드로 보내요',
  },
]);
