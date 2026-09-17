/**
 * 실습실 준비 중 안내에 쓰는 내용(PLAN §2.1·§2.5, §8.2~§8.4).
 * 실습실 개요(/labs/)와 각 실습실 자리 페이지가 같은 내용을 쓰도록 한 곳에 모았다.
 * 파일 이름이 _로 시작해서 Astro가 페이지(주소)로 만들지 않는다(Astro 공식 문서 "Excluding pages").
 *
 * 실습실이 실제로 생기면 그 실습실의 항목을 지우고 페이지를 실제 화면으로 바꾼다.
 * 문장은 고1이 처음 읽어도 알 수 있게 쓰고, 처음 나오는 전문용어는 괄호로 푼다.
 * 낱말을 나열할 때는 가운뎃점(·) 대신 쉼표를 쓴다. Pagefind는 "버저·서보모터"를 한 낱말로 묶어
 * "서보" 검색에 걸리지 않기 때문이다(2026-09-16 브라우저에서 확인).
 */

export interface LabPlan {
  /** 사이트 지도(src/config/nav.ts)의 id */
  readonly id: string;
  /** Phase 번호(PLAN §8) */
  readonly phase: number;
  /**
   * ComingSoon의 when 값: "언제" 생기는지. 뒤에 "에 생겨요."가 붙는다.
   * "Phase"는 개발 용어라 "사이트를 만드는 n번째 단계(Phase n)"처럼 풀어 쓴다. 실습실 이름을 되풀이하지 않는다
   * ("영상처리 실습실은 영상처리 실습실을 만드는 단계에 생겨요"처럼 읽히던 문장, 2026-09-16 검토 반영).
   */
  readonly when: string;
  /** 준비되면 할 수 있는 일(짧은 문장 3개 안팎). 검색 색인에 들어간다. */
  readonly features: readonly string[];
  /** 준비되는 동안 볼 수 있는 곳(사이트 지도 id). 준비 중 상자 안 링크와 아래 카드에 함께 보인다. */
  readonly relatedIds: readonly string[];
  /**
   * 브라우저 권장 환경 안내(src/components/compat/BrowserNotice.astro)를 보일지(SPEC §9 "실습실은 Chrome/Edge에서").
   * 코드를 실행하거나 보드를 연결하는 실습실이 실제로 생기면 true로 바꾼다(P2-03 영상처리, P3-07 ESP32·실물 점검, P4-06 통신).
   * 자리 페이지 동안은 false: 휴대폰에서 안내가 첫 화면의 1/3을 차지해 제목을 밀어내고, 안내 하나 때문에 점검 코드(약 6KB)를
   * 받게 해서다(2026-09-16 검토 반영). 예제 카드를 읽는 갤러리는 늘 false.
   */
  readonly browserNotice: boolean;
  /**
   * 실제 화면이 열렸는지. true면 실습실 개요(/labs/)의 카드가 "준비 중" 대신 "열림"을 보이고, 자리 페이지 틀(_LabPlaceholder.astro)은
   * 쓰지 않는다(그 실습실 페이지가 직접 화면을 그린다). features·when은 개요 카드와 검색용으로 남겨 둔다.
   */
  readonly open?: boolean;
}

export const LAB_PLANS: readonly LabPlan[] = Object.freeze([
  {
    // 2026-09-16 P2-03에서 실제 화면이 됨(src/pages/labs/vision/index.astro). 슬라이더(P2-04)·손·얼굴(P2-08·09)·가상 컴퓨터(P2-11)는 이어서 더한다.
    id: 'labs-vision',
    phase: 2,
    when: '사이트를 만드는 두 번째 단계(Phase 2)',
    features: [
      '사진이 작은 점(픽셀)마다 밝기를 적은 숫자라는 것부터 차근차근 살펴봐요.',
      '웹캠 영상에 파이썬 코드를 실행하고, 슬라이더로 값을 바꾸며 결과가 달라지는 것을 봐요.',
      '손, 얼굴, 몸의 움직임을 알아채는 인공지능 프로그램을 만들어요.',
      '화면 속 가상 컴퓨터에서 손동작으로 마우스와 키보드를 움직여 봐요.',
    ],
    relatedIds: ['start-student', 'start-check', 'glossary'],
    browserNotice: true,
    open: true,
  },
  {
    // 2026-09-17 P3-01에서 실제 화면이 됨(src/pages/labs/esp32/index.astro — 가상 보드의 핀·시계·Timer, 내장 LED·BOOT 버튼).
    // 부품(P3-02~P3-05)·블록(P3-06)·실제 보드 연결(P3-07~)은 이어서 더한다. 실물 점검 도우미(labs-esp32-check)는 P3-11까지 자리 페이지다.
    id: 'labs-esp32',
    phase: 3,
    when: '사이트를 만드는 세 번째 단계(Phase 3)',
    features: [
      '블록을 끼워 맞추면 같은 뜻의 코드(보드용 파이썬인 MicroPython)가 바로 옆에 보여요.',
      '보드가 없어도 화면 속 가상 보드로 LED, 버저, 서보모터, 문자 화면을 움직여요.',
      'ESP32 보드가 있으면 USB 선으로 연결해 같은 코드를 실제 보드에서 실행해요.',
    ],
    relatedIds: ['start-board', 'labs-esp32-check', 'help'],
    browserNotice: true,
    open: true,
  },
  {
    id: 'labs-esp32-check',
    phase: 3,
    when: '사이트를 만드는 세 번째 단계(Phase 3)',
    features: [
      '[보드에 보내기]를 누르면 확인용 코드가 연결한 보드에서 실행돼요.',
      '"LED가 켜졌나요?"처럼 눈으로 본 결과를 예 또는 아니오로 답해요.',
      '[결과 복사]로 모든 답을 한 번에 복사해 알려 줄 수 있어요.',
    ],
    relatedIds: ['start-board', 'labs-esp32', 'start-teacher'],
    browserNotice: false,
  },
  {
    id: 'labs-iot',
    phase: 4,
    when: '사이트를 만드는 네 번째 단계(Phase 4)',
    features: [
      'USB 선(시리얼 통신), 블루투스, 인터넷(MQTT라는 짧은 메시지 방식)으로 컴퓨터와 보드가 신호를 주고받아요.',
      '카메라가 센 손가락 개수만큼 보드의 LED를 켜는 것처럼, 인공지능 결과로 보드를 움직여요.',
      '보드 값을 그래프로 보고 스위치로 LED를 켜는 대시보드(한눈에 보는 조종 화면)를 만들어요.',
      '같은 컴퓨터에 연 두 탭끼리도 신호를 주고받아요.',
    ],
    relatedIds: ['labs-vision', 'labs-esp32', 'start-check'],
    browserNotice: false,
  },
  {
    id: 'labs-gallery',
    phase: 4,
    when: '사이트를 만드는 네 번째 단계(Phase 4)',
    features: [
      '사이트의 모든 예제를 카드로 모아 봐요.',
      '단원, 부품, 통신 방식, 난이도, 가상 보드 가능 여부로 골라 봐요.',
      '카드에서 바로 실습실로 예제를 불러와 실행해요.',
    ],
    relatedIds: ['learn', 'labs'],
    browserNotice: false,
  },
]);

/** 사이트 지도 id로 실습실 준비 내용을 찾는다. 없으면 빌드를 멈춰 바로 알 수 있게 한다. */
export function getLabPlan(id: string): LabPlan {
  const plan = LAB_PLANS.find((candidate) => candidate.id === id);
  if (!plan) {
    throw new Error(`실습실 준비 내용(src/pages/labs/_labs.ts)에 id "${id}"가 없어요.`);
  }
  return plan;
}
