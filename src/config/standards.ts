/**
 * 성취기준 표와 차시 ↔ 성취기준 대응표(PLAN §2.2 "차시 ↔ 성취기준 대응표(초안)", PD-21, DECISIONS C8).
 *
 * 근거: 인천광역시교육청 교육과정정보센터 교육감승인과목 게시물 "인공지능과 피지컬 컴퓨팅"(2022 개정, 등록일 2024.10.04.) —
 * 문서뷰어 텍스트 기준(hwp 원문 대조는 운영자 할 일 5번). 코드 목록은 docs/INVENTORY.md §9.2와 같다.
 *
 * 누가 쓰나
 * - 차시 머리의 성취기준 뱃지와 교사용 접기의 "이 차시의 원고와 자료"(src/components/lesson/LessonTeacherInfo.astro)
 * - 차시 검사(npm run check:lessons, src/components/lesson/lesson-rules.ts): frontmatter standards가 아래 15개 안에 있는지,
 *   대응표에 있는 차시면 대응표와 같은지 본다. 빌드는 같은 규칙을 경고로만 알린다(PD-35).
 * - 교사용 자료실의 성취기준·평가 방향 표(P5-14)
 *
 * 고치는 법
 * - 운영자가 원문 대조 결과를 주거나(운영자 할 일 5번) 대응을 바꾸기로 하면 PLAN §2.2 표와 이 파일을 함께 고친다.
 * - summary는 사이트가 줄인 말이다(원문 문장이 아니다). 화면에는 "(사이트 요약)"을 붙이고 원문 게시물 링크를 함께 보인다.
 * - 코드를 새로 만들어 넣지 않는다(DECISIONS C8). 대응이 분명하지 않은 차시는 빈 목록 []으로 둔다 → 화면은 "성취기준 코드 확인 중".
 */

/** 과목 교육과정 원문(게시물) 주소와 등록일 — sources.yaml의 reference 항목과 같다 */
export const CURRICULUM_SOURCE = Object.freeze({
  title: '인천광역시교육청 교육과정정보센터 교육감승인과목 "인공지능과 피지컬 컴퓨팅"',
  url: 'https://www.ice.go.kr/ice/na/ntt/selectNttInfo.do?mi=11997&bbsId=1999&nttSn=3299910',
  registered: '2024.10.04.',
});

export interface StandardArea {
  /** 영역 번호(코드의 12인피0N) */
  readonly area: 1 | 2 | 3 | 4;
  /** 영역 이름(교육과정 표기) */
  readonly name: string;
}

export interface Standard {
  readonly code: string;
  readonly area: StandardArea['area'];
  /** 사이트가 줄인 말(원문 아님) */
  readonly summary: string;
}

/** 네 영역 — 교과서 I~IV단원과 이름이 같다(INVENTORY §9.2) */
export const STANDARD_AREAS: readonly StandardArea[] = Object.freeze([
  { area: 1, name: '인공지능 영상인식' },
  { area: 2, name: '피지컬컴퓨팅' },
  { area: 3, name: '인공지능과 피지컬컴퓨팅' },
  { area: 4, name: '문제해결프로젝트' },
] as const);

/** 성취기준 15개(코드 + 사이트 요약). 요약은 INVENTORY §9.2·PLAN §2.2 근거 칸의 낱말을 풀어 쓴 것이다. */
export const STANDARDS: readonly Standard[] = Object.freeze([
  { code: '12인피01-01', area: 1, summary: '영상인식 기술의 종류와 원리, 개발 환경 구성' },
  { code: '12인피01-02', area: 1, summary: '핸드 트래킹 구현과 특징점 활용' },
  { code: '12인피01-03', area: 1, summary: '페이스 매시 구현과 특징점 활용' },
  { code: '12인피01-04', area: 1, summary: '포즈 트래킹 구현과 특징점 활용' },
  { code: '12인피02-01', area: 2, summary: '피지컬 컴퓨팅 시스템 이해와 개발 환경 구성' },
  { code: '12인피02-02', area: 2, summary: '디스플레이 장치 제어' },
  { code: '12인피02-03', area: 2, summary: '소리, 진동 같은 출력 장치 제어' },
  { code: '12인피02-04', area: 2, summary: '구동(모터) 장치 제어' },
  { code: '12인피03-01', area: 3, summary: '영상인식 결과로 피지컬 컴퓨팅 장치 제어' },
  { code: '12인피03-02', area: 3, summary: '유선, 무선 통신으로 출력 장치 제어' },
  { code: '12인피03-03', area: 3, summary: '데이터 유형에 따른 송수신' },
  { code: '12인피04-01', area: 4, summary: '영상인식으로 하드웨어를 제어하는 사례 탐색' },
  { code: '12인피04-02', area: 4, summary: '문제 발견과 정의' },
  { code: '12인피04-03', area: 4, summary: '협력하여 지능화 사물 개발' },
  { code: '12인피04-04', area: 4, summary: '사회적 영향을 생각한 점검과 개선' },
] as const);

const STANDARD_BY_CODE: ReadonlyMap<string, Standard> = new Map(STANDARDS.map((standard) => [standard.code, standard]));

/** 코드로 성취기준을 찾는다. 15개에 없으면 undefined */
export function findStandard(code: string): Standard | undefined {
  return STANDARD_BY_CODE.get(code.trim());
}

/** 영역 번호로 영역 이름을 찾는다 */
export function standardAreaName(area: StandardArea['area']): string {
  return STANDARD_AREAS.find((item) => item.area === area)?.name ?? '';
}

/**
 * 차시 번호(label) → 성취기준 코드(PLAN §2.2 대응표 초안 그대로). 빈 목록은 "대응 없음(C8 문구)"이라는 뜻이다.
 * 여기에 없는 차시(새로 만든 차시)는 코드가 15개 안에 있는지만 검사하고 "대응표에 없는 차시" 참고를 남긴다.
 */
export const LESSON_STANDARDS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // I. 영상 처리 인공지능
  '1-1-1': ['12인피01-01'],
  '1-1-2': ['12인피01-01'],
  '1-1-3': ['12인피01-01'],
  V1: [],
  V2: [],
  V3: [],
  V4: [],
  V5: [],
  '1-2-1': ['12인피01-02'],
  '1-2-2': ['12인피01-02'],
  '1-2-3': ['12인피01-02'],
  '1-3-1': ['12인피01-03'],
  '1-3-2': ['12인피01-03'],
  '1-3-3': ['12인피01-03'],
  '1-4-1': ['12인피01-04'],
  '1-4-2': ['12인피01-04'],
  '1-4-3': [],
  'I-마무리': [],
  // II. 피지컬 컴퓨팅
  '2-1-1': ['12인피02-01'],
  '2-1-2': ['12인피02-02'],
  '2-1-3': ['12인피02-02'],
  '2-1-R': ['12인피02-02'],
  '2-1-4': ['12인피02-02'],
  '2-1-5': ['12인피02-02'],
  '2-2-1': ['12인피02-03'],
  '2-2-2': ['12인피02-03'],
  '2-2-3': ['12인피02-04'],
  '2-2-4': ['12인피02-04'],
  'II-마무리': [],
  // III. 인공지능과 피지컬 컴퓨팅
  '3-1-1': ['12인피03-01', '12인피03-03'],
  '3-1-2': ['12인피03-01', '12인피03-02'],
  '3-1-3': ['12인피03-02', '12인피03-03'],
  P1: [],
  '3-1-4': ['12인피01-02'],
  C1: ['12인피03-02'],
  C2: ['12인피03-02'],
  C3: ['12인피03-01'],
  'III-마무리': [],
  // IV. 지능화 사물 개발 프로젝트(12인피04-02~04-04는 IV단원 프로젝트 안내 — 교사용, P5-13)
  '4-1-1': ['12인피04-01'],
  '4-1-2': ['12인피04-01'],
  '4-1-3': ['12인피04-01'],
  '4-1-4': ['12인피04-01'],
  '4-2-1': ['12인피04-01'],
  '4-2-2': ['12인피04-01'],
});

/** 차시 번호의 대응표 코드. 대응표에 없는 차시면 undefined(영문 대소문자는 가리지 않는다) */
export function mappedStandards(label: string): readonly string[] | undefined {
  const key = Object.keys(LESSON_STANDARDS).find((candidate) => candidate.toLowerCase() === label.trim().toLowerCase());
  return key === undefined ? undefined : LESSON_STANDARDS[key];
}
