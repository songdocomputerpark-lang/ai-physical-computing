// 콘텐츠 frontmatter 규칙(PLAN §2.6, DECISIONS C8, PD-21·PD-35) — src/content.config.ts가 쓴다.
// 단위 테스트(tests/unit/content-schemas.test.ts)도 같은 규칙을 검사한다.
//
// - 빌드를 멈추는 것은 frontmatter 형식 오류뿐이다(PD-35). 본문 8칸(SPEC §7.2)이 빠졌다는 경고는 차시 검사(P5-02)가 맡는다.
// - 여기 없는 필드를 더 적어도 빌드는 멈추지 않고 entry.data에 그대로 남는다(타입은 unknown).
//   필드를 정식으로 늘리거나 이름을 바꿀 때는 이 파일과 테스트를 함께 고친다.
// - 오류 문장은 차시를 쓰는 선생님이 읽는다. 무엇을 어떻게 고치면 되는지 한국어로 적는다.
import { z } from 'astro/zod';
import { EXAMPLE_COMM_KINDS } from '../lab/gallery/facets.ts';

/** 콘텐츠 폴더(프로젝트 뿌리 기준). glob 로더의 base로 쓴다(PLAN §2.6: 루트 content/). */
export const CONTENT_DIRS = Object.freeze({
  lessons: './content/lessons',
  glossary: './content/glossary',
});

/** 대단원 번호 */
export const LESSON_UNITS = [1, 2, 3, 4] as const;
/** 실습실 id. 사이트 지도의 /labs/vision/·/labs/esp32/·/labs/iot/와 같은 이름이다. */
export const LAB_IDS = ['vision', 'esp32', 'iot'] as const;
/** 차시 종류: 교과서 차시 / 보충 차시(PD-07, 제목 앞에 "보충") / 읽기 자료(예: 2-1-R) / 대단원 마무리 */
export const LESSON_KINDS = ['textbook', 'supplement', 'reading', 'review'] as const;
/** 난이도: 1 쉬움, 2 보통, 3 어려움 */
export const DIFFICULTY_LEVELS = [1, 2, 3] as const;
/** 성취기준 코드 모양. 예: 12인피02-01(인천광역시교육청 승인 과목 교육과정, PLAN §2.2) */
export const STANDARD_CODE_PATTERN = /^12인피0[1-4]-0[1-9]$/u;
/** examples/ 뒤의 예제 파일 경로. 예: esp32/u2/2-1-1-touch-led.py, esp32/lib/third-party/i2c_lcd.py */
export const EXAMPLE_FILE_PATTERN = /^(?:[a-z\d][a-z\d_-]*\/)*[a-z\d][a-z\d_-]*\.py$/u;
/** 콘텐츠 항목 id(파일 이름에서 .md를 뗀 것). 예: pixel, bgr-rgb */
export const ENTRY_ID_PATTERN = /^[a-z\d]+(?:-[a-z\d]+)*$/u;
/** 용어 한 줄 풀이(툴팁) 최대 글자 수 */
export const GLOSSARY_SUMMARY_MAX = 100;

/**
 * 가상 보드 배선의 부품 하나(PD-05, P3-02 — src/lab/README.md 7.4). 부품 이름은 part(부품 폴더 이름, 예: touch-digital) 또는
 * PLAN §2.6 예시의 type(예: touch_digital — 밑줄은 하이픈으로 읽음). 핀이 하나인 부품은 pin, 여러 개면 pins: { 역할: 핀 번호 }.
 * 부품 이름이 가상 보드에 있는지·핀이 맞는지는 실습실 화면이 검사해 한국어로 알린다(여기서는 모양만 본다 — 빌드를 멈추지 않게, PD-35).
 */
const partSchema = z
  .looseObject({
    part: z.string().min(1).optional(),
    type: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    pin: z.union([z.number().int().nonnegative(), z.string().min(1)]).optional(),
    pins: z.record(z.string(), z.union([z.number().int().nonnegative(), z.string().min(1)])).optional(),
    label: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.part ?? value.type), { error: '부품 이름(part)을 적어요. 예: { part: touch-digital, pin: 17 }' });

/** 차시에 붙는 예제 하나. 제목·배선은 py 파일이 아니라 차시 md에 적는다(PLAN §2.6). */
const EXAMPLE_FILE_ERROR = 'examples/ 뒤의 경로를 영문 소문자·숫자·_·-와 .py로 적어요. 예: esp32/u2/2-1-1-touch-led.py';

const exampleSchema = z.object({
  file: z
    .string()
    .regex(EXAMPLE_FILE_PATTERN, { error: EXAMPLE_FILE_ERROR })
    .refine((file) => !file.startsWith('examples/'), { error: `${EXAMPLE_FILE_ERROR} (앞의 examples/는 빼요)` }),
  title: z.string().min(1).optional(),
  parts: z.array(partSchema).default([]),
});

/** 확인 퀴즈 한 문항(객관식, SPEC §7.2 7번) */
const quizItemSchema = z
  .object({
    q: z.string().min(1, { error: '문제(q)를 적어요.' }),
    choices: z
      .array(z.string().min(1))
      .min(2, { error: '보기(choices)는 2개 이상 적어요.' })
      .max(5, { error: '보기(choices)는 5개까지 적어요.' }),
    answer: z.number({ error: '정답(answer)은 보기 순번 숫자로 적어요. 첫 보기가 0이에요.' }).int().nonnegative(),
    explain: z.string().min(1).optional(),
  })
  .refine((item) => item.answer < item.choices.length, {
    error: '정답(answer)은 보기의 순번이에요. 첫 보기가 0이라서 보기 개수보다 작아야 해요.',
    path: ['answer'],
  });

/** 국가 교육과정 참고 연결(PD-21: 기본 빈 값, 공식 문서에 대응이 명시된 경우만) */
const nationalRefSchema = z.object({
  code: z.string().min(1),
  url: z.url({ error: '근거 주소(url)를 https://로 시작하는 주소로 적어요.' }),
  note: z.string().min(1).optional(),
});

/** 차시(content/lessons/) frontmatter */
export const lessonSchema = z.looseObject({
  /** 차시 제목 */
  title: z.string().min(1, { error: '차시 제목(title)을 적어요.' }),
  /** 대단원 번호 1~4 */
  unit: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)], {
    error: '대단원 번호(unit)는 1, 2, 3, 4 중 하나로 적어요.',
  }),
  /** 단원 안 순서. 보충 차시를 사이에 넣을 때는 2.5처럼 소수도 된다. */
  order: z.number({ error: '단원 안 순서(order)를 숫자로 적어요.' }).nonnegative(),
  /** 차시 종류(기본 textbook) */
  kind: z.enum(LESSON_KINDS).default('textbook'),
  /** 화면에 보이는 차시 번호. 예: "1-2-1", "V1". 비우면 화면 담당이 파일 이름으로 정한다. */
  label: z.string().min(1).optional(),
  /** 목록·검색 결과에 보이는 한 줄 소개 */
  description: z.string().min(1).optional(),
  /** 교과서 쪽. 예: "033~041", "파일명 p55·p58" */
  pages: z.string().min(1).optional(),
  /** 성취기준 코드 목록(PLAN §2.2 대응표). 비우거나(standards: 또는 []) 적지 않아도 된다 → 화면은 "성취기준 코드 확인 중"(C8) */
  standards: z
    .array(
      z.string().regex(STANDARD_CODE_PATTERN, {
        error: '성취기준 코드는 12인피02-01 모양으로 적어요. 확인되지 않았으면 빈 목록 []으로 둬요(DECISIONS C8).',
      }),
    )
    .nullish()
    .transform((value) => value ?? []),
  /** 걸리는 시간(분) */
  duration: z.number().int().positive().optional(),
  /** 준비물 */
  materials: z.array(z.string().min(1)).default([]),
  /** 가상 보드만으로 끝까지 할 수 있는지 */
  virtual_ok: z.boolean().optional(),
  /** 이 차시가 쓰는 통신 방식(예제 갤러리 태그, P4-11 — src/lab/gallery/facets.ts). 통신을 쓰지 않으면 적지 않는다 */
  comm: z
    .array(
      z.enum(EXAMPLE_COMM_KINDS, {
        error: `통신 방식(comm)은 ${EXAMPLE_COMM_KINDS.join('·')} 가운데 골라 적어요. 통신을 쓰지 않는 차시는 적지 않아요.`,
      }),
    )
    .default([]),
  /** 목록·검색·갤러리에서 쓰는 자유 낱말 */
  tags: z.array(z.string().min(1)).default([]),
  /** 난이도 1~3 */
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  /** 따라하기에 쓰는 실습실 */
  lab: z.enum(LAB_IDS).optional(),
  /** 예제 파일과 배선 */
  examples: z.array(exampleSchema).default([]),
  /** 확인 퀴즈(실제 차시는 3문항) */
  quiz: z.array(quizItemSchema).default([]),
  /** 국가 교육과정 참고 연결(기본 빈 목록) */
  national_refs: z.array(nationalRefSchema).default([]),
  /** 초안이면 true. 목록·검색에서 뺄 때 쓴다. */
  draft: z.boolean().default(false),
});

/** 용어사전 항목(content/glossary/) frontmatter */
export const glossarySchema = z.looseObject({
  /** 표제어. 예: 픽셀 */
  title: z.string().min(1, { error: '표제어(title)를 적어요.' }),
  /** 영어 이름이나 약자를 푼 말. 예: Pulse Width Modulation */
  english: z.string().min(1).optional(),
  /** 같은 뜻의 다른 표기. 본문 :용어[화소] 가 이 이름으로도 항목을 찾는다. */
  aliases: z.array(z.string().min(1)).default([]),
  /** 툴팁에 보이는 한 줄 풀이 */
  summary: z
    .string()
    .min(1, { error: '한 줄 풀이(summary)를 적어요. 툴팁에 보여요.' })
    .max(GLOSSARY_SUMMARY_MAX, { error: `한 줄 풀이(summary)는 툴팁에 들어가므로 ${GLOSSARY_SUMMARY_MAX}자 안으로 줄여요.` }),
  /** 함께 보면 좋은 다른 항목 id */
  related: z
    .array(z.string().regex(ENTRY_ID_PATTERN, { error: '관련 항목(related)은 파일 이름(.md 뺀 것)으로 적어요. 예: bgr-rgb' }))
    .default([]),
  /** 묶음 이름. 예: 영상 처리, 피지컬 컴퓨팅, 통신 */
  group: z.string().min(1).optional(),
  /** 초안이면 true */
  draft: z.boolean().default(false),
});

export type LessonData = z.infer<typeof lessonSchema>;
export type GlossaryData = z.infer<typeof glossarySchema>;
