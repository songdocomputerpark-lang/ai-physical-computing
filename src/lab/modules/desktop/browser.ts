/**
 * 가상 브라우저 창의 내용(순수 논리, DOM 없음) — PLAN §8.2 P2-12, CODE_MAPPING §3.4 WEB, SPEC §6.1·§8.
 *
 * 왜 가상 브라우저인가: 브라우저 안에서 다른 웹사이트를 열어 자동으로 글자를 칠 수는 없다(교차 출처 제한).
 * 그래서 f023(`webbrowser.open("https://www.naver.com/")`)·f024(검색 자동화)는 **페이지 안에 그린 가상 브라우저 창**에서 돈다.
 *
 * 저작권·사칭 금지(SPEC §8): 실제 포털·검색 사이트의 화면 구성·로고·색을 흉내 내지 않는다. 주소창과 검색창은 도형과 글자만 쓰고,
 * 검색 결과는 **이 사이트 안의 학습 내용**(src/config/nav.ts의 진짜 쪽 목록)만 보여 준다. 진짜 인터넷 요청은 한 번도 나가지 않는다.
 *
 * 허용 목록(allowlist): 이 사이트 주소(songdocomputerpark-lang.github.io/ai-physical-computing/ 또는 localhost의 같은 하위 경로)면
 * "우리 사이트 주소예요 — 진짜로 열어 볼 수 있어요"라고 알리고(화면이 패널에 진짜 링크를 둔다), 그 밖의 주소는
 * "가상 브라우저에서만 열려요"라고 알린다. 어느 쪽이든 가상 브라우저 안에서만 움직인다.
 */
import { siteConfig } from '../../../config/site.ts';
import { flattenPages, learnUnits } from '../../../config/nav.ts';

/** 검색 결과 한 줄(모두 이 사이트에 실제로 있는 쪽이다) */
export interface SiteEntry {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** 사이트 안 경로(/labs/vision/ 꼴). 화면에는 글자로만 그린다. */
  readonly path: string;
  /** 검색에 걸리게 하는 낱말(영문 이름·교과서 말투) */
  readonly keywords: readonly string[];
}

/** 쪽마다 더 걸리게 할 낱말(원본 예제가 치는 영어 검색어 "PYAUTOGUI tutorial"이 가상 데스크톱 쪽에 닿게) */
const EXTRA_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
  'labs-vision': ['pyautogui', 'opencv', 'cv2', 'python', 'tutorial', '가상 데스크톱', '실습', '카메라', '코드'],
  'labs-gallery': ['example', 'tutorial', '예제', '갤러리'],
  'labs-esp32': ['esp32', 'micropython', '보드'],
  'labs-iot': ['mqtt', 'bluetooth', '통신'],
  home: ['ai', 'physical', 'computing', '홈'],
  learn: ['tutorial', '수업', '차시', '공부'],
  'learn-u1': ['mediapipe', 'opencv', '영상', '손', '얼굴'],
  'learn-u3': ['pyautogui', '통신', '제어'],
  glossary: ['낱말', '뜻', 'glossary'],
  help: ['오류', 'error', '도움말'],
  'start-student': ['start', '처음', '준비'],
  credits: ['license', '라이선스', '출처'],
  search: ['search', '찾기'],
};

function toEntry(page: { id: string; title: string; description: string; path: string }): SiteEntry {
  return {
    id: page.id,
    title: page.title,
    description: page.description,
    path: page.path,
    keywords: EXTRA_KEYWORDS[page.id] ?? [],
  };
}

/** 가상 브라우저 검색이 찾는 목록 = 이 사이트의 진짜 쪽(사이트 지도 + 대단원). */
export const SITE_ENTRIES: readonly SiteEntry[] = Object.freeze([...flattenPages(), ...learnUnits].map(toEntry));

/** 검색어가 없거나 하나도 맞지 않을 때 보여 주는 기본 차례(학생이 어디로 갈지 고르게) */
const DEFAULT_ENTRY_IDS = ['labs-vision', 'learn', 'labs-gallery', 'glossary', 'help'] as const;

export const DEFAULT_ENTRIES: readonly SiteEntry[] = Object.freeze(
  DEFAULT_ENTRY_IDS.map((id) => SITE_ENTRIES.find((entry) => entry.id === id)).filter((entry): entry is SiteEntry => entry !== undefined),
);

/** 한 번에 보여 주는 결과 수 */
export const MAX_RESULTS = 5;

/** 검색어를 낱말로 나눈다(대소문자·양쪽 공백 무시, 두 글자 미만 영어 낱말은 버린다). */
export function searchTokens(query: string): string[] {
  return String(query ?? '')
    .toLowerCase()
    .split(/[\s,./?&=+_-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !(token.length < 2 && /^[a-z\d]$/u.test(token)));
}

function scoreEntry(entry: SiteEntry, tokens: readonly string[]): number {
  const haystack = `${entry.title} ${entry.description} ${entry.path} ${entry.keywords.join(' ')}`.toLowerCase();
  const title = `${entry.title} ${entry.keywords.join(' ')}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (!haystack.includes(token)) {
      continue;
    }
    score += title.includes(token) ? 3 : 1;
  }
  return score;
}

export interface SearchResult {
  readonly query: string;
  readonly entries: readonly SiteEntry[];
  /** 맞는 것이 하나도 없어서 기본 차례를 보여 주는 중인지 */
  readonly fallback: boolean;
}

/**
 * 가상 검색: 이 사이트 안의 쪽만 찾는다. 맞는 것이 없으면 기본 차례를 보여 주고 fallback을 알린다.
 * (진짜 검색 엔진이 아니다 — 학생이 "검색하면 결과가 나온다"는 흐름을 연습하는 자체 제작 페이지다.)
 */
export function searchSite(query: string): SearchResult {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return { query: String(query ?? ''), entries: DEFAULT_ENTRIES, fallback: true };
  }
  const scored = SITE_ENTRIES.map((entry) => ({ entry, score: scoreEntry(entry, tokens) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.path.length - b.entry.path.length);
  if (scored.length === 0) {
    return { query: String(query ?? ''), entries: DEFAULT_ENTRIES, fallback: true };
  }
  return { query: String(query ?? ''), entries: scored.slice(0, MAX_RESULTS).map((item) => item.entry), fallback: false };
}

/** 주소가 어디 것인지 */
export type UrlKind = 'site' | 'outside' | 'empty';

export interface UrlInfo {
  readonly kind: UrlKind;
  /** 주소창에 보여 줄 글자(그대로) */
  readonly url: string;
  /** 사이트 안 주소이면 그 경로(/labs/vision/ 꼴), 아니면 null */
  readonly path: string | null;
  /** 화면에 그리는 한국어 안내 */
  readonly notice: string;
}

/** 이 사이트로 보는 주소: 배포 주소, localhost·127.0.0.1의 같은 하위 경로, 하위 경로로 시작하는 상대 주소 */
function sitePathOf(url: string): string | null {
  const text = url.trim();
  if (text === '') {
    return null;
  }
  // 설정의 글자 그대로 타입이 좁혀지지 않게 string으로 받는다(사용자 도메인을 연결해 ''로 바꾸는 경우 — src/lib/url.ts와 같은 규칙).
  const base: string = siteConfig.base; // '/ai-physical-computing'
  let pathname: string | null = null;
  const match = /^https?:\/\/([^/]+)(\/.*)?$/iu.exec(text);
  if (match) {
    const host = (match[1] ?? '').toLowerCase();
    const siteHost = siteConfig.origin.replace(/^https?:\/\//iu, '').toLowerCase();
    const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/u.test(host);
    if (host !== siteHost && !isLocal) {
      return null;
    }
    pathname = match[2] ?? '/';
  } else if (text.startsWith('/')) {
    pathname = text;
  } else {
    return null;
  }
  const withoutQuery = pathname.split(/[?#]/u)[0] ?? '/';
  if (base !== '' && !withoutQuery.startsWith(`${base}/`) && withoutQuery !== base) {
    return null;
  }
  const rest = base === '' ? withoutQuery : withoutQuery.slice(base.length) || '/';
  return rest.startsWith('/') ? rest : `/${rest}`;
}

const OUTSIDE_NOTICE = '이 주소는 가상 브라우저에서만 열려요. 진짜 인터넷에는 가지 않아요(학생 컴퓨터 밖으로 아무것도 보내지 않아요).';

/** 주소를 살펴 어떤 안내를 보일지 정한다. */
export function classifyUrl(url: string): UrlInfo {
  const text = String(url ?? '').trim();
  if (text === '') {
    return { kind: 'empty', url: '', path: null, notice: '주소창에 주소를 적고 [이동]을 눌러요.' };
  }
  const path = sitePathOf(text);
  if (path !== null) {
    return {
      kind: 'site',
      url: text,
      path,
      notice: '우리 사이트 주소예요. 아래 [진짜 브라우저에서 열기] 링크로 진짜 쪽을 볼 수 있어요.',
    };
  }
  return { kind: 'outside', url: text, path: null, notice: OUTSIDE_NOTICE };
}

/** 사이트 안 경로에 해당하는 쪽(없으면 null) */
export function entryOfPath(path: string | null): SiteEntry | null {
  if (!path) {
    return null;
  }
  const clean = path.endsWith('/') ? path : `${path}/`;
  return SITE_ENTRIES.find((entry) => entry.path === clean) ?? null;
}

/** 가상 브라우저가 처음 여는 주소(연습 검색 페이지) */
export const PRACTICE_URL = 'apc://연습-검색';
export const PRACTICE_TITLE = '연습 검색';
export const BROWSER_HINT = '이 검색창은 연습용이에요. 이 사이트 안의 배울 거리만 찾아 줘요.';
