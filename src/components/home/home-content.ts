/**
 * 홈 화면의 글과 링크를 모은 곳(PLAN §8.1 P1-05, SPEC §5 홈 화면 요구).
 *
 * 홈의 문장·버튼 이름·타일 내용을 바꿀 때는 이 파일만 고친다. 화면 모양은 같은 폴더의 .astro 파일에 있다.
 * - 링크는 사이트 지도(src/config/nav.ts)의 페이지 id로 적는다. 주소(href)는 getPage()가 base를 붙여 만든다.
 *   주소를 손으로 적지 않으므로 사이트 지도에서 주소가 바뀌어도 홈 링크가 따라간다.
 * - 학생이 보는 문장: "고1이 처음 읽어도 이해되는가?", 한 문단 3문장 이내, 전문용어는 처음 나올 때 풀이(SPEC §7.1).
 * - tests/unit/home/home-content.test.ts와 tests/e2e/home.spec.ts가 이 값을 읽어 검사한다.
 *
 * 판 1.4.0 홈 순서(출판본 교과서 흐름 — DECISIONS C132): 표지(HomeCover) → 이어서 하기 띠(진도가 있을 때만) → 교과서 차례 그림(HomeToc) → 차시 목록(HomeLessons) → 큰 검색 → 바로 가기 타일 → 원칙.
 * 차례 그림의 링크 자리·카드 자료는 home-lessons.ts가 교과서 쪽(content/book)·웹 차시(content/lessons)에서 만든다.
 *
 * 판 1.3.0 홈 순서(옛): 첫 화면(hero) → 이어서 하기 띠 → 큰 검색 → 배움 지도(대단원 4장) → 바로 가기 타일 → 원칙.
 * 옛 첫 화면(HomeHero·FlowIllustration)과 배움 지도(HomeMap, home-map.ts)는 홈이 더 쓰지 않지만 지우지 않았고 아래 homeHero·homeActions·flowFigure·homeMap도 그대로 둔다.
 */
import { getPage } from '../../config/nav.ts';
import { siteConfig } from '../../config/site.ts';
import type { IconName } from '../common/icons.ts';

/** 첫 화면의 큰 버튼 하나 */
export interface HomeAction {
  /** 식별자(테스트·스타일용) */
  readonly id: string;
  /** 버튼 이름(SPEC §5 그대로) */
  readonly label: string;
  /** 버튼 안의 작은 설명 한 줄 */
  readonly hint: string;
  /** 가는 곳: 사이트 지도의 페이지 id */
  readonly pageId: string;
  /** 가는 곳 주소(base 포함). getPage()가 만든다. */
  readonly href: string;
  readonly icon: IconName;
  /** primary = 파랑으로 채운 버튼(처음 온 학생에게 가장 먼저 권하는 길), secondary = 테두리 버튼 */
  readonly variant: 'primary' | 'secondary';
  /**
   * 가는 곳이 아직 자리 페이지면 'coming-soon' — 버튼에 "준비 중" 표시가 붙는다(누르기 전에 알 수 있게, 2026-09-16 검토 반영).
   * 실습실이 실제로 생기는 묶음에서 지운다(영상 처리는 P2-04에서 지움 — 홈 → 실습실 → 슬라이더까지 이어짐, ESP32는 P3).
   */
  readonly status?: 'coming-soon';
}

/** "준비 중" 표시 글자(HomeHero.astro와 테스트가 함께 쓴다) */
export const COMING_SOON_BADGE = '준비 중';

/** 흐름 그림 아래 단계 설명 하나 */
export interface FlowStep {
  readonly id: 'see' | 'judge' | 'act';
  /** 단계 이름. 세 개를 이어 읽으면 "보고, 판단하고, 움직여요"가 된다. */
  readonly label: string;
  /** 그림에서 일어나는 일 한 줄 */
  readonly detail: string;
  /** 이 단계를 배우는 대단원 번호 — 그림의 단계 글이 배움 지도의 길잡이가 되도록 그 단원 쪽으로 이어 준다(R1-025) */
  readonly unit: 1 | 2 | 3 | 4;
}

/** 바로 가기 타일 하나(아이콘 위, 낱말 아래) */
export interface HomeShortcut {
  readonly pageId: string;
  /** 타일에 보이는 짧은 이름. 사이트 지도의 이름이 길면 여기서 줄인다. */
  readonly label: string;
  readonly href: string;
  readonly icon: IconName;
  /** 단원 색(1~4) — 실습실이 1~4단원과 짝이다. 없으면 파랑. */
  readonly unit?: 1 | 2 | 3 | 4;
}

/** "설치 없이, 브라우저만으로" 원칙 하나 */
export interface HomePrinciple {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
}

function action(input: Omit<HomeAction, 'href'>): HomeAction {
  return Object.freeze({ ...input, href: getPage(input.pageId).href });
}

function shortcut(pageId: string, icon: IconName, options: { label?: string; unit?: 1 | 2 | 3 | 4 } = {}): HomeShortcut {
  const page = getPage(pageId);
  return Object.freeze({
    pageId,
    icon,
    label: options.label ?? page.label,
    href: page.href,
    ...(options.unit === undefined ? {} : { unit: options.unit }),
  });
}

/** 표지 단추 하나(판 1.4.0). id는 시험·스타일이 쓰는 이름 — data-home-action */
export interface HomeCoverAction {
  readonly id: 'start' | 'toc' | 'labs';
  readonly label: string;
  /** 같은 쪽 #위치나 사이트 지도 페이지 */
  readonly href: string;
  readonly icon: IconName;
  readonly variant: 'primary' | 'secondary';
}

/**
 * 판 1.4.0 홈 표지(출판본 교과서 「인공지능과 피지컬 컴퓨팅」, 금성출판사). 알약의 수(절·웹 차시)는 글에 적지 않고 데이터에서 센다(homeCoverPill).
 * 표지 그림(public/images/book/cover.webp)에도 이름이 인쇄돼 있지만 화면 낭독기·검색을 위해 출판사·저자는 그림 밖 HTML 글자로도 적는다.
 */
export const homeCover = Object.freeze({
  /** 페이지 제목(h1)을 줄로 나눠 둔다. 이어 읽으면 책 이름이다. */
  titleLines: Object.freeze(['인공지능과', '피지컬 컴퓨팅']),
  /** 한 줄 소개(두 문장 이내) */
  lead: '교과서 「인공지능과 피지컬 컴퓨팅」을 웹에서 읽고, 설치 없이 브라우저에서 바로 실습해 보는 무료 사이트예요.',
  /** 출판사·저자는 책 표지에 인쇄된 그대로 — 바닥글 출처 줄과 같은 값(src/config/site.ts textbook) */
  publisher: siteConfig.textbook.publisher,
  authors: siteConfig.textbook.authors,
  coverAlt: `교과서 「${siteConfig.textbook.title}」 표지`,
  /** 첫 번째 큰 단추 글. 진도가 있으면 home-resume.ts가 "이어서 하기"로 바꾼다(startLabel·resumeLabel을 마크업에 실어 보낸다). */
  startLabel: '1단원부터 시작',
  resumeLabel: '이어서 하기',
});

/** 알약 글: "고등학교 · 교과서 32절 · 웹 차시 45편" */
export function homeCoverPill(sectionCount: number, lessonCount: number): string {
  return `고등학교 · 교과서 ${sectionCount}절 · 웹 차시 ${lessonCount}편`;
}

/** 표지 큰 단추 둘(첫 번째 단추의 주소는 1단원 첫 절이라 화면이 데이터에서 정한다). 순서와 이름을 바꾸지 않는다. */
export function homeCoverActions(startHref: string): readonly HomeCoverAction[] {
  return Object.freeze([
    Object.freeze({ id: 'start', label: homeCover.startLabel, href: startHref, icon: 'play', variant: 'primary' } as const),
    Object.freeze({ id: 'toc', label: '차례 보기', href: '#toc', icon: 'list', variant: 'secondary' } as const),
    Object.freeze({ id: 'labs', label: '실습실', href: getPage('labs').href, icon: 'flask', variant: 'secondary' } as const),
  ]);
}

/** 차례(교과서 4·5쪽 그림) */
export const homeToc = Object.freeze({
  heading: '차례',
  lead: '교과서 차례에서 배우고 싶은 절을 눌러요. 그림이 작아서 누르기 어려우면 아래 목록에서 골라도 돼요.',
  /** 좁은 화면에서 그림을 접어 둔 칸의 이름 */
  figureSummary: '교과서 차례 그림으로 보기',
  /** 넓은 화면의 그림 묶음 이름(화면 낭독기용) */
  figureGroupLabel: '교과서 차례 그림',
  listLabel: '교과서 차례 목록',
});

/** 차시 목록(단원 → 중단원 → 카드) */
export const homeLessons = Object.freeze({
  heading: '차시 목록',
  lead: '교과서 차례대로 모았어요. 카드를 누르면 교과서 쪽으로 가고, 교과서 쪽을 준비 중인 절은 풀이·실습으로 가요.',
  /** 책에 없고 사이트가 더한 차시의 알약 */
  webOnlyBadge: '웹에서 더함',
  /** 교과서 쪽이 아직 없는 절이 풀이·실습으로 이어질 때 카드에 붙이는 작은 글 */
  lessonDest: '풀이·실습으로 가요',
  /** 갈 곳이 없는 카드(쪽 파일도 웹 차시도 없음)의 글 */
  planned: '교과서 쪽을 준비 중이에요',
  legendLabel: '아이콘 뜻',
  /** 범례의 보드 줄 — 보드가 없어도 가상 보드로 끝까지 할 수 있다(원칙 3) */
  legendBoard: '실제 보드 있으면 더 좋아요',
});

/** 첫 화면 제목과 한 문장 소개(SPEC §5: 스크롤 없이 30초 안에 "이 사이트가 뭔지" 알게) */
export const homeHero = Object.freeze({
  /** 페이지 제목(h1). 줄로 나눠 두면 넓은 화면에서 이 자리에서 줄이 바뀐다. 이어 읽으면 한 문장이다. */
  titleLines: Object.freeze(['보고, 판단하고, 움직이는', '인공지능을 만들어요']),
  /**
   * 두 문장 소개(한 문장에 꾸밈이 많으면 한 번에 안 읽혀 둘로 나눴다, 판 1.3.0 검수 R1-029). 어떤 과목의 사이트인지 첫 화면에서 알 수 있게 과목 이름(교육감 승인 과목 "인공지능과 피지컬 컴퓨팅")을 넣는다.
   * ESP32는 이 페이지에서 처음 나오는 전문용어라 괄호로 풀이한다.
   */
  lead: '고등학교 "인공지능과 피지컬 컴퓨팅" 교과서 순서대로 배우는 무료 사이트예요. 설치 없이 브라우저만으로 인공지능과 ESP32 보드(LED·모터를 움직이는 작은 컴퓨터)를 배우고 바로 실습해요.',
  /**
   * 큰 버튼 아래 한 줄 길잡이. 어느 것을 먼저 누를지 알려 준다. 버튼 이름을 다시 쓰지 않는다(같은 이름의 글이 둘이 되면 안 됨).
   * 색·모양이 아니라 순서("첫 번째")로 말한다(WCAG 1.3.3).
   */
  guide: '처음이라면 첫 번째 단추부터 눌러 보세요.',
});

/**
 * 큰 버튼 3개(SPEC §5). 순서와 이름을 바꾸지 않는다.
 * 아직 준비 중인 곳은 버튼에 "준비 중" 표시를 붙이고(status), 그 페이지가 "준비 중" 틀을 보여 준다(ComingSoon).
 * ESP32 실습실이 생겨 가상 보드 탭을 따로 열 주소(예: #virtual)가 생기면 두 번째 버튼만 고친다.
 */
export const homeActions: readonly HomeAction[] = Object.freeze([
  action({
    id: 'camera',
    label: '카메라로 바로 해 보기',
    hint: '웹캠 영상을 코드로 바꿔 봐요',
    pageId: 'labs-vision',
    icon: 'camera',
    variant: 'primary',
  }),
  action({
    // 2026-09-17 P3-01에서 ESP32 실습실(가상 보드)이 열려 "준비 중" 표시를 뗐다.
    id: 'virtual-board',
    label: '가상 ESP32 켜 보기',
    hint: '보드가 없어도 화면에서 해요',
    pageId: 'labs-esp32',
    icon: 'chip',
    variant: 'secondary',
  }),
  action({
    id: 'real-board',
    label: '내 보드 연결하기',
    hint: 'USB 케이블로 보드를 이어요',
    pageId: 'start-board',
    icon: 'plug',
    variant: 'secondary',
  }),
]);

/** 흐름 그림(SPEC §5 "AI가 보고 → 판단하고 → 움직인다"). 그림 속 글자는 쓰지 않고 이 글을 그림 밖 HTML로 보인다. */
export const flowFigure = Object.freeze({
  /** 화면 낭독기가 읽는 그림 이름(svg title) */
  title: '인공지능이 보고, 판단하고, 움직이는 흐름 그림',
  /** 화면 낭독기가 읽는 그림 설명(svg desc) */
  description:
    '카메라 화면에 손가락 두 개를 편 손이 보여요. 인공지능이 손가락 끝을 찾아 두 개라고 세고, 그 결과를 케이블로 받은 ESP32 보드가 LED 다섯 개 가운데 두 개를 켜요.',
  steps: Object.freeze<FlowStep[]>([
    { id: 'see', label: '보고', detail: '카메라로 손을 봐요', unit: 1 },
    { id: 'judge', label: '판단하고', detail: '손가락 수를 세요', unit: 1 },
    { id: 'act', label: '움직여요', detail: '보드가 LED를 켜요', unit: 2 },
  ]),
  /** 단계 아래 링크 글. "{1}단원 알아보기" — 배움 지도 카드 단추([1단원 배우기])와 이름이 겹치지 않게 다른 동사를 쓴다. */
  unitLinkLabel: '알아보기',
});

/** 이어서 하기 띠(진도가 있을 때만 보인다 — home-resume.ts가 채운다). 처음 온 사람에게는 아무것도 보이지 않는다. */
export const homeResume = Object.freeze({
  /** 띠 머리. 같은 행동은 같은 말이라(R3-006) 카드 단추도 "이어서 하기"를 쓴다. 머리는 "지난번 이어서"로 둔다(R1-027). */
  heading: '지난번 이어서',
  /** 지난번 차시 칸: 아직 안 끝낸 차시는 go, 이미 끝낸 차시는 goDone("다시 보기")로 바뀐다(R1-030). */
  lesson: Object.freeze({ kicker: '지난번에 열어 본 차시', go: '이어서 하기', goDone: '다시 보기' }),
  /**
   * 지난번 차시를 이미 끝냈을 때만 채우는 칸: 같은 대단원에서 그 뒤로 아직 안 연 차시. 처음 여는 차시라 [시작하기](배우기 쪽과 같은 말, R2-021).
   * 첫 화면 한 줄(HomeHero)이 이 칸의 머리글·이름·주소를 그대로 보이므로, 한 줄이 보이는 동안 띠에서는 이 칸을 숨긴다(R3-007: 같은 안내를 두 번 보이지 않는다).
   */
  next: Object.freeze({ kicker: '다음에 볼 차시', go: '시작하기' }),
  lab: Object.freeze({ kicker: '마지막으로 연 실습실', go: '다시 열기' }),
});

/** 큰 검색(구역 B의 HomeSearch.astro가 폼을 그린다). 여기는 위에 붙는 제목만 둔다. */
export const homeSearch = Object.freeze({
  heading: '무엇을 찾나요?',
});

/** 배움 지도: 대단원 4장이 화살표로 이어진 길 */
export const homeMap = Object.freeze({
  heading: '배움 지도',
  lead: '1단원부터 차례로 따라가면 돼요.',
  /**
   * 카드 안 단추: 진도가 없을 때 / 진도가 있어 안 본 차시가 남았을 때 / 모두 봤을 때.
   * 화면에는 앞에 단원이 붙어 "1단원 배우기"로 보인다(머리글 메뉴 [시작하기]와 글자가 겹치지 않게, R1-027).
   * 이어 하는 단추는 띠·배우기 쪽과 같은 말 "이어서 하기"다 — 같은 행동은 같은 말(R3-006). 이름이 "1단원 …"으로 시작해 링크 이름은 겹치지 않는다.
   */
  startLabel: '배우기',
  resumeLabel: '이어서 하기',
  replayLabel: '다시 보기',
  /**
   * 대단원이 맡은 큰 그림의 단계 칩("보고→판단하고→움직여요" 그림과 이어진다, R1-025). 네 낱말이 모두 "-기" 꼴이다(R3-012).
   * 흐름 그림의 단계 이름(보고 / 판단하고 / 움직여요)은 문장을 이어 읽는 말이고, 이 칩은 단원 몫을 가리키는 이름이라 층위가 다르다.
   * 차시 머리의 "이 단원은 큰 그림의 … 칸이에요"(lesson/unit-about.ts UNIT_ABOUT.role)와 같은 글이어야 한다.
   */
  stages: Object.freeze<Record<1 | 2 | 3 | 4, string>>({ 1: '보고 판단하기', 2: '움직이기', 3: '잇기', 4: '합치기' }),
  /** 대단원 번호 → 아이콘(영상 → 보드 → 통신 → 프로젝트) */
  unitIcons: Object.freeze<Record<1 | 2 | 3 | 4, IconName>>({ 1: 'camera', 2: 'chip', 3: 'signal', 4: 'lightbulb' }),
});

/** 바로 가기 타일 9개(네이버식 아이콘 칸). 실습실 4개는 1~4단원 색을 따른다. */
export const homeShortcuts = Object.freeze({
  heading: '바로 가기',
  items: Object.freeze<HomeShortcut[]>([
    shortcut('labs-vision', 'camera', { unit: 1 }),
    shortcut('labs-esp32', 'chip', { unit: 2 }),
    shortcut('labs-iot', 'signal', { unit: 3 }),
    shortcut('labs-unit4', 'sparkles', { unit: 4 }),
    shortcut('labs-gallery', 'grid'),
    shortcut('help-errors', 'alert', { label: '오류 사전' }),
    shortcut('glossary', 'glossary'),
    shortcut('teacher', 'teacher'),
    shortcut('start-check', 'check-circle', { label: '내 컴퓨터 점검' }),
  ]),
});

/** "설치 없이, 브라우저만으로" 원칙(SPEC §2 절대 원칙 1~3을 짧게) */
export const homePrinciples = Object.freeze({
  heading: '설치 없이, 브라우저만으로',
  items: Object.freeze<HomePrinciple[]>([
    {
      icon: 'browser',
      title: '설치 없이 시작해요',
      body: '파이썬 코드가 브라우저 안에서 바로 실행돼요. 실제 보드를 연결할 때만 컴퓨터에 따라 드라이버(보드를 알아보게 해 주는 프로그램)가 필요할 수 있어요.',
    },
    {
      icon: 'monitor',
      title: '보드가 없어도 돼요',
      body: '모든 보드 실습을 화면 속 가상 보드로 끝까지 할 수 있어요. 실제 보드도 같은 코드로 움직여요.',
    },
    {
      icon: 'unlock',
      title: '가입 없이 무료예요',
      body: '로그인이나 회원가입 없이 누구나 바로 쓸 수 있어요.',
    },
  ]),
  browserNote: Object.freeze({
    text: '실습실은 컴퓨터의 크롬(Chrome)이나 엣지(Edge) 브라우저를 권장해요.',
    linkLabel: '내 컴퓨터 점검',
    pageId: 'start-check',
    href: getPage('start-check').href,
  }),
});
