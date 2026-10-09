/**
 * 찾기 결과를 거르고 순서를 바로잡는 규칙(판 1.3.0 검수 R1-011·012·013·014, 구역 B). 순수 함수만 둔다 — 머리글 자동 완성(search-suggest.ts)과
 * 검색 쪽(search-page.ts)이 함께 쓰고, 단위 테스트(tests/unit/search/search-rank.test.ts)가 검사한다. 이 파일은 모든 쪽의 머리글 스크립트에 들어가므로 작게 둔다.
 *
 * 왜 필요한가: Pagefind는 낱말이 정확히 없으면 낱말의 앞부분(두세 글자, 한 글자)으로 물러서서 맞춘다. 그래서 "asdfgh"는 코드 속 `as`에,
 * "zzqqxx"는 `z:`에, "임게값"(오타)은 `이`에 걸려 엉뚱한 글 수십 개가 "검색 결과 N개"로 나왔다. 결과의 요약(excerpt)에는 Pagefind가 맞춘 낱말에
 * <mark>를 붙여 두므로, 그 낱말이 검색어를 얼마나 덮는지 보아 "진짜 맞는 글"만 남긴다(relevance).
 *
 * 순서: Pagefind의 점수는 코드 조각·허브 쪽이 앞에 올 때가 있어, 받아 온 첫 묶음 안에서만 다시 늘어 놓는다(tierOf):
 *   0 = 용어사전·오류 사전의 항목이 낱말과 바로 맞음(정의형 질문의 답)  1 = 쪽 제목에 낱말이 있음  2 = 그 밖  3 = 학생 검색에서는 뒤로 미룰 쪽(원고 정정 목록)
 */

/** 맞춘 낱말이 검색 낱말을 이만큼 덮어야 "진짜 맞음"이다(0~1). 3글자 중 2글자(0.67)·5글자 중 3글자(0.6)는 맞고, 6글자 중 2글자(0.33)·4글자 중 2글자(0.5)는 아니다. */
export const MIN_COVERAGE = 0.6;
/** 앞부분만 맞은 낱말은 이 글자 수 이상이어야 센다(한 글자 `z`·`q`·`이`는 우연히 걸린 것) */
export const MIN_PARTIAL_LENGTH = 2;

/** 뜻을 묻는 말투의 군더더기 낱말: 찾을 때는 뺀다("임계값 뜻" → "임계값"). 전부 이런 말이면 그대로 둔다. */
export const INTENT_WORDS: readonly string[] = ['뜻', '의미', '이란', '란', '뭐예요', '뭐야', '무엇', '설명', '정의', '알려줘'];

/** 학생이 증상을 적는 말투 → 사이트 글에 실제로 쓰인 말투(문제 해결의 제목이 "카메라가 켜지지 않아요"다) */
const SYMPTOM_REWRITES: readonly { pattern: RegExp; to: string }[] = [
  { pattern: /안\s*켜(?:져요|져|집니다|짐|지네요|져서)/gu, to: '켜지지 않아요' },
  { pattern: /안\s*(?:돼요|되요|됩니다|돼)(?![가-힣])/gu, to: '되지 않아요' },
  { pattern: /안\s*(?:보여요|보임|보여)(?![가-힣])/gu, to: '보이지 않아요' },
  { pattern: /안\s*(?:나와요|나옴|나와)(?![가-힣])/gu, to: '나오지 않아요' },
  { pattern: /안\s*(?:열려요|열림|열려)(?![가-힣])/gu, to: '열리지 않아요' },
  // 차시 칸 이름은 맞춤법대로 띄어 쓴다(판 1.3.0 검수 R1-066) — 붙여 쓴 검색도 같은 칸을 찾게
  { pattern: /따라하기/gu, to: '따라 하기' },
  { pattern: /바꿔보기/gu, to: '바꿔 보기' },
  // 과목 낱말도 띄어 쓴다(판 1.3.0 검수 R2-038) — 붙여 쓴 검색(영상처리·피지컬컴퓨팅)도 같은 글을 찾게
  { pattern: /영상처리/gu, to: '영상 처리' },
  { pattern: /피지컬컴퓨팅/gu, to: '피지컬 컴퓨팅' },
];

/** 같은 뜻의 다른 말: 이 낱말이 든 검색에는 아래 낱말로 찾은 결과도 뒤에 덧붙인다(편집 가능한 작은 표) */
export const SYNONYMS: readonly { pattern: RegExp; extra: string }[] = [
  { pattern: /수행\s*평가/u, extra: '과정 중심 평가' },
  { pattern: /permission\s*denied|notallowederror/iu, extra: '카메라 허용' },
];

/** 원고 정정 목록은 교사용 점검 자료라 학생 검색의 앞에 오지 않게 한다(이런 말을 적었을 때만 앞에 둔다) */
const CORRECTION_QUERY = /정정|교정|원고|오탈자/u;

/** 검색어를 낱말로 나눈다: 소문자, 글자·숫자만 */
export function splitWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
}

/** 뜻 묻는 말투를 뺀 낱말들 */
export function coreWords(text: string): string[] {
  const words = splitWords(text);
  const core = words.filter((word) => !INTENT_WORDS.includes(word));
  return core.length > 0 ? core : words;
}

/** 같은 글자 하나만 되풀이한 말(zzzz, aaaa, 1111)은 뜻 없는 입력이라 찾지 않는다 */
export function isNonsenseQuery(term: string): boolean {
  const compact = term.replace(/\s+/gu, '');
  return compact.length >= 3 && /^(.)\1+$/u.test(compact);
}

/** 한 번 찾는 계획: 화면에 보이는 말(display)과 실제로 Pagefind에 넣을 말들(terms[0]이 본 검색, 나머지는 같은 뜻의 덧붙임) */
export interface SearchPlan {
  display: string;
  terms: string[];
}

/** 입력을 찾을 계획으로 바꾼다. 뜻 없는 입력이면 null(결과 없음으로 보인다). */
export function planSearch(raw: string): SearchPlan | null {
  const display = raw.trim().replace(/\s+/gu, ' ');
  if (display === '' || isNonsenseQuery(display)) {
    return null;
  }
  let primary = display;
  for (const { pattern, to } of SYMPTOM_REWRITES) {
    primary = primary.replace(pattern, to);
  }
  const kept = primary.split(' ').filter((word) => !INTENT_WORDS.includes(word.toLowerCase()));
  if (kept.length > 0 && kept.length < primary.split(' ').length) {
    primary = kept.join(' ');
  }
  const extras = SYNONYMS.filter(({ pattern }) => pattern.test(display)).map(({ extra }) => extra);
  return { display, terms: [primary, ...extras.filter((extra) => extra !== primary)] };
}

// ---------------------------------------------------------------------------------------------------------------------
// 요약의 <mark>를 읽어 "진짜 맞음" 가리기

const ENTITY: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" };

/** Pagefind 요약(HTML)에서 <mark> 안의 글을 낱말 조각들로 꺼낸다(소문자, 글자·숫자 단위). 예: `<mark>cv2.threshold(blurred,</mark>` → cv2, threshold, blurred */
export function markPieces(excerpt: string): string[] {
  const pieces: string[] = [];
  for (const found of excerpt.matchAll(/<mark>([\s\S]*?)<\/mark>/gu)) {
    const text = (found[1] ?? '').replace(/&(amp|lt|gt|quot|#x27|#39);/gu, (_whole, name: string) => ENTITY[name] ?? '');
    pieces.push(...splitWords(text));
  }
  return pieces;
}

/** 검색 낱말 하나를 조각들이 얼마나 덮는가(0~1): 조각이 낱말로 시작하면 1, 낱말이 조각(두 글자 이상)으로 시작하면 그 길이만큼 */
function wordCoverage(word: string, pieces: readonly string[]): number {
  let best = 0;
  for (const piece of pieces) {
    if (piece.startsWith(word)) {
      return 1;
    }
    if (piece.length >= MIN_PARTIAL_LENGTH && word.startsWith(piece)) {
      best = Math.max(best, piece.length / word.length);
    }
  }
  return best;
}

/**
 * 요약에 <mark>로 맞춘 조각들이 이 검색어에 "진짜 맞는" 것인가. 낱말 하나라도 MIN_COVERAGE 이상 덮이면 맞다.
 * 조각이 하나도 없으면(제목에서만 맞은 경우 등) 판단할 근거가 없어 맞는 것으로 둔다. 검색어가 모두 한 글자면 한 글자 맞음도 센다("1-4-1").
 */
export function isRelevantTo(term: string, pieces: readonly string[]): boolean {
  if (pieces.length === 0) {
    return true;
  }
  const words = coreWords(term);
  if (words.length === 0) {
    return true;
  }
  const minLength = words.some((word) => word.length >= MIN_PARTIAL_LENGTH) ? MIN_PARTIAL_LENGTH : 1;
  return words.some((word) => word.length >= minLength && wordCoverage(word, pieces) >= MIN_COVERAGE);
}

/** 여러 말(본 검색 + 덧붙임) 가운데 하나라도 진짜 맞는가 */
export function isRelevant(terms: readonly string[], pieces: readonly string[]): boolean {
  return terms.some((term) => isRelevantTo(term, pieces));
}

/** 순서를 정할 때 쓰는 결과의 최소 모양 */
export interface RankSubject {
  kind: string;
  url: string;
  /** 화면에 보이는 제목(항목 결과는 "항목 — 쪽 제목") */
  title: string;
  /** 화면에 보이는 요약(HTML, <mark> 포함) */
  excerpt: string;
}

/** 주소의 #위치를 글자·숫자만 남긴 소문자로(예: #name-error → nameerror). 항목 id가 영어 이름이면 검색어와 견줄 수 있다. */
export function anchorKey(url: string): string {
  const hashAt = url.indexOf('#');
  if (hashAt < 0) {
    return '';
  }
  let raw = url.slice(hashAt + 1);
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // 잘못된 % 표기는 그대로 둔다
  }
  return raw.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** 항목 결과의 제목에서 쪽 제목을 뗀 항목 이름("임계값 Threshold — 용어사전" → "임계값 threshold") */
function entryTitleOf(title: string): string {
  const cut = title.indexOf(' — ');
  return (cut < 0 ? title : title.slice(0, cut)).toLowerCase();
}

/** 검색 말들 가운데 하나라도, 그 말의 모든 낱말이 글 안에 들어 있는가 ("손 인식"이면 "손"과 "인식"이 둘 다) */
function containsAllWords(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => {
    const words = coreWords(term);
    return words.length > 0 && words.every((word) => text.includes(word));
  });
}

/**
 * 낮을수록 앞.
 * 0   = 용어사전 항목의 이름이나 id가 검색어의 모든 낱말을 담음(정의형 질문의 답: "임계값 뜻" → 임계값 Threshold)
 * 0.5 = 오류 사전 항목의 이름이나 id가 그러함("NameError" → #name-error)
 * 1   = 쪽(항목) 제목이 검색어의 모든 낱말을 담거나, 용어사전 풀이가 낱말을 바로 맞춤
 * 2   = 그 밖
 * 3   = 뒤로 미룸(원고 정정 목록)
 * 낱말이 여럿인 검색어("손 인식")는 낱말 하나만 맞는 항목("음성 인식")을 앞에 두지 않으려고 모든 낱말이 맞아야 한다.
 */
export function tierOf(subject: RankSubject, terms: readonly string[], display = ''): number {
  if (/\/teacher\/corrections\//u.test(subject.url) && !CORRECTION_QUERY.test(display || terms.join(' '))) {
    return 3;
  }
  const entry = (subject.kind === 'glossary' || subject.kind === 'error') && subject.url.includes('#');
  if (entry) {
    const name = entryTitleOf(subject.title);
    const key = anchorKey(subject.url);
    if (containsAllWords(name, terms) || containsAllWords(key, terms)) {
      return subject.kind === 'glossary' ? 0 : 0.5;
    }
    if (subject.kind === 'glossary') {
      const pieces = markPieces(subject.excerpt);
      const words = [...new Set(terms.flatMap((term) => coreWords(term)))];
      if (words.length > 0 && words.every((word) => pieces.some((piece) => piece.startsWith(word)))) {
        return 1;
      }
    }
  }
  return containsAllWords(subject.title.toLowerCase(), terms) ? 1 : 2;
}
