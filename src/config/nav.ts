/**
 * 사이트 지도 한 곳(PLAN §2.1).
 *
 * 머리글 주 메뉴·좁은 화면 메뉴, 바닥글 사이트 지도, 현재 위치(빵부스러기), 자리 페이지, 메뉴 링크 검사(Playwright)가
 * 모두 이 목록을 읽는다. 메뉴 이름·순서·주소를 바꿀 때는 이 파일만 고친다.
 *
 * 약속
 * - path: 사이트 안 경로. base 없이 /로 시작하고 /로 끝나며 영문 소문자·숫자·하이픈만 쓴다(PD-09). 예: '/start/student/'
 * - href: 화면에 쓰는 링크. path에 base를 붙인 값이고 withBase()로만 만든다(직접 적지 않는다).
 * - 아래 페이지(children)의 path는 위 페이지 path로 시작한다.
 * - 페이지 파일은 같은 경로에 둔다: '/start/student/' → src/pages/start/student/index.astro
 * - 대단원(배우기 아래 I~IV)은 learnUnits에 따로 둔다. 머리글·바닥글에는 나오지 않고 현재 위치 계산과 배우기 화면에서 쓴다.
 */
import { normalizePagePath, withBase } from '../lib/url.ts';

/** 현재 위치(빵부스러기) 한 칸. href가 없는 칸이 지금 페이지다. */
export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface NavPageInput {
  id: string;
  label: string;
  title?: string;
  path: string;
  description: string;
  inHeader?: boolean;
  children?: readonly NavPageInput[];
}

interface LearnUnitInput extends NavPageInput {
  unit: 1 | 2 | 3 | 4;
  numeral: 'I' | 'II' | 'III' | 'IV';
}

export interface NavPage {
  /** 영문 소문자·숫자·하이픈 식별자. getPage()·테스트에서 쓴다. 예: 'start-student' */
  readonly id: string;
  /** 메뉴에 보이는 짧은 이름 */
  readonly label: string;
  /** 페이지 제목(<h1>·브라우저 탭). 따로 적지 않으면 label과 같다. */
  readonly title: string;
  /** 사이트 안 경로(base 없음) */
  readonly path: string;
  /** base를 붙인 링크 */
  readonly href: string;
  /** 한 줄 설명(고1 눈높이). 메뉴 목록 카드·자리 페이지·검색 설명에 쓴다. */
  readonly description: string;
  /** 머리글 주 메뉴에 보이는지 */
  readonly inHeader: boolean;
  /** 아래 페이지 */
  readonly children: readonly NavPage[];
}

export interface LearnUnit extends NavPage {
  /** 대단원 번호. 차시 frontmatter의 unit과 같다(src/config/content-schemas.ts). */
  readonly unit: 1 | 2 | 3 | 4;
  /** 로마 숫자 표기 */
  readonly numeral: 'I' | 'II' | 'III' | 'IV';
}

const SITE_MAP_INPUT: readonly NavPageInput[] = [
  {
    id: 'home',
    label: '홈',
    path: '/',
    description: '설치 없이 브라우저만으로 인공지능과 피지컬 컴퓨팅을 배우는 사이트의 첫 화면이에요.',
  },
  {
    id: 'start',
    label: '시작하기',
    path: '/start/',
    description: '처음 왔다면 여기서 무엇부터 할지 골라요.',
    inHeader: true,
    children: [
      {
        id: 'start-student',
        label: '학생용',
        title: '학생용 시작하기',
        path: '/start/student/',
        description: '브라우저를 확인하고 카메라를 허용한 뒤, 3분 만에 첫 실습을 해 봐요.',
      },
      {
        id: 'start-board',
        label: '보드 준비',
        title: '보드 준비하기',
        path: '/start/board/',
        description: 'ESP32 보드를 컴퓨터에 연결하고, 보드에 기본 프로그램(펌웨어)을 넣는 방법을 알려 줘요.',
      },
      {
        id: 'start-teacher',
        label: '교사용',
        title: '교사용 시작하기',
        path: '/start/teacher/',
        description: '수업 운영 방법, 평가, 개인정보 처리 안내를 모았어요.',
      },
      {
        id: 'start-check',
        label: '점검',
        title: '학교 네트워크·브라우저 점검',
        path: '/start/check/',
        description: '이 컴퓨터와 학교 네트워크에서 카메라·보드 연결 같은 기능을 쓸 수 있는지 자동으로 확인해요.',
      },
    ],
  },
  {
    id: 'learn',
    label: '배우기',
    path: '/learn/',
    description: '교과서 차례대로 단원과 차시를 공부해요.',
    inHeader: true,
  },
  {
    id: 'labs',
    label: '실습실',
    path: '/labs/',
    description: '코드를 바로 실행해 결과를 보는 실습 공간이에요.',
    inHeader: true,
    children: [
      {
        id: 'labs-vision',
        label: '영상처리 실습실',
        path: '/labs/vision/',
        description: '웹캠 영상에 파이썬 코드를 실행하고, 값을 바꿔 가며 결과를 봐요.',
      },
      {
        id: 'labs-esp32',
        label: 'ESP32 실습실',
        path: '/labs/esp32/',
        description: '블록이나 코드로 가상 보드와 실제 보드를 움직여요.',
        children: [
          {
            id: 'labs-esp32-check',
            label: '실물 점검 도우미',
            path: '/labs/esp32/check/',
            description: '가지고 있는 키트 보드가 사이트 예제대로 움직이는지 하나씩 확인해요.',
          },
        ],
      },
      {
        id: 'labs-iot',
        label: '통신 실습실',
        path: '/labs/iot/',
        description: '유선(시리얼)·블루투스·인터넷(MQTT)으로 컴퓨터와 보드가 신호를 주고받아요.',
      },
      {
        id: 'labs-gallery',
        label: '예제 갤러리',
        path: '/labs/gallery/',
        description: '모든 예제를 카드로 모아 단원과 부품으로 찾아봐요.',
      },
    ],
  },
  {
    id: 'teacher',
    label: '교사용 자료실',
    path: '/teacher/',
    description: '차시별 지도 요약, 성취기준과 평가 방향 표, 수업 자료를 모았어요.',
    inHeader: true,
  },
  {
    id: 'help',
    label: '문제 해결',
    path: '/help/',
    description: '자주 묻는 질문과 오류 메시지 풀이를 모았어요.',
    inHeader: true,
  },
  {
    id: 'glossary',
    label: '용어사전',
    path: '/glossary/',
    description: '처음 보는 낱말의 뜻을 쉽게 풀어 두었어요.',
    inHeader: true,
  },
  {
    id: 'credits',
    label: '출처와 라이선스',
    path: '/credits/',
    description: '사이트에 쓴 자료가 어디서 왔고 어떤 조건으로 쓸 수 있는지 모았어요.',
  },
  {
    id: 'search',
    label: '검색',
    title: '사이트 검색',
    path: '/search/',
    description: '사이트 안의 글을 낱말로 찾아요.',
  },
  {
    id: 'contribute',
    label: '기여·문의',
    path: '/contribute/',
    description: '틀린 곳을 알리거나 자료를 보태는 방법을 안내해요.',
  },
];

/** 대단원(PLAN §2.1·§2.2). 제목은 교과서 차례를 따른다(IV단원 로마 숫자 표기는 모양을 맞춘 것, PLAN §2.1). */
const LEARN_UNIT_INPUT: readonly LearnUnitInput[] = [
  {
    unit: 1,
    numeral: 'I',
    id: 'learn-u1',
    label: 'I. 영상 처리 인공지능',
    path: '/learn/u1/',
    description: '카메라 영상에서 손·얼굴·몸의 움직임을 알아채는 프로그램을 만들어요.',
  },
  {
    unit: 2,
    numeral: 'II',
    id: 'learn-u2',
    label: 'II. 피지컬 컴퓨팅',
    path: '/learn/u2/',
    description: 'ESP32 보드로 LED·화면·소리·모터를 움직여요.',
  },
  {
    unit: 3,
    numeral: 'III',
    id: 'learn-u3',
    label: 'III. 인공지능과 피지컬 컴퓨팅',
    path: '/learn/u3/',
    description: '인공지능이 알아낸 결과를 통신으로 보드에 보내 움직여요.',
  },
  {
    unit: 4,
    numeral: 'IV',
    id: 'learn-u4',
    label: 'IV. 지능화 사물 개발 프로젝트',
    path: '/learn/u4/',
    description: '배운 것을 모아 똑똑한 사물을 직접 만들어요.',
  },
];

const PAGE_ID = /^[a-z\d]+(?:-[a-z\d]+)*$/u;
const PAGE_PATH = /^\/(?:[a-z\d]+(?:-[a-z\d]+)*\/)*$/u;

function buildPage(input: NavPageInput): NavPage {
  if (!PAGE_ID.test(input.id)) {
    throw new Error(`사이트 지도(src/config/nav.ts): id "${input.id}"는 영문 소문자·숫자·하이픈으로 적어요.`);
  }
  if (!PAGE_PATH.test(input.path)) {
    throw new Error(
      `사이트 지도(src/config/nav.ts): "${input.id}"의 path "${input.path}"는 /로 시작하고 /로 끝나며 영문 소문자·숫자·하이픈만 써요.`,
    );
  }
  for (const child of input.children ?? []) {
    if (!child.path.startsWith(input.path) || child.path === input.path) {
      throw new Error(`사이트 지도(src/config/nav.ts): "${child.id}"의 path는 위 페이지 "${input.id}"의 path(${input.path}) 아래여야 해요.`);
    }
  }
  return Object.freeze({
    id: input.id,
    label: input.label,
    title: input.title ?? input.label,
    path: input.path,
    href: withBase(input.path),
    description: input.description,
    inHeader: input.inHeader ?? false,
    children: Object.freeze((input.children ?? []).map(buildPage)),
  });
}

/** 사이트 지도(최상위 페이지 목록, 홈이 맨 앞) */
export const siteMap: readonly NavPage[] = Object.freeze(SITE_MAP_INPUT.map(buildPage));

/** 대단원 I~IV(배우기 아래) */
export const learnUnits: readonly LearnUnit[] = Object.freeze(
  LEARN_UNIT_INPUT.map(({ unit, numeral, ...input }) => Object.freeze({ ...buildPage(input), unit, numeral })),
);

/** 머리글 주 메뉴에 보이는 페이지 */
export const headerNav: readonly NavPage[] = Object.freeze(siteMap.filter((page) => page.inHeader));

/** 페이지 나무를 한 줄로 편다(위 페이지 → 아래 페이지 순서). 기본은 사이트 지도 전체(대단원 제외). */
export function flattenPages(pages: readonly NavPage[] = siteMap): NavPage[] {
  return pages.flatMap((page) => [page, ...flattenPages(page.children)]);
}

const ALL_PAGES: readonly NavPage[] = Object.freeze([...flattenPages(), ...learnUnits]);

for (const key of ['id', 'path'] as const) {
  const seen = new Set<string>();
  for (const page of ALL_PAGES) {
    if (seen.has(page[key])) {
      throw new Error(`사이트 지도(src/config/nav.ts): ${key} "${page[key]}"가 두 번 있어요. 페이지마다 달라야 해요.`);
    }
    seen.add(page[key]);
  }
}

/** id로 페이지를 찾는다(대단원 포함). 없으면 빌드가 멈추도록 오류를 낸다. */
export function getPage(id: string): NavPage {
  const page = ALL_PAGES.find((candidate) => candidate.id === id);
  if (!page) {
    throw new Error(`사이트 지도(src/config/nav.ts)에 id "${id}"인 페이지가 없어요.`);
  }
  return page;
}

/** 대단원 번호(1~4)로 대단원을 찾는다. */
export function getLearnUnit(unit: number): LearnUnit {
  const found = learnUnits.find((candidate) => candidate.unit === unit);
  if (!found) {
    throw new Error(`대단원 번호 ${unit}은(는) 없어요. 1~4 중 하나예요.`);
  }
  return found;
}

/** 주소(base가 붙어 있어도 됨)에 해당하는 페이지를 찾는다. */
export function findPageByPath(pathname: string): NavPage | undefined {
  const target = normalizePagePath(pathname);
  return ALL_PAGES.find((page) => page.path === target);
}

function trailChildren(page: NavPage): readonly NavPage[] {
  if (page.id === 'home') {
    return siteMap.filter((candidate) => candidate.id !== 'home');
  }
  if (page.id === 'learn') {
    return [...page.children, ...learnUnits];
  }
  return page.children;
}

/**
 * 홈에서 지금 주소까지 거쳐 가는 페이지 목록(현재 위치 표시용).
 * navTrail('/ai-physical-computing/start/student/') → [홈, 시작하기, 학생용]
 * 사이트 지도에 없는 더 깊은 주소는 가장 가까운 위 페이지까지만 돌려준다. 예: '/learn/u1/1-2-1/' → [홈, 배우기, I. 영상 처리 인공지능]
 */
export function navTrail(pathname: string): NavPage[] {
  const target = normalizePagePath(pathname);
  const home = getPage('home');
  const trail: NavPage[] = [home];
  let current = home;
  while (current.path !== target) {
    const next = trailChildren(current)
      .filter((child) => target.startsWith(child.path))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (!next) {
      break;
    }
    trail.push(next);
    current = next;
  }
  return trail;
}

/** 이 페이지가 지금 페이지인지 */
export function isCurrentPage(page: NavPage, pathname: string): boolean {
  return page.path === normalizePagePath(pathname);
}

/** 지금 주소가 이 페이지 아래(하위 페이지)에 있는지. 홈은 모든 주소의 위라서 늘 false다. */
export function isInSection(page: NavPage, pathname: string): boolean {
  const target = normalizePagePath(pathname);
  return page.path !== '/' && target !== page.path && target.startsWith(page.path);
}
