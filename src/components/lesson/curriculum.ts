/**
 * 배우기 차례표(PLAN §2.2 단원·차시 목록) — 대단원 안의 묶음(중단원)과 계획한 차시.
 *
 * 무엇에 쓰나
 * - /learn/(배우기)와 /learn/u1/(대단원) 목록은 이 차례표와 content/lessons/의 md 파일을 합쳐 카드를 만든다.
 * - md 파일이 아직 없는(또는 draft: true인) 차시는 "준비 중" 카드(링크 없음)로 보인다.
 * - 차례표에 없는 새 md 파일도 코드 수정 없이 목록에 나타난다. 자리를 찾는 규칙은 lesson-data.ts의 buildUnitOutline에 있다.
 *
 * 차시 하나의 약속
 * - label  화면에 보이는 차시 번호. md frontmatter의 label과 같게 적는다(영문 대소문자는 가리지 않는다).
 * - slug   주소 끝 이름이자 md 파일 이름. 영문 소문자·숫자·하이픈(PD-09). 예: v4 → content/lessons/u1/v4.md → /learn/u1/v4/
 * - order  단원 안 순서. md frontmatter의 order와 같게 적는다. 보충 차시는 3.4처럼 소수로 사이에 넣는다.
 * - kind   textbook(교과서) · supplement(보충) · reading(읽기 자료) · review(대단원 마무리). content-schemas.ts와 같다.
 * - source 원천(PLAN §2.2 "원천" 칸): manuscript-code 원고+코드 · manuscript 원고만 · code-only 코드만(원고 없음) · supplement 보충(자료에 없음)
 * - pages  교과서 쪽. 코드만 있는 차시는 코드 파일 이름에 적힌 쪽이라 원고와 대조하지 못했다(PLAN §2.2).
 *
 * 묶음 이름은 원고의 중단원 표기(INVENTORY §3.1, I단원 표지)를 따르고, IV단원은 원고가 없어 코드 폴더 이름을 따른다(PLAN §2.1).
 * 보충 차시(PD-07)는 I단원은 "영상 처리 기초"로, III단원 통신 보충(C1~C3)은 따로 묶었다. P1은 3-1-4의 사전 학습이라 01 안에 둔다.
 */
import type { LESSON_KINDS, LESSON_SOURCES } from '../../config/content-schemas.ts';

export type LessonKind = (typeof LESSON_KINDS)[number];
export type LessonSource = (typeof LESSON_SOURCES)[number];

export interface PlannedLesson {
  readonly label: string;
  readonly slug: string;
  readonly title: string;
  readonly order: number;
  readonly kind: LessonKind;
  readonly source: LessonSource;
  readonly pages?: string;
}

export interface CurriculumSection {
  /** 묶음 식별자(페이지 안 id에 쓴다). 예: u1-01 */
  readonly key: string;
  /** 묶음 제목. 예: 01 인공지능과 인식 */
  readonly title: string;
  /** 중단원 번호. 차시 번호 1-2-3의 가운데 숫자와 같다. 보충·마무리 묶음에는 없다. */
  readonly middleUnit?: number;
  /** 묶음 설명(고1 눈높이 한두 문장) */
  readonly description?: string;
  readonly lessons: readonly PlannedLesson[];
}

export interface UnitCurriculum {
  readonly unit: 1 | 2 | 3 | 4;
  readonly sections: readonly CurriculumSection[];
}

function textbook(label: string, title: string, order: number, source: LessonSource, pages?: string): PlannedLesson {
  return Object.freeze({ label, slug: label.toLowerCase(), title, order, kind: 'textbook', source, pages });
}

function supplement(label: string, title: string, order: number): PlannedLesson {
  return Object.freeze({ label, slug: label.toLowerCase(), title, order, kind: 'supplement', source: 'supplement' });
}

function reading(label: string, title: string, order: number, pages: string): PlannedLesson {
  return Object.freeze({ label, slug: label.toLowerCase(), title, order, kind: 'reading', source: 'manuscript', pages });
}

/** 대단원 마무리. 주소는 /learn/uN/review/ 이다. */
function review(numeral: string, pages: string): PlannedLesson {
  return Object.freeze({
    label: `${numeral}-마무리`,
    slug: 'review',
    title: '대단원 마무리',
    order: 99,
    kind: 'review',
    source: 'manuscript',
    pages,
  });
}

function section(input: CurriculumSection): CurriculumSection {
  return Object.freeze({ ...input, lessons: Object.freeze([...input.lessons]) });
}

/** 대단원 I~IV의 차례표 */
export const CURRICULUM: readonly UnitCurriculum[] = Object.freeze([
  {
    unit: 1,
    sections: Object.freeze([
      section({
        key: 'u1-01',
        title: '01 인공지능과 인식',
        middleUnit: 1,
        lessons: [
          textbook('1-1-1', '인공지능 응용 프로그램과 에이전트', 1, 'manuscript', '008~012'),
          textbook('1-1-2', '인공지능 영상 인식 기술의 원리', 2, 'manuscript-code', '013~018'),
          textbook('1-1-3', '인공지능 인식 개발 환경', 3, 'manuscript-code', '019~023'),
        ],
      }),
      section({
        key: 'u1-basics',
        title: '보충: 영상 처리 기초',
        description: '사진이 숫자라는 것부터 테두리 찾기까지, 손 인식을 배우기 전에 알아 두면 좋은 내용을 사이트가 보탰어요.',
        lessons: [
          supplement('V1', '사진은 숫자다', 3.1),
          supplement('V2', '색공간과 흑백', 3.2),
          supplement('V3', '임계값으로 나누기', 3.3),
          supplement('V4', '블러와 에지', 3.4),
          supplement('V5', '윤곽선과 도형', 3.5),
        ],
      }),
      section({
        key: 'u1-02',
        title: '02 핸드 트래킹',
        middleUnit: 2,
        lessons: [
          textbook('1-2-1', '컴퓨터의 눈, 인간을 바라보다', 4, 'manuscript-code', '024~032'),
          textbook('1-2-2', '검지로 여는 디지털 스케치', 5, 'manuscript-code', '033~041'),
          textbook('1-2-3', '손끝 사이의 거리, 컴퓨터가 알아채다', 6, 'manuscript-code', '042~051'),
        ],
      }),
      section({
        key: 'u1-03',
        title: '03 페이스 매시',
        middleUnit: 3,
        lessons: [
          textbook('1-3-1', 'AI는 나의 방향을 알고 있다', 7, 'code-only', '파일명 p55·p58'),
          textbook('1-3-2', 'AI는 나의 하품을 파악한다', 8, 'code-only', '파일명 p65·p68'),
          textbook('1-3-3', '내 얼굴에 맞춤 필터 만들기', 9, 'code-only', '파일명 p75·p78'),
        ],
      }),
      section({
        key: 'u1-04',
        title: '04 포즈 트래킹과 음성 인식',
        middleUnit: 4,
        lessons: [
          textbook('1-4-1', '몸으로 말해요! 동작 감지 인공지능', 10, 'code-only', '파일명 p85·p88'),
          textbook('1-4-2', '균형 잡힌 자세를 도와주는 인공지능', 11, 'code-only', '파일명 p95·p99'),
          textbook('1-4-3', '말을 글로 바꾸는 기술(선택 차시)', 12, 'code-only', '파일명 p105·p108'),
        ],
      }),
      section({ key: 'u1-review', title: '대단원 마무리', lessons: [review('I', '112~113')] }),
    ]),
  },
  {
    unit: 2,
    sections: Object.freeze([
      section({
        key: 'u2-01',
        title: '01 디스플레이 장치 제어',
        middleUnit: 1,
        lessons: [
          textbook('2-1-1', '피지컬 컴퓨팅 및 개발 환경의 이해', 1, 'manuscript-code', '117~123'),
          textbook('2-1-2', 'LCD 제어하기', 2, 'manuscript-code', '124~131'),
          textbook('2-1-3', 'OLED 제어하기', 3, 'manuscript-code', '132~140'),
          reading('2-1-R', '인공지능 시대의 OLED 디스플레이', 3.5, '141'),
          textbook('2-1-4', 'RGB LED와 레이저 제어하기', 4, 'manuscript-code', '142~147'),
          textbook('2-1-5', '네오픽셀 제어하기', 5, 'manuscript-code', '148~153'),
        ],
      }),
      section({
        key: 'u2-02',
        title: '02 출력 장치 제어',
        middleUnit: 2,
        lessons: [
          textbook('2-2-1', '버저 제어하기', 6, 'manuscript-code', '155~160'),
          textbook('2-2-2', 'MP3 플레이어 제어하기', 7, 'manuscript-code', '161~166'),
          textbook('2-2-3', '팬 모터 활용하기', 8, 'manuscript-code', '167~172'),
          textbook('2-2-4', '서보모터 활용하기', 9, 'manuscript-code', '173~179'),
        ],
      }),
      section({ key: 'u2-review', title: '대단원 마무리', lessons: [review('II', '180~181')] }),
    ]),
  },
  {
    unit: 3,
    sections: Object.freeze([
      section({
        key: 'u3-01',
        title: '01 인공지능 피지컬 통신 방법',
        middleUnit: 1,
        lessons: [
          textbook('3-1-1', '인공지능과 하드웨어 통신의 이해', 1, 'manuscript', '185~188'),
          textbook('3-1-2', '인공지능 모델과 시리얼 통신', 2, 'manuscript-code', '189~194'),
          textbook('3-1-3', '인공지능과 블루투스 통신', 3, 'manuscript-code', '195~200'),
          supplement('P1', 'PyAutoGUI로 컴퓨터 조작하기', 3.5),
          textbook('3-1-4', '손과 동작으로 컴퓨터 제어하기', 4, 'manuscript-code', '201~207'),
        ],
      }),
      section({
        key: 'u3-network',
        title: '보충: 인터넷 통신과 AI→피지컬 연결',
        description: '교과서 자료에 없는 인터넷 통신(MQTT), 대시보드, 손가락 개수로 LED를 켜는 연결 실습을 사이트가 보탰어요.',
        lessons: [
          supplement('C1', 'Wi-Fi와 MQTT: 발행과 구독', 4.1),
          supplement('C2', '대시보드로 보고 조종하기', 4.2),
          supplement('C3', '손가락 개수만큼 LED 켜기', 4.3),
        ],
      }),
      section({ key: 'u3-review', title: '대단원 마무리', lessons: [review('III', '208~209')] }),
    ]),
  },
  {
    unit: 4,
    sections: Object.freeze([
      section({
        key: 'u4-01',
        title: '01 얼굴 인식 기반 비접촉 마우스 컨트롤러 개발',
        middleUnit: 1,
        description: '이 대단원은 교과서 원고가 없어 예제 코드를 바탕으로 사이트가 본문을 써요.',
        lessons: [
          textbook('4-1-1', 'AI의 눈, 내 얼굴 인식', 1, 'code-only', '파일명 p216·p217·p219'),
          textbook('4-1-2', '눈길 따라 움직이는 마우스 커서', 2, 'code-only', '파일명 p226'),
          textbook('4-1-3', '윙크 한방에 더블클릭!', 3, 'code-only', '파일명 p234·p240'),
          textbook('4-1-4', '보이지 않는 연결, 블루투스로 데이터 전송', 4, 'code-only', '파일명 p251·p252·p254'),
        ],
      }),
      section({
        key: 'u4-02',
        title: '02 AI 신호를 현실로 물리적 피드백 시스템 제작',
        middleUnit: 2,
        lessons: [
          textbook('4-2-1', '데이터, 하드웨어를 깨우다!', 5, 'code-only', '파일명 p261·p270·p272'),
          textbook('4-2-2', '소리와 빛으로 상태를 알려줘', 6, 'code-only', '파일명 p278·p281'),
        ],
      }),
    ]),
  },
]);

/** 대단원 번호로 차례표를 찾는다. 없으면 빈 차례표 */
export function getUnitCurriculum(unit: number, curriculum: readonly UnitCurriculum[] = CURRICULUM): UnitCurriculum | undefined {
  return curriculum.find((item) => item.unit === unit);
}

/**
 * md 파일에 맞는 차례표 차시를 찾는다(목록 카드와 같은 규칙: 같은 대단원에서 차시 번호가 같거나(대소문자 무시) 파일 이름이 같다).
 * 차례표에 없는 새 차시면 undefined.
 */
export function findPlannedLesson(
  unit: number,
  label: string,
  slug: string,
  curriculum: readonly UnitCurriculum[] = CURRICULUM,
): PlannedLesson | undefined {
  const lessons = getUnitCurriculum(unit, curriculum)?.sections.flatMap((section) => section.lessons) ?? [];
  return (
    lessons.find((planned) => planned.label.toLowerCase() === label.toLowerCase()) ?? lessons.find((planned) => planned.slug === slug)
  );
}

/** 차례표 전체의 차시를 대단원 순서대로(검사 도구가 "아직 없는 차시" 목록을 만들 때 쓴다) */
export function allPlannedLessons(curriculum: readonly UnitCurriculum[] = CURRICULUM): { unit: number; lesson: PlannedLesson }[] {
  return curriculum.flatMap((unitCurriculum) =>
    unitCurriculum.sections.flatMap((section) => section.lessons.map((lesson) => ({ unit: unitCurriculum.unit, lesson }))),
  );
}
